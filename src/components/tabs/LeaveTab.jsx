import { useState, useEffect } from 'react'
import { useAuth } from '../../hooks/useAuth'
import { useEmployees } from '../../hooks/useEmployees'
import { db } from '../../lib/firebase'
import { collection, addDoc, query, where, getDocs, serverTimestamp, orderBy, updateDoc, doc } from 'firebase/firestore'
import { LayoutDashboard, FileText, CheckCircle, PlusCircle, PieChart, Search, Trash2 } from 'lucide-react'
import Spinner from '../ui/Spinner'
import Modal from '../ui/Modal'

export default function LeaveTab() {
  const { user } = useAuth()
  const { employees } = useEmployees(user?.orgId)
  const [activeSub, setActiveSub] = useState('dashboard')
  const [loading, setLoading] = useState(false)
  const [leaves, setLeaves] = useState([])
  const [showAddModal, setShowAddModal] = useState(false)
  
  const [form, setForm] = useState({ employeeId: '', type: 'Sick Leave', startDate: '', endDate: '', reason: '' })

  const leaveTypes = ['Sick Leave', 'Casual Leave', 'Privilege Leave', 'Maternity Leave', 'Paternity Leave', 'Unpaid Leave']

  const fetchLeaves = async () => {
    if (!user?.orgId) return
    setLoading(true)
    try {
      const q = query(
        collection(db, 'organisations', user.orgId, 'leaves'),
        orderBy('createdAt', 'desc')
      )
      const snap = await getDocs(q)
      setLeaves(snap.docs.map(d => ({ id: d.id, ...d.data() })))
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { fetchLeaves() }, [user?.orgId])

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!form.employeeId || !form.startDate) return
    setLoading(true)
    try {
      const emp = employees.find(e => e.id === form.employeeId)
      await addDoc(collection(db, 'organisations', user.orgId, 'leaves'), {
        ...form,
        employeeName: emp?.name || 'Unknown',
        status: 'Pending',
        createdAt: serverTimestamp()
      })
      setShowAddModal(false)
      fetchLeaves()
    } catch (err) {
      alert('Failed to apply')
    } finally {
      setLoading(false)
    }
  }

  const handleStatus = async (leaveId, status) => {
    try {
      await updateDoc(doc(db, 'organisations', user.orgId, 'leaves', leaveId), {
        status,
        reviewedBy: user.name,
        reviewedAt: serverTimestamp()
      })
      fetchLeaves()
    } catch (err) {
      alert('Update failed')
    }
  }

  const subNav = [
    { id: 'dashboard', label: 'Dashboard', icon: <LayoutDashboard size={14} /> },
    { id: 'request', label: 'Request Leave', icon: <FileText size={14} /> },
    { id: 'approve', label: 'Approve Leave', icon: <CheckCircle size={14} /> },
    { id: 'reports', label: 'Reports', icon: <PieChart size={14} /> }
  ]

  return (
    <div className="space-y-6 font-inter text-xs">
      <div className="flex bg-white p-1 rounded-xl border border-gray-200 w-fit shadow-sm">
        {subNav.map(s => (
          <button
            key={s.id}
            onClick={() => setActiveSub(s.id)}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg font-bold transition-all ${activeSub === s.id ? 'bg-indigo-600 text-white shadow-md' : 'text-gray-400 hover:text-gray-600'}`}
          >
            {s.icon} {s.label}
          </button>
        ))}
      </div>

      <div className="flex justify-between items-center">
        <h3 className="text-sm font-black text-gray-800 uppercase tracking-tight">Leave Management</h3>
        <button onClick={() => setShowAddModal(true)} className="bg-indigo-600 text-white px-4 py-2 rounded-lg font-bold flex items-center gap-2 shadow-sm hover:bg-indigo-700">
          <PlusCircle size={14} /> Apply Leave
        </button>
      </div>

      {activeSub === 'dashboard' && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {[
            { label: 'Pending', count: leaves.filter(l => l.status === 'Pending').length, color: 'amber' },
            { label: 'Approved', count: leaves.filter(l => l.status === 'Approved').length, color: 'green' },
            { label: 'Rejected', count: leaves.filter(l => l.status === 'Rejected').length, color: 'red' },
            { label: 'Total Requests', count: leaves.length, color: 'indigo' }
          ].map(stat => (
            <div key={stat.label} className="bg-white p-5 rounded-2xl border border-gray-100 shadow-sm">
              <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">{stat.label}</p>
              <p className={`text-2xl font-black text-${stat.color}-600 tracking-tighter`}>{stat.count}</p>
            </div>
          ))}
        </div>
      )}

      {(activeSub === 'request' || activeSub === 'approve') && (
        <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden shadow-sm">
          <table className="w-full text-left">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                {['Employee', 'Leave Type', 'Period', 'Status', 'Actions'].map(h => (
                  <th key={h} className="px-6 py-3 text-[10px] font-black text-gray-500 uppercase tracking-widest">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {loading ? (
                <tr><td colSpan={5} className="text-center py-10"><Spinner /></td></tr>
              ) : leaves.length === 0 ? (
                <tr><td colSpan={5} className="text-center py-10 text-gray-400 italic">No leave records found</td></tr>
              ) : leaves.map(leave => (
                <tr key={leave.id} className="hover:bg-gray-50/50 transition-colors">
                  <td className="px-6 py-4">
                    <div className="font-bold text-gray-900 uppercase tracking-tighter">{leave.employeeName}</div>
                    <div className="text-[9px] text-gray-400 font-medium line-clamp-1">"{leave.reason}"</div>
                  </td>
                  <td className="px-6 py-4">
                    <span className="bg-indigo-50 text-indigo-600 px-2 py-0.5 rounded text-[9px] font-black uppercase border border-indigo-100">{leave.type}</span>
                  </td>
                  <td className="px-6 py-4 font-bold text-gray-600 tracking-tight">
                    {leave.startDate} {leave.endDate && `→ ${leave.endDate}`}
                  </td>
                  <td className="px-6 py-4">
                    <span className={`text-[10px] font-black uppercase tracking-widest ${leave.status === 'Approved' ? 'text-green-600' : leave.status === 'Rejected' ? 'text-red-600' : 'text-amber-600'}`}>
                      {leave.status}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex gap-2">
                      {leave.status === 'Pending' && activeSub === 'approve' ? (
                        <>
                          <button onClick={() => handleStatus(leave.id, 'Approved')} className="bg-green-100 text-green-700 px-2 py-1 rounded font-black hover:bg-green-600 hover:text-white transition-all uppercase text-[9px]">Approve</button>
                          <button onClick={() => handleStatus(leave.id, 'Rejected')} className="bg-red-100 text-red-700 px-2 py-1 rounded font-black hover:bg-red-600 hover:text-white transition-all uppercase text-[9px]">Reject</button>
                        </>
                      ) : (
                        <span className="text-[9px] font-bold text-gray-300 italic uppercase">Closed</span>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Modal isOpen={showAddModal} onClose={() => setShowAddModal(false)} title="New Leave Application">
        <form onSubmit={handleSubmit} className="p-6 space-y-4 max-w-md mx-auto">
          <div>
            <label className="block text-[10px] font-black text-gray-400 uppercase mb-1">Employee</label>
            <select value={form.employeeId} onChange={e => setForm({...form, employeeId: e.target.value})} className="w-full border rounded-xl px-4 py-2.5 font-bold outline-none bg-gray-50 focus:ring-2 focus:ring-indigo-500">
              <option value="">Select Employee...</option>
              {employees.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-[10px] font-black text-gray-400 uppercase mb-1">Leave Category</label>
            <select value={form.type} onChange={e => setForm({...form, type: e.target.value})} className="w-full border rounded-xl px-4 py-2.5 font-bold outline-none bg-gray-50">
              {leaveTypes.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-[10px] font-black text-gray-400 uppercase mb-1">Start Date</label>
              <input type="date" value={form.startDate} onChange={e => setForm({...form, startDate: e.target.value})} className="w-full border rounded-xl px-4 py-2 font-bold outline-none bg-gray-50" />
            </div>
            <div>
              <label className="block text-[10px] font-black text-gray-400 uppercase mb-1">End Date</label>
              <input type="date" value={form.endDate} onChange={e => setForm({...form, endDate: e.target.value})} className="w-full border rounded-xl px-4 py-2 font-bold outline-none bg-gray-50" />
            </div>
          </div>
          <div>
            <label className="block text-[10px] font-black text-gray-400 uppercase mb-1">Reason for Leave</label>
            <textarea value={form.reason} onChange={e => setForm({...form, reason: e.target.value})} className="w-full border rounded-xl px-4 py-3 font-medium outline-none bg-gray-50 h-24" placeholder="Briefly explain..." />
          </div>
          <button type="submit" className="w-full bg-indigo-600 text-white font-black py-3 rounded-2xl shadow-xl hover:bg-indigo-700 transition-all uppercase tracking-widest">
            Send Application
          </button>
        </form>
      </Modal>
    </div>
  )
}
