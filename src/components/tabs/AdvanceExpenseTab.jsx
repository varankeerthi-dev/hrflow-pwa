import React, { useState, useEffect, useMemo, useRef } from 'react'
import { createPortal } from 'react-dom'
import DatePicker from 'react-datepicker'
import 'react-datepicker/dist/react-datepicker.css'
import { format, parseISO } from 'date-fns'
import { useAuth } from '../../hooks/useAuth'
import { useEmployees } from '../../hooks/useEmployees'
import { db } from '../../lib/firebase'
import { arrayUnion, collection, addDoc, query, getDocs, onSnapshot, serverTimestamp, orderBy, deleteDoc, doc, getDoc, updateDoc, where, setDoc } from 'firebase/firestore'
import { Trash2, FileDown, Edit2, PieChart, AlertTriangle, Clock, CheckCircle2, ChevronLeft, ChevronRight, Calendar, Search, Filter, RefreshCw, X, History, RotateCcw, Banknote, Camera, Building2, User, Repeat, Send, Plus, Copy, MoreVertical, Sparkles, ChevronDown, Check, HelpCircle, Utensils, Coffee, Car, Hotel, PenTool, Tag, Package, Calculator, Receipt, Shield, Info, Lightbulb, Layers, FilePlus, Folder, SlidersHorizontal } from 'lucide-react'
import Spinner from '../ui/Spinner'
import Dropdown from '../ui/Dropdown'
import { SubTabsNav } from '../ui/SubTabsNav'
import { formatINR } from '../../lib/salaryUtils'
import { jsPDF } from 'jspdf'
import autoTable from 'jspdf-autotable'
import html2canvas from 'html2canvas'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useVirtualizer } from '@tanstack/react-virtual'
import { isEmployeeActiveStatus } from '../../lib/employeeStatus'

function approvalStatusTextClass(status, lane) {
  const s = (status || 'Pending').toLowerCase()
  const isHr = lane === 'hr'
  if (s === 'approved' || s === 'approve') {
    return isHr
      ? 'text-sky-700'
      : 'text-violet-700'
  }
  if (s === 'rejected') {
    return isHr ? 'text-rose-600' : 'text-red-700'
  }
  if (s === 'partial') {
    return isHr ? 'text-cyan-700' : 'text-indigo-700'
  }
  if (s === 'hold') {
    return isHr ? 'text-slate-500' : 'text-zinc-600'
  }
  return isHr ? 'text-amber-700' : 'text-orange-800'
}

