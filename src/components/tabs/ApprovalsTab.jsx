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
import { logActivity } from '../../hooks/useActivityLog'
import { 
  CheckCircle2, 
  XCircle, 
  Clock, 
  AlertCircle, 
  PauseCircle, 
  MessageSquare,
  Trash2
} from 'lucide-react'

function getInitials(name) {
  return name?.split(' ').map(n => n[0]).join('').toUpperCase() || '??'
}

/** Display stored YYYY-MM-DD or loose strings as dd/mm/yyyy */
function formatAdvDateDMY(dateStr) {
  if (!dateStr) return '—'
  const s = String(dateStr).trim()
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (iso) return `${iso[3]}/${iso[2]}/${iso[1]}`
  return s
}

const ADV_PICK_OPTIONS = ['Approve', 'Partial', 'Hold', 'Rejected']

function storedApprovalToPick(stored) {
  if (!stored || stored === 'Pending') return 'Approve'
  if (stored === 'Approved') return 'Approve'
  return stored
}

function pickToStoredApproval(pick) {
  if (pick === 'Approve') return 'Approved'
  return pick
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
  const [leaveApprovalSetting, setLeaveApprovalSetting] = useState(null)
  
  // For the Advance/Expense action toggles
  const [actionState, setActionState] = useState({}) // hrPick, mdPick, remarks, partialAmount, paymentMethod, paymentRef, ...
  const [advMenuOpen, setAdvMenuOpen] = useState(null) // `${id}-hr` | `${id}-md` | null

  const isAdmin = user?.role?.toLowerCase() === 'admin'
  const canApprove = isAdmin || user?.permissions?.Approvals?.approve === true
  const isAccountant = isAdmin || user?.role?.toLowerCase() === 'accountant' || user?.permissions?.isAccountant === true
  const isMD = isAdmin || user?.role?.toLowerCase() === 'md'
  const isHR = isAdmin || user?.role?.toLowerCase() === 'hr'

  useEffect(() => {
    if (!user?.orgId) return
    const fetchSettings = async () => {
      const q = query(collection(db, 'organisations', user.orgId, 'approvalSettings'), where('moduleName', '==', 'Leave'))
      const snap = await getDocs(q)
      if (!snap.empty) {
        setLeaveApprovalSetting(snap.docs[0].data())
      }
    }
    fetchSettings()
  }, [user?.orgId])

  useEffect(() => {
    if (!user?.orgId) return
    fetchData()
  }, [user?.orgId, activeSubTab])

  useEffect(() => {
    if (!advMenuOpen) return
    const close = (e) => {
      const root = e.target.closest?.('[data-adv-dropdown-root]')
      if (root) return
      setAdvMenuOpen(null)
    }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [advMenuOpen])

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
            partialAmount: item.partialAmount || item.amount || '',
            hrPick: storedApprovalToPick(item.hrApproval),
            mdPick: storedApprovalToPick(item.mdApproval),
            hrPartialAmount: item.hrPartialAmount ?? item.amount ?? ''
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

  const handleHrAdvExpenseSubmit = async (id) => {
    if (!isHR) return alert('No permission')
    const state = actionState[id]
    if (!state) return

    const pick = state.hrPick || 'Approve'
    const item = advExpenses.find((x) => x.id === id)

    if (['Partial', 'Rejected', 'Hold'].includes(pick) && !state.remarks?.trim()) {
      return alert(`Please provide remarks for ${pick}`)
    }
    if (pick === 'Partial' && (!state.hrPartialAmount || parseFloat(state.hrPartialAmount) <= 0)) {
      return alert('Please provide a valid HR partial amount')
    }

    try {
      const hrApproval = pickToStoredApproval(pick)
      const updateData = {
        updatedAt: serverTimestamp(),
        updatedBy: user.uid,
        hrApproval,
        hrApprovedBy: user.uid,
        hrApprovedAt: serverTimestamp(),
        hrRemarks: state.remarks || ''
      }

      if (pick === 'Partial') {
        updateData.hrPartialAmount = parseFloat(state.hrPartialAmount)
      }

      if (pick === 'Rejected') {
        updateData.status = 'Rejected'
      } else if (pick === 'Hold') {
        updateData.status = 'Hold'
      } else if (pick === 'Approve' || pick === 'Partial') {
        if (item?.status === 'Hold') updateData.status = 'Pending'
      }

      await updateDoc(doc(db, 'organisations', user.orgId, 'advances_expenses', id), updateData)
      setAdvMenuOpen(null)
      alert('HR status updated')
      fetchData()
    } catch (err) {
      alert('Failed to update HR status')
    }
  }

  const handleMdAdvExpenseSubmit = async (id) => {
    if (!isMD) return alert('No permission')
    const state = actionState[id]
    if (!state) return

    const item = advExpenses.find((x) => x.id === id)
    const hrOk = ['Approved', 'Partial'].includes(item?.hrApproval || '')
    if (!hrOk && !isAdmin) {
      return alert('HR must approve (or partial) before MD action')
    }

    const pick = state.mdPick || 'Approve'

    if (['Partial', 'Rejected', 'Hold'].includes(pick) && !state.remarks?.trim()) {
      return alert(`Please provide remarks for ${pick}`)
    }
    if (pick === 'Partial' && (!state.partialAmount || parseFloat(state.partialAmount) <= 0)) {
      return alert('Please provide a valid partial amount')
    }

    try {
      const updateData = {
        updatedAt: serverTimestamp(),
        updatedBy: user.uid,
        mdApprovedBy: user.uid,
        mdApprovedAt: serverTimestamp(),
        mdRemarks: state.remarks || ''
      }

      if (pick === 'Approve') {
        updateData.status = 'Approved'
        updateData.mdApproval = 'Approved'
        updateData.approved_by = user.uid
        updateData.approved_at = serverTimestamp()
      } else if (pick === 'Partial') {
        updateData.status = 'Partial'
        updateData.mdApproval = 'Partial'
        updateData.partialAmount = parseFloat(state.partialAmount)
        updateData.approved_by = user.uid
        updateData.approved_at = serverTimestamp()
      } else if (pick === 'Rejected') {
        updateData.status = 'Rejected'
        updateData.mdApproval = 'Rejected'
      } else if (pick === 'Hold') {
        updateData.status = 'Hold'
        updateData.mdApproval = 'Hold'
      }

      if (isAdmin && pick === 'Approve') {
        const itemSnap = await getDoc(doc(db, 'organisations', user.orgId, 'advances_expenses', id))
        const itemData = itemSnap.data()
        await logActivity(user.orgId, user, {
          module: 'AdvanceExpense',
          action: 'Approved by admin',
          detail: `${itemData?.type || 'Advance/Expense'} for ${itemData?.employeeName} approved by admin bypass`
        })
      }

      await updateDoc(doc(db, 'organisations', user.orgId, 'advances_expenses', id), updateData)
      setAdvMenuOpen(null)
      alert('MD status updated')
      fetchData()
    } catch (err) {
      alert('Failed to update MD status')
    }
  }

  const handleUpdateRequestStatus = async (id, status) => {
    if (!canApprove) return alert('No permission')
    const state = actionState[id]
    
    if (['Partial', 'Rejected', 'Hold'].includes(status) && (!state || !state.remarks?.trim())) {
      return alert(`Please provide remarks for ${status} status`)
    }

    try {
      const req = requests.find(r => r.id === id)
      const updateData = { 
        updatedAt: serverTimestamp(),
        updatedBy: user.uid
      }

      if (req.type === 'Leave' || req.type === 'Permission') {
        const type = req.approvalType || 'single'
        
        if (type === 'single') {
          // Any authorized role can approve
          const canSingleAct = isAdmin || leaveApprovalSetting?.approvers?.includes(user.role)
          if (!canSingleAct) return alert('You are not authorized to approve this request.')
          
          updateData.status = status
          updateData.remarks = state?.remarks || ''
          updateData.approvedBy = user.uid
          updateData.approvedAt = serverTimestamp()
        } else {
          // Multi-stage progression
          const currentStage = req.currentStage || 0
          const totalStages = req.totalStages || 1
          const isLastStage = currentStage === totalStages - 1
          
          // Check if current user is the correct approver for this stage
          const isMDUser = user.role?.toLowerCase() === 'md' || isAdmin
          const isAssignedApprover = user.uid === req.approverIds?.[currentStage]
          
          // Instruction: "last must be MD only"
          const canActThisStage = isLastStage ? isMDUser : (isAssignedApprover || isHR)

          if (!canActThisStage) return alert('It is not your turn to approve this request.')

          if (isLastStage) {
            // MD / Final Stage
            updateData.mdApproval = status
            updateData.mdRemarks = state?.remarks || ''
            updateData.mdApprovedBy = user.uid
            updateData.mdApprovedAt = serverTimestamp()
            
            if (status === 'Approved') {
              updateData.status = 'Approved'
            } else {
              updateData.status = status
            }
          } else {
            // Intermediate Stages
            updateData.deptHeadApproval = status
            updateData.deptHeadRemarks = state?.remarks || ''
            updateData.deptHeadApprovedBy = user.uid
            updateData.deptHeadApprovedAt = serverTimestamp()
            
            if (status === 'Approved') {
              updateData.currentStage = currentStage + 1
              // If it was the only stage (not possible with totalStages > 1 but safe)
              if (totalStages === 1) updateData.status = 'Approved'
            } else {
              updateData.status = status
            }
          }
        }
        
        // Admin bypass
        if (isAdmin) {
          updateData.status = status
          updateData.deptHeadApproval = status
          updateData.mdApproval = status
        }
      } else {
        // Fallback for non-leave types
        updateData.status = status
        updateData.remarks = state?.remarks || ''
        if (isHR) {
          updateData.hrApproval = status
          updateData.hrRemarks = state?.remarks || ''
        }
        if (isMD) {
          updateData.mdApproval = status
          updateData.mdRemarks = state?.remarks || ''
        }
      }

      // Admin Logging for requests
      if (isAdmin && (status === 'Approve' || status === 'Approved')) {
        await logActivity(user.orgId, user, {
          module: req.type || 'Requests',
          action: 'Approved by admin',
          detail: `${req.type || 'Request'} for ${req.employeeName} set to ${status} by admin bypass`
        })
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
      
      // Admin Logging
      if (isAdmin) {
        await logActivity(user.orgId, user, {
          module: 'PaymentQueue',
          action: 'Approved by admin',
          detail: `Payment for ${itemData?.employeeName} (₹${itemData?.partialAmount || itemData?.amount}) processed by admin`
        })
      }

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
                            <span className="text-[13px] font-bold text-gray-700">{formatAdvDateDMY(item.date)}</span>
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
            
            <div className="rounded-lg border border-zinc-200 bg-white shadow-sm overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full caption-bottom text-sm border-collapse">
                  <thead className="border-b border-zinc-200 bg-zinc-50/80">
                    <tr className="border-b border-zinc-200">
                      <th className="h-10 px-3 text-left align-middle text-xs font-medium text-zinc-500">Paid Date</th>
                      <th className="h-10 px-3 text-left align-middle text-xs font-medium text-zinc-500">Employee</th>
                      <th className="h-10 px-3 text-left align-middle text-xs font-medium text-zinc-500">Type</th>
                      <th className="h-10 px-3 text-right align-middle text-xs font-medium text-zinc-500">Amount</th>
                      <th className="h-10 px-3 text-center align-middle text-xs font-medium text-zinc-500">Method</th>
                      <th className="h-10 px-3 text-right align-middle text-xs font-medium text-zinc-500">Reference</th>
                    </tr>
                  </thead>
                  <tbody className="[&_tr:last-child]:border-0">
                    {recentPayments.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="p-8 text-center align-middle text-xs font-medium text-zinc-400">No payment history available</td>
                      </tr>
                    ) : (
                      recentPayments.map(item => (
                        <tr key={item.id} className="border-b border-zinc-100 hover:bg-zinc-50/60">
                          <td className="px-3 py-3 align-middle whitespace-nowrap text-sm text-zinc-600">
                            {item.paidAt?.toDate
                              ? formatAdvDateDMY(
                                  `${item.paidAt.toDate().getFullYear()}-${String(item.paidAt.toDate().getMonth() + 1).padStart(2, '0')}-${String(item.paidAt.toDate().getDate()).padStart(2, '0')}`
                                )
                              : formatAdvDateDMY(item.date)}
                          </td>
                          <td className="px-3 py-3 align-middle text-sm font-medium text-zinc-900">{item.employeeName}</td>
                          <td className="px-3 py-3 align-middle">
                            <span className={`inline-flex rounded-md border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${item.type === 'Advance' ? 'border-amber-200 bg-amber-50 text-amber-800' : 'border-blue-200 bg-blue-50 text-blue-800'}`}>
                              {item.type}
                            </span>
                          </td>
                          <td className="px-3 py-3 align-middle text-right text-sm font-semibold tabular-nums text-zinc-900">{formatINR(item.amount)}</td>
                          <td className="px-3 py-3 align-middle text-center text-sm text-zinc-600">{item.paymentMethod}</td>
                          <td className="px-3 py-3 align-middle text-right font-mono text-xs font-semibold text-indigo-600">{item.paymentRef}</td>
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
          {/* Active List (Pending & Hold) — shadcn-style table */}
          <div className="rounded-lg border border-zinc-200 bg-white text-zinc-950 shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full caption-bottom text-sm border-collapse">
                <thead className="border-b border-zinc-200 bg-zinc-50/80 [&_tr]:border-b">
                  <tr className="border-b border-zinc-200">
                    <th className="h-10 px-3 text-left align-middle text-xs font-medium text-zinc-500">Date</th>
                    <th className="h-10 px-3 text-left align-middle text-xs font-medium text-zinc-500">Type</th>
                    <th className="h-10 px-3 text-left align-middle text-xs font-medium text-zinc-500">Requested By</th>
                    <th className="h-10 px-3 text-left align-middle text-xs font-medium text-zinc-500">Created By</th>
                    <th className="h-10 px-3 text-right align-middle text-xs font-medium text-zinc-500">Amount</th>
                    <th className="h-10 px-3 text-center align-middle text-xs font-medium text-zinc-500 whitespace-nowrap min-w-[140px]">HR status</th>
                    <th className="h-10 px-3 text-center align-middle text-xs font-medium text-zinc-500 whitespace-nowrap min-w-[140px]">MD status</th>
                    <th className="h-10 px-3 text-right align-middle text-xs font-medium text-zinc-500 min-w-[120px]">Action</th>
                  </tr>
                </thead>
                <tbody className="[&_tr:last-child]:border-0">
                  {advExpenses.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="p-10 text-center align-middle text-xs font-medium text-zinc-400">No pending records found</td>
                    </tr>
                  ) : (
                    advExpenses.map(item => {
                      const rowState = actionState[item.id] || { remarks: '', partialAmount: item.amount, hrPick: 'Approve', mdPick: 'Approve', hrPartialAmount: item.amount }
                      const hrMenuId = `${item.id}-hr`
                      const mdMenuId = `${item.id}-md`
                      return (
                        <React.Fragment key={item.id}>
                          <tr className="border-b border-zinc-100 transition-colors hover:bg-zinc-50/80">
                            <td className="px-3 py-3 align-middle whitespace-nowrap text-sm font-medium text-zinc-900">
                              {formatAdvDateDMY(item.date)}
                            </td>
                            <td className="px-3 py-3 align-middle">
                              <span className={`inline-flex items-center rounded-md border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${item.type === 'Advance' ? 'border-amber-200 bg-amber-50 text-amber-800' : 'border-blue-200 bg-blue-50 text-blue-800'}`}>
                                {item.type}
                              </span>
                            </td>
                            <td className="px-3 py-3 align-middle">
                              <div className="flex items-center gap-2">
                                <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-zinc-200 bg-zinc-100 text-[9px] font-bold text-zinc-600">
                                  {getInitials(item.employeeName)}
                                </div>
                                <span className="text-sm font-medium text-zinc-900 whitespace-nowrap">{item.employeeName}</span>
                              </div>
                            </td>
                            <td className="px-3 py-3 align-middle text-sm text-zinc-600 whitespace-nowrap">{item.createdBy || 'Self'}</td>
                            <td className="px-3 py-3 align-middle text-right text-sm font-semibold tabular-nums text-zinc-900">{formatINR(item.amount)}</td>
                            <td className="px-3 py-3 align-middle">
                              <div
                                className="relative mx-auto flex w-full max-w-[160px] flex-col items-center gap-2"
                                data-adv-dropdown-root
                              >
                                <div className="flex h-8 items-center justify-center text-zinc-500">
                                  {getStatusIcon(item.hrApproval || 'Pending')}
                                </div>
                                {isHR ? (
                                  <>
                                    <button
                                      type="button"
                                      onMouseDown={(e) => e.stopPropagation()}
                                      onClick={() => setAdvMenuOpen((o) => (o === hrMenuId ? null : hrMenuId))}
                                      className="min-h-[28px] w-full max-w-[132px] rounded-md border border-zinc-200 bg-white px-2 py-1 text-center text-[11px] font-medium text-zinc-800 shadow-sm outline-none ring-offset-2 hover:bg-zinc-50 focus-visible:ring-2 focus-visible:ring-zinc-400"
                                    >
                                      {rowState.hrPick}
                                    </button>
                                    {advMenuOpen === hrMenuId && (
                                      <div
                                        className="absolute left-1/2 top-full z-30 mt-1 w-[128px] -translate-x-1/2 rounded-md border border-zinc-200 bg-white py-0.5 shadow-md"
                                        data-adv-dropdown-root
                                        onMouseDown={(e) => e.stopPropagation()}
                                      >
                                        {ADV_PICK_OPTIONS.map((opt) => (
                                          <button
                                            key={opt}
                                            type="button"
                                            onClick={() => {
                                              setActionState((prev) => ({
                                                ...prev,
                                                [item.id]: { ...prev[item.id], hrPick: opt }
                                              }))
                                              setAdvMenuOpen(null)
                                            }}
                                            className="w-full px-2.5 py-1.5 text-left text-[11px] font-medium text-zinc-700 hover:bg-zinc-100"
                                          >
                                            {opt}
                                          </button>
                                        ))}
                                      </div>
                                    )}
                                    <button
                                      type="button"
                                      onClick={() => handleHrAdvExpenseSubmit(item.id)}
                                      className="h-8 w-full max-w-[132px] rounded-md bg-zinc-900 px-2 text-[10px] font-semibold uppercase tracking-wide text-white shadow hover:bg-zinc-800"
                                    >
                                      Submit
                                    </button>
                                  </>
                                ) : (
                                  <span className="text-center text-[11px] font-medium text-zinc-500">{item.hrApproval || 'Pending'}</span>
                                )}
                              </div>
                            </td>
                            <td className="px-3 py-3 align-middle">
                              <div
                                className="relative mx-auto flex w-full max-w-[160px] flex-col items-center gap-2"
                                data-adv-dropdown-root
                              >
                                <div className="flex h-8 items-center justify-center text-zinc-500">
                                  {getStatusIcon(item.mdApproval || 'Pending')}
                                </div>
                                {isMD ? (
                                  <>
                                    <button
                                      type="button"
                                      onMouseDown={(e) => e.stopPropagation()}
                                      onClick={() => setAdvMenuOpen((o) => (o === mdMenuId ? null : mdMenuId))}
                                      className="min-h-[28px] w-full max-w-[132px] rounded-md border border-zinc-200 bg-white px-2 py-1 text-center text-[11px] font-medium text-zinc-800 shadow-sm outline-none ring-offset-2 hover:bg-zinc-50 focus-visible:ring-2 focus-visible:ring-zinc-400"
                                    >
                                      {rowState.mdPick}
                                    </button>
                                    {advMenuOpen === mdMenuId && (
                                      <div
                                        className="absolute left-1/2 top-full z-30 mt-1 w-[128px] -translate-x-1/2 rounded-md border border-zinc-200 bg-white py-0.5 shadow-md"
                                        data-adv-dropdown-root
                                        onMouseDown={(e) => e.stopPropagation()}
                                      >
                                        {ADV_PICK_OPTIONS.map((opt) => (
                                          <button
                                            key={opt}
                                            type="button"
                                            onClick={() => {
                                              setActionState((prev) => ({
                                                ...prev,
                                                [item.id]: { ...prev[item.id], mdPick: opt }
                                              }))
                                              setAdvMenuOpen(null)
                                            }}
                                            className="w-full px-2.5 py-1.5 text-left text-[11px] font-medium text-zinc-700 hover:bg-zinc-100"
                                          >
                                            {opt}
                                          </button>
                                        ))}
                                      </div>
                                    )}
                                    <button
                                      type="button"
                                      onClick={() => handleMdAdvExpenseSubmit(item.id)}
                                      className="h-8 w-full max-w-[132px] rounded-md bg-zinc-900 px-2 text-[10px] font-semibold uppercase tracking-wide text-white shadow hover:bg-zinc-800"
                                    >
                                      Submit
                                    </button>
                                  </>
                                ) : (
                                  <span className="text-center text-[11px] font-medium text-zinc-500">{item.mdApproval || 'Pending'}</span>
                                )}
                              </div>
                            </td>
                            <td className="px-3 py-3 align-middle">
                              <div className="flex flex-col items-end gap-1.5">
                                <div className="w-full max-w-[140px] rounded-md border border-zinc-200 bg-zinc-50 px-2.5 py-1.5 text-right">
                                  <p className="text-[9px] font-semibold uppercase tracking-wider text-zinc-500">HR</p>
                                  <p className="text-[11px] font-semibold text-zinc-900">{item.hrApproval || 'Pending'}</p>
                                </div>
                                <div className="w-full max-w-[140px] rounded-md border border-zinc-200 bg-zinc-50 px-2.5 py-1.5 text-right">
                                  <p className="text-[9px] font-semibold uppercase tracking-wider text-zinc-500">MD</p>
                                  <p className="text-[11px] font-semibold text-zinc-900">{item.mdApproval || 'Pending'}</p>
                                </div>
                              </div>
                            </td>
                          </tr>
                          {(isHR || isMD) && (
                            <tr className="border-b border-zinc-100 bg-zinc-50/50">
                              <td colSpan={8} className="px-3 py-3 align-middle">
                                <div className="flex flex-col gap-3 md:flex-row md:items-center">
                                  {rowState.hrPick === 'Partial' && isHR && (
                                    <div className="flex min-w-[200px] items-center gap-2 rounded-md border border-zinc-200 bg-white px-3 py-2">
                                      <span className="text-[10px] font-semibold uppercase text-zinc-500">HR partial</span>
                                      <input
                                        type="number"
                                        value={rowState.hrPartialAmount ?? ''}
                                        onChange={(e) =>
                                          setActionState((prev) => ({
                                            ...prev,
                                            [item.id]: { ...prev[item.id], hrPartialAmount: e.target.value }
                                          }))
                                        }
                                        className="min-w-0 flex-1 border-0 bg-transparent text-sm font-semibold text-zinc-900 outline-none"
                                        placeholder="Amount"
                                      />
                                    </div>
                                  )}
                                  {rowState.mdPick === 'Partial' && isMD && (
                                    <div className="flex min-w-[200px] items-center gap-2 rounded-md border border-zinc-200 bg-white px-3 py-2">
                                      <span className="text-[10px] font-semibold uppercase text-zinc-500">MD partial</span>
                                      <input
                                        type="number"
                                        value={rowState.partialAmount ?? ''}
                                        onChange={(e) =>
                                          setActionState((prev) => ({
                                            ...prev,
                                            [item.id]: { ...prev[item.id], partialAmount: e.target.value }
                                          }))
                                        }
                                        className="min-w-0 flex-1 border-0 bg-transparent text-sm font-semibold text-zinc-900 outline-none"
                                        placeholder="Amount"
                                      />
                                    </div>
                                  )}
                                  <div className="flex min-w-0 flex-1 items-center gap-2 rounded-md border border-zinc-200 bg-white px-3 py-2">
                                    <MessageSquare size={16} className="shrink-0 text-zinc-400" />
                                    <input
                                      type="text"
                                      placeholder="Remarks (required for Partial, Hold, Reject)"
                                      value={rowState.remarks || ''}
                                      onChange={(e) =>
                                        setActionState((prev) => ({
                                          ...prev,
                                          [item.id]: { ...prev[item.id], remarks: e.target.value }
                                        }))
                                      }
                                      className="min-w-0 flex-1 border-0 bg-transparent text-sm text-zinc-800 outline-none placeholder:text-zinc-400"
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
            
            <div className="rounded-lg border border-zinc-200 bg-white text-zinc-950 shadow-sm overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full caption-bottom text-sm border-collapse">
                  <thead className="border-b border-zinc-200 bg-zinc-50/80">
                    <tr className="border-b border-zinc-200">
                      <th className="h-10 px-3 text-left align-middle text-xs font-medium text-zinc-500">Date</th>
                      <th className="h-10 px-3 text-left align-middle text-xs font-medium text-zinc-500">Type</th>
                      <th className="h-10 px-3 text-left align-middle text-xs font-medium text-zinc-500">Employee</th>
                      <th className="h-10 px-3 text-right align-middle text-xs font-medium text-zinc-500">Amount</th>
                      <th className="h-10 px-3 text-right align-middle text-xs font-medium text-zinc-500 min-w-[148px]">Action</th>
                    </tr>
                  </thead>
                  <tbody className="[&_tr:last-child]:border-0">
                    {recentAdvExpenses.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="p-8 text-center align-middle text-xs font-medium text-zinc-400">No recent updates</td>
                      </tr>
                    ) : (
                      recentAdvExpenses.map(item => (
                        <tr key={item.id} className="border-b border-zinc-100 hover:bg-zinc-50/80">
                          <td className="px-3 py-3 align-middle whitespace-nowrap text-sm font-medium text-zinc-900">
                            {formatAdvDateDMY(item.date)}
                          </td>
                          <td className="px-3 py-3 align-middle">
                            <span className={`inline-flex items-center rounded-md border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${item.type === 'Advance' ? 'border-amber-200 bg-amber-50 text-amber-800' : 'border-blue-200 bg-blue-50 text-blue-800'}`}>
                              {item.type}
                            </span>
                          </td>
                          <td className="px-3 py-3 align-middle text-sm font-medium text-zinc-900">{item.employeeName}</td>
                          <td className="px-3 py-3 align-middle text-right">
                            <div className="flex flex-col items-end gap-0.5">
                              <span className={`text-sm font-semibold tabular-nums ${item.status === 'Partial' ? 'text-zinc-400 line-through' : 'text-zinc-900'}`}>{formatINR(item.amount)}</span>
                              {item.status === 'Partial' && item.partialAmount != null && (
                                <span className="text-sm font-semibold tabular-nums text-indigo-600">{formatINR(item.partialAmount)}</span>
                              )}
                            </div>
                          </td>
                          <td className="px-3 py-3 align-middle">
                            <div className="flex flex-col items-end gap-1.5">
                              <div className="w-full max-w-[160px] rounded-md border border-zinc-200 bg-zinc-50 px-2.5 py-1.5 text-right">
                                <p className="text-[9px] font-semibold uppercase tracking-wider text-zinc-500">HR</p>
                                <p className="text-[11px] font-semibold text-zinc-900">{item.hrApproval || 'Pending'}</p>
                              </div>
                              <div className="w-full max-w-[160px] rounded-md border border-zinc-200 bg-zinc-50 px-2.5 py-1.5 text-right">
                                <p className="text-[9px] font-semibold uppercase tracking-wider text-zinc-500">MD</p>
                                <p className="text-[11px] font-semibold text-zinc-900">{item.mdApproval || 'Pending'}</p>
                              </div>
                              <div
                                className={`w-full max-w-[160px] rounded-md border px-2.5 py-1.5 text-right text-[11px] font-semibold ${
                                  item.status === 'Approved'
                                    ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
                                    : item.status === 'Partial'
                                      ? 'border-blue-200 bg-blue-50 text-blue-800'
                                      : item.status === 'Rejected'
                                        ? 'border-rose-200 bg-rose-50 text-rose-800'
                                        : 'border-zinc-200 bg-white text-zinc-600'
                                }`}
                              >
                                Final: {item.status}
                              </div>
                            </div>
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
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-1 h-4 bg-indigo-600 rounded-full"></div>
                <h3 className="text-[11px] font-black uppercase tracking-widest text-gray-500">Pending Leave & Permissions</h3>
              </div>
            </div>
            <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden w-full">
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-gray-50/50 h-[44px] border-b border-gray-100">
                      <th className="px-6 text-[10px] font-black text-gray-400 uppercase tracking-widest">Requested Date</th>
                      <th className="px-6 text-[10px] font-black text-gray-400 uppercase tracking-widest">Requested by</th>
                      <th className="px-6 text-[10px] font-black text-gray-400 uppercase tracking-widest text-center">Type</th>
                      
                      {leaveApprovalSetting?.type === 'multi' ? (
                        <>
                          <th className="px-6 text-[10px] font-black text-gray-400 uppercase tracking-widest">Dept Head</th>
                          <th className="px-6 text-[10px] font-black text-gray-400 uppercase tracking-widest text-center">MD Approval</th>
                        </>
                      ) : (
                        <th className="px-6 text-[10px] font-black text-gray-400 uppercase tracking-widest text-center">Approval Status</th>
                      )}

                      <th className="px-6 text-[10px] font-black text-gray-400 uppercase tracking-widest">Leave Period</th>
                      <th className="px-6 text-[10px] font-black text-gray-400 uppercase tracking-widest text-center">Final Status</th>
                      <th className="px-6 text-[10px] font-black text-gray-400 uppercase tracking-widest text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {requests.filter(r => r.status === 'Pending' || r.status === 'Hold').length === 0 ? (
                      <tr>
                        <td colSpan={leaveApprovalSetting?.type === 'multi' ? 8 : 7} className="py-16 text-center text-gray-300 font-bold uppercase italic tracking-widest opacity-40">No pending requests</td>
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
                        
                        // Logic for "Requested by"
                        const isSelf = req.createdBy === req.employeeId
                        const creator = employees.find(e => e.id === req.createdBy)
                        const requestedByLabel = isSelf ? req.employeeName : `${creator?.name || 'HR/Admin'} on behalf of ${req.employeeName}`

                        const isTargetDeptHead = user.uid === req?.deptHeadId || isHR
                        const isTargetMD = isMD

                        // Single approval authorization logic
                        const canSingleApprove = leaveApprovalSetting?.type === 'single' && (
                          user.role?.toLowerCase() === 'admin' || 
                          leaveApprovalSetting.approvers?.includes(user.role)
                        )

                        return (
                          <React.Fragment key={req.id}>
                            <tr className="h-[60px] hover:bg-gray-50/30 transition-colors">
                              <td className="px-6">
                                <span className="text-[12px] font-bold text-gray-700">{requestedDate}</span>
                              </td>
                              <td className="px-6">
                                <div className="flex flex-col">
                                  <span className="text-[11px] font-bold text-gray-800">{requestedByLabel}</span>
                                  {!isSelf && <span className="text-[9px] font-black text-indigo-500 uppercase tracking-tighter">Proxy Request</span>}
                                </div>
                              </td>
                              <td className="px-6 text-center">
                                <span className={`px-2 py-0.5 rounded-md text-[8px] font-black uppercase tracking-widest ${req.type === 'Leave' ? 'bg-indigo-50 text-indigo-600' : 'bg-amber-50 text-amber-600'}`}>
                                  {req.type}
                                </span>
                              </td>

                              {leaveApprovalSetting?.type === 'multi' ? (
                                <>
                                  <td className="px-6">
                                    <div className="flex flex-col gap-1">
                                      <span className="text-[11px] font-bold text-gray-600">{req.deptHeadName || 'Not Assigned'}</span>
                                      <div className="flex items-center gap-2">
                                        {getStatusIcon(req.deptHeadApproval || 'Pending')}
                                        {isTargetDeptHead && (req.deptHeadApproval === 'Pending' || req.deptHeadApproval === 'Hold') && (
                                          <div className="flex gap-1">
                                            <button onClick={() => handleUpdateRequestStatus(req.id, 'Approved')} className="p-1 hover:bg-emerald-50 rounded text-emerald-600"><CheckCircle2 size={14} /></button>
                                            <button onClick={() => handleUpdateRequestStatus(req.id, 'Rejected')} className="p-1 hover:bg-rose-50 rounded text-rose-600"><XCircle size={14} /></button>
                                          </div>
                                        )}
                                      </div>
                                    </div>
                                  </td>
                                  <td className="px-6 text-center">
                                    <div className="flex items-center justify-center gap-2">
                                      {getStatusIcon(req.mdApproval || 'Pending')}
                                      {isTargetMD && (req.mdApproval === 'Pending' || req.mdApproval === 'Hold') && (
                                        <div className="flex gap-1">
                                          <button onClick={() => handleUpdateRequestStatus(req.id, 'Approved')} className="p-1 hover:bg-emerald-50 rounded text-emerald-600"><CheckCircle2 size={14} /></button>
                                          <button onClick={() => handleUpdateRequestStatus(req.id, 'Rejected')} className="p-1 hover:bg-rose-50 rounded text-rose-600"><XCircle size={14} /></button>
                                        </div>
                                      )}
                                    </div>
                                  </td>
                                </>
                              ) : (
                                <td className="px-6 text-center">
                                  <div className="flex items-center justify-center gap-3">
                                    {getStatusIcon(req.status)}
                                    {canSingleApprove && (req.status === 'Pending' || req.status === 'Hold') && (
                                      <div className="flex gap-1.5">
                                        <button onClick={() => handleUpdateRequestStatus(req.id, 'Approved')} className="h-7 px-3 bg-emerald-50 text-emerald-700 rounded-md text-[9px] font-black uppercase tracking-widest hover:bg-emerald-600 hover:text-white transition-all">Approve</button>
                                        <button onClick={() => handleUpdateRequestStatus(req.id, 'Rejected')} className="h-7 px-3 bg-rose-50 text-rose-700 rounded-md text-[9px] font-black uppercase tracking-widest hover:bg-rose-600 hover:text-white transition-all">Reject</button>
                                      </div>
                                    )}
                                  </div>
                                </td>
                              )}

                              <td className="px-6">
                                <p className="text-[11px] font-medium text-gray-600">
                                  {req.type === 'Leave' ? `${formatDate(req.fromDate)} - ${formatDate(req.toDate)}` : formatDate(req.permissionDate)}
                                </p>
                              </td>
                              <td className="px-6 text-center">
                                <div className={`px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-widest ${req.status === 'Hold' ? 'bg-gray-100 text-gray-500' : 'bg-amber-50 text-amber-600'}`}>
                                  {req.status === 'Hold' ? 'Hold' : 'Pending'}
                                </div>
                              </td>
                              <td className="px-6 text-right">
                                <button onClick={() => handleDeleteRequest(req.id)} className="p-2 text-gray-300 hover:text-red-500 transition-colors"><Trash2 size={14} /></button>
                              </td>
                            </tr>
                            {(req.status === 'Pending' || req.status === 'Hold') && (
                              <tr className="bg-gray-50/20">
                                <td colSpan={leaveApprovalSetting?.type === 'multi' ? 8 : 7} className="px-6 py-1.5">
                                  <div className="flex flex-col md:flex-row items-center justify-end gap-4">
                                    {req.physicalFormSubmitted && (
                                      <span className="text-[9px] font-black text-emerald-600 uppercase bg-emerald-50 px-2 py-1 rounded border border-emerald-100 flex items-center gap-1">
                                        <CheckCircle2 size={10} /> Physical Form Submitted
                                      </span>
                                    )}
                                    {req.deterrentLeave && (
                                      <span className="text-[9px] font-black text-rose-600 uppercase bg-rose-50 px-2 py-1 rounded border border-rose-100 flex items-center gap-1">
                                        <AlertCircle size={10} /> Deterrent Leave
                                      </span>
                                    )}
                                    <div className="flex items-center gap-3 bg-white p-1.5 rounded-lg border border-gray-100 max-w-sm">
                                      <MessageSquare size={12} className="text-gray-400 shrink-0 ml-1" />
                                      <input 
                                        type="text" 
                                        placeholder="Remarks..."
                                        value={actionState[req.id]?.remarks || ''}
                                        onChange={(e) => setActionState(prev => ({ ...prev, [req.id]: { ...prev[req.id], remarks: e.target.value } }))}
                                        className="flex-1 bg-transparent border-none text-[10px] font-medium outline-none placeholder:text-gray-300"
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
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Recent Leave Updates (Left side of the bottom row) */}
            <div className="space-y-4">
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

            {/* Upcoming Leave (Right side of the bottom row) */}
            <div className="space-y-4" style={{ fontFamily: "'IBM Plex Sans', sans-serif" }}>
              <div className="flex items-center gap-2">
                <div className="w-1 h-4 bg-emerald-500 rounded-full"></div>
                <h3 className="text-[11px] font-black uppercase tracking-widest text-gray-500">Upcoming This Month</h3>
              </div>
              <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
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
        </div>
      )}
    </div>
  )
}
