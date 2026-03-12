import { useState, useEffect } from 'react'
import { getDocs, addDoc, updateDoc, deleteDoc, serverTimestamp, query, orderBy, where } from 'firebase/firestore'
import { documentsCol, documentDoc } from '../lib/firestore'

export function useDocuments(orgId) {
  const [documents, setDocuments] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const fetchDocuments = async () => {
    if (!orgId) return
    setLoading(true)
    try {
      const q = query(documentsCol(orgId), orderBy('createdAt', 'desc'))
      const snapshot = await getDocs(q)
      const data = snapshot.docs.map(d => ({ id: d.id, ...d.data() }))
      setDocuments(data)
    } catch (e) {
      console.error('Fetch documents error:', e)
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  const addDocument = async (payload) => {
    const data = {
      ...payload,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    }
    const docRef = await addDoc(documentsCol(orgId), data)
    fetchDocuments()
    return docRef.id
  }

  const updateDocument = async (docId, payload) => {
    await updateDoc(documentDoc(orgId, docId), {
      ...payload,
      updatedAt: serverTimestamp(),
    })
    fetchDocuments()
  }

  const deleteDocument = async (docId) => {
    await deleteDoc(documentDoc(orgId, docId))
    fetchDocuments()
  }

  useEffect(() => {
    fetchDocuments()
  }, [orgId])

  return { documents, loading, error, fetchDocuments, addDocument, updateDocument, deleteDocument }
}
