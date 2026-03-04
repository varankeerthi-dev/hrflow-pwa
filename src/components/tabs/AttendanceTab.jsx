import { useState, useEffect, useMemo } from 'react'
import { useAuth } from '../../hooks/useAuth'
import { useEmployees } from '../../hooks/useEmployees'
import { useAttendance, calcOT } from '../../hooks/useAttendance'
import { db } from '../../lib/firebase'
import { doc, getDoc } from 'firebase/firestore'
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
  const [existingRecords, setExistingRecords] = useState([])
  
  // Warning Modal State
  const [showWarning, setShowWarning] = useState(false)
  
  // Copy Modal State
  const [copyData, setCopyData] = useState(null) // { inTime, outTime, inDate, outDate }
  const [showCopyModal, setShowCopyModal] = useState(false)
  const [copyConfig, setCopyConfig] = useState({ inTime: false, outTime: true })
  const [selectedEmps, setSelectedEmps] = useState([])

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
      if (records.length > 0) {
        setRows(records)
      } else {
        setRows([])
      }
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
      status: 'Present' // 'Present', 'Absent', 'SunWorked', 'SunHoliday'
    }))
    setRows(newRows)
  }

  const updateRow = (empId, field, value) => {
    setRows(prev => prev.map(r => {
      if (r.employeeId !== empId) return r
      const updated = { ...r, [field]: value }

      if (field === 'inDate' && isDayShift) {
        updated.outDate = value
      }

      if (['inTime', 'outTime', 'inDate', 'outDate'].includes(field)) {
        updated.otHours = calcOT(updated.inTime, updated.outTime, updated.inDate, updated.outDate, r.workHours || 9)
        
        // Trigger Copy modal if Out Time is changed
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
        updated.inTime = ''
        updated.outTime = ''
        updated.otHours = '00:00'
      }
      return updated
    }))
  }

  const handleSubmit = async () => {
    if (!rows.length) return
    
    // Check for existing records
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
    setShowCopyModal(false)
    setSelectedEmps([])
  }

  const presentCount = rows.filter(r => !r.isAbsent && !r.sundayHoliday).length
  const absentCount = rows.filter(r => r.isAbsent).length

  return (
    <div className="flex flex-col h-full text-xs">
      {/* Top Bar */}
      <div className="flex justify-between items-center mb-3">
        <div className="flex items-center gap-2 bg-white rounded-full px-3 py-1 shadow-sm border">
          <button onClick={() => setSelectedDate(d => { const nd = new Date(d); nd.setDate(nd.getDate() - 1); return formatDateForInput(nd); })} className="text-gray-400">←</button>
          <input type="date" value={selectedDate} onChange={e => setSelectedDate(e.target.value)} className="font-bold bg-transparent border-none outline-none w-28" />
          <span className="text-[10px] font-medium text-gray-500">{formatDate(selectedDate)}</span>
          {isSunday && <span className="bg-orange-500 text-white text-[10px] px-1.5 py-0.5 rounded-full">SUN</span>}
          <button onClick={() => setSelectedDate(d => { const nd = new Date(d); nd.setDate(nd.getDate() + 1); return formatDateForInput(nd); })} className="text-gray-400">→</button>
        </div>

        <button onClick={handleGenerate} className="bg-indigo-600 text-white font-bold px-3 py-1.5 rounded-lg text-[10px] shadow-sm hover:bg-indigo-700 transition-all">
          Generate Active
        </button>
      </div>

      {/* Table Container */}
      <div className="flex-1 overflow-auto bg-white rounded-lg border shadow-sm">
        <div className="grid grid-cols-[1.5fr_1fr_0.8fr_1fr_0.8fr_0.6fr_1fr_1.5fr] gap-px bg-gray-100 sticky top-0 z-10">
          {['Name', 'In Date', 'In Time', 'Out Date', 'Out Time', 'OT', 'Remarks', 'Status'].map(h => (
            <div key={h} className="bg-gray-50 px-2 py-1.5 text-[10px] font-bold text-gray-400 uppercase tracking-tighter">{h}</div>
          ))}
        </div>

        {empLoading ? (
          <div className="flex items-center justify-center py-8"><Spinner /></div>
        ) : rows.length === 0 ? (
          <div className="text-center py-8 text-gray-400 italic">No rows generated</div>
        ) : (
          rows.map((row, idx) => (
            <div key={row.employeeId} className={`grid grid-cols-[1.5fr_1fr_0.8fr_1fr_0.8fr_0.6fr_1fr_1.5fr] gap-px bg-gray-100 border-b border-gray-50 ${row.isAbsent ? 'bg-red-50/30' : idx % 2 === 0 ? 'bg-white' : 'bg-gray-50/30'}`}>
              <div className="px-2 py-1 flex items-center gap-1.5 min-w-0">
                <div className="w-5 h-5 rounded-full flex items-center justify-center text-white text-[8px] font-black shrink-0" style={{ backgroundColor: getAvatarColor(row.employeeId) }}>{getInitials(row.name)}</div>
                <span className="font-bold text-gray-700 truncate">{row.name}</span>
              </div>

              <div className="px-1 py-1"><input type="date" value={row.inDate || ''} disabled={row.isAbsent || row.status === 'SunHoliday'} onChange={e => updateRow(row.employeeId, 'inDate', e.target.value)} className="w-full bg-transparent border-none p-0 focus:ring-0 text-xs disabled:opacity-30" /></div>
              <div className="px-1 py-1"><input type="time" value={row.inTime || ''} disabled={row.isAbsent || row.status === 'SunHoliday'} onChange={e => updateRow(row.employeeId, 'inTime', e.target.value)} className="w-full bg-transparent border-none p-0 focus:ring-0 text-xs disabled:opacity-30" /></div>
              <div className="px-1 py-1"><input type="date" value={row.outDate || ''} disabled={row.isAbsent || row.status === 'SunHoliday'} onChange={e => updateRow(row.employeeId, 'outDate', e.target.value)} className="w-full bg-transparent border-none p-0 focus:ring-0 text-xs disabled:opacity-30" /></div>
              <div className="px-1 py-1"><input type="time" value={row.outTime || ''} disabled={row.isAbsent || row.status === 'SunHoliday'} onChange={e => updateRow(row.employeeId, 'outTime', e.target.value)} className="w-full bg-transparent border-none p-0 focus:ring-0 text-xs disabled:opacity-30" /></div>
              <div className="px-1 py-1 font-mono font-bold text-center text-indigo-600">{row.otHours || '00:00'}</div>
              <div className="px-1 py-1"><input type="text" value={row.remarks || ''} onChange={e => updateRow(row.employeeId, 'remarks', e.target.value)} className="w-full bg-transparent border-none p-0 focus:ring-0 text-[10px]" /></div>

              <div className="px-1 py-1 flex items-center gap-0.5 overflow-hidden">
                <button onClick={() => handleStatusChange(row.employeeId, 'Present')} className={`px-1.5 py-0.5 rounded text-[9px] font-black border transition-all ${row.status === 'Present' ? 'bg-green-500 text-white border-green-500' : 'bg-white text-gray-400 border-gray-200'}`}>P</button>
                <button onClick={() => handleStatusChange(row.employeeId, 'Absent')} className={`px-1.5 py-0.5 rounded text-[9px] font-black border transition-all ${row.status === 'Absent' ? 'bg-red-500 text-white border-red-500' : 'bg-white text-gray-400 border-gray-200'}`}>A</button>
                {isSunday && (
                  <>
                    <button onClick={() => handleStatusChange(row.employeeId, 'SunWorked')} className={`px-1.5 py-0.5 rounded text-[9px] font-black border transition-all ${row.status === 'SunWorked' ? 'bg-amber-500 text-white border-amber-500' : 'bg-white text-gray-400 border-gray-200'}`}>W</button>
                    <button onClick={() => handleStatusChange(row.employeeId, 'SunHoliday')} className={`px-1.5 py-0.5 rounded text-[9px] font-black border transition-all ${row.status === 'SunHoliday' ? 'bg-indigo-500 text-white border-indigo-500' : 'bg-white text-gray-400 border-gray-200'}`}>H</button>
                  </>
                )}
              </div>
            </div>
          ))
        )}
      </div>

      {/* Bottom Bar */}
      <div className="mt-3 bg-white rounded-lg border p-2 flex justify-between items-center shadow-sm shrink-0">
        <div className="flex gap-4 px-2">
          <div className="flex items-center gap-1.5"><span className="w-2 h-2 bg-green-500 rounded-full"></span><span className="font-bold text-gray-600 uppercase tracking-tighter text-[10px]">Present: {presentCount}</span></div>
          <div className="flex items-center gap-1.5"><span className="w-2 h-2 bg-red-500 rounded-full"></span><span className="font-bold text-gray-600 uppercase tracking-tighter text-[10px]">Absent: {absentCount}</span></div>
        </div>

        <div className="flex items-center gap-2">
          {saved && <span className="text-green-600 text-[10px] font-bold">✓ Saved</span>}
          <button onClick={handleSubmit} disabled={saving || rows.length === 0} className="bg-indigo-600 text-white font-bold px-4 py-1.5 rounded-lg text-[10px] shadow-md hover:bg-indigo-700 disabled:opacity-50">
            {saving ? 'Saving...' : 'Submit'}
          </button>
        </div>
      </div>

      {/* Overlap Warning Modal */}
      <Modal isOpen={showWarning} onClose={() => setShowWarning(false)} title="Attendance Already Exists">
        <div className="p-4 text-center">
          <div className="text-3xl mb-3">⚠️</div>
          <p className="text-sm text-gray-600 mb-4 font-medium">Some employees already have attendance records for this date. Submitting will overwrite existing data.</p>
          <div className="flex gap-3">
            <button onClick={() => setShowWarning(false)} className="flex-1 border py-2 rounded-xl text-sm font-bold text-gray-500">Cancel</button>
            <button onClick={() => { setShowWarning(false); handleSubmit(); }} className="flex-1 bg-indigo-600 text-white py-2 rounded-xl text-sm font-bold shadow-lg">Overwrite</button>
          </div>
        </div>
      </Modal>

      {/* Copy To Modal */}
      <Modal isOpen={showCopyModal} onClose={() => setShowCopyModal(false)} title="Copy To Others">
        <div className="p-3 w-64 max-h-[80vh] flex flex-col">
          <div className="flex gap-2 mb-3 bg-gray-50 p-2 rounded-lg border">
             <label className="flex items-center gap-1 cursor-pointer">
               <input type="checkbox" checked={copyConfig.inTime} onChange={e => setCopyConfig(c => ({...c, inTime: e.target.checked}))} />
               <span className="text-[10px] font-bold text-gray-600">IN</span>
             </label>
             <label className="flex items-center gap-1 cursor-pointer">
               <input type="checkbox" checked={copyConfig.outTime} onChange={e => setCopyConfig(c => ({...c, outTime: e.target.checked}))} />
               <span className="text-[10px] font-bold text-gray-600">OUT</span>
             </label>
          </div>

          <div className="flex-1 overflow-y-auto border rounded-lg mb-3">
            {activeEmployees.map(emp => (
              <label key={emp.id} className="flex items-center gap-2 px-3 py-1 hover:bg-gray-50 cursor-pointer border-b last:border-b-0">
                <input type="checkbox" checked={selectedEmps.includes(emp.id)} onChange={e => {
                  if (e.target.checked) setSelectedEmps(p => [...p, emp.id])
                  else setSelectedEmps(p => p.filter(id => id !== emp.id))
                }} />
                <span className="text-[10px] font-medium text-gray-700">{emp.name}</span>
              </label>
            ))}
          </div>

          <button onClick={handleCopySubmit} className="w-full bg-indigo-600 text-white font-black py-2 rounded-xl text-[10px] shadow-lg">
            Apply Selection
          </button>
        </div>
      </Modal>
    </div>
  )
}
