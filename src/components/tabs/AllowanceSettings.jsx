import React, { useState, useMemo } from 'react'
import { useAuth } from '../../hooks/useAuth'
import { useEmployees } from '../../hooks/useEmployees'
import { useAllowanceCategories } from '../../hooks/useAllowances'
import { Trash2, Edit, Plus, Users, Clock, IndianRupee, Search } from 'lucide-react'
import { RULE_TYPE_TIME } from '../../lib/allowanceRules'
import Modal from '../ui/Modal'

const panel = 'rounded-xl border border-slate-200/80 bg-white shadow-[0_24px_80px_rgba(15,23,42,0.08)]'
const inset = 'rounded-lg border border-slate-200 bg-slate-50/70'
const input = 'w-full h-11 rounded-lg border border-slate-200 bg-white px-4 text-[13px] text-slate-800 outline-none transition-all placeholder:text-slate-400 focus:border-indigo-400 focus:ring-4 focus:ring-indigo-100'
const sectionLabel = 'mb-2 block text-[11px] font-semibold uppercase tracking-[0.14em] leading-tight text-slate-700'

function EmptyCategory() {
  return {
    name: '',
    amount: '',
    ruleType: RULE_TYPE_TIME,
    thresholdTime: '21:00',
    assignedEmployeeIds: [],
    assignAll: true,
    active: true,
  }
}

