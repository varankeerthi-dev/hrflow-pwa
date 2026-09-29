export const ONBOARDING_CHECKLIST = [
  { id: 'offer', title: 'Confirm offer acceptance and agreed role' },
  { id: 'employment-docs', title: 'Collect and review required employment documents' },
  { id: 'start-date', title: 'Confirm start date, manager, and work location' },
  { id: 'equipment-access', title: 'Prepare equipment and request system access' },
  { id: 'first-week', title: 'Share first-week plan and points of contact' },
]

export const OFFBOARDING_CHECKLIST = [
  { id: 'notice', title: 'Confirm notice and last working date' },
  { id: 'handover', title: 'Complete knowledge and responsibility handover' },
  { id: 'assets', title: 'Record return of company property' },
  { id: 'access', title: 'Coordinate account and access closure with the responsible team' },
  { id: 'exit-interview', title: 'Offer and record an exit interview' },
  { id: 'final-review', title: 'Complete final-pay and statutory review with payroll' },
]

export function createLifecycleChecklist(type) {
  const source = type === 'onboarding' ? ONBOARDING_CHECKLIST : OFFBOARDING_CHECKLIST
  return source.map((item) => ({ ...item, completed: false, completedAt: null, completedBy: null }))
}

export function getChecklistProgress(checklist = []) {
  const total = checklist.length
  const completed = checklist.filter((item) => item.completed === true).length
  return {
    total,
    completed,
    percent: total === 0 ? 0 : Math.round((completed / total) * 100),
    isComplete: total > 0 && completed === total,
  }
}

export function validateOnboardingEmployee(details, today = new Date()) {
  const errors = {}
  const name = String(details?.name || '').trim()
  const joinedDate = String(details?.joinedDate || '')
  const parsedDate = joinedDate ? new Date(`${joinedDate}T00:00:00`) : null
  if (!name) errors.name = 'Employee name is required.'
  if (!joinedDate || Number.isNaN(parsedDate?.getTime())) {
    errors.joinedDate = 'A valid joining date is required.'
  } else {
    const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate())
    if (parsedDate > todayStart) errors.joinedDate = 'Create the active employee record on or after the actual joining date.'
  }
  return errors
}

export function validateExitDate(lastWorkingDate, today = new Date()) {
  if (!lastWorkingDate) return 'Last working date is required.'
  const parsedDate = new Date(`${lastWorkingDate}T00:00:00`)
  if (Number.isNaN(parsedDate.getTime())) return 'Enter a valid last working date.'
  const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate())
  if (parsedDate > todayStart) return 'Complete offboarding on or after the last working date.'
  return ''
}
