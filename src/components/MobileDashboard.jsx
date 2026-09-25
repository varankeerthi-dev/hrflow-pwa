import React, { useState, useEffect, useMemo } from 'react'
import { useAuth } from '../hooks/useAuth'
import { useEmployees } from '../hooks/useEmployees'
import { db } from '../lib/firebase'
import { isEmployeeActiveStatus } from '../lib/employeeStatus'
import { doc, getDoc, collection, getDocs, addDoc, updateDoc, query, where, orderBy, limit, onSnapshot, serverTimestamp } from 'firebase/firestore'
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
  Circle,
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
  ArrowRight,
  Menu,
  MessageSquare,
  Car,
  LifeBuoy,
  Bell,
  BellRing,
  BellOff,
  Flag
} from 'lucide-react'
import { useTaskNotifications } from '../hooks/useTaskNotifications'

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
import EmployeeVehiclePortal from '../components/tabs/EmployeeVehiclePortal'
import MobileTasksView from './MobileTasksView'
import MobileEmployeePortal from './MobileEmployeePortal'
import Badge from '../components/ui/Badge'
import HelpTab from './tabs/HelpTab'

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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-md" style={{ fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-8 mx-4 border border-gray-100">
        <div className="flex flex-col items-center mb-6">
          <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-indigo-600 to-violet-600 flex items-center justify-center mb-4 shadow-lg shadow-indigo-200">
            <span className="text-white text-3xl">🏢</span>
          </div>
          <h2 className="text-xl font-bold text-gray-800 tracking-tight">Organization Setup</h2>
          <p className="text-[11px] text-gray-500 font-semibold uppercase tracking-wider text-center mt-2">
            {hasOrg && isAdmin ? 'Create New Division' : 'Join a Team or Create Your Own'}
          </p>
        </div>

        {!(hasOrg && isAdmin) && (
          <div className="flex bg-gray-100 rounded-xl p-1 mb-6">
            <button onClick={() => { setModalTab('join'); setError('') }}
              className={`flex-1 py-2.5 rounded-lg text-[11px] font-bold uppercase tracking-wider transition-all ${modalTab === 'join' ? 'bg-white shadow-sm text-indigo-600' : 'text-gray-400 hover:text-gray-600'}`}>
              Join Team
            </button>
            <button onClick={() => { setModalTab('create'); setError('') }}
              className={`flex-1 py-2.5 rounded-lg text-[11px] font-bold uppercase tracking-wider transition-all ${modalTab === 'create' ? 'bg-white shadow-sm text-indigo-600' : 'text-gray-400 hover:text-gray-600'}`}>
              Create Org
            </button>
          </div>
        )}

        {error && <div className="bg-red-50 border border-red-200 text-red-600 px-4 py-3 rounded-xl text-[11px] font-semibold mb-4 text-center">{error}</div>}

        {createdCode ? (
          <div className="space-y-4">
            <div className="bg-gradient-to-br from-green-50 to-emerald-50 border border-green-200 rounded-2xl p-5 text-center">
              <p className="text-[11px] text-green-700 font-semibold uppercase tracking-wider mb-3">Organization Online! 🎉</p>
              <div className="bg-white border border-green-200 rounded-xl px-4 py-3 font-mono font-bold tracking-widest text-lg select-all shadow-sm">{createdCode}</div>
              <p className="text-[10px] text-gray-400 font-medium mt-3">Share this code with your employees</p>
            </div>
            <button onClick={() => window.location.reload()} className="w-full bg-gradient-to-r from-indigo-600 to-violet-600 text-white font-bold py-3 rounded-xl shadow-md shadow-indigo-200 hover:shadow-lg transition-all text-[11px] tracking-wider">Get Started</button>
          </div>
        ) : modalTab === 'join' ? (
          <form onSubmit={handleJoin} className="space-y-4">
            <input value={orgCode} onChange={e => setOrgCode(e.target.value)} placeholder="ENTER ORG CODE" className="w-full border border-gray-200 rounded-xl h-[46px] px-4 py-3 focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none text-sm font-semibold tracking-wide bg-gray-50/50 transition-all" />
            <button type="submit" disabled={loading} className="w-full h-[44px] bg-gradient-to-r from-indigo-600 to-violet-600 text-white font-bold rounded-xl shadow-md shadow-indigo-200 hover:shadow-lg transition-all disabled:opacity-50 text-[11px] tracking-wider">{loading ? 'Verifying...' : 'Join Organization'}</button>
          </form>
        ) : (
          <form onSubmit={handleCreate} className="space-y-4">
            <input value={orgName} onChange={e => setOrgName(e.target.value)} placeholder="BUSINESS NAME" className="w-full border border-gray-200 rounded-xl h-[46px] px-4 py-3 focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none text-sm font-semibold tracking-wide bg-gray-50/50 transition-all" />
            <button type="submit" disabled={loading} className="w-full h-[44px] bg-gradient-to-r from-indigo-600 to-violet-600 text-white font-bold rounded-xl shadow-md shadow-indigo-200 hover:shadow-lg transition-all disabled:opacity-50 text-[11px] tracking-wider">{loading ? 'Creating...' : 'Initialize Org'}</button>
          </form>
        )}

        <div className="mt-6 pt-4 border-t border-gray-100 space-y-3">
          {!user?.orgId && (
            <button 
              onClick={onLogout} 
              className="w-full bg-rose-50 hover:bg-rose-100 text-rose-600 font-bold py-3.5 rounded-xl transition-all text-[11px] tracking-wider flex items-center justify-center gap-2 border border-rose-200 shadow-sm"
            >
              <LogOut size={16} /> <span>Sign Out & Exit</span>
            </button>
          )}
          <button
            onClick={onLogout}
            className="w-full flex items-center justify-center gap-2 text-gray-400 hover:text-gray-600 transition-colors py-2 text-[11px] font-semibold tracking-wider"
          >
            <X size={14} />
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

