import test from 'node:test'
import assert from 'node:assert/strict'
import {
  getDefaultAdvanceDeductionMonth,
  getAdvanceDeductionMonth,
  isNextMonthPreDisbursementAdvance,
  isAdvanceCandidateForPayroll,
  isAdvanceDeductibleInPayrollMonth,
  getNextMonth,
  getPreviousMonth,
  formatMonthLabel
} from '../src/lib/advanceSalaryUtils.js'

test('isNextMonthPreDisbursementAdvance detects advances taken in next month before salaryDate', () => {
  // Viewing August Salary (2026-08) with salaryDate = 10:
  // Advances taken Sept 1 - Sept 10 were taken before August salary payout
  assert.equal(isNextMonthPreDisbursementAdvance('2026-09-01', '2026-08', 10), true)
  assert.equal(isNextMonthPreDisbursementAdvance('2026-09-10', '2026-08', 10), true)
  assert.equal(isNextMonthPreDisbursementAdvance('2026-09-11', '2026-08', 10), false)
  assert.equal(isNextMonthPreDisbursementAdvance('2026-08-15', '2026-08', 10), false)
})

test('Advance taken on Sept 1st (2026-09-01): can be added to August, but auto-deducts in September unless added to August', () => {
  const advSept1 = { type: 'Advance', date: '2026-09-01', amount: 1000 }

  // 1. In August Salary (2026-08):
  // It IS a candidate (so user can choose to add/deduct it in August)
  assert.equal(isAdvanceCandidateForPayroll(advSept1, '2026-08', 10), true)
  // By default, it is NOT deducted in August (unless user explicitly adds it)
  assert.equal(isAdvanceDeductibleInPayrollMonth(advSept1, '2026-08', 10), false)

  // If user explicitly adds/deducts it in August:
  const advAddedToAugust = { ...advSept1, deductionMonth: '2026-08', deductionRule: 'deduct_this_month' }
  assert.equal(isAdvanceDeductibleInPayrollMonth(advAddedToAugust, '2026-08', 10), true)

  // 2. In September Salary (2026-09):
  // If user did NOT add it to August, it AUTOMATICALLY DEDUCTS in September!
  assert.equal(isAdvanceDeductibleInPayrollMonth(advSept1, '2026-09', 10), true)

  // If user DID add it to August (deductionMonth = '2026-08'), it does NOT deduct in September!
  assert.equal(isAdvanceDeductibleInPayrollMonth(advAddedToAugust, '2026-09', 10), false)
})

test('Advances taken during August auto-deduct in August Salary by default', () => {
  const advAugust = { type: 'Advance', date: '2026-08-15', amount: 5000 }

  assert.equal(isAdvanceCandidateForPayroll(advAugust, '2026-08', 10), true)
  assert.equal(isAdvanceDeductibleInPayrollMonth(advAugust, '2026-08', 10), true)

  // Does NOT deduct in September unless postponed
  assert.equal(isAdvanceDeductibleInPayrollMonth(advAugust, '2026-09', 10), false)

  // If postponed to September:
  const advPostponed = { ...advAugust, deductionMonth: '2026-09', deductionRule: 'postpone' }
  assert.equal(isAdvanceDeductibleInPayrollMonth(advPostponed, '2026-08', 10), false)
  assert.equal(isAdvanceDeductibleInPayrollMonth(advPostponed, '2026-09', 10), true)
})

test('month helpers', () => {
  assert.equal(getNextMonth('2026-08'), '2026-09')
  assert.equal(getNextMonth('2026-12'), '2027-01')
  assert.equal(getPreviousMonth('2026-08'), '2026-07')
  assert.equal(getPreviousMonth('2026-01'), '2025-12')
  assert.equal(formatMonthLabel('2026-08'), 'Aug 2026')
})
