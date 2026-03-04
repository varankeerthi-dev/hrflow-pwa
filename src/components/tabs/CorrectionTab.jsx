import { useState, useEffect } from 'react'
import { useAuth } from '../../hooks/useAuth'
import { useEmployees } from '../../hooks/useEmployees'
import { useAttendance, calcOT } from '../../hooks/useAttendance'
import { logActivity } from '../../hooks/useActivityLog'
import Spinner from '../ui/Spinner'
import TimePicker from '../ui/TimePicker'
import { formatTimeTo12Hour } from '../../lib/salaryUtils'
import { Calendar, Search, FileText, Printer, ChevronLeft, ChevronRight, Clock } from 'lucide-react'

function displayDate(isoDate) {
  if (!isoDate) return ''
  const [y, m, d] = isoDate.split('-')
  return `${d}-${m}-${y}`
}

export default function CorrectionTab() {
  const { user } = useAuth()
  const { employees } = useEmployees(user?.orgId)
  const { fetchByDate, upsertAttendance, loading: attLoading } = useAttendance(user?.orgId)

  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0])
  const [results, setResults] = useState([])      // daily summary for the bottom table
  const [editMode, setEditMode] = useState('single')

  // Adjustment Manager state
  const [editForm, setEditForm] = useState({
    employeeId: '',
    fromDate: new Date().toISOString().split('T')[0],
    toDate: new Date().toISOString().split('T')[0],
  })
  const [detailRows, setDetailRows] = useState(null)   // null = not fetched, [] = no records
  const [detailLoading, setDetailLoading] = useState(false)
  const [resubmitting, setResubmitting] = useState(false)
  const [resubmitDone, setResubmitDone] = useState(false)
  const [activeTimePicker, setActiveTimePicker] = useState(null)

  // Load daily summary for bottom table
  useEffect(() => {
    handleRefresh()
  }, [selectedDate, user?.orgId])

  const handleRefresh = async () => {
    if (!selectedDate || !user?.orgId) return
    const data = await fetchByDate(selectedDate)
    const merged = employees.map(emp => {
      const record = data.find(r => r.employeeId === emp.id)
      return {
        id: emp.id,
        name: emp.name,
        date: selectedDate,
        inDate: record?.inDate || selectedDate,
        in: record?.inTime || '-',
        outDate: record?.outDate || selectedDate,
        out: record?.outTime || '-',
        ot: record?.otHours || '-',
        site: record?.remarks || '-',
        status: record ? (record.isAbsent ? 'ABSENT' : 'PRESENT') : 'NO DATA',
      }
    })
    setResults(merged)
  }

  const handleDateChange = (days) => {
    const d = new Date(selectedDate)
    d.setDate(d.getDate() + days)
    setSelectedDate(d.toISOString().split('T')[0])
  }

  // ── Adjustment Manager: Show Details ──────────────────────────────────────
  const handleShowDetails = async () => {
    if (!editForm.employeeId || !editForm.fromDate) return
    setDetailLoading(true)
    setDetailRows(null)
    setResubmitDone(false)
    try {
      // Collect all dates in range
      const from = new Date(editForm.fromDate)
      const to = new Date(editForm.toDate || editForm.fromDate)
      const dates = []
      for (let d = new Date(from); d <= to; d.setDate(d.getDate() + 1)) {
        dates.push(d.toISOString().split('T')[0])
      }

      // Fetch records for each date
      const allRecords = await Promise.all(dates.map(dt => fetchByDate(dt)))
      const flat = allRecords.flat()

      const emp = employees.find(e => e.id === editForm.employeeId)
      const rows = dates.map(dt => {
        const rec = flat.find(r => r.employeeId === editForm.employeeId && r.date === dt)
        return {
          date: dt,
          employeeId: editForm.employeeId,
          name: emp?.name || '',
          inDate: rec?.inDate || dt,
          inTime: rec?.inTime || '',
          outDate: rec?.outDate || dt,
          outTime: rec?.outTime || '',
          otHours: rec?.otHours || '00:00',
          site: rec?.remarks || '',
          status: rec ? (rec.isAbsent ? 'Absent' : 'Present') : '',
          isAbsent: rec?.isAbsent || false,
          hasRecord: !!rec,
        }
      })
      setDetailRows(rows)
    } finally {
      setDetailLoading(false)
    }
  }

  const updateDetailRow = (date, field, value) => {
    setDetailRows(prev => prev.map(r => {
      if (r.date !== date) return r
      const updated = { ...r, [field]: value }
      if (field === 'status') {
        updated.isAbsent = value === 'Absent'
        if (updated.isAbsent) { updated.inTime = ''; updated.outTime = ''; updated.otHours = '00:00' }
      }
      if (['inTime', 'outTime', 'inDate', 'outDate'].includes(field)) {
        updated.otHours = calcOT(updated.inTime, updated.outTime, updated.inDate, updated.outDate, 9)
      }
      return updated
    }))
  }

  const handleResubmit = async () => {
    if (!detailRows?.length) return
    setResubmitting(true)
    try {
      const rows = detailRows.map(r => ({
        employeeId: r.employeeId,
        name: r.name,
        date: r.date,
        inDate: r.inDate,
        inTime: r.inTime,
        outDate: r.outDate,
        outTime: r.outTime,
        otHours: r.otHours,
        remarks: r.site,
        isAbsent: r.isAbsent,
        status: r.status || (r.isAbsent ? 'Absent' : 'Present'),
        sundayWorked: false,
        sundayHoliday: false,
      }))
      await upsertAttendance(rows)
      await logActivity(user?.orgId, user, {
        module: 'Correction',
        action: `Correction re-submitted for ${detailRows[0]?.name} (${editForm.fromDate} → ${editForm.toDate})`,
        detail: detailRows.map(r => r.date).join(', '),
      })
      setResubmitDone(true)
      setTimeout(() => setResubmitDone(false), 3000)
    } finally {
      setResubmitting(false)
    }
  }

  return (
    <div className="flex h-full gap-4 font-inter overflow-hidden bg-gray-50/50 p-4">
      <style>{`
        @media print {
          body * { visibility: hidden; }
          .print-area, .print-area * { visibility: visible; }
          .print-area { position: absolute; left: 0; top: 0; width: 100% !important; padding: 20px; }
          .no-print { display: none !important; }
          table { width: 100% !important; border-collapse: collapse; }
          th, td { border: 1px solid #eee !important; padding: 6px !important; }
        }
      `}</style>

      {/* ── LEFT SIDE: Filters ── */}
      <div className="w-72 shrink-0 flex flex-col gap-4 no-print">
        <div className="bg-white rounded-[20px] p-6 shadow-sm border border-gray-100 flex flex-col gap-4">
          <div className="flex items-center gap-2 text-indigo-500">
            <Calendar size={18} />
            <span className="text-[11px] font-black uppercase tracking-wider">Date Filter</span>
          </div>
          
          <div className="flex items-center bg-gray-50 rounded-xl p-1.5 border border-gray-200">
            <button onClick={() => handleDateChange(-1)} className="p-2 hover:bg-white rounded-lg text-gray-500 transition-all border border-transparent hover:border-gray-100 shadow-sm"><ChevronLeft size={16} /></button>
            <input type="date" value={selectedDate} onChange={e => setSelectedDate(e.target.value)} className="w-full bg-transparent border-none outline-none px-3 text-sm font-bold text-indigo-600 text-center" />
            <button onClick={() => handleDateChange(1)} className="p-2 hover:bg-white rounded-lg text-gray-500 transition-all border border-transparent hover:border-gray-100 shadow-sm"><ChevronRight size={16} /></button>
          </div>

          <button onClick={handleRefresh} className="h-[42px] w-full bg-indigo-600 text-white font-bold rounded-xl text-[11px] flex items-center justify-center gap-2 shadow-lg shadow-indigo-100 hover:bg-indigo-700 transition-all uppercase tracking-widest">
            <Search size={14} /> Refresh
          </button>
          
          <button onClick={() => window.print()} className="h-[38px] w-full bg-emerald-500 text-white font-bold rounded-xl text-[11px] flex items-center justify-center gap-2 hover:bg-emerald-600 transition-all shadow-lg shadow-emerald-50">
            <Printer size={14} /> Print
          </button>
        </div>
      </div>

      {/* ── RIGHT SIDE: Results & Adjustment Manager ── */}
      <div className="flex-1 flex flex-col gap-4 min-w-0 overflow-hidden">
        
        {/* TOP: Results Table (3/4) */}
        <div className="flex-[3] bg-white rounded-[20px] border border-gray-100 shadow-sm overflow-hidden flex flex-col print-area min-h-0">
          <div className="px-5 py-3 flex justify-between items-center bg-white border-b border-gray-50 no-print shrink-0">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-indigo-50 flex items-center justify-center">
                <FileText size={16} className="text-indigo-600" />
              </div>
              <h3 className="text-[13px] font-black text-gray-800 uppercase tracking-tight">Results Summary</h3>
            </div>
          </div>

          <div className="flex-1 overflow-auto">
            {attLoading ? (
              <div className="flex justify-center py-20"><Spinner /></div>
            ) : (
              <table className="w-full text-left border-collapse table-fixed">
                <thead>
                  <tr className="h-[32px] bg-gray-50/50 sticky top-0 border-b border-gray-200">
                    <th className="w-[180px] px-3 border-r border-gray-200 text-[10px] font-black text-gray-400 uppercase tracking-widest">Emp Name</th>
                    <th className="w-[100px] px-3 border-r border-gray-200 text-[10px] font-black text-gray-400 uppercase tracking-widest text-center">In Date</th>
                    <th className="w-[80px] px-3 border-r border-gray-200 text-[10px] font-black text-gray-400 uppercase tracking-widest text-center">In Time</th>
                    <th className="w-[100px] px-3 border-r border-gray-200 text-[10px] font-black text-gray-400 uppercase tracking-widest text-center">Out Date</th>
                    <th className="w-[80px] px-3 border-r border-gray-200 text-[10px] font-black text-gray-400 uppercase tracking-widest text-center">Out Time</th>
                    <th className="w-[60px] px-3 border-r border-gray-200 text-[10px] font-black text-gray-400 uppercase tracking-widest text-center">OT</th>
                    <th className="px-3 border-r border-gray-200 text-[10px] font-black text-gray-400 uppercase tracking-widest">Remarks</th>
                    <th className="w-[90px] px-3 text-[10px] font-black text-gray-400 uppercase tracking-widest text-center">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {results.length === 0 ? (
                    <tr><td colSpan={8} className="text-center py-20 text-gray-300 italic text-[13px] font-medium">No records found</td></tr>
                  ) : results.map((row, i) => (
                    <tr key={i} className="h-[30px] hover:bg-gray-50/50 transition-colors group">
                      <td className="px-3 border-r border-gray-100 text-[11px] font-black text-gray-800 uppercase truncate">{row.name}</td>
                      <td className="px-3 border-r border-gray-100 text-center text-[10px] font-bold text-gray-400">{displayDate(row.inDate)}</td>
                      <td className="px-3 border-r border-gray-100 text-center text-[11px] font-bold text-gray-600">{formatTimeTo12Hour(row.in)}</td>
                      <td className="px-3 border-r border-gray-100 text-center text-[10px] font-bold text-gray-400">{displayDate(row.outDate)}</td>
                      <td className="px-3 border-r border-gray-100 text-center text-[11px] font-bold text-gray-600">{formatTimeTo12Hour(row.out)}</td>
                      <td className="px-3 border-r border-gray-100 text-center text-[11px] font-black text-indigo-600 font-mono">{row.ot}</td>
                      <td className="px-3 border-r border-gray-100 text-[10px] font-bold text-gray-500 uppercase truncate">{row.site}</td>
                      <td className="px-3 text-center">
                        <span className={`px-2 py-0.5 rounded text-[8px] font-black uppercase tracking-tighter ${row.status === 'PRESENT' ? 'bg-green-100 text-green-600'
                            : row.status === 'ABSENT' ? 'bg-red-100 text-red-500'
                              : 'bg-gray-100 text-gray-400'}`}>
                          {row.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>

        {/* BOTTOM: Adjustment Manager (1/4) */}
        <div className="flex-1 bg-white rounded-[20px] p-5 shadow-sm border border-gray-100 no-print flex flex-col min-h-0">
          <div className="flex justify-between items-center mb-4 shrink-0">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-orange-50 flex items-center justify-center">
                <Search size={16} className="text-orange-600" />
              </div>
              <h3 className="text-[13px] font-black text-indigo-600 uppercase tracking-tight">Adjustment Manager</h3>
            </div>
            <div className="bg-gray-100 p-1 rounded-xl flex gap-1 scale-90 origin-right">
              <button onClick={() => setEditMode('single')} className={`px-4 py-1.5 rounded-lg text-[9px] font-black transition-all uppercase tracking-widest ${editMode === 'single' ? 'bg-white text-indigo-600 shadow-sm' : 'text-gray-400 hover:text-gray-600'}`}>Single</button>
              <button onClick={() => setEditMode('multiple')} className={`px-4 py-1.5 rounded-lg text-[9px] font-black transition-all uppercase tracking-widest ${editMode === 'multiple' ? 'bg-white text-indigo-600 shadow-sm' : 'text-gray-400 hover:text-gray-600'}`}>Multiple</button>
            </div>
          </div>

          <div className="flex flex-col flex-1 min-h-0 overflow-hidden">
            {/* Filter Row */}
            <div className="grid grid-cols-12 gap-3 mb-4 shrink-0">
              <div className="col-span-4">
                <select value={editForm.employeeId} onChange={e => setEditForm(p => ({ ...p, employeeId: e.target.value }))} className="w-full h-[36px] border border-gray-200 rounded-xl px-3 text-[11px] font-bold focus:ring-2 focus:ring-indigo-500 outline-none bg-white">
                  <option value="">Choose employee...</option>
                  {employees.map(emp => <option key={emp.id} value={emp.id}>{emp.name}</option>)}
                </select>
              </div>
              <div className="col-span-3">
                <input type="date" value={editForm.fromDate} onChange={e => setEditForm(p => ({ ...p, fromDate: e.target.value }))} className="w-full h-[36px] border border-gray-200 rounded-xl px-3 text-[11px] font-bold outline-none bg-white" />
              </div>
              <div className="col-span-3">
                <input type="date" value={editForm.toDate} onChange={e => setEditForm(p => ({ ...p, toDate: e.target.value }))} className="w-full h-[36px] border border-gray-200 rounded-xl px-3 text-[11px] font-bold outline-none bg-white" />
              </div>
              <div className="col-span-2">
                <button onClick={handleShowDetails} disabled={!editForm.employeeId || detailLoading} className="h-[36px] w-full bg-indigo-600 text-white font-black rounded-xl text-[10px] uppercase tracking-widest disabled:opacity-50">
                  {detailLoading ? '...' : 'Show'}
                </button>
              </div>
            </div>

            {/* Editable Detail Table */}
            {detailRows !== null && (
              <div className="flex-1 overflow-auto rounded-xl border border-gray-100 bg-gray-50/30 min-h-0">
                {detailRows.length === 0 ? (
                  <div className="text-center py-8 text-gray-300 italic text-[12px] font-bold">No Records Found</div>
                ) : (
                  <table className="w-full text-left border-collapse text-[10px]">
                    <thead className="sticky top-0 bg-white border-b border-gray-100 z-10">
                      <tr className="h-[32px]">
                        <th className="px-4 text-gray-400 uppercase font-black">Date</th>
                        <th className="px-4 text-gray-400 uppercase font-black text-center">In Time</th>
                        <th className="px-4 text-gray-400 uppercase font-black text-center">Out Time</th>
                        <th className="px-4 text-gray-400 uppercase font-black text-center">OT</th>
                        <th className="px-4 text-gray-400 uppercase font-black">Site</th>
                        <th className="px-4 text-gray-400 uppercase font-black text-center">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      {detailRows.map(row => (
                        <tr key={row.date} className={`h-[40px] bg-white/50 hover:bg-white transition-colors ${!row.hasRecord ? 'opacity-60' : ''}`}>
                          <td className="px-4 font-bold text-gray-400">{displayDate(row.date)}</td>
                          <td className="px-4 text-center">
                            <button disabled={row.isAbsent} onClick={() => setActiveTimePicker({ date: row.date, field: 'inTime', value: row.inTime })} className="font-black text-gray-700 hover:text-indigo-600">
                              {row.inTime ? formatTimeTo12Hour(row.inTime) : '--:--'}
                            </button>
                            {activeTimePicker?.date === row.date && activeTimePicker?.field === 'inTime' && (
                              <TimePicker value={activeTimePicker.value} onChange={val => { updateDetailRow(row.date, 'inTime', val); setActiveTimePicker(null) }} onClose={() => setActiveTimePicker(null)} />
                            )}
                          </td>
                          <td className="px-4 text-center">
                            <button disabled={row.isAbsent} onClick={() => setActiveTimePicker({ date: row.date, field: 'outTime', value: row.outTime })} className="font-black text-gray-700 hover:text-indigo-600">
                              {row.outTime ? formatTimeTo12Hour(row.outTime) : '--:--'}
                            </button>
                            {activeTimePicker?.date === row.date && activeTimePicker?.field === 'outTime' && (
                              <TimePicker value={activeTimePicker.value} onChange={val => { updateDetailRow(row.date, 'outTime', val); setActiveTimePicker(null) }} onClose={() => setActiveTimePicker(null)} />
                            )}
                          </td>
                          <td className="px-4 text-center font-mono font-black text-indigo-600">{row.otHours}</td>
                          <td className="px-4">
                            <input type="text" value={row.site} onChange={e => updateDetailRow(row.date, 'site', e.target.value)} className="bg-transparent text-[10px] font-bold w-full outline-none" placeholder="..." />
                          </td>
                          <td className="px-4 text-center">
                            <select value={row.status} onChange={e => updateDetailRow(row.date, 'status', e.target.value)} className="text-[9px] font-black border-none bg-transparent outline-none uppercase">
                              <option value="Present">Present</option>
                              <option value="Absent">Absent</option>
                            </select>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            )}
            
            {detailRows?.length > 0 && (
              <div className="flex items-center justify-end mt-3 gap-4 shrink-0">
                {resubmitDone && <span className="text-[9px] text-green-600 font-black uppercase animate-pulse">✓ Saved</span>}
                <button onClick={handleResubmit} disabled={resubmitting} className="h-[32px] px-6 bg-indigo-600 text-white font-black rounded-xl text-[10px] uppercase tracking-widest hover:bg-indigo-700 disabled:opacity-50 transition-all">
                  {resubmitting ? '...' : 'Save All Changes'}
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