const MODULE_CATEGORIES = [
  { id: 'all', label: 'All Modules' },
  { id: 'operations', label: 'Operations' },
  { id: 'hr', label: 'HR & People' },
  { id: 'finance', label: 'Finance' },
  { id: 'personal', label: 'My Space' },
]

function StatCard({ icon, label, value, color, indicatorColor, subtitle, badge }) {
  const dotColor = indicatorColor || (color?.includes('green') ? 'bg-emerald-500' : color?.includes('red') ? 'bg-rose-500' : 'bg-blue-500')
  return (
    <div className="bg-white rounded-2xl p-3 border border-slate-200/80 shadow-2xs hover:shadow-xs transition-all flex flex-col justify-between">
      <div className="flex items-center justify-between gap-1 mb-2">
        <span className="text-[11px] font-semibold text-slate-500 truncate">{label}</span>
        {badge ? (
          <span className="px-1.5 py-0.5 rounded-full text-[9px] font-bold bg-slate-100 text-slate-600">
            {badge}
          </span>
        ) : (
          <span className={`w-2 h-2 rounded-full ${dotColor}`} />
        )}
      </div>
      <div>
        <p className="text-2xl font-bold text-slate-900 font-heading tracking-tight leading-none">{value}</p>
        {subtitle && (
          <p className="text-[10px] text-slate-400 font-medium mt-1.5 truncate">{subtitle}</p>
        )}
      </div>
    </div>
  )
}

function MenuCard({ icon, label, onClick, color, badge }) {
  return (
    <button 
      onClick={onClick}
      className="flex flex-col items-center justify-start gap-1.5 p-1 active:scale-95 transition-transform group text-center cursor-pointer"
    >
      <div className={`w-12 h-12 rounded-2xl flex items-center justify-center ${color} bg-white shadow-2xs border border-slate-200/80 group-hover:border-indigo-200 group-hover:shadow-xs transition-all relative [&>svg]:w-5 [&>svg]:h-5`}>
        {icon}
        {badge ? (
          <span className="absolute -top-1 -right-1 px-1 min-w-[18px] h-[18px] bg-rose-500 text-white rounded-full text-[10px] font-bold flex items-center justify-center shadow-xs">
            {badge}
          </span>
        ) : null}
      </div>
      <span className="text-[11px] font-medium text-slate-700 leading-tight line-clamp-2 max-w-[76px] font-body">
        {label}
      </span>
    </button>
  )
}

