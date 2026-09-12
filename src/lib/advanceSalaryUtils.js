/**
 * advanceSalaryUtils.js
 * Utility functions for managing advance deductions in payroll based on the organization's
 * salary cycle policy, HR overrides (deferrals/postponements), and loan installment conversion.
 *
 * Business Rules:
 * 1. Current Month Advances (e.g. advances taken during September):
 *    - Automatically deduct in September Salary by default!
 *    - UNLESS the user explicitly added/deducted them into the previous month's salary (e.g. August).
 *    - The user can also choose to postpone them to next month (October) or convert to loan.
 *
 * 2. Next Month Pre-Disbursement Advances (e.g. advances taken September 1st - 10th before August salary date):
 *    - When reviewing August Salary, the user can choose to add/deduct these advances into August Salary.
 *    - If the user does NOT add them into August Salary, they will automatically deduct in September Salary!
 */

/**
 * Returns the next month in 'YYYY-MM' format.
 *
 * @param {string} monthStr - 'YYYY-MM'
 * @returns {string} - 'YYYY-MM'
 */
export function getNextMonth(monthStr) {
  if (!monthStr || !monthStr.includes('-')) return monthStr
  const [y, m] = monthStr.split('-').map(Number)
  if (m === 12) {
    return `${y + 1}-01`
  }
  return `${y}-${String(m + 1).padStart(2, '0')}`
}

/**
 * Returns the previous month in 'YYYY-MM' format.
 *
 * @param {string} monthStr - 'YYYY-MM'
 * @returns {string} - 'YYYY-MM'
 */
export function getPreviousMonth(monthStr) {
  if (!monthStr || !monthStr.includes('-')) return monthStr
  const [y, m] = monthStr.split('-').map(Number)
  if (m === 1) {
    return `${y - 1}-12`
  }
  return `${y}-${String(m - 1).padStart(2, '0')}`
}

/**
 * Normalizes a date input to 'YYYY-MM-DD'.
 *
 * @param {string|Date|Object} dateInput
 * @returns {string} - 'YYYY-MM-DD'
 */
export function normalizeToDateStr(dateInput) {
  if (!dateInput) return ''
  if (typeof dateInput === 'string') {
    const s = dateInput.trim()
    const parts = s.split(/[-/]/)
    if (parts.length === 3) {
      if (parts[0].length === 4) {
        return `${parts[0]}-${parts[1].padStart(2, '0')}-${parts[2].slice(0, 2).padStart(2, '0')}`
      } else {
        return `${parts[2].slice(0, 4)}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`
      }
    }
    return s.slice(0, 10)
  }
  if (dateInput instanceof Date) {
    return dateInput.toISOString().split('T')[0]
  }
  if (dateInput?.seconds) {
    return new Date(dateInput.seconds * 1000).toISOString().split('T')[0]
  }
  return String(dateInput).slice(0, 10)
}

/**
 * Returns the natural default deduction month for an advance based on the organization's salary date.
 * By default, an advance belongs to the calendar month it was taken in.
 *
 * @param {string|Date} dateInput
 * @returns {string} - 'YYYY-MM'
 */
export function getDefaultAdvanceDeductionMonth(dateInput) {
  const dateStr = normalizeToDateStr(dateInput)
  if (!dateStr || dateStr.length < 7) {
    return new Date().toISOString().slice(0, 7)
  }
  return dateStr.slice(0, 7)
}

/**
 * Returns the effective deduction month for an advance record.
 * Uses explicit `deductionMonth` if set, otherwise calculates default natural deduction month.
 *
 * @param {Object} adv
 * @returns {string} - 'YYYY-MM'
 */
export function getAdvanceDeductionMonth(adv) {
  if (!adv) return ''
  if (adv.deductionMonth && /^\d{4}-\d{2}$/.test(String(adv.deductionMonth).trim())) {
    return String(adv.deductionMonth).trim()
  }
  return getDefaultAdvanceDeductionMonth(adv.date)
}

/**
 * Checks if an advance was taken in the month immediately following summaryMonth,
 * on or before summaryMonth's salary disbursement date.
 *
 * Example:
 * When reviewing August Salary ('2026-08') with salaryDate = 10,
 * an advance taken between '2026-09-01' and '2026-09-10' was taken before August salary payout!
 * The user can choose to add/deduct it in August Salary.
 *
 * @param {string|Date} advDate
 * @param {string} summaryMonth - 'YYYY-MM'
 * @param {number} salaryDate - 1 to 31 (default 10)
 * @returns {boolean}
 */
export function isNextMonthPreDisbursementAdvance(advDate, summaryMonth, salaryDate = 10) {
  if (!advDate || !summaryMonth) return false
  const dateStr = normalizeToDateStr(advDate)
  if (!dateStr || dateStr.length < 10) return false

  const nextMonth = getNextMonth(summaryMonth)
  const advMonth = dateStr.slice(0, 7)
  if (advMonth !== nextMonth) return false

  const day = Number(dateStr.slice(8, 10))
  const cutoff = Math.min(31, Math.max(1, Number(salaryDate) || 10))
  return day <= cutoff
}

/**
 * Backward compatibility alias for pre-salary advance detection.
 */
export function isPreSalaryAdvance(advDate, summaryMonth, salaryDate = 10) {
  return isNextMonthPreDisbursementAdvance(advDate, summaryMonth, salaryDate)
}

