import assert from 'node:assert/strict'
import test from 'node:test'

import {
  canApproveCommunications,
  canManageCommunications,
  buildLetterAuditSnapshot,
  deliveryDocId,
  isActiveCommunication,
  referenceNumber,
  resolveAudience,
  statusTone,
} from '../src/lib/communications.js'

const employees = [
  { id: 'emp_1', name: 'Asha', status: 'Active', site: 'Chennai', department: 'HR' },
  { id: 'emp_2', name: 'Bala', status: 'Active', site: 'Chennai', department: 'Projects' },
  { id: 'emp_3', name: 'Chitra', status: 'Inactive', site: 'Bengaluru', department: 'Projects' },
]

test('resolves active announcement audiences by organisation, site, department, and named employees', () => {
  assert.deepEqual(resolveAudience(employees, { scope: 'all_active' }).map((employee) => employee.id), ['emp_1', 'emp_2'])
  assert.deepEqual(resolveAudience(employees, { scope: 'site', site: 'Chennai' }).map((employee) => employee.id), ['emp_1', 'emp_2'])
  assert.deepEqual(resolveAudience(employees, { scope: 'department', department: 'HR' }).map((employee) => employee.id), ['emp_1'])
  assert.deepEqual(resolveAudience(employees, { scope: 'named', employeeIds: ['emp_2', 'emp_3'] }).map((employee) => employee.id), ['emp_2'])
})

test('generates deterministic recipient delivery IDs and readable references', () => {
  assert.equal(deliveryDocId('announcement', 'abc/123', 'emp_1'), 'announcement_abc_123_emp_1')
  assert.equal(referenceNumber('letter', 'abcdef123456'), 'HRF/LET/123456')
})

test('treats published communication as active until its expiry and rejects withdrawn content', () => {
  assert.equal(isActiveCommunication({ state: 'published' }, new Date('2026-08-20')), true)
  assert.equal(isActiveCommunication({ state: 'published', expiresAt: '2026-08-19' }, new Date('2026-08-20')), false)
  assert.equal(isActiveCommunication({ state: 'withdrawn' }, new Date('2026-08-20')), false)
})

test('recognises HR communication management and approval permissions without granting employees access', () => {
  assert.equal(canManageCommunications({ role: 'HR' }), true)
  assert.equal(canApproveCommunications({ role: 'MD' }), true)
  assert.equal(canManageCommunications({ role: 'employee', permissions: { HRLetters: { create: true } } }), true)
  assert.equal(canApproveCommunications({ role: 'employee', permissions: { HRLetters: { approve: false } } }), false)
  assert.equal(canManageCommunications({ role: 'employee' }), false)
  assert.match(statusTone('published'), /emerald/)
})

test('captures fixed Promotion fields in the auditable letter snapshot', () => {
  assert.deepEqual(buildLetterAuditSnapshot({
    letterType: 'Promotion', employeeId: 'emp_1', employeeName: 'Asha', formatId: 'promotion', source: 'legacy_format_generator',
    documentDate: '2026-08-21', effectiveDate: '2026-09-01', previousDesignation: 'Project Engineer', promotedDesignation: 'Senior Project Engineer', body: 'Fixed wording',
  }), {
    letterType: 'Promotion', title: 'Promotion', state: 'draft', employeeId: 'emp_1', employeeName: 'Asha', formatId: 'promotion', source: 'legacy_format_generator',
    documentDate: '2026-08-21', effectiveDate: '2026-09-01', previousDesignation: 'Project Engineer', promotedDesignation: 'Senior Project Engineer', issueReference: '', bodySnapshot: 'Fixed wording',
  })
})
