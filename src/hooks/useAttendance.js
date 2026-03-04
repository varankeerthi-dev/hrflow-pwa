import { useState, useEffect, useCallback } from 'react'
import { getDocs, query, where, setDoc, serverTimestamp } from 'firebase/firestore'
import { attendanceCol, attendanceDoc, attendanceDocId } from '../lib/firestore'

export function useAttendance(orgId) {
  const [attendance, setAttendance] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  const fetchByDate = async (date) => {
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
  }

  const upsertAttendance = async (rows) => {
    if (!orgId || !rows.length) return
    const batch = rows.map(row => {
      const docId = attendanceDocId(row.date, row.employeeId)
      return setDoc(attendanceDoc(orgId, row.date, row.employeeId), {
        ...row,
        updatedAt: serverTimestamp(),
      }, { merge: true })
    })
    await Promise.all(batch)
  }

  const fetchMonthlySummary = async (yearMonth) => {
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
          summary[r.employeeId].otHours += parseFloat(r.otHours) || 0
        }
      })
      return Object.entries(summary).map(([employeeId, stats]) => ({ employeeId, ...stats }))
    } catch (e) {
      setError(e.message)
      return []
    } finally {
      setLoading(false)
    }
  }

  return { attendance, loading, error, fetchByDate, upsertAttendance, fetchMonthlySummary }
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
  const otHrs = Math.floor(otMins / 60)
  const otRemMins = otMins % 60

  if (isNaN(otHrs) || isNaN(otRemMins)) return '00:00'

  return `${String(otHrs).padStart(2, '0')}:${String(otRemMins).padStart(2, '0')}`
}
