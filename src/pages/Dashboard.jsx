import React, { useState, useEffect, useMemo, Component } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import { useEmployees } from '../hooks/useEmployees'
import { db } from '../lib/firebase'
import { doc, getDoc, collection, getDocs } from 'firebase/firestore'
import {
  Car,
  Calendar,
  Briefcase,
  Folder,
  PencilLine,
  CheckCircle2,
  BarChart3,
  Wallet,
  User,
  Settings,
  LogOut,
  ChevronRight,
  Menu,
  X,
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
  History,
  MessageSquare
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
import ShiftPlanningTab from '../components/tabs/ShiftPlanningTab'
import LeaveTab from '../components/tabs/LeaveTab'
import HRLettersTab from '../components/tabs/HRLettersTab'
import RecruitmentTab from '../components/tabs/RecruitmentTab'
import DocumentsTab from '../components/tabs/DocumentsTab'
import VehicleManagementTab from '../components/tabs/VehicleManagementTab'
import TasksTab from '../components/tabs/TasksTab'
import ChatTab from '../components/tabs/ChatTab'
import HomeTab from '../components/tabs/HomeTab'

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
function OrgSetupModal({ user, onJoin, onCreate, onLogout }) {
  const [modalTab, setModalTab] = useState('join')
  const [orgCode, setOrgCode] = useState('')
  const [orgName, setOrgName] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [createdCode, setCreatedCode] = useState(null)

  const handleJoin = async (e) => {
    e.preventDefault()
    if (!orgCode.trim()) { setError('Please enter code.'); return }
    setLoading(true); setError('')
    try { await onJoin(orgCode.trim().toLowerCase()) }
    catch (err) { setError(err.message); setLoading(false) }
  }

  const handleCreate = async (e) => {
    e.preventDefault()
    if (!orgName.trim()) { setError('Please enter name.'); return }
    setLoading(true); setError('')
    try { 
      const code = await onCreate(orgName.trim()); 
      setCreatedCode(code); 
      setLoading(false) 
    }
    catch (err) { 
      setError(err.message); 
      setLoading(false) 
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-md">
      <div className="bg-white rounded-xl shadow-2xl w-full max-sm p-8 mx-4 border border-gray-100">
        <div className="flex flex-col items-center mb-6">
          <div className="w-16 h-16 rounded-xl bg-gradient-to-br from-indigo-600 to-purple-600 flex items-center justify-center mb-4 shadow-xl">
            <span className="text-white text-3xl">🏢</span>
          </div>
          <h2 className="text-xl font-bold text-gray-800 uppercase tracking-tight font-inter">Organization Setup</h2>
          <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest text-center mt-2 font-inter">
            {user?.orgId && user?.role?.toLowerCase() === 'admin' ? 'Create New Division' : 'Join a Team or Create Your Own'}
          </p>
        </div>

        {!(user?.orgId && user?.role?.toLowerCase() === 'admin') && (
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
            <input value={orgCode} onChange={e => setOrgCode(e.target.value)} placeholder="ENTER ORG CODE" className="w-full border border-gray-200 rounded-lg h-[42px] px-4 py-3 focus:ring-2 focus:ring-indigo-500 outline-none text-xs font-bold tracking-widest bg-gray-50" />
            <button type="submit" disabled={loading} className="w-full h-[40px] bg-indigo-600 text-white font-bold rounded-lg shadow-xl transition-all disabled:opacity-50 uppercase text-[10px] tracking-widest">{loading ? 'Verifying...' : 'Join Organization'}</button>
          </form>
        ) : (
          <form onSubmit={handleCreate} className="space-y-4 font-inter">
            <input value={orgName} onChange={e => setOrgName(e.target.value)} placeholder="BUSINESS NAME" className="w-full border border-gray-200 rounded-lg h-[42px] px-4 py-3 focus:ring-2 focus:ring-indigo-500 outline-none text-xs font-bold uppercase tracking-widest bg-gray-50" />
            <button type="submit" disabled={loading} className="w-full h-[40px] bg-indigo-600 text-white font-bold rounded-lg shadow-xl transition-all disabled:opacity-50 uppercase text-[10px] tracking-widest">{loading ? 'Creating...' : 'Initialize Org'}</button>
          </form>
        )}

        <div className="mt-6 pt-4 border-t border-gray-100">
          <button onClick={onLogout} className="w-full flex items-center justify-center gap-2 text-gray-400 hover:text-gray-600 transition-colors py-2 uppercase text-[10px] font-bold tracking-widest font-inter">
            <LogOut size={14} /> <span>Back to login</span>
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Dashboard ────────────────────────────────────────────────────────────────
export default function Dashboard() {
  const navigate = useNavigate()
  const { user, logout, joinOrganisation, createOrganisation, loading: authLoading } = useAuth()
  
  const canFetchEmployees = user && !!user.orgId
  const { employees, loading: empLoading } = useEmployees(canFetchEmployees ? user.orgId : null)

  const [activeTab, setActiveTab] = useState('attendance')
  const [portalSubTab, setPortalSubTab] = useState('dashboard')
  const [summarySubTab, setSummarySubTab] = useState('summary')
  const [isCollapsed, setIsCollapsed] = useState(false)
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false)
  const [expandedGroups, setExpandedGroups] = useState({ main: true, hr: true, payroll: true, workforce: true, account: true })
  const [showLog, setShowLog] = useState(false)
  const [orgSettings, setOrgSettings] = useState({})

  useEffect(() => {
    if (document.getElementById('google-fonts')) return
    const link = document.createElement('link')
    link.id = 'google-fonts'
    link.href = 'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Roboto:wght@400;500;700&display=swap'
    link.rel = 'stylesheet'
    document.head.appendChild(link)
  }, [])

  const currentEmployee = useMemo(() => {
    if (!employees.length || !user?.uid) return null
    const normalizedUserEmail = user.email?.toLowerCase().trim()
    return employees.find(e => {
      const empEmail = (e.email || '').toLowerCase().trim()
      return (normalizedUserEmail && empEmail === normalizedUserEmail) || e.id === user.uid
    }) || employees[0]
  }, [employees, user])

  useEffect(() => {
    if (user?.orgId) {
      getDoc(doc(db, 'organisations', user.orgId)).then(snap => {
        if (snap.exists()) setOrgSettings(snap.data())
      })
    }
  }, [user?.orgId])

  const allTabs = useMemo(() => [
    { id: 'home', label: 'Dashboard', icon: <LayoutDashboard size={18} strokeWidth={1.75} />, module: 'EmployeePortal' },
    { id: 'attendance', label: 'Attendance Records', icon: <Calendar size={18} strokeWidth={1.75} />, module: 'Attendance' },
    { id: 'attendance-list', label: 'Attendance', icon: <Calendar size={18} strokeWidth={1.75} />, module: 'Attendance' },
    { id: 'correction', label: 'Corrections', icon: <PencilLine size={18} strokeWidth={1.75} />, module: 'Correction' },
    { id: 'leave', label: 'Leave', icon: <Mail size={18} strokeWidth={1.75} />, module: 'Leave' },
    { id: 'approvals', label: 'Approvals', icon: <CheckCircle2 size={18} strokeWidth={1.75} />, badge: '!', module: 'Approvals' },
    { id: 'letters', label: 'HR Letters', icon: <FileText size={18} strokeWidth={1.75} />, module: 'HRLetters' },
    { id: 'vehicles', label: 'Vehicles', icon: <Car size={18} strokeWidth={1.75} />, module: 'Workforce' },
    { id: 'documents', label: 'Documents', icon: <Folder size={18} strokeWidth={1.75} />, module: 'DocumentManagement' },
    { id: 'summary', label: 'Summary', icon: <BarChart3 size={18} strokeWidth={1.75} />, module: 'Summary' },
    { id: 'salary-slip', label: 'Salary Slip', icon: <Wallet size={18} strokeWidth={1.75} />, module: 'SalarySlip' },
    { id: 'advance', label: 'Advances', icon: <Wallet size={18} strokeWidth={1.75} />, module: 'AdvanceExpense' },
    { id: 'fines', label: 'Fines', icon: <Gavel size={18} strokeWidth={1.75} />, module: 'Fine' },
    { id: 'engage', label: 'Engage', icon: <Handshake size={18} strokeWidth={1.75} />, module: 'Engagement' },
    { id: 'chat', label: 'Team Chat', icon: <MessageSquare size={18} strokeWidth={1.75} />, module: 'Engagement' },
    { id: 'shift-planning', label: 'Shift Planning', icon: <Calendar size={18} strokeWidth={1.75} />, module: 'ShiftPlanning' },
    { id: 'tasks', label: 'Tasks', icon: <CheckCircle2 size={18} strokeWidth={1.75} />, module: 'Tasks' },
    { id: 'portal', label: 'My Portal', icon: <User size={18} strokeWidth={1.75} />, module: 'EmployeePortal' },
    { id: 'settings', label: 'Settings', icon: <Settings size={18} strokeWidth={1.75} />, module: 'Settings' },
  ], [])

  const [tabSearchParams, setTabSearchParams] = useSearchParams()

  useEffect(() => {
    const tabParam = tabSearchParams.get('tab')
    if (tabParam && allTabs.find(t => t.id === tabParam)) {
      setActiveTab(tabParam)
    }
  }, [tabSearchParams, allTabs])

  const sections = useMemo(() => [
    { id: 'main', title: 'MAIN', tabs: ['home'] },
    { id: 'hr', title: 'HR', tabs: ['attendance-list', 'correction', 'leave', 'approvals', 'letters', 'documents', 'summary'] },
    { id: 'payroll', title: 'PAYROLL', tabs: ['salary-slip', 'advance', 'fines'] },
    { id: 'workforce', title: 'WORKFORCE', tabs: ['vehicles', 'engage', 'chat', 'shift-planning', 'tasks'] },
    { id: 'account', title: 'ACCOUNT', tabs: ['portal', 'settings'] }
  ], []);

  const renderTabContent = () => {
    switch (activeTab) {
      case 'home': return <HomeTab onTabChange={(t) => { setActiveTab(t); setTabSearchParams({ tab: t }); }} />
      case 'attendance':
      case 'attendance-list': return <AttendanceTab />
      case 'correction': return <CorrectionTab />
      case 'leave': return <LeaveTab />
      case 'approvals': return <ApprovalsTab />
      case 'letters': return <HRLettersTab />
      case 'vehicles': return <VehicleManagementTab />
      case 'recruitment': return <RecruitmentTab />
      case 'documents': return <DocumentsTab />
      case 'summary': return <SummaryTab defaultSubTab={summarySubTab} />
      case 'salary-slip': return <SalarySlipTab />
      case 'advance': return <AdvanceExpenseTab />
      case 'fines': return <FineTab />
      case 'engage': return <EngagementTab />
      case 'chat': return <ChatTab />
      case 'shift-planning': return <ShiftPlanningTab />
      case 'tasks': return <TasksTab />
      case 'portal': return <EmployeePortalTab portalSubTab={portalSubTab} />
      case 'settings': return <SettingsTab />
      default: return <EmployeePortalTab portalSubTab={portalSubTab} />
    }
  }

  if (authLoading || (user?.orgId && empLoading)) {
    return (
      <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center p-4">
        <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-indigo-600 to-purple-600 mb-6 flex items-center justify-center shadow-lg animate-pulse">
          <span className="text-white text-3xl font-bold">H</span>
        </div>
        <div className="w-12 h-12 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin mb-4"></div>
        <p className="text-gray-600 font-bold uppercase tracking-widest text-[10px]">Synchronizing Dashboard...</p>
      </div>
    )
  }

  if (user && !user.orgId) {
    return (
      <div className="min-h-screen bg-white">
        <OrgSetupModal user={user} onJoin={joinOrganisation} onCreate={createOrganisation} onLogout={logout} />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-white flex flex-col font-inter">
      {showLog && <ActivityLogSidebar orgId={user?.orgId} onClose={() => setShowLog(false)} />}

      <header className="sticky top-0 z-40 bg-white border-b border-gray-200 h-14 shrink-0 px-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button onClick={() => setIsCollapsed(!isCollapsed)} className="p-1.5 hover:bg-indigo-50 rounded-md text-gray-500 hover:text-indigo-600 hidden md:block transition-all"><PanelLeft size={18} /></button>
          <button onClick={() => setIsMobileMenuOpen(true)} className="p-1.5 hover:bg-indigo-50 rounded-md text-gray-500 hover:text-indigo-600 md:hidden transition-all"><Menu size={18} /></button>
          <div className="flex items-center gap-2">
            {orgSettings?.logoURL ? (
              <img src={orgSettings.logoURL} alt="Logo" className="w-8 h-8 rounded-lg object-cover shadow-sm" />
            ) : (
              <div className="w-8 h-8 rounded-lg bg-gray-900 flex items-center justify-center shadow-sm text-white"><Building2 size={16} /></div>
            )}
            <span className="text-md font-black text-gray-900 tracking-tight">{orgSettings?.name || user?.orgName || 'HRFlow'}</span>
          </div>

          {/* RESTORED QUICK ACCESS BAR */}
          {(() => {
            const userPerms = user?.permissions || {}
            const isAdmin = user?.role?.toLowerCase() === 'admin'

            const quickActions = [
              { label: 'Attendance', tab: 'attendance', icon: <Calendar size={15} />, module: 'Attendance', right: 'create' },
              { label: 'Add Employee', tab: 'settings', icon: <Users size={15} />, module: 'Employees', right: 'create' },
              { label: 'Add Expense', tab: 'advance', icon: <Wallet size={15} />, module: 'AdvanceExpense', right: 'create' },
              { label: 'Correction', tab: 'correction', icon: <PencilLine size={15} />, module: 'Correction', right: 'create' },
              { label: 'Full Summary', tab: 'summary', summaryTab: 'monthlyView', icon: <BarChart3 size={15} />, module: 'Summary', right: 'view' },
            ].filter(action => {
              if (isAdmin) return true
              if (action.module === 'Employees') return userPerms['Employees']?.create === true || userPerms['Settings']?.create === true
              const modulePerms = userPerms[action.module] || {}
              return modulePerms[action.right] === true
            })

            if (quickActions.length === 0) return null

            return (
              <div className="hidden lg:flex items-center gap-2 ml-8 pl-8 border-l border-gray-200">
                {quickActions.map(item => (
                  <button
                    key={item.tab}
                    onClick={() => {
                      setActiveTab(item.tab)
                      setTabSearchParams({ tab: item.tab })
                      if (item.tab === 'summary' && item.summaryTab) setSummarySubTab(item.summaryTab)
                    }}
                    className={`flex items-center gap-1.5 px-3 h-8 rounded-lg border text-[11px] font-bold whitespace-nowrap transition-all ${activeTab === item.tab
                      ? 'bg-indigo-600 text-white border-indigo-600 shadow-md shadow-indigo-100'
                      : 'bg-white border-gray-200 text-gray-600 hover:border-indigo-300 hover:text-indigo-600'
                      }`}
                  >
                    <span>{item.icon}</span>
                    <span>{item.label}</span>
                  </button>
                ))}
              </div>
            )
          })()}
        </div>

        <div className="flex items-center gap-4">
          {/* RESTORED PROFILE SECTION */}
          <button 
            onClick={() => { setActiveTab('portal'); setTabSearchParams({ tab: 'portal' }); setPortalSubTab('profile') }} 
            className="hidden sm:flex items-center gap-2 px-3 py-1.5 hover:bg-indigo-50 rounded-md transition-all group"
          >
            <div className="flex flex-col items-end text-right">
              <span className="text-[13px] font-black text-gray-800 tracking-tight group-hover:text-indigo-600 transition-colors leading-none">{user?.name}</span>
              <span className="text-[9px] text-gray-400 font-bold uppercase tracking-[0.1em] mt-1">{user?.email || user?.role || 'Staff'}</span>
            </div>
            {currentEmployee?.photoURL ? (
              <img src={currentEmployee.photoURL} alt="Profile" className="w-8 h-8 rounded-full object-cover shadow-sm border border-gray-100" />
            ) : (
              <div className="w-8 h-8 rounded-full flex items-center justify-center text-white text-[10px] font-black shadow-sm border border-gray-100" style={{ backgroundColor: getAvatarColor(user?.uid) }}>{getInitials(user?.name)}</div>
            )}
          </button>
          
          <div className="h-6 w-px bg-gray-200 hidden sm:block"></div>

          <button onClick={() => setShowLog(s => !s)} className={`p-1.5 rounded-md transition-all ${showLog ? 'bg-indigo-100 text-indigo-600' : 'text-gray-500 hover:text-indigo-600 hover:bg-indigo-50'}`}><History size={16} /></button>
          <button onClick={logout} className="p-1.5 text-gray-500 hover:text-red-600 hover:bg-red-50 rounded-md transition-all"><LogOut size={16} /></button>
        </div>
      </header>

      <div className="flex flex-1 min-h-0 overflow-hidden relative">
        {isMobileMenuOpen && <div className="fixed inset-0 z-50 md:hidden bg-black/40 backdrop-blur-sm" onClick={() => setIsMobileMenuOpen(false)} />}
        
        <aside className={`bg-white border-r border-gray-200 flex flex-col shrink-0 transition-all duration-300 fixed inset-y-0 left-0 z-50 md:relative md:z-0 ${isMobileMenuOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'} ${isCollapsed ? 'md:w-[56px]' : 'md:w-[210px] w-64 shadow-2xl md:shadow-none'}`}>
          <div className="p-4 border-b border-gray-200 flex items-center justify-between md:hidden leading-none h-14">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-gray-900 flex items-center justify-center text-white shadow-sm"><Building2 size={16} /></div>
              <span className="text-md font-black text-gray-900 tracking-tight">HRFlow</span>
            </div>
            <button onClick={() => setIsMobileMenuOpen(false)} className="p-1.5 hover:bg-gray-100 rounded-lg text-gray-500 transition-colors"><X size={18} /></button>
          </div>
          
          <nav className="flex-1 px-3 py-4 space-y-2 overflow-y-auto no-scrollbar">
            {sections.map(section => {
              const sectionTabs = allTabs.filter(t => section.tabs.includes(t.id))
              if (sectionTabs.length === 0) return null
              return (
                <div key={section.id} className="flex flex-col">
                  {!isCollapsed && <div className="left-panel-title flex items-center px-2 py-1 mb-1">
                    <span className="text-[9px] font-black text-gray-400 uppercase tracking-[0.2em]">{section.title}</span>
                  </div>}
                  <div className="flex flex-col gap-0.5">
                    {sectionTabs.map(tab => {
                      const isActive = activeTab === tab.id
                      return (
                        <button key={tab.id} onClick={() => { setActiveTab(tab.id); setTabSearchParams({ tab: tab.id }); setIsMobileMenuOpen(false) }} className={`${isCollapsed ? 'justify-center px-0 py-2' : 'left-panel-btn px-3 py-2'} ${isActive ? 'active' : ''} transition-all duration-150`}>
                          <span className={`shrink-0 ${isActive ? 'text-white' : 'text-gray-400 group-hover:text-indigo-600'}`}>{React.cloneElement(tab.icon, { size: 16, strokeWidth: 2 })}</span>
                          {!isCollapsed && <span className="text-[11px] font-bold truncate leading-none">{tab.label}</span>}
                        </button>
                      )
                    })}
                  </div>
                </div>
              )
            })}
          </nav>
          
          <div className="p-2 border-t border-gray-100">
            <button onClick={() => setIsCollapsed(!isCollapsed)} className={`w-full flex items-center rounded-lg text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 transition-all ${isCollapsed ? 'justify-center py-2' : 'px-3 py-2 gap-3'}`}>
              <PanelLeft size={18} className={`${isCollapsed ? 'rotate-180' : ''} transition-transform`} />
              {!isCollapsed && <span className="text-[11px] font-bold">Collapse Sidebar</span>}
            </button>
          </div>
        </aside>

        <main className="flex-1 min-w-0 bg-gray-50 relative overflow-hidden flex flex-col">
          <ErrorBoundary>
            <div className="flex-1 overflow-auto w-full">
              {renderTabContent()}
            </div>
          </ErrorBoundary>
        </main>
      </div>
    </div>
  )
}
