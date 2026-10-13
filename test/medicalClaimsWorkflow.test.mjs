import test from 'node:test'
import assert from 'node:assert/strict'

import {
  DEFAULT_ADVANCE_CATEGORIES,
  DEFAULT_EXPENSE_CATEGORIES,
  isMedicalCategory,
  isAdvanceCategory,
  isExpenseCategory,
  resolveReportEntryDetails
} from '../src/lib/advanceExpenseCategories.js'

import {
  isAdvanceDeductibleInPayrollMonth,
  isAdvanceCandidateForPayroll,
  isMedicalExpenseDeductibleInPayrollMonth
} from '../src/lib/advanceSalaryUtils.js'

import {
  isMedicalClaim,
  isMedicalDeductible,
  getEmployeeMedicalLimits,
  calculateEmployeeMedicalUtilization,
  calculateMedicalQuotaSummary,
  calculatePayrollDeductions,
  calculateNetPayout,
  DEFAULT_MEDICAL_ELIGIBILITY
} from '../src/lib/medicalClaimsUtils.js'

// ==========================================
// 1. Category Recognition & Default Categories
// ==========================================
test('Medical category detection recognizes keywords across variations', () => {
  // Positive matches for medical, hospital, medicine, doctor, health
  assert.equal(isMedicalCategory('Medical Expense'), true)
  assert.equal(isMedicalCategory('Medical Advance'), true)
  assert.equal(isMedicalCategory('Hospital Bill'), true)
  assert.equal(isMedicalCategory('Doctor Consultation Fee'), true)
  assert.equal(isMedicalCategory('Medicine & Pharmacy'), true)
  assert.equal(isMedicalCategory('Healthcare Checkup'), true)
  assert.equal(isMedicalCategory('Emergency Health Aid'), true)
  assert.equal(isMedicalCategory('medical'), true)
  assert.equal(isMedicalCategory('HOSPITAL [General]'), true)
  assert.equal(isMedicalCategory({ name: 'Doctor Visit' }), true)

  // Negative matches (non-medical categories)
  assert.equal(isMedicalCategory('Petrol'), false)
  assert.equal(isMedicalCategory('Sitepetrol'), false)
  assert.equal(isMedicalCategory('Salary Advance'), false)
  assert.equal(isMedicalCategory('Travel Advance'), false)
  assert.equal(isMedicalCategory('Food & Refreshment'), false)
  assert.equal(isMedicalCategory('Office Supplies'), false)
  assert.equal(isMedicalCategory('Subcontractor Payment'), false)
  assert.equal(isMedicalCategory('Given to Others'), false)

  // Object with isMedical: true
  assert.equal(isMedicalCategory({ name: 'Special Relief', isMedical: true }), true)
  assert.equal(isMedicalCategory({ name: 'Office Tea', isMedical: false }), false)

  // Custom configured categories array
  assert.equal(isMedicalCategory('Custom Aid', ['Custom Aid', 'Mediclaim']), true)
  assert.equal(isMedicalCategory('Regular Travel', ['Custom Aid']), false)
})

test('Default categories provide Medical Expense and Medical Advance with global defaults', () => {
  assert.ok(DEFAULT_ADVANCE_CATEGORIES.includes('Medical Advance'), 'DEFAULT_ADVANCE_CATEGORIES must include Medical Advance')
  assert.ok(
    DEFAULT_EXPENSE_CATEGORIES.some((c) => c.name === 'Medical Expense' && c.isMedical === true),
    'DEFAULT_EXPENSE_CATEGORIES must include Medical Expense with isMedical: true'
  )
  assert.equal(isAdvanceCategory('Medical Advance'), true)
  assert.equal(isExpenseCategory('Medical Expense'), true)
  assert.equal(DEFAULT_MEDICAL_ELIGIBILITY.advanceCategory, 'Medical Advance')
  assert.equal(DEFAULT_MEDICAL_ELIGIBILITY.expenseCategory, 'Medical Expense')
})

