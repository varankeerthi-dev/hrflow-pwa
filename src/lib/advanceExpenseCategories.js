export function normalizeExpenseCategory(cat) {
  if (!cat) return { name: '', payableToOthers: false }
  if (typeof cat === 'string') {
    const lower = cat.toLowerCase()
    const isOthers = lower.includes('given to others') || lower.includes('salary to others') || lower.includes('subcontractor') || lower.includes('commission')
    return { name: cat, payableToOthers: isOthers }
  }
  return { name: String(cat.name || '').trim(), payableToOthers: !!cat.payableToOthers }
}

export const DEFAULT_ADVANCE_CATEGORIES = [
  'Salary Advance',
  'Travel Advance',
  'Site Advance',
  'Medical Advance',
  'Festival Advance',
  'Others'
]

export const DEFAULT_EXPENSE_CATEGORIES = [
  { name: 'Petrol', payableToOthers: false },
  { name: 'Food & Refreshment', payableToOthers: false },
  { name: 'Office Supplies', payableToOthers: false },
  { name: 'Hotel & Lodging', payableToOthers: false },
  { name: 'Travel & Taxi', payableToOthers: false },
  { name: 'Stationery', payableToOthers: false },
  { name: 'Given to Others', payableToOthers: true },
  { name: 'Subcontractor Payment', payableToOthers: true },
  { name: 'Commission', payableToOthers: true }
]

export const DEFAULT_COMPANY_ACCOUNTS = [
  'Petty Cash - HO',
  'Main Bank Account',
  'Cash in Hand',
  'Director Account'
]

export function isGivenToOthersCategory(category) {
  if (!category) return false
  const catName = typeof category === 'string' ? category : category?.name || ''
  return String(catName)
    .replace(/\s*\[[^\]]*\]\s*$/, '')
    .trim()
    .toLowerCase() === 'given to others'
}

export function isAdvanceCategory(cat, advanceCategories = []) {
  if (!cat) return false
  const raw = typeof cat === 'string' ? cat : cat?.name || ''
  const clean = String(raw).replace(/\s*\[[^\]]*\]\s*$/, '').trim().toLowerCase()
  if (!clean) return false

  // "given to others" or "salary to others" is explicitly NOT an advance
  if (clean.includes('given to others') || clean.includes('salary to others')) return false

  const list = (advanceCategories && advanceCategories.length > 0 ? advanceCategories : DEFAULT_ADVANCE_CATEGORIES)
    .map(c => (typeof c === 'string' ? c : c?.name || '').trim().toLowerCase())
    .filter(Boolean)
  if (list.includes(clean)) return true

  // Fallback keyword check: e.g. "Salary Advance", "Travel Advance", "Site Advance", etc.
  if (clean.includes('advance')) {
    return true
  }

  return false
}

export function isExpenseCategory(cat, expenseCategories = []) {
  if (!cat) return false
  const raw = typeof cat === 'string' ? cat : cat?.name || ''
  const clean = String(raw).replace(/\s*\[[^\]]*\]\s*$/, '').trim().toLowerCase()
  if (!clean) return false

  // If it explicitly mentions advance (and is not given/salary to others), it is an Advance, NOT an Expense
  if (clean.includes('advance') && !clean.includes('given to others') && !clean.includes('salary to others')) {
    return false
  }

  const list = (expenseCategories && expenseCategories.length > 0 ? expenseCategories : DEFAULT_EXPENSE_CATEGORIES)
    .map(c => (typeof c === 'string' ? c : c?.name || '').trim().toLowerCase())
    .filter(Boolean)
  if (list.includes(clean)) return true

  // Known expense keywords / patterns
  if (clean.includes('given to others') || clean.includes('salary to others')) return true
  if (clean.includes('petrol') || clean.includes('fuel') || clean.includes('diesel')) return true
  if (clean.includes('food') || clean.includes('refreshment') || clean.includes('tea') || clean.includes('coffee')) return true
  if (clean.includes('hotel') || clean.includes('lodging') || clean.includes('taxi') || clean.includes('cab')) return true
  if (clean.includes('subcontractor') || clean.includes('commission')) return true
  if (clean.includes('supplies') || clean.includes('stationery') || clean.includes('hardware')) return true
  if (clean.includes('expense')) return true

  return false
}

