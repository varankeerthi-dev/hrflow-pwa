import { useState, useEffect } from 'react'
import { useAuth } from '../../hooks/useAuth'
import { useEmployees } from '../../hooks/useEmployees'
import { db } from '../../lib/firebase'
import { collection, getDocs, addDoc, updateDoc, doc, getDoc, setDoc, serverTimestamp, query, where, deleteDoc } from 'firebase/firestore'
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
    name: '', empCode: '', department: '', shiftId: '', workHours: 9, site: '', employmentType: 'Full-time', monthlySalary: 0, status: 'Active', joinedDate: '', bloodGroup: ''
  })
  const [newRole, setNewRole] = useState({ name: '', permissions: {} })
  const [orgSettings, setOrgSettings] = useState({
    name: '',
    slug: '',
    color: '#6366f1',
    shiftStrategy: 'Day',
    shifts: {
      shift1: { startTime: '09:00', endTime: '18:00' },
      shift2: { startTime: '14:00', endTime: '23:00' },
      shift3: { startTime: '22:00', endTime: '07:00' }
    }
  })
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [orgError, setOrgError] = useState('')

  const modules = ['Attendance', 'Correction', 'Approvals', 'Summary', 'Settings', 'Employees', 'Roles', 'Shifts']

  useEffect(() => {
    if (!user?.orgId) return
    const fetchData = async () => {
      setLoading(true)
      const shiftsSnap = await getDocs(collection(db, 'organisations', user.orgId, 'shifts'))
      setShifts(shiftsSnap.docs.map(d => ({ id: d.id, ...d.data() })))
      
      const rolesSnap = await getDocs(collection(db, 'organisations', user.orgId, 'roles'))
      setRoles(rolesSnap.docs.map(d => ({ id: d.id, ...d.data() })))
      
      const orgSnap = await getDoc(doc(db, 'organisations', user.orgId))
      if (orgSnap.exists()) {
        setOrgSettings(prev => ({ ...prev, ...orgSnap.data() }))
      }
      setLoading(false)
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
      name: '', empCode: '', department: '', shiftId: '', workHours: 9, site: '', employmentType: 'Full-time', monthlySalary: 0, status: 'Active', joinedDate: '', bloodGroup: ''
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

  const togglePermission = (roleId, module, right) => {
    setRoles(prev => prev.map(r => {
      if (r.id !== roleId) return r
      const permissions = { ...r.permissions }
      if (!permissions[module]) permissions[module] = {}
      permissions[module][right] = !permissions[module][right]
      
      // Update Firestore
      updateDoc(doc(db, 'organisations', user.orgId, 'roles', roleId), { permissions })
      
      return { ...r, permissions }
    }))
  }

  const handleSaveOrg = async () => {
    if (!user?.orgId) { setOrgError('No organisation ID found. Please re-login.'); return }
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
    <div className="h-full flex flex-col text-xs">
      <div className="flex gap-2 mb-4 flex-wrap">
        {['organization', 'employee', 'shift', 'roles'].map(tab => (
          <button
            key={tab}
            onClick={() => setActiveSubTab(tab)}
            className={`px-4 py-2 rounded-xl font-bold transition-all uppercase tracking-tighter ${activeSubTab === tab ? 'bg-indigo-600 text-white shadow-lg' : 'bg-white text-gray-500 hover:bg-gray-50 border'}`}
          >
            {tab === 'organization' ? '🏢 Org' : tab === 'employee' ? '👤 Emps' : tab === 'shift' ? '🕐 Shifts' : '🔑 Roles'}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-auto">
        {activeSubTab === 'organization' && (
          <div className="bg-white rounded-2xl border p-6 max-w-lg space-y-6 shadow-sm">
            <h3 className="text-lg font-black text-gray-800">Organization Settings</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1.5">Organization Name</label>
                <input type="text" value={orgSettings.name || ''} onChange={e => setOrgSettings(s => ({ ...s, name: e.target.value }))} className="w-full border rounded-xl px-4 py-2 focus:ring-2 focus:ring-indigo-500 outline-none font-bold" />
              </div>
            </div>
            <button onClick={handleSaveOrg} disabled={saving} className={`w-full py-3 rounded-xl font-black transition-all shadow-lg disabled:opacity-50 ${saved ? 'bg-green-500 text-white' : 'bg-indigo-600 text-white hover:bg-indigo-700'}`}>
              {saving ? 'Saving...' : saved ? 'Saved ✓' : 'Save Changes'}
            </button>
          </div>
        )}

        {activeSubTab === 'employee' && (
          <div className="space-y-4">
            <div className="flex justify-between items-center">
              <h3 className="text-lg font-black text-gray-800">Employees</h3>
              <button onClick={() => setShowAddEmployee(true)} className="bg-indigo-600 text-white px-4 py-2 rounded-xl hover:bg-indigo-700 font-black text-[10px] shadow-lg">+ ADD EMPLOYEE</button>
            </div>
            <div className="bg-white rounded-2xl border shadow-sm overflow-hidden">
              <table className="w-full text-left text-[11px]">
                <thead className="bg-gray-50 border-b">
                  <tr>
                    {['Employee', 'Department', 'Status', 'Actions'].map(h => <th key={h} className="px-4 py-3 text-[10px] font-bold text-gray-400 uppercase tracking-widest">{h}</th>)}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {empLoading ? (
                    <tr><td colSpan={4} className="text-center py-10"><Spinner /></td></tr>
                  ) : employees.map(emp => (
                    <tr key={emp.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3 flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full flex items-center justify-center text-white text-[10px] font-black" style={{ backgroundColor: getAvatarColor(emp.id) }}>{getInitials(emp.name)}</div>
                        <span className="font-bold text-gray-700">{emp.name}</span>
                      </td>
                      <td className="px-4 py-3 text-gray-600 font-medium">{emp.department}</td>
                      <td className="px-4 py-3">
                        <span className={`px-2 py-0.5 rounded-full text-[9px] font-black ${emp.status === 'Active' ? 'bg-green-100 text-green-600' : 'bg-red-100 text-red-600'}`}>{emp.status}</span>
                      </td>
                      <td className="px-4 py-3"><button onClick={() => { setEditingEmp(emp.id); setEditForm(emp); }} className="text-indigo-600 font-black hover:underline">EDIT</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {activeSubTab === 'roles' && (
          <div className="space-y-6">
            <div className="flex justify-between items-center">
              <h3 className="text-lg font-black text-gray-800">Roles & Permissions</h3>
              <button onClick={() => setShowAddRole(true)} className="bg-indigo-600 text-white px-4 py-2 rounded-xl hover:bg-indigo-700 font-black text-[10px] shadow-lg">+ CREATE ROLE</button>
            </div>

            <div className="space-y-8">
              {roles.map(role => (
                <div key={role.id} className="bg-white rounded-2xl border shadow-sm p-6">
                  <div className="flex justify-between items-center mb-6">
                    <h4 className="text-sm font-black text-indigo-600 uppercase tracking-wider">{role.name} Permissions</h4>
                    <button onClick={async () => { if(confirm('Delete role?')) { await deleteDoc(doc(db, 'organisations', user.orgId, 'roles', role.id)); setRoles(r => r.filter(x => x.id !== role.id)); } }} className="text-red-400 hover:text-red-600 font-bold">Delete</button>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-[10px] border-collapse">
                      <thead>
                        <tr className="border-b">
                          <th className="py-2 text-gray-400 font-bold uppercase">Module</th>
                          {['View', 'Create', 'Edit', 'Delete', 'Full'].map(r => <th key={r} className="py-2 text-center text-gray-400 font-bold uppercase">{r}</th>)}
                        </tr>
                      </thead>
                      <tbody>
                        {modules.map(mod => (
                          <tr key={mod} className="border-b last:border-0 hover:bg-gray-50">
                            <td className="py-3 font-bold text-gray-700">{mod}</td>
                            {['view', 'create', 'edit', 'delete', 'full'].map(right => (
                              <td key={right} className="py-3 text-center">
                                <input 
                                  type="checkbox" 
                                  checked={role.permissions?.[mod]?.[right] || false} 
                                  onChange={() => togglePermission(role.id, mod, right)}
                                  className="w-4 h-4 rounded text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                                />
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
      <Modal isOpen={showAddEmployee} onClose={() => setShowAddEmployee(false)} title="New Employee">
        <div className="p-4 space-y-4 max-w-sm mx-auto">
          {['name', 'empCode', 'department', 'site'].map(f => (
            <div key={f}>
              <label className="block text-[10px] font-bold text-gray-400 uppercase mb-1">{f}</label>
              <input type="text" value={newEmployee[f]} onChange={e => setNewEmployee(s => ({ ...s, [f]: e.target.value }))} className="w-full border rounded-xl px-3 py-2 text-xs focus:ring-2 focus:ring-indigo-500 outline-none" />
            </div>
          ))}
          <div>
            <label className="block text-[10px] font-bold text-gray-400 uppercase mb-1">Status</label>
            <div className="flex bg-gray-100 p-1 rounded-xl">
              <button onClick={() => setNewEmployee(s => ({ ...s, status: 'Active' }))} className={`flex-1 py-1.5 rounded-lg text-[10px] font-black transition-all ${newEmployee.status === 'Active' ? 'bg-white shadow text-green-600' : 'text-gray-400'}`}>ACTIVE</button>
              <button onClick={() => setNewEmployee(s => ({ ...s, status: 'Inactive' }))} className={`flex-1 py-1.5 rounded-lg text-[10px] font-black transition-all ${newEmployee.status === 'Inactive' ? 'bg-white shadow text-red-600' : 'text-gray-400'}`}>INACTIVE</button>
            </div>
          </div>
          <button onClick={handleAddEmployee} disabled={saving} className="w-full bg-indigo-600 text-white font-black py-3 rounded-2xl shadow-lg hover:bg-indigo-700 transition-all text-xs">CREATE EMPLOYEE</button>
        </div>
      </Modal>

      {/* Edit Employee Modal */}
      <Modal isOpen={!!editingEmp} onClose={() => setEditingEmp(null)} title="Edit Employee">
        <div className="p-4 space-y-4 max-w-sm mx-auto">
          <div>
            <label className="block text-[10px] font-bold text-gray-400 uppercase mb-1">Status</label>
            <div className="flex bg-gray-100 p-1 rounded-xl">
              <button onClick={() => setEditForm(s => ({ ...s, status: 'Active' }))} className={`flex-1 py-1.5 rounded-lg text-[10px] font-black transition-all ${editForm.status === 'Active' ? 'bg-white shadow text-green-600' : 'text-gray-400'}`}>ACTIVE</button>
              <button onClick={() => setEditForm(s => ({ ...s, status: 'Inactive' }))} className={`flex-1 py-1.5 rounded-lg text-[10px] font-black transition-all ${editForm.status === 'Inactive' ? 'bg-white shadow text-red-600' : 'text-gray-400'}`}>INACTIVE</button>
            </div>
          </div>
          <button onClick={handleSaveEmployee} className="w-full bg-indigo-600 text-white font-black py-3 rounded-2xl shadow-lg hover:bg-indigo-700 transition-all text-xs">SAVE CHANGES</button>
        </div>
      </Modal>

      {/* Add Role Modal */}
      <Modal isOpen={showAddRole} onClose={() => setShowAddRole(false)} title="Create New Role">
        <div className="p-4 space-y-4 max-w-sm mx-auto">
          <div>
            <label className="block text-[10px] font-bold text-gray-400 uppercase mb-1">Role Name</label>
            <input type="text" value={newRole.name} onChange={e => setNewRole(s => ({ ...s, name: e.target.value }))} className="w-full border rounded-xl px-3 py-2 text-xs focus:ring-2 focus:ring-indigo-500 outline-none" placeholder="e.g. Operations Manager" />
          </div>
          <button onClick={handleAddRole} className="w-full bg-indigo-600 text-white font-black py-3 rounded-2xl shadow-lg hover:bg-indigo-700 transition-all text-xs">CREATE ROLE</button>
        </div>
      </Modal>
    </div>
  )
}
