import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useAuth } from '../../../hooks/useAuth';
import { useEmployees } from '../../../hooks/useEmployees';
import { useAttendance } from '../../../hooks/useAttendance';
import { useLeaves } from '../../../hooks/useLeaves';
import { db, storage } from '../../../lib/firebase';
import { collection, query, where, getDocs, deleteDoc, doc, addDoc, serverTimestamp, orderBy } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { attendanceCol } from '../../../lib/firestore';
import { formatTimeTo12Hour } from '../../../lib/salaryUtils';
import { getAttendancePortalBadge, ATTENDANCE_EVENT_IN, ATTENDANCE_EVENT_OUT, ATTENDANCE_STATUS_REJECTED } from '../../../lib/attendanceWorkflow';
import { compressSelfieBlob, evaluateSiteProximity, getCurrentPositionOnce, getOrgSites, resolveTargetSite, submitPendingAttendanceEvent, uploadTempSelfie } from '../../../lib/geoAttendanceService';
import { z } from 'zod';
import DatePicker from 'react-datepicker';
import 'react-datepicker/dist/react-datepicker.css';
import { format, startOfMonth, endOfMonth, eachDayOfInterval, differenceInCalendarDays } from 'date-fns';
import Modal from '../../ui/Modal';
import TimePicker from '../../ui/TimePicker';
import SelfieCaptureModal from '../../ui/SelfieCaptureModal';
import {
  User, 
  Calendar, 
  FileText, 
  Plus, 
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
} from 'lucide-react';

// Import the new view components
import DashboardView from './DashboardView';
import AttendanceView from './AttendanceView';
import RequestsView from './RequestsView';
import ProfileView from './ProfileView';
import SalaryView from './SalaryView';

