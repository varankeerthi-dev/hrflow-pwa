import test from 'node:test'
import assert from 'node:assert/strict'
import {
  isAdvanceCategory,
  isExpenseCategory,
  isPetrolCategory,
  isGivenToOthersCategory,
  getAccountingEntryType,
  resolveReportEntryDetails,
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
  assert.equal(isAdvanceCategory('Sitepetrol'), false)
  assert.equal(isAdvanceCategory('Site Petrol'), false)
  assert.equal(isAdvanceCategory('Fuel'), false)
  assert.equal(isAdvanceCategory('Diesel'), false)
  // Even if explicitly passed in advanceCategories array, petrol/sitepetrol must be rejected
  assert.equal(isAdvanceCategory('Petrol', ['Petrol', 'Salary Advance']), false)
  assert.equal(isAdvanceCategory('Sitepetrol', ['Sitepetrol', 'Salary Advance']), false)
  assert.equal(isAdvanceCategory('Food & Refreshment'), false)
  assert.equal(isAdvanceCategory('Given to Others'), false)
  assert.equal(isAdvanceCategory('Given to Others [John Doe]'), false)
  assert.equal(isAdvanceCategory('Subcontractor Payment'), false)
  assert.equal(isAdvanceCategory('Commission'), false)
  assert.equal(isAdvanceCategory('Office Supplies'), false)
})

test('isPetrolCategory detects fuel and petrol categories', () => {
  assert.equal(isPetrolCategory('Petrol'), true)
  assert.equal(isPetrolCategory('Sitepetrol'), true)
  assert.equal(isPetrolCategory('Site Petrol'), true)
  assert.equal(isPetrolCategory('site_petrol'), true)
  assert.equal(isPetrolCategory('Fuel'), true)
  assert.equal(isPetrolCategory('Diesel'), true)
  assert.equal(isPetrolCategory('Salary Advance'), false)
  assert.equal(isPetrolCategory('Office Supplies'), false)
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
  assert.equal(isExpenseCategory('Fuel Advance'), false)
  assert.equal(isExpenseCategory('Food Advance'), false)
  assert.equal(isExpenseCategory('Hotel Advance'), false)
  assert.equal(isExpenseCategory('Petrol Advance'), false)
  assert.equal(isExpenseCategory('Hardware Advance'), false)
})

test('isGivenToOthersCategory recognizes base category and bracketed recipient names', () => {
  assert.equal(isGivenToOthersCategory('Given to Others'), true)
  assert.equal(isGivenToOthersCategory('Given to Others [Rahul Sharma]'), true)
  assert.equal(isGivenToOthersCategory('Petrol'), false)
  assert.equal(isGivenToOthersCategory('Salary Advance'), false)
})

