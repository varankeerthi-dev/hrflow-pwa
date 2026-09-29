import assert from 'node:assert/strict'
import test from 'node:test'

import {
  applyEntitlementLimit,
  calculateAccruedEntitlement,
  calculateLeaveBalance,
  calculateUnpaidSalaryImpact,
  getConfiguredLeaveTypes,
  getLeavePolicyForDate,
  normalizeLeaveTypeCode,
} from '../src/lib/leaveEntitlements.js'

test('keeps legacy leave labels readable through stable type aliases', () => {
  assert.equal(normalizeLeaveTypeCode('Casual'), 'casual')
  assert.equal(normalizeLeaveTypeCode('CL'), 'casual')
  assert.equal(normalizeLeaveTypeCode('Privilege'), 'privilege')
  assert.equal(normalizeLeaveTypeCode('EL'), 'privilege')
  assert.equal(normalizeLeaveTypeCode('Annual'), 'privilege')
  assert.equal(normalizeLeaveTypeCode('LOP'), 'lop')
})

test('exposes active built-in and employer-defined leave types with stable codes', () => {
  const types = getConfiguredLeaveTypes({ leaveTypes: [
    { code: 'volunteer_day', name: 'Volunteer Day', aliases: ['Community Leave'] },
    { code: 'sick', name: 'Sick Leave', enabled: false },
  ] })
  assert.ok(types.some((type) => type.code === 'casual'))
  assert.ok(types.some((type) => type.code === 'volunteer_day'))
  assert.ok(!types.some((type) => type.name === 'Sick Leave'))
  assert.equal(normalizeLeaveTypeCode('Community Leave', types), 'volunteer_day')
})

test('calculates monthly entitlement on effective-date anniversaries with month-end clamping', () => {
  const result = calculateAccruedEntitlement({
    leavePolicies: { Casual: { entitlementCadence: 'monthly', entitlementAmount: 1.25, effectiveFrom: '2024-01-31' } },
  }, 'CL', '2024-03-31')
  assert.equal(result.units, 2.5)
  assert.deepEqual(result.grants.map((grant) => grant.effectiveDate), ['2024-02-29', '2024-03-31'])
  assert.equal(calculateAccruedEntitlement({ leavePolicies: { Casual: { entitlementCadence: 'monthly', entitlementAmount: 1, effectiveFrom: '2024-01-31' } } }, 'Casual', '2024-02-28').units, 0)
})

test('calculates annual grants only after each completed effective-date anniversary', () => {
  const orgData = { leavePolicies: { Sick: { entitlementCadence: 'annual', entitlementAmount: 12, effectiveFrom: '2024-02-29' } } }
  assert.equal(calculateAccruedEntitlement(orgData, 'Sick', '2025-02-27').units, 0)
  assert.equal(calculateAccruedEntitlement(orgData, 'Sick', '2025-02-28').units, 12)
})

test('applies effective-dated policy versions without retroactively changing prior accruals', () => {
  const orgData = {
    leavePolicyVersions: [
      { leaveTypeCode: 'casual', effectiveFrom: '2024-01-01', version: 1, policy: { entitlementCadence: 'monthly', entitlementAmount: 1, effectiveFrom: '2024-01-01' } },
      { leaveTypeCode: 'casual', effectiveFrom: '2024-03-15', version: 2, policy: { entitlementCadence: 'monthly', entitlementAmount: 2, effectiveFrom: '2024-03-15' } },
    ],
    leavePolicies: { Casual: { entitlementCadence: 'monthly', entitlementAmount: 2, effectiveFrom: '2024-03-15' } },
  }
  const result = calculateAccruedEntitlement(orgData, 'CL', '2024-04-15')
  assert.equal(result.units, 4)
  assert.deepEqual(result.grants.map((grant) => grant.quantity), [1, 1, 2])
})

test('does not activate a future-published policy before its effective date', () => {
  const orgData = {
    leavePolicies: { Casual: { paid: false, entitlementCadence: 'monthly', entitlementAmount: 2, effectiveFrom: '2024-03-01' } },
    leavePolicyVersions: [{ leaveTypeCode: 'casual', effectiveFrom: '2024-03-01', version: 1, policy: { paid: false, entitlementCadence: 'monthly', entitlementAmount: 2, effectiveFrom: '2024-03-01' } }],
  }
  assert.deepEqual(getLeavePolicyForDate(orgData, 'Casual', '2024-02-29'), {})
  assert.equal(getLeavePolicyForDate(orgData, 'Casual', '2024-03-01').paid, false)
  assert.equal(calculateLeaveBalance({ orgData, leaveType: 'Casual', asOf: '2024-02-29' }).configured, false)
})

test('calculates per-type balance with opening entries, reversals and pending requests', () => {
  const orgData = { leavePolicies: { Casual: { entitlementCadence: 'monthly', entitlementAmount: 1, effectiveFrom: '2024-01-01' } } }
  const balance = calculateLeaveBalance({
    orgData,
    leaveType: 'CL',
    asOf: '2024-03-01',
    ledgerEntries: [
      { leaveType: 'Casual', quantity: 4, source: 'opening_balance' },
      { leaveType: 'CL', quantity: -3, source: 'approved_leave' },
      { leaveType: 'Casual', quantity: 1, source: 'leave_cancelled' },
    ],
    requests: [
      { leaveType: 'Casual', status: 'Pending', coveragePreview: [{ leaveUnits: 1 }] },
      { leaveType: 'Sick', status: 'Pending', requestedUnits: 2 },
      { leaveType: 'Casual', status: 'Rejected', requestedUnits: 9 },
    ],
  })
  assert.equal(balance.accrued, 2)
  assert.equal(balance.opening, 4)
  assert.equal(balance.used, 2)
  assert.equal(balance.pending, 1)
  assert.equal(balance.available, 3)
  assert.equal(balance.overEntitlement, 0)
})

test('does not treat an unconfigured legacy scalar as a per-type balance', () => {
  const balance = calculateLeaveBalance({ orgData: {}, leaveType: 'Casual', ledgerEntries: [], requests: [] })
  assert.equal(balance.configured, false)
  assert.equal(balance.available, null)
})

test('applies explicit unpaid shortfall without hiding the paid units available', () => {
  const result = applyEntitlementLimit([
    { date: '2026-01-01', leaveUnits: 1, classification: 'paid_leave', policySnapshot: { paidBehavior: 'unpaid' } },
    { date: '2026-01-02', leaveUnits: 1, classification: 'paid_leave', policySnapshot: { paidBehavior: 'unpaid' } },
  ], 1.5, 'unpaid_shortfall')
  assert.equal(result.paidUnits, 1.5)
  assert.equal(result.unpaidShortfallUnits, 0.5)
  assert.equal(result.candidates[1].classification, 'mixed_leave')
  assert.deepEqual(result.candidates[1].segments.map((segment) => segment.units), [0.5, 0.5])
})

test('uses payroll basic and HRA proration to estimate an explicit unpaid shortfall', () => {
  assert.equal(calculateUnpaidSalaryImpact({ units: 1, monthlySalary: 30000, basicPercent: 40, hraPercent: 20, monthDays: 30 }), 600)
  assert.equal(calculateUnpaidSalaryImpact({ units: 0.5, monthlySalary: 30000, basicPercent: 40, hraPercent: 20, monthDays: 30 }), 300)
  assert.equal(calculateUnpaidSalaryImpact({ units: 1, monthlySalary: null }), null)
})
