/**
 * Firebase Games Service
 * Uses Firestore directly for game operations
 */

import { 
  collection, 
  query, 
  where, 
  getDocs, 
  doc, 
  getDoc,
  getDocFromServer,
  setDoc,
  updateDoc,
  deleteDoc,
  serverTimestamp,
  onSnapshot,
  runTransaction,
  writeBatch,
  Unsubscribe
} from 'firebase/firestore';
import { db } from './firebase-theme';
import { getCurrentTheme, isValidTheme, type Theme } from '../utils/theme-resolver';
import { subscribeGame } from './firebase-realtime';
import { dataCache, cacheKeys } from './cache';
import { deleteImageFromStorage } from './image-upload';

const theme = getCurrentTheme();

/* ===========================================================================
 * Image cleanup helpers (ใช้ตอน deleteGame เพื่อลบ orphan files ใน Storage)
 * =========================================================================== */

/**
 * รูปที่ "ใช้ร่วมกับเกมอื่น" หรือ "เป็นของกลาง" — ห้ามลบเมื่อลบเกมใดเกมหนึ่ง
 * - คลังกลาง (globalSettings/...) → snapshot ของคลังรูปเกมปาร์ตี้ใช้ใน url นี้
 * - คลังเกมปาร์ตี้รุ่นเก่า (themes/*\/party-pool/... หรือ themes/*\/partyImagePool/...)
 *   → ก่อน global migration อาจถูกใช้ร่วมโดยหลายเกม
 * Firebase Storage URL จะ encode `/` เป็น `%2F` → ตรวจทั้งสองรูปแบบ
 */
function isSharedImageUrl(url: string): boolean {
  if (!url) return true;
  const lower = url.toLowerCase();
  return (
    lower.includes('/globalsettings/') ||
    lower.includes('globalsettings%2f') ||
    lower.includes('/party-pool/') ||
    lower.includes('party-pool%2f') ||
    lower.includes('/partyimagepool/') ||
    lower.includes('partyimagepool%2f')
  );
}

/**
 * รวบรวม URL รูปทั้งหมดใน gameData ที่ "ปลอดภัย" ที่จะลบเมื่อเกมโดนลบ
 * - กรอง data:/blob: ออก (preview ในฝั่ง client เท่านั้น)
 * - กรองรูปกลาง/แชร์ออก (ดู isSharedImageUrl)
 * - กรอง partyRounds[].imageDataUrl ที่ตรงกับ url ใน partyImagePool snapshot
 *   (เกมปาร์ตี้แบบ classic ที่ admin "สุ่มจากคลัง" — ไฟล์จริงเป็นของคลังกลาง)
 * - ไม่รวม partyImagePool[].url (snapshot คลัง — กลาง)
 * - ไม่รวม cardImages (เกมลุ้นรางวัลพิเศษ — มี saveCardImagesToLatest reuse กับเกมใหม่)
 */
function extractDeletableImageUrls(gameData: any): string[] {
  const urls: string[] = [];

  const push = (u: unknown) => {
    const s = typeof u === 'string' ? u.trim() : '';
    if (!s) return;
    if (s.startsWith('data:') || s.startsWith('blob:')) return;
    if (isSharedImageUrl(s)) return;
    urls.push(s);
  };

  // partyImagePool snapshot (ใช้กรอง partyRounds[].imageDataUrl ที่ชี้เข้าคลัง)
  const poolUrls = new Set<string>();
  if (Array.isArray(gameData?.partyImagePool)) {
    for (const item of gameData.partyImagePool) {
      const u = typeof item?.url === 'string' ? item.url.trim() : '';
      if (u) poolUrls.add(u);
    }
  }

  push(gameData?.puzzle?.imageDataUrl);

  if (Array.isArray(gameData?.partyRounds)) {
    for (const round of gameData.partyRounds) {
      const u = typeof round?.imageDataUrl === 'string' ? round.imageDataUrl.trim() : '';
      // ถ้า url ของ round นี้ตรงกับ url ในคลัง snapshot → ข้าม (เป็นรูปคลังกลาง)
      if (u && !poolUrls.has(u)) push(u);
    }
  }

  push(gameData?.numberPick?.imageDataUrl);
  push(gameData?.numberPick?.winnersTelegramImageUrl);
  push(gameData?.football?.imageDataUrl);
  push(gameData?.football?.winnersTelegramImageUrl);
  push(gameData?.announce?.imageDataUrl);
  push(gameData?.trickOrTreat?.ghostImage);
  push(gameData?.loyKrathong?.image);
  push(gameData?.referral?.imageDataUrl);

  // de-dup
  return Array.from(new Set(urls));
}

