import { useState, useEffect, useMemo, useCallback } from 'react'
import { collection, doc, getDocs, orderBy, query, serverTimestamp, writeBatch } from 'firebase/firestore'
import { db } from '../lib/firebase'
import { jobsCol, jobDoc, applicantsCol, applicantDoc } from '../lib/firestore'

const recruitmentPermissions = (user) => user?.permissions?.Recruitment || {}
const isAdminUser = (user) => user?.role?.toLowerCase() === 'admin'
const ownsRecord = (record, user) => Boolean(user && (
  record?.createdBy === user.name || record?.createdById === user.uid
))

export function useRecruitment(orgId, user) {
  const [jobs, setJobs] = useState([])
  const [applicants, setApplicants] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  const permissions = recruitmentPermissions(user)
  const isAdmin = isAdminUser(user)
  const hasAccess = useMemo(() => Boolean(user && (isAdmin || permissions.view || permissions.full)), [user, isAdmin, permissions.view, permissions.full])
  const canCreate = isAdmin || permissions.create === true || permissions.full === true

  const canEditRecord = useCallback((record) => Boolean(isAdmin || (
    (permissions.edit === true || permissions.full === true) && ownsRecord(record, user)
  )), [isAdmin, permissions.edit, permissions.full, user])
  const canDeleteRecord = useCallback((record) => Boolean(isAdmin || (
    (permissions.delete === true || permissions.full === true) && ownsRecord(record, user)
  )), [isAdmin, permissions.delete, permissions.full, user])

  const fetchJobs = useCallback(async () => {
    if (!orgId || !hasAccess) return
    try {
      const snapshot = await getDocs(query(jobsCol(orgId), orderBy('createdAt', 'desc')))
      setJobs(snapshot.docs.map((item) => ({ id: item.id, ...item.data() })))
    } catch (fetchError) {
      if (fetchError.code !== 'permission-denied') {
        console.error('Fetch jobs error:', fetchError)
        setError(fetchError.message)
      }
    }
  }, [orgId, hasAccess])

  const fetchApplicants = useCallback(async () => {
    if (!orgId || !hasAccess) return
    try {
      const snapshot = await getDocs(query(applicantsCol(orgId), orderBy('createdAt', 'desc')))
      setApplicants(snapshot.docs.map((item) => ({ id: item.id, ...item.data() })))
    } catch (fetchError) {
      if (fetchError.code !== 'permission-denied') {
        console.error('Fetch applicants error:', fetchError)
        setError(fetchError.message)
      }
    }
  }, [orgId, hasAccess])

  const fetchData = useCallback(async () => {
    if (!hasAccess) return
    setLoading(true)
    setError(null)
    try {
      await Promise.all([fetchJobs(), fetchApplicants()])
    } finally {
      setLoading(false)
    }
  }, [hasAccess, fetchJobs, fetchApplicants])

  const ensureCan = (allowed, action) => {
    if (!orgId || !user || !hasAccess) throw new Error('You do not have access to Recruitment.')
    if (!allowed) throw new Error(`You do not have permission to ${action} this recruitment record.`)
  }

  const makeAudit = (batch, action, details) => {
    const userName = user?.name || user?.email || 'System'
    const auditRef = doc(collection(db, 'organisations', orgId, 'audit_logs'))
    batch.set(auditRef, {
      module: 'Recruitment',
      action,
      details,
      performedBy: userName,
      performedById: user?.uid || null,
      timestamp: serverTimestamp()
    })
  }

  const addJob = async (payload) => {
    ensureCan(canCreate, 'create')
    const userName = user?.name || user?.email || 'System'
    const jobRef = doc(jobsCol(orgId))
    const batch = writeBatch(db)
    batch.set(jobRef, {
      ...payload,
      createdBy: userName,
      createdById: user?.uid || null,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    })
    makeAudit(batch, 'CREATE', `Created job opening: ${payload.title || 'Untitled role'}`)
    await batch.commit()
    await fetchJobs()
    return jobRef.id
  }

  const updateJob = async (jobId, payload) => {
    const existing = jobs.find((job) => job.id === jobId)
    ensureCan(existing && canEditRecord(existing), 'edit')
    const batch = writeBatch(db)
    batch.update(jobDoc(orgId, jobId), {
      ...payload,
      updatedAt: serverTimestamp(),
      updatedBy: user?.name || user?.email || 'System',
      updatedById: user?.uid || null
    })
    makeAudit(batch, 'UPDATE', `Updated job opening: ${payload.title || existing.title || 'Untitled role'}`)
    await batch.commit()
    await fetchJobs()
  }

  const deleteJob = async (jobId) => {
    const existing = jobs.find((job) => job.id === jobId)
    ensureCan(existing && canDeleteRecord(existing), 'delete')
    const batch = writeBatch(db)
    batch.delete(jobDoc(orgId, jobId))
    makeAudit(batch, 'DELETE', `Deleted job opening: ${existing.title || 'Untitled role'}`)
    await batch.commit()
    await fetchJobs()
  }

  const addApplicant = async (payload) => {
    ensureCan(canCreate, 'create')
    const userName = user?.name || user?.email || 'System'
    const linkedJob = jobs.find((job) => job.id === payload.jobId)
    const applicantRef = doc(applicantsCol(orgId))
    const batch = writeBatch(db)
    const data = {
      ...payload,
      createdBy: userName,
      createdById: user?.uid || null,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    }
    if (payload.status === 'Hired') data.hiredAt = serverTimestamp()
    batch.set(applicantRef, data)
    makeAudit(batch, 'CREATE', `Added applicant ${payload.name || 'Unknown candidate'} for ${linkedJob?.title || 'a role'}`)
    await batch.commit()
    await fetchApplicants()
    return applicantRef.id
  }

  const updateApplicant = async (applicantId, payload) => {
    const existing = applicants.find((applicant) => applicant.id === applicantId)
    ensureCan(existing && canEditRecord(existing), 'edit')
    const updates = {
      ...payload,
      updatedAt: serverTimestamp(),
      updatedBy: user?.name || user?.email || 'System',
      updatedById: user?.uid || null
    }
    if (payload.status === 'Hired' && existing.status !== 'Hired' && !existing.hiredAt) {
      updates.hiredAt = serverTimestamp()
    }
    const batch = writeBatch(db)
    batch.update(applicantDoc(orgId, applicantId), updates)
    const candidate = payload.name || existing.name || 'Unknown candidate'
    const stageChange = payload.status && payload.status !== existing.status
      ? `; stage changed from ${existing.status || 'New'} to ${payload.status}`
      : ''
    const interviewChange = Object.hasOwn(payload, 'interviewAt') && payload.interviewAt
      ? `; interview scheduled for ${payload.interviewAt}`
      : ''
    makeAudit(batch, 'UPDATE', `Updated applicant ${candidate}${stageChange}${interviewChange}`)
    await batch.commit()
    await fetchApplicants()
  }

  const deleteApplicant = async (applicantId) => {
    const existing = applicants.find((applicant) => applicant.id === applicantId)
    ensureCan(existing && canDeleteRecord(existing), 'delete')
    const batch = writeBatch(db)
    batch.delete(applicantDoc(orgId, applicantId))
    makeAudit(batch, 'DELETE', `Deleted applicant ${existing.name || 'Unknown candidate'}`)
    await batch.commit()
    await fetchApplicants()
  }

  useEffect(() => {
    if (orgId && hasAccess) fetchData()
  }, [orgId, hasAccess, fetchData])

  return {
    jobs,
    applicants,
    loading,
    error,
    fetchData,
    addJob,
    updateJob,
    deleteJob,
    addApplicant,
    updateApplicant,
    deleteApplicant,
    canCreate,
    canEditJob: canEditRecord,
    canDeleteJob: canDeleteRecord,
    canEditApplicant: canEditRecord,
    canDeleteApplicant: canDeleteRecord
  }
}
