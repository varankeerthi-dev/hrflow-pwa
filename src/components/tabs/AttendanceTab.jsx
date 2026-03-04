import { useState, useEffect } from 'react'
import { useAuth } from '../../hooks/useAuth'
import { useEmployees } from '../../hooks/useEmployees'
import { useAttendance, calcOT } from '../../hooks/useAttendance'
import Spinner from '../ui/Spinner'

function getInitials(name) {
  return name?.split(' ').map(n => n[0]).join('').toUpperCase() || '??'
}

function getAvatarColor(id) {
  let hash = 0
  for (let i = 0; i < id.length; i++) hash = id.charCodeAt(i) + ((hash << 5) - hash)
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
  const { employees, loading: empLoading } = useEmployees(user?.orgId)
  const { fetchByDate, upsertAttendance, loading: attLoading } = useAttendance(user?.orgId)

  const [selectedDate, setSelectedDate] = useState(formatDateForInput(new Date()))
  const [rows, setRows] = useState([])
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [orgData, setOrgData] = useState(null)

  const isSunday = new Date(selectedDate).getDay() === 0
  const isDayShift = orgData?.shiftStrategy === 'Day'

  useEffect(() => {
    if (!user?.orgId || !selectedDate) return

    // Fetch org settings for shift strategy
    getDoc(doc(db, 'organisations', user.orgId)).then(snap => {
      if (snap.exists()) setOrgData(snap.data())
    })

    fetchByDate(selectedDate).then(records => {
      if (records.length > 0) {
        setRows(records)
      } else {
        setRows([])
      }
    })
  }, [user?.orgId, selectedDate])

  const handleGenerate = () => {
    if (!employees.length) return
    const newRows = employees.map(emp => ({
      employeeId: emp.id,
      empCode: emp.empCode,
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
    }))
    setRows(newRows)
  }

  const updateRow = (empId, field, value) => {
    setRows(prev => prev.map(r => {
      if (r.employeeId !== empId) return r
      const updated = { ...r, [field]: value }

      // Auto-date Out Date if Day Shift
      if (field === 'inDate' && isDayShift) {
        updated.outDate = value
      }

      if (['inTime', 'outTime', 'inDate', 'outDate'].includes(field)) {
        updated.otHours = calcOT(updated.inTime, updated.outTime, updated.inDate, updated.outDate, r.workHours || 9)
      }
      return updated
    }))
  }

  const toggleAbsent = (empId) => {
    setRows(prev => prev.map(r =>
      r.employeeId === empId
        ? { ...r, isAbsent: !r.isAbsent, inTime: !r.isAbsent ? '' : r.inTime, outTime: !r.isAbsent ? '' : r.outTime }
        : r
    ))
  }

  const removeRow = (empId) => {
    setRows(prev => prev.filter(r => r.employeeId !== empId))
  }

  const toggleSundayFlag = (empId, field) => {
    setRows(prev => prev.map(r => r.employeeId === empId ? { ...r, [field]: !r[field] } : r))
  }

  const handleSubmit = async () => {
    if (!rows.length) return
    setSaving(true)
    try {
      await upsertAttendance(rows)
      setSaved(true)
      setTimeout(() => setSaved(false), 3000)
    } finally {
      setSaving(false)
    }
  }

  const presentCount = rows.filter(r => !r.isAbsent).length
  const absentCount = rows.filter(r => r.isAbsent).length
  const otCount = rows.filter(r => r.otHours && r.otHours !== '00:00').length

  return (
    <div className="flex flex-col h-full">
      {/* Top Bar */}
      <div className="flex justify-between items-center mb-4">
        {/* Date Navigator */}
        <div className="flex items-center gap-2 bg-white rounded-full px-4 py-2 shadow-md">
          <button
            onClick={() => setSelectedDate(d => { const nd = new Date(d); nd.setDate(nd.getDate() - 1); return formatDateForInput(nd); })}
            className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100 text-gray-600"
          >
            ←
          </button>
          <input
            type="date"
            value={selectedDate}
            onChange={e => setSelectedDate(e.target.value)}
            className="font-mono font-black text-gray-800 bg-transparent border-none outline-none"
          />
          <span className="text-sm font-medium text-gray-600">{formatDate(selectedDate)}</span>
          {isSunday && <span className="bg-orange-500 text-white text-xs px-2 py-0.5 rounded-full">SUN</span>}
          <button
            onClick={() => setSelectedDate(d => { const nd = new Date(d); nd.setDate(nd.getDate() + 1); return formatDateForInput(nd); })}
            className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100 text-gray-600"
          >
            →
          </button>
        </div>

        {/* Generate Button */}
        <button
          onClick={handleGenerate}
          className="bg-gradient-to-r from-indigo-500 to-purple-500 text-white font-bold px-6 py-2.5 rounded-xl shadow-lg shadow-indigo-500/30 hover:shadow-indigo-500/50 transition-all"
        >
          Generate All Active
        </button>
      </div>

      {/* Table */}
      <div className="flex-1 overflow-auto bg-white rounded-xl shadow">
        <div className="grid grid-cols-8 gap-px bg-gray-200 sticky top-0">
          {['Employee', 'In Date', 'In Time', 'Out Date', 'Out Time', 'OT', 'Remarks', 'Actions'].map(h => (
            <div key={h} className="bg-gray-50 px-3 py-2 text-xs font-semibold text-gray-500 uppercase tracking-widest">
              {h}
            </div>
          ))}
        </div>

        {empLoading ? (
          <div className="flex items-center justify-center py-12"><Spinner /></div>
        ) : rows.length === 0 ? (
          <div className="text-center py-12 text-gray-400">Click "Generate All Active" to create attendance rows</div>
        ) : (
          rows.map((row, idx) => (
            <div
              key={row.employeeId}
              className={`grid grid-cols-8 gap-px bg-gray-200 ${row.isAbsent ? 'bg-red-50' : idx % 2 === 0 ? 'bg-white' : 'bg-gray-50/40'}`}
            >
              {/* Employee */}
              <div className="flex items-center gap-2 px-3 py-2">
                <div
                  className="w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold"
                  style={{ backgroundColor: getAvatarColor(row.employeeId) }}
                >
                  {getInitials(row.name)}
                </div>
                <div>
                  <div className="font-semibold text-gray-800">{row.name}</div>
                  <div className="text-xs text-gray-500 font-mono">{row.empCode}</div>
                </div>
                {row.isAbsent && <span className="bg-red-500 text-white text-xs px-2 py-0.5 rounded-full">ABSENT</span>}
              </div>

              {/* In Date */}
              <div className="px-2 py-2">
                <input
                  type="date"
                  value={row.inDate || ''}
                  disabled={row.isAbsent}
                  onChange={e => updateRow(row.employeeId, 'inDate', e.target.value)}
                  className="w-full bg-transparent border-none text-sm disabled:opacity-40"
                />
              </div>

              {/* In Time */}
              <div className="px-2 py-2">
                <input
                  type="time"
                  value={row.inTime || ''}
                  disabled={row.isAbsent}
                  onChange={e => updateRow(row.employeeId, 'inTime', e.target.value)}
                  className="w-full bg-transparent border-none text-sm disabled:opacity-40"
                />
              </div>

              {/* Out Date */}
              <div className="px-2 py-2">
                <input
                  type="date"
                  value={row.outDate || ''}
                  disabled={row.isAbsent}
                  onChange={e => updateRow(row.employeeId, 'outDate', e.target.value)}
                  className="w-full bg-transparent border-none text-sm disabled:opacity-40"
                />
              </div>

              {/* Out Time */}
              <div className="px-2 py-2">
                <input
                  type="time"
                  value={row.outTime || ''}
                  disabled={row.isAbsent}
                  onChange={e => updateRow(row.employeeId, 'outTime', e.target.value)}
                  className="w-full bg-transparent border-none text-sm disabled:opacity-40"
                />
              </div>

              {/* OT */}
              <div className="px-2 py-2">
                <input
                  type="text"
                  value={row.otHours || '00:00'}
                  onChange={e => updateRow(row.employeeId, 'otHours', e.target.value)}
                  className={`w-full bg-transparent border-none text-sm font-mono ${row.otHours && row.otHours !== '00:00' ? 'text-amber-600 font-bold' : ''}`}
                />
              </div>

              {/* Remarks */}
              <div className="px-2 py-2">
                <input
                  type="text"
                  value={row.remarks || ''}
                  onChange={e => updateRow(row.employeeId, 'remarks', e.target.value)}
                  className="w-full bg-transparent border-none text-sm"
                />
              </div>

              {/* Actions */}
              <div className="px-2 py-2 flex items-center flex-wrap gap-1">
                <button
                  onClick={() => toggleAbsent(row.employeeId)}
                  className={`text-[10px] font-bold border px-2 py-1 rounded transition-all ${row.isAbsent
                      ? 'bg-red-500 text-white border-red-500'
                      : 'border-red-300 text-red-500 hover:bg-red-50'
                    }`}
                >
                  {row.isAbsent ? 'ABSENT' : 'Mark Absent'}
                </button>

                {isSunday && (
                  <>
                    <button
                      onClick={() => toggleSundayFlag(row.employeeId, 'sundayWorked')}
                      disabled={row.isAbsent}
                      className={`text-[10px] font-bold border px-2 py-1 rounded transition-all disabled:opacity-30 ${row.sundayWorked ? 'bg-green-500 text-white border-green-500' : 'border-green-300 text-green-600 hover:bg-green-50'}`}
                    >
                      Sun Worked
                    </button>
                    <button
                      onClick={() => toggleSundayFlag(row.employeeId, 'sundayHoliday')}
                      disabled={row.isAbsent}
                      className={`text-[10px] font-bold border px-2 py-1 rounded transition-all disabled:opacity-30 ${row.sundayHoliday ? 'bg-blue-500 text-white border-blue-500' : 'border-blue-300 text-blue-600 hover:bg-blue-50'}`}
                    >
                      Sun Holiday
                    </button>
                  </>
                )}
                <button onClick={() => removeRow(row.employeeId)} className="text-gray-400 hover:text-gray-600 ml-auto">✕</button>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Bottom Submit Bar */}
      <div className="mt-4 bg-white rounded-xl px-6 py-3 shadow flex justify-between items-center">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 bg-green-500 rounded-full"></span>
            <span className="text-sm text-gray-600">Present: {presentCount}</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 bg-red-500 rounded-full"></span>
            <span className="text-sm text-gray-600">Absent: {absentCount}</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 bg-amber-500 rounded-full"></span>
            <span className="text-sm text-gray-600">OT: {otCount}</span>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {saved && (
            <span className="text-green-600 flex items-center gap-1 text-sm font-medium">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
              Saved
            </span>
          )}
          <button
            onClick={handleSubmit}
            disabled={saving || rows.length === 0}
            className="bg-gradient-to-r from-indigo-500 to-purple-500 text-white font-bold px-6 py-2.5 rounded-xl shadow-lg shadow-indigo-500/30 hover:shadow-indigo-500/50 transition-all disabled:opacity-50 flex items-center gap-2"
          >
            {saving ? <><Spinner size="sm" /> Saving...</> : 'Submit'}
          </button>
        </div>
      </div>
    </div>
  )
}
