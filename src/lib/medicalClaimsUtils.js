/**
 * medicalClaimsUtils.js
 * Comprehensive utility library for Medical Expense & Advance workflows:
 * - Category classification & detection
 * - Beneficiary & Deductibility rules
 * - Payroll deduction contract calculations
 * - Organization policy and per-employee quota & ceiling tracking
 */

import { normalizeToDateStr } from './advanceSalaryUtils.js'

/**
 * Recognized medical keywords based on PRD decision:
 * Category is recognized as medical if its normalized name contains:
 * 'medical', 'hospital', 'medicine', 'doctor', or 'health'.
 */
export const MEDICAL_KEYWORDS = ['medical', 'hospital', 'medicine', 'doctor', 'health']

/**
 * Checks if a category name is classified as medical.
 *
 * @param {string|Object} category - Category string or category object with a .name property
 * @returns {boolean}
 */
export function isMedicalCategory(category, customMedicalCategories = []) {
  if (!category) return false
  if (typeof category === 'object' && category.isMedical === true) return true
  const raw = typeof category === 'string' ? category : category?.name || ''
  const clean = String(raw).replace(/\s*\[[^\]]*\]\s*$/, '').trim().toLowerCase()
  if (!clean) return false
  if (Array.isArray(customMedicalCategories) && customMedicalCategories.some(c => String(c).trim().toLowerCase() === clean)) {
    return true
  }
  return MEDICAL_KEYWORDS.some((kw) => clean.includes(kw))
}

/**
 * Checks if an expense or advance entry is a medical claim.
 *
 * @param {Object} entry
 * @param {Array<string>} [customMedicalCategories]
 * @returns {boolean}
 */
export function isMedicalClaim(entry, customMedicalCategories = []) {
  if (!entry) return false
  if (entry.isMedical === true) return true
  return isMedicalCategory(entry.category, customMedicalCategories)
}

/**
 * Determines whether a medical entry is deductible from employee payroll.
 *
 * For Medical Expenses:
 * - isDeductible === true means recovered from employee salary (deductible).
 * - isDeductible === false means company-funded (non-deductible).
 *
 * For Medical Advances:
 * - isDeductible !== false (default true) means standard advance recovered from salary.
 * - isDeductible === false means compassionate company assistance excluded from payroll recovery.
 *
 * @param {Object} entry
 * @returns {boolean}
 */
export function isMedicalDeductible(entry) {
  if (!entry) return false
  if (entry.type === 'Advance') {
    // If flagged non-deductible, it is company-sponsored assistance
    return entry.isDeductible !== false
  }
  // For Expense: deductible ONLY if explicitly flagged true
  return entry.isDeductible === true
}

/**
 * Default organizational medical eligibility limits.
 */
export const DEFAULT_MEDICAL_ELIGIBILITY = {
  defaultMonthly: 5000,
  defaultYearly: 50000,
  advanceCategory: 'Medical Advance',
  expenseCategory: 'Medical Expense',
  employeeLimits: {}
}

/**
 * Resolves the effective monthly and yearly eligibility limits for a specific employee.
 * Checks per-employee override in medicalEligibility.employeeLimits[employeeId],
 * otherwise falls back to organization defaults.
 *
 * @param {Object} medicalEligibility - Organisation medical eligibility settings
 * @param {string} employeeId - Target employee ID
 * @returns {{ monthly: number, yearly: number, isOverridden: boolean }}
 */
export function getEmployeeMedicalLimits(medicalEligibility, employeeId) {
  const policy = medicalEligibility || DEFAULT_MEDICAL_ELIGIBILITY
  const defaultMonthly = Number(policy.defaultMonthly != null ? policy.defaultMonthly : DEFAULT_MEDICAL_ELIGIBILITY.defaultMonthly) || 0
  const defaultYearly = Number(policy.defaultYearly != null ? policy.defaultYearly : DEFAULT_MEDICAL_ELIGIBILITY.defaultYearly) || 0

  if (!employeeId || !policy.employeeLimits || !policy.employeeLimits[employeeId]) {
    return {
      monthly: defaultMonthly,
      yearly: defaultYearly,
      isOverridden: false
    }
  }

  const custom = policy.employeeLimits[employeeId]
  const monthly = custom.monthly != null && custom.monthly !== '' ? Number(custom.monthly) : defaultMonthly
  const yearly = custom.yearly != null && custom.yearly !== '' ? Number(custom.yearly) : defaultYearly

  return {
    monthly,
    yearly,
    isOverridden: true
  }
}

/**
 * Computes medical expenditure and quota utilization for an employee
 * for a specific target month ('YYYY-MM') or date.
 *
 * @param {Array<Object>} entries - All advances and expenses
 * @param {string} employeeId - Target employee ID
 * @param {string} targetDateOrMonth - 'YYYY-MM' or 'YYYY-MM-DD'
 * @param {Object} medicalEligibility - Organisation settings
 * @returns {Object} Quota utilization and claim metrics
 */
