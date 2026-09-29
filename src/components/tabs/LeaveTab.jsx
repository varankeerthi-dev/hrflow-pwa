import React, { useState, useEffect, useCallback } from 'react'
import { useAuth } from '../../hooks/useAuth'
import { useEmployees } from '../../hooks/useEmployees'
import { useLeaves } from '../../hooks/useLeaves'
import { useLeaveBalances } from '../../hooks/useLeaveBalances'
import { db } from '../../lib/firebase'
import { collection, query, where, getDocs, serverTimestamp } from 'firebase/firestore'
import { 
  LayoutDashboard, 
  FileText, 
  CheckCircle, 
  PlusCircle, 
  PieChart, 
  Search, 
  Trash2, 
  Calendar, 
  Clock,
  ArrowRight,
  Filter,
  Check,
  X,
  MessageSquare,
  AlertCircle,
  User as UserIcon,
  ChevronDown,
  MoreHorizontal,
  PencilLine
} from 'lucide-react'
import Spinner from '../ui/Spinner'
import { ModulePillTabs } from '../ui/ModulePillTabs'
import { buildLeaveCoverageCandidates, getLeavePolicy } from '../../lib/leaveLifecycle'
import { isLeaveEntitlementConfigured, normalizeLeaveTypeCode } from '../../lib/leaveEntitlements'

const createOpeningBalanceForm = () => ({
  quantity: '',
  effectiveDate: new Date().toISOString().slice(0, 10),
  reason: '',
  idempotencyKey: globalThis.crypto?.randomUUID?.() || `${Date.now()}_${Math.random().toString(36).slice(2)}`,
})

const formatLeaveDate = (value) => {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return value || '—'
  const [year, month, day] = value.split('-')
  const monthName = new Date(Number(year), Number(month) - 1, 1).toLocaleDateString('en-IN', { month: 'long' })
  return `${day}-${monthName}-${year}`
}

