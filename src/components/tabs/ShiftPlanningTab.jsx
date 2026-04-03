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
          <div>
            <h3 className="text-white font-semibold text-[13px]">Create {type}</h3>
            <p className="text-[10px] text-indigo-200 mt-0.5">Shift Planning Management</p>
          </div>
          <button onClick={onClose} className="text-white/80 hover:text-white">
            <X size={18} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* Common Fields - Top */}
          <div className="grid grid-cols-2 gap-6">
            <div>
              <label className="block text-[12px] font-semibold text-gray-700 mb-2">Title <span className="text-rose-500">*</span></label>
              <input
                type="text"
                value={form.title}
                onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
                placeholder="Shift planning announcement title"
                className="w-full bg-gray-50/50 border border-gray-200 rounded-lg px-4 py-2.5 text-sm focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 focus:bg-white outline-none transition-all placeholder:text-gray-400"
              />
            </div>
            <div>
              <label className="block text-[12px] font-semibold text-gray-700 mb-2">Publish Date</label>
              <input
                type="date"
                value={form.publishDate}
                onChange={e => setForm(f => ({ ...f, publishDate: e.target.value }))}
                className="w-full bg-gray-50/50 border border-gray-200 rounded-lg px-4 py-2.5 text-sm focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 focus:bg-white outline-none transition-all"
              />
            </div>
          </div>

          {/* Employee Assignment Section - Shadcn-like Card */}
          <div className="border border-gray-200 rounded-xl overflow-hidden bg-white shadow-sm">
            <div className="bg-gray-50 px-4 py-3 border-b border-gray-100 flex items-center justify-between">
              <h4 className="text-[12px] font-semibold text-gray-700 uppercase tracking-wider flex items-center gap-2">
                <Users size={12} className="text-gray-400" />
                Employee Shift Assignment
              </h4>
              <select
                onChange={e => {
                  const emp = employees.find(emp => emp.id === e.target.value)
                  if (emp) addEmployee(emp)
                  e.target.value = ''
                }}
                className="bg-white border border-gray-200 rounded-lg px-3 py-1.5 text-xs font-medium focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none transition-all cursor-pointer"
              >
                <option value="">Add Employee...</option>
                {filteredEmployees.filter(e => !shifts.find(s => s.employeeId === e.id)).map(emp => (
                  <option key={emp.id} value={emp.id}>{emp.name}</option>
                ))}
              </select>
            </div>

            {/* Day Planning Quick Add Row */}
            {type === PLANNING_TYPES.DAY && (
              <div className="p-4 bg-indigo-50/50 border-b border-gray-100">
                <div className="grid grid-cols-4 gap-4">
                  <div>
                    <label className="block text-[11px] font-medium text-gray-600 mb-1.5">Shift Date <span className="text-rose-500">*</span></label>
                    <input
                      type="date"
                      value={form.shiftDate}
                      onChange={e => setForm(f => ({ ...f, shiftDate: e.target.value }))}
                      className="w-full bg-white border border-gray-200 rounded-lg px-3 py-2 text-xs focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none transition-all"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-medium text-gray-600 mb-1.5">Shift</label>
                    <select
                      value={shiftTiming}
                      onChange={e => setShiftTiming(e.target.value)}
                      className="w-full bg-white border border-gray-200 rounded-lg px-3 py-2 text-xs focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none transition-all cursor-pointer"
                    >
                      <option value="day">Day</option>
                      <option value="night">Night</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-[11px] font-medium text-gray-600 mb-1.5">Shift Starts</label>
                    <div className="relative">
                      <button
                        onClick={() => setShowDefaultInTimePicker(!showDefaultInTimePicker)}
                        className="w-full bg-white border border-gray-200 rounded-lg px-3 py-2 text-xs text-left flex items-center justify-between hover:border-gray-300 transition-all"
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
                    <label className="block text-[11px] font-medium text-gray-600 mb-1.5">Shift Ends</label>
                    <div className="relative">
                      <button
                        onClick={() => setShowDefaultOutTimePicker(!showDefaultOutTimePicker)}
                        className="w-full bg-white border border-gray-200 rounded-lg px-3 py-2 text-xs text-left flex items-center justify-between hover:border-gray-300 transition-all"
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
              <div className="text-center py-8 text-gray-400 italic text-sm">
                No employees added yet. Use the dropdown above to add employees.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead className="border-b border-gray-200 bg-gray-50/80 [&_tr]:border-b">
                    <tr className="border-b border-gray-200">
                      <th className="h-10 px-3 text-left align-middle text-xs font-medium text-gray-500">Employee</th>
                      {type === PLANNING_TYPES.WEEKLY && <th className="h-10 px-3 text-left align-middle text-xs font-medium text-gray-500">Day</th>}
                      {type === PLANNING_TYPES.NEXT_FEW && <th className="h-10 px-3 text-left align-middle text-xs font-medium text-gray-500">Date</th>}
                      <th className="h-10 px-3 text-left align-middle text-xs font-medium text-gray-500">Shift Start</th>
                      <th className="h-10 px-3 text-left align-middle text-xs font-medium text-gray-500">Shift End</th>
                      <th className="h-10 px-3 text-left align-middle text-xs font-medium text-gray-500">Site</th>
                      <th className="h-10 px-3 text-left align-middle text-xs font-medium text-gray-500">Notes</th>
                      <th className="h-10 px-3 text-right align-middle text-xs font-medium text-gray-500 min-w-[60px]">Action</th>
                    </tr>
                  </thead>
                  <tbody className="[&_tr:last-child]:border-0">
                    {shifts.map((shift, idx) => (
                      <tr key={idx} className="border-b border-gray-100 hover:bg-gray-50/80 transition-colors">
                        <td className="px-3 py-2 align-middle whitespace-nowrap text-[12px] font-medium text-gray-700">{shift.employeeName}</td>
                        {type === PLANNING_TYPES.WEEKLY && (
                          <td className="px-3 py-2 align-middle whitespace-nowrap text-[12px] text-gray-500">{shift.day}</td>
                        )}
                        {type === PLANNING_TYPES.NEXT_FEW && (
                          <td className="px-3 py-2 align-middle whitespace-nowrap text-[12px] text-gray-500">{formatDateShort(shift.date)}</td>
                        )}
                        <td className="px-3 py-2 align-middle">
                          <div className="relative">
                            <button
                              onClick={() => setShowShiftInTimePicker(showShiftInTimePicker === idx ? null : idx)}
                              className="h-8 bg-white border border-gray-200 rounded-lg px-3 text-xs font-medium text-left flex items-center justify-between min-w-[90px] hover:border-gray-300 transition-all"
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
                        <td className="px-3 py-2 align-middle">
                          <div className="relative">
                            <button
                              onClick={() => setShowShiftOutTimePicker(showShiftOutTimePicker === idx ? null : idx)}
                              className="h-8 bg-white border border-gray-200 rounded-lg px-3 text-xs font-medium text-left flex items-center justify-between min-w-[90px] hover:border-gray-300 transition-all"
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
                        <td className="px-3 py-2 align-middle">
                          <input
                            type="text"
                            value={shift.site}
                            onChange={e => updateShift(idx, 'site', e.target.value)}
                            placeholder="Office"
                            className="h-8 bg-white border border-gray-200 rounded-lg px-3 text-xs font-medium w-24 focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none transition-all"
                          />
                        </td>
                        <td className="px-3 py-2 align-middle">
                          <input
                            type="text"
                            value={shift.notes}
                            onChange={e => updateShift(idx, 'notes', e.target.value)}
                            placeholder="Notes"
                            className="h-8 bg-white border border-gray-200 rounded-lg px-3 text-xs font-medium w-24 focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none transition-all"
                          />
                        </td>
                        <td className="px-3 py-2 align-middle text-right">
                          <button onClick={() => removeShift(idx)} className="p-1.5 text-rose-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-all">
                            <Trash2 size={14} />
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
            <label className="block text-[12px] font-semibold text-gray-700 mb-2">Announcement Message</label>
            <textarea
              value={form.message}
              onChange={e => setForm(f => ({ ...f, message: e.target.value }))}
              placeholder="Enter announcement details..."
              rows={3}
              className="w-full bg-gray-50/50 border border-gray-200 rounded-lg px-4 py-2.5 text-sm focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 focus:bg-white outline-none transition-all resize-none placeholder:text-gray-400"
            />
          </div>

          <div className="grid grid-cols-3 gap-6">
            <div>
              <label className="block text-[12px] font-semibold text-gray-700 mb-2">Branch / Location</label>
              <select
                value={form.branch}
                onChange={e => setForm(f => ({ ...f, branch: e.target.value }))}
                className="w-full bg-gray-50/50 border border-gray-200 rounded-lg px-4 py-2.5 text-sm focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 focus:bg-white outline-none transition-all appearance-none cursor-pointer"
              >
                <option value="">All Branches</option>
                {branches.map(b => <option key={b} value={b}>{b}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-[12px] font-semibold text-gray-700 mb-2">Department</label>
              <select
                value={form.department}
                onChange={e => setForm(f => ({ ...f, department: e.target.value }))}
                className="w-full bg-gray-50/50 border border-gray-200 rounded-lg px-4 py-2.5 text-sm focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 focus:bg-white outline-none transition-all appearance-none cursor-pointer"
              >
                <option value="">All Departments</option>
                {departments.map(d => <option key={d} value={d}>{d}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-[12px] font-semibold text-gray-700 mb-2">Visibility</label>
              <select
                value={form.visibility}
                onChange={e => setForm(f => ({ ...f, visibility: e.target.value }))}
                className="w-full bg-gray-50/50 border border-gray-200 rounded-lg px-4 py-2.5 text-sm focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 focus:bg-white outline-none transition-all appearance-none cursor-pointer"
              >
                <option value="all">All Employees</option>
                <option value="branch">Specific Branch</option>
                <option value="department">Specific Department</option>
              </select>
            </div>
          </div>

          {/* Type-specific date fields */}
          {type === PLANNING_TYPES.WEEKLY && (
            <div className="grid grid-cols-2 gap-6">
              <div>
                <label className="block text-[12px] font-semibold text-gray-700 mb-2">Week Start Date <span className="text-rose-500">*</span></label>
                <input
                  type="date"
                  value={form.weekStart}
                  onChange={e => setForm(f => ({ ...f, weekStart: e.target.value }))}
                  className="w-full bg-gray-50/50 border border-gray-200 rounded-lg px-4 py-2.5 text-sm focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 focus:bg-white outline-none transition-all"
                />
              </div>
              <div>
                <label className="block text-[12px] font-semibold text-gray-700 mb-2">Week End Date</label>
                <input
                  type="text"
                  value={weekDates.length > 0 ? formatDateShort(weekDates[6]) : ''}
                  readOnly
                  className="w-full bg-gray-100 border border-gray-200 rounded-lg px-4 py-2.5 text-sm text-gray-500 cursor-not-allowed"
                />
              </div>
            </div>
          )}

          {type === PLANNING_TYPES.NEXT_FEW && (
            <div className="grid grid-cols-2 gap-6">
              <div>
                <label className="block text-[12px] font-semibold text-gray-700 mb-2">Start Date <span className="text-rose-500">*</span></label>
                <input
                  type="date"
                  value={form.startDate}
                  onChange={e => setForm(f => ({ ...f, startDate: e.target.value }))}
                  className="w-full bg-gray-50/50 border border-gray-200 rounded-lg px-4 py-2.5 text-sm focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 focus:bg-white outline-none transition-all"
                />
              </div>
              <div>
                <label className="block text-[12px] font-semibold text-gray-700 mb-2">End Date <span className="text-rose-500">*</span></label>
                <input
                  type="date"
                  value={form.endDate}
                  onChange={e => setForm(f => ({ ...f, endDate: e.target.value }))}
                  className="w-full bg-gray-50/50 border border-gray-200 rounded-lg px-4 py-2.5 text-sm focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 focus:bg-white outline-none transition-all"
                />
              </div>
            </div>
          )}

          {/* Attachment */}
          <div className="border border-gray-200 rounded-xl overflow-hidden bg-white shadow-sm">
            <div className="bg-gray-50 px-4 py-2 border-b border-gray-100 flex items-center justify-between">
              <h5 className="text-[11px] font-semibold text-gray-600 uppercase tracking-wider flex items-center gap-2">
                <Upload size={12} className="text-gray-400" />
                Attachment
              </h5>
              <span className="text-[10px] font-medium text-gray-400 italic">Optional</span>
            </div>
            <div className="p-4">
              <label className="flex items-center gap-3 cursor-pointer hover:bg-gray-50 p-2 rounded-lg transition-all">
                <div className="w-10 h-10 bg-gray-100 rounded-lg flex items-center justify-center">
                  <Upload size={16} className="text-gray-400" />
                </div>
                <div className="flex-1">
                  <span className="text-xs text-gray-500">{form.attachmentName || 'Upload file (PDF, images, documents)'}</span>
                </div>
                <input type="file" className="hidden" onChange={handleFileUpload} disabled={uploading} />
              </label>
            </div>
          </div>
        </div>

        <div className="px-6 py-4 border-t border-gray-100 flex justify-end gap-3 shrink-0 bg-white">
          <button
            onClick={onClose}
            className="px-6 py-2.5 text-sm font-medium text-gray-600 hover:text-gray-900 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={loading}
            className="px-6 py-2.5 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
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
function EditPlanningForm({ planning, onClose, onSave, loading, employees, branches, departments, shifts }) {
  const [form, setForm] = useState({
    title: planning.title || '',
    message: planning.message || '',
    branch: planning.branch || '',
    department: planning.department || '',
    publishDate: planning.publishDate || new Date().toISOString().split('T')[0],
    visibility: planning.visibility || 'all',
    attachmentName: planning.attachmentName || '',
  })

  const [shiftsList, setShiftsList] = useState(planning.shifts || [])
  const [showShiftInTimePicker, setShowShiftInTimePicker] = useState(null)
  const [showShiftOutTimePicker, setShowShiftOutTimePicker] = useState(null)

  const updateShift = (index, field, value) => {
    setShiftsList(prev => prev.map((s, i) => i === index ? { ...s, [field]: value } : s))
  }

  const removeShift = (index) => {
    setShiftsList(prev => prev.filter((_, i) => i !== index))
  }

  const handleSubmit = () => {
    if (!form.title.trim()) { alert('Please enter a title'); return }
    if (shiftsList.length === 0) { alert('Please add at least one employee'); return }
    
    const planningData = {
      ...planning,
      title: form.title,
      message: form.message,
      branch: form.branch || '',
      department: form.department || '',
      publishDate: form.publishDate,
      visibility: form.visibility,
      attachmentName: form.attachmentName,
      shifts: shiftsList.map(s => ({
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
                  {shiftsList.map((shift, idx) => (
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

// Create Day Planning Modal with drag-drop between Day/Night
function CreateDayModal({ onClose, onSave, loading, employees, branches, departments, shifts }) {
  const [form, setForm] = useState({
    title: '',
    publishDate: new Date().toISOString().split('T')[0],
    visibility: 'all',
    shiftDate: new Date().toISOString().split('T')[0],
  })

  const [dayShifts, setDayShifts] = useState([])
  const [nightShifts, setNightShifts] = useState([])
  const [showTimePicker, setShowTimePicker] = useState({ type: null, idx: null, field: null })

  // Find default times from settings
  const dayShiftSetting = useMemo(() => shifts?.find(s => s.type === 'Day' || s.name?.toLowerCase().includes('day')), [shifts])
  const nightShiftSetting = useMemo(() => shifts?.find(s => s.type === 'Night' || s.name?.toLowerCase().includes('night')), [shifts])

  // Add employee to a section
  const addEmployeeTo = (empId, section) => {
    const emp = employees.find(e => e.id === empId)
    if (!emp) return
    
    let inTime = ''
    let outTime = ''
    
    if (section === 'day' && dayShiftSetting) {
      inTime = dayShiftSetting.startTime || '09:00'
      outTime = dayShiftSetting.endTime || '18:00'
    } else if (section === 'night' && nightShiftSetting) {
      inTime = nightShiftSetting.startTime || '21:00'
      outTime = nightShiftSetting.endTime || '05:00'
    } else {
      inTime = section === 'day' ? '09:00' : '21:00'
      outTime = section === 'day' ? '18:00' : '05:00'
    }

    const base = { employeeId: emp.id, employeeName: emp.name, inTime, outTime, notes: '', site: '' }
    if (section === 'day') setDayShifts(prev => [...prev, base])
    else setNightShifts(prev => [...prev, base])
  }

  const removeFrom = (section, idx) => {
    if (section === 'day') setDayShifts(prev => prev.filter((_, i) => i !== idx))
    else setNightShifts(prev => prev.filter((_, i) => i !== idx))
  }

  const updateShift = (section, idx, field, value) => {
    const updater = (arr) => arr.map((s, i) => i === idx ? { ...s, [field]: value } : s)
    if (section === 'day') setDayShifts(prev => updater(prev))
    else setNightShifts(prev => updater(prev))
  }

  // Drag & Drop handlers (HTML5)
  const onDragStart = (e, from, idx) => {
    e.dataTransfer.setData('application/json', JSON.stringify({ from, idx }))
  }
  const onDragOver = (e) => { e.preventDefault() }
  const onDropTo = (e, to) => {
    e.preventDefault()
    try {
      const data = JSON.parse(e.dataTransfer.getData('application/json'))
      const { from, idx } = data
      if (from === to) return
      let item
      if (from === 'day') {
        item = dayShifts[idx]
        setDayShifts(prev => prev.filter((_, i) => i !== idx))
      } else {
        item = nightShifts[idx]
        setNightShifts(prev => prev.filter((_, i) => i !== idx))
      }
      
      // Update times based on new section
      if (to === 'day' && dayShiftSetting) {
        item.inTime = dayShiftSetting.startTime || '09:00'
        item.outTime = dayShiftSetting.endTime || '18:00'
      } else if (to === 'night' && nightShiftSetting) {
        item.inTime = nightShiftSetting.startTime || '21:00'
        item.outTime = nightShiftSetting.endTime || '05:00'
      }

      if (to === 'day') setDayShifts(prev => [...prev, item])
      else setNightShifts(prev => [...prev, item])
    } catch (err) {
      // ignore
    }
  }

  const handleSubmit = () => {
    if (!form.title.trim()) { alert('Please enter a title'); return }
    const allShifts = [
      ...dayShifts.map(s => ({ ...s, section: 'day', date: form.shiftDate })),
      ...nightShifts.map(s => ({ ...s, section: 'night', date: form.shiftDate })),
    ]
    if (allShifts.length === 0) { alert('Add at least one employee'); return }
    const planningData = {
      type: PLANNING_TYPES.DAY,
      title: form.title,
      message: '',
      branch: '',
      department: '',
      publishDate: form.publishDate,
      visibility: form.visibility,
      shifts: allShifts,
      createdAt: serverTimestamp()
    }
    onSave(planningData)
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center overflow-auto py-8">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl mx-4 max-h-[90vh] overflow-hidden flex flex-col">
        <div className="bg-indigo-600 px-6 py-4 flex justify-between items-center shrink-0">
          <div>
            <h3 className="text-white font-semibold text-[13px]">Create Day Planning</h3>
            <p className="text-[10px] text-indigo-200 mt-0.5">Schedule day and night shifts</p>
          </div>
          <button onClick={onClose} className="text-white/80 hover:text-white">
            <X size={18} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* Title and Date */}
          <div className="grid grid-cols-3 gap-6">
            <div className="col-span-2">
              <label className="block text-[12px] font-semibold text-gray-700 mb-2">Title</label>
              <input 
                type="text" 
                value={form.title} 
                onChange={e => setForm(f => ({ ...f, title: e.target.value }))} 
                placeholder="Enter planning title" 
                className="w-full bg-gray-50/50 border border-gray-200 rounded-lg px-4 py-2.5 text-sm focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 focus:bg-white outline-none transition-all placeholder:text-gray-400" 
              />
            </div>
            <div>
              <label className="block text-[12px] font-semibold text-gray-700 mb-2">Publish Date</label>
              <input 
                type="date" 
                value={form.publishDate} 
                onChange={e => setForm(f => ({ ...f, publishDate: e.target.value }))} 
                className="w-full bg-gray-50/50 border border-gray-200 rounded-lg px-4 py-2.5 text-sm focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 focus:bg-white outline-none transition-all" 
              />
            </div>
          </div>

          {/* Day Shift Section */}
          <div className="border border-gray-200 rounded-xl overflow-hidden bg-white shadow-sm" onDragOver={onDragOver} onDrop={(e) => onDropTo(e, 'day')}>
            <div className="bg-gray-50 px-4 py-3 border-b border-gray-100 flex items-center justify-between">
              <h4 className="text-[12px] font-semibold text-gray-700 uppercase tracking-wider flex items-center gap-2">
                <Clock size={12} className="text-gray-400" />
                Day Shift
              </h4>
              <input 
                type="date" 
                value={form.shiftDate} 
                onChange={e => setForm(f => ({ ...f, shiftDate: e.target.value }))} 
                className="bg-white border border-gray-200 rounded-lg px-3 py-1.5 text-xs focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none transition-all" 
              />
            </div>

            <div className="p-4 space-y-3">
              {dayShifts.map((s, idx) => (
                <div key={idx} draggable onDragStart={(e) => onDragStart(e, 'day', idx)} className="p-3 bg-gray-50 border border-gray-200 rounded-lg flex items-center gap-3 hover:border-indigo-300 transition-colors cursor-move">
                  <div className="font-medium text-sm text-gray-800 flex-1">{s.employeeName}</div>
                  <div className="flex items-center gap-2">
                    <div className="relative">
                      <button onClick={() => setShowTimePicker({ type: 'day', idx, field: 'inTime' })} className="h-9 px-3 bg-white border border-gray-200 rounded-lg text-xs font-medium hover:border-gray-300 transition-all">{s.inTime || 'Start'}</button>
                      {showTimePicker.type === 'day' && showTimePicker.idx === idx && showTimePicker.field === 'inTime' && (
                        <TimePicker value={s.inTime || '09:00'} onChange={(t) => updateShift('day', idx, 'inTime', t)} onClose={() => setShowTimePicker({ type: null, idx: null, field: null })} />
                      )}
                    </div>
                    <div className="relative">
                      <button onClick={() => setShowTimePicker({ type: 'day', idx, field: 'outTime' })} className="h-9 px-3 bg-white border border-gray-200 rounded-lg text-xs font-medium hover:border-gray-300 transition-all">{s.outTime || 'End'}</button>
                      {showTimePicker.type === 'day' && showTimePicker.idx === idx && showTimePicker.field === 'outTime' && (
                        <TimePicker value={s.outTime || '18:00'} onChange={(t) => updateShift('day', idx, 'outTime', t)} onClose={() => setShowTimePicker({ type: null, idx: null, field: null })} />
                      )}
                    </div>
                    <input 
                      value={s.notes} 
                      onChange={e => updateShift('day', idx, 'notes', e.target.value)} 
                      placeholder="Notes" 
                      className="h-9 bg-white border border-gray-200 rounded-lg px-3 text-xs w-32 focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none transition-all" 
                    />
                    <button onClick={() => removeFrom('day', idx)} className="text-rose-400 p-2 hover:bg-rose-50 rounded-lg transition-colors">
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              ))}
              
              {dayShifts.length === 0 && (
                <div className="text-center py-8 text-gray-400 text-sm italic">
                  Drag employees here or use the dropdown below
                </div>
              )}
            </div>
            
            <div className="px-4 py-3 border-t border-gray-100 bg-gray-50">
              <select 
                onChange={e => { if (e.target.value) { addEmployeeTo(e.target.value, 'day'); e.target.value = '' } }} 
                className="w-full bg-white border border-gray-200 rounded-lg px-4 py-2 text-sm focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none transition-all cursor-pointer"
              >
                <option value="">+ Add Employee to Day Shift</option>
                {employees.filter(emp => !dayShifts.find(s => s.employeeId === emp.id) && !nightShifts.find(s => s.employeeId === emp.id)).map(emp => (
                  <option key={emp.id} value={emp.id}>{emp.name}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Night Shift Section */}
          <div className="border border-gray-200 rounded-xl overflow-hidden bg-white shadow-sm" onDragOver={onDragOver} onDrop={(e) => onDropTo(e, 'night')}>
            <div className="bg-gray-50 px-4 py-3 border-b border-gray-100 flex items-center justify-between">
              <h4 className="text-[12px] font-semibold text-gray-700 uppercase tracking-wider flex items-center gap-2">
                <Clock size={12} className="text-gray-400" />
                Night Shift
              </h4>
              <input 
                type="date" 
                value={form.shiftDate} 
                onChange={e => setForm(f => ({ ...f, shiftDate: e.target.value }))} 
                className="bg-white border border-gray-200 rounded-lg px-3 py-1.5 text-xs focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none transition-all" 
              />
            </div>

            <div className="p-4 space-y-3">
              {nightShifts.map((s, idx) => (
                <div key={idx} draggable onDragStart={(e) => onDragStart(e, 'night', idx)} className="p-3 bg-gray-50 border border-gray-200 rounded-lg flex items-center gap-3 hover:border-indigo-300 transition-colors cursor-move">
                  <div className="font-medium text-sm text-gray-800 flex-1">{s.employeeName}</div>
                  <div className="flex items-center gap-2">
                    <div className="relative">
                      <button onClick={() => setShowTimePicker({ type: 'night', idx, field: 'inTime' })} className="h-9 px-3 bg-white border border-gray-200 rounded-lg text-xs font-medium hover:border-gray-300 transition-all">{s.inTime || 'Start'}</button>
                      {showTimePicker.type === 'night' && showTimePicker.idx === idx && showTimePicker.field === 'inTime' && (
                        <TimePicker value={s.inTime || '21:00'} onChange={(t) => updateShift('night', idx, 'inTime', t)} onClose={() => setShowTimePicker({ type: null, idx: null, field: null })} />
                      )}
                    </div>
                    <div className="relative">
                      <button onClick={() => setShowTimePicker({ type: 'night', idx, field: 'outTime' })} className="h-9 px-3 bg-white border border-gray-200 rounded-lg text-xs font-medium hover:border-gray-300 transition-all">{s.outTime || 'End'}</button>
                      {showTimePicker.type === 'night' && showTimePicker.idx === idx && showTimePicker.field === 'outTime' && (
                        <TimePicker value={s.outTime || '05:00'} onChange={(t) => updateShift('night', idx, 'outTime', t)} onClose={() => setShowTimePicker({ type: null, idx: null, field: null })} />
                      )}
                    </div>
                    <input 
                      value={s.notes} 
                      onChange={e => updateShift('night', idx, 'notes', e.target.value)} 
                      placeholder="Notes" 
                      className="h-9 bg-white border border-gray-200 rounded-lg px-3 text-xs w-32 focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none transition-all" 
                    />
                    <button onClick={() => removeFrom('night', idx)} className="text-rose-400 p-2 hover:bg-rose-50 rounded-lg transition-colors">
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              ))}
              
              {nightShifts.length === 0 && (
                <div className="text-center py-8 text-gray-400 text-sm italic">
                  Drag employees here or use the dropdown below
                </div>
              )}
            </div>
            
            <div className="px-4 py-3 border-t border-gray-100 bg-gray-50">
              <select 
                onChange={e => { if (e.target.value) { addEmployeeTo(e.target.value, 'night'); e.target.value = '' } }} 
                className="w-full bg-white border border-gray-200 rounded-lg px-4 py-2 text-sm focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none transition-all cursor-pointer"
              >
                <option value="">+ Add Employee to Night Shift</option>
                {employees.filter(emp => !dayShifts.find(s => s.employeeId === emp.id) && !nightShifts.find(s => s.employeeId === emp.id)).map(emp => (
                  <option key={emp.id} value={emp.id}>{emp.name}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Visibility */}
          <div>
            <label className="block text-[12px] font-semibold text-gray-700 mb-2">Visibility</label>
            <select 
              value={form.visibility} 
              onChange={e => setForm(f => ({ ...f, visibility: e.target.value }))} 
              className="w-48 bg-gray-50/50 border border-gray-200 rounded-lg px-4 py-2.5 text-sm focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 focus:bg-white outline-none transition-all cursor-pointer"
            >
              <option value="all">All employees</option>
            </select>
          </div>
        </div>

        <div className="px-6 py-4 border-t border-gray-100 flex justify-end gap-3 shrink-0">
          <button 
            onClick={onClose} 
            className="px-6 py-2.5 text-sm font-medium text-gray-600 hover:text-gray-900 transition-colors"
          >
            Cancel
          </button>
          <button 
            onClick={handleSubmit} 
            disabled={loading} 
            className="px-6 py-2.5 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? 'Creating...' : 'Create Planning'}
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
  const [shifts, setShifts] = useState([])
  const [loading, setLoading] = useState(false)
  const [search, setSearch] = useState('')
  const [currentTab, setCurrentTab] = useState(PLANNING_TYPES.DAY)
  
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

  const fetchData = useCallback(async () => {
    if (!user?.orgId) return
    setLoading(true)
    try {
      // Fetch Plannings
      const q = query(
        collection(db, 'organisations', user.orgId, 'shiftPlannings'),
        orderBy('createdAt', 'desc')
      )
      const snap = await getDocs(q)
      setPlannings(snap.docs.map(d => ({ id: d.id, ...d.data() })))

      // Fetch Shifts for timing reference
      const shiftsSnap = await getDocs(collection(db, 'organisations', user.orgId, 'shifts'))
      setShifts(shiftsSnap.docs.map(d => ({ id: d.id, ...d.data() })))
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }, [user?.orgId])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  const handleCreate = async (planningData) => {
    setSaving(true)
    try {
      const docRef = await addDoc(collection(db, 'organisations', user.orgId, 'shiftPlannings'), {
        ...planningData,
        createdBy: user.uid,
        createdByName: user.name,
      })

      // Attempt to sync to local serverless endpoint for SQL tracking
      try {
        await fetch('/api/sync-planning', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...planningData, firestoreId: docRef.id, createdBy: user.uid })
        })
      } catch (e) {
        console.warn('Failed to sync to local SQL API', e)
      }

      setShowCreateModal(false)
      fetchData()
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
      fetchData()
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
      fetchData()
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
    (p.title?.toLowerCase().includes(search.toLowerCase()) ||
    p.type?.toLowerCase().includes(search.toLowerCase())) && p.type === currentTab
  )

  const dayDashboard = useMemo(() => {
    const dayPlannings = plannings.filter(p => p.type === PLANNING_TYPES.DAY)
    const map = {}
    dayPlannings.forEach(p => {
      const date = p.shifts?.[0]?.date || p.publishDate || (p.createdAt?.toDate ? p.createdAt.toDate().toISOString().split('T')[0] : '')
      if (!date) return
      if (!map[date]) map[date] = { date, day:0, night:0, leaves:0, createdBy: p.createdByName || 'HR', createdAt: p.createdAt }
      p.shifts?.forEach(s => {
        const section = s.section || 'day'
        if (section === 'day') map[date].day += 1
        else if (section === 'night') map[date].night += 1
      })
    })
    return Object.values(map).sort((a,b) => a.date.localeCompare(b.date))
  }, [plannings])

  return (
    <div className="h-full flex flex-col font-inter overflow-hidden bg-gray-50/50 p-6">
      {/* Page Header */}
      <div className="mb-4 shrink-0">
        <h1 className="text-lg font-black text-gray-800 uppercase tracking-tight">Shift Planning Announcements</h1>
        <p className="text-xs text-gray-500 mt-0.5">Create and manage shift plans for employees.</p>
      </div>

      {/* Action Tabs */}
      <div className="bg-gray-100 rounded-[12px] p-2 mb-4 flex items-center gap-2">
        {Object.values(PLANNING_TYPES).map(t => (
          <button
            key={t}
            onClick={() => setCurrentTab(t)}
            className={`h-[38px] px-4 rounded-lg text-[11px] font-bold uppercase transition-all ${currentTab === t ? 'bg-green-600 text-white' : 'bg-gray-200 text-gray-700 hover:bg-orange-200'}`}
          >
            {t}
          </button>
        ))}

        <div className="flex-1"></div>

        <button
          onClick={() => { setCreateType(currentTab); setShowCreateModal(true); }}
          className="h-[38px] px-5 bg-indigo-600 text-white rounded-lg text-[11px] font-bold uppercase hover:bg-indigo-700 transition-all shadow-md"
        >
          Create New
        </button>

        <div className="flex items-center gap-2 ml-2">
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
        createType === PLANNING_TYPES.DAY ? (
          <CreateDayModal
            onClose={() => setShowCreateModal(false)}
            onSave={handleCreate}
            loading={saving}
            employees={employees}
            branches={branches}
            departments={departments}
          />
        ) : (
          <CreatePlanningForm
            type={createType}
            onClose={() => setShowCreateModal(false)}
            onSave={handleCreate}
            loading={saving}
            employees={employees}
            branches={branches}
            departments={departments}
          />
        )
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
