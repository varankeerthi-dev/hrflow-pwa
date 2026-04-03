import { useState, useEffect, useCallback } from 'react'
import { getDocs, query, where, setDoc, deleteDoc, serverTimestamp } from 'firebase/firestore'
import { attendanceCol, attendanceDoc } from '../lib/firestore'
import { useAuth } from './useAuth'

export function useAttendance(orgId) {
  const { user } = useAuth()
  const [attendance, setAttendance] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  const fetchByDate = useCallback(async (date) => {
    if (!orgId || !date) return []
    setLoading(true)
    try {
      const q = query(attendanceCol(orgId), where('date', '==', date))
      const snapshot = await getDocs(q)
      return snapshot.docs.map(d => ({ id: d.id, ...d.data() }))
    } catch (e) {
      setError(e.message)
      return []
    } finally {
      setLoading(false)
    }
  }, [orgId])

  const upsertAttendance = useCallback(async (rows) => {
    if (!orgId || !rows.length) return
    const batch = rows.map(row => {
      const rowDate = row.date || row.inDate
      return setDoc(attendanceDoc(orgId, rowDate, row.employeeId), {
        ...row,
        date: rowDate,
        updatedAt: serverTimestamp(),
        updatedBy: user?.uid || 'system',
        updatedByName: user?.name || 'System'
      }, { merge: true })
    })
    await Promise.all(batch)
  }, [orgId, user])

  const fetchMonthlySummary = useCallback(async (yearMonth) => {
    if (!orgId || !yearMonth) return []
    setLoading(true)
    try {
      const q = query(attendanceCol(orgId), where('date', '>=', yearMonth), where('date', '<', yearMonth + '-31'))
      const snapshot = await getDocs(q)
      const records = snapshot.docs.map(d => d.data())

      const summary = {}
      records.forEach(r => {
        if (!summary[r.employeeId]) {
          summary[r.employeeId] = { present: 0, absent: 0, otHours: 0 }
        }
        if (r.isAbsent) {
          summary[r.employeeId].absent++
        } else {
          summary[r.employeeId].present++
        }
        if (r.otHours) {
          const [h, m] = r.otHours.split(':').map(Number)
          summary[r.employeeId].otHours += (h || 0) + (m || 0) / 60
        }
      })
      return Object.entries(summary).map(([employeeId, stats]) => ({ employeeId, ...stats }))
    } catch (e) {
      setError(e.message)
      return []
    } finally {
      setLoading(false)
    }
  }, [orgId])

  const deleteByDate = useCallback(async (date) => {
    if (!orgId || !date) return
    setLoading(true)
    try {
      const q = query(attendanceCol(orgId), where('date', '==', date))
      const snapshot = await getDocs(q)
      const batch = snapshot.docs.map(d => deleteDoc(attendanceDoc(orgId, date, d.data().employeeId)))
      await Promise.all(batch)
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }, [orgId])

  const fetchRange = useCallback(async (startDate, endDate) => {
    if (!orgId || !startDate || !endDate) return []
    setLoading(true)
    try {
      const q = query(
        attendanceCol(orgId), 
        where('date', '>=', startDate), 
        where('date', '<=', endDate)
      )
      const snapshot = await getDocs(q)
      return snapshot.docs.map(d => ({ id: d.id, ...d.data() }))
    } catch (e) {
      setError(e.message)
      return []
    } finally {
      setLoading(false)
    }
  }, [orgId])

  const recalculateOTForEmployee = useCallback(async (employeeId, effectiveDate, workHours) => {
    if (!orgId || !employeeId || !effectiveDate) return 0
    setLoading(true)
    try {
      const q = query(
        attendanceCol(orgId),
        where('employeeId', '==', employeeId),
        where('date', '>=', effectiveDate)
      )
      const snapshot = await getDocs(q)
      
      let updatedCount = 0
      const batch = snapshot.docs.map(d => {
        const data = d.data()
        // Only recalculate if we have both in and out times
        if (data.inTime && data.outTime) {
          const newOTHours = calcOT(data.inTime, data.outTime, data.date, data.outDate || data.date, workHours)
          updatedCount++
          return setDoc(attendanceDoc(orgId, data.date, employeeId), {
            ...data,
            otHours: newOTHours,
            recalcWorkHours: workHours,
            recalculatedAt: serverTimestamp(),
            recalculatedBy: user?.uid || 'system'
          }, { merge: true })
        }
        return Promise.resolve()
      })
      
      await Promise.all(batch)
      return updatedCount
    } catch (e) {
      setError(e.message)
      return 0
    } finally {
      setLoading(false)
    }
  }, [orgId, user])

  return { attendance, loading, error, fetchByDate, upsertAttendance, fetchMonthlySummary, deleteByDate, fetchRange, recalculateOTForEmployee }
}

export function calcOT(inTime, outTime, inDate, outDate, workHours) {
  if (!inTime || !outTime || !inDate || !outDate) return '00:00'

  const parseTime = (t) => {
    if (!t) return 0
    const [h, m] = t.split(':').map(Number)
    return (h || 0) * 60 + (m || 0)
  }

  const parseDate = (d) => new Date(d)

  const inMins = parseTime(inTime)
  let outMins = parseTime(outTime)

  const inD = parseDate(inDate)
  const outD = parseDate(outDate)

  if (isNaN(inD.getTime()) || isNaN(outD.getTime())) return '00:00'

  // Handle overnight shift
  if (outD > inD || (outD.getTime() === inD.getTime() && outMins < inMins)) {
    outMins += 24 * 60
  }

  const workedMins = outMins - inMins
  const expectedMins = (parseFloat(workHours) || 9) * 60

  const otMins = Math.max(0, workedMins - expectedMins)
  
  // Round to next 5 minutes
  const roundedOtMins = Math.ceil(otMins / 5) * 5
  
  const otHrs = Math.floor(roundedOtMins / 60)
  const otRemMins = roundedOtMins % 60

  if (isNaN(otHrs) || isNaN(otRemMins)) return '00:00'

  return `${String(otHrs).padStart(2, '0')}:${String(otRemMins).padStart(2, '0')}`
}
