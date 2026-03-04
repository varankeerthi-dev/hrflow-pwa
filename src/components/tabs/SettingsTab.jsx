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
    name: '', empCode: '', department: '', shiftId: '', workHours: 9, site: '', employmentType: 'Full-time', monthlySalary: 0, status: 'Active', joinedDate: '', bloodGroup: ''
  })
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

  useEffect(() => {
    if (!user?.orgId) return
    getDocs(collection(db, 'organisations', user.orgId, 'shifts')).then(snap => {
      setShifts(snap.docs.map(d => ({ id: d.id, ...d.data() })))
      setLoading(false)
    })
    getDoc(doc(db, 'organisations', user.orgId)).then(snap => {
      if (snap.exists()) {
        const data = snap.data()
        setOrgSettings(prev => ({ ...prev, ...data }))
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
      name: '', empCode: '', department: '', shiftId: '', workHours: 9, site: '', employmentType: 'Full-time', monthlySalary: 0, status: 'Active', joinedDate: '', bloodGroup: ''
    })
    setSaving(false)
  }

  const handleSaveOrg = async () => {
    if (!user?.orgId) { setOrgError('No organisation ID found. Please re-login.'); return }
    setSaving(true)
    setOrgError('')
    const payload = {
      name: orgSettings.name || '',
      slug: orgSettings.slug || '',
      color: orgSettings.color || '#6366f1',
      shiftStrategy: orgSettings.shiftStrategy || 'Day',
      shifts: orgSettings.shifts || null
    }
    try {
      await setDoc(doc(db, 'organisations', user.orgId), payload, { merge: true })
      setSaved(true)
      setTimeout(() => setSaved(false), 2500)
    } catch (err) {
      console.error('Org save failed:', err)
      setOrgError(err.message || 'Save failed. Check Firestore rules.')
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
          className={`px-4 py-2 rounded-lg font-medium transition-colors ${activeSubTab === 'organization' ? 'bg-indigo-500 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
        >
          🏢 Organization
        </button>
        <button
          onClick={() => setActiveSubTab('employee')}
          className={`px-4 py-2 rounded-lg font-medium transition-colors ${activeSubTab === 'employee' ? 'bg-indigo-500 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
        >
          👤 Employees
        </button>
        <button
          onClick={() => setActiveSubTab('shift')}
          className={`px-4 py-2 rounded-lg font-medium transition-colors ${activeSubTab === 'shift' ? 'bg-indigo-500 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
        >
          🕐 Shifts
        </button>
      </div>

      <div className="flex-1 overflow-auto">
        {/* Organization Settings */}
        {activeSubTab === 'organization' && (
          <div className="bg-white rounded-xl shadow p-6 max-w-lg space-y-6">
            <h3 className="text-lg font-semibold text-gray-800">Organization Settings</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1.5">Organization Name</label>
                <input
                  type="text"
                  value={orgSettings.name || ''}
                  onChange={e => setOrgSettings(s => ({ ...s, name: e.target.value }))}
                  className="w-full border rounded-lg px-4 py-2 focus:ring-2 focus:ring-indigo-500 outline-none"
                  placeholder="TechCorp India"
                />
              </div>
              <div>
                <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1.5">Slug</label>
                <input
                  type="text"
                  value={orgSettings.slug || ''}
                  onChange={e => setOrgSettings(s => ({ ...s, slug: e.target.value }))}
                  className="w-full border rounded-lg px-4 py-2 focus:ring-2 focus:ring-indigo-500 outline-none"
                  placeholder="techcorp"
                />
              </div>
            </div>

            <div className="border-t pt-4">
              <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-3">Shift Strategy</label>
              <div className="flex bg-gray-100 p-1 rounded-xl mb-4">
                <button
                  onClick={() => setOrgSettings(s => ({ ...s, shiftStrategy: 'Day' }))}
                  className={`flex-1 py-2 rounded-lg text-xs font-bold transition-all ${orgSettings.shiftStrategy === 'Day' ? 'bg-white shadow text-indigo-600' : 'text-gray-500'}`}
                >
                  Day Shift
                </button>
                <button
                  onClick={() => setOrgSettings(s => ({ ...s, shiftStrategy: 'Overnight' }))}
                  className={`flex-1 py-2 rounded-lg text-xs font-bold transition-all ${orgSettings.shiftStrategy === 'Overnight' ? 'bg-white shadow text-indigo-600' : 'text-gray-500'}`}
                >
                  Overnight Shift
                </button>
              </div>

              {orgSettings.shiftStrategy === 'Day' ? (
                <div className="bg-indigo-50 p-4 rounded-xl border border-indigo-100 grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-[10px] font-bold text-indigo-400 uppercase">In Time</label>
                    <input
                      type="time"
                      value={orgSettings.shifts?.shift1?.startTime || '09:00'}
                      onChange={e => setOrgSettings(s => ({ ...s, shifts: { ...s.shifts, shift1: { ...s.shifts?.shift1, startTime: e.target.value } } }))}
                      className="w-full border-none bg-transparent font-mono text-lg focus:ring-0"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] font-bold text-indigo-400 uppercase">Out Time</label>
                    <input
                      type="time"
                      value={orgSettings.shifts?.shift1?.endTime || '18:00'}
                      onChange={e => setOrgSettings(s => ({ ...s, shifts: { ...s.shifts, shift1: { ...s.shifts?.shift1, endTime: e.target.value } } }))}
                      className="w-full border-none bg-transparent font-mono text-lg focus:ring-0"
                    />
                  </div>
                </div>
              ) : (
                <div className="space-y-2">
                  {[1, 2, 3].map(num => (
                    <div key={num} className="bg-purple-50 p-3 rounded-xl border border-purple-100 grid grid-cols-3 gap-2 items-center">
                      <span className="text-[10px] font-bold text-purple-400 uppercase">Shift {num}</span>
                      <input
                        type="time"
                        value={orgSettings.shifts?.[`shift${num}`]?.startTime || '00:00'}
                        onChange={e => setOrgSettings(s => ({ ...s, shifts: { ...s.shifts, [`shift${num}`]: { ...s.shifts?.[`shift${num}`], startTime: e.target.value } } }))}
                        className="border rounded px-2 py-1 text-xs font-mono"
                      />
                      <input
                        type="time"
                        value={orgSettings.shifts?.[`shift${num}`]?.endTime || '00:00'}
                        onChange={e => setOrgSettings(s => ({ ...s, shifts: { ...s.shifts, [`shift${num}`]: { ...s.shifts?.[`shift${num}`], endTime: e.target.value } } }))}
                        className="border rounded px-2 py-1 text-xs font-mono"
                      />
                    </div>
                  ))}
                </div>
              )}
            </div>

            <button
              onClick={handleSaveOrg}
              disabled={saving}
              className={`w-full py-3 rounded-xl font-bold transition-all shadow-md disabled:opacity-50 ${saved ? 'bg-green-500 text-white' : 'bg-indigo-600 text-white hover:bg-indigo-700'}`}
            >
              {saving ? 'Saving...' : saved ? 'Saved ✓' : 'Save Changes'}
            </button>
            {orgError && <div className="text-red-500 text-xs font-bold text-center mt-2">⚠️ {orgError}</div>}
          </div>
        )}

        {/* Employee Settings */}
        {activeSubTab === 'employee' && (
          <div className="space-y-4">
            <div className="flex justify-between items-center">
              <h3 className="text-lg font-semibold text-gray-800">Employees</h3>
              <button
                onClick={() => setShowAddEmployee(true)}
                className="bg-indigo-500 text-white px-4 py-2 rounded-lg hover:bg-indigo-600 font-bold text-sm shadow-md"
              >
                + Add Employee
              </button>
            </div>

            <div className="bg-white rounded-xl shadow overflow-hidden">
              <table className="w-full text-left text-sm">
                <thead className="bg-gray-50 border-b">
                  <tr>
                    {['Employee', 'Emp ID', 'Department', 'Shift', 'Work Hrs', 'Site', 'Actions'].map(h => (
                      <th key={h} className="px-4 py-3 text-[10px] font-bold text-gray-400 uppercase tracking-widest">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {empLoading ? (
                    <tr><td colSpan={7} className="text-center py-20"><Spinner /></td></tr>
                  ) : employees.map(emp => (
                    <tr key={emp.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-full flex items-center justify-center text-white text-[10px] font-bold" style={{ backgroundColor: getAvatarColor(emp.id) }}>{getInitials(emp.name)}</div>
                          <span className="font-semibold text-gray-700">{emp.name}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3 font-mono text-gray-500">{emp.empCode}</td>
                      <td className="px-4 py-3 text-gray-600">{emp.department}</td>
                      <td className="px-4 py-3 text-gray-600">{editingEmp === emp.id ? (
                        <select value={editForm.shiftId || ''} onChange={e => setEditForm(f => ({ ...f, shiftId: e.target.value }))} className="border rounded px-2 py-1 text-xs">
                          {shifts.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                        </select>
                      ) : emp.shift?.name || '-'}</td>
                      <td className="px-4 py-3 text-gray-600">{emp.workHours}h</td>
                      <td className="px-4 py-3 text-gray-600">{emp.site}</td>
                      <td className="px-4 py-3 text-right">
                        <button onClick={() => { setEditingEmp(emp.id); setEditForm(emp); }} className="text-indigo-600 font-bold hover:underline">Edit</button>
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
          <div className="space-y-4">
            <div className="flex justify-between items-center">
              <h3 className="text-lg font-semibold text-gray-800">Shifts</h3>
              <button onClick={() => setShowAddShift(true)} className="bg-indigo-500 text-white px-4 py-2 rounded-lg hover:bg-indigo-600 font-bold text-sm shadow-md">+ Add Shift</button>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {shifts.map(s => (
                <div key={s.id} className="bg-white p-4 rounded-xl shadow-sm border border-gray-100">
                  <h4 className="font-bold text-gray-800">{s.name}</h4>
                  <div className="text-xs text-gray-400 mt-1">{s.type} • {s.startTime} - {s.endTime}</div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Modals placed globally */}
      <Modal isOpen={showAddShift} onClose={() => setShowAddShift(false)} title="Add New Shift">
        <div className="space-y-3 p-4">
          <input type="text" placeholder="Shift Name" value={newShift.name} onChange={e => setNewShift(s => ({ ...s, name: e.target.value }))} className="w-full border rounded-lg px-4 py-2" />
          <select value={newShift.type} onChange={e => setNewShift(s => ({ ...s, type: e.target.value }))} className="w-full border rounded-lg px-4 py-2">
            <option value="Day">Day</option>
            <option value="Overnight">Overnight</option>
          </select>
          <div className="grid grid-cols-2 gap-4">
            <input type="time" value={newShift.startTime} onChange={e => setNewShift(s => ({ ...s, startTime: e.target.value }))} className="w-full border rounded-lg px-4 py-2" />
            <input type="time" value={newShift.endTime} onChange={e => setNewShift(s => ({ ...s, endTime: e.target.value }))} className="w-full border rounded-lg px-4 py-2" />
          </div>
          <button onClick={handleAddShift} className="w-full bg-indigo-600 text-white font-bold py-2 rounded-lg shadow-md hover:bg-indigo-700">Create Shift</button>
        </div>
      </Modal>

      <Modal isOpen={showAddEmployee} onClose={() => setShowAddEmployee(false)} title="Add New Employee">
        <div className="p-4 space-y-4 max-w-lg mx-auto">
          {[
            { label: 'Full Name', key: 'name', type: 'text', placeholder: 'e.g. John Doe' },
            { label: 'Emp ID', key: 'empCode', type: 'text', placeholder: 'e.g. TC001' },
            { label: 'Department', key: 'department', type: 'text', placeholder: 'e.g. Operations' },
            { label: 'Site', key: 'site', type: 'text', placeholder: 'e.g. Main Office' }
          ].map(f => (
            <div key={f.key} className="flex items-center gap-4">
              <label className="w-1/3 text-[10px] font-bold text-gray-400 text-right uppercase tracking-tighter">{f.label}</label>
              <input type={f.type} placeholder={f.placeholder} value={newEmployee[f.key]} onChange={e => setNewEmployee(s => ({ ...s, [f.key]: e.target.value }))} className="flex-1 border border-gray-200 rounded-lg px-4 py-2 text-sm focus:ring-2 focus:ring-indigo-500 outline-none" />
            </div>
          ))}

          <div className="flex items-center gap-4">
            <label className="w-1/3 text-[10px] font-bold text-gray-400 text-right uppercase tracking-tighter">Blood Group</label>
            <select value={newEmployee.bloodGroup} onChange={e => setNewEmployee(s => ({ ...s, bloodGroup: e.target.value }))} className="flex-1 border border-gray-200 rounded-lg px-4 py-2 text-sm">
              <option value="">Select...</option>
              {['A+', 'A-', 'B+', 'B-', 'O+', 'O-', 'AB+', 'AB-'].map(bg => <option key={bg} value={bg}>{bg}</option>)}
            </select>
          </div>

          <div className="flex items-center gap-4">
            <label className="w-1/3 text-[10px] font-bold text-gray-400 text-right uppercase tracking-tighter">Join Date</label>
            <input type="date" value={newEmployee.joinedDate} onChange={e => setNewEmployee(s => ({ ...s, joinedDate: e.target.value }))} className="flex-1 border border-gray-200 rounded-lg px-4 py-2 text-sm" />
          </div>

          <div className="flex items-center gap-4">
            <label className="w-1/3 text-[10px] font-bold text-gray-400 text-right uppercase tracking-tighter">Document</label>
            <div className="flex-1">
              <input type="file" className="hidden" id="doc-upload" />
              <label htmlFor="doc-upload" className="w-full border-2 border-dashed border-gray-100 rounded-lg px-4 py-2 text-[10px] font-bold text-gray-400 flex items-center justify-center gap-2 cursor-pointer hover:bg-gray-50">📁 Upload ID / Addhaar</label>
            </div>
          </div>

          <button onClick={handleAddEmployee} disabled={saving} className="w-full bg-gradient-to-r from-indigo-500 to-purple-600 text-white font-bold py-3 rounded-xl shadow-lg hover:shadow-xl transition-all disabled:opacity-50 mt-4">
            {saving ? 'Processing...' : 'Register Employee'}
          </button>
        </div>
      </Modal>
    </div>
  )
}
