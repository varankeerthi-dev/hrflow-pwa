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
  MessageSquare,
  Lock,
  ChevronDown,
  Sparkles
} from 'lucide-react'
import ActivityLogSidebar from '../components/ui/ActivityLogSidebar'
import OrganizationSwitcher from '../components/ui/OrganizationSwitcher'
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-md font-inter">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-sm p-8 mx-4 border border-gray-100">
        <div className="flex flex-col items-center mb-6">
          <div className="w-16 h-16 rounded-xl bg-gradient-to-br from-indigo-600 to-purple-600 flex items-center justify-center mb-4 shadow-xl">
            <span className="text-white text-3xl">🏢</span>
          </div>
          <h2 className="text-xl font-bold text-gray-800 uppercase tracking-tight font-inter">Organization Setup</h2>
          <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest text-center mt-2 font-inter">
            {user?.orgId ? 'Create New Division' : 'Join a Team or Create Your Own'}
          </p>
        </div>

        {!user?.orgId && (
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
          <div className="space-y-4 font-inter text-center">
            <div className="bg-green-50 border border-green-100 rounded-xl p-5">
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

// ─── Dashboard Component ───────────────────────────────────────────────────────
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
  const [showLog, setShowLog] = useState(false)
  const [orgSettings, setOrgSettings] = useState({})
  const [isFeaturesExpanded, setIsFeaturesExpanded] = useState(true)

  // Load Plus Jakarta Sans font (Enterprise SaaS design system)
  useEffect(() => {
    if (document.getElementById('google-fonts')) return
    const link = document.createElement('link')
    link.id = 'google-fonts'
    link.href = 'https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap'
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
    { id: 'attendance-list', label: 'Attendance', icon: <Calendar size={18} strokeWidth={1.75} />, module: 'Attendance' },
    { id: 'tasks', label: 'Tasks', icon: <CheckCircle2 size={18} strokeWidth={1.75} />, module: 'Tasks' },
    { id: 'salary-slip', label: 'Salary Slip', icon: <Wallet size={18} strokeWidth={1.75} />, module: 'SalarySlip' },
    { id: 'advance', label: 'Advances', icon: <Wallet size={18} strokeWidth={1.75} />, module: 'AdvanceExpense' },
    { id: 'approvals', label: 'Approvals', icon: <CheckCircle2 size={18} strokeWidth={1.75} />, badge: '!', module: 'Approvals' },
    { id: 'correction', label: 'Corrections', icon: <PencilLine size={18} strokeWidth={1.75} />, module: 'Correction' },
    { id: 'leave', label: 'Leave', icon: <Mail size={18} strokeWidth={1.75} />, module: 'Leave' },
    { id: 'letters', label: 'HR Letters', icon: <FileText size={18} strokeWidth={1.75} />, module: 'HRLetters' },
    { id: 'vehicles', label: 'Vehicles', icon: <Car size={18} strokeWidth={1.75} />, module: 'Workforce' },
    { id: 'documents', label: 'Documents', icon: <Folder size={18} strokeWidth={1.75} />, module: 'DocumentManagement' },
    { id: 'summary', label: 'Summary', icon: <BarChart3 size={18} strokeWidth={1.75} />, module: 'Summary' },
    { id: 'fines', label: 'Fines', icon: <Gavel size={18} strokeWidth={1.75} />, module: 'Fine' },
    { id: 'engage', label: 'Engage', icon: <Handshake size={18} strokeWidth={1.75} />, module: 'Engagement' },
    { id: 'chat', label: 'Team Chat', icon: <MessageSquare size={18} strokeWidth={1.75} />, module: 'Engagement' },
    { id: 'shift-planning', label: 'Shift Planning', icon: <Calendar size={18} strokeWidth={1.75} />, module: 'ShiftPlanning' },
    { id: 'portal', label: 'My Portal', icon: <User size={18} strokeWidth={1.75} />, module: 'EmployeePortal' },
    { id: 'settings', label: 'Settings', icon: <Settings size={18} strokeWidth={1.75} />, module: 'Settings' },
  ], [])

  // RBAC: Filter tabs based on user permissions
  const isAdmin = user?.role?.toLowerCase() === 'admin'
  const userPermissions = user?.permissions || {}
  
  const visibleTabs = useMemo(() => {
    if (isAdmin) return allTabs
    
    return allTabs.filter(tab => {
      // Always show home and portal
      if (tab.id === 'home' || tab.id === 'portal') return true
      
      // Check module permissions
      const modulePerms = userPermissions[tab.module]
      if (!modulePerms) return false
      
      // User needs at least 'view' permission for the module
      return modulePerms.view === true || 
             modulePerms.create === true || 
             modulePerms.edit === true || 
             modulePerms.delete === true ||
             modulePerms.approve === true
    })
  }, [allTabs, isAdmin, userPermissions])

  const visibleTabIds = useMemo(() => visibleTabs.map(t => t.id), [visibleTabs])

  const [tabSearchParams, setTabSearchParams] = useSearchParams()

  useEffect(() => {
    const tabParam = tabSearchParams.get('tab')
    if (tabParam && visibleTabs.find(t => t.id === tabParam)) {
      setActiveTab(tabParam)
    } else if (tabParam && !visibleTabs.find(t => t.id === tabParam)) {
      // User tried to access a tab they don't have permission for
      setActiveTab('home')
      setTabSearchParams({ tab: 'home' })
    }
  }, [tabSearchParams, visibleTabs])

  const mainTabs = ['home', 'attendance-list', 'tasks', 'salary-slip', 'advance', 'approvals']
  
  const featuresTabs = ['correction', 'leave', 'letters', 'vehicles', 'documents', 'summary', 'fines', 'engage', 'chat', 'shift-planning']

  const renderMenuItem = (tab, isActive, onClick) => (
    <button 
      key={tab.id} 
      onClick={onClick} 
      className={`w-full flex items-center gap-3 rounded-xl transition-all duration-200 group ${isCollapsed ? 'justify-center px-0 py-3' : 'px-3 py-2.5'} ${isActive ? 'bg-gradient-to-r from-indigo-600 to-violet-600 text-white shadow-md shadow-indigo-200' : 'hover:bg-indigo-50/80 text-gray-600 hover:text-indigo-700'}`}
    >
      <span className={`shrink-0 ${isActive ? 'text-white' : 'text-gray-400 group-hover:text-indigo-600'}`}>
        {React.cloneElement(tab.icon, { size: isCollapsed ? 20 : 18, strokeWidth: 2 })}
      </span>
      {!isCollapsed && (
        <span className={`text-[12px] font-semibold truncate leading-none ${isActive ? 'text-white' : ''}`}>
          {tab.label}
        </span>
      )}
    </button>
  )

  const renderMenu = () => {
    const mainItems = visibleTabs.filter(t => mainTabs.includes(t.id))
    const featuresItems = visibleTabs.filter(t => featuresTabs.includes(t.id))
    const portalItem = visibleTabs.find(t => t.id === 'portal')
    const settingsItem = visibleTabs.find(t => t.id === 'settings')

    return (
      <>
        {mainItems.map(tab => renderMenuItem(tab, activeTab === tab.id, () => { setActiveTab(tab.id); setTabSearchParams({ tab: tab.id }); setIsMobileMenuOpen(false) }))}
        
        {featuresItems.length > 0 && (
          <div className="mt-2">
            <button 
              onClick={() => setIsFeaturesExpanded(!isFeaturesExpanded)}
              className={`w-full flex items-center gap-3 rounded-xl transition-all duration-200 group px-3 py-2 ${isCollapsed ? 'justify-center' : ''} ${isCollapsed ? '' : 'hover:bg-indigo-50/80 text-gray-600 hover:text-indigo-700'}`}
            >
              <span className="shrink-0 text-gray-400 group-hover:text-indigo-600">
                <Sparkles size={18} strokeWidth={2} />
              </span>
              {!isCollapsed && (
                <span className="text-[12px] font-semibold truncate leading-none flex-1 text-left">Features</span>
              )}
              {!isCollapsed && (
                <ChevronDown size={14} className={`text-gray-400 transition-transform duration-200 ${isFeaturesExpanded ? 'rotate-180' : ''}`} />
              )}
            </button>
            
            {isFeaturesExpanded && (
              <div className="ml-3 pl-3 border-l-2 border-gray-100 space-y-0.5">
                {featuresItems.map(tab => renderMenuItem(tab, activeTab === tab.id, () => { setActiveTab(tab.id); setTabSearchParams({ tab: tab.id }); setIsMobileMenuOpen(false) }))}
              </div>
            )}
          </div>
        )}

        {portalItem && (
          <div className="mt-2">
            {renderMenuItem(portalItem, activeTab === 'portal', () => { setActiveTab('portal'); setTabSearchParams({ tab: 'portal' }); setIsMobileMenuOpen(false) })}
          </div>
        )}

        {settingsItem && (
          <div className="mt-auto pt-2 border-t border-gray-200/80">
            {renderMenuItem(settingsItem, activeTab === 'settings', () => { setActiveTab('settings'); setTabSearchParams({ tab: 'settings' }); setIsMobileMenuOpen(false) })}
          </div>
        )}
      </>
    )
  }

  const renderTabContent = () => {
    // RBAC: Check if user has permission to view this tab
    if (!isAdmin && activeTab !== 'home' && activeTab !== 'portal') {
      const currentTab = visibleTabs.find(t => t.id === activeTab)
      if (!currentTab) {
        // User doesn't have permission for this tab
        return (
          <div className="flex-1 flex items-center justify-center p-8">
            <div className="text-center max-w-md bg-white rounded-2xl shadow-lg shadow-gray-200/50 p-8 border border-gray-100">
              <div className="w-16 h-16 bg-gradient-to-br from-red-100 to-red-50 rounded-2xl flex items-center justify-center mx-auto mb-5 shadow-sm">
                <Lock size={28} className="text-red-500" />
              </div>
              <h3 className="text-lg font-bold text-gray-900 mb-2">Access Denied</h3>
              <p className="text-sm text-gray-500 mb-6 leading-relaxed">You don't have permission to access this module. Please contact your administrator.</p>
              <button 
                onClick={() => { setActiveTab('home'); setTabSearchParams({ tab: 'home' }); }}
                className="px-6 py-2.5 bg-gradient-to-r from-indigo-600 to-violet-600 text-white rounded-xl text-sm font-semibold hover:shadow-md hover:shadow-indigo-200 transition-all duration-200"
              >
                Go to Dashboard
              </button>
            </div>
          </div>
        )
      }
    }
    
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
      <div className="min-h-screen bg-[#F8FAFC] flex flex-col items-center justify-center p-4" style={{ fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
        <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-indigo-600 to-violet-600 mb-6 flex items-center justify-center shadow-lg shadow-indigo-200 animate-pulse">
          <span className="text-white text-3xl font-bold">H</span>
        </div>
        <div className="w-12 h-12 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin mb-4"></div>
        <p className="text-gray-600 font-semibold uppercase tracking-wider text-[11px]">Synchronizing Dashboard...</p>
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
    <div className="min-h-screen bg-[#F8FAFC] flex flex-col" style={{ fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
      {showLog && <ActivityLogSidebar orgId={user?.orgId} onClose={() => setShowLog(false)} />}

      <header className="sticky top-0 z-40 bg-white/80 backdrop-blur-md border-b border-gray-200/80 h-14 shrink-0 px-4 flex items-center justify-between shadow-sm">
        <div className="flex items-center gap-3">
          <button onClick={() => setIsCollapsed(!isCollapsed)} className="p-2 hover:bg-indigo-50 rounded-xl text-gray-500 hover:text-indigo-600 hidden md:block transition-all duration-200"><PanelLeft size={18} /></button>
          <button onClick={() => setIsMobileMenuOpen(true)} className="p-2 hover:bg-indigo-50 rounded-xl text-gray-500 hover:text-indigo-600 md:hidden transition-all duration-200"><Menu size={18} /></button>
          <div className="flex items-center gap-2.5">
            {orgSettings?.logoURL ? (
              <img src={orgSettings.logoURL} alt="Logo" className="w-8 h-8 rounded-xl object-cover shadow-sm ring-2 ring-gray-100" />
            ) : (
              <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-indigo-600 to-violet-600 flex items-center justify-center shadow-sm"><Building2 size={16} className="text-white" /></div>
            )}
            <span className="text-sm font-bold text-gray-900 tracking-tight">{orgSettings?.name || user?.orgName || 'HRFlow'}</span>
          </div>

          {/* Quick Access Bar */}
          {(() => {
            const userPerms = user?.permissions || {}
            const isAdmin = user?.role?.toLowerCase() === 'admin'
            const quickActions = [
              { label: 'Attendance', tab: 'attendance', icon: <Calendar size={14} />, module: 'Attendance', right: 'create' },
              { label: 'Add Employee', tab: 'settings', icon: <Users size={14} />, module: 'Employees', right: 'create' },
              { label: 'Add Expense', tab: 'advance', icon: <Wallet size={14} />, module: 'AdvanceExpense', right: 'create' },
              { label: 'Advance', tab: 'advance', icon: <Wallet size={14} />, module: 'AdvanceExpense', right: 'create' },
              { label: 'Full Summary', tab: 'summary', summaryTab: 'monthlyView', icon: <BarChart3 size={14} />, module: 'Summary', right: 'view' },
            ].filter(action => {
              if (isAdmin) return true
              if (action.module === 'Employees') return userPerms['Employees']?.create === true || userPerms['Settings']?.create === true
              const modulePerms = userPerms[action.module] || {}
              return modulePerms[action.right] === true
            })
            if (quickActions.length === 0) return null
            return (
              <div className="hidden lg:flex items-center gap-2 ml-8 pl-8 border-l border-gray-200/80">
                {quickActions.map(item => (
                  <button key={item.tab} onClick={() => { setActiveTab(item.tab); setTabSearchParams({ tab: item.tab }); if (item.tab === 'summary' && item.summaryTab) setSummarySubTab(item.summaryTab) }} className={`flex items-center gap-1.5 px-4 h-9 rounded-xl text-[11px] font-semibold whitespace-nowrap transition-all duration-200 ${activeTab === item.tab ? 'bg-gradient-to-r from-indigo-600 to-violet-600 text-white shadow-md shadow-indigo-200' : 'bg-white border border-gray-200/80 text-gray-600 hover:border-indigo-300 hover:text-indigo-600 hover:bg-indigo-50/50'}`}>
                    <span>{item.icon}</span> <span>{item.label}</span>
                  </button>
                ))}
              </div>
            )
          })()}
        </div>

        <div className="flex items-center gap-4">
          {/* Organization Switcher - Only show if user has organizations */}
          {user?.orgId && <OrganizationSwitcher />}
          <div className="h-6 w-px bg-gray-200 hidden sm:block"></div>
          
          <button onClick={() => { setActiveTab('portal'); setTabSearchParams({ tab: 'portal' }); setPortalSubTab('profile') }} className="hidden sm:flex items-center gap-2 px-3 py-1.5 hover:bg-indigo-50 rounded-md transition-all group">
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
        <aside className={`bg-[#ffffff] border-r border-gray-200/80 flex flex-col shrink-0 transition-all duration-300 fixed inset-y-0 left-0 z-50 md:relative md:z-0 shadow-[4px_0_24px_rgba(0,0,0,0.02)] ${isMobileMenuOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'} ${isCollapsed ? 'md:w-[72px]' : 'md:w-[200px] w-72'}`}>
          <div className="p-4 border-b border-gray-200/80 flex items-center justify-between md:hidden h-14 shrink-0">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-indigo-600 to-violet-600 flex items-center justify-center shadow-sm"><Building2 size={16} className="text-white" /></div>
              <span className="text-sm font-bold text-gray-900 tracking-tight">HRFlow</span>
            </div>
            <button onClick={() => setIsMobileMenuOpen(false)} className="p-2 hover:bg-gray-100 rounded-xl text-gray-500 transition-colors"><X size={18} /></button>
          </div>
          <nav className="flex-1 px-3 py-3 space-y-0.5 overflow-y-auto no-scrollbar">
            {renderMenu()}
          </nav>
          <div className="p-3 border-t border-gray-200/80 shrink-0 bg-gray-50/50">
            <button 
              onClick={() => setIsCollapsed(!isCollapsed)} 
              className={`w-full flex items-center rounded-xl text-gray-500 hover:text-indigo-700 hover:bg-indigo-50/80 transition-all duration-200 ${isCollapsed ? 'justify-center py-2.5' : 'px-3 py-2.5 gap-3'}`}
            >
              <PanelLeft size={18} className={`${isCollapsed ? 'rotate-180' : ''} transition-transform duration-300`} />
              {!isCollapsed && <span className="text-[11px] font-semibold">Collapse Sidebar</span>}
            </button>
          </div>
        </aside>
        <div className="flex-1 flex flex-col min-w-0 bg-[#F8FAFC]">
          <main className="flex-1 overflow-auto bg-[#F8FAFC] relative flex flex-col">
            <ErrorBoundary>
              <div className="w-full flex-1 p-4">
                {renderTabContent()}
              </div>
            </ErrorBoundary>
          </main>
        </div>
      </div>
    </div>
  )
}
