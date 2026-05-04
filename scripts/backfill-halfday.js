import { initializeApp } from 'firebase/app'
import { getAuth, signInWithEmailAndPassword } from 'firebase/auth'
import { getFirestore, collection, getDocs, setDoc, doc, query, orderBy } from 'firebase/firestore'

const firebaseConfig = {
  apiKey: "AIzaSyAuIJ4rON_RWKADbYjV7AfaX4MZoUMfcJo",
  authDomain: "attendance-108ba.firebaseapp.com",
  projectId: "attendance-108ba",
  storageBucket: "attendance-108ba.firebasestorage.app",
  messagingSenderId: "583226584419",
  appId: "1:583226584419:web:875278b298151a52ef7756",
}

const app = initializeApp(firebaseConfig)
const auth = getAuth(app)
const db = getFirestore(app)

async function migrateHalfDay(orgId) {
  console.log('🔐 Signing in...')
  const email = process.env.FIREBASE_AUTH_EMAIL || process.argv[2]
  const password = process.env.FIREBASE_AUTH_PASSWORD || process.argv[3]
  if (!email || !password) {
    console.error('Usage: node backfill-halfday.js <email> <password>')
    console.error('  or set FIREBASE_AUTH_EMAIL and FIREBASE_AUTH_PASSWORD env vars')
    process.exit(1)
  }
  await signInWithEmailAndPassword(auth, email, password)
  console.log('✅ Signed in')

  console.log('📖 Fetching correction logs...')
  const correctionsSnap = await getDocs(
    query(collection(db, 'organisations', orgId, 'corrections'), orderBy('timestamp', 'asc'))
  )
  console.log(`  Found ${correctionsSnap.size} correction records`)

  let backfilled = 0
  let skipped = 0

  for (const corrDoc of correctionsSnap.docs) {
    const corr = corrDoc.data()
    const newStatus = String(corr.newValues?.status || '').toLowerCase()

    if (!newStatus.includes('half')) continue

    const { employeeId, date } = corr
    if (!employeeId || !date) { skipped++; continue }

    const attRef = doc(db, 'organisations', orgId, 'attendance', `${date}_${employeeId}`)
    const attSnap = await getDoc(attRef)

    if (!attSnap.exists()) {
      console.log(`  ⚠️  Attendance doc missing: ${date}_${employeeId}`)
      skipped++
      continue
    }

    const existing = attSnap.data()
    if (existing.isHalfDay === true) { skipped++; continue }

    await setDoc(attRef, {
      isHalfDay: true,
      backfilledAt: new Date().toISOString(),
      backfilledBy: 'migration/backfill-halfday'
    }, { merge: true })

    backfilled++
    console.log(`  ✅ ${date} — ${corr.employeeName || employeeId} → isHalfDay: true`)
  }

  console.log(`\n🏁 Done: ${backfilled} backfilled, ${skipped} skipped`)
}

// Default org — override with FIREBASE_ORG_ID env var
const orgId = process.env.FIREBASE_ORG_ID || 'techcorp'
migrateHalfDay(orgId).catch(console.error)
