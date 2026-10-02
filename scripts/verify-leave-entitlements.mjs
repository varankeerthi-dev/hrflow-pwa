import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import {
  applyEntitlementLimit,
  calculateAccruedEntitlement,
  calculateLeaveBalance,
  calculateUnpaidSalaryImpact,
  getConfiguredLeaveTypes,
  getLeaveTypeDefinition,
  getLeavePolicyForDate,
  isLeaveEntitlementConfigured,
  normalizeLeaveTypeCode,
} from '../src/lib/leaveEntitlements.js'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const fixturePath = path.join(root, 'rust/leave-entitlements/fixtures/parity-cases.json')
const cratePath = path.join(root, 'rust/leave-entitlements/Cargo.toml')
const cases = JSON.parse(await readFile(fixturePath, 'utf8'))

function jsonValue(value) {
  return JSON.parse(JSON.stringify(value))
}

function runJavaScriptReference(testCase) {
  const orgData = testCase.orgData ?? {}
  switch (testCase.op) {
    case 'normalize':
      return normalizeLeaveTypeCode(
        testCase.value,
        testCase.orgData === undefined ? undefined : getConfiguredLeaveTypes(orgData),
      )
    case 'configuredTypes':
      return getConfiguredLeaveTypes(orgData)
    case 'definition':
      return getLeaveTypeDefinition(orgData, testCase.leaveType)
    case 'isConfigured':
      return isLeaveEntitlementConfigured(testCase.policy)
    case 'policy':
      return getLeavePolicyForDate(orgData, testCase.leaveType, testCase.date)
    case 'accrual':
      return calculateAccruedEntitlement(orgData, testCase.leaveType, testCase.asOf)
    case 'balance':
      return calculateLeaveBalance({
        orgData,
        leaveType: testCase.leaveType,
        ledgerEntries: testCase.ledgerEntries,
        requests: testCase.requests,
        asOf: testCase.asOf,
      })
    case 'limit':
      return applyEntitlementLimit(
        testCase.candidates,
        testCase.availableUnits,
        testCase.overuseMode,
      )
    case 'salaryImpact':
      return calculateUnpaidSalaryImpact(testCase.input)
    default:
      throw new Error(`unsupported fixture op: ${testCase.op}`)
  }
}

const rust = spawnSync(
  'cargo',
  ['run', '--offline', '--quiet', '--manifest-path', cratePath, '--bin', 'leave-entitlements-parity'],
  { cwd: root, input: JSON.stringify(cases), encoding: 'utf8' },
)
if (rust.error) throw rust.error
if (rust.status !== 0) {
  process.stderr.write(rust.stderr)
  process.exit(rust.status ?? 1)
}
const rustResults = JSON.parse(rust.stdout)
assert.equal(rustResults.length, cases.length, 'Rust returned a result for every shared fixture')

for (const [index, testCase] of cases.entries()) {
  const reference = jsonValue(runJavaScriptReference(testCase))
  assert.deepStrictEqual(
    reference,
    testCase.expected,
    `${testCase.name}: frozen expected output must still match the JavaScript reference`,
  )
  assert.deepStrictEqual(
    jsonValue(rustResults[index]),
    testCase.expected,
    `${testCase.name}: Rust output differs from the shared expected result`,
  )
}

console.log(`PASS: ${cases.length} shared leave-entitlement fixtures matched frozen outputs, the JS reference, and Rust.`)
