import {
  collection,
  doc,
  getDoc,
  runTransaction,
  serverTimestamp,
} from 'firebase/firestore'
import { db } from './firebase'
import { isPeriodLocked } from './payrollLock'

export const LEAVE_COVERAGE_STATES = Object.freeze({
  ACTIVE: 'active',
  CONFLICT: 'conflict',
  OVERRIDDEN: 'overridden',
  RESCINDED: 'rescinded',
  LOCKED_ADJUSTMENT: 'locked_adjustment',
})

export const DEFAULT_LEAVE_POLICY = Object.freeze({
  expansionMode: 'working_days_only',
  paid: true,
  allowHalfDay: true,
  monthlyRequestWarningThreshold: 3,
  conflictMode: 'review_required',
})

const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']

const toIsoDate = (value) => {
  if (!value) return ''
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) return value
  const date = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

const addDays = (isoDate, days) => {
  const [year, month, date] = isoDate.split('-').map(Number)
  const next = new Date(year, month - 1, date + days)
  return `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, '0')}-${String(next.getDate()).padStart(2, '0')}`
}

const compareIsoDates = (left, right) => left.localeCompare(right)

const localDayOfWeek = (isoDate) => {
  const [year, month, date] = isoDate.split('-').map(Number)
  return new Date(year, month - 1, date).getDay()
}

export const getLeavePolicy = (orgData = {}, leaveType = '') => {
  const policies = orgData.leavePolicies || orgData.leavePolicy?.types || {}
  const requested = policies[leaveType] || policies[String(leaveType || '').trim().toLowerCase()]
  const fallback = policies.default || orgData.leavePolicy?.default || {}
  return { ...DEFAULT_LEAVE_POLICY, ...fallback, ...requested }
}

export const getHolidayCalendarSnapshot = (orgData = {}, month = '') => {
  const snapshot = orgData.holidayCalendarSnapshots?.[month]
  return {
    holidays: Array.isArray(snapshot?.holidays) ? snapshot.holidays : (Array.isArray(orgData.holidays) ? orgData.holidays : []),
    saturdayType: snapshot?.saturdayType || orgData.saturdayType || 'working',
    sundayType: snapshot?.sundayType || orgData.sundayType || 'holiday',
  }
}

const isNonWorkingDate = (isoDate, orgData = {}) => {
  const calendar = getHolidayCalendarSnapshot(orgData, isoDate.slice(0, 7))
  const holidayDates = new Set(calendar.holidays.map((holiday) => holiday?.date).filter(Boolean))
  const day = localDayOfWeek(isoDate)
  if (holidayDates.has(isoDate)) return true
  if (day === 0) return calendar.sundayType !== 'working'
  if (day === 6) return calendar.saturdayType !== 'working'
  return false
}

const isBridgedNonWorkingDate = (isoDate, fromDate, toDate, orgData) => {
  if (!isNonWorkingDate(isoDate, orgData)) return false
  let previous = addDays(isoDate, -1)
  let next = addDays(isoDate, 1)
  while (compareIsoDates(previous, fromDate) >= 0 && isNonWorkingDate(previous, orgData)) previous = addDays(previous, -1)
  while (compareIsoDates(next, toDate) <= 0 && isNonWorkingDate(next, orgData)) next = addDays(next, 1)
  return compareIsoDates(previous, fromDate) >= 0 && compareIsoDates(next, toDate) <= 0
}

