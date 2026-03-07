import { useState, useEffect, useMemo } from 'react'
import { useAuth } from '../hooks/useAuth'
import { useEmployees } from '../hooks/useEmployees'
import { db } from '../lib/firebase'
import { doc, getDoc, collection, getDocs, addDoc, query, where, orderBy, limit } from 'firebase/firestore'
import {
  Calendar,
  PencilLine,
  BarChart3,
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
  XOctagon
} from 'lucide-react'

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
  const { user, logout } = useAuth()
  const { employees } = useEmployees(user?.orgId)
  const [orgSettings, setOrgSettings] = useState({})
  const [stats, setStats] = useState({
    totalEmployees: 0,
    presentToday: 0,
    absentToday: 0,
    pendingCorrections: 0
  })
  const [activeSection, setActiveSection] = useState('dashboard')
  const [attendanceRecords, setAttendanceRecords] = useState([])
  const [corrections, setCorrections] = useState([])
  const [loading, setLoading] = useState(false)
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0])
  const [saving, setSaving] = useState(false)
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
    if (user?.role === 'admin') return allModules
    if (!rolePermissions) return allModules.filter(m => m.module === 'EmployeePortal')
    return allModules.filter(m => rolePermissions[m.module]?.view || rolePermissions[m.module]?.full || m.module === 'EmployeePortal')
  }, [allModules, rolePermissions, user])

  useEffect(() => {
    if (!user?.orgId) return
    getDoc(doc(db, 'organisations', user.orgId)).then(snap => {
      if (snap.exists()) setOrgSettings(snap.data())
    })
  }, [user?.orgId])

  useEffect(() => {
    if (!user?.orgId || !user?.role) return
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

  useEffect(() => {
    if (!user?.orgId || !selectedDate) return
    
    const fetchAttendance = async () => {
      try {
        const snapshot = await getDocs(query(collection(db, 'organisations', user.orgId, 'attendance'), where('date', '==', selectedDate)))
        const records = snapshot.docs.map(d => ({ id: d.id, ...d.data() }))
        setAttendanceRecords(records)
      } catch (err) {
        const snapshot = await getDocs(collection(db, 'organisations', user.orgId, 'attendance'))
        const records = snapshot.docs
          .filter(d => d.id.includes(selectedDate))
          .map(d => ({ id: d.id, ...d.data() }))
        setAttendanceRecords(records)
      }
    }
    
    fetchAttendance()
  }, [user?.orgId, selectedDate])

  const renderDashboard = () => (
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
              onClick={() => setActiveSection(mod.id)}
              color={mod.color}
            />
          ))}
        </div>
      </div>
    </div>
  )

  const renderContent = () => {
    switch (activeSection) {
      case 'dashboard':
        return renderDashboard()
      case 'attendance':
        return renderAttendance()
      case 'correction':
        return renderCorrections()
      case 'summary':
        return renderSummary()
      case 'employees':
        return renderEmployees()
      case 'portal':
        return renderPortal()
      case 'home':
        return renderDashboard()
      default:
        return (
          <div className="p-4 text-center">
            <div className="bg-white rounded-xl p-6 border border-gray-100">
              <Settings size={48} className="text-gray-300 mx-auto mb-3" />
              <p className="text-sm text-gray-500">{activeSection} module</p>
              <p className="text-xs text-gray-400 mt-2">This feature is available on web</p>
            </div>
          </div>
        )
    }
  }

  const renderCorrections = () => {
    const pendingCount = stats.pendingCorrections
    return (
      <div className="space-y-2">
        <h2 className="text-lg font-bold text-gray-800 mb-2">Time Corrections</h2>
        {loading ? (
          <div className="text-center py-8 text-gray-400">Loading...</div>
        ) : pendingCount === 0 ? (
          <div className="bg-white rounded-xl p-4 border border-gray-100">
            <CheckCircle2 size={32} className="text-green-500 mx-auto mb-2" />
            <p className="text-sm text-gray-500 text-center">No pending corrections</p>
          </div>
        ) : (
          <div className="bg-white rounded-xl p-4 border border-gray-100">
            <p className="text-2xl font-bold text-orange-600">{pendingCount}</p>
            <p className="text-xs text-gray-500">Pending corrections</p>
          </div>
        )}
      </div>
    )
  }

  const renderSummary = () => (
    <div className="space-y-2">
      <h2 className="text-lg font-bold text-gray-800 mb-2">Monthly Summary</h2>
      <div className="bg-white rounded-xl p-4 border border-gray-100">
        <div className="grid grid-cols-2 gap-3">
          <div className="bg-blue-50 rounded-lg p-3 text-center">
            <p className="text-xl font-bold text-blue-600">{stats.totalEmployees}</p>
            <p className="text-[10px] text-blue-400 font-bold uppercase">Total Staff</p>
          </div>
          <div className="bg-green-50 rounded-lg p-3 text-center">
            <p className="text-xl font-bold text-green-600">{stats.presentToday}</p>
            <p className="text-[10px] text-green-400 font-bold uppercase">Present Today</p>
          </div>
          <div className="bg-red-50 rounded-lg p-3 text-center">
            <p className="text-xl font-bold text-red-600">{stats.absentToday}</p>
            <p className="text-[10px] text-red-400 font-bold uppercase">Absent Today</p>
          </div>
          <div className="bg-orange-50 rounded-lg p-3 text-center">
            <p className="text-xl font-bold text-orange-600">{stats.pendingCorrections}</p>
            <p className="text-[10px] text-orange-400 font-bold uppercase">Pending Corrections</p>
          </div>
        </div>
      </div>
      <p className="text-xs text-gray-400 text-center mt-4">Summary for {new Date().toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}</p>
    </div>
  )

  const renderEmployees = () => (
    <div className="space-y-2">
      <h2 className="text-lg font-bold text-gray-800 mb-2">Employees</h2>
      {loading ? (
        <div className="text-center py-8 text-gray-400">Loading...</div>
      ) : employees.length === 0 ? (
        <div className="bg-white rounded-xl p-4 border border-gray-100">
          <Users size={32} className="text-gray-300 mx-auto mb-2" />
          <p className="text-sm text-gray-500 text-center">No employees found</p>
        </div>
      ) : (
        <div className="space-y-1">
          {employees.filter(e => e.status === 'Active').map((emp) => (
            <div key={emp.id} className="bg-white rounded-lg p-2 border border-gray-100 flex items-center gap-2">
              {emp.photoURL ? (
                <img src={emp.photoURL} alt="" className="w-8 h-8 rounded-full object-cover" />
              ) : (
                <div 
                  className="w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold"
                  style={{ backgroundColor: getAvatarColor(emp.id) }}
                >
                  {getInitials(emp.name)}
                </div>
              )}
              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold text-gray-800 truncate">{emp.name}</p>
                <p className="text-[10px] text-gray-400">{emp.designation || 'Staff'}</p>
              </div>
              <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                emp.status === 'Active' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'
              }`}>
                {emp.status || 'Active'}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  )

  const renderPortal = () => (
    <div className="space-y-3">
      <h2 className="text-lg font-bold text-gray-800 mb-2">My Portal</h2>
      <div className="bg-white rounded-xl p-4 border border-gray-100">
        <div className="flex items-center gap-3 mb-4">
          {currentEmployee?.photoURL ? (
            <img src={currentEmployee.photoURL} alt="" className="w-14 h-14 rounded-full object-cover" />
          ) : (
            <div 
              className="w-14 h-14 rounded-full flex items-center justify-center text-white text-lg font-bold"
              style={{ backgroundColor: getAvatarColor(user?.uid) }}
            >
              {getInitials(user?.name)}
            </div>
          )}
          <div>
            <p className="text-base font-bold text-gray-800">{user?.name || 'User'}</p>
            <p className="text-xs text-gray-400 uppercase">{user?.role || 'Staff'}</p>
          </div>
        </div>
        <div className="space-y-2 border-t border-gray-100 pt-3">
          <div className="flex justify-between text-sm">
            <span className="text-gray-500">Email</span>
            <span className="text-gray-800 font-medium">{user?.email || '-'}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-gray-500">Organization</span>
            <span className="text-gray-800 font-medium">{orgSettings?.name || '-'}</span>
          </div>
          {currentEmployee?.designation && (
            <div className="flex justify-between text-sm">
              <span className="text-gray-500">Designation</span>
              <span className="text-gray-800 font-medium">{currentEmployee.designation}</span>
            </div>
          )}
        </div>
      </div>
    </div>
  )

  const renderAttendance = () => {
    const handleMarkAttendance = async (empId, empName, status) => {
      if (!user?.orgId) return
      setSaving(true)
      try {
        await addDoc(collection(db, 'organisations', user.orgId, 'attendance'), {
          employeeId: empId,
          name: empName,
          date: selectedDate,
          inDate: selectedDate,
          inTime: status === 'present' ? '09:00' : '',
          outDate: selectedDate,
          outTime: status === 'present' ? '18:00' : '',
          status: status === 'present' ? 'Present' : 'Absent',
          isAbsent: status === 'absent',
          otHours: '00:00',
          createdAt: new Date().toISOString()
        })
        setAttendanceRecords(prev => [...prev, { employeeId: empId, name: empName, status: status === 'present' ? 'Present' : 'Absent' }])
      } catch (err) {
        console.error('Error marking attendance:', err)
      } finally {
        setSaving(false)
      }
    }

    const formatDate = (d) => {
      const date = new Date(d)
      return date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
    }

    const changeDate = (days) => {
      const d = new Date(selectedDate)
      d.setDate(d.getDate() + days)
      setSelectedDate(d.toISOString().split('T')[0])
    }

    const activeEmployees = employees.filter(e => e.status === 'Active')

    return (
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold text-gray-800">Attendance</h2>
          <div className="flex items-center gap-1 bg-white rounded-lg border border-gray-200 p-1">
            <button onClick={() => changeDate(-1)} className="p-1 hover:bg-gray-100 rounded"><ChevronLeft size={16} /></button>
            <input 
              type="date" 
              value={selectedDate} 
              onChange={(e) => setSelectedDate(e.target.value)}
              className="text-xs font-bold bg-transparent border-none outline-none w-24 text-center"
            />
            <button onClick={() => changeDate(1)} className="p-1 hover:bg-gray-100 rounded"><ChevronRight size={16} /></button>
          </div>
        </div>
        
        <p className="text-xs text-gray-500">{formatDate(selectedDate)}</p>

        {loading ? (
          <div className="text-center py-8 text-gray-400">Loading...</div>
        ) : activeEmployees.length === 0 ? (
          <div className="bg-white rounded-xl p-4 border border-gray-100">
            <Users size={32} className="text-gray-300 mx-auto mb-2" />
            <p className="text-sm text-gray-500 text-center">No employees found</p>
          </div>
        ) : (
          <div className="space-y-1">
            {activeEmployees.map((emp) => {
              const record = attendanceRecords.find(r => r.employeeId === emp.id)
              const hasRecord = !!record
              
              return (
                <div key={emp.id} className="bg-white rounded-lg border border-gray-100 overflow-hidden">
                  <div className="flex items-center justify-between p-2">
                    <div className="flex items-center gap-2 min-w-0">
                      {emp.photoURL ? (
                        <img src={emp.photoURL} alt="" className="w-7 h-7 rounded-full object-cover" />
                      ) : (
                        <div 
                          className="w-7 h-7 rounded-full flex items-center justify-center text-white text-[10px] font-bold shrink-0"
                          style={{ backgroundColor: getAvatarColor(emp.id) }}
                        >
                          {getInitials(emp.name)}
                        </div>
                      )}
                      <div className="min-w-0">
                        <p className="text-xs font-bold text-gray-800 truncate">{emp.name}</p>
                        <p className="text-[10px] text-gray-400">{emp.designation || 'Staff'}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-1">
                      {hasRecord ? (
                        <span className={`px-2 py-1 rounded text-[10px] font-bold ${
                          record.status === 'Present' 
                            ? 'bg-green-100 text-green-700' 
                            : 'bg-red-100 text-red-700'
                        }`}>
                          {record.status === 'Present' ? 'Present' : 'Absent'}
                        </span>
                      ) : (
                        <span className="text-[10px] text-gray-400">-</span>
                      )}
                    </div>
                  </div>
                  {!hasRecord && (
                    <div className="flex border-t border-gray-100">
                      <button 
                        onClick={() => handleMarkAttendance(emp.id, emp.name, 'present')}
                        disabled={saving}
                        className="flex-1 py-1.5 text-[10px] font-bold text-green-600 bg-green-50 hover:bg-green-100 transition-colors flex items-center justify-center gap-1"
                      >
                        <CheckCircle2 size={12} /> Present
                      </button>
                      <button 
                        onClick={() => handleMarkAttendance(emp.id, emp.name, 'absent')}
                        disabled={saving}
                        className="flex-1 py-1.5 text-[10px] font-bold text-red-600 bg-red-50 hover:bg-red-100 transition-colors border-l border-gray-100 flex items-center justify-center gap-1"
                      >
                        <XCircle size={12} /> Absent
                      </button>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <header className="sticky top-0 z-40 bg-white border-b border-gray-200 shadow-sm">
        <div className="flex items-center justify-between px-4 h-14">
          <div className="flex items-center gap-2">
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
            <div className="text-right hidden sm:block">
              <p className="text-xs font-bold text-gray-800">{user?.name}</p>
              <p className="text-[10px] text-gray-400 font-medium uppercase">{user?.role || 'Staff'}</p>
            </div>
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
          </div>
        </div>
      </header>

      <div className="flex-1 overflow-auto">
        {activeSection === 'dashboard' || activeSection === 'home' ? renderDashboard() : (
          <div className="p-4">
            <button 
              onClick={() => setActiveSection('dashboard')}
              className="text-sm text-indigo-600 font-medium mb-3"
            >
              ← Back to Dashboard
            </button>
            {renderContent()}
          </div>
        )}
      </div>

      <nav className="bg-white border-t border-gray-200 px-1 py-1">
        <div className="flex justify-around">
          <button 
            onClick={() => setActiveSection('dashboard')}
            className={`flex flex-col items-center py-1.5 px-2 ${activeSection === 'dashboard' || activeSection === 'home' ? 'text-indigo-600' : 'text-gray-400'}`}
          >
            <LayoutDashboard size={18} />
            <span className="text-[9px] font-medium mt-0.5">Home</span>
          </button>
          <button 
            onClick={() => setActiveSection('attendance')}
            className={`flex flex-col items-center py-1.5 px-2 ${activeSection === 'attendance' ? 'text-indigo-600' : 'text-gray-400'}`}
          >
            <Calendar size={18} />
            <span className="text-[9px] font-medium mt-0.5">Attendance</span>
          </button>
          <button 
            onClick={() => setActiveSection('portal')}
            className={`flex flex-col items-center py-1.5 px-2 ${activeSection === 'portal' ? 'text-indigo-600' : 'text-gray-400'}`}
          >
            <User size={18} />
            <span className="text-[9px] font-medium mt-0.5">Portal</span>
          </button>
          <button 
            onClick={logout}
            className="flex flex-col items-center py-1.5 px-2 text-gray-400"
          >
            <LogOut size={18} />
            <span className="text-[9px] font-medium mt-0.5">Logout</span>
          </button>
        </div>
      </nav>
    </div>
  )
}
