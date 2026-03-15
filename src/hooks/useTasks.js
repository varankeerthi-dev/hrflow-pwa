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

    const unsubs = []
    const base = collection(db, 'tasks')

    // Org-scoped tasks
    unsubs.push(onSnapshot(
      query(base, where('organizationId', '==', user.orgId)),
      (snap) => {
        setTasks(prev => {
          const others = prev.filter(t => t.organizationId == null) // keep legacy personal added by second listener
          const current = snap.docs.map(d => ({ id: d.id, ...d.data() }))
          return [...others, ...current]
        })
        setLoading(false)
      },
      (err) => { console.error('useTasks org snapshot error', err); setError(err); setLoading(false) }
    ))

    // Legacy personal tasks without organizationId created by this user
    unsubs.push(onSnapshot(
      query(base, where('organizationId', '==', null), where('createdBy', '==', user.uid)),
      (snap) => {
        setTasks(prev => {
          const nonLegacy = prev.filter(t => t.organizationId !== null)
          const legacy = snap.docs.map(d => ({ id: d.id, ...d.data() }))
          return [...nonLegacy, ...legacy]
        })
        setLoading(false)
      },
      (err) => { console.error('useTasks legacy snapshot error', err); setError(err); setLoading(false) }
    ))

    return () => unsubs.forEach(u => u && u())
  }, [user?.orgId, user?.uid])

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
