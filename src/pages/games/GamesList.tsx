// src/pages/games/GamesList.tsx
import React from 'react'
import { useNavigate } from 'react-router-dom'
// ✅ Using Firebase Firestore
import { getAuth, EmailAuthProvider, reauthenticateWithCredential } from 'firebase/auth'
import { usePrefetch } from '../../services/prefetching'
import { useThemeColors } from '../../contexts/ThemeContext'
import { getGames, getGameById, deleteGame } from '../../services/firebase-games-new'
import { Puzzle, PartyPopper, Coins, Trophy, Dices, CalendarCheck, Megaphone, Gift, Flame, Handshake, Globe, ClipboardList, Trash2, Lock, Gamepad2, type LucideIcon } from 'lucide-react'

type GameType =
  | 'เกมทายภาพปริศนา'
  | 'เกมปาร์ตี้'
  | 'เกมทายเบอร์เงิน'
  | 'เกมทายผลบอล'
  | 'เกมบอลโลก'
  | 'เกมสล็อต'
  | 'เกมเช็คอิน'
  | 'เกมประกาศรางวัล'
  | 'เกมลุ้นรางวัลพิเศษ'
  | 'เกมลอยกระทง'
  | 'เกมแนะนำเพื่อน'

type GameItem = {
  id: string
  name?: string
  type: GameType
  createdAt?: number
  unlocked?: boolean
  locked?: boolean
}

// Helper function to convert hex to rgba
const hexToRgba = (hex: string, alpha: number) => {
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}

// TYPE_STYLES will be generated dynamically based on theme colors
const getTypeStyles = (colors: any): Record<GameType, { bg: string; border: string }> => ({
  'เกมทายภาพปริศนา': { bg: hexToRgba(colors.info, 0.1), border: colors.info },
  'เกมปาร์ตี้': { bg: hexToRgba(colors.info, 0.12), border: colors.info },
  'เกมทายเบอร์เงิน':  { bg: hexToRgba(colors.warning, 0.1), border: colors.warning },
  'เกมทายผลบอล':      { bg: hexToRgba(colors.success, 0.1), border: colors.success },
  'เกมบอลโลก':        { bg: hexToRgba(colors.danger, 0.12), border: colors.danger },
  'เกมสล็อต':         { bg: hexToRgba(colors.danger, 0.1), border: colors.danger },
  'เกมเช็คอิน':       { bg: hexToRgba(colors.accent, 0.1), border: colors.accent },
  'เกมประกาศรางวัล':   { bg: hexToRgba(colors.secondary, 0.1), border: colors.secondary },
  'เกมลุ้นรางวัลพิเศษ': { bg: hexToRgba(colors.warning, 0.15), border: colors.warning },
  'เกมลอยกระทง':      { bg: hexToRgba(colors.success, 0.1), border: colors.success },
  'เกมแนะนำเพื่อน':   { bg: hexToRgba(colors.primary, 0.12), border: colors.primary },
})

const TYPE_ICONS: Record<GameType, LucideIcon> = {
  'เกมทายภาพปริศนา': Puzzle,
  'เกมปาร์ตี้': PartyPopper,
  'เกมทายเบอร์เงิน': Coins,
  'เกมทายผลบอล': Trophy,
  'เกมบอลโลก': Globe,
  'เกมสล็อต': Dices,
  'เกมเช็คอิน': CalendarCheck,
  'เกมประกาศรางวัล': Megaphone,
  'เกมลุ้นรางวัลพิเศษ': Gift,
  'เกมลอยกระทง': Flame,
  'เกมแนะนำเพื่อน': Handshake,
}

