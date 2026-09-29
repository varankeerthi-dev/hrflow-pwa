import test from 'node:test'
import assert from 'node:assert/strict'
import { groupDocumentVersions, MAX_DOCUMENT_UPLOAD_BYTES, validateDocumentFile } from '../src/lib/documentManagement.js'

test('document upload validation allows supported non-empty files up to 25 MB', () => {
  assert.equal(validateDocumentFile({ name: 'policy.pdf', size: 10, type: 'application/pdf' }), '')
  assert.equal(validateDocumentFile({ name: 'policy.exe', size: 10, type: 'application/octet-stream' }).startsWith('Supported'), true)
  assert.equal(validateDocumentFile({ name: 'policy.pdf', size: MAX_DOCUMENT_UPLOAD_BYTES + 1 }).startsWith('Files must'), true)
  assert.equal(validateDocumentFile({ name: 'empty.pdf', size: 0 }).startsWith('The selected file is empty'), true)
})

test('version grouping picks the highest version and keeps legacy URL records visible', () => {
  const groups = groupDocumentVersions([
    { id: 'newer-date-old-version', documentGroupId: 'a', version: 1, name: 'Handbook', createdAt: '2026-08-01' },
    { id: 'v2', documentGroupId: 'a', version: 2, name: 'Handbook', createdAt: '2026-07-01' },
    { id: 'legacy', name: 'Legacy URL record', url: 'https://example.com/policy.pdf' },
  ])
  assert.equal(groups.length, 2)
  const handbook = groups.find((group) => group.id === 'a')
  assert.equal(handbook.current.id, 'v2')
  assert.equal(handbook.versions.length, 2)
  assert.equal(groups.find((group) => group.id === 'legacy').current.url, 'https://example.com/policy.pdf')
})
