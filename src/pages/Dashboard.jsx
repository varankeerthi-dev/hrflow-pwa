import { useState, useEffect, useMemo, Component } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import { useEmployees } from '../hooks/useEmployees'
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
import ShiftPlanningTab from '../components/tabs/ShiftPlanningTab'
import LeaveTab from '../components/tabs/LeaveTab'
import HRLettersTab from '../components/tabs/HRLettersTab'
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

  const isAdmin = user?.role === 'admin'
  const hasOrg = !!user?.orgId

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
          <button
            onClick={onLogout}
            className="w-full flex items-center justify-center gap-2 text-gray-400 hover:text-gray-600 transition-colors py-2 uppercase text-[10px] font-bold tracking-widest font-inter"
          >
            <LogOut size={14} />
            <span>Back to login</span>
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Dashboard ────────────────────────────────────────────────────────────────
export default function Dashboard() {
  const { user, logout, joinOrganisation, createOrganisation } = useAuth()
  const { employees } = useEmployees(user?.orgId)
  const [activeTab, setActiveTab] = useState('home')
  const [isCollapsed, setIsCollapsed] = useState(false)
  const [rolePermissions, setRolePermissions] = useState(null)
  const [expandedGroups, setExpandedGroups] = useState(['main']) // Default expand Main group
  const [showLog, setShowLog] = useState(false)
  const [orgSettings, setOrgSettings] = useState({})

  // Load Inter and Roboto fonts
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
    return employees.find(e => e.email === user.email || e.id === user.uid) || employees[0]
  }, [employees, user])

  useEffect(() => {
    if (!user?.orgId) return
    getDoc(doc(db, 'organisations', user.orgId)).then(snap => {
      if (snap.exists()) setOrgSettings(snap.data())
    })
  }, [user?.orgId])

  useEffect(() => {
    if (!user?.orgId || !user?.role) return
    
    // Use cached permissions if available (from login)
    if (user.permissions && Object.keys(user.permissions).length > 0) {
      setRolePermissions(user.permissions)
      return
    }
    
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
  }, [user?.orgId, user?.role, user?.permissions])

  const allTabs = useMemo(() => [
    { id: 'home', label: 'Dashboard', icon: <LayoutDashboard size={18} strokeWidth={1.75} />, module: 'Attendance' },
    { id: 'attendance', label: 'Attendance Records', icon: <Calendar size={18} strokeWidth={1.75} />, module: 'Attendance' },
    
    { id: 'attendance-list', label: 'Attendance', icon: <Calendar size={18} strokeWidth={1.75} />, module: 'Attendance' },
    { id: 'correction', label: 'Corrections', icon: <PencilLine size={18} strokeWidth={1.75} />, module: 'Correction' },
    { id: 'leave', label: 'Leave', icon: <Mail size={18} strokeWidth={1.75} />, module: 'Leave' },
    { id: 'approvals', label: 'Approvals', icon: <CheckCircle2 size={18} strokeWidth={1.75} />, badge: '!', module: 'Approvals' },
    { id: 'letters', label: 'HR Letters', icon: <FileText size={18} strokeWidth={1.75} />, module: 'HRLetters' },
    { id: 'summary', label: 'Summary', icon: <BarChart3 size={18} strokeWidth={1.75} />, module: 'Summary' },

    { id: 'salary-slip', label: 'Salary Slip', icon: <Wallet size={18} strokeWidth={1.75} />, module: 'SalarySlip' },
    { id: 'advance', label: 'Advances', icon: <Wallet size={18} strokeWidth={1.75} />, module: 'AdvanceExpense' },
    { id: 'fines', label: 'Fines', icon: <Gavel size={18} strokeWidth={1.75} />, module: 'Fine' },

    { id: 'engage', label: 'Engage', icon: <Handshake size={18} strokeWidth={1.75} />, module: 'Engagement' },
    { id: 'shift-planning', label: 'Shift Planning', icon: <Calendar size={18} strokeWidth={1.75} />, module: 'ShiftPlanning' },
    
    { id: 'portal', label: 'My Portal', icon: <User size={18} strokeWidth={1.75} />, module: 'EmployeePortal' },
    { id: 'settings', label: 'Settings', icon: <Settings size={18} strokeWidth={1.75} />, module: 'Settings' },
  ], [])

  const sections = useMemo(() => [
    { title: 'MAIN', tabs: ['home'] },
    { title: 'HR', tabs: ['attendance-list', 'correction', 'leave', 'approvals', 'letters', 'summary'] },
    { title: 'PAYROLL', tabs: ['salary-slip', 'advance', 'fines'] },
    { title: 'WORKFORCE', tabs: ['engage', 'shift-planning'] },
    { title: 'ACCOUNT', tabs: ['portal', 'settings'] }
  ], []);

  // Filter tabs based on role permissions
  const tabs = useMemo(() => {
    if (!rolePermissions && user?.role !== 'admin') return allTabs.filter(t => t.id === 'portal')
    if (user?.role === 'admin') return allTabs
    return allTabs.filter(t => rolePermissions[t.module]?.view || rolePermissions[t.module]?.full)
  }, [rolePermissions, user?.role, allTabs])

  const renderTabContent = () => {
    switch (activeTab) {
      case 'home': return <HomeTab />
      case 'attendance':
      case 'attendance-list': return <AttendanceTab />
      case 'correction': return <CorrectionTab />
      case 'leave': return <LeaveTab />
      case 'approvals': return <ApprovalsTab />
      case 'letters': return <HRLettersTab />
      case 'summary': return <SummaryTab />
      case 'salary-slip': return <SalarySlipTab />
      case 'advance': return <AdvanceExpenseTab />
      case 'fines': return <FineTab />
      case 'engage': return <EngagementTab />
      case 'shift-planning': return <ShiftPlanningTab />
      case 'portal': return <EmployeePortalTab />
      case 'settings': return <SettingsTab />
      default: return <EmployeePortalTab />
    }
  }

  return (
    <div className="min-h-screen bg-white flex flex-col font-inter">
      {user && !user.orgId && <OrgSetupModal user={user} onJoin={joinOrganisation} onCreate={createOrganisation} onLogout={logout} />}
      {showLog && <ActivityLogSidebar orgId={user?.orgId} onClose={() => setShowLog(false)} />}

      <header className="sticky top-0 z-40 bg-white border-b border-gray-200 shadow-none h-14 shrink-0">
        <div className="max-w-full mx-auto px-4 h-full flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button onClick={() => setIsCollapsed(!isCollapsed)} className="p-1.5 hover:bg-gray-100 rounded-md text-gray-500 hidden md:block transition-all transition-colors"><PanelLeft size={18} /></button>
            <div className="flex items-center gap-2">
              {orgSettings?.logoURL ? (
                <img src={orgSettings.logoURL} alt="Logo" className="w-8 h-8 rounded-lg object-cover shadow-sm" />
              ) : (
                <div className="w-8 h-8 rounded-lg bg-gray-900 flex items-center justify-center shadow-sm text-white"><Building2 size={16} /></div>
              )}
              <span className="text-md font-black text-gray-900 tracking-tight">{orgSettings?.name || user?.orgName || 'HRFlow'}</span>
            </div>
            
            {/* Quick Access Bar - moved to header */}
            {(() => {
              const quickActions = [
                { label: 'Create Attendance', tab: 'attendance', icon: <Calendar size={15} />, module: 'Attendance', right: 'create' },
                { label: 'Add Employee', tab: 'settings', icon: <Users size={15} />, module: 'Employees', right: 'create' },
                { label: 'Add Expense', tab: 'advance', icon: <Wallet size={15} />, module: 'AdvanceExpense', right: 'create' },
                { label: 'Make Correction', tab: 'correction', icon: <PencilLine size={15} />, module: 'Correction', right: 'create' },
                { label: 'Full Summary', tab: 'summary', icon: <BarChart3 size={15} />, module: 'Summary', right: 'view' },
              ].filter(item => {
                if (user?.role === 'admin') return true
                if (!rolePermissions) return false
                return rolePermissions[item.module]?.[item.right] || rolePermissions[item.module]?.full
              })

              if (quickActions.length === 0) return null

              return (
                <div className="hidden lg:flex items-center gap-2 ml-8 pl-8 border-l border-gray-200">
                  {quickActions.map(item => (
                    <button
                      key={item.tab}
                      onClick={() => setActiveTab(item.tab)}
                      className={`flex items-center gap-1.5 px-3 h-8 rounded-md border text-[11px] font-medium whitespace-nowrap transition-all ${activeTab === item.tab
                        ? 'bg-gray-100 border-gray-400 text-gray-800'
                        : 'bg-white border-gray-200 text-gray-500 hover:border-gray-300 hover:text-gray-700 hover:bg-gray-50'
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
            <div className="hidden sm:flex flex-col items-end text-right">
              <span className="text-[13px] font-bold text-gray-800 tracking-tight">{user?.name}</span>
              <span className="text-[10px] text-gray-400 font-medium uppercase tracking-widest">{user?.role || 'Staff'}</span>
            </div>
            {currentEmployee?.photoURL ? (
              <img 
                src={currentEmployee.photoURL} 
                alt="Profile" 
                className="w-8 h-8 rounded-full object-cover shadow-sm border border-gray-100"
              />
            ) : (
              <div className="w-8 h-8 rounded-full flex items-center justify-center text-white text-[10px] font-bold shadow-sm border border-gray-100" style={{ backgroundColor: getAvatarColor(user?.uid) }}>{getInitials(user?.name)}</div>
            )}
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
        {/* Compact Zo Computer Style Sidebar */}
        <aside 
          className={`bg-[#fafafa] border-r border-gray-200 hidden md:flex flex-col shrink-0 transition-all duration-200 ${isCollapsed ? 'w-[56px]' : 'w-[200px]'}`}
        >
          <nav className="flex-1 py-2 space-y-0.5 overflow-hidden">
            {[
              {
                id: 'main',
                label: 'Main',
                items: allTabs.filter(t => ['home'].includes(t.id))
              },
              {
                id: 'hr',
                label: 'HR',
                items: allTabs.filter(t => ['attendance-list', 'correction', 'leave', 'approvals', 'letters', 'summary'].includes(t.id))
              },
              {
                id: 'payroll',
                label: 'Payroll',
                items: allTabs.filter(t => ['salary-slip', 'advance', 'fines'].includes(t.id))
              },
              {
                id: 'workforce',
                label: 'Workforce',
                items: allTabs.filter(t => ['engage', 'shift-planning'].includes(t.id))
              },
              {
                id: 'account',
                label: 'Account',
                items: allTabs.filter(t => ['portal', 'settings'].includes(t.id))
              }
            ].map(group => {
              // Check if any item in this group is visible to user
              const visibleItems = group.items.filter(item => {
                if (user?.role === 'admin') return true
                if (!rolePermissions) return item.id === 'portal'
                return rolePermissions[item.module]?.view || rolePermissions[item.module]?.full
              })
              
              if (visibleItems.length === 0) return null
              
              // Check if any item in this group is active
              const isGroupActive = visibleItems.some(item => item.id === activeTab)
              
              return (
                <div key={group.id} className="px-2">
                  {/* Section Header - Collapsible */}
                  {!isCollapsed && (
                    <button
                      onClick={() => setExpandedGroups(prev => 
                        prev.includes(group.id) 
                          ? prev.filter(g => g !== group.id)
                          : [...prev, group.id]
                      )}
                      className={`w-full flex items-center justify-between px-2 py-1.5 text-[10px] font-semibold uppercase tracking-wider transition-colors ${
                        isGroupActive ? 'text-gray-900' : 'text-gray-400 hover:text-gray-600'
                      }`}
                    >
                      <span>{group.label}</span>
                      <ChevronRight 
                        size={12} 
                        className={`transition-transform duration-150 ${expandedGroups.includes(group.id) ? 'rotate-90' : ''}`}
                      />
                    </button>
                  )}
                  
                  {/* Section Items */}
                  <div className={`space-y-0.5 ${!isCollapsed && !expandedGroups.includes(group.id) && !isGroupActive ? 'hidden' : ''}`}>
                    {visibleItems.map(item => {
                      const isActive = activeTab === item.id
                      return (
                        <button
                          key={item.id}
                          onClick={() => setActiveTab(item.id)}
                          title={isCollapsed ? item.label : ''}
                          className={`w-full flex items-center h-7 rounded-md transition-all duration-150 ${
                            isCollapsed ? 'justify-center px-0' : 'px-2 gap-2'
                          } ${
                            isActive 
                              ? 'bg-white text-gray-900 shadow-sm ring-1 ring-gray-200' 
                              : 'text-gray-500 hover:bg-gray-100 hover:text-gray-700'
                          }`}
                        >
                          <span className={`shrink-0 ${isActive ? 'text-gray-700' : 'text-gray-400'}`}>
                            {React.cloneElement(item.icon, { size: 16 })}
                          </span>
                          {!isCollapsed && (
                            <span className="flex-1 text-left text-[12px] truncate font-medium">
                              {item.label}
                            </span>
                          )}
                          {item.badge && (
                            <span className={`shrink-0 bg-red-500 text-white text-[9px] font-bold min-w-[14px] h-[14px] rounded-full flex items-center justify-center ${isCollapsed ? 'absolute -top-0.5 -right-0.5' : ''}`}>
                              {item.badge}
                            </span>
                          )}
                        </button>
                      )
                    })}
                  </div>
                </div>
              )
            })}
          </nav>

          {/* Collapse Toggle */}
          <div className="p-2 border-t border-gray-200">
            <button 
              onClick={() => setIsCollapsed(!isCollapsed)}
              className={`w-full flex items-center h-7 rounded-md text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition-all ${isCollapsed ? 'justify-center px-0' : 'px-2 gap-2'}`}
            >
              <PanelLeft size={16} className={isCollapsed ? 'rotate-180' : ''} />
              {!isCollapsed && <span className="text-[12px] font-medium">Collapse</span>}
            </button>
          </div>
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

          <main className="flex-1 overflow-auto p-6 bg-[#f9fafb]/30">
            <div className="max-w-7xl mx-auto h-full flex flex-col">
              {renderTabContent()}
            </div>
          </main>
        </div>
      </div>
    </div>
  )
}
