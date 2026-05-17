/**
 * One-off cleanup script — delete all BINGO-related Firestore data after the
 * feature was removed from the codebase.
 *
 * What it removes per theme (heng36, max56, jeed24, kamo99, kiki49, mab96,
 * abm96, aigaming88):
 *   - All documents under themes/{theme}/bingo_cards
 *   - All documents under themes/{theme}/bingo_players
 *   - All documents under themes/{theme}/bingo_state
 *   - All documents under themes/{theme}/games where type === 'เกม BINGO'
 *   - The `bingo` field on any remaining games document that still has it
 *     (data was sometimes nested under games.gameData.bingo as well — both
 *     locations are scrubbed).
 *
 * Auth: Firestore rules in this project are fully public
 * (`allow read, write: if true`), so the regular Firebase Web SDK is enough.
 * No service account / admin SDK needed.
 *
 * Run with:
 *   npx tsx scripts/delete-bingo-data.ts
 *
 * The script is dry-run by default; pass --apply to actually delete.
 */

import { initializeApp } from 'firebase/app'
import {
  getFirestore,
  collection,
  getDocs,
  doc,
  deleteDoc,
  updateDoc,
  deleteField,
  query,
  where,
  writeBatch,
} from 'firebase/firestore'

const firebaseConfig = {
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
] as const

const BINGO_GAME_TYPE = 'เกม BINGO'
const SUBCOLLECTIONS = ['bingo_cards', 'bingo_players', 'bingo_state'] as const

const apply = process.argv.includes('--apply')

const app = initializeApp(firebaseConfig)
const db = getFirestore(app, 'gameparty')

async function deleteAllDocs(themePath: string, sub: string): Promise<number> {
  const ref = collection(db, 'themes', themePath, sub)
  const snap = await getDocs(ref)
  if (snap.empty) return 0
  if (!apply) return snap.size

  let deleted = 0
  const docs = snap.docs
  for (let i = 0; i < docs.length; i += 400) {
    const slice = docs.slice(i, i + 400)
    const batch = writeBatch(db)
    slice.forEach((d) => batch.delete(d.ref))
    await batch.commit()
    deleted += slice.length
  }
  return deleted
}

async function deleteBingoGames(themePath: string): Promise<{
  matched: number
  scrubbedFields: number
}> {
  const gamesRef = collection(db, 'themes', themePath, 'games')
  const allSnap = await getDocs(gamesRef)
  let matched = 0
  let scrubbedFields = 0

  for (const docSnap of allSnap.docs) {
    const data = docSnap.data() as Record<string, unknown>
    const topType = data.type
    const nestedType = (data.gameData as Record<string, unknown> | undefined)
      ?.type
    const isBingo = topType === BINGO_GAME_TYPE || nestedType === BINGO_GAME_TYPE

    if (isBingo) {
      matched += 1
      if (apply) await deleteDoc(docSnap.ref)
      continue
    }

    const hasTopField = 'bingo' in data
    const hasNestedField =
      data.gameData && typeof data.gameData === 'object' && 'bingo' in (data.gameData as object)
    if (hasTopField || hasNestedField) {
      scrubbedFields += 1
      if (apply) {
        const update: Record<string, unknown> = {}
        if (hasTopField) update.bingo = deleteField()
        if (hasNestedField) update['gameData.bingo'] = deleteField()
        await updateDoc(docSnap.ref, update)
      }
    }
  }

  return { matched, scrubbedFields }
}

async function run(): Promise<void> {
  console.log(apply ? '=== APPLY MODE (will delete) ===' : '=== DRY RUN (use --apply to delete) ===')

  let grandTotal = 0
  for (const theme of THEMES) {
    console.log(`\n[${theme}]`)
    for (const sub of SUBCOLLECTIONS) {
      const n = await deleteAllDocs(theme, sub)
      console.log(`  ${sub}: ${n} doc(s)`)
      grandTotal += n
    }
    const { matched, scrubbedFields } = await deleteBingoGames(theme)
    console.log(`  games (type=BINGO): ${matched} doc(s) deleted`)
    console.log(`  games with stray 'bingo' field: ${scrubbedFields} doc(s) scrubbed`)
    grandTotal += matched + scrubbedFields
  }

  console.log(`\nTotal touched: ${grandTotal} record(s).`)
  if (!apply) {
    console.log('\nRe-run with --apply to actually delete.')
  }
  process.exit(0)
}

run().catch((err) => {
  console.error('Fatal:', err)
  process.exit(1)
})
