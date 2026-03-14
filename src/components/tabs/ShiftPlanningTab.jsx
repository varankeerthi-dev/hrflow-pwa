import React, { useState, useEffect, useMemo, useCallback } from 'react'
import { useAuth } from '../../hooks/useAuth'
import { useEmployees } from '../../hooks/useEmployees'
import { db } from '../../lib/firebase'
import { collection, addDoc, getDocs, query, doc, updateDoc, deleteDoc, serverTimestamp, orderBy } from 'firebase/firestore'
import Spinner from '../ui/Spinner'
import Modal from '../ui/Modal'
import TimePicker from '../ui/TimePicker'
import { 
  Calendar, Plus, Search, Edit2, Trash2, Eye, ChevronLeft, ChevronRight,
  Clock, MapPin, Users, FileText, Save, X, Check, Upload, Building2
} from 'lucide-react'

function formatDateShort(isoDate) {
  if (!isoDate) return ''
  const date = new Date(isoDate)
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
  const day = String(date.getDate()).padStart(2, '0')
  return `${day}-${months[date.getMonth()].slice(0, 3)}-${String(date.getFullYear()).slice(-2)}`
}

function formatDateFull(isoDate) {
  if (!isoDate) return ''
  const date = new Date(isoDate)
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
  return `${date.getDate()} ${months[date.getMonth()]} ${date.getFullYear()}`
}

const PLANNING_TYPES = {
  DAY: 'Day Planning',
  WEEKLY: 'Weekly Planning',
  NEXT_FEW: 'Next Few Days Planning'
}

const DAYS_OF_WEEK = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']

function getWeekDates(startDate) {
  const start = new Date(startDate)
  const dates = []
  for (let i = 0; i < 7; i++) {
    const d = new Date(start)
    d.setDate(start.getDate() + i)
    dates.push(d.toISOString().split('T')[0])
  }
  return dates
}

