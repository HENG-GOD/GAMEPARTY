/**
 * Telegram webhook receiver for adding users via a forum supergroup.
 *
 * Setup (one-time):
 *   1. Create a Telegram bot via @BotFather, get TOKEN.
 *   2. Add the bot to the supergroup as admin (with "Read messages" permission).
 *      Disable "Privacy mode" via @BotFather (/setprivacy → Disable) so the bot
 *      can read all messages, not just commands.
 *   3. Set Netlify env vars (Site settings → Environment variables):
 *        TG_USER_BOT_TOKEN         = <token from BotFather>
 *        TG_USER_GROUP_ID          = -100xxxxxxxxxx  (the supergroup chat.id)
 *        TG_USER_WEBHOOK_SECRET    = <random string, used as webhook secret>
 *        TG_USER_TOPIC_HENG36      = <message_thread_id of heng36 topic>
 *        TG_USER_TOPIC_MAX56       = ...
 *        TG_USER_TOPIC_JEED24      = ...
 *        TG_USER_TOPIC_KAMO99      = ...
 *        TG_USER_TOPIC_KIKI49      = ...
 *        TG_USER_TOPIC_MAB96       = ...
 *        TG_USER_TOPIC_ABM96       = ...
 *        TG_USER_TOPIC_AIGAMING88  = ...
 *   4. Register the webhook (once, from any shell):
 *        curl -F "url=https://<your-site>.netlify.app/api/telegram/receive-users" \
 *             -F "secret_token=<TG_USER_WEBHOOK_SECRET>" \
 *             -F "allowed_updates=[\"message\"]" \
 *             "https://api.telegram.org/bot<TG_USER_BOT_TOKEN>/setWebhook"
 *
 * Message format (admin posts in the topic that matches the theme):
 *   USERNAME
 *   PASSWORD
 *
 * The bot replies in-thread with success or error.
 */

const { initializeApp, getApps } = require('firebase/app')
const {
  getFirestore,
  doc,
  getDoc,
  setDoc,
  serverTimestamp,
} = require('firebase/firestore')

const FIREBASE_CONFIG = {
  apiKey: 'AIzaSyBI2ow1DLQ8tIo7C1Lvx9leeYLyOBI00nM',
  authDomain: 'gameparty-8911c.firebaseapp.com',
  databaseURL:
    'https://gameparty-8911c-default-rtdb.asia-southeast1.firebasedatabase.app',
  projectId: 'gameparty-8911c',
  storageBucket: 'gameparty-8911c.firebasestorage.app',
  messagingSenderId: '214762802082',
  appId: '1:214762802082:web:2ccf452f943610d0ee00fb',
}

const THEMES = [
  'heng36',
  'max56',
  'jeed24',
  'kamo99',
  'kiki49',
  'mab96',
  'abm96',
  'aigaming88',
]

function getDb() {
  const app = getApps().length ? getApps()[0] : initializeApp(FIREBASE_CONFIG)
  return getFirestore(app, 'gameparty')
}

function topicMap() {
  const out = {}
  for (const t of THEMES) {
    const raw = process.env[`TG_USER_TOPIC_${t.toUpperCase()}`]
    const id = raw && raw.trim() ? Number(raw.trim()) : NaN
    if (Number.isFinite(id)) out[id] = t
  }
  return out
}

function normalizeUser(raw) {
  return String(raw || '').trim().replace(/\s+/g, '').toUpperCase()
}

function padPassword(raw) {
  const digitsOnly = String(raw || '').replace(/\D+/g, '')
  if (!digitsOnly) return ''
  return digitsOnly.slice(-4).padStart(4, '0')
}

async function sendReply({ token, chatId, threadId, replyToId, text }) {
  const payload = {
    chat_id: chatId,
    text,
    message_thread_id: threadId,
    reply_parameters: { message_id: replyToId, allow_sending_without_reply: true },
    disable_web_page_preview: true,
  }
  try {
    await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
  } catch (err) {
    console.error('[receive-telegram-users] sendMessage failed:', err)
  }
}

