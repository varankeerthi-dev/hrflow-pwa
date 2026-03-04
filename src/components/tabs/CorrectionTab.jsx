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
    <div className="flex flex-col h-full gap-3 font-inter overflow-hidden">
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

      {/* ── TOP: Daily Summary Logs ── */}
      <div className="flex-1 bg-white rounded-[12px] border border-gray-100 shadow-sm overflow-hidden flex flex-col min-h-0 print-area">
        <div className="px-4 py-2.5 flex justify-between items-center bg-white border-b border-gray-50 no-print shrink-0">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 bg-indigo-500 rounded-full"></div>
            <h3 className="text-[12px] font-bold text-gray-800 uppercase tracking-tight">Daily Summary Logs</h3>
          </div>
        </div>

        <div className="flex-1 overflow-auto">
          {attLoading ? (
            <div className="flex justify-center py-10"><Spinner /></div>
          ) : (
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="h-[36px] bg-[#f9fafb] sticky top-0">
                  <th className="px-4 text-[10px] font-bold text-gray-400 uppercase tracking-wider">Date</th>
                  <th className="px-4 text-[10px] font-bold text-gray-400 uppercase tracking-wider">Employee Name</th>
                  <th className="px-4 text-[10px] font-bold text-gray-400 uppercase tracking-wider text-center">In</th>
                  <th className="px-4 text-[10px] font-bold text-gray-400 uppercase tracking-wider text-center">Out</th>
                  <th className="px-4 text-[10px] font-bold text-gray-400 uppercase tracking-wider text-center">OT</th>
                  <th className="px-4 text-[10px] font-bold text-gray-400 uppercase tracking-wider text-center">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#f1f5f9]">
                {results.length === 0 ? (
                  <tr><td colSpan={6} className="text-center py-10 text-gray-300 italic text-[12px]">No records found for this date</td></tr>
                ) : results.map((row, i) => (
                  <tr key={i} className="h-[40px] hover:bg-[#f8fafc] transition-colors">
                    <td className="px-4 text-[11px] font-medium text-gray-400">{row.date}</td>
                    <td className="px-4 text-[12px] font-bold text-gray-700 uppercase tracking-tight">{row.name}</td>
                    <td className="px-4 text-center text-[11px] font-semibold text-gray-600">{formatTimeTo12Hour(row.in)}</td>
                    <td className="px-4 text-center text-[11px] font-semibold text-gray-600">{formatTimeTo12Hour(row.out)}</td>
                    <td className="px-4 text-center text-[11px] font-bold text-indigo-600 font-mono">{row.ot}</td>
                    <td className="px-4 text-center">
                      <span className={`px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-widest ${row.status === 'PRESENT' ? 'bg-green-100 text-green-600'
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

      {/* ── BOTTOM: Date selector + Adjustment Manager ── */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-3 no-print shrink-0">

        {/* Date Selector */}
        <div className="lg:col-span-1">
          <div className="bg-white rounded-[12px] p-4 shadow-sm border border-gray-100 flex flex-col gap-3">
            <div className="flex items-center gap-2 text-gray-400">
              <Calendar size={15} />
              <span className="text-[10px] font-bold uppercase tracking-wider">Date Selection</span>
            </div>
            <div className="flex items-center bg-gray-50 rounded-lg p-1 border border-gray-200">
              <button onClick={() => handleDateChange(-1)} className="p-1.5 hover:bg-white rounded-md text-gray-500 transition-all"><ChevronLeft size={15} /></button>
              <input type="date" value={selectedDate} onChange={e => setSelectedDate(e.target.value)} className="w-full bg-transparent border-none outline-none px-2 text-sm font-semibold text-gray-700" />
              <button onClick={() => handleDateChange(1)} className="p-1.5 hover:bg-white rounded-md text-gray-500 transition-all"><ChevronRight size={15} /></button>
            </div>
            <button onClick={handleRefresh} className="h-[36px] w-full bg-indigo-600 text-white font-semibold rounded-[8px] text-[12px] flex items-center justify-center gap-2 shadow-sm hover:bg-indigo-700 transition-all">
              <Search size={13} /> Refresh Logs
            </button>
            <button onClick={() => window.print()} className="h-[32px] w-full bg-gray-100 text-gray-600 font-semibold rounded-[8px] text-[11px] flex items-center justify-center gap-2 hover:bg-gray-200 transition-all no-print">
              <Printer size={12} /> Print / Export
            </button>
          </div>
        </div>

        {/* Adjustment Manager */}
        <div className="lg:col-span-3">
          <div className="bg-white rounded-[12px] p-4 shadow-sm border border-gray-100 h-full flex flex-col gap-3 min-h-[400px]">
            <div className="flex justify-between items-center">
              <div className="flex items-center gap-2 text-gray-400">
                <FileText size={15} />
                <span className="text-[10px] font-bold uppercase tracking-wider">Adjustment Manager</span>
              </div>
              <div className="bg-gray-100 p-1 rounded-lg flex">
                <button onClick={() => setEditMode('single')} className={`px-3 py-1 rounded-md text-[10px] font-bold transition-all uppercase ${editMode === 'single' ? 'bg-white text-indigo-600 shadow-sm' : 'text-gray-400'}`}>Single</button>
                <button onClick={() => setEditMode('multiple')} className={`px-3 py-1 rounded-md text-[10px] font-bold transition-all uppercase ${editMode === 'multiple' ? 'bg-white text-indigo-600 shadow-sm' : 'text-gray-400'}`}>Bulk Range</button>
              </div>
            </div>

            {/* Filter Row */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-3 items-end">
              <div>
                <label className="block text-[10px] font-bold text-gray-400 mb-1 uppercase tracking-widest">Employee</label>
                <select value={editForm.employeeId} onChange={e => setEditForm(p => ({ ...p, employeeId: e.target.value }))} className="w-full h-[38px] border border-gray-200 rounded-lg px-3 text-[12px] font-medium focus:ring-2 focus:ring-indigo-500 outline-none bg-gray-50/50">
                  <option value="">Choose employee...</option>
                  {employees.map(emp => <option key={emp.id} value={emp.id}>{emp.name}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-[10px] font-bold text-gray-400 mb-1 uppercase tracking-widest">From Date</label>
                <input type="date" value={editForm.fromDate} onChange={e => setEditForm(p => ({ ...p, fromDate: e.target.value }))} className="w-full h-[38px] border border-gray-200 rounded-lg px-3 text-[12px] font-medium focus:ring-2 focus:ring-indigo-500 outline-none bg-gray-50/50" />
              </div>
              <div>
                <label className="block text-[10px] font-bold text-gray-400 mb-1 uppercase tracking-widest">To Date</label>
                <input type="date" value={editForm.toDate} onChange={e => setEditForm(p => ({ ...p, toDate: e.target.value }))} className="w-full h-[38px] border border-gray-200 rounded-lg px-3 text-[12px] font-medium focus:ring-2 focus:ring-indigo-500 outline-none bg-gray-50/50" />
              </div>
              <button onClick={handleShowDetails} disabled={!editForm.employeeId || detailLoading} className="h-[38px] w-full bg-indigo-600 text-white font-bold rounded-[8px] text-[11px] shadow-sm hover:bg-indigo-700 transition-all uppercase tracking-widest disabled:opacity-50">
                {detailLoading ? 'Loading...' : 'Show Details'}
              </button>
            </div>

            {/* Editable Detail Table */}
            {detailRows !== null && (
              <div className="flex-1 overflow-auto rounded-xl border border-gray-100">
                {detailRows.length === 0 ? (
                  <div className="text-center py-8 text-gray-300 italic text-[13px] font-medium">No Record Found</div>
                ) : (
                  <>
                    <table className="w-full text-left border-collapse text-[11px]">
                      <thead>
                        <tr className="h-[34px] bg-gray-50 border-b border-gray-100">
                          <th className="px-3 text-[10px] font-bold text-gray-400 uppercase">Date</th>
                          <th className="px-3 text-[10px] font-bold text-gray-400 uppercase">Name</th>
                          <th className="px-3 text-[10px] font-bold text-gray-400 uppercase text-center">In Time</th>
                          <th className="px-3 text-[10px] font-bold text-gray-400 uppercase text-center">Out Time</th>
                          <th className="px-3 text-[10px] font-bold text-gray-400 uppercase text-center">OT (auto)</th>
                          <th className="px-3 text-[10px] font-bold text-gray-400 uppercase">Site / Remarks</th>
                          <th className="px-3 text-[10px] font-bold text-gray-400 uppercase text-center">Status</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-50">
                        {detailRows.map(row => (
                          <tr key={row.date} className={`h-[40px] hover:bg-gray-50 ${!row.hasRecord ? 'opacity-60' : ''}`}>
                            <td className="px-3 font-medium text-gray-500">{displayDate(row.date)}</td>
                            <td className="px-3 font-bold text-gray-700 uppercase text-[10px]">{row.name}</td>

                            {/* In Time */}
                            <td className="px-3 text-center">
                              <div className="flex items-center justify-center gap-1 relative">
                                <button
                                  disabled={row.isAbsent}
                                  onClick={() => setActiveTimePicker({ date: row.date, field: 'inTime', value: row.inTime })}
                                  className="text-[11px] font-bold text-gray-700 disabled:opacity-30 hover:text-indigo-600"
                                >
                                  {row.inTime ? formatTimeTo12Hour(row.inTime) : <span className="text-gray-300">—</span>}
                                </button>
                                <Clock size={11} className="text-gray-300" />
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
                            <td className="px-3 text-center">
                              <div className="flex items-center justify-center gap-1 relative">
                                <button
                                  disabled={row.isAbsent}
                                  onClick={() => setActiveTimePicker({ date: row.date, field: 'outTime', value: row.outTime })}
                                  className="text-[11px] font-bold text-gray-700 disabled:opacity-30 hover:text-indigo-600"
                                >
                                  {row.outTime ? formatTimeTo12Hour(row.outTime) : <span className="text-gray-300">—</span>}
                                </button>
                                <Clock size={11} className="text-gray-300" />
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
                            <td className="px-3 text-center font-mono font-bold text-indigo-600 text-[11px]">{row.otHours}</td>

                            {/* Site */}
                            <td className="px-3">
                              <input
                                type="text"
                                value={row.site}
                                onChange={e => updateDetailRow(row.date, 'site', e.target.value)}
                                className="border-none bg-transparent p-0 text-[11px] focus:ring-0 text-gray-500 w-full placeholder-gray-200"
                                placeholder="..."
                              />
                            </td>

                            {/* Status */}
                            <td className="px-3 text-center">
                              <select
                                value={row.status}
                                onChange={e => updateDetailRow(row.date, 'status', e.target.value)}
                                className="text-[10px] font-bold border border-gray-200 rounded-lg px-1.5 py-0.5 bg-gray-50 focus:ring-2 focus:ring-indigo-500 outline-none"
                              >
                                <option value="Present">Present</option>
                                <option value="Absent">Absent</option>
                              </select>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>

                    {/* Re-submit */}
                    <div className="flex items-center justify-end px-4 py-2 border-t border-gray-100 gap-3">
                      {resubmitDone && <span className="text-[11px] text-green-600 font-bold uppercase tracking-widest">✓ Records Updated</span>}
                      <button
                        onClick={handleResubmit}
                        disabled={resubmitting}
                        className="h-[34px] px-6 bg-indigo-600 text-white font-bold rounded-lg text-[11px] shadow-sm uppercase tracking-widest hover:bg-indigo-700 disabled:opacity-50 transition-all"
                      >
                        {resubmitting ? 'Saving...' : 'Re-Submit'}
                      </button>
                    </div>
                  </>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
