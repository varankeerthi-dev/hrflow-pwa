import AccountantTab from '../components/tabs/AccountantTab'
import SiteReportTab from '../components/tabs/SiteReportTab'
import React, { useState, useEffect, useMemo, Component } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import { useEmployees } from '../hooks/useEmployees'
import { db } from '../lib/firebase'
import { doc, getDoc, collection, getDocs, onSnapshot } from 'firebase/firestore'
import {
  Car,
  Truck,
  Calendar,
  Briefcase,
  Folder,
  PencilLine,
  CheckCircle2,
  BarChart3,
  Wallet,
  Banknote,
  User,
  Settings,
  LogOut,
  ChevronRight,
  ChevronLeft,
  ChevronDown,
  Menu,
  X,
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
  Sparkles,
  LifeBuoy
} from 'lucide-react'
import ActivityLogSidebar from '../components/ui/ActivityLogSidebar'
import OrganizationSwitcher from '../components/ui/OrganizationSwitcher'
import AttendanceTab from '../components/tabs/AttendanceTab'
import CorrectionTab from '../components/tabs/CorrectionTab'
import ApprovalsTab from '../components/tabs/ApprovalsTab'
import SettingsTab from '../components/tabs/SettingsTab'
import EmployeePortalTab from '../components/tabs/EmployeePortalTab'
import EmployeeVehiclePortal from '../components/tabs/EmployeeVehiclePortal'
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
import EmployeesTab from '../components/tabs/EmployeesTab'
import HomeTab from '../components/tabs/HomeTab'
import HelpTab from '../components/tabs/HelpTab'
import OperationsTab from '../components/tabs/OperationsTab'
import { useSidebar } from '../contexts/SidebarContext'

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
          <p className="text-red-600 text-xs font-bold uppercase mb-4">{this.state.error?.message || 'Unexpected Rendering Error'}</p>
          {this.state.error?.stack && (
            <pre className="text-left bg-white p-4 rounded border border-red-200 text-red-900 text-xs font-mono overflow-auto max-h-60 mb-4 whitespace-pre-wrap">
              {this.state.error.stack}
            </pre>
          )}
          <button onClick={() => window.location.reload()} className="bg-red-600 text-white px-8 py-2 rounded-lg font-bold shadow-lg uppercase text-xs">Reload Application</button>
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
          <p className="text-xs text-gray-400 font-bold uppercase tracking-widest text-center mt-2 font-inter">
            {user?.orgId ? 'Create New Division' : 'Join a Team or Create Your Own'}
          </p>
        </div>

        {!user?.orgId && (
          <div className="flex bg-gray-100 rounded-lg p-1 mb-6">
            <button onClick={() => { setModalTab('join'); setError('') }}
              className={`flex-1 py-2 rounded-lg text-xs font-bold uppercase tracking-widest transition font-inter ${modalTab === 'join' ? 'bg-white shadow-sm text-indigo-600' : 'text-gray-400'}`}>
              Join Team
            </button>
            <button onClick={() => { setModalTab('create'); setError('') }}
              className={`flex-1 py-2 rounded-lg text-xs font-bold uppercase tracking-widest transition font-inter ${modalTab === 'create' ? 'bg-white shadow-sm text-indigo-600' : 'text-gray-400'}`}>
              Create Org
            </button>
          </div>
        )}

        {error && <div className="bg-red-50 border border-red-100 text-red-600 px-4 py-2 rounded-lg text-xs font-bold mb-4 uppercase text-center font-inter">{error}</div>}

        {createdCode ? (
          <div className="space-y-4 font-inter text-center">
            <div className="bg-green-50 border border-green-100 rounded-xl p-5">
              <p className="text-xs text-green-700 font-bold uppercase tracking-widest mb-3">Organization Online! 🎉</p>
              <div className="bg-white border border-green-200 rounded-lg px-4 py-3 font-mono font-bold tracking-widest text-lg select-all shadow-inner">{createdCode}</div>
              <p className="text-xs text-gray-400 font-bold uppercase mt-3 tracking-tighter italic">Share this code with your employees</p>
            </div>
            <button onClick={() => window.location.reload()} className="w-full bg-indigo-600 text-white font-bold py-3 rounded-lg shadow-xl uppercase text-xs tracking-widest">Get Started</button>
          </div>
        ) : modalTab === 'join' ? (
          <form onSubmit={handleJoin} className="space-y-4 font-inter">
            <input value={orgCode} onChange={e => setOrgCode(e.target.value)} placeholder="ENTER ORG CODE" className="w-full border border-gray-200 rounded-lg h-[42px] px-4 py-3 focus:ring-2 focus:ring-indigo-500 outline-none text-xs font-bold tracking-widest bg-gray-50" />
            <button type="submit" disabled={loading} className="w-full h-[40px] bg-indigo-600 text-white font-bold rounded-lg shadow-xl transition disabled:opacity-50 uppercase text-xs tracking-widest">{loading ? 'Verifying...' : 'Join Organization'}</button>
          </form>
        ) : (
          <form onSubmit={handleCreate} className="space-y-4 font-inter">
            <input value={orgName} onChange={e => setOrgName(e.target.value)} placeholder="BUSINESS NAME" className="w-full border border-gray-200 rounded-lg h-[42px] px-4 py-3 focus:ring-2 focus:ring-indigo-500 outline-none text-xs font-bold uppercase tracking-widest bg-gray-50" />
            <button type="submit" disabled={loading} className="w-full h-[40px] bg-indigo-600 text-white font-bold rounded-lg shadow-xl transition disabled:opacity-50 uppercase text-xs tracking-widest">{loading ? 'Creating...' : 'Initialize Org'}</button>
          </form>
        )}

        <div className="mt-6 pt-4 border-t border-gray-100 space-y-3">
          {!user?.orgId && (
            <button 
              onClick={onLogout} 
              className="w-full bg-rose-50 hover:bg-rose-100 text-rose-600 font-bold py-3 rounded-lg transition uppercase text-xs tracking-widest flex items-center justify-center gap-2 border border-rose-200 shadow-sm"
            >
              <LogOut size={14} /> <span>Sign Out & Exit</span>
            </button>
          )}
          <button onClick={onLogout} className="w-full flex items-center justify-center gap-2 text-gray-400 hover:text-gray-600 transition-colors py-2 uppercase text-xs font-bold tracking-widest font-inter">
            <X size={14} /> <span>Back to login</span>
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
  const { isCollapsed, setIsCollapsed, toggleSidebar, isAutoCollapsed, setIsAutoCollapsed } = useSidebar()

  const canFetchEmployees = user && !!user.orgId
  const { employees, loading: empLoading } = useEmployees(canFetchEmployees ? user.orgId : null)

  const [activeTab, setActiveTab] = useState('attendance')
  const [operationsSubTab, setOperationsSubTab] = useState('dates')

  useEffect(() => {
    if (activeTab === 'salary-slip') {
      setIsCollapsed(prev => {
        if (!prev) {
          setIsAutoCollapsed(true)
          return true
        }
        return prev
      })
    } else {
      setIsAutoCollapsed(prevAuto => {
        if (prevAuto) {
          setIsCollapsed(false)
          return false
        }
        return prevAuto
      })
    }
  }, [activeTab, setIsCollapsed, setIsAutoCollapsed])
  const [portalSubTab, setPortalSubTab] = useState('dashboard')
  const [salarySubTab, setSalarySubTab] = useState('detailed')
  const [salaryActiveTab, setSalaryActiveTab] = useState('salary-summary')
  const [tasksSubTab, setTasksSubTab] = useState('checklist')
  const [settingsSubTab, setSettingsSubTab] = useState(null)
  const [attendanceSubTab, setAttendanceSubTab] = useState('attendance')
  const [advanceSubTab, setAdvanceSubTab] = useState('Add Advance')
  const [attendanceDirty, setAttendanceDirty] = useState(false)
  const [advanceExpenseDirty, setAdvanceExpenseDirty] = useState(false)
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false)
  const [showLog, setShowLog] = useState(false)
  
  const [orgSettings, setOrgSettings] = useState({})
  const [logoError, setLogoError] = useState(false)

  const currentEmployee = useMemo(() => {
    if (!employees.length || !user?.uid) return null
    const normalizedUserEmail = user.email?.toLowerCase().trim()
    return employees.find(e => {
      const empEmail = (e.email || '').toLowerCase().trim()
      const personalEmail = (e.personalEmail || '').toLowerCase().trim()
      const workEmail = (e.workEmail || '').toLowerCase().trim()
      return e.id === user.employeeId || (normalizedUserEmail && [empEmail, personalEmail, workEmail].includes(normalizedUserEmail)) || e.id === user.uid
    }) || null
  }, [employees, user])

  useEffect(() => {
    if (user?.orgId) {
      const unsub = onSnapshot(doc(db, 'organisations', user.orgId), (snap) => {
        if (snap.exists()) {
          setOrgSettings(snap.data())
          setLogoError(false)
        }
      })
      return () => unsub()
    }
  }, [user?.orgId])

  const allTabs = useMemo(() => [
    { id: 'employees', label: 'Employees', icon: <Users size={18} strokeWidth={1.75} />, module: 'Employees' },
    { id: 'home', label: 'Dashboard', icon: <LayoutDashboard size={18} strokeWidth={1.75} />, module: 'EmployeePortal' },
    { id: 'attendance-list', label: 'Attendance', icon: <Calendar size={18} strokeWidth={1.75} />, module: 'Attendance' },
    { id: 'tasks', label: 'Tasks', icon: <CheckCircle2 size={18} strokeWidth={1.75} />, module: 'Tasks' },
    { id: 'salary-slip', label: 'Payroll', icon: <Wallet size={18} strokeWidth={1.75} />, module: 'SalarySlip' },
    { id: 'advance', label: 'Advance/Expense', icon: <Wallet size={18} strokeWidth={1.75} />, module: 'AdvanceExpense' },
    { id: 'approvals', label: 'Approvals', icon: <CheckCircle2 size={18} strokeWidth={1.75} />, badge: '!', module: 'Approvals' },
    { id: 'correction', label: 'Attendance Correction', icon: <PencilLine size={18} strokeWidth={1.75} />, module: 'Correction' },
    { id: 'leave', label: 'Leave', icon: <Mail size={18} strokeWidth={1.75} />, module: 'Leave' },
    { id: 'letters', label: 'HR Communications', icon: <FileText size={18} strokeWidth={1.75} />, module: 'HRLetters' },
    { id: 'vehicle', label: 'Vehicle', icon: <Truck size={18} strokeWidth={1.75} />, module: 'Vehicle' },
    { id: 'operations', label: 'Operations', icon: <Settings size={18} strokeWidth={1.75} />, module: 'Operations' },
    { id: 'documents', label: 'Documents', icon: <Folder size={18} strokeWidth={1.75} />, module: 'DocumentManagement' },
    { id: 'fines', label: 'Fines', icon: <Gavel size={18} strokeWidth={1.75} />, module: 'Fine' },
    { id: 'engage', label: 'Engage', icon: <Handshake size={18} strokeWidth={1.75} />, module: 'Engagement' },
    { id: 'chat', label: 'Team Chat', icon: <MessageSquare size={18} strokeWidth={1.75} />, module: 'Engagement' },
    { id: 'recruitment', label: 'Recruitment', icon: <Briefcase size={18} strokeWidth={1.75} />, module: 'Recruitment' },
    { id: 'reports', label: 'Reports', icon: <BarChart3 size={18} strokeWidth={1.75} />, module: 'Reports', children: ['attendance-reports', 'site-reports'] },
    { id: 'accountant', label: 'Accountant', icon: <Banknote size={18} strokeWidth={1.75} />, module: 'Finance' },
    { id: 'portal', label: 'My Portal', icon: <User size={18} strokeWidth={1.75} />, module: 'EmployeePortal' },
    { id: 'attendance-reports', label: 'Attendance Reports', icon: null, module: 'Attendance' },
    { id: 'site-reports', label: 'Site Report', icon: null, module: 'Reports' },
    { id: 'settings', label: 'Settings', icon: <Settings size={18} strokeWidth={1.75} />, module: 'Settings' },
    { id: 'help', label: 'Help', icon: <LifeBuoy size={18} strokeWidth={1.75} />, module: 'Settings' },
  ], [])

  // RBAC: Filter tabs based on user permissions
  const isAdmin = user?.role?.toLowerCase() === 'admin'
  const userPermissions = user?.permissions || {}
  
  const visibleTabs = useMemo(() => {
    if (isAdmin) return allTabs
    
    return allTabs.filter(tab => {
      // The dashboard and self-service portal are available after sign-in; all
      // operational reports require their explicit RBAC module permission.
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

  const navigateToTab = (tabId) => {
    if (attendanceDirty && tabId !== activeTab) {
      const ok = window.confirm('You have unsaved attendance changes. Leaving now will lose your entered data. Continue?')
      if (!ok) return false
    }
    if (advanceExpenseDirty && ['advance', 'expense'].includes(activeTab) && tabId !== activeTab) {
      const ok = window.confirm('You have unsaved Advance / Expense entries. Leaving now will keep the saved draft, but it has not been submitted. Continue?')
      if (!ok) return false
    }
    if (tabId !== activeTab) {
      setActiveTab(tabId)
      setTabSearchParams({ tab: tabId })
    }
    return true
  }

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

  const mainTabs = ['home', 'attendance-list', 'advance', 'vehicle']
  
  const hrTabs = ['employees', 'leave', 'letters', 'recruitment', 'documents', 'correction']
  const featuresTabs = ['fines', 'engage', 'chat']

  const [hoveredTooltip, setHoveredTooltip] = useState(null)
  const [tooltipTop, setTooltipTop] = useState(0)

  const handleSidebarHover = (e, label) => {
    if (!isCollapsed) return;
    const rect = e.currentTarget.getBoundingClientRect();
    setTooltipTop(rect.top + rect.height / 2 - 56);
    setHoveredTooltip(label);
  };

  const handleSidebarLeave = () => {
    setHoveredTooltip(null);
  };

  const renderMenuItem = (tab, isActive, onClick, fontSize = '14px') => (
    <div key={tab.id} className="w-full">
      <button 
        onClick={onClick} 
        onMouseEnter={(e) => handleSidebarHover(e, tab.label)}
        onMouseLeave={handleSidebarLeave}
        className={`${isActive ? 'sidebar-active' : 'sidebar-inactive'} ${isCollapsed ? 'justify-center px-0 w-full' : 'w-full'}`}
      >
        <span className={`shrink-0 ${isActive ? 'text-blue-600' : 'text-slate-500'}`}>
          {tab.icon && React.cloneElement(tab.icon, { size: 17, strokeWidth: isActive ? 2 : 1.75 })}
        </span>
        {!isCollapsed && (
          <span 
            className="truncate flex-1 text-left" 
            style={{ fontSize }}
          >
            {tab.label}
          </span>
        )}
        {!isCollapsed && isActive && (
          <ChevronRight size={15} className="ml-auto text-blue-600 shrink-0" />
        )}
      </button>
    </div>
  )

  const menuGroups = {
    hr: {
      id: 'hr',
      label: 'HR',
      icon: <Users size={18} strokeWidth={1.75} />,
      children: ['employees', 'leave', 'letters', 'recruitment', 'documents', 'correction']
    },
    reports: {
      id: 'reports',
      label: 'Reports',
      icon: <BarChart3 size={18} strokeWidth={1.75} />,
      children: ['attendance-reports', 'site-reports']
    },
    features: {
      id: 'features',
      label: 'Features',
      icon: <Sparkles size={18} strokeWidth={1.75} />,
      children: ['fines', 'engage', 'chat']
    }
  }

  const getActiveGroup = () => {
    for (const group of Object.values(menuGroups)) {
      if (group.children.includes(activeTab)) {
        return group
      }
    }
    return null
  }

  const handleParentClick = (groupId) => {
    const group = menuGroups[groupId]
    if (!group) return
    const firstVisibleChild = group.children.find(id => visibleTabs.find(t => t.id === id))
    if (firstVisibleChild) {
      navigateToTab(firstVisibleChild)
    }
  }

  const renderMenu = () => {
    const mainItems = visibleTabs.filter(t => mainTabs.includes(t.id))
    const hrItems = visibleTabs.filter(t => hrTabs.includes(t.id))
    const featuresItems = visibleTabs.filter(t => featuresTabs.includes(t.id))
    const vehicleItem = visibleTabs.find(t => t.id === 'vehicle')
    const operationsItem = visibleTabs.find(t => t.id === 'operations')
    const portalItem = visibleTabs.find(t => t.id === 'portal')
    const settingsItem = visibleTabs.find(t => t.id === 'settings')
    const helpItem = visibleTabs.find(t => t.id === 'help')
    const accountantItem = visibleTabs.find(t => t.id === 'accountant')
    const salarySlipItem = visibleTabs.find(t => t.id === 'salary-slip')
    const approvalsItem = visibleTabs.find(t => t.id === 'approvals')
    const reportsChildren = visibleTabs.filter(t => ['attendance-reports', 'site-reports'].includes(t.id))
    const hrParent = hrItems.length > 0 ? menuGroups.hr : null
    const featuresParent = featuresItems.length > 0 ? menuGroups.features : null
    const reportsParentGroup = reportsChildren.length > 0 ? menuGroups.reports : null

    return (
      <>
        {mainItems.map(tab => renderMenuItem(tab, activeTab === tab.id, () => {
          if (tab.id === 'vehicle' && isAdmin) {
            setOperationsSubTab('vehicles')
            if (navigateToTab('operations')) setIsMobileMenuOpen(false)
            return
          }
          if (navigateToTab(tab.id)) setIsMobileMenuOpen(false)
        }))}

        {hrParent && (
          <div className="mt-1">
            {renderMenuItem({ id: hrParent.id, label: hrParent.label, icon: hrParent.icon }, hrItems.some(t => t.id === activeTab), () => { handleParentClick('hr'); setIsMobileMenuOpen(false) })}
          </div>
        )}

        {operationsItem && (
          <div className="mt-0.5">
            {renderMenuItem(operationsItem, activeTab === 'operations', () => { if (navigateToTab('operations')) setIsMobileMenuOpen(false) })}
          </div>
        )}

        {visibleTabs.find(t => t.id === 'tasks') && (
          <div className="mt-0.5">
            {renderMenuItem(visibleTabs.find(t => t.id === 'tasks'), activeTab === 'tasks', () => { if (navigateToTab('tasks')) setIsMobileMenuOpen(false) })}
          </div>
        )}

        <div className="sidebar-divider mt-auto" />

        <div className="pt-1 space-y-0.5">
          {accountantItem && renderMenuItem(accountantItem, activeTab === 'accountant', () => { if (navigateToTab('accountant')) setIsMobileMenuOpen(false) })}
          {salarySlipItem && renderMenuItem(salarySlipItem, activeTab === 'salary-slip', () => { if (navigateToTab('salary-slip')) setIsMobileMenuOpen(false) })}
          
          {reportsParentGroup && (
            <div>
              {renderMenuItem({ id: reportsParentGroup.id, label: reportsParentGroup.label, icon: reportsParentGroup.icon }, reportsChildren.some(t => t.id === activeTab), () => { handleParentClick('reports'); setIsMobileMenuOpen(false) })}
            </div>
          )}

          {approvalsItem && renderMenuItem(approvalsItem, activeTab === 'approvals', () => { if (navigateToTab('approvals')) setIsMobileMenuOpen(false) })}
          
          {settingsItem && renderMenuItem(settingsItem, activeTab === 'settings', () => { if (navigateToTab('settings')) setIsMobileMenuOpen(false) })}

          {featuresParent && (
            <div className="mt-1">
              {renderMenuItem({ id: featuresParent.id, label: featuresParent.label, icon: featuresParent.icon }, featuresItems.some(t => t.id === activeTab), () => { handleParentClick('features'); setIsMobileMenuOpen(false) })}
            </div>
          )}

          {portalItem && renderMenuItem(portalItem, activeTab === 'portal', () => { if (navigateToTab('portal')) setIsMobileMenuOpen(false) })}
          {helpItem && renderMenuItem(helpItem, activeTab === 'help', () => { if (navigateToTab('help')) setIsMobileMenuOpen(false) })}
        </div>
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
              <p className="text-sm text-gray-500 mb-6 leading-relaxed text-pretty">You don't have permission to access this module. Please contact your administrator.</p>
              <button 
                onClick={() => { navigateToTab('home') }}
                className="px-6 py-2.5 bg-gradient-to-r from-indigo-600 to-violet-600 text-white rounded-xl text-sm font-semibold hover:shadow-md hover:shadow-indigo-200 transition duration-200"
              >
                Go to Dashboard
              </button>
            </div>
          </div>
        )
      }
    }
    
    switch (activeTab) {
      case 'home': return <HomeTab onTabChange={(t) => { navigateToTab(t) }} />
      case 'attendance':
      case 'attendance-list': return <AttendanceTab defaultSubTab={attendanceSubTab} onSubTabChange={setAttendanceSubTab} onDirtyChange={setAttendanceDirty} onConfigAllowance={() => { if (navigateToTab('settings')) setSettingsSubTab('allowance') }} onOpenHolidaySettings={() => { if (navigateToTab('settings')) setSettingsSubTab('holidays') }} onReviewEmployees={() => navigateToTab('employees')} />
      case 'attendance-reports': return <AttendanceTab defaultSubTab="reports" onDirtyChange={setAttendanceDirty} onConfigAllowance={() => { if (navigateToTab('settings')) setSettingsSubTab('allowance') }} onOpenHolidaySettings={() => { if (navigateToTab('settings')) setSettingsSubTab('holidays') }} onReviewEmployees={() => navigateToTab('employees')} />
      case 'site-reports': return <SiteReportTab />
      case 'correction': return <CorrectionTab />
      case 'leave': return <LeaveTab />
      case 'approvals': return <ApprovalsTab />
      case 'letters': return <HRLettersTab />
      case 'vehicle': return isAdmin ? <OperationsTab initialSubTab="vehicles" /> : <EmployeeVehiclePortal employeeId={currentEmployee?.id || null} />
      case 'operations': return <OperationsTab initialSubTab={operationsSubTab} />
      case 'employees': return <EmployeesTab />
      case 'recruitment': return <RecruitmentTab />
      case 'documents': return <DocumentsTab />
      case 'accountant': return <AccountantTab />
      case 'salary-slip': return <SalarySlipTab defaultSummarySubTab={salarySubTab} defaultActiveTab={salaryActiveTab} onActiveTabChange={setSalaryActiveTab} />
      case 'advance':
      case 'expense': return <AdvanceExpenseTab activeModule={advanceSubTab} onModuleChange={setAdvanceSubTab} onDirtyChange={setAdvanceExpenseDirty} defaultModule={activeTab === 'expense' ? 'Add Expense' : 'Add Advance'} />
      case 'fines': return <FineTab />
      case 'engage': return <EngagementTab />
      case 'chat': return <ChatTab />
      case 'tasks': return <TasksTab defaultSubTab={tasksSubTab} />
      case 'portal': return <EmployeePortalTab portalSubTab={portalSubTab} />
      case 'settings': return <SettingsTab initialSubTab={settingsSubTab} />
      case 'help': return <HelpTab />
      default: return <EmployeePortalTab portalSubTab={portalSubTab} />
    }
  }

  if (authLoading || (user?.orgId && empLoading)) {
    return (
      <div className="min-h-screen bg-white flex flex-col items-center justify-center p-4">
        <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-indigo-600 to-violet-600 mb-6 flex items-center justify-center shadow-lg shadow-indigo-200 animate-pulse">
          <span className="text-white text-3xl font-bold">H</span>
        </div>
        <div className="w-12 h-12 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin mb-4"></div>
        <p className="text-gray-600 font-semibold uppercase tracking-wider text-xs">Synchronizing Dashboard...</p>
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
    <div className="h-screen bg-white flex flex-col overflow-hidden">
      {showLog && <ActivityLogSidebar orgId={user?.orgId} onClose={() => setShowLog(false)} />}

      <header className="fixed top-0 left-0 right-0 z-[60] bg-white/80 backdrop-blur-md border-b border-gray-200/80 h-14 shrink-0 px-4 flex items-center justify-between shadow-sm">
        <div className="flex items-center gap-3">
          <button onClick={() => setIsMobileMenuOpen(true)} className="p-2 hover:bg-indigo-50 rounded-xl text-gray-500 hover:text-indigo-600 md:hidden transition duration-200"><Menu size={18} /></button>
          <div className="flex items-center gap-2.5">
            {orgSettings?.logoURL && !logoError ? (
              <img 
                src={orgSettings.logoURL} 
                alt="Logo" 
                className="w-8 h-8 rounded-xl object-cover shadow-sm ring-2 ring-gray-100"
                onError={() => setLogoError(true)} 
              />
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
              { label: 'Add Attendance', tab: 'attendance-list', tooltip: 'New entry?', icon: <Calendar size={14} />, module: 'Attendance', right: 'create' },
              { label: 'Expense', tab: 'advance', tooltip: 'New request?', icon: <Wallet size={14} />, module: 'AdvanceExpense', right: 'create' },
              { label: 'Full Summary', tab: 'attendance-list', attendanceSubTab: 'grid', tooltip: 'View monthly breakdown?', icon: <BarChart3 size={14} />, module: 'Attendance', right: 'view' },
              { label: 'Daily Checklist', tab: 'tasks', tasksSubTab: 'checklist', tooltip: 'Track daily checklist?', icon: <CheckCircle2 size={14} />, module: 'Tasks', right: 'view' },
            ].filter(action => {
              if (isAdmin) return true
              if (visibleTabIds.includes(action.tab)) return true
              if (action.module === 'Employees') return userPerms['Employees']?.create === true || userPerms['Settings']?.create === true
              const modulePerms = userPerms[action.module] || {}
              return modulePerms[action.right] === true || modulePerms.view === true || modulePerms.read === true
            })
            if (quickActions.length === 0) return null
            return (
              <div className="hidden lg:flex items-center gap-2.5 ml-8 pl-8 border-l border-gray-200/80">
                {quickActions.map(item => {
                  const isActive = activeTab === item.tab &&
                    (item.tab !== 'attendance-list' || !item.attendanceSubTab || attendanceSubTab === item.attendanceSubTab) &&
                    (item.tab !== 'salary-slip' || !item.salaryActiveTab || salaryActiveTab === item.salaryActiveTab) &&
                    (item.tab !== 'tasks' || !item.tasksSubTab || tasksSubTab === item.tasksSubTab)

                  return (
                    <div key={item.label} className="relative group">
                      <button 
                        onClick={() => { 
                          if (!navigateToTab(item.tab)) return
                          if (item.tab === 'attendance-list' && item.attendanceSubTab) setAttendanceSubTab(item.attendanceSubTab);
                          if (item.tab === 'salary-slip' && item.salaryActiveTab) setSalaryActiveTab(item.salaryActiveTab); 
                          if (item.tab === 'salary-slip' && item.salarySubTab) setSalarySubTab(item.salarySubTab); 
                          if (item.tab === 'tasks' && item.tasksSubTab) setTasksSubTab(item.tasksSubTab) 
                        }} 
                        className={`px-3.5 h-8.5 rounded-lg text-[13px] font-semibold whitespace-nowrap hover:scale-105 active:scale-[0.98] transition duration-150 flex items-center gap-1.5 cursor-pointer ${
                          isActive
                            ? 'bg-indigo-50 text-indigo-700 shadow-sm border border-indigo-100/50' 
                            : 'bg-white text-zinc-600 hover:bg-zinc-50 border border-zinc-200/60 shadow-sm'
                        }`}
                      >
                        <span className={isActive ? 'text-indigo-600' : 'text-zinc-400'}>
                          {item.icon}
                        </span>
                        {item.label}
                      </button>
                      
                      <div className="absolute top-full left-1/2 -translate-x-1/2 mt-2 invisible group-hover:visible opacity-0 scale-95 origin-top group-hover:opacity-100 group-hover:scale-100 transition duration-150 bg-zinc-950 text-white text-[11px] font-semibold py-1.5 px-3 rounded-lg shadow-md whitespace-nowrap z-50 pointer-events-none flex flex-col items-center">
                        <span className="text-zinc-400 text-[9px] uppercase tracking-wider font-bold mb-0.5">{item.label}</span>
                        <span>{item.tooltip}</span>
                        {/* Arrow */}
                        <div className="absolute bottom-full left-1/2 -translate-x-1/2 border-4 border-transparent border-b-zinc-950" />
                      </div>
                    </div>
                  )
                })}
              </div>
            )
          })()}
        </div>

        <div className="flex items-center gap-4">
          {/* Organization Switcher - Only show if user has organizations */}
          {user?.orgId && <OrganizationSwitcher />}
          <div className="h-6 w-px bg-gray-200 hidden sm:block"></div>
          
          <button 
            onClick={() => { if (navigateToTab('portal')) setPortalSubTab('profile') }} 
            title="Profile" 
            className="hidden sm:flex items-center gap-2.5 p-1.5 px-2.5 bg-slate-100/80 hover:bg-slate-100 border border-slate-200/60 rounded-xl transition-colors group cursor-pointer"
          >
            {(currentEmployee?.photoURL || user?.photoURL) ? (
              <img src={currentEmployee?.photoURL || user?.photoURL} alt="Profile" className="w-7 h-7 rounded-full object-cover shadow-2xs border border-white" />
            ) : (
              <div className="w-7 h-7 rounded-full bg-blue-600 text-white font-bold flex items-center justify-center text-xs shadow-2xs">{getInitials(user?.name)}</div>
            )}
            <div className="flex flex-col items-start text-left min-w-0">
              <span className="text-xs font-medium text-slate-900 leading-tight group-hover:text-blue-600 transition-colors truncate max-w-[120px]">
                {user?.name?.split(' ').map((n, i) => i === 0 ? n.charAt(0).toUpperCase() + n.slice(1).toLowerCase() : n.toLowerCase()).join(' ')}
              </span>
              <span className="text-[11px] text-slate-500 truncate max-w-[120px]">{user?.email || user?.role || 'Staff'}</span>
            </div>
          </button>
          <div className="h-6 w-px bg-gray-200 hidden sm:block"></div>
          <button onClick={() => setShowLog(s => !s)} title="Activity Log" className={`p-2.5 rounded-md transition-colors ${showLog ? 'bg-indigo-100 text-indigo-600' : 'text-gray-500 hover:text-indigo-600 hover:bg-indigo-50'}`}><History size={16} /></button>
          <button onClick={logout} title="Logout" className="p-2.5 text-gray-500 hover:text-red-600 hover:bg-red-50 rounded-md transition-colors"><LogOut size={16} /></button>
        </div>
      </header>

      <div className="flex flex-1 min-h-0 overflow-hidden relative mt-14">
        {/* Global Sidebar Tooltip Layer */}
        {isCollapsed && hoveredTooltip && (
          <div 
            className="absolute left-[72px] z-[100] pointer-events-none"
            style={{ top: tooltipTop }}
          >
            <div className="bg-zinc-900 text-white text-[12px] font-medium px-2.5 py-1.5 rounded-lg shadow-xl whitespace-nowrap border border-zinc-800 -translate-y-1/2 ml-2 animate-in fade-in slide-in-from-left-2 duration-200">
              {hoveredTooltip}
            </div>
          </div>
        )}
        {isMobileMenuOpen && (
          <div 
            className="fixed inset-0 bg-black/50 z-50 md:hidden transition-opacity duration-300" 
            onClick={() => setIsMobileMenuOpen(false)} 
          />
        )}
        <aside 
          className={`bg-[#ffffff] border-r border-slate-200 flex flex-col shrink-0 fixed inset-y-0 left-0 z-50 md:relative md:h-full md:z-30 transition-all duration-300 ${isMobileMenuOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'} ${isCollapsed ? 'md:w-16' : 'md:w-56'} w-56`}
          style={{ backgroundColor: '#ffffff' }}
        >
          {/* Mobile-only close button header */}
          <div className="md:hidden p-4 flex items-center justify-end border-b border-slate-200 h-14 shrink-0 bg-[#ffffff]">
            <button 
              onClick={() => setIsMobileMenuOpen(false)} 
              className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100 transition-colors"
            >
              <X size={18} />
            </button>
          </div>

          {/* Nav Items */}
          <nav className="flex-1 p-2 space-y-0.5 overflow-y-auto no-scrollbar bg-[#ffffff]" style={{ backgroundColor: '#ffffff' }}>
            {renderMenu()}
          </nav>

          {/* Collapse sidebar button */}
          <div className="p-2 border-t border-slate-200 shrink-0 hidden md:block">
            <button
              onClick={() => toggleSidebar()}
              title={isCollapsed ? "Expand Sidebar" : "Collapse Sidebar"}
              className={`flex items-center gap-2 h-9 w-full rounded-xl text-slate-500 hover:text-blue-600 hover:bg-blue-50 transition duration-150 cursor-pointer ${
                isCollapsed ? 'justify-center px-0' : 'px-3'
              }`}
            >
              {isCollapsed ? <ChevronRight size={18} /> : <ChevronLeft size={18} />}
              {!isCollapsed && <span className="text-xs font-semibold">Collapse Sidebar</span>}
            </button>
          </div>
        </aside>
        <div className="flex-1 flex flex-col min-w-0 bg-white">
          <main className="flex-1 overflow-auto bg-white relative flex flex-col">
            <ErrorBoundary>
                {(() => {
                  const activeGroup = getActiveGroup()
                  if (activeGroup) {
                    return (
                      <div className="w-full border-b border-gray-200 bg-white/80 backdrop-blur-md shrink-0">
                        <div className="flex items-center gap-1 px-4 overflow-x-auto no-scrollbar">
                          {activeGroup.children.map(childId => {
                            const childTab = visibleTabs.find(t => t.id === childId)
                            if (!childTab) return null
                            const isActive = activeTab === childId
                            return (
                              <button
                                key={childId}
                                onClick={() => navigateToTab(childId)}
                                className={`px-4 py-2.5 text-sm font-semibold whitespace-nowrap border-b-2 transition-colors duration-150 ${
                                  isActive
                                    ? 'border-blue-600 text-blue-700'
                                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                                }`}
                              >
                                {childTab.label}
                              </button>
                            )
                          })}
                        </div>
                      </div>
                    )
                  }
                  const activeTabData = visibleTabs.find(t => t.id === activeTab)
                  if (activeTabData && activeTab !== 'operations') {
                    if (activeTab === 'attendance' || activeTab === 'attendance-list') {
                      return (
                        <div className="w-full border-b border-gray-200 bg-white/80 backdrop-blur-md shrink-0">
                          <div className="flex items-center gap-1 px-4 max-w-[1300px] mx-auto overflow-x-auto no-scrollbar">
                            <button
                              onClick={() => setAttendanceSubTab('attendance')}
                              className={`px-4 py-2.5 text-sm font-semibold whitespace-nowrap border-b-2 transition-colors duration-150 ${
                                attendanceSubTab === 'attendance'
                                  ? 'border-blue-600 text-blue-700'
                                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                              }`}
                            >
                              Attendance
                            </button>
                            <button
                              onClick={() => setAttendanceSubTab('grid')}
                              className={`px-4 py-2.5 text-sm font-semibold whitespace-nowrap border-b-2 transition-colors duration-150 ${
                                attendanceSubTab === 'grid'
                                  ? 'border-blue-600 text-blue-700'
                                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                              }`}
                            >
                              Attendance Register
                            </button>
                            <button
                              onClick={() => setAttendanceSubTab('monthly-summary')}
                              className={`px-4 py-2.5 text-sm font-semibold whitespace-nowrap border-b-2 transition-colors duration-150 ${
                                attendanceSubTab === 'monthly-summary'
                                  ? 'border-blue-600 text-blue-700'
                                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                              }`}
                            >
                              Monthly Summary
                            </button>
                          </div>
                        </div>
                      )
                    }
                    if (activeTab === 'advance' || activeTab === 'expense') {
                      const advanceModules = ['Add Advance', 'Add Expense', 'Cash Summary', 'Reports']
                      return (
                        <div className="w-full border-b border-gray-200 bg-white/80 backdrop-blur-md shrink-0">
                          <div className="flex items-center gap-1 px-4 max-w-[1300px] mx-auto overflow-x-auto no-scrollbar">
                            {advanceModules.map(mod => {
                              const isActive = advanceSubTab === mod
                              return (
                                <button
                                  key={mod}
                                  onClick={() => setAdvanceSubTab(mod)}
                                  className={`px-4 py-2.5 text-sm font-semibold whitespace-nowrap border-b-2 transition-colors duration-150 ${
                                    isActive
                                      ? 'border-blue-600 text-blue-700'
                                      : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                                  }`}
                                >
                                  {mod}
                                </button>
                              )
                            })}
                          </div>
                        </div>
                      )
                    }
                    return (
                      <div className="w-full border-b border-gray-200 bg-white/80 backdrop-blur-md shrink-0">
                        <div className="flex items-center px-4 max-w-[1300px] mx-auto">
                          <span className="px-4 py-2.5 text-sm font-semibold text-gray-700 border-b-2 border-blue-600">
                            {activeTabData.label}
                          </span>
                        </div>
                      </div>
                    )
                  }
                  return null
                })()}
                <div className={`module-content-frame w-full flex-1 p-4 ${activeTab === 'salary-slip' ? 'max-w-none' : 'max-w-[1300px] mx-auto'}`}>
                  {renderTabContent()}
                </div>
              </ErrorBoundary>
          </main>
        </div>
      </div>
    </div>
  )
}
