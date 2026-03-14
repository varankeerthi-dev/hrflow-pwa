import React, { useState, useEffect } from 'react'
import { useAuth } from '../../hooks/useAuth'
import { useEmployees } from '../../hooks/useEmployees'
import { useSalarySlab } from '../../hooks/useSalarySlab'
import { db } from '../../lib/firebase'
import { collection, getDocs, setDoc, doc } from 'firebase/firestore'
import { salarySlipWindowsCol } from '../../lib/firestore'
import Spinner from '../ui/Spinner'
import { Wallet, TrendingUp, Check, Save, Calendar as CalendarIcon } from 'lucide-react'

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
      const slab = slabs[emp.id] || { totalSalary: 0, basicPercent: 40, hraPercent: 20, incomeTaxPercent: 0, pfPercent: 0, includeInPayroll: true }
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
        includeInPayroll: form.includeInPayroll,
        effectiveFrom: `${year}-${month}`,
        reason: 'Structure Update'
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
      reason: newInc.reason || 'Annual Increment'
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

  return (
    <div className="space-y-6 font-inter">
      <div className="flex justify-between items-center no-print">
        <div className="flex items-center gap-3">
          <div className="w-2.5 h-2.5 bg-indigo-600 rounded-full"></div>
          <h3 className="text-sm font-bold text-gray-800 uppercase tracking-tight">Payroll Configuration</h3>
        </div>
        <div className="bg-gray-100 p-1 rounded-lg flex shadow-sm border border-gray-200">
          <button onClick={() => setActiveTab('structure')} className={`px-4 py-1.5 rounded-md text-[11px] font-bold uppercase tracking-widest transition-all ${activeTab === 'structure' ? 'bg-white text-indigo-600 shadow-sm' : 'text-gray-400 hover:text-gray-600'}`}>Definition</button>
          <button onClick={() => setActiveTab('increment')} className={`px-4 py-1.5 rounded-md text-[11px] font-bold uppercase tracking-widest transition-all ${activeTab === 'increment' ? 'bg-white text-indigo-600 shadow-sm' : 'text-gray-400 hover:text-gray-600'}`}>Increments</button>
          <button onClick={() => setActiveTab('release')} className={`px-4 py-1.5 rounded-md text-[11px] font-bold uppercase tracking-widest transition-all ${activeTab === 'release' ? 'bg-white text-indigo-600 shadow-sm' : 'text-gray-400 hover:text-gray-600'}`}>Release</button>
        </div>
      </div>

      {activeTab === 'structure' && (
        <div className="bg-white rounded-[12px] border border-gray-100 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse whitespace-nowrap">
              <thead>
                <tr className="h-[42px] bg-[#f9fafb]">
                  <th className="px-[16px] text-[12px] font-semibold text-[#6b7280] uppercase tracking-wider text-center">Payroll</th>
                  <th className="px-[16px] text-[12px] font-semibold text-[#6b7280] uppercase tracking-wider">Employee Profile</th>
                  <th className="px-[16px] text-[12px] font-semibold text-[#6b7280] uppercase tracking-wider" style={{ fontFamily: 'Roboto, sans-serif' }}>Gross CTC (₹)</th>
                  <th className="px-[16px] text-[12px] font-semibold text-green-600 uppercase tracking-wider bg-green-50/30">Earnings (%)</th>
                  <th className="px-[16px] text-[12px] font-semibold text-red-600 uppercase tracking-wider bg-red-50/30">Deductions (%)</th>
                  <th className="px-[16px] text-[12px] font-semibold text-[#6b7280] uppercase tracking-wider text-right">Commit</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#f1f5f9]">
                {employees.map(emp => {
                  const form = forms[emp.id]
                  if (!form) return null
                  const total = Number(form.totalSalary) || 0
                  return (
                    <tr key={emp.id} className="h-[60px] hover:bg-[#f8fafc] transition-colors group">
                      <td className="px-[16px] text-center">
                        <input type="checkbox" checked={form.includeInPayroll} onChange={e => handleFormChange(emp.id, 'includeInPayroll', e.target.checked)} className="w-4 h-4 rounded text-indigo-600 focus:ring-indigo-500 cursor-pointer" />
                      </td>
                      <td className="px-[16px]">
                        <p className="font-bold text-gray-700 uppercase tracking-tight text-[13px]">{emp.name}</p>
                        <p className="text-[10px] text-gray-400 font-medium uppercase">{emp.department || 'General'}</p>
                      </td>
                      <td className="px-[16px]">
                        <input type="number" value={form.totalSalary} onChange={e => handleFormChange(emp.id, 'totalSalary', e.target.value)} className="w-32 h-[36px] border border-gray-200 rounded-lg px-3 text-[13px] font-roboto font-bold outline-none focus:ring-2 focus:ring-indigo-500 bg-gray-50/50" style={{ fontFamily: 'Roboto, sans-serif' }} />
                      </td>
                      <td className="px-[16px] bg-green-50/10">
                        <div className="flex gap-4">
                          <div className="flex flex-col gap-1">
                            <span className="text-[9px] font-black text-green-600 uppercase">Basic</span>
                            <div className="flex items-center gap-1">
                              <input type="number" value={form.basicPercent} onChange={e => handleFormChange(emp.id, 'basicPercent', e.target.value)} className="w-12 h-[28px] border border-green-100 rounded-md text-[12px] font-bold text-center bg-white outline-none" />
                              <span className="text-[10px] font-bold text-gray-400">%</span>
                            </div>
                          </div>
                          <div className="flex flex-col gap-1">
                            <span className="text-[9px] font-black text-green-600 uppercase">HRA</span>
                            <div className="flex items-center gap-1">
                              <input type="number" value={form.hraPercent} onChange={e => handleFormChange(emp.id, 'hraPercent', e.target.value)} className="w-12 h-[28px] border border-green-100 rounded-md text-[12px] font-bold text-center bg-white outline-none" />
                              <span className="text-[10px] font-bold text-gray-400">%</span>
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="px-[16px] bg-red-50/10">
                        <div className="flex gap-4">
                          <div className="flex flex-col gap-1">
                            <span className="text-[9px] font-black text-red-600 uppercase">Tax</span>
                            <div className="flex items-center gap-1">
                              <input type="number" value={form.incomeTaxPercent} onChange={e => handleFormChange(emp.id, 'incomeTaxPercent', e.target.value)} className="w-12 h-[28px] border border-red-100 rounded-md text-[12px] font-bold text-center bg-white outline-none" />
                              <span className="text-[10px] font-bold text-gray-400">%</span>
                            </div>
                          </div>
                          <div className="flex flex-col gap-1">
                            <span className="text-[9px] font-black text-red-600 uppercase">PF</span>
                            <div className="flex items-center gap-1">
                              <input type="number" value={form.pfPercent} onChange={e => handleFormChange(emp.id, 'pfPercent', e.target.value)} className="w-12 h-[28px] border border-red-100 rounded-md text-[12px] font-bold text-center bg-white outline-none" />
                              <span className="text-[10px] font-bold text-gray-400">%</span>
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="px-[16px] text-right">
                        <button onClick={() => handleSaveStructure(emp.id)} className="h-[32px] px-4 bg-indigo-50 text-indigo-600 rounded-md font-bold text-[11px] uppercase tracking-widest hover:bg-indigo-600 hover:text-white transition-all shadow-sm">
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
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          <div className="bg-white p-8 rounded-[12px] border border-gray-100 shadow-sm md:col-span-1">
            <div className="flex items-center gap-2 mb-6 text-gray-400">
              <TrendingUp size={18} />
              <h4 className="text-[11px] font-bold uppercase tracking-widest">Adjustment Form</h4>
            </div>
            <div className="space-y-5">
              <div>
                <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2 px-1">Target Employee</label>
                <select value={newInc.employeeId} onChange={e => setNewInc(s => ({ ...s, employeeId: e.target.value }))} className="w-full h-[42px] border border-gray-200 rounded-lg px-4 text-sm font-bold bg-gray-50/50 outline-none focus:ring-2 focus:ring-indigo-500">
                  <option value="">Select individual...</option>
                  {employees.map(emp => <option key={emp.id} value={emp.id}>{emp.name}</option>)}
                </select>
              </div>
              {newInc.employeeId && (
                <div className="bg-indigo-50 p-3 rounded-lg border border-indigo-100 flex justify-between items-center">
                  <span className="text-[10px] font-bold text-indigo-400 uppercase">Current Pay</span>
                  <span className="font-mono font-bold text-indigo-700 text-sm">₹{slabs[newInc.employeeId]?.totalSalary?.toLocaleString() || 0}</span>
                </div>
              )}
              <div>
                <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2 px-1">Revised Total (CTC)</label>
                <input type="number" value={newInc.newSalary || ''} onChange={e => setNewInc(s => ({ ...s, newSalary: e.target.value }))} className="w-full h-[42px] border border-gray-200 rounded-lg px-4 text-sm font-mono font-bold bg-gray-50/50 outline-none focus:ring-2 focus:ring-indigo-500" placeholder="0.00" />
              </div>
              <div>
                <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2 px-1">Effective Month</label>
                <input type="month" value={newInc.effectiveFrom} onChange={e => setNewInc(s => ({ ...s, effectiveFrom: e.target.value }))} className="w-full h-[42px] border border-gray-200 rounded-lg px-4 text-sm font-bold bg-gray-50/50 outline-none focus:ring-2 focus:ring-indigo-500" />
              </div>
              <div>
                <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2 px-1">Justification</label>
                <input type="text" value={newInc.reason} onChange={e => setNewInc(s => ({ ...s, reason: e.target.value }))} className="w-full h-[42px] border border-gray-200 rounded-lg px-4 text-sm font-medium bg-gray-50/50 outline-none focus:ring-2 focus:ring-indigo-500" placeholder="e.g. Annual Appraisal" />
              </div>
              <button onClick={handleSaveIncrement} className="h-[40px] w-full bg-indigo-600 text-white font-bold rounded-lg uppercase tracking-[0.15em] text-[11px] shadow-lg hover:bg-indigo-700 transition-all mt-4">
                Execute Increment
              </button>
            </div>
          </div>

          <div className="bg-white rounded-[12px] border border-gray-100 shadow-sm md:col-span-2 overflow-hidden flex flex-col">
            <div className="p-6 border-b border-gray-50">
              <span className="text-[11px] font-bold text-gray-400 uppercase tracking-widest px-1">Historical Pay Adjustments</span>
            </div>
            <div className="flex-1 overflow-auto">
              <table className="w-full text-left border-collapse">
                <thead className="bg-gray-50 border-b">
                  <tr className="h-[42px]">
                    <th className="px-[16px] text-[12px] font-semibold text-[#6b7280] uppercase tracking-wider">Effective</th>
                    <th className="px-[16px] text-[12px] font-semibold text-[#6b7280] uppercase tracking-wider">Employee</th>
                    <th className="px-[16px] text-[12px] font-semibold text-[#6b7280] uppercase tracking-wider text-center">New Gross</th>
                    <th className="px-[16px] text-[12px] font-semibold text-[#6b7280] uppercase tracking-wider">Reason</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#f1f5f9]">
                  {increments.map(inc => {
                    const emp = employees.find(e => e.id === inc.employeeId)
                    return (
                      <tr key={inc.id} className="h-[48px] hover:bg-[#f8fafc] transition-colors">
                        <td className="px-[16px] text-[12px] font-black text-indigo-600">{inc.effectiveFrom}</td>
                        <td className="px-[16px] text-[13px] font-bold text-gray-700 uppercase">{emp?.name || 'Restricted'}</td>
                        <td className="px-[16px] text-center font-mono font-black text-gray-900 text-[13px]">₹{inc.totalSalary?.toLocaleString()}</td>
                        <td className="px-[16px] text-[12px] text-gray-400 italic">"{inc.reason}"</td>
                      </tr>
                    )
                  })}
                  {increments.length === 0 && <tr><td colSpan={4} className="py-20 text-center text-gray-300 font-medium uppercase tracking-widest text-lg opacity-40">No records archived</td></tr>}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'release' && (
        <div className="bg-white rounded-[12px] border border-gray-100 shadow-sm overflow-hidden">
          <div className="p-6 border-b border-gray-50 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <CalendarIcon size={18} className="text-indigo-500" />
              <span className="text-[12px] font-bold text-gray-800 uppercase tracking-widest">Salary Slip Release Settings</span>
            </div>
          </div>
          <div className="p-6 space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 items-end">
              <div>
                <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-2 px-1">
                  Salary Month
                </label>
                <input
                  type="month"
                  value={newWindow.month}
                  onChange={e => setNewWindow(s => ({ ...s, month: e.target.value }))}
                  className="w-full h-[40px] border border-gray-200 rounded-lg px-3 text-sm font-bold bg-gray-50/50 outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
              <div>
                <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-2 px-1">
                  View From
                </label>
                <input
                  type="date"
                  value={newWindow.viewFrom}
                  onChange={e => setNewWindow(s => ({ ...s, viewFrom: e.target.value }))}
                  className="w-full h-[40px] border border-gray-200 rounded-lg px-3 text-sm font-bold bg-gray-50/50 outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
              <div>
                <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-2 px-1">
                  View Until
                </label>
                <input
                  type="date"
                  value={newWindow.viewUntil}
                  onChange={e => setNewWindow(s => ({ ...s, viewUntil: e.target.value }))}
                  className="w-full h-[40px] border border-gray-200 rounded-lg px-3 text-sm font-bold bg-gray-50/50 outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
              <div>
                <button
                  onClick={handleSaveWindow}
                  className="w-full h-[40px] bg-indigo-600 text-white font-bold rounded-lg uppercase tracking-[0.15em] text-[11px] shadow-lg hover:bg-indigo-700 mt-4 md:mt-0"
                >
                  Save Window
                </button>
              </div>
            </div>

            <div className="border border-gray-100 rounded-[12px] overflow-hidden">
              <table className="w-full text-left border-collapse">
                <thead className="bg-gray-50 border-b">
                  <tr className="h-[40px]">
                    <th className="px-4 text-[11px] font-semibold text-gray-500 uppercase tracking-widest">
                      Salary Month
                    </th>
                    <th className="px-4 text-[11px] font-semibold text-gray-500 uppercase tracking-widest">
                      View From
                    </th>
                    <th className="px-4 text-[11px] font-semibold text-gray-500 uppercase tracking-widest">
                      View Until
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {windows.map(w => (
                    <tr key={w.id} className="h-[40px] hover:bg-gray-50/50">
                      <td className="px-4 text-[12px] font-bold text-gray-800">{w.month}</td>
                      <td className="px-4 text-[12px] text-gray-600">{w.viewFrom}</td>
                      <td className="px-4 text-[12px] text-gray-600">{w.viewUntil}</td>
                    </tr>
                  ))}
                  {windows.length === 0 && (
                    <tr>
                      <td
                        colSpan={3}
                        className="px-4 py-8 text-center text-[12px] text-gray-300 font-medium uppercase tracking-widest"
                      >
                        No release windows configured
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