export function calculateEmployeeMedicalUtilization(entries = [], employeeId, targetDateOrMonth, medicalEligibility) {
  if (!employeeId) {
    return {
      employeeId: '',
      monthlyLimit: 0,
      yearlyLimit: 0,
      monthlyUsed: 0,
      yearlyUsed: 0,
      monthlyRemaining: 0,
      yearlyRemaining: 0,
      monthlyExceeded: 0,
      yearlyExceeded: 0,
      deductibleUsed: 0,
      nonDeductibleUsed: 0,
      claimsCount: 0
    }
  }

  const dateStr = normalizeToDateStr(targetDateOrMonth) || new Date().toISOString().slice(0, 10)
  const targetMonth = dateStr.slice(0, 7) // 'YYYY-MM'
  const targetYear = dateStr.slice(0, 4)  // 'YYYY'

  const limits = getEmployeeMedicalLimits(medicalEligibility, employeeId)

  // Filter medical entries for this employee that are not rejected
  const empEntries = entries.filter((e) => {
    if (!e || e.status === 'Rejected') return false
    // Match beneficiary employeeId (the employee receiving the healthcare benefit)
    const benId = String(
      e.beneficiaryEmployeeId ||
      (e.paidTo && e.paidToType === 'employee' ? e.paidTo : null) ||
      (e.paidByEmployeeId && e.paidByEmployeeId !== e.employeeId ? e.employeeId : null) ||
      e.employeeId ||
      ''
    ).trim()
    if (benId !== String(employeeId).trim()) return false
    return isMedicalClaim(e)
  })

  let monthlyUsed = 0
  let yearlyUsed = 0
  let deductibleUsed = 0
  let nonDeductibleUsed = 0
  let monthlyClaimsCount = 0

  for (const entry of empEntries) {
    const entryDate = normalizeToDateStr(entry.date)
    const entryMonth = entryDate.slice(0, 7)
    const entryYear = entryDate.slice(0, 4)
    const amount = Number(entry.amount || 0)

    const isDeductible = isMedicalDeductible(entry)

    // Annual aggregation
    if (entryYear === targetYear) {
      yearlyUsed += amount
    }

    // Monthly aggregation
    if (entryMonth === targetMonth) {
      monthlyUsed += amount
      monthlyClaimsCount++
      if (isDeductible) {
        deductibleUsed += amount
      } else {
        nonDeductibleUsed += amount
      }
    }
  }

  const monthlyRemaining = limits.monthly - monthlyUsed
  const yearlyRemaining = limits.yearly - yearlyUsed

  return {
    employeeId,
    targetMonth,
    targetYear,
    monthlyLimit: limits.monthly,
    yearlyLimit: limits.yearly,
    isOverridden: limits.isOverridden,
    monthlyUsed,
    yearlyUsed,
    monthlyRemaining: Math.max(0, monthlyRemaining),
    yearlyRemaining: Math.max(0, yearlyRemaining),
    netMonthlyBalance: monthlyRemaining, // May be negative if exceeded
    netYearlyBalance: yearlyRemaining,   // May be negative if exceeded
    monthlyExceeded: Math.max(0, monthlyUsed - limits.monthly),
    yearlyExceeded: Math.max(0, yearlyUsed - limits.yearly),
    deductibleUsed,
    nonDeductibleUsed,
    monthlyClaimsCount,
    totalClaimsCount: empEntries.length
  }
}

/**
 * Calculates medical quota summaries for all employees in an organization.
 *
 * @param {Array<Object>} entries - All advances and expenses
 * @param {Array<Object>} employees - All employee records
 * @param {string} targetMonth - 'YYYY-MM'
 * @param {Object} medicalEligibility - Settings
 * @returns {Array<Object>}
 */
export function calculateMedicalQuotaSummary(entries = [], employees = [], targetMonth, medicalEligibility) {
  return employees.map((emp) => {
    const util = calculateEmployeeMedicalUtilization(entries, emp.id, targetMonth, medicalEligibility)
    return {
      employee: emp,
      ...util
    }
  })
}

/**
 * Pure payroll deduction formula implementation complying with PRD:
 * Total Deductions = PF + ESI + Loan EMI + Fine + Deductible Advances + Medical Deductions
 *
 * @param {Object} params
 * @param {number} params.pf
 * @param {number} params.esi
 * @param {number} params.loanEMI
 * @param {number} params.fineAmount
 * @param {number} params.advanceDeductions - Deductible advances (excluding non-deductible medical advances)
 * @param {number} params.medicalDeductions - Deductible medical expenses
 * @returns {number}
 */
export function calculatePayrollDeductions({
  pf = 0,
  esi = 0,
  loanEMI = 0,
  fineAmount = 0,
  advanceDeductions = 0,
  medicalDeductions = 0
} = {}) {
  return (
    Number(pf || 0) +
    Number(esi || 0) +
    Number(loanEMI || 0) +
    Number(fineAmount || 0) +
    Number(advanceDeductions || 0) +
    Number(medicalDeductions || 0)
  )
}

/**
 * Pure net payout formula implementation complying with PRD:
 * Net Payout = Gross Earnings - Total Deductions + Reimbursements
 * (Deductible medical expenses must already be excluded from Reimbursements)
 *
 * @param {Object} params
 * @param {number} params.grossEarnings
 * @param {number} params.totalDeductions
 * @param {number} params.expenseReimbursements
 * @returns {number}
 */
export function calculateNetPayout({
  grossEarnings = 0,
  totalDeductions = 0,
  expenseReimbursements = 0
} = {}) {
  return Math.max(0, Number(grossEarnings || 0) - Number(totalDeductions || 0) + Number(expenseReimbursements || 0))
}
