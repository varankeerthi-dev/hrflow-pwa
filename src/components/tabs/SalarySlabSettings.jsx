import React, { useEffect, useState } from 'react'
import { useAuth } from '../../hooks/useAuth'
import { useEmployees } from '../../hooks/useEmployees'
import { useSalarySlab } from '../../hooks/useSalarySlab'
import { db } from '../../lib/firebase'
import { doc, getDocs, setDoc } from 'firebase/firestore'
import { salarySlipWindowsCol } from '../../lib/firestore'
import Spinner from '../ui/Spinner'
import { Calendar as CalendarIcon, Plus, Save, TrendingUp, Wallet } from 'lucide-react'

const panelClassName = 'rounded-[28px] border border-slate-200 bg-white shadow-[0_24px_80px_rgba(15,23,42,0.08)]'
const insetClassName = 'rounded-[22px] border border-slate-200 bg-slate-50/80'
const inputClassName = 'w-full h-11 rounded-2xl border border-slate-200 bg-white px-4 text-[13px] text-slate-800 outline-none transition-all placeholder:text-slate-400 focus:border-indigo-400 focus:ring-4 focus:ring-indigo-100'
const headCellClassName = 'px-5 py-3 text-[10px] font-black uppercase tracking-[0.18em] text-slate-500'
const bodyCellClassName = 'px-5 py-4 text-[13px] text-slate-700'

