import React from 'react'
import { createPortal } from 'react-dom'
import { useNavigate, useParams } from 'react-router-dom'
import PrettySelect, { type PrettyOption } from '../components/PrettySelect'
// ✅ ใช้ Firebase Auth (รองรับทั้ง 3 themes)
import { getUser as getFirebaseUser, signInWithPassword } from '../services/firebase-auth'
import { dataCache, cacheKeys } from '../services/cache'
import * as XLSX from 'xlsx'
import PlayerAnswersList from '../components/PlayerAnswersList'
import WorldCupAdminResults, { type WorldCupResultInput } from '../components/WorldCupAdminResults'
import { worldCupSchedule, getTeamNameTh, formatGroupLabel } from '../data/worldCupSchedule'
import { useTheme, useThemeBranding, useThemeAssets, useThemeColors } from '../contexts/ThemeContext'
import { useThemeImages } from '../hooks/useThemeAssets'
import { getPlayerLink } from '../utils/playerLinks'
import { getGameById, createGame, updateGame, deleteGame } from '../services/firebase-games-new'
import { runTransaction, doc, serverTimestamp } from 'firebase/firestore'
import { db } from '../services/firebase-theme'
import { getCurrentTheme } from '../utils/theme-resolver'
import { getAllUsers } from '../services/firebase-users-new'
import { getAllCheckins } from '../services/firebase-checkins-new'
import { getAnswers, getAnswersByAction } from '../services/firebase-answers-new'
import { saveCouponCodesToSubcollection } from '../services/firebase-rewards-coupon-codes'
import { saveAnnounceUsersToSubcollection, saveAnnounceUserBonusesToSubcollection, deleteAnnounceUsersFromSubcollection } from '../services/firebase-announce-users'
import { subscribeAnswerUpdates } from '../services/firebase-answers-new'
import { uploadImageToStorage, getImageUrl, deleteImageFromStorage, convertToCDNUrl } from '../services/image-upload'
import { getThemeSettings, saveThemeSettings } from '../services/firebase-theme-settings'
import { getGlobalSettings, saveGlobalSettings } from '../services/firebase-global-settings'
import {
  saveReferralDeposits,
  saveReferralRegisters,
  getReferralLeaderboard,
  getReferralDeposits,
  getReferralRegisters,
  type ReferralRow,
  type ReferralSummary
} from '../services/firebase-referral'
import { Pencil, Gamepad2, FileText, RefreshCw, Upload, Send, Copy, Link, ClipboardList, Trash2, Play, Flag, ImageIcon, Camera, Trophy, Gift, Lightbulb, Phone, Calendar, Ticket, Crown, Handshake, Coins, BarChart3, RotateCw, Download, FileImage, FileSpreadsheet, Users, UserCheck, Search, AlertTriangle, CheckCircle2, Medal, Puzzle, PartyPopper, Hash, Goal, Globe, Dices, CalendarCheck, Megaphone, Sparkles, Waves, Grid3X3, Spade, ToggleLeft, Settings, Plus, Save, Loader2, Clock, XCircle, ArrowLeft, Award, Star, X } from 'lucide-react'
import type { GameData } from '../types/game'

const PARTY_TELEGRAM_IMAGE_KEY = 'partyTelegramImageUrl'
const PARTY_TELEGRAM_MESSAGE_KEY = 'partyTelegramMessage'
// ✅ ข้อความเมื่อโค้ดเต็ม — แยกตามโหมด: classic (ภาพร่วม) / random_pool (สุ่มรายผู้เล่น)
const PARTY_TELEGRAM_CODE_FULL_MESSAGE_KEY = 'partyTelegramCodeFullMessage'
const PARTY_TELEGRAM_CODE_FULL_RANDOM_KEY = 'partyTelegramCodeFullRandomMessage'
const LEGACY_PARTY_TELEGRAM_IMAGE_KEY = 'telegramPartyImageUrl'
const LEGACY_PARTY_TELEGRAM_MESSAGE_KEY = 'telegramPartyMessage'
// ✅ คลังรูปภาพเกมปาร์ตี้ — ใช้ร่วมกันทุกธีม (heng36 / max56 / jeed24)
// เก็บที่ Firestore: globalSettings/partyGame.partyImagePool (JSON string)
const PARTY_IMAGE_POOL_KEY = 'partyImagePool'

// ✅ ข้อความเริ่มต้นเมื่อโค้ดเต็ม
const DEFAULT_PARTY_CODE_FULL_CLASSIC = '📢 {gameName} 🎉 กิจกรรมทายภาพ รอบ {roundLabel}\n\n🚫 โค้ดเต็มแล้วในรอบนี้\n✅ เฉลยคำตอบ: {answer}\n\n💬 พี่ๆ ท่านไหนพลาดรอบนี้ ไม่ต้องเสียใจนะคะ 🥰\n🎁 ติดตามกิจกรรมรอบต่อไปได้ในกลุ่ม Telegram เลย\n\n🔥 รอบหน้ามาไว แจกจริง ลุ้นสนุกเหมือนเดิม!'
const DEFAULT_PARTY_CODE_FULL_RANDOM  = '📢 {gameName} 🎉 กิจกรรมทายภาพ รอบ {roundLabel}\n\n🚫 โค้ดเต็มแล้วในรอบนี้\n🎲 รอบนี้ผู้เล่นแต่ละคนได้รูปไม่เหมือนกัน คำตอบจึงต่างกัน\n\n💬 พี่ๆ ท่านไหนพลาดรอบนี้ ไม่ต้องเสียใจนะคะ 🥰\n🎁 ติดตามกิจกรรมรอบต่อไปได้ในกลุ่ม Telegram เลย\n\n🔥 รอบหน้ามาไว แจกจริง ลุ้นสนุกเหมือนเดิม!'
const TRICK_TELEGRAM_IMAGE_KEY = 'trickTelegramImageUrl'
const TRICK_TELEGRAM_MESSAGE_KEY = 'trickTelegramMessage'

// ✅ ประกาศผู้ชนะ (เกมทายเบอร์เงิน / เกมทายผลบอล)
const NUMBER_PICK_WINNERS_TELEGRAM_IMAGE_KEY = 'numberPickWinnersTelegramImageUrl'
const NUMBER_PICK_WINNERS_TELEGRAM_MESSAGE_KEY = 'numberPickWinnersTelegramMessage'
const FOOTBALL_WINNERS_TELEGRAM_IMAGE_KEY = 'footballWinnersTelegramImageUrl'
const FOOTBALL_WINNERS_TELEGRAM_MESSAGE_KEY = 'footballWinnersTelegramMessage'
const WORLD_CUP_WINNERS_TELEGRAM_MESSAGE_KEY = 'worldCupWinnersTelegramMessage'

const DEFAULT_NUMBER_PICK_WINNERS_TEMPLATE = [
  '📢✨ ประกาศผู้ชนะกิจกรรม "เบอร์เงิน" จาก {themeName} 💚 🎉',
  '',
  '🏆 ผู้โชคดีรอบนี้ ได้แก่',
  '{winners}',
  '',
  '⚠️ ผู้ที่ทายถูก แต่ยอดฝากไม่ครบเกณฑ์',
  '{unqualifiedWinners}',
  '',
  '🎊 ขอแสดงความยินดีกับผู้ได้รับรางวัลทุกท่าน 🎊',
  '',
  '💸 สำหรับท่านที่ยังไม่ถูกในรอบนี้',
  'อย่าเพิ่งท้อ! โอกาสหน้ามาลุ้นกันใหม่ 🔥',
].join('\n')

const DEFAULT_FOOTBALL_WINNERS_TEMPLATE = [
  '📢✨ ประกาศผู้ชนะกิจกรรม "ทายผลบอล" จาก {themeName} 💚 🎉',
  '',
  '🏆 ผู้โชคดีรอบนี้ ได้แก่',
  '{winners}',
  '',
  '⚠️ ผู้ที่ทายถูก แต่ยอดฝากไม่ครบเกณฑ์',
  '{unqualifiedWinners}',
  '',
  '🎊 ขอแสดงความยินดีกับผู้ได้รับรางวัลทุกท่าน 🎊',
  '',
  '💸 สำหรับท่านที่ยังไม่ถูกในรอบนี้',
  'อย่าเพิ่งท้อ! โอกาสหน้ามาลุ้นกันใหม่ 🔥',
].join('\n')

const DEFAULT_WORLD_CUP_WINNERS_TEMPLATE = [
  '⚽✨ ประกาศผู้ชนะ "เกมบอลโลก" จาก {themeName} 💚 🎉',
  '',
  '🏟️ คู่: {matchInfo}',
  '🎯 สกอร์ที่ถูก: {correctAnswer}',
  '',
  '🏆 ผู้ทายสกอร์ถูกในคู่นี้',
  '{winners}',
  '',
  '🎊 ขอแสดงความยินดีกับผู้ได้รับรางวัลทุกท่าน 🎊',
  '',
  '⚽ คู่ถัดไป มาลุ้นไปด้วยกัน 🔥',
].join('\n')

// ✅ Finance Type ที่นับเป็น "ยอดฝาก" จากไฟล์รายงาน (อื่น ๆ ไม่นับ)
const VALID_DEPOSIT_FINANCE_TYPES = new Set(['SLIP', 'TRUEWALLET', 'AUTOPEER', 'ASKMEPAY', 'NOSLIP'])

// ✅ Header row ที่อาจพบใน column B (Username) ของไฟล์รายงานฝาก
const DEPOSIT_HEADER_USERNAME_KEYWORDS = new Set([
  'username', 'user', 'ผู้ใช้', 'ผู้ใช้งาน', 'สมาชิก', 'ชื่อผู้ใช้',
  'member', 'memberid', 'memberusername', 'login',
])

// ✅ Normalize username สำหรับ matching (ตัด whitespace ทุกแบบ + uppercase)
// รองรับ NBSP (U+00A0), zero-width space (U+200B), BOM (U+FEFF) ฯลฯ
const normalizeUsername = (s: unknown): string =>
  String(s ?? '').replace(/[\s\u00A0\u200B\u200C\u200D\uFEFF]+/g, '').toUpperCase()

// ✅ แปลง raw value ของ Amount เป็น number — รองรับ comma, currency symbol, ช่องว่าง
// คืน null หาก parse ไม่ได้ หรือเป็นเลขลบ
const parseDepositAmount = (raw: unknown): number | null => {
  if (typeof raw === 'number') {
    return Number.isFinite(raw) && raw >= 0 ? raw : null
  }
  const s = String(raw ?? '').trim()
  if (!s) return null
  // ตัดทุกอย่างที่ไม่ใช่ตัวเลข, จุด, ลบ
  const cleaned = s.replace(/[^\d.\-]/g, '')
  if (!cleaned || cleaned === '-' || cleaned === '.') return null
  const n = Number(cleaned)
  if (!Number.isFinite(n)) return null
  if (n < 0) return null // ข้าม refund/withdraw
  return n
}
const CHECKIN_LINE_CONTACT_BY_THEME: Record<string, string> = {
  heng36: 'https://lin.ee/mbnX6aV',
  max56: 'https://lin.ee/hg06uf0',
  jeed24: 'https://lin.ee/lkDmWc4',
  kamo99: 'https://lin.ee/MyWkcJX',
  kiki49: 'https://lin.ee/PJiBDJj',
  abm96: 'https://lin.ee/VF14CYx',
  mab96: 'https://lin.ee/oXJ0uHT',
}

// ใช้ชนิดเกมแบบเดิม
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
  | 'เกมป๊อกเด้ง'

type SlotCfg = { 
  startCredit: number; 
  startBet: number; 
  winRate: number; 
  targetCredit: number;
  winTiers?: {
    slot1_triple?: { payoutX?: number; payoutPct?: number };
    other_triple?: { payoutX?: number; payoutPct?: number };
    slot1_pair?: { payoutX?: number; payoutPct?: number };
    other_pair?: { payoutX?: number; payoutPct?: number };
  };
}
type AnswerRow = {
  ts: number
  user?: string
  answer?: string
  correct?: boolean
  code?: string
  // เพิ่มสำหรับเกมลุ้นรางวัลพิเศษ
  won?: boolean
  cardSelected?: number
}

// ==== Usage types (admin report for CheckinGame) ====



// ✅ รางวัลเช็คอิน (ไม่ใช้ date แล้ว ใช้ startDate + dayIndex แทน)
type CheckinReward = { kind: 'coin' | 'code'; value: number | string }
type CouponTier = { title?: string; rewardCredit: number; price: number; codes: string[] }
type PartyRoundConfig = {
  round: number
  answer: string
  codeCount: number
  imageDataUrl?: string
  fileName?: string
  imageFile?: File | null
}

// ✅ รูปภาพในคลัง (เก็บใน DB เป็น URL หลังอัปโหลดแล้ว)
type PartyPoolImage = {
  url: string
  name: string
}

// ✅ โหมดของเกมปาร์ตี้:
//   - 'classic'      = ระบบเดิม (รูป+คำตอบ ตั้งต่อรอบ ทุกคนเห็นรูปเดียวกันในรอบเดียวกัน)
//   - 'random_pool'  = ระบบใหม่ (สุ่มรูปจากคลังให้ผู้เล่นแต่ละคน คำตอบมาจากชื่อไฟล์)
type PartyMode = 'classic' | 'random_pool'
const DEFAULT_PARTY_MODE: PartyMode = 'classic'

const createEmptyPartyRound = (round: number): PartyRoundConfig => ({
  round,
  answer: '',
  codeCount: 1,
  imageDataUrl: '',
  fileName: '',
  imageFile: null,
})


const normalizeUser = (s: string) => (s || '').trim().replace(/\s+/g, '').toUpperCase()
const clean = (s: string) => (s || '').replace(/\s+/g, ' ').trim().toLowerCase()

const clamp = (n: number, min: number, max: number) =>
  Math.max(min, Math.min(max, n))

class WrongFileTypeError extends Error {
  expected: string
  detected: string
  constructor(expected: string, detected: string) {
    super(`ไฟล์ไม่ตรงประเภท: คาดว่าเป็นไฟล์ "${expected}" แต่ตรวจพบว่าเป็นไฟล์ "${detected}"`)
    this.name = 'WrongFileTypeError'
    this.expected = expected
    this.detected = detected
  }
}

const DEPOSIT_MARKERS = ['recommend by', 'first topup', 'bonus', 'channel', 'created by']
const REGISTER_MARKERS = ['affiliate_by', 'affiliate_line', 'username_product', 'firstname', 'lastname', 'bank', 'account']

function detectFileType(headers: string[]): 'deposit' | 'register' | 'unknown' {
  const joined = headers.map(h => String(h || '').toLowerCase()).join('|')
  const depScore = DEPOSIT_MARKERS.filter(m => joined.includes(m)).length
  const regScore = REGISTER_MARKERS.filter(m => joined.includes(m)).length
  if (depScore >= 2 && depScore > regScore) return 'deposit'
  if (regScore >= 2 && regScore > depScore) return 'register'
  return 'unknown'
}

function parseReferralExcel(
  file: File,
  opts?: { referredCol?: number; referrerCol?: number; expectedType?: 'deposit' | 'register' }
): Promise<ReferralRow[]> {
  const refCol = opts?.referredCol ?? 0
  const rerCol = opts?.referrerCol ?? 1
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = (ev) => {
      try {
        const data = new Uint8Array(ev.target?.result as ArrayBuffer)
        const wb = XLSX.read(data, { type: 'array' })
        const ws = wb.Sheets[wb.SheetNames[0]]
        const raw: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1 })

        if (opts?.expectedType && raw.length > 0) {
          const detected = detectFileType(raw[0])
          if (detected !== 'unknown' && detected !== opts.expectedType) {
            const labels = { deposit: 'นับจริง (First Topup)', register: 'สมัคร (Customer)' }
            reject(new WrongFileTypeError(labels[opts.expectedType], labels[detected]))
            return
          }
        }

        const rows: ReferralRow[] = []
        for (let i = 1; i < raw.length; i++) {
          const referred = String(raw[i]?.[refCol] || '').trim().toUpperCase()
          const referrer = String(raw[i]?.[rerCol] || '').trim().toUpperCase()
          if (referrer && referred) {
            rows.push({ referrer, referred })
          }
        }
        if (rows.length === 0) {
          reject(new Error('ไม่พบข้อมูลที่ตรงเงื่อนไข (referrer ว่างทุกแถว)'))
          return
        }
        resolve(rows)
      } catch (e) {
        reject(e)
      }
    }
    reader.onerror = () => reject(new Error('Failed to read file'))
    reader.readAsArrayBuffer(file)
  })
}

const num = (v: any, d = 0) => {
  const n = Number(v)
  return Number.isFinite(n) ? n : d
}

const gameTypeOptions: PrettyOption[] = [
  { value: 'เกมทายภาพปริศนา', label: 'เกมทายภาพปริศนา', icon: <Puzzle /> },
  { value: 'เกมปาร์ตี้', label: 'เกมปาร์ตี้', icon: <PartyPopper /> },
  { value: 'เกมทายเบอร์เงิน', label: 'เกมทายเบอร์เงิน', icon: <Hash /> },
  { value: 'เกมทายผลบอล', label: 'เกมทายผลบอล', icon: <Goal /> },
  { value: 'เกมบอลโลก', label: 'เกมบอลโลก', icon: <Globe /> },
  { value: 'เกมสล็อต', label: 'เกมสล็อต', icon: <Dices /> },
  { value: 'เกมเช็คอิน', label: 'เกมเช็คอิน', icon: <CalendarCheck /> },
  { value: 'เกมประกาศรางวัล', label: 'เกมประกาศรางวัล', icon: <Megaphone /> },
  { value: 'เกมลุ้นรางวัลพิเศษ', label: 'เกมลุ้นรางวัลพิเศษ', icon: <Sparkles /> },
  { value: 'เกมลอยกระทง', label: 'เกมลอยกระทง', icon: <Waves /> },
  { value: 'เกมแนะนำเพื่อน', label: 'เกมแนะนำเพื่อน', icon: <Handshake /> },
  { value: 'เกมป๊อกเด้ง', label: 'เกมป๊อกเด้ง', icon: <Spade /> },
]

// ---------- ประเภทที่ "ต้องมีรูปภาพ" ----------
const NEED_IMAGE = new Set<GameType>([
  'เกมทายภาพปริศนา',
  'เกมปาร์ตี้',
  'เกมทายเบอร์เงิน',
  'เกมทายผลบอล',
])
const needImage = (t: GameType) => NEED_IMAGE.has(t)

// ✅ ลบ PlayerAnswersListWrapper component ออกแล้ว (ย้ายไปไว้ในหน้า AdminAnswers.tsx แล้ว)

// util: File → dataURL
const fileToDataURL = (file: File) =>
  new Promise<string>((resolve, reject) => {
    const r = new FileReader()
    r.onload = () => resolve(String(r.result))
    r.onerror = reject
    r.readAsDataURL(file)
  })

// helper: timestamp → ค่าที่ใส่ใน input type="datetime-local"
const pad = (n: number) => String(n).padStart(2, '0')
const toLocalInput = (ts?: number | null) => {
  if (!ts) return ''
  const d = new Date(ts)
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

export default function CreateGame() {
  const nav = useNavigate()
  const { themeName } = useTheme()
  const branding = useThemeBranding()
  const assets = useThemeAssets()
  const colors = useThemeColors()
  const themeImages = useThemeImages()
  const { id: routeId } = useParams()
  
  // กำหนดชื่อ coin ตามธีม
  const coinName = themeName === 'max56' ? 'MAXCOIN' : themeName === 'jeed24' ? 'JEEDCOIN' : themeName === 'kamo99' ? 'KAMOCOIN' : themeName === 'kiki49' ? 'KIKICOIN' : themeName === 'mab96' ? 'MABCOIN' : themeName === 'abm96' ? 'ABMCOIN' : themeName === 'aigaming88' ? 'AICOIN' : 'HENGCOIN'
  const isEdit = !!routeId
  const gameId = routeId || ''
  
  // ✅ Debug: Log route params (development only)
  if (process.env.NODE_ENV === 'development') {
    // Debug log removed for production
  }

  // ====== state ของ "หน้าเดิม" ======
  const [type, setType] = React.useState<GameType>('เกมทายภาพปริศนา')
  const [name, setName] = React.useState('')
  const [imageDataUrl, setImageDataUrl] = React.useState<string>('') // ✅ เก็บ CDN URL หรือ data URL (สำหรับ preview)
  const [imageFile, setImageFile] = React.useState<File | null>(null) // ✅ เก็บ File object ที่เลือกไว้ (รออัปโหลดตอนสร้างเกม)
  const [imageUploading, setImageUploading] = React.useState(false)
  const [fileName, setFileName] = React.useState('')
  // ✅ คลังรูปภาพเกมปาร์ตี้ (อัปโหลดเข้า DB แล้ว ใช้สุ่มเลือกให้แต่ละรอบ)
  const [partyImagePool, setPartyImagePool] = React.useState<PartyPoolImage[]>([])
  const [partyImagePoolLoading, setPartyImagePoolLoading] = React.useState(false)
  const [partyImagePoolUploading, setPartyImagePoolUploading] = React.useState(false)
  const [partyImagePoolClearing, setPartyImagePoolClearing] = React.useState(false)
  // ✅ โหมดเกมปาร์ตี้ (ระบบเดิม / ระบบใหม่)
  const [partyMode, setPartyMode] = React.useState<PartyMode>(DEFAULT_PARTY_MODE)
  const [partyRoundsCount, setPartyRoundsCount] = React.useState(1)
  const [partyRounds, setPartyRounds] = React.useState<PartyRoundConfig[]>([createEmptyPartyRound(1)])
  const [telegramPartyImageUrl, setTelegramPartyImageUrl] = React.useState('')
  const [telegramPartyImageFile, setTelegramPartyImageFile] = React.useState<File | null>(null)
  const [telegramPartyImagePreview, setTelegramPartyImagePreview] = React.useState('')
  const [telegramPartyMessage, setTelegramPartyMessage] = React.useState('🎉 กิจกรรมใหม่: {gameName}\n\nเข้าร่วมกิจกรรมได้ที่ลิงก์นี้\n{playerLink}')
  const [telegramPartyCodeFullMessage, setTelegramPartyCodeFullMessage] = React.useState(DEFAULT_PARTY_CODE_FULL_CLASSIC)
  const [telegramPartyCodeFullRandomMessage, setTelegramPartyCodeFullRandomMessage] = React.useState(DEFAULT_PARTY_CODE_FULL_RANDOM)
  const [telegramConfigLoaded, setTelegramConfigLoaded] = React.useState(false)
  const [telegramConfigSaving, setTelegramConfigSaving] = React.useState(false)
  const [telegramSendMode, setTelegramSendMode] = React.useState<'now' | 'schedule'>('now')
  const [telegramScheduledAt, setTelegramScheduledAt] = React.useState('')
  const [pendingTelegramScheduleAt, setPendingTelegramScheduleAt] = React.useState<number | null>(null)
  const telegramScheduleTimeoutRef = React.useRef<number | null>(null)
  const [telegramRoundSendModes, setTelegramRoundSendModes] = React.useState<Record<number, 'now' | 'schedule'>>({})
  const [telegramRoundScheduledAt, setTelegramRoundScheduledAt] = React.useState<Record<number, string>>({})
  const [pendingTelegramRoundScheduleAt, setPendingTelegramRoundScheduleAt] = React.useState<Record<number, number>>({})
  const [telegramRoundSentStatus, setTelegramRoundSentStatus] = React.useState<Record<number, 'sent' | 'scheduled'>>({})
  const [cancelRoundConfirm, setCancelRoundConfirm] = React.useState<number | null>(null)
  const telegramRoundScheduleTimeoutRef = React.useRef<Record<number, number>>({})
  // ✅ เก็บ URL รูปภาพเก่าเพื่อลบออกเมื่ออัปโหลดรูปใหม่
  const [originalImageUrl, setOriginalImageUrl] = React.useState<string>('')
  // state เก็บผู้ที่เคยรับโค้ด (ใช้เป็น fallback เวลา infer คำตอบถูก)
  const [claimedBy, setClaimedBy] = React.useState<Record<string, { code?: string }>>({})
  const [claimedCodeUsers, setClaimedCodeUsers] = React.useState<Record<string, string>>({})

  // เฉพาะเกมทายภาพ
  const [answer, setAnswer] = React.useState('')

  // โค้ดแจก (ใช้ในเกมทายภาพ)
  const [numCodes, setNumCodes] = React.useState(1)
  const [codes, setCodes] = React.useState<string[]>([''])
  
  // โค้ดรางวัลใหญ่ (ใช้ในเกมลอยกระทง)
  const [numBigPrizeCodes, setNumBigPrizeCodes] = React.useState(1)
  const [bigPrizeCodes, setBigPrizeCodes] = React.useState<string[]>([''])
  const [maxUsers, setMaxUsers] = React.useState(50)
  const [readyCountdown, setReadyCountdown] = React.useState(3)
  const [numRooms, setNumRooms] = React.useState(1)

  // ระบบเลือก USER เข้าเล่นเกม
  const [userAccessType, setUserAccessType] = React.useState<'all' | 'selected'>('all')
  const [selectedUsers, setSelectedUsers] = React.useState<string[]>([])
  const [selectedUsersFile, setSelectedUsersFile] = React.useState<File | null>(null)


  // เฉพาะเกมทายผลบอล / เบอร์เงิน
  const [homeTeam, setHomeTeam] = React.useState('')
  const [awayTeam, setAwayTeam] = React.useState('')
  const [endAt, setEndAt] = React.useState<string>('') // datetime-local string
  const [resetCodeRound, setResetCodeRound] = React.useState(false);

  // ===== สิ้นสุดกิจกรรม (เกมทายเบอร์เงิน / เกมทายผลบอล) =====
  // คำตอบที่ถูก — ทายเบอร์เงิน: string เลขเดียว / ทายผลบอล: "X-Y"
  const [numberPickCorrectAnswer, setNumberPickCorrectAnswer] = React.useState('')
  const [numberPickEndedAt, setNumberPickEndedAt] = React.useState<number | null>(null)
  const [footballCorrectHome, setFootballCorrectHome] = React.useState('')
  const [footballCorrectAway, setFootballCorrectAway] = React.useState('')
  const [footballEndedAt, setFootballEndedAt] = React.useState<number | null>(null)
  // ===== สิ้นสุดกิจกรรม (เกมบอลโลก) — ผลแข่งจริง + รหัสรางวัล รายคู่ =====
  const [worldCupResults, setWorldCupResults] = React.useState<Record<string | number, WorldCupResultInput>>({})
  const [worldCupEnded, setWorldCupEnded] = React.useState<boolean>(false)
  const [worldCupEndedAt, setWorldCupEndedAt] = React.useState<number | null>(null)
  // ✅ โบนัสสะสมที่ผู้เล่นจะได้รับ "ต่อคู่" ที่ทายถูก (default 50) — เฉพาะภายในเกมนี้
  const [worldCupBonusPerCorrect, setWorldCupBonusPerCorrect] = React.useState<number>(50)
  // คำทาย "ล่าสุด" ของแต่ละ user แยกตาม matchId — โหลดจาก answers (cache 1 ครั้ง)
  // key: `${user}__${matchId}` → { home, away, ts, answer }
  const [worldCupLatestPredictions, setWorldCupLatestPredictions] = React.useState<
    Map<string, { userId: string; matchId: number; home: number; away: number; ts: number; answer: string }>
  >(() => new Map())
  // matchId ที่กำลังถูกประมวลผล (กดสิ้นสุดอยู่)
  const [worldCupBusyMatchId, setWorldCupBusyMatchId] = React.useState<number | null>(null)
  // ✅ Telegram (ประกาศผู้ชนะแต่ละคู่) — เกมบอลโลก
  // template ข้อความใช้ร่วมกันทั้งเกม (เก็บใน themeSettings) ส่วนรูปแยกต่อคู่ (matchResults[id].telegramImageUrl)
  const [worldCupTelegramMessage, setWorldCupTelegramMessage] = React.useState<string>(DEFAULT_WORLD_CUP_WINNERS_TEMPLATE)
  const [worldCupTelegramTemplateSaving, setWorldCupTelegramTemplateSaving] = React.useState<boolean>(false)
  const [worldCupTelegramSendingMatchId, setWorldCupTelegramSendingMatchId] = React.useState<number | null>(null)
  const [worldCupTelegramUploadingMatchId, setWorldCupTelegramUploadingMatchId] = React.useState<number | null>(null)

  // ✅ รูปภาพแจ้งเตือนเข้าสู่เกม (เกมบอลโลก) — แสดง popup เมื่อผู้เล่นเข้าเกม
  const [worldCupNoticeImageDataUrl, setWorldCupNoticeImageDataUrl] = React.useState<string>('')
  const [worldCupNoticeImageFile, setWorldCupNoticeImageFile] = React.useState<File | null>(null)
  const [worldCupNoticeImageFileName, setWorldCupNoticeImageFileName] = React.useState<string>('')
  const [worldCupNoticeImageUploading, setWorldCupNoticeImageUploading] = React.useState<boolean>(false)
  const [originalWorldCupNoticeImageUrl, setOriginalWorldCupNoticeImageUrl] = React.useState<string>('')
  // รายการ answers (ใช้คำนวณ winners) สำหรับสองเกมนี้
  const [winnersAnswersList, setWinnersAnswersList] = React.useState<Array<{ user: string; answer: string; ts: number }>>([])
  const [winnersAnswersLoading, setWinnersAnswersLoading] = React.useState(false)
  const [endingActivity, setEndingActivity] = React.useState(false)

  // ===== ไฟล์รายงานฝาก (ตรวจยอดฝากของผู้ทายล่าสุดถูก) =====
  // อ่านคอลัม B (username), G (Amount), K (Finance Type) → สร้างเป็น "ยอดรวม/USER"
  // เก็บเป็น Map (key = normalized username, value = ยอดรวมเฉพาะ Finance Type ที่กำหนด)
  // บันทึกลง gameData.numberPick.depositReport / gameData.football.depositReport (per game)
  const [depositSumByUser, setDepositSumByUser] = React.useState<Map<string, number>>(new Map())
  const [depositTotalRows, setDepositTotalRows] = React.useState(0)
  const [depositFileName, setDepositFileName] = React.useState('')
  const [depositUploadedAt, setDepositUploadedAt] = React.useState<number | null>(null)
  const [depositLoading, setDepositLoading] = React.useState(false)
  const [depositError, setDepositError] = React.useState('')

  // ===== Telegram ประกาศผู้ชนะ =====
  const [winnersTelegramMessage, setWinnersTelegramMessage] = React.useState('')
  const [winnersTelegramImageUrl, setWinnersTelegramImageUrl] = React.useState('')
  const [winnersTelegramImageFile, setWinnersTelegramImageFile] = React.useState<File | null>(null)
  const [winnersTelegramImagePreview, setWinnersTelegramImagePreview] = React.useState('')
  const [winnersTelegramConfigSaving, setWinnersTelegramConfigSaving] = React.useState(false)
  const [winnersTelegramSending, setWinnersTelegramSending] = React.useState(false)
  // ✅ สถานะอัปโหลด/auto-save รูปประกาศ (เลือกรูปแล้วบันทึกทันทีไม่ต้องกดปุ่ม)
  const [winnersTelegramImageUploading, setWinnersTelegramImageUploading] = React.useState(false)
  
  // ===== เช็คอิน - รูปภาพแจ้งเตือน
  const [checkinImageDataUrl, setCheckinImageDataUrl] = React.useState('') // ✅ เก็บ CDN URL หรือ data URL
  const [checkinImageFile, setCheckinImageFile] = React.useState<File | null>(null) // ✅ เก็บ File object ที่เลือกไว้ (รออัปโหลดตอนสร้างเกม)
  const [checkinImageUploading, setCheckinImageUploading] = React.useState(false)
  const [checkinFileName, setCheckinFileName] = React.useState('')
  // ✅ เก็บ URL รูปภาพเก่าเพื่อลบออกเมื่ออัปโหลดรูปใหม่
  const [originalCheckinImageUrl, setOriginalCheckinImageUrl] = React.useState<string>('')

  // ===== เช็คอิน
  const [checkinDays, setCheckinDays] = React.useState(1)
  // ✅ รางวัลเช็คอิน (ไม่ใช้ date แล้ว)
  const [rewards, setRewards] = React.useState<CheckinReward[]>(
    Array.from({ length: 1 }).map(() => ({ kind: 'coin', value: 100 }))
  )
  // ✅ รางวัลสำหรับผู้ที่เช็คอินครบทุกวัน
  const [completeReward, setCompleteReward] = React.useState<CheckinReward>({ kind: 'coin', value: 0 })
  // ✅ วันที่เริ่มต้นและสิ้นสุดกิจกรรม (YYYY-MM-DD)
  const [checkinStartDate, setCheckinStartDate] = React.useState<string>('')
  const [checkinEndDate, setCheckinEndDate] = React.useState<string>('')
  
  // ✅ ฟังก์ชันคำนวณจำนวนวันจากวันที่เริ่มต้นและสิ้นสุด
  const calculateDaysFromDates = (startDate: string, endDate: string): number => {
    if (!startDate || !endDate) return 0
    try {
      const start = new Date(startDate + 'T00:00:00')
      const end = new Date(endDate + 'T00:00:00')
      if (isNaN(start.getTime()) || isNaN(end.getTime())) return 0
      if (end < start) return 0
      // คำนวณจำนวนวัน (รวมทั้งวันเริ่มต้นและวันสิ้นสุด)
      const diffTime = end.getTime() - start.getTime()
      const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24)) + 1
      return Math.max(1, diffDays)
    } catch {
      return 0
    }
  }
  
  // ✅ คำนวณจำนวนวันอัตโนมัติเมื่อวันที่เริ่มต้นหรือสิ้นสุดเปลี่ยน
  React.useEffect(() => {
    if (checkinStartDate && checkinEndDate) {
      // ✅ ตรวจสอบว่าวันที่เริ่มต้นไม่เกินวันที่สิ้นสุด
      if (checkinStartDate > checkinEndDate) {
        // ถ้าวันที่เริ่มต้นเกินวันที่สิ้นสุด ไม่ต้องคำนวณ
        return
      }
      
      const calculatedDays = calculateDaysFromDates(checkinStartDate, checkinEndDate)
      if (calculatedDays > 0 && calculatedDays <= 30) {
        setCheckinDays(calculatedDays)
        // ปรับ rewards ให้มีจำนวนตาม calculatedDays
        setRewards(prev => {
          const next = [...prev]
          if (next.length < calculatedDays) {
            while (next.length < calculatedDays) {
              next.push({ kind: 'coin', value: 100 })
            }
          } else {
            next.length = calculatedDays
          }
          return next
        })
      } else if (calculatedDays > 30) {
        // ถ้าคำนวณได้มากกว่า 30 วัน ให้แจ้งเตือน (แต่ไม่บังคับ)
      }
    }
  }, [checkinStartDate, checkinEndDate])
  // ✅ ระบบเปิด/ปิดส่วนต่างๆ ในหน้าเกม
  const normalizeFeatureFlag = React.useCallback((value: any, fallback: boolean = true) => {
    if (value === undefined || value === null) return fallback
    if (typeof value === 'boolean') return value
    if (typeof value === 'number') return value !== 0
    const str = String(value).trim().toLowerCase()
    if (str === '' || str === 'true') return true
    if (str === 'false' || str === '0' || str === 'off' || str === 'no' || str === 'disabled') return false
    return fallback
  }, [])

  const [checkinFeatures, setCheckinFeatures] = React.useState({
    dailyReward: true,
    couponShop: true
  })
  const [checkinContactSettings, setCheckinContactSettings] = React.useState({
    telegramUrl: themeName === 'max56' ? 'https://t.me/MAX56VIP' : 'https://t.me/HENG36_VIP',
    lineUrl: CHECKIN_LINE_CONTACT_BY_THEME[themeName] || CHECKIN_LINE_CONTACT_BY_THEME.heng36,
    websiteUrl: '',
    websiteLabel: (
      {
        heng36: 'HENG36',
        max56: 'MAX56',
        jeed24: 'JEED24',
        kamo99: 'KAMO99',
        kiki49: 'KIKI49',
        abm96: 'ABM96',
        mab96: 'MAB96',
      } as Record<string, string>
    )[themeName] || 'HENG36',
  })
  const [checkinContactSettingsSaving, setCheckinContactSettingsSaving] = React.useState(false)
  
  // ✅ State สำหรับ popup ยืนยันการเปลี่ยนแปลง
  const [confirmFeatureChange, setConfirmFeatureChange] = React.useState<{
    open: boolean
    feature: 'dailyReward' | 'couponShop' | null
    newValue: boolean
    oldValue: boolean
  }>({
    open: false,
    feature: null,
    newValue: false,
    oldValue: false
  })

  // ✅ State สำหรับ popup ยืนยันการอัพโหลดโค้ด
  const [confirmCodeUpload, setConfirmCodeUpload] = React.useState<{
    open: boolean
    type: 'dailyReward' | 'completeReward' | 'couponItem' | null
    index: number | null
    codes: string[] | null
    onConfirm: (() => void) | null
  }>({
    open: false,
    type: null,
    index: null,
    codes: null,
    onConfirm: null
  })
  
  const [showSubmitConfirm, setShowSubmitConfirm] = React.useState(false)
  const [showDeleteConfirm, setShowDeleteConfirm] = React.useState(false)
  const [announceToast, setAnnounceToast] = React.useState<{ msg: string; type: 'success' | 'error' | 'info' } | null>(null)
  React.useEffect(() => { if (!announceToast) return; const t = setTimeout(() => setAnnounceToast(null), 3500); return () => clearTimeout(t) }, [announceToast])

  // ✅ ฟังก์ชันสำหรับเปลี่ยน feature พร้อม popup ยืนยัน
  const handleFeatureChange = (feature: 'dailyReward' | 'couponShop', newValue: boolean) => {
    const oldValue = checkinFeatures[feature]
    if (oldValue === newValue) return // ไม่มีการเปลี่ยนแปลง
    
    // ✅ แสดง popup ยืนยัน
    setConfirmFeatureChange({
      open: true,
      feature,
      newValue,
      oldValue
    })
  }
  
  // ✅ ฟังก์ชันยืนยันการเปลี่ยนแปลง
  const confirmFeatureChangeHandler = async () => {
    if (confirmFeatureChange.feature) {
      // ✅ อัพเดต state
      const newFeatures = {
        ...checkinFeatures,
        [confirmFeatureChange.feature!]: confirmFeatureChange.newValue
      }
      setCheckinFeatures(newFeatures)
      
      // ✅ บันทึกลง Firebase ทันที (ถ้าเป็นเกมเช็คอินและอยู่ในโหมดแก้ไข)
      if (isEdit && gameId && type === 'เกมเช็คอิน') {
        try {
          // ✅ บันทึกเฉพาะ features ลง Firestore
          try {
            const currentGame = (await getGameById(gameId) || {}) as GameData
            await updateGame(gameId, {
              ...currentGame,
              gameData: {
                ...(currentGame as any).gameData,
                checkin: {
                  ...(currentGame as any).gameData?.checkin,
                  features: newFeatures
                }
              }
            })
          } catch (error) {
            console.error('Error updating checkin features:', error)
          }
          
          // ✅ Invalidate cache
          dataCache.invalidateGame(gameId)
        } catch (error) {
          console.error('[CreateGame] Error saving features:', error)
          // ✅ ถ้าบันทึกไม่สำเร็จ ให้ revert state
          setCheckinFeatures(checkinFeatures)
          alert('เกิดข้อผิดพลาดในการบันทึกการตั้งค่า กรุณาลองใหม่อีกครั้ง')
        }
      }
    }
    
    setConfirmFeatureChange({
      open: false,
      feature: null,
      newValue: false,
      oldValue: false
    })
  }
  
  // ✅ ฟังก์ชันยกเลิกการเปลี่ยนแปลง
  const cancelFeatureChangeHandler = () => {
    setConfirmFeatureChange({
      open: false,
      feature: null,
      newValue: false,
      oldValue: false
    })
  }

  const saveCheckinContactSettings = async () => {
    if (type !== 'เกมเช็คอิน') return
    if (!isEdit || !gameId) {
      alert('กรุณาบันทึกเกมก่อน แล้วค่อยบันทึกช่องทางติดต่อ')
      return
    }

    try {
      setCheckinContactSettingsSaving(true)
      const telegramUrl = String(checkinContactSettings.telegramUrl || '').trim()
      const lineUrl = String(checkinContactSettings.lineUrl || '').trim()
      const websiteUrl = String(checkinContactSettings.websiteUrl || '').trim()
      const websiteLabel = String(checkinContactSettings.websiteLabel || '').trim()

      const currentGame = (await getGameById(gameId) || {}) as GameData
      const currentCheckin = (currentGame as any).checkin || (currentGame as any).gameData?.checkin || {}

      await updateGame(gameId, {
        checkin: {
          ...currentCheckin,
          contactChannels: {
            ...(currentCheckin.contactChannels || {}),
            telegramUrl,
            lineUrl,
            websiteUrl,
            websiteLabel,
          },
        },
      })

      setCheckinContactSettings({
        telegramUrl,
        lineUrl,
        websiteUrl,
        websiteLabel,
      })
      dataCache.invalidateGame(gameId)
      alert('บันทึกช่องทางติดต่อเรียบร้อยแล้ว')
    } catch (error) {
      console.error('[CreateGame] Error saving checkin contact settings:', error)
      alert('บันทึกช่องทางติดต่อไม่สำเร็จ กรุณาลองใหม่อีกครั้ง')
    } finally {
      setCheckinContactSettingsSaving(false)
    }
  }
  const [couponCount, setCouponCount] = React.useState(1);
  const [couponItems, setCouponItems] = React.useState<CouponTier[]>(
    Array.from({ length: 1 }).map((_, i) => ({
      title: '',
      rewardCredit: [50][i] ?? 5000,
      price:        [10,50,100,200,300,500][i] ?? 10,
      codes: [''],  // ✅ เก็บเฉพาะโค้ดที่ผู้ใช้กรอกใหม่ ไม่โหลดทั้งหมดจาก DB
    }))
  );
  // ✅ เก็บจำนวนโค้ดสำหรับแต่ละ coupon item (ไม่โหลดโค้ดทั้งหมดมา)
  const [couponItemCodeCounts, setCouponItemCodeCounts] = React.useState<number[]>([]);
  const [couponItemCodeCountsLoading, setCouponItemCodeCountsLoading] = React.useState(false);
  // ✅ เก็บโค้ดที่อัพโหลดใหม่สำหรับ coupon items (เพื่อบันทึกไปที่ DB)
  const [couponItemCodesNew, setCouponItemCodesNew] = React.useState<string[][]>([]);
  // ✅ เก็บจำนวนโค้ดสำหรับ daily rewards (ไม่โหลดโค้ดทั้งหมดมา)
  const [dailyRewardCodeCounts, setDailyRewardCodeCounts] = React.useState<number[]>([]);
  const [dailyRewardCodeCountsLoading, setDailyRewardCodeCountsLoading] = React.useState(false);
  // ✅ เก็บโค้ดที่อัพโหลดใหม่สำหรับ daily rewards (เพื่อบันทึกไปที่ DB)
  const [dailyRewardCodes, setDailyRewardCodes] = React.useState<string[][]>([]);
  // ✅ เก็บจำนวนโค้ดสำหรับ complete reward (ไม่โหลดโค้ดทั้งหมดมา)
  const [completeRewardCodeCount, setCompleteRewardCodeCount] = React.useState<number>(0);
  const [completeRewardCodeCountLoading, setCompleteRewardCodeCountLoading] = React.useState(false);
  // ✅ เก็บโค้ดที่อัพโหลดใหม่สำหรับ complete reward (เพื่อบันทึกไปที่ DB)
  const [completeRewardCodes, setCompleteRewardCodes] = React.useState<string[]>([]);
// ===== รายงานการใช้งาน (หน้าเกมเช็คอิน) =====
const [allUsers, setAllUsers] = React.useState<UserBalanceRow[]>([])
const [logCheckin, setLogCheckin] = React.useState<UsageLog[]>([])
const [logSlot, setLogSlot] = React.useState<UsageLog[]>([])
const [logCoupon, setLogCoupon] = React.useState<UsageLog[]>([])

// Loading states for different data sections
const [checkinDataLoading, setCheckinDataLoading] = React.useState(false)
const [slotDataLoading, setSlotDataLoading] = React.useState(false)

  // รายชื่อผู้ได้รับรางวัลจาก CSV (อ่านเฉพาะคอลัมน์แรก col=0 ตั้งแต่แถว1)
  const [announceUsers, setAnnounceUsers] = React.useState<string[]>([])
  const [announceUserBonuses, setAnnounceUserBonuses] = React.useState<Array<{ user: string; bonus: number }>>([])
  const [announceImageDataUrl, setAnnounceImageDataUrl] = React.useState<string>('') // ✅ เก็บ CDN URL หรือ data URL
  const [announceImageFile, setAnnounceImageFile] = React.useState<File | null>(null) // ✅ เก็บ File object ที่เลือกไว้ (รออัปโหลดตอนสร้างเกม)
  const [announceImageUploading, setAnnounceImageUploading] = React.useState(false)

  // ✅ Referral (เกมแนะนำเพื่อน) states
  const [referralDeposits, setReferralDeposits] = React.useState<ReferralRow[]>([])
  const [referralRegisters, setReferralRegisters] = React.useState<ReferralRow[]>([])
  const [referralSummaries, setReferralSummaries] = React.useState<ReferralSummary[]>([])
  const [referralDepositUploading, setReferralDepositUploading] = React.useState(false)
  const [referralRegisterUploading, setReferralRegisterUploading] = React.useState(false)
  const [referralSearchTerm, setReferralSearchTerm] = React.useState('')
  const [referralExporting, setReferralExporting] = React.useState(false)
  const [referralPopup, setReferralPopup] = React.useState<{ type: 'success' | 'error'; title: string; lines: string[] } | null>(null)
  const referralDepositFileRef = React.useRef<HTMLInputElement>(null)
  const referralRegisterFileRef = React.useRef<HTMLInputElement>(null)
  const [pendingDepositRows, setPendingDepositRows] = React.useState<ReferralRow[] | null>(null)
  const [pendingDepositFileName, setPendingDepositFileName] = React.useState('')
  const [pendingRegisterRows, setPendingRegisterRows] = React.useState<ReferralRow[] | null>(null)
  const [pendingRegisterFileName, setPendingRegisterFileName] = React.useState('')

  // ===== Referral - รูปภาพแนะนำเพื่อน
  const [referralImageDataUrl, setReferralImageDataUrl] = React.useState('')
  const [referralImageFile, setReferralImageFile] = React.useState<File | null>(null)
  const [referralImageUploading, setReferralImageUploading] = React.useState(false)
  const [referralImageFileName, setReferralImageFileName] = React.useState('')
  const [originalReferralImageUrl, setOriginalReferralImageUrl] = React.useState<string>('')
  // ===== Referral - รางวัลและสิ้นสุดกิจกรรม
  const [referralPrizes, setReferralPrizes] = React.useState({ rank1: 3000, rank2: 2000, rank3: 1000, rank4to10: 300, rank11to50: 100 })
  const [referralEnded, setReferralEnded] = React.useState(false)
  const [referralEndedAt, setReferralEndedAt] = React.useState<number | null>(null)
  const [referralEndingGame, setReferralEndingGame] = React.useState(false)
  const [referralEndConfirmOpen, setReferralEndConfirmOpen] = React.useState(false)
  // ✅ เก็บ URL รูปภาพเก่าเพื่อลบออกเมื่ออัปโหลดรูปใหม่
  const [originalAnnounceImageUrl, setOriginalAnnounceImageUrl] = React.useState<string>('')
  const [announceFileName, setAnnounceFileName] = React.useState<string>('')

  // เฉพาะเกมลุ้นรางวัลพิเศษ
  const [trickOrTreatWinChance, setTrickOrTreatWinChance] = React.useState(50) // โอกาสชนะ (0-100)

  // เฉพาะเกมป๊อกเด้ง — NPC stand threshold (default 5: NPC จั่วเมื่อแต้ม 0–4, อยู่เมื่อ 5+)
  const [pokDengNpcStand, setPokDengNpcStand] = React.useState<number>(5)
  // อัตราที่ผู้เล่นจะชนะ NPC (%) — pre-determine outcome (default 50)
  const [pokDengWinChance, setPokDengWinChance] = React.useState<number>(50)
  const originalPokDengCodesRef = React.useRef<string[]>([])
  // ✅ รูปภาพการ์ด 3 แบบ (แยกจากข้อมูลเกม)
  const [cardImage1, setCardImage1] = React.useState<string>('') // การ์ดปก (ก่อนเลือก)
  const [cardImage2, setCardImage2] = React.useState<string>('') // การ์ดชนะ
  const [cardImage3, setCardImage3] = React.useState<string>('') // การ์ดแพ้
  const [cardImage1File, setCardImage1File] = React.useState<File | null>(null)
  const [cardImage2File, setCardImage2File] = React.useState<File | null>(null)
  const [cardImage3File, setCardImage3File] = React.useState<File | null>(null)
  const [cardImage1Uploading, setCardImage1Uploading] = React.useState(false)
  const [cardImage2Uploading, setCardImage2Uploading] = React.useState(false)
  const [cardImage3Uploading, setCardImage3Uploading] = React.useState(false)
  const [originalCardImage1Url, setOriginalCardImage1Url] = React.useState<string>('')
  const [originalCardImage2Url, setOriginalCardImage2Url] = React.useState<string>('')
  const [originalCardImage3Url, setOriginalCardImage3Url] = React.useState<string>('')

const parseUsersAndBonuses = (text: string) => {
  const lines = text.split(/\r?\n/)
  const users: string[] = []
  const userBonuses: Array<{ user: string; bonus: number }> = []
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    if (!line) continue
    
    // แยก CSV แบบง่ายพอสำหรับคอลัมน์ A และ B (รองรับคอมมา/เซมิโคลอน/แท็บ)
    const cells = line.split(/[,;\t]/)
    const user = (cells[0] ?? '').trim()
    const bonusStr = (cells[1] ?? '').trim()
    
    if (user) {
      users.push(user)
      
      // ถ้ามี BONUS ในคอลัมน์ B ให้เพิ่มเข้าไป
      if (bonusStr) {
        const bonus = Number(bonusStr) || 0
        userBonuses.push({ user, bonus })
      }
    }
  }
  
  // unique แบบคงลำดับ
  const seenUsers = new Set<string>(), uniqUsers: string[] = []
  for (const u of users) if (!seenUsers.has(u)) { seenUsers.add(u); uniqUsers.push(u) }
  
  const seenBonuses = new Set<string>(), uniqBonuses: Array<{ user: string; bonus: number }> = []
  for (const item of userBonuses) if (!seenBonuses.has(item.user)) { seenBonuses.add(item.user); uniqBonuses.push(item) }
  
  return { users: uniqUsers, userBonuses: uniqBonuses }
}

async function importAnnounceUsers(file?: File) {
  if (!file) return
  const showToast = (msg: string, type: 'success' | 'error' | 'info') => setAnnounceToast({ msg, type })
  const ext = (file.name.split('.').pop() || '').toLowerCase()
  if (ext === 'csv' || ext === 'txt') {
    const text = await file.text()
    const { users, userBonuses } = parseUsersAndBonuses(text)
    if (!users.length) { showToast('ไม่พบ USER ในคอลัมน์ A', 'error'); return }
    
    setAnnounceUsers(users)
    setAnnounceUserBonuses(userBonuses)
    
    let message = `นำเข้า USER ${users.length.toLocaleString()} รายการ`
    if (userBonuses.length > 0) message += ` พร้อม BONUS ${userBonuses.length.toLocaleString()} รายการ`
    showToast(message, 'success')
    return
  }
  const buf = await file.arrayBuffer()
  const wb = XLSX.read(new Uint8Array(buf), { type:'array' })
  const ws = wb.Sheets[wb.SheetNames[0]]
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1 }) as any[][]
  
  const users: string[] = []
  const userBonuses: Array<{ user: string; bonus: number }> = []
  
  for (let r = 0; r < rows.length; r++) {
    const row = rows[r]
    if (!row) continue
    
    const user = (row[0] ?? '').toString().trim()
    const bonusStr = (row[1] ?? '').toString().trim()
    
    if (user) {
      users.push(user)
      if (bonusStr) {
        const bonus = Number(bonusStr) || 0
        userBonuses.push({ user, bonus })
      }
    }
  }
  
  const seenUsers = new Set<string>(), uniqUsers: string[] = []
  for (const u of users) if (!seenUsers.has(u)) { seenUsers.add(u); uniqUsers.push(u) }
  
  const seenBonuses = new Set<string>(), uniqBonuses: Array<{ user: string; bonus: number }> = []
  for (const item of userBonuses) if (!seenBonuses.has(item.user)) { seenBonuses.add(item.user); uniqBonuses.push(item) }
  
  if (!uniqUsers.length) { showToast('ไม่พบ USER ในคอลัมน์ A', 'error'); return }
  
  setAnnounceUsers(uniqUsers)
  setAnnounceUserBonuses(uniqBonuses)
  
  let message = `นำเข้า USER ${uniqUsers.length.toLocaleString()} รายการ`
  if (uniqBonuses.length > 0) message += ` พร้อม BONUS ${uniqBonuses.length.toLocaleString()} รายการ`
  showToast(message, 'success')
}

// ฟังก์ชันอัพโหลด USER ที่เลือกไว้
async function importSelectedUsers(file?: File) {
  if (!file) return
  
  try {
    const text = await file.text()
    const lines = text.split('\n').map(line => line.trim()).filter(Boolean)
    
    if (lines.length === 0) {
      alert('ไม่พบ USER ในไฟล์')
      return
    }
    
    // กรอง USER ที่ไม่ซ้ำ
    const uniqueUsers = [...new Set(lines)]
    setSelectedUsers(uniqueUsers)
    setSelectedUsersFile(file)
    
    alert(`นำเข้า USER ${uniqueUsers.length} รายการ`)
  } catch (error) {
    console.error('Error importing users:', error)
    alert('เกิดข้อผิดพลาดในการอ่านไฟล์')
  }
}


const fmtNum = (n?: number) =>
  Number(n ?? 0).toLocaleString('th-TH', { maximumFractionDigits: 0 })

// ชื่อคูปองจาก index ใน shop ปัจจุบัน
const couponNameByIndex = (idx?: number) => {
  const i = Number(idx)
  const it = Number.isFinite(i) ? couponItems[i] : undefined
  if (!it) return '-'
  const title = (it.title || '').trim()
  if (title) return title
  const credit = Number(it.rewardCredit || 0)
  return `x${credit.toLocaleString('th-TH')}`
}

// fallback: หา index จาก CODE ที่ได้รับ (ถ้า log ยังไม่เก็บ itemIndex)
const findCouponIndexByCode = (code?: string) => {
  if (!code) return -1
  const c = String(code).trim()
  for (let i = 0; i < couponItems.length; i++) {
    const codes = couponItems[i]?.codes || []
    if (codes.some(x => String(x).trim() === c)) return i
  }
  return -1
}

// ชื่อคูปองจากแถว log
const couponNameFromLog = (r: UsageLog) => {
  let idx = Number.isFinite(r.itemIndex) ? Number(r.itemIndex) : -1
  if (idx < 0) idx = findCouponIndexByCode(r.code)
  return couponNameByIndex(idx)
}



  // เฉพาะเกมสล็อต
  const [slot, setSlot] = React.useState<SlotCfg>({
    startCredit: 100,
    startBet: 1,
    winRate: 30,
    targetCredit: 200,
    winTiers: undefined,
  })

  // ====== โซนล่าง (ตามรูป) ======
  // ✅ ลบ state answers ออกแล้ว (ย้ายไปไว้ในหน้า AdminAnswers.tsx แล้ว)

    type UsageLog = {
    ts: number
    user: string
    action: 'checkin' | 'slot' | 'coupon-redeem'
    amount?: number        // ได้เหรียญ (checkin) / ผลสุทธิสล็อต (+/-)
    price?: number         // ราคาที่ใช้แลกคูปอง
    itemIndex?: number     // แถวคูปอง (เริ่ม 0)
    bet?: number           // เบทสล็อต
    balanceBefore?: number
    balanceAfter?: number
    dayIndex?: number  
    code?: string 
  }

  type UserBalanceRow = { user: string; hcoin: number }

// ===== Helpers: นำเข้า CODE จาก Excel/CSV (ดึงทุกคอลัมน์/ทุกบรรทัด + คงลำดับ) =====
const uniqKeepOrder = (arr: string[]) => {
  const seen = new Set<string>(), out: string[] = [];
  for (const raw of arr) {
    const s = (raw ?? '').toString().trim();
    if (!s || seen.has(s)) continue;
    seen.add(s);
    out.push(s);
  }
  return out;
};

// แยกบรรทัด CSV เป็นเซลล์ (รองรับ "..." )
const splitCsvLine = (line: string) => {
  const out: string[] = [];
  let cur = '', q = false;
  for (const ch of line) {
    if (ch === '"') { q = !q; continue; }
    if (!q && (ch === ',' || ch === ';' || ch === '\t')) { out.push(cur); cur=''; continue; }
    cur += ch;
  }
  out.push(cur);
  return out.map(s => s.trim());
};

// คำที่ถือว่าเป็นหัวตาราง
const isHeader = (s: string) => /^code$/i.test(s) || /โค้ด/i.test(s) || /coupon/i.test(s);

// แยกโค้ดหลายตัวที่อยู่ในเซลล์เดียว (เช่น มีขึ้นบรรทัด/คอมมา/เซมิโคลอน/ช่องว่าง)
const splitCellCodes = (v: string) =>
  (v ?? '')
    .toString()
    .split(/[\r\n,;|\t ]+/)   // แยกด้วย newline, comma, semicolon, tab, space
    .map(s => s.trim())
    .filter(Boolean);

// ✅ ดึงโค้ดจาก "ทุกเซลล์" ของชีต (ซ้าย→ขวา, บน→ล่าง) และคงลำดับ
const extractCodesFromRows = (rows: any[][]): string[] => {
  if (!rows?.length) return [];
  const codes: string[] = [];
  
  for (let r = 0; r < rows.length; r++) {
    const row = rows[r] || [];
    
    // ข้ามแถวแรกที่เป็นหัวตาราง
    if (r === 0) continue;
    
    // ตรวจสอบว่ามีคอลัมน์ครบ (อย่างน้อย 11 คอลัมน์)
    if (row.length >= 11) {
      const serialCode = String(row[4] || '').trim(); // คอลัมน์ E (index 4)
      const colG = String(row[6] || '').trim(); // คอลัมน์ G (index 6)
      const colH = String(row[7] || '').trim(); // คอลัมน์ H (index 7)
      const colK = String(row[10] || '').trim(); // คอลัมน์ K (index 10)
      
      // เช็คเงื่อนไขจากคอลัมน์ G, H, K (ต้องว่างทั้งหมด) และมี serialcode
      if (serialCode && !colG && !colH && !colK) {
        codes.push(serialCode);
      }
    }
  }
  
  return uniqKeepOrder(codes);
};

async function parseCodesFromFile(file: File): Promise<string[]> {
  const ext = (file.name.split('.').pop() || '').toLowerCase();

  if (ext === 'csv' || ext === 'txt') {
    const text = await file.text();
    const lines = text.split(/\r?\n/).filter(line => line.trim());
    const rows = lines.map(line => line.split(',').map(col => col.trim().replace(/"/g, '')));
    return extractCodesFromRows(rows);
  }

  // .xlsx/.xls ใช้ SheetJS (XLSX) ถ้ามี
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(new Uint8Array(buf), { type: 'array' });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1 }) as any[][];
  return extractCodesFromRows(rows);
}

// ✅ importCodesForRow จะถูกสร้างใหม่ใน component เพื่อใช้ state setters


  // ✅ OPTIMIZED: โหลด ALL USER + COIN คงเหลือ - ใช้ get() แทน onValue() เพื่อลด download
  // ✅ ใช้ cache และ refresh เมื่อต้องการ (เมื่อ focus window หรือกด refresh)
  React.useEffect(() => {
    let isMounted = true
    
    const loadUsers = async () => {
      try {
        // ✅ ใช้ Firestore
        const MAX_USERS_DISPLAY = 100 // แสดงเฉพาะ top 100 users (ตาม hcoin)
        const result = await getAllUsers(1, MAX_USERS_DISPLAY, '', themeName) // ✅ ส่ง themeName ไปด้วย
        
        if (!isMounted) return
        
        // แปลงเป็น UserBalanceRow format
        const rows: UserBalanceRow[] = (result.users || []).map(u => ({
          user: u.userId,
          hcoin: Number(u.hcoin ?? 0),
        }))
        
        if (isMounted) {
          setAllUsers(rows)
        }
      } catch (error) {
        console.error('Error loading users:', error)
        // ✅ แสดง error message ที่ชัดเจนกว่า
        if (error instanceof Error) {
          console.error('Error details:', {
            message: error.message,
            name: error.name,
            stack: error.stack
          })
        }
        // ✅ ตั้งค่า empty array แทนการ throw error (เพื่อไม่ให้ UI crash)
        if (isMounted) {
          setAllUsers([])
        }
      }
    }
    
    // ✅ ลบการโหลดอัตโนมัติ - getAllUsers จะถูกเรียกเฉพาะเมื่อจำเป็นเท่านั้น
    // loadUsers() // ไม่โหลดอัตโนมัติ
    
    return () => {
      isMounted = false
    }
  }, [])
// โหลด LOG จาก checkins table และ answers table - Lazy Loading
const loadCheckinData = React.useCallback(async () => {
  if (!isEdit || !gameId) return
  
  setCheckinDataLoading(true)
  try {
    // ✅ OPTIMIZED: ใช้ checkins API เพื่อดึงข้อมูล checkin ทั้งหมด (เร็วกว่าและแม่นยำกว่า)
    const checkinsByUser = await getAllCheckins(gameId, 365) // 365 วัน
    
    // ✅ แปลง checkins data เป็น UsageLog format (เพื่อ backward compatibility)
    const rows: UsageLog[] = []
    
    // วน loop checkins เพื่อสร้าง rows
    for (const [userId, userCheckins] of Object.entries(checkinsByUser)) {
      for (const [dayIndexStr, checkinData] of Object.entries(userCheckins)) {
        if (checkinData && typeof checkinData === 'object') {
          const cd = checkinData as any
          if (cd.checked) {
            const dayIndex = parseInt(dayIndexStr)
            const ts = cd.createdAt ? new Date(cd.createdAt).getTime() : Date.now()
            
            rows.push({
              ts,
              user: userId,
              action: 'checkin',
              dayIndex: dayIndex,
              code: cd.key || undefined,
            })
          }
        }
      }
    }
    
    // ✅ โหลด coupon-redeem จาก answers (ยังใช้ answers เพราะไม่มี table แยก)
    try {
      const allAnswers = await getAnswers(gameId, 10000)
      const couponRows = allAnswers
        .filter(a => {
          // ✅ Parse answer field (อาจเป็น JSON string หรือ object)
          let payload: any = null
          if (typeof a.answer === 'string' && a.answer.trim().startsWith('{')) {
            try {
              payload = JSON.parse(a.answer)
            } catch {
              payload = null
            }
          } else if (typeof a.answer === 'object' && a.answer !== null) {
            payload = a.answer
          } else {
            // ✅ ถ้า answer เป็น string ธรรมดา ให้ใช้ top-level properties
            payload = a
          }
          return payload && typeof payload === 'object' && payload.action === 'coupon-redeem'
        })
        .map(a => {
          // ✅ Parse answer field (อาจเป็น JSON string หรือ object)
          let payload: any = null
          if (typeof a.answer === 'string' && a.answer.trim().startsWith('{')) {
            try {
              payload = JSON.parse(a.answer)
            } catch {
              payload = null
            }
          } else if (typeof a.answer === 'object' && a.answer !== null) {
            payload = a.answer
          } else {
            // ✅ ถ้า answer เป็น string ธรรมดา ให้ใช้ top-level properties
            payload = a
          }
          
          // ✅ แปลง ts เป็น number เสมอ
          const tsValue = typeof a.ts === 'number' ? a.ts : (a.createdAt ? new Date(a.createdAt).getTime() : Date.now())
          
          return {
            ts: tsValue,
            user: String((payload as any)?.user ?? (payload as any)?.username ?? a.userId ?? ''),
            action: 'coupon-redeem' as const,
            amount: Number((payload as any)?.amount ?? NaN),
            price: Number((payload as any)?.price ?? NaN),
            itemIndex: Number((payload as any)?.itemIndex ?? NaN),
            balanceBefore: Number((payload as any)?.balanceBefore ?? NaN),
            balanceAfter: Number((payload as any)?.balanceAfter ?? NaN),
            code: typeof (payload as any)?.code === 'string' ? String((payload as any).code) : (a.code || undefined),
          } as UsageLog
        })
      
      rows.push(...couponRows)
    } catch (err) {
      console.error('Error loading coupon data from answers:', err)
    }

    rows.sort((a, b) => b.ts - a.ts)
    const checkinRows = rows.filter((r) => r.action === 'checkin')
    setLogCheckin(checkinRows)
    setLogCoupon(rows.filter((r) => r.action === 'coupon-redeem'))
  } catch (error) {
    console.error('Error loading checkin data:', error)
    // ✅ Fallback: ลองโหลดจาก answers ถ้า checkins API ล้มเหลว
    try {
      const allAnswers = await getAnswers(gameId, 10000)
      const rows: UsageLog[] = []
      
      for (const answer of allAnswers) {
        // ✅ Parse answer field (อาจเป็น JSON string หรือ object)
        let payload: any = null
        if (typeof answer.answer === 'string' && answer.answer.trim().startsWith('{')) {
          try {
            payload = JSON.parse(answer.answer)
          } catch {
            payload = null
          }
        } else if (typeof answer.answer === 'object' && answer.answer !== null) {
          payload = answer.answer
        } else {
          // ✅ ถ้า answer เป็น string ธรรมดา ให้ใช้ top-level properties
          payload = answer
        }
        
        if (payload && typeof payload === 'object' && (payload as any).action) {
          // ✅ แปลง ts เป็น number เสมอ
          const tsValue = typeof answer.ts === 'number' ? answer.ts : (answer.createdAt ? new Date(answer.createdAt).getTime() : Date.now())
          
          rows.push({
            ts: tsValue,
            user: String((payload as any).user ?? (payload as any).username ?? answer.userId ?? ''),
            action: (payload as any).action as 'checkin' | 'slot' | 'coupon-redeem',
            amount: Number((payload as any).amount ?? NaN),
            price: Number((payload as any).price ?? NaN),
            itemIndex: Number((payload as any).itemIndex ?? NaN),
            dayIndex: Number((payload as any).dayIndex ?? NaN),
            code: typeof (payload as any).code === 'string' ? String((payload as any).code) : (answer.code || undefined),
          })
        }
      }
      
      rows.sort((a, b) => b.ts - a.ts)
      const checkinRows = rows.filter((r) => r.action === 'checkin')
      setLogCheckin(checkinRows)
      setLogCoupon(rows.filter((r) => r.action === 'coupon-redeem'))
    } catch (fallbackError) {
      console.error('Error loading checkin data from answers (fallback):', fallbackError)
    }
  } finally {
    setCheckinDataLoading(false)
  }
}, [isEdit, gameId])

  // โหลดข้อมูล checkin เมื่อเปลี่ยนเป็นเกมเช็คอิน (เฉพาะเมื่อ isEdit = true)
React.useEffect(() => {
  if (isEdit && type === 'เกมเช็คอิน') {
    loadCheckinData()
  }
}, [isEdit, type, loadCheckinData])

// โหลด "สล็อตล่าสุดต่อ USER" จาก answers_last/<gameId>/slot - Lazy Loading
const loadSlotData = React.useCallback(async () => {
  if (!isEdit || !gameId || type !== 'เกมสล็อต') return
  
  setSlotDataLoading(true)
  try {
    // ✅ ใช้ Firestore - โหลด answers ทั้งหมดแล้วกรองตาม action = 'slot'
    const allAnswers = await getAnswers(gameId, 10000)
    const slotAnswers = allAnswers.filter(a => a.answer?.includes('slot') || a.code?.includes('slot'))
    const v: Record<string, any> = {}
    
    // จัดกลุ่มตาม user
    for (const answer of slotAnswers) {
      const userId = answer.userId || (answer as any).user || ''
      if (userId) {
        v[userId] = {
          bet: answer.answer || 0,
          ...answer
        }
      }
    }
    
    const rows: UsageLog[] = Object.keys(v).map((u: string) => ({
      ts: Number(v[u]?.ts || 0),
      user: u,
      action: 'slot',
      bet: Number(v[u]?.bet || 0),
      balanceBefore: Number(v[u]?.balanceBefore ?? NaN),
      balanceAfter: Number(v[u]?.balanceAfter ?? NaN),
    }))
    rows.sort((a,b)=> b.ts - a.ts)
    setLogSlot(rows)
  } catch (error) {
    console.error('Error loading slot data:', error)
  } finally {
    setSlotDataLoading(false)
  }
}, [isEdit, gameId, type])

// โหลดข้อมูลสล็อตเมื่อเปลี่ยนเป็นเกมสล็อต (เฉพาะเมื่อ isEdit = true)
React.useEffect(() => {
  if (isEdit && type === 'เกมสล็อต') {
    loadSlotData()
  }
}, [isEdit, type, loadSlotData])

// ✅ โหลดคำตอบทั้งหมดของผู้เล่น สำหรับ "เกมทายเบอร์เงิน" / "เกมทายผลบอล"
// ใช้แสดงรายการผู้ทายคำตอบล่าสุดถูก ในส่วน "สิ้นสุดกิจกรรม"
const loadWinnersAnswers = React.useCallback(async () => {
  if (!isEdit || !gameId) return
  if (type !== 'เกมทายเบอร์เงิน' && type !== 'เกมทายผลบอล') return

  setWinnersAnswersLoading(true)
  try {
    const all = await getAnswers(gameId, 10000)
    const rows = (all || [])
      .map((a: any) => {
        const ts = typeof a.ts === 'number'
          ? a.ts
          : (a.createdAt
              ? (typeof a.createdAt?.toMillis === 'function'
                  ? a.createdAt.toMillis()
                  : new Date(a.createdAt).getTime())
              : 0)
        const userId = String(a.userId || a.username || a.user || '').trim()
        const ansRaw = a.answer
        // ข้าม payload action-based ของเกมเช็คอิน/สล็อต (กันรั่ว)
        if (typeof ansRaw === 'string' && ansRaw.trim().startsWith('{')) {
          try {
            const parsed = JSON.parse(ansRaw)
            if (parsed && typeof parsed === 'object' && parsed.action) return null
          } catch { /* ignore */ }
        }
        const ansText = typeof ansRaw === 'string' ? ansRaw : String(ansRaw ?? '')
        if (!userId || !ansText.trim()) return null
        return { user: userId, answer: ansText.trim(), ts: Number.isFinite(ts) ? ts : 0 }
      })
      .filter((r): r is { user: string; answer: string; ts: number } => !!r)
    setWinnersAnswersList(rows)
  } catch (err) {
    console.error('[CreateGame] loadWinnersAnswers failed:', err)
    setWinnersAnswersList([])
  } finally {
    setWinnersAnswersLoading(false)
  }
}, [isEdit, gameId, type])

React.useEffect(() => {
  if (isEdit && (type === 'เกมทายเบอร์เงิน' || type === 'เกมทายผลบอล')) {
    loadWinnersAnswers()
  }
}, [isEdit, type, loadWinnersAnswers])

// ✅ โหลดคำทาย "ล่าสุด" ของแต่ละ user แยกตาม matchId — ใช้เงื่อนไขเดียวกับเกมทายผลบอล
// (โหลดทีเดียวจาก answers แล้ว cache ไว้ — ใช้คำนวณ stats + รายชื่อผู้ทายถูกต่อคู่)
const loadWorldCupStats = React.useCallback(async () => {
  if (!isEdit || !gameId) return
  if (type !== 'เกมบอลโลก') return
  try {
    const all = await getAnswers(gameId, 10000)
    const latestByUserMatch = new Map<string, { userId: string; matchId: number; home: number; away: number; ts: number; answer: string }>()
    for (const a of (all || [])) {
      const action = String((a as any).action || '')
      if (!action.startsWith('wc-')) continue
      const userId = String((a as any).userId || '').trim()
      const matchId = Number((a as any).matchId)
      const h = Number((a as any).homeScore)
      const aw = Number((a as any).awayScore)
      if (!userId || !Number.isFinite(matchId) || !Number.isFinite(h) || !Number.isFinite(aw)) continue
      const ts = (a as any).createdAt?.toMillis?.() || (a as any).createdAt || 0
      const answer = String((a as any).answer || '')
      const key = `${userId}__${matchId}`
      const prev = latestByUserMatch.get(key)
      if (!prev || ts > prev.ts) {
        latestByUserMatch.set(key, { userId, matchId, home: h, away: aw, ts: Number(ts) || 0, answer })
      }
    }
    setWorldCupLatestPredictions(latestByUserMatch)
  } catch (err) {
    console.error('[CreateGame] loadWorldCupStats failed:', err)
  }
}, [isEdit, gameId, type])

React.useEffect(() => {
  if (isEdit && type === 'เกมบอลโลก') {
    loadWorldCupStats()
  }
}, [isEdit, type, loadWorldCupStats])

// ✅ คำนวณสถิติ + รายชื่อผู้ทายล่าสุดถูก — derive จาก latest predictions + worldCupResults
// (ไม่ต้องโหลดใหม่ทุกครั้งที่ admin พิมพ์สกอร์)
const worldCupPredictionStats = React.useMemo(() => {
  const stats: Record<number, { totalGuess: number; correctGuess?: number }> = {}
  for (const v of worldCupLatestPredictions.values()) {
    if (!stats[v.matchId]) stats[v.matchId] = { totalGuess: 0, correctGuess: 0 }
    stats[v.matchId].totalGuess += 1
    const cur = worldCupResults[v.matchId] || worldCupResults[String(v.matchId)]
    if (cur && (cur.home || '').trim() !== '' && (cur.away || '').trim() !== '') {
      const ch = parseInt(cur.home, 10)
      const ca = parseInt(cur.away, 10)
      if (v.home === ch && v.away === ca) {
        stats[v.matchId].correctGuess = (stats[v.matchId].correctGuess || 0) + 1
      }
    }
  }
  return stats
}, [worldCupLatestPredictions, worldCupResults])

const worldCupWinnersByMatch = React.useMemo(() => {
  const map: Record<number, Array<{ userId: string; answer: string; ts: number; home: number; away: number }>> = {}
  for (const v of worldCupLatestPredictions.values()) {
    const cur = worldCupResults[v.matchId] || worldCupResults[String(v.matchId)]
    if (!cur || (cur.home || '').trim() === '' || (cur.away || '').trim() === '') continue
    const ch = parseInt(cur.home, 10)
    const ca = parseInt(cur.away, 10)
    if (v.home === ch && v.away === ca) {
      if (!map[v.matchId]) map[v.matchId] = []
      map[v.matchId].push({ userId: v.userId, answer: v.answer, ts: v.ts, home: v.home, away: v.away })
    }
  }
  for (const mid of Object.keys(map)) {
    map[Number(mid)].sort((a, b) => (a.ts || 0) - (b.ts || 0))
  }
  return map
}, [worldCupLatestPredictions, worldCupResults])

// ✅ "สิ้นสุดกิจกรรมคู่นี้" — แจกโค้ดให้ผู้ทายถูก (ไม่ซ้ำกัน) แล้วบันทึก DB ทันที
const handleEndWorldCupMatch = React.useCallback(async (matchId: number) => {
  if (!isEdit || !gameId) return
  const current = worldCupResults[matchId] || worldCupResults[String(matchId)]
  if (!current) {
    alert('ไม่พบข้อมูลคู่นี้')
    return
  }
  const hStr = (current.home || '').trim()
  const aStr = (current.away || '').trim()
  if (!/^\d{1,2}$/.test(hStr) || !/^\d{1,2}$/.test(aStr)) {
    alert('กรุณากรอกสกอร์ที่ถูก (ตัวเลข 0-99) ก่อนกดสิ้นสุดกิจกรรม')
    return
  }
  const correctH = parseInt(hStr, 10)
  const correctA = parseInt(aStr, 10)
  const codes = Array.isArray(current.codes) ? current.codes.slice() : []
  if (codes.length === 0) {
    if (!confirm('ยังไม่ได้อัปโหลดโค้ดสำหรับคู่นี้ — กดยืนยันเพื่อสิ้นสุดกิจกรรมโดย "ไม่แจกโค้ด"')) return
  }

  setWorldCupBusyMatchId(matchId)
  try {
    // 1) โหลดเฉพาะ answers ของคู่นี้ (targeted query) — ลด read จาก ~10000 เหลือ ~1000
    //    ใช้ getAnswersByAction (มี index, sort ที่ Firestore)
    const matchAnswers = await getAnswersByAction(gameId, `wc-${matchId}`, 10000)
    const latestByUser = new Map<string, { home: number; away: number; ts: number; answer: string }>()
    for (const a of (matchAnswers || [])) {
      const userId = String((a as any).userId || '').trim()
      const h = Number((a as any).homeScore)
      const aw = Number((a as any).awayScore)
      const ts = (a as any).createdAt?.toMillis?.() || (a as any).createdAt || 0
      const ans = String((a as any).answer || '')
      if (!userId || !Number.isFinite(h) || !Number.isFinite(aw)) continue
      const prev = latestByUser.get(userId)
      if (!prev || Number(ts) > prev.ts) latestByUser.set(userId, { home: h, away: aw, ts: Number(ts) || 0, answer: ans })
    }

    // 2) ผู้ที่ทายถูก = home/away ตรงกับผลจริง (sort ตาม ts: มาก่อนได้ก่อน)
    const winners = Array.from(latestByUser.entries())
      .filter(([, v]) => v.home === correctH && v.away === correctA)
      .map(([userId, v]) => ({ userId, ts: v.ts, answer: v.answer }))
      .sort((a, b) => a.ts - b.ts)

    // 3) ATOMIC WRITE ผ่าน runTransaction — ป้องกัน race ระหว่างสอง admin / double-click
    //    Firestore guarantee: ถ้า doc ถูกเขียนทับโดยคนอื่นระหว่าง read-then-write → transaction retry
    const theme = getCurrentTheme()
    const gameRef = doc(db, 'themes', theme, 'games', gameId)
    let bonusAssigned = 0
    let codesAssigned = 0
    let totalClaimed = 0
    let bonusPerCorrect = 50
    let finalClaimedBy: Record<string, { code?: string; bonus?: number; ts: number; answer?: string }> = {}
    let finalCursor = 0

    await runTransaction(db, async (tx) => {
      const snap = await tx.get(gameRef)
      if (!snap.exists()) throw new Error('ไม่พบเอกสารเกม')
      const gameData = snap.data()
      const latestWorldCup = (gameData?.gameData?.worldCup || gameData?.worldCup || {}) as any
      const latestMatchResults = { ...(latestWorldCup.matchResults || {}) }
      const existing = latestMatchResults[String(matchId)] || {}
      const existingClaimedBy = (existing.claimedBy && typeof existing.claimedBy === 'object') ? existing.claimedBy : {}

      // โบนัสต่อคู่ — อ่านจาก DB ก่อน fallback ไปที่ state
      const bp = Number(latestWorldCup?.bonusPerCorrect)
      bonusPerCorrect = Number.isFinite(bp) && bp >= 0
        ? bp
        : (Number.isFinite(worldCupBonusPerCorrect) && worldCupBonusPerCorrect >= 0 ? worldCupBonusPerCorrect : 50)

      // แจกโค้ด + โบนัส — เริ่มจาก cursor ใน DB เผื่อ retry / กดสิ้นสุดซ้ำ
      const newClaimedBy: Record<string, { code?: string; bonus?: number; ts: number; answer?: string }> = { ...existingClaimedBy }
      let cursor = Number.isFinite(existing.codeCursor) ? Number(existing.codeCursor) : 0
      bonusAssigned = 0
      codesAssigned = 0

      for (const w of winners) {
        if (newClaimedBy[w.userId]) continue // ผู้นี้ได้รับไปแล้ว (กันแจกซ้ำ)
        const bonusGranted = bonusPerCorrect > 0 ? bonusPerCorrect : 0
        if (bonusGranted > 0) bonusAssigned += bonusGranted
        let codeForUser = ''
        if (cursor < codes.length) {
          codeForUser = codes[cursor]
          cursor += 1
          codesAssigned += 1
        }
        newClaimedBy[w.userId] = {
          code: codeForUser || '',
          bonus: bonusGranted,
          ts: Date.now(),
          answer: w.answer,
        }
      }

      const nowMs = Date.now()
      latestMatchResults[String(matchId)] = {
        home: correctH,
        away: correctA,
        codes,
        codeCursor: cursor,
        codeFileName: current.codeFileName || existing.codeFileName || '',
        claimedBy: newClaimedBy,
        ended: true,
        endedAt: nowMs,
      }

      // เขียน atomic — ใช้ dot path ให้ merge เฉพาะ worldCup
      tx.update(gameRef, {
        'gameData.worldCup': {
          ...(latestWorldCup || {}),
          title: latestWorldCup?.title || 'FIFA World Cup 2026',
          bonusPerCorrect,
          matchResults: latestMatchResults,
        },
        updatedAt: serverTimestamp(),
      })

      finalClaimedBy = newClaimedBy
      finalCursor = cursor
      totalClaimed = Object.keys(newClaimedBy).length
    })

    // Invalidate cache เกม — ครั้งต่อไป fetch จะได้ของใหม่
    try {
      const { dataCache, cacheKeys } = await import('../services/cache')
      dataCache.delete(cacheKeys.game(gameId))
    } catch {}

    // 4) update local state
    const nowMs = Date.now()
    setWorldCupResults((prev) => ({
      ...prev,
      [matchId]: {
        ...(prev[matchId] || prev[String(matchId)] || { home: '', away: '', codes: [] as string[] }),
        home: String(correctH),
        away: String(correctA),
        codes,
        codeCursor: finalCursor,
        codeFileName: (prev[matchId] || prev[String(matchId)])?.codeFileName || '',
        claimedBy: finalClaimedBy,
        ended: true,
        endedAt: nowMs,
      },
    }))

    // 5) สรุปให้ admin
    const winnerCount = winners.length
    const skippedNoCode = Math.max(0, winnerCount - totalClaimed)
    const lines = [
      `สิ้นสุดกิจกรรมคู่ที่ ${matchId} เรียบร้อย`,
      `• ผู้ทายถูก: ${winnerCount} คน`,
      `• บันทึกโบนัสสะสมในรอบนี้: ${bonusAssigned.toLocaleString()} แต้ม (×${bonusPerCorrect}/คน)`,
      `• แจกโค้ดในรอบนี้: ${codesAssigned} ใบ`,
      `• ได้รับโค้ดแล้วทั้งหมด: ${totalClaimed}/${codes.length} โค้ด`,
    ]
    if (skippedNoCode > 0) lines.push(`• ⚠️ มี ${skippedNoCode} คนยังไม่ได้รับโค้ด (โค้ดไม่พอ)`)
    // ✅ แจ้ง admin ว่าสามารถกดซ้ำได้ ถ้ามีผู้เล่นทายช้ากว่ารอบนี้
    lines.push('', '💡 หากมีผู้เล่นทายถูกแต่ยังไม่ได้รับโค้ด/โบนัส (ทายช้ากว่ารอบนี้)')
    lines.push('   สามารถกด "สิ้นสุดกิจกรรม" คู่นี้ซ้ำได้ — ระบบจะแจกเฉพาะรายใหม่')

    // ✅ refresh สถิติคำทายอัตโนมัติ — ไม่ต้องให้ admin กดเอง
    try { await loadWorldCupStats() } catch { /* non-fatal */ }

    alert(lines.join('\n'))
  } catch (err) {
    console.error('[CreateGame] handleEndWorldCupMatch failed:', err)
    alert('เกิดข้อผิดพลาดในการสิ้นสุดกิจกรรม: ' + (err instanceof Error ? err.message : String(err)))
  } finally {
    setWorldCupBusyMatchId(null)
  }
// eslint-disable-next-line react-hooks/exhaustive-deps
}, [isEdit, gameId, worldCupResults, worldCupBonusPerCorrect, loadWorldCupStats])

// ✅ "เปิดรับทายอีกครั้ง" — clear ended flag เท่านั้น
//    คง claimedBy + codeCursor ไว้ เพื่อ:
//      1) กันแจกโบนัส/โค้ดซ้ำเมื่อแก้สกอร์แล้วกดสิ้นสุดอีกครั้ง
//      2) ผู้เล่นที่เคยได้รับโค้ดยังเห็นโค้ดของตัวเองได้
const handleReopenWorldCupMatch = React.useCallback(async (matchId: number) => {
  if (!isEdit || !gameId) return
  if (!confirm(
    `เปิดรับทายคู่ที่ ${matchId} อีกครั้ง?\n\n` +
    '• ผู้เล่นจะสามารถแก้สกอร์ได้อีกครั้งตามเวลา kickoff\n' +
    '• ผู้ที่ "เคยได้รับโค้ด/โบนัสไปแล้ว" จะยังคงได้รับเหมือนเดิม (ระบบจะไม่แจกซ้ำ)\n' +
    '• ระบบจะแจกให้เฉพาะผู้ที่ทายถูก "รายใหม่" ในรอบถัดไป'
  )) return

  setWorldCupBusyMatchId(matchId)
  try {
    // ATOMIC reopen — กัน race กับการกดสิ้นสุดที่อาจค้างอยู่
    const theme = getCurrentTheme()
    const gameRef = doc(db, 'themes', theme, 'games', gameId)
    let resetSnapshot: { codeCursor: number; claimedBy: any } | null = null

    await runTransaction(db, async (tx) => {
      const snap = await tx.get(gameRef)
      if (!snap.exists()) throw new Error('ไม่พบเอกสารเกม')
      const gameData = snap.data()
      const latestWorldCup = (gameData?.gameData?.worldCup || gameData?.worldCup || {}) as any
      const latestMatchResults = { ...(latestWorldCup.matchResults || {}) }
      const existing = latestMatchResults[String(matchId)] || {}

      // คง claimedBy + cursor ไว้ — clear แค่ ended flag (กันแจกซ้ำ)
      const reset = {
        home: existing.home,
        away: existing.away,
        codes: Array.isArray(existing.codes) ? existing.codes : [],
        codeFileName: existing.codeFileName || '',
        codeCursor: Number.isFinite(existing.codeCursor) ? Number(existing.codeCursor) : 0,
        claimedBy: (existing.claimedBy && typeof existing.claimedBy === 'object') ? existing.claimedBy : {},
        ended: false,
        endedAt: null,
      }
      latestMatchResults[String(matchId)] = reset

      tx.update(gameRef, {
        'gameData.worldCup': {
          ...(latestWorldCup || {}),
          title: latestWorldCup?.title || 'FIFA World Cup 2026',
          matchResults: latestMatchResults,
        },
        updatedAt: serverTimestamp(),
      })

      resetSnapshot = { codeCursor: reset.codeCursor, claimedBy: reset.claimedBy }
    })

    try {
      const { dataCache, cacheKeys } = await import('../services/cache')
      dataCache.delete(cacheKeys.game(gameId))
    } catch {}

    if (resetSnapshot) {
      const _reset = resetSnapshot as { codeCursor: number; claimedBy: any }
      setWorldCupResults((prev) => ({
        ...prev,
        [matchId]: {
          ...(prev[matchId] || prev[String(matchId)] || { home: '', away: '', codes: [] as string[] }),
          codeCursor: _reset.codeCursor,
          claimedBy: _reset.claimedBy,
          ended: false,
          endedAt: null,
        },
      }))
    }
    // ✅ refresh สถิติอัตโนมัติเช่นเดียวกับ endMatch
    try { await loadWorldCupStats() } catch { /* non-fatal */ }

    alert(`เปิดรับทายคู่ที่ ${matchId} อีกครั้งเรียบร้อย`)
  } catch (err) {
    console.error('[CreateGame] handleReopenWorldCupMatch failed:', err)
    alert('เกิดข้อผิดพลาดในการเปิดคู่นี้: ' + (err instanceof Error ? err.message : String(err)))
  } finally {
    setWorldCupBusyMatchId(null)
  }
}, [isEdit, gameId, loadWorldCupStats])

// ===== Telegram (เกมบอลโลก): โหลด template + handlers =====
// 1) โหลด template จาก themeSettings (ครั้งแรก / เปลี่ยนธีม)
React.useEffect(() => {
  if (type !== 'เกมบอลโลก') return
  let cancelled = false
  ;(async () => {
    try {
      const response = await getThemeSettings(themeName)
      const settings = response?.settings || {}
      if (cancelled) return
      const saved = String(settings[WORLD_CUP_WINNERS_TELEGRAM_MESSAGE_KEY] || DEFAULT_WORLD_CUP_WINNERS_TEMPLATE)
      setWorldCupTelegramMessage(saved)
    } catch (error) {
      if (import.meta.env.DEV) console.error('[CreateGame] Load WorldCup TG template failed:', error)
      setWorldCupTelegramMessage(DEFAULT_WORLD_CUP_WINNERS_TEMPLATE)
    }
  })()
  return () => { cancelled = true }
}, [themeName, type])

// 2) บันทึก template ลง themeSettings — ใช้ครั้งหน้าได้เลย
const saveWorldCupTelegramTemplate = React.useCallback(async () => {
  setWorldCupTelegramTemplateSaving(true)
  try {
    await saveThemeSettings(themeName, {
      [WORLD_CUP_WINNERS_TELEGRAM_MESSAGE_KEY]: worldCupTelegramMessage.trim() || DEFAULT_WORLD_CUP_WINNERS_TEMPLATE,
    })
    alert('บันทึกข้อความประกาศเป็นค่าเริ่มต้นเรียบร้อย')
  } catch (error) {
    console.error('[CreateGame] Save WorldCup TG template failed:', error)
    alert('บันทึกไม่สำเร็จ')
  } finally {
    setWorldCupTelegramTemplateSaving(false)
  }
}, [themeName, worldCupTelegramMessage])

// 3) Helper: persist matchResults[id] (รูป Telegram) ลง gameData ทันที
const persistWorldCupMatchToGame = React.useCallback(async (matchId: number | string, patch: Partial<WorldCupResultInput>) => {
  if (!isEdit || !gameId) return
  try {
    const current = await getGameById(gameId)
    if (!current) return
    const next: any = { ...current }
    const currentGameData = (current as any).gameData || {}
    const prevWc = currentGameData.worldCup || (current as any).worldCup || {}
    const prevResults = prevWc.matchResults || {}
    const prevMatch = prevResults[matchId] || prevResults[String(matchId)] || {}
    const updatedMatch = { ...prevMatch, ...patch }
    const updatedResults = { ...prevResults, [matchId]: updatedMatch }
    const updatedWc = { ...prevWc, matchResults: updatedResults }
    next.gameData = { ...currentGameData, worldCup: updatedWc }
    next.worldCup = updatedWc
    await updateGame(gameId, next)
  } catch (err) {
    console.warn('[CreateGame] Persist WorldCup match patch failed:', err)
  }
}, [isEdit, gameId])

// 4) อัปโหลดรูปต่อคู่
const handleUploadWorldCupMatchImage = React.useCallback(async (matchId: number, file: File) => {
  if (!file.type.startsWith('image/')) {
    alert('กรุณาเลือกไฟล์รูปภาพเท่านั้น')
    return
  }
  setWorldCupTelegramUploadingMatchId(matchId)
  try {
    const finalUrl = await uploadImageToStorage(file, 'announce')
    setWorldCupResults((prev) => ({
      ...prev,
      [matchId]: {
        ...(prev[matchId] || prev[String(matchId)] || { home: '', away: '', codes: [] as string[] }),
        telegramImageUrl: finalUrl,
      } as any,
    }))
    if (isEdit && gameId) {
      await persistWorldCupMatchToGame(matchId, { telegramImageUrl: finalUrl } as any)
    }
  } catch (err: any) {
    console.error('[CreateGame] handleUploadWorldCupMatchImage failed:', err)
    alert(`อัปโหลดรูปไม่สำเร็จ: ${err?.message || err}`)
  } finally {
    setWorldCupTelegramUploadingMatchId(null)
  }
}, [isEdit, gameId, persistWorldCupMatchToGame])

// 5) ลบรูปต่อคู่
const handleClearWorldCupMatchImage = React.useCallback(async (matchId: number) => {
  setWorldCupResults((prev) => {
    const cur = prev[matchId] || prev[String(matchId)] || { home: '', away: '', codes: [] as string[] }
    const next: any = { ...cur }
    delete next.telegramImageUrl
    return { ...prev, [matchId]: next }
  })
  if (isEdit && gameId) {
    await persistWorldCupMatchToGame(matchId, { telegramImageUrl: '' } as any)
  }
}, [isEdit, gameId, persistWorldCupMatchToGame])

// 6) ส่งประกาศ Telegram ต่อคู่
const sendWorldCupMatchTelegram = React.useCallback(async (matchId: number) => {
  if (!gameId) {
    alert('ยังไม่ได้บันทึกเกม กรุณาบันทึกก่อน')
    return
  }
  const match = worldCupSchedule.find((m) => m.id === matchId)
  if (!match) {
    alert('ไม่พบข้อมูลคู่นี้')
    return
  }
  const result = (worldCupResults[matchId] || worldCupResults[String(matchId)]) as any
  if (!result || result.home.trim() === '' || result.away.trim() === '') {
    alert('กรุณากรอกสกอร์คู่นี้ก่อน')
    return
  }
  // คำนวณรายชื่อผู้ทายถูก (จาก state — เหมือนที่แสดงใน WorldCupAdminResults)
  const homeNum = parseInt(result.home, 10)
  const awayNum = parseInt(result.away, 10)
  const winnersList: string[] = []
  // หาคำทายล่าสุดต่อ user สำหรับ matchId นี้
  for (const [, pred] of worldCupLatestPredictions) {
    if (pred.matchId !== matchId) continue
    if (pred.home === homeNum && pred.away === awayNum) {
      winnersList.push(pred.userId)
    }
  }
  if (winnersList.length === 0) {
    if (!window.confirm('ยังไม่มีผู้ทายสกอร์คู่นี้ถูก ต้องการส่งประกาศต่อไปหรือไม่?')) return
  }

  // ข้อมูลคู่ — สำหรับใช้ใน {matchInfo}
  const t1Th = getTeamNameTh(match.t1)
  const t2Th = getTeamNameTh(match.t2)
  const dt = new Date(match.thaiDate + 'T00:00:00')
  const dateStr = `${dt.getDate()}/${dt.getMonth() + 1}/${(dt.getFullYear() + 543).toString().slice(-2)}`
  const hh = String(Math.floor(match.thaiMin / 60)).padStart(2, '0')
  const mm = String(match.thaiMin % 60).padStart(2, '0')
  const matchInfo = `${t1Th} vs ${t2Th} · ${formatGroupLabel(match.group)} · ${dateStr} ${hh}:${mm}`
  const correctAnswer = `${homeNum}-${awayNum}`

  setWorldCupTelegramSendingMatchId(matchId)
  try {
    const finalImageUrl = String(result.telegramImageUrl || '').trim()
    const payload = {
      themeName,
      gameId,
      activityName: 'บอลโลก',
      gameName: name?.trim() || '',
      matchInfo,
      imageUrl: finalImageUrl,
      messageTemplate: worldCupTelegramMessage.trim() || DEFAULT_WORLD_CUP_WINNERS_TEMPLATE,
      winners: winnersList,
      unqualifiedWinners: [],
      correctAnswer,
    }

    const endpoints = ['/api/telegram/send-winners', '/.netlify/functions/send-telegram-winners']
    let success = false
    let lastError = ''
    for (const endpoint of endpoints) {
      try {
        const res = await fetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        })
        if (res.ok) { success = true; break }
        const errorText = await res.text()
        lastError = errorText || `HTTP ${res.status}`
      } catch (err: any) {
        lastError = err?.message || String(err)
      }
    }

    if (success) {
      alert(`ส่งประกาศคู่ ${t1Th} vs ${t2Th} เข้ากลุ่ม Telegram เรียบร้อยแล้ว`)
    } else {
      console.error('[CreateGame] sendWorldCupMatchTelegram all endpoints failed:', lastError)
      // Fallback — เปิดหน้าแชร์ Telegram
      const previewMsg = (worldCupTelegramMessage.trim() || DEFAULT_WORLD_CUP_WINNERS_TEMPLATE)
        .replace(/\{themeName\}/g, themeName.toUpperCase())
        .replace(/\{activityName\}/g, 'บอลโลก')
        .replace(/\{gameName\}/g, name?.trim() || '')
        .replace(/\{matchInfo\}/g, matchInfo)
        .replace(/\{correctAnswer\}/g, correctAnswer)
        .replace(/\{winners\}/g, winnersList.length === 0
          ? '— ยังไม่มีผู้ทายถูก —'
          : winnersList.map((u) => `💚 ${u}`).join('\n'))
        .replace(/\{unqualifiedWinners\}/g, '— ไม่มี —')
      const shareUrl = `https://t.me/share/url?url=${encodeURIComponent('about:blank')}&text=${encodeURIComponent(previewMsg)}`
      window.open(shareUrl, '_blank', 'noopener,noreferrer')
      alert('ส่งอัตโนมัติไม่สำเร็จ — เปิดหน้าแชร์ Telegram ให้แทน\n(หาก dev: Deploy ขึ้น Netlify ก่อนใช้งานจริง)')
    }
  } catch (err: any) {
    console.error('[CreateGame] sendWorldCupMatchTelegram failed:', err)
    alert(`ส่งประกาศไม่สำเร็จ: ${err?.message || err}`)
  } finally {
    setWorldCupTelegramSendingMatchId(null)
  }
}, [gameId, themeName, name, worldCupResults, worldCupTelegramMessage, worldCupLatestPredictions])

// ✅ คำตอบล่าสุดต่อ USER (ใช้ตรวจหา "ผู้ทายล่าสุดถูก")
const latestAnswerByUser = React.useMemo(() => {
  const map = new Map<string, { user: string; answer: string; ts: number }>()
  for (const r of winnersAnswersList) {
    const prev = map.get(r.user)
    if (!prev || r.ts > prev.ts) map.set(r.user, r)
  }
  return map
}, [winnersAnswersList])

// ✅ Helper: ดึง "เลขเดียว" จากคำตอบ (เกมทายเบอร์เงิน)
// ผู้เล่นจะส่งเป็น "เบอร์เงินที่ทาย: 5" — เราดึง "5" ออกมาเทียบ
// แอดมินจะกรอกอะไรก็ได้ที่มีตัวเลข (เช่น "5", "เลข 5", "เบอร์ 5") เราดึงเลขสุดท้ายเช่นกัน
const extractNumberAnswer = React.useCallback((text: string): string | null => {
  const s = String(text || '').trim()
  if (!s) return null
  const matches = s.match(/\d+/g)
  if (!matches || matches.length === 0) return null
  // ใช้เลข "ตัวสุดท้าย" เพื่อข้าม prefix เช่น "เบอร์เงินที่ทาย: 5"
  return matches[matches.length - 1] || null
}, [])

// ✅ Helper: parse คะแนนทีมเหย้า/ทีมเยือน จากสตริงคำตอบ (เกมทายผลบอล)
// คำตอบของผู้เล่นเก็บเป็น "<homeTeam> X - Y <awayTeam>" — regex จะจับคู่เลขที่มี separator -, –, :, /, x, ×
const parseFootballScore = React.useCallback((text: string): { home: number | null; away: number | null } => {
  const s = String(text || '').trim()
  const m = s.match(/^(\d+)\s*[-–:/x×]\s*(\d+)$/i) || s.match(/(\d+)\s*[-–:/x×]\s*(\d+)/)
  if (!m) return { home: null, away: null }
  const h = parseInt(m[1], 10), a = parseInt(m[2], 10)
  return { home: Number.isFinite(h) ? h : null, away: Number.isFinite(a) ? a : null }
}, [])

// ✅ รายการ USER ที่ทาย "คำตอบล่าสุด" ถูก (เรียงตามเวลาตอบล่าสุดก่อน)
const correctLatestWinners = React.useMemo(() => {
  let correctText = ''
  if (type === 'เกมทายเบอร์เงิน') correctText = numberPickCorrectAnswer.trim()
  else if (type === 'เกมทายผลบอล') {
    const h = footballCorrectHome.trim(), a = footballCorrectAway.trim()
    if (h !== '' && a !== '') correctText = `${h}-${a}`
  }
  if (!correctText) return [] as Array<{ user: string; answer: string; ts: number }>

  const out: Array<{ user: string; answer: string; ts: number }> = []
  for (const [, latest] of latestAnswerByUser) {
    if (type === 'เกมทายเบอร์เงิน') {
      // ✅ ดึงเฉพาะตัวเลขจากคำตอบทั้ง 2 ฝั่ง (player ส่งเป็น "เบอร์เงินที่ทาย: 5")
      const got = extractNumberAnswer(latest.answer)
      const want = extractNumberAnswer(correctText)
      if (got !== null && want !== null && got === want) out.push(latest)
    } else if (type === 'เกมทายผลบอล') {
      const got = parseFootballScore(latest.answer)
      const want = parseFootballScore(correctText)
      if (got.home !== null && got.away !== null && got.home === want.home && got.away === want.away) {
        out.push(latest)
      }
    }
  }
  out.sort((a, b) => b.ts - a.ts)
  return out
}, [type, numberPickCorrectAnswer, footballCorrectHome, footballCorrectAway, latestAnswerByUser, extractNumberAnswer, parseFootballScore])

// ===== ตรวจยอดฝากจากไฟล์รายงาน =====
// เกณฑ์ยอดฝาก/ประเภทเกม: ทายเบอร์เงิน → 100 / ทายผลบอล → 100
const depositThreshold = type === 'เกมทายเบอร์เงิน' ? 100 : type === 'เกมทายผลบอล' ? 100 : 0

// มีรายงานฝากแล้วหรือยัง — อิงตาม Map ที่มีข้อมูล (จากอัปโหลดในรอบนี้ หรือโหลดจาก gameData ที่บันทึกไว้)
const hasDepositReportLoaded = depositSumByUser.size > 0

// แต่ละ winner + ข้อมูลยอดฝาก/สถานะครบเกณฑ์ (เกณฑ์: ฝากเท่ากับหรือมากกว่าเกณฑ์)
const winnersDepositInfo = React.useMemo(() => {
  return correctLatestWinners.map((w) => {
    const key = normalizeUsername(w.user)
    const totalDeposit = depositSumByUser.get(key) || 0
    const passed = hasDepositReportLoaded && depositThreshold > 0 && totalDeposit >= depositThreshold
    return { ...w, totalDeposit, hasReport: hasDepositReportLoaded, passed }
  })
}, [correctLatestWinners, depositSumByUser, hasDepositReportLoaded, depositThreshold])

// จำนวน winners ที่ปรากฏในไฟล์ฝาก (ไม่ว่าจะผ่านเกณฑ์หรือไม่ก็ตาม)
const winnersFoundInDepositFile = React.useMemo(() => {
  if (!hasDepositReportLoaded) return 0
  let count = 0
  for (const w of correctLatestWinners) {
    const key = normalizeUsername(w.user)
    if (depositSumByUser.has(key)) count++
  }
  return count
}, [correctLatestWinners, depositSumByUser, hasDepositReportLoaded])

// ✅ สร้าง depositReport object สำหรับบันทึกลง Firestore
// — กรองให้เก็บเฉพาะ USER ที่ทายล่าสุดถูก เพื่อลดขนาดข้อมูลใน DB
const buildDepositReportForSave = React.useCallback((
  sumMap: Map<string, number>,
  fileName: string,
  uploadedAt: number,
  totalRows: number,
): { fileName: string; uploadedAt: number; totalRows: number; sumByUser: Record<string, number> } | null => {
  if (sumMap.size === 0) return null
  const winnerKeys = new Set(correctLatestWinners.map((w) => normalizeUsername(w.user)))
  const sumByUser: Record<string, number> = {}
  if (winnerKeys.size > 0) {
    // มีผู้ทายถูก → บันทึกเฉพาะของกลุ่มนี้
    for (const [k, v] of sumMap) {
      if (winnerKeys.has(k)) sumByUser[k] = v
    }
  } else {
    // ยังไม่มีผู้ทายถูก (admin อาจอัปโหลดก่อนใส่คำตอบ) — เก็บทั้งหมดไว้ก่อน
    // เมื่อ admin ใส่คำตอบแล้วกดสิ้นสุดกิจกรรม / บันทึกเกม จะ re-filter ให้เหลือเฉพาะผู้ทายถูก
    for (const [k, v] of sumMap) sumByUser[k] = v
  }
  return { fileName, uploadedAt, totalRows, sumByUser }
}, [correctLatestWinners])

const qualifiedWinners = React.useMemo(
  () => winnersDepositInfo.filter((w) => w.passed),
  [winnersDepositInfo]
)
const unqualifiedWinners = React.useMemo(
  () => winnersDepositInfo.filter((w) => !w.passed),
  [winnersDepositInfo]
)

// อัปโหลดไฟล์ Excel รายงานฝาก แล้ว parse เฉพาะคอลัม B (Username), G (Amount), K (Finance Type)
// - รองรับ Amount ที่มี comma / currency symbol / ช่องว่าง
// - ข้ามแถวที่เป็น negative amount (refund/withdraw)
// - หาก sheet แรกไม่พบข้อมูล จะลอง sheet ถัด ๆ ไปอัตโนมัติ
// - บันทึกผลลัพธ์ (sumByUser) ลง gameData (per game) เพื่อใช้ตรวจซ้ำได้หลังรีเฟรช
const handleDepositFileChange: React.ChangeEventHandler<HTMLInputElement> = async (e) => {
  const file = e.target.files?.[0]
  e.target.value = ''
  if (!file) return

  setDepositLoading(true)
  setDepositError('')
  try {
    const buf = await file.arrayBuffer()
    const wb = XLSX.read(new Uint8Array(buf), { type: 'array' })
    if (!wb.SheetNames || wb.SheetNames.length === 0) throw new Error('ไม่พบ sheet ในไฟล์')

    type DepositRow = { username: string; amount: number; financeType: string }
    const parseSheet = (sheetName: string): DepositRow[] => {
      const ws = wb.Sheets[sheetName]
      if (!ws) return []
      const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' }) as any[][]
      const collected: DepositRow[] = []
      for (let i = 0; i < rows.length; i++) {
        const row = rows[i]
        if (!Array.isArray(row)) continue
        // คอลัม B = index 1, คอลัม G = index 6, คอลัม K = index 10
        const username = String(row[1] ?? '').trim()
        if (!username) continue
        // ข้าม header row (รองรับหลายรูปแบบ)
        if (DEPOSIT_HEADER_USERNAME_KEYWORDS.has(username.toLowerCase().replace(/\s+/g, ''))) continue
        const amount = parseDepositAmount(row[6])
        if (amount === null) continue
        const ft = String(row[10] ?? '').trim().toUpperCase()
        collected.push({ username, amount, financeType: ft })
      }
      return collected
    }

    // ลอง sheet แรกก่อน — ถ้าไม่พบข้อมูล ให้ลอง sheet อื่น ๆ ตามลำดับ
    let out: DepositRow[] = parseSheet(wb.SheetNames[0])
    let usedSheet = wb.SheetNames[0]
    if (out.length === 0 && wb.SheetNames.length > 1) {
      for (let i = 1; i < wb.SheetNames.length; i++) {
        const candidate = parseSheet(wb.SheetNames[i])
        if (candidate.length > 0) {
          out = candidate
          usedSheet = wb.SheetNames[i]
          break
        }
      }
    }

    if (out.length === 0) {
      throw new Error('ไม่พบข้อมูลที่อ่านได้ในไฟล์ (กรุณาตรวจสอบรูปแบบคอลัมน์ B/G/K)')
    }

    // ✅ สรุปยอด/USER (เฉพาะ Finance Type ที่กำหนด)
    const newSumByUser = new Map<string, number>()
    for (const r of out) {
      if (!VALID_DEPOSIT_FINANCE_TYPES.has(r.financeType)) continue
      const k = normalizeUsername(r.username)
      if (!k) continue
      const amt = Number.isFinite(r.amount) ? r.amount : 0
      newSumByUser.set(k, (newSumByUser.get(k) || 0) + amt)
    }

    const finalFileName = wb.SheetNames.length > 1 && usedSheet !== wb.SheetNames[0]
      ? `${file.name}  ·  ใช้ sheet "${usedSheet}"`
      : file.name
    const uploadedAt = Date.now()

    // อัปเดต state ทันที
    setDepositSumByUser(newSumByUser)
    setDepositTotalRows(out.length)
    setDepositFileName(finalFileName)
    setDepositUploadedAt(uploadedAt)

    // ✅ บันทึก snapshot ลง gameData เพื่อให้รีเฟรชแล้วยังอยู่
    // — กรองเฉพาะ USER ที่ทายล่าสุดถูก เพื่อลดขนาดข้อมูลใน DB
    if (isEdit && gameId && (type === 'เกมทายเบอร์เงิน' || type === 'เกมทายผลบอล')) {
      try {
        const depositReport = buildDepositReportForSave(newSumByUser, finalFileName, uploadedAt, out.length)
        if (depositReport) {
          const current = await getGameById(gameId)
          if (current) {
            const next: any = { ...current }
            const currentGameData = (current as any).gameData || {}
            if (type === 'เกมทายเบอร์เงิน') {
              const prev = currentGameData.numberPick || (current as any).numberPick || {}
              const updated = { ...prev, depositReport }
              next.gameData = { ...currentGameData, numberPick: updated }
              next.numberPick = updated
            } else {
              const prev = currentGameData.football || (current as any).football || {}
              const updated = { ...prev, depositReport }
              next.gameData = { ...currentGameData, football: updated }
              next.football = updated
            }
            await updateGame(gameId, next)
          }
        }
      } catch (saveErr) {
        // ไม่ block UX — แค่ log
        console.warn('[CreateGame] Persist deposit report to gameData failed:', saveErr)
      }
    }
  } catch (err: any) {
    console.error('[CreateGame] handleDepositFileChange failed:', err)
    setDepositError(err?.message || String(err))
    setDepositSumByUser(new Map())
    setDepositTotalRows(0)
    setDepositFileName('')
    setDepositUploadedAt(null)
  } finally {
    setDepositLoading(false)
  }
}

// ✅ ลบไฟล์รายงานฝากที่บันทึกไว้ (เริ่มต้นใหม่)
const clearDepositReport = React.useCallback(async () => {
  if (!window.confirm('ต้องการลบไฟล์รายงานฝากที่บันทึกไว้ใช่หรือไม่?')) return
  setDepositSumByUser(new Map())
  setDepositTotalRows(0)
  setDepositFileName('')
  setDepositUploadedAt(null)
  setDepositError('')

  if (isEdit && gameId && (type === 'เกมทายเบอร์เงิน' || type === 'เกมทายผลบอล')) {
    try {
      const current = await getGameById(gameId)
      if (current) {
        const next: any = { ...current }
        const currentGameData = (current as any).gameData || {}
        if (type === 'เกมทายเบอร์เงิน') {
          const prev = currentGameData.numberPick || (current as any).numberPick || {}
          const { depositReport: _omit, ...rest } = prev as any
          void _omit
          next.gameData = { ...currentGameData, numberPick: rest }
          next.numberPick = rest
        } else {
          const prev = currentGameData.football || (current as any).football || {}
          const { depositReport: _omit, ...rest } = prev as any
          void _omit
          next.gameData = { ...currentGameData, football: rest }
          next.football = rest
        }
        await updateGame(gameId, next)
      }
    } catch (clearErr) {
      console.warn('[CreateGame] Clear deposit report from gameData failed:', clearErr)
    }
  }
}, [isEdit, gameId, type])

// ✅ ปุ่ม "สิ้นสุดกิจกรรม" — บันทึก correctAnswer + endedAt + ended=true ลง gameData
const endActivity = React.useCallback(async () => {
  if (!isEdit || !gameId) return
  if (type !== 'เกมทายเบอร์เงิน' && type !== 'เกมทายผลบอล') return

  let correctText = ''
  if (type === 'เกมทายเบอร์เงิน') {
    correctText = numberPickCorrectAnswer.trim()
    if (!correctText) {
      alert('กรุณาใส่คำตอบที่ถูกก่อน')
      return
    }
  } else {
    const h = footballCorrectHome.trim(), a = footballCorrectAway.trim()
    if (h === '' || a === '' || !/^\d+$/.test(h) || !/^\d+$/.test(a)) {
      alert('กรุณาใส่สกอร์ทีมเหย้าและทีมเยือน (เป็นตัวเลข) ให้ครบก่อน')
      return
    }
    correctText = `${h}-${a}`
  }

  if (!window.confirm(
    `ยืนยันสิ้นสุดกิจกรรม?\nคำตอบที่ถูก: ${correctText}\n\nจำนวน USER ที่ทายล่าสุดถูก: ${correctLatestWinners.length} คน`
  )) return

  setEndingActivity(true)
  try {
    const now = Date.now()
    const current = await getGameById(gameId)
    if (!current) {
      alert('ไม่พบเกมนี้แล้ว')
      return
    }

    // ✅ Re-build depositReport filtered ตามผู้ทายถูกชุดล่าสุด
    //    (กรณี admin อัปโหลดก่อนใส่คำตอบ หรือเปลี่ยนคำตอบ — DB จะถูกอัปเดตให้เหลือเฉพาะ winners ใหม่)
    const filteredDepositReport = depositSumByUser.size > 0
      ? buildDepositReportForSave(
          depositSumByUser,
          depositFileName,
          depositUploadedAt || Date.now(),
          depositTotalRows,
        )
      : null

    const next: any = { ...current }
    const currentGameData = (current as any).gameData || {}
    if (type === 'เกมทายเบอร์เงิน') {
      // ✅ อ่านจาก gameData.numberPick ก่อน (เป็นตำแหน่งหลัก) — fallback ไปที่ top-level
      const prev = currentGameData.numberPick || (current as any).numberPick || {}
      const updated: any = {
        ...prev,
        correctAnswer: correctText,
        ended: true,
        endedAt: now,
      }
      if (filteredDepositReport) updated.depositReport = filteredDepositReport
      // ✅ บันทึกที่ gameData.numberPick (หลัก) + top-level (สำหรับ backward compat)
      next.gameData = { ...currentGameData, numberPick: updated }
      next.numberPick = updated
    } else {
      const prev = currentGameData.football || (current as any).football || {}
      const updated: any = {
        ...prev,
        correctAnswer: correctText,
        ended: true,
        endedAt: now,
      }
      if (filteredDepositReport) updated.depositReport = filteredDepositReport
      next.gameData = { ...currentGameData, football: updated }
      next.football = updated
    }

    await updateGame(gameId, next)

    // อัปเดต state ใน UI ทันที (ก่อนรีเฟรชหน้า)
    if (type === 'เกมทายเบอร์เงิน') {
      setNumberPickCorrectAnswer(correctText)
      setNumberPickEndedAt(now)
    } else {
      setFootballEndedAt(now)
    }
    alert('บันทึกสิ้นสุดกิจกรรมเรียบร้อย')
  } catch (err: any) {
    console.error('[CreateGame] endActivity failed:', err)
    alert(`บันทึกไม่สำเร็จ: ${err?.message || err}`)
  } finally {
    setEndingActivity(false)
  }
}, [isEdit, gameId, type, numberPickCorrectAnswer, footballCorrectHome, footballCorrectAway, correctLatestWinners.length, depositSumByUser, depositFileName, depositUploadedAt, depositTotalRows, buildDepositReportForSave])

// ===== Telegram: ประกาศผู้ชนะ =====
const winnersTelegramKeys = React.useMemo(() => {
  if (type === 'เกมทายผลบอล') {
    return {
      imageKey: FOOTBALL_WINNERS_TELEGRAM_IMAGE_KEY,
      messageKey: FOOTBALL_WINNERS_TELEGRAM_MESSAGE_KEY,
      defaultTemplate: DEFAULT_FOOTBALL_WINNERS_TEMPLATE,
      activityName: 'ทายผลบอล',
    }
  }
  return {
    imageKey: NUMBER_PICK_WINNERS_TELEGRAM_IMAGE_KEY,
    messageKey: NUMBER_PICK_WINNERS_TELEGRAM_MESSAGE_KEY,
    defaultTemplate: DEFAULT_NUMBER_PICK_WINNERS_TEMPLATE,
    activityName: 'เบอร์เงิน',
  }
}, [type])

// โหลด "template ข้อความ" Telegram ผู้ชนะ จาก themeSettings (template ใช้ซ้ำได้ระหว่างเกม)
// หมายเหตุ: รูปประกาศไม่โหลดที่นี่ — เก็บต่อเกม (โหลดในบล็อก load gameData ด้านบน)
React.useEffect(() => {
  if (type !== 'เกมทายเบอร์เงิน' && type !== 'เกมทายผลบอล') return

  let cancelled = false
  const loadWinnersTelegramTemplate = async () => {
    try {
      const response = await getThemeSettings(themeName)
      const settings = response?.settings || {}
      if (cancelled) return
      const savedMessage = String(settings[winnersTelegramKeys.messageKey] || winnersTelegramKeys.defaultTemplate)
      setWinnersTelegramMessage(savedMessage)
    } catch (error) {
      if (import.meta.env.DEV) {
        console.error('[CreateGame] Load winners telegram template failed:', error)
      }
      // fallback ใช้ default template
      setWinnersTelegramMessage(winnersTelegramKeys.defaultTemplate)
    }
  }

  loadWinnersTelegramTemplate()
  return () => { cancelled = true }
}, [themeName, type, winnersTelegramKeys])

// อัปโหลด/เปลี่ยนรูป (preview ทันที)
// ✅ Helper: บันทึก URL รูปประกาศลง gameData (per-game) — ใช้ร่วมกันใน upload / clear / send
const persistWinnersImageToGame = React.useCallback(async (newUrl: string) => {
  if (!isEdit || !gameId) return
  if (type !== 'เกมทายเบอร์เงิน' && type !== 'เกมทายผลบอล') return
  try {
    const current = await getGameById(gameId)
    if (!current) return
    const next: any = { ...current }
    const currentGameData = (current as any).gameData || {}
    if (type === 'เกมทายเบอร์เงิน') {
      const prev = currentGameData.numberPick || (current as any).numberPick || {}
      const updated: any = { ...prev }
      if (newUrl) updated.winnersTelegramImageUrl = newUrl
      else delete updated.winnersTelegramImageUrl
      next.gameData = { ...currentGameData, numberPick: updated }
      next.numberPick = updated
    } else {
      const prev = currentGameData.football || (current as any).football || {}
      const updated: any = { ...prev }
      if (newUrl) updated.winnersTelegramImageUrl = newUrl
      else delete updated.winnersTelegramImageUrl
      next.gameData = { ...currentGameData, football: updated }
      next.football = updated
    }
    await updateGame(gameId, next)
  } catch (err) {
    console.warn('[CreateGame] Persist winners image to gameData failed:', err)
  }
}, [isEdit, gameId, type])

const handleWinnersTelegramImageFileChange: React.ChangeEventHandler<HTMLInputElement> = async (e) => {
  const file = e.target.files?.[0]
  // เคลียร์ input เพื่อให้สามารถเลือกไฟล์เดิมซ้ำได้
  e.target.value = ''
  if (!file) return
  if (!file.type.startsWith('image/')) {
    alert('กรุณาเลือกไฟล์รูปภาพเท่านั้น')
    return
  }

  // 1) แสดง preview ทันที (blob:)
  if (winnersTelegramImagePreview && winnersTelegramImagePreview.startsWith('blob:')) {
    URL.revokeObjectURL(winnersTelegramImagePreview)
  }
  const blobUrl = URL.createObjectURL(file)
  setWinnersTelegramImageFile(file)
  setWinnersTelegramImagePreview(blobUrl)

  // 2) Auto upload + save ลง gameData (ทันที — ไม่ต้องรอกดปุ่ม "บันทึกตั้งค่า")
  if (!isEdit || !gameId) {
    // เกมยังไม่ถูกบันทึก — เก็บไฟล์ไว้ก่อน รอ submit() มาอัปโหลดรอบเดียว
    return
  }
  setWinnersTelegramImageUploading(true)
  try {
    const finalUrl = await uploadImageToStorage(file, 'announce')
    setWinnersTelegramImageUrl(finalUrl)
    setWinnersTelegramImageFile(null)
    // เปลี่ยน preview จาก blob: เป็น CDN URL จริง
    if (blobUrl.startsWith('blob:')) URL.revokeObjectURL(blobUrl)
    setWinnersTelegramImagePreview(finalUrl)
    // บันทึก URL ลง gameData (per game) — ครั้งหน้ารีเฟรชยังเห็นรูป
    await persistWinnersImageToGame(finalUrl)
  } catch (err: any) {
    console.error('[CreateGame] handleWinnersTelegramImageFileChange upload failed:', err)
    alert(`อัปโหลดรูปไม่สำเร็จ: ${err?.message || err}`)
  } finally {
    setWinnersTelegramImageUploading(false)
  }
}

// ✅ ลบรูปประกาศ — clear state + ลบ URL ออกจาก gameData ทันที
const handleClearWinnersTelegramImage = React.useCallback(async () => {
  if (winnersTelegramImagePreview && winnersTelegramImagePreview.startsWith('blob:')) {
    URL.revokeObjectURL(winnersTelegramImagePreview)
  }
  setWinnersTelegramImageFile(null)
  setWinnersTelegramImagePreview('')
  setWinnersTelegramImageUrl('')
  // ลบ URL ออกจาก gameData
  if (isEdit && gameId) {
    try {
      await persistWinnersImageToGame('')
    } catch (err) {
      console.warn('[CreateGame] Clear winners image from gameData failed:', err)
    }
  }
}, [winnersTelegramImagePreview, isEdit, gameId, persistWinnersImageToGame])

// บันทึก template + รูป
// - รูปประกาศ → เก็บใน gameData (per game)
// - template ข้อความ → เก็บใน themeSettings (per theme — ใช้เป็นค่าเริ่มต้นกับเกมอื่น ๆ)
const saveWinnersTelegramConfig = React.useCallback(async () => {
  if (!isEdit || !gameId) {
    alert('กรุณาบันทึกเกมก่อน แล้วจึงตั้งค่าประกาศผู้ชนะ')
    return
  }
  setWinnersTelegramConfigSaving(true)
  try {
    // 1) อัปโหลดรูป (ถ้ามีไฟล์ใหม่)
    let finalUrl = winnersTelegramImageUrl.trim()
    if (winnersTelegramImageFile) {
      finalUrl = await uploadImageToStorage(winnersTelegramImageFile, 'announce')
    }

    // 2) บันทึกรูปลง gameData (per game) — เขียนที่ gameData.numberPick / gameData.football เป็นหลัก
    await persistWinnersImageToGame(finalUrl)

    // 3) บันทึก template ข้อความลง themeSettings (ใช้เป็น default ของเกมอื่นในธีมนี้)
    await saveThemeSettings(themeName, {
      [winnersTelegramKeys.messageKey]: winnersTelegramMessage.trim() || winnersTelegramKeys.defaultTemplate,
    })

    setWinnersTelegramImageUrl(finalUrl)
    setWinnersTelegramImageFile(null)
    setWinnersTelegramImagePreview(finalUrl)
    alert('บันทึกการตั้งค่าประกาศผู้ชนะเรียบร้อย')
  } catch (error) {
    console.error('[CreateGame] Save winners telegram config failed:', error)
    alert('บันทึกการตั้งค่าไม่สำเร็จ')
  } finally {
    setWinnersTelegramConfigSaving(false)
  }
}, [isEdit, gameId, winnersTelegramImageUrl, winnersTelegramImageFile, winnersTelegramMessage, winnersTelegramKeys, themeName, persistWinnersImageToGame])

// ส่งประกาศผู้ชนะเข้ากลุ่ม Telegram
const sendWinnersTelegram = React.useCallback(async () => {
  if (!gameId) {
    alert('ยังไม่ได้บันทึกเกม กรุณาบันทึกก่อน')
    return
  }
  // ถ้าอัปโหลดไฟล์ฝากแล้ว (หรือมี snapshot ใน gameData) → ใช้ qualified (ฝากครบเกณฑ์) เป็น "ผู้ชนะ"
  // ถ้ายังไม่อัปโหลด → ใช้ทุกคนที่ทายล่าสุดถูก (พฤติกรรมเดิม)
  const hasDepositReport = depositSumByUser.size > 0
  const winnersList = hasDepositReport
    ? qualifiedWinners.map((w) => w.user)
    : correctLatestWinners.map((w) => w.user)
  const unqualifiedList = hasDepositReport ? unqualifiedWinners.map((w) => w.user) : []
  if (winnersList.length === 0) {
    const msg = hasDepositReport
      ? 'ยังไม่มีผู้ทายถูก + ฝากครบเกณฑ์ ต้องการส่งประกาศต่อไปหรือไม่?'
      : 'ยังไม่มีผู้ทายล่าสุดถูก ต้องการส่งประกาศต่อไปหรือไม่?'
    if (!window.confirm(msg)) return
  }

  setWinnersTelegramSending(true)
  try {
    // 1) อัปโหลดรูปก่อน (ถ้ามีไฟล์ใหม่) แล้วบันทึกลง gameData (per game)
    let finalImageUrl = winnersTelegramImageUrl.trim()
    if (winnersTelegramImageFile) {
      finalImageUrl = await uploadImageToStorage(winnersTelegramImageFile, 'announce')
      setWinnersTelegramImageUrl(finalImageUrl)
      setWinnersTelegramImageFile(null)
      setWinnersTelegramImagePreview(finalImageUrl)

      // ✅ บันทึกรูปลง gameData (เพื่อให้ครั้งหน้าโหลดมาใช้ต่อได้)
      try {
        await persistWinnersImageToGame(finalImageUrl)
      } catch (saveErr) {
        // ไม่ block การส่ง — แค่ log
        console.warn('[CreateGame] Persist winners image to gameData failed:', saveErr)
      }
    }

    const correctText = type === 'เกมทายเบอร์เงิน'
      ? numberPickCorrectAnswer.trim()
      : ((footballCorrectHome.trim() && footballCorrectAway.trim())
          ? `${footballCorrectHome.trim()}-${footballCorrectAway.trim()}`
          : '')

    const payload = {
      themeName,
      gameId,
      activityName: winnersTelegramKeys.activityName,
      gameName: name?.trim() || '',
      imageUrl: finalImageUrl,
      messageTemplate: winnersTelegramMessage.trim() || winnersTelegramKeys.defaultTemplate,
      winners: winnersList,
      unqualifiedWinners: unqualifiedList,
      correctAnswer: correctText,
    }

    const endpoints = ['/api/telegram/send-winners', '/.netlify/functions/send-telegram-winners']
    let success = false
    let lastError = ''

    for (const endpoint of endpoints) {
      try {
        const res = await fetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        })
        if (res.ok) {
          success = true
          break
        }
        const errorText = await res.text()
        lastError = errorText || `HTTP ${res.status}`
      } catch (err: any) {
        lastError = err?.message || String(err)
      }
    }

    if (success) {
      alert('ส่งประกาศผู้ชนะเข้ากลุ่ม Telegram เรียบร้อยแล้ว')
    } else {
      console.error('[CreateGame] sendWinnersTelegram all endpoints failed:', lastError)
      // Fallback: เปิดหน้าแชร์ Telegram
      const previewMsg = (winnersTelegramMessage.trim() || winnersTelegramKeys.defaultTemplate)
        .replace(/\{themeName\}/g, themeName.toUpperCase())
        .replace(/\{activityName\}/g, winnersTelegramKeys.activityName)
        .replace(/\{gameName\}/g, name?.trim() || '')
        .replace(/\{correctAnswer\}/g, correctText)
        .replace(/\{winners\}/g, winnersList.length === 0
          ? '— ยังไม่มีผู้ชนะ —'
          : winnersList.map((u) => `💚 ${u}`).join('\n'))
        .replace(/\{unqualifiedWinners\}/g, unqualifiedList.length === 0
          ? '— ไม่มี —'
          : unqualifiedList.map((u) => `⚠️ ${u}`).join('\n'))
      const shareUrl = `https://t.me/share/url?url=${encodeURIComponent('about:blank')}&text=${encodeURIComponent(previewMsg)}`
      window.open(shareUrl, '_blank', 'noopener,noreferrer')
      alert('ส่งอัตโนมัติไม่สำเร็จ — เปิดหน้าแชร์ Telegram ให้แทน\n(หาก dev: Deploy ขึ้น Netlify ก่อนใช้งานจริง)')
    }
  } catch (err: any) {
    console.error('[CreateGame] sendWinnersTelegram failed:', err)
    alert(`ส่งประกาศไม่สำเร็จ: ${err?.message || err}`)
  } finally {
    setWinnersTelegramSending(false)
  }
}, [gameId, themeName, name, type, numberPickCorrectAnswer, footballCorrectHome, footballCorrectAway, correctLatestWinners, qualifiedWinners, unqualifiedWinners, depositSumByUser, winnersTelegramMessage, winnersTelegramImageUrl, winnersTelegramImageFile, winnersTelegramKeys, persistWinnersImageToGame])

// สรุปจำนวนวันเช็คอิน (นับจากประวัติ checkin ทั้งหมด) → { user: count }
const checkedCountByUser = React.useMemo(() => {
  const byUser = new Map<string, Set<number>>()
  for (const r of logCheckin) {
    if (!r.user) continue
    const d = Number(r.dayIndex || 0)
    if (!byUser.has(r.user)) byUser.set(r.user, new Set<number>())
    if (Number.isFinite(d) && d > 0) byUser.get(r.user)!.add(d)
  }
  const out: Record<string, number> = {}
  for (const [u, setDays] of byUser) out[u] = setDays.size
  return out
}, [logCheckin])

// รายชื่อผู้ที่เคยเช็คอินเกมนี้ (จาก logCheckin)
const checkinUsers = React.useMemo(() => {
  const st = new Set<string>()
  for (const r of logCheckin) {
    const u = normalizeUser(r.user || '')
    if (u) st.add(u)
  }
  return st
}, [logCheckin])

  
  // sync จำนวนช่อง CODE (เกมทายภาพ)
  React.useEffect(() => {
    setCodes((prev) => {
      const next = [...prev]
      if (numCodes > next.length) {
        while (next.length < numCodes) next.push('')
      } else {
        next.length = numCodes
      }
      return next
    })
  }, [numCodes])

  React.useEffect(() => {
    setPartyRounds((prev) => {
      const next = [...prev]
      if (partyRoundsCount > next.length) {
        while (next.length < partyRoundsCount) {
          next.push(createEmptyPartyRound(next.length + 1))
        }
      } else if (partyRoundsCount < next.length) {
        next.length = partyRoundsCount
      }
      return next.map((r, idx) => ({
        ...r,
        round: idx + 1,
        codeCount: Math.max(1, Number(r.codeCount) || 1),
      }))
    })
  }, [partyRoundsCount])

  // Loading states for different data sections
  const [gameDataLoading, setGameDataLoading] = React.useState(false)
  // ✅ ลบ answersDataLoading ออกแล้ว (ย้ายไปไว้ในหน้า AdminAnswers.tsx แล้ว)
  
  // สำหรับ trigger reload หลังจากบันทึก
  const [reloadTrigger, setReloadTrigger] = React.useState(0)
  
  // สถานะการบันทึกข้อมูล
  const [isSaving, setIsSaving] = React.useState(false)
  const [isDirty, setIsDirty] = React.useState(false)
  
  // ✅ เก็บโค้ดเดิมไว้เพื่อเปรียบเทียบ (ป้องกันการ reset cursor เมื่อโค้ดไม่เปลี่ยน)
  const originalCodesRef = React.useRef<string[]>([])
  const originalCheckinRewardsRef = React.useRef<any>(null)
  const originalCheckinCompleteRewardRef = React.useRef<any>(null)
  const originalCheckinCouponItemsRef = React.useRef<any[]>([])
  const originalLoyKrathongCodesRef = React.useRef<string[]>([])
  const originalLoyKrathongBigPrizeCodesRef = React.useRef<string[]>([])
  const originalTrickOrTreatCodesRef = React.useRef<string[]>([])

  // ✅ Reset originalImageUrl, originalCheckinImageUrl และ originalAnnounceImageUrl เมื่อสร้างเกมใหม่ (ไม่ใช่โหมดแก้ไข)
  React.useEffect(() => {
    if (!isEdit) {
      setOriginalImageUrl('')
      setOriginalCheckinImageUrl('')
      setOriginalAnnounceImageUrl('')
    }
  }, [isEdit])

  // ✅ โหลดรูปภาพการ์ดล่าสุดเมื่อสร้างเกมใหม่ (type === 'เกมลุ้นรางวัลพิเศษ')
  React.useEffect(() => {
    if (isEdit) {
      console.log('[CreateGame] Skipping card image load - edit mode')
      return // ไม่ต้องโหลดถ้าเป็น edit mode (จะโหลดจากเกมที่แก้ไข)
    }
    if (type !== 'เกมลุ้นรางวัลพิเศษ') {
      // ✅ Reset card images เมื่อเปลี่ยน type ออกจากเกมลุ้นรางวัลพิเศษ
      setCardImage1('')
      setCardImage2('')
      setCardImage3('')
      setOriginalCardImage1Url('')
      setOriginalCardImage2Url('')
      setOriginalCardImage3Url('')
      return
    }
    
    console.log('[CreateGame] Loading card images for trick or treat game', {
      themeImages: {
        card1: themeImages.card1,
        card2: themeImages.card2,
        card3: themeImages.card3
      }
    })
    
    const loadLatestCardImages = async () => {
      try {
        // ✅ โหลดรูปภาพการ์ดล่าสุดจาก document แยก (themes/{theme}/card-images/latest) ก่อน
        const { getLatestCardImages, getGames } = await import('../services/firebase-games-new')
        const latestCardImages = await getLatestCardImages()
        
        if (latestCardImages && (latestCardImages.card1 || latestCardImages.card2 || latestCardImages.card3)) {
          // ✅ มีรูปการ์ดจาก document แยก
          console.log('[CreateGame] Loading latest card images from separate document:', {
            card1Url: latestCardImages.card1 ? latestCardImages.card1.substring(0, 100) : 'empty',
            card2Url: latestCardImages.card2 ? latestCardImages.card2.substring(0, 100) : 'empty',
            card3Url: latestCardImages.card3 ? latestCardImages.card3.substring(0, 100) : 'empty'
          })
          
          // โหลดรูปภาพการ์ด
          if (latestCardImages.card1) {
            const convertedCard1Url = getImageUrl(latestCardImages.card1)
            setCardImage1(convertedCard1Url || latestCardImages.card1)
            setOriginalCardImage1Url(latestCardImages.card1)
          }
          
          if (latestCardImages.card2) {
            const convertedCard2Url = getImageUrl(latestCardImages.card2)
            setCardImage2(convertedCard2Url || latestCardImages.card2)
            setOriginalCardImage2Url(latestCardImages.card2)
          }
          
          if (latestCardImages.card3) {
            const convertedCard3Url = getImageUrl(latestCardImages.card3)
            setCardImage3(convertedCard3Url || latestCardImages.card3)
            setOriginalCardImage3Url(latestCardImages.card3)
          }
        } else {
          // ✅ ถ้าไม่มีจาก document แยก ให้ลองโหลดจากเกมลุ้นรางวัลพิเศษล่าสุด
          console.log('[CreateGame] No card images from separate document, trying to load from latest game')
          const games = await getGames()
          
          // หาเกมลุ้นรางวัลพิเศษล่าสุดที่มี cardImages
          const trickOrTreatGames = games
            .filter((g: any) => g.type === 'เกมลุ้นรางวัลพิเศษ' && (g as any).cardImages)
            .sort((a: any, b: any) => {
              const aTime = a.createdAt?.toMillis?.() || new Date(a.createdAt || 0).getTime() || 0
              const bTime = b.createdAt?.toMillis?.() || new Date(b.createdAt || 0).getTime() || 0
              return bTime - aTime
            })
          
          if (trickOrTreatGames.length > 0) {
            const latestGame = trickOrTreatGames[0]
            const cardImages = (latestGame as any).cardImages || {}
            const card1Url = cardImages.card1 || ''
            const card2Url = cardImages.card2 || ''
            const card3Url = cardImages.card3 || ''
            
            if (card1Url || card2Url || card3Url) {
              console.log('[CreateGame] Loading latest card images from previous game:', {
                gameId: latestGame.id,
                card1Url: card1Url ? card1Url.substring(0, 100) : 'empty',
                card2Url: card2Url ? card2Url.substring(0, 100) : 'empty',
                card3Url: card3Url ? card3Url.substring(0, 100) : 'empty'
              })
              
              // โหลดรูปภาพการ์ด
              if (card1Url) {
                const convertedCard1Url = getImageUrl(card1Url)
                setCardImage1(convertedCard1Url || card1Url)
                setOriginalCardImage1Url(card1Url)
              }
              
              if (card2Url) {
                const convertedCard2Url = getImageUrl(card2Url)
                setCardImage2(convertedCard2Url || card2Url)
                setOriginalCardImage2Url(card2Url)
              }
              
              if (card3Url) {
                const convertedCard3Url = getImageUrl(card3Url)
                setCardImage3(convertedCard3Url || card3Url)
                setOriginalCardImage3Url(card3Url)
              }
            } else {
              // ✅ ถ้าไม่มีรูปจากเกมล่าสุด ให้ใช้รูปจาก theme assets
              console.log('[CreateGame] No card images from previous game, using theme assets')
              setCardImage1(themeImages.card1)
              setCardImage2(themeImages.card2)
              setCardImage3(themeImages.card3)
              setOriginalCardImage1Url('')
              setOriginalCardImage2Url('')
              setOriginalCardImage3Url('')
            }
          } else {
            // ✅ ถ้าไม่มีเกมลุ้นรางวัลพิเศษเลย ให้ใช้รูปจาก theme assets
            console.log('[CreateGame] No previous trick or treat games found, using theme assets')
            setCardImage1(themeImages.card1)
            setCardImage2(themeImages.card2)
            setCardImage3(themeImages.card3)
            setOriginalCardImage1Url('')
            setOriginalCardImage2Url('')
            setOriginalCardImage3Url('')
          }
        }
      } catch (error) {
        console.error('[CreateGame] Error loading latest card images:', error)
        // ✅ ถ้าเกิด error ให้ใช้รูปจาก theme assets เป็น fallback
        setCardImage1(themeImages.card1)
        setCardImage2(themeImages.card2)
        setCardImage3(themeImages.card3)
        setOriginalCardImage1Url('')
        setOriginalCardImage2Url('')
        setOriginalCardImage3Url('')
      }
    }
    
    loadLatestCardImages()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [type, isEdit])
  
  // ขั้นตอนที่ 1: โหลดข้อมูลเกมที่ตั้งค่าไว้แล้ว (ข้อมูลน้อย) - โหลดก่อน
  React.useEffect(() => {
    if (!isEdit) return
    
    // ✅ Clear cache เมื่อเปลี่ยน gameId เพื่อป้องกันการแสดงข้อมูลเกมผิด
    if (gameId) {
      dataCache.delete(`game:${gameId}`)
    }
    
    // ✅ Reset originalImageUrl, originalCheckinImageUrl และ originalAnnounceImageUrl เมื่อเปลี่ยนเกม (เปลี่ยน gameId)
    setOriginalImageUrl('')
    setOriginalCheckinImageUrl('')
    setOriginalAnnounceImageUrl('')
    
    // useEffect โหลดข้อมูลเกมทำงาน
    
    const loadGameData = async () => {
      setGameDataLoading(true)
      try {
        // ✅ Validate gameId before making API call
        if (!gameId || typeof gameId !== 'string' || gameId.trim().length === 0) {
          console.error('[CreateGame] Invalid gameId:', gameId)
          alert('Invalid game ID')
          setGameDataLoading(false)
          return
        }
        
        const trimmedGameId = gameId.trim()
        
        // ✅ ใช้ Firestore 100%
        // ✅ ใช้ fullData=true เพื่อบังคับให้ Firestore ส่ง full game data แทน snapshot (สำหรับหน้าแก้ไข)
        // ✅ Clear cache ก่อนโหลดเสมอ (ทั้ง development และ production) เพื่อป้องกัน stale cache
        const { invalidateCache } = await import('../services/cachedFetch');
        const { dataCache } = await import('../services/cache');
        // Clear both cached fetch and data cache
        invalidateCache(`/api/games/${trimmedGameId}?full=true`);
        invalidateCache(`/api/games/${trimmedGameId}`);
        dataCache.delete(`game:${trimmedGameId}`);
        
        // ✅ cachedFetch จะใช้ cache อัตโนมัติ (TTL: 10 นาทีสำหรับ fullData)
        // ✅ แต่ใน production จะ force fetch ใหม่เสมอ (ผ่าน revalidateOnMount)
        let gameData: any = null
        try {
          gameData = await getGameById(trimmedGameId)
        } catch (error) {
          // ✅ Log error details in production
          console.error('[CreateGame] Error loading game data:', {
            gameId: trimmedGameId,
            error: error instanceof Error ? error.message : String(error),
            errorName: error instanceof Error ? error.name : 'Unknown',
            errorStack: error instanceof Error ? error.stack : undefined,
            apiUrl: import.meta.env.PROD ? `API call to /api/games/${trimmedGameId}?full=true` : undefined
          })
          throw error // Re-throw to be caught by outer catch
        }
        
        // ✅ Debug: Log ข้อมูลที่โหลดมาจากฐานข้อมูล (always log in production for troubleshooting)
        // ✅ Log เสมอ (ทั้ง dev และ prod) เพื่อช่วย debug
        const keys = gameData ? Object.keys(gameData) : [];
        const hasAnnounceInKeys = keys.includes('announce');
        console.log('[CreateGame] Loaded game data:', {
          gameId: trimmedGameId,
          hasData: !!gameData,
          isArray: Array.isArray(gameData),
          dataType: typeof gameData,
          keys: keys,
          hasAnnounceInKeys: hasAnnounceInKeys,
          type: (gameData as any)?.type,
          hasAnnounce: !!(gameData as any)?.announce,
          announceKeys: (gameData as any)?.announce ? Object.keys((gameData as any).announce) : [],
          announceUsers: (gameData as any)?.announce?.users,
          announceUsersType: typeof (gameData as any)?.announce?.users,
          announceUsersIsArray: Array.isArray((gameData as any)?.announce?.users),
          announceUsersLength: Array.isArray((gameData as any)?.announce?.users) ? (gameData as any).announce.users.length : 'not-array',
          // ✅ เพิ่ม logging สำหรับ game types อื่นๆ
          hasNumberPick: !!(gameData as any)?.numberPick,
          hasPuzzle: !!(gameData as any)?.puzzle,
          hasFootball: !!(gameData as any)?.football,
          hasSlot: !!(gameData as any)?.slot,
          hasCheckin: !!(gameData as any)?.checkin,
          hasLoyKrathong: !!(gameData as any)?.loyKrathong,
          hasTrickOrTreat: !!(gameData as any)?.trickOrTreat,
          // ✅ Log all keys to see what's actually in the response
          allKeysWithValues: keys.reduce((acc, key) => {
            const value = (gameData as any)?.[key];
            acc[key] = {
              type: typeof value,
              isArray: Array.isArray(value),
              isObject: typeof value === 'object' && value !== null && !Array.isArray(value),
              keys: typeof value === 'object' && value !== null && !Array.isArray(value) ? Object.keys(value) : [],
              length: Array.isArray(value) ? value.length : undefined
            };
            return acc;
          }, {} as Record<string, any>)
        });
        
        // ✅ แก้ไข: ถ้าเป็น array ให้เอาตัวแรก
        if (Array.isArray(gameData)) {
          gameData = gameData.length > 0 ? gameData[0] : null
        }
        
        let g = (gameData || {}) as GameData
        let loadedGameId = g.id || (g as any).game_id || ''
        
        // ✅ ตรวจสอบว่า gameId ที่โหลดมาถูกต้องหรือไม่
        if (loadedGameId && loadedGameId !== gameId) {
          // ✅ ถ้า gameId ไม่ตรง ให้ clear cache และโหลดใหม่
          dataCache.delete(`game:${gameId}`)
          dataCache.delete(`game:${loadedGameId}`)
          // ✅ Retry 1 ครั้ง
          gameData = await getGameById(gameId)
          if (Array.isArray(gameData)) {
            gameData = gameData.length > 0 ? gameData[0] : null
          }
          g = (gameData || {}) as GameData
          loadedGameId = g.id || (g as any).game_id || ''
          if (loadedGameId && loadedGameId !== gameId) {
            alert(`เกิดข้อผิดพลาด: โหลดข้อมูลเกมผิด (ต้องการ: ${gameId}, ได้: ${loadedGameId})`)
            setGameDataLoading(false)
            return
          }
        }
        
        if (!g || Object.keys(g).length === 0) {
          // ✅ Retry 1 ครั้งถ้าข้อมูลว่างเปล่า (อาจเป็น cache issue)
          console.warn('[CreateGame] Game data is empty, retrying...', {
            gameId,
            gameData,
            g,
            keys: g ? Object.keys(g) : []
          })
          
          // ✅ Clear cache และ retry
          const { invalidateCache } = await import('../services/cachedFetch');
          const { dataCache } = await import('../services/cache');
          invalidateCache(`/api/games/${trimmedGameId}?full=true`);
          invalidateCache(`/api/games/${trimmedGameId}`);
          dataCache.delete(`game:${trimmedGameId}`);
          
          // ✅ Retry 1 ครั้ง
          try {
            gameData = await getGameById(trimmedGameId)
            if (Array.isArray(gameData)) {
              gameData = gameData.length > 0 ? gameData[0] : null
            }
            g = (gameData || {}) as GameData
          } catch (retryError) {
            console.error('[CreateGame] Retry failed:', retryError)
          }
          
          // ✅ ถ้ายังว่างเปล่าหลัง retry ให้แสดง error
          if (!g || Object.keys(g).length === 0) {
            console.error('[CreateGame] Game data is still empty after retry:', {
              gameId,
              gameData,
              g,
              keys: g ? Object.keys(g) : [],
              // ✅ In production, log API URL for debugging
              apiUrl: import.meta.env.PROD ? `API call to /api/games/${gameId}?full=true` : undefined
            })
            // ✅ Show user-friendly error message
            const errorMsg = import.meta.env.PROD 
              ? `ไม่พบข้อมูลเกม "${gameId}"\n\nกรุณาตรวจสอบ:\n1. Game ID ถูกต้องหรือไม่\n2. Firestore ทำงานอยู่หรือไม่\n3. ตรวจสอบ Console logs สำหรับรายละเอียดเพิ่มเติม`
              : `ไม่พบข้อมูลเกม "${gameId}" กรุณาตรวจสอบว่า gameId ถูกต้องและ Firestore ทำงานอยู่`
            alert(errorMsg)
            setGameDataLoading(false)
            return
          }
        }

        // map ค่าลง "หน้าเดิม"
        setType((g.type || 'เกมทายภาพปริศนา') as GameType)
        setName(g.name || (g as any).title || '')
        // ✅ โหลด claimedBy จากหลายที่: top-level, gameData.claimedBy, หรือ gameData.gameData.claimedBy
        const rawClaimedBy = (g as any).claimedBy || (g as any).gameData?.claimedBy || (g as any).gameData?.gameData?.claimedBy || {}
        
        // ✅ Debug: Log claimedBy data (development only)
        if (import.meta.env.DEV && Object.keys(rawClaimedBy).length > 0) {
          console.log('[CreateGame] Loaded claimedBy:', {
            gameId,
            count: Object.keys(rawClaimedBy).length,
            sample: Object.entries(rawClaimedBy).slice(0, 3).map(([userId, data]) => ({
              userId,
              dataType: typeof data,
              isObject: typeof data === 'object' && data !== null,
              code: typeof data === 'object' && data !== null ? (data as any).code : data
            }))
          })
        }
        
        setClaimedBy(rawClaimedBy)
        const claimedCodeMap: Record<string, string> = {}
        for (const [userId, claim] of Object.entries(rawClaimedBy || {})) {
          const claimObj = claim as any
          const code = typeof claimObj === 'string' ? claimObj : (claimObj?.code || claimObj?.c || '')
          const normalizedCode = String(code || '').trim()
          if (normalizedCode) claimedCodeMap[normalizedCode] = userId
        }
        const partyRoundState = (g as any).gameData?.partyRoundState || (g as any).partyRoundState || {}
        for (const state of Object.values(partyRoundState as Record<string, any>)) {
          const roundClaimedBy = (state as any)?.claimedBy || {}
          for (const [userId, claim] of Object.entries(roundClaimedBy)) {
            const claimObj = claim as any
            const code = typeof claimObj === 'string' ? claimObj : (claimObj?.code || claimObj?.c || '')
            const normalizedCode = String(code || '').trim()
            if (normalizedCode) claimedCodeMap[normalizedCode] = userId
          }
        }
        setClaimedCodeUsers(claimedCodeMap)
        
        // โหลดข้อมูลสิทธิ์ USER เข้าเล่นเกม
        setUserAccessType((g.userAccessType || 'all') as 'all' | 'selected')
        setSelectedUsers(g.selectedUsers || [])
        
        // ✅ Debug: Log game type (always log for consistency with development)
        console.log('[CreateGame] Game type detected:', {
          gameId,
          type: g.type,
          name: g.name,
          hasAnnounce: !!(g as any).announce,
          hasGameDataAnnounce: !!(g as any).gameData?.announce,
          hasNestedGameDataAnnounce: !!(g as any).gameData?.gameData?.announce,
          allKeys: Object.keys(g)
        });

        // ✅ Debug: Log type และ announce เพื่อตรวจสอบ (development only)
        // Removed for production

      // ✅ ตรวจสอบ type ของเกมก่อน map ข้อมูล
        // ✅ Debug: Log condition check (development only)
        // Removed for production
      
      if (g.type === 'เกมทายภาพปริศนา' || g.type === 'เกมปาร์ตี้' || (g as any).puzzle || (g as any).gameData?.puzzle) {
        // ✅ รองรับทั้ง nested (gameData.puzzle.imageDataUrl), (puzzle.imageDataUrl) และ flat (imageDataUrl)
        const puzzleData = (g as any).gameData?.puzzle || (g as any).puzzle || {}
        const rawImageUrl = puzzleData.imageDataUrl || (g as any).imageDataUrl || ''
        const rawAnswer = puzzleData.answer || (g as any).answer || ''
        // ✅ โหลด codes จากหลายที่: puzzleData.codes, (g as any).codes (top-level), หรือ gameData.codes
        const rawCodes = puzzleData.codes || (g as any).codes || (g as any).gameData?.codes || []
        // ✅ โหลด fileName จาก puzzleData หรือ top-level
        const rawFileName = puzzleData.fileName || (g as any).fileName || ''
        
        // ✅ Debug: Log ข้อมูลที่โหลดมา (always log for consistency with development)
        console.log('[CreateGame] Loading puzzle game data:', {
          gameId,
          type: g.type,
          hasPuzzle: !!(g as any).puzzle,
          hasGameDataPuzzle: !!(g as any).gameData?.puzzle,
          puzzleDataKeys: Object.keys(puzzleData),
          rawImageUrl: rawImageUrl ? rawImageUrl.substring(0, 50) + '...' : '',
          rawAnswer,
          rawCodesLength: Array.isArray(rawCodes) ? rawCodes.length : 0,
          rawFileName
        })
        
        setImageDataUrl(rawImageUrl)
        // ✅ เก็บ URL รูปภาพเก่าไว้เพื่อลบออกเมื่ออัปโหลดรูปใหม่
        // เก็บเฉพาะ URL ที่เป็น Firebase Storage หรือ CDN URL (ไม่เก็บ data URL หรือ blob URL)
        if (rawImageUrl && !rawImageUrl.startsWith('data:') && !rawImageUrl.startsWith('blob:')) {
          setOriginalImageUrl(rawImageUrl)
        } else {
          setOriginalImageUrl('')
        }
        setAnswer(rawAnswer)
        setFileName(rawFileName)
        const arr: string[] = Array.isArray(rawCodes) ? rawCodes : []
        setCodes(arr.length ? arr : [''])
        setNumCodes(Math.max(1, arr.length || 1))
        if (g.type === 'เกมปาร์ตี้') {
          // ✅ โหลดโหมดเกมปาร์ตี้ (ค่าเริ่มต้น = classic เพื่อ backward compat)
          const savedPartyMode: PartyMode =
            ((g as any).partyMode || (g as any).gameData?.partyMode) === 'random_pool'
              ? 'random_pool'
              : 'classic'
          setPartyMode(savedPartyMode)

          const rawPartyRounds = (g as any).partyRounds || (g as any).gameData?.partyRounds || []
          if (Array.isArray(rawPartyRounds) && rawPartyRounds.length > 0) {
            const mapped = rawPartyRounds.map((r: any, idx: number) => ({
              round: idx + 1,
              answer: String(r?.answer || ''),
              codeCount: Math.max(1, Number(r?.codeCount) || 1),
              imageDataUrl: String(r?.imageDataUrl || ''),
              fileName: String(r?.fileName || ''),
              imageFile: null,
            }))
            setPartyRounds(mapped)
            setPartyRoundsCount(mapped.length)
          } else {
            setPartyRounds([
              {
                round: 1,
                answer: rawAnswer,
                codeCount: Math.max(1, arr.length || 1),
                imageDataUrl: rawImageUrl || '',
                fileName: rawFileName || '',
                imageFile: null,
              },
            ])
            setPartyRoundsCount(1)
          }
        }
        // ✅ เก็บโค้ดเดิมไว้เพื่อเปรียบเทียบ
        originalCodesRef.current = arr.map(c => String(c || '').trim()).filter(Boolean)
        setHomeTeam(''); setAwayTeam(''); setEndAt('')
        
        // ✅ Debug: Log state ที่ถูก set (always log for consistency with development)
        console.log('[CreateGame] Puzzle game state updated:', {
          imageDataUrl: rawImageUrl ? rawImageUrl.substring(0, 50) + '...' : '',
          answer: rawAnswer,
          fileName: rawFileName,
          codesLength: arr.length,
          numCodes: Math.max(1, arr.length || 1)
        })
      } else if (g.type === 'เกมลอยกระทง' || (g as any).loyKrathong || (g as any).gameData?.loyKrathong) {
        // ✅ Debug: Log ข้อมูลที่โหลดมา (always log for consistency with development)
        console.log('[CreateGame] Loading loyKrathong game data:', {
          gameId,
          type: g.type,
          hasLoyKrathong: !!(g as any).loyKrathong,
          hasGameDataLoyKrathong: !!(g as any).gameData?.loyKrathong,
          loyKrathongDataKeys: (g as any).gameData?.loyKrathong ? Object.keys((g as any).gameData.loyKrathong) : [],
          gKeys: Object.keys(g || {}),
          gGameDataKeys: (g as any).gameData ? Object.keys((g as any).gameData) : []
        });
        
        // โหลดค่าเกมลอยกระทง
        const loyKrathongData = (g as any).gameData?.loyKrathong || (g as any).loyKrathong || {}
        const endAtValue = loyKrathongData.endAt || (g as any).endAt
        
        // ✅ Debug: Log ข้อมูลที่แปลงแล้ว (always log for consistency with development)
        console.log('[CreateGame] Converted loyKrathong data:', {
          gameId,
          endAtValue,
          endAtFormatted: toLocalInput(endAtValue),
          hasEndAt: !!endAtValue
        });
        
        setImageDataUrl('')
        setEndAt(toLocalInput(endAtValue))
        const arr: string[] = Array.isArray((g as any).codes) ? (g as any).codes : []
        setCodes(arr.length ? arr : [''])
        setNumCodes(Math.max(1, arr.length || 1))
        // ✅ เก็บโค้ดเดิมไว้เพื่อเปรียบเทียบ
        originalLoyKrathongCodesRef.current = arr.map(c => String(c || '').trim()).filter(Boolean)
        
        // โหลดโค้ดรางวัลใหญ่
        const bigPrizeArr: string[] = Array.isArray(loyKrathongData.bigPrizeCodes) ? loyKrathongData.bigPrizeCodes : []
        setBigPrizeCodes(bigPrizeArr.length ? bigPrizeArr : [''])
        setNumBigPrizeCodes(Math.max(1, bigPrizeArr.length || 1))
        // ✅ เก็บโค้ดรางวัลใหญ่เดิมไว้เพื่อเปรียบเทียบ
        originalLoyKrathongBigPrizeCodesRef.current = bigPrizeArr.map(c => String(c || '').trim()).filter(Boolean)
        
        setAnswer('')
        setHomeTeam(''); setAwayTeam('')
      } else if (g.type === 'เกมทายเบอร์เงิน' || (g as any).numberPick || (g as any).gameData?.numberPick) {
        // ✅ Debug: Log ข้อมูลที่โหลดมา (always log for consistency between dev and prod)
        console.log('[CreateGame] Loading numberPick game data:', {
          gameId,
          type: g.type,
          hasNumberPick: !!(g as any).numberPick,
          hasGameDataNumberPick: !!(g as any).gameData?.numberPick,
          numberPickDataKeys: (g as any).gameData?.numberPick ? Object.keys((g as any).gameData.numberPick) : [],
          gKeys: Object.keys(g || {}),
          gGameDataKeys: (g as any).gameData ? Object.keys((g as any).gameData) : []
        });
        
        const numberPickData = (g as any).gameData?.numberPick || (g as any).numberPick || {}
        const imageUrl = numberPickData.imageDataUrl || (g as any).imageDataUrl || ''
        const endAtValue = numberPickData.endAt || (g as any).endAt
        
        // ✅ Debug: Log ข้อมูลที่แปลงแล้ว (always log in production for troubleshooting)
        console.log('[CreateGame] Converted numberPick data:', {
          gameId,
          numberPickData,
          numberPickDataKeys: Object.keys(numberPickData),
          imageUrl: imageUrl ? imageUrl.substring(0, 50) + '...' : '',
          endAtValue,
          endAtFormatted: toLocalInput(endAtValue),
          hasImage: !!imageUrl,
          hasEndAt: !!endAtValue,
          // ✅ Log raw data เพื่อดูว่ามีอะไรบ้าง
          rawNumberPick: (g as any).numberPick,
          rawGameDataNumberPick: (g as any).gameData?.numberPick,
          gKeys: Object.keys(g || {}),
          gGameDataKeys: (g as any).gameData ? Object.keys((g as any).gameData) : []
        });
        
        setImageDataUrl(imageUrl)
        setEndAt(toLocalInput(endAtValue))
        setAnswer(''); setCodes(['']); setNumCodes(1)
        setBigPrizeCodes(['']); setNumBigPrizeCodes(1)
        setHomeTeam(''); setAwayTeam('')
        // ✅ โหลดคำตอบที่ถูก + สถานะสิ้นสุดกิจกรรม (ถ้ามี)
        setNumberPickCorrectAnswer(String(numberPickData.correctAnswer || ''))
        setNumberPickEndedAt(typeof numberPickData.endedAt === 'number' ? numberPickData.endedAt : null)
        setFootballCorrectHome(''); setFootballCorrectAway(''); setFootballEndedAt(null)
        // ✅ โหลดรูปประกาศผู้ชนะ (เก็บต่อเกม)
        const savedWinnersImg = String(numberPickData.winnersTelegramImageUrl || '')
        setWinnersTelegramImageUrl(savedWinnersImg)
        setWinnersTelegramImageFile(null)
        setWinnersTelegramImagePreview(savedWinnersImg)
        // ✅ โหลด snapshot ไฟล์รายงานฝาก (เก็บต่อเกม)
        const savedDeposit = (numberPickData as any).depositReport
        if (savedDeposit && typeof savedDeposit === 'object') {
          const map = new Map<string, number>()
          if (savedDeposit.sumByUser && typeof savedDeposit.sumByUser === 'object') {
            for (const [k, v] of Object.entries(savedDeposit.sumByUser as Record<string, unknown>)) {
              const n = Number(v)
              if (Number.isFinite(n)) map.set(String(k), n)
            }
          }
          setDepositSumByUser(map)
          setDepositTotalRows(Number(savedDeposit.totalRows) || map.size)
          setDepositFileName(String(savedDeposit.fileName || ''))
          setDepositUploadedAt(typeof savedDeposit.uploadedAt === 'number' ? savedDeposit.uploadedAt : null)
        } else {
          setDepositSumByUser(new Map())
          setDepositTotalRows(0)
          setDepositFileName('')
          setDepositUploadedAt(null)
        }
        setDepositError('')
      } else if (g.type === 'เกมทายผลบอล' || (g as any).football || (g as any).gameData?.football) {
        // ✅ Debug: Log ข้อมูลที่โหลดมา (always log for consistency with development)
        console.log('[CreateGame] Loading football game data:', {
          gameId,
          type: g.type,
          hasFootball: !!(g as any).football,
          hasGameDataFootball: !!(g as any).gameData?.football,
          footballDataKeys: (g as any).gameData?.football ? Object.keys((g as any).gameData.football) : [],
          gKeys: Object.keys(g || {}),
          gGameDataKeys: (g as any).gameData ? Object.keys((g as any).gameData) : []
        });
        
        const footballData = (g as any).gameData?.football || (g as any).football || {}
        const imageUrl = footballData.imageDataUrl || (g as any).imageDataUrl || ''
        const homeTeam = footballData.homeTeam || (g as any).homeTeam || ''
        const awayTeam = footballData.awayTeam || (g as any).awayTeam || ''
        const endAtValue = footballData.endAt || (g as any).endAt
        
        // ✅ Debug: Log ข้อมูลที่แปลงแล้ว (always log for consistency with development)
        console.log('[CreateGame] Converted football data:', {
          gameId,
          imageUrl: imageUrl ? imageUrl.substring(0, 50) + '...' : '',
          homeTeam,
          awayTeam,
          endAtValue,
          endAtFormatted: toLocalInput(endAtValue),
          hasImage: !!imageUrl,
          hasEndAt: !!endAtValue
        });
        
        setImageDataUrl(imageUrl)
        setHomeTeam(homeTeam)
        setAwayTeam(awayTeam)
        setEndAt(toLocalInput(endAtValue))
        setAnswer(''); setCodes(['']); setNumCodes(1)
        setBigPrizeCodes(['']); setNumBigPrizeCodes(1)
        // ✅ โหลดคำตอบที่ถูก + สถานะสิ้นสุดกิจกรรม (ถ้ามี) — รูปแบบ "X-Y"
        const savedCorrect = String(footballData.correctAnswer || '')
        const m = savedCorrect.match(/^\s*(\d+)\s*[-–]\s*(\d+)\s*$/)
        setFootballCorrectHome(m ? m[1] : '')
        setFootballCorrectAway(m ? m[2] : '')
        setFootballEndedAt(typeof footballData.endedAt === 'number' ? footballData.endedAt : null)
        setNumberPickCorrectAnswer(''); setNumberPickEndedAt(null)
        // ✅ โหลดรูปประกาศผู้ชนะ (เก็บต่อเกม)
        const savedWinnersImg = String(footballData.winnersTelegramImageUrl || '')
        setWinnersTelegramImageUrl(savedWinnersImg)
        setWinnersTelegramImageFile(null)
        setWinnersTelegramImagePreview(savedWinnersImg)
        // ✅ โหลด snapshot ไฟล์รายงานฝาก (เก็บต่อเกม)
        const savedDeposit = (footballData as any).depositReport
        if (savedDeposit && typeof savedDeposit === 'object') {
          const map = new Map<string, number>()
          if (savedDeposit.sumByUser && typeof savedDeposit.sumByUser === 'object') {
            for (const [k, v] of Object.entries(savedDeposit.sumByUser as Record<string, unknown>)) {
              const n = Number(v)
              if (Number.isFinite(n)) map.set(String(k), n)
            }
          }
          setDepositSumByUser(map)
          setDepositTotalRows(Number(savedDeposit.totalRows) || map.size)
          setDepositFileName(String(savedDeposit.fileName || ''))
          setDepositUploadedAt(typeof savedDeposit.uploadedAt === 'number' ? savedDeposit.uploadedAt : null)
        } else {
          setDepositSumByUser(new Map())
          setDepositTotalRows(0)
          setDepositFileName('')
          setDepositUploadedAt(null)
        }
        setDepositError('')
      } else if (g.type === 'เกมบอลโลก' || (g as any).worldCup || (g as any).gameData?.worldCup) {
        // ✅ เกมบอลโลก: ตารางการแข่งขัน FIFA World Cup 2026 (ฝังในโค้ดแล้ว)
        const worldCupData = (g as any).gameData?.worldCup || (g as any).worldCup || {}
        console.log('[CreateGame] Loading worldCup game data:', {
          gameId,
          type: g.type,
          hasWorldCup: !!(g as any).worldCup,
          hasGameDataWorldCup: !!(g as any).gameData?.worldCup,
        })
        setImageDataUrl('')
        setHomeTeam('')
        setAwayTeam('')
        setEndAt('') // ไม่ใช้ deadline สำหรับเกมบอลโลก
        setAnswer(''); setCodes(['']); setNumCodes(1)
        setBigPrizeCodes(['']); setNumBigPrizeCodes(1)
        setFootballCorrectHome(''); setFootballCorrectAway('')
        setFootballEndedAt(null)
        setNumberPickCorrectAnswer(''); setNumberPickEndedAt(null)
        // โหลดผลแข่งขัน + รายการโค้ด + claimedBy + ended รายคู่
        const matchResults = (worldCupData.matchResults || {}) as Record<string | number, any>
        const next: Record<string | number, WorldCupResultInput> = {}
        for (const [k, v] of Object.entries(matchResults)) {
          if (!v || typeof v !== 'object') continue
          const home = v.home === undefined || v.home === null ? '' : String(v.home)
          const away = v.away === undefined || v.away === null ? '' : String(v.away)
          // รองรับ data รูปแบบเดิม (code: string เดียว) — แปลงเป็น codes: [code]
          let codes: string[] = Array.isArray(v.codes) ? v.codes.map((c: any) => String(c)) : []
          if (codes.length === 0 && typeof v.code === 'string' && v.code.trim() !== '') {
            codes = [v.code.trim()]
          }
          const codeCursor = Number.isFinite(Number(v.codeCursor)) ? Number(v.codeCursor) : 0
          const codeFileName = v.codeFileName ? String(v.codeFileName) : ''
          const claimedBy = (v.claimedBy && typeof v.claimedBy === 'object') ? v.claimedBy : {}
          const ended = !!v.ended
          const endedAt = v.endedAt ? Number(v.endedAt) : null
          const telegramImageUrl = typeof v.telegramImageUrl === 'string' ? v.telegramImageUrl : ''
          if (home === '' && away === '' && codes.length === 0 && !ended && !telegramImageUrl) continue
          next[k] = { home, away, codes, codeCursor, codeFileName, claimedBy, ended, endedAt, telegramImageUrl }
        }
        setWorldCupResults(next)
        setWorldCupEnded(!!worldCupData.ended)
        setWorldCupEndedAt(worldCupData.endedAt ? Number(worldCupData.endedAt) : null)
        // ✅ โบนัสต่อคู่ — default 50 ถ้า DB ยังไม่ตั้ง
        const bonus = Number(worldCupData.bonusPerCorrect)
        setWorldCupBonusPerCorrect(Number.isFinite(bonus) && bonus >= 0 ? bonus : 50)
        // ✅ รูปภาพแจ้งเตือน (popup เมื่อเข้าเกม)
        const noticeImg = String(worldCupData.noticeImageUrl || '')
        if (noticeImg) {
          const converted = getImageUrl(noticeImg)
          setWorldCupNoticeImageDataUrl(converted || noticeImg)
          if (!noticeImg.startsWith('data:') && !noticeImg.startsWith('blob:')) {
            setOriginalWorldCupNoticeImageUrl(noticeImg)
          }
        } else {
          setWorldCupNoticeImageDataUrl('')
          setOriginalWorldCupNoticeImageUrl('')
        }
        setWorldCupNoticeImageFile(null)
        setWorldCupNoticeImageFileName('')
      } else if (g.type === 'เกมสล็อต' || (g as any).slot || (g as any).gameData?.slot) {
        // ✅ Debug: Log ข้อมูลที่โหลดมา (always log for consistency with development)
        console.log('[CreateGame] Loading slot game data:', {
          gameId,
          type: g.type,
          hasSlot: !!(g as any).slot,
          hasGameDataSlot: !!(g as any).gameData?.slot,
          slotDataKeys: (g as any).gameData?.slot ? Object.keys((g as any).gameData.slot) : [],
          gKeys: Object.keys(g || {}),
          gGameDataKeys: (g as any).gameData ? Object.keys((g as any).gameData) : []
        });
        
        const slotData = (g as any).gameData?.slot || (g as any).slot || {}
        const slotConfig = {
          startCredit: num(slotData.startCredit || (g as any).startCredit, 100),
          startBet: num(slotData.startBet || (g as any).startBet, 1),
          winRate: num(slotData.winRate || (g as any).winRate, 30),
          targetCredit: num(slotData.targetCredit || (g as any).targetCredit, 200),
          winTiers: slotData.winTiers || (g as any).winTiers || undefined,
        }
        
        // ✅ Debug: Log ข้อมูลที่แปลงแล้ว (always log for consistency with development)
        console.log('[CreateGame] Converted slot data:', {
          gameId,
          slotConfig
        });
        
        setSlot(slotConfig)
        setImageDataUrl(''); setAnswer(''); setCodes(['']); setNumCodes(1)
        setBigPrizeCodes(['']); setNumBigPrizeCodes(1)
        setHomeTeam(''); setAwayTeam(''); setEndAt('')
      } else if (g.type === 'เกมลุ้นรางวัลพิเศษ' || (g as any).trickOrTreat || (g as any).gameData?.trickOrTreat) {
        // ✅ Debug: Log ข้อมูลที่โหลดมา (always log for consistency with development)
        console.log('[CreateGame] Loading trickOrTreat game data:', {
          gameId,
          type: g.type,
          hasTrickOrTreat: !!(g as any).trickOrTreat,
          hasGameDataTrickOrTreat: !!(g as any).gameData?.trickOrTreat,
          trickOrTreatDataKeys: (g as any).gameData?.trickOrTreat ? Object.keys((g as any).gameData.trickOrTreat) : [],
          gKeys: Object.keys(g || {}),
          gGameDataKeys: (g as any).gameData ? Object.keys((g as any).gameData) : []
        });
        
        // โหลดค่าเกมลุ้นรางวัลพิเศษ
        const trickOrTreatData = (g as any).gameData?.trickOrTreat || (g as any).trickOrTreat || {}
        const winChance = num(trickOrTreatData.winChance || (g as any).winChance, 50)
        // ✅ โหลด codes จากหลายที่: (g as any).codes (top-level), gameData.codes, หรือ trickOrTreatData.codes
        const arr: string[] = Array.isArray((g as any).codes) 
          ? (g as any).codes 
          : Array.isArray((g as any).gameData?.codes)
          ? (g as any).gameData.codes
          : Array.isArray(trickOrTreatData.codes)
          ? trickOrTreatData.codes
          : []
        
        // ✅ โหลดรูปภาพการ์ด (แยกจากข้อมูลเกม)
        const cardImages = (g as any).cardImages || {}
        const card1Url = cardImages.card1 || ''
        const card2Url = cardImages.card2 || ''
        const card3Url = cardImages.card3 || ''
        
        // ✅ Debug: Log ข้อมูลที่แปลงแล้ว (always log for consistency with development)
        console.log('[CreateGame] Converted trickOrTreat data:', {
          gameId,
          winChance,
          codesLength: arr.length,
          codes: arr.length > 0 ? arr.slice(0, 3).map(c => String(c || '').substring(0, 20)) : [],
          codesSource: Array.isArray((g as any).codes) 
            ? 'root.codes' 
            : Array.isArray((g as any).gameData?.codes) 
            ? 'gameData.codes' 
            : Array.isArray(trickOrTreatData.codes) 
            ? 'trickOrTreatData.codes' 
            : 'none',
          hasCardImages: !!cardImages.card1 || !!cardImages.card2 || !!cardImages.card3,
          cardImages: cardImages,
          card1Url: card1Url ? card1Url.substring(0, 100) : 'empty',
          card2Url: card2Url ? card2Url.substring(0, 100) : 'empty',
          card3Url: card3Url ? card3Url.substring(0, 100) : 'empty'
        });
        
        setTrickOrTreatWinChance(winChance)
        setCodes(arr.length ? arr : [''])
        setNumCodes(Math.max(1, arr.length || 1))
        // ✅ เก็บโค้ดเดิมไว้เพื่อเปรียบเทียบ
        originalTrickOrTreatCodesRef.current = arr.map(c => String(c || '').trim()).filter(Boolean)
        
        // ✅ โหลดรูปภาพการ์ด (ใช้ getImageUrl เพื่อแปลงเป็น CDN URL)
        console.log('[CreateGame] Loading card images:', {
          cardImages,
          card1Url: card1Url ? card1Url.substring(0, 100) : 'empty',
          card2Url: card2Url ? card2Url.substring(0, 100) : 'empty',
          card3Url: card3Url ? card3Url.substring(0, 100) : 'empty'
        })
        
        if (card1Url) {
          const convertedCard1Url = getImageUrl(card1Url)
          console.log('[CreateGame] Card 1 URL conversion:', { 
            original: card1Url.substring(0, 100), 
            converted: convertedCard1Url.substring(0, 100),
            isEmpty: !convertedCard1Url
          })
          setCardImage1(convertedCard1Url || card1Url) // Fallback to original if conversion fails
          setOriginalCardImage1Url(card1Url) // Keep original URL for fallback
        } else {
          setCardImage1('')
          setOriginalCardImage1Url('')
        }
        
        if (card2Url) {
          const convertedCard2Url = getImageUrl(card2Url)
          console.log('[CreateGame] Card 2 URL conversion:', { 
            original: card2Url.substring(0, 100), 
            converted: convertedCard2Url.substring(0, 100),
            isEmpty: !convertedCard2Url
          })
          setCardImage2(convertedCard2Url || card2Url) // Fallback to original if conversion fails
          setOriginalCardImage2Url(card2Url) // Keep original URL for fallback
        } else {
          setCardImage2('')
          setOriginalCardImage2Url('')
        }
        
        if (card3Url) {
          const convertedCard3Url = getImageUrl(card3Url)
          console.log('[CreateGame] Card 3 URL conversion:', { 
            original: card3Url.substring(0, 100), 
            converted: convertedCard3Url.substring(0, 100),
            isEmpty: !convertedCard3Url
          })
          setCardImage3(convertedCard3Url || card3Url) // Fallback to original if conversion fails
          setOriginalCardImage3Url(card3Url) // Keep original URL for fallback
        } else {
          setCardImage3('')
          setOriginalCardImage3Url('')
        }
        
        // รีเซ็ต field ของประเภทอื่น
        setImageDataUrl(''); setAnswer('')
        setBigPrizeCodes(['']); setNumBigPrizeCodes(1)
        setHomeTeam(''); setAwayTeam(''); setEndAt('')
      } else if (g.type === 'เกมป๊อกเด้ง' || (g as any).pokDeng || (g as any).gameData?.pokDeng) {
        // ✅ โหลดค่าเกมป๊อกเด้ง
        const pokDengData = (g as any).gameData?.pokDeng || (g as any).pokDeng || {}
        const standThreshold = num(pokDengData.npcStandThreshold, 5)
        const winChance = num(pokDengData.playerWinChance, 50)
        const arr: string[] = Array.isArray((g as any).codes)
          ? (g as any).codes
          : Array.isArray((g as any).gameData?.codes)
          ? (g as any).gameData.codes
          : []

        setPokDengNpcStand(Math.max(0, Math.min(9, standThreshold)))
        setPokDengWinChance(Math.max(0, Math.min(100, winChance)))
        setCodes(arr.length ? arr : [''])
        setNumCodes(Math.max(1, arr.length || 1))
        originalPokDengCodesRef.current = arr.map(c => String(c || '').trim()).filter(Boolean)

        // รีเซ็ต field ของประเภทอื่น
        setImageDataUrl(''); setAnswer('')
        setBigPrizeCodes(['']); setNumBigPrizeCodes(1)
        setHomeTeam(''); setAwayTeam(''); setEndAt('')
      } else if (g.type === 'เกมประกาศรางวัล' || (g as any).announce || (g as any).gameData?.announce || (g as any).gameData?.gameData?.announce) {
        // ✅ โหลดค่าเกมประกาศรางวัล
        // ✅ รองรับทั้ง nested (gameData.gameData.announce), (gameData.announce), (announce) และ flat structure
        // ✅ ตรวจสอบจากหลายที่: gameData.gameData.announce (nested), gameData.announce (top-level), announce (flat)
        const announceData = (g as any).gameData?.gameData?.announce || (g as any).gameData?.announce || (g as any).announce || {}
        
        // ✅ Debug: Log ข้อมูลที่โหลดมา (always log in production for troubleshooting)
        console.log('[CreateGame] Loading announce game data:', {
            gameId,
            type: g.type,
            hasAnnounce: !!(g as any).announce,
            hasGameDataAnnounce: !!(g as any).gameData?.announce,
            hasNestedGameDataAnnounce: !!(g as any).gameData?.gameData?.announce,
            announceDataKeys: Object.keys(announceData),
            announceData: announceData,
            usersCount: Array.isArray(announceData?.users) ? announceData.users.length : (announceData?.users ? 'not-array' : 0),
            userBonusesCount: Array.isArray(announceData?.userBonuses) ? announceData.userBonuses.length : (announceData?.userBonuses ? 'not-array' : 0),
            usersType: typeof announceData?.users,
            usersIsArray: Array.isArray(announceData?.users),
            userBonusesType: typeof announceData?.userBonuses,
            userBonusesIsArray: Array.isArray(announceData?.userBonuses),
            // ✅ เพิ่ม logging เพื่อตรวจสอบว่า g object มีอะไรบ้าง
            gKeys: Object.keys(g || {}),
            gGameDataKeys: (g as any).gameData ? Object.keys((g as any).gameData) : [],
            gGameDataGameDataKeys: (g as any).gameData?.gameData ? Object.keys((g as any).gameData.gameData) : [],
            // ✅ ตรวจสอบว่า announce อยู่ในที่ไหน
            announceInG: !!(g as any).announce,
            announceInGameData: !!(g as any).gameData?.announce,
            announceInGameDataGameData: !!(g as any).gameData?.gameData?.announce
        });
        
        // ✅ แปลง users และ userBonuses ให้เป็น array
        // ✅ รองรับทั้ง array และ object (ถ้าเป็น object ให้แปลงเป็น array)
        let users: string[] = []
        if (Array.isArray(announceData?.users)) {
          users = announceData.users
        } else if (announceData?.users && typeof announceData.users === 'object') {
          // ถ้าเป็น object ให้แปลงเป็น array โดยใช้ Object.values
          const usersObj = announceData.users
          const keys = Object.keys(usersObj)
          const numericKeys = keys.filter(k => !isNaN(Number(k)))
          if (numericKeys.length > 0) {
            // ถ้ามี numeric keys แสดงว่าเป็น array-like object
            users = Object.values(usersObj) as string[]
          } else {
            // ถ้าไม่มี numeric keys แสดงว่าเป็น object ธรรมดา ให้ใช้ values
            users = Object.values(usersObj) as string[]
          }
        }
        
        // ✅ ถ้า users ว่างเปล่า แต่มี processedItems ให้แปลง processedItems เป็น users
        if (users.length === 0 && announceData?.processedItems && typeof announceData.processedItems === 'object') {
          users = Object.keys(announceData.processedItems)
        }
        
        let userBonuses: Array<{ user: string; bonus: number }> = []
        if (Array.isArray(announceData?.userBonuses)) {
          userBonuses = announceData.userBonuses
        } else if (announceData?.userBonuses && typeof announceData.userBonuses === 'object') {
          // ถ้าเป็น object ให้แปลงเป็น array
          const bonusesObj = announceData.userBonuses
          const keys = Object.keys(bonusesObj)
          const numericKeys = keys.filter(k => !isNaN(Number(k)))
          if (numericKeys.length > 0) {
            // ถ้ามี numeric keys แสดงว่าเป็น array-like object
            userBonuses = Object.values(bonusesObj) as Array<{ user: string; bonus: number }>
          } else {
            // ถ้าไม่มี numeric keys แสดงว่าเป็น object ธรรมดา ให้ใช้ values
            userBonuses = Object.values(bonusesObj) as Array<{ user: string; bonus: number }>
          }
        }
        
        // ✅ Debug: Log ข้อมูลที่แปลงแล้ว (always log in production for troubleshooting)
        console.log('[CreateGame] Converted announce data:', {
            gameId,
            usersLength: users.length,
            userBonusesLength: userBonuses.length,
            users: users.slice(0, 5), // แสดง 5 รายการแรก
            userBonuses: userBonuses.slice(0, 5),
            hasImage: !!announceData?.imageDataUrl,
            hasFileName: !!announceData?.fileName
        });
        
        setAnnounceUsers(users)
        setAnnounceUserBonuses(userBonuses)
        
        // ✅ โหลดรูปภาพ (รองรับทั้ง CDN URL และ Supabase Storage URL)
        const imageUrl = announceData?.imageDataUrl || ''
        setAnnounceImageDataUrl(imageUrl)
        // ✅ เก็บ URL รูปภาพเก่าไว้เพื่อลบออกเมื่ออัปโหลดรูปใหม่
        // เก็บเฉพาะ URL ที่เป็น Firebase Storage หรือ CDN URL (ไม่เก็บ data URL หรือ blob URL)
        if (imageUrl && !imageUrl.startsWith('data:') && !imageUrl.startsWith('blob:')) {
          setOriginalAnnounceImageUrl(imageUrl)
        } else {
          setOriginalAnnounceImageUrl('')
        }
        setAnnounceFileName(announceData?.fileName || '')
        
        // รีเซ็ต field ของประเภทอื่น
        setImageDataUrl('')
        setAnswer('')
        setCodes(['']); setNumCodes(1)
        setBigPrizeCodes(['']); setNumBigPrizeCodes(1)
        setHomeTeam(''); setAwayTeam(''); setEndAt('')
      } else if (g.type === 'เกมแนะนำเพื่อน') {
        // ✅ โหลดข้อมูล referral leaderboard
        try {
          const lb = await getReferralLeaderboard(gameId)
          setReferralSummaries(lb)
        } catch (e) {
          console.warn('[CreateGame] Failed to load referral leaderboard:', e)
        }
        // ✅ โหลดรูปภาพแนะนำเพื่อน
        const refData = (g as any).referral || (g as any).gameData?.referral || {}
        const refImg = refData.imageDataUrl || (g as any).imageDataUrl || ''
        if (refImg) {
          const converted = getImageUrl(refImg)
          setReferralImageDataUrl(converted || refImg)
          if (!refImg.startsWith('data:') && !refImg.startsWith('blob:')) {
            setOriginalReferralImageUrl(refImg)
          }
        }
        // ✅ โหลดรางวัลและสถานะสิ้นสุดกิจกรรม
        if (refData.prizes) {
          setReferralPrizes({
            rank1: refData.prizes.rank1 ?? 3000,
            rank2: refData.prizes.rank2 ?? 2000,
            rank3: refData.prizes.rank3 ?? 1000,
            rank4to10: refData.prizes.rank4to10 ?? 300,
            rank11to50: refData.prizes.rank11to50 ?? 100,
          })
        }
        if (refData.ended) {
          setReferralEnded(true)
          setReferralEndedAt(refData.endedAt || null)
        }
        setImageDataUrl('')
        setAnswer('')
        setCodes(['']); setNumCodes(1)
        setHomeTeam(''); setAwayTeam(''); setEndAt('')
      } else if (g.type === 'เกมเช็คอิน') {
        // ✅ ตรวจสอบ type ก่อนเสมอ (ไม่ตรวจสอบ checkin เพราะอาจมีในเกมอื่นด้วย)
        // ✅ โหลดค่าเกมเช็คอิน (รวม date ถ้ามี)
        // ✅ รองรับทั้ง nested (gameData.gameData.checkin) และ flat (gameData.checkin, checkin) structure
        const nestedCheckin = (g as any).gameData?.gameData?.checkin || {}
        const flatCheckin1 = (g as any).gameData?.checkin || {}
        const flatCheckin2 = (g as any).checkin || {}
        
        // ✅ รวมข้อมูลจากหลายแหล่ง (nested มีความสำคัญมากกว่า)
        const checkinData = {
          ...flatCheckin2,
          ...flatCheckin1,
          ...nestedCheckin,
          // ✅ รวม coupon items จากหลายแหล่ง (ถ้ามี codes ใน nested ใช้ nested)
          coupon: nestedCheckin.coupon || flatCheckin1.coupon || flatCheckin2.coupon || {},
        }
        const gDays = Number(checkinData.days) || (Array.isArray(checkinData.rewards) ? checkinData.rewards.length : 1)
        const d = clamp(gDays, 1, 30)

        // ✅ ไม่โหลดโค้ดทั้งหมดมาเก็บใน state (เพื่อป้องกันหน่วง)
        const arr: CheckinReward[] = Array.from({ length: d }, (_, i) => {
          const r = checkinData.rewards?.[i]
          if (!r) return { kind: 'coin', value: 1000 }
          const kind: 'coin' | 'code' = r.kind === 'code' ? 'code' : 'coin'
          // ✅ ถ้าเป็นโค้ด ให้เก็บเป็น string ว่าง (ไม่โหลดโค้ดทั้งหมด)
          const value = kind === 'coin' ? Number(r.value) || 0 : ''
          return { kind, value }
        })
        // ✅ เก็บรางวัลเดิมไว้เพื่อเปรียบเทียบ (ไม่เก็บโค้ดเพื่อลด memory)
        originalCheckinRewardsRef.current = arr.map(r => ({
          kind: r.kind,
          value: r.kind === 'code' ? '' : Number(r.value || 0)  // ✅ ไม่เก็บโค้ด
        }))
        
        // ✅ โหลดจำนวนโค้ดสำหรับ daily rewards (ไม่โหลดโค้ดทั้งหมด)
        const loadDailyRewardCodeCounts = async () => {
          setDailyRewardCodeCountsLoading(true)
          try {
            const counts = await Promise.all(
              arr.map(async (r, index) => {
                if (r.kind !== 'code') return 0
                try {
                  // ✅ ใช้ข้อมูลจาก game data ที่โหลดมาแล้ว (เก็บใน game_data JSONB)
                  const rewardCodesData = checkinData.rewardCodes?.[index]
                  
                  // ✅ ตรวจสอบโค้ดใน rewardCodes/{index}/codes (ถ้ามี)
                  const codesFromDB = Array.isArray(rewardCodesData?.codes) ? rewardCodesData.codes : []
                  const countFromDB = codesFromDB.filter((c: any) => c && String(c).trim()).length
                  
                  // ✅ ตรวจสอบโค้ดใน rewards[i].value (ถ้าเป็น string ที่มีโค้ด)
                  const originalReward = checkinData.rewards?.[index]
                  let countFromValue = 0
                  if (originalReward && originalReward.kind === 'code' && typeof originalReward.value === 'string') {
                    const codesString = String(originalReward.value || '')
                    const codes = codesString.split('\n').map(c => c.trim()).filter(Boolean)
                    countFromValue = codes.length
                  }
                  
                  // ✅ ใช้ค่าที่มากกว่า (เพราะโค้ดอาจถูกย้ายไป DB แล้ว)
                  return Math.max(countFromDB, countFromValue)
                } catch {
                  // ✅ ถ้าเกิด error ให้ตรวจสอบจาก rewards[i].value
                  try {
                    const originalReward = checkinData.rewards?.[index]
                    if (originalReward && originalReward.kind === 'code' && typeof originalReward.value === 'string') {
                      const codesString = String(originalReward.value || '')
                      const codes = codesString.split('\n').map(c => c.trim()).filter(Boolean)
                      return codes.length
                    }
                  } catch {}
                  return 0
                }
              })
            )
            setDailyRewardCodeCounts(counts)
          } catch (error) {
            console.error('Error loading daily reward code counts:', error)
            setDailyRewardCodeCounts(arr.map(() => 0))
          } finally {
            setDailyRewardCodeCountsLoading(false)
          }
        }
        loadDailyRewardCodeCounts()
        
        // ✅ รีเซ็ต dailyRewardCodes, completeRewardCodes และ couponItemCodesNew เมื่อโหลดเกมใหม่
        setDailyRewardCodes([])
        setCompleteRewardCodes([])
        setCouponItemCodesNew([])
        
         // โหลดรูปภาพสำหรับเกมเช็คอิน
         setCheckinImageDataUrl(checkinData.imageDataUrl || '')
         // ✅ เก็บ URL รูปภาพเก่าไว้เพื่อลบออกเมื่ออัปโหลดรูปใหม่
         // เก็บเฉพาะ URL ที่เป็น Firebase Storage หรือ CDN URL (ไม่เก็บ data URL หรือ blob URL)
         const checkinImageUrl = checkinData.imageDataUrl || ''
         if (checkinImageUrl && !checkinImageUrl.startsWith('data:') && !checkinImageUrl.startsWith('blob:')) {
           setOriginalCheckinImageUrl(checkinImageUrl)
         } else {
           setOriginalCheckinImageUrl('')
         }
         setCheckinFileName(checkinData.fileName || '')
         // ✅ โหลดรางวัลครบทุกวัน
         const completeR = checkinData.completeReward
         if (completeR) {
           const kind: 'coin' | 'code' = completeR.kind === 'code' ? 'code' : 'coin'
           // ✅ ถ้าเป็นโค้ด ให้เก็บเป็น string ว่าง (ไม่โหลดโค้ดทั้งหมด)
           const value = kind === 'coin' ? Number(completeR.value) || 0 : ''
           setCompleteReward({ kind, value })
           // ✅ เก็บรางวัลครบทุกวันเดิมไว้เพื่อเปรียบเทียบ (ไม่เก็บโค้ดเพื่อลด memory)
           originalCheckinCompleteRewardRef.current = {
             kind,
             value: kind === 'code' ? '' : Number(value || 0)  // ✅ ไม่เก็บโค้ด
           }
           
           // ✅ โหลดจำนวนโค้ดสำหรับ complete reward (ไม่โหลดโค้ดทั้งหมด)
           if (kind === 'code') {
             const loadCompleteRewardCodeCount = async () => {
               setCompleteRewardCodeCountLoading(true)
               try {
                 // ✅ ตรวจสอบทั้งสองที่: completeRewardCodes/codes (ถ้ามีใน DB) และ completeReward.value (ถ้าเป็น string)
                 // ✅ ใช้ข้อมูลจาก game data ที่โหลดมาแล้ว (เก็บใน game_data JSONB)
                 const completeRewardCodesData = checkinData.completeRewardCodes
                 
                 // ✅ ตรวจสอบโค้ดใน completeRewardCodes/codes (ถ้ามี)
                 const codesFromDB = Array.isArray(completeRewardCodesData?.codes) ? completeRewardCodesData.codes : []
                 const countFromDB = codesFromDB.filter((c: any) => c && String(c).trim()).length
                 
                 // ✅ ตรวจสอบโค้ดใน completeReward.value (ถ้าเป็น string ที่มีโค้ด)
                 let countFromValue = 0
                 if (completeR && completeR.kind === 'code' && typeof completeR.value === 'string') {
                   const codesString = String(completeR.value || '')
                   const codes = codesString.split('\n').map(c => c.trim()).filter(Boolean)
                   countFromValue = codes.length
                 }
                 
                 // ✅ ใช้ค่าที่มากกว่า (เพราะโค้ดอาจถูกย้ายไป DB แล้ว)
                 setCompleteRewardCodeCount(Math.max(countFromDB, countFromValue))
               } catch (error) {
                 console.error('Error loading complete reward code count:', error)
                 // ✅ ถ้าเกิด error ให้ตรวจสอบจาก completeReward.value
                 try {
                   if (completeR && completeR.kind === 'code' && typeof completeR.value === 'string') {
                     const codesString = String(completeR.value || '')
                     const codes = codesString.split('\n').map(c => c.trim()).filter(Boolean)
                     setCompleteRewardCodeCount(codes.length)
                   } else {
                     setCompleteRewardCodeCount(0)
                   }
                 } catch {
                   setCompleteRewardCodeCount(0)
                 }
               } finally {
                 setCompleteRewardCodeCountLoading(false)
               }
             }
             loadCompleteRewardCodeCount()
           } else {
             setCompleteRewardCodeCount(0)
           }
         } else {
           setCompleteReward({ kind: 'coin', value: 0 })
           originalCheckinCompleteRewardRef.current = { kind: 'coin', value: 0 }
           setCompleteRewardCodeCount(0)
         }
         // ✅ โหลดวันที่เริ่มต้นและสิ้นสุดกิจกรรม
         const startDate = checkinData.startDate || ''
         const endDate = checkinData.endDate || ''
         setCheckinStartDate(startDate)
         setCheckinEndDate(endDate)
         
         // ✅ ถ้ามีวันที่เริ่มต้นและสิ้นสุด ให้คำนวณจำนวนวันอัตโนมัติ
         if (startDate && endDate) {
           const calculatedDays = calculateDaysFromDates(startDate, endDate)
           if (calculatedDays > 0 && calculatedDays <= 30) {
             // ใช้จำนวนวันที่คำนวณได้แทนจำนวนวันที่เก็บไว้
             const finalDays = calculatedDays
             setCheckinDays(finalDays)
             // ปรับ rewards ให้มีจำนวนตาม calculatedDays
             const normalizedRewards = arr.slice(0, finalDays).map((r, i) => {
               // ใช้ข้อมูลที่มีอยู่ก่อน หรือสร้างใหม่ถ้าไม่มี
               return arr[i] || { kind: 'coin' as const, value: 100 }
             })
             // ถ้ามีน้อยกว่า finalDays ให้เพิ่ม
             if (normalizedRewards.length < finalDays) {
               while (normalizedRewards.length < finalDays) {
                 normalizedRewards.push({ kind: 'coin', value: 100 })
               }
             }
             setRewards(normalizedRewards)
           } else {
             // ถ้าคำนวณไม่ได้ หรือเกิน 30 วัน ให้ใช้ค่าที่มีอยู่
             setCheckinDays(d)
             setRewards(arr)
           }
         } else {
           // ถ้าไม่มีวันที่เริ่มต้นและสิ้นสุด ให้ใช้ค่าที่มีอยู่
           setCheckinDays(d)
           setRewards(arr)
         }
         
         // ✅ โหลดการตั้งค่าเปิด/ปิดส่วนต่างๆ
         setCheckinFeatures({
           dailyReward: normalizeFeatureFlag(checkinData.features?.dailyReward, true),
           couponShop: normalizeFeatureFlag(checkinData.features?.couponShop, true)
         })
        setCheckinContactSettings({
          telegramUrl: String(checkinData.contactChannels?.telegramUrl || (themeName === 'max56' ? 'https://t.me/MAX56VIP' : 'https://t.me/HENG36_VIP')).trim(),
          lineUrl: String(checkinData.contactChannels?.lineUrl || CHECKIN_LINE_CONTACT_BY_THEME[themeName] || CHECKIN_LINE_CONTACT_BY_THEME.heng36).trim(),
          websiteUrl: String(checkinData.contactChannels?.websiteUrl || '').trim(),
          websiteLabel: String(
            checkinData.contactChannels?.websiteLabel ||
              ({
                heng36: 'HENG36',
                max56: 'MAX56',
                jeed24: 'JEED24',
                kamo99: 'KAMO99',
                kiki49: 'KIKI49',
                abm96: 'ABM96',
                mab96: 'MAB96',
              } as Record<string, string>)[themeName] ||
              'HENG36'
          ).trim(),
        })

        const couponArr = checkinData.coupon?.items;
        if (Array.isArray(couponArr) && couponArr.length) {
          setCouponCount(couponArr.length);
          // ✅ ไม่โหลด codes ทั้งหมดมาเก็บใน state (เพื่อป้องกันหน่วง)
          const mappedCouponItems = couponArr.map((it: any) => ({
            title: typeof it?.title === 'string' ? it.title : '',
            rewardCredit: Number(it?.rewardCredit) || 0,
            price: Number(it?.price) || 0,
            codes: [''],  // ✅ เก็บเป็น array ว่าง ไม่โหลดโค้ดทั้งหมด
          }))
          setCouponItems(mappedCouponItems)
          
          // ✅ โหลดจำนวนโค้ดสำหรับแต่ละ item (ไม่โหลดโค้ดทั้งหมด)
          const loadCodeCounts = async () => {
            setCouponItemCodeCountsLoading(true)
            try {
              // ✅ Debug: Log เพื่อตรวจสอบโครงสร้างข้อมูล
              if (import.meta.env.DEV) {
                console.log('[CreateGame] Loading coupon code counts:', {
                  checkinDataKeys: Object.keys(checkinData),
                  hasCoupon: !!checkinData.coupon,
                  couponKeys: checkinData.coupon ? Object.keys(checkinData.coupon) : [],
                  hasItems: !!checkinData.coupon?.items,
                  itemsLength: Array.isArray(checkinData.coupon?.items) ? checkinData.coupon.items.length : 0,
                  firstItemKeys: checkinData.coupon?.items?.[0] ? Object.keys(checkinData.coupon.items[0]) : [],
                  firstItemCodes: checkinData.coupon?.items?.[0]?.codes ? 
                    (Array.isArray(checkinData.coupon.items[0].codes) ? 
                      `array[${checkinData.coupon.items[0].codes.length}]` : 
                      typeof checkinData.coupon.items[0].codes) : 'none',
                  // ✅ ตรวจสอบ nested structure ด้วย
                  gameDataCheckin: (g as any).gameData?.checkin ? Object.keys((g as any).gameData.checkin) : [],
                  gameDataCouponItems: (g as any).gameData?.checkin?.coupon?.items ? 
                    (Array.isArray((g as any).gameData.checkin.coupon.items) ? 
                      (g as any).gameData.checkin.coupon.items.length : 'not-array') : 'none',
                })
              }
              
              const counts = await Promise.all(
                mappedCouponItems.map(async (_, index) => {
                  try {
                    // ✅ อ่าน codes จากหลายแหล่ง (รองรับทั้ง nested และ flat structure)
                    // 1. จาก checkinData.coupon.items[index].codes (merged/flat)
                    let codesData = checkinData.coupon?.items?.[index]
                    let rawCodes = codesData?.codes
                    
                    // 2. ถ้าไม่มี ตรวจสอบจาก gameData.gameData.checkin.coupon.items[index].codes (nested)
                    if (!rawCodes) {
                      const nestedCheckin = (g as any).gameData?.gameData?.checkin
                      const nestedCoupon = nestedCheckin?.coupon
                      const nestedItems = Array.isArray(nestedCoupon?.items) ? nestedCoupon.items : []
                      if (nestedItems[index]) {
                        codesData = nestedItems[index]
                        rawCodes = codesData?.codes
                      }
                    }
                    
                    // 3. ถ้ายังไม่มี ตรวจสอบจาก gameData.checkin.coupon.items[index].codes
                    if (!rawCodes) {
                      const flatCheckin = (g as any).checkin
                      const flatCoupon = flatCheckin?.coupon
                      const flatItems = Array.isArray(flatCoupon?.items) ? flatCoupon.items : []
                      if (flatItems[index]) {
                        codesData = flatItems[index]
                        rawCodes = codesData?.codes
                      }
                    }
                    
                    // ✅ Debug log สำหรับแต่ละ item
                    if (import.meta.env.DEV && index === 0) {
                      console.log(`[CreateGame] Item ${index} codes check:`, {
                        hasCodesData: !!codesData,
                        rawCodesType: rawCodes ? typeof rawCodes : 'none',
                        rawCodesIsArray: Array.isArray(rawCodes),
                        rawCodesLength: Array.isArray(rawCodes) ? rawCodes.length : 
                          (rawCodes && typeof rawCodes === 'object' ? Object.keys(rawCodes).length : 0),
                      })
                    }
                    
                    // ✅ แปลง codes เป็น array (รองรับทั้ง array และ object)
                    let codes: string[] = [];
                    if (Array.isArray(rawCodes)) {
                      codes = rawCodes.filter((c: any) => c && String(c).trim());
                    } else if (rawCodes && typeof rawCodes === 'object') {
                      // แปลง object เป็น array
                      codes = Object.keys(rawCodes)
                        .sort((a, b) => Number(a) - Number(b))
                        .map(k => String(rawCodes[k] || ''))
                        .filter(Boolean);
                    }
                    
                    return codes.length;
                  } catch (error) {
                    console.error(`[CreateGame] Error loading code count for item ${index}:`, error)
                    return 0
                  }
                })
              )
              
              // ✅ Debug log ผลลัพธ์
              if (import.meta.env.DEV) {
                console.log('[CreateGame] Coupon code counts loaded:', counts)
              }
              
              setCouponItemCodeCounts(counts)
            } catch (error) {
              console.error('Error loading coupon code counts:', error)
              setCouponItemCodeCounts(mappedCouponItems.map(() => 0))
            } finally {
              setCouponItemCodeCountsLoading(false)
            }
          }
          loadCodeCounts()
          
          // ✅ เก็บคูปองเดิมไว้เพื่อเปรียบเทียบ (ไม่เก็บ codes เพื่อลด memory)
          originalCheckinCouponItemsRef.current = mappedCouponItems.map(it => ({
            title: it.title,
            rewardCredit: it.rewardCredit,
            price: it.price,
            codes: []  // ✅ ไม่เก็บ codes เพื่อลด memory
          }))
        } else {
          setCouponCount(1);
          setCouponItems(Array.from({ length: 1 }).map((_, i) => ({
            title: '',
            rewardCredit: [5000,25000,50000,100000,165000,300000][i] ?? 5000,
            price:        [10,50,100,200,300,500][i] ?? 10,
            codes: [''],
          })));
          setCouponItemCodeCounts([0]);
        }

        // รีเซ็ต field ของประเภทอื่น
        setImageDataUrl('')
        setAnswer('')
        setCodes(['']); setNumCodes(1)
        setBigPrizeCodes(['']); setNumBigPrizeCodes(1)
        setHomeTeam(''); setAwayTeam(''); setEndAt('')
      } else if (g.type === 'เกมประกาศรางวัล' || (g as any).announce || (g as any).gameData?.announce || (g as any).gameData?.gameData?.announce) {
        // ✅ โหลดค่าเกมประกาศรางวัล
        // ✅ รองรับทั้ง nested (gameData.gameData.announce), (gameData.announce), (announce) และ flat structure
        // ✅ ตรวจสอบจากหลายที่: gameData.gameData.announce (nested), gameData.announce (top-level), announce (flat)
        const announceData = (g as any).gameData?.gameData?.announce || (g as any).gameData?.announce || (g as any).announce || {}
        
        // ✅ Debug: Log ข้อมูลที่โหลดมา (always log in production for troubleshooting)
        console.log('[CreateGame] Loading announce game data:', {
            gameId,
            type: g.type,
            hasAnnounce: !!(g as any).announce,
            hasGameDataAnnounce: !!(g as any).gameData?.announce,
            hasNestedGameDataAnnounce: !!(g as any).gameData?.gameData?.announce,
            announceDataKeys: Object.keys(announceData),
            announceData: announceData,
            usersCount: Array.isArray(announceData?.users) ? announceData.users.length : (announceData?.users ? 'not-array' : 0),
            userBonusesCount: Array.isArray(announceData?.userBonuses) ? announceData.userBonuses.length : (announceData?.userBonuses ? 'not-array' : 0),
            usersType: typeof announceData?.users,
            usersIsArray: Array.isArray(announceData?.users),
            userBonusesType: typeof announceData?.userBonuses,
            userBonusesIsArray: Array.isArray(announceData?.userBonuses),
            // ✅ เพิ่ม logging เพื่อตรวจสอบว่า g object มีอะไรบ้าง
            gKeys: Object.keys(g || {}),
            gGameDataKeys: (g as any).gameData ? Object.keys((g as any).gameData) : [],
            gGameDataGameDataKeys: (g as any).gameData?.gameData ? Object.keys((g as any).gameData.gameData) : [],
            // ✅ ตรวจสอบว่า announce อยู่ในที่ไหน
            announceInG: !!(g as any).announce,
            announceInGameData: !!(g as any).gameData?.announce,
            announceInGameDataGameData: !!(g as any).gameData?.gameData?.announce
        });
        
        // ✅ แปลง users และ userBonuses ให้เป็น array
        // ✅ รองรับทั้ง array และ object (ถ้าเป็น object ให้แปลงเป็น array)
        let users: string[] = []
        if (Array.isArray(announceData?.users)) {
          users = announceData.users
        } else if (announceData?.users && typeof announceData.users === 'object') {
          // ถ้าเป็น object ให้แปลงเป็น array โดยใช้ Object.values
          const usersObj = announceData.users
          const keys = Object.keys(usersObj)
          const numericKeys = keys.filter(k => !isNaN(Number(k)))
          if (numericKeys.length > 0) {
            // ถ้ามี numeric keys แสดงว่าเป็น array-like object
            users = Object.values(usersObj) as string[]
          } else {
            // ถ้าไม่มี numeric keys แสดงว่าเป็น object ธรรมดา ให้ใช้ values
            users = Object.values(usersObj) as string[]
          }
        }
        
        // ✅ ถ้า users ว่างเปล่า แต่มี processedItems ให้แปลง processedItems เป็น users
        if (users.length === 0 && announceData?.processedItems && typeof announceData.processedItems === 'object') {
          users = Object.keys(announceData.processedItems)
        }
        
        let userBonuses: Array<{ user: string; bonus: number }> = []
        if (Array.isArray(announceData?.userBonuses)) {
          userBonuses = announceData.userBonuses
        } else if (announceData?.userBonuses && typeof announceData.userBonuses === 'object') {
          // ถ้าเป็น object ให้แปลงเป็น array
          const bonusesObj = announceData.userBonuses
          const keys = Object.keys(bonusesObj)
          const numericKeys = keys.filter(k => !isNaN(Number(k)))
          if (numericKeys.length > 0) {
            // ถ้ามี numeric keys แสดงว่าเป็น array-like object
            userBonuses = Object.values(bonusesObj) as Array<{ user: string; bonus: number }>
          } else {
            // ถ้าไม่มี numeric keys แสดงว่าเป็น object ธรรมดา ให้ใช้ values
            userBonuses = Object.values(bonusesObj) as Array<{ user: string; bonus: number }>
          }
        }
        
        // ✅ Debug: Log ข้อมูลที่แปลงแล้ว (always log in production for troubleshooting)
        console.log('[CreateGame] Converted announce data:', {
            gameId,
            usersLength: users.length,
            userBonusesLength: userBonuses.length,
            users: users.slice(0, 5), // แสดง 5 รายการแรก
            userBonuses: userBonuses.slice(0, 5),
            hasImage: !!announceData?.imageDataUrl,
            hasFileName: !!announceData?.fileName
        });
        
        setAnnounceUsers(users)
        setAnnounceUserBonuses(userBonuses)
        
        // ✅ โหลดรูปภาพ (รองรับทั้ง CDN URL และ Supabase Storage URL)
        const imageUrl = announceData?.imageDataUrl || ''
        setAnnounceImageDataUrl(imageUrl)
        // ✅ เก็บ URL รูปภาพเก่าไว้เพื่อลบออกเมื่ออัปโหลดรูปใหม่
        // เก็บเฉพาะ URL ที่เป็น Firebase Storage หรือ CDN URL (ไม่เก็บ data URL หรือ blob URL)
        if (imageUrl && !imageUrl.startsWith('data:') && !imageUrl.startsWith('blob:')) {
          setOriginalAnnounceImageUrl(imageUrl)
        } else {
          setOriginalAnnounceImageUrl('')
        }
        setAnnounceFileName(announceData?.fileName || '')
        
        // รีเซ็ต field ของประเภทอื่น
        setImageDataUrl('')
        setAnswer('')
        setCodes(['']); setNumCodes(1)
        setBigPrizeCodes(['']); setNumBigPrizeCodes(1)
        setHomeTeam(''); setAwayTeam(''); setEndAt('')
      } else if (g.type === 'เกมแนะนำเพื่อน') {
        try {
          const lb = await getReferralLeaderboard(gameId)
          setReferralSummaries(lb)
        } catch (e) {
          console.warn('[CreateGame] Failed to load referral leaderboard (cache path):', e)
        }
        const refData = (g as any).referral || (g as any).gameData?.referral || {}
        const refImg = refData.imageDataUrl || (g as any).imageDataUrl || ''
        if (refImg) {
          const converted = getImageUrl(refImg)
          setReferralImageDataUrl(converted || refImg)
          if (!refImg.startsWith('data:') && !refImg.startsWith('blob:')) {
            setOriginalReferralImageUrl(refImg)
          }
        }
        setImageDataUrl('')
        setAnswer('')
        setCodes(['']); setNumCodes(1)
        setHomeTeam(''); setAwayTeam(''); setEndAt('')
      } else {
        // fallback
        setImageDataUrl(''); setAnswer(''); setCodes(['']); setNumCodes(1)
        setBigPrizeCodes(['']); setNumBigPrizeCodes(1)
        setHomeTeam(''); setAwayTeam(''); setEndAt('')
      }
    } catch (error) {
        // ✅ Log error details (always log in production for troubleshooting)
        console.error('[CreateGame] Error loading game data:', {
          gameId,
          error: error instanceof Error ? error.message : String(error),
          errorName: error instanceof Error ? error.name : 'Unknown',
          errorStack: error instanceof Error ? error.stack : undefined,
          apiUrl: import.meta.env.PROD ? `API call to /api/games/${gameId}?full=true` : undefined
        })
        
        // ✅ Retry mechanism: ถ้าเกิด error ให้ retry 1 ครั้ง
        console.warn('[CreateGame] Retrying after error...')
        try {
          // ✅ Clear cache ก่อน retry
          const { invalidateCache } = await import('../services/cachedFetch');
          const { dataCache } = await import('../services/cache');
          invalidateCache(`/api/games/${gameId}?full=true`);
          invalidateCache(`/api/games/${gameId}`);
          dataCache.delete(`game:${gameId}`);
          
          // ✅ Retry 1 ครั้ง
          const retryGameData = await getGameById(gameId)
          if (retryGameData) {
            // ✅ ถ้า retry สำเร็จ ให้โหลดข้อมูลใหม่
            console.log('[CreateGame] Retry successful, reloading data...')
            // ✅ เรียก loadGameData อีกครั้ง (recursive call)
            await loadGameData()
            return
          }
        } catch (retryError) {
          console.error('[CreateGame] Retry also failed:', retryError)
        }
        
        // ✅ แสดง error message ที่ชัดเจนขึ้น
        const errorMessage = error instanceof Error 
          ? error.message 
          : 'เกิดข้อผิดพลาดในการโหลดข้อมูลเกม'
        
        // ✅ ถ้าเป็น network error ให้บอกว่า Firestore ไม่ทำงาน
        if (error instanceof Error && error.name === 'NetworkError') {
          alert(`ไม่สามารถเชื่อมต่อกับ Firestore server\n\nกรุณาตรวจสอบว่า Firestore ทำงานอยู่\n\nError: ${errorMessage}`)
        } else {
          alert(`เกิดข้อผิดพลาดในการโหลดข้อมูลเกม "${gameId}"\n\nError: ${errorMessage}\n\nกรุณาลอง refresh หน้าหรือตรวจสอบ Console logs`)
        }
      } finally {
        setGameDataLoading(false)
        setIsDirty(false)
      }
    }

    if (isEdit && gameId) {
      loadGameData()
    } else {
      // ✅ ถ้าไม่ใช่โหมดแก้ไข ให้ reset state
      setGameDataLoading(false)
      setIsDirty(false)
    }
  }, [isEdit, gameId, reloadTrigger])

  // ✅ ลบส่วนโหลด answers ออกแล้ว (ย้ายไปไว้ในหน้า AdminAnswers.tsx แล้ว)

  // ✅ ลบฟังก์ชัน fmtThai, downloadAnswers และ refreshAnswers ออกแล้ว (ย้ายไปไว้ในหน้า AdminAnswers.tsx แล้ว)

  // ✅ Cleanup preview URLs เมื่อ component unmount
  React.useEffect(() => {
    return () => {
      // Cleanup preview URLs (blob URLs)
      if (imageDataUrl && imageDataUrl.startsWith('blob:')) {
        URL.revokeObjectURL(imageDataUrl)
      }
      if (checkinImageDataUrl && checkinImageDataUrl.startsWith('blob:')) {
        URL.revokeObjectURL(checkinImageDataUrl)
      }
      if (announceImageDataUrl && announceImageDataUrl.startsWith('blob:')) {
        URL.revokeObjectURL(announceImageDataUrl)
      }
      if (telegramPartyImagePreview && telegramPartyImagePreview.startsWith('blob:')) {
        URL.revokeObjectURL(telegramPartyImagePreview)
      }
      for (const round of partyRounds) {
        const maybeBlobUrl = round?.imageDataUrl || ''
        if (maybeBlobUrl.startsWith('blob:')) {
          URL.revokeObjectURL(maybeBlobUrl)
        }
      }
    }
  }, [imageDataUrl, checkinImageDataUrl, announceImageDataUrl, telegramPartyImagePreview, partyRounds])

  const getAnswerFromFileName = (name: string) =>
    String(name || '')
      .replace(/\.[^/.]+$/, '') // remove extension
      .replace(/[_-]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()

  const applyPickedImageFile = async (f: File, autoSetAnswer = false) => {
    if (!/^image\//.test(f.type)) {
      alert('โปรดเลือกไฟล์รูปภาพ')
      return
    }

    // ✅ Cleanup preview URL เก่า (ถ้ามี)
    if (imageDataUrl && imageDataUrl.startsWith('blob:')) {
      URL.revokeObjectURL(imageDataUrl)
    }

    setFileName(f.name)
    setImageFile(f) // ✅ เก็บ File object ไว้

    if (autoSetAnswer) {
      setAnswer(getAnswerFromFileName(f.name))
    }

    // ✅ สร้าง preview URL จาก File object (ไม่ต้องอัปโหลดทันที)
    try {
      const previewUrl = URL.createObjectURL(f)
      setImageDataUrl(previewUrl) // ใช้สำหรับ preview เท่านั้น
    } catch (error) {
      console.error('Error creating preview URL:', error)
      // Fallback: ใช้ fileToDataURL
      const data = await fileToDataURL(f)
      setImageDataUrl(data)
    }
  }

  // ✅ เลือกรูปภาพเดี่ยว (โหมดเดิม)
  const onPickImage: React.ChangeEventHandler<HTMLInputElement> = async (e) => {
    const f = e.target.files?.[0]
    if (!f) return
    await applyPickedImageFile(f)
  }

  // ✅ บันทึกคลังรูปภาพเกมปาร์ตี้ — ใช้ร่วมกันทุกธีม (เก็บที่ globalSettings/partyGame)
  const persistPartyImagePool = React.useCallback(async (pool: PartyPoolImage[]) => {
    try {
      await saveGlobalSettings({
        [PARTY_IMAGE_POOL_KEY]: JSON.stringify(pool),
      })
    } catch (error) {
      console.error('[CreateGame] Failed to save party image pool (global):', error)
    }
  }, [])

  // ✅ อัปโหลดรูปเข้าคลังเกมปาร์ตี้ (เก็บลง DB เป็น URL)
  const onUploadPartyImages: React.ChangeEventHandler<HTMLInputElement> = async (e) => {
    const files = Array.from(e.target.files || [])
    // เคลียร์ค่าใน input เพื่อให้เลือกไฟล์เดิมซ้ำได้
    e.target.value = ''

    const images = files
      .filter((f) => /^image\//.test(f.type))
      .sort((a, b) => a.name.localeCompare(b.name, 'th'))

    if (images.length === 0) {
      alert('กรุณาเลือกไฟล์รูปภาพอย่างน้อย 1 ไฟล์')
      return
    }

    setPartyImagePoolUploading(true)
    try {
      const uploaded: PartyPoolImage[] = []
      for (const file of images) {
        try {
          // ✅ scope='global' → เก็บไฟล์ที่ globalSettings/partyImagePool/... ไม่ผูกธีม
          //    ทุกธีมเขียน/อ่าน path เดียวกัน — รูปไม่หายเมื่อ deploy/แก้ rules ต่อธีม
          const url = await uploadImageToStorage(file, 'partyImagePool', undefined, { scope: 'global' })
          if (url) {
            uploaded.push({ url: convertToCDNUrl(url), name: file.name })
          }
        } catch (uploadError) {
          console.error('[CreateGame] Upload party image failed:', file.name, uploadError)
        }
      }

      if (uploaded.length === 0) {
        alert('อัปโหลดรูปภาพไม่สำเร็จ กรุณาลองใหม่')
        return
      }

      const failed = images.length - uploaded.length
      if (failed > 0) {
        alert(`อัปโหลดสำเร็จ ${uploaded.length} รูป (ไม่สำเร็จ ${failed} รูป)`)
      }

      const nextPool = [...partyImagePool, ...uploaded]
      setPartyImagePool(nextPool)
      await persistPartyImagePool(nextPool)
    } finally {
      setPartyImagePoolUploading(false)
    }
  }

  // ✅ ล้างคลังรูปภาพทั้งหมด (ลบทั้งใน themeSettings และไฟล์ใน storage)
  const clearPartyImagePool = async () => {
    if (partyImagePool.length === 0) return
    if (!window.confirm(`ต้องการล้างคลังรูปภาพทั้งหมด (${partyImagePool.length} รูป) ใช่หรือไม่?`)) return

    setPartyImagePoolClearing(true)
    try {
      const urlsToDelete = partyImagePool.map((p) => p.url)

      // ลบไฟล์ใน storage แบบขนาน (ไม่ block ถ้าลบบางไฟล์ไม่สำเร็จ)
      await Promise.allSettled(
        urlsToDelete.map((url) =>
          deleteImageFromStorage(url).catch((delError) => {
            console.warn('[CreateGame] Delete storage file failed (continue):', delError)
          })
        )
      )

      setPartyImagePool([])
      await persistPartyImagePool([])

      // ล้างรูปในรอบที่อ้างอิงรูปจากคลังเก่า
      const removedSet = new Set(urlsToDelete)
      setPartyRounds((prev) =>
        prev.map((round) =>
          round?.imageDataUrl && removedSet.has(round.imageDataUrl)
            ? { ...round, imageDataUrl: '', fileName: '', imageFile: null }
            : round
        )
      )
    } finally {
      setPartyImagePoolClearing(false)
    }
  }

  // ✅ สุ่มรูปภาพจากคลัง (DB) ให้กับรอบที่ระบุ
  const randomPickFromPartyPool = (roundIndex: number) => {
    if (partyImagePool.length === 0) {
      alert('กรุณาอัปโหลดรูปภาพเข้าคลังก่อน')
      return
    }

    const idx = Math.floor(Math.random() * partyImagePool.length)
    const selected = partyImagePool[idx]
    if (!selected) return

    setPartyRounds((prev) => {
      const next = [...prev]
      if (!next[roundIndex]) next[roundIndex] = createEmptyPartyRound(roundIndex + 1)
      next[roundIndex] = {
        ...next[roundIndex],
        imageFile: null,
        imageDataUrl: selected.url,
        fileName: selected.name,
        answer: getAnswerFromFileName(selected.name),
      }
      return next
    })
  }


  // เงื่อนไขแสดง UI เฉพาะประเภท
  const showPuzzle = type === 'เกมทายภาพปริศนา' || type === 'เกมปาร์ตี้'
  const showNumberPick = type === 'เกมทายเบอร์เงิน'
  const showFootball = type === 'เกมทายผลบอล'
  const showSlot = type === 'เกมสล็อต'
  const showCodes = showPuzzle || type === 'เกมลุ้นรางวัลพิเศษ' || type === 'เกมป๊อกเด้ง'
  const showImagePicker = needImage(type)
  const showCheckin = type === 'เกมเช็คอิน'
  const showTrickOrTreat = type === 'เกมลุ้นรางวัลพิเศษ'
  const showLoyKrathong = type === 'เกมลอยกระทง'
  const showPokDeng = type === 'เกมป๊อกเด้ง'
  const isPartyMode = type === 'เกมปาร์ตี้'
  const isTelegramConfigGame = type === 'เกมปาร์ตี้' || type === 'เกมลุ้นรางวัลพิเศษ'
  const telegramConfigTypeLabel = type === 'เกมลุ้นรางวัลพิเศษ' ? 'เกมลุ้นรางวัลพิเศษ' : 'เกมปาร์ตี้'
  const partyCodeRoundLabels = React.useMemo(() => {
    const labels = new Array<number | null>(codes.length).fill(null)
    let cursor = 0
    for (let i = 0; i < partyRounds.length; i++) {
      const count = Math.max(1, Number(partyRounds[i]?.codeCount) || 1)
      for (let j = 0; j < count && cursor < labels.length; j++) {
        labels[cursor] = i + 1
        cursor += 1
      }
      if (cursor >= labels.length) break
    }
    return labels
  }, [codes, partyRounds])

  React.useEffect(() => {
    if (type !== 'เกมปาร์ตี้') {
      setPartyMode(DEFAULT_PARTY_MODE)
      setPartyRoundsCount(1)
      setPartyRounds([createEmptyPartyRound(1)])
      setTelegramRoundSendModes({})
      setTelegramRoundScheduledAt({})
      setPendingTelegramRoundScheduleAt({})
    }
  }, [type])

  // ✅ โหลดคลังรูปภาพเกมปาร์ตี้ — ใช้ร่วมกันทุกธีม (อ่านจาก globalSettings/partyGame)
  // หาก global pool ว่าง แต่ themeSettings ของธีมนี้ยังมีคลังเก่า → migrate เข้า global ครั้งเดียว
  // เพื่อให้ผู้ใช้ไม่เสียคลังเดิม
  const parsePoolJson = React.useCallback((raw: any): PartyPoolImage[] => {
    if (!raw) return []
    try {
      const parsed = JSON.parse(String(raw))
      if (!Array.isArray(parsed)) return []
      return parsed
        .map((item: any) => ({
          url: String(item?.url || '').trim(),
          name: String(item?.name || '').trim(),
        }))
        .filter((item) => !!item.url)
    } catch (parseError) {
      console.error('[CreateGame] Failed to parse party image pool:', parseError)
      return []
    }
  }, [])

  React.useEffect(() => {
    if (type !== 'เกมปาร์ตี้') return

    let cancelled = false
    const loadPartyImagePool = async () => {
      setPartyImagePoolLoading(true)
      try {
        // 1) อ่านจาก global settings ก่อน (source of truth ใหม่)
        const globalRes = await getGlobalSettings()
        if (cancelled) return
        const globalRaw = globalRes?.settings?.[PARTY_IMAGE_POOL_KEY]

        // ✅ ถ้า field มีอยู่ใน global doc แล้ว (ไม่ว่าจะเป็น "[]" หรือมีรูป) → ใช้เป็น source of truth
        //    เลย ไม่ fallback ไป theme settings (กัน legacy data 73 รูปกลับมาหลังจาก "ล้างคลัง")
        //    หมายเหตุ: parsePoolJson("[]") → [] (length 0) → ถือว่าคลังว่างจริง ๆ
        if (typeof globalRaw === 'string') {
          setPartyImagePool(parsePoolJson(globalRaw))
          return
        }

        // 2) Fallback / migration: ถ้า global ยังไม่เคยตั้งค่าเลย แต่ theme เดิมมีคลังอยู่ → migrate เข้า global ครั้งเดียว
        try {
          const themeRes = await getThemeSettings(themeName)
          if (cancelled) return
          const themeRaw = themeRes?.settings?.[PARTY_IMAGE_POOL_KEY]
          const themePool = parsePoolJson(themeRaw)

          if (themePool.length > 0) {
            setPartyImagePool(themePool)
            // Best-effort migration — ไม่ block UI ถ้า fail
            saveGlobalSettings({
              [PARTY_IMAGE_POOL_KEY]: JSON.stringify(themePool),
            }).catch((migrateErr) => {
              if (import.meta.env.DEV) {
                console.warn('[CreateGame] Migrate party pool to global failed:', migrateErr)
              }
            })
            return
          }
        } catch (themeErr) {
          if (import.meta.env.DEV) {
            console.warn('[CreateGame] Read theme pool (legacy) failed:', themeErr)
          }
        }

        setPartyImagePool([])
      } catch (error) {
        if (import.meta.env.DEV) {
          console.error('[CreateGame] Failed to load party image pool:', error)
        }
        if (!cancelled) setPartyImagePool([])
      } finally {
        if (!cancelled) {
          setPartyImagePoolLoading(false)
        }
      }
    }

    loadPartyImagePool()
    return () => {
      cancelled = true
    }
  }, [themeName, type, parsePoolJson])

  const telegramConfigKeys = React.useMemo(() => {
    if (type === 'เกมลุ้นรางวัลพิเศษ') {
      return {
        imageKey: TRICK_TELEGRAM_IMAGE_KEY,
        messageKey: TRICK_TELEGRAM_MESSAGE_KEY,
      }
    }
    return {
      imageKey: PARTY_TELEGRAM_IMAGE_KEY,
      messageKey: PARTY_TELEGRAM_MESSAGE_KEY,
    }
  }, [type])

  React.useEffect(() => {
    if (!isTelegramConfigGame) {
      setTelegramConfigLoaded(true)
      return
    }

    let cancelled = false
    const loadTelegramPartyConfig = async () => {
      try {
        const response = await getThemeSettings(themeName)
        const settings = response?.settings || {}
        if (cancelled) return

        const savedTelegramImageUrl = String(
          settings[telegramConfigKeys.imageKey] ||
          (telegramConfigKeys.imageKey === PARTY_TELEGRAM_IMAGE_KEY ? settings[LEGACY_PARTY_TELEGRAM_IMAGE_KEY] : '') ||
          ''
        )
        setTelegramPartyImageUrl(savedTelegramImageUrl)
        setTelegramPartyImageFile(null)
        setTelegramPartyImagePreview(savedTelegramImageUrl)
        setTelegramPartyMessage(
          String(
            settings[telegramConfigKeys.messageKey] ||
            (telegramConfigKeys.messageKey === PARTY_TELEGRAM_MESSAGE_KEY ? settings[LEGACY_PARTY_TELEGRAM_MESSAGE_KEY] : '') ||
            '🎉 กิจกรรมใหม่: {gameName}\n\nเข้าร่วมกิจกรรมได้ที่ลิงก์นี้\n{playerLink}'
          )
        )
        setTelegramPartyCodeFullMessage(
          String(settings[PARTY_TELEGRAM_CODE_FULL_MESSAGE_KEY] || DEFAULT_PARTY_CODE_FULL_CLASSIC)
        )
        setTelegramPartyCodeFullRandomMessage(
          String(settings[PARTY_TELEGRAM_CODE_FULL_RANDOM_KEY] || DEFAULT_PARTY_CODE_FULL_RANDOM)
        )
      } catch (error) {
        if (import.meta.env.DEV) {
          console.error('[CreateGame] Failed to load telegram party config:', error)
        }
      } finally {
        if (!cancelled) {
          setTelegramConfigLoaded(true)
        }
      }
    }

    setTelegramConfigLoaded(false)
    loadTelegramPartyConfig()
    return () => {
      cancelled = true
    }
  }, [themeName, isTelegramConfigGame, telegramConfigKeys])

  React.useEffect(() => {
    return () => {
      if (telegramScheduleTimeoutRef.current !== null) {
        window.clearTimeout(telegramScheduleTimeoutRef.current)
      }
      Object.values(telegramRoundScheduleTimeoutRef.current).forEach((timerId) => {
        window.clearTimeout(timerId)
      })
    }
  }, [])

  const handleTelegramImageFileChange: React.ChangeEventHandler<HTMLInputElement> = (e) => {
    const file = e.target.files?.[0]
    if (!file) return

    if (!file.type.startsWith('image/')) {
      alert('กรุณาเลือกไฟล์รูปภาพเท่านั้น')
      e.target.value = ''
      return
    }

    if (telegramPartyImagePreview && telegramPartyImagePreview.startsWith('blob:')) {
      URL.revokeObjectURL(telegramPartyImagePreview)
    }

    setTelegramPartyImageFile(file)
    setTelegramPartyImagePreview(URL.createObjectURL(file))
  }

  const saveTelegramPartyConfig = async () => {
    try {
      setTelegramConfigSaving(true)
      let finalTelegramImageUrl = telegramPartyImageUrl.trim()

      if (telegramPartyImageFile) {
        // Use folder already allowed by current Firebase Storage rules.
        finalTelegramImageUrl = await uploadImageToStorage(telegramPartyImageFile, 'announce')
      }

      await saveThemeSettings(themeName, {
        [telegramConfigKeys.imageKey]: finalTelegramImageUrl,
        [telegramConfigKeys.messageKey]: telegramPartyMessage.trim(),
        ...(type === 'เกมปาร์ตี้' && {
          [PARTY_TELEGRAM_CODE_FULL_MESSAGE_KEY]: telegramPartyCodeFullMessage.trim(),
          [PARTY_TELEGRAM_CODE_FULL_RANDOM_KEY]: telegramPartyCodeFullRandomMessage.trim(),
        }),
      })
      setTelegramPartyImageUrl(finalTelegramImageUrl)
      setTelegramPartyImageFile(null)
      setTelegramPartyImagePreview(finalTelegramImageUrl)
      alert('บันทึกการตั้งค่า Telegram ของธีมนี้เรียบร้อยแล้ว')
    } catch (error) {
      console.error('[CreateGame] Failed to save telegram party config:', error)
      alert('บันทึกการตั้งค่า Telegram ไม่สำเร็จ')
    } finally {
      setTelegramConfigSaving(false)
    }
  }

  const getRoundCustomerLink = React.useCallback((roundNumber?: number) => {
    const baseLink = getPlayerLink(gameId)
    if (!roundNumber) return baseLink
    const suffix = `R${roundNumber}`
    const separator = baseLink.includes('?') ? '&' : '?'
    return `${baseLink}${separator}round=${encodeURIComponent(suffix)}`
  }, [gameId])

  const sendTelegramPartyActivity = async (allowFallbackShare: boolean, roundNumber?: number) => {
    if (!gameId) {
      showToast('กรุณาบันทึกเกมก่อนส่งกิจกรรม', 'error')
      return false
    }

    const playerLink = getRoundCustomerLink(roundNumber)
    const roundLabel = roundNumber ? `รอบที่ ${roundNumber}` : ''
    const message = [
      `🎉 กิจกรรม: ${name?.trim() || 'เกมปาร์ตี้'}${roundLabel ? ` (${roundLabel})` : ''}`,
      '',
      'เข้าร่วมกิจกรรมได้ที่ลิงก์นี้',
      playerLink,
    ].join('\n')

    try {
      const payload = {
        themeName,
        gameId,
        gameName: name?.trim() || 'เกมปาร์ตี้',
        playerLink,
        imageUrl: telegramPartyImageUrl.trim(),
        messageTemplate: telegramPartyMessage.trim(),
        roundNumber: roundNumber || null,
        roundLabel,
        useInlineButton: true,
        buttonText: roundNumber
          ? `🎮 เข้าร่วมกิจกรรม (รอบ ${roundNumber})`
          : '🎮 เข้าร่วมกิจกรรม',
      }

      let success = false
      let lastError = ''
      const endpoints = ['/api/telegram/send-party-link', '/.netlify/functions/send-telegram-party-link']

      for (const endpoint of endpoints) {
        try {
          const res = await fetch(endpoint, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify(payload),
          })

          if (res.ok) {
            success = true
            break
          }

          const errorText = await res.text()
          lastError = errorText || `HTTP ${res.status}`
        } catch (err: any) {
          lastError = err?.message || String(err)
        }
      }

      if (success) {
        return true
      }

      throw new Error(lastError || 'ไม่สามารถเรียก API ได้')
    } catch (err: any) {
      console.error('[CreateGame] Telegram API failed, fallback to share URL:', err)
      if (allowFallbackShare) {
        const shareUrl = `https://t.me/share/url?url=${encodeURIComponent(playerLink)}&text=${encodeURIComponent(message)}`
        window.open(shareUrl, '_blank', 'noopener,noreferrer')
        const isLocalhost = typeof window !== 'undefined' && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')
        const errMsg = String(err?.message || '')
        if (isLocalhost && (errMsg.includes('404') || errMsg.includes('Not Found') || errMsg.includes('<!doctype html'))) {
          showToast('ส่งอัตโนมัติไม่สำเร็จ: ให้ Deploy ขึ้น Netlify ก่อนใช้งานจริง', 'error')
        } else {
          showToast('ส่งอัตโนมัติไม่สำเร็จ เปิดหน้าแชร์ Telegram แทน', 'error')
        }
      } else {
        showToast('ส่งกิจกรรมตามเวลาที่กำหนดไม่สำเร็จ', 'error')
      }
      return false
    }
  }

  const openTelegramShareForParty = async () => {
    if (telegramSendMode === 'now') {
      const sent = await sendTelegramPartyActivity(true)
      if (sent) {
        showToast('ส่งกิจกรรมเข้า Telegram เรียบร้อยแล้ว', 'success')
      }
      return
    }

    if (!telegramScheduledAt) {
      showToast('กรุณาเลือกวันเวลาในการส่งกิจกรรม', 'error')
      return
    }

    const targetTime = new Date(telegramScheduledAt).getTime()
    if (!Number.isFinite(targetTime)) {
      showToast('วันเวลาที่เลือกไม่ถูกต้อง', 'error')
      return
    }

    if (targetTime <= Date.now()) {
      showToast('กรุณาเลือกเวลาในอนาคต', 'error')
      return
    }

    if (telegramScheduleTimeoutRef.current !== null) {
      window.clearTimeout(telegramScheduleTimeoutRef.current)
      telegramScheduleTimeoutRef.current = null
    }

    const delay = targetTime - Date.now()
    telegramScheduleTimeoutRef.current = window.setTimeout(async () => {
      telegramScheduleTimeoutRef.current = null
      setPendingTelegramScheduleAt(null)
      const sent = await sendTelegramPartyActivity(true)
      if (sent) {
        showToast('ส่งกิจกรรมเข้า Telegram ตามเวลาที่กำหนดเรียบร้อยแล้ว', 'success')
      }
    }, delay)

    setPendingTelegramScheduleAt(targetTime)
    showToast(`ตั้งเวลาส่งกิจกรรมเรียบร้อย (${new Date(targetTime).toLocaleString('th-TH')})`, 'success')
  }

  const sendTelegramByRound = async (roundNumber: number) => {
    const mode = telegramRoundSendModes[roundNumber] || 'now'
    if (mode === 'now') {
      const sent = await sendTelegramPartyActivity(true, roundNumber)
      if (sent) {
        setTelegramRoundSentStatus((prev) => ({ ...prev, [roundNumber]: 'sent' }))
        showToast(`ส่งกิจกรรมรอบที่ ${roundNumber} เข้า Telegram เรียบร้อยแล้ว`, 'success')
      }
      return
    }

    const scheduledAt = telegramRoundScheduledAt[roundNumber] || ''
    if (!scheduledAt) {
      showToast(`กรุณาเลือกวันเวลาในการส่งกิจกรรมของรอบที่ ${roundNumber}`, 'error')
      return
    }

    const targetTime = new Date(scheduledAt).getTime()
    if (!Number.isFinite(targetTime)) {
      showToast('วันเวลาที่เลือกไม่ถูกต้อง', 'error')
      return
    }
    if (targetTime <= Date.now()) {
      showToast('กรุณาเลือกเวลาในอนาคต', 'error')
      return
    }

    const existingTimeout = telegramRoundScheduleTimeoutRef.current[roundNumber]
    if (existingTimeout) {
      window.clearTimeout(existingTimeout)
    }

    const delay = targetTime - Date.now()
    const timeoutId = window.setTimeout(async () => {
      delete telegramRoundScheduleTimeoutRef.current[roundNumber]
      setPendingTelegramRoundScheduleAt((prev) => {
        const next = { ...prev }
        delete next[roundNumber]
        return next
      })
      const sent = await sendTelegramPartyActivity(true, roundNumber)
      if (sent) {
        setTelegramRoundSentStatus((prev) => ({ ...prev, [roundNumber]: 'sent' }))
        showToast(`ส่งกิจกรรมรอบที่ ${roundNumber} ตามเวลาที่กำหนดเรียบร้อยแล้ว`, 'success')
      }
    }, delay)
    telegramRoundScheduleTimeoutRef.current[roundNumber] = timeoutId
    setPendingTelegramRoundScheduleAt((prev) => ({ ...prev, [roundNumber]: targetTime }))
    setTelegramRoundSentStatus((prev) => ({ ...prev, [roundNumber]: 'scheduled' }))
    alert(`ตั้งเวลาส่งกิจกรรมรอบที่ ${roundNumber} เรียบร้อย (${new Date(targetTime).toLocaleString('th-TH')})`)
  }

  const cancelTelegramRoundSchedule = (roundNumber: number) => {
    const existingTimeout = telegramRoundScheduleTimeoutRef.current[roundNumber]
    if (existingTimeout) {
      window.clearTimeout(existingTimeout)
      delete telegramRoundScheduleTimeoutRef.current[roundNumber]
    }
    setPendingTelegramRoundScheduleAt((prev) => {
      const next = { ...prev }
      delete next[roundNumber]
      return next
    })
    setTelegramRoundSentStatus((prev) => {
      const next = { ...prev }
      delete next[roundNumber]
      return next
    })
  }

  // ===== submit =====
  const submit = async () => {
    // ป้องกันการคลิกซ้ำ
    if (isSaving) return
    
    // ✅ ตรวจสอบชื่อเกมอย่างเข้มงวด - ต้องมีชื่อและไม่เป็น whitespace เท่านั้น
    const trimmedName = (name || '').trim()
    if (!trimmedName || trimmedName.length === 0) { 
      setAnnounceToast({ msg: 'กรุณาระบุชื่อเกม', type: 'error' }); 
      return 
    }
    const hasPartyRoundImage = partyRounds.some((r) => !!(r.imageFile || r.imageDataUrl))
    if (type !== 'เกมปาร์ตี้' && needImage(type) && !imageDataUrl) { setAnnounceToast({ msg: 'ประเภทเกมนี้ต้องเลือกรูปภาพก่อน', type: 'error' }); return }
    if (type === 'เกมปาร์ตี้') {
      if (partyMode === 'random_pool') {
        // โหมด "สุ่มภาพรายผู้เล่น": ต้องมีรูปในคลังอย่างน้อย 1 รูป (ไม่ต้องตั้งรูปต่อรอบ)
        if (partyImagePool.length === 0) {
          setAnnounceToast({ msg: 'กรุณาอัปโหลดรูปภาพเข้าคลังอย่างน้อย 1 รูป', type: 'error' })
          return
        }
      } else if (!hasPartyRoundImage) {
        // โหมด "ภาพร่วมต่อรอบ": ต้องสุ่ม/เลือกรูปต่อรอบอย่างน้อย 1 รอบ
        setAnnounceToast({ msg: 'กรุณาสุ่มรูปภาพอย่างน้อย 1 รอบ', type: 'error' })
        return
      }
    }
    if (showPuzzle && type !== 'เกมปาร์ตี้' && !answer.trim()) {
      setAnnounceToast({ msg: 'กรุณากำหนดคำตอบที่ถูกต้อง', type: 'error' }); return
    }
    
    // ✅ ตรวจสอบบังคับกรอกโค้ดสำหรับเกมที่ต้องมีโค้ด
    if (showCodes) {
      const validCodes = codes.map((c) => c.trim()).filter(Boolean)
      if (validCodes.length === 0) {
        setAnnounceToast({ msg: 'กรุณากรอกโค้ดรางวัลอย่างน้อย 1 โค้ด', type: 'error' })
        return
      }
      if (type === 'เกมปาร์ตี้') {
        const totalRequestedCodes = partyRounds.reduce((sum, round) => sum + Math.max(1, Number(round.codeCount) || 1), 0)
        if (totalRequestedCodes > validCodes.length) {
          setAnnounceToast({ msg: `จำนวน CODE รวม (${totalRequestedCodes}) มากกว่าที่อัปโหลด (${validCodes.length})`, type: 'error' })
          return
        }
        // โหมด "ภาพร่วมต่อรอบ" ต้องระบุคำตอบทุกรอบ; โหมด "สุ่มภาพรายผู้เล่น" คำตอบมาจากชื่อไฟล์ ไม่ต้องตรวจ
        if (partyMode === 'classic') {
          const hasEmptyAnswer = partyRounds.some((round) => !String(round.answer || '').trim())
          if (hasEmptyAnswer) {
            setAnnounceToast({ msg: 'กรุณากำหนดคำตอบให้ครบทุกรอบ', type: 'error' })
            return
          }
        }
      }
    }
    
    // ตรวจสอบเงื่อนไขสำหรับ ACTIVE USER
    if (userAccessType === 'selected' && (!selectedUsers || selectedUsers.length === 0)) {
      setAnnounceToast({ msg: 'กรุณาอัพโหลดรายชื่อ USER เมื่อเลือก ACTIVE USER', type: 'error' }); return
    }
    
    setIsSaving(true)

    // ✅ อัปโหลดรูปภาพก่อนบันทึกเกม (ถ้ามีไฟล์ใหม่)
    let finalImageDataUrl = imageDataUrl // ใช้ URL เดิม (ถ้าเป็น CDN URL หรือ data URL จาก edit)
    let finalCheckinImageDataUrl = checkinImageDataUrl
    let finalAnnounceImageDataUrl = announceImageDataUrl
    let finalReferralImageDataUrl = referralImageDataUrl
    // ✅ รูปภาพการ์ด 3 แบบ (แยกจากข้อมูลเกม - ไม่ลบเมื่อลบเกม)
    let finalCardImage1 = cardImage1
    let finalCardImage2 = cardImage2
    let finalCardImage3 = cardImage3
    // ✅ สำหรับเกมประกาศรางวัล: ประกาศตัวแปรไว้ที่นี่เพื่อให้ใช้ได้ใน scope ทั้งหมด
    let finalUsers: string[] = []
    let finalUserBonuses: Array<{ user: string; bonus: number }> = []
    
    // อัปโหลดรูปภาพหลัก (games)
    if (imageFile) {
      setImageUploading(true)
      try {
        const cdnUrl = await uploadImageToStorage(imageFile, 'games')
        finalImageDataUrl = cdnUrl
        
        // ✅ ลบรูปภาพเก่าออกจาก Firebase Storage (ถ้ามีและไม่ใช่รูปเดิม)
        if (isEdit && originalImageUrl && originalImageUrl !== cdnUrl) {
          try {
            const deleted = await deleteImageFromStorage(originalImageUrl)
            if (deleted) {
              console.log('[CreateGame] ✅ Deleted old image from storage:', originalImageUrl.substring(0, 100))
            } else {
              console.warn('[CreateGame] ⚠️ Failed to delete old image:', originalImageUrl.substring(0, 100))
            }
          } catch (deleteError) {
            // ไม่ throw error เพื่อไม่ให้การบันทึกเกมล้มเหลว
            console.error('[CreateGame] Error deleting old image:', deleteError)
          }
        }
        
        // ✅ Cleanup preview URL (ถ้าเป็น object URL)
        if (imageDataUrl.startsWith('blob:')) {
          URL.revokeObjectURL(imageDataUrl)
        }
        
        setImageDataUrl(cdnUrl)
        setImageFile(null)
        // ✅ อัปเดต originalImageUrl เป็น URL ใหม่
        setOriginalImageUrl(cdnUrl)
      } catch (error) {
        console.error('Error uploading image:', error)
        setIsSaving(false)
        setImageUploading(false)
        alert(`เกิดข้อผิดพลาดในการอัปโหลดรูปภาพ: ${error instanceof Error ? error.message : 'Unknown error'}`)
        return
      } finally {
        setImageUploading(false)
      }
    } else if (imageDataUrl && (imageDataUrl.startsWith('blob:') || imageDataUrl.startsWith('data:'))) {
      // ✅ ถ้าไม่มีไฟล์ใหม่ แต่ imageDataUrl เป็น blob หรือ data URL แสดงว่ายังไม่ได้อัปโหลด
      // ✅ ต้องอัปโหลดจาก data URL หรือ blob URL
      console.warn('[CreateGame] Image is still a blob/data URL, attempting to upload...')
      setImageUploading(true)
      try {
        let fileToUpload: File | null = null
        
        if (imageDataUrl.startsWith('blob:')) {
          // Convert blob URL to File
          const response = await fetch(imageDataUrl)
          const blob = await response.blob()
          fileToUpload = new File([blob], fileName || 'image.jpg', { type: blob.type || 'image/jpeg' })
        } else if (imageDataUrl.startsWith('data:')) {
          // Convert data URL to File
          const response = await fetch(imageDataUrl)
          const blob = await response.blob()
          fileToUpload = new File([blob], fileName || 'image.jpg', { type: blob.type || 'image/jpeg' })
        }
        
        if (fileToUpload) {
          const cdnUrl = await uploadImageToStorage(fileToUpload, 'card-images')
          finalImageDataUrl = cdnUrl
          
          // ✅ ลบรูปภาพเก่าออกจาก Firebase Storage (ถ้ามีและไม่ใช่รูปเดิม)
          if (isEdit && originalImageUrl && originalImageUrl !== cdnUrl) {
            try {
              const deleted = await deleteImageFromStorage(originalImageUrl)
              if (deleted) {
                console.log('[CreateGame] ✅ Deleted old image from storage:', originalImageUrl.substring(0, 100))
              } else {
                console.warn('[CreateGame] ⚠️ Failed to delete old image:', originalImageUrl.substring(0, 100))
              }
            } catch (deleteError) {
              // ไม่ throw error เพื่อไม่ให้การบันทึกเกมล้มเหลว
              console.error('[CreateGame] Error deleting old image:', deleteError)
            }
          }
          
          // ✅ Cleanup preview URL
          if (imageDataUrl.startsWith('blob:')) {
            URL.revokeObjectURL(imageDataUrl)
          }
          
          setImageDataUrl(cdnUrl)
          // ✅ อัปเดต originalImageUrl เป็น URL ใหม่
          setOriginalImageUrl(cdnUrl)
        } else {
          console.error('[CreateGame] Could not convert image URL to File')
          alert('เกิดข้อผิดพลาด: ไม่สามารถแปลงรูปภาพเป็นไฟล์ได้')
          setIsSaving(false)
          setImageUploading(false)
          return
        }
      } catch (error) {
        console.error('Error uploading image from blob/data URL:', error)
        setIsSaving(false)
        setImageUploading(false)
        alert(`เกิดข้อผิดพลาดในการอัปโหลดรูปภาพ: ${error instanceof Error ? error.message : 'Unknown error'}`)
        return
      } finally {
        setImageUploading(false)
      }
    }
    
    // อัปโหลดรูปภาพ checkin
    if (checkinImageFile) {
      setCheckinImageUploading(true)
      try {
        const cdnUrl = await uploadImageToStorage(checkinImageFile, 'checkin')
        finalCheckinImageDataUrl = cdnUrl
        
        // ✅ ลบรูปภาพเก่าออกจาก Firebase Storage (ถ้ามีและไม่ใช่รูปเดิม)
        if (isEdit && originalCheckinImageUrl && originalCheckinImageUrl !== cdnUrl) {
          try {
            const deleted = await deleteImageFromStorage(originalCheckinImageUrl)
            if (deleted) {
              console.log('[CreateGame] ✅ Deleted old checkin image from storage:', originalCheckinImageUrl.substring(0, 100))
            } else {
              console.warn('[CreateGame] ⚠️ Failed to delete old checkin image:', originalCheckinImageUrl.substring(0, 100))
            }
          } catch (deleteError) {
            // ไม่ throw error เพื่อไม่ให้การบันทึกเกมล้มเหลว
            console.error('[CreateGame] Error deleting old checkin image:', deleteError)
          }
        }
        
        if (checkinImageDataUrl.startsWith('blob:')) {
          URL.revokeObjectURL(checkinImageDataUrl)
        }
        
        setCheckinImageDataUrl(cdnUrl)
        setCheckinImageFile(null)
        // ✅ อัปเดต originalCheckinImageUrl เป็น URL ใหม่
        setOriginalCheckinImageUrl(cdnUrl)
      } catch (error) {
        console.error('Error uploading checkin image:', error)
        setIsSaving(false)
        setCheckinImageUploading(false)
        alert(`เกิดข้อผิดพลาดในการอัปโหลดรูปภาพเช็คอิน: ${error instanceof Error ? error.message : 'Unknown error'}`)
        return
      } finally {
        setCheckinImageUploading(false)
      }
    } else if (checkinImageDataUrl && (checkinImageDataUrl.startsWith('blob:') || checkinImageDataUrl.startsWith('data:'))) {
      // ✅ ถ้าไม่มีไฟล์ใหม่ แต่ checkinImageDataUrl เป็น blob หรือ data URL แสดงว่ายังไม่ได้อัปโหลด
      // ✅ ต้องอัปโหลดจาก data URL หรือ blob URL
      console.warn('[CreateGame] Checkin image is still a blob/data URL, attempting to upload...')
      setCheckinImageUploading(true)
      try {
        let fileToUpload: File | null = null
        
        if (checkinImageDataUrl.startsWith('blob:')) {
          // Convert blob URL to File
          const response = await fetch(checkinImageDataUrl)
          const blob = await response.blob()
          fileToUpload = new File([blob], checkinFileName || 'checkin-image.jpg', { type: blob.type || 'image/jpeg' })
        } else if (checkinImageDataUrl.startsWith('data:')) {
          // Convert data URL to File
          const response = await fetch(checkinImageDataUrl)
          const blob = await response.blob()
          fileToUpload = new File([blob], checkinFileName || 'checkin-image.jpg', { type: blob.type || 'image/jpeg' })
        }
        
        if (fileToUpload) {
          const cdnUrl = await uploadImageToStorage(fileToUpload, 'checkin')
          finalCheckinImageDataUrl = cdnUrl
          
          // ✅ ลบรูปภาพเก่าออกจาก Firebase Storage (ถ้ามีและไม่ใช่รูปเดิม)
          if (isEdit && originalCheckinImageUrl && originalCheckinImageUrl !== cdnUrl) {
            try {
              const deleted = await deleteImageFromStorage(originalCheckinImageUrl)
              if (deleted) {
                console.log('[CreateGame] ✅ Deleted old checkin image from storage:', originalCheckinImageUrl.substring(0, 100))
              } else {
                console.warn('[CreateGame] ⚠️ Failed to delete old checkin image:', originalCheckinImageUrl.substring(0, 100))
              }
            } catch (deleteError) {
              // ไม่ throw error เพื่อไม่ให้การบันทึกเกมล้มเหลว
              console.error('[CreateGame] Error deleting old checkin image:', deleteError)
            }
          }
          
          // ✅ Cleanup preview URL
          if (checkinImageDataUrl.startsWith('blob:')) {
            URL.revokeObjectURL(checkinImageDataUrl)
          }
          
          setCheckinImageDataUrl(cdnUrl)
          // ✅ อัปเดต originalCheckinImageUrl เป็น URL ใหม่
          setOriginalCheckinImageUrl(cdnUrl)
        } else {
          console.error('[CreateGame] Could not convert checkin image URL to File')
          alert('เกิดข้อผิดพลาด: ไม่สามารถแปลงรูปภาพเช็คอินเป็นไฟล์ได้')
          setIsSaving(false)
          setCheckinImageUploading(false)
          return
        }
      } catch (error) {
        console.error('Error uploading checkin image from blob/data URL:', error)
        setIsSaving(false)
        setCheckinImageUploading(false)
        alert(`เกิดข้อผิดพลาดในการอัปโหลดรูปภาพเช็คอิน: ${error instanceof Error ? error.message : 'Unknown error'}`)
        return
      } finally {
        setCheckinImageUploading(false)
      }
    }
    
    // อัปโหลดรูปภาพ announce
    if (announceImageFile) {
      setAnnounceImageUploading(true)
      try {
        const cdnUrl = await uploadImageToStorage(announceImageFile, 'announce')
        finalAnnounceImageDataUrl = cdnUrl
        
        // ✅ ลบรูปภาพเก่าออกจาก Firebase Storage (ถ้ามีและไม่ใช่รูปเดิม)
        if (isEdit && originalAnnounceImageUrl && originalAnnounceImageUrl !== cdnUrl) {
          try {
            const deleted = await deleteImageFromStorage(originalAnnounceImageUrl)
            if (deleted) {
              console.log('[CreateGame] ✅ Deleted old announce image from storage:', originalAnnounceImageUrl.substring(0, 100))
            } else {
              console.warn('[CreateGame] ⚠️ Failed to delete old announce image:', originalAnnounceImageUrl.substring(0, 100))
            }
          } catch (deleteError) {
            // ไม่ throw error เพื่อไม่ให้การบันทึกเกมล้มเหลว
            console.error('[CreateGame] Error deleting old announce image:', deleteError)
          }
        }
        
        if (announceImageDataUrl.startsWith('blob:')) {
          URL.revokeObjectURL(announceImageDataUrl)
        }
        
        setAnnounceImageDataUrl(cdnUrl)
        setAnnounceImageFile(null)
        // ✅ อัปเดต originalAnnounceImageUrl เป็น URL ใหม่
        setOriginalAnnounceImageUrl(cdnUrl)
      } catch (error) {
        console.error('Error uploading announce image:', error)
        setIsSaving(false)
        setAnnounceImageUploading(false)
        setAnnounceToast({ msg: 'เกิดข้อผิดพลาดในการอัปโหลดรูปภาพประกาศ', type: 'error' })
        return
      } finally {
        setAnnounceImageUploading(false)
      }
    } else if (announceImageDataUrl && (announceImageDataUrl.startsWith('blob:') || announceImageDataUrl.startsWith('data:'))) {
      // ✅ ถ้าไม่มีไฟล์ใหม่ แต่ announceImageDataUrl เป็น blob หรือ data URL แสดงว่ายังไม่ได้อัปโหลด
      // ✅ ต้องอัปโหลดจาก data URL หรือ blob URL
      console.warn('[CreateGame] Announce image is still a blob/data URL, attempting to upload...')
      setAnnounceImageUploading(true)
      try {
        let fileToUpload: File | null = null
        
        if (announceImageDataUrl.startsWith('blob:')) {
          // Convert blob URL to File
          const response = await fetch(announceImageDataUrl)
          const blob = await response.blob()
          fileToUpload = new File([blob], announceFileName || 'announce-image.jpg', { type: blob.type || 'image/jpeg' })
        } else if (announceImageDataUrl.startsWith('data:')) {
          // Convert data URL to File
          const response = await fetch(announceImageDataUrl)
          const blob = await response.blob()
          fileToUpload = new File([blob], announceFileName || 'announce-image.jpg', { type: blob.type || 'image/jpeg' })
        }
        
        if (fileToUpload) {
          const cdnUrl = await uploadImageToStorage(fileToUpload, 'announce')
          finalAnnounceImageDataUrl = cdnUrl
          
          // ✅ ลบรูปภาพเก่าออกจาก Firebase Storage (ถ้ามีและไม่ใช่รูปเดิม)
          if (isEdit && originalAnnounceImageUrl && originalAnnounceImageUrl !== cdnUrl) {
            try {
              const deleted = await deleteImageFromStorage(originalAnnounceImageUrl)
              if (deleted) {
                console.log('[CreateGame] ✅ Deleted old announce image from storage:', originalAnnounceImageUrl.substring(0, 100))
              } else {
                console.warn('[CreateGame] ⚠️ Failed to delete old announce image:', originalAnnounceImageUrl.substring(0, 100))
              }
            } catch (deleteError) {
              // ไม่ throw error เพื่อไม่ให้การบันทึกเกมล้มเหลว
              console.error('[CreateGame] Error deleting old announce image:', deleteError)
            }
          }
          
          // ✅ Cleanup preview URL
          if (announceImageDataUrl.startsWith('blob:')) {
            URL.revokeObjectURL(announceImageDataUrl)
          }
          
          setAnnounceImageDataUrl(cdnUrl)
          // ✅ อัปเดต originalAnnounceImageUrl เป็น URL ใหม่
          setOriginalAnnounceImageUrl(cdnUrl)
        } else {
          console.error('[CreateGame] Could not convert announce image URL to File')
          setAnnounceToast({ msg: 'ไม่สามารถแปลงรูปภาพประกาศเป็นไฟล์ได้', type: 'error' })
          setIsSaving(false)
          setAnnounceImageUploading(false)
          return
        }
      } catch (error) {
        console.error('Error uploading announce image from blob/data URL:', error)
        setIsSaving(false)
        setAnnounceImageUploading(false)
        setAnnounceToast({ msg: 'เกิดข้อผิดพลาดในการอัปโหลดรูปภาพประกาศ', type: 'error' })
        return
      } finally {
        setAnnounceImageUploading(false)
      }
    }

    // ✅ อัปโหลดรูปภาพแจ้งเตือนเกมบอลโลก (แสดงเมื่อเข้าเกม)
    let finalWorldCupNoticeImageUrl = worldCupNoticeImageDataUrl
    if (worldCupNoticeImageFile) {
      setWorldCupNoticeImageUploading(true)
      try {
        const cdnUrl = await uploadImageToStorage(worldCupNoticeImageFile, 'games')
        finalWorldCupNoticeImageUrl = cdnUrl
        if (isEdit && originalWorldCupNoticeImageUrl && originalWorldCupNoticeImageUrl !== cdnUrl) {
          try { await deleteImageFromStorage(originalWorldCupNoticeImageUrl) } catch { /* non-fatal */ }
        }
        if (worldCupNoticeImageDataUrl.startsWith('blob:')) URL.revokeObjectURL(worldCupNoticeImageDataUrl)
        setWorldCupNoticeImageDataUrl(cdnUrl)
        setWorldCupNoticeImageFile(null)
        setOriginalWorldCupNoticeImageUrl(cdnUrl)
      } catch (error) {
        console.error('Error uploading world cup notice image:', error)
        setIsSaving(false)
        setWorldCupNoticeImageUploading(false)
        alert(`อัปโหลดรูปแจ้งเตือนไม่สำเร็จ: ${error instanceof Error ? error.message : 'Unknown error'}`)
        return
      } finally {
        setWorldCupNoticeImageUploading(false)
      }
    } else if (worldCupNoticeImageDataUrl && (worldCupNoticeImageDataUrl.startsWith('blob:') || worldCupNoticeImageDataUrl.startsWith('data:'))) {
      setWorldCupNoticeImageUploading(true)
      try {
        const response = await fetch(worldCupNoticeImageDataUrl)
        const blob = await response.blob()
        const fileToUpload = new File([blob], worldCupNoticeImageFileName || 'worldcup-notice.jpg', { type: blob.type || 'image/jpeg' })
        const cdnUrl = await uploadImageToStorage(fileToUpload, 'games')
        finalWorldCupNoticeImageUrl = cdnUrl
        if (isEdit && originalWorldCupNoticeImageUrl && originalWorldCupNoticeImageUrl !== cdnUrl) {
          try { await deleteImageFromStorage(originalWorldCupNoticeImageUrl) } catch { /* non-fatal */ }
        }
        if (worldCupNoticeImageDataUrl.startsWith('blob:')) URL.revokeObjectURL(worldCupNoticeImageDataUrl)
        setWorldCupNoticeImageDataUrl(cdnUrl)
        setOriginalWorldCupNoticeImageUrl(cdnUrl)
      } catch (error) {
        console.error('Error uploading world cup notice image from blob/data URL:', error)
        setIsSaving(false)
        setWorldCupNoticeImageUploading(false)
        alert(`อัปโหลดรูปแจ้งเตือนไม่สำเร็จ: ${error instanceof Error ? error.message : 'Unknown error'}`)
        return
      } finally {
        setWorldCupNoticeImageUploading(false)
      }
    }

    // อัปโหลดรูปภาพ referral
    if (referralImageFile) {
      setReferralImageUploading(true)
      try {
        const cdnUrl = await uploadImageToStorage(referralImageFile, 'games')
        finalReferralImageDataUrl = cdnUrl
        if (isEdit && originalReferralImageUrl && originalReferralImageUrl !== cdnUrl) {
          try { await deleteImageFromStorage(originalReferralImageUrl) } catch {}
        }
        if (referralImageDataUrl.startsWith('blob:')) URL.revokeObjectURL(referralImageDataUrl)
        setReferralImageDataUrl(cdnUrl)
        setReferralImageFile(null)
        setOriginalReferralImageUrl(cdnUrl)
      } catch (error) {
        console.error('Error uploading referral image:', error)
        setIsSaving(false)
        setReferralImageUploading(false)
        alert(`เกิดข้อผิดพลาดในการอัปโหลดรูปภาพ: ${error instanceof Error ? error.message : 'Unknown error'}`)
        return
      } finally {
        setReferralImageUploading(false)
      }
    } else if (referralImageDataUrl && (referralImageDataUrl.startsWith('blob:') || referralImageDataUrl.startsWith('data:'))) {
      setReferralImageUploading(true)
      try {
        const response = await fetch(referralImageDataUrl)
        const blob = await response.blob()
        const fileToUpload = new File([blob], referralImageFileName || 'referral-image.jpg', { type: blob.type || 'image/jpeg' })
        const cdnUrl = await uploadImageToStorage(fileToUpload, 'games')
        finalReferralImageDataUrl = cdnUrl
        if (isEdit && originalReferralImageUrl && originalReferralImageUrl !== cdnUrl) {
          try { await deleteImageFromStorage(originalReferralImageUrl) } catch {}
        }
        if (referralImageDataUrl.startsWith('blob:')) URL.revokeObjectURL(referralImageDataUrl)
        setReferralImageDataUrl(cdnUrl)
        setOriginalReferralImageUrl(cdnUrl)
      } catch (error) {
        console.error('Error uploading referral image from blob/data URL:', error)
        setIsSaving(false)
        setReferralImageUploading(false)
        alert(`เกิดข้อผิดพลาดในการอัปโหลดรูปภาพ: ${error instanceof Error ? error.message : 'Unknown error'}`)
        return
      } finally {
        setReferralImageUploading(false)
      }
    }

    // ✅ อัปโหลดรูปภาพการ์ด 3 แบบสำหรับเกมลุ้นรางวัลพิเศษ (แยกจากข้อมูลเกม - ไม่ลบเมื่อลบเกม)
    if (type === 'เกมลุ้นรางวัลพิเศษ') {
      // อัปโหลดการ์ด 1 (การ์ดปก)
      if (cardImage1File) {
        setCardImage1Uploading(true)
        try {
          const cdnUrl = await uploadImageToStorage(cardImage1File, 'card-images')
          finalCardImage1 = cdnUrl
          if (cardImage1.startsWith('blob:')) {
            URL.revokeObjectURL(cardImage1)
          }
          setCardImage1(cdnUrl)
          setCardImage1File(null)
          setOriginalCardImage1Url(cdnUrl)
        } catch (error) {
          console.error('Error uploading card image 1:', error)
          setIsSaving(false)
          setCardImage1Uploading(false)
          alert(`เกิดข้อผิดพลาดในการอัปโหลดรูปภาพการ์ด 1: ${error instanceof Error ? error.message : 'Unknown error'}`)
          return
        } finally {
          setCardImage1Uploading(false)
        }
      } else if (cardImage1 && (cardImage1.startsWith('blob:') || cardImage1.startsWith('data:'))) {
        setCardImage1Uploading(true)
        try {
          const response = await fetch(cardImage1)
          const blob = await response.blob()
          const fileToUpload = new File([blob], 'card1.jpg', { type: blob.type || 'image/jpeg' })
          const cdnUrl = await uploadImageToStorage(fileToUpload, 'card-images')
          finalCardImage1 = cdnUrl
          if (cardImage1.startsWith('blob:')) {
            URL.revokeObjectURL(cardImage1)
          }
          setCardImage1(cdnUrl)
          setOriginalCardImage1Url(cdnUrl)
        } catch (error) {
          console.error('Error uploading card image 1 from blob/data URL:', error)
          setIsSaving(false)
          setCardImage1Uploading(false)
          alert(`เกิดข้อผิดพลาดในการอัปโหลดรูปภาพการ์ด 1: ${error instanceof Error ? error.message : 'Unknown error'}`)
          return
        } finally {
          setCardImage1Uploading(false)
        }
      }

      // อัปโหลดการ์ด 2 (การ์ดชนะ)
      if (cardImage2File) {
        setCardImage2Uploading(true)
        try {
          const cdnUrl = await uploadImageToStorage(cardImage2File, 'card-images')
          finalCardImage2 = cdnUrl
          if (cardImage2.startsWith('blob:')) {
            URL.revokeObjectURL(cardImage2)
          }
          setCardImage2(cdnUrl)
          setCardImage2File(null)
          setOriginalCardImage2Url(cdnUrl)
        } catch (error) {
          console.error('Error uploading card image 2:', error)
          setIsSaving(false)
          setCardImage2Uploading(false)
          alert(`เกิดข้อผิดพลาดในการอัปโหลดรูปภาพการ์ด 2: ${error instanceof Error ? error.message : 'Unknown error'}`)
          return
        } finally {
          setCardImage2Uploading(false)
        }
      } else if (cardImage2 && (cardImage2.startsWith('blob:') || cardImage2.startsWith('data:'))) {
        setCardImage2Uploading(true)
        try {
          const response = await fetch(cardImage2)
          const blob = await response.blob()
          const fileToUpload = new File([blob], 'card2.jpg', { type: blob.type || 'image/jpeg' })
          const cdnUrl = await uploadImageToStorage(fileToUpload, 'card-images')
          finalCardImage2 = cdnUrl
          if (cardImage2.startsWith('blob:')) {
            URL.revokeObjectURL(cardImage2)
          }
          setCardImage2(cdnUrl)
          setOriginalCardImage2Url(cdnUrl)
        } catch (error) {
          console.error('Error uploading card image 2 from blob/data URL:', error)
          setIsSaving(false)
          setCardImage2Uploading(false)
          alert(`เกิดข้อผิดพลาดในการอัปโหลดรูปภาพการ์ด 2: ${error instanceof Error ? error.message : 'Unknown error'}`)
          return
        } finally {
          setCardImage2Uploading(false)
        }
      }

      // อัปโหลดการ์ด 3 (การ์ดแพ้)
      if (cardImage3File) {
        setCardImage3Uploading(true)
        try {
          const cdnUrl = await uploadImageToStorage(cardImage3File, 'card-images')
          finalCardImage3 = cdnUrl
          if (cardImage3.startsWith('blob:')) {
            URL.revokeObjectURL(cardImage3)
          }
          setCardImage3(cdnUrl)
          setCardImage3File(null)
          setOriginalCardImage3Url(cdnUrl)
        } catch (error) {
          console.error('Error uploading card image 3:', error)
          setIsSaving(false)
          setCardImage3Uploading(false)
          alert(`เกิดข้อผิดพลาดในการอัปโหลดรูปภาพการ์ด 3: ${error instanceof Error ? error.message : 'Unknown error'}`)
          return
        } finally {
          setCardImage3Uploading(false)
        }
      } else if (cardImage3 && (cardImage3.startsWith('blob:') || cardImage3.startsWith('data:'))) {
        setCardImage3Uploading(true)
        try {
          const response = await fetch(cardImage3)
          const blob = await response.blob()
          const fileToUpload = new File([blob], 'card3.jpg', { type: blob.type || 'image/jpeg' })
          const cdnUrl = await uploadImageToStorage(fileToUpload, 'card-images')
          finalCardImage3 = cdnUrl
          if (cardImage3.startsWith('blob:')) {
            URL.revokeObjectURL(cardImage3)
          }
          setCardImage3(cdnUrl)
          setOriginalCardImage3Url(cdnUrl)
        } catch (error) {
          console.error('Error uploading card image 3 from blob/data URL:', error)
          setIsSaving(false)
          setCardImage3Uploading(false)
          alert(`เกิดข้อผิดพลาดในการอัปโหลดรูปภาพการ์ด 3: ${error instanceof Error ? error.message : 'Unknown error'}`)
          return
        } finally {
          setCardImage3Uploading(false)
        }
      }
    }

    const saveUnlocked = true

    // ✅ ประกาศ couponItemCodes ไว้ข้างนอกเพื่อให้ใช้ได้ใน scope ที่ต้องการ
    let couponItemCodes: string[][] = []

    // payload พื้นฐาน
    const base: any = {
      type,
      name: trimmedName, // ใช้ trimmedName ที่ตรวจสอบแล้ว
      userAccessType,
      partyRounds: null,
    }
    
    // จัดการ selectedUsers ตาม userAccessType
    if (userAccessType === 'selected' && selectedUsers && selectedUsers.length > 0) {
      base.selectedUsers = selectedUsers
    } else {
      // เคลียร์ selectedUsers เมื่อเปลี่ยนเป็น 'all'
      base.selectedUsers = null
    }

    if (showPuzzle) {
      if (type === 'เกมปาร์ตี้') {
        // ✅ บันทึกโหมดเกมปาร์ตี้
        base.partyMode = partyMode

        if (partyMode === 'random_pool') {
          // ===== ระบบใหม่: สุ่มรูปจากคลังให้ผู้เล่นแต่ละคน =====
          if (partyImagePool.length === 0) {
            alert('โหมด "สุ่มรูปจากคลัง" ต้องมีรูปในคลังอย่างน้อย 1 รูป กรุณาอัปโหลดรูปก่อน')
            setIsSaving(false)
            return
          }

          // ✅ สแน็ปช็อตคลังรูปเข้า game (frozen) เพื่อกันคลังเปลี่ยนแล้วกระทบเกมที่สร้างไปแล้ว
          const poolSnapshot = partyImagePool.map((p) => ({
            url: convertToCDNUrl(p.url),
            name: p.name,
          }))
          base.partyImagePool = poolSnapshot

          let rangeCursor = 1
          base.partyRounds = partyRounds.map((round, idx) => {
            const start = rangeCursor
            const codeCount = Math.max(1, Number(round?.codeCount) || 1)
            const end = Math.max(start - 1, start + codeCount - 1)
            rangeCursor = end + 1
            return {
              round: idx + 1,
              answer: '',
              codeCount,
              codeStartIndex: start,
              codeEndIndex: end,
              imageDataUrl: '',
              fileName: '',
            }
          })
          // โหมดใหม่: puzzle ไม่ใช้รูปต่อรอบ — ปล่อยว่างไว้ (player จะคำนวณเองจากคลัง)
          base.puzzle = { imageDataUrl: '', answer: '' }
        } else {
          // ===== ระบบเดิม: รูป+คำตอบ ตั้งต่อรอบ =====
          const savedPartyRounds: PartyRoundConfig[] = []
          for (let i = 0; i < partyRounds.length; i++) {
            const round = partyRounds[i]
            let roundImageUrl = String(round?.imageDataUrl || '').trim()
            if (round?.imageFile) {
              roundImageUrl = await uploadImageToStorage(round.imageFile, 'games')
            }
            savedPartyRounds.push({
              round: i + 1,
              answer: String(round?.answer || '').trim(),
              codeCount: Math.max(1, Number(round?.codeCount) || 1),
              imageDataUrl: roundImageUrl ? convertToCDNUrl(roundImageUrl) : '',
              fileName: String(round?.fileName || ''),
              imageFile: null,
            })
          }

          const firstRound = savedPartyRounds[0] || createEmptyPartyRound(1)
          let rangeCursor = 1
          base.partyRounds = savedPartyRounds.map((r) => ({
            ...(() => {
              const start = rangeCursor
              const end = Math.max(start - 1, start + Math.max(1, Number(r.codeCount) || 1) - 1)
              rangeCursor = end + 1
              return {
                round: r.round,
                answer: r.answer,
                codeCount: r.codeCount,
                codeStartIndex: start,
                codeEndIndex: end,
                imageDataUrl: r.imageDataUrl,
                fileName: r.fileName,
              }
            })(),
          }))
          base.puzzle = {
            imageDataUrl: firstRound.imageDataUrl ? convertToCDNUrl(firstRound.imageDataUrl) : '',
            answer: String(firstRound.answer || '').trim(),
          }
          // เคลียร์ field ของโหมดใหม่ (เผื่อเคยตั้งเป็น random_pool)
          base.partyImagePool = null
        }
      } else {
        // ✅ Debug: Log image URL before saving
        console.log('[CreateGame] Saving puzzle game:', {
          gameId: isEdit ? gameId : 'new',
          hasImage: !!finalImageDataUrl,
          imageUrl: finalImageDataUrl ? finalImageDataUrl.substring(0, 100) : '',
          isBlob: finalImageDataUrl?.startsWith('blob:'),
          isData: finalImageDataUrl?.startsWith('data:'),
          isCDN: finalImageDataUrl?.includes('firebasestorage.googleapis.com') || finalImageDataUrl?.includes('cdn.')
        })
        
        if (!finalImageDataUrl || finalImageDataUrl.trim() === '') {
          console.error('[CreateGame] ERROR: finalImageDataUrl is empty!')
          alert('เกิดข้อผิดพลาด: ไม่พบ URL รูปภาพ กรุณาอัปโหลดรูปภาพใหม่')
          setIsSaving(false)
          return
        }
        
        base.puzzle = { imageDataUrl: finalImageDataUrl ? convertToCDNUrl(finalImageDataUrl) : '', answer: answer.trim() }
        base.partyRounds = null
      }
      const newCodes = codes.map((c) => c.trim()).filter(Boolean)
      base.codes = newCodes
      
      // ✅ ตรวจสอบว่าโค้ดเปลี่ยนไปหรือไม่
      const oldCodes = originalCodesRef.current
      const codesChanged = JSON.stringify(oldCodes) !== JSON.stringify(newCodes)
      
      // ✅ ถ้าโค้ดเปลี่ยนไป ให้ reset cursor และ codesVersion
      if (codesChanged || !isEdit) {
        base.codeCursor = 0
        base.claimedBy = null
        base.codesVersion = Date.now()
      }
      // ✅ ถ้าโค้ดไม่เปลี่ยน ไม่ต้อง reset cursor และ codesVersion (จะใช้ค่าที่มีอยู่)
      
      base.numberPick = null
      base.football   = null
      base.worldCup   = null
      base.slot       = null
      base.checkin    = base.checkin || {}
    }

    if (type === 'เกมลอยกระทง') {
      const newCodes = codes.map((c) => c.trim()).filter(Boolean)
      const newBigPrizeCodes = bigPrizeCodes.map((c) => c.trim()).filter(Boolean)
      
      // ✅ ตรวจสอบว่าโค้ดเปลี่ยนไปหรือไม่
      const oldCodes = originalLoyKrathongCodesRef.current
      const oldBigPrizeCodes = originalLoyKrathongBigPrizeCodesRef.current
      const codesChanged = JSON.stringify(oldCodes) !== JSON.stringify(newCodes)
      const bigPrizeCodesChanged = JSON.stringify(oldBigPrizeCodes) !== JSON.stringify(newBigPrizeCodes)
      
      base.loyKrathong = { 
        imageDataUrl: '', 
        endAt: endAt ? new Date(endAt).getTime() : null,
        codes: newCodes,
        codeCursor: (codesChanged || !isEdit) ? 0 : undefined, // ✅ ถ้าโค้ดไม่เปลี่ยน ไม่ต้อง reset
        claimedBy: (codesChanged || !isEdit) ? null : undefined,
        bigPrizeCodes: newBigPrizeCodes,
        bigPrizeCodeCursor: (bigPrizeCodesChanged || !isEdit) ? 0 : undefined, // ✅ ถ้าโค้ดไม่เปลี่ยน ไม่ต้อง reset
        bigPrizeClaimedBy: (bigPrizeCodesChanged || !isEdit) ? null : undefined,
        playerCount: 0
      }
      base.puzzle     = null
      base.codes      = newCodes
      base.codeCursor = (codesChanged || !isEdit) ? 0 : undefined
      base.claimedBy  = (codesChanged || !isEdit) ? null : undefined
      base.football   = null
      base.worldCup   = null
      base.slot       = null
      base.numberPick = null
      base.checkin    = base.checkin || {}
      base.codesVersion = null
    }


    if (type === 'เกมทายเบอร์เงิน') {
      // ✅ Debug: Log image URL before saving
      console.log('[CreateGame] Saving numberPick game:', {
        gameId: isEdit ? gameId : 'new',
        hasImage: !!finalImageDataUrl,
        imageUrl: finalImageDataUrl ? finalImageDataUrl.substring(0, 100) : ''
      })
      
      if (!finalImageDataUrl || finalImageDataUrl.trim() === '') {
        console.error('[CreateGame] ERROR: finalImageDataUrl is empty!')
        alert('เกิดข้อผิดพลาด: ไม่พบ URL รูปภาพ กรุณาอัปโหลดรูปภาพใหม่')
        setIsSaving(false)
        return
      }
      
      // ✅ Preserve snapshot รายงานฝาก (กรองเฉพาะผู้ทายล่าสุดถูก เพื่อลดขนาดข้อมูลใน DB)
      const numberPickDepositReport = buildDepositReportForSave(
        depositSumByUser,
        depositFileName,
        depositUploadedAt || Date.now(),
        depositTotalRows,
      )

      base.numberPick = {
        imageDataUrl: finalImageDataUrl ? convertToCDNUrl(finalImageDataUrl) : '',
        endAt: endAt ? new Date(endAt).getTime() : null,
        // ✅ คงค่าคำตอบที่ถูก + สถานะสิ้นสุดกิจกรรมไว้ (ถ้ามี)
        ...(numberPickCorrectAnswer.trim() ? { correctAnswer: numberPickCorrectAnswer.trim() } : {}),
        ...(numberPickEndedAt ? { ended: true, endedAt: numberPickEndedAt } : {}),
        // ✅ คงรูปประกาศผู้ชนะ (เก็บต่อเกม) — ป้องกันสูญเสียตอนบันทึกเกม
        ...(winnersTelegramImageUrl.trim() ? { winnersTelegramImageUrl: winnersTelegramImageUrl.trim() } : {}),
        // ✅ คง snapshot รายงานฝาก (เก็บต่อเกม)
        ...(numberPickDepositReport ? { depositReport: numberPickDepositReport } : {}),
      }
      base.puzzle     = null
      base.codes      = null
      base.codeCursor = null
      base.claimedBy  = null
      base.football   = null
      base.worldCup   = null
      base.slot       = null
      base.checkin    = base.checkin || {}
      base.codesVersion = null
    }

    if (type === 'เกมทายผลบอล') {
      // ✅ Debug: Log image URL before saving
      console.log('[CreateGame] Saving football game:', {
        gameId: isEdit ? gameId : 'new',
        hasImage: !!finalImageDataUrl,
        imageUrl: finalImageDataUrl ? finalImageDataUrl.substring(0, 100) : ''
      })
      
      if (!finalImageDataUrl || finalImageDataUrl.trim() === '') {
        console.error('[CreateGame] ERROR: finalImageDataUrl is empty!')
        alert('เกิดข้อผิดพลาด: ไม่พบ URL รูปภาพ กรุณาอัปโหลดรูปภาพใหม่')
        setIsSaving(false)
        return
      }
      
      // ✅ คำตอบที่ถูก: รวมเป็น "X-Y" ถ้ากรอกครบทั้ง 2 ฝั่ง
      const fbHome = footballCorrectHome.trim()
      const fbAway = footballCorrectAway.trim()
      const fbCorrect = (fbHome !== '' && fbAway !== '') ? `${fbHome}-${fbAway}` : ''
      // ✅ Preserve snapshot รายงานฝาก (กรองเฉพาะผู้ทายล่าสุดถูก เพื่อลดขนาดข้อมูลใน DB)
      const footballDepositReport = buildDepositReportForSave(
        depositSumByUser,
        depositFileName,
        depositUploadedAt || Date.now(),
        depositTotalRows,
      )

      base.football = {
        imageDataUrl: finalImageDataUrl ? convertToCDNUrl(finalImageDataUrl) : undefined,
        homeTeam: homeTeam.trim(),
        awayTeam: awayTeam.trim(),
        endAt: endAt ? new Date(endAt).getTime() : null,
        ...(fbCorrect ? { correctAnswer: fbCorrect } : {}),
        ...(footballEndedAt ? { ended: true, endedAt: footballEndedAt } : {}),
        // ✅ คงรูปประกาศผู้ชนะ (เก็บต่อเกม) — ป้องกันสูญเสียตอนบันทึกเกม
        ...(winnersTelegramImageUrl.trim() ? { winnersTelegramImageUrl: winnersTelegramImageUrl.trim() } : {}),
        // ✅ คง snapshot รายงานฝาก (เก็บต่อเกม)
        ...(footballDepositReport ? { depositReport: footballDepositReport } : {}),
      }
      base.puzzle     = null
      base.codes      = null
      base.codeCursor = null
      base.claimedBy  = null
      base.numberPick = null
      base.worldCup   = null
      base.slot       = null
      base.checkin    = base.checkin || {}
      base.codesVersion = null
    }

    if (type === 'เกมสล็อต') {
      base.slot = {
        startCredit: num(slot.startCredit, 0),
        startBet: num(slot.startBet, 1),
        winRate: num(slot.winRate, 0),
        targetCredit: num(slot.targetCredit, 0),
        ...(slot.winTiers ? { winTiers: slot.winTiers } : {}),
      }
      base.puzzle     = null
      base.codes      = null
      base.codeCursor = null
      base.claimedBy  = null
      base.numberPick = null
      base.football   = null
      base.worldCup   = null
      base.checkin    = base.checkin || {}
      base.codesVersion = null
    }

    if (type === 'เกมบอลโลก') {
      // ✅ แปลง worldCupResults (state) → matchResults object
      // - เก็บเฉพาะคู่ที่มีข้อมูล (score / codes / ended)
      // - claimedBy / endedAt / codeCursor เก็บไว้คงเดิม (ถูกแก้ผ่านปุ่ม "สิ้นสุดกิจกรรมคู่นี้" แล้ว)
      const matchResults: Record<string, any> = {}
      for (const [k, v] of Object.entries(worldCupResults)) {
        if (!v) continue
        const hStr = (v.home || '').trim()
        const aStr = (v.away || '').trim()
        const codes = Array.isArray(v.codes) ? v.codes : []
        const hasScore = /^\d{1,2}$/.test(hStr) && /^\d{1,2}$/.test(aStr)
        const entry: any = {}
        if (hasScore) {
          entry.home = parseInt(hStr, 10)
          entry.away = parseInt(aStr, 10)
        }
        if (codes.length > 0) entry.codes = codes
        if (v.codeFileName) entry.codeFileName = v.codeFileName
        if (Number.isFinite(v.codeCursor as any)) entry.codeCursor = Number(v.codeCursor) || 0
        if (v.claimedBy && Object.keys(v.claimedBy).length > 0) entry.claimedBy = v.claimedBy
        if (v.ended) {
          entry.ended = true
          entry.endedAt = v.endedAt || Date.now()
        }
        // ✅ Telegram (รูปประกาศต่อคู่)
        if ((v as any).telegramImageUrl) entry.telegramImageUrl = String((v as any).telegramImageUrl).trim()
        // ต้องมีอย่างน้อย: score / codes / ended / telegramImageUrl
        if (!hasScore && codes.length === 0 && !v.ended && !entry.telegramImageUrl) continue
        matchResults[String(k)] = entry
      }
      base.worldCup = {
        title: 'FIFA World Cup 2026',
        ended: !!worldCupEnded,
        endedAt: worldCupEnded ? (worldCupEndedAt || Date.now()) : null,
        bonusPerCorrect: Number.isFinite(worldCupBonusPerCorrect) && worldCupBonusPerCorrect >= 0 ? worldCupBonusPerCorrect : 50,
        ...(finalWorldCupNoticeImageUrl ? { noticeImageUrl: convertToCDNUrl(finalWorldCupNoticeImageUrl) } : {}),
        matchResults,
      }
      base.puzzle     = null
      base.codes      = null
      base.codeCursor = null
      base.claimedBy  = null
      base.numberPick = null
      base.football   = null
      // ❗ ไม่ตั้ง base.worldCup = null ที่นี่ (ของเดิมเคย bug)
      base.slot       = null
      base.checkin    = base.checkin || {}
      base.codesVersion = null
    }

    if (type === 'เกมประกาศรางวัล') {
      // ✅ Debug: Log ข้อมูลที่จะบันทึก (always log for consistency)
      console.log('[CreateGame] Saving announce game data:', {
        gameId: isEdit ? gameId : 'new',
        usersCount: announceUsers.length,
        userBonusesCount: announceUserBonuses.length,
        hasImage: !!finalAnnounceImageDataUrl,
        fileName: announceFileName
      })
      
      // ✅ สำหรับเกมประกาศรางวัล: ต้องโหลดข้อมูลเดิมก่อนเพื่อเก็บ processedItems ไว้
      // ✅ ถ้าเป็นโหมดแก้ไข ให้โหลดข้อมูลเดิมก่อน
      let existingAnnounceData: any = {}
      if (isEdit && gameId) {
        try {
          const currentGame = await getGameById(gameId)
          if (currentGame) {
            // ✅ รองรับทั้ง nested และ flat structure
            existingAnnounceData = (currentGame as any).gameData?.announce || 
                                   (currentGame as any).announce || 
                                   {}
          }
        } catch (error) {
          console.warn('[CreateGame] Error loading existing announce data:', error)
          // Continue with empty object if error
        }
      }
      
      // ✅ สร้าง announce object โดยเก็บ processedItems ไว้ (ถ้ามี)
      // ✅ ถ้า users หรือ userBonuses ว่างเปล่า แต่มี processedItems ให้แปลง processedItems เป็น users
      let finalUsers = announceUsers
      let finalUserBonuses = announceUserBonuses
      
      // ✅ ถ้า users ว่างเปล่า แต่มี processedItems ให้แปลง processedItems เป็น users
      if (finalUsers.length === 0 && existingAnnounceData?.processedItems && typeof existingAnnounceData.processedItems === 'object') {
        finalUsers = Object.keys(existingAnnounceData.processedItems)
        console.log('[CreateGame] Converting processedItems to users:', {
          processedItemsCount: Object.keys(existingAnnounceData.processedItems).length,
          finalUsersCount: finalUsers.length
        })
      }
      
      // ✅ ถ้า userBonuses ว่างเปล่า แต่มี processedItems ให้แปลง processedItems เป็น userBonuses
      if (finalUserBonuses.length === 0 && existingAnnounceData?.processedItems && typeof existingAnnounceData.processedItems === 'object') {
        finalUserBonuses = Object.entries(existingAnnounceData.processedItems).map(([user, item]: [string, any]) => ({
          user,
          bonus: typeof item === 'object' && item.bonus ? item.bonus : 0
        }))
        console.log('[CreateGame] Converting processedItems to userBonuses:', {
          processedItemsCount: Object.keys(existingAnnounceData.processedItems).length,
          finalUserBonusesCount: finalUserBonuses.length
        })
      }
      
      // ✅ เก็บเฉพาะ metadata ใน document (ไม่เก็บ users/userBonuses เพื่อหลีกเลี่ยง index limit)
      // ✅ users และ userBonuses จะถูกบันทึกไปยัง subcollection แทน
      const announceMetadata: any = {
        ...existingAnnounceData, // ✅ เก็บข้อมูลเดิมไว้ (รวม processedItems)
        imageDataUrl: finalAnnounceImageDataUrl 
          ? convertToCDNUrl(finalAnnounceImageDataUrl) 
          : (existingAnnounceData.imageDataUrl ? convertToCDNUrl(existingAnnounceData.imageDataUrl) : undefined),
        fileName: announceFileName || existingAnnounceData.fileName || undefined,
        // ✅ เพิ่ม flag เพื่อบอกว่าใช้ subcollection
        _useSubcollection: true
      }
      
      // ✅ ลบ users และ userBonuses ออกจาก metadata (เพื่อป้องกันการเก็บใน document)
      delete announceMetadata.users
      delete announceMetadata.userBonuses
      
      base.announce = announceMetadata
      
      // ✅ Debug: Log base.announce หลังจากสร้าง (always log for consistency)
      console.log('[CreateGame] base.announce created:', {
        hasAnnounce: !!base.announce,
        announceKeys: base.announce ? Object.keys(base.announce) : [],
        usersCount: finalUsers.length + announceUsers.length, // ✅ จำนวน users ที่จะบันทึกไปยัง subcollection
        userBonusesCount: finalUserBonuses.length + announceUserBonuses.length, // ✅ จำนวน bonuses ที่จะบันทึกไปยัง subcollection
        useSubcollection: true, // ✅ ใช้ subcollection
        note: 'users and userBonuses will be saved to subcollection, not in document'
      })
      // เคลียร์ field ประเภทอื่น ๆ กันค้าง
      base.puzzle     = null
      base.codes      = null
      base.codeCursor = null
      base.claimedBy  = null
      base.numberPick = null
      base.football   = null
      base.worldCup   = null
      base.slot       = null
      base.checkin    = base.checkin || {}
      base.codesVersion = null
    }

    if (type === 'เกมลุ้นรางวัลพิเศษ') {
      base.trickOrTreat = { winChance: trickOrTreatWinChance }
      const newCodes = codes.map((c) => c.trim()).filter(Boolean)
      base.codes = newCodes
      
      // ✅ ตรวจสอบว่าโค้ดเปลี่ยนไปหรือไม่
      const oldCodes = originalTrickOrTreatCodesRef.current
      const codesChanged = JSON.stringify(oldCodes) !== JSON.stringify(newCodes)
      
      // ✅ ถ้าโค้ดเปลี่ยนไป ให้ reset cursor
      if (codesChanged || !isEdit) {
        base.codeCursor = 0
        base.claimedBy = null
      }
      // ✅ ถ้าโค้ดไม่เปลี่ยน ไม่ต้อง reset cursor (จะใช้ค่าที่มีอยู่)
      
      // ✅ บันทึกรูปภาพการ์ด (แยกจากข้อมูลเกม - ไม่ลบเมื่อลบเกม)
      // ✅ ใช้ finalCardImage ถ้ามี (อัปโหลดใหม่) หรือใช้ cardImage เดิม (CDN URL) ถ้าไม่ได้อัปโหลดใหม่
      base.cardImages = {
        card1: finalCardImage1 && finalCardImage1.trim() ? finalCardImage1 : (cardImage1 && cardImage1.trim() ? cardImage1 : null),
        card2: finalCardImage2 && finalCardImage2.trim() ? finalCardImage2 : (cardImage2 && cardImage2.trim() ? cardImage2 : null),
        card3: finalCardImage3 && finalCardImage3.trim() ? finalCardImage3 : (cardImage3 && cardImage3.trim() ? cardImage3 : null)
      }
      
      // ✅ Debug: Log cardImages ที่จะบันทึก
      console.log('[CreateGame] Saving cardImages:', {
        finalCardImage1: finalCardImage1 ? finalCardImage1.substring(0, 100) : 'empty',
        finalCardImage2: finalCardImage2 ? finalCardImage2.substring(0, 100) : 'empty',
        finalCardImage3: finalCardImage3 ? finalCardImage3.substring(0, 100) : 'empty',
        cardImage1: cardImage1 ? cardImage1.substring(0, 100) : 'empty',
        cardImage2: cardImage2 ? cardImage2.substring(0, 100) : 'empty',
        cardImage3: cardImage3 ? cardImage3.substring(0, 100) : 'empty',
        savedCardImages: base.cardImages
      })
      
      // เคลียร์ field ประเภทอื่น ๆ กันค้าง
      base.puzzle     = null
      base.numberPick = null
      base.football   = null
      base.worldCup   = null
      base.slot       = null
      base.checkin    = base.checkin || {}
      base.codesVersion = null
    }

    if (type === 'เกมป๊อกเด้ง') {
      base.pokDeng = {
        npcStandThreshold: Math.max(0, Math.min(9, Number(pokDengNpcStand) || 5)),
        playerWinChance: Math.max(0, Math.min(100, Number(pokDengWinChance) || 50)),
      }
      const newCodes = codes.map((c) => c.trim()).filter(Boolean)
      base.codes = newCodes

      // ✅ ถ้าโค้ดเปลี่ยนไป → reset cursor + claimedBy
      const oldCodes = originalPokDengCodesRef.current
      const codesChanged = JSON.stringify(oldCodes) !== JSON.stringify(newCodes)
      if (codesChanged || !isEdit) {
        base.codeCursor = 0
        base.claimedBy = null
      }

      // เคลียร์ field ประเภทอื่น ๆ กันค้าง
      base.puzzle     = null
      base.numberPick = null
      base.football   = null
      base.worldCup   = null
      base.slot       = null
      base.trickOrTreat = null
      base.checkin    = base.checkin || {}
      base.codesVersion = null
    }

    if (type === 'เกมแนะนำเพื่อน') {
      base.referral = {
        ...(finalReferralImageDataUrl && { imageDataUrl: convertToCDNUrl(finalReferralImageDataUrl) }),
        prizes: referralPrizes,
        ...(referralEnded && { ended: true, endedAt: referralEndedAt }),
      }
      base.puzzle     = null
      base.numberPick = null
      base.football   = null
      base.worldCup   = null
      base.slot       = null
      base.checkin    = base.checkin || {}
    }

    // ✅ ประกาศ cleanCouponItems ไว้ข้างนอกเพื่อให้ใช้ได้ใน scope ที่ต้องการ
    let cleanCouponItems: Array<{ title: string; rewardCredit: number; price: number }> = []
    
    if (type === 'เกมเช็คอิน') {
      // ✅ ทำ rewards ให้สะอาดและมีเท่าที่กำหนดวัน (ไม่ใช้ date แล้ว)
      const normalized: CheckinReward[] = rewards.slice(0, checkinDays).map((r) =>
        r.kind === 'coin'
          ? ({ kind: 'coin', value: Math.max(0, Number(r.value) || 0) })
          : ({ kind: 'code', value: String(r.value || '').trim() })
      )
      // ✅ แยก codes ออกจาก items เพื่อป้องกัน write_too_big error
      cleanCouponItems = couponItems.slice(0, couponCount).map((it) => ({
        title: (it.title || '').trim(),
        rewardCredit: Math.max(0, Number(it.rewardCredit) || 0),
        price: Math.max(0, Number(it.price) || 0),
        // ✅ ไม่เก็บ codes ใน items เพื่อป้องกัน write_too_big (จะเก็บแยกใน items/{index}/codes)
      }));
      
      // ✅ เก็บ codes แยกสำหรับแต่ละ item (ใช้โค้ดที่อัพโหลดใหม่ถ้ามี)
      couponItemCodes = couponItems.slice(0, couponCount).map((it, index) => {
        // ✅ ถ้ามีโค้ดที่อัพโหลดใหม่ ให้ใช้โค้ดใหม่
        if (couponItemCodesNew[index] && couponItemCodesNew[index].length > 0) {
          return couponItemCodesNew[index]
        }
        // ✅ ถ้าไม่มี ให้ใช้โค้ดจาก couponItems (ถ้ามี)
        return (it.codes || []).map(c => String(c || '').trim()).filter(Boolean)
      });
         // ✅ ทำ completeReward ให้สะอาด
         const normalizedCompleteReward: CheckinReward = 
           completeReward.kind === 'coin'
             ? ({ kind: 'coin', value: Math.max(0, Number(completeReward.value) || 0) })
             : ({ kind: 'code', value: String(completeReward.value || '').trim() })
         
         // ✅ ตรวจสอบการเปลี่ยนแปลงโค้ดสำหรับเกมเช็คอิน
         const oldRewards = originalCheckinRewardsRef.current || []
         const oldCompleteReward = originalCheckinCompleteRewardRef.current
         const oldCouponItems = originalCheckinCouponItemsRef.current || []
         
         // ✅ ตรวจสอบว่าโค้ดใน daily rewards เปลี่ยนไปหรือไม่
         // ✅ ถ้ามีโค้ดใหม่ที่อัพโหลด (ใน dailyRewardCodes) ให้ถือว่าเปลี่ยน
         // ✅ ถ้าไม่มีโค้ดใหม่ (เป็น array ว่าง) ให้ถือว่าไม่เปลี่ยน (ใช้โค้ดเดิมใน DB)
         const rewardsChanged = dailyRewardCodes.some((codes) => {
           return codes && codes.length > 0  // ถ้ามีโค้ดใหม่ที่อัพโหลด ถือว่าเปลี่ยน
         })
         
         // ✅ ตรวจสอบว่าโค้ดใน complete reward เปลี่ยนไปหรือไม่
         // ✅ ถ้ามีโค้ดใหม่ที่อัพโหลด (ใน completeRewardCodes) ให้ถือว่าเปลี่ยน
         // ✅ ถ้าไม่มีโค้ดใหม่ (เป็น array ว่าง) ให้ถือว่าไม่เปลี่ยน (ใช้โค้ดเดิมใน DB)
         const completeRewardChanged = normalizedCompleteReward.kind === 'code' && completeRewardCodes.length > 0
         
         // ✅ ตรวจสอบว่าโค้ดใน coupon items เปลี่ยนไปหรือไม่
         // ✅ ถ้ามีโค้ดใหม่ที่อัพโหลด (ใน couponItemCodesNew) ให้ถือว่าเปลี่ยน
         // ✅ ถ้าไม่มีโค้ดใหม่ (เป็น array ว่าง) ให้ถือว่าไม่เปลี่ยน (ใช้โค้ดเดิมใน DB)
         const couponItemsChanged = couponItemCodesNew.some((newCodes) => {
           return newCodes && newCodes.length > 0  // ถ้ามีโค้ดใหม่ที่อัพโหลด ถือว่าเปลี่ยน
         })
         
         // ✅ อ่าน cursor เดิมจาก game data (ถ้าโค้ดไม่เปลี่ยน)
         let couponCursors: number[] = []
         if (isEdit && !couponItemsChanged) {
           try {
             // ✅ โหลด game data เพื่ออ่าน cursors
             const currentGame = (await getGameById(gameId) || {}) as GameData
             const existingCursors = (currentGame as any).gameData?.checkin?.coupon?.cursors
             if (Array.isArray(existingCursors)) {
               couponCursors = existingCursors.slice(0, cleanCouponItems.length)
               // ถ้ามี item ใหม่ ให้เพิ่ม cursor = 0
               while (couponCursors.length < cleanCouponItems.length) {
                 couponCursors.push(0)
               }
             }
           } catch (error) {
             console.error('Error reading coupon cursors:', error)
           }
         }
         
         // ✅ ถ้าโค้ดเปลี่ยนหรือไม่มี cursor เดิม ให้ reset เป็น 0
         if (couponCursors.length === 0 || couponItemsChanged || !isEdit) {
           couponCursors = cleanCouponItems.map(() => 0)
         }
         
         base.checkin = {
           days: checkinDays,
           rewards: normalized,
           completeReward: normalizedCompleteReward,
           features: {
             dailyReward: checkinFeatures.dailyReward !== undefined ? checkinFeatures.dailyReward : true,  // ✅ บันทึกการตั้งค่าเปิด/ปิด (default: true)
             couponShop: checkinFeatures.couponShop !== undefined ? checkinFeatures.couponShop : true,  // ✅ บันทึกการตั้งค่าเปิด/ปิด (default: true)
           },
           startDate: (checkinStartDate || '').trim(),  // ✅ วันที่เริ่มต้นกิจกรรม
           endDate: (checkinEndDate || '').trim(),  // ✅ วันที่สิ้นสุดกิจกรรม
           updatedAt: Date.now(),
           ...(finalCheckinImageDataUrl && { imageDataUrl: convertToCDNUrl(finalCheckinImageDataUrl) }),  // ✅ ไม่ส่ง field ถ้าไม่มีรูปภาพ
           ...(checkinFileName && { fileName: checkinFileName }),  // ✅ ไม่ส่ง field ถ้าไม่มีชื่อไฟล์
           contactChannels: {
             telegramUrl: String(checkinContactSettings.telegramUrl || '').trim(),
             lineUrl: String(checkinContactSettings.lineUrl || '').trim(),
             websiteUrl: String(checkinContactSettings.websiteUrl || '').trim(),
             websiteLabel: String(checkinContactSettings.websiteLabel || '').trim(),
           },
           coupon: {
             items: cleanCouponItems,  // ✅ ไม่มี codes ใน items เพื่อป้องกัน write_too_big
             cursors: couponCursors,   // ✅ ใช้ cursor เดิมถ้าโค้ดไม่เปลี่ยน
           },
         }
         
         // ✅ Debug: Log features ที่จะบันทึก
         if (import.meta.env.DEV) {
           console.log('[CreateGame] Saving checkin features:', {
             gameId: isEdit ? gameId : 'new',
             features: base.checkin.features,
             checkinFeatures,
             hasImageDataUrl: !!base.checkin.imageDataUrl,
             imageDataUrl: base.checkin.imageDataUrl ? base.checkin.imageDataUrl.substring(0, 100) : 'N/A',
             finalCheckinImageDataUrl: finalCheckinImageDataUrl ? finalCheckinImageDataUrl.substring(0, 100) : 'N/A'
           })
         }
         
         // ✅ บันทึก codes แยกใน items/{index}/codes เพื่อป้องกัน write_too_big
         // ✅ จะบันทึกหลังจาก update base.checkin แล้ว

      // เคลียร์ field ประเภทอื่น ๆ กันค้าง
      base.puzzle     = null
      base.codes      = null
      base.codeCursor = null
      base.claimedBy  = null
      base.numberPick = null
      base.football   = null
      base.worldCup   = null
      base.slot       = null
      base.codesVersion = null
    }

    if (isEdit) {
      try {
        
        // อัปเดต base
        // Use Firestore
        try {
          // Convert base to Firestore format
          const gameData = {
            gameId,
            name: base.name || base.title || '',
            type: base.type || type,
            unlocked: base.unlocked !== false,
            locked: base.locked === true,
            userAccessType: base.userAccessType || 'all',
            selectedUsers: base.selectedUsers || null,
          gameData: {
            ...(base.puzzle && { puzzle: base.puzzle }),
            ...(base.partyRounds && { partyRounds: base.partyRounds }),
            // ✅ เกมปาร์ตี้: บันทึก partyMode + partyImagePool ด้วย (เพื่อให้โหลดกลับมาแก้ไขได้)
            ...(base.partyMode && { partyMode: base.partyMode }),
            ...(base.partyImagePool !== undefined && { partyImagePool: base.partyImagePool }),
            ...(base.numberPick && { numberPick: base.numberPick }),
            ...(base.football && { football: base.football }),
            ...(base.worldCup && { worldCup: base.worldCup }),
            ...(base.slot && { slot: base.slot }),
            ...(base.checkin && { checkin: base.checkin }),
            // ✅ ส่ง announce เสมอถ้ามี base.announce (เพื่อให้สามารถบันทึกข้อมูลได้แม้ array ว่าง)
            ...(base.announce ? { announce: base.announce } : {}),
            ...(base.trickOrTreat && { trickOrTreat: base.trickOrTreat }),
            ...(base.pokDeng && { pokDeng: base.pokDeng }),
            ...(base.loyKrathong && { loyKrathong: base.loyKrathong }),
            ...(base.referral && { referral: base.referral }),
            ...(base.codes && { codes: base.codes }),
            ...(base.codeCursor !== undefined && { codeCursor: base.codeCursor }),
            ...(base.claimedBy && { claimedBy: base.claimedBy }),
            ...(base.codesVersion && { codesVersion: base.codesVersion }),
          }
        }
        
        // ✅ Debug: Log ข้อมูลที่จะส่งไป Firestore (development only)
        // Removed for production
        
        // ✅ เพิ่ม cardImages ใน gameData สำหรับ update (ถ้ามี)
        const updateData = {
          ...gameData,
          ...(base.cardImages && { cardImages: base.cardImages })
        }
        await updateGame(gameId, updateData)
        } catch (error) {
          console.error('Error updating game in Firestore:', error)
          throw error
        }
        
        // ✅ สำหรับเกมเช็คอิน: บันทึก codes โดยรวมเข้าไปใน gameData JSONB
        if (type === 'เกมเช็คอิน' && (couponItemCodesNew?.length > 0 || dailyRewardCodes?.length > 0 || completeRewardCodes?.length > 0)) {
          try {
            // ✅ อ่าน game data ปัจจุบัน
            const currentGame = (await getGameById(gameId) || {}) as GameData
            // ✅ โครงสร้างข้อมูล: checkin อยู่ใน game_data JSONB (ถูก spread จาก Firestore)
            const currentCheckin = (currentGame as any).checkin || {}
            
            // ✅ อัปเดต coupon codes
            if (couponItemCodesNew && couponItemCodesNew.length > 0) {
              if (!currentCheckin.coupon) currentCheckin.coupon = {}
              if (!currentCheckin.coupon.items) currentCheckin.coupon.items = []
              
              for (let index = 0; index < couponItemCodesNew.length; index++) {
                const newCodes = couponItemCodesNew[index]
                if (newCodes && newCodes.length > 0) {
                  if (!currentCheckin.coupon.items[index]) {
                    currentCheckin.coupon.items[index] = {}
                  }
                  // ✅ เก็บ codes ใน document structure (backward compatible)
                  currentCheckin.coupon.items[index].codes = newCodes
                  
                  // ✅ CRITICAL FIX: บันทึก codes ไปยัง subcollection structure เพื่อป้องกัน race condition
                  try {
                    const result = await saveCouponCodesToSubcollection(gameId, index, newCodes)
                    if (result.success) {
                      console.log(`[CreateGame] ✅ Saved ${newCodes.length} codes to subcollection for item ${index}`)
                    } else {
                      console.warn(`[CreateGame] ⚠️ Failed to save codes to subcollection for item ${index}:`, result.error)
                    }
                  } catch (error) {
                    console.error(`[CreateGame] Error saving codes to subcollection for item ${index}:`, error)
                    // ✅ ไม่ throw error เพื่อไม่ให้การอัพเดทเกมล้มเหลว
                  }
                }
              }
            }
            
            // ✅ อัปเดต daily reward codes
            if (dailyRewardCodes && dailyRewardCodes.length > 0) {
              if (!currentCheckin.rewardCodes) currentCheckin.rewardCodes = {}
              
              for (let index = 0; index < dailyRewardCodes.length; index++) {
                const newCodes = dailyRewardCodes[index]
                if (newCodes && newCodes.length > 0) {
                  currentCheckin.rewardCodes[index] = {
                    cursor: 0,  // ✅ reset cursor เมื่อบันทึกโค้ดใหม่
                    codes: newCodes
                  }
                }
              }
            }
            
            // ✅ อัปเดต complete reward codes
            if (completeRewardCodes && completeRewardCodes.length > 0) {
              currentCheckin.completeRewardCodes = {
                cursor: 0,  // ✅ reset cursor เมื่อบันทึกโค้ดใหม่
                codes: completeRewardCodes
              }
            }
            
            // ✅ บันทึกกลับไปยัง Firestore (ส่ง checkin เป็น top-level property)
            await updateGame(gameId, {
              checkin: currentCheckin
            })
          } catch (error) {
            console.error('Error saving checkin codes:', error)
            // ไม่ throw error เพราะ base.checkin ถูกบันทึกแล้ว
          }
        }
        
        // ✅ สำหรับเกมประกาศรางวัล: บันทึก users และ userBonuses ไปยัง subcollection (เมื่อแก้ไข)
        if (type === 'เกมประกาศรางวัล' && gameId) {
          const usersToSave = finalUsers.length > 0 ? finalUsers : (announceUsers.length > 0 ? announceUsers : [])
          const bonusesToSave = finalUserBonuses.length > 0 ? finalUserBonuses : (announceUserBonuses.length > 0 ? announceUserBonuses : [])
          
          // ✅ ลบข้อมูลเก่าก่อนบันทึกใหม่
          await deleteAnnounceUsersFromSubcollection(gameId, themeName)
          
          // ✅ บันทึก users ไปยัง subcollection
          if (usersToSave.length > 0) {
            const result = await saveAnnounceUsersToSubcollection(gameId, usersToSave, themeName)
            if (result.success) {
              console.log(`[CreateGame] ✅ Saved ${usersToSave.length} users to subcollection (edit mode)`)
            } else {
              console.warn(`[CreateGame] ⚠️ Failed to save users to subcollection:`, result.error)
            }
          }
          
          // ✅ บันทึก userBonuses ไปยัง subcollection
          if (bonusesToSave.length > 0) {
            const result = await saveAnnounceUserBonusesToSubcollection(gameId, bonusesToSave, themeName)
            if (result.success) {
              console.log(`[CreateGame] ✅ Saved ${bonusesToSave.length} bonuses to subcollection (edit mode)`)
            } else {
              console.warn(`[CreateGame] ⚠️ Failed to save bonuses to subcollection:`, result.error)
            }
          }
        }
        
        // Invalidate cache after updating game
        dataCache.invalidateGame(gameId)
        
        // ✅ ไม่ trigger reload ทันที (เพื่อไม่ให้รีเซ็ต couponItemCodesNew, dailyRewardCodes, completeRewardCodes)
        // ✅ ให้ user refresh หน้าเองถ้าต้องการดูข้อมูลใหม่
        // setReloadTrigger(prev => prev + 1)
        
        setIsDirty(false)
        setAnnounceToast({ msg: 'บันทึกการเปลี่ยนแปลงเรียบร้อย', type: 'success' })
      } catch (error) {
        console.error('Error saving game:', error)
        setAnnounceToast({ msg: 'เกิดข้อผิดพลาดในการบันทึกข้อมูล กรุณาลองใหม่', type: 'error' })
      } finally {
        setIsSaving(false)
      }
      return
    }

    // ===== โหมดสร้าง =====
    try {
      // ✅ Generate unique game ID with better collision prevention
      // Use timestamp + random string + counter to ensure uniqueness
      const timestamp = Date.now()
      const randomStr = Math.random().toString(36).substr(2, 9)
      const counter = Math.floor(Math.random() * 10000)
      const id = `game_${timestamp}_${randomStr}_${counter}`
      
      // ✅ ใช้ตัวแปรนี้เพื่อเก็บ game ID ที่ใช้จริง (อาจจะเปลี่ยนถ้า retry)
      let finalGameId = id
      
        // Use Firestore
      try {
        // Convert base to Firebase format
        const gameData = {
          id: id,
          gameId: id,
          name: base.name || base.title || '',
          type: base.type || type,
          unlocked: base.unlocked !== false,
          locked: base.locked === true,
          userAccessType: base.userAccessType || 'all',
          selectedUsers: base.selectedUsers || null,
          // ✅ บันทึก cardImages ที่ root level (แยกจากข้อมูลเกม - ไม่ลบเมื่อลบเกม)
          ...(base.cardImages && { cardImages: base.cardImages }),
          gameData: {
            ...(base.puzzle && { puzzle: base.puzzle }),
            ...(base.partyRounds && { partyRounds: base.partyRounds }),
            // ✅ เกมปาร์ตี้: บันทึก partyMode + partyImagePool ด้วย (เพื่อให้โหลดกลับมาแก้ไขได้)
            ...(base.partyMode && { partyMode: base.partyMode }),
            ...(base.partyImagePool !== undefined && { partyImagePool: base.partyImagePool }),
            ...(base.numberPick && { numberPick: base.numberPick }),
            ...(base.football && { football: base.football }),
            ...(base.worldCup && { worldCup: base.worldCup }),
            ...(base.slot && { slot: base.slot }),
            ...(base.checkin && { checkin: base.checkin }),
            // ✅ ส่ง announce เสมอถ้ามี base.announce (เพื่อให้สามารถบันทึกข้อมูลได้แม้ array ว่าง)
            ...(base.announce ? { announce: base.announce } : {}),
            ...(base.trickOrTreat && { trickOrTreat: base.trickOrTreat }),
            ...(base.pokDeng && { pokDeng: base.pokDeng }),
            ...(base.loyKrathong && { loyKrathong: base.loyKrathong }),
            ...(base.referral && { referral: base.referral }),
            ...(base.codes && { codes: base.codes }),
            ...(base.codeCursor !== undefined && { codeCursor: base.codeCursor }),
            ...(base.claimedBy && { claimedBy: base.claimedBy }),
            ...(base.codesVersion && { codesVersion: base.codesVersion }),
          }
        }
        
        // ✅ Debug: Log ข้อมูลที่จะส่งไป Firestore (development only)
        console.log('[CreateGame] Sending new game data to Firestore:', {
          gameId: id,
          type,
          hasBaseAnnounce: !!base.announce,
          announceUsersCount: Array.isArray(gameData.gameData?.announce?.users) ? gameData.gameData.announce.users.length : 0,
          announceUserBonusesCount: Array.isArray(gameData.gameData?.announce?.userBonuses) ? gameData.gameData.announce.userBonuses.length : 0
        })
        
        try {
          await createGame(gameData)
          
          // ✅ สำหรับเกมประกาศรางวัล: บันทึก users และ userBonuses ไปยัง subcollection
          if (type === 'เกมประกาศรางวัล' && finalGameId) {
            const usersToSave = finalUsers.length > 0 ? finalUsers : (announceUsers.length > 0 ? announceUsers : [])
            const bonusesToSave = finalUserBonuses.length > 0 ? finalUserBonuses : (announceUserBonuses.length > 0 ? announceUserBonuses : [])
            
            // ✅ ลบข้อมูลเก่า (ถ้ามี) ก่อนบันทึกใหม่
            if (isEdit) {
              await deleteAnnounceUsersFromSubcollection(finalGameId)
            }
            
            // ✅ บันทึก users ไปยัง subcollection
            if (usersToSave.length > 0) {
              const result = await saveAnnounceUsersToSubcollection(finalGameId, usersToSave)
              if (result.success) {
                console.log(`[CreateGame] ✅ Saved ${usersToSave.length} users to subcollection`)
              } else {
                console.warn(`[CreateGame] ⚠️ Failed to save users to subcollection:`, result.error)
              }
            }
            
            // ✅ บันทึก userBonuses ไปยัง subcollection
            if (bonusesToSave.length > 0) {
              const result = await saveAnnounceUserBonusesToSubcollection(finalGameId, bonusesToSave)
              if (result.success) {
                console.log(`[CreateGame] ✅ Saved ${bonusesToSave.length} bonuses to subcollection`)
              } else {
                console.warn(`[CreateGame] ⚠️ Failed to save bonuses to subcollection:`, result.error)
              }
            }
          }
        } catch (error: any) {
          console.error('Error creating game in Firestore:', error)
          
          // ✅ Handle "Game already exists" error - generate new ID and retry
          if (error instanceof Error && (error.message.includes('Game already exists') || error.message.includes('already exists'))) {
            console.warn('[CreateGame] Game ID collision detected, generating new ID and retrying...')
            
            // Generate new game ID with better uniqueness
            const timestamp = Date.now()
            const randomStr = Math.random().toString(36).substr(2, 9)
            const counter = Math.floor(Math.random() * 10000)
            const newId = `game_${timestamp}_${randomStr}_${counter}`
            console.log(`[CreateGame] Retrying with new game ID: ${newId}`)
            
            // Update gameData with new ID
            const retryGameData = {
              ...gameData,
              gameId: newId
            }
            
            try {
              await createGame(retryGameData)
              // ✅ Update finalGameId for subsequent operations
              finalGameId = newId
              console.log(`[CreateGame] Game created successfully with new ID: ${finalGameId}`)
              
              // ✅ สำหรับเกมประกาศรางวัล: บันทึก users และ userBonuses ไปยัง subcollection (retry case)
              if (type === 'เกมประกาศรางวัล' && finalGameId) {
                const usersToSave = finalUsers.length > 0 ? finalUsers : (announceUsers.length > 0 ? announceUsers : [])
                const bonusesToSave = finalUserBonuses.length > 0 ? finalUserBonuses : (announceUserBonuses.length > 0 ? announceUserBonuses : [])
                
                if (usersToSave.length > 0) {
                  await saveAnnounceUsersToSubcollection(finalGameId, usersToSave, themeName)
                }
                if (bonusesToSave.length > 0) {
                  await saveAnnounceUserBonusesToSubcollection(finalGameId, bonusesToSave, themeName)
                }
              }
            } catch (retryError) {
              console.error('[CreateGame] Retry failed:', retryError)
              const retryErrorMessage = retryError instanceof Error 
                ? retryError.message 
                : 'เกิดข้อผิดพลาดในการสร้างเกม'
              alert(`เกิดข้อผิดพลาดในการสร้างเกม (Retry failed)\n\nError: ${retryErrorMessage}\n\nกรุณาลองใหม่อีกครั้ง`)
              throw retryError
            }
          } else {
            // ✅ For other errors, show user-friendly message
            const errorMessage = error instanceof Error 
              ? error.message 
              : 'เกิดข้อผิดพลาดในการสร้างเกม'
            
            alert(`เกิดข้อผิดพลาดในการสร้างเกม\n\nError: ${errorMessage}\n\nกรุณาลองใหม่อีกครั้ง`)
            throw error
          }
        }
      } catch (error) {
        console.error('Error in createGame try block:', error)
        throw error
      }

      // ✅ สำหรับเกมเช็คอิน: บันทึก codes โดยรวมเข้าไปใน gameData JSONB
      if (type === 'เกมเช็คอิน' && (couponItemCodes?.length > 0 || dailyRewardCodes?.length > 0 || completeRewardCodes?.length > 0)) {
        try {
          // ✅ อ่าน game data ที่สร้างไปแล้ว (ใช้ finalGameId แทน id)
          const createdGame = (await getGameById(finalGameId) || {}) as GameData
          // ✅ โครงสร้างข้อมูล: checkin อยู่ใน game_data JSONB (ถูก spread จาก Firestore)
          const currentCheckin = (createdGame as any).checkin || {}
          
          // ✅ อัปเดต coupon codes
          if (couponItemCodes && couponItemCodes.length > 0) {
            if (!currentCheckin.coupon) currentCheckin.coupon = {}
            if (!currentCheckin.coupon.items) currentCheckin.coupon.items = []
            
            for (let index = 0; index < couponItemCodes.length; index++) {
              const codes = couponItemCodes[index]
              if (codes && codes.length > 0) {
                if (!currentCheckin.coupon.items[index]) {
                  currentCheckin.coupon.items[index] = {}
                }
                // ✅ เก็บ codes ใน document structure (backward compatible)
                currentCheckin.coupon.items[index].codes = codes
                
                // ✅ CRITICAL FIX: บันทึก codes ไปยัง subcollection structure เพื่อป้องกัน race condition
                try {
                  const result = await saveCouponCodesToSubcollection(finalGameId, index, codes)
                  if (result.success) {
                    console.log(`[CreateGame] ✅ Saved ${codes.length} codes to subcollection for item ${index}`)
                  } else {
                    console.warn(`[CreateGame] ⚠️ Failed to save codes to subcollection for item ${index}:`, result.error)
                  }
                } catch (error) {
                  console.error(`[CreateGame] Error saving codes to subcollection for item ${index}:`, error)
                  // ✅ ไม่ throw error เพื่อไม่ให้การสร้างเกมล้มเหลว
                }
              }
            }
          }
          
          // ✅ อัปเดต daily reward codes
          if (dailyRewardCodes && dailyRewardCodes.length > 0) {
            if (!currentCheckin.rewardCodes) currentCheckin.rewardCodes = {}
            
            for (let index = 0; index < dailyRewardCodes.length; index++) {
              const codes = dailyRewardCodes[index]
              if (codes && codes.length > 0) {
                currentCheckin.rewardCodes[index] = {
                  cursor: 0,  // ✅ reset cursor เมื่อบันทึกโค้ดใหม่
                  codes: codes
                }
              }
            }
          }
          
          // ✅ อัปเดต complete reward codes
          if (completeRewardCodes && completeRewardCodes.length > 0) {
            currentCheckin.completeRewardCodes = {
              cursor: 0,  // ✅ reset cursor เมื่อบันทึกโค้ดใหม่
              codes: completeRewardCodes
            }
          }
          
          // ✅ บันทึกกลับไปยัง Firestore (ส่ง checkin เป็น top-level property)
          await updateGame(finalGameId, {
            checkin: currentCheckin
          })
        } catch (error) {
          console.error('Error saving checkin codes:', error)
          // ไม่ throw error เพราะ base.checkin ถูกบันทึกแล้ว
        }
      }

      const linkQuery = getPlayerLink(finalGameId)
      try { await navigator.clipboard.writeText(linkQuery) } catch {}

      // ✅ Invalidate cache after creating new game
      dataCache.invalidateGame(finalGameId)
      // ✅ Clear games list cache เพื่อให้หน้า home แสดงเกมใหม่
      dataCache.delete(cacheKeys.gamesList())
      
      // ✅ Dispatch custom event เพื่อให้หน้า home refresh games list
      window.dispatchEvent(new CustomEvent('gameCreated', { detail: { gameId: finalGameId } }))
      
      // ✅ Navigate to edit page
      nav(`/games/${finalGameId}`, { replace: true })
      
      // ✅ Trigger reload เพื่อโหลดข้อมูลเกมที่สร้างใหม่ (หลังจาก redirect)
      // ✅ ใช้ setTimeout เพื่อให้แน่ใจว่า navigation เสร็จก่อน
      // ✅ ใช้ window.location.pathname เพื่อตรวจสอบว่า navigation เสร็จแล้ว
      const checkAndReload = () => {
        const currentPath = window.location.pathname
        const expectedPath = `/games/${finalGameId}`
        
        if (currentPath === expectedPath) {
          // ✅ Navigation เสร็จแล้ว trigger reload
          setReloadTrigger(prev => prev + 1)
        } else {
          // ✅ ยังไม่เสร็จ รออีกครั้ง
          setTimeout(checkAndReload, 200)
        }
      }
      
      setTimeout(checkAndReload, 500)
    } catch (error) {
      console.error('Error creating game:', error)
      setAnnounceToast({ msg: 'เกิดข้อผิดพลาดในการสร้างเกม กรุณาลองใหม่', type: 'error' })
      setIsSaving(false)
    }
  }

  // ยืนยันรหัสผ่านก่อนลบ (ถ้าล็อกอยู่)
  async function verifyDeletionPassword(): Promise<boolean> {
    // ✅ ใช้ Firebase Auth (รองรับทั้ง 3 themes)
    const { user } = await getFirebaseUser()
    if (!user || !user.email) { 
      alert('กรุณาเข้าสู่ระบบก่อนทำรายการลบเกม')
      return false 
    }

    // ✅ ตรวจสอบว่า user ใช้ email/password authentication
    const password = window.prompt('ใส่รหัสผ่านที่ใช้ล็อกอินเพื่อยืนยันการลบเกมที่ถูกล็อก')
    if (!password) return false
    
    try {
      // ✅ ใช้ signInWithPassword เพื่อ verify password
      // ถ้า password ถูกต้อง จะ sign in สำเร็จ
      const { user: reAuthUser, error } = await signInWithPassword(user.email, password)
      
      if (error) {
        console.error('Re-auth failed:', error)
        alert('รหัสผ่านไม่ถูกต้อง')
        return false
      }
      
      return true
    } catch (err) {
      console.error('Re-auth failed:', err)
      alert('รหัสผ่านไม่ถูกต้อง')
      return false
    }
  }

  const removeGame = async () => {
    if (!isEdit) return
    setShowDeleteConfirm(true)
  }

  const executeDeleteGame = async () => {
    setShowDeleteConfirm(false)
    try {
      await deleteGame(gameId)
      dataCache.invalidateGame(gameId)
      nav('/home', { replace: true })
    } catch (error) {
      console.error('Error deleting game:', error)
      setAnnounceToast({ msg: 'เกิดข้อผิดพลาดในการลบเกม', type: 'error' })
    }
  }

  // ===== UI =====
  // Show loading state when editing and loading game data
  if (isEdit && gameDataLoading) {
    return (
      <div className="admin-body-white" style={{ textAlign: 'center', padding: '60px 20px' }}>
        <div style={{
          width: '50px',
          height: '50px',
          border: '4px solid #f3f3f3',
          borderTop: '4px solid var(--theme-primary, #3498db)',
          borderRadius: '50%',
          animation: 'spin 1s linear infinite',
          margin: '0 auto 20px'
        }} />
        <h3 style={{ color: '#333', margin: '0' }}>กำลังโหลดข้อมูลเกม...</h3>
        <p style={{ color: '#999', margin: '10px 0 0 0' }}>กรุณารอสักครู่</p>
        <style>{`
          @keyframes spin {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
          }
        `}</style>
      </div>
    )
  }

  return (
    <div className="admin-body-white">
      <div className="admin-page-header" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <button
          type="button"
          onClick={() => nav(-1)}
          title="ย้อนกลับ"
          style={{
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            width: 36, height: 36, padding: 0, flexShrink: 0,
            border: `1px solid ${colors.borderLight}`, borderRadius: 10,
            background: colors.bgPrimary, color: colors.textSecondary,
            cursor: 'pointer', transition: 'all 0.15s ease',
          }}
          onMouseEnter={(e) => { e.currentTarget.style.background = `${colors.primary}12`; e.currentTarget.style.borderColor = `${colors.primary}40`; e.currentTarget.style.color = colors.primary }}
          onMouseLeave={(e) => { e.currentTarget.style.background = colors.bgPrimary; e.currentTarget.style.borderColor = colors.borderLight; e.currentTarget.style.color = colors.textSecondary }}
        >
          <ArrowLeft size={18} />
        </button>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flex: 1 }}>
          <div className="admin-page-icon">{isEdit ? <Pencil size={20} color="#fff" /> : <Gamepad2 size={20} color="#fff" />}</div>
          <div>
            <div style={{ fontSize: isEdit ? 13 : 22, fontWeight: isEdit ? 500 : 800, color: isEdit ? '#9ca3af' : colors.textPrimary, lineHeight: 1.2 }}>{isEdit ? 'แก้ไขเกม' : 'สร้างเกมใหม่'}</div>
            {isEdit && name && (
              <div style={{ fontSize: 20, fontWeight: 800, color: 'var(--theme-primary, #10B981)', lineHeight: 1.3 }}>{name}</div>
            )}
          </div>
        </div>
      </div>

      <div className="create-card" onChange={() => { if (isEdit) setIsDirty(true) }} onInput={() => { if (isEdit) setIsDirty(true) }} onClick={(e) => { if (isEdit && (e.target as HTMLElement).closest('button, [role="option"], label.toggle-label')) setIsDirty(true) }}>
        <div className="admin-form-row" style={{ position: 'relative', zIndex: 100 }}>
          <div className="admin-form-group">
            <label className="admin-f-label">เลือกประเภทเกม</label>
            <PrettySelect
              options={gameTypeOptions}
              value={type}
              onChange={(v) => setType(v as any)}
            />
          </div>
          <div className="admin-form-group">
            <label className="admin-f-label">ชื่อเกม</label>
            <input className="admin-f-control" placeholder="ชื่อเกม" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
        </div>

        {/* ส่วนเลือกสิทธิ์ USER เข้าเล่นเกม */}
        <div style={{ marginTop: 20 }}>
          <label className="admin-f-label">สิทธิ์การเข้าเล่น</label>

          <div style={{
            display: 'inline-flex',
            background: colors.bgSecondary,
            borderRadius: 10,
            padding: 3,
            gap: 2,
            border: `1px solid ${colors.borderLight}`,
          }}>
            {([
              { value: 'all' as const, label: 'USER ทั้งหมด', icon: Users },
              { value: 'selected' as const, label: 'ACTIVE USER', icon: UserCheck },
            ]).map((opt) => {
              const isActive = userAccessType === opt.value
              const IconComp = opt.icon
              return (
                <label
                  key={opt.value}
                  className="toggle-label"
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 6,
                    padding: '8px 16px',
                    borderRadius: 8,
                    background: isActive ? '#fff' : 'transparent',
                    color: isActive ? colors.primary : colors.textTertiary,
                    fontWeight: isActive ? 700 : 500,
                    fontSize: 13,
                    cursor: 'pointer',
                    transition: 'all 0.15s ease',
                    boxShadow: isActive ? `0 0 0 1.5px ${colors.primary}40, 0 1px 3px rgba(0,0,0,0.06)` : 'none',
                    position: 'relative',
                  }}
                >
                  <IconComp size={14} color={isActive ? colors.primary : colors.textTertiary} />
                  <input
                    type="radio"
                    name="userAccess"
                    value={opt.value}
                    checked={isActive}
                    onChange={(e) => setUserAccessType(e.target.value as 'all' | 'selected')}
                    style={{ position: 'absolute', opacity: 0, width: 0, height: 0 }}
                  />
                  {opt.label}
                </label>
              )
            })}
          </div>
          <div style={{ height: 16 }} />

          {/* ส่วนอัพโหลด USER เมื่อเลือก ACTIVE USER */}
          {userAccessType === 'selected' && (
            <div className="selected-users-section" style={{ 
              background: 'rgba(255,255,255,0.95)',
              padding: 20, 
              borderRadius: 12, 
              border: '1px solid rgba(255,255,255,0.2)',
              boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
              marginTop: 8
            }}>
              <div className="upload-section" style={{ marginBottom: 16 }}>
                <label className="upload-label" style={{ 
                  display: 'block', 
                  marginBottom: 8, 
                  fontWeight: 700,
                  color: '#1c2a22',
                  fontSize: 14
                }}>
                  อัพโหลดรายชื่อ USER
                </label>
                <input
                  id="user-file"
                  type="file"
                  accept=".txt,.csv"
                  onChange={(e) => importSelectedUsers(e.target.files?.[0])}
                  style={{ display: 'none' }}
                />
                <label
                  htmlFor="user-file"
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 12,
                    padding: '14px 18px',
                    borderRadius: 12,
                    border: `2px dashed ${selectedUsersFile ? colors.primary : colors.borderLight}`,
                    background: selectedUsersFile ? `${colors.primary}08` : colors.bgSecondary,
                    cursor: 'pointer',
                    transition: 'all 0.2s ease',
                    marginBottom: 8,
                  }}
                >
                  <div style={{
                    width: 40, height: 40, borderRadius: 10,
                    background: selectedUsersFile ? `${colors.primary}14` : `${colors.textSecondary}10`,
                    display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                  }}>
                    <FileText size={20} color={selectedUsersFile ? colors.primary : colors.textSecondary} />
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 14, fontWeight: 600, color: selectedUsersFile ? colors.primary : colors.textPrimary }}>
                      {selectedUsersFile ? selectedUsersFile.name : 'เลือกไฟล์รายชื่อ USER'}
                    </div>
                    <div style={{ fontSize: 12, color: colors.textSecondary, marginTop: 2 }}>
                      {selectedUsersFile
                        ? `${(selectedUsersFile.size / 1024).toFixed(1)} KB`
                        : '.txt หรือ .csv (หนึ่ง USER ต่อบรรทัด)'}
                    </div>
                  </div>
                  {!selectedUsersFile && (
                    <div style={{
                      padding: '6px 14px', borderRadius: 8,
                      background: colors.primary, color: '#fff',
                      fontSize: 13, fontWeight: 600, flexShrink: 0,
                      display: 'flex', alignItems: 'center', gap: 6,
                    }}>
                      <Upload size={14} /> เลือกไฟล์
                    </div>
                  )}
                </label>
              </div>

              {/* พรีวิว USER ที่เลือก */}
              {selectedUsers.length > 0 && (
                <div className="users-preview">
                  <div className="preview-header" style={{ 
                    display: 'flex', 
                    justifyContent: 'space-between', 
                    alignItems: 'center',
                    marginBottom: 12,
                    paddingBottom: 8,
                    borderBottom: '1px solid #e5e7eb'
                  }}>
                    <span className="preview-title" style={{ 
                      fontWeight: 700, 
                      color: '#1c2a22',
                      fontSize: 14
                    }}>
                      รายชื่อ USER ที่เลือก ({selectedUsers.length} รายการ)
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedUsers([])
                        setSelectedUsersFile(null)
                      }}
                      style={{
                        background: 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)',
                        color: 'white',
                        border: 'none',
                        padding: '6px 12px',
                        borderRadius: 6,
                        fontSize: 12,
                        fontWeight: 600,
                        cursor: 'pointer',
                        boxShadow: '0 2px 8px rgba(239, 68, 68, 0.3)',
                        transition: 'all 0.3s ease'
                      }}
                    >
                      ล้างรายการ
                    </button>
                  </div>
                  
                  <div className="users-list" style={{ 
                    maxHeight: 200, 
                    overflowY: 'auto',
                    background: 'rgba(248, 250, 252, 0.8)',
                    border: '1px solid #e5e7eb',
                    borderRadius: 8,
                    padding: 8
                  }}>
                    {selectedUsers.map((user, index) => (
                      <div key={index} className="user-item" style={{
                        padding: '8px 12px',
                        borderBottom: index < selectedUsers.length - 1 ? '1px solid #f1f5f9' : 'none',
                        fontSize: 14,
                        color: '#374151',
                        background: index % 2 === 0 ? 'rgba(255,255,255,0.5)' : 'transparent',
                        borderRadius: index === 0 ? '4px 4px 0 0' : index === selectedUsers.length - 1 ? '0 0 4px 4px' : '0',
                        fontWeight: 500
                      }}>
                        {user}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* เลือกรูปภาพ: เฉพาะประเภทที่ต้องใช้รูป */}
        {needImage(type) && (
          <div style={{ marginTop: 16 }}>
            <label className="admin-f-label">{isPartyMode ? 'คลังรูปภาพเกมปาร์ตี้ (อัปโหลดเข้าฐานข้อมูล):' : 'เลือกรูปภาพ (jpg/png):'}</label>
            {isPartyMode ? (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                {/* ===== ฝั่งซ้าย: รูปภาพ ===== */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  <div>
                    <input
                      id="party-image-upload"
                      type="file"
                      accept="image/*"
                      multiple
                      onChange={onUploadPartyImages}
                      style={{ display: 'none' }}
                    />
                    <label
                      htmlFor="party-image-upload"
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 12,
                        padding: '14px 18px',
                        borderRadius: 12,
                        border: `2px dashed ${partyImagePool.length > 0 ? colors.primary : colors.borderLight}`,
                        background: partyImagePool.length > 0 ? `${colors.primary}08` : colors.bgSecondary,
                        cursor: partyImagePoolUploading ? 'wait' : 'pointer',
                        transition: 'all 0.2s ease',
                        opacity: partyImagePoolUploading ? 0.7 : 1,
                      }}
                    >
                      <div style={{
                        width: 40, height: 40, borderRadius: 10,
                        background: partyImagePool.length > 0 ? `${colors.primary}14` : `${colors.textSecondary}10`,
                        display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                      }}>
                        {partyImagePoolUploading ? (
                          <Loader2 size={20} color={colors.primary} className="spin" />
                        ) : (
                          <Upload size={20} color={partyImagePool.length > 0 ? colors.primary : colors.textSecondary} />
                        )}
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 14, fontWeight: 600, color: partyImagePool.length > 0 ? colors.primary : colors.textPrimary }}>
                          {partyImagePoolUploading ? 'กำลังอัปโหลดรูปภาพ…' : 'อัปโหลดรูปภาพเข้าคลัง'}
                        </div>
                        <div style={{ fontSize: 12, color: colors.textSecondary, marginTop: 2 }}>
                          {partyImagePoolLoading
                            ? 'กำลังโหลดคลังจากฐานข้อมูล…'
                            : partyImagePool.length > 0
                              ? `มีรูปในคลัง ${partyImagePool.length} รูป — ใช้ร่วมกันทุกธีม (เลือกหลายไฟล์ได้)`
                              : 'เลือกได้หลายไฟล์ — รูปเก็บใน DB และใช้ร่วมกันทุกธีม'}
                        </div>
                      </div>
                      <div style={{
                        padding: '6px 14px', borderRadius: 8,
                        background: colors.primary, color: '#fff',
                        fontSize: 13, fontWeight: 600, flexShrink: 0,
                        display: 'flex', alignItems: 'center', gap: 6,
                      }}>
                        <Upload size={14} /> อัปโหลด
                      </div>
                    </label>
                  </div>

                  {/* สรุปคลังรูปภาพ (จาก DB) — ไม่แสดง preview เพื่อลดการโหลด */}
                  {partyImagePool.length > 0 && (
                    <div style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 10,
                      padding: '10px 12px',
                      borderRadius: 10,
                      border: '1px solid #e5e7eb',
                      background: '#fafbfc',
                    }}>
                      <div style={{
                        width: 32, height: 32, borderRadius: 8,
                        background: `${colors.primary}14`,
                        display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                      }}>
                        <ImageIcon size={16} color={colors.primary} />
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                          <span style={{ fontSize: 13, fontWeight: 700, color: '#334155' }}>
                            คลังรูปภาพ {partyImagePool.length} รูป
                          </span>
                          <span style={{
                            display: 'inline-flex', alignItems: 'center', gap: 4,
                            fontSize: 10, fontWeight: 700,
                            padding: '2px 8px', borderRadius: 999,
                            background: `${colors.primary}15`, color: colors.primary,
                            letterSpacing: 0.2,
                          }}>
                            <Sparkles size={10} /> ใช้ร่วมกันทุกธีม
                          </span>
                        </div>
                        <div className="admin-muted" style={{ fontSize: 11, marginTop: 2 }}>
                          กด "สุ่มรูป" ที่แต่ละรอบเพื่อหยิบรูปจากคลังนี้
                        </div>
                      </div>
                      <button
                        type="button"
                        className="btn-upload"
                        onClick={clearPartyImagePool}
                        disabled={partyImagePoolClearing}
                        style={{
                          fontSize: 12,
                          padding: '6px 10px',
                          background: '#ef4444',
                          color: '#fff',
                          border: 'none',
                          borderRadius: 8,
                          opacity: partyImagePoolClearing ? 0.7 : 1,
                          cursor: partyImagePoolClearing ? 'wait' : 'pointer',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 4,
                          flexShrink: 0,
                        }}
                        title="ล้างคลังรูปภาพทั้งหมด"
                      >
                        {partyImagePoolClearing ? (
                          <>
                            <Loader2 size={12} className="spin" /> กำลังล้าง…
                          </>
                        ) : (
                          <>
                            <Trash2 size={12} /> ล้างคลัง
                          </>
                        )}
                      </button>
                    </div>
                  )}

                  {/* ===== Toggle รูปแบบการแจกรูป: ภาพร่วม / สุ่มรายผู้เล่น ===== */}
                  <div style={{ display: 'grid', gap: 6 }}>
                    <label className="admin-f-label">รูปแบบการแจกรูป</label>
                    <div style={{
                      display: 'inline-flex',
                      background: colors.bgSecondary,
                      borderRadius: 10,
                      padding: 3,
                      gap: 2,
                      border: `1px solid ${colors.borderLight}`,
                    }}>
                      {([
                        { value: 'classic'     as PartyMode, label: 'ภาพร่วมต่อรอบ',     icon: Users, desc: 'ผู้เล่นทุกคนเห็นรูปและคำตอบเดียวกัน (ตั้งรูปต่อรอบ)' },
                        { value: 'random_pool' as PartyMode, label: 'สุ่มภาพรายผู้เล่น', icon: Dices, desc: 'สุ่มรูปจากคลังให้ผู้เล่นแต่ละคน คำตอบคือชื่อไฟล์ของรูปที่ได้รับ' },
                      ]).map((opt) => {
                        const isActive = partyMode === opt.value
                        const IconComp = opt.icon
                        return (
                          <label
                            key={opt.value}
                            className="toggle-label"
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: 6,
                              padding: '8px 16px',
                              borderRadius: 8,
                              background: isActive ? '#fff' : 'transparent',
                              color: isActive ? colors.primary : colors.textTertiary,
                              fontWeight: isActive ? 700 : 500,
                              fontSize: 13,
                              cursor: 'pointer',
                              transition: 'all 0.15s ease',
                              boxShadow: isActive ? `0 0 0 1.5px ${colors.primary}40, 0 1px 3px rgba(0,0,0,0.06)` : 'none',
                              position: 'relative',
                            }}
                            title={opt.desc}
                          >
                            <IconComp size={14} color={isActive ? colors.primary : colors.textTertiary} />
                            <input
                              type="radio"
                              name="partyMode"
                              value={opt.value}
                              checked={isActive}
                              onChange={(e) => setPartyMode(e.target.value as PartyMode)}
                              style={{ position: 'absolute', opacity: 0, width: 0, height: 0 }}
                            />
                            {opt.label}
                          </label>
                        )
                      })}
                    </div>
                    <div className="admin-muted" style={{ fontSize: 11, lineHeight: 1.5 }}>
                      {partyMode === 'random_pool'
                        ? 'สุ่มรูปจากคลังให้ผู้เล่นแต่ละคน คำตอบคือชื่อไฟล์ของรูปที่ได้รับ'
                        : 'ผู้เล่นทุกคนเห็นรูปและคำตอบเดียวกัน (ตั้งรูปต่อรอบ)'}
                    </div>
                  </div>

                  <div style={{ display: 'grid', gap: 8 }}>
                    <label className="admin-f-label">จำนวนรอบเกมปาร์ตี้</label>
                    <input
                      type="number"
                      min={1}
                      className="admin-f-control"
                      value={partyRoundsCount}
                      onChange={(e) => setPartyRoundsCount(Math.max(1, Number(e.target.value) || 1))}
                    />
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                    {partyRounds.map((round, idx) => (
                      <div key={`party-round-${idx}`} style={{ border: '1px solid #e5e7eb', borderRadius: 10, padding: 10, display: 'grid', gap: 6 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 6 }}>
                          <div style={{ fontWeight: 700, fontSize: 13 }}>รอบที่ {idx + 1}</div>
                          {partyMode === 'random_pool' && (
                            <span style={{
                              fontSize: 10, fontWeight: 700, padding: '2px 8px',
                              borderRadius: 999, background: `${colors.primary}14`, color: colors.primary,
                              display: 'inline-flex', alignItems: 'center', gap: 4,
                            }}>
                              <Dices size={11} /> สุ่มรายผู้เล่น
                            </span>
                          )}
                        </div>

                        {/* ===== ระบบเดิม: รูป + คำตอบต่อรอบ ===== */}
                        {partyMode === 'classic' && (
                          <>
                            <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
                              <button
                                type="button"
                                className="btn-upload"
                                onClick={() => randomPickFromPartyPool(idx)}
                                disabled={partyImagePool.length === 0}
                                style={{ opacity: partyImagePool.length === 0 ? 0.7 : 1, fontSize: 12, padding: '4px 10px' }}
                                title={partyImagePool.length === 0 ? 'อัปโหลดรูปเข้าคลังก่อน' : 'สุ่มรูปจากคลัง'}
                              >
                                สุ่มรูป
                              </button>
                              <span className="admin-muted" style={{ fontSize: 11 }}>
                                {round.fileName ? round.fileName : 'ยังไม่สุ่ม'}
                              </span>
                            </div>
                            {round.imageDataUrl ? (
                              <img
                                src={getImageUrl(round.imageDataUrl)}
                                alt={`party-round-${idx + 1}`}
                                className="admin-img-preview"
                                style={{ maxHeight: 160, objectFit: 'contain', borderRadius: 8 }}
                              />
                            ) : (
                              <div style={{ height: 80, background: '#f1f5f9', borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#94a3b8', fontSize: 12 }}>ไม่มีรูป</div>
                            )}
                          </>
                        )}

                        {/* ===== ระบบใหม่: ใช้คลังรวม ไม่ตั้งรูป/คำตอบรายรอบ ===== */}
                        {partyMode === 'random_pool' && (
                          <div style={{
                            padding: 10,
                            borderRadius: 8,
                            background: '#f8fafc',
                            border: '1px dashed #cbd5e1',
                            fontSize: 11,
                            color: '#64748b',
                            lineHeight: 1.5,
                          }}>
                            ผู้เล่นแต่ละคนจะถูกสุ่มรูปจากคลัง ({partyImagePool.length} รูป)
                            <br />
                            คำตอบคือ "ชื่อไฟล์" ของรูปที่ผู้เล่นได้รับ
                          </div>
                        )}

                        <div style={{ display: 'grid', gridTemplateColumns: partyMode === 'random_pool' ? '1fr' : '1fr auto', gap: 6, alignItems: 'start' }}>
                          {partyMode === 'classic' && (
                            <div>
                              <label className="admin-f-label" style={{ marginBottom: 2, fontSize: 11 }}>คำตอบ</label>
                              <input
                                className="admin-f-control"
                                placeholder="คำตอบ"
                                value={round.answer}
                                onChange={(e) => {
                                  const value = e.target.value
                                  setPartyRounds((prev) => {
                                    const next = [...prev]
                                    if (!next[idx]) next[idx] = createEmptyPartyRound(idx + 1)
                                    next[idx] = { ...next[idx], answer: value }
                                    return next
                                  })
                                }}
                                style={{ fontSize: 13 }}
                              />
                            </div>
                          )}
                          <div style={{ width: partyMode === 'random_pool' ? '100%' : 70 }}>
                            <label className="admin-f-label" style={{ marginBottom: 2, fontSize: 11 }}>CODE</label>
                            <input
                              type="number"
                              min={1}
                              className="admin-f-control"
                              value={round.codeCount}
                              onChange={(e) => {
                                const value = Math.max(1, Number(e.target.value) || 1)
                                setPartyRounds((prev) => {
                                  const next = [...prev]
                                  if (!next[idx]) next[idx] = createEmptyPartyRound(idx + 1)
                                  next[idx] = { ...next[idx], codeCount: value }
                                  return next
                                })
                              }}
                              style={{ fontSize: 13 }}
                            />
                            <div className="admin-muted" style={{ fontSize: 10, marginTop: 2 }}>
                              {partyRounds.slice(0, idx).reduce((sum, item) => sum + Math.max(1, Number(item.codeCount) || 1), 0) + 1}
                              -{partyRounds.slice(0, idx + 1).reduce((sum, item) => sum + Math.max(1, Number(item.codeCount) || 1), 0)}
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* ===== ฝั่งขวา: CODE ===== */}
                <div style={{ position: 'relative' }}>
                <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', gap: 10, overflow: 'hidden' }}>
                  <div style={{ flexShrink: 0 }}>
                    <button
                      type="button"
                      className="dropzone-btn"
                      onClick={() => {
                        const input = document.createElement('input')
                        input.type = 'file'
                        input.accept = '.csv,.txt,.xlsx,.xls'
                        input.onchange = async (e) => {
                          const file = (e.target as HTMLInputElement).files?.[0]
                          if (!file) return
                          try {
                            const newCodes = await parseCodesFromFile(file)
                            if (newCodes.length > 0) {
                              setCodes(newCodes)
                              setNumCodes(newCodes.length)
                              alert(`อัปโหลด CODE สำเร็จ ${newCodes.length} รายการ`)
                            } else {
                              alert('ไม่พบ CODE ที่ตรงเงื่อนไขในไฟล์')
                            }
                          } catch (error) {
                            console.error('Error loading file:', error)
                            alert('เกิดข้อผิดพลาดในการอ่านไฟล์')
                          }
                        }
                        input.click()
                      }}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 12,
                        padding: '14px 18px',
                        borderRadius: 12,
                        border: `2px dashed ${colors.borderLight}`,
                        background: colors.bgSecondary,
                        cursor: 'pointer',
                        transition: 'all 0.2s ease',
                        width: '100%',
                      }}
                    >
                      <div style={{
                        width: 40, height: 40, borderRadius: 10,
                        background: `${colors.textSecondary}10`,
                        display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                      }}>
                        <FileSpreadsheet size={20} color={colors.textSecondary} />
                      </div>
                      <div style={{ flex: 1, textAlign: 'left', minWidth: 0 }}>
                        <div style={{ fontSize: 14, fontWeight: 600, color: colors.textPrimary }}>เลือกไฟล์ CODE</div>
                        <div style={{ fontSize: 12, color: colors.textSecondary, marginTop: 2 }}>.csv, .txt, .xlsx</div>
                      </div>
                      <div style={{
                        padding: '6px 14px', borderRadius: 8,
                        background: colors.primary, color: '#fff',
                        fontSize: 13, fontWeight: 600, flexShrink: 0,
                        display: 'flex', alignItems: 'center', gap: 6,
                      }}>
                        <Upload size={14} /> เลือกไฟล์
                      </div>
                    </button>
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
                    <span style={{ fontSize: 13, fontWeight: 700, color: '#334155' }}>CODE ทั้งหมด {codes.length} รายการ</span>
                    <button
                      type="button"
                      className="btn-upload"
                      onClick={async () => {
                        if (!isEdit || !gameId) return
                        try {
                          const latestGame = (await getGameById(gameId, { forceServer: true }) || {}) as any
                          const nextClaimedMap: Record<string, string> = {}
                          const rootClaimedBy = latestGame?.claimedBy || latestGame?.gameData?.claimedBy || {}
                          for (const [userId, claim] of Object.entries(rootClaimedBy)) {
                            const claimObj = claim as any
                            const code = typeof claimObj === 'string' ? claimObj : (claimObj?.code || claimObj?.c || '')
                            const normalizedCode = String(code || '').trim()
                            if (normalizedCode) nextClaimedMap[normalizedCode] = userId
                          }
                          const partyRoundState = latestGame?.gameData?.partyRoundState || latestGame?.partyRoundState || {}
                          for (const state of Object.values(partyRoundState as Record<string, any>)) {
                            const roundClaimedBy = (state as any)?.claimedBy || {}
                            for (const [userId, claim] of Object.entries(roundClaimedBy)) {
                              const claimObj = claim as any
                              const code = typeof claimObj === 'string' ? claimObj : (claimObj?.code || claimObj?.c || '')
                              const normalizedCode = String(code || '').trim()
                              if (normalizedCode) nextClaimedMap[normalizedCode] = userId
                            }
                          }
                          setClaimedCodeUsers(nextClaimedMap)
                          alert('รีเฟรชรายการ CODE เรียบร้อยแล้ว')
                        } catch (error) {
                          console.error('Error refreshing code list:', error)
                          alert('รีเฟรชรายการ CODE ไม่สำเร็จ')
                        }
                      }}
                      disabled={!isEdit || !gameId}
                      style={{ minWidth: 36, width: 36, height: 32, padding: 0, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', opacity: !isEdit || !gameId ? 0.5 : 1, fontSize: 12 }}
                      title="รีเฟรชรายการ CODE"
                      aria-label="รีเฟรชรายการ CODE"
                    >
                      <RefreshCw size={14} />
                    </button>
                  </div>

                  <div style={{ flex: 1, minHeight: 0, border: '1px solid #e5e7eb', borderRadius: 10, background: '#fafbfc', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
                    <div style={{ flex: 1, overflowY: 'auto', padding: '6px 8px', display: 'grid', gap: 3, alignContent: 'start' }}>
                      {codes.length === 0 ? (
                        <div className="admin-muted" style={{ fontSize: 13, padding: 12, textAlign: 'center' }}>ยังไม่มี CODE</div>
                      ) : (
                        codes.map((code, codeIdx) => {
                          const isUsedCode = !!claimedCodeUsers[String(code || '').trim()]
                          const claimedUser = claimedCodeUsers[String(code || '').trim()] || ''
                          return (
                            <div
                              key={`party-code-${codeIdx}`}
                              style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: 6,
                                padding: '3px 0',
                                borderBottom: '1px solid #f1f5f9',
                              }}
                            >
                              <span style={{ fontSize: 11, fontWeight: 600, color: '#94a3b8', width: 28, textAlign: 'right', flexShrink: 0 }}>{codeIdx + 1}</span>
                              <span style={{ fontSize: 10, fontWeight: 600, color: '#2563eb', width: 24, flexShrink: 0 }}>R{partyCodeRoundLabels[codeIdx] || '-'}</span>
                              <input
                                className="admin-f-control"
                                value={code}
                                placeholder={`CODE`}
                                onChange={(e) => {
                                  const value = e.target.value
                                  setCodes((prev) => {
                                    const next = [...prev]
                                    next[codeIdx] = value
                                    return next
                                  })
                                }}
                                style={{
                                  margin: 0,
                                  flex: 1,
                                  minHeight: 28,
                                  height: 28,
                                  fontSize: 12,
                                  padding: '2px 8px',
                                  borderColor: isUsedCode ? '#fca5a5' : '#e5e7eb',
                                  color: isUsedCode ? '#b91c1c' : undefined,
                                  background: isUsedCode ? '#fff5f5' : '#fff',
                                }}
                              />
                              {claimedUser && (
                                <span style={{ fontSize: 10, fontWeight: 600, color: '#dc2626', flexShrink: 0, maxWidth: 80, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={claimedUser}>{claimedUser}</span>
                              )}
                            </div>
                          )
                        })
                      )}
                    </div>
                  </div>
                </div>
                </div>
              </div>
            ) : (
              <div>
                <input id="game-image" type="file" accept="image/*" onChange={onPickImage} style={{ display: 'none' }} />
                <label
                  htmlFor="game-image"
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 12,
                    padding: '14px 18px',
                    borderRadius: 12,
                    border: `2px dashed ${fileName ? colors.primary : colors.borderLight}`,
                    background: fileName ? `${colors.primary}08` : colors.bgSecondary,
                    cursor: 'pointer',
                    transition: 'all 0.2s ease',
                  }}
                >
                  <div style={{
                    width: 40, height: 40, borderRadius: 10,
                    background: fileName ? `${colors.primary}14` : `${colors.textSecondary}10`,
                    display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                  }}>
                    <FileImage size={20} color={fileName ? colors.primary : colors.textSecondary} />
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 14, fontWeight: 600, color: fileName ? colors.primary : colors.textPrimary }}>
                      {fileName || 'เลือกไฟล์รูปภาพ'}
                    </div>
                    <div style={{ fontSize: 12, color: colors.textSecondary, marginTop: 2 }}>
                      JPG, PNG, GIF, WebP
                    </div>
                  </div>
                  {!fileName && (
                    <div style={{
                      padding: '6px 14px', borderRadius: 8,
                      background: colors.primary, color: '#fff',
                      fontSize: 13, fontWeight: 600, flexShrink: 0,
                      display: 'flex', alignItems: 'center', gap: 6,
                    }}>
                      <Upload size={14} /> เลือกไฟล์
                    </div>
                  )}
                </label>
              </div>
            )}
            {imageDataUrl && !isPartyMode && (
              <img 
                src={imageDataUrl ? getImageUrl(imageDataUrl) : ''} 
                alt="preview" 
                className="admin-img-preview" 
                style={{ opacity: imageUploading ? 0.5 : 1 }}
              />
            )}
            {imageUploading && (
              <div style={{ 
                textAlign: 'center', 
                padding: '10px', 
                color: '#666',
                fontSize: '14px' 
              }}>
                กำลังอัปโหลดรูปภาพ...
              </div>
            )}
          </div>
        )}

        {/* เฉพาะเกมทายภาพ */}
        {showPuzzle && !isPartyMode && (
          <div className="admin-form-section">
            <div className="admin-form-group">
              <label className="admin-f-label">กำหนดคำตอบ</label>
              <input className="admin-f-control" placeholder="คำตอบที่ถูกต้อง" value={answer} onChange={(e) => setAnswer(e.target.value)} />
            </div>
          </div>
        )}

        {/* อัปโหลด/จัดการ CODE: ใช้กับ เกมทายภาพปริศนา, เกมลอยกระทง และ เกมป๊อกเด้ง */}
        {((showPuzzle && !isPartyMode) || type === 'เกมลอยกระทง' || type === 'เกมป๊อกเด้ง') && (
          <>
            <label className="admin-f-label">กำหนดจำนวน CODE ที่ต้องแจก</label>
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
              <input
                type="number"
                min={1}
                className="admin-f-control"
                value={numCodes}
                onChange={(e) => setNumCodes(Math.max(1, Number(e.target.value) || 1))}
                style={{ flex: 1 }}
              />
              <button
                type="button"
                className="dropzone-btn"
                onClick={() => {
                  const input = document.createElement('input')
                  input.type = 'file'
                  input.accept = '.csv,.txt,.xlsx'
                  input.onchange = async (e) => {
                    const file = (e.target as HTMLInputElement).files?.[0]
                    if (!file) return
                    
                    try {
                      const ext = (file.name.split('.').pop() || '').toLowerCase()
                      let newCodes: string[] = []
                      
                      if (ext === 'csv' || ext === 'txt') {
                        const text = await file.text()
                        const lines = text.split(/\r?\n/).filter(line => line.trim())
                        
                        for (const line of lines) {
                          const columns = line.split(',').map(col => col.trim().replace(/"/g, ''))
                          
                          if (columns.length >= 11) {
                            const serialCode = columns[4]
                            const colG = columns[6]
                            const colH = columns[7]
                            const colK = columns[10]
                            
                            if (serialCode && !colG && !colH && !colK) {
                              newCodes.push(serialCode)
                            }
                          }
                        }
                      } else if (ext === 'xlsx' || ext === 'xls') {
                        const buf = await file.arrayBuffer()
                        const wb = XLSX.read(new Uint8Array(buf), { type: 'array' })
                        const ws = wb.Sheets[wb.SheetNames[0]]
                        const rows = XLSX.utils.sheet_to_json(ws, { header: 1 }) as any[][]
                        
                        for (const row of rows) {
                          if (row.length >= 11) {
                            const serialCode = row[4]
                            const colG = row[6]
                            const colH = row[7]
                            const colK = row[10]
                            
                            if (serialCode && !colG && !colH && !colK) {
                              newCodes.push(String(serialCode).trim())
                            }
                          }
                        }
                      } else {
                        alert('รองรับเฉพาะไฟล์ .csv, .txt, .xlsx, .xls')
                        return
                      }
                      
                      if (newCodes.length > 0) {
                        setCodes(newCodes)
                        setNumCodes(newCodes.length)
                        alert(`อัปโหลด CODE สำเร็จ ${newCodes.length} รายการ`)
                      } else {
                        alert('ไม่พบ CODE ที่ตรงเงื่อนไขในไฟล์\nตรวจสอบคอลัมน์ E (serialcode) และคอลัมน์ G, H, K ต้องว่าง')
                      }
                    } catch (error) {
                      console.error('Error loading file:', error)
                      alert('เกิดข้อผิดพลาดในการอ่านไฟล์')
                    }
                  }
                  input.click()
                }}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 12,
                  padding: '14px 18px',
                  borderRadius: 12,
                  border: `2px dashed ${colors.borderLight}`,
                  background: colors.bgSecondary,
                  cursor: 'pointer',
                  transition: 'all 0.2s ease',
                  minWidth: 160,
                }}
              >
                <div style={{
                  width: 40, height: 40, borderRadius: 10,
                  background: `${colors.textSecondary}10`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                }}>
                  <FileSpreadsheet size={20} color={colors.textSecondary} />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 600, color: colors.textPrimary }}>เลือกไฟล์ CODE</div>
                  <div style={{ fontSize: 12, color: colors.textSecondary, marginTop: 2 }}>.csv, .txt, .xlsx</div>
                </div>
                <div style={{
                  padding: '6px 14px', borderRadius: 8,
                  background: colors.primary, color: '#fff',
                  fontSize: 13, fontWeight: 600, flexShrink: 0,
                  display: 'flex', alignItems: 'center', gap: 6,
                }}>
                  <Upload size={14} /> เลือกไฟล์
                </div>
              </button>
            </div>
            {/* รายการโค้ดทั้งหมดพร้อมแทบเลื่อน */}
            <div style={{
              marginTop: 8,
              maxHeight: 300,
              overflowY: 'auto',
              border: '1px solid #e5e7eb',
              borderRadius: '8px',
              padding: '12px',
              background: '#f9fafb',
              boxShadow: 'inset 0 1px 3px rgba(0, 0, 0, 0.1)'
            }}>
              <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: '12px',
                paddingBottom: '8px',
                borderBottom: '1px solid #e5e7eb'
              }}>
                <div style={{
                  fontSize: '14px',
                  fontWeight: '600',
                  color: '#374151'
                }}>
                  รายการโค้ดทั้งหมด ({codes.length} รายการ)
                </div>
                <div style={{
                  fontSize: '12px',
                  color: '#6b7280',
                  background: '#e5e7eb',
                  padding: '2px 8px',
                  borderRadius: '12px'
                }}>
                  แทบเลื่อนลง
                </div>
              </div>
              
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {codes.map((c, i) => {
                  // ✅ ตรวจสอบว่าโค้ดนี้ถูกใช้ไปแล้วหรือไม่ (รองรับหลายรูปแบบของ claimedBy)
                  const isUsed = Object.values(claimedBy).some(claim => {
                    if (!claim) return false
                    // รองรับทั้ง object { code, claimedAt } และ string (backward compatibility)
                    if (typeof claim === 'object' && claim !== null) {
                      const claimObj = claim as { code?: string; c?: string }
                      return claimObj.code === c || claimObj.c === c
                    }
                    if (typeof claim === 'string') {
                      return claim === c
                    }
                    return false
                  })
                  
                  return (
                    <div key={i} style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '12px',
                      padding: '8px 12px',
                      background: isUsed 
                        ? 'linear-gradient(135deg, #fef2f2 0%, #fee2e2 100%)' 
                        : '#ffffff',
                      border: isUsed 
                        ? '2px solid #fecaca' 
                        : '1px solid #e5e7eb',
                      borderRadius: '6px',
                      boxShadow: isUsed 
                        ? '0 2px 4px rgba(239, 68, 68, 0.1)' 
                        : '0 1px 2px rgba(0, 0, 0, 0.05)',
                      opacity: isUsed ? 0.7 : 1,
                      position: 'relative'
                    }}>
                      <div style={{
                        minWidth: '80px',
                        fontSize: '12px',
                        fontWeight: '600',
                        color: isUsed ? '#dc2626' : '#6b7280',
                        background: isUsed ? '#fecaca' : '#f3f4f6',
                        padding: '4px 8px',
                        borderRadius: '4px',
                        textAlign: 'center'
                      }}>
                        CODE {i + 1}
                      </div>
                      <input
                        className="admin-f-control"
                        placeholder={`CODE ลำดับที่ ${i + 1}`}
                        value={c}
                        onChange={(e) => {
                          const v = e.target.value
                          setCodes((prev) => {
                            const next = [...prev]; next[i] = v; return next
                          })
                        }}
                        style={{
                          flex: 1,
                          border: isUsed ? '1px solid #fca5a5' : '1px solid #d1d5db',
                          borderRadius: '6px',
                          padding: '8px 12px',
                          fontSize: '14px',
                          background: isUsed ? '#fef2f2' : '#ffffff',
                          color: isUsed ? '#991b1b' : '#374151',
                          textDecoration: isUsed ? 'line-through' : 'none'
                        }}
                        disabled={isUsed}
                      />
                      {isUsed && (
                        <div style={{
                          position: 'absolute',
                          top: '-2px',
                          right: '-2px',
                          background: '#dc2626',
                          color: 'white',
                          fontSize: '10px',
                          fontWeight: '700',
                          padding: '2px 6px',
                          borderRadius: '10px',
                          boxShadow: '0 1px 3px rgba(0, 0, 0, 0.2)'
                        }}>
                          ใช้แล้ว
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>

          </>
        )}

        {/* อัปโหลด/จัดการ CODE รางวัลใหญ่: เฉพาะเกมลอยกระทง */}
        {type === 'เกมลอยกระทง' && (
          <>
            <label className="admin-f-label">กำหนดจำนวน CODE รางวัลใหญ่</label>
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
              <input
                type="number"
                min={1}
                className="admin-f-control"
                value={numBigPrizeCodes}
                onChange={(e) => setNumBigPrizeCodes(Math.max(1, Number(e.target.value) || 1))}
                style={{ flex: 1 }}
              />
              <button
                type="button"
                className="dropzone-btn"
                onClick={() => {
                  const input = document.createElement('input')
                  input.type = 'file'
                  input.accept = '.csv,.txt,.xlsx'
                  input.onchange = async (e) => {
                    const file = (e.target as HTMLInputElement).files?.[0]
                    if (!file) return
                    
                    try {
                      const ext = (file.name.split('.').pop() || '').toLowerCase()
                      let newCodes: string[] = []
                      
                      if (ext === 'csv' || ext === 'txt') {
                        const text = await file.text()
                        const lines = text.split(/\r?\n/).filter(line => line.trim())
                        
                        for (const line of lines) {
                          const columns = line.split(',').map(col => col.trim().replace(/"/g, ''))
                          
                          if (columns.length >= 11) {
                            const serialCode = columns[4]
                            const colG = columns[6]
                            const colH = columns[7]
                            const colK = columns[10]
                            
                            if (serialCode && !colG && !colH && !colK) {
                              newCodes.push(serialCode)
                            }
                          }
                        }
                      } else if (ext === 'xlsx' || ext === 'xls') {
                        const buf = await file.arrayBuffer()
                        const wb = XLSX.read(new Uint8Array(buf), { type: 'array' })
                        const ws = wb.Sheets[wb.SheetNames[0]]
                        const rows = XLSX.utils.sheet_to_json(ws, { header: 1 }) as any[][]
                        
                        for (const row of rows) {
                          if (row.length >= 11) {
                            const serialCode = row[4]
                            const colG = row[6]
                            const colH = row[7]
                            const colK = row[10]
                            
                            if (serialCode && !colG && !colH && !colK) {
                              newCodes.push(String(serialCode).trim())
                            }
                          }
                        }
                      } else {
                        alert('รองรับเฉพาะไฟล์ .csv, .txt, .xlsx, .xls')
                        return
                      }
                      
                      if (newCodes.length > 0) {
                        setBigPrizeCodes(newCodes)
                        setNumBigPrizeCodes(newCodes.length)
                        alert(`อัปโหลด CODE รางวัลใหญ่สำเร็จ ${newCodes.length} รายการ`)
                      } else {
                        alert('ไม่พบ CODE ที่ตรงเงื่อนไขในไฟล์\nตรวจสอบคอลัมน์ E (serialcode) และคอลัมน์ G, H, K ต้องว่าง')
                      }
                    } catch (error) {
                      console.error('Error loading file:', error)
                      alert('เกิดข้อผิดพลาดในการอ่านไฟล์')
                    }
                  }
                  input.click()
                }}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 12,
                  padding: '14px 18px',
                  borderRadius: 12,
                  border: `2px dashed ${colors.borderLight}`,
                  background: colors.bgSecondary,
                  cursor: 'pointer',
                  transition: 'all 0.2s ease',
                  minWidth: 160,
                }}
              >
                <div style={{
                  width: 40, height: 40, borderRadius: 10,
                  background: `${colors.textSecondary}10`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                }}>
                  <Trophy size={20} color={colors.textSecondary} />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 600, color: colors.textPrimary }}>เลือกไฟล์ CODE รางวัลใหญ่</div>
                  <div style={{ fontSize: 12, color: colors.textSecondary, marginTop: 2 }}>.csv, .txt, .xlsx</div>
                </div>
                <div style={{
                  padding: '6px 14px', borderRadius: 8,
                  background: '#f59e0b', color: '#fff',
                  fontSize: 13, fontWeight: 600, flexShrink: 0,
                  display: 'flex', alignItems: 'center', gap: 6,
                }}>
                  <Upload size={14} /> เลือกไฟล์
                </div>
              </button>
            </div>
            
            {/* รายการโค้ดรางวัลใหญ่ทั้งหมดพร้อมแทบเลื่อน */}
            <div style={{
              marginTop: 8,
              maxHeight: 300,
              overflowY: 'auto',
              border: '1px solid #e5e7eb',
              borderRadius: '8px',
              padding: '12px',
              background: '#f9fafb',
              boxShadow: 'inset 0 1px 3px rgba(0, 0, 0, 0.1)'
            }}>
              <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: '12px',
                paddingBottom: '8px',
                borderBottom: '1px solid #e5e7eb'
              }}>
                <div style={{
                  fontSize: '14px',
                  fontWeight: '700',
                  color: '#f59e0b',
                  textShadow: '0 1px 2px rgba(0, 0, 0, 0.1)'
                }}>
                  <Trophy size={14} style={{display:'inline',verticalAlign:'text-bottom'}} /> รายการโค้ดรางวัลใหญ่ ({bigPrizeCodes.length} รายการ)
                </div>
                <div style={{
                  fontSize: '12px',
                  color: '#6b7280',
                  fontStyle: 'italic'
                }}>
                  แทบเลื่อนลง
                </div>
              </div>
              
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {bigPrizeCodes.map((c, i) => {
                  // ✅ ตรวจสอบว่าโค้ดนี้ถูกใช้ไปแล้วหรือไม่ (รองรับหลายรูปแบบของ claimedBy)
                  const isUsed = Object.values(claimedBy).some(claim => {
                    if (!claim) return false
                    // รองรับทั้ง object { code, claimedAt } และ string (backward compatibility)
                    if (typeof claim === 'object' && claim !== null) {
                      const claimObj = claim as { code?: string; c?: string }
                      return claimObj.code === c || claimObj.c === c
                    }
                    if (typeof claim === 'string') {
                      return claim === c
                    }
                    return false
                  })
                  
                  return (
                    <div key={i} style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '12px',
                      padding: '8px 12px',
                      background: isUsed 
                        ? 'linear-gradient(135deg, #fef2f2 0%, #fee2e2 100%)' 
                        : '#ffffff',
                      border: isUsed 
                        ? '2px solid #fecaca' 
                        : '1px solid #f59e0b',
                      borderRadius: '6px',
                      boxShadow: isUsed 
                        ? '0 2px 4px rgba(239, 68, 68, 0.1)' 
                        : '0 1px 2px rgba(245, 158, 11, 0.05)',
                      opacity: isUsed ? 0.7 : 1,
                      position: 'relative'
                    }}>
                      <div style={{
                        fontSize: '12px',
                        fontWeight: '700',
                        color: '#f59e0b',
                        background: 'linear-gradient(135deg, #fef3c7 0%, #fde68a 100%)',
                        padding: '4px 8px',
                        borderRadius: '4px',
                        border: '1px solid #f59e0b',
                        minWidth: '60px',
                        textAlign: 'center',
                        boxShadow: '0 1px 2px rgba(245, 158, 11, 0.2)'
                      }}>
                        CODE {i + 1}
                      </div>
                      <input
                        className="admin-f-control"
                        placeholder={`CODE รางวัลใหญ่ ลำดับที่ ${i + 1}`}
                        value={c}
                        onChange={(e) => {
                          const v = e.target.value
                          setBigPrizeCodes((prev) => {
                            const next = [...prev]; next[i] = v; return next
                          })
                        }}
                        style={{
                          flex: 1,
                          border: isUsed ? '1px solid #fca5a5' : '1px solid #f59e0b',
                          borderRadius: '6px',
                          padding: '8px 12px',
                          fontSize: '14px',
                          background: isUsed ? '#fef2f2' : '#ffffff',
                          color: isUsed ? '#991b1b' : '#374151',
                          textDecoration: isUsed ? 'line-through' : 'none'
                        }}
                        disabled={isUsed}
                      />
                      {isUsed && (
                        <div style={{
                          position: 'absolute',
                          top: '-2px',
                          right: '-2px',
                          background: '#dc2626',
                          color: 'white',
                          fontSize: '10px',
                          fontWeight: '700',
                          padding: '2px 6px',
                          borderRadius: '10px',
                          boxShadow: '0 1px 3px rgba(0, 0, 0, 0.2)'
                        }}>
                          ใช้แล้ว
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
            
            {/* ข้อมูลระบบรางวัลใหญ่ */}
            <div style={{ marginTop: '16px', padding: '16px', background: 'rgba(245, 158, 11, 0.1)', borderRadius: '12px', border: '1px solid #f59e0b' }}>
              <div style={{
                fontSize: '14px',
                fontWeight: '700',
                color: '#f59e0b',
                marginBottom: '8px',
                textAlign: 'center'
              }}>
                <Trophy size={14} style={{display:'inline',verticalAlign:'text-bottom'}} /> ระบบรางวัลใหญ่
              </div>
              <div style={{
                fontSize: '12px',
                color: '#6b7280',
                textAlign: 'center',
                lineHeight: '1.4'
              }}>
                ทุกๆ USER ที่ 20 จะได้รับรางวัลใหญ่<br/>
                (USER ที่ 20, 40, 60, 80, 100...)
              </div>
            </div>
          </>
        )}


        {/* เฉพาะเกมทายเบอร์เงิน */}
        {type === 'เกมทายเบอร์เงิน' && (
          <div className="admin-form-group" style={{ marginTop: 4, maxWidth: '50%' }}>
            <label className="admin-f-label">กำหนดหมดเวลา</label>
            <input type="datetime-local" className="admin-f-control" value={endAt} onChange={(e) => setEndAt(e.target.value)} />
          </div>
        )}

        {/* เฉพาะเกมทายผลบอล */}
        {type === 'เกมทายผลบอล' && (
          <div style={{ display: 'grid', gap: 14, marginTop: 16 }}>
            <div className="admin-form-row">
              <div className="admin-form-group">
                <label className="admin-f-label">ทีมเหย้า</label>
                <input className="admin-f-control" placeholder="ชื่อทีมเหย้า" value={homeTeam} onChange={(e)=>setHomeTeam(e.target.value)} />
              </div>
              <div className="admin-form-group">
                <label className="admin-f-label">ทีมเยือน</label>
                <input className="admin-f-control" placeholder="ชื่อทีมเยือน" value={awayTeam} onChange={(e)=>setAwayTeam(e.target.value)} />
              </div>
            </div>
            <div className="admin-form-group" style={{ maxWidth: '50%' }}>
              <label className="admin-f-label">กำหนดหมดเวลา</label>
              <input type="datetime-local" className="admin-f-control" value={endAt} onChange={(e) => setEndAt(e.target.value)} />
            </div>
          </div>
        )}

        {/* เฉพาะเกมบอลโลก */}
        {type === 'เกมบอลโลก' && (
          <div style={{ display: 'grid', gap: 14, marginTop: 16 }}>
            <div
              style={{
                padding: '16px 18px',
                background: 'linear-gradient(135deg, rgba(13, 37, 80, 0.06) 0%, rgba(200, 16, 46, 0.06) 100%)',
                border: '1px solid rgba(13, 37, 80, 0.18)',
                borderRadius: 12,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                <Globe size={18} color="#c8102e" />
                <div style={{ fontWeight: 800, fontSize: 14, color: '#0d2550' }}>FIFA World Cup 2026</div>
              </div>
              <div style={{ fontSize: 12, color: '#475569', lineHeight: 1.55 }}>
                ผู้เล่นจะเห็นตารางแข่งขัน 104 นัด พร้อมเวลาไทย (UTC+7) และสามารถทายสกอร์ของแต่ละคู่ได้
                <br />
                <b>การปิดรับทายเกิดขึ้นอัตโนมัติ</b> เมื่อถึงเวลาเริ่มเตะของแต่ละคู่ — ผู้เล่นจะแก้ไขสกอร์คู่นั้นไม่ได้อีก
                <br />
                เมื่อแอดมินกรอกผลที่ถูกต้องแล้ว ผู้ที่ทายตรงจะได้รับรหัสรางวัลที่ระบุไว้รายคู่
              </div>
            </div>
          </div>
        )}

        {/* เฉพาะเกมสล็อต */}
        {type === 'เกมสล็อต' && (
          <>
            <div className="admin-form-row">
              <div className="admin-form-group">
                <label className="admin-f-label">เครดิตเริ่มต้น</label>
                <input
                  type="number"
                  className="admin-f-control"
                  value={slot.startCredit}
                  onChange={(e)=>setSlot(s=>({...s, startCredit:Number(e.target.value)||0}))}
                />
              </div>
              <div className="admin-form-group">
                <label className="admin-f-label">BET เริ่มต้น</label>
                <input
                  type="number"
                  className="admin-f-control"
                  value={slot.startBet}
                  onChange={(e)=>setSlot(s=>({...s, startBet:Number(e.target.value)||0}))}
                />
              </div>
            </div>
            <div className="admin-form-row">
              <div className="admin-form-group">
                <label className="admin-f-label">อัตราชนะ (%)</label>
                <input
                  type="number"
                  className="admin-f-control"
                  value={slot.winRate}
                  onChange={(e)=>setSlot(s=>({...s, winRate:Number(e.target.value)||0}))}
                />
              </div>
              <div className="admin-form-group">
                <label className="admin-f-label">เป้าเครดิต</label>
                <input
                  type="number"
                  className="admin-f-control"
                  value={slot.targetCredit}
                  onChange={(e)=>setSlot(s=>({...s, targetCredit:Number(e.target.value)||0}))}
                />
              </div>
            </div>

          </>
        )}

        {/* เฉพาะเกมลุ้นรางวัลพิเศษ */}
        {type === 'เกมลุ้นรางวัลพิเศษ' && (
          <>
            <label className="admin-f-label">กำหนดโอกาสชนะ (%)</label>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 8, alignItems: 'center' }}>
              <input
                type="range"
                min={0}
                max={100}
                step={5}
                className="admin-f-control"
                value={trickOrTreatWinChance}
                onChange={(e) => setTrickOrTreatWinChance(Number(e.target.value))}
                style={{ marginRight: 12 }}
              />
              <div style={{ 
                minWidth: 60, 
                textAlign: 'center', 
                fontWeight: 'bold', 
                color: '#ff6b35',
                fontSize: 18 
              }}>
                {trickOrTreatWinChance}%
              </div>
            </div>
            <div style={{ 
              fontSize: 14, 
              color: '#666', 
              marginBottom: 16,
              textAlign: 'center',
              padding: 8,
              background: '#f8f9fa',
              borderRadius: 6
            }}>
              ผู้เล่นมีโอกาส {trickOrTreatWinChance}% ที่จะได้รับโค้ดรางวัล
            </div>

            {/* ✅ อัปโหลดรูปภาพการ์ด 3 แบบ */}
            <label className="admin-f-label" style={{ marginTop: 16 }}>รูปภาพการ์ด (แสดงหน้าเกม)</label>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 16 }}>
              {/* การ์ด 1 - การ์ดปก */}
              <div style={{ 
                border: '2px dashed #ddd', 
                borderRadius: 8, 
                padding: 12, 
                textAlign: 'center',
                background: cardImage1 ? '#f9fafb' : '#fff'
              }}>
                <div style={{ fontSize: 12, fontWeight: 'bold', marginBottom: 8, color: '#666' }}>
                  การ์ดปก (ก่อนเลือก)
                </div>
                {cardImage1 ? (
                  <div style={{ position: 'relative' }}>
                    <img 
                      src={cardImage1} 
                      alt="Card 1" 
                      style={{ 
                        width: '100%', 
                        height: 120, 
                        objectFit: 'contain',
                        borderRadius: 4,
                        opacity: cardImage1Uploading ? 0.5 : 1
                      }} 
                      onError={(e) => {
                        console.error('[CreateGame] Error loading card image 1:', cardImage1)
                        // Fallback: try original URL if converted URL fails
                        if (cardImage1 !== originalCardImage1Url && originalCardImage1Url) {
                          (e.target as HTMLImageElement).src = originalCardImage1Url
                        }
                      }}
                    />
                    {cardImage1Uploading && (
                      <div style={{ 
                        position: 'absolute', 
                        top: '50%', 
                        left: '50%', 
                        transform: 'translate(-50%, -50%)',
                        fontSize: 12,
                        color: '#666'
                      }}>
                        กำลังอัปโหลด...
                      </div>
                    )}
                    <button
                      type="button"
                      onClick={() => {
                        setCardImage1('')
                        setCardImage1File(null)
                        setOriginalCardImage1Url('')
                      }}
                      style={{
                        marginTop: 8,
                        padding: '4px 8px',
                        fontSize: 11,
                        background: '#ef4444',
                        color: 'white',
                        border: 'none',
                        borderRadius: 4,
                        cursor: 'pointer'
                      }}
                    >
                      ลบ
                    </button>
                  </div>
                ) : (
                  <label style={{ 
                    display: 'flex', 
                    flexDirection: 'column',
                    alignItems: 'center',
                    gap: 6,
                    cursor: 'pointer',
                    padding: '16px 8px',
                    background: colors.bgSecondary,
                    border: `2px dashed ${colors.borderLight}`,
                    borderRadius: 8,
                    transition: 'all 0.2s ease',
                  }}>
                    <input
                      type="file"
                      accept="image/*"
                      style={{ display: 'none' }}
                      onChange={(e) => {
                        const file = e.target.files?.[0]
                        if (file) {
                          setCardImage1File(file)
                          const url = URL.createObjectURL(file)
                          setCardImage1(url)
                        }
                      }}
                    />
                    <FileImage size={24} color={colors.textSecondary} />
                    <span style={{ fontSize: 11, fontWeight: 600, color: colors.textSecondary }}>เลือกรูป</span>
                  </label>
                )}
              </div>

              {/* การ์ด 2 - การ์ดชนะ */}
              <div style={{ 
                border: '2px dashed #ddd', 
                borderRadius: 8, 
                padding: 12, 
                textAlign: 'center',
                background: cardImage2 ? '#f9fafb' : '#fff'
              }}>
                <div style={{ fontSize: 12, fontWeight: 'bold', marginBottom: 8, color: '#666' }}>
                  การ์ดชนะ
                </div>
                {cardImage2 ? (
                  <div style={{ position: 'relative' }}>
                    <img 
                      src={cardImage2} 
                      alt="Card 2" 
                      style={{ 
                        width: '100%', 
                        height: 120, 
                        objectFit: 'contain',
                        borderRadius: 4,
                        opacity: cardImage2Uploading ? 0.5 : 1
                      }} 
                      onError={(e) => {
                        console.error('[CreateGame] Error loading card image 2:', cardImage2)
                        // Fallback: try original URL if converted URL fails
                        if (cardImage2 !== originalCardImage2Url && originalCardImage2Url) {
                          (e.target as HTMLImageElement).src = originalCardImage2Url
                        }
                      }}
                    />
                    {cardImage2Uploading && (
                      <div style={{ 
                        position: 'absolute', 
                        top: '50%', 
                        left: '50%', 
                        transform: 'translate(-50%, -50%)',
                        fontSize: 12,
                        color: '#666'
                      }}>
                        กำลังอัปโหลด...
                      </div>
                    )}
                    <button
                      type="button"
                      onClick={() => {
                        setCardImage2('')
                        setCardImage2File(null)
                        setOriginalCardImage2Url('')
                      }}
                      style={{
                        marginTop: 8,
                        padding: '4px 8px',
                        fontSize: 11,
                        background: '#ef4444',
                        color: 'white',
                        border: 'none',
                        borderRadius: 4,
                        cursor: 'pointer'
                      }}
                    >
                      ลบ
                    </button>
                  </div>
                ) : (
                  <label style={{ 
                    display: 'flex', 
                    flexDirection: 'column',
                    alignItems: 'center',
                    gap: 6,
                    cursor: 'pointer',
                    padding: '16px 8px',
                    background: colors.bgSecondary,
                    border: `2px dashed ${colors.borderLight}`,
                    borderRadius: 8,
                    transition: 'all 0.2s ease',
                  }}>
                    <input
                      type="file"
                      accept="image/*"
                      style={{ display: 'none' }}
                      onChange={(e) => {
                        const file = e.target.files?.[0]
                        if (file) {
                          setCardImage2File(file)
                          const url = URL.createObjectURL(file)
                          setCardImage2(url)
                        }
                      }}
                    />
                    <FileImage size={24} color={colors.textSecondary} />
                    <span style={{ fontSize: 11, fontWeight: 600, color: colors.textSecondary }}>เลือกรูป</span>
                  </label>
                )}
              </div>

              {/* การ์ด 3 - การ์ดแพ้ */}
              <div style={{ 
                border: '2px dashed #ddd', 
                borderRadius: 8, 
                padding: 12, 
                textAlign: 'center',
                background: cardImage3 ? '#f9fafb' : '#fff'
              }}>
                <div style={{ fontSize: 12, fontWeight: 'bold', marginBottom: 8, color: '#666' }}>
                  การ์ดแพ้
                </div>
                {cardImage3 ? (
                  <div style={{ position: 'relative' }}>
                    <img 
                      src={cardImage3} 
                      alt="Card 3" 
                      style={{ 
                        width: '100%', 
                        height: 120, 
                        objectFit: 'contain',
                        borderRadius: 4,
                        opacity: cardImage3Uploading ? 0.5 : 1
                      }} 
                      onError={(e) => {
                        console.error('[CreateGame] Error loading card image 3:', cardImage3)
                        // Fallback: try original URL if converted URL fails
                        if (cardImage3 !== originalCardImage3Url && originalCardImage3Url) {
                          (e.target as HTMLImageElement).src = originalCardImage3Url
                        }
                      }}
                    />
                    {cardImage3Uploading && (
                      <div style={{ 
                        position: 'absolute', 
                        top: '50%', 
                        left: '50%', 
                        transform: 'translate(-50%, -50%)',
                        fontSize: 12,
                        color: '#666'
                      }}>
                        กำลังอัปโหลด...
                      </div>
                    )}
                    <button
                      type="button"
                      onClick={() => {
                        setCardImage3('')
                        setCardImage3File(null)
                        setOriginalCardImage3Url('')
                      }}
                      style={{
                        marginTop: 8,
                        padding: '4px 8px',
                        fontSize: 11,
                        background: '#ef4444',
                        color: 'white',
                        border: 'none',
                        borderRadius: 4,
                        cursor: 'pointer'
                      }}
                    >
                      ลบ
                    </button>
                  </div>
                ) : (
                  <label style={{ 
                    display: 'flex', 
                    flexDirection: 'column',
                    alignItems: 'center',
                    gap: 6,
                    cursor: 'pointer',
                    padding: '16px 8px',
                    background: colors.bgSecondary,
                    border: `2px dashed ${colors.borderLight}`,
                    borderRadius: 8,
                    transition: 'all 0.2s ease',
                  }}>
                    <input
                      type="file"
                      accept="image/*"
                      style={{ display: 'none' }}
                      onChange={(e) => {
                        const file = e.target.files?.[0]
                        if (file) {
                          setCardImage3File(file)
                          const url = URL.createObjectURL(file)
                          setCardImage3(url)
                        }
                      }}
                    />
                    <FileImage size={24} color={colors.textSecondary} />
                    <span style={{ fontSize: 11, fontWeight: 600, color: colors.textSecondary }}>เลือกรูป</span>
                  </label>
                )}
              </div>
            </div>
            <div style={{ 
              fontSize: 12, 
              color: '#666', 
              marginBottom: 16,
              padding: 8,
              background: '#f0f9ff',
              borderRadius: 6,
              border: '1px solid #bae6fd'
            }}>
              <Lightbulb size={14} /> รูปภาพการ์ดจะถูกบันทึกแยกจากข้อมูลเกม เมื่อลบเกม รูปภาพจะไม่ถูกลบ (จะเป็นรูปล่าสุดที่อัปโหลดไว้)
            </div>

            <label className="admin-f-label">กำหนดจำนวน CODE ที่ต้องแจก</label>
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
              <input
                type="number"
                min={1}
                className="admin-f-control"
                value={numCodes}
                onChange={(e) => setNumCodes(Math.max(1, Number(e.target.value) || 1))}
                style={{ flex: 1 }}
              />
              <button
                type="button"
                className="dropzone-btn"
                onClick={() => {
                  const input = document.createElement('input')
                  input.type = 'file'
                  input.accept = '.csv,.txt,.xlsx'
                  input.onchange = async (e) => {
                    const file = (e.target as HTMLInputElement).files?.[0]
                    if (!file) return
                    
                    try {
                      const codes = await parseCodesFromFile(file)
                      if (codes.length > 0) {
                        setCodes(codes)
                        setNumCodes(codes.length)
                        alert(`อัปโหลด CODE สำเร็จ ${codes.length} รายการ`)
                      } else {
                        alert('ไม่พบ CODE ที่ตรงเงื่อนไขในไฟล์\nตรวจสอบคอลัมน์ E (serialcode) และคอลัมน์ G, H, K ต้องว่าง')
                      }
                    } catch (error) {
                      console.error('Error loading file:', error)
                      alert('เกิดข้อผิดพลาดในการอ่านไฟล์')
                    }
                  }
                  input.click()
                }}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 12,
                  padding: '14px 18px',
                  borderRadius: 12,
                  border: `2px dashed ${colors.borderLight}`,
                  background: colors.bgSecondary,
                  cursor: 'pointer',
                  transition: 'all 0.2s ease',
                  minWidth: 160,
                }}
              >
                <div style={{
                  width: 40, height: 40, borderRadius: 10,
                  background: `${colors.textSecondary}10`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                }}>
                  <FileSpreadsheet size={20} color={colors.textSecondary} />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 600, color: colors.textPrimary }}>เลือกไฟล์ CODE</div>
                  <div style={{ fontSize: 12, color: colors.textSecondary, marginTop: 2 }}>.csv, .txt, .xlsx</div>
                </div>
                <div style={{
                  padding: '6px 14px', borderRadius: 8,
                  background: '#ff6b35', color: '#fff',
                  fontSize: 13, fontWeight: 600, flexShrink: 0,
                  display: 'flex', alignItems: 'center', gap: 6,
                }}>
                  <Upload size={14} /> เลือกไฟล์
                </div>
              </button>
            </div>

            {/* รายการโค้ดทั้งหมด */}
            <div style={{
              marginTop: 8,
              maxHeight: 300,
              overflowY: 'auto',
              border: '1px solid #e5e7eb',
              borderRadius: '8px',
              padding: '12px',
              background: '#fff5f0',
              boxShadow: 'inset 0 1px 3px rgba(255, 107, 53, 0.1)'
            }}>
              <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: '12px',
                paddingBottom: '8px',
                borderBottom: '1px solid #ffc299'
              }}>
                <div style={{
                  fontSize: '14px',
                  fontWeight: '600',
                  color: '#ff6b35'
                }}>
                  <Gift size={14} style={{display:'inline',verticalAlign:'text-bottom'}} /> รายการโค้ดลุ้นรางวัลพิเศษ ({codes.length} รายการ)
                </div>
              </div>
              
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {codes.map((c, i) => {
                  // ✅ ตรวจสอบว่าโค้ดนี้ถูกใช้ไปแล้วหรือไม่ (รองรับหลายรูปแบบของ claimedBy)
                  const isUsed = Object.values(claimedBy).some(claim => {
                    if (!claim) return false
                    // รองรับทั้ง object { code, claimedAt } และ string (backward compatibility)
                    if (typeof claim === 'object' && claim !== null) {
                      const claimObj = claim as { code?: string; c?: string }
                      return claimObj.code === c || claimObj.c === c
                    }
                    if (typeof claim === 'string') {
                      return claim === c
                    }
                    return false
                  })
                  
                  return (
                    <div key={i} style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '12px',
                      padding: '8px 12px',
                      background: isUsed 
                        ? 'linear-gradient(135deg, #fef2f2 0%, #fee2e2 100%)' 
                        : '#ffffff',
                      border: isUsed 
                        ? '2px solid #fecaca' 
                        : '1px solid #ffc299',
                      borderRadius: '6px',
                      boxShadow: isUsed 
                        ? '0 2px 4px rgba(239, 68, 68, 0.1)' 
                        : '0 1px 2px rgba(255, 107, 53, 0.05)',
                      opacity: isUsed ? 0.7 : 1
                    }}>
                      <div style={{
                        minWidth: '80px',
                        fontSize: '12px',
                        fontWeight: '600',
                        color: isUsed ? '#dc2626' : '#ff6b35',
                        background: isUsed ? '#fecaca' : '#ffe8d9',
                        padding: '4px 8px',
                        borderRadius: '4px',
                        textAlign: 'center'
                      }}>
                        🎃 {i + 1}
                      </div>
                      <input
                        className="admin-f-control"
                        placeholder={`CODE ลำดับที่ ${i + 1}`}
                        value={c}
                        onChange={(e) => {
                          const v = e.target.value
                          setCodes((prev) => {
                            const next = [...prev]; next[i] = v; return next
                          })
                        }}
                        style={{
                          flex: 1,
                          border: isUsed ? '1px solid #fca5a5' : '1px solid #ffc299',
                          borderRadius: '6px',
                          padding: '8px 12px',
                          fontSize: '14px',
                          background: isUsed ? '#fef2f2' : '#ffffff',
                          color: isUsed ? '#991b1b' : '#374151',
                          textDecoration: isUsed ? 'line-through' : 'none'
                        }}
                        disabled={isUsed}
                      />
                      {isUsed && (
                        <div style={{
                          fontSize: '10px',
                          fontWeight: '700',
                          padding: '2px 6px',
                          borderRadius: '10px',
                          background: '#dc2626',
                          color: 'white'
                        }}>
                          ใช้แล้ว
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>

            <div style={{ 
              marginTop: 16, 
              padding: 12, 
              background: '#fff5f0', 
              borderRadius: 8, 
              border: '1px solid #ffc299' 
            }}>
              <h4 style={{ margin: '0 0 8px 0', color: '#ff6b35' }}><Gift size={14} style={{display:'inline',verticalAlign:'text-bottom'}} /> วิธีเล่นลุ้นรางวัลพิเศษ:</h4>
              <ul style={{ margin: 0, paddingLeft: 20, fontSize: 14, color: '#666', lineHeight: 1.6 }}>
                <li>ผู้เล่นเลือกการ์ดจาก 2 ใบที่แสดง</li>
                <li>โอกาสชนะขึ้นอยู่กับที่คุณตั้งค่าไว้ ({trickOrTreatWinChance}%)</li>
                <li>หากชนะจะได้รับโค้ดรางวัล</li>
                <li>หากแพ้จะเห็นภาพผีแทน</li>
                <li>ผู้เล่นแต่ละคนเล่นได้เพียงครั้งเดียวต่อเกม</li>
              </ul>
            </div>
          </>
        )}

        {/* ===== เฉพาะเกมป๊อกเด้ง ===== */}
        {showPokDeng && (
          <>
            <div style={{
              background: 'linear-gradient(135deg, #ecfdf5 0%, #d1fae5 100%)',
              border: '1.5px solid #6ee7b7',
              borderRadius: 14,
              padding: 16,
              marginBottom: 16,
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
                <div style={{
                  width: 40, height: 40, borderRadius: 12,
                  background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  boxShadow: '0 4px 12px rgba(16,185,129,0.35)',
                  fontSize: 22,
                  flexShrink: 0,
                }}>🃏</div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 15, fontWeight: 800, color: '#065f46' }}>
                    ตั้งค่าเกมป๊อกเด้ง (สู้กับ NPC)
                  </div>
                  <div style={{ fontSize: 12, color: '#047857', marginTop: 2 }}>
                    ผู้เล่นแต่ละคนสู้กับเจ้ามือ AI 1 รอบ ชนะรับโค้ดทันที
                  </div>
                </div>
              </div>
            </div>

            {/* ===== อัตราที่ผู้เล่นจะชนะ NPC ===== */}
            <label className="admin-f-label" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Trophy size={14} style={{ color: '#059669' }} />
              อัตราที่ผู้เล่นจะชนะเจ้ามือ AI (%)
            </label>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 8, alignItems: 'center', marginBottom: 8 }}>
              <input
                type="range"
                min={0}
                max={100}
                step={5}
                className="admin-f-control"
                value={pokDengWinChance}
                onChange={(e) => setPokDengWinChance(Number(e.target.value))}
                style={{ marginRight: 12 }}
              />
              <div style={{
                minWidth: 76,
                textAlign: 'center',
                fontWeight: 800,
                color: '#0f766e',
                fontSize: 22,
                background: '#fff',
                border: '1px solid #5eead4',
                borderRadius: 8,
                padding: '4px 12px',
              }}>
                {pokDengWinChance}%
              </div>
            </div>
            <div style={{
              fontSize: 13,
              color: '#0f766e',
              padding: 12,
              background: 'linear-gradient(135deg, #f0fdfa 0%, #ccfbf1 100%)',
              border: '1px dashed #5eead4',
              borderRadius: 8,
              marginBottom: 16,
              lineHeight: 1.55,
            }}>
              <strong>ผู้เล่นมีโอกาสชนะ {pokDengWinChance}%</strong> ในการเอาชนะเจ้ามือ
              <div style={{ marginTop: 4, fontSize: 11, color: '#0d9488' }}>
                💡 ระบบจะคำนวณผลลัพธ์ก่อนเริ่มเล่น แล้วเลือกชุดไพ่ที่ตรงตามอัตราที่ตั้งไว้ —
                แอนิเมชันยังเป็นธรรมชาติเหมือนสุ่มจริง
                <br />
                ⚠️ หมายเหตุ: หากผู้เล่นตัดสินใจ "จั่ว/อยู่" ต่างจากกลยุทธ์ทั่วไป (อยู่เมื่อแต้ม ≥ 5) ผลอาจคลาดเคลื่อนเล็กน้อย (~5%)
              </div>
            </div>

            {/* ===== กฎ NPC ===== */}
            <label className="admin-f-label">กฎเจ้ามือ AI: เริ่มหยุดจั่วเมื่อแต้ม ≥</label>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 8, alignItems: 'center', marginBottom: 8 }}>
              <input
                type="range"
                min={3}
                max={7}
                step={1}
                className="admin-f-control"
                value={pokDengNpcStand}
                onChange={(e) => setPokDengNpcStand(Number(e.target.value))}
                style={{ marginRight: 12 }}
              />
              <div style={{
                minWidth: 64,
                textAlign: 'center',
                fontWeight: 800,
                color: '#059669',
                fontSize: 22,
                background: '#fff',
                border: '1px solid #6ee7b7',
                borderRadius: 8,
                padding: '4px 8px',
              }}>
                {pokDengNpcStand}+
              </div>
            </div>
            <div style={{
              fontSize: 13,
              color: '#065f46',
              padding: 12,
              background: '#f0fdf4',
              border: '1px dashed #86efac',
              borderRadius: 8,
              marginBottom: 16,
              lineHeight: 1.55,
            }}>
              <strong>ค่าปัจจุบัน:</strong> เจ้ามือจะ <b>จั่วใบที่ 3</b> เมื่อแต้ม <b>0–{pokDengNpcStand - 1}</b> และ <b>หมอบ (อยู่)</b> เมื่อแต้ม <b>{pokDengNpcStand}–9</b>
              <div style={{ marginTop: 4, fontSize: 11, color: '#047857' }}>
                💡 ค่านี้ใช้สำหรับ simulation หาชุดไพ่ตามอัตราชนะ — ในเกมจริง NPC ก็ใช้กฎเดียวกัน
              </div>
            </div>

            <div style={{
              background: '#fffbeb',
              border: '1px solid #fde68a',
              borderRadius: 10,
              padding: 12,
              marginBottom: 16,
            }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#92400e', marginBottom: 6 }}>
                <Lightbulb size={14} style={{ display: 'inline', verticalAlign: 'text-bottom' }} /> กฎเกม
              </div>
              <ul style={{ margin: 0, paddingLeft: 18, fontSize: 12, color: '#78350f', lineHeight: 1.7 }}>
                <li><b>ป๊อก 9 / ป๊อก 8</b> (2 ใบ): เปิดทันที, ดอกเดียวกัน = เด้งสองเท่า</li>
                <li><b>ตอง</b> (3 ใบเลขเดียว): สูงสุด, เด้ง 5 เท่า</li>
                <li><b>สามเหลือง</b> (J,Q,K สามใบ): เด้ง 3 เท่า</li>
                <li><b>เรียง / สามดอกเดียวกัน</b>: เด้ง 3 เท่า</li>
                <li><b>แต้มธรรมดา</b>: A=1, 2-9=ตามหน้า, 10/J/Q/K=0, รวมแล้ว mod 10</li>
                <li>ผู้เล่นแต่ละคนเล่นได้ <b>1 รอบ</b> ต่อเกม ชนะ = รับโค้ดอัตโนมัติ</li>
              </ul>
            </div>
          </>
        )}

        {type === 'เกมประกาศรางวัล' && (
          <>
            {/* รูปภาพประกาศรางวัล */}
            <div style={{ marginBottom: 20 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
                <div style={{ width: 36, height: 36, borderRadius: 12, background: `${colors.primary}12`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <ImageIcon size={18} color={colors.primary} />
                </div>
                <div>
                  <div style={{ fontSize: 16, fontWeight: 700, color: colors.textPrimary }}>รูปภาพประกาศรางวัล</div>
                  <div style={{ fontSize: 12, color: colors.textSecondary }}>อัปโหลดรูปภาพแสดงในหน้าประกาศ</div>
                </div>
              </div>

              <input
                id="announce-image"
                type="file"
                accept="image/*"
                onChange={async (e) => {
                  const f = e.target.files?.[0]
                  if (!f) return
                  if (!/^image\//.test(f.type)) { setAnnounceToast({ msg: 'โปรดเลือกไฟล์รูปภาพ', type: 'error' }); return }
                  if (announceImageDataUrl && announceImageDataUrl.startsWith('blob:')) URL.revokeObjectURL(announceImageDataUrl)
                  setAnnounceFileName(f.name)
                  setAnnounceImageFile(f)
                  try {
                    setAnnounceImageDataUrl(URL.createObjectURL(f))
                  } catch (error) {
                    console.error('Error creating preview URL:', error)
                    setAnnounceImageDataUrl(await fileToDataURL(f))
                  }
                }}
                style={{ display: 'none' }}
              />

              {!announceImageDataUrl ? (
                <label
                  htmlFor="announce-image"
                  style={{
                    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8,
                    padding: '28px 18px', borderRadius: 16,
                    border: `2px dashed ${colors.borderLight}`,
                    background: colors.bgSecondary,
                    cursor: 'pointer', transition: 'all 0.2s ease',
                    textAlign: 'center',
                  }}
                >
                  <div style={{
                    width: 48, height: 48, borderRadius: 14,
                    background: `${colors.primary}10`,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}>
                    <FileImage size={24} color={colors.primary} />
                  </div>
                  <div style={{ fontSize: 14, fontWeight: 700, color: colors.textPrimary }}>คลิกเพื่อเลือกรูปภาพ</div>
                  <div style={{ fontSize: 12, color: colors.textSecondary }}>JPG, PNG, GIF, WebP</div>
                </label>
              ) : (
                <div style={{
                  borderRadius: 16, overflow: 'hidden',
                  border: `1px solid ${colors.borderLight}`,
                  background: '#fff',
                }}>
                  <div style={{ position: 'relative' }}>
                    <img
                      src={getImageUrl(announceImageDataUrl)}
                      alt="preview"
                      style={{ width: '100%', maxHeight: 300, objectFit: 'contain', display: 'block', opacity: announceImageUploading ? 0.5 : 1, background: '#f8fafc' }}
                    />
                    {announceImageUploading && (
                      <div style={{
                        position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
                        background: 'rgba(255,255,255,0.6)',
                      }}>
                        <Loader2 size={24} color={colors.primary} className="spin-icon" />
                      </div>
                    )}
                  </div>
                  <div style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    padding: '10px 14px', borderTop: `1px solid ${colors.borderLight}`,
                  }}>
                    <div style={{ fontSize: 12, fontWeight: 600, color: colors.textSecondary, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '60%' }}>
                      {announceFileName || 'รูปภาพถูกอัปโหลดแล้ว'}
                    </div>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <label htmlFor="announce-image" style={{
                        display: 'inline-flex', alignItems: 'center', gap: 4,
                        padding: '5px 12px', borderRadius: 8, border: `1px solid ${colors.primary}30`,
                        background: `${colors.primary}08`, color: colors.primary,
                        fontSize: 12, fontWeight: 600, cursor: 'pointer',
                      }}>
                        <RotateCw size={12} /> เปลี่ยน
                      </label>
                      <button
                        onClick={() => { setAnnounceImageDataUrl(''); setAnnounceFileName(''); setAnnounceImageFile(null) }}
                        style={{
                          display: 'inline-flex', alignItems: 'center', gap: 4,
                          padding: '5px 12px', borderRadius: 8, border: 'none',
                          background: `${colors.danger}10`, color: colors.danger,
                          fontSize: 12, fontWeight: 600, cursor: 'pointer',
                        }}
                      >
                        <Trash2 size={12} /> ลบ
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>

            <div style={{ borderBottom: `1px solid ${colors.borderLight}`, marginBottom: 20 }} />

            {/* รายชื่อผู้ได้รับรางวัล */}
            <div style={{ marginBottom: 20 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
                <div style={{ width: 36, height: 36, borderRadius: 12, background: `${colors.primary}12`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <ClipboardList size={18} color={colors.primary} />
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 16, fontWeight: 700, color: colors.textPrimary }}>รายชื่อผู้ได้รับรางวัล</div>
                  <div style={{ fontSize: 12, color: colors.textSecondary }}>อัปโหลดไฟล์ CSV / XLSX</div>
                </div>
                {(announceUserBonuses.length > 0 || announceUsers.length > 0) && (
                  <div style={{
                    padding: '4px 12px', borderRadius: 8,
                    background: `${colors.success}12`, color: colors.success,
                    fontSize: 13, fontWeight: 700, flexShrink: 0,
                  }}>
                    {Math.max(announceUserBonuses.length, announceUsers.length).toLocaleString()} USER
                  </div>
                )}
              </div>

              <input
                id="announce-csv-upload"
                type="file"
                accept=".csv,.txt,.xlsx"
                hidden
                onChange={(e) => { importAnnounceUsers(e.target.files?.[0]); if (e.target) e.target.value = '' }}
              />

              {/* Stats pills */}
              {(announceUserBonuses.length > 0 || announceUsers.length > 0) && (
                <div style={{
                  display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap',
                }}>
                  <div style={{
                    display: 'flex', alignItems: 'center', gap: 5,
                    padding: '6px 12px', borderRadius: 10,
                    background: `${colors.success}08`, border: `1px solid ${colors.success}25`,
                    fontSize: 12, fontWeight: 700, color: colors.success,
                  }}>
                    <CheckCircle2 size={13} />
                    {announceUserBonuses.length > 0
                      ? `USER + BONUS ${announceUserBonuses.length.toLocaleString()} รายการ`
                      : `USER ${announceUsers.length.toLocaleString()} รายการ`
                    }
                  </div>
                  <button
                    onClick={() => {
                      setAnnounceUsers([])
                      setAnnounceUserBonuses([])
                      setAnnounceToast({ msg: 'ล้างรายชื่อเรียบร้อย', type: 'info' })
                    }}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 4,
                      padding: '6px 12px', borderRadius: 10, border: 'none',
                      background: `${colors.danger}08`, color: colors.danger,
                      fontSize: 12, fontWeight: 600, cursor: 'pointer',
                    }}
                  >
                    <Trash2 size={12} /> ล้างข้อมูล
                  </button>
                </div>
              )}

              <label
                htmlFor="announce-csv-upload"
                style={{
                  display: 'flex', alignItems: 'center', gap: 12,
                  padding: '14px 18px', borderRadius: 14,
                  border: `2px dashed ${colors.borderLight}`,
                  background: colors.bgSecondary,
                  cursor: 'pointer', transition: 'all 0.2s ease',
                }}
              >
                <div style={{
                  width: 40, height: 40, borderRadius: 12,
                  background: `${colors.textSecondary}10`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                }}>
                  <FileSpreadsheet size={20} color={colors.textSecondary} />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 600, color: colors.textPrimary }}>อัปโหลด USER + BONUS</div>
                  <div style={{ fontSize: 12, color: colors.textSecondary, marginTop: 2 }}>คอลัมน์ A = USER, คอลัมน์ B = โบนัส</div>
                </div>
                <div style={{
                  padding: '6px 14px', borderRadius: 10,
                  background: colors.primary, color: '#fff',
                  fontSize: 13, fontWeight: 600, flexShrink: 0,
                  display: 'flex', alignItems: 'center', gap: 6,
                }}>
                  <Upload size={14} /> เลือกไฟล์
                </div>
              </label>

              {/* Preview top users */}
              {announceUserBonuses.length > 0 && (
                <div style={{
                  marginTop: 12, borderRadius: 14, overflow: 'hidden',
                  border: `1px solid ${colors.borderLight}`,
                }}>
                  <div style={{
                    display: 'grid', gridTemplateColumns: '1fr auto',
                    padding: '8px 14px', background: colors.bgSecondary,
                    fontSize: 11, fontWeight: 700, color: colors.textSecondary, textTransform: 'uppercase', letterSpacing: 0.5,
                  }}>
                    <span>USER</span><span>BONUS</span>
                  </div>
                  {announceUserBonuses.slice(0, 5).map((item, i) => (
                    <div key={i} style={{
                      display: 'grid', gridTemplateColumns: '1fr auto',
                      padding: '8px 14px', background: i % 2 === 0 ? '#fff' : colors.bgSecondary,
                      fontSize: 13, borderTop: `1px solid ${colors.borderLight}`,
                    }}>
                      <span style={{ fontWeight: 600, color: colors.textPrimary }}>{item.user}</span>
                      <span style={{ fontWeight: 700, color: colors.success }}>{item.bonus.toLocaleString()}</span>
                    </div>
                  ))}
                  {announceUserBonuses.length > 5 && (
                    <div style={{
                      padding: '8px 14px', textAlign: 'center',
                      fontSize: 12, color: colors.textTertiary, background: colors.bgSecondary,
                      borderTop: `1px solid ${colors.borderLight}`,
                    }}>
                      ... อีก {(announceUserBonuses.length - 5).toLocaleString()} รายการ
                    </div>
                  )}
                </div>
              )}

              {announceUsers.length === 0 && announceUserBonuses.length === 0 && (
                <div style={{
                  marginTop: 10, borderRadius: 12, padding: 14, textAlign: 'center',
                  border: `1px solid ${colors.borderLight}`, background: colors.bgSecondary,
                }}>
                  <div style={{ color: colors.textTertiary, fontSize: 13 }}>ยังไม่มีข้อมูล — อัปโหลดไฟล์เพื่อเพิ่มรายชื่อ</div>
                </div>
              )}
            </div>
          </>
        )}

        {/* เฉพาะเกมแนะนำเพื่อน — รูปภาพ */}
        {type === 'เกมแนะนำเพื่อน' && (
          <div style={{
            marginBottom: '16px',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: '16px' }}>
              <div style={{
                width: 36, height: 36, borderRadius: 10,
                background: `${colors.primary}12`,
                display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
              }}>
                <ImageIcon size={18} color={colors.primary} />
              </div>
              <div>
                <div style={{ fontSize: 16, fontWeight: 700, color: colors.textPrimary }}>
                  รูปภาพแนะนำเพื่อน
                </div>
                <div style={{ fontSize: 12, color: colors.textSecondary }}>
                  แสดงเมื่อผู้เล่นเข้าสู่ระบบสำเร็จ
                </div>
              </div>
            </div>

            <input
              type="file"
              accept="image/*"
              onChange={async (e) => {
                const f = e.target.files?.[0]
                if (!f) return
                if (!/^image\//.test(f.type)) {
                  alert('โปรดเลือกไฟล์รูปภาพเท่านั้น (JPG, PNG, GIF)')
                  return
                }
                if (referralImageDataUrl && referralImageDataUrl.startsWith('blob:')) {
                  URL.revokeObjectURL(referralImageDataUrl)
                }
                setReferralImageFileName(f.name)
                setReferralImageFile(f)
                try {
                  const previewUrl = URL.createObjectURL(f)
                  setReferralImageDataUrl(previewUrl)
                } catch {
                  const data = await fileToDataURL(f)
                  setReferralImageDataUrl(data)
                }
              }}
              hidden
              ref={(el) => { if (el) (window as any).referralImageInput = el }}
            />

            {!referralImageDataUrl ? (
              <div
                onClick={() => (window as any).referralImageInput?.click()}
                style={{
                  border: `2px dashed ${colors.borderMedium}`,
                  borderRadius: '14px',
                  padding: '36px 20px',
                  textAlign: 'center',
                  cursor: 'pointer',
                  transition: 'all 0.2s ease',
                  background: `${colors.primary}05`,
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.borderColor = colors.primary
                  e.currentTarget.style.background = `${colors.primary}10`
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.borderColor = colors.borderMedium
                  e.currentTarget.style.background = `${colors.primary}05`
                }}
              >
                <div style={{ marginBottom: '12px' }}><Camera size={40} color="#94a3b8" /></div>
                <div style={{ fontSize: '16px', fontWeight: 600, color: colors.textPrimary, marginBottom: '6px' }}>
                  คลิกเพื่อเลือกรูปภาพ
                </div>
                <div style={{ fontSize: '13px', color: colors.textTertiary }}>
                  รองรับไฟล์ JPG, PNG, GIF (ขนาดไม่เกิน 10MB)
                </div>
              </div>
            ) : (
              <div style={{
                background: '#fff',
                borderRadius: '14px',
                padding: '16px',
                border: `1px solid ${colors.borderLight}`,
              }}>
                <div style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  marginBottom: '12px',
                  paddingBottom: '10px',
                  borderBottom: `1px solid ${colors.borderLight}`
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <CheckCircle2 size={16} color={colors.success} />
                    <span style={{ fontSize: 13, fontWeight: 600, color: colors.textPrimary, wordBreak: 'break-all' }}>
                      {referralImageFileName || 'รูปภาพถูกอัปโหลดแล้ว'}
                    </span>
                  </div>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button
                      type="button"
                      onClick={() => (window as any).referralImageInput?.click()}
                      style={{
                        background: `${colors.primary}12`,
                        border: `1px solid ${colors.primary}30`,
                        borderRadius: 7,
                        padding: '5px 10px',
                        color: colors.primary,
                        fontSize: 12,
                        fontWeight: 600,
                        cursor: 'pointer',
                      }}
                    ><RotateCw size={13} /> เปลี่ยนรูป</button>
                    <button
                      type="button"
                      onClick={() => {
                        if (referralImageDataUrl.startsWith('blob:')) URL.revokeObjectURL(referralImageDataUrl)
                        setReferralImageDataUrl('')
                        setReferralImageFileName('')
                        setReferralImageFile(null)
                      }}
                      style={{
                        background: 'rgba(239,68,68,0.08)',
                        border: '1px solid rgba(239,68,68,0.2)',
                        borderRadius: 7,
                        padding: '5px 10px',
                        color: '#dc2626',
                        fontSize: 12,
                        fontWeight: 600,
                        cursor: 'pointer',
                      }}
                    ><Trash2 size={13} /> ลบรูป</button>
                  </div>
                </div>
                <div style={{ textAlign: 'center' }}>
                  <img
                    src={referralImageDataUrl ? getImageUrl(referralImageDataUrl) : ''}
                    alt="Preview"
                    style={{
                      maxWidth: '100%',
                      maxHeight: '280px',
                      borderRadius: 10,
                      boxShadow: '0 4px 16px rgba(0,0,0,0.08)',
                      objectFit: 'contain',
                      opacity: referralImageUploading ? 0.5 : 1
                    }}
                  />
                  <div style={{ marginTop: 10, fontSize: 12, color: colors.textTertiary, fontStyle: 'italic' }}>
                    รูปภาพนี้จะแสดงในหน้าเกมแนะนำเพื่อนเมื่อผู้เล่นเข้าสู่ระบบ
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* เฉพาะเกมแนะนำเพื่อน — ข้อมูล */}
        {type === 'เกมแนะนำเพื่อน' && (
          <div style={{
            marginBottom: '16px',
          }}>
            {/* Upload buttons */}
            <div style={{ display: 'flex', gap: 12, marginBottom: '20px' }}>
              {/* Deposit upload */}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
                  <Coins size={14} color={colors.info} style={{ flexShrink: 0 }} />
                  <span style={{ fontSize: 13, fontWeight: 700, color: colors.textPrimary, whiteSpace: 'nowrap' }}>USER นับจริง (ฝาก)</span>
                </div>
                <input
                  type="file"
                  accept=".xlsx,.xls,.csv"
                  ref={referralDepositFileRef}
                  style={{ display: 'none' }}
                  onChange={async (e) => {
                    const f = e.target.files?.[0]
                    if (!f) return
                    try {
                      const rows = await parseReferralExcel(f, { referredCol: 0, referrerCol: 9, expectedType: 'deposit' })
                      setPendingDepositRows(rows)
                      setPendingDepositFileName(f.name)
                    } catch (err: any) {
                      if (err instanceof WrongFileTypeError) {
                        setReferralPopup({ type: 'error', title: 'ไฟล์ผิดประเภท', lines: [err.message, 'กรุณาเลือกไฟล์ First Topup Report'] })
                      } else {
                        setReferralPopup({ type: 'error', title: 'อ่านไฟล์ไม่สำเร็จ', lines: [err.message] })
                      }
                    } finally {
                      if (referralDepositFileRef.current) referralDepositFileRef.current.value = ''
                    }
                  }}
                />

                {pendingDepositRows ? (
                  <div style={{
                    borderRadius: 12, border: `2px solid ${colors.success || '#10b981'}`,
                    background: '#f0fdf4', padding: '14px 16px',
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                      <FileSpreadsheet size={16} color={colors.success || '#10b981'} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 13, fontWeight: 700, color: '#166534', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {pendingDepositFileName}
                        </div>
                        <div style={{ fontSize: 12, color: '#15803d', fontWeight: 600 }}>
                          {pendingDepositRows.length} รายการ พร้อมบันทึก
                        </div>
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button
                        type="button"
                        disabled={referralDepositUploading || !gameId}
                        onClick={async () => {
                          if (!gameId || !pendingDepositRows) return
                          setReferralDepositUploading(true)
                          try {
                            const rows = pendingDepositRows
                            setReferralDeposits(rows)
                            const result = await saveReferralDeposits(gameId, rows)
                            const lb = await getReferralLeaderboard(gameId)
                            setReferralSummaries(lb)
                            setPendingDepositRows(null)
                            setPendingDepositFileName('')
                            setReferralPopup({
                              type: 'success',
                              title: 'บันทึกข้อมูลฝากสำเร็จ',
                              lines: [
                                `เพิ่มใหม่: ${result.added} รายการ`,
                                `ซ้ำ (ไม่นับ): ${rows.length - result.added} รายการ`,
                                `ทั้งหมดในระบบ: ${result.total} รายการ`,
                              ],
                            })
                          } catch (err: any) {
                            setReferralPopup({ type: 'error', title: 'บันทึกไม่สำเร็จ', lines: [err.message] })
                          } finally {
                            setReferralDepositUploading(false)
                          }
                        }}
                        style={{
                          flex: 1, padding: '8px 12px', borderRadius: 8, border: 'none',
                          background: colors.primary, color: '#fff',
                          fontSize: 13, fontWeight: 700, cursor: 'pointer',
                          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                          opacity: referralDepositUploading ? 0.6 : 1,
                        }}
                      >
                        <Save size={14} /> {referralDepositUploading ? 'กำลังบันทึก...' : 'บันทึก'}
                      </button>
                      <button
                        type="button"
                        disabled={referralDepositUploading}
                        onClick={() => referralDepositFileRef.current?.click()}
                        style={{
                          padding: '8px 12px', borderRadius: 8,
                          border: `1px solid ${colors.borderLight}`,
                          background: '#fff', color: colors.textSecondary,
                          fontSize: 13, fontWeight: 600, cursor: 'pointer',
                          display: 'flex', alignItems: 'center', gap: 6, whiteSpace: 'nowrap',
                        }}
                      >
                        <Upload size={14} /> เลือกไฟล์ใหม่
                      </button>
                      <button
                        type="button"
                        disabled={referralDepositUploading}
                        onClick={() => { setPendingDepositRows(null); setPendingDepositFileName('') }}
                        style={{
                          width: 36, height: 36, borderRadius: 8, border: `1px solid ${colors.borderLight}`,
                          background: '#fff', color: '#ef4444', cursor: 'pointer', flexShrink: 0,
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                        }}
                      >
                        <X size={14} />
                      </button>
                    </div>
                  </div>
                ) : (
                  <div
                    role="button"
                    tabIndex={0}
                    onClick={() => { if (!referralDepositUploading && gameId) referralDepositFileRef.current?.click() }}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 12,
                      padding: '14px 18px', borderRadius: 12,
                      border: `2px dashed ${colors.borderLight}`,
                      background: colors.bgSecondary,
                      cursor: referralDepositUploading || !gameId ? 'not-allowed' : 'pointer',
                      opacity: referralDepositUploading || !gameId ? 0.6 : 1,
                      transition: 'all 0.2s ease',
                    }}
                  >
                    <div style={{
                      width: 40, height: 40, borderRadius: 10,
                      background: `${colors.textSecondary}10`,
                      display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                    }}>
                      <FileSpreadsheet size={20} color={colors.textSecondary} />
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 14, fontWeight: 600, color: colors.textPrimary }}>
                        {`เลือกไฟล์ฝากจริง${referralDeposits.length ? ` (${referralDeposits.length} ในระบบ)` : ''}`}
                      </div>
                      <div style={{ fontSize: 12, color: colors.textSecondary, marginTop: 2 }}>
                        .xlsx, .xls, .csv
                      </div>
                    </div>
                    <div style={{
                      padding: '6px 14px', borderRadius: 8,
                      background: colors.primary, color: '#fff',
                      fontSize: 13, fontWeight: 600, flexShrink: 0,
                      display: 'flex', alignItems: 'center', gap: 6,
                    }}>
                      <Upload size={14} /> เลือกไฟล์
                    </div>
                  </div>
                )}
              </div>

              {/* Register upload */}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
                  <FileText size={14} color={colors.accent} style={{ flexShrink: 0 }} />
                  <span style={{ fontSize: 13, fontWeight: 700, color: colors.textPrimary, whiteSpace: 'nowrap' }}>USER สมัคร</span>
                </div>
                <input
                  type="file"
                  accept=".xlsx,.xls,.csv"
                  ref={referralRegisterFileRef}
                  style={{ display: 'none' }}
                  onChange={async (e) => {
                    const f = e.target.files?.[0]
                    if (!f) return
                    try {
                      const rows = await parseReferralExcel(f, { referredCol: 1, referrerCol: 13, expectedType: 'register' })
                      setPendingRegisterRows(rows)
                      setPendingRegisterFileName(f.name)
                    } catch (err: any) {
                      if (err instanceof WrongFileTypeError) {
                        setReferralPopup({ type: 'error', title: 'ไฟล์ผิดประเภท', lines: [err.message, 'กรุณาเลือกไฟล์ Customer'] })
                      } else {
                        setReferralPopup({ type: 'error', title: 'อ่านไฟล์ไม่สำเร็จ', lines: [err.message] })
                      }
                    } finally {
                      if (referralRegisterFileRef.current) referralRegisterFileRef.current.value = ''
                    }
                  }}
                />

                {pendingRegisterRows ? (
                  <div style={{
                    borderRadius: 12, border: `2px solid ${colors.accent || '#3b82f6'}`,
                    background: '#eff6ff', padding: '14px 16px',
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                      <FileSpreadsheet size={16} color={colors.accent || '#3b82f6'} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 13, fontWeight: 700, color: '#1e40af', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {pendingRegisterFileName}
                        </div>
                        <div style={{ fontSize: 12, color: '#2563eb', fontWeight: 600 }}>
                          {pendingRegisterRows.length} รายการ พร้อมบันทึก
                        </div>
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button
                        type="button"
                        disabled={referralRegisterUploading || !gameId}
                        onClick={async () => {
                          if (!gameId || !pendingRegisterRows) return
                          setReferralRegisterUploading(true)
                          try {
                            const rows = pendingRegisterRows
                            setReferralRegisters(rows)
                            const result = await saveReferralRegisters(gameId, rows)
                            const lb = await getReferralLeaderboard(gameId)
                            setReferralSummaries(lb)
                            setPendingRegisterRows(null)
                            setPendingRegisterFileName('')
                            setReferralPopup({
                              type: 'success',
                              title: 'บันทึกข้อมูลสมัครสำเร็จ',
                              lines: [
                                `เพิ่มใหม่: ${result.added} รายการ`,
                                `ซ้ำ (ไม่นับ): ${rows.length - result.added} รายการ`,
                                `ทั้งหมดในระบบ: ${result.total} รายการ`,
                              ],
                            })
                          } catch (err: any) {
                            setReferralPopup({ type: 'error', title: 'บันทึกไม่สำเร็จ', lines: [err.message] })
                          } finally {
                            setReferralRegisterUploading(false)
                          }
                        }}
                        style={{
                          flex: 1, padding: '8px 12px', borderRadius: 8, border: 'none',
                          background: colors.primary, color: '#fff',
                          fontSize: 13, fontWeight: 700, cursor: 'pointer',
                          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                          opacity: referralRegisterUploading ? 0.6 : 1,
                        }}
                      >
                        <Save size={14} /> {referralRegisterUploading ? 'กำลังบันทึก...' : 'บันทึก'}
                      </button>
                      <button
                        type="button"
                        disabled={referralRegisterUploading}
                        onClick={() => referralRegisterFileRef.current?.click()}
                        style={{
                          padding: '8px 12px', borderRadius: 8,
                          border: `1px solid ${colors.borderLight}`,
                          background: '#fff', color: colors.textSecondary,
                          fontSize: 13, fontWeight: 600, cursor: 'pointer',
                          display: 'flex', alignItems: 'center', gap: 6, whiteSpace: 'nowrap',
                        }}
                      >
                        <Upload size={14} /> เลือกไฟล์ใหม่
                      </button>
                      <button
                        type="button"
                        disabled={referralRegisterUploading}
                        onClick={() => { setPendingRegisterRows(null); setPendingRegisterFileName('') }}
                        style={{
                          width: 36, height: 36, borderRadius: 8, border: `1px solid ${colors.borderLight}`,
                          background: '#fff', color: '#ef4444', cursor: 'pointer', flexShrink: 0,
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                        }}
                      >
                        <X size={14} />
                      </button>
                    </div>
                  </div>
                ) : (
                  <div
                    role="button"
                    tabIndex={0}
                    onClick={() => { if (!referralRegisterUploading && gameId) referralRegisterFileRef.current?.click() }}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 12,
                      padding: '14px 18px', borderRadius: 12,
                      border: `2px dashed ${colors.borderLight}`,
                      background: colors.bgSecondary,
                      cursor: referralRegisterUploading || !gameId ? 'not-allowed' : 'pointer',
                      opacity: referralRegisterUploading || !gameId ? 0.6 : 1,
                      transition: 'all 0.2s ease',
                    }}
                  >
                    <div style={{
                      width: 40, height: 40, borderRadius: 10,
                      background: `${colors.textSecondary}10`,
                      display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                    }}>
                      <FileSpreadsheet size={20} color={colors.textSecondary} />
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 14, fontWeight: 600, color: colors.textPrimary }}>
                        {`เลือกไฟล์สมัคร${referralRegisters.length ? ` (${referralRegisters.length} ในระบบ)` : ''}`}
                      </div>
                      <div style={{ fontSize: 12, color: colors.textSecondary, marginTop: 2 }}>
                        .xlsx, .xls, .csv
                      </div>
                    </div>
                    <div style={{
                      padding: '6px 14px', borderRadius: 8,
                      background: colors.primary, color: '#fff',
                      fontSize: 13, fontWeight: 600, flexShrink: 0,
                      display: 'flex', alignItems: 'center', gap: 6,
                    }}>
                      <Upload size={14} /> เลือกไฟล์
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Export buttons */}
            {gameId && referralSummaries.length > 0 && (
              <div style={{ marginBottom: '16px' }}>
                <button
                  className="dropzone-btn"
                  disabled={referralExporting}
                  onClick={async () => {
                    if (!gameId) return
                    setReferralExporting(true)
                    try {
                      const [deposits, registers] = await Promise.all([
                        getReferralDeposits(gameId),
                        getReferralRegisters(gameId),
                      ])

                      const wb = XLSX.utils.book_new()

                      const depositData = [['ถูกแนะนำ (referred)', 'ผู้แนะนำ (referrer)'], ...deposits.map((r) => [r.referred, r.referrer])]
                      const wsDeposit = XLSX.utils.aoa_to_sheet(depositData)
                      wsDeposit['!cols'] = [{ wch: 25 }, { wch: 25 }]
                      XLSX.utils.book_append_sheet(wb, wsDeposit, 'USER ฝาก (Deposit)')

                      const registerData = [['ถูกแนะนำ (referred)', 'ผู้แนะนำ (referrer)'], ...registers.map((r) => [r.referred, r.referrer])]
                      const wsRegister = XLSX.utils.aoa_to_sheet(registerData)
                      wsRegister['!cols'] = [{ wch: 25 }, { wch: 25 }]
                      XLSX.utils.book_append_sheet(wb, wsRegister, 'USER สมัคร (Register)')

                      const summaryData = [
                        ['USER', 'นับจริง (Deposit)', 'สมัคร (Register)', 'รวม (Total)'],
                        ...referralSummaries.map((s) => [s.user, s.depositCount, s.registerCount, s.totalCount])
                      ]
                      const wsSummary = XLSX.utils.aoa_to_sheet(summaryData)
                      wsSummary['!cols'] = [{ wch: 25 }, { wch: 18 }, { wch: 18 }, { wch: 12 }]
                      XLSX.utils.book_append_sheet(wb, wsSummary, 'สรุปอันดับ (Summary)')

                      const fileName = `referral_${name || 'game'}_${new Date().toISOString().slice(0, 10)}.xlsx`
                      XLSX.writeFile(wb, fileName)
                      setReferralPopup({
                        type: 'success',
                        title: 'Export สำเร็จ',
                        lines: [`ดาวน์โหลดไฟล์ ${fileName} แล้ว`],
                      })
                    } catch (err: any) {
                      setReferralPopup({ type: 'error', title: 'Export ไม่สำเร็จ', lines: [err.message] })
                    } finally {
                      setReferralExporting(false)
                    }
                  }}
                  style={{
                    width: '100%',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 8,
                    padding: '12px 16px',
                    fontSize: 13,
                    fontWeight: 700,
                    color: colors.primary,
                    background: `${colors.primary}08`,
                    border: `1.5px solid ${colors.primary}25`,
                    borderRadius: 10,
                    cursor: referralExporting ? 'not-allowed' : 'pointer',
                    opacity: referralExporting ? 0.6 : 1,
                    transition: 'all 0.2s ease',
                  }}
                >
                  {referralExporting ? 'กำลัง Export...' : <><Download size={16} /> Export ข้อมูลทั้งหมด (.xlsx)</>}
                </button>
              </div>
            )}

            {!gameId && (
              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                padding: '12px 16px',
                background: `${colors.warning}08`,
                border: `1px solid ${colors.warning}25`,
                borderRadius: 10,
                fontSize: 13,
                color: colors.textSecondary,
                marginBottom: '16px',
              }}>
                <AlertTriangle size={16} color={colors.warning} style={{ flexShrink: 0 }} />
                กรุณาสร้างเกมก่อน จึงจะสามารถอัปโหลดข้อมูลได้
              </div>
            )}

            {/* Stats */}
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(3, 1fr)',
              gap: '10px',
              marginBottom: '20px',
            }}>
              {[
                { label: 'USER ทั้งหมด', value: referralSummaries.length, icon: Users, color: colors.primary },
                { label: 'ยอดฝากจริง', value: referralSummaries.reduce((s, r) => s + r.depositCount, 0), icon: Coins, color: colors.info },
                { label: 'ยอดสมัคร', value: referralSummaries.reduce((s, r) => s + r.registerCount, 0), icon: ClipboardList, color: colors.accent },
              ].map((stat) => {
                const IconComp = stat.icon
                return (
                  <div key={stat.label} style={{
                    padding: '14px',
                    background: `${stat.color}08`,
                    border: `1px solid ${stat.color}20`,
                    borderRadius: '12px',
                    textAlign: 'center',
                  }}>
                    <div style={{
                      width: 32, height: 32, borderRadius: 8,
                      background: `${stat.color}14`,
                      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                      marginBottom: 6,
                    }}>
                      <IconComp size={16} color={stat.color} />
                    </div>
                    <div style={{ fontSize: '22px', fontWeight: 800, color: stat.color }}>{stat.value.toLocaleString()}</div>
                    <div style={{ fontSize: '11px', color: colors.textTertiary, fontWeight: 600 }}>{stat.label}</div>
                  </div>
                )
              })}
            </div>

            {/* Search */}
            {referralSummaries.length > 0 && (
              <div style={{ marginBottom: '12px', position: 'relative' }}>
                <Search size={16} color={colors.textTertiary} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)' }} />
                <input
                  type="text"
                  placeholder="ค้นหา USER..."
                  value={referralSearchTerm}
                  onChange={(e) => setReferralSearchTerm(e.target.value.toUpperCase())}
                  style={{
                    width: '100%',
                    padding: '10px 14px 10px 36px',
                    fontSize: '14px',
                    border: `1.5px solid ${colors.borderMedium}`,
                    borderRadius: '10px',
                    outline: 'none',
                    background: '#fff',
                    boxSizing: 'border-box',
                  }}
                />
              </div>
            )}

            {/* Table */}
            {referralSummaries.length > 0 ? (
              <div style={{
                borderRadius: '12px',
                border: `1px solid ${colors.borderLight}`,
                overflow: 'hidden',
                maxHeight: '400px',
                overflowY: 'auto',
              }}>
                {/* Header */}
                <div style={{
                  display: 'grid',
                  gridTemplateColumns: '50px 1fr 90px 90px',
                  padding: '10px 14px',
                  background: colors.bgSecondary,
                  borderBottom: `1px solid ${colors.borderLight}`,
                  fontSize: '12px',
                  fontWeight: 700,
                  color: colors.textTertiary,
                  position: 'sticky',
                  top: 0,
                  zIndex: 2,
                }}>
                  <div style={{ textAlign: 'center' }}>#</div>
                  <div>USER</div>
                  <div style={{ textAlign: 'center', color: colors.info }}>นับจริง</div>
                  <div style={{ textAlign: 'center', color: colors.accent }}>สมัคร</div>
                </div>
                {/* Rows */}
                {referralSummaries
                  .filter((s) => !referralSearchTerm || s.user.includes(referralSearchTerm))
                  .map((s, idx) => (
                    <div key={s.user} style={{
                      display: 'grid',
                      gridTemplateColumns: '50px 1fr 90px 90px',
                      padding: '10px 14px',
                      borderBottom: `1px solid ${colors.borderLight}`,
                      background: idx % 2 === 0 ? '#fff' : colors.bgSecondary,
                      fontSize: '13px',
                    }}>
                      <div style={{ textAlign: 'center', fontWeight: 700, color: idx < 3 ? [colors.warning, colors.textTertiary, '#CD7F32'][idx] : colors.textTertiary, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 2 }}>
                        {idx < 3 ? <><Medal size={14} /> {idx + 1}</> : idx + 1}
                      </div>
                      <div style={{
                        fontWeight: 700,
                        color: colors.textPrimary,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}>{s.user}</div>
                      <div style={{ textAlign: 'center', fontWeight: 700, color: colors.info }}>{s.depositCount}</div>
                      <div style={{ textAlign: 'center', fontWeight: 700, color: colors.accent }}>{s.registerCount}</div>
                    </div>
                  ))}
              </div>
            ) : (
              <div style={{
                padding: '40px 20px',
                textAlign: 'center',
                color: colors.textTertiary,
                border: `2px dashed ${colors.borderLight}`,
                borderRadius: '12px',
                background: colors.bgSecondary,
              }}>
                <div style={{ marginBottom: '12px', opacity: 0.5 }}><Handshake size={48} /></div>
                <div>ยังไม่มีข้อมูล</div>
                <div style={{ fontSize: '13px', marginTop: '8px', color: colors.textSecondary }}>
                  กรุณาอัปโหลดไฟล์ Excel เพื่อเพิ่มข้อมูลแนะนำเพื่อน
                </div>
              </div>
            )}

            {/* ===== สิ้นสุดกิจกรรม — รางวัลแต่ละ Tier ===== */}
            {gameId && (
              <div style={{ marginTop: 20 }}>
                <div style={{
                  display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16,
                }}>
                  <div style={{
                    width: 36, height: 36, borderRadius: 10,
                    background: `${colors.warning}12`,
                    display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                  }}>
                    <Trophy size={18} color={colors.warning} />
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 16, fontWeight: 700, color: colors.textPrimary }}>
                      สิ้นสุดกิจกรรม
                    </div>
                    <div style={{ fontSize: 12, color: colors.textSecondary }}>
                      กำหนดรางวัลแต่ละ Tier แล้วกดจบกิจกรรม
                    </div>
                  </div>
                  {referralEnded && (
                    <div style={{
                      padding: '4px 12px', borderRadius: 999,
                      background: `${colors.success}12`,
                      border: `1px solid ${colors.success}30`,
                      fontSize: 11, fontWeight: 700, color: colors.success,
                      display: 'flex', alignItems: 'center', gap: 4,
                      flexShrink: 0,
                    }}>
                      <CheckCircle2 size={13} />
                      สิ้นสุดแล้ว
                    </div>
                  )}
                </div>

                {/* Prize Tier Inputs */}
                <div style={{
                  background: '#fff',
                  borderRadius: 14,
                  border: `1px solid ${colors.borderLight}`,
                  overflow: 'hidden',
                }}>
                  {[
                    { key: 'rank1' as const, label: 'อันดับ 1', Icon: Crown, color: '#f59e0b', bg: '#fef3c7' },
                    { key: 'rank2' as const, label: 'อันดับ 2', Icon: Medal, color: '#94a3b8', bg: '#f1f5f9' },
                    { key: 'rank3' as const, label: 'อันดับ 3', Icon: Award, color: '#ea580c', bg: '#fff7ed' },
                    { key: 'rank4to10' as const, label: 'อันดับ 4–10', Icon: Star, color: '#3b82f6', bg: '#eff6ff' },
                    { key: 'rank11to50' as const, label: 'อันดับ 11–50', Icon: Gift, color: '#8b5cf6', bg: '#f5f3ff' },
                  ].map((tier, idx, arr) => (
                    <div key={tier.key} style={{
                      display: 'flex', alignItems: 'center', gap: 12,
                      padding: '12px 16px',
                      borderBottom: idx < arr.length - 1 ? `1px solid ${colors.borderLight}` : 'none',
                    }}>
                      <div style={{
                        width: 28, height: 28, borderRadius: 8, flexShrink: 0,
                        background: tier.bg,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                      }}>
                        <tier.Icon size={15} color={tier.color} />
                      </div>
                      <div style={{ flex: 1, fontSize: 14, fontWeight: 600, color: colors.textPrimary }}>
                        {tier.label}
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
                        <input
                          type="number"
                          min={0}
                          value={referralPrizes[tier.key]}
                          onChange={(e) => {
                            const val = parseInt(e.target.value) || 0
                            setReferralPrizes((prev) => ({ ...prev, [tier.key]: val }))
                          }}
                          disabled={referralEnded}
                          style={{
                            width: 100, padding: '8px 12px', fontSize: 14, fontWeight: 700,
                            textAlign: 'right', borderRadius: 10,
                            border: `1.5px solid ${colors.borderMedium}`,
                            outline: 'none', background: referralEnded ? '#f8fafc' : '#fff',
                            color: colors.textPrimary,
                          }}
                        />
                        <span style={{ fontSize: 13, fontWeight: 600, color: colors.textSecondary }}>บาท</span>
                      </div>
                    </div>
                  ))}
                </div>

                {/* End Time Info */}
                {referralEnded && referralEndedAt && (
                  <div style={{
                    display: 'flex', alignItems: 'center', gap: 8,
                    marginTop: 12, padding: '10px 14px',
                    background: `${colors.success}06`,
                    border: `1px solid ${colors.success}20`,
                    borderRadius: 10,
                    fontSize: 13, color: colors.textSecondary, fontWeight: 500,
                  }}>
                    <Clock size={15} color={colors.success} style={{ flexShrink: 0 }} />
                    สิ้นสุดเมื่อ {new Date(referralEndedAt).toLocaleDateString('th-TH', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                  </div>
                )}

                {/* End Game Button */}
                {!referralEnded && (
                  <button
                    type="button"
                    disabled={referralEndingGame}
                    onClick={() => setReferralEndConfirmOpen(true)}
                    style={{
                      width: '100%', marginTop: 14,
                      display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                      padding: '14px 20px', fontSize: 15, fontWeight: 700,
                      color: '#fff',
                      background: 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)',
                      border: 'none', borderRadius: 12, cursor: 'pointer',
                      boxShadow: '0 4px 14px rgba(239,68,68,0.3)',
                      opacity: referralEndingGame ? 0.6 : 1,
                      transition: 'all 0.2s ease',
                    }}
                  >
                    {referralEndingGame ? (
                      <><Loader2 size={18} style={{ animation: 'spin 1s linear infinite' }} /> กำลังดำเนินการ...</>
                    ) : (
                      <><Flag size={18} /> จบกิจกรรม</>
                    )}
                  </button>
                )}

                {/* End Game Confirmation Popup — rendered via portal to escape stacking context */}
                {referralEndConfirmOpen && createPortal(
                  <div
                    onClick={() => setReferralEndConfirmOpen(false)}
                    style={{
                      position: 'fixed',
                      top: 0, left: 0, width: '100vw', height: '100vh',
                      background: 'rgba(0,0,0,0.45)', backdropFilter: 'blur(4px)',
                      zIndex: 99999,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      padding: 20, animation: 'fadeIn 0.25s ease',
                    }}
                  >
                    <div
                      onClick={(e) => e.stopPropagation()}
                      style={{
                        background: '#fff', borderRadius: 20,
                        padding: '32px 28px 24px', maxWidth: 380, width: '100%',
                        textAlign: 'center', boxShadow: '0 20px 60px rgba(0,0,0,0.2)',
                        animation: 'slideUp 0.3s ease',
                      }}
                    >
                      <div style={{
                        width: 56, height: 56, borderRadius: '50%', margin: '0 auto 16px',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        background: 'linear-gradient(135deg, rgba(239,68,68,0.12), rgba(220,38,38,0.12))',
                      }}>
                        <Flag size={26} color="#dc2626" />
                      </div>
                      <div style={{ fontSize: 18, fontWeight: 800, color: '#dc2626', marginBottom: 10 }}>
                        ยืนยันจบกิจกรรม?
                      </div>
                      <div style={{
                        display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 22,
                      }}>
                        <div style={{ fontSize: 14, color: colors.textSecondary, fontWeight: 500, padding: '6px 14px', background: colors.bgSecondary, borderRadius: 8 }}>
                          เมื่อจบแล้ว จะไม่สามารถแก้ไขรางวัลได้
                        </div>
                        <div style={{ fontSize: 14, color: colors.textSecondary, fontWeight: 500, padding: '6px 14px', background: colors.bgSecondary, borderRadius: 8 }}>
                          รางวัลจะแสดงในหน้าเกมผู้เล่นทันที
                        </div>
                      </div>
                      <div style={{ display: 'flex', gap: 10 }}>
                        <button
                          type="button"
                          onClick={() => setReferralEndConfirmOpen(false)}
                          style={{
                            flex: 1, padding: '12px 20px', fontSize: 14, fontWeight: 700,
                            color: colors.textSecondary, background: '#f1f5f9',
                            border: 'none', borderRadius: 12, cursor: 'pointer',
                          }}
                        >
                          ยกเลิก
                        </button>
                        <button
                          type="button"
                          disabled={referralEndingGame}
                          onClick={async () => {
                            setReferralEndConfirmOpen(false)
                            setReferralEndingGame(true)
                            try {
                              const now = Date.now()
                              setReferralEnded(true)
                              setReferralEndedAt(now)
                              await updateGame(gameId, {
                                'gameData.referral.prizes': referralPrizes,
                                'gameData.referral.ended': true,
                                'gameData.referral.endedAt': now,
                              })
                              setReferralPopup({
                                type: 'success',
                                title: 'จบกิจกรรมสำเร็จ',
                                lines: ['รางวัลแสดงในหน้าผู้เล่นแล้ว'],
                              })
                            } catch (err: any) {
                              setReferralEnded(false)
                              setReferralEndedAt(null)
                              setReferralPopup({
                                type: 'error',
                                title: 'เกิดข้อผิดพลาด',
                                lines: [err.message || 'ไม่สามารถจบกิจกรรมได้'],
                              })
                            } finally {
                              setReferralEndingGame(false)
                            }
                          }}
                          style={{
                            flex: 1, padding: '12px 20px', fontSize: 14, fontWeight: 700,
                            color: '#fff',
                            background: 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)',
                            border: 'none', borderRadius: 12, cursor: 'pointer',
                            boxShadow: '0 4px 14px rgba(239,68,68,0.3)',
                            opacity: referralEndingGame ? 0.6 : 1,
                          }}
                        >
                          ยืนยันจบกิจกรรม
                        </button>
                      </div>
                    </div>
                  </div>,
                  document.body
                )}
              </div>
            )}

            {/* Referral Result Popup */}
            {referralPopup && (
              <div
                onClick={() => setReferralPopup(null)}
                style={{
                  position: 'fixed',
                  inset: 0,
                  background: 'rgba(0,0,0,0.45)',
                  backdropFilter: 'blur(4px)',
                  zIndex: 99999,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  padding: '20px',
                  animation: 'fadeIn 0.25s ease',
                }}
              >
                <div
                  onClick={(e) => e.stopPropagation()}
                  style={{
                    background: '#fff',
                    borderRadius: '20px',
                    padding: '32px 28px 24px',
                    maxWidth: '380px',
                    width: '100%',
                    textAlign: 'center',
                    boxShadow: '0 20px 60px rgba(0,0,0,0.2)',
                    animation: 'slideUp 0.3s ease',
                  }}
                >
                  <div style={{
                    width: '56px',
                    height: '56px',
                    borderRadius: '50%',
                    margin: '0 auto 16px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '28px',
                    background: referralPopup.type === 'success'
                      ? `linear-gradient(135deg, ${colors.success}20, ${colors.successLight}20)`
                      : `linear-gradient(135deg, ${colors.danger}20, ${colors.dangerLight}20)`,
                  }}>
                    {referralPopup.type === 'success' ? '✅' : '❌'}
                  </div>
                  <div style={{
                    fontSize: '18px',
                    fontWeight: 800,
                    color: referralPopup.type === 'success' ? colors.success : colors.danger,
                    marginBottom: '14px',
                  }}>
                    {referralPopup.title}
                  </div>
                  <div style={{
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '6px',
                    marginBottom: '22px',
                  }}>
                    {referralPopup.lines.map((line, i) => (
                      <div key={i} style={{
                        fontSize: '14px',
                        color: colors.textSecondary,
                        fontWeight: 500,
                        padding: '6px 14px',
                        background: colors.bgSecondary,
                        borderRadius: '8px',
                      }}>
                        {line}
                      </div>
                    ))}
                  </div>
                  <button
                    onClick={() => setReferralPopup(null)}
                    style={{
                      padding: '10px 40px',
                      fontSize: '14px',
                      fontWeight: 700,
                      color: '#fff',
                      background: referralPopup.type === 'success'
                        ? `linear-gradient(135deg, ${colors.success} 0%, ${colors.successLight} 100%)`
                        : `linear-gradient(135deg, ${colors.danger} 0%, ${colors.dangerLight} 100%)`,
                      border: 'none',
                      borderRadius: '12px',
                      cursor: 'pointer',
                      boxShadow: referralPopup.type === 'success'
                        ? `0 4px 14px ${colors.success}40`
                        : `0 4px 14px ${colors.danger}40`,
                    }}
                  >
                    ตกลง
                  </button>
                </div>
              </div>
            )}

          </div>
        )}


         {/* ✅ เฉพาะเกมเช็คอิน (เพิ่มคอลัมน์เลือกวันที่) */}
         {type === 'เกมเช็คอิน' && (
           <>
             {/* รูปภาพแจ้งเตือน */}
             <div style={{ marginBottom: 20 }}>
               <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
                 <div style={{ width: 36, height: 36, borderRadius: 10, background: `${colors.primary}12`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                   <ImageIcon size={18} color={colors.primary} />
                 </div>
                 <div>
                   <div style={{ fontSize: 16, fontWeight: 700, color: colors.textPrimary }}>รูปภาพแจ้งเตือน</div>
                   <div style={{ fontSize: 12, color: colors.textSecondary }}>แสดงเมื่อผู้เล่นเข้าสู่ระบบสำเร็จ</div>
                 </div>
               </div>

               <input
                 type="file"
                 accept="image/*"
                 onChange={async (e) => {
                   const f = e.target.files?.[0]
                   if (!f) return
                   if (!/^image\//.test(f.type)) { alert('โปรดเลือกไฟล์รูปภาพเท่านั้น (JPG, PNG, GIF)'); return }
                   if (checkinImageDataUrl && checkinImageDataUrl.startsWith('blob:')) URL.revokeObjectURL(checkinImageDataUrl)
                   setCheckinFileName(f.name)
                   setCheckinImageFile(f)
                   try {
                     setCheckinImageDataUrl(URL.createObjectURL(f))
                   } catch {
                     setCheckinImageDataUrl(await fileToDataURL(f))
                   }
                 }}
                 hidden
                 ref={(el) => { if (el) (window as any).checkinImageInput = el }}
               />

               {!checkinImageDataUrl ? (
                 <div
                   onClick={() => (window as any).checkinImageInput?.click()}
                   style={{
                     border: `2px dashed ${colors.borderMedium}`,
                     borderRadius: 14,
                     padding: '36px 20px',
                     textAlign: 'center',
                     cursor: 'pointer',
                     transition: 'all 0.2s ease',
                     background: `${colors.primary}05`,
                   }}
                   onMouseEnter={(e) => { e.currentTarget.style.borderColor = colors.primary; e.currentTarget.style.background = `${colors.primary}10` }}
                   onMouseLeave={(e) => { e.currentTarget.style.borderColor = colors.borderMedium; e.currentTarget.style.background = `${colors.primary}05` }}
                 >
                   <div style={{ marginBottom: 12 }}><Camera size={40} color={colors.textTertiary} /></div>
                   <div style={{ fontSize: 16, fontWeight: 600, color: colors.textPrimary, marginBottom: 6 }}>คลิกเพื่อเลือกรูปภาพ</div>
                   <div style={{ fontSize: 13, color: colors.textTertiary }}>รองรับไฟล์ JPG, PNG, GIF (ขนาดไม่เกิน 10MB)</div>
                 </div>
               ) : (
                 <div style={{ background: '#fff', borderRadius: 14, padding: 16, border: `1px solid ${colors.borderLight}` }}>
                   <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, paddingBottom: 10, borderBottom: `1px solid ${colors.borderLight}` }}>
                     <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                       <CheckCircle2 size={16} color={colors.success} />
                       <span style={{ fontSize: 13, fontWeight: 600, color: colors.textPrimary, wordBreak: 'break-all' }}>
                         {checkinFileName || 'รูปภาพถูกอัปโหลดแล้ว'}
                       </span>
                     </div>
                     <div style={{ display: 'flex', gap: 6 }}>
                       <button type="button" className="dropzone-btn" onClick={() => (window as any).checkinImageInput?.click()} style={{ background: `${colors.primary}12`, border: `1px solid ${colors.primary}30`, borderRadius: 7, padding: '5px 10px', color: colors.primary, fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
                         <RotateCw size={13} /> เปลี่ยนรูป
                       </button>
                       <button type="button" className="dropzone-btn" onClick={() => { setCheckinImageDataUrl(''); setCheckinFileName('') }} style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: 7, padding: '5px 10px', color: '#dc2626', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
                         <Trash2 size={13} /> ลบรูป
                       </button>
                     </div>
                   </div>
                   <div style={{ textAlign: 'center' }}>
                     <img src={checkinImageDataUrl ? getImageUrl(checkinImageDataUrl) : ''} alt="Preview" style={{ maxWidth: '100%', maxHeight: 280, borderRadius: 10, boxShadow: '0 4px 16px rgba(0,0,0,0.08)', objectFit: 'contain', opacity: checkinImageUploading ? 0.5 : 1 }} />
                     <div style={{ marginTop: 10, fontSize: 12, color: colors.textTertiary, fontStyle: 'italic' }}>รูปภาพนี้จะแสดงใน popup เมื่อผู้เล่นเข้าสู่ระบบสำเร็จ</div>
                   </div>
                 </div>
               )}
             </div>
             <div style={{ borderBottom: `1px solid ${colors.borderLight}`, marginBottom: 20 }} />

             {/* ตั้งค่าช่องทางติดต่อ */}
             <div style={{ marginBottom: 20 }}>
               <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
                 <div style={{ width: 36, height: 36, borderRadius: 10, background: `${colors.primary}12`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                   <Phone size={18} color={colors.primary} />
                 </div>
                 <div>
                   <div style={{ fontSize: 16, fontWeight: 700, color: colors.textPrimary }}>ตั้งค่าช่องทางติดต่อ (หน้าเกม)</div>
                   <div style={{ fontSize: 12, color: colors.textSecondary }}>ข้อมูลส่วนนี้จะแสดงในหน้าเกมเช็คอิน</div>
                 </div>
               </div>

               <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end', flexWrap: 'wrap' }}>
                 <div style={{ flex: 1, minWidth: 140 }}>
                   <label className="admin-f-label">Telegram</label>
                   <input className="admin-f-control" value={checkinContactSettings.telegramUrl} onChange={(e) => setCheckinContactSettings((prev) => ({ ...prev, telegramUrl: e.target.value }))} placeholder="https://t.me/..." />
                 </div>
                 <div style={{ flex: 1, minWidth: 140 }}>
                   <label className="admin-f-label">LINE</label>
                   <input className="admin-f-control" value={checkinContactSettings.lineUrl} onChange={(e) => setCheckinContactSettings((prev) => ({ ...prev, lineUrl: e.target.value }))} placeholder="https://lin.ee/..." />
                 </div>
                 <div style={{ flex: 1, minWidth: 140 }}>
                   <label className="admin-f-label">เว็บไซต์</label>
                   <input className="admin-f-control" value={checkinContactSettings.websiteUrl} onChange={(e) => setCheckinContactSettings((prev) => ({ ...prev, websiteUrl: e.target.value }))} placeholder="https://..." />
                 </div>
                 <div style={{ flex: '0 0 130px', minWidth: 100 }}>
                   <label className="admin-f-label">ชื่อเว็บไซต์</label>
                   <input className="admin-f-control" value={checkinContactSettings.websiteLabel} onChange={(e) => setCheckinContactSettings((prev) => ({ ...prev, websiteLabel: e.target.value }))} placeholder="HENG36" />
                 </div>
                 <div style={{ flex: '0 0 auto' }}>
                   <button type="button" className="btn-upload" onClick={saveCheckinContactSettings} disabled={checkinContactSettingsSaving || !isEdit} style={{ whiteSpace: 'nowrap' }}>
                     {checkinContactSettingsSaving ? 'กำลังบันทึก...' : 'บันทึก'}
                   </button>
                 </div>
               </div>
             </div>
             <div style={{ borderBottom: `1px solid ${colors.borderLight}`, marginBottom: 20 }} />

             {/* ตารางรางวัลเช็คอิน + รางวัลครบทุกวัน */}
             {checkinFeatures.dailyReward && (
             <div style={{ display: 'flex', gap: 20, marginBottom: 20, alignItems: 'flex-start' }}>
             <div style={{ flex: 1, minWidth: 0 }}>
               <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
                 <div style={{ width: 36, height: 36, borderRadius: 10, background: `${colors.primary}12`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                   <Gift size={18} color={colors.primary} />
                 </div>
                 <div>
                   <div style={{ fontSize: 16, fontWeight: 700, color: colors.textPrimary }}>ตารางรางวัลเช็คอิน</div>
                   <div style={{ fontSize: 12, color: colors.textSecondary }}>กำหนดจำนวนวันและรางวัลสำหรับแต่ละวันเช็คอิน</div>
                 </div>
               </div>

                 <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
                   <div>
                     <label className="admin-f-label">วันที่เริ่มต้นกิจกรรม</label>
                     <input
                       type="date"
                       className="admin-f-control"
                       value={checkinStartDate}
                       onChange={(e) => {
                         const newStartDate = e.target.value
                         setCheckinStartDate(newStartDate)
                         if (checkinEndDate && newStartDate > checkinEndDate) {
                           setCheckinEndDate('')
                         }
                       }}
                       max={checkinEndDate || undefined}
                       placeholder="เลือกวันที่เริ่มต้น"
                     />
                   </div>
                   <div>
                     <label className="admin-f-label">วันที่สิ้นสุดกิจกรรม</label>
                     <input
                       type="date"
                       className="admin-f-control"
                       value={checkinEndDate}
                       onChange={(e) => setCheckinEndDate(e.target.value)}
                       min={checkinStartDate || undefined}
                       placeholder="เลือกวันที่สิ้นสุด"
                     />
                     {checkinStartDate && checkinEndDate && checkinEndDate >= checkinStartDate && (
                       <div style={{ fontSize: 12, color: colors.success, marginTop: 4, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 4 }}>
                         <CheckCircle2 size={12} /> ระยะเวลา: {calculateDaysFromDates(checkinStartDate, checkinEndDate)} วัน
                       </div>
                     )}
                   </div>
                 </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))', gap: 8 }}>
              {rewards.slice(0, checkinDays).map((r, i) => (
                <div
                  key={i}
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 4,
                    padding: '10px 12px',
                    borderRadius: 10,
                    border: `1px solid ${colors.borderLight}`,
                    background: colors.bgSecondary,
                  }}
                >
                  <div style={{ fontSize: 12, fontWeight: 700, color: colors.textSecondary }}>Day {i + 1}</div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    <input
                      type="number"
                      min={0}
                      className="admin-f-control"
                      value={Number(r.value) || 0}
                      onChange={(e) => {
                        const v = clamp(Number(e.target.value) || 0, 0, 99999999)
                        setRewards(prev => {
                          const next = [...prev]; next[i] = { ...next[i], kind: 'coin', value: v }; return next
                        })
                      }}
                      style={{ textAlign: 'center', padding: '6px 4px', fontSize: 14, fontWeight: 600 }}
                      placeholder="0"
                    />
                  </div>
                  <div style={{ fontSize: 11, color: colors.textTertiary, textAlign: 'center' }}>{coinName}</div>
                </div>
              ))}
            </div>
             </div>

             <div style={{ width: 1, alignSelf: 'stretch', background: colors.borderLight, flexShrink: 0 }} />

             <div style={{ flex: '0 0 340px', minWidth: 0 }}>
               <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
                 <div style={{ width: 36, height: 36, borderRadius: 10, background: `${colors.primary}12`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                   <Trophy size={18} color={colors.primary} />
                 </div>
                 <div>
                   <div style={{ fontSize: 16, fontWeight: 700, color: colors.textPrimary }}>รางวัลครบทุกวัน</div>
                   <div style={{ fontSize: 12, color: colors.textSecondary }}>รางวัลสำหรับผู้ที่เช็คอินครบทุกวัน ({checkinDays} วัน)</div>
                 </div>
               </div>
                 <div>
                   <div style={{ display: 'flex', gap: 12, alignItems: 'flex-end', flexWrap: 'wrap' }}>
                     <div>
                       <label className="admin-f-label">ของรางวัล</label>
                       <div style={{ display: 'inline-flex', borderRadius: 10, overflow: 'hidden', border: `1px solid ${colors.borderLight}`, background: colors.bgSecondary }}>
                         {([
                           { value: 'coin' as const, label: coinName, icon: <Coins size={14} /> },
                           { value: 'code' as const, label: 'CODE', icon: <Ticket size={14} /> },
                         ]).map((opt) => {
                           const isActive = completeReward.kind === opt.value
                           return (
                             <button
                               key={opt.value}
                               type="button"
                               className="dropzone-btn"
                               onClick={() => setCompleteReward(prev => ({
                                 kind: opt.value,
                                 value: opt.value === 'coin' ? (Number(prev.value) || 0) : String(prev.value || '')
                               }))}
                               style={{
                                 display: 'flex', alignItems: 'center', gap: 6,
                                 padding: '8px 18px',
                                 fontSize: 13, fontWeight: isActive ? 700 : 500,
                                 color: isActive ? colors.primary : colors.textTertiary,
                                 background: isActive ? '#fff' : 'transparent',
                                 border: 'none',
                                 cursor: 'pointer',
                                 transition: 'all 0.15s ease',
                                 boxShadow: isActive ? `0 0 0 1.5px ${colors.primary}40, 0 1px 3px rgba(0,0,0,0.06)` : 'none',
                                 borderRadius: isActive ? 9 : 0,
                                 margin: 2,
                               }}
                             >
                               {React.cloneElement(opt.icon, { color: isActive ? colors.primary : colors.textTertiary })}
                               {opt.label}
                             </button>
                           )
                         })}
                       </div>
                     </div>

                   {completeReward.kind === 'coin' && (
                     <div style={{ width: 200 }}>
                       <label className="admin-f-label">จำนวน {coinName}</label>
                       <input
                         type="number"
                         min={0}
                         className="admin-f-control"
                         value={Number(completeReward.value) || 0}
                         onChange={(e) => {
                           const v = clamp(Number(e.target.value) || 0, 0, 99999999)
                           setCompleteReward(prev => ({ ...prev, value: v }))
                         }}
                         placeholder="0"
                       />
                     </div>
                   )}
                   </div>

                   {completeReward.kind === 'code' && (
                    <div style={{ marginTop: 8 }}>
                      {(() => {
                        return (
                          <>
                             <div style={{ marginBottom: 8 }}>
                               <input
                                 type="file"
                                 accept=".xlsx,.xls,.csv,.txt"
                                 onChange={async (e) => {
                                   const file = e.target.files?.[0]
                                   if (!file) return

                                    try {
                                     const codes = await parseCodesFromFile(file)
                                     if (codes.length > 0) {
                                       setConfirmCodeUpload({
                                         open: true,
                                         type: 'completeReward',
                                         index: null,
                                         codes: codes,
                                         onConfirm: async () => {
                                           setCompleteReward(prev => ({ ...prev, value: '' }))
                                           setCompleteRewardCodes(codes)
                                           setCompleteRewardCodeCount(codes.length)
                                           
                                           if (isEdit && gameId && type === 'เกมเช็คอิน') {
                                             try {
                                               const currentGame = (await getGameById(gameId) || {}) as GameData
                                               const currentCheckin = (currentGame as any).checkin || {}
                                               currentCheckin.completeRewardCodes = {
                                                 cursor: 0,
                                                 codes: codes
                                               }
                                               await updateGame(gameId, {
                                                 checkin: currentCheckin
                                               })
                                               alert(`อัปโหลด CODE สำเร็จ ${codes.length.toLocaleString('th-TH')} รายการ`)
                                             } catch (error) {
                                               console.error('Error saving codes:', error)
                                               alert('เกิดข้อผิดพลาดในการบันทึกโค้ด')
                                             }
                                           } else {
                                             alert(`อัปโหลด CODE สำเร็จ ${codes.length.toLocaleString('th-TH')} รายการ (จะบันทึกเมื่อกดบันทึกเกม)`)
                                           }
                                           
                                           setConfirmCodeUpload({
                                             open: false,
                                             type: null,
                                             index: null,
                                             codes: null,
                                             onConfirm: null
                                           })
                                         }
                                       })
                                     } else {
                                       alert('ไม่พบ CODE ที่ตรงเงื่อนไขในไฟล์\nตรวจสอบคอลัมน์ E (serialcode) และคอลัมน์ G, H, K ต้องว่าง')
                                     }
                                   } catch (error) {
                                     console.error('Error loading file:', error)
                                     alert('เกิดข้อผิดพลาดในการอ่านไฟล์')
                                   } finally {
                                     if (e.target) {
                                       e.target.value = ''
                                     }
                                   }
                                 }}
                                 style={{ display: 'none' }}
                                 id="complete-reward-code-upload"
                               />
                               <label
                                 htmlFor="complete-reward-code-upload"
                                 style={{
                                   display: 'flex',
                                   alignItems: 'center',
                                   gap: 12,
                                   padding: '14px 18px',
                                   borderRadius: 12,
                                   border: `2px dashed ${colors.borderLight}`,
                                   background: colors.bgSecondary,
                                   cursor: 'pointer',
                                   transition: 'all 0.2s ease',
                                 }}
                               >
                                 <div style={{
                                   width: 40, height: 40, borderRadius: 10,
                                   background: `${colors.textSecondary}10`,
                                   display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                                 }}>
                                   <FileSpreadsheet size={20} color={colors.textSecondary} />
                                 </div>
                                 <div style={{ flex: 1, minWidth: 0 }}>
                                   <div style={{ fontSize: 14, fontWeight: 600, color: colors.textPrimary }}>เลือกไฟล์ CODE</div>
                                   <div style={{ fontSize: 12, color: colors.textSecondary, marginTop: 2 }}>.xlsx, .csv, .txt</div>
                                 </div>
                                 <div style={{
                                   padding: '6px 14px', borderRadius: 8,
                                   background: colors.primary, color: '#fff',
                                   fontSize: 13, fontWeight: 600, flexShrink: 0,
                                   display: 'flex', alignItems: 'center', gap: 6,
                                 }}>
                                   <Upload size={14} /> เลือกไฟล์
                                 </div>
                               </label>
                             </div>
                             
                             <div
                               style={{
                                 marginTop: 8,
                                 border: completeRewardCodes.length > 0 ? `2px solid ${colors.warning || '#f59e0b'}` : `1px solid ${colors.borderLight}`,
                                 borderRadius: 10,
                                 padding: 14,
                                 background: completeRewardCodes.length > 0 ? `${colors.warning || '#f59e0b'}12` : colors.bgSecondary,
                                 textAlign: 'center'
                               }}
                             >
                               {completeRewardCodeCountLoading ? (
                                 <div className="admin-muted" style={{ padding: 6 }}>กำลังโหลดจำนวนโค้ด...</div>
                               ) : completeRewardCodes.length > 0 ? (
                                 <div style={{ color: colors.warning || '#d97706', fontWeight: 600, fontSize: 13 }}>
                                   อัพโหลด CODE ใหม่แล้ว: {completeRewardCodes.length.toLocaleString('th-TH')} รายการ
                                   <div style={{ fontSize: 12, color: colors.textSecondary, marginTop: 4, fontWeight: 500, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4 }}>
                                     <AlertTriangle size={12} /> โค้ดใหม่รอการบันทึก
                                   </div>
                                 </div>
                               ) : completeRewardCodeCount > 0 ? (
                                 <div style={{ color: colors.success, fontWeight: 600, fontSize: 13, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4 }}>
                                   <CheckCircle2 size={14} /> มีโค้ด {completeRewardCodeCount.toLocaleString('th-TH')} รายการในฐานข้อมูล
                                 </div>
                               ) : (
                                 <div className="admin-muted" style={{ padding: 6, fontSize: 13 }}>ยังไม่มี CODE (อัพโหลดไฟล์เพื่อเพิ่มโค้ด)</div>
                               )}
                             </div>
                           </>
                         )
                       })()}
                     </div>
                   )}
                 </div>
             </div>
             </div>
             )}

             <div style={{ borderBottom: `1px solid ${colors.borderLight}`, marginBottom: 20 }} />

             {/* Coupon Shop */}
             <div style={{ marginBottom: 20 }}>
               <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
                 <div style={{ width: 36, height: 36, borderRadius: 10, background: `${colors.primary}12`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                   <Ticket size={18} color={colors.primary} />
                 </div>
                 <div style={{ flex: 1 }}>
                   <div style={{ fontSize: 16, fontWeight: 700, color: colors.textPrimary }}>Coupon Shop</div>
                   <div style={{ fontSize: 12, color: colors.textSecondary }}>ตั้งค่าร้านแลกโค้ดในหน้าเช็คอิน</div>
                 </div>
                 <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                   <label style={{ fontSize: 13, fontWeight: 600, color: colors.textSecondary, whiteSpace: 'nowrap' }}>จำนวนรายการ</label>
                   <input
                     type="number"
                     min={1}
                     max={12}
                     className="admin-f-control"
                     value={couponCount}
                     onChange={(e) => {
                       const n = clamp(Number(e.target.value) || 1, 1, 12)
                       setCouponCount(n)
                       setCouponItems(prev => {
                         const next = [...prev]
                         if (next.length < n) {
                           while (next.length < n) next.push({ title: '', rewardCredit: 0, price: 0, codes: [''] })
                         } else {
                           next.length = n
                         }
                         return next
                       })
                     }}
                     style={{ width: 70, textAlign: 'center' }}
                   />
                 </div>
               </div>
                  <div>

                      <div style={{ marginTop: 10, display: 'grid', gridTemplateColumns: `repeat(${Math.min(couponCount, 4)}, 1fr)`, gap: 12 }}>
                        {couponItems.slice(0, couponCount).map((it, i) => (
                          <div key={i} style={{ border: `1px solid ${colors.borderLight}`, borderRadius: 12, padding: 14, display: 'flex', flexDirection: 'column', gap: 8 }}>
                            <div style={{ fontWeight: 700, color: colors.textPrimary, fontSize: 13, marginBottom: 2 }}>คูปอง #{i + 1}</div>

                            <div>
                              <label className="admin-f-label" style={{ fontSize: 11 }}>ชื่อรายการ <span style={{ color: '#ef4444' }}>*</span></label>
                              <input
                                className="admin-f-control"
                                type="text"
                                placeholder="เช่น NO1, Premium"
                                value={it.title || ''}
                                onChange={e => {
                                  const v = e.target.value
                                  setCouponItems(prev => { const n = [...prev]; n[i] = { ...n[i], title: v }; return n })
                                }}
                                required
                              />
                            </div>

                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                              <div>
                                <label className="admin-f-label" style={{ fontSize: 11 }}>เครดิตโบนัส</label>
                                <input
                                  type="number"
                                  className="admin-f-control"
                                  value={it.rewardCredit}
                                  onChange={e => {
                                    const v = Number(e.target.value) || 0
                                    setCouponItems(prev => { const n = [...prev]; n[i] = { ...n[i], rewardCredit: v }; return n })
                                  }}
                                  placeholder="0"
                                />
                              </div>
                              <div>
                                <label className="admin-f-label" style={{ fontSize: 11 }}>ราคา ({coinName})</label>
                                <input
                                  type="number"
                                  className="admin-f-control"
                                  value={it.price}
                                  onChange={e => {
                                    const v = Number(e.target.value) || 0
                                    setCouponItems(prev => { const n = [...prev]; n[i] = { ...n[i], price: v }; return n })
                                  }}
                                  placeholder="0"
                                />
                              </div>
                            </div>

                            <div style={{ marginTop: 'auto', paddingTop: 8 }}>
                              <input
                                id={`import-codes-${i}`}
                                type="file"
                                accept=".xlsx,.xls,.csv,.txt"
                                style={{ display:'none' }}
                                onChange={async (e) => {
                                  const f = e.currentTarget.files?.[0]
                                  if (!f) return
                                  try {
                                    const codes = await parseCodesFromFile(f)
                                    if (!codes.length) {
                                      alert('ไม่พบ CODE ที่ตรงเงื่อนไขในไฟล์\nตรวจสอบคอลัมน์ E (serialcode) และคอลัมน์ G, H, K ต้องว่าง')
                                      return
                                    }
                                    setConfirmCodeUpload({
                                      open: true,
                                      type: 'couponItem',
                                      index: i,
                                      codes: codes,
                                      onConfirm: async () => {
                                        setCouponItems(prev => {
                                          const next = [...prev]
                                          next[i] = { ...next[i], codes: [''] }
                                          return next
                                        })
                                        setCouponItemCodesNew(prev => { const next = [...prev]; next[i] = codes; return next })
                                        setCouponItemCodeCounts(prev => { const next = [...prev]; next[i] = codes.length; return next })
                                        if (isEdit && gameId && type === 'เกมเช็คอิน') {
                                          try {
                                            const currentGame = (await getGameById(gameId) || {}) as GameData
                                            const currentCheckin = (currentGame as any).gameData?.checkin || {}
                                            if (!currentCheckin.coupon) currentCheckin.coupon = {}
                                            if (!currentCheckin.coupon.items) currentCheckin.coupon.items = []
                                            if (!currentCheckin.coupon.items[i]) currentCheckin.coupon.items[i] = {}
                                            currentCheckin.coupon.items[i].codes = codes
                                            await updateGame(gameId, { ...currentGame, gameData: { ...(currentGame as any).gameData, checkin: currentCheckin } })
                                            alert(`อัปโหลด CODE สำเร็จ ${codes.length.toLocaleString('th-TH')} รายการ`)
                                          } catch (error) {
                                            console.error('Error saving codes:', error)
                                            alert('เกิดข้อผิดพลาดในการบันทึกโค้ด')
                                          }
                                        } else {
                                          alert(`อัปโหลด CODE สำเร็จ ${codes.length.toLocaleString('th-TH')} รายการ (จะบันทึกเมื่อกดบันทึกเกม)`)
                                        }
                                        setConfirmCodeUpload({ open: false, type: null, index: null, codes: null, onConfirm: null })
                                      }
                                    })
                                  } catch (err:any) { alert(err?.message || 'นำเข้าไม่สำเร็จ') }
                                  finally { if (e.currentTarget) e.currentTarget.value = '' }
                                }}
                              />
                              <label
                                htmlFor={`import-codes-${i}`}
                                className="dropzone-btn"
                                style={{
                                  display: 'flex', alignItems: 'center', gap: 12,
                                  padding: '14px 18px', borderRadius: 12,
                                  border: `2px dashed ${colors.borderLight}`,
                                  background: colors.bgSecondary,
                                  cursor: 'pointer', transition: 'all 0.2s ease',
                                }}
                              >
                                <div style={{
                                  width: 40, height: 40, borderRadius: 10,
                                  background: `${colors.textSecondary}10`,
                                  display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                                }}>
                                  <FileSpreadsheet size={20} color={colors.textSecondary} />
                                </div>
                                <div style={{ flex: 1, minWidth: 0 }}>
                                  <div style={{ fontSize: 14, fontWeight: 600, color: colors.textPrimary }}>เลือกไฟล์ CODE</div>
                                  <div style={{ fontSize: 12, color: colors.textSecondary, marginTop: 2 }}>.xlsx, .csv, .txt</div>
                                </div>
                                <div style={{
                                  padding: '6px 14px', borderRadius: 8,
                                  background: colors.primary, color: '#fff',
                                  fontSize: 13, fontWeight: 600, flexShrink: 0,
                                  display: 'flex', alignItems: 'center', gap: 6,
                                }}>
                                  <Upload size={14} /> เลือกไฟล์
                                </div>
                              </label>
                              <div
                                style={{
                                  marginTop: 8,
                                  border: couponItemCodesNew[i] && couponItemCodesNew[i].length > 0 ? `2px solid ${colors.warning || '#f59e0b'}` : `1px solid ${colors.borderLight}`,
                                  borderRadius: 10,
                                  padding: 14,
                                  background: couponItemCodesNew[i] && couponItemCodesNew[i].length > 0 ? `${colors.warning || '#f59e0b'}12` : colors.bgSecondary,
                                  textAlign: 'center'
                                }}
                              >
                                {couponItemCodeCountsLoading ? (
                                  <div className="admin-muted" style={{ padding: 6 }}>กำลังโหลดจำนวนโค้ด...</div>
                                ) : couponItemCodesNew[i] && couponItemCodesNew[i].length > 0 ? (
                                  <div style={{ color: colors.warning || '#d97706', fontWeight: 600, fontSize: 13 }}>
                                    อัพโหลด CODE ใหม่แล้ว: {couponItemCodesNew[i].length.toLocaleString('th-TH')} รายการ
                                    <div style={{ fontSize: 12, color: colors.textSecondary, marginTop: 4, fontWeight: 500, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4 }}>
                                      <AlertTriangle size={12} /> โค้ดใหม่รอการบันทึก
                                    </div>
                                  </div>
                                ) : couponItemCodeCounts[i] !== undefined && couponItemCodeCounts[i] > 0 ? (
                                  <div style={{ color: colors.success, fontWeight: 600, fontSize: 13, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4 }}>
                                    <CheckCircle2 size={14} /> มีโค้ด {couponItemCodeCounts[i].toLocaleString('th-TH')} รายการในฐานข้อมูล
                                  </div>
                                ) : (
                                  <div className="admin-muted" style={{ padding: 6, fontSize: 13 }}>ยังไม่มี CODE (อัพโหลดไฟล์เพื่อเพิ่มโค้ด)</div>
                                )}
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                  </div>
             </div>
     
          </>
              
        )}

        {/* ===== สิ้นสุดกิจกรรม (เกมบอลโลก) — ผลแข่งจริง + แจกโค้ดรางวัลรายคู่ ===== */}
        {isEdit && type === 'เกมบอลโลก' && (
          <div style={{ marginTop: 20 }}>
            <div style={{ borderBottom: `1px solid ${colors.borderLight}`, marginBottom: 20 }} />

            {/* ===== รูปภาพแจ้งเตือนเข้าสู่เกม ===== */}
            <div style={{ marginBottom: 20 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
                <div style={{
                  width: 36, height: 36, borderRadius: 10,
                  background: `${colors.primary}12`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                }}>
                  <ImageIcon size={18} color={colors.primary} />
                </div>
                <div>
                  <div style={{ fontSize: 16, fontWeight: 700, color: colors.textPrimary }}>
                    รูปภาพแจ้งเตือน
                  </div>
                  <div style={{ fontSize: 12, color: colors.textSecondary }}>
                    แสดง popup เมื่อผู้เล่นเข้าสู่เกมบอลโลก
                  </div>
                </div>
              </div>

              <input
                type="file"
                accept="image/*"
                onChange={async (e) => {
                  const f = e.target.files?.[0]
                  if (!f) return
                  if (!/^image\//.test(f.type)) {
                    alert('โปรดเลือกไฟล์รูปภาพเท่านั้น (JPG, PNG, GIF)')
                    return
                  }
                  if (worldCupNoticeImageDataUrl && worldCupNoticeImageDataUrl.startsWith('blob:')) {
                    URL.revokeObjectURL(worldCupNoticeImageDataUrl)
                  }
                  setWorldCupNoticeImageFileName(f.name)
                  setWorldCupNoticeImageFile(f)
                  try {
                    const previewUrl = URL.createObjectURL(f)
                    setWorldCupNoticeImageDataUrl(previewUrl)
                  } catch {
                    const data = await fileToDataURL(f)
                    setWorldCupNoticeImageDataUrl(data)
                  }
                }}
                hidden
                ref={(el) => { if (el) (window as any).worldCupNoticeImageInput = el }}
              />

              {!worldCupNoticeImageDataUrl ? (
                <div
                  onClick={() => (window as any).worldCupNoticeImageInput?.click()}
                  style={{
                    border: `2px dashed ${colors.borderMedium}`,
                    borderRadius: 14,
                    padding: '36px 20px',
                    textAlign: 'center',
                    cursor: 'pointer',
                    transition: 'all 0.2s ease',
                    background: `${colors.primary}05`,
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.borderColor = colors.primary
                    e.currentTarget.style.background = `${colors.primary}10`
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.borderColor = colors.borderMedium
                    e.currentTarget.style.background = `${colors.primary}05`
                  }}
                >
                  <div style={{ marginBottom: 12 }}><Camera size={40} color="#94a3b8" /></div>
                  <div style={{ fontSize: 16, fontWeight: 600, color: colors.textPrimary, marginBottom: 6 }}>
                    คลิกเพื่อเลือกรูปภาพ
                  </div>
                  <div style={{ fontSize: 13, color: colors.textTertiary }}>
                    รองรับไฟล์ JPG, PNG, GIF (ขนาดไม่เกิน 10MB)
                  </div>
                </div>
              ) : (
                <div style={{
                  background: '#fff',
                  borderRadius: 14,
                  padding: 16,
                  border: `1px solid ${colors.borderLight}`,
                }}>
                  <div style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    marginBottom: 12,
                    paddingBottom: 10,
                    borderBottom: `1px solid ${colors.borderLight}`,
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <CheckCircle2 size={16} color={colors.success} />
                      <span style={{ fontSize: 13, fontWeight: 600, color: colors.textPrimary, wordBreak: 'break-all' }}>
                        {worldCupNoticeImageFileName || 'รูปภาพถูกอัปโหลดแล้ว'}
                      </span>
                    </div>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <button
                        type="button"
                        onClick={() => (window as any).worldCupNoticeImageInput?.click()}
                        style={{
                          background: `${colors.primary}12`,
                          border: `1px solid ${colors.primary}30`,
                          borderRadius: 7,
                          padding: '5px 10px',
                          color: colors.primary,
                          fontSize: 12,
                          fontWeight: 600,
                          cursor: 'pointer',
                          display: 'inline-flex', alignItems: 'center', gap: 4,
                        }}
                      ><RotateCw size={13} /> เปลี่ยนรูป</button>
                      <button
                        type="button"
                        onClick={() => {
                          if (worldCupNoticeImageDataUrl.startsWith('blob:')) URL.revokeObjectURL(worldCupNoticeImageDataUrl)
                          setWorldCupNoticeImageDataUrl('')
                          setWorldCupNoticeImageFileName('')
                          setWorldCupNoticeImageFile(null)
                        }}
                        style={{
                          background: 'rgba(239,68,68,0.08)',
                          border: '1px solid rgba(239,68,68,0.2)',
                          borderRadius: 7,
                          padding: '5px 10px',
                          color: '#dc2626',
                          fontSize: 12,
                          fontWeight: 600,
                          cursor: 'pointer',
                          display: 'inline-flex', alignItems: 'center', gap: 4,
                        }}
                      ><Trash2 size={13} /> ลบรูป</button>
                    </div>
                  </div>
                  <div style={{ textAlign: 'center' }}>
                    <img
                      src={worldCupNoticeImageDataUrl ? getImageUrl(worldCupNoticeImageDataUrl) : ''}
                      alt="Preview"
                      style={{
                        maxWidth: '100%',
                        maxHeight: 280,
                        borderRadius: 10,
                        boxShadow: '0 4px 16px rgba(0,0,0,0.08)',
                        objectFit: 'contain',
                        opacity: worldCupNoticeImageUploading ? 0.5 : 1,
                      }}
                    />
                    <div style={{ marginTop: 10, fontSize: 12, color: colors.textTertiary, fontStyle: 'italic' }}>
                      รูปนี้จะแสดงเป็น popup เมื่อผู้เล่นเข้าสู่เกมบอลโลก
                    </div>
                  </div>
                </div>
              )}
            </div>

            <div style={{ borderBottom: `1px solid ${colors.borderLight}`, marginBottom: 20 }} />

            {/* ===== ตั้งค่าโบนัสต่อคู่ ===== */}
            <div style={{
              marginBottom: 16,
              background: 'linear-gradient(135deg, #fff7ed 0%, #fffbeb 100%)',
              border: '1px solid #fed7aa',
              borderRadius: 14,
              padding: '14px 16px',
              display: 'flex',
              alignItems: 'center',
              gap: 14,
              flexWrap: 'wrap',
            }}>
              <div style={{
                width: 44, height: 44, borderRadius: 12,
                background: 'linear-gradient(135deg, #f59e0b, #d97706)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 22, flexShrink: 0,
                boxShadow: '0 2px 8px rgba(245, 158, 11, 0.3)',
              }}>💰</div>
              <div style={{ flex: 1, minWidth: 200 }}>
                <div style={{ fontSize: 14, fontWeight: 800, color: '#92400e' }}>โบนัสสะสมต่อคู่ที่ทายถูก</div>
                <div style={{ fontSize: 12, color: '#a16207', marginTop: 2, lineHeight: 1.5 }}>
                  ผู้เล่นที่ทายสกอร์ถูกจะได้ <b>โบนัสสะสม</b> ตามจำนวนนี้เมื่อแอดมินกด <b>"สิ้นสุดกิจกรรมคู่นี้"</b> — สะสมเพิ่มเรื่อยๆ ทุกคู่ที่ถูก (แสดงในหน้าเกมเท่านั้น)
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                <input
                  type="number"
                  min={0}
                  max={100000}
                  step={10}
                  value={Number.isFinite(worldCupBonusPerCorrect) ? worldCupBonusPerCorrect : 0}
                  onChange={(e) => {
                    const v = Number(e.target.value)
                    setWorldCupBonusPerCorrect(Number.isFinite(v) && v >= 0 ? Math.min(100000, Math.floor(v)) : 0)
                  }}
                  style={{
                    width: 110, padding: '10px 12px', borderRadius: 10,
                    border: '2px solid #fbbf24', background: '#fff',
                    fontSize: 18, fontWeight: 800, textAlign: 'center',
                    color: '#92400e', outline: 'none',
                  }}
                />
                <div style={{ fontSize: 13, fontWeight: 700, color: '#92400e' }}>แต้ม / คู่</div>
              </div>
            </div>

            <WorldCupAdminResults
              value={worldCupResults}
              onChange={setWorldCupResults}
              predictionStats={worldCupPredictionStats}
              correctGuessers={worldCupWinnersByMatch}
              parseCodesFromFile={parseCodesFromFile}
              onEndMatch={handleEndWorldCupMatch}
              onReopenMatch={handleReopenWorldCupMatch}
              onRefreshStats={loadWorldCupStats}
              busyMatchId={worldCupBusyMatchId}
              bonusPerCorrect={worldCupBonusPerCorrect}
              themeName={themeName}
              telegramMessage={worldCupTelegramMessage}
              onTelegramMessageChange={setWorldCupTelegramMessage}
              onSaveTelegramTemplate={saveWorldCupTelegramTemplate}
              telegramTemplateSaving={worldCupTelegramTemplateSaving}
              telegramUploadingMatchId={worldCupTelegramUploadingMatchId}
              telegramSendingMatchId={worldCupTelegramSendingMatchId}
              onUploadMatchImage={handleUploadWorldCupMatchImage}
              onClearMatchImage={handleClearWorldCupMatchImage}
              onSendMatchTelegram={sendWorldCupMatchTelegram}
              telegramDefaultTemplate={DEFAULT_WORLD_CUP_WINNERS_TEMPLATE}
            />
            <div style={{
              marginTop: 14,
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              gap: 10, flexWrap: 'wrap',
              background: '#fff',
              border: '1px solid #e2e8f0',
              borderRadius: 12,
              padding: '12px 14px',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <input
                  type="checkbox"
                  id="wc-ended"
                  checked={worldCupEnded}
                  onChange={(e) => {
                    setWorldCupEnded(e.target.checked)
                    if (e.target.checked && !worldCupEndedAt) setWorldCupEndedAt(Date.now())
                    if (!e.target.checked) setWorldCupEndedAt(null)
                  }}
                  style={{ width: 16, height: 16, cursor: 'pointer' }}
                />
                <label htmlFor="wc-ended" style={{ fontSize: 13, fontWeight: 700, color: '#1f2937', cursor: 'pointer' }}>
                  ปิดกิจกรรมทั้งหมด (กันการทายของทุกคู่ที่ยังไม่เริ่ม)
                </label>
              </div>
              {worldCupEnded && worldCupEndedAt && (
                <div style={{ fontSize: 11, color: '#64748b', fontWeight: 600 }}>
                  ปิดเมื่อ {(() => { try { return new Date(worldCupEndedAt).toLocaleString('th-TH', { hour12: false }) } catch { return '' } })()}
                </div>
              )}
            </div>
            <div style={{
              marginTop: 10, fontSize: 12, color: '#64748b',
              padding: '10px 14px',
              background: '#f8fafc',
              border: '1px dashed #cbd5e1',
              borderRadius: 10,
            }}>
              💡 ปุ่ม <b>"สิ้นสุดกิจกรรมคู่นี้"</b> จะ <b>บันทึกโบนัสสะสม</b> ให้ผู้ทายถูก <b>ทุกคน</b> และ <b>แจกโค้ด</b> ให้ตามลำดับการทาย (คนละ 1 โค้ด ไม่ซ้ำกัน) — บันทึกลง DB ทันที (ไม่ต้องกด "บันทึกเกม") • ปุ่ม "เปิดรับทายอีกครั้ง" จะคงประวัติการแจกโบนัส/โค้ดไว้ — กันแจกซ้ำเมื่อแก้สกอร์
            </div>
          </div>
        )}

        {/* ===== สิ้นสุดกิจกรรม (เกมทายเบอร์เงิน / เกมทายผลบอล) ===== */}
        {isEdit && (type === 'เกมทายเบอร์เงิน' || type === 'เกมทายผลบอล') && (() => {
          const isEnded = type === 'เกมทายเบอร์เงิน' ? !!numberPickEndedAt : !!footballEndedAt
          const endedAtMs = type === 'เกมทายเบอร์เงิน' ? numberPickEndedAt : footballEndedAt
          const winners = correctLatestWinners
          const correctText = type === 'เกมทายเบอร์เงิน'
            ? numberPickCorrectAnswer.trim()
            : ((footballCorrectHome.trim() && footballCorrectAway.trim())
                ? `${footballCorrectHome.trim()}-${footballCorrectAway.trim()}`
                : '')
          const fmtTime = (ms: number | null) => {
            if (!ms) return ''
            try { return new Date(ms).toLocaleString('th-TH', { hour12: false }) } catch { return '' }
          }
          return (
            <div style={{ marginTop: 20 }}>
              <div style={{ borderBottom: `1px solid ${colors.borderLight}`, marginBottom: 20 }} />
              <div style={{
                background: 'linear-gradient(135deg, rgba(16, 185, 129, 0.10) 0%, rgba(5, 150, 105, 0.04) 100%)',
                border: `1px solid ${isEnded ? 'rgba(220, 38, 38, 0.3)' : 'rgba(16, 185, 129, 0.25)'}`,
                borderRadius: 14,
                padding: 18,
                display: 'flex',
                flexDirection: 'column',
                gap: 14,
              }}>
                {/* Header */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                  <div style={{
                    background: isEnded
                      ? 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)'
                      : 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
                    borderRadius: 10, width: 38, height: 38,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    flexShrink: 0,
                    boxShadow: isEnded ? '0 4px 12px rgba(239,68,68,0.30)' : '0 4px 12px rgba(16,185,129,0.30)',
                  }}>
                    <Flag size={18} color="#fff" />
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                      <div style={{ fontWeight: 800, fontSize: 15, color: '#1f2937' }}>
                        สิ้นสุดกิจกรรม
                      </div>
                      {isEnded ? (
                        <span style={{
                          display: 'inline-flex', alignItems: 'center', gap: 4,
                          background: '#fef2f2', color: '#dc2626',
                          padding: '3px 10px', borderRadius: 999,
                          fontSize: 11, fontWeight: 800, letterSpacing: 0.2,
                          border: '1px solid #fecaca',
                        }}>
                          <CheckCircle2 size={11} /> สิ้นสุดแล้ว
                        </span>
                      ) : (
                        <span style={{
                          display: 'inline-flex', alignItems: 'center', gap: 4,
                          background: '#ecfdf5', color: '#059669',
                          padding: '3px 10px', borderRadius: 999,
                          fontSize: 11, fontWeight: 800, letterSpacing: 0.2,
                          border: '1px solid #a7f3d0',
                        }}>
                          <Clock size={11} /> กำลังรับคำตอบ
                        </span>
                      )}
                    </div>
                    <div style={{ fontSize: 12, color: '#6b7280', marginTop: 2 }}>
                      {isEnded
                        ? `ปิดเมื่อ ${fmtTime(endedAtMs)} — ดูรายชื่อผู้ทายถูกได้ด้านล่าง`
                        : 'กรอกคำตอบที่ถูก แล้วกด "สิ้นสุดกิจกรรม" เพื่อปิดรับคำตอบ'}
                    </div>
                  </div>
                </div>

                {/* Input คำตอบ */}
                <div style={{
                  background: 'rgba(255,255,255,0.85)',
                  border: '1px solid #e5e7eb',
                  borderRadius: 12,
                  padding: 14,
                  display: 'grid',
                  gap: 10,
                }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: '#374151' }}>
                    คำตอบที่ถูก
                  </div>
                  {type === 'เกมทายเบอร์เงิน' ? (
                    <input
                      className="admin-f-control"
                      placeholder="พิมพ์คำตอบที่ถูก เช่น 5"
                      value={numberPickCorrectAnswer}
                      onChange={(e) => setNumberPickCorrectAnswer(e.target.value)}
                      style={{ height: 42, fontSize: 14, fontWeight: 600 }}
                    />
                  ) : (
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr auto 1fr', alignItems: 'center', gap: 10 }}>
                      <div>
                        <div style={{ fontSize: 11, color: '#6b7280', marginBottom: 4, fontWeight: 600 }}>
                          {homeTeam ? `${homeTeam} (เหย้า)` : 'ทีมเหย้า'}
                        </div>
                        <input
                          className="admin-f-control"
                          type="number"
                          min={0}
                          placeholder="0"
                          value={footballCorrectHome}
                          onChange={(e) => setFootballCorrectHome(e.target.value.replace(/\D/g, ''))}
                          style={{ height: 42, textAlign: 'center', fontSize: 18, fontWeight: 800 }}
                        />
                      </div>
                      <div style={{ fontSize: 22, fontWeight: 900, color: '#9ca3af', paddingTop: 18 }}>:</div>
                      <div>
                        <div style={{ fontSize: 11, color: '#6b7280', marginBottom: 4, fontWeight: 600 }}>
                          {awayTeam ? `${awayTeam} (เยือน)` : 'ทีมเยือน'}
                        </div>
                        <input
                          className="admin-f-control"
                          type="number"
                          min={0}
                          placeholder="0"
                          value={footballCorrectAway}
                          onChange={(e) => setFootballCorrectAway(e.target.value.replace(/\D/g, ''))}
                          style={{ height: 42, textAlign: 'center', fontSize: 18, fontWeight: 800 }}
                        />
                      </div>
                    </div>
                  )}

                  {/* แถวสรุป + ปุ่ม */}
                  <div style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    gap: 10, flexWrap: 'wrap', marginTop: 4,
                  }}>
                    <div style={{ fontSize: 12, color: '#374151', display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                      {correctText ? (
                        <>
                          <span>คำตอบ:</span>
                          <span style={{
                            display: 'inline-block',
                            background: '#10b981',
                            color: '#fff',
                            padding: '3px 10px',
                            borderRadius: 8,
                            fontSize: 13,
                            fontWeight: 800,
                            letterSpacing: 0.5,
                          }}>{correctText}</span>
                          <span style={{ color: '#6b7280' }}>·</span>
                          <span>
                            ทายล่าสุดถูก: <strong style={{ color: '#059669' }}>{winners.length}</strong> คน
                            {winnersAnswersLoading && <span style={{ color: '#9ca3af' }}> (กำลังโหลด…)</span>}
                          </span>
                        </>
                      ) : (
                        <span style={{ color: '#9ca3af' }}>
                          {winnersAnswersLoading ? 'กำลังโหลดคำตอบจากผู้เล่น…' : 'ยังไม่ได้ใส่คำตอบ'}
                        </span>
                      )}
                    </div>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button
                        type="button"
                        onClick={loadWinnersAnswers}
                        disabled={winnersAnswersLoading}
                        style={{
                          background: '#fff',
                          border: '1px solid #d1d5db',
                          color: '#374151',
                          borderRadius: 8,
                          padding: '0 12px', height: 38,
                          fontSize: 12, fontWeight: 700,
                          cursor: winnersAnswersLoading ? 'wait' : 'pointer',
                          display: 'inline-flex', alignItems: 'center', gap: 6,
                          opacity: winnersAnswersLoading ? 0.7 : 1,
                        }}
                        title="โหลดคำตอบล่าสุดของผู้เล่นใหม่"
                      >
                        {winnersAnswersLoading
                          ? <Loader2 size={13} className="spin" />
                          : <RefreshCw size={13} />}
                        รีเฟรช
                      </button>
                    </div>
                  </div>
                </div>

                {/* ===== อัปโหลดไฟล์รายงานฝาก ===== */}
                <div style={{
                  background: 'rgba(255,255,255,0.85)',
                  border: '1px solid #e5e7eb',
                  borderRadius: 12,
                  padding: 14,
                  display: 'grid',
                  gap: 10,
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <div style={{
                        width: 26, height: 26, borderRadius: 8,
                        background: 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)',
                        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                        boxShadow: '0 2px 6px rgba(245,158,11,0.30)',
                      }}>
                        <FileSpreadsheet size={14} color="#fff" />
                      </div>
                      <div style={{ fontSize: 13, fontWeight: 800, color: '#374151' }}>
                        ไฟล์รายงานฝาก
                      </div>
                      <span style={{
                        background: '#fef3c7', color: '#92400e',
                        border: '1px solid #fde68a',
                        padding: '2px 8px', borderRadius: 999,
                        fontSize: 10, fontWeight: 800,
                      }}>
                        ตรวจยอดฝากของผู้ทายถูก
                      </span>
                    </div>
                    <div style={{ fontSize: 11, color: '#6b7280', textAlign: 'right' }}>
                      เกณฑ์: ฝาก <strong style={{ color: '#f59e0b' }}>ตั้งแต่ {depositThreshold.toLocaleString('th-TH')} บาทขึ้นไป</strong>
                      <br />
                      <span style={{ color: '#9ca3af' }}>นับเฉพาะ: SLIP / TRUEWALLET / AUTOPEER / ASKMEPAY / NOSLIP</span>
                    </div>
                  </div>

                  {/* Upload zone */}
                  <label
                    htmlFor="deposit-report-input"
                    style={{
                      cursor: depositLoading ? 'wait' : 'pointer',
                      borderRadius: 10,
                      border: hasDepositReportLoaded ? '2px solid #10b981' : '2px dashed #d1d5db',
                      background: hasDepositReportLoaded ? '#ecfdf5' : '#f9fafb',
                      padding: '14px 16px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: 12,
                      transition: 'all 0.15s',
                      flexWrap: 'wrap',
                    }}
                  >
                    <input
                      id="deposit-report-input"
                      type="file"
                      accept=".xlsx,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel"
                      onChange={handleDepositFileChange}
                      style={{ display: 'none' }}
                      disabled={depositLoading}
                    />
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0, flex: 1 }}>
                      {depositLoading ? (
                        <Loader2 size={20} color="#6b7280" className="spin" />
                      ) : hasDepositReportLoaded ? (
                        <CheckCircle2 size={20} color="#10b981" />
                      ) : (
                        <Upload size={20} color="#6b7280" />
                      )}
                      <div style={{ minWidth: 0, overflow: 'hidden' }}>
                        <div style={{ fontSize: 13, fontWeight: 700, color: hasDepositReportLoaded ? '#065f46' : '#374151' }}>
                          {depositLoading
                            ? 'กำลังอ่านไฟล์…'
                            : hasDepositReportLoaded
                              ? (depositFileName || 'อัปโหลดแล้ว')
                              : 'เลือกไฟล์ Excel รายงานฝาก (.xlsx)'}
                        </div>
                        <div style={{ fontSize: 11, color: '#6b7280', marginTop: 2 }}>
                          {hasDepositReportLoaded
                            ? (winners.length > 0
                                ? `${depositTotalRows > 0 ? `อ่านได้ ${depositTotalRows.toLocaleString('th-TH')} แถว · ` : ''}พบผู้ทายถูกในไฟล์ ${winnersFoundInDepositFile.toLocaleString('th-TH')} / ${winners.length.toLocaleString('th-TH')} คน${depositUploadedAt ? ` · บันทึกเมื่อ ${fmtTime(depositUploadedAt)}` : ''}`
                                : `${depositTotalRows > 0 ? `อ่านได้ ${depositTotalRows.toLocaleString('th-TH')} แถว · ` : ''}${depositSumByUser.size.toLocaleString('th-TH')} USER ในไฟล์${depositUploadedAt ? ` · บันทึกเมื่อ ${fmtTime(depositUploadedAt)}` : ''}`)
                            : 'อ่านคอลัม B (Username), G (Amount), K (Finance Type)'}
                        </div>
                      </div>
                    </div>
                    {hasDepositReportLoaded ? (
                      <span style={{
                        background: '#10b981', color: '#fff',
                        padding: '4px 10px', borderRadius: 8,
                        fontSize: 11, fontWeight: 800,
                      }}>เปลี่ยนไฟล์</span>
                    ) : (
                      <span style={{
                        background: '#f59e0b', color: '#fff',
                        padding: '4px 10px', borderRadius: 8,
                        fontSize: 11, fontWeight: 800,
                      }}>เลือกไฟล์</span>
                    )}
                  </label>

                  {/* ปุ่มลบไฟล์ที่บันทึกไว้ */}
                  {hasDepositReportLoaded && (
                    <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                      <button
                        type="button"
                        onClick={clearDepositReport}
                        style={{
                          background: '#fff',
                          border: '1px solid #fecaca',
                          color: '#dc2626',
                          borderRadius: 6,
                          padding: '4px 10px',
                          fontSize: 11,
                          fontWeight: 700,
                          cursor: 'pointer',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 4,
                        }}
                        title="ลบไฟล์รายงานฝากที่บันทึกไว้"
                      >
                        <Trash2 size={11} /> ลบไฟล์ที่บันทึก
                      </button>
                    </div>
                  )}

                  {/* Error */}
                  {depositError && (
                    <div style={{
                      background: '#fef2f2', border: '1px solid #fecaca',
                      color: '#dc2626', borderRadius: 8,
                      padding: '8px 10px', fontSize: 12,
                      display: 'flex', alignItems: 'center', gap: 6,
                    }}>
                      <AlertTriangle size={13} />
                      <span>อ่านไฟล์ไม่สำเร็จ: {depositError}</span>
                    </div>
                  )}

                  {/* สรุปเร็ว ๆ เมื่ออ่านไฟล์แล้ว + มี winners */}
                  {hasDepositReportLoaded && correctText && winners.length > 0 && (
                    <div style={{
                      display: 'grid',
                      gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
                      gap: 8,
                      marginTop: 4,
                    }}>
                      <div style={{
                        background: '#ecfdf5', border: '1px solid #a7f3d0',
                        borderRadius: 8, padding: '8px 10px',
                      }}>
                        <div style={{ fontSize: 10, color: '#065f46', fontWeight: 700, letterSpacing: 0.3 }}>ฝากครบเกณฑ์</div>
                        <div style={{ fontSize: 18, color: '#047857', fontWeight: 900, marginTop: 2 }}>
                          {qualifiedWinners.length} <span style={{ fontSize: 11, fontWeight: 700, color: '#10b981' }}>/ {winners.length} คน</span>
                        </div>
                      </div>
                      <div style={{
                        background: '#fef3c7', border: '1px solid #fde68a',
                        borderRadius: 8, padding: '8px 10px',
                      }}>
                        <div style={{ fontSize: 10, color: '#92400e', fontWeight: 700, letterSpacing: 0.3 }}>ฝากไม่ครบ</div>
                        <div style={{ fontSize: 18, color: '#b45309', fontWeight: 900, marginTop: 2 }}>
                          {unqualifiedWinners.length} <span style={{ fontSize: 11, fontWeight: 700, color: '#d97706' }}>คน</span>
                        </div>
                      </div>
                      <div style={{
                        background: '#eff6ff', border: '1px solid #bfdbfe',
                        borderRadius: 8, padding: '8px 10px',
                      }}>
                        <div style={{ fontSize: 10, color: '#1e3a8a', fontWeight: 700, letterSpacing: 0.3 }}>เกณฑ์</div>
                        <div style={{ fontSize: 18, color: '#1d4ed8', fontWeight: 900, marginTop: 2 }}>
                          ≥ {depositThreshold.toLocaleString('th-TH')} <span style={{ fontSize: 11, fontWeight: 700 }}>บาท</span>
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                {/* รายการ USER ที่ทายล่าสุดถูก */}
                <div style={{
                  background: '#fff',
                  border: '1px solid #e5e7eb',
                  borderRadius: 12,
                  overflow: 'hidden',
                }}>
                  <div style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    padding: '10px 14px',
                    background: 'linear-gradient(135deg, #ecfdf5 0%, #d1fae5 100%)',
                    borderBottom: '1px solid #a7f3d0',
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <Trophy size={14} color="#059669" />
                      <span style={{ fontSize: 13, fontWeight: 800, color: '#065f46' }}>
                        ผู้ทายล่าสุดถูก
                      </span>
                    </div>
                    <span style={{
                      background: '#059669', color: '#fff',
                      fontSize: 11, fontWeight: 800,
                      padding: '2px 8px', borderRadius: 999,
                    }}>{winners.length} คน</span>
                  </div>

                  {!correctText ? (
                    <div style={{
                      padding: 18, textAlign: 'center',
                      color: '#9ca3af', fontSize: 13,
                    }}>
                      กรอก "คำตอบที่ถูก" ด้านบนเพื่อแสดงรายการผู้ทายล่าสุดถูก
                    </div>
                  ) : winners.length === 0 ? (
                    <div style={{
                      padding: 18, textAlign: 'center',
                      color: '#9ca3af', fontSize: 13,
                    }}>
                      {winnersAnswersLoading ? 'กำลังโหลด…' : 'ยังไม่มีผู้เล่นทายล่าสุดถูก'}
                    </div>
                  ) : (
                    <div style={{
                      maxHeight: 320, overflowY: 'auto',
                      display: 'grid',
                    }}>
                      {winnersDepositInfo.map((w, idx) => {
                        const userKey = String(w.user || '').trim().toUpperCase()
                        const sumDeposit = depositSumByUser.get(userKey) || 0
                        const showDeposit = w.hasReport
                        return (
                          <div
                            key={`${w.user}-${w.ts}`}
                            style={{
                              display: 'flex', alignItems: 'center', gap: 12,
                              padding: '10px 14px',
                              borderBottom: idx === winnersDepositInfo.length - 1 ? 'none' : '1px solid #f3f4f6',
                              background: showDeposit
                                ? (w.passed ? 'rgba(16,185,129,0.06)' : 'rgba(245,158,11,0.06)')
                                : (idx % 2 === 0 ? '#fafafa' : '#fff'),
                            }}
                          >
                            <div style={{
                              width: 28, height: 28,
                              borderRadius: 999,
                              background: !showDeposit
                                ? (idx === 0
                                  ? 'linear-gradient(135deg, #fbbf24 0%, #f59e0b 100%)'
                                  : '#10b981')
                                : (w.passed
                                  ? 'linear-gradient(135deg, #34d399 0%, #059669 100%)'
                                  : '#9ca3af'),
                              color: '#fff',
                              fontSize: 12, fontWeight: 900,
                              display: 'flex', alignItems: 'center', justifyContent: 'center',
                              flexShrink: 0,
                            }}>
                              {idx + 1}
                            </div>
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{
                                display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap',
                              }}>
                                <span style={{
                                  fontSize: 14, fontWeight: 700, color: '#111827',
                                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                                  maxWidth: 240,
                                }}>{w.user}</span>
                                {showDeposit && (
                                  w.passed ? (
                                    <span style={{
                                      display: 'inline-flex', alignItems: 'center', gap: 3,
                                      background: '#10b981', color: '#fff',
                                      padding: '2px 8px', borderRadius: 999,
                                      fontSize: 10, fontWeight: 800, letterSpacing: 0.3,
                                    }}>
                                      <CheckCircle2 size={10} /> ฝากครบ
                                    </span>
                                  ) : (
                                    <span style={{
                                      display: 'inline-flex', alignItems: 'center', gap: 3,
                                      background: '#f59e0b', color: '#fff',
                                      padding: '2px 8px', borderRadius: 999,
                                      fontSize: 10, fontWeight: 800, letterSpacing: 0.3,
                                    }}>
                                      <XCircle size={10} /> ฝากไม่ครบ
                                    </span>
                                  )
                                )}
                              </div>
                              <div style={{ fontSize: 11, color: '#6b7280', marginTop: 2 }}>
                                ตอบเมื่อ {fmtTime(w.ts)}
                                {showDeposit && (
                                  <>
                                    {' · '}
                                    <span style={{ color: w.passed ? '#059669' : '#b45309', fontWeight: 700 }}>
                                      ยอดฝาก {sumDeposit.toLocaleString('th-TH')} บาท
                                    </span>
                                  </>
                                )}
                              </div>
                            </div>
                            <div style={{
                              background: '#ecfdf5',
                              color: '#059669',
                              border: '1px solid #a7f3d0',
                              padding: '4px 10px',
                              borderRadius: 8,
                              fontSize: 13,
                              fontWeight: 800,
                            }}>{w.answer}</div>
                          </div>
                        )
                      })}
                    </div>
                  )}

                  {/* Footer: ปุ่มสิ้นสุดกิจกรรม */}
                  <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: 10,
                    padding: '12px 14px',
                    borderTop: '1px solid #f3f4f6',
                    background: '#fafafa',
                    flexWrap: 'wrap',
                  }}>
                    <div style={{ fontSize: 11, color: '#6b7280', flex: 1, minWidth: 180 }}>
                      {isEnded
                        ? `ปิดรับคำตอบเมื่อ ${fmtTime(endedAtMs)} — สามารถอัปเดตคำตอบที่ถูกได้`
                        : 'เมื่อกด "สิ้นสุดกิจกรรม" ระบบจะบันทึกคำตอบที่ถูกและปิดรับคำตอบในรอบนี้'}
                    </div>
                    <button
                      type="button"
                      onClick={endActivity}
                      disabled={endingActivity}
                      style={{
                        background: isEnded
                          ? 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)'
                          : 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)',
                        border: 'none',
                        color: '#fff',
                        borderRadius: 10,
                        padding: '0 18px', height: 40,
                        fontSize: 13, fontWeight: 800, letterSpacing: 0.2,
                        cursor: endingActivity ? 'wait' : 'pointer',
                        display: 'inline-flex', alignItems: 'center', gap: 6,
                        boxShadow: isEnded
                          ? '0 4px 12px rgba(245,158,11,0.30)'
                          : '0 4px 12px rgba(239,68,68,0.30)',
                        opacity: endingActivity ? 0.7 : 1,
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {endingActivity
                        ? <Loader2 size={14} className="spin" />
                        : <Flag size={14} />}
                      {isEnded ? 'อัปเดตคำตอบที่ถูก' : 'สิ้นสุดกิจกรรม'}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )
        })()}

        {/* ===== Telegram: ประกาศผู้ชนะ ===== */}
        {isEdit && (type === 'เกมทายเบอร์เงิน' || type === 'เกมทายผลบอล') && (() => {
          const hasDepositReport = hasDepositReportLoaded
          // ใช้ qualified เป็น "ผู้ชนะ" เมื่ออัปโหลดไฟล์ฝากแล้ว / มิฉะนั้นใช้ทุกคนที่ทายล่าสุดถูก
          const previewWinners = hasDepositReport ? qualifiedWinners : correctLatestWinners
          const previewUnqualified = hasDepositReport ? unqualifiedWinners : []
          const activityName = winnersTelegramKeys.activityName
          const messageEffective = winnersTelegramMessage.trim() || winnersTelegramKeys.defaultTemplate
          const previewMsg = messageEffective
            .replace(/\{themeName\}/g, themeName.toUpperCase())
            .replace(/\{activityName\}/g, activityName)
            .replace(/\{gameName\}/g, name?.trim() || '')
            .replace(/\{correctAnswer\}/g, type === 'เกมทายเบอร์เงิน'
              ? numberPickCorrectAnswer.trim()
              : ((footballCorrectHome.trim() && footballCorrectAway.trim())
                  ? `${footballCorrectHome.trim()}-${footballCorrectAway.trim()}`
                  : ''))
            .replace(/\{winners\}/g, previewWinners.length === 0
              ? '— ยังไม่มีผู้ชนะ —'
              : previewWinners.map((w) => `💚 ${w.user}`).join('\n'))
            .replace(/\{unqualifiedWinners\}/g, previewUnqualified.length === 0
              ? '— ไม่มี —'
              : previewUnqualified.map((w) => `⚠️ ${w.user}`).join('\n'))
          return (
            <div style={{ marginTop: 16 }}>
              <div style={{
                background: 'linear-gradient(135deg, rgba(34, 211, 238, 0.10) 0%, rgba(59, 130, 246, 0.05) 100%)',
                border: '1px solid rgba(59, 130, 246, 0.25)',
                borderRadius: 14,
                padding: 18,
                display: 'flex',
                flexDirection: 'column',
                gap: 14,
              }}>
                {/* Header */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                  <div style={{
                    background: 'linear-gradient(135deg, #38bdf8 0%, #2563eb 100%)',
                    borderRadius: 10, width: 38, height: 38,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    flexShrink: 0,
                    boxShadow: '0 4px 12px rgba(37,99,235,0.25)',
                  }}>
                    <Send size={18} color="#fff" />
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                      <div style={{ fontWeight: 800, fontSize: 15, color: '#1f2937' }}>
                        ส่งประกาศผู้ชนะเข้ากลุ่ม Telegram
                      </div>
                      <span style={{
                        display: 'inline-flex', alignItems: 'center', gap: 4,
                        background: '#dbeafe', color: '#1d4ed8',
                        padding: '3px 10px', borderRadius: 999,
                        fontSize: 11, fontWeight: 800, letterSpacing: 0.2,
                        border: '1px solid #bfdbfe',
                      }}>
                        <Megaphone size={11} /> ธีม {themeName.toUpperCase()}
                      </span>
                    </div>
                    <div style={{ fontSize: 12, color: '#6b7280', marginTop: 2 }}>
                      ประกาศเข้ากลุ่ม Telegram ของธีมนี้ — แทรกชื่อผู้ชนะอัตโนมัติจากรายการด้านบน
                    </div>
                  </div>
                </div>

                {/* Body 2 columns: รูป | textarea (responsive) */}
                <div style={{
                  display: 'grid',
                  gap: 14,
                  gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
                  alignItems: 'stretch',
                }}>
                  {/* รูปอัปโหลด */}
                  <div style={{
                    background: '#fff',
                    border: '1px solid #e5e7eb',
                    borderRadius: 12,
                    padding: 12,
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 10,
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6, flexWrap: 'wrap' }}>
                      <div style={{ fontSize: 12, fontWeight: 700, color: '#374151', display: 'flex', alignItems: 'center', gap: 6 }}>
                        <ImageIcon size={13} />
                        รูปประกาศ (แนบในข้อความ)
                      </div>
                      {winnersTelegramImageUploading && (
                        <span style={{
                          fontSize: 10, fontWeight: 800,
                          background: '#dbeafe', color: '#1d4ed8',
                          border: '1px solid #bfdbfe',
                          padding: '2px 8px', borderRadius: 999,
                          display: 'inline-flex', alignItems: 'center', gap: 4,
                        }}>
                          <Loader2 size={10} className="spin" /> กำลังอัปโหลด…
                        </span>
                      )}
                      {!winnersTelegramImageUploading && winnersTelegramImageUrl && winnersTelegramImagePreview === winnersTelegramImageUrl && (
                        <span style={{
                          fontSize: 10, fontWeight: 800,
                          background: '#dcfce7', color: '#166534',
                          border: '1px solid #bbf7d0',
                          padding: '2px 8px', borderRadius: 999,
                          display: 'inline-flex', alignItems: 'center', gap: 4,
                        }}>
                          <CheckCircle2 size={10} /> บันทึกแล้ว
                        </span>
                      )}
                    </div>
                    <label htmlFor="winners-tg-image" style={{
                      cursor: winnersTelegramImageUploading ? 'wait' : 'pointer',
                      borderRadius: 10,
                      overflow: 'hidden',
                      border: `2px dashed ${winnersTelegramImagePreview ? '#3b82f6' : '#d1d5db'}`,
                      // ✅ Checker pattern เพื่อแสดงพื้นที่โปร่งใสของรูป
                      background: winnersTelegramImagePreview
                        ? 'repeating-conic-gradient(#f3f4f6 0% 25%, #ffffff 0% 50%) 50% / 16px 16px'
                        : '#f9fafb',
                      minHeight: 180,
                      maxHeight: 480,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      position: 'relative',
                      transition: 'all 0.2s ease',
                    }}>
                      {winnersTelegramImagePreview ? (
                        <>
                          <img
                            src={getImageUrl(winnersTelegramImagePreview)}
                            alt="Winners announce"
                            // ✅ ใช้สัดส่วนจริง — ไม่ crop, ไม่ stretch
                            style={{
                              maxWidth: '100%',
                              maxHeight: 460,
                              width: 'auto',
                              height: 'auto',
                              objectFit: 'contain',
                              display: 'block',
                              opacity: winnersTelegramImageUploading ? 0.55 : 1,
                              transition: 'opacity 0.2s',
                            }}
                            onError={() => {
                              if (import.meta.env.DEV) console.warn('[CreateGame] Winners TG image failed to load:', winnersTelegramImagePreview)
                            }}
                          />
                          {winnersTelegramImageUploading && (
                            <div style={{
                              position: 'absolute', inset: 0,
                              display: 'flex', alignItems: 'center', justifyContent: 'center',
                              background: 'rgba(255,255,255,0.55)',
                            }}>
                              <div style={{
                                background: '#1d4ed8', color: '#fff',
                                padding: '8px 14px', borderRadius: 999,
                                fontSize: 12, fontWeight: 800,
                                display: 'inline-flex', alignItems: 'center', gap: 6,
                                boxShadow: '0 4px 14px rgba(29,78,216,0.30)',
                              }}>
                                <Loader2 size={13} className="spin" />
                                กำลังบันทึกรูปลงเกม…
                              </div>
                            </div>
                          )}
                        </>
                      ) : (
                        <div style={{ textAlign: 'center', color: '#6b7280', padding: 14 }}>
                          <ImageIcon size={28} style={{ margin: '0 auto 6px', opacity: 0.6 }} />
                          <div style={{ fontSize: 12, fontWeight: 600 }}>คลิกเพื่ออัปโหลดรูป</div>
                          <div style={{ fontSize: 11, opacity: 0.7 }}>JPG / PNG / WebP — แสดงตามสัดส่วนจริง</div>
                        </div>
                      )}
                    </label>
                    <input
                      id="winners-tg-image"
                      type="file"
                      accept="image/*"
                      onChange={handleWinnersTelegramImageFileChange}
                      style={{ display: 'none' }}
                      disabled={winnersTelegramImageUploading}
                    />
                    {winnersTelegramImagePreview && (
                      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                        <label
                          htmlFor="winners-tg-image"
                          style={{
                            background: '#fff',
                            border: '1px solid #d1d5db',
                            color: '#374151',
                            borderRadius: 8,
                            padding: '6px 10px',
                            fontSize: 12,
                            fontWeight: 700,
                            cursor: winnersTelegramImageUploading ? 'wait' : 'pointer',
                            display: 'inline-flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: 6,
                            opacity: winnersTelegramImageUploading ? 0.6 : 1,
                          }}
                        >
                          <Upload size={12} /> เปลี่ยนรูป
                        </label>
                        <button
                          type="button"
                          onClick={handleClearWinnersTelegramImage}
                          disabled={winnersTelegramImageUploading}
                          style={{
                            background: '#fff',
                            border: '1px solid #fca5a5',
                            color: '#dc2626',
                            borderRadius: 8,
                            padding: '6px 10px',
                            fontSize: 12,
                            fontWeight: 700,
                            cursor: winnersTelegramImageUploading ? 'wait' : 'pointer',
                            display: 'inline-flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: 6,
                            opacity: winnersTelegramImageUploading ? 0.6 : 1,
                          }}
                        >
                          <Trash2 size={12} /> ลบรูป
                        </button>
                      </div>
                    )}
                  </div>

                  {/* Textarea + ตัวแปร */}
                  <div style={{
                    background: '#fff',
                    border: '1px solid #e5e7eb',
                    borderRadius: 12,
                    padding: 12,
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 8,
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 6 }}>
                      <div style={{ fontSize: 12, fontWeight: 700, color: '#374151' }}>
                        ข้อความประกาศ
                      </div>
                      <button
                        type="button"
                        onClick={() => setWinnersTelegramMessage(winnersTelegramKeys.defaultTemplate)}
                        style={{
                          background: 'transparent',
                          border: '1px solid #d1d5db',
                          color: '#6b7280',
                          borderRadius: 6,
                          padding: '3px 9px',
                          fontSize: 11,
                          fontWeight: 600,
                          cursor: 'pointer',
                        }}
                        title="กลับไปใช้ข้อความเริ่มต้น"
                      >
                        ใช้ค่าเริ่มต้น
                      </button>
                    </div>
                    {/* Warning: ถ้าอัปโหลดไฟล์ฝากแล้ว แต่ template ไม่มี {unqualifiedWinners} */}
                    {hasDepositReport && !winnersTelegramMessage.includes('{unqualifiedWinners}') && (
                      <div style={{
                        background: '#fef3c7',
                        border: '1px solid #fde68a',
                        borderRadius: 8,
                        padding: '10px 12px',
                        display: 'flex',
                        alignItems: 'flex-start',
                        gap: 8,
                        marginBottom: 4,
                      }}>
                        <AlertTriangle size={14} color="#d97706" style={{ flexShrink: 0, marginTop: 2 }} />
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 12, fontWeight: 800, color: '#92400e', marginBottom: 2 }}>
                            ข้อความนี้ยังไม่มี <code style={{ background: '#fde68a', padding: '0 4px', borderRadius: 3 }}>{'{unqualifiedWinners}'}</code>
                          </div>
                          <div style={{ fontSize: 11, color: '#92400e', lineHeight: 1.5 }}>
                            ผู้ที่ทายถูก แต่ฝากไม่ครบเกณฑ์ จะ<strong> ไม่ถูกแสดง </strong>ในประกาศที่ส่งจริง
                            (ทั้งที่ตรวจไฟล์ฝากแล้ว) — กดปุ่มด้านล่างเพื่อแทรกส่วนนี้อัตโนมัติ
                          </div>
                          <div style={{ display: 'flex', gap: 6, marginTop: 8, flexWrap: 'wrap' }}>
                            <button
                              type="button"
                              onClick={() => {
                                const block = '\n\n⚠️ ผู้ที่ทายถูก แต่ยอดฝากไม่ครบเกณฑ์\n{unqualifiedWinners}'
                                setWinnersTelegramMessage((prev) => {
                                  const base = prev.trim() || winnersTelegramKeys.defaultTemplate
                                  return base + block
                                })
                              }}
                              style={{
                                background: '#f59e0b',
                                border: 'none',
                                color: '#fff',
                                borderRadius: 6,
                                padding: '5px 12px',
                                fontSize: 11,
                                fontWeight: 800,
                                cursor: 'pointer',
                                display: 'inline-flex', alignItems: 'center', gap: 4,
                              }}
                            >
                              <Plus size={11} /> เพิ่มส่วนนี้อัตโนมัติ
                            </button>
                            <button
                              type="button"
                              onClick={() => setWinnersTelegramMessage(winnersTelegramKeys.defaultTemplate)}
                              style={{
                                background: '#fff',
                                border: '1px solid #fde68a',
                                color: '#92400e',
                                borderRadius: 6,
                                padding: '5px 12px',
                                fontSize: 11,
                                fontWeight: 700,
                                cursor: 'pointer',
                              }}
                            >
                              ใช้ค่าเริ่มต้นใหม่
                            </button>
                          </div>
                        </div>
                      </div>
                    )}
                    <textarea
                      className="admin-f-control"
                      value={winnersTelegramMessage}
                      onChange={(e) => setWinnersTelegramMessage(e.target.value)}
                      rows={10}
                      placeholder={winnersTelegramKeys.defaultTemplate}
                      style={{ minHeight: 200, resize: 'vertical', fontSize: 13, fontFamily: 'inherit', lineHeight: 1.55 }}
                    />
                    <div style={{ fontSize: 11, color: '#6b7280', lineHeight: 1.7 }}>
                      ตัวแปรที่ใช้ได้:&nbsp;
                      <code style={{ background: '#f3f4f6', padding: '1px 6px', borderRadius: 4 }}>{'{themeName}'}</code>
                      &nbsp;
                      <code style={{ background: '#f3f4f6', padding: '1px 6px', borderRadius: 4 }}>{'{activityName}'}</code>
                      &nbsp;
                      <code style={{ background: '#dcfce7', padding: '1px 6px', borderRadius: 4, color: '#166534' }}>{'{winners}'}</code>
                      &nbsp;
                      <code style={{ background: '#fef3c7', padding: '1px 6px', borderRadius: 4, color: '#92400e' }}>{'{unqualifiedWinners}'}</code>
                      &nbsp;
                      <code style={{ background: '#f3f4f6', padding: '1px 6px', borderRadius: 4 }}>{'{gameName}'}</code>
                      &nbsp;
                      <code style={{ background: '#f3f4f6', padding: '1px 6px', borderRadius: 4 }}>{'{correctAnswer}'}</code>
                      <div style={{ marginTop: 6, fontSize: 10, color: '#9ca3af' }}>
                        <strong style={{ color: '#10b981' }}>{'{winners}'}</strong> = ทายถูก + ฝากครบเกณฑ์ (เมื่ออัปโหลดไฟล์ฝาก) · <strong style={{ color: '#f59e0b' }}>{'{unqualifiedWinners}'}</strong> = ทายถูก แต่ฝากไม่ครบ
                      </div>
                    </div>
                  </div>
                </div>

                {/* Preview */}
                <div style={{
                  background: '#0b1020',
                  borderRadius: 12,
                  padding: 14,
                  border: '1px solid #1e293b',
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8, flexWrap: 'wrap', gap: 6 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <Sparkles size={12} color="#7dd3fc" />
                      <span style={{ fontSize: 12, fontWeight: 800, color: '#7dd3fc', letterSpacing: 0.4 }}>ตัวอย่างข้อความ</span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                      <span style={{
                        fontSize: 11, fontWeight: 700,
                        color: previewWinners.length > 0 ? '#86efac' : '#fcd34d',
                        background: previewWinners.length > 0 ? 'rgba(34,197,94,0.12)' : 'rgba(245,158,11,0.12)',
                        padding: '2px 8px', borderRadius: 999,
                        border: `1px solid ${previewWinners.length > 0 ? 'rgba(34,197,94,0.35)' : 'rgba(245,158,11,0.35)'}`,
                      }}>
                        {previewWinners.length > 0 ? `${previewWinners.length} ผู้ชนะ` : 'ยังไม่มีผู้ชนะ'}
                      </span>
                      {hasDepositReport && previewUnqualified.length > 0 && (
                        <span style={{
                          fontSize: 11, fontWeight: 700,
                          color: '#fcd34d',
                          background: 'rgba(245,158,11,0.12)',
                          padding: '2px 8px', borderRadius: 999,
                          border: '1px solid rgba(245,158,11,0.35)',
                        }}>
                          ฝากไม่ครบ {previewUnqualified.length} คน
                        </span>
                      )}
                    </div>
                  </div>
                  <pre style={{
                    margin: 0,
                    padding: 0,
                    background: 'transparent',
                    color: '#e2e8f0',
                    fontSize: 13,
                    fontFamily: 'inherit',
                    whiteSpace: 'pre-wrap',
                    wordBreak: 'break-word',
                    lineHeight: 1.6,
                  }}>{previewMsg}</pre>
                </div>

                {/* Actions */}
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center' }}>
                  {/* คำอธิบายโหมดที่จะส่งจริง */}
                  <div style={{ fontSize: 11, color: '#6b7280', display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                    {hasDepositReport ? (
                      <>
                        <span style={{
                          background: '#10b981', color: '#fff',
                          padding: '2px 8px', borderRadius: 999,
                          fontSize: 10, fontWeight: 800,
                        }}>โหมดตรวจฝาก</span>
                        จะส่งเฉพาะ <strong style={{ color: '#059669' }}>{previewWinners.length} คน</strong> ที่ฝากครบเกณฑ์
                        {previewUnqualified.length > 0 && (
                          <span style={{ color: '#92400e' }}> · แจ้ง {previewUnqualified.length} คนที่ฝากไม่ครบ</span>
                        )}
                      </>
                    ) : (
                      <>
                        <span style={{
                          background: '#6b7280', color: '#fff',
                          padding: '2px 8px', borderRadius: 999,
                          fontSize: 10, fontWeight: 800,
                        }}>โหมดปกติ</span>
                        จะส่งผู้ทายล่าสุดถูก <strong style={{ color: '#374151' }}>{previewWinners.length} คน</strong> ทั้งหมด
                      </>
                    )}
                  </div>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    <button
                      type="button"
                      onClick={saveWinnersTelegramConfig}
                      disabled={winnersTelegramConfigSaving}
                      style={{
                        background: '#fff',
                        border: '1px solid #d1d5db',
                        color: '#374151',
                        borderRadius: 8,
                        padding: '0 14px', height: 40,
                        fontSize: 13, fontWeight: 700,
                        cursor: winnersTelegramConfigSaving ? 'wait' : 'pointer',
                        display: 'inline-flex', alignItems: 'center', gap: 6,
                        opacity: winnersTelegramConfigSaving ? 0.7 : 1,
                      }}
                      title="บันทึกข้อความ + รูป (จะใช้ครั้งต่อไปด้วย)"
                    >
                      {winnersTelegramConfigSaving
                        ? <Loader2 size={14} className="spin" />
                        : <Save size={14} />}
                      บันทึกตั้งค่า
                    </button>
                    <button
                      type="button"
                      onClick={sendWinnersTelegram}
                      disabled={winnersTelegramSending}
                      style={{
                        background: 'linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%)',
                        border: 'none',
                        color: '#fff',
                        borderRadius: 8,
                        padding: '0 18px', height: 40,
                        fontSize: 13, fontWeight: 800, letterSpacing: 0.2,
                        cursor: winnersTelegramSending ? 'wait' : 'pointer',
                        display: 'inline-flex', alignItems: 'center', gap: 6,
                        boxShadow: '0 4px 12px rgba(37,99,235,0.30)',
                        opacity: winnersTelegramSending ? 0.7 : 1,
                      }}
                    >
                      {winnersTelegramSending
                        ? <Loader2 size={14} className="spin" />
                        : <Send size={14} />}
                      ส่งเข้ากลุ่ม Telegram
                      {previewWinners.length > 0 && (
                        <span style={{
                          background: 'rgba(255,255,255,0.25)',
                          padding: '1px 7px',
                          borderRadius: 999,
                          fontSize: 11,
                          fontWeight: 800,
                        }}>{previewWinners.length}</span>
                      )}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )
        })()}

        {/* ===== ลิงก์ลูกค้า + แอดมิน (บรรทัดเดียว) ===== */}
        {isEdit && (
          <div>
          <div style={{ borderBottom: `1px solid ${colors.borderLight}`, marginBottom: 20, marginTop: 20 }} />
          <div className="admin-form-row" style={{ alignItems: 'stretch' }}>
            {/* ลิงก์ลูกค้า */}
            <div style={{
              background: 'linear-gradient(135deg, rgba(251, 146, 60, 0.12) 0%, rgba(249, 115, 22, 0.06) 100%)',
              border: '1px solid rgba(251, 146, 60, 0.25)',
              borderRadius: 14,
              padding: 16,
              display: 'flex',
              flexDirection: 'column'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
                <div style={{
                  background: 'linear-gradient(135deg, #f97316 0%, #ea580c 100%)',
                  borderRadius: 8, width: 34, height: 34,
                  display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0
                }}>
                  <Link size={16} color="#fff" />
                </div>
                <div>
                  <div style={{ fontWeight: 700, fontSize: 14, color: '#1f2937' }}>ลิงก์สำหรับลูกค้า</div>
                  <div style={{ fontSize: 11, color: '#6b7280' }}>ส่งให้ลูกค้าเล่นเกม</div>
                </div>
              </div>
              <div style={{ display: 'flex', gap: 8, flex: 1, alignItems: 'flex-end' }}>
                <input
                  id="customerLinkInput"
                  className="admin-f-control"
                  value={getPlayerLink(gameId)}
                  readOnly
                  style={{ flex: 1, fontSize: 13, height: 42, background: 'rgba(255,255,255,0.9)', border: '1px solid rgba(251,146,60,0.2)' }}
                />
                <button
                  onClick={async () => {
                    try {
                      await navigator.clipboard.writeText(getPlayerLink(gameId));
                      alert('คัดลอกลิงก์ลูกค้าแล้ว');
                    } catch { alert('คัดลอกไม่สำเร็จ'); }
                  }}
                  style={{
                    background: 'linear-gradient(135deg, #f97316 0%, #ea580c 100%)',
                    border: 'none', borderRadius: 8, padding: '0 14px', height: 42,
                    color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer',
                    display: 'flex', alignItems: 'center', gap: 6, whiteSpace: 'nowrap',
                    boxShadow: '0 3px 10px rgba(249,115,22,0.25)', transition: 'all 0.2s ease'
                  }}
                >
                  <Copy size={13} /> คัดลอก
                </button>
              </div>
            </div>

            {/* ลิงก์แอดมิน */}
            <div style={{
              background: 'linear-gradient(135deg, rgba(59, 130, 246, 0.1) 0%, rgba(147, 197, 253, 0.06) 100%)',
              border: '1px solid rgba(59, 130, 246, 0.2)',
              borderRadius: 14,
              padding: 16,
              display: 'flex',
              flexDirection: 'column'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
                <div style={{
                  background: 'linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%)',
                  borderRadius: 8, width: 34, height: 34,
                  display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0
                }}>
                  <Link size={16} color="#fff" />
                </div>
                <div>
                  <div style={{ fontWeight: 700, fontSize: 14, color: '#1f2937' }}>ลิงก์สำหรับแอดมิน</div>
                  <div style={{ fontSize: 11, color: '#6b7280' }}>เข้าดูคำตอบผู้เล่น</div>
                </div>
              </div>
              <div style={{ display: 'flex', gap: 8, flex: 1, alignItems: 'flex-end' }}>
                <input
                  id="adminLinkInput"
                  className="admin-f-control"
                  value={`${location.origin}/admin/answers/${gameId}`}
                  readOnly
                  style={{ flex: 1, fontSize: 13, height: 42, background: '#fff', border: '1px solid rgba(59,130,246,0.2)' }}
                />
                <button
                  onClick={() => {
                    navigator.clipboard.writeText(`${location.origin}/admin/answers/${gameId}`)
                    alert('คัดลอกลิงก์แอดมินแล้ว')
                  }}
                  style={{
                    background: 'linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%)',
                    border: 'none', borderRadius: 8, padding: '0 14px', height: 42,
                    color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer',
                    display: 'flex', alignItems: 'center', gap: 6, whiteSpace: 'nowrap',
                    boxShadow: '0 3px 10px rgba(59,130,246,0.25)', transition: 'all 0.2s ease'
                  }}
                >
                  <Copy size={13} /> คัดลอก
                </button>
              </div>
            </div>
          </div>
          </div>
        )}

        {/* ===== Telegram Config (เฉพาะเกมที่ต้องใช้) ===== */}
        {isEdit && (
          <>
              {isTelegramConfigGame && (
                <div style={{ marginTop: 28, marginBottom: 28 }}>
                  <div style={{ borderBottom: `1px solid ${colors.borderLight}`, marginBottom: 24 }} />

                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
                    <div style={{ width: 36, height: 36, borderRadius: 10, background: `${colors.info || colors.primary}12`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                      <Send size={18} color={colors.info || colors.primary} />
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 16, fontWeight: 700, color: colors.textPrimary }}>ตั้งค่า Telegram</div>
                      <div style={{ fontSize: 12, color: colors.textSecondary }}>ข้อความและรูปภาพสำหรับส่งในกลุ่ม (ตั้งค่าต่อธีม)</div>
                    </div>
                    {!telegramConfigLoaded && (
                      <div style={{ fontSize: 12, color: colors.textTertiary }}>กำลังโหลด...</div>
                    )}
                  </div>

                  {/* รูปภาพ + ข้อความ */}
                  <div style={{ display: 'grid', gridTemplateColumns: type === 'เกมปาร์ตี้' ? 'auto 1fr 1fr' : 'auto 1fr', gap: 16, alignItems: 'start', marginBottom: 12 }}>
                    {/* รูปภาพ */}
                    <div style={{ width: 200 }}>
                      <input
                        id="telegram-party-image"
                        type="file"
                        accept="image/*"
                        onChange={handleTelegramImageFileChange}
                        style={{ display: 'none' }}
                      />
                      <label
                        htmlFor="telegram-party-image"
                        className="dropzone-btn"
                        style={{
                          display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8,
                          padding: 14, borderRadius: 12,
                          border: `2px dashed ${telegramPartyImageFile || telegramPartyImageUrl ? colors.primary : colors.borderLight}`,
                          background: telegramPartyImageFile || telegramPartyImageUrl ? `${colors.primary}06` : colors.bgSecondary,
                          cursor: 'pointer', transition: 'all 0.2s ease', textAlign: 'center',
                        }}
                      >
                        {telegramPartyImagePreview ? (
                          <img src={getImageUrl(telegramPartyImagePreview)} alt="preview" style={{ width: '100%', maxHeight: 140, objectFit: 'contain', borderRadius: 8 }} />
                        ) : (
                          <div style={{ padding: '16px 0' }}>
                            <FileImage size={28} color={colors.textTertiary} />
                            <div style={{ fontSize: 12, color: colors.textTertiary, marginTop: 6 }}>รูปภาพ Telegram</div>
                          </div>
                        )}
                        <div style={{ fontSize: 11, color: colors.textSecondary }}>
                          {telegramPartyImageFile?.name || (telegramPartyImageUrl ? 'คลิกเพื่อเปลี่ยน' : 'คลิกเพื่อเลือก')}
                        </div>
                      </label>
                    </div>

                    {/* ข้อความหลัก */}
                    <div>
                      <label className="admin-f-label" style={{ marginBottom: 6, fontSize: 12 }}>ข้อความส่ง Telegram</label>
                      <textarea
                        className="admin-f-control"
                        value={telegramPartyMessage}
                        onChange={(e) => setTelegramPartyMessage(e.target.value)}
                        rows={6}
                        style={{ minHeight: 140, resize: 'vertical', fontSize: 13 }}
                      />
                      <div style={{ fontSize: 11, color: colors.textTertiary, marginTop: 4 }}>
                        ใช้ตัวแปรได้: {'{gameName}'} และ {'{playerLink}'}
                      </div>
                    </div>

                    {/* ข้อความโค้ดเต็ม (เฉพาะปาร์ตี้) — แยกตามโหมด */}
                    {type === 'เกมปาร์ตี้' && (
                      <div style={{ display: 'grid', gap: 12 }}>
                        <label className="admin-f-label" style={{ marginBottom: 0, fontSize: 12 }}>
                          ข้อความเมื่อโค้ดเต็ม (ส่งเข้ากลุ่ม Telegram)
                        </label>

                        {/* การ์ดที่ 1: ภาพร่วมต่อรอบ (classic) */}
                        <div style={{
                          border: `1.5px solid ${partyMode === 'classic' ? colors.primary : colors.borderLight}`,
                          background: partyMode === 'classic' ? `${colors.primary}08` : '#fff',
                          borderRadius: 10,
                          padding: 12,
                          transition: 'all 0.2s ease',
                        }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                            <Users size={14} color={partyMode === 'classic' ? colors.primary : colors.textSecondary} />
                            <span style={{
                              fontSize: 12, fontWeight: 700,
                              color: partyMode === 'classic' ? colors.primary : colors.textSecondary,
                            }}>
                              โหมด: ภาพร่วมต่อรอบ
                            </span>
                            {partyMode === 'classic' && (
                              <span style={{
                                fontSize: 10, fontWeight: 700, padding: '2px 8px',
                                borderRadius: 999, background: colors.primary, color: '#fff',
                              }}>กำลังใช้</span>
                            )}
                          </div>
                          <textarea
                            className="admin-f-control"
                            value={telegramPartyCodeFullMessage}
                            onChange={(e) => setTelegramPartyCodeFullMessage(e.target.value)}
                            rows={6}
                            style={{ minHeight: 140, resize: 'vertical', fontSize: 13 }}
                            placeholder="ข้อความสำหรับโหมดภาพร่วมต่อรอบ"
                          />
                          <div style={{ fontSize: 11, color: colors.textTertiary, marginTop: 4 }}>
                            ใช้ตัวแปรได้: {'{gameName}'} {'{roundLabel}'} {'{answer}'} และ {'{playerLink}'}
                          </div>
                        </div>

                        {/* การ์ดที่ 2: สุ่มภาพรายผู้เล่น (random_pool) */}
                        <div style={{
                          border: `1.5px solid ${partyMode === 'random_pool' ? colors.primary : colors.borderLight}`,
                          background: partyMode === 'random_pool' ? `${colors.primary}08` : '#fff',
                          borderRadius: 10,
                          padding: 12,
                          transition: 'all 0.2s ease',
                        }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                            <Dices size={14} color={partyMode === 'random_pool' ? colors.primary : colors.textSecondary} />
                            <span style={{
                              fontSize: 12, fontWeight: 700,
                              color: partyMode === 'random_pool' ? colors.primary : colors.textSecondary,
                            }}>
                              โหมด: สุ่มภาพรายผู้เล่น
                            </span>
                            {partyMode === 'random_pool' && (
                              <span style={{
                                fontSize: 10, fontWeight: 700, padding: '2px 8px',
                                borderRadius: 999, background: colors.primary, color: '#fff',
                              }}>กำลังใช้</span>
                            )}
                          </div>
                          <textarea
                            className="admin-f-control"
                            value={telegramPartyCodeFullRandomMessage}
                            onChange={(e) => setTelegramPartyCodeFullRandomMessage(e.target.value)}
                            rows={6}
                            style={{ minHeight: 140, resize: 'vertical', fontSize: 13 }}
                            placeholder="ข้อความสำหรับโหมดสุ่มภาพรายผู้เล่น"
                          />
                          <div style={{ fontSize: 11, color: colors.textTertiary, marginTop: 4 }}>
                            ใช้ตัวแปรได้: {'{gameName}'} {'{roundLabel}'} และ {'{playerLink}'}
                            <span style={{ display: 'block', marginTop: 2, color: colors.textSecondary }}>
                              หมายเหตุ: โหมดนี้คำตอบของผู้เล่นแต่ละคนต่างกัน จึงไม่ใช้ {'{answer}'}
                            </span>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 12, paddingBottom: 4 }}>
                    <button
                      type="button"
                      className="dropzone-btn"
                      onClick={saveTelegramPartyConfig}
                      disabled={telegramConfigSaving}
                      style={{
                        display: 'inline-flex', alignItems: 'center', gap: 6,
                        padding: '8px 20px', borderRadius: 10, border: 'none',
                        background: colors.info || colors.primary, color: '#fff',
                        fontSize: 13, fontWeight: 700, cursor: telegramConfigSaving ? 'not-allowed' : 'pointer',
                        opacity: telegramConfigSaving ? 0.6 : 1,
                      }}
                    >
                      <Save size={14} /> {telegramConfigSaving ? 'กำลังบันทึก...' : 'บันทึกตั้งค่า Telegram'}
                    </button>
                  </div>

                  {type !== 'เกมปาร์ตี้' && (
                    <div style={{
                      width: '100%',
                      maxWidth: 560,
                      display: 'grid',
                      gap: 12,
                      margin: '10px auto 0',
                      justifyItems: 'center'
                    }}>
                      <div style={{
                        display: 'flex',
                        gap: 12,
                        alignItems: 'center',
                        justifyContent: 'center',
                        flexWrap: 'wrap',
                        width: '100%',
                        background: `linear-gradient(135deg, ${colors.bgSecondary} 0%, ${colors.bgPrimary} 100%)`,
                        border: `1px solid ${colors.borderLight}`,
                        borderRadius: 14,
                        padding: '12px 14px',
                        boxShadow: `0 6px 16px ${colors.shadowMedium}`
                      }}>
                        <label style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 6,
                          fontWeight: 700,
                          color: colors.textPrimary,
                          cursor: 'pointer'
                        }}>
                          <input
                            type="checkbox"
                            checked={telegramSendMode === 'now'}
                            onChange={() => setTelegramSendMode('now')}
                            style={{
                              width: 22,
                              height: 22,
                              accentColor: colors.primary,
                              cursor: 'pointer',
                              borderRadius: 6
                            }}
                          />
                          ส่งทันที
                        </label>
                        <label style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 6,
                          fontWeight: 700,
                          color: colors.textPrimary,
                          cursor: 'pointer'
                        }}>
                          <input
                            type="checkbox"
                            checked={telegramSendMode === 'schedule'}
                            onChange={() => setTelegramSendMode('schedule')}
                            style={{
                              width: 22,
                              height: 22,
                              accentColor: colors.primary,
                              cursor: 'pointer',
                              borderRadius: 6
                            }}
                          />
                          กำหนดเวลาส่ง
                        </label>

                        {telegramSendMode === 'schedule' && (
                          <input
                            type="datetime-local"
                            className="admin-f-control"
                            value={telegramScheduledAt}
                            onChange={(e) => setTelegramScheduledAt(e.target.value)}
                            style={{ minWidth: 240, height: 40 }}
                          />
                        )}
                      </div>

                      {pendingTelegramScheduleAt && telegramSendMode === 'schedule' && (
                        <div className="admin-muted" style={{ textAlign: 'center', marginTop: 2 }}>
                          ตั้งเวลาส่งไว้: {new Date(pendingTelegramScheduleAt).toLocaleString('th-TH')}
                        </div>
                      )}

                      <div style={{ display: 'flex', justifyContent: 'center', width: '100%' }}>
                        <button
                          type="button"
                          onClick={openTelegramShareForParty}
                          style={{
                            background: `linear-gradient(135deg, ${colors.info} 0%, ${colors.primary} 100%)`,
                            border: '1px solid rgba(255, 255, 255, 0.22)',
                            borderRadius: '12px',
                            padding: '12px 24px',
                            color: '#fff',
                            fontSize: '15px',
                            fontWeight: '800',
                            cursor: 'pointer',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '10px',
                            boxShadow: `0 8px 22px ${colors.shadowMedium}`,
                            transition: 'all 0.2s ease'
                          }}
                        >
                          <span
                            style={{
                              width: 22,
                              height: 22,
                              borderRadius: '50%',
                              background: 'rgba(255,255,255,0.18)',
                              display: 'inline-flex',
                              alignItems: 'center',
                              justifyContent: 'center'
                            }}
                          >
                            <Send size={14} color="#ffffff" />
                          </span>
                          ส่งกิจกรรมในกลุ่มเทเลแกรม
                        </button>
                      </div>
                    </div>
                  )}

                  {type === 'เกมปาร์ตี้' && partyRounds.length > 0 && (
                    <div style={{ display: 'grid', gap: 10 }}>
                      {partyRounds.map((_, idx) => (
                        <div
                          key={`telegram-party-round-${idx}`}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: 6,
                            border: `1px solid ${colors.borderLight}`,
                            borderRadius: 10,
                            padding: '5px 8px',
                            background: `linear-gradient(135deg, ${colors.bgSecondary} 0%, ${colors.bgPrimary} 100%)`,
                          }}
                        >
                          <span style={{ fontSize: 14, fontWeight: 800, color: colors.textPrimary, flexShrink: 0, whiteSpace: 'nowrap' }}>R{idx + 1}</span>
                          <input
                            id={`customerRoundLinkInput-${idx + 1}`}
                            className="admin-f-control"
                            value={getRoundCustomerLink(idx + 1)}
                            readOnly
                            style={{ width: '50%', flexShrink: 1, minWidth: 120, background: 'rgba(255,255,255,0.9)', border: '1px solid rgba(16,185,129,0.3)', borderRadius: 8, padding: '6px 10px', fontSize: 13, fontWeight: 600, color: '#1f2937', height: 36, margin: 0 }}
                          />
                          <button
                            type="button"
                            className="btn-upload"
                            onClick={async () => {
                              const roundLink = getRoundCustomerLink(idx + 1)
                              try {
                                await navigator.clipboard.writeText(roundLink)
                                alert(`คัดลอกลิงก์รอบ ${idx + 1} แล้ว`)
                              } catch {
                                alert('คัดลอกลิงก์ไม่สำเร็จ')
                              }
                            }}
                            aria-label={`คัดลอกลิงก์รอบ ${idx + 1}`}
                            title={`คัดลอกลิงก์รอบ ${idx + 1}`}
                            style={{ minWidth: 36, width: 36, height: 36, padding: 0, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}
                          >
                            <Copy size={16} />
                          </button>
                          <label style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontWeight: 700, fontSize: 13, color: colors.textPrimary, cursor: 'pointer', flexShrink: 0, whiteSpace: 'nowrap' }}>
                            <span style={{ width: 20, height: 20, borderRadius: '50%', background: (telegramRoundSendModes[idx + 1] || 'now') === 'now' ? '#10b981' : '#d1d5db', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 12, fontWeight: 900 }}>
                              {(telegramRoundSendModes[idx + 1] || 'now') === 'now' ? '✓' : ''}
                            </span>
                            <input type="checkbox" checked={(telegramRoundSendModes[idx + 1] || 'now') === 'now'} onChange={() => setTelegramRoundSendModes((prev) => ({ ...prev, [idx + 1]: 'now' }))} style={{ position: 'absolute', opacity: 0, width: 0, height: 0 }} />
                            ทันที
                          </label>
                          <label style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontWeight: 700, fontSize: 13, color: colors.textPrimary, cursor: 'pointer', flexShrink: 0, whiteSpace: 'nowrap' }}>
                            <span style={{ width: 20, height: 20, borderRadius: '50%', background: (telegramRoundSendModes[idx + 1] || 'now') === 'schedule' ? '#10b981' : '#d1d5db', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 12, fontWeight: 900 }}>
                              {(telegramRoundSendModes[idx + 1] || 'now') === 'schedule' ? '✓' : ''}
                            </span>
                            <input type="checkbox" checked={(telegramRoundSendModes[idx + 1] || 'now') === 'schedule'} onChange={() => setTelegramRoundSendModes((prev) => ({ ...prev, [idx + 1]: 'schedule' }))} style={{ position: 'absolute', opacity: 0, width: 0, height: 0 }} />
                            ตั้งเวลา
                          </label>
                          <input
                            type="datetime-local"
                            className="admin-f-control"
                            disabled={(telegramRoundSendModes[idx + 1] || 'now') !== 'schedule'}
                            value={telegramRoundScheduledAt[idx + 1] || ''}
                            onChange={(e) => {
                              setTelegramRoundScheduledAt((prev) => ({ ...prev, [idx + 1]: e.target.value }))
                              setTelegramRoundSendModes((prev) => ({ ...prev, [idx + 1]: 'schedule' }))
                            }}
                            style={{ height: 36, fontSize: 13, margin: 0, width: 175, flexShrink: 0, opacity: (telegramRoundSendModes[idx + 1] || 'now') !== 'schedule' ? 0.4 : 1, cursor: (telegramRoundSendModes[idx + 1] || 'now') !== 'schedule' ? 'not-allowed' : undefined }}
                          />
                          {telegramRoundSentStatus[idx + 1] === 'sent' ? (
                            <div style={{
                              display: 'inline-flex', alignItems: 'center', gap: 6,
                              padding: '6px 14px', borderRadius: 8, height: 36,
                              background: `${colors.success}14`, border: `1px solid ${colors.success}40`,
                              color: colors.success, fontSize: 13, fontWeight: 700,
                              flexShrink: 0, whiteSpace: 'nowrap',
                            }}>
                              <CheckCircle2 size={14} />
                              ส่งแล้ว
                            </div>
                          ) : telegramRoundSentStatus[idx + 1] === 'scheduled' ? (
                            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
                              <div style={{
                                display: 'inline-flex', alignItems: 'center', gap: 6,
                                padding: '6px 12px', borderRadius: '8px 0 0 8px', height: 36,
                                background: `${colors.warning || '#f59e0b'}14`, border: `1px solid ${colors.warning || '#f59e0b'}40`,
                                borderRight: 'none',
                                color: colors.warning || '#f59e0b', fontSize: 13, fontWeight: 700,
                                whiteSpace: 'nowrap',
                              }}>
                                <Clock size={14} />
                                รอเวลาส่ง {pendingTelegramRoundScheduleAt[idx + 1] ? new Date(pendingTelegramRoundScheduleAt[idx + 1]).toLocaleString('th-TH', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' }) : ''}
                              </div>
                              <button
                                type="button"
                                onClick={() => setCancelRoundConfirm(idx + 1)}
                                title={`ยกเลิกการส่งรอบ ${idx + 1}`}
                                style={{
                                  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                                  width: 36, height: 36, padding: 0,
                                  borderRadius: '0 8px 8px 0', border: `1px solid ${colors.danger}40`,
                                  background: `${colors.danger}14`, color: colors.danger,
                                  cursor: 'pointer', transition: 'all 0.15s ease', flexShrink: 0,
                                }}
                              >
                                <XCircle size={16} />
                              </button>
                            </div>
                          ) : (
                            <button
                              type="button"
                              onClick={() => sendTelegramByRound(idx + 1)}
                              style={{ background: `linear-gradient(135deg, ${colors.info} 0%, ${colors.primary} 100%)`, border: 'none', borderRadius: 8, padding: '6px 14px', color: '#fff', fontSize: 13, fontWeight: 800, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6, flexShrink: 0, height: 36, whiteSpace: 'nowrap' }}
                            >
                              <Send size={13} color="#ffffff" />
                              ส่งรอบ {idx + 1}
                            </button>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
          </>
        )}

        {/* ===== โซนล่างในโหมดแก้ไข ===== */}
        {/* ✅ ลบส่วนคำตอบผู้เล่นออกแล้ว (ย้ายไปไว้ในหน้า AdminAnswers.tsx แล้ว) */}

      {/* ====== รายงานการใช้งานของผู้เล่น (เฉพาะเกมเช็คอิน) ====== */}


      {isEdit ? (
        <div style={{ display: 'flex', gap: 12, marginTop: 28, justifyContent: 'center', flexWrap: 'wrap' }}>
          <button 
            className="admin-btn-cta" 
            style={{ minWidth: 200, width: 'auto', padding: '0 32px', gap: 8, opacity: (!isDirty && !isSaving) ? 0.5 : 1 }}
            onClick={() => setShowSubmitConfirm(true)}
            disabled={isSaving || gameDataLoading || !isDirty}
          >
            {isSaving ? <><Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} /> กำลังบันทึก...</> : <><Save size={16} /> บันทึกการเปลี่ยนแปลง</>}
          </button>
          <button 
            className="admin-btn-danger" 
            style={{ minWidth: 120, width: 'auto', padding: '0 24px' }}
            onClick={removeGame}
            disabled={isSaving || gameDataLoading}
          >
            <Trash2 size={14} /> ลบเกม
          </button>
        </div>
      ) : (
        <div style={{ display: 'flex', justifyContent: 'center', marginTop: 28 }}>
          <button 
            className="admin-btn-cta" 
            onClick={() => setShowSubmitConfirm(true)}
            disabled={isSaving}
            style={{ minWidth: 240, width: 'auto', padding: '0 40px', gap: 8 }}
          >
            {isSaving ? <><Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} /> กำลังสร้าง...</> : <><Plus size={16} /> สร้างเกม</>}
          </button>
        </div>
      )}

    </div>
    
    {showSubmitConfirm && (
      <div style={{
        position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
        background: 'rgba(0, 0, 0, 0.5)', display: 'flex',
        alignItems: 'center', justifyContent: 'center', zIndex: 9999,
      }}>
        <div style={{
          background: '#fff', borderRadius: 16, padding: '28px 32px',
          maxWidth: 420, width: '90%', boxShadow: '0 20px 60px rgba(0,0,0,0.2)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
            <div style={{
              width: 44, height: 44, borderRadius: 12,
              background: `${colors.primary}15`, display: 'flex',
              alignItems: 'center', justifyContent: 'center', flexShrink: 0,
            }}>
              <AlertTriangle size={22} color={colors.primary} />
            </div>
            <div>
              <div style={{ fontSize: 18, fontWeight: 800, color: colors.textPrimary }}>
                {isEdit ? 'ยืนยันบันทึกการเปลี่ยนแปลง' : 'ยืนยันสร้างเกม'}
              </div>
              <div style={{ fontSize: 13, color: colors.textSecondary, marginTop: 2 }}>
                {isEdit ? 'ต้องการบันทึกการเปลี่ยนแปลงเกมนี้หรือไม่?' : 'ต้องการสร้างเกมใหม่หรือไม่?'}
              </div>
            </div>
          </div>
          <div style={{
            background: colors.bgSecondary, borderRadius: 10, padding: 12, marginBottom: 20,
            border: `1px solid ${colors.borderLight}`, fontSize: 13, color: colors.textSecondary,
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
              <span>ชื่อเกม</span>
              <span style={{ fontWeight: 700, color: colors.textPrimary }}>{name || '-'}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span>ประเภท</span>
              <span style={{ fontWeight: 700, color: colors.primary }}>{type}</span>
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <button
              onClick={() => setShowSubmitConfirm(false)}
              style={{
                height: 44, borderRadius: 10, border: `1px solid ${colors.borderLight}`,
                background: '#fff', color: colors.textSecondary, fontWeight: 700,
                fontSize: 14, cursor: 'pointer', transition: 'all 0.15s ease',
              }}
            >
              ยกเลิก
            </button>
            <button
              onClick={() => { setShowSubmitConfirm(false); submit(); }}
              style={{
                height: 44, borderRadius: 10, border: 'none',
                background: colors.primary, color: '#fff', fontWeight: 700,
                fontSize: 14, cursor: 'pointer', transition: 'all 0.15s ease',
                boxShadow: `0 4px 12px ${colors.primary}40`,
              }}
            >
              {isEdit ? 'บันทึก' : 'สร้างเกม'}
            </button>
          </div>
        </div>
      </div>
    )}

    {cancelRoundConfirm !== null && (
      <div style={{
        position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
        background: 'rgba(0, 0, 0, 0.5)', display: 'flex',
        alignItems: 'center', justifyContent: 'center', zIndex: 9999,
      }}>
        <div style={{
          background: '#fff', borderRadius: 16, padding: '28px 32px',
          maxWidth: 400, width: '90%', boxShadow: '0 20px 60px rgba(0,0,0,0.2)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
            <div style={{
              width: 44, height: 44, borderRadius: 12,
              background: `${colors.danger}15`, display: 'flex',
              alignItems: 'center', justifyContent: 'center', flexShrink: 0,
            }}>
              <XCircle size={22} color={colors.danger} />
            </div>
            <div>
              <div style={{ fontSize: 18, fontWeight: 800, color: colors.textPrimary }}>
                ยกเลิกการส่งรอบ {cancelRoundConfirm}
              </div>
              <div style={{ fontSize: 13, color: colors.textSecondary, marginTop: 2 }}>
                ต้องการยกเลิกการตั้งเวลาส่งรอบนี้หรือไม่?
              </div>
            </div>
          </div>
          {pendingTelegramRoundScheduleAt[cancelRoundConfirm] && (
            <div style={{
              background: colors.bgSecondary, borderRadius: 10, padding: 12, marginBottom: 20,
              border: `1px solid ${colors.borderLight}`, fontSize: 13, color: colors.textSecondary,
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <Clock size={14} color={colors.warning || '#f59e0b'} /> เวลาที่ตั้งไว้
                </span>
                <span style={{ fontWeight: 700, color: colors.warning || '#f59e0b' }}>
                  {new Date(pendingTelegramRoundScheduleAt[cancelRoundConfirm]).toLocaleString('th-TH')}
                </span>
              </div>
            </div>
          )}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <button
              onClick={() => setCancelRoundConfirm(null)}
              style={{
                height: 44, borderRadius: 10, border: `1px solid ${colors.borderLight}`,
                background: '#fff', color: colors.textSecondary, fontWeight: 700,
                fontSize: 14, cursor: 'pointer', transition: 'all 0.15s ease',
              }}
            >
              ปิด
            </button>
            <button
              onClick={() => { cancelTelegramRoundSchedule(cancelRoundConfirm); setCancelRoundConfirm(null); }}
              style={{
                height: 44, borderRadius: 10, border: 'none',
                background: colors.danger, color: '#fff', fontWeight: 700,
                fontSize: 14, cursor: 'pointer', transition: 'all 0.15s ease',
                boxShadow: `0 4px 12px ${colors.danger}40`,
              }}
            >
              ยกเลิกการส่ง
            </button>
          </div>
        </div>
      </div>
    )}

    {/* ✅ Popup ยืนยันการอัพโหลดโค้ด */}
    {confirmCodeUpload.open && confirmCodeUpload.codes && (
      <div style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        background: 'rgba(0, 0, 0, 0.5)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 10000
      }}>
        <div style={{
          background: '#fff',
          borderRadius: '16px',
          padding: '24px',
          maxWidth: '500px',
          width: '90%',
          boxShadow: '0 20px 60px rgba(0, 0, 0, 0.3)'
        }}>
          <h3 style={{
            margin: '0 0 16px 0',
            fontSize: '20px',
            fontWeight: '700',
            color: '#1e293b'
          }}>
            ยืนยันการอัพโหลดโค้ด
          </h3>
          <div style={{
            marginBottom: '20px',
            padding: '16px',
            background: '#f8fafc',
            borderRadius: '12px',
            border: '1px solid #e2e8f0'
          }}>
            <div style={{ marginBottom: '8px', fontSize: '14px', color: '#64748b' }}>
              {confirmCodeUpload.type === 'dailyReward' && `Day ${(confirmCodeUpload.index ?? 0) + 1} - Daily Reward`}
              {confirmCodeUpload.type === 'completeReward' && 'Complete Reward'}
              {confirmCodeUpload.type === 'couponItem' && `Coupon Item ${(confirmCodeUpload.index ?? 0) + 1}`}
            </div>
            <div style={{ fontSize: '18px', fontWeight: '700', color: '#1e293b' }}>
              จำนวนโค้ด: {confirmCodeUpload.codes.length.toLocaleString('th-TH')} รายการ
            </div>
            {confirmCodeUpload.codes.length > 0 && (
              <div style={{
                marginTop: '12px',
                padding: '12px',
                background: '#fff',
                borderRadius: '8px',
                border: '1px solid #e2e8f0',
                maxHeight: '200px',
                overflowY: 'auto',
                fontSize: '12px',
                fontFamily: 'monospace',
                color: '#475569'
              }}>
                {confirmCodeUpload.codes.slice(0, 10).map((code, idx) => (
                  <div key={idx} style={{ marginBottom: '4px' }}>{code}</div>
                ))}
                {confirmCodeUpload.codes.length > 10 && (
                  <div style={{ marginTop: '8px', color: '#64748b', fontStyle: 'italic' }}>
                    ... และอีก {confirmCodeUpload.codes.length - 10} รายการ
                  </div>
                )}
              </div>
            )}
          </div>
          <div style={{
            display: 'flex',
            gap: '12px',
            justifyContent: 'flex-end'
          }}>
            <button
              type="button"
              onClick={() => {
                setConfirmCodeUpload({
                  open: false,
                  type: null,
                  index: null,
                  codes: null,
                  onConfirm: null
                })
              }}
              style={{
                padding: '10px 20px',
                background: '#f1f5f9',
                border: '1px solid #e2e8f0',
                borderRadius: '8px',
                cursor: 'pointer',
                fontSize: '14px',
                fontWeight: '600',
                color: '#475569'
              }}
            >
              ยกเลิก
            </button>
            <button
              type="button"
              onClick={() => {
                if (confirmCodeUpload.onConfirm) {
                  confirmCodeUpload.onConfirm()
                }
              }}
              style={{
                padding: '10px 20px',
                background: 'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)',
                border: 'none',
                borderRadius: '8px',
                cursor: 'pointer',
                fontSize: '14px',
                fontWeight: '600',
                color: '#fff',
                boxShadow: '0 4px 12px rgba(59, 130, 246, 0.3)'
              }}
            >
              ยืนยัน
            </button>
          </div>
        </div>
      </div>
    )}

    {confirmFeatureChange.open && (
      <div style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.5)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 10000
      }} onClick={cancelFeatureChangeHandler}>
        <div style={{
          backgroundColor: 'white',
          borderRadius: '16px',
          padding: '24px',
          maxWidth: '400px',
          width: '90%',
          boxShadow: '0 20px 60px rgba(0, 0, 0, 0.3)'
        }} onClick={(e) => e.stopPropagation()}>
          <div style={{
            fontSize: '20px',
            fontWeight: '700',
            color: '#0f172a',
            marginBottom: '16px',
            display: 'flex',
            alignItems: 'center',
            gap: '8px'
          }}>
            ⚙️ ยืนยันการเปลี่ยนแปลง
          </div>
          <div style={{
            fontSize: '15px',
            color: '#475569',
            marginBottom: '24px',
            lineHeight: '1.6'
          }}>
            คุณต้องการ{confirmFeatureChange.newValue ? 'เปิด' : 'ปิด'} <strong>{
              confirmFeatureChange.feature === 'dailyReward' ? 'Daily Reward' :
              confirmFeatureChange.feature === 'couponShop' ? 'Coupon Shop' : ''
            }</strong> หรือไม่?
            <br />
            <span style={{ fontSize: '13px', color: '#94a3b8', marginTop: '8px', display: 'block' }}>
              การเปลี่ยนแปลงนี้จะมีผลทันทีหลังจากบันทึก
            </span>
          </div>
          <div style={{
            display: 'flex',
            gap: '12px',
            justifyContent: 'flex-end'
          }}>
            <button
              onClick={cancelFeatureChangeHandler}
              style={{
                padding: '10px 20px',
                borderRadius: '8px',
                border: '1px solid #e2e8f0',
                backgroundColor: '#f8fafc',
                color: '#475569',
                fontSize: '14px',
                fontWeight: '600',
                cursor: 'pointer',
                transition: 'all 0.2s'
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = '#f1f5f9'
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = '#f8fafc'
              }}
            >
              ยกเลิก
            </button>
            <button
              onClick={confirmFeatureChangeHandler}
              style={{
                padding: '10px 20px',
                borderRadius: '8px',
                border: 'none',
                backgroundColor: '#3b82f6',
                color: 'white',
                fontSize: '14px',
                fontWeight: '600',
                cursor: 'pointer',
                transition: 'all 0.2s'
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = '#2563eb'
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = '#3b82f6'
              }}
            >
              ยืนยัน
            </button>
          </div>
        </div>
      </div>
    )}
    {/* ===== Delete Game Confirmation Popup ===== */}
    {showDeleteConfirm && createPortal(
      <div
        onClick={() => setShowDeleteConfirm(false)}
        style={{
          position: 'fixed', inset: 0, zIndex: 99999,
          background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(4px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}
      >
        <div
          onClick={(e) => e.stopPropagation()}
          style={{
            background: '#fff', borderRadius: 20, padding: '28px 28px 24px',
            maxWidth: 400, width: '90%', boxShadow: '0 20px 60px rgba(0,0,0,0.2)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
            <div style={{
              width: 48, height: 48, borderRadius: 14,
              background: `${colors.danger}12`, display: 'flex',
              alignItems: 'center', justifyContent: 'center', flexShrink: 0,
            }}>
              <Trash2 size={22} color={colors.danger} />
            </div>
            <div>
              <div style={{ fontSize: 18, fontWeight: 800, color: '#1f2937' }}>ยืนยันลบเกม</div>
              <div style={{ fontSize: 13, color: '#6b7280', marginTop: 2 }}>การลบจะไม่สามารถย้อนกลับได้</div>
            </div>
          </div>
          <div style={{
            background: '#fef2f2', borderRadius: 12, padding: '14px 16px', marginBottom: 20,
            border: '1px solid #fecaca',
          }}>
            <div style={{ fontSize: 13, color: '#991b1b', fontWeight: 600, lineHeight: 1.6 }}>
              ต้องการลบเกม <b>"{name || 'ไม่มีชื่อ'}"</b> และข้อมูลที่เกี่ยวข้องทั้งหมดหรือไม่?
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <button
              onClick={() => setShowDeleteConfirm(false)}
              style={{
                height: 44, borderRadius: 12, border: `1px solid ${colors.borderLight}`,
                background: '#fff', color: '#6b7280', fontWeight: 700,
                fontSize: 14, cursor: 'pointer',
              }}
            >
              ยกเลิก
            </button>
            <button
              onClick={executeDeleteGame}
              style={{
                height: 44, borderRadius: 12, border: 'none',
                background: `linear-gradient(135deg, ${colors.danger} 0%, #b91c1c 100%)`,
                color: '#fff', fontWeight: 700, fontSize: 14, cursor: 'pointer',
                boxShadow: `0 4px 12px ${colors.danger}40`,
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
              }}
            >
              <Trash2 size={14} /> ลบเกม
            </button>
          </div>
        </div>
      </div>,
      document.body
    )}

    {/* ===== Toast notification ===== */}
    {announceToast && createPortal(
      <div
        onClick={() => setAnnounceToast(null)}
        style={{
          position: 'fixed', top: 20, left: '50%', transform: 'translateX(-50%)',
          zIndex: 99999, display: 'flex', alignItems: 'center', gap: 10,
          padding: '12px 20px', borderRadius: 14,
          background: announceToast.type === 'success' ? '#f0fdf4' : announceToast.type === 'error' ? '#fef2f2' : '#eff6ff',
          border: `1.5px solid ${announceToast.type === 'success' ? '#86efac' : announceToast.type === 'error' ? '#fecaca' : '#93c5fd'}`,
          boxShadow: '0 8px 30px rgba(0,0,0,0.12)',
          cursor: 'pointer', animation: 'toastSlideDown 0.3s ease',
          maxWidth: 420,
        }}
      >
        {announceToast.type === 'success' && <CheckCircle2 size={18} color="#16a34a" />}
        {announceToast.type === 'error' && <XCircle size={18} color="#dc2626" />}
        {announceToast.type === 'info' && <AlertTriangle size={18} color="#2563eb" />}
        <span style={{
          fontSize: 14, fontWeight: 600,
          color: announceToast.type === 'success' ? '#166534' : announceToast.type === 'error' ? '#991b1b' : '#1e40af',
        }}>
          {announceToast.msg}
        </span>
      </div>,
      document.body
    )}

    </div>
  )
}

