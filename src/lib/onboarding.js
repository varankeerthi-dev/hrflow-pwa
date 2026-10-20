export const WELCOME_COPY = 'welcome to people app... create for the human, by human'

const ONBOARDING_VIEWS = new Set(['welcome', 'choices', 'tour', 'setup'])
const ONBOARDING_STATUSES = new Set(['active', 'dismissed', 'complete'])

export function createOnboarding(overrides = {}) {
  return {
    version: 1,
    status: 'active',
    view: 'welcome',
    step: 0,
    pendingOrg: null,
    updatedAt: Date.now(),
    ...overrides,
  }
}

export function validOnboarding(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  if (value.version !== 1) return false
  if (!ONBOARDING_STATUSES.has(value.status) || !ONBOARDING_VIEWS.has(value.view)) return false
  if (!Number.isInteger(value.step) || value.step < 0 || value.step > 4) return false
  if (!Number.isFinite(value.updatedAt) || value.updatedAt < 0) return false

  const { pendingOrg } = value
  if (pendingOrg === null) return true
  return Boolean(
    pendingOrg &&
    typeof pendingOrg === 'object' &&
    !Array.isArray(pendingOrg) &&
    typeof pendingOrg.code === 'string' && pendingOrg.code.trim() &&
    typeof pendingOrg.name === 'string' && pendingOrg.name.trim()
  )
}

/**
 * Resolve a local optimistic copy against persisted onboarding state. A local
 * cache is never evidence that a user is eligible: eligibility must originate
 * from a valid onboarding object on their remote user document.
 */
export function latestOnboarding(remote, local) {
  if (!validOnboarding(remote)) return null
  if (!validOnboarding(local)) return remote

  const remoteTime = Number.isFinite(remote.updatedAt) ? remote.updatedAt : 0
  const localTime = Number.isFinite(local.updatedAt) ? local.updatedAt : 0
  return localTime > remoteTime ? local : remote
}

export function getSetupChoices(user = {}) {
  const memberships = Array.isArray(user?.memberships) ? user.memberships : []
  const activeOrgId = user?.currentOrgId || user?.orgId || memberships[0]?.orgId || null
  const hasOrg = Boolean(activeOrgId || memberships.length)
  const activeMembership = memberships.find((membership) =>
    membership?.orgId === activeOrgId
  )
  const role = String(activeMembership?.role || user?.role || '').toLowerCase()
  const isAdmin = role === 'admin'
  const employeePermissions = user?.permissions?.Employees || {}
  const canCreateEmployees = employeePermissions.create === true
  const canViewEmployees = employeePermissions.view === true
  const employeeCanSetUp = canCreateEmployees && canViewEmployees

  return {
    company: {
      enabled: !hasOrg || isAdmin,
      reason: !hasOrg || isAdmin ? null : 'Only an organization admin can manage organization settings.',
    },
    employee: {
      enabled: hasOrg && (isAdmin || employeeCanSetUp),
      reason: !hasOrg
        ? 'Create or join an organization first.'
        : (isAdmin || employeeCanSetUp ? null : 'Employee setup requires Employees view and create permissions.'),
    },
  }
}
