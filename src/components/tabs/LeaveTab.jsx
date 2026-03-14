import React, { useState, useEffect } from 'react'
import { useAuth } from '../../hooks/useAuth'
import { useEmployees } from '../../hooks/useEmployees'
import { db } from '../../lib/firebase'
import { collection, addDoc, query, where, getDocs, serverTimestamp, orderBy, updateDoc, doc } from 'firebase/firestore'
import { LayoutDashboard, FileText, CheckCircle, PlusCircle, PieChart, Search, Trash2, Calendar, Clock } from 'lucide-react'
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
    { id: 'dashboard', label: 'Overview', icon: <LayoutDashboard size={16} /> },
    { id: 'request', label: 'All Requests', icon: <FileText size={16} /> },
    { id: 'approve', label: 'Approvals', icon: <CheckCircle size={16} /> },
    { id: 'reports', label: 'Analysis', icon: <PieChart size={16} /> }
  ]

  return (
    <div className="space-y-8 font-inter">
      {/* SaaS Sub-Nav Header */}
      <div className="bg-white p-6 rounded-[12px] shadow-sm border border-gray-100 flex justify-between items-center">
        <div className="flex bg-gray-100 p-1 rounded-lg">
          {subNav.map(s => (
            <button
              key={s.id}
              onClick={() => setActiveSub(s.id)}
              className={`flex items-center gap-2 px-5 py-2 rounded-md text-[13px] font-bold transition-all ${activeSub === s.id ? 'bg-white shadow-sm text-gray-900' : 'text-gray-400 hover:text-gray-600'}`}
            >
              {s.icon} {s.label}
            </button>
          ))}
        </div>
        <button 
          onClick={() => setShowAddModal(true)}
          className="h-[40px] px-6 bg-indigo-600 text-white font-bold rounded-lg text-[13px] flex items-center gap-2 shadow-lg hover:bg-indigo-700 transition-all uppercase tracking-widest"
        >
          <PlusCircle size={16} strokeWidth={3} /> New Application
        </button>
      </div>

      {activeSub === 'dashboard' && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
          {[
            { label: 'Active Queue', count: leaves.filter(l => l.status === 'Pending').length, color: 'amber' },
            { label: 'Authorized', count: leaves.filter(l => l.status === 'Approved').length, color: 'green' },
            { label: 'Declined', count: leaves.filter(l => l.status === 'Rejected').length, color: 'red' },
            { label: 'Volume Total', count: leaves.length, color: 'indigo' }
          ].map(stat => (
            <div key={stat.label} className="bg-white p-8 rounded-[12px] border border-gray-100 shadow-sm flex flex-col items-center text-center">
              <p className="text-[11px] font-bold text-gray-400 uppercase tracking-[0.2em] mb-3">{stat.label}</p>
              <p className={`text-4xl font-black text-${stat.color}-600 tracking-tighter`}>{stat.count}</p>
            </div>
          ))}
        </div>
      )}

      {(activeSub === 'request' || activeSub === 'approve') && (
        <div className="bg-white rounded-[12px] border border-gray-100 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="h-[42px] bg-[#f9fafb]">
                  <th className="px-[16px] text-[12px] font-semibold text-[#6b7280] uppercase tracking-wider">Applicant</th>
                  <th className="px-[16px] text-[12px] font-semibold text-[#6b7280] uppercase tracking-wider">Classification</th>
                  <th className="px-[16px] text-[12px] font-semibold text-[#6b7280] uppercase tracking-wider">Period</th>
                  <th className="px-[16px] text-[12px] font-semibold text-[#6b7280] uppercase tracking-wider text-center">Flow Status</th>
                  <th className="px-[16px] text-[12px] font-semibold text-[#6b7280] uppercase tracking-wider text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#f1f5f9]">
                {loading ? (
                  <tr><td colSpan={5} className="text-center py-12"><Spinner /></td></tr>
                ) : leaves.length === 0 ? (
                  <tr><td colSpan={5} className="text-center py-20 text-gray-300 font-medium uppercase tracking-tighter text-lg opacity-40 italic">No leave activity found</td></tr>
                ) : leaves.map(leave => (
                  <tr key={leave.id} className="h-[60px] hover:bg-[#f8fafc] transition-colors group">
                    <td className="px-[16px]">
                      <div className="flex flex-col">
                        <span className="text-[13px] font-bold text-gray-700 uppercase tracking-tight">{leave.employeeName}</span>
                        <span className="text-[10px] text-gray-400 font-medium line-clamp-1 italic">"{leave.reason}"</span>
                      </div>
                    </td>
                    <td className="px-[16px]">
                      <span className="bg-indigo-50 text-indigo-600 px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest border border-indigo-100">{leave.type}</span>
                    </td>
                    <td className="px-[16px]">
                      <div className="flex items-center gap-2 text-gray-600">
                        <Calendar size={12} className="text-gray-300" />
                        <span className="text-[12px] font-bold">{leave.startDate}</span>
                        <span className="text-gray-300">→</span>
                        <span className="text-[12px] font-bold">{leave.endDate || 'Single Day'}</span>
                      </div>
                    </td>
                    <td className="px-[16px] text-center">
                      <span className={`text-[10px] font-black uppercase tracking-[0.15em] ${leave.status === 'Approved' ? 'text-green-600' : leave.status === 'Rejected' ? 'text-red-600' : 'text-amber-500'}`}>
                        {leave.status}
                      </span>
                    </td>
                    <td className="px-[16px]">
                      <div className="flex justify-end gap-2">
                        {leave.status === 'Pending' && activeSub === 'approve' ? (
                          <>
                            <button onClick={() => handleStatus(leave.id, 'Approved')} className="h-[32px] px-4 bg-green-50 text-green-700 rounded-md font-bold hover:bg-green-600 hover:text-white transition-all uppercase text-[10px] tracking-widest">Authorize</button>
                            <button onClick={() => handleStatus(leave.id, 'Rejected')} className="h-[32px] px-4 bg-red-50 text-red-700 rounded-md font-bold hover:bg-red-600 hover:text-white transition-all uppercase text-[10px] tracking-widest">Decline</button>
                          </>
                        ) : (
                          <div className="flex items-center gap-1.5 text-gray-300 text-[10px] font-bold uppercase tracking-widest px-2 italic"><Clock size={12} /> Record Archived</div>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <Modal isOpen={showAddModal} onClose={() => setShowAddModal(false)} title="New Resource Absence Request">
        <form onSubmit={handleSubmit} className="p-8 space-y-6 max-w-md mx-auto font-inter">
          <div>
            <label className="block text-[11px] font-bold text-gray-400 uppercase tracking-widest mb-2 px-1">Resource Selection</label>
            <select value={form.employeeId} onChange={e => setForm({...form, employeeId: e.target.value})} className="w-full h-[42px] border border-gray-200 rounded-lg px-4 text-sm font-bold bg-gray-50 focus:ring-2 focus:ring-indigo-500 outline-none cursor-pointer">
              <option value="">Choose employee...</option>
              {employees.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-[11px] font-bold text-gray-400 uppercase tracking-widest mb-2 px-1">Leave Classification</label>
            <select value={form.type} onChange={e => setForm({...form, type: e.target.value})} className="w-full h-[42px] border border-gray-200 rounded-lg px-4 text-sm font-bold bg-gray-50 focus:ring-2 focus:ring-indigo-500 outline-none">
              {leaveTypes.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-[11px] font-bold text-gray-400 uppercase tracking-widest mb-2 px-1">Commencement</label>
              <input type="date" value={form.startDate} onChange={e => setForm({...form, startDate: e.target.value})} className="w-full h-[42px] border border-gray-200 rounded-lg px-4 text-sm font-bold bg-gray-50" />
            </div>
            <div>
              <label className="block text-[11px] font-bold text-gray-400 uppercase tracking-widest mb-2 px-1">Conclusion</label>
              <input type="date" value={form.endDate} onChange={e => setForm({...form, endDate: e.target.value})} className="w-full h-[42px] border border-gray-200 rounded-lg px-4 text-sm font-bold bg-gray-50" />
            </div>
          </div>
          <div>
            <label className="block text-[11px] font-bold text-gray-400 uppercase tracking-widest mb-2 px-1">Formal Justification</label>
            <textarea value={form.reason} onChange={e => setForm({...form, reason: e.target.value})} className="w-full border border-gray-200 rounded-lg p-4 text-sm font-medium outline-none bg-gray-50 focus:ring-2 focus:ring-indigo-500 h-[100px] transition-all" placeholder="Provide detailed context for this request..." />
          </div>
          <button type="submit" className="w-full h-[44px] bg-indigo-600 text-white font-black py-3 rounded-lg shadow-xl hover:bg-indigo-700 transition-all uppercase tracking-[0.2em] text-[12px]">
            Submit for Approval
          </button>
        </form>
      </Modal>
    </div>
  )
}
