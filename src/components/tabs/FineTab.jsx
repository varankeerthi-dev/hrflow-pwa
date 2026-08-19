import React, { useEffect, useMemo, useState } from 'react'
import { useAuth } from '../../hooks/useAuth'
import { useEmployees } from '../../hooks/useEmployees'
import { db } from '../../lib/firebase'
import { addDoc, collection, doc, getDocs, orderBy, query, serverTimestamp, updateDoc } from 'firebase/firestore'
import { AlertCircle, CheckCircle2, Edit3, FileText, Filter, Gavel, Plus, Search, ShieldAlert, XCircle } from 'lucide-react'
import { z } from 'zod'
import Spinner from '../ui/Spinner'
import Modal from '../ui/Modal'
import { formatINR } from '../../lib/salaryUtils'
import { isPeriodLocked } from '../../lib/payrollLock'

const FINE_TYPES = ['Late Entry', 'Misconduct', 'Safety Violation', 'Damage to Property', 'Policy Breach', 'Attendance Violation', 'Others']
const PAYROLL_ACTIVE_STATUSES = new Set(['issued', 'scheduled', 'unpaid', 'deducted'])

const fineEntrySchema = z.object({
  employeeId: z.string().min(1, 'Choose an employee.'),
  type: z.string().min(1, 'Choose a violation category.'),
  amount: z.coerce.number().positive('Enter a fine amount greater than ₹0.').max(1000000, 'Fine amount is too large.'),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Choose the occurrence date.'),
  deductionMonth: z.string().regex(/^\d{4}-\d{2}$/, 'Choose the payroll month.'),
  incidentRef: z.string().trim().max(80, 'Incident reference must be 80 characters or fewer.').optional(),
  reason: z.string().trim().min(8, 'Enter at least 8 characters of incident details.').max(800, 'Incident details must be 800 characters or fewer.'),
  deductFromPayroll: z.boolean(),
  portalVisible: z.boolean(),
})

const emptyForm = () => ({
  employeeId: '',
  type: 'Late Entry',
  amount: '',
  date: new Date().toISOString().split('T')[0],
  deductionMonth: new Date().toISOString().slice(0, 7),
  incidentRef: '',
  reason: '',
  deductFromPayroll: true,
  portalVisible: true,
})

const asMonthLabel = (month) => {
  if (!/^\d{4}-\d{2}$/.test(String(month || ''))) return '—'
  const [year, value] = month.split('-').map(Number)
  return new Date(year, value - 1, 1).toLocaleDateString('en-IN', { month: 'short', year: 'numeric' })
}

const asDateLabel = (date) => {
  if (!date) return '—'
  const parsed = new Date(`${date}T00:00:00`)
  return Number.isNaN(parsed.getTime()) ? date : parsed.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
}

const fineStatusMeta = (status) => {
  const normalized = String(status || 'Issued').toLowerCase()
  if (normalized === 'waived') return { label: 'Waived', className: 'bg-emerald-50 text-emerald-700 border-emerald-100' }
  if (normalized === 'cancelled') return { label: 'Cancelled', className: 'bg-slate-100 text-slate-600 border-slate-200' }
  if (normalized === 'deducted') return { label: 'Deducted', className: 'bg-indigo-50 text-indigo-700 border-indigo-100' }
  if (normalized === 'unpaid') return { label: 'Unpaid', className: 'bg-amber-50 text-amber-700 border-amber-100' }
  if (normalized === 'scheduled') return { label: 'Scheduled', className: 'bg-indigo-50 text-indigo-700 border-indigo-100' }
  return { label: 'Issued', className: 'bg-red-50 text-red-700 border-red-100' }
}

