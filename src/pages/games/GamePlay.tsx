// src/pages/play/PlayGame.tsx
import React from 'react'
import { createPortal } from 'react-dom'
import { useParams, useSearchParams, useLocation } from 'react-router-dom'
import { dataCache } from '../../services/cache'
import { getGameById, subscribeGameUpdates } from '../../services/firebase-games-new'
import { getUser } from '../../services/firebase-users-new'
import { getAnswers, submitAnswer, getUserLatestAnswer } from '../../services/firebase-answers-new'
import '../../styles/style.css'
import SlotGame from '../../components/SlotGame'
import PuzzleGame from '../../components/PuzzleGame'
import NumberGame from '../../components/NumberGame'
import FootballGame from '../../components/FootballGame'
import CheckinGame from '../../components/CheckinGame'
import TrickOrTreatGame from '../../components/TrickOrTreatGame'
import PokDengGame from '../../components/PokDengGame'
import LoyKrathongGame from '../../components/LoyKrathongGame'
import AnnounceGame from '../../components/AnnounceGame'
import ReferralGame from '../../components/ReferralGame'
import WorldCupGame from '../../components/WorldCupGame'
import { useTheme, useThemeAssets, useThemeBranding, useThemeColors } from '../../contexts/ThemeContext'
import { getImageUrl } from '../../services/image-upload'
import { 
  getAnnounceUsersFromSubcollection,
  checkUserInAnnounceUsers,
  getUserBonusFromSubcollection,
  getAnnounceUsersCount
} from '../../services/firebase-announce-users'
import { isBlacklisted } from '../../services/firebase-blacklist'
import { Trophy, Gift, Target, Gamepad2, PartyPopper, AlertTriangle, Lock, User, XCircle, Clock, Sparkles, Copy, CheckCircle2, Eye, EyeOff, ExternalLink, LogOut, Loader2, RotateCw } from 'lucide-react'

