import { useCallback, useEffect, useState } from 'react'
import {
  collection,
  addDoc,
  updateDoc,
  deleteDoc,
  doc,
  getDocs,
  query,
  where,
  orderBy,
  serverTimestamp,
} from 'firebase/firestore'
import { db } from '../lib/firebase'
import { getEligibleAllowanceCategories, getAllowanceAmount } from '../lib/allowanceRules'

export function useAllowanceCategories(orgId) {
  const [categories, setCategories] = useState([])
  const [loading, setLoading] = useState(false)

  const fetchCategories = useCallback(async () => {
    if (!orgId) return []
    setLoading(true)
    try {
      const q = query(collection(db, 'organisations', orgId, 'allowanceCategories'), orderBy('createdAt', 'desc'))
      const snap = await getDocs(q)
      const data = snap.docs.map(d => ({ id: d.id, ...d.data() }))
      setCategories(data)
      return data
    } catch (err) {
      console.error('Fetch allowance categories error:', err)
      return []
    } finally {
      setLoading(false)
    }
  }, [orgId])

  useEffect(() => {
    fetchCategories()
  }, [fetchCategories])

  const addCategory = useCallback(async (payload) => {
    if (!orgId) throw new Error('Organization not found')
    const docRef = await addDoc(collection(db, 'organisations', orgId, 'allowanceCategories'), {
      ...payload,
      active: payload.active !== false,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    })
    await fetchCategories()
    return docRef.id
  }, [orgId, fetchCategories])

  const updateCategory = useCallback(async (categoryId, payload) => {
    if (!orgId) throw new Error('Organization not found')
    await updateDoc(doc(db, 'organisations', orgId, 'allowanceCategories', categoryId), {
      ...payload,
      updatedAt: serverTimestamp(),
    })
    await fetchCategories()
  }, [orgId, fetchCategories])

  const deleteCategory = useCallback(async (categoryId) => {
    if (!orgId) throw new Error('Organization not found')
    await deleteDoc(doc(db, 'organisations', orgId, 'allowanceCategories', categoryId))
    await fetchCategories()
  }, [orgId, fetchCategories])

  return { categories, loading, fetchCategories, addCategory, updateCategory, deleteCategory }
}