export const buildLeaveCoverageCandidates = ({ fromDate, toDate, leaveType, requestedUnits, orgData = {} }) => {
  const start = toIsoDate(fromDate)
  const end = toIsoDate(toDate || fromDate)
  if (!start || !end || compareIsoDates(start, end) > 0) return []

  const policy = getLeavePolicy(orgData, leaveType)
  const partial = Number(requestedUnits)
  const isHalfDay = partial === 0.5 && start === end
  const result = []
  let current = start

  while (compareIsoDates(current, end) <= 0) {
    const nonWorking = isNonWorkingDate(current, orgData)
    const include = policy.expansionMode === 'calendar_days'
      || (!nonWorking)
      || (policy.expansionMode === 'sandwich_when_bridged' && isBridgedNonWorkingDate(current, start, end, orgData))

    if (include) {
      const leaveUnits = isHalfDay ? 0.5 : 1
      result.push({
        date: current,
        leaveUnits,
        workUnits: isHalfDay ? 0.5 : 0,
        classification: policy.paid === false || policy.paidBehavior === 'unpaid' || policy.paidBehavior === 'lop'
          ? (policy.paidBehavior === 'lop' ? 'lop_leave' : 'unpaid_leave')
          : (isHalfDay ? 'half_paid_leave' : 'paid_leave'),
        segments: isHalfDay
          ? [
              { part: 'first_half', classification: policy.paid === false ? 'half_unpaid_leave' : 'paid_leave', units: 0.5 },
              { part: 'second_half', classification: 'unresolved_work', units: 0.5 },
            ]
          : [],
        policySnapshot: {
          expansionMode: policy.expansionMode,
          paid: policy.paid !== false,
          month: current.slice(0, 7),
        },
      })
    }
    current = addDays(current, 1)
  }

  return result
}

export const coverageDocId = (employeeId, isoDate) => `${employeeId}_${isoDate.replaceAll('-', '')}`
export const coverageEventKey = (requestId, isoDate, leaveType, eventType) => `${requestId}:${isoDate}:${leaveType || 'General'}:${eventType}`

const coverageDoc = (orgId, employeeId, date) => doc(db, 'organisations', orgId, 'leave_attendance_coverage', coverageDocId(employeeId, date))
const ledgerDoc = (orgId, employeeId, eventKey) => doc(db, 'organisations', orgId, 'employees', employeeId, 'leave_ledger', eventKey.replaceAll(':', '_'))
const lifecycleEventDoc = (orgId, eventKey) => doc(db, 'organisations', orgId, 'leave_lifecycle_events', eventKey.replaceAll(':', '_'))

const activeCoverageConflict = (existing, requestId) => existing?.state === LEAVE_COVERAGE_STATES.ACTIVE && existing?.requestId && existing.requestId !== requestId

export const hasLeaveCoverageConflict = (attendanceRecord = {}, coverage = {}) => {
  if (!coverage || ![LEAVE_COVERAGE_STATES.ACTIVE, LEAVE_COVERAGE_STATES.CONFLICT].includes(coverage.state)) return false
  const status = String(attendanceRecord.status || '').toLowerCase()
  const hasPunch = Boolean(
    (attendanceRecord.inTime && attendanceRecord.inTime !== 'Absent' && attendanceRecord.inTime !== '-')
    || attendanceRecord.checkIn
  )
  return hasPunch || ['worked', 'present', 'half-day'].includes(status)
}

export const requiresApprovedLeaveOverride = (coverage = null, attendanceRow = {}) => (
  coverage?.state === LEAVE_COVERAGE_STATES.ACTIVE && attendanceRow?.leaveOverride?.confirmed !== true
)

export const approvedLeaveOverrideMessage = (coverage = {}, date = '') => (
  `Approved ${coverage?.leaveType || ''} leave exists for ${date}. Attendance is protected until HR or Admin confirms an override with a reason.`
)

export const resolveDailyClassification = ({ attendanceRecord = {}, coverage = null }) => {
  if (!coverage || coverage.state === LEAVE_COVERAGE_STATES.RESCINDED || coverage.state === LEAVE_COVERAGE_STATES.LOCKED_ADJUSTMENT) {
    return { source: 'attendance', classification: String(attendanceRecord.status || '').toLowerCase() || null, leaveUnits: 0, workUnits: 0 }
  }
  if (coverage.state === LEAVE_COVERAGE_STATES.OVERRIDDEN) {
    return { source: 'override', classification: coverage.override?.replacementClassification || 'worked', leaveUnits: Number(coverage.leaveUnits || 0), workUnits: Number(coverage.workUnits || 0) }
  }
  return { source: 'leave_coverage', classification: coverage.classification, leaveUnits: Number(coverage.leaveUnits || 0), workUnits: Number(coverage.workUnits || 0), conflict: coverage.state === LEAVE_COVERAGE_STATES.CONFLICT }
}

