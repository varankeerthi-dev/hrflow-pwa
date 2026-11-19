import React, { useState, useEffect, useMemo } from 'react'
import { useAuth } from '../hooks/useAuth'
import { useEmployees } from '../hooks/useEmployees'
import { useAttendance, calcOT } from '../hooks/useAttendance'
import { useLeaves } from '../hooks/useLeaves'
import { useLeaveBalances } from '../hooks/useLeaveBalances'
import { db, storage } from '../lib/firebase'
import { collection, query, where, getDocs, deleteDoc, doc, addDoc, updateDoc, serverTimestamp, orderBy } from 'firebase/firestore'
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage'
import { attendanceCol } from '../lib/firestore'
import { formatTimeTo12Hour } from '../lib/salaryUtils'
import { buildPortalApprovalFields, requiresStandardApproval } from '../lib/portalApprovalWorkflow'
import { buildLeaveCoverageCandidates, getLeavePolicy } from '../lib/leaveLifecycle'
import { normalizeLeaveTypeCode } from '../lib/leaveEntitlements'
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
  X,
  Receipt,
  RotateCcw,
  Edit2,
  Check,
  Palmtree,
  Timer,
  DollarSign,
  Camera,
  RefreshCw,
  QrCode,
  Sparkles,
  MessageCircle,
  FileCheck
} from 'lucide-react'
import { format, differenceInCalendarDays } from 'date-fns'

// Validation Schemas
const leaveSchema = z.object({
  leaveType: z.string().min(1, 'Choose a leave type'),
  fromDate: z.string().min(1, 'From date is required'),
  toDate: z.string().min(1, 'To date is required'),
  halfDay: z.boolean().optional(),
  reason: z.string().min(5, 'Reason must be at least 5 characters'),
}).refine((data) => {
  return new Date(data.toDate) >= new Date(data.fromDate)
}, { message: 'To date must be after or same as from date' }).refine((data) => !data.halfDay || data.fromDate === data.toDate, { message: 'Half-day requests must be for a single date', path: ['halfDay'] })

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

const expenseSchema = z.object({
  expenseCategory: z.string().min(1, 'Choose an expense category'),
  amount: z.number().min(1, 'Amount must be greater than 0'),
  requestDate: z.string().min(1, 'Expense date is required'),
  reason: z.string().min(3, 'Description must be at least 3 characters'),
})

const EXPENSE_CATEGORIES = [
  'Food & Refreshment',
  'Travel & Conveyance',
  'Fuel / Petrol',
  'Site Purchase & Materials',
  'Hotel & Accommodation',
  'Mobile & Internet Recharge',
  'Vehicle Maintenance',
  'Courier & Postage',
  'Office Supplies',
  'Miscellaneous'
]

