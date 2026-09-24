import { useEffect, useRef, useState, useCallback } from 'react'
import { collection, onSnapshot, query, orderBy, limit } from 'firebase/firestore'
import { db } from '../lib/firebase'
import {
  isNotificationSupported,
  getNotificationPermission,
  requestNotificationPermission,
  sendPushNotification,
  isPWAInstalled
} from '../lib/pushNotifications'

export function useTaskNotifications(user, currentEmployee) {
  const [permission, setPermission] = useState(() => getNotificationPermission())
  const isPWA = isPWAInstalled()
  const isInitializedRef = useRef(false)
  const knownTaskIdsRef = useRef(new Set())
  const previousAssignedTaskIdsRef = useRef(new Set())

  // Keep permission state updated
  useEffect(() => {
    setPermission(getNotificationPermission())
  }, [])

  const handleRequestPermission = useCallback(async () => {
    const res = await requestNotificationPermission()
    setPermission(res)
    return res
  }, [])

  const sendTestNotification = useCallback(async () => {
    let perm = getNotificationPermission()
    if (perm !== 'granted') {
      perm = await handleRequestPermission()
    }
    if (perm === 'granted') {
      await sendPushNotification({
        title: '📋 Task Notification Active!',
        body: 'Push notifications are active for task assignments and team tasks.',
        tag: 'test-notification',
        url: '/mobile?tab=tasks'
      })
      return true
    }
    return false
  }, [handleRequestPermission])

  // Real-time listener for tasks in the organisation
  useEffect(() => {
    if (!user?.orgId || !user?.uid) return

    // Query recent tasks to detect additions and modifications
    const q = query(
      collection(db, 'organisations', user.orgId, 'tasks'),
      orderBy('createdAt', 'desc'),
      limit(50)
    )

    const unsubscribe = onSnapshot(q, (snapshot) => {
      // 1. Initial snapshot load - register existing tasks without sending alerts
      if (!isInitializedRef.current) {
        snapshot.docs.forEach((doc) => {
          knownTaskIdsRef.current.add(doc.id)
          const data = doc.data()
          const assignedList = Array.isArray(data.assignedTo)
            ? data.assignedTo
            : (data.assignedTo ? [data.assignedTo] : [])

          const isAssigned = (
            assignedList.includes(user.uid) ||
            (currentEmployee?.id && assignedList.includes(currentEmployee.id)) ||
            (user.email && assignedList.map(a => String(a).toLowerCase()).includes(user.email.toLowerCase())) ||
            (currentEmployee?.name && assignedList.includes(currentEmployee.name)) ||
            (user.name && assignedList.includes(user.name))
          )
          if (isAssigned) {
            previousAssignedTaskIdsRef.current.add(doc.id)
          }
        })
        isInitializedRef.current = true
        return
      }

      // 2. Real-time document changes
      snapshot.docChanges().forEach((change) => {
        const task = { id: change.doc.id, ...change.doc.data() }

        // Ignore changes triggered by the current user
        if (task.createdBy === user.uid) {
          knownTaskIdsRef.current.add(task.id)
          return
        }

        const assignedList = Array.isArray(task.assignedTo)
          ? task.assignedTo
          : (task.assignedTo ? [task.assignedTo] : [])

        const isAssignedToMe = (
          assignedList.includes(user.uid) ||
          (currentEmployee?.id && assignedList.includes(currentEmployee.id)) ||
          (user.email && assignedList.map(a => String(a).toLowerCase()).includes(user.email.toLowerCase())) ||
          (currentEmployee?.name && assignedList.includes(currentEmployee.name)) ||
          (user.name && assignedList.includes(user.name))
        )

        if (change.type === 'added') {
          if (!knownTaskIdsRef.current.has(task.id)) {
            knownTaskIdsRef.current.add(task.id)

            if (isAssignedToMe) {
              // Task is assigned to you
              sendPushNotification({
                title: '📋 Task Assigned to You',
                body: `${task.createdByName || 'A team member'} assigned you: "${task.title || 'Untitled Task'}"`,
                tag: `task-assigned-${task.id}`,
                url: '/mobile?tab=tasks',
                data: { taskId: task.id, type: 'assigned' }
              })
            } else if (!task.isPersonal) {
              // Team task created by others
              sendPushNotification({
                title: '👥 New Team Task',
                body: `${task.createdByName || 'A team member'} created: "${task.title || 'Untitled Task'}"`,
                tag: `task-team-${task.id}`,
                url: '/mobile?tab=tasks',
                data: { taskId: task.id, type: 'team_created' }
              })
            }
          }
        } else if (change.type === 'modified') {
          // Check if previously not assigned to me, but now newly assigned to me
          const wasAssignedBefore = previousAssignedTaskIdsRef.current.has(task.id)
          if (!wasAssignedBefore && isAssignedToMe) {
            sendPushNotification({
              title: '📋 Task Assigned to You',
              body: `${task.createdByName || 'A team member'} assigned you: "${task.title || 'Untitled Task'}"`,
              tag: `task-assigned-${task.id}`,
              url: '/mobile?tab=tasks',
              data: { taskId: task.id, type: 'assigned' }
            })
          }
        }

        // Update assigned tracking set
        if (isAssignedToMe) {
          previousAssignedTaskIdsRef.current.add(task.id)
        } else {
          previousAssignedTaskIdsRef.current.delete(task.id)
        }
      })
    }, (error) => {
      console.warn('Task notification subscription error:', error)
    })

    return () => unsubscribe()
  }, [user?.orgId, user?.uid, user?.email, user?.name, currentEmployee?.id, currentEmployee?.name])

  return {
    permission,
    isPWA,
    isSupported: isNotificationSupported(),
    requestPermission: handleRequestPermission,
    sendTestNotification
  }
}