test('getAccountingEntryType preserves stored entry.type and correctly classifies legacy records', () => {
  // 1. Entry created on Expense tab with type 'Expense' stays Expense even if category exists in advance (e.g. Petrol)
  const expensePetrol = { id: 'exp-1', category: 'Petrol', type: 'Expense', amount: 500 }
  assert.equal(getAccountingEntryType(expensePetrol), 'Expense')

  // 2. Entry created with explicit advance category (e.g. Salary Advance) strictly resolves to Advance
  const expenseSalaryAdv = { id: 'exp-2', category: 'Salary Advance', type: 'Expense', amount: 5000 }
  assert.equal(getAccountingEntryType(expenseSalaryAdv), 'Advance')

  // 3. Petrol and Sitepetrol are strictly Expenses (even if legacy/misclassified documents were stored with type: 'Advance')
  const advancePetrol = { id: 'adv-1', category: 'Petrol', type: 'Advance', amount: 1000 }
  assert.equal(getAccountingEntryType(advancePetrol), 'Expense')
  const advanceSitepetrol = { id: 'adv-site-1', category: 'Sitepetrol', type: 'Advance', amount: 1200 }
  assert.equal(getAccountingEntryType(advanceSitepetrol), 'Expense')

  // 4. Entry created on Advance tab with type 'Advance' stays Advance for advance categories
  const advanceSalary = { id: 'adv-2', category: 'Salary Advance', type: 'Advance', amount: 8000 }
  assert.equal(getAccountingEntryType(advanceSalary), 'Advance')

  // 5. Older record with category 'Given to Others' saved with type 'Advance' is classified as Expense (legacy giver bug)
  const legacyGivenToOthersEntry = { id: 'legacy-3', category: 'Given to Others [Contractor]', type: 'Advance', amount: 2000 }
  assert.equal(getAccountingEntryType(legacyGivenToOthersEntry), 'Expense')

  // 6. Legacy unclassified records (without type) infer type by category
  assert.equal(getAccountingEntryType({ id: 'leg-1', category: 'Petrol', amount: 400 }), 'Expense')
  assert.equal(getAccountingEntryType({ id: 'leg-2', category: 'Food & Refreshment', amount: 200 }), 'Expense')
  assert.equal(getAccountingEntryType({ id: 'leg-3', category: 'Salary Advance', amount: 3000 }), 'Advance')
  assert.equal(getAccountingEntryType({ id: 'leg-4', category: 'Travel Advance', amount: 1500 }), 'Advance')

  // 7. Custom categories fall back to stored type
  const customAdvEntry = { id: 'custom-1', category: 'Tooling Advance', type: 'Advance', amount: 1200 }
  assert.equal(getAccountingEntryType(customAdvEntry), 'Advance')

  const customExpEntry = { id: 'custom-2', category: 'Courier Charges', type: 'Expense', amount: 150 }
  assert.equal(getAccountingEntryType(customExpEntry), 'Expense')
})

test('resolveReportEntryDetails attributes transferred advance to recipient employee instead of giver', () => {
  const employees = [
    { id: 'emp-1', name: 'Employee A' },
    { id: 'emp-2', name: 'Employee B' }
  ]

  // 1. Advance recorded as Others [Employee B] by Employee A (the giver)
  const advanceTransfer = {
    id: 'tx-1',
    employeeId: 'emp-1',
    employeeName: 'Employee A',
    category: 'Others [Employee B]',
    type: 'Advance',
    amount: 3000
  }
  const details = resolveReportEntryDetails(advanceTransfer, employees)
  assert.equal(details.isTransferAdvance, true)
  assert.equal(details.displayEmployeeName, 'Employee B')
  assert.equal(details.displayGivenBy, 'Employee A')
  assert.equal(details.effectiveEmployeeId, 'emp-2')
  assert.equal(details.displayCategory, 'Others')

  // 2. Normal advance for Employee A (not transferred)
  const normalAdvance = {
    id: 'tx-2',
    employeeId: 'emp-1',
    employeeName: 'Employee A',
    category: 'Salary Advance',
    type: 'Advance',
    amount: 5000
  }
  const normalDetails = resolveReportEntryDetails(normalAdvance, employees)
  assert.equal(normalDetails.isTransferAdvance, false)
  assert.equal(normalDetails.displayEmployeeName, 'Employee A')
  assert.equal(normalDetails.displayGivenBy, null)
  assert.equal(normalDetails.effectiveEmployeeId, 'emp-1')

  // 3. Explicit advance with givenByEmployeeName
  const explicitAdvance = {
    id: 'tx-3',
    employeeId: 'emp-2',
    employeeName: 'Employee B',
    category: 'Cash Advance (Paid)',
    type: 'Advance',
    givenByEmployeeName: 'Employee A',
    amount: 2000
  }
  const explicitDetails = resolveReportEntryDetails(explicitAdvance, employees)
  assert.equal(explicitDetails.displayEmployeeName, 'Employee B')
  assert.equal(explicitDetails.displayGivenBy, 'Employee A')
  assert.equal(explicitDetails.effectiveEmployeeId, 'emp-2')

  // 4. Linked advance without givenByEmployeeName, resolved via allEntries
  const linkedExpense = {
    id: 'exp-100',
    employeeId: 'emp-1',
    employeeName: 'Employee A',
    category: 'Given to Others',
    type: 'Expense',
    paidTo: 'emp-2',
    paidToName: 'Employee B',
    amount: 1000,
    date: '2026-09-01'
  }
  const linkedAdvance = {
    id: 'adv-100',
    employeeId: 'emp-2',
    employeeName: 'Employee B',
    category: 'Cash Advance (Paid)',
    type: 'Advance',
    amount: 1000,
    date: '2026-09-01',
    linkedExpenseId: 'exp-100'
  }
  const linkedDetails = resolveReportEntryDetails(linkedAdvance, employees, [linkedExpense, linkedAdvance])
  assert.equal(linkedDetails.displayEmployeeName, 'Employee B')
  assert.equal(linkedDetails.displayGivenBy, 'Employee A')
  assert.equal(linkedDetails.effectiveEmployeeId, 'emp-2')

  // 5. Linked advance with outdated Cash paid from [Admin], resolved via allEntries
  const mismatchAdvance = {
    id: 'adv-102',
    employeeId: 'emp-2',
    employeeName: 'Keerthivaran',
    category: 'Cash Advance (Paid)',
    type: 'Advance',
    amount: 1000,
    date: '2026-09-01',
    reason: 'Cash paid from Keerthivaran - Given to Others',
    linkedExpenseId: 'exp-200'
  }
  const karthikExpense = {
    id: 'exp-200',
    employeeId: 'emp-karthik',
    employeeName: 'Karthik',
    category: 'Given to Others',
    type: 'Expense',
    paidTo: 'emp-2',
    paidToName: 'Keerthivaran',
    amount: 1000,
    date: '2026-09-01'
  }
  const mismatchDetails = resolveReportEntryDetails(mismatchAdvance, [{ id: 'emp-2', name: 'Keerthivaran' }, { id: 'emp-karthik', name: 'Karthik' }], [karthikExpense, mismatchAdvance])
  assert.equal(mismatchDetails.displayEmployeeName, 'Keerthivaran')
  assert.equal(mismatchDetails.displayGivenBy, 'Karthik')
  assert.equal(mismatchDetails.displayRemarks, 'Cash paid from Karthik - Given to Others')
})