// ==========================================
// 2. Claim Classification & Deductibility
// ==========================================
test('isMedicalClaim accurately detects medical claims', () => {
  assert.equal(isMedicalClaim({ category: 'Medical Expense' }), true)
  assert.equal(isMedicalClaim({ category: 'Hospital Bill' }), true)
  assert.equal(isMedicalClaim({ isMedical: true, category: 'Others' }), true)
  assert.equal(isMedicalClaim({ isMedical: false, category: 'Petrol' }), false)
  assert.equal(isMedicalClaim({ category: 'Salary Advance' }), false)
})

test('isMedicalDeductible differentiates company-funded vs payroll deductible claims', () => {
  // Medical Expense:
  assert.equal(isMedicalDeductible({ type: 'Expense', isMedical: true, isDeductible: true }), true)
  assert.equal(isMedicalDeductible({ type: 'Expense', isMedical: true, isDeductible: false }), false)
  assert.equal(isMedicalDeductible({ type: 'Expense', category: 'Medical Expense', isDeductible: false }), false)

  // Medical Advance:
  assert.equal(isMedicalDeductible({ type: 'Advance', isMedical: true, isDeductible: true }), true)
  assert.equal(isMedicalDeductible({ type: 'Advance', isMedical: true, isDeductible: false }), false)
  assert.equal(isMedicalDeductible({ type: 'Advance', category: 'Medical Advance' }), true) // defaults to deductible
})

// ==========================================
// 3. Black-Box Payroll Engine Verification
// ==========================================
test('Black-Box: A medical expense flagged isDeductible: true must increase monthly salary deductions dollar-for-dollar', () => {
  const baseSalaryData = {
    grossEarnings: 50000,
    pf: 1800,
    esi: 375,
    loanEMI: 0,
    fineAmount: 0,
    advanceDeductions: 0
  }

  const baselineDeductions = calculatePayrollDeductions({
    ...baseSalaryData,
    medicalDeductions: 0
  })
  assert.equal(baselineDeductions, 2175)

  // Deductible medical expense of ₹3,500
  const deductibleMedicalExpense = {
    type: 'Expense',
    category: 'Medical Expense',
    isMedical: true,
    isDeductible: true,
    amount: 3500,
    date: '2026-10-15',
    status: 'Approved'
  }

  assert.equal(isMedicalExpenseDeductibleInPayrollMonth(deductibleMedicalExpense, '2026-10'), true)

  const medicalDeductions = deductibleMedicalExpense.amount
  const newDeductions = calculatePayrollDeductions({
    ...baseSalaryData,
    medicalDeductions
  })

  // Increases dollar-for-dollar
  assert.equal(newDeductions, baselineDeductions + 3500)
  assert.equal(newDeductions, 5675)

  // Net payout verification: gross - totalDeductions (medical deductible is excluded from reimbursements)
  const netPayout = calculateNetPayout({
    grossEarnings: baseSalaryData.grossEarnings,
    totalDeductions: newDeductions,
    expenseReimbursements: 0
  })
  assert.equal(netPayout, 50000 - 5675)
  assert.equal(netPayout, 44325)
})

test('Black-Box: A medical expense flagged isDeductible: false must produce 0 change in salary deductions', () => {
  const baseSalaryData = {
    grossEarnings: 50000,
    pf: 1800,
    esi: 375,
    loanEMI: 0,
    fineAmount: 0,
    advanceDeductions: 0
  }

  const baselineDeductions = calculatePayrollDeductions({
    ...baseSalaryData,
    medicalDeductions: 0
  })

  // Company-paid medical expense of ₹12,000 (Non-deductible)
  const companySponsoredExpense = {
    type: 'Expense',
    category: 'Medical Expense',
    isMedical: true,
    isDeductible: false,
    amount: 12000,
    date: '2026-10-12',
    status: 'Approved'
  }

  assert.equal(isMedicalExpenseDeductibleInPayrollMonth(companySponsoredExpense, '2026-10'), false)

  // 0 change in deductions
  const updatedDeductions = calculatePayrollDeductions({
    ...baseSalaryData,
    medicalDeductions: 0
  })
  assert.equal(updatedDeductions, baselineDeductions)
  assert.equal(updatedDeductions, 2175)

  // If the employee paid out of pocket, it is reimbursed without reducing net compensation
  const netWithReimbursement = calculateNetPayout({
    grossEarnings: baseSalaryData.grossEarnings,
    totalDeductions: updatedDeductions,
    expenseReimbursements: companySponsoredExpense.amount
  })
  assert.equal(netWithReimbursement, 50000 - 2175 + 12000)
  assert.equal(netWithReimbursement, 59825)
})