export const createApprovedLeaveCoverage = async ({ orgId, requestId, actor, requestData }) => {
  if (!orgId || !requestId || !requestData?.employeeId) return { coverageIds: [], leaveUnits: 0 }
  const months = new Set()
  const start = toIsoDate(requestData.fromDate)
  const end = toIsoDate(requestData.toDate || requestData.fromDate)
  let cursor = start
  while (cursor && end && compareIsoDates(cursor, end) <= 0) {
    months.add(cursor.slice(0, 7))
    cursor = addDays(cursor, 1)
  }
  for (const month of months) {
    if (await isPeriodLocked(orgId, month)) throw new Error(`Cannot approve leave: ${MONTH_NAMES[Number(month.slice(5, 7)) - 1]} ${month.slice(0, 4)} payroll is locked.`)
  }

  return runTransaction(db, async (transaction) => {
    const orgRef = doc(db, 'organisations', orgId)
    const empRef = doc(db, 'organisations', orgId, 'employees', requestData.employeeId)
    const [orgSnap, empSnap] = await Promise.all([transaction.get(orgRef), transaction.get(empRef)])
    const orgData = orgSnap.exists() ? orgSnap.data() : {}
    const employee = empSnap.exists() ? empSnap.data() : {}
    const policy = { ...getLeavePolicy(orgData, requestData.leaveType), ...(requestData.leavePolicySnapshot || {}) }
    const coverageOrgData = {
      ...orgData,
      leavePolicies: {
        ...(orgData.leavePolicies || {}),
        [requestData.leaveType]: policy,
      },
    }
    const candidates = buildLeaveCoverageCandidates({
      fromDate: requestData.fromDate,
      toDate: requestData.toDate,
      leaveType: requestData.leaveType,
      requestedUnits: requestData.requestedUnits || requestData.duration,
      orgData: coverageOrgData,
    })

    const coverageReads = await Promise.all(candidates.map((candidate) => transaction.get(coverageDoc(orgId, requestData.employeeId, candidate.date))))
    coverageReads.forEach((snap, index) => {
      if (snap.exists() && activeCoverageConflict(snap.data(), requestId)) {
        throw new Error(`Cannot approve leave: active leave coverage already exists for ${candidates[index].date}.`)
      }
    })

    const paidUnits = candidates.reduce((sum, candidate) => sum + (candidate.classification.includes('paid') ? candidate.leaveUnits : 0), 0)
    const coverageIds = []
    candidates.forEach((candidate) => {
      const id = coverageDocId(requestData.employeeId, candidate.date)
      const ref = coverageDoc(orgId, requestData.employeeId, candidate.date)
      const eventKey = coverageEventKey(requestId, candidate.date, requestData.leaveType, 'coverage_create')
      coverageIds.push(id)
      transaction.set(ref, {
        employeeId: requestData.employeeId,
        date: candidate.date,
        requestId,
        leaveType: requestData.leaveType || 'General',
        classification: candidate.classification,
        leaveUnits: candidate.leaveUnits,
        workUnits: candidate.workUnits,
        segments: candidate.segments,
        state: LEAVE_COVERAGE_STATES.ACTIVE,
        source: 'leave_approval',
        revision: 1,
        policyVersion: requestData.leavePolicyVersion || orgData.leavePolicyVersion || 'v1',
        policySnapshot: candidate.policySnapshot,
        idempotencyKey: eventKey,
        generatedAt: serverTimestamp(),
        generatedBy: actor?.uid || 'system',
        updatedAt: serverTimestamp(),
      }, { merge: true })
      const coverageEventRef = lifecycleEventDoc(orgId, eventKey)
      transaction.set(coverageEventRef, {
        eventKey,
        requestId,
        employeeId: requestData.employeeId,
        coverageId: id,
        eventType: 'coverage_create',
        createdAt: serverTimestamp(),
        createdBy: actor?.uid || 'system',
      }, { merge: true })

      if (candidate.classification.includes('paid')) {
        const ledgerKey = coverageEventKey(requestId, candidate.date, requestData.leaveType, 'approved_leave')
        transaction.set(ledgerDoc(orgId, requestData.employeeId, ledgerKey), {
          employeeId: requestData.employeeId,
          leaveType: requestData.leaveType || 'General',
          quantity: -candidate.leaveUnits,
          source: 'approved_leave',
          requestId,
          coverageId: id,
          effectiveDate: candidate.date,
          policyVersion: requestData.leavePolicyVersion || orgData.leavePolicyVersion || 'v1',
          idempotencyKey: ledgerKey,
          createdAt: serverTimestamp(),
          createdBy: actor?.uid || 'system',
        }, { merge: true })
      }
    })

    const requestRef = doc(db, 'organisations', orgId, 'requests', requestId)
    transaction.update(requestRef, {
      coverageStatus: LEAVE_COVERAGE_STATES.ACTIVE,
      coverageIds,
      coverageDates: candidates.map((candidate) => candidate.date),
      approvedLeaveUnits: paidUnits,
      leavePolicyVersion: requestData.leavePolicyVersion || orgData.leavePolicyVersion || 'v1',
      finalisedAt: serverTimestamp(),
      finalisedBy: actor?.uid || 'system',
      updatedAt: serverTimestamp(),
    })

    if (!requestData.legacyBalanceDebitedAt && paidUnits > 0) {
      transaction.update(empRef, {
        leaveBalance: Math.max(0, Number(employee.leaveBalance || 0) - paidUnits),
        leaveBalanceUpdatedAt: serverTimestamp(),
      })
      transaction.update(requestRef, { legacyBalanceDebitedAt: serverTimestamp(), legacyBalanceDebitedUnits: paidUnits })
    }

    return { coverageIds, leaveUnits: paidUnits, policy }
  })
}

