import { useState, useEffect, useMemo, Component } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import { db } from '../lib/firebase'
import { doc, getDoc, collection, getDocs } from 'firebase/firestore'
import AttendanceTab from '../components/tabs/AttendanceTab'
import CorrectionTab from '../components/tabs/CorrectionTab'
import ApprovalsTab from '../components/tabs/ApprovalsTab'
import SummaryTab from '../components/tabs/SummaryTab'
import SettingsTab from '../components/tabs/SettingsTab'
import EmployeePortalTab from '../components/tabs/EmployeePortalTab'

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
          <h2 className="text-xl font-bold text-red-800 mb-2 uppercase tracking-tight">Component Failure</h2>
          <p className="text-red-600 text-[10px] font-black uppercase mb-6">{this.state.error?.message || 'Unexpected Rendering Error'}</p>
          <button onClick={() => window.location.reload()} className="bg-red-600 text-white px-8 py-2 rounded-xl font-black shadow-lg uppercase text-[10px]">Reload Application</button>
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
    if (!orgCode.trim()) { setError('Please enter code.'); return }
    setLoading(true); setError('')
    try { await onJoin(orgCode.trim()) }
    catch (err) { setError(err.message); setLoading(false) }
  }

  const handleCreate = async (e) => {
    e.preventDefault()
    if (!orgName.trim()) { setError('Please enter name.'); return }
    setLoading(true); setError('')
    try { const code = await onCreate(orgName.trim()); setCreatedCode(code); setLoading(false) }
    catch (err) { setError(err.message); setLoading(false) }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-md">
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-sm p-8 mx-4 border border-gray-100">
        <div className="flex flex-col items-center mb-6">
          <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-indigo-600 to-purple-600 flex items-center justify-center mb-4 shadow-xl">
            <span className="text-white text-3xl">🏢</span>
          </div>
          <h2 className="text-xl font-black text-gray-800 uppercase tracking-tight">Organization Setup</h2>
          <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest text-center mt-2">
            {hasOrg && isAdmin ? 'Create New Division' : 'Join a Team or Create Your Own'}
          </p>
        </div>

        {!(hasOrg && isAdmin) && (
          <div className="flex bg-gray-100 rounded-2xl p-1 mb-6">
            <button onClick={() => { setModalTab('join'); setError('') }}
              className={`flex-1 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${modalTab === 'join' ? 'bg-white shadow-md text-indigo-600' : 'text-gray-400'}`}>
              Join Team
            </button>
            <button onClick={() => { setModalTab('create'); setError('') }}
              className={`flex-1 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${modalTab === 'create' ? 'bg-white shadow-md text-indigo-600' : 'text-gray-400'}`}>
              Create Org
            </button>
          </div>
        )}

        {error && <div className="bg-red-50 border border-red-100 text-red-600 px-4 py-2 rounded-xl text-[10px] font-bold mb-4 uppercase text-center">{error}</div>}

        {createdCode ? (
          <div className="space-y-4">
            <div className="bg-green-50 border border-green-100 rounded-2xl p-5 text-center">
              <p className="text-[10px] text-green-700 font-black uppercase tracking-widest mb-3">Organization Online! 🎉</p>
              <div className="bg-white border border-green-200 rounded-xl px-4 py-3 font-mono text-indigo-700 font-black tracking-widest text-lg select-all shadow-inner">{createdCode}</div>
              <p className="text-[9px] text-gray-400 font-bold uppercase mt-3 tracking-tighter italic">Share this code with your employees</p>
            </div>
            <button onClick={() => window.location.reload()} className="w-full bg-indigo-600 text-white font-black py-3 rounded-2xl shadow-xl uppercase text-[10px] tracking-widest">Get Started</button>
          </div>
        ) : modalTab === 'join' ? (
          <form onSubmit={handleJoin} className="space-y-4">
            <input value={orgCode} onChange={e => setOrgCode(e.target.value)} placeholder="ENTER ORG CODE" className="w-full border border-gray-200 rounded-2xl px-4 py-3 focus:ring-2 focus:ring-indigo-500 outline-none text-xs font-black uppercase tracking-widest bg-gray-50 shadow-inner" />
            <button type="submit" disabled={loading} className="w-full bg-indigo-600 text-white font-black py-3 rounded-2xl shadow-xl transition-all disabled:opacity-50 uppercase text-[10px] tracking-widest">{loading ? 'Verifying...' : 'Join Organization'}</button>
          </form>
        ) : (
          <form onSubmit={handleCreate} className="space-y-4">
            <input value={orgName} onChange={e => setOrgName(e.target.value)} placeholder="BUSINESS NAME" className="w-full border border-gray-200 rounded-2xl px-4 py-3 focus:ring-2 focus:ring-indigo-500 outline-none text-xs font-black uppercase tracking-widest bg-gray-50 shadow-inner" />
            <button type="submit" disabled={loading} className="w-full bg-indigo-600 text-white font-black py-3 rounded-2xl shadow-xl transition-all disabled:opacity-50 uppercase text-[10px] tracking-widest">{loading ? 'Creating...' : 'Initialize Org'}</button>
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
  const [rolePermissions, setRolePermissions] = useState(null)

  useEffect(() => {
    if (!user?.orgId || !user?.role) return
    const fetchRole = async () => {
      try {
        const q = collection(db, 'organisations', user.orgId, 'roles')
        const snap = await getDocs(q)
        const myRole = snap.docs.find(d => d.data().name.toLowerCase() === (user.role || 'employee').toLowerCase())
        if (myRole) setRolePermissions(myRole.data().permissions || {})
      } catch (err) {
        console.error('Role fetch error:', err)
      }
    }
    fetchRole()
  }, [user?.orgId, user?.role])

  const allTabs = useMemo(() => [
    { id: 'attendance', label: 'Attendance', icon: '📅', module: 'Attendance' },
    { id: 'correction', label: 'Correction', icon: '✏️', module: 'Correction' },
    { id: 'approvals', label: 'Approvals', icon: '✅', badge: 'OT', module: 'Approvals' },
    { id: 'summary', label: 'Summary', icon: '📊', module: 'Summary' },
    { id: 'portal', label: 'Self Service', icon: '👤', module: 'EmployeePortal' },
    { id: 'settings', label: 'Settings', icon: '⚙️', module: 'Settings' },
  ], [])

  // Filter tabs based on role permissions
  const tabs = useMemo(() => {
    if (!rolePermissions && user?.role !== 'admin') return allTabs.filter(t => t.id === 'portal')
    if (user?.role === 'admin') return allTabs
    return allTabs.filter(t => rolePermissions[t.module]?.view || rolePermissions[t.module]?.full)
  }, [rolePermissions, user?.role, allTabs])

  const renderTabContent = () => {
    switch (activeTab) {
      case 'attendance': return <AttendanceTab />
      case 'correction': return <CorrectionTab />
      case 'approvals': return <ApprovalsTab />
      case 'summary': return <SummaryTab />
      case 'portal': return <EmployeePortalTab />
      case 'settings': return <SettingsTab />
      default: return <EmployeePortalTab />
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col font-sans">
      {user && !user.orgId && <OrgSetupModal user={user} onJoin={joinOrganisation} onCreate={createOrganisation} />}

      <header className="sticky top-0 z-40 bg-white border-b border-gray-100 shadow-sm h-16 shrink-0">
        <div className="max-w-full mx-auto px-4 h-full flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button onClick={() => setIsCollapsed(!isCollapsed)} className="p-2 hover:bg-gray-50 rounded-xl text-gray-400 hidden md:block transition-all"><svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" /></svg></button>
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-600 to-purple-600 flex items-center justify-center shadow-lg"><span className="text-white text-xl font-black">H</span></div>
            <span className="text-lg font-black text-gray-800 uppercase tracking-tighter">HRFlow</span>
            <span className="text-[10px] font-black text-indigo-500 bg-indigo-50 px-2 py-0.5 rounded-full hidden lg:inline-block uppercase tracking-widest ml-2">{user?.orgName || 'No Org'}</span>
          </div>

          <div className="flex items-center gap-4">
            <div className="hidden sm:flex flex-col items-end text-right">
              <span className="text-xs font-black text-gray-800 uppercase tracking-tight">{user?.name}</span>
              <span className="text-[9px] text-gray-400 font-black uppercase tracking-widest">{user?.role || 'Staff'}</span>
            </div>
            <div className="w-9 h-9 rounded-xl flex items-center justify-center text-white text-[11px] font-black shadow-lg border-2 border-white" style={{ backgroundColor: getAvatarColor(user?.uid) }}>{getInitials(user?.name)}</div>
            <button onClick={logout} className="p-2 text-gray-300 hover:text-red-500 transition-colors" title="Logout"><svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" /></svg></button>
          </div>
        </div>
      </header>

      <div className="flex flex-1 min-h-0 overflow-hidden">
        <aside className={`${isCollapsed ? 'w-20' : 'w-64'} bg-white border-r border-gray-100 hidden md:flex flex-col shrink-0 transition-all duration-500 ease-in-out`}>
          <nav className="flex-1 p-3 space-y-1.5 overflow-y-auto">
            {!isCollapsed && <div className="px-3 mb-4"><p className="text-[9px] font-black text-gray-300 uppercase tracking-widest">Main Modules</p></div>}
            {tabs.map(tab => (
              <button key={tab.id} onClick={() => setActiveTab(tab.id)} title={isCollapsed ? tab.label : ''} className={`w-full flex items-center ${isCollapsed ? 'justify-center' : 'gap-3 px-4'} py-3 rounded-2xl text-[11px] font-black uppercase tracking-widest transition-all ${activeTab === tab.id ? 'bg-indigo-600 text-white shadow-xl shadow-indigo-100 translate-x-1' : 'text-gray-400 hover:bg-gray-50'}`}>
                <span className="text-lg">{tab.icon}</span>
                {!isCollapsed && <span className="truncate">{tab.label}</span>}
                {!isCollapsed && tab.badge && <span className={`ml-auto px-1.5 py-0.5 rounded-lg text-[8px] font-black ${activeTab === tab.id ? 'bg-white/20 text-white' : 'bg-indigo-50 text-indigo-600'}`}>{tab.badge}</span>}
              </button>
            ))}
          </nav>
          <div className="p-4 border-t border-gray-50">
            <div className={`${isCollapsed ? 'justify-center' : 'px-3'} py-3 bg-gray-50/50 rounded-2xl border border-gray-100 flex items-center gap-3`}>
              <div className="w-8 h-8 rounded-lg bg-indigo-100 flex items-center justify-center text-indigo-600 text-[9px] font-black">PRO</div>
              {!isCollapsed && <div className="min-w-0"><p className="text-[10px] font-black text-gray-800 truncate uppercase">Corporate</p><p className="text-[8px] text-gray-400 font-bold uppercase tracking-tighter">Active Plan</p></div>}
            </div>
          </div>
        </aside>

        <div className="flex-1 flex flex-col min-w-0 bg-gray-50/30">
          <nav className="md:hidden sticky top-0 z-30 bg-white border-b border-gray-100 overflow-x-auto flex items-center shrink-0">
            <div className="flex px-2 h-14">
              {tabs.map(tab => (
                <button key={tab.id} onClick={() => setActiveTab(tab.id)} className={`px-5 h-full flex items-center text-[10px] font-black uppercase tracking-widest border-b-4 transition-all whitespace-nowrap ${activeTab === tab.id ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-gray-400'}`}>
                  {tab.icon} <span className="ml-2">{tab.label}</span>
                </button>
              ))}
            </div>
          </nav>

          <main className="flex-1 overflow-auto p-4 md:p-8">
            <div className="max-w-7xl mx-auto h-full flex flex-col">
              <div className="mb-8 flex items-center justify-between">
                <div>
                  <h1 className="text-2xl font-black text-gray-900 uppercase tracking-tighter">{activeTab}</h1>
                  <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest mt-1">Management Hub & Controls</p>
                </div>
              </div>
              <div className="flex-1 min-h-0">
                <ErrorBoundary key={activeTab}>
                  {renderTabContent()}
                </ErrorBoundary>
              </div>
            </div>
          </main>
        </div>
      </div>
    </div>
  )
}
