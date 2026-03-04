import { useState, useEffect } from 'react'
import { useAuth } from '../../hooks/useAuth'
import { useEmployees } from '../../hooks/useEmployees'
import { db } from '../../lib/firebase'
import { collection, getDocs, addDoc, updateDoc, doc, getDoc, setDoc, serverTimestamp, deleteDoc } from 'firebase/firestore'
import Spinner from '../ui/Spinner'
import Modal from '../ui/Modal'

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
  const [showAddEmployee, setShowAddEmployee] = useState(false)
  const [showAddRole, setShowAddRole] = useState(false)
  
  const [newShift, setNewShift] = useState({ name: '', type: 'Day', startTime: '09:00', endTime: '18:00', workHours: 9 })
  const [newEmployee, setNewEmployee] = useState({
    name: '', empCode: '', department: '', shiftId: '', workHours: 9, site: '', employmentType: 'Full-time', monthlySalary: 0, status: 'Active', joinedDate: '', bloodGroup: '', bankAccount: ''
  })
  const [newRole, setNewRole] = useState({ name: '', permissions: {} })
  const [orgSettings, setOrgSettings] = useState({
    name: '',
    email: '',
    address: '',
    gstin: '',
    hierarchy: '',
    branches: '',
    bankAccounts: '',
    code: '',
    shiftStrategy: 'Day'
  })
  
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [orgError, setOrgError] = useState('')

  const modules = ['Attendance', 'Correction', 'Approvals', 'Summary', 'Settings', 'Employees', 'Roles', 'Shifts', 'EmployeePortal']

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

  const handleSaveEmployee = async () => {
    await updateEmployee(editingEmp, editForm)
    setEditingEmp(null)
    setEditForm({})
  }

  const handleAddShift = async () => {
    await addDoc(collection(db, 'organisations', user.orgId, 'shifts'), {
      ...newShift,
      createdAt: serverTimestamp(),
    })
    const snap = await getDocs(collection(db, 'organisations', user.orgId, 'shifts'))
    setShifts(snap.docs.map(d => ({ id: d.id, ...d.data() })))
    setShowAddShift(false)
    setNewShift({ name: '', type: 'Day', startTime: '09:00', endTime: '18:00', workHours: 9 })
  }

  const handleAddEmployee = async () => {
    setSaving(true)
    await addEmployee(newEmployee)
    setShowAddEmployee(false)
    setNewEmployee({
      name: '', empCode: '', department: '', shiftId: '', workHours: 9, site: '', employmentType: 'Full-time', monthlySalary: 0, status: 'Active', joinedDate: '', bloodGroup: '', bankAccount: ''
    })
    setSaving(false)
  }

  const handleAddRole = async () => {
    await addDoc(collection(db, 'organisations', user.orgId, 'roles'), {
      ...newRole,
      createdAt: serverTimestamp(),
    })
    const snap = await getDocs(collection(db, 'organisations', user.orgId, 'roles'))
    setRoles(snap.docs.map(d => ({ id: d.id, ...d.data() })))
    setShowAddRole(false)
    setNewRole({ name: '', permissions: {} })
  }

  const togglePermission = async (roleId, module, right) => {
    setRoles(prev => prev.map(r => {
      if (r.id !== roleId) return r
      const permissions = { ...r.permissions }
      if (!permissions[module]) permissions[module] = {}
      permissions[module][right] = !permissions[module][right]
      
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

  return (
    <div className="h-full flex flex-col text-[11px]">
      <div className="flex gap-1.5 mb-4 flex-wrap">
        {['organization', 'employee', 'shift', 'roles'].map(tab => (
          <button
            key={tab}
            onClick={() => setActiveSubTab(tab)}
            className={`px-3 py-1.5 rounded-xl font-black transition-all uppercase tracking-tighter border ${activeSubTab === tab ? 'bg-indigo-600 text-white border-indigo-600 shadow-md' : 'bg-white text-gray-400 hover:bg-gray-50 border-gray-100'}`}
          >
            {tab === 'organization' ? 'Org Details' : tab === 'employee' ? 'Employees' : tab === 'shift' ? 'Shifts' : 'Roles & Rights'}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-auto">
        {activeSubTab === 'organization' && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-w-4xl">
            <div className="bg-white rounded-2xl border p-5 space-y-4 shadow-sm">
              <h3 className="text-sm font-black text-gray-800 uppercase tracking-tight">Org Information</h3>
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
            <div className="flex justify-between items-center">
              <h3 className="text-sm font-black text-gray-800 uppercase">Employee Roster</h3>
              <button onClick={() => setShowAddEmployee(true)} className="bg-indigo-600 text-white px-4 py-2 rounded-xl hover:bg-indigo-700 font-black text-[10px] shadow-lg">ADD NEW</button>
            </div>
            <div className="bg-white rounded-2xl border shadow-sm overflow-hidden">
              <table className="w-full text-left">
                <thead className="bg-gray-50 border-b">
                  <tr>
                    {['Name', 'Dept', 'Bank Account', 'Status', 'Actions'].map(h => <th key={h} className="px-4 py-2 text-[9px] font-black text-gray-400 uppercase tracking-widest">{h}</th>)}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {empLoading ? (
                    <tr><td colSpan={5} className="text-center py-10"><Spinner /></td></tr>
                  ) : employees.map(emp => (
                    <tr key={emp.id} className="hover:bg-gray-50/50">
                      <td className="px-4 py-2.5 flex items-center gap-2">
                        <div className="w-6 h-6 rounded-lg flex items-center justify-center text-white text-[9px] font-black" style={{ backgroundColor: getAvatarColor(emp.id) }}>{getInitials(emp.name)}</div>
                        <span className="font-bold text-gray-700">{emp.name}</span>
                      </td>
                      <td className="px-4 py-2.5 text-gray-500 font-medium">{emp.department}</td>
                      <td className="px-4 py-2.5 font-mono text-gray-400">{emp.bankAccount || '-'}</td>
                      <td className="px-4 py-2.5">
                        <span className={`px-1.5 py-0.5 rounded text-[8px] font-black ${emp.status === 'Active' ? 'bg-green-100 text-green-600' : 'bg-red-100 text-red-600'}`}>{emp.status}</span>
                      </td>
                      <td className="px-4 py-2.5"><button onClick={() => { setEditingEmp(emp.id); setEditForm(emp); }} className="text-indigo-600 font-black hover:underline">EDIT</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {activeSubTab === 'shift' && (
          <div className="space-y-4">
            <div className="flex justify-between items-center">
              <h3 className="text-sm font-black text-gray-800 uppercase">Shift Management</h3>
              <button onClick={() => setShowAddShift(true)} className="bg-indigo-600 text-white px-4 py-2 rounded-xl hover:bg-indigo-700 font-black text-[10px] shadow-lg">CREATE SHIFT</button>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {shifts.map(s => (
                <div key={s.id} className="bg-white p-4 rounded-2xl border shadow-sm group">
                  <div className="flex justify-between items-start mb-2">
                    <h4 className="font-black text-gray-800 uppercase tracking-tight">{s.name}</h4>
                    <span className="bg-indigo-50 text-indigo-600 px-1.5 py-0.5 rounded text-[8px] font-bold">{s.type}</span>
                  </div>
                  <div className="text-[10px] font-bold text-gray-400">{s.startTime} - {s.endTime}</div>
                  <div className="mt-3 flex justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button onClick={async () => { if(confirm('Delete shift?')) { await deleteDoc(doc(db, 'organisations', user.orgId, 'shifts', s.id)); setShifts(prev => prev.filter(x => x.id !== s.id)); } }} className="text-red-400 font-bold hover:text-red-600">Delete</button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {activeSubTab === 'roles' && (
          <div className="space-y-6">
            <div className="flex justify-between items-center">
              <h3 className="text-sm font-black text-gray-800 uppercase">Access Control</h3>
              <button onClick={() => setShowAddRole(true)} className="bg-indigo-600 text-white px-4 py-2 rounded-xl hover:bg-indigo-700 font-black text-[10px] shadow-lg">CREATE ROLE</button>
            </div>

            <div className="grid grid-cols-1 gap-6">
              {roles.map(role => (
                <div key={role.id} className="bg-white rounded-2xl border shadow-sm p-5">
                  <div className="flex justify-between items-center mb-5">
                    <h4 className="text-xs font-black text-indigo-600 uppercase tracking-widest">{role.name} Rights</h4>
                    <button onClick={async () => { if(confirm('Delete role?')) { await deleteDoc(doc(db, 'organisations', user.orgId, 'roles', role.id)); setRoles(r => r.filter(x => x.id !== role.id)); } }} className="text-red-400 hover:text-red-600 font-bold">REMOVE ROLE</button>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-[9px] border-collapse">
                      <thead>
                        <tr className="border-b">
                          <th className="py-2 text-gray-400 font-black uppercase">Module</th>
                          {['View', 'Create', 'Edit', 'Delete', 'Full'].map(r => <th key={r} className="py-2 text-center text-gray-400 font-black uppercase">{r}</th>)}
                        </tr>
                      </thead>
                      <tbody>
                        {modules.map(mod => (
                          <tr key={mod} className="border-b last:border-0 hover:bg-gray-50/50 transition-colors">
                            <td className="py-2.5 font-black text-gray-700">{mod}</td>
                            {['view', 'create', 'edit', 'delete', 'full'].map(right => (
                              <td key={right} className="py-2.5 text-center">
                                <input type="checkbox" checked={role.permissions?.[mod]?.[right] || false} onChange={() => togglePermission(role.id, mod, right)} className="w-3.5 h-3.5 rounded text-indigo-600 focus:ring-indigo-500 cursor-pointer" />
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Add Employee Modal */}
      <Modal isOpen={showAddEmployee} onClose={() => setShowAddEmployee(false)} title="Register Employee">
        <div className="p-4 space-y-3 max-w-sm mx-auto">
          {['name', 'empCode', 'department', 'site', 'bankAccount'].map(f => (
            <div key={f}>
              <label className="block text-[9px] font-black text-gray-400 uppercase mb-1">{f === 'bankAccount' ? 'Bank A/c No' : f}</label>
              <input type="text" value={newEmployee[f]} onChange={e => setNewEmployee(s => ({ ...s, [f]: e.target.value }))} className="w-full border rounded-lg px-3 py-2 text-xs focus:ring-1 focus:ring-indigo-500 outline-none font-bold bg-gray-50" />
            </div>
          ))}
          <div>
            <label className="block text-[9px] font-black text-gray-400 uppercase mb-1">Status</label>
            <div className="flex bg-gray-100 p-1 rounded-xl">
              <button onClick={() => setNewEmployee(s => ({ ...s, status: 'Active' }))} className={`flex-1 py-1 rounded-lg text-[9px] font-black transition-all ${newEmployee.status === 'Active' ? 'bg-white shadow text-green-600' : 'text-gray-400'}`}>ACTIVE</button>
              <button onClick={() => setNewEmployee(s => ({ ...s, status: 'Inactive' }))} className={`flex-1 py-1 rounded-lg text-[9px] font-black transition-all ${newEmployee.status === 'Inactive' ? 'bg-white shadow text-red-600' : 'text-gray-400'}`}>INACTIVE</button>
            </div>
          </div>
          <button onClick={handleAddEmployee} disabled={saving} className="w-full bg-indigo-600 text-white font-black py-2.5 rounded-xl shadow-lg hover:bg-indigo-700 mt-2">REGISTER</button>
        </div>
      </Modal>

      {/* Edit Employee Modal */}
      <Modal isOpen={!!editingEmp} onClose={() => setEditingEmp(null)} title="Modify Employee">
        <div className="p-4 space-y-4 max-w-sm mx-auto">
          <div>
            <label className="block text-[9px] font-black text-gray-400 uppercase mb-1">Bank A/c No</label>
            <input type="text" value={editForm.bankAccount || ''} onChange={e => setEditForm(s => ({ ...s, bankAccount: e.target.value }))} className="w-full border rounded-lg px-3 py-2 text-xs focus:ring-1 focus:ring-indigo-500 outline-none font-bold bg-gray-50" />
          </div>
          <div>
            <label className="block text-[9px] font-black text-gray-400 uppercase mb-1">Status</label>
            <div className="flex bg-gray-100 p-1 rounded-xl">
              <button onClick={() => setEditForm(s => ({ ...s, status: 'Active' }))} className={`flex-1 py-1.5 rounded-lg text-[10px] font-black transition-all ${editForm.status === 'Active' ? 'bg-white shadow text-green-600' : 'text-gray-400'}`}>ACTIVE</button>
              <button onClick={() => setEditForm(s => ({ ...s, status: 'Inactive' }))} className={`flex-1 py-1.5 rounded-lg text-[10px] font-black transition-all ${editForm.status === 'Inactive' ? 'bg-white shadow text-red-600' : 'text-gray-400'}`}>INACTIVE</button>
            </div>
          </div>
          <button onClick={handleSaveEmployee} className="w-full bg-indigo-600 text-white font-black py-2.5 rounded-xl shadow-lg hover:bg-indigo-700">SAVE ALL</button>
        </div>
      </Modal>

      <Modal isOpen={showAddShift} onClose={() => setShowAddShift(false)} title="New Shift">
        <div className="p-4 space-y-4 max-w-sm mx-auto">
          <input type="text" placeholder="Shift Name" value={newShift.name} onChange={e => setNewShift(s => ({ ...s, name: e.target.value }))} className="w-full border rounded-lg px-3 py-2 text-xs focus:ring-1 focus:ring-indigo-500 outline-none font-bold bg-gray-50" />
          <div className="grid grid-cols-2 gap-3">
            <input type="time" value={newShift.startTime} onChange={e => setNewShift(s => ({ ...s, startTime: e.target.value }))} className="w-full border rounded-lg px-3 py-2 text-xs focus:ring-1 focus:ring-indigo-500 outline-none bg-gray-50" />
            <input type="time" value={newShift.endTime} onChange={e => setNewShift(s => ({ ...s, endTime: e.target.value }))} className="w-full border rounded-lg px-3 py-2 text-xs focus:ring-1 focus:ring-indigo-500 outline-none bg-gray-50" />
          </div>
          <button onClick={handleAddShift} className="w-full bg-indigo-600 text-white font-black py-2.5 rounded-xl shadow-lg hover:bg-indigo-700">CREATE</button>
        </div>
      </Modal>

      <Modal isOpen={showAddRole} onClose={() => setShowAddRole(false)} title="New Access Role">
        <div className="p-4 space-y-4 max-w-sm mx-auto">
          <input type="text" value={newRole.name} onChange={e => setNewRole(s => ({ ...s, name: e.target.value }))} className="w-full border rounded-lg px-3 py-2 text-xs focus:ring-1 focus:ring-indigo-500 outline-none font-bold bg-gray-50" placeholder="Role Name (e.g. HR Manager)" />
          <button onClick={handleAddRole} className="w-full bg-indigo-600 text-white font-black py-2.5 rounded-xl shadow-lg hover:bg-indigo-700 uppercase">Authorize Role</button>
        </div>
      </Modal>
    </div>
  )
}
