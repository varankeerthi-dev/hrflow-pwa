import React, { useState, useEffect, useMemo } from 'react'
import { useAuth } from '../../hooks/useAuth'
import { useEmployees } from '../../hooks/useEmployees'
import { useAttendance, calcOT } from '../../hooks/useAttendance'
import { attendanceCol } from '../../lib/firestore'
import { db } from '../../lib/firebase'
import { collection, addDoc, query, where, getDocs, serverTimestamp, orderBy, deleteDoc, doc } from 'firebase/firestore'
import Spinner from '../ui/Spinner'
import Modal from '../ui/Modal'
import ImageViewer from '../ui/ImageViewer'
import TimePicker from '../ui/TimePicker'
import { useLeaves } from '../../hooks/useLeaves'
import EmployeeSalarySlipTab from './EmployeeSalarySlipTab'
import { formatTimeTo12Hour } from '../../lib/salaryUtils'
import { isEmployeeActiveStatus } from '../../lib/employeeStatus'
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
  Info,
  Play,
  Square,
  MessageSquare
} from 'lucide-react'

export default function EmployeePortalTab({ portalSubTab: initialSubTab = 'dashboard' }) {
  const { user } = useAuth()
  const { employees, loading: empLoading } = useEmployees(user?.orgId)
  const { fetchByDate, upsertAttendance } = useAttendance(user?.orgId)
  const { applyLeave } = useLeaves(user?.orgId)

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
  const [expandedMonths, setExpandedMonths] = useState({}) // Track which months are expanded
  const [showRequestModal, setShowRequestModal] = useState(false)
  const [approvalSettingsByModule, setApprovalSettingsByModule] = useState({})
  const [requestForm, setRequestForm] = useState({
    type: 'Leave',
    leaveType: 'Casual',
    fromDate: '',
    toDate: '',
    date: '',
    time: '',
    amount: '',
    reason: '',
    approverIds: [],
  })

  useEffect(() => {
    if (!user?.orgId) return
    const fetchSettings = async () => {
      const q = query(collection(db, 'organisations', user.orgId, 'approvalSettings'))
      const snap = await getDocs(q)
      const nextSettings = {}
      snap.docs.forEach((docSnap) => {
        const data = docSnap.data() || {}
        if (data.moduleName) {
          nextSettings[data.moduleName] = data
        }
      })
      setApprovalSettingsByModule(nextSettings)
    }
    fetchSettings()
  }, [user?.orgId])

  const getModuleNameForRequestType = (type) => {
    if (type === 'Permission') return 'Permission'
    if (type === 'Advance') return 'Advance'
    return 'Leave'
  }

  const getApprovalSettingForType = (type) => {
    const moduleName = getModuleNameForRequestType(type)
    return approvalSettingsByModule[moduleName] || { type: 'single', approvers: [], stages: [] }
  }
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

  const handleWithdraw = async (reqId, source) => {
    if (!window.confirm('Are you sure you want to withdraw this request?')) return
    setLoading(true)
    try {
      const collectionName = source === 'advances_expenses' ? 'advances_expenses' : 'requests'
      await deleteDoc(doc(db, 'organisations', user.orgId, collectionName, reqId))
      await fetchRequests()
    } catch (err) {
      alert('Withdrawal failed: ' + err.message)
    } finally {
      setLoading(false)
    }
  }

  const handleRequestSubmit = async () => {
    if (!requestForm.reason) {
      alert('Please provide a reason/justification.')
      return
    }

    if (requestForm.type === 'Leave' && (!requestForm.fromDate || !requestForm.toDate)) {
      alert('Please select both From and To dates.')
      return
    }

    if (requestForm.type === 'Permission' && (!requestForm.date || !requestForm.time)) {
      alert('Please select date and time for permission.')
      return
    }

    if (requestForm.type === 'Advance' && !requestForm.amount) {
      alert('Please enter the advance amount.')
      return
    }

    setLoading(true)
    try {
      const approvalSetting = getApprovalSettingForType(requestForm.type)
      const approvalType = approvalSetting?.type || 'single'
      const totalStages = approvalType === 'multi' ? (approvalSetting?.stages?.length || 1) : 1
      const isNoApproval = approvalType === 'none'

      if (requestForm.type === 'Leave') {
        const payload = {
          employeeId,
          employeeName: employee?.name || user.name,
          leaveType: requestForm.leaveType || 'Casual',
          fromDate: requestForm.fromDate,
          toDate: requestForm.toDate || requestForm.fromDate,
          reason: requestForm.reason,
          orgId: user.orgId,
          approvalType,
          currentStage: 0,
          totalStages,
          approverIds: requestForm.approverIds || [],
          deptHeadId: approvalType === 'multi' ? (requestForm.approverIds?.[0] || '') : '',
          deptHeadName: approvalType === 'multi' 
            ? (employees.find(e => e.id === requestForm.approverIds?.[0])?.name || 'Unknown')
            : 'Unknown',
          status: isNoApproval ? 'Approved' : 'Pending',
          hrApproval: isNoApproval ? 'Approved' : 'Pending',
          deptHeadApproval: isNoApproval ? 'Approved' : 'Pending',
          mdApproval: isNoApproval ? 'Approved' : 'Pending',
          approvedBy: isNoApproval ? user.uid : null,
          approvedAt: isNoApproval ? serverTimestamp() : null
        }
        await applyLeave(payload)
      } else if (requestForm.type === 'Permission') {
        const base = {
          employeeId,
          employeeName: employee?.name || user.name,
          type: requestForm.type,
          status: isNoApproval ? 'Approved' : 'Pending',
          createdAt: serverTimestamp(),
          reason: requestForm.reason,
          hrApproval: isNoApproval ? 'Approved' : 'Pending',
          deptHeadApproval: isNoApproval ? 'Approved' : 'Pending',
          mdApproval: isNoApproval ? 'Approved' : 'Pending',
          approvalType,
          currentStage: 0,
          totalStages,
          approverIds: requestForm.approverIds || [],
          orgId: user.orgId,
          approvedBy: isNoApproval ? user.uid : null,
          approvedAt: isNoApproval ? serverTimestamp() : null
        }

        const payload = {
          ...base,
          permissionDate: requestForm.date,
          permissionTime: requestForm.time,
        }
        await addDoc(collection(db, 'organisations', user.orgId, 'requests'), payload)
      } else {
        const today = new Date().toISOString().split('T')[0]
        const payload = {
          employeeId,
          employeeName: employee?.name || user.name,
          type: 'Advance',
          category: 'Salary Advance',
          amount: Number(requestForm.amount || 0),
          date: today,
          reason: requestForm.reason,
          requestType: 'Advance',
          payoutMethod: 'Immediate',
          status: isNoApproval ? 'Approved' : 'Pending',
          hrApproval: isNoApproval ? 'Approved' : 'Pending',
          mdApproval: isNoApproval ? 'Approved' : 'Pending',
          approvalType,
          currentStage: 0,
          totalStages,
          approverIds: requestForm.approverIds || [],
          approvedBy: isNoApproval ? user.uid : null,
          approvedAt: isNoApproval ? serverTimestamp() : null,
          createdAt: serverTimestamp(),
          orgId: user.orgId
        }

        await addDoc(collection(db, 'organisations', user.orgId, 'advances_expenses'), payload)
      }
      
      setShowRequestModal(false)
      setRequestForm({
        type: 'Leave',
        leaveType: 'Casual',
        fromDate: '',
        toDate: '',
        date: '',
        time: '',
        amount: '',
        reason: '',
        approverIds: [],
      })
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

  // Helper to group requests by month
  const groupRequestsByMonth = (requests) => {
    const grouped = {}
    requests.forEach(req => {
      const date = req.createdAt?.toDate ? req.createdAt.toDate() : new Date()
      const monthKey = date.toLocaleDateString('en-US', { year: 'numeric', month: 'long' })
      if (!grouped[monthKey]) {
        grouped[monthKey] = []
      }
      grouped[monthKey].push(req)
    })
    return grouped
  }

  // Helper to get detailed approval status
  const getDetailedStatus = (req) => {
    if (req.status === 'Rejected') {
      return { label: 'Rejected', color: 'bg-red-100 text-red-700', stage: 'rejected' }
    }
    if (req.status === 'Approved') {
      return { label: 'Approved', color: 'bg-green-100 text-green-700', stage: 'approved' }
    }
    
    // For pending requests, show approval workflow
    const hrStatus = req.hrApproval || 'Pending'
    const mdStatus = req.mdApproval || 'Pending'
    const deptHeadStatus = req.deptHeadApproval || 'Pending'
    
    // Multi-stage approval flow
    if (req.approvalType === 'multi') {
      if (deptHeadStatus === 'Pending') {
        return { label: 'Dept Head Pending', color: 'bg-amber-100 text-amber-700', stage: 'dept-head' }
      }
      if (deptHeadStatus === 'Approved' && mdStatus === 'Pending') {
        return { label: 'MD Pending', color: 'bg-amber-100 text-amber-700', stage: 'md' }
      }
      if (deptHeadStatus === 'Rejected' || mdStatus === 'Rejected') {
        return { label: 'Rejected', color: 'bg-red-100 text-red-700', stage: 'rejected' }
      }
    } else {
      // Single or dual approval flow
      if (hrStatus === 'Pending') {
        return { label: 'HR Pending', color: 'bg-amber-100 text-amber-700', stage: 'hr' }
      }
      if (hrStatus === 'Approved' && mdStatus === 'Pending') {
        return { label: 'MD Pending', color: 'bg-blue-100 text-blue-700', stage: 'md' }
      }
      if (hrStatus === 'Rejected' || mdStatus === 'Rejected') {
        return { label: 'Rejected', color: 'bg-red-100 text-red-700', stage: 'rejected' }
      }
    }
    
    return { label: 'Pending', color: 'bg-amber-100 text-amber-700', stage: 'pending' }
  }

  // Toggle month expansion
  const toggleMonth = (monthKey) => {
    setExpandedMonths(prev => ({
      ...prev,
      [monthKey]: !prev[monthKey]
    }))
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
      <div className="bg-white p-4 md:p-6 rounded-[12px] shadow-sm border border-gray-100 flex flex-col md:flex-row justify-between items-center gap-4">
        <div className="grid grid-cols-3 md:flex bg-gray-100 p-1 rounded-lg w-full md:w-auto gap-1">
          {[
            { id: 'dashboard', label: 'Dashboard', icon: <LayoutDashboard size={16} /> },
            { id: 'attendance', label: 'Attendance', icon: <Calendar size={16} /> },
            { id: 'requests', label: 'Requests', icon: <FileText size={16} /> },
            { id: 'salary', label: 'Salary Slip', icon: <Hash size={16} /> },
            { id: 'profile', label: 'Profile', icon: <User size={16} /> }
          ].map(t => (
            <button
              key={t.id}
              onClick={() => setActivePortalTab(t.id)}
              className={`flex flex-col md:flex-row items-center justify-center gap-1 md:gap-2 px-2 md:px-5 py-2.5 md:py-2 rounded-md text-[10px] md:text-[13px] font-bold transition-all ${activePortalTab === t.id ? 'bg-white shadow-sm text-gray-900' : 'text-gray-400 hover:text-gray-600'}`}
            >
              {t.icon} <span className="truncate w-full text-center md:w-auto">{t.label}</span>
            </button>
          ))}
        </div>
        <div className="hidden md:flex items-center gap-3">
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
            <div className="bg-white rounded-[12px] p-8 border border-gray-100 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-6">
              <div>
                <p className="text-[11px] font-bold text-gray-400 uppercase tracking-widest mb-1">Welcome</p>
                <h2 className="text-2xl font-black text-gray-900 tracking-tight">
                  {employee?.name || user?.name}
                </h2>
                <p className="text-[12px] text-gray-500 mt-2">
                  Quick access to your workday: attendance, requests and salary slips.
                </p>
              </div>
              <div className="flex flex-col sm:flex-row gap-3">
                {!todayRecord?.inTime ? (
                  <button
                    onClick={handleCheckIn}
                    className="h-[46px] px-8 rounded-xl bg-emerald-600 text-white text-[11px] font-black uppercase tracking-[0.2em] flex items-center justify-center gap-3 shadow-xl shadow-emerald-900/10 hover:bg-emerald-700 transition-all active:scale-95"
                  >
                    <Play size={18} fill="currentColor" /> Check-In
                  </button>
                ) : !todayRecord?.outTime ? (
                  <button
                    onClick={handleCheckOut}
                    className="h-[46px] px-8 rounded-xl bg-rose-600 text-white text-[11px] font-black uppercase tracking-[0.2em] flex items-center justify-center gap-3 shadow-xl shadow-rose-900/10 hover:bg-rose-700 transition-all active:scale-95"
                  >
                    <Square size={16} fill="currentColor" /> Check-Out
                  </button>
                ) : (
                  <div className="h-[46px] px-8 rounded-xl bg-gray-100 text-gray-400 text-[11px] font-black uppercase tracking-[0.2em] flex items-center justify-center gap-3 border border-gray-200">
                    Shift Completed
                  </div>
                )}
                <button
                  onClick={() => setShowRequestModal(true)}
                  className="h-[46px] px-8 rounded-xl bg-white border border-gray-200 text-gray-900 text-[11px] font-black uppercase tracking-[0.2em] flex items-center justify-center gap-3 shadow-sm hover:bg-gray-50 transition-all active:scale-95"
                >
                  <Plus size={18} strokeWidth={3} /> Apply Leave
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
                <div className={`absolute bottom-2 right-2 w-5 h-5 rounded-full border-2 border-white shadow-sm ${isEmployeeActiveStatus(employee?.status) ? 'bg-emerald-500' : 'bg-rose-500'}`}></div>
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
                      { label: 'Working Hours', value: `${employee?.minDailyHours || 8} Hours Daily` },
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

            {(() => {
              const grouped = groupRequestsByMonth(requests)
              const monthKeys = Object.keys(grouped).sort((a, b) => {
                // Sort months in descending order (newest first)
                const dateA = new Date(a)
                const dateB = new Date(b)
                return dateB - dateA
              })
              
              if (monthKeys.length === 0) {
                return (
                  <div className="col-span-full py-32 text-center">
                    <div className="w-20 h-20 rounded-full bg-gray-50 flex items-center justify-center mx-auto mb-6 text-gray-200"><FileText size={40} /></div>
                    <p className="text-gray-300 font-medium uppercase tracking-[0.25em] text-xl italic opacity-40">No internal records found</p>
                  </div>
                )
              }
              
              return (
                <div className="space-y-6 px-4">
                  {monthKeys.map((monthKey, index) => {
                    const monthRequests = grouped[monthKey]
                    const isExpanded = expandedMonths[monthKey] !== false // Default to expanded
                    
                    // Count statuses for summary
                    const pendingCount = monthRequests.filter(r => r.status === 'Pending' || (!r.status && r.hrApproval === 'Pending')).length
                    const approvedCount = monthRequests.filter(r => r.status === 'Approved').length
                    const rejectedCount = monthRequests.filter(r => r.status === 'Rejected').length
                    
                    return (
                      <div key={monthKey} className="bg-white rounded-[12px] border border-gray-100 shadow-sm overflow-hidden">
                        {/* Month Header - Clickable to expand/collapse */}
                        <button 
                          onClick={() => toggleMonth(monthKey)}
                          className="w-full flex items-center justify-between p-5 bg-gray-50/50 hover:bg-gray-50 transition-colors border-b border-gray-100"
                        >
                          <div className="flex items-center gap-3">
                            <div className={`transform transition-transform duration-200 ${isExpanded ? 'rotate-90' : ''}`}>
                              <ArrowRight size={16} className="text-gray-400" />
                            </div>
                            <h4 className="text-sm font-black text-gray-900 uppercase tracking-tight">{monthKey}</h4>
                            <span className="text-[10px] font-bold text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">
                              {monthRequests.length} request{monthRequests.length !== 1 ? 's' : ''}
                            </span>
                          </div>
                          <div className="flex items-center gap-2">
                            {pendingCount > 0 && (
                              <span className="text-[10px] font-bold text-amber-700 bg-amber-100 px-2 py-0.5 rounded-full">
                                {pendingCount} Pending
                              </span>
                            )}
                            {approvedCount > 0 && (
                              <span className="text-[10px] font-bold text-green-700 bg-green-100 px-2 py-0.5 rounded-full">
                                {approvedCount} Approved
                              </span>
                            )}
                            {rejectedCount > 0 && (
                              <span className="text-[10px] font-bold text-red-700 bg-red-100 px-2 py-0.5 rounded-full">
                                {rejectedCount} Rejected
                              </span>
                            )}
                          </div>
                        </button>
                        
                        {/* Month Content - Collapsible */}
                        {isExpanded && (
                          <div className="p-5">
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                              {monthRequests.map(req => {
                                const statusInfo = getDetailedStatus(req)
                                return (
                                  <div key={req.id} className="bg-white p-6 rounded-[12px] border border-gray-100 shadow-sm flex flex-col relative overflow-hidden group hover:shadow-lg transition-all">
                                    <div className={`absolute top-0 right-0 px-4 py-1.5 rounded-bl-xl text-[9px] font-black uppercase tracking-[0.2em] ${statusInfo.color} border-l border-b border-gray-200`}>
                                      {statusInfo.label}
                                    </div>
                                    <div className="mb-4 flex items-center gap-3">
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
                                              {req.permissionDate || req.date} at {req.permissionTime || req.fromTime || '--'}
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
                                    
                                    {/* Approval Workflow Display */}
                                    <div className="mb-4 bg-gray-50 p-3 rounded-lg border border-gray-100">
                                      <p className="text-[9px] font-black text-gray-400 uppercase mb-2 tracking-widest">Approval Workflow</p>
                                      
                                      {/* Dept Head Stage (for multi-stage) */}
                                      {req.approvalType === 'multi' && (
                                        <div className="flex items-center gap-2 mb-2">
                                          <div className={`w-2 h-2 rounded-full ${
                                            req.deptHeadApproval === 'Approved' ? 'bg-green-500' : 
                                            req.deptHeadApproval === 'Rejected' ? 'bg-red-500' : 
                                            'bg-amber-500 animate-pulse'
                                          }`}></div>
                                          <span className={`text-[10px] font-bold uppercase ${
                                            req.deptHeadApproval === 'Approved' ? 'text-green-700' : 
                                            req.deptHeadApproval === 'Rejected' ? 'text-red-700' : 
                                            'text-amber-600'
                                          }`}>
                                            Dept Head: {req.deptHeadApproval || 'Pending'}
                                          </span>
                                          {req.deptHeadName && (
                                            <span className="text-[9px] text-gray-400">({req.deptHeadName})</span>
                                          )}
                                        </div>
                                      )}
                                      
                                      {/* HR Stage */}
                                      <div className="flex items-center gap-2 mb-2">
                                        <div className={`w-2 h-2 rounded-full ${
                                          req.hrApproval === 'Approved' ? 'bg-green-500' : 
                                          req.hrApproval === 'Rejected' ? 'bg-red-500' : 
                                          'bg-amber-500 animate-pulse'
                                        }`}></div>
                                        <span className={`text-[10px] font-bold uppercase ${
                                          req.hrApproval === 'Approved' ? 'text-green-700' : 
                                          req.hrApproval === 'Rejected' ? 'text-red-700' : 
                                          'text-amber-600'
                                        }`}>
                                          HR: {req.hrApproval || 'Pending'}
                                        </span>
                                      </div>
                                      
                                      {/* MD Stage */}
                                      <div className="flex items-center gap-2">
                                        <div className={`w-2 h-2 rounded-full ${
                                          req.mdApproval === 'Approved' ? 'bg-green-500' : 
                                          req.mdApproval === 'Rejected' ? 'bg-red-500' : 
                                          req.hrApproval === 'Approved' ? 'bg-amber-500 animate-pulse' :
                                          'bg-gray-300'
                                        }`}></div>
                                        <span className={`text-[10px] font-bold uppercase ${
                                          req.mdApproval === 'Approved' ? 'text-green-700' : 
                                          req.mdApproval === 'Rejected' ? 'text-red-700' : 
                                          req.hrApproval === 'Approved' ? 'text-amber-600' :
                                          'text-gray-400'
                                        }`}>
                                          MD: {req.mdApproval || (req.hrApproval === 'Approved' ? 'Pending' : 'Waiting')}
                                        </span>
                                      </div>
                                      
                                      {/* Payment Status for Advance/Expense */}
                                      {(req.type === 'Advance' || req.type === 'Expense') && (
                                        <div className="mt-2 pt-2 border-t border-gray-200">
                                          <div className="flex items-center gap-2">
                                            <div className={`w-2 h-2 rounded-full ${
                                              req.paymentStatus === 'Paid' ? 'bg-emerald-500' : 'bg-gray-300'
                                            }`}></div>
                                            <span className={`text-[10px] font-bold uppercase ${
                                              req.paymentStatus === 'Paid' ? 'text-emerald-700' : 'text-gray-400'
                                            }`}>
                                              Payment: {req.paymentStatus || 'Pending'}
                                            </span>
                                          </div>
                                        </div>
                                      )}
                                    </div>

                                    <p className="text-[10px] font-bold text-gray-400 uppercase mb-2 tracking-widest">Remarks / Justification</p>
                                    <p className="text-[13px] font-medium text-gray-600 italic leading-relaxed">"{req.reason || 'No justification provided'}"</p>
                                    
                                    {(req.hrRemarks || req.mdRemarks || req.deptHeadRemarks || req.remarks) && (
                                      <div className="mt-4 p-3 bg-indigo-50/50 rounded-xl border border-indigo-100/50">
                                        <p className="text-[9px] font-black text-indigo-400 uppercase mb-2 tracking-widest flex items-center gap-2">
                                          <MessageSquare size={12} />
                                          Approver Remarks
                                        </p>
                                        {req.deptHeadRemarks && (
                                          <p className="text-[11px] text-gray-600 mb-1">
                                            <span className="font-bold text-indigo-600">Dept Head:</span> {req.deptHeadRemarks}
                                          </p>
                                        )}
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
                                        {req.remarks && !req.hrRemarks && !req.mdRemarks && !req.deptHeadRemarks && (
                                          <p className="text-[11px] text-gray-600">
                                            {req.remarks}
                                          </p>
                                        )}
                                      </div>
                                    )}
                                    
                                    <div className="mt-6 pt-4 border-t border-gray-50 flex justify-between items-center opacity-40 group-hover:opacity-100 transition-opacity">
                                      <span className="text-[8px] font-black text-gray-300 uppercase">Ref: {req.id.slice(-8).toUpperCase()}</span>
                                      {req.status === 'Pending' && (
                                        <button 
                                          onClick={() => handleWithdraw(req.id, req.source)}
                                          className="text-[9px] font-black text-red-400 uppercase hover:text-red-600"
                                        >
                                          Withdraw
                                        </button>
                                      )}
                                    </div>
                                  </div>
                                )
                              })}
                            </div>
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              )
            })()}
          </div>
        )}

        {activePortalTab === 'salary' && (
          <div className="max-w-5xl mx-auto animate-in fade-in slide-in-from-bottom-4 duration-500">
            <EmployeeSalarySlipTab employeeId={employeeId} employee={employee} />
          </div>
        )}
      </div>

      <Modal isOpen={showRequestModal} onClose={() => setShowRequestModal(false)} title="Initialize Request" size="2xl">
        <form onSubmit={e => { e.preventDefault(); handleRequestSubmit(); }} className="p-6 space-y-6">
          {/* Request Type Selector */}
          <div>
            <label className="block text-[12px] font-semibold text-gray-700 mb-2">
              Request Type
            </label>
            <div className="grid grid-cols-3 gap-2">
              {['Leave', 'Permission', 'Advance'].map(t => (
                <button 
                  key={t} 
                  type="button" 
                  onClick={() => setRequestForm(f => ({ ...f, type: t }))} 
                  className={`py-2 rounded-lg text-[11px] font-medium uppercase tracking-wider transition-all border ${
                    requestForm.type === t 
                      ? 'bg-indigo-50 border-indigo-200 text-indigo-600 shadow-sm shadow-indigo-100' 
                      : 'bg-white border-gray-200 text-gray-500 hover:border-gray-300 hover:bg-gray-50'
                  }`}
                >
                  {t}
                </button>
              ))}
            </div>
          </div>

          {requestForm.type === 'Leave' && (
            <div className="space-y-6">
              <div className="grid grid-cols-2 gap-6">
                <div>
                  <label className="block text-[12px] font-semibold text-gray-700 mb-2">
                    Leave Classification
                  </label>
                  <select
                    value={requestForm.leaveType}
                    onChange={e => setRequestForm(f => ({ ...f, leaveType: e.target.value }))}
                    className="w-full bg-gray-50/50 border border-gray-200 rounded-lg px-4 py-2 text-sm focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 focus:bg-white outline-none transition-all appearance-none cursor-pointer"
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
                
                {/* Dynamic Approver logic */}
                {getApprovalSettingForType('Leave')?.type === 'multi' && getApprovalSettingForType('Leave')?.stages?.length > 1 && (
                  <div>
                    <label className="block text-[12px] font-semibold text-gray-700 mb-2">
                      Approver
                    </label>
                    <select 
                      value={requestForm.approverIds?.[0] || ''} 
                      onChange={e => {
                        const newApprovers = [...(requestForm.approverIds || [])]
                        newApprovers[0] = e.target.value
                        setRequestForm({...requestForm, approverIds: newApprovers}) 
                      }} 
                      className="w-full bg-gray-50/50 border border-gray-200 rounded-lg px-4 py-2 text-sm focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 focus:bg-white outline-none transition-all appearance-none cursor-pointer"
                    >
                      <option value="">Select Approver</option>
                      {employees.filter(emp => emp.id !== employeeId).map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
                    </select>
                  </div>
                )}
              </div>
              
              <div className="grid grid-cols-2 gap-6">
                <div>
                  <label className="block text-[12px] font-semibold text-gray-700 mb-2">
                    Start Date
                  </label>
                  <input
                    type="date"
                    value={requestForm.fromDate}
                    onChange={e => setRequestForm(f => ({ ...f, fromDate: e.target.value }))}
                    className="w-full bg-gray-50/50 border border-gray-200 rounded-lg px-4 py-2 text-sm focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 focus:bg-white outline-none transition-all cursor-pointer"
                  />
                </div>
                <div>
                  <label className="block text-[12px] font-semibold text-gray-700 mb-2">
                    End Date
                  </label>
                  <input
                    type="date"
                    value={requestForm.toDate}
                    onChange={e => setRequestForm(f => ({ ...f, toDate: e.target.value }))}
                    className="w-full bg-gray-50/50 border border-gray-200 rounded-lg px-4 py-2 text-sm focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 focus:bg-white outline-none transition-all cursor-pointer"
                  />
                </div>
              </div>
            </div>
          )}

          {requestForm.type === 'Permission' && (
            <div className="grid grid-cols-2 gap-6">
              <div>
                <label className="block text-[12px] font-semibold text-gray-700 mb-2">
                  Date
                </label>
                <input
                  type="date"
                  value={requestForm.date}
                  onChange={e => setRequestForm(f => ({ ...f, date: e.target.value }))}
                  className="w-full bg-gray-50/50 border border-gray-200 rounded-lg px-4 py-2 text-sm focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 focus:bg-white outline-none transition-all cursor-pointer"
                />
              </div>
              <div>
                <label className="block text-[12px] font-semibold text-gray-700 mb-2">
                  Time
                </label>
                <div className="relative">
                  <button
                    type="button"
                    onClick={() => setShowTimePicker(!showTimePicker)}
                    className="w-full bg-gray-50/50 border border-gray-200 rounded-lg px-4 py-2 text-sm focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 focus:bg-white outline-none transition-all text-left flex items-center justify-between cursor-pointer"
                  >
                    <span>{requestForm.time ? (() => {
                      const [h, m] = requestForm.time.split(':').map(Number)
                      const p = h >= 12 ? 'PM' : 'AM'
                      const h12 = h % 12 || 12
                      return `${h12}:${String(m).padStart(2, '0')} ${p}`
                    })() : 'Select time'}</span>
                    <Clock size={14} className="text-gray-400" />
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
              <label className="block text-[12px] font-semibold text-gray-700 mb-2">
                Amount (₹)
              </label>
              <input
                type="number"
                value={requestForm.amount}
                onChange={e => setRequestForm(f => ({ ...f, amount: e.target.value }))}
                className="w-full bg-gray-50/50 border border-gray-200 rounded-lg px-4 py-2.5 text-sm focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 focus:bg-white outline-none transition-all placeholder:text-gray-400"
                placeholder="Enter amount..."
              />
            </div>
          )}

          {/* Reason */}
          <div>
            <label className="block text-[12px] font-semibold text-gray-700 mb-2">
              Reason / Justification
            </label>
            <textarea 
              value={requestForm.reason} 
              onChange={e => setRequestForm(f => ({ ...f, reason: e.target.value }))} 
              className="w-full bg-gray-50/50 border border-gray-200 rounded-lg px-4 py-2.5 text-sm focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 focus:bg-white outline-none transition-all min-h-[80px] resize-none placeholder:text-gray-400" 
              placeholder="Briefly state the reason for this request..." 
            />
          </div>

          {/* Action Buttons */}
          <div className="flex gap-3 pt-4 border-t border-gray-100">
            <button
              type="button"
              onClick={() => setShowRequestModal(false)}
              className="px-6 py-2.5 border border-gray-200 text-gray-600 rounded-lg text-sm font-medium hover:bg-gray-50 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="flex-1 px-6 py-2.5 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 transition-all shadow-sm shadow-indigo-100 active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? 'Submitting...' : 'Submit Request'}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  )
}
