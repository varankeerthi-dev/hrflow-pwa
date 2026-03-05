import { useMemo } from 'react'
import { useAuthContext } from '../contexts/AuthContext'

export function usePermission() {
  const { user } = useAuthContext()
  
  const hasPermission = (module, action) => {
    if (!user) return false
    
    // Admin has full access
    if (user.role === 'admin') return true
    
    // Check cached permissions
    const permissions = user.permissions || {}
    const modulePerms = permissions[module]
    
    if (!modulePerms) return false
    
    // Full access check
    if (modulePerms.full) return true
    
    // Check specific permission
    return modulePerms[action] || false
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
