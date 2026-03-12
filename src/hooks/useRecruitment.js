import { useState, useEffect, useMemo } from 'react'
import { getDocs, addDoc, updateDoc, deleteDoc, serverTimestamp, query, orderBy } from 'firebase/firestore'
import { jobsCol, jobDoc, applicantsCol, applicantDoc } from '../lib/firestore'

export function useRecruitment(orgId, user) {
  const [jobs, setJobs] = useState([])
  const [applicants, setApplicants] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  const hasAccess = useMemo(() => {
    if (!user) return false
    if (user.role === 'admin' || user.role === 'Admin') return true
    const perms = user.permissions?.['Recruitment'] || {}
    return perms.view || perms.full
  }, [user])

  const fetchJobs = async () => {
    if (!orgId || !hasAccess) return
    try {
      const q = query(jobsCol(orgId), orderBy('createdAt', 'desc'))
      const snapshot = await getDocs(q)
      const data = snapshot.docs.map(d => ({ id: d.id, ...d.data() }))
      setJobs(data)
    } catch (e) {
      if (e.code !== 'permission-denied') {
        console.error('Fetch jobs error:', e)
      }
    }
  }

  const fetchApplicants = async () => {
    if (!orgId || !hasAccess) return
    try {
      const q = query(applicantsCol(orgId), orderBy('createdAt', 'desc'))
      const snapshot = await getDocs(q)
      const data = snapshot.docs.map(d => ({ id: d.id, ...d.data() }))
      setApplicants(data)
    } catch (e) {
      if (e.code !== 'permission-denied') {
        console.error('Fetch applicants error:', e)
      }
    }
  }

  const fetchData = async () => {
    if (!hasAccess) return
    setLoading(true)
    await Promise.all([fetchJobs(), fetchApplicants()])
    setLoading(false)
  }

  const addJob = async (payload) => {
    const data = {
      ...payload,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    }
    const docRef = await addDoc(jobsCol(orgId), data)
    fetchJobs()
    return docRef.id
  }

  const updateJob = async (jobId, payload) => {
    await updateDoc(jobDoc(orgId, jobId), {
      ...payload,
      updatedAt: serverTimestamp(),
    })
    fetchJobs()
  }

  const deleteJob = async (jobId) => {
    await deleteDoc(jobDoc(orgId, jobId))
    fetchJobs()
  }

  const addApplicant = async (payload) => {
    const data = {
      ...payload,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    }
    const docRef = await addDoc(applicantsCol(orgId), data)
    fetchApplicants()
    return docRef.id
  }

  const updateApplicant = async (applicantId, payload) => {
    await updateDoc(applicantDoc(orgId, applicantId), {
      ...payload,
      updatedAt: serverTimestamp(),
    })
    fetchApplicants()
  }

  const deleteApplicant = async (applicantId) => {
    await deleteDoc(applicantDoc(orgId, applicantId))
    fetchApplicants()
  }

  useEffect(() => {
    if (orgId && hasAccess) {
      fetchData()
    }
  }, [orgId, hasAccess])

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
    deleteApplicant 
  }
}