// ✅ Development logging for Firestore reads
const logFirestoreRead = (path: string, fromCache: boolean = false) => {
  if (import.meta.env.DEV) {
    console.log(`[FIRESTORE ${fromCache ? 'CACHE' : 'READ'}] ${path}`);
  }
};

/**
 * Remove undefined values from object (recursively)
 * Firebase Firestore doesn't accept undefined values
 */
function removeUndefinedFields(obj: any): any {
  if (obj === null || obj === undefined) {
    return obj;
  }
  
  if (Array.isArray(obj)) {
    return obj.map(item => removeUndefinedFields(item));
  }
  
  if (typeof obj === 'object') {
    const cleaned: any = {};
    for (const [key, value] of Object.entries(obj)) {
      if (value !== undefined) {
        cleaned[key] = removeUndefinedFields(value);
      }
    }
    return cleaned;
  }
  
  return obj;
}

/**
 * Get all games for current theme
 * ✅ OPTIMIZED: Cache-first strategy to reduce Firestore reads
 */
export async function getGames(): Promise<any[]> {
  if (!isValidTheme(theme)) {
    throw new Error(`Invalid theme: ${theme}`);
  }

  // ✅ Check cache first
  const cacheKey = cacheKeys.gamesList();
  const cached = dataCache.get<any[]>(cacheKey);
  if (cached) {
    logFirestoreRead(`themes/${theme}/games`, true);
    return cached;
  }

  try {
    const gamesRef = collection(db, 'themes', theme, 'games');
    logFirestoreRead(`themes/${theme}/games`, false);
    const snapshot = await getDocs(gamesRef);
    const games = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));
    
    // ✅ Cache the result (2 minutes TTL for games list)
    dataCache.set(cacheKey, games, 2 * 60 * 1000);
    
    return games;
  } catch (error: any) {
    // Silently return empty array on error (permission errors are suppressed)
    return [];
  }
}

/**
 * Get game by ID
 * ✅ OPTIMIZED: Cache-first strategy with Firestore cache fallback
 */
export async function getGameById(
  gameId: string,
  options?: { forceServer?: boolean }
): Promise<any | null> {
  if (!isValidTheme(theme)) {
    throw new Error(`Invalid theme: ${theme}`);
  }

  if (!gameId) {
    return null;
  }

  // ✅ Check in-memory cache first (skip when forceServer)
  const cacheKey = cacheKeys.game(gameId);
  const cached = options?.forceServer ? null : dataCache.get(cacheKey);
  if (cached && !options?.forceServer) {
    logFirestoreRead(`themes/${theme}/games/${gameId}`, true);
    return cached;
  }

  try {
    const gameRef = doc(db, 'themes', theme, 'games', gameId);
    
    // ✅ Try Firestore cache first (offline cache) when not forcing server
    if (!options?.forceServer) {
      try {
        const { getDocFromCache } = await import('firebase/firestore');
        const cachedDoc = await getDocFromCache(gameRef);
        if (cachedDoc.exists()) {
          logFirestoreRead(`themes/${theme}/games/${gameId}`, true);
          const game = {
            id: cachedDoc.id,
            ...cachedDoc.data()
          };
          // ✅ Also store in memory cache
          dataCache.set(cacheKey, game, 1 * 60 * 1000);
          return game;
        }
      } catch (cacheError) {
        // Firestore cache not available, continue to network read
      }
    }
    
    // ✅ Network read (only if cache miss)
    logFirestoreRead(`themes/${theme}/games/${gameId}`, false);
    const gameDoc = options?.forceServer ? await getDocFromServer(gameRef) : await getDoc(gameRef);
    if (gameDoc.exists()) {
      const game = {
        id: gameDoc.id,
        ...gameDoc.data()
      };
      
      // ✅ Cache the result (1 minute TTL for game data)
      dataCache.set(cacheKey, game, 1 * 60 * 1000);
      
      return game;
    }
    return null;
  } catch (error: any) {
    // Silently return null on error (permission errors are suppressed)
    return null;
  }
}

/**
 * Create game (Admin only)
 */