export const rescindApprovedLeaveCoverage = async ({ orgId, requestId, actor, requestData, reason = 'leave_cancelled' }) => {
  if (!orgId || !requestId || !requestData?.employeeId) return { rescinded: 0 }
  const coverageDates = Array.isArray(requestData.coverageDates) ? requestData.coverageDates : []
  for (const date of coverageDates) {
    if (await isPeriodLocked(orgId, date.slice(0, 7))) throw new Error(`Cannot change leave: ${date.slice(0, 7)} payroll is locked.`)
  }

  return runTransaction(db, async (transaction) => {
    const empRef = doc(db, 'organisations', orgId, 'employees', requestData.employeeId)
    const requestRef = doc(db, 'organisations', orgId, 'requests', requestId)
    const [employeeSnap, ...coverageSnaps] = await Promise.all([
      transaction.get(empRef),
      ...coverageDates.map((date) => transaction.get(coverageDoc(orgId, requestData.employeeId, date))),
    ])
    const employee = employeeSnap.exists() ? employeeSnap.data() : {}
    let creditUnits = 0
    coverageSnaps.forEach((snap, index) => {
      if (!snap.exists()) return
      const coverage = snap.data()
      if (coverage.requestId !== requestId || coverage.state !== LEAVE_COVERAGE_STATES.ACTIVE) return
      const date = coverageDates[index]
      transaction.set(snap.ref, {
        state: LEAVE_COVERAGE_STATES.RESCINDED,
        rescindedAt: serverTimestamp(),
        rescindedBy: actor?.uid || 'system',
        rescindReason: reason,
        updatedAt: serverTimestamp(),
      }, { merge: true })
      if (coverage.classification?.includes('paid')) {
        creditUnits += Number(coverage.leaveUnits || 0)
        const ledgerKey = coverageEventKey(requestId, date, requestData.leaveType, 'leave_cancelled')
        transaction.set(ledgerDoc(orgId, requestData.employeeId, ledgerKey), {
          employeeId: requestData.employeeId,
          leaveType: requestData.leaveType || 'General',
          quantity: Number(coverage.leaveUnits || 0),
          source: 'leave_cancelled',
          requestId,
          coverageId: snap.id,
          effectiveDate: date,
          idempotencyKey: ledgerKey,
          createdAt: serverTimestamp(),
          createdBy: actor?.uid || 'system',
        }, { merge: true })
      }
    })
    transaction.update(requestRef, { coverageStatus: LEAVE_COVERAGE_STATES.RESCINDED, updatedAt: serverTimestamp(), updatedBy: actor?.uid || 'system' })
    if (requestData.legacyBalanceDebitedAt && creditUnits > 0) {
      transaction.update(empRef, { leaveBalance: Number(employee.leaveBalance || 0) + creditUnits, leaveBalanceUpdatedAt: serverTimestamp() })
    }
    return { rescinded: coverageSnaps.length, creditUnits }
  })
}

