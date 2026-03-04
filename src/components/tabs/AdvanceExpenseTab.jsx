import { useState, useEffect } from 'react'
import { useAuth } from '../../hooks/useAuth'
import { useEmployees } from '../../hooks/useEmployees'
import { db } from '../../lib/firebase'
import { collection, addDoc, query, where, getDocs, serverTimestamp, orderBy, deleteDoc, doc } from 'firebase/firestore'
import { Wallet, Plus, Filter, Trash2, Receipt, Search } from 'lucide-react'
import Spinner from '../ui/Spinner'
import Modal from '../ui/Modal'
import { formatINR } from '../../lib/salaryUtils'

export default function AdvanceExpenseTab() {
  const { user } = useAuth()
  const { employees } = useEmployees(user?.orgId)
  const [loading, setLoading] = useState(false)
  const [entries, setEntries] = useState([])
  const [showAddModal, setShowAddModal] = useState(false)
  const [filterType, setFilterType] = useState('All')
  
  const [form, setForm] = useState({
    employeeId: '',
    type: 'Advance',
    category: '',
    amount: '',
    date: new Date().toISOString().split('T')[0],
    reason: ''
  })

  const categories = ['Salary Advance', 'Travel', 'Food', 'Medical', 'Office Supplies', 'Others']

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

  useEffect(() => { fetchEntries() }, [user?.orgId])

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!form.employeeId || !form.amount) return
    setLoading(true)
    try {
      const emp = employees.find(e => e.id === form.employeeId)
      await addDoc(collection(db, 'organisations', user.orgId, 'advances_expenses'), {
        ...form,
        employeeName: emp?.name || 'Unknown',
        amount: Number(form.amount),
        status: 'Pending',
        createdAt: serverTimestamp()
      })
      setShowAddModal(false)
      fetchEntries()
    } catch (err) {
      alert('Failed to save')
    } finally {
      setLoading(false)
    }
  }

  const filteredEntries = entries.filter(e => filterType === 'All' || e.type === filterType)

  return (
    <div className="space-y-6 font-inter">
      {/* Header Controls Card */}
      <div className="bg-white p-6 rounded-[12px] shadow-sm flex justify-between items-center border border-gray-100">
        <div className="flex items-center gap-4">
          <div className="flex items-center bg-gray-50 rounded-lg p-1 border border-gray-200">
            <select 
              value={filterType} 
              onChange={e => setFilterType(e.target.value)}
              className="bg-transparent border-none outline-none px-3 text-[13px] font-semibold text-gray-700 h-[32px] cursor-pointer"
            >
              <option value="All">All Ledger Types</option>
              <option value="Advance">Direct Advances</option>
              <option value="Expense">Business Expenses</option>
            </select>
          </div>
          <div className="h-8 w-px bg-gray-100"></div>
          <p className="text-[11px] font-bold text-gray-400 uppercase tracking-widest">Total Record: {filteredEntries.length}</p>
        </div>
        <button 
          onClick={() => setShowAddModal(true)}
          className="h-[40px] px-6 bg-indigo-600 text-white font-bold rounded-lg text-[13px] flex items-center gap-2 shadow-lg hover:bg-indigo-700 transition-all uppercase tracking-widest"
        >
          <Plus size={16} strokeWidth={3} /> New Entry
        </button>
      </div>

      {/* Main Table Card */}
      <div className="bg-white rounded-[12px] border border-gray-100 overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="h-[42px] bg-[#f9fafb]">
                <th className="px-[16px] text-[12px] font-semibold text-[#6b7280] uppercase tracking-wider">Date</th>
                <th className="px-[16px] text-[12px] font-semibold text-[#6b7280] uppercase tracking-wider">Entity Account</th>
                <th className="px-[16px] text-[12px] font-semibold text-[#6b7280] uppercase tracking-wider">Category</th>
                <th className="px-[16px] text-[12px] font-semibold text-[#6b7280] uppercase tracking-wider text-center">Amount</th>
                <th className="px-[16px] text-[12px] font-semibold text-[#6b7280] uppercase tracking-wider text-center">Flow Status</th>
                <th className="px-[16px] text-[12px] font-semibold text-[#6b7280] uppercase tracking-wider text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#f1f5f9]">
              {loading ? (
                <tr><td colSpan={6} className="text-center py-12"><Spinner /></td></tr>
              ) : filteredEntries.length === 0 ? (
                <tr><td colSpan={6} className="text-center py-20 text-gray-300 font-medium uppercase tracking-tighter text-lg opacity-40 italic">No ledger entries found</td></tr>
              ) : (
                filteredEntries.map(entry => (
                  <tr key={entry.id} className="h-[48px] hover:bg-[#f8fafc] transition-colors group">
                    <td className="px-[16px] text-[12px] font-medium text-gray-400">{entry.date}</td>
                    <td className="px-[16px]">
                      <div className="flex flex-col">
                        <span className="text-[13px] font-bold text-gray-700 uppercase tracking-tight">{entry.employeeName}</span>
                        <span className="text-[10px] text-gray-400 font-medium line-clamp-1 italic">"{entry.reason}"</span>
                      </div>
                    </td>
                    <td className="px-[16px]">
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-widest border ${entry.type === 'Advance' ? 'bg-amber-50 text-amber-600 border-amber-100' : 'bg-blue-50 text-blue-600 border-blue-100'}`}>
                        {entry.category || entry.type}
                      </span>
                    </td>
                    <td className="px-[16px] text-center font-mono font-bold text-gray-900 text-[14px]">
                      {formatINR(entry.amount)}
                    </td>
                    <td className="px-[16px] text-center">
                      <span className={`text-[10px] font-black uppercase tracking-[0.1em] ${entry.status === 'Approved' ? 'text-green-600' : 'text-amber-500'}`}>
                        {entry.status}
                      </span>
                    </td>
                    <td className="px-[16px]">
                      <div className="flex justify-end">
                        <button onClick={async () => { if(confirm('Permanently delete this entry?')) { await deleteDoc(doc(db, 'organisations', user.orgId, 'advances_expenses', entry.id)); fetchEntries(); } }} className="p-2 text-gray-300 hover:text-red-600 hover:bg-red-50 rounded-lg transition-all">
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <Modal isOpen={showAddModal} onClose={() => setShowAddModal(false)} title="New Disbursement Record">
        <form onSubmit={handleSubmit} className="p-8 space-y-6 max-w-md mx-auto">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-[11px] font-bold text-gray-400 uppercase tracking-widest mb-2 px-1">Flow Type</label>
              <select value={form.type} onChange={e => setForm({...form, type: e.target.value})} className="w-full h-[42px] border border-gray-200 rounded-lg px-4 text-sm font-bold bg-gray-50 focus:ring-2 focus:ring-indigo-500 outline-none cursor-pointer transition-all">
                <option>Advance</option>
                <option>Expense</option>
              </select>
            </div>
            <div>
              <label className="block text-[11px] font-bold text-gray-400 uppercase tracking-widest mb-2 px-1">Entry Date</label>
              <input type="date" value={form.date} onChange={e => setForm({...form, date: e.target.value})} className="w-full h-[42px] border border-gray-200 rounded-lg px-4 text-sm font-bold bg-gray-50 focus:ring-2 focus:ring-indigo-500 outline-none" />
            </div>
          </div>
          
          <div>
            <label className="block text-[11px] font-bold text-gray-400 uppercase tracking-widest mb-2 px-1">Associated Employee</label>
            <select value={form.employeeId} onChange={e => setForm({...form, employeeId: e.target.value})} className="w-full h-[42px] border border-gray-200 rounded-lg px-4 text-sm font-bold bg-gray-50 focus:ring-2 focus:ring-indigo-500 outline-none cursor-pointer transition-all">
              <option value="">Select individual...</option>
              {employees.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-[11px] font-bold text-gray-400 uppercase tracking-widest mb-2 px-1">Classification</label>
              <select value={form.category} onChange={e => setForm({...form, category: e.target.value})} className="w-full h-[42px] border border-gray-200 rounded-lg px-4 text-sm font-bold bg-gray-50 focus:ring-2 focus:ring-indigo-500 outline-none cursor-pointer transition-all">
                <option value="">Choose...</option>
                {categories.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-[11px] font-bold text-gray-400 uppercase tracking-widest mb-2 px-1">Amount (₹)</label>
              <input type="number" value={form.amount} onChange={e => setForm({...form, amount: e.target.value})} className="w-full h-[42px] border border-gray-200 rounded-lg px-4 text-sm font-black bg-gray-50 focus:ring-2 focus:ring-indigo-500 outline-none text-indigo-600" placeholder="0.00" />
            </div>
          </div>

          <div>
            <label className="block text-[11px] font-bold text-gray-400 uppercase tracking-widest mb-2 px-1">Justification / Remarks</label>
            <textarea value={form.reason} onChange={e => setForm({...form, reason: e.target.value})} className="w-full border border-gray-200 rounded-lg p-4 text-[13px] font-medium outline-none bg-gray-50 focus:ring-2 focus:ring-indigo-500 h-[100px] transition-all" placeholder="Enter detailed reason for the request..." />
          </div>

          <button type="submit" disabled={loading} className="w-full h-[44px] bg-indigo-600 text-white font-black rounded-lg shadow-xl hover:bg-indigo-700 transition-all text-[12px] uppercase tracking-[0.2em] mt-2">
            Finalize Entry
          </button>
        </form>
      </Modal>
    </div>
  )
}
