import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { checklistService } from '../services/checklistService'
import type {
  ChecklistFrequency,
  ChecklistLog,
  ChecklistLogUpsertInput,
  ChecklistTemplate,
  ChecklistTemplateCreateInput,
  ChecklistTemplateUpdateInput,
} from '../types'

type UpdateTemplatePayload = {
  templateId: string
  data: ChecklistTemplateUpdateInput
}

export function useChecklistTemplates(userId: string | null, frequency: ChecklistFrequency | null = null) {
  const queryClient = useQueryClient()

  const query = useQuery<ChecklistTemplate[]>({
    queryKey: ['checklistTemplates', userId, frequency],
    queryFn: () => checklistService.getUserTemplates(userId as string, frequency),
    enabled: Boolean(userId),
    staleTime: 60 * 1000,
  })

  const createMutation = useMutation({
    mutationFn: (data: ChecklistTemplateCreateInput) =>
      checklistService.createTemplate(userId as string, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['checklistTemplates', userId] })
    },
  })

  const updateMutation = useMutation({
    mutationFn: ({ templateId, data }: UpdateTemplatePayload) =>
      checklistService.updateTemplate(templateId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['checklistTemplates', userId] })
    },
  })

  const deleteMutation = useMutation({
    mutationFn: (templateId: string) => checklistService.deleteTemplate(templateId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['checklistTemplates', userId] })
    },
  })

  const reorderMutation = useMutation({
    mutationFn: (orderedIds: string[]) => checklistService.reorderTemplates(userId as string, orderedIds),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['checklistTemplates', userId] })
    },
  })

  return {
    templates: query.data ?? [],
    isLoading: query.isLoading,
    error: query.error,
    refetch: query.refetch,
    createTemplate: createMutation.mutateAsync,
    updateTemplate: updateMutation.mutateAsync,
    deleteTemplate: deleteMutation.mutateAsync,
    reorderTemplates: reorderMutation.mutateAsync,
    isCreating: createMutation.isPending,
    isUpdating: updateMutation.isPending,
    isDeleting: deleteMutation.isPending,
  }
}

export function useChecklistLogs(userId: string | null, month: string | null) {
  const queryClient = useQueryClient()
  const queryKey = ['checklistLogs', userId, month] as const

  const query = useQuery<ChecklistLog[]>({
    queryKey,
    queryFn: () => checklistService.getLogsByMonth(userId as string, month as string),
    enabled: Boolean(userId && month),
    staleTime: 30 * 1000,
  })

  const upsertMutation = useMutation({
    mutationFn: ({ templateId, date, status, note }: ChecklistLogUpsertInput) =>
      checklistService.upsertLog(userId as string, templateId, date, status, note ?? null),
    onSuccess: (saved) => {
      queryClient.setQueryData<ChecklistLog[]>(queryKey, (current = []) => {
        const index = current.findIndex((row) => row.id === saved.id)
        if (index >= 0) {
          const next = [...current]
          next[index] = { ...next[index], ...saved }
          return next
        }
        return [...current, saved]
      })
    },
  })

  const bulkUpsertMutation = useMutation({
    mutationFn: (entries: ChecklistLogUpsertInput[]) =>
      checklistService.upsertLogsBulk(userId as string, entries),
    onSuccess: (savedRows) => {
      queryClient.setQueryData<ChecklistLog[]>(queryKey, (current = []) => {
        if (!savedRows?.length) return current
        const map = new Map(current.map((row) => [row.id, row]))
        savedRows.forEach((row) => {
          const existing = map.get(row.id)
          map.set(row.id, existing ? { ...existing, ...row } : row)
        })
        return Array.from(map.values())
      })
    },
  })

  return {
    logs: query.data ?? [],
    isLoading: query.isLoading,
    error: query.error,
    refetch: query.refetch,
    upsertLog: upsertMutation.mutateAsync,
    bulkUpsertLogs: bulkUpsertMutation.mutateAsync,
    isUpserting: upsertMutation.isPending,
    isBulkUpserting: bulkUpsertMutation.isPending,
  }
}
