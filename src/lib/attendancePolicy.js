// Attendance policy model: safe defaults first, explicit controls second, and no automatic financial penalty by default.

export const DEFAULT_ATTENDANCE_POLICY = {
  version: 1,
  status: 'draft',
  fullDay: {
    classificationMode: 'minutes',
    minimumWorkMinutes: 480,
    fullDayPercent: 75,
    halfDayPercent: 50,
    belowHalfDayStatus: 'absent',
  },
  gracePeriod: {
    arrivalMinutes: 15,
    departureMinutes: 0,
    scope: 'per_shift',
    applyTo: 'arrival',
  },
  latePenalty: {
    enabled: false,
    mode: 'warning_only',
    trigger: 'after_grace',
    fixedAmount: 0,
    perMinuteAmount: 0,
    incidentsBeforePenalty: 3,
    reviewWindow: 'calendar_month',
  },
}

export function normalizeAttendancePolicy(policy = {}) {
  return {
    ...DEFAULT_ATTENDANCE_POLICY,
    ...policy,
    fullDay: { ...DEFAULT_ATTENDANCE_POLICY.fullDay, ...(policy.fullDay || {}) },
    gracePeriod: { ...DEFAULT_ATTENDANCE_POLICY.gracePeriod, ...(policy.gracePeriod || {}) },
    latePenalty: { ...DEFAULT_ATTENDANCE_POLICY.latePenalty, ...(policy.latePenalty || {}) },
  }
}

export function calculateLateMinutes({ shiftStart, actualArrival, graceMinutes = 0 }) {
  if (!shiftStart || !actualArrival) return { rawLateMinutes: 0, chargeableLateMinutes: 0 }
  const [shiftHour, shiftMinute] = String(shiftStart).split(':').map(Number)
  const [arrivalHour, arrivalMinute] = String(actualArrival).split(':').map(Number)
  const scheduledMinutes = (shiftHour * 60) + shiftMinute
  const actualMinutes = (arrivalHour * 60) + arrivalMinute
  const rawLateMinutes = Math.max(0, actualMinutes - scheduledMinutes)
  return {
    rawLateMinutes,
    chargeableLateMinutes: Math.max(0, rawLateMinutes - Number(graceMinutes || 0)),
  }
}
