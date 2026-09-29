export const LEGACY_LEAVE_TYPE_DEFINITIONS = Object.freeze([
  { code: 'casual', name: 'Casual', aliases: ['CL'] },
  { code: 'privilege', name: 'Privilege', aliases: ['EL', 'Annual'] },
  { code: 'sick', name: 'Sick', aliases: ['SL'] },
  { code: 'maternity', name: 'Maternity', aliases: [] },
  { code: 'paternity', name: 'Paternity', aliases: [] },
  { code: 'unpaid', name: 'Unpaid', aliases: [] },
  { code: 'lop', name: 'LOP', aliases: ['Loss of Pay'] },
])

const normalizeLabel = (value) => String(value || '').trim().toLowerCase().replace(/[._-]+/g, ' ').replace(/\s+/g, ' ')
const slugify = (value) => normalizeLabel(value).replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '')
const isIsoDate = (value) => {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const parsed = new Date(`${value}T00:00:00Z`)
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value
}

export const getConfiguredLeaveTypes = (orgData = {}) => {
  const definitions = Array.isArray(orgData.leaveTypes) ? orgData.leaveTypes : []
  const merged = LEGACY_LEAVE_TYPE_DEFINITIONS.map((base) => {
    const override = definitions.find((definition) => (
      slugify(definition?.code || definition?.name) === base.code
      || normalizeLabel(definition?.name) === normalizeLabel(base.name)
    ))
    return {
      ...base,
      ...override,
      code: base.code,
      name: String(override?.name || base.name).trim(),
      aliases: [...new Set([...base.aliases, ...(Array.isArray(override?.aliases) ? override.aliases : [])])],
      enabled: override?.enabled !== false,
      builtIn: true,
    }
  })
  definitions.forEach((definition) => {
    const name = String(definition?.name || '').trim()
    const code = slugify(definition?.code || name)
    if (!name || !code || merged.some((item) => item.code === code)) return
    merged.push({
      ...definition,
      code,
      name,
      aliases: Array.isArray(definition.aliases) ? definition.aliases.map((alias) => String(alias).trim()).filter(Boolean) : [],
      enabled: definition.enabled !== false,
      builtIn: false,
    })
  })
  return merged.filter((definition) => definition.enabled)
}

export const normalizeLeaveTypeCode = (value, definitions = LEGACY_LEAVE_TYPE_DEFINITIONS) => {
  const label = normalizeLabel(value)
  if (!label) return ''
  const allDefinitions = Array.isArray(definitions) ? definitions : LEGACY_LEAVE_TYPE_DEFINITIONS
  const found = allDefinitions.find((definition) => (
    normalizeLabel(definition.code) === label
    || normalizeLabel(definition.name) === label
    || (definition.aliases || []).some((alias) => normalizeLabel(alias) === label)
  ))
  return found?.code || slugify(value)
}

export const getLeaveTypeDefinition = (orgData = {}, value) => {
  const types = getConfiguredLeaveTypes(orgData)
  const code = normalizeLeaveTypeCode(value, types)
  return types.find((definition) => definition.code === code)
    || types.find((definition) => normalizeLabel(definition.name) === normalizeLabel(value))
    || null
}