export default function MobileEmployeePortal() {
  const { user, logout } = useAuth()
  const { employees, loading: empLoading, updateEmployee } = useEmployees(user?.orgId)
  const { fetchByDate } = useAttendance(user?.orgId)
  const { applyLeave } = useLeaves(user?.orgId)

  const [activeTab, setActiveTab] = useState('dashboard') // 'dashboard' | 'attendance' | 'requests' | 'salary' | 'profile'
  const [loading, setLoading] = useState(false)
  const [requests, setRequests] = useState([])
  const [requestFilter, setRequestFilter] = useState('All') // 'All' | 'Pending' | 'Approved' | 'Rejected'
  const [expandedMonths, setExpandedMonths] = useState({})
  const [showRequestModal, setShowRequestModal] = useState(false)
  const [todayRecord, setTodayRecord] = useState(null)
  const [attendanceRows, setAttendanceRows] = useState([])
  const [selectedAttendanceDate, setSelectedAttendanceDate] = useState(() => new Date().toISOString().split('T')[0])
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

  // Profile Edit State
  const [showProfileEditModal, setShowProfileEditModal] = useState(false)
  const [savingProfile, setSavingProfile] = useState(false)
  const [profileSuccessMsg, setProfileSuccessMsg] = useState('')
  const [profileForm, setProfileForm] = useState({
    mobile: '',
    whatsapp: '',
    emergencyContact: '',
    emergencyPhone: '',
    address: '',
    personalBank: {
      bankName: '',
      holderName: '',
      accountNo: '',
      ifsc: '',
    },
    upiId: '',
  })

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

  // Request form state (Leave, Permission, Advance, Expense)
  const [requestForm, setRequestForm] = useState({
    type: 'Leave', // 'Leave' | 'Permission' | 'Advance' | 'Expense'
    leaveType: 'Casual',
    fromDate: '',
    toDate: '',
    halfDay: false,
    date: '',
    fromTime: '',
    toTime: '',
    requestDate: new Date().toISOString().split('T')[0],
    amount: '',
    expenseCategory: 'Food & Refreshment',
    reason: '',
    attachment: null,
    resubmitOriginalId: null,
    resubmitSource: null,
  })

  const { orgData: leaveOrgData, leaveTypes: configuredLeaveTypes, balances: leaveBalances, balanceByCode: leaveBalanceByCode, refresh: refreshLeaveBalances } = useLeaveBalances(user?.orgId, employee?.id || null)
  const selectedLeaveType = configuredLeaveTypes.some((type) => type.name === requestForm.leaveType) ? requestForm.leaveType : (configuredLeaveTypes[0]?.name || requestForm.leaveType)
  const selectedLeaveBalance = leaveBalanceByCode[normalizeLeaveTypeCode(selectedLeaveType)]
  const selectedLeavePolicy = getLeavePolicy(leaveOrgData, selectedLeaveType, requestForm.fromDate || new Date().toISOString().slice(0, 10))
  
  const leaveRequestPreview = useMemo(() => {
    if (requestForm.type !== 'Leave' || !requestForm.fromDate || !requestForm.toDate || requestForm.toDate < requestForm.fromDate) return []
    const requestedUnits = requestForm.halfDay ? 0.5 : differenceInCalendarDays(new Date(requestForm.toDate), new Date(requestForm.fromDate)) + 1
    return buildLeaveCoverageCandidates({ ...requestForm, leaveType: selectedLeaveType, requestedUnits, orgData: leaveOrgData })
  }, [leaveOrgData, requestForm, selectedLeaveType])

  const leaveRequestUnits = leaveRequestPreview.reduce((sum, candidate) => sum + Number(candidate.leaveUnits || 0), 0)
  const leaveRequestPaidUnits = leaveRequestPreview.reduce((sum, candidate) => sum + (String(candidate.classification || '').includes('paid') ? Number(candidate.leaveUnits || 0) : 0), 0)
  const leaveRequestShortfall = selectedLeaveBalance?.configured ? Math.max(0, leaveRequestPaidUnits - Number(selectedLeaveBalance.available || 0)) : 0
  
  const [validationErrors, setValidationErrors] = useState({})
  const [submitSuccess, setSubmitSuccess] = useState('')
  const [fileUploading, setFileUploading] = useState(false)
  const [portalApprovalSettingsByModule, setPortalApprovalSettingsByModule] = useState({})

  useEffect(() => {
    if (!user?.orgId) return
    const fetchSettings = async () => {
      try {
        const q = query(collection(db, 'organisations', user.orgId, 'portalApprovalSettings'))
        const snap = await getDocs(q)
        const nextSettings = {}
        snap.docs.forEach((docSnap) => {
          const data = docSnap.data() || {}
          if (data.moduleName) {
            nextSettings[data.moduleName] = data
          }
        })
        setPortalApprovalSettingsByModule(nextSettings)
      } catch (err) {
        console.warn('Failed to fetch approval settings:', err)
      }
    }
    fetchSettings()
  }, [user?.orgId])

  const getModuleNameForRequestType = (type) => {
    if (type === 'Permission') return 'Leave'
    if (type === 'Advance') return 'Advance'
    if (type === 'Expense') return portalApprovalSettingsByModule['Expense'] ? 'Expense' : 'Advance'
    return 'Leave'
  }

  const getApprovalSettingForType = (type) => {
    const moduleName = getModuleNameForRequestType(type)
    return portalApprovalSettingsByModule[moduleName]
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
    try {
      const today = new Date().toISOString().split('T')[0]
      const records = await fetchByDate(today)
      setTodayRecord(records.find(r => r.employeeId === employeeId) || null)
    } catch (err) {
      console.warn('Failed to load today record:', err)
    }
  }

  const loadMonth = async () => {
    const [year, mon] = month.split('-')
    const start = `${month}-01`
    const endDay = new Date(year, mon, 0).getDate()
    const end = `${month}-${String(endDay).padStart(2, '0')}`

    try {
      // Query by employeeId directly (uses standard single-field index, no composite index needed)
      const q = query(
        attendanceCol(user.orgId),
        where('employeeId', '==', employeeId)
      )
      const snap = await getDocs(q)

      const map = {}
      snap.docs.forEach(d => {
        const rec = d.data()
        if (rec.date >= start && rec.date <= end) {
          map[rec.date] = rec
        }
      })

      const days = []
      for (let i = 1; i <= endDay; i++) {
        const dStr = `${month}-${String(i).padStart(2, '0')}`
        days.push({ date: dStr, record: map[dStr] || null })
      }
      setAttendanceRows(days)
    } catch (err) {
      console.error('Failed to load monthly attendance:', err)
    }
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

  // Geo attendance workflow
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

  // Open Resubmit for Rejected Request
  const handleOpenResubmit = (req) => {
    const isAdvOrExp = req.source === 'advances_expenses' || req.type === 'Advance' || req.type === 'Expense'
    const reqType = req.type || (isAdvOrExp ? (req.category?.includes('Advance') ? 'Advance' : 'Expense') : 'Leave')

    setRequestForm({
      type: reqType,
      leaveType: req.leaveType || 'Casual',
      fromDate: req.fromDate || '',
      toDate: req.toDate || '',
      halfDay: Boolean(req.halfDay || req.requestedUnits === 0.5),
      date: req.permissionDate || req.date || '',
      fromTime: req.fromTime || '',
      toTime: req.toTime || '',
      requestDate: req.date || req.requestDate || new Date().toISOString().split('T')[0],
      amount: req.amount != null ? String(req.amount) : '',
      expenseCategory: req.category || 'Food & Refreshment',
      reason: req.reason || '',
      attachment: null,
      resubmitOriginalId: req.id,
      resubmitSource: req.source || (isAdvOrExp ? 'advances_expenses' : 'requests'),
    })
    setValidationErrors({})
    setSubmitSuccess('')
    setShowRequestModal(true)
  }

  // Submit Request Handler (Leave, Permission, Advance, Expense)
  const handleRequestSubmit = async () => {
    setValidationErrors({})
    setSubmitSuccess('')

    let validationResult
    if (requestForm.type === 'Leave') {
      validationResult = leaveSchema.safeParse({
        leaveType: selectedLeaveType,
        fromDate: requestForm.fromDate,
        toDate: requestForm.toDate,
        halfDay: requestForm.halfDay,
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
    } else if (requestForm.type === 'Expense') {
      validationResult = expenseSchema.safeParse({
        expenseCategory: requestForm.expenseCategory,
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
      const approvalModule = getModuleNameForRequestType(requestForm.type)
      const basePortalApprovalFields = buildPortalApprovalFields(approvalModule, approvalSetting)
      const isNoApproval = !requiresStandardApproval([{ ...approvalSetting, moduleName: approvalModule }], approvalModule)
      const portalApprovalFields = isNoApproval ? {
        ...basePortalApprovalFields,
        portalApproval: false,
        portalApprovalType: 'none',
        portalApprovalStages: [],
        portalApprovalLastAction: 'Approved',
        portalApprovalLastActionBy: user.uid,
        approvalType: 'none',
        totalStages: 0,
      } : basePortalApprovalFields
      const approvalType = portalApprovalFields.portalApprovalType
      const totalStages = portalApprovalFields.totalStages

      // If resubmitting an old rejected request, remove old record first
      if (requestForm.resubmitOriginalId) {
        try {
          const colName = requestForm.resubmitSource === 'advances_expenses' ? 'advances_expenses' : 'requests'
          await deleteDoc(doc(db, 'organisations', user.orgId, colName, requestForm.resubmitOriginalId))
        } catch (delErr) {
          console.warn('Could not remove previous rejected request:', delErr)
        }
      }

      if (requestForm.type === 'Leave') {
        await applyLeave({
          employeeId,
          employeeName: employee?.name || user?.name,
          department: employee?.department || '',
          leaveType: selectedLeaveType,
          fromDate: requestForm.fromDate,
          toDate: requestForm.toDate,
          requestedUnits: requestForm.halfDay ? 0.5 : undefined,
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
          approvedAt: isNoApproval ? serverTimestamp() : null,
          ...portalApprovalFields
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
          ...portalApprovalFields
        })
      } else if (requestForm.type === 'Advance') {
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
          paymentStatus: 'Pending',
          payoutMethod: 'Immediate',
          createdAt: serverTimestamp(),
          createdBy: user.uid,
          ...portalApprovalFields
        })
      } else if (requestForm.type === 'Expense') {
        await addDoc(collection(db, 'organisations', user.orgId, 'advances_expenses'), {
          employeeId,
          employeeName: employee?.name || user?.name,
          type: 'Expense',
          category: requestForm.expenseCategory || 'Miscellaneous',
          amount: Number(requestForm.amount),
          date: requestForm.requestDate,
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
          requestType: 'Expense',
          paymentStatus: 'Pending',
          createdAt: serverTimestamp(),
          createdBy: user.uid,
          ...portalApprovalFields
        })
      }

      // Reset form and show success
      setRequestForm({
        type: 'Leave',
        leaveType: selectedLeaveType || 'Casual',
        fromDate: '',
        toDate: '',
        halfDay: false,
        date: '',
        fromTime: '',
        toTime: '',
        requestDate: new Date().toISOString().split('T')[0],
        amount: '',
        expenseCategory: 'Food & Refreshment',
        reason: '',
        attachment: null,
        resubmitOriginalId: null,
        resubmitSource: null,
      })
      await fetchRequests()
      refreshLeaveBalances()
      setSubmitSuccess(requestForm.resubmitOriginalId ? 'Request resubmitted successfully for approval!' : 'Request submitted successfully!')
    } catch (err) {
      setValidationErrors({ submit: err.message })
    } finally {
      setLoading(false)
      setFileUploading(false)
    }
  }

  // Profile Edit Handlers
  const handleOpenProfileEdit = () => {
    setProfileForm({
      mobile: employee?.mobile || employee?.mobileNo || employee?.contactNo || '',
      whatsapp: employee?.whatsapp || employee?.whatsappNo || '',
      emergencyContact: employee?.emergencyContact || '',
      emergencyPhone: employee?.emergencyPhone || employee?.emergencyNo || '',
      address: employee?.address || '',
      personalBank: {
        bankName: employee?.personalBank?.bankName || employee?.bankName || '',
        holderName: employee?.personalBank?.holderName || employee?.name || user?.name || '',
        accountNo: employee?.personalBank?.accountNo || employee?.accountNumber || employee?.accountNo || '',
        ifsc: employee?.personalBank?.ifsc || employee?.ifsc || '',
      },
      upiId: employee?.upiId || '',
    })
    setProfileSuccessMsg('')
    setShowProfileEditModal(true)
  }

  const handleSaveProfile = async (e) => {
    if (e) e.preventDefault()
    if (!employeeId || !user?.orgId) return
    setSavingProfile(true)
    setProfileSuccessMsg('')

    try {
      const payload = {
        mobile: profileForm.mobile.trim(),
        mobileNo: profileForm.mobile.trim(),
        contactNo: profileForm.mobile.trim(),
        whatsapp: profileForm.whatsapp.trim(),
        emergencyContact: profileForm.emergencyContact.trim(),
        emergencyPhone: profileForm.emergencyPhone.trim(),
        address: profileForm.address.trim(),
        personalBank: {
          bankName: profileForm.personalBank.bankName.trim(),
          holderName: profileForm.personalBank.holderName.trim(),
          accountNo: profileForm.personalBank.accountNo.trim(),
          ifsc: profileForm.personalBank.ifsc.trim().toUpperCase(),
        },
        bankName: profileForm.personalBank.bankName.trim(),
        accountNo: profileForm.personalBank.accountNo.trim(),
        ifsc: profileForm.personalBank.ifsc.trim().toUpperCase(),
        upiId: profileForm.upiId.trim(),
      }

      if (updateEmployee && employee?.id) {
        await updateEmployee(employee.id, payload)
      } else {
        await updateDoc(doc(db, 'organisations', user.orgId, 'employees', employeeId), {
          ...payload,
          updatedAt: serverTimestamp(),
        })
      }

      setProfileSuccessMsg('Profile updated successfully!')
      setTimeout(() => {
        setShowProfileEditModal(false)
        setProfileSuccessMsg('')
      }, 1000)
    } catch (err) {
      alert('Failed to update profile: ' + (err.message || 'Unknown error'))
    } finally {
      setSavingProfile(false)
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
    if (!record) return 'text-slate-500'
    if (record.isAbsent) return 'text-rose-500'
    if (record.isOnLeave) return 'text-blue-500'
    if (record.outTime) return 'text-emerald-500'
    if (record.inTime) return 'text-indigo-500'
    return 'text-slate-500'
  }

  // Helper to group requests by month
  const groupRequestsByMonth = (reqList) => {
    const grouped = {}
    reqList.forEach(req => {
      const date = req.createdAt?.toDate ? req.createdAt.toDate() : new Date()
      const monthKey = date.toLocaleDateString('en-US', { year: 'numeric', month: 'long' })
      if (!grouped[monthKey]) {
        grouped[monthKey] = []
      }
      grouped[monthKey].push(req)
    })
    return grouped
  }

  // Detailed approval status helper
  const getDetailedStatus = (req) => {
    if (req.status === 'Rejected' || req.hrApproval === 'Rejected' || req.deptHeadApproval === 'Rejected' || req.mdApproval === 'Rejected') {
      return { label: 'Rejected', color: 'bg-rose-100 text-rose-700 border-rose-200', stage: 'rejected' }
    }
    if (req.status === 'Approved') {
      return { label: 'Approved', color: 'bg-emerald-100 text-emerald-700 border-emerald-200', stage: 'approved' }
    }
    
    const hrStatus = req.hrApproval || 'Pending'
    const mdStatus = req.mdApproval || 'Pending'
    const deptHeadStatus = req.deptHeadApproval || 'Pending'
    
    if (req.approvalType === 'multi') {
      if (deptHeadStatus === 'Pending') {
        return { label: 'Dept Head Review', color: 'bg-amber-100 text-amber-700 border-amber-200', stage: 'dept-head' }
      }
      if (deptHeadStatus === 'Approved' && mdStatus === 'Pending') {
        return { label: 'MD Review', color: 'bg-blue-100 text-blue-700 border-blue-200', stage: 'md' }
      }
    } else {
      if (hrStatus === 'Pending') {
        return { label: 'HR Review', color: 'bg-amber-100 text-amber-700 border-amber-200', stage: 'hr' }
      }
      if (hrStatus === 'Approved' && mdStatus === 'Pending') {
        return { label: 'MD Review', color: 'bg-blue-100 text-blue-700 border-blue-200', stage: 'md' }
      }
    }
    
    return { label: 'Pending', color: 'bg-amber-100 text-amber-700 border-amber-200', stage: 'pending' }
  }

  const toggleMonth = (monthKey) => {
    setExpandedMonths(prev => ({
      ...prev,
      [monthKey]: !prev[monthKey]
    }))
  }

  // Greeting based on time of day
  const getGreeting = () => {
    const hr = new Date().getHours()
    if (hr < 12) return 'Good Morning'
    if (hr < 17) return 'Good Afternoon'
    return 'Good Evening'
  }

  // Filtered requests based on active status tab
  const filteredRequests = useMemo(() => {
    if (requestFilter === 'All') return requests
    if (requestFilter === 'Pending') {
      return requests.filter(r => r.status === 'Pending' || (!r.status && (r.hrApproval === 'Pending' || r.deptHeadApproval === 'Pending')))
    }
    if (requestFilter === 'Approved') {
      return requests.filter(r => r.status === 'Approved')
    }
    if (requestFilter === 'Rejected') {
      return requests.filter(r => r.status === 'Rejected' || r.hrApproval === 'Rejected' || r.deptHeadApproval === 'Rejected' || r.mdApproval === 'Rejected')
    }
    return requests
  }, [requests, requestFilter])

  const pendingRequestsCount = useMemo(() => 
    requests.filter(r => r.status === 'Pending' || (!r.status && (r.hrApproval === 'Pending' || r.deptHeadApproval === 'Pending'))).length
  , [requests])

  const approvedRequestsCount = useMemo(() => 
    requests.filter(r => r.status === 'Approved').length
  , [requests])

  const rejectedRequestsCount = useMemo(() => 
    requests.filter(r => r.status === 'Rejected' || r.hrApproval === 'Rejected' || r.deptHeadApproval === 'Rejected' || r.mdApproval === 'Rejected').length
  , [requests])

  // Attendance metrics for selected month
  const attendanceMetrics = useMemo(() => {
    let presentCount = 0
    let absentCount = 0
    let leaveCount = 0
    let totalOtMinutes = 0

    attendanceRows.forEach(({ date, record }) => {
      if (!record) return
      if (record.isAbsent) absentCount++
      else if (record.isOnLeave) leaveCount++
      else if (record.inTime) {
        presentCount++
        if (record.outTime) {
          const otStr = calcOT(record.inTime, record.outTime, record.date, record.outDate || record.date, record.minDailyHours || 8)
          if (otStr && otStr !== '0 hrs' && otStr !== '0h 0m' && otStr !== '—') {
            const m = otStr.match(/(\d+)\s*h(?:rs?)?(?:\s*(\d+)\s*m)?/)
            if (m) {
              const h = parseInt(m[1], 10) || 0
              const min = parseInt(m[2], 10) || 0
              totalOtMinutes += (h * 60 + min)
            }
          }
        }
      }
    })

    const otHours = Math.floor(totalOtMinutes / 60)
    const otMins = totalOtMinutes % 60
    const otDisplay = otHours > 0 ? `${otHours}h ${otMins > 0 ? `${otMins}m` : ''}` : (otMins > 0 ? `${otMins}m` : '0h')

    return { presentCount, absentCount, leaveCount, otDisplay }
  }, [attendanceRows])

  // ──────────────────────────────────────────
  // VIEW 1: Top Navigation Segmented Pills
  // ──────────────────────────────────────────
  const renderTopNav = () => (
    <div className="sticky top-0 z-30 bg-white/95 backdrop-blur-md border-b border-slate-200 px-3 py-2 shadow-xs">
      <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar py-0.5">
        {[
          { id: 'dashboard', label: 'Overview', icon: LayoutDashboard },
          { id: 'attendance', label: 'Attendance', icon: Calendar },
          { id: 'requests', label: 'Requests', icon: FileText, badge: pendingRequestsCount > 0 ? pendingRequestsCount : null },
          { id: 'salary', label: 'Salary', icon: Wallet },
          { id: 'profile', label: 'My Profile', icon: User },
        ].map(tab => {
          const Icon = tab.icon
          const isActive = activeTab === tab.id
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`min-h-9 px-3.5 py-1.5 rounded-full text-xs font-heading font-bold flex items-center gap-1.5 whitespace-nowrap active:scale-[0.96] transition-[background-color,color,box-shadow,transform] duration-150 ease-out cursor-pointer ${
                isActive
                  ? 'bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-sm shadow-blue-500/20'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200 hover:text-slate-800'
              }`}
            >
              <Icon size={14} strokeWidth={isActive ? 2.5 : 2} />
              <span>{tab.label}</span>
              {tab.badge && (
                <span className={`px-1.5 py-0.2 rounded-full text-[10px] font-extrabold ${
                  isActive ? 'bg-white text-indigo-700' : 'bg-amber-500 text-white'
                }`}>
                  {tab.badge}
                </span>
              )}
            </button>
          )
        })}
      </div>
    </div>
  )

  // ──────────────────────────────────────────
  // VIEW 2: Dashboard / Overview
  // ──────────────────────────────────────────
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
        {/* Warm Welcome Banner */}
        <div className="bg-gradient-to-br from-blue-600 via-indigo-600 to-purple-700 rounded-2xl p-5 text-white shadow-md">
          <div className="flex items-center justify-between mb-4">
            <div>
              <p className="text-blue-100 text-xs font-medium font-body flex items-center gap-1.5">
                <span>{getGreeting()},</span>
                {employee?.site && (
                  <span className="bg-white/20 px-2 py-0.5 rounded-full text-[10px] font-semibold text-white">
                    📍 {employee.site}
                  </span>
                )}
              </p>
              <h2 className="text-xl font-bold font-heading mt-0.5">
                {employee?.name || user?.name || 'Employee'}
              </h2>
              <p className="text-xs text-blue-200 font-body">
                {employee?.designation || 'Staff Member'} {employee?.department ? `• ${employee.department}` : ''}
              </p>
            </div>
            <div className="w-12 h-12 rounded-full bg-white/20 backdrop-blur-md flex items-center justify-center text-xl font-bold font-heading border border-white/30 shrink-0">
              {employee?.name?.[0] || user?.name?.[0] || 'U'}
            </div>
          </div>
          
          {/* Quick Punch Action */}
          <div className="flex gap-2">
            {!(validInLog || todayRecord?.inTime) ? (
              <button
                onClick={handleCheckIn}
                className="flex-1 min-h-11 bg-white text-indigo-700 py-2.5 rounded-xl font-bold font-heading text-sm flex items-center justify-center gap-2 shadow-md active:scale-[0.96] transition-transform duration-150 ease-out cursor-pointer"
              >
                <Play size={16} fill="currentColor" /> Check In Now
              </button>
            ) : !(validOutLog || todayRecord?.outTime) ? (
              <button
                onClick={handleCheckOut}
                className="flex-1 min-h-11 bg-white text-rose-600 py-2.5 rounded-xl font-bold font-heading text-sm flex items-center justify-center gap-2 shadow-md active:scale-[0.96] transition-transform duration-150 ease-out cursor-pointer"
              >
                <Square size={14} fill="currentColor" /> Check Out Now
              </button>
            ) : (
              <div className="flex-1 min-h-11 bg-white/20 backdrop-blur-md py-2.5 rounded-xl font-semibold font-heading text-sm flex items-center justify-center gap-2 border border-white/20">
                <CheckCircle2 size={16} /> Day Shift Complete
              </div>
            )}
          </div>

          {geoContext.distanceMeters != null && (
            <p className="text-blue-100 text-xs mt-3 font-body flex items-center gap-1">
              <MapPin size={12} />
              <span>You are <strong>{geoContext.distanceMeters}m</strong> from {geoContext.targetSite?.siteName || employee?.site || 'assigned site'}.</span>
            </p>
          )}
          {geoContext.locationError && (
            <p className="text-rose-200 text-xs mt-2 font-body flex items-center gap-1">
              <AlertCircle size={12} />
              <span>{geoContext.locationError}</span>
            </p>
          )}
        </div>

        {/* 4 Quick Action Cards (Leave, Permission, Advance, Expense) */}
        <div>
          <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2 font-body px-1">Quick Actions</p>
          <div className="grid grid-cols-2 gap-2.5">
            <button
              onClick={() => {
                setRequestForm({
                  type: 'Leave',
                  leaveType: selectedLeaveType || 'Casual',
                  fromDate: '',
                  toDate: '',
                  halfDay: false,
                  date: '',
                  fromTime: '',
                  toTime: '',
                  requestDate: new Date().toISOString().split('T')[0],
                  amount: '',
                  expenseCategory: 'Food & Refreshment',
                  reason: '',
                  attachment: null,
                  resubmitOriginalId: null,
                  resubmitSource: null,
                })
                setValidationErrors({})
                setSubmitSuccess('')
                setShowRequestModal(true)
              }}
              className="bg-white p-3.5 rounded-2xl border border-slate-200 shadow-xs flex items-center gap-3 text-left active:scale-[0.97] transition-transform cursor-pointer"
            >
              <div className="w-10 h-10 rounded-xl bg-amber-50 flex items-center justify-center text-amber-600 shrink-0">
                <Palmtree size={20} />
              </div>
              <div className="min-w-0">
                <p className="font-heading font-bold text-slate-900 text-xs">Apply Leave</p>
                <p className="font-body text-[11px] text-slate-500 truncate">Time off request</p>
              </div>
            </button>

            <button
              onClick={() => {
                setRequestForm({
                  type: 'Permission',
                  leaveType: selectedLeaveType || 'Casual',
                  fromDate: '',
                  toDate: '',
                  halfDay: false,
                  date: new Date().toISOString().split('T')[0],
                  fromTime: '',
                  toTime: '',
                  requestDate: new Date().toISOString().split('T')[0],
                  amount: '',
                  expenseCategory: 'Food & Refreshment',
                  reason: '',
                  attachment: null,
                  resubmitOriginalId: null,
                  resubmitSource: null,
                })
                setValidationErrors({})
                setSubmitSuccess('')
                setShowRequestModal(true)
              }}
              className="bg-white p-3.5 rounded-2xl border border-slate-200 shadow-xs flex items-center gap-3 text-left active:scale-[0.97] transition-transform cursor-pointer"
            >
              <div className="w-10 h-10 rounded-xl bg-purple-50 flex items-center justify-center text-purple-600 shrink-0">
                <Timer size={20} />
              </div>
              <div className="min-w-0">
                <p className="font-heading font-bold text-slate-900 text-xs">Permission</p>
                <p className="font-body text-[11px] text-slate-500 truncate">Short leave / hours</p>
              </div>
            </button>

            <button
              onClick={() => {
                setRequestForm({
                  type: 'Advance',
                  leaveType: selectedLeaveType || 'Casual',
                  fromDate: '',
                  toDate: '',
                  halfDay: false,
                  date: '',
                  fromTime: '',
                  toTime: '',
                  requestDate: new Date().toISOString().split('T')[0],
                  amount: '',
                  expenseCategory: 'Food & Refreshment',
                  reason: '',
                  attachment: null,
                  resubmitOriginalId: null,
                  resubmitSource: null,
                })
                setValidationErrors({})
                setSubmitSuccess('')
                setShowRequestModal(true)
              }}
              className="bg-white p-3.5 rounded-2xl border border-slate-200 shadow-xs flex items-center gap-3 text-left active:scale-[0.97] transition-transform cursor-pointer"
            >
              <div className="w-10 h-10 rounded-xl bg-emerald-50 flex items-center justify-center text-emerald-600 shrink-0">
                <DollarSign size={20} />
              </div>
              <div className="min-w-0">
                <p className="font-heading font-bold text-slate-900 text-xs">Salary Advance</p>
                <p className="font-body text-[11px] text-slate-500 truncate">Request funds</p>
              </div>
            </button>

            <button
              onClick={() => {
                setRequestForm({
                  type: 'Expense',
                  leaveType: selectedLeaveType || 'Casual',
                  fromDate: '',
                  toDate: '',
                  halfDay: false,
                  date: '',
                  fromTime: '',
                  toTime: '',
                  requestDate: new Date().toISOString().split('T')[0],
                  amount: '',
                  expenseCategory: 'Food & Refreshment',
                  reason: '',
                  attachment: null,
                  resubmitOriginalId: null,
                  resubmitSource: null,
                })
                setValidationErrors({})
                setSubmitSuccess('')
                setShowRequestModal(true)
              }}
              className="bg-white p-3.5 rounded-2xl border border-slate-200 shadow-xs flex items-center gap-3 text-left active:scale-[0.97] transition-transform cursor-pointer"
            >
              <div className="w-10 h-10 rounded-xl bg-blue-50 flex items-center justify-center text-blue-600 shrink-0">
                <Receipt size={20} />
              </div>
              <div className="min-w-0">
                <p className="font-heading font-bold text-slate-900 text-xs">Submit Expense</p>
                <p className="font-body text-[11px] text-slate-500 truncate">Bill reimbursement</p>
              </div>
            </button>
          </div>
        </div>

        {/* Today's Punch Status Card */}
        <div className="bg-white rounded-2xl p-4 shadow-xs border border-slate-200">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-heading font-bold text-slate-900 text-sm">Today's Attendance</h3>
            <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${
              latestTodayLog ? 'bg-indigo-50 text-indigo-700' : 'bg-slate-100 text-slate-700'
            }`}>
              {latestTodayLog ? (validOutLog ? 'Check-out Submitted' : 'Check-in Submitted') : getStatusLabel(todayRecord)}
            </span>
          </div>
          
          {(todayRecord || latestTodayLog) ? (
            <div className="grid grid-cols-3 gap-3 text-center">
              <div className="bg-slate-50 p-2.5 rounded-xl">
                <p className="text-[11px] font-medium text-slate-500 mb-0.5 font-body">Check In</p>
                {todayBadge && (
                  <span className={`inline-flex mb-1 px-1.5 py-0.2 rounded-full text-[9px] font-bold uppercase tracking-wide ${todayBadge.className}`}>
                    {todayBadge.label}
                  </span>
                )}
                <p className="font-heading font-bold text-slate-900 text-sm">
                  {dashboardRecord.inTime ? formatTimeTo12Hour(dashboardRecord.inTime) : '—'}
                </p>
              </div>
              <div className="bg-slate-50 p-2.5 rounded-xl">
                <p className="text-[11px] font-medium text-slate-500 mb-0.5 font-body">Check Out</p>
                <p className="font-heading font-bold text-slate-900 text-sm">
                  {dashboardRecord.outTime ? formatTimeTo12Hour(dashboardRecord.outTime) : '—'}
                </p>
              </div>
              <div className="bg-slate-50 p-2.5 rounded-xl">
                <p className="text-[11px] font-medium text-slate-500 mb-0.5 font-body">Duration</p>
                <p className="font-heading font-bold text-slate-900 text-sm">
                  {dashboardRecord.inTime && dashboardRecord.outTime 
                    ? calcOT(dashboardRecord.inTime, dashboardRecord.outTime, dashboardRecord.date, dashboardRecord.outDate || dashboardRecord.date, dashboardRecord.minDailyHours || 8)
                    : '—'}
                </p>
              </div>
            </div>
          ) : (
            <div className="text-center py-4 bg-slate-50 rounded-xl">
              <p className="text-xs text-slate-500 font-body">No attendance record for today yet.</p>
              <button
                onClick={handleCheckIn}
                className="mt-2 text-xs font-bold text-indigo-600 hover:text-indigo-800"
              >
                + Check In Now
              </button>
            </div>
          )}
        </div>

        {/* Leave Balances Summary */}
        <div className="bg-white rounded-2xl p-4 shadow-xs border border-slate-200">
          <div className="flex items-center justify-between mb-2">
            <h3 className="font-heading font-bold text-slate-900 text-sm flex items-center gap-1.5">
              <Calendar size={16} className="text-blue-600" />
              <span>Leave Balance</span>
            </h3>
            <button
              onClick={() => {
                setRequestForm(prev => ({ ...prev, type: 'Leave', resubmitOriginalId: null }))
                setShowRequestModal(true)
              }}
              className="text-xs font-bold text-blue-600 hover:text-blue-800"
            >
              + Apply
            </button>
          </div>
          
          <div className="grid grid-cols-2 gap-2 mt-2">
            {leaveBalances.filter(b => b.configured).slice(0, 4).map(b => (
              <div key={b.leaveTypeCode} className="bg-slate-50 p-2.5 rounded-xl border border-slate-100">
                <p className="text-[11px] font-medium text-slate-500 font-body truncate">{b.leaveType}</p>
                <p className="font-heading font-bold text-slate-900 text-sm mt-0.5">
                  {b.available.toFixed(1)} <span className="text-[10px] font-normal text-slate-400">days</span>
                </p>
              </div>
            ))}
            {!leaveBalances.some(b => b.configured) && (
              <p className="text-xs text-slate-400 col-span-2 py-1">Standard leave policy active.</p>
            )}
          </div>
        </div>

        {/* Recent Requests Snippet */}
        <div className="bg-white rounded-2xl p-4 shadow-xs border border-slate-200">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-heading font-bold text-slate-900 text-sm">Recent Requests</h3>
            <button 
              onClick={() => setActiveTab('requests')}
              className="text-xs text-indigo-600 font-bold hover:text-indigo-800"
            >
              View All ({requests.length})
            </button>
          </div>
          
          {requests.length === 0 ? (
            <p className="text-xs text-slate-400 text-center py-4 font-body">No requests submitted yet</p>
          ) : (
            <div className="space-y-2">
              {requests.slice(0, 3).map(req => {
                const statusInfo = getDetailedStatus(req)
                return (
                  <div key={req.id} className="flex items-center justify-between p-2.5 bg-slate-50 rounded-xl border border-slate-100">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 ${
                        req.type === 'Leave' ? 'bg-amber-100 text-amber-700' :
                        req.type === 'Permission' ? 'bg-purple-100 text-purple-700' :
                        req.type === 'Expense' ? 'bg-blue-100 text-blue-700' :
                        'bg-emerald-100 text-emerald-700'
                      }`}>
                        {req.type === 'Leave' ? <Palmtree size={14} /> :
                         req.type === 'Permission' ? <Timer size={14} /> :
                         req.type === 'Expense' ? <Receipt size={14} /> :
                         <DollarSign size={14} />}
                      </div>
                      <div className="min-w-0">
                        <p className="text-xs font-bold text-slate-900 truncate font-heading">{req.type || 'Leave'}</p>
                        <p className="text-[11px] text-slate-500 truncate font-body">
                          {req.amount ? `₹${req.amount} • ` : ''}
                          {req.fromDate ? `${req.fromDate}` : (req.date || 'Recent')}
                        </p>
                      </div>
                    </div>

                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full shrink-0 border ${statusInfo.color}`}>
                      {statusInfo.label}
                    </span>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>
    )
  }

  // ──────────────────────────────────────────
  // VIEW 3: Attendance Screen
  // ──────────────────────────────────────────
  const renderAttendance = () => {
    const selectedDayRecord = attendanceRows.find(r => r.date === selectedAttendanceDate)?.record || 
      (selectedAttendanceDate === todayDateKey ? todayRecord : null)

    return (
      <div className="space-y-4">
        {/* Month Selector */}
        <div className="flex items-center justify-between bg-white rounded-2xl p-3 shadow-xs border border-slate-200">
          <button
            onClick={() => {
              const [y, m] = month.split('-').map(Number)
              const d = new Date(y, m - 2, 1)
              const nextMonth = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
              setMonth(nextMonth)
              setSelectedAttendanceDate(`${nextMonth}-01`)
            }}
            className="w-10 h-10 flex items-center justify-center hover:bg-slate-100 rounded-xl active:scale-[0.96] transition-transform cursor-pointer"
            aria-label="Previous Month"
          >
            <ChevronLeft size={18} className="text-slate-600" />
          </button>
          <div className="text-center">
            <span className="font-heading font-bold text-slate-900 text-sm block">
              {format(new Date(month + '-01'), 'MMMM yyyy')}
            </span>
            <span className="text-[11px] text-slate-400 font-body">Monthly Punch Record</span>
          </div>
          <button
            onClick={() => {
              const [y, m] = month.split('-').map(Number)
              const d = new Date(y, m, 1)
              const nextMonth = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
              setMonth(nextMonth)
              setSelectedAttendanceDate(`${nextMonth}-01`)
            }}
            className="w-10 h-10 flex items-center justify-center hover:bg-slate-100 rounded-xl active:scale-[0.96] transition-transform cursor-pointer"
            aria-label="Next Month"
          >
            <ChevronRight size={18} className="text-slate-600" />
          </button>
        </div>

        {/* Monthly Summary Metric Pills */}
        <div className="grid grid-cols-4 gap-2">
          <div className="bg-emerald-50 border border-emerald-200/60 rounded-xl p-2.5 text-center">
            <p className="text-[10px] font-bold text-emerald-700 uppercase font-body">Present</p>
            <p className="text-base font-bold font-heading text-emerald-900 mt-0.5">{attendanceMetrics.presentCount}</p>
          </div>
          <div className="bg-rose-50 border border-rose-200/60 rounded-xl p-2.5 text-center">
            <p className="text-[10px] font-bold text-rose-700 uppercase font-body">Absent</p>
            <p className="text-base font-bold font-heading text-rose-900 mt-0.5">{attendanceMetrics.absentCount}</p>
          </div>
          <div className="bg-blue-50 border border-blue-200/60 rounded-xl p-2.5 text-center">
            <p className="text-[10px] font-bold text-blue-700 uppercase font-body">Leaves</p>
            <p className="text-base font-bold font-heading text-blue-900 mt-0.5">{attendanceMetrics.leaveCount}</p>
          </div>
          <div className="bg-amber-50 border border-amber-200/60 rounded-xl p-2.5 text-center">
            <p className="text-[10px] font-bold text-amber-700 uppercase font-body">OT</p>
            <p className="text-base font-bold font-heading text-amber-900 mt-0.5">{attendanceMetrics.otDisplay}</p>
          </div>
        </div>

        {/* Calendar Grid */}
        <div className="bg-white rounded-2xl p-4 shadow-xs border border-slate-200">
          <div className="grid grid-cols-7 gap-1 mb-2 text-center text-xs font-bold text-slate-400 font-body">
            {['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'].map(day => (
              <div key={day} className="py-1">{day}</div>
            ))}
          </div>
          
          <div className="grid grid-cols-7 gap-1">
            {attendanceRows.map(({ date, record }) => {
              const dayNum = parseInt(date.split('-')[2], 10)
              const isToday = date === todayDateKey
              const isSelected = date === selectedAttendanceDate
              
              let statusBg = 'bg-slate-50 text-slate-700'
              if (record) {
                if (record.isAbsent) statusBg = 'bg-rose-100 text-rose-700 font-bold'
                else if (record.isOnLeave) statusBg = 'bg-blue-100 text-blue-700 font-bold'
                else if (record.holidayWorked) statusBg = 'bg-purple-100 text-purple-700 font-bold'
                else if (record.sundayWorked) statusBg = 'bg-amber-100 text-amber-700 font-bold'
                else if (record.outTime) statusBg = 'bg-emerald-100 text-emerald-800 font-bold'
                else if (record.inTime) statusBg = 'bg-indigo-100 text-indigo-800 font-bold'
              }
              
              return (
                <button
                  key={date}
                  type="button"
                  onClick={() => setSelectedAttendanceDate(date)}
                  className={`aspect-square min-h-[44px] rounded-xl flex flex-col items-center justify-center p-1 transition-all active:scale-[0.94] cursor-pointer ${statusBg} ${
                    isSelected ? 'ring-2 ring-blue-600 shadow-sm scale-[1.03]' : ''
                  } ${isToday && !isSelected ? 'ring-2 ring-slate-400' : ''}`}
                >
                  <span className="text-xs leading-none">{dayNum}</span>
                  {record?.inTime && (
                    <span className="text-[8px] font-mono mt-1 opacity-80 leading-none truncate max-w-full">
                      {record.inTime.slice(0, 5)}
                    </span>
                  )}
                </button>
              )
            })}
          </div>
        </div>

        {/* Selected Day Punch Details Card */}
        <div className="bg-white rounded-2xl p-4 shadow-xs border border-slate-200">
          <div className="flex items-center justify-between pb-3 border-b border-slate-100">
            <div>
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider font-body">Selected Day Breakdown</p>
              <h4 className="font-heading font-bold text-slate-900 text-sm">
                {selectedAttendanceDate ? format(new Date(selectedAttendanceDate + 'T00:00:00'), 'EEEE, MMMM d, yyyy') : 'No date'}
              </h4>
            </div>
            <span className={`px-2.5 py-1 rounded-full text-xs font-bold font-body ${
              selectedDayRecord?.isAbsent ? 'bg-rose-100 text-rose-700' :
              selectedDayRecord?.isOnLeave ? 'bg-blue-100 text-blue-700' :
              selectedDayRecord?.outTime ? 'bg-emerald-100 text-emerald-700' :
              selectedDayRecord?.inTime ? 'bg-indigo-100 text-indigo-700' :
              'bg-slate-100 text-slate-500'
            }`}>
              {getStatusLabel(selectedDayRecord)}
            </span>
          </div>

          {selectedDayRecord ? (
            <div className="grid grid-cols-3 gap-2.5 pt-3 text-center">
              <div className="bg-slate-50 p-2.5 rounded-xl">
                <p className="text-[11px] font-medium text-slate-500 mb-0.5 font-body">In Time</p>
                <p className="font-heading font-bold text-slate-900 text-sm">
                  {selectedDayRecord.inTime ? formatTimeTo12Hour(selectedDayRecord.inTime) : '—'}
                </p>
              </div>
              <div className="bg-slate-50 p-2.5 rounded-xl">
                <p className="text-[11px] font-medium text-slate-500 mb-0.5 font-body">Out Time</p>
                <p className="font-heading font-bold text-slate-900 text-sm">
                  {selectedDayRecord.outTime ? formatTimeTo12Hour(selectedDayRecord.outTime) : '—'}
                </p>
              </div>
              <div className="bg-slate-50 p-2.5 rounded-xl">
                <p className="text-[11px] font-medium text-slate-500 mb-0.5 font-body">OT / Duration</p>
                <p className="font-heading font-bold text-slate-900 text-sm">
                  {selectedDayRecord.inTime && selectedDayRecord.outTime
                    ? calcOT(selectedDayRecord.inTime, selectedDayRecord.outTime, selectedDayRecord.date, selectedDayRecord.outDate || selectedDayRecord.date, selectedDayRecord.minDailyHours || 8)
                    : '—'}
                </p>
              </div>
            </div>
          ) : (
            <div className="py-4 text-center">
              <p className="text-xs text-slate-400 font-body">No punch activity recorded on this day.</p>
            </div>
          )}
        </div>

        {/* Legend */}
        <div className="flex flex-wrap gap-2.5 px-1">
          {[
            { color: 'bg-emerald-100 border border-emerald-300', label: 'Present / Complete' },
            { color: 'bg-indigo-100 border border-indigo-300', label: 'Checked In' },
            { color: 'bg-blue-100 border border-blue-300', label: 'On Leave' },
            { color: 'bg-rose-100 border border-rose-300', label: 'Absent' },
            { color: 'bg-slate-100 border border-slate-300', label: 'No Record' }
          ].map(item => (
            <div key={item.label} className="flex items-center gap-1.5">
              <div className={`w-3 h-3 rounded-md ${item.color}`} />
              <span className="text-[11px] text-slate-600 font-body">{item.label}</span>
            </div>
          ))}
        </div>
      </div>
    )
  }

  // ──────────────────────────────────────────
  // VIEW 4: Requests & Approvals
  // ──────────────────────────────────────────
  const renderRequests = () => {
    const grouped = groupRequestsByMonth(filteredRequests)
    const monthKeys = Object.keys(grouped).sort((a, b) => new Date(b) - new Date(a))

    return (
      <div className="space-y-4">
        {/* Header & Create Request Button */}
        <div className="flex items-center justify-between px-1">
          <div>
            <h2 className="font-heading font-bold text-slate-900 text-lg">Requests & Approvals</h2>
            <p className="text-xs text-slate-500 font-body">Track status & resubmit if rejected</p>
          </div>
          <button 
            onClick={() => {
              setRequestForm({
                type: 'Leave',
                leaveType: selectedLeaveType || 'Casual',
                fromDate: '',
                toDate: '',
                halfDay: false,
                date: '',
                fromTime: '',
                toTime: '',
                requestDate: new Date().toISOString().split('T')[0],
                amount: '',
                expenseCategory: 'Food & Refreshment',
                reason: '',
                attachment: null,
                resubmitOriginalId: null,
                resubmitSource: null,
              })
              setValidationErrors({})
              setSubmitSuccess('')
              setShowRequestModal(true)
            }}
            className="min-h-9 px-3.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold font-heading flex items-center gap-1.5 shadow-sm active:scale-[0.96] transition-transform cursor-pointer"
          >
            <Plus size={16} />
            <span>New Request</span>
          </button>
        </div>

        {/* Filter Pills */}
        <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar py-0.5">
          {[
            { id: 'All', label: `All (${requests.length})` },
            { id: 'Pending', label: `Pending (${pendingRequestsCount})` },
            { id: 'Approved', label: `Approved (${approvedRequestsCount})` },
            { id: 'Rejected', label: `Rejected (${rejectedRequestsCount})` },
          ].map(f => (
            <button
              key={f.id}
              onClick={() => setRequestFilter(f.id)}
              className={`min-h-8 px-3 py-1 rounded-full text-xs font-heading font-bold active:scale-[0.96] transition-[background-color,color] cursor-pointer whitespace-nowrap ${
                requestFilter === f.id
                  ? 'bg-slate-900 text-white'
                  : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>

        {filteredRequests.length === 0 ? (
          <div className="bg-white rounded-2xl p-8 text-center border border-slate-200 shadow-xs">
            <FileText size={40} className="text-slate-300 mx-auto mb-3" />
            <p className="font-heading font-bold text-slate-800 text-sm">No {requestFilter !== 'All' ? requestFilter.toLowerCase() : ''} requests found</p>
            <p className="text-xs text-slate-400 mt-1 font-body">Tap "New Request" to apply for leave, permission, salary advance or expense.</p>
            <button 
              onClick={() => setShowRequestModal(true)}
              className="mt-4 min-h-9 px-4 bg-blue-600 text-white text-xs font-bold font-heading rounded-xl shadow-xs active:scale-[0.96] transition-transform"
            >
              + Create Request
            </button>
          </div>
        ) : (
          <div className="space-y-4">
            {monthKeys.map(monthKey => {
              const monthRequests = grouped[monthKey]
              const isExpanded = expandedMonths[monthKey] !== false

              return (
                <div key={monthKey} className="bg-white rounded-2xl shadow-xs border border-slate-200 overflow-hidden">
                  <button
                    onClick={() => toggleMonth(monthKey)}
                    className="w-full flex items-center justify-between p-3.5 bg-slate-50/80 border-b border-slate-100 text-left active:scale-[0.99] transition-transform cursor-pointer"
                  >
                    <div className="flex items-center gap-2.5">
                      <div className={`transform transition-transform duration-200 ${isExpanded ? 'rotate-90' : ''}`}>
                        <ChevronRightIcon size={16} className="text-slate-400" />
                      </div>
                      <span className="font-heading font-bold text-slate-900 text-sm">{monthKey}</span>
                    </div>
                    <span className="text-xs font-semibold text-slate-500 font-body">
                      {monthRequests.length} request{monthRequests.length !== 1 ? 's' : ''}
                    </span>
                  </button>

                  {isExpanded && (
                    <div className="p-3.5 space-y-3">
                      {monthRequests.map(req => {
                        const statusInfo = getDetailedStatus(req)
                        const isRejected = statusInfo.stage === 'rejected' || req.status === 'Rejected'
                        const isPending = req.status === 'Pending' || (!req.status && (req.hrApproval === 'Pending' || req.deptHeadApproval === 'Pending'))

                        return (
                          <div key={req.id} className="bg-white rounded-xl p-3.5 border border-slate-200 shadow-xs space-y-3">
                            {/* Card Header: Type, Date, Badge */}
                            <div className="flex items-start justify-between gap-2">
                              <div className="flex items-center gap-2.5">
                                <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${
                                  req.type === 'Leave' ? 'bg-amber-100 text-amber-700' :
                                  req.type === 'Permission' ? 'bg-purple-100 text-purple-700' :
                                  req.type === 'Expense' ? 'bg-blue-100 text-blue-700' :
                                  'bg-emerald-100 text-emerald-700'
                                }`}>
                                  {req.type === 'Leave' ? <Palmtree size={16} /> :
                                   req.type === 'Permission' ? <Timer size={16} /> :
                                   req.type === 'Expense' ? <Receipt size={16} /> :
                                   <DollarSign size={16} />}
                                </div>
                                <div>
                                  <h4 className="font-heading font-bold text-slate-900 text-sm">{req.type || 'Leave'}</h4>
                                  <p className="text-[11px] text-slate-400 font-body">
                                    {req.createdAt?.toDate?.() ? format(req.createdAt.toDate(), 'dd MMM yyyy, hh:mm a') : 'Recently'}
                                  </p>
                                </div>
                              </div>
                              <span className={`text-[10px] font-bold px-2.5 py-1 rounded-full border shrink-0 font-body ${statusInfo.color}`}>
                                {statusInfo.label}
                              </span>
                            </div>

                            {/* Request Key Info */}
                            <div className="bg-slate-50 p-2.5 rounded-xl border border-slate-100 text-xs font-body space-y-1">
                              {req.type === 'Leave' && (
                                <p className="text-slate-700">
                                  <strong className="font-heading text-slate-900">{req.leaveType || 'Leave'}</strong>: {req.fromDate} → {req.toDate || req.fromDate}
                                  {req.halfDay && ' (Half Day)'}
                                </p>
                              )}
                              {req.type === 'Permission' && (
                                <p className="text-slate-700">
                                  <strong className="font-heading text-slate-900">Date</strong>: {req.permissionDate || req.date} ({req.fromTime} - {req.toTime})
                                </p>
                              )}
                              {(req.type === 'Advance' || req.type === 'Expense') && (
                                <div className="flex items-center justify-between">
                                  <span className="text-slate-700">
                                    <strong className="font-heading text-slate-900">{req.category || req.type}</strong>
                                    {req.date ? ` • ${req.date}` : ''}
                                  </span>
                                  <span className="font-heading font-bold text-slate-900 text-sm">
                                    ₹{Number(req.amount || 0).toLocaleString()}
                                  </span>
                                </div>
                              )}
                              {req.reason && (
                                <p className="text-slate-600 text-[11px] pt-1 border-t border-slate-200/60 line-clamp-2">
                                  "{req.reason}"
                                </p>
                              )}
                              {req.attachmentUrl && (
                                <a
                                  href={req.attachmentUrl}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="inline-flex items-center gap-1 text-[11px] text-blue-600 font-semibold hover:underline pt-0.5"
                                >
                                  <Eye size={12} /> View Attached Bill / Document
                                </a>
                              )}
                            </div>

                            {/* Multi-stage Approval Tracking Timeline */}
                            <div className="bg-slate-50/80 rounded-xl p-2.5 border border-slate-100">
                              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2 font-body">Approval Workflow</p>
                              <div className="flex items-center justify-between text-xs font-body">
                                {/* Stage 1: Dept Head */}
                                {req.approvalType === 'multi' && (
                                  <div className="flex items-center gap-1.5">
                                    <div className={`w-2 h-2 rounded-full ${
                                      req.deptHeadApproval === 'Approved' ? 'bg-emerald-500' :
                                      req.deptHeadApproval === 'Rejected' ? 'bg-rose-500' :
                                      'bg-amber-500'
                                    }`} />
                                    <span className="text-[11px] text-slate-700 font-medium">Dept Head</span>
                                  </div>
                                )}
                                
                                {/* Stage 2: HR */}
                                <div className="flex items-center gap-1.5">
                                  <div className={`w-2 h-2 rounded-full ${
                                    req.hrApproval === 'Approved' ? 'bg-emerald-500' :
                                    req.hrApproval === 'Rejected' ? 'bg-rose-500' :
                                    'bg-amber-500'
                                  }`} />
                                  <span className="text-[11px] text-slate-700 font-medium">HR</span>
                                </div>

                                {/* Stage 3: MD */}
                                <div className="flex items-center gap-1.5">
                                  <div className={`w-2 h-2 rounded-full ${
                                    req.mdApproval === 'Approved' ? 'bg-emerald-500' :
                                    req.mdApproval === 'Rejected' ? 'bg-rose-500' :
                                    req.hrApproval === 'Approved' ? 'bg-amber-500' : 'bg-slate-300'
                                  }`} />
                                  <span className="text-[11px] text-slate-700 font-medium">MD</span>
                                </div>

                                {/* Payment status for advances & expenses */}
                                {(req.type === 'Advance' || req.type === 'Expense') && (
                                  <div className="flex items-center gap-1.5">
                                    <div className={`w-2 h-2 rounded-full ${
                                      req.paymentStatus === 'Paid' ? 'bg-emerald-500' : 'bg-slate-300'
                                    }`} />
                                    <span className="text-[11px] text-slate-700 font-medium">Payout</span>
                                  </div>
                                )}
                              </div>
                            </div>

                            {/* Action Buttons: Withdraw if Pending, Amend/Resubmit if Rejected */}
                            {isRejected && (
                              <div className="pt-2 border-t border-slate-100 flex flex-col gap-2">
                                <div className="flex items-center gap-1.5 text-xs text-rose-700 bg-rose-50 px-2.5 py-1.5 rounded-xl font-medium font-body border border-rose-200">
                                  <AlertCircle size={14} className="shrink-0" />
                                  <span>Request was rejected. You can revise details and re-submit.</span>
                                </div>
                                <button
                                  type="button"
                                  onClick={() => handleOpenResubmit(req)}
                                  className="min-h-10 w-full bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold font-heading rounded-xl flex items-center justify-center gap-1.5 shadow-xs active:scale-[0.98] transition-transform cursor-pointer"
                                >
                                  <RotateCcw size={14} />
                                  <span>Amend & Resubmit Form</span>
                                </button>
                              </div>
                            )}

                            {isPending && (
                              <div className="pt-1 flex justify-end">
                                <button
                                  type="button"
                                  onClick={() => handleWithdraw(req.id, req.source)}
                                  className="min-h-8 px-3 text-xs text-rose-600 font-semibold hover:bg-rose-50 rounded-lg active:scale-[0.96] transition-transform cursor-pointer"
                                >
                                  Withdraw Request
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
            })}
          </div>
        )}
      </div>
    )
  }

  // ──────────────────────────────────────────
  // VIEW 5: My Profile Screen & Bank Details
  // ──────────────────────────────────────────
  const renderProfile = () => (
    <div className="space-y-4">
      {/* Profile Header Card with Edit CTA */}
      <div className="bg-gradient-to-br from-indigo-700 via-purple-700 to-pink-700 rounded-2xl p-5 text-white shadow-md">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className="w-14 h-14 rounded-full bg-white/20 backdrop-blur-md flex items-center justify-center text-2xl font-bold font-heading border border-white/30 shrink-0">
              {employee?.name?.[0] || user?.name?.[0] || 'U'}
            </div>
            <div>
              <h2 className="text-lg font-bold font-heading leading-tight">{employee?.name || user?.name}</h2>
              <p className="text-xs text-indigo-100 font-body">{employee?.designation || 'Employee'}</p>
              <p className="text-[11px] text-indigo-200 font-body mt-0.5">
                ID: {employee?.empCode || employee?.id?.slice(0, 8) || 'N/A'} • {employee?.department || 'Site Operations'}
              </p>
            </div>
          </div>
          <button
            onClick={handleOpenProfileEdit}
            className="min-h-9 px-3 bg-white/20 hover:bg-white/30 backdrop-blur-md text-white text-xs font-bold font-heading rounded-xl flex items-center gap-1.5 border border-white/30 active:scale-[0.96] transition-transform cursor-pointer"
          >
            <Edit2 size={13} />
            <span>Edit</span>
          </button>
        </div>
      </div>

      {/* Contact & Personal Information Card */}
      <div className="bg-white rounded-2xl p-4 shadow-xs border border-slate-200">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider font-body">Contact Details</h3>
          <button
            onClick={handleOpenProfileEdit}
            className="text-xs text-blue-600 font-bold hover:underline"
          >
            Update
          </button>
        </div>
        
        <div className="space-y-3 font-body text-xs">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-blue-50 flex items-center justify-center text-blue-600 shrink-0">
              <Mail size={16} />
            </div>
            <div className="min-w-0">
              <p className="text-[11px] text-slate-400">Official Email</p>
              <p className="font-semibold text-slate-900 truncate">{employee?.email || user?.email}</p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-emerald-50 flex items-center justify-center text-emerald-600 shrink-0">
              <Phone size={16} />
            </div>
            <div className="min-w-0">
              <p className="text-[11px] text-slate-400">Mobile Phone</p>
              <p className="font-semibold text-slate-900">{employee?.mobile || employee?.mobileNo || employee?.contactNo || 'Not added'}</p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-green-50 flex items-center justify-center text-green-600 shrink-0">
              <MessageCircle size={16} />
            </div>
            <div className="min-w-0">
              <p className="text-[11px] text-slate-400">WhatsApp Number</p>
              <p className="font-semibold text-slate-900">{employee?.whatsapp || employee?.whatsappNo || employee?.mobile || 'Not added'}</p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-amber-50 flex items-center justify-center text-amber-600 shrink-0">
              <Shield size={16} />
            </div>
            <div className="min-w-0">
              <p className="text-[11px] text-slate-400">Emergency Contact</p>
              <p className="font-semibold text-slate-900">
                {employee?.emergencyContact ? `${employee.emergencyContact} (${employee?.emergencyPhone || ''})` : 'Not added'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-purple-50 flex items-center justify-center text-purple-600 shrink-0">
              <MapPin size={16} />
            </div>
            <div className="min-w-0">
              <p className="text-[11px] text-slate-400">Living Address</p>
              <p className="font-semibold text-slate-900">{employee?.address || 'Not added'}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Bank & Payout Information Card */}
      <div className="bg-white rounded-2xl p-4 shadow-xs border border-slate-200">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider font-body">Bank & Payout Details</h3>
            <p className="text-[10px] text-slate-400">Used for advances & expense reimbursements</p>
          </div>
          <button
            onClick={handleOpenProfileEdit}
            className="text-xs text-blue-600 font-bold hover:underline"
          >
            Update
          </button>
        </div>

        <div className="space-y-3 font-body text-xs">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-indigo-50 flex items-center justify-center text-indigo-600 shrink-0">
              <Landmark size={16} />
            </div>
            <div className="min-w-0">
              <p className="text-[11px] text-slate-400">Bank Name</p>
              <p className="font-semibold text-slate-900 truncate">
                {employee?.personalBank?.bankName || employee?.bankName || 'Not configured'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-indigo-50 flex items-center justify-center text-indigo-600 shrink-0">
              <CreditCard size={16} />
            </div>
            <div className="min-w-0">
              <p className="text-[11px] text-slate-400">Account Number & IFSC</p>
              <p className="font-semibold text-slate-900 font-mono">
                {employee?.personalBank?.accountNo || employee?.accountNumber || employee?.accountNo || 'Not configured'}
                {(employee?.personalBank?.ifsc || employee?.ifsc) ? ` • ${employee.personalBank?.ifsc || employee?.ifsc}` : ''}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-emerald-50 flex items-center justify-center text-emerald-600 shrink-0">
              <QrCode size={16} />
            </div>
            <div className="min-w-0">
              <p className="text-[11px] text-slate-400">UPI ID for Direct Payouts</p>
              <p className="font-semibold text-slate-900 font-mono truncate">
                {employee?.upiId || 'Not configured'}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Official Work Details Card */}
      <div className="bg-white rounded-2xl p-4 shadow-xs border border-slate-200">
        <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3 font-body">Official Work Details</h3>
        <div className="grid grid-cols-2 gap-3 text-xs font-body">
          <div className="bg-slate-50 p-2.5 rounded-xl">
            <p className="text-[11px] text-slate-400">Assigned Site</p>
            <p className="font-semibold text-slate-900 mt-0.5">{employee?.site || 'Main Office'}</p>
          </div>
          <div className="bg-slate-50 p-2.5 rounded-xl">
            <p className="text-[11px] text-slate-400">Employment Type</p>
            <p className="font-semibold text-slate-900 mt-0.5">{employee?.employmentType || 'Full Time'}</p>
          </div>
          <div className="bg-slate-50 p-2.5 rounded-xl">
            <p className="text-[11px] text-slate-400">Joined Date</p>
            <p className="font-semibold text-slate-900 mt-0.5">
              {employee?.joinedDate ? format(new Date(employee.joinedDate), 'dd MMM yyyy') : 'N/A'}
            </p>
          </div>
          <div className="bg-slate-50 p-2.5 rounded-xl">
            <p className="text-[11px] text-slate-400">Min Daily Hours</p>
            <p className="font-semibold text-slate-900 mt-0.5">{employee?.minDailyHours || 8} hrs</p>
          </div>
        </div>
      </div>

      {/* Logout CTA */}
      <button 
        onClick={() => {
          if (confirm('Are you sure you want to sign out?')) {
            logout()
          }
        }}
        className="w-full min-h-11 py-3 text-rose-600 font-bold font-heading bg-rose-50 hover:bg-rose-100 rounded-2xl flex items-center justify-center gap-2 active:scale-[0.98] transition-transform cursor-pointer"
      >
        <LogOut size={16} />
        <span>Sign Out</span>
      </button>
    </div>
  )

  // ──────────────────────────────────────────
  // VIEW 6: Salary Slip Screen
  // ──────────────────────────────────────────
  const renderSalary = () => (
    <div className="space-y-4">
      <div className="bg-gradient-to-br from-emerald-600 to-teal-700 rounded-2xl p-6 text-white shadow-md">
        <p className="text-emerald-100 text-xs font-body mb-1">Monthly Gross Pay</p>
        <h3 className="text-3xl font-bold font-heading">₹{Number(employee?.salary || 0).toLocaleString()}</h3>
        <p className="text-emerald-200 text-xs mt-2 font-body">Subject to attendance & approved overtime</p>
      </div>

      <div className="bg-white rounded-2xl p-4 shadow-xs border border-slate-200">
        <h3 className="font-heading font-bold text-slate-900 text-sm mb-3">Download Salary Slips</h3>
        <div className="space-y-2">
          {[
            { month: 'November 2026', status: 'ready' },
            { month: 'October 2026', status: 'ready' },
            { month: 'September 2026', status: 'ready' }
          ].map((item, idx) => (
            <div key={idx} className="flex items-center justify-between p-3 bg-slate-50 rounded-xl border border-slate-100">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0">
                  <FileText size={18} />
                </div>
                <p className="font-semibold text-slate-900 text-xs font-heading">{item.month}</p>
              </div>
              <button 
                onClick={() => alert(`Downloading payslip for ${item.month}...`)}
                className="min-h-9 px-3.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold font-heading rounded-lg active:scale-[0.96] transition-transform cursor-pointer"
              >
                Download
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  )

  // ──────────────────────────────────────────
  // MODAL 1: Request Modal (Leave, Permission, Advance, Expense)
  // ──────────────────────────────────────────
  const renderRequestModal = () => {
    const calculateTotalDays = () => {
      if (!requestForm.fromDate || !requestForm.toDate) return 0
      const start = new Date(requestForm.fromDate)
      const end = new Date(requestForm.toDate)
      const days = differenceInCalendarDays(end, start) + 1
      return days > 0 ? days : 0
    }

    const handleFileChange = (e) => {
      const file = e.target.files[0]
      if (file) {
        if (file.size > 5 * 1024 * 1024) {
          setValidationErrors({ attachment: 'File size must be under 5MB' })
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
        title={requestForm.resubmitOriginalId ? `Amend & Resubmit ${requestForm.type}` : 'New Request'}
        size="full"
      >
        <div className="flex flex-col h-full bg-white">
          <div className="flex-1 p-4 space-y-4 overflow-y-auto font-body">
            {/* Resubmit Notice Banner */}
            {requestForm.resubmitOriginalId && (
              <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 flex items-start gap-2.5">
                <RotateCcw size={16} className="text-amber-600 mt-0.5 shrink-0" />
                <div>
                  <p className="text-xs font-bold text-amber-900 font-heading">Amending Rejected Request</p>
                  <p className="text-[11px] text-amber-800 mt-0.5">
                    Revise the fields below and submit to restart the multi-stage approval workflow.
                  </p>
                </div>
              </div>
            )}

            {/* Request Type Selector (Leave, Permission, Advance, Expense) */}
            <div>
              <label className="block text-sm font-medium text-slate-800 mb-1.5 font-body">
                Request Type
              </label>
              <div className="grid grid-cols-4 gap-1.5">
                {[
                  { id: 'Leave', label: 'Leave', icon: Palmtree },
                  { id: 'Permission', label: 'Permission', icon: Timer },
                  { id: 'Advance', label: 'Advance', icon: DollarSign },
                  { id: 'Expense', label: 'Expense', icon: Receipt },
                ].map(item => {
                  const Icon = item.icon
                  const isSel = requestForm.type === item.id
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => {
                        setRequestForm({ ...requestForm, type: item.id })
                        setValidationErrors({})
                        setSubmitSuccess('')
                      }}
                      className={`min-h-11 py-2 px-1 rounded-xl text-xs font-heading font-bold flex flex-col items-center justify-center gap-1 active:scale-[0.96] transition-all cursor-pointer ${
                        isSel 
                          ? 'bg-blue-600 text-white shadow-sm shadow-blue-500/20' 
                          : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                      }`}
                    >
                      <Icon size={16} />
                      <span className="truncate">{item.label}</span>
                    </button>
                  )
                })}
              </div>
            </div>

            {/* ─── LEAVE SECTION ─── */}
            {requestForm.type === 'Leave' && (
              <div className="space-y-3.5">
                <div>
                  <label className="block text-sm font-medium text-slate-800 mb-1.5 font-body">
                    Leave Type
                  </label>
                  <select
                    value={selectedLeaveType}
                    onChange={(e) => setRequestForm({ ...requestForm, leaveType: e.target.value })}
                    className="h-9.5 w-full rounded-md border border-slate-200 bg-white px-3 py-1 text-sm focus-visible:ring-1 focus-visible:ring-blue-600 text-slate-800 font-body"
                  >
                    {configuredLeaveTypes.map(type => (
                      <option key={type.code} value={type.name}>{type.name}</option>
                    ))}
                  </select>
                </div>

                <div className="grid grid-cols-2 gap-2.5">
                  <div>
                    <label className="block text-sm font-medium text-slate-800 mb-1.5 font-body">From Date</label>
                    <DatePicker
                      selected={requestForm.fromDate ? new Date(requestForm.fromDate) : null}
                      onChange={(date) => {
                        const dateStr = date ? date.toISOString().split('T')[0] : ''
                        setRequestForm({ 
                          ...requestForm, 
                          fromDate: dateStr,
                          halfDay: false,
                          toDate: requestForm.toDate || dateStr
                        })
                      }}
                      dateFormat="dd/MM/yyyy"
                      className="h-9.5 w-full rounded-md border border-slate-200 bg-white px-3 py-1 text-sm focus-visible:ring-1 focus-visible:ring-blue-600 text-slate-800 font-body"
                      placeholderText="DD/MM/YYYY"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-800 mb-1.5 font-body">To Date</label>
                    <DatePicker
                      selected={requestForm.toDate ? new Date(requestForm.toDate) : null}
                      onChange={(date) => {
                        const dateStr = date ? date.toISOString().split('T')[0] : ''
                        setRequestForm({ ...requestForm, toDate: dateStr, halfDay: false })
                      }}
                      dateFormat="dd/MM/yyyy"
                      className="h-9.5 w-full rounded-md border border-slate-200 bg-white px-3 py-1 text-sm focus-visible:ring-1 focus-visible:ring-blue-600 text-slate-800 font-body"
                      placeholderText="DD/MM/YYYY"
                      minDate={requestForm.fromDate ? new Date(requestForm.fromDate) : undefined}
                      disabled={requestForm.halfDay}
                    />
                  </div>
                </div>

                {requestForm.fromDate && requestForm.toDate && (
                  <div className="bg-blue-50 border border-blue-200 rounded-xl p-2.5 flex items-center justify-between">
                    <span className="text-xs font-medium text-blue-800">Total Duration:</span>
                    <span className="text-sm font-bold font-heading text-blue-900">
                      {requestForm.halfDay ? '0.5 Day' : `${calculateTotalDays()} Day(s)`}
                    </span>
                  </div>
                )}

                <label className="inline-flex items-center gap-2 text-xs font-medium text-slate-700 cursor-pointer">
                  <input 
                    type="checkbox" 
                    checked={requestForm.halfDay} 
                    disabled={!requestForm.fromDate || requestForm.toDate !== requestForm.fromDate}
                    onChange={(e) => setRequestForm(prev => ({ ...prev, halfDay: e.target.checked }))} 
                    className="h-4 w-4 rounded border-slate-300 text-blue-600" 
                  />
                  <span>Half day (0.5 day leave)</span>
                </label>

                {selectedLeaveBalance?.configured && (
                  <div className="rounded-xl border border-blue-100 bg-blue-50/60 p-2.5 text-xs text-blue-900">
                    <strong>{selectedLeaveBalance.available.toFixed(1)} days available</strong> in {selectedLeaveType}.
                    {leaveRequestShortfall > 0 && (
                      <span className="mt-1 block font-bold text-rose-700">
                        Request exceeds balance by {leaveRequestShortfall.toFixed(1)} units and will require special approval / LOP.
                      </span>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* ─── PERMISSION SECTION ─── */}
            {requestForm.type === 'Permission' && (
              <div className="space-y-3.5">
                <div>
                  <label className="block text-sm font-medium text-slate-800 mb-1.5 font-body">Permission Date</label>
                  <DatePicker
                    selected={requestForm.date ? new Date(requestForm.date) : null}
                    onChange={(date) => {
                      const dateStr = date ? date.toISOString().split('T')[0] : ''
                      setRequestForm({ ...requestForm, date: dateStr })
                    }}
                    dateFormat="dd/MM/yyyy"
                    className="h-9.5 w-full rounded-md border border-slate-200 bg-white px-3 py-1 text-sm focus-visible:ring-1 focus-visible:ring-blue-600 text-slate-800 font-body"
                    placeholderText="Select date"
                  />
                </div>
                <div className="grid grid-cols-2 gap-2.5">
                  <div>
                    <label className="block text-sm font-medium text-slate-800 mb-1.5 font-body">From Time</label>
                    <button
                      type="button"
                      onClick={() => {
                        setTimePickerMode('fromTime')
                        setShowTimePicker(true)
                      }}
                      className="h-9.5 w-full rounded-md border border-slate-200 bg-white px-3 py-1 text-sm text-left flex items-center justify-between text-slate-800 font-body active:scale-[0.98]"
                    >
                      <span>{requestForm.fromTime || 'Select time'}</span>
                      <Clock size={14} className="text-slate-400" />
                    </button>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-800 mb-1.5 font-body">To Time</label>
                    <button
                      type="button"
                      onClick={() => {
                        setTimePickerMode('toTime')
                        setShowTimePicker(true)
                      }}
                      className="h-9.5 w-full rounded-md border border-slate-200 bg-white px-3 py-1 text-sm text-left flex items-center justify-between text-slate-800 font-body active:scale-[0.98]"
                    >
                      <span>{requestForm.toTime || 'Select time'}</span>
                      <Clock size={14} className="text-slate-400" />
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* ─── SALARY ADVANCE SECTION ─── */}
            {requestForm.type === 'Advance' && (
              <div className="space-y-3.5">
                <div>
                  <label className="block text-sm font-medium text-slate-800 mb-1.5 font-body">Needed Date</label>
                  <DatePicker
                    selected={requestForm.requestDate ? new Date(requestForm.requestDate) : null}
                    onChange={(date) => {
                      const dateStr = date ? date.toISOString().split('T')[0] : ''
                      setRequestForm({ ...requestForm, requestDate: dateStr })
                    }}
                    dateFormat="dd/MM/yyyy"
                    className="h-9.5 w-full rounded-md border border-slate-200 bg-white px-3 py-1 text-sm focus-visible:ring-1 focus-visible:ring-blue-600 text-slate-800 font-body"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-800 mb-1.5 font-body">Advance Amount (₹)</label>
                  <input
                    type="number"
                    value={requestForm.amount}
                    onChange={(e) => setRequestForm({ ...requestForm, amount: e.target.value })}
                    placeholder="Enter amount in ₹"
                    className="h-9.5 w-full rounded-md border border-slate-200 bg-white px-3 py-1 text-sm focus-visible:ring-1 focus-visible:ring-blue-600 text-slate-800 font-body"
                  />
                  {/* Quick Chips */}
                  <div className="flex gap-1.5 mt-2 flex-wrap">
                    {[500, 1000, 2000, 3000, 5000].map(amt => (
                      <button
                        key={amt}
                        type="button"
                        onClick={() => setRequestForm({ ...requestForm, amount: amt.toString() })}
                        className={`min-h-8 px-3 py-1 rounded-lg text-xs font-bold font-heading active:scale-[0.96] transition-colors cursor-pointer ${
                          requestForm.amount === amt.toString()
                            ? 'bg-blue-600 text-white'
                            : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                        }`}
                      >
                        ₹{amt}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* ─── EXPENSE REIMBURSEMENT SECTION ─── */}
            {requestForm.type === 'Expense' && (
              <div className="space-y-3.5">
                <div>
                  <label className="block text-sm font-medium text-slate-800 mb-1.5 font-body">
                    Expense Category
                  </label>
                  <select
                    value={requestForm.expenseCategory}
                    onChange={(e) => setRequestForm({ ...requestForm, expenseCategory: e.target.value })}
                    className="h-9.5 w-full rounded-md border border-slate-200 bg-white px-3 py-1 text-sm focus-visible:ring-1 focus-visible:ring-blue-600 text-slate-800 font-body"
                  >
                    {EXPENSE_CATEGORIES.map(cat => (
                      <option key={cat} value={cat}>{cat}</option>
                    ))}
                  </select>
                </div>

                <div className="grid grid-cols-2 gap-2.5">
                  <div>
                    <label className="block text-sm font-medium text-slate-800 mb-1.5 font-body">Expense Date</label>
                    <DatePicker
                      selected={requestForm.requestDate ? new Date(requestForm.requestDate) : null}
                      onChange={(date) => {
                        const dateStr = date ? date.toISOString().split('T')[0] : ''
                        setRequestForm({ ...requestForm, requestDate: dateStr })
                      }}
                      dateFormat="dd/MM/yyyy"
                      className="h-9.5 w-full rounded-md border border-slate-200 bg-white px-3 py-1 text-sm focus-visible:ring-1 focus-visible:ring-blue-600 text-slate-800 font-body"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-800 mb-1.5 font-body">Amount (₹)</label>
                    <input
                      type="number"
                      value={requestForm.amount}
                      onChange={(e) => setRequestForm({ ...requestForm, amount: e.target.value })}
                      placeholder="e.g. 250"
                      className="h-9.5 w-full rounded-md border border-slate-200 bg-white px-3 py-1 text-sm focus-visible:ring-1 focus-visible:ring-blue-600 text-slate-800 font-body"
                    />
                  </div>
                </div>

                {/* Quick Expense Amount Chips */}
                <div className="flex gap-1.5 flex-wrap">
                  {[100, 250, 500, 1000, 2000].map(amt => (
                    <button
                      key={amt}
                      type="button"
                      onClick={() => setRequestForm({ ...requestForm, amount: amt.toString() })}
                      className={`min-h-8 px-3 py-1 rounded-lg text-xs font-bold font-heading active:scale-[0.96] transition-colors cursor-pointer ${
                        requestForm.amount === amt.toString()
                          ? 'bg-blue-600 text-white'
                          : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                      }`}
                    >
                      ₹{amt}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Description / Reason */}
            <div>
              <label className="block text-sm font-medium text-slate-800 mb-1.5 font-body">
                {requestForm.type === 'Expense' ? 'Description & Purpose' : 'Reason'}
              </label>
              <textarea
                value={requestForm.reason}
                onChange={(e) => setRequestForm({ ...requestForm, reason: e.target.value })}
                placeholder={requestForm.type === 'Expense' ? 'e.g. Site team lunch, fuel purchase for generator, hardware purchase...' : 'Brief description for HR approval...'}
                rows={2}
                className="w-full p-2.5 bg-white border border-slate-200 rounded-md text-sm text-slate-800 resize-none font-body focus-visible:ring-1 focus-visible:ring-blue-600"
              />
            </div>

            {/* Bill / Receipt / Document Upload */}
            <div>
              <label className="block text-sm font-medium text-slate-800 mb-1.5 font-body">
                {requestForm.type === 'Expense' ? 'Upload Bill / Receipt (Photo or PDF)' : 'Attachment (Optional)'}
              </label>
              <div className="relative">
                <input
                  type="file"
                  accept="image/*,application/pdf"
                  onChange={handleFileChange}
                  className="hidden"
                  id="portal-file-upload"
                />
                <label
                  htmlFor="portal-file-upload"
                  className="flex items-center gap-2.5 px-3 py-2.5 bg-slate-50 border border-slate-200 border-dashed rounded-xl cursor-pointer hover:bg-slate-100 transition-colors min-h-11"
                >
                  <div className="w-8 h-8 rounded-lg bg-blue-100 text-blue-700 flex items-center justify-center shrink-0">
                    <Camera size={16} />
                  </div>
                  <span className="text-xs text-slate-600 truncate font-body">
                    {requestForm.attachment ? requestForm.attachment.name : 'Take photo or choose receipt / bill file'}
                  </span>
                  {requestForm.attachment && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.preventDefault()
                        setRequestForm({ ...requestForm, attachment: null })
                      }}
                      className="ml-auto w-8 h-8 flex items-center justify-center text-slate-400 hover:text-rose-600 rounded-lg"
                      aria-label="Remove attachment"
                    >
                      <X size={16} />
                    </button>
                  )}
                </label>
              </div>
            </div>

            {/* Validation Errors */}
            {Object.keys(validationErrors).length > 0 && (
              <div className="bg-rose-50 border border-rose-200 rounded-xl p-3 space-y-1">
                {Object.entries(validationErrors).map(([key, error]) => (
                  error && (
                    <p key={key} className="text-xs text-rose-700 flex items-center gap-1 font-body">
                      <AlertCircle size={13} className="shrink-0" />
                      <span>{error}</span>
                    </p>
                  )
                ))}
              </div>
            )}
          </div>

          {/* Modal Footer */}
          <div className="p-4 border-t border-slate-100 space-y-2.5 bg-white">
            {submitSuccess && (
              <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-2.5 flex items-center gap-2">
                <CheckCircle2 size={16} className="text-emerald-700 shrink-0" />
                <span className="text-xs font-bold text-emerald-800 font-heading">{submitSuccess}</span>
              </div>
            )}

            <div className="flex gap-2.5">
              <button
                type="button"
                onClick={() => setShowRequestModal(false)}
                className="flex-1 min-h-10 py-2 text-xs font-bold font-heading text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-xl active:scale-[0.97] transition-transform cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleRequestSubmit}
                disabled={loading || fileUploading}
                className="flex-1 min-h-10 py-2 text-xs font-bold font-heading text-white bg-blue-600 hover:bg-blue-700 rounded-xl disabled:opacity-50 active:scale-[0.97] transition-transform shadow-sm cursor-pointer flex items-center justify-center gap-1.5"
              >
                {loading || fileUploading ? (
                  <>
                    <RefreshCw size={14} className="animate-spin" />
                    <span>Submitting...</span>
                  </>
                ) : (
                  <span>{requestForm.resubmitOriginalId ? 'Resubmit for Approval' : 'Submit Request'}</span>
                )}
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

  // ──────────────────────────────────────────
  // MODAL 2: Profile Edit Modal
  // ──────────────────────────────────────────
  const renderProfileEditModal = () => (
    <Modal
      isOpen={showProfileEditModal}
      onClose={() => setShowProfileEditModal(false)}
      title="Edit My Profile"
      size="full"
    >
      <div className="flex flex-col h-full bg-white">
        <form onSubmit={handleSaveProfile} className="flex-1 p-4 space-y-4 overflow-y-auto font-body">
          <p className="text-xs text-slate-500">
            Update your contact numbers, address, and payout bank details. These will reflect across your official company profile.
          </p>

          {/* Section: Contact Details */}
          <div className="bg-slate-50/80 p-3.5 rounded-2xl border border-slate-200/80 space-y-3">
            <h4 className="font-heading font-bold text-slate-900 text-xs uppercase tracking-wider">Contact Details</h4>
            
            <div>
              <label className="block text-sm font-medium text-slate-800 mb-1.5 font-body">Mobile Phone Number</label>
              <input
                type="tel"
                value={profileForm.mobile}
                onChange={(e) => setProfileForm({ ...profileForm, mobile: e.target.value })}
                placeholder="e.g. 9876543210"
                className="h-9.5 w-full rounded-md border border-slate-200 bg-white px-3 py-1 text-sm focus-visible:ring-1 focus-visible:ring-blue-600 text-slate-800 font-body"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-800 mb-1.5 font-body">WhatsApp Number</label>
              <input
                type="tel"
                value={profileForm.whatsapp}
                onChange={(e) => setProfileForm({ ...profileForm, whatsapp: e.target.value })}
                placeholder="e.g. 9876543210"
                className="h-9.5 w-full rounded-md border border-slate-200 bg-white px-3 py-1 text-sm focus-visible:ring-1 focus-visible:ring-blue-600 text-slate-800 font-body"
              />
            </div>

            <div className="grid grid-cols-2 gap-2.5">
              <div>
                <label className="block text-sm font-medium text-slate-800 mb-1.5 font-body">Emergency Contact Person</label>
                <input
                  type="text"
                  value={profileForm.emergencyContact}
                  onChange={(e) => setProfileForm({ ...profileForm, emergencyContact: e.target.value })}
                  placeholder="e.g. Brother, Spouse"
                  className="h-9.5 w-full rounded-md border border-slate-200 bg-white px-3 py-1 text-sm focus-visible:ring-1 focus-visible:ring-blue-600 text-slate-800 font-body"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-800 mb-1.5 font-body">Emergency Phone</label>
                <input
                  type="tel"
                  value={profileForm.emergencyPhone}
                  onChange={(e) => setProfileForm({ ...profileForm, emergencyPhone: e.target.value })}
                  placeholder="e.g. 9876543210"
                  className="h-9.5 w-full rounded-md border border-slate-200 bg-white px-3 py-1 text-sm focus-visible:ring-1 focus-visible:ring-blue-600 text-slate-800 font-body"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-800 mb-1.5 font-body">Living / Residential Address</label>
              <textarea
                value={profileForm.address}
                onChange={(e) => setProfileForm({ ...profileForm, address: e.target.value })}
                placeholder="Full address..."
                rows={2}
                className="w-full p-2.5 bg-white border border-slate-200 rounded-md text-sm text-slate-800 resize-none font-body focus-visible:ring-1 focus-visible:ring-blue-600"
              />
            </div>
          </div>

          {/* Section: Bank & Payout Details */}
          <div className="bg-slate-50/80 p-3.5 rounded-2xl border border-slate-200/80 space-y-3">
            <h4 className="font-heading font-bold text-slate-900 text-xs uppercase tracking-wider">Bank & Payout Details</h4>
            
            <div>
              <label className="block text-sm font-medium text-slate-800 mb-1.5 font-body">Bank Name</label>
              <input
                type="text"
                value={profileForm.personalBank.bankName}
                onChange={(e) => setProfileForm({
                  ...profileForm,
                  personalBank: { ...profileForm.personalBank, bankName: e.target.value }
                })}
                placeholder="e.g. State Bank of India, HDFC"
                className="h-9.5 w-full rounded-md border border-slate-200 bg-white px-3 py-1 text-sm focus-visible:ring-1 focus-visible:ring-blue-600 text-slate-800 font-body"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-800 mb-1.5 font-body">Account Holder Name</label>
              <input
                type="text"
                value={profileForm.personalBank.holderName}
                onChange={(e) => setProfileForm({
                  ...profileForm,
                  personalBank: { ...profileForm.personalBank, holderName: e.target.value }
                })}
                placeholder="Name as per bank account"
                className="h-9.5 w-full rounded-md border border-slate-200 bg-white px-3 py-1 text-sm focus-visible:ring-1 focus-visible:ring-blue-600 text-slate-800 font-body"
              />
            </div>

            <div className="grid grid-cols-2 gap-2.5">
              <div>
                <label className="block text-sm font-medium text-slate-800 mb-1.5 font-body">Account Number</label>
                <input
                  type="text"
                  value={profileForm.personalBank.accountNo}
                  onChange={(e) => setProfileForm({
                    ...profileForm,
                    personalBank: { ...profileForm.personalBank, accountNo: e.target.value }
                  })}
                  placeholder="e.g. 1234567890"
                  className="h-9.5 w-full rounded-md border border-slate-200 bg-white px-3 py-1 text-sm focus-visible:ring-1 focus-visible:ring-blue-600 text-slate-800 font-mono"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-800 mb-1.5 font-body">IFSC Code</label>
                <input
                  type="text"
                  value={profileForm.personalBank.ifsc}
                  onChange={(e) => setProfileForm({
                    ...profileForm,
                    personalBank: { ...profileForm.personalBank, ifsc: e.target.value.toUpperCase() }
                  })}
                  placeholder="SBIN0001234"
                  className="h-9.5 w-full rounded-md border border-slate-200 bg-white px-3 py-1 text-sm focus-visible:ring-1 focus-visible:ring-blue-600 text-slate-800 font-mono uppercase"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-800 mb-1.5 font-body">UPI ID (Google Pay / PhonePe)</label>
              <input
                type="text"
                value={profileForm.upiId}
                onChange={(e) => setProfileForm({ ...profileForm, upiId: e.target.value })}
                placeholder="e.g. mobile@okhdfcbank"
                className="h-9.5 w-full rounded-md border border-slate-200 bg-white px-3 py-1 text-sm focus-visible:ring-1 focus-visible:ring-blue-600 text-slate-800 font-body"
              />
            </div>
          </div>
        </form>

        {/* Modal Footer */}
        <div className="p-4 border-t border-slate-100 bg-white space-y-2">
          {profileSuccessMsg && (
            <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-2.5 flex items-center gap-2">
              <CheckCircle2 size={16} className="text-emerald-700 shrink-0" />
              <span className="text-xs font-bold text-emerald-800 font-heading">{profileSuccessMsg}</span>
            </div>
          )}

          <div className="flex gap-2.5">
            <button
              type="button"
              onClick={() => setShowProfileEditModal(false)}
              className="flex-1 min-h-10 py-2 text-xs font-bold font-heading text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-xl active:scale-[0.97] transition-transform cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSaveProfile}
              disabled={savingProfile}
              className="flex-1 min-h-10 py-2 text-xs font-bold font-heading text-white bg-blue-600 hover:bg-blue-700 rounded-xl disabled:opacity-50 active:scale-[0.97] transition-transform shadow-sm cursor-pointer flex items-center justify-center gap-1.5"
            >
              {savingProfile ? (
                <>
                  <RefreshCw size={14} className="animate-spin" />
                  <span>Saving...</span>
                </>
              ) : (
                <span>Save Profile</span>
              )}
            </button>
          </div>
        </div>
      </div>
    </Modal>
  )

  if (loading && !employee) {
    return (
      <div className="flex-1 flex items-center justify-center bg-white h-full min-h-[300px]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
      </div>
    )
  }

  return (
    <div className="flex-1 flex flex-col bg-slate-50 min-h-screen">
      {/* Sticky Top Navigation Segmented Pills */}
      {renderTopNav()}

      {/* Main Tab View Content (padded at bottom to clear MobileDashboard bottom bar) */}
      <div className="flex-1 overflow-y-auto p-3.5 pb-28">
        {activeTab === 'dashboard' && renderDashboard()}
        {activeTab === 'attendance' && renderAttendance()}
        {activeTab === 'requests' && renderRequests()}
        {activeTab === 'salary' && renderSalary()}
        {activeTab === 'profile' && renderProfile()}
      </div>

      {/* Request Modal */}
      {renderRequestModal()}

      {/* Profile Edit Modal */}
      {renderProfileEditModal()}

      {/* Selfie Attendance Capture Modal */}
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

      {/* Location Exception Modal */}
      <Modal
        isOpen={showExceptionModal}
        onClose={() => setShowExceptionModal(false)}
        title="Out of Site - Exception Request"
        size="lg"
      >
        <div className="p-5 space-y-4 font-body">
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
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
            <label className="block text-sm font-medium text-slate-800 mb-1.5 font-body">Selfie Photo (Required)</label>
            <input
              type="file"
              accept="image/*"
              capture="user"
              onChange={(e) => setExceptionForm(prev => ({ ...prev, file: e.target.files?.[0] || null }))}
              className="w-full text-xs border border-slate-200 rounded-xl p-2 min-h-11 bg-white"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-800 mb-1.5 font-body">Reason for Exception (Required)</label>
            <textarea
              value={exceptionForm.reason}
              onChange={(e) => setExceptionForm(prev => ({ ...prev, reason: e.target.value }))}
              className="w-full min-h-[90px] text-xs border border-slate-200 rounded-xl p-2.5 outline-none focus:ring-1 focus:ring-blue-600 bg-white resize-none"
              placeholder="Explain site visit / client movement context..."
            />
          </div>

          <div className="flex justify-end gap-2.5 pt-2">
            <button
              type="button"
              onClick={() => setShowExceptionModal(false)}
              className="min-h-10 px-4 rounded-xl border border-slate-200 text-xs font-bold font-heading text-slate-600 hover:bg-slate-50 active:scale-[0.96] transition-transform cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={submittingAttendance}
              onClick={handleExceptionSubmit}
              className="min-h-10 px-4 rounded-xl bg-amber-600 text-white text-xs font-bold font-heading hover:bg-amber-700 disabled:opacity-50 active:scale-[0.96] transition-transform cursor-pointer shadow-xs"
            >
              {submittingAttendance ? 'Submitting...' : 'Submit Exception'}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
