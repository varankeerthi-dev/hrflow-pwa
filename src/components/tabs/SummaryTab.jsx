import React, { useState, useEffect, useMemo } from 'react'
import { useAuth } from '../../hooks/useAuth'
import { useEmployees } from '../../hooks/useEmployees'
import { useAttendance } from '../../hooks/useAttendance'
import Spinner from '../ui/Spinner'
import { BarChart3, FileSpreadsheet, Download, ChevronLeft, ChevronRight, Calendar } from 'lucide-react'
import { getDocs, collection, query, where } from 'firebase/firestore'
import { db } from '../../lib/firebase'

export default function SummaryTab() {
  const { user } = useAuth()
  const { employees } = useEmployees(user?.orgId)
  const { fetchMonthlySummary, loading: summaryLoading } = useAttendance(user?.orgId)
  
  const [activeSubTab, setActiveSubTab] = useState('summary')
  const [selectedMonth, setSelectedMonth] = useState(() => {
    const d = new Date()
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
  })
  const [summaryData, setSummaryData] = useState([])
  const [monthlyViewData, setMonthlyViewData] = useState([])
  const [shifts, setShifts] = useState([])
  const [pivotLoading, setPivotLoading] = useState(false)

  useEffect(() => {
    if (!user?.orgId || !selectedMonth) return
    fetchMonthlySummary(selectedMonth).then(setSummaryData)
  }, [user?.orgId, selectedMonth])

  useEffect(() => {
    if (activeSubTab !== 'monthlyView') return
    if (!user?.orgId || !selectedMonth) return

    const fetchPivotData = async () => {
      setPivotLoading(true)
      try {
        const [empSnap, attSnap, shiftSnap] = await Promise.all([
          getDocs(collection(db, 'organisations', user.orgId, 'employees')),
          getDocs(query(
            collection(db, 'organisations', user.orgId, 'attendance'),
            where('date', '>=', selectedMonth + '-01'),
            where('date', '<=', selectedMonth + '-31')
          )),
          getDocs(collection(db, 'organisations', user.orgId, 'shifts'))
        ])

        const shiftMap = {}
        shiftSnap.docs.forEach(d => { shiftMap[d.id] = d.data() })

        const [year, month] = selectedMonth.split('-').map(Number)
        const daysInMonth = new Date(year, month, 0).getDate()
        
        const attendanceMap = {}
        attSnap.docs.forEach(d => {
          const data = d.data()
          const day = parseInt(data.date.split('-')[2], 10)
          if (!attendanceMap[data.employeeId]) attendanceMap[data.employeeId] = {}
          attendanceMap[data.employeeId][day] = data
        })

        const selectedMonthStart = new Date(year, month - 1, 1)
        
        const filteredEmployees = empSnap.docs
          .map(d => ({ id: d.id, ...d.data() }))
          .filter(emp => {
            if (emp.status === 'Active') return true
            
            if (emp.joinedDate) {
              const joinDate = new Date(emp.joinedDate)
              const monthEnd = new Date(year, month - 1, daysInMonth)
              if (joinDate <= monthEnd) return true
            }
            
            if (attendanceMap[emp.id]) {
              const empDays = Object.keys(attendanceMap[emp.id]).map(Number)
              return empDays.some(day => {
                const att = attendanceMap[emp.id][day]
                return att && (att.inTime || att.isAbsent)
              })
            }
            return false
          })

        setMonthlyViewData({
          employees: filteredEmployees,
          attendanceMap,
          shiftMap,
          daysInMonth
        })
      } catch (err) {
        console.error('Pivot fetch error:', err)
      } finally {
        setPivotLoading(false)
      }
    }

    fetchPivotData()
  }, [user?.orgId, selectedMonth, activeSubTab])

  const navigateMonth = (direction) => {
    const [year, month] = selectedMonth.split('-').map(Number)
    const newDate = new Date(year, month - 1 + direction, 1)
    setSelectedMonth(`${newDate.getFullYear()}-${String(newDate.getMonth() + 1).padStart(2, '0')}`)
  }

  const formatMonth = (monthStr) => {
    const [year, month] = monthStr.split('-')
    const date = new Date(year, parseInt(month) - 1)
    return date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
  }

  const getStatusBadge = (att, day, emp) => {
    if (!att) return { bg: 'bg-gray-50', text: '-', color: 'text-gray-300' }
    
    if (att.isAbsent) {
      return { bg: 'bg-red-50', text: 'A', color: 'text-red-600' }
    }
    if (att.inTime) {
      const isWeekend = (() => {
        const [y, m] = selectedMonth.split('-').map(Number)
        const d = new Date(y, m - 1, day)
        return d.getDay() === 0 || d.getDay() === 6
      })()
      
      if (isWeekend) {
        return { bg: 'bg-purple-50', text: 'W', color: 'text-purple-600' }
      }
      return { bg: 'bg-green-50', text: 'P', color: 'text-green-600' }
    }
    return { bg: 'bg-gray-50', text: '-', color: 'text-gray-300' }
  }

  const exportCSV = () => {
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
      {/* Sub-tab Navigation */}
      <div className="flex gap-0 border-b border-gray-200">
        <button
          onClick={() => setActiveSubTab('summary')}
          className={`px-4 py-2.5 text-sm font-medium transition-all border-b-2 -mb-px ${activeSubTab === 'summary' ? 'border-gray-900 text-gray-900' : 'border-transparent text-gray-400 hover:text-gray-600'}`}
        >
          Summary
        </button>
        <button
          onClick={() => setActiveSubTab('monthlyView')}
          className={`px-4 py-2.5 text-sm font-medium transition-all border-b-2 -mb-px ${activeSubTab === 'monthlyView' ? 'border-gray-900 text-gray-900' : 'border-transparent text-gray-400 hover:text-gray-600'}`}
        >
          Monthly View
        </button>
      </div>

      {/* Month Navigator */}
      <div className="bg-white p-4 rounded-[12px] shadow-sm border border-gray-100 flex flex-wrap justify-between items-center gap-4">
        <div className="flex items-center gap-3">
          <BarChart3 size={20} className="text-indigo-600" />
          <h3 className="text-sm font-bold text-gray-800 uppercase tracking-tight">
            {activeSubTab === 'summary' ? 'Monthly Performance' : 'Monthly Attendance Pivot'}
          </h3>
        </div>
        
        {/* Month Navigator */}
        <div className="flex items-center gap-2">
          <button 
            onClick={() => navigateMonth(-1)}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <ChevronLeft size={18} className="text-gray-600" />
          </button>
          
          <div className="flex items-center bg-gray-50 rounded-lg px-4 py-2 border border-gray-200 min-w-[180px] justify-center gap-2">
            <Calendar size={16} className="text-gray-400" />
            <span className="text-[14px] font-bold text-gray-700">{formatMonth(selectedMonth)}</span>
          </div>
          
          <button 
            onClick={() => navigateMonth(1)}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <ChevronRight size={18} className="text-gray-600" />
          </button>
        </div>

        {activeSubTab === 'summary' && (
          <button onClick={exportCSV} className="h-[40px] px-4 bg-indigo-600 text-white rounded-lg text-[12px] font-bold flex items-center gap-2 hover:bg-indigo-700 transition-all uppercase tracking-widest shadow-md">
            <Download size={14} /> Export CSV
          </button>
        )}
      </div>

      {/* Summary View */}
      {activeSubTab === 'summary' && (
        <>
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
                  {summaryLoading ? (
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
        </>
      )}

      {/* Monthly Pivot View */}
      {activeSubTab === 'monthlyView' && (
        <div className="bg-white rounded-[12px] border border-gray-100 shadow-sm overflow-hidden">
          <div className="p-4 border-b border-gray-100 flex justify-between items-center">
            <div className="flex items-center gap-2">
              <FileSpreadsheet size={16} className="text-gray-400" />
              <span className="text-[11px] font-bold text-gray-400 uppercase tracking-widest">
                Daily Attendance Grid ({monthlyViewData.employees?.length || 0} Employees)
              </span>
            </div>
            <div className="flex items-center gap-4 text-[10px]">
              <span className="flex items-center gap-1"><span className="w-3 h-3 bg-green-50 border border-green-200 rounded"></span> Present</span>
              <span className="flex items-center gap-1"><span className="w-3 h-3 bg-red-50 border border-red-200 rounded"></span> Absent</span>
              <span className="flex items-center gap-1"><span className="w-3 h-3 bg-purple-50 border border-purple-200 rounded"></span> Weekend</span>
            </div>
          </div>
          
          {pivotLoading ? (
            <div className="text-center py-20"><Spinner /></div>
          ) : (
            <div className="overflow-x-auto max-h-[70vh] overflow-y-auto">
              <table className="w-full text-left border-collapse text-[10px]">
                <thead className="sticky top-0 z-10 bg-gray-50">
                  <tr>
                    <th className="px-1 py-2 text-center font-bold text-gray-600 border-b border-r border-gray-200 w-8 bg-gray-100" rowSpan={2}>
                      Date
                    </th>
                    {monthlyViewData.employees?.map(emp => (
                      <th 
                        key={emp.id} 
                        className="px-1 py-2 text-center font-bold text-gray-700 border-b border-r border-gray-200 min-w-[60px] bg-gray-50"
                        colSpan={4}
                      >
                        <div className="text-[9px] truncate max-w-[80px] mx-auto">{emp.name}</div>
                      </th>
                    ))}
                  </tr>
                  <tr>
                    {monthlyViewData.employees?.map(emp => (
                      <React.Fragment key={emp.id}>
                        <th className="px-0.5 py-1 text-[8px] font-medium text-gray-500 border-b border-r border-gray-200 text-center bg-gray-50">Shift</th>
                        <th className="px-0.5 py-1 text-[8px] font-medium text-gray-500 border-b border-r border-gray-200 text-center bg-gray-50">In</th>
                        <th className="px-0.5 py-1 text-[8px] font-medium text-gray-500 border-b border-r border-gray-200 text-center bg-gray-50">Out</th>
                        <th className="px-0.5 py-1 text-[8px] font-medium text-gray-500 border-b border-r border-gray-200 text-center bg-gray-50">OT</th>
                      </React.Fragment>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {Array.from({ length: monthlyViewData.daysInMonth || 31 }, (_, i) => i + 1).map(day => {
                    const [year, month] = selectedMonth.split('-').map(Number)
                    const currentDate = new Date(year, month - 1, day)
                    const dayOfWeek = currentDate.getDay()
                    const isWeekend = dayOfWeek === 0 || dayOfWeek === 6
                    const dayName = currentDate.toLocaleDateString('en-US', { weekday: 'short' })
                    
                    return (
                      <tr key={day} className={isWeekend ? 'bg-purple-25' : ''}>
                        <td className={`px-1 py-1 text-center font-bold border-b border-r border-gray-100 ${isWeekend ? 'bg-purple-50 text-purple-700' : 'bg-gray-50 text-gray-600'}`}>
                          <span className="text-[9px]">{day}</span>
                          <div className="text-[7px] opacity-60">{dayName}</div>
                        </td>
                        {monthlyViewData.employees?.map(emp => {
                          const [empYear, empMonth] = selectedMonth.split('-').map(Number)
                          const empStartDate = emp.joinedDate ? new Date(emp.joinedDate) : null
                          const isBeforeStart = empStartDate && new Date(empYear, empMonth - 1, day) < empStartDate
                          
                          const att = monthlyViewData.attendanceMap?.[emp.id]?.[day]
                          const status = isBeforeStart ? null : getStatusBadge(att, day, emp)
                          const shift = att?.shiftId ? monthlyViewData.shiftMap?.[att.shiftId] : null
                          
                          return (
                            <React.Fragment key={emp.id}>
                              <td className="px-0.5 py-1 text-center border-b border-r border-gray-50">
                                {isBeforeStart ? (
                                  <span className="text-gray-200">-</span>
                                ) : shift ? (
                                  <span className="text-[8px] font-medium text-gray-600">{shift.type || 'D'}</span>
                                ) : (
                                  <span className="text-gray-200">-</span>
                                )}
                              </td>
                              <td className={`px-0.5 py-1 text-center border-b border-r border-gray-50 text-[9px] font-mono ${status?.color}`}>
                                {isBeforeStart ? '-' : (att?.inTime || '-')}
                              </td>
                              <td className={`px-0.5 py-1 text-center border-b border-r border-gray-50 text-[9px] font-mono ${status?.color}`}>
                                {isBeforeStart ? '-' : (att?.outTime || '-')}
                              </td>
                              <td className={`px-0.5 py-1 text-center border-b border-r border-gray-50 text-[9px] font-mono ${status?.color}`}>
                                {isBeforeStart ? '-' : (att?.otHours || '-')}
                              </td>
                            </React.Fragment>
                          )
                        })}
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