const policyForType = (orgData = {}, typeValue, date = '') => {
  const definitions = getConfiguredLeaveTypes(orgData)
  const code = normalizeLeaveTypeCode(typeValue, definitions)
  const definition = getLeaveTypeDefinition(orgData, typeValue)
  const policies = orgData.leavePolicies || orgData.leavePolicy?.types || {}
  const directPolicy = policies[typeValue]
    || policies[definition?.name]
    || policies[code]
    || Object.entries(policies).find(([key]) => normalizeLeaveTypeCode(key, definitions) === code)?.[1]
    || {}
  const allVersions = (Array.isArray(orgData.leavePolicyVersions) ? orgData.leavePolicyVersions : [])
    .filter((version) => normalizeLeaveTypeCode(version.leaveTypeCode || version.leaveType || version.code, definitions) === code)
    .map((version) => ({
      effectiveFrom: version.effectiveFrom || version.policy?.effectiveFrom || '',
      version: Number(version.version || 0),
      policy: version.policy || version,
    }))
    .filter((version) => isIsoDate(version.effectiveFrom))
  const versions = allVersions
    .filter((version) => !date || version.effectiveFrom <= date)
    .sort((a, b) => a.effectiveFrom.localeCompare(b.effectiveFrom) || a.version - b.version)
  const selectedVersion = versions.at(-1)
  if (selectedVersion) return { ...directPolicy, ...selectedVersion.policy, policyVersion: selectedVersion.version || selectedVersion.policy.policyVersion || 'v1' }
  return allVersions.length ? {} : directPolicy
}

export const isLeaveEntitlementConfigured = (policy = {}) => (
  ['monthly', 'annual'].includes(policy.entitlementCadence)
  && Number.isFinite(Number(policy.entitlementAmount))
  && Number(policy.entitlementAmount) > 0
  && isIsoDate(policy.effectiveFrom)
)

const addMonthsClamped = (isoDate, months) => {
  const [year, month, day] = isoDate.split('-').map(Number)
  const monthIndex = month - 1 + months
  const targetYear = year + Math.floor(monthIndex / 12)
  const targetMonth = ((monthIndex % 12) + 12) % 12
  const finalDay = new Date(Date.UTC(targetYear, targetMonth + 1, 0)).getUTCDate()
  return `${targetYear}-${String(targetMonth + 1).padStart(2, '0')}-${String(Math.min(day, finalDay)).padStart(2, '0')}`
}

const accrualDates = (policy, asOf, nextEffectiveFrom = '') => {
  if (!isLeaveEntitlementConfigured(policy) || !isIsoDate(asOf) || policy.effectiveFrom > asOf) return []
  const stepMonths = policy.entitlementCadence === 'annual' ? 12 : 1
  const dates = []
  for (let period = 1; period <= 600; period += 1) {
    const grantDate = addMonthsClamped(policy.effectiveFrom, stepMonths * period)
    if (grantDate > asOf || (nextEffectiveFrom && grantDate >= nextEffectiveFrom)) break
    dates.push(grantDate)
  }
  return dates
}

export const calculateAccruedEntitlement = (orgData = {}, leaveType, asOf = new Date().toISOString().slice(0, 10)) => {
  const definitions = getConfiguredLeaveTypes(orgData)
  const code = normalizeLeaveTypeCode(leaveType, definitions)
  const storedVersions = (Array.isArray(orgData.leavePolicyVersions) ? orgData.leavePolicyVersions : [])
    .filter((version) => normalizeLeaveTypeCode(version.leaveTypeCode || version.leaveType || version.code, definitions) === code)
    .map((version) => ({
      effectiveFrom: version.effectiveFrom || version.policy?.effectiveFrom || '',
      version: Number(version.version || 0),
      policy: version.policy || version,
    }))
    .filter((version) => isIsoDate(version.effectiveFrom))
    .sort((a, b) => a.effectiveFrom.localeCompare(b.effectiveFrom) || a.version - b.version)
  const current = policyForType(orgData, leaveType, asOf)
  const versions = storedVersions.length ? storedVersions : (isIsoDate(current.effectiveFrom) ? [{ effectiveFrom: current.effectiveFrom, version: Number(current.policyVersion || 1), policy: current }] : [])
  const byEffectiveDate = new Map()
  versions.forEach((version) => byEffectiveDate.set(version.effectiveFrom, version))
  const ordered = [...byEffectiveDate.values()].sort((a, b) => a.effectiveFrom.localeCompare(b.effectiveFrom) || a.version - b.version)
  let units = 0
  const grants = []
  ordered.forEach((version, index) => {
    const nextEffectiveFrom = ordered[index + 1]?.effectiveFrom || ''
    const policy = version.policy || {}
    accrualDates(policy, asOf, nextEffectiveFrom).forEach((effectiveDate) => {
      const amount = Number(policy.entitlementAmount)
      units += amount
      grants.push({
        id: `${code}_${effectiveDate.replaceAll('-', '')}_v${version.version || policy.policyVersion || 1}`,
        leaveTypeCode: code,
        effectiveDate,
        quantity: amount,
        cadence: policy.entitlementCadence,
        policyVersion: version.version || policy.policyVersion || 'v1',
      })
    })
  })
  return { units: Number(units.toFixed(4)), grants }
}

