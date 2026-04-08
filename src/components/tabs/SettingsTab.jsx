import React, { useState, useEffect, useMemo } from 'react'
import { useAuth } from '../../hooks/useAuth'
import { useEmployees } from '../../hooks/useEmployees'
import { useAttendance } from '../../hooks/useAttendance'
import { db, storage, auth, secondaryAuth } from '../../lib/firebase'
import { collection, getDocs, addDoc, updateDoc, doc, getDoc, setDoc, serverTimestamp, deleteDoc, where, query, orderBy, onSnapshot } from 'firebase/firestore'
import { createUserWithEmailAndPassword, updateProfile } from 'firebase/auth'
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage'
import { Wallet, Calendar, Plus, Trash2, Edit, Save, X, Paperclip, Eye, FileText, Copy, Share2, Link, GripVertical, Filter, ChevronLeft, ChevronRight, Check, Search, AtSign, AlertCircle, MapPin, Crosshair } from 'lucide-react'
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

import SalarySlabSettings from './SalarySlabSettings'
import {
  EMPLOYEE_STATUS_ACTIVE,
  EMPLOYEE_STATUS_OPTIONS,
  getEmployeeStatusBadgeClass,
  getStatusTransitionRequirement,
  isEmployeeActiveStatus,
  normalizeEmployeeStatus,
} from '../../lib/employeeStatus'

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

