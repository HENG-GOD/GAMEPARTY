/**
 * Firebase Realtime Service
 * Replaces Socket.io with Firestore onSnapshot and Realtime Database
 */

import { 
  collection, 
  query, 
  where, 
  orderBy, 
  limit, 
  onSnapshot, 
  Unsubscribe,
  doc,
  getDoc,
  setDoc,
  serverTimestamp
} from 'firebase/firestore';
import { ref, onValue, set, off, DatabaseReference } from 'firebase/database';
import { db, rtdb } from './firebase-theme';
import { getCurrentTheme, isValidTheme, type Theme } from '../utils/theme-resolver';
import { dataCache, cacheKeys } from './cache';

// ✅ Development logging for Firestore reads
const logFirestoreRead = (path: string, fromCache: boolean = false, type: 'snapshot' | 'read' = 'read') => {
  if (import.meta.env.DEV) {
    console.log(`[FIRESTORE ${fromCache ? 'CACHE' : type.toUpperCase()}] ${path}`);
  }
};

/**
 * Subscribe to game updates
 * Note: Errors are handled gracefully - permission-denied and internal assertion errors
 * are expected in some cases and are silently handled to prevent console spam.
 * ✅ OPTIMIZED: Added throttling to reduce excessive updates
 */
export function subscribeGame(
  theme: Theme,
  gameId: string,
  callback: (game: any) => void,
  options?: { throttleMs?: number }
): Unsubscribe {
  if (!isValidTheme(theme)) {
    throw new Error(`Invalid theme: ${theme}`);
  }

  const gameRef = doc(db, 'themes', theme, 'games', gameId);
  const throttleMs = options?.throttleMs ?? 500; // ✅ Default 500ms throttle
  
  // ✅ Try to get initial data from cache to avoid initial read
  const cacheKey = cacheKeys.game(gameId);
  const cachedGame = dataCache.get(cacheKey);
  if (cachedGame) {
    logFirestoreRead(`themes/${theme}/games/${gameId}`, true, 'snapshot');
    callback(cachedGame);
  }
  
  // ✅ Track if we've already logged this type of error to avoid spam
  let hasLoggedPermissionError = false;
  let hasLoggedInternalError = false;
  
  // ✅ Throttling mechanism
  let lastUpdateTime = 0;
  let pendingUpdate: NodeJS.Timeout | null = null;
  let latestData: any = null;
  
  const throttledCallback = (data: any) => {
    latestData = data;
    const now = Date.now();
    const timeSinceLastUpdate = now - lastUpdateTime;
    
    if (timeSinceLastUpdate >= throttleMs) {
      lastUpdateTime = now;
      // ✅ Update cache when data changes
      if (data) {
        dataCache.set(cacheKey, data, 1 * 60 * 1000);
      }
      callback(data);
    } else {
      if (pendingUpdate) {
        clearTimeout(pendingUpdate);
      }
      pendingUpdate = setTimeout(() => {
        lastUpdateTime = Date.now();
        // ✅ Update cache when data changes
        if (latestData) {
          dataCache.set(cacheKey, latestData, 1 * 60 * 1000);
        }
        callback(latestData);
        pendingUpdate = null;
      }, throttleMs - timeSinceLastUpdate);
    }
  };
  
  logFirestoreRead(`themes/${theme}/games/${gameId}`, false, 'snapshot');
  const unsubscribe = onSnapshot(
    gameRef, 
    (snapshot) => {
      if (snapshot.exists()) {
        throttledCallback({
          id: snapshot.id,
          ...snapshot.data()
        });
      } else {
        throttledCallback(null);
      }
    },
    (error) => {
      // ✅ Suppress permission errors (rules are now public)
      if (error.code === 'permission-denied' || 
          error.message?.includes('Missing or insufficient permissions')) {
        // Silently suppress - rules are public
        return;
      }
      
      // Internal assertion errors are Firebase SDK bugs - log but don't crash
      if (error.message?.includes('INTERNAL ASSERTION FAILED') ||
          error.message?.includes('Unexpected state')) {
        // Only log once per subscription to avoid spam
        if (!hasLoggedInternalError && import.meta.env.DEV) {
          hasLoggedInternalError = true;
          console.debug(`[subscribeGame] Internal Firestore error for game ${gameId} (Firebase SDK issue, safe to ignore)`);
        }
        // Don't call callback with error - let the initial load handle it
        return;
      }
      
      // Timeout errors - log but don't crash
      if (error.code === 'deadline-exceeded' || 
          error.message?.includes('timeout') ||
          error.message?.includes('getDoc timeout')) {
        // Only log in development mode
        if (import.meta.env.DEV) {
          console.debug(`[subscribeGame] Timeout for game ${gameId} (network issue, will retry)`);
        }
        // Don't call callback with error - let the initial load handle it
        return;
      }
      
      // Other unexpected errors - log for debugging (only in development)
      if (import.meta.env.DEV) {
        console.error(`[subscribeGame] Unexpected error subscribing to game ${gameId}:`, error);
      }
    }
  );
  
  return () => {
    if (pendingUpdate) {
      clearTimeout(pendingUpdate);
    }
    unsubscribe();
  };
}

