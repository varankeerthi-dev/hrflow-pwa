import { useCallback, useEffect, useMemo, useState } from 'react'
import { collection, doc, getDocs, serverTimestamp, writeBatch } from 'firebase/firestore'
import { db } from '../lib/firebase'
import { employeesCol, employeeDoc } from '../lib/firestore'
import { createLifecycleChecklist, getChecklistProgress, validateExitDate, validateOnboardingEmployee } from '../lib/employeeLifecycle'

const lifecycleCollection = (orgId) => collection(db, 'organisations', orgId, 'employee_lifecycle')
const lifecycleDocument = (orgId, id) => doc(db, 'organisations', orgId, 'employee_lifecycle', id)
const auditCollection = (orgId) => collection(db, 'organisations', orgId, 'audit_logs')
const isAdmin = (user) => user?.role?.toLowerCase() === 'admin'

export function useEmployeeLifecycle(user, employees = []) {
  const [records, setRecords] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const orgId = user?.orgId
  const permissions = useMemo(() => user?.permissions?.Employees || {}, [user?.permissions?.Employees])
  const canView = useMemo(() => Boolean(user && (isAdmin(user) || permissions.view || permissions.create || permissions.edit || permissions.full)), [user, permissions])
  const canManage = useMemo(() => Boolean(user && (isAdmin(user) || permissions.create || permissions.edit || permissions.full)), [user, permissions])

  const fetchRecords = useCallback(async () => {
    if (!orgId || !canView) {
      setRecords([])
      setLoading(false)
      return
    }
    setLoading(true)
    setError('')
    try {
      const snapshot = await getDocs(lifecycleCollection(orgId))
      const next = snapshot.docs.map((item) => ({ id: item.id, ...item.data() }))
      next.sort((a, b) => {
        const aDate = a.createdAt?.toMillis?.() || new Date(a.createdAt || 0).getTime() || 0
        const bDate = b.createdAt?.toMillis?.() || new Date(b.createdAt || 0).getTime() || 0
        return bDate - aDate
      })
      setRecords(next)
    } catch (fetchError) {
      setError(fetchError.message || 'Could not load lifecycle records.')
    } finally {
      setLoading(false)
    }
  }, [orgId, canView])

  useEffect(() => { fetchRecords() }, [fetchRecords])

  const ensureCanManage = () => {
    if (!orgId || !user || !canManage) throw new Error('You do not have permission to manage employee lifecycle records.')
  }

  const makeAudit = (batch, action, details) => {
    batch.set(doc(auditCollection(orgId)), {
      module: 'Employee Lifecycle',
      action,
      details,
      performedBy: user?.name || user?.email || 'Unknown user',
      performedById: user?.uid || null,
      timestamp: serverTimestamp(),
    })
  }

  const startOnboarding = async (candidate) => {
    ensureCanManage()
    if (candidate?.status !== 'Hired') throw new Error('Only a candidate marked Hired can enter onboarding.')
    if (!candidate?.name?.trim()) throw new Error('The hired candidate needs a name before onboarding can start.')
    if (records.some((item) => item.type === 'onboarding' && item.sourceCandidateId === candidate.id)) {
      throw new Error('Onboarding has already been started for this candidate.')
    }
    setSaving(true)
    setError('')
    try {
      const batch = writeBatch(db)
      const recordRef = doc(lifecycleCollection(orgId))
      batch.set(recordRef, {
        type: 'onboarding',
        status: 'In progress',
        sourceCandidateId: candidate.id,
        candidateName: candidate.name.trim(),
        candidateEmail: candidate.email || '',
        candidatePhone: candidate.phone || '',
        jobId: candidate.jobId || '',
        checklist: createLifecycleChecklist('onboarding'),
        createdBy: user?.name || user?.email || 'Unknown user',
        createdById: user?.uid || null,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      })
      makeAudit(batch, 'CREATE', `Started onboarding for hired candidate ${candidate.name.trim()}`)
      await batch.commit()
      await fetchRecords()
      return recordRef.id
    } catch (actionError) {
      setError(actionError.message || 'Could not start onboarding.')
      throw actionError
    } finally {
      setSaving(false)
    }
  }

  const startOffboarding = async (employee, details) => {
    ensureCanManage()
    if (!employee?.id || !employee?.name) throw new Error('Select a valid employee to start offboarding.')
    if ((employee.status || 'Active').toLowerCase() === 'inactive') throw new Error('This employee is already inactive.')
    if (records.some((item) => item.type === 'offboarding' && item.employeeId === employee.id && item.status !== 'Completed')) {
      throw new Error('An offboarding workflow is already in progress for this employee.')
    }
    const dateError = validateExitDate(details?.lastWorkingDate)
    if (dateError && !dateError.startsWith('Complete offboarding')) throw new Error(dateError)
    setSaving(true)
    setError('')
    try {
      const batch = writeBatch(db)
      const recordRef = doc(lifecycleCollection(orgId))
      batch.set(recordRef, {
        type: 'offboarding',
        status: 'In progress',
        employeeId: employee.id,
        employeeName: employee.name,
        employeeCode: employee.empCode || '',
        designation: employee.designation || '',
        department: employee.department || '',
        lastWorkingDate: details.lastWorkingDate,
        reason: details.reason || 'Other',
        checklist: createLifecycleChecklist('offboarding'),
        createdBy: user?.name || user?.email || 'Unknown user',
        createdById: user?.uid || null,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      })
      makeAudit(batch, 'CREATE', `Started offboarding for ${employee.name}; last working date ${details.lastWorkingDate}`)
      await batch.commit()
      await fetchRecords()
      return recordRef.id
    } catch (actionError) {
      setError(actionError.message || 'Could not start offboarding.')
      throw actionError
    } finally {
      setSaving(false)
    }
  }

  const updateChecklistItem = async (recordId, itemId, completed) => {
    ensureCanManage()
    const record = records.find((item) => item.id === recordId)
    if (!record || record.status === 'Completed') throw new Error('This workflow is unavailable or already complete.')
    const target = record.checklist?.find((item) => item.id === itemId)
    if (!target) throw new Error('Checklist item not found.')
    const checklist = record.checklist.map((item) => item.id === itemId ? {
      ...item,
      completed: Boolean(completed),
      completedAt: completed ? new Date().toISOString() : null,
      completedBy: completed ? (user?.name || user?.email || 'Unknown user') : null,
    } : item)
    setSaving(true)
    setError('')
    try {
      const batch = writeBatch(db)
      batch.update(lifecycleDocument(orgId, recordId), { checklist, updatedAt: serverTimestamp() })
      makeAudit(batch, completed ? 'UPDATE' : 'UPDATE', `${completed ? 'Completed' : 'Reopened'} lifecycle step “${target.title}” for ${record.candidateName || record.employeeName}`)
      await batch.commit()
      await fetchRecords()
    } catch (actionError) {
      setError(actionError.message || 'Could not update checklist item.')
      throw actionError
    } finally {
      setSaving(false)
    }
  }

  const completeOnboarding = async (recordId, details, refreshEmployees) => {
    ensureCanManage()
    const record = records.find((item) => item.id === recordId && item.type === 'onboarding')
    if (!record || record.status === 'Completed') throw new Error('This onboarding record is unavailable or already complete.')
    if (!getChecklistProgress(record.checklist).isComplete) throw new Error('Complete every onboarding step before creating the employee record.')
    const validationErrors = validateOnboardingEmployee({ ...details, name: record.candidateName })
    if (Object.keys(validationErrors).length) throw new Error(Object.values(validationErrors)[0])
    const empCode = String(details.empCode || '').trim()
    if (empCode && employees.some((employee) => String(employee.empCode || '').toLowerCase() === empCode.toLowerCase())) {
      throw new Error('That employee code is already in use. Choose a unique code or leave it blank.')
    }
    setSaving(true)
    setError('')
    try {
      const batch = writeBatch(db)
      const employeeRef = doc(employeesCol(orgId))
      const employeeData = {
        name: record.candidateName.trim(),
        empCode,
        joinedDate: details.joinedDate,
        employmentType: details.employmentType || 'Full-time',
        designation: String(details.designation || '').trim(),
        department: String(details.department || '').trim(),
        personalEmail: String(details.personalEmail || record.candidateEmail || '').trim(),
        workEmail: String(details.workEmail || '').trim(),
        email: String(details.workEmail || record.candidateEmail || '').trim(),
        contactNo: String(details.phone || record.candidatePhone || '').trim(),
        mobileNo: String(details.phone || record.candidatePhone || '').trim(),
        status: 'Active',
        sourceCandidateId: record.sourceCandidateId || '',
        createdBy: user?.name || user?.email || 'Unknown user',
        createdById: user?.uid || null,
        createdAt: serverTimestamp(),
      }
      batch.set(employeeRef, employeeData)
      batch.update(lifecycleDocument(orgId, recordId), {
        status: 'Completed',
        employeeId: employeeRef.id,
        completedAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        updatedBy: user?.name || user?.email || 'Unknown user',
      })
      makeAudit(batch, 'CREATE', `Created employee record for ${record.candidateName} from completed onboarding`)
      await batch.commit()
      await Promise.all([fetchRecords(), refreshEmployees?.()])
      return employeeRef.id
    } catch (actionError) {
      setError(actionError.message || 'Could not complete onboarding.')
      throw actionError
    } finally {
      setSaving(false)
    }
  }

  const completeOffboarding = async (recordId) => {
    ensureCanManage()
    const record = records.find((item) => item.id === recordId && item.type === 'offboarding')
    if (!record || record.status === 'Completed') throw new Error('This offboarding record is unavailable or already complete.')
    if (!getChecklistProgress(record.checklist).isComplete) throw new Error('Complete every exit checklist item before finishing offboarding.')
    const dateError = validateExitDate(record.lastWorkingDate)
    if (dateError) throw new Error(dateError)
    setSaving(true)
    setError('')
    try {
      const batch = writeBatch(db)
      batch.update(employeeDoc(orgId, record.employeeId), {
        status: 'Inactive',
        inactiveFrom: record.lastWorkingDate,
        updatedAt: serverTimestamp(),
      })
      batch.update(lifecycleDocument(orgId, recordId), {
        status: 'Completed',
        completedAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        updatedBy: user?.name || user?.email || 'Unknown user',
      })
      makeAudit(batch, 'UPDATE', `Completed offboarding for ${record.employeeName}; employee marked inactive effective ${record.lastWorkingDate}`)
      await batch.commit()
      await fetchRecords()
    } catch (actionError) {
      setError(actionError.message || 'Could not complete offboarding.')
      throw actionError
    } finally {
      setSaving(false)
    }
  }

  return { records, loading, error, saving, canView, canManage, fetchRecords, startOnboarding, startOffboarding, updateChecklistItem, completeOnboarding, completeOffboarding }
}