export const overrideActiveLeaveCoverage = async ({ orgId, employeeId, date, actor, replacementClassification, reason }) => {
  if (!orgId || !employeeId || !date) throw new Error('Leave override requires employee and date.')
  if (!reason?.trim()) throw new Error('A reason is required to override approved leave.')
  if (!['admin', 'hr'].includes(String(actor?.role || '').toLowerCase())) {
    throw new Error('Only HR or Admin can override approved leave coverage.')
  }
  if (await isPeriodLocked(orgId, date.slice(0, 7))) {
    throw new Error(`Cannot override leave: ${date.slice(0, 7)} payroll is locked.`)
  }

  return runTransaction(db, async (transaction) => {
    const coverageRef = coverageDoc(orgId, employeeId, date)
    const coverageSnap = await transaction.get(coverageRef)
    if (!coverageSnap.exists()) return { overridden: false }
    const coverage = coverageSnap.data()
    if (coverage.state !== LEAVE_COVERAGE_STATES.ACTIVE) return { overridden: false, state: coverage.state }

    const revision = Number(coverage.revision || 1) + 1
    transaction.update(coverageRef, {
      state: LEAVE_COVERAGE_STATES.OVERRIDDEN,
      revision,
      override: {
        replacementClassification,
        reason: reason.trim(),
        overriddenBy: actor.uid,
        overriddenAt: serverTimestamp(),
      },
      updatedAt: serverTimestamp(),
    })
    const revisionRef = doc(coverageRef, 'revisions', `override_${revision}`)
    transaction.set(revisionRef, {
      revision,
      previousState: LEAVE_COVERAGE_STATES.ACTIVE,
      nextState: LEAVE_COVERAGE_STATES.OVERRIDDEN,
      source: 'attendance_override',
      replacementClassification,
      reason: reason.trim(),
      changedAt: serverTimestamp(),
      changedBy: actor.uid,
      idempotencyKey: coverageEventKey(coverage.requestId, date, coverage.leaveType, 'worked_override_credit'),
    })

    if (replacementClassification === 'worked' && String(coverage.classification || '').includes('paid')) {
      const ledgerKey = coverageEventKey(coverage.requestId, date, coverage.leaveType, 'worked_override_credit')
      transaction.set(ledgerDoc(orgId, employeeId, ledgerKey), {
        employeeId,
        leaveType: coverage.leaveType || 'General',
        quantity: Number(coverage.leaveUnits || 0),
        source: 'worked_override_credit',
        requestId: coverage.requestId,
        coverageId: coverageRef.id,
        effectiveDate: date,
        idempotencyKey: ledgerKey,
        createdAt: serverTimestamp(),
        createdBy: actor.uid,
      }, { merge: true })
    }
    return { overridden: true, coverage }
  })
}
