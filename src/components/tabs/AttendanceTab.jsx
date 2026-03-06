import { useState, useEffect, useMemo, useRef } from 'react'
import { useAuth } from '../../hooks/useAuth'
import { useEmployees } from '../../hooks/useEmployees'
import { useAttendance, calcOT } from '../../hooks/useAttendance'
import { db } from '../../lib/firebase'
import { doc, getDoc } from 'firebase/firestore'
import Spinner from '../ui/Spinner'
import Modal from '../ui/Modal'
import TimePicker from '../ui/TimePicker'
import { ChevronLeft, ChevronRight, Check, Copy, X, Plus } from 'lucide-react'
import { logActivity } from '../../hooks/useActivityLog'

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

// Display date as DD-MM-YYYY
function displayDate(isoDate) {
  if (!isoDate) return ''
  const [y, m, d] = isoDate.split('-')
  return `${d}-${m}-${y}`
}

// ─── Dropdown Copy Picker ───────────────────────────────────────────────────
function CopyToDropdown({ activeEmployees, copyConfig, setCopyConfig, selectedEmps, setSelectedEmps, onApply, onClose }) {
  const dropdownRef = useRef(null);

  useEffect(() => {
    function handleClickOutside(event) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        onClose();
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [onClose]);

  return (
    <div
      ref={dropdownRef}
      className="absolute top-0 left-full ml-2 z-[1000] bg-white rounded-[10px] shadow-[0_8px_24px_rgba(0,0,0,0.12)] border border-gray-100 p-2.5 w-[210px] font-inter animate-in fade-in slide-in-from-left-2 duration-200"
      onClick={(e) => e.stopPropagation()}
    >
      <div className="pb-1.5 border-b border-gray-100 mb-2">
        <p className="text-[10px] font-black text-indigo-600 uppercase tracking-[0.08em]">Copy to</p>
      </div>

      <div className="flex gap-2 mb-2 bg-indigo-50/50 p-1.5 rounded-lg border border-indigo-100">
        <label className="flex items-center gap-1.5 cursor-pointer flex-1">
          <input type="checkbox" checked={copyConfig.inTime} onChange={e => setCopyConfig(c => ({ ...c, inTime: e.target.checked }))} className="w-3 h-3 rounded text-indigo-600" />
          <span className="text-[9px] font-bold text-indigo-700 uppercase">In Time</span>
        </label>
        <label className="flex items-center gap-1.5 cursor-pointer flex-1">
          <input type="checkbox" checked={copyConfig.outTime} onChange={e => setCopyConfig(c => ({ ...c, outTime: e.target.checked }))} className="w-3 h-3 rounded text-indigo-600" />
          <span className="text-[9px] font-bold text-indigo-700 uppercase">Out Time</span>
        </label>
      </div>

      <div className="max-h-[150px] overflow-y-auto border border-gray-100 rounded-lg mb-2.5 bg-gray-50/30">
        {activeEmployees.map(emp => (
          <label key={emp.id} className="flex items-center gap-2 px-3 py-1.5 hover:bg-white cursor-pointer border-b border-gray-100 last:border-0 transition-colors group">
            <input
              type="checkbox"
              checked={selectedEmps.includes(emp.id)}
              onChange={e => {
                if (e.target.checked) setSelectedEmps(p => [...p, emp.id])
                else setSelectedEmps(p => p.filter(id => id !== emp.id))
              }}
              className="w-3 h-3 rounded text-indigo-600"
            />
            <span className="text-[10px] font-semibold text-gray-600 uppercase truncate group-hover:text-gray-900">{emp.name}</span>
          </label>
        ))}
      </div>

      <button
        onClick={onApply}
        className="h-[28px] w-full bg-indigo-600 text-white font-bold rounded-lg text-[10px] shadow-sm uppercase tracking-widest hover:bg-indigo-700 transition-all flex items-center justify-center gap-1.5"
      >
        <Copy size={12} /> Apply
      </button>
    </div>
  );
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
  const [activeCopyEmpId, setActiveCopyEmpId] = useState(null);
  const [rowOrder, setRowOrder] = useState([])

  const [copyConfig, setCopyConfig] = useState({ inTime: false, outTime: true })
  const [selectedEmps, setSelectedEmps] = useState([])
  const [showInTimePicker, setShowInTimePicker] = useState(null)
  const [showOutTimePicker, setShowOutTimePicker] = useState(null)

  const sortedEmployees = useMemo(() => {
    const active = employees.filter(e => e.status === 'Active')
    if (!rowOrder.length) return active
    return [...active].sort((a, b) => {
      const idxA = rowOrder.indexOf(a.id)
      const idxB = rowOrder.indexOf(b.id)
      if (idxA === -1 && idxB === -1) return 0
      if (idxA === -1) return 1
      if (idxB === -1) return -1
      return idxA - idxB
    })
  }, [employees, rowOrder])

  const activeEmployees = useMemo(() => sortedEmployees, [sortedEmployees])
  const isSunday = new Date(selectedDate).getDay() === 0
  const isDayShift = orgData?.shiftStrategy === 'Day'

  useEffect(() => {
    if (!user?.orgId || !selectedDate) return
    getDoc(doc(db, 'organisations', user.orgId)).then(snap => {
      if (snap.exists()) {
        setOrgData(snap.data())
        if (snap.data().employeeRowOrder) {
          setRowOrder(snap.data().employeeRowOrder)
        }
      }
    })
  }, [user?.orgId])

  useEffect(() => {
    if (!user?.orgId || !selectedDate) return
    fetchByDate(selectedDate).then(records => {
      setExistingRecords(records)
      if (records.length > 0) {
        const sortedRecords = [...records].sort((a, b) => {
          if (!rowOrder.length) return 0
          const idxA = rowOrder.indexOf(a.employeeId)
          const idxB = rowOrder.indexOf(b.employeeId)
          if (idxA === -1 && idxB === -1) return 0
          if (idxA === -1) return 1
          if (idxB === -1) return -1
          return idxA - idxB
        })
        setRows(sortedRecords)
      } else {
        setRows([])
      }
    })
  }, [user?.orgId, selectedDate, rowOrder])

  const handleGenerate = () => {
    if (!activeEmployees.length) return
    const newRows = activeEmployees.map(emp => ({
      employeeId: emp.id,
      name: emp.name,
      date: selectedDate,
      inDate: selectedDate,
      inTime: emp.shift?.startTime || '09:00',
      outDate: selectedDate,
      outTime: emp.shift?.endTime || '21:00',
      otHours: '00:00',
      remarks: emp.site || '',
      isAbsent: false,
      sundayWorked: false,
      sundayHoliday: false,
      shiftType: 'Day',
      status: 'Present'
    }))
    setRows(newRows)
  }

  const handleAddRow = () => {
    const newRow = {
      employeeId: '',
      name: '',
      date: selectedDate,
      inDate: selectedDate,
      inTime: '09:00',
      outDate: selectedDate,
      outTime: '21:00',
      otHours: '00:00',
      remarks: '',
      isAbsent: false,
      sundayWorked: false,
      sundayHoliday: false,
      shiftType: 'Day',
      status: 'Present',
      isNew: true
    }
    setRows(prev => [...prev, newRow])
  }

  const handleClearRow = (empId) => {
    setRows(prev => prev.filter(r => r.employeeId !== empId))
  }

  const handleEmployeeSelect = (rowIndex, empId) => {
    const emp = employees.find(e => e.id === empId)
    if (!emp) return
    setRows(prev => prev.map((r, idx) => {
      if (idx !== rowIndex) return r
      return {
        ...r,
        employeeId: emp.id,
        name: emp.name,
        date: selectedDate,
        inDate: selectedDate,
        inTime: emp.shift?.startTime || '09:00',
        outDate: selectedDate,
        outTime: emp.shift?.endTime || '21:00',
        otHours: '00:00',
        remarks: emp.site || '',
        isAbsent: false,
        sundayWorked: false,
        sundayHoliday: false,
        shiftType: 'Day',
        status: 'Present',
        isNew: false
      }
    }))
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
          setActiveCopyEmpId(empId)
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
      await logActivity(user?.orgId, user, {
        module: 'Attendance',
        action: `Attendance submitted for ${rows.length} employee(s) on ${selectedDate}`,
        detail: rows.map(r => r.name).join(', ')
      })
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
    setShowCopyModal(false); setSelectedEmps([]); setActiveCopyEmpId(null);
  }

  return (
    <div className="flex flex-col h-full gap-2 font-inter">
      {/* Header Card */}
      <div className="bg-white px-5 py-3 rounded-[12px] shadow-sm flex justify-between items-center border border-gray-100/50">
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
        <button onClick={handleAddRow} className="h-[38px] px-[12px] bg-gray-100 text-gray-600 font-semibold rounded-[8px] text-[12px] shadow-sm hover:bg-gray-200 transition-all uppercase tracking-widest flex items-center gap-1.5"><Plus size={14} /> Add Row</button>
          <button onClick={handleGenerate} className="h-[38px] px-[16px] bg-indigo-600 text-white font-semibold rounded-[8px] text-[12px] shadow-sm hover:bg-indigo-700 transition-all uppercase tracking-widest">Generate Active</button>
      </div>

      {/* Main Table Card */}
      <div className="flex-1 bg-white rounded-[12px] border border-gray-100 shadow-sm overflow-visible flex flex-col">
        <div className="overflow-x-visible">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="h-[38px] bg-[#f9fafb] border-b border-gray-100">
                <th className="px-[14px] text-[11px] font-semibold text-[#6b7280] uppercase tracking-wider w-[18%]">Employee Name</th>
                <th className="px-[8px] text-[11px] font-semibold text-[#6b7280] uppercase tracking-wider text-center w-[70px]">Shift</th>
                <th className="px-[10px] text-[11px] font-semibold text-[#6b7280] uppercase tracking-wider text-center">In Date</th>
                <th className="px-[10px] text-[11px] font-semibold text-[#6b7280] uppercase tracking-wider text-center">In Time</th>
                <th className="px-[10px] text-[11px] font-semibold text-[#6b7280] uppercase tracking-wlder text-center">Out Date</th>
                <th className="px-[10px] text-[11px] font-semibold text-[#6b7280] uppercase tracking-wider text-center">Out Time</th>
                <th className="px-[10px] text-[11px] font-semibold text-[#6b7280] uppercase tracking-wider text-center">OT</th>
                <th className="px-[10px] text-[11px] font-semibold text-[#6b7280] uppercase tracking-wider">Remarks</th>
                <th className="px-[14px] text-[11px] font-semibold text-[#6b7280] uppercase tracking-wider text-right">Status Multi-Toggle</th>
                <th className="px-[8px] text-[11px] font-semibold text-[#6b7280] uppercase tracking-wider w-[40px]"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#f1f5f9]">
              {empLoading ? (
                <tr><td colSpan={10} className="text-center py-12"><Spinner /></td></tr>
              ) : rows.length === 0 ? (
                <tr><td colSpan={9} className="text-center py-20 text-gray-300 font-medium uppercase tracking-tighter text-lg opacity-40 italic">Ready to generate attendance</td></tr>
              ) : (
                rows.map((row, idx) => (
                  <tr key={row.employeeId || `new-${idx}`} className={`h-[46px] transition-colors hover:bg-[#f8fafc] ${row.isAbsent ? 'bg-red-50/20' : ''}`}>
                    {/* Employee Name */}
                    <td className="px-[14px]">
                      {row.employeeId ? (
                        <div className="flex items-center gap-2.5">
                          <span className="font-semibold text-gray-700 text-[12px] truncate uppercase">{row.name}</span>
                        </div>
                      ) : (
                        <select
                          value=""
                          onChange={(e) => handleEmployeeSelect(idx, e.target.value)}
                          className="w-full h-[30px] border border-gray-200 rounded-lg px-3 text-[11px] font-semibold bg-gray-50 focus:ring-2 focus:ring-indigo-500 outline-none"
                        >
                          <option value="">Select Employee...</option>
                          {employees.filter(e => !rows.some(r => r.employeeId === e.id)).map(e => (
                            <option key={e.id} value={e.id}>{e.name}</option>
                          ))}
                        </select>
                      )}
                    </td>

                    {/* Shift Type */}
                    <td className="px-[8px] text-center">
                      <select
                        value={row.shiftType || 'Day'}
                        onChange={(e) => updateRow(row.employeeId, 'shiftType', e.target.value)}
                        className="h-[28px] w-[65px] border border-gray-200 rounded-lg px-1 text-[10px] font-semibold bg-white focus:ring-2 focus:ring-indigo-500 outline-none text-center"
                      >
                        <option value="Day">Day</option>
                        <option value="Night">Night</option>
                        <option value="DN">DN</option>
                      </select>
                    </td>

                    {/* In Date */}
                    <td className="px-[10px] text-center border-l-2 border-emerald-400">
                      <div className="flex items-center justify-center relative">
                        <input
                          type="date"
                          value={row.inDate || ''}
                          disabled={row.isAbsent || row.status === 'SunHoliday'}
                          onChange={e => updateRow(row.employeeId, 'inDate', e.target.value)}
                          className="text-[12px] font-medium text-gray-600 bg-transparent border-none outline-none cursor-pointer disabled:cursor-not-allowed text-center w-full"
                        />
                      </div>
                    </td>

                    {/* In Time */}
                    <td className="px-[10px] text-center border-r-2 border-emerald-400">
                      <div className="flex items-center justify-center relative">
                        <button
                          onClick={() => setShowInTimePicker(showInTimePicker === row.employeeId ? null : row.employeeId)}
                          disabled={row.isAbsent || row.status === 'SunHoliday'}
                          className="text-[12px] font-bold text-gray-800 bg-transparent border-none outline-none cursor-pointer disabled:cursor-not-allowed text-center w-full"
                        >
                          {row.inTime ? (() => {
                            const [h, m] = row.inTime.split(':').map(Number)
                            const p = h >= 12 ? 'PM' : 'AM'
                            const h12 = h % 12 || 12
                            return `${h12}:${String(m).padStart(2, '0')} ${p}`
                          })() : '--:--'}
                        </button>
                        {showInTimePicker === row.employeeId && (
                          <TimePicker
                            value={row.inTime || '09:00'}
                            onChange={(time) => updateRow(row.employeeId, 'inTime', time)}
                            onClose={() => setShowInTimePicker(null)}
                          />
                        )}
                      </div>
                    </td>

                    {/* Out Date */}
                    <td className="px-[10px] text-center">
                      <div className="flex items-center justify-center relative">
                        <input
                          type="date"
                          value={row.outDate || ''}
                          disabled={row.isAbsent || row.status === 'SunHoliday'}
                          onChange={e => updateRow(row.employeeId, 'outDate', e.target.value)}
                          className="text-[12px] font-medium text-gray-600 bg-transparent border-none outline-none cursor-pointer disabled:cursor-not-allowed text-center w-full"
                        />
                      </div>
                    </td>

                    {/* Out Time */}
                    <td className="px-[10px] text-center border-r-2 border-rose-300">
                      <div className="flex items-center justify-center relative">
                        <button
                          onClick={() => setShowOutTimePicker(showOutTimePicker === row.employeeId ? null : row.employeeId)}
                          disabled={row.isAbsent || row.status === 'SunHoliday'}
                          className="text-[12px] font-bold text-gray-800 bg-transparent border-none outline-none cursor-pointer disabled:cursor-not-allowed text-center w-full"
                        >
                          {row.outTime ? (() => {
                            const [h, m] = row.outTime.split(':').map(Number)
                            const p = h >= 12 ? 'PM' : 'AM'
                            const h12 = h % 12 || 12
                            return `${h12}:${String(m).padStart(2, '0')} ${p}`
                          })() : '--:--'}
                        </button>
                        {showOutTimePicker === row.employeeId && (
                          <TimePicker
                            value={row.outTime || '21:00'}
                            onChange={(time) => updateRow(row.employeeId, 'outTime', time)}
                            onClose={() => setShowOutTimePicker(null)}
                          />
                        )}

                        {/* DROPDOWN COPY PICKER INLINE */}
                        {showCopyModal && activeCopyEmpId === row.employeeId && (
                          <CopyToDropdown
                            activeEmployees={activeEmployees.filter(e => e.id !== row.employeeId)}
                            copyConfig={copyConfig}
                            setCopyConfig={setCopyConfig}
                            selectedEmps={selectedEmps}
                            setSelectedEmps={setSelectedEmps}
                            onApply={handleCopySubmit}
                            onClose={() => { setShowCopyModal(false); setActiveCopyEmpId(null); }}
                          />
                        )}
                      </div>
                    </td>

                    {/* OT */}
                    <td className="px-[10px] text-center font-bold text-black text-[13px]" style={{ fontFamily: 'Roboto, sans-serif' }}>{row.otHours || '00:00'}</td>

                    {/* Remarks */}
                    <td className="px-[10px]">
                      <span className="text-[12px] text-gray-400">
                        {row.remarks ? (
                          <input
                            type="text"
                            value={row.remarks || ''}
                            onChange={e => updateRow(row.employeeId, 'remarks', e.target.value)}
                            className="border-none bg-transparent p-0 text-[12px] focus:ring-0 text-gray-500 w-full"
                            placeholder="..."
                          />
                        ) : (
                          <input
                            type="text"
                            value={row.remarks || ''}
                            onChange={e => updateRow(row.employeeId, 'remarks', e.target.value)}
                            className="border-none bg-transparent p-0 text-[12px] focus:ring-0 text-gray-400 w-full placeholder-gray-300"
                            placeholder="..."
                          />
                        )}
                      </span>
                    </td>

                    {/* Status Multi-Toggle */}
                    <td className="px-[14px]">
                      <div className="flex items-center gap-1 justify-end">
                        {[
                          { id: 'Present', label: 'PRESENT', color: 'green' },
                          { id: 'Absent', label: 'ABSENT', color: 'red' },
                          ...(isSunday ? [
                            { id: 'SunWorked', label: 'WORKED', color: 'amber' },
                            { id: 'SunHoliday', label: 'HOLIDAY', color: 'indigo' }
                          ] : [])
                        ].map(st => (
                          <button
                            key={st.id}
                            onClick={() => handleStatusChange(row.employeeId, st.id)}
                            title={st.label}
                            className={`px-2.5 py-1 rounded-full text-[10px] font-bold border transition-all tracking-tight
                              ${row.status === st.id
                                ? st.color === 'green' ? 'bg-green-500 text-white border-green-500 shadow-sm'
                                  : st.color === 'red' ? 'bg-red-100 text-red-400 border-red-200'
                                    : st.color === 'amber' ? 'bg-amber-500 text-white border-amber-500 shadow-sm'
                                      : 'bg-indigo-600 text-white border-indigo-600 shadow-sm'
                                : st.id === 'Absent' ? 'bg-white text-gray-300 border-gray-200 hover:bg-gray-50'
                                  : 'bg-white text-gray-300 border-gray-200 hover:bg-gray-50'
                              }`}
                          >
                            {st.label}
                          </button>
                        ))}
                      </div>
                      </td>

                    {/* Clear Row Button */}
                    <td className="px-[8px] text-center">
                      <button
                        onClick={() => handleClearRow(row.employeeId)}
                        className="p-1.5 rounded-lg hover:bg-red-50 text-gray-300 hover:text-red-500 transition-colors"
                        title="Clear row"
                      >
                        <X size={14} />
                      </button>
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
    </div>
  )
}
