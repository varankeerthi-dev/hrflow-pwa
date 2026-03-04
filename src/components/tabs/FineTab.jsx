import { useState, useEffect } from 'react'
import { useAuth } from '../../hooks/useAuth'
import { useEmployees } from '../../hooks/useEmployees'
import { db } from '../../lib/firebase'
import { collection, addDoc, query, where, getDocs, serverTimestamp, orderBy, deleteDoc, doc } from 'firebase/firestore'
import { Gavel, Plus, Search, Trash2, AlertCircle, Info } from 'lucide-react'
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
      {/* Header Info Card */}
      <div className="bg-white p-6 rounded-[12px] shadow-sm flex justify-between items-center border border-gray-100">
        <div className="flex items-center gap-4">
          <div className="w-10 h-10 rounded-full bg-red-50 flex items-center justify-center text-red-600 border border-red-100 shadow-inner">
            <Gavel size={20} />
          </div>
          <div>
            <h3 className="text-sm font-bold text-gray-800 uppercase tracking-tight">Compliance & Penalties</h3>
            <p className="text-[11px] text-gray-400 font-bold uppercase tracking-widest mt-0.5">Disciplinary Ledger</p>
          </div>
        </div>
        <button 
          onClick={() => setShowAddModal(true)}
          className="h-[40px] px-6 bg-red-600 text-white font-bold rounded-lg text-[12px] flex items-center gap-2 shadow-lg hover:bg-red-700 transition-all uppercase tracking-widest"
        >
          <Plus size={16} strokeWidth={3} /> Issue Penalty
        </button>
      </div>

      {/* Main Table Card */}
      <div className="bg-white rounded-[12px] border border-gray-100 overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="h-[42px] bg-[#f9fafb]">
                <th className="px-[16px] text-[12px] font-semibold text-[#6b7280] uppercase tracking-wider">Occurrence Date</th>
                <th className="px-[16px] text-[12px] font-semibold text-[#6b7280] uppercase tracking-wider">Employee</th>
                <th className="px-[16px] text-[12px] font-semibold text-[#6b7280] uppercase tracking-wider">Violation Category</th>
                <th className="px-[16px] text-[12px] font-semibold text-[#6b7280] uppercase tracking-wider text-center">Fine (₹)</th>
                <th className="px-[16px] text-[12px] font-semibold text-[#6b7280] uppercase tracking-wider">Incident Log</th>
                <th className="px-[16px] text-[12px] font-semibold text-[#6b7280] uppercase tracking-wider text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#f1f5f9]">
              {loading ? (
                <tr><td colSpan={6} className="text-center py-12"><Spinner /></td></tr>
              ) : fines.length === 0 ? (
                <tr><td colSpan={6} className="text-center py-20 text-gray-300 font-medium uppercase tracking-tighter text-lg opacity-40 italic">Zero violations recorded</td></tr>
              ) : (
                fines.map(fine => (
                  <tr key={fine.id} className="h-[48px] hover:bg-red-50/10 transition-colors group">
                    <td className="px-[16px] text-[12px] font-medium text-gray-400">{fine.date}</td>
                    <td className="px-[16px] text-[13px] font-bold text-gray-700 uppercase tracking-tight">{fine.employeeName}</td>
                    <td className="px-[16px]">
                      <span className="bg-red-50 text-red-600 px-2.5 py-1 rounded-md text-[10px] font-black uppercase border border-red-100">
                        {fine.type}
                      </span>
                    </td>
                    <td className="px-[16px] text-center font-mono font-black text-red-600 text-[14px]">
                      {formatINR(fine.amount)}
                    </td>
                    <td className="px-[16px]">
                      <div className="flex items-center gap-2 text-gray-500 text-[12px] italic">
                        <Info size={14} className="text-gray-300" />
                        <span className="line-clamp-1 truncate w-[200px]">"{fine.reason}"</span>
                      </div>
                    </td>
                    <td className="px-[16px]">
                      <div className="flex justify-end">
                        <button onClick={async () => { if(confirm('Delete penalty?')) { await deleteDoc(doc(db, 'organisations', user.orgId, 'fines', fine.id)); fetchFines(); } }} className="p-2 text-gray-300 hover:text-red-600 hover:bg-red-50 rounded-lg transition-all">
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

      <Modal isOpen={showAddModal} onClose={() => setShowAddModal(false)} title="Formal Penalty Issuance">
        <form onSubmit={handleSubmit} className="p-8 space-y-6 max-w-md mx-auto">
          <div>
            <label className="block text-[11px] font-bold text-gray-400 uppercase tracking-widest mb-2 px-1">Occurrence Date</label>
            <input type="date" value={form.date} onChange={e => setForm({...form, date: e.target.value})} className="w-full h-[42px] border border-gray-200 rounded-lg px-4 text-sm font-bold bg-gray-50 focus:ring-2 focus:ring-red-500 outline-none transition-all" />
          </div>
          
          <div>
            <label className="block text-[11px] font-bold text-gray-400 uppercase tracking-widest mb-2 px-1">Target Employee</label>
            <select value={form.employeeId} onChange={e => setForm({...form, employeeId: e.target.value})} className="w-full h-[42px] border border-gray-200 rounded-lg px-4 text-sm font-bold bg-gray-50 focus:ring-2 focus:ring-red-500 outline-none cursor-pointer">
              <option value="">Choose roster member...</option>
              {employees.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-[11px] font-bold text-gray-400 uppercase tracking-widest mb-2 px-1">Violation Type</label>
              <select value={form.type} onChange={e => setForm({...form, type: e.target.value})} className="w-full h-[42px] border border-gray-200 rounded-lg px-4 text-sm font-bold bg-gray-50 focus:ring-2 focus:ring-red-500 outline-none">
                {fineTypes.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-[11px] font-bold text-gray-400 uppercase tracking-widest mb-2 px-1">Fine Amount (₹)</label>
              <input type="number" value={form.amount} onChange={e => setForm({...form, amount: e.target.value})} className="w-full h-[42px] border border-gray-200 rounded-lg px-4 text-sm font-black bg-gray-50 focus:ring-2 focus:ring-red-500 outline-none text-red-600" placeholder="0.00" />
            </div>
          </div>

          <div>
            <label className="block text-[11px] font-bold text-gray-400 uppercase tracking-widest mb-2 px-1">Incident Report / Details</label>
            <textarea value={form.reason} onChange={e => setForm({...form, reason: e.target.value})} className="w-full border border-gray-200 rounded-lg p-4 text-[13px] font-medium outline-none bg-gray-50 focus:ring-2 focus:ring-red-500 h-[120px] transition-all" placeholder="Describe the policy violation in detail..." />
          </div>

          <div className="bg-red-50 p-4 rounded-xl border border-red-100 flex items-start gap-3">
            <AlertCircle size={18} className="text-red-600 shrink-0 mt-0.5" />
            <p className="text-[11px] text-red-700 font-bold leading-relaxed uppercase">Warning: This amount will be automatically deducted from the next payroll cycle. Ensure documentation is complete.</p>
          </div>

          <button type="submit" disabled={loading} className="w-full h-[44px] bg-red-600 text-white font-black rounded-lg shadow-xl hover:bg-red-700 transition-all text-[12px] uppercase tracking-[0.2em] mt-2">
            Authenticate Penalty
          </button>
        </form>
      </Modal>
    </div>
  )
}
