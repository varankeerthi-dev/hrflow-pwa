import React, { useState, useEffect, useMemo, useCallback } from 'react'
import { useAuth } from '../../hooks/useAuth'
import { useEmployees } from '../../hooks/useEmployees'
import { useAttendance } from '../../hooks/useAttendance'
import { db, storage, auth, secondaryAuth } from '../../lib/firebase'
import { collection, getDocs, addDoc, updateDoc, doc, getDoc, setDoc, serverTimestamp, deleteDoc, where, query, orderBy, onSnapshot } from 'firebase/firestore'
import { createUserWithEmailAndPassword, updateProfile } from 'firebase/auth'
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage'
import { z } from 'zod'
import { Wallet, Calendar, Plus, Trash2, Edit, Save, X, Paperclip, Eye, FileText, Copy, Share2, Link, GripVertical, Filter, ChevronLeft, ChevronRight, ChevronDown, Check, Search, AtSign, AlertCircle, MapPin, Crosshair, Building2 } from 'lucide-react'
import {
  Avatar as MuiAvatar,
  Box,
  Button as MuiButton,
  Chip,
  FormControl,
  IconButton,
  MenuItem,
  Paper,
  Select as MuiSelect,
  Stack,
  Tab,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Tabs,
  Typography,
} from '@mui/material'
import Spinner from '../ui/Spinner'
import Modal from '../ui/Modal'
import ImageViewer from '../ui/ImageViewer'
import TimePicker from '../ui/TimePicker'
import MapLocationPicker from '../ui/MapLocationPicker'

import SalarySlabSettings from './SalarySlabSettings'
import AllowanceSettings from './AllowanceSettings'
import {
  EMPLOYEE_STATUS_ACTIVE,
  EMPLOYEE_STATUS_OPTIONS,
  getEmployeeStatusBadgeClass,
  getStatusTransitionRequirement,
  isEmployeeActiveStatus,
  normalizeEmployeeStatus,
} from '../../lib/employeeStatus'
import { Table as ReusableTable } from '../table'
import { SubTabsNav } from '../ui/SubTabsNav'

import { formatDateDDMMYYYY } from '../../lib/utils';
import { compressImageToBase64 } from '../../lib/imageUtils';
import { DEFAULT_ATTENDANCE_POLICY, normalizeAttendancePolicy } from '../../lib/attendancePolicy'

/*
 * Mobile Settings visual direction: a calm grouped-list surface based on the supplied
 * reference. Keep this mobile-only; desktop tabs, data flow, and actions stay unchanged.
 */

function getInitials(name) {
  return name?.split(' ').map(n => n[0]).join('').toUpperCase() || '??'
}

function getAvatarColor(id) {
  let hash = 0
  for (let i = 0; i < (id || '').length; i++) hash = id.charCodeAt(i) + ((hash << 5) - hash)
  const h = hash % 360
  return `hsl(${h}, 70%, 50%)`
}

function getTodayDate() {
  return new Date().toISOString().split('T')[0]
}

const bankAccountSchema = z.object({
  bankName: z.string().trim().min(1, 'Bank Name is required'),
  accountNo: z.string().trim().min(1, 'Account Number is required').regex(/^\d+$/, 'Account Number must contain only digits'),
  ifsc: z.string().trim().min(1, 'IFSC Code is required').regex(/^[A-Z]{4}0[A-Z0-9]{6}$/, 'Invalid IFSC Code format (e.g. HDFC0001234)'),
  branchName: z.string().trim().min(1, 'Branch Name is required')
})

const employeeValidationSchema = z.object({
  name: z.string().trim().min(1, 'Name is required'),
  empCode: z.string().trim().optional(),
  personalEmail: z.string().trim().email('Invalid personal email format').or(z.literal('')),
  workEmail: z.string().trim().email('Invalid work email format').or(z.literal('')),
  loginEmailType: z.enum(['personal', 'work']),
  loginEnabled: z.boolean(),
  mobileNo: z.string().trim().optional(),
  officeNo: z.string().trim().optional(),
  personalNo: z.string().trim().optional(),
  aadharNo: z.string().trim().optional(),
  panNo: z.string().trim().optional(),
  drivingLicenseNo: z.string().trim().optional(),
  hasOwnVehicle: z.boolean().optional(),
  withdrawFullSalary: z.boolean().optional(),
  pfNo: z.string().trim().optional(),
  esiNo: z.string().trim().optional(),
  personalBank: z.object({
    accountNo: z.string().trim().optional(),
    ifsc: z.string().trim().optional(),
    bankName: z.string().trim().optional(),
    holderName: z.string().trim().optional(),
  }).optional(),
  companyBank: z.object({
    accountNo: z.string().trim().optional(),
    ifsc: z.string().trim().optional(),
    bankName: z.string().trim().optional(),
    holderName: z.string().trim().optional(),
  }).optional(),
}).refine(data => {
  if (data.loginEnabled) {
    const emailToUse = data.loginEmailType === 'personal' ? data.personalEmail : data.workEmail;
    return emailToUse && emailToUse.trim().length > 0;
  }
  return true;
}, {
  message: 'The selected login email cannot be empty when Login is Enabled.',
  path: ['loginEmailType']
}).refine(data => {
  if (data.loginEnabled) {
    const emailToUse = data.loginEmailType === 'personal' ? data.personalEmail : data.workEmail;
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(emailToUse);
  }
  return true;
}, {
  message: 'The selected login email must be a valid email format.',
  path: ['loginEmailType']
});

const validateEmployeeData = (data) => {
  try {
    employeeValidationSchema.parse(data);
    return { success: true };
  } catch (err) {
    if (err instanceof z.ZodError) {
      const messages = err.errors.map(e => e.message);
      return { success: false, error: messages.join('\n') };
    }
    return { success: false, error: err.message };
  }
};

function createEmployeeFormState() {
  return {
    name: '',
    empCode: '',
    designation: '',
    department: '',
    shiftId: '',
    minDailyHoursCategory: '',
    site: '',
    siteId: '', // Added for Geo-fencing
    employmentType: 'Full-time',
    monthlySalary: 0,
    status: EMPLOYEE_STATUS_ACTIVE,
    joinedDate: '',
    activeFrom: '',
    inactiveFrom: '',
    rejoinDate: '',
    statusHistory: [],
    bloodGroup: '',
    dob: '',
    fatherName: '',
    motherName: '',
    maritalStatus: '',
    email: '',
    personalEmail: '',
    workEmail: '',
    loginEmailType: 'work',
    emergencyContact: '',
    contactNo: '',
    mobileNo: '',
    officeNo: '',
    personalNo: '',
    aadharNo: '',
    panNo: '',
    drivingLicenseNo: '',
    hasOwnVehicle: false,
    withdrawFullSalary: false,
    pfNo: '',
    esiNo: '',
    address: '',
    bankAccount: '',
    personalBank: { accountNo: '', ifsc: '', bankName: '', holderName: '' },
    companyBank: { accountNo: '', ifsc: '', bankName: '', holderName: '' },
    photoURL: '',
    permissionHours: 2,
    documents: [],
    role: 'Employee',
    reportingManager: '',
    loginEnabled: false,
    tempPassword: '',
    minDailyHours: 8,
    hideInAttendance: false,
    includeInSalary: true,
    includeInTask: true,
    regularInTime: '',
    regularOutTime: '',
  }
}

const interMuiSx = {
  fontFamily: '"Inter", sans-serif',
}

const settingsTableContainerSx = {
  borderRadius: 4,
  border: '1px solid #e5e7eb',
  boxShadow: '0 18px 40px rgba(15, 23, 42, 0.06)',
  overflow: 'hidden',
  ...interMuiSx,
}

const settingsTableHeadCellSx = {
  ...interMuiSx,
  borderBottom: '1px solid #e5e7eb',
  color: '#64748b',
  fontSize: '0.68rem',
  fontWeight: 800,
  letterSpacing: '0.14em',
  textTransform: 'uppercase',
  backgroundColor: '#f8fafc',
}

const settingsTableBodyCellSx = {
  ...interMuiSx,
  borderBottom: '1px solid #eef2f7',
  color: '#0f172a',
  fontSize: '0.82rem',
}

const stripedRowSx = {
  '&:nth-of-type(odd)': {
    backgroundColor: '#ffffff',
  },
  '&:nth-of-type(even)': {
    backgroundColor: '#f8fafc',
  },
  '&:hover': {
    backgroundColor: '#eef4ff',
  },
}

const settingsPanelClassName = 'rounded-xl border border-slate-200/80 bg-white shadow-[0_24px_80px_rgba(15,23,42,0.08)]'
const settingsInsetPanelClassName = 'rounded-lg border border-slate-200 bg-slate-50/70'
const settingsInputClassName = 'w-full h-11 rounded-lg border border-slate-200 bg-white px-4 text-[13px] text-slate-800 outline-none transition-all placeholder:text-slate-400 focus:border-indigo-400 focus:ring-4 focus:ring-indigo-100'
const settingsTextareaClassName = 'w-full rounded-lg border border-slate-200 bg-white px-4 py-3 text-[13px] text-slate-800 outline-none transition-all placeholder:text-slate-400 focus:border-indigo-400 focus:ring-4 focus:ring-indigo-100 resize-none'
const settingsSectionLabelClassName = 'mb-2 block text-[11px] font-semibold uppercase tracking-[0.14em] leading-tight text-slate-700'
const settingsSubTabMeta = {
  organization: {
    title: 'Organization Control Center',
    description: 'Maintain company identity, hierarchy, banking details, and invite access from one polished workspace.',
    kicker: '',
    pill: 'Core profile',
  },
  employee: {
    title: 'Employee Directory',
    description: 'Search, review, and maintain your workforce records with a cleaner management surface.',
    kicker: '',
    pill: 'Directory',
  },
  user_roles: {
    title: 'Users & Roles',
    description: 'Control product access, assign ownership, and manage linked user identities without friction.',
    kicker: '',
    pill: 'Security',
  },
  shift: {
    title: 'Shifts & Work Rules',
    description: 'Keep attendance logic clear with readable shift tables and minimum-hour definitions.',
    kicker: '',
    pill: 'Scheduling',
  },
  salary: {
    title: 'Salary Slab Settings',
    description: 'Configure payroll structures, increment history, and release windows in a focused flow.',
    kicker: '',
    pill: 'Compensation',
  },
  advance_cat: {
    title: 'Advance Categories',
    description: 'Organize request types with quick inline editing instead of interruptive prompts.',
    kicker: '',
    pill: 'Categories',
  },
  holidays: {
    title: 'Holiday Calendar',
    description: 'Manage annual holidays with a simple, legible layout that is easy to update and review.',
    kicker: '',
    pill: 'Time off',
  },
  site_geofence: {
    title: 'Site Geofencing',
    description: 'Configure site coordinates and proximity radius to control where attendance can be captured.',
    kicker: '',
    pill: 'Geofence',
  },
  approval_settings: {
    title: 'Approval Workflows',
    description: 'Tune request approvals with clearer staging, stronger hierarchy, and easier decision visibility.',
    kicker: '',
    pill: 'Approvals',
  },
  allowance: {
    title: 'Allowance Settings',
    description: 'Create rule-based allowances (food, tea, travel, night shift) and assign them to employees.',
    kicker: '',
    pill: 'Allowances',
  },
  policy: {
    title: 'Attendance Policy',
    description: 'Define Full Day thresholds, arrival grace, and late-penalty behavior with safe defaults.',
    kicker: '',
    pill: 'Attendance rules',
  },
}

const mobileSettingsItemMeta = {
  organization: { group: 'General', title: 'Organization', detail: 'Company profile, branches and bank accounts', icon: Building2 },
  user_roles: { group: 'General', title: 'Users & Roles', detail: 'People, access and permissions', icon: AtSign },
  shift: { group: 'General', title: 'Shifts', detail: 'Working hours and shift setup', icon: Calendar },
  salary: { group: 'General', title: 'Salary Slab', detail: 'Payroll structures and salary rules', icon: Wallet },
  policy: { group: 'General', title: 'Policy', detail: 'Full Day, grace and late rules', icon: AlertCircle },
  advance_cat: { group: 'Others', title: 'Advance Categories', detail: 'Advance and expense request types', icon: Wallet },
  holidays: { group: 'Others', title: 'Holidays', detail: 'Holiday calendar and weekly offs', icon: Calendar },
  site_geofence: { group: 'Others', title: 'Site Geofence', detail: 'Attendance locations and radius', icon: MapPin },
  approval_settings: { group: 'Others', title: 'Approval Settings', detail: 'Approval stages and workflows', icon: Check },
  allowance: { group: 'Others', title: 'Allowance Settings', detail: 'Food, travel and shift allowances', icon: Wallet },
}

const mobileSettingsGroups = ['General', 'Others']

