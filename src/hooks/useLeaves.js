import { useState, useCallback } from 'react'
import { db } from '../lib/firebase'
import { collection, addDoc, query, where, getDocs, serverTimestamp, orderBy, updateDoc, doc, getDoc, deleteDoc } from 'firebase/firestore'
import { useAuth } from './useAuth'
import { isPeriodLocked } from '../lib/payrollLock'
import { buildLeaveCoverageCandidates, createApprovedLeaveCoverage, getLeavePolicy, rescindApprovedLeaveCoverage } from '../lib/leaveLifecycle'

const isLeaveRangeLocked = async (orgId, fromDate, toDate) => {
  if (!fromDate) return false
  const start = new Date(fromDate)
  const end = toDate ? new Date(toDate) : start
  let current = new Date(start.getFullYear(), start.getMonth(), 1)
  while (current <= end) {
    const monthStr = `${current.getFullYear()}-${String(current.getMonth() + 1).padStart(2, '0')}`
    if (await isPeriodLocked(orgId, monthStr)) return true
    current.setMonth(current.getMonth() + 1)
  }
  return false
}

export function useLeaves(orgId) {
  const { user } = useAuth()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  const calculateDuration = (startDate, endDate) => {
    if (!startDate) return 0
    const start = new Date(startDate)
    const end = endDate ? new Date(endDate) : start
    return Math.ceil(Math.abs(end - start) / (1000 * 60 * 60 * 24)) + 1
  }

  const fetchLeaves = useCallback(async (employeeId = null) => {
    if (!orgId) return []
    setLoading(true)
    try {
      const requestCollection = collection(db, 'organisations', orgId, 'requests')
      const q = employeeId
        ? query(requestCollection, where('type', '==', 'Leave'), where('employeeId', '==', employeeId), orderBy('createdAt', 'desc'))
        : query(requestCollection, where('type', '==', 'Leave'), orderBy('createdAt', 'desc'))
      const snap = await getDocs(q)
      return snap.docs.map((record) => ({ id: record.id, ...record.data() }))
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
    if (await isLeaveRangeLocked(orgId, leaveData.fromDate, leaveData.toDate)) {
      throw new Error('Cannot apply leave: The period contains locked payroll runs.')
    }
    setLoading(true)
    try {
      const duration = Number(leaveData.requestedUnits) || calculateDuration(leaveData.fromDate, leaveData.toDate)
      const orgSnap = await getDoc(doc(db, 'organisations', orgId))
      const orgData = orgSnap.exists() ? orgSnap.data() : {}
      const leavePolicySnapshot = getLeavePolicy(orgData, leaveData.leaveType)
      if (duration === 0.5 && !leavePolicySnapshot.allowHalfDay) {
        throw new Error(`${leaveData.leaveType || 'This'} leave policy does not allow half-day requests.`)
      }
      const currentMonth = String(leaveData.fromDate || '').slice(0, 7)
      const employeeRequests = await getDocs(query(collection(db, 'organisations', orgId, 'requests'), where('employeeId', '==', leaveData.employeeId)))
      const repeatCount = employeeRequests.docs.filter((record) => {
        const request = record.data()
        const requestMonth = String(request.fromDate || '').slice(0, 7)
        return request.type === 'Leave' && request.leaveType === leaveData.leaveType && requestMonth === currentMonth && !['Rejected', 'Cancelled'].includes(request.status)
      }).length
      const policyWarnings = []
      if (leavePolicySnapshot.monthlyRequestWarningThreshold > 0 && repeatCount >= leavePolicySnapshot.monthlyRequestWarningThreshold) {
        policyWarnings.push({
          type: 'monthly_repeat_threshold',
          message: `${leaveData.employeeName || 'Employee'} has already submitted ${repeatCount} ${leaveData.leaveType || 'leave'} request(s) this month.`,
          threshold: leavePolicySnapshot.monthlyRequestWarningThreshold,
          existingRequests: repeatCount,
        })
      }
      const coveragePreview = buildLeaveCoverageCandidates({ ...leaveData, requestedUnits: duration, orgData: { ...orgData, leavePolicies: { ...(orgData.leavePolicies || {}), [leaveData.leaveType]: leavePolicySnapshot } } })
      const status = leaveData.status || 'Pending'
      const isApprovedAtCreation = status === 'Approved'
      const payload = {
        ...leaveData,
        type: 'Leave',
        duration,
        requestedUnits: duration,
        leavePolicySnapshot,
        coveragePreview: coveragePreview.map(({ date, leaveUnits, classification }) => ({ date, leaveUnits, classification })),
        policyWarnings,
        status,
        coverageStatus: isApprovedAtCreation ? 'pending' : null,
        hrApproval: leaveData.hrApproval || (isApprovedAtCreation ? 'Approved' : 'Pending'),
        deptHeadApproval: leaveData.deptHeadApproval || (isApprovedAtCreation ? 'Approved' : 'Pending'),
        mdApproval: leaveData.mdApproval || (isApprovedAtCreation ? 'Approved' : 'Pending'),
        createdAt: serverTimestamp(),
        createdBy: user.uid,
        updatedAt: serverTimestamp(),
      }
      const docRef = await addDoc(collection(db, 'organisations', orgId, 'requests'), payload)
      if (isApprovedAtCreation && payload.employeeId) {
        await createApprovedLeaveCoverage({ orgId, requestId: docRef.id, actor: user, requestData: payload })
      }
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
      const requestRef = doc(db, 'organisations', orgId, 'requests', requestId)
      const requestSnap = await getDoc(requestRef)
      if (!requestSnap.exists()) throw new Error('Leave request was not found.')
      const requestData = requestSnap.data()
      if (await isLeaveRangeLocked(orgId, requestData.fromDate, requestData.toDate)) {
        throw new Error('Cannot update leave request: The period contains locked payroll runs.')
      }

      const role = user.role?.toLowerCase()
      const isHR = role === 'hr' || role === 'admin'
      const isMD = role === 'md' || role === 'admin'
      const isDeptHead = user.uid === requestData.deptHeadId
      const updateData = { updatedAt: serverTimestamp(), updatedBy: user.uid }

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
        if (nextApproverId) updateData.deptHeadId = nextApproverId
      }
      if (isMD) {
        updateData.mdApproval = status
        updateData.mdRemarks = remarks
        updateData.mdApprovedBy = user.uid
        updateData.mdApprovedAt = serverTimestamp()
      }

      if (status === 'Approved' && (isMD || role === 'admin')) {
        updateData.status = 'Approved'
        updateData.coverageStatus = 'pending'
      } else if (status === 'Rejected') {
        updateData.status = 'Rejected'
        updateData.coverageStatus = 'none'
      }

      await updateDoc(requestRef, updateData)
      if (updateData.status === 'Approved' && requestData.employeeId) {
        await createApprovedLeaveCoverage({
          orgId,
          requestId,
          actor: user,
          requestData: { ...requestData, ...updateData },
        })
      }
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
      if (!requestSnap.exists()) throw new Error('Leave request was not found.')
      const requestData = requestSnap.data()
      if (await isLeaveRangeLocked(orgId, requestData.fromDate, requestData.toDate)) {
        throw new Error('Cannot delete leave request: The period contains locked payroll runs.')
      }
      const canDelete = user.uid === requestData.createdBy || ['admin', 'hr'].includes(user.role?.toLowerCase())
      if (!canDelete) throw new Error('You do not have permission to delete this leave request')
      if (requestData.status === 'Approved' && requestData.employeeId) {
        await rescindApprovedLeaveCoverage({ orgId, requestId, actor: user, requestData, reason: 'leave_deleted' })
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
      if (!requestSnap.exists()) throw new Error('Leave request was not found.')
      const requestData = requestSnap.data()
      if (await isLeaveRangeLocked(orgId, requestData.fromDate, requestData.toDate)) {
        throw new Error('Cannot cancel leave request: The period contains locked payroll runs.')
      }
      const canCancel = user.uid === requestData.createdBy || ['admin', 'hr'].includes(user.role?.toLowerCase())
      if (!canCancel) throw new Error('You do not have permission to cancel this leave request')
      if (requestData.status === 'Approved' && requestData.employeeId) {
        await rescindApprovedLeaveCoverage({ orgId, requestId, actor: user, requestData, reason: 'leave_cancelled' })
      }
      await updateDoc(requestRef, {
        status: 'Cancelled',
        coverageStatus: 'rescinded',
        cancelledAt: serverTimestamp(),
        cancelledBy: user.uid,
        updatedAt: serverTimestamp(),
        updatedBy: user.uid,
      })
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
