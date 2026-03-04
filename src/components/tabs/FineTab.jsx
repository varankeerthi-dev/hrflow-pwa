import { useState, useEffect } from 'react'
import { useAuth } from '../../hooks/useAuth'
import { useEmployees } from '../../hooks/useEmployees'
import { db } from '../../lib/firebase'
import { collection, addDoc, query, where, getDocs, serverTimestamp, orderBy, deleteDoc, doc } from 'firebase/firestore'
import { Gavel, Plus, Search, Trash2, AlertCircle } from 'lucide-react'
import Spinner from '../ui/Spinner'
import Modal from '../ui/Modal'
import { formatINR } from '../../lib/salaryUtils'

export default function FineTab() {
  const { user } = useAuth()
  const { employees } = useEmployees(user?.orgId)
  const [loading, setLoading] = useState(false)
  const [fines, setFines] = useState([])
  const [showAddModal, setShowAddModal] = useState(false)
  
  const [form, setForm] = useState({
    employeeId: '',
    type: 'Late Entry',
    amount: '',
    date: new Date().toISOString().split('T')[0],
    reason: ''
  })

  const fineTypes = ['Late Entry', 'Misconduct', 'Safety Violation', 'Damage to Property', 'Policy Breach', 'Others']

  const fetchFines = async () => {
    if (!user?.orgId) return
    setLoading(true)
    try {
      const q = query(
        collection(db, 'organisations', user.orgId, 'fines'),
        orderBy('date', 'desc')
      )
      const snap = await getDocs(q)
      setFines(snap.docs.map(d => ({ id: d.id, ...d.data() })))
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { fetchFines() }, [user?.orgId])

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!form.employeeId || !form.amount) return
    setLoading(true)
    try {
      const emp = employees.find(e => e.id === form.employeeId)
      await addDoc(collection(db, 'organisations', user.orgId, 'fines'), {
        ...form,
        employeeName: emp?.name || 'Unknown',
        amount: Number(form.amount),
        status: 'Unpaid',
        createdAt: serverTimestamp()
      })
      setShowAddModal(false)
      fetchFines()
    } catch (err) {
      alert('Failed to save')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-6 font-inter">
      <div className="flex justify-between items-center">
        <h3 className="text-sm font-black text-gray-800 uppercase tracking-tight">Penalties & Fines</h3>
        <button 
          onClick={() => setShowAddModal(true)}
          className="bg-red-600 text-white px-4 py-2 rounded-lg text-xs font-semibold flex items-center gap-2 shadow-sm hover:bg-red-700 transition-all"
        >
          <Plus size={14} /> Log Penalty
        </button>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden shadow-sm">
        <table className="w-full text-left text-sm">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              {['Date', 'Employee', 'Violation Type', 'Amount', 'Reason', 'Actions'].map(h => (
                <th key={h} className="px-6 py-3 text-[11px] font-semibold text-gray-500 uppercase tracking-wider">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {loading ? (
              <tr><td colSpan={6} className="text-center py-10"><Spinner /></td></tr>
            ) : fines.length === 0 ? (
              <tr><td colSpan={6} className="text-center py-10 text-gray-400 italic">No violations logged</td></tr>
            ) : fines.map(fine => (
              <tr key={fine.id} className="hover:bg-red-50/30 transition-colors">
                <td className="px-6 py-4 text-gray-600 font-medium">{fine.date}</td>
                <td className="px-6 py-4">
                  <div className="font-semibold text-gray-900">{fine.employeeName}</div>
                </td>
                <td className="px-6 py-4">
                  <span className="bg-red-50 text-red-600 px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider border border-red-100">
                    {fine.type}
                  </span>
                </td>
                <td className="px-6 py-4 font-bold text-red-600">{formatINR(fine.amount)}</td>
                <td className="px-6 py-4 text-gray-500 text-xs italic">"{fine.reason}"</td>
                <td className="px-6 py-4">
                  <button onClick={async () => { if(confirm('Delete penalty?')) { await deleteDoc(doc(db, 'organisations', user.orgId, 'fines', fine.id)); fetchFines(); } }} className="text-gray-400 hover:text-red-600 transition-colors">
                    <Trash2 size={14} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Modal isOpen={showAddModal} onClose={() => setShowAddModal(false)} title="Issue New Penalty">
        <form onSubmit={handleSubmit} className="p-6 space-y-4 max-w-md mx-auto">
          <div>
            <label className="block text-[10px] font-bold text-gray-400 uppercase mb-1">Violation Date</label>
            <input type="date" value={form.date} onChange={e => setForm({...form, date: e.target.value})} className="w-full border rounded-lg px-3 py-2 text-xs font-medium outline-none bg-gray-50 focus:ring-1 focus:ring-red-500" />
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
              <label className="block text-[10px] font-bold text-gray-400 uppercase mb-1">Violation Type</label>
              <select value={form.type} onChange={e => setForm({...form, type: e.target.value})} className="w-full border rounded-lg px-3 py-2 text-xs font-medium outline-none bg-gray-50">
                {fineTypes.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-[10px] font-bold text-gray-400 uppercase mb-1">Penalty Amount (₹)</label>
              <input type="number" value={form.amount} onChange={e => setForm({...form, amount: e.target.value})} className="w-full border rounded-lg px-3 py-2 text-xs font-bold outline-none bg-gray-50 focus:ring-1 focus:ring-red-500 text-red-600" placeholder="0.00" />
            </div>
          </div>

          <div>
            <label className="block text-[10px] font-bold text-gray-400 uppercase mb-1">Reason / Incident Note</label>
            <textarea value={form.reason} onChange={e => setForm({...form, reason: e.target.value})} className="w-full border rounded-lg px-3 py-2 text-xs outline-none bg-gray-50 h-24" placeholder="Briefly describe the incident..." />
          </div>

          <div className="bg-red-50 p-3 rounded-lg border border-red-100 flex items-start gap-2">
            <AlertCircle size={14} className="text-red-600 mt-0.5" />
            <p className="text-[9px] text-red-700 font-medium">Penalties are automatically deducted from the employee's next salary slip. Ensure reason is documented.</p>
          </div>

          <button type="submit" disabled={loading} className="w-full bg-red-600 text-white font-bold py-2.5 rounded-xl shadow-lg hover:bg-red-700 transition-all text-xs uppercase tracking-widest mt-2">
            Confirm & Log Penalty
          </button>
        </form>
      </Modal>
    </div>
  )
}
