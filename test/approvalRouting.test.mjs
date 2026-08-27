import test from 'node:test'
import assert from 'node:assert/strict'
import { requiresStandardApproval } from '../src/lib/portalApprovalWorkflow.js'

test('employee expenses bypass approval when the Expense policy is absent', () => {
  assert.equal(requiresStandardApproval([], 'Expense'), false)
  assert.equal(requiresStandardApproval([{ moduleName: 'Leave', type: 'multi' }], 'Expense'), false)
})

test('employee expenses bypass approval when the Expense policy is set to none', () => {
  assert.equal(requiresStandardApproval([{ moduleName: 'Expense', type: 'none' }], 'Expense'), false)
})

test('employee expenses require approval only for a configured Expense workflow', () => {
  assert.equal(requiresStandardApproval([{ moduleName: 'Expense', type: 'single', approvers: ['HR'] }], 'Expense'), true)
  assert.equal(requiresStandardApproval([{ moduleName: 'Expense', type: 'multi', stages: [{ role: 'HR' }, { role: 'MD' }] }], 'Expense'), true)
})