/**
 * Subscribe to user updates
 */
export function subscribeUser(
  theme: Theme,
  userId: string,
  callback: (user: any) => void
): Unsubscribe {
  if (!isValidTheme(theme)) {
    throw new Error(`Invalid theme: ${theme}`);
  }

  const userRef = doc(db, 'themes', theme, 'users', userId);
  
  return onSnapshot(
    userRef, 
    (snapshot) => {
      if (snapshot.exists()) {
        callback({
          userId: snapshot.id,
          ...snapshot.data()
        });
      } else {
        callback(null);
      }
    },
    (error) => {
      // ✅ Suppress permission errors and internal assertion errors
      if (error.code === 'permission-denied' || 
          error.message?.includes('Missing or insufficient permissions') ||
          error.message?.includes('INTERNAL ASSERTION FAILED') ||
          error.message?.includes('Unexpected state')) {
        // Silently suppress - rules are public
        return;
      }
      // Log unexpected errors only in development
      if (import.meta.env.DEV) {
        console.error(`[subscribeUser] Unexpected error for user ${userId}:`, error);
      }
    }
  );
}

/**
 * Subscribe to checkin updates for a user
 */
export function subscribeCheckins(
  theme: Theme,
  userId: string,
  gameId: string,
  callback: (checkins: Record<number, any>) => void
): Unsubscribe {
  if (!isValidTheme(theme)) {
    throw new Error(`Invalid theme: ${theme}`);
  }

  const checkinsRef = collection(db, 'themes', theme, 'checkins', userId, 'days');
  
  // ✅ Helper function to process snapshot and call callback
  const processSnapshot = (snapshot: any, filterByGameId: boolean = false) => {
    let docs = snapshot.docs;
    
    // ✅ Filter documents ใน memory ถ้าจำเป็น
    if (filterByGameId) {
      docs = docs.filter((doc: any) => {
        const data = doc.data();
        return data.gameId === gameId;
      });
    }
    
    // ✅ Sort ใน memory (สำคัญสำหรับการแสดงผล)
    docs.sort((a: any, b: any) => {
      const aIndex = Number(a.data().dayIndex) || Number(a.id) || 0;
      const bIndex = Number(b.data().dayIndex) || Number(b.id) || 0;
      return aIndex - bIndex;
    });
    
    const checkins: Record<number, any> = {};
    docs.forEach((doc: any) => {
      const data = doc.data();
      // ✅ ใช้ dayIndex จาก data เป็น key (ควรเป็น 0, 1, 2, ...)
      const dayIndex = Number(data.dayIndex) || Number(doc.id) || 0
      checkins[dayIndex] = {
        dayIndex: dayIndex,
        checked: data.checked || false,
        checkin_date: data.checkin_date || data.date || null,
      };
      
      // Removed console.log for production
    });
    
    // Removed console.log for production
    
    callback(checkins);
  };
  
  // ✅ ลองใช้ query ที่มี index ก่อน
  const q = query(
    checkinsRef,
    where('gameId', '==', gameId),
    orderBy('dayIndex', 'asc')
  );
  
  // ✅ ใช้ flag เพื่อ track ว่าใช้ fallback แล้วหรือยัง (ป้องกันการ subscribe ซ้ำ)
  let fallbackUsed = false;
  
  const unsubscribeQuery = onSnapshot(
    q,
    (snapshot) => {
      processSnapshot(snapshot, false); // ไม่ต้อง filter เพราะ query filter แล้ว
    },
    (error) => {
      // ✅ Handle subscription errors (including index errors)
      if (error?.code === 'failed-precondition' && error?.message?.includes('index')) {
        // ✅ ถ้า subscription error เพราะ index ให้ใช้ collection listener แทน
        if (!fallbackUsed) {
          fallbackUsed = true;
          const indexUrl = error.message.match(/https:\/\/console\.firebase\.google\.com[^\s]+/)?.[0];
          // ✅ Log เพียงครั้งเดียว (ใช้ static flag)
          if (!(window as any).__firebaseIndexErrorShownSubscription) {
            console.warn('⚠️ Firebase Index Required for subscription. Using collection listener with memory filtering.', {
              message: 'Performance may be slower. Please create the composite index for better performance.',
              indexUrl: indexUrl || 'Check Firebase Console > Firestore > Indexes',
              fix: 'Click the link above or visit Firebase Console to create the required index.'
            });
            (window as any).__firebaseIndexErrorShownSubscription = true;
          }
          
          // ✅ Unsubscribe from query
          unsubscribeQuery();
          
          // ✅ Subscribe to collection (จะต้อง filter ใน memory)
          // ✅ Note: return ค่านี้ไม่ได้เพราะเราอยู่ใน error handler แล้ว
          // ✅ แต่เราสามารถ subscribe ได้ (มันจะทำงานต่อเนื่อง)
          onSnapshot(
            checkinsRef,
            (snapshot) => {
              processSnapshot(snapshot, true); // ต้อง filter เพราะ query ทั้งหมด
            },
            (fallbackError) => {
              console.error('[subscribeCheckins] Fallback subscription error:', fallbackError);
              // ✅ ไม่เรียก callback ด้วย empty object เพราะจะทำให้ข้อมูลหายไป
            }
          );
        }
      } else {
        console.error('[subscribeCheckins] Subscription error:', error);
        // ✅ ไม่เรียก callback ด้วย empty object เพราะจะทำให้ข้อมูลหายไป
      }
    }
  );
  
  return unsubscribeQuery;
}

