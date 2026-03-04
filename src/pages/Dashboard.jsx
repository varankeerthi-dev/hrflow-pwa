import { useState, useEffect, useMemo, Component } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import AttendanceTab from '../components/tabs/AttendanceTab'
import CorrectionTab from '../components/tabs/CorrectionTab'
import ApprovalsTab from '../components/tabs/ApprovalsTab'
import SummaryTab from '../components/tabs/SummaryTab'
import SettingsTab from '../components/tabs/SettingsTab'

// ─── Simple Error Boundary ───────────────────────────────────────────────────
class ErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { hasError: false, error: null }
  }
  static getDerivedStateFromError(error) {
    return { hasError: true, error }
  }
  componentDidCatch(error, errorInfo) {
    console.error('ErrorBoundary caught an error:', error, errorInfo)
  }
  render() {
    if (this.state.hasError) {
      return (
        <div className="p-8 text-center bg-red-50 border border-red-100 rounded-3xl m-4">
          <div className="text-4xl mb-4">⚠️</div>
          <h2 className="text-xl font-bold text-red-800 mb-2">Tab Crashed</h2>
          <p className="text-red-600 text-sm mb-6">{this.state.error?.message || 'Failed to load content.'}</p>
          <button onClick={() => window.location.reload()} className="bg-red-600 text-white px-6 py-2 rounded-xl font-bold shadow-lg">
            Reload App
          </button>
        </div>
      )
    }
    return this.props.children
  }
}

function getInitials(name) {
  return name?.split(' ').map(n => n[0]).join('').toUpperCase() || '??'
}

function getAvatarColor(id) {
  let hash = 0
  for (let i = 0; i < (id || '').length; i++) hash = id.charCodeAt(i) + ((hash << 5) - hash)
  const h = hash % 360
  return `hsl(${h}, 70%, 50%)`
}

// ─── Org Setup Modal ────────
function OrgSetupModal({ user, onJoin, onCreate }) {
  const [modalTab, setModalTab] = useState('join')
  const [orgCode, setOrgCode] = useState('')
  const [orgName, setOrgName] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [createdCode, setCreatedCode] = useState(null)

  const isAdmin = user?.role === 'admin'
  const hasOrg = !!user?.orgId

  const handleJoin = async (e) => {
    e.preventDefault()
    if (!orgCode.trim()) { setError('Please enter an organisation code.'); return }
    setLoading(true); setError('')
    try { await onJoin(orgCode.trim()) }
    catch (err) { setError(err.message); setLoading(false) }
  }

  const handleCreate = async (e) => {
    e.preventDefault()
    if (!orgName.trim()) { setError('Please enter an organisation name.'); return }
    setLoading(true); setError('')
    try { const code = await onCreate(orgName.trim()); setCreatedCode(code); setLoading(false) }
    catch (err) { setError(err.message); setLoading(false) }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-8 mx-4 border border-gray-100">
        <div className="flex flex-col items-center mb-5">
          <div className="w-14 h-14 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-500 flex items-center justify-center mb-3">
            <span className="text-white text-2xl">🏢</span>
          </div>
          <h2 className="text-xl font-bold text-gray-800">Set Up Your Organisation</h2>
          <p className="text-sm text-gray-500 text-center mt-1">
            {hasOrg && isAdmin ? 'Create an additional organisation.' : 'Create a new organisation or join an existing one.'}
          </p>
        </div>

        {!(hasOrg && isAdmin) && (
          <div className="flex bg-gray-100 rounded-xl p-1 mb-5">
            <button onClick={() => { setModalTab('join'); setError('') }}
              className={`flex-1 py-2 rounded-lg text-sm font-semibold transition-all ${modalTab === 'join' ? 'bg-white shadow text-indigo-600' : 'text-gray-500 hover:text-gray-700'}`}>
              Join
            </button>
            <button onClick={() => { setModalTab('create'); setError('') }}
              className={`flex-1 py-2 rounded-lg text-sm font-semibold transition-all ${modalTab === 'create' ? 'bg-white shadow text-indigo-600' : 'text-gray-500 hover:text-gray-700'}`}>
              Create
            </button>
          </div>
        )}

        {error && <div className="bg-red-50 border border-red-200 text-red-600 px-4 py-2 rounded-lg text-sm mb-4">{error}</div>}

        {createdCode ? (
          <div className="space-y-3">
            <div className="bg-green-50 border border-green-200 rounded-lg p-4 text-center">
              <p className="text-sm text-green-700 font-medium mb-2">Organisation created! 🎉</p>
              <p className="text-xs text-gray-500 mb-1">Share this code with your team:</p>
              <div className="bg-white border border-gray-200 rounded-lg px-4 py-2 font-mono text-indigo-700 font-bold tracking-wide text-sm select-all">{createdCode}</div>
            </div>
            <p className="text-xs text-gray-400 text-center">You can now use the app. The code is also in Settings.</p>
          </div>
        ) : (modalTab === 'join' && !(hasOrg && isAdmin)) ? (
          <form onSubmit={handleJoin} className="space-y-4">
            <input value={orgCode} onChange={e => setOrgCode(e.target.value)}
              placeholder="Organisation code"
              className="w-full border border-gray-300 rounded-lg px-4 py-2.5 focus:ring-2 focus:ring-indigo-500 outline-none text-sm" />
            <button type="submit" disabled={loading}
              className="w-full bg-gradient-to-r from-indigo-500 to-purple-500 text-white font-semibold py-2.5 rounded-lg shadow-lg transition-all disabled:opacity-50">
              {loading ? 'Joining…' : 'Join Organisation'}
            </button>
          </form>
        ) : (
          <form onSubmit={handleCreate} className="space-y-4">
            <input value={orgName} onChange={e => setOrgName(e.target.value)}
              placeholder="Organisation name"
              className="w-full border border-gray-300 rounded-lg px-4 py-2.5 focus:ring-2 focus:ring-indigo-500 outline-none text-sm" />
            <button type="submit" disabled={loading}
              className="w-full bg-gradient-to-r from-indigo-500 to-purple-500 text-white font-semibold py-2.5 rounded-lg shadow-lg transition-all disabled:opacity-50">
              {loading ? 'Creating…' : 'Create Organisation'}
            </button>
          </form>
        )}
      </div>
    </div>
  )
}

