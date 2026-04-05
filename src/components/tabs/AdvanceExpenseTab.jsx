import React, { useState, useEffect, useMemo, useRef } from 'react'
import { useAuth } from '../../hooks/useAuth'
import { useEmployees } from '../../hooks/useEmployees'
import { db } from '../../lib/firebase'
import { collection, addDoc, query, getDocs, serverTimestamp, orderBy, deleteDoc, doc, getDoc, updateDoc, where, setDoc } from 'firebase/firestore'
import { Trash2, FileDown, Edit2, PieChart, AlertTriangle, Clock, CheckCircle2, ChevronLeft, ChevronRight, Calendar, Search, Filter, RefreshCw, X, History, RotateCcw, Banknote, Camera } from 'lucide-react'
import Spinner from '../ui/Spinner'
import { formatINR } from '../../lib/salaryUtils'
import { jsPDF } from 'jspdf'
import autoTable from 'jspdf-autotable'
import html2canvas from 'html2canvas'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'

export default function AdvanceExpenseTab() {
  const { user } = useAuth()
  const { employees } = useEmployees(user?.orgId)
  const queryClient = useQueryClient()
  const [activeModule, setActiveModule] = useState('Reports')
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
  const [filteredEntries, setFilteredEntries] = useState([])
  const [reportApplied, setReportApplied] = useState(false)
  
  // Filter dropdown states
  const [employeeDropdownOpen, setEmployeeDropdownOpen] = useState(false)
  const [fromDateDropdownOpen, setFromDateDropdownOpen] = useState(false)
  const [toDateDropdownOpen, setToDateDropdownOpen] = useState(false)
  const [categoryDropdownOpen, setCategoryDropdownOpen] = useState(false)
  
  // Refs for dropdown containers
  const employeeDropdownRef = useRef(null)
  const fromDateDropdownRef = useRef(null)
  const toDateDropdownRef = useRef(null)
  const categoryDropdownRef = useRef(null)
  
  // Refs for date inputs to auto-open date picker
  const fromDateInputRef = useRef(null)
  const toDateInputRef = useRef(null)
  
  // Ref for reports container (screenshot)
  const reportsContainerRef = useRef(null)
  
  // Helper to close all dropdowns
  const closeAllDropdowns = () => {
    setEmployeeDropdownOpen(false)
    setFromDateDropdownOpen(false)
    setToDateDropdownOpen(false)
    setCategoryDropdownOpen(false)
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

  // Paid To Search/Filter State
  const [paidToDropdownOpen, setPaidToDropdownOpen] = useState(null) // stores rowId when open
  const [paidToSearchTerm, setPaidToSearchTerm] = useState('')

  // Side Drawer State for Approvals
  const [approvalDrawerOpen, setApprovalDrawerOpen] = useState(false)
  const [submittedItems, setSubmittedItems] = useState([]) // Store submitted items, not fetch all
  const [selectedForApproval, setSelectedForApproval] = useState([]) // Track selected items for bulk approval
  const [drawerLoading, setDrawerLoading] = useState(false)
  const [bulkProcessing, setBulkProcessing] = useState(false) // Track bulk approval processing
  
  // Recently Deleted State
  const [showDeletedModal, setShowDeletedModal] = useState(false)

  const isAdmin = user?.role?.toLowerCase() === 'admin'
  const isAccountant = user?.role?.toLowerCase() === 'accountant'
  const isHR = user?.role?.toLowerCase() === 'hr' || isAdmin
  const isMD = user?.role?.toLowerCase() === 'md' || isAdmin
  const canSelectAll = isAdmin || isAccountant

  // For editing
  const [editingId, setEditingId] = useState(null)
  const [editForm, setEditForm] = useState({})
  const [revokeAdvance, setRevokeAdvance] = useState(true)

  // For finalizing pre-approvals
  const [finalizingId, setFinalizingId] = useState(null)
  const [finalizeAmount, setFinalizeAmount] = useState('')

  // TanStack Query for fetching entries
  const { data: entries = [], isLoading: loading, refetch: fetchEntries } = useQuery({
    queryKey: ['advances_expenses', user?.orgId],
    queryFn: async () => {
      if (!user?.orgId) return []
      const q = query(
        collection(db, 'organisations', user.orgId, 'advances_expenses'),
        orderBy('date', 'desc')
      )
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

  // Mutations
  const addMutation = useMutation({
    mutationFn: async (newEntries) => {
      const generatedIds = []
      for (const row of newEntries) {
        const emp = employees.find(e => e.id === row.employeeId)
        let type = 'Expense'
        if (activeModule === 'Add Advance') type = 'Advance'
        else if (activeModule === 'Add Expense') type = 'Expense'
        else type = row.category.toLowerCase().includes('advance') ? 'Advance' : 'Expense'

        // Generate Professional Transaction No: TYPE-YYMMDD-RAND
        const datePart = new Date().toISOString().slice(2, 10).replace(/-/g, '')
        const randPart = Math.random().toString(36).substring(2, 6).toUpperCase()
        const txnNo = `${type.slice(0, 3).toUpperCase()}-${datePart}-${randPart}`
        generatedIds.push(txnNo)

        const finalCategory = row.transferredToName 
          ? `${row.category} [${row.transferredToName}]`
          : row.category

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
          status: 'Pending',
          approved_by: null,
          approved_at: null,
          hrApproval: 'Pending',
          mdApproval: 'Pending',
          createdBy: user.name || user.email,
          createdAt: serverTimestamp(),
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
    const me = employees.find(e => e.email === user.email || e.id === user.uid)
    return me ? me.id : ''
  }

  // Paid To Dropdown Component Helper
  const PaidToDropdown = ({ rowId, row, isMobile = false }) => {
    const isOpen = paidToDropdownOpen === rowId
    const triggerRef = React.useRef(null)
    const [dropdownPosition, setDropdownPosition] = React.useState({ top: 0, left: 0 })
    
    // Filter employees based on search term
    const filteredEmployees = useMemo(() => {
      if (!paidToSearchTerm.trim()) return employees
      return employees.filter(e => 
        e.name?.toLowerCase().includes(paidToSearchTerm.toLowerCase()) ||
        e.id?.toLowerCase().includes(paidToSearchTerm.toLowerCase())
      )
    }, [employees, paidToSearchTerm])
    
    // Calculate dropdown position when opened
    React.useLayoutEffect(() => {
      if (isOpen && triggerRef.current) {
        const rect = triggerRef.current.getBoundingClientRect()
        setDropdownPosition({
          top: rect.bottom + 4,
          left: rect.left
        })
      }
    }, [isOpen])
    
    const handleSelectEmployee = (empId) => {
      handleRowChange(rowId, 'paidTo', empId)
      setPaidToDropdownOpen(null)
      setPaidToSearchTerm('')
    }
    
    const handleSelectAddOther = () => {
      handleRowChange(rowId, 'paidToType', 'custom')
      setPaidToDropdownOpen(null)
      setPaidToSearchTerm('')
    }
    
    const handleClose = (e) => {
      e.stopPropagation()
      setPaidToDropdownOpen(null)
      setPaidToSearchTerm('')
    }
    
    // Get display value
    const getDisplayValue = () => {
      if (row.paidToType === 'custom' && row.paidToCustomName) {
        return row.paidToCustomName
      }
      if (row.paidTo) {
        const emp = employees.find(e => e.id === row.paidTo)
        return emp ? emp.name : row.paidTo
      }
      return isMobile ? 'Select paid to...' : 'Select...'
    }
    
    return (
      <div className="relative">
        {/* Trigger Button */}
        <button
          ref={triggerRef}
          type="button"
          onClick={() => {
            if (isOpen) {
              setPaidToDropdownOpen(null)
            } else {
              setPaidToDropdownOpen(rowId)
              setPaidToSearchTerm('')
            }
          }}
          className={`w-full border border-zinc-200 rounded-lg px-2 text-[12px] font-medium outline-none focus:ring-2 focus:ring-indigo-500 bg-white transition-colors flex items-center justify-between ${
            isMobile ? 'h-11 px-3 text-sm' : 'h-9'
          } ${row.paidToType === 'custom' ? 'text-indigo-600' : 'text-zinc-800'}`}
        >
          <span className="truncate">{getDisplayValue()}</span>
          <svg 
            className={`w-4 h-4 text-zinc-400 transition-transform ${isOpen ? 'rotate-180' : ''}`} 
            fill="none" 
            stroke="currentColor" 
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </button>
        
        {/* Dropdown Overlay - Fixed position to avoid scroll issues */}
        {isOpen && (
          <>
            {/* Backdrop */}
            <div 
              className="fixed inset-0 z-40"
              onClick={handleClose}
            />
            {/* Dropdown Panel */}
            <div 
              className={`fixed z-50 bg-white rounded-lg border border-zinc-200 shadow-xl ${
                isMobile ? 'w-[calc(100vw-3rem)] max-w-sm' : 'w-72'
              }`}
              style={{
                top: dropdownPosition.top,
                left: dropdownPosition.left
              }}
            >
              {/* Search Input */}
              <div className="p-2 border-b border-zinc-100">
                <div className="relative">
                  <Search className="absolute left-2 top-1/2 transform -translate-y-1/2 w-4 h-4 text-zinc-400" />
                  <input
                    type="text"
                    placeholder="Search employees..."
                    value={paidToSearchTerm}
                    onChange={(e) => setPaidToSearchTerm(e.target.value)}
                    className="w-full h-8 pl-8 pr-2 border border-zinc-200 rounded text-[12px] outline-none focus:ring-2 focus:ring-indigo-500"
                    autoFocus
                  />
                </div>
              </div>
              
              {/* Options List */}
              <div className="max-h-60 overflow-y-auto">
                {/* "Add Other..." Option */}
                <button
                  type="button"
                  onClick={handleSelectAddOther}
                  className={`w-full px-3 py-2 text-left text-[12px] font-medium text-indigo-600 hover:bg-indigo-50 flex items-center gap-2 border-b border-zinc-100 ${
                    row.paidToType === 'custom' ? 'bg-indigo-50' : ''
                  }`}
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                  </svg>
                  Add Other...
                </button>
                
                {/* Employee Options */}
                {filteredEmployees.length === 0 ? (
                  <div className="px-3 py-3 text-[12px] text-zinc-400 text-center">
                    No employees found
                  </div>
                ) : (
                  filteredEmployees.map(emp => (
                    <button
                      key={emp.id}
                      type="button"
                      onClick={() => handleSelectEmployee(emp.id)}
                      className={`w-full px-3 py-2 text-left text-[12px] hover:bg-zinc-50 flex items-center justify-between ${
                        row.paidTo === emp.id && row.paidToType === 'employee' ? 'bg-indigo-50 text-indigo-700' : 'text-zinc-700'
                      }`}
                    >
                      <span className="font-medium">{emp.name}</span>
                      {row.paidTo === emp.id && row.paidToType === 'employee' && (
                        <svg className="w-4 h-4 text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                        </svg>
                      )}
                    </button>
                  ))
                )}
              </div>
            </div>
          </>
        )}
        
        {/* Custom Name Input - shown when "Add Other..." is selected */}
        {row.paidToType === 'custom' && (
          <input
            type="text"
            value={row.paidToCustomName}
            onChange={(e) => handleRowChange(rowId, 'paidToCustomName', e.target.value)}
            placeholder="Enter recipient name..."
            className={`w-full border border-zinc-200 rounded-lg px-2 text-[12px] font-medium outline-none focus:ring-2 focus:ring-indigo-500 bg-white mt-1 ${
              isMobile ? 'h-11 px-3 text-sm' : 'h-9'
            }`}
          />
        )}
      </div>
    )
  }

  const [addRows, setAddRows] = useState([
    { id: Date.now(), date: new Date().toISOString().split('T')[0], employeeId: '', category: '', amount: '', reason: '', project: '', requestType: 'Reimbursement', payoutMethod: 'Immediate', transferredToName: '', paidTo: '', paidToType: 'employee', paidToCustomName: '' }
  ])

  useEffect(() => {
    if (!canSelectAll && employees.length > 0 && addRows.length === 1 && !addRows[0].employeeId) {
      const myId = getMyEmpId()
      if (myId) {
        setAddRows([{ ...addRows[0], employeeId: myId }])
      }
    }
  }, [employees, canSelectAll])

  const [submitting, setSubmitting] = useState(false)

  const modules = ['Add Advance', 'Add Expense', 'Escalation', 'Summary', 'Reports']
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
        const matchesEmployee = reportSelectedEmployees.length === 0 || 
          reportSelectedEmployees.some(empId => e.employeeId === empId)
        
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
        
        return matchesDate && matchesEmployee && matchesCategory && matchesRemarks && matchesTxn && matchesType && matchesPayout
      })
      
      setFilteredEntries(filtered)
      setReportApplied(true)
    }
    
    if (entries.length > 0) {
      autoApplyFilters()
    }
  }, [entries, reportFromDate, reportToDate, reportSelectedEmployees, reportFilterCategory, reportFilterRemarks, reportFilterTxn, reportFilterType, reportFilterPayout, reportMonth])

  // Close dropdowns when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      // Check if click is outside all dropdown containers
      const isOutsideEmployee = employeeDropdownRef.current && !employeeDropdownRef.current.contains(event.target)
      const isOutsideFromDate = fromDateDropdownRef.current && !fromDateDropdownRef.current.contains(event.target)
      const isOutsideToDate = toDateDropdownRef.current && !toDateDropdownRef.current.contains(event.target)
      const isOutsideCategory = categoryDropdownRef.current && !categoryDropdownRef.current.contains(event.target)
      
      // Only close if at least one dropdown is open and click is outside all of them
      if ((employeeDropdownOpen || fromDateDropdownOpen || toDateDropdownOpen || categoryDropdownOpen) &&
          isOutsideEmployee && isOutsideFromDate && isOutsideToDate && isOutsideCategory) {
        closeAllDropdowns()
      }
    }
    
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [employeeDropdownOpen, fromDateDropdownOpen, toDateDropdownOpen, categoryDropdownOpen])

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
    const myId = !canSelectAll ? getMyEmpId() : ''
    setAddRows([...addRows, { id: Date.now(), date: new Date().toISOString().split('T')[0], employeeId: myId, category: '', amount: '', reason: '', project: '', requestType: 'Reimbursement', payoutMethod: 'Immediate', transferredToName: '', paidTo: '', paidToType: 'employee', paidToCustomName: '' }])
  }

  const handleSelfExpense = () => {
    const currentUserEmp = employees.find(e => e.email === user.email || e.id === user.uid)
    const empId = currentUserEmp ? currentUserEmp.id : (user.uid || '')
    setAddRows(addRows.map(row => ({ ...row, employeeId: empId })))
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
    
    // All rows are valid
    const validRows = addRows
    
    // Pro Duplicate Detection
    const duplicates = []
    validRows.forEach(row => {
      const isDuplicate = entries.find(existing => 
        existing.employeeId === row.employeeId &&
        Number(existing.amount) === Number(row.amount) &&
        existing.date === row.date &&
        existing.category.toLowerCase().trim() === row.category.toLowerCase().trim() &&
        existing.status !== 'Rejected'
      )
      
      if (isDuplicate) {
        const emp = employees.find(e => e.id === row.employeeId)
        duplicates.push(`${emp?.name || 'Employee'} - ₹${row.amount} on ${row.date} (${row.category})`)
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
      
      // After successful submission, open drawer with submitted items
      if (result && result.length > 0) {
        // Transform submitted rows to match approval display format
        const justSubmitted = validRows.map((row, idx) => ({
          id: result[idx], // Transaction number
          transactionNo: result[idx],
          employeeName: employees.find(e => e.id === row.employeeId)?.name || 'Unknown',
          employeeId: row.employeeId,
          category: row.category,
          amount: row.amount,
          date: row.date,
          type: activeModule === 'Add Advance' ? 'Advance' : 'Expense',
          hrApproval: 'Pending',
          mdApproval: 'Pending',
          status: 'Pending',
          payoutMethod: row.payoutMethod,
          requestType: row.requestType,
          _isNew: true // Flag to identify just-submitted items
        }))
        
        console.log('Just submitted items:', justSubmitted)
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
      const docRef = doc(db, 'organisations', user.orgId, 'advances_expenses', docId)

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
            // Check if MD is also approved, then mark as fully approved
            const currentData = snap.docs[0].data()
            if (currentData.mdApproval === 'Approved') {
              updateData.status = 'Approved'
            }
          } else {
            updateData.mdApproval = 'Approved'
            updateData.mdApprovedBy = user.uid
            updateData.mdApprovedAt = serverTimestamp()
            // Check if HR is also approved, then mark as fully approved
            const currentData = snap.docs[0].data()
            if (currentData.hrApproval === 'Approved') {
              updateData.status = 'Approved'
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
    setReportMonth(new Date().toISOString().slice(0, 7))
  }

  const advForReport = useMemo(() => filteredEntries.filter(e => e.type === 'Advance'), [filteredEntries])
  const expForReport = useMemo(() => filteredEntries.filter(e => e.type === 'Expense'), [filteredEntries])

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
        button.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-camera"><path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z"/><circle cx="12" cy="13" r="3"/></svg> Screenshot PNG'
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
        button.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-camera"><path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z"/><circle cx="12" cy="13" r="3"/></svg> Screenshot PNG'
        button.disabled = false
      }
    }
  }

  const exportPDF = () => {
    try {
      // Validate data exists
      if (!filteredEntries || filteredEntries.length === 0) {
        alert('No data to export. Please apply filters first.')
        return
      }
      
      const doc = new jsPDF('landscape') // Use landscape for more columns
      
      // Title with date range
      let titleText = 'Advances & Expenses Report'
      try {
        if (reportFromDate && reportToDate) {
          const fromDate = new Date(reportFromDate)
          const toDate = new Date(reportToDate)
          if (!isNaN(fromDate.getTime()) && !isNaN(toDate.getTime())) {
            const from = fromDate.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
            const to = toDate.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
            titleText += ` (${from} - ${to})`
          }
        } else if (reportFromDate) {
          const fromDate = new Date(reportFromDate)
          if (!isNaN(fromDate.getTime())) {
            const from = fromDate.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
            titleText += ` (From ${from})`
          }
        } else if (reportToDate) {
          const toDate = new Date(reportToDate)
          if (!isNaN(toDate.getTime())) {
            const to = toDate.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
            titleText += ` (To ${to})`
          }
        } else {
          const [year, month] = reportMonth.split('-').map(Number)
          if (!isNaN(year) && !isNaN(month)) {
            const monthName = new Date(year, month - 1).toLocaleString('default', { month: 'long', year: 'numeric' })
            titleText += ` - ${monthName}`
          }
        }
      } catch (dateErr) {
        console.error('Date formatting error:', dateErr)
        // Continue with default title
      }
      
      doc.setFontSize(14)
      doc.text(titleText, 14, 15)
      
      // Filter summary
      const activeFilters = []
      if (reportSelectedEmployees.length > 0) activeFilters.push(`${reportSelectedEmployees.length} Employees`)
      if (reportFilterCategory) activeFilters.push(`Category: ${reportFilterCategory}`)
      if (reportFilterRemarks) activeFilters.push(`Remarks: "${reportFilterRemarks}"`)
      if (reportFilterType !== 'All') activeFilters.push(`Type: ${reportFilterType}`)
      if (reportFilterPayout !== 'All') activeFilters.push(`Payout: ${reportFilterPayout}`)
      
      if (activeFilters.length > 0) {
        doc.setFontSize(9)
        doc.text(`Filters: ${activeFilters.join(' | ')}`, 14, 22)
      }
      
      // Get filtered data safely
      const dataToUseAdv = advForReport || []
      const dataToUseExp = expForReport || []

      // Format date safely
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
      
      // Format amount safely
      const formatAmountSafe = (amount) => {
        try {
          const num = parseFloat(amount)
          if (isNaN(num)) return '0.00'
          return new Intl.NumberFormat('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(num)
        } catch {
          return '0.00'
        }
      }

      if (dataToUseAdv.length > 0) {
        doc.setFontSize(11)
        doc.text(`Advances (${dataToUseAdv.length} records)`, 14, 30)
        
        const advBody = dataToUseAdv.map(a => [
          formatDateSafe(a.date),
          a.employeeName || '—',
          a.category || '—',
          ((a.remarks || a.reason || '—').toString()).substring(0, 30),
          formatAmountSafe(a.amount),
          a.status || '—'
        ])
        
        autoTable(doc, {
          startY: 35,
          head: [['Date', 'Name', 'Category', 'Remarks', 'Amount', 'Status']],
          body: advBody,
          theme: 'grid',
          styles: { fontSize: 7, cellPadding: 1.5 },
          headStyles: { fillColor: [245, 158, 11], textColor: 255, fontSize: 8 },
          columnStyles: {
            0: { cellWidth: 25 },
            1: { cellWidth: 35 },
            2: { cellWidth: 30 },
            3: { cellWidth: 50 },
            4: { cellWidth: 25 },
            5: { cellWidth: 25 }
          }
        })
      }
      
      const finalY = (doc.lastAutoTable?.finalY || 30) + 10
      
      if (dataToUseExp.length > 0) {
        // Check if we need a new page
        if (finalY > 180 && dataToUseAdv.length > 0) {
          doc.addPage()
        }
        
        doc.setFontSize(11)
        const expTitleY = dataToUseAdv.length > 0 && finalY > 180 ? 15 : finalY
        doc.text(`Expenses (${dataToUseExp.length} records)`, 14, expTitleY)
        
        const expBody = dataToUseExp.map(e => [
          formatDateSafe(e.date),
          e.employeeName || '—',
          e.category || '—',
          ((e.remarks || e.reason || '—').toString()).substring(0, 30),
          formatAmountSafe(e.amount),
          e.paidToName || e.paidToCustomName || e.employeeName || '—',
          e.status || '—'
        ])
        
        autoTable(doc, {
          startY: dataToUseAdv.length > 0 && finalY > 180 ? 20 : finalY + 5,
          head: [['Date', 'Name', 'Category', 'Remarks', 'Amount', 'Paid To', 'Status']],
          body: expBody,
          theme: 'grid',
          styles: { fontSize: 7, cellPadding: 1.5 },
          headStyles: { fillColor: [37, 99, 235], textColor: 255, fontSize: 8 },
          columnStyles: {
            0: { cellWidth: 22 },
            1: { cellWidth: 30 },
            2: { cellWidth: 28 },
            3: { cellWidth: 45 },
            4: { cellWidth: 22 },
            5: { cellWidth: 30 },
            6: { cellWidth: 22 }
          }
        })
      }
      
      if (dataToUseAdv.length === 0 && dataToUseExp.length === 0) {
        doc.setFontSize(12)
        doc.text('No records found for the selected filters.', 14, 40)
      }
      
      // Generate filename with date range
      let filenameDate = reportMonth
      try {
        if (reportFromDate || reportToDate) {
          const from = reportFromDate ? reportFromDate.replace(/-/g, '') : 'start'
          const to = reportToDate ? reportToDate.replace(/-/g, '') : 'end'
          filenameDate = `${from}_to_${to}`
        }
      } catch (filenameErr) {
        filenameDate = new Date().toISOString().slice(0, 10)
      }
      
      doc.save(`Adv_Exp_Report_${filenameDate}.pdf`)
    } catch (err) {
      console.error('PDF Export Error:', err)
      console.error('Error stack:', err.stack)
      alert(`Failed to generate PDF. Error: ${err.message || 'Unknown error'}. Please check console for details.`)
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
              {employees.map(emp => (
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
                  {employees.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
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
                          <button 
                            onClick={() => handleRestore(item.id)}
                            disabled={restoreMutation.isPending}
                            className="h-8 px-4 bg-indigo-50 text-indigo-600 font-black rounded-lg text-[9px] uppercase tracking-widest hover:bg-indigo-600 hover:text-white transition-all flex items-center gap-2 ml-auto shadow-sm"
                          >
                            <RotateCcw size={14} /> Revoke
                          </button>
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
      <div className="sticky top-0 z-40 bg-white/80 backdrop-blur-lg border-b border-gray-200/80 shadow-sm">
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
                return 'bg-indigo-500 text-white border-indigo-500 shadow-lg shadow-indigo-500/25'
              }

              const getShortLabel = () => {
                if (mod === 'Add Advance') return 'Adv'
                if (mod === 'Add Expense') return 'Exp'
                if (mod === 'Escalation') return 'Esc'
                if (mod === 'Summary') return 'Sum'
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

      {/* Add Expense / Add Advance Module */}
      {(activeModule === 'Add Expense' || activeModule === 'Add Advance') && (
        <div className={`rounded-xl border overflow-hidden shadow-card transition-colors ${
          activeModule === 'Add Advance' 
            ? 'bg-amber-50/50 border-amber-200' 
            : 'bg-blue-50/50 border-blue-200'
        }`}>
          {/* Header */}
          <div className={`flex flex-col sm:flex-row justify-between items-start sm:items-center p-4 sm:p-5 border-b gap-3 transition-colors ${
            activeModule === 'Add Advance' 
              ? 'border-amber-100 bg-amber-100/50' 
              : 'border-blue-100 bg-blue-100/50'
          }`}>
            <h2 className="text-lg sm:text-xl font-bold text-gray-800">
              {activeModule === 'Add Advance' ? 'Add Advance' : 'Add Expenses'}
            </h2>
            
            <div className="flex items-center gap-2 w-full sm:w-auto">
              <button 
                onClick={handleSelfExpense} 
                className="flex-1 sm:flex-none h-10 px-3 sm:px-4 bg-white border border-gray-300 text-gray-700 font-medium rounded-lg text-sm shadow-sm hover:bg-gray-50 active:bg-gray-100 transition-all whitespace-nowrap"
              >
                Self
              </button>
              
              <button 
                onClick={handleAddRow} 
                className="flex-1 sm:flex-none h-10 px-3 sm:px-4 bg-white border border-teal-200 text-teal-600 font-medium rounded-lg text-sm hover:bg-teal-50 active:bg-teal-100 transition-all whitespace-nowrap"
              >
                + Add
              </button>
              
              <button 
                onClick={handleSubmitAll} 
                disabled={submitting} 
                className={`flex-1 sm:flex-none h-10 px-4 sm:px-6 text-white font-medium rounded-lg text-sm flex items-center justify-center gap-2 shadow-elevated transition-all disabled:opacity-50 disabled:cursor-not-allowed ${
                  activeModule === 'Add Advance'
                    ? 'bg-amber-600 hover:bg-amber-700 active:bg-amber-800'
                    : 'bg-blue-600 hover:bg-blue-700 active:bg-blue-800'
                }`}
              >
                {submitting ? <Spinner size="w-4 h-4" color="text-white" /> : 'Submit'}
              </button>
            </div>
          </div>

          {/* Desktop Spreadsheet View */}
          <div className="hidden md:block overflow-x-auto">
            <div className="border border-gray-300 bg-white shadow-sm" style={{ fontFamily: 'Segoe UI, Arial, sans-serif' }}>
              <table className="w-full border-collapse" style={{ fontSize: '11px' }}>
                <thead>
                  <tr className="bg-gray-100 border-b border-gray-300" style={{ height: '21px' }}>
                    <th className="px-2 text-left font-semibold text-gray-700 border-r border-gray-300 bg-gray-50" style={{ width: '100px', fontSize: '10px' }}>
                      Date
                    </th>
                    <th className="px-2 text-left font-semibold text-gray-700 border-r border-gray-300 bg-gray-50" style={{ width: '180px', fontSize: '10px' }}>
                      Employee
                    </th>
                    <th className="px-2 text-left font-semibold text-gray-700 border-r border-gray-300 bg-gray-50" style={{ width: '140px', fontSize: '10px' }}>
                      Category
                    </th>
                    {activeModule === 'Add Expense' && (
                      <th className="px-2 text-left font-semibold text-gray-700 border-r border-gray-300 bg-gray-50" style={{ width: '160px', fontSize: '10px' }} title="Required for 'Salary to others' and 'Given to others'">
                        Paid To *
                      </th>
                    )}
                    {activeModule === 'Add Expense' && (
                      <th className="px-2 text-left font-semibold text-gray-700 border-r border-gray-300 bg-gray-50" style={{ width: '100px', fontSize: '10px' }}>
                        Type
                      </th>
                    )}
                    <th className="px-2 text-left font-semibold text-gray-700 border-r border-gray-300 bg-gray-50" style={{ width: '100px', fontSize: '10px' }}>
                      Payout
                    </th>
                    <th className="px-2 text-right font-semibold text-gray-700 border-r border-gray-300 bg-gray-50" style={{ width: '100px', fontSize: '10px' }}>
                      Amount
                    </th>
                    <th className="px-2 text-left font-semibold text-gray-700 border-r border-gray-300 bg-gray-50" style={{ minWidth: '150px', fontSize: '10px' }}>
                      Remarks
                    </th>
                    <th className="px-2 text-left font-semibold text-gray-700 border-r border-gray-300 bg-gray-50" style={{ width: '100px', fontSize: '10px' }}>
                      Project
                    </th>
                    <th className="px-1 text-center font-semibold text-gray-700 bg-gray-50" style={{ width: '28px', fontSize: '10px' }}>
                      ×
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {addRows.map((row, idx) => (
                    <tr 
                      key={row.id} 
                      className="border-b border-gray-200 hover:bg-blue-50/30"
                      style={{ height: '21px' }}
                    >
                      <td className="px-1 border-r border-gray-200">
                        <input 
                          type="date" 
                          value={row.date} 
                          onChange={e => handleRowChange(row.id, 'date', e.target.value)} 
                          className="w-full border-0 px-1 py-0 text-[11px] outline-none focus:bg-yellow-50 bg-transparent" 
                          style={{ height: '19px' }}
                        />
                      </td>
                      <td className="px-1 border-r border-gray-200">
                        <select 
                          value={row.employeeId} 
                          onChange={e => handleRowChange(row.id, 'employeeId', e.target.value)} 
                          disabled={!canSelectAll}
                          className={`w-full border-0 px-1 py-0 text-[11px] outline-none focus:bg-yellow-50 bg-transparent ${!canSelectAll ? 'opacity-60' : ''}`}
                          style={{ height: '19px' }}
                        >
                          <option value="">Select...</option>
                          {employees.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
                        </select>
                      </td>
                      <td className="px-1 border-r border-gray-200">
                        <select
                          value={row.category} 
                          onChange={e => handleRowChange(row.id, 'category', e.target.value)} 
                          className="w-full border-0 px-1 py-0 text-[11px] outline-none focus:bg-yellow-50 bg-transparent cursor-pointer"
                          style={{ height: '19px' }}
                        >
                          <option value="">Select category...</option>
                          {categories.map(cat => (
                            <option key={cat} value={cat}>{cat}</option>
                          ))}
                          <option value="custom">+ Other (Type below)</option>
                        </select>
                        {row.category === 'custom' && (
                          <input 
                            type="text" 
                            value={row.customCategory || ''} 
                            onChange={e => handleRowChange(row.id, 'customCategory', e.target.value)} 
                            className="w-full border-0 px-1 py-0 text-[11px] outline-none focus:bg-yellow-50 bg-transparent mt-1"
                            style={{ height: '19px' }}
                            placeholder="Enter custom category..."
                            autoFocus
                          />
                        )}
                      </td>
                      {activeModule === 'Add Expense' && (
                        <td className="px-1 border-r border-gray-200">
                          <div style={{ transform: 'scale(0.85)', transformOrigin: 'left center' }}>
                            <PaidToDropdown rowId={row.id} row={row} isMobile={false} />
                          </div>
                        </td>
                      )}
                      {activeModule === 'Add Expense' && (
                        <td className="px-1 border-r border-gray-200">
                          <select 
                            value={row.requestType} 
                            onChange={e => handleRowChange(row.id, 'requestType', e.target.value)} 
                            className="w-full border-0 px-1 py-0 text-[10px] outline-none focus:bg-yellow-50 bg-transparent uppercase"
                            style={{ height: '19px' }}
                          >
                            <option value="Reimbursement">Spent</option>
                            <option value="Pre-Approval">Request</option>
                          </select>
                        </td>
                      )}
                      <td className="px-1 border-r border-gray-200">
                        <select 
                          value={row.payoutMethod} 
                          onChange={e => handleRowChange(row.id, 'payoutMethod', e.target.value)} 
                          className="w-full border-0 px-1 py-0 text-[10px] outline-none focus:bg-yellow-50 bg-transparent uppercase"
                          style={{ height: '19px' }}
                        >
                          <option value="Immediate">Immediate</option>
                          <option value="With Salary">Monthly</option>
                        </select>
                      </td>
                      <td className="px-1 border-r border-gray-200">
                        <input 
                          type="number" 
                          value={row.amount} 
                          onChange={e => handleRowChange(row.id, 'amount', e.target.value)} 
                          className="w-full border-0 px-1 py-0 text-[11px] text-right outline-none focus:bg-yellow-50 bg-transparent text-indigo-600 font-semibold"
                          style={{ height: '19px' }}
                          placeholder="0.00"
                        />
                      </td>
                      <td className="px-1 border-r border-gray-200">
                        <input 
                          type="text" 
                          value={row.reason} 
                          onChange={e => handleRowChange(row.id, 'reason', e.target.value)} 
                          className="w-full border-0 px-1 py-0 text-[11px] outline-none focus:bg-yellow-50 bg-transparent"
                          style={{ height: '19px' }}
                          placeholder="..."
                        />
                      </td>
                      <td className="px-1 border-r border-gray-200">
                        <input 
                          type="text" 
                          value={row.project} 
                          onChange={e => handleRowChange(row.id, 'project', e.target.value)} 
                          className="w-full border-0 px-1 py-0 text-[11px] outline-none focus:bg-yellow-50 bg-transparent"
                          style={{ height: '19px' }}
                          placeholder="..."
                        />
                      </td>
                      <td className="px-0 text-center">
                        <button 
                          onClick={() => setAddRows(addRows.filter(r => r.id !== row.id))} 
                          className="w-full h-full text-gray-400 hover:text-red-500 hover:bg-red-50 transition-colors flex items-center justify-center"
                          style={{ height: '21px' }}
                          title="Delete row"
                        >
                          <span className="text-[14px] leading-none">×</span>
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            
            {/* Spreadsheet Toolbar */}
            <div className="flex items-center justify-between mt-2 px-1">
              <div className="text-[10px] text-gray-500">
                {addRows.length} row{addRows.length !== 1 ? 's' : ''}
              </div>
              <div className="flex items-center gap-2">
                <kbd className="px-1.5 py-0.5 bg-gray-100 border border-gray-300 rounded text-[9px] text-gray-600">Tab</kbd>
                <span className="text-[10px] text-gray-500">to navigate</span>
              </div>
            </div>
          </div>

          {/* Mobile Card View */}
          <div className="md:hidden p-4 space-y-4">
            <datalist id="categories-list-mobile">
              {categories.map(cat => <option key={cat} value={cat} />)}
            </datalist>
            
            {addRows.map((row, idx) => (
              <div 
                key={row.id} 
                className={`bg-white rounded-xl border overflow-hidden shadow-sm ${
                  activeModule === 'Add Advance' ? 'border-amber-200' : 'border-blue-200'
                }`}
              >
                {/* Card Header */}
                <div className={`px-4 py-3 flex items-center justify-between ${
                  activeModule === 'Add Advance' 
                    ? 'bg-gradient-to-r from-amber-50 to-white border-b border-amber-100' 
                    : 'bg-gradient-to-r from-blue-50 to-white border-b border-blue-100'
                }`}>
                  <span className="text-sm font-bold text-gray-700">Entry #{idx + 1}</span>
                  <button 
                    onClick={() => setAddRows(addRows.filter(r => r.id !== row.id))}
                    className="p-2 text-gray-400 hover:text-rose-500 hover:bg-rose-50 rounded-lg transition-all"
                  >
                    <Trash2 size={18} />
                  </button>
                </div>
                
                {/* Card Body */}
                <div className="p-4 space-y-4">
                  {/* Date & Employee Row */}
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-1.5">
                        Date
                      </label>
                      <input 
                        type="date" 
                        value={row.date} 
                        onChange={e => handleRowChange(row.id, 'date', e.target.value)} 
                        className="w-full h-11 border border-gray-200 rounded-lg px-3 text-sm font-medium outline-none focus:ring-2 focus:ring-indigo-500 bg-white" 
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-1.5">
                        Employee
                      </label>
                      <select 
                        value={row.employeeId} 
                        onChange={e => handleRowChange(row.id, 'employeeId', e.target.value)} 
                        disabled={!canSelectAll}
                        className={`w-full h-11 border border-gray-200 rounded-lg px-3 text-sm font-medium outline-none focus:ring-2 focus:ring-indigo-500 bg-white ${!canSelectAll ? 'opacity-70 cursor-not-allowed' : ''}`}
                      >
                        <option value="">Select...</option>
                        {employees.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
                      </select>
                    </div>
                  </div>
                  
                  {/* Category */}
                  <div>
                    <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-1.5">
                      Category
                    </label>
                    <input 
                      list="categories-list-mobile" 
                      value={row.category} 
                      onChange={e => handleRowChange(row.id, 'category', e.target.value)} 
                      className="w-full h-11 border border-gray-200 rounded-lg px-3 text-sm font-medium outline-none focus:ring-2 focus:ring-indigo-500 bg-white" 
                      placeholder="Select or type category..."
                    />
                    {row.transferredToName && (
                      <p className="text-red-500 text-xs mt-1 font-medium">
                        → {row.transferredToName}
                      </p>
                    )}
                  </div>
                  
                  {/* Paid To - Only for Expense */}
                  {activeModule === 'Add Expense' && (
                    <div>
                      <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-1.5" title="Required for 'Salary to others' and 'Given to others' categories">
                        Paid To <span className="text-[8px] text-zinc-400 font-normal">*</span>
                      </label>
                      <PaidToDropdown rowId={row.id} row={row} isMobile={true} />
                    </div>
                  )}
                  
                  {/* Type & Payout Row - Only for Expense */}
                  {activeModule === 'Add Expense' && (
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-1.5">
                          Type
                        </label>
                        <select 
                          value={row.requestType} 
                          onChange={e => handleRowChange(row.id, 'requestType', e.target.value)} 
                          className="w-full h-11 border border-gray-200 rounded-lg px-3 text-xs font-bold uppercase bg-gray-50 outline-none focus:ring-2 focus:ring-indigo-500"
                        >
                          <option value="Reimbursement">Spent</option>
                          <option value="Pre-Approval">Request</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-1.5">
                          Payout
                        </label>
                        <select 
                          value={row.payoutMethod} 
                          onChange={e => handleRowChange(row.id, 'payoutMethod', e.target.value)} 
                          className="w-full h-11 border border-gray-200 rounded-lg px-3 text-xs font-bold uppercase bg-gray-50 outline-none focus:ring-2 focus:ring-indigo-500"
                        >
                          <option value="Immediate">Immediate</option>
                          <option value="With Salary">Monthly</option>
                        </select>
                      </div>
                    </div>
                  )}
                  
                  {/* Payout Only for Advance */}
                  {activeModule === 'Add Advance' && (
                    <div>
                      <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-1.5">
                        Payout Method
                      </label>
                      <select 
                        value={row.payoutMethod} 
                        onChange={e => handleRowChange(row.id, 'payoutMethod', e.target.value)} 
                        className="w-full h-11 border border-gray-200 rounded-lg px-3 text-sm font-bold uppercase bg-gray-50 outline-none focus:ring-2 focus:ring-indigo-500"
                      >
                        <option value="Immediate">Immediate</option>
                        <option value="With Salary">With Salary</option>
                      </select>
                    </div>
                  )}
                  
                  {/* Amount with Quick Toggle */}
                  <div>
                    <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-1.5">
                      Amount (₹)
                    </label>
                    <input 
                      type="number" 
                      value={row.amount} 
                      onChange={e => handleRowChange(row.id, 'amount', e.target.value)} 
                      className="w-full h-11 border border-gray-200 rounded-lg px-3 text-base font-bold text-indigo-600 outline-none focus:ring-2 focus:ring-indigo-500 bg-white mb-2" 
                      placeholder="0.00"
                    />
                    {/* Quick Amount Toggles */}
                    <div className="flex gap-2 flex-wrap">
                      {[500, 1000, 2000, 3000].map(amt => (
                        <button
                          key={amt}
                          onClick={() => handleRowChange(row.id, 'amount', amt.toString())}
                          className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                            row.amount === amt.toString()
                              ? activeModule === 'Add Advance'
                                ? 'bg-amber-500 text-white shadow-md'
                                : 'bg-blue-500 text-white shadow-md'
                              : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                          }`}
                        >
                          ₹{amt}
                        </button>
                      ))}
                    </div>
                  </div>
                  
                  {/* Remarks */}
                  <div>
                    <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-1.5">
                      Remarks
                    </label>
                    <input 
                      type="text" 
                      value={row.reason} 
                      onChange={e => handleRowChange(row.id, 'reason', e.target.value)} 
                      className="w-full h-11 border border-gray-200 rounded-lg px-3 text-sm font-medium outline-none focus:ring-2 focus:ring-indigo-500 bg-white" 
                      placeholder="Enter reason..."
                    />
                  </div>
                  
                  {/* Project */}
                  <div>
                    <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-1.5">
                      Project
                    </label>
                    <input 
                      type="text" 
                      value={row.project} 
                      onChange={e => handleRowChange(row.id, 'project', e.target.value)} 
                      className="w-full h-11 border border-gray-200 rounded-lg px-3 text-sm font-medium outline-none focus:ring-2 focus:ring-indigo-500 bg-white" 
                      placeholder="Enter project name..."
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Reports Module */}
      {activeModule === 'Reports' && (
        <div className="space-y-4">
          {/* Compact Filter Bar - Single Row */}
          <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-3">
            <div className="flex flex-wrap items-center gap-2" style={{ lineHeight: '15px' }}>
              
              {/* Employee Multi-Select Dropdown */}
              <div className="relative" ref={employeeDropdownRef}>
                <button 
                  onClick={() => {
                    closeAllDropdowns()
                    setEmployeeDropdownOpen(true)
                  }}
                  className="flex items-center gap-1.5 px-2.5 py-1 bg-gray-50 border border-gray-200 rounded text-[11px] text-gray-700 hover:bg-gray-100 transition-colors"
                  style={{ lineHeight: '15px' }}
                >
                  <span className="font-medium">
                    {reportSelectedEmployees.length === 0 
                      ? 'All Employees' 
                      : reportSelectedEmployees.length === 1 
                        ? employees.find(e => e.id === reportSelectedEmployees[0])?.name || '1 Selected'
                        : `${reportSelectedEmployees.length} Selected`
                    }
                  </span>
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <polyline points="6 9 12 15 18 9"/>
                  </svg>
                </button>
                
                {employeeDropdownOpen && (
                  <div className="absolute top-full left-0 mt-1 w-56 bg-white border border-gray-200 rounded-lg shadow-lg z-50 max-h-60 overflow-y-auto">
                    <div className="p-2 border-b border-gray-100">
                      <button 
                        onClick={() => {
                          setReportSelectedEmployees([])
                          closeAllDropdowns()
                        }}
                        className="text-[10px] text-blue-600 hover:underline"
                      >
                        Clear All
                      </button>
                    </div>
                    {employees.map(emp => (
                      <label key={emp.id} className="flex items-center gap-2 px-3 py-1.5 hover:bg-gray-50 cursor-pointer">
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
                          className="w-3.5 h-3.5 rounded border-gray-300"
                        />
                        <span className="text-[11px] text-gray-700">{emp.name}</span>
                      </label>
                    ))}
                    <div className="p-2 border-t border-gray-100">
                      <button 
                        onClick={() => closeAllDropdowns()}
                        className="w-full text-center text-[10px] bg-primary-600 text-white px-2 py-1 rounded hover:bg-primary-700"
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
                  className="flex items-center gap-1.5 px-2.5 py-1 bg-gray-50 border border-gray-200 rounded text-[11px] text-gray-700 hover:bg-gray-100 transition-colors"
                  style={{ lineHeight: '15px' }}
                >
                  <Calendar size={12} />
                  <span className="font-medium">
                    {reportFromDate 
                      ? `From: ${new Date(reportFromDate).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })}`
                      : 'From Date'
                    }
                  </span>
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
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
                      <span className="text-[11px] font-medium text-gray-700">
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
                      className="w-full px-2 py-1 text-[11px] border border-gray-200 rounded"
                    />
                    <div className="flex justify-between gap-2 mt-2 pt-2 border-t border-gray-100">
                      <button 
                        onClick={() => {
                          setReportFromDate('')
                          closeAllDropdowns()
                        }}
                        className="text-[10px] text-gray-500 hover:text-gray-700"
                      >
                        Clear
                      </button>
                      <button 
                        onClick={() => closeAllDropdowns()}
                        className="text-[10px] bg-primary-600 text-white px-2 py-1 rounded hover:bg-primary-700"
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
                  className="flex items-center gap-1.5 px-2.5 py-1 bg-gray-50 border border-gray-200 rounded text-[11px] text-gray-700 hover:bg-gray-100 transition-colors"
                  style={{ lineHeight: '15px' }}
                >
                  <Calendar size={12} />
                  <span className="font-medium">
                    {reportToDate 
                      ? `To: ${new Date(reportToDate).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })}`
                      : 'To Date'
                    }
                  </span>
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
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
                      <span className="text-[11px] font-medium text-gray-700">
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
                      className="w-full px-2 py-1 text-[11px] border border-gray-200 rounded"
                    />
                    <div className="flex justify-between gap-2 mt-2 pt-2 border-t border-gray-100">
                      <button 
                        onClick={() => {
                          setReportToDate('')
                          closeAllDropdowns()
                        }}
                        className="text-[10px] text-gray-500 hover:text-gray-700"
                      >
                        Clear
                      </button>
                      <button 
                        onClick={() => closeAllDropdowns()}
                        className="text-[10px] bg-primary-600 text-white px-2 py-1 rounded hover:bg-primary-700"
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
                  className="flex items-center gap-1.5 px-2.5 py-1 bg-gray-50 border border-gray-200 rounded text-[11px] text-gray-700 hover:bg-gray-100 transition-colors"
                  style={{ lineHeight: '15px' }}
                >
                  <Filter size={12} />
                  <span className="font-medium">{reportFilterCategory || 'All Categories'}</span>
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <polyline points="6 9 12 15 18 9"/>
                  </svg>
                </button>
                
                {categoryDropdownOpen && (
                  <div className="absolute top-full left-0 mt-1 w-48 bg-white border border-gray-200 rounded-lg shadow-lg z-50 max-h-48 overflow-y-auto">
                    <button 
                      onClick={() => { setReportFilterCategory(''); closeAllDropdowns(); }}
                      className={`w-full text-left px-3 py-1.5 text-[11px] hover:bg-gray-50 ${!reportFilterCategory ? 'bg-blue-50 text-blue-600' : 'text-gray-700'}`}
                    >
                      All Categories
                    </button>
                    {categories.map(cat => (
                      <button 
                        key={cat}
                        onClick={() => { setReportFilterCategory(cat); closeAllDropdowns(); }}
                        className={`w-full text-left px-3 py-1.5 text-[11px] hover:bg-gray-50 ${reportFilterCategory === cat ? 'bg-blue-50 text-blue-600' : 'text-gray-700'}`}
                      >
                        {cat}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Search Remarks */}
              <div className="flex-1 min-w-[150px] max-w-[200px]">
                <div className="relative">
                  <Search size={12} className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-400" />
                  <input 
                    type="text" 
                    placeholder="Search remarks..."
                    value={reportFilterRemarks}
                    onChange={(e) => setReportFilterRemarks(e.target.value)}
                    className="w-full pl-7 pr-2 py-1 text-[11px] bg-gray-50 border border-gray-200 rounded focus:ring-1 focus:ring-primary-500 outline-none"
                    style={{ lineHeight: '15px' }}
                  />
                </div>
              </div>

              {/* Type Filter */}
              <select 
                value={reportFilterType}
                onChange={(e) => setReportFilterType(e.target.value)}
                className="px-2 py-1 text-[11px] bg-gray-50 border border-gray-200 rounded focus:ring-1 focus:ring-primary-500 outline-none cursor-pointer"
                style={{ lineHeight: '15px' }}
              >
                <option value="All">All Types</option>
                <option value="Advance">Advances</option>
                <option value="Expense">Expenses</option>
              </select>

              {/* Payout Filter */}
              <select 
                value={reportFilterPayout}
                onChange={(e) => setReportFilterPayout(e.target.value)}
                className="px-2 py-1 text-[11px] bg-gray-50 border border-gray-200 rounded focus:ring-1 focus:ring-primary-500 outline-none cursor-pointer"
                style={{ lineHeight: '15px' }}
              >
                <option value="All">All Payouts</option>
                <option value="Immediate">Immediate</option>
                <option value="With Salary">With Salary</option>
              </select>

              {/* Clear Filters */}
              {(reportFromDate || reportToDate || reportSelectedEmployees.length > 0 || reportFilterCategory || reportFilterRemarks || reportFilterTxn || reportFilterType !== 'All' || reportFilterPayout !== 'All') && (
                <button 
                  onClick={clearAllFilters}
                  className="flex items-center gap-1 px-2 py-1 text-[10px] text-red-600 hover:bg-red-50 rounded transition-colors"
                  style={{ lineHeight: '15px' }}
                  title="Clear all filters"
                >
                  <X size={12} />
                  Clear
                </button>
              )}
            </div>
            
            {/* Active Filters Summary */}
            {(reportFromDate || reportToDate || reportSelectedEmployees.length > 0 || reportFilterCategory || reportFilterRemarks || reportFilterTxn || reportFilterType !== 'All' || reportFilterPayout !== 'All') && (
              <div className="flex flex-wrap items-center gap-1.5 mt-2 pt-2 border-t border-gray-100">
                <span className="text-[10px] text-gray-500">Active:</span>
                {reportSelectedEmployees.length > 0 && (
                  <span className="px-1.5 py-0.5 bg-blue-50 text-blue-700 text-[9px] rounded border border-blue-100">
                    {reportSelectedEmployees.length} Employees
                  </span>
                )}
                {(reportFromDate || reportToDate) && (
                  <span className="px-1.5 py-0.5 bg-green-50 text-green-700 text-[9px] rounded border border-green-100">
                    Date Range
                  </span>
                )}
                {reportFilterCategory && (
                  <span className="px-1.5 py-0.5 bg-purple-50 text-purple-700 text-[9px] rounded border border-purple-100">
                    {reportFilterCategory}
                  </span>
                )}
                {reportFilterRemarks && (
                  <span className="px-1.5 py-0.5 bg-amber-50 text-amber-700 text-[9px] rounded border border-amber-100">
                    Remarks: "{reportFilterRemarks}"
                  </span>
                )}
                {reportFilterType !== 'All' && (
                  <span className="px-1.5 py-0.5 bg-gray-100 text-gray-700 text-[9px] rounded border border-gray-200">
                    {reportFilterType}s
                  </span>
                )}
                {reportFilterPayout !== 'All' && (
                  <span className="px-1.5 py-0.5 bg-gray-100 text-gray-700 text-[9px] rounded border border-gray-200">
                    {reportFilterPayout}
                  </span>
                )}
              </div>
            )}
          </div>
          
          {/* Totals Summary Row - Between filters and tables */}
          {reportApplied && (
            <div className="bg-white border border-gray-200 rounded-lg shadow-sm p-3 mb-4 flex items-center justify-between">
              <div className="flex items-center gap-6 text-[11px]">
                <span className="text-gray-700">
                  <span className="font-semibold text-gray-900">Advance:</span>{' '}
                  <span className="font-semibold text-amber-600">{new Intl.NumberFormat('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(advForReport.reduce((sum, a) => sum + (parseFloat(a.amount) || 0), 0))}</span>
                </span>
                <span className="text-gray-700">
                  <span className="font-semibold text-gray-900">Expense:</span>{' '}
                  <span className="font-semibold text-blue-600">{new Intl.NumberFormat('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(expForReport.reduce((sum, e) => sum + (parseFloat(e.amount) || 0), 0))}</span>
                </span>
                <span className="text-gray-700">
                  <span className="font-semibold text-gray-900">Cash in hand:</span>{' '}
                  <span className="font-semibold text-emerald-600">{new Intl.NumberFormat('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(
                    advForReport.filter(a => a.paidByName).reduce((sum, a) => sum + (parseFloat(a.amount) || 0), 0) - 
                    expForReport.filter(e => e.paidToName || e.paidToCustomName).reduce((sum, e) => sum + (parseFloat(e.amount) || 0), 0)
                  )}</span>
                </span>
              </div>
              <div className="flex items-center gap-2">
                <button 
                  onClick={handleScreenshot}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 text-white text-[11px] font-medium rounded hover:bg-blue-700 transition-colors"
                  title="Take Screenshot"
                >
                  <Camera size={14} />
                  Screenshot PNG
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
                      <th className="px-2 py-1.5 text-[10px] font-medium text-gray-600 border-r border-gray-200 text-left w-[55px]">Date</th>
                      <th className="px-2 py-1.5 text-[10px] font-medium text-gray-600 border-r border-gray-200 text-left">Name</th>
                      <th className="px-2 py-1.5 text-[10px] font-medium text-gray-600 border-r border-gray-200 text-left">Category Type</th>
                      <th className="px-2 py-1.5 text-[10px] font-medium text-gray-600 border-r border-gray-200 text-left w-[190px]">Remarks</th>
                      <th className="px-2 py-1.5 text-[10px] font-medium text-gray-600 border-r border-gray-200 text-left w-[60px]">Amount</th>
                      <th className="px-2 py-1.5 text-[10px] font-medium text-gray-600 text-left w-[60px]">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(reportApplied ? advForReport : advances).length === 0 ? (
                      <tr>
                        <td colSpan={6} className="text-center py-8 text-gray-400 text-[10px] italic">
                          No records found for this criteria
                        </td>
                      </tr>
                    ) : (reportApplied ? advForReport : advances).map(a => (
                      <tr key={a.id} className="border-b border-gray-200 hover:bg-gray-50">
                        <td className="px-2 py-1.5 text-[10px] text-gray-700 border-r border-gray-200">
                          {new Date(a.date).toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: '2-digit' })}
                        </td>
                        <td className="px-2 py-1.5 text-[10px] text-gray-700 border-r border-gray-200 font-medium">{a.employeeName}</td>
                        <td className="px-2 py-1.5 text-[10px] text-gray-700 border-r border-gray-200">
                          <div className="flex flex-col">
                            <span>{a.category || a.type || '—'}</span>
                            {a.requestType && (
                              <span className="text-[9px] text-gray-500">{a.requestType}</span>
                            )}
                          </div>
                        </td>
                        <td className="px-2 py-1.5 text-[10px] text-gray-700 border-r border-gray-200">{a.remarks || '—'}</td>
                        <td className="px-2 py-1.5 text-[10px] text-gray-900 font-medium border-r border-gray-200 tabular-nums w-[60px]">
                          <div className="flex flex-col">
                            <span>{new Intl.NumberFormat('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(a.amount)}</span>
                            {a.paidByName && (
                              <span className="text-[8px] text-gray-500 mt-0.5">
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
                      <th className="px-2 py-1.5 text-[10px] font-medium text-gray-600 border-r border-gray-200 text-left w-[55px]">Date</th>
                      <th className="px-2 py-1.5 text-[10px] font-medium text-gray-600 border-r border-gray-200 text-left">Name</th>
                      <th className="px-2 py-1.5 text-[10px] font-medium text-gray-600 border-r border-gray-200 text-left">Category Type</th>
                      <th className="px-2 py-1.5 text-[10px] font-medium text-gray-600 border-r border-gray-200 text-left w-[190px]">Remarks</th>
                      <th className="px-2 py-1.5 text-[10px] font-medium text-gray-600 border-r border-gray-200 text-left w-[60px]">Amount</th>
                      <th className="px-2 py-1.5 text-[10px] font-medium text-gray-600 border-r border-gray-200 text-left">Paid To</th>
                      <th className="px-2 py-1.5 text-[10px] font-medium text-gray-600 text-left w-[50px]">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(reportApplied ? expForReport : expenses).length === 0 ? (
                      <tr>
                        <td colSpan={7} className="text-center py-8 text-gray-400 text-[10px] italic">
                          No records found for this criteria
                        </td>
                      </tr>
                    ) : (reportApplied ? expForReport : expenses).map(e => (
                      <tr key={e.id} className="border-b border-gray-200 hover:bg-gray-50">
                        <td className="px-2 py-1.5 text-[10px] text-gray-700 border-r border-gray-200">
                          {new Date(e.date).toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: '2-digit' })}
                        </td>
                        <td className="px-2 py-1.5 text-[10px] text-gray-700 border-r border-gray-200 font-medium">{e.employeeName}</td>
                        <td className="px-2 py-1.5 text-[10px] text-gray-700 border-r border-gray-200">
                          <div className="flex flex-col">
                            <span>{e.category || e.type || '—'}</span>
                            {e.requestType && (
                              <span className="text-[9px] text-gray-500">{e.requestType}</span>
                            )}
                          </div>
                        </td>
                         <td className="px-2 py-1.5 text-[10px] text-gray-700 border-r border-gray-200">{e.remarks || '—'}</td>
                        <td className="px-2 py-1.5 text-[10px] text-gray-900 font-medium border-r border-gray-200 tabular-nums">
                          {new Intl.NumberFormat('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(e.amount)}
                        </td>
                        <td className="px-2 py-1.5 text-[10px] text-gray-700 border-r border-gray-200">
                          {e.paidToName || e.paidToCustomName || e.employeeName}
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
                          .sort(([a], [b]) => a.localeCompare(b))
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
    </div>
  )
}