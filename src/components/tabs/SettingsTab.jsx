import { useState, useEffect, useMemo } from 'react'
import { useAuth } from '../../hooks/useAuth'
import { useEmployees } from '../../hooks/useEmployees'
import { db, storage, auth } from '../../lib/firebase'
import { collection, getDocs, addDoc, updateDoc, doc, getDoc, setDoc, serverTimestamp, deleteDoc } from 'firebase/firestore'
import { createUserWithEmailAndPassword, updateProfile } from 'firebase/auth'
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage'
import { Wallet, Calendar, Plus, Trash2, Edit, Save, X, Paperclip, Eye, FileText, Copy } from 'lucide-react'
import Spinner from '../ui/Spinner'
import Modal from '../ui/Modal'
import ImageViewer from '../ui/ImageViewer'

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
  const [shifts, setShifts] = useState([])
  const [roles, setRoles] = useState([])
  const [loading, setLoading] = useState(true)
  const [editingEmp, setEditingEmp] = useState(null)
  const [editForm, setEditForm] = useState({})
  const [showAddShift, setShowAddShift] = useState(false)
  const [editingShift, setEditingShift] = useState(null)
  const [showAddEmployee, setShowAddEmployee] = useState(false)
  const [showAddRole, setShowAddRole] = useState(false)
  const [editingRole, setEditingRole] = useState(null)

  const [newShift, setNewShift] = useState({ name: '', type: 'Day', startTime: '09:00', endTime: '18:00', workHours: 9, isFlexible: false })
  const [newEmployee, setNewEmployee] = useState({
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
  const [newDocUpload, setNewDocUpload] = useState({ name: '', file: null, uploading: false })
  const [viewerState, setViewerState] = useState(null) // { docs, index }
  const [newRole, setNewRole] = useState({ name: '', description: '', permissions: {} })
  const [orgSettings, setOrgSettings] = useState({
    name: '', email: '', address: '', gstin: '', hierarchy: '', branches: '', bankAccounts: '', code: '', shiftStrategy: 'Day', logoURL: '',
    advanceCategories: ['Salary Advance', 'Travel', 'Medical'],
    holidays: []
  })

  const [saving, setSaving] = useState(false)
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
  const roleGroups = [
    {
      title: 'HRMS',
      modules: [
        { id: 'Attendance', label: 'Attendance' },
        { id: 'Correction', label: 'Correction' },
        { id: 'Leave', label: 'Leave' },
        { id: 'Approvals', label: 'Approvals' },
        { id: 'Summary', label: 'Summary' },
        { id: 'HRLetters', label: 'HR Letters' }
      ]
    },
    {
      title: 'Payroll',
      modules: [
        { id: 'SalarySlip', label: 'Salary Slip' },
        { id: 'AdvanceExpense', label: 'Advances & Expenses' },
        { id: 'Fine', label: 'Penalties & Fines' }
      ]
    },
    {
      title: 'Engage',
      modules: [
        { id: 'Engagement', label: 'Engagement' },
        { id: 'Birthday', label: 'Birthday' }
      ]
    },
    {
      title: 'System',
      modules: [
        { id: 'Employees', label: 'Employees' },
        { id: 'Shifts', label: 'Shifts' },
        { id: 'Roles', label: 'Roles' },
        { id: 'EmployeePortal', label: 'Self Service' },
        { id: 'Settings', label: 'Settings' }
      ]
    },
    {
      title: 'Future',
      modules: [
        { id: 'Recruitment', label: 'Recruitment' },
        { id: 'AssetManagement', label: 'Asset Management' },
        { id: 'PerformanceReview', label: 'Performance Review' },
        { id: 'Training', label: 'Training' },
        { id: 'ExitManagement', label: 'Exit Management' },
        { id: 'DocumentManagement', label: 'Document Management' },
        { id: 'Helpdesk', label: 'Helpdesk' },
        { id: 'Projects', label: 'Projects' },
        { id: 'TimeTracking', label: 'Time Tracking' }
      ]
    }
  ]

  useEffect(() => {
    if (!user?.orgId) return
    const fetchData = async () => {
      setLoading(true)
      try {
        const shiftsSnap = await getDocs(collection(db, 'organisations', user.orgId, 'shifts'))
        setShifts(shiftsSnap.docs.map(d => ({ id: d.id, ...d.data() })))

        const rolesSnap = await getDocs(collection(db, 'organisations', user.orgId, 'roles'))
        setRoles(rolesSnap.docs.map(d => ({ id: d.id, ...d.data() })))

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
    setSaving(true)
    try {
      const empDoc = await getDoc(doc(db, 'organisations', user.orgId, 'employees', editingEmp))
      const empData = empDoc.exists() ? empDoc.data() : {}
      
      await updateEmployee(editingEmp, editForm)
      await logChange('EMPLOYEE_UPDATE', editingEmp, { name: editForm.name })

      if (editForm.loginEnabled && editForm.email) {
        const tempPassword = editForm.tempPassword || `HRFlow${Date.now()}`
        
        try {
          const cred = await createUserWithEmailAndPassword(auth, editForm.email, tempPassword)
          await updateProfile(cred.user, { displayName: editForm.name })

          await setDoc(
            doc(db, 'users', cred.user.uid),
            {
              email: editForm.email,
              name: editForm.name,
              orgId: user.orgId,
              role: (editForm.role || 'employee').toLowerCase(),
              employeeId: editingEmp,
              empCode: editForm.empCode,
              department: editForm.department || '',
              reportingManager: editForm.reportingManager || '',
              createdAt: serverTimestamp(),
              loginEnabled: true,
            },
            { merge: true }
          )
          
          alert(`Login enabled! Temporary password: ${tempPassword}\n\nPlease share this password with the employee.`)
        } catch (authErr) {
          if (authErr.code === 'auth/email-already-in-use') {
            alert('Login enabled. Employee can login with their existing credentials.')
          } else {
            console.error('Auth error:', authErr)
          }
        }
      }

      setEditingEmp(null)
      setEditForm({})
    } catch (err) {
      console.error('Error saving employee:', err)
      alert('Failed to save employee: ' + err.message)
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

      const payload = { ...newEmployee, empCode }
      const { tempPassword, ...employeeDoc } = payload

      // 1) Create employee master
      const empId = await addEmployee(employeeDoc)
      await logChange('EMPLOYEE_CREATE', empId, { name: employeeDoc.name })

      // 2) Optionally create login-enabled auth user
      if (employeeDoc.loginEnabled && employeeDoc.email && tempPassword) {
        const cred = await createUserWithEmailAndPassword(auth, employeeDoc.email, tempPassword)
        await updateProfile(cred.user, { displayName: employeeDoc.name })

        await setDoc(
          doc(db, 'users', cred.user.uid),
          {
            email: employeeDoc.email,
            name: employeeDoc.name,
            orgId: user.orgId,
            role: (employeeDoc.role || 'Employee').toLowerCase(),
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
    } finally {
      setSaving(false)
    }
  }

  const handleAddRole = async () => {
    if (!newRole.name.trim()) {
      alert('Role name is required')
      return
    }
    if (editingRole) {
      await updateDoc(doc(db, 'organisations', user.orgId, 'roles', editingRole.id), {
        name: newRole.name,
        description: newRole.description,
        permissions: editingRole.permissions
      })
      setRoles(prev => prev.map(r => r.id === editingRole.id ? { ...r, name: newRole.name, description: newRole.description } : r))
    } else {
      const defaultPerms = {}
      modules.forEach(m => { defaultPerms[m] = { view: false, create: false, edit: false, delete: false, approve: false, export: false, full: false } })
      const roleData = { name: newRole.name, description: newRole.description, permissions: defaultPerms, createdAt: serverTimestamp() }
      const docRef = await addDoc(collection(db, 'organisations', user.orgId, 'roles'), roleData)
      setRoles(prev => [...prev, { id: docRef.id, ...roleData }])
    }
    setShowAddRole(false)
    setNewRole({ name: '', description: '', permissions: {} })
    setEditingRole(null)
  }

  const togglePermission = async (roleId, module, right) => {
    setRoles(prev => prev.map(r => {
      if (r.id !== roleId) return r
      const permissions = { ...r.permissions }
      if (!permissions[module]) permissions[module] = {}

      if (right === 'full') {
        const isCurrentlyFull = permissionRights.every(pr => permissions[module][pr])
        permissionRights.forEach(pr => permissions[module][pr] = !isCurrentlyFull)
        permissions[module].full = !isCurrentlyFull
      } else {
        permissions[module][right] = !permissions[module][right]
        permissions[module].full = permissionRights.every(pr => permissions[module][pr])
      }

      updateDoc(doc(db, 'organisations', user.orgId, 'roles', roleId), { permissions })
      return { ...r, permissions }
    }))
  }

  const handleSaveOrg = async () => {
    if (!user?.orgId) { setOrgError('No organisation ID found.'); return }
    if (loading) { setOrgError('Still loading data. Please wait.'); return }
    if (!orgSettings.name || !orgSettings.name.trim()) { setOrgError('Organisation Name is required.'); return }
    setSaving(true)
    setOrgError('')
    try {
      await setDoc(doc(db, 'organisations', user.orgId), orgSettings, { merge: true })
      setSaved(true)
      
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

  const handlePrintRoster = () => { window.print() }

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

      {/* Shadcn-style minimal tab navigation */}
      <div className="flex gap-0 mb-5 border-b border-gray-200 no-print">
        {[
          { id: 'organization', label: 'Organization' },
          { id: 'employee', label: 'Employees' },
          { id: 'shift', label: 'Shifts' },
          { id: 'roles', label: 'Roles & Rights' },
          { id: 'salary', label: 'Salary Slab' },
          { id: 'advance_cat', label: 'Advance Cats' },
          { id: 'holidays', label: 'Holidays' }
        ].map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveSubTab(tab.id)}
            className={`px-4 py-2.5 text-sm font-medium transition-all border-b-2 -mb-px ${activeSubTab === tab.id
              ? 'border-gray-900 text-gray-900'
              : 'border-transparent text-gray-400 hover:text-gray-600 hover:border-gray-300'
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
                    {orgSettings.logoURL ? (
                      <img src={orgSettings.logoURL} className="w-full h-full object-cover rounded-full" alt="Logo" />
                    ) : (
                      <div className="flex flex-col items-center justify-center">
                        <svg className="w-8 h-8 text-gray-300 mb-1" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
                        <span className="text-[9px] text-gray-400 font-medium">Upload</span>
                      </div>
                    )}
                    <input type="file" accept="image/*" className="absolute inset-0 opacity-0 cursor-pointer" onChange={async (e) => {
                      const url = await handleFileUpload(e.target.files[0], `orgs/${user.orgId}/logo`)
                      if (url) {
                        setOrgSettings(s => ({ ...s, logoURL: url }))
                        await setDoc(doc(db, 'organisations', user.orgId), { logoURL: url }, { merge: true })
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
            <button onClick={handleSaveOrg} className="w-full mt-6 bg-indigo-600 text-white font-black py-2.5 rounded-xl uppercase shadow-lg">Save Categories</button>
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
            <button onClick={handleSaveOrg} className="w-full mt-8 bg-indigo-600 text-white font-black py-3 rounded-2xl uppercase shadow-xl tracking-widest">Update Holiday List</button>
          </div>
        )}

        {activeSubTab === 'employee' && (() => {
          // Derive filter options
          const deptOptions = [...new Set(employees.map(e => e.department).filter(Boolean))]
          const statusOptions = ['All', 'Active', 'Inactive']

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

                    <button
                      onClick={() => setShowAddEmployee(true)}
                      className="h-[34px] px-4 bg-gray-900 text-white text-[12px] font-semibold rounded-lg hover:bg-gray-800 transition-all flex items-center gap-1.5"
                    >
                      <Plus size={14} /> Add Employee
                    </button>
                  </div>
                </div>

                {/* ── Table ─────────────────────────────────── */}
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
                      ) : employees.map((emp, idx) => {
                        // Department badge colors
                        const deptColors = [
                          'bg-violet-50 text-violet-700',
                          'bg-emerald-50 text-emerald-700',
                          'bg-amber-50 text-amber-700',
                          'bg-sky-50 text-sky-700',
                          'bg-rose-50 text-rose-700',
                          'bg-indigo-50 text-indigo-700',
                        ]
                        const deptColor = deptColors[deptOptions.indexOf(emp.department) % deptColors.length] || 'bg-gray-100 text-gray-600'

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
                                onClick={() => { setEditingEmp(emp.id); setEditForm(emp) }}
                                className="flex items-center gap-3 text-left"
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
                                  onClick={() => { setEditingEmp(emp.id); setEditForm(emp) }}
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

        {activeSubTab === 'shift' && (
          <div className="space-y-4 no-print">
            <div className="flex justify-between items-center">
              <h3 className="text-sm font-black text-gray-800 uppercase">Shift Management</h3>
              <button onClick={() => { setEditingShift(null); setNewShift({ name: '', type: 'Day', startTime: '09:00', endTime: '18:00', workHours: 9, isFlexible: false }); setShowAddShift(true); }} className="bg-indigo-600 text-white px-4 py-2 rounded-none font-black text-[10px] shadow-lg">CREATE SHIFT</button>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {shifts.map(s => (
                <div key={s.id} className="bg-white p-4 rounded-none border shadow-sm group relative">
                  <div className="flex justify-between items-start mb-2">
                    <h4 className="font-black text-gray-800 uppercase tracking-tight">{s.name}</h4>
                    <span className={`px-1.5 py-0.5 rounded-none text-[8px] font-bold ${s.isFlexible ? 'bg-purple-100 text-purple-600' : 'bg-indigo-50 text-indigo-600'}`}>{s.isFlexible ? 'FLEXIBLE' : s.type || 'Day'}</span>
                  </div>
                  <div className="text-[10px] font-bold text-gray-400">{s.isFlexible ? 'Anytime' : `${s.startTime || '09:00'} - ${s.endTime || '18:00'}`}</div>
                  <div className="mt-3 flex justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button onClick={() => { setEditingShift(s); setNewShift(s); setShowAddShift(true); }} className="text-indigo-600 font-black">Edit</button>
                    <button onClick={async () => { if (confirm('Delete shift?')) { await deleteDoc(doc(db, 'organisations', user.orgId, 'shifts', s.id)); setShifts(prev => prev.filter(x => x.id !== s.id)); } }} className="text-red-400 font-bold hover:text-red-600">Delete</button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {activeSubTab === 'roles' && (
          <div className="space-y-6 no-print">
            {/* Role Management Header */}
            <div className="flex justify-between items-center">
              <h3 className="text-lg font-bold text-gray-800">Role Management</h3>
              <button onClick={() => setShowAddRole(true)} className="bg-indigo-600 text-white px-5 py-2.5 rounded-xl font-semibold text-sm shadow-lg hover:bg-indigo-700 transition-all flex items-center gap-2">
                <Plus size={18} /> Create Role
              </button>
            </div>

            {/* Role Cards Grid */}
            {roles.length === 0 ? (
              <div className="bg-white rounded-2xl p-8 border border-gray-100 shadow-sm">
                <h4 className="text-base font-semibold text-gray-700 mb-4">Create Standard Roles</h4>
                <p className="text-sm text-gray-400 mb-6">Start with pre-defined role templates or create custom roles</p>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <button onClick={async () => {
                    const adminPerms = {}
                    modules.forEach(m => { adminPerms[m] = { view: true, create: true, edit: true, delete: true, approve: true, export: true, full: true } })
                    await addDoc(collection(db, 'organisations', user.orgId, 'roles'), { name: 'Admin', description: 'Full system access', permissions: adminPerms, createdAt: serverTimestamp() })
                    setRoles(prev => [...prev, { id: 'temp', name: 'Admin', description: 'Full system access', permissions: adminPerms }])
                  }} className="p-5 bg-gradient-to-br from-indigo-500 to-indigo-700 text-white rounded-xl font-semibold hover:shadow-lg hover:-translate-y-0.5 transition-all text-left">
                    <div className="text-lg mb-1">Admin</div>
                    <div className="text-xs opacity-80">Full system access</div>
                  </button>
                  <button onClick={async () => {
                    const hrPerms = {}
                    modules.forEach(m => { hrPerms[m] = { view: true, create: true, edit: true, delete: false, approve: true, export: true, full: false } })
                    await addDoc(collection(db, 'organisations', user.orgId, 'roles'), { name: 'HR', description: 'HR management access', permissions: hrPerms, createdAt: serverTimestamp() })
                    setRoles(prev => [...prev, { id: 'temp', name: 'HR', description: 'HR management access', permissions: hrPerms }])
                  }} className="p-5 bg-gradient-to-br from-blue-500 to-blue-700 text-white rounded-xl font-semibold hover:shadow-lg hover:-translate-y-0.5 transition-all text-left">
                    <div className="text-lg mb-1">HR</div>
                    <div className="text-xs opacity-80">HR management access</div>
                  </button>
                  <button onClick={async () => {
                    const empPerms = {}
                    modules.forEach(m => { empPerms[m] = { view: m === 'EmployeePortal' || m === 'Attendance' ? true : false, create: false, edit: false, delete: false, approve: false, export: false, full: false } })
                    empPerms['EmployeePortal'] = { view: true, create: true, edit: true, delete: false, approve: false, export: true, full: false }
                    empPerms['Attendance'] = { view: true, create: true, edit: false, delete: false, approve: false, export: false, full: false }
                    await addDoc(collection(db, 'organisations', user.orgId, 'roles'), { name: 'Employee', description: 'Self service access', permissions: empPerms, createdAt: serverTimestamp() })
                    setRoles(prev => [...prev, { id: 'temp', name: 'Employee', description: 'Self service access', permissions: empPerms }])
                  }} className="p-5 bg-gradient-to-br from-green-500 to-green-700 text-white rounded-xl font-semibold hover:shadow-lg hover:-translate-y-0.5 transition-all text-left">
                    <div className="text-lg mb-1">Employee</div>
                    <div className="text-xs opacity-80">Self service access</div>
                  </button>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-4">
                  {['Manager', 'Supervisor', 'Payroll Officer', 'Accounts'].map(roleName => (
                    <button key={roleName} onClick={async () => {
                      const defaultPerms = {}
                      modules.forEach(m => { defaultPerms[m] = { view: true, create: false, edit: false, delete: false, approve: false, export: false, full: false } })
                      await addDoc(collection(db, 'organisations', user.orgId, 'roles'), { name: roleName, description: `${roleName} role`, permissions: defaultPerms, createdAt: serverTimestamp() })
                      setRoles(prev => [...prev, { id: 'temp', name: roleName, description: `${roleName} role`, permissions: defaultPerms }])
                    }} className="py-3 px-4 bg-gray-100 text-gray-600 rounded-lg font-medium text-sm hover:bg-gray-200 transition-all">
                      + {roleName}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {roles.map(role => {
                  const permCount = Object.values(role.permissions || {}).filter(p => p.view).length
                  const fullAccess = Object.values(role.permissions || {}).some(p => p.full)
                  return (
                    <div key={role.id} className="bg-white rounded-2xl p-5 border border-gray-100 shadow-sm hover:shadow-md transition-all">
                      <div className="flex justify-between items-start mb-3">
                        <div>
                          <h4 className="font-bold text-gray-800">{role.name}</h4>
                          <p className="text-xs text-gray-400 mt-0.5">{role.description || 'No description'}</p>
                        </div>
                        <div className="flex gap-1">
                          <button onClick={async () => {
                            const newName = prompt('Duplicate role name:', role.name + ' (Copy)')
                            if (newName) {
                              await addDoc(collection(db, 'organisations', user.orgId, 'roles'), {
                                name: newName,
                                description: role.description,
                                permissions: { ...role.permissions },
                                createdAt: serverTimestamp()
                              })
                              setRoles(prev => [...prev, { id: 'temp', name: newName, description: role.description, permissions: role.permissions }])
                            }
                          }} className="p-1.5 text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-all" title="Duplicate">
                            <Copy size={14} />
                          </button>
                          <button onClick={async () => { if (confirm(`Delete role "${role.name}"?`)) { await deleteDoc(doc(db, 'organisations', user.orgId, 'roles', role.id)); setRoles(r => r.filter(x => x.id !== role.id)); } }} className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-all" title="Delete">
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 mb-3">
                        <span className={`px-2 py-1 rounded-full text-[10px] font-semibold ${fullAccess ? 'bg-indigo-100 text-indigo-700' : 'bg-green-100 text-green-700'}`}>
                          {fullAccess ? 'Full Access' : `${permCount} Modules`}
                        </span>
                      </div>
                      <button onClick={() => { setEditingRole(role); setNewRole({ name: role.name, description: role.description || '', permissions: role.permissions || {} }); setShowAddRole(true); }} className="w-full py-2 bg-gray-50 text-gray-600 rounded-lg text-sm font-medium hover:bg-gray-100 transition-all">
                        Configure Permissions
                      </button>
                    </div>
                  )
                })}
                <button onClick={() => setShowAddRole(true)} className="border-2 border-dashed border-gray-200 rounded-2xl p-5 flex flex-col items-center justify-center text-gray-400 hover:border-indigo-300 hover:text-indigo-500 transition-all">
                  <Plus size={24} />
                  <span className="text-sm font-medium mt-2">Add Role</span>
                </button>
              </div>
            )}

            {/* Permissions Matrix */}
            {roles.length > 0 && (
              <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                <div className="px-6 py-4 border-b border-gray-100 flex justify-between items-center">
                  <h4 className="font-bold text-gray-800">Permissions Matrix</h4>
                  <div className="flex items-center gap-4 text-xs">
                    <span className="flex items-center gap-1"><div className="w-3 h-3 bg-green-500 rounded"></div> Allowed</span>
                    <span className="flex items-center gap-1"><div className="w-3 h-3 bg-gray-200 rounded"></div> Denied</span>
                  </div>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm">
                    <thead>
                      <tr className="bg-gray-50 border-b border-gray-100">
                        <th className="px-4 py-3 font-semibold text-gray-600 sticky left-0 bg-gray-50">Module</th>
                        {roles.map(role => (
                          <th key={role.id} className="px-4 py-3 font-semibold text-gray-600 text-center min-w-[280px] border-l border-gray-100">{role.name}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {roleGroups.map(group => (
                        <>
                          <tr key={group.title} className="bg-indigo-50/50">
                            <td colSpan={roles.length + 1} className="px-4 py-2 font-bold text-indigo-700 text-xs uppercase tracking-wider sticky left-0">{group.title}</td>
                          </tr>
                          {group.modules.map(mod => (
                            <tr key={mod.id} className="border-b border-gray-50 hover:bg-gray-50/50">
                              <td className="px-4 py-3 font-medium text-gray-700 sticky left-0 bg-white">{mod.label}</td>
                              {roles.map(role => (
                                <td key={role.id} className="px-4 py-3 text-center border-l border-gray-100">
                                  <div className="flex items-center justify-center gap-2 flex-wrap">
                                    {[
                                      { key: 'view', label: 'View' },
                                      { key: 'create', label: 'Create' },
                                      { key: 'edit', label: 'Edit' },
                                      { key: 'delete', label: 'Delete' },
                                      { key: 'approve', label: 'Approve' },
                                      { key: 'export', label: 'Export' }
                                    ].map(perm => (
                                      <button
                                        key={perm.key}
                                        onClick={() => togglePermission(role.id, mod.id, perm.key)}
                                        className={`px-2 py-1.5 rounded-md text-[11px] font-medium transition-all flex items-center gap-1.5 ${role.permissions?.[mod.id]?.[perm.key] ? 'bg-green-500 text-white shadow-sm' : 'bg-gray-100 text-gray-400 hover:bg-gray-200'}`}
                                        title={perm.label}
                                      >
                                        {perm.label}
                                      </button>
                                    ))}
                                  </div>
                                </td>
                              ))}
                            </tr>
                          ))}
                        </>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}

        {activeSubTab === 'salary' && <SalarySlabSettings />}
      </div>

      {/* COMPREHENSIVE EMPLOYEE EDITOR MODAL */}
      <Modal isOpen={!!editingEmp} onClose={() => setEditingEmp(null)} title="EDIT EMPLOYEE">
        <div className="flex flex-col h-[85vh] max-w-3xl mx-auto font-inter bg-white">
          {/* Scrollable Form Body - Single scroll */}
          <div className="flex-1 overflow-y-auto px-6 py-6 space-y-5">

            {/* Passport Photo + Name header */}
            <div className="flex items-start gap-4 pb-5 border-b border-gray-100">
              {/* Passport size photo */}
              <div className="relative shrink-0">
                <div className="w-20 h-24 rounded-md border-2 border-dashed border-gray-200 bg-gray-50 overflow-hidden flex flex-col items-center justify-center cursor-pointer hover:border-gray-400 transition-all">
                  {editForm.photoURL
                    ? <img src={editForm.photoURL} className="w-full h-full object-cover" alt="photo" />
                    : <>
                      <svg className="w-6 h-6 text-gray-300 mb-1" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /></svg>
                      <span className="text-[9px] text-gray-400 font-medium text-center leading-tight">Passport<br />Photo</span>
                    </>
                  }
                  <input type="file" accept="image/*" className="absolute inset-0 opacity-0 cursor-pointer" onChange={async (e) => {
                    const url = await handleFileUpload(e.target.files[0], `employees/${editingEmp}/profile`)
                    if (url) setEditForm(s => ({ ...s, photoURL: url }))
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
                  className="w-full h-10 border border-gray-200 rounded-lg px-3 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent bg-white"
                />
              </div>
              <div>
                <label className="block text-[11px] font-bold text-gray-700 mb-1">Emergency Contact No.</label>
                <input type="tel" placeholder="+91 xxxxxxxxxx" value={editForm.emergencyContact || ''}
                  onChange={e => setEditForm(s => ({ ...s, emergencyContact: e.target.value }))}
                  className="w-full h-10 border border-gray-200 rounded-lg px-3 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent bg-white"
                />
              </div>
              <div>
                <label className="block text-[11px] font-bold text-gray-700 mb-1">Contact No.</label>
                <input type="tel" placeholder="+91 xxxxxxxxxx" value={editForm.contactNo || ''}
                  onChange={e => setEditForm(s => ({ ...s, contactNo: e.target.value }))}
                  className="w-full h-10 border border-gray-200 rounded-lg px-3 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent bg-white"
                />
              </div>
              <div>
                <label className="block text-[11px] font-bold text-gray-700 mb-1">PF No.</label>
                <input type="text" placeholder="PF Number" value={editForm.pfNo || ''}
                  onChange={e => setEditForm(s => ({ ...s, pfNo: e.target.value }))}
                  className="w-full h-10 border border-gray-200 rounded-lg px-3 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent bg-white"
                />
              </div>
              <div>
                <label className="block text-[11px] font-bold text-gray-700 mb-1">Bank Account No.</label>
                <input type="text" placeholder="Account number" value={editForm.bankAccount || ''}
                  onChange={e => setEditForm(s => ({ ...s, bankAccount: e.target.value }))}
                  className="w-full h-10 border border-gray-200 rounded-lg px-3 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent bg-white"
                />
              </div>
              <div>
                <label className="block text-[11px] font-bold text-gray-700 mb-1">Department</label>
                <input type="text" placeholder="Department" value={editForm.department || ''}
                  onChange={e => setEditForm(s => ({ ...s, department: e.target.value }))}
                  className="w-full h-10 border border-gray-200 rounded-lg px-3 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent bg-white"
                />
              </div>
              <div>
                <label className="block text-[11px] font-bold text-gray-700 mb-1">Site Location</label>
                <input type="text" placeholder="Site Location" value={editForm.site || ''}
                  onChange={e => setEditForm(s => ({ ...s, site: e.target.value }))}
                  className="w-full h-10 border border-gray-200 rounded-lg px-3 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent bg-white"
                />
              </div>
              <div>
                <label className="block text-[11px] font-bold text-gray-700 mb-1">Shift</label>
                <select value={editForm.shiftId || ''} onChange={e => setEditForm(s => ({ ...s, shiftId: e.target.value }))} className="w-full h-10 border border-gray-200 rounded-lg px-3 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-gray-900 bg-white">
                  <option value="">Select Shift...</option>
                  {shifts.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-[11px] font-bold text-gray-700 mb-1">Perm. Hrs/Month</label>
                <input type="number" placeholder="2" value={editForm.permissionHours || ''}
                  onChange={e => setEditForm(s => ({ ...s, permissionHours: e.target.value }))}
                  className="w-full h-10 border border-gray-200 rounded-lg px-3 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent bg-white"
                />
              </div>
              <div>
                <label className="block text-[11px] font-bold text-gray-700 mb-1">Min Daily Hrs</label>
                <input type="number" placeholder="8" value={editForm.minDailyHours || ''}
                  onChange={e => setEditForm(s => ({ ...s, minDailyHours: e.target.value }))}
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
                      onClick={() => setEditForm(e => ({ ...e, status: s }))}
                      className={`flex-1 h-10 rounded-lg text-sm font-semibold border transition-all ${editForm.status === s
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
              <textarea placeholder="Full residential address" value={editForm.address || ''}
                onChange={e => setEditForm(s => ({ ...s, address: e.target.value }))}
                rows={3}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent bg-white resize-none"
              />
            </div>

            {/* Documents Section */}
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
                <div className="w-20 h-24 rounded-md border-2 border-dashed border-gray-200 bg-gray-50 overflow-hidden flex flex-col items-center justify-center cursor-pointer hover:border-gray-400 transition-all">
                  {newEmployee.photoURL
                    ? <img src={newEmployee.photoURL} className="w-full h-full object-cover" alt="photo" />
                    : <>
                      <svg className="w-6 h-6 text-gray-300 mb-1" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /></svg>
                      <span className="text-[9px] text-gray-400 font-medium text-center leading-tight">Passport<br />Photo</span>
                    </>
                  }
                  <input type="file" accept="image/*" className="absolute inset-0 opacity-0 cursor-pointer" onChange={async (e) => {
                    const url = await handleFileUpload(e.target.files[0], `employees/new_${Date.now()}/profile`)
                    if (url) setNewEmployee(s => ({ ...s, photoURL: url }))
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
                <label className="block text-[11px] font-bold text-gray-700 mb-1">Role</label>
                <select
                  value={newEmployee.role}
                  onChange={e => setNewEmployee(s => ({ ...s, role: e.target.value }))}
                  className="w-full h-10 border border-gray-200 rounded-lg px-3 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-gray-900 bg-white"
                >
                  <option>Admin</option>
                  <option>HR</option>
                  <option>Employee</option>
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
                <label className="block text-[11px] font-bold text-gray-700 mb-1">Reporting Manager</label>
                <input
                  type="text"
                  placeholder="Manager name"
                  value={newEmployee.reportingManager}
                  onChange={e => setNewEmployee(s => ({ ...s, reportingManager: e.target.value }))}
                  className="w-full h-10 border border-gray-200 rounded-lg px-3 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-gray-900 bg-white"
                />
              </div>
              <div>
                <label className="block text-[11px] font-bold text-gray-700 mb-1">Marital Status</label>
                <select value={newEmployee.maritalStatus} onChange={e => setNewEmployee(s => ({ ...s, maritalStatus: e.target.value }))}
                  className="w-full h-10 border border-gray-200 rounded-lg px-3 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-gray-900 bg-white"
                >
                  <option value="">Select...</option>
                  {['Single', 'Married', 'Divorced', 'Widowed'].map(ms => <option key={ms}>{ms}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-[11px] font-bold text-gray-700 mb-1">Email</label>
                <input type="email" placeholder="employee@email.com" value={newEmployee.email}
                  onChange={e => setNewEmployee(s => ({ ...s, email: e.target.value }))}
                  className="w-full h-10 border border-gray-200 rounded-lg px-3 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent bg-white"
                />
              </div>
              <div>
                <label className="block text-[11px] font-bold text-gray-700 mb-1">Emergency Contact No.</label>
                <input type="tel" placeholder="+91 xxxxxxxxxx" value={newEmployee.emergencyContact}
                  onChange={e => setNewEmployee(s => ({ ...s, emergencyContact: e.target.value }))}
                  className="w-full h-10 border border-gray-200 rounded-lg px-3 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent bg-white"
                />
              </div>
              <div>
                <label className="block text-[11px] font-bold text-gray-700 mb-1">Contact No.</label>
                <input type="tel" placeholder="+91 xxxxxxxxxx" value={newEmployee.contactNo}
                  onChange={e => setNewEmployee(s => ({ ...s, contactNo: e.target.value }))}
                  className="w-full h-10 border border-gray-200 rounded-lg px-3 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent bg-white"
                />
              </div>
              <div>
                <label className="block text-[11px] font-bold text-gray-700 mb-1">PF No.</label>
                <input type="text" placeholder="PF Number" value={newEmployee.pfNo}
                  onChange={e => setNewEmployee(s => ({ ...s, pfNo: e.target.value }))}
                  className="w-full h-10 border border-gray-200 rounded-lg px-3 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent bg-white"
                />
              </div>
              <div>
                <label className="block text-[11px] font-bold text-gray-700 mb-1">Bank Account No.</label>
                <input type="text" placeholder="Account number" value={newEmployee.bankAccount}
                  onChange={e => setNewEmployee(s => ({ ...s, bankAccount: e.target.value }))}
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
              <p className="text-[10px] text-gray-400 mt-1">Login access can be enabled after creating the employee</p>
            </div>

            {/* Full-width Address */}
                        onChange={e => setNewEmployee(s => ({ ...s, tempPassword: e.target.value }))}
                        className="w-full h-10 border border-gray-200 rounded-lg px-3 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-gray-900 bg-white"
                        placeholder="Min 6 characters"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-bold text-gray-700 mb-1">Role</label>
                      <select
                        value={newEmployee.role}
                        onChange={e => setNewEmployee(s => ({ ...s, role: e.target.value }))}
                        className="w-full h-10 border border-gray-200 rounded-lg px-3 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-gray-900 bg-white"
                      >
                        <option value="Employee">Employee</option>
                        <option value="HR">HR</option>
                        <option value="Admin">Admin</option>
                      </select>
                    </div>
                  </div>
                </div>
              )}
            </div>

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
              <input type="time" value={newShift.startTime} onChange={e => setNewShift(s => ({ ...s, startTime: e.target.value }))} className="w-full border rounded-none px-3 py-2 text-xs font-black bg-gray-50 outline-none" />
            </div>
            <div>
              <label className="block text-[10px] font-bold text-blue-600 uppercase mb-1">End Time</label>
              <input type="time" value={newShift.endTime} onChange={e => setNewShift(s => ({ ...s, endTime: e.target.value }))} className="w-full border rounded-none px-3 py-2 text-xs font-black bg-gray-50 outline-none" />
            </div>
          </div>
          <div className="flex items-center justify-between bg-purple-50 p-3 rounded-none border border-purple-100">
            <span className="text-[10px] font-black text-purple-700 uppercase">Flexible?</span>
            <input type="checkbox" checked={newShift.isFlexible} onChange={e => setNewShift(s => ({ ...s, isFlexible: e.target.checked }))} className="w-5 h-5 rounded-none text-purple-600" />
          </div>
          <button onClick={handleAddShift} className="w-full bg-indigo-600 text-white font-black py-3 rounded-none uppercase text-[10px]">SAVE SHIFT</button>
        </div>
      </Modal>

      <Modal isOpen={showAddRole} onClose={() => { setShowAddRole(false); setEditingRole(null); setNewRole({ name: '', description: '', permissions: {} }) }} title={editingRole ? 'Edit Role' : 'Create New Role'}>
        <div className="p-6 space-y-5 max-w-md mx-auto">
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1.5">Role Name *</label>
            <input 
              type="text" 
              value={newRole.name} 
              onChange={e => setNewRole(s => ({ ...s, name: e.target.value }))} 
              className="w-full border border-gray-200 rounded-lg px-4 py-2.5 text-sm font-medium bg-gray-50 focus:ring-2 focus:ring-indigo-500 outline-none" 
              placeholder="e.g. Manager, Supervisor" 
            />
          </div>
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1.5">Description</label>
            <textarea 
              value={newRole.description || ''} 
              onChange={e => setNewRole(s => ({ ...s, description: e.target.value }))} 
              rows={2}
              className="w-full border border-gray-200 rounded-lg px-4 py-2.5 text-sm font-medium bg-gray-50 focus:ring-2 focus:ring-indigo-500 outline-none resize-none" 
              placeholder="Brief description of this role"
            />
          </div>
          {!editingRole && (
            <div className="pt-2">
              <p className="text-xs text-gray-400 mb-3">Quick templates:</p>
              <div className="flex gap-2 flex-wrap">
                <button type="button" onClick={() => {
                  const adminPerms = {}
                  modules.forEach(m => { adminPerms[m] = { view: true, create: true, edit: true, delete: true, approve: true, export: true, full: true } })
                  setNewRole(s => ({ ...s, name: 'Admin', description: 'Full system access', permissions: adminPerms }))
                }} className="px-3 py-1.5 bg-indigo-100 text-indigo-700 rounded-lg text-xs font-medium hover:bg-indigo-200">Admin</button>
                <button type="button" onClick={() => {
                  const hrPerms = {}
                  modules.forEach(m => { hrPerms[m] = { view: true, create: true, edit: true, delete: false, approve: true, export: true, full: false } })
                  setNewRole(s => ({ ...s, name: 'HR', description: 'HR management access', permissions: hrPerms }))
                }} className="px-3 py-1.5 bg-blue-100 text-blue-700 rounded-lg text-xs font-medium hover:bg-blue-200">HR</button>
                <button type="button" onClick={() => {
                  const empPerms = {}
                  modules.forEach(m => { empPerms[m] = { view: m === 'EmployeePortal' || m === 'Attendance', create: false, edit: false, delete: false, approve: false, export: false, full: false } })
                  setNewRole(s => ({ ...s, name: 'Employee', description: 'Self service access', permissions: empPerms }))
                }} className="px-3 py-1.5 bg-green-100 text-green-700 rounded-lg text-xs font-medium hover:bg-green-200">Employee</button>
                <button type="button" onClick={() => {
                  const mgrPerms = {}
                  modules.forEach(m => { mgrPerms[m] = { view: true, create: false, edit: false, delete: false, approve: true, export: true, full: false } })
                  setNewRole(s => ({ ...s, name: 'Manager', description: 'Management access', permissions: mgrPerms }))
                }} className="px-3 py-1.5 bg-purple-100 text-purple-700 rounded-lg text-xs font-medium hover:bg-purple-200">Manager</button>
              </div>
            </div>
          )}
          <div className="flex gap-3 pt-4">
            <button 
              type="button"
              onClick={() => { setShowAddRole(false); setEditingRole(null); setNewRole({ name: '', description: '', permissions: {} }) }} 
              className="flex-1 py-2.5 border border-gray-200 text-gray-600 rounded-lg font-medium hover:bg-gray-50"
            >
              Cancel
            </button>
            <button 
              type="button"
              onClick={handleAddRole} 
              className="flex-1 py-2.5 bg-indigo-600 text-white rounded-lg font-semibold hover:bg-indigo-700"
            >
              {editingRole ? 'Update Role' : 'Create Role'}
            </button>
          </div>
        </div>
      </Modal>

      {/* Full-screen Image Viewer */}
      {viewerState && (
        <ImageViewer
          docs={viewerState.docs}
          index={viewerState.index}
          onClose={() => setViewerState(null)}
        />
      )}
    </div>
  )
}
