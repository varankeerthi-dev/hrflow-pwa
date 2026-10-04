const EMAIL_PATTERN = /^[A-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Z0-9](?:[A-Z0-9-]{0,61}[A-Z0-9])?(?:\.[A-Z0-9](?:[A-Z0-9-]{0,61}[A-Z0-9])?)+$/i
const MAX_EMAIL_LENGTH = 254
const MAX_PHONE_DIGITS = 15
const MIN_PHONE_DIGITS = 8
const GENERAL_COMMUNICATION_KINDS = new Set(['announcement', 'policy'])
const ALLOWED_SHARE_CHANNELS = Object.freeze(['email', 'whatsapp', 'system'])

const stripControlCharacters = (value) => Array.from(String(value ?? '')).filter((character) => {
  const code = character.charCodeAt(0)
  return !(code <= 8 || code === 11 || code === 12 || (code >= 14 && code <= 31) || code === 127)
}).join('')

const text = (value, maxLength = 10000) => stripControlCharacters(value).trim().slice(0, maxLength)

const inlineText = (value, maxLength = 500) => text(value, maxLength).replace(/[\r\n]+/g, ' ').replace(/\s+/g, ' ').trim()
const hasIdentityAndOrg = (user) => Boolean(user?.uid && user?.orgId)

export function isAdminUser(user) {
  return String(user?.role || '').toLowerCase() === 'admin' || user?.permissions?.isAdmin === true
}

export function canShareModule(user, module) {
  if (!hasIdentityAndOrg(user) || !module) return false
  if (isAdminUser(user)) return true
  const permissions = user.permissions?.[module] || {}
  const canView = permissions.view === true || permissions.full === true
  // Share is deliberately not implied by view, export, or legacy full grants.
  return canView && permissions.share === true
}

export function canShareOrganizationInvite(user) {
  return hasIdentityAndOrg(user) && isAdminUser(user)
}

export function isValidEmailRecipient(value) {
  const recipient = String(value || '').trim()
  if (recipient.length > MAX_EMAIL_LENGTH || !EMAIL_PATTERN.test(recipient) || /[\r\n,;<>]/.test(recipient)) return false
  const localPart = recipient.slice(0, recipient.lastIndexOf('@'))
  return !/^\.|\.$|\.\./.test(localPart)
}

export function normalizeWhatsAppPhone(value) {
  const entered = String(value || '').trim()
  if (!entered.startsWith('+') || !/^\+[\d\s().-]+$/.test(entered)) return null
  const digits = entered.replace(/[\s().-]/g, '').slice(1)
  if (digits.length < MIN_PHONE_DIGITS || digits.length > MAX_PHONE_DIGITS || digits.startsWith('0')) return null
  return digits
}

export function buildMailtoUrl({ recipient, subject = '', body = '' } = {}) {
  const normalizedRecipient = String(recipient || '').trim()
  if (!isValidEmailRecipient(normalizedRecipient)) throw new Error('Enter one valid email address.')
  const safeSubject = inlineText(subject, 200)
  const safeBody = text(body, 10000)
  const encodedRecipient = encodeURIComponent(normalizedRecipient).replace(/%40/gi, '@')
  return `mailto:${encodedRecipient}?subject=${encodeURIComponent(safeSubject)}&body=${encodeURIComponent(safeBody)}`
}

export function buildWhatsAppUrl({ recipient, body = '' } = {}) {
  const normalizedPhone = normalizeWhatsAppPhone(recipient)
  if (!normalizedPhone) throw new Error('Enter one phone number with its country code, such as +14155550123.')
  return `https://wa.me/${normalizedPhone}?text=${encodeURIComponent(text(body, 10000))}`
}

export function sanitizeShareFileName(value, fallback = 'shared-file') {
  const safe = Array.from(String(value || fallback)).map((character) => {
    const code = character.charCodeAt(0)
    return character === '\\' || character === '/' || '<>:"|?*'.includes(character) || code <= 31 || code === 127 ? '_' : character
  }).join('')
    .replace(/\.\.+/g, '.')
    .replace(/^\.+|\.+$/g, '')
    .trim()
    .slice(0, 120)
  return safe || fallback
}

