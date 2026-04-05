import React, { useState, useEffect, useMemo } from 'react'
import { useAuth } from '../hooks/useAuth'
import { useEmployees } from '../hooks/useEmployees'
import { db } from '../lib/firebase'
import { isEmployeeActiveStatus } from '../lib/employeeStatus'
import { doc, getDoc, collection, getDocs, addDoc, query, where, orderBy, limit, onSnapshot } from 'firebase/firestore'
import {
  Calendar,
  PencilLine,
  BarChart3,
  Briefcase,
  Folder,
  Users,
  User,
  LogOut,
  LayoutDashboard,
  Building2,
  Clock,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Plus,
  ChevronLeft,
  ChevronRight,
  Save,
  X,
  Fingerprint,
  Mail,
  FileText,
  Wallet,
  Gavel,
  Handshake,
  Settings,
  CheckCircle,
  XOctagon,
  ArrowLeft,
  Menu,
  MessageSquare,
  Car
} from 'lucide-react'

import HomeTab from '../components/tabs/HomeTab'
import AttendanceTab from '../components/tabs/AttendanceTab'
import CorrectionTab from '../components/tabs/CorrectionTab'
import LeaveTab from '../components/tabs/LeaveTab'
import ApprovalsTab from '../components/tabs/ApprovalsTab'
import HRLettersTab from '../components/tabs/HRLettersTab'
import DocumentsTab from '../components/tabs/DocumentsTab'
import SummaryTab from '../components/tabs/SummaryTab'
import SalarySlipTab from '../components/tabs/SalarySlipTab'
import AdvanceExpenseTab from '../components/tabs/AdvanceExpenseTab'
import FineTab from '../components/tabs/FineTab'
import EngagementTab from '../components/tabs/EngagementTab'
import ShiftPlanningTab from '../components/tabs/ShiftPlanningTab'
import EmployeePortalTab from '../components/tabs/EmployeePortalTab'
import SettingsTab from '../components/tabs/SettingsTab'
import ChatTab from '../components/tabs/ChatTab'
import VehicleManagementTab from '../components/tabs/VehicleManagementTab'
import MobileTasksView from './MobileTasksView'
import MobileEmployeePortal from './MobileEmployeePortal'
import Badge from '../components/ui/Badge'