export default function SalarySlabSettings() {
  const { user } = useAuth()
  const { employees, loading: empLoading } = useEmployees(user?.orgId)
  const { slabs, increments, loading: slabLoading, saveSlab } = useSalarySlab(user?.orgId)

  const [activeTab, setActiveTab] = useState('structure')
  const [forms, setForms] = useState({})
  const [newInc, setNewInc] = useState({ employeeId: '', newSalary: 0, effectiveFrom: '', reason: '' })
  const [windows, setWindows] = useState([])
  const [newWindow, setNewWindow] = useState({ month: '', viewFrom: '', viewUntil: '' })

  useEffect(() => {
    const initialForms = {}
    employees.forEach(emp => {
      const slab = slabs[emp.id] || { totalSalary: 0, basicPercent: 40, hraPercent: 20, incomeTaxPercent: 0, pfPercent: 0, esiPercent: 0, includeInPayroll: emp.includeInSalary !== false }
      initialForms[emp.id] = { ...slab, includeInPayroll: slab.includeInPayroll !== false }
    })
    setForms(initialForms)
  }, [employees, slabs])

  useEffect(() => {
    const loadWindows = async () => {
      if (!user?.orgId) return
      const snap = await getDocs(salarySlipWindowsCol(user.orgId))
      setWindows(snap.docs.map(d => ({ id: d.id, ...d.data() })))
    }
    loadWindows()
  }, [user?.orgId])

  const handleFormChange = (empId, field, value) => {
    setForms(prev => ({ ...prev, [empId]: { ...prev[empId], [field]: value } }))
  }

  const handleSaveStructure = async (empId) => {
    const form = forms[empId]
    if (!form || !form.totalSalary) {
      alert('Please enter a valid CTC amount')
      return
    }
    const d = new Date()
    const month = String(d.getMonth() + 1).padStart(2, '0')
    const year = d.getFullYear()

    try {
      await saveSlab(empId, {
        totalSalary: Number(form.totalSalary),
        basicPercent: Number(form.basicPercent) || 40,
        hraPercent: Number(form.hraPercent) || 20,
        incomeTaxPercent: Number(form.incomeTaxPercent) || 0,
        pfPercent: Number(form.pfPercent) || 0,
        esiPercent: Number(form.esiPercent) || 0,
        includeInPayroll: form.includeInPayroll,
        effectiveFrom: `${year}-${month}`,
        reason: 'Structure Update',
      })
      alert('Structure updated successfully')
    } catch (err) {
      console.error('Save error:', err)
      alert('Failed to save: ' + err.message)
    }
  }

  const handleSaveIncrement = async () => {
    if (!newInc.employeeId || !newInc.newSalary || !newInc.effectiveFrom) {
      alert('Missing required fields')
      return
    }
    const currentSlab = slabs[newInc.employeeId] || { basicPercent: 40, hraPercent: 20, incomeTaxPercent: 0, pfPercent: 0, includeInPayroll: true }

    await saveSlab(newInc.employeeId, {
      ...currentSlab,
      totalSalary: Number(newInc.newSalary),
      effectiveFrom: newInc.effectiveFrom,
      reason: newInc.reason || 'Annual Increment',
    })
    setNewInc({ employeeId: '', newSalary: 0, effectiveFrom: '', reason: '' })
    alert('Increment logged successfully')
  }

  const handleSaveWindow = async () => {
    if (!user?.orgId) return
    if (!newWindow.month || !newWindow.viewFrom || !newWindow.viewUntil) {
      alert('All fields are required')
      return
    }
    await setDoc(
      doc(db, 'organisations', user.orgId, 'salarySlipWindows', newWindow.month),
      {
        month: newWindow.month,
        viewFrom: newWindow.viewFrom,
        viewUntil: newWindow.viewUntil,
      }
    )
    const snap = await getDocs(salarySlipWindowsCol(user.orgId))
    setWindows(snap.docs.map(d => ({ id: d.id, ...d.data() })))
    setNewWindow({ month: '', viewFrom: '', viewUntil: '' })
  }

  if (empLoading || slabLoading) return <div className="py-12 text-center"><Spinner /></div>

  const payrollEnabledCount = Object.values(forms).filter(form => form?.includeInPayroll).length
  const statCards = [
    { label: 'Employees', value: employees.length, helper: `${payrollEnabledCount} in payroll` },
    { label: 'Increments', value: increments.length, helper: 'Logged history' },
    { label: 'Release Windows', value: windows.length, helper: 'Visible periods' },
  ]

  const tabs = [
    { id: 'structure', label: 'Structure', icon: Wallet },
    { id: 'increment', label: 'Increments', icon: TrendingUp },
    { id: 'release', label: 'Release', icon: CalendarIcon },
  ]

  return (
    <div className="space-y-5 font-inter no-print">
      <div className="overflow-hidden rounded-[30px] border border-slate-200 bg-[radial-gradient(circle_at_top_left,_rgba(99,102,241,0.14),_transparent_34%),linear-gradient(180deg,_#ffffff_0%,_#f8fbff_100%)] shadow-[0_28px_100px_rgba(15,23,42,0.10)]">
        <div className="px-5 py-6 md:px-7 md:py-7">
          <div className="flex flex-col gap-6 xl:flex-row xl:items-end xl:justify-between">
            <div className="max-w-2xl">
              <div className="inline-flex items-center gap-2 rounded-full border border-indigo-100 bg-white/80 px-3 py-1 text-[10px] font-black uppercase tracking-[0.22em] text-indigo-600 shadow-sm">
                <span className="h-2 w-2 rounded-full bg-indigo-500" />
                Payroll configuration
              </div>
              <h3 className="mt-4 text-[28px] font-black tracking-[-0.04em] text-slate-950 md:text-[32px]">
                Salary Slab Settings
              </h3>
              <p className="mt-3 max-w-xl text-[13px] leading-6 text-slate-600 md:text-[14px]">
                Structure compensation, track salary changes, and manage slip release timing from one clean payroll workspace.
              </p>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              {statCards.map(card => (
                <div key={card.label} className="rounded-[22px] border border-white/80 bg-white/85 px-4 py-4 shadow-sm backdrop-blur">
                  <p className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-400">{card.label}</p>
                  <p className="mt-2 text-[24px] font-black tracking-[-0.04em] text-slate-950">{card.value}</p>
                  <p className="mt-1 text-[11px] font-medium text-slate-500">{card.helper}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="mt-6 flex flex-wrap gap-3">
            {tabs.map(tab => {
              const Icon = tab.icon
              const isActive = activeTab === tab.id
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActiveTab(tab.id)}
                  className={`inline-flex items-center gap-2 rounded-full border px-4 py-2.5 text-[12px] font-black uppercase tracking-[0.16em] transition-all ${
                    isActive
                      ? 'border-slate-900 bg-slate-950 text-white shadow-lg'
                      : 'border-slate-200 bg-white text-slate-600 hover:border-indigo-200 hover:text-indigo-600'
                  }`}
                >
                  <Icon size={14} />
                  {tab.label}
                </button>
              )
            })}
          </div>
        </div>
      </div>

      {activeTab === 'structure' && (
        <div className={`${panelClassName} overflow-hidden`}>
          <div className="flex items-center justify-between border-b border-slate-200 px-6 py-5">
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-400">Salary design</p>
              <h4 className="mt-2 text-[20px] font-black tracking-[-0.03em] text-slate-950">Payroll Structure Definitions</h4>
            </div>
            <div className="rounded-full bg-emerald-50 px-3 py-1 text-[10px] font-black uppercase tracking-[0.18em] text-emerald-600">
              Live configuration
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-left">
              <thead>
                <tr className="bg-slate-50">
                  <th className={headCellClassName}>Payroll</th>
                  <th className={headCellClassName}>Employee</th>
                  <th className={headCellClassName}>Gross CTC</th>
                  <th className={headCellClassName}>Earnings (Basic % / HRA %)</th>
                  <th className={headCellClassName}>Deductions (Tax % / PF % / ESI %)</th>
                  <th className={`${headCellClassName} text-right`}>Save</th>
                </tr>
              </thead>
              <tbody>
                {employees.map((emp, index) => {
                  const form = forms[emp.id]
                  if (!form) return null

                  return (
                    <tr key={emp.id} className={index % 2 === 0 ? 'bg-white' : 'bg-slate-50/80'}>
                      <td className={bodyCellClassName}>
                        <input
                          type="checkbox"
                          checked={form.includeInPayroll}
                          onChange={e => handleFormChange(emp.id, 'includeInPayroll', e.target.checked)}
                          className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                        />
                      </td>
                      <td className={bodyCellClassName}>
                        <div>
                          <p className="font-bold text-slate-900">{emp.name}</p>
                          <p className="mt-1 text-[11px] uppercase tracking-[0.12em] text-slate-500">{emp.department || 'General'}</p>
                        </div>
                      </td>
                      <td className={bodyCellClassName}>
                        <input
                          type="number"
                          value={form.totalSalary}
                          onChange={e => handleFormChange(emp.id, 'totalSalary', e.target.value)}
                          className="h-10 w-32 rounded-2xl border border-slate-200 bg-white px-3 text-[13px] font-bold text-slate-900 outline-none focus:border-indigo-400 focus:ring-4 focus:ring-indigo-100"
                        />
                      </td>
                      <td className={bodyCellClassName}>
                        <div className="flex items-center gap-3">
                          <div className="flex items-center gap-1">
                            <p className="text-[9px] font-bold uppercase tracking-[0.12em] text-emerald-600">Basic</p>
                            <input
                              type="number"
                              max="999"
                              value={form.basicPercent}
                              onChange={e => handleFormChange(emp.id, 'basicPercent', e.target.value)}
                              className="h-8 w-12 rounded-lg border border-slate-200 bg-white px-1 text-center text-[11px] font-bold text-slate-900 outline-none focus:border-emerald-400"
                            />
                          </div>
                          <div className="flex items-center gap-1">
                            <p className="text-[9px] font-bold uppercase tracking-[0.12em] text-emerald-600">HRA</p>
                            <input
                              type="number"
                              max="999"
                              value={form.hraPercent}
                              onChange={e => handleFormChange(emp.id, 'hraPercent', e.target.value)}
                              className="h-8 w-12 rounded-lg border border-slate-200 bg-white px-1 text-center text-[11px] font-bold text-slate-900 outline-none focus:border-emerald-400"
                            />
                          </div>
                        </div>
                      </td>
                      <td className={bodyCellClassName}>
                        <div className="flex items-center gap-3">
                          <div className="flex items-center gap-1">
                            <p className="text-[9px] font-bold uppercase tracking-[0.12em] text-rose-500">Tax</p>
                            <input
                              type="number"
                              max="999"
                              value={form.incomeTaxPercent}
                              onChange={e => handleFormChange(emp.id, 'incomeTaxPercent', e.target.value)}
                              className="h-8 w-12 rounded-lg border border-slate-200 bg-white px-1 text-center text-[11px] font-bold text-slate-900 outline-none focus:border-rose-400"
                            />
                          </div>
                          <div className="flex items-center gap-1">
                            <p className="text-[9px] font-bold uppercase tracking-[0.12em] text-rose-500">PF</p>
                            <input
                              type="number"
                              max="999"
                              value={form.pfPercent}
                              onChange={e => handleFormChange(emp.id, 'pfPercent', e.target.value)}
                              className="h-8 w-12 rounded-lg border border-slate-200 bg-white px-1 text-center text-[11px] font-bold text-slate-900 outline-none focus:border-rose-400"
                            />
                          </div>
                          <div className="flex items-center gap-1">
                            <p className="text-[9px] font-bold uppercase tracking-[0.12em] text-rose-500">ESI</p>
                            <input
                              type="number"
                              max="999"
                              value={form.esiPercent}
                              onChange={e => handleFormChange(emp.id, 'esiPercent', e.target.value)}
                              className="h-8 w-12 rounded-lg border border-slate-200 bg-white px-1 text-center text-[11px] font-bold text-slate-900 outline-none focus:border-rose-400"
                            />
                          </div>
                        </div>
                      </td>
                      <td className={`${bodyCellClassName} text-right`}>
                        <button
                          type="button"
                          onClick={() => handleSaveStructure(emp.id)}
                          className="inline-flex items-center gap-2 rounded-2xl bg-slate-950 px-4 py-2.5 text-[11px] font-black uppercase tracking-[0.16em] text-white transition-all hover:bg-slate-800"
                        >
                          <Save size={14} />
                          Update
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {activeTab === 'increment' && (
        <div className="grid grid-cols-1 gap-5 xl:grid-cols-[0.92fr_1.08fr]">
          <div className={`${panelClassName} p-6 md:p-7`}>
            <p className="text-[10px] font-black uppercase tracking-[0.18em] text-indigo-600">Salary revision</p>
            <h4 className="mt-2 text-[20px] font-black tracking-[-0.03em] text-slate-950">Log New Increment</h4>

            <div className={`${insetClassName} mt-6 space-y-4 p-5`}>
              <div>
                <label className="mb-2 block text-[11px] font-bold uppercase tracking-[0.16em] text-slate-500">Target Employee</label>
                <select value={newInc.employeeId} onChange={e => setNewInc(s => ({ ...s, employeeId: e.target.value }))} className={inputClassName}>
                  <option value="">Select employee</option>
                  {employees.map(emp => <option key={emp.id} value={emp.id}>{emp.name}</option>)}
                </select>
              </div>

              {newInc.employeeId && (
                <div className="rounded-2xl border border-indigo-100 bg-indigo-50 px-4 py-3">
                  <p className="text-[10px] font-black uppercase tracking-[0.18em] text-indigo-500">Current Salary</p>
                  <p className="mt-2 text-[18px] font-black text-indigo-700">Rs. {slabs[newInc.employeeId]?.totalSalary?.toLocaleString() || 0}</p>
                </div>
              )}

              <div>
                <label className="mb-2 block text-[11px] font-bold uppercase tracking-[0.16em] text-slate-500">Revised Total CTC</label>
                <input type="number" value={newInc.newSalary || ''} onChange={e => setNewInc(s => ({ ...s, newSalary: e.target.value }))} className={inputClassName} placeholder="0.00" />
              </div>

              <div>
                <label className="mb-2 block text-[11px] font-bold uppercase tracking-[0.16em] text-slate-500">Effective Month</label>
                <input type="month" value={newInc.effectiveFrom} onChange={e => setNewInc(s => ({ ...s, effectiveFrom: e.target.value }))} className={inputClassName} />
              </div>

              <div>
                <label className="mb-2 block text-[11px] font-bold uppercase tracking-[0.16em] text-slate-500">Reason</label>
                <input type="text" value={newInc.reason} onChange={e => setNewInc(s => ({ ...s, reason: e.target.value }))} className={inputClassName} placeholder="e.g. Annual Appraisal" />
              </div>

              <button onClick={handleSaveIncrement} className="inline-flex w-full items-center justify-center gap-2 rounded-[20px] bg-indigo-600 px-4 py-3 text-[12px] font-black uppercase tracking-[0.18em] text-white transition-all hover:bg-indigo-700">
                <Plus size={14} />
                Log Increment
              </button>
            </div>
          </div>

          <div className={`${panelClassName} overflow-hidden`}>
            <div className="border-b border-slate-200 px-6 py-5">
              <p className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-400">Revision history</p>
              <h4 className="mt-2 text-[20px] font-black tracking-[-0.03em] text-slate-950">Historical Pay Adjustments</h4>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-left">
                <thead>
                  <tr className="bg-slate-50">
                    <th className={headCellClassName}>Effective</th>
                    <th className={headCellClassName}>Employee</th>
                    <th className={headCellClassName}>New Gross</th>
                    <th className={headCellClassName}>Reason</th>
                  </tr>
                </thead>
                <tbody>
                  {increments.length === 0 && (
                    <tr>
                      <td colSpan={4} className="px-6 py-14 text-center text-[13px] font-medium text-slate-400">
                        No increment records archived yet.
                      </td>
                    </tr>
                  )}
                  {increments.map((inc, index) => {
                    const emp = employees.find(employee => employee.id === inc.employeeId)
                    return (
                      <tr key={inc.id} className={index % 2 === 0 ? 'bg-white' : 'bg-slate-50/80'}>
                        <td className={`${bodyCellClassName} font-bold text-indigo-600`}>{inc.effectiveFrom}</td>
                        <td className={bodyCellClassName}>{emp?.name || 'Restricted'}</td>
                        <td className={`${bodyCellClassName} font-bold text-slate-950`}>Rs. {inc.totalSalary?.toLocaleString()}</td>
                        <td className={`${bodyCellClassName} text-slate-500`}>{inc.reason || 'Annual Increment'}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'release' && (
        <div className="grid grid-cols-1 gap-5 xl:grid-cols-[0.92fr_1.08fr]">
          <div className={`${panelClassName} p-6 md:p-7`}>
            <p className="text-[10px] font-black uppercase tracking-[0.18em] text-indigo-600">Visibility window</p>
            <h4 className="mt-2 text-[20px] font-black tracking-[-0.03em] text-slate-950">Salary Slip Release</h4>

            <div className={`${insetClassName} mt-6 space-y-4 p-5`}>
              <div>
                <label className="mb-2 block text-[11px] font-bold uppercase tracking-[0.16em] text-slate-500">Salary Month</label>
                <input type="month" value={newWindow.month} onChange={e => setNewWindow(s => ({ ...s, month: e.target.value }))} className={inputClassName} />
              </div>
              <div>
                <label className="mb-2 block text-[11px] font-bold uppercase tracking-[0.16em] text-slate-500">View From</label>
                <input type="date" value={newWindow.viewFrom} onChange={e => setNewWindow(s => ({ ...s, viewFrom: e.target.value }))} className={inputClassName} />
              </div>
              <div>
                <label className="mb-2 block text-[11px] font-bold uppercase tracking-[0.16em] text-slate-500">View Until</label>
                <input type="date" value={newWindow.viewUntil} onChange={e => setNewWindow(s => ({ ...s, viewUntil: e.target.value }))} className={inputClassName} />
              </div>
              <button onClick={handleSaveWindow} className="inline-flex w-full items-center justify-center gap-2 rounded-[20px] bg-indigo-600 px-4 py-3 text-[12px] font-black uppercase tracking-[0.18em] text-white transition-all hover:bg-indigo-700">
                <Save size={14} />
                Save Window
              </button>
            </div>
          </div>

          <div className={`${panelClassName} overflow-hidden`}>
            <div className="border-b border-slate-200 px-6 py-5">
              <p className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-400">Release log</p>
              <h4 className="mt-2 text-[20px] font-black tracking-[-0.03em] text-slate-950">Configured Visibility Periods</h4>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-left">
                <thead>
                  <tr className="bg-slate-50">
                    <th className={headCellClassName}>Salary Month</th>
                    <th className={headCellClassName}>View From</th>
                    <th className={headCellClassName}>View Until</th>
                  </tr>
                </thead>
                <tbody>
                  {windows.length === 0 && (
                    <tr>
                      <td colSpan={3} className="px-6 py-14 text-center text-[13px] font-medium text-slate-400">
                        No release windows configured.
                      </td>
                    </tr>
                  )}
                  {windows.map((windowItem, index) => (
                    <tr key={windowItem.id} className={index % 2 === 0 ? 'bg-white' : 'bg-slate-50/80'}>
                      <td className={`${bodyCellClassName} font-bold text-slate-900`}>{windowItem.month}</td>
                      <td className={bodyCellClassName}>{windowItem.viewFrom}</td>
                      <td className={bodyCellClassName}>{windowItem.viewUntil}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