function buildPayload({
  kind,
  sourceTitle,
  title,
  subject,
  intro,
  outro,
  fields,
  preview,
  notice,
  requireConfirmation = false,
  channels = ALLOWED_SHARE_CHANNELS,
  revisionKey,
  fileName,
  fileMime,
  fileBuilder,
  fileRequired = false,
}) {
  const safeFields = (fields || []).filter((field) => field && field.value !== '' && field.value !== null && field.value !== undefined).map((field) => ({
    key: String(field.key),
    label: inlineText(field.label, 80),
    value: text(field.value, 8000),
    selected: field.required === true || field.selected === true,
    required: field.required === true,
    includeLabel: field.includeLabel !== false,
  }))
  return {
    kind,
    sourceTitle: inlineText(sourceTitle || title || 'Shared content', 160),
    title: inlineText(title || 'Share', 200),
    subject: inlineText(subject || title || 'Shared content', 200),
    intro: text(intro, 1000),
    outro: text(outro, 1000),
    fields: safeFields,
    preview: text(preview, 1000),
    notice: text(notice, 1000),
    requireConfirmation: Boolean(requireConfirmation),
    channels: channels.filter((channel) => ALLOWED_SHARE_CHANNELS.includes(channel)),
    revisionKey: String(revisionKey || JSON.stringify(safeFields.map(({ key, value }) => [key, value]))),
    fileName: fileName ? sanitizeShareFileName(fileName) : '',
    fileMime: inlineText(fileMime || '', 120),
    fileBuilder: typeof fileBuilder === 'function' ? fileBuilder : null,
    fileRequired: Boolean(fileRequired),
  }
}

export function composeShareMessage(payload, selectedKeys) {
  if (!payload) return ''
  const selected = selectedKeys instanceof Set ? selectedKeys : new Set(selectedKeys || [])
  const fieldText = (payload.fields || [])
    .filter((field) => selected.has(field.key))
    .map((field) => field.includeLabel ? `${field.label}: ${field.value}` : field.value)
  return [payload.intro, ...fieldText, payload.outro].filter(Boolean).join('\n\n').trim()
}

function safeLoginUrl(loginUrl, loginOrigin) {
  try {
    const parsed = new URL(String(loginUrl || ''))
    const allowedOrigin = new URL(String(loginOrigin || ''))
    const isLocalHttp = parsed.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(parsed.hostname)
    if ((!['https:', 'http:'].includes(parsed.protocol)) || (parsed.protocol !== 'https:' && !isLocalHttp)) return null
    if (parsed.origin !== allowedOrigin.origin || allowedOrigin.pathname !== '/' || allowedOrigin.search || allowedOrigin.hash) return null
    if (parsed.username || parsed.password || parsed.pathname !== '/login' || parsed.search || parsed.hash) return null
    return parsed.href
  } catch {
    return null
  }
}

export function buildOrganizationInvitePayload({ organizationName, inviteCode, loginUrl, loginOrigin } = {}) {
  const safeOrganizationName = inlineText(organizationName, 160)
  const safeUrl = safeLoginUrl(loginUrl, loginOrigin)
  if (!safeOrganizationName || !safeUrl) return null
  const safeCode = inlineText(inviteCode, 100)
  const fields = [
    { key: 'organization', label: 'Organization', value: safeOrganizationName, required: true },
    { key: 'loginLink', label: 'Login link', value: safeUrl, required: true },
  ]
  if (safeCode) fields.push({ key: 'inviteCode', label: 'Organization invite code', value: safeCode, selected: false })
  return buildPayload({
    kind: 'organization-invitation',
    sourceTitle: 'Organization invitation',
    title: `Invitation to join ${safeOrganizationName}`,
    subject: `Invitation to join ${safeOrganizationName}`,
    intro: `You are invited to join ${safeOrganizationName} on HRFlow.`,
    outro: 'HRFlow prepares this handoff only; it does not send the message or confirm delivery.',
    fields,
    preview: 'The login link is included. The organization invite code is excluded unless you explicitly select it below.',
    notice: 'An invite code is an organization credential. Include it only when the recipient is authorized to join.',
    requireConfirmation: true,
    revisionKey: JSON.stringify([safeOrganizationName, safeUrl, safeCode]),
  })
}