function createEmployeeFormState() {
  return {
    name: '',
    empCode: '',
    designation: '',
    department: '',
    shiftId: '',
    minDailyHoursCategory: '',
    site: '',
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
    emergencyContact: '',
    contactNo: '',
    pfNo: '',
    address: '',
    bankAccount: '',
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

const settingsPanelClassName = 'rounded-[28px] border border-slate-200/80 bg-white shadow-[0_24px_80px_rgba(15,23,42,0.08)]'
const settingsInsetPanelClassName = 'rounded-[22px] border border-slate-200 bg-slate-50/70'
const settingsInputClassName = 'w-full h-11 rounded-2xl border border-slate-200 bg-white px-4 text-[13px] text-slate-800 outline-none transition-all placeholder:text-slate-400 focus:border-indigo-400 focus:ring-4 focus:ring-indigo-100'
const settingsTextareaClassName = 'w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-[13px] text-slate-800 outline-none transition-all placeholder:text-slate-400 focus:border-indigo-400 focus:ring-4 focus:ring-indigo-100 resize-none'
const settingsSectionLabelClassName = 'mb-2 block text-[11px] font-bold uppercase tracking-[0.16em] text-slate-500'
const settingsSubTabMeta = {
  organization: {
    title: 'Organization Control Center',
    description: 'Maintain company identity, hierarchy, banking details, and invite access from one polished workspace.',
    kicker: 'Company setup',
    pill: 'Core profile',
  },
  employee: {
    title: 'Employee Directory',
    description: 'Search, review, and maintain your workforce records with a cleaner management surface.',
    kicker: 'People records',
    pill: 'Directory',
  },
  user_roles: {
    title: 'Users & Roles',
    description: 'Control product access, assign ownership, and manage linked user identities without friction.',
    kicker: 'Access control',
    pill: 'Security',
  },
  shift: {
    title: 'Shifts & Work Rules',
    description: 'Keep attendance logic clear with readable shift tables and minimum-hour definitions.',
    kicker: 'Attendance rules',
    pill: 'Scheduling',
  },
  salary: {
    title: 'Salary Slab Settings',
    description: 'Configure payroll structures, increment history, and release windows in a focused flow.',
    kicker: 'Payroll rules',
    pill: 'Compensation',
  },
  advance_cat: {
    title: 'Advance Categories',
    description: 'Organize request types with quick inline editing instead of interruptive prompts.',
    kicker: 'Expense setup',
    pill: 'Categories',
  },
  holidays: {
    title: 'Holiday Calendar',
    description: 'Manage annual holidays with a simple, legible layout that is easy to update and review.',
    kicker: 'Calendar',
    pill: 'Time off',
  },
  site_geofence: {
    title: 'Site Geofencing',
    description: 'Configure site coordinates and proximity radius to control where attendance can be captured.',
    kicker: 'Location control',
    pill: 'Geofence',
  },
  approval_settings: {
    title: 'Approval Workflows',
    description: 'Tune request approvals with clearer staging, stronger hierarchy, and easier decision visibility.',
    kicker: 'Governance',
    pill: 'Approvals',
  },
}

export default function SettingsTab() {
  const { user } = useAuth()
  const { employees, loading: empLoading, updateEmployee, addEmployee, deleteEmployee } = useEmployees(user?.orgId)
  const { recalculateOTForEmployee } = useAttendance(user?.orgId)
  const [activeSubTab, setActiveSubTab] = useState('organization')
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

  const isAdmin = true // RBAC removed - simplicity first
  const userPermissions = useMemo(() => user?.permissions || {}, [user?.permissions])
  const allSubTabs = [
    { id: 'organization', label: 'Organization', module: 'Settings' },
    { id: 'employee', label: 'Employees', module: 'Employees' },
    { id: 'user_roles', label: 'Users & Roles', module: 'Roles' },
    { id: 'shift', label: 'Shifts', module: 'Shifts' },
    { id: 'salary', label: 'Salary Slab', module: 'SalarySlip' },
    { id: 'advance_cat', label: 'Advance Cats', module: 'AdvanceExpense' },
    { id: 'holidays', label: 'Holidays', module: 'Settings' },
    { id: 'site_geofence', label: 'Site Geofence', module: 'Settings' },
    { id: 'approval_settings', label: 'Approval Settings', module: 'Settings' }
  ]
  
  const visibleSubTabs = allSubTabs

  useEffect(() => {
    if (!visibleSubTabs.find(t => t.id === activeSubTab) && visibleSubTabs.length > 0) {
      setActiveSubTab(visibleSubTabs[0].id)
    }
  }, [user])

  const [newShift, setNewShift] = useState({ name: '', type: 'Day', startTime: '09:00', endTime: '18:00', workHours: 9, isFlexible: false })
  const [showStartTimePicker, setShowStartTimePicker] = useState(false)
  const [showEndTimePicker, setShowEndTimePicker] = useState(false)
  const [newMinWorkHours, setNewMinWorkHours] = useState({ name: '', hours: 8, description: '' })
  const [newEmployee, setNewEmployee] = useState(createEmployeeFormState())
  const [newDocUpload, setNewDocUpload] = useState({ name: '', file: null, uploading: false })
  const [viewerState, setViewerState] = useState(null) // { docs, index }
  const [newRole, setNewRole] = useState({ 
    name: '', 
    description: '', 
    permissions: { Tasks: { view: true } } 
  })
  const [orgSettings, setOrgSettings] = useState({
    name: '', email: '', address: '', gstin: '', hierarchy: '', branches: '', bankAccounts: '', code: '', shiftStrategy: 'Day', logoURL: '',
    advanceCategories: ['Salary Advance', 'Travel', 'Medical'],
    holidays: []
  })
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
  const [newAdvanceCategory, setNewAdvanceCategory] = useState('')
  const [newHoliday, setNewHoliday] = useState({ name: '', date: '' })

  const [saving, setSaving] = useState(false)
  const [uploadingLogo, setUploadingLogo] = useState(false)
  const [saved, setSaved] = useState(false)
  const [orgError, setOrgError] = useState('')
  const [employeeDirectorySearch, setEmployeeDirectorySearch] = useState('')
  const [employeeDirectoryStatus, setEmployeeDirectoryStatus] = useState('All')
  const [employeeDirectoryPage, setEmployeeDirectoryPage] = useState(1)

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
            holidays: data.holidays || prev.holidays
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

  const handleFileUpload = async (file, path) => {
    if (!file) return null
    if (file.size > 2 * 1024 * 1024) {
      alert('File size must be less than 2MB')
      return null
    }
    const storageRef = ref(storage, path)
    await uploadBytes(storageRef, file)
    return await getDownloadURL(storageRef)
  }

  const getEmployeeFormWithDefaults = (employee) => {
    const mwhList = Array.isArray(minWorkHours) ? minWorkHours : []
    const mwhCategory = mwhList.find(m => m.hours === employee.minDailyHours) || mwhList.find(m => m.name === employee.minDailyHours)
    const defaultCategory = mwhList.length > 0 ? mwhList[0].name : ''

    return {
      ...createEmployeeFormState(),
      ...employee,
      status: normalizeEmployeeStatus(employee.status),
      statusHistory: Array.isArray(employee.statusHistory) ? employee.statusHistory : [],
      loginEnabled: employee.loginEnabled || false,
      tempPassword: '',
      shiftEffectiveDate: '',
      minDailyHoursCategory: mwhCategory?.name || defaultCategory || employee.minDailyHours || '',
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
    }

    if (transitionMeta.field === 'inactiveFrom') {
      nextData.inactiveFrom = effectiveDate
    }

    if (transitionMeta.field === 'rejoinDate') {
      nextData.rejoinDate = effectiveDate
      nextData.activeFrom = effectiveDate
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

  const handleSaveEmployee = async () => {
    if (!user?.orgId) {
      alert('Error: Organization ID not found. Please log in again.')
      return
    }
    if (editingEmp && editForm.role && typeof editForm.role !== 'string') {
      return alert('Role must be a valid string')
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

      const cleanEditForm = {
        ...Object.fromEntries(
          Object.entries(baseEditForm).filter(([_, v]) => v !== undefined && v !== null && typeof v !== 'function')
        ),
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

  const handleAddEmployee = async () => {
    if (!user?.orgId) {
      alert('Error: Organization ID not found. Please log in again.')
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

      let payload = {
        ...newEmployee,
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
        await updateDoc(doc(db, 'organisations', user.orgId, 'roles', editingRole.id), {
          ...newRole,
          updatedAt: serverTimestamp()
        })
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
      setNewRole({ name: '', description: '', permissions: { Tasks: { view: true } } })
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
      const updatePayload = { 
        role: newRoleName,
        permissions: permissions
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
      alert(msg || 'Organisation settings saved successfully!')
      
      // Refresh org settings from database
      const orgSnap = await getDoc(doc(db, 'organisations', user.orgId))
      if (orgSnap.exists()) {
        const data = orgSnap.data()
        setOrgSettings(prev => ({
          ...prev,
          ...data,
          name: data.name || prev.name
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
      const response = await fetch(
        `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=6&q=${encodeURIComponent(lookupValue)}`
      )
      if (!response.ok) {
        throw new Error('Location search failed.')
      }
      const results = await response.json()
      if (!Array.isArray(results) || results.length === 0) {
        alert('No location results found. Try a more specific place name.')
        return
      }
      setSiteSearchResults(results)
    } catch (error) {
      alert(`Unable to search location: ${error.message}`)
    } finally {
      setSiteSearchLoading(false)
    }
  }

  const handleSelectSiteLocation = (result) => {
    const latitude = Number(result?.lat)
    const longitude = Number(result?.lon)
    if (Number.isNaN(latitude) || Number.isNaN(longitude)) {
      alert('Selected location has invalid coordinates. Please try another result.')
      return
    }
    setSiteForm(prev => ({
      ...prev,
      latitude: latitude.toFixed(6),
      longitude: longitude.toFixed(6),
      siteName: prev.siteName || String(result?.name || result?.display_name || '').split(',')[0].trim(),
    }))
    setSiteSearchQuery(result?.display_name || '')
    setSiteSearchResults([])
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
              <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest block mb-1">Site Name</label>
              <input
                type="text"
                value={siteForm.siteName}
                onChange={e => setSiteForm(prev => ({ ...prev, siteName: e.target.value }))}
                placeholder="Ex: Chennai Warehouse"
                className="w-full h-11 rounded-xl border border-gray-200 px-3 text-sm outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
              />
            </div>
            <div className="lg:col-span-2">
              <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest block mb-1">Map Search</label>
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
                      key={`${result.place_id}-${result.lat}-${result.lon}`}
                      type="button"
                      onClick={() => handleSelectSiteLocation(result)}
                      className="w-full text-left px-3 py-2.5 border-b border-gray-100 last:border-b-0 hover:bg-indigo-50/50 transition-colors"
                    >
                      <p className="text-[12px] font-semibold text-gray-800 line-clamp-1">{result.display_name}</p>
                      <p className="text-[10px] text-gray-500 mt-0.5">
                        {Number(result.lat).toFixed(6)}, {Number(result.lon).toFixed(6)}
                      </p>
                    </button>
                  ))}
                </div>
              )}
            </div>
            <div>
              <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest block mb-1">Radius (meters)</label>
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
              <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest block mb-1">Notes</label>
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
                  <th className="px-4 py-3 text-left text-[10px] font-black text-gray-500 uppercase tracking-widest">Site</th>
                  <th className="px-4 py-3 text-left text-[10px] font-black text-gray-500 uppercase tracking-widest">Coordinates</th>
                  <th className="px-4 py-3 text-left text-[10px] font-black text-gray-500 uppercase tracking-widest">Radius</th>
                  <th className="px-4 py-3 text-left text-[10px] font-black text-gray-500 uppercase tracking-widest">Status</th>
                  <th className="px-4 py-3 text-right text-[10px] font-black text-gray-500 uppercase tracking-widest">Action</th>
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
            <h2 className="text-lg font-black text-gray-800 uppercase tracking-widest">Approval Workflows</h2>
            <p className="text-xs text-gray-400 font-medium mt-1">Configure how requests are approved in your organization.</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {modules.map(mod => {
              const current = approvalSettings.find(s => s.moduleName === mod.id)
              return (
                <div key={mod.id} className="bg-gray-50/50 rounded-2xl border border-gray-100 p-5 hover:shadow-md transition-all group">
                  <div className="flex justify-between items-start mb-4">
                    <div>
                      <h3 className="font-black text-gray-800 uppercase tracking-tight text-sm">{mod.label}</h3>
                      <div className="flex items-center gap-2 mt-1">
                        <div className={`w-1.5 h-1.5 rounded-full ${current ? 'bg-emerald-500' : 'bg-gray-300'}`}></div>
                        <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">
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
                      className="w-full py-2.5 bg-white border border-gray-200 rounded-xl text-[10px] font-black uppercase tracking-[0.1em] text-gray-600 hover:bg-indigo-600 hover:text-white hover:border-indigo-600 transition-all shadow-sm"
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
                  <h4 className="font-black text-gray-800 uppercase text-xs tracking-tight">No Approval</h4>
                  <p className="text-[10px] text-gray-400 font-medium mt-1 leading-relaxed">Requests are auto-approved immediately after submission.</p>
                  {newApproval.type === 'none' && <div className="absolute top-3 right-3 w-2 h-2 rounded-full bg-indigo-600"></div>}
                </button>

                <button
                  onClick={() => setNewApproval({ ...newApproval, type: 'single' })}
                  className={`relative p-5 rounded-2xl border-2 text-left transition-all ${newApproval.type === 'single' ? 'border-indigo-600 bg-indigo-50/30' : 'border-gray-100 hover:border-gray-200'}`}
                >
                  <div className={`w-10 h-10 rounded-xl mb-4 flex items-center justify-center ${newApproval.type === 'single' ? 'bg-indigo-600 text-white' : 'bg-gray-100 text-gray-400'}`}>
                    <Check size={20} />
                  </div>
                  <h4 className="font-black text-gray-800 uppercase text-xs tracking-tight">Single Approval</h4>
                  <p className="text-[10px] text-gray-400 font-medium mt-1 leading-relaxed">Any authorized person from the selected roles can approve.</p>
                  {newApproval.type === 'single' && <div className="absolute top-3 right-3 w-2 h-2 rounded-full bg-indigo-600"></div>}
                </button>

                <button
                  onClick={() => setNewApproval({ ...newApproval, type: 'multi' })}
                  className={`relative p-5 rounded-2xl border-2 text-left transition-all ${newApproval.type === 'multi' ? 'border-indigo-600 bg-indigo-50/30' : 'border-gray-100 hover:border-gray-200'}`}
                >
                  <div className={`w-10 h-10 rounded-xl mb-4 flex items-center justify-center ${newApproval.type === 'multi' ? 'bg-indigo-600 text-white' : 'bg-gray-100 text-gray-400'}`}>
                    <Filter size={20} />
                  </div>
                  <h4 className="font-black text-gray-800 uppercase text-xs tracking-tight">Multi-Stage</h4>
                  <p className="text-[10px] text-gray-400 font-medium mt-1 leading-relaxed">Required sequential approval from multiple members.</p>
                  {newApproval.type === 'multi' && <div className="absolute top-3 right-3 w-2 h-2 rounded-full bg-indigo-600"></div>}
                </button>
              </div>

              {newApproval.type === 'none' ? (
                <div className="rounded-2xl border border-emerald-100 bg-emerald-50 p-5">
                  <p className="text-[11px] font-bold text-emerald-700">
                    Requests in this module will skip approval queues and be marked approved right away.
                  </p>
                </div>
              ) : newApproval.type === 'single' ? (
                <div className="space-y-4 animate-in fade-in duration-300">
                  <div className="bg-gray-50 rounded-2xl p-5 border border-gray-100">
                    <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest block mb-4">Select Authorized Roles</label>
                    <div className="grid grid-cols-2 gap-2">
                      {['Admin', 'HR', 'MD', 'Accountant', 'Finance'].map(role => (
                        <button
                          key={role}
                          onClick={() => {
                            const current = newApproval.approvers || []
                            const updated = current.includes(role) ? current.filter(r => r !== role) : [...current, role]
                            setNewApproval({ ...newApproval, approvers: updated })
                          }}
                          className={`px-4 py-2.5 text-[11px] font-bold rounded-xl border transition-all ${newApproval.approvers?.includes(role) ? 'bg-indigo-600 border-indigo-600 text-white shadow-md' : 'bg-white border-gray-200 text-gray-500 hover:border-indigo-300'}`}
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
                    <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Workflow Stages</label>
                    <button
                      onClick={() => setNewApproval({ ...newApproval, stages: [...(newApproval.stages || []), { role: '', amountLimit: '' }] })}
                      className="text-[10px] font-black text-indigo-600 hover:text-indigo-700 uppercase tracking-widest"
                    >
                      + Add Stage
                    </button>
                  </div>
                  <div className="space-y-3">
                    {newApproval.stages?.map((stage, idx) => (
                      <div key={idx} className="flex gap-3 items-end bg-gray-50 p-4 rounded-2xl border border-gray-100 relative group/stage">
                        <div className="absolute -left-2 top-1/2 -translate-y-1/2 w-5 h-5 rounded-full bg-white border border-gray-200 flex items-center justify-center text-[10px] font-black text-indigo-600 shadow-sm">{idx + 1}</div>
                        <div className="flex-1 space-y-1.5">
                          <label className="text-[9px] font-black text-gray-400 uppercase tracking-tighter">Stage Approver</label>
                          <select
                            value={stage.role}
                            onChange={(e) => {
                              const updated = [...newApproval.stages]
                              updated[idx].role = e.target.value
                              setNewApproval({ ...newApproval, stages: updated })
                            }}
                            className="w-full h-10 px-3 bg-white border border-gray-200 rounded-xl text-xs font-bold outline-none focus:ring-2 focus:ring-indigo-500"
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
                        <p className="text-[10px] text-amber-700 font-medium">For Leave module, the final stage must be <span className="font-black">MD</span>.</p>
                      </div>
                    )}
                  </div>
                </div>
              )}

              <div className="flex gap-3 pt-6 border-t border-gray-100">
                <button
                  onClick={() => setShowAddApproval(false)}
                  className="flex-1 h-12 bg-gray-50 text-gray-500 rounded-xl text-xs font-black uppercase tracking-widest hover:bg-gray-100 transition-all"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSaveApproval}
                  className="flex-1 h-12 bg-indigo-600 text-white rounded-xl text-xs font-black uppercase tracking-widest hover:bg-indigo-700 shadow-xl shadow-indigo-100 transition-all"
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

  const activeEmployeesCount = employees.filter(emp => isEmployeeActiveStatus(emp.status)).length
  const currentSettingsMeta = settingsSubTabMeta[activeSubTab] || settingsSubTabMeta.organization

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

      <div className="mb-3 overflow-hidden rounded-[30px] border border-slate-200 bg-[radial-gradient(circle_at_top_left,_rgba(99,102,241,0.14),_transparent_34%),linear-gradient(180deg,_#ffffff_0%,_#f8fbff_100%)] shadow-[0_28px_100px_rgba(15,23,42,0.10)] no-print">
        <div className="px-4 py-3 md:px-6 md:py-4">
          <div className="flex flex-col gap-3">
            <div className="max-w-2xl">
              <div className="inline-flex items-center gap-2 rounded-full border border-indigo-100 bg-white/80 px-3 py-1 text-[10px] font-black uppercase tracking-[0.22em] text-indigo-600 shadow-sm">
                <span className="h-2 w-2 rounded-full bg-indigo-500" />
                {currentSettingsMeta.kicker}
              </div>
              <h1 className="mt-2 text-[24px] font-black tracking-[-0.04em] text-slate-950 md:text-[28px]">
                {currentSettingsMeta.title}
              </h1>
            </div>
          </div>

          <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-4">
            {visibleSubTabs.map(tab => {
              const meta = settingsSubTabMeta[tab.id] || {}
              const isActive = activeSubTab === tab.id
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActiveSubTab(tab.id)}
                  aria-pressed={isActive}
                  className={`rounded-[22px] border px-3 py-2.5 text-left transition-all ${
                    isActive
                      ? 'border-indigo-500 bg-slate-950 text-white shadow-[0_18px_40px_rgba(15,23,42,0.28)]'
                      : 'border-slate-200 bg-white/88 text-slate-700 hover:-translate-y-0.5 hover:border-indigo-200 hover:bg-white hover:shadow-lg'
                  }`}
                >
                  <div className="flex items-center justify-between gap-3">
                    <span className={`text-[12px] font-black tracking-[-0.02em] ${isActive ? 'text-white' : 'text-slate-900'}`}>
                      {tab.label}
                    </span>
                    <span className={`rounded-full px-2.5 py-1 text-[9px] font-black uppercase tracking-[0.16em] ${
                      isActive ? 'bg-white/14 text-indigo-100' : 'bg-indigo-50 text-indigo-600'
                    }`}>
                      {meta.pill || 'Settings'}
                    </span>
                  </div>
                </button>
              )
            })}
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-auto pr-1">
        {activeSubTab === 'organization' && (
          loading ? (
            <div className="flex items-center justify-center py-16 text-gray-400">
              <svg className="animate-spin h-6 w-6 mr-3" viewBox="0 0 24 24" fill="none"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" /></svg>
              Loading organisation data...
            </div>
          ) : (
            <div className="grid max-w-6xl grid-cols-1 gap-5 lg:grid-cols-2 no-print">
              {/* Left Card - Organization Information */}
              <div className={`${settingsPanelClassName} p-6 space-y-6 md:p-7`}>
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <p className="text-[10px] font-black uppercase tracking-[0.18em] text-indigo-600">Brand and profile</p>
                    <h3 className="mt-2 text-[21px] font-black tracking-[-0.03em] text-slate-950">Organization Information</h3>
                  </div>
                  <div className="rounded-full border border-emerald-100 bg-emerald-50 px-3 py-1 text-[10px] font-black uppercase tracking-[0.18em] text-emerald-600">
                    {saved ? 'Saved' : 'Draft'}
                  </div>
                </div>

                {/* Logo Upload */}
                <div className={`${settingsInsetPanelClassName} flex flex-col items-center p-6`}>
                  <div className="relative flex h-28 w-28 items-center justify-center overflow-hidden rounded-[28px] border-2 border-dashed border-slate-300 bg-white transition-all hover:border-indigo-400">
                    {uploadingLogo ? (
                      <div className="flex flex-col items-center justify-center">
                        <svg className="animate-spin h-6 w-6 text-indigo-500" viewBox="0 0 24 24" fill="none">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                        </svg>
                        <span className="text-[9px] text-gray-400 font-medium mt-1">Uploading...</span>
                      </div>
                    ) : orgSettings.logoURL ? (
                      <img 
                        src={orgSettings.logoURL} 
                        className="w-full h-full object-cover rounded-full" 
                        alt="Logo" 
                        onError={(e) => {
                          e.target.style.display = 'none';
                          if (e.target.nextSibling) e.target.nextSibling.style.display = 'flex';
                        }}
                      />
                    ) : (
                      <div className="flex flex-col items-center justify-center">
                        <svg className="w-8 h-8 text-gray-300 mb-1" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 12a8 8 0 018-8v8H4z" /></svg>
                        <span className="text-[9px] text-gray-400 font-medium">Upload</span>
                      </div>
                    )}
                    <input type="file" accept="image/*" className="absolute inset-0 opacity-0 cursor-pointer" disabled={uploadingLogo} onChange={async (e) => {
                      const file = e.target.files[0]
                      if (!file) return
                      
                      try {
                        setUploadingLogo(true)
                        const url = await handleFileUpload(file, `orgs/${user.orgId}/logo_${Date.now()}`)
                        if (url) {
                          setOrgSettings(s => ({ ...s, logoURL: url }))
                          // Immediately persist to Firestore
                          await setDoc(doc(db, 'organisations', user.orgId), { logoURL: url }, { merge: true })
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
                  <div className="mt-3 text-center">
                    <p className="text-[13px] font-bold text-slate-900">Upload Logo</p>
                    <p className="mt-1 text-[11px] text-slate-500">Supported: PNG, JPG</p>
                  </div>
                </div>

                {/* Form Fields */}
                <div className="space-y-4">
                  {[
                    { label: 'Organization Name', key: 'name', required: true },
                    { label: 'Email', key: 'email' },
                    { label: 'Address', key: 'address', isTextarea: true },
                    { label: 'Branch Address', key: 'branchAddress', isTextarea: true },
                    { label: 'GSTIN', key: 'gstin' }
                  ].map(f => (
                    <div key={f.key}>
                      <label className={settingsSectionLabelClassName}>{f.label}{f.required && <span className="text-red-500"> *</span>}</label>
                      {f.isTextarea ? (
                        <textarea
                          value={orgSettings[f.key] || ''}
                          onChange={e => setOrgSettings(s => ({ ...s, [f.key]: e.target.value }))}
                          rows={3}
                          className={settingsTextareaClassName}
                        />
                      ) : (
                        <input
                          type="text"
                          value={orgSettings[f.key] || ''}
                          onChange={e => setOrgSettings(s => ({ ...s, [f.key]: e.target.value }))}
                          className={settingsInputClassName}
                        />
                      )}
                    </div>
                  ))}
                </div>
              </div>

              {/* Right Card - Structure & Accounts */}
              <div className={`${settingsPanelClassName} p-6 space-y-6 md:p-7`}>
                <div>
                  <p className="text-[10px] font-black uppercase tracking-[0.18em] text-indigo-600">Operations and access</p>
                  <h3 className="mt-2 text-[21px] font-black tracking-[-0.03em] text-slate-950">Structure & Accounts</h3>
                </div>

                {/* Hierarchy Section */}
                <div className={`${settingsInsetPanelClassName} p-5`}>
                  <label className={settingsSectionLabelClassName}>Hierarchy</label>
                  <textarea
                    value={orgSettings.hierarchy || ''}
                    onChange={e => setOrgSettings(s => ({ ...s, hierarchy: e.target.value }))}
                    rows={2}
                    placeholder="CEO > Manager > Staff"
                    className={settingsTextareaClassName}
                  />
                  <p className="mt-2 text-[11px] text-slate-500">Define your reporting structure</p>
                </div>

                {/* Branches Section */}
                <div className={`${settingsInsetPanelClassName} p-5`}>
                  <label className={settingsSectionLabelClassName}>Branches</label>
                  <textarea
                    value={orgSettings.branches || ''}
                    onChange={e => setOrgSettings(s => ({ ...s, branches: e.target.value }))}
                    rows={2}
                    placeholder="Chennai, Mumbai, Bangalore"
                    className={settingsTextareaClassName}
                  />
                </div>

                {/* Bank Accounts Section */}
                <div className={`${settingsInsetPanelClassName} p-5`}>
                  <label className={settingsSectionLabelClassName}>Bank Accounts</label>
                  <textarea
                    value={orgSettings.bankAccounts || ''}
                    onChange={e => setOrgSettings(s => ({ ...s, bankAccounts: e.target.value }))}
                    rows={2}
                    placeholder="HDFC - 123456&#10;SBI - 987654"
                    className={settingsTextareaClassName}
                  />
                </div>

                {/* Invite Code */}
                <div className={`${settingsInsetPanelClassName} p-5`}>
                  <label className={settingsSectionLabelClassName}>Invite Code</label>
                  <div className="flex gap-2">
                    <div className="flex-1 rounded-2xl border border-slate-200 bg-white px-4 py-3 font-mono text-sm text-indigo-600 select-all">
                      {orgSettings.code || 'N/A'}
                    </div>
                    <button
                      onClick={() => navigator.clipboard.writeText(orgSettings.code)}
                      className="rounded-2xl border border-slate-200 bg-slate-100 px-4 py-3 text-sm font-bold text-slate-700 transition-all hover:bg-slate-200"
                    >
                      Copy
                    </button>
                  </div>
                </div>

                {/* Share Link for Employees */}
                <div className={`${settingsInsetPanelClassName} p-5`}>
                  <label className={settingsSectionLabelClassName}>Employee Login Link</label>
                  <p className="mb-3 text-[11px] text-slate-500">Share this link with employees so they can create their account</p>
                  <div className="flex gap-2">
                    <div className="flex-1 rounded-2xl border border-slate-200 bg-white px-4 py-3 font-mono text-xs text-indigo-600 break-all">
                      {typeof window !== 'undefined' ? window.location.origin : ''}/login
                    </div>
                    <button
                      onClick={() => {
                        const link = `${window.location.origin}/login`
                        navigator.clipboard.writeText(link)
                        alert('Login link copied to clipboard!')
                      }}
                      className="flex items-center gap-1.5 rounded-2xl bg-indigo-600 px-4 py-3 text-sm font-bold text-white transition-all hover:bg-indigo-700"
                    >
                      <Share2 size={14} /> Share
                    </button>
                  </div>
                </div>

                {/* Error Message */}
                {orgError && <div className="text-red-500 text-sm font-medium">{orgError}</div>}

                {/* Save Button */}
                <button
                  onClick={handleSaveOrg}
                  disabled={saving}
                  className={`flex h-12 w-full items-center justify-center rounded-[20px] text-[12px] font-black uppercase tracking-[0.18em] text-white transition-all ${
                    saved ? 'bg-emerald-500' : 'bg-slate-950 hover:-translate-y-0.5 hover:shadow-2xl'
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
              <p className="text-[10px] font-black uppercase tracking-[0.18em] text-indigo-600">Create category</p>
              <h3 className="mt-2 text-[22px] font-black tracking-[-0.03em] text-slate-950">Advance Categories</h3>
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
                  className="inline-flex items-center gap-2 rounded-2xl bg-slate-950 px-4 py-3 text-[12px] font-black uppercase tracking-[0.16em] text-white transition-all hover:bg-slate-800"
                >
                  <Plus size={14} />
                  Add Category
                </button>
              </div>
            </div>

            <div className={`${settingsPanelClassName} overflow-hidden`}>
              <div className="flex items-center justify-between border-b border-slate-200 px-6 py-5">
                <div>
                  <p className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-400">Current list</p>
                  <h4 className="mt-2 text-[18px] font-black tracking-[-0.03em] text-slate-950">{orgSettings.advanceCategories.length} Categories</h4>
                </div>
                <div className="rounded-full bg-indigo-50 px-3 py-1 text-[10px] font-black uppercase tracking-[0.18em] text-indigo-600">
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
                      <p className="text-[13px] font-bold text-slate-900">{cat}</p>
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
                <button onClick={() => handleSaveOrg('Advance categories updated successfully!')} className="w-full rounded-[20px] bg-indigo-600 py-3 text-[12px] font-black uppercase tracking-[0.18em] text-white transition-all hover:bg-indigo-700">
                  Save Categories
                </button>
              </div>
            </div>
          </div>
        )}

        {activeSubTab === 'holidays' && (
          <div className="grid max-w-6xl grid-cols-1 gap-5 xl:grid-cols-[0.9fr_1.1fr] no-print">
            <div className={`${settingsPanelClassName} p-6 md:p-7`}>
              <p className="text-[10px] font-black uppercase tracking-[0.18em] text-indigo-600">Calendar entry</p>
              <h3 className="mt-2 text-[22px] font-black tracking-[-0.03em] text-slate-950">Annual Holidays</h3>
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
                  className="inline-flex items-center gap-2 rounded-2xl bg-slate-950 px-4 py-3 text-[12px] font-black uppercase tracking-[0.16em] text-white transition-all hover:bg-slate-800"
                >
                  <Plus size={14} />
                  Add Holiday
                </button>
              </div>
            </div>

            <div className={`${settingsPanelClassName} overflow-hidden`}>
              <div className="flex items-center justify-between border-b border-slate-200 px-6 py-5">
                <div>
                  <p className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-400">Calendar list</p>
                  <h4 className="mt-2 text-[18px] font-black tracking-[-0.03em] text-slate-950">{orgSettings.holidays.length} Holidays</h4>
                </div>
                <div className="rounded-full bg-amber-50 px-3 py-1 text-[10px] font-black uppercase tracking-[0.18em] text-amber-600">
                  Annual schedule
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full border-collapse text-left">
                  <thead>
                    <tr className="bg-slate-50">
                      <th className="px-6 py-3 text-[10px] font-black uppercase tracking-[0.18em] text-slate-500">Holiday</th>
                      <th className="px-6 py-3 text-[10px] font-black uppercase tracking-[0.18em] text-slate-500">Date</th>
                      <th className="px-6 py-3 text-right text-[10px] font-black uppercase tracking-[0.18em] text-slate-500">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {orgSettings.holidays
                      .map((holiday, originalIndex) => ({ holiday, originalIndex }))
                      .sort((a, b) => (a.holiday.date || '').localeCompare(b.holiday.date || ''))
                      .map(({ holiday, originalIndex }, i) => (
                        <tr key={`${holiday.name}-${holiday.date}-${originalIndex}`} className={i % 2 === 0 ? 'bg-white' : 'bg-slate-50/80'}>
                          <td className="px-6 py-4 text-[13px] font-bold text-slate-900">{holiday.name}</td>
                          <td className="px-6 py-4 font-mono text-[12px] text-indigo-600">{holiday.date}</td>
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
                <button onClick={() => handleSaveOrg('Holiday list updated successfully!')} className="w-full rounded-[20px] bg-indigo-600 py-3 text-[12px] font-black uppercase tracking-[0.18em] text-white transition-all hover:bg-indigo-700">
                  Update Holiday List
                </button>
              </div>
            </div>
          </div>
        )}

        {activeSubTab === 'site_geofence' && renderSiteGeofenceSettings()}

        {activeSubTab === 'approval_settings' && renderApprovalSettings()}

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

          return (
            <div className="space-y-4 no-print">
              <div className="overflow-hidden rounded-[28px] border border-slate-200 bg-white shadow-[0_24px_70px_rgba(15,23,42,0.08)]">
                <div className="border-b border-slate-200 px-5 py-5 md:px-6">
                  <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                    <div>
                      <h2 className="text-[20px] font-black tracking-[-0.03em] text-slate-950">Employee Directory</h2>
                      <p className="mt-1 text-[12px] text-slate-500">Track people, roles, and employee records from one operational list.</p>
                    </div>

                    <div className="flex w-full flex-col gap-3 xl:w-auto xl:min-w-[470px]">
                      <div className="flex flex-col gap-3 md:flex-row">
                        <label className="relative flex-1">
                          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                          <input
                            type="text"
                            value={employeeDirectorySearch}
                            onChange={(event) => setEmployeeDirectorySearch(event.target.value)}
                            placeholder="Search employee, email, department, or site"
                            className="h-11 w-full rounded-2xl border border-slate-200 bg-white pl-10 pr-4 text-[12px] font-medium text-slate-700 outline-none transition-all placeholder:text-slate-400 focus:border-indigo-300 focus:ring-2 focus:ring-indigo-100"
                          />
                        </label>

                        <div className="flex gap-2">
                          <button
                            onClick={() => { setRowOrder(employees.map(e => e.id)); setShowRowOrder(true) }}
                            className="inline-flex h-11 items-center gap-2 rounded-2xl border border-slate-200 px-4 text-[12px] font-semibold text-slate-600 transition-all hover:border-slate-300 hover:bg-slate-50"
                          >
                            <Filter size={14} />
                            Row Order
                          </button>
                          {canCreateEmployee && (
                            <button
                              onClick={() => setShowAddEmployee(true)}
                              className="inline-flex h-11 items-center gap-2 rounded-2xl bg-indigo-600 px-4 text-[12px] font-semibold text-white transition-all hover:bg-indigo-700"
                            >
                              <Plus size={14} />
                              Add Employee
                            </button>
                          )}
                        </div>
                      </div>

                      <div className="flex flex-wrap items-center gap-2">
                        {statusTabs.map(tab => {
                          const active = employeeDirectoryStatus === tab.id
                          return (
                            <button
                              key={tab.id}
                              type="button"
                              onClick={() => setEmployeeDirectoryStatus(tab.id)}
                              className={`rounded-xl px-3 py-2 text-left text-[11px] font-semibold transition-all ${
                                active
                                  ? 'bg-indigo-50 text-indigo-700 shadow-[inset_0_0_0_1px_rgba(99,102,241,0.18)]'
                                  : 'bg-slate-50 text-slate-500 hover:bg-slate-100'
                              }`}
                            >
                              <span>{tab.label}</span>
                              <span className="ml-1 text-slate-400">[{tab.count}]</span>
                            </button>
                          )
                        })}
                      </div>
                    </div>
                  </div>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full border-collapse text-left min-w-[900px]">
                    <thead>
                      <tr className="bg-zinc-50/80 border-b border-zinc-200">
                        <th className="h-10 px-3 text-left align-middle text-xs font-medium text-zinc-500 whitespace-nowrap w-[140px]">Employee ID</th>
                        <th className="h-10 px-3 text-left align-middle text-xs font-medium text-zinc-500">Employee Name</th>
                        <th className="h-10 px-3 text-left align-middle text-xs font-medium text-zinc-500">Department</th>
                        <th className="h-10 px-3 text-left align-middle text-xs font-medium text-zinc-500">Designation</th>
                        <th className="h-10 px-3 text-left align-middle text-xs font-medium text-zinc-500">Status</th>
                        <th className="h-10 px-3 text-left align-middle text-xs font-medium text-zinc-500 whitespace-nowrap w-[120px]">Join Date</th>
                        <th className="h-10 px-3 text-left align-middle text-xs font-medium text-zinc-500">Site</th>
                        <th className="h-10 px-3 text-left align-middle text-xs font-medium text-zinc-500">Contact</th>
                        <th className="h-10 px-3 text-right align-middle text-xs font-medium text-zinc-500 min-w-[100px]">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="[&_tr:last-child]:border-0">
                      {empLoading ? (
                        <tr>
                          <td colSpan={9} className="px-3 py-16 text-center">
                            <Spinner />
                          </td>
                        </tr>
                      ) : paginatedEmployees.length === 0 ? (
                        <tr>
                          <td colSpan={9} className="px-3 py-16 text-center text-xs font-medium text-zinc-400">
                            {employees.length === 0
                              ? <>No employees yet. Use <span className="font-semibold text-zinc-500">Add Employee</span> to create the first record.</>
                              : 'No employees match the current search or status filter.'}
                          </td>
                        </tr>
                      ) : paginatedEmployees.map(emp => {
                        const normalizedStatus = normalizeEmployeeStatus(emp.status)
                        const statusTone =
                          normalizedStatus === 'Inactive'
                            ? { dot: 'bg-rose-500', text: 'text-rose-600' }
                            : normalizedStatus === 'Rejoined'
                              ? { dot: 'bg-amber-500', text: 'text-amber-600' }
                              : { dot: 'bg-emerald-500', text: 'text-emerald-600' }
                        const deptColor = emp.department
                          ? (departmentPalette[departmentLookup.indexOf(emp.department) % departmentPalette.length] || 'bg-zinc-100 text-zinc-600')
                          : 'bg-zinc-100 text-zinc-500'

                        return (
                          <tr key={emp.id} className="border-b border-zinc-100 transition-colors hover:bg-zinc-50/80">
                            <td className="px-3 py-1.5 align-middle whitespace-nowrap text-[12px] font-medium text-zinc-700">
                              {emp.empCode || `EMP-${emp.id.slice(-4).toUpperCase()}`}
                            </td>
                            <td className="px-3 py-1.5 align-middle">
                              <button
                                onClick={() => {
                                  if (!canEditEmployee) return
                                  openEmployeeEditor(emp)
                                }}
                                className={`flex items-center gap-3 text-left ${canEditEmployee ? '' : 'cursor-default'}`}
                              >
                                <div className="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-full text-[11px] font-bold text-white" style={{ backgroundColor: getAvatarColor(emp.id) }}>
                                  {emp.photoURL ? <img src={emp.photoURL} className="h-full w-full object-cover" alt="" /> : getInitials(emp.name)}
                                </div>
                                <div className="min-w-0">
                                  <p className="truncate text-[12px] font-semibold text-zinc-800">{emp.name}</p>
                                  <p className="truncate text-[11px] text-zinc-400">{emp.email || 'No email added'}</p>
                                </div>
                              </button>
                            </td>
                            <td className="px-3 py-1.5 align-middle">
                              {emp.department ? (
                                <span className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold ${deptColor}`}>{emp.department}</span>
                              ) : (
                                <span className="text-[11px] text-zinc-300">—</span>
                              )}
                            </td>
                            <td className="px-3 py-1.5 align-middle text-[12px] text-zinc-600">{emp.designation || 'Unassigned'}</td>
                            <td className="px-3 py-1.5 align-middle">
                              <span className={`inline-flex items-center gap-2 text-[11px] font-semibold ${statusTone.text}`}>
                                <span className={`h-2 w-2 rounded-full ${statusTone.dot}`} />
                                {normalizedStatus || 'Active'}
                              </span>
                            </td>
                            <td className="px-3 py-1.5 align-middle text-[12px] text-zinc-500">{emp.joinedDate || '—'}</td>
                            <td className="px-3 py-1.5 align-middle text-[12px] text-zinc-500">{emp.site || '—'}</td>
                            <td className="px-3 py-1.5 align-middle text-[12px] text-zinc-500">{emp.emergencyContact || '—'}</td>
                            <td className="px-3 py-1.5 align-middle text-right">
                              <div className="flex items-center justify-end gap-1">
                                <button
                                  onClick={() => {
                                    if (emp.documents?.length) setViewerState({ docs: emp.documents, index: 0 })
                                  }}
                                  title="View documents"
                                  className={`rounded-lg p-1.5 text-zinc-400 transition-all ${emp.documents?.length ? 'hover:bg-zinc-100 hover:text-zinc-700' : 'cursor-default opacity-20'}`}
                                >
                                  <Eye size={14} />
                                </button>
                                <button
                                  onClick={async () => {
                                    await openEmployeeEditor(emp)
                                  }}
                                  title="Edit employee"
                                  className="rounded-lg p-1.5 text-zinc-400 transition-all hover:bg-zinc-100 hover:text-zinc-700"
                                >
                                  <Edit size={14} />
                                </button>
                                {canDeleteEmployee && (
                                  <button
                                    onClick={async () => {
                                      if (confirm(`Are you sure you want to delete ${emp.name}? This action cannot be undone.`)) {
                                        await deleteEmployee(emp.id)
                                      }
                                    }}
                                    title="Delete employee"
                                    className="rounded-lg p-2 text-slate-400 transition-all hover:bg-rose-50 hover:text-rose-600"
                                  >
                                    <Trash2 size={14} />
                                  </button>
                                )}
                              </div>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>

                <div className="flex flex-col gap-3 border-t border-slate-200 px-5 py-4 text-[12px] text-slate-500 md:flex-row md:items-center md:justify-between">
                  <div>
                    {filteredEmployees.length === 0
                      ? 'Viewing 0 results from employee directory'
                      : `Viewing ${pageStart + 1}-${Math.min(pageStart + paginatedEmployees.length, filteredEmployees.length)} results of ${filteredEmployees.length} employee records`}
                  </div>

                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => setEmployeeDirectoryPage(page => Math.max(1, page - 1))}
                      disabled={currentPage === 1}
                      className="rounded-xl px-3 py-2 text-[12px] font-medium text-slate-500 transition-all hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      Previous
                    </button>
                    {visiblePageNumbers.map((page, index) => {
                      const previousPage = visiblePageNumbers[index - 1]
                      const showGap = previousPage && page - previousPage > 1
                      return (
                        <React.Fragment key={page}>
                          {showGap && <span className="px-1 text-slate-300">…</span>}
                          <button
                            type="button"
                            onClick={() => setEmployeeDirectoryPage(page)}
                            className={`h-9 min-w-9 rounded-xl px-3 text-[12px] font-semibold transition-all ${
                              page === currentPage
                                ? 'bg-indigo-50 text-indigo-700'
                                : 'text-slate-500 hover:bg-slate-100'
                            }`}
                          >
                            {page}
                          </button>
                        </React.Fragment>
                      )
                    })}
                    <button
                      type="button"
                      onClick={() => setEmployeeDirectoryPage(page => Math.min(totalPages, page + 1))}
                      disabled={currentPage === totalPages}
                      className="rounded-xl px-3 py-2 text-[12px] font-medium text-slate-500 transition-all hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      Next
                    </button>
                    <button onClick={handlePrintRoster} className="ml-2 rounded-xl px-3 py-2 text-[12px] font-medium text-slate-500 transition-all hover:bg-slate-100">
                      Export PDF
                    </button>
                  </div>
                </div>
              </div>
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
                              <td className="px-4 py-3 text-[11px] text-gray-400 tabular-nums">{emp.joinedDate || <span className="text-gray-200">—</span>}</td>
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
                      onClick={() => { setEditingRole(null); setNewRole({ name: '', description: '', permissions: { Tasks: { view: true } } }); setShowAddRole(true); }}
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
        <div className="flex flex-col h-[85vh] max-w-3xl mx-auto font-inter bg-white">
          {/* Scrollable Form Body - Single scroll */}
          <div className="flex-1 overflow-y-auto px-6 py-6 space-y-5">

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
                <label className="block text-[11px] font-bold text-gray-700 mb-1">Working Hours *</label>
                <select
                  value={editForm.minDailyHoursCategory || (Array.isArray(minWorkHours) ? minWorkHours[0]?.name : '') || ''}
                  onChange={e => handleMinDailyHoursCategoryChange(e.target.value, 'edit')}
                  className="w-full h-10 border border-gray-200 rounded-lg px-3 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-gray-900 bg-white"
                >
                  {(Array.isArray(minWorkHours) ? minWorkHours : []).map(m => (
                    <option key={m.id} value={m.name}>{m.name} - {m.hours} Hours</option>
                  ))}
                </select>
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
              <div>
                <label className="block text-[11px] font-bold text-gray-700 mb-1">Email</label>
                <input type="email" placeholder="employee@email.com" value={editForm.email || ''}
                  onChange={e => setEditForm(s => ({ ...s, email: e.target.value }))}
                  className="w-full h-10 border border-gray-200 rounded-lg px-3 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-gray-900 bg-white"
                />
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

              {/* Login Enabled Toggle */}
              <div className="col-span-2 flex items-center justify-between bg-indigo-50 p-3 rounded-none border border-indigo-100">
                <div>
                  <label className="block text-[11px] font-bold text-indigo-700">Login Enabled</label>
                  <p className="text-[10px] text-indigo-500">Allow employee to access the system</p>
                </div>
                <button
                  type="button"
                  onClick={() => setEditForm(s => ({ ...s, loginEnabled: !s.loginEnabled }))}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${editForm.loginEnabled ? 'bg-indigo-600' : 'bg-gray-300'}`}
                >
                  <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${editForm.loginEnabled ? 'translate-x-6' : 'translate-x-1'}`} />
                </button>
              </div>

              {/* Hide in Attendance Toggle */}
              <div className="col-span-2 flex items-center justify-between bg-red-50 p-3 rounded-none border border-red-100">
                <div>
                  <label className="block text-[11px] font-bold text-red-700 uppercase tracking-wider">Hide in Attendance</label>
                  <p className="text-[10px] text-red-600">Won't appear in daily attendance list</p>
                </div>
                <button
                  type="button"
                  onClick={() => setEditForm(s => ({ ...s, hideInAttendance: !s.hideInAttendance }))}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${editForm.hideInAttendance ? 'bg-red-600' : 'bg-gray-300'}`}
                >
                  <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${editForm.hideInAttendance ? 'translate-x-6' : 'translate-x-1'}`} />
                </button>
              </div>

              {/* Include in Salary Toggle */}
              <div className="col-span-2 flex items-center justify-between bg-emerald-50 p-3 rounded-none border border-emerald-100">
                <div>
                  <label className="block text-[11px] font-bold text-emerald-700 uppercase tracking-wider">Include in Salary</label>
                  <p className="text-[10px] text-emerald-600">Will appear in payroll and salary slips</p>
                </div>
                <button
                  type="button"
                  onClick={() => setEditForm(s => ({ ...s, includeInSalary: !s.includeInSalary }))}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${editForm.includeInSalary !== false ? 'bg-emerald-600' : 'bg-gray-300'}`}
                >
                  <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${editForm.includeInSalary !== false ? 'translate-x-6' : 'translate-x-1'}`} />
                </button>
              </div>

              {/* Include in Task Toggle */}
              <div className="col-span-2 flex items-center justify-between bg-indigo-50 p-3 rounded-none border border-indigo-100">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-indigo-100 flex items-center justify-center text-indigo-600">
                    <AtSign size={16} />
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold text-indigo-700 uppercase tracking-wider">Include in Task</label>
                    <p className="text-[10px] text-indigo-600">Allow mentions and assignments in Tasks</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setEditForm(s => ({ ...s, includeInTask: !s.includeInTask }))}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${editForm.includeInTask !== false ? 'bg-indigo-600' : 'bg-gray-300'}`}
                >
                  <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${editForm.includeInTask !== false ? 'translate-x-6' : 'translate-x-1'}`} />
                </button>
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
      <Modal isOpen={showAddEmployee} onClose={() => setShowAddEmployee(false)} title="Add Employee">
        <div className="flex flex-col h-[85vh] max-w-3xl mx-auto font-inter bg-white">
          {/* Scrollable Form Body - Single scroll */}
          <div className="flex-1 overflow-y-auto px-6 py-6 space-y-5">

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
                  <label className="block text-[11px] font-bold text-gray-700 mb-1">Name</label>
                  <input type="text" placeholder="Full Name" value={newEmployee.name}
                    onChange={e => setNewEmployee(s => ({ ...s, name: e.target.value }))}
                    className="w-full h-10 border border-gray-200 rounded-lg px-3 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent bg-white"
                  />
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

            {/* Two-column fields */}
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
                <input type="date" value={newEmployee.joinedDate}
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
                <label className="block text-[11px] font-bold text-gray-700 mb-1">Working Hours *</label>
                <select
                  value={newEmployee.minDailyHoursCategory || (Array.isArray(minWorkHours) ? minWorkHours[0]?.name : '') || ''}
                  onChange={e => handleMinDailyHoursCategoryChange(e.target.value, 'new')}
                  className="w-full h-10 border border-gray-200 rounded-lg px-3 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-gray-900 bg-white"
                >
                  {(Array.isArray(minWorkHours) ? minWorkHours : []).map(m => (
                    <option key={m.id} value={m.name}>{m.name} - {m.hours} Hours</option>
                  ))}
                </select>
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

            {/* Email field - always visible for new employees */}
            <div>
              <label className="block text-[11px] font-bold text-gray-700 mb-1">Email</label>
              <input type="email" placeholder="employee@company.com" value={newEmployee.email}
                onChange={e => setNewEmployee(s => ({ ...s, email: e.target.value }))}
                className="w-full h-10 border border-gray-200 rounded-lg px-3 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-gray-900 bg-white"
              />
            </div>

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

            {/* Login Enabled Toggle */}
            <div className="flex items-center justify-between bg-indigo-50 p-3 rounded-none border border-indigo-100">
              <div>
                <label className="block text-[11px] font-bold text-indigo-700">Login Enabled</label>
                <p className="text-[10px] text-indigo-500">Allow employee to access the system</p>
              </div>
              <button
                type="button"
                onClick={() => setNewEmployee(s => ({ ...s, loginEnabled: !s.loginEnabled }))}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${newEmployee.loginEnabled ? 'bg-indigo-600' : 'bg-gray-300'}`}
              >
                <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${newEmployee.loginEnabled ? 'translate-x-6' : 'translate-x-1'}`} />
              </button>
            </div>

            {/* Hide in Attendance Toggle */}
            <div className="flex items-center justify-between bg-red-50 p-3 rounded-none border border-red-100">
              <div>
                <label className="block text-[11px] font-bold text-red-700 uppercase tracking-wider">Hide in Attendance</label>
                <p className="text-[10px] text-red-600">Won't appear in daily attendance list</p>
              </div>
              <button
                type="button"
                onClick={() => setNewEmployee(s => ({ ...s, hideInAttendance: !s.hideInAttendance }))}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${newEmployee.hideInAttendance ? 'bg-red-600' : 'bg-gray-300'}`}
              >
                <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${newEmployee.hideInAttendance ? 'translate-x-6' : 'translate-x-1'}`} />
              </button>
            </div>

            {/* Include in Salary Toggle */}
            <div className="flex items-center justify-between bg-emerald-50 p-3 rounded-none border border-emerald-100">
              <div>
                <label className="block text-[11px] font-bold text-emerald-700 uppercase tracking-wider">Include in Salary</label>
                <p className="text-[10px] text-emerald-600">Will appear in payroll and salary slips</p>
              </div>
              <button
                type="button"
                onClick={() => setNewEmployee(s => ({ ...s, includeInSalary: !s.includeInSalary }))}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${newEmployee.includeInSalary !== false ? 'bg-emerald-600' : 'bg-gray-300'}`}
              >
                <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${newEmployee.includeInSalary !== false ? 'translate-x-6' : 'translate-x-1'}`} />
              </button>
            </div>

            {/* Include in Task Toggle */}
            <div className="flex items-center justify-between bg-indigo-50 p-3 rounded-none border border-indigo-100">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-indigo-100 flex items-center justify-center text-indigo-600">
                  <AtSign size={16} />
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-indigo-700 uppercase tracking-wider">Include in Task</label>
                  <p className="text-[10px] text-indigo-600">Allow mentions and assignments in Tasks</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setNewEmployee(s => ({ ...s, includeInTask: !s.includeInTask }))}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${newEmployee.includeInTask !== false ? 'bg-indigo-600' : 'bg-gray-300'}`}
              >
                <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${newEmployee.includeInTask !== false ? 'translate-x-6' : 'translate-x-1'}`} />
              </button>
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
              onClick={() => setShowAddEmployee(false)}
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
      <Modal isOpen={showAddMinWorkHours} onClose={() => { setShowAddMinWorkHours(false); setEditingMinWorkHours(null); setNewMinWorkHours({ name: '', hours: 8, description: '' }) }} title={editingMinWorkHours ? 'EDIT MINIMUM WORK HOURS' : 'ADD MINIMUM WORK HOURS'}>
        <div className="p-6 space-y-4 max-w-sm mx-auto">
          <div>
            <label className="block text-[10px] font-bold text-amber-600 uppercase mb-1">Category Name</label>
            <input type="text" placeholder="e.g. Staff, Technician, Manager" value={newMinWorkHours.name} onChange={e => setNewMinWorkHours(s => ({ ...s, name: e.target.value }))} className="w-full border rounded-none px-4 py-2.5 text-xs font-black bg-gray-50 outline-none" />
          </div>
          <div>
            <label className="block text-[10px] font-bold text-amber-600 uppercase mb-1">Minimum Hours</label>
            <input type="number" min="1" max="24" value={newMinWorkHours.hours} onChange={e => setNewMinWorkHours(s => ({ ...s, hours: Number(e.target.value) }))} className="w-full border rounded-none px-4 py-2.5 text-xs font-black bg-gray-50 outline-none" />
          </div>
          <div>
            <label className="block text-[10px] font-bold text-amber-600 uppercase mb-1">Description</label>
            <input type="text" placeholder="Description" value={newMinWorkHours.description || ''} onChange={e => setNewMinWorkHours(s => ({ ...s, description: e.target.value }))} className="w-full border rounded-none px-4 py-2.5 text-xs font-black bg-gray-50 outline-none" />
          </div>
          <button onClick={handleAddMinWorkHours} className="w-full bg-amber-500 text-white font-black py-3 rounded-none uppercase text-[10px]">SAVE</button>
        </div>
      </Modal>

      <Modal isOpen={showAddRole} onClose={() => { setShowAddRole(false); setEditingRole(null); setNewRole({ name: '', description: '', permissions: { Tasks: { view: true } } }) }} title={editingRole ? 'Edit Role' : 'Create New Role'}>
        <div className="flex flex-col h-[90vh] max-w-6xl mx-auto bg-white font-inter">
          <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
            {/* Identity Section */}
            <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1.7fr)_280px] gap-4 pb-4 border-b border-gray-100">
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
                  <div className={`w-5 h-5 rounded-md border-2 flex items-center justify-center transition-all ${newRole.isAccountant ? 'bg-indigo-600 border-indigo-600' : 'bg-white border-gray-300 group-hover:border-indigo-400'}`}>
                    {newRole.isAccountant && <Check size={12} className="text-white" />}
                  </div>
                  <input 
                    type="checkbox" 
                    className="hidden" 
                    checked={newRole.isAccountant} 
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
                    <div className="w-2.5 h-2.5 bg-indigo-600 rounded-sm"></div>
                    <span className="text-[10px] font-black text-gray-500 uppercase tracking-[0.18em]">Enabled</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-2.5 h-2.5 bg-gray-200 rounded-sm"></div>
                    <span className="text-[10px] font-black text-gray-500 uppercase tracking-[0.18em]">Disabled</span>
                  </div>
                </div>
              </div>

              <div className="border border-gray-100 rounded-2xl overflow-hidden shadow-sm">
                <table className="w-full text-left">
                  <thead>
                    <tr className="bg-gray-50 border-b border-gray-100">
                      <th className="px-4 py-2.5 text-[10px] font-black text-gray-400 uppercase tracking-[0.18em] w-[28%]">Module Name</th>
                      <th className="px-2 py-2.5 text-[10px] font-black text-gray-400 uppercase tracking-[0.14em] text-center">All</th>
                      {roleMatrixActions.map(action => (
                        <th key={action} className="px-2 py-2.5 text-[10px] font-black text-gray-400 uppercase tracking-[0.14em] text-center">{action}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {Object.entries(moduleGroups).map(([group, groupModules]) => (
                      <React.Fragment key={group}>
                        <tr className="bg-gray-50/30">
                          <td colSpan={7} className="px-4 py-1.5 text-[9px] font-black text-indigo-600 uppercase tracking-[0.22em]">{group}</td>
                        </tr>
                        {groupModules.map(mod => (
                          <tr key={mod.id} className="hover:bg-gray-50/50 transition-colors">
                            <td className="px-4 py-2">
                              <span className="text-[10px] leading-tight font-bold text-gray-700 uppercase tracking-[0.06em]">{mod.label}</span>
                            </td>
                            <td className="px-2 py-2 text-center">
                              <button
                                type="button"
                                onClick={() => toggleAllPermissions(mod.id)}
                                className={`min-w-[30px] h-4 rounded border inline-flex items-center justify-center px-1.5 text-[9px] font-black uppercase tracking-[0.12em] transition-all ${
                                  areAllRoleMatrixActionsEnabled(newRole.permissions?.[mod.id])
                                    ? 'bg-indigo-600 border-indigo-600 text-white'
                                    : 'bg-white border-gray-200 text-gray-500 hover:border-indigo-300'
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
                                  className={`w-4 h-4 rounded border inline-flex items-center justify-center transition-all ${newRole.permissions?.[mod.id]?.[action] ? 'bg-indigo-600 border-indigo-600' : 'bg-white border-gray-200 hover:border-indigo-300'}`}
                                >
                                  {newRole.permissions?.[mod.id]?.[action] && <Check size={10} className="text-white" />}
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
          <div className="px-5 py-3 border-t border-gray-100 bg-gray-50 flex justify-between items-center">
            <button
              type="button"
              onClick={() => { setShowAddRole(false); setEditingRole(null); setNewRole({ name: '', description: '', permissions: { Tasks: { view: true } } }) }}
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
    </div>
  )
}
