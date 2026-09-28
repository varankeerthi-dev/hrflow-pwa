import test from 'node:test'
import assert from 'node:assert/strict'
import { maskSensitiveValue } from '../src/lib/sensitiveData.js'

test('masks all but the last four characters by default', () => {
  assert.equal(maskSensitiveValue('123456789012'), '••••••••9012')
  assert.equal(maskSensitiveValue('ABCDE1234F'), '••••••234F')
})

test('fully masks values with four or fewer characters', () => {
  assert.equal(maskSensitiveValue('1234'), '••••')
  assert.equal(maskSensitiveValue('AB'), '••')
})

test('supports a custom visible-character count', () => {
  assert.equal(maskSensitiveValue('12345678', 2), '••••••78')
  assert.equal(maskSensitiveValue('12345678', 0), '••••••••')
})

test('returns an empty string for missing or whitespace-only values', () => {
  assert.equal(maskSensitiveValue(undefined), '')
  assert.equal(maskSensitiveValue(null), '')
  assert.equal(maskSensitiveValue('   '), '')
})
