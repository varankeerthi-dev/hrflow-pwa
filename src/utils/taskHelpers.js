import { format, formatDistanceToNow, differenceInCalendarDays } from 'date-fns'

export const STATUSES = [
  { id: 'todo', label: 'To Do', color: 'bg-gray-100' },
  { id: 'in_progress', label: 'In Progress', color: 'bg-blue-50' },
  { id: 'on_hold', label: 'On Hold', color: 'bg-amber-50' },
  { id: 'review', label: 'Review', color: 'bg-purple-50' },
  { id: 'completed', label: 'Completed', color: 'bg-green-50' },
]

export const CLIENT_FILTERS = [
  { id: 'all', label: 'All Tasks' },
  { id: 'order', label: 'Client Orders' },
  { id: 'complaint', label: 'Client Complaints' },
  { id: 'followup', label: 'Client Follow-ups' },
  { id: 'internal', label: 'Internal Work' },
]

export const clientTypeColor = {
  order: 'text-green-600',
  complaint: 'text-red-600',
  followup: 'text-blue-600'
}

export const clientTypeIcon = {
  order: '',
  complaint: '⚠️',
  followup: ''
}

const FIFTY_DAYS = 50

export function toDate(value) {
  if (!value) return null
  return value.toDate ? value.toDate() : new Date(value)
}

export function formatDate(value, fallback = 'No date') {
  const date = toDate(value)
  if (!date || Number.isNaN(date.getTime())) return fallback
  return format(date, 'dd MMM')
}

export function relativeTime(value) {
  const date = toDate(value)
  if (!date || Number.isNaN(date.getTime())) return ''
  return formatDistanceToNow(date, { addSuffix: true })
}

export function getDaysSince(value) {
  const date = toDate(value)
  if (!date || Number.isNaN(date.getTime())) return 0
  return differenceInCalendarDays(new Date(), date)
}

export function getDaysUntilDeletion(completedAt) {
  const elapsed = getDaysSince(completedAt)
  return Math.max(0, FIFTY_DAYS - elapsed)
}

export function statusLabel(status) {
  return STATUSES.find(s => s.id === status)?.label || status
}

export function isMobile() {
  if (typeof window === 'undefined') return false
  return window.innerWidth < 700
}