const ok200 = { statusCode: 200, body: 'OK' }

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'METHOD_NOT_ALLOWED' }
  }

  const token = process.env.TG_USER_BOT_TOKEN
  const groupId = process.env.TG_USER_GROUP_ID
  const secret = process.env.TG_USER_WEBHOOK_SECRET

  if (!token || !groupId) {
    console.error('[receive-telegram-users] Missing TG_USER_BOT_TOKEN or TG_USER_GROUP_ID')
    return ok200
  }

  // Verify Telegram-supplied secret token (defense against spoofed POSTs).
  if (secret) {
    const headerKey = Object.keys(event.headers || {}).find(
      (k) => k.toLowerCase() === 'x-telegram-bot-api-secret-token'
    )
    const got = headerKey ? event.headers[headerKey] : ''
    if (got !== secret) {
      console.warn('[receive-telegram-users] Bad secret token')
      return ok200
    }
  }

  let update
  try {
    update = event.body ? JSON.parse(event.body) : {}
  } catch (err) {
    console.error('[receive-telegram-users] Bad JSON:', err)
    return ok200
  }

  const msg = update.message
  if (!msg || !msg.text) return ok200

  // Only listen in the configured supergroup.
  if (String(msg.chat?.id) !== String(groupId)) return ok200

  const threadId = msg.message_thread_id
  if (!threadId) return ok200 // ignore messages outside any topic (general channel)

  const themesByTopic = topicMap()
  const theme = themesByTopic[threadId]
  if (!theme) return ok200 // unknown topic — silently ignore

  const replyArgs = {
    token,
    chatId: msg.chat.id,
    threadId,
    replyToId: msg.message_id,
  }

  // Parse the text body: first line USER, second line PASSWORD.
  const lines = String(msg.text).split(/\r?\n/).map((s) => s.trim()).filter(Boolean)
  if (lines.length < 2) {
    await sendReply({
      ...replyArgs,
      text: '❌ รูปแบบไม่ถูกต้อง\nต้องมี 2 บรรทัด:\n  บรรทัด 1: USER\n  บรรทัด 2: PASSWORD',
    })
    return ok200
  }

  const userId = normalizeUser(lines[0])
  const password = padPassword(lines[1])

  if (!userId) {
    await sendReply({ ...replyArgs, text: '❌ USER ไม่ถูกต้อง — ห้ามว่างเปล่า' })
    return ok200
  }
  if (!password) {
    await sendReply({
      ...replyArgs,
      text: '❌ PASSWORD ไม่ถูกต้อง — ต้องเป็นตัวเลข',
    })
    return ok200
  }

  // Write to Firestore at themes/{theme}/users/{userId}.
  try {
    const db = getDb()
    const ref = doc(db, 'themes', theme, 'users', userId)
    const existing = await getDoc(ref)
    const isUpdate = existing.exists()
    const oldPassword = isUpdate ? String(existing.data().password || '') : ''

    await setDoc(
      ref,
      {
        userId,
        password,
        updatedAt: serverTimestamp(),
        ...(isUpdate ? {} : { createdAt: serverTimestamp() }),
      },
      { merge: true }
    )

    const themeLabel = theme.toUpperCase()
    const text =
      isUpdate && oldPassword && oldPassword !== password
        ? `🔄 อัปเดต PASSWORD\n─────────────────\nUSER:     ${userId}\nPASSWORD: ${password} (เดิม: ${oldPassword})\nTHEME:    ${themeLabel}`
        : isUpdate
        ? `🔄 บันทึกซ้ำ (PASSWORD เดิม)\n─────────────────\nUSER:     ${userId}\nPASSWORD: ${password}\nTHEME:    ${themeLabel}`
        : `✅ เพิ่ม USER สำเร็จ\n─────────────────\nUSER:     ${userId}\nPASSWORD: ${password}\nTHEME:    ${themeLabel}`

    await sendReply({ ...replyArgs, text })
  } catch (err) {
    console.error('[receive-telegram-users] Firestore error:', err)
    await sendReply({
      ...replyArgs,
      text: `❌ บันทึกไม่สำเร็จ\n${err && err.message ? err.message : 'unknown error'}`,
    })
  }

  return ok200
}
