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
        in: record?.inTime || '-',
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
    <div className="flex flex-col h-full gap-4 font-inter overflow-hidden">
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

      {/* ── TOP SECTION: Date Selector + Results Table ── */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-4 min-h-0">
        
        {/* Date Selector (Top Left) */}
        <div className="lg:col-span-1 no-print">
          <div className="bg-white rounded-[16px] p-6 shadow-sm border border-gray-100 h-full flex flex-col gap-4">
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
              <Search size={14} /> View Day
            </button>
            
            <button onClick={() => window.print()} className="h-[38px] w-full bg-emerald-500 text-white font-bold rounded-xl text-[11px] flex items-center justify-center gap-2 hover:bg-emerald-600 transition-all shadow-lg shadow-emerald-50">
              <Printer size={14} />
            </button>
          </div>
        </div>

        {/* Daily Summary Logs (Top Right) */}
        <div className="lg:col-span-3 bg-white rounded-[16px] border border-gray-100 shadow-sm overflow-hidden flex flex-col min-h-[350px] print-area">
          <div className="px-5 py-4 flex justify-between items-center bg-white border-b border-gray-50 no-print shrink-0">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-indigo-50 flex items-center justify-center">
                <FileText size={16} className="text-indigo-600" />
              </div>
              <h3 className="text-[13px] font-black text-gray-800 uppercase tracking-tight">Results</h3>
            </div>
          </div>

          <div className="flex-1 overflow-auto">
            {attLoading ? (
              <div className="flex justify-center py-20"><Spinner /></div>
            ) : (
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="h-[40px] bg-[#f9fafb] sticky top-0 border-b border-gray-100">
                    <th className="px-5 text-[10px] font-black text-gray-400 uppercase tracking-widest">Date</th>
                    <th className="px-5 text-[10px] font-black text-gray-400 uppercase tracking-widest">Name</th>
                    <th className="px-5 text-[10px] font-black text-gray-400 uppercase tracking-widest text-center">In</th>
                    <th className="px-5 text-[10px] font-black text-gray-400 uppercase tracking-widest text-center">Out</th>
                    <th className="px-5 text-[10px] font-black text-gray-400 uppercase tracking-widest text-center">OT</th>
                    <th className="px-5 text-[10px] font-black text-gray-400 uppercase tracking-widest">Site</th>
                    <th className="px-5 text-[10px] font-black text-gray-400 uppercase tracking-widest text-center">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#f1f5f9]">
                  {results.length === 0 ? (
                    <tr><td colSpan={7} className="text-center py-20 text-gray-300 italic text-[13px] font-medium">No records found for this date</td></tr>
                  ) : results.map((row, i) => (
                    <tr key={i} className="h-[48px] hover:bg-[#f8fafc] transition-colors group">
                      <td className="px-5 text-[11px] font-bold text-gray-400">{row.date}</td>
                      <td className="px-5 text-[12px] font-black text-gray-700 uppercase tracking-tight">{row.name}</td>
                      <td className="px-5 text-center text-[11px] font-bold text-gray-600">{formatTimeTo12Hour(row.in)}</td>
                      <td className="px-5 text-center text-[11px] font-bold text-gray-600">{formatTimeTo12Hour(row.out)}</td>
                      <td className="px-5 text-center text-[11px] font-black text-indigo-600 font-mono">{row.ot}</td>
                      <td className="px-5 text-[11px] font-bold text-gray-500 uppercase">{row.site}</td>
                      <td className="px-5 text-center">
                        <span className={`px-3 py-1 rounded-lg text-[9px] font-black uppercase tracking-widest ${row.status === 'PRESENT' ? 'bg-green-100 text-green-600'
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
      </div>

      {/* ── BOTTOM SECTION: Adjustment Manager (Full Width) ── */}
      <div className="bg-white rounded-[16px] p-6 shadow-sm border border-gray-100 no-print">
        <div className="flex flex-col gap-5">
          <div className="flex justify-between items-center">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-orange-50 flex items-center justify-center">
                <Search size={16} className="text-orange-600" />
              </div>
              <h3 className="text-[13px] font-black text-indigo-600 uppercase tracking-tight">Edit Attendance Record</h3>
            </div>
            <div className="bg-gray-100 p-1.5 rounded-xl flex gap-1">
              <button onClick={() => setEditMode('single')} className={`px-4 py-2 rounded-lg text-[10px] font-black transition-all uppercase tracking-widest ${editMode === 'single' ? 'bg-white text-indigo-600 shadow-sm' : 'text-gray-400 hover:text-gray-600'}`}>Single Employee</button>
              <button onClick={() => setEditMode('multiple')} className={`px-4 py-2 rounded-lg text-[10px] font-black transition-all uppercase tracking-widest ${editMode === 'multiple' ? 'bg-white text-indigo-600 shadow-sm' : 'text-gray-400 hover:text-gray-600'}`}>Multiple Employees</button>
            </div>
          </div>

          {/* Filter Row */}
          <div className="grid grid-cols-1 md:grid-cols-12 gap-4 items-end bg-gray-50/50 p-4 rounded-2xl border border-gray-100">
            <div className="md:col-span-4">
              <label className="block text-[10px] font-black text-gray-400 mb-2 uppercase tracking-widest">Employee</label>
              <select value={editForm.employeeId} onChange={e => setEditForm(p => ({ ...p, employeeId: e.target.value }))} className="w-full h-[42px] border border-gray-200 rounded-xl px-4 text-[12px] font-bold focus:ring-2 focus:ring-indigo-500 outline-none bg-white shadow-sm">
                <option value="">Choose employee...</option>
                {employees.map(emp => <option key={emp.id} value={emp.id}>{emp.name}</option>)}
              </select>
            </div>
            <div className="md:col-span-3">
              <label className="block text-[10px] font-black text-gray-400 mb-2 uppercase tracking-widest">From Date</label>
              <input type="date" value={editForm.fromDate} onChange={e => setEditForm(p => ({ ...p, fromDate: e.target.value }))} className="w-full h-[42px] border border-gray-200 rounded-xl px-4 text-[12px] font-bold focus:ring-2 focus:ring-indigo-500 outline-none bg-white shadow-sm" />
            </div>
            <div className="md:col-span-3">
              <label className="block text-[10px] font-black text-gray-400 mb-2 uppercase tracking-widest">To Date</label>
              <input type="date" value={editForm.toDate} onChange={e => setEditForm(p => ({ ...p, toDate: e.target.value }))} className="w-full h-[42px] border border-gray-200 rounded-xl px-4 text-[12px] font-bold focus:ring-2 focus:ring-indigo-500 outline-none bg-white shadow-sm" />
            </div>
            <div className="md:col-span-2">
              <button onClick={handleShowDetails} disabled={!editForm.employeeId || detailLoading} className="h-[42px] w-full bg-indigo-600 text-white font-black rounded-xl text-[11px] shadow-lg shadow-indigo-100 hover:bg-indigo-700 transition-all uppercase tracking-widest disabled:opacity-50 flex items-center justify-center gap-2">
                {detailLoading ? '...' : <><Search size={14} /> Show Details</>}
              </button>
            </div>
          </div>

          {/* Editable Detail Table */}
          {detailRows !== null && (
            <div className="mt-2 overflow-hidden rounded-2xl border border-gray-100 shadow-inner bg-gray-50/30">
              {detailRows.length === 0 ? (
                <div className="text-center py-12 text-gray-300 italic text-[14px] font-bold">No Records Found In This Range</div>
              ) : (
                <>
                  <div className="max-h-[400px] overflow-auto">
                    <table className="w-full text-left border-collapse text-[11px]">
                      <thead>
                        <tr className="h-[40px] bg-white border-b border-gray-100 sticky top-0">
                          <th className="px-5 text-[10px] font-black text-gray-400 uppercase tracking-widest">Date</th>
                          <th className="px-5 text-[10px] font-black text-gray-400 uppercase tracking-widest">Name</th>
                          <th className="px-5 text-[10px] font-black text-gray-400 uppercase tracking-widest text-center">In Time</th>
                          <th className="px-5 text-[10px] font-black text-gray-400 uppercase tracking-widest text-center">Out Time</th>
                          <th className="px-5 text-[10px] font-black text-gray-400 uppercase tracking-widest text-center">OT (auto)</th>
                          <th className="px-5 text-[10px] font-black text-gray-400 uppercase tracking-widest">Site / Remarks</th>
                          <th className="px-5 text-[10px] font-black text-gray-400 uppercase tracking-widest text-center">Status</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-50 bg-white/50">
                        {detailRows.map(row => (
                          <tr key={row.date} className={`h-[52px] hover:bg-white transition-colors ${!row.hasRecord ? 'opacity-60 bg-gray-50/50' : ''}`}>
                            <td className="px-5 font-bold text-gray-400">{displayDate(row.date)}</td>
                            <td className="px-5 font-black text-gray-700 uppercase text-[11px] tracking-tight">{row.name}</td>

                            {/* In Time */}
                            <td className="px-5 text-center">
                              <div className="flex items-center justify-center gap-2 relative">
                                <button
                                  disabled={row.isAbsent}
                                  onClick={() => setActiveTimePicker({ date: row.date, field: 'inTime', value: row.inTime })}
                                  className="text-[12px] font-black text-gray-700 disabled:opacity-30 hover:text-indigo-600 flex items-center gap-1.5"
                                >
                                  {row.inTime ? formatTimeTo12Hour(row.inTime) : <span className="text-gray-300">--:--</span>}
                                  <Clock size={12} className="text-gray-300" />
                                </button>
                                {activeTimePicker?.date === row.date && activeTimePicker?.field === 'inTime' && (
                                  <TimePicker
                                    value={activeTimePicker.value}
                                    onChange={val => { updateDetailRow(row.date, 'inTime', val); setActiveTimePicker(null) }}
                                    onClose={() => setActiveTimePicker(null)}
                                  />
                                )}
                              </div>
                            </td>

                            {/* Out Time */}
                            <td className="px-5 text-center">
                              <div className="flex items-center justify-center gap-2 relative">
                                <button
                                  disabled={row.isAbsent}
                                  onClick={() => setActiveTimePicker({ date: row.date, field: 'outTime', value: row.outTime })}
                                  className="text-[12px] font-black text-gray-700 disabled:opacity-30 hover:text-indigo-600 flex items-center gap-1.5"
                                >
                                  {row.outTime ? formatTimeTo12Hour(row.outTime) : <span className="text-gray-300">--:--</span>}
                                  <Clock size={12} className="text-gray-300" />
                                </button>
                                {activeTimePicker?.date === row.date && activeTimePicker?.field === 'outTime' && (
                                  <TimePicker
                                    value={activeTimePicker.value}
                                    onChange={val => { updateDetailRow(row.date, 'outTime', val); setActiveTimePicker(null) }}
                                    onClose={() => setActiveTimePicker(null)}
                                  />
                                )}
                              </div>
                            </td>

                            {/* OT */}
                            <td className="px-5 text-center font-mono font-black text-indigo-600 text-[12px]">{row.otHours}</td>

                            {/* Site */}
                            <td className="px-5">
                              <input
                                type="text"
                                value={row.site}
                                onChange={e => updateDetailRow(row.date, 'site', e.target.value)}
                                className="border-b border-transparent hover:border-gray-200 focus:border-indigo-500 bg-transparent p-1 text-[11px] font-bold focus:ring-0 text-gray-600 w-full placeholder-gray-200 transition-all"
                                placeholder="Enter site..."
                              />
                            </td>

                            {/* Status */}
                            <td className="px-5 text-center">
                              <select
                                value={row.status}
                                onChange={e => updateDetailRow(row.date, 'status', e.target.value)}
                                className="text-[10px] font-black border border-gray-200 rounded-lg px-2 py-1 bg-gray-50 focus:ring-2 focus:ring-indigo-500 outline-none uppercase"
                              >
                                <option value="Present">Present</option>
                                <option value="Absent">Absent</option>
                              </select>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {/* Re-submit */}
                  <div className="flex items-center justify-end px-6 py-4 border-t border-gray-100 gap-4 bg-white">
                    {resubmitDone && <span className="text-[11px] text-green-600 font-black uppercase tracking-widest animate-pulse">✓ Records Updated Successfully</span>}
                    <button
                      onClick={handleResubmit}
                      disabled={resubmitting}
                      className="h-[40px] px-8 bg-indigo-600 text-white font-black rounded-xl text-[11px] shadow-lg shadow-indigo-100 uppercase tracking-widest hover:bg-indigo-700 disabled:opacity-50 transition-all"
                    >
                      {resubmitting ? 'Processing...' : 'Save All Changes'}
                    </button>
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
