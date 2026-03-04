import { useState, useEffect } from 'react'
import { getDocs, query, orderBy, addDoc, updateDoc, doc, serverTimestamp } from 'firebase/firestore'
import { correctionsCol } from '../lib/firestore'

export function useCorrections(orgId) {
  const [corrections, setCorrections] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const fetchCorrections = async () => {
    if (!orgId) return
    setLoading(true)
    try {
      const q = query(correctionsCol(orgId), orderBy('createdAt', 'desc'))
      const snapshot = await getDocs(q)
      setCorrections(snapshot.docs.map(d => ({ id: d.id, ...d.data() })))
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  const submitCorrection = async (payload, requestedByUid) => {
    const docRef = await addDoc(correctionsCol(orgId), {
      ...payload,
      status: 'Pending',
      requestedBy: requestedByUid,
      createdAt: serverTimestamp(),
    })
    return docRef.id
  }

  const updateCorrectionStatus = async (corrId, status, reviewedByUid) => {
    await updateDoc(doc(correctionsCol(orgId), corrId), {
      status,
      reviewedBy: reviewedByUid,
    })
  }

  useEffect(() => {
    fetchCorrections()
  }, [orgId])

  return { corrections, loading, error, fetchCorrections, submitCorrection, updateCorrectionStatus }
}