export default function AllowanceSettings() {
  const { user } = useAuth()
  const { employees } = useEmployees(user?.orgId)
  const { categories, loading, addCategory, updateCategory, deleteCategory } = useAllowanceCategories(user?.orgId)

  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState(null)
  const [form, setForm] = useState(EmptyCategory())
  const [saving, setSaving] = useState(false)
  const [empSearch, setEmpSearch] = useState('')

  const activeEmployees = useMemo(() => employees.filter(e => e.status === 'Active'), [employees])

  const openCreate = () => {
    setEditingId(null)
    setForm(EmptyCategory())
    setShowForm(true)
  }

  const openEdit = (cat) => {
    setEditingId(cat.id)
    setForm({
      name: cat.name || '',
      amount: cat.amount != null ? String(cat.amount) : '',
      ruleType: cat.rule?.ruleType || RULE_TYPE_TIME,
      thresholdTime: cat.rule?.thresholdTime || '21:00',
      assignedEmployeeIds: Array.isArray(cat.assignedEmployeeIds) ? cat.assignedEmployeeIds : [],
      assignAll: !Array.isArray(cat.assignedEmployeeIds) || cat.assignedEmployeeIds.length === 0,
      active: cat.active !== false,
    })
    setShowForm(true)
  }

  const toggleEmployee = (empId) => {
    setForm(prev => {
      const current = prev.assignAll ? [] : prev.assignedEmployeeIds
      const next = current.includes(empId)
        ? current.filter(id => id !== empId)
        : [...current, empId]
      return { ...prev, assignedEmployeeIds: next, assignAll: false }
    })
  }

  const handleSave = async () => {
    if (!form.name.trim()) return alert('Allowance category name is required')
    const amount = Number(form.amount)
    if (!Number.isFinite(amount) || amount < 0) return alert('Please enter a valid allowance amount')

    const payload = {
      name: form.name.trim(),
      amount,
      rule: {
        ruleType: RULE_TYPE_TIME,
        thresholdTime: form.thresholdTime || '21:00',
        afterTime: true,
      },
      assignedEmployeeIds: form.assignAll ? [] : form.assignedEmployeeIds,
      active: form.active,
    }

    setSaving(true)
    try {
      if (editingId) {
        await updateCategory(editingId, payload)
      } else {
        await addCategory(payload)
      }
      setShowForm(false)
    } catch (err) {
      alert('Failed to save: ' + err.message)
    } finally {
      setSaving(false)
    }
  }

  const filteredEmployees = useMemo(() => {
    const q = empSearch.trim().toLowerCase()
    if (!q) return activeEmployees
    return activeEmployees.filter(e =>
      e.name?.toLowerCase().includes(q) || e.empCode?.toLowerCase().includes(q)
    )
  }, [activeEmployees, empSearch])

  return (
    <div className="grid max-w-6xl grid-cols-1 gap-5 xl:grid-cols-[0.9fr_1.1fr] no-print">
      {/* Left: intro + create */}
      <div className={`${panel} p-6 md:p-7`}>
        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] leading-tight text-indigo-600">Allowance policy</p>
        <h3 className="mt-2 text-[22px] font-normal tracking-[-0.03em] text-slate-950">Allowance Settings</h3>
        <p className="mt-2 text-[13px] leading-6 text-slate-500">
          Create rule-based allowances (food, tea, travel, night shift) and assign them to employees.
          When attendance meets the rule, the allowance can be claimed right from the attendance sheet.
        </p>

        <div className={`${inset} mt-6 space-y-4 p-5`}>
          <div className="flex items-start gap-3">
            <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-indigo-50 text-indigo-600">
              <Clock size={15} />
            </div>
            <p className="text-[12px] leading-5 text-slate-500">
              <span className="font-semibold text-slate-700">Time-based rule:</span> the allowance checkbox appears on the
              attendance sheet when the employee's out time is after the configured threshold (e.g. Night Food after 9 PM).
            </p>
          </div>
          <div className="flex items-start gap-3">
            <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600">
              <Users size={15} />
            </div>
            <p className="text-[12px] leading-5 text-slate-500">
              <span className="font-semibold text-slate-700">Assignment:</span> choose specific employees or apply to the whole
              team. Amount is fixed per category and auto-filled on claim.
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={openCreate}
          className="mt-6 inline-flex items-center gap-2 rounded-2xl bg-slate-950 px-4 py-3 text-[12px] font-normal uppercase tracking-[0.16em] text-white transition-all hover:bg-slate-800"
        >
          <Plus size={14} />
          Create Allowance
        </button>
      </div>

      {/* Right: list */}
      <div className={`${panel} overflow-hidden`}>
        <div className="flex items-center justify-between border-b border-slate-200 px-6 py-5">
          <div>
            <p className="text-[10px] font-normal uppercase tracking-[0.18em] text-slate-400">Configured rules</p>
            <h4 className="mt-2 text-[18px] font-normal tracking-[-0.03em] text-slate-950">{categories.length} Allowances</h4>
          </div>
          <div className="rounded-full bg-indigo-50 px-3 py-1 text-[10px] font-normal uppercase tracking-[0.18em] text-indigo-600">
            Rule based
          </div>
        </div>

        {loading ? (
          <div className="px-6 py-12 text-center text-[13px] font-medium text-slate-400">Loading allowances...</div>
        ) : categories.length === 0 ? (
          <div className="px-6 py-12 text-center text-[13px] font-medium text-slate-400">
            No allowances configured yet. Create one to get started.
          </div>
        ) : (
          <div className="divide-y divide-slate-200">
            {categories.map((cat, i) => {
              const amount = Number(cat.amount)
              const assigned = Array.isArray(cat.assignedEmployeeIds) ? cat.assignedEmployeeIds : []
              const assignAll = assigned.length === 0
              const covered = assignAll ? activeEmployees.length : assigned.filter(id => employees.some(e => e.id === id)).length
              return (
                <div key={cat.id} className={`flex items-center justify-between gap-4 px-6 py-4 ${i % 2 === 0 ? 'bg-white' : 'bg-slate-50/80'}`}>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-[13px] font-normal text-slate-900">{cat.name}</p>
                      {!cat.active && (
                        <span className="rounded-full bg-rose-50 px-2 py-0.5 text-[9px] font-semibold uppercase tracking-widest text-rose-500">Inactive</span>
                      )}
                    </div>
                    <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-slate-500">
                      <span className="inline-flex items-center gap-1 font-medium text-emerald-600">
                        <IndianRupee size={11} />{Number.isFinite(amount) ? amount.toLocaleString('en-IN') : 0}
                      </span>
                      <span className="inline-flex items-center gap-1">
                        <Clock size={11} />After {cat.rule?.thresholdTime || '21:00'}
                      </span>
                      <span className="inline-flex items-center gap-1">
                        <Users size={11} />{assignAll ? 'All employees' : `${covered} employees`}
                      </span>
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    <button
                      type="button"
                      onClick={() => updateCategory(cat.id, { active: !cat.active })}
                      className={`relative h-6 w-11 rounded-full transition-colors ${cat.active ? 'bg-emerald-500' : 'bg-slate-300'}`}
                      title={cat.active ? 'Click to disable' : 'Click to enable'}
                    >
                      <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${cat.active ? 'left-[22px]' : 'left-0.5'}`} />
                    </button>
                    <button type="button" onClick={() => openEdit(cat)} className="rounded-2xl p-2 text-slate-400 transition-all hover:bg-indigo-50 hover:text-indigo-500">
                      <Edit size={16} />
                    </button>
                    <button
                      type="button"
                      onClick={() => { if (confirm(`Delete allowance "${cat.name}"? Past claims are kept.`)) deleteCategory(cat.id) }}
                      className="rounded-2xl p-2 text-slate-400 transition-all hover:bg-rose-50 hover:text-rose-500"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Create / edit modal */}
      <Modal isOpen={showForm} onClose={() => setShowForm(false)} title={editingId ? 'Edit Allowance' : 'Create Allowance'} size="2xl">
        <div className="space-y-6 p-6">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className={sectionLabel}>Allowance Name</label>
              <input
                type="text"
                value={form.name}
                onChange={e => setForm(prev => ({ ...prev, name: e.target.value }))}
                className={input}
                placeholder="e.g. Night Food Allowance"
              />
            </div>
            <div>
              <label className={sectionLabel}>Fixed Amount (₹)</label>
              <input
                type="number"
                min="0"
                step="1"
                value={form.amount}
                onChange={e => setForm(prev => ({ ...prev, amount: e.target.value }))}
                className={input}
                placeholder="e.g. 100"
              />
            </div>
          </div>

          <div className={`${inset} p-4`}>
            <label className={sectionLabel}>Rule — Show checkbox when out time is after</label>
            <div className="flex items-center gap-3">
              <input
                type="time"
                value={form.thresholdTime}
                onChange={e => setForm(prev => ({ ...prev, thresholdTime: e.target.value }))}
                className={`${input} !h-11 !px-3`}
              />
              <p className="text-[12px] text-slate-500">e.g. 21:00 means after 9 PM on the attendance sheet.</p>
            </div>
          </div>

          <div>
            <label className={sectionLabel}>Assign to employees</label>
            <div className="mb-3 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setForm(prev => prev.assignAll
                  ? { ...prev, assignAll: false, assignedEmployeeIds: [] }
                  : { ...prev, assignAll: true, assignedEmployeeIds: [] })}
                className={`rounded-full px-3 py-1.5 text-[11px] font-medium transition-colors ${
                  form.assignAll ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                All employees
              </button>
              <div className="relative">
                <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  value={empSearch}
                  onChange={e => setEmpSearch(e.target.value)}
                  placeholder="Search employee..."
                  className="h-9 w-56 rounded-lg border border-slate-200 bg-white pl-8 pr-3 text-[12px] outline-none focus:border-indigo-400 focus:ring-4 focus:ring-indigo-100"
                />
              </div>
            </div>

            <div className={`${inset} max-h-60 overflow-y-auto p-2`}>
              {filteredEmployees.length === 0 ? (
                <p className="px-3 py-6 text-center text-[12px] text-slate-400">No active employees found.</p>
              ) : (
                filteredEmployees.map(emp => {
                  const checked = form.assignAll || form.assignedEmployeeIds.includes(emp.id)
                  return (
                    <label key={emp.id} className="flex cursor-pointer items-center gap-2.5 rounded-lg px-2 py-1.5 hover:bg-white">
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggleEmployee(emp.id)}
                        className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                      />
                      <span className="text-[12px] text-slate-700">{emp.name}</span>
                      {emp.empCode && <span className="text-[10px] text-slate-400">{emp.empCode}</span>}
                    </label>
                  )
                })
              )}
            </div>
          </div>

          <div className="flex justify-end gap-3 border-t border-slate-100 pt-4">
            <button
              type="button"
              onClick={() => setShowForm(false)}
              className="rounded-xl px-4 py-2.5 text-[12px] font-medium uppercase tracking-[0.12em] text-slate-500 hover:bg-slate-100 transition-colors"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={saving}
              className="rounded-xl bg-indigo-600 px-6 py-2.5 text-[12px] font-medium uppercase tracking-[0.12em] text-white transition-all hover:bg-indigo-700 disabled:opacity-50"
            >
              {saving ? 'Saving...' : editingId ? 'Save Changes' : 'Create Allowance'}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