export default function LeaveTab() {
  const { user } = useAuth()
  const { employees } = useEmployees(user?.orgId)
  const { loading: leaveLoading, fetchLeaves, applyLeave, updateLeaveStatus, deleteLeave, cancelLeave, recordOpeningBalance, calculateDuration } = useLeaves(user?.orgId)
  
  const [activeSub, setActiveSub] = useState('dashboard')
  const [leaves, setLeaves] = useState([])
  const [showInlineForm, setShowInlineForm] = useState(false)
  const [searchTerm, setSearchTerm] = useState('')
  const [filterType, setFilterType] = useState('All')
  const [approvalSetting, setApprovalSetting] = useState(null)
  const [openMenuId, setOpenMenuId] = useState(null)
  
  const [form, setForm] = useState({ 
    employeeId: '', 
    leaveType: 'Casual', 
    fromDate: '', 
    toDate: '', 
    halfDay: false,
    reason: '',
    deptHeadId: '',
    approverIds: [], // For multi-stage
    physicalFormSubmitted: false,
    deterrentLeave: false
  })

  useEffect(() => {
    if (!user?.orgId) return
    const fetchSettings = async () => {
      const q = query(collection(db, 'organisations', user.orgId, 'approvalSettings'), where('moduleName', '==', 'Leave'))
      const snap = await getDocs(q)
      if (!snap.empty) {
        setApprovalSetting(snap.docs[0].data())
      }
    }
    fetchSettings()
  }, [user?.orgId])

  const [actionRemarks, setActionRemarks] = useState({})
  const [selectedNextApprover, setSelectedNextApprover] = useState({})
  const [selectedMonth, setSelectedMonth] = useState(new Date().toISOString().substring(0, 7))
  const [openingBalanceForm, setOpeningBalanceForm] = useState(createOpeningBalanceForm)

  const selectedEmployee = employees.find((employee) => employee.id === form.employeeId) || null
  const { orgData: leaveOrgData, leaveTypes: configuredLeaveTypes, balances: employeeBalances, balanceByCode, error: balanceError, refresh: refreshEmployeeBalances } = useLeaveBalances(user?.orgId, form.employeeId)
  const leaveTypes = configuredLeaveTypes.map((type) => type.name)
  const selectedLeaveType = leaveTypes.includes(form.leaveType) ? form.leaveType : (leaveTypes[0] || form.leaveType)
  const selectedLeaveBalance = balanceByCode[normalizeLeaveTypeCode(selectedLeaveType)]
  const selectedLeavePolicy = getLeavePolicy(leaveOrgData, selectedLeaveType, form.fromDate || new Date().toISOString().slice(0, 10))
  const openingBalancePolicy = getLeavePolicy(leaveOrgData, selectedLeaveType, openingBalanceForm.effectiveDate)
  const canRecordOpeningBalance = isLeaveEntitlementConfigured(openingBalancePolicy)
  const formCoveragePreview = !selectedEmployee || !form.fromDate || !form.toDate || form.toDate < form.fromDate
    ? []
    : buildLeaveCoverageCandidates({ ...form, leaveType: selectedLeaveType, requestedUnits: form.halfDay ? 0.5 : calculateDuration(form.fromDate, form.toDate), orgData: leaveOrgData })
  const formPaidUnits = formCoveragePreview.reduce((sum, candidate) => sum + (String(candidate.classification || '').includes('paid') ? Number(candidate.leaveUnits || 0) : 0), 0)
  const formUnpaidShortfall = selectedLeaveBalance?.configured ? Math.max(0, formPaidUnits - Number(selectedLeaveBalance.available || 0)) : 0

  const refreshLeaves = useCallback(async () => {
    const data = await fetchLeaves()
    setLeaves(data)
  }, [fetchLeaves])

  useEffect(() => {
    if (!user?.orgId) return undefined
    const timer = window.setTimeout(() => { void refreshLeaves() }, 0)
    return () => window.clearTimeout(timer)
  }, [user?.orgId, refreshLeaves])

  // Close menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (openMenuId && !event.target.closest('.relative')) {
        setOpenMenuId(null)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [openMenuId])

  const handleSubmit = async (e) => {
    e.preventDefault()
    
    if (!form.employeeId) return alert('Please select the employee.')
    
    // Validate approvers for multi-stage
    if (approvalSetting?.type === 'multi' && approvalSetting.stages?.length > 1) {
      const requiredApproversCount = approvalSetting.stages.length - 1
      for (let i = 0; i < requiredApproversCount; i++) {
        if (!form.approverIds[i]) {
          return alert(`Please select Approver ${i + 1} (${approvalSetting.stages[i].role || 'Dept Head'})`)
        }
      }
    }

    if (!form.fromDate) return alert('Please select the From Date.')
    if (!form.toDate) return alert('Please select the To Date.')
    if (form.halfDay && form.fromDate !== form.toDate) return alert('Half-day requests must be for a single date.')
    if (!form.reason.trim()) return alert('Please provide a reason.')
    
    try {
      const emp = employees.find(e => e.id === form.employeeId)
      const approvalType = approvalSetting?.type || 'single'
      const isNoApproval = approvalType === 'none'
      
      const payload = {
        ...form,
        leaveType: selectedLeaveType,
        requestedUnits: form.halfDay ? 0.5 : calculateDuration(form.fromDate, form.toDate),
        employeeName: emp?.name || 'Unknown',
        orgId: user.orgId,
        approvalType,
        currentStage: 0, // Start at stage 0
        totalStages: approvalType === 'multi' ? approvalSetting.stages.length : 1,
        // deptHeadId is set to the first approver in the list if multi
        deptHeadId: approvalType === 'multi' ? form.approverIds[0] : (form.deptHeadId || ''),
        deptHeadName: approvalType === 'multi' 
          ? (employees.find(e => e.id === form.approverIds[0])?.name || 'Unknown')
          : (employees.find(e => e.id === form.deptHeadId)?.name || 'Unknown'),
        status: isNoApproval ? 'Approved' : 'Pending',
        hrApproval: isNoApproval ? 'Approved' : 'Pending',
        deptHeadApproval: isNoApproval ? 'Approved' : 'Pending',
        mdApproval: isNoApproval ? 'Approved' : 'Pending',
        approvedBy: isNoApproval ? user.uid : null,
        approvedAt: isNoApproval ? serverTimestamp() : null
      }

      await applyLeave(payload)
      
      setShowInlineForm(false)
      setForm({ 
        employeeId: '', 
        leaveType: 'Casual', 
        fromDate: '', 
        toDate: '', 
        halfDay: false,
        reason: '', 
        deptHeadId: '',
        approverIds: [],
        physicalFormSubmitted: false,
        deterrentLeave: false
      })
      refreshLeaves()
      refreshEmployeeBalances()
    } catch (err) {
      alert('Failed to submit application: ' + err.message)
    }
  }

  const handleRecordOpeningBalance = async (event) => {
    event.preventDefault()
    if (!form.employeeId) return alert('Select an employee before recording an opening balance.')
    if (!form.leaveType) return alert('Select a leave type before recording an opening balance.')
    try {
      await recordOpeningBalance({
        employeeId: form.employeeId,
        leaveType: selectedLeaveType,
        quantity: openingBalanceForm.quantity,
        effectiveDate: openingBalanceForm.effectiveDate,
        reason: openingBalanceForm.reason,
        idempotencyKey: openingBalanceForm.idempotencyKey,
      })
      setOpeningBalanceForm(createOpeningBalanceForm())
      refreshEmployeeBalances()
      alert('Opening balance recorded and audit logged.')
    } catch (error) {
      alert(error.message || 'Opening balance could not be recorded.')
    }
  }

  const handleAction = async (requestId, status) => {
    const remarks = actionRemarks[requestId] || ''
    const nextApproverId = selectedNextApprover[requestId] || null
    
    if (status === 'Rejected' && !remarks.trim()) {
      return alert('Please provide remarks for rejection.')
    }
    
    try {
      await updateLeaveStatus(requestId, status, remarks, nextApproverId)
      setActionRemarks(prev => ({ ...prev, [requestId]: '' }))
      setSelectedNextApprover(prev => ({ ...prev, [requestId]: '' }))
      refreshLeaves()
      refreshEmployeeBalances()
    } catch (err) {
      alert('Update failed: ' + err.message)
    }
  }

  const filteredByMonthLeaves = leaves.filter(l => {
    const date = l.fromDate || l.permissionDate
    return date?.startsWith(selectedMonth)
  })

  const filteredLeaves = leaves.filter(l => {
    const matchesSearch = (l.employeeName || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
                         (l.reason || '').toLowerCase().includes(searchTerm.toLowerCase())
    const matchesType = filterType === 'All' || normalizeLeaveTypeCode(l.leaveTypeCode || l.leaveType, configuredLeaveTypes) === normalizeLeaveTypeCode(filterType, configuredLeaveTypes)
    return matchesSearch && matchesType
  })

  const subNav = [
    { id: 'dashboard', label: 'Overview', icon: <LayoutDashboard size={14} /> },
    { id: 'request', label: 'Requests', icon: <FileText size={14} /> },
    { id: 'approve', label: 'Approvals', icon: <CheckCircle size={14} /> },
    { id: 'reports', label: 'Analytics', icon: <PieChart size={14} /> }
  ]

  return (
    <div className="module-layout-root space-y-4 md:space-y-5 font-inter text-slate-950 w-full mx-auto pb-20">
      <div className="module-top-surface bg-white px-4 pt-3 md:px-6 md:pt-4 rounded-[12px] shadow-sm border border-gray-100 flex flex-col gap-1">
        <h2 className="text-lg md:text-xl font-semibold tracking-tight text-slate-900">Leave Management</h2>
        <p className="text-[12px] md:text-[13px] text-slate-500">Manage employee absence requests, approvals, and leave activity.</p>
      </div>

      <ModulePillTabs
        className="w-full"
        tabs={subNav}
        activeTabId={activeSub}
        onTabChange={(tab) => setActiveSub(tab.id)}
        ariaLabel="Leave sections"
        rightContent={(
          <button
            onClick={() => {
              setActiveSub('dashboard')
              setShowInlineForm(!showInlineForm)
            }}
            className={`hidden md:inline-flex shrink-0 items-center justify-center rounded-lg text-[12px] font-semibold transition-colors h-8 px-3 ${showInlineForm ? 'bg-white text-slate-700 hover:bg-slate-50 border border-slate-200' : 'bg-emerald-600 text-white hover:bg-emerald-700 shadow-sm'}`}
          >
            {showInlineForm ? <X size={14} className="mr-1.5" /> : <PlusCircle size={14} className="mr-1.5" />}
            {showInlineForm ? 'Cancel' : 'New Application'}
          </button>
        )}
      />
      <button
        onClick={() => {
          setActiveSub('dashboard')
          setShowInlineForm(!showInlineForm)
        }}
        className={`md:hidden w-full inline-flex items-center justify-center rounded-lg text-[12px] font-semibold transition-colors h-10 px-4 ${showInlineForm ? 'bg-white text-slate-700 hover:bg-slate-50 border border-slate-200' : 'bg-emerald-600 text-white hover:bg-emerald-700 shadow-sm'}`}
      >
        {showInlineForm ? <X size={16} className="mr-2" /> : <PlusCircle size={16} className="mr-2" />}
        {showInlineForm ? 'Cancel Application' : 'New Application'}
      </button>

      {activeSub === 'dashboard' && (
        <div className="space-y-6">
          <div className="flex items-center gap-2 bg-white border border-gray-100 rounded-[10px] px-3 py-1.5 w-fit shadow-sm">
            <Calendar size={14} className="text-slate-400" />
            <input 
              type="month" 
              value={selectedMonth}
              onChange={e => setSelectedMonth(e.target.value)}
              className="bg-transparent border-none text-[11px] font-semibold uppercase tracking-wider focus:ring-0 cursor-pointer text-slate-600 outline-none"
            />
          </div>

          {showInlineForm && (
            <div className="rounded-[12px] border border-gray-100 bg-white shadow-sm overflow-hidden animate-in fade-in duration-300">
              <div className="p-4 md:p-5 border-b border-gray-100">
                <h3 className="text-[14px] font-semibold leading-none tracking-tight text-slate-900">New Leave Application</h3>
              </div>
              
              <form onSubmit={handleSubmit} className="p-4 md:p-6 space-y-6">
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  <div className="space-y-6">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <label className="text-xs font-medium text-slate-500 uppercase">Employee Name</label>
                        <div className="relative">
                          <select 
                            value={form.employeeId} 
                            onChange={e => setForm({...form, employeeId: e.target.value})} 
                            className="flex h-10 w-full sm:max-w-[250px] items-center justify-between rounded-md border border-slate-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-950 appearance-none truncate"
                          >
                            <option value="">Select an employee</option>
                            {employees.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
                          </select>
                          <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none h-4 w-4" />
                        </div>
                      </div>

                      {/* Dynamic Approver logic */}
                      {approvalSetting?.type === 'multi' && approvalSetting.stages?.length > 1 && (
                        <>
                          {approvalSetting.stages.slice(0, -1).map((stage, idx) => (
                            <div key={idx} className="space-y-2">
                              <label className="text-xs font-medium text-slate-500 uppercase">
                                Approver {idx + 1} ({stage.role || 'Dept Head'})
                              </label>
                              <div className="relative">
                                <select 
                                  value={form.approverIds[idx] || ''} 
                                  onChange={e => {
                                    const newApprovers = [...form.approverIds]
                                    newApprovers[idx] = e.target.value
                                    setForm({...form, approverIds: newApprovers, deptHeadId: newApprovers[0]}) 
                                  }} 
                                  className="flex h-10 w-full items-center justify-between rounded-md border border-slate-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-950 appearance-none"
                                >
                                  <option value="">Select Approver</option>
                                  {employees.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
                                </select>
                                <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none h-4 w-4" />
                              </div>
                            </div>
                          ))}
                        </>
                      )}

                      {approvalSetting?.type === 'none' && (
                        <div className="bg-emerald-50 p-3 rounded-lg border border-emerald-100 flex items-start gap-2">
                          <AlertCircle size={14} className="text-emerald-500 shrink-0 mt-0.5" />
                          <p className="text-[10px] text-emerald-700 font-medium">This leave request will be auto-approved because No Approval is configured.</p>
                        </div>
                      )}

                      {(!approvalSetting || approvalSetting.type === 'single') && (
                        <div className="bg-slate-50 p-3 rounded-lg border border-slate-100 flex items-start gap-2">
                          <AlertCircle size={14} className="text-amber-500 shrink-0 mt-0.5" />
                          <p className="text-[10px] text-slate-500 font-medium">Any authorized person (Admin/HR/MD) can approve this request as per Single Approval policy.</p>
                        </div>
                      )}
                    </div>

                    {form.employeeId && (
                      <div className="max-w-xl overflow-hidden rounded-lg border border-slate-200 shadow-sm">
                        <div className="border-b border-slate-200 bg-slate-50 px-4 py-2 text-[10px] font-semibold uppercase text-slate-500">Per-type balance · {selectedEmployee?.name || 'Employee'}</div>
                        {balanceError && <p className="px-4 py-2 text-[11px] text-rose-700">{balanceError}</p>}
                        <div className="divide-y divide-slate-100">
                          {employeeBalances.map((row) => (
                            <div key={row.leaveTypeCode} className="grid grid-cols-[1fr_auto] gap-2 px-4 py-2 text-[11px]">
                              <div><strong className="font-semibold text-slate-800">{row.leaveType}</strong><p className="mt-0.5 text-[10px] text-slate-500">{row.configured ? `Accrued ${row.accrued.toFixed(2)} · used ${row.used.toFixed(2)} · pending ${row.pending.toFixed(2)}` : 'Not configured — legacy behavior remains'}</p></div>
                              {row.configured ? <div className="text-right"><strong className={`font-semibold ${row.available < 0 ? 'text-rose-700' : 'text-indigo-700'}`}>Available {row.available.toFixed(2)}</strong>{row.overEntitlement > 0 && <p className="text-[10px] font-semibold text-rose-700">Over by {row.overEntitlement.toFixed(2)}</p>}</div> : <span className="self-center text-[10px] text-slate-400">—</span>}
                            </div>
                          ))}
                        </div>
                        {selectedEmployee?.leaveBalance !== undefined && selectedEmployee?.leaveBalance !== null && <p className="border-t border-slate-200 bg-slate-50 px-4 py-2 text-[10px] leading-4 text-slate-500">Legacy aggregate balance: {Number(selectedEmployee.leaveBalance || 0).toFixed(2)} units. This amount is not allocated to a leave type.</p>}
                        {['admin', 'hr'].includes(String(user?.role || '').toLowerCase()) && (
                          <form onSubmit={handleRecordOpeningBalance} className="border-t border-slate-200 bg-white p-3">
                            <p className="mb-2 text-[10px] font-semibold uppercase text-slate-500">Reconcile reviewed opening balance</p>
                            {!canRecordOpeningBalance && <p className="mb-2 text-[10px] leading-4 text-amber-700">Publish a monthly or annual entitlement for this type first.</p>}
                            <div className="grid gap-2 sm:grid-cols-3">
                              <input type="number" min="0.01" step="0.25" value={openingBalanceForm.quantity} onChange={(event) => setOpeningBalanceForm((previous) => ({ ...previous, quantity: event.target.value }))} placeholder="Units" className="h-9 rounded-md border border-slate-200 px-2 text-[11px]" aria-label="Opening balance units" />
                              <input type="date" value={openingBalanceForm.effectiveDate} onChange={(event) => setOpeningBalanceForm((previous) => ({ ...previous, effectiveDate: event.target.value }))} className="h-9 rounded-md border border-slate-200 px-2 text-[11px]" aria-label="Opening balance effective date" />
                              <button type="submit" disabled={!canRecordOpeningBalance} className="h-9 rounded-md bg-slate-900 px-3 text-[10px] font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50">Record for {selectedLeaveType}</button>
                            </div>
                            <input value={openingBalanceForm.reason} onChange={(event) => setOpeningBalanceForm((previous) => ({ ...previous, reason: event.target.value }))} placeholder="Required reconciliation reason" className="mt-2 h-9 w-full rounded-md border border-slate-200 px-2 text-[11px]" aria-label="Opening balance reason" />
                          </form>
                        )}
                      </div>
                    )}
                  </div>

                  <div className="space-y-6">
                    <div className="flex gap-4">
                      <div className="flex-1 space-y-2">
                        <label className="text-xs font-medium text-slate-500 uppercase">From Date</label>
                        <input 
                          type="date" 
                          value={form.fromDate} 
                          onChange={e => setForm({...form, fromDate: e.target.value, halfDay: false})}
                          className="flex h-10 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-xs md:text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-950" 
                        />
                      </div>
                      <div className="flex-1 space-y-2">
                        <label className="text-xs font-medium text-slate-500 uppercase">To Date</label>
                        <input 
                          type="date" 
                          value={form.toDate} 
                          onChange={e => setForm({...form, toDate: e.target.value, halfDay: false})}
                          className="flex h-10 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-xs md:text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-950" 
                        />
                      </div>
                    </div>
                    <label className="inline-flex items-center gap-2 text-[11px] font-medium text-slate-600">
                      <input type="checkbox" checked={form.halfDay} disabled={!form.fromDate || form.toDate !== form.fromDate || !selectedLeavePolicy.allowHalfDay} onChange={(event) => setForm({ ...form, halfDay: event.target.checked })} className="h-4 w-4 rounded border-slate-300 text-indigo-600" />
                      Half day (0.5 leave unit)
                    </label>

                    <div className="space-y-2">
                      <label className="text-xs font-medium text-slate-500 uppercase">Classification</label>
                      <select value={selectedLeaveType} onChange={(event) => setForm({ ...form, leaveType: event.target.value })} className="flex h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm focus:outline-none focus:ring-2 focus:ring-slate-950">
                        {leaveTypes.map((type) => <option key={type} value={type}>{type}</option>)}
                      </select>
                      {selectedLeaveBalance?.configured && <p className="text-[10px] text-slate-500">Available now: {Number(selectedLeaveBalance.available || 0).toFixed(2)} · this request: {formPaidUnits.toFixed(2)} paid unit(s)</p>}
                      {formUnpaidShortfall > 0 && selectedLeavePolicy.overuseMode === 'block' && <div role="alert" className="rounded-md border border-rose-200 bg-rose-50 p-2 text-[10px] leading-4 text-rose-800">This request exceeds the available balance by {formUnpaidShortfall.toFixed(2)} unit(s) and will be blocked under the published policy.</div>}
                      {formUnpaidShortfall > 0 && selectedLeavePolicy.overuseMode === 'allow_negative' && <div role="status" className="rounded-md border border-amber-200 bg-amber-50 p-2 text-[10px] leading-4 text-amber-800">This approval will record an over-entitlement of {formUnpaidShortfall.toFixed(2)} unit(s); the balance may become negative.</div>}
                      {formUnpaidShortfall > 0 && selectedLeavePolicy.overuseMode === 'unpaid_shortfall' && <div role="status" className="rounded-md border border-amber-200 bg-amber-50 p-2 text-[10px] leading-4 text-amber-800">The {formUnpaidShortfall.toFixed(2)}-unit shortfall will be unpaid/LOP if approved. Payroll will apply the existing Basic/HRA proration to the actual coverage.</div>}
                    </div>

                    <div className="space-y-2">
                      <label className="text-xs font-medium text-slate-500 uppercase">Reason</label>
                      <textarea 
                        value={form.reason} 
                        onChange={e => setForm({...form, reason: e.target.value})} 
                        className="flex min-h-[60px] w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-950" 
                        placeholder="Why is this leave requested?" 
                      />
                    </div>

                    <div className="flex flex-wrap gap-6 pt-2">
                      <label className="flex items-center gap-2 cursor-pointer group">
                        <div className={`w-4 h-4 rounded border flex items-center justify-center transition-all ${form.physicalFormSubmitted ? 'bg-indigo-600 border-indigo-600' : 'bg-white border-slate-300 group-hover:border-indigo-400'}`}>
                          {form.physicalFormSubmitted && <Check size={12} className="text-white" strokeWidth={4} />}
                        </div>
                        <input 
                          type="checkbox" 
                          className="hidden" 
                          checked={form.physicalFormSubmitted}
                          onChange={e => setForm({...form, physicalFormSubmitted: e.target.checked})}
                        />
                        <span className="text-[11px] font-bold text-slate-600 uppercase tracking-tight">Physical form submitted</span>
                      </label>

                      <label className="flex items-center gap-2 cursor-pointer group">
                        <div className={`w-4 h-4 rounded border flex items-center justify-center transition-all ${form.deterrentLeave ? 'bg-rose-600 border-rose-600' : 'bg-white border-slate-300 group-hover:border-rose-400'}`}>
                          {form.deterrentLeave && <Check size={12} className="text-white" strokeWidth={4} />}
                        </div>
                        <input 
                          type="checkbox" 
                          className="hidden" 
                          checked={form.deterrentLeave}
                          onChange={e => setForm({...form, deterrentLeave: e.target.checked})}
                        />
                        <span className="text-[11px] font-bold text-slate-600 uppercase tracking-tight">Deterrent leave</span>
                      </label>
                    </div>
                  </div>
                </div>

                <div className="flex items-center justify-end space-x-2 pt-4 border-t border-slate-200">
                  <button 
                    type="button"
                    onClick={() => setShowInlineForm(false)}
                    className="inline-flex items-center justify-center rounded-md text-sm font-medium border border-slate-200 bg-white hover:bg-slate-100 h-9 px-4 transition-all"
                  >
                    Cancel
                  </button>
                  <button 
                    type="submit" 
                    className="inline-flex items-center justify-center rounded-md text-sm font-medium bg-slate-900 text-slate-50 hover:bg-slate-900/90 h-9 px-6 shadow transition-all"
                  >
                    Submit Request
                  </button>
                </div>
              </form>
            </div>
          )}
          
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
              <div className="p-3 md:p-4 border-b border-slate-200">
                <h3 className="text-xs font-semibold flex items-center gap-2 uppercase tracking-wider text-slate-500">
                  <Clock size={14} /> Recent Activity
                </h3>
              </div>
              <div className="p-3 md:p-4 space-y-3">
                {filteredByMonthLeaves.slice(0, 5).map(leave => (
                  <div key={leave.id} className="flex items-center justify-between text-sm">
                    <div className="flex items-center gap-3">
                      <div className="w-7 h-7 rounded-full bg-slate-100 flex items-center justify-center font-bold text-slate-900 text-[10px]">
                        {leave.employeeName?.[0]}
                      </div>
                      <div>
                        <p className="font-medium text-slate-900 text-xs">{leave.employeeName}</p>
                        <p className="text-[10px] text-slate-500">{leave.leaveType} • {formatLeaveDate(leave.fromDate)}</p>
                      </div>
                    </div>
                    <div className={`px-2 py-0.5 rounded-full text-[9px] font-semibold border ${leave.status === 'Approved' ? 'bg-emerald-50 text-emerald-700 border-emerald-100' : leave.status === 'Rejected' ? 'bg-rose-50 text-rose-700 border-rose-100' : 'bg-amber-50 text-amber-700 border-amber-100'}`}>
                      {leave.status}
                    </div>
                  </div>
                ))}
                {filteredByMonthLeaves.length === 0 && <p className="text-center py-4 text-slate-400 text-xs italic">No activity for this month</p>}
              </div>
            </div>
            
            <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
              <div className="p-3 md:p-4 border-b border-slate-200">
                <h3 className="text-xs font-semibold flex items-center gap-2 uppercase tracking-wider text-slate-500">
                  <PieChart size={14} /> Leave Distribution
                </h3>
              </div>
              <div className="p-3 md:p-4 space-y-3">
                {leaveTypes.map(type => {
                  const count = filteredByMonthLeaves.filter(l => normalizeLeaveTypeCode(l.leaveTypeCode || l.leaveType, configuredLeaveTypes) === normalizeLeaveTypeCode(type, configuredLeaveTypes)).length
                  const percentage = filteredByMonthLeaves.length ? (count / filteredByMonthLeaves.length) * 100 : 0
                  if (count === 0) return null
                  return (
                    <div key={type} className="space-y-1">
                      <div className="flex justify-between text-[10px] font-medium">
                        <span className="text-slate-500">{type}</span>
                        <span className="text-slate-950 font-semibold">{count} ({Math.round(percentage)}%)</span>
                      </div>
                      <div className="h-1 w-full bg-slate-100 rounded-full overflow-hidden">
                        <div className="h-full bg-slate-900 rounded-full" style={{ width: `${percentage}%` }}></div>
                      </div>
                    </div>
                  )
                })}
                {filteredByMonthLeaves.length === 0 && <p className="text-center py-4 text-slate-400 text-xs italic">No data for this month</p>}
              </div>
            </div>
          </div>
        </div>
      )}

      {(activeSub === 'request' || activeSub === 'approve') && (
        <div className="space-y-4">
          <div className="flex flex-col md:flex-row gap-3 rounded-[12px] border border-gray-100 bg-white p-3 shadow-sm">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
              <input 
                type="text"
                placeholder="Search requests..."
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                className="flex h-10 w-full rounded-lg border border-gray-200 bg-gray-50 px-9 py-2 text-[12px] font-medium text-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-100 focus-visible:border-emerald-400"
              />
            </div>
            <div className="flex bg-slate-50 p-0.5 rounded-lg border border-gray-100 h-10 overflow-x-auto no-scrollbar">
              {['All', ...leaveTypes.slice(0, 3)].map(t => (
                <button
                  key={t}
                  onClick={() => setFilterType(t)}
                  className={`flex-1 md:flex-none px-3 py-1 rounded-md text-[10px] font-semibold transition-all ${filterType === t ? 'bg-white text-emerald-700 shadow-sm' : 'text-slate-500 hover:text-slate-900'}`}
                >
                  {t}
                </button>
              ))}
            </div>
          </div>

          <div className="rounded-[12px] border border-gray-100 bg-white shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs md:text-sm">
                <thead>
                  <tr className="bg-[#f9fafb] h-[42px] border-b border-gray-100">
                    <th className="px-4 md:px-6 text-[10px] font-bold uppercase tracking-widest text-slate-400">Applicant</th>
                    <th className="px-4 md:px-6 text-[10px] font-bold uppercase tracking-widest text-slate-400 hidden md:table-cell">Type</th>
                    <th className="px-4 md:px-6 text-[10px] font-bold uppercase tracking-widest text-slate-400 w-[120px] md:w-[170px]">Leave dates</th>
                    <th className="px-4 md:px-6 text-[10px] font-bold uppercase tracking-widest text-slate-400 text-center w-[100px]">Status</th>
                    <th className="px-4 md:px-6 text-[10px] font-bold uppercase tracking-widest text-slate-400 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {leaveLoading ? (
                    <tr><td colSpan={5} className="py-20 text-center"><Spinner /></td></tr>
                  ) : filteredLeaves.length === 0 ? (
                    <tr><td colSpan={5} className="py-20 text-center text-slate-400 italic">No records found</td></tr>
                  ) : filteredLeaves.map(leave => {
                    const isPending = leave.status === 'Pending'
                    const showApprovals = activeSub === 'approve' && isPending
                    const isHR = user.role?.toLowerCase() === 'hr' || user.role?.toLowerCase() === 'admin'
                    
                    return (
                      <React.Fragment key={leave.id}>
                        <tr className="h-[56px] hover:bg-slate-50/70 transition-colors">
                          <td className="px-4 md:px-6">
                            <div className="flex flex-col">
                              <span className="text-[12px] font-semibold text-slate-900">{leave.employeeName}</span>
                              <span className="text-[10px] text-slate-500 line-clamp-1 max-w-[150px]">{leave.reason}</span>
                              {leave.leaveBalanceSnapshot?.overuseMode && <span className={`mt-0.5 text-[9px] font-medium ${Number(leave.leaveBalanceSnapshot.unpaidShortfallUnits || leave.leaveBalanceSnapshot.overEntitlementUnits || 0) > 0 ? 'text-amber-700' : 'text-slate-500'}`}>Balance {Number(leave.leaveBalanceSnapshot.availableBefore || 0).toFixed(2)} · requested {Number(leave.leaveBalanceSnapshot.requestedUnits || 0).toFixed(2)}{Number(leave.leaveBalanceSnapshot.unpaidShortfallUnits || 0) > 0 ? ` · ${Number(leave.leaveBalanceSnapshot.unpaidShortfallUnits).toFixed(2)} unpaid/LOP` : Number(leave.leaveBalanceSnapshot.overEntitlementUnits || 0) > 0 ? ` · ${Number(leave.leaveBalanceSnapshot.overEntitlementUnits).toFixed(2)} over` : ''}</span>}
                            </div>
                          </td>
                          <td className="px-4 md:px-6 hidden md:table-cell">
                            <span className="inline-flex items-center rounded-md border border-slate-200 bg-slate-50 px-2 py-0.5 text-[10px] font-semibold text-slate-700">{leave.leaveType}</span>
                          </td>
                          <td className="px-4 md:px-6">
                            <div className="flex flex-col">
                              <span className="text-[10px] md:text-[11px] font-semibold text-slate-800">{formatLeaveDate(leave.fromDate)}{leave.toDate && leave.toDate !== leave.fromDate ? ` – ${formatLeaveDate(leave.toDate)}` : ''}</span>
                              <span className="text-[9px] text-slate-500 mt-0.5">{leave.duration || calculateDuration(leave.fromDate, leave.toDate)} day{Number(leave.duration || calculateDuration(leave.fromDate, leave.toDate)) === 1 ? '' : 's'}</span>
                            </div>
                          </td>
                          <td className="px-4 md:px-6 text-center">
                            <div className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[9px] font-semibold ${leave.status === 'Approved' ? 'bg-emerald-50 text-emerald-700 border-emerald-100' : leave.status === 'Rejected' ? 'bg-rose-50 text-rose-700 border-rose-100' : 'bg-amber-50 text-amber-700 border-amber-100'}`}>
                              {leave.status}
                            </div>
                          </td>
                          <td className="px-4 md:px-6 text-right">
                            {showApprovals ? (
                              <div className="flex justify-end gap-1.5">
                                <button onClick={() => handleAction(leave.id, 'Approved')} className="inline-flex items-center justify-center rounded-md text-[10px] font-semibold bg-emerald-600 text-white h-7 px-2.5 shadow hover:bg-emerald-700 transition-colors">Approve</button>
                                <button onClick={() => handleAction(leave.id, 'Rejected')} className="inline-flex items-center justify-center rounded-md text-[10px] font-semibold bg-rose-600 text-white h-7 px-2.5 shadow hover:bg-rose-700 transition-colors">Reject</button>
                              </div>
                            ) : (
                              <div className="relative">
                                <button 
                                  onClick={() => setOpenMenuId(openMenuId === leave.id ? null : leave.id)}
                                  className="p-1.5 hover:bg-slate-100 rounded-md transition-colors"
                                >
                                  <MoreHorizontal size={16} className="text-slate-500" />
                                </button>
                                
                                {openMenuId === leave.id && (
                                  <div className="absolute right-0 top-full mt-1 w-48 bg-white rounded-lg shadow-xl border border-slate-200 z-50 py-1">
                                    <button 
                                      onClick={() => {
                                        alert(`View Details:\nEmployee: ${leave.employeeName}\nType: ${leave.leaveType}\nFrom: ${formatLeaveDate(leave.fromDate)}\nTo: ${formatLeaveDate(leave.toDate)}\nStatus: ${leave.status}\nReason: ${leave.reason || 'N/A'}`)
                                        setOpenMenuId(null)
                                      }}
                                      className="w-full px-4 py-2 text-left text-sm text-slate-700 hover:bg-slate-50 flex items-center gap-2"
                                    >
                                      <FileText size={14} />
                                      View Details
                                    </button>
                                    
                                    {leave.status === 'Pending' && (
                                      <button 
                                        onClick={() => {
                                          setForm({
                                            employeeId: leave.employeeId,
                                            leaveType: leave.leaveType,
                                            fromDate: leave.fromDate,
                                            toDate: leave.toDate,
                                            reason: leave.reason || '',
                                            deptHeadId: leave.deptHeadId || '',
                                            approverIds: leave.approverIds || [],
                                            physicalFormSubmitted: leave.physicalFormSubmitted || false,
                                            deterrentLeave: leave.deterrentLeave || false
                                          })
                                          setShowInlineForm(true)
                                          setOpenMenuId(null)
                                        }}
                                        className="w-full px-4 py-2 text-left text-sm text-slate-700 hover:bg-slate-50 flex items-center gap-2"
                                      >
                                        <PencilLine size={14} />
                                        Edit Request
                                      </button>
                                    )}
                                    
                                    <div className="border-t border-slate-100 my-1"></div>
                                    
                                    {leave.status !== 'Cancelled' && leave.status !== 'Rejected' && (
                                      <button 
                                        onClick={async () => {
                                          if (confirm(`Are you sure you want to cancel this ${leave.leaveType} leave for ${leave.employeeName}?`)) {
                                            try {
                                              await cancelLeave(leave.id)
                                              refreshLeaves()
                                              alert('Leave cancelled successfully!')
                                            } catch (err) {
                                              alert('Failed to cancel leave: ' + err.message)
                                            }
                                          }
                                          setOpenMenuId(null)
                                        }}
                                        className="w-full px-4 py-2 text-left text-sm text-amber-600 hover:bg-amber-50 flex items-center gap-2"
                                      >
                                        <X size={14} />
                                        Cancel/Revoke
                                      </button>
                                    )}
                                    
                                    {(user.role?.toLowerCase() === 'admin' || user.role?.toLowerCase() === 'hr' || user.uid === leave.createdBy) && (
                                      <button 
                                        onClick={async () => {
                                          if (confirm(`Are you sure you want to DELETE this ${leave.leaveType} leave for ${leave.employeeName}?\n\nThis action cannot be undone.`)) {
                                            try {
                                              await deleteLeave(leave.id)
                                              refreshLeaves()
                                              alert('Leave deleted successfully!')
                                            } catch (err) {
                                              alert('Failed to delete leave: ' + err.message)
                                            }
                                          }
                                          setOpenMenuId(null)
                                        }}
                                        className="w-full px-4 py-2 text-left text-sm text-rose-600 hover:bg-rose-50 flex items-center gap-2"
                                      >
                                        <Trash2 size={14} />
                                        Delete Permanently
                                      </button>
                                    )}
                                  </div>
                                )}
                              </div>
                            )}
                          </td>
                        </tr>
                        {showApprovals && (
                          <tr className="bg-slate-50/30 border-b border-slate-200">
                            <td colSpan={5} className="px-4 md:px-6 py-3">
                              <div className="flex flex-col md:flex-row items-end md:items-center justify-end gap-3 max-w-2xl ml-auto">
                                {isHR && leave.hrApproval === 'Pending' && (
                                  <div className="w-full md:w-56 space-y-1 text-left">
                                    <label className="text-[9px] font-bold text-slate-400 uppercase tracking-widest px-1">Assign Dept Head</label>
                                    <div className="relative">
                                      <select 
                                        value={selectedNextApprover[leave.id] || ''} 
                                        onChange={e => setSelectedNextApprover(prev => ({ ...prev, [leave.id]: e.target.value }))} 
                                        className="flex h-8 w-full items-center justify-between rounded-md border border-slate-200 bg-white px-3 py-1 text-xs appearance-none focus:outline-none focus:ring-2 focus:ring-slate-900"
                                      >
                                        <option value="">Choose Dept. Head...</option>
                                        {employees.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
                                      </select>
                                      <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none h-3 w-3" />
                                    </div>
                                  </div>
                                )}
                                <div className="flex-1 w-full space-y-1 text-left">
                                  <label className="text-[9px] font-bold text-slate-400 uppercase tracking-widest px-1">Remarks</label>
                                  <div className="flex items-center gap-2 bg-white px-3 py-1 rounded-lg border border-slate-200 shadow-sm h-8">
                                    <MessageSquare size={12} className="text-slate-400 shrink-0" />
                                    <input 
                                      type="text"
                                      placeholder="Remarks for rejection..."
                                      value={actionRemarks[leave.id] || ''}
                                      onChange={e => setActionRemarks(prev => ({ ...prev, [leave.id]: e.target.value }))}
                                      className="flex-1 bg-transparent border-none outline-none text-xs font-medium placeholder:text-slate-300"
                                    />
                                  </div>
                                </div>
                              </div>
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {activeSub === 'reports' && (
        <div className="rounded-xl border border-slate-200 bg-white shadow-sm p-10 md:p-16 text-center space-y-4">
          <div className="mx-auto bg-slate-100 w-10 h-10 rounded-full flex items-center justify-center">
            <PieChart size={20} className="text-slate-900" />
          </div>
          <div className="space-y-1">
            <h3 className="text-md font-semibold">Analytics View</h3>
            <p className="text-xs text-slate-500 max-w-sm mx-auto">Advanced data visualization reporting tools coming soon.</p>
          </div>
        </div>
      )}
    </div>
  )
}
