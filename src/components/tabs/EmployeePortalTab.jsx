import { useState, useEffect, useMemo } from 'react'
import { useAuth } from '../../hooks/useAuth'
import { useEmployees } from '../../hooks/useEmployees'
import { useAttendance, calcOT } from '../../hooks/useAttendance'
import { attendanceCol } from '../../lib/firestore'
import { db } from '../../lib/firebase'
import { collection, addDoc, query, where, getDocs, serverTimestamp, orderBy } from 'firebase/firestore'
import Spinner from '../ui/Spinner'
import Modal from '../ui/Modal'
import ImageViewer from '../ui/ImageViewer'
import TimePicker from '../ui/TimePicker'
import EmployeeSalarySlipTab from './EmployeeSalarySlipTab'
import { formatTimeTo12Hour } from '../../lib/salaryUtils'
import { 
  User, 
  Calendar, 
  FileText, 
  Plus, 
  ArrowRight, 
  ShieldCheck, 
  Mail, 
  Building, 
  Landmark, 
  Hash, 
  Clock, 
  LayoutDashboard,
  Phone,
  MapPin,
  Heart,
  Users as UsersIcon,
  Briefcase,
  Map,
  CreditCard,
  Target,
  ExternalLink,
  Eye,
  Lock,
  Smartphone,
  Info
} from 'lucide-react'

