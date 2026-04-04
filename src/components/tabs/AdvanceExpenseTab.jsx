import React, { useState, useEffect, useMemo } from 'react'
import { useAuth } from '../../hooks/useAuth'
import { useEmployees } from '../../hooks/useEmployees'
import { db } from '../../lib/firebase'
import { collection, addDoc, query, getDocs, serverTimestamp, orderBy, deleteDoc, doc, getDoc, updateDoc, where, setDoc } from 'firebase/firestore'
import { Trash2, FileDown, Edit2, PieChart, AlertTriangle, Clock, CheckCircle2, ChevronLeft, ChevronRight, Calendar, Search, Filter, RefreshCw, X, History, RotateCcw, Banknote } from 'lucide-react'
import Spinner from '../ui/Spinner'
import { formatINR } from '../../lib/salaryUtils'
import jsPDF from 'jspdf'
import 'jspdf-autotable'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'

export default function AdvanceExpenseTab() {
  const { user } = useAuth()
  const { employees } = useEmployees(user?.orgId)
  const queryClient = useQueryClient()
  const [activeModule, setActiveModule] = useState('Reports')
  const [categories, setCategories] = useState(['Salary Advance', 'Travel', 'Medical'])
  
  // Reports Filter States
  const [reportMonth, setReportMonth] = useState(new Date().toISOString().slice(0, 7)) // YYYY-MM
  const [reportFilterName, setReportFilterName] = useState('')
  const [reportFilterCategory, setReportFilterCategory] = useState('')
  const [reportFilterTxn, setReportFilterTxn] = useState('')
  const [reportFilterType, setReportFilterType] = useState('All') // All | Advance | Expense
  const [reportFilterPayout, setReportFilterPayout] = useState('All') // All | Immediate | With Salary
  const [filteredEntries, setFilteredEntries] = useState([])
  const [reportApplied, setReportApplied] = useState(false)
  
  // Transferred To Modal State
  const [transferModalRowId, setTransferModalRowId] = useState(null)

  // Recently Deleted State
  const [showDeletedModal, setShowDeletedModal] = useState(false)

  const isAdmin = user?.role?.toLowerCase() === 'admin'
  const isAccountant = user?.role?.toLowerCase() === 'accountant'
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

        await addDoc(collection(db, 'organisations', user.orgId, 'advances_expenses'), {
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
          createdAt: serverTimestamp()
        })
      }
      return generatedIds
    },
    onSuccess: (txnNos) => {
      queryClient.invalidateQueries(['advances_expenses', user?.orgId])
      setAddRows([{ id: Date.now(), date: new Date().toISOString().split('T')[0], employeeId: !canSelectAll ? getMyEmpId() : '', category: '', amount: '', reason: '', project: '', requestType: 'Reimbursement', payoutMethod: 'Immediate', transferredToName: '' }])
      const typeLabel = activeModule === 'Add Advance' ? 'Advance' : 'Expense'
      const msg = `${typeLabel} submitted for approval.\n\nRef Nos: ${txnNos.join(', ')}`
      alert(msg)
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

  const [addRows, setAddRows] = useState([
    { id: Date.now(), date: new Date().toISOString().split('T')[0], employeeId: '', category: '', amount: '', reason: '', project: '', requestType: 'Reimbursement', payoutMethod: 'Immediate', transferredToName: '' }
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

  const handleAddRow = () => {
    const myId = !canSelectAll ? getMyEmpId() : ''
    setAddRows([...addRows, { id: Date.now(), date: new Date().toISOString().split('T')[0], employeeId: myId, category: '', amount: '', reason: '', project: '', requestType: 'Reimbursement', payoutMethod: 'Immediate', transferredToName: '' }])
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
    const validRows = addRows.filter(r => r.employeeId && r.amount && r.category)
    if (validRows.length === 0) return alert('Please fill in required fields (Employee, Category, Amount) for at least one row.')
    
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
      await addMutation.mutateAsync(validRows)
    } catch (err) {
      console.error('Submission error:', err)
      alert(`Failed to save: ${err.message}`)
    } finally {
      setSubmitting(false)
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
    const filtered = entries.filter(e => {
      const matchesMonth = e.date && e.date.startsWith(reportMonth)
      const matchesName = !reportFilterName || (e.employeeName && e.employeeName.toLowerCase().includes(reportFilterName.toLowerCase()))
      const matchesCategory = !reportFilterCategory || (e.category && e.category.toLowerCase().includes(reportFilterCategory.toLowerCase()))
      const matchesTxn = !reportFilterTxn || (e.transactionNo && e.transactionNo.toLowerCase().includes(reportFilterTxn.toLowerCase()))
      const matchesType = reportFilterType === 'All' || e.type === reportFilterType
      const matchesPayout = reportFilterPayout === 'All' || e.payoutMethod === reportFilterPayout
      
      return matchesMonth && matchesName && matchesCategory && matchesTxn && matchesType && matchesPayout
    })
    setFilteredEntries(filtered)
    setReportApplied(true)
  }

  const advForReport = useMemo(() => filteredEntries.filter(e => e.type === 'Advance'), [filteredEntries])
  const expForReport = useMemo(() => filteredEntries.filter(e => e.type === 'Expense'), [filteredEntries])

  const exportPDF = () => {
    try {
      const doc = new jsPDF()
      const [year, month] = reportMonth.split('-').map(Number)
      const monthName = new Date(year, month - 1).toLocaleString('default', { month: 'long' })
      
      doc.setFontSize(16)
      doc.text(`Advances & Expenses Report - ${monthName} ${year}`, 14, 15)
      if (reportApplied && (reportFilterName || reportFilterCategory || reportFilterTxn)) {
        doc.setFontSize(10)
        doc.text(`Filters: ${[reportFilterName, reportFilterCategory, reportFilterTxn].filter(Boolean).join(', ')}`, 14, 22)
      }
      
      const dataToUseAdv = reportApplied ? advForReport : entries.filter(e => e.type === 'Advance' && e.date?.startsWith(reportMonth))
      const dataToUseExp = reportApplied ? expForReport : entries.filter(e => e.type === 'Expense' && e.date?.startsWith(reportMonth))

      if (dataToUseAdv.length > 0) {
        doc.setFontSize(12)
        doc.text('Advances', 14, 30)
        doc.autoTable({
          startY: 35,
          head: [['Ref No', 'Date', 'Employee', 'Category', 'Amount', 'Status']],
          body: dataToUseAdv.map(a => [a.transactionNo || '—', a.date, a.employeeName, a.category, formatINR(a.amount), a.status]),
          theme: 'grid',
          styles: { fontSize: 7 },
          headStyles: { fillColor: [245, 158, 11] } // Amber-500
        })
      }
      
      const finalY = (doc.lastAutoTable?.finalY || 30) + 10
      
      if (dataToUseExp.length > 0) {
        doc.setFontSize(12)
        doc.text('Expenses', 14, finalY)
        doc.autoTable({
          startY: finalY + 5,
          head: [['Ref No', 'Date', 'Employee', 'Category', 'Amount', 'Status']],
          body: dataToUseExp.map(e => [e.transactionNo || '—', e.date, e.employeeName, e.category, formatINR(e.amount), e.status]),
          theme: 'grid',
          styles: { fontSize: 7 },
          headStyles: { fillColor: [37, 99, 235] } // Blue-600
        })
      }
      
      doc.save(`Adv_Exp_Report_${reportMonth}.pdf`)
    } catch (err) {
      console.error('PDF Export Error:', err)
      alert('Failed to generate PDF. Please try again.')
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

          {/* Desktop Table View */}
          <div className="hidden md:block overflow-x-auto p-5">
            <div className="rounded-lg border border-zinc-200 bg-white text-zinc-950 shadow-sm">
              <table className="w-full text-left border-collapse min-w-[1000px]">
                <thead>
                  <tr className="bg-zinc-50/80 border-b border-zinc-200">
                    <th className="h-10 px-3 text-left align-middle text-[10px] font-black uppercase tracking-widest text-zinc-500 border-r border-zinc-200 w-[140px]">
                      Request Date
                    </th>
                    <th className="h-10 px-3 text-left align-middle text-[10px] font-black uppercase tracking-widest text-zinc-500 border-r border-zinc-200 w-[220px]">
                      Employee
                    </th>
                    <th className="h-10 px-3 text-left align-middle text-[10px] font-black uppercase tracking-widest text-zinc-500 border-r border-zinc-200 w-[160px]">
                      Category
                    </th>
                    {activeModule === 'Add Expense' && (
                      <th className="h-10 px-3 text-left align-middle text-[10px] font-black uppercase tracking-widest text-zinc-500 border-r border-zinc-200 w-[140px]">
                        Type
                      </th>
                    )}
                    <th className="h-10 px-3 text-left align-middle text-[10px] font-black uppercase tracking-widest text-zinc-500 border-r border-zinc-200 w-[140px]">
                      Payout
                    </th>
                    <th className="h-10 px-3 text-left align-middle text-[10px] font-black uppercase tracking-widest text-zinc-500 border-r border-zinc-200 w-[120px]">
                      Amount
                    </th>
                    <th className="h-10 px-3 text-left align-middle text-[10px] font-black uppercase tracking-widest text-zinc-500 border-r border-zinc-200">
                      Remarks
                    </th>
                    <th className="h-10 px-3 text-left align-middle text-[10px] font-black uppercase tracking-widest text-zinc-500 border-r border-zinc-200">
                      Project
                    </th>
                    <th className="h-10 w-[50px]"></th>
                  </tr>
                </thead>
                <tbody>
                  {addRows.map((row, idx) => (
                    <tr key={row.id} className={`border-b border-zinc-100 transition-colors hover:bg-zinc-50/50 ${idx % 2 === 0 ? 'bg-white' : 'bg-zinc-50/20'}`}>
                      <td className="px-2 py-1.5 border-r border-zinc-100">
                        <input 
                          type="date" 
                          value={row.date} 
                          onChange={e => handleRowChange(row.id, 'date', e.target.value)} 
                          className="w-full h-9 border border-zinc-200 rounded-lg px-2 text-[12px] font-medium outline-none focus:ring-2 focus:ring-indigo-500 bg-white transition-colors" 
                        />
                      </td>
                      <td className="px-2 py-1.5 border-r border-zinc-100">
                        <select 
                          value={row.employeeId} 
                          onChange={e => handleRowChange(row.id, 'employeeId', e.target.value)} 
                          disabled={!canSelectAll}
                          className={`w-full h-9 border border-zinc-200 rounded-lg px-2 text-[12px] font-bold text-zinc-800 outline-none focus:ring-2 focus:ring-indigo-500 bg-white transition-colors ${!canSelectAll ? 'opacity-70 cursor-not-allowed' : ''}`}
                        >
                          <option value="">Select employee...</option>
                          {employees.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
                        </select>
                      </td>
                      <td className="px-2 py-1.5 border-r border-zinc-100">
                        <div className="flex flex-col gap-1">
                          <input 
                            list="categories-list" 
                            value={row.category} 
                            onChange={e => handleRowChange(row.id, 'category', e.target.value)} 
                            className="no-arrow w-full h-9 border border-zinc-200 rounded-lg px-2 text-[12px] font-medium outline-none focus:ring-2 focus:ring-indigo-500 bg-white transition-colors" 
                            placeholder="Type..." 
                          />
                          {row.transferredToName && (
                            <span className="text-red-500 text-[9px] font-black uppercase tracking-tight italic">
                              [{row.transferredToName}]
                            </span>
                          )}
                        </div>
                      </td>
                      {activeModule === 'Add Expense' && (
                        <td className="px-2 py-1.5 border-r border-zinc-100">
                          <select 
                            value={row.requestType} 
                            onChange={e => handleRowChange(row.id, 'requestType', e.target.value)} 
                            className="w-full h-9 border border-zinc-200 rounded-lg px-2 text-[11px] font-black uppercase bg-zinc-50/50 outline-none focus:ring-2 focus:ring-indigo-500 transition-colors"
                          >
                            <option value="Reimbursement">Spent</option>
                            <option value="Pre-Approval">Request</option>
                          </select>
                        </td>
                      )}
                      <td className="px-2 py-1.5 border-r border-zinc-100">
                        <select 
                          value={row.payoutMethod} 
                          onChange={e => handleRowChange(row.id, 'payoutMethod', e.target.value)} 
                          className="w-full h-9 border border-zinc-200 rounded-lg px-2 text-[11px] font-black uppercase bg-zinc-50/50 outline-none focus:ring-2 focus:ring-indigo-500 transition-colors"
                        >
                          <option value="Immediate">Immediate</option>
                          <option value="With Salary">Monthly</option>
                        </select>
                      </td>
                      <td className="px-2 py-1.5 border-r border-zinc-100">
                        <input 
                          type="number" 
                          value={row.amount} 
                          onChange={e => handleRowChange(row.id, 'amount', e.target.value)} 
                          className="w-full h-9 border border-zinc-200 rounded-lg px-2 text-[13px] font-black text-indigo-600 outline-none focus:ring-2 focus:ring-indigo-500 bg-white transition-colors" 
                          placeholder="0.00" 
                        />
                      </td>
                      <td className="px-2 py-1.5 border-r border-zinc-100">
                        <input 
                          type="text" 
                          value={row.reason} 
                          onChange={e => handleRowChange(row.id, 'reason', e.target.value)} 
                          className="w-full h-9 border border-zinc-200 rounded-lg px-2 text-[11px] font-medium outline-none focus:ring-2 focus:ring-indigo-500 bg-white transition-colors" 
                          placeholder="..." 
                        />
                      </td>
                      <td className="px-2 py-1.5 border-r border-zinc-100">
                        <input 
                          type="text" 
                          value={row.project} 
                          onChange={e => handleRowChange(row.id, 'project', e.target.value)} 
                          className="w-full h-9 border border-zinc-200 rounded-lg px-2 text-[11px] font-medium outline-none focus:ring-2 focus:ring-indigo-500 bg-white transition-colors" 
                          placeholder="..." 
                        />
                      </td>
                      <td className="px-2 text-center">
                        <button 
                          onClick={() => setAddRows(addRows.filter(r => r.id !== row.id))} 
                          className="text-zinc-300 hover:text-rose-500 transition-colors"
                        >
                          <Trash2 size={16} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
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
        <div className="space-y-6">
          <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-card">
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4 items-end">
              <div className="space-y-2 lg:col-span-1">
                <label className="text-sm font-medium text-gray-600 flex items-center gap-2">
                  <Calendar size={14} /> Month
                </label>
                <div className="flex items-center bg-gray-50 rounded-lg p-1 border border-gray-200">
                  <button onClick={() => handleMonthChange(-1)} className="p-1.5 hover:bg-white hover:shadow-sm rounded-md text-gray-500 transition-all"><ChevronLeft size={16} /></button>
                  <div className="flex-1 text-center font-bold text-gray-700 text-[11px]">
                    {(() => {
                      const [ry, rm] = reportMonth.split('-').map(Number)
                      return new Date(ry, rm - 1).toLocaleString('default', { month: 'short', year: 'numeric' })
                    })()}
                  </div>
                  <button onClick={() => handleMonthChange(1)} className="p-1.5 hover:bg-white hover:shadow-sm rounded-md text-gray-500 transition-all"><ChevronRight size={16} /></button>
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium text-gray-600 flex items-center gap-2">
                  <Search size={14} /> Ref No
                </label>
                <input 
                  type="text" 
                  placeholder="TXN-..." 
                  value={reportFilterTxn}
                  onChange={e => setReportFilterTxn(e.target.value)}
                  className="w-full h-10 border border-gray-200 rounded-lg px-3 text-sm font-normal focus:ring-2 focus:ring-primary-500 outline-none bg-gray-50/50"
                />
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium text-gray-600 flex items-center gap-2">
                  <Search size={14} /> Employee
                </label>
                <input 
                  type="text" 
                  placeholder="Name..." 
                  value={reportFilterName}
                  onChange={e => setReportFilterName(e.target.value)}
                  className="w-full h-10 border border-gray-200 rounded-lg px-3 text-sm font-normal focus:ring-2 focus:ring-primary-500 outline-none bg-gray-50/50"
                />
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium text-gray-600 flex items-center gap-2">
                  <Filter size={14} /> Type
                </label>
                <select 
                  value={reportFilterType}
                  onChange={e => setReportFilterType(e.target.value)}
                  className="w-full h-10 border border-gray-200 rounded-lg px-3 text-sm font-normal focus:ring-2 focus:ring-primary-500 outline-none bg-gray-50/50"
                >
                  <option value="All">All Types</option>
                  <option value="Advance">Advances</option>
                  <option value="Expense">Expenses</option>
                </select>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium text-gray-600 flex items-center gap-2">
                  <Filter size={14} /> Payout
                </label>
                <select 
                  value={reportFilterPayout}
                  onChange={e => setReportFilterPayout(e.target.value)}
                  className="w-full h-10 border border-gray-200 rounded-lg px-3 text-sm font-normal focus:ring-2 focus:ring-primary-500 outline-none bg-gray-50/50"
                >
                  <option value="All">All Payouts</option>
                  <option value="Immediate">Immediate</option>
                  <option value="With Salary">With Salary</option>
                </select>
              </div>

              <div className="flex gap-2">
                <button 
                  onClick={applyReportFilters}
                  className="flex-1 h-10 bg-primary-600 text-white font-medium rounded-lg text-sm shadow-elevated hover:bg-primary-700 active:bg-primary-800 transition-all flex items-center justify-center gap-2"
                >
                  <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
                  Apply
                </button>
                <button 
                  onClick={exportPDF}
                  disabled={!reportApplied || filteredEntries.length === 0}
                  className="h-10 px-4 bg-emerald-600 text-white font-medium rounded-lg text-sm shadow-elevated hover:bg-emerald-700 active:bg-emerald-800 transition-all disabled:opacity-50 flex items-center justify-center"
                  title="Export to PDF"
                >
                  <FileDown size={18} />
                </button>
              </div>
            </div>
          </div>
          
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Advances Panel */}
            <div className="bg-amber-50/50 rounded-xl border border-amber-200 overflow-hidden shadow-card">
              <div className="p-4 bg-amber-100/50 border-b border-amber-200 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <h3 className="font-semibold text-amber-900 text-sm">Advances</h3>
                  {reportApplied && (
                    <span className="text-xs font-medium text-amber-600 bg-white px-2 py-1 rounded border border-amber-100">
                      Filtered
                    </span>
                  )}
                </div>
                <span className="bg-white px-3 py-1 rounded-full text-xs font-semibold text-amber-700 shadow-sm border border-amber-100">
                  {reportApplied ? advForReport.length : advances.length} Records
                </span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-zinc-50/80 border-b border-zinc-200 h-10">
                      <th className="px-3 text-[10px] font-black uppercase tracking-widest text-zinc-500 border-r border-zinc-100">Transaction Info</th>
                      <th className="px-3 text-[10px] font-black uppercase tracking-widest text-zinc-500 border-r border-zinc-100">Category</th>
                      <th className="px-3 text-[10px] font-black uppercase tracking-widest text-zinc-500 border-r border-zinc-100">Amount</th>
                      <th className="px-3 text-[10px] font-black uppercase tracking-widest text-zinc-500 w-[80px]">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-50">
                    {(reportApplied ? advForReport : advances).length === 0 ? (
                      <tr>
                        <td colSpan={4} className="text-center py-12 text-zinc-400 text-sm italic font-medium">
                          No records found for this criteria
                        </td>
                      </tr>
                    ) : (reportApplied ? advForReport : advances).map(a => (
                      <tr key={a.id} className="h-12 border-b border-zinc-100 hover:bg-zinc-50 transition-colors group">
                        <td className="p-3 border-r border-zinc-50">
                          <div className="flex flex-col">
                            <span className="text-[9px] font-black text-amber-600 uppercase tracking-tighter mb-0.5">{a.transactionNo || '—'}</span>
                            <div className="flex items-center gap-2">
                              <span className="text-[11px] font-bold text-zinc-500">{a.date}</span>
                              <span className="text-[12px] font-black text-zinc-800">{a.employeeName}</span>
                            </div>
                          </div>
                        </td>
                        <td className="p-3 border-r border-zinc-50">
                          <div className="flex flex-col gap-1">
                            {(() => {
                              const cat = a.category || a.type || '—'
                              const match = cat.match(/(.*?) \[(.*?)\]/)
                              if (match) {
                                return (
                                  <>
                                    <span className="text-[13px] font-bold text-zinc-800 leading-tight">{match[1]}</span>
                                    <span className="text-[11px] font-black uppercase tracking-tight text-red-500 italic">[{match[2]}]</span>
                                  </>
                                )
                              }
                              return <span className="text-[13px] font-bold text-zinc-800 leading-tight">{cat}</span>
                            })()}
                            <div className="flex flex-col gap-0.5">
                              <span className={`w-fit px-1.5 py-0.5 rounded text-[8px] font-black uppercase ${a.requestType === 'Pre-Approval' ? 'bg-indigo-50 text-indigo-600 border border-indigo-100' : 'bg-gray-50 text-gray-400 border border-gray-100'}`}>
                                {a.requestType || 'Reimbursement'}
                              </span>
                              <span className="text-[9px] font-medium text-gray-400 ml-0.5 lowercase italic">
                                ({a.payoutMethod === 'With Salary' ? 'with salary' : (a.paymentStatus === 'Paid' ? 'reimbursed completed' : 'immediate')})
                              </span>
                            </div>
                          </div>
                        </td>
                        <td className="p-3 border-r border-zinc-50 text-sm font-black text-zinc-900 tabular-nums">{formatINR(a.amount)}</td>
                        <td className="p-3">
                          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                            {a.requestType === 'Pre-Approval' && a.mdApproval === 'Approved' && (
                              <button 
                                onClick={() => { setFinalizingId(a.id); setFinalizeAmount(a.amount); }} 
                                className="h-7 px-3 bg-emerald-50 text-emerald-600 font-bold rounded-lg text-[9px] uppercase tracking-widest hover:bg-emerald-600 hover:text-white transition-all border border-emerald-100"
                                title="Submit Actual Bill"
                              >
                                Submit Bill
                              </button>
                            )}
                            <button 
                              onClick={() => handleEdit(a)} 
                              className="text-amber-600 hover:bg-amber-100 p-1.5 rounded-lg transition-colors"
                              title="Edit & Revoke"
                            >
                              <Edit2 size={15} />
                            </button>
                            <button 
                              onClick={() => handleDelete(a.id)} 
                              className="text-red-500 hover:bg-red-50 p-1.5 rounded-lg transition-colors"
                              title="Delete Transaction"
                            >
                              <Trash2 size={15} />
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
            <div className="bg-blue-50/50 rounded-xl border border-blue-200 overflow-hidden shadow-card">
              <div className="p-4 bg-blue-100/50 border-b border-blue-200 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <h3 className="font-semibold text-blue-900 text-sm">Expenses</h3>
                  {reportApplied && (
                    <span className="text-xs font-medium text-blue-600 bg-white px-2 py-1 rounded border border-blue-100">
                      Filtered
                    </span>
                  )}
                </div>
                <span className="bg-white px-3 py-1 rounded-full text-xs font-semibold text-blue-700 shadow-sm border border-blue-100">
                  {reportApplied ? expForReport.length : expenses.length} Records
                </span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-zinc-50/80 border-b border-zinc-200 h-10">
                      <th className="px-3 text-[10px] font-black uppercase tracking-widest text-zinc-500 border-r border-zinc-100">Transaction Info</th>
                      <th className="px-3 text-[10px] font-black uppercase tracking-widest text-zinc-500 border-r border-zinc-100">Category</th>
                      <th className="px-3 text-[10px] font-black uppercase tracking-widest text-zinc-500 border-r border-zinc-100">Amount</th>
                      <th className="px-3 text-[10px] font-black uppercase tracking-widest text-zinc-500 w-[80px]">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-50">
                    {(reportApplied ? expForReport : expenses).length === 0 ? (
                      <tr>
                        <td colSpan={4} className="text-center py-12 text-zinc-400 text-sm italic font-medium">
                          No records found for this criteria
                        </td>
                      </tr>
                    ) : (reportApplied ? expForReport : expenses).map(e => (
                      <tr key={e.id} className="h-12 border-b border-zinc-100 hover:bg-zinc-50 transition-colors group">
                        <td className="p-3 border-r border-zinc-50">
                          <div className="flex flex-col">
                            <span className="text-[9px] font-black text-blue-600 uppercase tracking-tighter mb-0.5">{e.transactionNo || '—'}</span>
                            <div className="flex items-center gap-2">
                              <span className="text-[11px] font-bold text-zinc-500">{e.date}</span>
                              <span className="text-[12px] font-black text-zinc-800">{e.employeeName}</span>
                            </div>
                          </div>
                        </td>
                        <td className="p-3 border-r border-zinc-50">
                          <div className="flex flex-col gap-1">
                            {(() => {
                              const cat = e.category || e.type || '—'
                              const match = cat.match(/(.*?) \[(.*?)\]/)
                              if (match) {
                                return (
                                  <>
                                    <span className="text-[13px] font-bold text-zinc-800 leading-tight">{match[1]}</span>
                                    <span className="text-[11px] font-black uppercase tracking-tight text-red-500 italic">[{match[2]}]</span>
                                  </>
                                )
                              }
                              return <span className="text-[13px] font-bold text-zinc-800 leading-tight">{cat}</span>
                            })()}
                            <div className="flex flex-col gap-0.5">
                              <span className={`w-fit px-1.5 py-0.5 rounded text-[8px] font-black uppercase ${e.requestType === 'Pre-Approval' ? 'bg-indigo-50 text-indigo-600 border border-indigo-100' : 'bg-gray-50 text-gray-400 border border-gray-100'}`}>
                                {e.requestType || 'Reimbursement'}
                              </span>
                              <span className="text-[9px] font-medium text-gray-400 ml-0.5 lowercase italic">
                                ({e.payoutMethod === 'With Salary' ? 'with salary' : (e.paymentStatus === 'Paid' ? 'reimbursed completed' : 'immediate')})
                              </span>
                            </div>
                          </div>
                        </td>
                        <td className="p-3 border-r border-zinc-50 text-sm font-black text-zinc-900 tabular-nums">{formatINR(e.amount)}</td>
                        <td className="p-3">
                          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                            {e.requestType === 'Pre-Approval' && e.mdApproval === 'Approved' && (
                              <button 
                                onClick={() => { setFinalizingId(e.id); setFinalizeAmount(e.amount); }} 
                                className="h-7 px-3 bg-emerald-50 text-emerald-600 font-bold rounded-lg text-[9px] uppercase tracking-widest hover:bg-emerald-600 hover:text-white transition-all border border-emerald-100"
                                title="Submit Actual Bill"
                              >
                                Submit Bill
                              </button>
                            )}
                            <button 
                              onClick={() => handleEdit(e)} 
                              className="text-blue-600 hover:bg-blue-100 p-1.5 rounded-lg transition-colors"
                              title="Edit & Revoke"
                            >
                              <Edit2 size={15} />
                            </button>
                            <button 
                              onClick={() => handleDelete(e.id)} 
                              className="text-red-500 hover:bg-red-50 p-1.5 rounded-lg transition-colors"
                              title="Delete Transaction"
                            >
                              <Trash2 size={15} />
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
    </div>
  )
}