import { useState, useEffect } from 'react'
import { getDocs, query, where, addDoc, updateDoc, deleteDoc, serverTimestamp, orderBy, onSnapshot, arrayUnion } from 'firebase/firestore'
import { collection, doc } from 'firebase/firestore'
import { db } from '../lib/firebase'
import { useAuth } from './useAuth'

export function useReminders(orgId) {
  const { user } = useAuth()
  const [reminders, setReminders] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    if (!orgId || !user) {
      setReminders([])
      setLoading(false)
      return
    }

    setLoading(true)
    
    // Real-time listener for reminders
    const remindersCol = collection(db, 'reminders')
    const q = query(
      remindersCol,
      where('organizationId', '==', orgId),
      where('isActive', '==', true),
      orderBy('createdAt', 'desc')
    )

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const allReminders = snapshot.docs.map(d => ({ id: d.id, ...d.data() }))
      
      // Filter reminders user can see
      const visibleReminders = allReminders.filter(reminder => {
        // General reminders: everyone sees
        if (reminder.type === 'general') return true
        
        // Targeted reminders: only if user is in targetUsers
        if (reminder.type === 'targeted') {
          return reminder.targetUsers && reminder.targetUsers.includes(user.uid)
        }
        
        // Task-linked reminders: if user is target or creator
        if (reminder.type === 'task_linked') {
          return (reminder.targetUsers && reminder.targetUsers.includes(user.uid)) || 
                 reminder.createdBy === user.uid
        }
        
        return false
      })

      setReminders(visibleReminders)
      setLoading(false)
    }, (err) => {
      console.error("Reminders subscription error:", err)
      setError(err.message)
      setLoading(false)
    })

    return () => unsubscribe()
  }, [orgId, user?.uid])

  const addReminder = async (reminderData) => {
    if (!orgId || !user) return
    try {
      const remindersCol = collection(db, 'reminders')
      const payload = {
        ...reminderData,
        organizationId: orgId,
        createdBy: user.uid,
        createdByName: user.name || 'Anonymous',
        createdAt: serverTimestamp(),
        dismissedBy: [],
        isActive: true
      }
      const docRef = await addDoc(remindersCol, payload)
      return docRef.id
    } catch (e) {
      console.error("Error adding reminder:", e)
      throw e
    }
  }

  const dismissReminder = async (reminderId) => {
    if (!orgId || !user) return
    try {
      const reminderDoc = doc(db, 'reminders', reminderId)
      await updateDoc(reminderDoc, {
        dismissedBy: arrayUnion(user.uid)
      })

      // Check if all targets have dismissed
      const reminder = reminders.find(r => r.id === reminderId)
      if (reminder) {
        const allTargets = reminder.type === 'general' 
          ? [] // General has no specific targets
          : reminder.targetUsers || []

        const dismissedCount = (reminder.dismissedBy || []).length + 1 // +1 for current user

        // Archive if all targets dismissed (or if general and creator dismissed)
        if (reminder.type === 'general' && reminder.createdBy === user.uid) {
          await updateDoc(reminderDoc, { isActive: false })
        } else if (allTargets.length > 0 && dismissedCount >= allTargets.length) {
          await updateDoc(reminderDoc, { isActive: false })
        }
      }
    } catch (e) {
      console.error("Error dismissing reminder:", e)
      throw e
    }
  }

  const deleteReminder = async (reminderId) => {
    if (!orgId) return
    try {
      const reminderDoc = doc(db, 'reminders', reminderId)
      await deleteDoc(reminderDoc)
    } catch (e) {
      console.error("Error deleting reminder:", e)
      throw e
    }
  }

  return { reminders, loading, error, addReminder, dismissReminder, deleteReminder }
}
