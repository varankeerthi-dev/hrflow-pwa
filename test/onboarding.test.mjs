import test from 'node:test'
import assert from 'node:assert/strict'
import {
  WELCOME_COPY,
  createOnboarding,
  getSetupChoices,
  latestOnboarding,
  validOnboarding,
} from '../src/lib/onboarding.js'

const progress = (overrides = {}) => createOnboarding({ updatedAt: 100, ...overrides })

test('welcome copy and newly created onboarding use the versioned welcome defaults', () => {
  assert.equal(WELCOME_COPY, 'welcome to people app... create for the human, by human')
  const onboarding = createOnboarding({ updatedAt: 1234 })
  assert.deepEqual(onboarding, {
    version: 1,
    status: 'active',
    view: 'welcome',
    step: 0,
    pendingOrg: null,
    updatedAt: 1234,
  })
  assert.equal(validOnboarding(onboarding), true)
})

test('legacy onboardingComplete flags do not make local state eligible without remote versioned state', () => {
  const local = progress({ view: 'setup', step: 3 })
  assert.equal(latestOnboarding(undefined, local), null)
  assert.equal(latestOnboarding({ onboardingComplete: false }, local), null)
  assert.equal(latestOnboarding({ onboardingComplete: true }, local), null)
})

test('latestOnboarding selects the newest valid copy and ignores invalid copies', () => {
  const remote = progress({ updatedAt: 100, view: 'welcome' })
  const newerLocal = progress({ updatedAt: 200, view: 'tour', step: 2 })
  const olderLocal = progress({ updatedAt: 99, view: 'choices', step: 1 })

  assert.equal(latestOnboarding(remote, newerLocal), newerLocal)
  assert.equal(latestOnboarding(remote, olderLocal), remote)
  assert.equal(latestOnboarding(remote, { ...newerLocal, version: 2 }), remote)
  const remoteTie = { ...remote, updatedAt: 200 }
  assert.equal(latestOnboarding(remoteTie, newerLocal), remoteTie)
  assert.equal(latestOnboarding({ ...remote, status: 'legacy' }, newerLocal), null)
})

test('validation constrains version, status, view, step, and pending organization shape', () => {
  const valid = progress({ pendingOrg: { code: 'acme-123', name: 'Acme' } })
  assert.equal(validOnboarding(valid), true)
  assert.equal(validOnboarding({ ...valid, version: 0 }), false)
  assert.equal(validOnboarding({ ...valid, status: 'paused' }), false)
  assert.equal(validOnboarding({ ...valid, view: 'employees' }), false)
  assert.equal(validOnboarding({ ...valid, step: 5 }), false)
  for (const updatedAt of [undefined, null, '100', NaN, Infinity, -1]) {
    assert.equal(validOnboarding({ ...valid, updatedAt }), false)
  }
  assert.equal(validOnboarding({ ...valid, step: 1.5 }), false)
  assert.equal(validOnboarding({ ...valid, pendingOrg: { code: '', name: 'Acme' } }), false)
  assert.equal(validOnboarding({ ...valid, pendingOrg: { code: 'acme-123' } }), false)
  assert.equal(validOnboarding({ ...valid, pendingOrg: [] }), false)
})

test('company and employee setup choices honor organization and permission gates', () => {
  const noOrg = getSetupChoices({ role: 'employee' })
  assert.equal(noOrg.company.enabled, true)
  assert.equal(noOrg.employee.enabled, false)

  const admin = getSetupChoices({ orgId: 'acme', role: 'Admin' })
  assert.equal(admin.company.enabled, true)
  assert.equal(admin.employee.enabled, true)

  const createOnly = getSetupChoices({
    orgId: 'acme',
    role: 'employee',
    permissions: { Employees: { view: true, create: false } },
  })
  assert.equal(createOnly.company.enabled, false)
  assert.equal(createOnly.employee.enabled, false)

  const authorizedEmployee = getSetupChoices({
    orgId: 'acme',
    role: 'employee',
    permissions: { Employees: { view: true, create: true } },
  })
  assert.equal(authorizedEmployee.company.enabled, false)
  assert.equal(authorizedEmployee.employee.enabled, true)
  assert.equal(authorizedEmployee.employee.reason, null)
})

test('creating an organization can transition onboarding to a pending organization', () => {
  const transitioned = createOnboarding({
    pendingOrg: { code: 'team-abc', name: 'Team' },
    updatedAt: 5678,
  })
  assert.deepEqual(transitioned, {
    version: 1,
    status: 'active',
    view: 'welcome',
    step: 0,
    pendingOrg: { code: 'team-abc', name: 'Team' },
    updatedAt: 5678,
  })
  assert.equal(validOnboarding(transitioned), true)
})

test('dismissal and resume retain tour position, while completion remains durable', () => {
  const tour = progress({ view: 'tour', step: 3 })
  const dismissed = progress({ ...tour, status: 'dismissed', updatedAt: 101 })
  assert.equal(latestOnboarding(tour, dismissed), dismissed)
  assert.equal(dismissed.step, 3)
  const resumed = progress({ ...dismissed, status: 'active', updatedAt: 102 })
  assert.equal(latestOnboarding(dismissed, resumed).view, 'tour')
  assert.equal(resumed.step, 3)
  const complete = progress({ ...resumed, status: 'complete', updatedAt: 103 })
  assert.equal(latestOnboarding(complete, tour).status, 'complete')
})

test('active membership determines permissions without borrowing another organization’s admin role', () => {
  const choices = getSetupChoices({
    orgId: 'team-b', currentOrgId: 'team-b', role: 'admin',
    memberships: [{ orgId: 'team-a', role: 'admin' }, { orgId: 'team-b', role: 'employee' }],
  })
  assert.equal(choices.company.enabled, false)
  assert.equal(choices.employee.enabled, false)
  assert.ok(choices.company.reason)
  assert.ok(choices.employee.reason)
})
