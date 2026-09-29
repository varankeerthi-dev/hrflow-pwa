import test from 'node:test'
import assert from 'node:assert/strict'
import {
  createLifecycleChecklist,
  getChecklistProgress,
  validateExitDate,
  validateOnboardingEmployee,
} from '../src/lib/employeeLifecycle.js'

test('onboarding and offboarding checklists are distinct and start incomplete', () => {
  const onboarding = createLifecycleChecklist('onboarding')
  const offboarding = createLifecycleChecklist('offboarding')
  assert.equal(onboarding.length, 5)
  assert.equal(offboarding.length, 6)
  assert.equal(getChecklistProgress(onboarding).isComplete, false)
  assert.ok(onboarding.every((item) => item.completed === false))
})

test('checklist progress requires every defined item', () => {
  const checklist = createLifecycleChecklist('onboarding')
  checklist[0].completed = true
  const partial = getChecklistProgress(checklist)
  assert.equal(partial.completed, 1)
  assert.equal(partial.percent, 20)
  assert.equal(partial.isComplete, false)
  checklist.forEach((item) => { item.completed = true })
  assert.equal(getChecklistProgress(checklist).isComplete, true)
})

test('onboarding requires a name and valid actual joining date', () => {
  const today = new Date(2026, 8, 29)
  assert.deepEqual(validateOnboardingEmployee({ name: '', joinedDate: '' }, today), {
    name: 'Employee name is required.',
    joinedDate: 'A valid joining date is required.',
  })
  assert.equal(validateOnboardingEmployee({ name: 'Asha Rao', joinedDate: '2026-09-30' }, today).joinedDate, 'Create the active employee record on or after the actual joining date.')
  assert.deepEqual(validateOnboardingEmployee({ name: 'Asha Rao', joinedDate: '2026-09-29' }, today), {})
})

test('offboarding cannot be completed before last working date', () => {
  const today = new Date(2026, 8, 29)
  assert.match(validateExitDate('', today), /required/)
  assert.match(validateExitDate('2026-09-30', today), /on or after/)
  assert.equal(validateExitDate('2026-09-29', today), '')
})