export default function GamesList() {
  const nav = useNavigate()
  const colors = useThemeColors()
  const [items, setItems] = React.useState<GameItem[]>([])
  const [loading, setLoading] = React.useState(true)
  const { prefetchGame } = usePrefetch()
  
  const TYPE_STYLES = getTypeStyles(colors)

  // กันกดซ้ำตอนลบ
  const [deletingId, setDeletingId] = React.useState<string | null>(null)

  // confirm popup ก่อนลบ
  const [deleteConfirm, setDeleteConfirm] = React.useState<GameItem | null>(null)

  // modal กรอกรหัสผ่าน
  const [pwdModal, setPwdModal] = React.useState<{
    open: boolean
    game: GameItem | null
    password: string
    loading: boolean
    error?: string
  }>({ open: false, game: null, password: '', loading: false })

  // Helper function: แปลง game data เป็น GameItem
  const parseGameItem = (gameData: any): GameItem | null => {
      const gameItem = {
        id: gameData.id || '',
        name: gameData.name || gameData.title || '',
        type: (gameData.type || 'เกมทายภาพปริศนา') as GameType,
        createdAt: typeof gameData.createdAt === 'number' ? gameData.createdAt : (typeof gameData.updatedAt === 'number' ? gameData.updatedAt : 0),
        unlocked: typeof gameData.unlocked === 'boolean' ? gameData.unlocked : (typeof gameData.locked === 'boolean' ? !gameData.locked : false),
        locked: typeof gameData.locked === 'boolean' ? gameData.locked : (typeof gameData.unlocked === 'boolean' ? !gameData.unlocked : true),
      }
      
      // ✅ กรองเกมที่ไม่มีชื่อหรือชื่อเป็น empty string ออก
      const gameName = (gameItem.name || '').trim()
      if (gameName.length === 0 || !gameItem.id) {
        return null
      }
      
      return gameItem
    }

  // ✅ OPTIMIZED: ใช้ cache-first strategy + polling ที่นานขึ้น (30 วินาที) เพื่อลด Firestore reads
  React.useEffect(() => {
    let intervalId: NodeJS.Timeout | null = null
    
    const fetchGamesList = async () => {
      try {
        // ✅ getGames() จะใช้ cache อัตโนมัติ (2 minutes TTL)
        const gamesList = await getGames()
        
        // แปลงเป็น GameItem[]
        const itemsList: GameItem[] = []
        for (const game of gamesList) {
          const item = parseGameItem(game)
          if (item) {
            itemsList.push(item)
          }
        }
        
        // ✅ เรียงตาม createdAt (ล่าสุดก่อน)
        itemsList.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0))
        
        // ✅ จำกัดจำนวนเกมที่แสดง (50 เกมล่าสุด)
        const MAX_GAMES_DISPLAY = 50
        const limitedList = itemsList.slice(0, MAX_GAMES_DISPLAY)
        
        setItems(limitedList)
        setLoading(false)
      } catch (error: any) {
        console.error('[GamesList] Error fetching games list:', {
          error: error?.message || String(error),
          code: error?.code,
          stack: error?.stack
        })
        // Show empty list instead of crashing
        setItems([])
        setLoading(false)
      }
    }

    // Fetch immediately
    fetchGamesList()
    
    // ✅ OPTIMIZED: Poll every 30 seconds instead of 5 seconds (ลด Firestore reads 6x)
    // ✅ Cache จะจัดการให้ reads เกิดขึ้นน้อยลง
    intervalId = setInterval(fetchGamesList, 30000)

    return () => {
      if (intervalId) {
        clearInterval(intervalId)
      }
    }
  }, [])

  /** อ่านสถานะล็อกจริงจาก Database */
  async function readLockedFromDb(gameId: string): Promise<boolean> {
    try {
      // ✅ ใช้ Firebase Firestore
      const gameData = await getGameById(gameId)
      if (!gameData) return false
      return gameData?.locked === true || gameData?.unlocked === false
    } catch (error: any) {
      console.error('[GamesList] Error fetching game data:', {
        error: error?.message || String(error),
        code: error?.code,
        gameId
      })
      return false
    }
  }

  /** ทำการลบจริง */
  async function reallyDelete(game: GameItem) {
    if (!game?.id) return
    try {
      setDeletingId(game.id)
      
      // ✅ ใช้ Firebase Firestore
      const result = await deleteGame(game.id)
      if (result.success) {
        alert('ลบเกมเรียบร้อย')
        // Refresh the list
        const gamesList = await getGames()
        const itemsList: GameItem[] = []
        for (const g of gamesList) {
          const item = parseGameItem(g)
          if (item) itemsList.push(item)
        }
        itemsList.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0))
        setItems(itemsList.slice(0, 50))
      } else {
        alert('เกิดข้อผิดพลาดในการลบเกม')
      }
    } catch (error: any) {
      console.error('[GamesList] Error deleting game:', {
        error: error?.message || String(error),
        code: error?.code,
        gameId: game.id
      })
      alert(`เกิดข้อผิดพลาดในการลบเกม: ${error?.message || 'Unknown error'}`)
    } finally {
      setDeletingId(null)
    }
  }

  /** กดลบการ์ด — แสดง popup ยืนยันก่อนเสมอ */
  function handleDelete(g: GameItem, e?: React.MouseEvent) {
    e?.stopPropagation()
    if (!g?.id || deletingId) return
    setDeleteConfirm(g)
  }

  /** ยืนยันลบจาก popup */
  async function confirmDelete() {
    const g = deleteConfirm
    if (!g) return
    setDeleteConfirm(null)

    const lockedNow = await readLockedFromDb(g.id)
    if (lockedNow) {
      setPwdModal({ open: true, game: g, password: '', loading: false, error: undefined })
      return
    }
    await reallyDelete(g)
  }

  /** กดยืนยันรหัสผ่านใน modal */
  async function confirmPasswordAndDelete() {
    const g = pwdModal.game
    if (!g) return
    const auth = getAuth()
    const user = auth.currentUser

    if (!user || !user.email) {
      setPwdModal(s => ({ ...s, error: 'กรุณาล็อกอินด้วยอีเมล/รหัสผ่านก่อน' }))
      return
    }

    // ต้องเป็นบัญชีที่มี provider password
    const providerIds = (user.providerData || []).map(p => p?.providerId).filter(Boolean)
    const canUsePassword = providerIds.includes('password') || providerIds.length === 0
    if (!canUsePassword) {
      setPwdModal(s => ({ ...s, error: 'บัญชีนี้ไม่ได้ใช้รหัสผ่าน (เช่น Google/Facebook) ไม่สามารถยืนยันด้วยรหัสผ่านได้' }))
      return
    }

    if (!pwdModal.password.trim()) {
      setPwdModal(s => ({ ...s, error: 'กรุณากรอกรหัสผ่าน' }))
      return
    }

    try {
      setPwdModal(s => ({ ...s, loading: true, error: undefined }))
      const cred = EmailAuthProvider.credential(user.email, pwdModal.password)
      await reauthenticateWithCredential(user, cred)
      setPwdModal({ open: false, game: null, password: '', loading: false })
      await reallyDelete(g)
    } catch (err) {
      setPwdModal(s => ({ ...s, loading: false, error: 'รหัสผ่านไม่ถูกต้อง' }))
    }
  }

  if (loading) {
    return (
      <div className="admin-body-white" style={{ textAlign: 'center', padding: '60px 20px' }}>
        <div style={{
          width: '40px',
          height: '40px',
          border: '4px solid #f3f3f3',
          borderTop: '4px solid var(--theme-primary, #3498db)',
          borderRadius: '50%',
          animation: 'spin 1s linear infinite',
          margin: '0 auto 16px'
        }} />
        <div style={{ color: '#666', fontWeight: 600 }}>กำลังโหลดรายการเกม...</div>
        <style>{`@keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }`}</style>
      </div>
    )
  }

  return (
    <div className="admin-body-white">
      <div className="admin-page-header">
        <div className="admin-page-icon"><ClipboardList size={22} color="#fff" /></div>
        <h2>รายการเกมที่สร้างไว้</h2>
      </div>

      {items.length === 0 ? (
        <div style={{textAlign:'center', color: colors.textSecondary, padding: '40px 0'}}>ยังไม่มีเกมที่สร้างไว้</div>
      ) : (
        <div style={{display:'grid', gap:10}}>
          {items.map((g) => {
              const st = TYPE_STYLES[g.type] || { bg: '#f5f5f5', border: '#ddd' }
              const lockedIcon = (g.locked ?? !g.unlocked)
              const IconComp = TYPE_ICONS[g.type] || Gamepad2
              return (
                <div
                  key={g.id}
                  onClick={() => nav(`/games/${g.id}`)}
                  onMouseEnter={() => prefetchGame(g.id)}
                  style={{
                    display:'flex',
                    alignItems:'center',
                    gap: 10,
                    background: st.bg,
                    border: `1px solid ${st.border}`,
                    borderRadius: 12,
                    padding: '10px 12px',
                    cursor:'pointer',
                    transition: 'box-shadow 0.15s ease',
                  }}
                >
                  <span
                    style={{
                      display:'inline-flex',
                      width:36, height:36, borderRadius:10,
                      alignItems:'center', justifyContent:'center',
                      background:'#fff', border:`1px solid ${st.border}`,
                      flexShrink: 0,
                    }}
                    title={g.type}
                  >
                    <IconComp size={18} color={st.border} />
                  </span>

                  <div style={{ flex: 1, minWidth: 0, lineHeight: 1.3 }}>
                    <div style={{ fontWeight: 700, fontSize: 14, color: colors.textPrimary, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {g.name || '(ไม่มีชื่อเกม)'}
                      {lockedIcon && <Lock size={12} style={{ marginLeft: 5, verticalAlign: 'text-bottom', opacity: 0.6 }} />}
                    </div>
                    <div style={{ fontSize: 12, color: colors.textSecondary, display: 'flex', alignItems: 'center', gap: 6, marginTop: 1 }}>
                      <span style={{ fontWeight: 600, color: st.border }}>{g.type}</span>
                      {g.createdAt ? (
                        <>
                          <span style={{ opacity: 0.3 }}>·</span>
                          <span>{new Date(g.createdAt).toLocaleString('th-TH')}</span>
                        </>
                      ) : null}
                    </div>
                  </div>

                  <button
                    onClick={(e) => handleDelete(g, e)}
                    title="ลบเกมนี้"
                    disabled={deletingId === g.id}
                    style={{
                      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                      width: 34, height: 34, padding: 0, flexShrink: 0,
                      border: `1px solid transparent`,
                      borderRadius: 8,
                      background: 'transparent',
                      color: colors.textTertiary,
                      cursor: deletingId === g.id ? 'not-allowed' : 'pointer',
                      opacity: deletingId === g.id ? 0.5 : 1,
                      transition: 'all 0.15s ease',
                    }}
                    onMouseEnter={(e) => { e.currentTarget.style.background = `${colors.danger}14`; e.currentTarget.style.borderColor = `${colors.danger}40`; e.currentTarget.style.color = colors.danger }}
                    onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.borderColor = 'transparent'; e.currentTarget.style.color = colors.textTertiary }}
                  >
                    {deletingId === g.id
                      ? <span style={{ width: 16, height: 16, border: `2px solid ${colors.danger}`, borderTopColor: 'transparent', borderRadius: '50%', display: 'block', animation: 'spin 0.8s linear infinite' }} />
                      : <Trash2 size={15} />
                    }
                  </button>
                </div>
              )
            })}
          </div>
        )}

      {/* Popup ยืนยันการลบเกม */}
      {deleteConfirm && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(0, 0, 0, 0.5)', display: 'flex',
          alignItems: 'center', justifyContent: 'center', zIndex: 9999,
        }} onClick={() => setDeleteConfirm(null)}>
          <div onClick={(e) => e.stopPropagation()} style={{
            background: '#fff', borderRadius: 16, padding: '28px 32px',
            maxWidth: 420, width: '90%', boxShadow: '0 20px 60px rgba(0,0,0,0.2)',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
              <div style={{
                width: 44, height: 44, borderRadius: 12,
                background: `${colors.danger}15`, display: 'flex',
                alignItems: 'center', justifyContent: 'center', flexShrink: 0,
              }}>
                <Trash2 size={22} color={colors.danger} />
              </div>
              <div>
                <div style={{ fontSize: 18, fontWeight: 800, color: colors.textPrimary }}>ยืนยันลบเกม</div>
                <div style={{ fontSize: 13, color: colors.textSecondary, marginTop: 2 }}>การลบเกมจะไม่สามารถกู้คืนได้</div>
              </div>
            </div>

            <div style={{
              background: colors.bgSecondary, borderRadius: 10, padding: 12, marginBottom: 20,
              border: `1px solid ${colors.borderLight}`, fontSize: 13, color: colors.textSecondary,
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                <span>ชื่อเกม</span>
                <span style={{ fontWeight: 700, color: colors.textPrimary }}>{deleteConfirm.name || '-'}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span>ประเภท</span>
                <span style={{ fontWeight: 700, color: (TYPE_STYLES[deleteConfirm.type] || { border: colors.primary }).border }}>{deleteConfirm.type}</span>
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <button
                onClick={() => setDeleteConfirm(null)}
                style={{
                  height: 44, borderRadius: 10, border: `1px solid ${colors.borderLight}`,
                  background: '#fff', color: colors.textSecondary, fontWeight: 700,
                  fontSize: 14, cursor: 'pointer', transition: 'all 0.15s ease',
                }}
              >
                ยกเลิก
              </button>
              <button
                onClick={confirmDelete}
                style={{
                  height: 44, borderRadius: 10, border: 'none',
                  background: colors.danger, color: '#fff', fontWeight: 700,
                  fontSize: 14, cursor: 'pointer', transition: 'all 0.15s ease',
                  boxShadow: `0 4px 12px ${colors.danger}40`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                }}
              >
                <Trash2 size={15} /> ลบเกม
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal กรอกรหัสผ่านก่อนลบ */}
      {pwdModal.open && (
        <div
          className="admin-modal-overlay"
          style={{
            position:'fixed', inset:0, background:'rgba(0,0,0,.5)',
            display:'flex', alignItems:'center', justifyContent:'center', zIndex:50
          }}
        >
          <div
            className="admin-modal"
            onClick={(e)=>e.stopPropagation()}
            style={{
              width:'min(440px, 92vw)',
              background: colors.bgPrimary,
              borderRadius:16,
              padding:'18px 16px',
              boxShadow:'0 10px 30px rgba(0,0,0,.25)'
            }}
          >
            <h3 style={{margin:'4px 0 10px', textAlign:'center', color: colors.textPrimary}}>ใส่รหัสผ่านเพื่อยืนยันการลบเกมที่ถูกล็อก</h3>
            <div style={{fontSize:13, color: colors.textSecondary, textAlign:'center', marginBottom:10}}>
              จะใช้รหัสผ่านเดียวกับที่คุณใช้ล็อกอิน
            </div>
            <input
              type="password"
              placeholder="รหัสผ่าน"
              value={pwdModal.password}
              onChange={(e)=>setPwdModal(s=>({ ...s, password:e.target.value }))}
              onKeyDown={(e)=>{ if(e.key==='Enter') confirmPasswordAndDelete() }}
              autoFocus
              style={{
                width:'100%', height:44, borderRadius:10, padding:'0 12px',
                border:`1px solid ${colors.borderMedium}`, outline:'none',
                color: colors.textPrimary,
                background: colors.bgPrimary
              }}
            />
            {!!pwdModal.error && (
              <div style={{color: colors.danger, fontSize:13, marginTop:8, textAlign:'center'}}>{pwdModal.error}</div>
            )}

            <div style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:10, marginTop:14}}>
              <button
                className="admin-btn-cta"
                onClick={confirmPasswordAndDelete}
                disabled={pwdModal.loading}
                style={{
                  height:44, borderRadius:10, border:'none',
                  background: colors.success, color: colors.textInverse, fontWeight:700,
                  cursor: pwdModal.loading ? 'not-allowed' : 'pointer'
                }}
              >
                {pwdModal.loading ? 'กำลังตรวจสอบ…' : 'ตกลง'}
              </button>
              <button
                className="admin-btn-outline"
                onClick={()=>setPwdModal({ open:false, game:null, password:'', loading:false })}
                style={{
                  height:44, borderRadius:10, border:`1px solid ${colors.borderMedium}`,
                  background: colors.bgPrimary, color: colors.textPrimary, fontWeight:700, cursor:'pointer'
                }}
              >
                ยกเลิก
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