test('resolveReportEntryDetails attributes out-of-pocket Given to Others expense to the giver (Employee A) with recipient (Employee B)', () => {
  const employees = [
    { id: 'emp-1', name: 'Employee A' },
    { id: 'emp-2', name: 'Employee B' }
  ]

  // 1. Standard historical out-of-pocket expense format
  const standardExpense = {
    id: 'exp-std-1',
    employeeId: 'emp-1',
    employeeName: 'Employee A',
    category: 'Given to Others [Employee B]',
    type: 'Expense',
    paidTo: 'emp-2',
    paidToName: 'Employee B',
    amount: 500
  }
  assert.equal(getAccountingEntryType(standardExpense), 'Expense')
  const stdDetails = resolveReportEntryDetails(standardExpense, employees)
  assert.equal(stdDetails.effectiveEmployeeId, 'emp-1')
  assert.equal(stdDetails.displayEmployeeName, 'Employee A')
  assert.equal(stdDetails.recipientName, 'Employee B')

  // 2. Yesterday's format (where employeeId was stored as recipient, givenByEmployeeId as giver, type: 'Advance')
  const yesterdayExpense = {
    id: 'exp-yest-1',
    employeeId: 'emp-2',
    employeeName: 'Employee B',
    givenByEmployeeId: 'emp-1',
    givenByEmployeeName: 'Employee A',
    category: 'Given to Others [Employee B]',
    type: 'Advance',
    amount: 750
  }
  assert.equal(getAccountingEntryType(yesterdayExpense), 'Expense')
  const yestDetails = resolveReportEntryDetails(yesterdayExpense, employees)
  assert.equal(yestDetails.effectiveEmployeeId, 'emp-1')
  assert.equal(yestDetails.displayEmployeeName, 'Employee A')
  assert.equal(yestDetails.recipientName, 'Employee B')

  // 3. Pure Company Bank Account advance with "Given to Others" category remains an Advance
  const bankAdvance = {
    id: 'adv-bank-1',
    employeeId: 'emp-2',
    employeeName: 'Employee B',
    category: 'Given to Others',
    type: 'Advance',
    paymentSource: 'company_account',
    companyAccount: 'Main Bank Account',
    amount: 5000
  }
  assert.equal(getAccountingEntryType(bankAdvance), 'Advance')
  const bankDetails = resolveReportEntryDetails(bankAdvance, employees)
  assert.equal(bankDetails.isTransferAdvance, true)
  assert.equal(bankDetails.effectiveEmployeeId, 'emp-2')
  assert.equal(bankDetails.displayEmployeeName, 'Employee B')
  assert.equal(bankDetails.displayGivenBy, 'Bank: Main Bank Account')
})

