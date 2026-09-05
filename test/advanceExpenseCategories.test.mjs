import test from 'node:test'
import assert from 'node:assert/strict'
import {
  isAdvanceCategory,
  isExpenseCategory,
  isGivenToOthersCategory,
  getAccountingEntryType,
  DEFAULT_ADVANCE_CATEGORIES,
  DEFAULT_EXPENSE_CATEGORIES
} from '../src/lib/advanceExpenseCategories.js'

test('isAdvanceCategory accurately identifies advance categories and excludes expenses', () => {
  assert.equal(isAdvanceCategory('Salary Advance'), true)
  assert.equal(isAdvanceCategory('Travel Advance'), true)
  assert.equal(isAdvanceCategory('Site Advance'), true)
  assert.equal(isAdvanceCategory('Medical Advance'), true)
  assert.equal(isAdvanceCategory('Festival Advance'), true)
  assert.equal(isAdvanceCategory('Others'), true)

  // Should NOT match expense categories
  assert.equal(isAdvanceCategory('Petrol'), false)
  assert.equal(isAdvanceCategory('Food & Refreshment'), false)
  assert.equal(isAdvanceCategory('Given to Others'), false)
  assert.equal(isAdvanceCategory('Given to Others [John Doe]'), false)
  assert.equal(isAdvanceCategory('Subcontractor Payment'), false)
  assert.equal(isAdvanceCategory('Commission'), false)
  assert.equal(isAdvanceCategory('Office Supplies'), false)
})

test('isExpenseCategory accurately identifies expense categories and excludes advances', () => {
  assert.equal(isExpenseCategory('Petrol'), true)
  assert.equal(isExpenseCategory('Food & Refreshment'), true)
  assert.equal(isExpenseCategory('Given to Others'), true)
  assert.equal(isExpenseCategory('Given to Others [Jane Smith]'), true)
  assert.equal(isExpenseCategory('Subcontractor Payment'), true)
  assert.equal(isExpenseCategory('Commission'), true)
  assert.equal(isExpenseCategory('Hotel & Lodging'), true)

  // Should NOT match advance categories
  assert.equal(isExpenseCategory('Salary Advance'), false)
  assert.equal(isExpenseCategory('Travel Advance'), false)
  assert.equal(isExpenseCategory('Site Advance'), false)
  assert.equal(isExpenseCategory('Medical Advance'), false)
  assert.equal(isExpenseCategory('Festival Advance'), false)
})

test('isGivenToOthersCategory recognizes base category and bracketed recipient names', () => {
  assert.equal(isGivenToOthersCategory('Given to Others'), true)
  assert.equal(isGivenToOthersCategory('Given to Others [Rahul Sharma]'), true)
  assert.equal(isGivenToOthersCategory('Petrol'), false)
  assert.equal(isGivenToOthersCategory('Salary Advance'), false)
})

test('getAccountingEntryType accurately classifies older/historical records', () => {
  // 1. Older record with category 'Petrol' saved erroneously with type 'Advance'
  const legacyPetrolEntry = { id: 'legacy-1', category: 'Petrol', type: 'Advance', amount: 500 }
  assert.equal(getAccountingEntryType(legacyPetrolEntry), 'Expense')

  // 2. Older record with category 'Food & Refreshment' saved with type 'Advance'
  const legacyFoodEntry = { id: 'legacy-2', category: 'Food & Refreshment', type: 'Advance', amount: 350 }
  assert.equal(getAccountingEntryType(legacyFoodEntry), 'Expense')

  // 3. Older record with category 'Given to Others' saved with type 'Advance'
  const legacyGivenToOthersEntry = { id: 'legacy-3', category: 'Given to Others [Contractor]', type: 'Advance', amount: 2000 }
  assert.equal(getAccountingEntryType(legacyGivenToOthersEntry), 'Expense')

  // 4. Older record with category 'Salary Advance' saved erroneously with type 'Expense'
  const legacySalaryAdvEntry = { id: 'legacy-4', category: 'Salary Advance', type: 'Expense', amount: 5000 }
  assert.equal(getAccountingEntryType(legacySalaryAdvEntry), 'Advance')

  // 5. Older record with category 'Site Advance' saved with type 'Expense'
  const legacySiteAdvEntry = { id: 'legacy-5', category: 'Site Advance', type: 'Expense', amount: 8000 }
  assert.equal(getAccountingEntryType(legacySiteAdvEntry), 'Advance')

  // 6. Record with unknown custom category falls back to stored type
  const customAdvEntry = { id: 'custom-1', category: 'Tooling Advance', type: 'Advance', amount: 1200 }
  assert.equal(getAccountingEntryType(customAdvEntry), 'Advance')

  const customExpEntry = { id: 'custom-2', category: 'Courier Charges', type: 'Expense', amount: 150 }
  assert.equal(getAccountingEntryType(customExpEntry), 'Expense')
})