export default function SettingsTab({ initialSubTab }) {
  const { user } = useAuth()
  const { employees, loading: empLoading, updateEmployee, addEmployee, deleteEmployee } = useEmployees(user?.orgId)
  const { recalculateOTForEmployee } = useAttendance(user?.orgId)
  const [activeSubTab, setActiveSubTab] = useState(initialSubTab || 'organization')
  const [showMobileSettingsIndex, setShowMobileSettingsIndex] = useState(!initialSubTab)
  const [users, setUsers] = useState([])
  const [roles, setRoles] = useState([])
  const [activeUserRoleSubTab, setActiveUserRoleSubTab] = useState('users')
  const [loading, setLoading] = useState(true)
  const [editingEmp, setEditingEmp] = useState(null)
  const [editForm, setEditForm] = useState({})
  const [editOriginalStatus, setEditOriginalStatus] = useState(EMPLOYEE_STATUS_ACTIVE)
  const [editStatusTransition, setEditStatusTransition] = useState(null)
  const [showAddShift, setShowAddShift] = useState(false)
  const [editingShift, setEditingShift] = useState(null)
  const [shifts, setShifts] = useState([])
  const [minWorkHours, setMinWorkHours] = useState([])
  const [showAddMinWorkHours, setShowAddMinWorkHours] = useState(false)
  const [editingMinWorkHours, setEditingMinWorkHours] = useState(null)
  const [showAddEmployee, setShowAddEmployee] = useState(false)
  const [showAddRole, setShowAddRole] = useState(false)
  const [editingRole, setEditingRole] = useState(null)
  const [showRowOrder, setShowRowOrder] = useState(false)
  const [rowOrder, setRowOrder] = useState([])
  const [draggedRowItem, setDraggedRowItem] = useState(null)
  const [showPreview, setShowPreview] = useState(false)
  const [previewEmpIndex, setPreviewEmpIndex] = useState(0)
  const [showInvitePage, setShowInvitePage] = useState(false)
  const [seeding, setSeeding] = useState(false)
  const [approvalSettings, setApprovalSettings] = useState([])
  const [showAddApproval, setShowAddApproval] = useState(false)
  const [editingApproval, setEditingApproval] = useState(null)
  const [newApproval, setNewApproval] = useState({
    moduleName: 'Leave',
    type: 'single',
    approvers: [], // Array of role names or user IDs
    stages: [
      { role: '', amountLimit: '' }
    ]
  })

  const isAdmin = user?.role?.toLowerCase() === 'admin'
  const userPermissions = useMemo(() => user?.permissions || {}, [user?.permissions])
  const allSubTabs = [
    { id: 'organization', label: 'Organization', module: 'Settings' },
    { id: 'user_roles', label: 'Users & Roles', module: 'Roles' },
    { id: 'shift', label: 'Shifts', module: 'Shifts' },
    { id: 'salary', label: 'Salary Slab', module: 'SalarySlip' },
    { id: 'advance_cat', label: 'Advance Categories', module: 'AdvanceExpense' },
    { id: 'holidays', label: 'Holidays', module: 'Settings' },
    { id: 'site_geofence', label: 'Site Geofence', module: 'Settings' },
    { id: 'approval_settings', label: 'Approval Settings', module: 'Settings' },
    { id: 'allowance', label: 'Allowance Settings', module: 'Settings' },
    { id: 'policy', label: 'Policy', module: 'Settings' }
  ]

  const visibleSubTabs = useMemo(() => {
    const isUserAdmin = user?.role?.toLowerCase() === 'admin'
    return allSubTabs.filter(t => {
      if (t.id === 'user_roles') return isUserAdmin
      if (isUserAdmin) return true
      return userPermissions[t.module]?.view === true
    })
  }, [allSubTabs, user?.role, userPermissions])

  useEffect(() => {
    const isUserAdmin = user?.role?.toLowerCase() === 'admin'
    if (activeSubTab === 'user_roles' && !isUserAdmin) {
      setActiveSubTab('organization')
    }
    if (!initialSubTab && !visibleSubTabs.find(t => t.id === activeSubTab) && visibleSubTabs.length > 0) {
      setActiveSubTab(visibleSubTabs[0].id)
    }
  }, [user, initialSubTab, activeSubTab, visibleSubTabs])

  useEffect(() => {
    setShowMobileSettingsIndex(!initialSubTab)
  }, [initialSubTab])

  const [newShift, setNewShift] = useState({ name: '', type: 'Day', startTime: '09:00', endTime: '18:00', workHours: 9, isFlexible: false })
  const [showStartTimePicker, setShowStartTimePicker] = useState(false)
  const [showEndTimePicker, setShowEndTimePicker] = useState(false)
  const [newMinWorkHours, setNewMinWorkHours] = useState({ name: '', hours: 8, description: '' })
  const [newEmployee, setNewEmployee] = useState(createEmployeeFormState())
  const [formErrors, setFormErrors] = useState({})
  const [collapsedSections, setCollapsedSections] = useState({})
  const toggleSection = (name) => setCollapsedSections(prev => ({ ...prev, [name]: !prev[name] }))
  const [newDocUpload, setNewDocUpload] = useState({ name: '', file: null, uploading: false })
  const [viewerState, setViewerState] = useState(null) // { docs, index }
  const [newRole, setNewRole] = useState({ 
    name: '', 
    description: '', 
    isAccountant: false,
    permissions: { Tasks: { view: true } } 
  })
  const [orgSettings, setOrgSettings] = useState({
    name: '', email: '', address: '', gstin: '', hierarchy: '', branches: '', bankAccounts: [], code: '', shiftStrategy: 'Day', logoURL: '',
    advanceCategories: ['Salary Advance', 'Travel', 'Medical'],
    holidays: [],
    saturdayType: 'working', // 'working' | 'holiday1x' | 'holiday2x' | 'alternative'
    sundayType: 'working', // 'working' | 'holiday1x' | 'holiday2x' | 'alternative'
    remarksOptions: [],
    newRemarkOption: '',
    maxAdvanceAmount: '',
    expenseCategoryLimits: {},
    attendancePolicy: normalizeAttendancePolicy(DEFAULT_ATTENDANCE_POLICY)
  })
  const [newBankAccount, setNewBankAccount] = useState({
    bankName: '',
    accountNo: '',
    ifsc: '',
    branchName: ''
  })
  const [bankAccountError, setBankAccountError] = useState('')
  const [sites, setSites] = useState([])
  const [editingSiteId, setEditingSiteId] = useState(null)
  const [siteForm, setSiteForm] = useState({
    siteName: '',
    latitude: '',
    longitude: '',
    radiusMeters: 500,
    notes: '',
    active: true,
  })
  const [siteSearchQuery, setSiteSearchQuery] = useState('')
  const [siteSearchResults, setSiteSearchResults] = useState([])
  const [siteSearchLoading, setSiteSearchLoading] = useState(false)
  const [siteGeoLocating, setSiteGeoLocating] = useState(false)
  const [newAdvanceCategory, setNewAdvanceCategory] = useState('')
  const [newHoliday, setNewHoliday] = useState({ name: '', date: '' })

  const [isJoinDateConfirmOpen, setIsJoinDateConfirmOpen] = useState(false)
  const [pendingJoinDate, setPendingJoinDate] = useState('')
  const [isJoinDateConfirmed, setIsJoinDateConfirmed] = useState(false)
  const [joinDateContext, setJoinDateContext] = useState(null) // 'add' or 'edit'

  const JoinDateConfirmationModal = () => {
    if (!isJoinDateConfirmOpen) return null

    return (
      <div className="fixed inset-0 z-[1100] flex items-center justify-center bg-black/40 backdrop-blur-[2px] p-4">
        <div className="bg-white rounded-xl shadow-2xl w-full max-w-md overflow-hidden border border-slate-200">
          <div className="p-6 border-b border-slate-100 flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-amber-100 flex items-center justify-center text-amber-600 shrink-0">
              <Calendar size={20} />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900 tracking-tight">Confirm Joining Date</h3>
              <p className="text-xs text-slate-500 font-medium">Critical payroll data verification</p>
            </div>
          </div>
          
          <div className="p-6 space-y-4">
            <div className="p-4 bg-slate-50 rounded-lg border border-slate-100">
              <p className="text-[13px] text-slate-600 leading-relaxed">
                You have selected <span className="font-bold text-slate-900">{formatDateDDMMYYYY(pendingJoinDate)}</span> as the joining date. 
                <br /><br />
                <span className="font-semibold text-indigo-600">Why this matters:</span> The system will automatically skip paying Sundays and Holidays occurring <span className="underline italic">before</span> this date.
              </p>
            </div>

            <label className="flex items-start gap-3 cursor-pointer group">
              <div className="mt-0.5">
                <input 
                  type="checkbox" 
                  checked={isJoinDateConfirmed}
                  onChange={(e) => setIsJoinDateConfirmed(e.target.checked)}
                  className="w-4 h-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                />
              </div>
              <span className="text-xs font-semibold text-slate-700 group-hover:text-slate-900 transition-colors">
                I confirm that this joining date is accurate and understand its impact on payroll calculations.
              </span>
            </label>
          </div>

          <div className="p-4 bg-slate-50 border-t border-slate-100 flex justify-end gap-3">
            <button 
              onClick={() => {
                setIsJoinDateConfirmOpen(false)
                setIsJoinDateConfirmed(false)
                setPendingJoinDate('')
              }}
              className="px-4 py-2 text-xs font-bold uppercase tracking-widest text-slate-500 hover:bg-slate-100 rounded-lg transition-all"
            >
              Cancel
            </button>
            <button 
              disabled={!isJoinDateConfirmed}
              onClick={() => {
                if (joinDateContext === 'add') {
                  handleAddEmployee(true)
                } else if (joinDateContext === 'edit') {
                  handleSaveEmployee(true)
                }
                setIsJoinDateConfirmOpen(false)
                setIsJoinDateConfirmed(false)
                setPendingJoinDate('')
              }}
              className="px-6 py-2 bg-indigo-600 text-white text-xs font-black uppercase tracking-widest rounded-lg shadow-lg shadow-indigo-600/20 hover:bg-indigo-700 disabled:opacity-50 transition-all active:scale-95"
            >
              Confirm & Save Date
            </button>
          </div>
        </div>
      </div>
    )
  }

  const [saving, setSaving] = useState(false)
  const [uploadingLogo, setUploadingLogo] = useState(false)
  const [logoError, setLogoError] = useState(false)
  const [saved, setSaved] = useState(false)
  const [orgError, setOrgError] = useState('')
  const [employeeDirectorySearch, setEmployeeDirectorySearch] = useState('')
  const [employeeDirectoryStatus, setEmployeeDirectoryStatus] = useState('All')
  const [employeeDirectoryPage, setEmployeeDirectoryPage] = useState(1)
  const [employeeDirectoryPageSize, setEmployeeDirectoryPageSize] = useState(10)
  const [employeeDirectorySelectedIds, setEmployeeDirectorySelectedIds] = useState(new Set())
  const [employeeDirectoryHiddenColumns, setEmployeeDirectoryHiddenColumns] = useState([])

  const canCreateEmployee = useMemo(() => isAdmin || userPermissions['Employees']?.create === true, [isAdmin, userPermissions])
  const canEditEmployee = useMemo(() => isAdmin || userPermissions['Employees']?.edit === true, [isAdmin, userPermissions])
  const canDeleteEmployee = useMemo(() => isAdmin || userPermissions['Employees']?.delete === true, [isAdmin, userPermissions])

  const departmentPalette = [
    'bg-violet-50 text-violet-700',
    'bg-emerald-50 text-emerald-700',
    'bg-amber-50 text-amber-700',
    'bg-sky-50 text-sky-700',
    'bg-rose-50 text-rose-700',
    'bg-indigo-50 text-indigo-700',
  ]
  const departmentLookup = useMemo(() => [...new Set(employees.map(emp => emp.department).filter(Boolean))], [employees])

  const employeeColumns = useMemo(() => [
    {
      header: 'Employee ID',
      accessorKey: 'empCode',
      id: 'empCode',
      type: 'text',
      align: 'left',
      cell: ({ row }) => row.empCode || `EMP-${row.id.slice(-4).toUpperCase()}`,
    },
    {
      header: 'Employee Name',
      accessorKey: 'name',
      id: 'name',
      type: 'text',
      align: 'left',
      cell: ({ row }) => (
        <button
          onClick={() => {
            if (!canEditEmployee) return
            openEmployeeEditor(row)
          }}
          className={`flex items-center gap-3 text-left ${canEditEmployee ? '' : 'cursor-default'}`}
        >
          <div className="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-full text-[11px] font-bold text-white" style={{ backgroundColor: getAvatarColor(row.id) }}>
            {row.photoURL ? <img src={row.photoURL} className="h-full w-full object-cover" alt="" /> : getInitials(row.name)}
          </div>
          <div className="min-w-0">
            <p className="truncate text-[12px] font-semibold text-zinc-800">{row.name}</p>
            <p className="truncate text-[11px] text-zinc-400">{row.email || 'No email added'}</p>
          </div>
        </button>
      ),
    },
    {
      header: 'Department',
      accessorKey: 'department',
      id: 'department',
      type: 'text',
      align: 'left',
      cell: ({ row }) => {
        const deptColor = row.department
          ? (departmentPalette[departmentLookup.indexOf(row.department) % departmentPalette.length] || 'bg-zinc-100 text-zinc-600')
          : 'bg-zinc-100 text-zinc-500'
        return row.department ? (
          <span className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold ${deptColor}`}>{row.department}</span>
        ) : (
          <span className="text-[11px] text-zinc-300">—</span>
        )
      },
    },
    {
      header: 'Designation',
      accessorKey: 'designation',
      id: 'designation',
      type: 'text',
      align: 'left',
      cell: ({ row }) => row.designation || 'Unassigned',
    },
    {
      header: 'Status',
      accessorKey: 'status',
      id: 'status',
      type: 'status',
      align: 'center',
      statusType: (row) => {
        const normalizedStatus = normalizeEmployeeStatus(row.status)
        return normalizedStatus === 'Inactive' ? 'error' : normalizedStatus === 'Rejoined' ? 'warning' : 'success'
      },
      cell: ({ row }) => {
        const normalizedStatus = normalizeEmployeeStatus(row.status)
        const statusTone =
          normalizedStatus === 'Inactive'
            ? { dot: 'bg-rose-500', text: 'text-rose-600' }
            : normalizedStatus === 'Rejoined'
              ? { dot: 'bg-amber-500', text: 'text-amber-600' }
              : { dot: 'bg-emerald-500', text: 'text-emerald-600' }
        return (
          <span className={`inline-flex items-center gap-2 text-[11px] font-semibold ${statusTone.text}`}>
            <span className={`h-2 w-2 rounded-full ${statusTone.dot}`} />
            {normalizedStatus || 'Active'}
          </span>
        )
      },
    },
    {
      header: 'Join Date',
      accessorKey: 'joinedDate',
      id: 'joinedDate',
      type: 'date',
      align: 'left',
      cell: ({ row }) => formatDateDDMMYYYY(row.joinedDate || row.doj),
    },
    {
      header: 'Site',
      accessorKey: 'site',
      id: 'site',
      type: 'text',
      align: 'left',
      cell: ({ row }) => row.site || '—',
    },
    {
      header: 'Contact',
      accessorKey: 'emergencyContact',
      id: 'emergencyContact',
      type: 'text',
      align: 'left',
      cell: ({ row }) => row.emergencyContact || '—',
    },
  ], [canEditEmployee, departmentLookup])

  const getRowActions = useCallback((row) => {
    const actions = []
    
    if (row.documents?.length) {
      actions.push({
        label: 'View Documents',
        icon: <Eye size={14} />,
        onClick: () => setViewerState({ docs: row.documents, index: 0 })
      })
    }

    actions.push({
      label: 'Edit Employee',
      icon: <Edit size={14} />,
      onClick: () => openEmployeeEditor(row)
    })

    if (canDeleteEmployee) {
      actions.push({
        label: 'Delete Employee',
        icon: <Trash2 size={14} />,
        variant: 'danger',
        onClick: () => {
          if (confirm(`Are you sure you want to delete ${row.name}? This action cannot be undone.`)) {
            deleteEmployee(row.id)
          }
        }
      })
    }

    return actions
  }, [canDeleteEmployee, deleteEmployee])

  const bulkActions = useMemo(() => [
    {
      label: 'Mark as Active',
      icon: <Check size={14} />,
      onClick: (rows) => {
        if (confirm(`Change status of ${rows.length} employees to Active?`)) {
          rows.forEach(r => updateEmployee(r.id, { status: 'Active' }))
          setEmployeeDirectorySelectedIds(new Set())
        }
      }
    },
    {
      label: 'Mark as Inactive',
      icon: <X size={14} />,
      onClick: async (rows) => {
        if (!user?.orgId) return
        // Check for outstanding advances for each employee
        const warnings = []
        for (const r of rows) {
          try {
            const q = query(
              collection(db, 'organisations', user.orgId, 'advances_expenses'),
              where('employeeId', '==', r.id),
              where('type', '==', 'Advance'),
              where('paymentStatus', '!=', 'Paid')
            )
            const snap = await getDocs(q)
            let outstanding = 0
            snap.forEach(d => {
              const data = d.data()
              outstanding += parseFloat(data.amount) || 0
            })
            if (outstanding > 0) {
              warnings.push(`${r.name}: ₹${new Intl.NumberFormat('en-IN', { minimumFractionDigits: 2 }).format(outstanding)} outstanding`)
            }
          } catch (err) {
            console.error('Error checking advances for', r.name, err)
          }
        }
        
        let message = `Change status of ${rows.length} employees to Inactive?`
        if (warnings.length > 0) {
          message += `\n\n⚠️ Outstanding advances:\n${warnings.join('\n')}\n\nProceed anyway?`
        }
        
        if (confirm(message)) {
          rows.forEach(r => updateEmployee(r.id, { status: 'Inactive' }))
          setEmployeeDirectorySelectedIds(new Set())
        }
      }
    },
    {
      label: 'Delete',
      icon: <Trash2 size={14} />,
      variant: 'danger',
      onClick: (rows) => {
        if (confirm(`Are you sure you want to delete ${rows.length} employees? This action cannot be undone.`)) {
          rows.forEach(r => deleteEmployee(r.id))
          setEmployeeDirectorySelectedIds(new Set())
        }
      }
    }
  ], [updateEmployee, deleteEmployee])

  // Roster Columns - Name, Designation, Contact mandatory; rest user-configurable
  const mandatoryColumns = ['name', 'designation', 'emergencyContact']
  const [visibleColumns, setVisibleColumns] = useState(['name', 'designation', 'emergencyContact', 'status'])
  const allColumns = [
    { label: 'Photo', key: 'photo', optional: true },
    { label: 'Name', key: 'name', optional: false },
    { label: 'Designation', key: 'designation', optional: false },
    { label: 'Contact No', key: 'emergencyContact', optional: false },
    { label: 'Emp Code', key: 'empCode', optional: true },
    { label: 'Department', key: 'department', optional: true },
    { label: 'Email', key: 'email', optional: true },
    { label: 'Shift', key: 'shift', optional: true },
    { label: 'Site', key: 'site', optional: true },
    { label: 'Bank Account', key: 'bankAccount', optional: true },
    { label: 'Status', key: 'status', optional: true },
    { label: 'Join Date', key: 'joinedDate', optional: true },
    { label: 'Blood Group', key: 'bloodGroup', optional: true },
    { label: 'Date of Birth', key: 'dob', optional: true },
    { label: 'Marital Status', key: 'maritalStatus', optional: true },
  ]

  // All modules including future modules for dynamic RBAC
  const allModulesList = [
    // HRMS
    { id: 'Attendance', label: 'Attendance', group: 'HRMS' },
    { id: 'Correction', label: 'Correction', group: 'HRMS' },
    { id: 'Leave', label: 'Leave', group: 'HRMS' },
    { id: 'Approvals', label: 'Approvals', group: 'HRMS' },
    { id: 'Summary', label: 'Summary', group: 'HRMS' },
    { id: 'HRLetters', label: 'HR Letters', group: 'HRMS' },
    // Payroll
    { id: 'SalarySlip', label: 'Salary Slip', group: 'Payroll' },
    { id: 'AdvanceExpense', label: 'Advance / Expense', group: 'Payroll' },
    { id: 'Fine', label: 'Fine Tab', group: 'Payroll' },
    // Engage
    { id: 'Engagement', label: 'Engagement', group: 'Engage' },
    { id: 'Birthday', label: 'Birthday', group: 'Engage' },
    // System
    { id: 'EmployeePortal', label: 'Self Service', group: 'System' },
    { id: 'Settings', label: 'Settings', group: 'System' },
    { id: 'Employees', label: 'Employees', group: 'System' },
    { id: 'Roles', label: 'Roles', group: 'System' },
    { id: 'Shifts', label: 'Shifts', group: 'System' },
    { id: 'Tasks', label: 'Tasks', group: 'Engage' },
    // Future Modules
    { id: 'Recruitment', label: 'Recruitment', group: 'Future' },
    { id: 'AssetManagement', label: 'Asset Management', group: 'Future' },
    { id: 'PerformanceReview', label: 'Performance Review', group: 'Future' },
    { id: 'Training', label: 'Training', group: 'Future' },
    { id: 'ExitManagement', label: 'Exit Management', group: 'Future' },
    { id: 'DocumentManagement', label: 'Document Management', group: 'Future' },
    { id: 'Helpdesk', label: 'Helpdesk', group: 'Future' },
    { id: 'Projects', label: 'Projects', group: 'Future' },
    { id: 'TimeTracking', label: 'Time Tracking', group: 'Future' },
  ]

  const modules = allModulesList.map(m => m.id)

  // Group modules by category for display
  const moduleGroups = allModulesList.reduce((acc, mod) => {
    if (!acc[mod.group]) acc[mod.group] = []
    acc[mod.group].push(mod)
    return acc
  }, {})

  const permissionRights = ['view', 'create', 'edit', 'delete', 'approve', 'export']
  const roleMatrixActions = permissionRights.filter(action => action !== 'export')

  // Role Groups & Rights
  const roleGroups = []

  const seedDefaultRoles = async (silent = false) => {
    if (!user?.orgId) return
    setSeeding(true)
    try {
      const defaultRoles = [
        {
          name: 'Admin',
          description: 'Full access to all modules and settings.',
          permissions: allModulesList.reduce((acc, mod) => {
            acc[mod.id] = { view: true, create: true, edit: true, delete: true, approve: true, export: true, full: true }
            return acc
          }, {})
        },
        {
          name: 'Accountant',
          description: 'Access to payroll, expenses, and financial reports.',
          isAccountant: true,
          permissions: allModulesList.reduce((acc, mod) => {
            const isPayroll = mod.group === 'Payroll'
            const isHRMS = ['Attendance', 'Leave', 'Summary'].includes(mod.id)
            const isDefault = mod.id === 'Tasks'
            acc[mod.id] = { 
              view: isPayroll || isHRMS || isDefault, 
              create: isPayroll, 
              edit: isPayroll, 
              delete: false, 
              approve: isPayroll, 
              export: isPayroll 
            }
            return acc
          }, {})
        },
        {
          name: 'Employee',
          description: 'Standard employee access to self-service portal.',
          permissions: allModulesList.reduce((acc, mod) => {
            const isPortal = mod.id === 'EmployeePortal'
            const isDefault = mod.id === 'Tasks'
            acc[mod.id] = { 
              view: isPortal || isDefault, 
              create: false, 
              edit: false, 
              delete: false, 
              approve: false, 
              export: false 
            }
            return acc
          }, {})
        },
        {
          name: 'Technician',
          description: 'Access to projects, time tracking, and assets.',
          permissions: allModulesList.reduce((acc, mod) => {
            const isTech = ['Projects', 'TimeTracking', 'AssetManagement', 'EmployeePortal', 'Tasks'].includes(mod.id)
            acc[mod.id] = { view: isTech, create: isTech, edit: isTech, delete: false, approve: false, export: false }
            return acc
          }, {})
        }
      ]

      for (const role of defaultRoles) {
        const roleQuery = query(collection(db, 'organisations', user.orgId, 'roles'), where('name', '==', role.name))
        const existing = await getDocs(roleQuery)
        if (existing.empty) {
          await addDoc(collection(db, 'organisations', user.orgId, 'roles'), {
            ...role,
            createdAt: serverTimestamp()
          })
        } else {
          await updateDoc(doc(db, 'organisations', user.orgId, 'roles', existing.docs[0].id), {
            ...role,
            updatedAt: serverTimestamp()
          })
        }
      }

      const rolesSnap = await getDocs(collection(db, 'organisations', user.orgId, 'roles'))
      setRoles(rolesSnap.docs.map(d => ({ id: d.id, ...d.data() })) || [])
      
      if (!silent) {
        alert('Default roles (Admin, Accountant, Employee, Technician) created/updated successfully!')
      }
    } catch (err) {
      console.error('Seed roles error:', err)
      if (!silent) {
        alert('Failed to seed roles: ' + err.message)
      }
    } finally {
      setSeeding(false)
    }
  }

  const seedDefaultMinWorkHours = async (silent = false) => {
    if (!user?.orgId) return
    setSeeding(true)
    try {
      const defaultMinWorkHours = [
        { name: 'Staff', hours: 8, description: 'Staff Minimum Working Hours' },
        { name: 'Technician', hours: 9, description: 'Technician Minimum Working Hours' },
        { name: 'Manager', hours: 9, description: 'Manager Minimum Working Hours' }
      ]

      for (const mwh of defaultMinWorkHours) {
        const mwhQuery = query(collection(db, 'organisations', user.orgId, 'minWorkHours'), where('name', '==', mwh.name))
        const existing = await getDocs(mwhQuery)
        if (existing.empty) {
          await addDoc(collection(db, 'organisations', user.orgId, 'minWorkHours'), {
            ...mwh,
            createdAt: serverTimestamp()
          })
        }
      }

      const mwhSnap = await getDocs(collection(db, 'organisations', user.orgId, 'minWorkHours'))
      setMinWorkHours(mwhSnap.docs.map(d => ({ id: d.id, ...d.data() })) || [])

      if (!silent) {
        alert('Minimum work hours categories created successfully!')
      }
    } catch (err) {
      console.error('Seed min work hours error:', err)
      if (!silent) {
        alert('Failed to create minimum work hours: ' + err.message)
      }
    } finally {
      setSeeding(false)
    }
  }

  const handleAddMinWorkHours = async () => {
    if (!newMinWorkHours.name.trim() || !newMinWorkHours.hours) return alert('Name and hours are required')
    if (!user?.orgId) return
    try {
      if (editingMinWorkHours) {
        await updateDoc(doc(db, 'organisations', user.orgId, 'minWorkHours', editingMinWorkHours.id), {
          ...newMinWorkHours,
          updatedAt: serverTimestamp()
        })
        setMinWorkHours(prev => prev.map(m => m.id === editingMinWorkHours.id ? { ...m, ...newMinWorkHours } : m))
      } else {
        const docRef = await addDoc(collection(db, 'organisations', user.orgId, 'minWorkHours'), {
          ...newMinWorkHours,
          createdAt: serverTimestamp()
        })
        setMinWorkHours(prev => [...prev, { id: docRef.id, ...newMinWorkHours }])
      }
      setShowAddMinWorkHours(false)
      setEditingMinWorkHours(null)
      setNewMinWorkHours({ name: '', hours: 8, description: '' })
    } catch (err) {
      console.error('Add min work hours error:', err)
      alert('Failed to save: ' + err.message)
    }
  }

  useEffect(() => {
    if (!user?.orgId) return
    const fetchData = async () => {
      setLoading(true)
      try {
        const shiftsSnap = await getDocs(collection(db, 'organisations', user.orgId, 'shifts'))
        setShifts(shiftsSnap.docs.map(d => ({ id: d.id, ...d.data() })))

        // Fetch Minimum Work Hours
        const minWorkHoursSnap = await getDocs(collection(db, 'organisations', user.orgId, 'minWorkHours'))
        const fetchedMinWorkHours = minWorkHoursSnap.docs.map(d => ({ id: d.id, ...d.data() })) || []
        setMinWorkHours(fetchedMinWorkHours)

        // Auto-seed default minimum work hours if none exist
        if (fetchedMinWorkHours.length === 0) {
          await seedDefaultMinWorkHours(true)
        }

        // Fetch Users belonging to this org
        const usersQuery = query(collection(db, 'users'), where('orgId', '==', user.orgId))
        const usersSnap = await getDocs(usersQuery)
        setUsers(usersSnap.docs.map(d => ({ id: d.id, ...d.data() })))

        const orgSnap = await getDoc(doc(db, 'organisations', user.orgId))
        if (orgSnap.exists()) {
          const data = orgSnap.data()
          setOrgSettings(prev => ({
            ...prev,
            ...data,
            name: data.name || user?.orgName || prev.name || '',
            code: data.code || orgSnap.id,
            advanceCategories: data.advanceCategories || prev.advanceCategories,
            holidays: data.holidays || prev.holidays,
            bankAccounts: Array.isArray(data.bankAccounts) ? data.bankAccounts : []
            ,attendancePolicy: normalizeAttendancePolicy(data.attendancePolicy)
          }))
        } else {
          // If no org doc exists, use user.orgName as fallback
          setOrgSettings(prev => ({
            ...prev,
            name: user?.orgName || ''
          }))
        }
      } catch (err) {
        console.error('Fetch error:', err)
      } finally {
        setLoading(false)
      }
    }
    fetchData()
  }, [user?.orgId])

  useEffect(() => {
    if (!user?.orgId) return
    const rolesQuery = collection(db, 'organisations', user.orgId, 'roles')
    const unsubscribe = onSnapshot(rolesQuery, (snapshot) => {
      const fetchedRoles = snapshot.docs.map(d => ({ id: d.id, ...d.data() })) || []
      setRoles(fetchedRoles)
      
      // Auto-seed default roles if none exist
      if (fetchedRoles.length === 0) {
        seedDefaultRoles(true)
      }
    }, (err) => {
      console.error('Roles subscription error:', err)
    })
    return () => unsubscribe()
  }, [user?.orgId])

  useEffect(() => {
    if (!user?.orgId) return
    getDoc(doc(db, 'organisations', user.orgId)).then(snap => {
      if (snap.exists() && snap.data().employeeRowOrder) {
        setRowOrder(snap.data().employeeRowOrder)
      } else {
        setRowOrder(employees.map(e => e.id))
      }
    })
  }, [user?.orgId, employees])

  const saveRowOrder = async () => {
    if (!user?.orgId) return
    try {
      await setDoc(doc(db, 'organisations', user.orgId), { employeeRowOrder: rowOrder }, { merge: true })
      alert('Row order saved!')
      setShowRowOrder(false)
    } catch (err) {
      console.error('Save row order error:', err)
      alert('Failed to save order')
    }
  }

  const handleRowDragStart = (e, index) => {
    setDraggedRowItem(index)
    e.dataTransfer.effectAllowed = 'move'
  }

  const handleRowDragOver = (e, index) => {
    e.preventDefault()
    if (draggedRowItem === null || draggedRowItem === index) return
    const newOrder = [...rowOrder]
    const [removed] = newOrder.splice(draggedRowItem, 1)
    newOrder.splice(index, 0, removed)
    setRowOrder(newOrder)
    setDraggedRowItem(index)
  }

  const handleRowDragEnd = () => {
    setDraggedRowItem(null)
  }

  const getOrderedEmployees = () => {
    if (!Array.isArray(rowOrder) || !rowOrder.length) return employees
    return [...employees].sort((a, b) => {
      const idxA = rowOrder.indexOf(a.id)
      const idxB = rowOrder.indexOf(b.id)
      if (idxA === -1 && idxB === -1) return 0
      if (idxA === -1) return 1
      if (idxB === -1) return -1
      return idxA - idxB
    })
  }

  const logChange = async (type, targetId, details) => {
    try {
      await addDoc(collection(db, 'organisations', user.orgId, 'logs'), {
        type,
        targetId,
        details,
        performedBy: user.uid,
        performedByName: user.name,
        timestamp: serverTimestamp()
      })
    } catch (err) {
      console.error('Logging failed:', err)
    }
  }

  const compressImageToBase64 = (file, maxWidth = 256, maxHeight = 256) => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.readAsDataURL(file)
      reader.onload = (event) => {
        const img = new Image()
        img.src = event.target.result
        img.onload = () => {
          const canvas = document.createElement('canvas')
          let width = img.width
          let height = img.height

          if (width > height) {
            if (width > maxWidth) {
              height = Math.round((height * maxWidth) / width)
              width = maxWidth
            }
          } else {
            if (height > maxHeight) {
              width = Math.round((width * maxHeight) / height)
              height = maxHeight
            }
          }

          canvas.width = width
          canvas.height = height
          const ctx = canvas.getContext('2d')
          ctx.drawImage(img, 0, 0, width, height)
          resolve(canvas.toDataURL('image/png', 0.85))
        }
        img.onerror = (err) => reject(err)
      }
      reader.onerror = (err) => reject(err)
    })
  }

  const handleFileUpload = async (file, path) => {
    if (!file) return null
    if (file.size > 5 * 1024 * 1024) {
      alert('File size must be less than 5MB')
      return null
    }
    try {
      const storageRef = ref(storage, path)
      await uploadBytes(storageRef, file)
      return await getDownloadURL(storageRef)
    } catch (storageErr) {
      console.warn('Firebase Storage upload failed, compressing image locally to base64:', storageErr)
      return await compressImageToBase64(file)
    }
  }

  const getEmployeeFormWithDefaults = (employee) => {
    const mwhList = Array.isArray(minWorkHours) ? minWorkHours : []
    const mwhCategory = mwhList.find(m => m.hours === employee.minDailyHours) || mwhList.find(m => m.name === employee.minDailyHours)
    const defaultCategory = mwhList.length > 0 ? mwhList[0].name : ''

    const hasPersonalEmail = employee.personalEmail && employee.personalEmail.trim()
    const hasWorkEmail = employee.workEmail && employee.workEmail.trim()
    const hasLegacyEmail = employee.email && employee.email.trim()

    return {
      ...createEmployeeFormState(),
      ...employee,
      personalEmail: hasPersonalEmail ? employee.personalEmail : (hasLegacyEmail ? employee.email : ''),
      workEmail: hasWorkEmail ? employee.workEmail : '',
      loginEmailType: hasPersonalEmail ? employee.loginEmailType || 'personal' : (hasLegacyEmail ? 'personal' : 'work'),
      status: normalizeEmployeeStatus(employee.status),
      statusHistory: Array.isArray(employee.statusHistory) ? employee.statusHistory : [],
      loginEnabled: employee.loginEnabled || false,
      tempPassword: '',
      shiftEffectiveDate: '',
      siteId: employee.siteId || '',
      minDailyHoursCategory: mwhCategory?.name || defaultCategory || employee.minDailyHours || '',
      personalBank: {
        accountNo: employee.personalBank?.accountNo || '',
        ifsc: employee.personalBank?.ifsc || '',
        bankName: employee.personalBank?.bankName || '',
        holderName: employee.personalBank?.holderName || ''
      },
      companyBank: {
        accountNo: employee.companyBank?.accountNo || '',
        ifsc: employee.companyBank?.ifsc || '',
        bankName: employee.companyBank?.bankName || '',
        holderName: employee.companyBank?.holderName || ''
      }
    }
  }

  const getMinDailyHoursForCategory = (categoryName) => {
    const mwhList = Array.isArray(minWorkHours) ? minWorkHours : []
    const match = mwhList.find(m => m.name === categoryName)
    const hours = Number(match?.hours)
    return Number.isFinite(hours) && hours > 0 ? hours : 8
  }

  const buildStatusHistoryEntry = ({ fromStatus, toStatus, effectiveDate, dateField, actionLabel, name }) => ({
    fromStatus,
    toStatus,
    effectiveDate,
    dateField,
    action: actionLabel,
    employeeName: name || '',
    changedAt: new Date().toISOString(),
    changedBy: user.uid,
    changedByName: user.name || user.email || 'Unknown',
  })

  const applyStatusMetadata = (baseData, transitionMeta, statusHistoryEntry) => {
    if (!transitionMeta || !statusHistoryEntry) return baseData

    const effectiveDate = statusHistoryEntry.effectiveDate
    const nextData = {
      ...baseData,
      statusChangedAt: effectiveDate,
      lastStatusChange: statusHistoryEntry,
      statusHistory: [...(Array.isArray(baseData.statusHistory) ? baseData.statusHistory : []), statusHistoryEntry],
    }

    if (transitionMeta.field === 'activeFrom') {
      nextData.activeFrom = effectiveDate
      delete nextData.inactiveFrom
    }

    if (transitionMeta.field === 'inactiveFrom') {
      nextData.inactiveFrom = effectiveDate
    }

    if (transitionMeta.field === 'rejoinDate') {
      nextData.rejoinDate = effectiveDate
      nextData.activeFrom = effectiveDate
      delete nextData.inactiveFrom
    }

    return nextData
  }

  const handleEditStatusSelect = (nextStatus) => {
    const normalizedNextStatus = normalizeEmployeeStatus(nextStatus)
    const transitionMeta = getStatusTransitionRequirement(editOriginalStatus, normalizedNextStatus)

    setEditForm(prev => ({
      ...prev,
      status: normalizedNextStatus,
      ...(transitionMeta ? {
        [transitionMeta.field]: prev[transitionMeta.field] || getTodayDate(),
      } : {}),
    }))

    setEditStatusTransition(
      transitionMeta
        ? {
            ...transitionMeta,
            fromStatus: editOriginalStatus,
            toStatus: normalizedNextStatus,
          }
        : null
    )
  }

  const openEmployeeEditor = async (emp) => {
    const baseForm = getEmployeeFormWithDefaults(emp)
    const originalStatus = normalizeEmployeeStatus(baseForm.status)

    setEditingEmp(emp.id)
    setEditOriginalStatus(originalStatus)
    setEditStatusTransition(null)
    setEditForm(baseForm)

    if (emp.email) {
      const uSnap = await getDocs(query(collection(db, 'users'), where('orgId', '==', user.orgId), where('email', '==', emp.email.toLowerCase().trim())))
      if (!uSnap.empty) {
        const userData = uSnap.docs[0].data()
        setEditForm(prev => ({ ...prev, loginEnabled: userData.loginEnabled !== undefined ? userData.loginEnabled : true }))
      }
    }
  }

  const handleShiftChange = (newShiftId, formType) => {
    if (formType === 'edit') {
      setEditForm(prev => ({ ...prev, shiftId: newShiftId }))
    } else {
      setNewEmployee(prev => ({
        ...prev,
        shiftId: newShiftId
      }))
    }
  }

  const handleMinDailyHoursCategoryChange = (categoryName, formType) => {
    const newMinDailyHours = getMinDailyHoursForCategory(categoryName)

    if (formType === 'edit') {
      const oldMinDailyHours = Number(editForm.minDailyHours) || getMinDailyHoursForCategory(editForm.minDailyHoursCategory)
      if (newMinDailyHours !== oldMinDailyHours) {
        const effectiveDate = prompt('Working Hours category change detected.\n\nEnter Effective From Date (YYYY-MM-DD):', new Date().toISOString().split('T')[0])
        if (effectiveDate && /^\d{4}-\d{2}-\d{2}$/.test(effectiveDate)) {
          setEditForm(prev => ({
            ...prev,
            minDailyHoursCategory: categoryName,
            minDailyHours: newMinDailyHours,
            shiftEffectiveDate: effectiveDate,
            shiftChangeHistory: [...(prev.shiftChangeHistory || []), {
              fromCategory: prev.minDailyHoursCategory || '',
              toCategory: categoryName,
              fromMinDailyHours: oldMinDailyHours,
              toMinDailyHours: newMinDailyHours,
              effectiveDate,
              changedAt: new Date().toISOString(),
              changedBy: user.uid
            }]
          }))
          alert(`Working Hours category will be effective from ${effectiveDate}. OT will use ${newMinDailyHours} hours from this date.`)
        } else if (effectiveDate !== null) {
          alert('Invalid date format. Please use YYYY-MM-DD format.')
          return
        }
      } else {
        setEditForm(prev => ({ ...prev, minDailyHoursCategory: categoryName, minDailyHours: newMinDailyHours }))
      }
    } else {
      setNewEmployee(prev => ({ ...prev, minDailyHoursCategory: categoryName, minDailyHours: newMinDailyHours }))
    }
  }

  const recalculateAttendanceOT = async (employeeId, effectiveDate, newMinDailyHours) => {
    try {
      const recalcResult = await recalculateOTForEmployee(employeeId, effectiveDate, newMinDailyHours)
      const normalized = typeof recalcResult === 'number'
        ? { matchedCount: recalcResult, recalculatedCount: recalcResult }
        : {
            matchedCount: Number(recalcResult?.matchedCount) || 0,
            recalculatedCount: Number(recalcResult?.recalculatedCount) || 0
          }
      console.log(
        `Applied working-hours baseline to ${normalized.matchedCount} records and recalculated OT for ${normalized.recalculatedCount} records from ${effectiveDate}`
      )
      return normalized
    } catch (err) {
      console.error('Error recalculating OT:', err)
      return { matchedCount: 0, recalculatedCount: 0 }
    }
  }

  const handleSaveEmployee = async (bypassConfirm = false) => {
    if (!user?.orgId) {
      alert('Error: Organization ID not found. Please log in again.')
      return
    }
    if (editingEmp && editForm.role && typeof editForm.role !== 'string') {
      return alert('Role must be a valid string')
    }

    const validation = validateEmployeeData(editForm)
    if (!validation.success) {
      alert('Validation Error:\n' + validation.error)
      return
    }

    // Check for outstanding advances when changing to Inactive
    const normalizedNextStatusCheck = normalizeEmployeeStatus(editForm.status)
    if (normalizedNextStatusCheck === 'Inactive' && editingEmp) {
      try {
        const q = query(
          collection(db, 'organisations', user.orgId, 'advances_expenses'),
          where('employeeId', '==', editingEmp),
          where('type', '==', 'Advance'),
          where('paymentStatus', '!=', 'Paid')
        )
        const snap = await getDocs(q)
        let outstanding = 0
        snap.forEach(d => {
          const data = d.data()
          outstanding += parseFloat(data.amount) || 0
        })
        if (outstanding > 0) {
          const empName = editForm.name || 'this employee'
          if (!confirm(`${empName} has ₹${new Intl.NumberFormat('en-IN', { minimumFractionDigits: 2 }).format(outstanding)} in outstanding advances.\n\nProceed with deactivation anyway?`)) {
            return
          }
        }
      } catch (err) {
        console.error('Error checking outstanding advances:', err)
      }
    }

    const originalEmp = employees.find(e => e.id === editingEmp)
    const originalJoinDate = originalEmp?.joinedDate || originalEmp?.doj || ''
    const newJoinDate = editForm.joinedDate || ''
    if (!bypassConfirm && originalEmp && newJoinDate !== originalJoinDate) {
      setPendingJoinDate(newJoinDate)
      setJoinDateContext('edit')
      setIsJoinDateConfirmOpen(true)
      return
    }

    setSaving(true)
    try {
      const normalizedOriginalStatus = normalizeEmployeeStatus(editOriginalStatus)
      const normalizedNextStatus = normalizeEmployeeStatus(editForm.status)
      const statusTransition = getStatusTransitionRequirement(normalizedOriginalStatus, normalizedNextStatus)

      if (statusTransition && !editForm[statusTransition.field]) {
        return alert(`Please select ${statusTransition.label.toLowerCase()}.`)
      }

      const selectedRoleName = editForm.role || 'employee'
      let selectedRolePerms = {}
      
      // Fetch permissions for the selected role if it exists in our roles list
      const rolesArray = Array.isArray(roles) ? roles : []
      const roleObj = rolesArray.find(r => r.name.toLowerCase() === selectedRoleName.toLowerCase())
      if (roleObj) {
        selectedRolePerms = roleObj.permissions || {}
      } else if (selectedRoleName.toLowerCase() === 'admin') {
        // Full permissions for admin
        const modules = [
          'Attendance', 'Correction', 'Leave', 'Approvals', 'Summary', 'HRLetters',
          'SalarySlip', 'AdvanceExpense', 'Fine', 'Engagement', 'Birthday',
          'EmployeePortal', 'Settings', 'Employees', 'Roles', 'Shifts',
          'Recruitment', 'AssetManagement', 'PerformanceReview', 'Training',
          'ExitManagement', 'DocumentManagement', 'Helpdesk', 'Projects', 'TimeTracking', 'Tasks'
        ]
        modules.forEach(m => {
          selectedRolePerms[m] = { view: true, create: true, edit: true, delete: true, approve: true, export: true, full: true }
        })
      }

      // Prepare clean employee data - remove any undefined values and include orgId
      const mwhList = Array.isArray(minWorkHours) ? minWorkHours : []
      const mwhCategory = mwhList.find(m => m.name === editForm.minDailyHoursCategory)
      const effectiveDateForOT = editForm.shiftEffectiveDate || ''
      
      // Destructure to separate Firestore-unfriendly objects
      const { id, shift, ...baseEditForm } = editForm

      const selectedLoginEmail = editForm.loginEmailType === 'personal'
        ? editForm.personalEmail?.trim()
        : editForm.workEmail?.trim()

      const selectedBankAccount = editForm.companyBank?.accountNo || editForm.personalBank?.accountNo || ''

      const cleanEditForm = {
        ...Object.fromEntries(
          Object.entries(baseEditForm).filter(([_, v]) => v !== undefined && v !== null && typeof v !== 'function')
        ),
        email: selectedLoginEmail || '',
        bankAccount: selectedBankAccount,
        orgId: user.orgId,
        role: selectedRoleName,
        status: normalizedNextStatus,
        minDailyHours: mwhCategory ? mwhCategory.hours : (editForm.minDailyHours || 8)
      }
      delete cleanEditForm.shiftEffectiveDate

      let statusHistoryEntry = null
      if (statusTransition) {
        statusHistoryEntry = buildStatusHistoryEntry({
          fromStatus: normalizedOriginalStatus,
          toStatus: normalizedNextStatus,
          effectiveDate: editForm[statusTransition.field],
          dateField: statusTransition.field,
          actionLabel: statusTransition.logAction,
          name: editForm.name,
        })
      }

      const employeePayload = applyStatusMetadata(cleanEditForm, statusTransition, statusHistoryEntry)

      if (isEmployeeActiveStatus(employeePayload.status)) {
        delete employeePayload.inactiveFrom
      }
      
      if (employeePayload.minDailyHoursCategory) delete employeePayload.minDailyHoursCategory
      if (employeePayload.id) delete employeePayload.id
      
      await updateEmployee(editingEmp, employeePayload)
      await logChange('EMPLOYEE_UPDATE', editingEmp, { name: editForm.name })

      // 2) Create or Update auth user if loginEnabled is true
      if (employeePayload.loginEnabled && employeePayload.email) {
        // Check if user already exists in Firestore users collection
        const uSnap = await getDocs(query(collection(db, 'users'), where('email', '==', employeePayload.email.toLowerCase().trim())))
        
        if (uSnap.empty) {
          // No user doc exists, so we probably need to create the Firebase Auth account too
          if (editForm.tempPassword) {
            try {
              const cred = await createUserWithEmailAndPassword(secondaryAuth, employeePayload.email, editForm.tempPassword)
              await updateProfile(cred.user, { displayName: employeePayload.name })
              
              await setDoc(doc(db, 'users', cred.user.uid), {
                email: employeePayload.email.toLowerCase().trim(),
                name: employeePayload.name,
                orgId: user.orgId,
                role: selectedRoleName,
                permissions: selectedRolePerms,
                employeeId: editingEmp,
                empCode: employeePayload.empCode || '',
                department: employeePayload.department || '',
                createdAt: serverTimestamp(),
                loginEnabled: true
              })
              console.log('Created new auth user during employee save')
            } catch (authErr) {
              console.error('Auth creation error in handleSaveEmployee:', authErr)
              // If user already exists in Auth but not in our users collection, 
              // we can't do much without their UID, but usually they stay in sync.
              if (authErr.code !== 'auth/email-already-in-use') {
                throw authErr
              }
            }
          }
        } else {
          // User doc exists, just update loginEnabled and other fields
          const userDoc = uSnap.docs[0]
          const userData = userDoc.data()
          const uid = userDoc.id
          
          // Update memberships if they exist
          let memberships = userData.memberships || []
          const orgIndex = memberships.findIndex(m => m.orgId === user.orgId)
          if (orgIndex !== -1) {
            memberships[orgIndex].role = selectedRoleName
          } else {
            // If they are a legacy user without memberships, migrate them
            memberships.push({ orgId: user.orgId, role: selectedRoleName, orgName: user.orgName || 'My Organisation' })
          }

          await updateDoc(userDoc.ref, {
            loginEnabled: true,
            role: selectedRoleName,
            permissions: selectedRolePerms,
            memberships,
            name: employeePayload.name,
            empCode: employeePayload.empCode || '',
            department: employeePayload.department || '',
            updatedAt: serverTimestamp()
          })

          // Sync adminUids in organisation doc
          const orgSnap = await getDoc(doc(db, 'organisations', user.orgId))
          if (orgSnap.exists()) {
            const orgData = orgSnap.data()
            let adminUids = orgData.adminUids || []
            const isCurrentlyAdmin = adminUids.includes(uid)
            const isNewAdmin = selectedRoleName.toLowerCase() === 'admin'

            if (isNewAdmin && !isCurrentlyAdmin) {
              adminUids.push(uid)
              await updateDoc(doc(db, 'organisations', user.orgId), { adminUids })
            } else if (!isNewAdmin && isCurrentlyAdmin) {
              adminUids = adminUids.filter(id => id !== uid)
              await updateDoc(doc(db, 'organisations', user.orgId), { adminUids })
            }
          }
          console.log('Updated existing user doc and org admin list during employee save')
        }
      } else if (!employeePayload.loginEnabled && employeePayload.email) {
        // If login is disabled, update the user doc if it exists
        const uSnap = await getDocs(query(collection(db, 'users'), where('email', '==', employeePayload.email.toLowerCase().trim())))
        if (!uSnap.empty) {
          await updateDoc(uSnap.docs[0].ref, {
            loginEnabled: false,
            updatedAt: serverTimestamp()
          })
          console.log('Disabled existing user doc during employee save')
        }
      }

      if (statusHistoryEntry) {
        await logChange('EMPLOYEE_STATUS_CHANGE', editingEmp, {
          name: editForm.name,
          fromStatus: statusHistoryEntry.fromStatus,
          toStatus: statusHistoryEntry.toStatus,
          effectiveDate: statusHistoryEntry.effectiveDate,
          dateField: statusHistoryEntry.dateField,
          action: statusHistoryEntry.action,
        })
      }

      let recalcResult = null

      // 3) Recalculate OT for attendance history when Working Hours changes with an effective date
      if (effectiveDateForOT && employeePayload.minDailyHours) {
        recalcResult = await recalculateAttendanceOT(
          editingEmp, 
          effectiveDateForOT, 
          employeePayload.minDailyHours
        )

        await logChange('EMPLOYEE_SHIFT_CHANGE', editingEmp, {
          name: editForm.name,
          effectiveDate: effectiveDateForOT,
          minDailyHours: employeePayload.minDailyHours,
          minDailyHoursCategory: editForm.minDailyHoursCategory || '',
          recordsAffected: recalcResult.matchedCount,
          otRecalculatedRecords: recalcResult.recalculatedCount,
          message: `Applied working-hours baseline to ${recalcResult.matchedCount} records and recalculated OT for ${recalcResult.recalculatedCount} records from ${effectiveDateForOT}`
        })
      }

      setEditingEmp(null)
      setEditForm({})
      setEditOriginalStatus(EMPLOYEE_STATUS_ACTIVE)
      setEditStatusTransition(null)
      if (recalcResult) {
        if (recalcResult.matchedCount > 0) {
          alert(
            `Employee updated! Working Hours will apply from ${effectiveDateForOT}.\n` +
            `Updated ${recalcResult.matchedCount} attendance records and recalculated OT for ${recalcResult.recalculatedCount} records.`
          )
        } else {
          alert(
            `Employee updated! Working Hours will apply from ${effectiveDateForOT}.\n` +
            'No attendance records found from that date yet, so OT recalculation was skipped.'
          )
        }
      } else {
        alert('Employee details updated successfully!')
      }
    } catch (err) {
      console.error('Error saving employee:', err)
      alert('Failed to save employee: ' + err.message + ' | Stack: ' + err.stack)
    } finally {
      setSaving(false)
    }
  }

  const handleAddShift = async () => {
    const shiftData = { ...newShift, createdAt: serverTimestamp() }
    if (editingShift) {
      await updateDoc(doc(db, 'organisations', user.orgId, 'shifts', editingShift.id), shiftData)
      setShifts(prev => prev.map(s => s.id === editingShift.id ? { ...s, ...shiftData } : s))
    } else {
      const docRef = await addDoc(collection(db, 'organisations', user.orgId, 'shifts'), shiftData)
      setShifts(prev => [...prev, { id: docRef.id, ...shiftData }])
    }
    setShowAddShift(false)
    setEditingShift(null)
    setNewShift({ name: '', type: 'Day', startTime: '09:00', endTime: '18:00', workHours: 9, isFlexible: false })
  }

  const handleAddEmployee = async (bypassConfirm = false) => {
    setFormErrors({})

    if (!user?.orgId) {
      alert('Error: Organization ID not found. Please log in again.')
      return
    }

    if (!newEmployee.name?.trim()) {
      setFormErrors({ name: 'Employee name is required' })
      return
    }

    const validation = validateEmployeeData(newEmployee)
    if (!validation.success) {
      setFormErrors({ name: 'Please fill in all required fields' })
      return
    }

    if (!bypassConfirm && newEmployee.joinedDate) {
      setPendingJoinDate(newEmployee.joinedDate)
      setJoinDateContext('add')
      setIsJoinDateConfirmOpen(true)
      return
    }

    setSaving(true)
    try {
      const empCode = newEmployee.empCode?.trim() ||
        `EMP-${Date.now().toString(36).toUpperCase().slice(-4)}`

      const normalizedStatus = normalizeEmployeeStatus(newEmployee.status)
      const initialStatusDate = newEmployee.joinedDate || getTodayDate()
      const initialStatusEntry = buildStatusHistoryEntry({
        fromStatus: null,
        toStatus: normalizedStatus,
        effectiveDate: initialStatusDate,
        dateField: normalizedStatus === 'Inactive' ? 'inactiveFrom' : normalizedStatus === 'Rejoined' ? 'rejoinDate' : 'activeFrom',
        actionLabel: 'created',
        name: newEmployee.name,
      })

      const selectedLoginEmail = newEmployee.loginEmailType === 'personal'
        ? newEmployee.personalEmail?.trim()
        : newEmployee.workEmail?.trim()

      const selectedBankAccount = newEmployee.companyBank?.accountNo || newEmployee.personalBank?.accountNo || ''

      let payload = {
        ...newEmployee,
        email: selectedLoginEmail || '',
        bankAccount: selectedBankAccount,
        empCode,
        orgId: user.orgId,
        status: normalizedStatus,
        statusHistory: [initialStatusEntry],
        statusChangedAt: initialStatusDate,
        lastStatusChange: initialStatusEntry,
      }

      if (normalizedStatus === 'Inactive') {
        payload.inactiveFrom = payload.inactiveFrom || initialStatusDate
      } else if (normalizedStatus === 'Rejoined') {
        payload.rejoinDate = payload.rejoinDate || initialStatusDate
        payload.activeFrom = payload.activeFrom || initialStatusDate
      } else {
        payload.activeFrom = payload.activeFrom || initialStatusDate
      }

      const { tempPassword, ...employeeDoc } = payload
      const roleName = newEmployee.role || 'employee'
      let rolePermissions = {}

      // Fetch permissions for the selected role
      const rolesArray = Array.isArray(roles) ? roles : []
      const roleObj = rolesArray.find(r => r.name.toLowerCase() === roleName.toLowerCase())
      if (roleObj) {
        rolePermissions = roleObj.permissions || {}
      } else if (roleName.toLowerCase() === 'admin') {
        const modules = [
          'Attendance', 'Correction', 'Leave', 'Approvals', 'Summary', 'HRLetters',
          'SalarySlip', 'AdvanceExpense', 'Fine', 'Engagement', 'Birthday',
          'EmployeePortal', 'Settings', 'Employees', 'Roles', 'Shifts',
          'Recruitment', 'AssetManagement', 'PerformanceReview', 'Training',
          'ExitManagement', 'DocumentManagement', 'Helpdesk', 'Projects', 'TimeTracking', 'Tasks'
        ]
        modules.forEach(m => {
          rolePermissions[m] = { view: true, create: true, edit: true, delete: true, approve: true, export: true, full: true }
        })
      }

      // Convert minDailyHoursCategory to minDailyHours
      const mwhCategory = (Array.isArray(minWorkHours) ? minWorkHours : []).find(m => m.name === newEmployee.minDailyHoursCategory)
      const employeeWithMinHours = {
        ...employeeDoc,
        minDailyHours: mwhCategory?.hours || 8
      }
      delete employeeWithMinHours.minDailyHoursCategory

      // 1) Create employee master
      const empId = await addEmployee(employeeWithMinHours)
      await logChange('EMPLOYEE_CREATE', empId, { name: employeeDoc.name, status: employeeDoc.status })

      // 2) Optionally create login-enabled auth user
      if (employeeDoc.loginEnabled && employeeDoc.email && tempPassword) {
        const trimmedPassword = tempPassword.trim()
        const normalizedEmail = employeeDoc.email.toLowerCase().trim()

        if (trimmedPassword.length < 6) {
          alert('Password must be at least 6 characters long.')
          setSaving(false)
          return
        }

        let userUid = null
        try {
          // Use secondaryAuth to avoid logging out the admin
          const cred = await createUserWithEmailAndPassword(secondaryAuth, normalizedEmail, trimmedPassword)
          await updateProfile(cred.user, { displayName: employeeDoc.name })
          userUid = cred.user.uid
          console.log('Created new Firebase Auth account')
        } catch (authErr) {
          if (authErr.code === 'auth/email-already-in-use') {
            console.log('Auth account already exists, checking Firestore user doc...')
          } else {
            throw authErr
          }
        }

        // Check if user already exists in Firestore users collection
        const uSnap = await getDocs(query(collection(db, 'users'), where('email', '==', normalizedEmail)))
        
        if (!uSnap.empty) {
          // User doc exists, re-link it to the new employee record
          const userDocRef = uSnap.docs[0].ref
          await updateDoc(userDocRef, {
            orgId: user.orgId,
            employeeId: empId,
            name: employeeDoc.name,
            role: roleName,
            permissions: rolePermissions,
            empCode,
            department: employeeDoc.department || '',
            reportingManager: employeeDoc.reportingManager || '',
            loginEnabled: true,
            updatedAt: serverTimestamp()
          })
          console.log('Re-linked existing user doc to new employee record')
        } else {
          // No user doc found
          if (userUid) {
            // New auth account was created, create the user doc
            const newUserData = {
              email: normalizedEmail,
              name: employeeDoc.name,
              orgId: user.orgId,
              role: roleName,
              permissions: rolePermissions,
              memberships: [{ orgId: user.orgId, role: roleName, orgName: user.orgName || 'My Organisation' }],
              employeeId: empId,
              empCode,
              department: employeeDoc.department || '',
              reportingManager: employeeDoc.reportingManager || '',
              createdAt: serverTimestamp(),
              loginEnabled: true,
            }
            await setDoc(doc(db, 'users', userUid), newUserData)

            // Sync adminUids in organisation doc if new user is Admin
            if (roleName.toLowerCase() === 'admin') {
              const orgSnap = await getDoc(doc(db, 'organisations', user.orgId))
              if (orgSnap.exists()) {
                const orgData = orgSnap.data()
                let adminUids = orgData.adminUids || []
                if (!adminUids.includes(userUid)) {
                  adminUids.push(userUid)
                  await updateDoc(doc(db, 'organisations', user.orgId), { adminUids })
                }
              }
            }
            console.log('Created new user doc and synced admin list for new auth account')
          } else {
            // Auth account exists but no user doc found in Firestore
            alert('A login account with this email already exists but is not linked to any user record. Please use a different email or contact support.')
            // We still created the employee master, but couldn't setup login
          }
        }
      }

      setShowAddEmployee(false)
      setNewEmployee(createEmployeeFormState())
      alert('New employee created successfully!')
    } catch (err) {
      console.error('Error adding employee:', err)
      alert('Failed to add employee: ' + err.message)
    } finally {
      setSaving(false)
    }
  }

  const handleAddRole = async () => {
    if (!isAdmin && userPermissions['Roles']?.edit !== true) return alert('You do not have permission to manage roles.')
    if (!newRole.name || !newRole.name.trim()) return alert('Role name is required')
    if (typeof newRole.name !== 'string') return alert('Role name must be a string')
    setSaving(true)
    try {
      if (editingRole) {
        // Update the role document itself
        await updateDoc(doc(db, 'organisations', user.orgId, 'roles', editingRole.id), {
          ...newRole,
          updatedAt: serverTimestamp()
        })

        // Propagate changes to all users currently assigned this role
        const oldRoleName = editingRole.name
        const newRoleName = newRole.name
        const newPermissions = newRole.permissions || {}

        const usersToUpdate = users.filter(u => u.role && u.role.toLowerCase() === oldRoleName.toLowerCase())

        if (usersToUpdate.length > 0) {
          const updatePromises = usersToUpdate.map(u => {
            const userRef = doc(db, 'users', u.id)
            let updatedMemberships = u.memberships || []
            if (updatedMemberships.length > 0) {
              updatedMemberships = updatedMemberships.map(m => {
                if (m.orgId === user.orgId) {
                  return { ...m, role: newRoleName }
                }
                return m
              })
            }
            const updatedUserPayload = {
              role: newRoleName,
              permissions: newPermissions,
              ...(updatedMemberships.length > 0 ? { memberships: updatedMemberships } : {})
            }
            return updateDoc(userRef, updatedUserPayload)
          })
          await Promise.all(updatePromises)

          // Update local users state
          setUsers(prev => prev.map(u => {
            if (u.role && u.role.toLowerCase() === oldRoleName.toLowerCase()) {
              let updatedMemberships = u.memberships || []
              if (updatedMemberships.length > 0) {
                updatedMemberships = updatedMemberships.map(m => {
                  if (m.orgId === user.orgId) {
                    return { ...m, role: newRoleName }
                  }
                  return m
                })
              }
              return {
                ...u,
                role: newRoleName,
                permissions: newPermissions,
                memberships: updatedMemberships
              }
            }
            return u
          }))
        }

        setRoles(prev => prev.map(r => r.id === editingRole.id ? { ...r, ...newRole } : r))
      } else {
        const docRef = await addDoc(collection(db, 'organisations', user.orgId, 'roles'), {
          ...newRole,
          createdAt: serverTimestamp()
        })
        setRoles(prev => [...prev, { id: docRef.id, ...newRole }])
      }
      setShowAddRole(false)
      setEditingRole(null)
      setNewRole({ name: '', description: '', isAccountant: false, permissions: { Tasks: { view: true } } })
    } catch (err) {
      console.error('Role save error:', err)
      alert('Failed to save role')
    } finally {
      setSaving(false)
    }
  }

  const handleUpdateUserRole = async (uid, newRoleName) => {
    if (!isAdmin && userPermissions['Roles']?.edit !== true) return alert('You do not have permission to change user roles.')
    try {
      // Fetch org document to check for creatorId
      const orgSnap = await getDoc(doc(db, 'organisations', user.orgId))
      const orgData = orgSnap.exists() ? orgSnap.data() : null
      const isCreator = orgData && orgData.creatorId === uid
      
      if (isCreator && newRoleName.toLowerCase() !== 'admin') {
        const otherAdmins = users.filter(u => u.id !== uid && u.role?.toLowerCase() === 'admin')
        if (otherAdmins.length === 0) {
          return alert('As the organization creator, you cannot change your role from Admin unless there is at least one other Admin user in the organization.')
        }
      }

      let permissions = {}
      const rolesArray = Array.isArray(roles) ? roles : []
      const roleObj = rolesArray.find(r => r.name.toLowerCase() === newRoleName.toLowerCase())
      
      if (roleObj) {
        permissions = roleObj.permissions || {}
      } else if (newRoleName.toLowerCase() === 'admin') {
        const modules = [
          'Attendance', 'Correction', 'Leave', 'Approvals', 'Summary', 'HRLetters',
          'SalarySlip', 'AdvanceExpense', 'Fine', 'Engagement', 'Birthday',
          'EmployeePortal', 'Settings', 'Employees', 'Roles', 'Shifts',
          'Recruitment', 'AssetManagement', 'PerformanceReview', 'Training',
          'ExitManagement', 'DocumentManagement', 'Helpdesk', 'Projects', 'TimeTracking', 'Tasks'
        ]
        modules.forEach(m => {
          permissions[m] = { view: true, create: true, edit: true, delete: true, approve: true, export: true, full: true }
        })
      }

      // Find the user to see if they are missing name or empCode
      const userObj = users.find(u => u.id === uid)
      
      // Update memberships if present
      let updatedMemberships = userObj?.memberships || []
      if (updatedMemberships.length > 0) {
        updatedMemberships = updatedMemberships.map(m => {
          if (m.orgId === user.orgId) {
            return { ...m, role: newRoleName }
          }
          return m
        })
      }

      const updatePayload = { 
        role: newRoleName,
        permissions: permissions,
        ...(updatedMemberships.length > 0 ? { memberships: updatedMemberships } : {})
      }

      // Sync name and empCode from employee collection if missing in user doc
      if (userObj && (!userObj.name || !userObj.empCode)) {
        const emp = employees.find(e => e.email === userObj.email || e.id === userObj.employeeId)
        if (emp) {
          if (!userObj.name) updatePayload.name = emp.name
          if (!userObj.empCode) updatePayload.empCode = emp.empCode
        }
      }

      await updateDoc(doc(db, 'users', uid), updatePayload)

      // Update adminUids in the organisation document
      if (orgSnap.exists()) {
        let adminUids = orgData.adminUids || []
        const isCurrentlyAdmin = adminUids.includes(uid)
        const isNewAdmin = newRoleName.toLowerCase() === 'admin'

        if (isNewAdmin && !isCurrentlyAdmin) {
          adminUids.push(uid)
          await updateDoc(doc(db, 'organisations', user.orgId), { adminUids })
        } else if (!isNewAdmin && isCurrentlyAdmin) {
          adminUids = adminUids.filter(id => id !== uid)
          await updateDoc(doc(db, 'organisations', user.orgId), { adminUids })
        }
      }

      setUsers(prev => prev.map(u => u.id === uid ? { ...u, ...updatePayload } : u))
      alert('User role and permissions updated successfully')
    } catch (err) {
      console.error('Update user role error:', err)
      alert('Failed to update user role')
    }
  }

  const handleDeleteUser = async (uid, userName) => {
    if (!isAdmin && userPermissions['Roles']?.delete !== true) return alert('You do not have permission to delete users.')
    if (uid === user.uid) return alert('You cannot delete your own account.')
    
    if (!confirm(`Are you sure you want to remove login access for ${userName}? This will delete their user record but keep their employee data.`)) return
    
    try {
      await deleteDoc(doc(db, 'users', uid))
      setUsers(prev => prev.filter(u => u.id !== uid))
      alert('User login access removed successfully.')
    } catch (err) {
      console.error('Delete user error:', err)
      alert('Failed to remove user access.')
    }
  }

  const areAllRoleMatrixActionsEnabled = (modulePermissions = {}) =>
    roleMatrixActions.every(action => modulePermissions?.[action] === true)

  const togglePermission = (modId, permKey) => {
    setNewRole(prev => {
      if (!prev) return prev
      const perms = { ...(prev.permissions || {}) }
      if (!perms[modId]) perms[modId] = {}
      const currentVal = !!perms[modId][permKey]
      const nextModulePerms = { ...perms[modId], [permKey]: !currentVal }
      const allEnabled = areAllRoleMatrixActionsEnabled(nextModulePerms)
      perms[modId] = {
        ...nextModulePerms,
        full: allEnabled,
        ...(allEnabled ? { export: true } : {}),
      }
      return { ...prev, permissions: perms }
    })
  }

  const toggleAllPermissions = (modId) => {
    setNewRole(prev => {
      if (!prev) return prev
      const perms = { ...(prev.permissions || {}) }
      const currentModulePerms = perms[modId] || {}
      const shouldEnableAll = !areAllRoleMatrixActionsEnabled(currentModulePerms)
      const nextModulePerms = roleMatrixActions.reduce((acc, action) => {
        acc[action] = shouldEnableAll
        return acc
      }, { ...currentModulePerms })

      perms[modId] = {
        ...nextModulePerms,
        full: shouldEnableAll,
        export: shouldEnableAll ? true : false,
      }
      return { ...prev, permissions: perms }
    })
  }

  const handleSaveOrg = async (msg) => {
    if (!user?.orgId) { setOrgError('No organisation ID found.'); return }
    if (loading) { setOrgError('Still loading data. Please wait.'); return }
    if (!isAdmin && userPermissions['Settings']?.edit !== true) { setOrgError('You do not have permission to edit organization settings.'); return }
    if (!orgSettings.name || !orgSettings.name.trim()) { setOrgError('Organisation Name is required.'); return }
    setSaving(true)
    setOrgError('')
    try {
      await setDoc(doc(db, 'organisations', user.orgId), orgSettings, { merge: true })
      setSaved(true)
      const successMsg = typeof msg === 'string' && msg ? msg : 'Organisation settings saved successfully!'
      alert(successMsg)
      
      // Refresh org settings from database
      const orgSnap = await getDoc(doc(db, 'organisations', user.orgId))
      if (orgSnap.exists()) {
        const data = orgSnap.data()
        setOrgSettings(prev => ({
          ...prev,
          ...data,
          name: data.name || prev.name,
          bankAccounts: Array.isArray(data.bankAccounts) ? data.bankAccounts : []
        }))
      }

      setTimeout(() => setSaved(false), 2500)
    } catch (err) {
      setOrgError(err.message || 'Save failed.')
    } finally {
      setSaving(false)
    }
  }

  useEffect(() => {
    if (!user?.orgId) return
    const q = query(collection(db, 'organisations', user.orgId, 'approvalSettings'), orderBy('createdAt', 'desc'))
    const unsubscribe = onSnapshot(q, (snapshot) => {
      setApprovalSettings(snapshot.docs.map(d => ({ id: d.id, ...d.data() })))
    })
    return () => unsubscribe()
  }, [user?.orgId])

  useEffect(() => {
    if (!user?.orgId) return
    const q = query(collection(db, 'organisations', user.orgId, 'sites'), orderBy('siteName', 'asc'))
    const unsubscribe = onSnapshot(q, (snapshot) => {
      setSites(snapshot.docs.map(d => ({ id: d.id, ...d.data() })))
    })
    return () => unsubscribe()
  }, [user?.orgId])

  const handleSaveApproval = async () => {
    if (!user?.orgId) return
    try {
      // Rule: For Leave multi-approval, the last stage must be MD
      if (newApproval.moduleName === 'Leave' && newApproval.type === 'multi') {
        if (!newApproval.stages?.length) {
          return alert('Please add at least one approval stage')
        }
        const lastStage = newApproval.stages[newApproval.stages.length - 1]
        if (lastStage.role !== 'MD') {
          return alert('For Leave multi-approval, the final stage must be assigned to MD.')
        }
      }

      const payload = {
        ...newApproval,
        approvers: newApproval.type === 'single' ? (newApproval.approvers || []) : [],
        stages: newApproval.type === 'multi'
          ? (newApproval.stages?.length ? newApproval.stages : [{ role: '', amountLimit: '' }])
          : [],
        updatedAt: serverTimestamp()
      }

      // Check if a setting for this module already exists (to prevent duplicates)
      const existingSetting = approvalSettings.find(s => s.moduleName === newApproval.moduleName)

      if (editingApproval) {
        await updateDoc(doc(db, 'organisations', user.orgId, 'approvalSettings', editingApproval.id), payload)
      } else if (existingSetting) {
        if (confirm(`An approval setting for "${newApproval.moduleName}" already exists. Overwrite it?`)) {
          await updateDoc(doc(db, 'organisations', user.orgId, 'approvalSettings', existingSetting.id), payload)
        } else {
          return
        }
      } else {
        await addDoc(collection(db, 'organisations', user.orgId, 'approvalSettings'), {
          ...payload,
          createdAt: serverTimestamp()
        })
      }
      setShowAddApproval(false)
      setEditingApproval(null)
      setNewApproval({ moduleName: 'Leave', type: 'single', approvers: [], stages: [{ role: '', amountLimit: '' }] })
    } catch (err) {
      console.error('Save approval error:', err)
      alert('Failed to save approval setting.')
    }
  }

  const handleDeleteApproval = async (id) => {
    if (!user?.orgId || !confirm('Are you sure you want to delete this approval setting?')) return
    try {
      await deleteDoc(doc(db, 'organisations', user.orgId, 'approvalSettings', id))
    } catch (err) {
      console.error('Delete approval error:', err)
      alert('Failed to delete.')
    }
  }

  const resetSiteForm = () => {
    setEditingSiteId(null)
    setSiteSearchQuery('')
    setSiteSearchResults([])
    setSiteForm({
      siteName: '',
      latitude: '',
      longitude: '',
      radiusMeters: 500,
      notes: '',
      active: true,
    })
  }

  const handleSiteLocationSearch = async () => {
    const lookupValue = (siteSearchQuery || siteForm.siteName || '').trim()
    if (lookupValue.length < 3) {
      alert('Please enter at least 3 characters to search location.')
      return
    }
    setSiteSearchLoading(true)
    setSiteSearchResults([])
    try {
      const providers = [
        {
          fetcher: () => fetch(`https://nominatim.openstreetmap.org/search?format=jsonv2&limit=6&q=${encodeURIComponent(lookupValue)}`),
          parser: async (response) => {
            const rows = await response.json()
            if (!Array.isArray(rows)) return []
            return rows.map((row) => ({
              id: `nominatim-${row.place_id}-${row.lat}-${row.lon}`,
              label: row.display_name || row.name || 'Unknown location',
              lat: Number(row.lat),
              lng: Number(row.lon),
              shortName: String(row.name || row.display_name || '').split(',')[0].trim(),
            }))
          },
        },
        {
          fetcher: () => fetch(`https://photon.komoot.io/api/?limit=6&q=${encodeURIComponent(lookupValue)}`),
          parser: async (response) => {
            const payload = await response.json()
            const rows = payload?.features || []
            return rows.map((row) => {
              const [lng, lat] = row.geometry?.coordinates || []
              const parts = [
                row.properties?.name,
                row.properties?.city,
                row.properties?.state,
                row.properties?.country,
              ].filter(Boolean)
              return {
                id: `photon-${row.properties?.osm_id || 'unknown'}-${lat}-${lng}`,
                label: parts.join(', ') || 'Unknown location',
                lat: Number(lat),
                lng: Number(lng),
                shortName: row.properties?.name || parts[0] || '',
              }
            })
          },
        },
      ]

      let normalizedResults = []
      for (const provider of providers) {
        try {
          const response = await provider.fetcher()
          if (!response.ok) continue
          const parsed = await provider.parser(response)
          const valid = parsed.filter((row) => Number.isFinite(row.lat) && Number.isFinite(row.lng))
          if (valid.length) {
            normalizedResults = valid
            break
          }
        } catch {
          // Try next provider
        }
      }

      if (!normalizedResults.length) {
        alert('Search didn\'t return results. Use the map below and tap the exact site location.')
        return
      }
      setSiteSearchResults(normalizedResults)
    } catch (error) {
      alert(`Unable to search location: ${error.message}. You can still pick location from the map.`)
    } finally {
      setSiteSearchLoading(false)
    }
  }

  const handleSelectSiteLocation = (result) => {
    const latitude = Number(result?.lat)
    const longitude = Number(result?.lng)
    if (Number.isNaN(latitude) || Number.isNaN(longitude)) {
      alert('Selected location has invalid coordinates. Please try another result.')
      return
    }
    setSiteForm(prev => ({
      ...prev,
      latitude: latitude.toFixed(6),
      longitude: longitude.toFixed(6),
      siteName: prev.siteName || String(result?.shortName || result?.label || '').split(',')[0].trim(),
    }))
    setSiteSearchQuery(result?.label || '')
    setSiteSearchResults([])
  }

  const handlePickLocationFromMap = ({ lat, lng }) => {
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return
    setSiteForm(prev => ({
      ...prev,
      latitude: lat.toFixed(6),
      longitude: lng.toFixed(6),
    }))
  }

  const handleUseCurrentLocation = () => {
    if (!navigator?.geolocation) {
      alert('Geolocation is not supported in this browser.')
      return
    }
    setSiteGeoLocating(true)
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const lat = Number(position.coords.latitude)
        const lng = Number(position.coords.longitude)
        if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
          alert('Could not read current location coordinates.')
          setSiteGeoLocating(false)
          return
        }
        setSiteForm(prev => ({
          ...prev,
          latitude: lat.toFixed(6),
          longitude: lng.toFixed(6),
        }))
        setSiteGeoLocating(false)
      },
      (error) => {
        alert(`Unable to fetch current location: ${error.message}`)
        setSiteGeoLocating(false)
      },
      {
        enableHighAccuracy: true,
        timeout: 12000,
        maximumAge: 0,
      }
    )
  }

  const handleSaveSite = async () => {
    if (!user?.orgId) return
    const siteName = siteForm.siteName.trim()
    const latitude = Number(siteForm.latitude)
    const longitude = Number(siteForm.longitude)
    const radiusMeters = Number(siteForm.radiusMeters) || 500

    if (!siteName) {
      alert('Site name is required.')
      return
    }
    if (Number.isNaN(latitude) || Number.isNaN(longitude)) {
      alert('Please search and select a valid map location before saving.')
      return
    }
    if (radiusMeters < 50 || radiusMeters > 5000) {
      alert('Radius must be between 50m and 5000m.')
      return
    }

    const payload = {
      siteName,
      latitude,
      longitude,
      radiusMeters,
      notes: siteForm.notes?.trim() || '',
      active: siteForm.active !== false,
      updatedAt: serverTimestamp(),
      updatedBy: user.uid,
    }

    try {
      if (editingSiteId) {
        await updateDoc(doc(db, 'organisations', user.orgId, 'sites', editingSiteId), payload)
      } else {
        await addDoc(collection(db, 'organisations', user.orgId, 'sites'), {
          ...payload,
          createdAt: serverTimestamp(),
          createdBy: user.uid,
        })
      }
      resetSiteForm()
    } catch (error) {
      alert(`Failed to save site: ${error.message}`)
    }
  }

  const handleEditSite = (site) => {
    setEditingSiteId(site.id)
    setSiteSearchResults([])
    setSiteSearchQuery(site.siteName || '')
    setSiteForm({
      siteName: site.siteName || '',
      latitude: site.latitude ?? '',
      longitude: site.longitude ?? '',
      radiusMeters: site.radiusMeters ?? 500,
      notes: site.notes || '',
      active: site.active !== false,
    })
  }

  const handleDeleteSite = async (siteId) => {
    if (!user?.orgId) return
    if (!confirm('Delete this site geofence configuration?')) return
    try {
      await deleteDoc(doc(db, 'organisations', user.orgId, 'sites', siteId))
      if (editingSiteId === siteId) resetSiteForm()
    } catch (error) {
      alert(`Failed to delete site: ${error.message}`)
    }
  }

  const renderSiteGeofenceSettings = () => {
    return (
      <div className="space-y-6 no-print">
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-8 space-y-6">
          <div>
            <h2 className="text-lg font-black text-gray-800 uppercase tracking-widest">Site Geofence Configuration</h2>
            <p className="text-xs text-gray-400 font-medium mt-1">
              Search location on map, pick coordinates, and set geofence radius for attendance validation.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="lg:col-span-2">
              <label className="text-[11px] font-semibold text-gray-500 uppercase tracking-[0.14em] leading-tight block mb-1">Site Name</label>
              <input
                type="text"
                value={siteForm.siteName}
                onChange={e => setSiteForm(prev => ({ ...prev, siteName: e.target.value }))}
                placeholder="Ex: Chennai Warehouse"
                className="w-full h-11 rounded-xl border border-gray-200 px-3 text-sm outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
              />
            </div>
            <div className="lg:col-span-2">
              <label className="text-[11px] font-semibold text-gray-500 uppercase tracking-[0.14em] leading-tight block mb-1">Map Search</label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={siteSearchQuery}
                  onChange={e => setSiteSearchQuery(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter') {
                      e.preventDefault()
                      handleSiteLocationSearch()
                    }
                  }}
                  placeholder="Search address, area, or landmark"
                  className="flex-1 h-11 rounded-xl border border-gray-200 px-3 text-sm outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                />
                <button
                  type="button"
                  onClick={handleSiteLocationSearch}
                  className="h-11 px-4 rounded-xl border border-indigo-200 bg-indigo-50 text-indigo-700 text-[10px] font-black uppercase tracking-[0.14em] hover:bg-indigo-100 transition-all flex items-center gap-2"
                >
                  <Search size={13} />
                  {siteSearchLoading ? 'Searching...' : 'Search'}
                </button>
                <button
                  type="button"
                  onClick={handleUseCurrentLocation}
                  className="h-11 px-4 rounded-xl border border-emerald-200 bg-emerald-50 text-emerald-700 text-[10px] font-black uppercase tracking-[0.14em] hover:bg-emerald-100 transition-all"
                >
                  {siteGeoLocating ? 'Locating...' : 'Use My Location'}
                </button>
              </div>
              {(siteForm.latitude && siteForm.longitude) && (
                <div className="mt-2 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-[11px] text-gray-600">
                  Selected: <span className="font-semibold">{Number(siteForm.latitude).toFixed(6)}, {Number(siteForm.longitude).toFixed(6)}</span>
                  <a
                    href={`https://www.google.com/maps?q=${siteForm.latitude},${siteForm.longitude}`}
                    target="_blank"
                    rel="noreferrer"
                    className="ml-2 text-indigo-600 font-semibold hover:underline"
                  >
                    Open in map
                  </a>
                </div>
              )}
              {siteSearchResults.length > 0 && (
                <div className="mt-2 rounded-xl border border-gray-200 bg-white shadow-sm max-h-56 overflow-y-auto">
                  {siteSearchResults.map(result => (
                    <button
                      key={result.id}
                      type="button"
                      onClick={() => handleSelectSiteLocation(result)}
                      className="w-full text-left px-3 py-2.5 border-b border-gray-100 last:border-b-0 hover:bg-indigo-50/50 transition-colors"
                    >
                      <p className="text-[12px] font-semibold text-gray-800 line-clamp-1">{result.label}</p>
                      <p className="text-[10px] text-gray-500 mt-0.5">
                        {Number(result.lat).toFixed(6)}, {Number(result.lng).toFixed(6)}
                      </p>
                    </button>
                  ))}
                </div>
              )}
            </div>
            <div className="lg:col-span-4">
              <label className="text-[11px] font-semibold text-gray-500 uppercase tracking-[0.14em] leading-tight block mb-2">
                Pick location on map (click or drag marker)
              </label>
              <MapLocationPicker
                latitude={siteForm.latitude}
                longitude={siteForm.longitude}
                onChange={handlePickLocationFromMap}
              />
            </div>
            <div>
              <label className="text-[11px] font-semibold text-gray-500 uppercase tracking-[0.14em] leading-tight block mb-1">Radius (meters)</label>
              <input
                type="number"
                min="50"
                max="5000"
                value={siteForm.radiusMeters}
                onChange={e => setSiteForm(prev => ({ ...prev, radiusMeters: e.target.value }))}
                className="w-full h-11 rounded-xl border border-gray-200 px-3 text-sm outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
              />
            </div>
            <div className="lg:col-span-3">
              <label className="text-[11px] font-semibold text-gray-500 uppercase tracking-[0.14em] leading-tight block mb-1">Notes</label>
              <input
                type="text"
                value={siteForm.notes}
                onChange={e => setSiteForm(prev => ({ ...prev, notes: e.target.value }))}
                placeholder="Optional notes (route, shift constraints, etc.)"
                className="w-full h-11 rounded-xl border border-gray-200 px-3 text-sm outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
              />
            </div>
            <div className="flex items-end">
              <label className="inline-flex items-center gap-2 text-sm text-gray-700 font-medium">
                <input
                  type="checkbox"
                  checked={siteForm.active !== false}
                  onChange={e => setSiteForm(prev => ({ ...prev, active: e.target.checked }))}
                />
                Active site
              </label>
            </div>
          </div>

          <div className="flex gap-3">
            <button
              onClick={handleSaveSite}
              className="h-11 px-5 rounded-xl bg-indigo-600 text-white text-xs font-black uppercase tracking-[0.14em] hover:bg-indigo-700 transition-all flex items-center gap-2"
            >
              <Save size={14} /> {editingSiteId ? 'Update Site' : 'Save Site'}
            </button>
            {editingSiteId && (
              <button
                onClick={resetSiteForm}
                className="h-11 px-5 rounded-xl bg-gray-100 text-gray-600 text-xs font-black uppercase tracking-[0.14em] hover:bg-gray-200 transition-all"
              >
                Cancel Edit
              </button>
            )}
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-100 flex items-center gap-2">
            <MapPin size={16} className="text-indigo-500" />
            <h3 className="text-sm font-black text-gray-800 uppercase tracking-widest">Configured Sites</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[700px]">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-[11px] font-bold text-gray-500 uppercase tracking-[0.14em] leading-tight">Site</th>
                  <th className="px-4 py-3 text-left text-[11px] font-bold text-gray-500 uppercase tracking-[0.14em] leading-tight">Coordinates</th>
                  <th className="px-4 py-3 text-left text-[11px] font-bold text-gray-500 uppercase tracking-[0.14em] leading-tight">Radius</th>
                  <th className="px-4 py-3 text-left text-[11px] font-bold text-gray-500 uppercase tracking-[0.14em] leading-tight">Status</th>
                  <th className="px-4 py-3 text-right text-[11px] font-bold text-gray-500 uppercase tracking-[0.14em] leading-tight">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {sites.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-4 py-10 text-center text-xs text-gray-400 uppercase tracking-widest">No sites configured yet</td>
                  </tr>
                ) : sites.map(site => (
                  <tr key={site.id} className="hover:bg-gray-50/70">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <Crosshair size={14} className="text-indigo-500" />
                        <div>
                          <p className="text-sm font-bold text-gray-800">{site.siteName || 'Site'}</p>
                          {site.notes ? <p className="text-[11px] text-gray-500">{site.notes}</p> : null}
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-700">
                      {Number(site.latitude).toFixed(6)}, {Number(site.longitude).toFixed(6)}
                    </td>
                    <td className="px-4 py-3 text-sm font-semibold text-gray-700">{site.radiusMeters || 500}m</td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-widest ${site.active !== false ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-100 text-gray-500'}`}>
                        {site.active !== false ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-2">
                        <button onClick={() => handleEditSite(site)} className="h-8 px-3 rounded-lg border border-gray-200 text-[10px] font-black uppercase tracking-widest text-gray-600 hover:bg-indigo-50 hover:border-indigo-200 hover:text-indigo-700">
                          Edit
                        </button>
                        <button onClick={() => handleDeleteSite(site.id)} className="h-8 px-3 rounded-lg border border-rose-200 text-[10px] font-black uppercase tracking-widest text-rose-600 hover:bg-rose-50">
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    )
  }

  const renderApprovalSettings = () => {
    const modules = [
      { id: 'Leave', label: 'Leave' },
      { id: 'Permission', label: 'Permission' },
      { id: 'Advance', label: 'Salary Advance' },
      { id: 'Expense', label: 'Expense Claim' },
      { id: 'Allowance', label: 'Allowance' },
    ]
    const approvalTypeLabels = {
      none: 'No Approval',
      single: 'Single Approval',
      multi: 'Multi-Stage'
    }

    return (
      <div className="space-y-6 no-print">
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-8">
          <div className="mb-8">
            <h2 className="text-lg font-normal text-gray-800 uppercase tracking-widest">Approval Workflows</h2>
            <p className="text-xs text-gray-400 font-medium mt-1">Configure how requests are approved in your organization.</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {modules.map(mod => {
              const current = approvalSettings.find(s => s.moduleName === mod.id)
              return (
                <div key={mod.id} className="bg-gray-50/50 rounded-2xl border border-gray-100 p-5 hover:shadow-md transition-all group">
                  <div className="flex justify-between items-start mb-4">
                    <div>
                      <h3 className="font-normal text-gray-800 uppercase tracking-tight text-sm">{mod.label}</h3>
                      <div className="flex items-center gap-2 mt-1">
                        <div className={`w-1.5 h-1.5 rounded-full ${current ? 'bg-emerald-500' : 'bg-gray-300'}`}></div>
                        <span className="text-[11px] font-semibold text-gray-500 uppercase tracking-[0.14em] leading-tight">
                          {current ? (approvalTypeLabels[current.type] || 'Configured') : 'Not Configured'}
                        </span>
                      </div>
                    </div>
                    <div className="bg-white p-2 rounded-xl border border-gray-100 shadow-sm group-hover:border-indigo-200 transition-colors">
                      <Edit size={14} className="text-gray-400 group-hover:text-indigo-600" />
                    </div>
                  </div>

                  <div className="mt-6">
                    <button
                      onClick={() => {
                        if (current) {
                          setEditingApproval(current)
                          setNewApproval({
                            ...current,
                            type: current.type || 'single',
                            approvers: current.approvers || [],
                            stages: current.stages?.length ? current.stages : [{ role: '', amountLimit: '' }]
                          })
                        } else {
                          setEditingApproval(null)
                          setNewApproval({ moduleName: mod.id, type: 'single', approvers: [], stages: [{ role: '', amountLimit: '' }] })
                        }
                        setShowAddApproval(true)
                      }}
                      className="w-full py-2.5 bg-white border border-gray-200 rounded-xl text-[10px] font-normal uppercase tracking-[0.1em] text-gray-600 hover:bg-indigo-600 hover:text-white hover:border-indigo-600 transition-all shadow-sm"
                    >
                      {current ? 'Update Policy' : 'Configure Policy'}
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        {showAddApproval && (
          <Modal 
            isOpen={showAddApproval} 
            title={`Configure Approval: ${newApproval.moduleName}`} 
            onClose={() => setShowAddApproval(false)}
          >
            <div className="space-y-8 p-1">
              {/* Policy Selection Cards */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <button
                  onClick={() => setNewApproval({ ...newApproval, type: 'none' })}
                  className={`relative p-5 rounded-2xl border-2 text-left transition-all ${newApproval.type === 'none' ? 'border-indigo-600 bg-indigo-50/30' : 'border-gray-100 hover:border-gray-200'}`}
                >
                  <div className={`w-10 h-10 rounded-xl mb-4 flex items-center justify-center ${newApproval.type === 'none' ? 'bg-indigo-600 text-white' : 'bg-gray-100 text-gray-400'}`}>
                    <X size={20} />
                  </div>
                  <h4 className="font-normal text-gray-800 uppercase text-xs tracking-tight">No Approval</h4>
                  <p className="text-[11px] text-slate-500 font-medium mt-1 leading-relaxed">Requests are auto-approved immediately after submission.</p>
                  {newApproval.type === 'none' && <div className="absolute top-3 right-3 w-2 h-2 rounded-full bg-indigo-600"></div>}
                </button>

                <button
                  onClick={() => setNewApproval({ ...newApproval, type: 'single' })}
                  className={`relative p-5 rounded-2xl border-2 text-left transition-all ${newApproval.type === 'single' ? 'border-indigo-600 bg-indigo-50/30' : 'border-gray-100 hover:border-gray-200'}`}
                >
                  <div className={`w-10 h-10 rounded-xl mb-4 flex items-center justify-center ${newApproval.type === 'single' ? 'bg-indigo-600 text-white' : 'bg-gray-100 text-gray-400'}`}>
                    <Check size={20} />
                  </div>
                  <h4 className="font-normal text-gray-800 uppercase text-xs tracking-tight">Single Approval</h4>
                  <p className="text-[11px] text-slate-500 font-medium mt-1 leading-relaxed">Any authorized person from the selected roles can approve.</p>
                  {newApproval.type === 'single' && <div className="absolute top-3 right-3 w-2 h-2 rounded-full bg-indigo-600"></div>}
                </button>

                <button
                  onClick={() => setNewApproval({ ...newApproval, type: 'multi' })}
                  className={`relative p-5 rounded-2xl border-2 text-left transition-all ${newApproval.type === 'multi' ? 'border-indigo-600 bg-indigo-50/30' : 'border-gray-100 hover:border-gray-200'}`}
                >
                  <div className={`w-10 h-10 rounded-xl mb-4 flex items-center justify-center ${newApproval.type === 'multi' ? 'bg-indigo-600 text-white' : 'bg-gray-100 text-gray-400'}`}>
                    <Filter size={20} />
                  </div>
                  <h4 className="font-normal text-gray-800 uppercase text-xs tracking-tight">Multi-Stage</h4>
                  <p className="text-[11px] text-slate-500 font-medium mt-1 leading-relaxed">Required sequential approval from multiple members.</p>
                  {newApproval.type === 'multi' && <div className="absolute top-3 right-3 w-2 h-2 rounded-full bg-indigo-600"></div>}
                </button>
              </div>

              {newApproval.type === 'none' ? (
                <div className="rounded-2xl border border-emerald-100 bg-emerald-50 p-5">
                  <p className="text-[11px] font-normal text-emerald-700">
                    Requests in this module will skip approval queues and be marked approved right away.
                  </p>
                </div>
              ) : newApproval.type === 'single' ? (
                <div className="space-y-4 animate-in fade-in duration-300">
                  <div className="bg-gray-50 rounded-2xl p-5 border border-gray-100">
                    <label className="text-[11px] font-semibold text-gray-500 uppercase tracking-[0.14em] leading-tight block mb-4">Select Authorized Roles</label>
                    <div className="grid grid-cols-2 gap-2">
                      {['Admin', 'HR', 'MD', 'Accountant', 'Finance'].map(role => (
                        <button
                          key={role}
                          onClick={() => {
                            const current = newApproval.approvers || []
                            const updated = current.includes(role) ? current.filter(r => r !== role) : [...current, role]
                            setNewApproval({ ...newApproval, approvers: updated })
                          }}
                          className={`px-4 py-2.5 text-[11px] font-normal rounded-xl border transition-all ${newApproval.approvers?.includes(role) ? 'bg-indigo-600 border-indigo-600 text-white shadow-md' : 'bg-white border-gray-200 text-gray-500 hover:border-indigo-300'}`}
                        >
                          {role}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="space-y-4 animate-in fade-in duration-300">
                  <div className="flex justify-between items-center px-1">
                    <label className="text-[11px] font-semibold text-gray-500 uppercase tracking-[0.14em] leading-tight">Workflow Stages</label>
                    <button
                      onClick={() => setNewApproval({ ...newApproval, stages: [...(newApproval.stages || []), { role: '', amountLimit: '' }] })}
                      className="text-[11px] font-normal text-indigo-600 hover:text-indigo-700 uppercase tracking-[0.14em] leading-tight"
                    >
                      + Add Stage
                    </button>
                  </div>
                  <div className="space-y-3">
                    {newApproval.stages?.map((stage, idx) => (
                      <div key={idx} className="flex gap-3 items-end bg-gray-50 p-4 rounded-2xl border border-gray-100 relative group/stage">
                        <div className="absolute -left-2 top-1/2 -translate-y-1/2 w-5 h-5 rounded-full bg-white border border-gray-200 flex items-center justify-center text-[11px] font-normal text-indigo-600 shadow-sm">{idx + 1}</div>
                        <div className="flex-1 space-y-1.5">
                          <label className="text-[11px] font-semibold text-gray-500 uppercase tracking-[0.14em] leading-tight">Stage Approver</label>
                          <select
                            value={stage.role}
                            onChange={(e) => {
                              const updated = [...newApproval.stages]
                              updated[idx].role = e.target.value
                              setNewApproval({ ...newApproval, stages: updated })
                            }}
                            className="w-full h-10 px-3 bg-white border border-gray-200 rounded-xl text-xs font-normal outline-none focus:ring-2 focus:ring-indigo-500"
                          >
                            <option value="">Select Role</option>
                            {['Admin', 'HR', 'MD', 'Accountant', 'Finance'].map(r => <option key={r} value={r}>{r}</option>)}
                          </select>
                        </div>
                        <button
                          onClick={() => setNewApproval({ ...newApproval, stages: newApproval.stages.filter((_, i) => i !== idx) })}
                          className="h-10 w-10 flex items-center justify-center text-gray-300 hover:text-red-500 transition-colors bg-white border border-gray-200 rounded-xl shadow-sm"
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    ))}
                    {newApproval.moduleName === 'Leave' && (
                      <div className="p-3 bg-amber-50 rounded-xl border border-amber-100 flex items-start gap-2">
                        <AlertCircle size={14} className="text-amber-500 shrink-0 mt-0.5" />
                        <p className="text-[11px] text-amber-700 font-medium">For Leave module, the final stage must be <span className="font-normal">MD</span>.</p>
                      </div>
                    )}
                  </div>
                </div>
              )}

              <div className="flex gap-3 pt-6 border-t border-gray-100">
                <button
                  onClick={() => setShowAddApproval(false)}
                  className="flex-1 h-12 bg-gray-50 text-gray-500 rounded-xl text-xs font-normal uppercase tracking-widest hover:bg-gray-100 transition-all"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSaveApproval}
                  className="flex-1 h-12 bg-indigo-600 text-white rounded-xl text-xs font-normal uppercase tracking-widest hover:bg-indigo-700 shadow-xl shadow-indigo-100 transition-all"
                >
                  Save Policy
                </button>
              </div>
            </div>
          </Modal>
        )}
      </div>
    )
  }

  const handlePrintRoster = () => { window.print() }

  useEffect(() => {
    setEmployeeDirectoryPage(1)
  }, [employeeDirectorySearch, employeeDirectoryStatus])

  const makeAllEmployeesAdmin = async () => {
    if (!user?.orgId) return
    if (!confirm('This will set ALL users in this organization to the "Admin" role with full permissions. Continue?')) return
    
    setSeeding(true)
    try {
      const usersQuery = query(collection(db, 'users'), where('orgId', '==', user.orgId))
      const usersSnap = await getDocs(usersQuery)
      
      const adminPermissions = allModulesList.reduce((acc, mod) => {
        acc[mod.id] = { view: true, create: true, edit: true, delete: true, approve: true, export: true, full: true }
        return acc
      }, {})

      const updates = usersSnap.docs.map(u => 
        updateDoc(doc(db, 'users', u.id), {
          role: 'Admin',
          permissions: adminPermissions
        })
      )
      
      await Promise.all(updates)
      
      // Update local state
      setUsers(prev => prev.map(u => ({ ...u, role: 'Admin', permissions: adminPermissions })))
      
      alert(`Successfully updated ${updates.length} users to Admin role!`)
    } catch (err) {
      console.error('Batch update error:', err)
      alert('Failed to update users: ' + err.message)
    } finally {
      setSeeding(false)
    }
  }

  const handleAddBankAccount = () => {
    try {
      setBankAccountError('')
      bankAccountSchema.parse(newBankAccount)
      
      const currentAccounts = Array.isArray(orgSettings.bankAccounts) ? orgSettings.bankAccounts : []
      setOrgSettings(s => ({
        ...s,
        bankAccounts: [...currentAccounts, { ...newBankAccount }]
      }))
      
      setNewBankAccount({
        bankName: '',
        accountNo: '',
        ifsc: '',
        branchName: ''
      })
    } catch (err) {
      if (err instanceof z.ZodError) {
        setBankAccountError(err.errors[0].message)
      } else {
        setBankAccountError(err.message)
      }
    }
  }

  const handleRemoveBankAccount = (index) => {
    const currentAccounts = Array.isArray(orgSettings.bankAccounts) ? orgSettings.bankAccounts : []
    setOrgSettings(s => ({
      ...s,
      bankAccounts: currentAccounts.filter((_, i) => i !== index)
    }))
  }

  const handleAddAdvanceCategory = () => {
    const trimmed = newAdvanceCategory.trim()
    if (!trimmed) return
    if (orgSettings.advanceCategories.some(cat => cat.toLowerCase() === trimmed.toLowerCase())) {
      alert('This category already exists.')
      return
    }
    setOrgSettings(s => ({ ...s, advanceCategories: [...s.advanceCategories, trimmed] }))
    setNewAdvanceCategory('')
  }

  const handleAddHoliday = () => {
    const name = newHoliday.name.trim()
    const date = newHoliday.date
    if (!name || !date) {
      alert('Holiday name and date are required.')
      return
    }
    setOrgSettings(s => ({ ...s, holidays: [...s.holidays, { name, date }] }))
    setNewHoliday({ name: '', date: '' })
  }

  const updateAttendancePolicy = (section, field, value) => {
    setOrgSettings(prev => {
      const currentPolicy = normalizeAttendancePolicy(prev.attendancePolicy)
      return {
        ...prev,
        attendancePolicy: {
          ...currentPolicy,
          [section]: {
            ...currentPolicy[section],
            [field]: value,
          },
        },
      }
    })
  }

  const activeEmployeesCount = employees.filter(emp => isEmployeeActiveStatus(emp.status)).length
  const currentSettingsMeta = settingsSubTabMeta[activeSubTab] || settingsSubTabMeta.organization
  const attendancePolicy = normalizeAttendancePolicy(orgSettings.attendancePolicy)
  const openMobileSettingsItem = (tab) => {
    setActiveSubTab(tab.id)
    setShowMobileSettingsIndex(false)
  }

  return (
    <div className="h-full flex flex-col text-[11px] font-inter text-slate-900">
      <style>{`
        @media print {
          body * { visibility: hidden; }
          .print-section, .print-section * { visibility: visible; }
          .print-section { position: absolute; left: 0; top: 0; width: 100%; }
          .no-print { display: none !important; }
        }
        .permissions-table th { color: #475569; font-weight: 700; background: #f8fafc; }
        .permissions-table td { border-bottom: 1px solid #f1f5f9; }
        .group-header { color: #1e293b; font-weight: 800; font-size: 13px; margin-top: 24px; margin-bottom: 12px; }
      `}</style>

      {!initialSubTab && (
        <>
          <div className={`md:hidden px-4 pt-10 pb-24 ${showMobileSettingsIndex ? '' : 'hidden'}`}>
            <div className="space-y-9">
              {mobileSettingsGroups.map((group) => {
                const items = visibleSubTabs
                  .filter((tab) => mobileSettingsItemMeta[tab.id]?.group === group)
                  .map((tab) => ({ ...tab, ...mobileSettingsItemMeta[tab.id] }))

                if (!items.length) return null

                return (
                  <section key={group}>
                    <h2 className="mb-3 px-2 text-[11px] font-bold uppercase tracking-[0.08em] text-[#24507d]">{group}</h2>
                    <div className="overflow-hidden rounded-[24px] border border-slate-200 bg-white">
                      {items.map((item, index) => {
                        const Icon = item.icon
                        return (
                          <button
                            key={item.id}
                            type="button"
                            onClick={() => openMobileSettingsItem(item)}
                            className={`group flex min-h-[80px] w-full items-center gap-4 px-5 text-left transition-colors active:bg-slate-50 ${index ? 'border-t border-slate-200' : ''}`}
                          >
                            <span className="flex h-9 w-9 shrink-0 items-center justify-center text-slate-600">
                              <Icon size={24} strokeWidth={1.9} />
                            </span>
                            <span className="min-w-0 flex-1">
                              <span className="block truncate text-[16px] font-semibold tracking-[-0.02em] text-slate-950">{item.title}</span>
                              <span className="mt-0.5 block truncate text-[12px] leading-5 text-slate-500">{item.detail}</span>
                            </span>
                            <ChevronRight size={23} strokeWidth={2.1} className="shrink-0 text-slate-950" aria-hidden="true" />
                          </button>
                        )
                      })}
                    </div>
                  </section>
                )
              })}
            </div>
          </div>

          <div className="hidden md:block">
            <SubTabsNav
              tabs={visibleSubTabs}
              activeTabId={activeSubTab}
              onTabChange={(tab) => setActiveSubTab(tab.id)}
            />
          </div>
        </>
      )}

      {!initialSubTab && !showMobileSettingsIndex && (
        <div className="md:hidden flex items-center gap-2 px-4 pt-4 pb-3">
          <button
            type="button"
            onClick={() => setShowMobileSettingsIndex(true)}
            className="-ml-2 flex h-10 items-center gap-1 rounded-full px-2 text-[14px] font-semibold text-slate-900 active:bg-slate-100"
          >
            <ChevronLeft size={21} strokeWidth={2.2} />
            <span>Settings</span>
          </button>
          <span className="min-w-0 truncate text-[12px] text-slate-500">{currentSettingsMeta.title}</span>
        </div>
      )}

      <div className={`flex-1 overflow-auto pr-1 ${showMobileSettingsIndex ? 'hidden md:block' : ''}`}>
        {activeSubTab === 'policy' && (
          <div className="max-w-6xl space-y-4 no-print">
            <div className={`${settingsPanelClassName} p-5 md:p-6`}>
              <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-start">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-indigo-600">Attendance rules</p>
                  <h2 className="mt-1 text-[24px] font-normal tracking-[-0.03em] text-slate-950">Policy</h2>
                  <p className="mt-2 max-w-2xl text-[13px] leading-6 text-slate-500">Set the rules that explain whether a day is Full Day, Half Day, or Absent. Grace changes the late calculation; it does not change the original punch.</p>
                </div>
                <span className={`inline-flex h-8 items-center rounded-full px-3 text-[11px] font-semibold ${attendancePolicy.status === 'published' ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'}`}>
                  {attendancePolicy.status === 'published' ? 'Published policy' : 'Draft / warning-first'}
                </span>
              </div>
              <div className="mt-5 grid gap-3 md:grid-cols-3">
                <div className="rounded-lg border border-slate-200 bg-slate-50/70 p-3"><span className="block text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500">Full Day threshold</span><strong className="mt-1 block text-lg font-normal text-slate-900">{attendancePolicy.fullDay.minimumWorkMinutes} min</strong><span className="text-[11px] text-slate-500">{attendancePolicy.fullDay.classificationMode === 'minutes' ? 'Fixed net working minutes' : 'Schedule percentage'}</span></div>
                <div className="rounded-lg border border-slate-200 bg-slate-50/70 p-3"><span className="block text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500">Arrival grace</span><strong className="mt-1 block text-lg font-normal text-slate-900">{attendancePolicy.gracePeriod.arrivalMinutes} min</strong><span className="text-[11px] text-slate-500">{attendancePolicy.gracePeriod.scope === 'per_shift' ? 'Per shift' : 'Per day'}</span></div>
                <div className="rounded-lg border border-slate-200 bg-slate-50/70 p-3"><span className="block text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500">Late consequence</span><strong className="mt-1 block text-lg font-normal text-slate-900">{attendancePolicy.latePenalty.enabled ? 'Configured' : 'Warnings only'}</strong><span className="text-[11px] text-slate-500">No deduction until enabled</span></div>
              </div>
            </div>

            <div className="grid max-w-6xl gap-4 xl:grid-cols-2">
              <section className={`${settingsPanelClassName} p-5 md:p-6`}>
                <div className="mb-5 flex items-start justify-between gap-3"><div><h3 className="text-[17px] font-normal text-slate-950">Full Day rules</h3><p className="mt-1 text-[12px] leading-5 text-slate-500">Choose the minimum work needed before the day is treated as complete.</p></div><span className="rounded-md bg-indigo-50 px-2 py-1 text-[10px] font-semibold text-indigo-700">1 / 3</span></div>
                <div className="space-y-4">
                  <label className="block"><span className={settingsSectionLabelClassName}>Classification method</span><select value={attendancePolicy.fullDay.classificationMode} onChange={e => updateAttendancePolicy('fullDay', 'classificationMode', e.target.value)} className={settingsInputClassName}><option value="minutes">Net working minutes</option><option value="percentage">Percentage of scheduled hours</option><option value="both">Both — use the stricter rule</option></select></label>
                  <div className="grid gap-3 sm:grid-cols-2"><label className="block"><span className={settingsSectionLabelClassName}>Full Day minimum minutes</span><input type="number" min="0" value={attendancePolicy.fullDay.minimumWorkMinutes} onChange={e => updateAttendancePolicy('fullDay', 'minimumWorkMinutes', Math.max(0, Number(e.target.value) || 0))} className={settingsInputClassName} /></label><label className="block"><span className={settingsSectionLabelClassName}>Full Day schedule %</span><input type="number" min="0" max="100" value={attendancePolicy.fullDay.fullDayPercent} onChange={e => updateAttendancePolicy('fullDay', 'fullDayPercent', Math.min(100, Math.max(0, Number(e.target.value) || 0)))} className={settingsInputClassName} /></label></div>
                  <div className="grid gap-3 sm:grid-cols-2"><label className="block"><span className={settingsSectionLabelClassName}>Half Day schedule %</span><input type="number" min="0" max="100" value={attendancePolicy.fullDay.halfDayPercent} onChange={e => updateAttendancePolicy('fullDay', 'halfDayPercent', Math.min(100, Math.max(0, Number(e.target.value) || 0)))} className={settingsInputClassName} /></label><label className="block"><span className={settingsSectionLabelClassName}>Below Half Day becomes</span><select value={attendancePolicy.fullDay.belowHalfDayStatus} onChange={e => updateAttendancePolicy('fullDay', 'belowHalfDayStatus', e.target.value)} className={settingsInputClassName}><option value="absent">Absent</option><option value="pending_review">Pending review</option></select></label></div>
                  <div className="rounded-lg border border-indigo-100 bg-indigo-50/60 p-3 text-[11px] leading-5 text-indigo-800">Example: with an 8-hour schedule and a 75% Full Day rule, the employee needs at least 6 net working hours. Approved leave, holidays, and site exceptions should be resolved before this rule is applied.</div>
                </div>
              </section>

              <section className={`${settingsPanelClassName} p-5 md:p-6`}>
                <div className="mb-5 flex items-start justify-between gap-3"><div><h3 className="text-[17px] font-normal text-slate-950">Grace period</h3><p className="mt-1 text-[12px] leading-5 text-slate-500">Keep raw lateness visible, then subtract the permitted arrival buffer.</p></div><span className="rounded-md bg-indigo-50 px-2 py-1 text-[10px] font-semibold text-indigo-700">2 / 3</span></div>
                <div className="space-y-4"><div className="grid gap-3 sm:grid-cols-2"><label className="block"><span className={settingsSectionLabelClassName}>Arrival grace minutes</span><input type="number" min="0" max="180" value={attendancePolicy.gracePeriod.arrivalMinutes} onChange={e => updateAttendancePolicy('gracePeriod', 'arrivalMinutes', Math.min(180, Math.max(0, Number(e.target.value) || 0)))} className={settingsInputClassName} /></label><label className="block"><span className={settingsSectionLabelClassName}>Departure buffer minutes</span><input type="number" min="0" max="180" value={attendancePolicy.gracePeriod.departureMinutes} onChange={e => updateAttendancePolicy('gracePeriod', 'departureMinutes', Math.min(180, Math.max(0, Number(e.target.value) || 0)))} className={settingsInputClassName} /></label></div><label className="block"><span className={settingsSectionLabelClassName}>Grace scope</span><select value={attendancePolicy.gracePeriod.scope} onChange={e => updateAttendancePolicy('gracePeriod', 'scope', e.target.value)} className={settingsInputClassName}><option value="per_shift">Per shift</option><option value="per_day">Once per day</option></select></label><div className="rounded-lg border border-slate-200 bg-slate-50 p-4"><div className="flex items-center justify-between text-[11px]"><span className="text-slate-500">08:00 shift · 08:30 arrival</span><span className="font-semibold text-amber-700">30 raw minutes</span></div><div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-200"><div className="h-full rounded-full bg-amber-400" style={{ width: `${Math.min(100, (30 / 60) * 100)}%` }} /></div><div className="mt-2 flex items-center justify-between text-[11px]"><span className="text-emerald-700">{Math.min(30, attendancePolicy.gracePeriod.arrivalMinutes)} grace minutes</span><strong className="text-slate-900">{Math.max(0, 30 - attendancePolicy.gracePeriod.arrivalMinutes)} chargeable late</strong></div></div></div>
              </section>
            </div>

            <section className={`${settingsPanelClassName} max-w-6xl p-5 md:p-6`}>
              <div className="mb-5 flex items-start justify-between gap-3"><div><h3 className="text-[17px] font-normal text-slate-950">Late penalties</h3><p className="mt-1 text-[12px] leading-5 text-slate-500">Start with warnings. Enable a financial consequence only after HR and payroll approve the policy.</p></div><span className="rounded-md bg-indigo-50 px-2 py-1 text-[10px] font-semibold text-indigo-700">3 / 3</span></div>
              <div className="grid gap-4 xl:grid-cols-[.8fr_1.2fr]"><div className="space-y-4"><label className="flex items-start gap-3 rounded-lg border border-slate-200 bg-slate-50/70 p-3"><input type="checkbox" checked={attendancePolicy.latePenalty.enabled} onChange={e => updateAttendancePolicy('latePenalty', 'enabled', e.target.checked)} className="mt-0.5 h-4 w-4 rounded border-slate-300 text-indigo-600" /><span><strong className="block text-[13px] font-semibold text-slate-900">Enable financial late penalties</strong><small className="mt-1 block text-[11px] leading-5 text-slate-500">Off by default. When off, the system records and escalates lateness without creating a deduction.</small></span></label><label className="block"><span className={settingsSectionLabelClassName}>Consequence method</span><select value={attendancePolicy.latePenalty.mode} onChange={e => updateAttendancePolicy('latePenalty', 'mode', e.target.value)} className={settingsInputClassName}><option value="warning_only">Warning only</option><option value="fixed_per_incident">Fixed amount per incident</option><option value="per_minute">Amount per chargeable minute</option><option value="progressive">Progressive incident steps</option></select></label><label className="block"><span className={settingsSectionLabelClassName}>Penalty trigger</span><select value={attendancePolicy.latePenalty.trigger} onChange={e => updateAttendancePolicy('latePenalty', 'trigger', e.target.value)} className={settingsInputClassName}><option value="after_grace">Only after grace is exceeded</option><option value="after_review">After HR review</option><option value="after_threshold">After incident threshold</option></select></label></div><div className="grid gap-4 sm:grid-cols-2"><label className="block"><span className={settingsSectionLabelClassName}>Fixed amount</span><input type="number" min="0" value={attendancePolicy.latePenalty.fixedAmount} onChange={e => updateAttendancePolicy('latePenalty', 'fixedAmount', Math.max(0, Number(e.target.value) || 0))} className={`${settingsInputClassName} disabled:bg-slate-100`} disabled={attendancePolicy.latePenalty.mode !== 'fixed_per_incident' || !attendancePolicy.latePenalty.enabled} /></label><label className="block"><span className={settingsSectionLabelClassName}>Amount per minute</span><input type="number" min="0" value={attendancePolicy.latePenalty.perMinuteAmount} onChange={e => updateAttendancePolicy('latePenalty', 'perMinuteAmount', Math.max(0, Number(e.target.value) || 0))} className={`${settingsInputClassName} disabled:bg-slate-100`} disabled={attendancePolicy.latePenalty.mode !== 'per_minute' || !attendancePolicy.latePenalty.enabled} /></label><label className="block"><span className={settingsSectionLabelClassName}>Incidents before penalty</span><input type="number" min="0" value={attendancePolicy.latePenalty.incidentsBeforePenalty} onChange={e => updateAttendancePolicy('latePenalty', 'incidentsBeforePenalty', Math.max(0, Number(e.target.value) || 0))} className={`${settingsInputClassName} disabled:bg-slate-100`} disabled={!attendancePolicy.latePenalty.enabled} /></label><label className="block"><span className={settingsSectionLabelClassName}>Review window</span><select value={attendancePolicy.latePenalty.reviewWindow} onChange={e => updateAttendancePolicy('latePenalty', 'reviewWindow', e.target.value)} className={`${settingsInputClassName} disabled:bg-slate-100`} disabled={!attendancePolicy.latePenalty.enabled}><option value="calendar_month">Calendar month</option><option value="payroll_period">Payroll period</option></select></label></div></div>
              <div className="mt-5 border-t border-slate-100 pt-4 text-[11px] leading-5 text-slate-500"><strong className="font-semibold text-slate-700">Policy safety:</strong> approved leave, holidays, weekly offs, field work, travel, and approved permissions must be evaluated before lateness. A missing punch goes to review; it does not become a penalty by itself.</div>
              <div className="mt-5 flex flex-wrap justify-end gap-3 border-t border-slate-100 pt-5"><button onClick={() => setOrgSettings(prev => ({ ...prev, attendancePolicy: normalizeAttendancePolicy(DEFAULT_ATTENDANCE_POLICY) }))} className="h-10 rounded-lg border border-slate-200 px-4 text-[11px] font-semibold text-slate-600 transition hover:bg-slate-50">Reset policy defaults</button><button onClick={() => handleSaveOrg('Attendance policy saved successfully!')} disabled={saving} className="h-10 rounded-lg bg-indigo-600 px-5 text-[11px] font-semibold text-white transition hover:bg-indigo-700 disabled:opacity-50">{saving ? 'Saving policy...' : 'Save policy'}</button></div>
            </section>
          </div>
        )}
        {activeSubTab === 'organization' && (
          loading ? (
            <div className="flex items-center justify-center py-16 text-gray-400">
              <svg className="animate-spin h-6 w-6 mr-3" viewBox="0 0 24 24" fill="none"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" /></svg>
              Loading organisation data...
            </div>
          ) : (
            <div className="grid max-w-6xl grid-cols-1 gap-4 lg:grid-cols-2 no-print">
              {/* Left Card - Organization Information */}
              <div className={`${settingsPanelClassName} p-4 space-y-3.5 md:p-5`}>
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-[0.16em] leading-tight text-indigo-600">Brand and profile</p>
                    <h3 className="mt-1 text-[18px] font-black tracking-tight leading-tight text-slate-950">Organization Information</h3>
                  </div>
                  <div className="rounded-full border border-emerald-100 bg-emerald-50 px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-[0.14em] leading-tight text-emerald-600">
                    {saved ? 'Saved' : 'Draft'}
                  </div>
                </div>

                {/* Logo Upload - Compact Horizontal Left/Right Aligned */}
                <div className={`${settingsInsetPanelClassName} p-3 grid grid-cols-[1.2fr_1.8fr] gap-4 items-center`}>
                  <div>
                    <p className="text-[11px] font-extrabold text-slate-900 leading-tight">Organization Logo</p>
                    <p className="text-[11px] text-slate-500 leading-normal mt-0.5">Supported: PNG, JPG, WebP. Click box to upload.</p>
                    {orgSettings.logoURL && (
                      <button
                        type="button"
                        onClick={async () => {
                          if (!window.confirm('Remove organization logo?')) return
                          try {
                            setOrgSettings(s => ({ ...s, logoURL: '' }))
                            setLogoError(false)
                            await setDoc(doc(db, 'organisations', user.orgId), { logoURL: '' }, { merge: true })
                            alert('Logo removed successfully!')
                          } catch (err) {
                            console.error('Failed to remove logo:', err)
                          }
                        }}
                        className="text-[10px] font-semibold text-rose-600 hover:text-rose-700 hover:underline mt-1 block"
                      >
                        Remove Logo
                      </button>
                    )}
                  </div>
                  <div className="flex justify-end">
                    <div className="relative flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-dashed border-slate-300 bg-white transition-all hover:border-indigo-400 shadow-sm">
                      {uploadingLogo ? (
                        <div className="flex flex-col items-center justify-center">
                          <svg className="animate-spin h-4 w-4 text-indigo-500" viewBox="0 0 24 24" fill="none">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                          </svg>
                        </div>
                      ) : orgSettings.logoURL && !logoError ? (
                        <img 
                          src={orgSettings.logoURL} 
                          className="w-full h-full object-cover rounded-xl" 
                          alt="Logo" 
                          onError={() => setLogoError(true)}
                        />
                      ) : (
                        <div className="flex flex-col items-center justify-center text-slate-400">
                          <Building2 className="w-5 h-5" />
                        </div>
                      )}
                      <input type="file" accept="image/*" className="absolute inset-0 opacity-0 cursor-pointer" disabled={uploadingLogo} onChange={async (e) => {
                        const file = e.target.files[0]
                        if (!file) return
                        
                        try {
                          setUploadingLogo(true)
                          const base64Url = await compressImageToBase64(file, 300, 300, 0.8)
                          if (base64Url) {
                            setLogoError(false)
                            setOrgSettings(s => ({ ...s, logoURL: base64Url }))
                            await setDoc(doc(db, 'organisations', user.orgId), { logoURL: base64Url }, { merge: true })
                            alert('Organisation logo updated successfully!')
                          }
                        } catch (err) {
                          console.error('Logo upload error:', err)
                          alert('Failed to upload logo: ' + err.message)
                        } finally {
                          setUploadingLogo(false)
                        }
                      }} />
                    </div>
                  </div>
                </div>

                {/* Form Fields - Labels Left, Inputs Right */}
                <div className="space-y-3">
                  <div className="grid grid-cols-[1.2fr_1.8fr] gap-4 items-center">
                    <label className={`${settingsSectionLabelClassName} mb-0`}>Organization Name<span className="text-red-500"> *</span></label>
                    <input
                      type="text"
                      value={orgSettings.name || ''}
                      onChange={e => setOrgSettings(s => ({ ...s, name: e.target.value }))}
                      className={settingsInputClassName}
                    />
                  </div>

                  <div className="grid grid-cols-[1.2fr_1.8fr] gap-4 items-center">
                    <label className={`${settingsSectionLabelClassName} mb-0`}>Email</label>
                    <input
                      type="text"
                      value={orgSettings.email || ''}
                      onChange={e => setOrgSettings(s => ({ ...s, email: e.target.value }))}
                      className={settingsInputClassName}
                    />
                  </div>

                  <div className="grid grid-cols-[1.2fr_1.8fr] gap-4 items-center">
                    <label className={`${settingsSectionLabelClassName} mb-0`}>GSTIN</label>
                    <input
                      type="text"
                      value={orgSettings.gstin || ''}
                      onChange={e => setOrgSettings(s => ({ ...s, gstin: e.target.value }))}
                      className={settingsInputClassName}
                    />
                  </div>

                  <div className="grid grid-cols-[1.2fr_1.8fr] gap-4 items-start pt-0.5">
                    <div className="pt-1">
                      <label className={`${settingsSectionLabelClassName} mb-0`}>Address</label>
                    </div>
                    <textarea
                      value={orgSettings.address || ''}
                      onChange={e => setOrgSettings(s => ({ ...s, address: e.target.value }))}
                      rows={1.5}
                      className={settingsTextareaClassName}
                    />
                  </div>

                  <div className="grid grid-cols-[1.2fr_1.8fr] gap-4 items-start pt-0.5">
                    <div className="pt-1">
                      <label className={`${settingsSectionLabelClassName} mb-0`}>Branch Address</label>
                    </div>
                    <textarea
                      value={orgSettings.branchAddress || ''}
                      onChange={e => setOrgSettings(s => ({ ...s, branchAddress: e.target.value }))}
                      rows={1.5}
                      className={settingsTextareaClassName}
                    />
                  </div>
                </div>

                {/* Attendance Remarks Options */}
                <div className="grid grid-cols-[1.2fr_1.8fr] gap-4 items-start pt-1.5">
                  <div>
                    <label className={`${settingsSectionLabelClassName} mb-0`}>Attendance Remarks</label>
                    <p className="text-[11px] text-slate-500 leading-normal mt-0.5">Add client or site names for the dropdown list.</p>
                  </div>

                  <div className="space-y-2">
                    {/* Chip List */}
                    {(orgSettings.remarksOptions || []).length > 0 && (
                      <div className="flex flex-wrap gap-1.5 p-1.5 bg-zinc-50 border border-zinc-200 rounded-lg min-h-[36px] max-h-[70px] overflow-y-auto">
                        {(orgSettings.remarksOptions || []).map((opt, idx) => (
                          <span key={idx} className="inline-flex items-center gap-1 bg-indigo-50 text-indigo-700 text-[10px] font-bold pl-2 pr-0.5 py-0.5 rounded-md">
                            {opt}
                            <button
                              type="button"
                              onClick={() => setOrgSettings(s => ({ ...s, remarksOptions: s.remarksOptions.filter((_, i) => i !== idx) }))}
                              className="hover:bg-indigo-100 rounded p-0.5 text-indigo-500 hover:text-indigo-800 transition-colors"
                              title={`Remove ${opt}`}
                            >
                              <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                            </button>
                          </span>
                        ))}
                      </div>
                    )}

                    {/* Add New Input */}
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={orgSettings.newRemarkOption || ''}
                        onChange={e => setOrgSettings(s => ({ ...s, newRemarkOption: e.target.value }))}
                        onKeyDown={e => {
                          if (e.key === 'Enter') {
                            e.preventDefault()
                            const val = (orgSettings.newRemarkOption || '').trim()
                            if (val && !(orgSettings.remarksOptions || []).includes(val)) {
                              setOrgSettings(s => ({ ...s, remarksOptions: [...(s.remarksOptions || []), val], newRemarkOption: '' }))
                            }
                          }
                        }}
                        className={`${settingsInputClassName} !h-9 !py-1 text-xs`}
                        placeholder="Type a name and press Enter..."
                      />
                      <button
                        type="button"
                        onClick={() => {
                          const val = (orgSettings.newRemarkOption || '').trim()
                          if (val && !(orgSettings.remarksOptions || []).includes(val)) {
                            setOrgSettings(s => ({ ...s, remarksOptions: [...(s.remarksOptions || []), val], newRemarkOption: '' }))
                          }
                        }}
                        className="px-3 bg-indigo-600 text-white text-[10px] font-bold uppercase tracking-wider rounded-lg hover:bg-indigo-700 transition-colors shrink-0"
                      >
                        Add
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              {/* Right Card - Structure & Accounts */}
              <div className={`${settingsPanelClassName} p-4 space-y-3.5 md:p-5`}>
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-[0.16em] leading-tight text-indigo-600">Operations and access</p>
                    <h3 className="mt-1 text-[18px] font-black tracking-[-0.03em] text-slate-950">Structure & Accounts</h3>
                  </div>
                </div>

                <div className="space-y-3">
                  {/* Hierarchy */}
                  <div className="grid grid-cols-[1.2fr_1.8fr] gap-4 items-start pt-0.5">
                    <div className="pt-1">
                      <label className={`${settingsSectionLabelClassName} mb-0`}>Hierarchy</label>
                      <p className="text-[11px] text-slate-500 leading-normal mt-0.5">Define reporting structure.</p>
                    </div>
                    <textarea
                      value={orgSettings.hierarchy || ''}
                      onChange={e => setOrgSettings(s => ({ ...s, hierarchy: e.target.value }))}
                      rows={1.5}
                      placeholder="CEO > Manager > Staff"
                      className={settingsTextareaClassName}
                    />
                  </div>

                  {/* Branches */}
                  <div className="grid grid-cols-[1.2fr_1.8fr] gap-4 items-start pt-0.5">
                    <div className="pt-1">
                      <label className={`${settingsSectionLabelClassName} mb-0`}>Branches</label>
                      <p className="text-[11px] text-slate-500 leading-normal mt-0.5">Branch office locations.</p>
                    </div>
                    <textarea
                      value={orgSettings.branches || ''}
                      onChange={e => setOrgSettings(s => ({ ...s, branches: e.target.value }))}
                      rows={1.5}
                      placeholder="Chennai, Mumbai, Bangalore"
                      className={settingsTextareaClassName}
                    />
                  </div>

                  {/* Bank Accounts */}
                  <div className="grid grid-cols-[1.2fr_1.8fr] gap-4 items-start pt-0.5">
                    <div className="pt-1">
                      <label className={`${settingsSectionLabelClassName} mb-0`}>Bank Accounts</label>
                      <p className="text-[11px] text-slate-500 leading-normal mt-0.5">Official company bank details. Add multiple accounts.</p>
                    </div>
                    <div className="space-y-3 w-full">
                      {/* Bank Accounts List */}
                      {Array.isArray(orgSettings.bankAccounts) && orgSettings.bankAccounts.length > 0 ? (
                        <div className="space-y-2 max-h-[110px] overflow-y-auto pr-1">
                          {orgSettings.bankAccounts.map((acc, idx) => (
                            <div key={idx} className="flex items-center justify-between p-2 bg-zinc-50 border border-zinc-200 rounded-lg text-[11px] leading-tight">
                              <div className="space-y-0.5">
                                <p className="font-extrabold text-slate-900">{acc.bankName}</p>
                                <p className="text-slate-500 font-mono text-[11px]">A/C: {acc.accountNo} | IFSC: {acc.ifsc}</p>
                                <p className="text-slate-400 text-[11px]">Branch: {acc.branchName}</p>
                              </div>
                              <button
                                type="button"
                                onClick={() => handleRemoveBankAccount(idx)}
                                className="p-1 hover:bg-red-50 text-slate-400 hover:text-red-600 rounded-md transition-colors shrink-0"
                                title="Remove Bank Account"
                              >
                                <Trash2 size={12} />
                              </button>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="text-slate-400 text-[10px] italic">No bank accounts added yet.</p>
                      )}

                      {/* Add New Bank Account Form */}
                      <div className="border border-slate-200/80 rounded-xl p-2.5 bg-white space-y-2">
                        <p className="text-[11px] font-bold text-slate-700 uppercase tracking-[0.14em] leading-tight">Add Bank Account</p>
                        
                        <div className="grid grid-cols-2 gap-2">
                          <input
                            type="text"
                            placeholder="Bank Name"
                            value={newBankAccount.bankName}
                            onChange={e => setNewBankAccount(prev => ({ ...prev, bankName: e.target.value }))}
                            className={`${settingsInputClassName} !h-8 !px-2.5 text-xs`}
                          />
                          <input
                            type="text"
                            placeholder="Account Number"
                            value={newBankAccount.accountNo}
                            onChange={e => setNewBankAccount(prev => ({ ...prev, accountNo: e.target.value }))}
                            className={`${settingsInputClassName} !h-8 !px-2.5 text-xs`}
                          />
                        </div>

                        <div className="grid grid-cols-2 gap-2">
                          <input
                            type="text"
                            placeholder="IFSC Code"
                            value={newBankAccount.ifsc}
                            onChange={e => setNewBankAccount(prev => ({ ...prev, ifsc: e.target.value.toUpperCase() }))}
                            className={`${settingsInputClassName} !h-8 !px-2.5 text-xs`}
                          />
                          <input
                            type="text"
                            placeholder="Branch Name"
                            value={newBankAccount.branchName}
                            onChange={e => setNewBankAccount(prev => ({ ...prev, branchName: e.target.value }))}
                            className={`${settingsInputClassName} !h-8 !px-2.5 text-xs`}
                          />
                        </div>

                        {bankAccountError && (
                          <p className="text-[11px] text-red-500 font-semibold">{bankAccountError}</p>
                        )}

                        <button
                          type="button"
                          onClick={handleAddBankAccount}
                          className="w-full h-8 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-[11px] font-bold uppercase tracking-[0.14em] leading-tight transition-colors"
                        >
                          Add Bank Account
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* Invite Code */}
                  <div className="grid grid-cols-[1.2fr_1.8fr] gap-4 items-center">
                    <label className={`${settingsSectionLabelClassName} mb-0`}>Invite Code</label>
                    <div className="flex gap-2">
                      <div className="flex-1 rounded-xl border border-slate-200 bg-white px-3 py-2 font-mono text-xs text-indigo-600 select-all leading-tight flex items-center justify-center min-h-[36px]">
                        {orgSettings.code || 'N/A'}
                      </div>
                      <button
                        onClick={() => {
                          navigator.clipboard.writeText(orgSettings.code)
                          alert('Invite code copied!')
                        }}
                        className="rounded-xl border border-slate-200 bg-slate-100 px-3 py-2 text-xs font-bold text-slate-700 transition-all hover:bg-slate-200 shrink-0"
                      >
                        Copy
                      </button>
                    </div>
                  </div>

                  {/* Employee Login Link */}
                  <div className="grid grid-cols-[1.2fr_1.8fr] gap-4 items-center">
                    <div>
                      <label className={`${settingsSectionLabelClassName} mb-0`}>Employee Link</label>
                      <p className="text-[11px] text-slate-500 leading-normal mt-0.5">Link for registration.</p>
                    </div>
                    <div className="flex gap-2">
                      <div className="flex-1 rounded-xl border border-slate-200 bg-white px-3 py-2 font-mono text-[10px] text-indigo-600 break-all select-all flex items-center min-h-[36px]">
                        {typeof window !== 'undefined' ? `${window.location.origin}/login` : ''}
                      </div>
                      <button
                        onClick={() => {
                          const link = `${window.location.origin}/login`
                          navigator.clipboard.writeText(link)
                          alert('Login link copied!')
                        }}
                        className="flex items-center gap-1 rounded-xl bg-indigo-600 px-3 py-2 text-xs font-bold text-white transition-all hover:bg-indigo-700 shrink-0"
                      >
                        <Share2 size={12} /> Share
                      </button>
                    </div>
                  </div>
                </div>

                {/* Error Message */}
                {orgError && <div className="text-red-500 text-sm font-medium">{orgError}</div>}

                {/* Save Button */}
                <button
                  onClick={() => handleSaveOrg()}
                  disabled={saving}
                  className={`flex h-10 w-full items-center justify-center rounded-xl text-[11px] font-black uppercase tracking-[0.18em] text-white transition-all ${
                    saved ? 'bg-emerald-500' : 'bg-slate-950 hover:-translate-y-0.5 hover:shadow-lg'
                  }`}
                >
                  {saving ? 'SAVING...' : saved ? 'SAVED ✓' : 'SAVE ALL CHANGES'}
                </button>
              </div>
            </div>
          )
        )}

        {activeSubTab === 'advance_cat' && (
          <div className="grid max-w-5xl grid-cols-1 gap-5 xl:grid-cols-[0.85fr_1.15fr] no-print">
            <div className={`${settingsPanelClassName} p-6 md:p-7`}>
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] leading-tight text-indigo-600">Create category</p>
              <h3 className="mt-2 text-[22px] font-normal tracking-[-0.03em] text-slate-950">Advance Categories</h3>
              <p className="mt-2 text-[13px] leading-6 text-slate-500">
                Add request types inline so the finance setup stays quick and predictable for the whole team.
              </p>

              <div className={`${settingsInsetPanelClassName} mt-6 space-y-4 p-5`}>
                <div>
                  <label className={settingsSectionLabelClassName}>Category Name</label>
                  <input
                    type="text"
                    value={newAdvanceCategory}
                    onChange={e => setNewAdvanceCategory(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') handleAddAdvanceCategory() }}
                    className={settingsInputClassName}
                    placeholder="e.g. Laptop Purchase"
                  />
                </div>
                <button
                  type="button"
                  onClick={handleAddAdvanceCategory}
                  className="inline-flex items-center gap-2 rounded-2xl bg-slate-950 px-4 py-3 text-[12px] font-normal uppercase tracking-[0.16em] text-white transition-all hover:bg-slate-800"
                >
                  <Plus size={14} />
                  Add Category
                </button>
              </div>

              <div className={`${settingsInsetPanelClassName} mt-4 space-y-4 p-5`}>
                <div>
                  <label className={settingsSectionLabelClassName}>Maximum Advance Amount (₹)</label>
                  <p className="mt-1 text-[11px] text-slate-500">Set a cap per advance request. Leave empty for no limit.</p>
                  <input
                    type="number"
                    min="0"
                    value={orgSettings.maxAdvanceAmount}
                    onChange={e => setOrgSettings(s => ({ ...s, maxAdvanceAmount: e.target.value }))}
                    className={`${settingsInputClassName} mt-2`}
                    placeholder="e.g. 50000"
                  />
                </div>
              </div>

              <div className={`${settingsInsetPanelClassName} mt-4 space-y-4 p-5`}>
                <div>
                  <label className={settingsSectionLabelClassName}>Expense Category Limits (₹)</label>
                  <p className="mt-1 text-[11px] text-slate-500">Set maximum amount per expense category. Leave empty for no limit.</p>
                  <div className="mt-3 space-y-2">
                    {orgSettings.advanceCategories.map(cat => (
                      <div key={cat} className="flex items-center gap-2">
                        <span className="text-[11px] text-slate-700 w-32 truncate">{cat}</span>
                        <input
                          type="number"
                          min="0"
                          value={orgSettings.expenseCategoryLimits?.[cat] || ''}
                          onChange={e => setOrgSettings(s => ({
                            ...s,
                            expenseCategoryLimits: { ...s.expenseCategoryLimits, [cat]: e.target.value }
                          }))}
                          className="flex-1 h-9 border border-slate-200 rounded-lg px-3 text-[12px] font-normal outline-none focus:ring-2 focus:ring-indigo-500 bg-white"
                          placeholder="No limit"
                        />
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            <div className={`${settingsPanelClassName} overflow-hidden`}>
              <div className="flex items-center justify-between border-b border-slate-200 px-6 py-5">
                <div>
                  <p className="text-[10px] font-normal uppercase tracking-[0.18em] text-slate-400">Current list</p>
                  <h4 className="mt-2 text-[18px] font-normal tracking-[-0.03em] text-slate-950">{orgSettings.advanceCategories.length} Categories</h4>
                </div>
                <div className="rounded-full bg-indigo-50 px-3 py-1 text-[10px] font-normal uppercase tracking-[0.18em] text-indigo-600">
                  Inline editable
                </div>
              </div>

              <div className="divide-y divide-slate-200">
                {orgSettings.advanceCategories.length === 0 ? (
                  <div className="px-6 py-12 text-center text-[13px] font-medium text-slate-400">
                    No categories added yet.
                  </div>
                ) : orgSettings.advanceCategories.map((cat, i) => (
                  <div key={cat} className={`flex items-center justify-between gap-4 px-6 py-4 ${i % 2 === 0 ? 'bg-white' : 'bg-slate-50/80'}`}>
                    <div>
                      <p className="text-[13px] font-normal text-slate-900">{cat}</p>
                      <p className="mt-1 text-[11px] text-slate-500">Used in advance and expense request forms.</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setOrgSettings(s => ({ ...s, advanceCategories: s.advanceCategories.filter((_, idx) => idx !== i) }))}
                      className="rounded-2xl p-2 text-slate-400 transition-all hover:bg-rose-50 hover:text-rose-500"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                ))}
              </div>

              <div className="border-t border-slate-200 px-6 py-5">
                <button onClick={() => handleSaveOrg('Advance categories updated successfully!')} className="w-full rounded-[20px] bg-indigo-600 py-3 text-[12px] font-normal uppercase tracking-[0.18em] text-white transition-all hover:bg-indigo-700">
                  Save Categories
                </button>
              </div>
            </div>
          </div>
        )}

        {activeSubTab === 'holidays' && (
          <div className="grid max-w-6xl grid-cols-1 gap-5 xl:grid-cols-[0.9fr_1.1fr] no-print">
            <div className={`${settingsPanelClassName} p-6 md:p-7`}>
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] leading-tight text-indigo-600">Calendar entry</p>
              <h3 className="mt-2 text-[22px] font-normal tracking-[-0.03em] text-slate-950">Annual Holidays</h3>
              <p className="mt-2 text-[13px] leading-6 text-slate-500">
                Build the holiday calendar with proper date fields instead of popups, so updates are faster and less error-prone.
              </p>

              <div className={`${settingsInsetPanelClassName} mt-6 space-y-4 p-5`}>
                <div>
                  <label className={settingsSectionLabelClassName}>Holiday Name</label>
                  <input
                    type="text"
                    value={newHoliday.name}
                    onChange={e => setNewHoliday(s => ({ ...s, name: e.target.value }))}
                    className={settingsInputClassName}
                    placeholder="e.g. Independence Day"
                  />
                </div>
                <div>
                  <label className={settingsSectionLabelClassName}>Date</label>
                  <input
                    type="date"
                    value={newHoliday.date}
                    onChange={e => setNewHoliday(s => ({ ...s, date: e.target.value }))}
                    className={settingsInputClassName}
                  />
                </div>
                <button
                  type="button"
                  onClick={handleAddHoliday}
                  className="inline-flex items-center gap-2 rounded-2xl bg-slate-950 px-4 py-3 text-[12px] font-normal uppercase tracking-[0.16em] text-white transition-all hover:bg-slate-800"
                >
                  <Plus size={14} />
                  Add Holiday
                </button>
              </div>

              {/* Saturday Working Status */}
              <div className="border-t border-slate-200 px-6 py-5">
                <div className="rounded-xl border border-slate-200 bg-slate-50/50 p-4">
                  <div className="flex items-center justify-between mb-3">
                    <div>
                      <p className="text-[10px] font-normal uppercase tracking-[0.18em] text-slate-400">Saturday Configuration</p>
                      <h4 className="mt-1 text-[14px] font-normal text-slate-950">Configure Saturday as working day</h4>
                    </div>
                  </div>
                  <select
                    value={orgSettings.saturdayType || 'working'}
                    onChange={e => setOrgSettings(s => ({ ...s, saturdayType: e.target.value }))}
                    className="w-full rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-[12px] font-semibold text-slate-700"
                  >
                    <option value="working">Working Day (Regular pay)</option>
                    <option value="holiday1x">Holiday (1x Pay)</option>
                    <option value="holiday2x">Holiday (2x Pay - Double)</option>
                    <option value="alternative">Alternative Holiday (2x Pay)</option>
                  </select>
                  <p className="mt-2 text-[10px] text-slate-500">
                    This setting affects salary calculation. Old records will be recalculated when you save.
                  </p>
                </div>
              </div>

              {/* Sunday Working Status */}
              <div className="border-t border-slate-200 px-6 py-5">
                <div className="rounded-xl border border-slate-200 bg-slate-50/50 p-4">
                  <div className="flex items-center justify-between mb-3">
                    <div>
                      <p className="text-[10px] font-normal uppercase tracking-[0.18em] text-slate-400">Sunday Configuration</p>
                      <h4 className="mt-1 text-[14px] font-normal text-slate-950">Configure Sunday as working day</h4>
                    </div>
                  </div>
                  <select
                    value={orgSettings.sundayType || 'working'}
                    onChange={e => setOrgSettings(s => ({ ...s, sundayType: e.target.value }))}
                    className="w-full rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-[12px] font-semibold text-slate-700"
                  >
                    <option value="working">Working Day (Regular pay)</option>
                    <option value="holiday1x">Holiday (1x Pay)</option>
                    <option value="holiday2x">Holiday (2x Pay - Double)</option>
                    <option value="alternative">Alternative Holiday (2x Pay)</option>
                  </select>
                  <p className="mt-2 text-[10px] text-slate-500">
                    This setting affects salary calculation. Old records will be recalculated when you save.
                  </p>
                </div>
              </div>
            </div>

            <div className={`${settingsPanelClassName} overflow-hidden`}>
              <div className="flex items-center justify-between border-b border-slate-200 px-6 py-5">
                <div>
                  <p className="text-[10px] font-normal uppercase tracking-[0.18em] text-slate-400">Calendar list</p>
                  <h4 className="mt-2 text-[18px] font-normal tracking-[-0.03em] text-slate-950">{orgSettings.holidays.length} Holidays</h4>
                </div>
                <div className="rounded-full bg-amber-50 px-3 py-1 text-[10px] font-normal uppercase tracking-[0.18em] text-amber-600">
                  Annual schedule
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full border-collapse text-left">
                  <thead>
                    <tr className="bg-slate-50">
                      <th className="px-6 py-3 text-[10px] font-normal uppercase tracking-[0.18em] text-slate-500">Holiday</th>
                      <th className="px-6 py-3 text-[10px] font-normal uppercase tracking-[0.18em] text-slate-500">Date</th>
                      <th className="px-6 py-3 text-right text-[10px] font-normal uppercase tracking-[0.18em] text-slate-500">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {orgSettings.holidays
                      .map((holiday, originalIndex) => ({ holiday, originalIndex }))
                      .sort((a, b) => (a.holiday.date || '').localeCompare(b.holiday.date || ''))
                      .map(({ holiday, originalIndex }, i) => (
                        <tr key={`${holiday.name}-${holiday.date}-${originalIndex}`} className={i % 2 === 0 ? 'bg-white' : 'bg-slate-50/80'}>
                          <td className="px-6 py-4 text-[13px] font-normal text-slate-900">{holiday.name}</td>
                          <td className="px-6 py-4 font-mono text-[12px] text-indigo-600">{formatDateDDMMYYYY(holiday.date)}</td>
                          <td className="px-6 py-4 text-right">
                            <button
                              type="button"
                              onClick={() => setOrgSettings(s => ({ ...s, holidays: s.holidays.filter((_, idx) => idx !== originalIndex) }))}
                              className="rounded-2xl p-2 text-slate-400 transition-all hover:bg-rose-50 hover:text-rose-500"
                            >
                              <Trash2 size={16} />
                            </button>
                          </td>
                        </tr>
                      ))}
                    {orgSettings.holidays.length === 0 && (
                      <tr>
                        <td colSpan={3} className="px-6 py-12 text-center text-[13px] font-medium text-slate-400">
                          No holidays added yet.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>

              <div className="border-t border-slate-200 px-6 py-5">
                <button onClick={() => handleSaveOrg('Holiday list updated successfully!')} className="w-full rounded-[20px] bg-indigo-600 py-3 text-[12px] font-normal uppercase tracking-[0.18em] text-white transition-all hover:bg-indigo-700">
                  Update Holiday List
                </button>
              </div>
            </div>
          </div>
        )}

        {activeSubTab === 'site_geofence' && renderSiteGeofenceSettings()}

        {activeSubTab === 'approval_settings' && renderApprovalSettings()}

        {activeSubTab === 'allowance' && <AllowanceSettings />}

        {activeSubTab === 'employee' && (() => {
          const canCreateEmployee = isAdmin || userPermissions['Employees']?.create === true
          const canEditEmployee = isAdmin || userPermissions['Employees']?.edit === true
          const canDeleteEmployee = isAdmin || userPermissions['Employees']?.delete === true
          const orderedEmployees = getOrderedEmployees()
          const statusTabs = [
            { id: 'All', label: 'All', count: employees.length },
            { id: EMPLOYEE_STATUS_ACTIVE, label: EMPLOYEE_STATUS_ACTIVE, count: employees.filter(emp => normalizeEmployeeStatus(emp.status) === EMPLOYEE_STATUS_ACTIVE).length },
            { id: 'Inactive', label: 'Inactive', count: employees.filter(emp => normalizeEmployeeStatus(emp.status) === 'Inactive').length },
            { id: 'Rejoined', label: 'Rejoined', count: employees.filter(emp => normalizeEmployeeStatus(emp.status) === 'Rejoined').length },
          ]
          const searchTerm = employeeDirectorySearch.trim().toLowerCase()
          const filteredEmployees = orderedEmployees.filter(emp => {
            const normalizedStatus = normalizeEmployeeStatus(emp.status)
            const matchesStatus = employeeDirectoryStatus === 'All' || normalizedStatus === employeeDirectoryStatus
            if (!matchesStatus) return false
            if (!searchTerm) return true

            const searchable = [
              emp.empCode,
              emp.name,
              emp.email,
              emp.designation,
              emp.department,
              emp.site,
              emp.emergencyContact,
              emp.shift?.name,
            ]
              .filter(Boolean)
              .join(' ')
              .toLowerCase()

            return searchable.includes(searchTerm)
          })
          const pageSize = 10
          const totalPages = Math.max(1, Math.ceil(filteredEmployees.length / pageSize))
          const currentPage = Math.min(employeeDirectoryPage, totalPages)
          const pageStart = (currentPage - 1) * pageSize
          const paginatedEmployees = filteredEmployees.slice(pageStart, pageStart + pageSize)
          const visiblePageNumbers = Array.from({ length: totalPages }, (_, index) => index + 1).filter(page =>
            totalPages <= 5 || Math.abs(page - currentPage) <= 1 || page === 1 || page === totalPages
          )
          const departmentPalette = [
            'bg-violet-50 text-violet-700',
            'bg-emerald-50 text-emerald-700',
            'bg-amber-50 text-amber-700',
            'bg-sky-50 text-sky-700',
            'bg-rose-50 text-rose-700',
            'bg-indigo-50 text-indigo-700',
          ]
          const departmentLookup = [...new Set(employees.map(emp => emp.department).filter(Boolean))]

          const FILTER_OPTIONS = [
            { id: 'All', label: 'All' },
            { id: 'Active', label: 'Active' },
            { id: 'Inactive', label: 'Inactive' },
            { id: 'Rejoined', label: 'Rejoined' }
          ]

          return (
            <div className="space-y-4 no-print">
              <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between bg-white border border-[#EAEAEA] rounded-2xl p-5 shadow-[0_8px_30px_rgb(0,0,0,0.04)]">
                <div>
                  <h2 className="text-[18px] font-bold text-slate-900">Employee Directory</h2>
                  <p className="text-[12px] text-slate-500 mt-0.5">Track people, roles, and employee records from one operational list.</p>
                </div>
                <div className="flex items-center gap-3">
                  <button
                    onClick={() => { setRowOrder(employees.map(e => e.id)); setShowRowOrder(true) }}
                    className="inline-flex h-10 items-center gap-2 rounded-xl border border-slate-200 px-4 text-[12px] font-semibold text-slate-600 transition-all hover:border-slate-300 hover:bg-slate-50"
                  >
                    <Filter size={14} />
                    Row Order
                  </button>
                  {canCreateEmployee && (
                    <button
                      onClick={() => setShowAddEmployee(true)}
                      className="inline-flex h-10 items-center gap-2 rounded-xl bg-indigo-600 px-4 text-[12px] font-semibold text-white transition-all hover:bg-indigo-700 shadow-sm"
                    >
                      <Plus size={14} />
                      Add Employee
                    </button>
                  )}
                </div>
              </div>

              <ReusableTable
                data={paginatedEmployees}
                columns={employeeColumns}
                loading={empLoading}
                page={currentPage}
                pageSize={employeeDirectoryPageSize}
                totalRows={filteredEmployees.length}
                searchable
                selectable
                sortable
                pagination
                onPageChange={setEmployeeDirectoryPage}
                onPageSizeChange={(sz) => { setEmployeeDirectoryPageSize(sz); setEmployeeDirectoryPage(1); }}
                onSearch={(val) => { setEmployeeDirectorySearch(val); setEmployeeDirectoryPage(1); }}
                filterOptions={FILTER_OPTIONS}
                selectedFilterId={employeeDirectoryStatus}
                onFilterSelect={(id) => { setEmployeeDirectoryStatus(id); setEmployeeDirectoryPage(1); }}
                selectedRowIds={employeeDirectorySelectedIds}
                onRowSelectChange={(row, checked) => {
                  setEmployeeDirectorySelectedIds(prev => {
                    const next = new Set(prev)
                    if (checked) next.add(row.id)
                    else next.delete(row.id)
                    return next
                  })
                }}
                onSelectAllChange={(checked) => {
                  if (checked) {
                    setEmployeeDirectorySelectedIds(new Set(paginatedEmployees.map(r => r.id)))
                  } else {
                    setEmployeeDirectorySelectedIds(new Set())
                  }
                }}
                rowActions={getRowActions}
                bulkActions={bulkActions}
                hiddenColumnIds={employeeDirectoryHiddenColumns}
                onColumnVisibilityChange={setEmployeeDirectoryHiddenColumns}
                mandatoryColumnIds={['name', 'status']}
                emptyTitle="No employees found"
                emptySubtitle="Try adjusting your filters or search query."
              />
            </div>
          )
        })()}

        {false && activeSubTab === 'employee' && (() => {
          // Derive filter options
          const deptOptions = [...new Set(employees.map(e => e.department).filter(Boolean))]
          const statusOptions = ['All', ...EMPLOYEE_STATUS_OPTIONS]

  const canCreateEmployee = isAdmin || userPermissions['Employees']?.create === true
  const canEditEmployee = isAdmin || userPermissions['Employees']?.edit === true
  const canDeleteEmployee = isAdmin || userPermissions['Employees']?.delete === true

  return (
    <div className="space-y-3 no-print">
      {/* ── Header ─────────────────────────────────── */}
      <div className="bg-white rounded-xl border border-[#E5E7EB] shadow-sm">
        <div className="flex items-center justify-between px-5 py-4 border-b border-[#F3F4F6]">
          {/* Left: title + subtitle */}
          <div>
            <h2 className="text-[15px] font-semibold text-gray-900 tracking-tight">Employee Directory</h2>
            <p className="text-[12px] text-gray-400 mt-0.5">All employees in your organisation</p>
          </div>
          {/* Right: filters + add */}
          <div className="flex items-center gap-2">
            {/* Row Order button */}
            <button 
              onClick={() => { setRowOrder(employees.map(e => e.id)); setShowRowOrder(true); }}
              className="h-[34px] px-3 flex items-center gap-1.5 rounded-lg border border-[#E5E7EB] bg-white text-[12px] font-medium text-gray-600 hover:border-gray-300 hover:bg-gray-50 transition-all"
            >
              <Filter size={14} /> Row Order
            </button>

            {/* Column picker toggle */}
            <div className="relative group">
              <button className="h-[34px] px-3 flex items-center gap-1.5 rounded-lg border border-[#E5E7EB] bg-white text-[12px] font-medium text-gray-600 hover:border-gray-300 hover:bg-gray-50 transition-all">
                <svg className="w-3.5 h-3.5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h8m-8 6h16" /></svg>
                Columns
              </button>
              {/* Column picker dropdown */}
              <div className="absolute right-0 top-full mt-1 bg-white border border-[#E5E7EB] rounded-xl shadow-lg p-3 z-20 w-44 hidden group-focus-within:block">
                {allColumns.filter(c => c.optional).map(col => (
                  <label key={col.key} className="flex items-center gap-2.5 py-1.5 px-1 hover:bg-gray-50 rounded-lg cursor-pointer">
                    <input type="checkbox" checked={visibleColumns.includes(col.key)} onChange={() => setVisibleColumns(prev => prev.includes(col.key) ? prev.filter(k => k !== col.key) : [...prev, col.key])} className="w-3.5 h-3.5 rounded border-gray-300 text-gray-900 accent-gray-900" />
                    <span className="text-[12px] text-gray-600 font-medium">{col.label}</span>
                  </label>
                ))}
              </div>
            </div>

            {canCreateEmployee && (
              <button
                onClick={() => setShowAddEmployee(true)}
                className="h-[34px] px-4 bg-gray-900 text-white text-[12px] font-semibold rounded-lg hover:bg-gray-800 transition-all flex items-center gap-1.5"
              >
                <Plus size={14} /> Add Employee
              </button>
            )}
          </div>
        </div>

                {/* ── Table ─────────────────────────────────── */}
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse print-section">
                    <thead>
                      <tr className="bg-[#F9FAFB]">
                        <th className="px-5 py-3 text-[11px] font-semibold text-gray-500 uppercase tracking-wider whitespace-nowrap border-b border-[#F3F4F6] w-[40px]">#</th>
                        <th className="px-4 py-3 text-[11px] font-semibold text-gray-500 uppercase tracking-wider whitespace-nowrap border-b border-[#F3F4F6]">Employee</th>
                        {visibleColumns.includes('designation') && <th className="px-4 py-3 text-[11px] font-semibold text-gray-500 uppercase tracking-wider border-b border-[#F3F4F6]">Role</th>}
                        {visibleColumns.includes('department') && <th className="px-4 py-3 text-[11px] font-semibold text-gray-500 uppercase tracking-wider border-b border-[#F3F4F6]">Department</th>}
                        {visibleColumns.includes('emergencyContact') && <th className="px-4 py-3 text-[11px] font-semibold text-gray-500 uppercase tracking-wider border-b border-[#F3F4F6]">Contact</th>}
                        {visibleColumns.includes('status') && <th className="px-4 py-3 text-[11px] font-semibold text-gray-500 uppercase tracking-wider border-b border-[#F3F4F6]">Status</th>}
                        {visibleColumns.includes('empCode') && <th className="px-4 py-3 text-[11px] font-semibold text-gray-500 uppercase tracking-wider border-b border-[#F3F4F6]">ID</th>}
                        {visibleColumns.includes('email') && <th className="px-4 py-3 text-[11px] font-semibold text-gray-500 uppercase tracking-wider border-b border-[#F3F4F6]">Email</th>}
                        {visibleColumns.includes('joinedDate') && <th className="px-4 py-3 text-[11px] font-semibold text-gray-500 uppercase tracking-wider border-b border-[#F3F4F6]">Joined</th>}
                        {visibleColumns.includes('bloodGroup') && <th className="px-4 py-3 text-[11px] font-semibold text-gray-500 uppercase tracking-wider border-b border-[#F3F4F6]">Blood</th>}
                        {visibleColumns.includes('dob') && <th className="px-4 py-3 text-[11px] font-semibold text-gray-500 uppercase tracking-wider border-b border-[#F3F4F6]">DOB</th>}
                        {visibleColumns.includes('maritalStatus') && <th className="px-4 py-3 text-[11px] font-semibold text-gray-500 uppercase tracking-wider border-b border-[#F3F4F6]">Marital</th>}
                        {visibleColumns.includes('shift') && <th className="px-4 py-3 text-[11px] font-semibold text-gray-500 uppercase tracking-wider border-b border-[#F3F4F6]">Shift</th>}
                        {visibleColumns.includes('site') && <th className="px-4 py-3 text-[11px] font-semibold text-gray-500 uppercase tracking-wider border-b border-[#F3F4F6]">Site</th>}
                        {visibleColumns.includes('bankAccount') && <th className="px-4 py-3 text-[11px] font-semibold text-gray-500 uppercase tracking-wider border-b border-[#F3F4F6]">Bank Acc.</th>}
                        {visibleColumns.includes('photo') && <th className="px-4 py-3 text-[11px] font-semibold text-gray-500 uppercase tracking-wider border-b border-[#F3F4F6]">Photo</th>}
                        <th className="px-4 py-3 text-[11px] font-semibold text-gray-500 uppercase tracking-wider border-b border-[#F3F4F6] text-right no-print">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {empLoading ? (
                        <tr><td colSpan={20} className="text-center py-14"><Spinner /></td></tr>
                      ) : employees.length === 0 ? (
                        <tr><td colSpan={20} className="text-center py-16 text-gray-300 text-sm font-medium">No employees yet — click <span className="font-semibold text-gray-500">Add Employee</span> to get started</td></tr>
                      ) : getOrderedEmployees().map((emp, idx) => {
                        // Department badge colors
                        const deptColors = [
                          'bg-violet-50 text-violet-700',
                          'bg-emerald-50 text-emerald-700',
                          'bg-amber-50 text-amber-700',
                          'bg-sky-50 text-sky-700',
                          'bg-rose-50 text-rose-700',
                          'bg-indigo-50 text-indigo-700',
                        ]
                        const deptColor = (Array.isArray(deptOptions) && emp.department) 
                          ? (deptColors[deptOptions.indexOf(emp.department) % deptColors.length] || 'bg-gray-100 text-gray-600')
                          : 'bg-gray-100 text-gray-600'

                        // Status badge
                        const statusBadge = getEmployeeStatusBadgeClass(emp.status)

                        return (
                          <tr
                            key={emp.id}
                            className="group border-b border-[#F3F4F6] hover:bg-[#F9FAFB] transition-colors"
                            style={{ height: '52px' }}
                          >
                            {/* Index */}
                            <td className="px-5 py-3 text-[11px] text-gray-400 font-medium tabular-nums">{idx + 1}</td>

                            {/* Employee: avatar + name + email */}
                            <td className="px-4 py-3">
                              <button
                                onClick={() => { 
                                  if (!canEditEmployee) return;
                                  openEmployeeEditor(emp)
                                }}
                                className={`flex items-center gap-3 text-left ${!canEditEmployee ? 'cursor-default' : ''}`}
                              >
                                <div className="w-8 h-8 rounded-full shrink-0 overflow-hidden flex items-center justify-center text-white text-[11px] font-bold" style={{ backgroundColor: getAvatarColor(emp.id) }}>
                                  {emp.photoURL ? <img src={emp.photoURL} className="w-full h-full object-cover" alt="" /> : getInitials(emp.name)}
                                </div>
                                <div className="min-w-0">
                                  <p className="text-[13px] font-semibold text-gray-900 truncate leading-none">{emp.name}</p>
                                  {emp.email && <p className="text-[11px] text-gray-400 mt-0.5 truncate">{emp.email}</p>}
                                </div>
                              </button>
                            </td>

                            {/* Role / Designation */}
                            {visibleColumns.includes('designation') && (
                              <td className="px-4 py-3 text-[12px] text-gray-600 font-medium">{emp.designation || <span className="text-gray-300">—</span>}</td>
                            )}

                            {/* Department badge */}
                            {visibleColumns.includes('department') && (
                              <td className="px-4 py-3">
                                {emp.department
                                  ? <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-semibold ${deptColor}`}>{emp.department}</span>
                                  : <span className="text-gray-300 text-[12px]">—</span>
                                }
                              </td>
                            )}

                            {/* Contact */}
                            {visibleColumns.includes('emergencyContact') && (
                              <td className="px-4 py-3 text-[12px] text-gray-500 font-medium tabular-nums">{emp.emergencyContact || <span className="text-gray-300">—</span>}</td>
                            )}

                            {/* Status badge */}
                            {visibleColumns.includes('status') && (
                              <td className="px-4 py-3">
                                <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-semibold ${statusBadge}`}>
                                  {emp.status || 'Active'}
                                </span>
                              </td>
                            )}

                            {/* Emp ID */}
                            {visibleColumns.includes('empCode') && (
                              <td className="px-4 py-3 font-mono text-[11px] text-gray-400">{emp.empCode || <span className="text-gray-200">—</span>}</td>
                            )}

                            {/* Email */}
                            {visibleColumns.includes('email') && (
                              <td className="px-4 py-3 text-[11px] text-gray-400 max-w-[160px] truncate">{emp.email || <span className="text-gray-200">—</span>}</td>
                            )}

                            {/* Joined Date */}
                            {visibleColumns.includes('joinedDate') && (
                              <td className="px-4 py-3 text-[11px] text-gray-400 tabular-nums">{formatDateDDMMYYYY(emp.joinedDate || emp.doj)}</td>
                            )}

                            {/* Blood Group */}
                            {visibleColumns.includes('bloodGroup') && (
                              <td className="px-4 py-3">
                                {emp.bloodGroup
                                  ? <span className="px-2 py-0.5 rounded text-[11px] font-bold bg-red-50 text-red-600">{emp.bloodGroup}</span>
                                  : <span className="text-gray-200 text-[12px]">—</span>
                                }
                              </td>
                            )}

                            {/* DOB */}
                            {visibleColumns.includes('dob') && (
                              <td className="px-4 py-3 text-[11px] text-gray-400 tabular-nums">{emp.dob || <span className="text-gray-200">—</span>}</td>
                            )}

                            {/* Marital Status */}
                            {visibleColumns.includes('maritalStatus') && (
                              <td className="px-4 py-3 text-[11px] text-gray-400">{emp.maritalStatus || <span className="text-gray-200">—</span>}</td>
                            )}

                            {/* Shift */}
                            {visibleColumns.includes('shift') && (
                              <td className="px-4 py-3 text-[11px] text-gray-400">{emp.shift?.name || <span className="text-gray-200">—</span>}</td>
                            )}

                            {/* Site */}
                            {visibleColumns.includes('site') && (
                              <td className="px-4 py-3 text-[11px] text-gray-400">{emp.site || <span className="text-gray-200">—</span>}</td>
                            )}

                            {/* Bank Account */}
                            {visibleColumns.includes('bankAccount') && (
                              <td className="px-4 py-3 font-mono text-[11px] text-gray-400">{emp.bankAccount || <span className="text-gray-200">—</span>}</td>
                            )}

                            {/* Photo thumbnail */}
                            {visibleColumns.includes('photo') && (
                              <td className="px-4 py-3">
                                <div className="w-8 h-8 rounded-lg border border-gray-100 bg-gray-50 overflow-hidden">
                                  {emp.photoURL ? <img src={emp.photoURL} className="w-full h-full object-cover" alt="" /> : <span className="w-full h-full flex items-center justify-center text-gray-200 text-[9px]">—</span>}
                                </div>
                              </td>
                            )}

                            {/* Actions */}
                            <td className="px-4 py-3 text-right no-print">
                              <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                <button
                                  onClick={() => {
                                    if (emp.documents?.length) setViewerState({ docs: emp.documents, index: 0 })
                                  }}
                                  title="View documents"
                                  className={`p-1.5 rounded-md text-gray-400 transition-all ${emp.documents?.length ? 'hover:bg-gray-100 hover:text-gray-700' : 'opacity-20 cursor-default'}`}
                                >
                                  <Eye size={14} />
                                </button>
                                <button
                                  onClick={async () => {
                                    await openEmployeeEditor(emp)
                                  }}
                                  title="Edit employee"
                                  className="p-1.5 rounded-md text-gray-400 hover:bg-gray-100 hover:text-gray-700 transition-all"
                                >
                                  <Edit size={14} />
                                </button>
                                <button
                                  onClick={async () => {
                                    if (confirm(`Are you sure you want to delete ${emp.name}? This action cannot be undone.`)) {
                                      await deleteEmployee(emp.id)
                                    }
                                  }}
                                  title="Delete employee"
                                  className="p-1.5 rounded-md text-gray-400 hover:bg-red-100 hover:text-red-600 transition-all"
                                >
                                  <Trash2 size={14} />
                                </button>
                              </div>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>

                {/* Footer */}
                <div className="flex items-center justify-between px-5 py-3 border-t border-[#F3F4F6]">
                  <p className="text-[12px] text-gray-400">{employees.length} employee{employees.length !== 1 ? 's' : ''} total</p>
                  <button onClick={handlePrintRoster} className="text-[12px] text-gray-400 hover:text-gray-700 font-medium transition-colors flex items-center gap-1.5">
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" /></svg>
                    Export PDF
                  </button>
                </div>
              </div>
            </div>
          )
        })()}

        {activeSubTab === 'shift' && (() => {
          const canCreateShift = isAdmin || userPermissions['Shifts']?.create === true
          const canEditShift = isAdmin || userPermissions['Shifts']?.edit === true
          const canDeleteShift = isAdmin || userPermissions['Shifts']?.delete === true
          const canManageMWH = isAdmin || userPermissions['Settings']?.edit === true

          return (
            <div className="space-y-5 no-print">
              <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                <div className={`${settingsPanelClassName} p-5`}>
                  <p className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-400">Total Shifts</p>
                  <p className="mt-2 text-[26px] font-black tracking-[-0.04em] text-slate-950">{shifts.length}</p>
                  <p className="mt-1 text-[11px] text-slate-500">Configured attendance schedules.</p>
                </div>
                <div className={`${settingsPanelClassName} p-5`}>
                  <p className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-400">Flexible Rules</p>
                  <p className="mt-2 text-[26px] font-black tracking-[-0.04em] text-slate-950">{shifts.filter(shift => shift.isFlexible).length}</p>
                  <p className="mt-1 text-[11px] text-slate-500">Shifts without fixed time ranges.</p>
                </div>
                <div className={`${settingsPanelClassName} p-5`}>
                  <p className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-400">Hour Categories</p>
                  <p className="mt-2 text-[26px] font-black tracking-[-0.04em] text-slate-950">{minWorkHours.length}</p>
                  <p className="mt-1 text-[11px] text-slate-500">Minimum work hour definitions.</p>
                </div>
              </div>

              <Box sx={{ display: 'grid', gap: 3 }}>
                <Paper elevation={0} sx={{ borderRadius: 4, border: '1px solid #e5e7eb', overflow: 'hidden', background: 'linear-gradient(180deg, #ffffff 0%, #f8fbff 100%)' }}>
                  <Box sx={{ px: 3, py: 2.5, display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', gap: 2, borderBottom: '1px solid #e5e7eb' }}>
                    <Box>
                      <Typography sx={{ ...interMuiSx, fontSize: '1rem', fontWeight: 800, color: '#0f172a' }}>Shift Management</Typography>
                      <Typography sx={{ ...interMuiSx, fontSize: '0.78rem', color: '#64748b', mt: 0.5 }}>
                        Keep all schedule definitions in one readable table for payroll and attendance alignment.
                      </Typography>
                    </Box>
                    {canCreateShift && (
                      <MuiButton
                        variant="contained"
                        onClick={() => { setEditingShift(null); setNewShift({ name: '', type: 'Day', startTime: '09:00', endTime: '18:00', workHours: 9, isFlexible: false }); setShowAddShift(true); }}
                        startIcon={<Plus size={16} />}
                        sx={{ ...interMuiSx, borderRadius: 999, textTransform: 'none', fontWeight: 700, boxShadow: 'none', bgcolor: '#4f46e5', '&:hover': { bgcolor: '#4338ca', boxShadow: 'none' } }}
                      >
                        Create Shift
                      </MuiButton>
                    )}
                  </Box>

                  <TableContainer component={Paper} elevation={0} sx={settingsTableContainerSx}>
                    <Table size="small">
                      <TableHead>
                        <TableRow>
                          <TableCell sx={settingsTableHeadCellSx}>Shift</TableCell>
                          <TableCell sx={settingsTableHeadCellSx}>Type</TableCell>
                          <TableCell sx={settingsTableHeadCellSx}>Timing</TableCell>
                          <TableCell sx={settingsTableHeadCellSx}>Hours</TableCell>
                          <TableCell align="right" sx={settingsTableHeadCellSx}>Actions</TableCell>
                        </TableRow>
                      </TableHead>
                      <TableBody>
                        {shifts.length === 0 ? (
                          <TableRow>
                            <TableCell colSpan={5} sx={{ ...settingsTableBodyCellSx, py: 6, textAlign: 'center', color: '#94a3b8', fontStyle: 'italic' }}>
                              No shifts configured yet.
                            </TableCell>
                          </TableRow>
                        ) : shifts.map(shift => (
                          <TableRow key={shift.id} sx={stripedRowSx}>
                            <TableCell sx={settingsTableBodyCellSx}>
                              <Stack spacing={0.5}>
                                <Typography sx={{ ...interMuiSx, fontWeight: 800, color: '#111827' }}>{shift.name}</Typography>
                                <Typography sx={{ ...interMuiSx, fontSize: '0.74rem', color: '#64748b' }}>
                                  {shift.isFlexible ? 'Flexible scheduling' : 'Fixed attendance window'}
                                </Typography>
                              </Stack>
                            </TableCell>
                            <TableCell sx={settingsTableBodyCellSx}>
                              <Chip
                                label={shift.isFlexible ? 'Flexible' : (shift.type || 'Day')}
                                size="small"
                                sx={{ ...interMuiSx, fontWeight: 700, bgcolor: shift.isFlexible ? '#f3e8ff' : '#eef2ff', color: shift.isFlexible ? '#7c3aed' : '#4338ca' }}
                              />
                            </TableCell>
                            <TableCell sx={settingsTableBodyCellSx}>
                              {shift.isFlexible ? 'Anytime' : `${shift.startTime || '09:00'} - ${shift.endTime || '18:00'}`}
                            </TableCell>
                            <TableCell sx={settingsTableBodyCellSx}>{shift.workHours || 0} hrs</TableCell>
                            <TableCell align="right" sx={settingsTableBodyCellSx}>
                              <Stack direction="row" spacing={0.5} justifyContent="flex-end">
                                {canEditShift && (
                                  <IconButton onClick={() => { setEditingShift(shift); setNewShift(shift); setShowAddShift(true); }} size="small" sx={{ color: '#4f46e5' }}>
                                    <Edit size={16} />
                                  </IconButton>
                                )}
                                {canDeleteShift && (
                                  <IconButton
                                    onClick={async () => {
                                      if (confirm('Delete shift?')) {
                                        await deleteDoc(doc(db, 'organisations', user.orgId, 'shifts', shift.id))
                                        setShifts(prev => prev.filter(x => x.id !== shift.id))
                                      }
                                    }}
                                    size="small"
                                    sx={{ color: '#dc2626' }}
                                  >
                                    <Trash2 size={16} />
                                  </IconButton>
                                )}
                              </Stack>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </TableContainer>
                </Paper>

                <Paper elevation={0} sx={{ borderRadius: 4, border: '1px solid #e5e7eb', overflow: 'hidden', background: '#ffffff' }}>
                  <Box sx={{ px: 3, py: 2.5, display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', gap: 2, borderBottom: '1px solid #e5e7eb' }}>
                    <Box>
                      <Typography sx={{ ...interMuiSx, fontSize: '1rem', fontWeight: 800, color: '#0f172a' }}>Minimum Work Hours</Typography>
                      <Typography sx={{ ...interMuiSx, fontSize: '0.78rem', color: '#64748b', mt: 0.5 }}>
                        Use categories to standardize attendance expectations across different employee groups.
                      </Typography>
                    </Box>
                    {canManageMWH && (
                      <MuiButton
                        variant="outlined"
                        onClick={() => { setEditingMinWorkHours(null); setNewMinWorkHours({ name: '', hours: 8, description: '' }); setShowAddMinWorkHours(true); }}
                        startIcon={<Plus size={16} />}
                        sx={{ ...interMuiSx, borderRadius: 999, textTransform: 'none', fontWeight: 700 }}
                      >
                        Add Category
                      </MuiButton>
                    )}
                  </Box>

                  <TableContainer component={Paper} elevation={0} sx={settingsTableContainerSx}>
                    <Table size="small">
                      <TableHead>
                        <TableRow>
                          <TableCell sx={settingsTableHeadCellSx}>Category</TableCell>
                          <TableCell sx={settingsTableHeadCellSx}>Minimum Hours</TableCell>
                          <TableCell sx={settingsTableHeadCellSx}>Description</TableCell>
                          <TableCell align="right" sx={settingsTableHeadCellSx}>Actions</TableCell>
                        </TableRow>
                      </TableHead>
                      <TableBody>
                        {minWorkHours.length === 0 ? (
                          <TableRow>
                            <TableCell colSpan={4} sx={{ ...settingsTableBodyCellSx, py: 6, textAlign: 'center', color: '#94a3b8', fontStyle: 'italic' }}>
                              No minimum work hour categories yet.
                            </TableCell>
                          </TableRow>
                        ) : minWorkHours.map(rule => (
                          <TableRow key={rule.id} sx={stripedRowSx}>
                            <TableCell sx={settingsTableBodyCellSx}>
                              <Typography sx={{ ...interMuiSx, fontWeight: 800, color: '#111827' }}>{rule.name}</Typography>
                            </TableCell>
                            <TableCell sx={settingsTableBodyCellSx}>
                              <Chip
                                label={`${rule.hours} Hours`}
                                size="small"
                                sx={{ ...interMuiSx, fontWeight: 700, bgcolor: '#fffbeb', color: '#b45309' }}
                              />
                            </TableCell>
                            <TableCell sx={{ ...settingsTableBodyCellSx, color: '#64748b' }}>
                              {rule.description || 'No description'}
                            </TableCell>
                            <TableCell align="right" sx={settingsTableBodyCellSx}>
                              {canManageMWH && (
                                <Stack direction="row" spacing={0.5} justifyContent="flex-end">
                                  <IconButton onClick={() => { setEditingMinWorkHours(rule); setNewMinWorkHours(rule); setShowAddMinWorkHours(true); }} size="small" sx={{ color: '#4f46e5' }}>
                                    <Edit size={16} />
                                  </IconButton>
                                  <IconButton
                                    onClick={async () => {
                                      if (confirm('Delete minimum work hours category?')) {
                                        await deleteDoc(doc(db, 'organisations', user.orgId, 'minWorkHours', rule.id))
                                        setMinWorkHours(prev => prev.filter(x => x.id !== rule.id))
                                      }
                                    }}
                                    size="small"
                                    sx={{ color: '#dc2626' }}
                                  >
                                    <Trash2 size={16} />
                                  </IconButton>
                                </Stack>
                              )}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </TableContainer>
                </Paper>
              </Box>
            </div>
          )
        })()}

        {activeSubTab === 'user_roles' && !showInvitePage && (
          <Box sx={{ ...interMuiSx, display: 'grid', gap: 3 }}>
            <Paper
              elevation={0}
              sx={{
                borderRadius: 4,
                border: '1px solid #e5e7eb',
                overflow: 'hidden',
                background: 'linear-gradient(180deg, #ffffff 0%, #f8fbff 100%)',
              }}
            >
              <Box
                sx={{
                  px: 3,
                  py: 2.5,
                  display: 'flex',
                  flexWrap: 'wrap',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 2,
                  borderBottom: '1px solid #e5e7eb',
                }}
              >
                <Box>
                  <Typography sx={{ ...interMuiSx, fontSize: '1rem', fontWeight: 800, color: '#0f172a' }}>
                    Users & Roles
                  </Typography>
                  <Typography sx={{ ...interMuiSx, fontSize: '0.78rem', color: '#64748b', mt: 0.5 }}>
                    Manage access, assigned roles, and linked employee identities from one workspace.
                  </Typography>
                </Box>
                <Tabs
                  value={activeUserRoleSubTab}
                  onChange={(_, value) => setActiveUserRoleSubTab(value)}
                  sx={{
                    minHeight: 42,
                    '& .MuiTabs-indicator': { height: 3, borderRadius: 999, backgroundColor: '#4f46e5' },
                    '& .MuiTab-root': {
                      ...interMuiSx,
                      minHeight: 42,
                      textTransform: 'none',
                      fontSize: '0.82rem',
                      fontWeight: 700,
                      color: '#64748b',
                    },
                    '& .Mui-selected': { color: '#312e81 !important' },
                  }}
                >
                  <Tab label="Users" value="users" />
                  <Tab label="Roles" value="roles" />
                </Tabs>
              </Box>

              {activeUserRoleSubTab === 'users' && (
                <Box sx={{ p: 3, display: 'grid', gap: 2.5 }}>
                  <Stack direction={{ xs: 'column', md: 'row' }} spacing={1.5} justifyContent="space-between" alignItems={{ xs: 'flex-start', md: 'center' }}>
                    <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap">
                      <Typography sx={{ ...interMuiSx, fontSize: '0.82rem', fontWeight: 800, letterSpacing: '0.14em', textTransform: 'uppercase', color: '#475569' }}>
                        Users Directory
                      </Typography>
                      <Chip
                        label={`${users.length} total`}
                        size="small"
                        sx={{ ...interMuiSx, fontWeight: 700, bgcolor: '#eef2ff', color: '#4338ca' }}
                      />
                    </Stack>
                    <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.25}>
                      <MuiButton
                        variant="outlined"
                        color="error"
                        onClick={makeAllEmployeesAdmin}
                        disabled={seeding}
                        sx={{
                          ...interMuiSx,
                          borderRadius: 999,
                          textTransform: 'none',
                          fontWeight: 700,
                        }}
                      >
                        {seeding ? 'Processing...' : 'Make All Admin'}
                      </MuiButton>
                      <MuiButton
                        variant="contained"
                        onClick={() => setShowInvitePage(true)}
                        startIcon={<Plus size={16} />}
                        sx={{
                          ...interMuiSx,
                          borderRadius: 999,
                          textTransform: 'none',
                          fontWeight: 700,
                          boxShadow: 'none',
                          bgcolor: '#4f46e5',
                          '&:hover': { bgcolor: '#4338ca', boxShadow: 'none' },
                        }}
                      >
                        Invite User
                      </MuiButton>
                    </Stack>
                  </Stack>

                  <TableContainer component={Paper} elevation={0} sx={settingsTableContainerSx}>
                    <Table size="small">
                      <TableHead>
                        <TableRow>
                          <TableCell sx={settingsTableHeadCellSx}>User</TableCell>
                          <TableCell sx={settingsTableHeadCellSx}>Role</TableCell>
                          <TableCell sx={settingsTableHeadCellSx}>Description</TableCell>
                          <TableCell sx={settingsTableHeadCellSx}>Status</TableCell>
                          <TableCell align="right" sx={settingsTableHeadCellSx}>Actions</TableCell>
                        </TableRow>
                      </TableHead>
                      <TableBody>
                        {users.length === 0 ? (
                          <TableRow>
                            <TableCell colSpan={5} sx={{ ...settingsTableBodyCellSx, py: 6, textAlign: 'center', color: '#94a3b8', fontStyle: 'italic' }}>
                              No users found in this organization.
                            </TableCell>
                          </TableRow>
                        ) : users.map(u => {
                          const associatedEmp = employees.find(e => e.email?.toLowerCase() === u.email?.toLowerCase() || e.id === u.employeeId)
                          const emailPrefix = u.email ? u.email.split('@')[0] : 'User'
                          const displayName = u.name || associatedEmp?.fullName || associatedEmp?.name || emailPrefix
                          const roleDescription = roles.find(r => r.name.toLowerCase() === (u.role || '').toLowerCase())?.description || 'No description available'
                          const statusLabel = associatedEmp?.status || 'Active'
                          const statusColor = statusLabel === 'Inactive' ? 'error' : statusLabel === 'Rejoined' ? 'info' : 'success'

                          return (
                            <TableRow key={u.id} sx={stripedRowSx}>
                              <TableCell sx={settingsTableBodyCellSx}>
                                <Stack direction="row" spacing={1.5} alignItems="center">
                                  <MuiAvatar sx={{ ...interMuiSx, width: 40, height: 40, fontSize: '0.82rem', fontWeight: 800, bgcolor: getAvatarColor(u.id) }}>
                                    {getInitials(displayName)}
                                  </MuiAvatar>
                                  <Box sx={{ minWidth: 0 }}>
                                    <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap">
                                      <Typography noWrap sx={{ ...interMuiSx, fontWeight: 700, color: '#111827', maxWidth: 220 }}>
                                        {displayName}
                                      </Typography>
                                      {u.id === user.uid && (
                                        <Chip
                                          label="You"
                                          size="small"
                                          sx={{ ...interMuiSx, height: 20, fontSize: '0.68rem', fontWeight: 800, bgcolor: '#ecfdf5', color: '#047857' }}
                                        />
                                      )}
                                    </Stack>
                                    <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" sx={{ mt: 0.25 }}>
                                      <Typography noWrap sx={{ ...interMuiSx, fontSize: '0.74rem', color: '#64748b', maxWidth: 260 }}>
                                        {u.email}
                                      </Typography>
                                      {(u.empCode || associatedEmp?.empCode) && (
                                        <Chip
                                          label={u.empCode || associatedEmp?.empCode}
                                          size="small"
                                          sx={{ ...interMuiSx, height: 20, fontSize: '0.68rem', fontWeight: 800, bgcolor: '#eef2ff', color: '#4338ca' }}
                                        />
                                      )}
                                    </Stack>
                                  </Box>
                                </Stack>
                              </TableCell>
                              <TableCell sx={settingsTableBodyCellSx}>
                                <FormControl size="small" sx={{ minWidth: 150 }}>
                                  <MuiSelect
                                    value={u.role || ''}
                                    onChange={(e) => handleUpdateUserRole(u.id, e.target.value)}
                                    displayEmpty
                                    sx={{
                                      ...interMuiSx,
                                      borderRadius: 999,
                                      bgcolor: '#ffffff',
                                      fontSize: '0.78rem',
                                      fontWeight: 700,
                                      color: '#4338ca',
                                      '& .MuiOutlinedInput-notchedOutline': { borderColor: '#c7d2fe' },
                                    }}
                                  >
                                    <MenuItem value="">No Role</MenuItem>
                                    {roles.map(r => <MenuItem key={r.id} value={r.name}>{r.name}</MenuItem>)}
                                    {!roles.find(r => r.name.toLowerCase() === 'admin') && <MenuItem value="Admin">Admin</MenuItem>}
                                  </MuiSelect>
                                </FormControl>
                              </TableCell>
                              <TableCell sx={{ ...settingsTableBodyCellSx, color: '#64748b', maxWidth: 260 }}>
                                <Typography sx={{ ...interMuiSx, fontSize: '0.78rem', color: '#64748b' }}>
                                  {roleDescription}
                                </Typography>
                              </TableCell>
                              <TableCell sx={settingsTableBodyCellSx}>
                                <Chip
                                  label={statusLabel}
                                  color={statusColor}
                                  size="small"
                                  variant="outlined"
                                  sx={{ ...interMuiSx, fontWeight: 700 }}
                                />
                              </TableCell>
                              <TableCell align="right" sx={settingsTableBodyCellSx}>
                                <Stack direction="row" spacing={0.5} justifyContent="flex-end">
                                  <IconButton
                                    onClick={async () => {
                                      const emp = employees.find(e => e.email === u.email || e.id === u.employeeId)
                                      if (emp) {
                                        await openEmployeeEditor(emp)
                                        setActiveSubTab('employee')
                                      } else {
                                        alert('No linked employee record found for this user.')
                                      }
                                    }}
                                    size="small"
                                    sx={{ color: '#4f46e5' }}
                                  >
                                    <Edit size={16} />
                                  </IconButton>
                                  <IconButton
                                    onClick={() => handleDeleteUser(u.id, u.name || associatedEmp?.name || u.email)}
                                    size="small"
                                    sx={{ color: '#dc2626' }}
                                  >
                                    <Trash2 size={16} />
                                  </IconButton>
                                </Stack>
                              </TableCell>
                            </TableRow>
                          )
                        })}
                      </TableBody>
                    </Table>
                  </TableContainer>
                </Box>
              )}

              {activeUserRoleSubTab === 'roles' && (
                <Box sx={{ p: 3, display: 'grid', gap: 2.5 }}>
                  <Stack direction={{ xs: 'column', md: 'row' }} spacing={1.5} justifyContent="space-between" alignItems={{ xs: 'flex-start', md: 'center' }}>
                    <Stack direction="row" spacing={1} alignItems="center">
                      <Typography sx={{ ...interMuiSx, fontSize: '0.82rem', fontWeight: 800, letterSpacing: '0.14em', textTransform: 'uppercase', color: '#475569' }}>
                        Roles Registry
                      </Typography>
                      <Chip
                        label={`${roles.length} roles`}
                        size="small"
                        sx={{ ...interMuiSx, fontWeight: 700, bgcolor: '#f1f5f9', color: '#334155' }}
                      />
                    </Stack>
                    <MuiButton
                      variant="contained"
                      onClick={() => { setEditingRole(null); setNewRole({ name: '', description: '', isAccountant: false, permissions: { Tasks: { view: true } } }); setShowAddRole(true); }}
                      startIcon={<Plus size={16} />}
                      sx={{
                        ...interMuiSx,
                        borderRadius: 999,
                        textTransform: 'none',
                        fontWeight: 700,
                        boxShadow: 'none',
                        bgcolor: '#4f46e5',
                        '&:hover': { bgcolor: '#4338ca', boxShadow: 'none' },
                      }}
                    >
                      Add Role
                    </MuiButton>
                  </Stack>

                  <TableContainer component={Paper} elevation={0} sx={settingsTableContainerSx}>
                    <Table size="small">
                      <TableHead>
                        <TableRow>
                          <TableCell sx={settingsTableHeadCellSx}>Role</TableCell>
                          <TableCell sx={settingsTableHeadCellSx}>Description</TableCell>
                          <TableCell sx={settingsTableHeadCellSx}>Modules</TableCell>
                          <TableCell align="right" sx={settingsTableHeadCellSx}>Actions</TableCell>
                        </TableRow>
                      </TableHead>
                      <TableBody>
                        {roles.length === 0 ? (
                          <TableRow>
                            <TableCell colSpan={4} sx={{ ...settingsTableBodyCellSx, py: 6, textAlign: 'center', color: '#94a3b8', fontStyle: 'italic' }}>
                              No custom roles defined yet.
                            </TableCell>
                          </TableRow>
                        ) : roles.map(role => (
                          <TableRow key={role.id} sx={stripedRowSx}>
                            <TableCell sx={settingsTableBodyCellSx}>
                              <Stack spacing={0.5}>
                                <Typography sx={{ ...interMuiSx, fontWeight: 800, color: '#111827' }}>
                                  {role.name}
                                </Typography>
                                <Typography sx={{ ...interMuiSx, fontSize: '0.74rem', color: '#64748b' }}>
                                  {role.name === 'Admin' ? 'Highest access scope' : 'Custom access profile'}
                                </Typography>
                              </Stack>
                            </TableCell>
                            <TableCell sx={{ ...settingsTableBodyCellSx, color: '#64748b' }}>
                              <Typography sx={{ ...interMuiSx, fontSize: '0.78rem', color: '#64748b' }}>
                                {role.description || 'No description provided for this role.'}
                              </Typography>
                            </TableCell>
                            <TableCell sx={settingsTableBodyCellSx}>
                              <Chip
                                label={`${Object.keys(role.permissions || {}).length} modules`}
                                size="small"
                                sx={{ ...interMuiSx, fontWeight: 700, bgcolor: '#eef2ff', color: '#4338ca' }}
                              />
                            </TableCell>
                            <TableCell align="right" sx={settingsTableBodyCellSx}>
                              <Stack direction="row" spacing={0.5} justifyContent="flex-end">
                                <IconButton
                                  onClick={() => { setEditingRole(role); setNewRole({ ...role }); setShowAddRole(true); }}
                                  size="small"
                                  sx={{ color: '#4f46e5' }}
                                >
                                  <Edit size={16} />
                                </IconButton>
                                <IconButton
                                  onClick={async () => {
                                    if (confirm(`Delete role "${role.name}"?`)) {
                                      await deleteDoc(doc(db, 'organisations', user.orgId, 'roles', role.id))
                                      setRoles(r => r.filter(x => x.id !== role.id))
                                    }
                                  }}
                                  size="small"
                                  sx={{ color: '#dc2626' }}
                                >
                                  <Trash2 size={16} />
                                </IconButton>
                              </Stack>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </TableContainer>
                </Box>
              )}
            </Paper>
          </Box>
        )}

        {activeSubTab === 'salary' && <SalarySlabSettings />}
      </div>

      {/* COMPREHENSIVE EMPLOYEE EDITOR MODAL */}
      <Modal 
        isOpen={!!editingEmp} 
        onClose={() => {
          setEditingEmp(null)
          setEditForm({})
          setEditOriginalStatus(EMPLOYEE_STATUS_ACTIVE)
          setEditStatusTransition(null)
        }} 
        title={`EDIT EMPLOYEE: ${editForm.name || ''}`}
      >
        <div className="flex flex-col max-w-3xl mx-auto font-inter bg-white [&_input]:transition-all [&_select]:transition-all [&_textarea]:transition-all [&_input:hover]:border-gray-400 [&_select:hover]:border-gray-400 [&_textarea:hover]:border-gray-400 [&_input:hover]:shadow-sm [&_select:hover]:shadow-sm [&_textarea:hover]:shadow-sm">
          {/* Scrollable Form Body - Single scroll */}
          <div className="px-6 py-6 space-y-5">

            {/* Passport Photo + Name header */}
            <div className="flex items-start gap-4 pb-5 border-b border-gray-100">
              {/* Passport size photo */}
              <div className="relative shrink-0">
                  <div className="w-20 h-24 rounded-md border-2 border-dashed border-gray-200 bg-gray-50 overflow-hidden flex flex-col items-center justify-center cursor-pointer hover:border-gray-400 transition-all relative">
                    {uploadingLogo ? (
                      <div className="flex flex-col items-center justify-center">
                        <svg className="animate-spin h-5 w-5 text-indigo-500" viewBox="0 0 24 24" fill="none">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                        </svg>
                      </div>
                    ) : editForm.photoURL ? (
                      <img src={editForm.photoURL} className="w-full h-full object-cover" alt="photo" />
                    ) : (
                      <>
                        <svg className="w-6 h-6 text-gray-300 mb-1" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /></svg>
                        <span className="text-[9px] text-gray-400 font-medium text-center leading-tight">Passport<br />Photo</span>
                      </>
                    )}
                    <input type="file" accept="image/*" className="absolute inset-0 opacity-0 cursor-pointer" disabled={uploadingLogo} onChange={async (e) => {
                      try {
                        setUploadingLogo(true)
                        const url = await handleFileUpload(e.target.files[0], `employees/${editingEmp}/profile_${Date.now()}`)
                        if (url) setEditForm(s => ({ ...s, photoURL: url }))
                      } catch (err) {
                        console.error('Photo upload error:', err)
                        alert('Failed to upload photo: ' + err.message)
                      } finally {
                        setUploadingLogo(false)
                      }
                    }} />
                  </div>
                <span className="block text-[9px] text-gray-400 text-center mt-1">Click to upload</span>
              </div>
              <div className="flex-1 space-y-3">
                <div>
                  <label className="block text-[11px] font-bold text-gray-700 mb-1">Name</label>
                  <input type="text" placeholder="Full Name" value={editForm.name || ''}
                    onChange={e => setEditForm(s => ({ ...s, name: e.target.value }))}
                    className="w-full h-10 border border-gray-200 rounded-lg px-3 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent bg-white"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-gray-700 mb-1">Designation</label>
                  <input type="text" placeholder="e.g. Software Engineer" value={editForm.designation || ''}
                    onChange={e => setEditForm(s => ({ ...s, designation: e.target.value }))}
                    className="w-full h-10 border border-gray-200 rounded-lg px-3 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent bg-white"
                  />
                </div>
              </div>
            </div>

            {/* Two-column fields */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-[11px] font-bold text-gray-700 mb-1">Employee ID</label>
                <input type="text" placeholder="EMP-001" value={editForm.empCode || ''}
                  onChange={e => setEditForm(s => ({ ...s, empCode: e.target.value }))}
                  className="w-full h-10 border border-gray-200 rounded-lg px-3 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent bg-white"
                />
              </div>
              <div>
                <label className="block text-[11px] font-bold text-gray-700 mb-1">Date of Joining</label>
                <input type="date" value={editForm.joinedDate || ''}
                  onChange={e => setEditForm(s => ({ ...s, joinedDate: e.target.value }))}
                  className="w-full h-10 border border-gray-200 rounded-lg px-3 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent bg-white"
                />
              </div>
              <div>
                <label className="block text-[11px] font-bold text-gray-700 mb-1">Department</label>
                <input
                  type="text"
                  placeholder="e.g. HR, Finance"
                  value={editForm.department || ''}
                  onChange={e => setEditForm(s => ({ ...s, department: e.target.value }))}
                  className="w-full h-10 border border-gray-200 rounded-lg px-3 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-gray-900 bg-white"
                />
              </div>
              <div>
                <div className="flex justify-between items-center mb-1">
                  <label className="block text-[11px] font-bold text-gray-700">Working Hours *</label>
                  <button type="button" onClick={() => setShowAddMinWorkHours(true)} className="text-[10px] text-indigo-600 hover:text-indigo-800 font-bold underline uppercase">Configure</button>
                </div>
                <select
                  value={editForm.minDailyHoursCategory || (Array.isArray(minWorkHours) ? minWorkHours[0]?.name : '') || ''}
                  onChange={e => handleMinDailyHoursCategoryChange(e.target.value, 'edit')}
                  className="w-full h-10 border border-gray-200 rounded-lg px-3 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-gray-900 bg-white"
                >
                  {(Array.isArray(minWorkHours) ? minWorkHours : []).map(m => (
                    <option key={m.id} value={m.name}>{m.name} - {m.hours} Hours</option>
                  ))}
                </select>
                <p className="text-[9px] text-gray-400 mt-1">Select a category or click Configure to customize working hours (saves to Settings &gt; Shifts &gt; Min Working Hours).</p>
              </div>
              <div>
                <label className="block text-[11px] font-bold text-gray-700 mb-1">Shift Schedule</label>
                <select
                  value={editForm.shiftId || ''}
                  onChange={e => handleShiftChange(e.target.value, 'edit')}
                  className="w-full h-10 border border-gray-200 rounded-lg px-3 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-gray-900 bg-white"
                >
                  <option value="">Select Shift...</option>
                  {shifts.map(shift => (
                    <option key={shift.id} value={shift.id}>{shift.name} ({shift.workHours || 9} hrs)</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-[11px] font-bold text-gray-700 mb-1">Regular Check-In Time</label>
                <input
                  type="time"
                  value={editForm.regularInTime || ''}
                  onChange={e => setEditForm(s => ({ ...s, regularInTime: e.target.value }))}
                  className="w-full h-10 border border-gray-200 rounded-lg px-3 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-gray-900 bg-white"
                />
              </div>
              <div>
                <label className="block text-[11px] font-bold text-gray-700 mb-1">Regular Check-Out Time</label>
                <input
                  type="time"
                  value={editForm.regularOutTime || ''}
                  onChange={e => setEditForm(s => ({ ...s, regularOutTime: e.target.value }))}
                  className="w-full h-10 border border-gray-200 rounded-lg px-3 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-gray-900 bg-white"
                />
              </div>
              {editForm.shiftEffectiveDate && (
                <div className="col-span-2">
                  <label className="block text-[11px] font-bold text-emerald-700 mb-1">
                    Working Hours Effective From: {editForm.shiftEffectiveDate}
                  </label>
                  <p className="text-[10px] text-gray-500">OT calculations will use this date for historical recalculation</p>
                </div>
              )}
              <div>
                <label className="block text-[11px] font-bold text-gray-700 mb-1">Blood Group</label>
                <select value={editForm.bloodGroup || ''} onChange={e => setEditForm(s => ({ ...s, bloodGroup: e.target.value }))}
                  className="w-full h-10 border border-gray-200 rounded-lg px-3 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-gray-900 bg-white"
                >
                  <option value="">Select...</option>
                  {['A+', 'A-', 'B+', 'B-', 'O+', 'O-', 'AB+', 'AB-'].map(bg => <option key={bg}>{bg}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-[11px] font-bold text-gray-700 mb-1">Date of Birth</label>
                <input type="date" value={editForm.dob || ''}
                  onChange={e => setEditForm(s => ({ ...s, dob: e.target.value }))}
                  className="w-full h-10 border border-gray-200 rounded-lg px-3 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent bg-white"
                />
              </div>
              <div>
                <label className="block text-[11px] font-bold text-gray-700 mb-1">Father's Name</label>
                <input type="text" placeholder="Father's full name" value={editForm.fatherName || ''}
                  onChange={e => setEditForm(s => ({ ...s, fatherName: e.target.value }))}
                  className="w-full h-10 border border-gray-200 rounded-lg px-3 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent bg-white"
                />
              </div>
              <div>
                <label className="block text-[11px] font-bold text-gray-700 mb-1">Mother's Name</label>
                <input type="text" placeholder="Mother's full name" value={editForm.motherName || ''}
                  onChange={e => setEditForm(s => ({ ...s, motherName: e.target.value }))}
                  className="w-full h-10 border border-gray-200 rounded-lg px-3 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent bg-white"
                />
              </div>
              <div>
                <label className="block text-[11px] font-bold text-gray-700 mb-1">Marital Status</label>
                <select value={editForm.maritalStatus || ''} onChange={e => setEditForm(s => ({ ...s, maritalStatus: e.target.value }))}
                  className="w-full h-10 border border-gray-200 rounded-lg px-3 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-gray-900 bg-white"
                >
                  <option value="">Select...</option>
                  {['Single', 'Married', 'Divorced', 'Widowed'].map(ms => <option key={ms}>{ms}</option>)}
                </select>
              </div>
              {/* Email field - always visible for edit employees with Blue Hover & Active States */}
              <div className="col-span-2 space-y-3">
                <label className="block text-[11px] font-bold text-gray-700">Email Addresses</label>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* Work Email Container */}
                  <div 
                    className={`p-3.5 rounded-xl border-2 transition-all duration-200 cursor-pointer ${
                      editForm.loginEmailType === 'work' 
                        ? 'border-blue-600 bg-blue-50/30' 
                        : 'border-gray-200 hover:border-blue-400 bg-white'
                    }`}
                    onClick={() => setEditForm(s => ({ ...s, loginEmailType: 'work' }))}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs font-semibold text-gray-700">Work Email</span>
                      <div className="flex items-center gap-1.5">
                        <input 
                          type="radio" 
                          name="editLoginEmailType"
                          checked={editForm.loginEmailType === 'work'}
                          onChange={() => setEditForm(s => ({ ...s, loginEmailType: 'work' }))}
                          className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 cursor-pointer"
                        />
                        <span className="text-[10px] text-gray-500 font-medium">Use for login</span>
                      </div>
                    </div>
                    <input 
                      type="email" 
                      placeholder="work@company.com" 
                      value={editForm.workEmail || ''}
                      onClick={e => e.stopPropagation()} 
                      onChange={e => setEditForm(s => ({ ...s, workEmail: e.target.value }))}
                      className="w-full h-9 border border-gray-200 rounded-lg px-3 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                    />
                  </div>

                  {/* Personal Email Container */}
                  <div 
                    className={`p-3.5 rounded-xl border-2 transition-all duration-200 cursor-pointer ${
                      editForm.loginEmailType === 'personal' 
                        ? 'border-blue-600 bg-blue-50/30' 
                        : 'border-gray-200 hover:border-blue-400 bg-white'
                    }`}
                    onClick={() => setEditForm(s => ({ ...s, loginEmailType: 'personal' }))}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs font-semibold text-gray-700">Personal Email</span>
                      <div className="flex items-center gap-1.5">
                        <input 
                          type="radio" 
                          name="editLoginEmailType"
                          checked={editForm.loginEmailType === 'personal'}
                          onChange={() => setEditForm(s => ({ ...s, loginEmailType: 'personal' }))}
                          className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 cursor-pointer"
                        />
                        <span className="text-[10px] text-gray-500 font-medium">Use for login</span>
                      </div>
                    </div>
                    <input 
                      type="email" 
                      placeholder="personal@email.com" 
                      value={editForm.personalEmail || ''}
                      onClick={e => e.stopPropagation()}
                      onChange={e => setEditForm(s => ({ ...s, personalEmail: e.target.value }))}
                      className="w-full h-9 border border-gray-200 rounded-lg px-3 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                    />
                  </div>
                </div>
              </div>

              {/* Contact Numbers Section */}
              <div className="col-span-2 grid grid-cols-3 gap-4">
                <div>
                  <label className="block text-[11px] font-bold text-gray-700 mb-1">Mobile No</label>
                  <input type="text" placeholder="Mobile Number" value={editForm.mobileNo || ''}
                    onChange={e => setEditForm(s => ({ ...s, mobileNo: e.target.value, contactNo: e.target.value }))}
                    className="w-full h-10 border border-gray-200 rounded-lg px-3 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-gray-900 bg-white"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-gray-700 mb-1">Office No</label>
                  <input type="text" placeholder="Office Number" value={editForm.officeNo || ''}
                    onChange={e => setEditForm(s => ({ ...s, officeNo: e.target.value }))}
                    className="w-full h-10 border border-gray-200 rounded-lg px-3 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-gray-900 bg-white"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-gray-700 mb-1">Personal No</label>
                  <input type="text" placeholder="Personal Number" value={editForm.personalNo || ''}
                    onChange={e => setEditForm(s => ({ ...s, personalNo: e.target.value }))}
                    className="w-full h-10 border border-gray-200 rounded-lg px-3 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-gray-900 bg-white"
                  />
                </div>
              </div>

              {/* Identification & Vehicle Details */}
              <div className="col-span-2 grid grid-cols-2 gap-4 border-t border-gray-100 pt-4">
                <div>
                  <label className="block text-[11px] font-bold text-gray-700 mb-1">Aadhar No</label>
                  <input type="text" placeholder="12-digit Aadhar Number" value={editForm.aadharNo || ''}
                    onChange={e => setEditForm(s => ({ ...s, aadharNo: e.target.value }))}
                    className="w-full h-10 border border-gray-200 rounded-lg px-3 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-gray-900 bg-white"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-gray-700 mb-1">PAN No</label>
                  <input type="text" placeholder="10-digit PAN Number" value={editForm.panNo || ''}
                    onChange={e => setEditForm(s => ({ ...s, panNo: e.target.value }))}
                    className="w-full h-10 border border-gray-200 rounded-lg px-3 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-gray-900 bg-white"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-gray-700 mb-1">Driving License No</label>
                  <input type="text" placeholder="Driving License Number" value={editForm.drivingLicenseNo || ''}
                    onChange={e => setEditForm(s => ({ ...s, drivingLicenseNo: e.target.value }))}
                    className="w-full h-10 border border-gray-200 rounded-lg px-3 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-gray-900 bg-white"
                  />
                </div>
                <div className="flex items-center justify-between bg-zinc-50 px-4 py-2 rounded-xl border border-zinc-200 self-end h-10">
                  <span className="text-[11px] font-bold text-gray-700">Own Vehicle</span>
                  <button
                    type="button"
                    onClick={() => setEditForm(s => ({ ...s, hasOwnVehicle: !s.hasOwnVehicle }))}
                    className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${editForm.hasOwnVehicle ? 'bg-indigo-600' : 'bg-gray-300'}`}
                  >
                    <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${editForm.hasOwnVehicle ? 'translate-x-4' : 'translate-x-0.5'}`} />
                  </button>
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-gray-700 mb-1">PF No</label>
                  <input type="text" placeholder="Provident Fund Number" value={editForm.pfNo || ''}
                    onChange={e => setEditForm(s => ({ ...s, pfNo: e.target.value }))}
                    className="w-full h-10 border border-gray-200 rounded-lg px-3 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-gray-900 bg-white"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-gray-700 mb-1">ESI No</label>
                  <input type="text" placeholder="ESI Number" value={editForm.esiNo || ''}
                    onChange={e => setEditForm(s => ({ ...s, esiNo: e.target.value }))}
                    className="w-full h-10 border border-gray-200 rounded-lg px-3 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-gray-900 bg-white"
                  />
                </div>
              </div>

              {/* Bank Account Details */}
              <div className="col-span-2 border-t border-gray-100 pt-4 space-y-4">
                <label className="block text-[11px] font-bold text-gray-700">Bank Account Details</label>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* Personal Bank Account Card */}
                  <div className="p-4 border border-gray-200 rounded-xl bg-gray-50/50 space-y-3">
                    <span className="block text-xs font-bold text-gray-600 border-b border-gray-200 pb-1.5">Personal Bank Account</span>
                    <div>
                      <label className="block text-[10px] text-gray-500 font-bold mb-1">Account Holder Name</label>
                      <input type="text" placeholder="Holder Name" value={editForm.personalBank?.holderName || ''}
                        onChange={e => setEditForm(s => ({ ...s, personalBank: { ...(s.personalBank || {}), holderName: e.target.value } }))}
                        className="w-full h-8 border border-gray-200 rounded-lg px-2.5 text-xs text-gray-800 focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] text-gray-500 font-bold mb-1">Account Number</label>
                      <input type="text" placeholder="Account Number" value={editForm.personalBank?.accountNo || ''}
                        onChange={e => setEditForm(s => ({ ...s, personalBank: { ...(s.personalBank || {}), accountNo: e.target.value } }))}
                        className="w-full h-8 border border-gray-200 rounded-lg px-2.5 text-xs text-gray-800 focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white"
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="block text-[10px] text-gray-500 font-bold mb-1">Bank Name</label>
                        <input type="text" placeholder="Bank Name" value={editForm.personalBank?.bankName || ''}
                          onChange={e => setEditForm(s => ({ ...s, personalBank: { ...(s.personalBank || {}), bankName: e.target.value } }))}
                          className="w-full h-8 border border-gray-200 rounded-lg px-2.5 text-xs text-gray-800 focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white"
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] text-gray-500 font-bold mb-1">IFSC Code</label>
                        <input type="text" placeholder="IFSC Code" value={editForm.personalBank?.ifsc || ''}
                          onChange={e => setEditForm(s => ({ ...s, personalBank: { ...(s.personalBank || {}), ifsc: e.target.value } }))}
                          className="w-full h-8 border border-gray-200 rounded-lg px-2.5 text-xs text-gray-800 focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white"
                        />
                      </div>
                    </div>
                  </div>

                  {/* Company Bank Account Card */}
                  <div className="p-4 border border-gray-200 rounded-xl bg-gray-50/50 space-y-3">
                    <span className="block text-xs font-bold text-gray-600 border-b border-gray-200 pb-1.5">Company Bank Account</span>
                    <div>
                      <label className="block text-[10px] text-gray-500 font-bold mb-1">Account Holder Name</label>
                      <input type="text" placeholder="Holder Name" value={editForm.companyBank?.holderName || ''}
                        onChange={e => setEditForm(s => ({ ...s, companyBank: { ...(s.companyBank || {}), holderName: e.target.value } }))}
                        className="w-full h-8 border border-gray-200 rounded-lg px-2.5 text-xs text-gray-800 focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] text-gray-500 font-bold mb-1">Account Number</label>
                      <input type="text" placeholder="Account Number" value={editForm.companyBank?.accountNo || ''}
                        onChange={e => setEditForm(s => ({ ...s, companyBank: { ...(s.companyBank || {}), accountNo: e.target.value } }))}
                        className="w-full h-8 border border-gray-200 rounded-lg px-2.5 text-xs text-gray-800 focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white"
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="block text-[10px] text-gray-500 font-bold mb-1">Bank Name</label>
                        <input type="text" placeholder="Bank Name" value={editForm.companyBank?.bankName || ''}
                          onChange={e => setEditForm(s => ({ ...s, companyBank: { ...(s.companyBank || {}), bankName: e.target.value } }))}
                          className="w-full h-8 border border-gray-200 rounded-lg px-2.5 text-xs text-gray-800 focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white"
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] text-gray-500 font-bold mb-1">IFSC Code</label>
                        <input type="text" placeholder="IFSC Code" value={editForm.companyBank?.ifsc || ''}
                          onChange={e => setEditForm(s => ({ ...s, companyBank: { ...(s.companyBank || {}), ifsc: e.target.value } }))}
                          className="w-full h-8 border border-gray-200 rounded-lg px-2.5 text-xs text-gray-800 focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white"
                        />
                      </div>
                    </div>
                  </div>
                </div>
              </div>
              <div>
                <label className="block text-[11px] font-bold text-gray-700 mb-1">System Role</label>
                <select 
                  value={editForm.role || 'Employee'} 
                  onChange={e => setEditForm(s => ({ ...s, role: e.target.value }))}
                  className="w-full h-10 border border-gray-200 rounded-lg px-3 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-gray-900 bg-white"
                >
                  <option value="Employee">Employee</option>
                  {roles.map(r => <option key={r.id} value={r.name}>{r.name}</option>)}
                  {!roles.find(r => r.name.toLowerCase() === 'admin') && <option value="Admin">Admin</option>}
                </select>
              </div>
              <div className="col-span-2">
                <label className="block text-[11px] font-bold text-gray-700 mb-2">Status</label>
                <div className="grid grid-cols-3 gap-2">
                  {EMPLOYEE_STATUS_OPTIONS.map(status => (
                    <button
                      key={status}
                      type="button"
                      onClick={() => handleEditStatusSelect(status)}
                      className={`h-10 rounded-lg text-sm font-semibold border transition-all ${
                        normalizeEmployeeStatus(editForm.status) === status
                          ? status === EMPLOYEE_STATUS_ACTIVE
                            ? 'bg-green-600 text-white border-green-600'
                            : status === 'Inactive'
                              ? 'bg-red-500 text-white border-red-500'
                              : 'bg-sky-600 text-white border-sky-600'
                          : 'bg-white text-gray-400 border-gray-200 hover:border-gray-300'
                      }`}
                    >
                      {status}
                    </button>
                  ))}
                </div>
              </div>
              {editStatusTransition && (
                <div className="col-span-2 border border-amber-200 bg-amber-50 rounded-xl p-4 space-y-3">
                  <div>
                    <p className="text-[11px] font-black text-amber-700 uppercase tracking-widest">
                      Status Change: {editOriginalStatus} to {normalizeEmployeeStatus(editForm.status)}
                    </p>
                    <p className="text-[11px] text-amber-700 mt-1">{editStatusTransition.helperText}</p>
                  </div>
                  <div className="max-w-xs">
                    <label className="block text-[11px] font-bold text-amber-800 mb-1">{editStatusTransition.label}</label>
                    <input
                      type="date"
                      value={editForm[editStatusTransition.field] || ''}
                      onChange={e => setEditForm(s => ({ ...s, [editStatusTransition.field]: e.target.value }))}
                      className="w-full h-10 border border-amber-200 rounded-lg px-3 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-amber-400 bg-white"
                    />
                  </div>
                </div>
              )}
              <div className="col-span-2">
                <label className="block text-[11px] font-bold text-gray-700 mb-1">Address</label>
                <textarea
                  placeholder="Full residential address"
                  value={editForm.address || ''}
                  onChange={e => setEditForm(s => ({ ...s, address: e.target.value }))}
                  rows={3}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent bg-white resize-none"
                />
              </div>

              {/* Toggles section - Two Columns */}
              <div className="col-span-2 grid grid-cols-1 md:grid-cols-2 gap-4 border-t border-gray-100 pt-4">
                {/* Login Enabled Toggle */}
                <div className="flex items-center justify-between bg-indigo-50/50 p-3.5 rounded-xl border border-indigo-100/60">
                  <div className="pr-2">
                    <label className="block text-[11px] font-bold text-indigo-700">Login Enabled</label>
                    <p className="text-[10px] text-indigo-500 leading-tight">Allow employee to access the system</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setEditForm(s => ({ ...s, loginEnabled: !s.loginEnabled }))}
                    className={`relative shrink-0 inline-flex h-6 w-11 items-center rounded-full transition-colors ${editForm.loginEnabled ? 'bg-indigo-600' : 'bg-gray-300'}`}
                  >
                    <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${editForm.loginEnabled ? 'translate-x-6' : 'translate-x-1'}`} />
                  </button>
                </div>

                {/* Hide in Attendance Toggle */}
                <div className="flex items-center justify-between bg-red-50/50 p-3.5 rounded-xl border border-red-100/60">
                  <div className="pr-2">
                    <label className="block text-[11px] font-bold text-red-700 uppercase tracking-wider">Hide in Attendance</label>
                    <p className="text-[10px] text-red-600 leading-tight">Won't appear in daily attendance list</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setEditForm(s => ({ ...s, hideInAttendance: !s.hideInAttendance }))}
                    className={`relative shrink-0 inline-flex h-6 w-11 items-center rounded-full transition-colors ${editForm.hideInAttendance ? 'bg-red-600' : 'bg-gray-300'}`}
                  >
                    <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${editForm.hideInAttendance ? 'translate-x-6' : 'translate-x-1'}`} />
                  </button>
                </div>

                {/* Include in Salary Toggle */}
                <div className="flex items-center justify-between bg-emerald-50/50 p-3.5 rounded-xl border border-emerald-100/60">
                  <div className="pr-2">
                    <label className="block text-[11px] font-bold text-emerald-700 uppercase tracking-wider">Include in Salary</label>
                    <p className="text-[10px] text-emerald-600 leading-tight">Will appear in payroll and salary slips</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setEditForm(s => ({ ...s, includeInSalary: !s.includeInSalary }))}
                    className={`relative shrink-0 inline-flex h-6 w-11 items-center rounded-full transition-colors ${editForm.includeInSalary !== false ? 'bg-emerald-600' : 'bg-gray-300'}`}
                  >
                    <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${editForm.includeInSalary !== false ? 'translate-x-6' : 'translate-x-1'}`} />
                  </button>
                </div>

                {/* Include in Task Toggle */}
                <div className="flex items-center justify-between bg-sky-50/50 p-3.5 rounded-xl border border-sky-100/60">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg bg-indigo-100 flex items-center justify-center text-indigo-600">
                      <AtSign size={16} />
                    </div>
                    <div className="pr-2">
                      <label className="block text-[11px] font-bold text-indigo-700 uppercase tracking-wider">Include in Task</label>
                      <p className="text-[10px] text-indigo-600 leading-tight">Allow mentions and assignments in Tasks</p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setEditForm(s => ({ ...s, includeInTask: !s.includeInTask }))}
                    className={`relative shrink-0 inline-flex h-6 w-11 items-center rounded-full transition-colors ${editForm.includeInTask !== false ? 'bg-indigo-600' : 'bg-gray-300'}`}
                  >
                    <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${editForm.includeInTask !== false ? 'translate-x-6' : 'translate-x-1'}`} />
                  </button>
                </div>

                {/* Withdraw Full Salary Toggle */}
                <div className="flex items-center justify-between bg-amber-50/50 p-3.5 rounded-xl border border-amber-100/60 col-span-1 md:col-span-2">
                  <div className="pr-2">
                    <label className="block text-[11px] font-bold text-amber-800 uppercase tracking-wider">Withdraw Full Salary</label>
                    <p className="text-[10px] text-amber-600 leading-tight">Enable full salary withdrawals (useful for Owners, Directors, Board Members)</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setEditForm(s => ({ ...s, withdrawFullSalary: !s.withdrawFullSalary }))}
                    className={`relative shrink-0 inline-flex h-6 w-11 items-center rounded-full transition-colors ${editForm.withdrawFullSalary ? 'bg-amber-600' : 'bg-gray-300'}`}
                  >
                    <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${editForm.withdrawFullSalary ? 'translate-x-6' : 'translate-x-1'}`} />
                  </button>
                </div>
              </div>

              {/* Password Field - Only shown when login is enabled */}
              {editForm.loginEnabled && (
                <div className="col-span-2">
                  <label className="block text-[11px] font-bold text-gray-700 mb-1">Temporary Password *</label>
                  <input
                    type="text"
                    placeholder="Enter temporary password"
                    value={editForm.tempPassword || ''}
                    onChange={(e) => setEditForm(s => ({ ...s, tempPassword: e.target.value }))}
                    className="w-full h-10 border border-gray-200 rounded-lg px-3 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-gray-900 bg-white"
                  />
                  <p className="text-[10px] text-gray-400 mt-1">Share this password with the employee</p>
                </div>
              )}

              {/* Documents Upload Section */}
              <div className="col-span-2 border border-gray-100 rounded-xl p-4 bg-gray-50/50">
                <div className="flex items-center justify-between mb-3">
                  <label className="text-[11px] font-bold text-gray-700 flex items-center gap-1.5"><Paperclip size={13} /> Documents</label>
                  <span className="text-[10px] text-gray-400">{(editForm.documents || []).length} file(s)</span>
                </div>

                {/* Existing uploaded docs list */}
                {(editForm.documents || []).length > 0 && (
                  <div className="space-y-2 mb-3">
                    {(editForm.documents || []).map((doc, i) => {
                      const isImg = /\.(png|jpg|jpeg|gif|webp)$/i.test(doc.url || '')
                      return (
                        <div key={i} className="flex items-center gap-2 bg-white rounded-lg px-3 py-2 border border-gray-100">
                          {isImg
                            ? <img src={doc.url} alt={doc.name} className="w-8 h-8 rounded object-cover border border-gray-200" />
                            : <div className="w-8 h-8 rounded bg-indigo-50 flex items-center justify-center border border-indigo-100"><FileText size={14} className="text-indigo-400" /></div>
                        }
                        <span className="flex-1 text-[11px] font-medium text-gray-700 truncate">{doc.name}</span>
                        <button
                          type="button"
                          onClick={() => setViewerState({ docs: editForm.documents, index: i })}
                          className="p-1 hover:bg-gray-100 rounded text-gray-400 hover:text-gray-700 transition-all"
                          title="View"
                        >
                          <Eye size={13} />
                        </button>
                        <button
                          type="button"
                          onClick={() => setEditForm(s => ({ ...s, documents: s.documents.filter((_, idx) => idx !== i) }))}
                          className="p-1 hover:bg-red-50 rounded text-gray-300 hover:text-red-400 transition-all"
                          title="Remove"
                        >
                          <X size={13} />
                        </button>
                      </div>
                    )})}
                  </div>
                )}

                {/* Upload new document row */}
                <div className="flex gap-2 items-center">
                  <input
                    type="text"
                    placeholder="Document label (e.g. Aadhaar)"
                    value={newDocUpload.name}
                    onChange={e => setNewDocUpload(s => ({ ...s, name: e.target.value }))}
                    className="flex-1 h-9 border border-gray-200 rounded-lg px-3 text-[12px] text-gray-800 focus:outline-none focus:ring-2 focus:ring-gray-900 bg-white"
                  />
                  <label className={`h-9 px-3 rounded-lg border text-[12px] font-medium flex items-center gap-1.5 cursor-pointer transition-all ${newDocUpload.uploading
                    ? 'bg-gray-100 text-gray-400 border-gray-200'
                    : 'bg-white border-gray-200 text-gray-600 hover:border-gray-400 hover:text-gray-900'
                    }`}>
                    {newDocUpload.uploading ? (
                      <svg className="animate-spin h-3 w-3" viewBox="0 0 24 24" fill="none"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" /></svg>
                    ) : <Paperclip size={13} />}
                    {newDocUpload.uploading ? 'Uploading...' : 'Attach'}
                    <input
                      type="file"
                      className="hidden"
                      disabled={newDocUpload.uploading}
                      onChange={async (e) => {
                        const file = e.target.files[0]
                        if (!file) return
                        const label = newDocUpload.name.trim() || file.name
                        setNewDocUpload(s => ({ ...s, uploading: true }))
                        try {
                          const url = await handleFileUpload(file, `employees/${editingEmp}/docs/${Date.now()}_${file.name}`)
                          if (url) {
                            setEditForm(s => ({
                              ...s,
                              documents: [...(s.documents || []), { name: label, url, type: file.type }]
                            }))
                          }
                        } finally {
                          setNewDocUpload({ name: '', file: null, uploading: false })
                        }
                        e.target.value = ''
                      }}
                    />
                  </label>
                </div>
              </div>
            </div>

          </div>

          {/* Footer */}
          <div className="px-6 py-4 border-t border-gray-100 shrink-0 flex gap-3 bg-white">
            <button
              type="button"
              onClick={() => {
                setEditingEmp(null)
                setEditForm({})
                setEditOriginalStatus(EMPLOYEE_STATUS_ACTIVE)
                setEditStatusTransition(null)
              }}
              className="px-5 h-10 rounded-lg text-sm font-medium text-gray-500 hover:bg-gray-50 border border-gray-200 transition-all"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSaveEmployee}
              disabled={saving}
              className="flex-1 h-10 bg-gray-900 text-white font-semibold rounded-lg text-sm hover:bg-gray-800 disabled:opacity-50 transition-all"
            >
              {saving ? 'Saving...' : 'Save Employee'}
            </button>
          </div>
        </div>
      </Modal>

      {/* ADD NEW EMPLOYEE MODAL - Minimal, Clean Form */}
      <Modal isOpen={showAddEmployee} onClose={() => { setShowAddEmployee(false); setFormErrors({}); }} title="Add Employee">
        <div className="flex flex-col max-w-3xl mx-auto font-inter bg-white [&_input]:transition-all [&_select]:transition-all [&_textarea]:transition-all [&_input:hover]:border-gray-400 [&_select:hover]:border-gray-400 [&_textarea:hover]:border-gray-400 [&_input:hover]:shadow-sm [&_select:hover]:shadow-sm [&_textarea:hover]:shadow-sm">
          {/* Scrollable Form Body - Single scroll */}
          <div className="px-6 py-6 space-y-5">

            {/* Passport Photo + Name header */}
            <div className="flex items-start gap-4 pb-5 border-b border-gray-100">
              {/* Passport size photo */}
              <div className="relative shrink-0">
                <div className="w-20 h-24 rounded-md border-2 border-dashed border-gray-200 bg-gray-50 overflow-hidden flex flex-col items-center justify-center cursor-pointer hover:border-gray-400 transition-all relative">
                    {uploadingLogo ? (
                      <div className="flex flex-col items-center justify-center">
                        <svg className="animate-spin h-5 w-5 text-indigo-500" viewBox="0 0 24 24" fill="none">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                        </svg>
                      </div>
                    ) : newEmployee.photoURL ? (
                      <img src={newEmployee.photoURL} className="w-full h-full object-cover" alt="photo" />
                    ) : (
                      <>
                        <svg className="w-6 h-6 text-gray-300 mb-1" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /></svg>
                        <span className="text-[9px] text-gray-400 font-medium text-center leading-tight">Passport<br />Photo</span>
                      </>
                    )}
                    <input type="file" accept="image/*" className="absolute inset-0 opacity-0 cursor-pointer" disabled={uploadingLogo} onChange={async (e) => {
                      try {
                        setUploadingLogo(true)
                        const url = await handleFileUpload(e.target.files[0], `employees/new_${Date.now()}/profile`)
                        if (url) setNewEmployee(s => ({ ...s, photoURL: url }))
                      } catch (err) {
                        console.error('Photo upload error:', err)
                        alert('Failed to upload photo: ' + err.message)
                      } finally {
                        setUploadingLogo(false)
                      }
                    }} />
                  </div>
                <span className="block text-[9px] text-gray-400 text-center mt-1">Click to upload</span>
              </div>
              <div className="flex-1 space-y-3">
                <div>
                  <label className="block text-[11px] font-bold text-gray-700 mb-1">Name <span className="text-red-500">*</span></label>
                  <input type="text" placeholder="Full Name" value={newEmployee.name}
                    onChange={e => { setNewEmployee(s => ({ ...s, name: e.target.value })); if (formErrors.name) setFormErrors(prev => ({ ...prev, name: '' })); }}
                    className={`w-full h-10 border rounded-lg px-3 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-gray-900 bg-white ${formErrors.name ? 'border-red-400 ring-2 ring-red-200' : 'border-gray-200'}`}
                  />
                  {formErrors.name && <p className="text-[11px] text-red-500 mt-1 font-medium">{formErrors.name}</p>}
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-gray-700 mb-1">Designation</label>
                  <input type="text" placeholder="e.g. Software Engineer" value={newEmployee.designation}
                    onChange={e => setNewEmployee(s => ({ ...s, designation: e.target.value }))}
                    className="w-full h-10 border border-gray-200 rounded-lg px-3 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent bg-white"
                  />
                </div>
              </div>
            </div>

            {/* Section: Basic Information */}
            <div className="bg-gray-50 rounded-xl border border-gray-200 overflow-hidden">
              <button
                type="button"
                onClick={() => toggleSection('basicInfo')}
                className="flex items-center gap-2 w-full px-4 py-2.5 transition-colors cursor-pointer select-none" style={{ backgroundColor: '#09CE99' }} onMouseEnter={e => e.currentTarget.style.backgroundColor = '#07B888'} onMouseLeave={e => e.currentTarget.style.backgroundColor = '#09CE99'}
              >
                <ChevronDown size={14} className={`text-white transition-transform duration-200 ${collapsedSections.basicInfo ? '-rotate-90' : ''}`} />
                <span className="text-[10px] font-black text-white uppercase tracking-[0.15em]">Basic Information</span>
              </button>
              {!collapsedSections.basicInfo && <div className="p-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-[11px] font-bold text-gray-700 mb-1">Employee ID</label>
                <input type="text" placeholder="EMP-001" value={newEmployee.empCode}
                  onChange={e => setNewEmployee(s => ({ ...s, empCode: e.target.value }))}
                  className="w-full h-10 border border-gray-200 rounded-lg px-3 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent bg-white"
                />
              </div>
              <div>
                <label className="block text-[11px] font-bold text-gray-700 mb-1">Date of Joining</label>
                <input type="date" value={newEmployee.joinedDate || ''}
                  onChange={e => setNewEmployee(s => ({ ...s, joinedDate: e.target.value }))}
                  className="w-full h-10 border border-gray-200 rounded-lg px-3 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent bg-white"
                />
              </div>
              <div>
                <label className="block text-[11px] font-bold text-gray-700 mb-1">Department</label>
                <input
                  type="text"
                  placeholder="e.g. HR, Finance"
                  value={newEmployee.department}
                  onChange={e => setNewEmployee(s => ({ ...s, department: e.target.value }))}
                  className="w-full h-10 border border-gray-200 rounded-lg px-3 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-gray-900 bg-white"
                />
              </div>
              <div>
                <div className="flex justify-between items-center mb-1">
                  <label className="block text-[11px] font-bold text-gray-700">Working Hours *</label>
                  <button type="button" onClick={() => setShowAddMinWorkHours(true)} className="text-[10px] text-indigo-600 hover:text-indigo-800 font-bold underline uppercase">Configure</button>
                </div>
                <select
                  value={newEmployee.minDailyHoursCategory || (Array.isArray(minWorkHours) ? minWorkHours[0]?.name : '') || ''}
                  onChange={e => handleMinDailyHoursCategoryChange(e.target.value, 'new')}
                  className="w-full h-10 border border-gray-200 rounded-lg px-3 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-gray-900 bg-white"
                >
                  {(Array.isArray(minWorkHours) ? minWorkHours : []).map(m => (
                    <option key={m.id} value={m.name}>{m.name} - {m.hours} Hours</option>
                  ))}
                </select>
                <p className="text-[9px] text-gray-400 mt-1">Select a category or click Configure to customize working hours (saves to Settings &gt; Shifts &gt; Min Working Hours).</p>
              </div>
              <div>
                <label className="block text-[11px] font-bold text-gray-700 mb-1">Shift Schedule</label>
                <select
                  value={newEmployee.shiftId || ''}
                  onChange={e => handleShiftChange(e.target.value, 'new')}
                  className="w-full h-10 border border-gray-200 rounded-lg px-3 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-gray-900 bg-white"
                >
                  <option value="">Select Shift...</option>
                  {shifts.map(shift => (
                    <option key={shift.id} value={shift.id}>{shift.name} ({shift.workHours || 9} hrs)</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-[11px] font-bold text-gray-700 mb-1">Regular Check-In Time</label>
                <input
                  type="time"
                  value={newEmployee.regularInTime || ''}
                  onChange={e => setNewEmployee(s => ({ ...s, regularInTime: e.target.value }))}
                  className="w-full h-10 border border-gray-200 rounded-lg px-3 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-gray-900 bg-white"
                />
              </div>
              <div>
                <label className="block text-[11px] font-bold text-gray-700 mb-1">Regular Check-Out Time</label>
                <input
                  type="time"
                  value={newEmployee.regularOutTime || ''}
                  onChange={e => setNewEmployee(s => ({ ...s, regularOutTime: e.target.value }))}
                  className="w-full h-10 border border-gray-200 rounded-lg px-3 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-gray-900 bg-white"
                />
              </div>
            </div>
              </div>}
            </div>

            {/* Section: Personal Details */}
            <div className="bg-gray-50 rounded-xl border border-gray-200 overflow-hidden">
              <button
                type="button"
                onClick={() => toggleSection('personalDetails')}
                className="flex items-center gap-2 w-full px-4 py-2.5 transition-colors cursor-pointer select-none" style={{ backgroundColor: '#09CE99' }} onMouseEnter={e => e.currentTarget.style.backgroundColor = '#07B888'} onMouseLeave={e => e.currentTarget.style.backgroundColor = '#09CE99'}
              >
                <ChevronDown size={14} className={`text-white transition-transform duration-200 ${collapsedSections.personalDetails ? '-rotate-90' : ''}`} />
                <span className="text-[10px] font-black text-black uppercase tracking-[0.15em] font-geist">Personal Details</span>
              </button>
              {!collapsedSections.personalDetails && <div className="p-4 space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-[11px] font-bold text-gray-700 mb-1">Blood Group</label>
                <select value={newEmployee.bloodGroup} onChange={e => setNewEmployee(s => ({ ...s, bloodGroup: e.target.value }))}
                  className="w-full h-10 border border-gray-200 rounded-lg px-3 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-gray-900 bg-white"
                >
                  <option value="">Select...</option>
                  {['A+', 'A-', 'B+', 'B-', 'O+', 'O-', 'AB+', 'AB-'].map(bg => <option key={bg}>{bg}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-[11px] font-bold text-gray-700 mb-1">Date of Birth</label>
                <input type="date" value={newEmployee.dob}
                  onChange={e => setNewEmployee(s => ({ ...s, dob: e.target.value }))}
                  className="w-full h-10 border border-gray-200 rounded-lg px-3 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent bg-white"
                />
              </div>
              <div>
                <label className="block text-[11px] font-bold text-gray-700 mb-1">Father's Name</label>
                <input type="text" placeholder="Father's full name" value={newEmployee.fatherName}
                  onChange={e => setNewEmployee(s => ({ ...s, fatherName: e.target.value }))}
                  className="w-full h-10 border border-gray-200 rounded-lg px-3 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent bg-white"
                />
              </div>
              <div>
                <label className="block text-[11px] font-bold text-gray-700 mb-1">Mother's Name</label>
                <input type="text" placeholder="Mother's full name" value={newEmployee.motherName}
                  onChange={e => setNewEmployee(s => ({ ...s, motherName: e.target.value }))}
                  className="w-full h-10 border border-gray-200 rounded-lg px-3 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent bg-white"
                />
              </div>
              <div>
                <label className="block text-[11px] font-bold text-gray-700 mb-1">Marital Status</label>
                <select value={newEmployee.maritalStatus || ''} onChange={e => setNewEmployee(s => ({ ...s, maritalStatus: e.target.value }))}
                  className="w-full h-10 border border-gray-200 rounded-lg px-3 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-gray-900 bg-white"
                >
                  <option value="">Select...</option>
                  {['Single', 'Married', 'Divorced', 'Widowed'].map(ms => <option key={ms}>{ms}</option>)}
                </select>
              </div>
              <div className="col-span-2">
                <label className="block text-[11px] font-bold text-gray-700 mb-2">Status</label>
                <div className="flex gap-2">
                  {EMPLOYEE_STATUS_OPTIONS.map(s => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => setNewEmployee(e => ({ ...e, status: s }))}
                      className={`flex-1 h-10 rounded-lg text-sm font-semibold border transition-all ${newEmployee.status === s
                        ? s === EMPLOYEE_STATUS_ACTIVE
                          ? 'bg-green-600 text-white border-green-600'
                          : s === 'Inactive'
                            ? 'bg-red-500 text-white border-red-500'
                            : 'bg-sky-600 text-white border-sky-600'
                        : 'bg-white text-gray-400 border-gray-200 hover:border-gray-300'
                        }`}
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Full-width Address */}
            <div>
              <label className="block text-[11px] font-bold text-gray-700 mb-1">Address</label>
              <textarea placeholder="Full residential address" value={newEmployee.address}
                onChange={e => setNewEmployee(s => ({ ...s, address: e.target.value }))}
                rows={3}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent bg-white resize-none"
              />
            </div>
              </div>}
            </div>

            {/* Section: Contact & Login */}
            <div className="bg-gray-50 rounded-xl border border-gray-200 overflow-hidden">
              <button
                type="button"
                onClick={() => toggleSection('contactLogin')}
                className="flex items-center gap-2 w-full px-4 py-2.5 transition-colors cursor-pointer select-none" style={{ backgroundColor: '#09CE99' }} onMouseEnter={e => e.currentTarget.style.backgroundColor = '#07B888'} onMouseLeave={e => e.currentTarget.style.backgroundColor = '#09CE99'}
              >
                <ChevronDown size={14} className={`text-white transition-transform duration-200 ${collapsedSections.contactLogin ? '-rotate-90' : ''}`} />
                <span className="text-[10px] font-black text-white uppercase tracking-[0.15em]">Contact &amp; Login</span>
              </button>
              {!collapsedSections.contactLogin && <div className="p-4 space-y-4">
            <div className="col-span-2 space-y-3">
              <label className="block text-[11px] font-bold text-gray-700">Email Addresses</label>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Work Email Container */}
                <div 
                  className={`p-3.5 rounded-xl border-2 transition-all duration-200 cursor-pointer ${
                    newEmployee.loginEmailType === 'work' 
                      ? 'border-blue-600 bg-blue-50/30' 
                      : 'border-gray-200 hover:border-blue-400 bg-white'
                  }`}
                  onClick={() => setNewEmployee(s => ({ ...s, loginEmailType: 'work' }))}
                >
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-semibold text-gray-700">Work Email</span>
                    <div className="flex items-center gap-1.5">
                      <input 
                        type="radio" 
                        name="addLoginEmailType"
                        checked={newEmployee.loginEmailType === 'work'}
                        onChange={() => setNewEmployee(s => ({ ...s, loginEmailType: 'work' }))}
                        className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 cursor-pointer"
                      />
                      <span className="text-[10px] text-gray-500 font-medium">Use for login</span>
                    </div>
                  </div>
                  <input 
                    type="email" 
                    placeholder="work@company.com" 
                    value={newEmployee.workEmail || ''}
                    onClick={e => e.stopPropagation()} 
                    onChange={e => setNewEmployee(s => ({ ...s, workEmail: e.target.value }))}
                    className="w-full h-9 border border-gray-200 rounded-lg px-3 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                  />
                </div>

                {/* Personal Email Container */}
                <div 
                  className={`p-3.5 rounded-xl border-2 transition-all duration-200 cursor-pointer ${
                    newEmployee.loginEmailType === 'personal' 
                      ? 'border-blue-600 bg-blue-50/30' 
                      : 'border-gray-200 hover:border-blue-400 bg-white'
                  }`}
                  onClick={() => setNewEmployee(s => ({ ...s, loginEmailType: 'personal' }))}
                >
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-semibold text-gray-700">Personal Email</span>
                    <div className="flex items-center gap-1.5">
                      <input 
                        type="radio" 
                        name="addLoginEmailType"
                        checked={newEmployee.loginEmailType === 'personal'}
                        onChange={() => setNewEmployee(s => ({ ...s, loginEmailType: 'personal' }))}
                        className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 cursor-pointer"
                      />
                      <span className="text-[10px] text-gray-500 font-medium">Use for login</span>
                    </div>
                  </div>
                  <input 
                    type="email" 
                    placeholder="personal@email.com" 
                    value={newEmployee.personalEmail || ''}
                    onClick={e => e.stopPropagation()}
                    onChange={e => setNewEmployee(s => ({ ...s, personalEmail: e.target.value }))}
                    className="w-full h-9 border border-gray-200 rounded-lg px-3 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                  />
                </div>
              </div>
            </div>

            {/* System Role */}
            <div>
              <label className="block text-[11px] font-bold text-gray-700 mb-1">System Role</label>
              <select 
                value={newEmployee.role || 'Employee'} 
                onChange={e => setNewEmployee(s => ({ ...s, role: e.target.value }))}
                className="w-full h-10 border border-gray-200 rounded-lg px-3 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-gray-900 bg-white"
              >
                <option value="Employee">Employee</option>
                {roles.map(r => <option key={r.id} value={r.name}>{r.name}</option>)}
                {!roles.find(r => r.name.toLowerCase() === 'admin') && <option value="Admin">Admin</option>}
              </select>
            </div>

            {/* Contact Numbers Section */}
            <div className="grid grid-cols-3 gap-4">
              <div>
                <label className="block text-[11px] font-bold text-gray-700 mb-1">Mobile No</label>
                <input type="text" placeholder="Mobile Number" value={newEmployee.mobileNo || ''}
                  onChange={e => setNewEmployee(s => ({ ...s, mobileNo: e.target.value, contactNo: e.target.value }))}
                  className="w-full h-10 border border-gray-200 rounded-lg px-3 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-gray-900 bg-white"
                />
              </div>
              <div>
                <label className="block text-[11px] font-bold text-gray-700 mb-1">Office No</label>
                <input type="text" placeholder="Office Number" value={newEmployee.officeNo || ''}
                  onChange={e => setNewEmployee(s => ({ ...s, officeNo: e.target.value }))}
                  className="w-full h-10 border border-gray-200 rounded-lg px-3 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-gray-900 bg-white"
                />
              </div>
              <div>
                <label className="block text-[11px] font-bold text-gray-700 mb-1">Personal No</label>
                <input type="text" placeholder="Personal Number" value={newEmployee.personalNo || ''}
                  onChange={e => setNewEmployee(s => ({ ...s, personalNo: e.target.value }))}
                  className="w-full h-10 border border-gray-200 rounded-lg px-3 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-gray-900 bg-white"
                />
              </div>
            </div>
              </div>}
            </div>

            {/* Section: Identification */}
            <div className="bg-gray-50 rounded-xl border border-gray-200 overflow-hidden">
              <button
                type="button"
                onClick={() => toggleSection('identification')}
                className="flex items-center gap-2 w-full px-4 py-2.5 transition-colors cursor-pointer select-none" style={{ backgroundColor: '#09CE99' }} onMouseEnter={e => e.currentTarget.style.backgroundColor = '#07B888'} onMouseLeave={e => e.currentTarget.style.backgroundColor = '#09CE99'}
              >
                <ChevronDown size={14} className={`text-white transition-transform duration-200 ${collapsedSections.identification ? '-rotate-90' : ''}`} />
                <span className="text-[10px] font-black text-white uppercase tracking-[0.15em]">Identification &amp; Documents</span>
              </button>
              {!collapsedSections.identification && <div className="p-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-[11px] font-bold text-gray-700 mb-1">Aadhar No</label>
                <input type="text" placeholder="12-digit Aadhar Number" value={newEmployee.aadharNo || ''}
                  onChange={e => setNewEmployee(s => ({ ...s, aadharNo: e.target.value }))}
                  className="w-full h-10 border border-gray-200 rounded-lg px-3 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-gray-900 bg-white"
                />
              </div>
              <div>
                <label className="block text-[11px] font-bold text-gray-700 mb-1">PAN No</label>
                <input type="text" placeholder="10-digit PAN Number" value={newEmployee.panNo || ''}
                  onChange={e => setNewEmployee(s => ({ ...s, panNo: e.target.value }))}
                  className="w-full h-10 border border-gray-200 rounded-lg px-3 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-gray-900 bg-white"
                />
              </div>
              <div>
                <label className="block text-[11px] font-bold text-gray-700 mb-1">Driving License No</label>
                <input type="text" placeholder="Driving License Number" value={newEmployee.drivingLicenseNo || ''}
                  onChange={e => setNewEmployee(s => ({ ...s, drivingLicenseNo: e.target.value }))}
                  className="w-full h-10 border border-gray-200 rounded-lg px-3 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-gray-900 bg-white"
                />
              </div>
              <div className="flex items-center justify-between bg-zinc-50 px-4 py-2 rounded-xl border border-zinc-200 self-end h-10">
                <span className="text-[11px] font-bold text-gray-700">Own Vehicle</span>
                <button
                  type="button"
                  onClick={() => setNewEmployee(s => ({ ...s, hasOwnVehicle: !s.hasOwnVehicle }))}
                  className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${newEmployee.hasOwnVehicle ? 'bg-indigo-600' : 'bg-gray-300'}`}
                >
                  <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${newEmployee.hasOwnVehicle ? 'translate-x-4' : 'translate-x-0.5'}`} />
                </button>
              </div>
              <div>
                <label className="block text-[11px] font-bold text-gray-700 mb-1">PF No</label>
                <input type="text" placeholder="Provident Fund Number" value={newEmployee.pfNo || ''}
                  onChange={e => setNewEmployee(s => ({ ...s, pfNo: e.target.value }))}
                  className="w-full h-10 border border-gray-200 rounded-lg px-3 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-gray-900 bg-white"
                />
              </div>
              <div>
                <label className="block text-[11px] font-bold text-gray-700 mb-1">ESI No</label>
                <input type="text" placeholder="ESI Number" value={newEmployee.esiNo || ''}
                  onChange={e => setNewEmployee(s => ({ ...s, esiNo: e.target.value }))}
                  className="w-full h-10 border border-gray-200 rounded-lg px-3 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-gray-900 bg-white"
                />
              </div>
            </div>
              </div>}
            </div>

            {/* Bank Account Details */}
            <div className="border-t border-gray-100 pt-4 space-y-4">
              <label className="block text-[11px] font-bold text-gray-700">Bank Account Details</label>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Personal Bank Account Card */}
                <div className="p-4 border border-gray-200 rounded-xl bg-gray-50/50 space-y-3">
                  <span className="block text-xs font-bold text-gray-600 border-b border-gray-200 pb-1.5">Personal Bank Account</span>
                  <div>
                    <label className="block text-[10px] text-gray-500 font-bold mb-1">Account Holder Name</label>
                    <input type="text" placeholder="Holder Name" value={newEmployee.personalBank?.holderName || ''}
                      onChange={e => setNewEmployee(s => ({ ...s, personalBank: { ...(s.personalBank || {}), holderName: e.target.value } }))}
                      className="w-full h-8 border border-gray-200 rounded-lg px-2.5 text-xs text-gray-800 focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] text-gray-500 font-bold mb-1">Account Number</label>
                    <input type="text" placeholder="Account Number" value={newEmployee.personalBank?.accountNo || ''}
                      onChange={e => setNewEmployee(s => ({ ...s, personalBank: { ...(s.personalBank || {}), accountNo: e.target.value } }))}
                      className="w-full h-8 border border-gray-200 rounded-lg px-2.5 text-xs text-gray-800 focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-[10px] text-gray-500 font-bold mb-1">Bank Name</label>
                      <input type="text" placeholder="Bank Name" value={newEmployee.personalBank?.bankName || ''}
                        onChange={e => setNewEmployee(s => ({ ...s, personalBank: { ...(s.personalBank || {}), bankName: e.target.value } }))}
                        className="w-full h-8 border border-gray-200 rounded-lg px-2.5 text-xs text-gray-800 focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] text-gray-500 font-bold mb-1">IFSC Code</label>
                      <input type="text" placeholder="IFSC Code" value={newEmployee.personalBank?.ifsc || ''}
                        onChange={e => setNewEmployee(s => ({ ...s, personalBank: { ...(s.personalBank || {}), ifsc: e.target.value } }))}
                        className="w-full h-8 border border-gray-200 rounded-lg px-2.5 text-xs text-gray-800 focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white"
                      />
                    </div>
                  </div>
                </div>

                {/* Company Bank Account Card */}
                <div className="p-4 border border-gray-200 rounded-xl bg-gray-50/50 space-y-3">
                  <span className="block text-xs font-bold text-gray-600 border-b border-gray-200 pb-1.5">Company Bank Account</span>
                  <div>
                    <label className="block text-[10px] text-gray-500 font-bold mb-1">Account Holder Name</label>
                    <input type="text" placeholder="Holder Name" value={newEmployee.companyBank?.holderName || ''}
                      onChange={e => setNewEmployee(s => ({ ...s, companyBank: { ...(s.companyBank || {}), holderName: e.target.value } }))}
                      className="w-full h-8 border border-gray-200 rounded-lg px-2.5 text-xs text-gray-800 focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] text-gray-500 font-bold mb-1">Account Number</label>
                    <input type="text" placeholder="Account Number" value={newEmployee.companyBank?.accountNo || ''}
                      onChange={e => setNewEmployee(s => ({ ...s, companyBank: { ...(s.companyBank || {}), accountNo: e.target.value } }))}
                      className="w-full h-8 border border-gray-200 rounded-lg px-2.5 text-xs text-gray-800 focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-[10px] text-gray-500 font-bold mb-1">Bank Name</label>
                      <input type="text" placeholder="Bank Name" value={newEmployee.companyBank?.bankName || ''}
                        onChange={e => setNewEmployee(s => ({ ...s, companyBank: { ...(s.companyBank || {}), bankName: e.target.value } }))}
                        className="w-full h-8 border border-gray-200 rounded-lg px-2.5 text-xs text-gray-800 focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] text-gray-500 font-bold mb-1">IFSC Code</label>
                      <input type="text" placeholder="IFSC Code" value={newEmployee.companyBank?.ifsc || ''}
                        onChange={e => setNewEmployee(s => ({ ...s, companyBank: { ...(s.companyBank || {}), ifsc: e.target.value } }))}
                        className="w-full h-8 border border-gray-200 rounded-lg px-2.5 text-xs text-gray-800 focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white"
                      />
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Section: Settings */}
            <div className="bg-gray-50 rounded-xl border border-gray-200 overflow-hidden">
              <button
                type="button"
                onClick={() => toggleSection('settings')}
                className="flex items-center gap-2 w-full px-4 py-2.5 transition-colors cursor-pointer select-none" style={{ backgroundColor: '#09CE99' }} onMouseEnter={e => e.currentTarget.style.backgroundColor = '#07B888'} onMouseLeave={e => e.currentTarget.style.backgroundColor = '#09CE99'}
              >
                <ChevronDown size={14} className={`text-white transition-transform duration-200 ${collapsedSections.settings ? '-rotate-90' : ''}`} />
                <span className="text-[10px] font-black text-white uppercase tracking-[0.15em]">Settings</span>
              </button>
              {!collapsedSections.settings && <div className="p-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Login Enabled Toggle */}
              <div className="flex items-center justify-between bg-indigo-50/50 p-3.5 rounded-xl border border-indigo-100/60">
                <div className="pr-2">
                  <label className="block text-[11px] font-bold text-indigo-700">Login Enabled</label>
                  <p className="text-[10px] text-indigo-500 leading-tight">Allow employee to access the system</p>
                </div>
                <button
                  type="button"
                  onClick={() => setNewEmployee(s => ({ ...s, loginEnabled: !s.loginEnabled }))}
                  className={`relative shrink-0 inline-flex h-6 w-11 items-center rounded-full transition-colors ${newEmployee.loginEnabled ? 'bg-indigo-600' : 'bg-gray-300'}`}
                >
                  <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${newEmployee.loginEnabled ? 'translate-x-6' : 'translate-x-1'}`} />
                </button>
              </div>

              {/* Hide in Attendance Toggle */}
              <div className="flex items-center justify-between bg-red-50/50 p-3.5 rounded-xl border border-red-100/60">
                <div className="pr-2">
                  <label className="block text-[11px] font-bold text-red-700 uppercase tracking-wider">Hide in Attendance</label>
                  <p className="text-[10px] text-red-600 leading-tight">Won't appear in daily attendance list</p>
                </div>
                <button
                  type="button"
                  onClick={() => setNewEmployee(s => ({ ...s, hideInAttendance: !s.hideInAttendance }))}
                  className={`relative shrink-0 inline-flex h-6 w-11 items-center rounded-full transition-colors ${newEmployee.hideInAttendance ? 'bg-red-600' : 'bg-gray-300'}`}
                >
                  <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${newEmployee.hideInAttendance ? 'translate-x-6' : 'translate-x-1'}`} />
                </button>
              </div>

              {/* Include in Salary Toggle */}
              <div className="flex items-center justify-between bg-emerald-50/50 p-3.5 rounded-xl border border-emerald-100/60">
                <div className="pr-2">
                  <label className="block text-[11px] font-bold text-emerald-700 uppercase tracking-wider">Include in Salary</label>
                  <p className="text-[10px] text-emerald-600 leading-tight">Will appear in payroll and salary slips</p>
                </div>
                <button
                  type="button"
                  onClick={() => setNewEmployee(s => ({ ...s, includeInSalary: !s.includeInSalary }))}
                  className={`relative shrink-0 inline-flex h-6 w-11 items-center rounded-full transition-colors ${newEmployee.includeInSalary !== false ? 'bg-emerald-600' : 'bg-gray-300'}`}
                >
                  <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${newEmployee.includeInSalary !== false ? 'translate-x-6' : 'translate-x-1'}`} />
                </button>
              </div>

              {/* Include in Task Toggle */}
              <div className="flex items-center justify-between bg-sky-50/50 p-3.5 rounded-xl border border-sky-100/60">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-indigo-100 flex items-center justify-center text-indigo-600">
                    <AtSign size={16} />
                  </div>
                  <div className="pr-2">
                    <label className="block text-[11px] font-bold text-indigo-700 uppercase tracking-wider">Include in Task</label>
                    <p className="text-[10px] text-indigo-600 leading-tight">Allow mentions and assignments in Tasks</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setNewEmployee(s => ({ ...s, includeInTask: !s.includeInTask }))}
                  className={`relative shrink-0 inline-flex h-6 w-11 items-center rounded-full transition-colors ${newEmployee.includeInTask !== false ? 'bg-indigo-600' : 'bg-gray-300'}`}
                >
                  <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${newEmployee.includeInTask !== false ? 'translate-x-6' : 'translate-x-1'}`} />
                </button>
              </div>

              {/* Withdraw Full Salary Toggle */}
              <div className="flex items-center justify-between bg-amber-50/50 p-3.5 rounded-xl border border-amber-100/60 col-span-1 md:col-span-2">
                <div className="pr-2">
                  <label className="block text-[11px] font-bold text-amber-800 uppercase tracking-wider">Withdraw Full Salary</label>
                  <p className="text-[10px] text-amber-600 leading-tight">Enable full salary withdrawals (useful for Owners, Directors, Board Members)</p>
                </div>
                <button
                  type="button"
                  onClick={() => setNewEmployee(s => ({ ...s, withdrawFullSalary: !s.withdrawFullSalary }))}
                  className={`relative shrink-0 inline-flex h-6 w-11 items-center rounded-full transition-colors ${newEmployee.withdrawFullSalary ? 'bg-amber-600' : 'bg-gray-300'}`}
                >
                  <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${newEmployee.withdrawFullSalary ? 'translate-x-6' : 'translate-x-1'}`} />
                </button>
              </div>
            </div>
              </div>}
            </div>

            {/* Password Field - Only shown when login is enabled */}
            {newEmployee.loginEnabled && (
              <div>
                <label className="block text-[11px] font-bold text-gray-700 mb-1">Temporary Password *</label>
                <input
                  type="text"
                  placeholder="Enter temporary password"
                  value={newEmployee.tempPassword || ''}
                  onChange={(e) => setNewEmployee(s => ({ ...s, tempPassword: e.target.value }))}
                  className="w-full h-10 border border-gray-200 rounded-lg px-3 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-gray-900 bg-white"
                />
                <p className="text-[10px] text-gray-400 mt-1">Share this password with the employee</p>
              </div>
            )}

            {/* Documents Upload Section */}
            <div className="border border-gray-100 rounded-xl p-4 bg-gray-50/50">
              <div className="flex items-center justify-between mb-3">
                <label className="text-[11px] font-bold text-gray-700 flex items-center gap-1.5"><Paperclip size={13} /> Documents</label>
                <span className="text-[10px] text-gray-400">{newEmployee.documents?.length || 0} file(s)</span>
              </div>

              {/* Existing uploaded docs list */}
              {(newEmployee.documents || []).length > 0 && (
                <div className="space-y-2 mb-3">
                  {(newEmployee.documents || []).map((doc, i) => {
                    const isImg = /\.(png|jpg|jpeg|gif|webp)$/i.test(doc.url || '')
                    return (
                      <div key={i} className="flex items-center gap-2 bg-white rounded-lg px-3 py-2 border border-gray-100">
                        {isImg
                          ? <img src={doc.url} alt={doc.name} className="w-8 h-8 rounded object-cover border border-gray-200" />
                          : <div className="w-8 h-8 rounded bg-indigo-50 flex items-center justify-center border border-indigo-100"><FileText size={14} className="text-indigo-400" /></div>
                        }
                        <span className="flex-1 text-[11px] font-medium text-gray-700 truncate">{doc.name}</span>
                        <button
                          type="button"
                          onClick={() => setViewerState({ docs: newEmployee.documents, index: i })}
                          className="p-1 hover:bg-gray-100 rounded text-gray-400 hover:text-gray-700 transition-all"
                          title="View"
                        >
                          <Eye size={13} />
                        </button>
                        <button
                          type="button"
                          onClick={() => setNewEmployee(s => ({ ...s, documents: s.documents.filter((_, idx) => idx !== i) }))}
                          className="p-1 hover:bg-red-50 rounded text-gray-300 hover:text-red-400 transition-all"
                          title="Remove"
                        >
                          <X size={13} />
                        </button>
                      </div>
                    )
                  })}
                </div>
              )}

              {/* Upload new document row */}
              <div className="flex gap-2 items-center">
                <input
                  type="text"
                  placeholder="Document label (e.g. Aadhaar)"
                  value={newDocUpload.name}
                  onChange={e => setNewDocUpload(s => ({ ...s, name: e.target.value }))}
                  className="flex-1 h-9 border border-gray-200 rounded-lg px-3 text-[12px] text-gray-800 focus:outline-none focus:ring-2 focus:ring-gray-900 bg-white"
                />
                <label className={`h-9 px-3 rounded-lg border text-[12px] font-medium flex items-center gap-1.5 cursor-pointer transition-all ${newDocUpload.uploading
                  ? 'bg-gray-100 text-gray-400 border-gray-200'
                  : 'bg-white border-gray-200 text-gray-600 hover:border-gray-400 hover:text-gray-900'
                  }`}>
                  {newDocUpload.uploading ? (
                    <svg className="animate-spin h-3 w-3" viewBox="0 0 24 24" fill="none"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" /></svg>
                  ) : <Paperclip size={13} />}
                  {newDocUpload.uploading ? 'Uploading...' : 'Attach'}
                  <input
                    type="file"
                    className="hidden"
                    disabled={newDocUpload.uploading}
                    onChange={async (e) => {
                      const file = e.target.files[0]
                      if (!file) return
                      const label = newDocUpload.name.trim() || file.name
                      setNewDocUpload(s => ({ ...s, uploading: true }))
                      try {
                        const url = await handleFileUpload(file, `employees/docs/${Date.now()}_${file.name}`)
                        if (url) {
                          setNewEmployee(s => ({
                            ...s,
                            documents: [...(s.documents || []), { name: label, url, type: file.type }]
                          }))
                        }
                      } finally {
                        setNewDocUpload({ name: '', file: null, uploading: false })
                      }
                      e.target.value = ''
                    }}
                  />
                </label>
              </div>
            </div>

          </div>

          {/* Footer */}
          <div className="px-6 py-4 border-t border-gray-100 shrink-0 flex gap-3 bg-white">
            <button
              type="button"
              onClick={() => { setShowAddEmployee(false); setFormErrors({}); }}
              className="px-5 h-10 rounded-lg text-sm font-medium text-gray-500 hover:bg-gray-50 border border-gray-200 transition-all"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleAddEmployee}
              disabled={saving}
              className="flex-1 h-10 bg-gray-900 text-white font-semibold rounded-lg text-sm hover:bg-gray-800 disabled:opacity-50 transition-all"
            >
              {saving ? 'Saving...' : 'Save Employee'}
            </button>
          </div>
        </div>
      </Modal>

      {/* SHIFT & ROLE MODALS (SIMILAR STYLE) */}
      <Modal isOpen={showAddShift} onClose={() => setShowAddShift(false)} title={editingShift ? 'EDIT SHIFT' : 'NEW SHIFT'}>
        <div className="p-6 space-y-4 max-w-sm mx-auto">
          <input type="text" placeholder="Shift Name" value={newShift.name} onChange={e => setNewShift(s => ({ ...s, name: e.target.value }))} className="w-full border rounded-none px-4 py-2.5 text-xs font-black bg-gray-50 outline-none" />
          <div>
            <label className="block text-[10px] font-bold text-blue-600 uppercase mb-2">Shift Type</label>
            <select value={newShift.type} onChange={e => setNewShift(s => ({ ...s, type: e.target.value }))} className="w-full border rounded-none px-4 py-2.5 text-xs font-black bg-gray-50 outline-none">
              <option value="Day">Day Shift</option>
              <option value="Night">Night Shift</option>
              <option value="General">General Shift</option>
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[10px] font-bold text-blue-600 uppercase mb-1">Start Time</label>
              <div className="relative">
                <button
                  onClick={() => setShowStartTimePicker(!showStartTimePicker)}
                  className="w-full border rounded-none px-3 py-2 text-xs font-black bg-gray-50 outline-none text-left flex items-center justify-between"
                >
                  <span>{newShift.startTime ? (() => {
                    const [h, m] = newShift.startTime.split(':').map(Number)
                    const p = h >= 12 ? 'PM' : 'AM'
                    const h12 = h % 12 || 12
                    return `${h12}:${String(m).padStart(2, '0')} ${p}`
                  })() : 'Select time'}</span>
                </button>
                {showStartTimePicker && (
                  <TimePicker
                    value={newShift.startTime || '09:00'}
                    onChange={(time) => setNewShift(s => ({ ...s, startTime: time }))}
                    onClose={() => setShowStartTimePicker(false)}
                  />
                )}
              </div>
            </div>
            <div>
              <label className="block text-[10px] font-bold text-blue-600 uppercase mb-1">End Time</label>
              <div className="relative">
                <button
                  onClick={() => setShowEndTimePicker(!showEndTimePicker)}
                  className="w-full border rounded-none px-3 py-2 text-xs font-black bg-gray-50 outline-none text-left flex items-center justify-between"
                >
                  <span>{newShift.endTime ? (() => {
                    const [h, m] = newShift.endTime.split(':').map(Number)
                    const p = h >= 12 ? 'PM' : 'AM'
                    const h12 = h % 12 || 12
                    return `${h12}:${String(m).padStart(2, '0')} ${p}`
                  })() : 'Select time'}</span>
                </button>
                {showEndTimePicker && (
                  <TimePicker
                    value={newShift.endTime || '18:00'}
                    onChange={(time) => setNewShift(s => ({ ...s, endTime: time }))}
                    onClose={() => setShowEndTimePicker(false)}
                  />
                )}
              </div>
            </div>
          </div>
          <div className="flex items-center justify-between bg-purple-50 p-3 rounded-none border border-purple-100">
            <span className="text-[10px] font-black text-purple-700 uppercase">Flexible?</span>
            <input type="checkbox" checked={newShift.isFlexible} onChange={e => setNewShift(s => ({ ...s, isFlexible: e.target.checked }))} className="w-5 h-5 rounded-none text-purple-600" />
          </div>
          <button onClick={handleAddShift} className="w-full bg-indigo-600 text-white font-black py-3 rounded-none uppercase text-[10px]">SAVE SHIFT</button>
        </div>
      </Modal>

      {/* Minimum Work Hours Modal */}
      <Modal isOpen={showAddMinWorkHours} onClose={() => { setShowAddMinWorkHours(false); setEditingMinWorkHours(null); setNewMinWorkHours({ name: '', hours: 8, description: '' }) }} title={editingMinWorkHours ? 'Edit Minimum Work Hours' : 'Add Minimum Work Hours'}>
        <div className="flex flex-col max-w-md mx-auto font-inter bg-white">
          <div className="flex-1 px-6 py-6 space-y-4">
            <div>
              <label className="block text-[11px] font-bold text-gray-700 mb-1">Category Name *</label>
              <input type="text" placeholder="e.g. Staff, Technician, Manager" value={newMinWorkHours.name} onChange={e => setNewMinWorkHours(s => ({ ...s, name: e.target.value }))} className="w-full h-10 border border-gray-200 rounded-lg px-3 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent bg-white" />
            </div>
            <div>
              <label className="block text-[11px] font-bold text-gray-700 mb-1">Minimum Hours *</label>
              <input type="number" min="1" max="24" value={newMinWorkHours.hours} onChange={e => setNewMinWorkHours(s => ({ ...s, hours: Number(e.target.value) }))} className="w-full h-10 border border-gray-200 rounded-lg px-3 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent bg-white" />
            </div>
            <div>
              <label className="block text-[11px] font-bold text-gray-700 mb-1">Description</label>
              <input type="text" placeholder="Enter brief description" value={newMinWorkHours.description || ''} onChange={e => setNewMinWorkHours(s => ({ ...s, description: e.target.value }))} className="w-full h-10 border border-gray-200 rounded-lg px-3 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent bg-white" />
            </div>
          </div>
          <div className="px-6 py-4 border-t border-gray-100 shrink-0 flex gap-3 bg-white">
            <button
              type="button"
              onClick={() => { setShowAddMinWorkHours(false); setEditingMinWorkHours(null); setNewMinWorkHours({ name: '', hours: 8, description: '' }) }}
              className="px-5 h-10 rounded-lg text-sm font-medium text-gray-500 hover:bg-gray-50 border border-gray-200 transition-all"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleAddMinWorkHours}
              className="flex-1 h-10 bg-gray-900 text-white font-semibold rounded-lg text-sm hover:bg-gray-800 transition-all"
            >
              Save Category
            </button>
          </div>
        </div>
      </Modal>

      <Modal isOpen={showAddRole} onClose={() => { setShowAddRole(false); setEditingRole(null); setNewRole({ name: '', description: '', isAccountant: false, permissions: { Tasks: { view: true } } }) }} title={editingRole ? 'Edit Role' : 'Create New Role'}>
        <div className="flex flex-col max-w-6xl mx-auto bg-zinc-50 font-inter">
          <div className="px-5 py-4 space-y-4">
            {/* Identity Section */}
            <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1.7fr)_280px] gap-4 pb-4 border-b border-zinc-200">
              <div className="grid grid-cols-1 md:grid-cols-[minmax(220px,0.85fr)_minmax(0,1.15fr)] gap-4">
                <div>
                  <label className="block text-[10px] font-black text-gray-500 uppercase tracking-[0.18em] mb-1.5">Role Name *</label>
                  <input
                    type="text"
                    value={newRole.name}
                    onChange={e => setNewRole(s => ({ ...s, name: e.target.value }))}
                    className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-[10px] font-bold bg-gray-50 focus:ring-2 focus:ring-indigo-500 outline-none transition-all"
                    placeholder="Enter role name"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-black text-gray-500 uppercase tracking-[0.18em] mb-1.5">Description</label>
                  <textarea
                    value={newRole.description || ''}
                    onChange={e => setNewRole(s => ({ ...s, description: e.target.value }))}
                    rows={2}
                    className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-[10px] leading-[1.4] font-medium bg-gray-50 focus:ring-2 focus:ring-indigo-500 outline-none resize-none transition-all"
                    placeholder="What can this role do?"
                  />
                </div>
              </div>
              <div className="flex flex-col justify-center bg-indigo-50/50 rounded-2xl p-4 border border-indigo-100">
                <label className="flex items-center gap-3 cursor-pointer group">
                  <div className={`w-5 h-5 rounded-md border-2 flex items-center justify-center transition-all ${newRole.isAccountant ? 'bg-zinc-100 border-black' : 'bg-zinc-100 border-zinc-400 group-hover:border-black'}`}>
                    {newRole.isAccountant && <Check size={12} className="text-black" />}
                  </div>
                  <input 
                    type="checkbox" 
                    className="hidden" 
                    checked={!!newRole.isAccountant} 
                    onChange={e => setNewRole(s => ({ ...s, isAccountant: e.target.checked }))} 
                  />
                  <div>
                    <span className="block text-[10px] font-black text-indigo-900 uppercase tracking-[0.12em] leading-tight">This role is for Accountant users</span>
                    <p className="mt-1 text-[10px] leading-tight text-indigo-500 font-medium">Enables specialized accounting features and reporting.</p>
                  </div>
                </label>
              </div>
            </div>

            {/* Permissions Matrix */}
            <div>
              <div className="flex items-center justify-between mb-3">
                <div>
                  <h4 className="text-[10px] font-black text-gray-800 uppercase tracking-[0.2em]">Permissions Matrix</h4>
                  <p className="text-[10px] text-gray-400 font-medium mt-0.5 uppercase">Configure module-level access and actions</p>
                </div>
                <div className="flex gap-3">
                  <div className="flex items-center gap-2">
                    <div className="w-2.5 h-2.5 flex items-center justify-center bg-zinc-100 border border-black rounded-sm"><Check size={8} className="text-black" /></div>
                    <span className="text-[10px] font-black text-gray-500 uppercase tracking-[0.18em]">Enabled</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-2.5 h-2.5 bg-gray-200 rounded-sm"></div>
                    <span className="text-[10px] font-black text-gray-500 uppercase tracking-[0.18em]">Disabled</span>
                  </div>
                </div>
              </div>

              <div className="border border-zinc-200 rounded-2xl overflow-hidden shadow-sm">
                <table className="w-full text-left">
                  <thead>
                    <tr className="bg-zinc-100/70 border-b border-zinc-200">
                      <th className="px-4 py-2.5 text-[10px] font-black text-gray-400 uppercase tracking-[0.18em] w-[28%]">Module Name</th>
                      <th className="px-2 py-2.5 text-[10px] font-black text-gray-400 uppercase tracking-[0.14em] text-center">All</th>
                      {roleMatrixActions.map(action => (
                        <th key={action} className="px-2 py-2.5 text-[10px] font-black text-gray-400 uppercase tracking-[0.14em] text-center">{action}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-100">
                    {Object.entries(moduleGroups).map(([group, groupModules]) => (
                      <React.Fragment key={group}>
                        <tr className="bg-zinc-100/40">
                          <td colSpan={7} className="px-4 py-1.5 text-[9px] font-black text-indigo-600 uppercase tracking-[0.22em]">{group}</td>
                        </tr>
                        {groupModules.map(mod => (
                          <tr key={mod.id} className="hover:bg-zinc-100/60 transition-colors">
                            <td className="px-4 py-2">
                              <span className="text-[10px] leading-tight font-bold text-gray-700 uppercase tracking-[0.06em]">{mod.label}</span>
                            </td>
                            <td className="px-2 py-2 text-center">
                              <button
                                type="button"
                                onClick={() => toggleAllPermissions(mod.id)}
                                className={`min-w-[30px] h-4 rounded border inline-flex items-center justify-center px-1.5 text-[9px] font-black uppercase tracking-[0.12em] transition-all ${
                                  areAllRoleMatrixActionsEnabled(newRole.permissions?.[mod.id])
                                    ? 'bg-zinc-100 border-black text-black'
                                    : 'bg-zinc-100 border-zinc-300 text-zinc-600 hover:border-black'
                                }`}
                              >
                                All
                              </button>
                            </td>
                            {roleMatrixActions.map(action => (
                              <td key={action} className="px-2 py-2 text-center">
                                <button
                                  type="button"
                                  onClick={() => togglePermission(mod.id, action)}
                                  className={`w-4 h-4 rounded border inline-flex items-center justify-center transition-all ${newRole.permissions?.[mod.id]?.[action] ? 'bg-zinc-100 border-black' : 'bg-zinc-100 border-zinc-300 hover:border-black'}`}
                                >
                                  {newRole.permissions?.[mod.id]?.[action] && <Check size={10} className="text-black" />}
                                </button>
                              </td>
                            ))}
                          </tr>
                        ))}
                      </React.Fragment>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          {/* Modal Footer */}
          <div className="px-5 py-3 border-t border-zinc-200 bg-zinc-100 flex justify-between items-center">
            <button
              type="button"
              onClick={() => { setShowAddRole(false); setEditingRole(null); setNewRole({ name: '', description: '', isAccountant: false, permissions: { Tasks: { view: true } } }) }}
              className="px-5 py-2 text-[10px] font-black text-gray-400 hover:text-gray-600 uppercase tracking-[0.18em] transition-all"
            >
              Discard Changes
            </button>
            <button
              type="button"
              onClick={handleAddRole}
              disabled={saving}
              className="bg-indigo-600 text-white px-7 py-2 rounded-xl font-black text-[10px] shadow-xl hover:bg-indigo-700 transition-all uppercase tracking-[0.18em] disabled:opacity-50"
            >
              {saving ? 'Saving...' : (editingRole ? 'Update Role' : 'Create Role')}
            </button>
          </div>
        </div>
      </Modal>
      
        {activeSubTab === 'user_roles' && showInvitePage && (
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden animate-in slide-in-from-right duration-300 no-print min-h-[60vh]">
            <div className="px-6 py-4 border-b border-gray-100 flex justify-between items-center bg-gray-50/50">
              <div className="flex items-center gap-3">
                <button 
                  onClick={() => setShowInvitePage(false)}
                  className="p-2 hover:bg-gray-100 rounded-lg transition-colors text-gray-400 hover:text-gray-900"
                >
                  <ChevronLeft size={20} />
                </button>
                <h3 className="text-sm font-black text-gray-700 uppercase tracking-widest">Invite User (Role Assignment)</h3>
              </div>
              <div className="text-[10px] font-bold text-gray-400 uppercase tracking-widest bg-white px-3 py-1.5 rounded-lg border border-gray-100">
                Total Employees: {employees.filter(emp => emp.loginEnabled).length}
              </div>
            </div>

            <div className="p-6">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {employees.length === 0 ? (
                  <div className="col-span-full text-center py-20 text-gray-400 italic">No employees found in the system.</div>
                ) : employees.filter(emp => emp.loginEnabled).length === 0 ? (
                  <div className="col-span-full text-center py-20">
                    <div className="max-w-xs mx-auto space-y-4">
                      <div className="w-16 h-16 bg-amber-50 rounded-full flex items-center justify-center mx-auto">
                        <X className="text-amber-500" size={32} />
                      </div>
                      <h4 className="font-black text-gray-800 uppercase tracking-widest text-sm">No Login Access Enabled</h4>
                      <p className="text-[11px] text-gray-500 font-medium">Please enable "Login Access" in the Employee directory for staff you wish to invite to the portal.</p>
                      <button 
                        onClick={() => setActiveSubTab('employee')}
                        className="text-[10px] font-black text-indigo-600 uppercase tracking-widest hover:underline"
                      >
                        Go to Employees →
                      </button>
                    </div>
                  </div>
                ) : employees.filter(emp => emp.loginEnabled).map(emp => {
                  const userExists = users.find(u => u.email === emp.email)
                  return (
                    <div key={emp.id} className="bg-white rounded-2xl border border-gray-100 shadow-sm hover:shadow-md transition-all p-4 group relative overflow-hidden">
                      {userExists && (
                        <div className="absolute top-0 right-0 p-2">
                          <span className="bg-green-100 text-green-700 text-[8px] font-black px-2 py-0.5 rounded-full uppercase tracking-tighter shadow-sm border border-green-200">Linked</span>
                        </div>
                      )}
                      
                      <div className="flex items-center gap-4 mb-4">
                        <div className="w-12 h-12 rounded-full flex items-center justify-center text-white font-black text-xs shadow-inner" style={{ backgroundColor: getAvatarColor(emp.id) }}>
                          {getInitials(emp.name)}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="font-black text-gray-800 uppercase tracking-tight text-sm truncate">{emp.name}</div>
                          <div className="text-[10px] text-gray-400 font-bold uppercase tracking-widest truncate">{emp.email}</div>
                        </div>
                      </div>

                      <div className="space-y-3">
                        <div className="flex items-center justify-between text-[10px] bg-gray-50 p-2 rounded-xl border border-gray-100">
                          <span className="font-black text-gray-400 uppercase tracking-widest">Assigned Role</span>
                          <span className="font-bold text-indigo-600 uppercase">{emp.role || 'No Role'}</span>
                        </div>

                        <div className="flex gap-2">
                          <button 
                            onClick={async () => {
                              await openEmployeeEditor(emp)
                              setShowInvitePage(false)
                              setActiveSubTab('employee')
                            }}
                            className="flex-1 h-9 bg-gray-900 text-white rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-gray-800 transition-all shadow-sm flex items-center justify-center gap-2"
                          >
                            <Edit size={12} /> Edit Role
                          </button>
                          <button 
                            onClick={async () => {
                              if (confirm(`Remove login access for ${emp.name}? This will NOT delete their employee record.`)) {
                                await updateEmployee(emp.id, { loginEnabled: false })
                                alert('Login access disabled.')
                              }
                            }}
                            className="w-9 h-9 bg-red-50 text-red-500 rounded-xl hover:bg-red-100 transition-all flex items-center justify-center shadow-sm border border-red-100"
                            title="Remove Login Access"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>

            <div className="px-6 py-4 border-t border-gray-100 bg-gray-50 flex justify-end">
              <button 
                onClick={() => setShowInvitePage(false)}
                className="px-8 py-2.5 bg-white border border-gray-200 text-gray-500 rounded-xl text-xs font-black uppercase tracking-widest hover:bg-gray-100 transition-all shadow-sm"
              >
                Back to Users
              </button>
            </div>
          </div>
        )}

      {/* Full-screen Image Viewer */}
      {viewerState && (
        <ImageViewer
          docs={viewerState.docs}
          index={viewerState.index}
          onClose={() => setViewerState(null)}
        />
      )}

      {/* Row Order Modal */}
      {showRowOrder && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-md mx-4 max-h-[80vh] flex flex-col">
            <div className="flex items-center justify-between p-4 border-b border-gray-100">
              <h3 className="text-sm font-bold text-gray-800">Row Order</h3>
              <button onClick={() => setShowRowOrder(false)} className="p-1 hover:bg-gray-100 rounded-lg">
                <X size={18} className="text-gray-500" />
              </button>
            </div>
            <div className="flex-1 overflow-auto p-4">
              <p className="text-[11px] text-gray-500 mb-3">Drag and drop to reorder employees for attendance entry</p>
              <div className="space-y-2">
                {rowOrder.map((empId, index) => {
                  const emp = employees.find(e => e.id === empId)
                  if (!emp) return null
                  return (
                    <div
                      key={empId}
                      draggable
                      onDragStart={(e) => handleRowDragStart(e, index)}
                      onDragOver={(e) => handleRowDragOver(e, index)}
                      onDragEnd={handleRowDragEnd}
                      className={`flex items-center gap-3 p-3 bg-gray-50 rounded-lg border border-gray-200 cursor-move hover:bg-gray-100 transition-colors ${draggedRowItem === index ? 'opacity-50' : ''}`}
                    >
                      <GripVertical size={16} className="text-gray-400" />
                      <span className="text-[12px] font-medium text-gray-700">{emp.name}</span>
                    </div>
                  )
                })}
              </div>
            </div>
            <div className="p-4 border-t border-gray-100 flex gap-2">
              <button 
                onClick={() => setShowRowOrder(false)}
                className="flex-1 h-10 bg-gray-100 text-gray-600 rounded-lg text-[12px] font-medium hover:bg-gray-200 transition-colors"
              >
                Cancel
              </button>
              <button 
                onClick={saveRowOrder}
                className="flex-1 h-10 bg-indigo-600 text-white rounded-lg text-[12px] font-medium flex items-center justify-center gap-2 hover:bg-indigo-700 transition-colors"
              >
                <Save size={14} /> Save Default
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Employee Preview Modal */}
      {showPreview && employees[previewEmpIndex] && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg mx-auto max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between p-4 border-b border-gray-100">
              <h3 className="text-lg font-bold text-gray-800">Employee Preview</h3>
              <button onClick={() => setShowPreview(false)} className="p-1 hover:bg-gray-100 rounded-lg">
                <X size={20} className="text-gray-500" />
              </button>
            </div>
            <div className="flex-1 overflow-auto p-6">
              {(() => {
                const emp = employees[previewEmpIndex]
                return (
                  <div className="space-y-4">
                    <div className="flex items-center gap-4 pb-4 border-b border-gray-100">
                      {emp.photoURL ? (
                        <img src={emp.photoURL} alt={emp.name} className="w-20 h-20 rounded-full object-cover" />
                      ) : (
                        <div className="w-20 h-20 rounded-full flex items-center justify-center text-white text-xl font-bold" style={{ backgroundColor: getAvatarColor(emp.id) }}>
                          {getInitials(emp.name)}
                        </div>
                      )}
                      <div>
                        <h4 className="text-xl font-bold text-gray-800">{emp.name}</h4>
                        <p className="text-sm text-gray-500">{emp.designation || 'No designation'}</p>
                        <p className="text-xs text-gray-400 mt-1">{emp.empCode || 'No code'}</p>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div><p className="text-xs text-gray-400">Department</p><p className="text-sm font-medium">{emp.department || '-'}</p></div>
                      <div><p className="text-xs text-gray-400">Email</p><p className="text-sm font-medium">{emp.email || '-'}</p></div>
                      <div><p className="text-xs text-gray-400">Phone</p><p className="text-sm font-medium">{emp.contactNo || '-'}</p></div>
                      <div><p className="text-xs text-gray-400">Emergency</p><p className="text-sm font-medium">{emp.emergencyContact || '-'}</p></div>
                      <div><p className="text-xs text-gray-400">Join Date</p><p className="text-sm font-medium">{emp.joinedDate || '-'}</p></div>
                      <div><p className="text-xs text-gray-400">Status</p><p className="text-sm font-medium">{emp.status || '-'}</p></div>
                    </div>
                  </div>
                )
              })()}
            </div>
            <div className="p-4 border-t border-gray-100 flex items-center justify-between bg-gray-50 rounded-b-xl">
              <button 
                onClick={() => setPreviewEmpIndex(i => Math.max(0, i - 1))}
                disabled={previewEmpIndex === 0}
                className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-200 rounded-lg text-sm font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <ChevronLeft size={16} /> Previous
              </button>
              <span className="text-sm text-gray-500">
                {previewEmpIndex + 1} of {employees.length}
              </span>
              <button 
                onClick={() => setPreviewEmpIndex(i => Math.min(employees.length - 1, i + 1))}
                disabled={previewEmpIndex === employees.length - 1}
                className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-200 rounded-lg text-sm font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Next <ChevronRight size={16} />
              </button>
            </div>
          </div>
        </div>
      )}
      <JoinDateConfirmationModal />
    </div>
  )
}
