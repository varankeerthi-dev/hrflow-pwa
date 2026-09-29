import assert from 'node:assert/strict'
import test from 'node:test'

import {
  canApproveCommunications,
  canCreateCommunications,
  canDeleteCommunication,
  canEditCommunication,
  canManageCommunications,
  canRequestCommunicationApproval,
  buildLetterAuditSnapshot,
  communicationTabIdForKind,
  deliveryDocId,
  isActiveCommunication,
  isArchivedCommunication,
  nextCommunicationVersion,
  ownsCommunication,
  referenceNumber,
  resolveAudience,
  statusTone,
  summarizeDeliveries,
} from '../src/lib/communications.js'

const employees = [
  { id: 'emp_1', name: 'Asha', status: 'Active', site: 'Chennai', department: 'HR' },
  { id: 'emp_2', name: 'Bala', status: 'Active', site: 'Chennai', department: 'Projects' },
  { id: 'emp_3', name: 'Chitra', status: 'Inactive', site: 'Bengaluru', department: 'Projects' },
]

test('resolves active announcement audiences by organisation, site, department, and named employees', () => {
  assert.deepEqual(resolveAudience(employees, { scope: 'all_active' }).map((employee) => employee.id), ['emp_1', 'emp_2'])
  assert.deepEqual(resolveAudience(employees, { scope: 'site', site: 'chennai' }).map((employee) => employee.id), ['emp_1', 'emp_2'])
  assert.deepEqual(resolveAudience(employees, { scope: 'department', department: 'HR' }).map((employee) => employee.id), ['emp_1'])
  assert.deepEqual(resolveAudience(employees, { scope: 'named', employeeIds: ['emp_2', 'emp_3'] }).map((employee) => employee.id), ['emp_2'])
})

test('maps saved communication kinds to the matching workspace editor tab', () => {
  assert.deepEqual([
    communicationTabIdForKind('letter'),
    communicationTabIdForKind('announcement'),
    communicationTabIdForKind('policy'),
    communicationTabIdForKind('training'),
    communicationTabIdForKind('template'),
  ], ['letters', 'announcements', 'policies', 'training', 'templates'])
  assert.equal(communicationTabIdForKind('unknown'), null)
})

test('generates deterministic recipient delivery IDs and readable references', () => {
  assert.equal(deliveryDocId('announcement', 'abc/123', 'emp_1'), 'announcement_abc_123_emp_1')
  assert.equal(referenceNumber('letter', 'abcdef123456'), 'HRF/LET/123456')
})

test('treats published communication as active until expiry and identifies historical states', () => {
  assert.equal(isActiveCommunication({ state: 'published' }, new Date('2026-08-20')), true)
  assert.equal(isActiveCommunication({ state: 'published', expiresAt: '2026-08-19' }, new Date('2026-08-20')), false)
  assert.equal(isActiveCommunication({ state: 'published', expiresAt: '2026-08-20' }, new Date('2026-08-20T12:00:00')), true)
  assert.equal(isActiveCommunication({ state: 'withdrawn' }, new Date('2026-08-20')), false)
  assert.equal(isArchivedCommunication({ state: 'superseded' }), true)
  assert.equal(isArchivedCommunication({ state: 'published', expiresAt: '2026-08-19' }, new Date('2026-08-20')), true)
  assert.equal(isArchivedCommunication({ state: 'published', expiresAt: '2026-08-21' }, new Date('2026-08-20')), false)
})

test('separates create, edit, delete, and approval capability from record ownership', () => {
  const owner = { uid: 'u1', name: 'Asha', role: 'employee', permissions: { HRLetters: { edit: true, delete: true } } }
  const other = { uid: 'u2', name: 'Bala', role: 'employee', permissions: { HRLetters: { edit: true, delete: true } } }
  const record = { createdBy: 'u1', createdById: 'u1', createdByName: 'Asha' }
  assert.equal(canCreateCommunications({ role: 'employee', permissions: { HRLetters: { create: true } } }), true)
  assert.equal(canManageCommunications({ role: 'employee', permissions: { HRLetters: { create: true } } }), true)
  assert.equal(canManageCommunications({ role: 'employee', permissions: { HRLetters: { approve: true } } }), true)
  assert.equal(ownsCommunication(record, owner), true)
  assert.equal(canEditCommunication(record, owner), true)
  assert.equal(canDeleteCommunication(record, owner), true)
  assert.equal(canEditCommunication(record, other), false)
  assert.equal(canDeleteCommunication(record, other), false)
  const creatorOnly = { uid: 'u1', name: 'Asha', role: 'employee', permissions: { HRLetters: { create: true } } }
  assert.equal(canRequestCommunicationApproval(record, creatorOnly), true)
  assert.equal(canEditCommunication(record, creatorOnly), false)
  assert.equal(canDeleteCommunication(record, creatorOnly), false)
  assert.equal(canApproveCommunications({ role: 'MD' }), true)
  assert.equal(canApproveCommunications({ role: 'employee', permissions: { HRLetters: { approve: false } } }), false)
  assert.equal(canEditCommunication(record, { role: 'admin', uid: 'admin' }), true)
})

test('captures fixed Promotion fields in the auditable letter snapshot', () => {
  assert.deepEqual(buildLetterAuditSnapshot({
    letterType: 'Promotion', employeeId: 'emp_1', employeeName: 'Asha', formatId: 'promotion', source: 'legacy_format_generator',
    documentDate: '2026-08-21', effectiveDate: '2026-09-01', previousDesignation: 'Project Engineer', promotedDesignation: 'Senior Project Engineer', formatVariables: { effectiveFrom: '2026-09-01' }, body: 'Fixed wording',
  }), {
    letterType: 'Promotion', title: 'Promotion', state: 'draft', employeeId: 'emp_1', employeeName: 'Asha', formatId: 'promotion', source: 'legacy_format_generator',
    documentDate: '2026-08-21', effectiveDate: '2026-09-01', previousDesignation: 'Project Engineer', promotedDesignation: 'Senior Project Engineer', formatVariables: { effectiveFrom: '2026-09-01' }, issueReference: '', bodySnapshot: 'Fixed wording',
  })
})

test('increments communication versions and summarizes employee response status', () => {
  assert.equal(nextCommunicationVersion({ version: 1 }), 2)
  assert.equal(nextCommunicationVersion({}), 2)
  assert.deepEqual(summarizeDeliveries([
    { sourceId: 'policy_1', status: 'acknowledged' },
    { sourceId: 'policy_1', status: 'seen' },
    { sourceId: 'policy_1', status: 'delivered' },
    { sourceId: 'other', status: 'delivered' },
  ], 'policy_1'), { total: 3, acknowledged: 1, seen: 1, pending: 1 })
  assert.match(statusTone('published'), /emerald/)
})
