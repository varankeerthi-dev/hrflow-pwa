import { useState, useEffect } from 'react'
import { useAuth } from '../../hooks/useAuth'
import { useEmployees } from '../../hooks/useEmployees'
import { useAttendance } from '../../hooks/useAttendance'
import { useCorrections } from '../../hooks/useCorrections'
import Spinner from '../ui/Spinner'

export default function CorrectionTab() {
  const { user } = useAuth()
  const { employees } = useEmployees(user?.orgId)
  const { fetchByDate, loading: attLoading } = useAttendance(user?.orgId)
  const { submitCorrection } = useCorrections(user?.orgId)

  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0])
  const [results, setResults] = useState([])
  const [editMode, setEditMode] = useState('single') // 'single' or 'multiple'
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

    // Merge with employee list to show all employees even if no attendance record
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
    <div className="space-y-6">
      <style>{`
        @media print {
          .no-print { display: none !important; }
          .print-only { display: block !important; }
          body { background: white !important; }
          .print-container { 
            position: absolute;
            left: 0;
            top: 0;
            width: 100%;
            margin: 0;
            padding: 0;
            border: none;
            box-shadow: none;
          }
          table { width: 100% !important; border-collapse: collapse; }
          th, td { border: 1px solid #eee !important; padding: 8px !important; }
          .lg\\:col-span-3 { width: 100% !important; grid-column: span 1 / span 1 !important; }
        }
      `}</style>

      {/* Top Section: Split Screen */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">

        {/* Left Side: Date Navigator */}
        <div className="lg:col-span-1 space-y-4 no-print">
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
            <div className="flex items-center gap-2 mb-4 text-indigo-600 font-bold">
              <span className="text-xl">📅</span>
              <span>Date Filter</span>
            </div>

            <div className="flex items-center gap-2 mb-4">
              <button
                onClick={() => handleDateChange(-1)}
                className="p-2 rounded-full hover:bg-gray-100 border border-gray-200 transition-colors"
              >
                ←
              </button>
              <div className="relative flex-1">
                <input
                  type="date"
                  value={selectedDate}
                  onChange={(e) => setSelectedDate(e.target.value)}
                  className="w-full pl-3 pr-10 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                />
              </div>
              <button
                onClick={() => handleDateChange(1)}
                className="p-2 rounded-full hover:bg-gray-100 border border-gray-200 transition-colors"
              >
                →
              </button>
            </div>

            <div className="flex gap-2">
              <button
                onClick={handleRefresh}
                className="flex-1 bg-gradient-to-r from-indigo-500 to-purple-600 text-white font-bold py-2 rounded-lg shadow-md hover:shadow-lg transition-all text-sm flex items-center justify-center gap-2"
              >
                🔍 View Day
              </button>
              <button
                onClick={handleRefresh}
                title="Quick Refresh"
                className="p-2 bg-green-500 text-white rounded-lg shadow-md hover:bg-green-600 transition-all flex items-center justify-center"
              >
                🔄
              </button>
            </div>
          </div>
        </div>

        {/* Right Side: Results Table */}
        <div className="lg:col-span-3 print-container">
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
            <div className="p-5 flex justify-between items-center bg-white border-b border-gray-50 no-print">
              <div className="flex items-center gap-2 text-indigo-600 font-bold">
                <span className="text-xl">📊</span>
                <span>Results</span>
              </div>
              <div className="flex gap-2">
                <button onClick={handlePrint} className="bg-indigo-50 text-indigo-600 px-3 py-1.5 rounded-lg text-xs font-bold border border-indigo-100 hover:bg-indigo-100 flex items-center gap-1">
                  📄 PDF
                </button>
                <button onClick={handlePrint} className="bg-purple-50 text-purple-600 px-3 py-1.5 rounded-lg text-xs font-bold border border-purple-100 hover:bg-purple-100 flex items-center gap-1">
                  🖨️ Print
                </button>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm border-collapse">
                <thead className="bg-gray-50 text-gray-400 font-bold text-[10px] uppercase tracking-wider border-b border-gray-100">
                  <tr>
                    <th className="px-4 py-2">Date</th>
                    <th className="px-4 py-2">Name</th>
                    <th className="px-4 py-2 text-center">In</th>
                    <th className="px-4 py-2 text-center">Out</th>
                    <th className="px-4 py-2 text-center">OT</th>
                    <th className="px-4 py-2">Site</th>
                    <th className="px-4 py-2 text-center">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {attLoading ? (
                    <tr><td colSpan={7} className="text-center py-20"><Spinner /></td></tr>
                  ) : results.length === 0 ? (
                    <tr><td colSpan={7} className="text-center py-10 text-gray-400">No records found</td></tr>
                  ) : results.map((row, i) => (
                    <tr key={i} className="hover:bg-indigo-50/30 transition-colors group">
                      <td className="px-4 py-1.5 text-gray-500 text-xs font-medium">{row.date}</td>
                      <td className="px-4 py-1.5 text-gray-700 font-semibold">{row.name}</td>
                      <td className="px-4 py-1.5 text-center text-gray-600">{row.in}</td>
                      <td className="px-4 py-1.5 text-center text-gray-600">{row.out}</td>
                      <td className="px-4 py-1.5 text-center text-gray-600 font-mono italic">{row.ot}</td>
                      <td className="px-4 py-1.5 text-gray-500 text-xs">{row.site}</td>
                      <td className="px-4 py-1.5 text-center">
                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${row.status === 'PRESENT' ? 'bg-green-100 text-green-600' : 'bg-red-100 text-red-500'
                          }`}>
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
      </div>

      {/* Bottom Section: Edit Attendance Record */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 no-print">
        <div className="flex justify-between items-center mb-6">
          <div className="flex items-center gap-2 text-indigo-600 font-bold">
            <span className="text-xl">✏️</span>
            <span>Edit Attendance Record</span>
          </div>
          <div className="bg-gray-100 p-1 rounded-xl flex">
            <button
              onClick={() => setEditMode('single')}
              className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all ${editMode === 'single' ? 'bg-white text-indigo-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
            >
              Single Employee
            </button>
            <button
              onClick={() => setEditMode('multiple')}
              className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all ${editMode === 'multiple' ? 'bg-white text-indigo-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
            >
              Multiple Employees
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 items-end">
          <div className="md:col-span-1">
            <label className="block text-xs font-bold text-gray-400 mb-1.5 uppercase">Employee</label>
            <select
              value={editForm.employeeId}
              onChange={(e) => setEditForm(prev => ({ ...prev, employeeId: e.target.value }))}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
            >
              <option value="">Select Employee...</option>
              {employees.map(emp => (
                <option key={emp.id} value={emp.id}>{emp.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-bold text-gray-400 mb-1.5 uppercase">From Date</label>
            <input
              type="date"
              value={editForm.fromDate}
              onChange={(e) => setEditForm(prev => ({ ...prev, fromDate: e.target.value }))}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
            />
          </div>
          <div>
            <label className="block text-xs font-bold text-gray-400 mb-1.5 uppercase">To Date</label>
            <input
              type="date"
              value={editForm.toDate}
              onChange={(e) => setEditForm(prev => ({ ...prev, toDate: e.target.value }))}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
            />
          </div>
          <div>
            <button className="w-full bg-indigo-500 text-white font-bold py-2 rounded-lg shadow-md hover:bg-indigo-600 transition-all text-sm flex items-center justify-center gap-2">
              <span>🔍</span> Show Details
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
