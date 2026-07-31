import React, { useState, useEffect, useMemo } from 'react'
import { useAuth } from '../../hooks/useAuth'
import { useAttendance } from '../../hooks/useAttendance'
import { useEmployees } from '../../hooks/useEmployees'
import { Search, ChevronLeft, ChevronRight, MapPin, Users, CalendarDays, Download } from 'lucide-react'
import Spinner from '../ui/Spinner'
import { jsPDF } from 'jspdf'
import autoTable from 'jspdf-autotable'

export default function SiteReportTab() {
  const { user } = useAuth()
  const { employees } = useEmployees(user?.orgId)
  const { fetchRange } = useAttendance(user?.orgId)
  
  const [loading, setLoading] = useState(false)
  const [dateRange, setDateRange] = useState(() => {
    const d = new Date()
    const y = d.getFullYear()
    const m = String(d.getMonth() + 1).padStart(2, '0')
    const daysInMonth = new Date(y, d.getMonth() + 1, 0).getDate()
    return {
      start: `${y}-${m}-01`,
      end: `${y}-${m}-${daysInMonth}`
    }
  })
  
  const [records, setRecords] = useState([])
  const [nameFilter, setNameFilter] = useState('')
  const [siteFilter, setSiteFilter] = useState('')
  const [selectedSite, setSelectedSite] = useState(null)

  const formatDate = (dateStr) => {
    if (!dateStr) return '';
    const d = new Date(dateStr);
    return d.toLocaleDateString('en-US', { day: '2-digit', month: 'short' });
  }

  const navigateMonth = (direction) => {
    if (!dateRange.start) return
    const d = new Date(dateRange.start)
    const newD = new Date(d.getFullYear(), d.getMonth() + direction, 1)
    const y = newD.getFullYear()
    const m = String(newD.getMonth() + 1).padStart(2, '0')
    const daysInMonth = new Date(y, newD.getMonth() + 1, 0).getDate()
    setDateRange({
      start: `${y}-${m}-01`,
      end: `${y}-${m}-${daysInMonth}`
    })
  }

  const formatMonthDisplay = () => {
    if (!dateRange.start) return ''
    const d = new Date(dateRange.start)
    return d.toLocaleDateString('en-US', { month: 'short', year: 'numeric' })
  }

  useEffect(() => {
    async function load() {
      if (!user?.orgId || !dateRange.start || !dateRange.end) return
      setLoading(true)
      try {
        const data = await fetchRange(dateRange.start, dateRange.end)
        setRecords(data || [])
      } catch (err) {
        console.error(err)
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [user?.orgId, dateRange.start, dateRange.end, fetchRange])

  const empMap = useMemo(() => {
    const map = {}
    employees.forEach(e => { map[e.id] = e })
    return map
  }, [employees])

  const pivotData = useMemo(() => {
    let filtered = records

    if (nameFilter) {
      filtered = filtered.filter(r => {
        const emp = empMap[r.employeeId]
        if (!emp) return false
        return emp.name.toLowerCase().includes(nameFilter.toLowerCase())
      })
    }

    if (siteFilter) {
      filtered = filtered.filter(r => {
        const site = r.remarks || 'Unassigned'
        return site.toLowerCase().includes(siteFilter.toLowerCase())
      })
    }

    const sites = {}
    filtered.forEach(r => {
      let finalSites = []
      
      if (r.isAbsent) {
        finalSites = ['Leave / Absent']
      } else if (r.sundayHoliday && !r.sundayWorked) {
        finalSites = ['Sunday / Holiday']
      } else {
        const rawRemarks = r.remarks?.trim() ? r.remarks : 'Unassigned'
        if (rawRemarks !== 'Unassigned') {
          const tokens = rawRemarks.split(/[,/&+]|\s+and\s+/i)
          const clean = tokens.map(t => t.trim()).filter(Boolean)
          if (clean.length > 0) {
            finalSites = clean
          } else {
            finalSites = ['Unassigned']
          }
        } else {
          finalSites = ['Unassigned']
        }
      }

      finalSites.forEach(site => {
        if (!sites[site]) {
          sites[site] = { 
            siteName: site, 
            uniqueDates: new Set(), 
            totalManpower: 0,
            daily: {}
          }
        }
        sites[site].uniqueDates.add(r.date)
        
        // Don't count manpower for Leaves or unworked Sundays
        if (site !== 'Leave / Absent' && site !== 'Sunday / Holiday') {
          sites[site].totalManpower += 1
        }
        
        if (!sites[site].daily[r.date]) {
          sites[site].daily[r.date] = []
        }
        const empName = empMap[r.employeeId]?.name || 'Unknown'
        sites[site].daily[r.date].push(empName)
      })
    })

    return Object.values(sites).map(s => {
      const dailyDetails = Object.keys(s.daily).sort().map(date => ({
        date,
        employees: s.daily[date],
        manpower: s.daily[date].length
      }))

      return {
        siteName: s.siteName,
        totalDays: s.uniqueDates.size,
        totalManpower: s.totalManpower,
        details: dailyDetails
      }
    }).sort((a, b) => {
      if (a.siteName === 'Leave / Absent') return 1
      if (b.siteName === 'Leave / Absent') return -1
      if (a.siteName === 'Sunday / Holiday') return 1
      if (b.siteName === 'Sunday / Holiday') return -1
      if (a.siteName === 'Unassigned') return 1
      if (b.siteName === 'Unassigned') return -1
      return a.siteName.localeCompare(b.siteName)
    })
  }, [records, nameFilter, siteFilter, empMap])

  useEffect(() => {
    if (pivotData.length > 0) {
      if (!selectedSite || !pivotData.find(s => s.siteName === selectedSite)) {
        setSelectedSite(pivotData[0].siteName)
      }
    } else {
      setSelectedSite(null)
    }
  }, [pivotData])

  const exportPDF = () => {
    try {
      if (pivotData.length === 0) {
        alert('No data to export.')
        return
      }

      const doc = new jsPDF('p', 'mm', 'a4')
      
      // Page dimensions: 210 x 297 mm
      // Title
      doc.setFont('helvetica', 'bold')
      doc.setFontSize(16)
      doc.setTextColor(24, 24, 27) // zinc-900
      doc.text(user?.orgName || 'HRFlow Site Report', 15, 20)
      
      // Period
      doc.setFont('helvetica', 'normal')
      doc.setFontSize(10)
      doc.setTextColor(113, 113, 122) // zinc-500
      const periodText = `Period: ${formatDate(dateRange.start)} to ${formatDate(dateRange.end)}`
      doc.text(periodText, 15, 26)
      
      // Generation Date
      const todayStr = new Date().toLocaleDateString('en-US', { day: '2-digit', month: 'short', year: 'numeric' })
      doc.text(`Generated: ${todayStr}`, 15, 32)
      
      // 1. Site Summary Table
      doc.setFont('helvetica', 'bold')
      doc.setFontSize(12)
      doc.setTextColor(24, 24, 27)
      doc.text('Site Summary', 15, 42)
      
      const summaryBody = pivotData.map((row, idx) => [
        idx + 1,
        row.siteName,
        row.totalDays,
        row.totalManpower
      ])
      
      // Add Grand Total row to summary table
      const totalDaysSum = pivotData.reduce((acc, curr) => acc + curr.totalDays, 0)
      const totalManpowerSum = pivotData.reduce((acc, curr) => acc + curr.totalManpower, 0)
      summaryBody.push([
        { content: 'Grand Total', colSpan: 2, styles: { fontStyle: 'bold', fillColor: [250, 250, 250] } },
        { content: totalDaysSum, styles: { fontStyle: 'bold', fillColor: [250, 250, 250] } },
        { content: totalManpowerSum, styles: { fontStyle: 'bold', fillColor: [250, 250, 250] } }
      ])
      
      autoTable(doc, {
        startY: 46,
        head: [['#', 'Site Name', 'Total Days', 'Total Manpower']],
        body: summaryBody,
        theme: 'grid',
        styles: { fontSize: 9, cellPadding: 3.5, textColor: [39, 39, 42], font: 'helvetica' },
        headStyles: { fillColor: [244, 244, 245], textColor: [24, 24, 27], fontStyle: 'bold' },
        columnStyles: {
          0: { cellWidth: 15, halign: 'center' },
          1: { cellWidth: 95 },
          2: { cellWidth: 35, halign: 'center' },
          3: { cellWidth: 35, halign: 'center' }
        }
      })
      
      let nextY = doc.lastAutoTable.finalY + 12
      
      // 2. Site Detailed Breakdowns
      pivotData.forEach((site) => {
        // If it exceeds the page limit, add a new page
        if (nextY > 230) {
          doc.addPage()
          nextY = 20
        }
        
        doc.setFont('helvetica', 'bold')
        doc.setFontSize(11)
        doc.setTextColor(24, 24, 27)
        doc.text(`${site.siteName} - Daily Breakdown`, 15, nextY)
        
        const detailsBody = site.details.map((d) => [
          formatDate(d.date),
          d.employees.join(', '),
          d.manpower
        ])
        
        autoTable(doc, {
          startY: nextY + 4,
          head: [['Date', 'Employee Names', 'Total Manpower']],
          body: detailsBody,
          theme: 'grid',
          styles: { fontSize: 8.5, cellPadding: 3, textColor: [63, 63, 70], font: 'helvetica' },
          headStyles: { fillColor: [250, 250, 250], textColor: [82, 82, 91], fontStyle: 'bold' },
          columnStyles: {
            0: { cellWidth: 30 },
            1: { cellWidth: 120 },
            2: { cellWidth: 30, halign: 'center' }
          }
        })
        
        nextY = doc.lastAutoTable.finalY + 10
      })
      
      // Add page numbers
      const pageCount = doc.internal.getNumberOfPages()
      for (let i = 1; i <= pageCount; i++) {
        doc.setPage(i)
        doc.setFont('helvetica', 'normal')
        doc.setFontSize(8)
        doc.setTextColor(161, 161, 170) // zinc-400
        doc.text(`Page ${i} of ${pageCount}`, 105, 287, { align: 'center' })
      }
      
      // Save PDF
      const filenameDate = new Date().toISOString().slice(0, 10)
      doc.save(`Site_Report_${filenameDate}.pdf`)
    } catch (err) {
      console.error('PDF Export Error:', err)
      alert(`Failed to generate PDF. Error: ${err.message || 'Unknown error'}`)
    }
  }

  return (
    <div className="flex flex-col h-full bg-slate-50">
      {/* Top Bar */}
      <div className="px-8 py-5 bg-white border-b border-zinc-200 flex flex-col md:flex-row items-start md:items-center justify-between gap-4 font-inter">
        <h1 className="text-[18px] font-semibold tracking-tight text-zinc-900">Site Report</h1>
        
        <div className="flex flex-wrap items-center gap-3">
          {/* Date Range & Month Navigator */}
          <div className="flex items-center gap-2">
            <div className="flex items-center bg-white rounded-md $11 shadow-sm h-8">
              <button onClick={() => navigateMonth(-1)} className="w-12 hover:bg-zinc-100 rounded transition-colors text-zinc-500 hover:text-zinc-900">
                <ChevronLeft size={14} />
              </button>
              <div className="w-28 text-center font-medium text-[13px] text-zinc-800 tabular-nums">
                {formatMonthDisplay()}
              </div>
              <button onClick={() => navigateMonth(1)} className="w-12 hover:bg-zinc-100 rounded transition-colors text-zinc-500 hover:text-zinc-900">
                <ChevronRight size={14} />
              </button>
            </div>
            <div className="flex items-center bg-white rounded-md px-2 py-1 shadow-sm h-8">
              <input 
                type="date" 
                value={dateRange.start} 
                onChange={(e) => setDateRange(prev => ({...prev, start: e.target.value}))}
                className="text-[12px] text-zinc-600 font-medium outline-none bg-transparent"
              />
              <span className="text-zinc-300 mx-2 text-[11px]">-</span>
              <input 
                type="date" 
                value={dateRange.end} 
                onChange={(e) => setDateRange(prev => ({...prev, end: e.target.value}))}
                className="text-[12px] text-zinc-600 font-medium outline-none bg-transparent"
              />
            </div>
          </div>
          
          {/* Filters */}
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" />
            <input
              type="text"
              placeholder="Filter site..."
              value={siteFilter}
              onChange={(e) => setSiteFilter(e.target.value)}
              className="pl-8 pr-3 py-1.5 w-44 bg-white border border-zinc-200 rounded-md text-[13px] focus:outline-none focus:ring-1 focus:ring-zinc-300 focus:border-zinc-300 transition font-medium text-zinc-800 placeholder:text-zinc-400 shadow-sm"
            />
          </div>
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" />
            <input
              type="text"
              placeholder="Filter employee..."
              value={nameFilter}
              onChange={(e) => setNameFilter(e.target.value)}
              className="pl-8 pr-3 py-1.5 w-44 bg-white border border-zinc-200 rounded-md text-[13px] focus:outline-none focus:ring-1 focus:ring-zinc-300 focus:border-zinc-300 transition font-medium text-zinc-800 placeholder:text-zinc-400 shadow-sm"
            />
          </div>
          <button 
            onClick={exportPDF}
            className="h-8 px-3.5 bg-zinc-900 hover:bg-zinc-800 text-white rounded-md text-[12px] font-medium tracking-tight flex items-center gap-1.5 transition-colors shadow-sm cursor-pointer"
          >
            <Download size={14} />
            Export PDF
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-auto p-8 bg-[#fbfbfa]">
        <div className="flex flex-col lg:flex-row gap-8 w-fit">
          {/* Main Site Table */}
          <div className="w-fit">
            <div className="bg-white rounded-[8px] shadow-[0_1px_2px_rgba(0,0,0,0.04)] border border-zinc-200/80 overflow-hidden font-inter">
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-zinc-200 text-zinc-500 text-[12px] font-medium bg-zinc-50/50">
                      <th className="px-5 py-2.5 w-16 text-center font-medium border-r border-zinc-200">#</th>
                      <th className="px-5 py-2.5 font-medium border-r border-zinc-200">Site name</th>
                      <th className="px-5 py-2.5 w-32 font-medium border-r border-zinc-200">Total days</th>
                      <th className="px-5 py-2.5 w-36 font-medium">Total manpower</th>
                    </tr>
                  </thead>
                <tbody className="divide-y divide-zinc-100">
                  {loading ? (
                    <tr>
                      <td colSpan={4} className="py-20 text-center"><Spinner /></td>
                    </tr>
                  ) : pivotData.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="py-16 text-center text-zinc-500 text-[13px] font-medium">No site records found for this period.</td>
                    </tr>
                  ) : (
                    pivotData.map((row, idx) => (
                      <tr 
                        key={idx} 
                        onClick={() => setSelectedSite(row.siteName)}
                        className={`transition-colors group cursor-pointer ${selectedSite === row.siteName ? 'bg-indigo-50/50 hover:bg-indigo-50/70' : 'hover:bg-zinc-50/50'}`}
                      >
                        <td className="px-5 py-2.5 text-center text-[13px] text-zinc-400 border-r border-zinc-200">{idx + 1}</td>
                        <td className="px-5 py-2.5 text-[13px] font-medium text-zinc-900 border-r border-zinc-200">{row.siteName}</td>
                        <td className="px-5 py-2.5 text-[13px] text-zinc-700 border-r border-zinc-200">{row.totalDays}</td>
                        <td className="px-5 py-2.5 text-[13px] text-zinc-700">{row.totalManpower}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
            {/* Footer Summary */}
            {!loading && pivotData.length > 0 && (
              <div className="bg-zinc-50/50 border-t border-zinc-200 px-5 py-3 flex items-center justify-between text-[13px]">
                <div className="font-medium text-zinc-500">Grand total</div>
                <div className="flex items-center gap-10 pr-2">
                  <div className="flex flex-col items-start">
                    <span className="text-zinc-500 text-[11px] mb-0.5">Total days</span>
                    <span className="font-medium text-zinc-900 text-[13px]">{pivotData.reduce((acc, curr) => acc + curr.totalDays, 0)}</span>
                  </div>
                  <div className="flex flex-col items-start">
                    <span className="text-zinc-500 text-[11px] mb-0.5">Total manpower</span>
                    <span className="font-medium text-zinc-900 text-[13px]">{pivotData.reduce((acc, curr) => acc + curr.totalManpower, 0)}</span>
                  </div>
                </div>
              </div>
            )}
          </div>
          </div>

          {/* Details Table */}
          {selectedSite && (
            <div className="w-fit min-w-[500px]">
              <div className="bg-white rounded-[8px] shadow-[0_1px_2px_rgba(0,0,0,0.04)] border border-zinc-200/80 overflow-hidden font-inter h-fit">
                <div className="bg-zinc-50/50 border-b border-zinc-200 px-5 py-3 flex items-center justify-between">
                  <h3 className="font-semibold text-[14px] text-zinc-900">{selectedSite} Details</h3>
                  <div className="text-[12px] text-zinc-500 font-medium">Daily Breakdown</div>
                </div>
                <div className="overflow-x-auto max-h-[600px] overflow-y-auto">
                  <table className="w-full text-left border-collapse">
                    <thead className="sticky top-0 bg-white shadow-[0_1px_0_rgba(228,228,231,1)] z-10">
                      <tr className="text-zinc-500 text-[12px] font-medium">
                        <th className="px-5 py-2.5 w-28 font-medium border-r border-zinc-200">Date</th>
                        <th className="px-5 py-2.5 font-medium border-r border-zinc-200">Employee names</th>
                        <th className="px-5 py-2.5 w-32 font-medium">Total manpower</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-100">
                      {pivotData.find(s => s.siteName === selectedSite)?.details.map((d, i) => (
                        <tr key={i} className="hover:bg-zinc-50/50 transition-colors group">
                          <td className="px-5 py-2.5 text-[13px] text-zinc-600 border-r border-zinc-200 align-top">{formatDate(d.date)}</td>
                          <td className="px-5 py-2.5 text-[13px] text-zinc-800 border-r border-zinc-200 leading-relaxed align-top">
                            {d.employees.join(', ')}
                          </td>
                          <td className="px-5 py-2.5 text-[13px] text-zinc-700 align-top">{d.manpower}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

        </div>
      </div>
    </div>
  )
}
