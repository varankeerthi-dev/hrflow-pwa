import { useState, useEffect, useCallback, useMemo } from 'react'
import { db } from '../lib/firebase'
import {
  collection,
  doc,
  addDoc,
  updateDoc,
  deleteDoc,
  onSnapshot,
  query,
  orderBy,
  serverTimestamp,
  setDoc,
  arrayUnion,
  arrayRemove
} from 'firebase/firestore'

/**
 * Hook to manage multi-tenant Sub-Contractors for an organization.
 * Automatically synchronizes with organisations/{orgId}/subcontractors
 * and ensures contractor names are readily accessible for Advance/Expense modules.
 */
export function useSubcontractors(orgId, user) {
  const [subcontractors, setSubcontractors] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  // Real-time listener for subcontractors subcollection
  useEffect(() => {
    if (!orgId) {
      setSubcontractors([])
      setLoading(false)
      return
    }

    setLoading(true)
    const subCol = collection(db, 'organisations', orgId, 'subcontractors')
    const q = query(subCol, orderBy('name', 'asc'))

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const list = snapshot.docs.map((docSnap) => ({
          id: docSnap.id,
          ...docSnap.data()
        }))
        setSubcontractors(list)
        setLoading(false)
        setError(null)
      },
      (err) => {
        console.error('Error fetching subcontractors:', err)
        setError(err.message)
        setLoading(false)
      }
    )

    return () => unsubscribe()
  }, [orgId])

  // Extract distinct active subcontractor names
  const subcontractorNames = useMemo(() => {
    return subcontractors
      .filter((s) => s.status !== 'Inactive' && s.name?.trim())
      .map((s) => s.name.trim())
  }, [subcontractors])

  // Add new subcontractor with audit logging
  const addSubcontractor = useCallback(
    async (contractorData) => {
      if (!orgId) throw new Error('Organization ID is required')
      const name = (contractorData.name || '').trim()
      if (!name) throw new Error('Contractor Name is required')

      const cleanPan = (contractorData.pan || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 10)
      const cleanGst = (contractorData.gst || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 15)
      const cleanIfsc = (contractorData.ifsc || contractorData.bankAccount?.ifsc || '')
        .toUpperCase()
        .replace(/[^A-Z0-9]/g, '')
        .slice(0, 11)

      const docPayload = {
        name,
        mobile: (contractorData.mobile || '').trim(),
        address: (contractorData.address || '').trim(),
        pan: cleanPan,
        gst: cleanGst,
        bankAccount: {
          bankName: (contractorData.bankName || contractorData.bankAccount?.bankName || '').trim(),
          accountNumber: (contractorData.accountNumber || contractorData.bankAccount?.accountNumber || '').trim(),
          ifsc: cleanIfsc,
          holderName: (contractorData.holderName || contractorData.bankAccount?.holderName || name).trim()
        },
        upi: (contractorData.upi || '').trim(),
        emergencyContact: (contractorData.emergencyContact || '').trim(),
        bloodGroup: (contractorData.bloodGroup || '').trim(),
        specialization: (contractorData.specialization || '').trim(),
        status: contractorData.status || 'Active',
        notes: (contractorData.notes || '').trim(),
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        createdById: user?.uid || null,
        createdBy: user?.name || user?.email || 'User'
      }

      // 1. Add to subcontractors subcollection
      const docRef = await addDoc(collection(db, 'organisations', orgId, 'subcontractors'), docPayload)

      // 2. Also register name in organisation document for high-speed tenant category access
      try {
        await setDoc(
          doc(db, 'organisations', orgId),
          { subcontractorNames: arrayUnion(name) },
          { merge: true }
        )
      } catch (err) {
        console.warn('Could not sync subcontractor name to root org:', err)
      }

      // 3. Emit immutable audit log
      try {
        await addDoc(collection(db, 'organisations', orgId, 'audit_logs'), {
          module: 'Operations',
          action: 'Add Subcontractor',
          details: `Added new sub-contractor: ${name} (Mobile: ${docPayload.mobile || 'N/A'}, PAN: ${cleanPan || 'N/A'})`,
          userName: user?.name || user?.email || 'User',
          userId: user?.uid || null,
          timestamp: serverTimestamp()
        })
      } catch (auditErr) {
        console.warn('Audit log write error:', auditErr)
      }

      return { id: docRef.id, ...docPayload }
    },
    [orgId, user]
  )

  // Update existing subcontractor with audit logging
  const updateSubcontractor = useCallback(
    async (id, contractorData, previousName) => {
      if (!orgId || !id) throw new Error('Org ID and Contractor ID required')
      const name = (contractorData.name || '').trim()
      if (!name) throw new Error('Contractor Name is required')

      const cleanPan = (contractorData.pan || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 10)
      const cleanGst = (contractorData.gst || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 15)
      const cleanIfsc = (contractorData.ifsc || contractorData.bankAccount?.ifsc || '')
        .toUpperCase()
        .replace(/[^A-Z0-9]/g, '')
        .slice(0, 11)

      const updatePayload = {
        name,
        mobile: (contractorData.mobile || '').trim(),
        address: (contractorData.address || '').trim(),
        pan: cleanPan,
        gst: cleanGst,
        bankAccount: {
          bankName: (contractorData.bankName || contractorData.bankAccount?.bankName || '').trim(),
          accountNumber: (contractorData.accountNumber || contractorData.bankAccount?.accountNumber || '').trim(),
          ifsc: cleanIfsc,
          holderName: (contractorData.holderName || contractorData.bankAccount?.holderName || name).trim()
        },
        upi: (contractorData.upi || '').trim(),
        emergencyContact: (contractorData.emergencyContact || '').trim(),
        bloodGroup: (contractorData.bloodGroup || '').trim(),
        specialization: (contractorData.specialization || '').trim(),
        status: contractorData.status || 'Active',
        notes: (contractorData.notes || '').trim(),
        updatedAt: serverTimestamp(),
        lastUpdatedBy: user?.name || user?.email || 'User',
        lastUpdatedById: user?.uid || null
      }

      await updateDoc(doc(db, 'organisations', orgId, 'subcontractors', id), updatePayload)

      // Sync name update in organisation document
      if (previousName && previousName !== name) {
        try {
          await setDoc(
            doc(db, 'organisations', orgId),
            {
              subcontractorNames: arrayRemove(previousName)
            },
            { merge: true }
          )
          await setDoc(
            doc(db, 'organisations', orgId),
            {
              subcontractorNames: arrayUnion(name)
            },
            { merge: true }
          )
        } catch (err) {
          console.warn('Could not update subcontractor name in root org:', err)
        }
      }

      // Emit audit log
      try {
        await addDoc(collection(db, 'organisations', orgId, 'audit_logs'), {
          module: 'Operations',
          action: 'Update Subcontractor',
          details: `Updated sub-contractor: ${name}`,
          userName: user?.name || user?.email || 'User',
          userId: user?.uid || null,
          timestamp: serverTimestamp()
        })
      } catch (auditErr) {
        console.warn('Audit log write error:', auditErr)
      }
    },
    [orgId, user]
  )

  // Delete subcontractor with RBAC verification & audit logging
  const deleteSubcontractor = useCallback(
    async (id, contractorName) => {
      if (!orgId || !id) throw new Error('Org ID and Contractor ID required')

      await deleteDoc(doc(db, 'organisations', orgId, 'subcontractors', id))

      if (contractorName) {
        try {
          await setDoc(
            doc(db, 'organisations', orgId),
            {
              subcontractorNames: arrayRemove(contractorName)
            },
            { merge: true }
          )
        } catch (err) {
          console.warn('Could not remove subcontractor name from root org:', err)
        }
      }

      // Emit audit log
      try {
        await addDoc(collection(db, 'organisations', orgId, 'audit_logs'), {
          module: 'Operations',
          action: 'Delete Subcontractor',
          details: `Deleted sub-contractor: ${contractorName || id}`,
          userName: user?.name || user?.email || 'User',
          userId: user?.uid || null,
          timestamp: serverTimestamp()
        })
      } catch (auditErr) {
        console.warn('Audit log write error:', auditErr)
      }
    },
    [orgId, user]
  )

  // Quick inline add name (used by Advance-Expense fast category flow)
  const quickAddSubcontractorName = useCallback(
    async (rawName) => {
      const name = (rawName || '').trim()
      if (!name || !orgId) return null

      // Check if already exists case-insensitively
      const existing = subcontractors.find((s) => s.name?.toLowerCase() === name.toLowerCase())
      if (existing) return existing

      return addSubcontractor({
        name,
        status: 'Active'
      })
    },
    [orgId, subcontractors, addSubcontractor]
  )

  return {
    subcontractors,
    subcontractorNames,
    loading,
    error,
    addSubcontractor,
    updateSubcontractor,
    deleteSubcontractor,
    quickAddSubcontractorName
  }
}