export function useAllowanceClaims(orgId) {
  const [claims, setClaims] = useState([])
  const [loading, setLoading] = useState(false)

  const fetchClaims = useCallback(async () => {
    if (!orgId) return []
    setLoading(true)
    try {
      const q = query(collection(db, 'organisations', orgId, 'allowances'), orderBy('createdAt', 'desc'))
      const snap = await getDocs(q)
      const data = snap.docs.map(d => ({ id: d.id, ...d.data() }))
      setClaims(data)
      return data
    } catch (err) {
      console.error('Fetch allowance claims error:', err)
      return []
    } finally {
      setLoading(false)
    }
  }, [orgId])

  useEffect(() => {
    fetchClaims()
  }, [fetchClaims])

  /**
   * Creates allowance claims for a single attendance row.
   * Only creates claims for categories the employee is currently eligible for
   * AND that the user has explicitly selected AND that don't already have a claim
   * for the same date/category (avoids duplicates on re-save).
   */
  const upsertClaimsForAttendance = useCallback(async ({ employee, date, outTime, selectedCategoryIds, user, autoApproved, existingClaims = [], refreshClaims = true }) => {
    if (!orgId) return []
    if (!employee?.id || !date) return []

    const categories = await fetchCategoriesOnce(orgId)
    const eligible = getEligibleAllowanceCategories(categories, { employeeId: employee.id, outTime })
    const existing = (existingClaims || []).filter(c =>
      c.date === date &&
      c.employeeId === employee.id &&
      c.status !== 'Rejected'
    )
    const toCreate = eligible.filter(cat =>
      selectedCategoryIds.includes(cat.id) &&
      !existing.some(c => c.categoryId === cat.id)
    )

    const created = await Promise.all(toCreate.map(async (cat) => {
      const amount = getAllowanceAmount(cat)
      const payload = {
        employeeId: employee.id,
        employeeName: employee.name || 'Unknown',
        categoryId: cat.id,
        categoryName: cat.name,
        amount,
        date,
        outTime: outTime || '',
        source: 'attendance',
        status: autoApproved ? 'Approved' : 'Pending',
        hrApproval: autoApproved ? 'Approved' : 'Pending',
        mdApproval: autoApproved ? 'Approved' : 'Pending',
        paymentStatus: 'Unpaid',
        approvalRequired: !autoApproved,
        createdBy: user?.uid || 'system',
        createdByName: user?.name || 'System',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      }
      const docRef = await addDoc(collection(db, 'organisations', orgId, 'allowances'), payload)
      return { id: docRef.id, ...payload }
    }))
    if (created.length > 0 && refreshClaims) await fetchClaims()
    return created
  }, [orgId, fetchClaims])

  const approveClaim = useCallback(async (claimId, user) => {
    if (!orgId) return
    await updateDoc(doc(db, 'organisations', orgId, 'allowances', claimId), {
      status: 'Approved',
      hrApproval: 'Approved',
      mdApproval: 'Approved',
      approvedBy: user?.uid || 'system',
      approvedByName: user?.name || 'System',
      approvedAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    })
    await fetchClaims()
  }, [orgId, fetchClaims])

  const rejectClaim = useCallback(async (claimId, user, reason = '') => {
    if (!orgId) return
    await updateDoc(doc(db, 'organisations', orgId, 'allowances', claimId), {
      status: 'Rejected',
      rejectionReason: reason || '',
      rejectedBy: user?.uid || 'system',
      rejectedByName: user?.name || 'System',
      rejectedAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    })
    await fetchClaims()
  }, [orgId, fetchClaims])

  const markClaimPaid = useCallback(async (claimId, user, { paymentMethod = 'Bank Transfer', paymentRef = '' } = {}) => {
    if (!orgId) return
    await updateDoc(doc(db, 'organisations', orgId, 'allowances', claimId), {
      paymentStatus: 'Paid',
      status: 'Approved',
      paymentMethod,
      paymentRef,
      paidBy: user?.uid || 'system',
      paidByName: user?.name || 'System',
      paidAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    })
    await fetchClaims()
  }, [orgId, fetchClaims])

  const deleteClaim = useCallback(async (claimId) => {
    if (!orgId) return
    await deleteDoc(doc(db, 'organisations', orgId, 'allowances', claimId))
    await fetchClaims()
  }, [orgId, fetchClaims])

  return { claims, loading, fetchClaims, upsertClaimsForAttendance, approveClaim, rejectClaim, markClaimPaid, deleteClaim }
}

// Shared lightweight category fetch used by claim creation without a full hook.
let _categoryCache = null
async function fetchCategoriesOnce(orgId) {
  if (_categoryCache) return _categoryCache
  const q = query(collection(db, 'organisations', orgId, 'allowanceCategories'))
  _categoryCache = getDocs(q)
    .then((snap) => snap.docs.map(d => ({ id: d.id, ...d.data() })))
    .catch((error) => { _categoryCache = null; throw error })
  setTimeout(() => { _categoryCache = null }, 5000)
  return _categoryCache
}

/**
 * Returns true when the org has an active approval workflow for the "Allowance" module
 * (type is not 'none'). When true, allowance claims need approval before payment.
 */
export async function fetchAllowanceApprovalMode(orgId) {
  if (!orgId) return false
  try {
    const q = query(collection(db, 'organisations', orgId, 'approvalSettings'), where('moduleName', '==', 'Allowance'))
    const snap = await getDocs(q)
    const setting = snap.docs[0]?.data()
    return setting?.type ? setting.type !== 'none' : false
  } catch (err) {
    console.error('Fetch allowance approval mode error:', err)
    return false
  }
}
