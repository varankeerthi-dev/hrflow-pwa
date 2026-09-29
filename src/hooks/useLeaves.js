import { useState, useCallback } from 'react'
import { db } from '../lib/firebase'
import { collection, addDoc, query, where, getDocs, serverTimestamp, orderBy, updateDoc, doc, getDoc, deleteDoc, runTransaction } from 'firebase/firestore'
import { useAuth } from './useAuth'
import { isPeriodLocked } from '../lib/payrollLock'
import { buildLeaveCoverageCandidates, createApprovedLeaveCoverage, getLeavePolicy, rescindApprovedLeaveCoverage } from '../lib/leaveLifecycle'
import { calculateAccruedEntitlement, calculateLeaveBalance, getConfiguredLeaveTypes, isLeaveEntitlementConfigured, normalizeLeaveTypeCode } from '../lib/leaveEntitlements'

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

  const calculateDuration = useCallback((startDate, endDate) => {
    if (!startDate) return 0
    const start = new Date(startDate)
    const end = endDate ? new Date(endDate) : start
    return Math.ceil(Math.abs(end - start) / (1000 * 60 * 60 * 24)) + 1
  }, [])

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
      const leavePolicySnapshot = getLeavePolicy(orgData, leaveData.leaveType, leaveData.fromDate)
      const configuredLeaveTypes = getConfiguredLeaveTypes(orgData)
      const typeCode = normalizeLeaveTypeCode(leaveData.leaveType, configuredLeaveTypes)
      const hasConfiguredCatalog = Array.isArray(orgData.leaveTypes) && orgData.leaveTypes.length > 0
      const configuredType = configuredLeaveTypes.find((type) => type.code === typeCode)
      if (hasConfiguredCatalog && !configuredType) throw new Error('This leave type is disabled or is not configured by HR.')
      if (duration === 0.5 && !leavePolicySnapshot.allowHalfDay) {
        throw new Error(`${leaveData.leaveType || 'This'} leave policy does not allow half-day requests.`)
      }
      const currentMonth = String(leaveData.fromDate || '').slice(0, 7)
      const employeeRequests = await getDocs(query(collection(db, 'organisations', orgId, 'requests'), where('employeeId', '==', leaveData.employeeId)))
      const existingRequests = employeeRequests.docs.map((record) => ({ id: record.id, ...record.data() }))
      const repeatCount = existingRequests.filter((request) => {
        const requestMonth = String(request.fromDate || '').slice(0, 7)
        const requestTypeCode = normalizeLeaveTypeCode(request.leaveTypeCode || request.leaveType, configuredLeaveTypes)
        return request.type === 'Leave' && requestTypeCode === typeCode && requestMonth === currentMonth && !['Rejected', 'Cancelled'].includes(request.status)
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
      const requestedCoverageUnits = coveragePreview.reduce((sum, candidate) => sum + Number(candidate.leaveUnits || 0), 0)
      if (!coveragePreview.length || requestedCoverageUnits <= 0) throw new Error('The selected dates do not include any leave days under the configured date policy.')
      const requestedPaidUnits = coveragePreview.reduce((sum, candidate) => sum + (String(candidate.classification || '').includes('paid') ? Number(candidate.leaveUnits || 0) : 0), 0)
      const ledgerSnapshot = await getDocs(collection(db, 'organisations', orgId, 'employees', leaveData.employeeId, 'leave_ledger'))
      const ledgerEntries = ledgerSnapshot.docs
        .filter((entry) => !entry.id.startsWith('__balance__') && entry.data()?.isBalanceState !== true)
        .map((entry) => ({ id: entry.id, ...entry.data() }))
      const asOf = leaveData.fromDate || new Date().toISOString().slice(0, 10)
      const balance = calculateLeaveBalance({ orgData, leaveType: leaveData.leaveType, ledgerEntries, requests: existingRequests, asOf })
      const entitlementConfigured = isLeaveEntitlementConfigured(leavePolicySnapshot) || calculateAccruedEntitlement(orgData, leaveData.leaveType, asOf).units > 0
      const overuseMode = leavePolicySnapshot.overuseMode || 'block'
      const paidShortfall = entitlementConfigured ? Math.max(0, requestedPaidUnits - Number(balance.available || 0)) : 0
      if (entitlementConfigured && paidShortfall > 0 && overuseMode === 'block') {
        throw new Error(`Insufficient ${leaveData.leaveType} balance. Available: ${Math.max(0, Number(balance.available || 0)).toFixed(2)} units; requested: ${requestedPaidUnits.toFixed(2)} units.`)
      }
      const status = leaveData.status || 'Pending'
      const isApprovedAtCreation = status === 'Approved'
      const leavePolicyVersion = leavePolicySnapshot.policyVersion || orgData.leavePolicyVersion || 'v1'
      const payload = {
        ...leaveData,
        type: 'Leave',
        duration: requestedCoverageUnits,
        requestedUnits: requestedCoverageUnits,
        leaveTypeCode: typeCode,
        leavePolicyVersion,
        leavePolicySnapshot: { ...leavePolicySnapshot, leaveTypeCode: typeCode, policyVersion: leavePolicyVersion },
        leaveBalanceMode: entitlementConfigured ? 'per_type' : 'legacy_aggregate',
        leaveBalanceSnapshot: entitlementConfigured ? {
          asOf,
          policyVersion: leavePolicyVersion,
          entitlementUnits: balance.entitlement,
          accruedUnits: balance.accrued,
          openingUnits: balance.opening,
          usedUnits: balance.used,
          pendingUnits: balance.pending,
          availableBefore: balance.available,
          requestedUnits: requestedPaidUnits,
          unpaidShortfallUnits: overuseMode === 'unpaid_shortfall' ? paidShortfall : 0,
          overEntitlementUnits: overuseMode === 'allow_negative' ? paidShortfall : 0,
          overuseMode,
        } : null,
        coveragePreview: coveragePreview.map(({ date, leaveUnits, classification }) => ({ date, leaveUnits, classification })),
        policyWarnings,
        status: isApprovedAtCreation ? 'Pending' : status,
        coverageStatus: isApprovedAtCreation ? 'pending' : null,
        hrApproval: leaveData.hrApproval || 'Pending',
        deptHeadApproval: leaveData.deptHeadApproval || 'Pending',
        mdApproval: leaveData.mdApproval || 'Pending',
        createdAt: serverTimestamp(),
        createdBy: user.uid,
        updatedAt: serverTimestamp(),
      }
      const docRef = await addDoc(collection(db, 'organisations', orgId, 'requests'), payload)
      if (isApprovedAtCreation && payload.employeeId) {
        await createApprovedLeaveCoverage({
          orgId,
          requestId: docRef.id,
          actor: user,
          requestData: payload,
          requestUpdates: {
            status: 'Approved',
            hrApproval: 'Approved',
            deptHeadApproval: 'Approved',
            mdApproval: 'Approved',
            approvedBy: user.uid,
            approvedAt: serverTimestamp(),
          },
        })
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
      const isMultiStage = requestData.approvalType === 'multi' || Number(requestData.totalStages || 1) > 1
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

      const isFinalApproval = status === 'Approved' && (isMD || role === 'admin' || (isHR && !isMultiStage))
      if (isFinalApproval) {
        updateData.status = 'Approved'
        updateData.coverageStatus = 'pending'
      } else if (status === 'Rejected') {
        updateData.status = 'Rejected'
        updateData.coverageStatus = 'none'
      }

      if (updateData.status === 'Approved' && requestData.employeeId) {
        await createApprovedLeaveCoverage({
          orgId,
          requestId,
          actor: user,
          requestData: { ...requestData, ...updateData },
          requestUpdates: updateData,
        })
      } else {
        await updateDoc(requestRef, updateData)
        if (status === 'Rejected') {
          await addDoc(collection(db, 'organisations', orgId, 'audit_logs'), {
            module: 'Leave',
            action: 'Reject Leave',
            details: `Rejected ${requestData.leaveType || 'leave'} request.`,
            userName: user.name || user.email || 'HR',
            userId: user.uid,
            requestId,
            employeeId: requestData.employeeId || '',
            leaveTypeCode: requestData.leaveTypeCode || normalizeLeaveTypeCode(requestData.leaveType),
            reason: remarks,
            timestamp: serverTimestamp(),
          })
        }
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

  const recordOpeningBalance = async ({ employeeId, leaveType, quantity, effectiveDate, reason, idempotencyKey }) => {
    if (!orgId || !user) throw new Error('An authenticated organisation user is required.')
    if (!['admin', 'hr'].includes(String(user.role || '').toLowerCase())) throw new Error('Only HR or Admin can reconcile a type-specific opening balance.')
    const amount = Number(quantity)
    if (!employeeId || !leaveType || !Number.isFinite(amount) || amount <= 0) throw new Error('Enter an employee, leave type, and positive opening balance.')
    const parsedEffectiveDate = new Date(`${effectiveDate}T00:00:00Z`)
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(effectiveDate || '')) || Number.isNaN(parsedEffectiveDate.getTime()) || parsedEffectiveDate.toISOString().slice(0, 10) !== effectiveDate) throw new Error('Choose a valid effective date for the opening balance.')
    if (!String(reason || '').trim()) throw new Error('A reason is required for opening-balance reconciliation.')
    const orgSnap = await getDoc(doc(db, 'organisations', orgId))
    const orgData = orgSnap.exists() ? orgSnap.data() : {}
    if (!isLeaveEntitlementConfigured(getLeavePolicy(orgData, leaveType, effectiveDate))) throw new Error('Publish a monthly or annual entitlement for this leave type before recording an opening balance.')
    const code = normalizeLeaveTypeCode(leaveType)
    const reconciliationId = String(idempotencyKey || Date.now()).replace(/[^A-Za-z0-9_-]/g, '_').slice(0, 64)
    const eventKey = `opening:${employeeId}:${code}:${reconciliationId}`
    const entryId = eventKey.replaceAll(':', '_')
    const ledgerEntryRef = doc(db, 'organisations', orgId, 'employees', employeeId, 'leave_ledger', entryId)
    const stateRef = doc(db, 'organisations', orgId, 'employees', employeeId, 'leave_ledger', `__balance__${code}`)
    const auditRef = doc(db, 'organisations', orgId, 'audit_logs', `leave_opening_${entryId}`)
    await runTransaction(db, async (transaction) => {
      const [stateSnap, entrySnap] = await Promise.all([transaction.get(stateRef), transaction.get(ledgerEntryRef)])
      if (entrySnap.exists()) return
      const state = stateSnap.exists() ? stateSnap.data() : null
      transaction.set(ledgerEntryRef, {
        employeeId,
        leaveType,
        leaveTypeCode: code,
        quantity: amount,
        source: 'opening_balance',
        effectiveDate,
        reason: String(reason).trim(),
        idempotencyKey: eventKey,
        createdAt: serverTimestamp(),
        createdBy: user.uid,
        actorName: user.name || user.email || '',
      })
      transaction.set(stateRef, {
        isBalanceState: true,
        employeeId,
        leaveTypeCode: code,
        openingUnits: Number(state?.openingUnits || 0) + amount,
        usedUnits: Number(state?.usedUnits || 0),
        expiredUnits: Number(state?.expiredUnits || 0),
        lastUpdatedAt: serverTimestamp(),
        lastUpdatedBy: user.uid,
      }, { merge: true })
      transaction.set(auditRef, {
        module: 'Leave',
        action: 'Reconcile Opening Balance',
        details: `Recorded ${amount} opening unit(s) for ${leaveType}.`,
        userName: user.name || user.email || 'HR',
        userId: user.uid,
        employeeId,
        leaveTypeCode: code,
        effectiveDate,
        reason: String(reason).trim(),
        timestamp: serverTimestamp(),
      })
    })
    return true
  }

  return { loading, error, fetchLeaves, applyLeave, updateLeaveStatus, deleteLeave, cancelLeave, recordOpeningBalance, calculateDuration }
}
