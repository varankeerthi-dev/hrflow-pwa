import React, { useState, useMemo } from 'react'
import { useAuth } from '../../hooks/useAuth'
import { useSubcontractors } from '../../hooks/useSubcontractors'
import Modal from '../ui/Modal'
import Spinner from '../ui/Spinner'
import {
  HardHat,
  Plus,
  Search,
  Phone,
  MapPin,
  CreditCard,
  Heart,
  AlertCircle,
  Edit2,
  Trash2,
  CheckCircle2,
  Copy,
  Check,
  Building,
  ShieldCheck,
  X
} from 'lucide-react'

const BLOOD_GROUPS = ['A+', 'A-', 'B+', 'B-', 'O+', 'O-', 'AB+', 'AB-']

const initialFormState = {
  name: '',
  mobile: '',
  address: '',
  pan: '',
  gst: '',
  bankName: '',
  accountNumber: '',
  ifsc: '',
  holderName: '',
  upi: '',
  emergencyContact: '',
  bloodGroup: '',
  specialization: '',
  status: 'Active',
  notes: ''
}

export default function SubcontractorManagementTab() {
  const { user } = useAuth()
  const {
    subcontractors,
    loading,
    addSubcontractor,
    updateSubcontractor,
    deleteSubcontractor
  } = useSubcontractors(user?.orgId, user)

  const [searchQuery, setSearchQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState('all') // 'all', 'Active', 'Inactive'
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [editingContractor, setEditingContractor] = useState(null)
  const [formData, setFormData] = useState(initialFormState)
  const [formErrors, setFormErrors] = useState({})
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [deleteConfirmTarget, setDeleteConfirmTarget] = useState(null)
  const [copiedId, setCopiedId] = useState(null)
  const [selectedDetailsContractor, setSelectedDetailsContractor] = useState(null)

  const isAdmin = user?.role?.toLowerCase() === 'admin'

  const canModify = (contractor) => {
    if (!user) return false
    if (isAdmin) return true
    return (
      contractor.createdById === user.uid ||
      contractor.createdBy === user.name ||
      contractor.createdBy === user.email
    )
  }

  // Handle opening modal for Add
  const handleOpenAddModal = () => {
    setEditingContractor(null)
    setFormData(initialFormState)
    setFormErrors({})
    setIsModalOpen(true)
  }

  // Handle opening modal for Edit
  const handleOpenEditModal = (contractor) => {
    setEditingContractor(contractor)
    setFormData({
      name: contractor.name || '',
      mobile: contractor.mobile || '',
      address: contractor.address || '',
      pan: contractor.pan || '',
      gst: contractor.gst || '',
      bankName: contractor.bankAccount?.bankName || '',
      accountNumber: contractor.bankAccount?.accountNumber || '',
      ifsc: contractor.bankAccount?.ifsc || '',
      holderName: contractor.bankAccount?.holderName || '',
      upi: contractor.upi || '',
      emergencyContact: contractor.emergencyContact || '',
      bloodGroup: contractor.bloodGroup || '',
      specialization: contractor.specialization || '',
      status: contractor.status || 'Active',
      notes: contractor.notes || ''
    })
    setFormErrors({})
    setIsModalOpen(true)
  }

  // Sanitize and handle input changes
  const handleInputChange = (field, value) => {
    let sanitized = value

    if (field === 'pan') {
      // PAN is 10 chars uppercase alphanumeric (A-Z0-9)
      sanitized = value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 10)
    } else if (field === 'gst') {
      // GST is 15 chars uppercase alphanumeric (A-Z0-9)
      sanitized = value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 15)
    } else if (field === 'ifsc') {
      // IFSC is 11 chars uppercase alphanumeric (A-Z0-9)
      sanitized = value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 11)
    } else if (field === 'mobile' || field === 'emergencyContact') {
      // Digits, +, and space only
      sanitized = value.replace(/[^0-9+ -]/g, '').slice(0, 15)
    }

    setFormData((prev) => ({ ...prev, [field]: sanitized }))
    if (formErrors[field]) {
      setFormErrors((prev) => ({ ...prev, [field]: null }))
    }
  }

  // Validate form
  const validateForm = () => {
    const errors = {}
    if (!formData.name.trim()) {
      errors.name = 'Contractor Name is required'
    }
    if (formData.pan && formData.pan.length !== 10) {
      errors.pan = 'PAN must be exactly 10 alphanumeric characters'
    }
    if (formData.gst && formData.gst.length !== 15) {
      errors.gst = 'GST must be exactly 15 alphanumeric characters'
    }
    if (formData.ifsc && formData.ifsc.length !== 11) {
      errors.ifsc = 'IFSC must be 11 characters'
    }
    setFormErrors(errors)
    return Object.keys(errors).length === 0
  }

  // Save / Submit Contractor
  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!validateForm()) return

    setIsSubmitting(true)
    try {
      if (editingContractor) {
        await updateSubcontractor(editingContractor.id, formData, editingContractor.name)
      } else {
        await addSubcontractor(formData)
      }
      setIsModalOpen(false)
    } catch (err) {
      console.error('Failed to save subcontractor:', err)
      setFormErrors((prev) => ({ ...prev, submit: err.message || 'Failed to save contractor' }))
    } finally {
      setIsSubmitting(false)
    }
  }

  // Delete contractor
  const handleConfirmDelete = async () => {
    if (!deleteConfirmTarget) return
    try {
      await deleteSubcontractor(deleteConfirmTarget.id, deleteConfirmTarget.name)
      setDeleteConfirmTarget(null)
    } catch (err) {
      console.error('Failed to delete subcontractor:', err)
      alert(err.message || 'Failed to delete subcontractor')
    }
  }

  // Copy payment/UPI details helper
  const handleCopy = (text, id) => {
    if (!text) return
    navigator.clipboard.writeText(text)
    setCopiedId(id)
    setTimeout(() => setCopiedId(null), 1800)
  }

  // Filtered list
  const filteredContractors = useMemo(() => {
    return subcontractors.filter((item) => {
      if (statusFilter !== 'all' && item.status !== statusFilter) return false
      if (!searchQuery.trim()) return true

      const q = searchQuery.toLowerCase()
      const name = (item.name || '').toLowerCase()
      const mobile = (item.mobile || '').toLowerCase()
      const pan = (item.pan || '').toLowerCase()
      const gst = (item.gst || '').toLowerCase()
      const upi = (item.upi || '').toLowerCase()
      const spec = (item.specialization || '').toLowerCase()

      return (
        name.includes(q) ||
        mobile.includes(q) ||
        pan.includes(q) ||
        gst.includes(q) ||
        upi.includes(q) ||
        spec.includes(q)
      )
    })
  }, [subcontractors, searchQuery, statusFilter])

  // Summary counts
  const stats = useMemo(() => {
    const total = subcontractors.length
    const active = subcontractors.filter((s) => s.status !== 'Inactive').length
    const withTax = subcontractors.filter((s) => s.pan || s.gst).length
    const withBank = subcontractors.filter(
      (s) => s.upi || s.bankAccount?.accountNumber
    ).length
    return { total, active, withTax, withBank }
  }, [subcontractors])

  return (
    <div className="flex flex-col h-full bg-white font-body p-4 sm:p-6 space-y-5">
      {/* Top Header / Action Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white pb-3 border-b border-slate-200">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl sm:text-2xl font-bold text-slate-900 font-heading tracking-tight">
              Sub-Contractors
            </h1>
            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-blue-50 text-blue-700 border border-blue-200 font-mono">
              {stats.total}
            </span>
          </div>
          <p className="text-xs sm:text-sm text-slate-500 mt-0.5 font-body">
            Manage vendor profiles, payment accounts & statutory details for Advance/Expense payments
          </p>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={handleOpenAddModal}
            className="h-9 px-4 bg-blue-600 hover:bg-blue-700 text-white rounded-md text-sm font-bold font-heading shadow-sm flex items-center gap-1.5 transition-colors cursor-pointer active:scale-[0.98]"
          >
            <Plus size={16} />
            <span>New Contractor</span>
          </button>
        </div>
      </div>

      {/* Quick Metrics Bar */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="p-3.5 rounded-xl border border-slate-200 bg-white shadow-2xs">
          <div className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
            Total Vendors
          </div>
          <div className="text-xl font-bold text-slate-900 font-mono mt-1">
            {stats.total}
          </div>
        </div>
        <div className="p-3.5 rounded-xl border border-slate-200 bg-white shadow-2xs">
          <div className="text-[11px] font-semibold text-emerald-600 uppercase tracking-wider">
            Active
          </div>
          <div className="text-xl font-bold text-emerald-700 font-mono mt-1">
            {stats.active}
          </div>
        </div>
        <div className="p-3.5 rounded-xl border border-slate-200 bg-white shadow-2xs">
          <div className="text-[11px] font-semibold text-blue-600 uppercase tracking-wider">
            Bank / UPI Registered
          </div>
          <div className="text-xl font-bold text-blue-700 font-mono mt-1">
            {stats.withBank}
          </div>
        </div>
        <div className="p-3.5 rounded-xl border border-slate-200 bg-white shadow-2xs">
          <div className="text-[11px] font-semibold text-purple-600 uppercase tracking-wider">
            GST / PAN Registered
          </div>
          <div className="text-xl font-bold text-purple-700 font-mono mt-1">
            {stats.withTax}
          </div>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-3 bg-white">
        <div className="relative w-full sm:w-80">
          <Search
            size={15}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none"
          />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by name, phone, PAN, GST, UPI..."
            className="h-9 w-full rounded-md border border-slate-200 bg-white pl-9 pr-3 text-sm focus-visible:ring-1 focus-visible:ring-blue-600 placeholder:text-slate-400 text-slate-800 font-body shadow-2xs outline-none"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 text-xs"
            >
              Clear
            </button>
          )}
        </div>

        <div className="flex items-center gap-1.5 w-full sm:w-auto self-end">
          <span className="text-xs font-medium text-slate-500 mr-1">Status:</span>
          {['all', 'Active', 'Inactive'].map((status) => (
            <button
              key={status}
              type="button"
              onClick={() => setStatusFilter(status)}
              className={`h-8 px-3 rounded-md text-xs font-semibold capitalize transition-all cursor-pointer ${
                statusFilter === status
                  ? 'bg-slate-900 text-white shadow-2xs'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200/80'
              }`}
            >
              {status === 'all' ? 'All' : status}
            </button>
          ))}
        </div>
      </div>

      {/* Content Area */}
      {loading ? (
        <div className="flex flex-col items-center justify-center p-12 bg-white rounded-xl border border-slate-200">
          <Spinner size="lg" />
          <span className="text-xs text-slate-500 mt-2">Loading subcontractors...</span>
        </div>
      ) : filteredContractors.length === 0 ? (
        <div className="flex flex-col items-center justify-center p-12 bg-white rounded-2xl border border-slate-200 text-center shadow-2xs">
          <div className="w-12 h-12 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center mb-3">
            <HardHat size={24} />
          </div>
          <h3 className="text-base font-bold text-slate-900 font-heading">
            {searchQuery || statusFilter !== 'all' ? 'No matching contractors found' : 'No Sub-Contractors Yet'}
          </h3>
          <p className="text-xs text-slate-500 max-w-sm mt-1 mb-4 font-body">
            {searchQuery || statusFilter !== 'all'
              ? 'Try adjusting your search terms or filter settings.'
              : 'Add your first contractor profile to enable seamless payment tracking in Advance/Expense.'}
          </p>
          {!searchQuery && statusFilter === 'all' && (
            <button
              type="button"
              onClick={handleOpenAddModal}
              className="h-9 px-4 bg-blue-600 hover:bg-blue-700 text-white rounded-md text-sm font-bold font-heading shadow-sm flex items-center gap-1.5 transition-colors cursor-pointer"
            >
              <Plus size={16} />
              <span>Add First Contractor</span>
            </button>
          )}
        </div>
      ) : (
        /* Contractors Grid / Cards */
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredContractors.map((contractor) => {
            const hasBank = !!(contractor.bankAccount?.accountNumber || contractor.upi)
            const hasTax = !!(contractor.pan || contractor.gst)
            const isUserPermitted = canModify(contractor)

            return (
              <div
                key={contractor.id}
                className="bg-white border border-slate-200 rounded-xl p-4 shadow-2xs hover:shadow-md transition-shadow flex flex-col justify-between relative group"
              >
                <div>
                  {/* Card Header: Name, Status & Specialization */}
                  <div className="flex items-start justify-between gap-2 mb-2.5">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h2 className="text-base font-bold text-slate-900 font-heading truncate">
                          {contractor.name}
                        </h2>
                        <span
                          className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold ${
                            contractor.status === 'Inactive'
                              ? 'bg-slate-100 text-slate-600'
                              : 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                          }`}
                        >
                          {contractor.status || 'Active'}
                        </span>
                      </div>
                      {contractor.specialization && (
                        <span className="text-xs text-blue-600 font-medium font-body block mt-0.5">
                          {contractor.specialization}
                        </span>
                      )}
                    </div>

                    {/* Action buttons (Edit & Delete) */}
                    <div className="flex items-center gap-1 shrink-0">
                      {isUserPermitted && (
                        <>
                          <button
                            type="button"
                            title="Edit Contractor"
                            onClick={() => handleOpenEditModal(contractor)}
                            className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-md transition-colors cursor-pointer"
                          >
                            <Edit2 size={14} />
                          </button>
                          <button
                            type="button"
                            title="Delete Contractor"
                            onClick={() => setDeleteConfirmTarget(contractor)}
                            className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-md transition-colors cursor-pointer"
                          >
                            <Trash2 size={14} />
                          </button>
                        </>
                      )}
                    </div>
                  </div>

                  {/* Contact Info (Mobile, Emergency, Address) */}
                  <div className="space-y-1.5 text-xs text-slate-600 border-t border-slate-100 pt-2.5 mb-3 font-body">
                    {contractor.mobile && (
                      <div className="flex items-center gap-2">
                        <Phone size={13} className="text-slate-400 shrink-0" />
                        <span className="font-mono text-slate-800 font-medium">
                          {contractor.mobile}
                        </span>
                        {contractor.emergencyContact && (
                          <span className="text-[11px] text-slate-400 font-mono">
                            (Alt: {contractor.emergencyContact})
                          </span>
                        )}
                      </div>
                    )}

                    {contractor.address && (
                      <div className="flex items-start gap-2">
                        <MapPin size={13} className="text-slate-400 shrink-0 mt-0.5" />
                        <span className="line-clamp-2 text-slate-600">{contractor.address}</span>
                      </div>
                    )}

                    {contractor.bloodGroup && (
                      <div className="flex items-center gap-2">
                        <Heart size={13} className="text-rose-500 shrink-0" />
                        <span className="text-slate-700">
                          Blood Group:{' '}
                          <strong className="text-rose-700 font-mono">
                            {contractor.bloodGroup}
                          </strong>
                        </span>
                      </div>
                    )}
                  </div>

                  {/* Tax & Identification Pills (PAN, GST) */}
                  {hasTax && (
                    <div className="flex flex-wrap items-center gap-1.5 mb-3">
                      {contractor.pan && (
                        <div className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-slate-50 border border-slate-200 text-[11px] font-mono font-semibold text-slate-800">
                          <span className="text-[9px] uppercase text-slate-500 font-body">PAN:</span>
                          <span>{contractor.pan}</span>
                          <button
                            type="button"
                            onClick={() => handleCopy(contractor.pan, `pan-${contractor.id}`)}
                            title="Copy PAN"
                            className="text-slate-400 hover:text-slate-700 ml-0.5"
                          >
                            {copiedId === `pan-${contractor.id}` ? (
                              <Check size={11} className="text-emerald-600" />
                            ) : (
                              <Copy size={11} />
                            )}
                          </button>
                        </div>
                      )}

                      {contractor.gst && (
                        <div className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-slate-50 border border-slate-200 text-[11px] font-mono font-semibold text-slate-800">
                          <span className="text-[9px] uppercase text-slate-500 font-body">GST:</span>
                          <span>{contractor.gst}</span>
                          <button
                            type="button"
                            onClick={() => handleCopy(contractor.gst, `gst-${contractor.id}`)}
                            title="Copy GST"
                            className="text-slate-400 hover:text-slate-700 ml-0.5"
                          >
                            {copiedId === `gst-${contractor.id}` ? (
                              <Check size={11} className="text-emerald-600" />
                            ) : (
                              <Copy size={11} />
                            )}
                          </button>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Payment Info Box (Bank Account or UPI) */}
                  {hasBank && (
                    <div className="bg-slate-50/80 rounded-lg p-2.5 border border-slate-200/80 text-xs space-y-1 mb-2 font-body">
                      <div className="flex items-center justify-between text-[11px] font-semibold text-slate-600">
                        <span className="flex items-center gap-1 text-slate-700">
                          <CreditCard size={12} className="text-blue-600" />
                          <span>Payout Details</span>
                        </span>
                        {contractor.upi && (
                          <button
                            type="button"
                            onClick={() => handleCopy(contractor.upi, `upi-${contractor.id}`)}
                            className="flex items-center gap-1 text-[10px] text-blue-700 font-mono hover:underline cursor-pointer"
                          >
                            {copiedId === `upi-${contractor.id}` ? 'Copied!' : 'Copy UPI'}
                          </button>
                        )}
                      </div>

                      {contractor.bankAccount?.accountNumber && (
                        <div className="font-mono text-slate-800 text-[11px]">
                          <span className="text-slate-500">A/c:</span> {contractor.bankAccount.accountNumber}
                          {contractor.bankAccount.ifsc && (
                            <span className="ml-2 text-slate-500">IFSC: {contractor.bankAccount.ifsc}</span>
                          )}
                        </div>
                      )}

                      {contractor.bankAccount?.bankName && (
                        <div className="text-[11px] text-slate-600 truncate">
                          {contractor.bankAccount.bankName}
                        </div>
                      )}

                      {contractor.upi && (
                        <div className="font-mono text-blue-800 text-[11px] truncate">
                          UPI: {contractor.upi}
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* Card Footer: Quick Details action */}
                <div className="pt-2 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-500">
                  <span className="truncate">
                    Added by: {contractor.createdBy || 'Admin'}
                  </span>
                  <button
                    type="button"
                    onClick={() => setSelectedDetailsContractor(contractor)}
                    className="text-blue-600 hover:text-blue-800 font-semibold cursor-pointer"
                  >
                    View Details
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* ─────────────────────────────────────────────────────────────
          "NEW CONTRACTOR" / "EDIT CONTRACTOR" MODAL
          Strictly follows AGENTS.md design tokens & form rules
      ───────────────────────────────────────────────────────────── */}
      <Modal
        isOpen={isModalOpen}
        onClose={() => !isSubmitting && setIsModalOpen(false)}
        title={editingContractor ? 'Edit Sub-Contractor' : 'New Sub-Contractor'}
        size="3xl"
      >
        <form onSubmit={handleSubmit} className="p-5 sm:p-6 space-y-5 bg-white">
          {formErrors.submit && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-xs font-semibold text-red-700 flex items-center gap-2">
              <AlertCircle size={15} />
              <span>{formErrors.submit}</span>
            </div>
          )}

          {/* Section 1: Basic Profile */}
          <div>
            <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3 font-heading flex items-center gap-1.5">
              <Building size={14} className="text-blue-600" />
              <span>1. Basic Profile & Contact Details</span>
            </h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
              <div className="sm:col-span-2">
                <label className="block text-sm font-medium text-slate-800 mb-1.5 font-body">
                  Contractor / Firm Name <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={formData.name}
                  onChange={(e) => handleInputChange('name', e.target.value)}
                  placeholder="e.g. Sri Balaji Electricals / Rajesh Kumar"
                  className="h-9 w-full rounded-md border border-slate-200 bg-white px-3 py-1 text-sm focus-visible:ring-1 focus-visible:ring-blue-600 placeholder:text-slate-400 text-slate-800 font-body shadow-2xs outline-none"
                />
                {formErrors.name && (
                  <p className="text-xs text-red-600 mt-1">{formErrors.name}</p>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-800 mb-1.5 font-body">
                  Mobile Number
                </label>
                <input
                  type="text"
                  value={formData.mobile}
                  onChange={(e) => handleInputChange('mobile', e.target.value)}
                  placeholder="e.g. 9876543210"
                  className="h-9 w-full rounded-md border border-slate-200 bg-white px-3 py-1 text-sm font-mono focus-visible:ring-1 focus-visible:ring-blue-600 placeholder:text-slate-400 text-slate-800 shadow-2xs outline-none"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-800 mb-1.5 font-body">
                  Specialization / Trade
                </label>
                <input
                  type="text"
                  value={formData.specialization}
                  onChange={(e) => handleInputChange('specialization', e.target.value)}
                  placeholder="e.g. Civil, Electrical, Plumbing, Fabrication"
                  className="h-9 w-full rounded-md border border-slate-200 bg-white px-3 py-1 text-sm focus-visible:ring-1 focus-visible:ring-blue-600 placeholder:text-slate-400 text-slate-800 font-body shadow-2xs outline-none"
                />
              </div>

              <div className="sm:col-span-2">
                <label className="block text-sm font-medium text-slate-800 mb-1.5 font-body">
                  Address
                </label>
                <input
                  type="text"
                  value={formData.address}
                  onChange={(e) => handleInputChange('address', e.target.value)}
                  placeholder="Complete office or workshop address"
                  className="h-9 w-full rounded-md border border-slate-200 bg-white px-3 py-1 text-sm focus-visible:ring-1 focus-visible:ring-blue-600 placeholder:text-slate-400 text-slate-800 font-body shadow-2xs outline-none"
                />
              </div>
            </div>
          </div>

          {/* Section 2: Statutory Tax Identifiers (PAN & GST) */}
          <div className="border-t border-slate-200 pt-4">
            <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3 font-heading flex items-center gap-1.5">
              <ShieldCheck size={14} className="text-purple-600" />
              <span>2. Statutory Tax Details</span>
            </h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
              <div>
                <label className="block text-sm font-medium text-slate-800 mb-1.5 font-body">
                  PAN Number
                </label>
                <input
                  type="text"
                  maxLength={10}
                  value={formData.pan}
                  onChange={(e) => handleInputChange('pan', e.target.value)}
                  placeholder="e.g. ABCDE1234F"
                  className="h-9 w-full rounded-md border border-slate-200 bg-white px-3 py-1 text-sm font-mono uppercase focus-visible:ring-1 focus-visible:ring-blue-600 placeholder:text-slate-400 text-slate-800 shadow-2xs outline-none"
                />
                {formErrors.pan && (
                  <p className="text-xs text-red-600 mt-1">{formErrors.pan}</p>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-800 mb-1.5 font-body">
                  GST Number
                </label>
                <input
                  type="text"
                  maxLength={15}
                  value={formData.gst}
                  onChange={(e) => handleInputChange('gst', e.target.value)}
                  placeholder="e.g. 22AAAAA0000A1Z5"
                  className="h-9 w-full rounded-md border border-slate-200 bg-white px-3 py-1 text-sm font-mono uppercase focus-visible:ring-1 focus-visible:ring-blue-600 placeholder:text-slate-400 text-slate-800 shadow-2xs outline-none"
                />
                {formErrors.gst && (
                  <p className="text-xs text-red-600 mt-1">{formErrors.gst}</p>
                )}
              </div>
            </div>
          </div>

          {/* Section 3: Banking & Payout Details */}
          <div className="border-t border-slate-200 pt-4">
            <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3 font-heading flex items-center gap-1.5">
              <CreditCard size={14} className="text-emerald-600" />
              <span>3. Bank Account & UPI Details</span>
            </h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
              <div>
                <label className="block text-sm font-medium text-slate-800 mb-1.5 font-body">
                  Bank Name
                </label>
                <input
                  type="text"
                  value={formData.bankName}
                  onChange={(e) => handleInputChange('bankName', e.target.value)}
                  placeholder="e.g. HDFC Bank, SBI, ICICI"
                  className="h-9 w-full rounded-md border border-slate-200 bg-white px-3 py-1 text-sm focus-visible:ring-1 focus-visible:ring-blue-600 placeholder:text-slate-400 text-slate-800 font-body shadow-2xs outline-none"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-800 mb-1.5 font-body">
                  Account Number
                </label>
                <input
                  type="text"
                  value={formData.accountNumber}
                  onChange={(e) => handleInputChange('accountNumber', e.target.value)}
                  placeholder="Bank Account Number"
                  className="h-9 w-full rounded-md border border-slate-200 bg-white px-3 py-1 text-sm font-mono focus-visible:ring-1 focus-visible:ring-blue-600 placeholder:text-slate-400 text-slate-800 shadow-2xs outline-none"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-800 mb-1.5 font-body">
                  IFSC Code
                </label>
                <input
                  type="text"
                  maxLength={11}
                  value={formData.ifsc}
                  onChange={(e) => handleInputChange('ifsc', e.target.value)}
                  placeholder="e.g. HDFC0001234"
                  className="h-9 w-full rounded-md border border-slate-200 bg-white px-3 py-1 text-sm font-mono uppercase focus-visible:ring-1 focus-visible:ring-blue-600 placeholder:text-slate-400 text-slate-800 shadow-2xs outline-none"
                />
                {formErrors.ifsc && (
                  <p className="text-xs text-red-600 mt-1">{formErrors.ifsc}</p>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-800 mb-1.5 font-body">
                  UPI ID (VPA)
                </label>
                <input
                  type="text"
                  value={formData.upi}
                  onChange={(e) => handleInputChange('upi', e.target.value)}
                  placeholder="e.g. contractor@okaxis / 9876543210@paytm"
                  className="h-9 w-full rounded-md border border-slate-200 bg-white px-3 py-1 text-sm font-mono focus-visible:ring-1 focus-visible:ring-blue-600 placeholder:text-slate-400 text-slate-800 shadow-2xs outline-none"
                />
              </div>
            </div>
          </div>

          {/* Section 4: Emergency Contact & Blood Group */}
          <div className="border-t border-slate-200 pt-4">
            <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3 font-heading flex items-center gap-1.5">
              <Heart size={14} className="text-rose-600" />
              <span>4. Emergency & Medical Info</span>
            </h4>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
              <div>
                <label className="block text-sm font-medium text-slate-800 mb-1.5 font-body">
                  Emergency Contact No.
                </label>
                <input
                  type="text"
                  value={formData.emergencyContact}
                  onChange={(e) => handleInputChange('emergencyContact', e.target.value)}
                  placeholder="e.g. 9876543211"
                  className="h-9 w-full rounded-md border border-slate-200 bg-white px-3 py-1 text-sm font-mono focus-visible:ring-1 focus-visible:ring-blue-600 placeholder:text-slate-400 text-slate-800 shadow-2xs outline-none"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-800 mb-1.5 font-body">
                  Blood Group
                </label>
                <select
                  value={formData.bloodGroup}
                  onChange={(e) => handleInputChange('bloodGroup', e.target.value)}
                  className="h-9 w-full rounded-md border border-slate-200 bg-white px-3 py-1 text-sm focus-visible:ring-1 focus-visible:ring-blue-600 text-slate-800 font-body shadow-2xs outline-none cursor-pointer"
                >
                  <option value="">Select Blood Group...</option>
                  {BLOOD_GROUPS.map((bg) => (
                    <option key={bg} value={bg}>
                      {bg}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-800 mb-1.5 font-body">
                  Account Status
                </label>
                <select
                  value={formData.status}
                  onChange={(e) => handleInputChange('status', e.target.value)}
                  className="h-9 w-full rounded-md border border-slate-200 bg-white px-3 py-1 text-sm focus-visible:ring-1 focus-visible:ring-blue-600 text-slate-800 font-body shadow-2xs outline-none cursor-pointer"
                >
                  <option value="Active">Active</option>
                  <option value="Inactive">Inactive</option>
                </select>
              </div>
            </div>
          </div>

          {/* Modal Footer Buttons */}
          <div className="border-t border-slate-200 pt-4 flex items-center justify-end gap-2.5">
            <button
              type="button"
              disabled={isSubmitting}
              onClick={() => setIsModalOpen(false)}
              className="h-9 px-4 border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 rounded-md text-sm font-medium transition-colors cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="h-9 px-6 bg-blue-600 hover:bg-blue-700 text-white rounded-md text-sm font-bold font-heading shadow-sm flex items-center gap-1.5 transition-colors cursor-pointer active:scale-[0.98] disabled:opacity-50"
            >
              {isSubmitting ? (
                <>
                  <Spinner size="sm" />
                  <span>Saving...</span>
                </>
              ) : (
                <span>{editingContractor ? 'Save Changes' : 'Create Contractor'}</span>
              )}
            </button>
          </div>
        </form>
      </Modal>

      {/* ─────────────────────────────────────────────────────────────
          DELETE CONFIRMATION MODAL
      ───────────────────────────────────────────────────────────── */}
      {deleteConfirmTarget && (
        <Modal
          isOpen={true}
          onClose={() => setDeleteConfirmTarget(null)}
          title="Delete Sub-Contractor"
          size="lg"
        >
          <div className="p-5 sm:p-6 space-y-4 bg-white">
            <div className="flex items-center gap-3 p-3 bg-amber-50 border border-amber-200 rounded-xl text-amber-900 text-xs font-body">
              <AlertCircle size={20} className="text-amber-600 shrink-0" />
              <span>
                Are you sure you want to delete <strong>{deleteConfirmTarget.name}</strong>?
                This action cannot be undone. Historical expenses logged against this contractor will remain intact.
              </span>
            </div>

            <div className="flex items-center justify-end gap-2.5 pt-2">
              <button
                type="button"
                onClick={() => setDeleteConfirmTarget(null)}
                className="h-9 px-4 border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 rounded-md text-sm font-medium transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmDelete}
                className="h-9 px-6 bg-red-600 hover:bg-red-700 text-white rounded-md text-sm font-bold font-heading shadow-sm transition-colors cursor-pointer active:scale-[0.98]"
              >
                Yes, Delete
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* ─────────────────────────────────────────────────────────────
          DETAILS VIEW MODAL
      ───────────────────────────────────────────────────────────── */}
      {selectedDetailsContractor && (
        <Modal
          isOpen={true}
          onClose={() => setSelectedDetailsContractor(null)}
          title={`Contractor: ${selectedDetailsContractor.name}`}
          size="2xl"
        >
          <div className="p-5 sm:p-6 space-y-4 bg-white font-body text-xs text-slate-700">
            <div className="grid grid-cols-2 gap-3 p-4 bg-slate-50 rounded-xl border border-slate-200">
              <div>
                <span className="text-[10px] text-slate-500 uppercase font-semibold block">
                  Status
                </span>
                <span className="font-semibold text-slate-900">
                  {selectedDetailsContractor.status || 'Active'}
                </span>
              </div>
              <div>
                <span className="text-[10px] text-slate-500 uppercase font-semibold block">
                  Specialization
                </span>
                <span className="font-semibold text-slate-900">
                  {selectedDetailsContractor.specialization || 'General Contractor'}
                </span>
              </div>
              <div>
                <span className="text-[10px] text-slate-500 uppercase font-semibold block">
                  Phone
                </span>
                <span className="font-mono font-semibold text-slate-900">
                  {selectedDetailsContractor.mobile || 'N/A'}
                </span>
              </div>
              <div>
                <span className="text-[10px] text-slate-500 uppercase font-semibold block">
                  Emergency Contact
                </span>
                <span className="font-mono font-semibold text-slate-900">
                  {selectedDetailsContractor.emergencyContact || 'N/A'}
                </span>
              </div>
              <div>
                <span className="text-[10px] text-slate-500 uppercase font-semibold block">
                  Blood Group
                </span>
                <span className="font-mono font-semibold text-rose-700">
                  {selectedDetailsContractor.bloodGroup || 'N/A'}
                </span>
              </div>
              <div>
                <span className="text-[10px] text-slate-500 uppercase font-semibold block">
                  Address
                </span>
                <span className="text-slate-800">
                  {selectedDetailsContractor.address || 'N/A'}
                </span>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 p-4 bg-slate-50 rounded-xl border border-slate-200">
              <div>
                <span className="text-[10px] text-slate-500 uppercase font-semibold block">
                  PAN
                </span>
                <span className="font-mono font-semibold text-slate-900">
                  {selectedDetailsContractor.pan || 'N/A'}
                </span>
              </div>
              <div>
                <span className="text-[10px] text-slate-500 uppercase font-semibold block">
                  GST
                </span>
                <span className="font-mono font-semibold text-slate-900">
                  {selectedDetailsContractor.gst || 'N/A'}
                </span>
              </div>
              <div>
                <span className="text-[10px] text-slate-500 uppercase font-semibold block">
                  Bank Name
                </span>
                <span className="font-semibold text-slate-900">
                  {selectedDetailsContractor.bankAccount?.bankName || 'N/A'}
                </span>
              </div>
              <div>
                <span className="text-[10px] text-slate-500 uppercase font-semibold block">
                  Account Number
                </span>
                <span className="font-mono font-semibold text-slate-900">
                  {selectedDetailsContractor.bankAccount?.accountNumber || 'N/A'}
                </span>
              </div>
              <div>
                <span className="text-[10px] text-slate-500 uppercase font-semibold block">
                  IFSC
                </span>
                <span className="font-mono font-semibold text-slate-900">
                  {selectedDetailsContractor.bankAccount?.ifsc || 'N/A'}
                </span>
              </div>
              <div>
                <span className="text-[10px] text-slate-500 uppercase font-semibold block">
                  UPI ID
                </span>
                <span className="font-mono font-semibold text-blue-700">
                  {selectedDetailsContractor.upi || 'N/A'}
                </span>
              </div>
            </div>

            <div className="flex justify-end pt-2">
              <button
                type="button"
                onClick={() => setSelectedDetailsContractor(null)}
                className="h-9 px-6 bg-slate-900 hover:bg-slate-800 text-white rounded-md text-sm font-semibold transition-colors cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  )
}
