import { useState, useEffect } from 'react'
import { useAuth } from '../../hooks/useAuth'
import { useEmployees } from '../../hooks/useEmployees'
import { db } from '../../lib/firebase'
import { collection, getDocs, addDoc, updateDoc, doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore'
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
  const [loading, setLoading] = useState(true)
  const [editingEmp, setEditingEmp] = useState(null)
  const [editForm, setEditForm] = useState({})
  const [showAddShift, setShowAddShift] = useState(false)
  const [showAddEmployee, setShowAddEmployee] = useState(false)
  const [newShift, setNewShift] = useState({ name: '', type: 'Day', startTime: '09:00', endTime: '18:00', workHours: 9 })
  const [newEmployee, setNewEmployee] = useState({
    name: '', empCode: '', department: '', shiftId: '', workHours: 9, site: '', employmentType: 'Full-time', monthlySalary: 0, status: 'Active', joinedDate: ''
  })
  const [orgSettings, setOrgSettings] = useState({ name: '', slug: '', color: '#6366f1' })
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    if (!user?.orgId) return
    getDocs(collection(db, 'organisations', user.orgId, 'shifts')).then(snap => {
      setShifts(snap.docs.map(d => ({ id: d.id, ...d.data() })))
      setLoading(false)
    })
    getDoc(doc(db, 'organisations', user.orgId)).then(snap => {
      if (snap.exists()) {
        setOrgSettings(snap.data())
      }
    })
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
      name: '', empCode: '', department: '', shiftId: '', workHours: 9, site: '', employmentType: 'Full-time', monthlySalary: 0, status: 'Active', joinedDate: ''
    })
    setSaving(false)
  }

  const handleSaveOrg = async () => {
    if (!user?.orgId) return
    setSaving(true)
    try {
      // Use setDoc+merge so it works even if the doc doesn't fully exist yet
      await setDoc(doc(db, 'organisations', user.orgId), orgSettings, { merge: true })
      setSaved(true)
      setTimeout(() => setSaved(false), 2500)
    } catch (err) {
      console.error('Org save failed:', err)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="h-full flex flex-col">
      {/* Sub-tab Switcher */}
      <div className="flex gap-2 mb-4 flex-wrap">
        <button
          onClick={() => setActiveSubTab('organization')}
          className={`px-4 py-2 rounded-lg font-medium transition-colors ${activeSubTab === 'organization' ? 'bg-indigo-500 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
        >
          🏢 Organization
        </button>
        <button
          onClick={() => setActiveSubTab('employee')}
          className={`px-4 py-2 rounded-lg font-medium transition-colors ${activeSubTab === 'employee' ? 'bg-indigo-500 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
        >
          👤 Employees
        </button>
        <button
          onClick={() => setActiveSubTab('shift')}
          className={`px-4 py-2 rounded-lg font-medium transition-colors ${activeSubTab === 'shift' ? 'bg-indigo-500 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
        >
          🕐 Shifts
        </button>
      </div>

      {/* Organization Settings */}
      {activeSubTab === 'organization' && (
        <div className="flex-1 overflow-auto">
          <div className="bg-white rounded-xl shadow p-6 max-w-lg">
            <h3 className="text-lg font-semibold mb-4">Organization Settings</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Organization Name</label>
                <input
                  type="text"
                  value={orgSettings.name || ''}
                  onChange={e => setOrgSettings(s => ({ ...s, name: e.target.value }))}
                  className="w-full border rounded-lg px-4 py-2"
                  placeholder="TechCorp India"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Slug</label>
                <input
                  type="text"
                  value={orgSettings.slug || ''}
                  onChange={e => setOrgSettings(s => ({ ...s, slug: e.target.value }))}
                  className="w-full border rounded-lg px-4 py-2"
                  placeholder="techcorp"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Brand Color</label>
                <div className="flex items-center gap-3">
                  <input
                    type="color"
                    value={orgSettings.color || '#6366f1'}
                    onChange={e => setOrgSettings(s => ({ ...s, color: e.target.value }))}
                    className="w-12 h-10 rounded cursor-pointer"
                  />
                  <input
                    type="text"
                    value={orgSettings.color || '#6366f1'}
                    onChange={e => setOrgSettings(s => ({ ...s, color: e.target.value }))}
                    className="border rounded-lg px-4 py-2 w-32 font-mono"
                  />
                </div>
              </div>
              <button
                onClick={handleSaveOrg}
                disabled={saving}
                className={`px-6 py-2 rounded-lg font-medium transition-all disabled:opacity-50 ${saved
                    ? 'bg-green-500 text-white'
                    : 'bg-indigo-500 text-white hover:bg-indigo-600'
                  }`}
              >
                {saving ? 'Saving...' : saved ? 'Saved ✓' : 'Save Organisation'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Employee Settings */}
      {activeSubTab === 'employee' && (
        <div className="flex-1 overflow-auto">
          <div className="flex justify-between items-center mb-4">
            <h3 className="text-lg font-semibold text-gray-800">Employees</h3>
            <button
              onClick={() => setShowAddEmployee(true)}
              className="bg-indigo-500 text-white px-4 py-2 rounded-lg hover:bg-indigo-600"
            >
              + Add Employee
            </button>
          </div>

          <div className="bg-white rounded-xl shadow">
            <table className="w-full">
              <thead className="bg-gray-50 sticky top-0">
                <tr>
                  {['Employee', 'Emp ID', 'Department', 'Shift', 'Work Hrs', 'Site', 'Actions'].map(h => (
                    <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-widest">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {empLoading ? (
                  <tr><td colSpan={7} className="text-center py-8"><Spinner /></td></tr>
                ) : employees.length === 0 ? (
                  <tr><td colSpan={7} className="text-center py-8 text-gray-400">No employees. Click "Add Employee" to create one.</td></tr>
                ) : employees.map(emp => (
                  <tr key={emp.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <div
                          className="w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold"
                          style={{ backgroundColor: getAvatarColor(emp.id) }}
                        >
                          {getInitials(emp.name)}
                        </div>
                        <span className="font-medium text-gray-800">{emp.name}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 font-mono text-sm text-gray-600">{emp.empCode}</td>
                    <td className="px-4 py-3 text-gray-600">{emp.department}</td>
                    <td className="px-4 py-3 text-gray-600">
                      {editingEmp === emp.id ? (
                        <select
                          value={editForm.shiftId || ''}
                          onChange={e => setEditForm(f => ({ ...f, shiftId: e.target.value }))}
                          className="border rounded px-2 py-1 text-sm"
                        >
                          <option value="">Select shift</option>
                          {shifts.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                        </select>
                      ) : emp.shift?.name || '-'}
                    </td>
                    <td className="px-4 py-3 text-gray-600">
                      {editingEmp === emp.id ? (
                        <input
                          type="number"
                          value={editForm.workHours || ''}
                          onChange={e => setEditForm(f => ({ ...f, workHours: parseInt(e.target.value) }))}
                          className="border rounded px-2 py-1 text-sm w-16"
                        />
                      ) : emp.workHours || '-'}
                    </td>
                    <td className="px-4 py-3 text-gray-600">
                      {editingEmp === emp.id ? (
                        <input
                          type="text"
                          value={editForm.site || ''}
                          onChange={e => setEditForm(f => ({ ...f, site: e.target.value }))}
                          className="border rounded px-2 py-1 text-sm"
                        />
                      ) : emp.site || '-'}
                    </td>
                    <td className="px-4 py-3">
                      {editingEmp === emp.id ? (
                        <div className="flex gap-2">
                          <button onClick={handleSaveEmployee} className="text-green-600 hover:bg-green-50 px-2 py-1 rounded text-sm font-medium">Save</button>
                          <button onClick={() => setEditingEmp(null)} className="text-gray-500 hover:bg-gray-100 px-2 py-1 rounded text-sm">Cancel</button>
                        </div>
                      ) : (
                        <button
                          onClick={() => { setEditingEmp(emp.id); setEditForm(emp); }}
                          className="text-indigo-600 hover:bg-indigo-50 px-2 py-1 rounded text-sm font-medium"
                        >
                          Edit
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Shift Settings */}
      {activeSubTab === 'shift' && (
        <div className="flex-1 overflow-auto">
          <div className="flex justify-between items-center mb-4">
            <h3 className="text-lg font-semibold text-gray-800">Shifts</h3>
            <button
              onClick={() => setShowAddShift(true)}
              className="bg-indigo-500 text-white px-4 py-2 rounded-lg hover:bg-indigo-600"
            >
              + Add Shift
            </button>
          </div>

          {loading ? (
            <div className="text-center py-8"><Spinner /></div>
          ) : (
            <div className="grid grid-cols-2 gap-4">
              {shifts.map(shift => (
                <div
                  key={shift.id}
                  className={`rounded-xl shadow p-4 ${shift.type === 'Overnight' ? 'bg-purple-50 border border-purple-200' : 'bg-blue-50 border border-blue-200'}`}
                >
                  <div className="flex justify-between items-start mb-3">
                    <div>
                      <h4 className="font-semibold text-gray-800">{shift.name}</h4>
                      <span className={`text-xs px-2 py-0.5 rounded-full ${shift.type === 'Overnight' ? 'bg-purple-200 text-purple-700' : 'bg-blue-200 text-blue-700'}`}>
                        {shift.type}
                      </span>
                    </div>
                  </div>
                  <div className="space-y-1 text-sm text-gray-600">
                    <div>Start: <span className="font-mono">{shift.startTime}</span></div>
                    <div>End: <span className="font-mono">{shift.endTime}</span></div>
                    <div>Work Hours: <span className="font-medium">{shift.workHours}h</span></div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Add Shift Modal */}
          <Modal isOpen={showAddShift} onClose={() => setShowAddShift(false)} title="Add New Shift">
            <div className="space-y-3">
              <input
                type="text"
                placeholder="Shift Name"
                value={newShift.name}
                onChange={e => setNewShift(s => ({ ...s, name: e.target.value }))}
                className="w-full border rounded-lg px-3 py-2"
              />
              <select
                value={newShift.type}
                onChange={e => setNewShift(s => ({ ...s, type: e.target.value }))}
                className="w-full border rounded-lg px-3 py-2"
              >
                <option value="Day">Day</option>
                <option value="Overnight">Overnight</option>
              </select>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-gray-500">Start Time</label>
                  <input
                    type="time"
                    value={newShift.startTime}
                    onChange={e => setNewShift(s => ({ ...s, startTime: e.target.value }))}
                    className="w-full border rounded-lg px-3 py-2"
                  />
                </div>
                <div>
                  <label className="text-xs text-gray-500">End Time</label>
                  <input
                    type="time"
                    value={newShift.endTime}
                    onChange={e => setNewShift(s => ({ ...s, endTime: e.target.value }))}
                    className="w-full border rounded-lg px-3 py-2"
                  />
                </div>
              </div>
              <input
                type="number"
                placeholder="Work Hours"
                value={newShift.workHours}
                onChange={e => setNewShift(s => ({ ...s, workHours: parseInt(e.target.value) }))}
                className="w-full border rounded-lg px-3 py-2"
              />
            </div>
            <div className="flex justify-end gap-3 mt-4">
              <button onClick={() => setShowAddShift(false)} className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg">Cancel</button>
              <button onClick={handleAddShift} className="px-4 py-2 bg-indigo-500 text-white rounded-lg hover:bg-indigo-600">Add</button>
            </div>
          </Modal>

          {/* Add Employee Modal */}
          <Modal isOpen={showAddEmployee} onClose={() => setShowAddEmployee(false)} title="Add New Employee">
            <div className="space-y-3">
              <input
                type="text"
                placeholder="Full Name"
                value={newEmployee.name}
                onChange={e => setNewEmployee(s => ({ ...s, name: e.target.value }))}
                className="w-full border rounded-lg px-3 py-2"
              />
              <input
                type="text"
                placeholder="Employee Code (e.g. TC001)"
                value={newEmployee.empCode}
                onChange={e => setNewEmployee(s => ({ ...s, empCode: e.target.value }))}
                className="w-full border rounded-lg px-3 py-2"
              />
              <input
                type="text"
                placeholder="Department"
                value={newEmployee.department}
                onChange={e => setNewEmployee(s => ({ ...s, department: e.target.value }))}
                className="w-full border rounded-lg px-3 py-2"
              />
              <select
                value={newEmployee.shiftId}
                onChange={e => setNewEmployee(s => ({ ...s, shiftId: e.target.value }))}
                className="w-full border rounded-lg px-3 py-2"
              >
                <option value="">Select Shift</option>
                {shifts.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
              <div className="grid grid-cols-2 gap-3">
                <input
                  type="number"
                  placeholder="Work Hours"
                  value={newEmployee.workHours}
                  onChange={e => setNewEmployee(s => ({ ...s, workHours: parseInt(e.target.value) }))}
                  className="w-full border rounded-lg px-3 py-2"
                />
                <input
                  type="text"
                  placeholder="Site"
                  value={newEmployee.site}
                  onChange={e => setNewEmployee(s => ({ ...s, site: e.target.value }))}
                  className="w-full border rounded-lg px-3 py-2"
                />
              </div>
              <input
                type="number"
                placeholder="Monthly Salary"
                value={newEmployee.monthlySalary}
                onChange={e => setNewEmployee(s => ({ ...s, monthlySalary: parseInt(e.target.value) }))}
                className="w-full border rounded-lg px-3 py-2"
              />
              <input
                type="date"
                placeholder="Join Date"
                value={newEmployee.joinedDate}
                onChange={e => setNewEmployee(s => ({ ...s, joinedDate: e.target.value }))}
                className="w-full border rounded-lg px-3 py-2"
              />
            </div>
            <div className="flex justify-end gap-3 mt-4">
              <button onClick={() => setShowAddEmployee(false)} className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg">Cancel</button>
              <button onClick={handleAddEmployee} disabled={saving} className="px-4 py-2 bg-indigo-500 text-white rounded-lg hover:bg-indigo-600 disabled:opacity-50">
                {saving ? 'Adding...' : 'Add Employee'}
              </button>
            </div>
          </Modal>
        </div>
      )}
    </div>
  )
}
