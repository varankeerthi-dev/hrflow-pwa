import { useState, useEffect } from 'react'
import { useAuth } from '../../hooks/useAuth'
import { useEmployees } from '../../hooks/useEmployees'
import { db } from '../../lib/firebase'
import { collection, addDoc, query, getDocs, serverTimestamp, orderBy, deleteDoc, doc, getDoc } from 'firebase/firestore'
import { Wallet, Plus, Trash2, FileDown, Eye } from 'lucide-react'
import Spinner from '../ui/Spinner'
import { formatINR } from '../../lib/salaryUtils'
import jsPDF from 'jspdf'
import 'jspdf-autotable'

export default function AdvanceExpenseTab() {
  const { user } = useAuth()
  const { employees } = useEmployees(user?.orgId)
  const [loading, setLoading] = useState(false)
  const [entries, setEntries] = useState([])
  
  const [isAddingMode, setIsAddingMode] = useState(false)
  const [isSplitScreen, setIsSplitScreen] = useState(false)
  const [categories, setCategories] = useState(['Salary Advance', 'Travel', 'Medical'])
  
  const [addRows, setAddRows] = useState([
    { id: Date.now(), date: new Date().toISOString().split('T')[0], employeeId: '', category: '', amount: '', reason: '', project: '', approvedBy: '' }
  ])

  const [submitting, setSubmitting] = useState(false)

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
    setAddRows([...addRows, { id: Date.now(), date: new Date().toISOString().split('T')[0], employeeId: '', category: '', amount: '', reason: '', project: '', approvedBy: '' }])
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
          approvedBy: row.approvedBy || '',
          status: 'Pending',
          createdAt: serverTimestamp()
        })
      }
      setIsAddingMode(false)
      setIsSplitScreen(true)
      setAddRows([{ id: Date.now(), date: new Date().toISOString().split('T')[0], employeeId: '', category: '', amount: '', reason: '', project: '', approvedBy: '' }])
      fetchEntries()
    } catch (err) {
      alert('Failed to save')
    } finally {
      setSubmitting(false)
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

      {/* Header Controls Card */}
      <div className="bg-white p-6 rounded-[12px] shadow-sm flex justify-between items-center border border-gray-100">
        <div className="flex items-center gap-4">
          <button 
            onClick={() => { setIsSplitScreen(true); setIsAddingMode(false); }}
            className="h-[40px] px-6 bg-white border border-gray-200 text-gray-700 font-bold rounded-lg text-[13px] flex items-center gap-2 shadow-sm hover:bg-gray-50 transition-all uppercase tracking-widest"
          >
            <Eye size={16} /> Show
          </button>
          {isSplitScreen && !isAddingMode && (
            <button 
              onClick={exportPDF}
              className="h-[40px] px-6 bg-red-50 text-red-600 font-bold rounded-lg text-[13px] flex items-center gap-2 shadow-sm hover:bg-red-100 transition-all uppercase tracking-widest"
            >
              <FileDown size={16} /> Export PDF
            </button>
          )}
        </div>
        <div className="flex gap-2">
          {!isAddingMode && (
            <button 
              onClick={() => { setIsAddingMode(true); setIsSplitScreen(false); }}
              className="h-[40px] px-6 bg-indigo-600 text-white font-bold rounded-lg text-[13px] flex items-center gap-2 shadow-lg hover:bg-indigo-700 transition-all uppercase tracking-widest"
            >
              <Plus size={16} strokeWidth={3} /> Add Expense
            </button>
          )}
        </div>
      </div>

      {isAddingMode && (
        <div className="bg-white rounded-[12px] border border-gray-100 overflow-hidden shadow-sm p-6">
          <div className="flex justify-end items-center gap-3 mb-4">
            <button onClick={handleSelfExpense} className="h-[36px] px-4 bg-gray-100 text-gray-700 font-bold rounded-lg text-[12px] uppercase tracking-widest hover:bg-gray-200 transition-all">
              Self Expense
            </button>
            <button onClick={handleAddRow} className="h-[36px] px-4 bg-teal-50 text-teal-600 font-bold rounded-lg text-[12px] uppercase tracking-widest hover:bg-teal-100 transition-all">
              + Add Row
            </button>
            <button onClick={handleSubmitAll} disabled={submitting} className="h-[36px] px-6 bg-indigo-600 text-white font-bold rounded-lg text-[12px] flex items-center gap-2 shadow-md hover:bg-indigo-700 transition-all uppercase tracking-widest disabled:opacity-50">
              {submitting ? <Spinner size="w-4 h-4" color="text-white" /> : 'Submit All'}
            </button>
            <button onClick={() => setIsAddingMode(false)} className="h-[36px] px-4 bg-red-50 text-red-600 font-bold rounded-lg text-[12px] uppercase tracking-widest hover:bg-red-100 transition-all">
              Cancel
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse min-w-[800px]">
              <thead>
                <tr className="h-[42px] bg-[#f9fafb]">
                  <th className="px-[12px] text-[11px] font-semibold text-[#6b7280] uppercase tracking-wider">Date</th>
                  <th className="px-[12px] text-[11px] font-semibold text-[#6b7280] uppercase tracking-wider">Employee</th>
                  <th className="px-[12px] text-[11px] font-semibold text-[#6b7280] uppercase tracking-wider">Category</th>
                  <th className="px-[12px] text-[11px] font-semibold text-[#6b7280] uppercase tracking-wider">Amount</th>
                  <th className="px-[12px] text-[11px] font-semibold text-[#6b7280] uppercase tracking-wider">Remarks</th>
                  <th className="px-[12px] text-[11px] font-semibold text-[#6b7280] uppercase tracking-wider">Project</th>
                  <th className="px-[12px] text-[11px] font-semibold text-[#6b7280] uppercase tracking-wider">Approved By</th>
                  <th className="px-[12px] w-[40px]"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#f1f5f9]">
                {addRows.map((row) => (
                  <tr key={row.id} className="h-[52px]">
                    <td className="px-[12px]">
                      <input type="date" value={row.date} onChange={e => handleRowChange(row.id, 'date', e.target.value)} className="w-full h-[36px] border border-gray-200 rounded px-2 text-[12px] outline-none focus:ring-1 focus:ring-indigo-500" />
                    </td>
                    <td className="px-[12px]">
                      <select value={row.employeeId} onChange={e => handleRowChange(row.id, 'employeeId', e.target.value)} className="w-full h-[36px] border border-gray-200 rounded px-2 text-[12px] outline-none focus:ring-1 focus:ring-indigo-500">
                        <option value="">Select...</option>
                        {employees.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
                      </select>
                    </td>
                    <td className="px-[12px]">
                      <input list="categories-list" value={row.category} onChange={e => handleRowChange(row.id, 'category', e.target.value)} className="no-arrow w-full h-[36px] border border-gray-200 rounded px-2 text-[12px] outline-none focus:ring-1 focus:ring-indigo-500" placeholder="Type category..." />
                    </td>
                    <td className="px-[12px]">
                      <input type="number" value={row.amount} onChange={e => handleRowChange(row.id, 'amount', e.target.value)} className="w-full h-[36px] border border-gray-200 rounded px-2 text-[12px] outline-none focus:ring-1 focus:ring-indigo-500" placeholder="0.00" />
                    </td>
                    <td className="px-[12px]">
                      <input type="text" value={row.reason} onChange={e => handleRowChange(row.id, 'reason', e.target.value)} className="w-full h-[36px] border border-gray-200 rounded px-2 text-[12px] outline-none focus:ring-1 focus:ring-indigo-500" placeholder="Remarks..." />
                    </td>
                    <td className="px-[12px]">
                      <input type="text" value={row.project} onChange={e => handleRowChange(row.id, 'project', e.target.value)} className="w-full h-[36px] border border-gray-200 rounded px-2 text-[12px] outline-none focus:ring-1 focus:ring-indigo-500" placeholder="Project..." />
                    </td>
                    <td className="px-[12px]">
                      <input type="text" value={row.approvedBy} onChange={e => handleRowChange(row.id, 'approvedBy', e.target.value)} className="w-full h-[36px] border border-gray-200 rounded px-2 text-[12px] outline-none focus:ring-1 focus:ring-indigo-500" placeholder="Approved by..." />
                    </td>
                    <td className="px-[12px]">
                      <button onClick={() => setAddRows(addRows.filter(r => r.id !== row.id))} className="text-gray-400 hover:text-red-500">
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

      {/* Main Content Area */}
      {!isAddingMode && isSplitScreen ? (
        <div className="grid grid-cols-2 gap-6">
          {/* Advances Panel */}
          <div className="bg-white rounded-[12px] border border-gray-100 overflow-hidden shadow-sm">
            <div className="p-4 bg-amber-50 border-b border-amber-100 flex items-center justify-between">
              <h3 className="font-black text-amber-800 uppercase tracking-widest text-[13px]">Advances</h3>
              <span className="bg-white px-3 py-1 rounded-full text-[11px] font-bold text-amber-600 shadow-sm">{advances.length} Records</span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="h-[42px] bg-[#f9fafb]">
                    <th className="px-[16px] text-[11px] font-semibold text-[#6b7280] uppercase tracking-wider">Date</th>
                    <th className="px-[16px] text-[11px] font-semibold text-[#6b7280] uppercase tracking-wider">Amount</th>
                    <th className="px-[16px] text-[11px] font-semibold text-[#6b7280] uppercase tracking-wider">Remarks</th>
                    <th className="px-[16px] text-[11px] font-semibold text-[#6b7280] uppercase tracking-wider">Ref</th>
                    <th className="px-[16px] w-[40px]"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#f1f5f9]">
                  {loading ? (
                    <tr><td colSpan={5} className="text-center py-8"><Spinner /></td></tr>
                  ) : advances.length === 0 ? (
                    <tr><td colSpan={5} className="text-center py-8 text-gray-400 text-sm">No advances found</td></tr>
                  ) : advances.map(a => (
                    <tr key={a.id} className="h-[48px] hover:bg-[#f8fafc] group">
                      <td className="px-[16px]">
                        <div className="flex flex-col">
                          <span className="text-[12px] text-gray-500">{a.date}</span>
                          <span className="text-[10px] font-bold text-gray-700">{a.employeeName}</span>
                        </div>
                      </td>
                      <td className="px-[16px] text-[13px] font-bold text-gray-900">{formatINR(a.amount)}</td>
                      <td className="px-[16px] text-[12px] text-gray-600">{a.reason || '-'}</td>
                      <td className="px-[16px] text-[11px] text-gray-400 font-mono">{a.id.slice(-6).toUpperCase()}</td>
                      <td className="px-[16px]">
                        <button onClick={async () => { if(confirm('Permanently delete this entry?')) { await deleteDoc(doc(db, 'organisations', user.orgId, 'advances_expenses', a.id)); fetchEntries(); } }} className="p-1.5 text-gray-300 hover:text-red-600 hover:bg-red-50 rounded transition-all opacity-0 group-hover:opacity-100">
                          <Trash2 size={14} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Expenses Panel */}
          <div className="bg-white rounded-[12px] border border-gray-100 overflow-hidden shadow-sm">
            <div className="p-4 bg-blue-50 border-b border-blue-100 flex items-center justify-between">
              <h3 className="font-black text-blue-800 uppercase tracking-widest text-[13px]">Expenses</h3>
              <span className="bg-white px-3 py-1 rounded-full text-[11px] font-bold text-blue-600 shadow-sm">{expenses.length} Records</span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="h-[42px] bg-[#f9fafb]">
                    <th className="px-[16px] text-[11px] font-semibold text-[#6b7280] uppercase tracking-wider">Date</th>
                    <th className="px-[16px] text-[11px] font-semibold text-[#6b7280] uppercase tracking-wider">Category</th>
                    <th className="px-[16px] text-[11px] font-semibold text-[#6b7280] uppercase tracking-wider">Amount</th>
                    <th className="px-[16px] text-[11px] font-semibold text-[#6b7280] uppercase tracking-wider">Reference</th>
                    <th className="px-[16px] w-[40px]"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#f1f5f9]">
                  {loading ? (
                    <tr><td colSpan={5} className="text-center py-8"><Spinner /></td></tr>
                  ) : expenses.length === 0 ? (
                    <tr><td colSpan={5} className="text-center py-8 text-gray-400 text-sm">No expenses found</td></tr>
                  ) : expenses.map(e => (
                    <tr key={e.id} className="h-[48px] hover:bg-[#f8fafc] group">
                      <td className="px-[16px]">
                        <div className="flex flex-col">
                          <span className="text-[12px] text-gray-500">{e.date}</span>
                          <span className="text-[10px] font-bold text-gray-700">{e.employeeName}</span>
                        </div>
                      </td>
                      <td className="px-[16px] text-[12px] font-bold text-gray-700">{e.category}</td>
                      <td className="px-[16px] text-[13px] font-bold text-gray-900">{formatINR(e.amount)}</td>
                      <td className="px-[16px] text-[11px] text-gray-400 font-mono">{e.id.slice(-6).toUpperCase()}</td>
                      <td className="px-[16px]">
                        <button onClick={async () => { if(confirm('Permanently delete this entry?')) { await deleteDoc(doc(db, 'organisations', user.orgId, 'advances_expenses', e.id)); fetchEntries(); } }} className="p-1.5 text-gray-300 hover:text-red-600 hover:bg-red-50 rounded transition-all opacity-0 group-hover:opacity-100">
                          <Trash2 size={14} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      ) : !isAddingMode && !isSplitScreen ? (
        <div className="bg-white rounded-[12px] border border-gray-100 overflow-hidden shadow-sm">
          <div className="p-12 text-center text-gray-400 flex flex-col items-center gap-3">
             <Eye size={48} className="opacity-20" />
             <p className="text-sm font-medium uppercase tracking-widest">Click "Show" to view advances & expenses</p>
          </div>
        </div>
      ) : null}
    </div>
  )
}
