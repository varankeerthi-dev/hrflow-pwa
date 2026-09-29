import test from 'node:test'
import assert from 'node:assert/strict'
import { isPostSupportedBy, normalizeReplyText, validateReplyText } from '../src/lib/engagementActions.js'

test('support state is tied to the signed-in user and keeps legacy posts unsupported', () => {
  assert.equal(isPostSupportedBy({ id: 'legacy' }, 'u1'), false)
  assert.equal(isPostSupportedBy({ supporterIds: ['u1', 'u2'] }, 'u1'), true)
  assert.equal(isPostSupportedBy({ supporterIds: ['u1'] }, 'u2'), false)
  assert.equal(isPostSupportedBy({ supporterIds: ['u1'] }, ''), false)
})

test('replies are normalized and reject empty or overlong messages', () => {
  assert.equal(normalizeReplyText('  Please check this.  '), 'Please check this.')
  assert.equal(validateReplyText('   '), 'Write a reply before sending.')
  assert.equal(validateReplyText('a'.repeat(2001)), 'Replies must be 2,000 characters or fewer.')
  assert.equal(validateReplyText('All set.'), '')
})
