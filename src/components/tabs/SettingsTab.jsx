import React, { useState, useEffect, useMemo } from 'react'
import { useAuth } from '../../hooks/useAuth'
import { useEmployees } from '../../hooks/useEmployees'
import { db, storage, auth, secondaryAuth } from '../../lib/firebase'
import { collection, getDocs, addDoc, updateDoc, doc, getDoc, setDoc, serverTimestamp, deleteDoc, where, query, orderBy, onSnapshot } from 'firebase/firestore'
import { createUserWithEmailAndPassword, updateProfile } from 'firebase/auth'
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage'
import { Wallet, Calendar, Plus, Trash2, Edit, Save, X, Paperclip, Eye, FileText, Copy, Share2, Link, GripVertical, Filter, ChevronLeft, ChevronRight, Check } from 'lucide-react'
import Spinner from '../ui/Spinner'
import Modal from '../ui/Modal'
import ImageViewer from '../ui/ImageViewer'
import TimePicker from '../ui/TimePicker'

import SalarySlabSettings from './SalarySlabSettings'

function getInitials(name) {
  return name?.split(' ').map(n => n[0]).join('').toUpperCase() || '??'
}

function getAvatarColor(id) {
  let hash = 0
  for (let i = 0; i < (id || '').length; i++) hash = id.charCodeAt(i) + ((hash << 5) - hash)
  const h = hash % 360
  return `hsl(${h}, 70%, 50%)`
}

