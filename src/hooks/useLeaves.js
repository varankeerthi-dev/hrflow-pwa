import { useState, useCallback } from 'react'
import { db } from '../lib/firebase'
import { collection, addDoc, query, where, getDocs, serverTimestamp, orderBy, updateDoc, doc, getDoc } from 'firebase/firestore'
import { useAuth } from './useAuth'

export function useLeaves(orgId) {
  const { user } = useAuth()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  const calculateDuration = (startDate, endDate) => {
    if (!startDate) return 0
    const start = new Date(startDate)
    const end = endDate ? new Date(endDate) : start
    const diffTime = Math.abs(end - start)
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1
    return diffDays
  }

  const fetchLeaves = useCallback(async (employeeId = null) => {
    if (!orgId) return []
    setLoading(true)
    try {
      let q = query(
        collection(db, 'organisations', orgId, 'requests'),
        where('type', '==', 'Leave'),
        orderBy('createdAt', 'desc')
      )
      
      if (employeeId) {
        q = query(
          collection(db, 'organisations', orgId, 'requests'),
          where('type', '==', 'Leave'),
          where('employeeId', '==', employeeId),
          orderBy('createdAt', 'desc')
        )
      }

      const snap = await getDocs(q)
      return snap.docs.map(d => ({ id: d.id, ...d.data() }))
    } catch (err) {
      console.error('Error fetching leaves:', err)
      setError(err.message)
      return []
    } finally {
      setLoading(false)
    }
  }, [orgId])

  const applyLeave = async (leaveData) => {
    if (!orgId || !user) return
    setLoading(true)
    try {
      const duration = calculateDuration(leaveData.fromDate, leaveData.toDate)
      const payload = {
        ...leaveData,
        type: 'Leave',
        duration,
        status: 'Pending',
        hrApproval: 'Pending',
        mdApproval: 'Pending',
        createdAt: serverTimestamp(),
        createdBy: user.uid,
        updatedAt: serverTimestamp()
      }
      const docRef = await addDoc(collection(db, 'organisations', orgId, 'requests'), payload)
      return docRef.id
    } catch (err) {
      console.error('Error applying leave:', err)
      setError(err.message)
      throw err
    } finally {
      setLoading(false)
    }
  }

  const updateLeaveStatus = async (requestId, status, remarks = '') => {
    if (!orgId || !user) return
    setLoading(true)
    try {
      const isHR = user.role?.toLowerCase() === 'hr' || user.role?.toLowerCase() === 'admin'
      const isMD = user.role?.toLowerCase() === 'md' || user.role?.toLowerCase() === 'admin'

      const updateData = {
        updatedAt: serverTimestamp(),
        updatedBy: user.uid
      }

      if (isHR) {
        updateData.hrApproval = status
        updateData.hrRemarks = remarks
        updateData.hrApprovedBy = user.uid
        updateData.hrApprovedAt = serverTimestamp()
      }

      if (isMD) {
        updateData.mdApproval = status
        updateData.mdRemarks = remarks
        updateData.mdApprovedBy = user.uid
        updateData.mdApprovedAt = serverTimestamp()
      }

      // If both approve, or if admin approves, the overall status becomes 'Approved'
      if (status === 'Approved') {
        // Simple logic for now: if admin or MD approves, it's final
        if (isMD || user.role?.toLowerCase() === 'admin') {
          updateData.status = 'Approved'
          
          // Deduct from leave balance if approved
          const requestRef = doc(db, 'organisations', orgId, 'requests', requestId)
          const requestSnap = await getDoc(requestRef)
          const requestData = requestSnap.data()
          
          if (requestData && requestData.employeeId && requestData.duration) {
            const empRef = doc(db, 'organisations', orgId, 'employees', requestData.employeeId)
            const empSnap = await getDoc(empRef)
            const empData = empSnap.data()
            
            if (empData) {
              const currentBalance = empData.leaveBalance || 0
              const newBalance = Math.max(0, currentBalance - requestData.duration)
              await updateDoc(empRef, { leaveBalance: newBalance })
            }
          }
        }
      } else if (status === 'Rejected') {
        updateData.status = 'Rejected'
      }

      await updateDoc(doc(db, 'organisations', orgId, 'requests', requestId), updateData)
    } catch (err) {
      console.error('Error updating leave status:', err)
      setError(err.message)
      throw err
    } finally {
      setLoading(false)
    }
  }

  return { loading, error, fetchLeaves, applyLeave, updateLeaveStatus, calculateDuration }
}
