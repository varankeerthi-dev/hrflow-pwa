import { useEffect, useMemo, useState } from 'react'
import { collection, onSnapshot, query, where, updateDoc, doc, serverTimestamp, arrayUnion, increment } from 'firebase/firestore'
import { db } from '../lib/firebase'

const canSeeAll = (user) => ['admin', 'md'].includes((user?.role || '').toLowerCase())

export function useTasks(user, { clientFilter = 'all' } = {}) {
  const [tasks, setTasks] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    if (!user?.orgId) {
      setTasks([])
      setLoading(false)
      setError(null)
      return
    }
    setLoading(true)
    setError(null)
    const q = query(
      collection(db, 'tasks'),
      where('organizationId', '==', user.orgId)
    )
    const unsub = onSnapshot(q, (snap) => {
      const data = snap.docs.map(d => ({ id: d.id, ...d.data() }))
      setTasks(data)
      setLoading(false)
    }, (err) => {
      console.error('useTasks snapshot error', err)
      setError(err)
      setLoading(false)
    })
    return unsub
  }, [user?.orgId])

  const visibleTasks = useMemo(() => {
    const filtered = tasks.filter(task => {
      if (task.isPersonal) {
        return task.createdBy === user?.uid || (task.assignedTo || []).includes(user?.uid)
      }
      return (task.assignedTo || []).includes(user?.uid) || canSeeAll(user)
    })

    return filtered.filter(task => {
      if (clientFilter === 'all') return true
      if (clientFilter === 'internal') return !task.clientType
      return task.clientType === clientFilter
    })
  }, [tasks, clientFilter, user])

  return { tasks: visibleTasks, rawTasks: tasks, loading, error }
}

export async function updateTaskStatus(task, status, extra = {}) {
  const ref = doc(db, 'tasks', task.id)
  const updates = { status, ...extra }
  if (status === 'completed') {
    updates.completedAt = serverTimestamp()
  } else if (task.status === 'completed' && status !== 'completed') {
    updates.completedAt = null
  }
  if (status === 'on_hold' && !updates.onHoldSince) {
    updates.onHoldSince = serverTimestamp()
  }
  await updateDoc(ref, updates)
}

export async function postponeTask(taskId, { reason, oldDate, newDate, userId }) {
  const ref = doc(db, 'tasks', taskId)
  await updateDoc(ref, {
    dueDate: newDate,
    postponedCount: increment(1),
    postponeHistory: arrayUnion({
      reason,
      oldDate,
      newDate,
      postponedAt: serverTimestamp(),
      postponedBy: userId
    })
  })
}
