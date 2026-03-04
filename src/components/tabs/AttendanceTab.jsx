import { useState, useEffect, useMemo } from 'react'
import { useAuth } from '../../hooks/useAuth'
import { useEmployees } from '../../hooks/useEmployees'
import { useAttendance, calcOT } from '../../hooks/useAttendance'
import { db } from '../../lib/firebase'
import { doc, getDoc } from 'firebase/firestore'
import Spinner from '../ui/Spinner'
import Modal from '../ui/Modal'
import { ChevronLeft, ChevronRight, Check } from 'lucide-react'
import { formatTimeTo12Hour } from '../../lib/salaryUtils'
import TimePicker from '../ui/TimePicker'

function getInitials(name) {
  return name?.split(' ').map(n => n[0]).join('').toUpperCase() || '??'
}

function getAvatarColor(id) {
  let hash = 0
  for (let i = 0; i < (id || '').length; i++) hash = id.charCodeAt(i) + ((hash << 5) - hash)
  const h = hash % 360
  return `hsl(${h}, 70%, 50%)`
}

function formatDate(date) {
  const d = new Date(date)
  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
  return `${days[d.getDay()]}, ${String(d.getDate()).padStart(2, '0')} ${months[d.getMonth()]} ${d.getFullYear()}`
}

function formatDateForInput(date) {
  const d = new Date(date)
  return d.toISOString().split('T')[0]
}