export function getAccountingEntryType(entry, advanceCats = [], expenseCats = []) {
  if (!entry) return 'Expense'
  const rawCategory = entry.category || ''
  const cleanCategory = String(rawCategory).replace(/\s*\[[^\]]*\]\s*$/, '').trim()
  const lower = cleanCategory.toLowerCase()

  // 1. Explicit exception: "Given to Others" / "Salary to Others" giver entries are ALWAYS Expenses
  // (even if legacy documents were mistakenly stored with type: 'Advance')
  if (lower.includes('given to others') || lower.includes('salary to others')) {
    return 'Expense'
  }

  // 2. Explicit Advance categories (e.g. Salary Advance, Travel Advance, Cash Advance)
  // An entry with an explicit advance category is ALWAYS an Advance, even if created from the Expense module.
  if (lower.includes('advance') && !lower.includes('expense')) {
    return 'Advance'
  }

  // 3. Respect explicitly stored document type.
  // An entry created in the Expense module with type='Expense' remains an Expense for general
  // categories (e.g. Petrol, Others), and type='Advance' remains an Advance.
  if (entry.type === 'Advance') return 'Advance'
  if (entry.type === 'Expense') return 'Expense'

  // 3. Fallback for legacy documents lacking an explicit stored type:
  // Check if definite Expense category
  if (cleanCategory && isExpenseCategory(cleanCategory, expenseCats)) {
    return 'Expense'
  }

  // Check if definite Advance category
  if (cleanCategory && isAdvanceCategory(cleanCategory, advanceCats)) {
    return 'Advance'
  }

  // 4. String heuristics fallback
  if (lower.includes('advance')) {
    return 'Advance'
  }
  if (lower.includes('expense')) {
    return 'Expense'
  }

  return 'Expense'
}

export function resolveAccountingEntryType(entry, advanceCats = [], expenseCats = []) {
  return getAccountingEntryType(entry, advanceCats, expenseCats)
}

