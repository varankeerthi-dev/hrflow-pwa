import React, { useState, useEffect, useMemo, useRef } from 'react'
import { useAuth } from '../../hooks/useAuth'
import { useEmployees } from '../../hooks/useEmployees'
import { db } from '../../lib/firebase'
import { 
  collection, 
  query, 
  where, 
  getDocs, 
  addDoc, 
  setDoc, 
  doc, 
  serverTimestamp, 
  orderBy,
  updateDoc
} from 'firebase/firestore'
import { 
  Banknote, 
  Plus, 
  Trash2, 
  Save, 
  Search, 
  CheckCircle2, 
  XCircle, 
  Clock, 
  Filter, 
  ArrowUpRight,
  ChevronDown,
  LayoutGrid,
  ListChecks,
  History,
  FileText,
  X,
  ArrowRight,
  Minus,
  RotateCcw
} from 'lucide-react'
import Spinner from '../ui/Spinner'
import { formatINR } from '../../lib/salaryUtils'
import { logActivity } from '../../hooks/useActivityLog'
import { isEmployeeActiveStatus } from '../../lib/employeeStatus'
import { useQueryClient } from '@tanstack/react-query'

const TABS = [
  { id: 'bulk', label: 'Bulk Entry', icon: <LayoutGrid size={16} /> },
  { id: 'pending', label: 'Pending Queue', icon: <ListChecks size={16} /> },
  { id: 'ledger', label: 'Financial Ledger', icon: <History size={16} /> }
]

const formatMonthDisplay = (monthStr) => {
  if (!monthStr) return '-';
  const [year, month] = monthStr.split('-');
  const date = new Date(year, parseInt(month) - 1);
  return date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
};

