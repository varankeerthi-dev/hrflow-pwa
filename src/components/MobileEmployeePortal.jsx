import React, { useState, useEffect, useMemo } from 'react'
import { useAuth } from '../hooks/useAuth'
import { useEmployees } from '../hooks/useEmployees'
import { useAttendance, calcOT } from '../hooks/useAttendance'
import { useLeaves } from '../hooks/useLeaves'
import { db, storage } from '../lib/firebase'
import { collection, query, where, getDocs, deleteDoc, doc, addDoc, serverTimestamp, orderBy } from 'firebase/firestore'
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage'
import { attendanceCol } from '../lib/firestore'
import { formatTimeTo12Hour } from '../lib/salaryUtils'
import Modal from './ui/Modal'
import TimePicker from './ui/TimePicker'
import SelfieCaptureModal from './ui/SelfieCaptureModal'
import { getAttendancePortalBadge, ATTENDANCE_EVENT_IN, ATTENDANCE_EVENT_OUT, ATTENDANCE_STATUS_REJECTED } from '../lib/attendanceWorkflow'
import { compressSelfieBlob, evaluateSiteProximity, getCurrentPositionOnce, getOrgSites, resolveTargetSite, submitPendingAttendanceEvent, uploadTempSelfie } from '../lib/geoAttendanceService'
import { z } from 'zod'
import DatePicker from 'react-datepicker'
import 'react-datepicker/dist/react-datepicker.css'
import { 
  User, 
  Calendar, 
  FileText, 
  Plus, 
  ArrowRight, 
  ChevronRight,
  Clock, 
  LayoutDashboard,
  MapPin,
  Briefcase,
  CreditCard,
  Target,
  ChevronLeft,
  ChevronRight as ChevronRightIcon,
  CheckCircle2,
  AlertCircle,
  Building2,
  Hash,
  Landmark,
  Wallet,
  Eye,
  LogOut,
  Play,
  Square,
  MoreHorizontal,
  Phone,
  Mail,
  Shield,
  Award,
  FileBadge,
  TrendingUp,
  Bell,
  Upload,
  X
} from 'lucide-react'
import { format, startOfMonth, endOfMonth, eachDayOfInterval, isToday, isWeekend, getDay, differenceInCalendarDays, addDays } from 'date-fns'

// Validation Schemas
const leaveSchema = z.object({
  leaveType: z.enum(['Casual', 'Sick', 'Annual', 'Unpaid']),
  fromDate: z.string().min(1, 'From date is required'),
  toDate: z.string().min(1, 'To date is required'),
  reason: z.string().min(5, 'Reason must be at least 5 characters'),
}).refine((data) => {
  // Check that fromDate and toDate themselves are not Sundays
  // But Sundays CAN be between them for long leaves
  const start = new Date(data.fromDate)
  const end = new Date(data.toDate)
  if (start.getDay() === 0) return false // From date is Sunday
  if (end.getDay() === 0) return false // To date is Sunday
  return true
}, { message: 'Leave cannot start or end on a Sunday' }).refine((data) => {
  // To date must be >= from date
  return new Date(data.toDate) >= new Date(data.fromDate)
}, { message: 'To date must be after or same as from date' })

const permissionSchema = z.object({
  date: z.string().min(1, 'Date is required'),
  fromTime: z.string().min(1, 'From time is required'),
  toTime: z.string().min(1, 'To time is required'),
  reason: z.string().min(5, 'Reason must be at least 5 characters'),
})

const advanceSchema = z.object({
  amount: z.number().min(1, 'Amount must be greater than 0'),
  requestDate: z.string().min(1, 'Request date is required'),
  reason: z.string().min(5, 'Reason must be at least 5 characters'),
})

