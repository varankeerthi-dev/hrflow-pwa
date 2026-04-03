import React, { useState, useRef, useEffect } from 'react'
import { useAuth } from '../../hooks/useAuth'
import { Building2, ChevronDown, Check, Plus, LogOut, Loader2 } from 'lucide-react'

export default function OrganizationSwitcher() {
  const { user, switchOrganisation, logout, createOrganisation, joinOrganisation } = useAuth()
  const [isOpen, setIsOpen] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [showJoinModal, setShowJoinModal] = useState(false)
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [orgCode, setOrgCode] = useState('')
  const [orgName, setOrgName] = useState('')
  const [error, setError] = useState('')
  const dropdownRef = useRef(null)

  const memberships = user?.memberships || []
  const currentOrgId = user?.orgId
  const currentOrg = memberships.find(m => m.orgId === currentOrgId) || { orgName: user?.orgName || 'No Organization', role: user?.role || 'Guest' }
  const canSwitch = memberships.length > 1

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  // Keyboard shortcut: Ctrl/Cmd + Shift + O
  useEffect(() => {
    function handleKeyDown(e) {
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'O') {
        e.preventDefault()
        if (canSwitch) setIsOpen(true)
      }
      if (e.key === 'Escape') {
        setIsOpen(false)
      }
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [canSwitch])

  const handleSwitch = async (orgId) => {
    if (orgId === currentOrgId) {
      setIsOpen(false)
      return
    }
    
    setIsLoading(true)
    setError('')
    try {
      // Clear all cached data before switching
      clearAllCachedData()
      
      await switchOrganisation(orgId)
      setIsOpen(false)
      
      // Force a full page reload with cache bypass
      window.location.href = window.location.origin + '/?nocache=' + Date.now()
    } catch (err) {
      setError(err.message || 'Failed to switch organization')
    } finally {
      setIsLoading(false)
    }
  }

  const clearAllCachedData = () => {
    try {
      console.log('Clearing cached data for organization switch...')
      
      // 1. Clear localStorage (except critical auth tokens)
      const keysToKeep = ['firebase:authUser', 'firebase:previousUser'] // Keep auth session
      const allKeys = Object.keys(localStorage)
      allKeys.forEach(key => {
        if (!keysToKeep.some(keepKey => key.startsWith(keepKey))) {
          localStorage.removeItem(key)
          console.log('Cleared localStorage:', key)
        }
      })
      
      // 2. Clear sessionStorage completely
      sessionStorage.clear()
      console.log('Cleared sessionStorage')
      
      // 3. Clear any app-specific cache keys that might exist
      const appCacheKeys = [
        'hrflow_employees',
        'hrflow_attendance',
        'hrflow_leaves',
        'hrflow_settings',
        'hrflow_cache',
        'org_data',
        'employee_data',
        'last_sync'
      ]
      appCacheKeys.forEach(key => {
        localStorage.removeItem(key)
        sessionStorage.removeItem(key)
      })
      
      // 4. Clear IndexedDB databases if supported
      if (window.indexedDB) {
        const dbs = ['firebaseLocalStorageDb', 'hrflow-offline-cache']
        dbs.forEach(dbName => {
          try {
            const req = indexedDB.deleteDatabase(dbName)
            req.onsuccess = () => console.log('Deleted IndexedDB:', dbName)
            req.onerror = () => console.warn('Failed to delete IndexedDB:', dbName)
          } catch (e) {
            console.warn('Error deleting IndexedDB:', e)
          }
        })
      }
      
      // 5. Unregister service workers to clear their cache
      if ('serviceWorker' in navigator) {
        navigator.serviceWorker.getRegistrations().then(registrations => {
          registrations.forEach(registration => {
            registration.unregister()
            console.log('Unregistered service worker')
          })
        })
      }
      
      // 6. Clear any React Query / SWR cache by resetting global state
      if (window.__REACT_QUERY_GLOBAL_CACHE__) {
        window.__REACT_QUERY_GLOBAL_CACHE__.clear()
      }
      
      console.log('All cached data cleared successfully')
    } catch (err) {
      console.error('Error clearing cached data:', err)
      // Continue anyway - the page reload will help
    }
  }

  const handleJoinOrg = async (e) => {
    e.preventDefault()
    if (!orgCode.trim()) return
    
    setIsLoading(true)
    setError('')
    try {
      await joinOrganisation(orgCode.trim())
      setShowJoinModal(false)
      setOrgCode('')
      // Clear cache and reload with new org
      clearAllCachedData()
      window.location.href = window.location.origin + '/?nocache=' + Date.now()
    } catch (err) {
      setError(err.message || 'Failed to join organization')
      setIsLoading(false)
    }
  }

  const handleCreateOrg = async (e) => {
    e.preventDefault()
    if (!orgName.trim()) return
    
    setIsLoading(true)
    setError('')
    try {
      await createOrganisation(orgName.trim())
      setShowCreateModal(false)
      setOrgName('')
      // Clear cache and reload with new org
      clearAllCachedData()
      window.location.href = window.location.origin + '/?nocache=' + Date.now()
    } catch (err) {
      setError(err.message || 'Failed to create organization')
      setIsLoading(false)
    }
  }

  // If user has no organizations, show minimal UI
  if (!user?.orgId && memberships.length === 0) {
    return (
      <div className="flex items-center gap-2 px-3 py-2 bg-amber-50 border border-amber-200 rounded-lg">
        <Building2 size={18} className="text-amber-600" />
        <span className="text-sm font-medium text-amber-700">No Organization</span>
      </div>
    )
  }

  return (
    <>
      <div className="relative" ref={dropdownRef}>
        {/* Current Organization Button */}
        <button
          onClick={() => canSwitch && setIsOpen(!isOpen)}
          disabled={isLoading}
          className={`
            flex items-center gap-2 px-3 py-2 rounded-lg transition-all
            ${canSwitch ? 'hover:bg-zinc-100 cursor-pointer' : 'cursor-default'}
            ${isLoading ? 'opacity-70' : ''}
            ${isOpen ? 'bg-zinc-100' : 'bg-white border border-zinc-200'}
          `}
          title={canSwitch ? `Current: ${currentOrg.orgName} (${currentOrg.role})` : currentOrg.orgName}
        >
          <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-indigo-100 text-indigo-700">
            <Building2 size={18} />
          </div>
          <div className="hidden sm:flex flex-col items-start">
            <span className="text-xs font-bold text-zinc-900 leading-tight max-w-[140px] truncate">
              {currentOrg.orgName}
            </span>
            <span className="text-[10px] font-medium text-zinc-500 uppercase tracking-wide">
              {currentOrg.role}
            </span>
          </div>
          {canSwitch && (
            <ChevronDown 
              size={16} 
              className={`text-zinc-400 transition-transform ${isOpen ? 'rotate-180' : ''}`}
            />
          )}
          {isLoading && <Loader2 size={16} className="animate-spin text-zinc-400" />}
        </button>

        {/* Dropdown Menu */}
        {isOpen && canSwitch && (
          <div className="absolute top-full right-0 mt-2 w-72 bg-white rounded-xl shadow-2xl border border-zinc-200 z-50 overflow-hidden">
            {/* Header */}
            <div className="px-4 py-3 bg-zinc-50 border-b border-zinc-100">
              <p className="text-[10px] font-black text-zinc-400 uppercase tracking-wider">
                Switch Organization
              </p>
              <p className="text-xs text-zinc-500 mt-0.5">
                {memberships.length} organization{memberships.length !== 1 ? 's' : ''} available
              </p>
            </div>

            {/* Organization List */}
            <div className="max-h-64 overflow-y-auto py-1">
              {memberships.map((membership, index) => (
                <button
                  key={membership.orgId}
                  onClick={() => handleSwitch(membership.orgId)}
                  disabled={isLoading}
                  className={`
                    w-full flex items-center gap-3 px-4 py-3 text-left transition-colors
                    ${membership.orgId === currentOrgId 
                      ? 'bg-indigo-50 border-l-2 border-indigo-600' 
                      : 'hover:bg-zinc-50 border-l-2 border-transparent'
                    }
                    ${isLoading ? 'opacity-50 cursor-not-allowed' : ''}
                  `}
                >
                  <div className={`
                    flex items-center justify-center w-8 h-8 rounded-lg text-xs font-black
                    ${membership.orgId === currentOrgId 
                      ? 'bg-indigo-600 text-white' 
                      : 'bg-zinc-100 text-zinc-600'
                    }
                  `}>
                    {String.fromCharCode(65 + index)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className={`
                      text-sm font-semibold truncate
                      ${membership.orgId === currentOrgId ? 'text-indigo-900' : 'text-zinc-700'}
                    `}>
                      {membership.orgName}
                    </p>
                    <p className="text-[10px] font-medium text-zinc-500 uppercase">
                      {membership.role}
                    </p>
                  </div>
                  {membership.orgId === currentOrgId && (
                    <Check size={16} className="text-indigo-600" />
                  )}
                </button>
              ))}
            </div>

            {/* Error Message */}
            {error && (
              <div className="px-4 py-2 bg-rose-50 border-t border-rose-100">
                <p className="text-xs text-rose-600">{error}</p>
              </div>
            )}

            {/* Footer Actions */}
            <div className="border-t border-zinc-100 p-2 space-y-1">
              <button
                onClick={() => { setIsOpen(false); setShowJoinModal(true) }}
                className="w-full flex items-center gap-2 px-3 py-2 text-sm font-medium text-zinc-600 hover:bg-zinc-50 rounded-lg transition-colors"
              >
                <Plus size={16} />
                Join Organization
              </button>
              <button
                onClick={() => { setIsOpen(false); setShowCreateModal(true) }}
                className="w-full flex items-center gap-2 px-3 py-2 text-sm font-medium text-zinc-600 hover:bg-zinc-50 rounded-lg transition-colors"
              >
                <Building2 size={16} />
                Create Organization
              </button>
              <button
                onClick={logout}
                className="w-full flex items-center gap-2 px-3 py-2 text-sm font-medium text-rose-600 hover:bg-rose-50 rounded-lg transition-colors"
              >
                <LogOut size={16} />
                Sign Out
              </button>
            </div>

            {/* Keyboard Hint */}
            <div className="px-4 py-2 bg-zinc-50 border-t border-zinc-100">
              <p className="text-[10px] text-zinc-400 text-center">
                Press <kbd className="px-1.5 py-0.5 bg-white border border-zinc-200 rounded text-zinc-600 font-mono">Ctrl+Shift+O</kbd> to open
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Join Organization Modal */}
      {showJoinModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6">
            <h3 className="text-lg font-bold text-zinc-900 mb-2">Join Organization</h3>
            <p className="text-sm text-zinc-500 mb-4">
              Enter the organization code provided by your admin to join.
            </p>
            <form onSubmit={handleJoinOrg}>
              <input
                type="text"
                value={orgCode}
                onChange={(e) => setOrgCode(e.target.value)}
                placeholder="e.g., acme-corp-abc123"
                className="w-full border border-zinc-200 rounded-lg px-4 py-3 text-sm mb-4 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                disabled={isLoading}
              />
              {error && <p className="text-sm text-rose-600 mb-4">{error}</p>}
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => { setShowJoinModal(false); setOrgCode(''); setError('') }}
                  disabled={isLoading}
                  className="flex-1 px-4 py-2 border border-zinc-200 rounded-lg text-sm font-medium text-zinc-600 hover:bg-zinc-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isLoading || !orgCode.trim()}
                  className="flex-1 px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {isLoading ? <Loader2 size={16} className="animate-spin" /> : 'Join'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Create Organization Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6">
            <h3 className="text-lg font-bold text-zinc-900 mb-2">Create Organization</h3>
            <p className="text-sm text-zinc-500 mb-4">
              Create a new organization. You'll be the admin.
            </p>
            <form onSubmit={handleCreateOrg}>
              <input
                type="text"
                value={orgName}
                onChange={(e) => setOrgName(e.target.value)}
                placeholder="e.g., Acme Corporation"
                className="w-full border border-zinc-200 rounded-lg px-4 py-3 text-sm mb-4 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                disabled={isLoading}
              />
              {error && <p className="text-sm text-rose-600 mb-4">{error}</p>}
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => { setShowCreateModal(false); setOrgName(''); setError('') }}
                  disabled={isLoading}
                  className="flex-1 px-4 py-2 border border-zinc-200 rounded-lg text-sm font-medium text-zinc-600 hover:bg-zinc-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isLoading || !orgName.trim()}
                  className="flex-1 px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {isLoading ? <Loader2 size={16} className="animate-spin" /> : 'Create'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      {/* Full-screen loading overlay during organization switch */}
      {isLoading && (
        <div className="fixed inset-0 bg-white/90 backdrop-blur-sm flex flex-col items-center justify-center z-[100]">
          <div className="w-16 h-16 border-4 border-indigo-200 border-t-indigo-600 rounded-full animate-spin mb-4"></div>
          <h3 className="text-lg font-bold text-zinc-900 mb-1">Switching Organization...</h3>
          <p className="text-sm text-zinc-500">Clearing cached data and loading new organization</p>
          <div className="mt-4 px-4 py-2 bg-zinc-100 rounded-lg">
            <p className="text-xs text-zinc-600">
              <span className="font-semibold">From:</span> {currentOrg.orgName}
            </p>
          </div>
        </div>
      )}
    </>
  )
}