test('sidepanel partitioning: Add Advance and Add Expense attribute properly to Self vs Employee', () => {
  const employees = [
    { id: 'emp-user', name: 'Logged In User' },
    { id: 'emp-other', name: 'Other Employee' }
  ]

  // Scenario 1: Add Advance -> User gave advance to Employee B
  // Beneficiary (receiver) is Other Employee. Even though User is giver, it belongs to Employee Advance!
  const advanceGivenByUser = {
    id: 'adv-given-1',
    employeeId: 'emp-other',
    employeeName: 'Other Employee',
    givenByEmployeeId: 'emp-user',
    givenByEmployeeName: 'Logged In User',
    category: 'Cash Advance (Paid)',
    type: 'Advance',
    amount: 1500
  }
  const advDetails = resolveReportEntryDetails(advanceGivenByUser, employees)
  assert.equal(advDetails.effectiveEmployeeId, 'emp-other')
  // For User (emp-user): effectiveEmployeeId !== emp-user -> NOT Self Advance (it is Employee Advance)
  assert.notEqual(advDetails.effectiveEmployeeId, 'emp-user')

  // Scenario 2: Add Advance -> User received advance from company or another employee
  const advanceReceivedByUser = {
    id: 'adv-recv-1',
    employeeId: 'emp-user',
    employeeName: 'Logged In User',
    category: 'Salary Advance',
    type: 'Advance',
    amount: 5000
  }
  const advRecvDetails = resolveReportEntryDetails(advanceReceivedByUser, employees)
  assert.equal(advRecvDetails.effectiveEmployeeId, 'emp-user') // Self Advance

  // Scenario 3: Add Expense -> Other Employee incurred expense even though paid advance to user
  // Other Employee is the one who incurred the expense. Belongs to Employee Expense!
  const expenseIncurredByOther = {
    id: 'exp-other-1',
    employeeId: 'emp-other',
    employeeName: 'Other Employee',
    category: 'Given to Others [Logged In User]',
    paidTo: 'emp-user',
    paidToName: 'Logged In User',
    type: 'Expense',
    amount: 800
  }
  const expOtherDetails = resolveReportEntryDetails(expenseIncurredByOther, employees)
  assert.equal(expOtherDetails.effectiveEmployeeId, 'emp-other')
  // For User (emp-user): effectiveEmployeeId !== emp-user -> NOT Self Expense (it is Employee Expense)
  assert.notEqual(expOtherDetails.effectiveEmployeeId, 'emp-user')

  // Scenario 4: Add Expense -> User incurred expense giving cash to Other Employee
  // User is the one who incurred the expense out of pocket. Belongs to Self Expense!
  const expenseIncurredByUser = {
    id: 'exp-user-1',
    employeeId: 'emp-user',
    employeeName: 'Logged In User',
    category: 'Given to Others [Other Employee]',
    paidTo: 'emp-other',
    paidToName: 'Other Employee',
    type: 'Expense',
    amount: 1200
  }
  const expUserDetails = resolveReportEntryDetails(expenseIncurredByUser, employees)
  assert.equal(expUserDetails.effectiveEmployeeId, 'emp-user') // Self Expense
})

