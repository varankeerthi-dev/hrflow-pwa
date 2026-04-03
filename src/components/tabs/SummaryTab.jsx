import React, { useState, useEffect, useMemo, useRef } from 'react'
import { useAuth } from '../../hooks/useAuth'
import { useEmployees } from '../../hooks/useEmployees'
import { useAttendance } from '../../hooks/useAttendance'
import Spinner from '../ui/Spinner'
import { BarChart3, FileSpreadsheet, Download, ChevronLeft, ChevronRight, Calendar, Filter, GripVertical, Save, X, ArrowRight } from 'lucide-react'
import { getDocs, collection, query, where, setDoc, doc, getDoc, serverTimestamp } from 'firebase/firestore'
import { db } from '../../lib/firebase'
import { formatTimeTo12Hour } from '../../lib/salaryUtils'
import { isEmployeeActiveStatus } from '../../lib/employeeStatus'

function formatOTHours(otHours) {
  if (!otHours) return '-'
  const [h, m] = otHours.split(':').map(Number)
  if (isNaN(h) || isNaN(m)) return '-'
  if (m === 0) return `${h}h`
  return `${h}h ${m}m`
}

export default function SummaryTab({ defaultSubTab = 'summary' }) {
  const { user } = useAuth()
  const { employees } = useEmployees(user?.orgId)
  const { fetchMonthlySummary, loading: summaryLoading } = useAttendance(user?.orgId)
  
  const [activeSubTab, setActiveSubTab] = useState(defaultSubTab || 'summary')
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
  const [showColumnSettings, setShowColumnSettings] = useState(false)
  const [columnSettings, setColumnSettings] = useState({
    date: true,
    inTime: true,
    outTime: true,
    ot: true,
    remarks: false
  })
  const [remarksLabel, setRemarksLabel] = useState('Remarks')
  const [selectedDetail, setSelectedDayDetail] = useState(null) // { empId, day, att, dateStr, status }

  useEffect(() => {
    if (!user?.orgId) return
    const fetchOrgSettings = async () => {
      const orgSnap = await getDoc(doc(db, 'organisations', user.orgId))
      if (orgSnap.exists()) {
        const data = orgSnap.data()
        if (data.columnSettings) setColumnSettings(data.columnSettings)
        if (data.remarksLabel) setRemarksLabel(data.remarksLabel)
      }
    }
    fetchOrgSettings()
  }, [user?.orgId])

  const saveColumnSettings = async () => {
    if (!user?.orgId) return
    try {
      await setDoc(doc(db, 'organisations', user.orgId), { 
        columnSettings,
        remarksLabel 
      }, { merge: true })
      alert('Settings saved as default for the organisation!')
      setShowColumnSettings(false)
    } catch (err) {
      console.error('Save settings error:', err)
      alert('Failed to save settings')
    }
  }

  useEffect(() => {
    if (!user?.orgId || !selectedMonth) return
    fetchMonthlySummary(selectedMonth).then(setSummaryData)
  }, [user?.orgId, selectedMonth])

  // Allow parent to drive which summary sub-tab opens (e.g., Monthly Summary)
  useEffect(() => {
    if (defaultSubTab) setActiveSubTab(defaultSubTab)
  }, [defaultSubTab])

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
            if (emp.hideInAttendance) return false
            if (isEmployeeActiveStatus(emp.status)) return true
            
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

        const savedOrder = Array.isArray(orgData.employeeOrder) ? orgData.employeeOrder : []
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
          <h1 class="text-center text-sm font-inter font-bold mb-2">Monthly Attendance - ${formatMonth(selectedMonth)}</h1>
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
          className={`px-4 py-2.5 text-sm font-inter font-medium transition-all border-b-2 -mb-px ${activeSubTab === 'summary' ? 'border-gray-900 text-gray-900' : 'border-transparent text-gray-400 hover:text-gray-600'}`}
        >
          Summary
        </button>
        <button
          onClick={() => setActiveSubTab('monthlyView')}
          className={`px-4 py-2.5 text-sm font-inter font-medium transition-all border-b-2 -mb-px ${activeSubTab === 'monthlyView' ? 'border-gray-900 text-gray-900' : 'border-transparent text-gray-400 hover:text-gray-600'}`}
        >
          Monthly View
        </button>
      </div>

      {/* Month Navigator */}
      <div className="bg-white p-4 rounded-[12px] shadow-sm border border-gray-100 flex flex-wrap justify-between items-center gap-4">
        <div className="flex items-center gap-3">
          <BarChart3 size={20} className="text-indigo-600" />
          <h3 className="text-sm font-inter font-bold text-gray-800 uppercase tracking-tight">
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
            <span className="text-[14px] font-inter font-bold text-gray-700">{formatMonth(selectedMonth)}</span>
          </div>
          
          <button 
            onClick={() => navigateMonth(1)}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <ChevronRight size={18} className="text-gray-600" />
          </button>
        </div>

        {activeSubTab === 'summary' && (
          <button onClick={exportCSV} className="h-[40px] px-4 bg-indigo-600 text-white rounded-lg text-[12px] font-inter font-bold flex items-center gap-2 hover:bg-indigo-700 transition-all uppercase tracking-widest shadow-md">
            <Download size={14} /> Export CSV
          </button>
        )}
      </div>

      {/* Summary View */}
      {activeSubTab === 'summary' && (
        <>
          {/* Stats Summary Grid */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {(() => {
              const filteredSummaryData = summaryData.filter(row => {
                const emp = employees.find(e => e.id === row.employeeId)
                return emp && !emp.hideInAttendance
              })
              
              return [
                { label: 'Avg. Attendance', value: `${Math.round(filteredSummaryData.reduce((acc, curr) => acc + (curr.present / (curr.present + curr.absent || 1)), 0) / (filteredSummaryData.length || 1) * 100)}%`, color: 'indigo' },
                { label: 'Total OT Logged', value: `${filteredSummaryData.reduce((acc, curr) => acc + curr.otHours, 0).toFixed(1)}h`, color: 'green' },
                { label: 'Total Absences', value: filteredSummaryData.reduce((acc, curr) => acc + curr.absent, 0), color: 'red' }
              ].map(stat => (
                <div key={stat.label} className="bg-white p-6 rounded-[12px] shadow-sm border border-gray-100">
                  <p className="text-[11px] font-inter font-bold text-gray-400 uppercase tracking-widest mb-1">{stat.label}</p>
                  <p className={`text-2xl font-black text-${stat.color}-600 tracking-tighter`}>{stat.value}</p>
                </div>
              ))
            })()}
          </div>

          {/* Detailed Report Table Card */}
          <div className="bg-[#E8E8E8] rounded-[12px] border border-gray-100 shadow-sm overflow-hidden">
            <div className="p-6 border-b border-gray-50">
              <div className="flex items-center gap-2">
                <FileSpreadsheet size={16} className="text-gray-400" />
                <span className="text-[11px] font-inter font-bold text-gray-400 uppercase tracking-widest">Granular Resource Report</span>
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="h-[42px] bg-[#f9fafb]">
                    <th className="px-[16px] text-[12px] font-inter font-semibold text-[#6b7280] uppercase tracking-wider">Employee Name</th>
                    <th className="px-[16px] text-[12px] font-inter font-semibold text-[#6b7280] uppercase tracking-wider text-center">Present</th>
                    <th className="px-[16px] text-[12px] font-inter font-semibold text-[#6b7280] uppercase tracking-wider text-center">Absent</th>
                    <th className="px-[16px] text-[12px] font-inter font-semibold text-[#6b7280] uppercase tracking-wider text-center">OT Hours</th>
                    <th className="px-[16px] text-[12px] font-inter font-semibold text-[#6b7280] uppercase tracking-wider text-right">Reliability</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#f1f5f9]">
                  {summaryLoading ? (
                    <tr><td colSpan={5} className="text-center py-12"><Spinner /></td></tr>
                  ) : summaryData.length === 0 ? (
                    <tr><td colSpan={5} className="text-center py-20 text-gray-300 font-medium uppercase tracking-tighter text-lg opacity-40 italic">No activity data for this period</td></tr>
                  ) : (
                    summaryData
                      .filter(row => {
                        const emp = employees.find(e => e.id === row.employeeId)
                        return emp && !emp.hideInAttendance
                      })
                      .map(row => {
                        const emp = employees.find(e => e.id === row.employeeId)
                        const total = row.present + row.absent
                        const pct = total > 0 ? Math.round((row.present / total) * 100) : 0
                        return (
                          <tr key={row.employeeId} className="h-[48px] hover:bg-[#f8fafc] transition-colors group">
                            <td className="px-[16px]">
                              <p className="text-[13px] font-bold text-gray-700 uppercase tracking-tight">{emp?.name || 'Deleted Account'}</p>
                              <p className="text-[10px] font-inter text-gray-400 font-medium">{emp?.department || 'Operations'}</p>
                            </td>
                            <td className="px-[16px] text-center">
                              <span className="bg-green-50 text-green-700 px-2.5 py-1 rounded-md text-[11px] font-inter font-bold">{row.present}d</span>
                            </td>
                            <td className="px-[16px] text-center">
                              <span className="bg-red-50 text-red-700 px-2.5 py-1 rounded-md text-[11px] font-inter font-bold">{row.absent}d</span>
                            </td>
                            <td className="px-[16px] text-center">
                              <span className="font-mono font-bold text-gray-600 text-[13px]">{row.otHours.toFixed(1)}h</span>
                            </td>
                            <td className="px-[16px] text-right">
                              <div className="flex flex-col items-end gap-1">
                                <div className="w-24 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                                  <div className={`h-full rounded-full transition-all duration-1000 ${pct > 80 ? 'bg-indigo-500' : pct > 50 ? 'bg-amber-500' : 'bg-red-500'}`} style={{ width: `${pct}%` }}></div>
                                </div>
                                <span className="text-[10px] font-inter font-black text-gray-400 uppercase tracking-widest">{pct}%</span>
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
        <div className="bg-white rounded-[12px] border border-gray-100 shadow-sm overflow-hidden flex flex-col">
          <div className="p-4 border-b border-gray-100 flex justify-between items-center bg-zinc-50/50">
            <div className="flex items-center gap-2">
              <FileSpreadsheet size={16} className="text-zinc-400" />
              <span className="text-[11px] font-bold text-zinc-400 uppercase tracking-widest">
                Resource Attendance Heatmap ({monthlyViewData.employees?.length || 0} Employees)
              </span>
            </div>
            <div className="flex items-center gap-2">
              <button 
                onClick={() => setShowColumnSettings(true)}
                className="h-[32px] px-3 flex items-center gap-2 bg-white hover:bg-zinc-50 border border-zinc-200 rounded-lg text-[10px] font-bold text-zinc-600 transition-all uppercase tracking-tight"
              >
                <Filter size={12} /> Columns
              </button>
              <button 
                onClick={() => setShowOrderModal(true)}
                className="h-[32px] px-3 flex items-center gap-2 bg-white hover:bg-zinc-50 border border-zinc-200 rounded-lg text-[10px] font-bold text-zinc-600 transition-all uppercase tracking-tight"
              >
                <GripVertical size={12} /> Sort
              </button>
              <button 
                onClick={exportPDF}
                className="h-[32px] px-4 bg-zinc-900 text-white rounded-lg text-[10px] font-bold flex items-center gap-2 hover:bg-black transition-all uppercase tracking-widest"
              >
                <Download size={12} /> Export
              </button>
            </div>
          </div>

          <div className="px-4 py-2 flex items-center justify-between border-b border-zinc-100 bg-white">
            <div className="flex gap-4 text-[9px] font-black uppercase tracking-tighter text-zinc-400">
              <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 bg-emerald-500 rounded-sm"></span> Present</span>
              <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 bg-rose-500 rounded-sm"></span> Absent</span>
              <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 bg-violet-500 rounded-sm"></span> Weekend</span>
              <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 bg-amber-400 rounded-sm"></span> Holiday</span>
              <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 bg-zinc-100 border border-zinc-200 rounded-sm"></span> No Data</span>
            </div>
            <p className="text-[9px] font-medium text-zinc-400 italic">* Click any square for full day details</p>
          </div>
          
          {pivotLoading ? (
            <div className="text-center py-20"><Spinner /></div>
          ) : (
            <div className="overflow-x-auto overflow-y-auto bg-white p-4">
              <table id="monthly-pivot-table" className="w-full border-separate border-spacing-[3px] text-[11px]">
                <thead>
                  <tr>
                    <th className="sticky left-0 z-20 bg-white px-2 py-2 text-left font-black text-zinc-400 uppercase tracking-widest text-[9px] min-w-[140px] border-b border-zinc-100">
                      Resource
                    </th>
                    {Array.from({ length: monthlyViewData.daysInMonth || 31 }, (_, i) => i + 1).map(day => {
                       const [year, month] = selectedMonth.split('-').map(Number)
                       const d = new Date(year, month - 1, day)
                       const isSun = d.getDay() === 0
                       return (
                        <th key={day} className={`text-center py-2 border-b border-zinc-100 min-w-[28px]`}>
                          <div className={`text-[9px] font-black ${isSun ? 'text-rose-500' : 'text-zinc-400'}`}>{day}</div>
                          <div className="text-[7px] font-bold text-zinc-300 uppercase">
                            {['S','M','T','W','T','F','S'][d.getDay()]}
                          </div>
                        </th>
                       )
                    })}
                  </tr>
                </thead>
                <tbody>
                  {monthlyViewData.employees?.map((emp, idx) => (
                    <tr key={emp.id} className="group hover:bg-zinc-50/50 transition-colors">
                      <td className="sticky left-0 z-10 bg-white group-hover:bg-zinc-50/50 px-2 py-1.5 border-b border-zinc-50 transition-colors">
                        <div className="flex flex-col leading-tight">
                          <span className="text-[11px] font-black text-zinc-800 uppercase tracking-tight truncate max-w-[130px]" title={emp.name}>
                            {emp.name}
                          </span>
                          <span className="text-[8px] font-bold text-zinc-400 uppercase tracking-tighter">
                            {emp.department || 'Staff'}
                          </span>
                        </div>
                      </td>
                      {Array.from({ length: monthlyViewData.daysInMonth || 31 }, (_, i) => i + 1).map(day => {
                        const att = monthlyViewData.attendanceMap?.[emp.id]?.[day]
                        const statusInfo = getStatusBadge(att, day, emp, monthlyViewData.holidays || [])
                        
                        // Map status to heatmap colors
                        let squareColor = 'bg-zinc-100 border border-zinc-200'
                        if (statusInfo.type === 'present') squareColor = 'bg-emerald-500'
                        if (statusInfo.type === 'absent') squareColor = 'bg-rose-500'
                        if (statusInfo.type === 'weekend') squareColor = 'bg-violet-500'
                        if (statusInfo.type === 'holiday') squareColor = 'bg-amber-400'
                        if (statusInfo.type === 'sunday' && statusInfo.text === 'Sunday') squareColor = 'bg-rose-100 border border-rose-200'
                        if (statusInfo.type === 'sunday' && statusInfo.text === 'Absent') squareColor = 'bg-rose-500'

                        const [year, month] = selectedMonth.split('-').map(Number)
                        const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`

                        return (
                          <td key={day} className="p-0 text-center align-middle">
                            <button
                              onClick={() => setSelectedDayDetail({
                                emp,
                                day,
                                att,
                                dateStr,
                                status: statusInfo
                              })}
                              className={`w-6 h-6 sm:w-7 sm:h-7 rounded-[4px] mx-auto transition-all transform hover:scale-110 hover:shadow-md cursor-pointer ${squareColor}`}
                              title={`${emp.name} - ${day}: ${statusInfo.text}`}
                            />
                          </td>
                        )
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Day Detail Popover Modal */}
      {selectedDetail && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-zinc-900/40 backdrop-blur-md px-4" onClick={() => setSelectedDayDetail(null)}>
          <div 
            className="bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden animate-in zoom-in-95 fade-in duration-200 border border-zinc-100"
            onClick={e => e.stopPropagation()}
          >
            {/* Header */}
            <div className="relative h-24 bg-zinc-900 flex items-end px-6 pb-4">
              <button 
                onClick={() => setSelectedDayDetail(null)}
                className="absolute top-4 right-4 text-zinc-400 hover:text-white transition-colors"
              >
                <X size={20} />
              </button>
              <div className="flex flex-col">
                <h4 className="text-white font-black text-lg uppercase tracking-tight leading-none">{selectedDetail.emp.name}</h4>
                <p className="text-zinc-400 text-[10px] font-bold uppercase tracking-widest mt-1">
                  {new Date(selectedDetail.dateStr).toLocaleDateString('en-US', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
                </p>
              </div>
            </div>

            {/* Content */}
            <div className="p-6 space-y-6">
              {/* Primary Status */}
              <div className="flex items-center justify-between p-4 rounded-xl bg-zinc-50 border border-zinc-100">
                <span className="text-[10px] font-black text-zinc-400 uppercase tracking-widest">Attendance Status</span>
                <span className={`px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest border ${
                  selectedDetail.status.type === 'present' || selectedDetail.status.type === 'weekend' ? 'bg-emerald-50 text-emerald-700 border-emerald-100' :
                  selectedDetail.status.type === 'absent' || selectedDetail.status.type === 'sunday' ? 'bg-rose-50 text-rose-700 border-rose-100' :
                  'bg-zinc-100 text-zinc-600 border-zinc-200'
                }`}>
                  {selectedDetail.status.text}
                </span>
              </div>

              {/* Stats Grid */}
              <div className="grid grid-cols-2 gap-4">
                <div className="p-4 rounded-xl border border-zinc-100 flex flex-col items-center justify-center gap-1">
                  <span className="text-[9px] font-black text-zinc-400 uppercase tracking-widest">Punch In</span>
                  <span className="text-sm font-black text-zinc-800">
                    {formatTimeTo12Hour(selectedDetail.att?.inTime) || '—'}
                  </span>
                </div>
                <div className="p-4 rounded-xl border border-zinc-100 flex flex-col items-center justify-center gap-1">
                  <span className="text-[9px] font-black text-zinc-400 uppercase tracking-widest">Punch Out</span>
                  <div className="flex flex-col items-center">
                    <span className="text-sm font-black text-zinc-800">
                      {formatTimeTo12Hour(selectedDetail.att?.outTime) || '—'}
                    </span>
                    {selectedDetail.att?.shiftType === 'Night' && selectedDetail.att?.outDate && selectedDetail.att?.outDate !== selectedDetail.att?.inDate && (
                      <span className="text-[8px] font-bold text-rose-500 uppercase">Next Day</span>
                    )}
                  </div>
                </div>
                <div className="p-4 rounded-xl border border-zinc-100 flex flex-col items-center justify-center gap-1">
                  <span className="text-[9px] font-black text-zinc-400 uppercase tracking-widest">OT Hours</span>
                  <span className="text-sm font-black text-indigo-600">
                    {formatOTHours(selectedDetail.att?.otHours)}
                  </span>
                </div>
                <div className="p-4 rounded-xl border border-zinc-100 flex flex-col items-center justify-center gap-1">
                  <span className="text-[9px] font-black text-zinc-400 uppercase tracking-widest">Shift</span>
                  <span className={`text-[10px] font-black uppercase tracking-widest px-2 py-0.5 rounded ${
                    selectedDetail.att?.shiftType === 'Night' ? 'bg-zinc-800 text-white' : 'bg-amber-100 text-amber-700'
                  }`}>
                    {selectedDetail.att?.shiftType || 'Day'}
                  </span>
                </div>
              </div>

              {/* Remarks Section */}
              <div className="space-y-2">
                <span className="text-[9px] font-black text-zinc-400 uppercase tracking-widest pl-1">{remarksLabel}</span>
                <div className="p-4 rounded-xl bg-zinc-50 border border-zinc-100 min-h-[60px] text-xs font-medium text-zinc-600 italic">
                  {selectedDetail.att?.remarks || 'No remarks recorded for this session.'}
                </div>
              </div>

              <button 
                onClick={() => setSelectedDayDetail(null)}
                className="w-full h-12 bg-zinc-900 text-white rounded-xl font-black text-xs uppercase tracking-widest shadow-xl hover:bg-black transition-all active:scale-95 mt-4"
              >
                Close Details
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Column Settings Modal */}
      {showColumnSettings && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-sm mx-4 flex flex-col">
            <div className="flex items-center justify-between p-4 border-b border-gray-100">
              <h3 className="text-sm font-inter font-bold text-gray-800">Column Settings</h3>
              <button onClick={() => setShowColumnSettings(false)} className="p-1 hover:bg-gray-100 rounded-lg">
                <X size={18} className="text-gray-500" />
              </button>
            </div>
            <div className="p-6 space-y-6">
              <div className="space-y-3">
                <p className="text-[11px] font-black text-gray-400 uppercase tracking-widest">Visible Columns</p>
                <div className="grid grid-cols-1 gap-2">
                  {[
                    { id: 'inTime', label: 'In Time' },
                    { id: 'outTime', label: 'Out Time' },
                    { id: 'ot', label: 'OT Hours' },
                    { id: 'remarks', label: 'Remarks / Extra Info' }
                  ].map(col => (
                    <label key={col.id} className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg border border-gray-200 cursor-pointer hover:bg-gray-100 transition-colors">
                      <input 
                        type="checkbox" 
                        checked={columnSettings[col.id]} 
                        onChange={e => setColumnSettings(prev => ({ ...prev, [col.id]: e.target.checked }))}
                        className="w-4 h-4 text-indigo-600 rounded"
                      />
                      <span className="text-[13px] font-medium text-gray-700">{col.label}</span>
                    </label>
                  ))}
                </div>
              </div>

              <div className="space-y-3">
                <p className="text-[11px] font-black text-gray-400 uppercase tracking-widest">Custom Label for Remarks</p>
                <div className="space-y-1">
                  <input 
                    type="text"
                    value={remarksLabel}
                    onChange={e => setRemarksLabel(e.target.value)}
                    placeholder="e.g. Site Name, Comments..."
                    className="w-full h-10 border border-gray-200 rounded-lg px-3 text-sm font-medium focus:ring-2 focus:ring-indigo-500 outline-none"
                  />
                  <p className="text-[10px] text-gray-400">This will be shown in both entry and summary views</p>
                </div>
              </div>
            </div>
            <div className="p-4 border-t border-gray-100 flex gap-2">
              <button 
                onClick={() => setShowColumnSettings(false)}
                className="flex-1 h-10 bg-gray-100 text-gray-600 rounded-lg text-[12px] font-inter font-medium hover:bg-gray-200 transition-colors"
              >
                Cancel
              </button>
              <button 
                onClick={saveColumnSettings}
                className="flex-1 h-10 bg-indigo-600 text-white rounded-lg text-[12px] font-inter font-medium flex items-center justify-center gap-2 hover:bg-indigo-700 transition-colors shadow-md"
              >
                <Save size={14} /> Save Default
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Display Order Modal */}
      {showOrderModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-md mx-4 max-h-[80vh] flex flex-col">
            <div className="flex items-center justify-between p-4 border-b border-gray-100">
              <h3 className="text-sm font-inter font-bold text-gray-800">Display Order</h3>
              <button onClick={() => setShowOrderModal(false)} className="p-1 hover:bg-gray-100 rounded-lg">
                <X size={18} className="text-gray-500" />
              </button>
            </div>
            <div className="flex-1 overflow-auto p-4">
              <p className="text-[11px] font-inter text-gray-500 mb-3">Drag and drop to reorder employees</p>
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
                      <span className="text-[12px] font-inter font-medium text-gray-700">{emp.name}</span>
                    </div>
                  )
                })}
              </div>
            </div>
            <div className="p-4 border-t border-gray-100 flex gap-2">
              <button 
                onClick={() => setShowOrderModal(false)}
                className="flex-1 h-10 bg-gray-100 text-gray-600 rounded-lg text-[12px] font-inter font-medium hover:bg-gray-200 transition-colors"
              >
                Cancel
              </button>
              <button 
                onClick={saveDisplayOrder}
                className="flex-1 h-10 bg-indigo-600 text-white rounded-lg text-[12px] font-inter font-medium flex items-center justify-center gap-2 hover:bg-indigo-700 transition-colors"
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
