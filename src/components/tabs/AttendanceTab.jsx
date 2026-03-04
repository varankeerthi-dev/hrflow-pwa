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
    <div className="flex flex-col h-full text-xs">
      <div className="flex justify-between items-center mb-4">
        <div className="flex items-center gap-3 bg-white rounded-2xl px-4 py-2 shadow-sm border border-gray-100">
          <button onClick={() => setSelectedDate(d => { const nd = new Date(d); nd.setDate(nd.getDate() - 1); return formatDateForInput(nd); })} className="text-gray-400 hover:text-indigo-600 transition-colors text-lg">←</button>
          <input type="date" value={selectedDate} onChange={e => setSelectedDate(e.target.value)} className="font-black bg-transparent border-none outline-none text-base text-gray-800" />
          <span className="text-xs font-bold text-gray-400 uppercase tracking-tighter">{formatDate(selectedDate)}</span>
          {isSunday && <span className="bg-orange-500 text-white text-[10px] px-2 py-0.5 rounded-full font-black">SUNDAY</span>}
          <button onClick={() => setSelectedDate(d => { const nd = new Date(d); nd.setDate(nd.getDate() + 1); return formatDateForInput(nd); })} className="text-gray-400 hover:text-indigo-600 transition-colors text-lg">→</button>
        </div>
        <button onClick={handleGenerate} className="bg-indigo-600 text-white font-black px-4 py-2 rounded-xl text-[10px] shadow-lg hover:bg-indigo-700 transition-all uppercase tracking-widest">Generate Active</button>
      </div>

      <div className="flex-1 overflow-auto bg-white rounded-2xl border-2 border-gray-100/80 shadow-xl overflow-hidden">
        <div className="grid grid-cols-[1.2fr_1fr_0.8fr_1fr_0.8fr_0.6fr_1.2fr_2fr] gap-px bg-gray-200/80 sticky top-0 z-10 border-b-2 border-gray-200">
          {['Employee Name', 'In Date', 'In Time', 'Out Date', 'Out Time', 'OT', 'Remarks', 'Status Multi-Toggle'].map(h => (
            <div key={h} className="bg-gray-50 px-3 py-3 text-[10px] font-black text-gray-500 uppercase tracking-widest text-center flex items-center justify-center border-r last:border-r-0 border-gray-200/80">{h}</div>
          ))}
        </div>

        {empLoading ? (
          <div className="flex items-center justify-center py-12"><Spinner /></div>
        ) : rows.length === 0 ? (
          <div className="text-center py-20 text-gray-300 font-black uppercase tracking-tighter italic text-xl opacity-20">No Attendance Rows</div>
        ) : (
          rows.map((row, idx) => (
            <div key={row.employeeId} className={`grid grid-cols-[1.2fr_1fr_0.8fr_1fr_0.8fr_0.6fr_1.2fr_2fr] gap-px bg-gray-200/80 border-b border-gray-200/80 ${row.isAbsent ? 'bg-red-50/50' : idx % 2 === 0 ? 'bg-white' : 'bg-gray-50/30'}`}>
              <div className="px-3 py-2 flex items-center gap-2 border-r border-gray-200/80 min-w-0">
                <div className="w-6 h-6 rounded-lg flex items-center justify-center text-white text-[9px] font-black shrink-0 shadow-sm" style={{ backgroundColor: getAvatarColor(row.employeeId) }}>{getInitials(row.name)}</div>
                <span className="font-black text-gray-800 truncate uppercase tracking-tighter text-[11px]">{row.name}</span>
              </div>
              <div className="px-1 py-1 border-r border-gray-200/80 flex items-center"><input type="date" value={row.inDate || ''} disabled={row.isAbsent || row.status === 'SunHoliday'} onChange={e => updateRow(row.employeeId, 'inDate', e.target.value)} className="w-full bg-transparent border-none p-1 focus:ring-0 text-xs font-bold text-center disabled:opacity-20" /></div>
              <div className="px-1 py-1 border-r border-gray-200/80 flex items-center"><input type="time" value={row.inTime || ''} disabled={row.isAbsent || row.status === 'SunHoliday'} onChange={e => updateRow(row.employeeId, 'inTime', e.target.value)} className="w-full bg-transparent border-none p-1 focus:ring-0 text-xs font-black text-center disabled:opacity-20" /></div>
              <div className="px-1 py-1 border-r border-gray-200/80 flex items-center"><input type="date" value={row.outDate || ''} disabled={row.isAbsent || row.status === 'SunHoliday'} onChange={e => updateRow(row.employeeId, 'outDate', e.target.value)} className="w-full bg-transparent border-none p-1 focus:ring-0 text-xs font-bold text-center disabled:opacity-20" /></div>
              <div className="px-1 py-1 border-r border-gray-200/80 flex items-center"><input type="time" value={row.outTime || ''} disabled={row.isAbsent || row.status === 'SunHoliday'} onChange={e => updateRow(row.employeeId, 'outTime', e.target.value)} className="w-full bg-transparent border-none p-1 focus:ring-0 text-xs font-black text-center disabled:opacity-20" /></div>
              <div className="px-1 py-1 border-r border-gray-200/80 flex items-center justify-center font-mono font-black text-indigo-600 text-sm">{row.otHours || '00:00'}</div>
              <div className="px-1 py-1 border-r border-gray-200/80 flex items-center"><input type="text" value={row.remarks || ''} onChange={e => updateRow(row.employeeId, 'remarks', e.target.value)} className="w-full bg-transparent border-none p-1 focus:ring-0 text-[10px] font-medium" placeholder="..." /></div>
              <div className="px-2 py-1 flex items-center gap-1 justify-center">
                <button onClick={() => handleStatusChange(row.employeeId, 'Present')} className={`px-2 py-1 rounded-lg text-[9px] font-black border transition-all uppercase ${row.status === 'Present' ? 'bg-green-500 text-white border-green-500 shadow-md scale-105' : 'bg-white text-gray-300 border-gray-100 hover:bg-gray-50'}`}>Present</button>
                <button onClick={() => handleStatusChange(row.employeeId, 'Absent')} className={`px-2 py-1 rounded-lg text-[9px] font-black border transition-all uppercase ${row.status === 'Absent' ? 'bg-red-500 text-white border-red-500 shadow-md scale-105' : 'bg-white text-gray-300 border-gray-100 hover:bg-gray-50'}`}>Absent</button>
                {isSunday && (
                  <>
                    <button onClick={() => handleStatusChange(row.employeeId, 'SunWorked')} className={`px-2 py-1 rounded-lg text-[9px] font-black border transition-all uppercase ${row.status === 'SunWorked' ? 'bg-amber-500 text-white border-amber-500 shadow-md scale-105' : 'bg-white text-gray-300 border-gray-100 hover:bg-gray-50'}`}>Sun Worked</button>
                    <button onClick={() => handleStatusChange(row.employeeId, 'SunHoliday')} className={`px-2 py-1 rounded-lg text-[9px] font-black border transition-all uppercase ${row.status === 'SunHoliday' ? 'bg-indigo-500 text-white border-indigo-500 shadow-md scale-105' : 'bg-white text-gray-300 border-gray-100 hover:bg-gray-50'}`}>Sun Holiday</button>
                  </>
                )}
              </div>
            </div>
          ))
        )}
      </div>

      <div className="mt-4 bg-white rounded-2xl border-2 border-gray-100 p-3 flex justify-between items-center shadow-lg shrink-0">
        <div className="flex gap-6 px-4 font-black">
          <div className="flex items-center gap-2"><span className="w-2.5 h-2.5 bg-green-500 rounded-full shadow-sm"></span><span className="text-gray-600 uppercase tracking-widest text-[10px]">Present: {rows.filter(r => !r.isAbsent && !r.sundayHoliday).length}</span></div>
          <div className="flex items-center gap-2"><span className="w-2.5 h-2.5 bg-red-500 rounded-full shadow-sm"></span><span className="text-gray-600 uppercase tracking-widest text-[10px]">Absent: {rows.filter(r => r.isAbsent).length}</span></div>
        </div>
        <div className="flex items-center gap-3">
          {saved && <span className="text-green-600 text-[10px] font-black uppercase tracking-widest animate-bounce">✓ Data Saved</span>}
          <button onClick={handleSubmit} disabled={saving || rows.length === 0} className="bg-indigo-600 text-white font-black px-8 py-2.5 rounded-xl text-[11px] shadow-xl hover:bg-indigo-700 transition-all uppercase tracking-widest disabled:opacity-50">{saving ? 'Processing...' : 'Submit Records'}</button>
        </div>
      </div>

      <Modal isOpen={showWarning} onClose={() => setShowWarning(false)} title="Conflict Warning">
        <div className="p-6 text-center">
          <div className="text-5xl mb-4">⚠️</div>
          <h3 className="text-lg font-black text-gray-800 mb-2 uppercase">Records Exist</h3>
          <p className="text-xs text-gray-500 mb-6 font-bold leading-relaxed">Some employees already have attendance for this date. Overwriting will replace existing logs. Proceed?</p>
          <div className="flex gap-3">
            <button onClick={() => setShowWarning(false)} className="flex-1 border-2 border-gray-100 py-3 rounded-2xl text-[10px] font-black text-gray-400 uppercase tracking-widest">Cancel</button>
            <button onClick={() => { setShowWarning(false); handleSubmit(); }} className="flex-1 bg-indigo-600 text-white py-3 rounded-2xl text-[10px] font-black shadow-xl uppercase tracking-widest">Overwrite</button>
          </div>
        </div>
      </Modal>

      <Modal isOpen={showCopyModal} onClose={() => setShowCopyModal(false)} title="COPY TIME VALUES">
        <div className="p-2 w-64 max-h-[70vh] flex flex-col">
          <div className="flex gap-3 mb-2 bg-indigo-50/50 p-2 rounded-xl border border-indigo-100">
             <label className="flex items-center gap-2 cursor-pointer"><input type="checkbox" checked={copyConfig.inTime} onChange={e => setCopyConfig(c => ({...c, inTime: e.target.checked}))} className="rounded text-indigo-600" /><span className="text-[10px] font-black text-indigo-700">IN TIME</span></label>
             <label className="flex items-center gap-2 cursor-pointer"><input type="checkbox" checked={copyConfig.outTime} onChange={e => setCopyConfig(c => ({...c, outTime: e.target.checked}))} className="rounded text-indigo-600" /><span className="text-[10px] font-black text-indigo-700">OUT TIME</span></label>
          </div>
          <div className="flex-1 overflow-y-auto border border-gray-100 rounded-xl mb-3 bg-gray-50/30">
            {activeEmployees.map(emp => (
              <label key={emp.id} className="flex items-center gap-3 px-3 py-1.5 hover:bg-white cursor-pointer border-b border-gray-100 last:border-0 transition-colors">
                <input type="checkbox" checked={selectedEmps.includes(emp.id)} onChange={e => {
                  if (e.target.checked) setSelectedEmps(p => [...p, emp.id])
                  else setSelectedEmps(p => p.filter(id => id !== emp.id))
                }} className="rounded text-indigo-600 w-3.5 h-3.5" />
                <span className="text-[10px] font-black text-gray-600 uppercase truncate">{emp.name}</span>
              </label>
            ))}
          </div>
          <button onClick={handleCopySubmit} className="w-full bg-indigo-600 text-white font-black py-3 rounded-2xl text-[10px] shadow-lg uppercase tracking-widest">Copy to Selection</button>
        </div>
      </Modal>
    </div>
  )
}
