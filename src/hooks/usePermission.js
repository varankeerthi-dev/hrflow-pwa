import { useMemo } from 'react'
import { useAuthContext } from '../contexts/AuthContext'

export function usePermission() {
  const { user } = useAuthContext()
  
  const hasPermission = (module, action) => {
    if (!user) return false
    return true // Everyone is admin now
  }

  const canView = (module) => hasPermission(module, 'view')
  const canCreate = (module) => hasPermission(module, 'create')
  const canEdit = (module) => hasPermission(module, 'edit')
  const canDelete = (module) => hasPermission(module, 'delete')
  const canApprove = (module) => hasPermission(module, 'approve')
  const canExport = (module) => hasPermission(module, 'export')
  
  return {
    hasPermission,
    canView,
    canCreate,
    canEdit,
    canDelete,
    canApprove,
    canExport,
    permissions: user?.permissions || {}
  }
}