const employeeShareValues = (employee = {}) => ({
  name: inlineText(employee.name, 160),
  designation: inlineText(employee.designation, 160),
  department: inlineText(employee.department, 160),
  // Only the field explicitly labeled as work email is eligible. Do not fall back to email/personalEmail.
  workEmail: isValidEmailRecipient(employee.workEmail) ? String(employee.workEmail).trim() : '',
})

export function canShareEmployeeContactCard(user, employee) {
  if (!canShareModule(user, 'Employees') || !employee?.id || !employee?.name) return false
  if (employee.orgId && employee.orgId !== user.orgId) return false
  const status = String(employee.status || '').toLowerCase()
  if (!['active', 'rejoined'].includes(status)) return false
  return Boolean(employeeShareValues(employee).name)
}

export function buildEmployeeContactPayload(employee = {}) {
  const values = employeeShareValues(employee)
  if (!values.name) return null
  const fields = [
    { key: 'name', label: 'Name', value: values.name, required: true },
  ]
  if (values.designation) fields.push({ key: 'designation', label: 'Role', value: values.designation, selected: true })
  if (values.department) fields.push({ key: 'department', label: 'Department', value: values.department, selected: true })
  if (values.workEmail) fields.push({ key: 'workEmail', label: 'Work email', value: values.workEmail, selected: true })
  return buildPayload({
    kind: 'employee-contact-card',
    sourceTitle: `Employee contact card for ${values.name}`,
    title: 'Employee contact card',
    subject: `Employee contact card — ${values.name}`,
    intro: 'Employee contact card',
    fields,
    preview: 'Only the employee name, role, department, and explicitly recorded work email can be included. The profile reveal state is never read.',
    notice: 'Review the recipient and selected fields. Personal email, phone, employee codes, address, DOB, IDs, bank, medical, and payroll fields are excluded.',
    requireConfirmation: true,
    revisionKey: JSON.stringify(values),
  })
}

function dateValue(value, endOfDay = false) {
  if (!value) return null
  if (typeof value?.toDate === 'function') {
    const converted = value.toDate()
    return Number.isNaN(converted?.getTime?.()) ? null : converted
  }
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value
  const raw = String(value)
  const date = /^\d{4}-\d{2}-\d{2}$/.test(raw)
    ? new Date(`${raw}T${endOfDay ? '23:59:59.999' : '00:00:00'}`)
    : new Date(value)
  return Number.isNaN(date.getTime()) ? null : date
}

export function isEligiblePublishedGeneralCommunication(record, kind, now = new Date()) {
  if (!record || !GENERAL_COMMUNICATION_KINDS.has(kind) || record.supersededBy) return false
  if ((record.kind && record.kind !== kind) || record.state !== 'published' || record.employeeId || record.employeeName) return false
  const audience = record.audience || record.audienceSnapshot
  if (audience?.scope !== 'all_active' || (Array.isArray(audience.employeeIds) && audience.employeeIds.length > 0)) return false
  if (!inlineText(record.title || record.name, 200) || !text(record.body, 8000)) return false
  if (record.expiresAt) {
    const expiresAt = dateValue(record.expiresAt, true)
    if (!expiresAt || expiresAt < now) return false
  }
  return true
}

export function canSharePublishedCommunication(user, orgId, record, kind, now = new Date()) {
  return Boolean(hasIdentityAndOrg(user) && orgId && user.orgId === orgId && canShareModule(user, 'HRLetters') && isEligiblePublishedGeneralCommunication(record, kind, now))
}

