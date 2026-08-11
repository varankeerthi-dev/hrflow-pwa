import { useState, useCallback } from 'react'
import { getDocs, query, where, setDoc, deleteDoc, serverTimestamp, getDoc, doc, collection } from 'firebase/firestore'
import { attendanceCol, attendanceDoc } from '../lib/firestore'
import { db } from '../lib/firebase'
import { useAuth } from './useAuth'
import { isPeriodLocked } from '../lib/payrollLock'

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
    
    // Check locking periods
    for (const row of rows) {
      const rowDate = row.date || row.inDate
      if (rowDate && await isPeriodLocked(orgId, rowDate)) {
        throw new Error(`Cannot save attendance: The period for ${rowDate.substring(0, 7)} is locked under a finalized Payroll run.`);
      }
    }
    
    const batch = rows.map(row => {
      const rowDate = row.date || row.inDate
      const payload = {
        ...row,
        date: rowDate,
        isAbsent: !!row.isAbsent,
        sundayWorked: !!row.sundayWorked,
        sundayHoliday: !!row.sundayHoliday,
        updatedAt: serverTimestamp(),
        updatedBy: user?.uid || 'system',
        updatedByName: user?.name || 'System'
      }
      
      // Remove any undefined fields to prevent Firebase errors
      Object.keys(payload).forEach(key => {
        if (payload[key] === undefined) {
          delete payload[key]
        }
      })

      return setDoc(attendanceDoc(orgId, rowDate, row.employeeId), payload, { merge: true })
    })
    await Promise.all(batch)
  }, [orgId, user])

  const fetchMonthlySummary = useCallback(async (yearMonth) => {
    if (!orgId || !yearMonth) return []
    setLoading(true)
    try {
      const [orgSnap, otAdjSnap] = await Promise.all([
        getDoc(doc(db, 'organisations', orgId)),
        getDocs(query(collection(db, 'organisations', orgId, 'otAdjustments'), where('month', '==', yearMonth)))
      ])
      const orgData = orgSnap.exists() ? orgSnap.data() : {}
      const holidayList = Array.isArray(orgData.holidays) ? orgData.holidays : []
      const holidayDates = new Set(holidayList.map(h => h.date).filter(Boolean))
      const otAdjs = otAdjSnap.docs.reduce((acc, d) => { acc[d.data().employeeId] = d.data().adjustment; return acc; }, {})

      const normalizeDate = (dateStr) => {
        if (!dateStr || dateStr === '-') return null;
        if (typeof dateStr !== 'string') {
          if (dateStr?.seconds) dateStr = new Date(dateStr.seconds * 1000).toISOString().split('T')[0];
          else if (dateStr instanceof Date) dateStr = dateStr.toISOString().split('T')[0];
          else dateStr = String(dateStr);
        }
        const str = String(dateStr).trim();
        if (/^\d{4}-\d{2}-\d{2}$/.test(str)) return str;
        const parts = str.split(/[-/]/);
        if (parts.length === 3) {
          let y, m, d;
          if (parts[0].length === 4) {
            y = parts[0]; m = parts[1]; d = parts[2];
          } else {
            d = parts[0]; m = parts[1]; y = parts[2];
          }
          return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
        }
        try {
          const date = new Date(str);
          if (!isNaN(date.getTime())) {
            return date.toISOString().split('T')[0];
          }
        } catch (e) {}
        return str;
      };

      const snapshot = await getDocs(attendanceCol(orgId))
      const records = snapshot.docs
        .map(d => d.data())
        .filter(r => {
          const recDate = r.date || r.inDate;
          const nd = normalizeDate(recDate);
          return nd && nd.startsWith(yearMonth);
        })

      const summary = {}
      records.forEach(r => {
        const empId = String(r.employeeId || r.empId || '').trim();
        if (!summary[empId]) {
          summary[empId] = { present: 0, absent: 0, otHours: 0, holidayWorked: 0, holidayCount: 0, sunWorked: 0, sunCount: 0, otAdjustment: otAdjs[empId] || 0 }
        }
        const recDate = r.date || r.inDate;
        const normDate = normalizeDate(recDate);
        const [y, m, day] = normDate.split('-').map(Number)
        const d = new Date(y, m - 1, day)
        const isS = d.getDay() === 0
        const isH = holidayDates.has(normDate) && !isS
        const status = String(r.status || '').toLowerCase()
        const hasTime = !!(r.inTime && r.inTime !== 'Absent' && r.inTime !== '-') || !!(r.checkIn && r.checkIn !== 'Absent')
        const isExplicitAbsent = (r.isAbsent || status === 'absent') && !hasTime
        const isPresent = (status === 'worked' || status === 'present' || r.checkIn || hasTime || r.sundayWorked || r.holidayWorked || status === 'sunworked') && !isExplicitAbsent

        if (isS) summary[empId].sunCount++
        if (isH) summary[empId].holidayCount++

        if (isExplicitAbsent) {
          summary[empId].absent++
        } else if (r.isHalfDay || r.status === 'Half-Day') {
          summary[empId].absent += 0.5
          if (isS) summary[empId].sunWorked += 0.5;
          else if (isH) summary[empId].holidayWorked += 0.5;
          else summary[empId].present += 0.5;
        } else {
          if (isS) {
            if (isPresent) summary[empId].sunWorked++
          } else if (isH) {
            if (isPresent) summary[empId].holidayWorked++
          } else if (isPresent) {
            summary[empId].present++
          }
        }
        if (r.otHours) {
          const [h, mi] = r.otHours.split(':').map(Number)
          if (!isNaN(h) && !isNaN(mi)) {
            summary[empId].otHours += h + mi / 60
          }
        }
      })
      return Object.entries(summary).map(([employeeId, data]) => ({ employeeId, ...data }))
    } catch (e) {
      console.error(e)
      return []
    } finally {
      setLoading(false)
    }
  }, [orgId])

  const deleteByDate = useCallback(async (date) => {
    if (!orgId || !date) return
    if (await isPeriodLocked(orgId, date)) {
      throw new Error(`Cannot delete attendance: The period for ${date.substring(0, 7)} is locked under a finalized Payroll run.`);
    }
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
    if (await isPeriodLocked(orgId, date)) {
      throw new Error(`Cannot delete attendance: The period for ${date.substring(0, 7)} is locked under a finalized Payroll run.`);
    }
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
    if (await isPeriodLocked(orgId, effectiveDate)) {
      throw new Error(`Cannot recalculate OT: The period for ${effectiveDate.substring(0, 7)} is locked under a finalized Payroll run.`);
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
  
  // Round to nearest 5 minutes
  const roundedOtMins = Math.round(rawOtMins / 5) * 5
  
  const otHrs = Math.floor(roundedOtMins / 60)
  const otRemMins = roundedOtMins % 60

  if (isNaN(otHrs) || isNaN(otRemMins)) return '00:00'

  return `${String(otHrs).padStart(2, '0')}:${String(otRemMins).padStart(2, '0')}`
}