export default function SettingsTab() {
  const { user } = useAuth()
  const { employees, loading: empLoading, updateEmployee, addEmployee, deleteEmployee } = useEmployees(user?.orgId)
  const [activeSubTab, setActiveSubTab] = useState('organization')
  const [users, setUsers] = useState([])
  const [roles, setRoles] = useState([])
  const [activeUserRoleSubTab, setActiveUserRoleSubTab] = useState('users')
  const [loading, setLoading] = useState(true)
  const [editingEmp, setEditingEmp] = useState(null)
  const [editForm, setEditForm] = useState({})
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
  const allSubTabs = [
    { id: 'organization', label: 'Organization', module: 'Settings' },
    { id: 'employee', label: 'Employees', module: 'Employees' },
    { id: 'user_roles', label: 'Users & Roles', module: 'Roles' },
    { id: 'shift', label: 'Shifts', module: 'Shifts' },
    { id: 'salary', label: 'Salary Slab', module: 'SalarySlip' },
    { id: 'advance_cat', label: 'Advance Cats', module: 'AdvanceExpense' },
    { id: 'holidays', label: 'Holidays', module: 'Settings' },
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
  const [newEmployee, setNewEmployee] = useState({
    name: '',
    empCode: '',
    designation: '',
    department: '',
    shiftId: '',
    workHours: 9,
    minDailyHoursCategory: '',
    site: '',
    employmentType: 'Full-time',
    monthlySalary: 0,
    status: 'Active',
    joinedDate: '',
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
  })
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

  const [saving, setSaving] = useState(false)
  const [uploadingLogo, setUploadingLogo] = useState(false)
  const [saved, setSaved] = useState(false)
  const [orgError, setOrgError] = useState('')

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

        // Fetch Roles
        const rolesSnap = await getDocs(collection(db, 'organisations', user.orgId, 'roles'))
        const fetchedRoles = rolesSnap.docs.map(d => ({ id: d.id, ...d.data() })) || []
        setRoles(fetchedRoles)

        // Auto-seed default roles if none exist
        if (fetchedRoles.length === 0) {
          await seedDefaultRoles(true)
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

  const handleSaveEmployee = async () => {
    if (editingEmp && editForm.role && typeof editForm.role !== 'string') {
      return alert('Role must be a valid string')
    }
    setSaving(true)
    try {
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
      
      // Destructure to separate Firestore-unfriendly objects
      const { id, shift, ...baseEditForm } = editForm;

      const cleanEditForm = {
        ...Object.fromEntries(
          Object.entries(baseEditForm).filter(([_, v]) => v !== undefined && v !== null && typeof v !== 'function')
        ),
        orgId: user.orgId,
        role: 'admin', // Force admin role
        minDailyHours: mwhCategory ? mwhCategory.hours : (editForm.minDailyHours || 8)
      }
      
      if (cleanEditForm.minDailyHoursCategory) delete cleanEditForm.minDailyHoursCategory
      if (cleanEditForm.id) delete cleanEditForm.id
      
      await updateEmployee(editingEmp, cleanEditForm)
      await logChange('EMPLOYEE_UPDATE', editingEmp, { name: editForm.name })

      setEditingEmp(null)
      setEditForm({})
      alert('Employee details updated successfully!')
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
    setSaving(true)
    try {
      const empCode = newEmployee.empCode?.trim() ||
        `EMP-${Date.now().toString(36).toUpperCase().slice(-4)}`

      const payload = { ...newEmployee, empCode, orgId: user.orgId }
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
        ...newEmployee,
        minDailyHours: mwhCategory?.hours || 8
      }
      delete employeeWithMinHours.minDailyHoursCategory

      // 1) Create employee master
      const empId = await addEmployee(employeeWithMinHours)
      await logChange('EMPLOYEE_CREATE', empId, { name: employeeDoc.name })

      // 2) Optionally create login-enabled auth user
      if (employeeDoc.loginEnabled && employeeDoc.email && tempPassword) {
        // Use secondaryAuth to avoid logging out the admin
        const cred = await createUserWithEmailAndPassword(secondaryAuth, employeeDoc.email, tempPassword)
        await updateProfile(cred.user, { displayName: employeeDoc.name })

        await setDoc(
          doc(db, 'users', cred.user.uid),
          {
            email: employeeDoc.email,
            name: employeeDoc.name,
            orgId: user.orgId,
            role: roleName,
            permissions: rolePermissions,
            employeeId: empId,
            empCode,
            department: employeeDoc.department || '',
            reportingManager: employeeDoc.reportingManager || '',
            createdAt: serverTimestamp(),
            loginEnabled: true,
          },
          { merge: true }
        )
      }

      setShowAddEmployee(false)
      setNewEmployee({
        name: '',
        empCode: '',
        designation: '',
        department: '',
        shiftId: '',
        workHours: 9,
        site: '',
        employmentType: 'Full-time',
        monthlySalary: 0,
        status: 'Active',
        joinedDate: '',
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
        minDailyHours: 8,
        documents: [],
        role: 'Employee',
        reportingManager: '',
        loginEnabled: false,
        tempPassword: '',
      })
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

  const togglePermission = (modId, permKey) => {
    setNewRole(prev => {
      const perms = { ...(prev.permissions || {}) }
      if (!perms[modId]) perms[modId] = {}
      const currentVal = !!perms[modId][permKey]
      perms[modId] = { ...perms[modId], [permKey]: !currentVal }
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

  const renderApprovalSettings = () => {
    const modules = [
      { id: 'Leave', label: 'Leave & Permission' },
      { id: 'Advance', label: 'Salary Advance' },
      { id: 'Expense', label: 'Expense Reimbursement' }
    ]

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
                          {current ? `${current.type} Approval` : 'Not Configured'}
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
                          setNewApproval(current)
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
              <div className="grid grid-cols-2 gap-4">
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

              {newApproval.type === 'single' ? (
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

  return (
    <div className="h-full flex flex-col text-[11px] font-inter">
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

      {/* Custom Sub-Tab Navigation with Border & States */}
      <div className="flex flex-wrap gap-2 mb-6 no-print">
        {visibleSubTabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveSubTab(tab.id)}
            className={`px-4 py-2.5 text-[12px] font-semibold transition-all rounded-lg border-2 -mb-px whitespace-nowrap ${
              activeSubTab === tab.id
                ? 'border-indigo-600 bg-indigo-50 text-indigo-700 shadow-sm'
                : 'border-gray-200 bg-white text-gray-500 hover:border-indigo-300 hover:text-indigo-600 hover:bg-indigo-50/50'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-auto">
        {activeSubTab === 'organization' && (
          loading ? (
            <div className="flex items-center justify-center py-16 text-gray-400">
              <svg className="animate-spin h-6 w-6 mr-3" viewBox="0 0 24 24" fill="none"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" /></svg>
              Loading organisation data...
            </div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 max-w-5xl no-print">
              {/* Left Card - Organization Information */}
              <div className="bg-white rounded-2xl p-6 space-y-6" style={{ boxShadow: '0 4px 20px rgba(0,0,0,0.06)' }}>
                <h3 className="text-base font-bold text-gray-800">Organization Information</h3>

                {/* Logo Upload */}
                <div className="flex flex-col items-center pb-6 border-b border-gray-100">
                  <div className="w-24 h-24 rounded-full border-2 border-dashed border-gray-300 flex items-center justify-center relative overflow-hidden bg-gray-50 group hover:border-indigo-400 transition-all cursor-pointer" style={{ width: '90px', height: '90px' }}>
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
                    <p className="text-[13px] font-semibold text-gray-700">Upload Logo</p>
                    <p className="text-[11px] text-gray-400 mt-0.5">Supported: PNG, JPG</p>
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
                      <label className="block text-[13px] font-semibold text-gray-700 mb-1.5">{f.label}{f.required && <span className="text-red-500"> *</span>}</label>
                      {f.isTextarea ? (
                        <textarea
                          value={orgSettings[f.key] || ''}
                          onChange={e => setOrgSettings(s => ({ ...s, [f.key]: e.target.value }))}
                          rows={3}
                          className="w-full h-[42px] min-h-[42px] border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none bg-gray-50 resize-none"
                          style={{ borderColor: '#e4e6eb', padding: '0 12px' }}
                        />
                      ) : (
                        <input
                          type="text"
                          value={orgSettings[f.key] || ''}
                          onChange={e => setOrgSettings(s => ({ ...s, [f.key]: e.target.value }))}
                          className="w-full h-[42px] border rounded-lg px-3 text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none bg-gray-50"
                          style={{ borderColor: '#e4e6eb', padding: '0 12px' }}
                        />
                      )}
                    </div>
                  ))}
                </div>
              </div>

              {/* Right Card - Structure & Accounts */}
              <div className="bg-white rounded-2xl p-6 space-y-6" style={{ boxShadow: '0 4px 20px rgba(0,0,0,0.06)' }}>
                <h3 className="text-base font-bold text-gray-800">Structure & Accounts</h3>

                {/* Hierarchy Section */}
                <div className="pb-5 border-b border-gray-100">
                  <label className="block text-[13px] font-semibold text-gray-700 mb-1.5">Hierarchy</label>
                  <textarea
                    value={orgSettings.hierarchy || ''}
                    onChange={e => setOrgSettings(s => ({ ...s, hierarchy: e.target.value }))}
                    rows={2}
                    placeholder="CEO > Manager > Staff"
                    className="w-full h-[42px] min-h-[42px] border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none bg-gray-50 resize-none"
                    style={{ borderColor: '#e4e6eb', padding: '0 12px' }}
                  />
                  <p className="text-[11px] text-gray-400 mt-1.5">Define your reporting structure</p>
                </div>

                {/* Branches Section */}
                <div className="pb-5 border-b border-gray-100">
                  <label className="block text-[13px] font-semibold text-gray-700 mb-1.5">Branches</label>
                  <textarea
                    value={orgSettings.branches || ''}
                    onChange={e => setOrgSettings(s => ({ ...s, branches: e.target.value }))}
                    rows={2}
                    placeholder="Chennai, Mumbai, Bangalore"
                    className="w-full h-[42px] min-h-[42px] border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none bg-gray-50 resize-none"
                    style={{ borderColor: '#e4e6eb', padding: '0 12px' }}
                  />
                </div>

                {/* Bank Accounts Section */}
                <div className="pb-5 border-b border-gray-100">
                  <label className="block text-[13px] font-semibold text-gray-700 mb-1.5">Bank Accounts</label>
                  <textarea
                    value={orgSettings.bankAccounts || ''}
                    onChange={e => setOrgSettings(s => ({ ...s, bankAccounts: e.target.value }))}
                    rows={2}
                    placeholder="HDFC - 123456&#10;SBI - 987654"
                    className="w-full h-[42px] min-h-[42px] border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none bg-gray-50 resize-none"
                    style={{ borderColor: '#e4e6eb', padding: '0 12px' }}
                  />
                </div>

                {/* Invite Code */}
                <div>
                  <label className="block text-[13px] font-semibold text-gray-700 mb-1.5">Invite Code</label>
                  <div className="flex gap-2">
                    <div className="flex-1 bg-gray-50 border rounded-lg px-3 py-2.5 font-mono text-sm text-indigo-600 select-all" style={{ borderColor: '#e4e6eb' }}>
                      {orgSettings.code || 'N/A'}
                    </div>
                    <button
                      onClick={() => navigator.clipboard.writeText(orgSettings.code)}
                      className="px-4 py-2.5 bg-gray-100 border border-gray-200 rounded-lg text-sm font-medium text-gray-600 hover:bg-gray-200 transition-all"
                    >
                      Copy
                    </button>
                  </div>
                </div>

                {/* Share Link for Employees */}
                <div className="border-t border-gray-100 pt-5">
                  <label className="block text-[13px] font-semibold text-gray-700 mb-1.5">Employee Login Link</label>
                  <p className="text-[11px] text-gray-400 mb-3">Share this link with employees so they can create their account</p>
                  <div className="flex gap-2">
                    <div className="flex-1 bg-gray-50 border rounded-lg px-3 py-2.5 font-mono text-xs text-indigo-600 select-all break-all" style={{ borderColor: '#e4e6eb' }}>
                      {typeof window !== 'undefined' ? window.location.origin : ''}/login
                    </div>
                    <button
                      onClick={() => {
                        const link = `${window.location.origin}/login`
                        navigator.clipboard.writeText(link)
                        alert('Login link copied to clipboard!')
                      }}
                      className="px-4 py-2.5 bg-indigo-600 border border-indigo-600 rounded-lg text-sm font-medium text-white hover:bg-indigo-700 transition-all flex items-center gap-1.5"
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
                  className={`w-full h-[46px] rounded-xl font-semibold text-white transition-all flex items-center justify-center ${saved ? 'bg-green-500' : 'hover:shadow-lg hover:-translate-y-0.5'}`}
                  style={{ background: saved ? '#22c55e' : 'linear-gradient(135deg,#6366f1,#4f46e5)' }}
                >
                  {saving ? 'SAVING...' : saved ? 'SAVED ✓' : 'SAVE ALL CHANGES'}
                </button>
              </div>
            </div>
          )
        )}

        {activeSubTab === 'advance_cat' && (
          <div className="max-w-md bg-white rounded-2xl border p-6 shadow-sm no-print">
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-sm font-black text-gray-800 uppercase">Advance Categories</h3>
              <Plus size={16} className="text-indigo-600 cursor-pointer" onClick={() => {
                const name = prompt('New Category Name:')
                if (name) setOrgSettings(s => ({ ...s, advanceCategories: [...s.advanceCategories, name] }))
              }} />
            </div>
            <div className="space-y-2">
              {orgSettings.advanceCategories.map((cat, i) => (
                <div key={i} className="flex justify-between items-center p-3 bg-gray-50 rounded-xl group">
                  <span className="font-bold text-gray-700">{cat}</span>
                  <Trash2 size={14} className="text-gray-300 hover:text-red-500 cursor-pointer opacity-0 group-hover:opacity-100 transition-all" onClick={() => setOrgSettings(s => ({ ...s, advanceCategories: s.advanceCategories.filter((_, idx) => idx !== i) }))} />
                </div>
              ))}
            </div>
            <button onClick={() => handleSaveOrg('Advance categories updated successfully!')} className="w-full mt-6 bg-indigo-600 text-white font-black py-2.5 rounded-xl uppercase shadow-lg">Save Categories</button>
          </div>
        )}

        {activeSubTab === 'holidays' && (
          <div className="max-w-2xl bg-white rounded-2xl border p-6 shadow-sm no-print">
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-sm font-black text-gray-800 uppercase">Annual Holidays</h3>
              <button onClick={() => {
                const name = prompt('Holiday Name:')
                const date = prompt('Date (YYYY-MM-DD):')
                if (name && date) setOrgSettings(s => ({ ...s, holidays: [...s.holidays, { name, date }] }))
              }} className="bg-indigo-600 text-white px-4 py-1.5 rounded-lg font-black text-[9px] uppercase tracking-widest">+ Add Holiday</button>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {orgSettings.holidays.map((h, i) => (
                <div key={i} className="flex justify-between items-center p-4 bg-gray-50 rounded-2xl border border-gray-100 shadow-sm relative group">
                  <div>
                    <p className="font-black text-gray-800 uppercase tracking-tight">{h.name}</p>
                    <p className="text-[10px] font-bold text-indigo-500 font-mono mt-1">{h.date}</p>
                  </div>
                  <Trash2 size={14} className="text-red-400 cursor-pointer opacity-0 group-hover:opacity-100 transition-all" onClick={() => setOrgSettings(s => ({ ...s, holidays: s.holidays.filter((_, idx) => idx !== i) }))} />
                </div>
              ))}
            </div>
            <button onClick={() => handleSaveOrg('Holiday list updated successfully!')} className="w-full mt-8 bg-indigo-600 text-white font-black py-3 rounded-2xl uppercase shadow-xl tracking-widest">Update Holiday List</button>
          </div>
        )}

        {activeSubTab === 'approval_settings' && renderApprovalSettings()}

        {activeSubTab === 'employee' && (() => {
          // Derive filter options
          const deptOptions = [...new Set(employees.map(e => e.department).filter(Boolean))]
          const statusOptions = ['All', 'Active', 'Inactive']

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
                        const statusBadge = emp.status === 'Active'
                          ? 'bg-emerald-50 text-emerald-700 border border-emerald-100'
                          : 'bg-red-50 text-red-600 border border-red-100'

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
                                  const mwhList = Array.isArray(minWorkHours) ? minWorkHours : []
                                  const mwhCategory = mwhList.find(m => m.hours === emp.minDailyHours) || mwhList.find(m => m.name === emp.minDailyHours)
                                  const defaultCategory = mwhList.length > 0 ? mwhList[0].name : ''
                                  setEditingEmp(emp.id); 
                                  setEditForm({ ...emp, minDailyHoursCategory: mwhCategory?.name || defaultCategory || emp.minDailyHours || '' }) 
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
                                    const mwhList = Array.isArray(minWorkHours) ? minWorkHours : []
                                    const mwhCategory = mwhList.find(m => m.hours === emp.minDailyHours) || mwhList.find(m => m.name === emp.minDailyHours)
                                    const defaultCategory = mwhList.length > 0 ? mwhList[0].name : ''

                                    // Set basic info immediately to avoid blank form
                                    setEditingEmp(emp.id)
                                    setEditForm({ 
                                      ...emp, 
                                      loginEnabled: emp.loginEnabled || false, 
                                      tempPassword: '',
                                      minDailyHoursCategory: mwhCategory?.name || defaultCategory || emp.minDailyHours || ''
                                    })
                                    
                                    // Fetch additional login info safely using query
                                    if (emp.email) {
                                      const uSnap = await getDocs(query(collection(db, 'users'), where('orgId', '==', user.orgId), where('email', '==', emp.email.toLowerCase().trim())))
                                      if (!uSnap.empty) {
                                        const userData = uSnap.docs[0].data()
                                        setEditForm(prev => ({ ...prev, loginEnabled: userData.loginEnabled !== undefined ? userData.loginEnabled : true }))
                                      }
                                    }
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
          <div className="space-y-4 no-print">
            <div className="flex justify-between items-center">
              <h3 className="text-sm font-black text-gray-800 uppercase">Shift Management</h3>
              {canCreateShift && (
                <button onClick={() => { setEditingShift(null); setNewShift({ name: '', type: 'Day', startTime: '09:00', endTime: '18:00', workHours: 9, isFlexible: false }); setShowAddShift(true); }} className="bg-indigo-600 text-white px-4 py-2 rounded-none font-black text-[10px] shadow-lg">CREATE SHIFT</button>
              )}
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {(Array.isArray(shifts) ? shifts : []).map(s => (
                <div key={s.id} className="bg-white p-4 rounded-none border shadow-sm group relative">
                  <div className="flex justify-between items-start mb-2">
                    <h4 className="font-black text-gray-800 uppercase tracking-tight">{s.name}</h4>
                    <span className={`px-1.5 py-0.5 rounded-none text-[8px] font-bold ${s.isFlexible ? 'bg-purple-100 text-purple-600' : 'bg-indigo-50 text-indigo-600'}`}>{s.isFlexible ? 'FLEXIBLE' : s.type || 'Day'}</span>
                  </div>
                  <div className="text-[10px] font-bold text-gray-400">{s.isFlexible ? 'Anytime' : `${s.startTime || '09:00'} - ${s.endTime || '18:00'}`}</div>
                  <div className="mt-3 flex justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                    {canEditShift && (
                      <button onClick={() => { setEditingShift(s); setNewShift(s); setShowAddShift(true); }} className="text-indigo-600 font-black">Edit</button>
                    )}
                    {canDeleteShift && (
                      <button onClick={async () => { if (confirm('Delete shift?')) { await deleteDoc(doc(db, 'organisations', user.orgId, 'shifts', s.id)); setShifts(prev => prev.filter(x => x.id !== s.id)); } }} className="text-red-400 font-bold hover:text-red-600">Delete</button>
                    )}
                  </div>
                </div>
              ))}
            </div>

            {/* Minimum Work Hours Section */}
            <div className="space-y-4 no-print mt-8 pt-8 border-t border-gray-200">
              <div className="flex justify-between items-center">
                <h3 className="text-sm font-black text-gray-800 uppercase">Minimum Work Hours</h3>
                {canManageMWH && (
                  <button onClick={() => { setEditingMinWorkHours(null); setNewMinWorkHours({ name: '', hours: 8, description: '' }); setShowAddMinWorkHours(true); }} className="bg-amber-500 text-white px-4 py-2 rounded-none font-black text-[10px] shadow-lg">ADD CATEGORY</button>
                )}
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {(Array.isArray(minWorkHours) ? minWorkHours : []).map(m => (
                  <div key={m.id} className="bg-white p-4 rounded-none border shadow-sm group relative">
                    <div className="flex justify-between items-start mb-2">
                      <h4 className="font-black text-gray-800 uppercase tracking-tight">{m.name}</h4>
                      <span className="px-1.5 py-0.5 rounded-none text-[8px] font-bold bg-amber-50 text-amber-600">{m.hours} Hours</span>
                    </div>
                    <div className="text-[10px] font-bold text-gray-400">{m.description || 'No description'}</div>
                    <div className="mt-3 flex justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                      {canManageMWH && (
                        <>
                          <button onClick={() => { setEditingMinWorkHours(m); setNewMinWorkHours(m); setShowAddMinWorkHours(true); }} className="text-indigo-600 font-black">Edit</button>
                          <button onClick={async () => { if (confirm('Delete minimum work hours category?')) { await deleteDoc(doc(db, 'organisations', user.orgId, 'minWorkHours', m.id)); setMinWorkHours(prev => prev.filter(x => x.id !== m.id)); } }} className="text-red-400 font-bold hover:text-red-600">Delete</button>
                        </>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
          )
        })()}

        {activeSubTab === 'user_roles' && !showInvitePage && (
          <div className="space-y-6">
            {/* Sub-tabs: Users / Roles */}
            <div className="flex bg-gray-100 p-1 rounded-xl w-fit">
              <button 
                onClick={() => setActiveUserRoleSubTab('users')}
                className={`px-6 py-2 rounded-lg text-xs font-bold uppercase tracking-wider transition-all ${activeUserRoleSubTab === 'users' ? 'bg-white text-indigo-600 shadow-sm' : 'text-gray-400 hover:text-gray-600'}`}
              >
                Users
              </button>
              <button 
                onClick={() => setActiveUserRoleSubTab('roles')}
                className={`px-6 py-2 rounded-lg text-xs font-bold uppercase tracking-wider transition-all ${activeUserRoleSubTab === 'roles' ? 'bg-white text-indigo-600 shadow-sm' : 'text-gray-400 hover:text-gray-600'}`}
              >
                Roles
              </button>
            </div>

            {activeUserRoleSubTab === 'users' && (
              <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden animate-in fade-in duration-300">
                <div className="px-6 py-4 border-b border-gray-100 flex justify-between items-center bg-gray-50/50">
                  <div className="flex items-center gap-4">
                    <h3 className="text-sm font-black text-gray-700 uppercase tracking-widest">Users List</h3>
                    <button 
                      onClick={makeAllEmployeesAdmin}
                      disabled={seeding}
                      className="text-[10px] font-bold text-red-600 hover:bg-red-50 px-3 py-1.5 rounded-lg border border-red-100 transition-all uppercase tracking-tight"
                    >
                      {seeding ? 'Processing...' : 'Make All Admin'}
                    </button>
                  </div>
                  <button 
                    onClick={() => setShowInvitePage(true)}
                    className="bg-indigo-600 text-white px-4 py-2 rounded-lg text-[10px] font-black uppercase tracking-widest shadow-md hover:bg-indigo-700 transition-all flex items-center gap-2"
                  >
                    <Plus size={14} /> Invite User
                  </button>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm">
                    <thead>
                      <tr className="bg-gray-50/50 border-b border-gray-100">
                        <th className="px-6 py-4 text-[10px] font-black text-gray-400 uppercase tracking-widest">User Detail</th>
                        <th className="px-6 py-4 text-[10px] font-black text-gray-400 uppercase tracking-widest">Role</th>
                        <th className="px-6 py-4 text-[10px] font-black text-gray-400 uppercase tracking-widest">Description</th>
                        <th className="px-6 py-4 text-[10px] font-black text-gray-400 uppercase tracking-widest text-center">Status</th>
                        <th className="px-6 py-4 text-[10px] font-black text-gray-400 uppercase tracking-widest text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      {users.length === 0 ? (
                        <tr>
                          <td colSpan={5} className="px-6 py-10 text-center text-gray-400 text-xs italic">No users found in this organization.</td>
                        </tr>
                      ) : users.map(u => {
                        const associatedEmp = employees.find(e => e.email === u.email || e.id === u.employeeId)
                        const emailPrefix = u.email ? u.email.split('@')[0] : 'User'
                        const displayName = u.name || associatedEmp?.fullName || associatedEmp?.name || emailPrefix
                        
                        return (
                        <tr key={u.id} className="hover:bg-gray-50/50 transition-colors group">
                          <td className="px-6 py-4">
                            <div className="flex items-center gap-3">
                              <div className="w-10 h-10 rounded-full flex items-center justify-center text-white font-black text-xs shadow-sm flex-shrink-0" style={{ backgroundColor: getAvatarColor(u.id) }}>
                                {getInitials(displayName)}
                              </div>
                              <div className="min-w-0">
                                <div className="flex items-center gap-2">
                                  <div className="font-bold text-gray-800 text-sm truncate">{displayName}</div>
                                  {u.id === user.uid && (
                                    <span className="text-[8px] font-black bg-emerald-50 text-emerald-600 px-1.5 py-0.5 rounded border border-emerald-100 uppercase tracking-tighter shrink-0">
                                      You
                                    </span>
                                  )}
                                </div>
                                <div className="flex flex-wrap items-center gap-2 mt-0.5">
                                  <div className="text-[10px] text-gray-400 font-medium truncate">{u.email}</div>
                                  {(u.empCode || associatedEmp?.empCode) && (
                                    <span className="text-[9px] font-black bg-indigo-50 text-indigo-500 px-1.5 py-0.5 rounded border border-indigo-100 uppercase tracking-tighter shrink-0">
                                      {u.empCode || associatedEmp?.empCode}
                                    </span>
                                  )}
                                </div>
                              </div>
                            </div>
                          </td>
                          <td className="px-6 py-4">
                            <select 
                              value={u.role || ''} 
                              onChange={(e) => handleUpdateUserRole(u.id, e.target.value)}
                              className="bg-transparent border-none text-xs font-bold text-indigo-600 focus:ring-0 cursor-pointer hover:bg-indigo-50 px-2 py-1 rounded-lg transition-all"
                            >
                              <option value="">No Role</option>
                              {roles.map(r => <option key={r.id} value={r.name}>{r.name}</option>)}
                              {!roles.find(r => r.name.toLowerCase() === 'admin') && <option value="admin">Admin</option>}
                            </select>
                          </td>
                          <td className="px-6 py-4">
                            <div className="text-[10px] text-gray-500 max-w-[200px] truncate italic">
                              {roles.find(r => r.name.toLowerCase() === (u.role || '').toLowerCase())?.description || 'No description available'}
                            </div>
                          </td>
                          <td className="px-6 py-4 text-center">
                            <span className="px-3 py-1 bg-green-100 text-green-700 rounded-full text-[9px] font-black uppercase tracking-widest">Active</span>
                          </td>
                          <td className="px-6 py-4 text-right opacity-0 group-hover:opacity-100 transition-opacity">
                            <button 
                              onClick={() => {
                                const emp = employees.find(e => e.email === u.email || e.id === u.employeeId);
                                if (emp) {
                                  // Fix: pass emp.id string, not the whole object
                                  setEditingEmp(emp.id);
                                  setEditForm({ ...emp });
                                  // Fix: the tab id is 'employee', not 'employees'
                                  setActiveSubTab('employee');
                                } else {
                                  alert('No linked employee record found for this user.');
                                }
                              }}
                              className="p-2 text-gray-400 hover:text-indigo-600 transition-colors" title="Edit Linked Employee"
                            >
                              <Edit size={16} />
                            </button>
                            <button 
                              onClick={() => handleDeleteUser(u.id, u.name || associatedEmp?.name || u.email)}
                              className="p-2 text-gray-400 hover:text-red-600 transition-colors" title="Remove Login Access"
                            >
                              <Trash2 size={16} />
                            </button>
                          </td>
                        </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {activeUserRoleSubTab === 'roles' && (
              <div className="space-y-4 animate-in fade-in duration-300">
                <div className="flex justify-between items-center mb-2">
                  <div className="flex items-center gap-4">
                    <h3 className="text-sm font-black text-gray-700 uppercase tracking-widest">Defined Roles</h3>
                    <button 
                      onClick={seedDefaultRoles}
                      disabled={seeding}
                      className="text-[10px] font-bold text-indigo-600 hover:bg-indigo-50 px-3 py-1.5 rounded-lg border border-indigo-100 transition-all uppercase tracking-tight"
                    >
                      {seeding ? 'Seeding...' : 'Seed Default Roles'}
                    </button>
                  </div>
                  <button 
                    onClick={() => { setEditingRole(null); setNewRole({ name: '', description: '', permissions: { Tasks: { view: true } } }); setShowAddRole(true); }}
                    className="bg-indigo-600 text-white px-5 py-2.5 rounded-xl font-bold text-xs shadow-lg hover:bg-indigo-700 transition-all flex items-center gap-2 uppercase tracking-widest"
                  >
                    <Plus size={18} /> Add Role
                  </button>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {roles.length === 0 ? (
                    <div className="col-span-full py-12 text-center bg-white rounded-2xl border border-gray-100">
                      <p className="text-gray-400 text-sm">No custom roles defined yet.</p>
                    </div>
                  ) : roles.map(role => (
                    <div key={role.id} className="bg-white rounded-2xl p-6 border border-gray-100 shadow-sm hover:shadow-md transition-all group">
                      <div className="flex justify-between items-start mb-4">
                        <div className="cursor-pointer" onClick={() => { setEditingRole(role); setNewRole({ ...role }); setShowAddRole(true); }}>
                          <h4 className="font-black text-gray-800 uppercase tracking-tight text-base group-hover:text-indigo-600 transition-colors">{role.name}</h4>
                          <p className="text-[11px] text-gray-400 mt-1 font-medium leading-relaxed">{role.description || 'No description provided for this role.'}</p>
                        </div>
                        <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button onClick={async () => { if (confirm(`Delete role "${role.name}"?`)) { await deleteDoc(doc(db, 'organisations', user.orgId, 'roles', role.id)); setRoles(r => r.filter(x => x.id !== role.id)); } }} className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-all">
                            <Trash2 size={16} />
                          </button>
                        </div>
                      </div>
                      <div className="pt-4 border-t border-gray-50 flex items-center justify-between">
                        <span className="text-[10px] font-black text-indigo-600 bg-indigo-50 px-3 py-1 rounded-full uppercase tracking-widest">
                          {Object.keys(role.permissions || {}).length} Modules
                        </span>
                        <button 
                          onClick={() => { setEditingRole(role); setNewRole({ ...role }); setShowAddRole(true); }}
                          className="text-[10px] font-black text-gray-400 hover:text-indigo-600 uppercase tracking-widest"
                        >
                          Edit Permissions
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {activeSubTab === 'salary' && <SalarySlabSettings />}
      </div>

      {/* COMPREHENSIVE EMPLOYEE EDITOR MODAL */}
      <Modal 
        isOpen={!!editingEmp} 
        onClose={() => setEditingEmp(null)} 
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
                <label className="block text-[11px] font-bold text-gray-700 mb-1">Working Hours *</label>
                <select
                  value={editForm.minDailyHoursCategory || (Array.isArray(minWorkHours) ? minWorkHours[0]?.name : '') || ''}
                  onChange={e => setEditForm(s => ({ ...s, minDailyHoursCategory: e.target.value }))}
                  className="w-full h-10 border border-gray-200 rounded-lg px-3 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-gray-900 bg-white"
                >
                  {(Array.isArray(minWorkHours) ? minWorkHours : []).map(m => (
                    <option key={m.id} value={m.name}>{m.name} - {m.hours} Hours</option>
                  ))}
                </select>
              </div>
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

              {/* Login Enabled Toggle */}
              <div className="flex items-center justify-between bg-indigo-50 p-3 rounded-none border border-indigo-100">
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

              {/* Password Field - Only shown when login is enabled */}
              {editForm.loginEnabled && (
                <div>
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
              <div className="border border-gray-100 rounded-xl p-4 bg-gray-50/50">
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
              onClick={() => setEditingEmp(null)}
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
                  onChange={e => setNewEmployee(s => ({ ...s, minDailyHoursCategory: e.target.value }))}
                  className="w-full h-10 border border-gray-200 rounded-lg px-3 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-gray-900 bg-white"
                >
                  {(Array.isArray(minWorkHours) ? minWorkHours : []).map(m => (
                    <option key={m.id} value={m.name}>{m.name} - {m.hours} Hours</option>
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
              <div className="col-span-2">
                <label className="block text-[11px] font-bold text-gray-700 mb-2">Status</label>
                <div className="flex gap-2">
                  {['Active', 'Inactive'].map(s => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => setNewEmployee(e => ({ ...e, status: s }))}
                      className={`flex-1 h-10 rounded-lg text-sm font-semibold border transition-all ${newEmployee.status === s
                        ? s === 'Active'
                          ? 'bg-green-600 text-white border-green-600'
                          : 'bg-red-500 text-white border-red-500'
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
        <div className="flex flex-col h-[85vh] max-w-5xl mx-auto bg-white font-inter">
          <div className="flex-1 overflow-y-auto px-6 py-6 space-y-8">
            {/* Identity Section */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pb-6 border-b border-gray-100">
              <div className="space-y-4">
                <div>
                  <label className="block text-[11px] font-black text-gray-500 uppercase tracking-widest mb-2">Role Name *</label>
                  <input
                    type="text"
                    value={newRole.name}
                    onChange={e => setNewRole(s => ({ ...s, name: e.target.value }))}
                    className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm font-bold bg-gray-50 focus:ring-2 focus:ring-indigo-500 outline-none transition-all"
                    placeholder="Enter role name"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-black text-gray-500 uppercase tracking-widest mb-2">Description</label>
                  <textarea
                    value={newRole.description || ''}
                    onChange={e => setNewRole(s => ({ ...s, description: e.target.value }))}
                    rows={3}
                    className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm font-medium bg-gray-50 focus:ring-2 focus:ring-indigo-500 outline-none resize-none transition-all"
                    placeholder="What can this role do?"
                  />
                </div>
              </div>
              <div className="flex flex-col justify-center bg-indigo-50/50 rounded-2xl p-6 border border-indigo-100">
                <label className="flex items-center gap-3 cursor-pointer group">
                  <div className={`w-6 h-6 rounded-md border-2 flex items-center justify-center transition-all ${newRole.isAccountant ? 'bg-indigo-600 border-indigo-600' : 'bg-white border-gray-300 group-hover:border-indigo-400'}`}>
                    {newRole.isAccountant && <Check size={14} className="text-white" />}
                  </div>
                  <input 
                    type="checkbox" 
                    className="hidden" 
                    checked={newRole.isAccountant} 
                    onChange={e => setNewRole(s => ({ ...s, isAccountant: e.target.checked }))} 
                  />
                  <div>
                    <span className="block text-sm font-black text-indigo-900 uppercase tracking-tight">This role is for Accountant users</span>
                    <p className="text-[10px] text-indigo-500 font-medium">Enables specialized accounting features and reporting</p>
                  </div>
                </label>
              </div>
            </div>

            {/* Permissions Matrix */}
            <div>
              <div className="flex items-center justify-between mb-6">
                <div>
                  <h4 className="text-sm font-black text-gray-800 uppercase tracking-widest">Permissions Matrix</h4>
                  <p className="text-[10px] text-gray-400 font-medium mt-1 uppercase">Configure module-level access and actions</p>
                </div>
                <div className="flex gap-4">
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 bg-indigo-600 rounded-sm"></div>
                    <span className="text-[10px] font-black text-gray-500 uppercase tracking-widest">Full Access</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 bg-gray-200 rounded-sm"></div>
                    <span className="text-[10px] font-black text-gray-500 uppercase tracking-widest">No Access</span>
                  </div>
                </div>
              </div>

              <div className="border border-gray-100 rounded-2xl overflow-hidden shadow-sm">
                <table className="w-full text-left">
                  <thead>
                    <tr className="bg-gray-50 border-b border-gray-100">
                      <th className="px-6 py-4 text-[10px] font-black text-gray-400 uppercase tracking-widest w-1/3">Module Name</th>
                      {['View', 'Create', 'Edit', 'Delete', 'Approve'].map(action => (
                        <th key={action} className="px-4 py-4 text-[10px] font-black text-gray-400 uppercase tracking-widest text-center">{action}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {Object.entries(moduleGroups).map(([group, groupModules]) => (
                      <React.Fragment key={group}>
                        <tr className="bg-gray-50/30">
                          <td colSpan={6} className="px-6 py-2 text-[9px] font-black text-indigo-600 uppercase tracking-[0.2em]">{group}</td>
                        </tr>
                        {groupModules.map(mod => (
                          <tr key={mod.id} className="hover:bg-gray-50/50 transition-colors">
                            <td className="px-6 py-4">
                              <span className="text-xs font-bold text-gray-700 uppercase tracking-tight">{mod.label}</span>
                            </td>
                            {['view', 'create', 'edit', 'delete', 'approve'].map(action => (
                              <td key={action} className="px-4 py-4 text-center">
                                <button
                                  type="button"
                                  onClick={() => togglePermission(mod.id, action)}
                                  className={`w-5 h-5 rounded-md border-2 inline-flex items-center justify-center transition-all ${newRole.permissions?.[mod.id]?.[action] ? 'bg-indigo-600 border-indigo-600' : 'bg-white border-gray-200 hover:border-indigo-300'}`}
                                >
                                  {newRole.permissions?.[mod.id]?.[action] && <Check size={12} className="text-white" />}
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
          <div className="px-6 py-4 border-t border-gray-100 bg-gray-50 flex justify-between items-center">
            <button
              type="button"
              onClick={() => { setShowAddRole(false); setEditingRole(null); setNewRole({ name: '', description: '', permissions: { Tasks: { view: true } } }) }}
              className="px-6 py-2.5 text-xs font-black text-gray-400 hover:text-gray-600 uppercase tracking-widest transition-all"
            >
              Discard Changes
            </button>
            <button
              type="button"
              onClick={handleAddRole}
              disabled={saving}
              className="bg-indigo-600 text-white px-8 py-2.5 rounded-xl font-black text-xs shadow-xl hover:bg-indigo-700 transition-all uppercase tracking-widest disabled:opacity-50"
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
                              const mwhList = Array.isArray(minWorkHours) ? minWorkHours : []
                              const mwhCategory = mwhList.find(m => m.hours === emp.minDailyHours) || mwhList.find(m => m.name === emp.minDailyHours)
                              const defaultCategory = mwhList.length > 0 ? mwhList[0].name : ''
                              
                              // Use emp.id here to fix the r.indexOf error
                              setEditingEmp(emp.id); 
                              setEditForm({ 
                                ...emp, 
                                loginEnabled: emp.loginEnabled || false,
                                tempPassword: '',
                                minDailyHoursCategory: mwhCategory?.name || defaultCategory || emp.minDailyHours || '' 
                              }); 
                              
                              // Fetch additional login info safely using query
                              try {
                                if (emp.email) {
                                  const uSnap = await getDocs(query(collection(db, 'users'), where('orgId', '==', user.orgId), where('email', '==', emp.email.toLowerCase().trim())))
                                  if (!uSnap.empty) {
                                    const userData = uSnap.docs[0].data()
                                    setEditForm(prev => ({ ...prev, loginEnabled: userData.loginEnabled !== undefined ? userData.loginEnabled : true }))
                                  }
                                }
                              } catch (e) {

                                console.warn('Could not fetch user login status:', e)
                              }

                              setShowInvitePage(false); 
                              setActiveSubTab('employee');
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
