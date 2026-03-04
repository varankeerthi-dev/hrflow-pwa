import { useState, useEffect } from 'react'
import { useAuth } from '../../hooks/useAuth'
import { useEmployees } from '../../hooks/useEmployees'
import { useAttendance } from '../../hooks/useAttendance'
import Spinner from '../ui/Spinner'

export default function SummaryTab() {
  const { user } = useAuth()
  const { employees } = useEmployees(user?.orgId)
  const { fetchMonthlySummary } = useAttendance(user?.orgId)
  
  const [selectedMonth, setSelectedMonth] = useState(new Date().toISOString().slice(0, 7))
  const [summary, setSummary] = useState([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!user?.orgId || !selectedMonth) return
    setLoading(true)
    fetchMonthlySummary(selectedMonth).then(data => {
      setSummary(data)
      setLoading(false)
    })
  }, [user?.orgId, selectedMonth])

  const handleExport = () => {
    const headers = ['Employee', 'Present', 'Absent', 'Late', 'OT Hours', 'Attendance %']
    const rows = summary.map(s => {
      const emp = employees.find(e => e.id === s.employeeId)
      const total = s.present + s.absent
      const pct = total > 0 ? Math.round((s.present / total) * 100) : 0
      return [emp?.name || s.employeeId, s.present, s.absent, 0, s.otHours, `${pct}%`]
    })
    const csv = [headers, ...rows].map(r => r.join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `attendance-${selectedMonth}.csv`
    a.click()
  }

  const totalEmployees = employees.length
  const totalPresent = summary.reduce((a, s) => a + s.present, 0)
  const totalAbsent = summary.reduce((a, s) => a + s.absent, 0)
  const totalOt = summary.reduce((a, s) => a + s.otHours, 0)
  const totalDays = totalPresent + totalAbsent
  const avgAttendance = totalDays > 0 ? Math.round((totalPresent / totalDays) * 100) : 0

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-xl font-bold text-gray-800">Monthly Summary</h2>
        <div className="flex gap-3">
          <input 
            type="month" 
            value={selectedMonth}
            onChange={e => setSelectedMonth(e.target.value)}
            className="border rounded-lg px-3 py-2"
          />
          <button 
            onClick={handleExport}
            className="bg-gray-800 text-white px-4 py-2 rounded-lg hover:bg-gray-700"
          >
            Export CSV
          </button>
        </div>
      </div>

      {/* Stat Cards */}
      <div className="grid grid-cols-4 gap-4 mb-4">
        <div className="bg-white rounded-xl shadow p-4">
          <div className="text-sm text-gray-500">Total Employees</div>
          <div className="text-2xl font-bold text-gray-800">{totalEmployees}</div>
        </div>
        <div className="bg-white rounded-xl shadow p-4">
          <div className="text-sm text-gray-500">Avg Attendance</div>
          <div className="text-2xl font-bold text-green-600">{avgAttendance}%</div>
        </div>
        <div className="bg-white rounded-xl shadow p-4">
          <div className="text-sm text-gray-500">Total OT</div>
          <div className="text-2xl font-bold text-amber-600">{totalOt.toFixed(1)}h</div>
        </div>
        <div className="bg-white rounded-xl shadow p-4">
          <div className="text-sm text-gray-500">Avg Late</div>
          <div className="text-2xl font-bold text-gray-800">0</div>
        </div>
      </div>

      {/* Table */}
      <div className="flex-1 overflow-auto bg-white rounded-xl shadow">
        <table className="w-full">
          <thead className="bg-gray-50 sticky top-0">
            <tr>
              {['Employee', 'Present', 'Absent', 'Late', 'OT', 'Attendance %'].map(h => (
                <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-widest">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {loading ? (
              <tr><td colSpan={6} className="text-center py-8"><Spinner /></td></tr>
            ) : summary.length === 0 ? (
              <tr><td colSpan={6} className="text-center py-8 text-gray-400">No data for this month</td></tr>
            ) : summary.map(s => {
              const emp = employees.find(e => e.id === s.employeeId)
              const total = s.present + s.absent
              const pct = total > 0 ? Math.round((s.present / total) * 100) : 0
              const barColor = pct >= 90 ? 'bg-green-500' : pct >= 70 ? 'bg-yellow-500' : 'bg-red-500'
              return (
                <tr key={s.employeeId} className="hover:bg-gray-50">
                  <td className="px-4 py-3 font-medium text-gray-800">{emp?.name || s.employeeId}</td>
                  <td className="px-4 py-3 text-green-600 font-medium">{s.present}</td>
                  <td className="px-4 py-3 text-red-600 font-medium">{s.absent}</td>
                  <td className="px-4 py-3 text-gray-600">0</td>
                  <td className="px-4 py-3 text-amber-600 font-medium">{s.otHours.toFixed(1)}h</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <div className="w-24 h-2 bg-gray-200 rounded-full overflow-hidden">
                        <div className={`h-full ${barColor}`} style={{ width: `${pct}%` }}></div>
                      </div>
                      <span className="text-sm font-medium">{pct}%</span>
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
