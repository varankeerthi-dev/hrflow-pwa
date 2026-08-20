export const COMMUNICATION_KINDS = Object.freeze({
  LETTER: 'letter',
  ANNOUNCEMENT: 'announcement',
  POLICY: 'policy',
  TRAINING: 'training',
})

export const COMMUNICATION_STATES = Object.freeze({
  DRAFT: 'draft',
  PENDING_APPROVAL: 'pending_approval',
  APPROVED: 'approved',
  SCHEDULED: 'scheduled',
  PUBLISHED: 'published',
  ISSUED: 'issued',
  COMPLETED: 'completed',
  EXPIRED: 'expired',
  SUPERSEDED: 'superseded',
  WITHDRAWN: 'withdrawn',
  CANCELLED: 'cancelled',
})

export const DEFAULT_LETTER_TYPES = ['Offer', 'Appointment', 'Salary Certificate', 'Employment Certificate', 'Experience', 'Relieving', 'Increment', 'Promotion', 'Transfer', 'Warning', 'NOC', 'Training Nomination', 'Training Certificate']
export const DEFAULT_ANNOUNCEMENT_CATEGORIES = ['Holiday', 'Event', 'Site Visit', 'Online Visit', 'Training', 'Safety', 'Canteen & Facilities', 'Operations', 'General']
export const DEFAULT_POLICY_CATEGORIES = ['Safety', 'Attendance', 'Canteen & Facilities', 'Site Operations', 'HR', 'IT & Systems']
export const DEFAULT_TRAINING_CATEGORIES = ['Safety Induction', 'Policy Orientation', 'Equipment', 'Site/Customer', 'Leadership', 'Compliance', 'Canteen Hygiene']

export const canManageCommunications = (user) => {
  const role = String(user?.role || '').toLowerCase()
  if (['admin', 'hr'].includes(role)) return true
  const permissions = user?.permissions?.HRLetters || {}
  return [permissions.create, permissions.edit, permissions.approve].some(Boolean)
}

export const canApproveCommunications = (user) => {
  const role = String(user?.role || '').toLowerCase()
  return ['admin', 'hr', 'md'].includes(role) || user?.permissions?.HRLetters?.approve === true
}

export const deliveryDocId = (sourceType, sourceId, recipientId) => `${sourceType}_${sourceId}_${recipientId}`.replace(/[^a-zA-Z0-9_-]/g, '_')
export const referenceNumber = (kind, id = '') => `HRF/${String(kind || 'DOC').slice(0, 3).toUpperCase()}/${String(id).slice(-6).toUpperCase()}`

export const isActiveCommunication = (record, now = new Date()) => {
  if (!record || !['published', 'issued', 'approved', 'completed'].includes(record.state)) return false
  if (!record.expiresAt) return true
  const expiry = record.expiresAt?.toDate ? record.expiresAt.toDate() : new Date(record.expiresAt)
  return Number.isNaN(expiry.getTime()) || expiry >= now
}

export const resolveAudience = (employees = [], audience = {}) => {
  const ids = new Set(Array.isArray(audience.employeeIds) ? audience.employeeIds : [])
  const scope = audience.scope || 'all_active'
  const base = employees.filter((employee) => String(employee.status || 'Active').toLowerCase() !== 'inactive')
  const scoped = scope === 'named'
    ? base.filter((employee) => ids.has(employee.id))
    : scope === 'site'
      ? base.filter((employee) => employee.site === audience.site)
      : scope === 'department'
        ? base.filter((employee) => employee.department === audience.department)
        : base
  return scoped.map((employee) => ({ id: employee.id, name: employee.name || 'Employee', employeeCode: employee.empCode || '' }))
}

export const statusLabel = (state = '') => String(state || 'draft').replaceAll('_', ' ')

export const statusTone = (state = '') => {
  if (['issued', 'published', 'completed', 'acknowledged'].includes(state)) return 'bg-emerald-50 text-emerald-700 border-emerald-100'
  if (['pending_approval', 'scheduled', 'overdue'].includes(state)) return 'bg-amber-50 text-amber-700 border-amber-100'
  if (['withdrawn', 'cancelled', 'rejected', 'expired'].includes(state)) return 'bg-rose-50 text-rose-700 border-rose-100'
  if (['approved', 'in_progress'].includes(state)) return 'bg-indigo-50 text-indigo-700 border-indigo-100'
  return 'bg-slate-100 text-slate-600 border-slate-200'
}
