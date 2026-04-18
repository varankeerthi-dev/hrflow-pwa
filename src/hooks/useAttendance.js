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
        } else if (r.isHalfDay || r.status === 'Half-Day') {
          summary[r.employeeId].present += 0.5
          summary[r.employeeId].absent += 0.5
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

  const deleteIndividualAttendance = useCallback(async (date, employeeId) => {
    if (!orgId || !date || !employeeId) return
    setLoading(true)
    try {
      await deleteDoc(attendanceDoc(orgId, date, employeeId))
    } catch (e) {
      setError(e.message)
      throw e
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

  const recalculateOTForEmployee = useCallback(async (employeeId, effectiveDate, minDailyHours) => {
    if (!orgId || !employeeId || !effectiveDate) {
      return { matchedCount: 0, recalculatedCount: 0 }
    }
    setLoading(true)
    try {
      const q = query(
        attendanceCol(orgId),
        where('employeeId', '==', employeeId)
      )
      const snapshot = await getDocs(q)

      const recordsFromEffectiveDate = snapshot.docs.filter(d => {
        const recordDate = d.data()?.date
        return typeof recordDate === 'string' && recordDate >= effectiveDate
      })

      let recalculatedCount = 0
      const batch = recordsFromEffectiveDate.map(d => {
        const data = d.data()
        const nextPayload = {
          ...data,
          minDailyHours,
          recalcWorkHours: minDailyHours,
          recalcMinDailyHours: minDailyHours,
          recalculatedAt: serverTimestamp(),
          recalculatedBy: user?.uid || 'system'
        }

        if (data.inTime && data.outTime) {
          nextPayload.otHours = calcOT(data.inTime, data.outTime, data.date, data.outDate || data.date, minDailyHours)
          recalculatedCount++
        }

        return setDoc(attendanceDoc(orgId, data.date, employeeId), nextPayload, { merge: true })
      })
      
      await Promise.all(batch)
      return {
        matchedCount: recordsFromEffectiveDate.length,
        recalculatedCount
      }
    } catch (e) {
      setError(e.message)
      return { matchedCount: 0, recalculatedCount: 0 }
    } finally {
      setLoading(false)
    }
  }, [orgId, user])

  return { attendance, loading, error, fetchByDate, upsertAttendance, fetchMonthlySummary, deleteByDate, deleteIndividualAttendance, fetchRange, recalculateOTForEmployee }
}

export function calcOT(inTime, outTime, inDate, outDate, workHours) {
  if (!inTime || !outTime || !inDate || !outDate) return '00:00'

  const [inH, inM] = inTime.split(':').map(Number)
  const [outH, outM] = outTime.split(':').map(Number)

  const inDateTime = new Date(`${inDate}T${String(inH).padStart(2, '0')}:${String(inM).padStart(2, '0')}:00`)
  const outDateTime = new Date(`${outDate}T${String(outH).padStart(2, '0')}:${String(outM).padStart(2, '0')}:00`)

  if (isNaN(inDateTime.getTime()) || isNaN(outDateTime.getTime())) return '00:00'

  // Total duration in minutes
  const totalMins = Math.floor((outDateTime.getTime() - inDateTime.getTime()) / (1000 * 60))
  
  if (totalMins <= 0) return '00:00'

  const expectedMins = (parseFloat(workHours) || 8) * 60

  // Calculate raw OT minutes
  const rawOtMins = Math.max(0, totalMins - expectedMins)
  
  // Only count OT if more than 30 minutes over permitted hours
  if (rawOtMins <= 30) {
    return '00:00'
  }
  
  // Round to next 5 minutes
  const roundedOtMins = Math.ceil(rawOtMins / 5) * 5
  
  const otHrs = Math.floor(roundedOtMins / 60)
  const otRemMins = roundedOtMins % 60

  if (isNaN(otHrs) || isNaN(otRemMins)) return '00:00'

  return `${String(otHrs).padStart(2, '0')}:${String(otRemMins).padStart(2, '0')}`
}
