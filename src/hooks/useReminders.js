import { useEffect, useMemo, useState } from 'react'
import { collection, onSnapshot, query, where, addDoc, updateDoc, doc, serverTimestamp, arrayUnion, getDoc } from 'firebase/firestore'
import { db } from '../lib/firebase'

export function useReminders(user) {
  const [reminders, setReminders] = useState([])

  useEffect(() => {
    if (!user?.orgId) return
    const q = query(
      collection(db, 'reminders'),
      where('organizationId', '==', user.orgId),
      where('isActive', '==', true)
    )
    const unsub = onSnapshot(q, (snap) => {
      const data = snap.docs.map(d => ({ id: d.id, ...d.data() }))
      setReminders(data)
    })
    return unsub
  }, [user?.orgId])

  const visibleReminders = useMemo(() => {
    return reminders.filter(r => {
      if (!r) return false
      if (!r.targetUsers || r.targetUsers.length === 0) return true
      return r.targetUsers.includes(user?.uid) || r.createdBy === user?.uid
    })
  }, [reminders, user?.uid])

  const unreadCount = useMemo(() => {
    return visibleReminders.filter(r => !(r.dismissedBy || []).includes(user?.uid)).length
  }, [visibleReminders, user?.uid])

  return { reminders: visibleReminders, unreadCount }
}

export async function createReminder(payload) {
  const { organizationId } = payload
  if (!organizationId) return
  await addDoc(collection(db, 'reminders'), {
    dismissedBy: [],
    isActive: true,
    createdAt: serverTimestamp(),
    ...payload,
  })
}

export async function dismissReminder(reminderId, userId) {
  if (!reminderId || !userId) return
  const ref = doc(db, 'reminders', reminderId)
  await updateDoc(ref, {
    dismissedBy: arrayUnion(userId)
  })
  const snap = await getDoc(ref)
  const data = snap.data()
  const targets = data?.targetUsers
  if (Array.isArray(targets) && targets.length > 0) {
    const allDismissed = targets.every(uid => (data.dismissedBy || []).includes(uid))
    if (allDismissed) {
      await updateDoc(ref, { isActive: false })
    }
  }
}
