import { useState, useEffect } from 'react'
import { useAuth } from '../../hooks/useAuth'
import { useEmployees } from '../../hooks/useEmployees'
import { db } from '../../lib/firebase'
import { collection, addDoc, query, where, getDocs, serverTimestamp, orderBy, deleteDoc, doc } from 'firebase/firestore'
import { Wallet, Plus, Filter, Trash2, Receipt } from 'lucide-react'
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
    type: 'Advance', // Advance or Expense
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
      <div className="flex justify-between items-center">
        <div className="flex items-center gap-2">
          <select 
            value={filterType} 
            onChange={e => setFilterType(e.target.value)}
            className="border rounded-lg px-3 py-1.5 text-xs font-medium bg-white outline-none focus:ring-2 focus:ring-indigo-500"
          >
            <option value="All">All Types</option>
            <option value="Advance">Advances</option>
            <option value="Expense">Expenses</option>
          </select>
        </div>
        <button 
          onClick={() => setShowAddModal(true)}
          className="bg-indigo-600 text-white px-4 py-2 rounded-lg text-xs font-semibold flex items-center gap-2 shadow-sm hover:bg-indigo-700 transition-all"
        >
          <Plus size={14} /> New Entry
        </button>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden shadow-sm">
        <table className="w-full text-left text-sm">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              {['Date', 'Employee', 'Type', 'Category', 'Amount', 'Status', 'Actions'].map(h => (
                <th key={h} className="px-6 py-3 text-[11px] font-semibold text-gray-500 uppercase tracking-wider">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {loading ? (
              <tr><td colSpan={7} className="text-center py-10"><Spinner /></td></tr>
            ) : filteredEntries.length === 0 ? (
              <tr><td colSpan={7} className="text-center py-10 text-gray-400 italic">No entries found</td></tr>
            ) : filteredEntries.map(entry => (
              <tr key={entry.id} className="hover:bg-gray-50 transition-colors">
                <td className="px-6 py-4 text-gray-600 font-medium">{entry.date}</td>
                <td className="px-6 py-4">
                  <div className="font-semibold text-gray-900">{entry.employeeName}</div>
                  <div className="text-[10px] text-gray-400 uppercase">{entry.reason}</div>
                </td>
                <td className="px-6 py-4">
                  <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${entry.type === 'Advance' ? 'bg-amber-100 text-amber-700' : 'bg-blue-100 text-blue-700'}`}>
                    {entry.type}
                  </span>
                </td>
                <td className="px-6 py-4 text-gray-500">{entry.category}</td>
                <td className="px-6 py-4 font-bold text-gray-900">{formatINR(entry.amount)}</td>
                <td className="px-6 py-4">
                  <span className={`text-[10px] font-bold uppercase ${entry.status === 'Approved' ? 'text-green-600' : 'text-amber-600'}`}>
                    {entry.status}
                  </span>
                </td>
                <td className="px-6 py-4">
                  <button onClick={async () => { if(confirm('Delete?')) { await deleteDoc(doc(db, 'organisations', user.orgId, 'advances_expenses', entry.id)); fetchEntries(); } }} className="text-red-400 hover:text-red-600 transition-colors">
                    <Trash2 size={14} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Modal isOpen={showAddModal} onClose={() => setShowAddModal(false)} title="New Advance/Expense Request">
        <form onSubmit={handleSubmit} className="p-6 space-y-4 max-w-md mx-auto">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-[10px] font-bold text-gray-400 uppercase mb-1">Type</label>
              <select value={form.type} onChange={e => setForm({...form, type: e.target.value})} className="w-full border rounded-lg px-3 py-2 text-xs font-medium outline-none bg-gray-50 focus:ring-1 focus:ring-indigo-500">
                <option>Advance</option>
                <option>Expense</option>
              </select>
            </div>
            <div>
              <label className="block text-[10px] font-bold text-gray-400 uppercase mb-1">Date</label>
              <input type="date" value={form.date} onChange={e => setForm({...form, date: e.target.value})} className="w-full border rounded-lg px-3 py-2 text-xs font-medium outline-none bg-gray-50" />
            </div>
          </div>
          
          <div>
            <label className="block text-[10px] font-bold text-gray-400 uppercase mb-1">Employee</label>
            <select value={form.employeeId} onChange={e => setForm({...form, employeeId: e.target.value})} className="w-full border rounded-lg px-3 py-2 text-xs font-medium outline-none bg-gray-50">
              <option value="">Select Employee...</option>
              {employees.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-[10px] font-bold text-gray-400 uppercase mb-1">Category</label>
              <select value={form.category} onChange={e => setForm({...form, category: e.target.value})} className="w-full border rounded-lg px-3 py-2 text-xs font-medium outline-none bg-gray-50">
                <option value="">Choose...</option>
                {categories.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-[10px] font-bold text-gray-400 uppercase mb-1">Amount (₹)</label>
              <input type="number" value={form.amount} onChange={e => setForm({...form, amount: e.target.value})} className="w-full border rounded-lg px-3 py-2 text-xs font-bold outline-none bg-gray-50" placeholder="0.00" />
            </div>
          </div>

          <div>
            <label className="block text-[10px] font-bold text-gray-400 uppercase mb-1">Reason / Description</label>
            <textarea value={form.reason} onChange={e => setForm({...form, reason: e.target.value})} className="w-full border rounded-lg px-3 py-2 text-xs outline-none bg-gray-50 h-20" placeholder="Details..." />
          </div>

          <button type="submit" disabled={loading} className="w-full bg-indigo-600 text-white font-bold py-2.5 rounded-xl shadow-lg hover:bg-indigo-700 transition-all text-xs uppercase tracking-widest mt-2">
            Submit Request
          </button>
        </form>
      </Modal>
    </div>
  )
}
