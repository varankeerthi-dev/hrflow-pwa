import { useState, useEffect } from 'react'
import { getDocs, query, orderBy, addDoc, updateDoc, doc } from 'firebase/firestore'
import { otApprovalsCol } from '../lib/firestore'

export function useOTApprovals(orgId) {
  const [otApprovals, setOTApprovals] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const fetchOTApprovals = async () => {
    if (!orgId) return
    setLoading(true)
    try {
      const q = query(otApprovalsCol(orgId), orderBy('createdAt', 'desc'))
      const snapshot = await getDocs(q)
      setOTApprovals(snapshot.docs.map(d => ({ id: d.id, ...d.data() })))
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  const submitOTApproval = async (payload, requestedByUid) => {
    const docRef = await addDoc(otApprovalsCol(orgId), {
      ...payload,
      status: 'pending',
      requestedBy: requestedByUid,
      createdAt: new Date(),
    })
    return docRef.id
  }

  const updateOTStatus = async (approvalId, status, reviewedByUid) => {
    await updateDoc(doc(otApprovalsCol(orgId), approvalId), {
      status,
      reviewedBy: reviewedByUid,
    })
    // Update local state so UI reflects change immediately
    setOTApprovals(prev => prev.map(a => a.id === approvalId ? { ...a, status, reviewedBy: reviewedByUid } : a))
  }

  useEffect(() => {
    fetchOTApprovals()
  }, [orgId])

  return { otApprovals, loading, error, fetchOTApprovals, submitOTApproval, updateOTStatus }
}
