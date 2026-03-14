import { useState, useEffect } from 'react'
import { useAuth } from '../../hooks/useAuth'
import { useEmployees } from '../../hooks/useEmployees'
import { db } from '../../lib/firebase'
import { collection, addDoc, query, getDocs, serverTimestamp, orderBy, deleteDoc, doc, getDoc, updateDoc } from 'firebase/firestore'
import { Wallet, Plus, Trash2, FileDown, Eye, Edit2 } from 'lucide-react'
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
  
  const [addRows, setAddRows] = useState([
    { id: Date.now(), date: new Date().toISOString().split('T')[0], employeeId: '', category: '', amount: '', reason: '', project: '' }
  ])

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

  const handleAddRow = () => {
    setAddRows([...addRows, { id: Date.now(), date: new Date().toISOString().split('T')[0], employeeId: '', category: '', amount: '', reason: '', project: '' }])
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
        const type = row.category.toLowerCase().includes('advance') ? 'Advance' : 'Expense'
        
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
      setAddRows([{ id: Date.now(), date: new Date().toISOString().split('T')[0], employeeId: '', category: '', amount: '', reason: '', project: '' }])
      await fetchEntries()
      // Enter into report split section
      setActiveModule('Reports')
    } catch (err) {
      alert('Failed to save')
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
      const type = editForm.category.toLowerCase().includes('advance') ? 'Advance' : 'Expense'
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
                  <th className="p-3 text-[11px] font-bold text-gray-600 uppercase tracking-wider border-r border-gray-200 w-[120px]">Date</th>
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
                      <select value={row.employeeId} onChange={e => handleRowChange(row.id, 'employeeId', e.target.value)} className="w-full h-[34px] border border-gray-300 rounded px-2 text-[12px] outline-none focus:border-indigo-500 bg-white">
                        <option value="">Select Employee...</option>
                        {employees.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
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

      {/* Placeholders for other modules */}
      {(activeModule === 'Escalation' || activeModule === 'Summary') && (
        <div className="bg-white rounded-[12px] border border-gray-100 overflow-hidden shadow-sm p-12 text-center text-gray-400">
          <p className="text-sm font-medium uppercase tracking-widest">{activeModule} - Coming Soon</p>
        </div>
      )}
    </div>
  )
}