// ── CREATE PLANNING FORM ───────────────────────────────────────────────
function CreatePlanningForm({ type, onClose, onSave, loading, employees, branches, departments }) {
  const [form, setForm] = useState({
    title: '',
    message: '',
    branch: '',
    department: '',
    publishDate: new Date().toISOString().split('T')[0],
    visibility: 'all',
    shiftDate: new Date().toISOString().split('T')[0],
    weekStart: new Date().toISOString().split('T')[0],
    startDate: new Date().toISOString().split('T')[0],
    endDate: new Date().toISOString().split('T')[0],
    attachmentURL: '',
    attachmentName: '',
  })

  const [shifts, setShifts] = useState([])
  const [uploading, setUploading] = useState(false)
  const [shiftTiming, setShiftTiming] = useState('day') // 'day' or 'night'
  const [defaultShiftTimes, setDefaultShiftTimes] = useState({ inTime: '09:00', outTime: '18:00' })
  const [showDefaultInTimePicker, setShowDefaultInTimePicker] = useState(false)
  const [showDefaultOutTimePicker, setShowDefaultOutTimePicker] = useState(false)
  const [showShiftInTimePicker, setShowShiftInTimePicker] = useState(null)
  const [showShiftOutTimePicker, setShowShiftOutTimePicker] = useState(null)

  // Update default times when shift timing changes
  useEffect(() => {
    if (shiftTiming === 'day') {
      setDefaultShiftTimes({ inTime: '09:00', outTime: '18:00' })
    } else {
      setDefaultShiftTimes({ inTime: '14:00', outTime: '22:00' })
    }
  }, [shiftTiming])

  const filteredEmployees = useMemo(() => {
    let emps = employees
    if (form.branch) emps = emps.filter(e => e.site === form.branch)
    if (form.department) emps = emps.filter(e => e.department === form.department)
    return emps
  }, [employees, form.branch, form.department])

  // Generate weekly dates
  const weekDates = useMemo(() => {
    return getWeekDates(form.weekStart)
  }, [form.weekStart])

  // Generate dates for "Next Few Days"
  const dateRange = useMemo(() => {
    const dates = []
    const start = new Date(form.startDate)
    const end = new Date(form.endDate)
    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
      dates.push(d.toISOString().split('T')[0])
    }
    return dates
  }, [form.startDate, form.endDate])

  const addEmployee = (emp) => {
    if (shifts.find(s => s.employeeId === emp.id)) return
    
    if (type === PLANNING_TYPES.WEEKLY) {
      const weekShifts = weekDates.map(date => ({
        employeeId: emp.id,
        employeeName: emp.name,
        date,
        day: DAYS_OF_WEEK[new Date(date).getDay() === 0 ? 6 : new Date(date).getDay() - 1],
        inTime: '',
        outTime: '',
        site: '',
        notes: ''
      }))
      setShifts(prev => [...prev, ...weekShifts])
    } else if (type === PLANNING_TYPES.NEXT_FEW) {
      const rangeShifts = dateRange.map(date => ({
        employeeId: emp.id,
        employeeName: emp.name,
        date,
        inTime: '',
        outTime: '',
        site: '',
        notes: ''
      }))
      setShifts(prev => [...prev, ...rangeShifts])
    } else {
      setShifts(prev => [...prev, {
        employeeId: emp.id,
        employeeName: emp.name,
        date: form.shiftDate,
        inTime: defaultShiftTimes.inTime,
        outTime: defaultShiftTimes.outTime,
        site: '',
        notes: ''
      }])
    }
  }

  const updateShift = (index, field, value) => {
    setShifts(prev => prev.map((s, i) => i === index ? { ...s, [field]: value } : s))
  }

  const removeShift = (index) => {
    setShifts(prev => prev.filter((_, i) => i !== index))
  }

  const handleFileUpload = async (e) => {
    const file = e.target.files[0]
    if (!file) return
    setUploading(true)
    try {
      // For now, just store filename - in production would upload to storage
      setForm(f => ({ ...f, attachmentName: file.name }))
    } finally {
      setUploading(false)
    }
  }

  const handleSubmit = () => {
    if (!form.title.trim()) { alert('Please enter a title'); return }
    if (shifts.length === 0) { alert('Please add at least one employee'); return }
    
    const planningData = {
      type,
      title: form.title,
      message: form.message,
      branch: form.branch || '',
      department: form.department || '',
      publishDate: form.publishDate,
      visibility: form.visibility,
      attachmentURL: form.attachmentURL,
      attachmentName: form.attachmentName,
      shifts: shifts.map(s => ({
        ...s,
        inTime: s.inTime || '',
        outTime: s.outTime || '',
        site: s.site || '',
        notes: s.notes || ''
      })),
      createdAt: serverTimestamp()
    }
    
    onSave(planningData)
  }

  const uniqueEmployeeShifts = useMemo(() => {
    const seen = new Set()
    return shifts.filter(s => {
      if (type === PLANNING_TYPES.WEEKLY || type === PLANNING_TYPES.NEXT_FEW) {
        const key = s.employeeId
        if (seen.has(key)) return false
        seen.add(key)
        return true
      }
      return true
    })
  }, [shifts, type])

  return (
    <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center overflow-auto py-8">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-5xl mx-4 max-h-[90vh] overflow-hidden flex flex-col">
        <div className="bg-indigo-600 px-6 py-4 flex justify-between items-center shrink-0">
          <h3 className="text-white font-black text-[13px] uppercase tracking-wide">Create {type}</h3>
          <button onClick={onClose} className="text-white/80 hover:text-white">
            <X size={18} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* Common Fields - Top */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-[10px] font-bold text-gray-500 uppercase mb-1">Title *</label>
              <input
                type="text"
                value={form.title}
                onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
                placeholder="Shift planning announcement title"
                className="w-full h-10 border border-gray-200 rounded-lg px-3 text-xs font-semibold"
              />
            </div>
            <div>
              <label className="block text-[10px] font-bold text-gray-500 uppercase mb-1">Publish Date</label>
              <input
                type="date"
                value={form.publishDate}
                onChange={e => setForm(f => ({ ...f, publishDate: e.target.value }))}
                className="w-full h-10 border border-gray-200 rounded-lg px-3 text-xs font-semibold"
              />
            </div>
          </div>

          {/* Employee Assignment - Right after title */}
          <div className="border border-gray-200 rounded-xl p-4">
            <div className="flex justify-between items-center mb-4">
              <h4 className="text-xs font-black text-gray-700 uppercase">Employee Shift Assignment</h4>
              <div className="flex items-center gap-2">
                <select
                  onChange={e => {
                    const emp = employees.find(emp => emp.id === e.target.value)
                    if (emp) addEmployee(emp)
                    e.target.value = ''
                  }}
                  className="h-9 border border-gray-200 rounded-lg px-3 text-xs font-semibold"
                >
                  <option value="">Add Employee...</option>
                  {filteredEmployees.filter(e => !shifts.find(s => s.employeeId === e.id)).map(emp => (
                    <option key={emp.id} value={emp.id}>{emp.name}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* Day Planning Quick Add Row */}
            {type === PLANNING_TYPES.DAY && (
              <div className="bg-indigo-50 border border-indigo-100 rounded-lg p-3 mb-4">
                <div className="grid grid-cols-4 gap-3">
                  <div>
                    <label className="block text-[10px] font-bold text-indigo-600 uppercase mb-1">Shift Date *</label>
                    <input
                      type="date"
                      value={form.shiftDate}
                      onChange={e => setForm(f => ({ ...f, shiftDate: e.target.value }))}
                      className="w-full h-9 border border-indigo-200 rounded-lg px-2 text-xs font-semibold"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-indigo-600 uppercase mb-1">Shift</label>
                    <select
                      value={shiftTiming}
                      onChange={e => setShiftTiming(e.target.value)}
                      className="w-full h-9 border border-indigo-200 rounded-lg px-2 text-xs font-semibold"
                    >
                      <option value="day">Day</option>
                      <option value="night">Night</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-indigo-600 uppercase mb-1">Shift Starts</label>
                    <div className="relative">
                      <button
                        onClick={() => setShowDefaultInTimePicker(!showDefaultInTimePicker)}
                        className="w-full h-9 border border-indigo-200 rounded-lg px-2 text-xs font-semibold text-left flex items-center justify-between"
                      >
                        <span>{defaultShiftTimes.inTime ? (() => {
                          const [h, m] = defaultShiftTimes.inTime.split(':').map(Number)
                          const p = h >= 12 ? 'PM' : 'AM'
                          const h12 = h % 12 || 12
                          return `${h12}:${String(m).padStart(2, '0')} ${p}`
                        })() : 'Select time'}</span>
                      </button>
                      {showDefaultInTimePicker && (
                        <TimePicker
                          value={defaultShiftTimes.inTime || '09:00'}
                          onChange={(time) => setDefaultShiftTimes(prev => ({ ...prev, inTime: time }))}
                          onClose={() => setShowDefaultInTimePicker(false)}
                        />
                      )}
                    </div>
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-indigo-600 uppercase mb-1">Shift Ends</label>
                    <div className="relative">
                      <button
                        onClick={() => setShowDefaultOutTimePicker(!showDefaultOutTimePicker)}
                        className="w-full h-9 border border-indigo-200 rounded-lg px-2 text-xs font-semibold text-left flex items-center justify-between"
                      >
                        <span>{defaultShiftTimes.outTime ? (() => {
                          const [h, m] = defaultShiftTimes.outTime.split(':').map(Number)
                          const p = h >= 12 ? 'PM' : 'AM'
                          const h12 = h % 12 || 12
                          return `${h12}:${String(m).padStart(2, '0')} ${p}`
                        })() : 'Select time'}</span>
                      </button>
                      {showDefaultOutTimePicker && (
                        <TimePicker
                          value={defaultShiftTimes.outTime || '18:00'}
                          onChange={(time) => setDefaultShiftTimes(prev => ({ ...prev, outTime: time }))}
                          onClose={() => setShowDefaultOutTimePicker(false)}
                        />
                      )}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {shifts.length === 0 ? (
              <div className="text-center py-8 text-gray-300 italic text-xs">
                No employees added yet. Use the dropdown above to add employees.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-[10px]">
                  <thead>
                    <tr className="bg-gray-50 border-b border-gray-200">
                      <th className="px-3 py-2 font-black text-gray-500 uppercase">Employee</th>
                      {type === PLANNING_TYPES.WEEKLY && <th className="px-3 py-2 font-black text-gray-500 uppercase">Day</th>}
                      {type === PLANNING_TYPES.NEXT_FEW && <th className="px-3 py-2 font-black text-gray-500 uppercase">Date</th>}
                      <th className="px-3 py-2 font-black text-gray-500 uppercase">Shift Start</th>
                      <th className="px-3 py-2 font-black text-gray-500 uppercase">Shift End</th>
                      <th className="px-3 py-2 font-black text-gray-500 uppercase">Site</th>
                      <th className="px-3 py-2 font-black text-gray-500 uppercase">Notes</th>
                      <th className="px-3 py-2"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {shifts.map((shift, idx) => (
                      <tr key={idx} className="hover:bg-gray-50">
                        <td className="px-3 py-2 font-semibold text-gray-700">{shift.employeeName}</td>
                        {type === PLANNING_TYPES.WEEKLY && (
                          <td className="px-3 py-2 font-medium text-gray-600">{shift.day}</td>
                        )}
                        {type === PLANNING_TYPES.NEXT_FEW && (
                          <td className="px-3 py-2 font-medium text-gray-600">{formatDateShort(shift.date)}</td>
                        )}
                        <td className="px-3 py-2">
                          <div className="relative">
                            <button
                              onClick={() => setShowShiftInTimePicker(showShiftInTimePicker === idx ? null : idx)}
                              className="h-7 border border-gray-200 rounded px-2 text-xs font-semibold text-left flex items-center justify-between min-w-[80px]"
                            >
                              <span>{shift.inTime ? (() => {
                                const [h, m] = shift.inTime.split(':').map(Number)
                                const p = h >= 12 ? 'PM' : 'AM'
                                const h12 = h % 12 || 12
                                return `${h12}:${String(m).padStart(2, '0')} ${p}`
                              })() : '--:--'}</span>
                            </button>
                            {showShiftInTimePicker === idx && (
                              <TimePicker
                                value={shift.inTime || '09:00'}
                                onChange={(time) => updateShift(idx, 'inTime', time)}
                                onClose={() => setShowShiftInTimePicker(null)}
                              />
                            )}
                          </div>
                        </td>
                        <td className="px-3 py-2">
                          <div className="relative">
                            <button
                              onClick={() => setShowShiftOutTimePicker(showShiftOutTimePicker === idx ? null : idx)}
                              className="h-7 border border-gray-200 rounded px-2 text-xs font-semibold text-left flex items-center justify-between min-w-[80px]"
                            >
                              <span>{shift.outTime ? (() => {
                                const [h, m] = shift.outTime.split(':').map(Number)
                                const p = h >= 12 ? 'PM' : 'AM'
                                const h12 = h % 12 || 12
                                return `${h12}:${String(m).padStart(2, '0')} ${p}`
                              })() : '--:--'}</span>
                            </button>
                            {showShiftOutTimePicker === idx && (
                              <TimePicker
                                value={shift.outTime || '18:00'}
                                onChange={(time) => updateShift(idx, 'outTime', time)}
                                onClose={() => setShowShiftOutTimePicker(null)}
                              />
                            )}
                          </div>
                        </td>
                        <td className="px-3 py-2">
                          <input
                            type="text"
                            value={shift.site}
                            onChange={e => updateShift(idx, 'site', e.target.value)}
                            placeholder="Office"
                            className="h-7 border border-gray-200 rounded px-2 text-xs font-semibold w-24"
                          />
                        </td>
                        <td className="px-3 py-2">
                          <input
                            type="text"
                            value={shift.notes}
                            onChange={e => updateShift(idx, 'notes', e.target.value)}
                            placeholder="Notes"
                            className="h-7 border border-gray-200 rounded px-2 text-xs font-semibold w-24"
                          />
                        </td>
                        <td className="px-3 py-2">
                          <button onClick={() => removeShift(idx)} className="p-1 text-red-400 hover:text-red-600">
                            <Trash2 size={12} />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Announcement Message */}
          <div>
            <label className="block text-[10px] font-bold text-gray-500 uppercase mb-1">Announcement Message</label>
            <textarea
              value={form.message}
              onChange={e => setForm(f => ({ ...f, message: e.target.value }))}
              placeholder="Enter announcement details..."
              rows={3}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-xs font-semibold resize-none"
            />
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="block text-[10px] font-bold text-gray-500 uppercase mb-1">Branch / Location</label>
              <select
                value={form.branch}
                onChange={e => setForm(f => ({ ...f, branch: e.target.value }))}
                className="w-full h-10 border border-gray-200 rounded-lg px-3 text-xs font-semibold"
              >
                <option value="">All Branches</option>
                {branches.map(b => <option key={b} value={b}>{b}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-[10px] font-bold text-gray-500 uppercase mb-1">Department</label>
              <select
                value={form.department}
                onChange={e => setForm(f => ({ ...f, department: e.target.value }))}
                className="w-full h-10 border border-gray-200 rounded-lg px-3 text-xs font-semibold"
              >
                <option value="">All Departments</option>
                {departments.map(d => <option key={d} value={d}>{d}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-[10px] font-bold text-gray-500 uppercase mb-1">Visibility</label>
              <select
                value={form.visibility}
                onChange={e => setForm(f => ({ ...f, visibility: e.target.value }))}
                className="w-full h-10 border border-gray-200 rounded-lg px-3 text-xs font-semibold"
              >
                <option value="all">All Employees</option>
                <option value="branch">Specific Branch</option>
                <option value="department">Specific Department</option>
              </select>
            </div>
          </div>

          <div className="flex items-center gap-4">
            <div className="flex-1">
              <label className="block text-[10px] font-bold text-gray-500 uppercase mb-1">Attachment</label>
              <label className="flex items-center gap-2 h-10 border border-gray-200 rounded-lg px-3 cursor-pointer hover:bg-gray-50">
                <Upload size={14} className="text-gray-400" />
                <span className="text-xs text-gray-500 truncate">{form.attachmentName || 'Upload file...'}</span>
                <input type="file" className="hidden" onChange={handleFileUpload} disabled={uploading} />
              </label>
            </div>
          </div>

          {/* Type-specific date fields - Weekly and Next Few Days */}
          {type === PLANNING_TYPES.WEEKLY && (
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-[10px] font-bold text-gray-500 uppercase mb-1">Week Start Date *</label>
                <input
                  type="date"
                  value={form.weekStart}
                  onChange={e => setForm(f => ({ ...f, weekStart: e.target.value }))}
                  className="w-full h-10 border border-gray-200 rounded-lg px-3 text-xs font-semibold"
                />
              </div>
              <div>
                <label className="block text-[10px] font-bold text-gray-500 uppercase mb-1">Week End Date</label>
                <input
                  type="text"
                  value={weekDates.length > 0 ? formatDateShort(weekDates[6]) : ''}
                  readOnly
                  className="w-full h-10 border border-gray-200 rounded-lg px-3 text-xs font-semibold bg-gray-50"
                />
              </div>
            </div>
          )}

          {type === PLANNING_TYPES.NEXT_FEW && (
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-[10px] font-bold text-gray-500 uppercase mb-1">Start Date *</label>
                <input
                  type="date"
                  value={form.startDate}
                  onChange={e => setForm(f => ({ ...f, startDate: e.target.value }))}
                  className="w-full h-10 border border-gray-200 rounded-lg px-3 text-xs font-semibold"
                />
              </div>
              <div>
                <label className="block text-[10px] font-bold text-gray-500 uppercase mb-1">End Date *</label>
                <input
                  type="date"
                  value={form.endDate}
                  onChange={e => setForm(f => ({ ...f, endDate: e.target.value }))}
                  className="w-full h-10 border border-gray-200 rounded-lg px-3 text-xs font-semibold"
                />
              </div>
            </div>
          )}

          {/* Attachment */}
          <div className="flex items-center gap-4">
            <div className="flex-1">
              <label className="block text-[10px] font-bold text-gray-500 uppercase mb-1">Attachment</label>
              <label className="flex items-center gap-2 h-10 border border-gray-200 rounded-lg px-3 cursor-pointer hover:bg-gray-50">
                <Upload size={14} className="text-gray-400" />
                <span className="text-xs text-gray-500 truncate">{form.attachmentName || 'Upload file...'}</span>
                <input type="file" className="hidden" onChange={handleFileUpload} disabled={uploading} />
              </label>
            </div>
          </div>
        </div>

        <div className="px-6 py-4 border-t border-gray-100 flex justify-end gap-3 shrink-0">
          <button
            onClick={onClose}
            className="h-10 px-5 border border-gray-200 text-gray-600 rounded-lg text-xs font-bold uppercase hover:bg-gray-50"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={loading}
            className="h-10 px-6 bg-indigo-600 text-white rounded-lg text-xs font-bold uppercase hover:bg-indigo-700 disabled:opacity-50"
          >
            {loading ? 'Creating...' : 'Create Planning'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── VIEW PLANNING MODAL ─────────────────────────────────────────────────
function ViewPlanningModal({ planning, onClose, onEdit }) {
  if (!planning) return null

  const periodDisplay = () => {
    if (planning.type === PLANNING_TYPES.DAY) {
      return formatDateShort(planning.shiftDate || planning.shifts?.[0]?.date)
    } else if (planning.type === PLANNING_TYPES.WEEKLY) {
      const dates = planning.shifts?.filter(s => s.day === 'Monday').map(s => s.date) || []
      const dates2 = planning.shifts?.filter(s => s.day === 'Sunday').map(s => s.date) || []
      return dates[0] ? `${formatDateShort(dates[0])} → ${dates2[0] ? formatDateShort(dates2[0]) : ''}` : ''
    } else {
      const dates = planning.shifts?.map(s => s.date) || []
      const uniqueDates = [...new Set(dates)].sort()
      return uniqueDates.length > 0 ? `${formatDateShort(uniqueDates[0])} → ${formatDateShort(uniqueDates[uniqueDates.length - 1])}` : ''
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center overflow-auto py-8">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl mx-4 max-h-[90vh] overflow-hidden flex flex-col">
        <div className="bg-indigo-600 px-6 py-4 flex justify-between items-center shrink-0">
          <h3 className="text-white font-black text-[13px] uppercase tracking-wide">View {planning.type}</h3>
          <button onClick={onClose} className="text-white/80 hover:text-white">
            <X size={18} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* Header Info */}
          <div className="bg-gray-50 rounded-xl p-4">
            <h2 className="text-lg font-black text-gray-800">{planning.title}</h2>
            <div className="flex items-center gap-4 mt-2 text-[10px] text-gray-500">
              <span className="flex items-center gap-1"><Calendar size={12} /> {periodDisplay()}</span>
              <span className="flex items-center gap-1"><Users size={12} /> {planning.shifts?.length || 0} assignments</span>
              <span className="flex items-center gap-1"><Building2 size={12} /> {planning.visibility === 'all' ? 'All Employees' : planning.visibility}</span>
            </div>
          </div>

          {planning.message && (
            <div>
              <h4 className="text-[10px] font-bold text-gray-500 uppercase mb-2">Message</h4>
              <p className="text-sm text-gray-700">{planning.message}</p>
            </div>
          )}

          {/* Shift Table */}
          <div>
            <h4 className="text-[10px] font-bold text-gray-500 uppercase mb-2">Employee Shift Details</h4>
            <div className="overflow-x-auto border border-gray-200 rounded-xl">
              <table className="w-full text-left border-collapse text-[10px]">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-200">
                    <th className="px-3 py-2 font-black text-gray-500 uppercase">Employee</th>
                    {planning.type === PLANNING_TYPES.WEEKLY && <th className="px-3 py-2 font-black text-gray-500 uppercase">Day</th>}
                    {planning.type === PLANNING_TYPES.NEXT_FEW && <th className="px-3 py-2 font-black text-gray-500 uppercase">Date</th>}
                    <th className="px-3 py-2 font-black text-gray-500 uppercase">Shift Time</th>
                    <th className="px-3 py-2 font-black text-gray-500 uppercase">Site</th>
                    <th className="px-3 py-2 font-black text-gray-500 uppercase">Notes</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {planning.shifts?.map((shift, idx) => (
                    <tr key={idx} className="hover:bg-gray-50">
                      <td className="px-3 py-2 font-semibold text-gray-700">{shift.employeeName}</td>
                      {planning.type === PLANNING_TYPES.WEEKLY && (
                        <td className="px-3 py-2 font-medium text-gray-600">{shift.day}</td>
                      )}
                      {planning.type === PLANNING_TYPES.NEXT_FEW && (
                        <td className="px-3 py-2 font-medium text-gray-600">{formatDateShort(shift.date)}</td>
                      )}
                      <td className="px-3 py-2 font-mono text-gray-600">
                        {shift.inTime && shift.outTime ? `${shift.inTime} - ${shift.outTime}` : '-'}
                      </td>
                      <td className="px-3 py-2 text-gray-600">{shift.site || '-'}</td>
                      <td className="px-3 py-2 text-gray-500">{shift.notes || '-'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Footer Info */}
          <div className="flex items-center justify-between text-[10px] text-gray-400 pt-4 border-t border-gray-100">
            <span>Created by: {planning.createdByName || 'HR'}</span>
            <span>Created: {planning.createdAt?.toDate ? formatDateFull(planning.createdAt.toDate()) : ''}</span>
          </div>
        </div>

        <div className="px-6 py-4 border-t border-gray-100 flex justify-between shrink-0">
          <button
            onClick={onClose}
            className="h-10 px-5 border border-gray-200 text-gray-600 rounded-lg text-xs font-bold uppercase hover:bg-gray-50"
          >
            Close
          </button>
          <button
            onClick={() => { onClose(); onEdit(planning); }}
            className="h-10 px-5 bg-indigo-600 text-white rounded-lg text-xs font-bold uppercase hover:bg-indigo-700"
          >
            Edit Planning
          </button>
        </div>
      </div>
    </div>
  )
}

// ── EDIT PLANNING FORM ───────────────────────────────────────────────────
function EditPlanningForm({ planning, onClose, onSave, loading, employees, branches, departments }) {
  const [form, setForm] = useState({
    title: planning.title || '',
    message: planning.message || '',
    branch: planning.branch || '',
    department: planning.department || '',
    publishDate: planning.publishDate || new Date().toISOString().split('T')[0],
    visibility: planning.visibility || 'all',
    attachmentName: planning.attachmentName || '',
  })

  const [shifts, setShifts] = useState(planning.shifts || [])
  const [showShiftInTimePicker, setShowShiftInTimePicker] = useState(null)
  const [showShiftOutTimePicker, setShowShiftOutTimePicker] = useState(null)

  const updateShift = (index, field, value) => {
    setShifts(prev => prev.map((s, i) => i === index ? { ...s, [field]: value } : s))
  }

  const removeShift = (index) => {
    setShifts(prev => prev.filter((_, i) => i !== index))
  }

  const handleSubmit = () => {
    if (!form.title.trim()) { alert('Please enter a title'); return }
    if (shifts.length === 0) { alert('Please add at least one employee'); return }
    
    const planningData = {
      ...planning,
      title: form.title,
      message: form.message,
      branch: form.branch || '',
      department: form.department || '',
      publishDate: form.publishDate,
      visibility: form.visibility,
      attachmentName: form.attachmentName,
      shifts: shifts.map(s => ({
        ...s,
        inTime: s.inTime || '',
        outTime: s.outTime || '',
        site: s.site || '',
        notes: s.notes || ''
      })),
      updatedAt: serverTimestamp()
    }
    
    onSave(planningData)
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center overflow-auto py-8">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-5xl mx-4 max-h-[90vh] overflow-hidden flex flex-col">
        <div className="bg-orange-500 px-6 py-4 flex justify-between items-center shrink-0">
          <h3 className="text-white font-black text-[13px] uppercase tracking-wide">Edit {planning.type}</h3>
          <button onClick={onClose} className="text-white/80 hover:text-white">
            <X size={18} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* Common Fields */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-[10px] font-bold text-gray-500 uppercase mb-1">Title *</label>
              <input
                type="text"
                value={form.title}
                onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
                className="w-full h-10 border border-gray-200 rounded-lg px-3 text-xs font-semibold"
              />
            </div>
            <div>
              <label className="block text-[10px] font-bold text-gray-500 uppercase mb-1">Publish Date</label>
              <input
                type="date"
                value={form.publishDate}
                onChange={e => setForm(f => ({ ...f, publishDate: e.target.value }))}
                className="w-full h-10 border border-gray-200 rounded-lg px-3 text-xs font-semibold"
              />
            </div>
          </div>

          <div>
            <label className="block text-[10px] font-bold text-gray-500 uppercase mb-1">Announcement Message</label>
            <textarea
              value={form.message}
              onChange={e => setForm(f => ({ ...f, message: e.target.value }))}
              rows={3}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-xs font-semibold resize-none"
            />
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="block text-[10px] font-bold text-gray-500 uppercase mb-1">Branch / Location</label>
              <select
                value={form.branch}
                onChange={e => setForm(f => ({ ...f, branch: e.target.value }))}
                className="w-full h-10 border border-gray-200 rounded-lg px-3 text-xs font-semibold"
              >
                <option value="">All Branches</option>
                {branches.map(b => <option key={b} value={b}>{b}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-[10px] font-bold text-gray-500 uppercase mb-1">Visibility</label>
              <select
                value={form.visibility}
                onChange={e => setForm(f => ({ ...f, visibility: e.target.value }))}
                className="w-full h-10 border border-gray-200 rounded-lg px-3 text-xs font-semibold"
              >
                <option value="all">All Employees</option>
                <option value="branch">Specific Branch</option>
                <option value="department">Specific Department</option>
              </select>
            </div>
          </div>

          {/* Shift Table - Editable */}
          <div className="border border-gray-200 rounded-xl p-4">
            <h4 className="text-xs font-black text-gray-700 uppercase mb-4">Edit Employee Shifts</h4>
            
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-[10px]">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-200">
                    <th className="px-3 py-2 font-black text-gray-500 uppercase">Employee</th>
                    {planning.type === PLANNING_TYPES.WEEKLY && <th className="px-3 py-2 font-black text-gray-500 uppercase">Day</th>}
                    {planning.type === PLANNING_TYPES.NEXT_FEW && <th className="px-3 py-2 font-black text-gray-500 uppercase">Date</th>}
                    <th className="px-3 py-2 font-black text-gray-500 uppercase">Shift Start</th>
                    <th className="px-3 py-2 font-black text-gray-500 uppercase">Shift End</th>
                    <th className="px-3 py-2 font-black text-gray-500 uppercase">Site</th>
                    <th className="px-3 py-2 font-black text-gray-500 uppercase">Notes</th>
                    <th className="px-3 py-2"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {shifts.map((shift, idx) => (
                    <tr key={idx} className="hover:bg-gray-50">
                      <td className="px-3 py-2 font-semibold text-gray-700">{shift.employeeName}</td>
                      {planning.type === PLANNING_TYPES.WEEKLY && (
                        <td className="px-3 py-2 font-medium text-gray-600">{shift.day}</td>
                      )}
                      {planning.type === PLANNING_TYPES.NEXT_FEW && (
                        <td className="px-3 py-2 font-medium text-gray-600">{formatDateShort(shift.date)}</td>
                      )}
                      <td className="px-3 py-2">
                        <div className="relative">
                          <button
                            onClick={() => setShowShiftInTimePicker(showShiftInTimePicker === `edit-${idx}` ? null : `edit-${idx}`)}
                            className="h-7 border border-gray-200 rounded px-2 text-xs font-semibold text-left flex items-center justify-between min-w-[80px]"
                          >
                            <span>{shift.inTime ? (() => {
                              const [h, m] = shift.inTime.split(':').map(Number)
                              const p = h >= 12 ? 'PM' : 'AM'
                              const h12 = h % 12 || 12
                              return `${h12}:${String(m).padStart(2, '0')} ${p}`
                            })() : '--:--'}</span>
                          </button>
                          {showShiftInTimePicker === `edit-${idx}` && (
                            <TimePicker
                              value={shift.inTime || '09:00'}
                              onChange={(time) => updateShift(idx, 'inTime', time)}
                              onClose={() => setShowShiftInTimePicker(null)}
                            />
                          )}
                        </div>
                      </td>
                      <td className="px-3 py-2">
                        <div className="relative">
                          <button
                            onClick={() => setShowShiftOutTimePicker(showShiftOutTimePicker === `edit-${idx}` ? null : `edit-${idx}`)}
                            className="h-7 border border-gray-200 rounded px-2 text-xs font-semibold text-left flex items-center justify-between min-w-[80px]"
                          >
                            <span>{shift.outTime ? (() => {
                              const [h, m] = shift.outTime.split(':').map(Number)
                              const p = h >= 12 ? 'PM' : 'AM'
                              const h12 = h % 12 || 12
                              return `${h12}:${String(m).padStart(2, '0')} ${p}`
                            })() : '--:--'}</span>
                          </button>
                          {showShiftOutTimePicker === `edit-${idx}` && (
                            <TimePicker
                              value={shift.outTime || '18:00'}
                              onChange={(time) => updateShift(idx, 'outTime', time)}
                              onClose={() => setShowShiftOutTimePicker(null)}
                            />
                          )}
                        </div>
                      </td>
                      <td className="px-3 py-2">
                        <input
                          type="text"
                          value={shift.site}
                          onChange={e => updateShift(idx, 'site', e.target.value)}
                          className="h-7 border border-gray-200 rounded px-2 text-xs font-semibold w-24"
                        />
                      </td>
                      <td className="px-3 py-2">
                        <input
                          type="text"
                          value={shift.notes}
                          onChange={e => updateShift(idx, 'notes', e.target.value)}
                          className="h-7 border border-gray-200 rounded px-2 text-xs font-semibold w-24"
                        />
                      </td>
                      <td className="px-3 py-2">
                        <button onClick={() => removeShift(idx)} className="p-1 text-red-400 hover:text-red-600">
                          <Trash2 size={12} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        <div className="px-6 py-4 border-t border-gray-100 flex justify-end gap-3 shrink-0">
          <button
            onClick={onClose}
            className="h-10 px-5 border border-gray-200 text-gray-600 rounded-lg text-xs font-bold uppercase hover:bg-gray-50"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={loading}
            className="h-10 px-6 bg-orange-500 text-white rounded-lg text-xs font-bold uppercase hover:bg-orange-600 disabled:opacity-50"
          >
            {loading ? 'Saving...' : 'Save Changes'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── MAIN SHIFT PLANNING TAB ───────────────────────────────────────────────
export default function ShiftPlanningTab() {
  const { user } = useAuth()
  const { employees } = useEmployees(user?.orgId)
  
  const [plannings, setPlannings] = useState([])
  const [loading, setLoading] = useState(false)
  const [search, setSearch] = useState('')
  
  // Modals
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [createType, setCreateType] = useState(PLANNING_TYPES.DAY)
  const [viewPlanning, setViewPlanning] = useState(null)
  const [editPlanning, setEditPlanning] = useState(null)
  const [saving, setSaving] = useState(false)

  // Extract branches and departments
  const branches = useMemo(() => {
    const sites = [...new Set(employees.map(e => e.site).filter(Boolean))]
    return sites.length > 0 ? sites : ['Office', 'Warehouse', 'Remote']
  }, [employees])

  const departments = useMemo(() => {
    const depts = [...new Set(employees.map(e => e.department).filter(Boolean))]
    return depts.length > 0 ? depts : ['HR', 'Engineering', 'Sales', 'Marketing']
  }, [employees])

  const fetchPlannings = useCallback(async () => {
    if (!user?.orgId) return
    setLoading(true)
    try {
      const q = query(
        collection(db, 'organisations', user.orgId, 'shiftPlannings'),
        orderBy('createdAt', 'desc')
      )
      const snap = await getDocs(q)
      setPlannings(snap.docs.map(d => ({ id: d.id, ...d.data() })))
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }, [user?.orgId])

  useEffect(() => {
    fetchPlannings()
  }, [fetchPlannings])

  const handleCreate = async (planningData) => {
    setSaving(true)
    try {
      await addDoc(collection(db, 'organisations', user.orgId, 'shiftPlannings'), {
        ...planningData,
        createdBy: user.uid,
        createdByName: user.name,
      })
      setShowCreateModal(false)
      fetchPlannings()
    } catch (err) {
      alert('Failed to create planning: ' + err.message)
    } finally {
      setSaving(false)
    }
  }

  const handleEdit = async (planningData) => {
    setSaving(true)
    try {
      // Log revision
      await addDoc(collection(db, 'organisations', user.orgId, 'shiftPlanningRevisions'), {
        planningId: planningData.id,
        oldShifts: editPlanning.shifts,
        newShifts: planningData.shifts,
        editedBy: user.uid,
        editedByName: user.name,
        timestamp: serverTimestamp(),
      })
      
      await updateDoc(doc(db, 'organisations', user.orgId, 'shiftPlannings', planningData.id), planningData)
      setEditPlanning(null)
      fetchPlannings()
    } catch (err) {
      alert('Failed to update planning: ' + err.message)
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (id) => {
    if (!confirm('Are you sure you want to delete this planning?')) return
    try {
      await deleteDoc(doc(db, 'organisations', user.orgId, 'shiftPlannings', id))
      fetchPlannings()
    } catch (err) {
      alert('Failed to delete: ' + err.message)
    }
  }

  const getPeriodDisplay = (planning) => {
    if (planning.type === PLANNING_TYPES.DAY) {
      return planning.shifts?.[0]?.date ? formatDateShort(planning.shifts[0].date) : '-'
    } else if (planning.type === PLANNING_TYPES.WEEKLY) {
      const dates = planning.shifts?.filter(s => s.day === 'Monday').map(s => s.date) || []
      const dates2 = planning.shifts?.filter(s => s.day === 'Sunday').map(s => s.date) || []
      return dates[0] ? `${formatDateShort(dates[0])} → ${dates2[0] ? formatDateShort(dates2[0]) : ''}` : ''
    } else {
      const dates = [...new Set(planning.shifts?.map(s => s.date) || [])].sort()
      return dates.length > 0 ? `${formatDateShort(dates[0])} → ${formatDateShort(dates[dates.length - 1])}` : ''
    }
  }

  const filteredPlannings = plannings.filter(p => 
    p.title?.toLowerCase().includes(search.toLowerCase()) ||
    p.type?.toLowerCase().includes(search.toLowerCase())
  )

  return (
    <div className="h-full flex flex-col font-inter overflow-hidden bg-gray-50/50 p-6">
      {/* Page Header */}
      <div className="mb-4 shrink-0">
        <h1 className="text-lg font-black text-gray-800 uppercase tracking-tight">Shift Planning Announcements</h1>
        <p className="text-xs text-gray-500 mt-0.5">Create and manage shift plans for employees.</p>
      </div>

      {/* Action Buttons */}
      <div className="bg-white rounded-[12px] border border-gray-100 shadow-sm p-4 mb-4 flex flex-wrap gap-2 shrink-0">
        <button
          onClick={() => { setCreateType(PLANNING_TYPES.DAY); setShowCreateModal(true); }}
          className="h-[38px] px-5 bg-indigo-600 text-white rounded-lg text-[11px] font-bold uppercase hover:bg-indigo-700 transition-all shadow-md"
        >
          Day Planning
        </button>
        <button
          onClick={() => { setCreateType(PLANNING_TYPES.WEEKLY); setShowCreateModal(true); }}
          className="h-[38px] px-5 bg-indigo-600 text-white rounded-lg text-[11px] font-bold uppercase hover:bg-indigo-700 transition-all shadow-md"
        >
          Weekly Planning
        </button>
        <button
          onClick={() => { setCreateType(PLANNING_TYPES.NEXT_FEW); setShowCreateModal(true); }}
          className="h-[38px] px-5 bg-indigo-600 text-white rounded-lg text-[11px] font-bold uppercase hover:bg-indigo-700 transition-all shadow-md"
        >
          Next Few Days
        </button>
        
        <div className="flex-1"></div>
        
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              placeholder="Search plannings..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="h-[38px] pl-9 pr-3 border border-gray-200 rounded-lg text-xs font-semibold w-48"
            />
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="flex-1 bg-white rounded-[12px] border border-gray-100 shadow-sm overflow-hidden flex flex-col min-h-0">
        <div className="overflow-auto">
          {loading ? (
            <div className="flex justify-center py-20"><Spinner /></div>
          ) : filteredPlannings.length === 0 ? (
            <div className="text-center py-20 text-gray-300 italic text-xs">
              No shift planning announcements yet. Create one to get started.
            </div>
          ) : (
            <table className="w-full text-left border-collapse">
              <thead className="sticky top-0 bg-gray-50/95 backdrop-blur z-10 border-b border-gray-200">
                <tr className="h-[40px]">
                  <th className="px-4 text-[9px] font-black text-gray-500 uppercase tracking-wider">Type</th>
                  <th className="px-4 text-[9px] font-black text-gray-500 uppercase tracking-wider">Planning Period</th>
                  <th className="px-4 text-[9px] font-black text-gray-500 uppercase tracking-wider">Created By</th>
                  <th className="px-4 text-[9px] font-black text-gray-500 uppercase tracking-wider">Created Date</th>
                  <th className="px-4 text-[9px] font-black text-gray-500 uppercase tracking-wider text-center">View</th>
                  <th className="px-4 text-[9px] font-black text-gray-500 uppercase tracking-wider text-center">Edit</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filteredPlannings.map((planning) => (
                  <tr key={planning.id} className="h-[44px] hover:bg-gray-50/50 transition-colors">
                    <td className="px-4">
                      <span className={`px-2 py-1 rounded text-[8px] font-black uppercase ${
                        planning.type === PLANNING_TYPES.DAY ? 'bg-blue-100 text-blue-600' :
                        planning.type === PLANNING_TYPES.WEEKLY ? 'bg-purple-100 text-purple-600' :
                        'bg-amber-100 text-amber-600'
                      }`}>
                        {planning.type}
                      </span>
                    </td>
                    <td className="px-4 text-[11px] font-semibold text-gray-700">
                      {getPeriodDisplay(planning)}
                    </td>
                    <td className="px-4 text-[11px] font-medium text-gray-600">
                      {planning.createdByName || 'HR'}
                    </td>
                    <td className="px-4 text-[10px] text-gray-500">
                      {planning.createdAt?.toDate ? formatDateShort(planning.createdAt.toDate().toISOString()) : '-'}
                    </td>
                    <td className="px-4 text-center">
                      <button
                        onClick={() => setViewPlanning(planning)}
                        className="p-1.5 rounded-md text-indigo-600 hover:bg-indigo-50"
                        title="View"
                      >
                        <Eye size={14} />
                      </button>
                    </td>
                    <td className="px-4 text-center">
                      <div className="flex items-center justify-center gap-1">
                        <button
                          onClick={() => setEditPlanning(planning)}
                          className="p-1.5 rounded-md text-orange-600 hover:bg-orange-50"
                          title="Edit"
                        >
                          <Edit2 size={14} />
                        </button>
                        <button
                          onClick={() => handleDelete(planning.id)}
                          className="p-1.5 rounded-md text-red-400 hover:bg-red-50"
                          title="Delete"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* Create Modal */}
      {showCreateModal && (
        <CreatePlanningForm
          type={createType}
          onClose={() => setShowCreateModal(false)}
          onSave={handleCreate}
          loading={saving}
          employees={employees}
          branches={branches}
          departments={departments}
        />
      )}

      {/* View Modal */}
      {viewPlanning && (
        <ViewPlanningModal
          planning={viewPlanning}
          onClose={() => setViewPlanning(null)}
          onEdit={(p) => setEditPlanning(p)}
        />
      )}

      {/* Edit Modal */}
      {editPlanning && (
        <EditPlanningForm
          planning={editPlanning}
          onClose={() => setEditPlanning(null)}
          onSave={handleEdit}
          loading={saving}
          employees={employees}
          branches={branches}
          departments={departments}
        />
      )}
    </div>
  )
}