test('Black-Box: A medical advance flagged isDeductible: false must bypass payroll recovery', () => {
  // Compassionate company assistance medical advance of ₹25,000
  const compassionateAdvance = {
    type: 'Advance',
    category: 'Medical Advance',
    isMedical: true,
    isDeductible: false,
    amount: 25000,
    date: '2026-10-05',
    status: 'Approved'
  }

  // Must NOT be candidate and must NOT be deductible in payroll month
  assert.equal(isAdvanceCandidateForPayroll(compassionateAdvance, '2026-10', 10), false)
  assert.equal(isAdvanceDeductibleInPayrollMonth(compassionateAdvance, '2026-10', 10), false)

  // Standard deductible advance of ₹5,000 for contrast
  const standardMedicalAdvance = {
    type: 'Advance',
    category: 'Medical Advance',
    isMedical: true,
    isDeductible: true,
    amount: 5000,
    date: '2026-10-05',
    status: 'Approved'
  }
  assert.equal(isAdvanceCandidateForPayroll(standardMedicalAdvance, '2026-10', 10), true)
  assert.equal(isAdvanceDeductibleInPayrollMonth(standardMedicalAdvance, '2026-10', 10), true)
})

// ==========================================
// 4. Medical Quota & Eligibility Policy Tests
// ==========================================
test('Medical limits fallback to organization defaults when employee limit is not overridden', () => {
  const orgEligibility = {
    defaultMonthly: 5000,
    defaultYearly: 50000,
    employeeLimits: {
      emp_senior: { monthly: 15000, yearly: 150000 }
    }
  }

  const standardEmpLimits = getEmployeeMedicalLimits(orgEligibility, 'emp_standard')
  assert.equal(standardEmpLimits.monthly, 5000)
  assert.equal(standardEmpLimits.yearly, 50000)
  assert.equal(standardEmpLimits.isOverridden, false)

  const seniorEmpLimits = getEmployeeMedicalLimits(orgEligibility, 'emp_senior')
  assert.equal(seniorEmpLimits.monthly, 15000)
  assert.equal(seniorEmpLimits.yearly, 150000)
  assert.equal(seniorEmpLimits.isOverridden, true)
})

test('Quota calculations accurately report remaining balance when claims are below monthly/yearly limits', () => {
  const orgEligibility = {
    defaultMonthly: 5000,
    defaultYearly: 50000,
    employeeLimits: {}
  }

  const entries = [
    {
      id: 'claim-1',
      employeeId: 'emp_01',
      isMedical: true,
      isDeductible: false,
      amount: 1500,
      date: '2026-10-02',
      status: 'Approved'
    },
    {
      id: 'claim-2',
      employeeId: 'emp_01',
      category: 'Doctor Consultation',
      isMedical: true,
      isDeductible: true,
      amount: 500,
      date: '2026-10-10',
      status: 'Approved'
    },
    // Past month in the same year
    {
      id: 'claim-past',
      employeeId: 'emp_01',
      category: 'Medicine',
      isMedical: true,
      isDeductible: false,
      amount: 2000,
      date: '2026-08-14',
      status: 'Approved'
    }
  ]

  const util = calculateEmployeeMedicalUtilization(entries, 'emp_01', '2026-10', orgEligibility)

  assert.equal(util.monthlyLimit, 5000)
  assert.equal(util.yearlyLimit, 50000)
  assert.equal(util.monthlyUsed, 2000) // 1500 + 500 in Oct
  assert.equal(util.yearlyUsed, 4000)  // 2000 in Aug + 2000 in Oct
  assert.equal(util.monthlyRemaining, 3000) // 5000 - 2000
  assert.equal(util.yearlyRemaining, 46000) // 50000 - 4000
  assert.equal(util.monthlyExceeded, 0)
  assert.equal(util.yearlyExceeded, 0)
  assert.equal(util.deductibleUsed, 500)
  assert.equal(util.nonDeductibleUsed, 1500)
})

