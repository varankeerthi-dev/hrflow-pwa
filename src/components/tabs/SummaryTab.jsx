import { useState, useEffect } from 'react'
import { useAuth } from '../../hooks/useAuth'
import { useEmployees } from '../../hooks/useEmployees'
import { useAttendance } from '../../hooks/useAttendance'
import Spinner from '../ui/Spinner'
import { BarChart3, Filter, FileSpreadsheet, Download } from 'lucide-react'

export default function SummaryTab() {
  const { user } = useAuth()
  const { employees } = useEmployees(user?.orgId)
  const { fetchMonthlySummary, loading } = useAttendance(user?.orgId)
  
  const [selectedMonth, setSelectedMonth] = useState(() => {
    const d = new Date()
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
  })
  const [summaryData, setSummaryData] = useState([])

  useEffect(() => {
    if (!user?.orgId || !selectedMonth) return
    fetchMonthlySummary(selectedMonth).then(setSummaryData)
  }, [user?.orgId, selectedMonth])

  const exportCSV = () => {
    // Basic CSV Export Logic
    const headers = ['Employee Name', 'Present Days', 'Absent Days', 'OT Hours', 'Attendance %']
    const rows = summaryData.map(row => {
      const emp = employees.find(e => e.id === row.employeeId)
      const total = row.present + row.absent
      const pct = total > 0 ? Math.round((row.present / total) * 100) : 0
      return [emp?.name || row.employeeId, row.present, row.absent, row.otHours.toFixed(2), `${pct}%`]
    })
    
    let csvContent = "data:text/csv;charset=utf-8," + headers.join(",") + "\n" + rows.map(e => e.join(",")).join("\n")
    const encodedUri = encodeURI(csvContent)
    const link = document.createElement("a")
    link.setAttribute("href", encodedUri)
    link.setAttribute("download", `Summary_${selectedMonth}.csv`)
    document.body.appendChild(link)
    link.click()
  }

  return (
    <div className="space-y-6 font-inter">
      {/* Analytics Filter Header */}
      <div className="bg-white p-6 rounded-[12px] shadow-sm border border-gray-100 flex flex-wrap justify-between items-center gap-4">
        <div className="flex items-center gap-3">
          <BarChart3 size={20} className="text-indigo-600" />
          <h3 className="text-sm font-bold text-gray-800 uppercase tracking-tight">Monthly Performance</h3>
        </div>
        <div className="flex gap-2">
          <div className="flex items-center bg-gray-50 rounded-lg p-1 border border-gray-200">
            <input 
              type="month" 
              value={selectedMonth} 
              onChange={e => setSelectedMonth(e.target.value)} 
              className="bg-transparent border-none outline-none px-3 text-[13px] font-semibold text-gray-700 h-[32px]" 
            />
          </div>
          <button onClick={exportCSV} className="h-[40px] px-4 bg-indigo-600 text-white rounded-lg text-[12px] font-bold flex items-center gap-2 hover:bg-indigo-700 transition-all uppercase tracking-widest shadow-md">
            <Download size={14} /> Export CSV
          </button>
        </div>
      </div>

      {/* Stats Summary Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {[
          { label: 'Avg. Attendance', value: `${Math.round(summaryData.reduce((acc, curr) => acc + (curr.present / (curr.present + curr.absent || 1)), 0) / (summaryData.length || 1) * 100)}%`, color: 'indigo' },
          { label: 'Total OT Logged', value: `${summaryData.reduce((acc, curr) => acc + curr.otHours, 0).toFixed(1)}h`, color: 'green' },
          { label: 'Total Absences', value: summaryData.reduce((acc, curr) => acc + curr.absent, 0), color: 'red' }
        ].map(stat => (
          <div key={stat.label} className="bg-white p-6 rounded-[12px] shadow-sm border border-gray-100">
            <p className="text-[11px] font-bold text-gray-400 uppercase tracking-widest mb-1">{stat.label}</p>
            <p className={`text-2xl font-black text-${stat.color}-600 tracking-tighter`}>{stat.value}</p>
          </div>
        ))}
      </div>

      {/* Detailed Report Table Card */}
      <div className="bg-white rounded-[12px] border border-gray-100 shadow-sm overflow-hidden">
        <div className="p-6 border-b border-gray-50">
          <div className="flex items-center gap-2">
            <FileSpreadsheet size={16} className="text-gray-400" />
            <span className="text-[11px] font-bold text-gray-400 uppercase tracking-widest">Granular Resource Report</span>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="h-[42px] bg-[#f9fafb]">
                <th className="px-[16px] text-[12px] font-semibold text-[#6b7280] uppercase tracking-wider">Employee Name</th>
                <th className="px-[16px] text-[12px] font-semibold text-[#6b7280] uppercase tracking-wider text-center">Present</th>
                <th className="px-[16px] text-[12px] font-semibold text-[#6b7280] uppercase tracking-wider text-center">Absent</th>
                <th className="px-[16px] text-[12px] font-semibold text-[#6b7280] uppercase tracking-wider text-center">OT Hours</th>
                <th className="px-[16px] text-[12px] font-semibold text-[#6b7280] uppercase tracking-wider text-right">Reliability</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#f1f5f9]">
              {loading ? (
                <tr><td colSpan={5} className="text-center py-12"><Spinner /></td></tr>
              ) : summaryData.length === 0 ? (
                <tr><td colSpan={5} className="text-center py-20 text-gray-300 font-medium uppercase tracking-tighter text-lg opacity-40 italic">No activity data for this period</td></tr>
              ) : (
                summaryData.map(row => {
                  const emp = employees.find(e => e.id === row.employeeId)
                  const total = row.present + row.absent
                  const pct = total > 0 ? Math.round((row.present / total) * 100) : 0
                  return (
                    <tr key={row.employeeId} className="h-[48px] hover:bg-[#f8fafc] transition-colors group">
                      <td className="px-[16px]">
                        <p className="text-[13px] font-bold text-gray-700 uppercase tracking-tight">{emp?.name || 'Deleted Account'}</p>
                        <p className="text-[10px] text-gray-400 font-medium">{emp?.department || 'Operations'}</p>
                      </td>
                      <td className="px-[16px] text-center">
                        <span className="bg-green-50 text-green-700 px-2.5 py-1 rounded-md text-[11px] font-bold">{row.present}d</span>
                      </td>
                      <td className="px-[16px] text-center">
                        <span className="bg-red-50 text-red-700 px-2.5 py-1 rounded-md text-[11px] font-bold">{row.absent}d</span>
                      </td>
                      <td className="px-[16px] text-center">
                        <span className="font-mono font-bold text-gray-600 text-[13px]">{row.otHours.toFixed(1)}h</span>
                      </td>
                      <td className="px-[16px] text-right">
                        <div className="flex flex-col items-end gap-1">
                          <div className="w-24 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                            <div className={`h-full rounded-full transition-all duration-1000 ${pct > 80 ? 'bg-indigo-500' : pct > 50 ? 'bg-amber-500' : 'bg-red-500'}`} style={{ width: `${pct}%` }}></div>
                          </div>
                          <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">{pct}%</span>
                        </div>
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