const requestUnits = (request) => {
  if (Array.isArray(request?.coveragePreview) && request.coveragePreview.length) {
    return request.coveragePreview.reduce((sum, item) => sum + Number(item.leaveUnits || 0), 0)
  }
  return Number(request?.requestedUnits || request?.duration || 0)
}

const isActiveRequest = (request) => ['pending', 'in review', 'in_review'].includes(String(request?.status || '').trim().toLowerCase())
const sourceType = (entry) => String(entry?.source || entry?.eventType || '').trim().toLowerCase()

export const calculateLeaveBalance = ({ orgData = {}, leaveType, ledgerEntries = [], requests = [], asOf = new Date().toISOString().slice(0, 10) }) => {
  const definitions = getConfiguredLeaveTypes(orgData)
  const code = normalizeLeaveTypeCode(leaveType, definitions)
  const definition = getLeaveTypeDefinition(orgData, leaveType)
  const policy = policyForType(orgData, leaveType, asOf)
  const configured = isLeaveEntitlementConfigured(policy) || calculateAccruedEntitlement(orgData, leaveType, asOf).units > 0
  const accrued = calculateAccruedEntitlement(orgData, leaveType, asOf)
  const entries = ledgerEntries.filter((entry) => (
    !entry?.isBalanceState
    && !String(entry?.id || '').startsWith('__balance__')
    && normalizeLeaveTypeCode(entry?.leaveTypeCode || entry?.leaveType || entry?.typeCode, definitions) === code
    && (!String(entry?.effectiveDate || entry?.date || '').slice(0, 10) || String(entry.effectiveDate || entry.date).slice(0, 10) <= asOf)
  ))
  const opening = entries.filter((entry) => ['opening_balance', 'opening', 'manual_grant'].includes(sourceType(entry)))
    .reduce((sum, entry) => sum + Number(entry.quantity || 0), 0)
  const granted = entries.filter((entry) => ['grant', 'accrual', 'carryover', 'adjustment_credit'].includes(sourceType(entry)))
    .reduce((sum, entry) => sum + Number(entry.quantity || 0), 0)
  const usedEvents = entries.filter((entry) => ['approved_leave', 'leave_debit', 'approved_leave_debit'].includes(sourceType(entry)))
  const reversalEvents = entries.filter((entry) => ['leave_cancelled', 'worked_override_credit', 'approved_leave_reversal'].includes(sourceType(entry)))
  const used = Math.max(0, -usedEvents.reduce((sum, entry) => sum + Number(entry.quantity || 0), 0) - reversalEvents.reduce((sum, entry) => sum + Number(entry.quantity || 0), 0))
  const expired = Math.max(0, -entries.filter((entry) => ['expired', 'expiry'].includes(sourceType(entry))).reduce((sum, entry) => sum + Number(entry.quantity || 0), 0))
  const adjustments = entries.filter((entry) => ['balance_adjustment', 'adjustment_credit'].includes(sourceType(entry))).reduce((sum, entry) => sum + Number(entry.quantity || 0), 0)
  const grantedTotal = granted + adjustments
  const pending = requests.filter((request) => (
    isActiveRequest(request)
    && normalizeLeaveTypeCode(request.leaveTypeCode || request.leaveType, definitions) === code
  )).reduce((sum, request) => sum + requestUnits(request), 0)
  const entitlement = accrued.units + opening + grantedTotal
  const available = configured ? entitlement - used - expired - pending : null
  return {
    leaveTypeCode: code,
    leaveType: definition?.name || String(leaveType || ''),
    configured,
    cadence: policy.entitlementCadence || 'unconfigured',
    policyVersion: policy.policyVersion || 'v1',
    accrued: accrued.units,
    accruals: accrued.grants,
    opening,
    granted: grantedTotal,
    used,
    pending,
    expired,
    entitlement,
    available,
    overEntitlement: configured ? Math.max(0, -available) : 0,
    projectedAfterPending: available,
    asOf,
  }
}