export default function MobileEmployeePortal() {
  const { user, logout } = useAuth()
  const { employees, loading: empLoading } = useEmployees(user?.orgId)
  const { fetchByDate } = useAttendance(user?.orgId)
  const { applyLeave } = useLeaves(user?.orgId)

  const [activeTab, setActiveTab] = useState('dashboard')
  const [loading, setLoading] = useState(false)
  const [requests, setRequests] = useState([])
  const [expandedMonths, setExpandedMonths] = useState({}) // Track which months are expanded
  const [showRequestModal, setShowRequestModal] = useState(false)
  const [todayRecord, setTodayRecord] = useState(null)
  const [attendanceRows, setAttendanceRows] = useState([])
  const [portalAttendanceLogs, setPortalAttendanceLogs] = useState([])
  const [showSelfieCaptureModal, setShowSelfieCaptureModal] = useState(false)
  const [captureEventType, setCaptureEventType] = useState(ATTENDANCE_EVENT_IN)
  const [geoContext, setGeoContext] = useState({
    currentCoordinates: null,
    targetSite: null,
    targetCoordinates: null,
    distanceMeters: null,
    radiusMeters: 500,
    withinRange: false,
    locationError: '',
  })
  const [showExceptionModal, setShowExceptionModal] = useState(false)
  const [exceptionForm, setExceptionForm] = useState({ reason: '', file: null })
  const [submittingAttendance, setSubmittingAttendance] = useState(false)
  const [month, setMonth] = useState(() => {
    const d = new Date()
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
  })
  const [showTimePicker, setShowTimePicker] = useState(false)
  const [timePickerMode, setTimePickerMode] = useState(null)

  // Find employee
  const employee = useMemo(() => {
    if (!user || !employees.length) return null
    const normalizedUserEmail = user.email?.toLowerCase().trim() || ''
    return employees.find(e => {
      const empEmail = (e.email || '').toLowerCase().trim()
      const empCode = (e.empCode || '').toLowerCase().trim()
      return empEmail === normalizedUserEmail || empCode === normalizedUserEmail || e.id === user.uid
    })
  }, [employees, user?.email, user?.uid])

  const employeeId = employee?.id || user?.uid

  // Request form
  const [requestForm, setRequestForm] = useState({
    type: 'Leave',
    leaveType: 'Casual',
    fromDate: '',
    toDate: '',
    date: '',
    fromTime: '',
    toTime: '',
    requestDate: new Date().toISOString().split('T')[0],
    amount: '',
    reason: '',
    attachment: null,
  })
  const [validationErrors, setValidationErrors] = useState({})
  const [submitSuccess, setSubmitSuccess] = useState('')
  const [fileUploading, setFileUploading] = useState(false)
  const [approvalSettingsByModule, setApprovalSettingsByModule] = useState({})

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

  useEffect(() => {
    if (!user?.orgId || empLoading || !employeeId) return
    fetchRequests()
    fetchPortalAttendanceLogs()
    loadToday()
  }, [user?.orgId, employeeId, empLoading])

  useEffect(() => {
    if (!user?.orgId || empLoading || !employeeId || !month) return
    loadMonth()
  }, [user?.orgId, employeeId, month])

  const loadToday = async () => {
    const today = new Date().toISOString().split('T')[0]
    const records = await fetchByDate(today)
    setTodayRecord(records.find(r => r.employeeId === employeeId) || null)
  }

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

  const fetchPortalAttendanceLogs = async () => {
    if (!user?.orgId || !employeeId) return
    try {
      const logsQuery = query(
        collection(db, 'organisations', user.orgId, 'employee_portal', employeeId, 'attendance_logs'),
        orderBy('eventDate', 'desc')
      )
      const snapshot = await getDocs(logsQuery)
      setPortalAttendanceLogs(snapshot.docs.map(d => ({ id: d.id, ...d.data() })))
    } catch (error) {
      console.error('Failed to fetch mobile portal attendance logs:', error)
    }
  }

  const todayDateKey = new Date().toISOString().split('T')[0]
  const todayLogs = portalAttendanceLogs.filter(log => log.eventDate === todayDateKey)
  const getLatestLogByType = (logs, type) =>
    logs
      .filter(log => log.type === type)
      .sort((a, b) => {
        const aTs = a.clientTimestamp ? new Date(a.clientTimestamp).getTime() : 0
        const bTs = b.clientTimestamp ? new Date(b.clientTimestamp).getTime() : 0
        return bTs - aTs
      })[0] || null

  const latestTodayInLog = getLatestLogByType(todayLogs, ATTENDANCE_EVENT_IN)
  const latestTodayOutLog = getLatestLogByType(todayLogs, ATTENDANCE_EVENT_OUT)
  const validInLog = latestTodayInLog && latestTodayInLog.status !== ATTENDANCE_STATUS_REJECTED
  const validOutLog = latestTodayOutLog && latestTodayOutLog.status !== ATTENDANCE_STATUS_REJECTED
  const latestTodayLog = validOutLog || validInLog || null
  const todayBadge = latestTodayLog ? getAttendancePortalBadge(latestTodayLog.status) : null
  const todayInTime = validInLog?.eventTime || todayRecord?.inTime || ''
  const todayOutTime = validOutLog?.eventTime || todayRecord?.outTime || ''

  const openGeoAttendanceCapture = async (type) => {
    if (!employeeId || !employee || !user?.orgId) return
    setCaptureEventType(type)
    setGeoContext({
      currentCoordinates: null,
      targetSite: null,
      targetCoordinates: null,
      distanceMeters: null,
      radiusMeters: 500,
      withinRange: false,
      locationError: '',
    })

    try {
      const currentCoordinates = await getCurrentPositionOnce()
      const sites = await getOrgSites(user.orgId)
      const targetSite = resolveTargetSite(employee, sites)
      const proximity = evaluateSiteProximity({ currentCoordinates, targetSite })

      // Phase 6: Low accuracy check (Threshold: 100m)
      if (proximity.accuracy > 100) {
        const warnMsg = `Low GPS accuracy detected (${Math.round(proximity.accuracy)}m). Please ensure you are outdoors for better precision.`
        setGeoContext(prev => ({ ...prev, locationError: warnMsg }))
        alert(warnMsg)
      }

      const nextGeoContext = {
        currentCoordinates,
        targetSite,
        targetCoordinates: proximity.targetCoordinates,
        distanceMeters: proximity.distanceMeters,
        radiusMeters: proximity.radiusMeters,
        withinRange: proximity.withinRange,
        locationError: proximity.accuracy > 100 ? `Low precision (${Math.round(proximity.accuracy)}m)` : '',
      }
      setGeoContext(nextGeoContext)
      if (proximity.withinRange) {
        setShowSelfieCaptureModal(true)
      } else {
        setExceptionForm({ reason: '', file: null })
        setShowExceptionModal(true)
      }
    } catch (error) {
      setGeoContext(prev => ({ ...prev, locationError: error.message || 'Location fetch failed.' }))
      alert(error.message || 'Failed to fetch location.')
    }
  }

  const submitGeoAttendance = async ({ imageBlob, isException, exceptionReason }) => {
    if (!user?.orgId || !employee) return
    setSubmittingAttendance(true)
    try {
      const timestamp = Date.now()
      const compressed = await compressSelfieBlob(imageBlob, 100)
      const { photoUrl, photoPath } = await uploadTempSelfie({
        orgId: user.orgId,
        userId: employee.id || user.uid,
        timestamp,
        fileBlob: compressed,
      })

      await submitPendingAttendanceEvent({
        orgId: user.orgId,
        user,
        employee,
        type: captureEventType,
        site: geoContext.targetSite,
        targetCoordinates: geoContext.targetCoordinates,
        currentCoordinates: geoContext.currentCoordinates,
        distanceMeters: geoContext.distanceMeters,
        radiusMeters: geoContext.radiusMeters,
        photoUrl,
        photoPath,
        isException,
        exceptionReason,
      })

      setShowSelfieCaptureModal(false)
      setShowExceptionModal(false)
      await fetchPortalAttendanceLogs()
      alert(isException ? 'Exception request submitted to HR.' : 'Attendance submitted for HR approval.')
    } catch (error) {
      alert(error.message || 'Failed to submit attendance.')
    } finally {
      setSubmittingAttendance(false)
    }
  }

  const handleCheckIn = async () => openGeoAttendanceCapture(ATTENDANCE_EVENT_IN)
  const handleCheckOut = async () => openGeoAttendanceCapture(ATTENDANCE_EVENT_OUT)

  const handleExceptionSubmit = async () => {
    if (!exceptionForm.file) {
      alert('Selfie is required for exception request.')
      return
    }
    if (!exceptionForm.reason.trim()) {
      alert('Please provide reason for out-of-site request.')
      return
    }
    await submitGeoAttendance({
      imageBlob: exceptionForm.file,
      isException: true,
      exceptionReason: exceptionForm.reason.trim(),
    })
  }

  const handleWithdraw = async (reqId, source) => {
    if (!window.confirm('Withdraw this request?')) return
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
    setValidationErrors({})
    setSubmitSuccess('')

    // Validation based on request type
    let validationResult
    if (requestForm.type === 'Leave') {
      validationResult = leaveSchema.safeParse({
        leaveType: requestForm.leaveType,
        fromDate: requestForm.fromDate,
        toDate: requestForm.toDate,
        reason: requestForm.reason,
      })
    } else if (requestForm.type === 'Permission') {
      validationResult = permissionSchema.safeParse({
        date: requestForm.date,
        fromTime: requestForm.fromTime,
        toTime: requestForm.toTime,
        reason: requestForm.reason,
      })
    } else if (requestForm.type === 'Advance') {
      validationResult = advanceSchema.safeParse({
        amount: Number(requestForm.amount),
        requestDate: requestForm.requestDate,
        reason: requestForm.reason,
      })
    }

    if (!validationResult?.success) {
      const errors = {}
      validationResult.error?.issues?.forEach((issue) => {
        errors[issue.path[0]] = issue.message
      })
      setValidationErrors(errors)
      return
    }

    setLoading(true)
    let attachmentUrl = null

    try {
      // Upload file if attached
      if (requestForm.attachment) {
        setFileUploading(true)
        const fileRef = ref(storage, `requests/${user.orgId}/${Date.now()}_${requestForm.attachment.name}`)
        await uploadBytes(fileRef, requestForm.attachment)
        attachmentUrl = await getDownloadURL(fileRef)
        setFileUploading(false)
      }

      const approvalSetting = getApprovalSettingForType(requestForm.type)
      const approvalType = approvalSetting?.type || 'single'
      const totalStages = approvalType === 'multi' ? (approvalSetting?.stages?.length || 1) : 1
      const isNoApproval = approvalType === 'none'

      if (requestForm.type === 'Leave') {
        await applyLeave({
          employeeId,
          employeeName: employee?.name || user?.name,
          department: employee?.department || '',
          leaveType: requestForm.leaveType,
          fromDate: requestForm.fromDate,
          toDate: requestForm.toDate,
          reason: requestForm.reason,
          attachmentUrl,
          createdBy: user.uid,
          approvalType,
          currentStage: 0,
          totalStages,
          status: isNoApproval ? 'Approved' : 'Pending',
          hrApproval: isNoApproval ? 'Approved' : 'Pending',
          deptHeadApproval: isNoApproval ? 'Approved' : 'Pending',
          mdApproval: isNoApproval ? 'Approved' : 'Pending',
          approvedBy: isNoApproval ? user.uid : null,
          approvedAt: isNoApproval ? serverTimestamp() : null
        })
      } else if (requestForm.type === 'Permission') {
        await addDoc(collection(db, 'organisations', user.orgId, 'requests'), {
          employeeId,
          employeeName: employee?.name || user?.name,
          type: 'Permission',
          permissionDate: requestForm.date,
          fromTime: requestForm.fromTime,
          toTime: requestForm.toTime,
          reason: requestForm.reason,
          attachmentUrl,
          status: isNoApproval ? 'Approved' : 'Pending',
          hrApproval: isNoApproval ? 'Approved' : 'Pending',
          deptHeadApproval: isNoApproval ? 'Approved' : 'Pending',
          mdApproval: isNoApproval ? 'Approved' : 'Pending',
          approvalType,
          currentStage: 0,
          totalStages,
          approverIds: [],
          approvedBy: isNoApproval ? user.uid : null,
          approvedAt: isNoApproval ? serverTimestamp() : null,
          createdAt: serverTimestamp(),
          createdBy: user.uid,
        })
      } else if (requestForm.type === 'Advance') {
        // Save advance to advances_expenses collection so it shows in approvals
        await addDoc(collection(db, 'organisations', user.orgId, 'advances_expenses'), {
          employeeId,
          employeeName: employee?.name || user?.name,
          type: 'Advance',
          category: 'Salary Advance',
          amount: Number(requestForm.amount),
          date: requestForm.requestDate,
          reason: requestForm.reason,
          attachmentUrl,
          status: isNoApproval ? 'Approved' : 'Pending',
          hrApproval: isNoApproval ? 'Approved' : 'Pending',
          mdApproval: isNoApproval ? 'Approved' : 'Pending',
          approvalType,
          currentStage: 0,
          totalStages,
          approverIds: [],
          approvedBy: isNoApproval ? user.uid : null,
          approvedAt: isNoApproval ? serverTimestamp() : null,
          requestType: 'Advance',
          payoutMethod: 'Immediate',
          createdAt: serverTimestamp(),
          createdBy: user.uid,
        })
      }

      // Reset form and show success
      setRequestForm({
        type: 'Leave',
        leaveType: 'Casual',
        fromDate: '',
        toDate: '',
        date: '',
        fromTime: '',
        toTime: '',
        requestDate: new Date().toISOString().split('T')[0],
        amount: '',
        reason: '',
        attachment: null,
      })
      await fetchRequests()
      setSubmitSuccess('Request submitted successfully!')
    } catch (err) {
      setValidationErrors({ submit: err.message })
    } finally {
      setLoading(false)
      setFileUploading(false)
    }
  }

  const getStatusLabel = (record) => {
    if (!record) return 'Not Checked In'
    if (record.isAbsent) return 'Absent'
    if (record.isOnLeave) return 'On Leave'
    if (record.outTime) return 'Completed'
    if (record.inTime) return 'Checked In'
    return 'Not Checked In'
  }

  const getStatusColor = (record) => {
    if (!record) return 'text-gray-500'
    if (record.isAbsent) return 'text-rose-500'
    if (record.isOnLeave) return 'text-blue-500'
    if (record.outTime) return 'text-emerald-500'
    if (record.inTime) return 'text-indigo-500'
    return 'text-gray-500'
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
    
    const hrStatus = req.hrApproval || 'Pending'
    const mdStatus = req.mdApproval || 'Pending'
    const deptHeadStatus = req.deptHeadApproval || 'Pending'
    
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

  // Dashboard View
  const renderDashboard = () => {
    const dashboardRecord = todayRecord || {
      inTime: todayInTime || '',
      outTime: todayOutTime || '',
      date: todayDateKey,
      outDate: todayDateKey,
      minDailyHours: employee?.minDailyHours || 8,
    }

    return (
      <div className="space-y-4">
      {/* Welcome Card */}
      <div className="bg-gradient-to-br from-indigo-600 to-purple-700 rounded-2xl p-5 text-white shadow-lg">
        <div className="flex items-center justify-between mb-4">
          <div>
            <p className="text-indigo-100 text-xs font-medium mb-1">Welcome back,</p>
            <h2 className="text-xl font-bold">{employee?.name?.split(' ')[0] || user?.name?.split(' ')[0]}</h2>
          </div>
          <div className="w-12 h-12 rounded-full bg-white/20 backdrop-blur flex items-center justify-center text-xl font-bold">
            {employee?.name?.[0] || user?.name?.[0]}
          </div>
        </div>
        
        {/* Quick Actions */}
        <div className="flex gap-2">
          {!(validInLog || todayRecord?.inTime) ? (
            <button
              onClick={handleCheckIn}
              className="flex-1 bg-white text-indigo-600 py-3 rounded-xl font-semibold text-sm flex items-center justify-center gap-2 shadow-lg"
            >
              <Play size={16} fill="currentColor" /> Check In
            </button>
          ) : !(validOutLog || todayRecord?.outTime) ? (
            <button
              onClick={handleCheckOut}
              className="flex-1 bg-white text-rose-600 py-3 rounded-xl font-semibold text-sm flex items-center justify-center gap-2 shadow-lg"
            >
              <Square size={14} fill="currentColor" /> Check Out
            </button>
          ) : (
            <div className="flex-1 bg-white/20 backdrop-blur py-3 rounded-xl font-semibold text-sm flex items-center justify-center gap-2">
              <CheckCircle2 size={16} /> Shift Complete
            </div>
          )}
        </div>
        {geoContext.distanceMeters != null && (
          <p className="text-indigo-100 text-xs mt-3">
            You are <span className="font-bold">{geoContext.distanceMeters}m</span> from {geoContext.targetSite?.siteName || employee?.site || 'assigned site'}.
          </p>
        )}
        {geoContext.locationError && (
          <p className="text-rose-100 text-xs mt-2">{geoContext.locationError}</p>
        )}
      </div>

      {/* Today's Status */}
      <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-semibold text-gray-900">Today's Status</h3>
          <span className={`text-sm font-medium ${latestTodayLog ? 'text-indigo-600' : getStatusColor(todayRecord)}`}>
            {latestTodayLog ? (validOutLog ? 'Check-out Submitted' : 'Check-in Submitted') : getStatusLabel(todayRecord)}
          </span>
        </div>
        
        {(todayRecord || latestTodayLog) ? (
          <div className="grid grid-cols-3 gap-4">
            <div className="text-center">
              <p className="text-xs text-gray-500 mb-1">Check In</p>
              {todayBadge && (
                <span className={`inline-flex mb-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wide ${todayBadge.className}`}>
                  {todayBadge.label}
                </span>
              )}
              <p className="font-semibold text-gray-900">
                {dashboardRecord.inTime ? formatTimeTo12Hour(dashboardRecord.inTime) : '—'}
              </p>
            </div>
            <div className="text-center border-x border-gray-100">
              <p className="text-xs text-gray-500 mb-1">Check Out</p>
              <p className="font-semibold text-gray-900">
                {dashboardRecord.outTime ? formatTimeTo12Hour(dashboardRecord.outTime) : '—'}
              </p>
            </div>
            <div className="text-center">
              <p className="text-xs text-gray-500 mb-1">Duration</p>
              <p className="font-semibold text-gray-900">
                {dashboardRecord.inTime && dashboardRecord.outTime 
                  ? calcOT(dashboardRecord.inTime, dashboardRecord.outTime, dashboardRecord.date, dashboardRecord.outDate || dashboardRecord.date, dashboardRecord.minDailyHours || 8)
                  : '—'}
              </p>
            </div>
          </div>
        ) : (
          <p className="text-sm text-gray-500 text-center py-2">No attendance record for today yet.</p>
        )}
      </div>

      {/* Quick Stats */}
      <div className="grid grid-cols-2 gap-3">
        <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100">
          <div className="flex items-center gap-2 mb-2">
            <div className="w-8 h-8 rounded-lg bg-blue-50 flex items-center justify-center">
              <Calendar size={16} className="text-blue-600" />
            </div>
            <span className="text-xs text-gray-500">Leave Balance</span>
          </div>
          <p className="text-2xl font-bold text-gray-900">
            {employee?.leaveBalance?.Casual || employee?.leaveBalance?.Annual || 0}
          </p>
          <p className="text-xs text-gray-400 mt-1">Days available</p>
        </div>
        
        <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100">
          <div className="flex items-center gap-2 mb-2">
            <div className="w-8 h-8 rounded-lg bg-emerald-50 flex items-center justify-center">
              <FileText size={16} className="text-emerald-600" />
            </div>
            <span className="text-xs text-gray-500">Requests</span>
          </div>
          <p className="text-2xl font-bold text-gray-900">{requests.length}</p>
          <p className="text-xs text-gray-400 mt-1">Recent</p>
        </div>
      </div>

      {/* Recent Requests */}
      <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-semibold text-gray-900">Recent Requests</h3>
          <button 
            onClick={() => setActiveTab('requests')}
            className="text-xs text-indigo-600 font-medium"
          >
            View All
          </button>
        </div>
        
        {requests.length === 0 ? (
          <p className="text-sm text-gray-400 text-center py-4">No recent requests</p>
        ) : (
          <div className="space-y-2">
            {requests.slice(0, 5).map(req => (
              <div key={req.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-xl">
                <div className="flex items-center gap-3">
                  <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${
                    req.status === 'Approved' ? 'bg-emerald-100 text-emerald-600' :
                    req.status === 'Rejected' ? 'bg-rose-100 text-rose-600' :
                    'bg-amber-100 text-amber-600'
                  }`}>
                    <FileText size={14} />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-gray-900">{req.type || 'Leave'}</p>
                    <p className="text-xs text-gray-500">{req.status}</p>
                  </div>
                </div>
                {req.status === 'Pending' && (
                  <button 
                    onClick={() => handleWithdraw(req.id, req.source)}
                    className="text-xs text-rose-500 font-medium px-2 py-1"
                  >
                    Withdraw
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Quick Actions Grid */}
      <div className="grid grid-cols-2 gap-3">
        <button 
          onClick={() => setActiveTab('attendance')}
          className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100 text-left"
        >
          <div className="w-10 h-10 rounded-xl bg-indigo-50 flex items-center justify-center mb-3">
            <Calendar size={20} className="text-indigo-600" />
          </div>
          <p className="font-semibold text-gray-900 text-sm">Attendance</p>
          <p className="text-xs text-gray-500 mt-1">View monthly records</p>
        </button>
        
        <button 
          onClick={() => setShowRequestModal(true)}
          className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100 text-left"
        >
          <div className="w-10 h-10 rounded-xl bg-rose-50 flex items-center justify-center mb-3">
            <Plus size={20} className="text-rose-600" />
          </div>
          <p className="font-semibold text-gray-900 text-sm">Apply Leave</p>
          <p className="text-xs text-gray-500 mt-1">Submit request</p>
        </button>
        
        <button 
          onClick={() => setActiveTab('salary')}
          className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100 text-left"
        >
          <div className="w-10 h-10 rounded-xl bg-emerald-50 flex items-center justify-center mb-3">
            <Wallet size={20} className="text-emerald-600" />
          </div>
          <p className="font-semibold text-gray-900 text-sm">Salary Slip</p>
          <p className="text-xs text-gray-500 mt-1">Download payslip</p>
        </button>
        
        <button 
          onClick={() => setActiveTab('profile')}
          className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100 text-left"
        >
          <div className="w-10 h-10 rounded-xl bg-purple-50 flex items-center justify-center mb-3">
            <User size={20} className="text-purple-600" />
          </div>
          <p className="font-semibold text-gray-900 text-sm">My Profile</p>
          <p className="text-xs text-gray-500 mt-1">View details</p>
        </button>
      </div>
      </div>
    )
  }

  // Attendance View
  const renderAttendance = () => (
    <div className="space-y-4">
      <div className="flex items-center justify-between px-1">
        <button 
          onClick={() => setActiveTab('dashboard')}
          className="flex items-center gap-1 text-gray-600"
        >
          <ChevronLeft size={20} />
          <span className="font-medium">Back</span>
        </button>
        <h2 className="font-bold text-gray-900">Attendance</h2>
        <div className="w-8" />
      </div>

      {/* Month Selector */}
      <div className="flex items-center justify-between bg-white rounded-xl p-3 shadow-sm border border-gray-100">
        <button
          onClick={() => {
            const [y, m] = month.split('-').map(Number)
            const d = new Date(y, m - 2, 1)
            setMonth(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`)
          }}
          className="p-2 hover:bg-gray-100 rounded-lg"
        >
          <ChevronLeft size={20} className="text-gray-600" />
        </button>
        <span className="font-semibold text-gray-900">
          {format(new Date(month), 'MMMM yyyy')}
        </span>
        <button
          onClick={() => {
            const [y, m] = month.split('-').map(Number)
            const d = new Date(y, m, 1)
            setMonth(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`)
          }}
          className="p-2 hover:bg-gray-100 rounded-lg"
        >
          <ChevronRight size={20} className="text-gray-600" />
        </button>
      </div>

      {/* Calendar Grid */}
      <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100">
        <div className="grid grid-cols-7 gap-1 mb-2">
          {['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'].map(day => (
            <div key={day} className="text-center text-xs font-medium text-gray-400 py-1">
              {day}
            </div>
          ))}
        </div>
        
        <div className="grid grid-cols-7 gap-1">
          {attendanceRows.map(({ date, record }) => {
            const dayNum = parseInt(date.split('-')[2])
            const isToday = date === new Date().toISOString().split('T')[0]
            
            let statusColor = 'bg-gray-100'
            if (record) {
              if (record.isAbsent) statusColor = 'bg-rose-100'
              else if (record.isOnLeave) statusColor = 'bg-blue-100'
              else if (record.holidayWorked) statusColor = 'bg-purple-100'
              else if (record.sundayWorked) statusColor = 'bg-amber-100'
              else if (record.outTime) statusColor = 'bg-emerald-100'
              else if (record.inTime) statusColor = 'bg-indigo-100'
            }
            
            return (
              <div key={date} className="aspect-square">
                <div className={`w-full h-full rounded-lg flex flex-col items-center justify-center text-xs ${statusColor} ${isToday ? 'ring-2 ring-indigo-500' : ''}`}>
                  <span className={`font-medium ${isToday ? 'text-indigo-600' : 'text-gray-700'}`}>
                    {dayNum}
                  </span>
                  {record?.inTime && (
                    <span className="text-[8px] text-gray-500 mt-0.5">
                      {record.inTime.slice(0, 5)}
                    </span>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* Legend */}
      <div className="flex flex-wrap gap-3 px-1">
        {[
          { color: 'bg-emerald-100', label: 'Complete' },
          { color: 'bg-indigo-100', label: 'Checked In' },
          { color: 'bg-blue-100', label: 'Leave' },
          { color: 'bg-rose-100', label: 'Absent' },
          { color: 'bg-gray-100', label: 'No Record' }
        ].map(item => (
          <div key={item.label} className="flex items-center gap-1.5">
            <div className={`w-3 h-3 rounded ${item.color}`} />
            <span className="text-xs text-gray-600">{item.label}</span>
          </div>
        ))}
      </div>
    </div>
  )

  // Requests View
  const renderRequests = () => {
    const grouped = groupRequestsByMonth(requests)
    const monthKeys = Object.keys(grouped).sort((a, b) => {
      const dateA = new Date(a)
      const dateB = new Date(b)
      return dateB - dateA
    })

    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between px-1">
          <button 
            onClick={() => setActiveTab('dashboard')}
            className="flex items-center gap-1 text-gray-600"
          >
            <ChevronLeft size={20} />
            <span className="font-medium">Back</span>
          </button>
          <h2 className="font-bold text-gray-900">My Requests</h2>
          <button 
            onClick={() => setShowRequestModal(true)}
            className="w-8 h-8 bg-indigo-600 rounded-lg flex items-center justify-center text-white"
          >
            <Plus size={18} />
          </button>
        </div>

        {requests.length === 0 ? (
          <div className="text-center py-12">
            <FileText size={48} className="text-gray-300 mx-auto mb-4" />
            <p className="text-gray-500 mb-4">No requests yet</p>
            <button 
              onClick={() => setShowRequestModal(true)}
              className="bg-indigo-600 text-white px-6 py-2.5 rounded-xl font-medium"
            >
              Create Request
            </button>
          </div>
        ) : (
          <div className="space-y-4">
            {monthKeys.map(monthKey => {
              const monthRequests = grouped[monthKey]
              const isExpanded = expandedMonths[monthKey] !== false
              
              const pendingCount = monthRequests.filter(r => r.status === 'Pending' || (!r.status && r.hrApproval === 'Pending')).length
              const approvedCount = monthRequests.filter(r => r.status === 'Approved').length
              const rejectedCount = monthRequests.filter(r => r.status === 'Rejected').length

              return (
                <div key={monthKey} className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
                  {/* Month Header */}
                  <button
                    onClick={() => toggleMonth(monthKey)}
                    className="w-full flex items-center justify-between p-4 bg-gray-50/50 border-b border-gray-100"
                  >
                    <div className="flex items-center gap-3">
                      <div className={`transform transition-transform duration-200 ${isExpanded ? 'rotate-90' : ''}`}>
                        <ChevronRightIcon size={16} className="text-gray-400" />
                      </div>
                      <div>
                        <h3 className="font-bold text-gray-900">{monthKey}</h3>
                        <p className="text-xs text-gray-400">{monthRequests.length} request{monthRequests.length !== 1 ? 's' : ''}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5">
                      {pendingCount > 0 && (
                        <span className="text-[10px] font-bold text-amber-700 bg-amber-100 px-2 py-0.5 rounded-full">
                          {pendingCount}
                        </span>
                      )}
                      {approvedCount > 0 && (
                        <span className="text-[10px] font-bold text-green-700 bg-green-100 px-2 py-0.5 rounded-full">
                          {approvedCount}
                        </span>
                      )}
                      {rejectedCount > 0 && (
                        <span className="text-[10px] font-bold text-red-700 bg-red-100 px-2 py-0.5 rounded-full">
                          {rejectedCount}
                        </span>
                      )}
                    </div>
                  </button>

                  {/* Month Content */}
                  {isExpanded && (
                    <div className="p-4 space-y-3">
                      {monthRequests.map(req => {
                        const statusInfo = getDetailedStatus(req)
                        return (
                          <div key={req.id} className="bg-white rounded-xl p-4 border border-gray-100 shadow-sm">
                            <div className="flex items-start justify-between mb-3">
                              <div className="flex items-center gap-3">
                                <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${statusInfo.color.split(' ')[0]}`}>
                                  <FileText size={18} className={statusInfo.color.includes('text-red') ? 'text-red-600' : statusInfo.color.includes('text-green') ? 'text-green-600' : 'text-amber-600'} />
                                </div>
                                <div>
                                  <p className="font-semibold text-gray-900">{req.type || 'Leave'}</p>
                                  <p className="text-xs text-gray-500">
                                    {req.createdAt?.toDate?.() ? format(req.createdAt.toDate(), 'MMM d, yyyy') : 'Recently'}
                                  </p>
                                </div>
                              </div>
                              <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${statusInfo.color}`}>
                                {statusInfo.label}
                              </span>
                            </div>
                            
                            {/* Details */}
                            <div className="mb-3">
                              {req.type === 'Leave' && (
                                <p className="text-sm text-gray-600">
                                  {req.leaveType || 'Leave'}: {req.fromDate} → {req.toDate || req.fromDate}
                                </p>
                              )}
                              {req.type === 'Permission' && (
                                <p className="text-sm text-gray-600">
                                  {req.permissionDate || req.date} at {req.permissionTime || req.fromTime || '--'}
                                </p>
                              )}
                              {(req.type === 'Advance' || req.type === 'Expense') && (
                                <p className="text-sm text-gray-600">₹{req.amount}</p>
                              )}
                            </div>

                            {/* Approval Workflow */}
                            <div className="bg-gray-50 rounded-lg p-3 mb-3">
                              <p className="text-[10px] font-bold text-gray-400 uppercase mb-2">Approval Status</p>
                              
                              {req.approvalType === 'multi' && (
                                <div className="flex items-center gap-2 mb-1.5">
                                  <div className={`w-1.5 h-1.5 rounded-full ${
                                    req.deptHeadApproval === 'Approved' ? 'bg-green-500' : 
                                    req.deptHeadApproval === 'Rejected' ? 'bg-red-500' : 
                                    'bg-amber-500'
                                  }`}></div>
                                  <span className={`text-xs ${
                                    req.deptHeadApproval === 'Approved' ? 'text-green-700' : 
                                    req.deptHeadApproval === 'Rejected' ? 'text-red-700' : 
                                    'text-amber-600'
                                  }`}>
                                    Dept Head: {req.deptHeadApproval || 'Pending'}
                                  </span>
                                </div>
                              )}
                              
                              <div className="flex items-center gap-2 mb-1.5">
                                <div className={`w-1.5 h-1.5 rounded-full ${
                                  req.hrApproval === 'Approved' ? 'bg-green-500' : 
                                  req.hrApproval === 'Rejected' ? 'bg-red-500' : 
                                  'bg-amber-500'
                                }`}></div>
                                <span className={`text-xs ${
                                  req.hrApproval === 'Approved' ? 'text-green-700' : 
                                  req.hrApproval === 'Rejected' ? 'text-red-700' : 
                                  'text-amber-600'
                                }`}>
                                  HR: {req.hrApproval || 'Pending'}
                                </span>
                              </div>
                              
                              <div className="flex items-center gap-2">
                                <div className={`w-1.5 h-1.5 rounded-full ${
                                  req.mdApproval === 'Approved' ? 'bg-green-500' : 
                                  req.mdApproval === 'Rejected' ? 'bg-red-500' : 
                                  req.hrApproval === 'Approved' ? 'bg-amber-500' :
                                  'bg-gray-300'
                                }`}></div>
                                <span className={`text-xs ${
                                  req.mdApproval === 'Approved' ? 'text-green-700' : 
                                  req.mdApproval === 'Rejected' ? 'text-red-700' : 
                                  req.hrApproval === 'Approved' ? 'text-amber-600' :
                                  'text-gray-400'
                                }`}>
                                  MD: {req.mdApproval || (req.hrApproval === 'Approved' ? 'Pending' : 'Waiting')}
                                </span>
                              </div>

                              {(req.type === 'Advance' || req.type === 'Expense') && (
                                <div className="mt-2 pt-2 border-t border-gray-200">
                                  <div className="flex items-center gap-2">
                                    <div className={`w-1.5 h-1.5 rounded-full ${
                                      req.paymentStatus === 'Paid' ? 'bg-emerald-500' : 'bg-gray-300'
                                    }`}></div>
                                    <span className={`text-xs ${
                                      req.paymentStatus === 'Paid' ? 'text-emerald-700' : 'text-gray-400'
                                    }`}>
                                      Payment: {req.paymentStatus || 'Pending'}
                                    </span>
                                  </div>
                                </div>
                              )}
                            </div>
                            
                            <p className="text-sm text-gray-600 mb-3 line-clamp-2">{req.reason}</p>
                            
                            {req.status === 'Pending' && (
                              <button 
                                onClick={() => handleWithdraw(req.id, req.source)}
                                className="w-full py-2.5 text-rose-600 text-sm font-medium bg-rose-50 rounded-xl"
                              >
                                Withdraw Request
                              </button>
                            )}
                          </div>
                        )
                      })}
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

  // Profile View
  const renderProfile = () => (
    <div className="space-y-4">
      <div className="flex items-center justify-between px-1">
        <button 
          onClick={() => setActiveTab('dashboard')}
          className="flex items-center gap-1 text-gray-600"
        >
          <ChevronLeft size={20} />
          <span className="font-medium">Back</span>
        </button>
        <h2 className="font-bold text-gray-900">My Profile</h2>
        <div className="w-8" />
      </div>

      {/* Profile Header */}
      <div className="bg-gradient-to-br from-indigo-600 to-purple-700 rounded-2xl p-6 text-white text-center">
        <div className="w-20 h-20 rounded-full bg-white/20 backdrop-blur mx-auto mb-4 flex items-center justify-center text-3xl font-bold">
          {employee?.name?.[0] || user?.name?.[0]}
        </div>
        <h2 className="text-xl font-bold mb-1">{employee?.name || user?.name}</h2>
        <p className="text-indigo-100 text-sm">{employee?.designation || 'Employee'}</p>
        <p className="text-indigo-200 text-xs mt-1">{employee?.department || 'Department'}</p>
      </div>

      {/* Info Cards */}
      <div className="space-y-3">
        <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100">
          <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Personal Information</h3>
          
          <div className="space-y-3">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-blue-50 flex items-center justify-center">
                <Mail size={18} className="text-blue-600" />
              </div>
              <div>
                <p className="text-xs text-gray-500">Email</p>
                <p className="text-sm font-medium text-gray-900">{employee?.email || user?.email}</p>
              </div>
            </div>
            
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-emerald-50 flex items-center justify-center">
                <Phone size={18} className="text-emerald-600" />
              </div>
              <div>
                <p className="text-xs text-gray-500">Phone</p>
                <p className="text-sm font-medium text-gray-900">{employee?.mobile || 'Not provided'}</p>
              </div>
            </div>
            
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-purple-50 flex items-center justify-center">
                <MapPin size={18} className="text-purple-600" />
              </div>
              <div>
                <p className="text-xs text-gray-500">Location</p>
                <p className="text-sm font-medium text-gray-900">{employee?.address || 'Not provided'}</p>
              </div>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100">
          <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Work Information</h3>
          
          <div className="space-y-3">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-amber-50 flex items-center justify-center">
                <Briefcase size={18} className="text-amber-600" />
              </div>
              <div>
                <p className="text-xs text-gray-500">Employee ID</p>
                <p className="text-sm font-medium text-gray-900">{employee?.empCode || employee?.id?.slice(0, 8) || 'N/A'}</p>
              </div>
            </div>
            
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-rose-50 flex items-center justify-center">
                <Calendar size={18} className="text-rose-600" />
              </div>
              <div>
                <p className="text-xs text-gray-500">Joined Date</p>
                <p className="text-sm font-medium text-gray-900">
                  {employee?.joinedDate ? format(new Date(employee.joinedDate), 'MMM d, yyyy') : 'N/A'}
                </p>
              </div>
            </div>
            
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-indigo-50 flex items-center justify-center">
                <Shield size={18} className="text-indigo-600" />
              </div>
              <div>
                <p className="text-xs text-gray-500">Employment Type</p>
                <p className="text-sm font-medium text-gray-900">{employee?.employmentType || 'Full Time'}</p>
              </div>
            </div>
          </div>
        </div>

        {/* Documents */}
        {employee?.documents && employee.documents.length > 0 && (
          <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100">
            <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Documents</h3>
            
            <div className="space-y-2">
              {employee.documents.map((doc, idx) => (
                <div key={idx} className="flex items-center justify-between p-3 bg-gray-50 rounded-xl">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg bg-red-50 flex items-center justify-center">
                      <FileText size={18} className="text-red-600" />
                    </div>
                    <p className="text-sm font-medium text-gray-900">{doc.name}</p>
                  </div>
                  <button className="p-2 text-indigo-600 hover:bg-indigo-50 rounded-lg">
                    <Eye size={18} />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Logout Button */}
      <button 
        onClick={() => {
          if (confirm('Are you sure you want to logout?')) {
            logout()
          }
        }}
        className="w-full py-3.5 text-rose-600 font-medium bg-rose-50 rounded-xl flex items-center justify-center gap-2"
      >
        <LogOut size={18} />
        Logout
      </button>
    </div>
  )

  // Salary View
  const renderSalary = () => (
    <div className="space-y-4">
      <div className="flex items-center justify-between px-1">
        <button 
          onClick={() => setActiveTab('dashboard')}
          className="flex items-center gap-1 text-gray-600"
        >
          <ChevronLeft size={20} />
          <span className="font-medium">Back</span>
        </button>
        <h2 className="font-bold text-gray-900">Salary Slip</h2>
        <div className="w-8" />
      </div>

      <div className="bg-gradient-to-br from-emerald-500 to-teal-600 rounded-2xl p-6 text-white">
        <p className="text-emerald-100 text-sm mb-1">Monthly Salary</p>
        <h3 className="text-3xl font-bold">₹{employee?.salary?.toLocaleString() || '0'}</h3>
        <p className="text-emerald-100 text-sm mt-2">Gross Pay</p>
      </div>

      <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100">
        <h3 className="font-semibold text-gray-900 mb-4">Download Payslip</h3>
        
        <div className="space-y-2">
          {[
            { month: 'December 2024', status: 'ready' },
            { month: 'November 2024', status: 'ready' },
            { month: 'October 2024', status: 'ready' }
          ].map((item, idx) => (
            <div key={idx} className="flex items-center justify-between p-3 bg-gray-50 rounded-xl">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-emerald-50 flex items-center justify-center">
                  <FileText size={18} className="text-emerald-600" />
                </div>
                <p className="font-medium text-gray-900">{item.month}</p>
              </div>
              <button className="px-4 py-2 bg-emerald-600 text-white text-sm font-medium rounded-lg">
                Download
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  )

  // Request Modal
  const renderRequestModal = () => {
    // Calculate total days for leave
    const calculateTotalDays = () => {
      if (!requestForm.fromDate || !requestForm.toDate) return 0
      const start = new Date(requestForm.fromDate)
      const end = new Date(requestForm.toDate)
      const days = differenceInCalendarDays(end, start) + 1
      return days > 0 ? days : 0
    }

    // Handle file upload
    const handleFileChange = (e) => {
      const file = e.target.files[0]
      if (file) {
        if (file.size > 2 * 1024 * 1024) {
          setValidationErrors({ attachment: 'File size must be less than 2MB' })
          return
        }
        const allowedTypes = ['application/pdf', 'image/jpeg', 'image/png', 'image/jpg']
        if (!allowedTypes.includes(file.type)) {
          setValidationErrors({ attachment: 'Only PDF and images (JPG, PNG) are allowed' })
          return
        }
        setValidationErrors({ ...validationErrors, attachment: null })
        setRequestForm({ ...requestForm, attachment: file })
      }
    }

    return (
      <Modal
        isOpen={showRequestModal}
        onClose={() => {
          setShowRequestModal(false)
          setValidationErrors({})
          setSubmitSuccess('')
        }}
        title="New Request"
        size="full"
      >
        <div className="flex flex-col h-full bg-white">
          <div className="flex-1 p-4 space-y-4 overflow-y-auto">
            {/* Request Type */}
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
                Request Type
              </label>
              <div className="grid grid-cols-3 gap-2">
                {['Leave', 'Permission', 'Advance'].map(type => (
                  <button
                    key={type}
                    onClick={() => {
                      setRequestForm({ ...requestForm, type })
                      setValidationErrors({})
                      setSubmitSuccess('')
                    }}
                    className={`py-2.5 rounded-xl text-xs font-medium transition-colors ${
                      requestForm.type === type 
                        ? 'bg-gray-900 text-white' 
                        : 'bg-gray-100 text-gray-600'
                    }`}
                  >
                    {type}
                  </button>
                ))}
              </div>
            </div>

            {/* Leave Type (if Leave) */}
            {requestForm.type === 'Leave' && (
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
                  Leave Type
                </label>
                <select
                  value={requestForm.leaveType}
                  onChange={(e) => setRequestForm({ ...requestForm, leaveType: e.target.value })}
                  className="w-full px-3 py-3 bg-gray-50 border border-gray-200 rounded-xl text-sm"
                >
                  {['Casual', 'Sick', 'Annual', 'Unpaid'].map(type => (
                    <option key={type} value={type}>{type} Leave</option>
                  ))}
                </select>
              </div>
            )}

            {/* Dates with React Calendar for Leave */}
            {requestForm.type === 'Leave' && (
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
                      From Date
                    </label>
                    <DatePicker
                      selected={requestForm.fromDate ? new Date(requestForm.fromDate) : null}
                      onChange={(date) => {
                        const dateStr = date ? date.toISOString().split('T')[0] : ''
                        setRequestForm({ 
                          ...requestForm, 
                          fromDate: dateStr,
                          toDate: requestForm.toDate || dateStr // Auto-set to date if not set
                        })
                      }}
                      dateFormat="dd/MM/yyyy"
                      className="w-full px-3 py-3 bg-gray-50 border border-gray-200 rounded-xl text-sm"
                      placeholderText="Select date"
                      minDate={new Date()}
                      filterDate={(date) => date.getDay() !== 0} // Disable Sundays
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
                      To Date
                    </label>
                    <DatePicker
                      selected={requestForm.toDate ? new Date(requestForm.toDate) : null}
                      onChange={(date) => {
                        const dateStr = date ? date.toISOString().split('T')[0] : ''
                        setRequestForm({ ...requestForm, toDate: dateStr })
                      }}
                      dateFormat="dd/MM/yyyy"
                      className="w-full px-3 py-3 bg-gray-50 border border-gray-200 rounded-xl text-sm"
                      placeholderText="Select date"
                      minDate={requestForm.fromDate ? new Date(requestForm.fromDate) : new Date()}
                      filterDate={(date) => date.getDay() !== 0} // Disable Sundays
                    />
                  </div>
                </div>
                
                {/* Total Days Display */}
                {requestForm.fromDate && requestForm.toDate && (
                  <div className="bg-indigo-50 border border-indigo-200 rounded-xl p-3 flex items-center justify-between">
                    <span className="text-sm font-medium text-indigo-700">Total Days:</span>
                    <span className="text-lg font-bold text-indigo-700">{calculateTotalDays()} day(s)</span>
                  </div>
                )}
              </div>
            )}

            {/* Permission with Time Pickers */}
            {requestForm.type === 'Permission' && (
              <div className="space-y-3">
                <div>
                  <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
                    Date
                  </label>
                  <DatePicker
                    selected={requestForm.date ? new Date(requestForm.date) : null}
                    onChange={(date) => {
                      const dateStr = date ? date.toISOString().split('T')[0] : ''
                      setRequestForm({ ...requestForm, date: dateStr })
                    }}
                    dateFormat="dd/MM/yyyy"
                    className="w-full px-3 py-3 bg-gray-50 border border-gray-200 rounded-xl text-sm"
                    placeholderText="Select date"
                    minDate={new Date()}
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
                      From Time
                    </label>
                    <button
                      onClick={() => {
                        setTimePickerMode('fromTime')
                        setShowTimePicker(true)
                      }}
                      className="w-full px-3 py-3 bg-gray-50 border border-gray-200 rounded-xl text-sm text-left"
                    >
                      {requestForm.fromTime || 'Select time'}
                    </button>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
                      To Time
                    </label>
                    <button
                      onClick={() => {
                        setTimePickerMode('toTime')
                        setShowTimePicker(true)
                      }}
                      className="w-full px-3 py-3 bg-gray-50 border border-gray-200 rounded-xl text-sm text-left"
                    >
                      {requestForm.toTime || 'Select time'}
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Advance with Date and Quick Amount Toggles */}
            {requestForm.type === 'Advance' && (
              <div className="space-y-3">
                <div>
                  <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
                    Request Date
                  </label>
                  <DatePicker
                    selected={requestForm.requestDate ? new Date(requestForm.requestDate) : null}
                    onChange={(date) => {
                      const dateStr = date ? date.toISOString().split('T')[0] : ''
                      setRequestForm({ ...requestForm, requestDate: dateStr })
                    }}
                    dateFormat="dd/MM/yyyy"
                    className="w-full px-3 py-3 bg-gray-50 border border-gray-200 rounded-xl text-sm"
                    placeholderText="Select date"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
                    Amount (₹)
                  </label>
                  <input
                    type="number"
                    value={requestForm.amount}
                    onChange={(e) => setRequestForm({ ...requestForm, amount: e.target.value })}
                    placeholder="Enter amount"
                    className="w-full px-3 py-3 bg-gray-50 border border-gray-200 rounded-xl text-sm"
                  />
                  {/* Quick Amount Toggles */}
                  <div className="flex gap-2 mt-2 flex-wrap">
                    {[500, 1000, 2000, 3000].map(amt => (
                      <button
                        key={amt}
                        onClick={() => setRequestForm({ ...requestForm, amount: amt.toString() })}
                        className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                          requestForm.amount === amt.toString()
                            ? 'bg-indigo-600 text-white'
                            : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                        }`}
                      >
                        ₹{amt}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* Reason */}
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
                Reason
              </label>
              <textarea
                value={requestForm.reason}
                onChange={(e) => setRequestForm({ ...requestForm, reason: e.target.value })}
                placeholder="Enter reason for request..."
                rows={3}
                className="w-full px-3 py-3 bg-gray-50 border border-gray-200 rounded-xl text-sm resize-none"
              />
            </div>

            {/* File Upload */}
            <div>
              <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
                Attachment (Optional - PDF/Image only, max 2MB)
              </label>
              <div className="relative">
                <input
                  type="file"
                  accept=".pdf,image/jpeg,image/png,image/jpg"
                  onChange={handleFileChange}
                  className="hidden"
                  id="file-upload"
                />
                <label
                  htmlFor="file-upload"
                  className="flex items-center gap-2 px-4 py-3 bg-gray-50 border border-gray-200 border-dashed rounded-xl cursor-pointer hover:bg-gray-100 transition-colors"
                >
                  <Upload size={20} className="text-gray-400" />
                  <span className="text-sm text-gray-600">
                    {requestForm.attachment ? requestForm.attachment.name : 'Click to upload file'}
                  </span>
                  {requestForm.attachment && (
                    <button
                      onClick={(e) => {
                        e.preventDefault()
                        setRequestForm({ ...requestForm, attachment: null })
                      }}
                      className="ml-auto p-1 text-gray-400 hover:text-red-500"
                    >
                      <X size={16} />
                    </button>
                  )}
                </label>
              </div>
              {fileUploading && (
                <p className="text-xs text-indigo-600 mt-1">Uploading file...</p>
              )}
            </div>

            {/* Validation Errors */}
            {Object.keys(validationErrors).length > 0 && (
              <div className="bg-red-50 border border-red-200 rounded-xl p-3 space-y-1">
                {Object.entries(validationErrors).map(([key, error]) => (
                  error && (
                    <p key={key} className="text-xs text-red-600 flex items-center gap-1">
                      <AlertCircle size={12} />
                      {error}
                    </p>
                  )
                ))}
              </div>
            )}
          </div>

          <div className="p-4 border-t border-gray-100 space-y-3">
            {/* Success Message */}
            {submitSuccess && (
              <div className="bg-green-50 border border-green-200 rounded-xl p-3 flex items-center gap-2">
                <CheckCircle2 size={16} className="text-green-600" />
                <span className="text-sm text-green-700">{submitSuccess}</span>
              </div>
            )}

            <div className="flex gap-3">
              <button
                onClick={() => setShowRequestModal(false)}
                className="flex-1 py-3 text-sm font-medium text-gray-600 bg-gray-100 rounded-xl"
              >
                Cancel
              </button>
              <button
                onClick={handleRequestSubmit}
                disabled={loading || fileUploading}
                className="flex-1 py-3 text-sm font-medium text-white bg-indigo-600 rounded-xl disabled:opacity-50"
              >
                {loading || fileUploading ? 'Submitting...' : 'Submit Request'}
              </button>
            </div>
          </div>
        </div>

        {/* Time Picker Modal */}
        {showTimePicker && (
          <div className="absolute inset-0 bg-black/50 flex items-end z-50">
            <div className="bg-white w-full rounded-t-2xl p-4">
              <TimePicker
                value={requestForm[timePickerMode] || ''}
                onChange={(time) => {
                  setRequestForm({ ...requestForm, [timePickerMode]: time })
                  setShowTimePicker(false)
                }}
                onClose={() => setShowTimePicker(false)}
              />
            </div>
          </div>
        )}
      </Modal>
    )
  }

  if (loading && !employee) {
    return (
      <div className="flex-1 flex items-center justify-center bg-white">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
      </div>
    )
  }

  return (
    <div className="flex-1 flex flex-col bg-gray-50 h-full">
      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4">
        {activeTab === 'dashboard' && renderDashboard()}
        {activeTab === 'attendance' && renderAttendance()}
        {activeTab === 'requests' && renderRequests()}
        {activeTab === 'salary' && renderSalary()}
        {activeTab === 'profile' && renderProfile()}
      </div>

      {/* Bottom Navigation */}
      <nav className="bg-white border-t border-gray-200 px-4 py-2">
        <div className="flex justify-around items-center">
          {[
            { id: 'dashboard', icon: LayoutDashboard, label: 'Home' },
            { id: 'attendance', icon: Calendar, label: 'Attendance' },
            { id: 'requests', icon: FileText, label: 'Requests' },
            { id: 'profile', icon: User, label: 'Profile' }
          ].map(item => {
            const Icon = item.icon
            const isActive = activeTab === item.id
            return (
              <button
                key={item.id}
                onClick={() => setActiveTab(item.id)}
                className={`flex flex-col items-center gap-1 py-2 px-3 rounded-xl transition-colors ${
                  isActive ? 'text-indigo-600' : 'text-gray-400'
                }`}
              >
                <Icon size={22} strokeWidth={isActive ? 2.5 : 2} />
                <span className="text-[10px] font-medium">{item.label}</span>
              </button>
            )
          })}
        </div>
      </nav>

      {/* Request Modal */}
      {renderRequestModal()}

      <SelfieCaptureModal
        isOpen={showSelfieCaptureModal}
        onClose={() => setShowSelfieCaptureModal(false)}
        title={captureEventType === ATTENDANCE_EVENT_IN ? 'Check-In Selfie' : 'Check-Out Selfie'}
        helperText={
          geoContext.distanceMeters != null
            ? `You are ${geoContext.distanceMeters}m from ${geoContext.targetSite?.siteName || employee?.site || 'assigned site'}. Capture selfie to submit for HR approval.`
            : 'Capture selfie to submit attendance for HR approval.'
        }
        allowCapture={geoContext.withinRange}
        confirmLabel={submittingAttendance ? 'Submitting...' : 'Submit For Approval'}
        onConfirm={async (blob) => {
          await submitGeoAttendance({ imageBlob: blob, isException: false, exceptionReason: '' })
        }}
      />

      <Modal
        isOpen={showExceptionModal}
        onClose={() => setShowExceptionModal(false)}
        title="Out of Site - Exception Request"
        size="lg"
      >
        <div className="p-5 space-y-4">
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-[12px] text-amber-800">
            {geoContext.distanceMeters != null ? (
              <span>
                You are <strong>{geoContext.distanceMeters}m</strong> away from the configured site radius of <strong>{geoContext.radiusMeters}m</strong>.
              </span>
            ) : (
              <span>Configured site is unavailable or you are outside allowed range.</span>
            )}
            <div className="mt-1 text-[11px]">Direct attendance is blocked. You can submit an exception request to HR.</div>
          </div>

          <div>
            <label className="block text-[11px] font-semibold text-gray-700 mb-1">Selfie (required)</label>
            <input
              type="file"
              accept="image/*"
              capture="user"
              onChange={(e) => setExceptionForm(prev => ({ ...prev, file: e.target.files?.[0] || null }))}
              className="w-full text-sm border border-gray-200 rounded-lg p-2"
            />
          </div>

          <div>
            <label className="block text-[11px] font-semibold text-gray-700 mb-1">Reason (required)</label>
            <textarea
              value={exceptionForm.reason}
              onChange={(e) => setExceptionForm(prev => ({ ...prev, reason: e.target.value }))}
              className="w-full min-h-[90px] text-sm border border-gray-200 rounded-lg p-2 outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
              placeholder="Explain site visit / field movement context..."
            />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={() => setShowExceptionModal(false)}
              className="h-10 px-4 rounded-lg border border-gray-200 text-xs font-black uppercase tracking-wider text-gray-600 hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={submittingAttendance}
              onClick={handleExceptionSubmit}
              className="h-10 px-4 rounded-lg bg-amber-600 text-white text-xs font-black uppercase tracking-wider hover:bg-amber-700 disabled:opacity-50"
            >
              {submittingAttendance ? 'Submitting...' : 'Submit Exception'}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
