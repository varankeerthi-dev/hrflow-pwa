import { useState, useEffect, useMemo, Component } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import { db } from '../lib/firebase'
import { doc, getDoc, collection, getDocs } from 'firebase/firestore'
import {
  Calendar,
  PencilLine,
  CheckCircle2,
  BarChart3,
  Wallet,
  User,
  Settings,
  LogOut,
  ChevronRight,
  Menu,
  PanelLeft,
  LayoutDashboard,
  Building2,
  Gift,
  Gavel,
  Users,
  Handshake,
  FileText,
  Mail,
  MoreHorizontal,
  History
} from 'lucide-react'
import ActivityLogSidebar from '../components/ui/ActivityLogSidebar'
import AttendanceTab from '../components/tabs/AttendanceTab'
import CorrectionTab from '../components/tabs/CorrectionTab'
import ApprovalsTab from '../components/tabs/ApprovalsTab'
import SummaryTab from '../components/tabs/SummaryTab'
import SettingsTab from '../components/tabs/SettingsTab'
import EmployeePortalTab from '../components/tabs/EmployeePortalTab'
import SalarySlipTab from '../components/tabs/SalarySlipTab'
import AdvanceExpenseTab from '../components/tabs/AdvanceExpenseTab'
import FineTab from '../components/tabs/FineTab'
import EngagementTab from '../components/tabs/EngagementTab'
import LeaveTab from '../components/tabs/LeaveTab'
import HRLettersTab from '../components/tabs/HRLettersTab'

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
        <div className="p-8 text-center bg-red-50 border border-red-100 rounded-xl m-4">
          <div className="text-4xl mb-4">⚠️</div>
          <h2 className="text-xl font-bold text-red-800 mb-2 uppercase tracking-tight font-inter">Component Failure</h2>
          <p className="text-red-600 text-[10px] font-black uppercase mb-6">{this.state.error?.message || 'Unexpected Rendering Error'}</p>
          <button onClick={() => window.location.reload()} className="bg-red-600 text-white px-8 py-2 rounded-lg font-bold shadow-lg uppercase text-[10px]">Reload Application</button>
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
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-sm p-8 mx-4 border border-gray-100">
        <div className="flex flex-col items-center mb-6">
          <div className="w-16 h-16 rounded-xl bg-gradient-to-br from-indigo-600 to-purple-600 flex items-center justify-center mb-4 shadow-xl">
            <span className="text-white text-3xl">🏢</span>
          </div>
          <h2 className="text-xl font-bold text-gray-800 uppercase tracking-tight font-inter">Organization Setup</h2>
          <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest text-center mt-2 font-inter">
            {hasOrg && isAdmin ? 'Create New Division' : 'Join a Team or Create Your Own'}
          </p>
        </div>

        {!(hasOrg && isAdmin) && (
          <div className="flex bg-gray-100 rounded-lg p-1 mb-6">
            <button onClick={() => { setModalTab('join'); setError('') }}
              className={`flex-1 py-2 rounded-lg text-[10px] font-bold uppercase tracking-widest transition-all font-inter ${modalTab === 'join' ? 'bg-white shadow-sm text-indigo-600' : 'text-gray-400'}`}>
              Join Team
            </button>
            <button onClick={() => { setModalTab('create'); setError('') }}
              className={`flex-1 py-2 rounded-lg text-[10px] font-bold uppercase tracking-widest transition-all font-inter ${modalTab === 'create' ? 'bg-white shadow-sm text-indigo-600' : 'text-gray-400'}`}>
              Create Org
            </button>
          </div>
        )}

        {error && <div className="bg-red-50 border border-red-100 text-red-600 px-4 py-2 rounded-lg text-[10px] font-bold mb-4 uppercase text-center font-inter">{error}</div>}

        {createdCode ? (
          <div className="space-y-4 font-inter">
            <div className="bg-green-50 border border-green-100 rounded-xl p-5 text-center">
              <p className="text-[10px] text-green-700 font-bold uppercase tracking-widest mb-3">Organization Online! 🎉</p>
              <div className="bg-white border border-green-200 rounded-lg px-4 py-3 font-mono font-bold tracking-widest text-lg select-all shadow-inner">{createdCode}</div>
              <p className="text-[9px] text-gray-400 font-bold uppercase mt-3 tracking-tighter italic">Share this code with your employees</p>
            </div>
            <button onClick={() => window.location.reload()} className="w-full bg-indigo-600 text-white font-bold py-3 rounded-lg shadow-xl uppercase text-[10px] tracking-widest">Get Started</button>
          </div>
        ) : modalTab === 'join' ? (
          <form onSubmit={handleJoin} className="space-y-4 font-inter">
            <input value={orgCode} onChange={e => setOrgCode(e.target.value)} placeholder="ENTER ORG CODE" className="w-full border border-gray-200 rounded-lg h-[42px] px-4 py-3 focus:ring-2 focus:ring-indigo-500 outline-none text-xs font-bold uppercase tracking-widest bg-gray-50" />
            <button type="submit" disabled={loading} className="w-full h-[40px] bg-indigo-600 text-white font-bold rounded-lg shadow-xl transition-all disabled:opacity-50 uppercase text-[10px] tracking-widest">{loading ? 'Verifying...' : 'Join Organization'}</button>
          </form>
        ) : (
          <form onSubmit={handleCreate} className="space-y-4 font-inter">
            <input value={orgName} onChange={e => setOrgName(e.target.value)} placeholder="BUSINESS NAME" className="w-full border border-gray-200 rounded-lg h-[42px] px-4 py-3 focus:ring-2 focus:ring-indigo-500 outline-none text-xs font-bold uppercase tracking-widest bg-gray-50" />
            <button type="submit" disabled={loading} className="w-full h-[40px] bg-indigo-600 text-white font-bold rounded-lg shadow-xl transition-all disabled:opacity-50 uppercase text-[10px] tracking-widest">{loading ? 'Creating...' : 'Initialize Org'}</button>
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
  const [showLog, setShowLog] = useState(false)

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
    { id: 'attendance', label: 'Attendance', icon: <Calendar size={16} />, module: 'Attendance' },
    { id: 'correction', label: 'Correction', icon: <PencilLine size={16} />, module: 'Correction' },
    { id: 'leave', label: 'Leave', icon: <Mail size={16} />, module: 'Leave' },
    { id: 'approvals', label: 'Approvals', icon: <CheckCircle2 size={16} />, badge: 'OT', module: 'Approvals' },
    { id: 'letters', label: 'HR Letters', icon: <FileText size={16} />, module: 'HRLetters' },
    { id: 'summary', label: 'Summary', icon: <BarChart3 size={16} />, module: 'Summary' },

    { id: 'salary-slip', label: 'Salary Slip', icon: <Wallet size={16} />, module: 'SalarySlip' },
    { id: 'advance', label: 'Advance/Expense', icon: <Wallet size={16} />, module: 'AdvanceExpense' },
    { id: 'fines', label: 'Fine Tab', icon: <Gavel size={16} />, module: 'Fine' },

    { id: 'engage', label: 'Engage', icon: <Handshake size={16} />, module: 'Engagement' },
    { id: 'portal', label: 'Self Service', icon: <User size={16} />, module: 'EmployeePortal' },
    { id: 'settings', label: 'Settings', icon: <Settings size={16} />, module: 'Settings' },
  ], [])

  const sections = useMemo(() => [
    { title: 'HRMS', modules: ['Attendance', 'Correction', 'Leave', 'Approvals', 'HRLetters', 'Summary'] },
    { title: 'Payroll', modules: ['SalarySlip', 'AdvanceExpense', 'Fine'] },
    { title: 'Engage', modules: ['Engagement'] },
    { title: 'System', modules: ['EmployeePortal', 'Settings'] }
  ], []);

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
      case 'leave': return <LeaveTab />
      case 'approvals': return <ApprovalsTab />
      case 'letters': return <HRLettersTab />
      case 'summary': return <SummaryTab />
      case 'salary-slip': return <SalarySlipTab />
      case 'advance': return <AdvanceExpenseTab />
      case 'fines': return <FineTab />
      case 'engage': return <EngagementTab />
      case 'portal': return <EmployeePortalTab />
      case 'settings': return <SettingsTab />
      default: return <EmployeePortalTab />
    }
  }

  return (
    <div className="min-h-screen bg-white flex flex-col font-inter">
      {user && !user.orgId && <OrgSetupModal user={user} onJoin={joinOrganisation} onCreate={createOrganisation} />}
      {showLog && <ActivityLogSidebar orgId={user?.orgId} onClose={() => setShowLog(false)} />}

      <header className="sticky top-0 z-40 bg-white border-b border-gray-200 shadow-none h-14 shrink-0">
        <div className="max-w-full mx-auto px-4 h-full flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button onClick={() => setIsCollapsed(!isCollapsed)} className="p-1.5 hover:bg-gray-100 rounded-md text-gray-500 hidden md:block transition-all transition-colors"><PanelLeft size={18} /></button>
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-gray-900 flex items-center justify-center shadow-sm text-white"><Building2 size={16} /></div>
              <span className="text-md font-bold text-gray-900 tracking-tight">HRFlow</span>
            </div>
            <span className="text-[11px] font-medium text-gray-400 bg-gray-50 px-2 py-0.5 rounded-full hidden lg:inline-block uppercase tracking-wider ml-2 border border-gray-100">{user?.orgName || 'No Org'}</span>
          </div>

          <div className="flex items-center gap-4">
            <div className="hidden sm:flex flex-col items-end text-right">
              <span className="text-[13px] font-semibold text-gray-800 tracking-tight">{user?.name}</span>
              <span className="text-[10px] text-gray-400 font-medium uppercase tracking-widest">{user?.role || 'Staff'}</span>
            </div>
            <div className="w-8 h-8 rounded-full flex items-center justify-center text-white text-[10px] font-bold shadow-sm border border-gray-100" style={{ backgroundColor: getAvatarColor(user?.uid) }}>{getInitials(user?.name)}</div>
            <button
              onClick={() => setShowLog(s => !s)}
              title="Activity Log"
              className={`p-1.5 rounded-md transition-all ${showLog ? 'bg-indigo-100 text-indigo-600' : 'text-gray-400 hover:text-gray-900 hover:bg-gray-100'}`}
            >
              <History size={16} />
            </button>
            <button onClick={logout} className="p-1.5 text-gray-400 hover:text-gray-900 hover:bg-gray-100 rounded-md transition-all" title="Logout"><LogOut size={16} /></button>
          </div>
        </div>
      </header>

      <div className="flex flex-1 min-h-0 overflow-hidden">
        {/* Modern Minimal Sidebar */}
        <aside className={`${isCollapsed ? 'w-[64px]' : 'w-[240px]'} bg-[#fafafa] border-r border-[#e5e7eb] hidden md:flex flex-col shrink-0 transition-all duration-300 ease-in-out p-[14px]`}>
          <nav className="flex-1 space-y-[16px] overflow-y-auto pr-1">
            {sections.map(section => {
              const sectionTabs = tabs.filter(t => section.modules.includes(t.module));
              if (sectionTabs.length === 0) return null;
              return (
                <div key={section.title} className="flex flex-col gap-[4px]">
                  {!isCollapsed && <p className="text-[11px] font-medium text-[#9ca3af] uppercase tracking-[0.05em] px-[12px] mb-[6px] mt-[18px] first:mt-0 font-inter">{section.title}</p>}
                  <div className="space-y-[4px]">
                    {sectionTabs.map(tab => (
                      <button
                        key={tab.id}
                        onClick={() => setActiveTab(tab.id)}
                        title={isCollapsed ? tab.label : ''}
                        className={`w-full flex items-center ${isCollapsed ? 'justify-center' : 'gap-[10px] px-[12px]'} h-[36px] rounded-[8px] text-[14px] font-medium transition-colors cursor-pointer font-inter ${activeTab === tab.id ? 'bg-[#e5e7eb] text-[#374151] font-semibold' : 'text-[#374151] hover:bg-[#f3f4f6]'}`}
                      >
                        <span className={`transition-colors ${activeTab === tab.id ? 'text-gray-900' : 'text-[#6b7280]'}`}>{tab.icon}</span>
                        {!isCollapsed && <span className="flex-1 text-left truncate">{tab.label}</span>}
                        {!isCollapsed && tab.badge && <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${activeTab === tab.id ? 'bg-white/50 text-gray-900' : 'bg-gray-100 text-gray-500'}`}>{tab.badge}</span>}
                      </button>
                    ))}
                  </div>
                </div>
              );
            })}
          </nav>

          {!isCollapsed && (
            <div className="pt-4 border-t border-[#e5e7eb] mt-4 font-inter">
              <div className="px-3 py-3 bg-white rounded-xl border border-gray-100 flex items-center gap-3 shadow-sm">
                <div className="w-8 h-8 rounded-lg bg-gray-100 flex items-center justify-center text-gray-900 text-[10px] font-bold">PRO</div>
                <div className="min-w-0"><p className="text-[11px] font-bold text-gray-800 truncate uppercase tracking-tight">Enterprise</p><p className="text-[9px] text-gray-400 font-medium uppercase tracking-tighter">Verified Plan</p></div>
              </div>
            </div>
          )}
        </aside>

        <div className="flex-1 flex flex-col min-w-0 bg-white">
          <nav className="md:hidden sticky top-0 z-30 bg-white border-b border-gray-100 overflow-x-auto flex items-center shrink-0">
            <div className="flex px-2 h-14">
              {tabs.map(tab => (
                <button key={tab.id} onClick={() => setActiveTab(tab.id)} className={`px-5 h-full flex items-center text-[11px] font-bold uppercase tracking-widest border-b-2 transition-all whitespace-nowrap ${activeTab === tab.id ? 'border-gray-900 text-gray-900' : 'border-transparent text-gray-400'}`}>
                  <span className="mr-2 text-[#6b7280]">{tab.icon}</span> {tab.label}
                </button>
              ))}
            </div>
          </nav>

          <main className="flex-1 overflow-auto p-8 bg-[#f9fafb]/30">
            <div className="max-w-7xl mx-auto h-full flex flex-col">
              {/* Quick Access Bar */}
              <div className="mb-5 flex items-center gap-2">
                {[
                  { label: 'Create Attendance', tab: 'attendance', icon: <Calendar size={16} /> },
                  { label: 'Add Employee', tab: 'settings', icon: <Users size={16} /> },
                  { label: 'Add Expense', tab: 'advance', icon: <Wallet size={16} /> },
                  { label: 'Make Correction', tab: 'correction', icon: <PencilLine size={16} /> },
                  { label: 'Full Summary', tab: 'summary', icon: <BarChart3 size={16} /> },
                ].map(item => (
                  <button
                    key={item.tab}
                    onClick={() => setActiveTab(item.tab)}
                    className={`flex flex-col items-center justify-center gap-1.5 w-[110px] h-[70px] rounded-lg border text-center transition-all ${activeTab === item.tab
                        ? 'bg-gray-900 text-white border-gray-900 shadow-md'
                        : 'bg-white border-gray-200 text-gray-500 hover:border-gray-400 hover:text-gray-800 hover:shadow-sm'
                      }`}
                  >
                    <span className={activeTab === item.tab ? 'text-white' : 'text-gray-400'}>{item.icon}</span>
                    <span className="text-[10px] font-semibold leading-tight px-1">{item.label}</span>
                  </button>
                ))}
              </div>
              <div className="mb-6 flex items-center justify-between">
                <div>
                  <h1 className="text-3xl font-bold text-gray-900 tracking-tight font-inter">{activeTab.replace('-', ' ').toUpperCase()}</h1>
                  <p className="text-[11px] text-gray-400 font-medium uppercase tracking-widest mt-1 font-inter">Management & Analytics Overview</p>
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