// Validation Schemas
const leaveSchema = z.object({
  leaveType: z.enum(['Casual', 'Sick', 'Annual', 'Unpaid']),
  fromDate: z.string().min(1, 'From date is required'),
  toDate: z.string().min(1, 'To date is required'),
  reason: z.string().min(5, 'Reason must be at least 5 characters'),
}).refine((data) => {
  const start = new Date(data.fromDate)
  const end = new Date(data.toDate)
  if (start.getDay() === 0) return false
  if (end.getDay() === 0) return false
  return true
}, { message: 'Leave cannot start or end on a Sunday' }).refine((data) => {
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

/**
 * EmployeePortalLayout - Main layout component for employee portal
 * Handles state management and coordinates between views
 */
export default function EmployeePortalLayout() {
  const { user, logout } = useAuth();
  const { employees, loading: empLoading } = useEmployees(user?.orgId);
  const { fetchByDate } = useAttendance(user?.orgId);
  const { applyLeave } = useLeaves(user?.orgId);

  // State management
  const [activeTab, setActiveTab] = useState('dashboard');
  const [loading, setLoading] = useState(false);
  const [requests, setRequests] = useState([]);
  const [expandedMonths, setExpandedMonths] = useState({});
  const [showRequestModal, setShowRequestModal] = useState(false);
  const [todayRecord, setTodayRecord] = useState(null);
  const [attendanceRows, setAttendanceRows] = useState([]);
  const [portalAttendanceLogs, setPortalAttendanceLogs] = useState([]);
  const [showSelfieCaptureModal, setShowSelfieCaptureModal] = useState(false);
  const [captureEventType, setCaptureEventType] = useState(ATTENDANCE_EVENT_IN);
  const [geoContext, setGeoContext] = useState({
    currentCoordinates: null,
    targetSite: null,
    targetCoordinates: null,
    distanceMeters: null,
    radiusMeters: 500,
    withinRange: false,
    locationError: '',
  });
  const [showExceptionModal, setShowExceptionModal] = useState(false);
  const [exceptionForm, setExceptionForm] = useState({ reason: '', file: null });
  const [submittingAttendance, setSubmittingAttendance] = useState(false);
  const [month, setMonth] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  });
  const [showTimePicker, setShowTimePicker] = useState(false);
  const [timePickerMode, setTimePickerMode] = useState(null);
  const [approvalSettingsByModule, setApprovalSettingsByModule] = useState({});

  // Employee data
  const employee = useMemo(() => {
    if (!user || !employees.length) return null;
    const normalizedUserEmail = user.email?.toLowerCase().trim() || '';
    return employees.find(e => {
      const empEmail = (e.email || '').toLowerCase().trim();
      const empCode = (e.empCode || '').toLowerCase().trim();
      return empEmail === normalizedUserEmail || empCode === normalizedUserEmail || e.id === user.uid;
    });
  }, [employees, user?.email, user?.uid]);

  const employeeId = employee?.id || user?.uid;

  // Request form state
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
  });
  const [validationErrors, setValidationErrors] = useState({});
  const [submitSuccess, setSubmitSuccess] = useState('');
  const [fileUploading, setFileUploading] = useState(false);

  // Fetch approval settings
  useEffect(() => {
    if (!user?.orgId) return;
    const fetchSettings = async () => {
      const q = query(collection(db, 'organisations', user.orgId, 'approvalSettings'));
      const snap = await getDocs(q);
      const nextSettings = {};
      snap.docs.forEach((docSnap) => {
        const data = docSnap.data() || {};
        if (data.moduleName) {
          nextSettings[data.moduleName] = data;
        }
      });
      setApprovalSettingsByModule(nextSettings);
    };
    fetchSettings();
  }, [user?.orgId]);

  const getModuleNameForRequestType = (type) => {
    if (type === 'Permission') return 'Permission';
    if (type === 'Advance') return 'Advance';
    return 'Leave';
  };

  const getApprovalSettingForType = (type) => {
    const moduleName = getModuleNameForRequestType(type);
    return approvalSettingsByModule[moduleName] || { type: 'single', approvers: [], stages: [] };
  };

  // Load initial data
  useEffect(() => {
    if (!user?.orgId || empLoading || !employeeId) return;
    fetchRequests();
    fetchPortalAttendanceLogs();
    loadToday();
  }, [user?.orgId, employeeId, empLoading]);

  useEffect(() => {
    if (!user?.orgId || empLoading || !employeeId || !month) return;
    loadMonth();
  }, [user?.orgId, employeeId, month, empLoading]);

  const loadToday = async () => {
    const today = new Date().toISOString().split('T')[0];
    const records = await fetchByDate(today);
    setTodayRecord(records.find(r => r.employeeId === employeeId) || null);
  };

  const loadMonth = async () => {
    const [year, mon] = month.split('-');
    const start = `${month}-01`;
    const endDay = new Date(year, mon, 0).getDate();
    const end = `${month}-${String(endDay).padStart(2, '0')}`;

    const q = query(
      attendanceCol(user.orgId),
      where('employeeId', '==', employeeId),
      where('date', '>=', start),
      where('date', '<=', end)
    );
    const snap = await getDocs(q);
    const map = {};
    snap.docs.forEach(d => {
      const rec = d.data();
      map[rec.date] = rec;
    });

    const days = [];
    for (let i = 1; i <= endDay; i++) {
      const dStr = `${month}-${String(i).padStart(2, '0')}`;
      days.push({ date: dStr, record: map[dStr] || null });
    }
    setAttendanceRows(days);
  };

  const fetchRequests = async () => {
    setLoading(true);
    try {
      const q = query(
        collection(db, 'organisations', user.orgId, 'requests'),
        where('employeeId', '==', employeeId),
        orderBy('createdAt', 'desc')
      );
      const snap = await getDocs(q);
      const ordinaryRequests = snap.docs.map(d => ({ id: d.id, ...d.data(), source: 'requests' }));

      const q2 = query(
        collection(db, 'organisations', user.orgId, 'advances_expenses'),
        where('employeeId', '==', employeeId),
        orderBy('createdAt', 'desc')
      );
      const snap2 = await getDocs(q2);
      const advExpRequests = snap2.docs.map(d => ({ id: d.id, ...d.data(), source: 'advances_expenses' }));

      const merged = [...ordinaryRequests, ...advExpRequests].sort((a, b) => {
        const dateA = a.createdAt?.toDate ? a.createdAt.toDate() : new Date(0);
        const dateB = b.createdAt?.toDate ? b.createdAt.toDate() : new Date(0);
        return dateB - dateA;
      });

      setRequests(merged);
    } catch (err) {
      console.error('Portal fetch error:', err);
    } finally {
      setLoading(false);
    }
  };

  const fetchPortalAttendanceLogs = async () => {
    if (!user?.orgId || !employeeId) return;
    try {
      const logsQuery = query(
        collection(db, 'organisations', user.orgId, 'employee_portal', employeeId, 'attendance_logs'),
        orderBy('eventDate', 'desc')
      );
      const snapshot = await getDocs(logsQuery);
      setPortalAttendanceLogs(snapshot.docs.map(d => ({ id: d.id, ...d.data() })));
    } catch (error) {
      console.error('Failed to fetch mobile portal attendance logs:', error);
    }
  };

  // Attendance log helpers
  const todayDateKey = new Date().toISOString().split('T')[0];
  const todayLogs = portalAttendanceLogs.filter(log => log.eventDate === todayDateKey);
  const getLatestLogByType = (logs, type) =>
    logs
      .filter(log => log.type === type)
      .sort((a, b) => {
        const aTs = a.clientTimestamp ? new Date(a.clientTimestamp).getTime() : 0;
        const bTs = b.clientTimestamp ? new Date(b.clientTimestamp).getTime() : 0;
        return bTs - aTs;
      })[0] || null;

  const latestTodayInLog = getLatestLogByType(todayLogs, ATTENDANCE_EVENT_IN);
  const latestTodayOutLog = getLatestLogByType(todayLogs, ATTENDANCE_EVENT_OUT);
  const validInLog = latestTodayInLog && latestTodayInLog.status !== ATTENDANCE_STATUS_REJECTED;
  const validOutLog = latestTodayOutLog && latestTodayOutLog.status !== ATTENDANCE_STATUS_REJECTED;
  const latestTodayLog = validOutLog || validInLog || null;
  const todayBadge = latestTodayLog ? getAttendancePortalBadge(latestTodayLog.status) : null;
  const todayInTime = validInLog?.eventTime || todayRecord?.inTime || '';
  const todayOutTime = validOutLog?.eventTime || todayRecord?.outTime || '';

  // Geo attendance handlers
  const openGeoAttendanceCapture = async (type) => {
    if (!employeeId || !employee || !user?.orgId) return;
    setCaptureEventType(type);
    setGeoContext({
      currentCoordinates: null,
      targetSite: null,
      targetCoordinates: null,
      distanceMeters: null,
      radiusMeters: 500,
      withinRange: false,
      locationError: '',
    });

    try {
      const currentCoordinates = await getCurrentPositionOnce();
      const sites = await getOrgSites(user.orgId);
      const targetSite = resolveTargetSite(employee, sites);
      const proximity = evaluateSiteProximity({ currentCoordinates, targetSite });

      if (proximity.accuracy > 100) {
        const warnMsg = `Low GPS accuracy detected (${Math.round(proximity.accuracy)}m). Please ensure you are outdoors for better precision.`;
        setGeoContext(prev => ({ ...prev, locationError: warnMsg }));
        alert(warnMsg);
      }

      const nextGeoContext = {
        currentCoordinates,
        targetSite,
        targetCoordinates: proximity.targetCoordinates,
        distanceMeters: proximity.distanceMeters,
        radiusMeters: proximity.radiusMeters,
        withinRange: proximity.withinRange,
        locationError: proximity.accuracy > 100 ? `Low precision (${Math.round(proximity.accuracy)}m)` : '',
      };
      setGeoContext(nextGeoContext);
      if (proximity.withinRange) {
        setShowSelfieCaptureModal(true);
      } else {
        setExceptionForm({ reason: '', file: null });
        setShowExceptionModal(true);
      }
    } catch (error) {
      setGeoContext(prev => ({ ...prev, locationError: error.message || 'Location fetch failed.' }));
      alert(error.message || 'Failed to fetch location.');
    }
  };

  const submitGeoAttendance = async ({ imageBlob, isException, exceptionReason }) => {
    if (!user?.orgId || !employee) return;
    setSubmittingAttendance(true);
    try {
      const timestamp = Date.now();
      const compressed = await compressSelfieBlob(imageBlob, 100);
      const { photoUrl, photoPath } = await uploadTempSelfie({
        orgId: user.orgId,
        userId: employee.id || user.uid,
        timestamp,
        fileBlob: compressed,
      });

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
      });

      setShowSelfieCaptureModal(false);
      setShowExceptionModal(false);
      await fetchPortalAttendanceLogs();
      alert(isException ? 'Exception request submitted to HR.' : 'Attendance submitted for HR approval.');
    } catch (error) {
      alert(error.message || 'Failed to submit attendance.');
    } finally {
      setSubmittingAttendance(false);
    }
  };

  const handleCheckIn = async () => openGeoAttendanceCapture(ATTENDANCE_EVENT_IN);
  const handleCheckOut = async () => openGeoAttendanceCapture(ATTENDANCE_EVENT_OUT);

  const handleExceptionSubmit = async () => {
    if (!exceptionForm.file) {
      alert('Selfie is required for exception request.');
      return;
    }
    if (!exceptionForm.reason.trim()) {
      alert('Please provide reason for out-of-site request.');
      return;
    }
    await submitGeoAttendance({
      imageBlob: exceptionForm.file,
      isException: true,
      exceptionReason: exceptionForm.reason.trim(),
    });
  };

  const handleWithdraw = async (reqId, source) => {
    if (!window.confirm('Withdraw this request?')) return;
    setLoading(true);
    try {
      const collectionName = source === 'advances_expenses' ? 'advances_expenses' : 'requests';
      await deleteDoc(doc(db, 'organisations', user.orgId, collectionName, reqId));
      await fetchRequests();
    } catch (err) {
      alert('Withdrawal failed: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleRequestSubmit = async () => {
    setValidationErrors({});
    setSubmitSuccess('');

    let validationResult;
    if (requestForm.type === 'Leave') {
      validationResult = leaveSchema.safeParse({
        leaveType: requestForm.leaveType,
        fromDate: requestForm.fromDate,
        toDate: requestForm.toDate,
        reason: requestForm.reason,
      });
    } else if (requestForm.type === 'Permission') {
      validationResult = permissionSchema.safeParse({
        date: requestForm.date,
        fromTime: requestForm.fromTime,
        toTime: requestForm.toTime,
        reason: requestForm.reason,
      });
    } else if (requestForm.type === 'Advance') {
      validationResult = advanceSchema.safeParse({
        amount: Number(requestForm.amount),
        requestDate: requestForm.requestDate,
        reason: requestForm.reason,
      });
    }

    if (!validationResult?.success) {
      const errors = {};
      validationResult.error?.issues?.forEach((issue) => {
        errors[issue.path[0]] = issue.message;
      });
      setValidationErrors(errors);
      return;
    }

    setLoading(true);
    let attachmentUrl = null;

    try {
      if (requestForm.attachment) {
        setFileUploading(true);
        const fileRef = ref(storage, `requests/${user.orgId}/${Date.now()}_${requestForm.attachment.name}`);
        await uploadBytes(fileRef, requestForm.attachment);
        attachmentUrl = await getDownloadURL(fileRef);
        setFileUploading(false);
      }

      const approvalSetting = getApprovalSettingForType(requestForm.type);
      const approvalType = approvalSetting?.type || 'single';
      const totalStages = approvalType === 'multi' ? (approvalSetting?.stages?.length || 1) : 1;
      const isNoApproval = approvalType === 'none';

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
        });
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
        });
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
          payoutMethod: 'Immediate',
          createdAt: serverTimestamp(),
          createdBy: user.uid,
        });
      }

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
      });
      await fetchRequests();
      setSubmitSuccess('Request submitted successfully!');
    } catch (err) {
      setValidationErrors({ submit: err.message });
    } finally {
      setLoading(false);
      setFileUploading(false);
    }
  };

  const toggleMonth = (monthKey) => {
    setExpandedMonths(prev => ({
      ...prev,
      [monthKey]: !prev[monthKey]
    }));
  };

  const handleNavigate = useCallback((tab, options = {}) => {
    setActiveTab(tab);
    if (options.showRequestModal) {
      setShowRequestModal(true);
    }
  }, []);

  // Render the appropriate view based on activeTab
  const renderView = () => {
    switch (activeTab) {
      case 'attendance':
        return (
          <AttendanceView
            attendanceRows={attendanceRows}
            month={month}
            onSetMonth={setMonth}
            onNavigateBack={() => setActiveTab('dashboard')}
          />
        );
      case 'requests':
        return (
          <RequestsView
            requests={requests}
            expandedMonths={expandedMonths}
            onToggleMonth={toggleMonth}
            onWithdrawRequest={handleWithdraw}
            onShowRequestModal={() => setShowRequestModal(true)}
            onNavigateBack={() => setActiveTab('dashboard')}
          />
        );
      case 'salary':
        return (
          <SalaryView
            employee={employee}
            onNavigateBack={() => setActiveTab('dashboard')}
          />
        );
      case 'profile':
        return (
          <ProfileView
            employee={employee}
            user={user}
            onLogout={logout}
            onNavigateBack={() => setActiveTab('dashboard')}
          />
        );
      case 'dashboard':
      default:
        return (
          <DashboardView
            employee={employee}
            user={user}
            requests={requests}
            todayRecord={todayRecord}
            latestTodayLog={latestTodayLog}
            todayInTime={todayInTime}
            todayOutTime={todayOutTime}
            todayBadge={todayBadge}
            geoContext={geoContext}
            validInLog={validInLog}
            validOutLog={validOutLog}
            onCheckIn={handleCheckIn}
            onCheckOut={handleCheckOut}
            onWithdrawRequest={handleWithdraw}
            onNavigate={handleNavigate}
          />
        );
    }
  };

  // Request Modal (will be extracted in next phase)
  const renderRequestModal = () => {
    const calculateTotalDays = () => {
      if (!requestForm.fromDate || !requestForm.toDate) return 0;
      const start = new Date(requestForm.fromDate);
      const end = new Date(requestForm.toDate);
      const days = differenceInCalendarDays(end, start) + 1;
      return days > 0 ? days : 0;
    };

    const handleFileChange = (e) => {
      const file = e.target.files[0];
      if (file) {
        if (file.size > 2 * 1024 * 1024) {
          setValidationErrors({ attachment: 'File size must be less than 2MB' });
          return;
        }
        const allowedTypes = ['application/pdf', 'image/jpeg', 'image/png', 'image/jpg'];
        if (!allowedTypes.includes(file.type)) {
          setValidationErrors({ attachment: 'Only PDF and images (JPG, PNG) are allowed' });
          return;
        }
        setValidationErrors({ ...validationErrors, attachment: null });
        setRequestForm({ ...requestForm, attachment: file });
      }
    };

    return (
      <Modal
        isOpen={showRequestModal}
        onClose={() => {
          setShowRequestModal(false);
          setValidationErrors({});
          setSubmitSuccess('');
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
                      setRequestForm({ ...requestForm, type });
                      setValidationErrors({});
                      setSubmitSuccess('');
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

            {/* Leave Type */}
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

            {/* Leave Dates */}
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
                        const dateStr = date ? date.toISOString().split('T')[0] : '';
                        setRequestForm({ 
                          ...requestForm, 
                          fromDate: dateStr,
                          toDate: requestForm.toDate || dateStr
                        });
                      }}
                      dateFormat="dd/MM/yyyy"
                      className="w-full px-3 py-3 bg-gray-50 border border-gray-200 rounded-xl text-sm"
                      placeholderText="Select date"
                      minDate={new Date()}
                      filterDate={(date) => date.getDay() !== 0}
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
                      To Date
                    </label>
                    <DatePicker
                      selected={requestForm.toDate ? new Date(requestForm.toDate) : null}
                      onChange={(date) => {
                        const dateStr = date ? date.toISOString().split('T')[0] : '';
                        setRequestForm({ ...requestForm, toDate: dateStr });
                      }}
                      dateFormat="dd/MM/yyyy"
                      className="w-full px-3 py-3 bg-gray-50 border border-gray-200 rounded-xl text-sm"
                      placeholderText="Select date"
                      minDate={requestForm.fromDate ? new Date(requestForm.fromDate) : new Date()}
                      filterDate={(date) => date.getDay() !== 0}
                    />
                  </div>
                </div>
                
                {requestForm.fromDate && requestForm.toDate && (
                  <div className="bg-indigo-50 border border-indigo-200 rounded-xl p-3 flex items-center justify-between">
                    <span className="text-sm font-medium text-indigo-700">Total Days:</span>
                    <span className="text-lg font-bold text-indigo-700">{calculateTotalDays()} day(s)</span>
                  </div>
                )}
              </div>
            )}

            {/* Permission Fields */}
            {requestForm.type === 'Permission' && (
              <div className="space-y-3">
                <div>
                  <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
                    Date
                  </label>
                  <DatePicker
                    selected={requestForm.date ? new Date(requestForm.date) : null}
                    onChange={(date) => {
                      const dateStr = date ? date.toISOString().split('T')[0] : '';
                      setRequestForm({ ...requestForm, date: dateStr });
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
                        setTimePickerMode('fromTime');
                        setShowTimePicker(true);
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
                        setTimePickerMode('toTime');
                        setShowTimePicker(true);
                      }}
                      className="w-full px-3 py-3 bg-gray-50 border border-gray-200 rounded-xl text-sm text-left"
                    >
                      {requestForm.toTime || 'Select time'}
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Advance Fields */}
            {requestForm.type === 'Advance' && (
              <div className="space-y-3">
                <div>
                  <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
                    Request Date
                  </label>
                  <DatePicker
                    selected={requestForm.requestDate ? new Date(requestForm.requestDate) : null}
                    onChange={(date) => {
                      const dateStr = date ? date.toISOString().split('T')[0] : '';
                      setRequestForm({ ...requestForm, requestDate: dateStr });
                    }}
                    dateFormat="dd/MM/yyyy"
                    className="w-full px-3 py-3 bg-gray-50 border border-gray-200 rounded-xl text-sm"
                    placeholderText="Select date"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
                    Amount (\u20b9)
                  </label>
                  <input
                    type="number"
                    value={requestForm.amount}
                    onChange={(e) => setRequestForm({ ...requestForm, amount: e.target.value })}
                    placeholder="Enter amount"
                    className="w-full px-3 py-3 bg-gray-50 border border-gray-200 rounded-xl text-sm"
                  />
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
                        \u20b9{amt}
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
                        e.preventDefault();
                        setRequestForm({ ...requestForm, attachment: null });
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

        {showTimePicker && (
          <div className="absolute inset-0 bg-black/50 flex items-end z-50">
            <div className="bg-white w-full rounded-t-2xl p-4">
              <TimePicker
                value={requestForm[timePickerMode] || ''}
                onChange={(time) => {
                  setRequestForm({ ...requestForm, [timePickerMode]: time });
                  setShowTimePicker(false);
                }}
                onClose={() => setShowTimePicker(false)}
              />
            </div>
          </div>
        )}
      </Modal>
    );
  };

  if (loading && !employee) {
    return (
      <div className="flex-1 flex items-center justify-center bg-white">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col bg-gray-50 h-full">
      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4">
        {renderView()}
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
            const Icon = item.icon;
            const isActive = activeTab === item.id;
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
            );
          })}
        </div>
      </nav>

      {/* Request Modal */}
      {renderRequestModal()}

      {/* Selfie Capture Modal */}
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
          await submitGeoAttendance({ imageBlob: blob, isException: false, exceptionReason: '' });
        }}
      />

      {/* Exception Modal */}
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
  );
}