// ─── Org Setup Modal ────────
function OrgSetupModal({ user, onJoin, onCreate, onLogout }) {
  const [modalTab, setModalTab] = useState('join')
  const [orgCode, setOrgCode] = useState('')
  const [orgName, setOrgName] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [createdCode, setCreatedCode] = useState(null)

  const isAdmin = user?.role?.toLowerCase() === 'admin'
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
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-sm p-8 mx-4 border border-gray-100">
        <div className="flex flex-col items-center mb-6">
          <div className="w-16 h-16 rounded-xl bg-gradient-to-br from-indigo-600 to-purple-600 flex items-center justify-center mb-4 shadow-xl">
            <span className="text-white text-3xl">🏢</span>
          </div>
          <h2 className="text-xl font-bold text-gray-800 uppercase tracking-tight">Organization Setup</h2>
          <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest text-center mt-2">
            {hasOrg && isAdmin ? 'Create New Division' : 'Join a Team or Create Your Own'}
          </p>
        </div>

        {!(hasOrg && isAdmin) && (
          <div className="flex bg-gray-100 rounded-lg p-1 mb-6">
            <button onClick={() => { setModalTab('join'); setError('') }}
              className={`flex-1 py-2 rounded-lg text-[10px] font-bold uppercase tracking-widest transition-all ${modalTab === 'join' ? 'bg-white shadow-sm text-indigo-600' : 'text-gray-400'}`}>
              Join Team
            </button>
            <button onClick={() => { setModalTab('create'); setError('') }}
              className={`flex-1 py-2 rounded-lg text-[10px] font-bold uppercase tracking-widest transition-all ${modalTab === 'create' ? 'bg-white shadow-sm text-indigo-600' : 'text-gray-400'}`}>
              Create Org
            </button>
          </div>
        )}

        {error && <div className="bg-red-50 border border-red-100 text-red-600 px-4 py-2 rounded-lg text-[10px] font-bold mb-4 uppercase text-center">{error}</div>}

        {createdCode ? (
          <div className="space-y-4">
            <div className="bg-green-50 border border-green-100 rounded-xl p-5 text-center">
              <p className="text-[10px] text-green-700 font-bold uppercase tracking-widest mb-3">Organization Online! 🎉</p>
              <div className="bg-white border border-green-200 rounded-lg px-4 py-3 font-mono font-bold tracking-widest text-lg select-all shadow-inner">{createdCode}</div>
              <p className="text-[9px] text-gray-400 font-bold uppercase mt-3 tracking-tighter italic">Share this code with your employees</p>
            </div>
            <button onClick={() => window.location.reload()} className="w-full bg-indigo-600 text-white font-bold py-3 rounded-lg shadow-xl uppercase text-[10px] tracking-widest">Get Started</button>
          </div>
        ) : modalTab === 'join' ? (
          <form onSubmit={handleJoin} className="space-y-4">
            <input value={orgCode} onChange={e => setOrgCode(e.target.value)} placeholder="ENTER ORG CODE" className="w-full border border-gray-200 rounded-lg h-[42px] px-4 py-3 focus:ring-2 focus:ring-indigo-500 outline-none text-xs font-bold tracking-widest bg-gray-50" />
            <button type="submit" disabled={loading} className="w-full h-[40px] bg-indigo-600 text-white font-bold rounded-lg shadow-xl transition-all disabled:opacity-50 uppercase text-[10px] tracking-widest">{loading ? 'Verifying...' : 'Join Organization'}</button>
          </form>
        ) : (
          <form onSubmit={handleCreate} className="space-y-4">
            <input value={orgName} onChange={e => setOrgName(e.target.value)} placeholder="BUSINESS NAME" className="w-full border border-gray-200 rounded-lg h-[42px] px-4 py-3 focus:ring-2 focus:ring-indigo-500 outline-none text-xs font-bold uppercase tracking-widest bg-gray-50" />
            <button type="submit" disabled={loading} className="w-full h-[40px] bg-indigo-600 text-white font-bold rounded-lg shadow-xl transition-all disabled:opacity-50 uppercase text-[10px] tracking-widest">{loading ? 'Creating...' : 'Initialize Org'}</button>
          </form>
        )}

        <div className="mt-6 pt-4 border-t border-gray-100">
          <button
            onClick={onLogout}
            className="w-full flex items-center justify-center gap-2 text-gray-400 hover:text-gray-600 transition-colors py-2 uppercase text-[10px] font-bold tracking-widest"
          >
            <LogOut size={14} />
            <span>Back to login</span>
          </button>
        </div>
      </div>
    </div>
  )
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

function StatCard({ icon, label, value, color }) {
  return (
    <div className="bg-white rounded-xl p-3 shadow-sm border border-gray-100">
      <div className={`w-8 h-8 rounded-lg flex items-center justify-center mb-2 ${color}`}>
        {icon}
      </div>
      <p className="text-xl font-bold text-gray-900">{value}</p>
      <p className="text-xs text-gray-500 font-medium">{label}</p>
    </div>
  )
}

