export const COMMUNICATION_KINDS = Object.freeze({
  LETTER: 'letter',
  ANNOUNCEMENT: 'announcement',
  POLICY: 'policy',
  TRAINING: 'training',
})

export const communicationTabIdForKind = (kind) => ({
  [COMMUNICATION_KINDS.LETTER]: 'letters',
  [COMMUNICATION_KINDS.ANNOUNCEMENT]: 'announcements',
  [COMMUNICATION_KINDS.POLICY]: 'policies',
  [COMMUNICATION_KINDS.TRAINING]: 'training',
  template: 'templates',
})[kind] || null

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

export const DEFAULT_LETTER_TYPES = ['Offer', 'Appointment', 'Salary Certificate', 'Employment Certificate', 'Experience', 'Relieving', 'Increment', 'Promotion', 'Bonafide', 'Notice Period', 'Termination', 'Transfer', 'Warning', 'NOC', 'Training Nomination', 'Training Certificate']
export const DEFAULT_ANNOUNCEMENT_CATEGORIES = ['Holiday', 'Event', 'Site Visit', 'Online Visit', 'Training', 'Safety', 'Canteen & Facilities', 'Operations', 'General']
export const DEFAULT_POLICY_CATEGORIES = ['Safety', 'Attendance', 'Canteen & Facilities', 'Site Operations', 'HR', 'IT & Systems']
export const DEFAULT_TRAINING_CATEGORIES = ['Safety Induction', 'Policy Orientation', 'Equipment', 'Site/Customer', 'Leadership', 'Compliance', 'Canteen Hygiene']

const roleOf = (user) => String(user?.role || '').toLowerCase()
const permissionsOf = (user) => user?.permissions?.HRLetters || {}
const hasCapability = (user, capability) => permissionsOf(user)[capability] === true || permissionsOf(user).full === true
const isAdmin = (user) => roleOf(user) === 'admin'
const isHR = (user) => roleOf(user) === 'hr'

export const canCreateCommunications = (user) => isAdmin(user) || isHR(user) || hasCapability(user, 'create')
export const canEditCommunications = (user) => isAdmin(user) || isHR(user) || hasCapability(user, 'edit')
export const canDeleteCommunications = (user) => isAdmin(user) || isHR(user) || hasCapability(user, 'delete')

export const ownsCommunication = (record, user) => Boolean(user && (
  (user.uid && (record?.createdById === user.uid || record?.createdBy === user.uid)) ||
  (user.name && (record?.createdBy === user.name || record?.createdByName === user.name))
))

export const canEditCommunication = (record, user) => Boolean(isAdmin(user) || (
  canEditCommunications(user) && ownsCommunication(record, user)
))

export const canRequestCommunicationApproval = (record, user) => Boolean(isAdmin(user) || (
  ownsCommunication(record, user) && (canCreateCommunications(user) || canEditCommunications(user))
))

export const canDeleteCommunication = (record, user) => Boolean(isAdmin(user) || (
  canDeleteCommunications(user) && ownsCommunication(record, user)
))

// Kept as a compatibility helper for existing callers; approval is intentionally separate from editing.
export const canManageCommunications = (user) => canCreateCommunications(user) || canEditCommunications(user) || canDeleteCommunications(user) || hasCapability(user, 'approve')

export const canApproveCommunications = (user) => ['admin', 'hr', 'md'].includes(roleOf(user)) || hasCapability(user, 'approve')

export const deliveryDocId = (sourceType, sourceId, recipientId) => `${sourceType}_${sourceId}_${recipientId}`.replace(/[^a-zA-Z0-9_-]/g, '_')
export const referenceNumber = (kind, id = '') => `HRF/${String(kind || 'DOC').slice(0, 3).toUpperCase()}/${String(id).slice(-6).toUpperCase()}`

export const buildLetterAuditSnapshot = (letter = {}) => ({
  letterType: letter.letterType || 'Letter',
  title: letter.title || letter.letterType || 'Letter',
  state: letter.state || COMMUNICATION_STATES.DRAFT,
  employeeId: letter.employeeId || '',
  employeeName: letter.employeeName || '',
  formatId: letter.formatId || '',
  source: letter.source || 'communications',
  documentDate: letter.documentDate || '',
  effectiveDate: letter.effectiveDate || '',
  previousDesignation: letter.previousDesignation || '',
  promotedDesignation: letter.promotedDesignation || '',
  formatVariables: letter.formatVariables || {},
  issueReference: letter.issueReference || '',
  bodySnapshot: letter.body || '',
})

const toDate = (value) => {
  if (value?.toDate) return value.toDate()
  if (!value) return null
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) return new Date(`${value}T23:59:59.999`)
  return new Date(value)
}

export const isActiveCommunication = (record, now = new Date()) => {
  if (!record || !['published', 'issued', 'approved', 'completed', 'invitations_published'].includes(record.state)) return false
  if (!record.expiresAt) return true
  const expiry = toDate(record.expiresAt)
  return !expiry || Number.isNaN(expiry.getTime()) || expiry >= now
}

export const isArchivedCommunication = (record, now = new Date()) => {
  if (!record) return false
  if (['withdrawn', 'superseded', 'expired', 'cancelled'].includes(record.state)) return true
  if (!record.expiresAt) return false
  const expiry = toDate(record.expiresAt)
  return Boolean(expiry && !Number.isNaN(expiry.getTime()) && expiry < now)
}

export const resolveAudience = (employees = [], audience = {}) => {
  const ids = new Set(Array.isArray(audience.employeeIds) ? audience.employeeIds : [])
  const scope = audience.scope || 'all_active'
  const base = employees.filter((employee) => String(employee.status || 'Active').toLowerCase() !== 'inactive')
  const scoped = scope === 'named'
    ? base.filter((employee) => ids.has(employee.id))
    : scope === 'site'
      ? base.filter((employee) => String(employee.site || '').toLowerCase() === String(audience.site || '').toLowerCase())
      : scope === 'department'
        ? base.filter((employee) => String(employee.department || '').toLowerCase() === String(audience.department || '').toLowerCase())
        : base
  return scoped.map((employee) => ({ id: employee.id, name: employee.name || 'Employee', employeeCode: employee.empCode || '' }))
}

export const nextCommunicationVersion = (record) => Math.max(1, Number(record?.version) || 1) + 1

export const summarizeDeliveries = (deliveries = [], sourceId) => {
  const matching = deliveries.filter((delivery) => delivery.sourceId === sourceId)
  return matching.reduce((summary, delivery) => {
    summary.total += 1
    if (delivery.status === 'acknowledged') summary.acknowledged += 1
    else if (delivery.status === 'seen') summary.seen += 1
    else summary.pending += 1
    return summary
  }, { total: 0, acknowledged: 0, seen: 0, pending: 0 })
}

export const statusLabel = (state = '') => String(state || 'draft').replaceAll('_', ' ')

export const statusTone = (state = '') => {
  if (['issued', 'published', 'completed', 'acknowledged', 'invitations_published'].includes(state)) return 'bg-emerald-50 text-emerald-700 border-emerald-100'
  if (['pending_approval', 'scheduled', 'overdue', 'seen'].includes(state)) return 'bg-amber-50 text-amber-700 border-amber-100'
  if (['withdrawn', 'cancelled', 'rejected', 'expired', 'superseded'].includes(state)) return 'bg-rose-50 text-rose-700 border-rose-100'
  if (['approved', 'in_progress'].includes(state)) return 'bg-indigo-50 text-indigo-700 border-indigo-100'
  return 'bg-slate-100 text-slate-600 border-slate-200'
}
