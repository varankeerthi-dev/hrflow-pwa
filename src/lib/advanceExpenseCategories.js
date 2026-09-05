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

  const list = (advanceCategories && advanceCategories.length > 0 ? advanceCategories : DEFAULT_ADVANCE_CATEGORIES)
    .map(c => (typeof c === 'string' ? c : c?.name || '').trim().toLowerCase())
    .filter(Boolean)
  if (list.includes(clean)) return true

  // Fallback keyword check: e.g. "Salary Advance", "Travel Advance", "Site Advance", etc.
  // "given to others" is explicitly NOT an advance
  if (clean.includes('advance') && !clean.includes('given to others') && !clean.includes('salary to others')) {
    return true
  }

  return false
}

export function isExpenseCategory(cat, expenseCategories = []) {
  if (!cat) return false
  const raw = typeof cat === 'string' ? cat : cat?.name || ''
  const clean = String(raw).replace(/\s*\[[^\]]*\]\s*$/, '').trim().toLowerCase()
  if (!clean) return false

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
  if (clean.includes('expense') && !clean.includes('advance')) return true

  return false
}

export function getAccountingEntryType(entry, advanceCats = [], expenseCats = []) {
  if (!entry) return 'Expense'
  const rawCategory = entry.category || ''
  const cleanCategory = String(rawCategory).replace(/\s*\[[^\]]*\]\s*$/, '').trim()

  // 1. Definite Expense category (even if legacy document was saved with type='Advance')
  if (cleanCategory && isExpenseCategory(cleanCategory, expenseCats)) {
    return 'Expense'
  }

  // 2. Definite Advance category (even if legacy document was saved with type='Expense')
  if (cleanCategory && isAdvanceCategory(cleanCategory, advanceCats)) {
    return 'Advance'
  }

  // 3. String heuristics
  const lower = cleanCategory.toLowerCase()
  if (lower.includes('given to others') || lower.includes('salary to others')) {
    return 'Expense'
  }
  if (lower.includes('advance')) {
    return 'Advance'
  }
  if (lower.includes('expense')) {
    return 'Expense'
  }

  // 4. Stored document type fallback
  if (entry.type === 'Advance') return 'Advance'
  if (entry.type === 'Expense') return 'Expense'

  return 'Expense'
}
