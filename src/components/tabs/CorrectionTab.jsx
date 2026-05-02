import React, { useState, useEffect, useMemo, useCallback } from 'react'
import { useAuth } from '../../hooks/useAuth'
import { useEmployees } from '../../hooks/useEmployees'
import { useAttendance, calcOT } from '../../hooks/useAttendance'
import { db } from '../../lib/firebase'
import { collection, addDoc, serverTimestamp } from 'firebase/firestore'
import Spinner from '../ui/Spinner'
import Modal from '../ui/Modal'
import TimePicker from '../ui/TimePicker'
import BulkAttendanceModal from './BulkAttendanceModal'
import { 
  Calendar, Search, FileText, Printer, ChevronLeft, ChevronRight, 
  Clock, Edit2, Save, X, Check, Square, Trash2, FileDown, 
  History, RefreshCw, ArrowLeft, ArrowRight, Plus, ArrowRight as ArrowRightIcon
} from 'lucide-react'
import { formatTimeTo12Hour } from '../../lib/salaryUtils'

function formatDateShort(isoDate) {
  if (!isoDate) return ''
  const date = new Date(isoDate)
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
  const day = String(date.getDate()).padStart(2, '0')
  return `${day}-${months[date.getMonth()].slice(0, 3)}-${String(date.getFullYear()).slice(-2)}`
}

// Display date as Mmm Dd (e.g., "Mar 10")
function displayShortDate(isoDate) {
  if (!isoDate) return ''
  const d = new Date(isoDate)
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
  return `${months[d.getMonth()]} ${d.getDate()}`
}

function parseOT(ot) {
  if (!ot || ot === '-' || ot === '00:00') return 0
  const [h, m] = ot.split(':').map(Number)
  return (h || 0) + (m || 0) / 60
}

function formatOTDisplay(ot) {
  if (!ot || ot === '-' || ot === '00:00') return '0.0'
  const hours = parseOT(ot)
  return hours.toFixed(1)
}

// ── FILTER BAR COMPONENT ─────────────────────────────────────────────
function AttendanceFilterBar({ selectedDate, setSelectedDate, onRefresh, onViewDay, loading }) {
  const handleDateChange = (days) => {
    const d = new Date(selectedDate)
    d.setDate(d.getDate() + days)
    setSelectedDate(d.toISOString().split('T')[0])
  }

  return (
    <div className="bg-white rounded-[12px] border border-gray-100 shadow-sm p-3 no-print">
      <div className="flex items-center gap-2 flex-wrap">
        <button
          onClick={() => handleDateChange(-1)}
          className="h-[34px] px-3 bg-gray-50 border border-gray-200 rounded-lg text-gray-600 hover:bg-gray-100 transition-all flex items-center gap-1.5 text-[11px] font-semibold"
        >
          <ArrowLeft size={14} /> Previous Day
        </button>
        
        <div className="flex items-center gap-2 bg-gray-50 border border-gray-200 rounded-lg px-3 h-[34px]">
          <Calendar size={14} className="text-indigo-500" />
          <input
            type="date"
            value={selectedDate}
            onChange={e => setSelectedDate(e.target.value)}
            className="bg-transparent border-none outline-none text-sm font-bold text-gray-700 w-[130px]"
          />
        </div>

        <button
          onClick={() => handleDateChange(1)}
          className="h-[34px] px-3 bg-gray-50 border border-gray-200 rounded-lg text-gray-600 hover:bg-gray-100 transition-all flex items-center gap-1.5 text-[11px] font-semibold"
        >
          Next Day <ArrowRight size={14} />
        </button>

        <button
          onClick={onViewDay}
          className="h-[34px] px-5 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-all text-[11px] font-bold uppercase tracking-wider shadow-md"
        >
          View Day
        </button>

        <button
          onClick={onRefresh}
          disabled={loading}
          className="h-[34px] px-4 bg-emerald-500 text-white rounded-lg hover:bg-emerald-600 transition-all flex items-center gap-2 text-[11px] font-bold shadow-md disabled:opacity-50"
        >
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} /> Refresh
        </button>
      </div>
    </div>
  )
}

// ── SUMMARY CARDS COMPONENT ───────────────────────────────────────────
function AttendanceSummaryCards({ results }) {
  const stats = useMemo(() => {
    const present = results.filter(r => r.status === 'PRESENT' || r.status === 'SUNDAY' || r.status === 'SUNWORKED').length
    const absent = results.filter(r => r.status === 'ABSENT').length
    const noData = results.filter(r => r.status === 'NO DATA').length
    const totalOT = results.reduce((sum, r) => sum + parseOT(r.ot), 0)
    const total = results.length
    
    return { present, absent, noData, totalOT, total }
  }, [results])

  const cards = [
    { label: 'Present', value: stats.present, color: 'text-green-600', bg: 'bg-green-50', border: 'border-green-100' },
    { label: 'Absent', value: stats.absent, color: 'text-red-600', bg: 'bg-red-50', border: 'border-red-100' },
    { label: 'Total OT Hours', value: stats.totalOT.toFixed(1), color: 'text-indigo-600', bg: 'bg-indigo-50', border: 'border-indigo-100' },
    { label: 'Total Employees', value: stats.total, color: 'text-gray-700', bg: 'bg-gray-50', border: 'border-gray-100' },
  ]

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5 mb-4">
      {cards.map((card, idx) => (
        <div key={idx} className={`${card.bg} border ${card.border} rounded-[10px] p-3`}>
          <div className={`text-xl font-black ${card.color}`}>{card.value}</div>
          <div className="text-[10px] font-bold text-gray-500 uppercase tracking-wider mt-0.5">{card.label}</div>
        </div>
      ))}
    </div>
  )
}

