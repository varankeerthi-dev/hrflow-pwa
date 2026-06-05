import { useState, useCallback } from 'react'
import { db } from '../lib/firebase'
import { 
  collection, 
  doc, 
  getDoc, 
  getDocs, 
  setDoc, 
  updateDoc, 
  query, 
  where, 
  serverTimestamp, 
  writeBatch 
} from 'firebase/firestore'

export function usePayrollRuns(orgId) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  // Fetch all payroll runs (for History view)
  const fetchAllRuns = useCallback(async () => {
    if (!orgId) return []
    setLoading(true)
    try {
      const runsCol = collection(db, 'organisations', orgId, 'payroll_runs')
      const snap = await getDocs(runsCol)
      return snap.docs.map(d => ({ id: d.id, ...d.data() }))
    } catch (e) {
      setError(e.message)
      return []
    } finally {
      setLoading(false)
    }
  }, [orgId])

  // Fetch a specific payroll run
  const fetchRun = useCallback(async (runId) => {
    if (!orgId || !runId) return null
    setLoading(true)
    try {
      const docRef = doc(db, 'organisations', orgId, 'payroll_runs', runId)
      const snap = await getDoc(docRef)
      if (snap.exists()) {
        return { id: snap.id, ...snap.data() }
      }
      return null
    } catch (e) {
      setError(e.message)
      return null
    } finally {
      setLoading(false)
    }
  }, [orgId])

  // Fetch slips snapshot for a specific run ID
  const fetchRunSlips = useCallback(async (runId) => {
    if (!orgId || !runId) return []
    setLoading(true)
    try {
      const slipsCol = collection(db, 'organisations', orgId, 'payroll_runs', runId, 'slips')
      const snap = await getDocs(slipsCol)
      return snap.docs.map(d => ({ id: d.id, ...d.data() }))
    } catch (e) {
      setError(e.message)
      return []
    } finally {
      setLoading(false)
    }
  }, [orgId])

  // Create/Initiate a new payroll run
  const initiatePayrollRun = useCallback(async ({ month, startDate, endDate, createdBy, userName, employeeSlips }) => {
    if (!orgId || !month) throw new Error('Missing orgId or month')
    setLoading(true)
    try {
      const runId = month // Using month as runId since there is only one run per month
      const docRef = doc(db, 'organisations', orgId, 'payroll_runs', runId)
      
      const summary = {
        totalHeadcount: employeeSlips.length,
        totalGross: employeeSlips.reduce((sum, s) => sum + (Number(s.totalEarnings) || 0), 0),
        totalDeductions: employeeSlips.reduce((sum, s) => sum + (Number(s.pf || 0) + Number(s.esi || 0) + Number(s.loanE || 0) + Number(s.fine || 0)), 0),
        totalNet: employeeSlips.reduce((sum, s) => sum + (Number(s.salary?.net) || 0), 0)
      }

      const runPayload = {
        month,
        startDate,
        endDate,
        status: 'draft',
        totalHeadcount: summary.totalHeadcount,
        totalGross: summary.totalGross,
        totalDeductions: summary.totalDeductions,
        totalNet: summary.totalNet,
        history: [{
          action: 'created',
          performedBy: userName || 'Admin',
          userId: createdBy,
          timestamp: new Date()
        }],
        createdAt: serverTimestamp(),
        createdBy,
        updatedAt: serverTimestamp(),
        updatedBy: createdBy
      }

      // Write run document
      await setDoc(docRef, runPayload)

      // Write slips snapshots in batch
      const batch = writeBatch(db)
      employeeSlips.forEach(slip => {
        const slipRef = doc(db, 'organisations', orgId, 'payroll_runs', runId, 'slips', slip.employeeId || slip.id)
        const slipPayload = {
          employeeId: slip.employeeId || slip.id,
          employeeName: slip.name || '',
          designation: slip.designation || '',
          fullBasic: slip.fullBasic || 0,
          fullHra: slip.fullHra || 0,
          worked: slip.worked || 0,
          totalDays: slip.totalDays || 0,
          lop: slip.lop || 0,
          paidDays: slip.paidDays || 0,
          basicPaid: slip.basic || 0,
          hraPaid: slip.hra || 0,
          otHours: slip.ot || 0,
          otPay: slip.otPay || 0,
          sundayWorked: slip.sunW || 0,
          sundayPay: slip.sunPay || 0,
          holidayWorked: slip.holW || 0,
          holidayPay: slip.holPay || 0,
          totalEarnings: slip.totalEarnings || 0,
          pf: slip.pf || 0,
          esi: slip.esi || 0,
          loan: slip.loanE || 0,
          fine: slip.fine || 0,
          advanceAmount: slip.advanceAmount || 0,
          expenseAmount: slip.expenseAmount || 0,
          netPayout: slip.salary?.net || 0,
          // Storing complete row object just in case we need extra fields
          rawRowData: JSON.parse(JSON.stringify(slip)) 
        }
        batch.set(slipRef, slipPayload)
      })
      await batch.commit()

      return { id: runId, ...runPayload }
    } catch (e) {
      setError(e.message)
      throw e
    } finally {
      setLoading(false)
    }
  }, [orgId])

  // Re-sync calculations for draft run
  const resyncPayrollRun = useCallback(async (runId, employeeSlips, updatedBy) => {
    if (!orgId || !runId) throw new Error('Missing parameters')
    setLoading(true)
    try {
      const docRef = doc(db, 'organisations', orgId, 'payroll_runs', runId)
      
      const summary = {
        totalHeadcount: employeeSlips.length,
        totalGross: employeeSlips.reduce((sum, s) => sum + (Number(s.totalEarnings) || 0), 0),
        totalDeductions: employeeSlips.reduce((sum, s) => sum + (Number(s.pf || 0) + Number(s.esi || 0) + Number(s.loanE || 0) + Number(s.fine || 0)), 0),
        totalNet: employeeSlips.reduce((sum, s) => sum + (Number(s.salary?.net) || 0), 0)
      }

      await updateDoc(docRef, {
        totalHeadcount: summary.totalHeadcount,
        totalGross: summary.totalGross,
        totalDeductions: summary.totalDeductions,
        totalNet: summary.totalNet,
        updatedAt: serverTimestamp(),
        updatedBy
      })

      const batch = writeBatch(db)
      employeeSlips.forEach(slip => {
        const slipRef = doc(db, 'organisations', orgId, 'payroll_runs', runId, 'slips', slip.employeeId || slip.id)
        const slipPayload = {
          employeeId: slip.employeeId || slip.id,
          employeeName: slip.name || '',
          designation: slip.designation || '',
          fullBasic: slip.fullBasic || 0,
          fullHra: slip.fullHra || 0,
          worked: slip.worked || 0,
          totalDays: slip.totalDays || 0,
          lop: slip.lop || 0,
          paidDays: slip.paidDays || 0,
          basicPaid: slip.basic || 0,
          hraPaid: slip.hra || 0,
          otHours: slip.ot || 0,
          otPay: slip.otPay || 0,
          sundayWorked: slip.sunW || 0,
          sundayPay: slip.sunPay || 0,
          holidayWorked: slip.holW || 0,
          holidayPay: slip.holPay || 0,
          totalEarnings: slip.totalEarnings || 0,
          pf: slip.pf || 0,
          esi: slip.esi || 0,
          loan: slip.loanE || 0,
          fine: slip.fine || 0,
          advanceAmount: slip.advanceAmount || 0,
          expenseAmount: slip.expenseAmount || 0,
          netPayout: slip.salary?.net || 0,
          rawRowData: JSON.parse(JSON.stringify(slip)) 
        }
        batch.set(slipRef, slipPayload)
      })
      await batch.commit()
    } catch (e) {
      setError(e.message)
      throw e
    } finally {
      setLoading(false)
    }
  }, [orgId])

  // Update status (Draft -> Review -> Approved -> Locked)
  const updateRunStatus = useCallback(async (runId, status, { action, performedBy, userId, note }) => {
    if (!orgId || !runId) throw new Error('Missing parameters')
    setLoading(true)
    try {
      const docRef = doc(db, 'organisations', orgId, 'payroll_runs', runId)
      const snap = await getDoc(docRef)
      if (!snap.exists()) throw new Error('Payroll run does not exist')
      
      const currentHistory = snap.data().history || []
      const historyEntry = {
        action,
        performedBy,
        userId,
        timestamp: new Date(),
        note: note || ''
      }

      await updateDoc(docRef, {
        status,
        history: [...currentHistory, historyEntry],
        updatedAt: serverTimestamp(),
        updatedBy: userId
      })
    } catch (e) {
      setError(e.message)
      throw e
    } finally {
      setLoading(false)
    }
  }, [orgId])

  return {
    loading,
    error,
    fetchAllRuns,
    fetchRun,
    fetchRunSlips,
    initiatePayrollRun,
    resyncPayrollRun,
    updateRunStatus
  }
}
