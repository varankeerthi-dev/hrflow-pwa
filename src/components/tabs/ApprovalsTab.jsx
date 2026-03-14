import React from 'react'
import { useState, useEffect } from 'react'
import { useAuth } from '../../hooks/useAuth'
import { useEmployees } from '../../hooks/useEmployees'
import { db } from '../../lib/firebase'
import { 
  collection, 
  query, 
  where, 
  getDocs, 
  orderBy, 
  doc, 
  updateDoc, 
  serverTimestamp,
  deleteDoc
} from 'firebase/firestore'
import Spinner from '../ui/Spinner'
import { formatINR } from '../../lib/salaryUtils'
import { 
  CheckCircle2, 
  XCircle, 
  Clock, 
  AlertCircle, 
  PauseCircle, 
  ChevronDown,
  ChevronUp,
  MessageSquare,
  Search,
  Filter,
  FileText,
  Calendar as CalendarIcon,
  Trash2
} from 'lucide-react'

function getInitials(name) {
  return name?.split(' ').map(n => n[0]).join('').toUpperCase() || '??'
}

export default function ApprovalsTab() {
  const { user } = useAuth()
  const { employees } = useEmployees(user?.orgId)
  
  const [activeSubTab, setActiveSubTab] = useState('advance-expense') // 'advance-expense', 'leave-permission', or 'payment-queue'
  const [loading, setLoading] = useState(false)
  const [advExpenses, setAdvExpenses] = useState([])
  const [paymentQueue, setPaymentQueue] = useState([])
  const [requests, setRequests] = useState([])
  
  // For the Advance/Expense action toggles
  const [actionState, setActionState] = useState({}) // { id: { status, remarks, showToggle, paymentMethod, paymentRef } }

  const canApprove = user?.role?.toLowerCase() === 'admin' || user?.permissions?.Approvals?.approve === true
  const isAccountant = user?.role?.toLowerCase() === 'admin' || user?.role?.toLowerCase() === 'accountant' || user?.permissions?.isAccountant === true
  const isMD = user?.role?.toLowerCase() === 'admin' || user?.role?.toLowerCase() === 'md'
  const isHR = user?.role?.toLowerCase() === 'admin' || user?.role?.toLowerCase() === 'hr'

  useEffect(() => {
    if (!user?.orgId) return
    fetchData()
  }, [user?.orgId, activeSubTab])

  const fetchData = async () => {
    setLoading(true)
    try {
      if (activeSubTab === 'advance-expense' || activeSubTab === 'payment-queue') {
        const q = query(
          collection(db, 'organisations', user.orgId, 'advances_expenses'),
          orderBy('date', 'desc')
        )
        const snap = await getDocs(q)
        const data = snap.docs.map(d => ({ id: d.id, ...d.data() }))
        
        if (activeSubTab === 'payment-queue') {
          // Show only MD approved items that are not paid
          setPaymentQueue(data.filter(item => item.mdApproval === 'Approved' && item.paymentStatus !== 'Paid'))
        } else {
          setAdvExpenses(data)
        }
        
        // Initialize action states
        const initialActionState = {}
        data.forEach(item => {
          initialActionState[item.id] = { 
            status: item.status || 'Pending', 
            remarks: item.remarks || '', 
            showToggle: false,
            paymentMethod: 'Bank Transfer',
            paymentRef: ''
          }
        })
        setActionState(initialActionState)

      } else {
        const q = query(
          collection(db, 'organisations', user.orgId, 'requests'),
          orderBy('createdAt', 'desc')
        )
        const snap = await getDocs(q)
        setRequests(snap.docs.map(d => ({ id: d.id, ...d.data() })))
      }
    } catch (err) {
      console.error('Error fetching approvals:', err)
    } finally {
      setLoading(false)
    }
  }

  const handleUpdateAdvExpense = async (id) => {
    if (!canApprove) return alert('No permission')
    const state = actionState[id]
    if (!state) return

    if (['Partial', 'Rejected', 'Hold'].includes(state.status) && !state.remarks.trim()) {
      return alert(`Please provide remarks for ${state.status} status`)
    }

    try {
      const updateData = {
        status: state.status === 'Approve' ? 'Approved' : state.status,
        remarks: state.remarks,
        approved_by: user.uid,
        approved_at: serverTimestamp(),
        updatedAt: serverTimestamp(),
        updatedBy: user.uid
      }

      // HR or MD approval marking
      if (isHR) {
        updateData.hrApproval = state.status === 'Approve' ? 'Approved' : state.status
        updateData.hrApprovedBy = user.uid
        updateData.hrApprovedAt = serverTimestamp()
      }
      
      if (isMD) {
        updateData.mdApproval = state.status === 'Approve' ? 'Approved' : state.status
        updateData.mdApprovedBy = user.uid
        updateData.mdApprovedAt = serverTimestamp()
      }

      await updateDoc(doc(db, 'organisations', user.orgId, 'advances_expenses', id), updateData)
      alert('Status updated successfully')
      fetchData()
    } catch (err) {
      alert('Failed to update status')
    }
  }

  const handleUpdateRequestStatus = async (id, status) => {
    if (!canApprove) return alert('No permission')
    try {
      await updateDoc(doc(db, 'organisations', user.orgId, 'requests', id), { 
        status,
        updatedAt: serverTimestamp(),
        updatedBy: user.uid
      })
      alert(`Request ${status} successfully`)
      fetchData()
    } catch (err) {
      alert('Failed to update status')
    }
  }

  const handleDeleteRequest = async (id) => {
    if (!confirm('Permanently delete this request record?')) return
    try {
      await deleteDoc(doc(db, 'organisations', user.orgId, 'requests', id))
      fetchData()
    } catch (err) {
      alert('Failed to delete')
    }
  }

  const handleUpdatePaymentStatus = async (id) => {
    if (!isAccountant) return alert('Only accountants can process payments')
    const state = actionState[id]
    if (!state?.paymentRef.trim()) return alert('Please provide a payment reference number')

    try {
      await updateDoc(doc(db, 'organisations', user.orgId, 'advances_expenses', id), {
        paymentStatus: 'Paid',
        paymentMethod: state.paymentMethod,
        paymentRef: state.paymentRef,
        paidAt: serverTimestamp(),
        paidBy: user.uid,
        updatedAt: serverTimestamp(),
        updatedBy: user.uid
      })
      alert('Payment processed successfully')
      fetchData()
    } catch (err) {
      alert('Failed to process payment')
    }
  }

  const getStatusIcon = (status) => {
    const s = status?.toLowerCase()
    if (s === 'approve' || s === 'approved') return <CheckCircle2 size={14} className="text-green-500" />
    if (s === 'rejected') return <XCircle size={14} className="text-red-500" />
    if (s === 'pending') return <Clock size={14} className="text-amber-500" />
    if (s === 'partial') return <AlertCircle size={14} className="text-blue-500" />
    if (s === 'hold') return <PauseCircle size={14} className="text-gray-500" />
    return <Clock size={14} className="text-gray-400" />
  }

  return (
    <div className="space-y-6 font-inter text-gray-900">
      {/* minimalist header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 py-2 border-b border-gray-100 mb-2">
        <div>
          <h2 className="text-2xl font-black tracking-tight text-gray-900">Approvals</h2>
          <p className="text-[11px] font-bold text-gray-400 uppercase tracking-widest mt-1">
            Manage administrative and employee requests
          </p>
        </div>
        
        <div className="flex bg-gray-50 p-1 rounded-xl border border-gray-200">
          <button 
            onClick={() => setActiveSubTab('advance-expense')}
            className={`px-5 py-2.5 rounded-lg text-[11px] font-black uppercase tracking-widest transition-all ${activeSubTab === 'advance-expense' ? 'bg-white shadow-sm text-indigo-600 border border-gray-100' : 'text-gray-400 hover:text-gray-600'}`}
          >
            Advance / Expense
          </button>
          <button 
            onClick={() => setActiveSubTab('leave-permission')}
            className={`px-5 py-2.5 rounded-lg text-[11px] font-black uppercase tracking-widest transition-all ${activeSubTab === 'leave-permission' ? 'bg-white shadow-sm text-indigo-600 border border-gray-100' : 'text-gray-400 hover:text-gray-600'}`}
          >
            Leave / Permission
          </button>
          {isAccountant && (
            <button 
              onClick={() => setActiveSubTab('payment-queue')}
              className={`px-5 py-2.5 rounded-lg text-[11px] font-black uppercase tracking-widest transition-all ${activeSubTab === 'payment-queue' ? 'bg-white shadow-sm text-indigo-600 border border-gray-100' : 'text-gray-400 hover:text-gray-600'}`}
            >
              Payment Queue
            </button>
          )}
        </div>
      </div>

      {loading ? (
        <div className="py-20 flex justify-center"><Spinner /></div>
      ) : activeSubTab === 'payment-queue' ? (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-gray-50/50 h-[48px] border-b border-gray-100">
                  <th className="px-6 text-[11px] font-black text-gray-400 uppercase tracking-widest">Date</th>
                  <th className="px-6 text-[11px] font-black text-gray-400 uppercase tracking-widest">Type</th>
                  <th className="px-6 text-[11px] font-black text-gray-400 uppercase tracking-widest">Employee</th>
                  <th className="px-6 text-[11px] font-black text-gray-400 uppercase tracking-widest">Amount</th>
                  <th className="px-6 text-[11px] font-black text-gray-400 uppercase tracking-widest">Method</th>
                  <th className="px-6 text-[11px] font-black text-gray-400 uppercase tracking-widest">Ref Number</th>
                  <th className="px-6 text-[11px] font-black text-gray-400 uppercase tracking-widest text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {paymentQueue.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-20 text-center text-gray-300 font-bold uppercase italic tracking-widest opacity-40">No pending payments</td>
                  </tr>
                ) : (
                  paymentQueue.map(item => {
                    const state = actionState[item.id] || { paymentMethod: 'Bank Transfer', paymentRef: '' }
                    return (
                      <tr key={item.id} className="h-[64px] hover:bg-gray-50/30 transition-colors">
                        <td className="px-6">
                          <span className="text-[13px] font-bold text-gray-700">{item.date}</span>
                        </td>
                        <td className="px-6">
                          <span className={`px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest ${item.type === 'Advance' ? 'bg-amber-50 text-amber-600' : 'bg-blue-50 text-blue-600'}`}>
                            {item.type}
                          </span>
                        </td>
                        <td className="px-6">
                          <span className="text-[13px] font-bold text-gray-800">{item.employeeName}</span>
                        </td>
                        <td className="px-6">
                          <span className="text-[14px] font-black text-indigo-600">{formatINR(item.amount)}</span>
                        </td>
                        <td className="px-6">
                          <select 
                            value={state.paymentMethod}
                            onChange={(e) => setActionState(prev => ({ ...prev, [item.id]: { ...prev[item.id], paymentMethod: e.target.value } }))}
                            className="h-[34px] bg-gray-50 border border-gray-200 rounded-lg px-3 text-[11px] font-bold outline-none focus:border-indigo-500"
                          >
                            <option value="Bank Transfer">Bank Transfer</option>
                            <option value="Cash">Cash</option>
                            <option value="Cheque">Cheque</option>
                            <option value="UPI">UPI</option>
                          </select>
                        </td>
                        <td className="px-6">
                          <input 
                            type="text"
                            placeholder="Ref #"
                            value={state.paymentRef}
                            onChange={(e) => setActionState(prev => ({ ...prev, [item.id]: { ...prev[item.id], paymentRef: e.target.value } }))}
                            className="h-[34px] w-32 bg-gray-50 border border-gray-200 rounded-lg px-3 text-[11px] font-bold outline-none focus:border-indigo-500"
                          />
                        </td>
                        <td className="px-6 text-right">
                          <button 
                            onClick={() => handleUpdatePaymentStatus(item.id)}
                            className="h-[34px] px-5 bg-emerald-600 text-white rounded-lg text-[10px] font-black uppercase tracking-[0.1em] shadow-lg shadow-emerald-200 hover:bg-emerald-700 transition-all"
                          >
                            Pay Now
                          </button>
                        </td>
                      </tr>
                    )
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      ) : activeSubTab === 'advance-expense' ? (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-gray-50/50 h-[48px] border-b border-gray-100">
                  <th className="px-6 text-[11px] font-black text-gray-400 uppercase tracking-widest">Date</th>
                  <th className="px-6 text-[11px] font-black text-gray-400 uppercase tracking-widest">Type</th>
                  <th className="px-6 text-[11px] font-black text-gray-400 uppercase tracking-widest">Requested By</th>
                  <th className="px-6 text-[11px] font-black text-gray-400 uppercase tracking-widest">Created By</th>
                  <th className="px-6 text-[11px] font-black text-gray-400 uppercase tracking-widest text-center">HR</th>
                  <th className="px-6 text-[11px] font-black text-gray-400 uppercase tracking-widest text-center">MD</th>
                  <th className="px-6 text-[11px] font-black text-gray-400 uppercase tracking-widest text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {advExpenses.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-20 text-center text-gray-300 font-bold uppercase italic tracking-widest opacity-40">No records found</td>
                  </tr>
                ) : (
                  advExpenses.map(item => {
                    const statusState = actionState[item.id] || { status: 'Pending', remarks: '', showToggle: false }
                    return (
                      <React.Fragment key={item.id}>
                        <tr className="h-[64px] hover:bg-gray-50/30 transition-colors">
                          <td className="px-6">
                            <span className="text-[13px] font-bold text-gray-700">{item.date}</span>
                          </td>
                          <td className="px-6">
                            <span className={`px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest ${item.type === 'Advance' ? 'bg-amber-50 text-amber-600' : 'bg-blue-50 text-blue-600'}`}>
                              {item.type}
                            </span>
                          </td>
                          <td className="px-6">
                            <div className="flex items-center gap-2">
                              <div className="w-6 h-6 rounded-md bg-gray-100 flex items-center justify-center text-[9px] font-black text-gray-500">
                                {getInitials(item.employeeName)}
                              </div>
                              <span className="text-[13px] font-bold text-gray-800">{item.employeeName}</span>
                            </div>
                          </td>
                          <td className="px-6">
                            <span className="text-[12px] font-medium text-gray-500">{item.createdBy || 'Self'}</span>
                          </td>
                          <td className="px-6 text-center">
                            <div className="flex justify-center">
                              {getStatusIcon(item.hrApproval || 'Pending')}
                            </div>
                          </td>
                          <td className="px-6 text-center">
                            <div className="flex justify-center">
                              {getStatusIcon(item.mdApproval || 'Pending')}
                            </div>
                          </td>
                          <td className="px-6">
                            <div className="flex justify-end items-center gap-3">
                              <div className="relative">
                                <button 
                                  onClick={() => setActionState(prev => ({ ...prev, [item.id]: { ...prev[item.id], showToggle: !prev[item.id]?.showToggle } }))}
                                  className="h-[34px] px-4 bg-gray-50 border border-gray-200 rounded-lg flex items-center gap-3 text-[11px] font-black uppercase tracking-widest text-gray-600 hover:bg-white transition-all"
                                >
                                  {statusState.status}
                                  {statusState.showToggle ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                                </button>
                                
                                {statusState.showToggle && (
                                  <div className="absolute right-0 mt-2 w-40 bg-white border border-gray-100 shadow-xl rounded-xl z-20 py-1">
                                    {['Approve', 'Pending', 'Partial', 'Rejected', 'Hold'].map(s => (
                                      <button 
                                        key={s}
                                        onClick={() => setActionState(prev => ({ ...prev, [item.id]: { ...prev[item.id], status: s, showToggle: false } }))}
                                        className="w-full px-4 py-2 text-left text-[11px] font-bold text-gray-600 hover:bg-indigo-50 hover:text-indigo-600 transition-colors"
                                      >
                                        {s}
                                      </button>
                                    ))}
                                  </div>
                                )}
                              </div>
                              <button 
                                onClick={() => handleUpdateAdvExpense(item.id)}
                                className="h-[34px] px-5 bg-indigo-600 text-white rounded-lg text-[10px] font-black uppercase tracking-[0.1em] shadow-lg shadow-indigo-200 hover:bg-indigo-700 transition-all"
                              >
                                Submit
                              </button>
                            </div>
                          </td>
                        </tr>
                        {['Partial', 'Rejected', 'Hold'].includes(statusState.status) && (
                          <tr className="bg-gray-50/20">
                            <td colSpan={7} className="px-6 py-4">
                              <div className="flex items-center gap-3 bg-white p-3 rounded-xl border border-gray-100">
                                <MessageSquare size={16} className="text-gray-400 shrink-0" />
                                <input 
                                  type="text" 
                                  placeholder={`Enter remarks for ${statusState.status} status...`}
                                  value={statusState.remarks}
                                  onChange={(e) => setActionState(prev => ({ ...prev, [item.id]: { ...prev[item.id], remarks: e.target.value } }))}
                                  className="flex-1 bg-transparent border-none text-[12px] font-medium outline-none placeholder:text-gray-300"
                                />
                              </div>
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    )
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-gray-50/50 h-[48px] border-b border-gray-100">
                  <th className="px-6 text-[11px] font-black text-gray-400 uppercase tracking-widest">Requested Date</th>
                  <th className="px-6 text-[11px] font-black text-gray-400 uppercase tracking-widest">Type</th>
                  <th className="px-6 text-[11px] font-black text-gray-400 uppercase tracking-widest">Date / Details</th>
                  <th className="px-6 text-[11px] font-black text-gray-400 uppercase tracking-widest">Status</th>
                  <th className="px-6 text-[11px] font-black text-gray-400 uppercase tracking-widest text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {requests.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="py-20 text-center text-gray-300 font-bold uppercase italic tracking-widest opacity-40">No requests found</td>
                  </tr>
                ) : (
                  requests.map(req => (
                    <tr key={req.id} className="h-[64px] hover:bg-gray-50/30 transition-colors group">
                      <td className="px-6">
                        <div className="flex flex-col">
                          <span className="text-[13px] font-bold text-gray-700">
                            {req.createdAt?.toDate ? req.createdAt.toDate().toLocaleDateString() : 'N/A'}
                          </span>
                          <span className="text-[10px] font-bold text-gray-400 uppercase tracking-tight">{req.employeeName}</span>
                        </div>
                      </td>
                      <td className="px-6">
                        <span className={`px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest ${req.type === 'Leave' ? 'bg-indigo-50 text-indigo-600' : req.type === 'Permission' ? 'bg-amber-50 text-amber-600' : 'bg-emerald-50 text-emerald-600'}`}>
                          {req.type}
                        </span>
                      </td>
                      <td className="px-6">
                        <p className="text-[12px] font-medium text-gray-600">
                          {req.type === 'Leave' && `${req.fromDate} to ${req.toDate}`}
                          {req.type === 'Permission' && `${req.permissionDate} at ${req.permissionTime}`}
                          {req.type === 'Advance' && `₹${req.amount}`}
                        </p>
                        <p className="text-[11px] text-gray-400 italic line-clamp-1">"{req.reason}"</p>
                      </td>
                      <td className="px-6">
                        <div className="flex items-center gap-1.5">
                          {getStatusIcon(req.status)}
                          <span className={`text-[10px] font-black uppercase tracking-widest ${req.status === 'Approved' ? 'text-green-600' : req.status === 'Rejected' ? 'text-red-600' : 'text-amber-600'}`}>
                            {req.status}
                          </span>
                        </div>
                      </td>
                      <td className="px-6">
                        <div className="flex justify-end gap-2">
                          {req.status === 'Pending' ? (
                            <>
                              <button 
                                onClick={() => handleUpdateRequestStatus(req.id, 'Approved')}
                                className="h-[32px] px-4 bg-green-50 text-green-700 rounded-lg text-[10px] font-black uppercase tracking-widest hover:bg-green-600 hover:text-white transition-all"
                              >
                                Approve
                              </button>
                              <button 
                                onClick={() => handleUpdateRequestStatus(req.id, 'Rejected')}
                                className="h-[32px] px-4 bg-red-50 text-red-700 rounded-lg text-[10px] font-black uppercase tracking-widest hover:bg-red-600 hover:text-white transition-all"
                              >
                                Reject
                              </button>
                            </>
                          ) : (
                            <button 
                              onClick={() => handleDeleteRequest(req.id)}
                              className="w-8 h-8 flex items-center justify-center text-gray-300 hover:text-red-500 transition-colors"
                            >
                              <Trash2 size={16} />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
