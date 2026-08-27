export const PORTAL_APPROVAL_MODULES = [
  { id: 'Leave', label: 'Leave' },
  { id: 'Advance', label: 'Advance' },
  { id: 'Expense', label: 'Expense' },
]

export const PORTAL_APPROVAL_ROLES = ['Admin', 'HR', 'MD', 'Accountant', 'Finance']

/**
 * Standard module approvals are opt-in: an absent configuration or a
 * configuration explicitly set to "none" must bypass HR and MD queues.
 */
export function requiresStandardApproval(settings, moduleName) {
  const setting = Array.isArray(settings)
    ? settings.find((candidate) => candidate?.moduleName === moduleName)
    : null
  return !!setting?.type && setting.type !== 'none'
}

export function createPortalApprovalDraft(moduleName) {
  return {
    moduleName,
    type: 'single',
    approvers: ['HR'],
    stages: [{ role: 'HR' }, { role: 'MD' }],
  }
}

export function normalizePortalApprovalSetting(setting, moduleName) {
  const draft = createPortalApprovalDraft(moduleName)
  const type = setting?.type === 'multi' ? 'multi' : 'single'
  const approvers = Array.isArray(setting?.approvers)
    ? setting.approvers.filter((role) => PORTAL_APPROVAL_ROLES.includes(role))
    : draft.approvers
  const stages = Array.isArray(setting?.stages)
    ? setting.stages
      .map((stage) => ({ role: String(stage?.role || '').trim() }))
      .filter((stage) => PORTAL_APPROVAL_ROLES.includes(stage.role))
    : draft.stages

  return {
    ...draft,
    ...setting,
    moduleName,
    type,
    approvers: approvers.length ? approvers : draft.approvers,
    stages: stages.length ? stages : draft.stages,
  }
}

export function buildPortalApprovalFields(moduleName, setting) {
  const workflow = normalizePortalApprovalSetting(setting, moduleName)
  const stages = workflow.type === 'single'
    ? [{ roles: workflow.approvers, label: workflow.approvers.join(' / ') }]
    : workflow.stages.map((stage) => ({ roles: [stage.role], label: stage.role }))

  return {
    portalApproval: true,
    portalApprovalModule: moduleName,
    portalApprovalType: workflow.type,
    portalApprovalStages: stages,
    portalApprovalCurrentStage: 0,
    portalApprovalLastAction: 'Pending',
    portalApprovalLastActionBy: null,
    portalApprovalLastActionAt: null,
    approvalType: workflow.type,
    currentStage: 0,
    totalStages: stages.length,
    approverIds: [],
  }
}

export function getPortalApprovalStage(item) {
  const stages = Array.isArray(item?.portalApprovalStages) ? item.portalApprovalStages : []
  const index = Math.max(0, Number(item?.portalApprovalCurrentStage) || 0)
  return stages[index] || null
}

export function canActOnPortalApproval(item, user) {
  if (user?.role?.toLowerCase() === 'admin') return true
  const role = String(user?.role || '').trim().toLowerCase()
  const stage = getPortalApprovalStage(item)
  return !!role && Array.isArray(stage?.roles) && stage.roles.some((allowedRole) => String(allowedRole).toLowerCase() === role)
}
