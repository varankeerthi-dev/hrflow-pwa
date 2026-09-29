import { format, addDays } from 'date-fns'

/**
 * Natural language date/time parser.
 * Examples:
 * - "call rosti tomorrow 10 a.m" -> Tomorrow at 10:00 AM
 * - "review documents next monday 3:30 pm" -> Next Monday at 3:30 PM
 * - "submit report today 5pm" -> Today at 5:00 PM
 * - "team sync tomorrow at 11:30" -> Tomorrow at 11:30 AM
 * - "project meeting in 2 days at 4pm" -> In 2 days at 4:00 PM
 */
export function parseNaturalDate(text) {
  if (!text || typeof text !== 'string') return null
  const lower = text.toLowerCase()

  let targetDate = null
  let hasDate = false
  let hasTime = false
  let hours = 10 // default 10 AM if date only is found
  let minutes = 0

  const now = new Date()

  // 1. Relative day offsets: "in X days"
  const inDaysMatch = lower.match(/\bin\s+(\d+)\s+days?\b/i)
  if (inDaysMatch) {
    const daysOffset = parseInt(inDaysMatch[1], 10)
    targetDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() + daysOffset)
    hasDate = true
  }
  // "day after tomorrow"
  else if (/\bday after tomorrow\b/i.test(lower)) {
    targetDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 2)
    hasDate = true
  }
  // "tomorrow" / "tmrw"
  else if (/\btomorrow\b|\btmrw\b/i.test(lower)) {
    targetDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1)
    hasDate = true
  }
  // "today" / "tonight"
  else if (/\btoday\b|\btonight\b/i.test(lower)) {
    targetDate = new Date(now.getFullYear(), now.getMonth(), now.getDate())
    hasDate = true
    if (/\btonight\b/i.test(lower)) {
      hours = 20
      hasTime = true
    }
  }

  // 2. Day of week: "next monday", "this friday", "on tuesday", etc.
  const daysOfWeek = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday']
  const weekdayMatch = lower.match(/\b(?:on\s+|next\s+|this\s+)?(sunday|monday|tuesday|wednesday|thursday|friday|saturday)\b/i)
  if (weekdayMatch && !hasDate) {
    const isNext = /\bnext\s+/i.test(lower)
    const dayName = weekdayMatch[1].toLowerCase()
    const targetDayIndex = daysOfWeek.indexOf(dayName)
    const currentDayIndex = now.getDay()
    let daysToAdd = (targetDayIndex - currentDayIndex + 7) % 7
    if (daysToAdd === 0 || isNext) daysToAdd += 7
    targetDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() + daysToAdd)
    hasDate = true
  }

  // 3. Time extraction
  // Matches: "10 a.m.", "10 a.m", "10am", "10 am", "10:30 a.m.", "10:30am", "10:30 am", "at 10 a.m"
  const time12Match = lower.match(/\b(?:at\s+)?(\d{1,2})(?::(\d{2}))?\s*(a\.?m\.?|p\.?m\.?)\b/i)
  if (time12Match) {
    let h = parseInt(time12Match[1], 10)
    const m = time12Match[2] ? parseInt(time12Match[2], 10) : 0
    const meridian = time12Match[3].replace(/\./g, '').toLowerCase()
    if (meridian === 'pm' && h < 12) h += 12
    if (meridian === 'am' && h === 12) h = 0
    hours = h
    minutes = m
    hasTime = true
  } else {
    // 24 hour: "at 14:00" or "14:30"
    const time24Match = lower.match(/\b(?:at\s+)?([01]?\d|2[0-3]):([0-5]\d)\b/i)
    if (time24Match) {
      hours = parseInt(time24Match[1], 10)
      minutes = parseInt(time24Match[2], 10)
      hasTime = true
    }
  }

  if (hasDate || hasTime) {
    const baseDate = targetDate || new Date(now.getFullYear(), now.getMonth(), now.getDate())
    baseDate.setHours(hours, minutes, 0, 0)
    
    // Format human-friendly label
    let label = ''
    if (hasDate && hasTime) {
      label = format(baseDate, 'MMM d, yyyy h:mm a')
    } else if (hasDate) {
      label = format(baseDate, 'MMM d, yyyy')
    } else {
      label = `Today at ${format(baseDate, 'h:mm a')}`
    }

    return {
      date: baseDate,
      hasDate,
      hasTime,
      label
    }
  }

  return null
}