// ─── Dashboard ────────────────────────────────────────────────────────────────
export default function Dashboard() {
  const { user, logout, joinOrganisation, createOrganisation } = useAuth()
  const [activeTab, setActiveTab] = useState('attendance')
  const [isCollapsed, setIsCollapsed] = useState(false)

  const tabs = useMemo(() => [
    { id: 'attendance', label: 'Attendance', icon: '📅' },
    { id: 'correction', label: 'Correction', icon: '✏️' },
    { id: 'approvals', label: 'Approvals', icon: '✅', badge: 'OT' },
    { id: 'summary', label: 'Summary', icon: '📊' },
    { id: 'settings', label: 'Settings', icon: '⚙️' },
  ], [])

  const renderTabContent = () => {
    switch (activeTab) {
      case 'attendance': return <AttendanceTab />
      case 'correction': return <CorrectionTab />
      case 'approvals': return <ApprovalsTab />
      case 'summary': return <SummaryTab />
      case 'settings': return <SettingsTab />
      default: return <AttendanceTab />
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      {/* Show org setup modal if user has no org yet */}
      {user && !user.orgId && (
        <OrgSetupModal
          user={user}
          onJoin={joinOrganisation}
          onCreate={createOrganisation}
        />
      )}

      {/* Sticky Top Header */}
      <header className="sticky top-0 z-40 bg-white border-b border-gray-200 shadow-sm h-16 shrink-0">
        <div className="max-w-full mx-auto px-4 h-full flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button 
              onClick={() => setIsCollapsed(!isCollapsed)}
              className="p-2 hover:bg-gray-100 rounded-lg text-gray-500 hidden md:block transition-colors"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            </button>
            <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-indigo-500 to-purple-500 flex items-center justify-center">
              <span className="text-white text-lg font-bold">H</span>
            </div>
            <span className="text-xl font-bold text-gray-800">HRFlow</span>
            <span className="text-gray-400 text-sm ml-2 hidden lg:inline-block">{user?.orgName || user?.orgId || ''}</span>
          </div>

          <div className="flex items-center gap-3">
            <div className="hidden sm:flex flex-col items-end mr-2 text-right">
              <span className="text-sm font-bold text-gray-800 leading-tight">{user?.name || 'User'}</span>
              <span className="text-[10px] text-indigo-500 font-bold uppercase tracking-wider">{user?.role || 'Employee'}</span>
            </div>
            <div
              className="w-9 h-9 rounded-full flex items-center justify-center text-white text-sm font-bold border-2 border-white shadow-sm"
              style={{ backgroundColor: getAvatarColor(user?.uid) }}
            >
              {getInitials(user?.name)}
            </div>
            <button
              onClick={logout}
              className="p-2 text-gray-400 hover:text-red-500 transition-colors"
              title="Logout"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
              </svg>
            </button>
          </div>
        </div>
      </header>

      <div className="flex flex-1 min-h-0 overflow-hidden">
        {/* Left Sidebar - Desktop */}
        <aside className={`${isCollapsed ? 'w-20' : 'w-64'} bg-white border-r border-gray-200 hidden md:flex flex-col shrink-0 transition-all duration-300 ease-in-out`}>
          <nav className="flex-1 p-3 space-y-1.5 overflow-y-auto">
            {!isCollapsed && (
              <div className="px-3 mb-4">
                 <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Main Menu</p>
              </div>
            )}
            {tabs.map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                title={isCollapsed ? tab.label : ''}
                className={`w-full flex items-center ${isCollapsed ? 'justify-center' : 'gap-3 px-4'} py-3 rounded-xl text-sm font-bold transition-all ${activeTab === tab.id
                  ? 'bg-indigo-500 text-white shadow-lg shadow-indigo-200'
                  : 'text-gray-500 hover:bg-gray-50 hover:text-gray-900'
                  }`}
              >
                <span className="text-xl">{tab.icon}</span>
                {!isCollapsed && <span className="truncate">{tab.label}</span>}
                {!isCollapsed && tab.badge && (
                  <span className={`ml-auto px-1.5 py-0.5 rounded text-[10px] font-black ${activeTab === tab.id ? 'bg-white/20 text-white' : 'bg-amber-100 text-amber-700'}`}>
                    {tab.badge}
                  </span>
                )}
              </button>
            ))}
          </nav>
          
          <div className="p-4 border-t border-gray-100">
            {isCollapsed ? (
              <div className="w-10 h-10 rounded-lg bg-indigo-100 flex items-center justify-center text-indigo-600 text-xs font-bold mx-auto">
                PRO
              </div>
            ) : (
              <div className="bg-gray-50 rounded-xl p-3 flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-indigo-100 flex items-center justify-center text-indigo-600 text-xs font-bold">
                  PRO
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-bold text-gray-800 truncate">HRFlow Pro</p>
                  <p className="text-[10px] text-gray-500 truncate">Active Plan</p>
                </div>
              </div>
            )}
          </div>
        </aside>

        {/* Main Content Area */}
        <div className="flex-1 flex flex-col min-w-0 bg-gray-50/50">
          {/* Top Nav - Mobile */}
          <nav className="md:hidden sticky top-0 z-30 bg-white border-b border-gray-200 overflow-x-auto flex items-center shrink-0">
            <div className="flex px-2 h-12">
              {tabs.map(tab => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`px-4 h-full flex items-center text-xs font-bold whitespace-nowrap border-b-2 transition-all ${activeTab === tab.id
                    ? 'border-indigo-500 text-indigo-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700'
                    }`}
                >
                  {tab.icon} <span className="ml-1.5">{tab.label}</span>
                </button>
              ))}
            </div>
          </nav>

          <main className="flex-1 overflow-auto p-4 md:p-6 lg:p-8">
            <div className="max-w-7xl mx-auto">
              <div className="mb-6 flex items-center justify-between">
                <div>
                  <h1 className="text-2xl font-black text-gray-900 capitalize tracking-tight">{activeTab}</h1>
                  <p className="text-sm text-gray-500 font-medium">Manage your {activeTab} information</p>
                </div>
              </div>

              <div className="bg-white rounded-3xl shadow-xl shadow-gray-200/50 border border-gray-100 overflow-hidden min-h-[600px]">
                <div className="h-full p-4 md:p-6">
                  <ErrorBoundary key={activeTab}>
                    {renderTabContent()}
                  </ErrorBoundary>
                </div>
              </div>
            </div>
          </main>
        </div>
      </div>
    </div>
  )
}
