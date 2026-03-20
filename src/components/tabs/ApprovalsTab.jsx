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
  deleteDoc,
  addDoc,
  getDoc
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
  const [recentAdvExpenses, setRecentAdvExpenses] = useState([])
  const [paymentQueue, setPaymentQueue] = useState([])
  const [recentPayments, setRecentPayments] = useState([])
  const [requests, setRequests] = useState([])
  
  // For the Advance/Expense action toggles
  const [actionState, setActionState] = useState({}) // { id: { status, remarks, showToggle, paymentMethod, paymentRef, partialAmount } }

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
          setPaymentQueue(data.filter(item => (item.mdApproval === 'Approved' || item.mdApproval === 'Partial') && item.paymentStatus !== 'Paid'))
          // Show only Paid items for recent payment history
          setRecentPayments(data.filter(item => item.paymentStatus === 'Paid').slice(0, 10)) // last 10 payments
        } else {
          // Filter: Approved, Partially Approved, and Rejected move to Recent Updates
          // Hold and Pending stay in the active list.
          const active = data.filter(item => {
            const status = item.status || 'Pending'
            return status === 'Pending' || status === 'Hold'
          })
          const recent = data.filter(item => {
            const status = item.status || 'Pending'
            return status === 'Approved' || status === 'Partial' || status === 'Rejected'
          })
          setAdvExpenses(active)
          setRecentAdvExpenses(recent.slice(0, 10))
        }
        
        // Initialize action states
        const initialActionState = {}
        data.forEach(item => {
          initialActionState[item.id] = { 
            status: item.status || 'Pending', 
            remarks: item.remarks || '', 
            showToggle: false,
            paymentMethod: 'Bank Transfer',
            paymentRef: '',
            partialAmount: item.partialAmount || item.amount || ''
          }
        })
        setActionState(initialActionState)

      } else {
        const q = query(
          collection(db, 'organisations', user.orgId, 'requests'),
          orderBy('createdAt', 'desc')
        )
        const snap = await getDocs(q)
        const data = snap.docs.map(d => ({ id: d.id, ...d.data() }))
        setRequests(data)

        // Initialize action states for regular requests too (for remarks)
        const initialActionState = {}
        data.forEach(item => {
          initialActionState[item.id] = { 
            status: item.status || 'Pending', 
            remarks: item.remarks || '', 
            showToggle: false
          }
        })
        setActionState(prev => ({ ...prev, ...initialActionState }))
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

    if (state.status === 'Partial' && (!state.partialAmount || parseFloat(state.partialAmount) <= 0)) {
      return alert('Please provide a valid partial amount')
    }

    try {
      const updateData = {
        updatedAt: serverTimestamp(),
        updatedBy: user.uid
      }

      // HR or MD approval marking
      if (isHR) {
        // HR can only "Submit" to move to next stage (MD)
        // Actually, user said: "If the employee ask for advance, let HR choose submit"
        // This implies HR just approves the move to MD.
        updateData.hrApproval = 'Approved' 
        updateData.hrApprovedBy = user.uid
        updateData.hrApprovedAt = serverTimestamp()
        updateData.hrRemarks = state.remarks
        // HR submit doesn't necessarily change the overall status unless it's a rejection (but user didn't mention HR rejection here)
      }
      
      if (isMD) {
        updateData.status = state.status === 'Approve' ? 'Approved' : state.status
        updateData.mdApproval = state.status === 'Approve' ? 'Approved' : state.status
        updateData.mdApprovedBy = user.uid
        updateData.mdApprovedAt = serverTimestamp()
        updateData.mdRemarks = state.remarks
        
        if (state.status === 'Partial') {
          updateData.partialAmount = parseFloat(state.partialAmount)
        }

        // If MD approves/partials, set main fields for accountant
        if (state.status === 'Approve' || state.status === 'Partial') {
          updateData.approved_by = user.uid
          updateData.approved_at = serverTimestamp()
        }
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
    const state = actionState[id]
    
    if (['Partial', 'Rejected', 'Hold'].includes(status) && (!state || !state.remarks?.trim())) {
      return alert(`Please provide remarks for ${status} status`)
    }

    try {
      const updateData = { 
        status,
        remarks: state?.remarks || '',
        updatedAt: serverTimestamp(),
        updatedBy: user.uid
      }

      if (isHR) {
        updateData.hrApproval = status
        updateData.hrRemarks = state?.remarks || ''
      }
      if (isMD) {
        updateData.mdApproval = status
        updateData.mdRemarks = state?.remarks || ''
      }

      await updateDoc(doc(db, 'organisations', user.orgId, 'requests', id), updateData)
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
      const itemRef = doc(db, 'organisations', user.orgId, 'advances_expenses', id)
      const itemSnap = await getDoc(itemRef)
      const itemData = itemSnap.data()

      await updateDoc(itemRef, {
        paymentStatus: 'Paid',
        paymentMethod: state.paymentMethod,
        paymentRef: state.paymentRef,
        paidAt: serverTimestamp(),
        paidBy: user.uid,
        updatedAt: serverTimestamp(),
        updatedBy: user.uid
      })

      // If it's an advance, add it to the salary advances collection for deduction
      if (itemData?.type === 'Advance') {
        const finalAmount = itemData.partialAmount || itemData.amount
        await addDoc(collection(db, 'organisations', user.orgId, 'advances'), {
          employeeId: itemData.employeeId,
          employeeName: itemData.employeeName,
          amount: finalAmount,
          type: 'Advance',
          date: itemData.date || new Date().toISOString().split('T')[0],
          reason: `Auto-linked from approved request: ${itemData.reason || itemData.category || 'No Reason'}`,
          status: 'Pending', // Will be marked 'Recovered' when salary is processed
          linkedRequestId: id,
          createdAt: serverTimestamp(),
          createdBy: user.uid
        })
      }

      alert('Payment processed and salary advance linked successfully')
      fetchData()
    } catch (err) {
      console.error('Payment processing error:', err)
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
        <>
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

          {/* Recent Payments Section */}
          <div className="mt-12 mb-8">
            <div className="flex items-center gap-2 mb-4">
              <div className="w-1.5 h-6 bg-indigo-600 rounded-full"></div>
              <h3 className="text-sm font-black uppercase tracking-[0.2em] text-gray-500">Recent Payment History</h3>
            </div>
            
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-gray-50/50 h-[40px] border-b border-gray-100">
                      <th className="px-6 text-[10px] font-black text-gray-400 uppercase tracking-widest">Paid Date</th>
                      <th className="px-6 text-[10px] font-black text-gray-400 uppercase tracking-widest">Employee</th>
                      <th className="px-6 text-[10px] font-black text-gray-400 uppercase tracking-widest">Type</th>
                      <th className="px-6 text-[10px] font-black text-gray-400 uppercase tracking-widest text-right">Amount</th>
                      <th className="px-6 text-[10px] font-black text-gray-400 uppercase tracking-widest text-center">Method</th>
                      <th className="px-6 text-[10px] font-black text-gray-400 uppercase tracking-widest text-right">Reference</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {recentPayments.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="py-12 text-center text-[11px] font-bold text-gray-300 uppercase tracking-widest italic opacity-60">No payment history available</td>
                      </tr>
                    ) : (
                      recentPayments.map(item => (
                        <tr key={item.id} className="h-[56px] hover:bg-gray-50/20 transition-colors">
                          <td className="px-6">
                            <span className="text-[12px] font-bold text-gray-500 italic">
                              {item.paidAt?.toDate ? item.paidAt.toDate().toLocaleDateString() : item.date}
                            </span>
                          </td>
                          <td className="px-6">
                            <span className="text-[12px] font-bold text-gray-700">{item.employeeName}</span>
                          </td>
                          <td className="px-6">
                            <span className={`px-2 py-0.5 rounded-md text-[9px] font-black uppercase tracking-widest ${item.type === 'Advance' ? 'bg-amber-50 text-amber-600' : 'bg-blue-50 text-blue-600'}`}>
                              {item.type}
                            </span>
                          </td>
                          <td className="px-6 text-right font-inter">
                            <span className="text-[13px] font-black text-gray-900">{formatINR(item.amount)}</span>
                          </td>
                          <td className="px-6 text-center">
                            <span className="text-[11px] font-medium text-gray-500">{item.paymentMethod}</span>
                          </td>
                          <td className="px-6 text-right">
                            <span className="text-[11px] font-mono text-indigo-400 font-bold tracking-tighter">{item.paymentRef}</span>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </>
      ) : activeSubTab === 'advance-expense' ? (
        <div className="space-y-12">
          {/* Active List (Pending & Hold) */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-gray-50/50 h-[48px] border-b border-gray-100">
                    <th className="px-6 text-[10px] font-black text-gray-400 uppercase tracking-widest">Date</th>
                    <th className="px-6 text-[10px] font-black text-gray-400 uppercase tracking-widest">Type</th>
                    <th className="px-6 text-[10px] font-black text-gray-400 uppercase tracking-widest">Requested By</th>
                    <th className="px-6 text-[10px] font-black text-gray-400 uppercase tracking-widest">Created By</th>
                    <th className="px-6 text-[10px] font-black text-gray-400 uppercase tracking-widest text-right">Amount</th>
                    <th className="px-12 text-[10px] font-black text-gray-400 uppercase tracking-widest text-center whitespace-nowrap">HR Status</th>
                    <th className="px-12 text-[10px] font-black text-gray-400 uppercase tracking-widest text-center whitespace-nowrap">MD Status</th>
                    <th className="px-6 text-[10px] font-black text-gray-400 uppercase tracking-widest text-right">Submit</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {advExpenses.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="py-20 text-center text-gray-300 font-bold uppercase italic tracking-widest opacity-40">No pending records found</td>
                    </tr>
                  ) : (
                    advExpenses.map(item => {
                      const statusState = actionState[item.id] || { status: 'Pending', remarks: '', showToggle: false, partialAmount: item.amount }
                      return (
                        <React.Fragment key={item.id}>
                          <tr className="h-[64px] hover:bg-gray-50/30 transition-colors">
                            <td className="px-6 whitespace-nowrap">
                              <span className="text-[12px] font-bold text-gray-700">{item.date}</span>
                            </td>
                            <td className="px-6">
                              <span className={`px-2.5 py-0.5 rounded-full text-[9px] font-black uppercase tracking-widest ${item.type === 'Advance' ? 'bg-amber-50 text-amber-600' : 'bg-blue-50 text-blue-600'}`}>
                                {item.type}
                              </span>
                            </td>
                            <td className="px-6">
                              <div className="flex items-center gap-2">
                                <div className="w-5 h-5 rounded-md bg-gray-100 flex items-center justify-center text-[8px] font-black text-gray-500">
                                  {getInitials(item.employeeName)}
                                </div>
                                <span className="text-[12px] font-bold text-gray-800 whitespace-nowrap">{item.employeeName}</span>
                              </div>
                            </td>
                            <td className="px-6">
                              <span className="text-[11px] font-medium text-gray-500 whitespace-nowrap">{item.createdBy || 'Self'}</span>
                            </td>
                            <td className="px-6 text-right font-inter">
                              <span className="text-[12px] font-black text-gray-900">{formatINR(item.amount)}</span>
                            </td>
                            <td className="px-12 text-center">
                              <div className="flex justify-center">
                                {getStatusIcon(item.hrApproval || 'Pending')}
                              </div>
                            </td>
                            <td className="px-12 text-center">
                              <div className="flex justify-center">
                                {getStatusIcon(item.mdApproval || 'Pending')}
                              </div>
                            </td>
                            <td className="px-6">
                              <div className="flex justify-end items-center gap-3">
                                {isMD ? (
                                  <div className="relative">
                                    <button 
                                      onClick={() => setActionState(prev => ({ ...prev, [item.id]: { ...prev[item.id], showToggle: !prev[item.id]?.showToggle } }))}
                                      className="h-[30px] px-3 bg-gray-50 border border-gray-200 rounded-lg flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-gray-600 hover:bg-white transition-all whitespace-nowrap"
                                    >
                                      {statusState.status}
                                      {statusState.showToggle ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                                    </button>
                                    
                                    {statusState.showToggle && (
                                      <div className="absolute right-0 mt-2 w-32 bg-white border border-gray-100 shadow-xl rounded-xl z-20 py-1">
                                        {['Approve', 'Hold', 'Partial', 'Rejected'].map(s => (
                                          <button 
                                            key={s}
                                            onClick={() => setActionState(prev => ({ ...prev, [item.id]: { ...prev[item.id], status: s, showToggle: false } }))}
                                            className="w-full px-4 py-2 text-left text-[10px] font-bold text-gray-600 hover:bg-indigo-50 hover:text-indigo-600 transition-colors"
                                          >
                                            {s}
                                          </button>
                                        ))}
                                      </div>
                                    )}
                                  </div>
                                ) : isHR ? (
                                  <span className="text-[10px] font-black text-indigo-500 uppercase tracking-widest">Ready to Submit</span>
                                ) : (
                                  <span className="text-[10px] font-black text-gray-300 uppercase tracking-widest italic">Awaiting Action</span>
                                )}

                                <button 
                                  onClick={() => handleUpdateAdvExpense(item.id)}
                                  className="h-[30px] px-4 bg-indigo-600 text-white rounded-lg text-[9px] font-black uppercase tracking-[0.1em] shadow-lg shadow-indigo-200 hover:bg-indigo-700 transition-all"
                                >
                                  {isHR && !isMD ? 'Submit' : 'Submit'}
                                </button>
                              </div>
                            </td>
                          </tr>
                          {/* Remarks and Partial Amount Inputs */}
                          {(isHR || isMD) && (
                            <tr className="bg-gray-50/20">
                              <td colSpan={8} className="px-6 py-3">
                                <div className="flex flex-col md:flex-row gap-4">
                                  {statusState.status === 'Partial' && isMD && (
                                    <div className="flex items-center gap-2 bg-white p-2 rounded-xl border border-indigo-100 w-full md:w-64">
                                      <span className="text-[9px] font-black text-indigo-500 uppercase ml-1">Partial Amt:</span>
                                      <input 
                                        type="number" 
                                        value={statusState.partialAmount}
                                        onChange={(e) => setActionState(prev => ({ ...prev, [item.id]: { ...prev[item.id], partialAmount: e.target.value } }))}
                                        className="flex-1 bg-transparent border-none text-[11px] font-black text-indigo-600 outline-none"
                                        placeholder="Enter amount"
                                      />
                                    </div>
                                  )}
                                  <div className="flex-1 flex items-center gap-3 bg-white p-2 rounded-xl border border-gray-100">
                                    <MessageSquare size={14} className="text-gray-400 shrink-0 ml-1" />
                                    <input 
                                      type="text" 
                                      placeholder={`Enter remarks for ${statusState.status} status...`}
                                      value={statusState.remarks}
                                      onChange={(e) => setActionState(prev => ({ ...prev, [item.id]: { ...prev[item.id], remarks: e.target.value } }))}
                                      className="flex-1 bg-transparent border-none text-[11px] font-medium outline-none placeholder:text-gray-300"
                                    />
                                  </div>
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

          {/* Recent Updates List (Approved, Partial, Rejected) */}
          <div>
            <div className="flex items-center gap-2 mb-4">
              <div className="w-1.5 h-5 bg-emerald-500 rounded-full"></div>
              <h3 className="text-xs font-black uppercase tracking-[0.2em] text-gray-500">Recent Updates</h3>
            </div>
            
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-gray-50/50 h-[40px] border-b border-gray-100">
                      <th className="px-6 text-[10px] font-black text-gray-400 uppercase tracking-widest">Date</th>
                      <th className="px-6 text-[10px] font-black text-gray-400 uppercase tracking-widest">Type</th>
                      <th className="px-6 text-[10px] font-black text-gray-400 uppercase tracking-widest">Employee</th>
                      <th className="px-6 text-[10px] font-black text-gray-400 uppercase tracking-widest text-right">Amount</th>
                      <th className="px-12 text-[10px] font-black text-gray-400 uppercase tracking-widest text-center whitespace-nowrap">HR Status</th>
                      <th className="px-12 text-[10px] font-black text-gray-400 uppercase tracking-widest text-center whitespace-nowrap">MD Status</th>
                      <th className="px-6 text-[10px] font-black text-gray-400 uppercase tracking-widest text-right">Final Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {recentAdvExpenses.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="py-12 text-center text-[10px] font-bold text-gray-300 uppercase tracking-widest italic opacity-60">No recent updates</td>
                      </tr>
                    ) : (
                      recentAdvExpenses.map(item => (
                        <tr key={item.id} className="h-[52px] hover:bg-gray-50/20 transition-colors">
                          <td className="px-6 whitespace-nowrap">
                            <span className="text-[11px] font-bold text-gray-500">{item.date}</span>
                          </td>
                          <td className="px-6">
                            <span className={`px-2 py-0.5 rounded-md text-[8px] font-black uppercase tracking-widest ${item.type === 'Advance' ? 'bg-amber-50 text-amber-600' : 'bg-blue-50 text-blue-600'}`}>
                              {item.type}
                            </span>
                          </td>
                          <td className="px-6">
                            <span className="text-[11px] font-bold text-gray-700">{item.employeeName}</span>
                          </td>
                          <td className="px-6 text-right font-inter">
                            <div className="flex flex-col items-end">
                              <span className={`text-[12px] font-black ${item.status === 'Partial' ? 'text-gray-400 line-through' : 'text-gray-900'}`}>{formatINR(item.amount)}</span>
                              {item.status === 'Partial' && item.partialAmount && (
                                <span className="text-[12px] font-black text-indigo-600">{formatINR(item.partialAmount)}</span>
                              )}
                            </div>
                          </td>
                          <td className="px-12 text-center">
                            <div className="flex justify-center">
                              {getStatusIcon(item.hrApproval || 'Pending')}
                            </div>
                          </td>
                          <td className="px-12 text-center">
                            <div className="flex justify-center">
                              {getStatusIcon(item.mdApproval || 'Pending')}
                            </div>
                          </td>
                          <td className="px-6 text-right">
                            <span className={`text-[10px] font-black uppercase tracking-widest ${
                              item.status === 'Approved' ? 'text-emerald-500' : 
                              item.status === 'Partial' ? 'text-blue-500' : 
                              item.status === 'Rejected' ? 'text-red-500' : 'text-gray-400'
                            }`}>
                              {item.status}
                            </span>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div className="space-y-8">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Main Requests Table (60% width on LG) */}
            <div className="lg:col-span-2 space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-1 h-4 bg-indigo-600 rounded-full"></div>
                  <h3 className="text-[11px] font-black uppercase tracking-widest text-gray-500">Pending Leave & Permissions</h3>
                </div>
              </div>
              <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="bg-gray-50/50 h-[44px] border-b border-gray-100">
                        <th className="px-6 text-[10px] font-black text-gray-400 uppercase tracking-widest">Requested Date</th>
                        <th className="px-6 text-[10px] font-black text-gray-400 uppercase tracking-widest text-center">Type</th>
                        <th className="px-6 text-[10px] font-black text-gray-400 uppercase tracking-widest">Leave Period</th>
                        <th className="px-6 text-[10px] font-black text-gray-400 uppercase tracking-widest text-center">Status</th>
                        <th className="px-6 text-[10px] font-black text-gray-400 uppercase tracking-widest text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      {requests.filter(r => r.status === 'Pending' || r.status === 'Hold').length === 0 ? (
                        <tr>
                          <td colSpan={5} className="py-16 text-center text-gray-300 font-bold uppercase italic tracking-widest opacity-40">No pending requests</td>
                        </tr>
                      ) : (
                        requests.filter(r => r.status === 'Pending' || r.status === 'Hold').map(req => {
                          const formatDate = (date) => {
                            if (!date) return '--/--/--'
                            const [y, m, d] = date.split('-')
                            return `${d}/${m}/${y.slice(-2)}`
                          }
                          const createdAt = req.createdAt?.toDate ? req.createdAt.toDate() : new Date()
                          const requestedDate = `${String(createdAt.getDate()).padStart(2, '0')}/${String(createdAt.getMonth() + 1).padStart(2, '0')}/${String(createdAt.getFullYear()).slice(-2)}`
                          
                          return (
                            <React.Fragment key={req.id}>
                              <tr className="h-[60px] hover:bg-gray-50/30 transition-colors">
                                <td className="px-6">
                                  <div className="flex flex-col">
                                    <span className="text-[12px] font-bold text-gray-700">{requestedDate}</span>
                                    <span className="text-[9px] font-bold text-gray-400 uppercase tracking-tight">{req.employeeName}</span>
                                  </div>
                                </td>
                                <td className="px-6 text-center">
                                  <span className={`px-2 py-0.5 rounded-md text-[8px] font-black uppercase tracking-widest ${req.type === 'Leave' ? 'bg-indigo-50 text-indigo-600' : 'bg-amber-50 text-amber-600'}`}>
                                    {req.type}
                                  </span>
                                </td>
                                <td className="px-6">
                                  <p className="text-[12px] font-medium text-gray-600">
                                    {req.type === 'Leave' ? `${formatDate(req.fromDate)} - ${formatDate(req.toDate)}` : formatDate(req.permissionDate)}
                                  </p>
                                  <p className="text-[10px] text-gray-400 italic line-clamp-1 max-w-[150px]">"{req.reason}"</p>
                                </td>
                                <td className="px-6 text-center">
                                  <div className="flex flex-col items-center">
                                    <div className={`px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-widest ${req.status === 'Hold' ? 'bg-gray-100 text-gray-500' : 'bg-amber-50 text-amber-600'}`}>
                                      {req.status === 'Hold' ? 'Pending (Hold)' : 'Pending'}
                                    </div>
                                  </div>
                                </td>
                                <td className="px-6">
                                  <div className="flex justify-end gap-1.5">
                                    <button onClick={() => handleUpdateRequestStatus(req.id, 'Approved')} className="h-7 px-3 bg-emerald-50 text-emerald-700 rounded-md text-[9px] font-black uppercase tracking-widest hover:bg-emerald-600 hover:text-white transition-all">Approve</button>
                                    <button onClick={() => handleUpdateRequestStatus(req.id, 'Rejected')} className="h-7 px-3 bg-rose-50 text-rose-700 rounded-md text-[9px] font-black uppercase tracking-widest hover:bg-rose-600 hover:text-white transition-all">Reject</button>
                                    <button onClick={() => handleUpdateRequestStatus(req.id, 'Hold')} className="h-7 px-3 bg-slate-50 text-slate-700 rounded-md text-[9px] font-black uppercase tracking-widest hover:bg-slate-600 hover:text-white transition-all">Hold</button>
                                  </div>
                                </td>
                              </tr>
                              {(req.status === 'Pending' || req.status === 'Hold') && (
                                <tr className="bg-gray-50/20">
                                  <td colSpan={5} className="px-6 py-1.5">
                                    <div className="flex items-center gap-3 bg-white p-1.5 rounded-lg border border-gray-100 max-w-sm ml-auto">
                                      <MessageSquare size={12} className="text-gray-400 shrink-0 ml-1" />
                                      <input 
                                        type="text" 
                                        placeholder="Remarks..."
                                        value={actionState[req.id]?.remarks || ''}
                                        onChange={(e) => setActionState(prev => ({ ...prev, [req.id]: { ...prev[req.id], remarks: e.target.value } }))}
                                        className="flex-1 bg-transparent border-none text-[10px] font-medium outline-none placeholder:text-gray-300"
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
            </div>

            {/* Upcoming Leave (30% width on LG) */}
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <div className="w-1 h-4 bg-emerald-500 rounded-full"></div>
                <h3 className="text-[11px] font-black uppercase tracking-widest text-gray-500">Upcoming This Month</h3>
              </div>
              <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden min-h-[300px]">
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="bg-gray-50/50 h-[44px] border-b border-gray-100">
                        <th className="px-4 text-[10px] font-black text-gray-400 uppercase tracking-widest">Employee</th>
                        <th className="px-4 text-[10px] font-black text-gray-400 uppercase tracking-widest text-right">Leave Date</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      {(() => {
                        const today = new Date()
                        const thisMonth = today.toISOString().substring(0, 7)
                        const upcoming = requests.filter(r => 
                          r.status === 'Approved' && 
                          (r.fromDate?.startsWith(thisMonth) || r.permissionDate?.startsWith(thisMonth)) &&
                          (new Date(r.fromDate || r.permissionDate) >= today)
                        )
                        if (upcoming.length === 0) return <tr><td colSpan={2} className="py-12 text-center text-[10px] font-bold text-gray-300 uppercase italic">No upcoming leaves</td></tr>
                        return upcoming.map(r => (
                          <tr key={r.id} className="h-12 hover:bg-gray-50/30">
                            <td className="px-4">
                              <span className="text-[12px] font-bold text-gray-700">{r.employeeName}</span>
                            </td>
                            <td className="px-4 text-right">
                              <span className="text-[11px] font-black text-indigo-500">
                                {r.fromDate ? r.fromDate.split('-').reverse().join('/') : r.permissionDate.split('-').reverse().join('/')}
                              </span>
                            </td>
                          </tr>
                        ))
                      })()}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </div>

          {/* Recent Leave Updates (40% width, bottom right) */}
          <div className="flex justify-end">
            <div className="w-full lg:w-[40%] space-y-4">
              <div className="flex items-center gap-2">
                <div className="w-1 h-4 bg-slate-400 rounded-full"></div>
                <h3 className="text-[11px] font-black uppercase tracking-widest text-gray-500">Recent Leave (This Month Past)</h3>
              </div>
              <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="bg-gray-50/50 h-[40px] border-b border-gray-100">
                        <th className="px-4 text-[10px] font-black text-gray-400 uppercase tracking-widest">Employee</th>
                        <th className="px-4 text-[10px] font-black text-gray-400 uppercase tracking-widest">Date</th>
                        <th className="px-4 text-[10px] font-black text-gray-400 uppercase tracking-widest text-right">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      {(() => {
                        const today = new Date()
                        const thisMonth = today.toISOString().substring(0, 7)
                        const past = requests.filter(r => 
                          (r.status === 'Approved' || r.status === 'Rejected') && 
                          (r.fromDate?.startsWith(thisMonth) || r.permissionDate?.startsWith(thisMonth)) &&
                          (new Date(r.fromDate || r.permissionDate) < today)
                        ).slice(0, 5)
                        if (past.length === 0) return <tr><td colSpan={3} className="py-12 text-center text-[10px] font-bold text-gray-300 uppercase italic">No recent history</td></tr>
                        return past.map(r => (
                          <tr key={r.id} className="h-12 hover:bg-gray-50/30">
                            <td className="px-4">
                              <span className="text-[11px] font-bold text-gray-700">{r.employeeName}</span>
                            </td>
                            <td className="px-4">
                              <span className="text-[10px] font-medium text-gray-500">
                                {r.fromDate ? r.fromDate.split('-').reverse().join('/') : r.permissionDate.split('-').reverse().join('/')}
                              </span>
                            </td>
                            <td className="px-4 text-right">
                              <span className={`text-[9px] font-black uppercase tracking-widest ${r.status === 'Approved' ? 'text-emerald-500' : 'text-rose-500'}`}>
                                {r.status}
                              </span>
                            </td>
                          </tr>
                        ))
                      })()}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
    </div>
  )
}