import { 
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { cn } from "@/lib/utils"

const SuperfastModal = ({ isOpen, onClose, employees, month, orgId, userId, userName }) => {
  const [data, setData] = useState({}) 
  const [hiddenEmps, setHiddenEmps] = useState(new Set())
  const [step, setStep] = useState('entry') 
  const [searchTerm, setSearchTerm] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const queryClient = useQueryClient();

  useEffect(() => {
    if (isOpen && step === 'entry') {
      const initial = {}
      employees.forEach(e => {
        initial[e.id] = { advance: '', expense: '', verified: false, name: e.name, empCode: e.empCode, designation: e.designation }
      })
      setData(initial)
      setHiddenEmps(new Set())
      setSearchTerm('')
    }
  }, [isOpen, employees, step])

  const handleUpdate = (empId, field, val) => {
    setData(prev => ({
      ...prev,
      [empId]: { ...prev[empId], [field]: val, verified: true }
    }))
  }

  const clearRow = (empId) => {
    setData(prev => ({
      ...prev,
      [empId]: { ...prev[empId], advance: '', expense: '', verified: true }
    }))
  }

  const removeRow = (empId) => {
    setHiddenEmps(prev => {
      const next = new Set(prev)
      next.add(empId)
      return next
    })
  }

  const toggleVerify = (empId) => {
    setData(prev => ({
      ...prev,
      [empId]: { ...prev[empId], verified: !prev[empId].verified }
    }))
  }

  const filteredEmployees = useMemo(() => {
    return employees.filter(e => !hiddenEmps.has(e.id) && 
      (e.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
       e.empCode.toLowerCase().includes(searchTerm.toLowerCase())))
  }, [employees, hiddenEmps, searchTerm])

  const entriesToCommit = useMemo(() => {
    return Object.entries(data)
      .filter(([id, vals]) => !hiddenEmps.has(id) && (Number(vals.advance) > 0 || Number(vals.expense) > 0))
      .map(([id, vals]) => ({ id, ...vals }))
  }, [data, hiddenEmps])

  const processedCount = useMemo(() => {
    return Object.entries(data).filter(([id, v]) => !hiddenEmps.has(id) && (v.verified || Number(v.advance) > 0 || Number(v.expense) > 0)).length
  }, [data, hiddenEmps])

  const totalEmps = employees.length - hiddenEmps.size
  const skippedCount = totalEmps - processedCount

  const handleCommit = async () => {
    setIsSubmitting(true)
    try {
      const promises = []
      const saveDate = `${month}-01`
      
      entriesToCommit.forEach((vals) => {
        const advAmt = Number(vals.advance) || 0
        const expAmt = Number(vals.expense) || 0

        if (advAmt > 0) {
          promises.push(addDoc(collection(db, 'organisations', orgId, 'advances_expenses'), {
            employeeId: vals.id, employeeName: vals.name, type: 'Advance', amount: advAmt, date: saveDate, isWholesale: true, status: 'Approved', hrApproval: 'Approved', mdApproval: 'Approved', paymentStatus: 'Pending', payoutMethod: 'With Salary', createdAt: serverTimestamp(), createdBy: userId, createdByName: userName, orgId
          }))
        }
        if (expAmt > 0) {
          promises.push(addDoc(collection(db, 'organisations', orgId, 'advances_expenses'), {
            employeeId: vals.id, employeeName: vals.name, type: 'Expense', amount: expAmt, date: saveDate, isWholesale: true, status: 'Approved', hrApproval: 'Approved', mdApproval: 'Approved', paymentStatus: 'Pending', payoutMethod: 'With Salary', createdAt: serverTimestamp(), createdBy: userId, createdByName: userName, orgId
          }))
        }
      })

      await Promise.all(promises)
      await logActivity(orgId, { uid: userId, name: userName }, {
        module: 'Finance', action: 'Superfast Entry', detail: `Processed monthly sync for ${month}`
      })
      
      alert('Monthly sync committed successfully!')
      queryClient.invalidateQueries(['attendanceSummary'])
      onClose()
    } catch (err) {
      alert('Failed to commit: ' + err.message)
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-[95vw] md:max-w-[1200px] w-full max-h-[95vh] flex flex-col p-0 overflow-hidden bg-white border-[#e5e5e5] gap-0 shadow-[0_4px_24px_rgba(0,0,0,0.15)] rounded-none md:rounded-lg">
        <div className="flex items-center justify-between px-5 py-4 border-b border-[#e5e5e5] shrink-0">
          <div className="flex items-center gap-8">
            <h3 className="text-[16px] font-semibold text-[#171717] tracking-tight">Superfast Batch Entry - {formatMonthDisplay(month)}</h3>
            {step === 'entry' && (
              <div className="relative w-72 group">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#525252]" />
                <input 
                  placeholder="Filter staff..." 
                  value={searchTerm} 
                  onChange={(e) => setSearchTerm(e.target.value)} 
                  className="w-full h-8 pl-9 pr-3 bg-white border border-[#d4d4d4] rounded-md text-[14px] text-[#171717] focus:outline-none focus:border-[#171717] transition-all" 
                />
              </div>
            )}
          </div>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-6 mr-4 border-r border-[#e5e5e5] pr-6">
              <div className="flex flex-col items-end">
                <span className="text-[12px] font-semibold text-[#525252]">Sub-Total</span>
                <span className="text-[14px] font-semibold text-[#171717]">{formatINR(Object.entries(data).reduce((s, [id, v]) => !hiddenEmps.has(id) ? s + (Number(v.advance)||0) + (Number(v.expense)||0) : s, 0))}</span>
              </div>
              <div className="flex flex-col items-end">
                <span className="text-[12px] font-semibold text-[#525252]">Progress</span>
                <span className="text-[14px] font-semibold text-[#171717]">{processedCount} / {totalEmps}</span>
              </div>
            </div>
            <button onClick={onClose} className="p-1 text-[#525252] hover:bg-[#f5f5f5] rounded-md transition-colors">
              <X size={20} />
            </button>
          </div>
        </div>

        {step === 'entry' ? (
          <>
            <div className="flex-1 overflow-auto custom-scrollbar">
              <table className="w-full text-left border-collapse">
                <thead className="sticky top-0 bg-white z-10">
                  <tr className="h-10 bg-white border-b border-[#e5e5e5]">
                    <th className="pl-6 pr-4 font-semibold text-[12px] text-[#525252] w-12 text-center">#</th>
                    <th className="px-4 font-semibold text-[12px] text-[#525252]">Staff Member</th>
                    <th className="px-4 font-semibold text-[12px] text-[#525252]">Designation</th>
                    <th className="px-4 font-semibold text-[12px] text-[#525252] w-48">Advance (₹)</th>
                    <th className="px-4 font-semibold text-[12px] text-[#525252] w-48">Expense (₹)</th>
                    <th className="px-6 font-semibold text-[12px] text-[#525252] text-right w-40">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#e5e5e5]">
                  {filteredEmployees.map((emp, idx) => {
                    const vals = data[emp.id] || {}
                    return (
                      <tr key={emp.id} className={cn("group h-12 transition-colors", vals.verified ? "bg-[#f5f5f5]/50" : "hover:bg-[#f5f5f5] bg-white")}>
                        <td className="pl-6 pr-4 text-center text-[12px] text-[#525252] font-mono">{idx + 1}</td>
                        <td className="px-4">
                          <div className="flex flex-col">
                            <span className="text-[14px] font-semibold text-[#171717] capitalize leading-none">{emp.name.toLowerCase()}</span>
                            <span className="text-[11px] text-[#525252] font-medium mt-1 uppercase tracking-tight">{emp.empCode}</span>
                          </div>
                        </td>
                        <td className="px-4"><span className="text-[13px] text-[#525252] font-medium uppercase tracking-tight">{emp.designation || 'N/A'}</span></td>
                        <td className="px-4">
                          <div className="relative group/input">
                            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[13px] font-semibold text-[#d4d4d4] group-focus-within/input:text-[#171717]">₹</span>
                            <input 
                              type="number" 
                              placeholder="0" 
                              value={vals.advance || ''} 
                              onChange={(e) => handleUpdate(emp.id, 'advance', e.target.value)} 
                              className="w-full h-8 pl-7 pr-3 bg-white border border-[#d4d4d4] focus:border-[#171717] rounded-md text-[13px] font-semibold text-[#171717] outline-none transition-all placeholder:text-[#d4d4d4]" 
                            />
                          </div>
                        </td>
                        <td className="px-4">
                          <div className="relative group/input">
                            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[13px] font-semibold text-[#d4d4d4] group-focus-within/input:text-[#171717]">₹</span>
                            <input 
                              type="number" 
                              placeholder="0" 
                              value={vals.expense || ''} 
                              onChange={(e) => handleUpdate(emp.id, 'expense', e.target.value)} 
                              className="w-full h-8 pl-7 pr-3 bg-white border border-[#d4d4d4] focus:border-[#171717] rounded-md text-[13px] font-semibold text-[#171717] outline-none transition-all placeholder:text-[#d4d4d4]" 
                            />
                          </div>
                        </td>
                        <td className="px-6 text-right">
                          <div className="flex justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                            <button onClick={() => clearRow(emp.id)} className="p-1.5 text-[#525252] hover:bg-white rounded-md border border-transparent hover:border-[#d4d4d4] transition-all"><RotateCcw size={14} /></button>
                            <button onClick={() => removeRow(emp.id)} className="p-1.5 text-[#525252] hover:bg-white rounded-md border border-transparent hover:border-[#d4d4d4] transition-all"><Trash2 size={14} /></button>
                            <button onClick={() => toggleVerify(emp.id)} className={cn("p-1.5 rounded-md transition-all border border-transparent", vals.verified ? "text-[#171717] bg-[#f5f5f5] border-[#d4d4d4]" : "text-[#d4d4d4] hover:text-[#171717]")}><CheckCircle2 size={16} /></button>
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
            <div className="px-8 py-4 border-t border-[#e5e5e5] bg-white flex justify-between items-center shrink-0">
              <div className="text-[13px] text-[#525252] font-medium">Use <kbd className="px-1.5 py-0.5 bg-[#f5f5f5] border border-[#d4d4d4] rounded text-[11px] font-bold">Tab</kbd> to navigate rapidly.</div>
              <div className="flex gap-3">
                <button
                  onClick={onClose}
                  className="px-6 py-2 border border-[#d4d4d4] rounded-md bg-white text-[#525252] text-[14px] font-medium hover:bg-[#f5f5f5] transition-all"
                >
                  Cancel
                </button>
                <button 
                  onClick={() => setStep('review')} 
                  className="px-8 py-2 bg-[#171717] hover:bg-[#262626] text-white rounded-md text-[14px] font-medium transition-all flex items-center gap-2"
                >
                  Continue to Review <ArrowRight size={16} />
                </button>
              </div>
            </div>
          </>
        ) : (
          <>
            <div className="flex-1 overflow-auto p-12 bg-white custom-scrollbar">
              <div className="max-w-4xl mx-auto space-y-8">
                <div className="flex flex-col items-center text-center space-y-2">
                  <div className="w-12 h-12 rounded-full bg-[#f5f5f5] flex items-center justify-center text-[#171717] mb-2 border border-[#d4d4d4]"><CheckCircle2 size={24} /></div>
                  <h3 className="text-[18px] font-semibold text-[#171717]">Review Batch Impact</h3>
                  <p className="text-[13px] text-[#525252] font-medium">Ready for database synchronization</p>
                </div>
                {entriesToCommit.length === 0 ? (
                  <div className="py-20 text-center bg-[#f5f5f5] border border-[#d4d4d4] border-dashed rounded-lg flex flex-col items-center"><FileText size={40} className="text-[#d4d4d4] mb-4" /><p className="text-[13px] font-semibold text-[#525252]">No transactional data found</p><button onClick={() => setStep('entry')} className="mt-2 text-[#171717] font-bold text-[13px] hover:underline">Return to editor</button></div>
                ) : (
                  <div className="bg-white border border-[#e5e5e5] rounded-lg overflow-hidden shadow-sm">
                    <table className="w-full text-left">
                      <thead><tr className="h-12 bg-[#f5f5f5] border-b border-[#e5e5e5] text-[12px] font-semibold text-[#525252]"><th className="px-8">Staff Member</th><th className="px-8 text-center">Advance</th><th className="px-8 text-center">Expense</th><th className="px-8 text-right">Net impact</th></tr></thead>
                      <tbody className="divide-y divide-[#e5e5e5]">{entriesToCommit.map(row => (<tr key={row.id} className="h-12 hover:bg-[#f5f5f5]/50 transition-colors"><td className="px-8"><div className="flex items-center gap-3"><div className="w-1.5 h-1.5 rounded-full bg-[#d4d4d4]"></div><div><p className="text-[13px] font-semibold text-[#171717] capitalize">{row.name.toLowerCase()}</p><p className="text-[11px] text-[#525252] font-medium">{row.empCode}</p></div></div></td><td className="px-8 text-center font-mono font-semibold text-[#171717] text-[13px]">{row.advance ? formatINR(row.advance) : '-'}</td><td className="px-8 text-center font-mono font-semibold text-[#171717] text-[13px]">{row.expense ? formatINR(row.expense) : '-'}</td><td className="px-8 text-right font-bold text-[#171717] text-[14px]">{formatINR((Number(row.advance)||0) + (Number(row.expense)||0))}</td></tr>))}</tbody>
                      <tfoot><tr className="bg-[#171717] text-white h-14"><td className="px-8 font-semibold text-[13px]">Total Disbursement impact</td><td colSpan={3} className="px-8 text-right text-xl font-bold">{formatINR(entriesToCommit.reduce((s, r) => s + (Number(r.advance)||0) + (Number(r.expense)||0), 0))}</td></tr></tfoot>
                    </table>
                  </div>
                )}
                {skippedCount > 0 && (<div className="p-4 bg-[#f5f5f5] border border-[#d4d4d4] rounded-lg flex items-center gap-4"><XCircle size={18} className="text-[#525252] shrink-0" /><p className="text-[12px] text-[#171717] font-medium">Warning: {skippedCount} staff members are being skipped in this batch sync.</p></div>)}
              </div>
            </div>
            <div className="px-8 py-4 border-t border-[#e5e5e5] bg-white flex justify-between items-center shrink-0">
              <button onClick={() => setStep('entry')} className="h-10 px-8 text-[14px] font-medium text-[#525252] hover:bg-[#f5f5f5] rounded-md transition-all">Back to Editor</button>
              <button 
                onClick={handleCommit} 
                disabled={isSubmitting || entriesToCommit.length === 0} 
                className="h-11 px-12 bg-[#171717] hover:bg-[#262626] text-white rounded-md text-[14px] font-medium transition-all active:scale-95 disabled:opacity-60 flex items-center gap-2"
              >
                {isSubmitting ? <Spinner size="sm" className="mr-2" /> : <Save size={18} className="mr-2" />}
                Confirm & Post to Ledger
              </button>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}

export default function AccountantTab() {
  const { user } = useAuth()
  const { employees, loading: empLoading } = useEmployees(user?.orgId, true)
  const [activeSubTab, setActiveSubTab] = useState('bulk')
  const [loading, setLoading] = useState(false)
  const [searchQuery, setSearchTerm] = useState('')
  const [entryMode, setEntryMode] = useState('dated') 
  const [isSuperfastOpen, setIsSuperfastOpen] = useState(false)
  const [superfastMonth, setSuperfastMonth] = useState(() => new Date().toISOString().substring(0, 7))

  const [bulkRows, setBulkRows] = useState([
    { id: Date.now(), employeeId: '', type: 'Advance', amount: '', date: new Date().toISOString().split('T')[0], remarks: '' }
  ])

  const addBulkRow = () => {
    const lastRow = bulkRows[bulkRows.length - 1]
    setBulkRows([...bulkRows, { 
      id: Date.now(), 
      employeeId: '', 
      type: lastRow?.type || 'Advance', 
      amount: '', 
      date: lastRow?.date || new Date().toISOString().split('T')[0], 
      remarks: '' 
    }])
  }

  const clearAllRows = () => {
    if (confirm('Clear all entries?')) {
      const initialDate = entryMode === 'monthly' ? new Date().toISOString().substring(0, 7) : new Date().toISOString().split('T')[0]
      setBulkRows([{ id: Date.now(), employeeId: '', type: 'Advance', amount: '', date: initialDate, remarks: '' }])
    }
  }

  const removeBulkRow = (id) => {
    if (bulkRows.length === 1) return
    setBulkRows(bulkRows.filter(row => row.id !== id))
  }

  const updateBulkRow = (id, field, value) => {
    setBulkRows(bulkRows.map(row => row.id === id ? { ...row, [field]: value } : row))
  }

  const handleBulkSubmit = async () => {
    const validRows = bulkRows.filter(r => r.employeeId && r.amount && Number(r.amount) > 0)
    if (validRows.length === 0) return alert('Please fill in employee and amount for at least one row.')
    setLoading(true)
    try {
      const promises = validRows.map(async (row) => {
        const emp = employees.find(e => e.id === row.employeeId)
        const saveDate = entryMode === 'monthly' ? `${row.date}-01` : row.date
        const docData = {
          employeeId: row.employeeId, employeeName: emp?.name || 'Unknown', type: row.type, amount: Number(row.amount), date: saveDate, isWholesale: entryMode === 'monthly', status: 'Approved', hrApproval: 'Approved', mdApproval: 'Approved', paymentStatus: 'Pending', payoutMethod: 'With Salary', createdAt: serverTimestamp(), createdBy: user.uid, createdByName: user.name, orgId: user.orgId
        }
        return addDoc(collection(db, 'organisations', user.orgId, 'advances_expenses'), docData)
      })
      await Promise.all(promises)
      await logActivity(user.orgId, user, { module: 'Finance', action: 'Bulk Entry', detail: `Added ${validRows.length} ${entryMode} transactions` })
      alert(`Successfully committed ${validRows.length} records!`)
      const initialDate = entryMode === 'monthly' ? new Date().toISOString().substring(0, 7) : new Date().toISOString().split('T')[0]
      setBulkRows([{ id: Date.now(), employeeId: '', type: 'Advance', amount: '', date: initialDate, remarks: '' }])
    } catch (err) { alert('Failed to save records') } finally { setLoading(false) }
  }

  const [pendingItems, setPendingItems] = useState([])
  const [isPendingLoading, setIsPendingLoading] = useState(false)
  const fetchPending = async () => {
    if (!user?.orgId) return
    setIsPendingLoading(true)
    try {
      const q = query(collection(db, 'organisations', user.orgId, 'advances_expenses'), where('status', '==', 'Pending'), orderBy('createdAt', 'desc'))
      const snap = await getDocs(q)
      setPendingItems(snap.docs.map(d => ({ id: d.id, ...d.data() })))
    } catch (err) { console.error(err) } finally { setIsPendingLoading(false) }
  }
  useEffect(() => { if (activeSubTab === 'pending') fetchPending() }, [activeSubTab, user?.orgId])

  const handleApprove = async (id) => {
    try { await updateDoc(doc(db, 'organisations', user.orgId, 'advances_expenses', id), { status: 'Approved', hrApproval: 'Approved', financeApproval: 'Approved', approvedAt: serverTimestamp(), approvedBy: user.uid }); setPendingItems(pendingItems.filter(item => item.id !== id)) } catch (err) { alert('Approval failed') }
  }

  return (
    <div className="flex flex-col h-full bg-zinc-50/50 font-inter text-zinc-900">
      <div className="bg-white border-b border-zinc-200 px-6 py-3 shrink-0 shadow-sm">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-6">
            <div className="flex flex-col">
              <span className="text-[10px] font-black uppercase tracking-[0.2em] text-zinc-400">Finance Control</span>
              <h1 className="text-lg font-bold text-zinc-900 tracking-tight font-raleway uppercase">Accountant Desk</h1>
            </div>
            <nav className="flex bg-zinc-100 p-1 rounded-xl gap-1">
              {TABS.map(tab => (
                <button key={tab.id} onClick={() => setActiveSubTab(tab.id)} className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-all duration-200 ${activeSubTab === tab.id ? 'bg-white text-zinc-900 shadow-sm ring-1 ring-zinc-200' : 'text-zinc-500 hover:text-zinc-900 hover:bg-zinc-200/50'}`}>
                  <span className={activeSubTab === tab.id ? 'text-zinc-900' : 'text-zinc-400'}>{tab.icon}</span>
                  <span className="text-[13px] font-bold tracking-tight">{tab.label}</span>
                </button>
              ))}
            </nav>
          </div>
          <div className="text-right flex items-center gap-4">
            <div className="flex flex-col text-right">
              <span className="text-[9px] font-black text-zinc-400 uppercase tracking-widest">Payroll Cycle</span>
              <input 
                type="month"
                value={superfastMonth}
                onChange={(e) => setSuperfastMonth(e.target.value)}
                className="bg-transparent border-0 text-sm font-black text-zinc-900 p-0 focus:ring-0 w-32 cursor-pointer text-right"
              />
            </div>
            <div className="flex items-center gap-2 px-3 py-1.5 bg-zinc-900 rounded-lg text-white">
              <Banknote size={16} className="text-zinc-400" />
              <span className="text-xs font-bold uppercase tracking-widest">Ledger Active</span>
            </div>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-hidden p-6">
        {activeSubTab === 'bulk' && (
          <div className="h-full flex flex-col space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className="flex bg-zinc-100 p-1 rounded-lg border border-zinc-200">
                  <button onClick={() => { setEntryMode('dated'); setBulkRows(bulkRows.map(r => ({ ...r, date: new Date().toISOString().split('T')[0] }))) }} className={`px-3 py-1.5 text-[10px] font-black uppercase tracking-widest rounded-md transition-all ${entryMode === 'dated' ? 'bg-white text-zinc-900 shadow-sm border border-zinc-200/50' : 'text-zinc-400 hover:text-zinc-600'}`}>Specific Dates</button>
                  <button onClick={() => { setEntryMode('monthly'); setBulkRows(bulkRows.map(r => ({ ...r, date: new Date().toISOString().substring(0, 7) }))) }} className={`px-3 py-1.5 text-[10px] font-black uppercase tracking-widest rounded-md transition-all ${entryMode === 'monthly' ? 'bg-white text-zinc-900 shadow-sm border border-zinc-200/50' : 'text-zinc-400 hover:text-zinc-600'}`}>Monthly Total</button>
                </div>
                <div><h2 className="text-sm font-bold text-zinc-800 uppercase tracking-wider font-raleway">Bulk Entry Panel</h2><p className="text-xs text-zinc-500">{entryMode === 'monthly' ? 'Wholesale monthly sync' : 'Individual transaction log'}</p></div>
              </div>
              <div className="flex items-center gap-2">
                <button onClick={clearAllRows} className="px-3 py-2 text-[#525252] hover:text-[#171717] text-xs font-semibold uppercase transition-colors">Clear All</button>
                <button 
                  onClick={() => setIsSuperfastOpen(true)} 
                  className="flex items-center gap-2 px-5 py-2 bg-[#171717] text-white rounded-md text-[14px] font-medium hover:bg-[#262626] transition-all shadow-sm active:scale-95"
                >
                  <LayoutGrid size={16} /> Superfast Sync
                </button>
                <button onClick={addBulkRow} className="flex items-center gap-2 px-4 py-2 bg-white border border-[#d4d4d4] text-[#525252] rounded-md text-[14px] font-medium hover:bg-[#f5f5f5] transition-all shadow-sm"><Plus size={14} /> Add Row</button>
              </div>
            </div>

            <div className="flex-1 rounded-lg border border-zinc-200 bg-white text-zinc-950 shadow-sm overflow-hidden flex flex-col font-inter">
              <div className="overflow-x-auto flex-1">
                <table className="w-full text-sm border-collapse">
                  <thead className="border-b border-zinc-200 bg-zinc-50/80 sticky top-0 z-10">
                    <tr>
                      <th className="w-[40px] px-3 py-2 text-center align-middle text-xs font-medium text-zinc-500">#</th>
                      <th className="h-10 px-3 text-left align-middle text-xs font-medium text-zinc-500 font-raleway font-bold uppercase tracking-wider">Employee</th>
                      <th className="h-10 px-3 text-left align-middle text-xs font-medium text-zinc-500 font-raleway font-bold uppercase tracking-wider">Type</th>
                      <th className="h-10 px-3 text-left align-middle text-xs font-medium text-zinc-500 font-raleway font-bold uppercase tracking-wider">{entryMode === 'monthly' ? 'Pay Month' : 'Transaction Date'}</th>
                      <th className="h-10 px-3 text-right align-middle text-xs font-medium text-zinc-500 font-raleway font-bold uppercase tracking-wider">Amount (₹)</th>
                      <th className="h-10 px-3 text-left align-middle text-xs font-medium text-zinc-500 font-raleway font-bold uppercase tracking-wider">Remarks</th>
                      <th className="w-[60px] px-3 text-right align-middle text-xs font-medium text-zinc-500">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-200">
                    {bulkRows.map((row, index) => (
                      <tr key={row.id} className="hover:bg-zinc-50/80 transition-colors group h-12">
                        <td className="px-3 py-1.5 align-middle whitespace-nowrap text-[12px] font-medium text-zinc-400 text-center font-mono">{index + 1}</td>
                        <td className="px-3 py-1.5 align-middle whitespace-nowrap"><select value={row.employeeId} onChange={(e) => updateBulkRow(row.id, 'employeeId', e.target.value)} className="w-full h-8 bg-transparent border-0 focus:ring-0 text-[12px] font-semibold text-zinc-900 outline-none p-0"><option value="">Select Staff...</option>{employees.map(e => (<option key={e.id} value={e.id}>{e.name}</option>))}</select></td>
                        <td className="px-3 py-1.5 align-middle whitespace-nowrap"><select value={row.type} onChange={(e) => updateBulkRow(row.id, 'type', e.target.value)} className="w-full h-8 bg-transparent border-0 focus:ring-0 text-[12px] font-bold text-zinc-700 outline-none p-0"><option value="Advance">Advance</option><option value="Expense">Expense</option><option value="Deduction">Deduction</option></select></td>
                        <td className="px-3 py-1.5 align-middle whitespace-nowrap"><input type={entryMode === 'monthly' ? 'month' : 'date'} value={row.date} onChange={(e) => updateBulkRow(row.id, 'date', e.target.value)} className="w-full h-8 bg-transparent border-0 focus:ring-0 text-[12px] font-medium text-zinc-700 outline-none p-0" /></td>
                        <td className="px-3 py-1.5 align-middle whitespace-nowrap"><input type="number" placeholder="0.00" value={row.amount} onChange={(e) => updateBulkRow(row.id, 'amount', e.target.value)} className="w-full h-8 bg-transparent border-0 focus:ring-0 text-right text-[12px] font-black text-orange-600 placeholder:text-zinc-300 outline-none p-0" /></td>
                        <td className="px-3 py-1.5 align-middle whitespace-nowrap"><input type="text" placeholder={entryMode === 'monthly' ? 'Total impact...' : 'Reason...'} value={row.remarks} onChange={(e) => updateBulkRow(row.id, 'remarks', e.target.value)} className="w-full h-8 bg-transparent border-0 focus:ring-0 text-[12px] font-medium text-zinc-500 placeholder:text-zinc-300 outline-none p-0" /></td>
                        <td className="px-3 py-1.5 align-middle text-right"><button onClick={() => removeBulkRow(row.id)} className="p-1 text-zinc-300 hover:text-rose-500 transition-all opacity-0 group-hover:opacity-100"><Trash2 size={14} /></button></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="p-4 bg-zinc-50 border-t border-zinc-200 flex justify-between items-center shrink-0">
                <div className="flex items-center gap-4">
                  <div className="flex flex-col"><span className="text-[9px] font-black text-zinc-400 uppercase tracking-widest leading-none">Total Rows</span><span className="text-sm font-bold text-zinc-700 mt-1">{bulkRows.length}</span></div>
                  <div className="h-8 w-px bg-zinc-200"></div>
                  <div className="flex flex-col"><span className="text-[9px] font-black text-zinc-400 uppercase tracking-widest leading-none">Aggregate Disbursement</span><span className="text-sm font-black text-orange-600 mt-1">{formatINR(bulkRows.reduce((s, r) => s + (Number(r.amount) || 0), 0))}</span></div>
                </div>
                <button onClick={handleBulkSubmit} disabled={loading} className="px-8 py-2.5 bg-zinc-950 text-white rounded-xl text-xs font-black uppercase tracking-[0.15em] shadow-lg shadow-zinc-900/20 hover:bg-zinc-800 active:scale-95 transition-all disabled:opacity-50 flex items-center gap-2">{loading ? <Spinner size="sm" /> : <Save size={16} />}Commit Transactions</button>
              </div>
            </div>
          </div>
        )}

        {activeSubTab === 'pending' && (
          <div className="h-full flex flex-col space-y-4">
             <div className="flex items-center justify-between">
              <div><h2 className="text-sm font-bold text-zinc-800 uppercase tracking-wider font-raleway">Pending Clearances</h2><p className="text-xs text-zinc-500">Waitlist for accountant confirmation</p></div>
              <button onClick={fetchPending} className="p-2 bg-zinc-100 border border-zinc-200 text-zinc-600 rounded-lg hover:bg-zinc-200 transition-all shadow-sm"><RotateCcw size={16} /></button>
            </div>
            <div className="flex-1 rounded-xl border border-zinc-200 bg-white shadow-sm overflow-hidden flex flex-col">
              <div className="overflow-auto flex-1">
                {isPendingLoading ? (<div className="h-full flex flex-col items-center justify-center space-y-3 bg-zinc-50/50"><Spinner size="lg" /><p className="text-[10px] font-black uppercase text-zinc-400 tracking-widest">Scanning Ledger...</p></div>) : pendingItems.length === 0 ? (<div className="h-full flex flex-col items-center justify-center space-y-4 opacity-40 bg-zinc-50/30"><div className="w-16 h-16 rounded-2xl bg-zinc-100 flex items-center justify-center text-zinc-400 border border-zinc-200 shadow-inner"><ListChecks size={32} strokeWidth={1.5} /></div><p className="text-[11px] font-black uppercase tracking-widest text-zinc-500">Ledger is clean!</p></div>) : (
                  <table className="w-full text-sm border-collapse">
                    <thead className="sticky top-0 z-10 border-b border-zinc-200 bg-zinc-50/80">
                      <tr>
                        <th className="px-4 py-3 text-left text-[10px] font-black text-zinc-400 uppercase tracking-widest font-raleway">Staff</th>
                        <th className="px-4 py-3 text-left text-[10px] font-black text-zinc-400 uppercase tracking-widest font-raleway">Type</th>
                        <th className="px-4 py-3 text-left text-[10px] font-black text-zinc-400 uppercase tracking-widest font-raleway">Date</th>
                        <th className="px-4 py-3 text-right text-[10px] font-black text-zinc-400 uppercase tracking-widest font-raleway">Amount</th>
                        <th className="px-4 py-3 text-left text-[10px] font-black text-zinc-400 uppercase tracking-widest font-raleway">Remarks</th>
                        <th className="px-4 py-3 text-right text-[10px] font-black text-zinc-400 uppercase tracking-widest font-raleway">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-100 bg-white">
                      {pendingItems.map(item => (
                        <tr key={item.id} className="hover:bg-zinc-50/80 transition-colors group h-12">
                          <td className="px-4 py-1.5 text-[12px] font-bold text-zinc-900 uppercase tracking-tight">{item.employeeName}</td>
                          <td className="px-4 py-1.5"><span className={`px-2 py-0.5 rounded-md text-[9px] font-black uppercase tracking-wider ${item.type === 'Advance' ? 'bg-orange-100 text-orange-700' : 'bg-zinc-100 text-zinc-700'}`}>{item.type}</span></td>
                          <td className="px-4 py-1.5 text-[12px] font-medium text-zinc-500 font-mono">{item.date}</td>
                          <td className="px-4 py-1.5 text-right font-black text-zinc-900 text-[12px]">{formatINR(item.amount)}</td>
                          <td className="px-4 py-1.5 text-[11px] font-medium text-zinc-500 italic truncate max-w-[200px]">{item.remarks}</td>
                          <td className="px-4 py-1.5 text-right whitespace-nowrap"><div className="flex justify-end gap-2"><button onClick={() => handleApprove(item.id)} className="h-8 w-8 flex items-center justify-center bg-emerald-50 text-emerald-600 rounded-lg hover:bg-emerald-600 hover:text-white transition-all shadow-sm"><CheckCircle2 size={16} /></button><button className="h-8 w-8 flex items-center justify-center bg-rose-50 text-rose-600 rounded-lg hover:bg-rose-600 hover:text-white transition-all shadow-sm"><X size={16} /></button></div></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </div>
          </div>
        )}

        {activeSubTab === 'ledger' && (
          <div className="h-full flex items-center justify-center bg-white rounded-xl border border-zinc-200 border-dashed shadow-inner">
            <div className="text-center space-y-4 max-w-sm"><div className="w-16 h-16 bg-zinc-50 rounded-2xl border border-zinc-100 flex items-center justify-center mx-auto shadow-sm"><History size={32} className="text-zinc-300" /></div><h3 className="text-xs font-black text-zinc-400 uppercase tracking-[0.3em]">Ledger Archive</h3><p className="text-[10px] text-zinc-400 font-medium leading-relaxed">Financial reconciliation history and month-on-month ledger audits will be available soon.</p></div>
          </div>
        )}
      </div>

      <SuperfastModal 
        isOpen={isSuperfastOpen}
        onClose={() => setIsSuperfastOpen(false)}
        employees={employees.filter(e => isEmployeeActiveStatus(e.status))}
        month={superfastMonth}
        orgId={user?.orgId}
        userId={user?.uid}
        userName={user?.name}
      />
    </div>
  )
}