/**
 * Subscribe to answers for a game
 * ✅ OPTIMIZED: Added throttling to reduce excessive updates
 */
export function subscribeAnswers(
  theme: Theme,
  gameId: string,
  callback: (answers: any[]) => void,
  maxResults: number = 50, // ✅ OPTIMIZED: Reduced default from 100 to 50
  options?: { throttleMs?: number }
): Unsubscribe {
  if (!isValidTheme(theme)) {
    throw new Error(`Invalid theme: ${theme}`);
  }

  // ✅ ใช้โครงสร้างใหม่: themes/{theme}/games/{gameId}/answers
  const answersRef = collection(db, 'themes', theme, 'games', gameId, 'answers');
  
  // ✅ Query โดยตรงจาก subcollection (ไม่ต้อง filter ด้วย gameId เพราะอยู่ใน path แล้ว)
  let q;
  let needsMemorySort = false;
  
  try {
    q = query(
    answersRef,
      orderBy('createdAt', 'desc'),
      limit(maxResults)
    );
  } catch (orderByError: any) {
    // ✅ ถ้าไม่มี index ให้ query ทั้งหมดแล้ว sort ใน memory
    if (orderByError.code === 'failed-precondition' || orderByError.message?.includes('index')) {
      if (import.meta.env.DEV) {
        console.warn('[subscribeAnswers] No index found, querying all and sorting in memory:', orderByError);
      }
      q = query(answersRef);
      needsMemorySort = true;
    } else {
      // ✅ ถ้า subcollection ยังไม่มี (โครงสร้างใหม่) ให้ลองอ่านจากโครงสร้างเก่า
      console.warn('[subscribeAnswers] Subcollection not found, trying old structure:', orderByError);
      const oldAnswersRef = collection(db, 'themes', theme, 'answers');
      try {
        q = query(
          oldAnswersRef,
    where('gameId', '==', gameId),
    orderBy('createdAt', 'desc'),
    limit(maxResults)
  );
      } catch (oldError: any) {
        // ถ้าโครงสร้างเก่าก็ไม่มี ให้ใช้ query แบบไม่มี orderBy
        if (oldError.code === 'failed-precondition' || oldError.message?.includes('index')) {
          q = query(
            oldAnswersRef,
            where('gameId', '==', gameId),
            limit(maxResults)
          );
          needsMemorySort = true;
        } else {
          throw orderByError;
        }
      }
    }
  }
  
  const throttleMs = options?.throttleMs ?? 1000; // ✅ Default 1 second throttle
  
  // ✅ Throttling mechanism
  let lastUpdateTime = 0;
  let pendingUpdate: NodeJS.Timeout | null = null;
  let latestAnswers: any[] = [];
  
  const throttledCallback = (answers: any[]) => {
    latestAnswers = answers;
    const now = Date.now();
    const timeSinceLastUpdate = now - lastUpdateTime;
    
    if (timeSinceLastUpdate >= throttleMs) {
      lastUpdateTime = now;
      callback(answers);
    } else {
      if (pendingUpdate) {
        clearTimeout(pendingUpdate);
      }
      pendingUpdate = setTimeout(() => {
        lastUpdateTime = Date.now();
        callback(latestAnswers);
        pendingUpdate = null;
      }, throttleMs - timeSinceLastUpdate);
    }
  };
  
  logFirestoreRead(`themes/${theme}/games/${gameId}/answers`, false, 'snapshot');
  const unsubscribe = onSnapshot(q, (snapshot) => {
    let answers = snapshot.docs.map(doc => ({
      answerId: doc.id,
      ...doc.data()
    }));
    
    // ✅ Sort ใน memory ถ้าไม่มี index
    if (needsMemorySort) {
      answers.sort((a: any, b: any) => {
        const aTime = (a as any).createdAt?.toMillis?.() || (a as any).createdAt || 0;
        const bTime = (b as any).createdAt?.toMillis?.() || (b as any).createdAt || 0;
        return bTime - aTime; // desc
      });
    }
    
    // ✅ Limit ใน memory
    answers = answers.slice(0, maxResults);
    
    // ✅ Update cache when answers change
    const cacheKey = `${cacheKeys.answers(gameId)}:${maxResults}`;
    dataCache.set(cacheKey, answers, 1 * 60 * 1000);
    
    throttledCallback(answers);
  }, (error) => {
    // ✅ Suppress permission errors (rules are now public)
    if (error.code === 'permission-denied' || 
        error.message?.includes('Missing or insufficient permissions')) {
      // Silently suppress - rules are public
      return;
    }
    
    // Internal assertion errors are Firebase SDK bugs - log but don't crash
    if (error.message?.includes('INTERNAL ASSERTION FAILED') ||
        error.message?.includes('Unexpected state')) {
      if (import.meta.env.DEV) {
        console.debug(`[subscribeAnswers] Internal Firestore error (Firebase SDK issue, safe to ignore)`);
      }
      return;
    }
    
    // Timeout errors - log but don't crash
    if (error.code === 'deadline-exceeded' || 
        error.message?.includes('timeout')) {
      if (import.meta.env.DEV) {
        console.debug(`[subscribeAnswers] Timeout (network issue, will retry)`);
      }
      return;
    }
    
    // Other unexpected errors - log for debugging (only in development)
    if (import.meta.env.DEV) {
      console.error(`[subscribeAnswers] Unexpected error:`, error);
    }
  });
  
  return () => {
    if (pendingUpdate) {
      clearTimeout(pendingUpdate);
    }
    unsubscribe();
  };
}

