import test from 'node:test'
import assert from 'node:assert/strict'
import { calculateChargeableLateMinutes, DEFAULT_ATTENDANCE_POLICY, normalizeAttendancePolicy } from '../src/lib/attendancePolicy.js'

test('attendance policy remains draft by default and preserves nested defaults for legacy settings', () => {
  const policy = normalizeAttendancePolicy({ gracePeriod: { arrivalMinutes: 20 } })
  assert.equal(DEFAULT_ATTENDANCE_POLICY.status, 'draft')
  assert.equal(policy.status, 'draft')
  assert.equal(policy.gracePeriod.arrivalMinutes, 20)
  assert.equal(policy.latePenalty.enabled, false)
})

test('arrival grace reduces only the report preview value and never below zero', () => {
  assert.equal(calculateChargeableLateMinutes({ rawLateMinutes: 32, arrivalGraceMinutes: 15 }), 17)
  assert.equal(calculateChargeableLateMinutes({ rawLateMinutes: 9, arrivalGraceMinutes: 15 }), 0)
  assert.equal(calculateChargeableLateMinutes({ rawLateMinutes: -5, arrivalGraceMinutes: 0 }), 0)
})
