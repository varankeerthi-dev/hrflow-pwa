import React, { useState, useEffect, useMemo } from 'react'
import { useAuth } from '../../hooks/useAuth'
import { useEmployees } from '../../hooks/useEmployees'
import { db } from '../../lib/firebase'
import { collection, addDoc, query, getDocs, serverTimestamp, orderBy, deleteDoc, doc, getDoc, updateDoc } from 'firebase/firestore'
import { Trash2, FileDown, Edit2, PieChart, AlertTriangle, Clock, CheckCircle2, ChevronLeft, ChevronRight, Calendar, Search, Filter, RefreshCw } from 'lucide-react'
import Spinner from '../ui/Spinner'
import { formatINR } from '../../lib/salaryUtils'
import jsPDF from 'jspdf'
import 'jspdf-autotable'

export default function AdvanceExpenseTab() {
  const { user } = useAuth()
  const { employees } = useEmployees(user?.orgId)
  const [loading, setLoading] = useState(false)
  const [entries, setEntries] = useState([])
  const [activeModule, setActiveModule] = useState('Add Expense')
  const [categories, setCategories] = useState(['Salary Advance', 'Travel', 'Medical'])
  
  // Reports Filter States
  const [reportMonth, setReportMonth] = useState(new Date().toISOString().slice(0, 7)) // YYYY-MM
  const [reportFilterName, setReportFilterName] = useState('')
  const [reportFilterCategory, setReportFilterCategory] = useState('')
  const [filteredEntries, setFilteredEntries] = useState([])
  const [reportApplied, setReportApplied] = useState(false)

  const isAdmin = user?.role?.toLowerCase() === 'admin'
  const isAccountant = user?.role?.toLowerCase() === 'accountant'
  const canSelectAll = isAdmin || isAccountant

  const getMyEmpId = () => {
    const me = employees.find(e => e.email === user.email || e.id === user.uid)
    return me ? me.id : ''
  }

  const [addRows, setAddRows] = useState([
    { id: Date.now(), date: new Date().toISOString().split('T')[0], employeeId: '', category: '', amount: '', reason: '', project: '' }
  ])

  useEffect(() => {
    if (!canSelectAll && employees.length > 0 && addRows.length === 1 && !addRows[0].employeeId) {
      const myId = getMyEmpId()
      if (myId) {
        setAddRows([{ ...addRows[0], employeeId: myId }])
      }
    }
  }, [employees, canSelectAll])

  const [submitting, setSubmitting] = useState(false)
  
  // For editing
  const [editingId, setEditingId] = useState(null)
  const [editForm, setEditForm] = useState({})

  const modules = ['Add Advance', 'Add Expense', 'Escalation', 'Summary', 'Reports']
  const defaultCategories = ['Salary Advance', 'Travel', 'Medical', 'Food', 'Office Supplies', 'Others']

  const fetchEntries = async () => {
    if (!user?.orgId) return
    setLoading(true)
    try {
      const q = query(
        collection(db, 'organisations', user.orgId, 'advances_expenses'),
        orderBy('date', 'desc')
      )
      const snap = await getDocs(q)
      setEntries(snap.docs.map(d => ({ id: d.id, ...d.data() })))
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  const fetchCategories = async () => {
    if (!user?.orgId) return
    try {
      const orgSnap = await getDoc(doc(db, 'organisations', user.orgId))
      if (orgSnap.exists()) {
        const orgData = orgSnap.data()
        if (orgData.advanceCategories && orgData.advanceCategories.length > 0) {
          const merged = [...new Set([...orgData.advanceCategories, ...defaultCategories])]
          setCategories(merged)
        } else {
          setCategories(defaultCategories)
        }
      }
    } catch (err) {
      console.error('Error fetching categories:', err)
      setCategories(defaultCategories)
    }
  }

  useEffect(() => { fetchEntries() }, [user?.orgId])
  useEffect(() => { fetchCategories() }, [user?.orgId])

  useEffect(() => {
    if (user?.orgId && (activeModule === 'Summary' || activeModule === 'Escalation')) {
      fetchEntries()
    }
  }, [activeModule, user?.orgId])

  const handleAddRow = () => {
    const myId = !canSelectAll ? getMyEmpId() : ''
    setAddRows([...addRows, { id: Date.now(), date: new Date().toISOString().split('T')[0], employeeId: myId, category: '', amount: '', reason: '', project: '' }])
  }

  const handleSelfExpense = () => {
    const currentUserEmp = employees.find(e => e.email === user.email || e.id === user.uid)
    const empId = currentUserEmp ? currentUserEmp.id : (user.uid || '')
    setAddRows(addRows.map(row => ({ ...row, employeeId: empId })))
  }

  const handleRowChange = (id, field, value) => {
    setAddRows(addRows.map(row => row.id === id ? { ...row, [field]: value } : row))
  }

  const handleSubmitAll = async () => {
    const validRows = addRows.filter(r => r.employeeId && r.amount && r.category)
    if (validRows.length === 0) return alert('Please fill in required fields (Employee, Category, Amount) for at least one row.')
    
    setSubmitting(true)
    try {
      for (const row of validRows) {
        const emp = employees.find(e => e.id === row.employeeId)
        
        // Determine type based on active module OR category fallback
        let type = 'Expense'
        if (activeModule === 'Add Advance') {
          type = 'Advance'
        } else if (activeModule === 'Add Expense') {
          type = 'Expense'
        } else {
          // Fallback if submitted from another module context
          type = row.category.toLowerCase().includes('advance') ? 'Advance' : 'Expense'
        }
        
        await addDoc(collection(db, 'organisations', user.orgId, 'advances_expenses'), {
          employeeId: row.employeeId,
          employeeName: emp?.name || 'Unknown',
          type: type,
          category: row.category,
          amount: Number(row.amount),
          date: row.date,
          reason: row.reason,
          project: row.project || '',
          status: 'Pending',
          approved_by: null,
          approved_at: null,
          hrApproval: 'Pending',
          mdApproval: 'Pending',
          createdBy: user.name || user.email,
          createdAt: serverTimestamp()
        })
      }
      setAddRows([{ id: Date.now(), date: new Date().toISOString().split('T')[0], employeeId: !canSelectAll ? getMyEmpId() : '', category: '', amount: '', reason: '', project: '' }])
      await fetchEntries()
      // Enter into report split section
      setActiveModule('Reports')
    } catch (err) {
      console.error('Submission error:', err)
      alert(`Failed to save: ${err.message}`)
    } finally {
      setSubmitting(false)
    }
  }

  const handleEdit = (entry) => {
    setEditingId(entry.id)
    setEditForm(entry)
  }

  const handleUpdate = async () => {
    try {
      // Maintain existing type if possible, otherwise detect from category
      let type = editForm.type
      if (editForm.category.toLowerCase().includes('advance')) {
        type = 'Advance'
      } else if (editForm.category.toLowerCase().includes('expense')) {
        type = 'Expense'
      } else if (!type) {
        type = 'Expense'
      }
      
      const emp = employees.find(e => e.id === editForm.employeeId) || {}
      await updateDoc(doc(db, 'organisations', user.orgId, 'advances_expenses', editingId), {
        ...editForm,
        type: type,
        employeeName: emp.name || editForm.employeeName,
        amount: Number(editForm.amount)
      })
      setEditingId(null)
      fetchEntries()
    } catch (err) {
      alert('Failed to update')
    }
  }

  const advances = entries.filter(e => e.type === 'Advance')
  const expenses = entries.filter(e => e.type === 'Expense')

  const effectiveAmount = (e) => {
    if (e.status === 'Partial' && e.partialAmount != null && e.partialAmount !== '')
      return Number(e.partialAmount)
    return Number(e.amount || 0)
  }

  const summary = useMemo(() => {
    const adv = entries.filter((e) => e.type === 'Advance')
    const exp = entries.filter((e) => e.type === 'Expense')
    const statusKey = (e) => e.status || 'Pending'
    const roll = (list) => {
      const map = {}
      for (const e of list) {
        const k = statusKey(e)
        if (!map[k]) map[k] = { count: 0, sum: 0 }
        map[k].count += 1
        map[k].sum += Number(e.amount || 0)
      }
      return map
    }
    const advSum = adv.reduce((s, e) => s + Number(e.amount || 0), 0)
    const expSum = exp.reduce((s, e) => s + Number(e.amount || 0), 0)
    const awaitingPay = entries.filter(
      (e) =>
        (e.mdApproval === 'Approved' || e.mdApproval === 'Partial') &&
        e.paymentStatus !== 'Paid'
    )
    const paid = entries.filter((e) => e.paymentStatus === 'Paid')
    const eff = (e) => {
      if (e.status === 'Partial' && e.partialAmount != null && e.partialAmount !== '')
        return Number(e.partialAmount)
      return Number(e.amount || 0)
    }
    return {
      advSum,
      expSum,
      advCount: adv.length,
      expCount: exp.length,
      byStatus: roll(entries),
      awaitingPaymentSum: awaitingPay.reduce((s, e) => s + eff(e), 0),
      awaitingPaymentCount: awaitingPay.length,
      paidSum: paid.reduce((s, e) => s + eff(e), 0),
      paidCount: paid.length
    }
  }, [entries])

  const escalation = useMemo(() => {
    const needsHr = entries.filter(
      (e) => e.status === 'Pending' && (e.hrApproval === 'Pending' || !e.hrApproval)
    )
    const needsMd = entries.filter(
      (e) =>
        e.status === 'Pending' &&
        e.hrApproval === 'Approved' &&
        (e.mdApproval === 'Pending' || !e.mdApproval)
    )
    const onHold = entries.filter((e) => e.status === 'Hold')
    return { needsHr, needsMd, onHold }
  }, [entries])

  const handleMonthChange = (direction) => {
    const [year, month] = reportMonth.split('-').map(Number)
    const d = new Date(year, month - 1 + direction, 1)
    const newYear = d.getFullYear()
    const newMonth = String(d.getMonth() + 1).padStart(2, '0')
    setReportMonth(`${newYear}-${newMonth}`)
  }

  const applyReportFilters = () => {
    setLoading(true)
    try {
      const filtered = entries.filter(e => {
        // e.date is YYYY-MM-DD, reportMonth is YYYY-MM
        const matchesMonth = e.date && e.date.startsWith(reportMonth)
        const matchesName = !reportFilterName || (e.employeeName && e.employeeName.toLowerCase().includes(reportFilterName.toLowerCase()))
        const matchesCategory = !reportFilterCategory || (e.category && e.category.toLowerCase().includes(reportFilterCategory.toLowerCase()))
        return matchesMonth && matchesName && matchesCategory
      })
      setFilteredEntries(filtered)
      setReportApplied(true)
    } finally {
      setLoading(false)
    }
  }

  const advForReport = useMemo(() => filteredEntries.filter(e => e.type === 'Advance'), [filteredEntries])
  const expForReport = useMemo(() => filteredEntries.filter(e => e.type === 'Expense'), [filteredEntries])

  const exportPDF = () => {
    try {
      const doc = new jsPDF()
      const [year, month] = reportMonth.split('-').map(Number)
      const monthName = new Date(year, month - 1).toLocaleString('default', { month: 'long' })
      
      doc.setFontSize(16)
      doc.text(`Advances & Expenses Report - ${monthName} ${year}`, 14, 15)
      
      const dataToUseAdv = reportApplied ? advForReport : entries.filter(e => e.type === 'Advance' && e.date?.startsWith(reportMonth))
      const dataToUseExp = reportApplied ? expForReport : entries.filter(e => e.type === 'Expense' && e.date?.startsWith(reportMonth))

      if (dataToUseAdv.length > 0) {
        doc.setFontSize(12)
        doc.text('Advances', 14, 25)
        doc.autoTable({
          startY: 30,
          head: [['Date', 'Employee', 'Category', 'Amount', 'Status']],
          body: dataToUseAdv.map(a => [a.date, a.employeeName, a.category, formatINR(a.amount), a.status]),
          theme: 'grid',
          styles: { fontSize: 8 },
          headStyles: { fillColor: [245, 158, 11] } // Amber-500
        })
      }
      
      const finalY = (doc.lastAutoTable?.finalY || 25) + 10
      
      if (dataToUseExp.length > 0) {
        doc.setFontSize(12)
        doc.text('Expenses', 14, finalY)
        doc.autoTable({
          startY: finalY + 5,
          head: [['Date', 'Employee', 'Category', 'Amount', 'Status']],
          body: dataToUseExp.map(e => [e.date, e.employeeName, e.category, formatINR(e.amount), e.status]),
          theme: 'grid',
          styles: { fontSize: 8 },
          headStyles: { fillColor: [37, 99, 235] } // Blue-600
        })
      }
      
      doc.save(`Adv_Exp_Report_${reportMonth}.pdf`)
    } catch (err) {
      console.error('PDF Export Error:', err)
      alert('Failed to generate PDF. Please try again.')
    }
  }

  return (
    <div className="space-y-6 font-inter">
      <style>{`
        .no-arrow::-webkit-calendar-picker-indicator { display: none !important; }
      `}</style>
      
      <datalist id="categories-list">
        {categories.map(c => <option key={c} value={c} />)}
      </datalist>

      {/* Sub-modules Nav */}
      <div className="flex border-b border-gray-200 overflow-x-auto">
        {modules.map(mod => {
          const isActive = activeModule === mod
          let colorClass = 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'
          
          if (isActive) {
            if (mod === 'Add Advance') colorClass = 'border-b-2 border-amber-600 text-amber-700 bg-amber-50/30'
            else if (mod === 'Add Expense') colorClass = 'border-b-2 border-blue-600 text-blue-700 bg-blue-50/30'
            else colorClass = 'border-b-2 border-indigo-600 text-indigo-600'
          }

          return (
            <button
              key={mod}
              onClick={() => setActiveModule(mod)}
              className={`whitespace-nowrap px-6 py-3 text-sm font-black uppercase tracking-widest transition-all ${colorClass}`}
            >
              {mod}
            </button>
          )
        })}
      </div>

      {/* Add Expense / Add Advance Module */}
      {(activeModule === 'Add Expense' || activeModule === 'Add Advance') && (
        <div className={`rounded-[12px] border overflow-hidden shadow-sm transition-colors duration-300 ${
          activeModule === 'Add Advance' 
            ? 'bg-amber-50/50 border-amber-200' 
            : 'bg-blue-50/50 border-blue-200'
        }`}>
          {/* Header & Controls */}
          <div className={`flex justify-between items-center p-6 border-b transition-colors ${
            activeModule === 'Add Advance' 
              ? 'border-amber-100 bg-amber-100/50' 
              : 'border-blue-100 bg-blue-100/50'
          }`}>
            <h2 className="text-xl font-black text-gray-800 tracking-tight">{activeModule === 'Add Advance' ? 'Add Advance' : 'Add Expenses'}</h2>
            <div className="flex items-center gap-3">
              <button onClick={handleSelfExpense} className="h-[36px] px-4 bg-white border border-gray-300 text-gray-700 font-bold rounded-lg text-[12px] uppercase tracking-widest shadow-sm hover:bg-gray-50 active:bg-gray-100 transition-all">
                Self Expense
              </button>
              <button onClick={handleAddRow} className="h-[36px] px-4 bg-white/80 border border-teal-200 text-teal-600 font-bold rounded-lg text-[12px] uppercase tracking-widest hover:bg-teal-50 active:bg-teal-100 transition-all">
                + Add Row
              </button>
              <button onClick={handleSubmitAll} disabled={submitting} className={`h-[36px] px-6 text-white font-bold rounded-lg text-[12px] flex items-center gap-2 shadow-md transition-all uppercase tracking-widest disabled:opacity-50 ${
                activeModule === 'Add Advance'
                  ? 'bg-amber-600 hover:bg-amber-700 active:bg-amber-800'
                  : 'bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800'
              }`}>
                {submitting ? <Spinner size="w-4 h-4" color="text-white" /> : 'Submit'}
              </button>
            </div>
          </div>

          <div className="overflow-x-auto p-4">
            <table className="w-full text-left border-collapse border border-gray-200 min-w-[900px]">
              <thead>
                <tr className={activeModule === 'Add Advance' ? 'bg-amber-100/80 border-b border-amber-200' : 'bg-blue-100/80 border-b border-blue-200'}>
                  <th className="p-3 text-[11px] font-bold text-gray-600 uppercase tracking-wider border-r border-gray-200 w-[120px]">Requesting date</th>
                  <th className="p-3 text-[11px] font-bold text-gray-600 uppercase tracking-wider border-r border-gray-200 w-[200px]">Employee</th>
                  <th className="p-3 text-[11px] font-bold text-gray-600 uppercase tracking-wider border-r border-gray-200 w-[140px]">Category</th>
                  <th className="p-3 text-[11px] font-bold text-gray-600 uppercase tracking-wider border-r border-gray-200 w-[100px]">Amount</th>
                  <th className="p-3 text-[11px] font-bold text-gray-600 uppercase tracking-wider border-r border-gray-200">Remarks</th>
                  <th className="p-3 text-[11px] font-bold text-gray-600 uppercase tracking-wider border-r border-gray-200">Project</th>
                  <th className="p-3 w-[50px]"></th>
                </tr>
              </thead>
              <tbody>
                {addRows.map((row, idx) => (
                  <tr key={row.id} className={`border-b border-gray-100 transition-colors ${
                    activeModule === 'Add Advance' 
                      ? 'hover:bg-amber-100/30' 
                      : 'hover:bg-blue-100/30'
                  } ${idx % 2 === 0 ? 'bg-white/80' : 'bg-gray-50/30'}`}>
                    <td className="p-2 border-r border-gray-100">
                      <input type="date" value={row.date} onChange={e => handleRowChange(row.id, 'date', e.target.value)} className="w-full h-[34px] border border-gray-300 rounded px-2 text-[12px] outline-none focus:border-indigo-500 bg-white/90" />
                    </td>
                    <td className="p-2 border-r border-gray-100">
                      <select 
                        value={row.employeeId} 
                        onChange={e => handleRowChange(row.id, 'employeeId', e.target.value)} 
                        disabled={!canSelectAll}
                        className={`w-full h-[34px] border border-gray-300 rounded px-2 text-[12px] outline-none focus:border-indigo-500 bg-white/90 ${!canSelectAll ? 'opacity-70 cursor-not-allowed' : ''}`}
                      >
                        <option value="">Select Employee...</option>
                        {canSelectAll ? (
                          employees.map(e => <option key={e.id} value={e.id}>{e.name}</option>)
                        ) : (
                          employees.filter(e => e.email === user.email || e.id === user.uid).map(e => (
                            <option key={e.id} value={e.id}>{e.name}</option>
                          ))
                        )}
                      </select>
                    </td>
                    <td className="p-2 border-r border-gray-100">
                      <input list="categories-list" value={row.category} onChange={e => handleRowChange(row.id, 'category', e.target.value)} className="no-arrow w-full h-[34px] border border-gray-300 rounded px-2 text-[11px] outline-none focus:border-indigo-500 bg-white/90" placeholder="Type category..." />
                    </td>
                    <td className="p-2 border-r border-gray-100">
                      <input type="number" value={row.amount} onChange={e => handleRowChange(row.id, 'amount', e.target.value)} className="w-full h-[34px] border border-gray-300 rounded px-2 text-[12px] outline-none focus:border-indigo-500 bg-white/90" placeholder="0.00" />
                    </td>
                    <td className="p-2 border-r border-gray-100">
                      <input type="text" value={row.reason} onChange={e => handleRowChange(row.id, 'reason', e.target.value)} className="w-full h-[34px] border border-gray-300 rounded px-2 text-[12px] outline-none focus:border-indigo-500 bg-white/90" placeholder="Remarks..." />
                    </td>
                    <td className="p-2 border-r border-gray-100">
                      <input type="text" value={row.project} onChange={e => handleRowChange(row.id, 'project', e.target.value)} className="w-full h-[34px] border border-gray-300 rounded px-2 text-[12px] outline-none focus:border-indigo-500 bg-white/90" placeholder="Project..." />
                    </td>
                    <td className="p-2 text-center">
                      <button onClick={() => setAddRows(addRows.filter(r => r.id !== row.id))} className="text-gray-400 hover:text-red-500 active:text-red-700 p-1 transition-colors">
                        <Trash2 size={16} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Reports Module */}
      {activeModule === 'Reports' && (
        <div className="space-y-6">
          {/* Enhanced Filter Bar */}
          <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-6 items-end">
              {/* Month Navigation */}
              <div className="space-y-2">
                <label className="text-[10px] font-black uppercase text-gray-400 tracking-widest flex items-center gap-1">
                  <Calendar size={12} /> Select Month
                </label>
                <div className="flex items-center bg-gray-50 rounded-lg p-1 border border-gray-200">
                  <button onClick={() => handleMonthChange(-1)} className="p-1.5 hover:bg-white hover:shadow-sm rounded-md text-gray-500 transition-all">
                    <ChevronLeft size={16} />
                  </button>
                  <div className="flex-1 text-center font-bold text-gray-700 text-sm">
                    {(() => {
                      const [ry, rm] = reportMonth.split('-').map(Number)
                      return new Date(ry, rm - 1).toLocaleString('default', { month: 'short', year: 'numeric' })
                    })()}
                  </div>
                  <button onClick={() => handleMonthChange(1)} className="p-1.5 hover:bg-white hover:shadow-sm rounded-md text-gray-500 transition-all">
                    <ChevronRight size={16} />
                  </button>
                </div>
              </div>

              {/* Name Filter */}
              <div className="space-y-2">
                <label className="text-[10px] font-black uppercase text-gray-400 tracking-widest flex items-center gap-1">
                  <Search size={12} /> Search Name
                </label>
                <input 
                  type="text" 
                  placeholder="Employee name..." 
                  value={reportFilterName}
                  onChange={e => setReportFilterName(e.target.value)}
                  className="w-full h-10 border border-gray-200 rounded-lg px-3 text-sm font-medium focus:ring-2 focus:ring-indigo-500 outline-none bg-gray-50/50"
                />
              </div>

              {/* Category Filter */}
              <div className="space-y-2">
                <label className="text-[10px] font-black uppercase text-gray-400 tracking-widest flex items-center gap-1">
                  <Filter size={12} /> Category
                </label>
                <input 
                  list="categories-list"
                  placeholder="All categories..." 
                  value={reportFilterCategory}
                  onChange={e => setReportFilterCategory(e.target.value)}
                  className="w-full h-10 border border-gray-200 rounded-lg px-3 text-sm font-medium focus:ring-2 focus:ring-indigo-500 outline-none bg-gray-50/50"
                />
              </div>

              {/* Actions */}
              <div className="flex gap-2">
                <button 
                  onClick={applyReportFilters}
                  className="flex-1 h-10 bg-indigo-600 text-white font-black rounded-lg text-[11px] uppercase tracking-widest shadow-md hover:bg-indigo-700 active:bg-indigo-800 transition-all flex items-center justify-center gap-2"
                >
                  <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
                  Apply
                </button>
                <button 
                  onClick={exportPDF}
                  disabled={!reportApplied || filteredEntries.length === 0}
                  className="h-10 px-4 bg-emerald-600 text-white font-black rounded-lg text-[11px] uppercase tracking-widest shadow-md hover:bg-emerald-700 active:bg-emerald-800 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center"
                  title="Export to PDF"
                >
                  <FileDown size={16} />
                </button>
              </div>
            </div>
          </div>
          
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Advances Panel */}
            <div className="bg-amber-50/50 rounded-[12px] border border-amber-200 overflow-hidden shadow-sm">
              <div className="p-4 bg-amber-100/50 border-b border-amber-200 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <h3 className="font-black text-amber-900 uppercase tracking-widest text-[13px]">Advances</h3>
                  {reportApplied && <span className="text-[10px] font-bold text-amber-600 bg-white px-2 py-0.5 rounded border border-amber-100">Filtered</span>}
                </div>
                <span className="bg-white px-3 py-1 rounded-full text-[11px] font-bold text-amber-700 shadow-sm border border-amber-100">
                  {reportApplied ? advForReport.length : advances.length} Records
                </span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-amber-50/80 border-b border-amber-100">
                      <th className="p-3 text-[11px] font-bold text-gray-600 uppercase tracking-wider">Date</th>
                      <th className="p-3 text-[11px] font-bold text-gray-600 uppercase tracking-wider">Amount</th>
                      <th className="p-3 text-[11px] font-bold text-gray-600 uppercase tracking-wider">Status</th>
                      <th className="p-3 w-[70px]"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {(reportApplied ? advForReport : advances).length === 0 ? (
                      <tr><td colSpan={4} className="text-center py-12 text-gray-400 text-sm italic">No records found for this criteria</td></tr>
                    ) : (reportApplied ? advForReport : advances).map(a => (
                      <tr key={a.id} className="border-b border-amber-100 hover:bg-amber-100/40 transition-colors group">
                        <td className="p-3">
                          <div className="flex flex-col">
                            <span className="text-[12px] text-gray-500">{a.date}</span>
                            <span className="text-[11px] font-bold text-gray-800">{a.employeeName}</span>
                          </div>
                        </td>
                        <td className="p-3 text-[13px] font-bold text-gray-900">{formatINR(a.amount)}</td>
                        <td className="p-3">
                          <span className={`text-[9px] font-black uppercase px-2 py-0.5 rounded ${
                            a.status === 'Approved' ? 'bg-emerald-100 text-emerald-700' : 
                            a.status === 'Rejected' ? 'bg-rose-100 text-rose-700' : 'bg-gray-100 text-gray-600'
                          }`}>{a.status}</span>
                        </td>
                        <td className="p-3 flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button onClick={() => handleEdit(a)} className="text-gray-400 hover:text-blue-600 p-1">
                            <Edit2 size={14} />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Expenses Panel */}
            <div className="bg-blue-50/50 rounded-[12px] border border-blue-200 overflow-hidden shadow-sm">
              <div className="p-4 bg-blue-100/50 border-b border-blue-200 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <h3 className="font-black text-blue-900 uppercase tracking-widest text-[13px]">Expenses</h3>
                  {reportApplied && <span className="text-[10px] font-bold text-blue-600 bg-white px-2 py-0.5 rounded border border-blue-100">Filtered</span>}
                </div>
                <span className="bg-white px-3 py-1 rounded-full text-[11px] font-bold text-blue-700 shadow-sm border border-blue-100">
                  {reportApplied ? expForReport.length : expenses.length} Records
                </span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-blue-50/80 border-b border-blue-100">
                      <th className="p-3 text-[11px] font-bold text-gray-600 uppercase tracking-wider">Date</th>
                      <th className="p-3 text-[11px] font-bold text-gray-600 uppercase tracking-wider">Category</th>
                      <th className="p-3 text-[11px] font-bold text-gray-600 uppercase tracking-wider">Amount</th>
                      <th className="p-3 w-[70px]"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {(reportApplied ? expForReport : expenses).length === 0 ? (
                      <tr><td colSpan={4} className="text-center py-12 text-gray-400 text-sm italic">No records found for this criteria</td></tr>
                    ) : (reportApplied ? expForReport : expenses).map(e => (
                      <tr key={e.id} className="border-b border-blue-100 hover:bg-blue-100/40 transition-colors group">
                        <td className="p-3">
                          <div className="flex flex-col">
                            <span className="text-[12px] text-gray-500">{e.date}</span>
                            <span className="text-[11px] font-bold text-gray-800">{e.employeeName}</span>
                          </div>
                        </td>
                        <td className="p-3 text-[12px] font-bold text-gray-700">{e.category}</td>
                        <td className="p-3 text-[13px] font-bold text-gray-900">{formatINR(e.amount)}</td>
                        <td className="p-3 flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button onClick={() => handleEdit(e)} className="text-gray-400 hover:text-blue-600 p-1">
                            <Edit2 size={14} />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Summary */}
      {activeModule === 'Summary' && (
        <div className="space-y-6">
          {loading ? (
            <div className="flex justify-center py-16">
              <Spinner />
            </div>
          ) : (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="bg-gradient-to-br from-amber-50 to-white rounded-xl border border-amber-100 p-5 shadow-sm">
                  <div className="flex items-center gap-2 text-amber-800/80 mb-2">
                    <PieChart size={18} />
                    <span className="text-[11px] font-black uppercase tracking-widest">Advances</span>
                  </div>
                  <p className="text-2xl font-black text-amber-900">{formatINR(summary.advSum)}</p>
                  <p className="text-[11px] text-amber-700/70 font-bold mt-1">{summary.advCount} records</p>
                </div>
                <div className="bg-gradient-to-br from-blue-50 to-white rounded-xl border border-blue-100 p-5 shadow-sm">
                  <div className="flex items-center gap-2 text-blue-800/80 mb-2">
                    <PieChart size={18} />
                    <span className="text-[11px] font-black uppercase tracking-widest">Expenses</span>
                  </div>
                  <p className="text-2xl font-black text-blue-900">{formatINR(summary.expSum)}</p>
                  <p className="text-[11px] text-blue-700/70 font-bold mt-1">{summary.expCount} records</p>
                </div>
                <div className="bg-gradient-to-br from-violet-50 to-white rounded-xl border border-violet-100 p-5 shadow-sm">
                  <div className="flex items-center gap-2 text-violet-800/80 mb-2">
                    <Clock size={18} />
                    <span className="text-[11px] font-black uppercase tracking-widest">Awaiting payment</span>
                  </div>
                  <p className="text-2xl font-black text-violet-900">{formatINR(summary.awaitingPaymentSum)}</p>
                  <p className="text-[11px] text-violet-700/70 font-bold mt-1">{summary.awaitingPaymentCount} in queue</p>
                </div>
                <div className="bg-gradient-to-br from-emerald-50 to-white rounded-xl border border-emerald-100 p-5 shadow-sm">
                  <div className="flex items-center gap-2 text-emerald-800/80 mb-2">
                    <CheckCircle2 size={18} />
                    <span className="text-[11px] font-black uppercase tracking-widest">Paid out</span>
                  </div>
                  <p className="text-2xl font-black text-emerald-900">{formatINR(summary.paidSum)}</p>
                  <p className="text-[11px] text-emerald-700/70 font-bold mt-1">{summary.paidCount} settled</p>
                </div>
              </div>

              <div className="bg-white rounded-[12px] border border-gray-200 shadow-sm overflow-hidden">
                <div className="px-5 py-4 border-b border-gray-100 bg-[#f8fafc]">
                  <h3 className="text-sm font-black text-gray-800 uppercase tracking-widest">By request status</h3>
                  <p className="text-[11px] text-gray-500 mt-0.5">Counts and amounts across all advance & expense entries</p>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse min-w-[480px]">
                    <thead>
                      <tr className="bg-gray-50 border-b border-gray-200">
                        <th className="p-3 text-[11px] font-bold text-gray-600 uppercase tracking-wider">Status</th>
                        <th className="p-3 text-[11px] font-bold text-gray-600 uppercase tracking-wider text-right">Count</th>
                        <th className="p-3 text-[11px] font-bold text-gray-600 uppercase tracking-wider text-right">Total amount</th>
                      </tr>
                    </thead>
                    <tbody>
                      {Object.keys(summary.byStatus).length === 0 ? (
                        <tr>
                          <td colSpan={3} className="p-8 text-center text-gray-400 text-sm">
                            No entries yet
                          </td>
                        </tr>
                      ) : (
                        Object.entries(summary.byStatus)
                          .sort(([a], [b]) => a.localeCompare(b))
                          .map(([st, { count, sum }]) => (
                            <tr key={st} className="border-b border-gray-100 hover:bg-gray-50/80">
                              <td className="p-3">
                                <span
                                  className={`inline-flex px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-widest ${
                                    st === 'Approved'
                                      ? 'bg-emerald-50 text-emerald-700'
                                      : st === 'Rejected'
                                        ? 'bg-rose-50 text-rose-700'
                                        : st === 'Hold'
                                          ? 'bg-gray-100 text-gray-600'
                                          : st === 'Partial'
                                            ? 'bg-blue-50 text-blue-700'
                                            : 'bg-amber-50 text-amber-700'
                                  }`}
                                >
                                  {st}
                                </span>
                              </td>
                              <td className="p-3 text-right text-[13px] font-bold text-gray-800">{count}</td>
                              <td className="p-3 text-right text-[13px] font-black text-gray-900">{formatINR(sum)}</td>
                            </tr>
                          ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )}
        </div>
      )}

      {/* Escalation — items waiting on HR, MD, or hold */}
      {activeModule === 'Escalation' && (
        <div className="space-y-6">
          {loading ? (
            <div className="flex justify-center py-16">
              <Spinner />
            </div>
          ) : (
            <>
              <p className="text-[13px] text-gray-600 max-w-2xl">
                Requests that still need action in the approval chain. Use{' '}
                <span className="font-bold text-gray-800">Approvals</span> to resolve them.
              </p>

              {[
                {
                  key: 'needsHr',
                  title: 'Awaiting HR',
                  subtitle: 'Not yet submitted to MD',
                  rows: escalation.needsHr,
                  accent: 'border-l-4 border-l-indigo-500 bg-indigo-50/40'
                },
                {
                  key: 'needsMd',
                  title: 'Awaiting MD',
                  subtitle: 'HR approved — MD decision pending',
                  rows: escalation.needsMd,
                  accent: 'border-l-4 border-l-amber-500 bg-amber-50/30'
                },
                {
                  key: 'onHold',
                  title: 'On hold',
                  subtitle: 'Paused pending clarification',
                  rows: escalation.onHold,
                  accent: 'border-l-4 border-l-gray-400 bg-gray-50/80'
                }
              ].map((block) => (
                <div
                  key={block.key}
                  className={`rounded-[12px] border border-gray-200 shadow-sm overflow-hidden ${block.accent}`}
                >
                  <div className="px-5 py-4 border-b border-gray-200/80 bg-white/60 flex items-start justify-between gap-4">
                    <div className="flex items-start gap-3">
                      <AlertTriangle className="text-amber-600 shrink-0 mt-0.5" size={20} />
                      <div>
                        <h3 className="text-sm font-black text-gray-900 uppercase tracking-widest">{block.title}</h3>
                        <p className="text-[11px] text-gray-500 font-medium mt-0.5">{block.subtitle}</p>
                      </div>
                    </div>
                    <span className="text-[11px] font-black text-gray-600 uppercase tracking-widest bg-white px-3 py-1 rounded-full border border-gray-200">
                      {block.rows.length}
                    </span>
                  </div>
                  <div className="bg-white overflow-x-auto">
                    {block.rows.length === 0 ? (
                      <p className="text-center text-gray-400 text-sm py-10">None right now</p>
                    ) : (
                      <table className="w-full text-left border-collapse min-w-[640px]">
                        <thead>
                          <tr className="bg-gray-50 border-b border-gray-200">
                            <th className="p-3 text-[11px] font-bold text-gray-600 uppercase tracking-wider">Date</th>
                            <th className="p-3 text-[11px] font-bold text-gray-600 uppercase tracking-wider">Type</th>
                            <th className="p-3 text-[11px] font-bold text-gray-600 uppercase tracking-wider">Employee</th>
                            <th className="p-3 text-[11px] font-bold text-gray-600 uppercase tracking-wider text-right">Amount</th>
                            <th className="p-3 text-[11px] font-bold text-gray-600 uppercase tracking-wider">HR</th>
                            <th className="p-3 text-[11px] font-bold text-gray-600 uppercase tracking-wider">MD</th>
                          </tr>
                        </thead>
                        <tbody>
                          {block.rows.map((row) => (
                            <tr key={row.id} className="border-b border-gray-100 hover:bg-gray-50/80">
                              <td className="p-3 text-[12px] text-gray-600">{row.date || '—'}</td>
                              <td className="p-3">
                                <span
                                  className={`text-[10px] font-black uppercase tracking-widest px-2 py-0.5 rounded-md ${
                                    row.type === 'Advance' ? 'bg-amber-100 text-amber-800' : 'bg-blue-100 text-blue-800'
                                  }`}
                                >
                                  {row.type || '—'}
                                </span>
                              </td>
                              <td className="p-3 text-[12px] font-bold text-gray-800">{row.employeeName || '—'}</td>
                              <td className="p-3 text-right text-[13px] font-black text-gray-900">{formatINR(effectiveAmount(row))}</td>
                              <td className="p-3 text-[11px] font-bold text-gray-600">{row.hrApproval || 'Pending'}</td>
                              <td className="p-3 text-[11px] font-bold text-gray-600">{row.mdApproval || 'Pending'}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                  </div>
                </div>
              ))}
            </>
          )}
        </div>
      )}
    </div>
  )
}