/**
 * Subscribe to chat messages
 */
export function subscribeChatMessages(
  theme: Theme,
  gameId: string,
  callback: (messages: any[]) => void,
  maxResults: number = 100
): Unsubscribe {
  if (!isValidTheme(theme)) {
    throw new Error(`Invalid theme: ${theme}`);
  }

  const messagesRef = collection(db, 'themes', theme, 'chat');
  const q = query(
    messagesRef,
    where('gameId', '==', gameId),
    orderBy('createdAt', 'desc'),
    limit(maxResults)
  );
  
  return onSnapshot(q, (snapshot) => {
    const messages = snapshot.docs.map(doc => ({
      messageId: doc.id,
      ...doc.data()
    }));
    callback(messages);
  });
}

/**
 * Online presence using Realtime Database
 */
export function subscribePresence(
  theme: Theme,
  userId: string,
  callback: (isOnline: boolean) => void
): () => void {
  if (!isValidTheme(theme)) {
    throw new Error(`Invalid theme: ${theme}`);
  }

  const presenceRef = ref(rtdb, `presence/${theme}/${userId}`);
  
  const unsubscribe = onValue(presenceRef, (snapshot) => {
    const data = snapshot.val();
    callback(data?.online === true);
  });

  return () => off(presenceRef);
}

/**
 * Set online presence
 */
export async function setPresence(
  theme: Theme,
  userId: string,
  isOnline: boolean
): Promise<void> {
  if (!isValidTheme(theme)) {
    throw new Error(`Invalid theme: ${theme}`);
  }

  const presenceRef = ref(rtdb, `presence/${theme}/${userId}`);
  await set(presenceRef, {
    online: isOnline,
    lastSeen: Date.now()
  });
}

/**
 * Subscribe to online users for a game
 */
export function subscribeOnlineUsers(
  theme: Theme,
  gameId: string,
  callback: (userIds: string[]) => void
): () => void {
  if (!isValidTheme(theme)) {
    throw new Error(`Invalid theme: ${theme}`);
  }

  const onlineRef = ref(rtdb, `presence/${theme}`);
  
  const unsubscribe = onValue(onlineRef, (snapshot) => {
    const data = snapshot.val();
    const userIds: string[] = [];
    
    if (data) {
      Object.keys(data).forEach(userId => {
        if (data[userId]?.online === true) {
          userIds.push(userId);
        }
      });
    }
    
    callback(userIds);
  });

  return () => off(onlineRef);
}
