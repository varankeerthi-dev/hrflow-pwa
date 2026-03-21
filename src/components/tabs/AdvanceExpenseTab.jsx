import React, { useState, useEffect, useMemo } from 'react'
import { useAuth } from '../../hooks/useAuth'
import { useEmployees } from '../../hooks/useEmployees'
import { db } from '../../lib/firebase'
import { collection, addDoc, query, getDocs, serverTimestamp, orderBy, deleteDoc, doc, getDoc, updateDoc } from 'firebase/firestore'
import { Trash2, FileDown, Edit2, PieChart, AlertTriangle, Clock, CheckCircle2 } from 'lucide-react'
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

  const exportPDF = () => {
    const doc = new jsPDF()
    doc.setFontSize(16)
    doc.text('Advances & Expenses Report', 14, 15)
    
    doc.setFontSize(12)
    doc.text('Advances', 14, 25)
    doc.autoTable({
      startY: 30,
      head: [['Date', 'Amount', 'Remarks', 'Ref']],
      body: advances.map(a => [a.date, formatINR(a.amount), a.reason, a.id.slice(-6).toUpperCase()]),
      theme: 'grid',
      styles: { fontSize: 8 },
      headStyles: { fillColor: [79, 70, 229] }
    })
    
    const finalY = doc.lastAutoTable.finalY || 30
    
    doc.text('Expenses', 14, finalY + 10)
    doc.autoTable({
      startY: finalY + 15,
      head: [['Date', 'Category', 'Amount', 'Reference']],
      body: expenses.map(e => [e.date, e.category, formatINR(e.amount), e.id.slice(-6).toUpperCase()]),
      theme: 'grid',
      styles: { fontSize: 8 },
      headStyles: { fillColor: [79, 70, 229] }
    })
    
    doc.save('Advances_Expenses_Report.pdf')
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
        {modules.map(mod => (
          <button
            key={mod}
            onClick={() => setActiveModule(mod)}
            className={`whitespace-nowrap px-6 py-3 text-sm font-semibold uppercase tracking-widest transition-all ${
              activeModule === mod 
                ? 'border-b-2 border-indigo-600 text-indigo-600' 
                : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'
            }`}
          >
            {mod}
          </button>
        ))}
      </div>

      {/* Add Expense / Add Advance Module */}
      {(activeModule === 'Add Expense' || activeModule === 'Add Advance') && (
        <div className="bg-white rounded-[12px] border border-gray-200 overflow-hidden shadow-sm">
          {/* Header & Controls */}
          <div className="flex justify-between items-center p-6 border-b border-gray-100 bg-[#f8fafc]">
            <h2 className="text-xl font-black text-gray-800 tracking-tight">{activeModule === 'Add Advance' ? 'Add Advance' : 'Add Expenses'}</h2>
            <div className="flex items-center gap-3">
              <button onClick={handleSelfExpense} className="h-[36px] px-4 bg-white border border-gray-300 text-gray-700 font-bold rounded-lg text-[12px] uppercase tracking-widest shadow-sm hover:bg-gray-50 transition-all">
                Self Expense
              </button>
              <button onClick={handleAddRow} className="h-[36px] px-4 bg-teal-50 border border-teal-100 text-teal-600 font-bold rounded-lg text-[12px] uppercase tracking-widest hover:bg-teal-100 transition-all">
                + Add Row
              </button>
              <button onClick={handleSubmitAll} disabled={submitting} className="h-[36px] px-6 bg-indigo-600 text-white font-bold rounded-lg text-[12px] flex items-center gap-2 shadow-md hover:bg-indigo-700 transition-all uppercase tracking-widest disabled:opacity-50">
                {submitting ? <Spinner size="w-4 h-4" color="text-white" /> : 'Submit All'}
              </button>
            </div>
          </div>

          <div className="overflow-x-auto p-4">
            <table className="w-full text-left border-collapse border border-gray-200 min-w-[900px]">
              <thead>
                <tr className="bg-gray-100 border-b border-gray-200">
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
                  <tr key={row.id} className={`border-b border-gray-100 ${idx % 2 === 0 ? 'bg-white' : 'bg-gray-50/50'}`}>
                    <td className="p-2 border-r border-gray-100">
                      <input type="date" value={row.date} onChange={e => handleRowChange(row.id, 'date', e.target.value)} className="w-full h-[34px] border border-gray-300 rounded px-2 text-[12px] outline-none focus:border-indigo-500 bg-white" />
                    </td>
                    <td className="p-2 border-r border-gray-100">
                      <select 
                        value={row.employeeId} 
                        onChange={e => handleRowChange(row.id, 'employeeId', e.target.value)} 
                        disabled={!canSelectAll}
                        className={`w-full h-[34px] border border-gray-300 rounded px-2 text-[12px] outline-none focus:border-indigo-500 bg-white ${!canSelectAll ? 'opacity-70 cursor-not-allowed' : ''}`}
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
                      <input list="categories-list" value={row.category} onChange={e => handleRowChange(row.id, 'category', e.target.value)} className="no-arrow w-full h-[34px] border border-gray-300 rounded px-2 text-[11px] outline-none focus:border-indigo-500 bg-white" placeholder="Type category..." />
                    </td>
                    <td className="p-2 border-r border-gray-100">
                      <input type="number" value={row.amount} onChange={e => handleRowChange(row.id, 'amount', e.target.value)} className="w-full h-[34px] border border-gray-300 rounded px-2 text-[12px] outline-none focus:border-indigo-500 bg-white" placeholder="0.00" />
                    </td>
                    <td className="p-2 border-r border-gray-100">
                      <input type="text" value={row.reason} onChange={e => handleRowChange(row.id, 'reason', e.target.value)} className="w-full h-[34px] border border-gray-300 rounded px-2 text-[12px] outline-none focus:border-indigo-500 bg-white" placeholder="Remarks..." />
                    </td>
                    <td className="p-2 border-r border-gray-100">
                      <input type="text" value={row.project} onChange={e => handleRowChange(row.id, 'project', e.target.value)} className="w-full h-[34px] border border-gray-300 rounded px-2 text-[12px] outline-none focus:border-indigo-500 bg-white" placeholder="Project..." />
                    </td>
                    <td className="p-2 text-center">
                      <button onClick={() => setAddRows(addRows.filter(r => r.id !== row.id))} className="text-gray-400 hover:text-red-500 p-1">
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
        <div className="space-y-4">
          <div className="flex justify-end">
            <button 
              onClick={exportPDF}
              className="h-[40px] px-6 bg-red-50 text-red-600 font-bold rounded-lg text-[13px] flex items-center gap-2 shadow-sm hover:bg-red-100 transition-all uppercase tracking-widest"
            >
              <FileDown size={16} /> Export PDF
            </button>
          </div>
          
          <div className="grid grid-cols-2 gap-6">
            {/* Advances Panel */}
            <div className="bg-white rounded-[12px] border border-gray-200 overflow-hidden shadow-sm">
              <div className="p-4 bg-amber-50 border-b border-amber-200 flex items-center justify-between">
                <h3 className="font-black text-amber-900 uppercase tracking-widest text-[13px]">Advances</h3>
                <span className="bg-white px-3 py-1 rounded-full text-[11px] font-bold text-amber-700 shadow-sm border border-amber-100">{advances.length} Records</span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-gray-50 border-b border-gray-200">
                      <th className="p-3 text-[11px] font-bold text-gray-600 uppercase tracking-wider">Date</th>
                      <th className="p-3 text-[11px] font-bold text-gray-600 uppercase tracking-wider">Amount</th>
                      <th className="p-3 text-[11px] font-bold text-gray-600 uppercase tracking-wider">Remarks</th>
                      <th className="p-3 text-[11px] font-bold text-gray-600 uppercase tracking-wider">Ref</th>
                      <th className="p-3 w-[70px]"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {loading ? (
                      <tr><td colSpan={5} className="text-center py-8"><Spinner /></td></tr>
                    ) : advances.length === 0 ? (
                      <tr><td colSpan={5} className="text-center py-8 text-gray-400 text-sm">No advances found</td></tr>
                    ) : advances.map(a => (
                      <tr key={a.id} className="border-b border-gray-100 hover:bg-gray-50 group">
                        {editingId === a.id ? (
                          <td colSpan={5} className="p-3">
                            <div className="flex gap-2 items-center">
                              <input type="date" value={editForm.date} onChange={e => setEditForm({...editForm, date: e.target.value})} className="border p-1 text-xs rounded w-24" />
                              <select value={editForm.employeeId} onChange={e => setEditForm({...editForm, employeeId: e.target.value})} className="border p-1 text-xs rounded">
                                {employees.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
                              </select>
                              <input type="number" value={editForm.amount} onChange={e => setEditForm({...editForm, amount: e.target.value})} className="border p-1 text-xs rounded w-20" />
                              <input type="text" value={editForm.reason} onChange={e => setEditForm({...editForm, reason: e.target.value})} className="border p-1 text-xs rounded flex-1" />
                              <button onClick={handleUpdate} className="bg-green-500 text-white px-2 py-1 rounded text-xs">Save</button>
                              <button onClick={() => setEditingId(null)} className="bg-gray-300 text-gray-700 px-2 py-1 rounded text-xs">Cancel</button>
                            </div>
                          </td>
                        ) : (
                          <>
                            <td className="p-3">
                              <div className="flex flex-col">
                                <span className="text-[12px] text-gray-500">{a.date}</span>
                                <span className="text-[11px] font-bold text-gray-800">{a.employeeName}</span>
                              </div>
                            </td>
                            <td className="p-3 text-[13px] font-bold text-gray-900">{formatINR(a.amount)}</td>
                            <td className="p-3 text-[12px] text-gray-600">{a.reason || '-'}</td>
                            <td className="p-3 text-[11px] text-gray-400 font-mono">{a.id.slice(-6).toUpperCase()}</td>
                            <td className="p-3 flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                              <button onClick={() => handleEdit(a)} className="text-gray-400 hover:text-blue-600 p-1">
                                <Edit2 size={14} />
                              </button>
                              <button onClick={async () => { if(confirm('Permanently delete this entry?')) { await deleteDoc(doc(db, 'organisations', user.orgId, 'advances_expenses', a.id)); fetchEntries(); } }} className="text-gray-400 hover:text-red-600 p-1">
                                <Trash2 size={14} />
                              </button>
                            </td>
                          </>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Expenses Panel */}
            <div className="bg-white rounded-[12px] border border-gray-200 overflow-hidden shadow-sm">
              <div className="p-4 bg-blue-50 border-b border-blue-200 flex items-center justify-between">
                <h3 className="font-black text-blue-900 uppercase tracking-widest text-[13px]">Expenses</h3>
                <span className="bg-white px-3 py-1 rounded-full text-[11px] font-bold text-blue-700 shadow-sm border border-blue-100">{expenses.length} Records</span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-gray-50 border-b border-gray-200">
                      <th className="p-3 text-[11px] font-bold text-gray-600 uppercase tracking-wider">Date</th>
                      <th className="p-3 text-[11px] font-bold text-gray-600 uppercase tracking-wider">Category</th>
                      <th className="p-3 text-[11px] font-bold text-gray-600 uppercase tracking-wider">Amount</th>
                      <th className="p-3 text-[11px] font-bold text-gray-600 uppercase tracking-wider">Reference</th>
                      <th className="p-3 w-[70px]"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {loading ? (
                      <tr><td colSpan={5} className="text-center py-8"><Spinner /></td></tr>
                    ) : expenses.length === 0 ? (
                      <tr><td colSpan={5} className="text-center py-8 text-gray-400 text-sm">No expenses found</td></tr>
                    ) : expenses.map(e => (
                      <tr key={e.id} className="border-b border-gray-100 hover:bg-gray-50 group">
                        {editingId === e.id ? (
                          <td colSpan={5} className="p-3">
                            <div className="flex gap-2 items-center">
                              <input type="date" value={editForm.date} onChange={ev => setEditForm({...editForm, date: ev.target.value})} className="border p-1 text-xs rounded w-24" />
                              <select value={editForm.employeeId} onChange={ev => setEditForm({...editForm, employeeId: ev.target.value})} className="border p-1 text-xs rounded">
                                {employees.map(emp => <option key={emp.id} value={emp.id}>{emp.name}</option>)}
                              </select>
                              <input list="categories-list" value={editForm.category} onChange={ev => setEditForm({...editForm, category: ev.target.value})} className="no-arrow border p-1 text-xs rounded w-24" />
                              <input type="number" value={editForm.amount} onChange={ev => setEditForm({...editForm, amount: ev.target.value})} className="border p-1 text-xs rounded w-20" />
                              <button onClick={handleUpdate} className="bg-green-500 text-white px-2 py-1 rounded text-xs">Save</button>
                              <button onClick={() => setEditingId(null)} className="bg-gray-300 text-gray-700 px-2 py-1 rounded text-xs">Cancel</button>
                            </div>
                          </td>
                        ) : (
                          <>
                            <td className="p-3">
                              <div className="flex flex-col">
                                <span className="text-[12px] text-gray-500">{e.date}</span>
                                <span className="text-[11px] font-bold text-gray-800">{e.employeeName}</span>
                              </div>
                            </td>
                            <td className="p-3 text-[12px] font-bold text-gray-700">{e.category}</td>
                            <td className="p-3 text-[13px] font-bold text-gray-900">{formatINR(e.amount)}</td>
                            <td className="p-3 text-[11px] text-gray-400 font-mono">{e.id.slice(-6).toUpperCase()}</td>
                            <td className="p-3 flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                              <button onClick={() => handleEdit(e)} className="text-gray-400 hover:text-blue-600 p-1">
                                <Edit2 size={14} />
                              </button>
                              <button onClick={async () => { if(confirm('Permanently delete this entry?')) { await deleteDoc(doc(db, 'organisations', user.orgId, 'advances_expenses', e.id)); fetchEntries(); } }} className="text-gray-400 hover:text-red-600 p-1">
                                <Trash2 size={14} />
                              </button>
                            </td>
                          </>
                        )}
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