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

  const query = useQuery<ChecklistLog[]>({
    queryKey: ['checklistLogs', userId, month],
    queryFn: () => checklistService.getLogsByMonth(userId as string, month as string),
    enabled: Boolean(userId && month),
    staleTime: 30 * 1000,
  })

  const upsertMutation = useMutation({
    mutationFn: ({ templateId, date, status, note }: ChecklistLogUpsertInput) =>
      checklistService.upsertLog(userId as string, templateId, date, status, note ?? null),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['checklistLogs', userId, month] })
    },
  })

  return {
    logs: query.data ?? [],
    isLoading: query.isLoading,
    error: query.error,
    refetch: query.refetch,
    upsertLog: upsertMutation.mutateAsync,
    isUpserting: upsertMutation.isPending,
  }
}
