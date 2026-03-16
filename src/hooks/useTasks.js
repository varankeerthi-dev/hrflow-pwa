import { useState, useEffect, useCallback } from 'react'
import { getDocs, query, where, addDoc, updateDoc, deleteDoc, serverTimestamp, orderBy, onSnapshot } from 'firebase/firestore'
import { tasksCol, taskDoc } from '../lib/firestore'
import { useAuth } from './useAuth'

export function useTasks(orgId) {
  const { user } = useAuth()
  const [tasks, setTasks] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    if (!orgId) {
      setTasks([])
      setLoading(false)
      return
    }

    setLoading(true)
    // Real-time listener for tasks
    const q = query(tasksCol(orgId), orderBy('createdAt', 'desc'))
    
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const allTasks = snapshot.docs.map(d => ({ id: d.id, ...d.data() }))
      
      // Filter tasks based on visibility
      // Team tasks: visible to all in org
      // Personal tasks: visible only to creator
      // Idea tasks: following same logic or as requested
      const filteredTasks = allTasks.filter(task => {
        if (task.isPersonal) {
          return task.createdBy === user?.uid
        }
        return true // Team tasks are visible to everyone in the org
      })
      
      setTasks(filteredTasks)
      setLoading(false)
    }, (err) => {
      console.error("Tasks subscription error:", err)
      setError(err.message)
      setLoading(false)
    })

    return () => unsubscribe()
  }, [orgId, user?.uid])

  const addTask = async (taskData) => {
  if (!orgId || !user) return
  try {
    const payload = {
      ...taskData,
      // Handle both string and array for assignedTo
      assignedTo: Array.isArray(taskData.assignedTo) 
        ? taskData.assignedTo 
        : (taskData.assignedTo ? [taskData.assignedTo] : []),
      orgId,
      createdBy: user.uid,
      createdByName: user.name || 'Anonymous',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      status: taskData.status || 'Inbox',
      order: taskData.order || 0,
      // NEW FIELDS
      dueDate: taskData.dueDate || null,
      completedAt: null,
      priority: taskData.priority || 'normal',
      notes: taskData.notes || ''
    }
    const docRef = await addDoc(tasksCol(orgId), payload)
    return docRef.id
  } catch (e) {
    console.error("Error adding task:", e)
    throw e
  }
}

  const updateTask = async (taskId, updates) => {
  if (!orgId) return
  try {
    const payload = { ...updates, updatedAt: serverTimestamp() }
        // Auto-set completedAt when status becomes "Completed"
    if (updates.status === 'Completed' && !updates.completedAt) {
      payload.completedAt = serverTimestamp()
    }
        // Clear completedAt when reopening task
    if (updates.status && updates.status !== 'Completed') {
      payload.completedAt = null
    }
        await updateDoc(taskDoc(orgId, taskId), {
      ...payload,
      updatedAt: serverTimestamp()
    })
  } catch (e) {
    console.error("Error updating task:", e)
    throw e
  }
}

  const deleteTask = async (taskId) => {
    if (!orgId) return
    try {
      await deleteDoc(taskDoc(orgId, taskId))
    } catch (e) {
      console.error("Error deleting task:", e)
      throw e
    }
  }

  return { tasks, loading, error, addTask, updateTask, deleteTask }
}