function EmployeeLedgerCard({ emp, formatINR }) {
  const [expanded, setExpanded] = useState(false)

  const getStatusBadge = (status) => {
    const s = (status || '').toLowerCase()
    if (s === 'approved') return 'bg-emerald-50 text-emerald-700 border border-emerald-100'
    if (s === 'rejected') return 'bg-rose-50 text-rose-700 border border-rose-100'
    if (s === 'partial') return 'bg-indigo-50 text-indigo-700 border border-indigo-100'
    if (s === 'hold') return 'bg-zinc-100 text-zinc-600 border border-zinc-200'
    return 'bg-amber-50 text-amber-700 border border-amber-100'
  }

  const getPaymentBadge = (paymentStatus) => {
    const s = (paymentStatus || '').toLowerCase()
    if (s === 'paid') return 'bg-emerald-500 text-white'
    if (s === 'unpaid') return 'bg-rose-500 text-white'
    return 'bg-gray-400 text-white'
  }

  return (
    <div className="bg-white rounded-xl border border-zinc-200 shadow-sm overflow-hidden">
      {/* Employee Header */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full px-5 py-4 flex items-center justify-between hover:bg-zinc-50/50 transition-colors"
      >
        <div className="flex items-center gap-4">
          <div className="w-10 h-10 rounded-full bg-gradient-to-br from-cyan-100 to-cyan-200 flex items-center justify-center text-cyan-700 font-black text-sm">
            {emp.name?.charAt(0) || '?'}
          </div>
          <div className="text-left">
            <h3 className="text-sm font-bold text-zinc-800">{emp.name}</h3>
            <p className="text-[11px] text-zinc-500 font-medium">
              {emp.empCode} &middot; {emp.designation}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-6">
          <div className="text-right">
            <p className="text-[10px] font-black uppercase tracking-widest text-zinc-400">Outstanding</p>
            <p className={`text-lg font-black tabular-nums ${emp.outstanding > 0 ? 'text-rose-600' : 'text-emerald-600'}`}>
              {formatINR(emp.outstanding)}
            </p>
          </div>
          <div className="text-right">
            <p className="text-[10px] font-black uppercase tracking-widest text-zinc-400">Advanced</p>
            <p className="text-sm font-bold text-zinc-700 tabular-nums">{formatINR(emp.totalAdvanced)}</p>
          </div>
          <div className="text-right">
            <p className="text-[10px] font-black uppercase tracking-widest text-zinc-400">Paid</p>
            <p className="text-sm font-bold text-emerald-600 tabular-nums">{formatINR(emp.totalPaid)}</p>
          </div>
          <ChevronRight
            size={16}
            className={`text-zinc-400 transition-transform ${expanded ? 'rotate-90' : ''}`}
          />
        </div>
      </button>

      {/* Transaction History (Expandable) */}
      {expanded && (
        <div className="border-t border-zinc-100">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse min-w-[700px]">
              <thead>
                <tr className="bg-zinc-50/80 border-b border-zinc-200">
                  <th className="h-9 px-4 text-[10px] font-black uppercase tracking-widest text-zinc-500 border-r border-zinc-200">Date</th>
                  <th className="h-9 px-4 text-[10px] font-black uppercase tracking-widest text-zinc-500 border-r border-zinc-200">Txn No</th>
                  <th className="h-9 px-4 text-[10px] font-black uppercase tracking-widest text-zinc-500 border-r border-zinc-200">Category</th>
                  <th className="h-9 px-4 text-[10px] font-black uppercase tracking-widest text-zinc-500 text-right border-r border-zinc-200">Amount</th>
                  <th className="h-9 px-4 text-[10px] font-black uppercase tracking-widest text-zinc-500 text-right border-r border-zinc-200">Paid</th>
                  <th className="h-9 px-4 text-[10px] font-black uppercase tracking-widest text-zinc-500 text-right border-r border-zinc-200">Balance</th>
                  <th className="h-9 px-4 text-[10px] font-black uppercase tracking-widest text-zinc-500 border-r border-zinc-200">Status</th>
                  <th className="h-9 px-4 text-[10px] font-black uppercase tracking-widest text-zinc-500 border-r border-zinc-200">Payment</th>
                  <th className="h-9 px-4 text-[10px] font-black uppercase tracking-widest text-zinc-500">Payout</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-50">
                {emp.transactions.map(txn => (
                  <tr key={txn.id} className="h-11 border-b border-zinc-50 hover:bg-zinc-50/50 transition-colors">
                    <td className="px-4 border-r border-zinc-50 text-[12px] font-medium text-zinc-600">{txn.date || '-'}</td>
                    <td className="px-4 border-r border-zinc-50 text-[11px] font-bold text-zinc-700">{txn.transactionNo}</td>
                    <td className="px-4 border-r border-zinc-50 text-[12px] font-medium text-zinc-600">{txn.category}</td>
                    <td className="px-4 text-right border-r border-zinc-50 text-[12px] font-bold text-zinc-800 tabular-nums">{formatINR(txn.amount)}</td>
                    <td className="px-4 text-right border-r border-zinc-50 text-[12px] font-bold text-emerald-600 tabular-nums">{formatINR(txn.paidAmount)}</td>
                    <td className="px-4 text-right border-r border-zinc-50 text-[12px] font-black tabular-nums text-rose-600">{formatINR(txn.balance)}</td>
                    <td className="px-4 border-r border-zinc-50">
                      <span className={`inline-flex px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-tight ${getStatusBadge(txn.status)}`}>
                        {txn.status}
                      </span>
                    </td>
                    <td className="px-4 border-r border-zinc-50">
                      <span className={`inline-flex px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-tight ${getPaymentBadge(txn.paymentStatus)}`}>
                        {txn.paymentStatus}
                      </span>
                    </td>
                    <td className="px-4 text-[11px] font-medium text-zinc-500">{txn.payoutMethod}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}

function AdvanceExpenseMobileRow({ row, idx, activeModule, sortedEmployees, categories, canSelectAll, showAdvanceFields, showProjectColumn, portalMode, handleRowChange, handleDuplicateRow, handleDeleteRow, PaidToDropdown }) {
  const categoryRequiresPaidTo = ['salary to others', 'given to others'].some((value) => (row.category || '').toLowerCase().includes(value))

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
      <div className="flex items-center justify-between gap-2 pb-2">
        <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Row {idx + 1}</span>
        <div className="flex items-center gap-1">
          <button type="button" onClick={() => handleDuplicateRow(row.id)} className="rounded-md p-1.5 text-slate-400 active:bg-blue-50 active:text-blue-600" aria-label={`Duplicate row ${idx + 1}`}><Copy size={14} /></button>
          <button type="button" onClick={() => handleDeleteRow(row.id)} className="rounded-md p-1.5 text-slate-400 active:bg-rose-50 active:text-rose-600" aria-label={`Delete row ${idx + 1}`}><Trash2 size={14} /></button>
        </div>
      </div>

      <div className="space-y-2.5">
        {!portalMode && (
          <div>
            <label className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-slate-500">Employee <span className="text-rose-500">*</span></label>
            <Dropdown
              value={row.employeeId}
              onChange={(value) => handleRowChange(row.id, 'employeeId', value)}
              options={sortedEmployees.map((employee) => ({ label: `${employee.name}${!isEmployeeActiveStatus(employee.status) ? ' (Inactive)' : ''}`, value: employee.id }))}
              placeholder="Select employee..."
              searchable
              size="sm"
              panelWidth="w-[min(20rem,calc(100vw-2rem))]"
              mobileMenu
              autoFocusSearch={false}
              disabled={!canSelectAll}
            />
          </div>
        )}

        <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,112px)] gap-2">
          <div>
            <label className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-slate-500">Category <span className="text-rose-500">*</span></label>
            <Dropdown value={row.category === 'custom' ? '' : row.category} onChange={(value) => handleRowChange(row.id, 'category', value)} options={categories} placeholder="Select category..." size="sm" searchable allowCustom customActive={row.category === 'custom'} onAddOther={() => handleRowChange(row.id, 'category', 'custom')} panelWidth="w-[min(20rem,calc(100vw-2rem))]" mobileMenu autoFocusSearch={false} />
            {row.category === 'custom' && <input type="text" value={row.customCategory || ''} onChange={(e) => handleRowChange(row.id, 'customCategory', e.target.value)} className="mt-1 h-9 w-full rounded-lg border border-slate-200 px-2.5 text-xs outline-none focus:border-blue-500" placeholder="Custom category..." />}
          </div>
          <div>
            <label className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-slate-500">Amount <span className="text-rose-500">*</span></label>
            <input type="number" value={row.amount} onChange={(e) => handleRowChange(row.id, 'amount', e.target.value)} className="h-10 w-full rounded-lg border border-slate-200 px-2 text-right text-sm font-bold text-slate-900 outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500" placeholder="0.00" inputMode="decimal" />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2">
          {!portalMode && (
            <div>
              <label className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-slate-500">Payout <span className="text-rose-500">*</span></label>
              <select value={row.payoutMethod} onChange={(e) => handleRowChange(row.id, 'payoutMethod', e.target.value)} className="h-10 w-full rounded-lg border border-slate-200 bg-white px-2 text-xs font-semibold text-slate-800 outline-none focus:border-blue-500"><option value="Immediate">Immediate</option><option value="With Salary">Monthly</option></select>
            </div>
          )}
          <div>
            <label className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-slate-500">Project</label>
            {showProjectColumn ? <select value={row.project} onChange={(e) => handleRowChange(row.id, 'project', e.target.value)} className="h-10 w-full rounded-lg border border-slate-200 bg-white px-2 text-xs font-medium text-slate-700 outline-none focus:border-blue-500"><option value="">Select project...</option><option value="P-0001">P-0001</option><option value="P-0002">P-0002</option><option value="P-0008">P-0008</option><option value="P-0012">P-0012</option><option value="Site visit - Client Meeting">Site visit - Client Meeting</option></select> : <span className="flex h-10 items-center text-[11px] italic text-slate-400">Optional column off</span>}
          </div>
        </div>

        <div>
          <label className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-slate-500">Remarks</label>
          <input type="text" value={row.reason} onChange={(e) => handleRowChange(row.id, 'reason', e.target.value)} className="h-10 w-full rounded-lg border border-slate-200 px-2.5 text-xs font-medium text-slate-700 outline-none focus:border-blue-500" placeholder="Add a note..." />
        </div>

        {showAdvanceFields && <div className="rounded-lg bg-slate-50 p-2.5"><label className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-slate-500">Paid to / advance reference</label><PaidToDropdown rowId={row.id} row={row} isMobile /></div>}
        {categoryRequiresPaidTo && !showAdvanceFields && <div className="rounded-lg bg-blue-50/70 p-2.5"><label className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-blue-700">Paid to</label><PaidToDropdown rowId={row.id} row={row} isMobile /></div>}
      </div>
    </div>
  )
}

export default function AdvanceExpenseTab({ defaultModule, activeModule: activeModuleProp, onModuleChange, portalMode = false, portalEmployeeId = null }) {
  const { user } = useAuth()
  const { employees } = useEmployees(user?.orgId)
  
  // Sort employees: Active employees at top, Inactive employees at bottom
  const sortedEmployees = useMemo(() => {
    const visibleEmployees = portalMode && portalEmployeeId
      ? employees.filter((employee) => employee.id === portalEmployeeId)
      : employees
    return [...visibleEmployees].sort((a, b) => {
      const aActive = isEmployeeActiveStatus(a.status) ? 0 : 1
      const bActive = isEmployeeActiveStatus(b.status) ? 0 : 1
      if (aActive !== bActive) return aActive - bActive
      return (a.name || '').localeCompare(b.name || '')
    })
  }, [employees, portalEmployeeId, portalMode])
  const queryClient = useQueryClient()
  const [internalActiveModule, setInternalActiveModule] = useState(defaultModule || 'Add Advance')
  const activeModule = activeModuleProp !== undefined ? activeModuleProp : internalActiveModule
  const setActiveModule = (mod) => {
    setInternalActiveModule(mod)
    if (onModuleChange) onModuleChange(mod)
  }

  useEffect(() => {
    if (defaultModule && activeModuleProp === undefined) {
      setInternalActiveModule(defaultModule)
    }
  }, [defaultModule, activeModuleProp])
  const [categories, setCategories] = useState(['Salary Advance', 'Travel', 'Medical'])
  
  // Reports Filter States
  const today = new Date().toISOString().split('T')[0]
  const firstDayOfMonth = new Date().toISOString().slice(0, 8) + '01'
  
  const [reportMonth, setReportMonth] = useState(new Date().toISOString().slice(0, 7)) // YYYY-MM
  const [reportFromDate, setReportFromDate] = useState(firstDayOfMonth)
  const [reportToDate, setReportToDate] = useState(today)
  const [reportSelectedEmployees, setReportSelectedEmployees] = useState([]) // Multi-select
  const [reportFilterCategory, setReportFilterCategory] = useState('')
  const [reportFilterRemarks, setReportFilterRemarks] = useState('')
  const [reportFilterTxn, setReportFilterTxn] = useState('')
  const [reportFilterType, setReportFilterType] = useState('All') // All | Advance | Expense
  const [reportFilterPayout, setReportFilterPayout] = useState('All') // All | Immediate | With Salary
  const [reportFilterProject, setReportFilterProject] = useState('')
  const [filteredEntries, setFilteredEntries] = useState([])
  const [reportApplied, setReportApplied] = useState(false)
  const [ledgerView, setLedgerView] = useState('employee')
  const [ledgerEmployeeId, setLedgerEmployeeId] = useState('')
  const [ledgerFromDate, setLedgerFromDate] = useState('')
  const [ledgerToDate, setLedgerToDate] = useState('')
  const [ledgerCategory, setLedgerCategory] = useState('')
  const [ledgerPage, setLedgerPage] = useState(1)
  const [ledgerShowAll, setLedgerShowAll] = useState(false)
  const ledgerTableRef = useRef(null)
  
  // Filter dropdown states
  const [employeeDropdownOpen, setEmployeeDropdownOpen] = useState(false)
  const [fromDateDropdownOpen, setFromDateDropdownOpen] = useState(false)
  const [toDateDropdownOpen, setToDateDropdownOpen] = useState(false)
  const [categoryDropdownOpen, setCategoryDropdownOpen] = useState(false)
  const [moreDropdownOpen, setMoreDropdownOpen] = useState(false)
  
  // Refs for dropdown containers
  const employeeDropdownRef = useRef(null)
  const fromDateDropdownRef = useRef(null)
  const toDateDropdownRef = useRef(null)
  const categoryDropdownRef = useRef(null)
  const moreDropdownRef = useRef(null)
  
  // Refs for date inputs to auto-open date picker
  const fromDateInputRef = useRef(null)
  const toDateInputRef = useRef(null)
  
  // Ref for reports container (screenshot)
  const reportsContainerRef = useRef(null)
  
  // Ref for CSV file input
  const csvFileInputRef = useRef(null)
  
  // Helper to close all dropdowns
  const closeAllDropdowns = () => {
    setEmployeeDropdownOpen(false)
    setFromDateDropdownOpen(false)
    setToDateDropdownOpen(false)
    setCategoryDropdownOpen(false)
    setMoreDropdownOpen(false)
  }
  
  // Ref for current toDate value (for interval callback)
  const reportToDateRef = useRef(reportToDate)
  reportToDateRef.current = reportToDate

  // Auto-update 'to' date to today when a new day starts (only on mount, not when user changes date)
  useEffect(() => {
    const checkAndUpdateDate = () => {
      const currentDate = new Date().toISOString().split('T')[0]
      const storedDate = reportToDateRef.current
      // Only update if the stored date is in the past (not future)
      if (storedDate && storedDate < currentDate) {
        setReportToDate(currentDate)
      }
    }
    
    // Check immediately on mount
    checkAndUpdateDate()
    
    // Set up interval to check every minute
    const interval = setInterval(checkAndUpdateDate, 60000)
    
    return () => clearInterval(interval)
  }, [])
  
  // Transferred To Modal State
  const [transferModalRowId, setTransferModalRowId] = useState(null)

  // Paid To state (managed internally by reusable Dropdown)

  // Side Drawer State for Approvals
  const [approvalDrawerOpen, setApprovalDrawerOpen] = useState(false)
  const [submittedItems, setSubmittedItems] = useState([]) // Store submitted items, not fetch all
  const [selectedForApproval, setSelectedForApproval] = useState([]) // Track selected items for bulk approval
  const [drawerLoading, setDrawerLoading] = useState(false)
  const [bulkProcessing, setBulkProcessing] = useState(false) // Track bulk approval processing
  
  // Recently Deleted State
  const [showDeletedModal, setShowDeletedModal] = useState(false)
  const [successModal, setSuccessModal] = useState({ open: false, title: '', message: '' })
  const [portalEditForm, setPortalEditForm] = useState(null)

  const isAdmin = user?.role?.toLowerCase() === 'admin'
  const isAccountant = user?.role?.toLowerCase() === 'accountant'
  const isHR = user?.role?.toLowerCase() === 'hr' || isAdmin
  const isMD = user?.role?.toLowerCase() === 'md' || isAdmin
  const canSelectAll = !portalMode && (isAdmin || isAccountant)

  // For editing
  const [editingId, setEditingId] = useState(null)
  const [editForm, setEditForm] = useState({})
  const [revokeAdvance, setRevokeAdvance] = useState(true)

  // For finalizing pre-approvals
  const [finalizingId, setFinalizingId] = useState(null)
  const [finalizeAmount, setFinalizeAmount] = useState('')

  // TanStack Query for fetching entries
  const { data: entries = [], isLoading: loading, refetch: fetchEntries } = useQuery({
    queryKey: ['advances_expenses', user?.orgId, portalMode ? portalEmployeeId : 'workspace'],
    queryFn: async () => {
      if (!user?.orgId) return []
      const q = portalMode && portalEmployeeId
        ? query(collection(db, 'organisations', user.orgId, 'advances_expenses'), where('employeeId', '==', portalEmployeeId), orderBy('date', 'desc'))
        : query(collection(db, 'organisations', user.orgId, 'advances_expenses'), orderBy('date', 'desc'))
      const snap = await getDocs(q)
      return snap.docs.map(d => ({ id: d.id, ...d.data() }))
    },
    enabled: !!user?.orgId && (!portalMode || !!portalEmployeeId)
  })

  // My Portal must reflect a manager's approval decision without requiring the
  // employee to leave and reopen the page. The same entries feed both the
  // submitted history and the right-side recent-expense summary.
  useEffect(() => {
    if (!portalMode || !user?.orgId || !portalEmployeeId) return undefined

    const portalEntriesQuery = query(
      collection(db, 'organisations', user.orgId, 'advances_expenses'),
      where('employeeId', '==', portalEmployeeId),
      orderBy('date', 'desc')
    )

    return onSnapshot(
      portalEntriesQuery,
      (snapshot) => {
        queryClient.setQueryData(
          ['advances_expenses', user.orgId, portalEmployeeId],
          snapshot.docs.map((document) => ({ id: document.id, ...document.data() }))
        )
      },
      (error) => console.error('Portal expense sync error:', error)
    )
  }, [portalMode, portalEmployeeId, queryClient, user?.orgId])

  // Fetch org settings for advance cap
  const { data: orgSettings = {} } = useQuery({
    queryKey: ['orgSettings', user?.orgId],
    queryFn: async () => {
      if (!user?.orgId) return {}
      const orgSnap = await getDoc(doc(db, 'organisations', user.orgId))
      return orgSnap.exists() ? orgSnap.data() : {}
    },
    enabled: !!user?.orgId
  })

  // Fetch approval settings
  const { data: approvalSettings = [] } = useQuery({
    queryKey: ['approvalSettings', user?.orgId],
    queryFn: async () => {
      if (!user?.orgId) return []
      const q = query(collection(db, 'organisations', user.orgId, 'approvalSettings'))
      const snap = await getDocs(q)
      return snap.docs.map(d => ({ id: d.id, ...d.data() }))
    },
    enabled: !!user?.orgId
  })

  // TanStack Query for fetching deleted items
  const { data: deletedEntries = [], isLoading: loadingDeleted } = useQuery({
    queryKey: ['deleted_advances_expenses', user?.orgId],
    queryFn: async () => {
      if (!user?.orgId) return []
      const q = query(
        collection(db, 'organisations', user.orgId, 'deleted_advances_expenses'),
        orderBy('deletedAt', 'desc')
      )
      const snap = await getDocs(q)
      const now = Date.now()
      const thirtyDays = 30 * 24 * 60 * 60 * 1000
      
      return snap.docs
        .map(d => ({ id: d.id, ...d.data() }))
        .filter(item => {
          const deletedAt = item.deletedAt?.toMillis ? item.deletedAt.toMillis() : 0
          return (now - deletedAt) < thirtyDays
        })
    },
    enabled: !!user?.orgId && showDeletedModal
  })

  // Advance Ledger: Per-employee outstanding balances
  const ledgerData = useMemo(() => {
    if (!entries.length || !employees.length) return { employees: [], totalOutstanding: 0 }

    const employeeMap = new Map()
    employees.forEach(emp => {
      employeeMap.set(emp.id, {
        id: emp.id,
        name: emp.name,
        empCode: emp.empCode || emp.id.slice(0, 5),
        designation: emp.designation || '-',
        totalAdvanced: 0,
        totalPaid: 0,
        outstanding: 0,
        transactions: []
      })
    })

    // Process all advance entries
    entries.forEach(entry => {
      if (entry.type !== 'Advance') return
      const emp = employeeMap.get(entry.employeeId)
      if (!emp) return

      const amount = Number(entry.amount) || 0
      const paidAmount = entry.paymentStatus === 'Paid'
        ? (Number(entry.partialAmount) || amount)
        : 0

      emp.totalAdvanced += amount
      emp.totalPaid += paidAmount
      emp.outstanding += (amount - paidAmount)

      emp.transactions.push({
        id: entry.id,
        transactionNo: entry.transactionNo || '-',
        date: entry.date,
        category: entry.category || '-',
        amount,
        paidAmount,
        balance: amount - paidAmount,
        status: entry.status || 'Pending',
        paymentStatus: entry.paymentStatus || 'Pending',
        payoutMethod: entry.payoutMethod || '-',
        reason: entry.reason || '-',
        project: entry.project || '-'
      })
    })

    // Sort transactions by date descending
    employeeMap.forEach(emp => {
      emp.transactions.sort((a, b) => (b.date || '').localeCompare(a.date || ''))
    })

    const employeeArray = Array.from(employeeMap.values())
      .filter(emp => emp.totalAdvanced > 0)
      .sort((a, b) => b.outstanding - a.outstanding)

    const totalOutstanding = employeeArray.reduce((sum, emp) => sum + emp.outstanding, 0)

    return { employees: employeeArray, totalOutstanding }
  }, [entries, employees])

  const formatLedgerDate = (value) => {
    if (!value) return '—'
    const parsed = typeof value === 'string' ? parseISO(value) : value?.toDate?.() || new Date(value)
    return Number.isNaN(parsed?.getTime?.()) ? String(value) : format(parsed, 'dd-MMM-yyyy')
  }

  const ledgerCategories = useMemo(() => [...new Set(entries.filter((entry) => ['Advance', 'Expense'].includes(entry.type)).map((entry) => entry.category).filter(Boolean))].sort(), [entries])

  const allLedgerEntries = useMemo(() => {
    return entries
      .filter((entry) => {
        if (!['Advance', 'Expense'].includes(entry.type)) return false
        if (ledgerEmployeeId && entry.employeeId !== ledgerEmployeeId) return false
        if (ledgerFromDate && String(entry.date || '') < ledgerFromDate) return false
        if (ledgerToDate && String(entry.date || '') > ledgerToDate) return false
        if (ledgerCategory && entry.category !== ledgerCategory) return false
        return true
      })
      .map((entry) => {
        const amount = Number(entry.amount || 0)
        const paidAmount = entry.paymentStatus === 'Paid' ? (Number(entry.partialAmount) || amount) : 0
        const employee = employees.find((item) => item.id === entry.employeeId)
        return {
          ...entry,
          employeeName: entry.employeeName || employee?.name || 'Unknown employee',
          amount,
          paidAmount,
          balance: amount - paidAmount,
        }
      })
      .sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')))
  }, [entries, employees, ledgerCategory, ledgerEmployeeId, ledgerFromDate, ledgerToDate])

  const ledgerTotals = useMemo(() => {
    const advanceTotal = allLedgerEntries.filter((entry) => entry.type === 'Advance').reduce((sum, entry) => sum + entry.amount, 0)
    const expenseTotal = allLedgerEntries.filter((entry) => entry.type === 'Expense').reduce((sum, entry) => sum + entry.amount, 0)
    return { advanceTotal, expenseTotal, finalBalance: advanceTotal - expenseTotal }
  }, [allLedgerEntries])

  const ledgerPageSize = 50
  const ledgerPageCount = Math.max(1, Math.ceil(allLedgerEntries.length / ledgerPageSize))
  const ledgerVisibleEntries = useMemo(() => ledgerShowAll ? allLedgerEntries : allLedgerEntries.slice((ledgerPage - 1) * ledgerPageSize, ledgerPage * ledgerPageSize), [allLedgerEntries, ledgerPage, ledgerShowAll])
  const ledgerVirtualizer = useVirtualizer({
    count: ledgerVisibleEntries.length,
    getScrollElement: () => ledgerTableRef.current,
    estimateSize: () => 46,
    overscan: 10,
  })

  useEffect(() => {
    setLedgerPage(1)
    setLedgerShowAll(false)
  }, [ledgerCategory, ledgerEmployeeId, ledgerFromDate, ledgerToDate])

  // Mutations
  const addMutation = useMutation({
    mutationFn: async (newEntries) => {
      const generatedIds = []
      for (const row of newEntries) {
        const emp = employees.find(e => e.id === row.employeeId)
        const resolvedCategory = row.category === 'custom' && row.customCategory
          ? row.customCategory.trim()
          : row.category
        let type = 'Expense'
        if (activeModule === 'Add Advance') type = 'Advance'
        else if (activeModule === 'Add Expense') type = 'Expense'
        else type = resolvedCategory.toLowerCase().includes('advance') ? 'Advance' : 'Expense'

        // Generate Professional Transaction No: TYPE-YYMMDD-RAND
        const datePart = new Date().toISOString().slice(2, 10).replace(/-/g, '')
        const randPart = Math.random().toString(36).substring(2, 6).toUpperCase()
        const txnNo = `${type.slice(0, 3).toUpperCase()}-${datePart}-${randPart}`
        generatedIds.push(txnNo)

        const finalCategory = row.transferredToName 
          ? `${resolvedCategory} [${row.transferredToName}]`
          : resolvedCategory

        // Determine paidTo information
        const paidToEmp = row.paidToType === 'employee' ? employees.find(e => e.id === row.paidTo) : null
        const paidToName = row.paidToType === 'employee' ? (paidToEmp?.name || null) : (row.paidToCustomName || null)

        // Auto-link to employee advance if expense is paid to another employee
        // ANY expense paid to an employee creates an advance for that receiving employee
        let linkedAdvanceId = null
        const isPaidToEmployee = row.paidToType === 'employee' && row.paidTo
        if (isPaidToEmployee) {
          // Create linked Advance record for the receiving employee
          const advanceTxnNo = `ADV-${datePart}-${Math.random().toString(36).substring(2, 6).toUpperCase()}`
          const advanceDoc = await addDoc(collection(db, 'organisations', user.orgId, 'advances_expenses'), {
            transactionNo: advanceTxnNo,
            employeeId: row.paidTo,
            employeeName: paidToEmp?.name || 'Unknown',
            type: 'Advance',
            category: 'Cash Advance (Paid)',
            requestType: 'Pre-Approval',
            payoutMethod: 'Immediate',
            amount: Number(row.amount),
            date: row.date,
            reason: `Cash paid from ${user.name || user.email} - ${row.reason || row.category || ''}`,
            project: row.project || '',
            status: 'Approved',
            approved_by: user.name || user.email,
            approved_at: serverTimestamp(),
            hrApproval: 'Approved',
            mdApproval: 'Approved',
            paymentStatus: 'Paid',
            paidBy: user.uid,
            paidByName: user.name || user.email,
            linkedExpenseId: null, // Will be updated after expense creation
            createdBy: user.name || user.email,
            createdAt: serverTimestamp()
          })
          linkedAdvanceId = advanceDoc.id
        }

        let initialStatus = 'Pending'
        let initialHrApproval = 'Pending'
        let initialMdApproval = 'Pending'
        let initialApprovedBy = null
        let initialApprovedAt = null

        const expenseDoc = await addDoc(collection(db, 'organisations', user.orgId, 'advances_expenses'), {
          transactionNo: txnNo,
          employeeId: row.employeeId,
          employeeName: emp?.name || 'Unknown',
          type: type,
          category: finalCategory,
          requestType: row.requestType || 'Reimbursement',
          payoutMethod: row.payoutMethod || 'Immediate',
          amount: Number(row.amount),
          date: row.date,
          reason: row.reason,
          project: row.project || '',
          status: initialStatus,
          approved_by: initialApprovedBy,
          approved_at: initialApprovedAt,
          hrApproval: initialHrApproval,
          mdApproval: initialMdApproval,
          createdBy: user.name || user.email,
          submittedByUid: user.uid,
          createdAt: serverTimestamp(),
          approvalSource: 'advance-expense',
          approvalRequired: true,
          approvalWorkflow: 'standard',
          paidTo: row.paidTo || null,
          paidToType: row.paidToType || null,
          paidToName: paidToName,
          paidToCustomName: row.paidToCustomName || null,
          linkedAdvanceId: linkedAdvanceId,
          isCashAdvance: !!linkedAdvanceId
        })
        
        // Update the linked advance with expense ID
        if (linkedAdvanceId) {
          await updateDoc(doc(db, 'organisations', user.orgId, 'advances_expenses', linkedAdvanceId), {
            linkedExpenseId: expenseDoc.id
          })
        }
      }
      return generatedIds
    },
    onSuccess: (txnNos) => {
      queryClient.invalidateQueries(['advances_expenses', user?.orgId])
      setAddRows([{ id: Date.now(), date: new Date().toISOString().split('T')[0], employeeId: !canSelectAll ? getMyEmpId() : '', category: '', amount: '', reason: '', project: '', requestType: 'Reimbursement', payoutMethod: 'Immediate', transferredToName: '', paidTo: '', paidToType: 'employee', paidToCustomName: '' }])
      try { localStorage.removeItem('hrflow_expense_draft') } catch (e) { /* ignore */ }
      // Note: Drawer will open automatically showing submitted items
    }
  })

  const updateMutation = useMutation({
    mutationFn: async ({ id, data, revokeAdvFlag }) => {
      // Revoke logic for paid advances AND paid immediate expenses (if requested)
      const itemRef = doc(db, 'organisations', user.orgId, 'advances_expenses', id)
      const itemSnap = await getDoc(itemRef)
      const itemData = itemSnap.data()

      if (revokeAdvFlag && itemData?.paymentStatus === 'Paid' && 
         (itemData?.type === 'Advance' || (itemData?.type === 'Expense' && itemData?.payoutMethod !== 'With Salary'))) {
        const advQ = query(
          collection(db, 'organisations', user.orgId, 'advances'),
          where('linkedRequestId', '==', id)
        )
        const advSnap = await getDocs(advQ)
        for (const d of advSnap.docs) {
          await deleteDoc(doc(db, 'organisations', user.orgId, 'advances', d.id))
        }
      }

      // Reset approvals and status to Pending
      const updatedData = {
        ...data,
        status: 'Pending',
        hrApproval: 'Pending',
        mdApproval: 'Pending',
        paymentStatus: 'Unpaid',
        paidAt: null,
        paidBy: null,
        approved_at: null,
        approved_by: null,
        updatedAt: serverTimestamp()
      }
      delete updatedData.id
      await updateDoc(itemRef, updatedData)
    },
    onSuccess: () => {
      queryClient.invalidateQueries(['advances_expenses', user?.orgId])
      setEditingId(null)
    }
  })

  const portalExpenseUpdateMutation = useMutation({
    mutationFn: async ({ id, changes }) => {
      if (!portalMode || !portalEmployeeId) throw new Error('Employee portal context is required.')
      const itemRef = doc(db, 'organisations', user.orgId, 'advances_expenses', id)
      const itemSnap = await getDoc(itemRef)
      const original = itemSnap.data()

      if (!original || original.employeeId !== portalEmployeeId || original.type !== 'Expense' || original.status !== 'Pending') {
        throw new Error('Only your own pending expenses can be edited.')
      }

      const nextValues = {
        date: changes.date,
        category: changes.category?.trim(),
        amount: Number(changes.amount),
        reason: changes.reason?.trim() || '',
        remarks: changes.remarks?.trim() || '',
        project: changes.project?.trim() || '',
      }
      if (!nextValues.date || !nextValues.category || !nextValues.amount || nextValues.amount <= 0) {
        throw new Error('Enter a date, category, and amount greater than zero.')
      }

      await updateDoc(itemRef, {
        ...nextValues,
        employeeEditedAt: serverTimestamp(),
        employeeEditedByUid: user.uid,
        employeeEditAudit: arrayUnion({
          at: new Date().toISOString(),
          byUid: user.uid,
          action: 'edited_pending_expense',
          previous: {
            date: original.date || '',
            category: original.category || '',
            amount: Number(original.amount || 0),
            reason: original.reason || '',
            remarks: original.remarks || original.mileageRemarks || '',
            project: original.project || '',
          },
          next: nextValues,
        }),
      })
    },
    onSuccess: () => {
      queryClient.invalidateQueries(['advances_expenses', user?.orgId])
      setPortalEditForm(null)
      setSuccessModal({ open: true, title: 'Expense Updated', message: 'Your pending expense has been updated and remains in the approval queue.' })
      setTimeout(() => setSuccessModal(prev => ({ ...prev, open: false })), 3000)
    },
  })

  const portalExpenseWithdrawMutation = useMutation({
    mutationFn: async (entry) => {
      if (!portalMode || !portalEmployeeId) throw new Error('Employee portal context is required.')
      const itemRef = doc(db, 'organisations', user.orgId, 'advances_expenses', entry.id)
      const itemSnap = await getDoc(itemRef)
      const original = itemSnap.data()

      if (!original || original.employeeId !== portalEmployeeId || original.type !== 'Expense' || original.status !== 'Pending') {
        throw new Error('Only your own pending expenses can be withdrawn.')
      }

      await updateDoc(itemRef, {
        status: 'Withdrawn',
        hrApproval: 'Withdrawn',
        mdApproval: 'Withdrawn',
        withdrawnAt: serverTimestamp(),
        withdrawnByUid: user.uid,
        employeeEditAudit: arrayUnion({ at: new Date().toISOString(), byUid: user.uid, action: 'withdrew_pending_expense' }),
      })
    },
    onSuccess: () => {
      queryClient.invalidateQueries(['advances_expenses', user?.orgId])
      setSuccessModal({ open: true, title: 'Expense Withdrawn', message: 'This pending expense has been withdrawn and will not move forward for approval.' })
      setTimeout(() => setSuccessModal(prev => ({ ...prev, open: false })), 3000)
    },
  })

  const finalizeMutation = useMutation({
    mutationFn: async ({ id, finalAmount }) => {
      const itemRef = doc(db, 'organisations', user.orgId, 'advances_expenses', id)
      await updateDoc(itemRef, {
        requestType: 'Reimbursement',
        amount: Number(finalAmount),
        finalizedAt: serverTimestamp(),
        finalizedBy: user.email || user.name,
        // If it was already MD approved, it will now show up in Accountant's Payment Queue
        // because it's no longer 'Pre-Approval'
        updatedAt: serverTimestamp()
      })
    },
    onSuccess: () => {
      queryClient.invalidateQueries(['advances_expenses', user?.orgId])
      setFinalizingId(null)
      alert('Bill submitted! It has been moved to the payment queue.')
    }
  })

  const getMyEmpId = () => {
    if (portalMode && portalEmployeeId) return portalEmployeeId
    const me = employees.find(e => e.email === user.email || e.id === user.uid)
    return me ? me.id : ''
  }

  // Paid To Dropdown Component Helper
  const PaidToDropdown = ({ rowId, row, isMobile = false }) => {
    const categoriesRequiringPaidTo = ['salary to others', 'given to others']
    const categoryLower = row.category?.toLowerCase().trim() || ''
    const requiresPaidTo = categoriesRequiringPaidTo.some(reqCat => categoryLower.includes(reqCat))

    const activeEmps = employees.filter(e => (e.status || 'Active').toLowerCase() === 'active')
    const employeeOptions = activeEmps.map(e => ({ label: e.name, value: e.id }))

    const displayValue = (() => {
      if (row.paidToType === 'custom' && row.paidToCustomName) {
        return row.paidToCustomName
      }
      if (row.paidTo) {
        const emp = employees.find(e => e.id === row.paidTo)
        return emp ? emp.name : row.paidTo
      }
      return isMobile ? 'Select paid to...' : 'Select...'
    })()

    if (!requiresPaidTo) {
      return (
        <div className="text-[10px] text-gray-400 italic">
          Select category first
        </div>
      )
    }

    return (
      <div>
        <Dropdown
          value={row.paidToType === 'employee' ? (row.paidTo || '') : ''}
          onChange={(val) => handleRowChange(rowId, 'paidTo', val)}
          options={employeeOptions}
          placeholder={displayValue}
          searchable
          allowCustom
          customActive={row.paidToType === 'custom'}
          onAddOther={() => handleRowChange(rowId, 'paidToType', 'custom')}
          size={isMobile ? 'md' : 'xs'}
          panelWidth={isMobile ? 'w-64' : undefined}
        />

        {/* Custom Name Input - shown when "Add Other..." is selected */}
        {row.paidToType === 'custom' && (
          <input
            type="text"
            value={row.paidToCustomName}
            onChange={(e) => handleRowChange(rowId, 'paidToCustomName', e.target.value)}
            placeholder="Enter recipient name..."
            className={`w-full border border-zinc-200 rounded-lg px-3 text-sm font-medium outline-none focus:ring-2 focus:ring-indigo-500 bg-white mt-2 ${
              isMobile ? 'h-11 px-3 text-sm' : 'h-10'
            }`}
          />
        )}
      </div>
    )
  }

  // LocalStorage persistence helpers
  const LS_KEY = 'hrflow_expense_draft'
  const loadDraft = () => {
    try {
      const saved = localStorage.getItem(LS_KEY)
      if (saved) return JSON.parse(saved)
    } catch (e) { /* ignore parse errors */ }
    return null
  }
  const draft = loadDraft()

  const [addRows, setAddRows] = useState(() => {
    if (draft?.addRows?.length) return draft.addRows
    return [{ id: Date.now(), date: new Date().toISOString().split('T')[0], employeeId: '', category: '', amount: '', reason: '', project: '', requestType: 'Reimbursement', payoutMethod: 'Immediate', transferredToName: '', paidTo: '', paidToType: 'employee', paidToCustomName: '' }]
  })

  const [expenseMode, setExpenseMode] = useState(draft?.expenseMode || 'self')
  const [sessionDate, setSessionDate] = useState(() => draft?.sessionDate || new Date().toISOString().split('T')[0])
  const [sessionAccount, setSessionAccount] = useState(draft?.sessionAccount || 'Petty Cash - HO')
  const [sessionDefaultEmp, setSessionDefaultEmp] = useState(draft?.sessionDefaultEmp || '')
  const [sessionPayout, setSessionPayout] = useState(draft?.sessionPayout || 'Immediate')
  const [showAdvanceFields, setShowAdvanceFields] = useState(draft?.showAdvanceFields || false)
  const [showAdvancedColumns, setShowAdvancedColumns] = useState(false)
  const [showShortcutsModal, setShowShortcutsModal] = useState(false)
  const [showAdvanceFieldsDropdown, setShowAdvanceFieldsDropdown] = useState(false)
  const [showProjectColumn, setShowProjectColumn] = useState(draft?.showProjectColumn ?? false)
  const [showSessionEmployee, setShowSessionEmployee] = useState(draft?.showSessionEmployee ?? true)
  const [showSessionAccount, setShowSessionAccount] = useState(draft?.showSessionAccount ?? true)
  const [showSessionPayout, setShowSessionPayout] = useState(draft?.showSessionPayout ?? true)
  const [isMobileReportExpanded, setIsMobileReportExpanded] = useState(false)
  const [activePaidToRowId, setActivePaidToRowId] = useState(null)
  const [paidToPopoverPos, setPaidToPopoverPos] = useState({ top: 200, left: 200 })
  const [paidToSearchTerm, setPaidToSearchTerm] = useState('')
  const advanceFieldsDropdownRef = useRef(null)
  const paidToPopoverRef = useRef(null)

  // Auto-save draft to localStorage on state changes
  useEffect(() => {
    const draftData = {
      addRows,
      expenseMode,
      sessionDate,
      sessionAccount,
      sessionDefaultEmp,
      sessionPayout,
      showAdvanceFields,
      showProjectColumn,
      showSessionEmployee,
      showSessionAccount,
      showSessionPayout,
    }
    try {
      localStorage.setItem(LS_KEY, JSON.stringify(draftData))
    } catch (e) { /* quota exceeded, ignore */ }
  }, [addRows, expenseMode, sessionDate, sessionAccount, sessionDefaultEmp, sessionPayout, showAdvanceFields, showProjectColumn, showSessionEmployee, showSessionAccount, showSessionPayout])

  // Compute side panel data: Date-grouped recent entries & Current Month total
  const sidePanelData = useMemo(() => {
    if (!entries || !Array.isArray(entries)) return { groups: [], monthTotal: 0 }
    const isAdvance = activeModule === 'Add Advance'
    
    // Filter items matching active module (Advance vs Expense)
    const filtered = entries.filter(item => {
      const itemType = (item.type || '').toLowerCase()
      return isAdvance ? itemType.includes('advance') : (itemType.includes('expense') || itemType === 'reimbursement')
    })

    const grouped = {}
    let monthTotal = 0

    filtered.forEach(item => {
      const dStr = item.date || item.createdAt?.slice?.(0, 10) || ''
      if (!dStr) return
      const amt = parseFloat(item.amount) || 0
      monthTotal += amt

      if (!grouped[dStr]) {
        grouped[dStr] = { dateStr: dStr, items: [], total: 0 }
      }
      grouped[dStr].items.push(item)
      grouped[dStr].total += amt
    })

    // Sort dates in descending order (most recent first)
    const sortedDates = Object.keys(grouped).sort((a, b) => b.localeCompare(a))
    const groups = sortedDates.map(dStr => grouped[dStr])

    return { groups, monthTotal }
  }, [entries, activeModule])

  const formatDateTitle = (dStr) => {
    if (!dStr) return ''
    try {
      const d = parseISO(dStr)
      if (isNaN(d.getTime())) return dStr
      return format(d, 'dd-MMM-yyyy')
    } catch {
      return dStr
    }
  }

  const openPaidToPopover = (rowId, targetElem) => {
    if (!rowId) {
      setActivePaidToRowId(null)
      return
    }
    setTimeout(() => {
      const cellElem = document.getElementById(`category-cell-${rowId}`) || targetElem
      if (cellElem) {
        const rect = cellElem.getBoundingClientRect()
        const popupHeight = 220
        const spaceBelow = window.innerHeight - rect.bottom
        let topPos = rect.bottom + 4
        if (spaceBelow < popupHeight && rect.top > popupHeight) {
          topPos = rect.top - popupHeight - 4
        }
        setPaidToPopoverPos({
          top: Math.max(10, topPos),
          left: Math.min(window.innerWidth - 270, Math.max(10, rect.left))
        })
      }
      setActivePaidToRowId(rowId)
    }, 10)
  }

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (advanceFieldsDropdownRef.current && !advanceFieldsDropdownRef.current.contains(event.target)) {
        setShowAdvanceFieldsDropdown(false)
      }
      if (paidToPopoverRef.current && !paidToPopoverRef.current.contains(event.target)) {
        setActivePaidToRowId(null)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const handleDuplicateRow = (rowId) => {
    const target = addRows.find(r => r.id === rowId)
    if (!target) return
    const newRow = {
      ...target,
      id: Date.now() + Math.random()
    }
    const idx = addRows.findIndex(r => r.id === rowId)
    const updated = [...addRows]
    updated.splice(idx + 1, 0, newRow)
    setAddRows(updated)
  }

  const handleClearSession = () => {
    const todayStr = new Date().toISOString().split('T')[0]
    setSessionDate(todayStr)
    setSessionAccount('Petty Cash - HO')
    setSessionDefaultEmp('')
    setSessionPayout('Immediate')
    const myId = !canSelectAll ? getMyEmpId() : ''
    setAddRows([
      { id: Date.now(), date: todayStr, employeeId: myId, category: '', amount: '', reason: '', project: '', requestType: 'Reimbursement', payoutMethod: 'Immediate', transferredToName: '', paidTo: '', paidToType: 'employee', paidToCustomName: '' }
    ])
    try { localStorage.removeItem('hrflow_expense_draft') } catch (e) { /* ignore */ }
  }

  useEffect(() => {
    if (employees.length > 0) {
      const myId = getMyEmpId()
      if (myId && !sessionDefaultEmp) {
        setSessionDefaultEmp(myId)
      }
      const activeEmp = sessionDefaultEmp || myId
      if (activeEmp) {
        setAddRows(rows => rows.map(r => (!r.employeeId ? { ...r, employeeId: activeEmp } : r)))
      }
    }
  }, [employees, user?.email])

  const [submitting, setSubmitting] = useState(false)

  const modules = portalMode
    ? ['Add Advance', 'Add Expense']
    : ['Add Advance', 'Add Expense', 'Escalation', 'Summary', 'Ledger', 'Reports']
  const defaultCategories = ['Salary Advance', 'Travel', 'Medical', 'Food', 'Office Supplies', 'Others']

  const fetchCategories = async () => {
    if (!user?.orgId) return
    try {
      const orgSnap = await getDoc(doc(db, 'organisations', user.orgId))
      if (orgSnap.exists()) {
        const orgData = orgSnap.data()
        if (orgData.advanceCategories && orgData.advanceCategories.length > 0) {
          const merged = [...new Set([...orgData.advanceCategories, ...defaultCategories])]
          setCategories(merged)
        } else {
          setCategories(defaultCategories)
        }
      }
    } catch (err) {
      console.error('Error fetching categories:', err)
      setCategories(defaultCategories)
    }
  }

  useEffect(() => { fetchCategories() }, [user?.orgId])

  // Auto-apply filters when any filter changes
  useEffect(() => {
    const autoApplyFilters = () => {
      const filtered = entries.filter(e => {
        // Date range filter
        let matchesDate = true
        if (reportFromDate && reportToDate) {
          matchesDate = e.date >= reportFromDate && e.date <= reportToDate
        } else if (reportFromDate) {
          matchesDate = e.date >= reportFromDate
        } else if (reportToDate) {
          matchesDate = e.date <= reportToDate
        } else {
          // Fallback to month filter if no date range selected
          matchesDate = e.date && e.date.startsWith(reportMonth)
        }
        
        // Employee multi-select filter
        const selectedEmpNamesLower = reportSelectedEmployees
          .map(id => employees.find(emp => emp.id === id)?.name)
          .filter(Boolean)
          .map(n => n.toLowerCase().trim())

        const empNameLower = (e.employeeName || '').toLowerCase().trim()
        const paidToNameLower = (e.paidToName || e.paidToCustomName || '').toLowerCase().trim()

        const matchesEmployee = reportSelectedEmployees.length === 0 || 
          reportSelectedEmployees.includes(e.employeeId) ||
          (e.paidTo && reportSelectedEmployees.includes(e.paidTo)) ||
          (e.paidToId && reportSelectedEmployees.includes(e.paidToId)) ||
          (empNameLower && selectedEmpNamesLower.includes(empNameLower)) ||
          (paidToNameLower && selectedEmpNamesLower.includes(paidToNameLower))
        
        // Category filter
        const matchesCategory = !reportFilterCategory || 
          (e.category && e.category.toLowerCase().includes(reportFilterCategory.toLowerCase()))
        
        // Remarks search filter
        const matchesRemarks = !reportFilterRemarks || 
          (e.remarks && e.remarks.toLowerCase().includes(reportFilterRemarks.toLowerCase()))
        
        // Transaction number filter
        const matchesTxn = !reportFilterTxn || 
          (e.transactionNo && e.transactionNo.toLowerCase().includes(reportFilterTxn.toLowerCase()))
        
        // Type filter
        const matchesType = reportFilterType === 'All' || e.type === reportFilterType
        
        // Payout filter
        const matchesPayout = reportFilterPayout === 'All' || e.payoutMethod === reportFilterPayout
        
        // Project filter
        const matchesProject = !reportFilterProject || 
          (e.project && e.project.toLowerCase().includes(reportFilterProject.toLowerCase()))
        
        return matchesDate && matchesEmployee && matchesCategory && matchesRemarks && matchesTxn && matchesType && matchesPayout && matchesProject
      })
      
      setFilteredEntries(filtered)
      setReportApplied(true)
    }
    
    if (entries.length > 0) {
      autoApplyFilters()
    }
  }, [entries, reportFromDate, reportToDate, reportSelectedEmployees, reportFilterCategory, reportFilterRemarks, reportFilterTxn, reportFilterType, reportFilterPayout, reportMonth, reportFilterProject])

  // Close dropdowns when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      // Check if click is outside all dropdown containers
      const isOutsideEmployee = employeeDropdownRef.current && !employeeDropdownRef.current.contains(event.target)
      const isOutsideFromDate = fromDateDropdownRef.current && !fromDateDropdownRef.current.contains(event.target)
      const isOutsideToDate = toDateDropdownRef.current && !toDateDropdownRef.current.contains(event.target)
      const isOutsideCategory = categoryDropdownRef.current && !categoryDropdownRef.current.contains(event.target)
      const isOutsideMore = moreDropdownRef.current && !moreDropdownRef.current.contains(event.target)
      
      // Only close if at least one dropdown is open and click is outside all of them
      if ((employeeDropdownOpen || fromDateDropdownOpen || toDateDropdownOpen || categoryDropdownOpen || moreDropdownOpen) &&
          isOutsideEmployee && isOutsideFromDate && isOutsideToDate && isOutsideCategory && isOutsideMore) {
        closeAllDropdowns()
      }
    }
    
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [employeeDropdownOpen, fromDateDropdownOpen, toDateDropdownOpen, categoryDropdownOpen, moreDropdownOpen])

  // Auto-open date picker when dropdown opens
  useEffect(() => {
    if (fromDateDropdownOpen && fromDateInputRef.current) {
      // Small delay to ensure the input is rendered
      setTimeout(() => {
        fromDateInputRef.current?.showPicker?.()
      }, 100)
    }
  }, [fromDateDropdownOpen])
  
  useEffect(() => {
    if (toDateDropdownOpen && toDateInputRef.current) {
      // Small delay to ensure the input is rendered
      setTimeout(() => {
        toDateInputRef.current?.showPicker?.()
      }, 100)
    }
  }, [toDateDropdownOpen])

  const handleAddRow = () => {
    const activeEmp = sessionDefaultEmp || getMyEmpId() || ''
    const newId = Date.now() + Math.random()
    setAddRows(prev => [...prev, { id: newId, date: new Date().toISOString().split('T')[0], employeeId: activeEmp, category: '', amount: '', reason: '', project: '', requestType: 'Reimbursement', payoutMethod: sessionPayout || 'Immediate', transferredToName: '', paidTo: '', paidToType: 'employee', paidToCustomName: '' }])
    // Auto-focus the new row's category cell after React renders it
    setTimeout(() => {
      const catCell = document.getElementById(`category-cell-${newId}`)
      if (catCell) {
        const select = catCell.querySelector('select')
        if (select) select.focus()
      }
    }, 50)
    return newId
  }

  const handleSelfExpense = () => {
    const currentUserEmp = employees.find(e => e.email === user.email || e.id === user.uid)
    const empId = currentUserEmp ? currentUserEmp.id : (user.uid || '')
    setAddRows(addRows.map(row => ({ ...row, employeeId: empId })))
  }

  const handleCSVImport = (event) => {
    const file = event.target.files[0]
    if (!file) return
    
    if (!file.name.endsWith('.csv')) {
      alert('Please select a CSV file')
      return
    }
    
    const reader = new FileReader()
    reader.onload = (e) => {
      try {
        const text = e.target.result
        const lines = text.split('\n').filter(line => line.trim())
        
        if (lines.length < 2) {
          alert('CSV file must have a header row and at least one data row')
          return
        }
        
        // Parse header
        const header = lines[0].split(',').map(h => h.trim().toLowerCase().replace(/"/g, ''))
        
        // Find column indices
        const dateIdx = header.findIndex(h => h.includes('date'))
        const empIdx = header.findIndex(h => h.includes('employee') || h.includes('name') || h.includes('emp'))
        const catIdx = header.findIndex(h => h.includes('category') || h.includes('type'))
        const amtIdx = header.findIndex(h => h.includes('amount') || h.includes('amt'))
        const reasonIdx = header.findIndex(h => h.includes('reason') || h.includes('remark') || h.includes('note'))
        const projectIdx = header.findIndex(h => h.includes('project'))
        
        if (amtIdx === -1) {
          alert('CSV must have an "Amount" column')
          return
        }
        
        const newRows = []
        const errors = []
        
        for (let i = 1; i < lines.length; i++) {
          const line = lines[i].trim()
          if (!line) continue
          
          // Parse CSV row (handle quoted values)
          const values = []
          let current = ''
          let inQuotes = false
          for (const char of line) {
            if (char === '"') {
              inQuotes = !inQuotes
            } else if (char === ',' && !inQuotes) {
              values.push(current.trim())
              current = ''
            } else {
              current += char
            }
          }
          values.push(current.trim())
          
          const amount = parseFloat(values[amtIdx]?.replace(/[₹,]/g, ''))
          if (isNaN(amount) || amount <= 0) {
            errors.push(`Row ${i + 1}: Invalid amount "${values[amtIdx]}"`)
            continue
          }
          
          // Find employee by name
          let employeeId = ''
          if (empIdx !== -1 && values[empIdx]) {
            const empName = values[empIdx].toLowerCase()
            const foundEmp = employees.find(e => 
              e.name?.toLowerCase().includes(empName) || 
              empName.includes(e.name?.toLowerCase())
            )
            if (foundEmp) {
              employeeId = foundEmp.id
            } else {
              errors.push(`Row ${i + 1}: Employee "${values[empIdx]}" not found`)
              continue
            }
          }
          
          // Parse date
          let date = new Date().toISOString().split('T')[0]
          if (dateIdx !== -1 && values[dateIdx]) {
            const parsedDate = new Date(values[dateIdx])
            if (!isNaN(parsedDate.getTime())) {
              date = parsedDate.toISOString().split('T')[0]
            }
          }
          
          const row = {
            id: Date.now() + i,
            date,
            employeeId,
            category: catIdx !== -1 ? values[catIdx] || '' : '',
            amount,
            reason: reasonIdx !== -1 ? values[reasonIdx] || '' : '',
            project: projectIdx !== -1 ? values[projectIdx] || '' : '',
            requestType: 'Reimbursement',
            payoutMethod: 'Immediate',
            transferredToName: '',
            paidTo: '',
            paidToType: 'employee',
            paidToCustomName: ''
          }
          
          newRows.push(row)
        }
        
        if (errors.length > 0) {
          const proceed = confirm(`Import errors:\n${errors.slice(0, 10).join('\n')}${errors.length > 10 ? `\n... and ${errors.length - 10} more` : ''}\n\nProceed with ${newRows.length} valid rows?`)
          if (!proceed) return
        }
        
        if (newRows.length === 0) {
          alert('No valid rows found in CSV')
          return
        }
        
        setAddRows([...addRows, ...newRows])
        alert(`Successfully imported ${newRows.length} rows from CSV`)
      } catch (err) {
        console.error('CSV parse error:', err)
        alert('Failed to parse CSV file: ' + err.message)
      }
    }
    reader.readAsText(file)
    event.target.value = ''
  }

  const handleRowChange = (id, field, value) => {
    setAddRows(addRows.map(row => {
      if (row.id === id) {
        if (field === 'category' && value === 'Others') {
          setTransferModalRowId(id)
        }
        // Handle paidToType changes - reset values when switching types
        if (field === 'paidToType') {
          return { 
            ...row, 
            [field]: value,
            paidTo: value === 'employee' ? '' : row.paidTo,
            paidToCustomName: value === 'custom' ? row.paidToCustomName : ''
          }
        }
        // Handle paidTo employee selection
        if (field === 'paidTo') {
          return { 
            ...row, 
            [field]: value,
            paidToType: 'employee'
          }
        }
        // Handle paidToCustomName
        if (field === 'paidToCustomName') {
          return { 
            ...row, 
            [field]: value,
            paidToType: 'custom'
          }
        }
        return { ...row, [field]: value }
      }
      return row
    }))
  }

  const handleEdit = (entry) => {
    setEditingId(entry.id)
    setEditForm(entry)
    setRevokeAdvance(true)
  }

  const handleUpdate = async () => {
    try {
      let type = editForm.type
      if (editForm.category.toLowerCase().includes('advance')) {
        type = 'Advance'
      } else if (editForm.category.toLowerCase().includes('expense')) {
        type = 'Expense'
      } else if (!type) {
        type = 'Expense'
      }
      
      const emp = employees.find(e => e.id === editForm.employeeId) || {}
      const updatedData = {
        ...editForm,
        type: type,
        employeeName: emp.name || editForm.employeeName,
        amount: Number(editForm.amount)
      }
      
      await updateMutation.mutateAsync({ id: editingId, data: updatedData, revokeAdvFlag: revokeAdvance })
      alert('Updated and reset for re-approval')
    } catch (err) {
      alert('Failed to update')
    }
  }

  const handleSubmitAll = async () => {
    // Check for future dates in Expenses
    const todayStr = new Date().toISOString().split('T')[0]
    const isExpenseModule = activeModule === 'Add Expense' || activeModule === 'Expense'
    if (isExpenseModule) {
      if (sessionDate > todayStr || addRows.some(r => r.date && r.date > todayStr)) {
        return alert('Expenses cannot be created for future dates.')
      }
    }

    // Check for required fields
    const rowsWithMissingFields = addRows.filter(r => !r.employeeId || !r.amount || !r.category)
    if (rowsWithMissingFields.length > 0) {
      return alert('Please fill in required fields (Employee, Category, Amount) for all rows.')
    }
    
    // Check for "Paid To" requirement in specific categories
    const categoriesRequiringPaidTo = ['salary to others', 'given to others']
    const rowsMissingPaidTo = addRows.filter(r => {
      const categoryLower = r.category?.toLowerCase().trim() || ''
      const requiresPaidTo = categoriesRequiringPaidTo.some(reqCat => 
        categoryLower.includes(reqCat)
      )
      return requiresPaidTo && (!r.paidTo || r.paidTo === '')
    })
    
    if (rowsMissingPaidTo.length > 0) {
      const empNames = rowsMissingPaidTo.map(r => {
        const emp = employees.find(e => e.id === r.employeeId)
        return emp?.name || 'Unknown'
      }).join(', ')
      return alert(`The following categories require "Paid To" field:\n\n${rowsMissingPaidTo.map(r => `• ${r.category} (Employee: ${employees.find(e => e.id === r.employeeId)?.name || 'Unknown'})`).join('\n')}\n\nPlease select who the money is being paid to.`)
    }
    
    // Check for over-advance cap (Advances only)
    const maxCap = parseFloat(orgSettings.maxAdvanceAmount)
    if (maxCap > 0) {
      const rowsOverCap = addRows.filter(r => {
        const isAdvance = r.category?.toLowerCase().includes('advance') || r.type === 'Advance'
        return isAdvance && parseFloat(r.amount) > maxCap
      })
      if (rowsOverCap.length > 0) {
        const msg = rowsOverCap.map(r => {
          const emp = employees.find(e => e.id === r.employeeId)
          return `• ${emp?.name || 'Unknown'}: ₹${parseFloat(r.amount).toLocaleString('en-IN')} (Max: ₹${maxCap.toLocaleString('en-IN')})`
        }).join('\n')
        if (!confirm(`The following advance requests exceed the maximum limit of ₹${maxCap.toLocaleString('en-IN')}:\n\n${msg}\n\nSubmit anyway?`)) {
          return
        }
      }
    }
    
    // Check for expense category limits
    const expenseLimits = orgSettings.expenseCategoryLimits || {}
    const rowsOverExpenseLimit = addRows.filter(r => {
      const isExpense = r.category?.toLowerCase().includes('expense') || r.type === 'Expense'
      if (!isExpense) return false
      const limit = parseFloat(expenseLimits[r.category])
      return limit > 0 && parseFloat(r.amount) > limit
    })
    if (rowsOverExpenseLimit.length > 0) {
      const msg = rowsOverExpenseLimit.map(r => {
        const emp = employees.find(e => e.id === r.employeeId)
        const limit = parseFloat(expenseLimits[r.category])
        return `• ${emp?.name || 'Unknown'}: ${r.category} ₹${parseFloat(r.amount).toLocaleString('en-IN')} (Max: ₹${limit.toLocaleString('en-IN')})`
      }).join('\n')
      if (!confirm(`The following expense requests exceed category limits:\n\n${msg}\n\nSubmit anyway?`)) {
        return
      }
    }
    
    // All rows are valid
    const validRows = addRows
    
    // Enhanced Duplicate Detection with fuzzy matching
    const duplicates = []
    const AMOUNT_TOLERANCE = 0.05 // 5% tolerance for amount matching
    const DATE_TOLERANCE_DAYS = 2 // Within 2 days for date proximity
    
    validRows.forEach(row => {
      const rowAmount = Number(row.amount)
      const rowDate = new Date(row.date)
      const rowCategory = row.category?.toLowerCase().trim() || ''
      
      const isDuplicate = entries.find(existing => {
        if (existing.employeeId !== row.employeeId) return false
        if (existing.status === 'Rejected') return false
        
        // Exact amount match
        const exactAmountMatch = Number(existing.amount) === rowAmount
        
        // Fuzzy amount match (within tolerance)
        const existingAmount = Number(existing.amount)
        const amountDiff = Math.abs(rowAmount - existingAmount)
        const avgAmount = (rowAmount + existingAmount) / 2
        const fuzzyAmountMatch = avgAmount > 0 && (amountDiff / avgAmount) <= AMOUNT_TOLERANCE
        
        if (!exactAmountMatch && !fuzzyAmountMatch) return false
        
        // Exact date match
        const exactDateMatch = existing.date === row.date
        
        // Proximity date match
        const existingDate = new Date(existing.date)
        const daysDiff = Math.abs((rowDate - existingDate) / (1000 * 60 * 60 * 24))
        const proximityDateMatch = daysDiff <= DATE_TOLERANCE_DAYS
        
        if (!exactDateMatch && !proximityDateMatch) return false
        
        // Category match (exact or fuzzy)
        const existingCategory = existing.category?.toLowerCase().trim() || ''
        const exactCategoryMatch = existingCategory === rowCategory
        const fuzzyCategoryMatch = existingCategory.includes(rowCategory) || rowCategory.includes(existingCategory)
        
        if (!exactCategoryMatch && !fuzzyCategoryMatch) return false
        
        return true
      })
      
      if (isDuplicate) {
        const emp = employees.find(e => e.id === row.employeeId)
        const matchType = []
        if (Number(isDuplicate.amount) === rowAmount) matchType.push('exact amount')
        else matchType.push('similar amount')
        if (isDuplicate.date === row.date) matchType.push('same date')
        else matchType.push('nearby date')
        duplicates.push(`${emp?.name || 'Employee'} - ₹${row.amount} on ${row.date} (${row.category}) [${matchType.join(', ')}]`)
      }
    })

    if (duplicates.length > 0) {
      const confirmMsg = `POTENTIAL DUPLICATES DETECTED:\n\n${duplicates.join('\n')}\n\nThe above transactions already exist in the system. Are you sure you want to submit them again?`
      if (!window.confirm(confirmMsg)) return
    }

    setSubmitting(true)
    try {
      const result = await addMutation.mutateAsync(validRows)
      console.log('Submission result:', result)
      console.log('Valid rows:', validRows)
      
      // After successful submission
      if (result && result.length > 0) {
        const rowType = activeModule === 'Add Advance' ? 'Advance' : 'Expense'
        setSuccessModal({
          open: true,
          title: `${rowType} Submitted`,
          message: `${validRows.length} ${rowType.toLowerCase()}(s) recorded successfully.`
        })
        setTimeout(() => {
          setSuccessModal(prev => ({ ...prev, open: false }))
        }, 3000)

        // Employees submit from My Portal. They should remain on the entry form
        // after the confirmation rather than inheriting admin report or approval-drawer behavior.
        if (portalMode) return

        const moduleSetting = approvalSettings.find(s => {
          const mName = String(s.moduleName || '').toLowerCase()
          const tName = String(rowType || '').toLowerCase()
          return mName === tName || mName.includes(tName) || tName.includes(mName)
        })
        const appType = moduleSetting?.type || 'multi'
        const isNoAppr = appType === 'none'

        if (isNoAppr) {
          // If No Approval is configured in Settings, do NOT open the Approval Drawer!
          setAddRows([{
            id: 'row-1',
            date: new Date().toISOString().slice(0, 10),
            employeeId: user?.uid || '',
            paidToType: 'employee',
            paidTo: '',
            paidToCustomName: '',
            category: activeModule === 'Add Advance' ? 'Salary Advance' : '',
            customCategory: '',
            transferredToName: '',
            requestType: 'Reimbursement',
            payoutMethod: 'Immediate',
            amount: '',
            project: '',
            reason: ''
          }])
          setActiveModule('Reports')
          return
        }

        // If Single or Multi-stage approval is required, open approval drawer
        const justSubmitted = validRows.map((row, idx) => ({
          id: result[idx], // Transaction number
          transactionNo: result[idx],
          employeeName: employees.find(e => e.id === row.employeeId)?.name || 'Unknown',
          employeeId: row.employeeId,
          category: row.category,
          amount: row.amount,
          date: row.date,
          type: rowType,
          hrApproval: 'Pending',
          mdApproval: 'Pending',
          status: 'Pending',
          payoutMethod: row.payoutMethod,
          requestType: row.requestType,
          _isNew: true // Flag to identify just-submitted items
        }))
        
        setSubmittedItems(justSubmitted)
        setApprovalDrawerOpen(true)
      }
    } catch (err) {
      console.error('Submission error:', err)
      alert(`Failed to save: ${err.message}`)
    } finally {
      setSubmitting(false)
    }
  }

  // Approve/Reject/Hold from drawer
  const approveFromDrawer = async (itemId, approvalType, action = 'approve') => {
    try {
      // Find the item in our submitted list
      const item = submittedItems.find(i => i.id === itemId || i.transactionNo === itemId)
      if (!item) {
        alert('Item not found in submitted list')
        return
      }

      // Find the actual document ID from Firestore by transaction number
      const q = query(
        collection(db, 'organisations', user.orgId, 'advances_expenses'),
        where('transactionNo', '==', itemId)
      )
      const snap = await getDocs(q)
      
      if (snap.empty) {
        alert('Document not found')
        return
      }

      const docId = snap.docs[0].id
      const currentData = snap.docs[0].data()
      const docRef = doc(db, 'organisations', user.orgId, 'advances_expenses', docId)

      const moduleSetting = approvalSettings.find(s => s.moduleName === (currentData.type || 'Expense'))
      const isSingleApproval = moduleSetting?.type === 'single'

      let updateData = {
        updatedAt: serverTimestamp()
      }

      // Handle different approval actions
      switch (action) {
        case 'approve':
          if (approvalType === 'hr') {
            updateData.hrApproval = 'Approved'
            updateData.hrApprovedBy = user.uid
            updateData.hrApprovedAt = serverTimestamp()
            if (isSingleApproval || currentData.mdApproval === 'Approved') {
              updateData.status = 'Approved'
              if (isSingleApproval) updateData.mdApproval = 'Approved'
            }
          } else {
            updateData.mdApproval = 'Approved'
            updateData.mdApprovedBy = user.uid
            updateData.mdApprovedAt = serverTimestamp()
            if (isSingleApproval || currentData.hrApproval === 'Approved') {
              updateData.status = 'Approved'
              if (isSingleApproval) updateData.hrApproval = 'Approved'
            }
          }
          break
        case 'reject':
          if (approvalType === 'hr') {
            updateData.hrApproval = 'Rejected'
            updateData.hrRejectedBy = user.uid
            updateData.hrRejectedAt = serverTimestamp()
          } else {
            updateData.mdApproval = 'Rejected'
            updateData.mdRejectedBy = user.uid
            updateData.mdRejectedAt = serverTimestamp()
          }
          updateData.status = 'Rejected'
          break
        case 'hold':
          if (approvalType === 'hr') {
            updateData.hrApproval = 'Hold'
            updateData.hrHoldBy = user.uid
            updateData.hrHoldAt = serverTimestamp()
          } else {
            updateData.mdApproval = 'Hold'
            updateData.mdHoldBy = user.uid
            updateData.mdHoldAt = serverTimestamp()
          }
          updateData.status = 'Hold'
          break
        default:
          return
      }

      await updateDoc(docRef, updateData)

      // Invalidate queries to refresh Approvals tab
      queryClient.invalidateQueries(['advances_expenses', user?.orgId])

      // Update local state
      setSubmittedItems(prev => 
        prev.map(item => 
          (item.id === itemId || item.transactionNo === itemId)
            ? { 
                ...item, 
                [approvalType === 'hr' ? 'hrApproval' : 'mdApproval']: 
                  action === 'approve' ? 'Approved' : 
                  action === 'reject' ? 'Rejected' : 
                  action === 'hold' ? 'Hold' : 'Pending',
                _approved: action === 'approve'
              }
            : item
        )
      )
    } catch (err) {
      console.error('Approval action error:', err)
      alert('Failed to process: ' + err.message)
    }
  }

  // Close drawer and refresh data
  const closeApprovalDrawer = () => {
    setApprovalDrawerOpen(false)
    setSubmittedItems([])
    setSelectedForApproval([])
  }

  // Toggle item selection for bulk approval
  const toggleItemSelection = (transactionNo) => {
    setSelectedForApproval(prev => 
      prev.includes(transactionNo) 
        ? prev.filter(t => t !== transactionNo)
        : [...prev, transactionNo]
    )
  }

  // Select/deselect all items
  const toggleSelectAll = () => {
    if (selectedForApproval.length === submittedItems.length) {
      setSelectedForApproval([])
    } else {
      setSelectedForApproval(submittedItems.map(item => item.transactionNo))
    }
  }

  // Bulk approve selected items
  const bulkApprove = async (approvalType, action = 'approve') => {
    if (selectedForApproval.length === 0) {
      alert('Please select at least one item')
      return
    }
    
    const actionLabels = {
      'approve': 'Approve',
      'reject': 'Reject',
      'hold': 'Hold'
    }
    
    const confirmMsg = `${actionLabels[action]} ${selectedForApproval.length} item${selectedForApproval.length > 1 ? 's' : ''} for ${approvalType.toUpperCase()}?`
    if (!window.confirm(confirmMsg)) return
    
    setBulkProcessing(true)
    const approved = []
    const failed = []
    
    for (const txnNo of selectedForApproval) {
      try {
        await approveFromDrawer(txnNo, approvalType, action)
        approved.push(txnNo)
      } catch (err) {
        failed.push(txnNo)
      }
    }
    
    setBulkProcessing(false)
    setSelectedForApproval([]) // Clear selection after action
    
    if (failed.length > 0) {
      alert(`${approved.length} ${action}ed, ${failed.length} failed`)
    } else {
      alert(`${approved.length} item${approved.length > 1 ? 's' : ''} ${action}ed successfully`)
    }
  }

  const deleteMutation = useMutation({
    mutationFn: async ({ id, keepAdvanceRecord }) => {
      const itemRef = doc(db, 'organisations', user.orgId, 'advances_expenses', id)
      const itemSnap = await getDoc(itemRef)
      const itemData = itemSnap.data()

      if (!itemData) return

      // Copy to deleted_advances_expenses
      await setDoc(doc(db, 'organisations', user.orgId, 'deleted_advances_expenses', id), {
        ...itemData,
        deletedAt: serverTimestamp(),
        deletedBy: user.email || user.name
      })

      // Revoke logic for paid advances AND paid immediate expenses (unless user chose to keep it)
      if (!keepAdvanceRecord && itemData?.paymentStatus === 'Paid' && 
         (itemData?.type === 'Advance' || (itemData?.type === 'Expense' && itemData?.payoutMethod !== 'With Salary'))) {
        const advQ = query(
          collection(db, 'organisations', user.orgId, 'advances'),
          where('linkedRequestId', '==', id)
        )
        const advSnap = await getDocs(advQ)
        for (const d of advSnap.docs) {
          await deleteDoc(doc(db, 'organisations', user.orgId, 'advances', d.id))
        }
      }
      
      await deleteDoc(itemRef)
    },
    onSuccess: () => {
      queryClient.invalidateQueries(['advances_expenses', user?.orgId])
      queryClient.invalidateQueries(['deleted_advances_expenses', user?.orgId])
    }
  })

  const restoreMutation = useMutation({
    mutationFn: async (id) => {
      const itemRef = doc(db, 'organisations', user.orgId, 'deleted_advances_expenses', id)
      const itemSnap = await getDoc(itemRef)
      const itemData = itemSnap.data()

      if (!itemData) return

      // Remove deleted metadata
      const { deletedAt, deletedBy, ...originalData } = itemData

      // Restore to advances_expenses
      await setDoc(doc(db, 'organisations', user.orgId, 'advances_expenses', id), {
        ...originalData,
        updatedAt: serverTimestamp(),
        restoredAt: serverTimestamp(),
        restoredBy: user.email || user.name
      })

      // If it was a paid Advance, re-add to advances collection
      if ((originalData.type === 'Advance' || (originalData.type === 'Expense' && originalData.payoutMethod !== 'With Salary')) && originalData.paymentStatus === 'Paid') {
        const finalAmount = originalData.partialAmount || originalData.amount
        await addDoc(collection(db, 'organisations', user.orgId, 'advances'), {
          employeeId: originalData.employeeId,
          employeeName: originalData.employeeName,
          amount: finalAmount,
          type: 'Advance',
          date: originalData.date || new Date().toISOString().split('T')[0],
          reason: `Auto-restored from deleted request: ${originalData.reason || originalData.category || 'No Reason'}`,
          status: 'Pending',
          linkedRequestId: id,
          createdAt: serverTimestamp(),
          createdBy: user.uid
        })
      }

      await deleteDoc(itemRef)
    },
    onSuccess: () => {
      queryClient.invalidateQueries(['advances_expenses', user?.orgId])
      queryClient.invalidateQueries(['deleted_advances_expenses', user?.orgId])
      setShowDeletedModal(false)
      setActiveModule('Reports')
    }
  })

  const permanentDeleteMutation = useMutation({
    mutationFn: async (id) => {
      const itemRef = doc(db, 'organisations', user.orgId, 'deleted_advances_expenses', id)
      await deleteDoc(itemRef)
    },
    onSuccess: () => {
      queryClient.invalidateQueries(['deleted_advances_expenses', user?.orgId])
    }
  })

  const handlePermanentDelete = async (id) => {
    if (!window.confirm('Are you sure you want to PERMANENTLY DELETE this record? This action cannot be undone.')) return
    try {
      await permanentDeleteMutation.mutateAsync(id)
      alert('Record permanently deleted')
    } catch (err) {
      alert('Failed to delete')
    }
  }

  // Add state for delete confirmation modal
  const [deletingItem, setDeletingItem] = useState(null)

  const confirmDelete = (item) => {
    if (item.paymentStatus === 'Paid' && (item.type === 'Advance' || item.type === 'Expense')) {
      // It's paid and has a mirrored advance, show custom prompt
      setDeletingItem(item)
    } else {
      // Standard delete
      if (window.confirm('Are you sure you want to delete this transaction?')) {
        executeDelete(item.id, false)
      }
    }
  }

  const executeDelete = async (id, keepAdvanceRecord) => {
    try {
      await deleteMutation.mutateAsync({ id, keepAdvanceRecord })
      alert('Transaction moved to "Recently Deleted" (available for 30 days)')
      setDeletingItem(null)
    } catch (err) {
      alert('Failed to delete')
    }
  }

  const handleDelete = (id) => {
    const item = entries.find(e => e.id === id)
    if (item) confirmDelete(item)
  }

  const handleRestore = async (id) => {
    if (!window.confirm('Are you sure you want to revoke this deletion? It will return to reports and re-link with employee data if it was paid.')) return
    try {
      await restoreMutation.mutateAsync(id)
      alert('Transaction restored successfully')
    } catch (err) {
      alert('Failed to restore')
    }
  }

  const advances = entries.filter(e => e.type === 'Advance')
  const expenses = entries.filter(e => e.type === 'Expense')
  const portalExpenses = portalMode
    ? expenses.filter((entry) => entry.employeeId === portalEmployeeId).sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')))
    : []

  const openPortalExpenseEdit = (entry) => {
    setPortalEditForm({
      id: entry.id,
      date: entry.date || '',
      category: entry.category || '',
      amount: String(entry.amount || ''),
      reason: entry.reason || '',
      remarks: entry.remarks || entry.mileageRemarks || '',
      project: entry.project || '',
    })
  }

  const handlePortalExpenseWithdraw = async (entry) => {
    if (!window.confirm(`Withdraw the pending ${entry.category || 'expense'} request for ${formatINR(entry.amount)}?`)) return
    try {
      await portalExpenseWithdrawMutation.mutateAsync(entry)
    } catch (error) {
      alert(error.message || 'Unable to withdraw this expense.')
    }
  }

  const effectiveAmount = (e) => {
    if (e.status === 'Partial' && e.partialAmount != null && e.partialAmount !== '')
      return Number(e.partialAmount)
    return Number(e.amount || 0)
  }

  const summary = useMemo(() => {
    const adv = entries.filter((e) => e.type === 'Advance')
    const exp = entries.filter((e) => e.type === 'Expense')
    const statusKey = (e) => e.status || 'Pending'
    const roll = (list) => {
      const map = {}
      for (const e of list) {
        const k = statusKey(e)
        if (!map[k]) map[k] = { count: 0, sum: 0 }
        map[k].count += 1
        map[k].sum += Number(e.amount || 0)
      }
      return map
    }
    const advSum = adv.reduce((s, e) => s + Number(e.amount || 0), 0)
    const expSum = exp.reduce((s, e) => s + Number(e.amount || 0), 0)
    const awaitingPay = entries.filter(
      (e) =>
        (e.mdApproval === 'Approved' || e.mdApproval === 'Partial') &&
        e.paymentStatus !== 'Paid'
    )
    const paid = entries.filter((e) => e.paymentStatus === 'Paid')
    const eff = (e) => {
      if (e.status === 'Partial' && e.partialAmount != null && e.partialAmount !== '')
        return Number(e.partialAmount)
      return Number(e.amount || 0)
    }

    // PHASE 3: Accrued Salary Reimbursements (Approved but Unpaid 'With Salary' items)
    const accrued = entries.filter(
      (e) => e.payoutMethod === 'With Salary' && e.status === 'Approved' && e.paymentStatus !== 'Paid'
    )
    const accruedSum = accrued.reduce((s, e) => s + eff(e), 0)
    const accruedCount = accrued.length

    return {
      advSum,
      expSum,
      advCount: adv.length,
      expCount: exp.length,
      byStatus: roll(entries),
      awaitingPaymentSum: awaitingPay.reduce((s, e) => s + eff(e), 0),
      awaitingPaymentCount: awaitingPay.length,
      paidSum: paid.reduce((s, e) => s + eff(e), 0),
      paidCount: paid.length,
      accruedSum,
      accruedCount
    }
  }, [entries])

  const escalation = useMemo(() => {
    const needsHr = entries.filter(
      (e) => e.status === 'Pending' && (e.hrApproval === 'Pending' || !e.hrApproval)
    )
    const needsMd = entries.filter(
      (e) =>
        e.status === 'Pending' &&
        e.hrApproval === 'Approved' &&
        (e.mdApproval === 'Pending' || !e.mdApproval)
    )
    const onHold = entries.filter((e) => e.status === 'Hold')
    return { needsHr, needsMd, onHold }
  }, [entries])

  const handleMonthChange = (direction) => {
    const [year, month] = reportMonth.split('-').map(Number)
    const d = new Date(year, month - 1 + direction, 1)
    const newYear = d.getFullYear()
    const newMonth = String(d.getMonth() + 1).padStart(2, '0')
    setReportMonth(`${newYear}-${newMonth}`)
  }

  const applyReportFilters = () => {
    // This is now handled by useEffect auto-apply, but kept for manual refresh
    setReportApplied(true)
  }

  const clearAllFilters = () => {
    const today = new Date().toISOString().split('T')[0]
    const firstDayOfMonth = new Date().toISOString().slice(0, 8) + '01'
    
    setReportFromDate(firstDayOfMonth)
    setReportToDate(today)
    setReportSelectedEmployees([])
    setReportFilterCategory('')
    setReportFilterRemarks('')
    setReportFilterTxn('')
    setReportFilterType('All')
    setReportFilterPayout('All')
    setReportFilterProject('')
    setReportMonth(new Date().toISOString().slice(0, 7))
  }

  const advForReport = useMemo(() => {
    const list = []
    const selectedEmpNamesLower = reportSelectedEmployees
      .map(id => employees.find(emp => emp.id === id)?.name)
      .filter(Boolean)
      .map(n => n.toLowerCase().trim())
    
    filteredEntries.forEach(e => {
      if (e.type === 'Advance') {
        if (reportSelectedEmployees.length > 0) {
          const empNameLower = (e.employeeName || '').toLowerCase().trim()
          const paidToNameLower = (e.paidToName || e.paidToCustomName || '').toLowerCase().trim()
          const matches = reportSelectedEmployees.includes(e.employeeId) ||
            (e.paidTo && reportSelectedEmployees.includes(e.paidTo)) ||
            (e.paidToId && reportSelectedEmployees.includes(e.paidToId)) ||
            (empNameLower && selectedEmpNamesLower.includes(empNameLower)) ||
            (paidToNameLower && selectedEmpNamesLower.includes(paidToNameLower))
          if (matches) list.push(e)
        } else {
          list.push(e)
        }
      } else if (e.type === 'Expense') {
        const recipientName = e.paidToName || e.paidToCustomName
        const isGivenToOthers = (e.category && e.category.toLowerCase().includes('given to others')) || (recipientName && recipientName !== e.employeeName)
        
        if (isGivenToOthers && recipientName) {
          const recipientNameLower = recipientName.toLowerCase().trim()
          const recipientId = e.paidTo || e.paidToId
          
          const matchesRecipient = reportSelectedEmployees.length === 0 ||
            (recipientId && reportSelectedEmployees.includes(recipientId)) ||
            (selectedEmpNamesLower.includes(recipientNameLower))

          if (matchesRecipient) {
            list.push({
              ...e,
              id: `${e.id}_adv_recipient`,
              employeeId: recipientId || e.employeeId,
              employeeName: recipientName,
              category: e.category || 'Given to others',
              givenByEmployeeName: e.employeeName,
              type: 'Advance',
              isTransferredAdvance: true
            })
          }
        }
      }
    })
    
    return list
  }, [filteredEntries, reportSelectedEmployees, employees])

  const expForReport = useMemo(() => {
    const selectedEmpNamesLower = reportSelectedEmployees
      .map(id => employees.find(emp => emp.id === id)?.name)
      .filter(Boolean)
      .map(n => n.toLowerCase().trim())

    return filteredEntries.filter(e => {
      if (e.type !== 'Expense') return false
      
      if (reportSelectedEmployees.length > 0) {
        const empNameLower = (e.employeeName || '').toLowerCase().trim()
        const isGiver = reportSelectedEmployees.includes(e.employeeId) || selectedEmpNamesLower.includes(empNameLower)
        return isGiver
      }
      
      return true
    })
  }, [filteredEntries, reportSelectedEmployees, employees])

  const handleScreenshot = async () => {
    try {
      if (!reportsContainerRef.current) {
        alert('No content to capture')
        return
      }
      
      // Show loading indicator
      const button = document.querySelector('button[title="Take Screenshot"]')
      if (button) {
        button.innerHTML = '<span class="animate-spin">⟳</span> Capturing...'
        button.disabled = true
      }
      
      // Capture the reports container
      const canvas = await html2canvas(reportsContainerRef.current, {
        backgroundColor: '#ffffff',
        scale: 2,
        useCORS: true,
        allowTaint: true,
        logging: false,
        foreignObjectRendering: false,
        removeContainer: false
      })
      
      // Check if canvas was created
      if (!canvas) {
        throw new Error('Canvas creation failed')
      }
      
      // Convert to PNG and download
      const dataUrl = canvas.toDataURL('image/png')
      if (!dataUrl || dataUrl === 'data:,') {
        throw new Error('Canvas toDataURL failed')
      }
      
      const link = document.createElement('a')
      const timestamp = new Date().toISOString().slice(0, 10)
      link.download = `Adv_Exp_Reports_${timestamp}.png`
      link.href = dataUrl
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      
      // Reset button
      if (button) {
        button.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-camera"><path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z"/><circle cx="12" cy="13" r="3"/></svg> Screenshot'
        button.disabled = false
      }
    } catch (err) {
      console.error('Screenshot Error:', err)
      console.error('Error details:', err.message)
      console.error('Error stack:', err.stack)
      alert(`Failed to capture screenshot: ${err.message || 'Unknown error'}. Please check console for details.`)
      
      // Reset button on error
      const button = document.querySelector('button[title="Take Screenshot"]')
      if (button) {
        button.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-camera"><path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z"/><circle cx="12" cy="13" r="3"/></svg> Screenshot'
        button.disabled = false
      }
    }
  }

  const exportLedgerPDF = () => {
    if (!allLedgerEntries.length) {
      alert('No ledger records match the current filters.')
      return
    }

    const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
    const pageWidth = pdf.internal.pageSize.getWidth()
    const pageHeight = pdf.internal.pageSize.getHeight()
    const margin = 4
    const contentWidth = pageWidth - margin * 2
    const organisationName = orgSettings?.displayName || orgSettings?.name || user?.orgName || 'HRFlow'
    const selectedEmployee = sortedEmployees.find((employee) => employee.id === ledgerEmployeeId)
    const filterText = [
      selectedEmployee ? `Employee: ${selectedEmployee.name || selectedEmployee.empCode}` : 'Employee: All',
      ledgerFromDate ? `From: ${formatLedgerDate(ledgerFromDate)}` : null,
      ledgerToDate ? `To: ${formatLedgerDate(ledgerToDate)}` : null,
      ledgerCategory ? `Category: ${ledgerCategory}` : null,
    ].filter(Boolean).join('  |  ')
    const currency = (value) => `₹${new Intl.NumberFormat('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(value) || 0)}`

    pdf.setFont('helvetica', 'bold')
    pdf.setFontSize(14)
    pdf.setTextColor(15, 23, 42)
    pdf.text(organisationName, margin, 10)
    pdf.setFontSize(9)
    pdf.setTextColor(71, 85, 105)
    pdf.text('LEDGER REPORT', margin, 15)
    pdf.setFont('helvetica', 'normal')
    pdf.setFontSize(7.5)
    pdf.setTextColor(100, 116, 139)
    pdf.text(`Generated: ${format(new Date(), 'dd-MMM-yyyy')}`, pageWidth - margin, 10, { align: 'right' })
    pdf.text(filterText, margin, 20)

    const cardGap = 2
    const cardWidth = (contentWidth - cardGap * 2) / 3
    const cards = [
      { label: 'ADVANCE TOTAL', value: currency(ledgerTotals.advanceTotal), fill: [236, 253, 245], text: [6, 95, 70] },
      { label: 'EXPENSE TOTAL', value: currency(ledgerTotals.expenseTotal), fill: [254, 242, 242], text: [159, 18, 57] },
      { label: 'FINAL BALANCE', value: currency(ledgerTotals.finalBalance), fill: [239, 246, 255], text: [30, 64, 175] },
    ]
    cards.forEach((card, index) => {
      const x = margin + index * (cardWidth + cardGap)
      pdf.setFillColor(...card.fill)
      pdf.setDrawColor(226, 232, 240)
      pdf.roundedRect(x, 24, cardWidth, 14, 1, 1, 'FD')
      pdf.setFont('helvetica', 'bold')
      pdf.setFontSize(6.5)
      pdf.setTextColor(100, 116, 139)
      pdf.text(card.label, x + 2, 29)
      pdf.setFontSize(8.5)
      pdf.setTextColor(...card.text)
      pdf.text(card.value, x + 2, 35)
    })

    autoTable(pdf, {
      startY: 43,
      margin: { left: margin, right: margin, bottom: 9 },
      head: [['Date', 'Employee', 'Type', 'Category', 'Transaction', 'Amount', 'Paid', 'Balance', 'Status']],
      body: allLedgerEntries.map((entry) => [
        formatLedgerDate(entry.date),
        entry.employeeName,
        entry.type,
        entry.category || '—',
        entry.transactionNo || '—',
        currency(entry.amount),
        currency(entry.paidAmount),
        currency(entry.balance),
        entry.status || 'Pending',
      ]),
      theme: 'grid',
      styles: { font: 'helvetica', fontSize: 5.8, cellPadding: 1.15, valign: 'middle', lineColor: [226, 232, 240], lineWidth: 0.1, textColor: [51, 65, 85] },
      headStyles: { fillColor: [30, 41, 59], textColor: [255, 255, 255], fontSize: 6, fontStyle: 'bold' },
      alternateRowStyles: { fillColor: [248, 250, 252] },
      columnStyles: { 0: { cellWidth: 16 }, 1: { cellWidth: 26 }, 2: { cellWidth: 14 }, 3: { cellWidth: 25 }, 4: { cellWidth: 26 }, 5: { cellWidth: 18, halign: 'right' }, 6: { cellWidth: 16, halign: 'right' }, 7: { cellWidth: 18, halign: 'right' }, 8: { cellWidth: 15, halign: 'center' } },
    })

    const pages = pdf.internal.getNumberOfPages()
    for (let page = 1; page <= pages; page += 1) {
      pdf.setPage(page)
      pdf.setFont('helvetica', 'normal')
      pdf.setFontSize(6.5)
      pdf.setTextColor(148, 163, 184)
      pdf.text(`${organisationName} | Ledger`, margin, pageHeight - 4)
      pdf.text(`Page ${page} of ${pages}`, pageWidth - margin, pageHeight - 4, { align: 'right' })
    }
    pdf.save(`Ledger_${new Date().toISOString().slice(0, 10)}.pdf`)
  }

  const exportPDF = async () => {
    try {
      if (!filteredEntries || filteredEntries.length === 0) {
        alert('No data to export. Please apply filters first.')
        return
      }

      // Helper function to fetch base64 logo
      const getBase64FromUrl = async (url) => {
        try {
          const response = await fetch(url)
          const blob = await response.blob()
          return new Promise((resolve) => {
            const reader = new FileReader()
            reader.onloadend = () => resolve(reader.result)
            reader.onerror = () => resolve(null)
            reader.readAsDataURL(blob)
          })
        } catch {
          return null
        }
      }

      // Initialize Portrait A4 Document
      const doc = new jsPDF({
        orientation: 'portrait',
        unit: 'mm',
        format: 'a4'
      })

      const pageWidth = doc.internal.pageSize.width || 210
      const pageHeight = doc.internal.pageSize.height || 297
      const margin = 14
      const contentWidth = pageWidth - margin * 2 // 182mm

      // Fetch org logo if available
      let logoData = null
      if (orgSettings?.logoURL) {
        logoData = await getBase64FromUrl(orgSettings.logoURL)
      }

      let startY = 14

      // Header Section with Logo and Enterprise Title
      const orgTitleName = orgSettings?.displayName || orgSettings?.name || user?.orgName || 'HRFlow Enterprise'
      
      if (logoData) {
        try {
          doc.addImage(logoData, 'PNG', margin, startY, 20, 12)
          doc.setFontSize(14)
          doc.setFont('helvetica', 'bold')
          doc.setTextColor(15, 23, 42) // Slate 900
          doc.text(orgTitleName, margin + 24, startY + 5)
          
          doc.setFontSize(9)
          doc.setFont('helvetica', 'bold')
          doc.setTextColor(100, 116, 139) // Slate 500
          doc.text('ADVANCES & EXPENSES FINANCIAL REPORT', margin + 24, startY + 10)
        } catch {
          doc.setFontSize(15)
          doc.setFont('helvetica', 'bold')
          doc.setTextColor(15, 23, 42)
          doc.text(orgTitleName, margin, startY + 5)
          
          doc.setFontSize(9)
          doc.setFont('helvetica', 'bold')
          doc.setTextColor(100, 116, 139)
          doc.text('ADVANCES & EXPENSES FINANCIAL REPORT', margin, startY + 10)
        }
      } else {
        doc.setFontSize(15)
        doc.setFont('helvetica', 'bold')
        doc.setTextColor(15, 23, 42)
        doc.text(orgTitleName, margin, startY + 5)
        
        doc.setFontSize(9)
        doc.setFont('helvetica', 'bold')
        doc.setTextColor(100, 116, 139)
        doc.text('ADVANCES & EXPENSES FINANCIAL REPORT', margin, startY + 10)
      }

      // Generated timestamp on top-right
      const nowStr = new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
      doc.setFontSize(8)
      doc.setFont('helvetica', 'normal')
      doc.setTextColor(100, 116, 139)
      doc.text(`Generated: ${nowStr}`, pageWidth - margin, startY + 5, { align: 'right' })

      startY += 16

      // Divider Line
      doc.setDrawColor(226, 232, 240)
      doc.setLineWidth(0.4)
      doc.line(margin, startY, pageWidth - margin, startY)

      startY += 5

      // Report Period Subtitle & Filters Summary
      let periodStr = 'Period: All Time'
      if (reportFromDate && reportToDate) {
        const from = new Date(reportFromDate).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
        const to = new Date(reportToDate).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
        periodStr = `Period: ${from} — ${to}`
      } else if (reportFromDate) {
        const from = new Date(reportFromDate).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
        periodStr = `Period: From ${from}`
      } else if (reportToDate) {
        const to = new Date(reportToDate).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
        periodStr = `Period: To ${to}`
      }

      const activeFilters = []
      if (reportSelectedEmployees.length > 0) activeFilters.push(`${reportSelectedEmployees.length} Employee(s)`)
      if (reportFilterCategory) activeFilters.push(`Category: ${reportFilterCategory}`)
      if (reportFilterRemarks) activeFilters.push(`Remarks: "${reportFilterRemarks}"`)
      if (reportFilterType !== 'All') activeFilters.push(`Type: ${reportFilterType}`)
      if (reportFilterPayout !== 'All') activeFilters.push(`Payout: ${reportFilterPayout}`)

      doc.setFontSize(8.5)
      doc.setFont('helvetica', 'bold')
      doc.setTextColor(30, 41, 59)
      doc.text(periodStr, margin, startY)

      if (activeFilters.length > 0) {
        doc.setFont('helvetica', 'normal')
        doc.setTextColor(100, 116, 139)
        doc.text(`Active Filters: ${activeFilters.join(' | ')}`, margin, startY + 4)
        startY += 8
      } else {
        startY += 5
      }

      // KPI Summary Cards
      const dataToUseAdv = advForReport || []
      const dataToUseExp = expForReport || []

      const totalAdvSum = dataToUseAdv.reduce((sum, a) => sum + (parseFloat(a.amount) || 0), 0)
      const totalExpSum = dataToUseExp.reduce((sum, e) => sum + (parseFloat(e.amount) || 0), 0)
      const cashInHand = totalAdvSum - totalExpSum

      const formatCurrency = (num) => '₹' + new Intl.NumberFormat('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(num)

      const cardW = (contentWidth - 8) / 3 // ~58mm each
      const cardH = 11

      // Advance KPI
      doc.setFillColor(254, 243, 199) // amber-100
      doc.setDrawColor(251, 191, 36) // amber-400
      doc.roundedRect(margin, startY, cardW, cardH, 1, 1, 'FD')
      doc.setFontSize(7)
      doc.setFont('helvetica', 'bold')
      doc.setTextColor(120, 53, 15)
      doc.text('TOTAL ADVANCES', margin + 3, startY + 3.8)
      doc.setFontSize(9)
      doc.setFont('helvetica', 'bold')
      doc.setTextColor(5, 150, 105) // emerald-600
      doc.text(formatCurrency(totalAdvSum), margin + 3, startY + 8.8)

      // Expense KPI (Neutral Slate Grey card)
      doc.setFillColor(241, 245, 249) // slate-100
      doc.setDrawColor(203, 213, 225) // slate-300
      doc.roundedRect(margin + cardW + 4, startY, cardW, cardH, 1, 1, 'FD')
      doc.setFontSize(7)
      doc.setFont('helvetica', 'bold')
      doc.setTextColor(51, 65, 85) // slate-700
      doc.text('TOTAL EXPENSES', margin + cardW + 7, startY + 3.8)
      doc.setFontSize(9)
      doc.setFont('helvetica', 'bold')
      doc.setTextColor(225, 29, 72) // rose-600
      doc.text(formatCurrency(totalExpSum), margin + cardW + 7, startY + 8.8)

      // Cash in hand KPI
      doc.setFillColor(236, 253, 245) // emerald-50
      doc.setDrawColor(110, 231, 183) // emerald-300
      doc.roundedRect(margin + (cardW + 4) * 2, startY, cardW, cardH, 1, 1, 'FD')
      doc.setFontSize(7)
      doc.setFont('helvetica', 'bold')
      doc.setTextColor(6, 78, 59)
      doc.text('CASH IN HAND', margin + (cardW + 4) * 2 + 3, startY + 3.8)
      doc.setFontSize(9)
      doc.setFont('helvetica', 'bold')
      doc.setTextColor(217, 119, 6) // amber-600
      doc.text(formatCurrency(cashInHand), margin + (cardW + 4) * 2 + 3, startY + 8.8)

      startY += cardH + 6

      // Date formatter
      const formatDateSafe = (dateStr) => {
        try {
          if (!dateStr) return '—'
          const date = new Date(dateStr)
          if (isNaN(date.getTime())) return '—'
          return date.toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: '2-digit' })
        } catch {
          return '—'
        }
      }

      // Advances Table
      if (dataToUseAdv.length > 0) {
        doc.setFontSize(9.5)
        doc.setFont('helvetica', 'bold')
        doc.setTextColor(30, 41, 59)
        doc.text(`Advances (${dataToUseAdv.length} records)`, margin, startY)
        startY += 3

        const advBody = dataToUseAdv.map(a => {
          let categoryDisplay = a.category || a.type || '—'
          if (a.givenByEmployeeName) {
            categoryDisplay += `\n(Given by ${a.givenByEmployeeName})`
          }
          return [
            formatDateSafe(a.date),
            a.employeeName || '—',
            categoryDisplay,
            (a.remarks || a.reason || '—').toString(),
            formatCurrency(parseFloat(a.amount) || 0),
            a.status || 'Approved'
          ]
        })

        autoTable(doc, {
          startY: startY,
          margin: { left: margin, right: margin },
          head: [['Date', 'Name', 'Category Type', 'Remarks', 'Amount', 'Status']],
          body: advBody,
          theme: 'grid',
          styles: { 
            font: 'helvetica',
            fontSize: 7.5, 
            cellPadding: 2,
            textColor: [51, 65, 85],
            valign: 'middle',
            lineWidth: 0.15,
            borderColor: [226, 232, 240]
          },
          headStyles: { 
            fillColor: [51, 65, 85], // Charcoal Slate Grey
            textColor: [255, 255, 255], 
            fontSize: 8,
            fontStyle: 'bold',
            halign: 'left'
          },
          alternateRowStyles: {
            fillColor: [248, 250, 252]
          },
          columnStyles: {
            0: { cellWidth: 18 },
            1: { cellWidth: 42 }, // Equal width
            2: { cellWidth: 42 }, // Equal width
            3: { cellWidth: 42 }, // Equal width
            4: { cellWidth: 22, halign: 'right', fontStyle: 'bold' },
            5: { cellWidth: 16, halign: 'center', overflow: 'linebreak' }
          }
        })

        startY = (doc.lastAutoTable?.finalY || startY) + 8
      }

      // Expenses Table
      if (dataToUseExp.length > 0) {
        if (startY > pageHeight - 40) {
          doc.addPage()
          startY = 14
        }

        doc.setFontSize(9.5)
        doc.setFont('helvetica', 'bold')
        doc.setTextColor(30, 41, 59)
        doc.text(`Expenses (${dataToUseExp.length} records)`, margin, startY)
        startY += 3

        const expBody = dataToUseExp.map(e => {
          let categoryDisplay = e.category || e.type || '—'
          const recipientName = e.paidToName || e.paidToCustomName
          const isGivenToOthers = (e.category && e.category.toLowerCase().includes('given to others')) || (recipientName && recipientName !== e.employeeName)
          if (isGivenToOthers && recipientName) {
            categoryDisplay += `\n(${e.employeeName} -> ${recipientName})`
          }

          return [
            formatDateSafe(e.date),
            e.employeeName || '—',
            categoryDisplay,
            (e.remarks || e.reason || '—').toString(),
            formatCurrency(parseFloat(e.amount) || 0),
            e.status || 'Approved'
          ]
        })

        autoTable(doc, {
          startY: startY,
          margin: { left: margin, right: margin },
          head: [['Date', 'Name', 'Category Type', 'Remarks', 'Amount', 'Status']],
          body: expBody,
          theme: 'grid',
          styles: { 
            font: 'helvetica',
            fontSize: 7.5, 
            cellPadding: 2,
            textColor: [51, 65, 85],
            valign: 'middle',
            lineWidth: 0.15,
            borderColor: [226, 232, 240]
          },
          headStyles: { 
            fillColor: [71, 85, 105], // Medium Slate Grey
            textColor: [255, 255, 255], 
            fontSize: 8,
            fontStyle: 'bold',
            halign: 'left'
          },
          alternateRowStyles: {
            fillColor: [248, 250, 252]
          },
          columnStyles: {
            0: { cellWidth: 18 },
            1: { cellWidth: 42 }, // Equal width
            2: { cellWidth: 42 }, // Equal width
            3: { cellWidth: 42 }, // Equal width
            4: { cellWidth: 22, halign: 'right', fontStyle: 'bold' },
            5: { cellWidth: 16, halign: 'center', overflow: 'linebreak' }
          }
        })
      }

      // Page numbers & Footer on every page
      const totalPages = doc.internal.getNumberOfPages()
      for (let i = 1; i <= totalPages; i++) {
        doc.setPage(i)
        doc.setFontSize(7.5)
        doc.setFont('helvetica', 'normal')
        doc.setTextColor(148, 163, 184)
        doc.text(`Page ${i} of ${totalPages}`, pageWidth - margin, pageHeight - 6, { align: 'right' })
        doc.text(`${orgTitleName} | Confidential Financial Report`, margin, pageHeight - 6)
      }

      // Filename generation
      let filenameDate = reportMonth
      try {
        if (reportFromDate || reportToDate) {
          const from = reportFromDate ? reportFromDate.replace(/-/g, '') : 'start'
          const to = reportToDate ? reportToDate.replace(/-/g, '') : 'end'
          filenameDate = `${from}_to_${to}`
        }
      } catch {
        filenameDate = new Date().toISOString().slice(0, 10)
      }

      doc.save(`Adv_Exp_Report_${filenameDate}.pdf`)
    } catch (err) {
      console.error('PDF Export Error:', err)
      alert(`Failed to generate PDF: ${err.message}`)
    }
  }

  const exportCSV = () => {
    try {
      if (!filteredEntries || filteredEntries.length === 0) {
        alert('No data to export. Please apply filters first.')
        return
      }

      const escapeCSV = (val) => {
        if (val === null || val === undefined) return ''
        const str = String(val)
        if (str.includes(',') || str.includes('"') || str.includes('\n')) {
          return '"' + str.replace(/"/g, '""') + '"'
        }
        return str
      }

      const formatAmount = (amount) => {
        try {
          const num = parseFloat(amount)
          if (isNaN(num)) return '0.00'
          return new Intl.NumberFormat('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(num)
        } catch { return '0.00' }
      }

      const formatDate = (dateStr) => {
        try {
          if (!dateStr) return ''
          const date = new Date(dateStr)
          if (isNaN(date.getTime())) return ''
          return date.toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' })
        } catch { return '' }
      }

      const dataToUseAdv = advForReport || []
      const dataToUseExp = expForReport || []

      const rows = []
      rows.push(['Type', 'Date', 'Name', 'Category', 'Request Type', 'Payout Method', 'Remarks', 'Amount', 'Paid To', 'Project', 'Status', 'HR Approval', 'MD Approval', 'Payment Status', 'Transaction No'])

      dataToUseAdv.forEach(a => {
        rows.push([
          'Advance',
          formatDate(a.date),
          a.employeeName || '',
          a.category || '',
          a.requestType || '',
          a.payoutMethod || '',
          a.remarks || a.reason || '',
          formatAmount(a.amount),
          a.paidToName || a.paidToCustomName || '',
          a.project || '',
          a.status || '',
          a.hrApproval || '',
          a.mdApproval || '',
          a.paymentStatus || '',
          a.transactionNo || ''
        ])
      })

      dataToUseExp.forEach(e => {
        rows.push([
          'Expense',
          formatDate(e.date),
          e.employeeName || '',
          e.category || '',
          e.requestType || '',
          e.payoutMethod || '',
          e.remarks || e.reason || '',
          formatAmount(e.amount),
          e.paidToName || e.paidToCustomName || '',
          e.project || '',
          e.status || '',
          e.hrApproval || '',
          e.mdApproval || '',
          e.paymentStatus || '',
          e.transactionNo || ''
        ])
      })

      const csvContent = rows.map(row => row.map(escapeCSV).join(',')).join('\n')
      const blob = new Blob(['\ufeff' + csvContent], { type: 'text/csv;charset=utf-8;' })
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')

      let filenameDate = reportMonth
      if (reportFromDate || reportToDate) {
        const from = reportFromDate ? reportFromDate.replace(/-/g, '') : 'start'
        const to = reportToDate ? reportToDate.replace(/-/g, '') : 'end'
        filenameDate = `${from}_to_${to}`
      }

      link.href = url
      link.download = `Adv_Exp_Report_${filenameDate}.csv`
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      URL.revokeObjectURL(url)
    } catch (err) {
      console.error('CSV Export Error:', err)
      alert(`Failed to generate CSV. Error: ${err.message || 'Unknown error'}. Please check console for details.`)
    }
  }

  return (
    <div className="space-y-6">
      <style>{`
        .no-arrow::-webkit-calendar-picker-indicator { display: none !important; }
      `}</style>
      
      <datalist id="categories-list">
        {categories.map(c => <option key={c} value={c} />)}
      </datalist>

      {/* Transferred To Micro-Modal */}
      {transferModalRowId && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/20 backdrop-blur-[1px]" onClick={() => setTransferModalRowId(null)}>
          <div 
            className="bg-white rounded-xl shadow-2xl w-full max-w-xs p-4 border border-zinc-200 animate-in fade-in zoom-in duration-200" 
            onClick={e => e.stopPropagation()}
          >
            <div className="flex justify-between items-center mb-3">
              <h3 className="text-[10px] font-black uppercase tracking-widest text-zinc-400">Transfer To?</h3>
              <button onClick={() => setTransferModalRowId(null)} className="text-zinc-300 hover:text-zinc-500"><X size={14}/></button>
            </div>
            <div className="max-h-60 overflow-y-auto space-y-1 pr-1">
              {sortedEmployees.map(emp => (
                <button
                  key={emp.id}
                  onClick={() => {
                    handleRowChange(transferModalRowId, 'transferredToName', emp.name)
                    setTransferModalRowId(null)
                  }}
                  className="w-full text-left px-3 py-2 rounded-lg text-[12px] font-bold text-zinc-700 hover:bg-indigo-50 hover:text-indigo-600 transition-colors border border-transparent hover:border-indigo-100"
                >
                  {emp.name}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Submit Bill Modal */}
      {finalizingId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-8 mx-4 border border-gray-100">
            <div className="flex justify-between items-center mb-6">
              <div>
                <h2 className="text-xl font-bold text-gray-800">Submit Final Bill</h2>
                <p className="text-xs text-gray-400 mt-1">Confirm the final amount spent</p>
              </div>
              <button onClick={() => setFinalizingId(null)} className="text-gray-400 hover:text-gray-600"><X size={20}/></button>
            </div>
            
            <div className="space-y-4 mb-6">
              <div className="space-y-1">
                <label className="text-[10px] font-black uppercase tracking-widest text-gray-400">Actual Bill Amount (₹)</label>
                <input 
                  type="number" 
                  autoFocus
                  value={finalizeAmount} 
                  onChange={e => setFinalizeAmount(e.target.value)} 
                  className="w-full h-12 border border-gray-200 rounded-xl px-4 text-lg font-bold bg-gray-50 focus:ring-2 focus:ring-primary-500 outline-none" 
                  placeholder="0.00"
                />
              </div>
              <div className="bg-amber-50 border border-amber-100 p-3 rounded-lg flex gap-3">
                <AlertTriangle size={18} className="text-amber-600 shrink-0" />
                <p className="text-[11px] font-medium text-amber-800 leading-relaxed">
                  Submitting this bill will convert the request to a Reimbursement and notify the accountant for payment.
                </p>
              </div>
            </div>

            <div className="flex gap-3">
              <button onClick={() => setFinalizingId(null)} className="flex-1 h-11 bg-gray-100 text-gray-600 font-bold rounded-xl text-[10px] uppercase tracking-widest hover:bg-gray-200">Cancel</button>
              <button 
                onClick={() => finalizeMutation.mutate({ id: finalizingId, finalAmount: finalizeAmount })} 
                disabled={finalizeMutation.isPending || !finalizeAmount || Number(finalizeAmount) <= 0} 
                className="flex-1 h-11 bg-emerald-600 text-white font-bold rounded-xl text-[10px] uppercase tracking-widest hover:bg-emerald-700 shadow-lg shadow-emerald-200 disabled:opacity-50"
              >
                {finalizeMutation.isPending ? 'Processing...' : 'Submit & Finalize'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal for Paid Items */}
      {deletingItem && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-8 mx-4 border border-rose-100">
            <div className="flex items-center gap-3 text-rose-600 mb-6">
              <AlertTriangle size={24} />
              <h2 className="text-xl font-bold">Delete Paid Transaction?</h2>
            </div>
            
            <p className="text-sm text-gray-600 mb-6 leading-relaxed">
              This <span className="font-bold text-gray-800">{deletingItem.type}</span> has already been paid (₹{deletingItem.amount}). 
              How would you like to proceed with the linked salary advance?
            </p>

            <div className="space-y-3">
              <button 
                onClick={() => executeDelete(deletingItem.id, false)}
                className="w-full py-3 bg-rose-600 text-white font-bold rounded-xl text-[10px] uppercase tracking-widest hover:bg-rose-700 shadow-lg shadow-rose-200 transition-all"
              >
                Delete Both (Expense & Advance)
              </button>
              
              <button 
                onClick={() => executeDelete(deletingItem.id, true)}
                className="w-full py-3 bg-amber-50 text-amber-700 font-bold rounded-xl text-[10px] uppercase tracking-widest border border-amber-200 hover:bg-amber-100 transition-all"
              >
                Delete Expense Only (Keep Advance Debt)
              </button>

              <button 
                onClick={() => setDeletingItem(null)}
                className="w-full py-3 bg-gray-100 text-gray-500 font-bold rounded-xl text-[10px] uppercase tracking-widest hover:bg-gray-200 transition-all"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Modal */}
      {editingId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl p-8 mx-4 border border-gray-100">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-xl font-bold text-gray-800">Edit Transaction</h2>
              <button onClick={() => setEditingId(null)} className="text-gray-400 hover:text-gray-600"><X size={20}/></button>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
              <div className="space-y-1">
                <label className="text-[10px] font-black uppercase tracking-widest text-gray-400">Date</label>
                <input type="date" value={editForm.date} onChange={e => setEditForm(f => ({ ...f, date: e.target.value }))} className="w-full h-11 border border-gray-200 rounded-xl px-4 text-sm font-bold bg-gray-50 focus:ring-2 focus:ring-primary-500 outline-none" />
              </div>
              <div className="space-y-1">
                <label className="text-[10px] font-black uppercase tracking-widest text-gray-400">Employee</label>
                <select value={editForm.employeeId} onChange={e => setEditForm(f => ({ ...f, employeeId: e.target.value }))} className="w-full h-11 border border-gray-200 rounded-xl px-4 text-sm font-bold bg-gray-50 focus:ring-2 focus:ring-primary-500 outline-none">
                  {sortedEmployees.map(e => (
                    <option key={e.id} value={e.id}>
                      {e.name} {!isEmployeeActiveStatus(e.status) ? '(Inactive)' : ''}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-1">
                <label className="text-[10px] font-black uppercase tracking-widest text-gray-400">Category</label>
                <input list="categories-list" value={editForm.category} onChange={e => setEditForm(f => ({ ...f, category: e.target.value }))} className="w-full h-11 border border-gray-200 rounded-xl px-4 text-sm font-bold bg-gray-50 focus:ring-2 focus:ring-primary-500 outline-none" />
              </div>
              <div className="space-y-1">
                <label className="text-[10px] font-black uppercase tracking-widest text-gray-400">Amount</label>
                <input type="number" value={editForm.amount} onChange={e => setEditForm(f => ({ ...f, amount: e.target.value }))} className="w-full h-11 border border-gray-200 rounded-xl px-4 text-sm font-bold bg-gray-50 focus:ring-2 focus:ring-primary-500 outline-none" />
              </div>
              <div className="space-y-1">
                <label className="text-[10px] font-black uppercase tracking-widest text-gray-400">Type</label>
                <select value={editForm.requestType} onChange={e => setEditForm(f => ({ ...f, requestType: e.target.value }))} className="w-full h-11 border border-gray-200 rounded-xl px-4 text-sm font-bold bg-gray-50 focus:ring-2 focus:ring-primary-500 outline-none">
                  <option value="Reimbursement">Reimbursement</option>
                  <option value="Pre-Approval">Pre-Approval</option>
                </select>
              </div>
              <div className="space-y-1">
                <label className="text-[10px] font-black uppercase tracking-widest text-gray-400">Payout</label>
                <select value={editForm.payoutMethod} onChange={e => setEditForm(f => ({ ...f, payoutMethod: e.target.value }))} className="w-full h-11 border border-gray-200 rounded-xl px-4 text-sm font-bold bg-gray-50 focus:ring-2 focus:ring-primary-500 outline-none">
                  <option value="Immediate">Immediate</option>
                  <option value="With Salary">With Salary</option>
                </select>
              </div>
              <div className="space-y-1 md:col-span-2">
                <label className="text-[10px] font-black uppercase tracking-widest text-gray-400">Remarks</label>
                <input type="text" value={editForm.reason} onChange={e => setEditForm(f => ({ ...f, reason: e.target.value }))} className="w-full h-11 border border-gray-200 rounded-xl px-4 text-sm font-bold bg-gray-50 focus:ring-2 focus:ring-primary-500 outline-none" />
              </div>
            </div>

            <div className="flex gap-3">
              <button onClick={() => setEditingId(null)} className="flex-1 h-11 bg-gray-100 text-gray-600 font-bold rounded-xl text-[10px] uppercase tracking-widest hover:bg-gray-200">Cancel</button>
              <button onClick={handleUpdate} disabled={updateMutation.isPending} className="flex-1 h-11 bg-primary-600 text-white font-bold rounded-xl text-[10px] uppercase tracking-widest hover:bg-primary-700 shadow-lg shadow-primary-200">
                {updateMutation.isPending ? 'Updating...' : 'Save & Revoke Approval'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Recently Deleted Modal */}
      {showDeletedModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl p-8 mx-4 border border-gray-100 max-h-[90vh] overflow-hidden flex flex-col">
            <div className="flex justify-between items-center mb-6">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-rose-50 rounded-lg text-rose-600">
                  <History size={20}/>
                </div>
                <div>
                  <h2 className="text-xl font-bold text-gray-800">Recently Deleted</h2>
                  <p className="text-xs font-medium text-gray-400">Records available for 30 days since deletion</p>
                </div>
              </div>
              <button onClick={() => setShowDeletedModal(false)} className="text-gray-400 hover:text-gray-600"><X size={20}/></button>
            </div>

            <div className="flex-1 overflow-auto border border-zinc-100 rounded-xl">
              {loadingDeleted ? (
                <div className="py-20 flex justify-center"><Spinner /></div>
              ) : deletedEntries.length === 0 ? (
                <div className="py-20 text-center space-y-3">
                   <p className="text-sm font-bold text-zinc-300 uppercase tracking-widest italic opacity-60">No recently deleted items</p>
                </div>
              ) : (
                <table className="w-full text-left border-collapse">
                  <thead className="sticky top-0 bg-zinc-50 border-b border-zinc-100">
                    <tr className="h-10">
                      <th className="px-4 text-[10px] font-black text-zinc-400 uppercase tracking-widest border-r border-zinc-50">Trans. Date</th>
                      <th className="px-4 text-[10px] font-black text-zinc-400 uppercase tracking-widest border-r border-zinc-50">Type</th>
                      <th className="px-4 text-[10px] font-black text-zinc-400 uppercase tracking-widest border-r border-zinc-50">Employee</th>
                      <th className="px-4 text-[10px] font-black text-zinc-400 uppercase tracking-widest text-right border-r border-zinc-50">Amount</th>
                      <th className="px-4 text-[10px] font-black text-zinc-400 uppercase tracking-widest text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-50">
                    {deletedEntries.map(item => (
                      <tr key={item.id} className="h-12 hover:bg-zinc-50/50 transition-colors">
                        <td className="px-4 text-[12px] font-bold text-zinc-600 border-r border-zinc-50">{item.date}</td>
                        <td className="px-4 border-r border-zinc-50">
                          <span className={`px-2 py-0.5 rounded text-[9px] font-black uppercase tracking-tight ${item.type === 'Advance' ? 'bg-amber-50 text-amber-700' : 'bg-blue-50 text-blue-700'}`}>
                            {item.type}
                          </span>
                        </td>
                        <td className="px-4 text-[13px] font-bold text-zinc-800 border-r border-zinc-50">{item.employeeName}</td>
                        <td className="px-4 text-[13px] font-black text-zinc-900 text-right border-r border-zinc-50 tabular-nums">{formatINR(item.amount)}</td>
                        <td className="px-4 text-right">
                          <div className="flex items-center justify-end gap-2">
                            <button 
                              onClick={() => handleRestore(item.id)}
                              disabled={restoreMutation.isPending}
                              className="h-8 px-4 bg-indigo-50 text-indigo-600 font-black rounded-lg text-[9px] uppercase tracking-widest hover:bg-indigo-600 hover:text-white transition-all flex items-center gap-2 shadow-sm"
                            >
                              <RotateCcw size={14} /> Revoke
                            </button>
                            <button 
                              onClick={() => handlePermanentDelete(item.id)}
                              disabled={permanentDeleteMutation.isPending}
                              className="h-8 px-4 bg-rose-50 text-rose-600 font-black rounded-lg text-[9px] uppercase tracking-widest hover:bg-rose-600 hover:text-white transition-all flex items-center gap-2 shadow-sm"
                            >
                              <Trash2 size={14} /> Delete
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Mobile-Optimized Sticky Navigation */}
      <div className="sticky top-0 z-40 bg-white/80 backdrop-blur-lg border-b border-gray-200/80 shadow-sm md:hidden">
        {/* Desktop Navigation */}
        <div className="hidden md:flex border-b border-gray-200 overflow-x-auto relative">
          {modules.map(mod => {
            const isActive = activeModule === mod
            let colorClass = 'text-gray-600 hover:text-gray-800 hover:bg-gray-50'
            
            if (isActive) {
              if (mod === 'Add Advance') colorClass = 'border-b-2 border-amber-500 text-amber-700 bg-amber-50'
              else if (mod === 'Add Expense') colorClass = 'border-b-2 border-blue-500 text-blue-700 bg-blue-50'
              else colorClass = 'border-b-2 border-primary-500 text-primary-700'
            }

            return (
              <button
                key={mod}
                onClick={() => setActiveModule(mod)}
                className={`whitespace-nowrap px-6 py-3 text-sm font-semibold transition-all ${colorClass}`}
              >
                {mod}
              </button>
            )
          })}

          {/* Recently Deleted Button - Positioned absolute right */}
          {activeModule === 'Reports' && (
            <button 
              onClick={() => setShowDeletedModal(true)}
              className="absolute right-0 top-1/2 -translate-y-1/2 h-8 px-3 bg-rose-50 text-rose-600 border border-rose-100 rounded-lg text-[10px] font-black uppercase tracking-widest hover:bg-rose-100 transition-all flex items-center gap-2 mr-2"
            >
              <History size={14} /> Recently Deleted
            </button>
          )}
        </div>

        {/* Mobile Navigation - 5 Toggle Buttons in Single Row */}
        <div className="md:hidden">
          <div className="flex items-center justify-between px-2 py-2 gap-1 overflow-x-auto scrollbar-hide">
            {modules.map(mod => {
              const isActive = activeModule === mod
              const getMobileColors = () => {
                if (!isActive) return 'bg-white/60 text-gray-600 border-gray-200/60 hover:bg-gray-50/80'
                if (mod === 'Add Advance') return 'bg-amber-500 text-white border-amber-500 shadow-lg shadow-amber-500/25'
                if (mod === 'Add Expense') return 'bg-blue-500 text-white border-blue-500 shadow-lg shadow-blue-500/25'
                if (mod === 'Escalation') return 'bg-rose-500 text-white border-rose-500 shadow-lg shadow-rose-500/25'
                if (mod === 'Summary') return 'bg-emerald-500 text-white border-emerald-500 shadow-lg shadow-emerald-500/25'
                if (mod === 'Ledger') return 'bg-cyan-500 text-white border-cyan-500 shadow-lg shadow-cyan-500/25'
                return 'bg-indigo-500 text-white border-indigo-500 shadow-lg shadow-indigo-500/25'
              }

              const getShortLabel = () => {
                if (mod === 'Add Advance') return 'Adv'
                if (mod === 'Add Expense') return 'Exp'
                if (mod === 'Escalation') return 'Esc'
                if (mod === 'Summary') return 'Sum'
                if (mod === 'Ledger') return 'Ledger'
                return 'Rep'
              }

              return (
                <button
                  key={mod}
                  onClick={() => setActiveModule(mod)}
                  className={`flex-shrink-0 px-3 py-2.5 rounded-xl text-xs font-bold border backdrop-blur-sm transition-all duration-200 ${getMobileColors()}`}
                >
                  {getShortLabel()}
                </button>
              )
            })}
          </div>
        </div>
      </div>

      {/* Add Expense Module (New Modern Design) */}
      {(activeModule === 'Add Expense' || activeModule === 'Add Advance') && (() => {
        const totalExpensesCount = addRows.length;
        const totalExpensesAmount = addRows.reduce((sum, r) => sum + (parseFloat(r.amount) || 0), 0);

        const getCategoryIconDetails = (catName) => {
          const c = String(catName || '').toLowerCase()
          if (c.includes('fuel') || c.includes('petrol') || c.includes('diesel')) return { icon: Car, color: 'text-emerald-600 bg-emerald-50 border-emerald-200' }
          if (c.includes('tea') || c.includes('snack') || c.includes('coffee')) return { icon: Coffee, color: 'text-blue-600 bg-blue-50 border-blue-200' }
          if (c.includes('hotel') || c.includes('stay') || c.includes('lodging')) return { icon: Hotel, color: 'text-purple-600 bg-purple-50 border-purple-200' }
          if (c.includes('taxi') || c.includes('travel') || c.includes('cab')) return { icon: Car, color: 'text-sky-600 bg-sky-50 border-sky-200' }
          if (c.includes('stationery') || c.includes('office') || c.includes('paper')) return { icon: PenTool, color: 'text-indigo-600 bg-indigo-50 border-indigo-200' }
          if (c.includes('lunch') || c.includes('food') || c.includes('dinner')) return { icon: Utensils, color: 'text-amber-600 bg-amber-50 border-amber-200' }
          return { icon: Tag, color: 'text-slate-600 bg-slate-50 border-slate-200' }
        }

        const getEmpAvatarInitials = (empId) => {
          const empObj = employees.find(e => e.id === empId)
          if (!empObj || !empObj.name) return { initial: '?', name: 'Select Employee' }
          const name = empObj.name.trim()
          const parts = name.split(' ').filter(Boolean)
          const initial = parts.length > 1 ? (parts[0][0] + parts[parts.length - 1][0]).toUpperCase() : parts[0][0].toUpperCase()
          const isCurrentUser = user && (user.email === empObj.email || user.uid === empObj.id)
          return { initial, name: isCurrentUser ? `${name} (You)` : name }
        }

        return (
          <div className="space-y-3">
            {/* 1. Integrated Header, Compact Mode Selector & Main Actions */}
            <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-3 bg-white px-4 py-3 rounded-xl border border-slate-200/90 shadow-sm">
              <div className="flex flex-col gap-2 w-full">
                <span className={portalMode ? 'hidden' : 'text-sm font-bold text-slate-800 tracking-tight'}>{activeModule === 'Add Advance' ? 'Advance' : 'Expense'} type:</span>

                {/* Ultra-Compact Mode Selector with Increased Spacing & Green Selection */}
                <div className={portalMode ? 'hidden' : 'flex flex-row flex-wrap items-center gap-5 text-xs'}>
                  <button
                    type="button"
                    onClick={() => { setExpenseMode('self'); handleSelfExpense(); }}
                    className={`py-2 transition-all flex items-center gap-2 tracking-wide cursor-pointer ${
                      expenseMode === 'self'
                        ? 'text-slate-900 font-semibold'
                        : 'text-slate-600 hover:text-slate-900 font-normal'
                    }`}
                  >
                    <span className={`w-3.5 h-3.5 rounded border flex items-center justify-center flex-shrink-0 transition-colors ${
                      expenseMode === 'self' ? 'border-emerald-600 bg-emerald-600' : 'border-slate-300 bg-white'
                    }`}>
                      {expenseMode === 'self' && <Check size={10} className="text-white stroke-[3]" />}
                    </span>
                    Self {activeModule === 'Add Advance' ? 'Advance' : 'Expense'}
                  </button>

                  <button
                    type="button"
                    onClick={() => setExpenseMode('employee')}
                    className={`py-2 transition-all flex items-center gap-2 tracking-wide cursor-pointer ${
                      expenseMode === 'employee'
                        ? 'text-slate-900 font-semibold'
                        : 'text-slate-600 hover:text-slate-900 font-normal'
                    }`}
                  >
                    <span className={`w-3.5 h-3.5 rounded border flex items-center justify-center flex-shrink-0 transition-colors ${
                      expenseMode === 'employee' ? 'border-emerald-600 bg-emerald-600' : 'border-slate-300 bg-white'
                    }`}>
                      {expenseMode === 'employee' && <Check size={10} className="text-white stroke-[3]" />}
                    </span>
                    Employee {activeModule === 'Add Advance' ? 'Advance' : 'Expense'}
                  </button>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="hidden items-center gap-2 w-full lg:w-auto justify-end">
                <input
                  type="file"
                  ref={csvFileInputRef}
                  accept=".csv"
                  onChange={handleCSVImport}
                  className="hidden"
                />
              </div>
            </div>
            {/* Split Layout: Main Workspace (75%) + Right Side Panel (25%) */}
            <div className="flex flex-col lg:flex-row items-start gap-4">
              {/* Left Column: Ribbon Controls + Spreadsheet Table Grid (~75%) */}
              <div className="flex-1 w-full lg:w-[75%] min-w-0 space-y-3">
                {/* 2. Session Details Ribbon */}
                <div className="grid grid-cols-2 gap-2.5 text-xs md:flex md:flex-wrap md:items-center">
                  {/* Date */}
                  <div className="order-1 flex w-full min-w-0 items-center gap-2 bg-white px-3 py-2 rounded-xl border border-slate-200 shadow-sm h-10 md:order-none md:w-auto md:px-3.5">
                    <span className="text-xs font-bold text-slate-600 whitespace-nowrap">Date:</span>
                    <DatePicker
                      selected={sessionDate ? parseISO(sessionDate) : new Date()}
                      maxDate={activeModule === 'Add Expense' || activeModule === 'Expense' ? new Date() : undefined}
                      onChange={(date) => {
                        if (!date) return
                        const val = format(date, 'yyyy-MM-dd')
                        const todayStr = new Date().toISOString().split('T')[0]
                        if ((activeModule === 'Add Expense' || activeModule === 'Expense') && val > todayStr) {
                          alert('Expenses cannot be created for future dates.')
                          return
                        }
                        setSessionDate(val)
                        setAddRows(addRows.map(r => ({ ...r, date: val })))
                      }}
                      dateFormat="dd MMM yyyy"
                      popperClassName="z-[99999]"
                      popperProps={{ strategy: 'fixed', placement: 'bottom-start' }}
                      customInput={
                        <div className="w-full min-w-0 bg-transparent text-xs font-semibold text-slate-900 outline-none cursor-pointer h-full flex items-center select-none">
                          {sessionDate ? format(parseISO(sessionDate), 'dd MMM yyyy') : format(new Date(), 'dd MMM yyyy')}
                        </div>
                      }
                    />
                  </div>

                  {/* Paid From */}
                  {showSessionAccount && !portalMode && (
                  <>
                    <div className="hidden md:flex items-center gap-2 bg-white px-3.5 py-2 rounded-xl border border-slate-200 shadow-sm h-10">
                      <span className="text-xs font-bold text-slate-600 whitespace-nowrap">Account:</span>
                      <select
                        value={sessionAccount}
                        onChange={(e) => setSessionAccount(e.target.value)}
                        className="bg-transparent text-xs font-normal text-slate-900 outline-none cursor-pointer h-full"
                      >
                        <option value="Petty Cash - HO">Petty Cash - HO</option>
                        <option value="Main Bank Account">Main Bank Account</option>
                        <option value="Cash in Hand">Cash in Hand</option>
                        <option value="Director Account">Director Account</option>
                      </select>
                    </div>
                    <div className="order-4 md:hidden flex w-full min-w-0 items-center gap-2 bg-white px-3 py-2 rounded-xl border border-slate-200 shadow-sm h-10">
                      <span className="text-xs font-bold text-slate-600 whitespace-nowrap">Account:</span>
                      <Dropdown
                        value={sessionAccount}
                        onChange={setSessionAccount}
                        options={['Petty Cash - HO', 'Main Bank Account', 'Cash in Hand', 'Director Account']}
                        size="sm"
                        className="min-w-0 flex-1"
                        panelWidth="w-[min(20rem,calc(100vw-2rem))]"
                        mobileMenu
                      />
                    </div>
                  </>
                  )}

                  {/* Default Employee */}
                  {showSessionEmployee && !portalMode && (
                  <>
                    <div className="hidden md:flex items-center gap-2 bg-white px-3.5 py-2 rounded-xl border border-slate-200 shadow-sm h-10">
                      <span className="text-xs font-bold text-slate-600 whitespace-nowrap">Default employee:</span>
                      <select
                        value={sessionDefaultEmp}
                        onChange={(e) => {
                          const val = e.target.value;
                          setSessionDefaultEmp(val);
                          if (val) {
                            setAddRows(addRows.map(r => ({ ...r, employeeId: val })));
                          }
                        }}
                        className="bg-transparent text-xs font-normal text-slate-900 outline-none cursor-pointer max-w-[180px] truncate h-full"
                      >
                        <option value="">Select...</option>
                        {sortedEmployees.map(e => {
                          const isMe = e.id === getMyEmpId() || e.email === user?.email;
                          const inactiveTag = !isEmployeeActiveStatus(e.status) ? ' (Inactive)' : '';
                          return (
                            <option key={e.id} value={e.id}>
                              {e.name} {isMe ? '(You)' : ''}{inactiveTag}
                            </option>
                          );
                        })}
                      </select>
                    </div>
                    <div className="order-3 col-span-2 md:hidden flex w-full min-w-0 items-center gap-2 bg-white px-3 py-2 rounded-xl border border-slate-200 shadow-sm h-10">
                      <span className="text-xs font-bold text-slate-600 whitespace-nowrap">Default employee:</span>
                      <Dropdown
                        value={sessionDefaultEmp}
                        onChange={(val) => {
                          setSessionDefaultEmp(val)
                          if (val) setAddRows(addRows.map(r => ({ ...r, employeeId: val })))
                        }}
                        options={sortedEmployees.map(e => {
                          const isMe = e.id === getMyEmpId() || e.email === user?.email
                          const inactiveTag = !isEmployeeActiveStatus(e.status) ? ' (Inactive)' : ''
                          return { label: `${e.name} ${isMe ? '(You)' : ''}${inactiveTag}`, value: e.id }
                        })}
                        placeholder="Select employee..."
                        searchable
                        size="sm"
                        className="min-w-0 flex-1"
                        panelWidth="w-[min(20rem,calc(100vw-2rem))]"
                        mobileMenu
                        autoFocusSearch={false}
                      />
                    </div>
                  </>
                  )}

                  {/* Default Payout */}
                  {showSessionPayout && !portalMode && (
                  <div className="order-2 col-span-1 flex w-full min-w-0 items-center gap-2 bg-white px-3 py-2 rounded-xl border border-slate-200 shadow-sm h-10 md:order-none md:col-span-auto md:w-auto md:px-3.5">
                    <span className="text-xs font-bold text-slate-600 whitespace-nowrap">Payout:</span>
                    <select
                      value={sessionPayout}
                      onChange={(e) => {
                        const val = e.target.value;
                        setSessionPayout(val);
                        setAddRows(addRows.map(r => ({ ...r, payoutMethod: val })));
                      }}
                      className="min-w-0 flex-1 bg-transparent text-xs font-normal text-slate-900 outline-none cursor-pointer h-full"
                    >
                      <option value="Immediate">Immediate</option>
                      <option value="With Salary">Monthly</option>
                    </select>
                  </div>
                  )}

                  {/* Reset / Restore Session Button (Moved Next to Payout) */}
                  <button
                    type="button"
                    onClick={handleClearSession}
                    className="order-5 col-span-1 w-full justify-self-stretch p-2 text-slate-500 hover:text-slate-800 hover:bg-white rounded-xl border border-slate-200 shadow-sm transition-colors h-10 flex items-center justify-center bg-white px-3 gap-1.5 cursor-pointer md:order-none md:col-span-1 md:w-auto md:justify-self-auto"
                    title="Reset / Clear Session"
                  >
                    <RotateCcw size={14} className="text-slate-500" />
                    <span className="text-xs font-semibold text-slate-700">Reset</span>
                  </button>
                </div>

                {/* 4. Expenses Table Header & Controls Bar */}
                <div className="bg-white rounded-2xl border border-slate-200/80 overflow-hidden shadow-sm">
                <div className="p-4 sm:p-5 border-b border-slate-200/80 flex items-center justify-between gap-3 sm:flex-row sm:gap-4 bg-slate-50/40">
                  <div className="flex items-center gap-4">
                    <h2 className="text-base font-bold text-slate-900">
                      {activeModule === 'Add Advance' ? 'Advances' : 'Expenses'} <span className="text-slate-500 font-medium text-sm">({addRows.length} rows)</span>
                    </h2>
                  </div>

                  <div className="flex items-center gap-3 w-auto">
                    {/* Show Advance fields Dropdown with Checkboxes & Click Outside Close */}
                    <div className="relative" ref={advanceFieldsDropdownRef}>
                      <button
                        type="button"
                        onClick={() => setShowAdvanceFieldsDropdown(!showAdvanceFieldsDropdown)}
                        className={`flex items-center gap-2 text-xs font-semibold px-3 py-1.5 rounded-lg border transition-all ${
                          showAdvanceFields || showProjectColumn || (!portalMode && (!showSessionEmployee || !showSessionAccount || !showSessionPayout))
                            ? 'bg-blue-50 border-blue-200 text-blue-700 font-bold'
                            : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                        }`}
                      >
                        <SlidersHorizontal size={13} className="hidden md:block" />
                        <span className="hidden md:inline">Columns / Options</span>
                        <MoreVertical size={18} className="md:hidden" aria-hidden="true" />
                        <ChevronDown size={13} className={`hidden md:block transition-transform duration-150 ${showAdvanceFieldsDropdown ? 'rotate-180' : ''}`} />
                        <span className="sr-only">Columns and options</span>
                      </button>

                      {showAdvanceFieldsDropdown && (
                        <div className="absolute right-0 mt-1.5 w-64 bg-white border border-slate-200 rounded-xl shadow-xl p-3 z-30 text-xs space-y-2.5 animate-in fade-in zoom-in-95 duration-100">
                          <div className="font-bold text-slate-800 border-b border-slate-100 pb-1 text-[11px] uppercase tracking-wider">
                            Toggle visible fields
                          </div>

                          {!portalMode && (
                            <label className="flex items-center justify-between gap-2 cursor-pointer text-slate-700 font-medium hover:text-slate-900 select-none">
                              <span className="font-semibold">Employee</span>
                              <input type="checkbox" checked={showSessionEmployee} onChange={(e) => setShowSessionEmployee(e.target.checked)} className="h-4 w-4 rounded text-blue-600 focus:ring-blue-500 border-slate-300" />
                            </label>
                          )}

                          {!portalMode && <>
                            <label className="flex items-center justify-between gap-2 cursor-pointer text-slate-700 font-medium hover:text-slate-900 select-none">
                              <span className="font-semibold">Account</span>
                              <input type="checkbox" checked={showSessionAccount} onChange={(e) => setShowSessionAccount(e.target.checked)} className="h-4 w-4 rounded text-blue-600 focus:ring-blue-500 border-slate-300" />
                            </label>

                            <label className="flex items-center justify-between gap-2 cursor-pointer text-slate-700 font-medium hover:text-slate-900 select-none pb-2 border-b border-slate-100">
                              <span className="font-semibold">Payout</span>
                              <input type="checkbox" checked={showSessionPayout} onChange={(e) => setShowSessionPayout(e.target.checked)} className="h-4 w-4 rounded text-blue-600 focus:ring-blue-500 border-slate-300" />
                            </label>
                          </>}
                          
                          <label className="flex items-start gap-2.5 cursor-pointer text-slate-700 font-medium hover:text-slate-900 select-none">
                            <input
                              type="checkbox"
                              checked={showAdvanceFields}
                              onChange={(e) => setShowAdvanceFields(e.target.checked)}
                              className="w-4 h-4 rounded text-blue-600 focus:ring-blue-500 border-slate-300 mt-0.5"
                            />
                            <div>
                              <span className="block font-semibold">Paid To & Advance Ref</span>
                              <span className="text-[10px] text-slate-400 font-normal">Show payment tracking fields</span>
                            </div>
                          </label>

                          <label className="flex items-start gap-2.5 cursor-pointer text-slate-700 font-medium hover:text-slate-900 select-none pt-2 border-t border-slate-100">
                            <input
                              type="checkbox"
                              checked={showProjectColumn}
                              onChange={(e) => setShowProjectColumn(e.target.checked)}
                              className="w-4 h-4 rounded text-blue-600 focus:ring-blue-500 border-slate-300 mt-0.5"
                            />
                            <div>
                              <span className="block font-semibold">Projects</span>
                              <span className="text-[10px] text-slate-400 font-normal">Show project selector column</span>
                            </div>
                          </label>
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* 5. High-Density Spreadsheet Table Grid */}
                <div className="hidden md:block overflow-x-auto">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="bg-slate-100/70 border-b border-slate-200/80 text-[11px] font-bold text-slate-600 uppercase tracking-wider">
                        <th className="py-3 px-3 w-10 text-center">#</th>
                        {!portalMode && <th className="py-3 px-3 min-w-[200px]">Employee <span className="text-rose-500">*</span></th>}
                        <th className="py-3 px-3 min-w-[180px]">Category <span className="text-rose-500">*</span></th>
                        {showAdvanceFields && (
                          <th className="py-3 px-3 min-w-[160px]">Paid To <span className="text-rose-500">*</span></th>
                        )}
                        <th className="py-3 px-2.5 min-w-[100px] w-28 text-right">Amount (₹) <span className="text-rose-500">*</span></th>
                        {!portalMode && <th className="py-3 px-2.5 min-w-[100px] w-28">Payout <span className="text-rose-500">*</span></th>}
                        <th className="py-3 px-3 min-w-[220px]">Remarks</th>
                        {showProjectColumn && (
                          <th className="py-3 px-3 min-w-[160px]">Project (Optional)</th>
                        )}
                        <th className="py-3 px-3 w-20 text-center">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200/60">
                      {addRows.map((row, idx) => {
                        const empInfo = getEmpAvatarInitials(row.employeeId);
                        const catDetails = getCategoryIconDetails(row.category);
                        const CategoryIcon = catDetails.icon;

                        return (
                          <tr key={row.id} className="hover:bg-blue-50/30 transition-colors group">
                            {/* Row Index */}
                            <td className="py-2.5 px-3 text-center text-slate-400 font-bold text-xs">
                              {idx + 1}
                            </td>

                            {!portalMode && (
                              <td className="py-2 px-3">
                                <select
                                  value={row.employeeId}
                                  onChange={(e) => handleRowChange(row.id, 'employeeId', e.target.value)}
                                  disabled={!canSelectAll}
                                  className="w-full h-9 bg-white border border-slate-200 rounded-lg px-2.5 text-xs font-semibold text-slate-800 outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                                >
                                  <option value="">Select Employee...</option>
                                  {sortedEmployees.map(e => (
                                    <option key={e.id} value={e.id}>
                                      {e.name} {!isEmployeeActiveStatus(e.status) ? '(Inactive)' : ''}
                                    </option>
                                  ))}
                                </select>
                              </td>
                            )}

                            {/* Category */}
                            <td id={`category-cell-${row.id}`} className="py-2 px-3 relative">
                              <div className="w-full">
                                <Dropdown
                                  value={row.category === 'custom' ? '' : row.category}
                                  onChange={(val, e) => {
                                    handleRowChange(row.id, 'category', val);
                                    const lower = (val || '').toLowerCase();
                                    if (lower.includes('given to others') || lower.includes('salary to others')) {
                                      openPaidToPopover(row.id, e?.target);
                                    }
                                  }}
                                  options={categories}
                                  placeholder="Select Category..."
                                  size="xs"
                                  searchable
                                  allowCustom
                                  customActive={row.category === 'custom'}
                                  onAddOther={() => handleRowChange(row.id, 'category', 'custom')}
                                />
                                {row.category === 'custom' && (
                                  <input
                                    type="text"
                                    value={row.customCategory || ''}
                                    onChange={(e) => handleRowChange(row.id, 'customCategory', e.target.value)}
                                    className="w-full mt-1 bg-white border border-slate-200 rounded-lg px-2 py-1 text-xs outline-none focus:border-blue-500"
                                    placeholder="Custom category..."
                                    autoFocus
                                  />
                                )}

                                {/* Sub-badge: [1st Column Employee] → [Chosen Recipient] with -2px spacing */}
                                {(row.category?.toLowerCase().includes('given to others') || row.category?.toLowerCase().includes('salary to others')) && (
                                  <div
                                    onClick={(e) => openPaidToPopover(activePaidToRowId === row.id ? null : row.id, e.currentTarget)}
                                    className="mt-[-2px] flex items-center justify-between gap-1.5 text-[10px] font-bold text-blue-900 bg-blue-50/90 hover:bg-blue-100/90 px-2 py-0.5 rounded-md border border-blue-200/80 shadow-2xs cursor-pointer transition-all group/badge"
                                    title="Click to change recipient"
                                  >
                                    <div className="flex items-center gap-1.5 overflow-hidden">
                                      <span className="text-slate-700 font-semibold truncate max-w-[85px]">
                                        {(() => {
                                          const mainEmp = employees.find(e => e.id === row.employeeId);
                                          return mainEmp ? mainEmp.name : (row.employeeId || 'Employee');
                                        })()}
                                      </span>
                                      <span className="text-blue-600 font-extrabold">→</span>
                                      <span className="text-blue-900 font-bold truncate max-w-[95px]">
                                        {(() => {
                                          if (row.paidToType === 'custom' && row.paidToCustomName) return row.paidToCustomName;
                                          if (row.paidTo) {
                                            const emp = employees.find(e => e.id === row.paidTo || e.name === row.paidTo);
                                            return emp ? emp.name : row.paidTo;
                                          }
                                          return 'Select recipient...';
                                        })()}
                                      </span>
                                    </div>
                                    <span className="text-[9px] text-blue-600 opacity-70 group-hover/badge:opacity-100 font-bold underline shrink-0">
                                      {row.paidTo || row.paidToCustomName ? 'Change' : 'Choose'}
                                    </span>
                                  </div>
                                )}

                                {/* 2-Column Searchable Recipient Employee Popup - Excludes 1st Column Employee */}
                                {activePaidToRowId === row.id && createPortal(
                                  <div
                                    ref={paidToPopoverRef}
                                    style={{
                                      position: 'fixed',
                                      top: `${paidToPopoverPos.top}px`,
                                      left: `${paidToPopoverPos.left}px`,
                                      zIndex: 9999
                                    }}
                                    className="w-80 bg-white border border-slate-200 rounded-xl shadow-2xl p-3 text-xs space-y-2 animate-in fade-in zoom-in-95 duration-150"
                                  >
                                    <div className="flex items-center justify-between border-b border-slate-100 pb-1.5 px-0.5">
                                      <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                                        Select Recipient Employee
                                      </span>
                                      <button
                                        type="button"
                                        onClick={() => { setActivePaidToRowId(null); setPaidToSearchTerm(''); }}
                                        className="text-slate-400 hover:text-slate-600 p-0.5 rounded hover:bg-slate-100"
                                      >
                                        <X size={13} />
                                      </button>
                                    </div>

                                    {/* Search by type input */}
                                    <div className="relative">
                                      <Search size={12} className="absolute left-2.5 top-2 text-slate-400" />
                                      <input
                                        type="text"
                                        value={paidToSearchTerm}
                                        onChange={(e) => setPaidToSearchTerm(e.target.value)}
                                        placeholder="Type to search employee..."
                                        className="w-full bg-slate-50 border border-slate-200 rounded-lg pl-7 pr-2.5 py-1 text-xs outline-none focus:border-blue-500 focus:bg-white"
                                        autoFocus
                                      />
                                    </div>

                                    {/* 2-Column Grid Layout of Active Employees (Excludes Column 1 Employee) */}
                                    <div className="max-h-44 overflow-y-auto grid grid-cols-2 gap-1 py-1 pr-0.5">
                                      {employees
                                        .filter(e => {
                                          const isActive = (e.status || 'Active').toLowerCase() === 'active';
                                          const notCol1Emp = e.id !== row.employeeId && e.name !== row.employeeId;
                                          const matchesSearch = e.name.toLowerCase().includes((paidToSearchTerm || '').toLowerCase());
                                          return isActive && notCol1Emp && matchesSearch;
                                        })
                                        .map(e => (
                                          <button
                                            key={e.id}
                                            type="button"
                                            onClick={() => {
                                              setAddRows(addRows.map(r => r.id === row.id ? { ...r, paidTo: e.id, paidToType: 'employee', paidToCustomName: '' } : r));
                                              setActivePaidToRowId(null);
                                              setPaidToSearchTerm('');
                                            }}
                                            className={`w-full text-left px-2 py-1.5 rounded-lg transition-colors flex items-center justify-between text-[11px] font-semibold ${
                                              row.paidTo === e.id
                                                ? 'bg-blue-50 text-blue-700 font-bold border border-blue-200'
                                                : 'text-slate-700 hover:bg-slate-100 border border-slate-100'
                                            }`}
                                          >
                                            <span className="truncate">{e.name}</span>
                                            {row.paidTo === e.id && <Check size={12} className="text-blue-600 shrink-0" />}
                                          </button>
                                        ))}
                                    </div>

                                    <button
                                      type="button"
                                      onClick={() => handleRowChange(row.id, 'paidToType', 'custom')}
                                      className="w-full text-left px-2 py-1 rounded-lg text-blue-600 hover:bg-blue-50 transition-colors text-xs font-bold border-t border-slate-100 pt-1.5"
                                    >
                                      + Add Other Name...
                                    </button>

                                    {row.paidToType === 'custom' && (
                                      <div className="flex items-center gap-1.5 pt-1.5 border-t border-slate-100">
                                        <input
                                          type="text"
                                          value={row.paidToCustomName || ''}
                                          onChange={(e) => handleRowChange(row.id, 'paidToCustomName', e.target.value)}
                                          placeholder="Enter recipient name..."
                                          className="w-full bg-white border border-slate-200 rounded-lg px-2.5 py-1 text-xs outline-none focus:border-blue-500"
                                          autoFocus
                                        />
                                        <button
                                          type="button"
                                          onClick={() => { setActivePaidToRowId(null); setPaidToSearchTerm(''); }}
                                          className="px-2.5 py-1 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-lg text-[10px] shrink-0"
                                        >
                                          Save
                                        </button>
                                      </div>
                                    )}
                                  </div>,
                                  document.body
                                )}
                              </div>
                            </td>

                            {/* Paid To (Conditional) */}
                            {showAdvanceFields && (
                              <td className="py-2 px-3">
                                <PaidToDropdown rowId={row.id} row={row} isMobile={false} />
                              </td>
                            )}

                            {/* Amount */}
                            <td className="py-2 px-2 w-28">
                              <input
                                type="number"
                                value={row.amount}
                                onChange={(e) => handleRowChange(row.id, 'amount', e.target.value)}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter' && !e.shiftKey && !e.ctrlKey && idx === addRows.length - 1) {
                                    e.preventDefault()
                                    handleAddRow()
                                  }
                                }}
                                placeholder="0.00"
                                className="w-full h-9 bg-white border border-slate-200 rounded-lg px-2 text-xs font-bold text-right text-slate-900 outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                              />
                            </td>

                            {!portalMode && (
                              <td className="py-2 px-2 w-28">
                                <select
                                  value={row.payoutMethod}
                                  onChange={(e) => handleRowChange(row.id, 'payoutMethod', e.target.value)}
                                  className="w-full h-9 bg-white border border-slate-200 rounded-lg px-1.5 text-xs font-semibold text-slate-800 outline-none focus:border-blue-500"
                                >
                                  <option value="Immediate">Immediate</option>
                                  <option value="With Salary">Monthly</option>
                                </select>
                              </td>
                            )}

                            {/* Remarks */}
                            <td className="py-2 px-3">
                              <input
                                type="text"
                                value={row.reason}
                                onChange={(e) => handleRowChange(row.id, 'reason', e.target.value)}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter' && !e.shiftKey && !e.ctrlKey && rowIdx === addRows.length - 1) {
                                    e.preventDefault()
                                    handleAddRow()
                                  }
                                }}
                                placeholder="Remarks..."
                                className="w-full h-9 bg-white border border-slate-200 rounded-lg px-2.5 text-xs font-medium text-slate-700 outline-none focus:border-blue-500"
                              />
                            </td>

                            {/* Project (Optional - Conditional) */}
                            {showProjectColumn && (
                              <td className="py-2 px-3">
                                <select
                                  value={row.project}
                                  onChange={(e) => handleRowChange(row.id, 'project', e.target.value)}
                                  className="w-full bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs font-medium text-slate-700 outline-none focus:border-blue-500"
                                >
                                  <option value="">Select Project...</option>
                                  <option value="P-0001">P-0001</option>
                                  <option value="P-0002">P-0002</option>
                                  <option value="P-0008">P-0008</option>
                                  <option value="P-0012">P-0012</option>
                                  <option value="Site visit - Client Meeting">Site visit - Client Meeting</option>
                                </select>
                              </td>
                            )}

                            {/* Action */}
                            <td className="py-2 px-3 text-center">
                              <div className="flex items-center justify-center gap-1">
                                <button
                                  type="button"
                                  onClick={() => handleDuplicateRow(row.id)}
                                  className="p-1 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-md transition-colors"
                                  title="Duplicate Row (Ctrl+D)"
                                >
                                  <Copy size={14} />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setAddRows(addRows.filter(r => r.id !== row.id))}
                                  className="p-1 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-md transition-colors"
                                  title="Delete Row"
                                >
                                  <Trash2 size={14} />
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                <div className="md:hidden space-y-3 bg-slate-50/40 p-3">
                  {addRows.map((row, idx) => (
                    <AdvanceExpenseMobileRow
                      key={row.id}
                      row={row}
                      idx={idx}
                      activeModule={activeModule}
                      sortedEmployees={sortedEmployees}
                      categories={categories}
                      canSelectAll={canSelectAll}
                      showAdvanceFields={showAdvanceFields}
                      showProjectColumn={showProjectColumn}
                      portalMode={portalMode}
                      handleRowChange={handleRowChange}
                      handleDuplicateRow={handleDuplicateRow}
                      handleDeleteRow={(rowId) => setAddRows(prev => prev.filter(item => item.id !== rowId))}
                      PaidToDropdown={PaidToDropdown}
                    />
                  ))}
                </div>

                {/* Grid Footer Bar — Add Row | Total | Submit Expenses — all in one row */}
                <div className="p-3 sm:p-4 bg-slate-50/60 border-t border-slate-200/80 flex flex-wrap items-center justify-between gap-3">
                  {/* Left: + Add Row */}
                  <div className="flex items-center gap-3">
                    <button
                      type="button"
                      onClick={handleAddRow}
                      className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 active:scale-[0.98] text-white rounded-lg text-xs font-bold transition-all shadow-sm flex items-center gap-1.5 cursor-pointer"
                    >
                      <Plus size={14} />
                      Add Row
                    </button>
                  </div>

                  {/* Center: Total Amount */}
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-medium text-slate-500 uppercase tracking-wider">Total:</span>
                    <span className="text-sm font-bold text-slate-900">{formatINR(totalExpensesAmount)}</span>
                  </div>

                  {/* Right: Submit Expenses */}
                  <button
                    type="button"
                    onClick={handleSubmitAll}
                    disabled={submitting}
                    className="gemini-glow-border bg-white hover:bg-slate-50 active:scale-[0.99] text-slate-800 px-4 h-8 rounded-lg shadow-sm flex items-center gap-2 group transition-all cursor-pointer disabled:opacity-50"
                  >
                    {submitting ? <Spinner size="w-3.5 h-3.5" color="text-blue-600" /> : <Send size={14} className="text-blue-600" />}
                    <span className="text-xs font-medium tracking-tight text-slate-900 group-hover:text-blue-600 transition-colors">
                      {submitting ? 'Submitting...' : `Submit ${activeModule === 'Add Advance' ? 'Advances' : 'Expenses'}`}
                    </span>
                    <span className="hidden sm:inline-block text-[10px] font-medium bg-slate-100 text-slate-500 px-2 py-0.5 rounded-md border border-slate-200/80">
                      Ctrl+Enter
                    </span>
                  </button>
                </div>
              </div>
            </div>

            {/* Right Column: Side Panel (~25% width) */}
            <div className="w-full lg:w-[25%] lg:max-w-[290px] shrink-0 bg-white rounded-2xl border border-slate-200/80 shadow-sm p-3.5 self-start">
              <button
                type="button"
                onClick={() => setIsMobileReportExpanded((expanded) => !expanded)}
                className="md:hidden flex w-full items-center justify-between gap-3 text-left"
                aria-expanded={isMobileReportExpanded}
              >
                <span>
                  <span className="block text-[10px] font-bold uppercase tracking-widest text-slate-400">{format(new Date(), 'MMMM yyyy')}</span>
                  <span className="mt-1 block text-xs font-semibold text-slate-800">{activeModule === 'Add Advance' ? 'Advance report' : 'Expense report'}</span>
                </span>
                <span className="flex items-center gap-2">
                  <span className="text-[10px] font-black text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-md border border-emerald-200/60 font-mono">{formatINR(sidePanelData.monthTotal)}</span>
                  <ChevronDown size={16} className={`text-slate-500 transition-transform ${isMobileReportExpanded ? 'rotate-180' : ''}`} />
                </span>
              </button>
              <div className={`${isMobileReportExpanded ? 'block' : 'hidden'} space-y-3.5 md:block`}>
                {/* 1. Panel Header: Current Month & Total Spent/Adv */}
                <div className="border-b border-slate-100 pb-3">
                  <div className="flex items-center justify-between">
                    <h4 className="text-xs font-extrabold text-slate-900 tracking-tight uppercase font-heading">
                      {format(new Date(), 'MMMM yyyy')}
                    </h4>
                    <span className="text-[10px] font-black text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-md border border-emerald-200/60 font-mono">
                      {formatINR(sidePanelData.monthTotal)}
                    </span>
                  </div>
                  <div className="flex justify-between items-center mt-1 text-[11px] text-slate-500 font-medium font-body">
                    <span>{activeModule === 'Add Advance' ? 'Total Advance' : 'Total Spent'}</span>
                    <span className="font-bold text-slate-800 font-mono">{formatINR(sidePanelData.monthTotal)}</span>
                  </div>
                </div>

                {/* 2. Recent Entries Section (Date-wise, Recent to Oldest) */}
                <div>
                  <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2 font-body">
                    Recent {activeModule === 'Add Advance' ? 'Advances' : 'Expenses'}
                  </div>

                  {sidePanelData.groups.length === 0 ? (
                    <div className="text-[11px] text-slate-400 italic py-4 text-center font-body">
                      No recent entries recorded.
                    </div>
                  ) : (
                    <div className="max-h-[480px] overflow-y-auto pr-0.5 space-y-3 custom-scrollbar">
                      {sidePanelData.groups.map(group => (
                        <div key={group.dateStr} className="space-y-1">
                          {/* Date Separator Row (dd-MMM-yyyy, 11px font size, right aligned total) */}
                          <div className="flex items-center justify-between text-[11px] font-bold text-slate-800 bg-slate-50 px-2.5 py-1 rounded-md border border-slate-100 font-heading">
                            <span>{formatDateTitle(group.dateStr)}</span>
                            <span className="font-mono text-slate-900 text-right ml-auto tabular-nums">{formatINR(group.total)}</span>
                          </div>

                          {/* Indented Expense Details (3-4pt indent, 9px font size, vertically aligned category column) */}
                          <div className="ml-3 pl-2 border-l-2 border-slate-200/80 space-y-1 py-0.5">
                            {group.items.map((item, iIdx) => {
                              const recipientName = item.paidToName || item.paidToCustomName || item.transferredToName || (item.paidTo ? (employees.find(e => e.id === item.paidTo || e.name === item.paidTo)?.name || item.paidTo) : null);
                              const catLower = (item.category || '').toLowerCase();
                              const showRecipient = (catLower.includes('given to others') || catLower.includes('salary to others') || recipientName) && recipientName;

                              return (
                                <div 
                                  key={item.id || iIdx}
                                  className="grid grid-cols-[85px_1fr_auto] items-center gap-1 text-[9px] font-medium text-slate-600 hover:text-slate-900 py-0.5 font-body border-b border-slate-50 last:border-0"
                                >
                                  <span className="truncate text-slate-800 font-semibold pr-1" title={item.employeeName || 'Unknown'}>
                                    {item.employeeName || 'Unknown'}
                                  </span>
                                  <div className="flex flex-col min-w-0">
                                    <span className="truncate text-slate-500 font-medium" title={item.category || 'General'}>
                                      - {item.category || 'General'}
                                    </span>
                                    {showRecipient && (
                                      <span className="text-[6px] font-bold text-blue-600 leading-none truncate mt-0.5 font-body" title={`Recipient: ${recipientName}`}>
                                        → {recipientName}
                                      </span>
                                    )}
                                  </div>
                                  <span className="font-bold text-slate-900 font-mono shrink-0 text-right tabular-nums ml-auto">
                                    {formatINR(item.amount)}
                                  </span>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
            </div>

            {/* 7. Keyboard Shortcuts Footer Bar */}
            {!portalMode && <div className="hidden md:flex bg-slate-50 border border-slate-200/80 rounded-xl p-3 flex-col sm:flex-row items-center justify-between gap-3 text-xs text-slate-600">
              <div className="flex flex-wrap items-center gap-3 font-medium">
                <span className="font-bold text-slate-800">Keyboard Shortcuts</span>
                <span className="text-slate-300">•</span>
                <span><kbd className="px-1.5 py-0.5 bg-white border rounded text-[10px]">Tab</kbd> / <kbd className="px-1.5 py-0.5 bg-white border rounded text-[10px]">Enter</kbd> Next field</span>
                <span className="text-slate-300">•</span>
                <span><kbd className="px-1.5 py-0.5 bg-white border rounded text-[10px]">Shift + Tab</kbd> Previous field</span>
                <span className="text-slate-300">•</span>
                <span><kbd className="px-1.5 py-0.5 bg-white border rounded text-[10px]">Enter</kbd> Add row</span>
                <span className="text-slate-300">•</span>
                <span><kbd className="px-1.5 py-0.5 bg-white border rounded text-[10px]">Ctrl + D</kbd> Duplicate row</span>
                <span className="text-slate-300">•</span>
                <span><kbd className="px-1.5 py-0.5 bg-white border rounded text-[10px]">Ctrl + Enter</kbd> Submit</span>
              </div>

              <button
                type="button"
                onClick={() => setShowShortcutsModal(true)}
                className="px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-slate-700 font-semibold hover:bg-slate-100 transition-colors whitespace-nowrap shadow-sm text-xs"
              >
                View All Shortcuts
              </button>
            </div>}

            {portalMode && activeModule === 'Add Expense' && (
              <section className="rounded-2xl border border-slate-200/80 bg-white shadow-sm">
                <div className="flex flex-col gap-1 border-b border-slate-100 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">My expenses</p>
                    <h3 className="mt-0.5 text-sm font-semibold text-slate-900">Submitted expense requests</h3>
                  </div>
                  <p className="text-[11px] text-slate-500">Only Pending expenses can be changed or withdrawn.</p>
                </div>

                {portalExpenses.length === 0 ? (
                  <p className="px-4 py-7 text-center text-sm text-slate-400">You have not submitted an expense request yet.</p>
                ) : (
                  <div className="divide-y divide-slate-100">
                    {portalExpenses.map((entry) => {
                      const isPending = entry.status === 'Pending'
                      return (
                        <div key={entry.id} className="flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                              <span className="text-sm font-semibold text-slate-900">{entry.category || 'Expense'}</span>
                              <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${isPending ? 'bg-amber-50 text-amber-700' : entry.status === 'Withdrawn' ? 'bg-slate-100 text-slate-600' : 'bg-emerald-50 text-emerald-700'}`}>{entry.status || 'Pending'}</span>
                            </div>
                            <p className="mt-1 text-xs text-slate-500">{entry.date || 'No date'} · {entry.reason || 'No remarks'}</p>
                            {(entry.remarks || entry.mileageRemarks) && <p className="mt-1 text-xs font-medium text-slate-600">Remarks: {entry.remarks || entry.mileageRemarks}</p>}
                          </div>
                          <div className="flex items-center justify-between gap-3 sm:justify-end">
                            <span className="text-sm font-bold tabular-nums text-slate-900">{formatINR(entry.amount)}</span>
                            {isPending && (
                              <div className="flex gap-2">
                                <button type="button" onClick={() => openPortalExpenseEdit(entry)} className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50">Edit</button>
                                <button type="button" onClick={() => handlePortalExpenseWithdraw(entry)} disabled={portalExpenseWithdrawMutation.isPending} className="rounded-lg border border-rose-200 px-3 py-1.5 text-xs font-semibold text-rose-600 hover:bg-rose-50 disabled:opacity-50">Withdraw</button>
                              </div>
                            )}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </section>
            )}
          </div>
        );
      })()}

      {portalEditForm && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-950/40 p-4 backdrop-blur-sm">
          <div className="w-full max-w-lg rounded-2xl border border-slate-200 bg-white p-5 shadow-2xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Pending expense</p>
                <h2 className="mt-1 text-lg font-semibold text-slate-900">Edit expense request</h2>
              </div>
              <button type="button" onClick={() => setPortalEditForm(null)} className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700" aria-label="Close edit expense"><X size={18} /></button>
            </div>
            <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2">
              <label className="text-[11px] font-bold uppercase tracking-wider text-slate-500">Date<input type="date" value={portalEditForm.date} onChange={(event) => setPortalEditForm((current) => ({ ...current, date: event.target.value }))} className="mt-1 h-10 w-full rounded-lg border border-slate-200 px-3 text-sm font-medium text-slate-800 outline-none focus:border-emerald-500" /></label>
              <label className="text-[11px] font-bold uppercase tracking-wider text-slate-500">Amount<input type="number" min="0" step="0.01" value={portalEditForm.amount} onChange={(event) => setPortalEditForm((current) => ({ ...current, amount: event.target.value }))} className="mt-1 h-10 w-full rounded-lg border border-slate-200 px-3 text-sm font-medium text-slate-800 outline-none focus:border-emerald-500" /></label>
              <label className="text-[11px] font-bold uppercase tracking-wider text-slate-500 sm:col-span-2">Category<input list="portal-expense-categories" value={portalEditForm.category} onChange={(event) => setPortalEditForm((current) => ({ ...current, category: event.target.value }))} className="mt-1 h-10 w-full rounded-lg border border-slate-200 px-3 text-sm font-medium text-slate-800 outline-none focus:border-emerald-500" /><datalist id="portal-expense-categories">{categories.map((category) => <option key={category} value={category} />)}</datalist></label>
              <label className="text-[11px] font-bold uppercase tracking-wider text-slate-500 sm:col-span-2">Reason<input type="text" value={portalEditForm.reason} onChange={(event) => setPortalEditForm((current) => ({ ...current, reason: event.target.value }))} className="mt-1 h-10 w-full rounded-lg border border-slate-200 px-3 text-sm font-medium text-slate-800 outline-none focus:border-emerald-500" /></label>
              <label className="text-[11px] font-bold uppercase tracking-wider text-slate-500 sm:col-span-2">Remarks<div className="mt-1"><Dropdown value={portalEditForm.remarks} onChange={(remarks) => setPortalEditForm((current) => ({ ...current, remarks }))} options={orgSettings.remarksOptions || []} placeholder="Select remarks" size="sm" panelWidth="w-[min(20rem,calc(100vw-2rem))]" mobileMenu autoFocusSearch={false} /></div></label>
              <label className="text-[11px] font-bold uppercase tracking-wider text-slate-500 sm:col-span-2">Project <span className="font-normal normal-case text-slate-400">optional</span><input type="text" value={portalEditForm.project} onChange={(event) => setPortalEditForm((current) => ({ ...current, project: event.target.value }))} className="mt-1 h-10 w-full rounded-lg border border-slate-200 px-3 text-sm font-medium text-slate-800 outline-none focus:border-emerald-500" /></label>
            </div>
            <div className="mt-5 flex gap-3">
              <button type="button" onClick={() => setPortalEditForm(null)} className="flex-1 rounded-xl bg-slate-100 px-4 py-2.5 text-xs font-bold uppercase tracking-wide text-slate-600 hover:bg-slate-200">Cancel</button>
              <button type="button" disabled={portalExpenseUpdateMutation.isPending} onClick={async () => { try { await portalExpenseUpdateMutation.mutateAsync({ id: portalEditForm.id, changes: portalEditForm }) } catch (error) { alert(error.message || 'Unable to update this expense.') } }} className="flex-1 rounded-xl bg-emerald-600 px-4 py-2.5 text-xs font-bold uppercase tracking-wide text-white hover:bg-emerald-700 disabled:opacity-50">{portalExpenseUpdateMutation.isPending ? 'Saving...' : 'Save changes'}</button>
            </div>
          </div>
        </div>
      )}



      {/* Reports Module */}
      {activeModule === 'Reports' && (
        <div className="space-y-4">
          {/* Compact Filter Bar - Single Row */}
          <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-3">
            <div className="flex flex-wrap items-center gap-2">
              
              {/* Employee Multi-Select Dropdown */}
              <div className="relative" ref={employeeDropdownRef}>
                <button 
                  onClick={() => {
                    closeAllDropdowns()
                    setEmployeeDropdownOpen(true)
                  }}
                  className="flex items-center justify-between gap-2 px-3.5 py-1 bg-gray-50 border border-gray-200 rounded text-xs text-gray-700 hover:bg-gray-100 transition-colors min-w-[160px] flex-1 max-w-[240px] h-[45px]"
                >
                  <span className="font-medium truncate">
                    {reportSelectedEmployees.length === 0 
                      ? 'All Employees' 
                      : reportSelectedEmployees.length === 1 
                        ? employees.find(e => e.id === reportSelectedEmployees[0])?.name || '1 Selected'
                        : `${reportSelectedEmployees.length} Selected`
                    }
                  </span>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="flex-shrink-0">
                    <polyline points="6 9 12 15 18 9"/>
                  </svg>
                </button>
                
                {employeeDropdownOpen && (
                  <div className="absolute top-full left-0 mt-1 w-60 bg-white border border-gray-200 rounded-lg shadow-lg z-50 max-h-60 overflow-y-auto">
                    <div className="p-2 border-b border-gray-100">
                      <button 
                        onClick={() => {
                          setReportSelectedEmployees([])
                          closeAllDropdowns()
                        }}
                        className="text-xs text-blue-600 hover:underline"
                      >
                        Clear All
                      </button>
                    </div>
                    {sortedEmployees.map(emp => {
                      const isActive = isEmployeeActiveStatus(emp.status)
                      return (
                        <label key={emp.id} className={`flex items-center justify-between gap-2 px-3 py-2 hover:bg-gray-50 cursor-pointer ${!isActive ? 'bg-gray-50/60' : ''}`}>
                          <div className="flex items-center gap-2 min-w-0 flex-1">
                            <input 
                              type="checkbox"
                              checked={reportSelectedEmployees.includes(emp.id)}
                              onChange={(e) => {
                                if (e.target.checked) {
                                  setReportSelectedEmployees([...reportSelectedEmployees, emp.id])
                                } else {
                                  setReportSelectedEmployees(reportSelectedEmployees.filter(id => id !== emp.id))
                                }
                              }}
                              className="w-4 h-4 rounded border-gray-300 flex-shrink-0"
                            />
                            <span className={`text-xs truncate ${isActive ? 'text-gray-700 font-medium' : 'text-gray-500'}`}>{emp.name}</span>
                          </div>
                          {!isActive && (
                            <span className="text-[10px] text-red-500 font-medium px-1.5 py-0.5 bg-red-50 border border-red-100 rounded flex-shrink-0">
                              Inactive
                            </span>
                          )}
                        </label>
                      )
                    })}
                    <div className="p-2 border-t border-gray-100">
                      <button 
                        onClick={() => closeAllDropdowns()}
                        className="w-full text-center text-xs bg-primary-600 text-white px-2 py-1.5 rounded hover:bg-primary-700 font-medium"
                      >
                        Done
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {/* From Date Dropdown */}
              <div className="relative" ref={fromDateDropdownRef}>
                <button 
                  onClick={() => {
                    closeAllDropdowns()
                    setFromDateDropdownOpen(true)
                  }}
                  className="flex items-center gap-2 px-3.5 py-1 bg-gray-50 border border-gray-200 rounded text-xs text-gray-700 hover:bg-gray-100 transition-colors h-[45px]"
                >
                  <Calendar size={14} className="text-gray-500 flex-shrink-0" />
                  <span className="font-medium whitespace-nowrap">
                    {reportFromDate 
                      ? `From: ${new Date(reportFromDate).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })}`
                      : 'From Date'
                    }
                  </span>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="flex-shrink-0">
                    <polyline points="6 9 12 15 18 9"/>
                  </svg>
                </button>
                
                {fromDateDropdownOpen && (
                  <div className="absolute top-full left-0 mt-1 w-56 bg-white border border-gray-200 rounded-lg shadow-lg z-50 p-3">
                    <div className="flex items-center justify-between mb-2">
                      <button 
                        onClick={() => {
                          const current = reportFromDate ? new Date(reportFromDate) : new Date()
                          current.setMonth(current.getMonth() - 1)
                          setReportFromDate(current.toISOString().split('T')[0])
                        }}
                        className="p-1 hover:bg-gray-100 rounded"
                      >
                        <ChevronLeft size={14} />
                      </button>
                      <span className="text-xs font-medium text-gray-700">
                        {reportFromDate ? new Date(reportFromDate).toLocaleString('default', { month: 'short', year: 'numeric' }) : 'Select Month'}
                      </span>
                      <button 
                        onClick={() => {
                          const current = reportFromDate ? new Date(reportFromDate) : new Date()
                          current.setMonth(current.getMonth() + 1)
                          setReportFromDate(current.toISOString().split('T')[0])
                        }}
                        className="p-1 hover:bg-gray-100 rounded"
                      >
                        <ChevronRight size={14} />
                      </button>
                    </div>
                    <input 
                      ref={fromDateInputRef}
                      type="date"
                      value={reportFromDate}
                      onChange={(e) => {
                        setReportFromDate(e.target.value)
                        closeAllDropdowns()
                      }}
                      className="w-full px-2.5 py-1.5 text-xs border border-gray-200 rounded"
                    />
                    <div className="flex justify-between gap-2 mt-2 pt-2 border-t border-gray-100">
                      <button 
                        onClick={() => {
                          setReportFromDate('')
                          closeAllDropdowns()
                        }}
                        className="text-xs text-gray-500 hover:text-gray-700"
                      >
                        Clear
                      </button>
                      <button 
                        onClick={() => closeAllDropdowns()}
                        className="text-xs bg-primary-600 text-white px-2.5 py-1 rounded hover:bg-primary-700 font-medium"
                      >
                        Done
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {/* To Date Dropdown */}
              <div className="relative" ref={toDateDropdownRef}>
                <button 
                  onClick={() => {
                    closeAllDropdowns()
                    setToDateDropdownOpen(true)
                  }}
                  className="flex items-center gap-2 px-3.5 py-1 bg-gray-50 border border-gray-200 rounded text-xs text-gray-700 hover:bg-gray-100 transition-colors h-[45px]"
                >
                  <Calendar size={14} className="text-gray-500 flex-shrink-0" />
                  <span className="font-medium whitespace-nowrap">
                    {reportToDate 
                      ? `To: ${new Date(reportToDate).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })}`
                      : 'To Date'
                    }
                  </span>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="flex-shrink-0">
                    <polyline points="6 9 12 15 18 9"/>
                  </svg>
                </button>
                
                {toDateDropdownOpen && (
                  <div className="absolute top-full left-0 mt-1 w-56 bg-white border border-gray-200 rounded-lg shadow-lg z-50 p-3">
                    <div className="flex items-center justify-between mb-2">
                      <button 
                        onClick={() => {
                          const current = reportToDate ? new Date(reportToDate) : new Date()
                          current.setMonth(current.getMonth() - 1)
                          setReportToDate(current.toISOString().split('T')[0])
                        }}
                        className="p-1 hover:bg-gray-100 rounded"
                      >
                        <ChevronLeft size={14} />
                      </button>
                      <span className="text-xs font-medium text-gray-700">
                        {reportToDate ? new Date(reportToDate).toLocaleString('default', { month: 'short', year: 'numeric' }) : 'Select Month'}
                      </span>
                      <button 
                        onClick={() => {
                          const current = reportToDate ? new Date(reportToDate) : new Date()
                          current.setMonth(current.getMonth() + 1)
                          setReportToDate(current.toISOString().split('T')[0])
                        }}
                        className="p-1 hover:bg-gray-100 rounded"
                      >
                        <ChevronRight size={14} />
                      </button>
                    </div>
                    <input 
                      ref={toDateInputRef}
                      type="date"
                      value={reportToDate}
                      onChange={(e) => {
                        setReportToDate(e.target.value)
                        closeAllDropdowns()
                      }}
                      className="w-full px-2.5 py-1.5 text-xs border border-gray-200 rounded"
                    />
                    <div className="flex justify-between gap-2 mt-2 pt-2 border-t border-gray-100">
                      <button 
                        onClick={() => {
                          setReportToDate('')
                          closeAllDropdowns()
                        }}
                        className="text-xs text-gray-500 hover:text-gray-700"
                      >
                        Clear
                      </button>
                      <button 
                        onClick={() => closeAllDropdowns()}
                        className="text-xs bg-primary-600 text-white px-2.5 py-1 rounded hover:bg-primary-700 font-medium"
                      >
                        Done
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {/* Category Dropdown */}
              <div className="relative" ref={categoryDropdownRef}>
                <button 
                  onClick={() => {
                    closeAllDropdowns()
                    setCategoryDropdownOpen(true)
                  }}
                  className="flex items-center gap-2 px-3.5 py-1 bg-gray-50 border border-gray-200 rounded text-xs text-gray-700 hover:bg-gray-100 transition-colors h-[45px]"
                >
                  <Filter size={14} className="text-gray-500 flex-shrink-0" />
                  <span className="font-medium whitespace-nowrap">{reportFilterCategory || 'All Categories'}</span>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="flex-shrink-0">
                    <polyline points="6 9 12 15 18 9"/>
                  </svg>
                </button>
                
                {categoryDropdownOpen && (
                  <div className="absolute top-full left-0 mt-1 w-52 bg-white border border-gray-200 rounded-lg shadow-lg z-50 max-h-48 overflow-y-auto">
                    <button 
                      onClick={() => { setReportFilterCategory(''); closeAllDropdowns(); }}
                      className={`w-full text-left px-3 py-2 text-xs hover:bg-gray-50 ${!reportFilterCategory ? 'bg-blue-50 text-blue-600 font-medium' : 'text-gray-700'}`}
                    >
                      All Categories
                    </button>
                    {categories.map(cat => (
                      <button 
                        key={cat}
                        onClick={() => { setReportFilterCategory(cat); closeAllDropdowns(); }}
                        className={`w-full text-left px-3 py-2 text-xs hover:bg-gray-50 ${reportFilterCategory === cat ? 'bg-blue-50 text-blue-600 font-medium' : 'text-gray-700'}`}
                      >
                        {cat}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Search Remarks */}
              <div className="flex-1 min-w-[160px] max-w-[220px]">
                <div className="relative h-[45px] flex items-center">
                  <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none flex-shrink-0" />
                  <input 
                    type="text" 
                    placeholder="Search remarks..."
                    value={reportFilterRemarks}
                    onChange={(e) => setReportFilterRemarks(e.target.value)}
                    className="w-full pl-8 pr-3 py-1 text-xs bg-gray-50 border border-gray-200 rounded focus:ring-1 focus:ring-primary-500 outline-none h-[45px]"
                  />
                </div>
              </div>

              {/* More Filters Dropdown */}
              <div className="relative" ref={moreDropdownRef}>
                <button 
                  onClick={() => {
                    const state = !moreDropdownOpen
                    closeAllDropdowns()
                    setMoreDropdownOpen(state)
                  }}
                  className={`flex items-center gap-2 px-3.5 py-1 border rounded text-xs font-medium transition-colors h-[45px] ${
                    moreDropdownOpen || (reportFilterProject || reportFilterType !== 'All' || reportFilterPayout !== 'All')
                      ? 'bg-primary-50 border-primary-300 text-primary-700' 
                      : 'bg-gray-50 border-gray-200 text-gray-700 hover:bg-gray-100'
                  }`}
                >
                  <SlidersHorizontal size={14} className="flex-shrink-0" />
                  <span>More</span>
                  {(reportFilterProject || reportFilterType !== 'All' || reportFilterPayout !== 'All') && (
                    <span className="w-2 h-2 rounded-full bg-primary-600 flex-shrink-0"></span>
                  )}
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="flex-shrink-0">
                    <polyline points="6 9 12 15 18 9"/>
                  </svg>
                </button>
                
                {moreDropdownOpen && (
                  <div className="absolute top-full right-0 mt-1 w-64 bg-white border border-gray-200 rounded-lg shadow-xl z-50 p-3 space-y-3">
                    <div className="text-[10px] font-bold text-gray-500 uppercase tracking-wider border-b border-gray-100 pb-1.5 flex justify-between items-center">
                      <span>More Filters</span>
                      <button onClick={() => setMoreDropdownOpen(false)} className="text-gray-400 hover:text-gray-600">
                        <X size={14} />
                      </button>
                    </div>

                    {/* Period Preset */}
                    <div>
                      <label className="block text-xs font-semibold text-gray-600 mb-1">Period Preset</label>
                      <select
                        value={(() => {
                          const check = (getRange) => {
                            const r = getRange()
                            return reportFromDate === r.from && reportToDate === r.to
                          }
                          if (check(() => { const d = new Date(); return { from: new Date(d.getFullYear(), d.getMonth(), 1).toISOString().slice(0,10), to: new Date(d.getFullYear(), d.getMonth() + 1, 0).toISOString().slice(0,10) } })) return 'this_month'
                          if (check(() => { const d = new Date(); const q = Math.floor(d.getMonth() / 3); return { from: new Date(d.getFullYear(), q * 3, 1).toISOString().slice(0,10), to: new Date(d.getFullYear(), q * 3 + 3, 0).toISOString().slice(0,10) } })) return 'this_quarter'
                          if (check(() => { const d = new Date(); const fy = d.getMonth() >= 3 ? d.getFullYear() : d.getFullYear() - 1; return { from: new Date(fy, 3, 1).toISOString().slice(0,10), to: new Date(fy + 1, 2, 31).toISOString().slice(0,10) } })) return 'current_fy'
                          if (check(() => { const d = new Date(); const q = Math.floor(d.getMonth() / 3) - 1; const yr = q < 0 ? d.getFullYear() - 1 : d.getFullYear(); const mq = q < 0 ? 9 : q * 3; return { from: new Date(yr, mq, 1).toISOString().slice(0,10), to: new Date(yr, mq + 3, 0).toISOString().slice(0,10) } })) return 'last_quarter'
                          if (check(() => { const d = new Date(); const fy = d.getMonth() >= 3 ? d.getFullYear() - 1 : d.getFullYear() - 2; return { from: new Date(fy, 3, 1).toISOString().slice(0,10), to: new Date(fy + 1, 2, 31).toISOString().slice(0,10) } })) return 'last_fy'
                          return ''
                        })()}
                        onChange={(e) => {
                          const val = e.target.value
                          if (!val) return
                          const getRangeMap = {
                            this_month: () => { const d = new Date(); return { from: new Date(d.getFullYear(), d.getMonth(), 1).toISOString().slice(0,10), to: new Date(d.getFullYear(), d.getMonth() + 1, 0).toISOString().slice(0,10) } },
                            this_quarter: () => { const d = new Date(); const q = Math.floor(d.getMonth() / 3); return { from: new Date(d.getFullYear(), q * 3, 1).toISOString().slice(0,10), to: new Date(d.getFullYear(), q * 3 + 3, 0).toISOString().slice(0,10) } },
                            current_fy: () => { const d = new Date(); const fy = d.getMonth() >= 3 ? d.getFullYear() : d.getFullYear() - 1; return { from: new Date(fy, 3, 1).toISOString().slice(0,10), to: new Date(fy + 1, 2, 31).toISOString().slice(0,10) } },
                            last_quarter: () => { const d = new Date(); const q = Math.floor(d.getMonth() / 3) - 1; const yr = q < 0 ? d.getFullYear() - 1 : d.getFullYear(); const mq = q < 0 ? 9 : q * 3; return { from: new Date(yr, mq, 1).toISOString().slice(0,10), to: new Date(yr, mq + 3, 0).toISOString().slice(0,10) } },
                            last_fy: () => { const d = new Date(); const fy = d.getMonth() >= 3 ? d.getFullYear() - 1 : d.getFullYear() - 2; return { from: new Date(fy, 3, 1).toISOString().slice(0,10), to: new Date(fy + 1, 2, 31).toISOString().slice(0,10) } },
                          }
                          if (getRangeMap[val]) {
                            const range = getRangeMap[val]()
                            setReportFromDate(range.from)
                            setReportToDate(range.to)
                            setReportMonth('')
                          }
                        }}
                        className="w-full px-2.5 py-1.5 text-xs bg-gray-50 border border-gray-200 rounded focus:ring-1 focus:ring-primary-500 outline-none cursor-pointer font-medium"
                      >
                        <option value="">Select Period Preset</option>
                        <option value="this_month">This Month</option>
                        <option value="this_quarter">This Quarter</option>
                        <option value="current_fy">Current FY</option>
                        <option value="last_quarter">Last Quarter</option>
                        <option value="last_fy">Last FY</option>
                      </select>
                    </div>

                    {/* Project Search */}
                    <div>
                      <label className="block text-xs font-semibold text-gray-600 mb-1">Project</label>
                      <div className="relative">
                        <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
                        <input 
                          type="text" 
                          placeholder="Search project..."
                          value={reportFilterProject}
                          onChange={(e) => setReportFilterProject(e.target.value)}
                          className="w-full pl-8 pr-2.5 py-1.5 text-xs bg-gray-50 border border-gray-200 rounded focus:ring-1 focus:ring-primary-500 outline-none"
                        />
                      </div>
                    </div>

                    {/* Type Filter */}
                    <div>
                      <label className="block text-xs font-semibold text-gray-600 mb-1">Transaction Type</label>
                      <select 
                        value={reportFilterType}
                        onChange={(e) => setReportFilterType(e.target.value)}
                        className="w-full px-2.5 py-1.5 text-xs bg-gray-50 border border-gray-200 rounded focus:ring-1 focus:ring-primary-500 outline-none cursor-pointer font-medium"
                      >
                        <option value="All">All Types</option>
                        <option value="Advance">Advances</option>
                        <option value="Expense">Expenses</option>
                      </select>
                    </div>

                    {/* Payout Filter */}
                    <div>
                      <label className="block text-xs font-semibold text-gray-600 mb-1">Payout Method</label>
                      <select 
                        value={reportFilterPayout}
                        onChange={(e) => setReportFilterPayout(e.target.value)}
                        className="w-full px-2.5 py-1.5 text-xs bg-gray-50 border border-gray-200 rounded focus:ring-1 focus:ring-primary-500 outline-none cursor-pointer font-medium"
                      >
                        <option value="All">All Payouts</option>
                        <option value="Immediate">Immediate</option>
                        <option value="With Salary">With Salary</option>
                      </select>
                    </div>
                  </div>
                )}
              </div>

              {/* Clear Filters */}
              {(reportFromDate || reportToDate || reportSelectedEmployees.length > 0 || reportFilterCategory || reportFilterRemarks || reportFilterTxn || reportFilterType !== 'All' || reportFilterPayout !== 'All' || reportFilterProject) && (
                <button 
                  onClick={clearAllFilters}
                  className="flex items-center gap-1 px-3 py-1 text-xs text-red-600 hover:bg-red-50 rounded transition-colors h-[45px] font-medium"
                  title="Clear all filters"
                >
                  <X size={14} />
                  Clear
                </button>
              )}

              {/* Recently Deleted Button */}
              <button 
                onClick={() => setShowDeletedModal(true)}
                className="h-[45px] px-3 bg-rose-50 text-rose-600 border border-rose-100 rounded-lg text-xs font-bold uppercase tracking-wider hover:bg-rose-100 transition-all flex items-center gap-1.5 ml-auto shrink-0"
              >
                <History size={14} /> Recently Deleted
              </button>
            </div>
          </div>
          
          {/* Totals Summary Row - Compact Stat Cards */}
          {reportApplied && (
            <div className="bg-white border border-gray-200 rounded-xl shadow-sm p-2.5 mb-4 flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center justify-center gap-x-2.5 gap-y-[5px] flex-wrap sm:mx-auto">
                {/* Advance Card */}
                <div className="bg-amber-50/70 border border-amber-200/70 rounded-lg px-3 py-[5px] flex flex-col justify-center">
                  <span className="text-[10px] font-normal text-black/90">Advance</span>
                  <span className="text-xs font-black text-emerald-600">
                    ₹{new Intl.NumberFormat('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(advForReport.reduce((sum, a) => sum + (parseFloat(a.amount) || 0), 0))}
                  </span>
                </div>

                {/* Expense Card */}
                <div className="bg-blue-50/70 border border-blue-200/70 rounded-lg px-3 py-[5px] flex flex-col justify-center">
                  <span className="text-[10px] font-normal text-black/90">Expense</span>
                  <span className="text-xs font-black text-rose-600">
                    ₹{new Intl.NumberFormat('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(expForReport.reduce((sum, e) => sum + (parseFloat(e.amount) || 0), 0))}
                  </span>
                </div>

                {/* Cash in hand Card */}
                <div className="bg-emerald-50/70 border border-emerald-200/70 rounded-lg px-3 py-[5px] flex flex-col justify-center">
                  <span className="text-[10px] font-normal text-black/90">Cash in hand</span>
                  <span className="text-xs font-black text-amber-600">
                    ₹{new Intl.NumberFormat('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(
                      advForReport.reduce((sum, a) => sum + (parseFloat(a.amount) || 0), 0) - 
                      expForReport.reduce((sum, e) => sum + (parseFloat(e.amount) || 0), 0)
                    )}
                  </span>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button 
                  onClick={handleScreenshot}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 text-white text-[11px] font-medium rounded hover:bg-blue-700 transition-colors"
                  title="Take Screenshot"
                >
                  <Camera size={14} />
                  Screenshot
                </button>
                <button 
                  onClick={exportPDF}
                  disabled={filteredEntries.length === 0}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 text-white text-[11px] font-medium rounded hover:bg-emerald-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  title="Export to PDF"
                >
                  <FileDown size={14} />
                  Export PDF
                </button>
                <button 
                  onClick={exportCSV}
                  disabled={filteredEntries.length === 0}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-orange-500 text-white text-[11px] font-medium rounded hover:bg-orange-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  title="Export to CSV"
                >
                  <FileDown size={14} />
                  Export CSV
                </button>
              </div>
            </div>
          )}
          
          {/* Reports Container for Screenshot */}
          <div ref={reportsContainerRef} className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Advances Panel */}
            <div className="bg-white border border-gray-300 overflow-hidden shadow-sm" style={{ fontFamily: 'Roboto, sans-serif' }}>
              <div className="px-3 py-2 bg-white border-b border-gray-300 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <h3 className="font-medium text-gray-800 text-[11px]">Advances</h3>
                  {reportApplied && (
                    <span className="text-[9px] font-medium text-gray-600 bg-white px-1.5 py-0.5 border border-gray-300">
                      Filtered
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-3">
                  <span className="bg-white px-2 py-0.5 text-[9px] font-medium text-gray-700 border border-gray-300">
                    {(reportApplied ? advForReport : advances).length} Records
                  </span>
                </div>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full border-collapse">
                  <thead>
                    <tr className="bg-white border-b border-gray-300">
                      <th className="px-2 py-1.5 text-[10.5px] font-medium text-gray-600 border-r border-gray-200 text-left w-[55px] tracking-[0.5px]">Date</th>
                      <th className="px-2 py-1.5 text-[10.5px] font-medium text-gray-600 border-r border-gray-200 text-left tracking-[0.5px]">Name</th>
                      <th className="px-2 py-1.5 text-[10.5px] font-medium text-gray-600 border-r border-gray-200 text-left tracking-[0.5px]">Category Type</th>
                      <th className="px-2 py-1.5 text-[10.5px] font-medium text-gray-600 border-r border-gray-200 text-left w-[190px] tracking-[0.5px]">Remarks</th>
                      <th className="px-2 py-1.5 text-[10.5px] font-medium text-gray-600 border-r border-gray-200 text-left w-[60px] tracking-[0.5px]">Amount</th>
                      <th className="px-2 py-1.5 text-[10.5px] font-medium text-gray-600 text-left w-[60px] tracking-[0.5px]">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(reportApplied ? advForReport : advances).length === 0 ? (
                      <tr>
                        <td colSpan={6} className="text-center py-8 text-gray-400 text-[10.5px] italic tracking-[0.5px]">
                          No records found for this criteria
                        </td>
                      </tr>
                    ) : (reportApplied ? advForReport : advances).map(a => (
                      <tr key={a.id} className="border-b border-gray-200 hover:bg-gray-50">
                        <td className="px-2 py-1.5 text-[10.5px] text-gray-700 border-r border-gray-200 tracking-[0.5px]">
                          {new Date(a.date).toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: '2-digit' })}
                        </td>
                        <td className="px-2 py-1.5 text-[10.5px] text-gray-700 border-r border-gray-200 font-medium tracking-[0.5px]">{a.employeeName}</td>
                        <td className="px-2 py-1.5 text-[10.5px] text-gray-700 border-r border-gray-200 tracking-[0.5px]">
                          <div className="flex flex-col gap-0.5">
                            <span className="font-medium">{a.category || a.type || '—'}</span>
                            {a.givenByEmployeeName && (
                              <span className="text-[9.5px] text-blue-700 font-medium leading-tight tracking-[0.5px]">
                                Given by {a.givenByEmployeeName}
                              </span>
                            )}
                            {a.requestType && (
                              <span className="text-[9.5px] text-gray-500 tracking-[0.5px]">{a.requestType}</span>
                            )}
                          </div>
                        </td>
                        <td className="px-2 py-1.5 text-[10.5px] text-gray-700 border-r border-gray-200 whitespace-normal break-words tracking-[0.5px]">{a.remarks || '—'}</td>
                        <td className="px-2 py-1.5 text-[10.5px] text-gray-900 font-medium border-r border-gray-200 tabular-nums w-[60px] tracking-[0.5px]">
                          <div className="flex flex-col">
                            <span>{new Intl.NumberFormat('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(a.amount)}</span>
                            {a.paidByName && (
                              <span className="text-[8.5px] text-gray-500 mt-0.5 tracking-[0.5px]">
                                {a.paidByName}
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="px-2 py-1.5">
                          <div className="flex items-center gap-0.5">
                            {a.requestType === 'Pre-Approval' && a.mdApproval === 'Approved' && (
                              <button 
                                onClick={() => { setFinalizingId(a.id); setFinalizeAmount(a.amount); }} 
                                className="text-emerald-600 hover:bg-emerald-50 p-0.5 transition-colors"
                                title="Submit Bill"
                              >
                                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                                  <polyline points="14 2 14 8 20 8"/>
                                  <path d="M9 15l2 2 4-4"/>
                                </svg>
                              </button>
                            )}
                            <button 
                              onClick={() => handleEdit(a)} 
                              className="text-amber-600 hover:bg-gray-100 p-0.5 transition-colors"
                              title="Edit & Revoke"
                            >
                              <Edit2 size={10} />
                            </button>
                            <button 
                              onClick={() => handleDelete(a.id)} 
                              className="text-red-600 hover:bg-gray-100 p-0.5 transition-colors"
                              title="Delete Transaction"
                            >
                              <Trash2 size={10} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Expenses Panel */}
            <div className="bg-white border border-gray-300 overflow-hidden shadow-sm" style={{ fontFamily: 'Roboto, sans-serif' }}>
              <div className="px-3 py-2 bg-white border-b border-gray-300 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <h3 className="font-medium text-gray-800 text-[11px]">Expenses</h3>
                  {reportApplied && (
                    <span className="text-[9px] font-medium text-gray-600 bg-white px-1.5 py-0.5 border border-gray-300">
                      Filtered
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-3">
                  <span className="bg-white px-2 py-0.5 text-[9px] font-medium text-gray-700 border border-gray-300">
                    {(reportApplied ? expForReport : expenses).length} Records
                  </span>
                </div>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full border-collapse">
                  <thead>
                    <tr className="bg-white border-b border-gray-300">
                      <th className="px-2 py-1.5 text-[10.5px] font-medium text-gray-600 border-r border-gray-200 text-left w-[55px] tracking-[0.5px]">Date</th>
                      <th className="px-2 py-1.5 text-[10.5px] font-medium text-gray-600 border-r border-gray-200 text-left tracking-[0.5px]">Name</th>
                      <th className="px-2 py-1.5 text-[10.5px] font-medium text-gray-600 border-r border-gray-200 text-left tracking-[0.5px]">Category Type</th>
                      <th className="px-2 py-1.5 text-[10.5px] font-medium text-gray-600 border-r border-gray-200 text-left w-[190px] tracking-[0.5px]">Remarks</th>
                      <th className="px-2 py-1.5 text-[10.5px] font-medium text-gray-600 border-r border-gray-200 text-left w-[60px] tracking-[0.5px]">Amount</th>
                      <th className="px-2 py-1.5 text-[10.5px] font-medium text-gray-600 text-left w-[50px] tracking-[0.5px]">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(reportApplied ? expForReport : expenses).length === 0 ? (
                      <tr>
                        <td colSpan={6} className="text-center py-8 text-gray-400 text-[10.5px] italic tracking-[0.5px]">
                          No records found for this criteria
                        </td>
                      </tr>
                    ) : (reportApplied ? expForReport : expenses).map(e => (
                      <tr key={e.id} className="border-b border-gray-200 hover:bg-gray-50">
                        <td className="px-2 py-1.5 text-[10.5px] text-gray-700 border-r border-gray-200 tracking-[0.5px]">
                          {new Date(e.date).toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: '2-digit' })}
                        </td>
                        <td className="px-2 py-1.5 text-[10.5px] text-gray-700 border-r border-gray-200 font-medium tracking-[0.5px]">{e.employeeName}</td>
                        <td className="px-2 py-1.5 text-[10.5px] text-gray-700 border-r border-gray-200 tracking-[0.5px]">
                          <div className="flex flex-col gap-0.5">
                            <span className="font-medium">{e.category || e.type || '—'}</span>
                            {(e.paidToName || e.paidToCustomName) && ((e.category && e.category.toLowerCase().includes('given to others')) || (e.paidToName || e.paidToCustomName) !== e.employeeName) && (
                              <span className="text-[9.5px] text-blue-700 font-medium leading-tight tracking-[0.5px]">
                                {e.employeeName} &rarr; {e.paidToName || e.paidToCustomName}
                              </span>
                            )}
                            {e.requestType && (
                              <span className="text-[9.5px] text-gray-500 tracking-[0.5px]">{e.requestType}</span>
                            )}
                          </div>
                        </td>
                        <td className="px-2 py-1.5 text-[10.5px] text-gray-700 border-r border-gray-200 whitespace-normal break-words tracking-[0.5px]">{e.remarks || '—'}</td>
                        <td className="px-2 py-1.5 text-[10.5px] text-gray-900 font-medium border-r border-gray-200 tabular-nums tracking-[0.5px]">
                          {new Intl.NumberFormat('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(e.amount)}
                        </td>
                        <td className="px-2 py-1.5">
                          <div className="flex items-center gap-0.5">
                            {e.requestType === 'Pre-Approval' && e.mdApproval === 'Approved' && (
                              <button 
                                onClick={() => { setFinalizingId(e.id); setFinalizeAmount(e.amount); }} 
                                className="text-emerald-600 hover:bg-emerald-50 p-0.5 transition-colors"
                                title="Submit Bill"
                              >
                                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                                  <polyline points="14 2 14 8 20 8"/>
                                  <path d="M9 15l2 2 4-4"/>
                                </svg>
                              </button>
                            )}
                            <button 
                              onClick={() => handleEdit(e)} 
                              className="text-amber-600 hover:bg-gray-100 p-0.5 transition-colors"
                              title="Edit & Revoke"
                            >
                              <Edit2 size={10} />
                            </button>
                            <button 
                              onClick={() => handleDelete(e.id)} 
                              className="text-red-600 hover:bg-gray-100 p-0.5 transition-colors"
                              title="Delete Transaction"
                            >
                              <Trash2 size={10} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Summary Module */}
      {activeModule === 'Summary' && (
        <div className="space-y-6">
          {loading ? (
            <div className="flex justify-center py-16">
              <Spinner />
            </div>
          ) : (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
                <div className="bg-gradient-to-br from-amber-50 to-white rounded-xl border border-amber-200 p-5 shadow-card">
                  <div className="flex items-center gap-2 text-amber-700 mb-3">
                    <PieChart size={20} />
                    <span className="text-sm font-medium">Advances</span>
                  </div>
                  <p className="text-2xl font-bold text-amber-900">{formatINR(summary.advSum)}</p>
                  <p className="text-xs text-amber-600 font-medium mt-1">{summary.advCount} records</p>
                </div>
                
                <div className="bg-gradient-to-br from-blue-50 to-white rounded-xl border border-blue-200 p-5 shadow-card">
                  <div className="flex items-center gap-2 text-blue-700 mb-3">
                    <PieChart size={20} />
                    <span className="text-sm font-medium">Expenses</span>
                  </div>
                  <p className="text-2xl font-bold text-blue-900">{formatINR(summary.expSum)}</p>
                  <p className="text-xs text-blue-600 font-medium mt-1">{summary.expCount} records</p>
                </div>
                
                <div className="bg-gradient-to-br from-violet-50 to-white rounded-xl border border-violet-200 p-5 shadow-card">
                  <div className="flex items-center gap-2 text-violet-700 mb-3">
                    <Clock size={20} />
                    <span className="text-sm font-medium">Awaiting Payment</span>
                  </div>
                  <p className="text-2xl font-bold text-violet-900">{formatINR(summary.awaitingPaymentSum)}</p>
                  <p className="text-xs text-violet-600 font-medium mt-1">{summary.awaitingPaymentCount} in queue</p>
                </div>
                
                <div className="bg-gradient-to-br from-emerald-50 to-white rounded-xl border border-emerald-200 p-5 shadow-card">
                  <div className="flex items-center gap-2 text-emerald-700 mb-3">
                    <CheckCircle2 size={20} />
                    <span className="text-sm font-medium">Paid Out</span>
                  </div>
                  <p className="text-2xl font-bold text-emerald-900">{formatINR(summary.paidSum)}</p>
                  <p className="text-xs text-emerald-600 font-medium mt-1">{summary.paidCount} settled</p>
                </div>

                <div className="bg-gradient-to-br from-indigo-50 to-white rounded-xl border border-indigo-200 p-5 shadow-card">
                  <div className="flex items-center gap-2 text-indigo-700 mb-3">
                    <Banknote size={20} />
                    <span className="text-sm font-medium">Accrued (Salary)</span>
                  </div>
                  <p className="text-2xl font-bold text-indigo-900">{formatINR(summary.accruedSum)}</p>
                  <p className="text-xs text-indigo-600 font-medium mt-1">{summary.accruedCount} awaiting payroll</p>
                </div>
              </div>

              <div className="bg-white rounded-xl border border-zinc-200 shadow-sm overflow-hidden">
                <div className="px-5 py-4 border-b border-zinc-100 bg-zinc-50/30">
                  <h3 className="text-base font-bold text-zinc-800">By Request Status</h3>
                  <p className="text-[11px] font-medium text-zinc-400 mt-1">
                    Counts and amounts across all advance & expense entries
                  </p>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse min-w-[480px]">
                    <thead>
                      <tr className="bg-zinc-50/80 border-b border-zinc-200">
                        <th className="h-10 px-4 text-[10px] font-black uppercase tracking-widest text-zinc-500 border-r border-zinc-200">Status</th>
                        <th className="h-10 px-4 text-[10px] font-black uppercase tracking-widest text-zinc-500 text-right border-r border-zinc-200">Count</th>
                        <th className="h-10 px-4 text-[10px] font-black uppercase tracking-widest text-zinc-500 text-right">Total Amount</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-50">
                      {Object.keys(summary.byStatus).length === 0 ? (
                        <tr>
                          <td colSpan={3} className="p-12 text-center text-zinc-300 font-bold uppercase italic tracking-widest opacity-40">
                            No entries yet
                          </td>
                        </tr>
                      ) : (
                        Object.entries(summary.byStatus)
                          .sort(([a], [b]) => (a || '').localeCompare(b || ''))
                          .map(([st, { count, sum }]) => (
                            <tr key={st} className="h-12 border-b border-zinc-50 hover:bg-zinc-50/50 transition-colors">
                              <td className="px-4 border-r border-zinc-50">
                                <span
                                  className={`inline-flex px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-tight ${
                                    st === 'Approved'
                                      ? 'bg-emerald-50 text-emerald-700 border border-emerald-100'
                                      : st === 'Rejected'
                                        ? 'bg-rose-50 text-rose-700 border border-rose-100'
                                        : st === 'Hold'
                                          ? 'bg-zinc-100 text-zinc-600 border border-zinc-200'
                                          : st === 'Partial'
                                            ? 'bg-indigo-50 text-indigo-700 border border-indigo-100'
                                            : 'bg-amber-50 text-amber-700 border border-amber-100'
                                  }`}
                                >
                                  {st}
                                </span>
                              </td>
                              <td className="px-4 text-right text-[13px] font-bold text-zinc-800 border-r border-zinc-50 tabular-nums">{count}</td>
                              <td className="px-4 text-right text-[13px] font-black text-zinc-900 tabular-nums">{formatINR(sum)}</td>
                            </tr>
                          ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )}
        </div>
      )}

      {/* Ledger Module */}
      {activeModule === 'Ledger' && (
        <div className="space-y-6">
          {loading ? (
            <div className="flex justify-center py-16">
              <Spinner />
            </div>
          ) : (
            <>
              <div className="rounded-[12px] border border-gray-100 bg-white px-4 pt-3 shadow-sm">
                <SubTabsNav
                  activeTabId={ledgerView}
                  onTabChange={(tab) => setLedgerView(tab.id)}
                  tabs={[{ id: 'employee', label: 'Employee wise' }, { id: 'all', label: 'All' }]}
                />
              </div>

              {ledgerView === 'employee' && (
                <>
                  <div className="rounded-[12px] border border-cyan-100 bg-cyan-50/60 p-5 shadow-sm">
                    <div className="mb-3 flex items-center gap-2 text-cyan-700"><Banknote size={20} /><span className="text-sm font-semibold">Total Outstanding Advances</span></div>
                    <p className="text-3xl font-black text-cyan-900">{formatINR(ledgerData.totalOutstanding)}</p>
                    <p className="mt-1 text-xs font-medium text-cyan-600">{ledgerData.employees.length} employee{ledgerData.employees.length !== 1 ? 's' : ''} with active advances</p>
                  </div>
                  {ledgerData.employees.length === 0 ? (
                    <div className="rounded-[12px] border border-gray-100 bg-white p-12 text-center shadow-sm"><Banknote size={40} className="mx-auto mb-3 text-zinc-300" /><p className="text-sm font-bold uppercase tracking-widest text-zinc-400">No outstanding advances</p></div>
                  ) : (
                    <div className="space-y-4">{ledgerData.employees.map((emp) => <EmployeeLedgerCard key={emp.id} emp={emp} formatINR={formatINR} />)}</div>
                  )}
                </>
              )}

              {ledgerView === 'all' && (
                <>
                  <div className="rounded-[12px] border border-gray-100 bg-white p-4 shadow-sm">
                    <p className="text-[11px] font-bold uppercase tracking-widest text-gray-400">Advance filters</p>
                    <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
                      <label className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Employee<div className="mt-1"><Dropdown value={ledgerEmployeeId} onChange={setLedgerEmployeeId} options={sortedEmployees.map((employee) => ({ value: employee.id, label: employee.name || employee.empCode || 'Employee' }))} placeholder="All employees" size="sm" searchable panelWidth="w-64" autoFocusSearch={false} /></div></label>
                      <label className="text-[10px] font-bold uppercase tracking-widest text-slate-400">From date<input type="date" value={ledgerFromDate} onChange={(event) => setLedgerFromDate(event.target.value)} className="mt-1 h-10 w-full rounded-lg border border-slate-200 px-3 text-sm font-medium text-slate-800 outline-none focus:border-indigo-500" /></label>
                      <label className="text-[10px] font-bold uppercase tracking-widest text-slate-400">To date<input type="date" value={ledgerToDate} onChange={(event) => setLedgerToDate(event.target.value)} className="mt-1 h-10 w-full rounded-lg border border-slate-200 px-3 text-sm font-medium text-slate-800 outline-none focus:border-indigo-500" /></label>
                      <label className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Category<div className="mt-1"><Dropdown value={ledgerCategory} onChange={setLedgerCategory} options={ledgerCategories} placeholder="All categories" size="sm" searchable panelWidth="w-64" autoFocusSearch={false} /></div></label>
                    </div>
                    <button type="button" onClick={() => { setLedgerEmployeeId(''); setLedgerFromDate(''); setLedgerToDate(''); setLedgerCategory(''); setLedgerPage(1); setLedgerShowAll(false) }} className="mt-3 text-xs font-semibold text-indigo-600 hover:text-indigo-800">Clear filters</button>
                  </div>
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                    <div className="rounded-[12px] border border-emerald-100 bg-emerald-50/70 p-4"><p className="text-[10px] font-bold uppercase tracking-widest text-emerald-700">Advance total</p><p className="mt-1 text-xl font-black tabular-nums text-emerald-900">{formatINR(ledgerTotals.advanceTotal)}</p></div>
                    <div className="rounded-[12px] border border-rose-100 bg-rose-50/70 p-4"><p className="text-[10px] font-bold uppercase tracking-widest text-rose-700">Expense total</p><p className="mt-1 text-xl font-black tabular-nums text-rose-900">{formatINR(ledgerTotals.expenseTotal)}</p></div>
                    <div className="rounded-[12px] border border-indigo-100 bg-indigo-50/70 p-4"><p className="text-[10px] font-bold uppercase tracking-widest text-indigo-700">Final balance</p><p className="mt-1 text-xl font-black tabular-nums text-indigo-900">{formatINR(ledgerTotals.finalBalance)}</p></div>
                  </div>
                  <div className="rounded-[12px] border border-gray-100 bg-white shadow-sm">
                    <div className="flex flex-col gap-3 border-b border-gray-100 px-4 py-3 sm:flex-row sm:items-center sm:justify-between"><div><p className="text-[10px] font-bold uppercase tracking-widest text-gray-400">All advances and expenses</p><p className="mt-0.5 text-sm font-semibold text-slate-900">{allLedgerEntries.length} record{allLedgerEntries.length !== 1 ? 's' : ''} · {ledgerShowAll ? 'Showing all filtered rows' : `Page ${ledgerPage} of ${ledgerPageCount}`}</p></div><div className="flex flex-wrap gap-2"><button type="button" onClick={exportLedgerPDF} disabled={!allLedgerEntries.length} className="inline-flex items-center gap-1.5 rounded-lg bg-slate-800 px-3 py-2 text-xs font-bold text-white hover:bg-slate-900 disabled:opacity-50"><FileDown size={14} /> Export PDF</button><button type="button" onClick={() => { setLedgerShowAll((value) => !value); setLedgerPage(1) }} className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50">{ledgerShowAll ? 'Use pages' : 'Show all'}</button></div></div>
                    {allLedgerEntries.length === 0 ? <p className="px-4 py-12 text-center text-sm text-slate-400">No advance or expense entries match these filters.</p> : <><div ref={ledgerTableRef} className="max-h-[560px] overflow-auto"><table className="min-w-[980px] w-full table-fixed text-left"><thead className="sticky top-0 z-10 bg-slate-50"><tr className="border-b border-gray-100 text-[10px] font-bold uppercase tracking-widest text-slate-400"><th className="w-[11%] px-4 py-3">Date</th><th className="w-[16%] px-4 py-3">Employee</th><th className="w-[10%] px-4 py-3">Type</th><th className="w-[14%] px-4 py-3">Category</th><th className="w-[14%] px-4 py-3">Transaction</th><th className="w-[9%] px-4 py-3 text-right">Amount</th><th className="w-[8%] px-4 py-3 text-right">Paid</th><th className="w-[10%] px-4 py-3 text-right">Balance</th><th className="w-[8%] px-4 py-3">Status</th></tr></thead><tbody style={{ display: 'block', height: `${ledgerVirtualizer.getTotalSize()}px`, position: 'relative' }}>{ledgerVirtualizer.getVirtualItems().map((virtualRow) => { const entry = ledgerVisibleEntries[virtualRow.index]; return <tr key={entry.id} className="text-sm text-slate-700" style={{ display: 'table', tableLayout: 'fixed', width: '100%', position: 'absolute', transform: `translateY(${virtualRow.start}px)`, height: `${virtualRow.size}px` }}><td className="w-[11%] px-4 py-3">{formatLedgerDate(entry.date)}</td><td className="w-[16%] px-4 py-3 font-medium text-slate-900">{entry.employeeName}</td><td className="w-[10%] px-4 py-3"><span className={`rounded-full px-2 py-1 text-[10px] font-bold uppercase tracking-wide ${entry.type === 'Expense' ? 'bg-violet-50 text-violet-700' : 'bg-cyan-50 text-cyan-700'}`}>{entry.type}</span></td><td className="w-[14%] px-4 py-3">{entry.category || '—'}</td><td className="w-[14%] px-4 py-3 font-mono text-xs">{entry.transactionNo || '—'}</td><td className="w-[9%] px-4 py-3 text-right font-medium">{formatINR(entry.amount)}</td><td className="w-[8%] px-4 py-3 text-right text-emerald-700">{formatINR(entry.paidAmount)}</td><td className="w-[10%] px-4 py-3 text-right font-bold">{formatINR(entry.balance)}</td><td className="w-[8%] px-4 py-3"><span className="rounded-full bg-slate-100 px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-slate-600">{entry.status || 'Pending'}</span></td></tr> })}</tbody></table></div>{!ledgerShowAll && <div className="flex items-center justify-between border-t border-gray-100 px-4 py-3"><p className="text-xs text-slate-500">Showing {ledgerVisibleEntries.length ? (ledgerPage - 1) * ledgerPageSize + 1 : 0}–{Math.min(ledgerPage * ledgerPageSize, allLedgerEntries.length)} of {allLedgerEntries.length}</p><div className="flex gap-2"><button type="button" onClick={() => setLedgerPage((page) => Math.max(1, page - 1))} disabled={ledgerPage === 1} className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 disabled:opacity-40">Previous</button><button type="button" onClick={() => setLedgerPage((page) => Math.min(ledgerPageCount, page + 1))} disabled={ledgerPage === ledgerPageCount} className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 disabled:opacity-40">Next</button></div></div>}</>}
                  </div>
                </>
              )}
            </>
          )}
        </div>
      )}

      {/* Escalation Module */}
      {activeModule === 'Escalation' && (
        <div className="space-y-6">
          {loading ? (
            <div className="flex justify-center py-16">
              <Spinner />
            </div>
          ) : (
            <>
              <p className="text-[11px] font-bold text-zinc-400 uppercase tracking-widest max-w-2xl">
                Requests that still need action in the approval chain. Use{' '}
                <span className="font-black text-indigo-600">Approvals</span> to resolve them.
              </p>

              {[
                {
                  key: 'needsHr',
                  title: 'Awaiting HR',
                  subtitle: 'Not yet submitted to MD',
                  rows: escalation.needsHr,
                  accent: 'border-l-4 border-l-indigo-500 bg-indigo-50/20'
                },
                {
                  key: 'needsMd',
                  title: 'Awaiting MD',
                  subtitle: 'HR approved — MD decision pending',
                  rows: escalation.needsMd,
                  accent: 'border-l-4 border-l-amber-500 bg-amber-50/20'
                },
                {
                  key: 'onHold',
                  title: 'On Hold',
                  subtitle: 'Paused pending clarification',
                  rows: escalation.onHold,
                  accent: 'border-l-4 border-l-zinc-400 bg-zinc-50/50'
                }
              ].map((block) => (
                <div
                  key={block.key}
                  className={`rounded-xl border border-zinc-200 bg-white shadow-sm overflow-hidden ${block.accent}`}
                >
                  <div className="px-5 py-4 border-b border-zinc-100 bg-white/60 flex items-start justify-between gap-4">
                    <div className="flex items-start gap-3">
                      <AlertTriangle className="text-amber-600 shrink-0 mt-0.5" size={20} />
                      <div>
                        <h3 className="text-sm font-black uppercase tracking-widest text-zinc-800">{block.title}</h3>
                        <p className="text-[10px] text-zinc-400 font-bold uppercase tracking-tight mt-1">{block.subtitle}</p>
                      </div>
                    </div>
                    <span className="text-[10px] font-black text-zinc-600 bg-zinc-100 px-2.5 py-1 rounded-full border border-zinc-200">
                      {block.rows.length}
                    </span>
                  </div>
                  <div className="bg-white overflow-x-auto">
                    {block.rows.length === 0 ? (
                      <p className="text-center text-zinc-300 font-bold uppercase italic tracking-widest py-12 opacity-40">None right now</p>
                    ) : (
                      <table className="w-full text-left border-collapse min-w-[640px]">
                        <thead>
                          <tr className="bg-zinc-50/80 border-b border-zinc-200 h-10">
                            <th className="px-4 text-[10px] font-black uppercase tracking-widest text-zinc-500 border-r border-zinc-100">Date</th>
                            <th className="px-4 text-[10px] font-black uppercase tracking-widest text-zinc-500 border-r border-zinc-100">Type</th>
                            <th className="px-4 text-[10px] font-black uppercase tracking-widest text-zinc-500 border-r border-zinc-100">Employee</th>
                            <th className="px-4 text-[10px] font-black uppercase tracking-widest text-zinc-500 text-right border-r border-zinc-100">Amount</th>
                            <th className="px-4 text-[10px] font-black uppercase tracking-widest text-zinc-500">HR</th>
                            <th className="px-4 text-[10px] font-black uppercase tracking-widest text-zinc-500">MD</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-zinc-50">
                          {block.rows.map((row) => (
                            <tr key={row.id} className="h-12 hover:bg-zinc-50/50 transition-colors">
                              <td className="px-4 text-[12px] font-bold text-zinc-600 border-r border-zinc-50">{row.date || '—'}</td>
                              <td className="px-4 border-r border-zinc-50">
                                {(() => {
                                  const cat = row.category || row.type || '—'
                                  const match = cat.match(/(.*?) \[(.*?)\]/)
                                  if (match) {
                                    return (
                                      <div className="flex flex-col">
                                        <span className={`text-[11px] font-bold ${row.type === 'Advance' ? 'text-amber-700' : 'text-indigo-700'}`}>{match[1]}</span>
                                        <span className="text-red-500 text-[9px] font-black uppercase tracking-tighter italic">[{match[2]}]</span>
                                      </div>
                                    )
                                  }
                                  return (
                                    <span
                                      className={`text-[9px] font-black uppercase tracking-tight px-2 py-0.5 rounded-md ${
                                        row.type === 'Advance' 
                                          ? 'bg-amber-100 text-amber-800' 
                                          : 'bg-indigo-100 text-indigo-800'
                                      }`}
                                    >
                                      {cat}
                                    </span>
                                  )
                                })()}
                              </td>
                              <td className="px-4 text-[13px] font-bold text-zinc-800 border-r border-zinc-50">{row.employeeName || '—'}</td>
                              <td className="px-4 text-right text-[13px] font-black text-zinc-900 border-r border-zinc-50 tabular-nums">{formatINR(effectiveAmount(row))}</td>
                              <td className="px-4 text-[10px] font-black uppercase border-r border-zinc-50">
                                <span className={approvalStatusTextClass(row.hrApproval, 'hr')}>{row.hrApproval || 'Pending'}</span>
                              </td>
                              <td className="px-4 text-[10px] font-black uppercase">
                                <span className={approvalStatusTextClass(row.mdApproval, 'md')}>{row.mdApproval || 'Pending'}</span>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                  </div>
                </div>
              ))}
            </>
          )}
        </div>
      )}

      {/* Approval Side Drawer - 30% width, minimalist */}
      {approvalDrawerOpen && (
        <div className="fixed inset-0 z-50 flex justify-end">
          {/* Backdrop */}
          <div 
            className="absolute inset-0 bg-black/20 transition-opacity"
            onClick={closeApprovalDrawer}
          />
          
          {/* Drawer Panel - 30% width */}
          <div className="relative w-[30%] min-w-[320px] max-w-[450px] bg-white shadow-2xl flex flex-col animate-in slide-in-from-right duration-200">
            {/* Drawer Header */}
            <div className="flex items-center justify-between px-3 py-2 border-b border-gray-200 bg-gray-50">
              <div className="flex items-center gap-2">
                <h2 className="text-sm font-bold text-gray-800">Just Submitted</h2>
                <span className="px-1.5 py-0.5 bg-blue-100 text-blue-700 text-[10px] font-semibold rounded">
                  {submittedItems.length}
                </span>
              </div>
              <button
                onClick={closeApprovalDrawer}
                className="p-1 hover:bg-gray-200 rounded transition-colors"
              >
                <X size={16} className="text-gray-500" />
              </button>
            </div>
            
            {/* Bulk Actions Bar */}
            <div className="px-3 py-2 border-b border-gray-200 bg-gray-50/50 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={selectedForApproval.length === submittedItems.length && submittedItems.length > 0}
                  onChange={toggleSelectAll}
                  className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                />
                <span className="text-[11px] text-gray-600">
                  {selectedForApproval.length > 0 ? `${selectedForApproval.length} selected` : 'Select all'}
                </span>
              </div>
              {selectedForApproval.length > 0 && (
                <div className="flex items-center gap-1">
                  {(isHR || isAdmin) && (
                    <select
                      onChange={(e) => {
                        if (e.target.value) {
                          bulkApprove('hr', e.target.value)
                          e.target.value = ''
                        }
                      }}
                      disabled={bulkProcessing}
                      className="px-2 py-1 bg-sky-600 text-white text-[10px] font-medium rounded hover:bg-sky-700 transition-colors disabled:opacity-50 cursor-pointer"
                      value=""
                    >
                      <option value="">HR Actions ({selectedForApproval.length})</option>
                      <option value="approve">✓ Approve All</option>
                      <option value="reject">✗ Reject All</option>
                      <option value="hold">⏸ Hold All</option>
                    </select>
                  )}
                  {(isMD || isAdmin) && (
                    <select
                      onChange={(e) => {
                        if (e.target.value) {
                          bulkApprove('md', e.target.value)
                          e.target.value = ''
                        }
                      }}
                      disabled={bulkProcessing}
                      className="px-2 py-1 bg-violet-600 text-white text-[10px] font-medium rounded hover:bg-violet-700 transition-colors disabled:opacity-50 cursor-pointer"
                      value=""
                    >
                      <option value="">MD Actions ({selectedForApproval.length})</option>
                      <option value="approve">✓ Approve All</option>
                      <option value="reject">✗ Reject All</option>
                      <option value="hold">⏸ Hold All</option>
                    </select>
                  )}
                </div>
              )}
            </div>
            
            {/* Drawer Content - Minimalist Table */}
            <div className="flex-1 overflow-y-auto">
              <table className="w-full text-[11px] border-collapse">
                <thead className="bg-gray-100 sticky top-0">
                  <tr className="border-b border-gray-200">
                    <th className="px-1 py-1.5 text-center font-semibold text-gray-600 w-8"></th>
                    <th className="px-2 py-1.5 text-left font-semibold text-gray-600">Date</th>
                    <th className="px-2 py-1.5 text-left font-semibold text-gray-600">Employee</th>
                    <th className="px-2 py-1.5 text-left font-semibold text-gray-600">Category</th>
                    <th className="px-2 py-1.5 text-right font-semibold text-gray-600">Amount</th>
                    <th className="px-1 py-1.5 text-center font-semibold text-gray-600 w-16">HR</th>
                    <th className="px-1 py-1.5 text-center font-semibold text-gray-600 w-16">MD</th>
                  </tr>
                </thead>
                <tbody>
                  {submittedItems.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="py-8 text-center text-gray-400 text-[11px]">
                        No items submitted
                      </td>
                    </tr>
                  ) : (
                    submittedItems.map((item, idx) => (
                      <tr 
                        key={item.id || idx} 
                        className={`border-b border-gray-100 ${item._approved ? 'bg-green-50/50' : selectedForApproval.includes(item.transactionNo) ? 'bg-blue-50/50' : 'hover:bg-gray-50'}`}
                      >
                        <td className="px-1 py-1.5 text-center">
                          <input
                            type="checkbox"
                            checked={selectedForApproval.includes(item.transactionNo)}
                            onChange={() => toggleItemSelection(item.transactionNo)}
                            className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                          />
                        </td>
                        <td className="px-2 py-1.5 font-mono text-[10px] text-gray-600 whitespace-nowrap">
                          {new Date(item.date).toLocaleDateString('en-GB', { 
                            day: '2-digit', 
                            month: 'short' 
                          })}
                        </td>
                        <td className="px-2 py-1.5 font-medium text-gray-800 truncate max-w-[80px]">
                          {item.employeeName}
                        </td>
                        <td className="px-2 py-1.5 text-gray-600 truncate max-w-[80px]">
                          {item.category}
                        </td>
                        <td className="px-2 py-1.5 text-right font-semibold text-indigo-600 tabular-nums">
                          ₹{Number(item.amount).toLocaleString('en-IN', { minimumFractionDigits: 0 })}
                        </td>
                        <td className="px-1 py-1.5 text-center">
                          {item.hrApproval === 'Approved' ? (
                            <span className="text-green-600 font-bold text-[12px]">✓</span>
                          ) : item.hrApproval === 'Rejected' ? (
                            <span className="text-red-600 font-bold text-[10px]">✗</span>
                          ) : item.hrApproval === 'Hold' ? (
                            <span className="text-amber-600 font-bold text-[10px]">⏸</span>
                          ) : (isHR || isAdmin) ? (
                            <select
                              onChange={(e) => {
                                if (e.target.value) {
                                  approveFromDrawer(item.transactionNo || item.id, 'hr', e.target.value)
                                  e.target.value = ''
                                }
                              }}
                              className="w-full px-1 py-0.5 bg-sky-600 text-white text-[9px] rounded hover:bg-sky-700 transition-colors cursor-pointer border-0 outline-none"
                              value=""
                            >
                              <option value="">Action</option>
                              <option value="approve">✓ Approve</option>
                              <option value="reject">✗ Reject</option>
                              <option value="hold">⏸ Hold</option>
                            </select>
                          ) : (
                            <span className="text-gray-400 text-[9px]">Pending</span>
                          )}
                        </td>
                        <td className="px-1 py-1.5 text-center">
                          {item.mdApproval === 'Approved' ? (
                            <span className="text-green-600 font-bold text-[12px]">✓</span>
                          ) : item.mdApproval === 'Rejected' ? (
                            <span className="text-red-600 font-bold text-[10px]">✗</span>
                          ) : item.mdApproval === 'Hold' ? (
                            <span className="text-amber-600 font-bold text-[10px]">⏸</span>
                          ) : (isMD || isAdmin) ? (
                            <select
                              onChange={(e) => {
                                if (e.target.value) {
                                  approveFromDrawer(item.transactionNo || item.id, 'md', e.target.value)
                                  e.target.value = ''
                                }
                              }}
                              className="w-full px-1 py-0.5 bg-violet-600 text-white text-[9px] rounded hover:bg-violet-700 transition-colors cursor-pointer border-0 outline-none"
                              value=""
                            >
                              <option value="">Action</option>
                              <option value="approve">✓ Approve</option>
                              <option value="reject">✗ Reject</option>
                              <option value="hold">⏸ Hold</option>
                            </select>
                          ) : (
                            <span className="text-gray-400 text-[9px]">Pending</span>
                          )}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
            
            {/* Drawer Footer */}
            <div className="px-3 py-2 border-t border-gray-200 bg-gray-50 flex justify-between items-center">
              <span className="text-[10px] text-gray-500">
                {submittedItems.filter(i => i._approved).length} of {submittedItems.length} approved
              </span>
              <button
                onClick={() => {
                  closeApprovalDrawer()
                  setActiveModule('Reports')
                }}
                className="px-3 py-1 bg-gray-800 text-white text-[11px] rounded hover:bg-gray-900 transition-colors"
              >
                View Reports
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Centered Smooth Animated Success Modal Overlay */}
      {successModal.open && createPortal(
        <div 
          className="fixed inset-0 z-[99999] flex items-center justify-center p-4 bg-black/30 animate-in fade-in duration-300"
          onClick={() => setSuccessModal({ open: false, title: '', message: '' })}
        >
          <div 
            className="bg-white text-slate-900 rounded-2xl p-7 shadow-2xl border border-slate-100 flex flex-col items-center justify-center text-center max-w-xs sm:max-w-sm w-full animate-in zoom-in-95 duration-300 transform transition-all"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Animated Green Circle with Checkmark Tick */}
            <div className="w-16 h-16 rounded-full bg-emerald-50 border-2 border-emerald-300 flex items-center justify-center text-emerald-600 mb-4 shadow-sm relative">
              <span className="absolute inset-0 rounded-full bg-emerald-400/20 animate-ping" />
              <Check size={36} className="stroke-[3] relative z-10 text-emerald-600" />
            </div>

            {/* Title: e.g. Expense Submitted */}
            <h3 className="text-lg font-extrabold text-slate-900 tracking-tight mb-1 font-heading">
              {successModal.title}
            </h3>

            {/* Message */}
            <p className="text-xs font-medium text-slate-500 mb-5 font-body">
              {successModal.message || 'Your submission has been recorded successfully.'}
            </p>

            {/* Done Button */}
            <button
              type="button"
              onClick={() => setSuccessModal({ open: false, title: '', message: '' })}
              className="w-full py-2.5 px-4 bg-emerald-600/75 hover:bg-emerald-600/90 active:scale-[0.98] text-white rounded-xl text-xs font-bold font-heading transition-all shadow-md shadow-emerald-200/50 cursor-pointer"
            >
              Done
            </button>
          </div>
        </div>,
        document.body
      )}
    </div>
  )
}
