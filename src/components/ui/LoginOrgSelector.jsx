import React, { useState } from 'react'
import { Building2, Check, Loader2, ArrowRight, Plus, LogOut } from 'lucide-react'

export default function LoginOrgSelector({ user, memberships, onSelect, onJoin, onCreate, onLogout }) {
  const [selectedOrgId, setSelectedOrgId] = useState(user?.currentOrgId || memberships[0]?.orgId)
  const [isLoading, setIsLoading] = useState(false)
  const [showJoinForm, setShowJoinForm] = useState(false)
  const [showCreateForm, setShowCreateForm] = useState(false)
  const [orgCode, setOrgCode] = useState('')
  const [orgName, setOrgName] = useState('')
  const [error, setError] = useState('')

  const handleSelect = async () => {
    if (!selectedOrgId) return
    
    setIsLoading(true)
    setError('')
    try {
      // Clear all cached data before switching organization
      clearAllCachedData()
      
      await onSelect(selectedOrgId)
    } catch (err) {
      setError(err.message || 'Failed to select organization')
      setIsLoading(false)
    }
  }

  const clearAllCachedData = () => {
    try {
      console.log('Clearing cached data for organization switch...')
      
      // 1. Clear localStorage (except critical auth tokens)
      const keysToKeep = ['firebase:authUser', 'firebase:previousUser']
      const allKeys = Object.keys(localStorage)
      allKeys.forEach(key => {
        if (!keysToKeep.some(keepKey => key.startsWith(keepKey))) {
          localStorage.removeItem(key)
        }
      })
      
      // 2. Clear sessionStorage completely
      sessionStorage.clear()
      
      // 3. Clear any app-specific cache keys
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
      
      // 4. Clear IndexedDB databases
      if (window.indexedDB) {
        const dbs = ['firebaseLocalStorageDb', 'hrflow-offline-cache']
        dbs.forEach(dbName => {
          try {
            const req = indexedDB.deleteDatabase(dbName)
            req.onsuccess = () => console.log('Deleted IndexedDB:', dbName)
          } catch (e) {
            console.warn('Error deleting IndexedDB:', e)
          }
        })
      }
      
      // 5. Unregister service workers
      if ('serviceWorker' in navigator) {
        navigator.serviceWorker.getRegistrations().then(registrations => {
          registrations.forEach(registration => registration.unregister())
        })
      }
      
      console.log('All cached data cleared successfully')
    } catch (err) {
      console.error('Error clearing cached data:', err)
    }
  }

  const handleJoin = async (e) => {
    e.preventDefault()
    if (!orgCode.trim()) return
    
    setIsLoading(true)
    setError('')
    try {
      await onJoin(orgCode.trim())
      setOrgCode('')
      setShowJoinForm(false)
    } catch (err) {
      setError(err.message || 'Failed to join organization')
      setIsLoading(false)
    }
  }

  const handleCreate = async (e) => {
    e.preventDefault()
    if (!orgName.trim()) return
    
    setIsLoading(true)
    setError('')
    try {
      await onCreate(orgName.trim())
      setOrgName('')
      setShowCreateForm(false)
    } catch (err) {
      setError(err.message || 'Failed to create organization')
      setIsLoading(false)
    }
  }

  if (showJoinForm) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-indigo-50 to-purple-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-8">
          <div className="flex items-center gap-2 mb-6">
            <button 
              onClick={() => { setShowJoinForm(false); setOrgCode(''); setError('') }}
              className="text-zinc-400 hover:text-zinc-600"
            >
              ← Back
            </button>
          </div>
          
          <div className="text-center mb-8">
            <div className="w-16 h-16 bg-indigo-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
              <Building2 size={32} className="text-indigo-600" />
            </div>
            <h2 className="text-2xl font-bold text-zinc-900 mb-2">Join Organization</h2>
            <p className="text-sm text-zinc-500">
              Enter the organization code provided by your administrator
            </p>
          </div>

          <form onSubmit={handleJoin} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-zinc-700 mb-1">
                Organization Code
              </label>
              <input
                type="text"
                value={orgCode}
                onChange={(e) => setOrgCode(e.target.value)}
                placeholder="e.g., acme-corp-abc123"
                className="w-full px-4 py-3 border border-zinc-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                disabled={isLoading}
              />
            </div>

            {error && (
              <div className="p-3 bg-rose-50 border border-rose-100 rounded-lg">
                <p className="text-sm text-rose-600">{error}</p>
              </div>
            )}

            <button
              type="submit"
              disabled={isLoading || !orgCode.trim()}
              className="w-full py-3 bg-indigo-600 text-white rounded-xl text-sm font-semibold hover:bg-indigo-700 disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {isLoading ? (
                <Loader2 size={18} className="animate-spin" />
              ) : (
                <>
                  Join Organization <ArrowRight size={18} />
                </>
              )}
            </button>
          </form>
        </div>
      </div>
    )
  }

  if (showCreateForm) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-emerald-50 to-teal-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-8">
          <div className="flex items-center gap-2 mb-6">
            <button 
              onClick={() => { setShowCreateForm(false); setOrgName(''); setError('') }}
              className="text-zinc-400 hover:text-zinc-600"
            >
              ← Back
            </button>
          </div>
          
          <div className="text-center mb-8">
            <div className="w-16 h-16 bg-emerald-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
              <Plus size={32} className="text-emerald-600" />
            </div>
            <h2 className="text-2xl font-bold text-zinc-900 mb-2">Create Organization</h2>
            <p className="text-sm text-zinc-500">
              Create a new organization. You'll be the administrator.
            </p>
          </div>

          <form onSubmit={handleCreate} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-zinc-700 mb-1">
                Organization Name
              </label>
              <input
                type="text"
                value={orgName}
                onChange={(e) => setOrgName(e.target.value)}
                placeholder="e.g., Acme Corporation"
                className="w-full px-4 py-3 border border-zinc-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                disabled={isLoading}
              />
            </div>

            {error && (
              <div className="p-3 bg-rose-50 border border-rose-100 rounded-lg">
                <p className="text-sm text-rose-600">{error}</p>
              </div>
            )}

            <button
              type="submit"
              disabled={isLoading || !orgName.trim()}
              className="w-full py-3 bg-emerald-600 text-white rounded-xl text-sm font-semibold hover:bg-emerald-700 disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {isLoading ? (
                <Loader2 size={18} className="animate-spin" />
              ) : (
                <>
                  Create Organization <ArrowRight size={18} />
                </>
              )}
            </button>
          </form>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-50 via-white to-purple-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg p-8">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="w-16 h-16 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-lg">
            <Building2 size={32} className="text-white" />
          </div>
          <h1 className="text-2xl font-bold text-zinc-900 mb-2">
            Welcome back, {user?.name?.split(' ')[0] || 'User'}!
          </h1>
          <p className="text-sm text-zinc-500">
            You have access to {memberships.length} organization{memberships.length !== 1 ? 's' : ''}. 
            Select which one to open:
          </p>
        </div>

        {/* Organization List */}
        <div className="space-y-2 mb-6 max-h-64 overflow-y-auto">
          {memberships.map((membership, index) => (
            <button
              key={membership.orgId}
              onClick={() => setSelectedOrgId(membership.orgId)}
              className={`
                w-full flex items-center gap-4 p-4 rounded-xl border-2 transition-all text-left
                ${selectedOrgId === membership.orgId 
                  ? 'border-indigo-600 bg-indigo-50' 
                  : 'border-zinc-100 bg-white hover:border-zinc-200 hover:bg-zinc-50'
                }
              `}
            >
              <div className={`
                w-12 h-12 rounded-xl flex items-center justify-center text-lg font-bold
                ${selectedOrgId === membership.orgId 
                  ? 'bg-indigo-600 text-white' 
                  : 'bg-zinc-100 text-zinc-600'
                }
              `}>
                {membership.orgName?.charAt(0)?.toUpperCase() || String.fromCharCode(65 + index)}
              </div>
              <div className="flex-1 min-w-0">
                <h3 className={`
                  font-semibold truncate
                  ${selectedOrgId === membership.orgId ? 'text-indigo-900' : 'text-zinc-900'}
                `}>
                  {membership.orgName}
                </h3>
                <p className={`
                  text-xs uppercase tracking-wide
                  ${selectedOrgId === membership.orgId ? 'text-indigo-600' : 'text-zinc-500'}
                `}>
                  {membership.role}
                </p>
              </div>
              {selectedOrgId === membership.orgId && (
                <div className="w-6 h-6 bg-indigo-600 rounded-full flex items-center justify-center">
                  <Check size={14} className="text-white" />
                </div>
              )}
            </button>
          ))}
        </div>

        {/* Error Message */}
        {error && (
          <div className="mb-4 p-3 bg-rose-50 border border-rose-100 rounded-lg">
            <p className="text-sm text-rose-600">{error}</p>
          </div>
        )}

        {/* Continue Button */}
        <button
          onClick={handleSelect}
          disabled={isLoading || !selectedOrgId}
          className="w-full py-4 bg-indigo-600 text-white rounded-xl text-base font-bold hover:bg-indigo-700 disabled:opacity-50 transition-all flex items-center justify-center gap-2 shadow-lg shadow-indigo-200"
        >
          {isLoading ? (
            <>
              <Loader2 size={20} className="animate-spin" />
              Opening...
            </>
          ) : (
            <>
              Continue to Organization
              <ArrowRight size={20} />
            </>
          )}
        </button>

        {/* Additional Options */}
        <div className="mt-6 pt-6 border-t border-zinc-100">
          <div className="flex items-center justify-center gap-4">
            <button
              onClick={() => setShowJoinForm(true)}
              className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-zinc-600 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors"
            >
              <Plus size={16} />
              Join Another
            </button>
            <div className="w-px h-6 bg-zinc-200"></div>
            <button
              onClick={() => setShowCreateForm(true)}
              className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-zinc-600 hover:text-emerald-600 hover:bg-emerald-50 rounded-lg transition-colors"
            >
              <Building2 size={16} />
              Create New
            </button>
            <div className="w-px h-6 bg-zinc-200"></div>
            <button
              onClick={onLogout}
              className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-zinc-600 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors"
            >
              <LogOut size={16} />
              Sign Out
            </button>
          </div>
        </div>

        {/* Footer Hint */}
        <p className="mt-6 text-center text-xs text-zinc-400">
          You can switch organizations anytime from the header menu after logging in.
        </p>
      </div>

      {/* Full-screen loading overlay during organization switch */}
      {isLoading && (
        <div className="fixed inset-0 bg-white/95 backdrop-blur-sm flex flex-col items-center justify-center z-[100]">
          <div className="w-16 h-16 border-4 border-indigo-200 border-t-indigo-600 rounded-full animate-spin mb-4"></div>
          <h3 className="text-xl font-bold text-zinc-900 mb-1">Switching Organization...</h3>
          <p className="text-sm text-zinc-500">Clearing cached data and loading new organization</p>
          <div className="mt-4 px-6 py-3 bg-zinc-100 rounded-xl">
            <p className="text-sm text-zinc-700">
              <span className="font-semibold">Selected:</span> {memberships.find(m => m.orgId === selectedOrgId)?.orgName}
            </p>
          </div>
        </div>
      )}
    </div>
  )
}
