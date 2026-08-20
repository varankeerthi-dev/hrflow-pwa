import assert from 'node:assert/strict'
import test from 'node:test'

import {
  LEAVE_COVERAGE_STATES,
  approvedLeaveOverrideMessage,
  buildLeaveCoverageCandidates,
  coverageDocId,
  coverageEventKey,
  getLeavePolicy,
  hasLeaveCoverageConflict,
  requiresApprovedLeaveOverride,
  resolveDailyClassification,
} from '../src/lib/leaveLifecycle.js'

const workingCalendar = {
  saturdayType: 'working',
  sundayType: 'holiday',
  holidays: [],
}

test('creates paid coverage for working days and excludes Sundays by default', () => {
  const candidates = buildLeaveCoverageCandidates({
    fromDate: '2026-08-14',
    toDate: '2026-08-17',
    leaveType: 'Casual',
    requestedUnits: 4,
    orgData: { ...workingCalendar, leavePolicies: { Casual: { paid: true } } },
  })

  assert.deepEqual(candidates.map((candidate) => candidate.date), ['2026-08-14', '2026-08-15', '2026-08-17'])
  assert.ok(candidates.every((candidate) => candidate.classification === 'paid_leave'))
  assert.equal(candidates.reduce((total, candidate) => total + candidate.leaveUnits, 0), 3)
})

test('applies sandwich expansion across bridged non-working dates', () => {
  const candidates = buildLeaveCoverageCandidates({
    fromDate: '2026-08-14',
    toDate: '2026-08-17',
    leaveType: 'Privilege',
    requestedUnits: 4,
    orgData: { ...workingCalendar, leavePolicies: { Privilege: { expansionMode: 'sandwich_when_bridged' } } },
  })

  assert.deepEqual(candidates.map((candidate) => candidate.date), ['2026-08-14', '2026-08-15', '2026-08-16', '2026-08-17'])
})

test('classifies half-day paid and unpaid policy coverage correctly', () => {
  const paid = buildLeaveCoverageCandidates({
    fromDate: '2026-08-18', toDate: '2026-08-18', leaveType: 'Sick', requestedUnits: 0.5,
    orgData: { ...workingCalendar, leavePolicies: { Sick: { paid: true, allowHalfDay: true } } },
  })[0]
  const unpaid = buildLeaveCoverageCandidates({
    fromDate: '2026-08-18', toDate: '2026-08-18', leaveType: 'Unpaid', requestedUnits: 0.5,
    orgData: { ...workingCalendar, leavePolicies: { Unpaid: { paid: false, paidBehavior: 'unpaid', allowHalfDay: true } } },
  })[0]

  assert.equal(paid.classification, 'half_paid_leave')
  assert.equal(paid.leaveUnits, 0.5)
  assert.equal(paid.workUnits, 0.5)
  assert.equal(unpaid.classification, 'unpaid_leave')
})

test('honours explicit request policy snapshots over later organisation defaults', () => {
  const orgData = { leavePolicies: { Casual: { paid: false, expansionMode: 'calendar_days' } } }
  const snapshot = { ...getLeavePolicy(orgData, 'Casual'), paid: true, expansionMode: 'working_days_only' }
  const candidates = buildLeaveCoverageCandidates({
    fromDate: '2026-08-14', toDate: '2026-08-16', leaveType: 'Casual', requestedUnits: 3,
    orgData: { ...workingCalendar, leavePolicies: { Casual: snapshot } },
  })

  assert.equal(candidates.length, 2)
  assert.ok(candidates.every((candidate) => candidate.classification === 'paid_leave'))
})

test('resolves active, overridden, and rescinded coverage independently from legacy attendance', () => {
  const activeCoverage = { state: LEAVE_COVERAGE_STATES.ACTIVE, classification: 'paid_leave', leaveUnits: 1, workUnits: 0 }
  const overriddenCoverage = { state: LEAVE_COVERAGE_STATES.OVERRIDDEN, leaveUnits: 1, workUnits: 0, override: { replacementClassification: 'worked' } }
  const rescindedCoverage = { state: LEAVE_COVERAGE_STATES.RESCINDED, leaveUnits: 1 }

  assert.deepEqual(resolveDailyClassification({ attendanceRecord: { status: 'Absent' }, coverage: activeCoverage }), { source: 'leave_coverage', classification: 'paid_leave', leaveUnits: 1, workUnits: 0, conflict: false })
  assert.equal(resolveDailyClassification({ attendanceRecord: { status: 'Absent' }, coverage: overriddenCoverage }).classification, 'worked')
  assert.equal(resolveDailyClassification({ attendanceRecord: { status: 'Present' }, coverage: rescindedCoverage }).source, 'attendance')
})

test('requires explicit override for active leave and detects attendance conflicts', () => {
  const coverage = { state: LEAVE_COVERAGE_STATES.ACTIVE, leaveType: 'Casual' }

  assert.equal(requiresApprovedLeaveOverride(coverage, { status: 'Present' }), true)
  assert.equal(requiresApprovedLeaveOverride(coverage, { leaveOverride: { confirmed: true, reason: 'Worked at site' } }), false)
  assert.equal(requiresApprovedLeaveOverride({ state: LEAVE_COVERAGE_STATES.OVERRIDDEN }, {}), false)
  assert.equal(hasLeaveCoverageConflict({ status: 'Present', inTime: '09:00' }, coverage), true)
  assert.equal(hasLeaveCoverageConflict({ status: 'Absent' }, coverage), false)
  assert.match(approvedLeaveOverrideMessage(coverage, '2026-08-18'), /Approved Casual leave exists for 2026-08-18/)
})

test('uses deterministic coverage and lifecycle event identifiers for idempotent retries', () => {
  assert.equal(coverageDocId('emp_101', '2026-08-18'), 'emp_101_20260818')
  assert.equal(coverageEventKey('request_01', '2026-08-18', 'Casual', 'leave_debit'), 'request_01:2026-08-18:Casual:leave_debit')
})
