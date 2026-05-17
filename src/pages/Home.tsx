import React, { useEffect } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { useGamesList } from '../hooks/useOptimizedData'
import { dataCache, cacheKeys } from '../services/cache'
import { usePrefetch } from '../services/prefetching'
import { getPlayerLink } from '../utils/playerLinks'
import { deleteGame } from '../services/firebase-games-new'
import { getThemeSettings } from '../services/firebase-theme-settings'
import { getCurrentTheme } from '../utils/theme-resolver'
import { Gamepad2, AlertTriangle, RefreshCw, Trash2, Loader2 } from 'lucide-react'

type GameRow = { id: string; name: string; type: string; createdAt?: number; imageUrl?: string }

export default function Home() {
  const nav = useNavigate()
  const location = useLocation()
  
  // กำลังลบรายการไหนอยู่ (กันกดซ้ำ)
  const [deletingId, setDeletingId] = React.useState<string | null>(null)
  // ✅ เก็บรายการเกมที่ถูกลบแล้ว (เพื่อ filter ออกจาก UI ทันที)
  const [deletedGameIds, setDeletedGameIds] = React.useState<Set<string>>(new Set())
  // popup ยืนยันการลบ
  const [deleteConfirm, setDeleteConfirm] = React.useState<GameRow | null>(null)
  const [partyTelegramImageUrl, setPartyTelegramImageUrl] = React.useState<string>('')
  const [trickTelegramImageUrl, setTrickTelegramImageUrl] = React.useState<string>('')

  // Use optimized data fetching
  const { data: gamesList, loading, error, refetch } = useGamesList()
  const { prefetchGame } = usePrefetch()

  // ถ้ามี ?id=... ให้ส่งผู้เล่นไปหน้าเล่น
  useEffect(() => {
    const q = new URLSearchParams(location.search).get('id')
    if (q) nav(`/play/${q.trim()}`, { replace: true })
  }, [nav])

  // ✅ Clear cache and force refresh games list on mount (ใช้ useRef เพื่อป้องกัน infinite loop)
  const refetchRef = React.useRef(refetch)
  React.useEffect(() => {
    refetchRef.current = refetch
  }, [refetch])

  // ✅ โหลดข้อมูลเกมครั้งเดียวเมื่อ mount (ไม่ subscribe เพื่อลด Firestore Reads)
  useEffect(() => {
    // ✅ Clear games list cache to ensure fresh data from Firestore
    dataCache.delete(cacheKeys.gamesList())
    refetchRef.current()
  }, []) // ✅ เรียกแค่ครั้งเดียวเมื่อ mount

  useEffect(() => {
    const themeName = getCurrentTheme()
    getThemeSettings(themeName).then(res => {
      const s = res?.settings || {}
      setPartyTelegramImageUrl(String(s['partyTelegramImageUrl'] || s['telegramPartyImageUrl'] || ''))
      setTrickTelegramImageUrl(String(s['trickTelegramImageUrl'] || ''))
    }).catch(() => {})
  }, [])

  // ✅ ลบการ refresh อัตโนมัติเมื่อ location เปลี่ยน (เพื่อลด Firestore Reads)
  // ✅ ผู้ใช้ต้องรีเฟรชหน้าจอเองเพื่ออัปเดตรายการเกม

  // ✅ Sync deletedGameIds กับ gamesList - ลบ gameId ออกจาก deletedGameIds ถ้ายังมีใน gamesList
  // (กรณีที่ลบไม่สำเร็จหรือ error)
  // ✅ เพิ่ม ref เพื่อป้องกัน infinite loop
  const syncRef = React.useRef(false)
  useEffect(() => {
    // ✅ ป้องกัน infinite loop - skip ถ้ากำลัง sync อยู่
    if (syncRef.current) return
    
    if (gamesList && Array.isArray(gamesList) && deletedGameIds.size > 0) {
      const existingGameIds = new Set(gamesList.map(g => g.id))
      
      setDeletedGameIds(prev => {
        const newSet = new Set<string>()
        let hasChanges = false
        
        for (const deletedId of prev) {
          // ✅ ถ้าเกมยังอยู่ใน gamesList แสดงว่ายังไม่ถูกลบจริง (หรือลบไม่สำเร็จ)
          // ให้ลบออกจาก deletedGameIds เพื่อให้แสดงอีกครั้ง
          if (existingGameIds.has(deletedId)) {
            // เกมยังอยู่ → ไม่เก็บไว้ใน deletedGameIds (เพื่อให้แสดงอีกครั้ง)
            hasChanges = true
          } else {
            // เกมไม่มีแล้ว → เก็บไว้ใน deletedGameIds (เพื่อ filter ออก)
            newSet.add(deletedId)
          }
        }
        
        // ✅ ไม่ refetch อัตโนมัติ - ให้ subscribeGames จัดการเอง
        // เพื่อป้องกัน infinite loop
        
        return newSet
      })
    }
  }, [gamesList])

  // ✅ Listen for custom event เมื่อสร้างเกมใหม่ (refresh เฉพาะเมื่อสร้างเกม)
  useEffect(() => {
    const handleGameCreated = (event: Event) => {
      const customEvent = event as CustomEvent
      const gameId = customEvent.detail?.gameId
      
      // ✅ Clear cache และ refetch เมื่อสร้างเกมใหม่
      const gamesListCacheKey = cacheKeys.gamesList()
      dataCache.delete(gamesListCacheKey)
      
      if (refetchRef.current) {
        refetchRef.current().catch((err: any) => {
          console.error('[Home] Error refetching after game created:', err)
        })
      }
    }
    
    window.addEventListener('gameCreated', handleGameCreated)
    
    return () => {
      window.removeEventListener('gameCreated', handleGameCreated)
    }
  }, []) // ✅ ไม่มี dependency เพื่อป้องกัน re-register event listener

  // Convert gamesList to rows format for compatibility
  const rows = React.useMemo(() => {
    if (!gamesList || !Array.isArray(gamesList)) {
      return []
    }
    
    // ✅ Filter เกมที่ถูกลบออก
    const filtered = gamesList.filter(game => !deletedGameIds.has(game.id))
    
    const mapped = filtered.map(game => {
      let imageUrl: string | undefined
      switch (game.type) {
        case 'เกมทายภาพปริศนา':
          imageUrl = game.puzzle?.imageDataUrl || game.gameData?.puzzle?.imageDataUrl; break
        case 'เกมปาร์ตี้':
          imageUrl = partyTelegramImageUrl || game.partyRounds?.[0]?.imageDataUrl || game.gameData?.partyRounds?.[0]?.imageDataUrl; break
        case 'เกมทายเบอร์เงิน':
          imageUrl = game.numberPick?.imageDataUrl || game.gameData?.numberPick?.imageDataUrl; break
        case 'เกมทายผลบอล':
          imageUrl = game.football?.imageDataUrl || game.gameData?.football?.imageDataUrl; break
        case 'เกมบอลโลก':
          // เกมบอลโลกไม่ใช้รูปประจำเกม (ใช้ธงทีมในตัวคอมโพเนนต์เอง)
          imageUrl = undefined; break
        case 'เกมเช็คอิน':
          imageUrl = game.checkin?.imageDataUrl || game.gameData?.checkin?.imageDataUrl; break
        case 'เกมประกาศรางวัล':
          imageUrl = game.announce?.imageDataUrl || game.gameData?.announce?.imageDataUrl; break
        case 'เกมลุ้นรางวัลพิเศษ':
          imageUrl = trickTelegramImageUrl || game.cardImages?.card1 || game.trickOrTreat?.ghostImage || game.gameData?.trickOrTreat?.ghostImage; break
        case 'เกมลอยกระทง':
          imageUrl = game.loyKrathong?.image || game.gameData?.loyKrathong?.image; break
        case 'เกมแนะนำเพื่อน':
          imageUrl = game.referral?.imageDataUrl || game.gameData?.referral?.imageDataUrl; break
      }
      if (!imageUrl) imageUrl = game.imageDataUrl || game.gameData?.imageDataUrl
      return { id: game.id, name: game.name, type: game.type, createdAt: game.createdAt, imageUrl }
    })
    
    return mapped
  }, [gamesList, deletedGameIds, partyTelegramImageUrl, trickTelegramImageUrl])


  /** กดปุ่มลบจากการ์ด — เปิด popup ยืนยัน */
  const handleDelete = (g: GameRow, e?: React.MouseEvent) => {
    e?.stopPropagation()
    if (deletingId) return
    setDeleteConfirm(g)
  }

  /** ยืนยันลบจาก popup */
  const confirmDeleteGame = async () => {
    const g = deleteConfirm
    if (!g) return
    setDeleteConfirm(null)

    const id = g.id
    const name = g.name
    try {
      setDeletingId(id)
      const cleanGameId = id.trim()
      await deleteGame(cleanGameId)

      setDeletedGameIds(prev => new Set(prev).add(cleanGameId).add(id))
      dataCache.invalidateGame(cleanGameId)
      dataCache.invalidateGame(id)
      const gamesListCacheKey = cacheKeys.gamesList()
      dataCache.delete(gamesListCacheKey)

      refetchRef.current().catch((err) => {
        console.error('[Home] Error in first refetch (non-blocking):', err)
      })

      setTimeout(() => {
        dataCache.delete(gamesListCacheKey)
        refetchRef.current().catch((err) => {
          console.error('[Home] Error in second refetch (non-blocking):', err)
        })
      }, 500)

      alert('ลบเกมเรียบร้อย')
      setDeletingId(null)
    } catch (error: any) {
      console.error('Error deleting game:', error)
      if (error?.status === 404 || error?.message?.includes('not found')) {
        alert(`ไม่พบเกม "${name || id}" ที่ต้องการลบ`)
        await refetchRef.current()
      } else {
        alert(`เกิดข้อผิดพลาดในการลบเกม: ${error?.message || 'Unknown error'}`)
      }
    } finally {
      setDeletingId(null)
    }
  }

  const typeColor = (t: string) => {
    switch (t) {
      case 'เกมทายภาพปริศนา': return { bg: '#eff6ff', fg: '#2563eb' }
      case 'เกมปาร์ตี้': return { bg: '#fef3c7', fg: '#d97706' }
      case 'เกมทายเบอร์เงิน': return { bg: '#fefce8', fg: '#ca8a04' }
      case 'เกมทายผลบอล': return { bg: '#ecfdf5', fg: '#059669' }
      case 'เกมบอลโลก': return { bg: '#fef2f2', fg: '#c8102e' }
      case 'เกมสล็อต': return { bg: '#fef2f2', fg: '#dc2626' }
      case 'เกมเช็คอิน': return { bg: '#faf5ff', fg: '#9333ea' }
      case 'เกมประกาศรางวัล': return { bg: '#fff7ed', fg: '#ea580c' }
      case 'เกมลุ้นรางวัลพิเศษ': return { bg: '#fff1f2', fg: '#e11d48' }
      case 'เกมลอยกระทง': return { bg: '#f0fdf4', fg: '#16a34a' }
      case 'เกมแนะนำเพื่อน': return { bg: '#ecfeff', fg: '#0891b2' }
      default: return { bg: '#f3f4f6', fg: '#6b7280' }
    }
  }

  const typePlaceholderBg = (t: string) => {
    switch (t) {
      case 'เกมทายภาพปริศนา': return 'linear-gradient(135deg,#3b82f6,#60a5fa)'
      case 'เกมปาร์ตี้': return 'linear-gradient(135deg,#f59e0b,#fbbf24)'
      case 'เกมทายเบอร์เงิน': return 'linear-gradient(135deg,#eab308,#facc15)'
      case 'เกมทายผลบอล': return 'linear-gradient(135deg,#10b981,#34d399)'
      case 'เกมบอลโลก': return 'linear-gradient(135deg,#0d2550,#c8102e)'
      case 'เกมสล็อต': return 'linear-gradient(135deg,#ef4444,#f87171)'
      case 'เกมเช็คอิน': return 'linear-gradient(135deg,#a855f7,#c084fc)'
      case 'เกมประกาศรางวัล': return 'linear-gradient(135deg,#f97316,#fb923c)'
      case 'เกมลุ้นรางวัลพิเศษ': return 'linear-gradient(135deg,#e11d48,#fb7185)'
      case 'เกมลอยกระทง': return 'linear-gradient(135deg,#22c55e,#4ade80)'
      case 'เกมแนะนำเพื่อน': return 'linear-gradient(135deg,#06b6d4,#22d3ee)'
      default: return 'linear-gradient(135deg,#6b7280,#9ca3af)'
    }
  }

  const typeShortLabel = (t: string) => {
    switch (t) {
      case 'เกมทายภาพปริศนา': return 'ปริศนา'
      case 'เกมทายเบอร์เงิน': return 'เบอร์เงิน'
      case 'เกมทายผลบอล': return 'บอล'
      case 'เกมบอลโลก': return 'บอลโลก'
      case 'เกมลุ้นรางวัลพิเศษ': return 'รางวัล'
      case 'เกมแนะนำเพื่อน': return 'แนะนำ'
      default: return t.replace('เกม', '').replace(/\s/g, '')
    }
  }

  return (
    <div className="admin-body-white">
      <div className="admin-page-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flex: 1 }}>
          <div className="admin-page-icon"><Gamepad2 size={22} color="#fff" /></div>
          <h2>รายการเกมที่สร้างไว้</h2>
        </div>
        <div style={{
          background: 'var(--theme-primary, #10B981)',
          color: '#fff',
          borderRadius: 20,
          padding: '5px 16px',
          fontSize: 13,
          fontWeight: 700,
        }}>
          {rows.length} เกม
        </div>
      </div>

      {loading && (
        <div style={{ textAlign: 'center', padding: '60px 20px' }}>
          <div style={{ width: 40, height: 40, border: '4px solid #e5e7eb', borderTopColor: 'var(--theme-primary, #10B981)', borderRadius: '50%', animation: 'spin 0.8s linear infinite', margin: '0 auto 16px' }} />
          <div style={{ color: '#94a3b8', fontWeight: 600, fontSize: 14 }}>กำลังโหลดรายการเกม...</div>
          <style>{`@keyframes spin{0%{transform:rotate(0)}100%{transform:rotate(360deg)}}`}</style>
        </div>
      )}

      {error && (
        <div style={{ background: '#fef2f2', borderRadius: 12, padding: '32px 24px', textAlign: 'center', border: '1px solid #fecaca' }}>
          <div style={{ fontSize: 40, marginBottom: 8 }}><AlertTriangle size={40} color="#dc2626" /></div>
          <div style={{ color: '#991b1b', fontSize: 16, fontWeight: 700, marginBottom: 6 }}>เกิดข้อผิดพลาด</div>
          <div style={{ color: '#b91c1c', fontSize: 14, marginBottom: 14 }}>{error}</div>
          <button onClick={() => refetch()} style={{ background: 'var(--theme-primary, #10B981)', color: '#fff', border: 'none', borderRadius: 8, padding: '8px 20px', fontWeight: 600, cursor: 'pointer', fontSize: 14, display: 'inline-flex', alignItems: 'center', gap: 6 }}><RefreshCw size={14} /> ลองใหม่อีกครั้ง</button>
        </div>
      )}

      {!loading && !error && rows.length === 0 && (
        <div style={{ textAlign: 'center', padding: '56px 24px' }}>
          <div style={{ marginBottom: 12 }}><Gamepad2 size={56} color="#94a3b8" /></div>
          <div style={{ color: '#334155', fontSize: 17, fontWeight: 700, marginBottom: 6 }}>ยังไม่มีเกมที่สร้างไว้</div>
          <div style={{ color: '#94a3b8', fontSize: 14 }}>คลิก "สร้างเกม" ที่เมนูด้านซ้ายเพื่อเริ่มสร้างเกมแรก</div>
        </div>
      )}

      {!loading && rows.length > 0 && (
        <div className="admin-games-grid">
          {rows.map((g) => {
            const tc = typeColor(g.type)
            const isDeleting = deletingId === g.id
            return (
              <div
                key={g.id}
                className="admin-game-card"
                style={{ position: 'relative' }}
                onClick={() => nav(`/games/${g.id}`)}
                onMouseEnter={() => prefetchGame(g.id)}
                role="button"
                title="คลิกเพื่อแก้ไข"
              >
                <div className="admin-game-thumb" style={{ background: typePlaceholderBg(g.type) }}>
                  {g.imageUrl ? (
                    <img src={g.imageUrl} alt={g.name} loading="lazy" />
                  ) : (
                    <div className="admin-game-thumb-placeholder">
                      {typeShortLabel(g.type)}
                    </div>
                  )}
                </div>
                <div className="admin-game-body">
                  <div className="admin-game-type-label" style={{ color: tc.fg }}>{g.type}</div>
                  <div className="admin-game-name">{g.name || '(ไม่มีชื่อเกม)'}</div>
                  {g.createdAt && (
                    <div className="admin-game-date">{new Date(g.createdAt).toLocaleString('th-TH', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</div>
                  )}
                </div>
                <button
                  className="admin-game-delete-btn"
                  onClick={(e) => handleDelete(g, e)}
                  disabled={isDeleting}
                  title="ลบเกมนี้"
                  style={{
                    position: 'absolute', top: 6, right: 6,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    width: 30, height: 30, padding: 0,
                    border: 'none', borderRadius: 8,
                    background: 'rgba(0,0,0,0.45)', color: '#fff',
                    cursor: isDeleting ? 'not-allowed' : 'pointer',
                    opacity: 0, transition: 'opacity 0.15s ease, background 0.15s ease',
                    backdropFilter: 'blur(4px)',
                    zIndex: 2,
                  }}
                >
                  {isDeleting
                    ? <Loader2 size={14} style={{ animation: 'spin 0.8s linear infinite' }} />
                    : <Trash2 size={14} />
                  }
                </button>
              </div>
            )
          })}
        </div>
      )}

      {/* Popup ยืนยันการลบเกม */}
      {deleteConfirm && (
        <div
          style={{
            position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
            background: 'rgba(0, 0, 0, 0.5)', display: 'flex',
            alignItems: 'center', justifyContent: 'center', zIndex: 9999,
          }}
          onClick={() => setDeleteConfirm(null)}
        >
          <div onClick={(e) => e.stopPropagation()} style={{
            background: '#fff', borderRadius: 16, padding: '28px 32px',
            maxWidth: 420, width: '90%', boxShadow: '0 20px 60px rgba(0,0,0,0.2)',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
              <div style={{
                width: 44, height: 44, borderRadius: 12,
                background: '#fee2e2', display: 'flex',
                alignItems: 'center', justifyContent: 'center', flexShrink: 0,
              }}>
                <Trash2 size={22} color="#dc2626" />
              </div>
              <div>
                <div style={{ fontSize: 18, fontWeight: 800, color: '#1e293b' }}>ยืนยันลบเกม</div>
                <div style={{ fontSize: 13, color: '#94a3b8', marginTop: 2 }}>การลบเกมจะไม่สามารถกู้คืนได้</div>
              </div>
            </div>

            <div style={{
              background: '#f8fafc', borderRadius: 10, padding: 14, marginBottom: 20,
              border: '1px solid #e2e8f0',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                {deleteConfirm.imageUrl && (
                  <img src={deleteConfirm.imageUrl} alt="" style={{ width: 44, height: 44, borderRadius: 8, objectFit: 'cover', flexShrink: 0 }} />
                )}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 700, color: '#1e293b', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{deleteConfirm.name || '-'}</div>
                  <div style={{ fontSize: 12, fontWeight: 600, color: typeColor(deleteConfirm.type).fg }}>{deleteConfirm.type}</div>
                </div>
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <button
                onClick={() => setDeleteConfirm(null)}
                style={{
                  height: 44, borderRadius: 10, border: '1px solid #e2e8f0',
                  background: '#fff', color: '#94a3b8', fontWeight: 700,
                  fontSize: 14, cursor: 'pointer', transition: 'all 0.15s ease',
                }}
              >
                ยกเลิก
              </button>
              <button
                onClick={confirmDeleteGame}
                style={{
                  height: 44, borderRadius: 10, border: 'none',
                  background: '#dc2626', color: '#fff', fontWeight: 700,
                  fontSize: 14, cursor: 'pointer', transition: 'all 0.15s ease',
                  boxShadow: '0 4px 12px rgba(220,38,38,0.3)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                }}
              >
                <Trash2 size={15} /> ลบเกม
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}