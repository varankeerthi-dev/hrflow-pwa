import { arrayUnion, collection, doc, runTransaction, serverTimestamp, Timestamp } from 'firebase/firestore'
import { db } from './firebase'
import { taskDoc } from './firestore'

export const MAX_PROGRESS_LENGTH = 2000

export function canUpdateTaskProgress(task, user) {
  return Boolean(task && user?.uid && (!task.isPersonal || task.createdBy === user.uid))
}

export function validateTaskProgress({ text, nextFollowUpDate }) {
  const updates = {}
  if (text !== undefined) {
    if (typeof text !== 'string' || !text.trim()) throw new Error('Enter a progress update.')
    if (text.trim().length > MAX_PROGRESS_LENGTH) throw new Error(`Keep updates within ${MAX_PROGRESS_LENGTH} characters.`)
    updates.text = text.trim()
  }
  if (nextFollowUpDate !== undefined) {
    if (nextFollowUpDate !== null) {
      const date = new Date(`${nextFollowUpDate}T12:00:00Z`)
      if (typeof nextFollowUpDate !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(nextFollowUpDate) || Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== nextFollowUpDate) {
        throw new Error('Choose a valid follow-up date.')
      }
    }
    updates.nextFollowUpDate = nextFollowUpDate
  }
  if (!Object.keys(updates).length) throw new Error('Enter an update or change the follow-up date.')
  return updates
}

// Detail editors hold task snapshots; never let those snapshots replace live progress.
export function withoutTaskProgress(updates) {
  return Object.fromEntries(Object.entries(updates).filter(([key]) => !['progressUpdates', 'nextFollowUpDate'].includes(key)))
}

export async function saveTaskProgress(orgId, taskId, user, input) {
  if (!orgId || !taskId || !user?.uid) throw new Error('Sign in to update this task.')
  const changes = validateTaskProgress(input)
  const taskRef = taskDoc(orgId, taskId)
  const auditRef = doc(collection(db, 'organisations', orgId, 'audit_logs'))
  const entry = changes.text ? {
    id: auditRef.id,
    text: changes.text,
    authorId: user.uid,
    authorName: user.name || user.email || 'Unknown user',
    createdAt: Timestamp.now(),
    ...(changes.nextFollowUpDate !== undefined ? { nextFollowUpDate: changes.nextFollowUpDate } : {})
  } : null

  await runTransaction(db, async (transaction) => {
    const snapshot = await transaction.get(taskRef)
    if (!snapshot.exists()) throw new Error('This task no longer exists.')
    if (!canUpdateTaskProgress(snapshot.data(), user)) throw new Error('You do not have permission to update this task.')
    const updates = { updatedAt: serverTimestamp() }
    if (entry) updates.progressUpdates = arrayUnion(entry)
    if (changes.nextFollowUpDate !== undefined) updates.nextFollowUpDate = changes.nextFollowUpDate
    transaction.update(taskRef, updates)
    transaction.set(auditRef, {
      module: 'Tasks',
      action: entry ? 'PROGRESS_UPDATE' : 'FOLLOW_UP_UPDATE',
      taskId,
      details: entry ? entry.text : 'Changed next follow-up date',
      ...(changes.nextFollowUpDate !== undefined ? { nextFollowUpDate: changes.nextFollowUpDate } : {}),
      performedBy: user.name || user.email || 'Unknown user',
      performedById: user.uid,
      timestamp: serverTimestamp()
    })
  })
}
