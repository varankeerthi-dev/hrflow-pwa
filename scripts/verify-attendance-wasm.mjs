import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { spawnSync } from 'node:child_process'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { calculateChargeableLateMinutes } from '../src/lib/attendancePolicy.js'

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const manifestPath = resolve(repoRoot, 'rust/attendance-policy/Cargo.toml')
const wasmPath = resolve(
  repoRoot,
  'rust/attendance-policy/target/wasm32-unknown-unknown/release/hrflow_attendance_policy.wasm',
)

const build = spawnSync(
  'cargo',
  ['build', '--manifest-path', manifestPath, '--release', '--target', 'wasm32-unknown-unknown'],
  { cwd: repoRoot, stdio: 'inherit' },
)
if (build.error) throw build.error
if (build.status !== 0) process.exit(build.status ?? 1)

const wasmBytes = await readFile(wasmPath)
const { instance } = await WebAssembly.instantiate(wasmBytes)
const wasmCalculate = instance.exports.calculate_chargeable_late_minutes
assert.equal(typeof wasmCalculate, 'function', 'WASM must export the numeric attendance function')

const fixturePath = resolve(
  repoRoot,
  'rust/attendance-policy/fixtures/chargeable-late-minutes.csv',
)
const fixtureLines = (await readFile(fixturePath, 'utf8')).trim().split(/\r?\n/)
assert.ok(fixtureLines.length > 1, 'shared parity fixture must contain cases')

function parseNumber(value) {
  return Number(value)
}

function display(value) {
  return Number.isNaN(value) ? 'NaN' : Object.is(value, -0) ? '-0' : String(value)
}

let caseCount = 0
for (const [index, line] of fixtureLines.slice(1).entries()) {
  const [caseName, rawText, graceText, expectedText] = line.split(',')
  assert.ok(caseName && rawText !== undefined && graceText !== undefined && expectedText !== undefined,
    `malformed shared fixture row ${index + 2}`)

  const rawLateMinutes = parseNumber(rawText)
  const arrivalGraceMinutes = parseNumber(graceText)
  const expected = parseNumber(expectedText)
  const jsActual = calculateChargeableLateMinutes({ rawLateMinutes, arrivalGraceMinutes })
  const wasmActual = wasmCalculate(rawLateMinutes, arrivalGraceMinutes)

  assert.ok(Object.is(jsActual, expected),
    `${caseName}: JS expected ${display(expected)}, got ${display(jsActual)}`)
  assert.ok(Object.is(wasmActual, expected),
    `${caseName}: WASM expected ${display(expected)}, got ${display(wasmActual)}`)
  caseCount += 1
}

console.log(`PASS: ${caseCount} shared numeric vectors matched the JS helper and actual WASM export.`)
