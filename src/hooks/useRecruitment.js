import { useState, useEffect } from 'react'
import { getDocs, addDoc, updateDoc, deleteDoc, serverTimestamp, query, orderBy } from 'firebase/firestore'
import { jobsCol, jobDoc, applicantsCol, applicantDoc } from '../lib/firestore'

export function useRecruitment(orgId) {
  const [jobs, setJobs] = useState([])
  const [applicants, setApplicants] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const fetchJobs = async () => {
    if (!orgId) return
    try {
      const q = query(jobsCol(orgId), orderBy('createdAt', 'desc'))
      const snapshot = await getDocs(q)
      const data = snapshot.docs.map(d => ({ id: d.id, ...d.data() }))
      setJobs(data)
    } catch (e) {
      console.error('Fetch jobs error:', e)
    }
  }

  const fetchApplicants = async () => {
    if (!orgId) return
    try {
      const q = query(applicantsCol(orgId), orderBy('createdAt', 'desc'))
      const snapshot = await getDocs(q)
      const data = snapshot.docs.map(d => ({ id: d.id, ...d.data() }))
      setApplicants(data)
    } catch (e) {
      console.error('Fetch applicants error:', e)
    }
  }

  const fetchData = async () => {
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
    fetchData()
  }, [orgId])

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