export function resolveReportEntryDetails(entry, employees = [], allEntries = []) {
  if (!entry) {
    return {
      isTransferAdvance: false,
      effectiveEmployeeId: '',
      displayEmployeeName: '—',
      displayGivenBy: null,
      displayCategory: '—'
    }
  }

  const accountingType = getAccountingEntryType(entry)
  const isAdvance = accountingType === 'Advance'
  const rawCat = String(entry.category || '')
  const bracketMatch = rawCat.match(/\[(.*?)\]/)
  const bracketName = bracketMatch ? bracketMatch[1].trim() : null

  const recipientName = entry.paidToName || entry.paidToCustomName || entry.transferredToName || bracketName || null
  const recipientEmp = recipientName && Array.isArray(employees) && employees.length > 0
    ? employees.find(e => (entry.paidTo && e.id === entry.paidTo) || (e.name && e.name.toLowerCase().trim() === recipientName.toLowerCase().trim()))
    : (entry.paidTo && Array.isArray(employees) && employees.length > 0 ? employees.find(e => e.id === entry.paidTo) : null)

  const recipientId = recipientEmp?.id || (entry.paidTo && typeof entry.paidTo === 'string' ? entry.paidTo : null)

  const buildResult = (res) => {
    let displayRemarks = String(entry.remarks || entry.reason || '')
    if (res.displayGivenBy && displayRemarks) {
      if (/Cash paid from/i.test(displayRemarks)) {
        displayRemarks = displayRemarks.replace(/Cash paid from\s+.*?(?=\s*-|\n|$)/i, `Cash paid from ${res.displayGivenBy}`)
      }
    }
    return {
      ...res,
      displayRemarks: displayRemarks || (entry.remarks || entry.reason || '—')
    }
  }

  // If this entry is an Advance and was transferred/given to another employee:
  // The beneficiary of the advance is the recipient employee (Employee B)
  if (isAdvance && (recipientName || recipientId)) {
    const isDifferentPerson = (recipientName && recipientName.toLowerCase().trim() !== String(entry.employeeName || '').toLowerCase().trim()) ||
                              (recipientId && recipientId !== entry.employeeId)
    if (isDifferentPerson) {
      const cleanCat = rawCat.replace(/\s*\[[^\]]*\]\s*$/, '').trim()
      return buildResult({
        isTransferAdvance: true,
        effectiveEmployeeId: recipientId || entry.employeeId,
        displayEmployeeName: recipientEmp?.name || recipientName || entry.employeeName || '—',
        displayGivenBy: entry.givenByEmployeeName || entry.employeeName || null,
        displayCategory: cleanCat || 'Others'
      })
    }
  }

  // If already tagged with givenByEmployeeName on the Advance document
  if (isAdvance && entry.givenByEmployeeName) {
    const cleanCat = rawCat.replace(/\s*\[[^\]]*\]\s*$/, '').trim()
    return buildResult({
      isTransferAdvance: true,
      effectiveEmployeeId: entry.employeeId,
      displayEmployeeName: entry.employeeName || '—',
      displayGivenBy: entry.givenByEmployeeName,
      displayCategory: cleanCat || rawCat
    })
  }

  // 3. For linked advances (e.g. Cash Advance (Paid) created from a Given to Others expense):
  // Find the source expense in allEntries to determine the actual giver
  if (isAdvance && Array.isArray(allEntries) && allEntries.length > 0) {
    const cleanCat = rawCat.replace(/\s*\[[^\]]*\]\s*$/, '').trim()
    let sourceExpense = null

    // Match by linkedExpenseId
    if (entry.linkedExpenseId) {
      sourceExpense = allEntries.find(e => e.id === entry.linkedExpenseId)
    }
    // Match by reverse link (an expense that has linkedAdvanceId === entry.id)
    if (!sourceExpense && entry.id) {
      sourceExpense = allEntries.find(e => e.linkedAdvanceId === entry.id)
    }
    // Match by transaction attributes: Given to Others on same date & amount for this employee
    if (!sourceExpense && (cleanCat.toLowerCase().includes('cash advance') || cleanCat.toLowerCase().includes('others'))) {
      sourceExpense = allEntries.find(e => {
        if (getAccountingEntryType(e) !== 'Expense') return false
        if (e.id === entry.id) return false
        const isTransfer = isGivenToOthersCategory(e.category) ||
          (e.paidTo && e.paidTo === entry.employeeId) ||
          (e.paidToName && String(e.paidToName).toLowerCase().trim() === String(entry.employeeName || '').toLowerCase().trim())
        if (!isTransfer) return false
        const sameAmount = Math.abs((parseFloat(e.amount) || 0) - (parseFloat(entry.amount) || 0)) < 0.01
        const sameDate = e.date === entry.date
        return sameAmount && sameDate && e.employeeId !== entry.employeeId
      })
    }

    if (sourceExpense) {
      const giverEmp = employees.find(e => e.id === sourceExpense.employeeId)
      const giverName = sourceExpense.employeeName || giverEmp?.name || null
      if (giverName && giverName.toLowerCase().trim() !== String(entry.employeeName || '').toLowerCase().trim()) {
        return buildResult({
          isTransferAdvance: true,
          effectiveEmployeeId: entry.employeeId,
          displayEmployeeName: entry.employeeName || '—',
          displayGivenBy: giverName,
          displayCategory: cleanCat || rawCat
        })
      }
    }
  }

  // 4. Fallback: Parse giver from reason if recorded as "Cash paid from [Name] - ..."
  if (isAdvance && entry.reason && !entry.givenByEmployeeName) {
    const match = String(entry.reason).match(/Cash paid from\s+([^-\n]+)/i)
    if (match) {
      const potentialGiver = match[1].trim()
      if (potentialGiver && potentialGiver.toLowerCase() !== String(entry.employeeName || '').toLowerCase()) {
        const cleanCat = rawCat.replace(/\s*\[[^\]]*\]\s*$/, '').trim()
        return buildResult({
          isTransferAdvance: true,
          effectiveEmployeeId: entry.employeeId,
          displayEmployeeName: entry.employeeName || '—',
          displayGivenBy: potentialGiver,
          displayCategory: cleanCat || rawCat
        })
      }
    }
  }

  return buildResult({
    isTransferAdvance: false,
    effectiveEmployeeId: entry.employeeId,
    displayEmployeeName: entry.employeeName || '—',
    displayGivenBy: entry.givenByEmployeeName || null,
    displayCategory: rawCat
  })
}
