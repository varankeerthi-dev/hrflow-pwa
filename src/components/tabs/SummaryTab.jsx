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

  // Fetch pivot data function - defined outside useEffect to be callable from button
  const fetchPivotData = async () => {
    if (!user?.orgId || !selectedMonth) return
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

  // Auto-fetch when tab or month changes
  useEffect(() => {
    if (activeSubTab !== 'monthlyView') return
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

  const getEmployeeHeaderColor = (index) => {
    const colors = [
      { bg: 'bg-indigo-600', border: 'border-indigo-700' },
      { bg: 'bg-teal-600', border: 'border-teal-700' },
      { bg: 'bg-orange-600', border: 'border-orange-700' },
      { bg: 'bg-rose-600', border: 'border-rose-700' },
      { bg: 'bg-violet-600', border: 'border-violet-700' },
      { bg: 'bg-sky-600', border: 'border-sky-700' },
      { bg: 'bg-emerald-600', border: 'border-emerald-700' },
      { bg: 'bg-amber-600', border: 'border-amber-700' },
      { bg: 'bg-pink-600', border: 'border-pink-700' },
      { bg: 'bg-cyan-600', border: 'border-cyan-700' }
    ]
    return colors[index % colors.length]
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
    
    // Create a clone to modify for printing (removing sticky classes etc)
    const clone = printContent.cloneNode(true)
    // Remove sticky classes from headers and first column for clean print
    clone.querySelectorAll('.sticky').forEach(el => {
      el.classList.remove('sticky', 'left-0', 'top-0', 'z-10', 'z-20', 'z-30', 'z-40')
    })

    const printWindow = window.open('', '', 'width=1200,height=800')
    printWindow.document.write(`
      <html>
        <head>
          <title>Monthly Attendance - ${formatMonth(selectedMonth)}</title>
          <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap" rel="stylesheet">
          <script src="https://cdn.tailwindcss.com"></script>
          <style>
            body { font-family: 'Inter', sans-serif; padding: 20px; }
            table { border-collapse: collapse; width: 100%; font-size: 7px; table-layout: fixed; }
            th, td { 
              border: 1px solid #e5e7eb !important; 
              padding: 4px 2px !important; 
              text-align: center;
              word-wrap: break-word;
            }
            th { background-color: #f9fafb !important; font-weight: 900; text-transform: uppercase; }
            .bg-emerald-500 { background-color: #10b981 !important; color: white !important; }
            .bg-rose-500 { background-color: #f43f5e !important; color: white !important; }
            .bg-violet-500 { background-color: #8b5cf6 !important; color: white !important; }
            .bg-amber-400 { background-color: #fbbf24 !important; color: white !important; }
            @media print {
              @page { size: landscape; margin: 1cm; }
              body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
            }
          </style>
        </head>
        <body>
          <div style="margin-bottom: 20px; text-align: center;">
            <h1 style="font-size: 16px; font-weight: 900; text-transform: uppercase; letter-spacing: 1px;">Monthly Attendance Report</h1>
            <p style="font-size: 12px; color: #6b7280; font-weight: 700;">${formatMonth(selectedMonth)}</p>
          </div>
          ${clone.outerHTML}
        </body>
      </html>
    `)
    printWindow.document.close()
    
    // Wait for Tailwind and Fonts to load before printing
    printWindow.onload = () => {
      setTimeout(() => {
        printWindow.print()
        printWindow.close()
      }, 1000)
    }
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

      {/* Month Navigator - Compact */}
      <div className="bg-white p-3 rounded-lg border border-gray-200 shadow-sm flex items-center gap-4">
        <div className="flex items-center gap-2">
          <button 
            onClick={() => navigateMonth(-1)}
            className="p-1.5 hover:bg-gray-100 rounded-md transition-colors"
          >
            <ChevronLeft size={16} className="text-gray-600" />
          </button>
          
          <div className="flex items-center bg-gray-50 rounded-md px-3 py-1.5 border border-gray-200 min-w-[140px] justify-center gap-2">
            <Calendar size={14} className="text-gray-400" />
            <span className="text-[13px] font-inter font-semibold text-gray-700">{formatMonth(selectedMonth)}</span>
          </div>
          
          <button 
            onClick={() => navigateMonth(1)}
            className="p-1.5 hover:bg-gray-100 rounded-md transition-colors"
          >
            <ChevronRight size={16} className="text-gray-600" />
          </button>
        </div>

        <div className="h-6 w-px bg-gray-200"></div>

        <h3 className="text-sm font-inter font-semibold text-gray-800">
          {activeSubTab === 'summary' ? 'Monthly Performance' : 'Attendance Summary'}
        </h3>

        {activeSubTab === 'summary' && (
          <button onClick={exportCSV} className="ml-auto h-[32px] px-3 bg-indigo-600 text-white rounded-md text-[11px] font-inter font-medium flex items-center gap-1.5 hover:bg-indigo-700 transition-colors shadow-sm">
            <Download size={12} /> Export CSV
          </button>
        )}
      </div>

      {/* Summary View */}
      {activeSubTab === 'summary' && (
        <>
          {/* Stats Summary Grid */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {(() => {
              const filteredSummaryData = summaryData.filter(row => {
                const emp = employees.find(e => e.id === row.employeeId)
                return emp && !emp.hideInAttendance
              })
              return [
                { label: 'Avg. Attendance', value: `${Math.round(filteredSummaryData.reduce((acc, curr) => acc + (curr.present / (curr.present + curr.absent || 1)), 0) / (filteredSummaryData.length || 1) * 100)}%`, color: 'blue', icon: BarChart3 },
                { label: 'Total OT Logged', value: `${filteredSummaryData.reduce((acc, curr) => acc + curr.otHours, 0).toFixed(1)}h`, color: 'green', icon: Calendar },
                { label: 'Total Absences', value: filteredSummaryData.reduce((acc, curr) => acc + curr.absent, 0), color: 'red', icon: X }
              ].map(stat => (
                <div key={stat.label} className="bg-white p-4 border border-gray-200 shadow-sm">
                  <div className="flex items-center gap-2 mb-1">
                    <stat.icon size={16} className={`text-${stat.color}-600`} />
                    <p className="text-[11px] font-medium text-gray-500">{stat.label}</p>
                  </div>
                  <p className={`text-2xl font-semibold text-${stat.color}-600`}>{stat.value}</p>
                </div>
              ))
            })()}
          </div>

          {/* Detailed Report Table Card */}
          <div className="bg-white border border-gray-300 shadow-sm overflow-hidden font-inter">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-gray-100 border-b border-gray-300">
                    <th className="px-4 py-2 text-[11px] font-semibold text-gray-700 uppercase border-r border-gray-300">Employee</th>
                    <th className="px-4 py-2 text-[11px] font-semibold text-gray-700 uppercase text-center border-r border-gray-300">Present</th>
                    <th className="px-4 py-2 text-[11px] font-semibold text-gray-700 uppercase text-center border-r border-gray-300">Absent</th>
                    <th className="px-4 py-2 text-[11px] font-semibold text-gray-700 uppercase text-center border-r border-gray-300">OT Hours</th>
                    <th className="px-4 py-2 text-[11px] font-semibold text-gray-700 uppercase text-right">Performance</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {summaryLoading ? (
                    <tr><td colSpan={5} className="text-center py-12 bg-gray-50"><Spinner /></td></tr>
                  ) : summaryData.length === 0 ? (
                    <tr><td colSpan={5} className="text-center py-20 text-gray-400 text-sm italic">No activity data</td></tr>
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
                          <tr key={row.employeeId} className="hover:bg-gray-50 transition-colors">
                            <td className="px-4 py-3 border-r border-gray-200">
                              <div className="flex flex-col">
                                <span className="text-[13px] font-medium text-gray-800">{emp?.name || 'Deleted Account'}</span>
                                <span className="text-[10px] text-gray-500">{emp?.department || 'Operations'}</span>
                              </div>
                            </td>
                            <td className="px-4 py-3 text-center border-r border-gray-200">
                              <span className="bg-green-50 text-green-700 px-2 py-0.5 rounded text-[11px] font-medium">{row.present}D</span>
                            </td>
                            <td className="px-4 py-3 text-center border-r border-gray-200">
                              <span className="bg-red-50 text-red-700 px-2 py-0.5 rounded text-[11px] font-medium">{row.absent}D</span>
                            </td>
                            <td className="px-4 py-3 text-center border-r border-gray-200">
                              <span className="font-mono font-medium text-gray-700 text-[12px]">{row.otHours.toFixed(1)}h</span>
                            </td>
                            <td className="px-4 py-3 text-right">
                              <div className="flex flex-col items-end gap-1">
                                <div className="w-24 h-1.5 bg-gray-200 rounded-full overflow-hidden">
                                  <div className={`h-full rounded-full transition-all duration-1000 ${pct > 80 ? 'bg-green-500' : pct > 50 ? 'bg-yellow-500' : 'bg-red-500'}`} style={{ width: `${pct}%` }}></div>
                                </div>
                                <span className="text-[10px] text-gray-500">{pct}%</span>
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

      {/* Monthly View */}
      {activeSubTab === 'monthlyView' && (
        <>
          {/* Header with Controls */}
          <div className="p-4 border-b border-gray-200 bg-gray-50 rounded-xl">
            <div className="flex flex-col lg:flex-row gap-4 items-start lg:items-center justify-between">
              {/* Month/Year Selectors + Show Button */}
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-2">
                  <select 
                    value={selectedMonth.split('-')[1]}
                    onChange={(e) => {
                      const year = selectedMonth.split('-')[0]
                      setSelectedMonth(`${year}-${e.target.value}`)
                    }}
                    className="h-9 px-3 bg-white border border-gray-300 rounded-lg text-sm font-medium text-gray-700 focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none cursor-pointer"
                  >
                    {Array.from({ length: 12 }, (_, i) => {
                      const monthNum = String(i + 1).padStart(2, '0')
                      const monthName = new Date(2000, i, 1).toLocaleDateString('en-US', { month: 'long' })
                      return <option key={monthNum} value={monthNum}>{monthName}</option>
                    })}
                  </select>
                  <select
                    value={selectedMonth.split('-')[0]}
                    onChange={(e) => {
                      const month = selectedMonth.split('-')[1]
                      setSelectedMonth(`${e.target.value}-${month}`)
                    }}
                    className="h-9 px-3 bg-white border border-gray-300 rounded-lg text-sm font-medium text-gray-700 focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none cursor-pointer"
                  >
                    {Array.from({ length: 5 }, (_, i) => {
                      const year = new Date().getFullYear() - 2 + i
                      return <option key={year} value={year}>{year}</option>
                    })}
                  </select>
                  <button 
                    onClick={() => fetchPivotData()}
                    className="h-9 px-4 bg-gray-800 text-white rounded-lg text-sm font-medium flex items-center gap-1.5 hover:bg-gray-900 transition-colors"
                  >
                    <BarChart3 size={14} /> Show
                  </button>
                </div>
              </div>
              
              {/* Action Buttons */}
              <div className="flex items-center gap-2">
                <button 
                  onClick={() => setShowColumnSettings(true)}
                  className="h-9 px-3 flex items-center gap-1.5 bg-white border border-gray-300 hover:bg-gray-50 rounded-lg text-sm font-medium text-gray-700 transition-colors"
                >
                  <Filter size={14} /> Columns
                </button>
                <button 
                  onClick={() => setShowOrderModal(true)}
                  className="h-9 px-3 flex items-center gap-1.5 bg-white border border-gray-300 hover:bg-gray-50 rounded-lg text-sm font-medium text-gray-700 transition-colors"
                >
                  <GripVertical size={14} /> Order
                </button>
                <button 
                  onClick={exportPDF}
                  className="h-9 px-4 bg-indigo-600 text-white rounded-lg text-sm font-medium flex items-center gap-1.5 hover:bg-indigo-700 transition-colors shadow-sm"
                >
                  <Download size={14} /> Export PDF
                </button>
              </div>
            </div>
          </div>
          
          {pivotLoading ? (
            <div className="text-center py-20 bg-gray-50"><Spinner /></div>
          ) : (
            <div className="overflow-x-auto max-h-[calc(100vh-280px)] flex-1 overflow-y-auto bg-white">
              <table id="monthly-pivot-table" className="border-collapse text-sm font-inter" style={{ width: 'auto', minWidth: '100%' }}>
                <thead className="sticky top-0 z-30">
                  <tr>
                    <th className="px-3 py-3 text-center font-bold text-gray-700 border-r border-b border-gray-200 bg-gray-100 sticky left-0 z-40" rowSpan={2} style={{ minWidth: '60px' }}>
                      <div className="text-xs uppercase tracking-wider text-gray-500">Date</div>
                    </th>
                    {monthlyViewData.employees?.map((emp, idx) => {
                      let colSpan = 0;
                      if (columnSettings.inTime) colSpan++;
                      if (columnSettings.outTime) colSpan++;
                      if (columnSettings.ot) colSpan++;
                      if (columnSettings.remarks) colSpan++;
                      if (colSpan === 0) colSpan = 1;

                      const colorScheme = getEmployeeHeaderColor(idx);

                      return (
                        <th 
                          key={emp.id} 
                          className={`px-3 py-3 text-center font-bold text-white border-r border-b ${colorScheme.border} ${colorScheme.bg} text-sm whitespace-nowrap`}
                          colSpan={colSpan}
                          style={{ minWidth: `${Math.max(120, emp.name.length * 12 + 40)}px` }}
                        >
                          <div className="font-semibold tracking-wide">{emp.name}</div>
                        </th>
                      )
                    })}
                  </tr>
                  <tr className="bg-white">
                    {monthlyViewData.employees?.map((emp, idx) => (
                      <React.Fragment key={emp.id}>
                        {columnSettings.inTime && <th className="px-2 py-2 text-xs font-bold border-r border-b border-gray-200 text-center bg-white text-gray-600 uppercase tracking-wider">IN</th>}
                        {columnSettings.outTime && <th className="px-2 py-2 text-xs font-bold border-r border-b border-gray-200 text-center bg-white text-gray-600 uppercase tracking-wider">OUT</th>}
                        {columnSettings.ot && <th className="px-2 py-2 text-xs font-bold border-r border-b border-gray-200 text-center bg-white text-gray-600 uppercase tracking-wider">OT</th>}
                        {columnSettings.remarks && <th className="px-2 py-2 text-xs font-bold border-r border-b border-gray-200 text-center bg-white text-gray-600 uppercase tracking-wider" style={{ minWidth: '100px' }}>{remarksLabel}</th>}
                        {!columnSettings.inTime && !columnSettings.outTime && !columnSettings.ot && !columnSettings.remarks && <th className="px-2 py-2 border-r border-b border-gray-300 bg-white">-</th>}
                      </React.Fragment>
                    ))}
                  </tr>
                </thead>
                <tbody className="bg-white">
                  {Array.from({ length: monthlyViewData.daysInMonth || 31 }, (_, i) => i + 1).map(day => {
                    const [year, month] = selectedMonth.split('-').map(Number)
                    const currentDate = new Date(year, month - 1, day)
                    const dayOfWeek = currentDate.getDay()
                    const isWeekend = dayOfWeek === 0 || dayOfWeek === 6
                    const isSunday = dayOfWeek === 0
                    const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
                    const isHoliday = (monthlyViewData.holidays || []).some(h => h.date === dateStr)
                    const dayName = currentDate.toLocaleDateString('en-US', { weekday: 'short' })
                    
                    const dateClass = isSunday ? 'bg-red-50 text-red-700' : (isHoliday ? 'bg-amber-50 text-amber-700' : (isWeekend ? 'bg-violet-50 text-violet-700' : 'bg-gray-50 text-gray-900'))
                    
                    return (
                      <tr key={day} className="hover:bg-gray-50 transition-colors">
                        <td className={`px-3 py-2 text-center font-bold sticky left-0 z-20 border-r border-b border-gray-200 ${dateClass}`} style={{ minWidth: '60px' }}>
                          <div className="text-sm leading-none">{String(day).padStart(2, '0')}</div>
                          <div className="text-xs text-gray-500 mt-0.5 font-medium">{dayName}</div>
                        </td>
                        {monthlyViewData.employees?.map(emp => {
                          const [empYear, empMonth] = selectedMonth.split('-').map(Number)
                          const empStartDate = emp.joinedDate ? new Date(emp.joinedDate) : null
                          const isBeforeStart = empStartDate && new Date(empYear, empMonth - 1, day) < empStartDate
                          
                          const att = monthlyViewData.attendanceMap?.[emp.id]?.[day]
                          const status = isBeforeStart ? null : getStatusBadge(att, day, emp, monthlyViewData.holidays || [])
                          const isAbsentOrNonWorking = status?.type === 'absent' || status?.type === 'sunday' || status?.type === 'holiday'
                          
                          let colSpan = 0;
                          if (columnSettings.inTime) colSpan++;
                          if (columnSettings.outTime) colSpan++;
                          if (columnSettings.ot) colSpan++;
                          if (columnSettings.remarks) colSpan++;
                          if (colSpan === 0) colSpan = 1;

                          return (
                            <React.Fragment key={emp.id}>
                              {isAbsentOrNonWorking ? (
                                <td colSpan={colSpan} className={`px-2 py-2 text-center border-r border-b border-gray-200 ${isBeforeStart ? 'bg-gray-50' : status.bg} transition-colors`}>
                                  <span className={`text-sm font-semibold ${isBeforeStart ? 'text-gray-400' : status.color}`}>
                                    {isBeforeStart ? '—' : status.text}
                                  </span>
                                </td>
                              ) : (
                                <>
                                  {columnSettings.inTime && (
                                    <td className="px-2 py-2 text-center border-r border-b border-gray-200 text-sm text-gray-800 bg-white whitespace-nowrap">
                                      {isBeforeStart ? '—' : formatTimeTo12Hour(att?.inTime) || '—'}
                                    </td>
                                  )}
                                  {columnSettings.outTime && (
                                    <td className="px-2 py-2 text-center border-r border-b border-gray-200 text-sm text-gray-800 bg-white whitespace-nowrap">
                                      {(() => {
                                        if (isBeforeStart) return '—'
                                        const time = formatTimeTo12Hour(att?.outTime)
                                        if (!time) return '—'
                                        const isOvernight = att?.shiftType === 'Night' && att?.outDate && att?.inDate && att.outDate !== att.inDate
                                        if (isOvernight) {
                                          const outDate = new Date(att.outDate)
                                          const months = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC']
                                          const shortDate = `${months[outDate.getMonth()]} ${outDate.getDate()}`
                                          return (
                                            <div className="flex flex-col items-center leading-none">
                                              <span>{time}</span>
                                              <span className="text-xs text-red-500 font-semibold mt-0.5">
                                                → {shortDate}
                                              </span>
                                            </div>
                                          )
                                        }
                                        return <span>{time}</span>
                                      })()}
                                    </td>
                                  )}
                                  {columnSettings.ot && (
                                    <td className="px-2 py-2 text-center border-r border-b border-gray-200 text-sm font-semibold text-indigo-600 bg-white">
                                      {isBeforeStart ? '—' : formatOTHours(att?.otHours)}
                                    </td>
                                  )}
                                  {columnSettings.remarks && (
                                    <td className="px-2 py-2 text-center border-r border-b border-gray-200 text-xs font-normal text-gray-500 bg-white italic" style={{ minWidth: '100px' }}>
                                      {isBeforeStart ? '—' : (att?.remarks || '—')}
                                    </td>
                                  )}
                                  {!columnSettings.inTime && !columnSettings.outTime && !columnSettings.ot && !columnSettings.remarks && (
                                    <td className="px-2 py-2 text-center border-r border-b border-gray-200 bg-white">—</td>
                                  )}
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
        </>
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