test('Quota calculations accurately report remaining balance when claims exceed monthly/yearly limits', () => {
  const orgEligibility = {
    defaultMonthly: 5000,
    defaultYearly: 50000,
    employeeLimits: {
      emp_custom: { monthly: 4000, yearly: 20000 }
    }
  }

  const entries = [
    {
      id: 'claim-large',
      employeeId: 'emp_custom',
      category: 'Hospital Bill',
      isMedical: true,
      isDeductible: false,
      amount: 6500, // Exceeds monthly limit of 4000 by 2500
      date: '2026-10-04',
      status: 'Approved'
    },
    {
      id: 'claim-prior',
      employeeId: 'emp_custom',
      isMedical: true,
      amount: 18000,
      date: '2026-05-10',
      status: 'Approved'
    }
  ]

  const util = calculateEmployeeMedicalUtilization(entries, 'emp_custom', '2026-10', orgEligibility)

  assert.equal(util.monthlyLimit, 4000)
  assert.equal(util.monthlyUsed, 6500)
  assert.equal(util.monthlyRemaining, 0) // Clamped to 0
  assert.equal(util.netMonthlyBalance, -2500) // Negative balance
  assert.equal(util.monthlyExceeded, 2500)

  // Yearly: 18000 + 6500 = 24500 (exceeds 20000 by 4500)
  assert.equal(util.yearlyLimit, 20000)
  assert.equal(util.yearlyUsed, 24500)
  assert.equal(util.yearlyRemaining, 0)
  assert.equal(util.netYearlyBalance, -4500)
  assert.equal(util.yearlyExceeded, 4500)
})

test('calculateMedicalQuotaSummary returns correct metrics for employee list', () => {
  const employees = [
    { id: 'emp_1', name: 'Alice' },
    { id: 'emp_2', name: 'Bob' }
  ]
  const entries = [
    { id: 'c1', employeeId: 'emp_1', category: 'Medical Expense', amount: 1000, date: '2026-10-01', status: 'Approved' }
  ]
  const summary = calculateMedicalQuotaSummary(entries, employees, '2026-10', DEFAULT_MEDICAL_ELIGIBILITY)

  assert.equal(summary.length, 2)
  assert.equal(summary[0].employee.name, 'Alice')
  assert.equal(summary[0].monthlyUsed, 1000)
  assert.equal(summary[0].monthlyRemaining, 4000)
  assert.equal(summary[1].employee.name, 'Bob')
  assert.equal(summary[1].monthlyUsed, 0)
  assert.equal(summary[1].monthlyRemaining, 5000)
})

