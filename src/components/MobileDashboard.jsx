import React, { useState, useEffect, useMemo } from 'react'
import { useAuth } from '../hooks/useAuth'
import { useEmployees } from '../hooks/useEmployees'
import { db } from '../lib/firebase'
import { doc, getDoc, collection, getDocs, addDoc, query, where, orderBy, limit } from 'firebase/firestore'
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
  Menu
} from 'lucide-react'

import HomeTab from '../components/tabs/HomeTab'
import AttendanceTab from '../components/tabs/AttendanceTab'
import CorrectionTab from '../components/tabs/CorrectionTab'
import LeaveTab from '../components/tabs/LeaveTab'
import ApprovalsTab from '../components/tabs/ApprovalsTab'
import HRLettersTab from '../components/tabs/HRLettersTab'
import RecruitmentTab from '../components/tabs/RecruitmentTab'
import DocumentsTab from '../components/tabs/DocumentsTab'
import SummaryTab from '../components/tabs/SummaryTab'
import SalarySlipTab from '../components/tabs/SalarySlipTab'
import AdvanceExpenseTab from '../components/tabs/AdvanceExpenseTab'
import FineTab from '../components/tabs/FineTab'
import EngagementTab from '../components/tabs/EngagementTab'
import ShiftPlanningTab from '../components/tabs/ShiftPlanningTab'
import EmployeePortalTab from '../components/tabs/EmployeePortalTab'
import SettingsTab from '../components/tabs/SettingsTab'

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
  const [portalSubTab, setPortalSubTab] = useState('dashboard')
  const [showMenu, setShowMenu] = useState(false)
  const [loading, setLoading] = useState(false)
  const [rolePermissions, setRolePermissions] = useState(null)

  const currentEmployee = useMemo(() => {
    if (!employees.length || !user?.email) return null
    return employees.find(e => e.email === user.email) || employees[0]
  }, [employees, user])

  const allModules = useMemo(() => [
    { id: 'home', label: 'Dashboard', icon: <LayoutDashboard size={20} className="text-blue-600" />, module: 'Attendance', color: 'bg-blue-50' },
    { id: 'attendance', label: 'Attendance', icon: <Calendar size={20} className="text-green-600" />, module: 'Attendance', color: 'bg-green-50' },
    { id: 'correction', label: 'Correction', icon: <PencilLine size={20} className="text-orange-600" />, module: 'Correction', color: 'bg-orange-50' },
    { id: 'leave', label: 'Leave', icon: <Mail size={20} className="text-purple-600" />, module: 'Leave', color: 'bg-purple-50' },
    { id: 'approvals', label: 'Approvals', icon: <CheckCircle size={20} className="text-cyan-600" />, module: 'Approvals', color: 'bg-cyan-50' },
    { id: 'letters', label: 'HR Letters', icon: <FileText size={20} className="text-indigo-600" />, module: 'HRLetters', color: 'bg-indigo-50' },
    { id: 'recruitment', label: 'Recruitment', icon: <Briefcase size={20} className="text-blue-600" />, module: 'Recruitment', color: 'bg-blue-50' },
    { id: 'documents', label: 'Documents', icon: <Folder size={20} className="text-amber-600" />, module: 'DocumentManagement', color: 'bg-amber-50' },
    { id: 'summary', label: 'Summary', icon: <BarChart3 size={20} className="text-pink-600" />, module: 'Summary', color: 'bg-pink-50' },
    { id: 'salary-slip', label: 'Salary Slip', icon: <Wallet size={20} className="text-emerald-600" />, module: 'SalarySlip', color: 'bg-emerald-50' },
    { id: 'advance', label: 'Advances', icon: <Wallet size={20} className="text-teal-600" />, module: 'AdvanceExpense', color: 'bg-teal-50' },
    { id: 'fines', label: 'Fines', icon: <Gavel size={20} className="text-red-600" />, module: 'Fine', color: 'bg-red-50' },
    { id: 'engage', label: 'Engage', icon: <Handshake size={20} className="text-amber-600" />, module: 'Engagement', color: 'bg-amber-50' },
    { id: 'shift-planning', label: 'Shift Plan', icon: <Calendar size={20} className="text-violet-600" />, module: 'ShiftPlanning', color: 'bg-violet-50' },
    { id: 'portal', label: 'My Portal', icon: <User size={20} className="text-indigo-600" />, module: 'EmployeePortal', color: 'bg-indigo-50' },
    { id: 'settings', label: 'Settings', icon: <Settings size={20} className="text-gray-600" />, module: 'Settings', color: 'bg-gray-50' },
  ], [])

  const visibleModules = useMemo(() => {
    const userPerms = user?.permissions || {}
    const isAdmin = user?.role?.toLowerCase() === 'admin'
    
    return allModules.filter(mod => {
      // Always allow home and portal for logged in users
      if (['home', 'portal'].includes(mod.id)) return true
      
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
          .filter(e => e.status === 'Active')
        
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
      case 'shift-planning':
        return <ShiftPlanningTab />
      case 'portal':
        return <EmployeePortalTab portalSubTab={portalSubTab} />
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
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <header className="sticky top-0 z-40 bg-white border-b border-gray-200 shadow-sm">
        <div className="flex items-center justify-between px-4 h-14">
          <div className="flex items-center gap-2">
            <button 
              onClick={() => setShowMenu(!showMenu)}
              className="p-1 -ml-1 rounded-lg hover:bg-gray-100"
            >
              <Menu size={20} className="text-gray-600" />
            </button>
            {orgSettings?.logoURL ? (
              <img src={orgSettings.logoURL} alt="Logo" className="w-8 h-8 rounded-lg object-cover" />
            ) : (
              <div className="w-8 h-8 rounded-lg bg-gray-900 flex items-center justify-center text-white">
                <Building2 size={16} />
              </div>
            )}
            <span className="text-md font-black text-gray-900">
              {orgSettings?.name || user?.orgName || 'HRFlow'}
            </span>
          </div>
          
          <div className="flex items-center gap-3">
            <button onClick={() => { setActiveTab('portal'); setPortalSubTab('profile') }} className="flex items-center">
              {currentEmployee?.photoURL ? (
                <img src={currentEmployee.photoURL} alt="Profile" className="w-8 h-8 rounded-full object-cover border border-gray-200" />
              ) : (
                <div 
                  className="w-8 h-8 rounded-full flex items-center justify-center text-white text-[10px] font-bold"
                  style={{ backgroundColor: getAvatarColor(user?.uid) }}
                >
                  {getInitials(user?.name)}
                </div>
              )}
            </button>
          </div>
        </div>
      </header>

      {showMenu && (
        <div className="fixed inset-0 z-50 bg-black/50" onClick={() => setShowMenu(false)}>
          <div className="absolute left-0 top-0 bottom-0 w-72 bg-white shadow-xl" onClick={e => e.stopPropagation()}>
            <div className="p-4 border-b border-gray-200">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-bold text-gray-800">Menu</h2>
                <button onClick={() => setShowMenu(false)} className="p-1 rounded hover:bg-gray-100">
                  <X size={20} className="text-gray-500" />
                </button>
              </div>
            </div>
            <div className="p-2 space-y-1 overflow-y-auto max-h-[calc(100vh-120px)]">
              {visibleModules.map((mod) => (
                <button
                  key={mod.id}
                  onClick={() => { setActiveTab(mod.id); setShowMenu(false) }}
                  className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-left transition-colors ${
                    activeTab === mod.id 
                      ? 'bg-indigo-50 text-indigo-700' 
                      : 'text-gray-700 hover:bg-gray-50'
                  }`}
                >
                  <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${mod.color}`}>
                    {mod.icon}
                  </div>
                  <span className="text-sm font-medium">{mod.label}</span>
                </button>
              ))}
              <div className="border-t border-gray-200 my-2"></div>
              <button
                onClick={() => { logout(); setShowMenu(false) }}
                className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-left text-red-600 hover:bg-red-50"
              >
                <div className="w-8 h-8 rounded-lg flex items-center justify-center bg-red-50">
                  <LogOut size={18} className="text-red-600" />
                </div>
                <span className="text-sm font-medium">Logout</span>
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="flex-1 overflow-auto pb-16">
        {activeTab !== 'home' && (
          <div className="sticky top-0 bg-white border-b border-gray-200 px-4 py-2 z-30 flex items-center gap-2">
            <button 
              onClick={() => setActiveTab('home')}
              className="p-1 rounded hover:bg-gray-100"
            >
              <ArrowLeft size={18} className="text-gray-600" />
            </button>
            <span className="text-sm font-bold text-gray-800">{getCurrentModuleLabel()}</span>
          </div>
        )}
        {renderTabContent()}
      </div>

      <nav className="bg-white border-t border-gray-200 px-1 py-1 fixed bottom-0 w-full">
        <div className="flex justify-around">
          <button 
            onClick={() => setActiveTab('home')}
            className={`flex flex-col items-center py-2 px-3 ${activeTab === 'home' ? 'text-indigo-600' : 'text-gray-400'}`}
          >
            <LayoutDashboard size={20} />
            <span className="text-[9px] font-medium mt-0.5">Home</span>
          </button>
          <button 
            onClick={() => setActiveTab('attendance')}
            className={`flex flex-col items-center py-2 px-3 ${activeTab === 'attendance' ? 'text-indigo-600' : 'text-gray-400'}`}
          >
            <Calendar size={20} />
            <span className="text-[9px] font-medium mt-0.5">Attendance</span>
          </button>
          <button 
            onClick={() => setActiveTab('portal')}
            className={`flex flex-col items-center py-2 px-3 ${activeTab === 'portal' ? 'text-indigo-600' : 'text-gray-400'}`}
          >
            <User size={20} />
            <span className="text-[9px] font-medium mt-0.5">Portal</span>
          </button>
          <button 
            onClick={() => setShowMenu(true)}
            className={`flex flex-col items-center py-2 px-3 ${showMenu ? 'text-indigo-600' : 'text-gray-400'}`}
          >
            <Menu size={20} />
            <span className="text-[9px] font-medium mt-0.5">More</span>
          </button>
        </div>
      </nav>
    </div>
  )
}
