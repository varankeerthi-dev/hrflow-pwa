export const ATTENDANCE_EVENT_IN = 'in'
export const ATTENDANCE_EVENT_OUT = 'out'

export const ATTENDANCE_STATUS_PENDING_HR = 'pending_hr'
export const ATTENDANCE_STATUS_PENDING_EXCEPTION = 'pending_exception_hr'
export const ATTENDANCE_STATUS_APPROVED_WAITING_FINALIZE = 'approved_waiting_finalize'
export const ATTENDANCE_STATUS_FINALIZED = 'finalized'
export const ATTENDANCE_STATUS_REJECTED = 'rejected'

export const ATTENDANCE_RADIUS_DEFAULT_METERS = 500

export function getDateKey(date = new Date()) {
  return date.toISOString().split('T')[0]
}

export function buildAttendanceSessionId(employeeId, dateKey) {
  return `${dateKey}_${employeeId || 'unknown'}`
}

export function buildAttendanceEventId(sessionId, type) {
  return `${sessionId}_${type}`
}

export function getAttendancePortalBadge(status) {
  if (status === ATTENDANCE_STATUS_REJECTED) {
    return { label: 'Rejected', className: 'bg-red-100 text-red-700' }
  }
  if (status === ATTENDANCE_STATUS_FINALIZED) {
    return { label: 'Finalized', className: 'bg-emerald-100 text-emerald-700' }
  }
  if (status === ATTENDANCE_STATUS_APPROVED_WAITING_FINALIZE) {
    return { label: 'Approved', className: 'bg-green-100 text-green-700' }
  }
  if (status === ATTENDANCE_STATUS_PENDING_EXCEPTION) {
    return { label: 'Exception Pending', className: 'bg-orange-100 text-orange-700' }
  }
  return { label: 'Pending', className: 'bg-amber-100 text-amber-700' }
}