export function buildPublishedCommunicationPayload(record = {}, kind = '') {
  if (!isEligiblePublishedGeneralCommunication(record, kind)) return null
  const title = inlineText(record.title || record.name, 200)
  const effectiveDate = record.effectiveDate
    ? dateValue(record.effectiveDate)
      ? new Intl.DateTimeFormat(undefined, { year: 'numeric', month: 'short', day: 'numeric' }).format(dateValue(record.effectiveDate))
      : inlineText(record.effectiveDate, 80)
    : ''
  const fields = [
    { key: 'title', label: 'Title', value: title, required: true },
    ...(record.category ? [{ key: 'category', label: 'Category', value: inlineText(record.category, 120), selected: true }] : []),
    ...(effectiveDate ? [{ key: 'effectiveDate', label: 'Effective date', value: effectiveDate, selected: true }] : []),
    { key: 'body', label: 'Published content', value: text(record.body, 8000), required: true, includeLabel: false },
  ]
  return buildPayload({
    kind: `published-${kind}`,
    sourceTitle: `${kind === 'policy' ? 'Published policy' : 'Published announcement'}: ${title}`,
    title: `Share published ${kind}`,
    subject: title,
    intro: '',
    fields,
    preview: `Published ${kind} · version ${Number(record.version) || 1}. Only the current general item text is included; no audience list, employee record, acknowledgement, or internal record link is shared.`,
    notice: 'This handoff leaves HRFlow. An external handoff does not count as employee delivery or acknowledgement in HRFlow.',
    requireConfirmation: false,
    revisionKey: JSON.stringify([kind, record.state, record.version || 1, record.expiresAt || '', fields.map(({ key, value }) => [key, value])]),
  })
}

function isCurrentDocumentVersion(record, documents = []) {
  if (!record?.id || !Array.isArray(documents)) return false
  const groupId = record.documentGroupId || record.id
  const group = documents.filter((item) => (item.documentGroupId || item.id) === groupId)
  if (!group.length) return false
  const latest = [...group].sort((a, b) => {
    const versionDifference = (Number(b.version) || 1) - (Number(a.version) || 1)
    if (versionDifference) return versionDifference
    const dateOf = (item) => item.createdAt?.toMillis?.() || dateValue(item.createdAt)?.getTime() || 0
    return dateOf(b) - dateOf(a)
  })[0]
  return latest?.id === record.id
}

export function isEligibleOrganizationDocument(user, orgId, record, documents = [], now = new Date()) {
  if (!hasIdentityAndOrg(user) || !orgId || user.orgId !== orgId || !canShareModule(user, 'DocumentManagement')) return false
  if (!record || record.type !== 'Org' || record.status !== 'Active' || !record.storagePath || !record.fileName) return false
  if (String(record.category || '').trim().toLowerCase() !== 'policy') return false
  if (record.orgId && record.orgId !== orgId) return false
  const expectedPrefix = `organisations/${orgId}/documents/`
  if (!record.storagePath.startsWith(expectedPrefix) || record.storagePath.split('/').includes('..')) return false
  if (!isCurrentDocumentVersion(record, documents)) return false
  if (record.expiresOn) {
    const expiry = dateValue(record.expiresOn, true)
    if (!expiry || expiry < now) return false
  }
  return true
}

export function canShareOrganizationDocument(user, orgId, record, documents = [], now = new Date()) {
  return isEligibleOrganizationDocument(user, orgId, record, documents, now)
}

export function buildOrganizationDocumentPayload(record = {}, fileBuilder) {
  const name = inlineText(record.name, 180)
  if (!name || String(record.category || '').trim().toLowerCase() !== 'policy' || typeof fileBuilder !== 'function') return null
  const fileName = sanitizeShareFileName(record.fileName || name, 'organization-document')
  const fields = [
    { key: 'name', label: 'Document', value: name, required: true },
    ...(record.category ? [{ key: 'category', label: 'Category', value: inlineText(record.category, 120), selected: true }] : []),
    { key: 'version', label: 'Version', value: String(Number(record.version) || 1), selected: true },
  ]
  return buildPayload({
    kind: 'organization-document',
    sourceTitle: `Active organization document: ${name}`,
    title: 'Share organization document',
    subject: name,
    intro: 'Please review this organization document.',
    fields,
    preview: `Current active organization file · version ${Number(record.version) || 1} · ${fileName}. Stored/external URLs and employee dossiers are not included.`,
    notice: 'Review the document contents and recipient. Email and WhatsApp drafts cannot attach this file; download it for manual attachment, or use the system file chooser when available.',
    requireConfirmation: true,
    revisionKey: JSON.stringify([record.id, record.documentGroupId, record.version, record.status, record.expiresOn, record.fileName, record.storagePath]),
    fileName,
    fileMime: record.fileType || 'application/octet-stream',
    fileBuilder,
    fileRequired: true,
  })
}