export default function EmployeePortalTab() {
  const { user } = useAuth()
  const { employees, loading: empLoading } = useEmployees(user?.orgId)
  const { fetchByDate, upsertAttendance } = useAttendance(user?.orgId)

  const employee = useMemo(() => {
    if (!user?.email || !employees.length) return null
    return employees.find(e => e.email?.toLowerCase() === user.email.toLowerCase())
  }, [employees, user?.email])

  const employeeId = employee?.id

  const [activePortalTab, setActivePortalTab] = useState('dashboard')
  const [loading, setLoading] = useState(false)
  const [requests, setRequests] = useState([])
  const [showRequestModal, setShowRequestModal] = useState(false)
  const [requestForm, setRequestForm] = useState({
    type: 'Leave',
    leaveType: '',
    fromDate: '',
    toDate: '',
    date: '',
    time: '',
    amount: '',
    reason: '',
  })
  const [showTimePicker, setShowTimePicker] = useState(false)
  const [month, setMonth] = useState(() => {
    const d = new Date()
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
  })
  const [attendanceRows, setAttendanceRows] = useState([])
  const [todayRecord, setTodayRecord] = useState(null)
  const [viewerState, setViewerState] = useState(null) // { docs, index }

  useEffect(() => {
    if (!user?.orgId || empLoading || !user?.email) return
    if (!employeeId && employees.length > 0) {
      console.log('EmployeePortalTab: No employee found for user', user.email)
      return
    }
    if (employeeId) {
      fetchRequests()
    }
  }, [user?.orgId, employeeId, empLoading, user?.email, employees.length])

  useEffect(() => {
    if (!user?.orgId || empLoading || !employeeId || !month) return

    const loadMonth = async () => {
      const [year, mon] = month.split('-')
      const start = `${month}-01`
      const endDay = new Date(year, mon, 0).getDate()
      const end = `${month}-${String(endDay).padStart(2, '0')}`

      const q = query(
        attendanceCol(user.orgId),
        where('employeeId', '==', employeeId),
        where('date', '>=', start),
        where('date', '<=', end)
      )
      const snap = await getDocs(q)
      const map = {}
      snap.docs.forEach(d => {
        const rec = d.data()
        map[rec.date] = rec
      })

      const days = []
      for (let i = 1; i <= endDay; i++) {
        const dStr = `${month}-${String(i).padStart(2, '0')}`
        days.push({ date: dStr, record: map[dStr] || null })
      }
      setAttendanceRows(days)
    }

    loadMonth()
  }, [user?.orgId, employeeId, month])

  useEffect(() => {
    if (!user?.orgId || empLoading || !employeeId) return
    const loadToday = async () => {
      const today = new Date().toISOString().split('T')[0]
      const records = await fetchByDate(today)
      setTodayRecord(records.find(r => r.employeeId === employeeId) || null)
    }
    loadToday()
  }, [user?.orgId, employeeId, fetchByDate, empLoading])

  const fetchRequests = async () => {
    setLoading(true)
    try {
      const q = query(
        collection(db, 'organisations', user.orgId, 'requests'),
        where('employeeId', '==', employeeId),
        orderBy('createdAt', 'desc')
      )
      const snap = await getDocs(q)
      setRequests(snap.docs.map(d => ({ id: d.id, ...d.data() })))
    } catch (err) {
      console.error('Portal fetch error:', err)
    } finally {
      setLoading(false)
    }
  }

  const handleRequestSubmit = async () => {
    if (!requestForm.reason) return
    setLoading(true)
    try {
      const base = {
        employeeId,
        employeeName: employee?.name || user.name,
        type: requestForm.type,
        status: 'Pending',
        createdAt: serverTimestamp(),
        reason: requestForm.reason,
      }

      let payload = base
      if (requestForm.type === 'Leave') {
        payload = {
          ...base,
          leaveType: requestForm.leaveType || '',
          fromDate: requestForm.fromDate,
          toDate: requestForm.toDate || requestForm.fromDate,
        }
      } else if (requestForm.type === 'Permission') {
        payload = {
          ...base,
          permissionDate: requestForm.date,
          permissionTime: requestForm.time,
        }
      } else if (requestForm.type === 'Advance') {
        payload = {
          ...base,
          amount: Number(requestForm.amount || 0),
        }
      }

      await addDoc(collection(db, 'organisations', user.orgId, 'requests'), {
        ...payload,
      })
      setShowRequestModal(false)
      fetchRequests()
    } catch (err) {
      alert('Failed to submit request')
    } finally {
      setLoading(false)
    }
  }

  const handleCheckIn = async () => {
    if (!employeeId) return
    const today = new Date().toISOString().split('T')[0]
    const now = new Date()
    const timeStr = now.toTimeString().slice(0, 5)

    const records = await fetchByDate(today)
    const mine = records.find(r => r.employeeId === employeeId)

    const row = mine || {
      employeeId,
      name: employee?.name || user.name,
      date: today,
      inDate: today,
      outDate: today,
      outTime: '',
      otHours: '00:00',
      isAbsent: false,
      sundayWorked: false,
      sundayHoliday: false,
      status: 'Present',
    }

    if (!row.inTime) {
      row.inTime = timeStr
      await upsertAttendance([row])
      setTodayRecord(row)
    }
  }

  const handleCheckOut = async () => {
    if (!employeeId) return
    const today = new Date().toISOString().split('T')[0]
    const now = new Date()
    const timeStr = now.toTimeString().slice(0, 5)
    const records = await fetchByDate(today)
    const mine = records.find(r => r.employeeId === employeeId)
    if (!mine) return

    mine.outTime = timeStr
    mine.otHours = calcOT(mine.inTime, mine.outTime, mine.inDate, mine.outDate, mine.workHours || 9)
    await upsertAttendance([mine])
    setTodayRecord(mine)
  }

  const getStatusLabel = (rec) => {
    if (!rec) return 'Absent'
    if (rec.inTime && !rec.outTime) return 'Pending Checkout'
    if (rec.isAbsent) return 'Absent'
    return 'Present'
  }

  if (empLoading || !user) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <Spinner />
          <p className="text-gray-400 text-sm font-medium">Loading your profile...</p>
        </div>
      </div>
    )
  }

  if (!user.email) {
    return (
      <div className="h-full flex items-center justify-center p-8">
        <div className="max-w-md w-full bg-white rounded-2xl p-10 border border-gray-100 shadow-xl text-center space-y-6">
          <div className="w-20 h-20 bg-amber-50 rounded-full flex items-center justify-center mx-auto border border-amber-100">
            <Lock className="text-amber-500" size={32} />
          </div>
          <div className="space-y-2">
            <h3 className="text-xl font-black text-gray-900 tracking-tight">Authentication Issue</h3>
            <p className="text-gray-500 text-sm leading-relaxed">
              Your user account does not have an email associated with it. 
              Please contact support or re-login.
            </p>
          </div>
        </div>
      </div>
    )
  }

  if (!employeeId && employees.length > 0) {
    return (
      <div className="h-full flex items-center justify-center p-8">
        <div className="max-w-md w-full bg-white rounded-2xl p-10 border border-gray-100 shadow-xl text-center space-y-6">
          <div className="w-20 h-20 bg-amber-50 rounded-full flex items-center justify-center mx-auto border border-amber-100">
            <User className="text-amber-500" size={32} />
          </div>
          <div className="space-y-2">
            <h3 className="text-xl font-black text-gray-900 tracking-tight">Employee Record Not Found</h3>
            <p className="text-gray-500 text-sm leading-relaxed">
              We couldn&apos;t find an employee record associated with <span className="font-bold text-gray-900">{user.email}</span>.
            </p>
          </div>
          <div className="pt-4 border-t border-gray-50 space-y-4">
            <div className="bg-gray-50 p-4 rounded-xl text-left flex gap-3">
              <Info size={18} className="text-indigo-500 shrink-0 mt-0.5" />
              <p className="text-[12px] text-gray-600 leading-relaxed">
                Please contact your HR administrator to ensure your email is correctly registered in the system.
              </p>
            </div>
            <p className="text-[11px] text-gray-400 uppercase tracking-widest font-bold">
              Org ID: {user.orgId || 'None'}
            </p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="h-full flex flex-col font-inter gap-8 pb-10">
      {/* SaaS Sub-Navigation */}
      <div className="bg-white p-6 rounded-[12px] shadow-sm border border-gray-100 flex justify-between items-center">
        <div className="flex bg-gray-100 p-1 rounded-lg">
          {[
            { id: 'dashboard', label: 'Dashboard', icon: <LayoutDashboard size={16} /> },
            { id: 'attendance', label: 'My Attendance', icon: <Calendar size={16} /> },
            { id: 'requests', label: 'My Requests', icon: <FileText size={16} /> },
            { id: 'salary', label: 'Salary Slip', icon: <Hash size={16} /> },
            { id: 'profile', label: 'Profile', icon: <User size={16} /> }
          ].map(t => (
            <button
              key={t.id}
              onClick={() => setActivePortalTab(t.id)}
              className={`flex items-center gap-2 px-5 py-2 rounded-md text-[13px] font-bold transition-all ${activePortalTab === t.id ? 'bg-white shadow-sm text-gray-900' : 'text-gray-400 hover:text-gray-600'}`}
            >
              {t.icon} {t.label}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-3">
          <div className="flex flex-col items-end mr-3">
            <span className="text-[11px] font-black text-indigo-600 uppercase tracking-widest">{user?.orgName}</span>
            <span className="text-[9px] font-bold text-gray-400 uppercase">Authenticated Session</span>
          </div>
          <div className="w-10 h-10 rounded-full bg-indigo-50 border border-indigo-100 flex items-center justify-center text-indigo-600 shadow-inner font-black text-sm">
            {user?.name?.[0]}
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-auto">
        {activePortalTab === 'dashboard' && (
          <div className="max-w-5xl mx-auto space-y-6">
            <div className="bg-white rounded-[12px] p-8 border border-gray-100 shadow-sm flex items-center justify-between">
              <div>
                <p className="text-[11px] font-bold text-gray-400 uppercase tracking-widest mb-1">Welcome</p>
                <h2 className="text-2xl font-black text-gray-900 tracking-tight">
                  {employee?.name || user?.name}
                </h2>
                <p className="text-[12px] text-gray-500 mt-2">
                  Quick access to your workday: attendance, requests and salary slips.
                </p>
              </div>
              <div className="flex gap-3">
                <button
                  onClick={() => setShowRequestModal(true)}
                  className="h-[40px] px-4 rounded-lg bg-indigo-600 text-white text-[11px] font-black uppercase tracking-[0.16em]"
                >
                  Apply Leave
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
              <div className="bg-white rounded-[12px] p-6 border border-gray-100 shadow-sm">
                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2">
                  Today&apos;s Attendance
                </p>
                {todayRecord ? (
                  <div className="space-y-2 text-[13px]">
                    <p className="font-semibold text-gray-800">
                      Status: {getStatusLabel(todayRecord)}
                    </p>
                    <p className="text-gray-500">
                      In: {todayRecord.inTime ? formatTimeTo12Hour(todayRecord.inTime) : '—'}
                    </p>
                    <p className="text-gray-500">
                      Out: {todayRecord.outTime ? formatTimeTo12Hour(todayRecord.outTime) : '—'}
                    </p>
                  </div>
                ) : (
                  <p className="text-[13px] text-gray-400">No record yet for today.</p>
                )}
              </div>

              <div className="bg-white rounded-[12px] p-6 border border-gray-100 shadow-sm">
                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2">
                  Leave Balance
                </p>
                <p className="text-2xl font-black text-gray-900">
                  {employee?.leaveBalance ?? '--'} <span className="text-sm font-semibold">days</span>
                </p>
                <p className="text-[12px] text-gray-500 mt-2">
                  Contact HR if your leave balance looks incorrect.
                </p>
              </div>

              <div className="bg-white rounded-[12px] p-6 border border-gray-100 shadow-sm">
                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2">
                  Approval Updates
                </p>
                <div className="space-y-2">
                  {requests.filter(r => r.status === 'Approved').slice(0, 2).map(req => (
                    <div key={req.id} className="flex items-center gap-2 text-[11px]">
                      <span className="w-2 h-2 rounded-full bg-green-500"></span>
                      <span className="text-gray-700 font-medium">
                        {req.type}: {req.status}
                      </span>
                    </div>
                  ))}
                  {requests.filter(r => r.status === 'Pending').length > 0 && (
                    <div className="flex items-center gap-2 text-[11px]">
                      <span className="w-2 h-2 rounded-full bg-amber-500"></span>
                      <span className="text-gray-700 font-medium">
                        {requests.filter(r => r.status === 'Pending').length} pending approval
                      </span>
                    </div>
                  )}
                  {requests.length === 0 && (
                    <p className="text-[12px] text-gray-400">No recent updates.</p>
                  )}
                </div>
              </div>
            </div>

            <div className="bg-white rounded-[12px] p-6 border border-gray-100 shadow-sm flex flex-wrap gap-3">
              <button
                onClick={() => setShowRequestModal(true)}
                className="h-[36px] px-4 rounded-lg bg-indigo-600 text-white text-[11px] font-black uppercase tracking-[0.18em]"
              >
                Apply Leave
              </button>
              <button
                onClick={() => {
                  setRequestForm(f => ({ ...f, type: 'Advance' }))
                  setShowRequestModal(true)
                }}
                className="h-[36px] px-4 rounded-lg bg-emerald-600 text-white text-[11px] font-black uppercase tracking-[0.18em]"
              >
                Request Advance
              </button>
              <button
                onClick={() => {
                  setRequestForm(f => ({ ...f, type: 'Permission' }))
                  setShowRequestModal(true)
                }}
                className="h-[36px] px-4 rounded-lg bg-amber-500 text-white text-[11px] font-black uppercase tracking-[0.18em]"
              >
                Request Permission
              </button>
            </div>
          </div>
        )}

        {activePortalTab === 'profile' && (
          <div className="max-w-6xl mx-auto space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-700 pb-20">
            {/* ── Modern Profile Header ─────────────────────────────────── */}
            <div className="relative group">
              {/* Decorative Background Elements */}
              <div className="absolute inset-0 bg-gradient-to-br from-indigo-600 via-violet-700 to-fuchsia-800 rounded-[40px] opacity-[0.03] -z-10 blur-3xl transform group-hover:scale-105 transition-transform duration-1000"></div>
              
              <div className="bg-white rounded-[40px] p-8 md:p-12 border border-gray-100 shadow-2xl shadow-gray-200/40 relative overflow-hidden">
                {/* Abstract Header Pattern */}
                <div className="absolute top-0 right-0 w-96 h-96 bg-gradient-to-br from-indigo-50/40 to-fuchsia-50/40 rounded-full -mr-48 -mt-48 blur-3xl group-hover:from-indigo-100/40 transition-colors duration-1000"></div>
                <div className="absolute bottom-0 left-0 w-64 h-64 bg-indigo-50/20 rounded-full -ml-32 -mb-32 blur-3xl"></div>

                <div className="relative z-10 flex flex-col lg:flex-row items-center lg:items-end gap-10">
                  {/* Profile Image Container */}
                  <div className="relative shrink-0">
                    <div className="w-40 h-40 md:w-52 md:h-52 rounded-[48px] overflow-hidden shadow-2xl ring-[12px] ring-white relative group/avatar">
                      {employee?.photoURL ? (
                        <img src={employee.photoURL} alt={user?.name} className="w-full h-full object-cover transform group-hover/avatar:scale-110 transition-transform duration-700" />
                      ) : (
                        <div className="w-full h-full bg-gradient-to-tr from-indigo-600 to-violet-700 flex items-center justify-center text-white text-6xl font-black">
                          {user?.name?.[0]}
                        </div>
                      )}
                    </div>
                    {/* Floating Status Badge */}
                    <div className="absolute -bottom-2 -right-2 bg-white p-2 rounded-2xl shadow-xl border border-gray-50 flex items-center gap-2 pr-4">
                      <div className={`w-3 h-3 rounded-full animate-pulse ${employee?.status === 'Active' ? 'bg-emerald-500' : 'bg-rose-500'}`}></div>
                      <span className="text-[10px] font-black uppercase tracking-widest text-gray-900">{employee?.status || 'Active'}</span>
                    </div>
                  </div>

                  {/* Header Text Content */}
                  <div className="flex-1 text-center lg:text-left pb-4">
                    <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-indigo-50 text-indigo-600 text-[10px] font-black uppercase tracking-widest mb-4">
                      <Lock size={12} /> Personal Secured Portal
                    </div>
                    <h2 className="text-4xl md:text-5xl lg:text-6xl font-black text-gray-900 tracking-tight mb-4 leading-tight">
                      {user?.name}
                    </h2>
                    <div className="flex flex-wrap justify-center lg:justify-start gap-4">
                      <div className="flex items-center gap-2 bg-gray-50 px-4 py-2 rounded-2xl border border-gray-100">
                        <Briefcase size={16} className="text-indigo-500" />
                        <span className="text-sm font-bold text-gray-700">{employee?.designation || 'Staff Member'}</span>
                      </div>
                      <div className="flex items-center gap-2 bg-gray-50 px-4 py-2 rounded-2xl border border-gray-100">
                        <Building size={16} className="text-violet-500" />
                        <span className="text-sm font-bold text-gray-700">{employee?.department || 'General'}</span>
                      </div>
                      <div className="flex items-center gap-2 bg-gray-50 px-4 py-2 rounded-2xl border border-gray-100">
                        <Hash size={16} className="text-blue-500" />
                        <span className="text-sm font-bold text-gray-700">{employee?.empCode || 'N/A'}</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
              {/* ── Left Column: Personal & Contact ────────────────────────── */}
              <div className="lg:col-span-2 space-y-8">
                
                {/* Personal Identity Details */}
                <div className="bg-white rounded-[32px] border border-gray-100 shadow-xl shadow-gray-200/20 overflow-hidden group">
                  <div className="px-8 py-6 border-b border-gray-50 bg-gray-50/30 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="p-2 bg-indigo-100 rounded-xl text-indigo-600"><UsersIcon size={18} /></div>
                      <span className="text-[12px] font-black text-gray-900 uppercase tracking-[0.2em]">Personal Identity</span>
                    </div>
                    <div className="w-10 h-1 bg-indigo-100 rounded-full"></div>
                  </div>
                  <div className="p-8 grid grid-cols-1 md:grid-cols-2 gap-y-10 gap-x-12">
                    {[
                      { label: "Father's Name", value: employee?.fatherName, icon: <User size={16} /> },
                      { label: "Mother's Name", value: employee?.motherName, icon: <User size={16} /> },
                      { label: 'Date of Birth', value: employee?.dob, icon: <Calendar size={16} /> },
                      { label: 'Blood Group', value: employee?.bloodGroup, icon: <Heart size={16} className="text-rose-500" /> },
                      { label: 'Marital Status', value: employee?.maritalStatus, icon: <UsersIcon size={16} /> },
                    ].map(item => (
                      <div key={item.label} className="group/item">
                        <div className="flex items-center gap-2 mb-2">
                          <div className="text-gray-300 group-hover/item:text-indigo-400 transition-colors">{item.icon}</div>
                          <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">{item.label}</p>
                        </div>
                        <p className="text-[15px] font-bold text-gray-800 ml-6">{item.value || '—'}</p>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Contact & Residence */}
                <div className="bg-white rounded-[32px] border border-gray-100 shadow-xl shadow-gray-200/20 overflow-hidden">
                  <div className="px-8 py-6 border-b border-gray-50 bg-gray-50/30 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="p-2 bg-emerald-100 rounded-xl text-emerald-600"><MapPin size={18} /></div>
                      <span className="text-[12px] font-black text-gray-900 uppercase tracking-[0.2em]">Contact & Residence</span>
                    </div>
                  </div>
                  <div className="p-8 space-y-10">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-10">
                      <div>
                        <div className="flex items-center gap-2 mb-2">
                          <Mail size={16} className="text-gray-300" />
                          <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Primary Email</p>
                        </div>
                        <p className="text-[15px] font-bold text-indigo-600 ml-6 underline underline-offset-4 decoration-indigo-100">{user?.email}</p>
                      </div>
                      <div>
                        <div className="flex items-center gap-2 mb-2">
                          <Smartphone size={16} className="text-gray-300" />
                          <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Mobile Number</p>
                        </div>
                        <p className="text-[15px] font-bold text-gray-800 ml-6 tabular-nums">{employee?.contactNo || '—'}</p>
                      </div>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-10">
                      <div>
                        <div className="flex items-center gap-2 mb-2">
                          <Phone size={16} className="text-gray-300" />
                          <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Emergency Contact</p>
                        </div>
                        <p className="text-[15px] font-bold text-gray-800 ml-6 tabular-nums">{employee?.emergencyContact || '—'}</p>
                      </div>
                      <div>
                        <div className="flex items-center gap-2 mb-2">
                          <Map size={16} className="text-gray-300" />
                          <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Permanent Address</p>
                        </div>
                        <p className="text-[14px] font-medium text-gray-600 leading-relaxed ml-6 max-w-sm">
                          {employee?.address || 'Master record does not contain specific residential documentation.'}
                        </p>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Statutory & Documentation */}
                <div className="bg-white rounded-[32px] border border-gray-100 shadow-xl shadow-gray-200/20 overflow-hidden">
                  <div className="px-8 py-6 border-b border-gray-50 bg-gray-50/30 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="p-2 bg-amber-100 rounded-xl text-amber-600"><FileText size={18} /></div>
                      <span className="text-[12px] font-black text-gray-900 uppercase tracking-[0.2em]">Statutory & Documents</span>
                    </div>
                  </div>
                  <div className="p-8">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-10 mb-10 pb-10 border-b border-gray-50">
                      <div className="bg-amber-50/30 p-6 rounded-[24px] border border-amber-100/50">
                        <p className="text-[10px] font-black text-amber-600 uppercase tracking-widest mb-2">Provident Fund (PF) No.</p>
                        <p className="text-[18px] font-mono font-black text-amber-900 tracking-wider">
                          {employee?.pfNo || 'NOT REGISTERED'}
                        </p>
                      </div>
                      <div className="bg-indigo-50/30 p-6 rounded-[24px] border border-indigo-100/50">
                        <div className="flex items-center justify-between mb-2">
                          <p className="text-[10px] font-black text-indigo-600 uppercase tracking-widest">Settlement Bank Account</p>
                          <Landmark size={14} className="text-indigo-400" />
                        </div>
                        <p className="text-[18px] font-mono font-black text-indigo-900 tracking-wider">
                          {employee?.bankAccount ? employee.bankAccount.replace(/\d(?=\d{4})/g, "•") : 'Not Configured'}
                        </p>
                      </div>
                    </div>

                    <h4 className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em] mb-6">Attached Master Documents</h4>
                    {(!employee?.documents || employee.documents.length === 0) ? (
                      <div className="flex flex-col items-center justify-center py-10 bg-gray-50/50 rounded-2xl border-2 border-dashed border-gray-100">
                        <FileText size={24} className="text-gray-200 mb-2" />
                        <p className="text-[11px] font-bold text-gray-400">No documents found in master record</p>
                      </div>
                    ) : (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        {employee.documents.map((doc, idx) => (
                          <div key={idx} className="flex items-center justify-between p-4 bg-white border border-gray-100 rounded-2xl hover:border-indigo-200 hover:shadow-lg transition-all group/doc">
                            <div className="flex items-center gap-4">
                              <div className="w-12 h-12 bg-indigo-50 rounded-xl flex items-center justify-center text-indigo-500 group-hover/doc:bg-indigo-600 group-hover/doc:text-white transition-colors">
                                <FileText size={20} />
                              </div>
                              <div>
                                <p className="text-[12px] font-bold text-gray-800 line-clamp-1">{doc.name}</p>
                                <p className="text-[10px] text-gray-400 uppercase font-black">{doc.type?.split('/')?.[1] || 'PDF'} File</p>
                              </div>
                            </div>
                            <button 
                              onClick={() => setViewerState({ docs: employee.documents, index: idx })}
                              className="p-2 hover:bg-indigo-50 rounded-lg text-indigo-400 hover:text-indigo-600 transition-colors"
                            >
                              <Eye size={18} />
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* ── Right Column: Professional Profile ──────────────────────── */}
              <div className="space-y-8">
                <div className="bg-white rounded-[32px] border border-gray-100 shadow-xl shadow-gray-200/20 overflow-hidden">
                  <div className="px-8 py-6 border-b border-gray-50 bg-gray-50/30 flex items-center gap-3">
                    <Target size={18} className="text-indigo-600" />
                    <span className="text-[12px] font-black text-gray-900 uppercase tracking-[0.2em]">Work Profile</span>
                  </div>
                  <div className="p-8">
                    <div className="space-y-6">
                      {[
                        { label: 'Date Joined', value: employee?.joinedDate, icon: <Calendar size={14} />, color: "text-emerald-500", bg: "bg-emerald-50" },
                        { label: 'Employment Type', value: employee?.employmentType, icon: <Briefcase size={14} />, color: "text-blue-500", bg: "bg-blue-50" },
                        { label: 'Work Location / Site', value: employee?.site, icon: <MapPin size={14} />, color: "text-orange-500", bg: "bg-orange-50" },
                        { label: 'System Role', value: employee?.role, icon: <ShieldCheck size={14} />, color: "text-violet-500", bg: "bg-violet-50" },
                        { label: 'Shift Schedule', value: `${employee?.workHours || 9} Hours Daily`, icon: <Clock size={14} />, color: "text-purple-500", bg: "bg-purple-50" },
                        { label: 'Reporting To', value: employee?.reportingManager, icon: <UsersIcon size={14} />, color: "text-indigo-500", bg: "bg-indigo-50" }
                      ].map(item => (
                        <div key={item.label} className="flex items-center justify-between group/work">
                          <div className="flex items-center gap-3">
                            <div className={`w-8 h-8 rounded-lg ${item.bg} ${item.color} flex items-center justify-center shrink-0`}>
                              {item.icon}
                            </div>
                            <p className="text-[11px] font-bold text-gray-400 uppercase tracking-tight">{item.label}</p>
                          </div>
                          <p className="text-[13px] font-black text-gray-700 text-right">{item.value || 'N/A'}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="bg-gray-900 rounded-[32px] p-8 text-white shadow-2xl relative overflow-hidden group">
                  <div className="absolute top-0 right-0 -mr-16 -mt-16 w-48 h-48 bg-white/5 rounded-full blur-3xl group-hover:bg-white/10 transition-colors duration-1000"></div>
                  <div className="relative z-10">
                    <div className="flex items-center gap-3 mb-6">
                      <div className="p-2 bg-white/10 rounded-xl"><Info size={18} className="text-white" /></div>
                      <h4 className="text-[11px] font-black uppercase tracking-[0.3em] text-white/50">Information</h4>
                    </div>
                    <p className="text-sm font-medium text-white/70 leading-relaxed mb-8">
                      Your profile details are managed by the HR operations team. If any information requires correction, please submit an official update request.
                    </p>
                    <button className="w-full py-4 bg-white text-gray-900 rounded-[20px] font-black text-[11px] uppercase tracking-widest hover:bg-indigo-50 transition-all shadow-xl hover:-translate-y-1">
                      Request Information Update
                    </button>
                  </div>
                </div>

                {/* Additional Stats Card */}
                <div className="bg-gradient-to-br from-indigo-600 to-violet-800 rounded-[32px] p-8 text-white shadow-xl relative overflow-hidden">
                   <div className="absolute top-0 right-0 p-4 opacity-20"><ShieldCheck size={64} /></div>
                   <h4 className="text-[11px] font-black uppercase tracking-[0.3em] text-white/50 mb-4">Security</h4>
                   <p className="text-2xl font-black mb-1">Authenticated</p>
                   <p className="text-xs text-white/60 font-bold uppercase tracking-widest">Secure Access Session</p>
                </div>
              </div>
            </div>
          </div>
        )}

        {viewerState && (
          <ImageViewer
            docs={viewerState.docs}
            index={viewerState.index}
            onClose={() => setViewerState(null)}
          />
        )}

        {activePortalTab === 'attendance' && (
          <div className="max-w-5xl mx-auto space-y-4">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <button
                  onClick={() =>
                    setMonth(prev => {
                      const [y, m] = prev.split('-').map(Number)
                      const d = new Date(y, m - 2, 1)
                      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
                    })
                  }
                  className="px-2 py-1 rounded-md hover:bg-gray-100 text-gray-500"
                >
                  ◀
                </button>
                <span className="text-sm font-semibold text-gray-800">
                  {month}
                </span>
                <button
                  onClick={() =>
                    setMonth(prev => {
                      const [y, m] = prev.split('-').map(Number)
                      const d = new Date(y, m, 1)
                      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
                    })
                  }
                  className="px-2 py-1 rounded-md hover:bg-gray-100 text-gray-500"
                >
                  ▶
                </button>
              </div>
              <input
                type="month"
                value={month}
                onChange={e => setMonth(e.target.value)}
                className="h-[36px] border border-gray-200 rounded-lg px-3 text-sm bg-gray-50/50 outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>

            <div className="bg-white rounded-[12px] border border-gray-100 shadow-sm overflow-hidden">
              <table className="w-full text-left border-collapse">
                <thead className="bg-[#f9fafb]">
                  <tr className="h-[38px]">
                    <th className="px-4 text-[11px] font-semibold text-gray-500 uppercase tracking-widest">
                      Date
                    </th>
                    <th className="px-4 text-[11px] font-semibold text-gray-500 uppercase tracking-widest text-center">
                      In Time
                    </th>
                    <th className="px-4 text-[11px] font-semibold text-gray-500 uppercase tracking-widest text-center">
                      Out Time
                    </th>
                    <th className="px-4 text-[11px] font-semibold text-gray-500 uppercase tracking-widest text-center">
                      OT
                    </th>
                    <th className="px-4 text-[11px] font-semibold text-gray-500 uppercase tracking-widest text-center">
                      Advance
                    </th>
                    <th className="px-4 text-[11px] font-semibold text-gray-500 uppercase tracking-widest text-center">
                      Status
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {attendanceRows.map(r => {
                    const rec = r.record
                    const d = new Date(r.date)
                    const dayOfWeek = d.getDay()
                    const label = d.toLocaleDateString(undefined, {
                      day: '2-digit',
                      month: 'short',
                    })
                    const isOvernight = rec?.outTime && rec?.inDate && rec?.outDate && rec.outDate !== rec.inDate
                    return (
                      <tr key={r.date} className="h-[34px] hover:bg-gray-50/60">
                        <td className="px-4 text-[12px] text-gray-700">
                          {label}
                          {dayOfWeek === 0 && <span className="ml-2 text-[9px] font-bold text-orange-500 uppercase">Sun</span>}
                        </td>
                        <td className="px-4 text-[12px] text-center text-gray-800">
                          {rec?.inTime ? formatTimeTo12Hour(rec.inTime) : '—'}
                        </td>
                        <td className="px-4 text-[12px] text-center text-gray-800">
                          {rec?.outTime ? (
                            <span className="inline-flex items-center gap-1">
                              {isOvernight && <span className="text-[10px] text-indigo-500">→</span>}
                              {formatTimeTo12Hour(rec.outTime)}
                            </span>
                          ) : '—'}
                        </td>
                        <td className="px-4 text-[12px] text-center text-gray-900 font-mono">
                          {rec?.otHours || '00:00'}
                        </td>
                        <td className="px-4 text-[12px] text-center text-gray-500">
                          {rec?.advanceAmount ? `₹${rec.advanceAmount}` : '—'}
                        </td>
                        <td className="px-4 text-[11px] text-center">
                          {rec?.sundayWorked ? (
                            <span className="inline-flex px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-widest bg-amber-100 text-amber-700">
                              Sun Worked
                            </span>
                          ) : rec?.sundayHoliday ? (
                            <span className="inline-flex px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-widest bg-indigo-100 text-indigo-700">
                              Sun Holiday
                            </span>
                          ) : rec?.isAbsent ? (
                            <span className="inline-flex px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-widest bg-red-100 text-red-700">
                              Absent
                            </span>
                          ) : rec?.inTime ? (
                            <span className="inline-flex px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-widest bg-green-100 text-green-700">
                              Present
                            </span>
                          ) : (
                            <span className="inline-flex px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-widest bg-gray-100 text-gray-600">
                              {getStatusLabel(rec)}
                            </span>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                  {attendanceRows.length === 0 && (
                    <tr>
                      <td
                        colSpan={6}
                        className="px-4 py-8 text-center text-[12px] text-gray-300 font-medium uppercase tracking-widest"
                      >
                        No attendance records for this month
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {activePortalTab === 'requests' && (
          <div className="max-w-6xl mx-auto space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="flex justify-between items-center px-4">
              <div>
                <h3 className="text-xl font-black text-gray-900 uppercase tracking-tight">My Requests</h3>
                <p className="text-[11px] text-gray-400 font-bold uppercase tracking-widest mt-1">Track your leave, permission and advance requests</p>
              </div>
              <button onClick={() => setShowRequestModal(true)} className="h-[44px] px-8 bg-indigo-600 text-white font-black rounded-xl shadow-xl shadow-indigo-900/10 hover:bg-indigo-700 transition-all uppercase tracking-[0.15em] text-[11px] flex items-center gap-3">
                <Plus size={18} strokeWidth={3} /> Initialize Request
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 px-4">
              {requests.filter(req => {
                if (req.status === 'Pending') return true
                if (req.status === 'Approved') {
                  const today = new Date().toISOString().split('T')[0]
                  if (req.type === 'Leave') {
                    return req.toDate >= today || req.fromDate >= today
                  }
                  if (req.type === 'Permission') {
                    return req.permissionDate >= today
                  }
                  if (req.type === 'Advance') {
                    return true
                  }
                  return true
                }
                return true
              }).map(req => (
                <div key={req.id} className="bg-white p-8 rounded-[12px] border border-gray-100 shadow-sm flex flex-col relative overflow-hidden group hover:shadow-lg transition-all">
                  <div className={`absolute top-0 right-0 px-4 py-1.5 rounded-bl-xl text-[9px] font-black uppercase tracking-[0.2em] ${req.status === 'Approved' ? 'bg-green-100 text-green-700 border-l border-b border-green-200' : req.status === 'Rejected' ? 'bg-red-100 text-red-700 border-l border-b border-red-200' : 'bg-amber-50 text-amber-600 border-l border-b border-amber-100'}`}>
                    {req.status}
                  </div>
                  <div className="mb-6 flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-gray-50 border border-gray-100 flex items-center justify-center text-gray-400 group-hover:text-indigo-600 transition-colors">
                      <FileText size={20} />
                    </div>
                    <span className="bg-gray-100 text-gray-600 px-3 py-1 rounded-md text-[10px] font-black uppercase tracking-widest">{req.type}</span>
                  </div>
                  <p className="text-[10px] font-bold text-gray-400 uppercase mb-2 tracking-widest flex items-center gap-2">
                    <Calendar size={12} /> Details
                  </p>
                  <p className="text-sm font-black text-gray-800 mb-6 flex items-center gap-2">
                    {req.type === 'Leave' && (
                      <>
                        {req.leaveType || 'Leave'}: {req.fromDate} <ArrowRight size={14} className="text-gray-300" />{' '}
                        {req.toDate || req.fromDate}
                      </>
                    )}
                    {req.type === 'Permission' && (
                      <>
                        {req.permissionDate} at {req.permissionTime || '--'}
                      </>
                    )}
                    {req.type === 'Advance' && <>₹{req.amount}</>}
                  </p>
                  <p className="text-[10px] font-bold text-gray-400 uppercase mb-2 tracking-widest">Justification</p>
                  <p className="text-[13px] font-medium text-gray-600 italic leading-relaxed line-clamp-3">"{req.reason}"</p>
                  
                  <div className="mt-8 pt-6 border-t border-gray-50 flex justify-between items-center opacity-0 group-hover:opacity-100 transition-opacity">
                    <span className="text-[9px] font-black text-gray-300 uppercase">ID: {req.id.slice(-6)}</span>
                    {req.status === 'Pending' && (
                      <button className="text-[9px] font-black text-red-400 uppercase hover:text-red-600">Withdraw</button>
                    )}
                  </div>
                </div>
              ))}
              {requests.filter(req => {
                if (req.status === 'Pending') return true
                if (req.status === 'Approved') {
                  const today = new Date().toISOString().split('T')[0]
                  if (req.type === 'Leave') {
                    return req.toDate >= today || req.fromDate >= today
                  }
                  if (req.type === 'Permission') {
                    return req.permissionDate >= today
                  }
                  if (req.type === 'Advance') {
                    return true
                  }
                  return true
                }
                return true
              }).length === 0 && (
                <div className="col-span-full py-32 text-center">
                  <div className="w-20 h-20 rounded-full bg-gray-50 flex items-center justify-center mx-auto mb-6 text-gray-200"><FileText size={40} /></div>
                  <p className="text-gray-300 font-medium uppercase tracking-[0.25em] text-xl italic opacity-40">No internal records found</p>
                </div>
              )}
            </div>
          </div>
        )}

        {activePortalTab === 'salary' && (
          <div className="max-w-4xl mx-auto animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="bg-white rounded-[12px] p-12 border border-gray-100 shadow-sm text-center">
              <div className="w-20 h-20 rounded-full bg-gray-50 flex items-center justify-center mx-auto mb-6 text-gray-200">
                <Hash size={40} />
              </div>
              <h3 className="text-xl font-black text-gray-900 uppercase tracking-tight mb-2">Salary Slip</h3>
              <p className="text-[13px] text-gray-400 font-medium uppercase tracking-widest">Not Generated</p>
              <p className="text-[12px] text-gray-500 mt-4">Your salary slip will be available here once generated by HR.</p>
            </div>
          </div>
        )}
      </div>

      <Modal isOpen={showRequestModal} onClose={() => setShowRequestModal(false)} title="New Request">
        <form onSubmit={e => { e.preventDefault(); handleRequestSubmit(); }} className="p-10 space-y-8 max-w-lg mx-auto font-inter">
          <div>
            <label className="block text-[11px] font-black text-gray-400 uppercase tracking-widest mb-3 px-1">Request Type</label>
            <div className="flex bg-gray-100 p-1.5 rounded-xl border border-gray-200">
              {['Leave', 'Permission', 'Advance'].map(t => (
                <button key={t} type="button" onClick={() => setRequestForm(f => ({ ...f, type: t }))} className={`flex-1 py-3 rounded-lg text-[11px] font-black tracking-[0.1em] transition-all uppercase ${requestForm.type === t ? 'bg-white shadow-lg text-indigo-600 border border-indigo-50' : 'text-gray-400'}`}>{t}</button>
              ))}
            </div>
          </div>
          {requestForm.type === 'Leave' && (
            <div className="space-y-4">
              <div>
                <label className="block text-[11px] font-bold text-gray-400 uppercase tracking-widest mb-2 px-1">
                  Leave Type
                </label>
                <select
                  value={requestForm.leaveType}
                  onChange={e => setRequestForm(f => ({ ...f, leaveType: e.target.value }))}
                  className="w-full h-[44px] border border-gray-200 rounded-lg px-4 text-sm font-bold bg-gray-50/50 focus:ring-2 focus:ring-indigo-500 outline-none"
                >
                  <option value="">Select Leave Type</option>
                  <option value="Casual">Casual Leave</option>
                  <option value="Sick">Sick Leave</option>
                  <option value="Paid">Paid Leave</option>
                  <option value="Personal">Personal Leave</option>
                  <option value="LOP">Loss of Pay (LOP)</option>
                </select>
              </div>
              <div className="grid grid-cols-2 gap-6">
                <div>
                  <label className="block text-[11px] font-bold text-gray-400 uppercase tracking-widest mb-2 px-1">
                    From Date
                  </label>
                  <input
                    type="date"
                    value={requestForm.fromDate}
                    onChange={e => setRequestForm(f => ({ ...f, fromDate: e.target.value }))}
                    className="w-full h-[44px] border border-gray-200 rounded-lg px-4 text-sm font-bold bg-gray-50/50 focus:ring-2 focus:ring-indigo-500 outline-none"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-gray-400 uppercase tracking-widest mb-2 px-1">
                    To Date
                  </label>
                  <input
                    type="date"
                    value={requestForm.toDate}
                    onChange={e => setRequestForm(f => ({ ...f, toDate: e.target.value }))}
                    className="w-full h-[44px] border border-gray-200 rounded-lg px-4 text-sm font-bold bg-gray-50/50 focus:ring-2 focus:ring-indigo-500 outline-none"
                  />
                </div>
              </div>
            </div>
          )}

          {requestForm.type === 'Permission' && (
            <div className="grid grid-cols-2 gap-6">
              <div>
                <label className="block text-[11px] font-bold text-gray-400 uppercase tracking-widest mb-2 px-1">
                  Date
                </label>
                <input
                  type="date"
                  value={requestForm.date}
                  onChange={e => setRequestForm(f => ({ ...f, date: e.target.value }))}
                  className="w-full h-[44px] border border-gray-200 rounded-lg px-4 text-sm font-bold bg-gray-50/50 focus:ring-2 focus:ring-indigo-500 outline-none"
                />
              </div>
              <div>
                <label className="block text-[11px] font-bold text-gray-400 uppercase tracking-widest mb-2 px-1">
                  Time
                </label>
                <div className="relative">
                  <button
                    onClick={() => setShowTimePicker(!showTimePicker)}
                    className="w-full h-[44px] border border-gray-200 rounded-lg px-4 text-sm font-bold bg-gray-50/50 focus:ring-2 focus:ring-indigo-500 outline-none text-left flex items-center justify-between"
                  >
                    <span>{requestForm.time ? (() => {
                      const [h, m] = requestForm.time.split(':').map(Number)
                      const p = h >= 12 ? 'PM' : 'AM'
                      const h12 = h % 12 || 12
                      return `${h12}:${String(m).padStart(2, '0')} ${p}`
                    })() : 'Select time'}</span>
                  </button>
                  {showTimePicker && (
                    <TimePicker
                      value={requestForm.time || '09:00'}
                      onChange={(time) => setRequestForm(f => ({ ...f, time }))}
                      onClose={() => setShowTimePicker(false)}
                    />
                  )}
                </div>
              </div>
            </div>
          )}

          {requestForm.type === 'Advance' && (
            <div>
              <label className="block text-[11px] font-bold text-gray-400 uppercase tracking-widest mb-2 px-1">
                Amount
              </label>
              <input
                type="number"
                value={requestForm.amount}
                onChange={e => setRequestForm(f => ({ ...f, amount: e.target.value }))}
                className="w-full h-[44px] border border-gray-200 rounded-lg px-4 text-sm font-bold bg-gray-50/50 focus:ring-2 focus:ring-indigo-500 outline-none"
                placeholder="₹"
              />
            </div>
          )}
          <div>
            <label className="block text-[11px] font-bold text-gray-400 uppercase tracking-widest mb-2 px-1">Detailed Justification</label>
            <textarea value={requestForm.reason} onChange={e => setRequestForm(f => ({ ...f, reason: e.target.value }))} className="w-full border border-gray-200 rounded-xl p-5 text-sm font-medium outline-none bg-gray-50/50 focus:ring-2 focus:ring-indigo-500 h-[120px] transition-all" placeholder="Briefly state the reason for this administrative request..." />
          </div>
          <button type="submit" disabled={loading} className="w-full h-[48px] bg-indigo-600 text-white font-black py-3 rounded-xl shadow-2xl shadow-indigo-900/20 hover:bg-indigo-700 transition-all uppercase tracking-[0.25em] text-[12px]">
            Submit for Approval
          </button>
        </form>
      </Modal>
    </div>
  )
}
