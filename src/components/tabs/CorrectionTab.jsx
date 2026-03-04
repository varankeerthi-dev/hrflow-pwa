import { useState, useEffect } from 'react'
import { useAuth } from '../../hooks/useAuth'
import { useEmployees } from '../../hooks/useEmployees'
import { useAttendance } from '../../hooks/useAttendance'
import { useCorrections } from '../../hooks/useCorrections'
import Spinner from '../ui/Spinner'
import { formatTimeTo12Hour } from '../../lib/salaryUtils'
import { Calendar, Search, RefreshCcw, FileText, Printer, ChevronLeft, ChevronRight } from 'lucide-react'

export default function CorrectionTab() {
  const { user } = userAuth?.() || useAuth()
  const { employees } = useEmployees(user?.orgId)
  const { fetchByDate, loading: attLoading } = useAttendance(user?.orgId)
  const { submitCorrection } = useCorrections(user?.orgId)

  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0])
  const [results, setResults] = useState([])
  const [editMode, setEditMode] = useState('single')
  const [editForm, setEditForm] = useState({
    employeeId: '',
    fromDate: new Date().toISOString().split('T')[0],
    toDate: new Date().toISOString().split('T')[0],
  })

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
        site: record?.site || '-',
        status: record ? (record.isAbsent ? 'ABSENT' : 'PRESENT') : 'ABSENT',
      }
    })
    setResults(merged)
  }

  const handleDateChange = (days) => {
    const d = new Date(selectedDate)
    d.setDate(d.getDate() + days)
    setSelectedDate(d.toISOString().split('T')[0])
  }

  const handlePrint = () => {
    window.print()
  }

  return (
    <div className="space-y-6 font-inter">
      <style>{`
        @media print {
          body * { visibility: hidden; }
          .print-only-container, .print-only-container * { visibility: visible; }
          .print-only-container { 
            position: absolute; 
            left: 0; 
            top: 0; 
            width: 100% !important; 
            margin: 0; 
            padding: 20px;
            box-shadow: none !important;
            border: none !important;
          }
          .no-print { display: none !important; }
          table { width: 100% !important; border-collapse: collapse; }
          th, td { border: 1px solid #eee !important; padding: 8px !important; }
        }
      `}</style>

      {/* Top Section */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6 no-print">
        {/* Date Filter Card */}
        <div className="lg:col-span-1">
          <div className="bg-white rounded-[12px] p-6 shadow-sm border border-gray-100 flex flex-col gap-4">
            <div className="flex items-center gap-2 text-gray-400">
              <Calendar size={16} />
              <span className="text-[11px] font-bold uppercase tracking-wider">Date Selection</span>
            </div>

            <div className="flex items-center bg-gray-50 rounded-lg p-1 border border-gray-200">
              <button onClick={() => handleDateChange(-1)} className="p-1.5 hover:bg-white rounded-md text-gray-500 transition-all"><ChevronLeft size={16} /></button>
              <input type="date" value={selectedDate} onChange={(e) => setSelectedDate(e.target.value)} className="w-full bg-transparent border-none outline-none px-2 text-sm font-semibold text-gray-700" />
              <button onClick={() => handleDateChange(1)} className="p-1.5 hover:bg-white rounded-md text-gray-500 transition-all"><ChevronRight size={16} /></button>
            </div>

            <button onClick={handleRefresh} className="h-[40px] w-full bg-indigo-600 text-white font-semibold rounded-[8px] text-[13px] flex items-center justify-center gap-2 shadow-sm hover:bg-indigo-700 transition-all">
              <Search size={14} /> Refresh Logs
            </button>
          </div>
        </div>

        {/* Action Controls Card */}
        <div className="lg:col-span-3">
          <div className="bg-white rounded-[12px] p-6 shadow-sm border border-gray-100 h-full flex flex-col">
            <div className="flex justify-between items-center mb-6">
              <div className="flex items-center gap-2 text-gray-400">
                <FileText size={16} />
                <span className="text-[11px] font-bold uppercase tracking-wider">Adjustment Manager</span>
              </div>
              <div className="bg-gray-100 p-1 rounded-lg flex">
                <button onClick={() => setEditMode('single')} className={`px-4 py-1.5 rounded-md text-[11px] font-bold transition-all uppercase tracking-tighter ${editMode === 'single' ? 'bg-white text-indigo-600 shadow-sm' : 'text-gray-400 hover:text-gray-600'}`}>Single Account</button>
                <button onClick={() => setEditMode('multiple')} className={`px-4 py-1.5 rounded-md text-[11px] font-bold transition-all uppercase tracking-tighter ${editMode === 'multiple' ? 'bg-white text-indigo-600 shadow-sm' : 'text-gray-400 hover:text-gray-600'}`}>Bulk Change</button>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 items-end">
              <div className="md:col-span-1">
                <label className="block text-[10px] font-bold text-gray-400 mb-1.5 uppercase tracking-widest">Employee</label>
                <select value={editForm.employeeId} onChange={(e) => setEditForm(prev => ({ ...prev, employeeId: e.target.value }))} className="w-full h-[42px] border border-gray-200 rounded-lg px-3 text-[13px] font-medium focus:ring-2 focus:ring-indigo-500 outline-none bg-gray-50/50">
                  <option value="">Choose employee...</option>
                  {employees.map(emp => <option key={emp.id} value={emp.id}>{emp.name}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-[10px] font-bold text-gray-400 mb-1.5 uppercase tracking-widest">Start Date</label>
                <input type="date" value={editForm.fromDate} onChange={(e) => setEditForm(prev => ({ ...prev, fromDate: e.target.value }))} className="w-full h-[42px] border border-gray-200 rounded-lg px-3 text-[13px] font-medium focus:ring-2 focus:ring-indigo-500 outline-none bg-gray-50/50" />
              </div>
              <div>
                <label className="block text-[10px] font-bold text-gray-400 mb-1.5 uppercase tracking-widest">End Date</label>
                <input type="date" value={editForm.toDate} onChange={(e) => setEditForm(prev => ({ ...prev, toDate: e.target.value }))} className="w-full h-[42px] border border-gray-200 rounded-lg px-3 text-[13px] font-medium focus:ring-2 focus:ring-indigo-500 outline-none bg-gray-50/50" />
              </div>
              <button className="h-[40px] w-full bg-indigo-600 text-white font-bold rounded-[8px] text-[12px] shadow-sm hover:bg-indigo-700 transition-all uppercase tracking-widest">Apply Request</button>
            </div>
          </div>
        </div>
      </div>

      {/* Results Table Card */}
      <div className="bg-white rounded-[12px] border border-gray-100 shadow-sm overflow-hidden print-only-container">
        <div className="p-6 flex justify-between items-center bg-white border-b border-gray-50 no-print">
          <div className="flex items-center gap-2">
            <div className="w-2.5 h-2.5 bg-indigo-500 rounded-full"></div>
            <h3 className="text-sm font-bold text-gray-800 uppercase tracking-tight">Daily Summary Logs</h3>
          </div>
          <div className="flex gap-2">
            <button onClick={handlePrint} className="h-[36px] bg-[#f3f4f6] text-[#374151] px-4 rounded-[8px] text-[12px] font-semibold flex items-center gap-2 hover:bg-gray-200 transition-all uppercase tracking-tighter">
              <Printer size={14} /> Export PDF
            </button>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="h-[42px] bg-[#f9fafb]">
                <th className="px-[16px] text-[12px] font-semibold text-[#6b7280] uppercase tracking-wider">Date</th>
                <th className="px-[16px] text-[12px] font-semibold text-[#6b7280] uppercase tracking-wider">Employee Name</th>
                <th className="px-[16px] text-[12px] font-semibold text-[#6b7280] uppercase tracking-wider text-center">In</th>
                <th className="px-[16px] text-[12px] font-semibold text-[#6b7280] uppercase tracking-wider text-center">Out</th>
                <th className="px-[16px] text-[12px] font-semibold text-[#6b7280] uppercase tracking-wider text-center">OT</th>
                <th className="px-[16px] text-[12px] font-semibold text-[#6b7280] uppercase tracking-wider text-center">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#f1f5f9]">
              {attLoading ? (
                <tr><td colSpan={6} className="text-center py-12"><Spinner /></td></tr>
              ) : results.length === 0 ? (
                <tr><td colSpan={6} className="text-center py-12 text-gray-400 italic">No records found for this date</td></tr>
              ) : results.map((row, i) => (
                <tr key={i} className="h-[48px] hover:bg-[#f8fafc] transition-colors group">
                  <td className="px-[16px] text-[12px] font-medium text-gray-400">{row.date}</td>
                  <td className="px-[16px] text-[13px] font-bold text-gray-700 uppercase tracking-tight">{row.name}</td>
                  <td className="px-[16px] text-center text-[12px] font-semibold text-gray-600">{formatTimeTo12Hour(row.in)}</td>
                  <td className="px-[16px] text-center text-[12px] font-semibold text-gray-600">{formatTimeTo12Hour(row.out)}</td>
                  <td className="px-[16px] text-center text-[12px] font-bold text-indigo-600 font-mono">{row.ot}</td>
                  <td className="px-[16px] text-center">
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-widest ${row.status === 'PRESENT' ? 'bg-green-100 text-green-600' : 'bg-red-100 text-red-500'}`}>
                      {row.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