export default function FineTab() {
  const { user } = useAuth()
  const { employees } = useEmployees(user?.orgId)
  const [loading, setLoading] = useState(false)
  const [fines, setFines] = useState([])
  const [showFormModal, setShowFormModal] = useState(false)
  const [editingFine, setEditingFine] = useState(null)
  const [form, setForm] = useState(emptyForm)
  const [formError, setFormError] = useState('')
  const [searchTerm, setSearchTerm] = useState('')
  const [filterEmployee, setFilterEmployee] = useState('all')
  const [filterType, setFilterType] = useState('all')
  const [filterStatus, setFilterStatus] = useState('all')
  const [filterMonth, setFilterMonth] = useState('all')

  const fetchFines = async () => {
    if (!user?.orgId) return
    setLoading(true)
    try {
      const fineQuery = query(collection(db, 'organisations', user.orgId, 'fines'), orderBy('date', 'desc'))
      const snapshot = await getDocs(fineQuery)
      setFines(snapshot.docs.map((fineDoc) => ({ id: fineDoc.id, ...fineDoc.data() })))
    } catch (error) {
      console.error('Failed to load fines:', error)
      setFormError('Could not load fine records. Refresh and try again.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { fetchFines() }, [user?.orgId])

  const activeEmployees = useMemo(() => [...employees].sort((a, b) => String(a.name || '').localeCompare(String(b.name || ''))), [employees])
  const payrollMonths = useMemo(() => [...new Set(fines.map((fine) => fine.deductionMonth || String(fine.date || '').slice(0, 7)).filter(Boolean))].sort().reverse(), [fines])

  const filteredFines = useMemo(() => {
    const search = searchTerm.trim().toLowerCase()
    return fines.filter((fine) => {
      const deductionMonth = fine.deductionMonth || String(fine.date || '').slice(0, 7)
      const haystack = [fine.employeeName, fine.employeeCode, fine.type, fine.reason, fine.incidentRef, fine.referenceNo].filter(Boolean).join(' ').toLowerCase()
      return (!search || haystack.includes(search))
        && (filterEmployee === 'all' || fine.employeeId === filterEmployee)
        && (filterType === 'all' || fine.type === filterType)
        && (filterStatus === 'all' || String(fine.status || 'Issued').toLowerCase() === filterStatus)
        && (filterMonth === 'all' || deductionMonth === filterMonth)
    })
  }, [filterEmployee, filterMonth, filterStatus, filterType, fines, searchTerm])

  const metrics = useMemo(() => {
    const payable = fines.filter((fine) => fine.deductFromPayroll !== false && PAYROLL_ACTIVE_STATUSES.has(String(fine.status || 'Issued').toLowerCase()))
    const waived = fines.filter((fine) => String(fine.status || '').toLowerCase() === 'waived')
    const currentMonth = new Date().toISOString().slice(0, 7)
    return {
      payable: payable.reduce((total, fine) => total + Number(fine.amount || 0), 0),
      scheduled: payable.filter((fine) => (fine.deductionMonth || String(fine.date || '').slice(0, 7)) === currentMonth).reduce((total, fine) => total + Number(fine.amount || 0), 0),
      waived: waived.reduce((total, fine) => total + Number(fine.amount || 0), 0),
    }
  }, [fines])

  const resetForm = () => {
    setEditingFine(null)
    setForm(emptyForm())
    setFormError('')
  }

  const openCreate = () => {
    resetForm()
    setShowFormModal(true)
  }

  const openEdit = async (fine) => {
    const payrollMonth = fine.deductionMonth || String(fine.date || '').slice(0, 7)
    if (payrollMonth && await isPeriodLocked(user?.orgId, payrollMonth)) {
      alert(`This fine is linked to the locked ${asMonthLabel(payrollMonth)} payroll period and cannot be edited.`)
      return
    }
    setEditingFine(fine)
    setForm({
      employeeId: fine.employeeId || '',
      type: fine.type || 'Others',
      amount: String(fine.amount || ''),
      date: fine.date || new Date().toISOString().split('T')[0],
      deductionMonth: payrollMonth || new Date().toISOString().slice(0, 7),
      incidentRef: fine.incidentRef || '',
      reason: fine.reason || '',
      deductFromPayroll: fine.deductFromPayroll !== false,
      portalVisible: fine.portalVisible !== false,
    })
    setFormError('')
    setShowFormModal(true)
  }

  const handleSubmit = async (event) => {
    event.preventDefault()
    if (!user?.orgId) return
    const parsed = fineEntrySchema.safeParse(form)
    if (!parsed.success) {
      setFormError(parsed.error.issues[0]?.message || 'Check the penalty details and try again.')
      return
    }
    const values = parsed.data
    if (values.deductFromPayroll && await isPeriodLocked(user.orgId, values.deductionMonth)) {
      setFormError(`The ${asMonthLabel(values.deductionMonth)} payroll period is locked. Choose an open deduction month instead.`)
      return
    }
    const employee = activeEmployees.find((record) => record.id === values.employeeId)
    if (!employee) {
      setFormError('The selected employee is no longer available.')
      return
    }

    setLoading(true)
    try {
      const payload = {
        ...values,
        amount: Number(values.amount),
        employeeName: employee.name || 'Unknown',
        employeeCode: employee.empCode || '',
        status: editingFine?.status || 'Issued',
        updatedAt: serverTimestamp(),
        updatedBy: user.uid || '',
        updatedByName: user.name || user.email || 'HR',
      }
      if (editingFine) {
        await updateDoc(doc(db, 'organisations', user.orgId, 'fines', editingFine.id), payload)
      } else {
        const referenceNo = `FIN-${new Date().toISOString().slice(0, 10).replaceAll('-', '')}-${String(Date.now()).slice(-5)}`
        await addDoc(collection(db, 'organisations', user.orgId, 'fines'), {
          ...payload,
          referenceNo,
          issuedAt: serverTimestamp(),
          createdAt: serverTimestamp(),
          createdBy: user.uid || '',
          createdByName: user.name || user.email || 'HR',
        })
      }
      setShowFormModal(false)
      resetForm()
      await fetchFines()
    } catch (error) {
      console.error('Failed to save fine:', error)
      setFormError('The fine could not be saved. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  const changeFineStatus = async (fine, nextStatus) => {
    const payrollMonth = fine.deductionMonth || String(fine.date || '').slice(0, 7)
    if (payrollMonth && await isPeriodLocked(user?.orgId, payrollMonth)) {
      alert(`This fine belongs to the locked ${asMonthLabel(payrollMonth)} payroll period and cannot be changed.`)
      return
    }
    const verb = nextStatus === 'Waived' ? 'waive' : 'cancel'
    if (!window.confirm(`Are you sure you want to ${verb} ${fine.referenceNo || 'this fine'}? The original record will remain in the audit trail.`)) return
    setLoading(true)
    try {
      await updateDoc(doc(db, 'organisations', user.orgId, 'fines', fine.id), {
        status: nextStatus,
        deductFromPayroll: false,
        resolvedAt: serverTimestamp(),
        resolvedBy: user.uid || '',
        resolvedByName: user.name || user.email || 'HR',
        updatedAt: serverTimestamp(),
      })
      await fetchFines()
    } catch (error) {
      console.error('Failed to update fine status:', error)
      alert('Could not update the fine status.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-5 font-inter">
      <div className="bg-white p-5 sm:p-6 rounded-[12px] shadow-sm border border-gray-100 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div className="flex items-center gap-4">
          <div className="w-10 h-10 rounded-xl bg-red-50 flex items-center justify-center text-red-600 border border-red-100"><Gavel size={20} /></div>
          <div>
            <h3 className="text-sm font-bold text-gray-800 uppercase tracking-tight">Fines & Penalties</h3>
            <p className="mt-1 text-[11px] font-semibold uppercase tracking-widest text-gray-400">Issue, schedule and track employee deductions</p>
          </div>
        </div>
        <button onClick={openCreate} className="h-[40px] px-5 bg-emerald-600 text-white font-bold rounded-lg text-[12px] flex items-center justify-center gap-2 shadow-sm hover:bg-emerald-700 active:scale-[0.98] transition">
          <Plus size={16} strokeWidth={3} /> Issue Fine
        </button>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        {[
          { label: 'Active deductions', value: formatINR(metrics.payable), icon: <Gavel size={17} />, tone: 'text-red-600 bg-red-50 border-red-100' },
          { label: 'Due this month', value: formatINR(metrics.scheduled), icon: <FileText size={17} />, tone: 'text-indigo-600 bg-indigo-50 border-indigo-100' },
          { label: 'Waived value', value: formatINR(metrics.waived), icon: <CheckCircle2 size={17} />, tone: 'text-emerald-600 bg-emerald-50 border-emerald-100' },
        ].map((item) => (
          <div key={item.label} className="rounded-[12px] border border-gray-100 bg-white p-4 shadow-sm flex items-center gap-3">
            <div className={`h-9 w-9 rounded-lg border flex items-center justify-center ${item.tone}`}>{item.icon}</div>
            <div><p className="text-[10px] font-bold uppercase tracking-widest text-gray-400">{item.label}</p><p className="mt-1 text-base font-bold text-gray-900">{item.value}</p></div>
          </div>
        ))}
      </div>

      <div className="rounded-[12px] border border-gray-100 bg-white shadow-sm overflow-hidden">
        <div className="border-b border-gray-100 p-4 grid gap-3 lg:grid-cols-[minmax(220px,1.5fr)_repeat(4,minmax(130px,1fr))]">
          <label className="relative block"><Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" /><input value={searchTerm} onChange={(event) => setSearchTerm(event.target.value)} placeholder="Search name, reference or reason" className="h-10 w-full rounded-lg border border-gray-200 bg-gray-50 pl-9 pr-3 text-[12px] font-semibold text-gray-700 outline-none focus:border-indigo-300 focus:ring-2 focus:ring-indigo-100" /></label>
          <select value={filterEmployee} onChange={(event) => setFilterEmployee(event.target.value)} className="h-10 rounded-lg border border-gray-200 bg-white px-3 text-[12px] font-semibold text-gray-700 outline-none focus:border-indigo-300"><option value="all">All employees</option>{activeEmployees.map((employee) => <option key={employee.id} value={employee.id}>{employee.name}</option>)}</select>
          <select value={filterType} onChange={(event) => setFilterType(event.target.value)} className="h-10 rounded-lg border border-gray-200 bg-white px-3 text-[12px] font-semibold text-gray-700 outline-none focus:border-indigo-300"><option value="all">All categories</option>{FINE_TYPES.map((type) => <option key={type} value={type}>{type}</option>)}</select>
          <select value={filterStatus} onChange={(event) => setFilterStatus(event.target.value)} className="h-10 rounded-lg border border-gray-200 bg-white px-3 text-[12px] font-semibold text-gray-700 outline-none focus:border-indigo-300"><option value="all">All statuses</option><option value="issued">Issued</option><option value="scheduled">Scheduled</option><option value="unpaid">Unpaid</option><option value="deducted">Deducted</option><option value="waived">Waived</option><option value="cancelled">Cancelled</option></select>
          <select value={filterMonth} onChange={(event) => setFilterMonth(event.target.value)} className="h-10 rounded-lg border border-gray-200 bg-white px-3 text-[12px] font-semibold text-gray-700 outline-none focus:border-indigo-300"><option value="all">All payroll months</option>{payrollMonths.map((month) => <option key={month} value={month}>{asMonthLabel(month)}</option>)}</select>
        </div>

        <div className="flex items-center justify-between gap-3 px-4 py-3 bg-gray-50/60"><p className="text-[11px] font-semibold text-gray-500"><Filter size={13} className="inline mr-1.5 text-gray-400" />{filteredFines.length} record{filteredFines.length === 1 ? '' : 's'} shown</p><p className="text-[11px] text-gray-400">Waived and cancelled entries stay visible for audit history.</p></div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[1040px] text-left border-collapse">
            <thead><tr className="h-[42px] bg-[#f9fafb] border-y border-gray-100">{['Reference & date', 'Employee', 'Category & incident', 'Payroll month', 'Amount', 'Status', 'Portal', 'Actions'].map((heading) => <th key={heading} className="px-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest">{heading}</th>)}</tr></thead>
            <tbody className="divide-y divide-gray-100">
              {loading ? <tr><td colSpan={8} className="py-14 text-center"><Spinner /></td></tr> : filteredFines.length === 0 ? <tr><td colSpan={8} className="py-16 text-center"><ShieldAlert size={25} className="mx-auto text-gray-200" /><p className="mt-3 text-[11px] font-semibold uppercase tracking-widest text-gray-400">No fine records match these filters</p></td></tr> : filteredFines.map((fine) => {
                const status = fineStatusMeta(fine.status)
                const deductionMonth = fine.deductionMonth || String(fine.date || '').slice(0, 7)
                const isOpen = PAYROLL_ACTIVE_STATUSES.has(String(fine.status || 'Issued').toLowerCase())
                return <tr key={fine.id} className="hover:bg-slate-50/80 align-top">
                  <td className="px-4 py-3"><p className="font-mono text-[11px] font-bold text-slate-700">{fine.referenceNo || `LEGACY-${fine.id.slice(-6).toUpperCase()}`}</p><p className="mt-1 text-[11px] text-gray-400">Occurred {asDateLabel(fine.date)}</p></td>
                  <td className="px-4 py-3"><p className="text-[12px] font-bold text-slate-800">{fine.employeeName}</p><p className="mt-1 text-[10px] font-semibold text-gray-400">{fine.employeeCode || 'No employee code'}</p></td>
                  <td className="px-4 py-3"><span className="inline-flex rounded-md border border-red-100 bg-red-50 px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-red-700">{fine.type || 'Others'}</span><p className="mt-2 max-w-[270px] text-[11px] leading-4 text-gray-500">{fine.reason || 'No incident details recorded.'}</p>{fine.incidentRef && <p className="mt-1 text-[10px] font-semibold text-gray-400">Ref: {fine.incidentRef}</p>}</td>
                  <td className="px-4 py-3"><p className="text-[12px] font-semibold text-slate-700">{fine.deductFromPayroll === false ? 'Not deducted' : asMonthLabel(deductionMonth)}</p></td>
                  <td className="px-4 py-3 text-[13px] font-bold text-red-600">{formatINR(fine.amount)}</td>
                  <td className="px-4 py-3"><span className={`inline-flex rounded-md border px-2 py-1 text-[10px] font-bold uppercase tracking-wide ${status.className}`}>{status.label}</span></td>
                  <td className="px-4 py-3"><span className={`text-[10px] font-bold uppercase ${fine.portalVisible === false ? 'text-gray-400' : 'text-indigo-600'}`}>{fine.portalVisible === false ? 'Hidden' : 'Visible'}</span></td>
                  <td className="px-4 py-3"><div className="flex items-center justify-end gap-1"><button title="Edit fine" onClick={() => openEdit(fine)} className="rounded-lg p-2 text-gray-400 hover:bg-indigo-50 hover:text-indigo-600"><Edit3 size={15} /></button>{isOpen && <button title="Waive fine" onClick={() => changeFineStatus(fine, 'Waived')} className="rounded-lg p-2 text-gray-400 hover:bg-emerald-50 hover:text-emerald-600"><CheckCircle2 size={15} /></button>}<button title="Cancel fine" onClick={() => changeFineStatus(fine, 'Cancelled')} className="rounded-lg p-2 text-gray-400 hover:bg-red-50 hover:text-red-600"><XCircle size={15} /></button></div></td>
                </tr>
              })}
            </tbody>
          </table>
        </div>
      </div>

      <Modal isOpen={showFormModal} onClose={() => { setShowFormModal(false); resetForm() }} title={editingFine ? 'Edit Fine Record' : 'Issue Fine'} size="2xl">
        <form onSubmit={handleSubmit} className="p-5 sm:p-6 space-y-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <label><span className="mb-2 block text-[11px] font-bold uppercase tracking-widest text-gray-400">Employee <span className="text-red-500">*</span></span><select value={form.employeeId} onChange={(event) => setForm((current) => ({ ...current, employeeId: event.target.value }))} className="h-11 w-full rounded-lg border border-gray-200 bg-gray-50 px-3 text-sm font-semibold outline-none focus:border-indigo-300"><option value="">Choose employee</option>{activeEmployees.map((employee) => <option key={employee.id} value={employee.id}>{employee.name}{employee.empCode ? ` · ${employee.empCode}` : ''}</option>)}</select></label>
            <label><span className="mb-2 block text-[11px] font-bold uppercase tracking-widest text-gray-400">Occurrence date <span className="text-red-500">*</span></span><input type="date" value={form.date} onChange={(event) => setForm((current) => ({ ...current, date: event.target.value, deductionMonth: current.deductionMonth || event.target.value.slice(0, 7) }))} className="h-11 w-full rounded-lg border border-gray-200 bg-gray-50 px-3 text-sm font-semibold outline-none focus:border-indigo-300" /></label>
          </div>
          <div className="grid gap-4 sm:grid-cols-3">
            <label><span className="mb-2 block text-[11px] font-bold uppercase tracking-widest text-gray-400">Category <span className="text-red-500">*</span></span><select value={form.type} onChange={(event) => setForm((current) => ({ ...current, type: event.target.value }))} className="h-11 w-full rounded-lg border border-gray-200 bg-gray-50 px-3 text-sm font-semibold outline-none focus:border-indigo-300">{FINE_TYPES.map((type) => <option key={type} value={type}>{type}</option>)}</select></label>
            <label><span className="mb-2 block text-[11px] font-bold uppercase tracking-widest text-gray-400">Amount (₹) <span className="text-red-500">*</span></span><input min="0" step="0.01" type="number" value={form.amount} onChange={(event) => setForm((current) => ({ ...current, amount: event.target.value }))} placeholder="0.00" className="h-11 w-full rounded-lg border border-gray-200 bg-gray-50 px-3 text-sm font-bold text-red-600 outline-none focus:border-indigo-300" /></label>
            <label><span className="mb-2 block text-[11px] font-bold uppercase tracking-widest text-gray-400">Payroll month <span className="text-red-500">*</span></span><input type="month" value={form.deductionMonth} onChange={(event) => setForm((current) => ({ ...current, deductionMonth: event.target.value }))} className="h-11 w-full rounded-lg border border-gray-200 bg-gray-50 px-3 text-sm font-semibold outline-none focus:border-indigo-300" /></label>
          </div>
          <label><span className="mb-2 block text-[11px] font-bold uppercase tracking-widest text-gray-400">Incident reference</span><input value={form.incidentRef} onChange={(event) => setForm((current) => ({ ...current, incidentRef: event.target.value }))} placeholder="Memo, supervisor note or document reference" className="h-11 w-full rounded-lg border border-gray-200 bg-gray-50 px-3 text-sm font-semibold outline-none focus:border-indigo-300" /></label>
          <label><span className="mb-2 block text-[11px] font-bold uppercase tracking-widest text-gray-400">Incident details <span className="text-red-500">*</span></span><textarea value={form.reason} onChange={(event) => setForm((current) => ({ ...current, reason: event.target.value }))} placeholder="State what happened and the supporting decision context." className="min-h-[120px] w-full rounded-lg border border-gray-200 bg-gray-50 p-3 text-sm font-medium leading-6 outline-none focus:border-indigo-300" /></label>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="flex items-start gap-3 rounded-lg border border-gray-100 bg-slate-50 p-3"><input type="checkbox" checked={form.deductFromPayroll} onChange={(event) => setForm((current) => ({ ...current, deductFromPayroll: event.target.checked }))} className="mt-0.5 h-4 w-4 rounded border-slate-300 text-indigo-600" /><span><strong className="block text-[12px] text-slate-800">Deduct through payroll</strong><small className="mt-1 block text-[11px] leading-4 text-slate-500">The fine is included only in the selected open payroll month.</small></span></label>
            <label className="flex items-start gap-3 rounded-lg border border-gray-100 bg-slate-50 p-3"><input type="checkbox" checked={form.portalVisible} onChange={(event) => setForm((current) => ({ ...current, portalVisible: event.target.checked }))} className="mt-0.5 h-4 w-4 rounded border-slate-300 text-indigo-600" /><span><strong className="block text-[12px] text-slate-800">Show in My Portal</strong><small className="mt-1 block text-[11px] leading-4 text-slate-500">The linked employee can view the record, amount, payroll month and incident details.</small></span></label>
          </div>
          {formError && <div className="flex items-start gap-2 rounded-lg border border-red-100 bg-red-50 p-3 text-[12px] font-semibold text-red-700"><AlertCircle size={16} className="mt-0.5 shrink-0" />{formError}</div>}
          <div className="flex flex-col-reverse gap-3 pt-1 sm:flex-row sm:justify-end"><button type="button" onClick={() => { setShowFormModal(false); resetForm() }} className="h-11 rounded-lg border border-gray-200 px-5 text-[12px] font-bold text-gray-600 hover:bg-gray-50">Cancel</button><button type="submit" disabled={loading} className="h-11 rounded-lg bg-emerald-600 px-5 text-[12px] font-bold text-white shadow-sm hover:bg-emerald-700 disabled:opacity-60">{loading ? 'Saving...' : editingFine ? 'Save fine record' : 'Issue fine record'}</button></div>
        </form>
      </Modal>
    </div>
  )
}
