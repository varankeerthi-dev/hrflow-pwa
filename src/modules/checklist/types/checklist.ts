export type ChecklistFrequency = 'daily' | 'weekly'

export type ChecklistLogStatus = 'done' | 'skipped' | 'not_required'

export type ChecklistTemplate = {
  id: string
  name: string
  frequency: ChecklistFrequency
  userId: string
  order: number
  active: boolean
  createdAt?: unknown
  updatedAt?: unknown
}

export type ChecklistTemplateCreateInput = {
  name: string
  frequency: ChecklistFrequency
  order?: number
  active?: boolean
}

export type ChecklistTemplateUpdateInput = {
  name?: string
  frequency?: ChecklistFrequency
  order?: number
  active?: boolean
}

export type ChecklistLog = {
  id: string
  templateId: string
  userId: string
  date: string
  status: ChecklistLogStatus
  note?: string | null
  createdAt?: unknown
  updatedAt?: unknown
}

export type ChecklistLogUpsertInput = {
  templateId: string
  date: string
  status: ChecklistLogStatus
  note?: string | null
}
