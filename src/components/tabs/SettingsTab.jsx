import { useState, useEffect, useMemo } from 'react'
import { useAuth } from '../../hooks/useAuth'
import { useEmployees } from '../../hooks/useEmployees'
import { db, storage } from '../../lib/firebase'
import { collection, getDocs, addDoc, updateDoc, doc, getDoc, setDoc, serverTimestamp, deleteDoc } from 'firebase/firestore'
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage'
import { Wallet, Calendar, Plus, Trash2, Edit, Save, X } from 'lucide-react'
import Spinner from '../ui/Spinner'
import Modal from '../ui/Modal'

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
  const { employees, loading: empLoading, updateEmployee, addEmployee } = useEmployees(user?.orgId)
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

  const [newShift, setNewShift] = useState({ name: '', type: 'Day', startTime: '09:00', endTime: '18:00', workHours: 9, isFlexible: false })
  const [newEmployee, setNewEmployee] = useState({
    name: '', empCode: '', designation: '', department: '', shiftId: '', workHours: 9, site: '', employmentType: 'Full-time', monthlySalary: 0, status: 'Active', joinedDate: '', bloodGroup: '', dob: '', fatherName: '', motherName: '', maritalStatus: '', email: '', emergencyContact: '', address: '', bankAccount: '', photoURL: '', permissionHours: 2, minDailyHours: 8
  })
  const [newRole, setNewRole] = useState({ name: '', permissions: {} })
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

  const modules = ['Attendance', 'Correction', 'Approvals', 'Summary', 'SalarySlip', 'AdvanceExpense', 'Fine', 'Engagement', 'Birthday', 'Leave', 'HRLetters', 'Settings', 'Employees', 'Roles', 'Shifts', 'EmployeePortal']

  // Role Groups & Rights
  const roleGroups = [
    {
      title: 'Time & Attendance',
      modules: [
        { id: 'Attendance', label: 'Attendance Entry' },
        { id: 'Correction', label: 'Attendance Correction' },
        { id: 'Approvals', label: 'OT & Leave Approvals' },
        { id: 'Summary', label: 'Reports & Summary' },
        { id: 'Leave', label: 'Leave Management' }
      ]
    },
    {
      title: 'Payroll & Salary',
      modules: [
        { id: 'SalarySlip', label: 'Salary Slips & Payroll' },
        { id: 'AdvanceExpense', label: 'Advances & Expenses' },
        { id: 'Fine', label: 'Penalties & Fines' }
      ]
    },
    {
      title: 'Engagement & HR',
      modules: [
        { id: 'Engagement', label: 'Company Engagement' },
        { id: 'Birthday', label: 'Birthday Calendar' },
        { id: 'HRLetters', label: 'HR Letters & Docs' }
      ]
    },
    {
      title: 'Workforce Management',
      modules: [
        { id: 'Employees', label: 'Employee Roster' },
        { id: 'Shifts', label: 'Shift Schedules' },
        { id: 'Roles', label: 'User Roles & Rights' }
      ]
    },
    {
      title: 'Self Service & Others',
      modules: [
        { id: 'EmployeePortal', label: 'Individual Employee Portal' },
        { id: 'Settings', label: 'Global Organisation Settings' }
      ]
    }
  ]

  const permissionRights = ['view', 'create', 'edit', 'delete', 'approve']

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
            advanceCategories: data.advanceCategories || prev.advanceCategories,
            holidays: data.holidays || prev.holidays
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
      await updateEmployee(editingEmp, editForm)
      await logChange('EMPLOYEE_UPDATE', editingEmp, { name: editForm.name })
      setEditingEmp(null)
      setEditForm({})
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
      await addEmployee(newEmployee)
      await logChange('EMPLOYEE_CREATE', 'new', { name: newEmployee.name })
      setShowAddEmployee(false)
      setNewEmployee({
        name: '', empCode: '', designation: '', department: '', shiftId: '', workHours: 9, site: '', employmentType: 'Full-time', monthlySalary: 0, status: 'Active', joinedDate: '', bloodGroup: '', dob: '', fatherName: '', motherName: '', maritalStatus: '', email: '', emergencyContact: '', address: '', bankAccount: '', photoURL: '', permissionHours: 2, minDailyHours: 8
      })
    } finally {
      setSaving(false)
    }
  }

  const handleAddRole = async () => {
    const roleData = { ...newRole, createdAt: serverTimestamp() }
    const docRef = await addDoc(collection(db, 'organisations', user.orgId, 'roles'), roleData)
    setRoles(prev => [...prev, { id: docRef.id, ...roleData }])
    setShowAddRole(false)
    setNewRole({ name: '', permissions: {} })
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
    setSaving(true)
    setOrgError('')
    try {
      await setDoc(doc(db, 'organisations', user.orgId), orgSettings, { merge: true })
      setSaved(true)
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
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-w-4xl no-print">
            <div className="bg-white rounded-2xl border p-5 space-y-4 shadow-sm">
              <h3 className="text-sm font-black text-gray-800 uppercase tracking-tight">Org Information</h3>
              <div className="flex flex-col items-center mb-4">
                <div className="w-20 h-20 rounded-2xl border-2 border-dashed border-gray-200 flex items-center justify-center relative overflow-hidden bg-gray-50 group shadow-inner">
                  {orgSettings.logoURL ? (
                    <img src={orgSettings.logoURL} className="w-full h-full object-contain" alt="Logo" />
                  ) : (
                    <span className="text-[10px] text-gray-400 font-bold uppercase">Logo</span>
                  )}
                  <input type="file" accept="image/*" className="absolute inset-0 opacity-0 cursor-pointer" onChange={async (e) => {
                    const url = await handleFileUpload(e.target.files[0], `orgs/${user.orgId}/logo`)
                    if (url) setOrgSettings(s => ({ ...s, logoURL: url }))
                  }} />
                </div>
              </div>
              <div className="space-y-3">
                {[
                  { label: 'Org Name', key: 'name' },
                  { label: 'Email', key: 'email' },
                  { label: 'Address', key: 'address' },
                  { label: 'GSTIN', key: 'gstin' }
                ].map(f => (
                  <div key={f.key}>
                    <label className="block text-[9px] font-black text-gray-400 uppercase mb-1">{f.label}</label>
                    <input type="text" value={orgSettings[f.key] || ''} onChange={e => setOrgSettings(s => ({ ...s, [f.key]: e.target.value }))} className="w-full border rounded-lg px-3 py-2 focus:ring-1 focus:ring-indigo-500 outline-none font-bold bg-gray-50/50" />
                  </div>
                ))}
              </div>
            </div>

            <div className="bg-white rounded-2xl border p-5 space-y-4 shadow-sm">
              <h3 className="text-sm font-black text-gray-800 uppercase tracking-tight">Structure & Accounts</h3>
              <div className="space-y-3">
                {[
                  { label: 'Hierarchy', key: 'hierarchy', placeholder: 'CEO > Manager > Staff' },
                  { label: 'Branches', key: 'branches', placeholder: 'Chennai, Mumbai...' },
                  { label: 'Bank Accounts', key: 'bankAccounts', placeholder: 'HDFC: XXX, SBI: YYY' }
                ].map(f => (
                  <div key={f.key}>
                    <label className="block text-[9px] font-black text-gray-400 uppercase mb-1">{f.label}</label>
                    <textarea value={orgSettings[f.key] || ''} onChange={e => setOrgSettings(s => ({ ...s, [f.key]: e.target.value }))} className="w-full border rounded-lg px-3 py-2 focus:ring-1 focus:ring-indigo-500 outline-none font-medium bg-gray-50/50 h-20" placeholder={f.placeholder} />
                  </div>
                ))}
                <div>
                  <label className="block text-[9px] font-black text-gray-400 uppercase mb-1">Invite Code</label>
                  <div className="bg-indigo-50 border border-indigo-100 rounded-lg px-3 py-2 font-mono font-bold text-indigo-600 text-center select-all">{orgSettings.code}</div>
                </div>
              </div>
              <button onClick={handleSaveOrg} disabled={saving} className={`w-full py-2.5 rounded-xl font-black transition-all shadow-md mt-2 ${saved ? 'bg-green-500 text-white' : 'bg-indigo-600 text-white hover:bg-indigo-700'}`}>
                {saving ? 'SAVING...' : saved ? 'SAVED ✓' : 'SAVE ALL CHANGES'}
              </button>
            </div>
          </div>
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

        {activeSubTab === 'employee' && (
          <div className="space-y-4">
            <div className="flex justify-between items-center no-print">
              <div className="flex items-center gap-4 flex-wrap">
                <h3 className="text-sm font-bold text-gray-800">Employee Roster</h3>
                <div className="flex gap-1.5 flex-wrap items-center">
                  <span className="text-[10px] text-gray-400 font-medium mr-1">Columns:</span>
                  {allColumns.map(col => (
                    <button
                      key={col.key}
                      disabled={!col.optional}
                      onClick={() => {
                        if (!col.optional) return
                        setVisibleColumns(prev => prev.includes(col.key) ? prev.filter(k => k !== col.key) : [...prev, col.key])
                      }}
                      title={!col.optional ? 'Required column' : ''}
                      className={`px-2 py-1 rounded-md text-[9px] font-semibold border transition-all ${!col.optional
                        ? 'bg-gray-900 text-white border-gray-900 cursor-default'
                        : visibleColumns.includes(col.key)
                          ? 'bg-white border-gray-300 text-gray-700 shadow-sm'
                          : 'bg-white border-gray-100 text-gray-300 hover:border-gray-200'
                        }`}
                    >
                      {col.label}
                    </button>
                  ))}
                </div>
              </div>
              <button onClick={() => setShowAddEmployee(true)} className="bg-gray-900 text-white px-4 py-2 rounded-lg font-semibold text-[12px] hover:bg-gray-800 transition-all">+ Add Employee</button>
            </div>
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden print-section">
              <table className="w-full text-left">
                <thead className="bg-gray-50 border-b border-gray-100">
                  <tr>
                    {allColumns.filter(c => visibleColumns.includes(c.key)).map(h => (
                      <th key={h.key} className="px-4 py-3 text-[10px] font-semibold text-gray-500 uppercase tracking-wider">{h.label}</th>
                    ))}
                    <th className="px-4 py-3 text-[10px] font-semibold text-gray-500 uppercase tracking-wider no-print">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {empLoading ? (
                    <tr><td colSpan={visibleColumns.length + 1} className="text-center py-10"><Spinner /></td></tr>
                  ) : employees.map(emp => (
                    <tr key={emp.id} className="hover:bg-gray-50/50 group">
                      {visibleColumns.includes('photo') && (
                        <td className="px-4 py-2">
                          <div className="w-9 h-9 rounded-lg border bg-gray-50 overflow-hidden flex items-center justify-center">
                            {emp.photoURL ? <img src={emp.photoURL} className="w-full h-full object-cover" alt={emp.name} /> : <span className="text-[8px] text-gray-300 font-bold">—</span>}
                          </div>
                        </td>
                      )}
                      {visibleColumns.includes('name') && (
                        <td className="px-4 py-2.5">
                          <button onClick={() => { setEditingEmp(emp.id); setEditForm(emp); }} className="flex items-center gap-2 text-left hover:text-indigo-600 transition-colors">
                            <div className="w-7 h-7 rounded-full flex items-center justify-center text-white text-[9px] font-bold shrink-0" style={{ backgroundColor: getAvatarColor(emp.id) }}>{getInitials(emp.name)}</div>
                            <span className="font-semibold text-gray-800 text-[12px]">{emp.name}</span>
                          </button>
                        </td>
                      )}
                      {visibleColumns.includes('designation') && <td className="px-4 py-2.5 text-gray-600 text-[11px] font-medium">{emp.designation || '—'}</td>}
                      {visibleColumns.includes('emergencyContact') && <td className="px-4 py-2.5 text-gray-600 text-[11px] font-medium">{emp.emergencyContact || '—'}</td>}
                      {visibleColumns.includes('empCode') && <td className="px-4 py-2.5 font-mono text-gray-400 text-[10px]">{emp.empCode || '—'}</td>}
                      {visibleColumns.includes('department') && <td className="px-4 py-2.5 text-gray-500 text-[11px]">{emp.department || '—'}</td>}
                      {visibleColumns.includes('email') && <td className="px-4 py-2.5 text-gray-500 text-[10px]">{emp.email || '—'}</td>}
                      {visibleColumns.includes('shift') && <td className="px-4 py-2.5 text-gray-400 text-[10px]">{emp.shift?.name || '—'}</td>}
                      {visibleColumns.includes('site') && <td className="px-4 py-2.5 text-gray-400 text-[10px]">{emp.site || '—'}</td>}
                      {visibleColumns.includes('bankAccount') && <td className="px-4 py-2.5 font-mono text-gray-400 text-[10px]">{emp.bankAccount || '—'}</td>}
                      {visibleColumns.includes('status') && (
                        <td className="px-4 py-2.5"><span className={`px-2 py-0.5 rounded-full text-[9px] font-semibold ${emp.status === 'Active' ? 'bg-green-50 text-green-700 border border-green-100' : 'bg-red-50 text-red-600 border border-red-100'}`}>{emp.status || 'Active'}</span></td>
                      )}
                      {visibleColumns.includes('joinedDate') && <td className="px-4 py-2.5 text-gray-400 text-[10px]">{emp.joinedDate || '—'}</td>}
                      {visibleColumns.includes('bloodGroup') && <td className="px-4 py-2.5 text-gray-500 text-[10px] font-bold">{emp.bloodGroup || '—'}</td>}
                      {visibleColumns.includes('dob') && <td className="px-4 py-2.5 text-gray-400 text-[10px]">{emp.dob || '—'}</td>}
                      {visibleColumns.includes('maritalStatus') && <td className="px-4 py-2.5 text-gray-400 text-[10px]">{emp.maritalStatus || '—'}</td>}
                      <td className="px-4 py-2.5 no-print">
                        <button onClick={() => { setEditingEmp(emp.id); setEditForm(emp); }} className="text-gray-400 hover:text-gray-900 font-medium text-[10px] transition-colors">Edit</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="flex justify-end no-print">
              <button onClick={handlePrintRoster} className="text-gray-400 hover:text-gray-700 text-[11px] font-medium transition-colors">Export PDF Roster</button>
            </div>
          </div>
        )}

        {activeSubTab === 'shift' && (
          <div className="space-y-4 no-print">
            <div className="flex justify-between items-center">
              <h3 className="text-sm font-black text-gray-800 uppercase">Shift Management</h3>
              <button onClick={() => { setEditingShift(null); setNewShift({ name: '', type: 'Day', startTime: '09:00', endTime: '18:00', workHours: 9, isFlexible: false }); setShowAddShift(true); }} className="bg-indigo-600 text-white px-4 py-2 rounded-xl font-black text-[10px] shadow-lg">CREATE SHIFT</button>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {shifts.map(s => (
                <div key={s.id} className="bg-white p-4 rounded-2xl border shadow-sm group relative">
                  <div className="flex justify-between items-start mb-2">
                    <h4 className="font-black text-gray-800 uppercase tracking-tight">{s.name}</h4>
                    <span className={`px-1.5 py-0.5 rounded text-[8px] font-bold ${s.isFlexible ? 'bg-purple-100 text-purple-600' : 'bg-indigo-50 text-indigo-600'}`}>{s.isFlexible ? 'FLEXIBLE' : s.type}</span>
                  </div>
                  <div className="text-[10px] font-bold text-gray-400">{s.isFlexible ? 'Anytime' : `${s.startTime} - ${s.endTime}`}</div>
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
          <div className="space-y-6 no-print max-w-5xl">
            <div className="flex justify-between items-center">
              <h3 className="text-sm font-black text-gray-800 uppercase tracking-tight">Access Control</h3>
              <button onClick={() => setShowAddRole(true)} className="bg-indigo-600 text-white px-4 py-2 rounded-xl font-black text-[10px] shadow-lg">+ CREATE NEW ROLE</button>
            </div>
            {roles.map(role => (
              <div key={role.id} className="bg-white rounded-2xl border shadow-sm overflow-hidden mb-10">
                <div className="bg-gray-50 px-6 py-4 border-b flex justify-between items-center">
                  <h4 className="text-sm font-black text-gray-800 uppercase tracking-widest">{role.name} Permissions</h4>
                  <button onClick={async () => { if (confirm('Delete role?')) { await deleteDoc(doc(db, 'organisations', user.orgId, 'roles', role.id)); setRoles(r => r.filter(x => x.id !== role.id)); } }} className="text-red-400 hover:text-red-600 font-bold text-[9px] uppercase tracking-tighter">Remove Role</button>
                </div>
                <div className="p-0">
                  <table className="w-full text-left text-[10px] permissions-table">
                    <thead><tr><th className="px-6 py-3 w-1/4">Particulars</th><th className="px-4 py-3 text-center">Full</th>{permissionRights.map(r => (<th key={r} className="px-4 py-3 text-center capitalize">{r}</th>))}<th className="px-4 py-3 text-center">Assign Owner</th><th className="px-4 py-3 text-center">Others</th></tr></thead>
                    <tbody>
                      {roleGroups.map(group => (
                        <tr key={group.title}>
                          <td colSpan={permissionRights.length + 4} className="bg-gray-50/50 px-6 py-2"><h5 className="group-header">{group.title}</h5>
                            <table className="w-full">
                              <tbody>{group.modules.map(mod => (
                                <tr key={mod.id} className="hover:bg-indigo-50/30 transition-colors">
                                  <td className="py-3 w-1/4 font-semibold text-gray-600">{mod.label}</td>
                                  <td className="py-3 text-center w-[8%]"><input type="checkbox" checked={role.permissions?.[mod.id]?.full || false} onChange={() => togglePermission(role.id, mod.id, 'full')} className="w-4 h-4 rounded text-indigo-600 cursor-pointer border-gray-300" /></td>
                                  {permissionRights.map(right => (<td key={right} className="py-3 text-center w-[8%]"><input type="checkbox" checked={role.permissions?.[mod.id]?.[right] || false} onChange={() => togglePermission(role.id, mod.id, right)} className="w-4 h-4 rounded text-indigo-600 cursor-pointer border-gray-300" /></td>))}
                                  <td className="py-3 text-center w-[10%]"><input type="checkbox" className="w-4 h-4 rounded border-gray-200" disabled /></td>
                                  <td className="py-3 text-center text-indigo-500 font-bold text-[9px] cursor-pointer hover:underline">More</td>
                                </tr>
                              ))}</tbody>
                            </table>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ))}
          </div>
        )}

        {activeSubTab === 'salary' && <SalarySlabSettings />}
      </div>

      {/* COMPREHENSIVE EMPLOYEE EDITOR MODAL */}
      <Modal isOpen={!!editingEmp} onClose={() => setEditingEmp(null)} title="EMPLOYEE MASTER DATA">
        <div className="p-6 max-w-3xl mx-auto h-[80vh] flex flex-col">
          <div className="flex-1 overflow-y-auto pr-2 space-y-6">
            <div className="flex items-center gap-6 bg-gray-50 p-6 rounded-3xl border border-gray-100 shadow-sm">
              <div className="w-24 h-24 rounded-2xl border-2 border-dashed border-indigo-200 flex items-center justify-center relative overflow-hidden bg-white shadow-inner group">
                {editForm.photoURL ? <img src={editForm.photoURL} className="w-full h-full object-cover" /> : <span className="text-[10px] text-indigo-300 font-black uppercase">Upload</span>}
                <input type="file" accept="image/*" className="absolute inset-0 opacity-0 cursor-pointer" onChange={async (e) => {
                  const url = await handleFileUpload(e.target.files[0], `employees/${editingEmp}/profile`)
                  if (url) setEditForm(s => ({ ...s, photoURL: url }))
                }} />
              </div>
              <div className="flex-1">
                <input type="text" value={editForm.name || ''} onChange={e => setEditForm(s => ({ ...s, name: e.target.value }))} className="text-xl font-black uppercase tracking-tight text-gray-800 bg-transparent border-none focus:ring-0 w-full p-0" />
                <p className="text-[10px] font-black text-indigo-500 uppercase tracking-widest mt-1">Personnel Master File</p>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              {[
                { label: 'Employee ID', key: 'empCode' },
                { label: 'Department', key: 'department' },
                { label: 'Site Location', key: 'site' },
                { label: 'Bank Account', key: 'bankAccount' },
                { label: 'Joined Date', key: 'joinedDate', type: 'date' },
                { label: 'Date of Birth', key: 'dob', type: 'date' },
                { label: 'Blood Group', key: 'bloodGroup' },
                { label: 'Perm. Hrs/Month', key: 'permissionHours', type: 'number' },
                { label: 'Min Daily Hrs', key: 'minDailyHours', type: 'number' }
              ].map(f => (
                <div key={f.key}>
                  <label className="block text-[9px] font-black text-gray-400 uppercase mb-1">{f.label}</label>
                  <input type={f.type || 'text'} value={editForm[f.key] || ''} onChange={e => setEditForm(s => ({ ...s, [f.key]: e.target.value }))} className="w-full border rounded-xl px-3 py-2 text-xs font-bold focus:ring-1 focus:ring-indigo-500 outline-none bg-white shadow-sm" />
                </div>
              ))}
              <div>
                <label className="block text-[9px] font-black text-gray-400 uppercase mb-1">Shift</label>
                <select value={editForm.shiftId || ''} onChange={e => setEditForm(s => ({ ...s, shiftId: e.target.value }))} className="w-full border rounded-xl px-3 py-2 text-xs font-bold bg-white">
                  <option value="">Select Shift...</option>
                  {shifts.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </div>
            </div>
          </div>
          <div className="mt-6 pt-4 border-t flex gap-3">
            <button onClick={() => setEditingEmp(null)} className="flex-1 py-3 border-2 rounded-2xl font-black text-gray-400 uppercase tracking-widest text-[10px]">Cancel</button>
            <button onClick={handleSaveEmployee} disabled={saving} className="flex-2 bg-indigo-600 text-white py-3 rounded-2xl font-black shadow-xl uppercase text-[10px]">{saving ? 'SYNCHING...' : 'SAVE MASTER DATA'}</button>
          </div>
        </div>
      </Modal>

      {/* ADD NEW EMPLOYEE MODAL - Minimal, Clean Form */}
      <Modal isOpen={showAddEmployee} onClose={() => setShowAddEmployee(false)} title="Add Employee">
        <div className="flex flex-col h-[90vh] max-w-3xl mx-auto font-inter bg-white">
          {/* Scrollable Form Body */}
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
          <input type="text" placeholder="Shift Name" value={newShift.name} onChange={e => setNewShift(s => ({ ...s, name: e.target.value }))} className="w-full border rounded-xl px-4 py-2.5 text-xs font-black bg-gray-50 outline-none" />
          <div className="flex items-center justify-between bg-purple-50 p-3 rounded-xl border border-purple-100">
            <span className="text-[10px] font-black text-purple-700 uppercase">Flexible?</span>
            <input type="checkbox" checked={newShift.isFlexible} onChange={e => setNewShift(s => ({ ...s, isFlexible: e.target.checked }))} className="w-5 h-5 rounded text-purple-600" />
          </div>
          <button onClick={handleAddShift} className="w-full bg-indigo-600 text-white font-black py-3 rounded-2xl uppercase text-[10px]">SAVE SHIFT</button>
        </div>
      </Modal>

      <Modal isOpen={showAddRole} onClose={() => setShowAddRole(false)} title="INITIALIZE ROLE">
        <div className="p-6 space-y-4 max-w-sm mx-auto">
          <input type="text" value={newRole.name} onChange={e => setNewRole(s => ({ ...s, name: e.target.value }))} className="w-full border rounded-2xl px-4 py-3 text-xs font-black bg-gray-50 outline-none" placeholder="ROLE NAME" />
          <button onClick={handleAddRole} className="w-full bg-indigo-600 text-white font-black py-3 rounded-2xl uppercase text-[10px]">CREATE ROLE</button>
        </div>
      </Modal>
    </div>
  )
}