export const applyEntitlementLimit = (candidates = [], availableUnits, overuseMode = 'block') => {
  const paidCandidates = candidates.filter((candidate) => String(candidate.classification || '').includes('paid'))
  const requestedPaidUnits = paidCandidates.reduce((sum, candidate) => sum + Number(candidate.leaveUnits || 0), 0)
  if (!Number.isFinite(Number(availableUnits)) || requestedPaidUnits <= Number(availableUnits)) {
    return { candidates, requestedPaidUnits, paidUnits: requestedPaidUnits, unpaidShortfallUnits: 0, overEntitlementUnits: 0 }
  }
  const available = Math.max(0, Number(availableUnits))
  if (overuseMode === 'allow_negative') {
    return { candidates, requestedPaidUnits, paidUnits: requestedPaidUnits, unpaidShortfallUnits: 0, overEntitlementUnits: requestedPaidUnits - available }
  }
  if (overuseMode !== 'unpaid_shortfall') {
    return { candidates, requestedPaidUnits, paidUnits: requestedPaidUnits, unpaidShortfallUnits: 0, overEntitlementUnits: requestedPaidUnits - available }
  }

  let remaining = Math.floor((available + 1e-8) * 2) / 2
  let paidUnits = 0
  let unpaidShortfallUnits = 0
  const adjusted = candidates.map((candidate) => {
    if (!String(candidate.classification || '').includes('paid')) return candidate
    const units = Number(candidate.leaveUnits || 0)
    const paid = Math.min(units, remaining)
    const unpaid = Math.max(0, units - paid)
    remaining = Math.max(0, remaining - paid)
    paidUnits += paid
    unpaidShortfallUnits += unpaid
    if (unpaid === 0) return candidate
    const unpaidClassification = candidate.policySnapshot?.paidBehavior === 'lop' ? 'lop_leave' : 'unpaid_leave'
    if (paid === 0) return { ...candidate, classification: unpaidClassification, segments: [] }
    return {
      ...candidate,
      classification: 'mixed_leave',
      segments: [
        { part: 'entitled', classification: 'half_paid_leave', units: paid },
        { part: 'shortfall', classification: unpaidClassification, units: unpaid },
      ],
    }
  })
  return { candidates: adjusted, requestedPaidUnits, paidUnits, unpaidShortfallUnits, overEntitlementUnits: 0 }
}

export const calculateUnpaidSalaryImpact = ({ units = 0, monthlySalary, basicPercent = 40, hraPercent = 20, monthDays = 30 } = {}) => {
  if (monthlySalary === null || monthlySalary === undefined || monthlySalary === '') return null
  const salary = Number(monthlySalary)
  const days = Number(monthDays)
  if (!Number.isFinite(salary) || salary < 0 || !Number.isFinite(days) || days <= 0) return null
  return Number((Number(units || 0) * salary * (Number(basicPercent || 0) + Number(hraPercent || 0)) / 100 / days).toFixed(2))
}

export const getLeavePolicyForDate = (orgData = {}, leaveType, date = new Date().toISOString().slice(0, 10)) => policyForType(orgData, leaveType, date)
