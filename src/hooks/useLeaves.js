import { useState, useCallback } from 'react'
import { db } from '../lib/firebase'
import { collection, addDoc, query, where, getDocs, serverTimestamp, orderBy, updateDoc, doc, getDoc, deleteDoc } from 'firebase/firestore'
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
        deptHeadApproval: 'Pending',
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

  const updateLeaveStatus = async (requestId, status, remarks = '', nextApproverId = null) => {
    if (!orgId || !user) return
    setLoading(true)
    try {
      const role = user.role?.toLowerCase()
      const isHR = role === 'hr' || role === 'admin'
      const isMD = role === 'md' || role === 'admin'
      
      const requestRef = doc(db, 'organisations', orgId, 'requests', requestId)
      const requestSnap = await getDoc(requestRef)
      const requestData = requestSnap.data()
      
      const isDeptHead = user.uid === requestData.deptHeadId

      const updateData = {
        updatedAt: serverTimestamp(),
        updatedBy: user.uid
      }

      if (isDeptHead) {
        updateData.deptHeadApproval = status
        updateData.deptHeadRemarks = remarks
        updateData.deptHeadApprovedBy = user.uid
        updateData.deptHeadApprovedAt = serverTimestamp()
      }

      if (isHR) {
        updateData.hrApproval = status
        updateData.hrRemarks = remarks
        updateData.hrApprovedBy = user.uid
        updateData.hrApprovedAt = serverTimestamp()
        if (nextApproverId) {
          updateData.deptHeadId = nextApproverId
        }
      }

      if (isMD) {
        updateData.mdApproval = status
        updateData.mdRemarks = remarks
        updateData.mdApprovedBy = user.uid
        updateData.mdApprovedAt = serverTimestamp()
      }

      // Logic: HR approves and assigns Dept Head OR MD approves finally
      if (status === 'Approved') {
        if (isMD || role === 'admin') {
          updateData.status = 'Approved'
          
          // Deduct from leave balance if fully approved
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

      await updateDoc(requestRef, updateData)
    } catch (err) {
      console.error('Error updating leave status:', err)
      setError(err.message)
      throw err
    } finally {
      setLoading(false)
    }
  }

  const deleteLeave = async (requestId) => {
    if (!orgId || !user) return
    setLoading(true)
    try {
      const requestRef = doc(db, 'organisations', orgId, 'requests', requestId)
      const requestSnap = await getDoc(requestRef)
      const requestData = requestSnap.data()
      
      // Check permissions - only creator, admin, or HR can delete
      const canDelete = 
        user.uid === requestData.createdBy || 
        user.role?.toLowerCase() === 'admin' || 
        user.role?.toLowerCase() === 'hr'
      
      if (!canDelete) {
        throw new Error('You do not have permission to delete this leave request')
      }

      // If leave was approved, restore the leave balance
      if (requestData.status === 'Approved' && requestData.employeeId && requestData.duration) {
        const empRef = doc(db, 'organisations', orgId, 'employees', requestData.employeeId)
        const empSnap = await getDoc(empRef)
        const empData = empSnap.data()
        
        if (empData) {
          const currentBalance = empData.leaveBalance || 0
          const newBalance = currentBalance + requestData.duration
          await updateDoc(empRef, { leaveBalance: newBalance })
        }
      }

      await deleteDoc(requestRef)
      return true
    } catch (err) {
      console.error('Error deleting leave:', err)
      setError(err.message)
      throw err
    } finally {
      setLoading(false)
    }
  }

  const cancelLeave = async (requestId) => {
    if (!orgId || !user) return
    setLoading(true)
    try {
      const requestRef = doc(db, 'organisations', orgId, 'requests', requestId)
      const requestSnap = await getDoc(requestRef)
      const requestData = requestSnap.data()
      
      // Check permissions - only creator, admin, or HR can cancel
      const canCancel = 
        user.uid === requestData.createdBy || 
        user.role?.toLowerCase() === 'admin' || 
        user.role?.toLowerCase() === 'hr'
      
      if (!canCancel) {
        throw new Error('You do not have permission to cancel this leave request')
      }

      const updateData = {
        status: 'Cancelled',
        cancelledAt: serverTimestamp(),
        cancelledBy: user.uid,
        updatedAt: serverTimestamp(),
        updatedBy: user.uid
      }

      // If leave was approved, restore the leave balance
      if (requestData.status === 'Approved' && requestData.employeeId && requestData.duration) {
        const empRef = doc(db, 'organisations', orgId, 'employees', requestData.employeeId)
        const empSnap = await getDoc(empRef)
        const empData = empSnap.data()
        
        if (empData) {
          const currentBalance = empData.leaveBalance || 0
          const newBalance = currentBalance + requestData.duration
          await updateDoc(empRef, { leaveBalance: newBalance })
        }
      }

      await updateDoc(requestRef, updateData)
      return true
    } catch (err) {
      console.error('Error cancelling leave:', err)
      setError(err.message)
      throw err
    } finally {
      setLoading(false)
    }
  }

  return { loading, error, fetchLeaves, applyLeave, updateLeaveStatus, deleteLeave, cancelLeave, calculateDuration }
}