export default function AttendanceTab() {
  const { user } = useAuth()
  const { employees, loading: empLoading } = useEmployees(user?.orgId, true)
  const { fetchByDate, upsertAttendance, loading: attLoading } = useAttendance(user?.orgId)

  const [selectedDate, setSelectedDate] = useState(formatDateForInput(new Date()))
  const [rows, setRows] = useState([])
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [orgData, setOrgData] = useState(null)
  const [existingRecords, setExistingRecords] = useState([])
  
  const [showWarning, setShowWarning] = useState(false)
  const [copyData, setCopyData] = useState(null)
  const [showCopyModal, setShowCopyModal] = useState(false)
  const [copyConfig, setCopyConfig] = useState({ inTime: false, outTime: true })
  const [selectedEmps, setSelectedEmps] = useState([])

  const [activeTimePicker, setActiveTimePicker] = useState(null) // { empId, field, value }

  const activeEmployees = useMemo(() => employees.filter(e => e.status === 'Active'), [employees])
  const isSunday = new Date(selectedDate).getDay() === 0
  const isDayShift = orgData?.shiftStrategy === 'Day'

  useEffect(() => {
    if (!user?.orgId || !selectedDate) return
    getDoc(doc(db, 'organisations', user.orgId)).then(snap => {
      if (snap.exists()) setOrgData(snap.data())
    })
    fetchByDate(selectedDate).then(records => {
      setExistingRecords(records)
      if (records.length > 0) setRows(records)
      else setRows([])
    })
  }, [user?.orgId, selectedDate])

  const handleGenerate = () => {
    if (!activeEmployees.length) return
    const newRows = activeEmployees.map(emp => ({
      employeeId: emp.id,
      name: emp.name,
      date: selectedDate,
      inDate: selectedDate,
      inTime: emp.shift?.startTime || '09:00',
      outDate: selectedDate,
      outTime: emp.shift?.endTime || '18:00',
      otHours: '00:00',
      remarks: emp.site || '',
      isAbsent: false,
      sundayWorked: false,
      sundayHoliday: false,
      status: 'Present'
    }))
    setRows(newRows)
  }

  const updateRow = (empId, field, value) => {
    setRows(prev => prev.map(r => {
      if (r.employeeId !== empId) return r
      const updated = { ...r, [field]: value }
      if (field === 'inDate' && isDayShift) updated.outDate = value
      if (['inTime', 'outTime', 'inDate', 'outDate'].includes(field)) {
        updated.otHours = calcOT(updated.inTime, updated.outTime, updated.inDate, updated.outDate, r.workHours || 9)
        if (field === 'outTime' && value) {
          setCopyData({ inTime: updated.inTime, outTime: updated.outTime, inDate: updated.inDate, outDate: updated.outDate })
          setShowCopyModal(true)
        }
      }
      return updated
    }))
  }

  const handleStatusChange = (empId, newStatus) => {
    setRows(prev => prev.map(r => {
      if (r.employeeId !== empId) return r
      const updated = { ...r, status: newStatus }
      updated.isAbsent = newStatus === 'Absent'
      updated.sundayWorked = newStatus === 'SunWorked'
      updated.sundayHoliday = newStatus === 'SunHoliday'
      if (updated.isAbsent || updated.sundayHoliday) {
        updated.inTime = ''; updated.outTime = ''; updated.otHours = '00:00'
      }
      return updated
    }))
  }

  const handleSubmit = async () => {
    if (!rows.length) return
    const hasOverlap = rows.some(row => existingRecords.some(ex => ex.employeeId === row.employeeId))
    if (hasOverlap && !showWarning) {
      setShowWarning(true)
      return
    }
    setSaving(true)
    try {
      await upsertAttendance(rows)
      setSaved(true)
      setShowWarning(false)
      setTimeout(() => setSaved(false), 3000)
    } finally {
      setSaving(false)
    }
  }

  const handleCopySubmit = () => {
    setRows(prev => prev.map(r => {
      if (selectedEmps.includes(r.employeeId)) {
        const updated = { ...r }
        if (copyConfig.inTime) updated.inTime = copyData.inTime
        if (copyConfig.outTime) updated.outTime = copyData.outTime
        updated.otHours = calcOT(updated.inTime, updated.outTime, updated.inDate, updated.outDate, r.workHours || 9)
        return updated
      }
      return r
    }))
    setShowCopyModal(false); setSelectedEmps([])
  }

  return (
    <div className="flex flex-col h-full gap-6 font-inter">
      {/* Header Card */}
      <div className="bg-white p-6 rounded-[12px] shadow-sm flex justify-between items-center border border-gray-100/50">
        <div className="flex items-center gap-4">
          <div className="flex items-center bg-gray-50 rounded-lg p-1 border border-gray-200">
            <button onClick={() => setSelectedDate(d => { const nd = new Date(d); nd.setDate(nd.getDate() - 1); return formatDateForInput(nd); })} className="p-1.5 hover:bg-white hover:shadow-sm rounded-md text-gray-500 transition-all"><ChevronLeft size={16} /></button>
            <input type="date" value={selectedDate} onChange={e => setSelectedDate(e.target.value)} className="font-semibold bg-transparent border-none outline-none px-3 text-sm text-gray-700 h-[32px]" />
            <button onClick={() => setSelectedDate(d => { const nd = new Date(d); nd.setDate(nd.getDate() + 1); return formatDateForInput(nd); })} className="p-1.5 hover:bg-white hover:shadow-sm rounded-md text-gray-500 transition-all"><ChevronRight size={16} /></button>
          </div>
          <div className="flex flex-col">
            <span className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider leading-none mb-1">{formatDate(selectedDate)}</span>
            {isSunday && <span className="text-[10px] font-bold text-orange-600 uppercase tracking-widest flex items-center gap-1">Sunday Routine</span>}
          </div>
        </div>
        <button onClick={handleGenerate} className="h-[40px] px-[16px] bg-indigo-600 text-white font-semibold rounded-[8px] text-[13px] shadow-sm hover:bg-indigo-700 transition-all uppercase tracking-widest">Generate Active</button>
      </div>

      {/* Main Table Card */}
      <div className="flex-1 bg-white rounded-[12px] border border-gray-100 shadow-sm overflow-hidden flex flex-col">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="h-[42px] bg-[#f9fafb]">
                <th className="px-[16px] text-[12px] font-semibold text-[#6b7280] uppercase tracking-wider w-[20%]">Employee</th>
                <th className="px-[16px] text-[12px] font-semibold text-[#6b7280] uppercase tracking-wider text-center">In Time</th>
                <th className="px-[16px] text-[12px] font-semibold text-[#6b7280] uppercase tracking-wider text-center">Out Time</th>
                <th className="px-[16px] text-[12px] font-semibold text-[#6b7280] uppercase tracking-wider text-center">OT</th>
                <th className="px-[16px] text-[12px] font-semibold text-[#6b7280] uppercase tracking-wider">Remarks</th>
                <th className="px-[16px] text-[12px] font-semibold text-[#6b7280] uppercase tracking-wider text-right">Status Toggle</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#f1f5f9]">
              {empLoading ? (
                <tr><td colSpan={6} className="text-center py-12"><Spinner /></td></tr>
              ) : rows.length === 0 ? (
                <tr><td colSpan={6} className="text-center py-20 text-gray-300 font-medium uppercase tracking-tighter text-lg opacity-40 italic">Ready to generate attendance</td></tr>
              ) : (
                rows.map((row, idx) => (
                  <tr key={row.employeeId} className={`h-[48px] transition-colors hover:bg-[#f8fafc] ${row.isAbsent ? 'bg-red-50/20' : ''}`}>
                    <td className="px-[16px] flex items-center gap-3 h-[48px]">
                      <div className="w-7 h-7 rounded-lg flex items-center justify-center text-white text-[10px] font-bold shrink-0 shadow-sm" style={{ backgroundColor: getAvatarColor(row.employeeId) }}>{getInitials(row.name)}</div>
                      <span className="font-semibold text-gray-700 text-[13px] truncate">{row.name}</span>
                    </td>
                    <td className="px-[16px]">
                      <div className="flex gap-1 justify-center">
                        <input type="date" value={row.inDate || ''} disabled={row.isAbsent || row.status === 'SunHoliday'} onChange={e => updateRow(row.employeeId, 'inDate', e.target.value)} className="w-[110px] border-none bg-transparent p-0 text-[12px] font-medium text-gray-600 focus:ring-0 disabled:opacity-20" />
                        <button 
                          disabled={row.isAbsent || row.status === 'SunHoliday'} 
                          onClick={() => setActiveTimePicker({ empId: row.employeeId, field: 'inTime', value: row.inTime })}
                          className="w-[80px] border-none bg-transparent p-0 text-[12px] font-bold text-gray-800 focus:ring-0 disabled:opacity-20 text-left hover:text-indigo-600"
                        >
                          {formatTimeTo12Hour(row.inTime)}
                        </button>
                      </div>
                    </td>
                    <td className="px-[16px]">
                      <div className="flex gap-1 justify-center">
                        <input type="date" value={row.outDate || ''} disabled={row.isAbsent || row.status === 'SunHoliday'} onChange={e => updateRow(row.employeeId, 'outDate', e.target.value)} className="w-[110px] border-none bg-transparent p-0 text-[12px] font-medium text-gray-600 focus:ring-0 disabled:opacity-20" />
                        <button 
                          disabled={row.isAbsent || row.status === 'SunHoliday'} 
                          onClick={() => setActiveTimePicker({ empId: row.employeeId, field: 'outTime', value: row.outTime })}
                          className="w-[80px] border-none bg-transparent p-0 text-[12px] font-bold text-gray-800 focus:ring-0 disabled:opacity-20 text-left hover:text-indigo-600"
                        >
                          {formatTimeTo12Hour(row.outTime)}
                        </button>
                      </div>
                    </td>
                    <td className="px-[16px] text-center font-mono font-bold text-indigo-600 text-[13px]">{row.otHours || '00:00'}</td>
                    <td className="px-[16px]">
                      <input type="text" value={row.remarks || ''} onChange={e => updateRow(row.employeeId, 'remarks', e.target.value)} className="w-full border-none bg-transparent p-0 text-[12px] focus:ring-0 text-gray-500 placeholder-gray-300" placeholder="..." />
                    </td>
                    <td className="px-[16px]">
                      <div className="flex items-center gap-1 justify-end">
                        {[
                          { id: 'Present', label: 'Present', short: 'P', color: 'green' },
                          { id: 'Absent', label: 'Absent', short: 'A', color: 'red' },
                          ...(isSunday ? [
                            { id: 'SunWorked', label: 'Worked', short: 'W', color: 'amber' },
                            { id: 'SunHoliday', label: 'Holiday', short: 'H', color: 'indigo' }
                          ] : [])
                        ].map(st => (
                          <button 
                            key={st.id}
                            onClick={() => handleStatusChange(row.employeeId, st.id)}
                            title={st.label}
                            className={`px-2 py-1 rounded-md text-[10px] font-bold border transition-all uppercase tracking-tighter ${row.status === st.id ? `bg-${st.color}-600 text-white border-${st.color}-600 shadow-sm scale-105` : 'bg-white text-gray-300 border-gray-100 hover:bg-gray-50'}`}
                          >
                            {st.short}
                          </button>
                        ))}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Bottom Footer Card */}
      <div className="bg-white p-4 rounded-[12px] border border-gray-100 shadow-sm flex justify-between items-center">
        <div className="flex gap-8 px-4">
          <div className="flex items-center gap-2">
            <div className="w-2.5 h-2.5 bg-green-500 rounded-full shadow-sm"></div>
            <span className="text-[11px] font-bold text-gray-500 uppercase tracking-widest">Present: {rows.filter(r => !r.isAbsent && !r.sundayHoliday).length}</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-2.5 h-2.5 bg-red-500 rounded-full shadow-sm"></div>
            <span className="text-[11px] font-bold text-gray-500 uppercase tracking-widest">Absent: {rows.filter(r => r.isAbsent).length}</span>
          </div>
        </div>
        <div className="flex items-center gap-4">
          {saved && <div className="flex items-center gap-1.5 text-green-600 text-[11px] font-bold uppercase tracking-widest animate-pulse"><Check size={14} strokeWidth={3} /> Changes Synced</div>}
          <button onClick={handleSubmit} disabled={saving || rows.length === 0} className="h-[40px] px-[24px] bg-indigo-600 text-white font-bold rounded-[8px] text-[13px] shadow-lg hover:bg-indigo-700 transition-all uppercase tracking-widest disabled:opacity-50">
            {saving ? 'Processing...' : 'Submit Records'}
          </button>
        </div>
      </div>

      {/* Warning Modal */}
      <Modal isOpen={showWarning} onClose={() => setShowWarning(false)} title="Conflict Detected">
        <div className="p-6 text-center">
          <div className="text-4xl mb-4">⚠️</div>
          <h3 className="text-lg font-bold text-gray-800 mb-2 uppercase tracking-tight">Records Already Exist</h3>
          <p className="text-[13px] text-gray-500 mb-8 leading-relaxed">Some employees already have attendance data for this specific date. Overwriting will replace their current logs. Do you wish to continue?</p>
          <div className="flex gap-3">
            <button onClick={() => setShowWarning(false)} className="flex-1 h-[40px] border border-gray-200 rounded-[8px] text-[12px] font-bold text-gray-400 uppercase tracking-widest hover:bg-gray-50 transition-all">Abort</button>
            <button onClick={() => { setShowWarning(false); handleSubmit(); }} className="flex-1 h-[40px] bg-indigo-600 text-white rounded-[8px] text-[12px] font-bold shadow-xl uppercase tracking-widest hover:bg-indigo-700 transition-all">Overwrite</button>
          </div>
        </div>
      </Modal>

      {/* Copy Modal */}
      <Modal isOpen={showCopyModal} onClose={() => setShowCopyModal(false)} title="Propagation Tool">
        <div className="p-2 w-72 max-h-[70vh] flex flex-col">
          <div className="flex gap-3 mb-3 bg-indigo-50/50 p-3 rounded-xl border border-indigo-100">
             <label className="flex items-center gap-2 cursor-pointer flex-1"><input type="checkbox" checked={copyConfig.inTime} onChange={e => setCopyConfig(c => ({...c, inTime: e.target.checked}))} className="w-4 h-4 rounded text-indigo-600" /><span className="text-[11px] font-bold text-indigo-700 uppercase tracking-wider">In Time</span></label>
             <label className="flex items-center gap-2 cursor-pointer flex-1"><input type="checkbox" checked={copyConfig.outTime} onChange={e => setCopyConfig(c => ({...c, outTime: e.target.checked}))} className="w-4 h-4 rounded text-indigo-600" /><span className="text-[11px] font-bold text-indigo-700 uppercase tracking-wider">Out Time</span></label>
          </div>
          <div className="flex-1 overflow-y-auto border border-gray-100 rounded-xl mb-4 bg-gray-50/30">
            <div className="p-2 border-b border-gray-100 bg-white/50 sticky top-0 z-10">
              <p className="text-[9px] font-bold text-gray-400 uppercase tracking-widest px-2">Selection Roster</p>
            </div>
            {activeEmployees.map(emp => (
              <label key={emp.id} className="flex items-center gap-3 px-4 py-2 hover:bg-white cursor-pointer border-b border-gray-100 last:border-0 transition-colors group">
                <input type="checkbox" checked={selectedEmps.includes(emp.id)} onChange={e => {
                  if (e.target.checked) setSelectedEmps(p => [...p, emp.id])
                  else setSelectedEmps(p => p.filter(id => id !== emp.id))
                }} className="w-4 h-4 rounded text-indigo-600" />
                <span className="text-[12px] font-semibold text-gray-600 uppercase truncate group-hover:text-gray-900 transition-colors">{emp.name}</span>
              </label>
            ))}
          </div>
          <button onClick={handleCopySubmit} className="h-[40px] w-full bg-indigo-600 text-white font-bold rounded-[8px] text-[12px] shadow-lg uppercase tracking-widest hover:bg-indigo-700 transition-all">Copy to Selection</button>
        </div>
      </Modal>

      {/* Time Picker Modal */}
      {activeTimePicker && (
        <TimePicker 
          value={activeTimePicker.value}
          onChange={(val) => updateRow(activeTimePicker.empId, activeTimePicker.field, val)}
          onClose={() => setActiveTimePicker(null)}
        />
      )}
    </div>
  )
}
