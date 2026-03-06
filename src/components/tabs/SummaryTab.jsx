import React, { useState, useEffect, useMemo, useRef } from 'react'
import { useAuth } from '../../hooks/useAuth'
import { useEmployees } from '../../hooks/useEmployees'
import { useAttendance } from '../../hooks/useAttendance'
import Spinner from '../ui/Spinner'
import { BarChart3, FileSpreadsheet, Download, ChevronLeft, ChevronRight, Calendar, Filter, GripVertical, Save, X } from 'lucide-react'
import { getDocs, collection, query, where, setDoc, doc, getDoc, serverTimestamp } from 'firebase/firestore'
import { db } from '../../lib/firebase'
import { formatTimeTo12Hour } from '../../lib/salaryUtils'

function formatOTHours(otHours) {
  if (!otHours) return '-'
  const [h, m] = otHours.split(':').map(Number)
  if (isNaN(h) || isNaN(m)) return '-'
  if (m === 0) return `${h}h`
  return `${h}h ${m}m`
}

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
  const [showOrderModal, setShowOrderModal] = useState(false)
  const [displayOrder, setDisplayOrder] = useState([])
  const [draggedItem, setDraggedItem] = useState(null)

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
        const [empSnap, attSnap, shiftSnap, orgSnap] = await Promise.all([
          getDocs(collection(db, 'organisations', user.orgId, 'employees')),
          getDocs(query(
            collection(db, 'organisations', user.orgId, 'attendance'),
            where('date', '>=', selectedMonth + '-01'),
            where('date', '<=', selectedMonth + '-31')
          )),
          getDocs(collection(db, 'organisations', user.orgId, 'shifts')),
          getDoc(doc(db, 'organisations', user.orgId))
        ])

        const shiftMap = {}
        shiftSnap.docs.forEach(d => { shiftMap[d.id] = d.data() })

        const orgData = orgSnap.exists() ? orgSnap.data() : {}
        const holidays = orgData.holidays || []

        const [year, month] = selectedMonth.split('-').map(Number)
        const daysInMonth = new Date(year, month, 0).getDate()
        
        const attendanceMap = {}
        attSnap.docs.forEach(d => {
          const data = d.data()
          const day = parseInt(data.date.split('-')[2], 10)
          if (!attendanceMap[data.employeeId]) attendanceMap[data.employeeId] = {}
          attendanceMap[data.employeeId][day] = data
        })

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

        const savedOrder = orgData.employeeOrder || []
        const orderedEmployees = [...filteredEmployees].sort((a, b) => {
          const idxA = savedOrder.indexOf(a.id)
          const idxB = savedOrder.indexOf(b.id)
          if (idxA === -1 && idxB === -1) return 0
          if (idxA === -1) return 1
          if (idxB === -1) return -1
          return idxA - idxB
        })

        setDisplayOrder(orderedEmployees.map(e => e.id))

        setMonthlyViewData({
          employees: orderedEmployees,
          attendanceMap,
          shiftMap,
          daysInMonth,
          holidays
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

  const getStatusBadge = (att, day, emp, holidays = []) => {
    if (!att) return { bg: 'bg-gray-50', text: '-', color: 'text-gray-300', type: 'none' }
    
    const [year, month] = selectedMonth.split('-').map(Number)
    const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
    const dayOfWeek = new Date(year, month - 1, day).getDay()
    const isSunday = dayOfWeek === 0
    const isHoliday = holidays.some(h => h.date === dateStr)
    
    if (att.isAbsent || isHoliday || isSunday) {
      let label = 'Absent'
      if (isHoliday && !att.isAbsent) label = 'Holiday'
      if (isSunday && !att.isAbsent && !isHoliday) label = 'Sunday'
      if (isSunday && isHoliday) label = 'Holiday'
      return { bg: 'bg-red-50', text: label, color: 'text-red-600', type: isSunday ? 'sunday' : (isHoliday ? 'holiday' : 'absent') }
    }
    if (att.inTime) {
      const isWeekend = dayOfWeek === 0 || dayOfWeek === 6
      if (isWeekend) {
        return { bg: 'bg-purple-50', text: 'W', color: 'text-purple-600', type: 'weekend' }
      }
      return { bg: 'bg-green-50', text: 'P', color: 'text-green-600', type: 'present' }
    }
    return { bg: 'bg-gray-50', text: '-', color: 'text-gray-300', type: 'none' }
  }

  const getEmployeeColor = (index) => {
    const colors = [
      'text-indigo-600',
      'text-emerald-600', 
      'text-amber-600',
      'text-rose-600',
      'text-cyan-600',
      'text-violet-600',
      'text-orange-600',
      'text-teal-600',
      'text-pink-600',
      'text-lime-600'
    ]
    return colors[index % colors.length]
  }

  const getEmployeeBorderColor = (index) => {
    const colors = [
      'border-indigo-300',
      'border-emerald-300',
      'border-amber-300',
      'border-rose-300',
      'border-cyan-300',
      'border-violet-300',
      'border-orange-300',
      'border-teal-300',
      'border-pink-300',
      'border-lime-300'
    ]
    return colors[index % colors.length]
  }

  const isNonWorkingDay = (day, holidays = []) => {
    const [year, month] = selectedMonth.split('-').map(Number)
    const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
    const dayOfWeek = new Date(year, month - 1, day).getDay()
    const isSunday = dayOfWeek === 0
    const isHoliday = holidays.some(h => h.date === dateStr)
    return isSunday || isHoliday
  }

  const exportPDF = () => {
    const printContent = document.getElementById('monthly-pivot-table')
    if (!printContent) return
    
    const printWindow = window.open('', '', 'width=1200,height=800')
    printWindow.document.write(`
      <html>
        <head>
          <title>Monthly Attendance - ${formatMonth(selectedMonth)}</title>
          <script src="https://cdn.tailwindcss.com"></script>
          <style>
            @media print {
              body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
              table { font-size: 8px; }
              th, td { padding: 2px !important; }
            }
          </style>
        </head>
        <body class="p-4">
          <h1 class="text-center text-sm font-bold mb-2">Monthly Attendance - ${formatMonth(selectedMonth)}</h1>
          ${printContent.outerHTML}
        </body>
      </html>
    `)
    printWindow.document.close()
    printWindow.focus()
    setTimeout(() => {
      printWindow.print()
      printWindow.close()
    }, 500)
  }

  const saveDisplayOrder = async () => {
    if (!user?.orgId) return
    try {
      await setDoc(doc(db, 'organisations', user.orgId), { employeeOrder: displayOrder }, { merge: true })
      alert('Display order saved!')
      setShowOrderModal(false)
      fetchPivotData()
    } catch (err) {
      console.error('Save order error:', err)
      alert('Failed to save order')
    }
  }

  const handleDragStart = (e, index) => {
    setDraggedItem(index)
    e.dataTransfer.effectAllowed = 'move'
  }

  const handleDragOver = (e, index) => {
    e.preventDefault()
    if (draggedItem === null || draggedItem === index) return
    
    const newOrder = [...displayOrder]
    const [removed] = newOrder.splice(draggedItem, 1)
    newOrder.splice(index, 0, removed)
    setDisplayOrder(newOrder)
    setDraggedItem(index)
  }

  const handleDragEnd = () => {
    setDraggedItem(null)
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
            <div className="flex items-center gap-2">
              <button 
                onClick={() => setShowOrderModal(true)}
                className="h-[36px] px-3 flex items-center gap-2 bg-gray-100 hover:bg-gray-200 rounded-lg text-[11px] font-medium text-gray-600 transition-all"
              >
                <Filter size={14} /> Display Order
              </button>
              <button 
                onClick={exportPDF}
                className="h-[36px] px-4 bg-indigo-600 text-white rounded-lg text-[11px] font-bold flex items-center gap-2 hover:bg-indigo-700 transition-all"
              >
                <Download size={14} /> Export PDF
              </button>
            </div>
          </div>
          <div className="px-4 pb-2 flex gap-4 text-[10px] border-b border-gray-100">
            <span className="flex items-center gap-1"><span className="w-3 h-3 bg-green-50 border border-green-200 rounded"></span> Present</span>
            <span className="flex items-center gap-1"><span className="w-3 h-3 bg-red-50 border border-red-200 rounded"></span> Absent</span>
            <span className="flex items-center gap-1"><span className="w-3 h-3 bg-purple-50 border border-purple-200 rounded"></span> Weekend</span>
            <span className="flex items-center gap-1"><span className="w-3 h-3 bg-amber-50 border border-amber-200 rounded"></span> Holiday</span>
          </div>
          
          {pivotLoading ? (
            <div className="text-center py-20"><Spinner /></div>
          ) : (
            <div className="overflow-x-auto max-h-[70vh] overflow-y-auto">
              <table id="monthly-pivot-table" className="w-full text-left border-collapse text-[10px]">
                <thead className="sticky top-0 z-10 bg-gray-50">
                  <tr>
                    <th className="px-1 py-2 text-center font-bold text-gray-600 border-b border-r border-gray-200 w-8 bg-gray-100" rowSpan={2}>
                      Date
                    </th>
                    {monthlyViewData.employees?.map((emp, idx) => (
                      <th 
                        key={emp.id} 
                        className={`px-1 py-2 text-center font-bold border-b border-r border-gray-200 min-w-[60px] bg-gray-50 ${getEmployeeColor(idx)}`}
                        colSpan={4}
                      >
                        <div className="text-[9px] truncate max-w-[80px] mx-auto">{emp.name}</div>
                      </th>
                    ))}
                  </tr>
                  <tr>
                    {monthlyViewData.employees?.map((emp, idx) => (
                      <React.Fragment key={emp.id}>
                        <th className={`px-0.5 py-1 text-[8px] font-medium border-b border-r border-gray-200 text-center bg-gray-50 ${getEmployeeColor(idx)}`}>Shift</th>
                        <th className={`px-0.5 py-1 text-[8px] font-medium border-b border-r border-gray-200 text-center bg-gray-50 ${getEmployeeColor(idx)}`}>In</th>
                        <th className={`px-0.5 py-1 text-[8px] font-medium border-b border-r border-gray-200 text-center bg-gray-50 ${getEmployeeColor(idx)}`}>Out</th>
                        <th className={`px-0.5 py-1 text-[8px] font-medium border-b border-r border-gray-200 text-center bg-gray-50 ${getEmployeeColor(idx)}`}>OT</th>
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
                    const isSunday = dayOfWeek === 0
                    const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
                    const isHoliday = (monthlyViewData.holidays || []).some(h => h.date === dateStr)
                    const isNonWorking = isSunday || isHoliday
                    const dayName = currentDate.toLocaleDateString('en-US', { weekday: 'short' })
                    
                    const rowClass = isSunday ? 'bg-red-25' : (isHoliday ? 'bg-amber-25' : (isWeekend ? 'bg-purple-25' : ''))
                    const dateClass = isSunday ? 'bg-red-100 text-red-700' : (isHoliday ? 'bg-amber-100 text-amber-700' : (isWeekend ? 'bg-purple-50 text-purple-700' : 'bg-gray-50 text-gray-600'))
                    
                    return (
                      <tr key={day} className={rowClass}>
                        <td className={`px-1 py-1 text-center font-bold border-b border-r border-gray-100 ${dateClass}`}>
                          <span className="text-[9px]">{day}</span>
                          <div className="text-[7px] opacity-60">{dayName}</div>
                        </td>
                        {monthlyViewData.employees?.map(emp => {
                          const [empYear, empMonth] = selectedMonth.split('-').map(Number)
                          const empStartDate = emp.joinedDate ? new Date(emp.joinedDate) : null
                          const isBeforeStart = empStartDate && new Date(empYear, empMonth - 1, day) < empStartDate
                          
                          const att = monthlyViewData.attendanceMap?.[emp.id]?.[day]
                          const status = isBeforeStart ? null : getStatusBadge(att, day, emp, monthlyViewData.holidays || [])
                          const isAbsentOrNonWorking = status?.type === 'absent' || status?.type === 'sunday' || status?.type === 'holiday'
                          const shift = att?.shiftId ? monthlyViewData.shiftMap?.[att.shiftId] : null
                          
                          return (
                            <React.Fragment key={emp.id}>
                              {isAbsentOrNonWorking ? (
                                <td colSpan={4} className={`px-0.5 py-1 text-center border-b border-r border-gray-50 ${isBeforeStart ? 'bg-gray-50' : 'bg-red-50'}`}>
                                  <span className={`text-[10px] font-bold ${isBeforeStart ? 'text-gray-200' : status.color}`}>
                                    {isBeforeStart ? '-' : status.text}
                                  </span>
                                </td>
                              ) : (
                                <>
                                  <td className="px-0.5 py-1 text-center border-b border-r border-gray-50">
                                    {isBeforeStart ? (
                                      <span className="text-gray-200">-</span>
                                    ) : shift ? (
                                      <span className="text-[8px] font-medium text-gray-600">{shift.type || 'D'}</span>
                                    ) : (
                                      <span className="text-gray-200">-</span>
                                    )}
                                  </td>
                                  <td className="px-0.5 py-1 text-center border-b border-r border-gray-50 text-[9px] font-mono text-gray-600">
                                    {isBeforeStart ? '-' : formatTimeTo12Hour(att?.inTime) || '-'}
                                  </td>
                                  <td className="px-0.5 py-1 text-center border-b border-r border-gray-50 text-[9px] font-mono text-gray-600">
                                    {isBeforeStart ? '-' : formatTimeTo12Hour(att?.outTime) || '-'}
                                  </td>
                                  <td className="px-0.5 py-1 text-center border-b border-r border-gray-50 text-[9px] font-mono text-gray-600">
                                    {isBeforeStart ? '-' : formatOTHours(att?.otHours)}
                                  </td>
                                </>
                              )}
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

      {/* Display Order Modal */}
      {showOrderModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-md mx-4 max-h-[80vh] flex flex-col">
            <div className="flex items-center justify-between p-4 border-b border-gray-100">
              <h3 className="text-sm font-bold text-gray-800">Display Order</h3>
              <button onClick={() => setShowOrderModal(false)} className="p-1 hover:bg-gray-100 rounded-lg">
                <X size={18} className="text-gray-500" />
              </button>
            </div>
            <div className="flex-1 overflow-auto p-4">
              <p className="text-[11px] text-gray-500 mb-3">Drag and drop to reorder employees</p>
              <div className="space-y-2">
                {displayOrder.map((empId, index) => {
                  const emp = monthlyViewData.employees?.find(e => e.id === empId)
                  if (!emp) return null
                  return (
                    <div
                      key={empId}
                      draggable
                      onDragStart={(e) => handleDragStart(e, index)}
                      onDragOver={(e) => handleDragOver(e, index)}
                      onDragEnd={handleDragEnd}
                      className={`flex items-center gap-3 p-3 bg-gray-50 rounded-lg border border-gray-200 cursor-move hover:bg-gray-100 transition-colors ${draggedItem === index ? 'opacity-50' : ''}`}
                    >
                      <GripVertical size={16} className="text-gray-400" />
                      <span className="text-[12px] font-medium text-gray-700">{emp.name}</span>
                    </div>
                  )
                })}
              </div>
            </div>
            <div className="p-4 border-t border-gray-100 flex gap-2">
              <button 
                onClick={() => setShowOrderModal(false)}
                className="flex-1 h-10 bg-gray-100 text-gray-600 rounded-lg text-[12px] font-medium hover:bg-gray-200 transition-colors"
              >
                Cancel
              </button>
              <button 
                onClick={saveDisplayOrder}
                className="flex-1 h-10 bg-indigo-600 text-white rounded-lg text-[12px] font-medium flex items-center justify-center gap-2 hover:bg-indigo-700 transition-colors"
              >
                <Save size={14} /> Save Default
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
