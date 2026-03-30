export const EMPLOYEE_STATUS_ACTIVE = 'Active'
export const EMPLOYEE_STATUS_INACTIVE = 'Inactive'
export const EMPLOYEE_STATUS_REJOINED = 'Rejoined'

export const EMPLOYEE_STATUS_OPTIONS = [
  EMPLOYEE_STATUS_ACTIVE,
  EMPLOYEE_STATUS_INACTIVE,
  EMPLOYEE_STATUS_REJOINED,
]

export function normalizeEmployeeStatus(status) {
  const normalized = typeof status === 'string' ? status.trim().toLowerCase() : ''

  if (normalized === 'inactive') return EMPLOYEE_STATUS_INACTIVE
  if (normalized === 'rejoined' || normalized === 'rejoin') return EMPLOYEE_STATUS_REJOINED
  return EMPLOYEE_STATUS_ACTIVE
}

export function isEmployeeActiveStatus(status) {
  const normalized = normalizeEmployeeStatus(status)
  return normalized === EMPLOYEE_STATUS_ACTIVE || normalized === EMPLOYEE_STATUS_REJOINED
}

export function getEmployeeStatusBadgeClass(status) {
  const normalized = normalizeEmployeeStatus(status)

  if (normalized === EMPLOYEE_STATUS_REJOINED) {
    return 'bg-sky-50 text-sky-700 border border-sky-100'
  }

  if (normalized === EMPLOYEE_STATUS_INACTIVE) {
    return 'bg-red-50 text-red-600 border border-red-100'
  }

  return 'bg-emerald-50 text-emerald-700 border border-emerald-100'
}

export function getStatusTransitionRequirement(fromStatus, toStatus) {
  const from = normalizeEmployeeStatus(fromStatus)
  const to = normalizeEmployeeStatus(toStatus)

  if (from === to) return null

  if (from === EMPLOYEE_STATUS_INACTIVE && to === EMPLOYEE_STATUS_REJOINED) {
    return {
      field: 'rejoinDate',
      label: 'Rejoin Date',
      helperText: 'Select when the employee rejoined the organisation.',
      logAction: 'rejoined',
    }
  }

  if (to === EMPLOYEE_STATUS_INACTIVE) {
    return {
      field: 'inactiveFrom',
      label: 'Inactive From Date',
      helperText: 'Select when the employee became inactive.',
      logAction: 'marked inactive',
    }
  }

  if (to === EMPLOYEE_STATUS_REJOINED) {
    return {
      field: 'rejoinDate',
      label: 'Rejoin Date',
      helperText: 'Select the employee rejoin date.',
      logAction: 'rejoined',
    }
  }

  return {
    field: 'activeFrom',
    label: 'Active From Date',
    helperText: 'Select when the employee became active.',
    logAction: 'marked active',
  }
}