export default function MobileDashboard() {
  const { user, logout, joinOrganisation, createOrganisation, loading: authLoading } = useAuth()
  
  // Requirement: Delay employee lookup until auth user and orgId are available
  const canFetchEmployees = user && !!user.orgId
  const { employees, loading: empLoading } = useEmployees(canFetchEmployees ? user.orgId : null)
  
  const [orgSettings, setOrgSettings] = useState({})
  const [logoError, setLogoError] = useState(false)
  const [stats, setStats] = useState({
    totalEmployees: 0,
    presentToday: 0,
    absentToday: 0,
    pendingCorrections: 0
  })
  const [activeTab, setActiveTab] = useState('attendance')
  const [settingsSubTab, setSettingsSubTab] = useState(null)
  const [showMenu, setShowMenu] = useState(false)
  const [loading, setLoading] = useState(false)
  const [rolePermissions, setRolePermissions] = useState(null)
  const [selectedCategory, setSelectedCategory] = useState('all')
  const [dashboardTasks, setDashboardTasks] = useState([])
  
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
    const normalizedEmail = user.email.toLowerCase().trim()
    return employees.find(e => e.id === user.employeeId || [e.email, e.personalEmail, e.workEmail].some(email => email?.toLowerCase().trim() === normalizedEmail) || e.id === user.uid) || null
  }, [employees, user])

  // Real-time listener for top actionable tasks on Home Dashboard
  useEffect(() => {
    if (!user?.orgId) return
    const q = query(
      collection(db, 'organisations', user.orgId, 'tasks'),
      where('status', '!=', 'Completed'),
      limit(12)
    )
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const all = snapshot.docs.map(d => ({ id: d.id, ...d.data() }))
      const myId = currentEmployee?.id || user?.uid
      const sorted = all.sort((a, b) => {
        const aMine = (Array.isArray(a.assignedTo) && a.assignedTo.includes(myId)) ? 1 : 0
        const bMine = (Array.isArray(b.assignedTo) && b.assignedTo.includes(myId)) ? 1 : 0
        if (bMine !== aMine) return bMine - aMine
        const prioScore = { urgent: 3, high: 2, normal: 1 }
        return (prioScore[b.priority] || 0) - (prioScore[a.priority] || 0)
      })
      setDashboardTasks(sorted.slice(0, 3))
    })
    return () => unsubscribe()
  }, [user?.orgId, user?.uid, currentEmployee?.id])

  const handleToggleTaskComplete = async (taskId, currentStatus, e) => {
    e?.stopPropagation()
    if (!user?.orgId) return
    const newStatus = currentStatus === 'Completed' ? 'To Do' : 'Completed'
    try {
      await updateDoc(doc(db, 'organisations', user.orgId, 'tasks', taskId), {
        status: newStatus,
        completedAt: newStatus === 'Completed' ? serverTimestamp() : null,
        updatedAt: serverTimestamp()
      })
    } catch (err) {
      console.error('Error toggling task:', err)
    }
  }

  // PWA Mobile Push Notifications for Task Assignments & Team Tasks
  const {
    permission: notifPermission,
    isPWA,
    isSupported: isNotifSupported,
    requestPermission: requestNotifPermission,
    sendTestNotification
  } = useTaskNotifications(user, currentEmployee)

  const [dismissNotifBanner, setDismissNotifBanner] = useState(false)
  const [notifToast, setNotifToast] = useState(null)

  useEffect(() => {
    if (notifToast) {
      const timer = setTimeout(() => setNotifToast(null), 3500)
      return () => clearTimeout(timer)
    }
  }, [notifToast])

    const allModules = useMemo(() => [
      // Core modules in order
      { id: 'home', label: 'Dashboard', icon: <LayoutDashboard className="h-4 w-4" />, module: 'EmployeePortal', category: 'personal', color: 'text-blue-500' },
      { id: 'attendance-list', label: 'Attendance', icon: <Calendar className="h-4 w-4" />, module: 'Attendance', category: 'operations', color: 'text-emerald-500' },
      { id: 'tasks', label: 'Tasks', icon: <CheckCircle2 className="h-4 w-4" />, module: 'Tasks', category: 'operations', color: 'text-indigo-600', badge: pendingTaskCount > 0 ? pendingTaskCount : null },
      
      // HR modules
      { id: 'correction', label: 'Correction', icon: <PencilLine className="h-4 w-4" />, module: 'Correction', category: 'hr', color: 'text-amber-500' },
      { id: 'leave', label: 'Leave', icon: <Mail className="h-4 w-4" />, module: 'Leave', category: 'hr', color: 'text-purple-500' },
      { id: 'approvals', label: 'Approvals', icon: <CheckCircle className="h-4 w-4" />, module: 'Approvals', category: 'hr', color: 'text-cyan-500', badge: stats.pendingCorrections > 0 ? stats.pendingCorrections : null },
      { id: 'letters', label: 'HR Communications', icon: <FileText className="h-4 w-4" />, module: 'HRLetters', category: 'hr', color: 'text-indigo-500' },
      { id: 'documents', label: 'Documents', icon: <Folder className="h-4 w-4" />, module: 'DocumentManagement', category: 'hr', color: 'text-amber-600' },
      { id: 'summary', label: 'Summary', icon: <BarChart3 className="h-4 w-4" />, module: 'Summary', category: 'hr', color: 'text-pink-500' },
      
      // Payroll modules
      { id: 'advance', label: 'Advances', icon: <Wallet className="h-4 w-4" />, module: 'AdvanceExpense', category: 'finance', color: 'text-teal-600' },
      { id: 'salary-slip', label: 'Payroll', icon: <Wallet className="h-4 w-4" />, module: 'SalarySlip', category: 'finance', color: 'text-emerald-600' },
      { id: 'fines', label: 'Fines', icon: <Gavel className="h-4 w-4" />, module: 'Fine', category: 'finance', color: 'text-rose-500' },
      
      // Workforce modules
      { id: 'vehicles', label: 'Vehicles', icon: <Car className="h-4 w-4" />, module: 'Vehicle', category: 'operations', color: 'text-blue-500' },
      { id: 'engage', label: 'Engage', icon: <Handshake className="h-4 w-4" />, module: 'Engagement', category: 'hr', color: 'text-amber-500' },
      { id: 'chat', label: 'Team Chat', icon: <MessageSquare className="h-4 w-4" />, module: 'Engagement', category: 'hr', color: 'text-indigo-600', badge: unreadChatCount > 0 ? unreadChatCount : null },
      { id: 'shift-planning', label: 'Shift Planning', icon: <Calendar className="h-4 w-4" />, module: 'ShiftPlanning', category: 'operations', color: 'text-violet-500' },
      
      // Account modules
      { id: 'portal', label: 'My Portal', icon: <User className="h-4 w-4" />, module: 'EmployeePortal', category: 'personal', color: 'text-indigo-600' },
      { id: 'attendance-reports', label: 'Attendance Reports', icon: <BarChart3 className="h-4 w-4" />, module: 'Attendance', category: 'operations', color: 'text-emerald-600' },
      { id: 'settings', label: 'Settings', icon: <Settings className="h-4 w-4" />, module: 'Settings', category: 'personal', color: 'text-slate-500' },
      { id: 'help', label: 'HELP', icon: <LifeBuoy className="h-4 w-4" />, module: 'Settings', category: 'personal', color: 'text-slate-500' },
    ], [stats.pendingCorrections, unreadChatCount, pendingTaskCount])

  const visibleModules = useMemo(() => {
    const userPerms = user?.permissions || {}
    const isAdmin = user?.role?.toLowerCase() === 'admin'
    
    return allModules.filter(mod => {
      // The self-service portal is available after sign-in; operational reports
      // must be explicitly granted through RBAC.
      if (mod.id === 'portal') return true
      
      // Admin bypass
      if (isAdmin) return true
      
      // Special case: settings tab requires Settings module view permission
      if (mod.id === 'settings') {
        return userPerms['Settings']?.view === true
      }

      // Check if user has view permission for this module
      const modulePerms = userPerms[mod.module] || {}
      return modulePerms.view === true ||
        modulePerms.create === true ||
        modulePerms.edit === true ||
        modulePerms.delete === true ||
        modulePerms.approve === true ||
        modulePerms.export === true
    })
  }, [allModules, user?.permissions, user?.role])

  const categorizedModules = useMemo(() => {
    // Exclude the 'home' tile itself from the dashboard view
    const modulesWithoutHome = visibleModules.filter(m => m.id !== 'home')
    if (selectedCategory === 'all') return modulesWithoutHome
    return modulesWithoutHome.filter(mod => mod.category === selectedCategory)
  }, [visibleModules, selectedCategory])

  useEffect(() => {
    if (!user?.orgId) return
    const unsub = onSnapshot(doc(db, 'organisations', user.orgId), (snap) => {
      if (snap.exists()) {
        setOrgSettings(snap.data())
        setLogoError(false)
      }
    })
    return () => unsub()
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
        
        const presentToday = todayAttendance.filter(d => 
          d.status === 'Present' || 
          d.status === 'Worked' || 
          d.status === 'SunWorked' ||
          d.holidayWorked === true ||
          d.sundayWorked === true
        ).length

        setStats({
          totalEmployees: activeEmployees.length,
          presentToday,
          absentToday: todayAttendance.filter(d => d.status === 'Absent' || d.isAbsent === true).length,
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
      <div className="min-h-screen bg-[#F8FAFC] flex flex-col items-center justify-center p-4" style={{ fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
        <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-indigo-600 to-violet-600 mb-6 flex items-center justify-center shadow-lg shadow-indigo-200 animate-pulse">
          <span className="text-white text-3xl font-bold">H</span>
        </div>
        <div className="w-12 h-12 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin mb-4"></div>
        <p className="text-gray-600 font-semibold uppercase tracking-wider text-[11px]">Loading Dashboard...</p>
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

  const renderHomeDashboard = () => {
    const attendanceRate = stats.totalEmployees > 0
      ? Math.round((stats.presentToday / stats.totalEmployees) * 100)
      : 0

    return (
      <div className="p-4 space-y-4">
        {/* PWA Push Notification Permission Prompt Banner */}
        {isNotifSupported && notifPermission === 'default' && !dismissNotifBanner && (
          <div className="bg-gradient-to-r from-indigo-50/95 to-blue-50/95 border border-indigo-100 rounded-2xl p-3.5 shadow-xs">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="w-9 h-9 rounded-xl bg-indigo-600 text-white flex items-center justify-center shrink-0 shadow-xs">
                  <Bell size={18} />
                </div>
                <div className="min-w-0">
                  <p className="text-xs font-bold text-slate-800 font-heading">Enable Task Push Notifications</p>
                  <p className="text-[11px] text-slate-600 leading-tight">Get alerts when tasks are assigned to you or created for your team</p>
                </div>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                <button 
                  onClick={async () => {
                    const res = await requestNotifPermission()
                    if (res === 'granted') {
                      setNotifToast('✅ Push notifications active! Test alert sent.')
                      await sendTestNotification()
                    }
                  }}
                  className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 active:scale-95 text-white rounded-xl text-xs font-bold font-heading shadow-xs transition-all cursor-pointer"
                >
                  Enable
                </button>
                <button 
                  onClick={() => setDismissNotifBanner(true)}
                  className="p-1 text-slate-400 hover:text-slate-600 rounded-lg transition-colors cursor-pointer"
                  aria-label="Dismiss banner"
                >
                  <X size={15} />
                </button>
              </div>
            </div>
          </div>
        )}

        {/* 1. Linear-Style Stat Cards */}
        <div className="grid grid-cols-3 gap-2">
          <StatCard 
            label="Employees" 
            value={stats.totalEmployees}
            indicatorColor="bg-blue-500"
            subtitle="Total Staff"
          />
          <StatCard 
            label="Present" 
            value={stats.presentToday}
            indicatorColor="bg-emerald-500"
            subtitle={`${attendanceRate}% active`}
          />
          <StatCard 
            label="Absent" 
            value={stats.absentToday}
            indicatorColor="bg-rose-500"
            subtitle="Today"
          />
        </div>

        {/* 2. Today's Tasks & Focus Widget */}
        <div className="bg-white rounded-2xl p-3.5 border border-slate-200/80 shadow-2xs">
          <div className="flex items-center justify-between mb-2.5">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-indigo-600"></span>
              <h3 className="text-xs font-bold text-slate-900 font-heading tracking-tight">Today's Tasks</h3>
              {pendingTaskCount > 0 && (
                <span className="px-1.5 py-0.2 rounded-full text-[10px] font-bold bg-indigo-50 text-indigo-700 border border-indigo-200/60">
                  {pendingTaskCount}
                </span>
              )}
            </div>
            <button
              onClick={() => setActiveTab('tasks')}
              className="text-[11px] font-semibold text-indigo-600 hover:text-indigo-800 flex items-center gap-0.5 cursor-pointer"
            >
              <span>View all</span>
              <ArrowRight size={12} />
            </button>
          </div>

          {dashboardTasks.length === 0 ? (
            <div className="py-3 px-2 text-center bg-slate-50/70 rounded-xl border border-dashed border-slate-200">
              <p className="text-xs font-medium text-slate-500">No pending tasks for today 🎉</p>
              <button
                onClick={() => setActiveTab('tasks')}
                className="mt-1 text-[11px] font-bold text-indigo-600 hover:text-indigo-800 cursor-pointer"
              >
                + Open Tasks
              </button>
            </div>
          ) : (
            <div className="space-y-1.5">
              {dashboardTasks.map(task => {
                const isUrgent = task.priority === 'urgent'
                const isHigh = task.priority === 'high'
                return (
                  <div
                    key={task.id}
                    onClick={() => setActiveTab('tasks')}
                    className="flex items-center gap-2.5 p-2 bg-slate-50/60 hover:bg-slate-50 border border-slate-100 rounded-xl transition-colors cursor-pointer group"
                  >
                    <button
                      type="button"
                      onClick={(e) => handleToggleTaskComplete(task.id, task.status, e)}
                      className="text-slate-300 hover:text-emerald-500 transition-colors shrink-0 cursor-pointer"
                      title="Mark task completed"
                    >
                      <Circle size={18} />
                    </button>
                    <span className="text-xs font-medium text-slate-800 truncate flex-1 font-body">
                      {task.title}
                    </span>
                    {(isUrgent || isHigh) && (
                      <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-md border shrink-0 ${
                        isUrgent ? 'bg-rose-50 text-rose-600 border-rose-200' : 'bg-amber-50 text-amber-600 border-amber-200'
                      }`}>
                        {task.priority}
                      </span>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* 3. Pending Corrections Alert Banner (if any) */}
        {stats.pendingCorrections > 0 && (
          <div
            onClick={() => setActiveTab('approvals')}
            className="flex items-center justify-between p-3 bg-amber-50/80 border border-amber-200/80 rounded-2xl cursor-pointer active:scale-[0.99] transition-all"
          >
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="w-8 h-8 rounded-xl bg-amber-500 text-white flex items-center justify-center shrink-0">
                <AlertCircle size={16} />
              </div>
              <div className="min-w-0">
                <p className="text-xs font-bold text-amber-950 font-heading">
                  {stats.pendingCorrections} Pending Approval{stats.pendingCorrections > 1 ? 's' : ''}
                </p>
                <p className="text-[10px] text-amber-800 truncate">Attendance correction requests need review</p>
              </div>
            </div>
            <span className="text-[11px] font-bold text-amber-900 flex items-center gap-1 shrink-0 font-heading">
              Review <ArrowRight size={12} />
            </span>
          </div>
        )}

        {/* 4. Modules Section with Linear Filter Pills */}
        <div className="space-y-3">
          <div className="flex items-center justify-between px-1">
            <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider font-heading">Modules</h3>
            {isNotifSupported && notifPermission === 'granted' && (
              <button
                onClick={async () => {
                  setNotifToast('🔔 Test notification sent to this device!')
                  await sendTestNotification()
                }}
                title="Push notifications active. Click to test on this device."
                className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200/70 hover:bg-emerald-100 transition-colors cursor-pointer"
              >
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                Push Active
              </button>
            )}
          </div>

          {/* Linear-Style Horizontal Filter Pills */}
          <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-hide py-0.5 px-0.5">
            {MODULE_CATEGORIES.map(cat => (
              <button
                key={cat.id}
                type="button"
                onClick={() => setSelectedCategory(cat.id)}
                className={`px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-all cursor-pointer ${
                  selectedCategory === cat.id
                    ? 'bg-slate-900 text-white shadow-xs font-semibold'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200/70 hover:text-slate-900'
                }`}
              >
                {cat.label}
              </button>
            ))}
          </div>

          {/* Module Tiles Grid */}
          <div className="grid grid-cols-4 gap-y-4 gap-x-1 sm:grid-cols-4 pt-1">
            {categorizedModules.map((mod) => (
              <MenuCard 
                key={mod.id}
                icon={mod.icon}
                label={mod.label}
                badge={mod.badge}
                onClick={() => setActiveTab(mod.id)}
                color={mod.color}
              />
            ))}
          </div>
        </div>
      </div>
    )
  }

  const renderTabContent = () => {
    switch (activeTab) {
      case 'home':
        return renderHomeDashboard()
      case 'attendance':
        return <AttendanceTab onOpenHolidaySettings={() => { setSettingsSubTab('holidays'); setActiveTab('settings') }} onReviewEmployees={() => setActiveTab('employees')} />
      case 'attendance-reports':
        return <AttendanceTab defaultSubTab="reports" onOpenHolidaySettings={() => { setSettingsSubTab('holidays'); setActiveTab('settings') }} onReviewEmployees={() => setActiveTab('employees')} />
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
        return user?.role?.toLowerCase() === 'admin'
          ? <VehicleManagementTab />
          : <EmployeeVehiclePortal employeeId={currentEmployee?.id || null} />
      case 'portal':
        return <MobileEmployeePortal />
      case 'settings':
        return <SettingsTab initialSubTab={settingsSubTab} />
      case 'help':
        return <HelpTab />
      default:
        return renderHomeDashboard()
    }
  }

  const getCurrentModuleLabel = () => {
    const mod = visibleModules.find(m => m.id === activeTab)
    return mod?.label || 'Dashboard'
  }

  return (
    <div className="min-h-screen bg-[#F8FAFC] flex overflow-hidden" style={{ fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
      {/* ─── Desktop Sidebar (Hidden on Mobile) ─── */}
      <aside className="hidden lg:flex flex-col w-[240px] bg-white text-gray-900 border-r border-gray-200/80 shrink-0 shadow-[4px_0_24px_rgba(0,0,0,0.02)]">
        <div className="p-5 flex items-center gap-3 border-b border-gray-200/80">
          {orgSettings?.logoURL && !logoError ? (
            <img 
              src={orgSettings.logoURL} 
              alt="Logo" 
              className="w-9 h-9 rounded-xl object-cover ring-2 ring-gray-100 shadow-sm"
              onError={() => setLogoError(true)} 
            />
          ) : (
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-indigo-600 to-violet-600 flex items-center justify-center text-white shadow-lg shadow-indigo-600/20">
              <Building2 size={18} />
            </div>
          )}
          <span className="text-sm font-bold text-gray-900 tracking-tight truncate">
            {orgSettings?.name || user?.orgName || 'HRFlow'}
          </span>
        </div>

        <nav className="flex-1 overflow-y-auto py-4 px-3 bg-white">
          {visibleModules.map((mod) => (
            <button
              key={mod.id}
              onClick={() => setActiveTab(mod.id)}
              className={`w-full flex items-center justify-between group px-3 py-2.5 rounded-xl text-[13px] leading-5 transition-all duration-200 ${
                activeTab === mod.id
                  ? 'bg-gradient-to-r from-indigo-600 to-violet-600 text-white shadow-md shadow-indigo-200'
                  : 'text-gray-600 hover:bg-indigo-50/80 hover:text-indigo-700'
              }`}
            >
              <div className="flex items-center gap-3">
                <div className={`${activeTab === mod.id ? 'text-white' : 'text-gray-400 group-hover:text-indigo-600'}`}>
                  {mod.icon}
                </div>
                <span className="font-semibold leading-5 tracking-tight">{mod.label}</span>
              </div>
              {mod.badge && (
                <Badge variant="destructive" className="px-1.5 py-0 min-w-[18px] h-[18px] flex items-center justify-center text-[10px]">
                  {mod.badge}
                </Badge>
              )}
            </button>
          ))}
        </nav>

        <div className="p-3 border-t border-gray-200/80 space-y-2 bg-gray-50/50">
          <button 
            onClick={() => { setActiveTab('portal'); setPortalSubTab('profile') }}
            className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-[13px] transition-all duration-200 ${
              activeTab === 'portal' 
                ? 'bg-gradient-to-r from-indigo-600 to-violet-600 text-white shadow-md shadow-indigo-200' 
                : 'text-gray-600 hover:bg-indigo-50/80 hover:text-indigo-700'
            }`}
          >
            <div className={`w-7 h-7 rounded-lg flex items-center justify-center text-[10px] font-bold ${
              activeTab === 'portal' 
                ? 'bg-white/20 text-white' 
                : 'bg-indigo-100 text-indigo-600'
            }`}>
              {getInitials(currentEmployee?.name || user?.displayName || 'U')}
            </div>
            <span className="font-semibold truncate">{currentEmployee?.name || user?.displayName || 'Profile'}</span>
          </button>
          
          <button
            onClick={logout}
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-[13px] leading-5 text-gray-600 hover:bg-red-50 hover:text-red-600 transition-all duration-200"
          >
            <LogOut size={16} />
            <span className="font-semibold">Sign Out</span>
          </button>
        </div>
      </aside>

      {/* ─── Main Content Area ─── */}
      <main className="flex-1 flex flex-col min-w-0 overflow-hidden relative bg-[#F8FAFC]">
        {/* Mobile Header (Hidden on Desktop) */}
        <header className="lg:hidden sticky top-0 z-40 bg-white/80 backdrop-blur-md border-b border-gray-200/80 px-4 h-14 flex items-center justify-between shrink-0 shadow-sm">
          <div className="flex items-center gap-3">
            <button 
              onClick={() => setShowMenu(true)}
              className="p-2 -ml-2 rounded-xl hover:bg-indigo-50 text-gray-600 hover:text-indigo-600 transition-colors"
            >
              <Menu size={20} />
            </button>
            <span className="text-sm font-bold text-gray-900 tracking-tight">
              {getCurrentModuleLabel()}
            </span>
          </div>
          <div className="flex items-center gap-1">
            {isNotifSupported && (
              <button 
                onClick={async () => {
                  if (notifPermission === 'default') {
                    const res = await requestNotifPermission()
                    if (res === 'granted') {
                      setNotifToast('✅ Push notifications active! Test sent.')
                      await sendTestNotification()
                    }
                  } else if (notifPermission === 'granted') {
                    setNotifToast('🔔 Test notification sent to this device!')
                    await sendTestNotification()
                  } else if (notifPermission === 'denied') {
                    setNotifToast('⚠️ Notifications are blocked in device browser settings.')
                  }
                }}
                title={notifPermission === 'granted' ? 'Push notifications active (tap to test)' : 'Enable push notifications'}
                className="relative p-2 rounded-xl text-gray-600 hover:text-indigo-600 hover:bg-indigo-50 active:scale-90 transition-all"
                aria-label="Task Notifications"
              >
                {notifPermission === 'granted' ? (
                  <>
                    <BellRing size={19} className="text-indigo-600" />
                    <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-emerald-500 ring-2 ring-white"></span>
                  </>
                ) : notifPermission === 'denied' ? (
                  <BellOff size={19} className="text-slate-400" />
                ) : (
                  <>
                    <Bell size={19} className="text-slate-600" />
                    <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-amber-500 animate-pulse ring-2 ring-white"></span>
                  </>
                )}
              </button>
            )}
            <button onClick={() => { setActiveTab('portal'); setPortalSubTab('profile') }} className="hover:bg-indigo-50 p-1.5 rounded-xl transition-colors">
              {currentEmployee?.photoURL ? (
                <img src={currentEmployee.photoURL} alt="P" className="w-8 h-8 rounded-full object-cover border border-gray-200" />
              ) : (
                <div className="w-8 h-8 rounded-full bg-gradient-to-br from-indigo-600 to-violet-600 flex items-center justify-center text-white text-[10px] font-bold shadow-md">
                  {getInitials(user?.name)}
                </div>
              )}
            </button>
          </div>
        </header>

        {/* Notification Toast Alert */}
        {notifToast && (
          <div className="fixed top-16 left-1/2 -translate-x-1/2 z-50 px-4 py-2 bg-slate-900/90 backdrop-blur-xs text-white text-xs font-semibold rounded-full shadow-xl border border-slate-700/60 animate-in fade-in slide-in-from-top-2 duration-200 pointer-events-none">
            {notifToast}
          </div>
        )}

        {/* Desktop Header / Breadcrumb */}
        <header className="hidden lg:flex items-center justify-between px-8 h-16 bg-white/80 backdrop-blur-md border-b border-gray-200/80 shrink-0 shadow-sm">
          <div className="flex items-center gap-3 text-sm">
            <span className="text-gray-500 font-semibold">Organization</span>
            <ChevronRight size={14} className="text-gray-300" />
            <span className="text-gray-900 font-bold tracking-tight">{getCurrentModuleLabel()}</span>
          </div>
          <div className="flex items-center gap-4">
            <div className="h-8 w-px bg-gray-200 mx-2" />
            <div className="text-right">
              <p className="text-xs font-bold text-gray-900 leading-none">{new Date().toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })}</p>
              <p className="text-[10px] text-gray-500 font-semibold mt-1 uppercase tracking-wider">HRFlow ERP</p>
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
                {orgSettings?.logoURL && !logoError ? (
                  <img src={orgSettings.logoURL} alt="Logo" className="w-8 h-8 rounded-lg object-cover ring-1 ring-gray-200" onError={() => setLogoError(true)} />
                ) : (
                  <div className="w-8 h-8 rounded-lg bg-indigo-600 flex items-center justify-center text-white">
                    <Building2 size={16} />
                  </div>
                )}
                <span className="text-sm font-bold text-gray-900 tracking-tight uppercase">{orgSettings?.name || 'HRFlow'}</span>
              </div>
              <button onClick={() => setShowMenu(false)} className="p-2 text-gray-500 hover:text-gray-900 rounded-lg transition-colors">
                <X size={20} />
              </button>
            </div>
            
            <nav className="flex-1 overflow-y-auto p-4 bg-white">
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
                    <span className="font-semibold leading-5">{mod.label}</span>
                  </div>
                  {mod.badge && <Badge variant="destructive">{mod.badge}</Badge>}
                </button>
              ))}
            </nav>

            <div className="p-4 border-t border-gray-200 bg-white">
              <button onClick={() => { logout(); setShowMenu(false) }} className="w-full flex items-center gap-3 px-3 py-3 rounded-lg text-[13px] leading-5 text-red-600 hover:bg-red-50 transition-colors font-semibold">
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