// ── BULK CORRECTION PANEL COMPONENT ───────────────────────────────────
function BulkCorrectionPanel({ isOpen, onClose, selectedRows, onBulkSave, saving }) {
  const [bulkForm, setBulkForm] = useState({
    inDate: '',
    inTime: '',
    outDate: '',
    outTime: '',
    site: '',
    status: '',
  })
  const [showInTimePicker, setShowInTimePicker] = useState(false)
  const [showOutTimePicker, setShowOutTimePicker] = useState(false)

  const handleApply = () => {
    const updates = {}
    if (bulkForm.inDate) updates.inDate = bulkForm.inDate
    if (bulkForm.inTime) updates.inTime = bulkForm.inTime
    if (bulkForm.outDate) updates.outDate = bulkForm.outDate
    if (bulkForm.outTime) updates.outTime = bulkForm.outTime
    if (bulkForm.site) updates.site = bulkForm.site
    if (bulkForm.status) updates.status = bulkForm.status
    
    if (Object.keys(updates).length === 0) return
    
    updates.isAbsent = bulkForm.status === 'Absent'
    if (updates.isAbsent) {
      updates.inTime = ''
      updates.outTime = ''
      updates.otHours = '00:00'
    } else if (updates.inTime || updates.outTime) {
      const avgMinDailyHours = selectedRows?.length > 0 
        ? Math.round(selectedRows.reduce((sum, r) => sum + (r.minDailyHours || 8), 0) / selectedRows.length)
        : 8
      updates.otHours = calcOT(
        updates.inTime || '', 
        updates.outTime || '', 
        updates.inDate || bulkForm.inDate || selectedRows[0]?.date,
        updates.outDate || bulkForm.outDate || selectedRows[0]?.date,
        avgMinDailyHours
      )
    }
    
    onBulkSave(updates)
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md mx-4 overflow-hidden">
        <div className="bg-indigo-600 px-6 py-4 flex justify-between items-center">
          <h3 className="text-white font-black text-[13px] uppercase tracking-wide">Bulk Correction</h3>
          <button onClick={onClose} className="text-white/80 hover:text-white">
            <X size={18} />
          </button>
        </div>
        
        <div className="p-6 space-y-4">
          <p className="text-xs text-gray-500 font-medium">
            Editing {selectedRows.length} employee(s) for {formatDateShort(selectedRows[0]?.date)}
          </p>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[10px] font-bold text-gray-500 uppercase mb-1">In Date</label>
              <input
                type="date"
                value={bulkForm.inDate}
                onChange={e => setBulkForm(f => ({ ...f, inDate: e.target.value }))}
                className="w-full h-9 border border-gray-200 rounded-lg px-3 text-xs font-semibold"
              />
            </div>
            <div>
              <label className="block text-[10px] font-bold text-gray-500 uppercase mb-1">In Time</label>
              <div className="relative">
                <button
                  onClick={() => setShowInTimePicker(!showInTimePicker)}
                  className="w-full h-9 border border-gray-200 rounded-lg px-3 text-xs font-semibold text-left flex items-center justify-between"
                >
                  <span>{bulkForm.inTime ? (() => {
                    const [h, m] = bulkForm.inTime.split(':').map(Number)
                    const p = h >= 12 ? 'PM' : 'AM'
                    const h12 = h % 12 || 12
                    return `${h12}:${String(m).padStart(2, '0')} ${p}`
                  })() : 'Select time'}</span>
                </button>
                {showInTimePicker && (
                  <TimePicker
                    value={bulkForm.inTime || '09:00'}
                    onChange={(time) => setBulkForm(f => ({ ...f, inTime: time }))}
                    onClose={() => setShowInTimePicker(false)}
                  />
                )}
              </div>
            </div>
            <div>
              <label className="block text-[10px] font-bold text-gray-500 uppercase mb-1">Out Date</label>
              <input
                type="date"
                value={bulkForm.outDate}
                onChange={e => setBulkForm(f => ({ ...f, outDate: e.target.value }))}
                className="w-full h-9 border border-gray-200 rounded-lg px-3 text-xs font-semibold"
              />
            </div>
            <div>
              <label className="block text-[10px] font-bold text-gray-500 uppercase mb-1">Out Time</label>
              <div className="relative">
                <button
                  onClick={() => setShowOutTimePicker(!showOutTimePicker)}
                  className="w-full h-9 border border-gray-200 rounded-lg px-3 text-xs font-semibold text-left flex items-center justify-between"
                >
                  <span>{bulkForm.outTime ? (() => {
                    const [h, m] = bulkForm.outTime.split(':').map(Number)
                    const p = h >= 12 ? 'PM' : 'AM'
                    const h12 = h % 12 || 12
                    return `${h12}:${String(m).padStart(2, '0')} ${p}`
                  })() : 'Select time'}</span>
                </button>
                {showOutTimePicker && (
                  <TimePicker
                    value={bulkForm.outTime || '18:00'}
                    onChange={(time) => setBulkForm(f => ({ ...f, outTime: time }))}
                    onClose={() => setShowOutTimePicker(false)}
                  />
                )}
              </div>
            </div>
          </div>

          <div>
            <label className="block text-[10px] font-bold text-gray-500 uppercase mb-1">Site</label>
            <input
              type="text"
              value={bulkForm.site}
              onChange={e => setBulkForm(f => ({ ...f, site: e.target.value }))}
              placeholder="Office, WFH, etc."
              className="w-full h-9 border border-gray-200 rounded-lg px-3 text-xs font-semibold"
            />
          </div>

          <div>
            <label className="block text-[10px] font-bold text-gray-500 uppercase mb-1">Status</label>
            <select
              value={bulkForm.status}
              onChange={e => setBulkForm(f => ({ ...f, status: e.target.value }))}
              className="w-full h-9 border border-gray-200 rounded-lg px-3 text-xs font-semibold"
            >
              <option value="">No Change</option>
              <option value="Present">Present</option>
              <option value="Absent">Absent</option>
              <option value="Half-Day">Half-Day</option>
            </select>
          </div>
        </div>

        <div className="px-6 pb-6 flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 h-10 border border-gray-200 text-gray-600 rounded-lg text-xs font-bold uppercase hover:bg-gray-50"
          >
            Cancel
          </button>
          <button
            onClick={handleApply}
            disabled={saving}
            className="flex-1 h-10 bg-indigo-600 text-white rounded-lg text-xs font-bold uppercase hover:bg-indigo-700 disabled:opacity-50"
          >
            {saving ? 'Applying...' : 'Apply Changes'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── EDIT DRAWER COMPONENT ─────────────────────────────────────────────
function EditDrawer({ isOpen, onClose, row, onSave, onDelete, saving }) {
  // Initialize form from row - only runs when drawer opens with new row
  const initialForm = (() => {
    if (!row) return {
      inDate: '',
      inTime: '',
      outDate: '',
      outTime: '',
      otHours: '',
      site: '',
      status: 'Present',
      isAbsent: false,
      notes: '',
    }
    return {
      inDate: row.inDate || row.date,
      inTime: row.in || '',
      outDate: row.outDate || row.date,
      outTime: row.out || '',
      otHours: row.ot || '00:00',
      site: row.site || '',
      status: row.status === 'PRESENT' ? 'Present' : row.status === 'ABSENT' ? 'Absent' : row.status === 'SUNDAY' ? 'Holiday' : 'Present',
      isAbsent: row.status === 'ABSENT',
      notes: '',
    }
  })()
  
  const [form, setForm] = useState(initialForm)
  const [showInTimePicker, setShowInTimePicker] = useState(false)
  const [showOutTimePicker, setShowOutTimePicker] = useState(false)

  const handleChange = (field, value) => {
    const updated = { ...form, [field]: value }
    
    if (field === 'status') {
      updated.isAbsent = value === 'Absent'
      if (updated.isAbsent) {
        updated.inTime = ''
        updated.outTime = ''
        updated.otHours = '00:00'
      }
    }
    
    if (['inTime', 'outTime', 'inDate', 'outDate'].includes(field)) {
      updated.otHours = calcOT(
        field === 'inTime' ? value : updated.inTime,
        field === 'outTime' ? value : updated.outTime,
        field === 'inDate' ? value : updated.inDate,
        field === 'outDate' ? value : updated.outDate,
        row?.minDailyHours || 8
      )
    }
    
    setForm(updated)
  }

  const handleSave = () => {
    const oldValues = {
      inDate: row.inDate,
      inTime: row.in,
      outDate: row.outDate,
      outTime: row.out,
      otHours: row.ot,
      site: row.site,
      status: row.status,
    }
    
    const newValues = {
      inDate: form.inDate,
      inTime: form.inTime,
      outDate: form.outDate,
      outTime: form.outTime,
      otHours: form.otHours,
      site: form.site,
      status: form.status,
      isAbsent: form.isAbsent,
    }
    
    onSave(row, oldValues, newValues, form.notes)
  }

  if (!isOpen || !row) return null

  return (
    <div className="fixed inset-y-0 right-0 w-[380px] bg-white shadow-2xl z-50 flex flex-col">
      <div className="bg-indigo-600 px-5 py-4 flex justify-between items-center">
        <h3 className="text-white font-black text-[12px] uppercase tracking-wide">Edit Attendance</h3>
        <button onClick={onClose} className="text-white/80 hover:text-white">
          <X size={18} />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-5 space-y-4">
        <div className="bg-gray-50 rounded-lg p-3 flex justify-between items-center">
          <div>
            <p className="text-[10px] font-bold text-gray-400 uppercase">Employee</p>
            <p className="text-sm font-black text-gray-800">{row.name}</p>
          </div>
          <button 
            onClick={() => onDelete(row)}
            className="p-2 text-red-500 hover:bg-red-50 rounded-lg transition-colors group flex items-center gap-1.5"
            title="Delete Entry"
          >
            <Trash2 size={16} />
            <span className="text-[10px] font-bold uppercase">Delete</span>
          </button>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-[10px] font-bold text-gray-500 uppercase mb-1">In Date</label>
            <input
              type="date"
              value={form.inDate}
              onChange={e => handleChange('inDate', e.target.value)}
              className="w-full h-9 border border-gray-200 rounded-lg px-3 text-xs font-semibold"
            />
          </div>
          <div>
            <label className="block text-[10px] font-bold text-gray-500 uppercase mb-1">In Time</label>
            <div className="relative">
              <button
                onClick={() => setShowInTimePicker(!showInTimePicker)}
                className="w-full h-9 border border-gray-200 rounded-lg px-3 text-xs font-semibold text-left flex items-center justify-between"
              >
                <span>{form.inTime ? (() => {
                  const [h, m] = form.inTime.split(':').map(Number)
                  const p = h >= 12 ? 'PM' : 'AM'
                  const h12 = h % 12 || 12
                  return `${h12}:${String(m).padStart(2, '0')} ${p}`
                })() : 'Select time'}</span>
              </button>
              {showInTimePicker && (
                <TimePicker
                  value={form.inTime || '09:00'}
                  onChange={(time) => handleChange('inTime', time)}
                  onClose={() => setShowInTimePicker(false)}
                />
              )}
            </div>
          </div>
          <div>
            <label className="block text-[10px] font-bold text-gray-500 uppercase mb-1">Out Date</label>
            <input
              type="date"
              value={form.outDate}
              onChange={e => handleChange('outDate', e.target.value)}
              className="w-full h-9 border border-gray-200 rounded-lg px-3 text-xs font-semibold"
            />
          </div>
          <div>
            <label className="block text-[10px] font-bold text-gray-500 uppercase mb-1">Out Time</label>
            <div className="relative">
              <button
                onClick={() => setShowOutTimePicker(!showOutTimePicker)}
                className="w-full h-9 border border-gray-200 rounded-lg px-3 text-xs font-semibold text-left flex items-center justify-between"
              >
                <span>{form.outTime ? (() => {
                  const [h, m] = form.outTime.split(':').map(Number)
                  const p = h >= 12 ? 'PM' : 'AM'
                  const h12 = h % 12 || 12
                  return `${h12}:${String(m).padStart(2, '0')} ${p}`
                })() : 'Select time'}</span>
              </button>
              {showOutTimePicker && (
                <TimePicker
                  value={form.outTime || '18:00'}
                  onChange={(time) => handleChange('outTime', time)}
                  onClose={() => setShowOutTimePicker(false)}
                />
              )}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-[10px] font-bold text-gray-500 uppercase mb-1">OT Hours</label>
            <input
              type="text"
              value={form.otHours}
              readOnly
              className="w-full h-9 border border-gray-200 rounded-lg px-3 text-xs font-semibold bg-gray-50"
            />
          </div>
          <div>
            <label className="block text-[10px] font-bold text-gray-500 uppercase mb-1">Site</label>
            <input
              type="text"
              value={form.site}
              onChange={e => handleChange('site', e.target.value)}
              placeholder="Office, WFH"
              className="w-full h-9 border border-gray-200 rounded-lg px-3 text-xs font-semibold"
            />
          </div>
        </div>

        <div>
          <label className="block text-[10px] font-bold text-gray-500 uppercase mb-1">Status</label>
          <div className="flex gap-2">
            {['Present', 'Absent', 'Half-Day'].map(s => (
              <button
                key={s}
                onClick={() => handleChange('status', s)}
                className={`flex-1 h-9 rounded-lg text-xs font-bold uppercase transition-all ${
                  form.status === s
                    ? s === 'Present'
                      ? 'bg-green-500 text-white'
                      : s === 'Absent'
                        ? 'bg-red-500 text-white'
                        : 'bg-amber-500 text-white'
                    : 'bg-gray-100 text-gray-400 hover:bg-gray-200'
                }`}
              >
                {s}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="block text-[10px] font-bold text-gray-500 uppercase mb-1">Notes (Optional)</label>
          <textarea
            value={form.notes}
            onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
            rows={3}
            placeholder="Reason for correction..."
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-xs font-semibold resize-none"
          />
        </div>
      </div>

      <div className="px-5 py-4 border-t border-gray-100 flex gap-3">
        <button
          onClick={onClose}
          className="flex-1 h-10 border border-gray-200 text-gray-600 rounded-lg text-xs font-bold uppercase hover:bg-gray-50"
        >
          Cancel
        </button>
        <button
          onClick={handleSave}
          disabled={saving}
          className="flex-1 h-10 bg-indigo-600 text-white rounded-lg text-xs font-bold uppercase hover:bg-indigo-700 disabled:opacity-50"
        >
          {saving ? 'Saving...' : 'Save Changes'}
        </button>
      </div>
    </div>
  )
}

// ── MAIN CORRECTION TAB COMPONENT ───────────────────────────────────────
export default function CorrectionTab() {
  // Load Inter and Roboto fonts
    useEffect(() => {
      const link = document.createElement('link')
      link.href = 'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=Roboto:wght@400;500;700&family=Raleway:wght@700;800;900&display=swap'
      link.rel = 'stylesheet'
      document.head.appendChild(link)
      return () => document.head.removeChild(link)
    }, [])
  
  const { user } = useAuth()
  const { employees } = useEmployees(user?.orgId)
  const { fetchByDate, upsertAttendance, deleteIndividualAttendance } = useAttendance(user?.orgId)

  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0])
  const [results, setResults] = useState([])
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  
  // Selection & Editing
  const [selectedRows, setSelectedRows] = useState([])
  const [inlineEditRow, setInlineEditRow] = useState(null)
  const [inlineForm, setInlineForm] = useState({})
  const [showInlineInTimePicker, setShowInlineInTimePicker] = useState(false)
  const [showInlineOutTimePicker, setShowInlineOutTimePicker] = useState(false)
  
  // Panels
  const [showBulkPanel, setShowBulkPanel] = useState(false)
  const [showBulkAddModal, setShowBulkAddModal] = useState(false)
  const [showEditDrawer, setShowEditDrawer] = useState(false)
  const [drawerRow, setDrawerRow] = useState(null)

  // Handle refresh - stable reference
  const handleRefresh = useCallback(async () => {
    if (!selectedDate || !user?.orgId) return
    if (!employees || employees.length === 0) return
    setLoading(true)
    try {
      const data = await fetchByDate(selectedDate)
      const recordsWithData = data.filter(r => r.inTime || r.outTime || r.isAbsent || r.sundayHoliday || r.sundayWorked)
      
      if (recordsWithData.length === 0) {
        setResults([])
        return
      }
      
      const merged = recordsWithData.map(record => {
        const emp = employees.find(e => e.id === record.employeeId)
        let clockStatus = null
        if (record.clockStatus) {
          clockStatus = record.clockStatus
        } else if (record.isAbsent !== true && record.inTime) {
          const [h] = record.inTime.split(':').map(Number)
          if (h >= 9 && record.inTime > '09:30') clockStatus = 'late'
          else if (record.outTime && record.outTime < '18:00') clockStatus = 'early'
          else if ((!record.inTime || !record.outTime) && !record.isAbsent) clockStatus = 'partial'
        }
        return {
          id: record.employeeId,
          name: emp?.name || record.employeeName || 'Unknown',
          date: selectedDate,
          inDate: record?.inDate || selectedDate,
          in: record?.inTime || (record.sundayHoliday ? 'SUNDAY' : record.sundayWorked ? 'WORKED' : '-'),
          outDate: record?.outDate || selectedDate,
          out: record?.outTime || (record.sundayHoliday ? 'HOLIDAY' : record.sundayWorked ? 'WORKED' : '-'),
          ot: record?.otHours || '-',
          site: record?.remarks || '-',
          status: record.isAbsent ? 'ABSENT' : record.sundayHoliday ? 'SUNDAY' : record.sundayWorked ? 'SUNWORKED' : 'PRESENT',
          isAbsent: record?.isAbsent || false,
          sundayHoliday: record?.sundayHoliday || false,
          sundayWorked: record?.sundayWorked || false,
          clockStatus,
          minDailyHours: emp?.minDailyHours || 8,
          shiftType: record?.shiftType || 'Day',
        }
      })
      setResults(merged)
    } finally {
      setLoading(false)
    }
  }, [selectedDate, user?.orgId, employees, fetchByDate])

  // Load data when date or org or employees changes
  useEffect(() => {
    if (selectedDate && user?.orgId && employees?.length > 0) {
      handleRefresh()
    }
  }, [selectedDate, user?.orgId, handleRefresh])

  const handleViewDay = () => {
    handleRefresh()
  }

  // Logging
  const logCorrection = async (empId, empName, date, oldVals, newVals, method, notes) => {
    try {
      await addDoc(collection(db, 'organisations', user.orgId, 'corrections'), {
        employeeId: empId,
        employeeName: empName,
        date,
        oldValues: oldVals,
        newValues: newVals,
        method,
        notes: notes || '',
        editedBy: user.uid,
        editedByName: user.name,
        timestamp: serverTimestamp(),
      })
    } catch (err) {
      console.error('Failed to log correction:', err)
    }
  }

  // Selection
  const toggleRowSelection = (id) => {
    setSelectedRows(prev => 
      prev.includes(id) ? prev.filter(r => r !== id) : [...prev, id]
    )
  }

  const toggleSelectAll = () => {
    if (selectedRows.length === results.length) {
      setSelectedRows([])
    } else {
      setSelectedRows(results.map(r => r.id))
    }
  }

  // Inline Edit
  const startInlineEdit = (row) => {
    setInlineEditRow(row.id)
    setInlineForm({
      inDate: row.inDate,
      inTime: row.in === '-' ? '' : row.in,
      outDate: row.outDate,
      outTime: row.out === '-' ? '' : row.out,
      ot: row.ot === '-' ? '00:00' : row.ot,
      site: row.site === '-' ? '' : row.site,
      status: row.status === 'ABSENT' ? 'Absent' : row.status === 'SUNDAY' || row.status === 'SUNWORKED' ? 'SunWorked' : row.status === 'SUNHOLIDAY' ? 'SunHoliday' : row.status === 'WORKED' ? 'Worked' : row.status === 'HOLIDAY' ? 'Holiday' : 'Present',
      shiftType: row.shiftType || 'Day',
      minDailyHours: row.minDailyHours || 8,
    })
  }

  const cancelInlineEdit = () => {
    setInlineEditRow(null)
    setInlineForm({})
  }

  const saveInlineEdit = async (row) => {
    setSaving(true)
    try {
      const oldVals = {
        inDate: row.inDate,
        inTime: row.in,
        outDate: row.outDate,
        outTime: row.out,
        otHours: row.ot,
        site: row.site,
        status: row.status,
      }
      
      const isAbsent = inlineForm.status === 'Absent'
      const isHalfDay = inlineForm.status === 'Half-Day'
      const isSunWorked = inlineForm.status === 'SunWorked'
      const isSunHoliday = inlineForm.status === 'SunHoliday'
      const isWorked = inlineForm.status === 'Worked'  // Holiday worked (2x)
      const isNotWorkedHoliday = inlineForm.status === 'Holiday'  // Holiday not worked (1x)
      const otHours = (isAbsent || isHalfDay || isSunHoliday || isNotWorkedHoliday) ? '00:00' : calcOT(inlineForm.inTime, inlineForm.outTime, inlineForm.inDate, inlineForm.outDate, row.minDailyHours || inlineForm.minDailyHours || 8)
      
      const rows = [{
        employeeId: row.id,
        name: row.name,
        date: row.date,
        inDate: inlineForm.inDate,
        inTime: (isAbsent || isSunHoliday || isNotWorkedHoliday) ? '' : inlineForm.inTime,
        outDate: inlineForm.outDate,
        outTime: (isAbsent || isSunHoliday || isNotWorkedHoliday) ? '' : inlineForm.outTime,
        otHours,
        remarks: inlineForm.site,
        isAbsent,
        isHalfDay,
        status: inlineForm.status,
        sundayWorked: isSunWorked,
        sundayHoliday: isSunHoliday,
        holidayWorked: isWorked,
      }]
      
      await upsertAttendance(rows)
      
      const newVals = {
        inDate: inlineForm.inDate,
        inTime: (isAbsent || isSunHoliday || isNotWorkedHoliday) ? '' : inlineForm.inTime,
        outDate: inlineForm.outDate,
        outTime: (isAbsent || isSunHoliday || isNotWorkedHoliday) ? '' : inlineForm.outTime,
        otHours,
        site: inlineForm.site,
        status: inlineForm.status,
      }
      
      await logCorrection(row.id, row.name, row.date, oldVals, newVals, 'Inline Edit', '')
      
      await handleRefresh()
      setInlineEditRow(null)
      setInlineForm({})
    } finally {
      setSaving(false)
    }
  }

  // Bulk Save
  const handleBulkSave = async (updates) => {
    setSaving(true)
    try {
      const rowsToUpdate = results.filter(r => selectedRows.includes(r.id))
      
      for (const row of rowsToUpdate) {
        const oldVals = {
          inDate: row.inDate,
          inTime: row.in,
          outDate: row.outDate,
          outTime: row.out,
          otHours: row.ot,
          site: row.site,
          status: row.status,
        }
        
        const isAbsent = updates.isAbsent
        const inDate = updates.inDate || row.inDate
        const outDate = updates.outDate || row.outDate
        const inTime = isAbsent ? '' : (updates.inTime || row.in)
        const outTime = isAbsent ? '' : (updates.outTime || row.out)
        const otHours = isAbsent ? '00:00' : calcOT(inTime, outTime, inDate, outDate, row.minDailyHours || 8)
        
        const rows = [{
          employeeId: row.id,
          name: row.name,
          date: row.date,
          inDate,
          inTime,
          outDate,
          outTime,
          otHours,
          remarks: updates.site || row.site,
          isAbsent,
          status: isAbsent ? 'Absent' : 'Present',
          sundayWorked: false,
          sundayHoliday: false,
        }]
        
        await upsertAttendance(rows)
        
        const newVals = {
          inDate,
          inTime,
          outDate,
          outTime,
          otHours,
          site: updates.site || row.site,
          status: isAbsent ? 'ABSENT' : 'PRESENT',
        }
        
        await logCorrection(row.id, row.name, row.date, oldVals, newVals, 'Bulk Edit', '')
      }
      
      await handleRefresh()
      setSelectedRows([])
      setShowBulkPanel(false)
    } finally {
      setSaving(false)
    }
  }

  // Drawer Save
  const handleDrawerSave = async (row, oldVals, newVals, notes) => {
    setSaving(true)
    try {
      const isAbsent = newVals.isAbsent
      const rows = [{
        employeeId: row.id,
        name: row.name,
        date: row.date,
        inDate: newVals.inDate,
        inTime: isAbsent ? '' : newVals.inTime,
        outDate: newVals.outDate,
        outTime: isAbsent ? '' : newVals.outTime,
        otHours: newVals.otHours,
        remarks: newVals.site,
        isAbsent,
        status: isAbsent ? 'Absent' : 'Present',
        sundayWorked: false,
        sundayHoliday: false,
      }]
      
      await upsertAttendance(rows)
      await logCorrection(row.id, row.name, row.date, oldVals, newVals, 'Drawer Edit', notes)
      
      await handleRefresh()
      setShowEditDrawer(false)
      setDrawerRow(null)
    } finally {
      setSaving(false)
    }
  }

  const handleDeleteEntry = async (row) => {
    if (!window.confirm(`Are you sure you want to delete the attendance entry for ${row.name} on ${formatDateShort(row.date)}? This will reset the data to zero.`)) return
    
    setSaving(true)
    try {
      const oldVals = {
        inDate: row.inDate,
        inTime: row.in,
        outDate: row.outDate,
        outTime: row.out,
        otHours: row.ot,
        site: row.site,
        status: row.status,
      }
      
      await deleteIndividualAttendance(row.date, row.id)
      await logCorrection(row.id, row.name, row.date, oldVals, { deleted: true }, 'Delete Entry', 'Attendance record completely removed')
      
      await handleRefresh()
      setShowEditDrawer(false)
      setDrawerRow(null)
    } catch (err) {
      alert('Failed to delete attendance: ' + err.message)
    } finally {
      setSaving(false)
    }
  }

  // Print
  const handlePrint = () => {
    window.print()
  }

  return (
    <div className="h-full flex flex-col font-['Roboto',sans-serif] overflow-hidden bg-gray-50/50 p-6">
      <style>{`
        @media print {
          body * { visibility: hidden; }
          .print-section, .print-section * { visibility: visible; }
          .print-section { position: absolute; left: 0; top: 0; width: 100%; }
          .no-print { display: none !important; }
          .print-table { width: 100%; border-collapse: collapse; }
          .print-table th, .print-table td { border: 1px solid #ddd; padding: 6px; font-size: 10px; }
        }
      `}</style>

      {/* Page Header */}
      <div className="mb-4 no-print">
        <h1 className="text-lg font-black text-gray-800 uppercase tracking-tight font-['Roboto',sans-serif]">Attendance Correction</h1>
        <p className="text-xs text-gray-500 mt-0.5 font-['Roboto',sans-serif]">Review and revise employee attendance records.</p>
      </div>

      {/* Filter Bar */}
      <div className="no-print">
        <AttendanceFilterBar
          selectedDate={selectedDate}
          setSelectedDate={setSelectedDate}
          onRefresh={handleRefresh}
          onViewDay={handleViewDay}
          loading={loading}
        />
      </div>

      {/* Summary Cards */}
      <AttendanceSummaryCards results={results} />

      {/* Main Content */}
      <div className="flex-1 bg-white rounded-[12px] border border-gray-100 shadow-sm overflow-hidden flex flex-col min-h-0">
        {/* Table Header */}
        <div className="px-4 py-3 border-b border-gray-100 flex justify-between items-center bg-white shrink-0 no-print">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-indigo-50 flex items-center justify-center">
              <FileText size={16} className="text-indigo-600" />
            </div>
            <h3 className="text-[12px] font-black text-gray-800 uppercase tracking-tight">Attendance Records</h3>
            <span className="text-[10px] text-gray-400">({results.length} employees)</span>
          </div>
          
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowBulkAddModal(true)}
              className="h-[32px] px-4 bg-indigo-600 text-white rounded-lg text-[10px] font-bold uppercase hover:bg-indigo-700 transition-all flex items-center gap-1.5 shadow-md"
            >
              <Plus size={12} strokeWidth={3} /> Bulk Add
            </button>

            {selectedRows.length > 0 && (
              <button
                onClick={() => setShowBulkPanel(true)}
                className="h-[32px] px-4 bg-orange-500 text-white rounded-lg text-[10px] font-bold uppercase hover:bg-orange-600 transition-all"
              >
                Bulk Edit ({selectedRows.length})
              </button>
            )}
            
            <button
              onClick={handlePrint}
              className="h-[32px] px-3 bg-gray-100 text-gray-600 rounded-lg text-[10px] font-bold uppercase hover:bg-gray-200 transition-all flex items-center gap-1.5"
            >
              <Printer size={12} /> Print
            </button>
          </div>
        </div>

        {/* Table */}
        <div className="flex-1 overflow-auto rounded-lg border border-zinc-200 bg-white shadow-sm">
          {loading ? (
            <div className="flex justify-center py-20"><Spinner /></div>
          ) : (
            <table className="w-full caption-bottom text-sm border-collapse">
              <thead className="border-b border-zinc-200 bg-zinc-50/80 [&_tr]:border-b">
                <tr className="border-b border-zinc-200">
                  <th className="w-[40px] px-3 py-2 text-center align-middle text-xs font-medium text-zinc-500 no-print">
                    <input
                      type="checkbox"
                      checked={selectedRows.length === results.length && results.length > 0}
                      onChange={toggleSelectAll}
                      className="w-4 h-4 rounded text-indigo-600"
                    />
                  </th>
                  <th className="h-10 px-3 text-left align-middle text-xs font-medium text-zinc-500">Date</th>
                  <th className="h-10 px-3 text-left align-middle text-xs font-medium text-zinc-500">Employee Name</th>
                  <th className="h-10 px-3 text-center align-middle text-xs font-medium text-zinc-500">Shift</th>
                  <th className="h-10 px-3 text-center align-middle text-xs font-medium text-zinc-500">In Time</th>
                  <th className="h-10 px-3 text-center align-middle text-xs font-medium text-zinc-500">Out Time</th>
                  <th className="h-10 px-3 text-center align-middle text-xs font-medium text-zinc-500">OT</th>
                  <th className="h-10 px-3 text-left align-middle text-xs font-medium text-zinc-500">Site</th>
                  <th className="h-10 px-3 text-center align-middle text-xs font-medium text-zinc-500">Status</th>
                  <th className="h-10 px-3 text-center align-middle text-xs font-medium text-zinc-500 min-w-[100px] no-print">Actions</th>
                </tr>
              </thead>
              <tbody className="[&_tr:last-child]:border-0">
                {results.length === 0 ? (
                  <tr>
                    <td colSpan={10} className="text-center py-16 text-gray-300 italic text-xs font-medium">
                      No records found for this date
                    </td>
                  </tr>
                ) : results.map((row, idx) => (
                  <tr key={idx} className="border-b border-zinc-200 hover:bg-zinc-50/80 transition-colors group">
                    {/* Checkbox */}
                    <td className="px-3 py-1.5 align-middle no-print">
                      <input
                        type="checkbox"
                        checked={selectedRows.includes(row.id)}
                        onChange={() => toggleRowSelection(row.id)}
                        className="w-4 h-4 rounded text-indigo-600"
                      />
                    </td>
                    
                    {/* Date */}
                    <td className="px-3 py-1.5 align-middle whitespace-nowrap text-[12px] font-medium text-zinc-500">
                      {formatDateShort(row.date)}
                    </td>
                    
                    {/* Employee Name */}
                    <td className="px-3 py-1.5 align-middle whitespace-nowrap text-[12px] font-medium text-zinc-700 uppercase truncate">
                      {row.name}
                    </td>
                    
                    {/* Shift Type - Toggle */}
                    <td className="px-3 py-1.5 align-middle text-center no-print">
                      {inlineEditRow === row.id ? (
                        <button
                          onClick={() => {
                            const newShift = inlineForm.shiftType === 'Day' ? 'Night' : 'Day'
                            const newOutDate = newShift === 'Night' 
                              ? new Date(new Date(inlineForm.inDate).getTime() + 86400000).toISOString().split('T')[0]
                              : inlineForm.inDate
                            setInlineForm(f => ({ 
                              ...f, 
                              shiftType: newShift,
                              outDate: newOutDate,
                              otHours: calcOT(inlineForm.inTime, inlineForm.outTime, inlineForm.inDate, newOutDate, inlineForm.minDailyHours || results.find(r => r.id === inlineEditRow)?.minDailyHours || 8)
                            }))
                          }}
                          className={`w-[60px] h-5 rounded-full p-[1px] flex items-center transition-all ${inlineForm.shiftType === 'Night' ? 'bg-slate-700' : 'bg-emerald-100'}`}
                        >
                          <span className={`text-[7px] font-bold ${inlineForm.shiftType === 'Night' ? 'text-slate-300 ml-1' : 'text-emerald-700 mr-1'}`}>
                            {inlineForm.shiftType === 'Night' ? 'NIGHT' : 'DAY'}
                          </span>
                          <div className={`w-3 h-3 bg-white rounded-full shadow-sm transition-all ${inlineForm.shiftType === 'Night' ? 'ml-auto' : 'mr-auto'}`} />
                        </button>
                      ) : (
                        <div className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-[9px] font-bold ${row.shiftType === 'Night' ? 'bg-slate-100 text-slate-700' : 'bg-emerald-100 text-emerald-700'}`}>
                          {row.shiftType === 'Night' ? 'NIGHT' : 'DAY'}
                        </div>
                      )}
                    </td>
                    
                    {/* In Time - Inline Edit */}
                    <td className="px-3 py-1.5 align-middle text-center no-print">
                      {inlineEditRow === row.id ? (
                        <div className="relative">
                          <button
                            onClick={() => setShowInlineInTimePicker(!showInlineInTimePicker)}
                            className="w-full h-7 text-[10px] border border-indigo-300 rounded px-1 font-semibold text-left"
                          >
                            {inlineForm.inTime ? (() => {
                              const [h, m] = inlineForm.inTime.split(':').map(Number)
                              const p = h >= 12 ? 'PM' : 'AM'
                              const h12 = h % 12 || 12
                              return `${h12}:${String(m).padStart(2, '0')} ${p}`
                            })() : 'Select'}
                          </button>
                          {showInlineInTimePicker && (
                            <TimePicker
                              value={inlineForm.inTime || '09:00'}
                              onChange={(time) => setInlineForm(f => ({ ...f, inTime: time }))}
                              onClose={() => setShowInlineInTimePicker(false)}
                            />
                          )}
                        </div>
                      ) : (
                        <span className="text-[12px] font-medium text-zinc-600">
                          {row.in === '-' ? '-' : formatTimeTo12Hour(row.in)}
                        </span>
                      )}
                    </td>
                    
                    {/* Out Time - Inline Edit */}
                    <td className="px-3 py-1.5 align-middle text-center no-print">
                      {inlineEditRow === row.id ? (
                        <div className="relative">
                          <button
                            onClick={() => setShowInlineOutTimePicker(!showInlineOutTimePicker)}
                            className="w-full h-7 text-[10px] border border-indigo-300 rounded px-1 font-semibold text-left"
                          >
                            {inlineForm.outTime ? (() => {
                              const [h, m] = inlineForm.outTime.split(':').map(Number)
                              const p = h >= 12 ? 'PM' : 'AM'
                              const h12 = h % 12 || 12
                              return `${h12}:${String(m).padStart(2, '0')} ${p}`
                            })() : 'Select'}
                          </button>
                          {showInlineOutTimePicker && (
                            <TimePicker
                              value={inlineForm.outTime || '18:00'}
                              onChange={(time) => setInlineForm(f => ({ ...f, outTime: time }))}
                              onClose={() => setShowInlineOutTimePicker(false)}
                            />
                          )}
                          {inlineForm.shiftType === 'Night' && inlineForm.outDate && (
                            <div className="flex items-center justify-center gap-1 mt-0.5">
                              <ArrowRightIcon size={10} className="text-slate-400" />
                              <span className="text-[8px] text-slate-500">{displayShortDate(inlineForm.outDate)}</span>
                            </div>
                          )}
                        </div>
                      ) : (
                        <div>
                          <span className="text-[12px] font-medium text-zinc-600">
                            {row.out === '-' ? '-' : formatTimeTo12Hour(row.out)}
                          </span>
                          {row.shiftType === 'Night' && row.outDate && (
                            <div className="flex items-center justify-center gap-1 mt-0.5">
                              <ArrowRightIcon size={10} className="text-slate-400" />
                              <span className="text-[8px] text-slate-500">{displayShortDate(row.outDate)}</span>
                            </div>
                          )}
                        </div>
                      )}
                    </td>
                    
                    {/* OT */}
                    <td className="px-3 py-1.5 align-middle text-center">
                      <span className="text-[12px] font-medium text-indigo-600">
                        {row.ot === '-' ? '-' : formatOTDisplay(row.ot)}
                      </span>
                    </td>
                    
                    {/* Site - Inline Edit */}
                    <td className="px-3 py-1.5 align-middle whitespace-nowrap no-print">
                      {inlineEditRow === row.id ? (
                        <input
                          type="text"
                          value={inlineForm.site}
                          onChange={e => setInlineForm(f => ({ ...f, site: e.target.value }))}
                          className="w-full h-7 text-[10px] border border-indigo-300 rounded px-1 font-semibold"
                          placeholder="Site"
                        />
                      ) : (
                        <span className="text-[12px] font-medium text-zinc-500 uppercase truncate">
                          {row.site === '-' ? '-' : row.site}
                        </span>
                      )}
                    </td>
                    
                    {/* Status - Inline Edit */}
                    <td className="px-3 py-1.5 align-middle text-center no-print">
                      {inlineEditRow === row.id ? (
                        <select
                          value={inlineForm.status}
                          onChange={e => setInlineForm(f => ({ ...f, status: e.target.value }))}
                          className="w-full h-7 text-[10px] border border-indigo-300 rounded px-1 font-semibold"
                        >
                          <option value="Present">Present</option>
                          <option value="Absent">Absent</option>
                          <option value="Half-Day">Half-Day</option>
                          <option value="SunWorked">SunWorked (1x)</option>
                          <option value="SunHoliday">SunHoliday (1x)</option>
                          <option value="Worked">Worked (2x)</option>
                          <option value="Holiday">Holiday (1x)</option>
                        </select>
                      ) : (
                        <span className={`px-2 py-0.5 rounded text-[8px] font-bold uppercase tracking-wider ${
                          row.status === 'PRESENT' ? 'bg-green-100 text-green-600' :
                          row.status === 'ABSENT' ? 'bg-red-100 text-red-500' :
                          row.status === 'HALF-DAY' ? 'bg-amber-100 text-amber-600' :
                          row.status === 'SUNWORKED' ? 'bg-amber-100 text-amber-600' :
                          row.status === 'WORKED' ? 'bg-purple-100 text-purple-600' :
                          'bg-gray-100 text-gray-400'
                        }`}>
                          {row.status}
                        </span>
                      )}
                    </td>
                    
                    {/* Actions */}
                    <td className="px-3 py-1.5 align-middle text-center no-print">
                      {inlineEditRow === row.id ? (
                        <div className="flex items-center justify-center gap-1">
                          <button
                            onClick={() => saveInlineEdit(row)}
                            disabled={saving}
                            className="p-1 rounded bg-green-500 text-white hover:bg-green-600"
                          >
                            <Check size={12} />
                          </button>
                          <button
                            onClick={cancelInlineEdit}
                            className="p-1 rounded bg-gray-200 text-gray-600 hover:bg-gray-300"
                          >
                            <X size={12} />
                          </button>
                        </div>
                      ) : (
                        <div className="flex items-center justify-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button
                            onClick={() => startInlineEdit(row)}
                            className="p-1.5 rounded-md text-indigo-600 hover:bg-indigo-50"
                            title="Inline Edit"
                          >
                            <Edit2 size={12} />
                          </button>
                          <button
                            onClick={() => { setDrawerRow(row); setShowEditDrawer(true) }}
                            className="p-1.5 rounded-md text-orange-600 hover:bg-orange-50"
                            title="Edit in Drawer"
                          >
                            <FileText size={12} />
                          </button>
                          <button
                            onClick={() => handleDeleteEntry(row)}
                            className="p-1.5 rounded-md text-red-500 hover:bg-red-50"
                            title="Delete Entry"
                          >
                            <Trash2 size={12} />
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* Bulk Correction Panel */}
      <BulkCorrectionPanel
        isOpen={showBulkPanel}
        onClose={() => setShowBulkPanel(false)}
        selectedRows={results.filter(r => selectedRows.includes(r.id))}
        onBulkSave={handleBulkSave}
        saving={saving}
      />

      {/* Edit Drawer */}
      <EditDrawer
        isOpen={showEditDrawer}
        onClose={() => { setShowEditDrawer(false); setDrawerRow(null) }}
        row={drawerRow}
        onSave={handleDrawerSave}
        onDelete={handleDeleteEntry}
        saving={saving}
      />

      {/* Bulk Add Modal */}
      <BulkAttendanceModal
        isOpen={showBulkAddModal}
        onClose={() => {
          setShowBulkAddModal(false)
          handleRefresh()
        }}
        employees={employees}
        orgId={user?.orgId}
      />
    </div>
  )
}
