import React, { useState, useEffect, useMemo } from 'react'
import { useAuth } from '../../hooks/useAuth'
import { useAttendance } from '../../hooks/useAttendance'
import { useEmployees } from '../../hooks/useEmployees'
import { db } from '../../lib/firebase'
import { collection, query, orderBy, onSnapshot, getDocs } from 'firebase/firestore'
import { 
  Search, 
  ChevronLeft, 
  ChevronRight, 
  MapPin, 
  Users, 
  CalendarDays, 
  Download, 
  Fuel, 
  Car, 
  Coins, 
  FileSpreadsheet, 
  CheckCircle2, 
  Building2 
} from 'lucide-react'
import Spinner from '../ui/Spinner'
import { jsPDF } from 'jspdf'
import autoTable from 'jspdf-autotable'

function isPetrolCategory(category) {
  const clean = String(category || '').trim().toLowerCase()
  return clean.includes('petrol') || clean.includes('sitepetrol') || clean.includes('fuel') || clean.includes('diesel')
}

export default function SiteReportTab() {
  const { user } = useAuth()
  const { employees } = useEmployees(user?.orgId)
  const { fetchRange } = useAttendance(user?.orgId)
  
  // Sub-tabs: 'site-report' | 'sitepetrol'
  const [activeSubTab, setActiveSubTab] = useState('site-report')

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

  // SitePetrol State
  const [petrolExpenses, setPetrolExpenses] = useState([])
  const [petrolLoading, setPetrolLoading] = useState(false)
  const [petrolSiteFilter, setPetrolSiteFilter] = useState('')
  const [petrolVehicleFilter, setPetrolVehicleFilter] = useState('')
  const [petrolEmployeeFilter, setPetrolEmployeeFilter] = useState('')
  const [petrolViewMode, setPetrolViewMode] = useState('by_site') // 'by_site' | 'by_vehicle' | 'transactions'
  const [selectedPetrolSite, setSelectedPetrolSite] = useState(null)
  const [selectedPetrolVehicle, setSelectedPetrolVehicle] = useState(null)
  const [petrolScope, setPetrolScope] = useState('petrol_only') // 'petrol_only' | 'all_site_expenses'

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

  // Fetch Advances/Expenses for SitePetrol Report
  useEffect(() => {
    if (!user?.orgId) return
    setPetrolLoading(true)

    const q = query(
      collection(db, 'organisations', user.orgId, 'advances_expenses'),
      orderBy('date', 'desc')
    )

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const data = snapshot.docs.map(d => ({ id: d.id, ...d.data() }))
        setPetrolExpenses(data)
        setPetrolLoading(false)
      },
      (err) => {
        console.warn('orderBy date failed, falling back to client sort:', err)
        getDocs(collection(db, 'organisations', user.orgId, 'advances_expenses'))
          .then(snap => {
            const docs = snap.docs.map(d => ({ id: d.id, ...d.data() }))
            docs.sort((a, b) => (b.date || '').localeCompare(a.date || ''))
            setPetrolExpenses(docs)
          })
          .catch(e => console.error('Fallback fetch error:', e))
          .finally(() => setPetrolLoading(false))
      }
    )

    return () => unsubscribe()
  }, [user?.orgId])

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

  // ----------------------------------------------------
  // SITEPETROL FILTERING & CALCULATIONS
  // ----------------------------------------------------
  const filteredPetrolLogs = useMemo(() => {
    return petrolExpenses.filter(e => {
      // Must be an Expense (not Advance)
      if (e.type === 'Advance') return false

      // Check date bounds
      if (dateRange.start && e.date < dateRange.start) return false
      if (dateRange.end && e.date > dateRange.end) return false

      // Category Scope check
      const cat = String(e.category || '').toLowerCase()
      const reason = String(e.reason || '').toLowerCase()
      const isPetrol = isPetrolCategory(cat) || isPetrolCategory(reason) || cat === 'sitepetrol'

      if (petrolScope === 'petrol_only') {
        if (!isPetrol) return false
      } else {
        // 'all_site_expenses' requires siteName or petrol
        if (!e.siteName && !isPetrol) return false
      }

      // Site Search Filter
      if (petrolSiteFilter) {
        const site = (e.siteName || 'Unassigned Site').toLowerCase()
        if (!site.includes(petrolSiteFilter.toLowerCase())) return false
      }

      // Vehicle Search Filter
      if (petrolVehicleFilter) {
        const veh = (e.vehicleNo || e.vehicleName || e.vehicleLabel || '').toLowerCase()
        if (!veh.includes(petrolVehicleFilter.toLowerCase())) return false
      }

      // Employee / Driver Filter
      if (petrolEmployeeFilter) {
        const emp = (e.employeeName || e.paidByName || '').toLowerCase()
        if (!emp.includes(petrolEmployeeFilter.toLowerCase())) return false
      }

      return true
    })
  }, [petrolExpenses, dateRange.start, dateRange.end, petrolScope, petrolSiteFilter, petrolVehicleFilter, petrolEmployeeFilter])

  // Site Petrol Summary (Aggregated by Site)
  const sitePetrolSummary = useMemo(() => {
    const map = {}
    filteredPetrolLogs.forEach(entry => {
      const site = entry.siteName?.trim() || 'Unassigned Site'
      if (!map[site]) {
        map[site] = {
          siteName: site,
          totalCost: 0,
          refuelCount: 0,
          vehicles: new Set(),
          entries: []
        }
      }
      map[site].totalCost += Number(entry.amount) || 0
      map[site].refuelCount += 1
      if (entry.vehicleNo) map[site].vehicles.add(entry.vehicleNo)
      map[site].entries.push(entry)
    })

    return Object.values(map)
      .map(s => ({
        ...s,
        vehicleCount: s.vehicles.size,
        vehiclesList: Array.from(s.vehicles),
        entries: s.entries.sort((a, b) => (b.date || '').localeCompare(a.date || ''))
      }))
      .sort((a, b) => b.totalCost - a.totalCost)
  }, [filteredPetrolLogs])

  // Auto-select initial Petrol site
  useEffect(() => {
    if (sitePetrolSummary.length > 0) {
      if (!selectedPetrolSite || !sitePetrolSummary.find(s => s.siteName === selectedPetrolSite)) {
        setSelectedPetrolSite(sitePetrolSummary[0].siteName)
      }
    } else {
      setSelectedPetrolSite(null)
    }
  }, [sitePetrolSummary])

  // Vehicle Petrol Summary (Aggregated by Vehicle)
  const vehiclePetrolSummary = useMemo(() => {
    const map = {}
    filteredPetrolLogs.forEach(entry => {
      const vKey = entry.vehicleNo?.trim() || (entry.vehicleName ? `${entry.vehicleName} (No Reg)` : 'No Vehicle Tagged')
      if (!map[vKey]) {
        map[vKey] = {
          vehicleKey: vKey,
          vehicleNo: entry.vehicleNo || null,
          vehicleName: entry.vehicleName || '',
          totalCost: 0,
          refuelCount: 0,
          sites: new Set(),
          entries: []
        }
      }
      map[vKey].totalCost += Number(entry.amount) || 0
      map[vKey].refuelCount += 1
      if (entry.siteName) map[vKey].sites.add(entry.siteName)
      map[vKey].entries.push(entry)
    })

    return Object.values(map)
      .map(v => ({
        ...v,
        siteCount: v.sites.size,
        sitesList: Array.from(v.sites),
        entries: v.entries.sort((a, b) => (b.date || '').localeCompare(a.date || ''))
      }))
      .sort((a, b) => b.totalCost - a.totalCost)
  }, [filteredPetrolLogs])

  // Auto-select initial Petrol vehicle
  useEffect(() => {
    if (vehiclePetrolSummary.length > 0) {
      if (!selectedPetrolVehicle || !vehiclePetrolSummary.find(v => v.vehicleKey === selectedPetrolVehicle)) {
        setSelectedPetrolVehicle(vehiclePetrolSummary[0].vehicleKey)
      }
    } else {
      setSelectedPetrolVehicle(null)
    }
  }, [vehiclePetrolSummary])

  // Petrol Totals & KPI Metrics
  const petrolTotals = useMemo(() => {
    const totalCost = filteredPetrolLogs.reduce((sum, e) => sum + (Number(e.amount) || 0), 0)
    const totalRefuels = filteredPetrolLogs.length
    const uniqueSites = new Set(filteredPetrolLogs.map(e => e.siteName?.trim()).filter(Boolean)).size
    const uniqueVehicles = new Set(filteredPetrolLogs.map(e => e.vehicleNo?.trim()).filter(Boolean)).size
    const avgPerRefuel = totalRefuels > 0 ? Math.round(totalCost / totalRefuels) : 0
    return {
      totalCost,
      totalRefuels,
      uniqueSites,
      uniqueVehicles,
      avgPerRefuel
    }
  }, [filteredPetrolLogs])

  const exportPetrolPDF = () => {
    try {
      if (filteredPetrolLogs.length === 0) {
        alert('No petrol cost data to export.')
        return
      }

      const doc = new jsPDF('p', 'mm', 'a4')
      
      // Header
      doc.setFont('helvetica', 'bold')
      doc.setFontSize(16)
      doc.setTextColor(15, 23, 42)
      doc.text(user?.orgName || 'HRFlow', 15, 18)
      
      doc.setFontSize(13)
      doc.setTextColor(37, 99, 235) // Blue-600
      doc.text('SitePetrol Cost Report', 15, 25)
      
      doc.setFont('helvetica', 'normal')
      doc.setFontSize(9)
      doc.setTextColor(100, 116, 139)
      doc.text(`Period: ${formatDate(dateRange.start)} to ${formatDate(dateRange.end)}`, 15, 31)
      
      const todayStr = new Date().toLocaleDateString('en-US', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
      doc.text(`Generated: ${todayStr}`, 15, 36)

      // KPI summary banner
      doc.setFillColor(248, 250, 252)
      doc.roundedRect(15, 40, 180, 15, 2, 2, 'F')
      doc.setFont('helvetica', 'bold')
      doc.setFontSize(9)
      doc.setTextColor(15, 23, 42)
      doc.text(`Total Cost: INR ${petrolTotals.totalCost.toLocaleString('en-IN')}`, 20, 49.5)
      doc.text(`Refuels: ${petrolTotals.totalRefuels}`, 80, 49.5)
      doc.text(`Sites: ${petrolTotals.uniqueSites}`, 120, 49.5)
      doc.text(`Vehicles: ${petrolTotals.uniqueVehicles}`, 155, 49.5)

      let currentY = 62

      // 1. Site Petrol Summary Table
      doc.setFont('helvetica', 'bold')
      doc.setFontSize(11)
      doc.setTextColor(15, 23, 42)
      doc.text('1. Site Petrol Cost Summary', 15, currentY)
      currentY += 4

      const siteBody = sitePetrolSummary.map((row, idx) => [
        idx + 1,
        row.siteName,
        row.refuelCount,
        row.vehicleCount,
        `INR ${row.totalCost.toLocaleString('en-IN')}`
      ])

      siteBody.push([
        { content: 'Grand Total', colSpan: 2, styles: { fontStyle: 'bold', fillColor: [241, 245, 249] } },
        { content: petrolTotals.totalRefuels, styles: { fontStyle: 'bold', fillColor: [241, 245, 249], halign: 'center' } },
        { content: petrolTotals.uniqueVehicles, styles: { fontStyle: 'bold', fillColor: [241, 245, 249], halign: 'center' } },
        { content: `INR ${petrolTotals.totalCost.toLocaleString('en-IN')}`, styles: { fontStyle: 'bold', fillColor: [241, 245, 249], halign: 'right' } }
      ])

      autoTable(doc, {
        startY: currentY,
        head: [['#', 'Site Name', 'Refuel Logs', 'Vehicles', 'Total Cost']],
        body: siteBody,
        theme: 'grid',
        styles: { fontSize: 8.5, cellPadding: 3, textColor: [30, 41, 59], font: 'helvetica' },
        headStyles: { fillColor: [241, 245, 249], textColor: [15, 23, 42], fontStyle: 'bold' },
        columnStyles: {
          0: { cellWidth: 12, halign: 'center' },
          1: { cellWidth: 80 },
          2: { cellWidth: 28, halign: 'center' },
          3: { cellWidth: 25, halign: 'center' },
          4: { cellWidth: 35, halign: 'right' }
        }
      })

      currentY = doc.lastAutoTable.finalY + 12

      // 2. Vehicle-Wise Petrol Summary Table
      if (currentY > 230) {
        doc.addPage()
        currentY = 20
      }

      doc.setFont('helvetica', 'bold')
      doc.setFontSize(11)
      doc.setTextColor(15, 23, 42)
      doc.text('2. Vehicle-Wise Petrol Cost Summary', 15, currentY)
      currentY += 4

      const vehicleBody = vehiclePetrolSummary.map((v, idx) => [
        idx + 1,
        v.vehicleNo || 'No Registration',
        v.vehicleName || '—',
        v.refuelCount,
        v.siteCount,
        `INR ${v.totalCost.toLocaleString('en-IN')}`
      ])

      vehicleBody.push([
        { content: 'Grand Total', colSpan: 3, styles: { fontStyle: 'bold', fillColor: [241, 245, 249] } },
        { content: petrolTotals.totalRefuels, styles: { fontStyle: 'bold', fillColor: [241, 245, 249], halign: 'center' } },
        { content: petrolTotals.uniqueSites, styles: { fontStyle: 'bold', fillColor: [241, 245, 249], halign: 'center' } },
        { content: `INR ${petrolTotals.totalCost.toLocaleString('en-IN')}`, styles: { fontStyle: 'bold', fillColor: [241, 245, 249], halign: 'right' } }
      ])

      autoTable(doc, {
        startY: currentY,
        head: [['#', 'Vehicle Number', 'Vehicle Name', 'Refuel Logs', 'Sites Visited', 'Total Cost']],
        body: vehicleBody,
        theme: 'grid',
        styles: { fontSize: 8.5, cellPadding: 3, textColor: [30, 41, 59], font: 'helvetica' },
        headStyles: { fillColor: [241, 245, 249], textColor: [15, 23, 42], fontStyle: 'bold' },
        columnStyles: {
          0: { cellWidth: 12, halign: 'center' },
          1: { cellWidth: 42 },
          2: { cellWidth: 45 },
          3: { cellWidth: 25, halign: 'center' },
          4: { cellWidth: 26, halign: 'center' },
          5: { cellWidth: 30, halign: 'right' }
        }
      })

      currentY = doc.lastAutoTable.finalY + 12

      // 3. Detailed Fuel Logs
      if (currentY > 230) {
        doc.addPage()
        currentY = 20
      }

      doc.setFont('helvetica', 'bold')
      doc.setFontSize(11)
      doc.setTextColor(15, 23, 42)
      doc.text('3. Detailed Fuel Logs', 15, currentY)
      currentY += 4

      const txnBody = filteredPetrolLogs.map((entry, idx) => [
        idx + 1,
        formatDate(entry.date),
        entry.siteName || 'Unassigned',
        entry.vehicleNo ? `${entry.vehicleNo}${entry.vehicleName ? ` (${entry.vehicleName})` : ''}` : '—',
        entry.employeeName || entry.paidByName || '—',
        entry.reason || '—',
        `INR ${(Number(entry.amount) || 0).toLocaleString('en-IN')}`
      ])

      autoTable(doc, {
        startY: currentY,
        head: [['#', 'Date', 'Site Name', 'Vehicle', 'Incurred By', 'Purpose / Notes', 'Amount']],
        body: txnBody,
        theme: 'grid',
        styles: { fontSize: 8, cellPadding: 2.5, textColor: [51, 65, 85], font: 'helvetica' },
        headStyles: { fillColor: [241, 245, 249], textColor: [15, 23, 42], fontStyle: 'bold' },
        columnStyles: {
          0: { cellWidth: 10, halign: 'center' },
          1: { cellWidth: 22 },
          2: { cellWidth: 35 },
          3: { cellWidth: 35 },
          4: { cellWidth: 30 },
          5: { cellWidth: 28 },
          6: { cellWidth: 20, halign: 'right' }
        }
      })

      // Page numbers
      const pageCount = doc.internal.getNumberOfPages()
      for (let i = 1; i <= pageCount; i++) {
        doc.setPage(i)
        doc.setFont('helvetica', 'normal')
        doc.setFontSize(8)
        doc.setTextColor(148, 163, 184)
        doc.text(`Page ${i} of ${pageCount}`, 105, 287, { align: 'center' })
      }

      doc.save(`SitePetrol_Cost_Report_${dateRange.start}_to_${dateRange.end}.pdf`)
    } catch (err) {
      console.error('Petrol PDF Export Error:', err)
      alert(`Failed to generate PDF. Error: ${err.message || 'Unknown error'}`)
    }
  }

  const exportPetrolCSV = () => {
    try {
      if (filteredPetrolLogs.length === 0) {
        alert('No petrol cost data to export.')
        return
      }

      const headers = ['Date', 'Site Name', 'Vehicle Number', 'Vehicle Name', 'Incurred By', 'Purpose / Notes', 'Amount (INR)', 'Status']
      const csvRows = [headers.join(',')]

      filteredPetrolLogs.forEach(entry => {
        const row = [
          `"${entry.date || ''}"`,
          `"${(entry.siteName || 'Unassigned').replace(/"/g, '""')}"`,
          `"${(entry.vehicleNo || '').replace(/"/g, '""')}"`,
          `"${(entry.vehicleName || '').replace(/"/g, '""')}"`,
          `"${(entry.employeeName || entry.paidByName || '').replace(/"/g, '""')}"`,
          `"${(entry.reason || '').replace(/"/g, '""')}"`,
          Number(entry.amount) || 0,
          `"${(entry.status || '').replace(/"/g, '""')}"`
        ]
        csvRows.push(row.join(','))
      })

      const csvContent = 'data:text/csv;charset=utf-8,' + encodeURIComponent(csvRows.join('\n'))
      const link = document.createElement('a')
      link.setAttribute('href', csvContent)
      link.setAttribute('download', `SitePetrol_Cost_Report_${dateRange.start}_to_${dateRange.end}.csv`)
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
    } catch (err) {
      console.error('CSV Export Error:', err)
      alert('Failed to export CSV: ' + err.message)
    }
  }

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
      {/* Sub-Tabs Header - New Design */}
      <div className="bg-white border-b border-slate-200 px-8 shrink-0">
        <div className="flex items-center gap-2 overflow-x-auto no-scrollbar">
          <button
            type="button"
            onClick={() => setActiveSubTab('site-report')}
            className={`flex items-center gap-2 px-4 py-3 text-sm whitespace-nowrap border-b-2 transition-all duration-150 font-['Inter',sans-serif] ${
              activeSubTab === 'site-report' || activeSubTab === 'manpower'
                ? 'border-blue-600 text-blue-600 font-semibold'
                : 'border-transparent text-slate-500 hover:text-slate-800 hover:border-slate-300 font-medium'
            }`}
          >
            <Users size={15} />
            <span>Site Report</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveSubTab('sitepetrol')}
            className={`flex items-center gap-2 px-4 py-3 text-sm whitespace-nowrap border-b-2 transition-all duration-150 font-['Inter',sans-serif] ${
              activeSubTab === 'sitepetrol'
                ? 'border-blue-600 text-blue-600 font-semibold'
                : 'border-transparent text-slate-500 hover:text-slate-800 hover:border-slate-300 font-medium'
            }`}
          >
            <Fuel size={15} />
            <span>SitePetrol Cost</span>
          </button>
        </div>
      </div>

      {/* ---------------------------------------------------- */}
      {/* 1. SITE REPORT SUB-TAB                               */}
      {/* ---------------------------------------------------- */}
      {(activeSubTab === 'site-report' || activeSubTab === 'manpower') && (
        <div className="flex-1 flex flex-col min-h-0">
          {/* Top Bar for Site Report */}
          <div className="px-8 py-4 bg-white border-b border-slate-200 flex flex-col md:flex-row items-start md:items-center justify-between gap-4 font-body">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center font-bold">
                <Users size={18} />
              </div>
              <div>
                <h1 className="text-[17px] font-bold tracking-tight text-slate-900 font-heading">Site Report</h1>
                <p className="text-xs text-slate-500 font-body">Site attendance tracking and daily workforce distribution</p>
              </div>
            </div>
            
            <div className="flex flex-wrap items-center gap-3">
              {/* Date Range & Month Navigator */}
              <div className="flex items-center gap-2">
                <div className="flex items-center bg-white rounded-md border border-slate-200 shadow-xs h-9">
                  <button onClick={() => navigateMonth(-1)} className="w-10 h-full flex items-center justify-center hover:bg-slate-100 rounded-l transition-colors text-slate-500 hover:text-slate-900" title="Previous Month">
                    <ChevronLeft size={16} />
                  </button>
                  <div className="w-28 text-center font-semibold text-xs text-slate-800 tabular-nums">
                    {formatMonthDisplay()}
                  </div>
                  <button onClick={() => navigateMonth(1)} className="w-10 h-full flex items-center justify-center hover:bg-slate-100 rounded-r transition-colors text-slate-500 hover:text-slate-900" title="Next Month">
                    <ChevronRight size={16} />
                  </button>
                </div>
                <div className="flex items-center bg-white rounded-md border border-slate-200 px-2 py-1 shadow-xs h-9">
                  <input 
                    type="date" 
                    value={dateRange.start} 
                    onChange={(e) => setDateRange(prev => ({...prev, start: e.target.value}))}
                    className="text-xs text-slate-700 font-medium outline-none bg-transparent"
                  />
                  <span className="text-slate-300 mx-2 text-xs">-</span>
                  <input 
                    type="date" 
                    value={dateRange.end} 
                    onChange={(e) => setDateRange(prev => ({...prev, end: e.target.value}))}
                    className="text-xs text-slate-700 font-medium outline-none bg-transparent"
                  />
                </div>
              </div>
              
              {/* Filters */}
              <div className="relative">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  placeholder="Filter site..."
                  value={siteFilter}
                  onChange={(e) => setSiteFilter(e.target.value)}
                  className="pl-8 pr-3 h-9 w-40 bg-white border border-slate-200 rounded-md text-xs focus:outline-none focus:ring-1 focus:ring-blue-600 focus:border-blue-600 transition font-medium text-slate-800 placeholder:text-slate-400 shadow-xs"
                />
              </div>
              <div className="relative">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  placeholder="Filter employee..."
                  value={nameFilter}
                  onChange={(e) => setNameFilter(e.target.value)}
                  className="pl-8 pr-3 h-9 w-40 bg-white border border-slate-200 rounded-md text-xs focus:outline-none focus:ring-1 focus:ring-blue-600 focus:border-blue-600 transition font-medium text-slate-800 placeholder:text-slate-400 shadow-xs"
                />
              </div>
              <button 
                onClick={exportPDF}
                className="h-9 px-3.5 bg-blue-600 hover:bg-blue-700 text-white rounded-md text-xs font-bold font-heading tracking-tight flex items-center gap-1.5 transition-colors shadow-xs cursor-pointer active:scale-[0.98]"
              >
                <Download size={14} />
                Export PDF
              </button>
            </div>
          </div>

          {/* Manpower Content Area */}
          <div className="flex-1 overflow-auto p-8 bg-[#fbfbfa]">
            <div className="flex flex-col lg:flex-row gap-8 w-fit">
              {/* Main Site Table */}
              <div className="w-fit">
                <div className="bg-white rounded-xl shadow-xs border border-slate-200 overflow-hidden font-body">
                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="border-b border-slate-200 text-slate-500 text-xs font-semibold bg-slate-50">
                          <th className="px-5 py-2.5 w-16 text-center border-r border-slate-200 font-heading">#</th>
                          <th className="px-5 py-2.5 border-r border-slate-200 font-heading">Site Name</th>
                          <th className="px-5 py-2.5 w-32 border-r border-slate-200 font-heading">Total Days</th>
                          <th className="px-5 py-2.5 w-36 font-heading">Total Manpower</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {loading ? (
                          <tr>
                            <td colSpan={4} className="py-20 text-center"><Spinner /></td>
                          </tr>
                        ) : pivotData.length === 0 ? (
                          <tr>
                            <td colSpan={4} className="py-16 text-center text-slate-400 text-sm font-medium">No site records found for this period.</td>
                          </tr>
                        ) : (
                          pivotData.map((row, idx) => (
                            <tr 
                              key={idx} 
                              onClick={() => setSelectedSite(row.siteName)}
                              className={`transition-colors group cursor-pointer ${selectedSite === row.siteName ? 'bg-blue-50/70 hover:bg-blue-50' : 'hover:bg-slate-50'}`}
                            >
                              <td className="px-5 py-2.5 text-center text-xs text-slate-400 border-r border-slate-200 font-mono">{idx + 1}</td>
                              <td className="px-5 py-2.5 text-xs font-semibold text-slate-900 border-r border-slate-200">{row.siteName}</td>
                              <td className="px-5 py-2.5 text-xs text-slate-700 border-r border-slate-200 font-mono">{row.totalDays}</td>
                              <td className="px-5 py-2.5 text-xs font-bold text-blue-700 font-mono">{row.totalManpower}</td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                  {/* Footer Summary */}
                  {!loading && pivotData.length > 0 && (
                    <div className="bg-slate-50 border-t border-slate-200 px-5 py-3 flex items-center justify-between text-xs">
                      <div className="font-semibold text-slate-500 font-heading">Grand total</div>
                      <div className="flex items-center gap-10 pr-2">
                        <div className="flex flex-col items-start">
                          <span className="text-slate-400 text-[10px] mb-0.5 uppercase tracking-wider font-semibold">Total days</span>
                          <span className="font-bold text-slate-900 text-xs font-mono">{pivotData.reduce((acc, curr) => acc + curr.totalDays, 0)}</span>
                        </div>
                        <div className="flex flex-col items-start">
                          <span className="text-slate-400 text-[10px] mb-0.5 uppercase tracking-wider font-semibold">Total manpower</span>
                          <span className="font-bold text-blue-700 text-xs font-mono">{pivotData.reduce((acc, curr) => acc + curr.totalManpower, 0)}</span>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Details Table */}
              {selectedSite && (
                <div className="w-fit min-w-[500px]">
                  <div className="bg-white rounded-xl shadow-xs border border-slate-200 overflow-hidden font-body h-fit">
                    <div className="bg-slate-50 border-b border-slate-200 px-5 py-3 flex items-center justify-between">
                      <h3 className="font-bold text-sm text-slate-900 font-heading">{selectedSite} Details</h3>
                      <div className="text-xs text-slate-500 font-medium">Daily Attendance Breakdown</div>
                    </div>
                    <div className="overflow-x-auto max-h-[600px] overflow-y-auto">
                      <table className="w-full text-left border-collapse">
                        <thead className="sticky top-0 bg-white shadow-xs z-10 border-b border-slate-200">
                          <tr className="text-slate-500 text-xs font-semibold">
                            <th className="px-5 py-2.5 w-28 font-heading border-r border-slate-200">Date</th>
                            <th className="px-5 py-2.5 font-heading border-r border-slate-200">Employee Names</th>
                            <th className="px-5 py-2.5 w-32 font-heading">Total Manpower</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {pivotData.find(s => s.siteName === selectedSite)?.details.map((d, i) => (
                            <tr key={i} className="hover:bg-slate-50 transition-colors group">
                              <td className="px-5 py-2.5 text-xs text-slate-600 border-r border-slate-200 align-top font-mono">{formatDate(d.date)}</td>
                              <td className="px-5 py-2.5 text-xs text-slate-800 border-r border-slate-200 leading-relaxed align-top">
                                {d.employees.join(', ')}
                              </td>
                              <td className="px-5 py-2.5 text-xs font-bold text-blue-700 align-top font-mono">{d.manpower}</td>
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
      )}

      {/* ---------------------------------------------------- */}
      {/* 2. SITEPETROL COST REPORT SUB-TAB                     */}
      {/* ---------------------------------------------------- */}
      {activeSubTab === 'sitepetrol' && (
        <div className="flex-1 flex flex-col min-h-0 font-['Inter',sans-serif]" style={{ fontFamily: "'Inter', sans-serif" }}>
          {/* Top Bar for SitePetrol */}
          <div className="px-8 py-4 bg-white border-b border-slate-200 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center font-bold">
                <Fuel size={18} />
              </div>
              <div>
                <h1 className="text-[17px] font-bold tracking-tight text-slate-900">SitePetrol Cost Reports</h1>
                <p className="text-xs text-slate-500 font-normal">Site-tagged fuel and vehicle expenses tracking and analysis</p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              {/* Date Range & Month Navigator */}
              <div className="flex items-center gap-2">
                <div className="flex items-center bg-white rounded-md border border-slate-200 shadow-xs h-9">
                  <button onClick={() => navigateMonth(-1)} className="w-10 h-full flex items-center justify-center hover:bg-slate-100 rounded-l transition-colors text-slate-500 hover:text-slate-900" title="Previous Month">
                    <ChevronLeft size={16} />
                  </button>
                  <div className="w-28 text-center font-semibold text-xs text-slate-800 tabular-nums">
                    {formatMonthDisplay()}
                  </div>
                  <button onClick={() => navigateMonth(1)} className="w-10 h-full flex items-center justify-center hover:bg-slate-100 rounded-r transition-colors text-slate-500 hover:text-slate-900" title="Next Month">
                    <ChevronRight size={16} />
                  </button>
                </div>
                <div className="flex items-center bg-white rounded-md border border-slate-200 px-2 py-1 shadow-xs h-9">
                  <input 
                    type="date" 
                    value={dateRange.start} 
                    onChange={(e) => setDateRange(prev => ({...prev, start: e.target.value}))}
                    className="text-xs text-slate-700 font-medium outline-none bg-transparent tabular-nums"
                  />
                  <span className="text-slate-300 mx-2 text-xs">-</span>
                  <input 
                    type="date" 
                    value={dateRange.end} 
                    onChange={(e) => setDateRange(prev => ({...prev, end: e.target.value}))}
                    className="text-xs text-slate-700 font-medium outline-none bg-transparent tabular-nums"
                  />
                </div>
              </div>

              {/* Petrol Scope Selector */}
              <select
                value={petrolScope}
                onChange={(e) => setPetrolScope(e.target.value)}
                className="h-9 px-3 rounded-md border border-slate-200 bg-white text-xs font-semibold text-slate-700 outline-none focus:ring-1 focus:ring-blue-600 shadow-xs"
              >
                <option value="petrol_only">Petrol & Fuel Only</option>
                <option value="all_site_expenses">All Site-Tagged Expenses</option>
              </select>

              {/* Filter inputs */}
              <div className="relative">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  placeholder="Filter site..."
                  value={petrolSiteFilter}
                  onChange={(e) => setPetrolSiteFilter(e.target.value)}
                  className="pl-8 pr-3 h-9 w-36 bg-white border border-slate-200 rounded-md text-xs focus:outline-none focus:ring-1 focus:ring-blue-600 transition font-medium text-slate-800 placeholder:text-slate-400 shadow-xs"
                />
              </div>
              <div className="relative">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  placeholder="Filter vehicle..."
                  value={petrolVehicleFilter}
                  onChange={(e) => setPetrolVehicleFilter(e.target.value)}
                  className="pl-8 pr-3 h-9 w-36 bg-white border border-slate-200 rounded-md text-xs focus:outline-none focus:ring-1 focus:ring-blue-600 transition font-medium text-slate-800 placeholder:text-slate-400 shadow-xs"
                />
              </div>

              {/* Action Buttons */}
              <div className="flex items-center gap-2">
                <button 
                  onClick={exportPetrolCSV}
                  className="h-9 px-3 bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 rounded-md text-xs font-semibold tracking-tight flex items-center gap-1.5 transition-colors shadow-xs cursor-pointer"
                  title="Export CSV spreadsheet"
                >
                  <FileSpreadsheet size={14} className="text-emerald-600" />
                  CSV
                </button>
                <button 
                  onClick={exportPetrolPDF}
                  className="h-9 px-3.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-md text-xs font-bold tracking-tight flex items-center gap-1.5 transition-colors shadow-xs cursor-pointer active:scale-[0.98]"
                  title="Export PDF Report"
                >
                  <Download size={14} />
                  Export PDF
                </button>
              </div>
            </div>
          </div>

          {/* SitePetrol Main Content */}
          <div className="flex-1 overflow-auto p-6 md:p-8 bg-[#fbfbfa]">
            {/* KPI Cards Grid */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
              {/* Total Petrol Cost */}
              <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-xs">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">Total Petrol Cost</span>
                  <div className="w-8 h-8 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center">
                    <Fuel size={16} />
                  </div>
                </div>
                <div className="text-2xl font-extrabold text-slate-900 tabular-nums tracking-tight">
                  ₹{petrolTotals.totalCost.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </div>
                <div className="text-[11px] text-slate-500 mt-1 font-medium">
                  Across {petrolTotals.totalRefuels} refuel {petrolTotals.totalRefuels === 1 ? 'entry' : 'entries'}
                </div>
              </div>

              {/* Total Refuels / Entries */}
              <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-xs">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">Fuel Entries</span>
                  <div className="w-8 h-8 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center">
                    <Coins size={16} />
                  </div>
                </div>
                <div className="text-2xl font-extrabold text-slate-900 tabular-nums tracking-tight">
                  {petrolTotals.totalRefuels}
                </div>
                <div className="text-[11px] text-slate-500 mt-1 font-medium">
                  Avg ₹{petrolTotals.avgPerRefuel.toLocaleString('en-IN')} / refuel
                </div>
              </div>

              {/* Active Sites */}
              <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-xs">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">Sites Fueled</span>
                  <div className="w-8 h-8 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center">
                    <Building2 size={16} />
                  </div>
                </div>
                <div className="text-2xl font-extrabold text-slate-900 tabular-nums tracking-tight">
                  {petrolTotals.uniqueSites}
                </div>
                <div className="text-[11px] text-slate-500 mt-1 font-medium">
                  Distinct work sites tagged
                </div>
              </div>

              {/* Vehicles Logged */}
              <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-xs">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">Vehicles Logged</span>
                  <div className="w-8 h-8 rounded-lg bg-amber-50 text-amber-600 flex items-center justify-center">
                    <Car size={16} />
                  </div>
                </div>
                <div className="text-2xl font-extrabold text-slate-900 tabular-nums tracking-tight">
                  {petrolTotals.uniqueVehicles}
                </div>
                <div className="text-[11px] text-slate-500 mt-1 font-medium">
                  Active company / site fleet
                </div>
              </div>
            </div>

            {/* View Mode Switcher */}
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-1.5 bg-slate-200/60 p-1 rounded-lg">
                <button
                  type="button"
                  onClick={() => setPetrolViewMode('by_site')}
                  className={`h-8 px-3.5 rounded-md text-xs font-bold transition-all ${
                    petrolViewMode === 'by_site'
                      ? 'bg-white text-slate-900 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  By Site Breakdown
                </button>
                <button
                  type="button"
                  onClick={() => setPetrolViewMode('by_vehicle')}
                  className={`h-8 px-3.5 rounded-md text-xs font-bold transition-all ${
                    petrolViewMode === 'by_vehicle'
                      ? 'bg-white text-slate-900 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  By Vehicle Fleet
                </button>
                <button
                  type="button"
                  onClick={() => setPetrolViewMode('transactions')}
                  className={`h-8 px-3.5 rounded-md text-xs font-bold transition-all ${
                    petrolViewMode === 'transactions'
                      ? 'bg-white text-slate-900 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  All Transactions ({filteredPetrolLogs.length})
                </button>
              </div>

              <div className="text-xs font-medium text-slate-500">
                Showing {filteredPetrolLogs.length} fuel logs for {formatMonthDisplay()}
              </div>
            </div>

            {/* Content Loading State */}
            {petrolLoading ? (
              <div className="py-24 bg-white rounded-xl border border-slate-200 flex flex-col items-center justify-center gap-3">
                <Spinner />
                <span className="text-xs text-slate-500 font-medium">Loading site petrol expenses…</span>
              </div>
            ) : filteredPetrolLogs.length === 0 ? (
              <div className="py-20 bg-white rounded-xl border border-dashed border-slate-300 text-center p-8">
                <div className="w-12 h-12 rounded-full bg-slate-100 text-slate-400 flex items-center justify-center mx-auto mb-3">
                  <Fuel size={24} />
                </div>
                <h3 className="text-sm font-bold text-slate-800">No petrol expenses found</h3>
                <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto font-normal">
                  No site petrol or fuel entries match the selected date range ({formatDate(dateRange.start)} - {formatDate(dateRange.end)}) and filters.
                </p>
              </div>
            ) : (
              <>
                {/* ---------------------------------------------------- */}
                {/* 2A. MASTER-DETAIL: BY SITE BREAKDOWN                 */}
                {/* ---------------------------------------------------- */}
                {petrolViewMode === 'by_site' && (
                  <div className="flex flex-col lg:flex-row gap-6 items-start">
                    {/* Left: Site Summary Table */}
                    <div className="w-full lg:w-[480px] shrink-0 bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
                      <div className="px-5 py-3 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
                        <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700">Site Summary</h3>
                        <span className="text-[11px] text-slate-500 font-medium tabular-nums">{sitePetrolSummary.length} Sites</span>
                      </div>
                      <div className="overflow-x-auto max-h-[600px] overflow-y-auto">
                        <table className="w-full text-left border-collapse">
                          <thead className="sticky top-0 bg-white shadow-xs z-10 border-b border-slate-200">
                            <tr className="text-slate-500 text-xs font-semibold">
                              <th className="px-4 py-2.5 w-12 text-center border-r border-slate-100">#</th>
                              <th className="px-4 py-2.5 border-r border-slate-100">Site Name</th>
                              <th className="px-3 py-2.5 w-20 text-center border-r border-slate-100">Refuels</th>
                              <th className="px-4 py-2.5 w-32 text-right">Total Cost</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100 text-xs">
                            {sitePetrolSummary.map((site, idx) => {
                              const isSelected = selectedPetrolSite === site.siteName
                              return (
                                <tr
                                  key={site.siteName}
                                  onClick={() => setSelectedPetrolSite(site.siteName)}
                                  className={`transition-colors cursor-pointer ${
                                    isSelected 
                                      ? 'bg-blue-50/70 border-l-4 border-l-blue-600' 
                                      : 'hover:bg-slate-50/80 border-l-4 border-l-transparent'
                                  }`}
                                >
                                  <td className="px-4 py-3 text-center text-slate-400 border-r border-slate-100 font-medium tabular-nums">{idx + 1}</td>
                                  <td className="px-4 py-3 border-r border-slate-100">
                                    <div className="font-bold text-slate-900 leading-snug">{site.siteName}</div>
                                    <div className="text-[10px] text-slate-400 font-normal mt-0.5">
                                      {site.vehicleCount > 0 ? `${site.vehicleCount} vehicle${site.vehicleCount === 1 ? '' : 's'}` : 'No vehicle tagged'}
                                    </div>
                                  </td>
                                  <td className="px-3 py-3 text-center text-slate-700 border-r border-slate-100 font-medium tabular-nums">
                                    {site.refuelCount}
                                  </td>
                                  <td className="px-4 py-3 text-right font-bold text-slate-900 tabular-nums">
                                    ₹{site.totalCost.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                                  </td>
                                </tr>
                              )
                            })}
                          </tbody>
                        </table>
                      </div>
                      {/* Footer */}
                      <div className="px-5 py-3 bg-slate-50 border-t border-slate-200 flex items-center justify-between text-xs">
                        <span className="font-bold text-slate-600">Grand Total</span>
                        <div className="flex items-center gap-6">
                          <span className="text-slate-500 font-medium tabular-nums">{petrolTotals.totalRefuels} Logs</span>
                          <span className="font-bold text-emerald-700 tabular-nums text-sm">
                            ₹{petrolTotals.totalCost.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Right: Selected Site Detailed Logs */}
                    <div className="flex-1 w-full bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
                      {selectedPetrolSite ? (
                        <>
                          <div className="px-6 py-4 bg-slate-50/80 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                            <div className="flex items-center gap-2.5">
                              <div className="w-8 h-8 rounded-lg bg-blue-100 text-blue-700 flex items-center justify-center font-bold">
                                <Building2 size={18} />
                              </div>
                              <div>
                                <h3 className="text-sm font-bold text-slate-900">{selectedPetrolSite}</h3>
                                <p className="text-[11px] text-slate-500 font-normal">
                                  {sitePetrolSummary.find(s => s.siteName === selectedPetrolSite)?.refuelCount || 0} fuel transactions recorded
                                </p>
                              </div>
                            </div>
                            <div className="flex items-center gap-2">
                              <span className="px-3 py-1 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-md tabular-nums text-xs font-bold">
                                Total: ₹{(sitePetrolSummary.find(s => s.siteName === selectedPetrolSite)?.totalCost || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                              </span>
                            </div>
                          </div>

                          <div className="overflow-x-auto max-h-[600px] overflow-y-auto">
                            <table className="w-full text-left border-collapse">
                              <thead className="sticky top-0 bg-white shadow-xs z-10 border-b border-slate-200 text-slate-500 text-xs font-semibold">
                                <tr>
                                  <th className="px-4 py-2.5 w-28">Date</th>
                                  <th className="px-4 py-2.5">Vehicle</th>
                                  <th className="px-4 py-2.5">Incurred By</th>
                                  <th className="px-4 py-2.5">Purpose / Notes</th>
                                  <th className="px-4 py-2.5 text-right w-28">Amount</th>
                                  <th className="px-3 py-2.5 text-center w-24">Status</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-slate-100 text-xs">
                                {sitePetrolSummary.find(s => s.siteName === selectedPetrolSite)?.entries.map((entry) => (
                                  <tr key={entry.id} className="hover:bg-slate-50/70 transition-colors">
                                    <td className="px-4 py-3 text-slate-700 tabular-nums whitespace-nowrap font-medium">
                                      {formatDate(entry.date)}
                                    </td>
                                    <td className="px-4 py-3">
                                      {entry.vehicleNo ? (
                                        <div className="inline-flex flex-col">
                                          <span className="font-bold text-slate-800 bg-slate-100 px-2 py-0.5 rounded border border-slate-200 text-[11px] tracking-wide inline-flex items-center gap-1">
                                            <Car size={11} className="text-slate-600" />
                                            {entry.vehicleNo}
                                          </span>
                                          {entry.vehicleName && (
                                            <span className="text-[10px] text-slate-400 font-normal mt-0.5">{entry.vehicleName}</span>
                                          )}
                                        </div>
                                      ) : (
                                        <span className="text-slate-400 italic text-[11px]">Unassigned</span>
                                      )}
                                    </td>
                                    <td className="px-4 py-3 font-medium text-slate-800">
                                      {entry.employeeName || entry.paidByName || '—'}
                                    </td>
                                    <td className="px-4 py-3 text-slate-600 max-w-xs truncate font-normal" title={entry.reason || ''}>
                                      {entry.reason || '—'}
                                    </td>
                                    <td className="px-4 py-3 text-right font-bold text-slate-900 tabular-nums">
                                      ₹{(Number(entry.amount) || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                                    </td>
                                    <td className="px-3 py-3 text-center">
                                      <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${
                                        (entry.status || '').toLowerCase() === 'approved'
                                          ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                          : 'bg-amber-50 text-amber-700 border border-amber-200'
                                      }`}>
                                        {entry.status || 'Pending'}
                                      </span>
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </>
                      ) : (
                        <div className="py-24 text-center text-slate-400 text-xs">Select a site to view refuel transactions</div>
                      )}
                    </div>
                  </div>
                )}

                {/* ---------------------------------------------------- */}
                {/* 2B. MASTER-DETAIL: BY VEHICLE FLEET                  */}
                {/* ---------------------------------------------------- */}
                {petrolViewMode === 'by_vehicle' && (
                  <div className="flex flex-col lg:flex-row gap-6 items-start">
                    {/* Left: Vehicle Summary Table */}
                    <div className="w-full lg:w-[480px] shrink-0 bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
                      <div className="px-5 py-3 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
                        <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700">Vehicle Fleet Summary</h3>
                        <span className="text-[11px] text-slate-500 font-medium tabular-nums">{vehiclePetrolSummary.length} Vehicles</span>
                      </div>
                      <div className="overflow-x-auto max-h-[600px] overflow-y-auto">
                        <table className="w-full text-left border-collapse">
                          <thead className="sticky top-0 bg-white shadow-xs z-10 border-b border-slate-200">
                            <tr className="text-slate-500 text-xs font-semibold">
                              <th className="px-4 py-2.5 w-12 text-center border-r border-slate-100">#</th>
                              <th className="px-4 py-2.5 border-r border-slate-100">Vehicle</th>
                              <th className="px-3 py-2.5 w-20 text-center border-r border-slate-100">Refuels</th>
                              <th className="px-4 py-2.5 w-32 text-right">Total Cost</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100 text-xs">
                            {vehiclePetrolSummary.map((veh, idx) => {
                              const isSelected = selectedPetrolVehicle === veh.vehicleKey
                              return (
                                <tr
                                  key={veh.vehicleKey}
                                  onClick={() => setSelectedPetrolVehicle(veh.vehicleKey)}
                                  className={`transition-colors cursor-pointer ${
                                    isSelected 
                                      ? 'bg-amber-50/70 border-l-4 border-l-amber-600' 
                                      : 'hover:bg-slate-50/80 border-l-4 border-l-transparent'
                                  }`}
                                >
                                  <td className="px-4 py-3 text-center text-slate-400 border-r border-slate-100 font-medium tabular-nums">{idx + 1}</td>
                                  <td className="px-4 py-3 border-r border-slate-100">
                                    <div className="font-bold text-slate-900 tracking-wide flex items-center gap-1.5">
                                      <Car size={13} className="text-slate-500" />
                                      {veh.vehicleNo || 'No Number'}
                                    </div>
                                    <div className="text-[10px] text-slate-400 font-normal mt-0.5">
                                      {veh.vehicleName ? `${veh.vehicleName} · ` : ''}{veh.siteCount} {veh.siteCount === 1 ? 'site' : 'sites'}
                                    </div>
                                  </td>
                                  <td className="px-3 py-3 text-center text-slate-700 border-r border-slate-100 font-medium tabular-nums">
                                    {veh.refuelCount}
                                  </td>
                                  <td className="px-4 py-3 text-right font-bold text-slate-900 tabular-nums">
                                    ₹{veh.totalCost.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                                  </td>
                                </tr>
                              )
                            })}
                          </tbody>
                        </table>
                      </div>
                      {/* Footer */}
                      <div className="px-5 py-3 bg-slate-50 border-t border-slate-200 flex items-center justify-between text-xs">
                        <span className="font-bold text-slate-600">Grand Total</span>
                        <div className="flex items-center gap-6">
                          <span className="text-slate-500 font-medium tabular-nums">{petrolTotals.totalRefuels} Logs</span>
                          <span className="font-bold text-emerald-700 tabular-nums text-sm">
                            ₹{petrolTotals.totalCost.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Right: Selected Vehicle Detailed Logs */}
                    <div className="flex-1 w-full bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
                      {selectedPetrolVehicle ? (
                        <>
                          <div className="px-6 py-4 bg-slate-50/80 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                            <div className="flex items-center gap-2.5">
                              <div className="w-8 h-8 rounded-lg bg-amber-100 text-amber-700 flex items-center justify-center font-bold">
                                <Car size={18} />
                              </div>
                              <div>
                                <h3 className="text-sm font-bold text-slate-900 tracking-wide">{selectedPetrolVehicle}</h3>
                                <p className="text-[11px] text-slate-500 font-normal">
                                  {vehiclePetrolSummary.find(v => v.vehicleKey === selectedPetrolVehicle)?.refuelCount || 0} fuel transactions recorded
                                </p>
                              </div>
                            </div>
                            <div className="flex items-center gap-2">
                              <span className="px-3 py-1 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-md tabular-nums text-xs font-bold">
                                Total: ₹{(vehiclePetrolSummary.find(v => v.vehicleKey === selectedPetrolVehicle)?.totalCost || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                              </span>
                            </div>
                          </div>

                          <div className="overflow-x-auto max-h-[600px] overflow-y-auto">
                            <table className="w-full text-left border-collapse">
                              <thead className="sticky top-0 bg-white shadow-xs z-10 border-b border-slate-200 text-slate-500 text-xs font-semibold">
                                <tr>
                                  <th className="px-4 py-2.5 w-28">Date</th>
                                  <th className="px-4 py-2.5">Site Visited</th>
                                  <th className="px-4 py-2.5">Incurred By</th>
                                  <th className="px-4 py-2.5">Purpose / Notes</th>
                                  <th className="px-4 py-2.5 text-right w-28">Amount</th>
                                  <th className="px-3 py-2.5 text-center w-24">Status</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-slate-100 text-xs">
                                {vehiclePetrolSummary.find(v => v.vehicleKey === selectedPetrolVehicle)?.entries.map((entry) => (
                                  <tr key={entry.id} className="hover:bg-slate-50/70 transition-colors">
                                    <td className="px-4 py-3 text-slate-700 tabular-nums whitespace-nowrap font-medium">
                                      {formatDate(entry.date)}
                                    </td>
                                    <td className="px-4 py-3 font-semibold text-slate-900">
                                      {entry.siteName || <span className="text-slate-400 italic font-normal">Unassigned</span>}
                                    </td>
                                    <td className="px-4 py-3 font-medium text-slate-800">
                                      {entry.employeeName || entry.paidByName || '—'}
                                    </td>
                                    <td className="px-4 py-3 text-slate-600 max-w-xs truncate font-normal" title={entry.reason || ''}>
                                      {entry.reason || '—'}
                                    </td>
                                    <td className="px-4 py-3 text-right font-bold text-slate-900 tabular-nums">
                                      ₹{(Number(entry.amount) || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                                    </td>
                                    <td className="px-3 py-3 text-center">
                                      <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${
                                        (entry.status || '').toLowerCase() === 'approved'
                                          ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                          : 'bg-amber-50 text-amber-700 border border-amber-200'
                                      }`}>
                                        {entry.status || 'Pending'}
                                      </span>
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </>
                      ) : (
                        <div className="py-24 text-center text-slate-400 text-xs">Select a vehicle to view refuel transactions</div>
                      )}
                    </div>
                  </div>
                )}

                {/* ---------------------------------------------------- */}
                {/* 2C. ALL FUEL TRANSACTIONS TABLE                      */}
                {/* ---------------------------------------------------- */}
                {petrolViewMode === 'transactions' && (
                  <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
                    <div className="px-6 py-4 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
                      <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700">
                        All Fuel Transactions ({filteredPetrolLogs.length})
                      </h3>
                      <div className="font-bold text-emerald-700 tabular-nums text-sm">
                        Grand Total: ₹{petrolTotals.totalCost.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                      </div>
                    </div>

                    <div className="overflow-x-auto max-h-[650px] overflow-y-auto">
                      <table className="w-full text-left border-collapse">
                        <thead className="sticky top-0 bg-white shadow-xs z-10 border-b border-slate-200 text-slate-500 text-xs font-semibold">
                          <tr>
                            <th className="px-4 py-2.5 w-12 text-center">#</th>
                            <th className="px-4 py-2.5 w-28">Date</th>
                            <th className="px-4 py-2.5">Site Name</th>
                            <th className="px-4 py-2.5">Vehicle</th>
                            <th className="px-4 py-2.5">Incurred By</th>
                            <th className="px-4 py-2.5">Purpose / Notes</th>
                            <th className="px-4 py-2.5 text-right w-28">Amount</th>
                            <th className="px-3 py-2.5 text-center w-24">Status</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 text-xs">
                          {filteredPetrolLogs.map((entry, idx) => (
                            <tr key={entry.id} className="hover:bg-slate-50/70 transition-colors">
                              <td className="px-4 py-3 text-center text-slate-400 font-medium tabular-nums">{idx + 1}</td>
                              <td className="px-4 py-3 text-slate-700 tabular-nums whitespace-nowrap font-medium">{formatDate(entry.date)}</td>
                              <td className="px-4 py-3 font-bold text-slate-900">{entry.siteName || <span className="text-slate-400 italic font-normal">Unassigned</span>}</td>
                              <td className="px-4 py-3">
                                {entry.vehicleNo ? (
                                  <div className="inline-flex flex-col">
                                    <span className="font-bold text-slate-800 bg-slate-100 px-2 py-0.5 rounded border border-slate-200 text-[11px] tracking-wide inline-flex items-center gap-1">
                                      <Car size={11} className="text-slate-600" />
                                      {entry.vehicleNo}
                                    </span>
                                    {entry.vehicleName && (
                                      <span className="text-[10px] text-slate-400 font-normal mt-0.5">{entry.vehicleName}</span>
                                    )}
                                  </div>
                                ) : (
                                  <span className="text-slate-400 italic text-[11px] font-normal">Unassigned</span>
                                )}
                              </td>
                              <td className="px-4 py-3 font-medium text-slate-800">{entry.employeeName || entry.paidByName || '—'}</td>
                              <td className="px-4 py-3 text-slate-600 max-w-sm truncate font-normal" title={entry.reason || ''}>{entry.reason || '—'}</td>
                              <td className="px-4 py-3 text-right font-bold text-slate-900 tabular-nums">
                                ₹{(Number(entry.amount) || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                              </td>
                              <td className="px-3 py-3 text-center">
                                <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${
                                  (entry.status || '').toLowerCase() === 'approved'
                                    ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                    : 'bg-amber-50 text-amber-700 border border-amber-200'
                                }`}>
                                  {entry.status || 'Pending'}
                                </span>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