export async function createGame(gameData: {
  id: string;
  name: string;
  type: string;
  [key: string]: any;
}): Promise<{ success: boolean; id: string }> {
  if (!isValidTheme(theme)) {
    throw new Error(`Invalid theme: ${theme}`);
  }

  if (!gameData?.id || !gameData?.name || !gameData?.type) {
    throw new Error('Game ID, name, and type are required');
  }

  try {
    const gameRef = doc(db, 'themes', theme, 'games', gameData.id);
    
    // ✅ Remove undefined fields before sending to Firestore
    const cleanedGameData = removeUndefinedFields({
      ...gameData,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    
    await setDoc(gameRef, cleanedGameData);
    
    // ✅ ถ้าเป็นเกมลุ้นรางวัลพิเศษและมี cardImages ให้บันทึกไว้ใน document แยกด้วย
    if (gameData.type === 'เกมลุ้นรางวัลพิเศษ' && gameData.cardImages) {
      try {
        await saveCardImagesToLatest(gameData.cardImages);
      } catch (cardImagesError: any) {
        // ถ้าบันทึก cardImages ไม่ได้ก็ไม่เป็นไร (ไม่ทำให้การสร้างเกมล้มเหลว)
        if (import.meta.env.DEV) {
          console.warn('[createGame] Warning: Could not save cardImages to latest:', cardImagesError.message);
        }
      }
    }
    
    // ✅ Invalidate cache after creating game
    dataCache.invalidateGame(gameData.id);
    dataCache.delete(cacheKeys.gamesList());
    
    return { success: true, id: gameData.id };
  } catch (error: any) {
    const errorMessage = error?.message || String(error);
    const errorCode = error?.code || 'unknown';
    
    console.error('[createGame] Error creating game:', {
      error: errorMessage,
      code: errorCode,
      theme,
      gameId: gameData.id
    });
    
    throw new Error(`Failed to create game: ${errorMessage}`);
  }
}

/**
 * Update game (Admin only)
 */
export async function updateGame(
  gameId: string,
  updateData: Record<string, any>
): Promise<{ success: boolean }> {
  if (!isValidTheme(theme)) {
    throw new Error(`Invalid theme: ${theme}`);
  }

  if (!gameId) {
    throw new Error('Game ID is required');
  }

  try {
    const gameRef = doc(db, 'themes', theme, 'games', gameId);
    
    // ✅ Remove undefined fields before sending to Firestore
    const cleanedUpdateData = removeUndefinedFields({
      ...updateData,
      updatedAt: serverTimestamp(),
    });
    
    await updateDoc(gameRef, cleanedUpdateData);
    
    // ✅ ถ้าเป็นเกมลุ้นรางวัลพิเศษและมี cardImages ให้บันทึกไว้ใน document แยกด้วย
    if (updateData.cardImages) {
      try {
        // ตรวจสอบว่าเกมนี้เป็นเกมลุ้นรางวัลพิเศษหรือไม่
        const gameDoc = await getDoc(gameRef);
        if (gameDoc.exists()) {
          const gameData = gameDoc.data();
          if (gameData.type === 'เกมลุ้นรางวัลพิเศษ') {
            await saveCardImagesToLatest(updateData.cardImages);
          }
        }
      } catch (cardImagesError: any) {
        // ถ้าบันทึก cardImages ไม่ได้ก็ไม่เป็นไร (ไม่ทำให้การอัพเดทเกมล้มเหลว)
        if (import.meta.env.DEV) {
          console.warn('[updateGame] Warning: Could not save cardImages to latest:', cardImagesError.message);
        }
      }
    }
    
    // ✅ Invalidate cache after updating game
    dataCache.invalidateGame(gameId);
    dataCache.delete(cacheKeys.gamesList());
    
    return { success: true };
  } catch (error: any) {
    const errorMessage = error?.message || String(error);
    const errorCode = error?.code || 'unknown';
    
    console.error('[updateGame] Error updating game:', {
      error: errorMessage,
      code: errorCode,
      theme,
      gameId
    });
    
    throw new Error(`Failed to update game: ${errorMessage}`);
  }
}

/**
 * Save card images to latest document (separate from game document)
 * เก็บ cardImages ไว้ใน document แยกเพื่อให้คงอยู่แม้เกมจะถูกลบ
 */
export async function saveCardImagesToLatest(cardImages: {
  card1?: string | null;
  card2?: string | null;
  card3?: string | null;
}): Promise<{ success: boolean }> {
  if (!isValidTheme(theme)) {
    throw new Error(`Invalid theme: ${theme}`);
  }

  try {
    // ตรวจสอบว่ามี cardImages อย่างน้อย 1 รูป
    if (!cardImages.card1 && !cardImages.card2 && !cardImages.card3) {
      return { success: true }; // ไม่มี cardImages ให้บันทึก
    }

    const cardImagesRef = doc(db, 'themes', theme, 'card-images', 'latest');
    await setDoc(cardImagesRef, {
      ...cardImages,
      updatedAt: serverTimestamp(),
    }, { merge: true });

    if (import.meta.env.DEV) {
      console.log('[saveCardImagesToLatest] ✅ Saved card images to latest document');
    }

    return { success: true };
  } catch (error: any) {
    console.error('[saveCardImagesToLatest] Error:', error);
    throw error;
  }
}

/**
 * Get latest card images from separate document
 * ดึง cardImages จาก document แยก
 */
export async function getLatestCardImages(): Promise<{
  card1?: string;
  card2?: string;
  card3?: string;
} | null> {
  if (!isValidTheme(theme)) {
    throw new Error(`Invalid theme: ${theme}`);
  }

  try {
    const cardImagesRef = doc(db, 'themes', theme, 'card-images', 'latest');
    const cardImagesDoc = await getDoc(cardImagesRef);

    if (!cardImagesDoc.exists()) {
      return null;
    }

    const data = cardImagesDoc.data();
    return {
      card1: data.card1 || undefined,
      card2: data.card2 || undefined,
      card3: data.card3 || undefined,
    };
  } catch (error: any) {
    console.error('[getLatestCardImages] Error:', error);
    return null;
  }
}

/**
 * Delete game (Admin only)
 * ลบเกมและข้อมูลที่เกี่ยวข้องทั้งหมด (answers ทั้งโครงสร้างใหม่และเก่า)
 * ✅ เก็บ cardImages ไว้ใน document แยกก่อนลบเกม (ถ้าเป็นเกมลุ้นรางวัลพิเศษ)
 */
export async function deleteGame(gameId: string): Promise<{ success: boolean }> {
  if (!isValidTheme(theme)) {
    throw new Error(`Invalid theme: ${theme}`);
  }

  if (!gameId) {
    throw new Error('Game ID is required');
  }

  try {
    const deleteDocsByRefs = async (refs: Array<any>) => {
      for (let i = 0; i < refs.length; i += 450) {
        const batch = writeBatch(db);
        refs.slice(i, i + 450).forEach((ref) => batch.delete(ref));
        await batch.commit();
      }
    };

    const deleteCollectionByGameId = async (collectionName: string) => {
      const ref = collection(db, 'themes', theme, collectionName);
      const q = query(ref, where('gameId', '==', gameId));
      const snap = await getDocs(q);
      if (!snap.empty) {
        await deleteDocsByRefs(snap.docs.map((d) => d.ref));
        if (import.meta.env.DEV) {
          console.log(`[deleteGame] ✅ Deleted ${snap.docs.length} docs from ${collectionName} for game: ${gameId}`);
        }
      }
    };

    const deleteSubcollection = async (subcollectionName: string) => {
      const ref = collection(db, 'themes', theme, 'games', gameId, subcollectionName);
      const snap = await getDocs(ref);
      if (!snap.empty) {
        await deleteDocsByRefs(snap.docs.map((d) => d.ref));
        if (import.meta.env.DEV) {
          console.log(`[deleteGame] ✅ Deleted ${snap.docs.length} docs from games/${gameId}/${subcollectionName}`);
        }
      }
    };

    // ✅ 1. ลบ answers จากโครงสร้างใหม่ (subcollection)
    try {
      await deleteSubcollection('answers');
    } catch (answersError: any) {
      // ถ้าลบ answers ไม่ได้ก็ไม่เป็นไร (อาจไม่มี subcollection)
      if (import.meta.env.DEV) {
        console.warn('[deleteGame] Warning: Could not delete answers from new structure:', answersError.message);
      }
    }
    
    // ✅ 2. ลบ answers จากโครงสร้างเก่า (ถ้ามี)
    try {
      await deleteCollectionByGameId('answers');
    } catch (oldAnswersError: any) {
      // ถ้าลบ answers เก่าไม่ได้ก็ไม่เป็นไร
      if (import.meta.env.DEV) {
        console.warn('[deleteGame] Warning: Could not delete answers from old structure:', oldAnswersError.message);
      }
    }
    
    // ✅ 3. เก็บ cardImages ก่อนลบเกม (ถ้าเป็นเกมลุ้นรางวัลพิเศษ) + เก็บ URL รูปที่จะลบหลังลบเกม
    let imageUrlsToDelete: string[] = [];
    try {
      const gameRef = doc(db, 'themes', theme, 'games', gameId);
      const gameDoc = await getDoc(gameRef);

      if (gameDoc.exists()) {
        const gameData = gameDoc.data();
        // ถ้าเป็นเกมลุ้นรางวัลพิเศษและมี cardImages ให้เก็บไว้
        if (gameData.type === 'เกมลุ้นรางวัลพิเศษ' && gameData.cardImages) {
          await saveCardImagesToLatest(gameData.cardImages);
          if (import.meta.env.DEV) {
            console.log(`[deleteGame] ✅ Saved cardImages before deleting game: ${gameId}`);
          }
        }
        // ✅ เก็บ URL รูปที่ "ปลอดภัยที่จะลบ" ไว้ก่อน — จะยิงลบทีหลัง (best-effort, ไม่ block)
        //    ตัด: คลังกลาง / partyImagePool snapshot / cardImages
        imageUrlsToDelete = extractDeletableImageUrls(gameData);
      }
    } catch (cardImagesError: any) {
      // ถ้าเก็บ cardImages ไม่ได้ก็ไม่เป็นไร (ไม่ทำให้การลบเกมล้มเหลว)
      if (import.meta.env.DEV) {
        console.warn('[deleteGame] Warning: Could not save cardImages before deletion:', cardImagesError.message);
      }
    }
    
    // ✅ 4. ลบข้อมูลที่เกี่ยวข้องกับเกม (รองรับ Firestore collections แยก)
    try {
      await Promise.all([
        deleteCollectionByGameId('chat'),
        deleteSubcollection('chat'),
        deleteSubcollection('announce_users'),
        deleteSubcollection('announce_bonuses'),
        deleteSubcollection('referral_deposits'),
        deleteSubcollection('referral_registers'),
        deleteSubcollection('referral_leaderboard')
      ]);
    } catch (cascadeError: any) {
      if (import.meta.env.DEV) {
        console.warn('[deleteGame] Warning: Could not delete some related collections:', cascadeError.message);
      }
    }

    // ✅ 5. ลบเกม (สุดท้าย)
    const gameRef = doc(db, 'themes', theme, 'games', gameId);
    await deleteDoc(gameRef);

    // ✅ 7. ลบไฟล์รูปบน Firebase Storage แบบ best-effort (ไม่ block return)
    //    - คลังกลาง / snapshot คลัง / cardImages → ถูกกรองออกแล้วใน extractDeletableImageUrls
    //    - ถ้าลบไฟล์ไม่ได้ ไม่ส่งผลกับการลบเกม (เกมโดนลบไปแล้ว)
    if (imageUrlsToDelete.length > 0) {
      Promise.allSettled(
        imageUrlsToDelete.map((url) =>
          deleteImageFromStorage(url).catch((delError) => {
            if (import.meta.env.DEV) {
              console.warn('[deleteGame] Delete storage image failed (continue):', url, delError);
            }
            return false;
          })
        )
      )
        .then((results) => {
          if (import.meta.env.DEV) {
            const ok = results.filter((r) => r.status === 'fulfilled' && r.value === true).length;
            console.log(`[deleteGame] 🧹 Storage cleanup: ${ok}/${imageUrlsToDelete.length} images removed for game ${gameId}`);
          }
        })
        .catch(() => {
          /* swallow — already best-effort */
        });
    }

    // ✅ Invalidate cache after deleting game
    dataCache.invalidateGame(gameId);
    dataCache.delete(cacheKeys.gamesList());

    if (import.meta.env.DEV) {
      console.log(`[deleteGame] ✅ Successfully deleted game: ${gameId} (queued ${imageUrlsToDelete.length} images for cleanup)`);
    }

    return { success: true };
  } catch (error: any) {
    const errorMessage = error?.message || String(error);
    const errorCode = error?.code || 'unknown';
    
    console.error('[deleteGame] Error deleting game:', {
      error: errorMessage,
      code: errorCode,
      theme,
      gameId
    });
    
    throw new Error(`Failed to delete game: ${errorMessage}`);
  }
}

/**
 * Claim code (atomic transaction)
 */
export async function claimCode(
  gameId: string,
  userId: string,
  options?: { roundNumber?: number }
): Promise<{ success: boolean; code?: string; error?: string; notifyCodeFull?: boolean }> {
  if (!isValidTheme(theme)) {
    throw new Error(`Invalid theme: ${theme}`);
  }

  if (!gameId || !userId) {
    throw new Error('Game ID and User ID are required');
  }

  try {
    const result = await runTransaction(db, async (transaction) => {
      const gameRef = doc(db, 'themes', theme, 'games', gameId);
      const gameDoc = await transaction.get(gameRef);

      if (!gameDoc.exists()) {
        throw new Error('Game not found');
      }

      const gameData = gameDoc.data()!;
      
      // ✅ Log gameData structure เพื่อ debug
      console.log('[claimCode] 🔍 Game data structure:', {
        gameId,
        theme,
        hasCodes: !!gameData.codes,
        hasGameDataCodes: !!gameData.gameData?.codes,
        gameDataKeys: Object.keys(gameData),
        gameDataKeysInNested: gameData.gameData ? Object.keys(gameData.gameData) : []
      });
      
      // ✅ อ่าน codes จากหลายที่ (รองรับทั้ง gameData.codes และ gameData.gameData.codes)
      // จาก CreateGame.tsx: codes ถูกเก็บไว้ใน gameData.gameData.codes
      // แต่บางเกมอาจมี codes ที่ top-level (gameData.codes)
      const rawCodes = gameData.codes || gameData.gameData?.codes;
      
      // ✅ Log rawCodes เพื่อ debug
      console.log('[claimCode] 🔍 Raw codes data:', {
        rawCodes,
        rawCodesType: Array.isArray(rawCodes) ? 'array' : typeof rawCodes,
        rawCodesLength: Array.isArray(rawCodes) ? rawCodes.length : (rawCodes && typeof rawCodes === 'object' ? Object.keys(rawCodes).length : 0),
        gameId,
        theme,
        codesSource: gameData.codes ? 'top-level' : (gameData.gameData?.codes ? 'nested' : 'none')
      });
      
      let codes: string[] = [];
      if (Array.isArray(rawCodes)) {
        codes = rawCodes;
      } else if (rawCodes && typeof rawCodes === 'object') {
        // แปลง object เป็น array (ไม่ filter เพื่อรักษา index)
        codes = Object.keys(rawCodes)
          .sort((a, b) => Number(a) - Number(b))
          .map(k => String(rawCodes[k] ?? ''));
      }
      
      const roundNumber = Number(options?.roundNumber || 0)
      const partyRounds = gameData.partyRounds || gameData.gameData?.partyRounds || []
      const isPartyRoundMode = gameData.type === 'เกมปาร์ตี้' && roundNumber > 0 && Array.isArray(partyRounds)
      const roundKey = `R${roundNumber}`
      const roundCfg = isPartyRoundMode ? partyRounds[roundNumber - 1] : null
      const partyRoundState = gameData.gameData?.partyRoundState || gameData.partyRoundState || {}
      const roundState = roundCfg ? (partyRoundState[roundKey] || {}) : {}

      let scopedCodes = codes
      if (roundCfg) {
        const start = Math.max(0, Number(roundCfg.codeStartIndex || 1) - 1)
        const endFromConfig = Number(roundCfg.codeEndIndex || 0)
        const defaultEnd = start + Math.max(1, Number(roundCfg.codeCount) || 1) - 1
        const end = Math.max(start, endFromConfig > 0 ? endFromConfig - 1 : defaultEnd)
        scopedCodes = codes.slice(start, end + 1)
      }

      // ✅ อ่าน codeCursor และ claimedBy จากหลายที่ (รองรับทั้ง top-level และ nested)
      const codeCursor = roundCfg
        ? Number(roundState.codeCursor || 0)
        : (gameData.codeCursor || gameData.gameData?.codeCursor || 0)
      const claimedBy = roundCfg
        ? (roundState.claimedBy || {})
        : (gameData.claimedBy || gameData.gameData?.claimedBy || {})

      // ✅ Log เพื่อ debug
      console.log('[claimCode] 📊 Code state:', {
        codesLength: scopedCodes.length,
        codeCursor,
        codesAvailable: scopedCodes.length - codeCursor,
        userId,
        hasClaimed: !!claimedBy[userId],
        codesSample: scopedCodes.slice(0, 5), // แสดง 5 โค้ดแรก
        codeCursorValue: scopedCodes[codeCursor] // แสดงโค้ดที่ cursor
      });

      // ✅ ตรวจสอบว่า codes มีค่าหรือไม่
      if (!scopedCodes || scopedCodes.length === 0) {
        console.warn('[claimCode] ⚠️ No codes available in game:', { 
          gameId, 
          theme,
          rawCodes,
          rawCodesType: Array.isArray(rawCodes) ? 'array' : typeof rawCodes
        });
        return { success: false, error: 'EMPTY' };
      }

      // ✅ ตรวจสอบว่าโค้ดเต็มแล้วหรือไม่
      if (codeCursor >= scopedCodes.length) {
        console.warn('[claimCode] ⚠️ All codes claimed:', {
          codesLength: scopedCodes.length,
          codeCursor,
          gameId,
          theme,
          rawCodesType: Array.isArray(rawCodes) ? 'array' : typeof rawCodes,
          codesArray: scopedCodes
        });
        if (roundCfg) {
          const shouldNotifyCodeFull = !roundState?.fullNotifiedAt
          if (shouldNotifyCodeFull) {
            transaction.update(gameRef, {
              [`gameData.partyRoundState.${roundKey}.fullNotifiedAt`]: serverTimestamp(),
            });
          }
          return { success: false, error: 'EMPTY', notifyCodeFull: shouldNotifyCodeFull };
        }
        return { success: false, error: 'EMPTY' };
      }

      // ✅ ตรวจสอบว่า user เคยได้โค้ดไปแล้วหรือไม่
      if (claimedBy[userId]) {
        if (import.meta.env.DEV) {
          console.log('[claimCode] User already claimed:', { userId, gameId, theme });
        }
        return { success: false, error: 'ALREADY' };
      }

      // ✅ ตรวจสอบว่า code ที่จะแจกมีค่าหรือไม่
      const code = scopedCodes[codeCursor];
      
      // ✅ ถ้า code ว่างเปล่า ให้หาคode ถัดไปที่ไม่ว่าง
      let actualCode = code;
      let actualCursor = codeCursor;
      
      // ✅ หาโค้ดถัดไปที่ไม่ว่าง (ข้ามโค้ดว่าง)
      while ((!actualCode || actualCode.trim() === '') && actualCursor < scopedCodes.length) {
        actualCursor++;
        if (actualCursor < scopedCodes.length) {
          actualCode = scopedCodes[actualCursor];
        }
      }
      
      // ✅ ถ้าไม่มีโค้ดเหลือแล้ว
      if (!actualCode || actualCode.trim() === '' || actualCursor >= scopedCodes.length) {
        if (import.meta.env.DEV) {
          console.warn('[claimCode] No valid codes available:', {
            codeCursor,
            actualCursor,
            codesLength: scopedCodes.length,
            gameId,
            theme
          });
        }
        if (roundCfg) {
          const shouldNotifyCodeFull = !roundState?.fullNotifiedAt
          if (shouldNotifyCodeFull) {
            transaction.update(gameRef, {
              [`gameData.partyRoundState.${roundKey}.fullNotifiedAt`]: serverTimestamp(),
            });
          }
          return { success: false, error: 'EMPTY', notifyCodeFull: shouldNotifyCodeFull };
        }
        return { success: false, error: 'EMPTY' };
      }
      
      // ✅ ใช้ actualCursor แทน codeCursor
      const finalCode = actualCode;
      const finalCursor = actualCursor;
      const shouldNotifyCodeFullNow = !!roundCfg && !roundState?.fullNotifiedAt && (finalCursor + 1 >= scopedCodes.length)
      
      // ✅ ตรวจสอบว่า codes อยู่ที่ไหน (top-level หรือ nested)
      const codesInGameData = !!gameData.codes;
      const codesInNested = !!gameData.gameData?.codes;
      
      // ✅ Update codeCursor และ claimedBy ตามตำแหน่งที่ codes อยู่
      if (roundCfg) {
        transaction.update(gameRef, {
          [`gameData.partyRoundState.${roundKey}.codeCursor`]: finalCursor + 1,
          [`gameData.partyRoundState.${roundKey}.codesVersion`]: Date.now(),
          [`gameData.partyRoundState.${roundKey}.claimedBy.${userId}`]: {
            code: finalCode,
            claimedAt: serverTimestamp(),
          },
          ...(shouldNotifyCodeFullNow && {
            [`gameData.partyRoundState.${roundKey}.fullNotifiedAt`]: serverTimestamp(),
          }),
        });
      } else if (codesInNested && !codesInGameData) {
        // codes อยู่ใน gameData.gameData
        transaction.update(gameRef, {
          'gameData.codeCursor': finalCursor + 1,
          [`gameData.claimedBy.${userId}`]: {
            code: finalCode,
            claimedAt: serverTimestamp(),
          },
        });
      } else {
        // codes อยู่ที่ top-level หรือทั้งสองที่
      transaction.update(gameRef, {
          codeCursor: finalCursor + 1,
        [`claimedBy.${userId}`]: {
            code: finalCode,
          claimedAt: serverTimestamp(),
        },
      });
      }

      if (import.meta.env.DEV) {
        console.log('[claimCode] ✅ Code claimed successfully:', {
          code: finalCode,
          cursor: finalCursor,
          nextCursor: finalCursor + 1,
          userId,
          gameId,
          theme
        });
      }

      return { success: true, code: finalCode, notifyCodeFull: shouldNotifyCodeFullNow };
    });
    
    
    return result;
  } catch (error: any) {
    const errorMessage = error?.message || String(error);
    const errorCode = error?.code || 'unknown';
    
    // ✅ Map error codes ให้ตรงกับที่ components ใช้
    if (errorMessage.includes('permission') || errorCode === 'permission-denied') {
      return { success: false, error: 'PERMISSION_DENIED' };
    }
    
    if (errorMessage.includes('Game not found')) {
      return { success: false, error: 'GAME_NOT_FOUND' };
    }
    
    // ✅ Log error details เพื่อ debug
    console.error('[claimCode] Error claiming code:', {
      error: errorMessage,
      code: errorCode,
      theme,
      gameId,
      userId
    });
    
    return { 
      success: false, 
      error: 'UNKNOWN_ERROR' 
    };
  }
}

/**
 * Claim big prize (LoyKrathong)
 */
export async function claimBigPrize(
  gameId: string,
  userId: string
): Promise<{ success: boolean; code?: string; error?: string }> {
  if (!isValidTheme(theme)) {
    throw new Error(`Invalid theme: ${theme}`);
  }

  if (!gameId || !userId) {
    throw new Error('Game ID and User ID are required');
  }

  try {
    const result = await runTransaction(db, async (transaction) => {
      const gameRef = doc(db, 'themes', theme, 'games', gameId);
      const gameDoc = await transaction.get(gameRef);

      if (!gameDoc.exists()) {
        throw new Error('Game not found');
      }

      const gameData = gameDoc.data()!;
      const loyKrathong = gameData.loyKrathong || {};
      const bigPrizeCodes = loyKrathong.bigPrizeCodes || [];
      const bigPrizeCodeCursor = loyKrathong.bigPrizeCodeCursor || 0;
      const bigPrizeClaimedBy = loyKrathong.bigPrizeClaimedBy || {};

      if (bigPrizeCodeCursor >= bigPrizeCodes.length) {
        return { success: false, error: 'EMPTY' };
      }

      if (bigPrizeClaimedBy[userId]) {
        return { success: false, error: 'ALREADY' };
      }

      const code = bigPrizeCodes[bigPrizeCodeCursor];
      transaction.update(gameRef, {
        'loyKrathong.bigPrizeCodeCursor': bigPrizeCodeCursor + 1,
        [`loyKrathong.bigPrizeClaimedBy.${userId}`]: {
          code,
          claimedAt: serverTimestamp(),
        },
      });

      return { success: true, code };
    });
    
    
    return result;
  } catch (error: any) {
    const errorMessage = error?.message || String(error);
    const errorCode = error?.code || 'unknown';
    
    // ✅ Map error codes ให้ตรงกับที่ components ใช้
    if (errorMessage.includes('permission') || errorCode === 'permission-denied') {
      return { success: false, error: 'PERMISSION_DENIED' };
    }
    
    if (errorMessage.includes('Game not found')) {
      return { success: false, error: 'GAME_NOT_FOUND' };
    }
    
    // ✅ Log error details เพื่อ debug
    console.error('[claimBigPrize] Error claiming big prize:', {
      error: errorMessage,
      code: errorCode,
      theme,
      gameId,
      userId
    });
    
    return { 
      success: false, 
      error: 'UNKNOWN_ERROR' 
    };
  }
}

/**
 * Subscribe to game updates
 */
export function subscribeGameUpdates(
  gameId: string,
  callback: (game: any) => void
): Unsubscribe {
  return subscribeGame(theme, gameId, callback);
}

/**
 * Subscribe to all games
 * ⚠️ WARNING: This creates a real-time listener that consumes Firestore reads
 * ✅ OPTIMIZED: Use getGames() with cache instead for non-real-time use cases
 * Only use this when real-time updates are strictly required (e.g., admin dashboard)
 */
export function subscribeGames(callback: (games: any[]) => void): Unsubscribe {
  if (!isValidTheme(theme)) {
    throw new Error(`Invalid theme: ${theme}`);
  }

  if (import.meta.env.DEV) {
    console.warn('[subscribeGames] ⚠️ Real-time listener created - consider using getGames() with cache instead');
  }

  const gamesRef = collection(db, 'themes', theme, 'games');
  
  return onSnapshot(
    gamesRef, 
    (snapshot) => {
      const games = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      
      // ✅ Update cache when snapshot updates
      const cacheKey = cacheKeys.gamesList();
      dataCache.set(cacheKey, games, 2 * 60 * 1000);
      
      callback(games);
    },
    (error) => {
      // ✅ Suppress Firestore internal assertion errors (known SDK issue)
      const isInternalAssertion = error?.message?.includes('INTERNAL ASSERTION FAILED') || 
                                   error?.message?.includes('Unexpected state');
      
      if (isInternalAssertion) {
        // Silent suppress - this is a known Firebase SDK issue that doesn't affect functionality
        return;
      }
      
      // Handle database not found errors (404/400)
      if (error.code === 'not-found' || 
          error.message?.includes('404') || 
          error.message?.includes('400') ||
          error.message?.includes('WebChannelConnection')) {
        // Database not found or connection error - likely default database doesn't exist
        // This happens when data is in 'gameparty' database but client SDK uses default
        callback([]);
        return;
      }
      
      // Other errors - return empty array to prevent crashes
      callback([]);
    }
  );
}

