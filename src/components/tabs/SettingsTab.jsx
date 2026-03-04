import { useState, useEffect, useMemo } from 'react'
import { useAuth } from '../../hooks/useAuth'
import { useEmployees } from '../../hooks/useEmployees'
import { db, storage } from '../../lib/firebase'
import { collection, getDocs, addDoc, updateDoc, doc, getDoc, setDoc, serverTimestamp, deleteDoc } from 'firebase/firestore'
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage'
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
    name: '', empCode: '', department: '', shiftId: '', workHours: 9, site: '', employmentType: 'Full-time', monthlySalary: 0, status: 'Active', joinedDate: '', bloodGroup: '', bankAccount: '', photoURL: '', permissionHours: 2, minDailyHours: 8
  })
  const [newRole, setNewRole] = useState({ name: '', permissions: {} })
  const [orgSettings, setOrgSettings] = useState({
    name: '', email: '', address: '', gstin: '', hierarchy: '', branches: '', bankAccounts: '', code: '', shiftStrategy: 'Day', logoURL: ''
  })
  
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [orgError, setOrgError] = useState('')

  // Roster Columns
  const [visibleColumns, setVisibleColumns] = useState(['Employee', 'Dept', 'Status'])
  const allColumns = [
    { label: 'Photo', key: 'photo' },
    { label: 'Employee', key: 'name' },
    { label: 'Emp ID', key: 'empCode' },
    { label: 'Department', key: 'department' },
    { label: 'Shift', key: 'shift' },
    { label: 'Site', key: 'site' },
    { label: 'Bank Account', key: 'bankAccount' },
    { label: 'Status', key: 'status' },
    { label: 'Join Date', key: 'joinedDate' },
    { label: 'Blood Group', key: 'bloodGroup' }
  ]

  // Role Groups & Rights
  const roleGroups = [
    {
      title: 'Time & Attendance',
      modules: [
        { id: 'Attendance', label: 'Attendance Entry' },
        { id: 'Correction', label: 'Attendance Correction' },
        { id: 'Approvals', label: 'OT & Leave Approvals' },
        { id: 'Summary', label: 'Reports & Summary' }
      ]
    },
    {
      title: 'Payroll & Salary',
      modules: [
        { id: 'SalarySlip', label: 'Salary Slips & Payroll' }
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
          setOrgSettings(prev => ({ ...prev, ...orgSnap.data() }))
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
    await addEmployee(newEmployee)
    await logChange('EMPLOYEE_CREATE', 'new', { name: newEmployee.name })
    setShowAddEmployee(false)
    setNewEmployee({
      name: '', empCode: '', department: '', shiftId: '', workHours: 9, site: '', employmentType: 'Full-time', monthlySalary: 0, status: 'Active', joinedDate: '', bloodGroup: '', bankAccount: '', photoURL: '', permissionHours: 2, minDailyHours: 8
    })
    setSaving(false)
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
        // Update 'full' flag based on others
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

  const handlePrintRoster = () => {
    window.print()
  }

  return (
    <div className="h-full flex flex-col text-[11px] font-roboto">
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

      <div className="flex gap-1.5 mb-4 flex-wrap no-print">
        {['organization', 'employee', 'shift', 'roles', 'salary'].map(tab => (
          <button
            key={tab}
            onClick={() => setActiveSubTab(tab)}
            className={`px-3 py-1.5 rounded-xl font-black transition-all uppercase tracking-tighter border ${activeSubTab === tab ? 'bg-indigo-600 text-white border-indigo-600 shadow-md' : 'bg-white text-gray-400 hover:bg-gray-50 border-gray-100'}`}
          >
            {tab === 'organization' ? 'Org Details' : tab === 'employee' ? 'Employees' : tab === 'shift' ? 'Shifts' : tab === 'roles' ? 'Roles & Rights' : 'Salary Slab'}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-auto">
        {activeSubTab === 'organization' && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-w-4xl no-print">
            <div className="bg-white rounded-2xl border p-5 space-y-4 shadow-sm">
              <h3 className="text-sm font-black text-gray-800 uppercase tracking-tight">Org Information</h3>
              <div className="flex flex-col items-center mb-4">
                <div className="w-20 h-20 rounded-2xl border-2 border-dashed border-gray-200 flex items-center justify-center relative overflow-hidden bg-gray-50 group">
                  {orgSettings.logoURL ? (
                    <img src={orgSettings.logoURL} className="w-full h-full object-contain" alt="Logo" />
                  ) : (
                    <span className="text-[10px] text-gray-400 font-bold uppercase">Logo</span>
                  )}
                  <input 
                    type="file" 
                    accept="image/*" 
                    className="absolute inset-0 opacity-0 cursor-pointer" 
                    onChange={async (e) => {
                      const url = await handleFileUpload(e.target.files[0], `orgs/${user.orgId}/logo`)
                      if (url) setOrgSettings(s => ({ ...s, logoURL: url }))
                    }} 
                  />
                </div>
                <p className="text-[8px] font-bold text-gray-400 mt-1 uppercase">Click to upload (Square preferred)</p>
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
                  <label className="block text-[9px] font-black text-gray-400 uppercase mb-1">Invite Code (Share to Join)</label>
                  <div className="bg-indigo-50 border border-indigo-100 rounded-lg px-3 py-2 font-mono font-bold text-indigo-600 text-center select-all">{orgSettings.code}</div>
                </div>
              </div>
              <button onClick={handleSaveOrg} disabled={saving} className={`w-full py-2.5 rounded-xl font-black transition-all shadow-md mt-2 ${saved ? 'bg-green-500 text-white' : 'bg-indigo-600 text-white hover:bg-indigo-700'}`}>
                {saving ? 'SAVING...' : saved ? 'SAVED ✓' : 'SAVE ALL CHANGES'}
              </button>
            </div>
          </div>
        )}

        {activeSubTab === 'employee' && (
          <div className="space-y-4">
            <div className="flex justify-between items-center no-print">
              <div className="flex items-center gap-4">
                <h3 className="text-sm font-black text-gray-800 uppercase">Employee Roster</h3>
                <div className="flex gap-1">
                  {allColumns.map(col => (
                    <button 
                      key={col.key} 
                      onClick={() => setVisibleColumns(prev => prev.includes(col.key) ? prev.filter(k => k !== col.key) : [...prev, col.key])}
                      className={`px-2 py-1 rounded text-[8px] font-black uppercase border transition-all ${visibleColumns.includes(col.key) ? 'bg-indigo-50 border-indigo-200 text-indigo-600' : 'bg-white border-gray-100 text-gray-300'}`}
                    >
                      {col.label}
                    </button>
                  ))}
                </div>
              </div>
              <button onClick={() => setShowAddEmployee(true)} className="bg-indigo-600 text-white px-4 py-2 rounded-xl hover:bg-indigo-700 font-black text-[10px] shadow-lg">+ ADD NEW</button>
            </div>
            <div className="bg-white rounded-2xl border shadow-sm overflow-hidden print-section">
              <table className="w-full text-left">
                <thead className="bg-gray-50 border-b">
                  <tr>
                    {allColumns.filter(c => visibleColumns.includes(c.key)).map(h => (
                      <th key={h.key} className="px-4 py-2 text-[9px] font-black text-gray-400 uppercase tracking-widest">{h.label}</th>
                    ))}
                    <th className="px-4 py-2 text-[9px] font-black text-gray-400 uppercase tracking-widest no-print">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {empLoading ? (
                    <tr><td colSpan={visibleColumns.length + 1} className="text-center py-10"><Spinner /></td></tr>
                  ) : employees.map(emp => (
                    <tr key={emp.id} className="hover:bg-gray-50/50 group">
                      {visibleColumns.includes('photo') && (
                        <td className="px-4 py-2">
                          <div className="w-10 h-10 rounded-lg border bg-gray-50 overflow-hidden flex items-center justify-center">
                            {emp.photoURL ? <img src={emp.photoURL} className="w-full h-full object-cover" /> : <span className="text-[8px] text-gray-300 font-black">NO PIC</span>}
                          </div>
                        </td>
                      )}
                      {visibleColumns.includes('name') && (
                        <td className="px-4 py-2.5">
                          <button onClick={() => { setEditingEmp(emp.id); setEditForm(emp); }} className="flex items-center gap-2 text-left hover:text-indigo-600 transition-colors">
                            <div className="w-6 h-6 rounded-lg flex items-center justify-center text-white text-[9px] font-black shrink-0" style={{ backgroundColor: getAvatarColor(emp.id) }}>{getInitials(emp.name)}</div>
                            <span className="font-bold text-gray-700 uppercase tracking-tight">{emp.name}</span>
                          </button>
                        </td>
                      )}
                      {visibleColumns.includes('empCode') && <td className="px-4 py-2.5 font-mono text-gray-400 text-[10px]">{emp.empCode}</td>}
                      {visibleColumns.includes('department') && <td className="px-4 py-2.5 text-gray-500 font-medium uppercase">{emp.department}</td>}
                      {visibleColumns.includes('shift') && <td className="px-4 py-2.5 text-gray-500 text-[10px] uppercase font-bold">{emp.shift?.name || '-'}</td>}
                      {visibleColumns.includes('site') && <td className="px-4 py-2.5 text-gray-400 text-[10px]">{emp.site || '-'}</td>}
                      {visibleColumns.includes('bankAccount') && <td className="px-4 py-2.5 font-mono text-gray-400 text-[10px]">{emp.bankAccount || '-'}</td>}
                      {visibleColumns.includes('status') && (
                        <td className="px-4 py-2.5">
                          <span className={`px-1.5 py-0.5 rounded text-[8px] font-black uppercase ${emp.status === 'Active' ? 'bg-green-100 text-green-600' : 'bg-red-100 text-red-600'}`}>{emp.status}</span>
                        </td>
                      )}
                      {visibleColumns.includes('joinedDate') && <td className="px-4 py-2.5 text-gray-400 text-[10px]">{emp.joinedDate || '-'}</td>}
                      {visibleColumns.includes('bloodGroup') && <td className="px-4 py-2.5 text-gray-400 text-[10px] font-black">{emp.bloodGroup || '-'}</td>}
                      <td className="px-4 py-2.5 no-print"><button onClick={() => { setEditingEmp(emp.id); setEditForm(emp); }} className="text-indigo-600 font-black hover:underline text-[9px] uppercase">MODIFY</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="flex justify-end no-print">
              <button onClick={handlePrintRoster} className="bg-gray-100 text-gray-600 px-4 py-2 rounded-xl font-black text-[10px] uppercase tracking-widest hover:bg-gray-200 transition-all">Export PDF Roster</button>
            </div>
          </div>
        )}

        {activeSubTab === 'shift' && (
          <div className="space-y-4 no-print">
            <div className="flex justify-between items-center">
              <h3 className="text-sm font-black text-gray-800 uppercase">Shift Management</h3>
              <button onClick={() => { setEditingShift(null); setNewShift({ name: '', type: 'Day', startTime: '09:00', endTime: '18:00', workHours: 9, isFlexible: false }); setShowAddShift(true); }} className="bg-indigo-600 text-white px-4 py-2 rounded-xl hover:bg-indigo-700 font-black text-[10px] shadow-lg">CREATE SHIFT</button>
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
                    <button onClick={async () => { if(confirm('Delete shift?')) { await deleteDoc(doc(db, 'organisations', user.orgId, 'shifts', s.id)); setShifts(prev => prev.filter(x => x.id !== s.id)); } }} className="text-red-400 font-bold hover:text-red-600">Delete</button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {activeSubTab === 'roles' && (
          <div className="space-y-6 no-print max-w-5xl">
            <div className="flex justify-between items-center">
              <h3 className="text-sm font-black text-gray-800 uppercase tracking-tight">System Roles & Access Control</h3>
              <button onClick={() => setShowAddRole(true)} className="bg-indigo-600 text-white px-4 py-2 rounded-xl hover:bg-indigo-700 font-black text-[10px] shadow-lg">+ CREATE NEW ROLE</button>
            </div>

            {roles.map(role => (
              <div key={role.id} className="bg-white rounded-2xl border shadow-sm overflow-hidden mb-10">
                <div className="bg-gray-50 px-6 py-4 border-b flex justify-between items-center">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg bg-indigo-600 flex items-center justify-center text-white font-black">{role.name[0].toUpperCase()}</div>
                    <h4 className="text-sm font-black text-gray-800 uppercase tracking-widest">{role.name} Permissions</h4>
                  </div>
                  <button onClick={async () => { if(confirm('Delete this role?')) { await deleteDoc(doc(db, 'organisations', user.orgId, 'roles', role.id)); setRoles(r => r.filter(x => x.id !== role.id)); } }} className="text-red-400 hover:text-red-600 font-bold text-[9px] uppercase tracking-tighter">Remove Role</button>
                </div>

                <div className="p-0">
                  <table className="w-full text-left text-[10px] permissions-table">
                    <thead>
                      <tr>
                        <th className="px-6 py-3 w-1/4">Particulars</th>
                        <th className="px-4 py-3 text-center">Full</th>
                        {permissionRights.map(r => (
                          <th key={r} className="px-4 py-3 text-center capitalize">{r}</th>
                        ))}
                        <th className="px-4 py-3 text-center">Assign Owner</th>
                        <th className="px-4 py-3 text-center">Others</th>
                      </tr>
                    </thead>
                    <tbody>
                      {roleGroups.map(group => (
                        <tr key={group.title}>
                          <td colSpan={permissionRights.length + 4} className="bg-gray-50/50 px-6 py-2">
                            <h5 className="group-header">{group.title}</h5>
                            <table className="w-full">
                              <tbody>
                                {group.modules.map(mod => (
                                  <tr key={mod.id} className="hover:bg-indigo-50/30 transition-colors">
                                    <td className="py-3 w-1/4 font-semibold text-gray-600">{mod.label}</td>
                                    <td className="py-3 text-center w-[8%]">
                                      <input 
                                        type="checkbox" 
                                        checked={role.permissions?.[mod.id]?.full || false} 
                                        onChange={() => togglePermission(role.id, mod.id, 'full')}
                                        className="w-4 h-4 rounded text-indigo-600 cursor-pointer border-gray-300"
                                      />
                                    </td>
                                    {permissionRights.map(right => (
                                      <td key={right} className="py-3 text-center w-[8%]">
                                        <input 
                                          type="checkbox" 
                                          checked={role.permissions?.[mod.id]?.[right] || false} 
                                          onChange={() => togglePermission(role.id, mod.id, right)}
                                          className="w-4 h-4 rounded text-indigo-600 cursor-pointer border-gray-300"
                                        />
                                      </td>
                                    ))}
                                    <td className="py-3 text-center w-[10%]">
                                      <input type="checkbox" className="w-4 h-4 rounded border-gray-200" disabled />
                                    </td>
                                    <td className="py-3 text-center text-indigo-500 font-bold text-[9px] cursor-pointer hover:underline">
                                      More Permissions
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
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

        {activeSubTab === 'salary' && (
          <SalarySlabSettings />
        )}
      </div>

      {/* COMPREHENSIVE EMPLOYEE EDITOR MODAL */}
      <Modal isOpen={!!editingEmp} onClose={() => setEditingEmp(null)} title="EMPLOYEE MASTER DATA">
        <div className="p-6 max-w-2xl mx-auto h-[80vh] flex flex-col">
          <div className="flex-1 overflow-y-auto pr-2 space-y-6">
            <div className="flex items-center gap-6 bg-gray-50 p-6 rounded-3xl border border-gray-100">
              <div className="w-24 h-24 rounded-2xl border-2 border-dashed border-indigo-200 flex items-center justify-center relative overflow-hidden bg-white shadow-inner group">
                {editForm.photoURL ? <img src={editForm.photoURL} className="w-full h-full object-cover" /> : <span className="text-[10px] text-indigo-300 font-black uppercase">Upload</span>}
                <input type="file" accept="image/*" className="absolute inset-0 opacity-0 cursor-pointer" onChange={async (e) => {
                  const url = await handleFileUpload(e.target.files[0], `employees/${editingEmp}/profile`)
                  if (url) setEditForm(s => ({ ...s, photoURL: url }))
                }} />
              </div>
              <div className="flex-1">
                <input type="text" value={editForm.name || ''} onChange={e => setEditForm(s => ({ ...s, name: e.target.value }))} className="text-xl font-black uppercase tracking-tight text-gray-800 bg-transparent border-none focus:ring-0 w-full p-0" placeholder="EMPLOYEE FULL NAME" />
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
                { label: 'Blood Group', key: 'bloodGroup' },
                { label: 'Perm. Hrs/Month', key: 'permissionHours', type: 'number', placeholder: 'e.g. 2' },
                { label: 'Min Daily Hrs', key: 'minDailyHours', type: 'number', placeholder: 'e.g. 8' }
              ].map(f => (
                <div key={f.key}>
                  <label className="block text-[9px] font-black text-gray-400 uppercase mb-1">{f.label}</label>
                  <input type={f.type || 'text'} placeholder={f.placeholder} value={editForm[f.key] || ''} onChange={e => setEditForm(s => ({ ...s, [f.key]: e.target.value }))} className="w-full border rounded-xl px-3 py-2 text-xs font-bold focus:ring-1 focus:ring-indigo-500 outline-none bg-white shadow-sm" />
                </div>
              ))}
              <div>
                <label className="block text-[9px] font-black text-gray-400 uppercase mb-1">Shift Assignment</label>
                <select value={editForm.shiftId || ''} onChange={e => setEditForm(s => ({ ...s, shiftId: e.target.value }))} className="w-full border rounded-xl px-3 py-2 text-xs font-bold bg-white">
                  <option value="">Select Shift...</option>
                  {shifts.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-[9px] font-black text-gray-400 uppercase mb-1">Work Status</label>
                <div className="flex bg-gray-100 p-1 rounded-xl">
                  <button onClick={() => setEditForm(s => ({ ...s, status: 'Active' }))} className={`flex-1 py-1.5 rounded-lg text-[10px] font-black transition-all ${editForm.status === 'Active' ? 'bg-white shadow text-green-600' : 'text-gray-400'}`}>ACTIVE</button>
                  <button onClick={() => setEditForm(s => ({ ...s, status: 'Inactive' }))} className={`flex-1 py-1.5 rounded-lg text-[10px] font-black transition-all ${editForm.status === 'Inactive' ? 'bg-white shadow text-red-600' : 'text-gray-400'}`}>INACTIVE</button>
                </div>
              </div>
            </div>
          </div>
          <div className="mt-6 pt-4 border-t flex gap-3">
            <button onClick={() => setEditingEmp(null)} className="flex-1 py-3 border-2 rounded-2xl font-black text-gray-400 uppercase tracking-widest text-[10px] hover:bg-gray-50 transition-all">Cancel</button>
            <button onClick={handleSaveEmployee} disabled={saving} className="flex-2 bg-indigo-600 text-white py-3 rounded-2xl font-black shadow-xl uppercase tracking-widest text-[10px] hover:bg-indigo-700 transition-all">{saving ? 'SYNCHING...' : 'SAVE MASTER DATA'}</button>
          </div>
        </div>
      </Modal>

      {/* SHIFT EDITOR MODAL */}
      <Modal isOpen={showAddShift} onClose={() => setShowAddShift(false)} title={editingShift ? 'EDIT SHIFT' : 'NEW SHIFT'}>
        <div className="p-6 space-y-4 max-w-sm mx-auto">
          <div>
            <label className="block text-[9px] font-black text-gray-400 uppercase mb-1">Shift Label</label>
            <input type="text" value={newShift.name} onChange={e => setNewShift(s => ({ ...s, name: e.target.value }))} className="w-full border rounded-xl px-4 py-2.5 text-xs font-black bg-gray-50 focus:ring-1 focus:ring-indigo-500 outline-none" placeholder="e.g. MORNING" />
          </div>
          <div className="flex items-center justify-between bg-purple-50 p-3 rounded-xl border border-purple-100">
            <span className="text-[10px] font-black text-purple-700 uppercase">Flexible Timing?</span>
            <input type="checkbox" checked={newShift.isFlexible} onChange={e => setNewShift(s => ({ ...s, isFlexible: e.target.checked }))} className="w-5 h-5 rounded text-purple-600 focus:ring-purple-500" />
          </div>
          {!newShift.isFlexible && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-[9px] font-black text-gray-400 uppercase mb-1 text-center">Start Time</label>
                <input type="time" value={newShift.startTime} onChange={e => setNewShift(s => ({ ...s, startTime: e.target.value }))} className="w-full border rounded-xl px-3 py-2 text-xs font-black bg-gray-50" />
              </div>
              <div>
                <label className="block text-[9px] font-black text-gray-400 uppercase mb-1 text-center">End Time</label>
                <input type="time" value={newShift.endTime} onChange={e => setNewShift(s => ({ ...s, endTime: e.target.value }))} className="w-full border rounded-xl px-3 py-2 text-xs font-black bg-gray-50" />
              </div>
            </div>
          )}
          <button onClick={handleAddShift} className="w-full bg-indigo-600 text-white font-black py-3 rounded-2xl shadow-xl hover:bg-indigo-700 transition-all uppercase tracking-widest text-[10px] mt-2">{editingShift ? 'UPDATE SHIFT' : 'INITIALIZE SHIFT'}</button>
        </div>
      </Modal>

      {/* NEW EMPLOYEE MODAL */}
      <Modal isOpen={showAddEmployee} onClose={() => setShowAddEmployee(false)} title="QUICK REGISTER">
        <div className="p-6 space-y-4 max-w-sm mx-auto">
          {['name', 'empCode', 'department'].map(f => (
            <div key={f}>
              <label className="block text-[9px] font-black text-gray-400 uppercase mb-1">{f}</label>
              <input type="text" value={newEmployee[f]} onChange={e => setNewEmployee(s => ({ ...s, [f]: e.target.value }))} className="w-full border rounded-xl px-4 py-2.5 text-xs font-black bg-gray-50 focus:ring-1 focus:ring-indigo-500 outline-none" />
            </div>
          ))}
          <button onClick={handleAddEmployee} disabled={saving} className="w-full bg-indigo-600 text-white font-black py-3 rounded-2xl shadow-xl hover:bg-indigo-700 transition-all uppercase tracking-widest text-[10px]">REGISTER & OPEN FILE</button>
        </div>
      </Modal>

      <Modal isOpen={showAddRole} onClose={() => setShowAddRole(false)} title="INITIALIZE ROLE">
        <div className="p-6 space-y-4 max-w-sm mx-auto">
          <input type="text" value={newRole.name} onChange={e => setNewRole(s => ({ ...s, name: e.target.value }))} className="w-full border rounded-2xl px-4 py-3 text-xs font-black bg-gray-50 outline-none focus:ring-2 focus:ring-indigo-500 uppercase tracking-widest" placeholder="ROLE NAME (e.g. MANAGER)" />
          <button onClick={handleAddRole} className="w-full bg-indigo-600 text-white font-black py-3 rounded-2xl shadow-xl hover:bg-indigo-700 uppercase tracking-widest text-[10px]">CREATE AUTHORIZATION</button>
        </div>
      </Modal>
    </div>
  )
}
