export const RULE_TYPE_TIME = 'time'

export function parseTimeToMinutes(timeStr) {
  if (!timeStr) return null
  const match = String(timeStr).trim().match(/^(\d{1,2}):(\d{2})/)
  if (!match) return null
  const h = Number(match[1])
  const m = Number(match[2])
  if (h > 23 || m > 59) return null
  return h * 60 + m
}

export function formatMinutesToTime(minutes) {
  if (typeof minutes !== 'number' || minutes < 0 || minutes > 1439) return null
  const h = String(Math.floor(minutes / 60)).padStart(2, '0')
  const m = String(minutes % 60).padStart(2, '0')
  return `${h}:${m}`
}

// For "after threshold" rules that cross midnight (e.g. out at 00:30 with threshold 21:00),
// treat early-morning times as the next day so they still count as "after 21:00".
function isLateNightTime(minutes) {
  return minutes >= 0 && minutes < 360 // 00:00 - 05:59
}

/**
 * Returns true when the given out-time satisfies a time-based rule.
 * rule.shape: { ruleType: 'time', thresholdTime: 'HH:MM', afterTime: boolean }
 */
export function isTimeRuleMet(rule, outTime) {
  if (!rule || rule.ruleType !== RULE_TYPE_TIME) return false
  const threshold = parseTimeToMinutes(rule.thresholdTime)
  const out = parseTimeToMinutes(outTime)
  if (threshold === null || out === null) return false

  const after = rule.afterTime !== false
  if (after) {
    if (out > threshold) return true
    // Crossing midnight: threshold in the evening (>= 18:00) and out is early morning
    if (threshold >= 18 * 60 && isLateNightTime(out)) return true
    return false
  }
  return out < threshold
}

/**
 * Returns the list of allowance categories an employee is eligible for on a given
 * attendance day, i.e. assigned (or all-employees) AND active AND rule satisfied.
 */
export function getEligibleAllowanceCategories(categories, { employeeId, outTime }) {
  if (!Array.isArray(categories)) return []
  const eligible = []
  for (const cat of categories) {
    if (!cat || !cat.active && cat.active !== undefined && cat.active !== true) continue
    if (cat.active === false) continue
    if (!cat.name) continue

    const assignedIds = Array.isArray(cat.assignedEmployeeIds) ? cat.assignedEmployeeIds : []
    const isAllEmployees = assignedIds.length === 0
    const isAssigned = isAllEmployees || assignedIds.includes(employeeId)
    if (!isAssigned) continue

    const ruleMet = isTimeRuleMet(cat.rule || {}, outTime)
    if (!ruleMet) continue

    eligible.push(cat)
  }
  return eligible
}

export function getAllowanceAmount(cat) {
  const amount = Number(cat?.amount)
  return Number.isFinite(amount) && amount >= 0 ? amount : 0
}