export function buildSiteVisitReportPayload({
  organizationName,
  from,
  to,
  selectedSite,
  siteCount,
  visitCount,
  totalHours,
  detailCount,
  contentRevision,
  fileBuilder,
} = {}) {
  const start = inlineText(from, 40)
  const end = inlineText(to, 40)
  if (!start || !end || !Number(siteCount) || !Number(visitCount) || typeof fileBuilder !== 'function') return null
  const fields = [
    ...(organizationName ? [{ key: 'organization', label: 'Organization', value: inlineText(organizationName, 160), selected: true }] : []),
    { key: 'period', label: 'Report period', value: `${start} to ${end}`, required: true },
    ...(selectedSite ? [{ key: 'site', label: 'Site filter', value: inlineText(selectedSite, 160), selected: true }] : []),
    { key: 'sites', label: 'Sites', value: String(Number(siteCount)), selected: true },
    { key: 'visits', label: 'Visits', value: String(Number(visitCount)), selected: true },
    { key: 'hours', label: 'Total hours', value: `${Number(totalHours || 0).toFixed(1)} hours`, selected: true },
    { key: 'detailRows', label: 'Detailed visit rows in PDF', value: String(Number(detailCount) || 0), selected: true },
  ]
  return buildPayload({
    kind: 'filtered-site-visit-report',
    sourceTitle: 'Filtered site & field visit report',
    title: 'Share site visit report',
    subject: `Site visit report — ${start} to ${end}`,
    intro: 'Please review this filtered site visit report.',
    fields,
    preview: `Uses the current report date range${selectedSite ? ` and site filter “${inlineText(selectedSite, 160)}”` : ''}. The PDF contains site totals and up to ${Number(detailCount) || 0} detailed visit rows; no selfies, precise location traces, remarks, or internal employee IDs are included.`,
    notice: 'The PDF contains employee names, site names, dates, times, and work hours. Confirm that the recipient is authorized. Email/WhatsApp drafts do not attach the PDF; choose one recipient in the system file chooser or download and attach it manually.',
    requireConfirmation: true,
    revisionKey: JSON.stringify([start, end, selectedSite || '', Number(siteCount), Number(visitCount), Number(totalHours || 0), Number(detailCount) || 0, String(contentRevision || '')]),
    fileName: `Site_Visit_Report_${start}_to_${end}.pdf`,
    fileMime: 'application/pdf',
    fileBuilder,
    fileRequired: true,
  })
}

export async function requestNativeShare(navigatorLike, { title, text: message, file } = {}) {
  if (!navigatorLike || typeof navigatorLike.share !== 'function') return { outcome: 'unsupported' }
  let shareData = { title: inlineText(title, 200), text: text(message, 10000) }
  if (file) {
    if (typeof navigatorLike.canShare !== 'function') return { outcome: 'unsupported' }
    try {
      if (!navigatorLike.canShare({ files: [file] })) return { outcome: 'unsupported' }
    } catch {
      return { outcome: 'unsupported' }
    }
    shareData = { ...shareData, files: [file] }
  }
  try {
    // Invoke share before awaiting anything so the caller's direct user gesture is preserved.
    const sharePromise = navigatorLike.share(shareData)
    await sharePromise
    return { outcome: 'handoff-requested' }
  } catch (error) {
    if (error?.name === 'AbortError') return { outcome: 'cancelled' }
    return { outcome: 'failure' }
  }
}