/**
 * Determines whether an advance should be visible in the "Set Rules" breakdown modal
 * for a specific salary month `summaryMonth`.
 *
 * Visible candidates for summaryMonth (e.g. August '2026-08'):
 * 1. Current month advances (taken in August 2026-08).
 * 2. Next month pre-disbursement advances (taken Sept 1 - Sept 10 before August salary payout),
 *    so the user can optionally add/deduct them into August Salary!
 * 3. Advances from earlier months explicitly postponed/assigned to August (`deductionMonth === '2026-08'`).
 *
 * @param {Object} adv
 * @param {string} summaryMonth - 'YYYY-MM'
 * @param {number} salaryDate - 1 to 31 (default 10)
 * @returns {boolean}
 */
export function isAdvanceCandidateForPayroll(adv, summaryMonth, salaryDate = 10) {
  if (!adv || !summaryMonth) return false

  // Must be an Advance
  const isAdv = adv.type === 'Advance' || (
    adv.category && String(adv.category).toLowerCase().includes('advance') &&
    !String(adv.category).toLowerCase().includes('expense')
  )
  if (!isAdv) return false

  // Exclude if converted to loan installments or explicitly flagged not for payroll
  if (adv.recoveryType === 'loan' || adv.deductFromPayroll === false) {
    return false
  }

  const advDate = normalizeToDateStr(adv.date)
  if (!advDate || advDate.length < 10) return false

  const advMonth = advDate.slice(0, 7)
  const explicitMonth = adv.deductionMonth && /^\d{4}-\d{2}$/.test(String(adv.deductionMonth).trim())
    ? String(adv.deductionMonth).trim()
    : null

  // 1. Explicitly assigned / postponed to this summaryMonth
  if (explicitMonth === summaryMonth) {
    return true
  }

  // 2. Advances taken during summaryMonth (e.g. taken during September when viewing September)
  if (advMonth === summaryMonth) {
    return true
  }

  // 3. Next month pre-disbursement advances (e.g. taken Sept 1-10 when viewing August)
  if (isNextMonthPreDisbursementAdvance(adv.date, summaryMonth, salaryDate)) {
    return true
  }

  // 4. If this advance originated in summaryMonth but was postponed to next month,
  // keep it visible in summaryMonth as "Postponed to {explicitMonth}"
  if (explicitMonth && explicitMonth > summaryMonth && advMonth === summaryMonth) {
    return true
  }

  return false
}

/**
 * Checks if an advance should actually be DEDUCTED in `summaryMonth`.
 *
 * Rules:
 * 1. If explicit `deductionMonth` is set:
 *    - Deducts ONLY if `adv.deductionMonth === summaryMonth`.
 *    - If an advance was added to previous month (e.g. Sept 1 advance added to August),
 *      then `adv.deductionMonth === '2026-08'`, so it will NOT deduct in September!
 *
 * 2. If NO explicit `deductionMonth` (default behavior):
 *    - If taken during `summaryMonth` (e.g. taken during September when viewing September):
 *      -> AUTOMATICALLY DEDUCTS in `summaryMonth` by default!
 *         ("it can also autodecut in the septementer unless user add to august salary")
 *    - If taken in next month before salary date (e.g. Sept 1-10 when viewing August):
 *      -> Does NOT deduct in August by default (user must explicitly click to add it).
 *
 * @param {Object} adv
 * @param {string} summaryMonth - 'YYYY-MM'
 * @param {number} salaryDate - 1 to 31 (default 10)
 * @returns {boolean}
 */
export function isAdvanceDeductibleInPayrollMonth(adv, summaryMonth, salaryDate = 10) {
  if (!adv || !summaryMonth) return false

  // Must be an Advance
  const isAdv = adv.type === 'Advance' || (
    adv.category && String(adv.category).toLowerCase().includes('advance') &&
    !String(adv.category).toLowerCase().includes('expense')
  )
  if (!isAdv) return false

  // Exclude if converted to loan installments or explicitly not deducted from payroll
  if (adv.recoveryType === 'loan' || adv.deductFromPayroll === false) {
    return false
  }

  const advDate = normalizeToDateStr(adv.date)
  if (!advDate || advDate.length < 10) return false

  const advMonth = advDate.slice(0, 7)
  const explicitMonth = adv.deductionMonth && /^\d{4}-\d{2}$/.test(String(adv.deductionMonth).trim())
    ? String(adv.deductionMonth).trim()
    : null

  // 1. Explicit deductionMonth rule
  if (explicitMonth) {
    return explicitMonth === summaryMonth
  }

  // 2. Default: if advance was taken during summaryMonth, it AUTO-DEDUCTS by default!
  if (advMonth === summaryMonth) {
    return true
  }

  // 3. Next month pre-disbursement advances (e.g. Sept 1-10 when viewing August)
  // do NOT deduct in August by default unless explicitly added by the user.
  return false
}

/**
 * Formats 'YYYY-MM' into a human-readable label (e.g. 'Aug 2026').
 *
 * @param {string} monthStr - 'YYYY-MM'
 * @returns {string}
 */
export function formatMonthLabel(monthStr) {
  if (!monthStr || !monthStr.includes('-')) return monthStr || ''
  const [y, m] = monthStr.split('-').map(Number)
  const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
  if (m >= 1 && m <= 12) {
    return `${monthNames[m - 1]} ${y}`
  }
  return monthStr
}
