/**
 * One-off utility: set organizationId on tasks that are missing or incorrect.
 * Usage:
 *   set GOOGLE_APPLICATION_CREDENTIALS to your service account JSON
 *   node scripts/normalize-tasks.js <TARGET_ORG_ID>
 *
 * Optional env:
 *   DRY_RUN=true   // only log what would change
 */

const admin = require('firebase-admin')

if (!process.env.GOOGLE_APPLICATION_CREDENTIALS) {
  console.error('Set GOOGLE_APPLICATION_CREDENTIALS to a service account JSON file.')
  process.exit(1)
}

const targetOrg = process.argv[2]
if (!targetOrg) {
  console.error('Usage: node scripts/normalize-tasks.js <TARGET_ORG_ID>')
  process.exit(1)
}

const dryRun = process.env.DRY_RUN === 'true'

admin.initializeApp()
const db = admin.firestore()

async function run() {
  console.log(`Scanning tasks to set organizationId="${targetOrg}" (dryRun=${dryRun})`)

  // fetch tasks missing org or with mismatched org
  const missing = await db.collection('tasks').where('organizationId', '==', null).get()
  const wrong = await db.collection('tasks').where('organizationId', '!=', targetOrg).get()

  const toUpdate = new Map()
  missing.forEach(d => toUpdate.set(d.id, d))
  wrong.forEach(d => toUpdate.set(d.id, d))

  console.log(`Found ${toUpdate.size} tasks to normalize`)
  if (dryRun) {
    toUpdate.forEach((doc, id) => console.log(`Would update ${id} (current org: ${doc.data().organizationId || 'null'})`))
    return
  }

  const batches = []
  let batch = db.batch()
  let count = 0

  for (const [id, doc] of toUpdate) {
    batch.update(doc.ref, { organizationId: targetOrg })
    count++
    if (count % 400 === 0) { // keep batch sizes safe
      batches.push(batch.commit())
      batch = db.batch()
    }
  }
  batches.push(batch.commit())
  await Promise.all(batches)
  console.log(`Updated ${count} tasks.`)
}

run().catch(err => {
  console.error('Error normalizing tasks', err)
  process.exit(1)
})
