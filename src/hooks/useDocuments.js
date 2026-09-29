import { useState, useEffect, useMemo, useCallback } from 'react'
import { collection, doc, getDocs, orderBy, query, serverTimestamp, writeBatch } from 'firebase/firestore'
import { deleteObject, getDownloadURL, ref, uploadBytes } from 'firebase/storage'
import { db, storage } from '../lib/firebase'
import { documentsCol, documentDoc } from '../lib/firestore'
import { validateDocumentFile } from '../lib/documentManagement'

const auditCol = (orgId) => collection(db, 'organisations', orgId, 'audit_logs')
const admin = (user) => user?.role?.toLowerCase() === 'admin'
const owner = (record, user) => Boolean(user && (record?.createdBy === user.name || record?.createdById === user.uid))
const cleanFileName = (value) => String(value || 'document').replace(/[^A-Za-z0-9._-]/g, '_').slice(0, 120)

export function useDocuments(orgId, user) {
  const [documents, setDocuments] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  const perms = useMemo(() => user?.permissions?.DocumentManagement || {}, [user?.permissions?.DocumentManagement])
  const hasAccess = useMemo(() => Boolean(user && (admin(user) || perms.view || perms.create || perms.edit || perms.delete || perms.full)), [user, perms])
  const canCreate = Boolean(user && (admin(user) || perms.create || perms.full))
  const canEditDocument = useCallback((record) => Boolean(user && (admin(user) || ((perms.edit || perms.full) && owner(record, user)))), [user, perms])
  const canDeleteDocument = useCallback((record) => Boolean(user && (admin(user) || ((perms.delete || perms.full) && owner(record, user)))), [user, perms])

  const fetchDocuments = useCallback(async () => {
    if (!orgId || !hasAccess) {
      setDocuments([])
      setLoading(false)
      return
    }
    setLoading(true)
    setError(null)
    try {
      const snapshot = await getDocs(query(documentsCol(orgId), orderBy('createdAt', 'desc')))
      setDocuments(snapshot.docs.map((item) => ({ id: item.id, ...item.data() })))
    } catch (fetchError) {
      setError(fetchError.message || 'Could not load documents.')
    } finally {
      setLoading(false)
    }
  }, [orgId, hasAccess])

  const requireCreate = () => {
    if (!orgId || !user || !hasAccess || !canCreate) throw new Error('You do not have permission to add documents.')
  }

  const addDocument = async (payload) => {
    requireCreate()
    const recordRef = doc(documentsCol(orgId))
    const batch = writeBatch(db)
    batch.set(recordRef, {
      ...payload,
      documentGroupId: recordRef.id,
      version: 1,
      createdBy: user?.name || user?.email || 'Unknown user',
      createdById: user?.uid || null,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    })
    batch.set(doc(auditCol(orgId)), {
      module: 'Documents', action: 'CREATE', details: `Added document record: ${payload.name || 'Untitled document'}`,
      performedBy: user?.name || user?.email || 'Unknown user', performedById: user?.uid || null, timestamp: serverTimestamp(),
    })
    await batch.commit()
    await fetchDocuments()
    return recordRef.id
  }

  const uploadDocument = async (payload, file, previousVersion = null) => {
    requireCreate()
    const fileError = validateDocumentFile(file)
    if (fileError) throw new Error(fileError)
    if (previousVersion && !canEditDocument(previousVersion)) throw new Error('You can only add a version when you have edit access to the existing record.')
    const versionGroupId = previousVersion?.documentGroupId || previousVersion?.id || doc(documentsCol(orgId)).id
    const nextVersion = previousVersion ? Math.max(1, ...documents.filter((item) => (item.documentGroupId || item.id) === versionGroupId).map((item) => Number(item.version) || 1)) + 1 : 1
    const recordRef = doc(documentsCol(orgId))
    const objectPath = `organisations/${orgId}/documents/${versionGroupId}/v${nextVersion}/${Date.now()}_${cleanFileName(file.name)}`
    const storageRef = ref(storage, objectPath)
    let uploaded = false
    try {
      await uploadBytes(storageRef, file, { contentType: file.type || 'application/octet-stream', customMetadata: { organisationId: orgId, recordId: recordRef.id } })
      uploaded = true
      const url = await getDownloadURL(storageRef)
      const batch = writeBatch(db)
      batch.set(recordRef, {
        ...payload,
        name: String(payload.name || file.name).trim(),
        url,
        storagePath: objectPath,
        fileName: file.name,
        fileType: file.type || '',
        fileSize: file.size,
        documentGroupId: versionGroupId,
        version: nextVersion,
        createdBy: user?.name || user?.email || 'Unknown user',
        createdById: user?.uid || null,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      })
      batch.set(doc(auditCol(orgId)), {
        module: 'Documents', action: previousVersion ? 'UPDATE' : 'CREATE',
        details: `${previousVersion ? 'Uploaded version ' + nextVersion + ' of' : 'Uploaded'} ${payload.name || file.name}`,
        performedBy: user?.name || user?.email || 'Unknown user', performedById: user?.uid || null, timestamp: serverTimestamp(),
      })
      await batch.commit()
      await fetchDocuments()
      return recordRef.id
    } catch (uploadError) {
      if (uploaded) {
        try { await deleteObject(storageRef) } catch (cleanupError) { console.warn('Could not remove an unlinked document upload:', cleanupError) }
      }
      throw uploadError
    }
  }

  const updateDocument = async (docId, payload) => {
    const existing = documents.find((item) => item.id === docId)
    if (!existing || !canEditDocument(existing)) throw new Error('You do not have permission to edit this document.')
    const batch = writeBatch(db)
    batch.update(documentDoc(orgId, docId), { ...payload, updatedAt: serverTimestamp() })
    batch.set(doc(auditCol(orgId)), {
      module: 'Documents', action: 'UPDATE', details: `Updated document record: ${existing.name || 'Untitled document'}`,
      performedBy: user?.name || user?.email || 'Unknown user', performedById: user?.uid || null, timestamp: serverTimestamp(),
    })
    await batch.commit()
    await fetchDocuments()
  }

  const deleteDocument = async (docId) => {
    const existing = documents.find((item) => item.id === docId)
    if (!existing || !canDeleteDocument(existing)) throw new Error('You do not have permission to delete this document version.')
    if (existing.storagePath) {
      try { await deleteObject(ref(storage, existing.storagePath)) }
      catch (storageError) { if (storageError.code !== 'storage/object-not-found') throw storageError }
    }
    const batch = writeBatch(db)
    batch.delete(documentDoc(orgId, docId))
    batch.set(doc(auditCol(orgId)), {
      module: 'Documents', action: 'DELETE', details: `Deleted document version ${existing.version || 1}: ${existing.name || 'Untitled document'}`,
      performedBy: user?.name || user?.email || 'Unknown user', performedById: user?.uid || null, timestamp: serverTimestamp(),
    })
    await batch.commit()
    await fetchDocuments()
  }

  useEffect(() => { fetchDocuments() }, [fetchDocuments])

  return { documents, loading, error, fetchDocuments, addDocument, uploadDocument, updateDocument, deleteDocument, canCreate, canEditDocument, canDeleteDocument }
}