function MenuCard({ icon, label, onClick, color }) {
  return (
    <button 
      onClick={onClick}
      className="bg-white rounded-xl p-3 shadow-sm border border-gray-100 flex flex-col items-center justify-center gap-1 active:scale-95 transition-transform"
    >
      <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${color}`}>
        {icon}
      </div>
      <span className="text-[10px] font-bold text-gray-700 text-center">{label}</span>
    </button>
  )
}

export default function MobileDashboard() {
  const { user, logout, joinOrganisation, createOrganisation, loading: authLoading } = useAuth()
  
  // Requirement: Delay employee lookup until auth user and orgId are available
  const canFetchEmployees = user && !!user.orgId
  const { employees, loading: empLoading } = useEmployees(canFetchEmployees ? user.orgId : null)
  
  const [orgSettings, setOrgSettings] = useState({})
  const [stats, setStats] = useState({
    totalEmployees: 0,
    presentToday: 0,
    absentToday: 0,
    pendingCorrections: 0
  })
  const [activeTab, setActiveTab] = useState('attendance')
  const [showMenu, setShowMenu] = useState(false)
  const [loading, setLoading] = useState(false)
  const [rolePermissions, setRolePermissions] = useState(null)
  
  // Real-time unread counts
  const [unreadChatCount, setUnreadChatCount] = useState(0)
  const [pendingTaskCount, setPendingTaskCount] = useState(0)

  // Chat unread listener
  useEffect(() => {
    if (!user?.orgId || !user?.uid) return
    const q = query(
      collection(db, 'organisations', user.orgId, 'chats'),
      where('participantIds', 'array-contains', user.uid)
    )
    const unsubscribe = onSnapshot(q, (snapshot) => {
      let count = 0
      snapshot.docs.forEach(doc => {
        const data = doc.data()
        count += (data.unreadCount?.[user.uid] || 0)
      })
      setUnreadChatCount(count)
    })
    return () => unsubscribe()
  }, [user?.orgId, user?.uid])

  // Task pending listener (Assigned to me and not completed)
  useEffect(() => {
    if (!user?.orgId || !user?.uid) return
    const q = query(
      collection(db, 'organisations', user.orgId, 'tasks'),
      where('assignedTo', 'array-contains', user.uid),
      where('status', '!=', 'Completed')
    )
    const unsubscribe = onSnapshot(q, (snapshot) => {
      setPendingTaskCount(snapshot.size)
    })
    return () => unsubscribe()
  }, [user?.orgId, user?.uid])

  const currentEmployee = useMemo(() => {
    if (!employees.length || !user?.email) return null
    return employees.find(e => e.email === user.email) || employees[0]
  }, [employees, user])

    const allModules = useMemo(() => [
      // Core modules in order
      { id: 'home', label: 'Dashboard', icon: <LayoutDashboard className="h-4 w-4" />, module: 'EmployeePortal', color: 'text-blue-400' },
      { id: 'attendance-list', label: 'Attendance', icon: <Calendar className="h-4 w-4" />, module: 'Attendance', color: 'text-green-400' },
      { id: 'tasks', label: 'Tasks', icon: <CheckCircle2 className="h-4 w-4" />, module: 'Tasks', color: 'text-indigo-400', badge: pendingTaskCount > 0 ? pendingTaskCount : null },
      { id: 'advance', label: 'Advances', icon: <Wallet className="h-4 w-4" />, module: 'AdvanceExpense', color: 'text-teal-400' },
      
      // HR modules
      { id: 'correction', label: 'Correction', icon: <PencilLine className="h-4 w-4" />, module: 'Correction', color: 'text-orange-400' },
      { id: 'leave', label: 'Leave', icon: <Mail className="h-4 w-4" />, module: 'Leave', color: 'text-purple-400' },
      { id: 'approvals', label: 'Approvals', icon: <CheckCircle className="h-4 w-4" />, module: 'Approvals', color: 'text-cyan-400', badge: stats.pendingCorrections > 0 ? stats.pendingCorrections : null },
      { id: 'letters', label: 'HR Letters', icon: <FileText className="h-4 w-4" />, module: 'HRLetters', color: 'text-indigo-400' },
      { id: 'documents', label: 'Documents', icon: <Folder className="h-4 w-4" />, module: 'DocumentManagement', color: 'text-amber-400' },
      { id: 'summary', label: 'Summary', icon: <BarChart3 className="h-4 w-4" />, module: 'Summary', color: 'text-pink-400' },
      
      // Payroll modules
      { id: 'salary-slip', label: 'Salary Slip', icon: <Wallet className="h-4 w-4" />, module: 'SalarySlip', color: 'text-emerald-400' },
      { id: 'fines', label: 'Fines', icon: <Gavel className="h-4 w-4" />, module: 'Fine', color: 'text-red-400' },
      
      // Workforce modules
      { id: 'vehicles', label: 'Vehicles', icon: <Car className="h-4 w-4" />, module: 'Workforce', color: 'text-blue-400' },
      { id: 'engage', label: 'Engage', icon: <Handshake className="h-4 w-4" />, module: 'Engagement', color: 'text-amber-400' },
      { id: 'chat', label: 'Team Chat', icon: <MessageSquare className="h-4 w-4" />, module: 'Engagement', color: 'text-indigo-400', badge: unreadChatCount > 0 ? unreadChatCount : null },
      { id: 'shift-planning', label: 'Shift Planning', icon: <Calendar className="h-4 w-4" />, module: 'ShiftPlanning', color: 'text-violet-400' },
      
      // Account modules
      { id: 'portal', label: 'My Portal', icon: <User className="h-4 w-4" />, module: 'EmployeePortal', color: 'text-indigo-400' },
      { id: 'settings', label: 'Settings', icon: <Settings className="h-4 w-4" />, module: 'Settings', color: 'text-slate-400' },
    ], [stats.pendingCorrections, unreadChatCount, pendingTaskCount])

  const visibleModules = useMemo(() => {
    const userPerms = user?.permissions || {}
    const isAdmin = user?.role?.toLowerCase() === 'admin'
    
    return allModules.filter(mod => {
      // Always allow portal for logged in users
      if (mod.id === 'portal') return true
      
      // Admin bypass
      if (isAdmin) return true
      
      // Special case: settings tab requires Settings module view permission
      if (mod.id === 'settings') {
        return userPerms['Settings']?.view === true
      }

      // Check if user has view permission for this module
      const modulePerms = userPerms[mod.module] || {}
      return modulePerms.view === true
    })
  }, [allModules, user?.permissions, user?.role])

  useEffect(() => {
    if (!user?.orgId) return
    getDoc(doc(db, 'organisations', user.orgId)).then(snap => {
      if (snap.exists()) setOrgSettings(snap.data())
    })
  }, [user?.orgId])

  useEffect(() => {
    setRolePermissions(null)
  }, [user?.orgId, user?.role, user?.permissions])

  useEffect(() => {
    if (!user?.orgId) return
    
    const fetchStats = async () => {
      try {
        setLoading(true)
        const today = new Date().toISOString().split('T')[0]
        
        const [employeesSnap, correctionsSnap, attendanceSnap] = await Promise.all([
          getDocs(collection(db, 'organisations', user.orgId, 'employees')),
          getDocs(collection(db, 'organisations', user.orgId, 'corrections')),
          getDocs(query(collection(db, 'organisations', user.orgId, 'attendance'), where('date', '==', today)))
        ])
        
        const activeEmployees = employeesSnap.docs
          .map(d => ({ id: d.id, ...d.data() }))
          .filter(e => isEmployeeActiveStatus(e.status))
        
        const todayAttendance = attendanceSnap.docs
          .map(d => ({ id: d.id, ...d.data() }))
        
        const pendingCorrections = correctionsSnap.docs
          .map(d => ({ id: d.id, ...d.data() }))
          .filter(c => c.status === 'pending')
        
        setStats({
          totalEmployees: activeEmployees.length,
          presentToday: todayAttendance.filter(d => d.status === 'Present').length,
          absentToday: todayAttendance.filter(d => d.status === 'Absent').length,
          pendingCorrections: pendingCorrections.length
        })
      } catch (err) {
        console.error('Stats fetch error:', err)
      } finally {
        setLoading(false)
      }
    }
    
    fetchStats()
  }, [user?.orgId])

  if (authLoading || (user?.orgId && empLoading)) {
    return (
      <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center p-4">
        <div className="w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mb-4"></div>
        <p className="text-gray-600 font-medium">Loading your dashboard...</p>
      </div>
    )
  }

  // Requirement: Force org creation modal and block navigation if user has no org and no role
  const isMissingOrg = user && !user.orgId && !user.role;
  const showOrgModal = isMissingOrg || (user && !user.orgId);

  if (showOrgModal) {
    return (
      <div className="min-h-screen bg-white">
        <OrgSetupModal user={user} onJoin={joinOrganisation} onCreate={createOrganisation} onLogout={logout} />
      </div>
    )
  }

  if (!user) return null

  const renderHomeDashboard = () => (
    <div className="p-4 space-y-4">
      <div className="grid grid-cols-3 gap-2">
        <StatCard 
          icon={<Users size={16} className="text-blue-600" />} 
          label="Employees" 
          value={stats.totalEmployees}
          color="bg-blue-50"
        />
        <StatCard 
          icon={<CheckCircle2 size={16} className="text-green-600" />} 
          label="Present" 
          value={stats.presentToday}
          color="bg-green-50"
        />
        <StatCard 
          icon={<XCircle size={16} className="text-red-600" />} 
          label="Absent" 
          value={stats.absentToday}
          color="bg-red-50"
        />
      </div>

      <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
        <h3 className="text-sm font-bold text-gray-800 mb-3">Quick Overview</h3>
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <AlertCircle size={14} className="text-orange-500" />
              <span className="text-xs text-gray-600">Pending Corrections</span>
            </div>
            <span className="text-sm font-bold text-orange-600">{stats.pendingCorrections}</span>
          </div>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Clock size={14} className="text-purple-500" />
              <span className="text-xs text-gray-600">Today's Date</span>
            </div>
            <span className="text-sm font-bold text-gray-800">{new Date().toLocaleDateString()}</span>
          </div>
        </div>
      </div>

      <div>
        <h3 className="text-sm font-bold text-gray-800 mb-2 px-1">Modules</h3>
        <div className="grid grid-cols-3 gap-2">
          {visibleModules.map((mod) => (
            <MenuCard 
              key={mod.id}
              icon={mod.icon}
              label={mod.label}
              onClick={() => setActiveTab(mod.id)}
              color={mod.color}
            />
          ))}
        </div>
      </div>
    </div>
  )

  const renderTabContent = () => {
    switch (activeTab) {
      case 'home':
        return renderHomeDashboard()
      case 'attendance':
        return <AttendanceTab />
      case 'correction':
        return <CorrectionTab />
      case 'leave':
        return <LeaveTab />
      case 'approvals':
        return <ApprovalsTab />
      case 'letters':
        return <HRLettersTab />
      case 'tasks':
        return <MobileTasksView />
      case 'recruitment':
        return <RecruitmentTab />
      case 'documents':
        return <DocumentsTab />
      case 'summary':
        return <SummaryTab />
      case 'salary-slip':
        return <SalarySlipTab />
      case 'advance':
        return <AdvanceExpenseTab />
      case 'fines':
        return <FineTab />
      case 'engage':
        return <EngagementTab />
      case 'chat':
        return <ChatTab />
      case 'shift-planning':
        return <ShiftPlanningTab />
      case 'vehicles':
        return <VehicleManagementTab />
      case 'portal':
        return <MobileEmployeePortal />
      case 'settings':
        return <SettingsTab />
      default:
        return renderHomeDashboard()
    }
  }

  const getCurrentModuleLabel = () => {
    const mod = visibleModules.find(m => m.id === activeTab)
    return mod?.label || 'Dashboard'
  }

  return (
    <div className="min-h-screen bg-gray-50 flex overflow-hidden">
      {/* ─── Desktop Sidebar (Hidden on Mobile) ─── */}
      <aside className="hidden lg:flex flex-col w-64 bg-white text-gray-900 border-r border-gray-200 shrink-0">
        <div className="p-6 flex items-center gap-3 border-b border-gray-200">
          {orgSettings?.logoURL ? (
            <img src={orgSettings.logoURL} alt="Logo" className="w-8 h-8 rounded-lg object-cover" />
          ) : (
            <div className="w-8 h-8 rounded-lg bg-indigo-600 flex items-center justify-center text-white shadow-lg shadow-indigo-600/20">
              <Building2 size={18} />
            </div>
          )}
          <span className="text-sm font-bold text-gray-900 tracking-tight truncate">
            {orgSettings?.name || user?.orgName || 'HRFlow ERP'}
          </span>
        </div>

        <nav className="flex-1 overflow-y-auto py-4 px-2 space-y-1 custom-scrollbar">
          {visibleModules.map((mod) => (
            <button
              key={mod.id}
              onClick={() => setActiveTab(mod.id)}
              className={`w-full flex items-center justify-between group px-3 py-2.5 rounded-lg text-[13px] leading-5 transition-all duration-200 ${
                activeTab === mod.id
                  ? 'sidebar-active shadow-sm'
                  : 'text-gray-600 hover:sidebar-hover'
              }`}
            >
              <div className="flex items-center gap-3">
                <div className={`${activeTab === mod.id ? 'text-white' : 'text-gray-400 group-hover:text-indigo-600'}`}>
                  {mod.icon}
                </div>
                <span className="font-medium leading-5 tracking-tight">{mod.label}</span>
              </div>
              {mod.badge && (
                <Badge variant="destructive" className="px-1.5 py-0 min-w-[18px] h-[18px] flex items-center justify-center text-[10px]">
                  {mod.badge}
                </Badge>
              )}
            </button>
          ))}
        </nav>

        <div className="p-4 border-t border-gray-200 space-y-2">
          <button 
            onClick={() => { setActiveTab('portal'); setPortalSubTab('profile') }}
            className="w-full flex items-center gap-3 p-2.5 rounded-lg hover:bg-indigo-50 transition-colors hover:text-indigo-600"
          >
            {currentEmployee?.photoURL ? (
              <img src={currentEmployee.photoURL} alt="P" className="w-8 h-8 rounded-full object-cover border border-gray-200" />
            ) : (
              <div className="w-8 h-8 rounded-full bg-indigo-600 flex items-center justify-center text-[10px] font-bold text-white">
                {getInitials(user?.name)}
              </div>
            )}
            <div className="flex-1 text-left truncate">
              <p className="text-xs font-bold text-gray-900 truncate">{user?.name}</p>
              <p className="text-[10px] text-gray-500 truncate uppercase tracking-tighter">{user?.role || 'Member'}</p>
            </div>
          </button>
          
          <button
            onClick={logout}
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-[13px] leading-5 text-gray-600 hover:bg-red-50 hover:text-red-600 transition-all"
          >
            <LogOut size={16} />
            <span className="font-medium">Sign Out</span>
          </button>
        </div>
      </aside>

      {/* ─── Main Content Area ─── */}
      <main className="flex-1 flex flex-col min-w-0 overflow-hidden relative">
        {/* Mobile Header (Hidden on Desktop) */}
        <header className="lg:hidden sticky top-0 z-40 bg-white border-b border-gray-200 px-4 h-14 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <button 
              onClick={() => setShowMenu(true)}
              className="p-2 -ml-2 rounded-lg hover:bg-indigo-50 text-gray-600 hover:text-indigo-600 transition-colors"
            >
              <Menu size={20} />
            </button>
            <span className="text-sm font-bold text-gray-900 tracking-tight uppercase">
              {getCurrentModuleLabel()}
            </span>
          </div>
          <button onClick={() => { setActiveTab('portal'); setPortalSubTab('profile') }} className="hover:bg-indigo-50 p-2 rounded-lg transition-colors">
            {currentEmployee?.photoURL ? (
              <img src={currentEmployee.photoURL} alt="P" className="w-8 h-8 rounded-full object-cover border border-gray-200" />
            ) : (
              <div className="w-8 h-8 rounded-full bg-indigo-600 flex items-center justify-center text-white text-[10px] font-bold">
                {getInitials(user?.name)}
              </div>
            )}
          </button>
        </header>

        {/* Desktop Header / Breadcrumb */}
        <header className="hidden lg:flex items-center justify-between px-8 h-16 bg-white border-b border-gray-200 shrink-0">
          <div className="flex items-center gap-3 text-sm">
            <span className="text-gray-500 font-medium">Organization</span>
            <ChevronRight size={14} className="text-gray-300" />
            <span className="text-gray-900 font-bold tracking-tight">{getCurrentModuleLabel()}</span>
          </div>
          <div className="flex items-center gap-4">
            <div className="h-8 w-px bg-gray-200 mx-2" />
            <div className="text-right">
              <p className="text-xs font-bold text-gray-900 leading-none">{new Date().toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })}</p>
              <p className="text-[10px] text-gray-500 font-medium mt-1 uppercase tracking-tighter">Attendance System</p>
            </div>
          </div>
        </header>

        {/* Content View */}
        <div className="flex-1 overflow-y-auto custom-scrollbar">
          <div className="w-full min-h-full">
            {renderTabContent()}
          </div>
        </div>

        {/* Mobile Navigation (Hidden on Desktop) */}
        <nav className="lg:hidden bg-white border-t border-gray-200 fixed bottom-0 left-0 right-0 h-16 px-4 z-40">
          <div className="flex justify-around items-center h-full">
            {[
              { id: 'home', label: 'Home', icon: <LayoutDashboard size={20} /> },
              { id: 'attendance', label: 'Attendance', icon: <Calendar size={20} /> },
              { id: 'portal', label: 'Portal', icon: <User size={20} /> },
              { id: 'more', label: 'More', icon: <Menu size={20} />, onClick: () => setShowMenu(true) }
            ].map(item => (
              <button
                key={item.id}
                onClick={item.onClick || (() => setActiveTab(item.id))}
                className={`flex flex-col items-center gap-1 transition-colors ${
                  activeTab === item.id && !item.onClick ? 'text-indigo-600' : 'text-gray-500'
                }`}
              >
                {item.icon}
                <span className="text-[9px] font-bold uppercase tracking-tighter">{item.label}</span>
              </button>
            ))}
          </div>
        </nav>
      </main>

      {/* ─── Mobile Sidebar Overlay ─── */}
      {showMenu && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setShowMenu(false)} />
          <div className="absolute left-0 top-0 bottom-0 w-72 bg-white shadow-2xl flex flex-col animate-in slide-in-from-left duration-300">
            <div className="p-6 flex items-center justify-between border-b border-gray-200">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-indigo-600 flex items-center justify-center text-white">
                  <Building2 size={16} />
                </div>
                <span className="text-sm font-bold text-gray-900 tracking-tight uppercase">HRFlow Menu</span>
              </div>
              <button onClick={() => setShowMenu(false)} className="p-2 text-gray-500 hover:text-gray-900 rounded-lg transition-colors">
                <X size={20} />
              </button>
            </div>
            
            <nav className="flex-1 overflow-y-auto p-4 space-y-1">
              {visibleModules.map(mod => (
                <button
                  key={mod.id}
                  onClick={() => { setActiveTab(mod.id); setShowMenu(false) }}
                  className={`w-full flex items-center justify-between px-3 py-2.5 rounded-lg text-[13px] leading-5 transition-all ${
                    activeTab === mod.id ? 'sidebar-active shadow-lg' : 'text-gray-600 hover:sidebar-hover'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <div className={activeTab === mod.id ? 'text-white' : 'text-gray-400'}>{mod.icon}</div>
                    <span className="font-medium leading-5">{mod.label}</span>
                  </div>
                  {mod.badge && <Badge variant="destructive">{mod.badge}</Badge>}
                </button>
              ))}
            </nav>

            <div className="p-4 border-t border-gray-200 bg-gray-50">
              <button onClick={() => { logout(); setShowMenu(false) }} className="w-full flex items-center gap-3 px-3 py-3 rounded-lg text-[13px] leading-5 text-red-600 hover:bg-red-50 transition-colors font-medium">
                <LogOut size={18} />
                <span className="uppercase tracking-widest">Sign Out</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
