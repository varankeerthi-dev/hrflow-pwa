import React, { useState, useEffect, useMemo, useRef } from 'react'
import { useAuth } from '../../hooks/useAuth'
import { useEmployees } from '../../hooks/useEmployees'
import { useAttendance } from '../../hooks/useAttendance'
import Spinner from '../ui/Spinner'
import { BarChart3, FileSpreadsheet, Download, ChevronLeft, ChevronRight, Calendar, Filter, GripVertical, Save, X, ArrowRight, Table } from 'lucide-react'
import { getDocs, collection, query, where, setDoc, doc, getDoc, serverTimestamp } from 'firebase/firestore'
import { db } from '../../lib/firebase'
import { formatTimeTo12Hour } from '../../lib/salaryUtils'
import { isEmployeeActiveStatus } from '../../lib/employeeStatus'
import { useSidebar } from '../../contexts/SidebarContext'

function formatOTHours(otHours) {
  if (!otHours || otHours === '00:00') return '-'
  const [h, m] = otHours.split(':').map(Number)
  if (isNaN(h) || isNaN(m)) return '-'
  if (h === 0 && m === 0) return '-'
  if (m === 0) return `${h}h`
  return `${h}h ${m}m`
}

export default function SummaryTab({ defaultSubTab = 'summary' }) {
  const { user } = useAuth()
  const { employees } = useEmployees(user?.orgId)
  const { fetchMonthlySummary, loading: summaryLoading } = useAttendance(user?.orgId)
  const { isCollapsed, setIsCollapsed, setIsAutoCollapsed, isAutoCollapsed } = useSidebar()
  
  // Main tabs: 'summary' or 'monthlyView'
  const [activeMainTab, setActiveMainTab] = useState(defaultSubTab || 'summary')
  // Inner tabs for Summary: 'overview' or 'performance'
  const [summaryInnerTab, setSummaryInnerTab] = useState('overview')

  useEffect(() => {
    if (activeMainTab === 'monthlyView') {
      if (!isCollapsed) {
        setIsCollapsed(true)
        setIsAutoCollapsed(true)
      }
    } else {
      if (isAutoCollapsed) {
        setIsCollapsed(false)
        setIsAutoCollapsed(false)
      }
    }
  }, [activeMainTab, isCollapsed, setIsCollapsed, isAutoCollapsed, setIsAutoCollapsed])

  useEffect(() => {
    if (defaultSubTab) setActiveMainTab(defaultSubTab)
  }, [defaultSubTab])

  const [selectedMonth, setSelectedMonth] = useState(() => {
    const d = new Date()
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
  })
  const [summaryData, setSummaryData] = useState([])
  const [monthlyViewData, setMonthlyViewData] = useState({ employees: [], attendanceMap: {}, shiftMap: {}, daysInMonth: 31, holidays: [] })
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
      await setDoc(doc(db, 'organisations', user.orgId), { columnSettings, remarksLabel }, { merge: true })
      alert('Settings saved as default!')
      setShowColumnSettings(false)
    } catch (err) { alert('Failed to save settings') }
  }

  useEffect(() => {
    if (!user?.orgId || !selectedMonth) return
    fetchMonthlySummary(selectedMonth).then(setSummaryData)
  }, [user?.orgId, selectedMonth])

  const fetchPivotData = async () => {
    if (!user?.orgId || !selectedMonth) return
    setPivotLoading(true)
    try {
      const [empSnap, attSnap, shiftSnap, orgSnap] = await Promise.all([
        getDocs(collection(db, 'organisations', user.orgId, 'employees')),
        getDocs(query(collection(db, 'organisations', user.orgId, 'attendance'), where('date', '>=', selectedMonth + '-01'), where('date', '<=', selectedMonth + '-31'))),
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
          if (emp.joinedDate && new Date(emp.joinedDate) <= new Date(year, month - 1, daysInMonth)) return true
          if (attendanceMap[emp.id]) return Object.keys(attendanceMap[emp.id]).length > 0
          return false
        })
      const savedOrder = Array.isArray(orgData.employeeOrder) ? orgData.employeeOrder : []
      const orderedEmployees = [...filteredEmployees].sort((a, b) => {
        const idxA = savedOrder.indexOf(a.id), idxB = savedOrder.indexOf(b.id)
        if (idxA === -1 && idxB === -1) return 0
        return idxA === -1 ? 1 : (idxB === -1 ? -1 : idxA - idxB)
      })
      setDisplayOrder(orderedEmployees.map(e => e.id))
      setMonthlyViewData({ employees: orderedEmployees, attendanceMap, shiftMap, daysInMonth, holidays })
    } catch (err) { console.error(err) } finally { setPivotLoading(false) }
  }

  useEffect(() => {
    if (activeMainTab !== 'monthlyView') return
    fetchPivotData()
  }, [user?.orgId, selectedMonth, activeMainTab])

  const navigateMonth = (direction) => {
    const [year, month] = selectedMonth.split('-').map(Number)
    const newDate = new Date(year, month - 1 + direction, 1)
    setSelectedMonth(`${newDate.getFullYear()}-${String(newDate.getMonth() + 1).padStart(2, '0')}`)
  }

  const formatMonth = (m) => new Date(m.split('-')[0], parseInt(m.split('-')[1]) - 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })

  const getStatusBadge = (att, day, emp, holidays = []) => {
    const [y, m] = selectedMonth.split('-').map(Number), ds = `${y}-${String(m).padStart(2, '0')}-${String(day).padStart(2, '0')}`
    const isBeforeJoined = emp.joinedDate && ds < emp.joinedDate;
    const isAfterInactive = emp.inactiveFrom && ds > emp.inactiveFrom;
    
    if (isBeforeJoined || isAfterInactive) {
      return { bg: 'bg-red-50', text: 'Absent', color: 'text-red-600', type: 'absent' }
    }
    
    if (!att) return { bg: 'bg-gray-50', text: '-', color: 'text-gray-300', type: 'none' }
    const isSun = new Date(y, m - 1, day).getDay() === 0, isHol = holidays.some(h => h.date === ds)
    if (att.sundayWorked) return { bg: 'bg-amber-50', text: 'SW', color: 'text-amber-600', type: 'sunworked' }
    if (att.isAbsent || isHol || isSun) {
      let label = isHol ? 'Holiday' : (isSun ? 'Sunday' : 'Absent')
      return { bg: 'bg-red-50', text: label, color: 'text-red-600', type: isSun ? 'sunday' : (isHol ? 'holiday' : 'absent') }
    }
    return att.inTime ? { bg: 'bg-green-50', text: 'P', color: 'text-green-600', type: 'present' } : { bg: 'bg-gray-50', text: '-', color: 'text-gray-300', type: 'none' }
  }

  const getEmployeeHeaderColor = (idx) => {
    const colors = [{bg:'bg-indigo-600', border:'border-indigo-700'}, {bg:'bg-teal-600', border:'border-teal-700'}, {bg:'bg-orange-600', border:'border-orange-700'}, {bg:'bg-rose-600', border:'border-rose-700'}, {bg:'bg-violet-600', border:'border-violet-700'}, {bg:'bg-sky-600', border:'border-sky-700'}, {bg:'bg-emerald-600', border:'border-emerald-700'}, {bg:'bg-amber-600', border:'border-amber-700'}, {bg:'bg-pink-600', border:'border-pink-700'}, {bg:'bg-cyan-600', border:'border-cyan-700'}]
    return colors[idx % colors.length]
  }

  const exportPDF = () => {
    const printContent = document.getElementById('monthly-pivot-table')
    if (!printContent) return
    const clone = printContent.cloneNode(true)
    clone.querySelectorAll('.sticky').forEach(el => el.classList.remove('sticky', 'left-0', 'top-0', 'z-10', 'z-20', 'z-30', 'z-40'))
    const printWindow = window.open('', '', 'width=1200,height=800')
    printWindow.document.write(`
      <html>
        <head>
          <title>Monthly Attendance - ${formatMonth(selectedMonth)}</title>
          <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap" rel="stylesheet">
          <script src="https://cdn.tailwindcss.com"></script>
          <style>
            body { font-family: 'Inter', sans-serif; padding: 20px; }
            table { border-collapse: collapse; width: auto; font-size: 7px; table-layout: fixed; }
            th, td { border: 1px solid #e5e7eb !important; padding: 4px 2px !important; text-align: center; word-wrap: break-word; }
            th { font-weight: 900; text-transform: uppercase; color: #000 !important; }
            th div { color: #000 !important; }
            th:not([class*="bg-"]) { background-color: #f9fafb !important; }
            @media print { 
              @page { size: landscape; margin: 1cm; } 
              body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
              th { color: #000 !important; -webkit-print-color-adjust: exact; }
              th div { color: #000 !important; }
            }
          </style>
        </head>
        <body><div style="margin-bottom: 20px; text-align: center;"><h1 style="font-size: 16px; font-weight: 900; text-transform: uppercase;">Monthly Attendance Report</h1><p style="font-size: 12px; color: #6b7280; font-weight: 700;">${formatMonth(selectedMonth)}</p></div>${clone.outerHTML}</body>
      </html>
    `)
    printWindow.document.close(); printWindow.onload = () => { setTimeout(() => { printWindow.print(); printWindow.close(); }, 1000) }
  }

  const saveDisplayOrder = async () => {
    if (!user?.orgId) return
    try { await setDoc(doc(db, 'organisations', user.orgId), { employeeOrder: displayOrder }, { merge: true }); alert('Display order saved!'); setShowOrderModal(false); fetchPivotData() } catch (err) { alert('Failed to save order') }
  }

  const exportCSV = () => {
    const headers = ['Employee Name', 'Present Days', 'Absent Days', 'OT Hours', 'Attendance %']
    const rows = summaryData.map(row => {
      const emp = employees.find(e => e.id === row.employeeId)
      const total = row.present + row.absent, pct = total > 0 ? Math.round((row.present / total) * 100) : 0
      return [emp?.name || row.employeeId, row.present, row.absent, row.otHours.toFixed(2), `${pct}%`]
    })
    let csvContent = "data:text/csv;charset=utf-8," + headers.join(",") + "\n" + rows.map(e => e.join(",")).join("\n")
    const encodedUri = encodeURI(csvContent); const link = document.createElement("a"); link.setAttribute("href", encodedUri); link.setAttribute("download", `Summary_${selectedMonth}.csv`); document.body.appendChild(link); link.click()
  }

  const handleDragStart = (e, index) => { setDraggedItem(index); e.dataTransfer.effectAllowed = 'move' }
  const handleDragOver = (e, index) => { e.preventDefault(); if (draggedItem === null || draggedItem === index) return; const newList = [...displayOrder]; const item = newList.splice(draggedItem, 1)[0]; newList.splice(index, 0, item); setDisplayOrder(newList); setDraggedItem(index) }
  const handleDragEnd = () => { setDraggedItem(null) }

  return (
    <div className="space-y-4 font-inter text-slate-900">
      {/* Main Tabs Navigation */}
      <div className="flex gap-0 border-b border-gray-200">
        <button 
          onClick={() => setActiveMainTab('summary')} 
          className={`px-4 py-2.5 text-sm font-medium transition-all border-b-2 -mb-px ${activeMainTab === 'summary' ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-gray-400 hover:text-gray-600'}`}
        >
          Summary
        </button>
        <button 
          onClick={() => setActiveMainTab('monthlyView')} 
          className={`px-4 py-2.5 text-sm font-medium transition-all border-b-2 -mb-px ${activeMainTab === 'monthlyView' ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-gray-400 hover:text-gray-600'}`}
        >
          Full Summary
        </button>
      </div>

      {/* Control Bar: Month Selection & Actions */}
      <div className="bg-white px-3 h-[42px] rounded-lg border border-gray-200 shadow-sm flex items-center justify-between shrink-0">
        <div className="flex items-center gap-2">
          <button onClick={() => navigateMonth(-1)} className="p-1.5 hover:bg-gray-100 rounded-md transition-colors"><ChevronLeft size={16} className="text-gray-600" /></button>
          <div className="flex items-center bg-gray-50 rounded-md px-3 py-1 border border-gray-100 min-w-[140px] justify-center gap-2 h-7">
            <Calendar size={14} className="text-gray-400" />
            <span className="text-[12px] font-bold text-gray-700">{formatMonth(selectedMonth)}</span>
          </div>
          <button onClick={() => navigateMonth(1)} className="p-1.5 hover:bg-gray-100 rounded-md transition-colors"><ChevronRight size={16} className="text-gray-600" /></button>
          
          {activeMainTab === 'monthlyView' && (
            <div className="flex items-center gap-1.5 ml-4 pl-4 border-l border-gray-200">
              <select value={selectedMonth.split('-')[1]} onChange={(e) => setSelectedMonth(`${selectedMonth.split('-')[0]}-${e.target.value}`)} className="h-7 px-1.5 bg-white border border-gray-300 rounded text-[11px] font-bold text-gray-700 outline-none">
                {Array.from({ length: 12 }, (_, i) => { const m = String(i + 1).padStart(2, '0'); return <option key={m} value={m}>{new Date(2000, i, 1).toLocaleDateString('en-US', { month: 'short' })}</option> })}
              </select>
              <select value={selectedMonth.split('-')[0]} onChange={(e) => setSelectedMonth(`${e.target.value}-${selectedMonth.split('-')[1]}`)} className="h-7 px-1.5 bg-white border border-gray-300 rounded text-[11px] font-bold text-gray-700 outline-none">
                {Array.from({ length: 5 }, (_, i) => { const y = new Date().getFullYear() - 2 + i; return <option key={y} value={y}>{y}</option> })}
              </select>
            </div>
          )}
        </div>
        
        <div className="flex items-center gap-1.5">
          {activeMainTab === 'summary' && (
            <button onClick={exportCSV} className="h-7 px-3 bg-indigo-600 text-white rounded-md text-[11px] font-black uppercase tracking-wider flex items-center gap-2 hover:bg-indigo-700 transition-colors shadow-sm"><Download size={12} /> Export CSV</button>
          )}
          {activeMainTab === 'monthlyView' && (
            <>
              <button onClick={() => setShowColumnSettings(true)} className="h-7 px-2.5 flex items-center gap-1.5 bg-white border border-gray-300 hover:bg-gray-50 rounded text-[10px] font-bold text-gray-700 uppercase"><Filter size={12} /> Columns</button>
              <button onClick={() => setShowOrderModal(true)} className="h-7 px-2.5 flex items-center gap-1.5 bg-white border border-gray-300 hover:bg-gray-50 rounded text-[10px] font-bold text-gray-700 uppercase"><GripVertical size={12} /> Order</button>
              <button onClick={exportPDF} className="h-7 px-3 bg-indigo-600 text-white rounded-md text-[11px] font-black uppercase tracking-wider flex items-center gap-1.5 hover:bg-indigo-700 transition-colors shadow-sm"><Download size={12} /> Export PDF</button>
            </>
          )}
        </div>
      </div>

      {activeMainTab === 'summary' && (
        <div className="space-y-4">
          {/* Inner Sub-Tabs for Summary Tab */}
          <div className="flex gap-2 p-1 bg-gray-100 rounded-xl w-fit">
            <button 
              onClick={() => setSummaryInnerTab('overview')} 
              className={`flex items-center gap-2 px-6 py-1.5 rounded-lg text-[11px] font-black uppercase tracking-widest transition-all ${summaryInnerTab === 'overview' ? 'bg-white text-indigo-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
            >
              <BarChart3 size={14} /> Overview
            </button>
            <button 
              onClick={() => setSummaryInnerTab('performance')} 
              className={`flex items-center gap-2 px-6 py-1.5 rounded-lg text-[11px] font-black uppercase tracking-widest transition-all ${summaryInnerTab === 'performance' ? 'bg-white text-indigo-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
            >
              <Table size={14} /> Performance
            </button>
          </div>

          <div className="animate-in fade-in duration-500">
            {summaryInnerTab === 'overview' ? (
              <div className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {(() => {
                    const filtered = summaryData.filter(row => employees.find(e => e.id === row.employeeId && !e.hideInAttendance))
                    return [
                      { label: 'Avg. Attendance', value: `${Math.round(filtered.reduce((acc, curr) => acc + (curr.present / (curr.present + curr.absent || 1)), 0) / (filtered.length || 1) * 100)}%`, color: 'blue', icon: BarChart3 },
                      { label: 'Total OT Logged', value: `${filtered.reduce((acc, curr) => acc + curr.otHours, 0).toFixed(1)}h`, color: 'green', icon: Calendar },
                      { label: 'Total Absences', value: filtered.reduce((acc, curr) => acc + curr.absent, 0), color: 'red', icon: X }
                    ].map(stat => (
                      <div key={stat.label} className="bg-white p-6 border border-gray-200 shadow-sm rounded-xl">
                        <div className="flex items-center gap-3 mb-2"><stat.icon size={20} className={`text-${stat.color}-600`} /><p className="text-[12px] font-bold text-gray-500 uppercase tracking-widest">{stat.label}</p></div>
                        <p className={`text-3xl font-black text-${stat.color}-600 tracking-tight`}>{stat.value}</p>
                      </div>
                    ))
                  })()}
                </div>

                {/* Performance Table in Overview */}
                <div className="space-y-3">
                  <h3 className="text-[11px] font-black text-gray-400 uppercase tracking-[0.2em] px-1">Performance Summary</h3>
                  <div className="bg-white border border-gray-300 shadow-sm overflow-hidden rounded-xl">
                    <div className="overflow-x-auto">
                      <table className="w-full text-left border-collapse">
                        <thead>
                          <tr className="bg-gray-100 border-b border-gray-300">
                            <th className="px-4 py-2 text-[10px] font-black text-gray-700 uppercase border-r border-gray-300">Employee</th>
                            <th className="px-4 py-2 text-[10px] font-black text-gray-700 uppercase text-center border-r border-gray-300">Present</th>
                            <th className="px-4 py-2 text-[10px] font-black text-gray-700 uppercase text-center border-r border-gray-300">Absent</th>
                            <th className="px-4 py-2 text-[10px] font-black text-gray-700 uppercase text-center border-r border-gray-300">Hw</th>
                            <th className="px-4 py-2 text-[10px] font-black text-gray-700 uppercase text-center border-r border-gray-300">OT Hours</th>
                            <th className="px-4 py-2 text-[10px] font-black text-gray-700 uppercase text-right">Performance</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-200">
                          {summaryLoading ? (<tr><td colSpan={6} className="text-center py-12 bg-gray-50"><Spinner /></td></tr>) : summaryData.length === 0 ? (<tr><td colSpan={6} className="text-center py-20 text-gray-400 text-sm italic">No activity data</td></tr>) : (
                            summaryData.filter(row => employees.find(e => e.id === row.employeeId && !e.hideInAttendance)).map(row => {
                              const emp = employees.find(e => e.id === row.employeeId)
                              const total = row.present + row.absent, pct = total > 0 ? Math.round((row.present / total) * 100) : 0
                              return (
                                <tr key={row.employeeId} className="hover:bg-gray-50 transition-colors h-[36px]">
                                  <td className="px-4 py-1 border-r border-gray-200"><div className="flex flex-col"><span className="text-[12px] font-bold text-gray-800 leading-none">{emp?.name || 'Deleted'}</span><span className="text-[8px] text-gray-400 font-bold uppercase mt-0.5">{emp?.department || 'Operations'}</span></div></td>
                                  <td className="px-4 py-1 text-center border-r border-gray-200"><span className="bg-green-50 text-green-700 px-2 py-0.5 rounded text-[10px] font-black">{row.present}D</span></td>
                                  <td className="px-4 py-1 text-center border-r border-gray-200"><span className="bg-red-50 text-red-700 px-2 py-0.5 rounded text-[10px] font-black">{row.absent}D</span></td>
                                  <td className="px-4 py-1 text-center border-r border-gray-200"><span className="bg-indigo-50 text-indigo-700 px-2 py-0.5 rounded text-[10px] font-black">{row.holidayWorked || 0}D</span></td>
                                  <td className="px-4 py-1 text-center border-r border-gray-200 font-inter font-normal text-[11px] text-gray-700">
                                    {Number(row.otHours || 0).toFixed(2)}
                                    {row.otAdjustment !== 0 && (
                                      <span className="text-green-600 ml-1 font-bold">({(Number(row.otHours || 0) + Number(row.otAdjustment || 0)).toFixed(2)})</span>
                                    )}
                                  </td>
                                  <td className="px-4 py-1 text-right"><div className="flex flex-col items-end gap-1"><div className="w-24 h-1.5 bg-gray-100 rounded-full overflow-hidden border border-gray-200/50"><div className={`h-full rounded-full transition-all duration-1000 ${pct > 80 ? 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.3)]' : pct > 50 ? 'bg-amber-500' : 'bg-rose-500'}`} style={{ width: `${pct}%` }}></div></div><span className="text-[10px] font-black text-gray-400">{pct}%</span></div></td>
                                </tr>
                              )
                            })
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                <h3 className="text-[11px] font-black text-gray-400 uppercase tracking-[0.2em] px-1">Individual Employee Performance</h3>
                <div className="bg-white border border-gray-300 shadow-sm overflow-hidden rounded-xl">
                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="bg-gray-100 border-b border-gray-300">
                          <th className="px-4 py-2 text-[10px] font-black text-gray-700 uppercase border-r border-gray-300">Employee</th>
                          <th className="px-4 py-2 text-[10px] font-black text-gray-700 uppercase text-center border-r border-gray-300">Present</th>
                          <th className="px-4 py-2 text-[10px] font-black text-gray-700 uppercase text-center border-r border-gray-300">Absent</th>
                          <th className="px-4 py-2 text-[10px] font-black text-gray-700 uppercase text-center border-r border-gray-300">Hw</th>
                          <th className="px-4 py-2 text-[10px] font-black text-gray-700 uppercase text-center border-r border-gray-300">OT Hours</th>
                          <th className="px-4 py-2 text-[10px] font-black text-gray-700 uppercase text-right">Performance</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-200">
                        {summaryLoading ? (<tr><td colSpan={6} className="text-center py-12 bg-gray-50"><Spinner /></td></tr>) : summaryData.length === 0 ? (<tr><td colSpan={6} className="text-center py-20 text-gray-400 text-sm italic">No activity data</td></tr>) : (
                          summaryData.filter(row => employees.find(e => e.id === row.employeeId && !e.hideInAttendance)).map(row => {
                            const emp = employees.find(e => e.id === row.employeeId)
                            const total = row.present + row.absent, pct = total > 0 ? Math.round((row.present / total) * 100) : 0
                            return (
                              <tr key={row.employeeId} className="hover:bg-gray-50 transition-colors h-[36px]">
                                <td className="px-4 py-1 border-r border-gray-200"><div className="flex flex-col"><span className="text-[12px] font-bold text-gray-800 leading-none">{emp?.name || 'Deleted'}</span><span className="text-[8px] text-gray-400 font-bold uppercase mt-0.5">{emp?.department || 'Operations'}</span></div></td>
                                <td className="px-4 py-1 text-center border-r border-gray-200"><span className="bg-green-50 text-green-700 px-2 py-0.5 rounded text-[10px] font-black">{row.present}D</span></td>
                                <td className="px-4 py-1 text-center border-r border-gray-200"><span className="bg-red-50 text-red-700 px-2 py-0.5 rounded text-[10px] font-black">{row.absent}D</span></td>
                                <td className="px-4 py-1 text-center border-r border-gray-200"><span className="bg-indigo-50 text-indigo-700 px-2 py-0.5 rounded text-[10px] font-black">{row.holidayWorked || 0}D</span></td>
                                <td className="px-4 py-1 text-center border-r border-gray-200 font-inter font-normal text-[11px] text-gray-700">
                                  {Number(row.otHours || 0).toFixed(2)}
                                  {row.otAdjustment !== 0 && (
                                    <span className="text-green-600 ml-1 font-bold">({(Number(row.otHours || 0) + Number(row.otAdjustment || 0)).toFixed(2)})</span>
                                  )}
                                </td>
                                <td className="px-4 py-1 text-right"><div className="flex flex-col items-end gap-1"><div className="w-24 h-1.5 bg-gray-100 rounded-full overflow-hidden border border-gray-200/50"><div className={`h-full rounded-full transition-all duration-1000 ${pct > 80 ? 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.3)]' : pct > 50 ? 'bg-amber-500' : 'bg-rose-500'}`} style={{ width: `${pct}%` }}></div></div><span className="text-[10px] font-black text-gray-400">{pct}%</span></div></td>
                              </tr>
                            )
                          })
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {activeMainTab === 'monthlyView' && (
        <div className="space-y-3 animate-in fade-in duration-500">
          <h3 className="text-[11px] font-black text-gray-400 uppercase tracking-[0.2em] px-1">Detailed Daily Attendance Grid</h3>
          {pivotLoading ? (<div className="text-center py-20 bg-gray-50 rounded-xl border border-gray-200 shadow-sm"><Spinner /></div>) : (
            <div className="overflow-x-auto max-h-[calc(100vh-210px)] overflow-y-auto bg-white border border-gray-300 rounded-xl shadow-sm">
              {(() => {
                const colW = { inTime: 56, outTime: 56, ot: 40, remarks: 52 }, gapW = 8
                let blockW = 0
                if (columnSettings.inTime) blockW += colW.inTime
                if (columnSettings.outTime) blockW += colW.outTime
                if (columnSettings.ot) blockW += colW.ot
                if (columnSettings.remarks) blockW += colW.remarks
                if (blockW === 0) blockW = 56
                const totalTableW = 65 + (monthlyViewData.employees?.length || 0) * (blockW + gapW)
                return (
                  <table id="monthly-pivot-table" className="border-collapse text-sm font-inter table-fixed" style={{ width: `${totalTableW}px`, minWidth: `${totalTableW}px` }}>
                    <colgroup>
                      <col style={{ width: '65px' }} />
                      {monthlyViewData.employees?.map(emp => (
                        <React.Fragment key={emp.id}>
                          {columnSettings.inTime && <col style={{ width: '56px' }} />}
                          {columnSettings.outTime && <col style={{ width: '56px' }} />}
                          {columnSettings.ot && <col style={{ width: '40px' }} />}
                          {columnSettings.remarks && <col style={{ width: '52px' }} />}
                          {!columnSettings.inTime && !columnSettings.outTime && !columnSettings.ot && !columnSettings.remarks && <col style={{ width: '56px' }} />}
                        </React.Fragment>
                      ))}
                    </colgroup>
                    <thead className="sticky top-0 z-30">
                      <tr>
                        <th className="px-2 py-1 text-center font-bold text-gray-700 border-r border-b border-gray-200 bg-gray-100 sticky left-0 z-40" rowSpan={2}><div className="text-[9px] uppercase tracking-wider text-gray-500">Date</div></th>
                        {monthlyViewData.employees?.map((emp, idx) => {
                          const cs = getEmployeeHeaderColor(idx), visibleCount = (Number(!!columnSettings.inTime) + Number(!!columnSettings.outTime) + Number(!!columnSettings.ot) + Number(!!columnSettings.remarks)) || 1
                          return (<th key={emp.id} className={`px-1 py-1 text-center font-black text-white border-r-[8px] border-white border-b ${cs.border} ${cs.bg} text-[10px]`} colSpan={visibleCount}><div className="truncate uppercase leading-none">{emp.name}</div></th>)
                        })}
                      </tr>
                      <tr className="bg-white">
                        {monthlyViewData.employees?.map(emp => {
                          const lastCol = columnSettings.remarks ? 'remarks' : (columnSettings.ot ? 'ot' : (columnSettings.outTime ? 'outTime' : 'inTime'))
                          return (
                            <React.Fragment key={emp.id}>
                              {columnSettings.inTime && <th className={`px-0 py-1 text-[8px] font-black border-b border-gray-200 text-center bg-white text-gray-400 uppercase ${lastCol === 'inTime' ? 'border-r-[8px] border-white' : 'border-r border-gray-200'}`}>IN</th>}
                              {columnSettings.outTime && <th className={`px-0 py-1 text-[8px] font-black border-b border-gray-200 text-center bg-white text-gray-400 uppercase ${lastCol === 'outTime' ? 'border-r-[8px] border-white' : 'border-r border-gray-200'}`}>OUT</th>}
                              {columnSettings.ot && <th className={`px-0 py-1 text-[8px] font-black border-b border-gray-200 text-center bg-white text-gray-400 uppercase ${lastCol === 'ot' ? 'border-r-[8px] border-white' : 'border-r border-gray-200'}`}>OT</th>}
                              {columnSettings.remarks && <th className={`px-0 py-1 text-[8px] font-black border-b border-gray-200 text-center bg-white text-gray-400 uppercase truncate border-r-[8px] border-white`} title={remarksLabel}>{remarksLabel.substring(0,3)}</th>}
                              {!columnSettings.inTime && !columnSettings.outTime && !columnSettings.ot && !columnSettings.remarks && <th className="px-0 py-1 border-r-[8px] border-white border-b border-gray-300 bg-white">-</th>}
                            </React.Fragment>
                          )
                        })}
                      </tr>
                    </thead>
                    <tbody className="bg-white">
                      {Array.from({ length: monthlyViewData.daysInMonth || 31 }, (_, i) => i + 1).map(day => {
                        const [y, m] = selectedMonth.split('-').map(Number), cD = new Date(y, m - 1, day), ds = `${y}-${String(m).padStart(2, '0')}-${String(day).padStart(2, '0')}`
                        const isSunday = cD.getDay() === 0, isHoliday = (monthlyViewData.holidays || []).some(h => h.date === ds)
                        const dateCls = isSunday ? 'bg-red-50 text-red-700' : (isHoliday ? 'bg-amber-50 text-amber-700' : 'bg-gray-50 text-gray-900')
                        return (
                          <tr key={day} className="hover:bg-gray-50 transition-colors h-[32px]">
                            <td className={`px-2 py-0.5 text-center font-bold sticky left-0 z-20 border-r border-b border-gray-200 ${dateCls}`}><div className="flex items-baseline justify-center gap-1"><span className="text-[11px]">{String(day).padStart(2, '0')}</span><span className="text-[8px] text-gray-400 uppercase">{cD.toLocaleDateString('en-US', { weekday: 'short' })}</span></div></td>
                            {monthlyViewData.employees?.map(emp => {
                              const joinD = emp.joinedDate ? new Date(emp.joinedDate) : null, isBeforeStart = joinD && cD < joinD, att = monthlyViewData.attendanceMap?.[emp.id]?.[day], st = isBeforeStart ? null : getStatusBadge(att, day, emp, monthlyViewData.holidays || []), isOff = st?.type === 'absent' || st?.type === 'sunday' || st?.type === 'holiday'
                              const lastCol = columnSettings.remarks ? 'remarks' : (columnSettings.ot ? 'ot' : (columnSettings.outTime ? 'outTime' : 'inTime'))
                              return (
                                <React.Fragment key={emp.id}>
                                  {isOff ? (<td colSpan={columnSettings.inTime || columnSettings.outTime || columnSettings.ot || columnSettings.remarks ? (Number(!!columnSettings.inTime) + Number(!!columnSettings.outTime) + Number(!!columnSettings.ot) + Number(!!columnSettings.remarks)) : 1} className={`px-1 py-0.5 text-center border-b border-gray-200 border-r-[8px] border-white ${isBeforeStart ? 'bg-gray-50' : st.bg}`}><span className={`text-[9px] font-black uppercase ${isBeforeStart ? 'text-gray-400' : st.text === 'Holiday' ? 'text-amber-600' : st.color}`}>{isBeforeStart ? '—' : st.text}</span></td>) : (
                                    <>
                                      {columnSettings.inTime && <td className={`px-0 py-0.5 text-center border-b border-gray-200 text-[10px] font-bold text-gray-700 bg-white ${lastCol === 'inTime' ? 'border-r-[8px] border-white' : 'border-r border-gray-200'}`}>{formatTimeTo12Hour(att?.inTime) || '—'}</td>}
                                      {columnSettings.outTime && <td className={`px-0 py-0.5 text-center border-b border-gray-200 text-[10px] font-bold text-gray-700 bg-white ${lastCol === 'outTime' ? 'border-r-[8px] border-white' : 'border-r border-gray-200'}`}>{formatTimeTo12Hour(att?.outTime) || '—'}</td>}
                                      {columnSettings.ot && <td className={`px-0 py-0.5 text-center border-b border-gray-200 text-[9px] font-black text-indigo-600 bg-white whitespace-nowrap overflow-hidden ${lastCol === 'ot' ? 'border-r-[8px] border-white' : 'border-r border-gray-200'}`}>{formatOTHours(att?.otHours)}</td>}
                                      {columnSettings.remarks && <td className={`px-1 py-0.5 text-center border-b border-gray-200 text-[9px] font-bold text-gray-600 bg-white truncate border-r-[8px] border-white`} title={att?.remarks}>{att?.remarks || '—'}</td>}
                                      {!columnSettings.inTime && !columnSettings.outTime && !columnSettings.ot && !columnSettings.remarks && <td className="px-0 py-0.5 text-center border-b border-gray-200 bg-white text-[9px] border-r-[8px] border-white">—</td>}
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
                )
              })()}
            </div>
          )}
        </div>
      )}

      {showColumnSettings && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-sm mx-4 flex flex-col">
            <div className="flex items-center justify-between p-4 border-b border-gray-100"><h3 className="text-sm font-bold text-gray-800">Column Settings</h3><button onClick={() => setShowColumnSettings(false)} className="p-1 hover:bg-gray-100 rounded-lg"><X size={18} className="text-gray-500" /></button></div>
            <div className="p-6 space-y-6">
              <div className="space-y-3"><p className="text-[11px] font-black text-gray-400 uppercase tracking-widest">Visible Columns</p>
                <div className="grid grid-cols-1 gap-2">{[{ id: 'inTime', label: 'In Time' }, { id: 'outTime', label: 'Out Time' }, { id: 'ot', label: 'OT Hours' }, { id: 'remarks', label: 'Remarks / Extra Info' }].map(col => (<label key={col.id} className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg border border-gray-200 cursor-pointer hover:bg-gray-100"><input type="checkbox" checked={columnSettings[col.id]} onChange={e => setColumnSettings(prev => ({ ...prev, [col.id]: e.target.checked }))} className="w-4 h-4 text-indigo-600 rounded" /><span className="text-[13px] font-medium text-gray-700">{col.label}</span></label>))}</div>
              </div>
              <div className="space-y-3"><p className="text-[11px] font-black text-gray-400 uppercase tracking-widest">Custom Label for Remarks</p><input type="text" value={remarksLabel} onChange={e => setRemarksLabel(e.target.value)} placeholder="e.g. Site Name, Comments..." className="w-full h-10 border border-gray-200 rounded-lg px-3 text-sm font-medium focus:ring-2 focus:ring-indigo-500 outline-none" /></div>
            </div>
            <div className="p-4 border-t border-gray-100 flex gap-2"><button onClick={() => setShowColumnSettings(false)} className="flex-1 h-10 bg-gray-100 text-gray-600 rounded-lg text-[12px] font-medium">Cancel</button><button onClick={saveColumnSettings} className="flex-1 h-10 bg-indigo-600 text-white rounded-lg text-[12px] font-medium flex items-center justify-center gap-2 shadow-md"><Save size={14} /> Save Default</button></div>
          </div>
        </div>
      )}

      {showOrderModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-md mx-4 max-h-[80vh] flex flex-col">
            <div className="flex items-center justify-between p-4 border-b border-gray-100"><h3 className="text-sm font-bold text-gray-800">Display Order</h3><button onClick={() => setShowOrderModal(false)} className="p-1 hover:bg-gray-100 rounded-lg"><X size={18} className="text-gray-500" /></button></div>
            <div className="flex-1 overflow-auto p-4"><p className="text-[11px] text-gray-500 mb-3 uppercase font-black tracking-widest">Drag to reorder employees</p>
              <div className="space-y-2">{displayOrder.map((empId, index) => { const emp = monthlyViewData.employees?.find(e => e.id === empId); if (!emp) return null; return (<div key={empId} draggable onDragStart={(e) => handleDragStart(e, index)} onDragOver={(e) => handleDragOver(e, index)} onDragEnd={handleDragEnd} className={`flex items-center gap-3 p-3 bg-gray-50 rounded-lg border border-gray-200 cursor-move hover:bg-gray-100 ${draggedItem === index ? 'opacity-50' : ''}`}><GripVertical size={16} className="text-gray-400" /><span className="text-[12px] font-medium text-gray-700">{emp.name}</span></div>) })}</div>
            </div>
            <div className="p-4 border-t border-gray-100 flex gap-2"><button onClick={() => setShowOrderModal(false)} className="flex-1 h-10 bg-gray-100 text-gray-600 rounded-lg text-[12px] font-medium">Cancel</button><button onClick={saveDisplayOrder} className="flex-1 h-10 bg-indigo-600 text-white rounded-lg text-[12px] font-medium flex items-center justify-center gap-2"><Save size={14} /> Save Default</button></div>
          </div>
        </div>
      )}
    </div>
  )
}