/** แปลงชื่อให้เป็นรูปแบบคีย์ใน DB (ตัดช่องว่างและอักขระพิเศษ) */
const normalizeUser = (s: string) => s.trim().replace(/\s+/g, '').replace(/[.#$[\]@]/g, '_').toUpperCase()

const hexToRgba = (hex: string, alpha = 1) => {
  if (!hex) return `rgba(0,0,0,${alpha})`
  let sanitized = hex.replace('#', '')
  if (sanitized.length === 3) {
    sanitized = sanitized
      .split('')
      .map((c) => c + c)
      .join('')
  }
  if (sanitized.length !== 6) return `rgba(0,0,0,${alpha})`
  const intVal = parseInt(sanitized, 16)
  const r = (intVal >> 16) & 255
  const g = (intVal >> 8) & 255
  const b = intVal & 255
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}

const clampSize = (min: number, vw: number, max: number) => `clamp(${min}px, ${vw}vw, ${max}px)`

const PLAYER_CACHE_KEY = 'player_name'
const PLAYER_CACHE_TS_KEY = 'player_name_ts'
const PLAYER_CACHE_TTL = 24 * 60 * 60 * 1000 // 24 hours

function getCachedPlayerName(): string {
  try {
    const name = localStorage.getItem(PLAYER_CACHE_KEY)
    const ts = localStorage.getItem(PLAYER_CACHE_TS_KEY)
    if (!name || !ts) return ''
    if (Date.now() - Number(ts) > PLAYER_CACHE_TTL) {
      localStorage.removeItem(PLAYER_CACHE_KEY)
      localStorage.removeItem(PLAYER_CACHE_TS_KEY)
      return ''
    }
    return name
  } catch {
    return ''
  }
}

function setCachedPlayerName(name: string) {
  try {
    localStorage.setItem(PLAYER_CACHE_KEY, name)
    localStorage.setItem(PLAYER_CACHE_TS_KEY, String(Date.now()))
  } catch {}
}

function clearCachedPlayerName() {
  try {
    localStorage.removeItem(PLAYER_CACHE_KEY)
    localStorage.removeItem(PLAYER_CACHE_TS_KEY)
  } catch {}
}

type GameType =
  | 'เกมทายภาพปริศนา'
  | 'เกมปาร์ตี้'
  | 'เกมป๊อกเด้ง'
  | 'เกมทายเบอร์เงิน'
  | 'เกมทายผลบอล'
  | 'เกมบอลโลก'
  | 'เกมสล็อต'
  | 'เกมเช็คอิน'
  | 'เกมประกาศรางวัล'
  | 'เกมลุ้นรางวัลพิเศษ'
  | 'เกมลอยกระทง'
  | 'เกมแนะนำเพื่อน'

type GameData = {
  id: string
  type: GameType
  name: string
  unlocked?: boolean
  locked?: boolean
  userAccessType?: 'all' | 'selected'
  selectedUsers?: string[]
  codes?: string[]
  codeCursor?: number
  claimedBy?: Record<string, any>
  puzzle?: { imageDataUrl?: string; answer?: string }
  partyRounds?: Array<{
    round?: number
    answer?: string
    codeCount?: number
    codeStartIndex?: number
    codeEndIndex?: number
    imageDataUrl?: string
    fileName?: string
  }>
  partyRoundNumber?: number
  numberPick?: { imageDataUrl?: string; endAt?: number | null }
  football?: { imageDataUrl?: string; homeTeam?: string; awayTeam?: string; endAt?: number | null }
  worldCup?: {
    title?: string
    ended?: boolean
    endedAt?: number | null
    bonusPerCorrect?: number
    matchResults?: Record<string, {
      home?: number
      away?: number
      codes?: string[]
      codeCursor?: number
      codeFileName?: string
      claimedBy?: Record<string, { code?: string; bonus?: number; ts: number; answer?: string }>
      ended?: boolean
      endedAt?: number | null
    }>
  }
  slot?: any
  announce?: { users: string[] }
  checkin?: { users?: string[]; [key: string]: any }
  trickOrTreat?: { 
    winChance?: number
    ghostImage?: string
  }
}

const toCodesArray = (raw: any): string[] => {
  if (Array.isArray(raw)) return raw.map((c) => String(c ?? ''))
  if (raw && typeof raw === 'object') {
    return Object.keys(raw)
      .sort((a, b) => Number(a) - Number(b))
      .map((k) => String(raw[k] ?? ''))
  }
  return []
}

const parseRoundNumber = (value?: string | null): number | null => {
  const raw = String(value || '').trim().toUpperCase()
  if (!raw) return null
  const num = raw.startsWith('R') ? Number(raw.slice(1)) : Number(raw)
  return Number.isFinite(num) && num >= 1 ? Math.floor(num) : null
}

type ModalKind = 'info' | 'code' | 'codes-empty';

const TYPE_META: Record<GameType, { icon: React.ReactNode; cls: string; label: string }> = {
  'เกมทายภาพปริศนา': { icon: '🧩', cls: 'type-puzzle',   label: 'เกมทายภาพปริศนา' },
  'เกมปาร์ตี้': { icon: <PartyPopper size={20} />, cls: 'type-puzzle',   label: 'เกมปาร์ตี้' },
  'เกมทายเบอร์เงิน' : { icon: '🔢', cls: 'type-number',   label: 'เกมทายเบอร์เงิน' },
  'เกมทายผลบอล'     : { icon: '⚽️', cls: 'type-football', label: 'เกมทายผลบอล' },
  'เกมบอลโลก'        : { icon: '🏆', cls: 'type-worldcup', label: 'เกมบอลโลก' },
  'เกมสล็อต'         : { icon: '🎰', cls: 'type-slot',     label: 'เกมสล็อต' },
  'เกมเช็คอิน'       : { icon: '📍', cls: 'type-checkin',  label: 'HENG36 GAME ' },
  'เกมประกาศรางวัล': { icon: <Trophy size={20} />, cls: 'type-announce', label: 'เกมประกาศรางวัล' },
  'เกมลุ้นรางวัลพิเศษ': { icon: <Gift size={20} />, cls: 'type-trickortreat', label: 'เกมลุ้นรางวัลพิเศษ' },
  'เกมลอยกระทง'     : { icon: '🪔', cls: 'type-loy',       label: 'เกมลอยกระทง' },
  'เกมแนะนำเพื่อน'   : { icon: '🤝', cls: 'type-referral', label: 'เกมแนะนำเพื่อน' },
  'เกมป๊อกเด้ง'      : { icon: '🃏', cls: 'type-pokdeng', label: 'เกมป๊อกเด้ง' },
}
const getTypeMeta = (t: GameType) => TYPE_META[t] ?? { icon: <Gamepad2 size={20} />, cls: 'type-default', label: t }

/** ----- Overlay แบบ portal ----- */
function Overlay({ children, onClose }: { children: React.ReactNode; onClose?: () => void }) {
  return createPortal(
    <div className="modal-overlay" onClick={onClose || undefined}>{children}</div>,
    document.body
  )
}

type ModalState =
  | { open: false }
  | { open: true; kind: 'info'; title: string; message: string; extra?: any }
  | { open: true; kind: 'code'; title: string; message: string; code: string }
  | { open: true; kind: 'saved'; title: string; message: string; extra?: any }
  | { open: true; kind: ModalKind; title?: string; message?: string; code?: string }
  | {
      open: true; kind: 'confirm-replace'; title: string; message?: string;
      oldLabel: string; oldValue: string;
      newLabel: string; newValue: string;
      onConfirm: () => Promise<void> | void;
    }
  | { open: true; kind: 'codes-empty'; title: string; message: string }

export default function PlayGame() {
  // รองรับทั้ง /play/:id และ /?id=...
  const params = useParams()
  const [sp] = useSearchParams()
  const location = useLocation()
  const id = (params.id || sp.get('id') || '').trim()
  const requestedRound = React.useMemo(() => parseRoundNumber(sp.get('round')), [sp])
  const assets = useThemeAssets()
  const branding = useThemeBranding()
  const colors = useThemeColors()
  const { themeName, theme } = useTheme()

  const buildExpiredMessage = React.useCallback(
    (player: string, score?: string | null) => {
      const headlineColor = colors.primary ?? '#2563eb'
      const subColor = colors.primaryDark ?? colors.primary ?? '#1d4ed8'
      const scoreColor = colors.danger ?? '#dc2626'
      const safePlayer = player || 'คุณ'
      const parts = [
        `<span style="color:${headlineColor}; font-weight:800;">เกมจบลงแล้ว</span>`,
        `<span style="color:${subColor}; font-weight:700;">สกอร์ที่ ${safePlayer} ทายไว้</span>`,
      ]
      if (score) {
        parts.push(`<span style="color:${scoreColor}; font-weight:800; font-size:18px;">${score}</span>`)
      } else {
        const muted = colors.textSecondary ?? '#64748b'
        parts.push(`<span style="color:${muted}; font-weight:600;">ยังไม่ได้ทายสกอร์ไว้ค่ะ</span>`)
      }
      return parts.join('<br/>')
    },
    [colors.danger, colors.primary, colors.primaryDark]
  )

  const [game, setGame] = React.useState<GameData | null>(null)
  const [loading, setLoading] = React.useState(true)
  
  // ✅ Use refs เพื่อเก็บค่าเก่าสำหรับ log (ป้องกัน log ซ้ำ)
  const prevGameIdRef = React.useRef<string | null>(null)
  const prevPuzzleImageRef = React.useRef<string | null>(null)
  
  // ✅ Use Firebase Realtime for game data updates
  React.useEffect(() => {
    if (!id) {
      setGame(null)
      setLoading(false)
      return
    }

    setLoading(true)
    
    // Helper function to normalize game data structure
    const normalizeGameData = (rawData: any): GameData => {
      if (!rawData) return rawData
      
      // ✅ รองรับทั้ง nested (gameData.puzzle) และ flat (puzzle) structure
      const gameData = rawData.gameData || {}
      const normalized: any = {
        id: rawData.id || rawData.gameId || id,
        ...rawData,
        // ✅ Flatten gameData fields to top level for easier access
        puzzle: rawData.puzzle || gameData.puzzle,
        numberPick: rawData.numberPick || gameData.numberPick,
        football: rawData.football || gameData.football,
        worldCup: rawData.worldCup || gameData.worldCup,
        slot: rawData.slot || gameData.slot,
        checkin: rawData.checkin || gameData.checkin,
        announce: rawData.announce || gameData.announce,
        trickOrTreat: rawData.trickOrTreat || gameData.trickOrTreat,
        loyKrathong: rawData.loyKrathong || gameData.loyKrathong,
        referral: rawData.referral || gameData.referral,
        codes: rawData.codes || gameData.codes,
        codeCursor: rawData.codeCursor !== undefined ? rawData.codeCursor : gameData.codeCursor,
        claimedBy: rawData.claimedBy || gameData.claimedBy,
        codesVersion: rawData.codesVersion || gameData.codesVersion,
        partyRounds: rawData.partyRounds || gameData.partyRounds || [],
        // ✅ ส่งต่อ partyMode + partyImagePool ให้ PuzzleGame ใช้สุ่มรูปต่อผู้เล่น (โหมด random_pool)
        partyMode: rawData.partyMode || gameData.partyMode || 'classic',
        partyImagePool: rawData.partyImagePool || gameData.partyImagePool || [],
      }

      if (normalized.type === 'เกมปาร์ตี้' && requestedRound && Array.isArray(normalized.partyRounds)) {
        const roundCfg = normalized.partyRounds[requestedRound - 1]
        if (roundCfg) {
          const allCodes = toCodesArray(normalized.codes)
          const start = Math.max(0, Number(roundCfg.codeStartIndex || 1) - 1)
          const endFromConfig = Number(roundCfg.codeEndIndex || 0)
          const defaultEnd = start + Math.max(1, Number(roundCfg.codeCount) || 1) - 1
          const end = Math.max(start, endFromConfig > 0 ? endFromConfig - 1 : defaultEnd)
          const roundCodes = allCodes.slice(start, end + 1)
          const roundKey = `R${requestedRound}`
          const partyRoundState = rawData.gameData?.partyRoundState || rawData.partyRoundState || {}
          const stateForRound = partyRoundState?.[roundKey] || {}

          normalized.puzzle = {
            imageDataUrl: roundCfg.imageDataUrl || normalized.puzzle?.imageDataUrl,
            answer: roundCfg.answer || normalized.puzzle?.answer,
          }
          normalized.codes = roundCodes
          normalized.codeCursor = Number(stateForRound.codeCursor || 0)
          normalized.claimedBy = stateForRound.claimedBy || {}
          normalized.partyRoundNumber = requestedRound
          normalized.codesVersion = Number(stateForRound.codesVersion || requestedRound)
        }
      }
      
      // ✅ อัพเดท ref เมื่อ game data เปลี่ยน
      const currentGameId = normalized.id
      const currentPuzzleImage = normalized.puzzle?.imageDataUrl || null
      if (currentGameId !== prevGameIdRef.current || currentPuzzleImage !== prevPuzzleImageRef.current) {
        prevGameIdRef.current = currentGameId
        prevPuzzleImageRef.current = currentPuzzleImage
      }
      
      return normalized as GameData
    }

    // Initial load
    getGameById(id).then((gameData) => {
      if (gameData) {
        const gameDataTyped = normalizeGameData({ id, ...gameData })
        setGame(gameDataTyped)
        dataCache.invalidateGame(id)
      } else {
        setGame(null)
      }
      setLoading(false)
    }).catch((error) => {
      console.error('Error loading game:', error)
      setGame(null)
      setLoading(false)
    })

    // Subscribe to real-time updates with error handling
    let unsubscribe: (() => void) | null = null;
    try {
      unsubscribe = subscribeGameUpdates(id, (gameData) => {
        if (gameData) {
          const gameDataTyped = normalizeGameData({ id, ...gameData })
          setGame(gameDataTyped)
          dataCache.invalidateGame(id)
        } else {
          setGame(null)
        }
        setLoading(false)
      })
    } catch (error) {
      // Handle subscription errors gracefully
      // Firebase SDK internal errors are caught by global handlers
      setLoading(false)
    }

    return () => {
      if (unsubscribe) {
        try {
          unsubscribe()
        } catch (error) {
          // Ignore errors during cleanup
        }
      }
    }
  }, [id, requestedRound])

  // ผู้เล่น
  const cachedName = getCachedPlayerName()
  const [username, setUsername] = React.useState(cachedName)
  const [password, setPassword] = React.useState('')
  const [userStatus, setUserStatus] = React.useState<string | null>(null)
  const [needName, setNeedName] = React.useState(!cachedName)
  const [checkingName, setCheckingName] = React.useState(false)

React.useEffect(() => {
  if (typeof window === 'undefined') return
  const update = () => setIsNarrowScreen(window.innerWidth < 560)
  update()
  window.addEventListener('resize', update)
  return () => window.removeEventListener('resize', update)
}, [])

  // ทั่วไป
  const [submitting, setSubmitting] = React.useState(false)
  const [copied, setCopied] = React.useState(false)
  const [expiredShown, setExpiredShown] = React.useState(false)
  const [runtimeExpired, setRuntimeExpired] = React.useState(false)
  const userKey = React.useMemo(() => normalizeUser(username || ''), [username])
  // สำหรับเกมประกาศรางวัล: เก็บข้อมูลโบนัสที่จะแสดงในหน้า
const [announceBonus, setAnnounceBonus] = React.useState<{ user: string; bonus: number; eligible?: boolean; conditionText?: string } | null>(null)
const [initialFootballGuess, setInitialFootballGuess] = React.useState<{ home: number; away: number } | null>(null)
const [lastFootballGuessText, setLastFootballGuessText] = React.useState<string | null>(null)
const [lastFootballGuessLoaded, setLastFootballGuessLoaded] = React.useState(false)
const footballGuessShownRef = React.useRef(false)
const [lastNumberGuess, setLastNumberGuess] = React.useState<string | null>(null)
const [lastNumberGuessLoaded, setLastNumberGuessLoaded] = React.useState(false)
const numberGuessShownRef = React.useRef(false)
// ให้ปุ่ม 'ตกลง' ทำงานพิเศษ (ตอนพบว่าเคยตอบแล้ว)
const [redirectOnOk, setRedirectOnOk] = React.useState<null | string>(null);
const [isNarrowScreen, setIsNarrowScreen] = React.useState<boolean>(() => {
  if (typeof window === 'undefined') return false
  return window.innerWidth < 560
})

  const [ignoreSoldOutOnce, setIgnoreSoldOutOnce] = React.useState(false);
  const soldOutGuardRef = React.useRef(false);
  const [autoSoldOutDismissed, setAutoSoldOutDismissed] = React.useState(false);
  const [showPw, setShowPw] = React.useState(false)

  // modal ส่วนกลาง (ทุกเกมใช้ร่วมกัน)
  const [modal, setModal] = React.useState<ModalState>({ open: false })
  const modalKind = modal.open ? modal.kind : undefined;
const modalTitle =
  modal.open && typeof (modal as any)?.title === 'string' ? (modal as any).title : '';
const modalHeaderTone =
  modal.open && modal.kind === 'codes-empty' ? 'danger' : 'primary';
const modalBodyBackground = React.useMemo(
  () => hexToRgba(colors.bgSecondary ?? colors.gray100 ?? colors.primaryLight ?? colors.primary ?? '#ffffff', 0.95),
  [colors.bgSecondary, colors.gray100, colors.primary, colors.primaryLight]
);
const modalActionBackground = React.useMemo(
  () => hexToRgba(colors.bgPrimary ?? colors.bgSecondary ?? '#ffffff', 0.95),
  [colors.bgPrimary, colors.bgSecondary]
);
const modalExtra = modal.open && 'extra' in modal ? (modal as any).extra : undefined;
const modalTextStyles = React.useMemo(() => {
  const accent = colors.primary ?? '#2563eb';
  const primaryText = colors.textPrimary ?? '#0f172a';
  const secondaryText = colors.textSecondary ?? '#475569';
  const toRgba = (value: string, alpha: number) =>
    /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(value.trim())
      ? hexToRgba(value, alpha)
      : `rgba(0,0,0,${alpha})`;
  return {
    accentColor: accent,
    headline: {
      fontSize: clampSize(18, 2.4, 22),
      fontWeight: 800,
      letterSpacing: 0.3,
      color: primaryText,
      textShadow: `0 1px 2px ${toRgba(primaryText, 0.08)}`,
    },
    body: {
      fontSize: clampSize(14, 2.0, 16),
      fontWeight: 600,
      lineHeight: 1.7,
      letterSpacing: 0.12,
      color: secondaryText,
    },
    bodyStrong: {
      fontSize: clampSize(14, 2.0, 16),
      fontWeight: 700,
      lineHeight: 1.7,
      letterSpacing: 0.12,
      color: primaryText,
    },
    caption: {
      fontSize: clampSize(12, 1.6, 13.5),
      fontWeight: 500,
      letterSpacing: 0.4,
      textTransform: 'none' as const,
      color: secondaryText,
      opacity: 0.85,
    },
    highlightBox: {
      background: toRgba(accent, 0.09),
      borderRadius: 12,
      padding: '14px 18px',
      color: primaryText,
      fontWeight: 700,
      lineHeight: 1.65,
      letterSpacing: 0.2,
      fontSize: clampSize(13, 1.9, 16),
      boxShadow: `0 6px 18px ${toRgba(accent, 0.18)}`,
    },
  };
}, [colors.primary, colors.textPrimary, colors.textSecondary]);

  const goHeng36 = React.useCallback(() => {
    const targetUrl = theme?.url || 'https://heng-36z.com/'
    
    // ✅ เปิดในแท็บใหม่แทนการ redirect ทั้งหน้า เพื่อไม่ให้ auth state เปลี่ยน
    try {
      // ใช้ window.open เพื่อเปิดในแท็บใหม่
      window.open(targetUrl, '_blank', 'noopener,noreferrer')
    } catch (error) {
      // Fallback: สร้าง link element และคลิก
      const link = document.createElement('a')
      link.href = targetUrl
      link.target = '_blank'
      link.rel = 'noopener noreferrer'
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
    }
  }, [theme?.url, themeName])
  // ✅ แสดงชื่อธีมตาม branding
  const getThemeDisplayName = () => {
    // ใช้ branding.title หรือ displayName จาก theme config
    return theme?.branding?.title?.replace(' PARTY', '') || theme?.displayName?.replace(' PARTY', '') || 'HENG36'
  }
  const goButtonLabel = `ไปที่ ${getThemeDisplayName()}`

  const getAnnounceConditionUserCount = React.useCallback(async () => {
    const announceData = (game as any)?.announce
    if (!announceData) return 0

    const documentUsersCount = Array.isArray(announceData.users) ? announceData.users.length : 0
    const documentBonusesCount = Array.isArray(announceData.userBonuses) ? announceData.userBonuses.length : 0
    const processedItemsCount = announceData.processedItems && typeof announceData.processedItems === 'object'
      ? Object.keys(announceData.processedItems).length
      : 0
    const fallbackCount = Math.max(documentUsersCount, documentBonusesCount, processedItemsCount)

    if (announceData._useSubcollection === true && id) {
      const subcollectionCount = await getAnnounceUsersCount(id, themeName)
      if (subcollectionCount > 0) return subcollectionCount

      // fallback เผื่อ count aggregate ใช้งานไม่ได้ในบาง environment
      const subcollectionUsers = await getAnnounceUsersFromSubcollection(id, themeName, { maxUsers: 20000 })
      if (subcollectionUsers.length > 0) return subcollectionUsers.length
    }

    return fallbackCount
  }, [game, id, themeName])

  // หัวข้อ+คำอธิบายสำหรับ popup กรอกชื่อ (แตกต่างตามประเภทเกม)
const needTitle =
  game?.type === 'เกมประกาศรางวัล'
    ? 'เช็ค USER ที่ได้รับโบนัสประจำเดือน 100'
    : 'กรอกยูสเซอร์เพื่อเข้าเล่น'

const needSubtitle =
  game?.type === 'เกมประกาศรางวัล'
    ? `กรอกยูสเซอร์เว็บ ${getThemeDisplayName()} ของคุณ เพื่อเช็คสิทธิ์รับโบนัสประจำเดือน`
    : `ใช้ยูสเซอร์ของเว็บ ${getThemeDisplayName()} เท่านั้น`

  // อ่านสถานะโค้ด: รองรับ codes เป็น array/object และนับ "แจกจริง" จาก claimedBy
  const getCodeState = (g: any) => {
    const src: any = g ?? {};

    const rawCodes = src.codes;
    const total = Array.isArray(rawCodes)
      ? rawCodes.length
      : rawCodes && typeof rawCodes === 'object'
        ? Object.keys(rawCodes).length
        : 0;

    const rawClaimed = src.claimedBy || {};
    const used = Object.values(rawClaimed).filter((v: any) => {
      if (v == null) return false;
      if (typeof v === 'boolean') return v;
      if (typeof v === 'string')  return v.length > 0;
      if (typeof v === 'number')  return v > 0;
      if (typeof v === 'object')  return !!(v.code || v.c) || Object.keys(v).length > 0;
      return false;
    }).length;

    const cursorRaw = Number(src.codeCursor ?? 0);
    const progress  = cursorRaw; // ใช้ cursorRaw โดยตรง ไม่ต้อง max กับ used

    return { total, used, cursor: progress, claimedBy: rawClaimed };
  };

    // ✅ OPTIMIZED: getPrevAnswer - query โดยตรงด้วย userId (รองรับเกินลิมิต 100)
    const getPrevAnswer = async (gameId: string, player: string) => {
      const answersIndexCacheKey = `answersIndex:${gameId}:${player}`
      let v = dataCache.get<any>(answersIndexCacheKey)

      if (!v) {
        try {
          // ใช้ query ตรงตาม userId เพื่อให้ได้คำตอบล่าสุดของผู้ใช้
          // แม้จะมีผู้เล่นอื่นส่งคำตอบทีหลังเกิน 100 คนก็ตาม
          const latest = await getUserLatestAnswer(gameId, player)
          if (latest) {
            v = {
              answer: latest.answer,
              code: latest.code,
              correct: latest.correct,
              ts: latest.createdAt?.toMillis?.() || latest.createdAt || 0,
            }
            dataCache.set(answersIndexCacheKey, v, 2 * 60 * 1000)
          } else {
            // Fallback สำหรับเกมที่ยังใช้โครงสร้างเก่า (answers ไม่มี userId filter index)
            const answers = await getAnswers(gameId, 1000)
            const playerAnswers = answers.filter((a: any) => a.userId === player)
            if (playerAnswers.length > 0) {
              const latestAnswer = playerAnswers.sort((a: any, b: any) => {
                const aTs = a.createdAt?.toMillis?.() || a.createdAt || a.ts || 0
                const bTs = b.createdAt?.toMillis?.() || b.createdAt || b.ts || 0
                return bTs - aTs
              })[0]
              v = {
                answer: latestAnswer.answer,
                code: latestAnswer.code,
                correct: latestAnswer.correct,
                ts: latestAnswer.createdAt?.toMillis?.() || latestAnswer.createdAt || latestAnswer.ts || 0,
              }
              dataCache.set(answersIndexCacheKey, v, 2 * 60 * 1000)
            } else {
              return null
            }
          }
        } catch (error) {
          console.error('Error fetching previous answer:', error)
          return null
        }
      }

      return typeof v === 'string' ? v : (v.answer ?? null)
    }

const parseFootballAnswer = (raw: string): { home: number; away: number } | null => {
  if (!raw) return null;
  const matches = Array.from(raw.matchAll(/(\d{1,2})\s*[-–]\s*(\d{1,2})/g));
  if (matches.length === 0) return null;
  const m = matches[matches.length - 1];
  const home = Number(m[1]);
  const away = Number(m[2]);
  if (Number.isNaN(home) || Number.isNaN(away)) return null;
  return { home, away };
};

const parseNumberGuess = (raw: string): string | null => {
  if (!raw) return null;
  const match = raw.match(/\d+/g);
  if (!match || match.length === 0) {
    const cleaned = raw.replace(/(เบอร์เงินที่ทาย|เลขที่ทาย)[:\s]*/i, '').trim();
    return cleaned || null;
  }
  return match[match.length - 1] ?? null;
};

const prettifyNumberLabel = (raw?: string | null) => {
  if (!raw) return raw ?? null;
  return raw.replace(/เลขที่ทาย/g, 'เบอร์เงินที่ทาย');
};

  // ✅ SOLD OUT popup (แบบไม่ใช้ useEffect): คำนวณเงื่อนไขและแสดงป๊อปอัปเมื่อเรนเดอร์
const showAutoSoldOut =
  !!game &&
  (game.type === 'เกมทายภาพปริศนา' || game.type === 'เกมปาร์ตี้') &&
  !needName &&                 // ต้องผ่านหน้ากรอกชื่อแล้ว
  !modal.open &&               // ถ้ามี popup อื่นเปิดอยู่ ไม่ทับ
  !autoSoldOutDismissed &&     // กดปิดไปแล้ว ไม่เด้งซ้ำ
  (() => {
    const { total, cursor, claimedBy } = getCodeState(game);
    if (total === 0) return false; // ไม่ได้ตั้งช่องโค้ด → ไม่ถือว่าหมด
    const meRaw = getCachedPlayerName() || username || '';
    const me = normalizeUser(meRaw);
    const hasMyCode = !!(me && (claimedBy?.[me]?.code || claimedBy?.[me]));
    // ถ้าโค้ดหมด และผู้เล่นรายนี้ยังไม่เคยได้โค้ด → ถือว่า sold out
    const result = cursor >= total && !hasMyCode && !soldOutGuardRef.current && !ignoreSoldOutOnce;
    return result;
  })();

  // ✅ ใช้ real-time listener สำหรับ game data (ดูโค้ดด้านบน)

  /** เปลี่ยนเกม → รีเซ็ตสถานะ */
  React.useEffect(() => {
    // ✅ ป้องกันไม่ให้ reset needName เมื่อ modal code เปิดอยู่
    if (modal.open && modal.kind === 'code') {
      return // ไม่ reset needName เมื่อกำลังแสดง popup โค้ด
    }
    
    // ✅ ป้องกันไม่ให้ reset needName ถ้า username มีค่าแล้ว (ผู้ใช้ login แล้ว)
    // เพื่อป้องกันกรณีที่ game.updatedAt เปลี่ยนหลังจาก claim code สำเร็จ
    if (username && username.trim()) {
      return // ไม่ reset needName ถ้า username มีค่าแล้ว
    }

    if (!username || !username.trim()) {
      const cached = getCachedPlayerName()
      if (cached) {
        setUsername(cached)
        setNeedName(false)
      } else {
        setUsername('')
        setNeedName(true)
      }
    }
    setExpiredShown(false)
    setRuntimeExpired(false)
  }, [id, game?.type, (game as any)?.updatedAt, modal.open, (modal as any).kind, username])

  /** ล็อกสกอลล์เมื่อมีป๊อปอัป/กรอกยูส */
  React.useEffect(() => {
    const lock = needName || modal.open
    const prev = document.body.style.overflow
    document.body.style.overflow = lock ? 'hidden' : prev || ''
    return () => { document.body.style.overflow = prev }
  }, [needName, modal.open])

  /** ฟังก์ชันช่วยเปิด popup (ให้ลูกเรียกผ่าน props) */
  const openInfo = React.useCallback((title: string, message: string) => {
    const soldOut = /โค้ด(เต็ม|หมด)|code\s*(full|out)/i.test(`${title} ${message}`)
    if (soldOut) {
      // ไม่ต้องเช็ค soldOutGuardRef สำหรับโค้ดเต็ม เพราะเป็นสถานการณ์ปกติ
      setModal({ open:true, kind:'codes-empty', title:'โค้ดเต็มแล้วค่ะ', message:'ขออภัยค่ะ โค้ดรางวัลในเกมนี้ได้ถูกแจกหมดแล้ว\n\nรอติดตามกิจกรรมรอบหน้าค่ะ!' })
      return
    }
    setModal({ open:true, kind:'info', title, message })
  }, [])

  const isLocked = (g: GameData) => (g.locked === true) || (g.unlocked === false)
  const isExpired = (g: GameData) => {
    const now = Date.now()
    // เกมบอลโลกใช้กลไกล็อกรายคู่ตามเวลา kickoff ภายในคอมโพเนนต์ — ไม่ใช้ deadline รวม
    const t = g.numberPick?.endAt ?? g.football?.endAt ?? null
    return !!(t && now > t)
  }

const expired = React.useMemo(() => (game ? isExpired(game) : false), [game?.numberPick?.endAt, game?.football?.endAt])
  const locked  = React.useMemo(() => (game ? isLocked(game)  : false), [game])
  const normalize = (s: string) => s.trim().replace(/\s+/g, '')

React.useEffect(() => {
  if (!game || game.type !== 'เกมทายผลบอล' || needName || !username.trim()) {
    setInitialFootballGuess(null);
    setLastFootballGuessText(null);
    setLastFootballGuessLoaded(false);
    footballGuessShownRef.current = false;
    return;
  }

  footballGuessShownRef.current = false;
  setLastFootballGuessText(null);
  setLastFootballGuessLoaded(false);
  const player = normalizeUser(username);
  let cancelled = false;

  (async () => {
    try {
      const prev = await getPrevAnswer(id, player);
      if (cancelled) return;
      if (!prev) {
        setInitialFootballGuess(null);
        setLastFootballGuessText(null);
        setLastFootballGuessLoaded(true);
        return;
      }

      const homeName = game?.football?.homeTeam || 'ทีมเหย้า';
      const awayName = game?.football?.awayTeam || 'ทีมเยือน';
      const parsed = parseFootballAnswer(prev);
      if (parsed) {
        setInitialFootballGuess(parsed);
        setLastFootballGuessText(`${homeName} ${parsed.home} - ${parsed.away} ${awayName}`);
        setLastFootballGuessLoaded(true);
        footballGuessShownRef.current = true;
      } else if (!footballGuessShownRef.current) {
        footballGuessShownRef.current = true;
        setInitialFootballGuess(null);
        setLastFootballGuessText(prev);
        setLastFootballGuessLoaded(true);
      }
    } catch (error) {
      console.error('Failed to load previous football guess', error);
      setLastFootballGuessLoaded(true);
    }
  })();

  return () => {
    cancelled = true;
  };
}, [buildExpiredMessage, expired, game, id, needName, setModal, username]);

React.useEffect(() => {
  if (!game || game.type !== 'เกมทายเบอร์เงิน' || needName || !username.trim()) {
    setLastNumberGuess(null);
    setLastNumberGuessLoaded(false);
    numberGuessShownRef.current = false;
    return;
  }

  numberGuessShownRef.current = false;
  setLastNumberGuess(null);
  setLastNumberGuessLoaded(false);
  const player = normalizeUser(username);
  let cancelled = false;

  (async () => {
    try {
      const prev = await getPrevAnswer(id, player);
      if (cancelled) return;
      if (!prev) {
        setLastNumberGuess(null);
        setLastNumberGuessLoaded(true);
        return;
      }
      const value = parseNumberGuess(prev) || prev;
      setLastNumberGuess(prev);
      setLastNumberGuessLoaded(true);
    } catch (error) {
      console.error('Failed to load previous number guess', error);
      setLastNumberGuessLoaded(true);
    }
  })();

  return () => {
    cancelled = true;
  };
}, [colors.primary, expired, game, id, needName, setModal, username]);

const renderModalHeader = React.useCallback(
  (title: string, tone: 'primary' | 'danger' = 'primary') => {
    if (!title) return null;
    const base =
      tone === 'danger'
        ? colors.danger ?? '#dc2626'
        : colors.primary ?? '#2563eb';
    const shadow = hexToRgba(base, 0.4);
    return (
      <div
        style={{
          background: `linear-gradient(135deg, ${hexToRgba(base, 0.95)} 0%, ${hexToRgba(base, 0.75)} 100%)`,
          color: colors.textInverse ?? '#ffffff',
          padding: '18px 20px',
          textAlign: 'center',
          fontSize: 20,
          fontWeight: 900,
          letterSpacing: 0.4,
          textTransform: 'none',
          boxShadow: `0 6px 18px ${shadow}`,
          borderRadius: '20px 20px 0 0',
        }}
      >
        {title}
      </div>
    );
  },
  [colors.danger, colors.primary, colors.textInverse]
);


  // ✅ ดึงข้อมูล user status เมื่อ username ถูกตั้งค่าแล้ว (ไม่ใช่ตอนพิมพ์)
  // ✅ เรียกแค่ตอนที่ needName = false (user login แล้ว)
  React.useEffect(() => {
    if (!username.trim() || needName) {
      setUserStatus(null)
      return
    }

    const key = normalizeUser(username)
    const fetchUserStatus = async () => {
      try {
        // ✅ ใช้ Firestore 100%
        const userData = await getUser(key)
        
        if (userData) {
          setUserStatus(userData.status || null)
        } else {
          setUserStatus(null)
        }
      } catch (error) {
        console.error('Error fetching user status:', error)
        setUserStatus(null)
      }
    }

    fetchUserStatus()
  }, [username, needName]) // ✅ เพิ่ม needName ใน dependency

  React.useEffect(() => {
    if (!game || game.type !== 'เกมประกาศรางวัล' || needName || !username.trim()) return
    if (announceBonus) return

    const key = normalizeUser(username)
    let cancelled = false

    ;(async () => {
      try {
        let has = false
        let myBonus = 0
        const useSubcollection = (game as any)?.announce?._useSubcollection === true

        if (useSubcollection && id) {
          try {
            has = await checkUserInAnnounceUsers(id, key, themeName)
            if (has) {
              const bd = await getUserBonusFromSubcollection(id, key, themeName)
              myBonus = bd?.bonus || 0
            }
          } catch {
            const list = Array.isArray((game as any)?.announce?.users) ? (game as any).announce.users : []
            const userBonuses = Array.isArray((game as any)?.announce?.userBonuses) ? (game as any).announce.userBonuses : []
            has = new Set(list.map((u: any) => normalizeUser(String(u || '')))).has(key)
            if (has) {
              const found = userBonuses.find((item: any) => normalizeUser(item.user) === key)
              myBonus = found?.bonus || 0
            }
          }
        } else {
          const list = Array.isArray((game as any)?.announce?.users) ? (game as any).announce.users : []
          const userBonuses = Array.isArray((game as any)?.announce?.userBonuses) ? (game as any).announce.userBonuses : []
          has = new Set(list.map((u: any) => normalizeUser(String(u || '')))).has(key)
          if (has) {
            const found = userBonuses.find((item: any) => normalizeUser(item.user) === key)
            myBonus = found?.bonus || 0
          }
        }

        if (cancelled) return

        if (has) {
          setAnnounceBonus({ user: key, bonus: myBonus, eligible: true })
        } else {
          const announceUserCount = await getAnnounceConditionUserCount()
          const conditionUserText = announceUserCount > 0
            ? `ยอดฝากสูงสุด ${announceUserCount.toLocaleString()} USER`
            : 'ตามเงื่อนไขที่กำหนด'
          if (!cancelled) {
            setAnnounceBonus({ user: key, bonus: 0, eligible: false, conditionText: conditionUserText })
          }
        }
      } catch (error) {
        console.error('Failed to re-check announce bonus:', error)
      }
    })()

    return () => { cancelled = true }
  }, [game, id, needName, username, announceBonus, themeName, getAnnounceConditionUserCount])

  /** เด้ง "หมดเวลาเล่น" ทันทีถ้าโหลดมาแล้วหมดเวลา */
  React.useEffect(() => {
    if (!game) return
    if (needName || !username.trim()) return
    const ready =
      game.type === 'เกมทายผลบอล'
        ? lastFootballGuessLoaded
        : game.type === 'เกมทายเบอร์เงิน'
        ? lastNumberGuessLoaded
        : true
    if (expired && !expiredShown && ready) {
      setExpiredShown(true)
      if (game.type === 'เกมทายผลบอล') {
        const homeName = game.football?.homeTeam || 'ทีมเหย้า'
        const awayName = game.football?.awayTeam || 'ทีมเยือน'
        const primaryBg = `linear-gradient(135deg, ${hexToRgba(colors.primary, 0.05)} 0%, ${hexToRgba(colors.primary, 0.18)} 100%)`
        const primaryShadow = `0 8px 22px ${hexToRgba(colors.primary, 0.25)}`
        const dangerBg = `linear-gradient(135deg, ${hexToRgba(colors.danger, 0.05)} 0%, ${hexToRgba(colors.danger, 0.18)} 100%)`
        const dangerShadow = `0 8px 22px ${hexToRgba(colors.danger, 0.25)}`
        const parsedFromText = lastFootballGuessText ? parseFootballAnswer(lastFootballGuessText) : null
        const effectiveGuess = initialFootballGuess ?? parsedFromText
        const extra = effectiveGuess
          ? {
              user: username,
              football: {
                homeName,
                awayName,
                home: effectiveGuess.home,
                away: effectiveGuess.away,
                primaryBg,
                primaryShadow,
                dangerBg,
                dangerShadow,
              },
            }
          : {
              user: username,
              answer: lastFootballGuessText || 'ยังไม่ได้ทายสกอร์ไว้ค่ะ',
            }
        setModal({
          open: true,
          kind: 'saved',
          title: 'เกมจบลงแล้ว',
          message: '',
          extra,
        })
      } else if (game.type === 'เกมทายเบอร์เงิน') {
        const primaryBg = `linear-gradient(135deg, ${hexToRgba(colors.primary, 0.05)} 0%, ${hexToRgba(colors.primary, 0.18)} 100%)`
        const primaryShadow = `0 8px 22px ${hexToRgba(colors.primary, 0.25)}`
        const value = lastNumberGuess ? parseNumberGuess(lastNumberGuess) || lastNumberGuess : 'ยังไม่ได้ทายเบอร์เงินไว้ค่ะ'
        const extra = lastNumberGuess
          ? {
              user: username,
              number: {
                value,
                label: prettifyNumberLabel(lastNumberGuess) || lastNumberGuess,
                primaryBg,
                primaryShadow,
              },
            }
          : {
              user: username,
              answer: 'ยังไม่ได้ทายเบอร์เงินไว้ค่ะ',
            }
        numberGuessShownRef.current = true
        setModal({
          open: true,
          kind: 'saved',
          title: 'เกมจบลงแล้ว',
          message: '',
          extra,
        })
      } else {
        const who = username.trim() || 'คุณ'
        const message = buildExpiredMessage(who, lastFootballGuessText || undefined)
        setModal({
          open: true,
          kind: 'info',
          title: 'เกมจบลงแล้ว',
          message,
          extra: { html: true },
        })
      }
      setRedirectOnOk('redirect')
    }
  }, [
    buildExpiredMessage,
    colors.danger,
    colors.primary,
    expired,
    expiredShown,
    game,
    initialFootballGuess,
    lastFootballGuessLoaded,
    lastFootballGuessText,
    lastNumberGuess,
    lastNumberGuessLoaded,
    needName,
    username,
  ])

  React.useEffect(() => { soldOutGuardRef.current = false; }, [id]);

  // ⛔️ ลบ useEffect ที่เด้ง "โค้ดเต็ม" อัตโนมัติเมื่อเข้าเกมทายภาพปริศนาออก (ย pr รักษาพฤติกรรมเด้งเฉพาะตอน submit)
  // (ไม่มีบล็อกนี้อีกต่อไป)

  React.useEffect(() => {
    const isCode = modal.open && modalKind === 'code';
    if (!isCode) {
      soldOutGuardRef.current = false;
      if (ignoreSoldOutOnce) setIgnoreSoldOutOnce(false);
    }
  }, [modal.open, modalKind])

  React.useEffect(() => {
    soldOutGuardRef.current = false;
    setIgnoreSoldOutOnce(false);
  }, [id])

  const openCode = React.useCallback((code: string) => {
    soldOutGuardRef.current = true       // กัน onInfo ยิงโค้ดเต็มตามมา
    setIgnoreSoldOutOnce(true)           // กัน useEffect ยิงทับในเฟรมเดียวกัน
    setModal({ open:true, kind:'code', title:'ยินดีด้วย! คำตอบถูกต้อง', message:'คุณตอบถูกแล้ว! นี่คือโค้ดรางวัลของคุณ', code })
  }, [])

  // ✅ ตรวจสอบ USER และ PASSWORD จาก Firestore
  const saveName = async () => {
  const raw = username
  const key = normalizeUser(raw)
  if (!key) return

  setCheckingName(true)
  try {
    // ✅ Validate input
    if (!key || key.trim().length === 0) {
      setModal({ 
        open: true, 
        kind: 'info', 
        title: 'กรุณากรอก USER', 
        message: 'กรุณากรอก USER ให้ถูกต้อง' 
      })
      return
    }

    // 🚫 Blacklist check
    try {
      const blocked = await isBlacklisted(key)
      if (blocked) {
        setModal({
          open: true,
          kind: 'info',
          title: '🚫 USER ถูก BLACKLIST',
          message: `USER "${raw}" ถูกระงับการใช้งาน\nไม่สามารถเข้าร่วมเกมได้\n\nหากมีข้อสงสัยกรุณาติดต่อแอดมิน`
        })
        setUsername('')
        setPassword('')
        clearCachedPlayerName()
        return
      }
    } catch (e) {
      console.error('[GamePlay] blacklist check error:', e)
    }

    // ✅ เกมเช็คอิน: ใช้ USER+PASSWORD จาก USERS_EXTRA (เดิมของคุณ)
    if (game?.type === 'เกมเช็คอิน') {
      if (!password.trim()) {
        setModal({ open: true, kind: 'info', title: 'กรอกรหัสผ่าน', message: 'กรุณากรอกรหัสผ่านให้ครบถ้วนเพื่อเข้าสู่ระบบ' })
        return
      }
      
      // ตรวจสอบสิทธิ์ USER เข้าเล่นเกม
      if (game?.userAccessType === 'selected' && game?.selectedUsers && Array.isArray(game.selectedUsers) && game.selectedUsers.length > 0) {
        const allowedUsers = game.selectedUsers.map((u: string) => normalizeUser(String(u || '')))
        const hasAccess = allowedUsers.includes(key)
        
        if (!hasAccess) {
          setModal({
            open: true,
            kind: 'info',
            title: 'ไม่มีสิทธิ์เข้าเล่น',
            message: `USER : ${key}\nไม่มีสิทธิ์เข้าเล่นเกมนี้\nเฉพาะ USER ที่เลือกไว้เท่านั้นที่สามารถเข้าเล่นได้`
          })
          setUsername('')
          setPassword('')
          clearCachedPlayerName()
          return
        }
      }
      
      // ตรวจสอบเงื่อนไขพิเศษสำหรับเกมเช็คอิน (ถ้ามีรายชื่อผู้ใช้ที่เข้าเงื่อนไข) - ตรวจสอบก่อน
      if (game?.checkin?.users && Array.isArray(game.checkin.users) && game.checkin.users.length > 0) {
        const allowedUsers = game.checkin.users.map((u: string) => normalizeUser(String(u || '')))
        const hasAccess = allowedUsers.includes(key)
        
        if (!hasAccess) {
          setModal({
            open: true,
            kind: 'info',
            title: 'ไม่เข้าเงื่อนไข',
            message: 'USER ลูกค้ายังไม่เข้าเงื่อนไขการรับค่ะ'
          })
          setUsername('')
          setPassword('')
          clearCachedPlayerName()
          return
        }
      }
      
      // ✅ ใช้ Firestore 100%
      const userData = await getUser(key)
      
      if (!userData) {
        setModal({
          open: true,
          kind: 'info',
          title: 'ไม่พบ USER ในระบบ',
          message: `ไม่พบ USER "${raw}" ในระบบ\nกรุณาตรวจสอบการสะกดและลองใหม่อีกครั้ง`
        })
        setUsername('')
        setPassword('')
        clearCachedPlayerName()
        return
      }
      
      const passInDb = String(userData.password ?? '')
      if (!passInDb || password !== passInDb) {
        setModal({ 
          open: true, 
          kind: 'info', 
          title: 'รหัสผ่านไม่ถูกต้อง', 
          message: 'รหัสผ่านที่กรอกไม่ถูกต้อง กรุณาลองใหม่อีกครั้ง',
          extra: { showCancel: true }
        })
        setPassword('')
        return
      }


      setCachedPlayerName(key)
      setUsername(key)
      setNeedName(false)
      
      return
    }

    // ✅ เกมประกาศรางวัล: ตรวจจากรายชื่อที่แนบไว้ในตัวเกม (announce.users)
    if (game?.type === 'เกมประกาศรางวัล') {
      // ตรวจสอบสิทธิ์ USER เข้าเล่นเกม
      if (game?.userAccessType === 'selected' && game?.selectedUsers && Array.isArray(game.selectedUsers) && game.selectedUsers.length > 0) {
        const allowedUsers = game.selectedUsers.map((u: string) => normalizeUser(String(u || '')))
        const hasAccess = allowedUsers.includes(key)
        
        if (!hasAccess) {
          setModal({
            open: true,
            kind: 'info',
            title: 'ไม่มีสิทธิ์เข้าเล่น',
            message: `USER : ${key}\nไม่มีสิทธิ์เข้าเล่นเกมนี้\nเฉพาะ ACTIVE USER ที่เลือกไว้เท่านั้นที่สามารถเข้าเล่นได้`
          })
          setUsername('')
          setPassword('')
          clearCachedPlayerName()
          return
        }
      }
      
        // ✅ OPTIMIZED: ตรวจสอบ user เฉพาะโดยไม่ต้องโหลดทั้งหมด (รองรับ 20000+ users)
        let has = false
        let myBonus = 0
        
        // ✅ ตรวจสอบว่ามี flag _useSubcollection หรือไม่
        const useSubcollection = (game as any)?.announce?._useSubcollection === true
        
        if (useSubcollection && id) {
          // ✅ ใช้ subcollection - query user เฉพาะ (OPTIMIZED)
          try {
            // ✅ ตรวจสอบว่า user อยู่ในรายชื่อหรือไม่ (query เฉพาะ user)
            has = await checkUserInAnnounceUsers(id, key, themeName)
            
            // ✅ ถ้า user อยู่ในรายชื่อ ให้หา bonus (query เฉพาะ user)
            if (has) {
              const bonusData = await getUserBonusFromSubcollection(id, key, themeName)
              myBonus = bonusData?.bonus || 0
            }
          } catch {
            // Fallback to document (backward compatible)
            const list = Array.isArray((game as any)?.announce?.users)
              ? (game as any).announce.users
              : []
            const userBonuses = Array.isArray((game as any)?.announce?.userBonuses)
              ? (game as any).announce.userBonuses
              : []
            
            has = new Set(list.map((u: any) => normalizeUser(String(u || '')))).has(key)
            if (has) {
              const myBonusData = userBonuses.find((item: any) => normalizeUser(item.user) === key)
              myBonus = myBonusData?.bonus || 0
            }
          }
        } else {
          // ✅ อ่านจาก document (backward compatible)
          const list = Array.isArray((game as any)?.announce?.users)
            ? (game as any).announce.users
            : []
          const userBonuses = Array.isArray((game as any)?.announce?.userBonuses)
            ? (game as any).announce.userBonuses
            : []
          
          has = new Set(list.map((u: any) => normalizeUser(String(u || '')))).has(key)
          if (has) {
            const myBonusData = userBonuses.find((item: any) => normalizeUser(item.user) === key)
            myBonus = myBonusData?.bonus || 0
          }
        }

        if (!has) {
          const announceUserCount = await getAnnounceConditionUserCount()
          const conditionUserText = announceUserCount > 0
            ? `ยอดฝากสูงสุด ${announceUserCount.toLocaleString()} USER`
            : 'ตามเงื่อนไขที่กำหนด'

          setCachedPlayerName(key)
          setUsername(key)
          setNeedName(false)
          setAnnounceBonus({ user: key, bonus: 0, eligible: false, conditionText: conditionUserText })
          return
        }

        setCachedPlayerName(key)
        setUsername(key)
        setNeedName(false)
        setAnnounceBonus({ user: key, bonus: myBonus, eligible: true })
        return
      }

    // ✅ เกมสล็อต, เกมทายภาพปริศนา, เกมทายเบอร์เงิน, เกมทายผลบอล, เกมบอลโลก, เกมลุ้นรางวัลพิเศษ, เกมลอยกระทง, เกมแนะนำเพื่อน, เกมป๊อกเด้ง: ตรวจจาก USERS_EXTRA แต่ไม่ต้องมี status ACTIVE
    if (
      game?.type === 'เกมสล็อต' ||
      game?.type === 'เกมทายภาพปริศนา' ||
      game?.type === 'เกมปาร์ตี้' ||
      game?.type === 'เกมทายเบอร์เงิน' ||
      game?.type === 'เกมทายผลบอล' ||
      game?.type === 'เกมบอลโลก' ||
      game?.type === 'เกมลุ้นรางวัลพิเศษ' ||
      game?.type === 'เกมลอยกระทง' ||
      game?.type === 'เกมแนะนำเพื่อน' ||
      game?.type === 'เกมป๊อกเด้ง'
    ) {
      // ตรวจสอบสิทธิ์ USER เข้าเล่นเกม
      if (game?.userAccessType === 'selected' && game?.selectedUsers && Array.isArray(game.selectedUsers) && game.selectedUsers.length > 0) {
        const allowedUsers = game.selectedUsers.map((u: string) => normalizeUser(String(u || '')))
        const hasAccess = allowedUsers.includes(key)
        
        if (!hasAccess) {
          setModal({
            open: true,
            kind: 'info',
            title: 'ไม่มีสิทธิ์เข้าเล่น',
            message: `USER : ${key}\nไม่มีสิทธิ์เข้าเล่นเกมนี้\nเฉพาะ ACTIVE USER ที่เลือกไว้เท่านั้นที่สามารถเข้าเล่นได้`
          })
          setUsername('')
          setPassword('')
          clearCachedPlayerName()
          return
        }
      }
      
      if (!password.trim()) {
        setModal({ 
          open: true, 
          kind: 'info', 
          title: 'กรอกรหัสผ่าน', 
          message: 'กรุณากรอกรหัสผ่านให้ครบถ้วนเพื่อเข้าสู่ระบบ' 
        })
        return
      }
      
      // ✅ ใช้ Firestore 100%
      const userData = await getUser(key)
      
      if (!userData) {
        setModal({
          open: true,
          kind: 'info',
          title: 'ไม่พบ USER ในระบบ',
          message: `ไม่พบ USER "${key}" ในระบบ\nกรุณาตรวจสอบการสะกดและลองใหม่อีกครั้ง`
        })
        setUsername('')
        setPassword('')
        clearCachedPlayerName()
        return
      }
      
      // ✅ ตรวจสอบ status (ถ้ามี) - สำหรับเกมที่ต้องการ status
      // แต่ถ้าไม่มี status field (null/undefined/empty) ก็ให้ผ่าน (รองรับ user ที่ migrate มาแล้ว)
      // ให้ผ่านถ้า: status เป็น null, undefined, '', 'ACTIVE', หรือ 'active'
      // Block ถ้า: status มีค่าแต่ไม่ใช่ 'ACTIVE' หรือ 'active' (เช่น 'inactive', 'pending', etc.)
      const status = userData.status
      if (status != null && status !== '' && status !== 'ACTIVE' && status !== 'active') {
        setModal({
          open: true,
          kind: 'info',
          title: 'ไม่สามารถเข้าร่วมกิจกรรม',
          message: `USER : ${key}\nเนื่องจาก USER ยังไม่สามารถเข้าร่วมกิจกรรมได้\nติดต่อสอบถามการเข้าร่วมที่แอดมินได้เลยค่ะ`,
          extra: { user: key }
        })
        setUsername('')
        setPassword('')
        clearCachedPlayerName()
        return
      }
      
      // ตรวจสอบรหัสผ่าน
      const passInDb = String(userData.password ?? '')
      if (!passInDb || password !== passInDb) {
        setModal({ 
          open: true, 
          kind: 'info', 
          title: 'รหัสผ่านไม่ถูกต้อง', 
          message: 'รหัสผ่านที่กรอกไม่ถูกต้อง กรุณาลองใหม่อีกครั้ง',
          extra: { showCancel: true }
        })
        setPassword('')
        return
      }

      setCachedPlayerName(key)
      setUsername(key)
      setNeedName(false)
      return
    }

    // ✅ Fallback: สำหรับเกมประเภทอื่นๆ ที่ยังไม่ได้ handle
    // ตรวจสอบสิทธิ์ USER เข้าเล่นเกม
    if (game?.userAccessType === 'selected' && game?.selectedUsers && Array.isArray(game.selectedUsers) && game.selectedUsers.length > 0) {
      const allowedUsers = game.selectedUsers.map((u: string) => normalizeUser(String(u || '')))
      const hasAccess = allowedUsers.includes(key)
      
      if (!hasAccess) {
        setModal({
          open: true,
          kind: 'info',
          title: 'ไม่มีสิทธิ์เข้าเล่น',
          message: `USER : ${key}\nไม่มีสิทธิ์เข้าเล่นเกมนี้\nเฉพาะ USER ที่เลือกไว้เท่านั้นที่สามารถเข้าเล่นได้`
        })
        setUsername('')
        clearCachedPlayerName()
        return
      }
    }
    
      // ✅ ใช้ Firestore 100%
    const userData = await getUser(key)
    
    if (!userData) {
      setModal({ 
        open: true, 
        kind: 'info', 
        title: 'ไม่พบ USER ในระบบ', 
        message: `ไม่พบ USER "${raw}" ในระบบ\nกรุณาตรวจสอบการสะกดและลองใหม่อีกครั้ง` 
      })
      setUsername('')
      setPassword('')
      clearCachedPlayerName()
      return
    }

    // ✅ ตรวจสอบรหัสผ่าน
    if (!password.trim()) {
      setModal({ 
        open: true, 
        kind: 'info', 
        title: 'กรอกรหัสผ่าน', 
        message: 'กรุณากรอกรหัสผ่านให้ครบถ้วนเพื่อเข้าสู่ระบบ' 
      })
      return
    }
    
    const passInDb = String(userData.password ?? '')
    if (!passInDb || password !== passInDb) {
      setModal({ 
        open: true, 
        kind: 'info', 
        title: 'รหัสผ่านไม่ถูกต้อง', 
        message: 'รหัสผ่านที่กรอกไม่ถูกต้อง กรุณาลองใหม่อีกครั้ง',
        extra: { showCancel: true }
      })
      setPassword('')
      return
    }

    // ✅ เช็คซ้ำว่าเคยตอบแล้วไหม - ใช้ Firestore
    // เกมปาร์ตี้แบบหลายรอบ (มี ?round=R1/R2/...) ต้องแยกรอบ จึงไม่บล็อกจากรอบก่อนหน้า
    const isPartyRoundMode = !!requestedRound && game?.type === 'เกมปาร์ตี้'
    const shouldCheckDuplicate =
      !!game &&
      !isPartyRoundMode &&
      !['เกมสล็อต', 'เกมทายผลบอล', 'เกมบอลโลก', 'เกมทายเบอร์เงิน', 'เกมทายภาพปริศนา', 'เกมปาร์ตี้'].includes(game.type)
    if (shouldCheckDuplicate) {
      const answersIndexCacheKey = `answersIndex:${game!.id}:${key}`
      let dupData = dataCache.get<any>(answersIndexCacheKey)
      
      if (!dupData) {
        try {
          const answers = await getAnswers(game!.id, 100)
          const playerAnswers = answers.filter((a: any) => a.userId === key)
          if (playerAnswers.length > 0) {
            const latestAnswer = playerAnswers.sort((a: any, b: any) => 
              (b.ts || 0) - (a.ts || 0)
            )[0]
            dupData = {
              answer: latestAnswer.answer,
              ts: latestAnswer.ts
            }
            // Cache ไว้ 2 นาที
            dataCache.set(answersIndexCacheKey, dupData, 2 * 60 * 1000)
          }
        } catch (error) {
          console.error('Error checking duplicate answer:', error)
        }
      }
      
      if (dupData) {
        setNeedName(false)
        setRedirectOnOk('redirect')
        setModal({ 
          open: true, 
          kind: 'info', 
          title: 'แจ้งเตือน', 
          message: 'ยูสเซอร์นี้ได้ทำการตอบคำถามของวันนี้ไปแล้วค่ะ\n\nรอติดตามกิจกรรมในวันถัดไปนะคะ!' 
        })
        setUsername('')
        setPassword('')
        clearCachedPlayerName()
        return
      }
    }

    // ✅ Login สำเร็จ
    setCachedPlayerName(key)
    setUsername(key)
    setPassword('') // ✅ Clear password after successful login
    setNeedName(false)
  } catch (error) {
    console.error('Error in saveName:', error)
    setModal({
      open: true,
      kind: 'info',
      title: 'เกิดข้อผิดพลาด',
      message: error instanceof Error 
        ? `เกิดข้อผิดพลาด: ${error.message}\nกรุณาลองใหม่อีกครั้ง`
        : 'เกิดข้อผิดพลาดในการตรวจสอบข้อมูล\nกรุณาลองใหม่อีกครั้ง'
    })
  } finally {
    setCheckingName(false)
  }
}




  /** helper ตอนลูกแจ้งว่าเวลาหมด */
  const handleExpire = React.useCallback(() => {
    if (runtimeExpired) return
    setRuntimeExpired(true)
    setNeedName(false)
    setModal({
      open: true,
      kind: 'info',
      title: 'หมดเวลาเล่น',
      message: 'เกินกำหนดเวลาที่ตั้งไว้แล้ว',
    })
    setRedirectOnOk('redirect')   // ⬅️ ให้ปุ่ม "ตกลง" ใช้ goHeng36
  }, [runtimeExpired])

  // ======= ฟังก์ชันส่งคำตอบ =======

  /** เกมทายเบอร์เงิน (NumberGame) */
 const submitNumberAnswer = async (ansText: string) => {
  if (!game) return;
  if (needName || !username.trim()) { openInfo('ต้องใส่ชื่อก่อนเล่น', 'กรุณากรอกชื่อผู้เล่นเพื่อเริ่มเล่นเกม'); setNeedName(true); return; }
  if (isLocked(game)) { openInfo('ยังไม่เปิดให้เล่น', 'เกมนี้ยังถูกล็อกอยู่ โปรดติดต่อแอดมิน'); return; }
  if (runtimeExpired || (game.numberPick?.endAt && Date.now() > game.numberPick.endAt)) { 
    setModal({ open: true, kind: 'info', title: 'หมดเวลาเล่น', message: 'เกินกำหนดเวลาที่ตั้งไว้แล้ว' })
    setRedirectOnOk('redirect')
    return; 
  }

  const player = normalizeUser(username);
  const v = ansText.trim();
  if (!v) { openInfo('กรอกคำตอบก่อน', 'โปรดพิมพ์คำตอบของคุณ'); return; }

  // เช็คคำตอบเดิมของยูสนี้ก่อน
  const prev = await getPrevAnswer(id, player);
  const newHuman = `เบอร์เงินที่ทาย: ${v}`;

  if (prev && prev !== newHuman) {
    // เปิด confirm modal ให้ยืนยันว่าจะทับค่าหรือไม่
    setModal({
      open: true,
      kind: 'confirm-replace',
      title: 'เปลี่ยนคำตอบ',
      message: '',
      oldLabel: 'คำตอบเดิม',
      oldValue: String(prev),
      newLabel: 'คำตอบใหม่',
      newValue: newHuman,
      onConfirm: async () => {
        setSubmitting(true);
        try {
          const ts = Date.now();
          
          // ✅ ดึงคำตอบเดิมของยูสนี้จาก Firestore
          let oldAnswer = null;
          try {
            const answersIndexCacheKey = `answersIndex:${id}:${player}`
            let oldAnswerData = dataCache.get<any>(answersIndexCacheKey)
            
            if (!oldAnswerData) {
              const answers = await getAnswers(id, 100)
              const playerAnswers = answers.filter((a: any) => a.userId === player)
              if (playerAnswers.length > 0) {
                const latestAnswer = playerAnswers.sort((a: any, b: any) => 
                  (b.ts || 0) - (a.ts || 0)
                )[0]
                oldAnswerData = {
                  answer: latestAnswer.answer,
                  ts: latestAnswer.ts
                }
                // Cache ไว้ 2 นาที
                dataCache.set(answersIndexCacheKey, oldAnswerData, 2 * 60 * 1000)
              }
            }
            
            if (oldAnswerData) {
              oldAnswer = oldAnswerData?.answer || null
            }
          } catch (error) {
            console.error('Error fetching previous answer:', error)
          }
          
          // ✅ บันทึกคำตอบใหม่ผ่าน Firestore
          const result = await submitAnswer(id, player, { answer: newHuman, correct: false });
          
          const primaryBg = `linear-gradient(135deg, ${hexToRgba(colors.primary, 0.05)} 0%, ${hexToRgba(colors.primary, 0.18)} 100%)`;
          const primaryShadow = `0 8px 22px ${hexToRgba(colors.primary, 0.25)}`;
          const numberValue = parseNumberGuess(newHuman) || v;
          const oldAnswerDisplay = oldAnswer ? prettifyNumberLabel(oldAnswer) : oldAnswer;
          setLastNumberGuess(newHuman);
          setLastNumberGuessLoaded(true);
          numberGuessShownRef.current = true;
          setModal({
            open: true,
            kind: 'saved',
            title: 'คุณได้เลือกคำตอบใหม่แล้ว',
      message: `ยูสเซอร์: ${username}\n\nกรุณาแคปหน้านี้ไว้เป็นหลักฐาน`,
            extra: { 
              user: username, 
              answer: newHuman,
              oldAnswer: oldAnswerDisplay, // เพิ่มเบอร์เงินเดิม
              newAnswer: newHuman,   // เพิ่มเบอร์เงินใหม่
              number: {
                value: numberValue,
                label: prettifyNumberLabel(newHuman) || newHuman,
                primaryBg,
                primaryShadow,
              },
              actions: {
                showRetake: true,
                onRetake: () => setModal({ open: false }),
              },
            },
          });
        } catch (error) {
          console.error('[submitNumberAnswer] Error submitting answer (replace):', error);
          const errorMessage = error instanceof Error ? error.message : 'เกิดข้อผิดพลาดในการบันทึกคำตอบ';
          openInfo('เกิดข้อผิดพลาด', `ไม่สามารถบันทึกคำตอบได้: ${errorMessage}\n\nกรุณาลองใหม่อีกครั้ง`);
        } finally {
          setSubmitting(false);
        }
      },
    });
    return;
  }

  // ✅ ไม่มีคำตอบเดิม หรือเหมือนเดิม → บันทึกผ่าน Firestore
  setSubmitting(true);
  try {
    const result = await submitAnswer(id, player, { answer: newHuman, correct: false });
    
    const primaryBg = `linear-gradient(135deg, ${hexToRgba(colors.primary, 0.05)} 0%, ${hexToRgba(colors.primary, 0.18)} 100%)`;
    const primaryShadow = `0 8px 22px ${hexToRgba(colors.primary, 0.25)}`;
    const numberValue = parseNumberGuess(newHuman) || v;
    setLastNumberGuess(newHuman);
    setLastNumberGuessLoaded(true);
    numberGuessShownRef.current = true;
    setModal({
      open: true,
      kind: 'saved',
      title: 'คุณได้เลือกคำตอบใหม่แล้ว',
      message: `ยูสเซอร์: ${username}\nคำตอบที่เลือก: ${newHuman}\n\nกรุณาแคปหน้านี้ไว้เป็นหลักฐาน`,
      extra: { 
        user: username, 
        answer: newHuman,
        number: {
          value: numberValue,
          label: prettifyNumberLabel(newHuman) || newHuman,
          primaryBg,
          primaryShadow,
        },
        actions: {
          showRetake: true,
          onRetake: () => setModal({ open: false }),
        },
      },
    });
  } catch (error) {
    console.error('[submitNumberAnswer] Error submitting answer:', error);
    const errorMessage = error instanceof Error ? error.message : 'เกิดข้อผิดพลาดในการบันทึกคำตอบ';
    openInfo('เกิดข้อผิดพลาด', `ไม่สามารถบันทึกคำตอบได้: ${errorMessage}\n\nกรุณาลองใหม่อีกครั้ง`);
  } finally {
    setSubmitting(false);
  }
};


  /** เกมทายผลบอล (FootballGame) — รับคะแนนจากลูกแล้วบันทึกที่นี่ */
const submitFootballFromChild = async (home: number, away: number) => {
  if (!game) {
    return;
  }
  
  if (needName || !username.trim()) { 
    openInfo('ต้องใส่ชื่อก่อนเล่น', 'กรุณากรอกชื่อผู้เล่นเพื่อเริ่มเล่นเกม'); 
    setNeedName(true); 
    return; 
  }
  
  if (isLocked(game)) { 
    openInfo('ยังไม่เปิดให้เล่น', 'เกมนี้ยังถูกล็อกอยู่ โปรดติดต่อแอดมิน'); 
    return; 
  }
  
  if (runtimeExpired || (game.football?.endAt && Date.now() > game.football.endAt)) { 
    setModal({ open: true, kind: 'info', title: 'หมดเวลาเล่น', message: 'เกินกำหนดเวลาที่ตั้งไว้แล้ว' })
    setRedirectOnOk('redirect')
    return; 
  }

  const h = Math.floor(home), a = Math.floor(away);
  if (h < 0 || h > 99 || a < 0 || a > 99 || Number.isNaN(h) || Number.isNaN(a)) {
    openInfo('กรอกสกอร์ไม่ถูกต้อง', 'โปรดกรอกสกอร์ของทั้งสองทีมเป็นตัวเลข 0–99');
    return;
  }

  const player = normalizeUser(username);
  const hName = game.football?.homeTeam || 'ทีมเหย้า';
  const aName = game.football?.awayTeam || 'ทีมเยือน';
  const human = `${hName} ${h} - ${a} ${aName}`;
  const primaryBgGradient = `linear-gradient(135deg, ${hexToRgba(colors.primary, 0.05)} 0%, ${hexToRgba(colors.primary, 0.2)} 100%)`;
  const primaryShadow = `0 8px 22px ${hexToRgba(colors.primary, 0.25)}`;
  const dangerBgGradient = `linear-gradient(135deg, ${hexToRgba(colors.danger, 0.05)} 0%, ${hexToRgba(colors.danger, 0.2)} 100%)`;
  const dangerShadow = `0 8px 22px ${hexToRgba(colors.danger, 0.25)}`;

  // เช็คคำตอบเดิมของยูสนี้ก่อน
  try {
    const prev = await getPrevAnswer(id, player);
    
    if (prev && prev !== human) {
      setModal({
        open: true,
        kind: 'confirm-replace',
        title: 'เปลี่ยนสกอร์',
        message: '',
        oldLabel: 'สกอร์เดิม',
        oldValue: String(prev),
        newLabel: 'สกอร์ใหม่',
        newValue: human,
        onConfirm: async () => {
          setSubmitting(true);
          try {
            // ✅ บันทึกคำตอบใหม่ผ่าน Firestore
            await submitAnswer(id, player, { answer: human, correct: false })
            // ✅ เคลียร์ cache เพื่อให้โหลดคำตอบใหม่ถูกต้องทันที
            dataCache.delete(`answersIndex:${id}:${player}`);
            dataCache.delete(`answers:${id}:100`);
            setInitialFootballGuess({ home: h, away: a });
            setLastFootballGuessText(human);
            setLastFootballGuessLoaded(true);
            footballGuessShownRef.current = true;
            
            setModal({
              open: true,
              kind: 'saved',
              title: 'คุณอัปเดตสกอร์เรียบร้อย',
              message: '',
              extra: { 
                user: username, 
                football: { homeName: hName, awayName: aName, home: h, away: a, primaryBg: primaryBgGradient, primaryShadow, dangerBg: dangerBgGradient, dangerShadow },
                oldAnswer: prev,  // เพิ่มคำตอบเก่า
                newAnswer: human  // เพิ่มคำตอบใหม่
              },
            });
          } catch (error) {
            console.error('[submitFootballFromChild] Error submitting answer (replacement):', error);
            openInfo('เกิดข้อผิดพลาด', 'ไม่สามารถบันทึกสกอร์ได้ กรุณาลองใหม่อีกครั้ง');
          } finally {
            setSubmitting(false);
          }
        },
      });
      return;
    }
  } catch (error) {
    console.error('[submitFootballFromChild] Error getting previous answer:', error);
    // ต่อเนื่องไปยังการบันทึกคำตอบใหม่แม้ว่าจะ check previous answer ไม่ได้
  }

  // ✅ ไม่มีคำตอบเดิม หรือเหมือนเดิม → บันทึกผ่าน Firestore
  setSubmitting(true);
  try {
    await submitAnswer(id, player, { answer: human, correct: false })
    // ✅ เคลียร์ cache เพื่อให้โหลดคำตอบใหม่ถูกต้องทันที
    dataCache.delete(`answersIndex:${id}:${player}`);
    dataCache.delete(`answers:${id}:100`);
    setInitialFootballGuess({ home: h, away: a });
    setLastFootballGuessText(human);
    setLastFootballGuessLoaded(true);
    footballGuessShownRef.current = true;
    setModal({
      open: true,
      kind: 'saved',
      title: 'คุณส่งสกอร์เรียบร้อย',
      message: '',
      extra: {
        user: username,
        football: { homeName: hName, awayName: aName, home: h, away: a, primaryBg: primaryBgGradient, primaryShadow, dangerBg: dangerBgGradient, dangerShadow },
        actions: {
          showRetake: true,
          onRetake: () => setModal({ open: false }),
        },
      },
    });
  } catch (error) {
    console.error('[submitFootballFromChild] Error submitting answer (new):', error);
    openInfo('เกิดข้อผิดพลาด', 'ไม่สามารถบันทึกสกอร์ได้ กรุณาลองใหม่อีกครั้ง');
  } finally {
    setSubmitting(false);
  }
};

  // ---------- UI ----------
  if (!id)      return <div className="checkin-wrap checkin-wrap--modern"><div className="checkin-loading">ไม่พบบัตรเกม</div></div>
  if (loading)  return <div className="checkin-wrap checkin-wrap--modern"><div className="checkin-loading">กำลังโหลดเกม…</div></div>
  if (!game)    return <div className="checkin-wrap checkin-wrap--modern"><div className="checkin-loading">ไม่พบเกมนี้</div></div>

  // Get image URL with debug logging
  // ✅ รองรับทั้ง nested (gameData.puzzle) และ flat (puzzle) structure
  const gameData = (game as any).gameData || {}
  const puzzle = game.puzzle || gameData.puzzle
  const numberPick = game.numberPick || gameData.numberPick
  const football = game.football || gameData.football
  
  const imageDataUrl = puzzle?.imageDataUrl ||
    numberPick?.imageDataUrl ||
    football?.imageDataUrl ||
    ''
  
  // ✅ ตรวจสอบว่า imageDataUrl ไม่ว่างก่อนเรียก getImageUrl
  const img = imageDataUrl ? getImageUrl(imageDataUrl) : ''

  const renderGlobalModal = () => {
    if (!modal.open) return null;
    const { accentColor, headline, body, bodyStrong, caption, highlightBox } = modalTextStyles;
    return (
      <Overlay key="modal-popup" onClose={undefined /* บล็อกคลิกนอก popup */}>
        <div className={`modal modal-centered modal--auth ${
          modalKind === 'code' ? 'modal--code' :
          modalKind === 'info' ? 'modal--info' :
          modalKind === 'codes-empty' ? 'modal--warning' :
          'modal--info'
        }`} onClick={(e)=>e.stopPropagation()} style={{ padding: 0, overflow: 'hidden', borderRadius: 20 }}>

          {modal.kind === 'code' ? (
            <div style={{ padding: '28px 24px', display: 'flex', flexDirection: 'column', gap: 20, background: '#fff' }}>
              <div style={{ textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16 }}>
                <div style={{
                  width: 60, height: 60, borderRadius: 16,
                  background: `linear-gradient(135deg, ${hexToRgba(accentColor, 0.1)} 0%, ${hexToRgba(accentColor, 0.2)} 100%)`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  boxShadow: `0 4px 14px ${hexToRgba(accentColor, 0.2)}`,
                }}>
                  <Gift size={28} color={accentColor} />
                </div>
                <div style={{ fontSize: 14, fontWeight: 600, color: '#6b7280' }}>
                  ยินดีด้วยค่ะ! นี่คือโค้ดของคุณ
                </div>
                <div
                  aria-label="โค้ดของคุณ"
                  style={{
                    width: '100%',
                    fontSize: clampSize(22, 5, 30),
                    fontWeight: 900,
                    letterSpacing: clampSize(2, 1, 4),
                    color: accentColor,
                    background: `linear-gradient(135deg, ${hexToRgba(accentColor, 0.06)} 0%, ${hexToRgba(accentColor, 0.14)} 100%)`,
                    borderRadius: 16,
                    padding: '20px 24px',
                    border: `1.5px solid ${hexToRgba(accentColor, 0.2)}`,
                  }}
                >
                  {modal.code}
                </div>
                <div style={{
                  width: '100%', padding: '10px 14px', borderRadius: 12,
                  background: '#f8fafc', border: '1px solid #e5e7eb',
                  fontSize: 12, fontWeight: 500, color: '#9ca3af', textAlign: 'center',
                }}>
                  คัดลอกโค้ดแล้วนำไปกรอกที่เว็บไซต์เพื่อรับรางวัลนะคะ
                </div>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <button
                  onClick={async () => {
                    try {
                      await navigator.clipboard.writeText(modal.code || '');
                      setCopied(true);
                      setTimeout(() => setCopied(false), 1200);
                    } catch {}
                  }}
                  style={{
                    width: '100%', padding: '13px 0',
                    borderRadius: 14, cursor: 'pointer',
                    border: `1.5px solid ${hexToRgba(accentColor, 0.25)}`,
                    background: hexToRgba(accentColor, 0.06),
                    color: accentColor, fontSize: 15, fontWeight: 700,
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                    transition: 'all 0.2s ease',
                  }}
                >
                  {copied ? <CheckCircle2 size={16} /> : <Copy size={16} />}
                  {copied ? 'คัดลอกแล้ว' : 'คัดลอกโค้ด'}
                </button>

                <button
                  onClick={(e) => {
                    e.preventDefault()
                    e.stopPropagation()
                    goHeng36()
                  }}
                  style={{
                    width: '100%', padding: '14px 0',
                    borderRadius: 14, border: 'none', cursor: 'pointer',
                    background: `linear-gradient(135deg, ${colors.primary} 0%, ${colors.secondary || colors.primary} 100%)`,
                    color: '#fff', fontSize: 15, fontWeight: 700,
                    boxShadow: `0 4px 14px ${hexToRgba(colors.primary, 0.3)}`,
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                  }}
                >
                  <ExternalLink size={16} />
                  ไปกรอกโค้ด {getThemeDisplayName()}
                </button>
              </div>
            </div>
          ) : modal.kind === 'saved' ? (
            <div style={{ padding: '28px 24px', background: '#fff' }}>
              <div style={{ textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16 }}>
                <div style={{
                  width: 60, height: 60, borderRadius: 16,
                  background: `linear-gradient(135deg, ${hexToRgba(colors.primary, 0.1)} 0%, ${hexToRgba(colors.primary, 0.2)} 100%)`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  boxShadow: `0 4px 14px ${hexToRgba(colors.primary, 0.15)}`,
                }}>
                  <CheckCircle2 size={28} color={colors.primary} />
                </div>

                {'extra' in modal && modal.extra?.user && (
                  <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '6px 16px', borderRadius: 999, background: hexToRgba(colors.primary, 0.08) }}>
                    <User size={14} color={colors.primary} />
                    <span style={{ fontSize: 13, fontWeight: 700, color: colors.primary }}>{modal.extra.user || username}</span>
                  </div>
                )}

                {modal.extra?.football ? (() => {
                  const foot = modal.extra.football;
                  return (
                    <div style={{ width: '100%' }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 20, margin: '4px 0 16px' }}>
                        <div style={{ textAlign: 'center' }}>
                          <div style={{ fontSize: 11, fontWeight: 700, color: '#6b7280', marginBottom: 6 }}>{foot.homeName}</div>
                          <div style={{
                            width: 56, height: 56, borderRadius: 14, display: 'flex', alignItems: 'center', justifyContent: 'center',
                            fontSize: 26, fontWeight: 900, color: colors.primary,
                            background: hexToRgba(colors.primary, 0.08), border: `2px solid ${hexToRgba(colors.primary, 0.2)}`,
                          }}>{foot.home}</div>
                        </div>
                        <div style={{ fontSize: 22, fontWeight: 900, color: '#d1d5db' }}>:</div>
                        <div style={{ textAlign: 'center' }}>
                          <div style={{ fontSize: 11, fontWeight: 700, color: '#6b7280', marginBottom: 6 }}>{foot.awayName}</div>
                          <div style={{
                            width: 56, height: 56, borderRadius: 14, display: 'flex', alignItems: 'center', justifyContent: 'center',
                            fontSize: 26, fontWeight: 900, color: colors.danger ?? '#ef4444',
                            background: hexToRgba(colors.danger ?? '#ef4444', 0.08), border: `2px solid ${hexToRgba(colors.danger ?? '#ef4444', 0.2)}`,
                          }}>{foot.away}</div>
                        </div>
                      </div>
                      {modal.extra?.oldAnswer && modal.extra?.newAnswer && (
                        <div style={{ display: 'flex', alignItems: 'stretch', gap: 0, borderRadius: 12, overflow: 'hidden', border: '1px solid #e5e7eb' }}>
                          <div style={{ flex: 1, padding: '10px 14px', background: '#fff', textAlign: 'center' }}>
                            <div style={{ fontSize: 10, fontWeight: 600, color: '#9ca3af', marginBottom: 4, textTransform: 'uppercase', letterSpacing: 0.5 }}>สกอร์เดิม</div>
                            <div style={{ fontSize: 13, fontWeight: 800, color: '#9ca3af', textDecoration: 'line-through' }}>{modal.extra.oldAnswer}</div>
                          </div>
                          <div style={{ width: 1, background: '#e5e7eb' }} />
                          <div style={{ flex: 1, padding: '10px 14px', background: hexToRgba(colors.primary, 0.04), textAlign: 'center' }}>
                            <div style={{ fontSize: 10, fontWeight: 600, color: colors.primary, marginBottom: 4, textTransform: 'uppercase', letterSpacing: 0.5 }}>สกอร์ใหม่</div>
                            <div style={{ fontSize: 13, fontWeight: 800, color: colors.primary }}>{modal.extra.newAnswer}</div>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })() : modal.extra?.number ? (() => {
                  const num = modal.extra.number;
                  return (
                    <div>
                      <div style={{ fontSize: 12, fontWeight: 600, color: '#9ca3af', marginBottom: 8 }}>เบอร์เงินที่ทาย</div>
                      <div style={{
                        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                        padding: '14px 32px', borderRadius: 16,
                        background: hexToRgba(colors.primary, 0.06), border: `1.5px solid ${hexToRgba(colors.primary, 0.18)}`,
                      }}>
                        <span style={{ fontSize: 36, fontWeight: 900, letterSpacing: 8, color: colors.primary }}>{num.value}</span>
                      </div>
                      {num.label && (
                        <div style={{ marginTop: 10, fontSize: 13, fontWeight: 600, color: '#6b7280' }}>{num.label}</div>
                      )}
                    </div>
                  );
                })() : modal.extra?.actions?.html ? (
                  <div
                    style={{ fontSize: 14, fontWeight: 500, color: '#4b5563', padding: '0 4px', textAlign: 'left', lineHeight: 1.7 }}
                    dangerouslySetInnerHTML={{ __html: modal.message ?? '' }}
                  />
                ) : modal.extra?.answer ? (
                  <div style={{
                    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                    padding: '12px 22px', borderRadius: 14,
                    background: hexToRgba(colors.primary, 0.06),
                    border: `1.5px solid ${hexToRgba(colors.primary, 0.18)}`,
                    fontSize: 16, fontWeight: 800, color: colors.primary, textAlign: 'center',
                  }}>
                    {modal.extra.answer}
                  </div>
                ) : modal.message ? (
                  <div style={{ fontSize: 15, fontWeight: 600, color: '#374151', whiteSpace: 'pre-line', textAlign: 'center', lineHeight: 1.6 }}>
                    {modal.message}
                  </div>
                ) : null}

                <div style={{
                  width: '100%', padding: '10px 14px', borderRadius: 12,
                  background: '#f8fafc', border: '1px solid #e5e7eb',
                  fontSize: 12, fontWeight: 500, color: '#9ca3af', textAlign: 'center',
                }}>
                  กรุณาแคปหน้าจอไว้เป็นหลักฐาน
                </div>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 20 }}>
                {'extra' in modal && modal.extra?.actions?.showRetake && !expired && !runtimeExpired && (
                  <button
                    onClick={() => { setModal({ open: false }); modal.extra?.actions?.onRetake?.() }}
                    style={{
                      width: '100%', padding: '13px 0',
                      borderRadius: 14, cursor: 'pointer',
                      border: '1.5px solid #e5e7eb', background: '#fff',
                      color: '#6b7280', fontSize: 15, fontWeight: 600,
                      display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                    }}
                  >
                    ทายใหม่
                  </button>
                )}
                <button
                  onClick={goHeng36}
                  style={{
                    width: '100%', padding: '14px 0',
                    borderRadius: 14, border: 'none', cursor: 'pointer',
                    background: `linear-gradient(135deg, ${colors.primary} 0%, ${colors.secondary || colors.primary} 100%)`,
                    color: '#fff', fontSize: 15, fontWeight: 700,
                    boxShadow: `0 4px 14px ${hexToRgba(colors.primary, 0.3)}`,
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                  }}
                >
                  <ExternalLink size={16} />
                  {goButtonLabel}
                </button>
              </div>
            </div>
          ) : modal.kind === 'confirm-replace' ? (
            <div style={{ padding: '28px 24px', background: '#fff' }}>
              <div style={{ textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16 }}>
                <div style={{
                  width: 60, height: 60, borderRadius: 16,
                  background: `linear-gradient(135deg, #fef3c7 0%, #fde68a 100%)`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  boxShadow: '0 4px 14px rgba(245,158,11,0.15)',
                }}>
                  <AlertTriangle size={28} color="#f59e0b" />
                </div>
                <div style={{ fontSize: 16, fontWeight: 800, color: '#1f2937' }}>
                  ต้องการเปลี่ยนคำตอบใหม่หรือไม่?
                </div>
                <div style={{ width: '100%', display: 'flex', alignItems: 'stretch', gap: 0, borderRadius: 14, overflow: 'hidden', border: '1.5px solid #e5e7eb' }}>
                  <div style={{ flex: 1, padding: '14px 16px', background: '#fafafa', textAlign: 'center' }}>
                    <div style={{ fontSize: 11, fontWeight: 600, color: '#9ca3af', marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.5 }}>{modal.oldLabel}</div>
                    <div style={{ fontSize: clampSize(14, 2.2, 17), fontWeight: 800, color: '#9ca3af', textDecoration: 'line-through', textDecorationColor: '#d1d5db' }}>{modal.oldValue}</div>
                  </div>
                  <div style={{ width: 1, background: '#e5e7eb', flexShrink: 0 }} />
                  <div style={{ flex: 1, padding: '14px 16px', background: hexToRgba(colors.primary, 0.04), textAlign: 'center' }}>
                    <div style={{ fontSize: 11, fontWeight: 600, color: colors.primary, marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.5 }}>{modal.newLabel}</div>
                    <div style={{ fontSize: clampSize(14, 2.2, 17), fontWeight: 800, color: colors.primary }}>{modal.newValue}</div>
                  </div>
                </div>
              </div>
              <div style={{ display: 'flex', gap: 10, marginTop: 20 }}>
                <button
                  onClick={() => setModal({ open: false })}
                  style={{
                    flex: 1, padding: '13px 0',
                    borderRadius: 14, cursor: 'pointer',
                    border: '1.5px solid #e5e7eb', background: '#fff',
                    color: '#6b7280', fontWeight: 600, fontSize: 15,
                  }}
                >
                  ยกเลิก
                </button>
                <button
                  onClick={() => { setModal({ open: false }); modal.onConfirm?.() }}
                  style={{
                    flex: 1, padding: '13px 0',
                    borderRadius: 14, border: 'none', cursor: 'pointer',
                    background: `linear-gradient(135deg, ${colors.primary} 0%, ${colors.secondary || colors.primary} 100%)`,
                    color: '#fff', fontWeight: 700, fontSize: 15,
                    boxShadow: `0 4px 14px ${hexToRgba(colors.primary, 0.3)}`,
                  }}
                >
                  ยืนยัน
                </button>
              </div>
            </div>
          ) : modal.kind === 'codes-empty' ? (
            <div style={{ padding: '28px 24px', background: '#fff' }}>
              <div style={{ textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16 }}>
                <div style={{
                  width: 60, height: 60, borderRadius: 16,
                  background: 'linear-gradient(135deg, #fef2f2 0%, #fee2e2 100%)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  boxShadow: '0 4px 14px rgba(239,68,68,0.15)',
                }}>
                  <XCircle size={30} color="#ef4444" />
                </div>
                <div>
                  <div style={{ fontSize: 18, fontWeight: 800, color: '#1f2937', marginBottom: 6 }}>
                    โค้ดเต็มแล้วค่ะ
                  </div>
                  <div style={{ fontSize: 14, color: '#6b7280', fontWeight: 500, lineHeight: 1.6 }}>
                    ขออภัยด้วยนะคะ โค้ดรางวัลหมดแล้ว
                  </div>
                </div>
                <div style={{
                  width: '100%', padding: '10px 16px', borderRadius: 12,
                  background: '#f8fafc', border: '1px solid #e5e7eb',
                  fontSize: 12, fontWeight: 500, color: '#9ca3af', textAlign: 'center',
                }}>
                  แอดมินจะรีเซ็ตโค้ดรางวัลในรอบถัดไปนะคะ
                </div>
              </div>
              <button
                onClick={goHeng36}
                style={{
                  width: '100%', marginTop: 20, padding: '14px 0',
                  borderRadius: 14, border: 'none', cursor: 'pointer',
                  background: `linear-gradient(135deg, ${colors.primary} 0%, ${colors.secondary || colors.primary} 100%)`,
                  color: '#fff', fontSize: 15, fontWeight: 700,
                  boxShadow: `0 4px 14px ${hexToRgba(colors.primary, 0.3)}`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                }}
              >
                <ExternalLink size={16} />
                {goButtonLabel}
              </button>
            </div>
          ) : (
            <div style={{ padding: '28px 24px', background: '#fff' }}>
              <div style={{ textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16 }}>
                {(() => {
                  const msg = 'message' in modal ? modal.message || '' : ''
                  const isWarning = /ไม่พบ|ไม่มี|ไม่ได้|ไม่ถูก|ถูก.*ระงับ|blacklist|เล่น.*แล้ว|ทำการ.*แล้ว/i.test(msg + (modal.title || ''))
                  const isAlready = /เล่น.*แล้ว|ทำการ.*แล้ว|เคย.*แล้ว/i.test(msg + (modal.title || ''))
                  const iconBg = isWarning
                    ? 'linear-gradient(135deg, #fef3c7 0%, #fde68a 100%)'
                    : `linear-gradient(135deg, ${hexToRgba(colors.primary, 0.08)} 0%, ${hexToRgba(colors.primary, 0.18)} 100%)`
                  const iconColor = isWarning ? '#f59e0b' : colors.primary
                  const IconComp = isAlready ? Clock : isWarning ? AlertTriangle : Sparkles
                  return (
                    <>
                      <div style={{
                        width: 60, height: 60, borderRadius: 16,
                        background: iconBg,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        boxShadow: `0 4px 14px ${hexToRgba(iconColor, 0.15)}`,
                      }}>
                        <IconComp size={30} color={iconColor} />
                      </div>
                      {modal.title && (
                        <div style={{ fontSize: 18, fontWeight: 800, color: '#1f2937' }}>
                          {modal.title}
                        </div>
                      )}
                      <div 
                        style={{ fontSize: 14, fontWeight: 500, color: '#6b7280', lineHeight: 1.7, whiteSpace: 'pre-wrap', textAlign: 'center' }}
                        dangerouslySetInnerHTML={{ 
                          __html: (modal.kind === 'info' && 'extra' in modal && modal.extra?.html)
                            ? msg
                            : msg.replace(/\n/g, '<br/>') 
                        }}
                      />
                    </>
                  )
                })()}
              </div>
              {'extra' in modal && modal.extra?.showCancel ? (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginTop: 20 }}>
                  <button
                    onClick={() => setModal({ open: false })}
                    style={{
                      padding: '14px 0',
                      borderRadius: 14, cursor: 'pointer',
                      background: '#f3f4f6', border: '1px solid #e5e7eb',
                      color: '#374151', fontSize: 15, fontWeight: 700,
                      display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                    }}
                  >
                    <RotateCw size={15} />
                    ลองใหม่
                  </button>
                  <button
                    onClick={() => {
                      setModal({ open: false });
                      if (redirectOnOk) setRedirectOnOk(null);
                      goHeng36();
                    }}
                    style={{
                      padding: '14px 0',
                      borderRadius: 14, border: 'none', cursor: 'pointer',
                      background: `linear-gradient(135deg, ${colors.primary} 0%, ${colors.secondary || colors.primary} 100%)`,
                      color: '#fff', fontSize: 15, fontWeight: 700,
                      boxShadow: `0 4px 14px ${hexToRgba(colors.primary, 0.3)}`,
                      display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                    }}
                  >
                    <ExternalLink size={15} />
                    {goButtonLabel}
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => {
                    setModal({ open: false });
                    if (redirectOnOk) setRedirectOnOk(null);
                    goHeng36();
                  }}
                  style={{
                    width: '100%', marginTop: 20, padding: '14px 0',
                    borderRadius: 14, border: 'none', cursor: 'pointer',
                    background: `linear-gradient(135deg, ${colors.primary} 0%, ${colors.secondary || colors.primary} 100%)`,
                    color: '#fff', fontSize: 15, fontWeight: 700,
                    boxShadow: `0 4px 14px ${hexToRgba(colors.primary, 0.3)}`,
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                  }}
                >
                  <ExternalLink size={16} />
                  {goButtonLabel}
                </button>
              )}
            </div>
          )}
        </div>
      </Overlay>
    );
  };

  const modalPortal = renderGlobalModal();

  const handleLogout = () => {
    clearCachedPlayerName()
    setUsername('')
    setPassword('')
    setNeedName(true)
  }

  // สำหรับเกมเช็คอิน ให้แสดงโดยไม่ใช้ play-card
  if (game.type === 'เกมเช็คอิน') {
    return (
      <div className="checkin-wrap checkin-wrap--modern checkin-wrap--clean">
        {!needName ? (
          <CheckinGame
            gameId={id}
            game={game}
            username={username}
            onInfo={(t,m)=>setModal({ open:true, kind:'info', title:t, message:m })}
            onCode={(code)=>setModal({ open:true, kind:'code', title:'ยินดีด้วย! คำตอบถูกต้อง', message:'นี่โค้ดของคุณค่ะ', code })}
            onLogout={handleLogout}
          />
        ) : (
          <div className="checkin-loading">กำลังโหลดเกมเช็คอิน...</div>
        )}
        
        {/* ✅ Popup : ตั้งชื่อผู้เล่น สำหรับเกมเช็คอิน - ไม่แสดงเมื่อ modal code เปิดอยู่ */}
        {needName && !(modal.open && modal.kind === 'code') && (
          <Overlay key="checkin-login" onClose={undefined}>
            <div onClick={(e)=>e.stopPropagation()} style={{
              width: '92%', maxWidth: 360, borderRadius: 24, overflow: 'hidden',
              background: '#fff', boxShadow: '0 25px 60px rgba(0,0,0,0.22)',
            }}>
              {/* Hero logo */}
              <div style={{
                background: `linear-gradient(160deg, ${colors.primary} 0%, ${colors.secondary || colors.primary} 100%)`,
                padding: '32px 40px 28px', textAlign: 'center',
                position: 'relative', overflow: 'hidden',
              }}>
                <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(circle at 30% 20%, rgba(255,255,255,0.12) 0%, transparent 60%)' }} />
                <img
                  src={assets.logoContainer?.replace(/^url\(["']?/i, '').replace(/["']?\)$/i, '') || '/image/logo.png'}
                  alt={branding.title || 'Logo'}
                  onError={(e) => { e.currentTarget.src = assets.logo?.replace(/^url\(["']?/i, '').replace(/["']?\)$/i, '') || '/image/logo.png' }}
                  style={{ width: '100%', maxHeight: 80, objectFit: 'contain', position: 'relative', filter: 'drop-shadow(0 4px 12px rgba(0,0,0,0.15))' }}
                />
                <div style={{ fontSize: 17, fontWeight: 800, color: '#fff', marginTop: 14, position: 'relative' }}>เข้าสู่ระบบเกมเช็คอิน</div>
                <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.7)', fontWeight: 500, marginTop: 4, position: 'relative' }}>กรอก USER และ PASSWORD</div>
              </div>

              {/* Form */}
              <div style={{ padding: '22px 24px 26px', display: 'flex', flexDirection: 'column', gap: 14 }}>
                <div>
                  <label style={{ fontSize: 12, fontWeight: 700, color: '#6b7280', marginBottom: 6, display: 'flex', alignItems: 'center', gap: 5 }}>
                    <User size={13} color="#9ca3af" /> USER
                  </label>
                  <input
                    type="text" inputMode="text" autoCapitalize="none" autoCorrect="off" spellCheck={false} autoComplete="username"
                    placeholder="ชื่อผู้ใช้ของคุณ"
                    value={username}
                    onChange={(e)=>setUsername(e.target.value.toUpperCase())}
                    onKeyDown={(e)=>{ if (e.key==='Enter') (document.getElementById('game-pw') as HTMLInputElement)?.focus() }}
                    autoFocus
                    style={{
                      width: '100%', padding: '13px 16px', fontSize: 15, fontWeight: 600,
                      borderRadius: 14, border: '1.5px solid #e5e7eb', outline: 'none',
                      background: '#f9fafb', color: '#1f2937', boxSizing: 'border-box',
                    }}
                  />
                </div>

                <div>
                  <label style={{ fontSize: 12, fontWeight: 700, color: '#6b7280', marginBottom: 6, display: 'flex', alignItems: 'center', gap: 5 }}>
                    <Lock size={13} color="#9ca3af" /> PASSWORD
                  </label>
                  <div style={{ position: 'relative' }}>
                    <input
                      id="game-pw"
                      type={showPw ? 'text' : 'password'}
                      placeholder="รหัสผ่าน"
                      value={password}
                      onChange={(e)=>setPassword(e.target.value)}
                      onKeyDown={(e)=>{ if (e.key==='Enter') saveName() }}
                      style={{
                        width: '100%', padding: '13px 44px 13px 16px', fontSize: 15, fontWeight: 600,
                        borderRadius: 14, border: '1.5px solid #e5e7eb', outline: 'none',
                        background: '#f9fafb', color: '#1f2937', boxSizing: 'border-box',
                      }}
                    />
                    <button
                      type="button" tabIndex={-1}
                      onClick={()=>setShowPw(!showPw)}
                      style={{
                        position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)',
                        background: 'none', border: 'none', cursor: 'pointer', padding: 4,
                        color: '#9ca3af', display: 'flex', alignItems: 'center',
                      }}
                    >
                      {showPw ? <EyeOff size={18} /> : <Eye size={18} />}
                    </button>
                  </div>
                  <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 6, display: 'flex', alignItems: 'center', gap: 4 }}>
                    <AlertTriangle size={11} color="#d97706" /> PASSWORD คือเลขบัญชี 4 ตัวท้าย
                  </div>
                </div>

                <button
                  onClick={saveName}
                  disabled={checkingName || !username.trim() || !password.trim()}
                  style={{
                    width: '100%', padding: '14px 0', marginTop: 4,
                    borderRadius: 14, border: 'none', cursor: checkingName || !username.trim() || !password.trim() ? 'not-allowed' : 'pointer',
                    background: `linear-gradient(135deg, ${colors.primary} 0%, ${colors.secondary || colors.primary} 100%)`,
                    color: '#fff', fontSize: 16, fontWeight: 800,
                    boxShadow: `0 4px 14px ${hexToRgba(colors.primary, 0.3)}`,
                    opacity: checkingName || !username.trim() || !password.trim() ? 0.5 : 1,
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                    transition: 'opacity 0.2s',
                  }}
                >
                  {checkingName ? <><Loader2 size={16} className="spin-icon" /> กำลังตรวจสอบ...</> : <><Lock size={16} /> เข้าสู่ระบบ</>}
                </button>
              </div>
            </div>
          </Overlay>
        )}

        {modalPortal}
      </div>
    )
  }

  return (
    <section className="play-wrap play-wrap--clean">
      <div className="play-card">
        {/* Logo + Logout (for games with built-in UserBar) */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
          <div style={{ flex: 1 }} />
          <img 
            src={assets.logoContainer?.replace(/^url\(["']?/i, '').replace(/["']?\)$/i, '') || '/image/logo.png'} 
            alt={branding.title} 
            className="play-logo" 
            style={{ margin: '6px auto 8px' }}
            onError={(e) => {
              const fallbackLogo = assets.logo?.replace(/^url\(["']?/i, '').replace(/["']?\)$/i, '') || '/image/logo.png'
              e.currentTarget.src = fallbackLogo
            }}
          />
          <div style={{ flex: 1, display: 'flex', justifyContent: 'flex-end' }}>
            {!needName && username && ['เกมสล็อต'].includes(game.type) && (
              <button
                type="button"
                onClick={handleLogout}
                title="ออกจากระบบ"
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 5,
                  padding: '6px 12px', borderRadius: 8,
                  border: `1px solid ${colors.borderLight || '#e5e7eb'}`,
                  background: 'transparent', color: colors.textSecondary || '#9ca3af',
                  fontSize: 12, fontWeight: 600, cursor: 'pointer',
                  transition: 'all 0.15s ease', whiteSpace: 'nowrap',
                }}
              >
                <LogOut size={13} />
                ออก
              </button>
            )}
          </div>
        </div>

        {/* User tab + Logout */}
        {!needName && username && !['เกมสล็อต', 'เกมเช็คอิน'].includes(game.type) && (
          <div style={{
            display: 'flex', alignItems: 'center', gap: 10,
            background: `linear-gradient(135deg, ${colors.primary || '#10B981'} 0%, ${colors.secondary || '#059669'} 100%)`,
            borderRadius: 12, padding: '10px 16px', marginBottom: 10,
            boxShadow: `0 4px 14px ${hexToRgba(colors.primary || '#10B981', 0.3)}`,
          }}>
            <div style={{
              width: 32, height: 32, borderRadius: '50%',
              background: 'rgba(255,255,255,0.2)',
              display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
            }}>
              <User size={16} color="#fff" />
            </div>
            <span style={{
              color: '#fff', fontWeight: 700, fontSize: 14,
              textShadow: '0 1px 2px rgba(0,0,0,0.2)',
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              flex: 1, minWidth: 0,
            }}>
              {username}
            </span>
            <button
              type="button"
              onClick={handleLogout}
              title="ออกจากระบบ"
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 5,
                marginLeft: 'auto', flexShrink: 0,
                background: 'rgba(255,255,255,0.18)', borderRadius: 8,
                padding: '5px 12px', border: '1px solid rgba(255,255,255,0.25)',
                color: '#fff', fontSize: 11, fontWeight: 600, cursor: 'pointer',
                transition: 'all 0.15s ease', whiteSpace: 'nowrap',
              }}
            >
              <LogOut size={12} />
              ออก
            </button>
          </div>
        )}

        <div className="play-head">
          {(() => {
            const m = getTypeMeta(game.type)
            return (
              <div className={`type-badge ${m.cls}`} title={m.label}>
                <span className="ico">{m.icon}</span>
                <span className="label">{m.label}</span>
              </div>
            )
          })()}
        </div>

        {/* ===== เลือกแสดงแต่ละประเภท ===== */}
        {game.type === 'เกมสล็อต' && !needName && (
          <SlotGame
            key={`slot:${id}:${userKey}`}
            gameId={id}
            gameData={game}
            username={userKey}
          />
        )}

        {(game.type === 'เกมทายภาพปริศนา' || game.type === 'เกมปาร์ตี้') && !needName && (
          <PuzzleGame
            gameId={id}
            game={game as any} 
            username={username}
            onInfo={openInfo}
            onCode={openCode}
          />
        )}

        {game.type === 'เกมทายเบอร์เงิน' && !needName && (
          <NumberGame
            image={img}
            endAtMs={(game.numberPick || (game as any).gameData?.numberPick)?.endAt ?? null}
            onExpire={handleExpire}
            disabled={runtimeExpired || locked || submitting}
            submitting={submitting}
            onSubmit={submitNumberAnswer}
            previousGuess={lastNumberGuess ? (parseNumberGuess(lastNumberGuess) || lastNumberGuess) : undefined}
            onGoToWebsite={goHeng36}
            goButtonLabel={goButtonLabel}
          />
        )}

        {game.type === 'เกมทายผลบอล' && !needName && (
          <FootballGame
            image={(() => {
              const footballData = game.football || (game as any).gameData?.football
              const imgUrl = footballData?.imageDataUrl
              return imgUrl ? getImageUrl(imgUrl) : ''
            })()}
            endAtMs={(game.football || (game as any).gameData?.football)?.endAt ?? null}
            onExpire={handleExpire}
            homeName={(game.football || (game as any).gameData?.football)?.homeTeam || 'ทีมเหย้า'}
            awayName={(game.football || (game as any).gameData?.football)?.awayTeam || 'ทีมเยือน'}
            disabled={expired || runtimeExpired || locked}
            submitting={submitting}
            onSubmit={submitFootballFromChild}
            previousGuess={initialFootballGuess}
            previousGuessText={lastFootballGuessText}
            onGoToWebsite={goHeng36}
            goButtonLabel={goButtonLabel}
          />
        )}

        {game.type === 'เกมบอลโลก' && !needName && (
          <WorldCupGame
            gameId={id}
            game={game as any}
            username={username}
            onInfo={openInfo}
            onGoToWebsite={goHeng36}
            goButtonLabel={goButtonLabel}
          />
        )}

        {game.type === 'เกมลุ้นรางวัลพิเศษ' && !needName && (
          <TrickOrTreatGame
            gameId={id}
            game={game as any} 
            username={username}
            onInfo={openInfo}
            onCode={openCode}
          />
        )}

        {game.type === 'เกมป๊อกเด้ง' && !needName && (
          <PokDengGame
            gameId={id}
            game={game as any}
            username={username}
            onInfo={openInfo}
            onCode={openCode}
          />
        )}

        {game.type === 'เกมลอยกระทง' && !needName && (
          <LoyKrathongGame
            gameId={id}
            game={game as any}
            username={username}
            onInfo={openInfo}
            onCode={openCode}
          />
        )}

        {game.type === 'เกมประกาศรางวัล' && !needName && (
          <AnnounceGame
            gameId={id}
            game={game}
            username={username}
            bonusData={announceBonus}
            onGoToWebsite={goHeng36}
          />
        )}

        {game.type === 'เกมแนะนำเพื่อน' && !needName && (
          <ReferralGame
            gameId={id}
            gameData={game}
            username={username}
          />
        )}

        {locked  && <div className="banner warn">เกมนี้ยัง <b>ล็อกอยู่</b> โปรดติดต่อแอดมิน</div>}
        {(expired || runtimeExpired) && <div className="banner warn">เกมนี้ <b>หมดเวลา</b> แล้ว</div>}
      </div>

      {/* ✅ Popup : ตั้งชื่อผู้เล่น - ไม่แสดงเมื่อ modal code เปิดอยู่ */}
      {needName && !(modal.open && modal.kind === 'code') && (
        <Overlay key="game-login" onClose={undefined}>
          <div onClick={(e)=>e.stopPropagation()} style={{
            width: '92%', maxWidth: 360, borderRadius: 24, overflow: 'hidden',
            background: '#fff', boxShadow: '0 25px 60px rgba(0,0,0,0.22)',
          }}>
            {/* Hero logo */}
            <div style={{
              background: `linear-gradient(160deg, ${colors.primary} 0%, ${colors.secondary || colors.primary} 100%)`,
              padding: '32px 40px 28px', textAlign: 'center',
              position: 'relative', overflow: 'hidden',
            }}>
              <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(circle at 30% 20%, rgba(255,255,255,0.12) 0%, transparent 60%)' }} />
              <img
                src={assets.logoContainer?.replace(/^url\(["']?/i, '').replace(/["']?\)$/i, '') || '/image/logo.png'}
                alt={branding.title || 'Logo'}
                onError={(e) => { e.currentTarget.src = assets.logo?.replace(/^url\(["']?/i, '').replace(/["']?\)$/i, '') || '/image/logo.png' }}
                style={{ width: '100%', maxHeight: 80, objectFit: 'contain', position: 'relative', filter: 'drop-shadow(0 4px 12px rgba(0,0,0,0.15))' }}
              />
              <div style={{ fontSize: 17, fontWeight: 800, color: '#fff', marginTop: 14, position: 'relative' }}>
                เข้าสู่ระบบ{game?.type || 'เกม'}
              </div>
              <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.7)', fontWeight: 500, marginTop: 4, position: 'relative' }}>กรอก USER และ PASSWORD</div>
            </div>

            {/* Form */}
            <div style={{ padding: '22px 24px 26px', display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div>
                <label style={{ fontSize: 12, fontWeight: 700, color: '#6b7280', marginBottom: 6, display: 'flex', alignItems: 'center', gap: 5 }}>
                  <User size={13} color="#9ca3af" /> USER
                </label>
                <input
                  type="text" inputMode="text" autoCapitalize="none" autoCorrect="off" spellCheck={false} autoComplete="username"
                  placeholder="ชื่อผู้ใช้ของคุณ"
                  value={username}
                  onChange={(e)=>setUsername(e.target.value.toUpperCase())}
                  onKeyDown={(e)=>{ if (e.key==='Enter') (document.getElementById('game-pw') as HTMLInputElement)?.focus() }}
                  autoFocus
                  style={{
                    width: '100%', padding: '13px 16px', fontSize: 15, fontWeight: 600,
                    borderRadius: 14, border: '1.5px solid #e5e7eb', outline: 'none',
                    background: '#f9fafb', color: '#1f2937', boxSizing: 'border-box',
                  }}
                />
              </div>

              <div>
                <label style={{ fontSize: 12, fontWeight: 700, color: '#6b7280', marginBottom: 6, display: 'flex', alignItems: 'center', gap: 5 }}>
                  <Lock size={13} color="#9ca3af" /> PASSWORD
                </label>
                <div style={{ position: 'relative' }}>
                  <input
                    id="game-pw"
                    type={showPw ? 'text' : 'password'}
                    placeholder="รหัสผ่าน"
                    value={password}
                    onChange={(e)=>setPassword(e.target.value)}
                    onKeyDown={(e)=>{ if (e.key==='Enter') saveName() }}
                    style={{
                      width: '100%', padding: '13px 44px 13px 16px', fontSize: 15, fontWeight: 600,
                      borderRadius: 14, border: '1.5px solid #e5e7eb', outline: 'none',
                      background: '#f9fafb', color: '#1f2937', boxSizing: 'border-box',
                    }}
                  />
                  <button
                    type="button" tabIndex={-1}
                    onClick={()=>setShowPw(!showPw)}
                    style={{
                      position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)',
                      background: 'none', border: 'none', cursor: 'pointer', padding: 4,
                      color: '#9ca3af', display: 'flex', alignItems: 'center',
                    }}
                  >
                    {showPw ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>
                <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 6, display: 'flex', alignItems: 'center', gap: 4 }}>
                  <AlertTriangle size={11} color="#d97706" /> PASSWORD คือเลขบัญชี 4 ตัวท้าย
                </div>
              </div>

              <button
                onClick={saveName}
                disabled={checkingName || !username.trim() || !password.trim()}
                style={{
                  width: '100%', padding: '14px 0', marginTop: 4,
                  borderRadius: 14, border: 'none', cursor: checkingName || !username.trim() || !password.trim() ? 'not-allowed' : 'pointer',
                  background: `linear-gradient(135deg, ${colors.primary} 0%, ${colors.secondary || colors.primary} 100%)`,
                  color: '#fff', fontSize: 16, fontWeight: 800,
                  boxShadow: `0 4px 14px ${hexToRgba(colors.primary, 0.3)}`,
                  opacity: checkingName || !username.trim() || !password.trim() ? 0.5 : 1,
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                  transition: 'opacity 0.2s',
                }}
              >
                {checkingName ? <><Loader2 size={16} className="spin-icon" /> กำลังตรวจสอบ...</> : <><Lock size={16} /> เข้าสู่ระบบ</>}
              </button>
            </div>
          </div>
        </Overlay>
      )}
      {/* ✅ Auto SOLD-OUT Popup (ไม่ใช้ useEffect) */}
        {showAutoSoldOut && (
          <Overlay key="sold-out" onClose={undefined /* บล็อกคลิกนอก */}>
            <div className="modal modal-centered modal--warning" onClick={(e)=>e.stopPropagation()}>
              {/* Header Section */}
              <div style={{
                textAlign: 'center',
                marginBottom: '24px'
              }}>
                <div style={{
                  width: '80px',
                  height: '80px',
                  background: `linear-gradient(135deg, ${colors.danger} 0%, ${colors.dangerLight} 100%)`,
                  borderRadius: '50%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  margin: '0 auto 16px',
                  boxShadow: `0 8px 32px ${colors.danger}40`,
                  animation: 'pulse 2s infinite'
                }}>
                  <span style={{ fontSize: '32px' }}><PartyPopper size={32} /></span>
                </div>
                <h3 style={{
                  fontSize: '24px',
                  fontWeight: '800',
                  color: colors.textPrimary,
                  margin: '0 0 8px 0',
                  textShadow: '0 2px 4px rgba(0,0,0,0.1)'
                }}>
                  โค้ดเต็มแล้วค่ะ
                </h3>
              </div>

              {/* Message Section */}
              <div style={{
                background: `linear-gradient(135deg, ${colors.dangerLight}20 0%, ${colors.dangerLight}30 100%)`,
                border: `2px solid ${colors.danger}`,
                borderRadius: '16px',
                padding: '20px',
                marginBottom: '24px',
                position: 'relative',
                boxShadow: `0 4px 16px ${colors.danger}30`
              }}>
                <div style={{
                  position: 'absolute',
                  top: '-8px',
                  left: '50%',
                  transform: 'translateX(-50%)',
                  background: colors.danger,
                  color: colors.textInverse,
                  padding: '4px 12px',
                  borderRadius: '12px',
                  fontSize: '12px',
                  fontWeight: '700',
                  textTransform: 'uppercase',
                  letterSpacing: '0.5px'
                }}>
                  แจ้งเตือน
                </div>
                
                <div style={{
                  textAlign: 'center',
                  color: colors.danger,
                  lineHeight: '1.6'
                }}>
                  <div style={{
                    fontSize: '16px',
                    fontWeight: '600',
                    marginBottom: '8px'
                  }}>
                    ขออภัยค่ะ โค้ดรางวัลในเกมในรอบนี้ถูกแจกหมดแล้ว
                  </div>
                  <div style={{
                    fontSize: '14px',
                    color: '#b91c1c',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '8px'
                  }}>
                    <span><Gamepad2 size={16} /></span>
                    <span>รอติดตามกิจกรรมรอบหน้าค่ะ!</span>
                    <span><Gamepad2 size={16} /></span>
                  </div>
                </div>
              </div>

              {/* Action Button */}
                <div className="modal-actions">
                  <button
                    className="btn-cta primary"
                    style={{
                      background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
                      border: 'none',
                      borderRadius: '12px',
                      padding: '14px 32px',
                      fontSize: '16px',
                      fontWeight: '700',
                      color: 'white',
                      boxShadow: '0 4px 16px rgba(16, 185, 129, 0.3)',
                      transition: 'all 0.2s ease',
                      cursor: 'pointer'
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.transform = 'translateY(-2px)'
                      e.currentTarget.style.boxShadow = '0 6px 20px rgba(16, 185, 129, 0.4)'
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.transform = 'translateY(0)'
                      e.currentTarget.style.boxShadow = '0 4px 16px rgba(16, 185, 129, 0.3)'
                    }}
                    onClick={goHeng36}
                  >
                    {goButtonLabel}
                  </button>
                </div>
            </div>
          </Overlay>
        )}


      {/* Popup ส่วนกลาง */}
      {modalPortal}

     </section>
   )
 }
