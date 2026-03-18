import React, { useState, useEffect, useMemo } from 'react'
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
import { useLeaves } from '../../hooks/useLeaves'
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

export default function EmployeePortalTab({ portalSubTab: initialSubTab = 'dashboard' }) {
  const { user } = useAuth()
  const { employees, loading: empLoading } = useEmployees(user?.orgId)
  const { fetchByDate, upsertAttendance } = useAttendance(user?.orgId)

  const employee = useMemo(() => {
    if (!user || !employees.length) {
      console.log('[DEBUG] Employee lookup failed:', { userEmail: user?.email, employeesCount: employees.length })
      return null
    }
    const normalizedUserEmail = user.email?.toLowerCase().trim() || ''
    const normalizedUserId = user.uid?.toLowerCase().trim() || ''
    console.log('[DEBUG] Looking for employee with email:', normalizedUserEmail, 'or uid:', normalizedUserId)
    console.log('[DEBUG] Total employees:', employees.length)
    
    const found = employees.find(e => {
      const empEmail = (e.email || '').toLowerCase().trim()
      const empCode = (e.empCode || '').toLowerCase().trim()
      const empName = e.name || 'Unknown'
      const matchEmail = empEmail === normalizedUserEmail
      const matchEmpCode = empCode === normalizedUserEmail
      const matchUid = e.id?.toLowerCase().trim() === normalizedUserId
      const match = matchEmail || matchEmpCode || matchUid
      if (e.email || e.empCode) {
        console.log(`[DEBUG] Comparing: email=${empEmail}, empCode=${empCode} vs ${normalizedUserEmail} => ${match} (Employee: ${empName})`)
      }
      return match
    })
    
    if (!found) {
      console.log('[DEBUG] No employee found. All employee emails/codes:')
      employees.forEach((e, i) => {
        console.log(`  ${i+1}. ${e.name}: email='${e.email || 'NULL'}', empCode='${e.empCode || 'NULL'}' (id: ${e.id})`)
      })
    } else {
      console.log('[DEBUG] Found employee:', found.name, found.id)
    }
    
    return found
  }, [employees, user?.email, user?.uid])

  const employeeId = employee?.id || user?.uid

  const [activePortalTab, setActivePortalTab] = useState(initialSubTab)
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
    if (employeeId) {
      fetchRequests()
    }
  }, [user?.orgId, employeeId, empLoading, user?.email])

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
      const ordinaryRequests = snap.docs.map(d => ({ id: d.id, ...d.data(), source: 'requests' }))

      const q2 = query(
        collection(db, 'organisations', user.orgId, 'advances_expenses'),
        where('employeeId', '==', employeeId),
        orderBy('createdAt', 'desc')
      )
      const snap2 = await getDocs(q2)
      const advExpRequests = snap2.docs.map(d => ({ id: d.id, ...d.data(), source: 'advances_expenses' }))

      // Merge and sort
      const merged = [...ordinaryRequests, ...advExpRequests].sort((a, b) => {
        const dateA = a.createdAt?.toDate ? a.createdAt.toDate() : new Date(0)
        const dateB = b.createdAt?.toDate ? b.createdAt.toDate() : new Date(0)
        return dateB - dateA
      })

      setRequests(merged)
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
      if (requestForm.type === 'Leave') {
        await applyLeave({
          employeeId,
          employeeName: employee?.name || user.name,
          leaveType: requestForm.leaveType || 'Casual',
          fromDate: requestForm.fromDate,
          toDate: requestForm.toDate || requestForm.fromDate,
          reason: requestForm.reason,
          orgId: user.orgId
        })
      } else {
        const base = {
          employeeId,
          employeeName: employee?.name || user.name,
          type: requestForm.type,
          status: 'Pending',
          createdAt: serverTimestamp(),
          reason: requestForm.reason,
          hrApproval: 'Pending',
          mdApproval: 'Pending',
          orgId: user.orgId
        }

        let payload = base
        if (requestForm.type === 'Permission') {
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

        await addDoc(collection(db, 'organisations', user.orgId, 'requests'), payload)
      }
      
      setShowRequestModal(false)
      fetchRequests()
    } catch (err) {
      alert('Failed to submit request: ' + err.message)
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
    mine.otHours = calcOT(mine.inTime, mine.outTime, mine.inDate, mine.outDate, mine.minDailyHours || 8)
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
          <div className="max-w-5xl mx-auto animate-in fade-in slide-in-from-bottom-4 duration-700 pb-20 px-4 md:px-0 font-inter">
            {/* Header section with profile overview */}
            <div className="flex flex-col md:flex-row items-center gap-8 mb-12">
              <div className="relative group">
                <div className="w-32 h-32 md:w-40 md:h-40 rounded-full overflow-hidden border-4 border-white shadow-xl ring-1 ring-gray-100">
                  {employee?.photoURL ? (
                    <img 
                      src={employee.photoURL} 
                      alt={user?.name} 
                      className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110" 
                    />
                  ) : (
                    <div className="w-full h-full bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center text-white text-4xl font-bold">
                      {user?.name?.[0]}
                    </div>
                  )}
                </div>
                <div className={`absolute bottom-2 right-2 w-5 h-5 rounded-full border-2 border-white shadow-sm ${employee?.status === 'Active' ? 'bg-emerald-500' : 'bg-rose-500'}`}></div>
              </div>

              <div className="text-center md:text-left flex-1">
                <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-indigo-50 text-indigo-600 text-[10px] font-bold uppercase tracking-wider mb-3">
                  <ShieldCheck size={12} /> Employee Portal Verified
                </div>
                <h2 className="text-3xl md:text-4xl font-bold text-gray-900 mb-2 leading-tight">
                  {user?.name}
                </h2>
                <div className="flex flex-wrap justify-center md:justify-start gap-x-6 gap-y-2 text-sm text-gray-500 font-medium">
                  <div className="flex items-center gap-1.5">
                    <Briefcase size={16} className="text-gray-400" />
                    {employee?.designation || 'Staff Member'}
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Building size={16} className="text-gray-400" />
                    {employee?.department || 'General'}
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Hash size={16} className="text-gray-400" />
                    ID: {employee?.empCode || 'N/A'}
                  </div>
                </div>
              </div>
            </div>

            {/* Two-Column Details Grid */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-x-12 gap-y-12">
              
              {/* Left Column: Personal Information */}
              <div className="space-y-10">
                <section>
                  <h3 className="text-sm font-bold text-gray-400 uppercase tracking-[0.2em] mb-6 flex items-center gap-2">
                    <User size={16} /> Personal Identity
                  </h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-y-6 gap-x-8">
                    {[
                      { label: "Father's Name", value: employee?.fatherName },
                      { label: "Mother's Name", value: employee?.motherName },
                      { label: 'Date of Birth', value: employee?.dob },
                      { label: 'Blood Group', value: employee?.bloodGroup },
                      { label: 'Marital Status', value: employee?.maritalStatus },
                      { label: 'Joining Date', value: employee?.joinedDate },
                    ].map(item => (
                      <div key={item.label}>
                        <p className="text-[11px] font-medium text-gray-400 mb-1">{item.label}</p>
                        <p className="text-[14px] font-semibold text-gray-800">{item.value || '—'}</p>
                      </div>
                    ))}
                  </div>
                </section>

                <section>
                  <h3 className="text-sm font-bold text-gray-400 uppercase tracking-[0.2em] mb-6 flex items-center gap-2">
                    <MapPin size={16} /> Contact & Address
                  </h3>
                  <div className="space-y-6">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-y-6 gap-x-8">
                      <div>
                        <p className="text-[11px] font-medium text-gray-400 mb-1">Primary Email</p>
                        <p className="text-[14px] font-semibold text-indigo-600">{user?.email}</p>
                      </div>
                      <div>
                        <p className="text-[11px] font-medium text-gray-400 mb-1">Mobile Number</p>
                        <p className="text-[14px] font-semibold text-gray-800">{employee?.contactNo || '—'}</p>
                      </div>
                      <div>
                        <p className="text-[11px] font-medium text-gray-400 mb-1">Emergency Contact</p>
                        <p className="text-[14px] font-semibold text-gray-800">{employee?.emergencyContact || '—'}</p>
                      </div>
                    </div>
                    <div>
                      <p className="text-[11px] font-medium text-gray-400 mb-1">Permanent Address</p>
                      <p className="text-[14px] font-semibold text-gray-700 leading-relaxed max-w-md">
                        {employee?.address || 'Residential details not specified in record.'}
                      </p>
                    </div>
                  </div>
                </section>
              </div>

              {/* Right Column: Work & Statutory Information */}
              <div className="space-y-10">
                <section>
                  <h3 className="text-sm font-bold text-gray-400 uppercase tracking-[0.2em] mb-6 flex items-center gap-2">
                    <Target size={16} /> Work Profile
                  </h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-y-6 gap-x-8">
                    {[
                      { label: 'Employment Type', value: employee?.employmentType },
                      { label: 'Work Location / Site', value: employee?.site },
                      { label: 'System Role', value: employee?.role },
                      { label: 'Shift Schedule', value: `${employee?.workHours || 9} Hours Daily` },
                      { label: 'Reporting To', value: employee?.reportingManager },
                    ].map(item => (
                      <div key={item.label}>
                        <p className="text-[11px] font-medium text-gray-400 mb-1">{item.label}</p>
                        <p className="text-[14px] font-semibold text-gray-800">{item.value || 'N/A'}</p>
                      </div>
                    ))}
                  </div>
                </section>

                <section>
                  <h3 className="text-sm font-bold text-gray-400 uppercase tracking-[0.2em] mb-6 flex items-center gap-2">
                    <Landmark size={16} /> Financial & Statutory
                  </h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-y-6 gap-x-8">
                    <div>
                      <p className="text-[11px] font-medium text-gray-400 mb-1">Provident Fund (PF) No.</p>
                      <p className="text-[14px] font-bold text-gray-800 font-mono tracking-tight">{employee?.pfNo || 'NOT REGISTERED'}</p>
                    </div>
                    <div>
                      <p className="text-[11px] font-medium text-gray-400 mb-1">Bank Account</p>
                      <p className="text-[14px] font-bold text-gray-800 font-mono tracking-tight">
                        {employee?.bankAccount ? employee.bankAccount.replace(/\d(?=\d{4})/g, "•") : 'Not Configured'}
                      </p>
                    </div>
                  </div>
                </section>

                <section>
                  <h3 className="text-sm font-bold text-gray-400 uppercase tracking-[0.2em] mb-4 flex items-center gap-2">
                    <FileText size={16} /> Documents
                  </h3>
                  {(!employee?.documents || employee.documents.length === 0) ? (
                    <p className="text-xs text-gray-400 italic">No master documents attached.</p>
                  ) : (
                    <div className="space-y-2">
                      {employee.documents.map((doc, idx) => (
                        <div key={idx} className="flex items-center justify-between p-3 bg-gray-50 rounded-xl border border-gray-100 group transition-all hover:bg-white hover:shadow-sm">
                          <div className="flex items-center gap-3">
                            <FileText size={16} className="text-gray-400" />
                            <span className="text-xs font-semibold text-gray-700">{doc.name}</span>
                          </div>
                          <button 
                            onClick={() => setViewerState({ docs: employee.documents, index: idx })}
                            className="p-1.5 hover:bg-indigo-50 rounded-lg text-indigo-400 hover:text-indigo-600 transition-colors"
                          >
                            <Eye size={16} />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </section>
                
                <div className="pt-6 border-t border-gray-100">
                  <div className="bg-amber-50 rounded-2xl p-5 border border-amber-100 flex gap-4">
                    <div className="shrink-0 text-amber-500"><Info size={20} /></div>
                    <div>
                      <h4 className="text-[11px] font-bold text-amber-800 uppercase tracking-wider mb-1">Information Update</h4>
                      <p className="text-[12px] text-amber-700/80 leading-relaxed mb-4">
                        Information is managed by HR. If any details require correction, please contact your operations team.
                      </p>
                      <button className="text-[11px] font-bold text-indigo-600 uppercase tracking-widest hover:underline">
                        Request update
                      </button>
                    </div>
                  </div>
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
                <p className="text-[11px] text-gray-400 font-medium uppercase tracking-widest mt-1">Track your leave, permission and advance requests</p>
              </div>
              <button onClick={() => setShowRequestModal(true)} className="h-[44px] px-8 bg-indigo-600 text-white font-black rounded-xl shadow-xl shadow-indigo-900/10 hover:bg-indigo-700 transition-all uppercase tracking-[0.15em] text-[11px] flex items-center gap-3">
                <Plus size={18} strokeWidth={3} /> Initialize Request
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 px-4">
              {requests.map(req => (
                <div key={req.id} className="bg-white p-8 rounded-[12px] border border-gray-100 shadow-sm flex flex-col relative overflow-hidden group hover:shadow-lg transition-all">
                  <div className={`absolute top-0 right-0 px-4 py-1.5 rounded-bl-xl text-[9px] font-black uppercase tracking-[0.2em] ${req.status === 'Approved' ? 'bg-green-100 text-green-700 border-l border-b border-green-200' : req.status === 'Rejected' ? 'bg-red-100 text-red-700 border-l border-b border-red-200' : 'bg-amber-50 text-amber-600 border-l border-b border-amber-100'}`}>
                    {req.status}
                  </div>
                  <div className="mb-6 flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-gray-50 border border-gray-100 flex items-center justify-center text-gray-400 group-hover:text-indigo-600 transition-colors">
                      <FileText size={20} />
                    </div>
                    <span className="bg-gray-100 text-gray-600 px-3 py-1 rounded-md text-[10px] font-black uppercase tracking-widest">{req.type}</span>
                    {req.source === 'advances_expenses' && (
                      <span className="bg-indigo-50 text-indigo-600 px-3 py-1 rounded-md text-[10px] font-black uppercase tracking-widest">{req.category}</span>
                    )}
                  </div>
                  
                  <div className="flex items-center justify-between mb-4">
                    <div>
                      <p className="text-[10px] font-bold text-gray-400 uppercase mb-2 tracking-widest flex items-center gap-2">
                        <Calendar size={12} /> Details
                      </p>
                      <p className="text-sm font-black text-gray-800 mb-2 flex items-center gap-2">
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
                        {(req.type === 'Advance' || req.type === 'Expense') && <>₹{req.amount}</>}
                      </p>
                    </div>
                    {(req.type === 'Advance' || req.type === 'Expense') && req.date && (
                      <div className="text-right">
                         <p className="text-[10px] font-bold text-gray-400 uppercase mb-2 tracking-widest">Entry Date</p>
                         <p className="text-[12px] font-bold text-gray-700">{req.date}</p>
                      </div>
                    )}
                  </div>
                  
                  <div className="grid grid-cols-2 gap-4 mb-4 bg-gray-50 p-3 rounded-lg border border-gray-100">
                    <div className="flex flex-col">
                      <span className="text-[9px] font-black text-gray-400 uppercase tracking-tight mb-1">Status 1 (HR Approval)</span>
                      <div className="flex items-center gap-1.5">
                        <div className={`w-1.5 h-1.5 rounded-full ${req.hrApproval === 'Approved' ? 'bg-green-500' : req.hrApproval === 'Rejected' ? 'bg-red-500' : 'bg-amber-500'}`}></div>
                        <span className={`text-[10px] font-black uppercase ${req.hrApproval === 'Approved' ? 'text-green-700' : req.hrApproval === 'Rejected' ? 'text-red-700' : 'text-amber-600'}`}>
                          {req.hrApproval || 'Pending'}
                        </span>
                      </div>
                    </div>
                    <div className="flex flex-col">
                      <span className="text-[9px] font-black text-gray-400 uppercase tracking-tight mb-1">Status 2 (MD Approval)</span>
                      <div className="flex items-center gap-1.5">
                        <div className={`w-1.5 h-1.5 rounded-full ${req.mdApproval === 'Approved' ? 'bg-green-500' : req.mdApproval === 'Rejected' ? 'bg-red-500' : 'bg-amber-500'}`}></div>
                        <span className={`text-[10px] font-black uppercase ${req.mdApproval === 'Approved' ? 'text-green-700' : req.mdApproval === 'Rejected' ? 'text-red-700' : 'text-amber-600'}`}>
                          {req.mdApproval || 'Pending'}
                        </span>
                      </div>
                    </div>
                    {(req.type === 'Advance' || req.type === 'Expense') && (
                      <div className="flex flex-col col-span-2 pt-2 border-t border-gray-200/50">
                        <span className="text-[9px] font-black text-gray-400 uppercase tracking-tight mb-1">Payment Queue Status</span>
                        <div className="flex items-center gap-1.5">
                          <div className={`w-1.5 h-1.5 rounded-full ${req.paymentStatus === 'Paid' ? 'bg-emerald-500' : 'bg-gray-400'}`}></div>
                          <span className={`text-[10px] font-black uppercase ${req.paymentStatus === 'Paid' ? 'text-emerald-700' : 'text-gray-500'}`}>
                            {req.paymentStatus || 'Pending'}
                          </span>
                        </div>
                      </div>
                    )}
                  </div>

                  <p className="text-[10px] font-bold text-gray-400 uppercase mb-2 tracking-widest">Remarks / Justification</p>
                  <p className="text-[13px] font-medium text-gray-600 italic leading-relaxed">"{req.reason || 'No justification provided'}"</p>
                  
                  {(req.hrRemarks || req.mdRemarks || req.remarks) && (
                    <div className="mt-4 p-3 bg-indigo-50/50 rounded-xl border border-indigo-100/50">
                      <p className="text-[9px] font-black text-indigo-400 uppercase mb-2 tracking-widest flex items-center gap-2">
                        <MessageSquare size={12} />
                        Approver Remarks
                      </p>
                      {req.hrRemarks && (
                        <p className="text-[11px] text-gray-600 mb-1">
                          <span className="font-bold text-indigo-600">HR:</span> {req.hrRemarks}
                        </p>
                      )}
                      {req.mdRemarks && (
                        <p className="text-[11px] text-gray-600 mb-1">
                          <span className="font-bold text-indigo-600">MD:</span> {req.mdRemarks}
                        </p>
                      )}
                      {req.remarks && !req.hrRemarks && !req.mdRemarks && (
                        <p className="text-[11px] text-gray-600">
                          {req.remarks}
                        </p>
                      )}
                    </div>
                  )}
                  
                  <div className="mt-6 pt-4 border-t border-gray-50 flex justify-between items-center opacity-40 group-hover:opacity-100 transition-opacity">
                    <span className="text-[8px] font-black text-gray-300 uppercase">Ref: {req.id.slice(-8).toUpperCase()}</span>
                    {req.status === 'Pending' && (
                      <button className="text-[9px] font-black text-red-400 uppercase hover:text-red-600">Withdraw</button>
                    )}
                  </div>
                </div>
              ))}
              {requests.length === 0 && (
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
            <div className="space-y-6">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <label className="text-xs font-black text-gray-400 uppercase tracking-widest px-1">
                    Leave Classification
                  </label>
                  <select
                    value={requestForm.leaveType}
                    onChange={e => setRequestForm(f => ({ ...f, leaveType: e.target.value }))}
                    className="w-full h-[46px] border border-gray-200 rounded-xl px-4 text-sm font-bold bg-gray-50/50 focus:ring-2 focus:ring-indigo-500 outline-none appearance-none"
                  >
                    <option value="Casual">Casual Leave</option>
                    <option value="Sick">Sick Leave</option>
                    <option value="Privilege">Privilege Leave</option>
                    <option value="Maternity">Maternity Leave</option>
                    <option value="Paternity">Paternity Leave</option>
                    <option value="Unpaid">Unpaid Leave</option>
                    <option value="LOP">Loss of Pay (LOP)</option>
                  </select>
                </div>
                <div className="hidden">
                  {/* Approver is selected by HR in the backend workflow */}
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <label className="text-xs font-black text-gray-400 uppercase tracking-widest px-1">
                    Commencement
                  </label>
                  <input
                    type="date"
                    value={requestForm.fromDate}
                    onChange={e => setRequestForm(f => ({ ...f, fromDate: e.target.value }))}
                    className="w-full h-[46px] border border-gray-200 rounded-xl px-4 text-sm font-bold bg-gray-50/50 focus:ring-2 focus:ring-indigo-500 outline-none"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-black text-gray-400 uppercase tracking-widest px-1">
                    Conclusion
                  </label>
                  <input
                    type="date"
                    value={requestForm.toDate}
                    onChange={e => setRequestForm(f => ({ ...f, toDate: e.target.value }))}
                    className="w-full h-[46px] border border-gray-200 rounded-xl px-4 text-sm font-bold bg-gray-50/50 focus:ring-2 focus:ring-indigo-500 outline-none"
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