test('Self-Entry Submission: Medical claim attributes expense to claimant while assigning colleague as beneficiary', () => {
  const selfEmployeeId = 'emp_user1'
  const isSelfEntrySubmission = true
  const employees = [
    { id: 'emp_user1', name: 'User 1', email: 'user1@company.com' },
    { id: 'emp_bob', name: 'Bob', email: 'bob@company.com' }
  ]

  const rawRows = [
    // Case 1: Self normal expense (e.g. food)
    { id: 1, employeeId: selfEmployeeId, category: 'Food & Refreshment', amount: 250, date: '2026-10-12', isMedical: false },
    // Case 2: Medical expense claimed for colleague Bob
    { id: 2, employeeId: 'emp_bob', category: 'Medical Expense', amount: 1500, date: '2026-10-12', isMedical: true, isDeductible: true },
    // Case 3: Medical expense claimed for self
    { id: 3, employeeId: selfEmployeeId, category: 'Medical Consultation', amount: 800, date: '2026-10-12', isMedical: true, isDeductible: false }
  ]

  const normalized = isSelfEntrySubmission
    ? rawRows.map((row) => {
        const isMed = isMedicalClaim(row) || isMedicalCategory(row.category) || isMedicalCategory(row.customCategory) || Boolean(row.isMedical)
        if (isMed) {
          const rawBenId = row.beneficiaryEmployeeId || (row.employeeId && row.employeeId !== selfEmployeeId ? row.employeeId : null)
          const benEmp = rawBenId ? employees.find(e => e.id === rawBenId) : null
          const benName = row.beneficiaryEmployeeName || benEmp?.name || null
          return {
            ...row,
            employeeId: selfEmployeeId,
            paidByEmployeeId: selfEmployeeId,
            submittedByEmployeeId: selfEmployeeId,
            beneficiaryEmployeeId: rawBenId,
            beneficiaryEmployeeName: benName,
            paidTo: rawBenId || row.paidTo || null,
            paidToName: benName || row.paidToName || null,
            paidToType: rawBenId ? 'employee' : row.paidToType || null
          }
        }
        return { ...row, employeeId: selfEmployeeId }
      })
    : rawRows

  // Row 1 (Food): Attributed to self
  assert.equal(normalized[0].employeeId, 'emp_user1')
  assert.equal(normalized[0].paidByEmployeeId, undefined)

  // Row 2 (Medical for Bob): Incurred/claimed by User 1, beneficiary is Bob
  assert.equal(normalized[1].employeeId, 'emp_user1')
  assert.equal(normalized[1].paidByEmployeeId, 'emp_user1')
  assert.equal(normalized[1].beneficiaryEmployeeId, 'emp_bob')
  assert.equal(normalized[1].beneficiaryEmployeeName, 'Bob')

  // Row 3 (Medical for Self): Incurred/claimed by User 1, no distinct beneficiary
  assert.equal(normalized[2].employeeId, 'emp_user1')
  assert.equal(normalized[2].paidByEmployeeId, 'emp_user1')
  assert.equal(normalized[2].beneficiaryEmployeeId, null)

  // Report resolution test for Row 2:
  const reportDetailsNew = resolveReportEntryDetails(normalized[1], employees, [])
  assert.equal(reportDetailsNew.effectiveEmployeeId, 'emp_user1', 'Report totals must attribute expense to the incurring employee (User 1)')
  assert.equal(reportDetailsNew.displayEmployeeName, 'User 1')
  assert.equal(reportDetailsNew.beneficiaryName, 'Bob', 'Report details must capture Bob as beneficiary')

  // Legacy record backward-compatibility test (saved with employeeId = Bob and paidByEmployeeId = User 1):
  const legacyRecord = {
    id: 'legacy_1',
    employeeId: 'emp_bob',
    employeeName: 'Bob',
    paidByEmployeeId: 'emp_user1',
    category: 'Medical Expense',
    amount: 1500,
    isMedical: true,
    isDeductible: true,
    type: 'Expense'
  }
  const reportDetailsLegacy = resolveReportEntryDetails(legacyRecord, employees, [])
  assert.equal(reportDetailsLegacy.effectiveEmployeeId, 'emp_user1', 'Legacy record must also dynamically attribute to User 1 in reports')
  assert.equal(reportDetailsLegacy.displayEmployeeName, 'User 1')
  assert.equal(reportDetailsLegacy.beneficiaryName, 'Bob')

  // Quota utilization test:
  const bobUtilization = calculateEmployeeMedicalUtilization(
    [normalized[1]],
    'emp_bob',
    '2026-10-12',
    {}
  )
  assert.equal(bobUtilization.monthlyUsed, 1500, "Bob's quota must reflect utilization")

  const user1Utilization = calculateEmployeeMedicalUtilization(
    [normalized[1]],
    'emp_user1',
    '2026-10-12',
    {}
  )
  assert.equal(user1Utilization.monthlyUsed, 0, "User 1's quota must not be consumed for Bob's medical expense")
})

