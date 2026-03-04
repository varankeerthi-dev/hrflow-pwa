import { useState, useEffect } from 'react'
import { useAuth } from '../../hooks/useAuth'
import { useEmployees } from '../../hooks/useEmployees'
import { useSalarySlab } from '../../hooks/useSalarySlab'
import Spinner from '../ui/Spinner'

export default function SalarySlabSettings() {
  const { user } = useAuth()
  const { employees, loading: empLoading } = useEmployees(user?.orgId) // getting all employees
  const { slabs, increments, loading: slabLoading, saveSlab } = useSalarySlab(user?.orgId)
  
  const [activeTab, setActiveTab] = useState('structure')
  
  // Local state for structure forms
  const [forms, setForms] = useState({})
  
  // New Increment state
  const [newInc, setNewInc] = useState({ employeeId: '', newSalary: 0, effectiveFrom: '', reason: '' })

  useEffect(() => {
    // Initialize forms from slabs
    const initialForms = {}
    employees.forEach(emp => {
      const slab = slabs[emp.id] || { totalSalary: 0, basicPercent: 40, hraPercent: 20, incomeTaxPercent: 0, pfPercent: 0, includeInPayroll: true }
      initialForms[emp.id] = { ...slab, includeInPayroll: slab.includeInPayroll !== false } // Default true
    })
    setForms(initialForms)
  }, [employees, slabs])

  const handleFormChange = (empId, field, value) => {
    setForms(prev => ({
      ...prev,
      [empId]: {
        ...prev[empId],
        [field]: value
      }
    }))
  }

  const handleSaveStructure = async (empId) => {
    const form = forms[empId]
    const d = new Date()
    const month = String(d.getMonth() + 1).padStart(2, '0')
    const year = d.getFullYear()
    
    await saveSlab(empId, {
      totalSalary: Number(form.totalSalary),
      basicPercent: Number(form.basicPercent),
      hraPercent: Number(form.hraPercent),
      incomeTaxPercent: Number(form.incomeTaxPercent),
      pfPercent: Number(form.pfPercent),
      includeInPayroll: form.includeInPayroll,
      effectiveFrom: `${year}-${month}`,
      reason: 'Structure Update'
    })
    alert('Saved successfully')
  }

  const handleSaveIncrement = async () => {
    if (!newInc.employeeId || !newInc.newSalary || !newInc.effectiveFrom) {
      alert('Please fill required fields')
      return
    }
    const currentSlab = slabs[newInc.employeeId] || { basicPercent: 40, hraPercent: 20, incomeTaxPercent: 0, pfPercent: 0, includeInPayroll: true }
    
    await saveSlab(newInc.employeeId, {
      ...currentSlab, // keep percentages same
      totalSalary: Number(newInc.newSalary),
      effectiveFrom: newInc.effectiveFrom,
      reason: newInc.reason || 'Increment'
    })
    setNewInc({ employeeId: '', newSalary: 0, effectiveFrom: '', reason: '' })
    alert('Increment saved')
  }

  if (empLoading || slabLoading) return <div className="py-10 text-center"><Spinner /></div>

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center no-print">
        <h3 className="text-sm font-black text-gray-800 uppercase tracking-tight">Salary Configuration</h3>
        <div className="flex gap-2">
          <button onClick={() => setActiveTab('structure')} className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest ${activeTab === 'structure' ? 'bg-indigo-600 text-white shadow-md' : 'bg-white border text-gray-500 hover:bg-gray-50'}`}>Structure Setup</button>
          <button onClick={() => setActiveTab('increment')} className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest ${activeTab === 'increment' ? 'bg-indigo-600 text-white shadow-md' : 'bg-white border text-gray-500 hover:bg-gray-50'}`}>Log Increment</button>
        </div>
      </div>

      {activeTab === 'structure' && (
        <div className="bg-white rounded-2xl border shadow-sm overflow-x-auto">
          <table className="w-full text-left whitespace-nowrap">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="px-3 py-2 text-[9px] font-black text-gray-400 uppercase">Include</th>
                <th className="px-3 py-2 text-[9px] font-black text-gray-400 uppercase">Employee</th>
                <th className="px-3 py-2 text-[9px] font-black text-gray-400 uppercase">Total Salary (₹)</th>
                <th className="px-3 py-2 text-[9px] font-black text-gray-400 uppercase text-green-600 bg-green-50/50">Basic % (Earn)</th>
                <th className="px-3 py-2 text-[9px] font-black text-gray-400 uppercase text-green-600 bg-green-50/50">HRA % (Earn)</th>
                <th className="px-3 py-2 text-[9px] font-black text-gray-400 uppercase text-red-600 bg-red-50/50">Tax % (Ded)</th>
                <th className="px-3 py-2 text-[9px] font-black text-gray-400 uppercase text-red-600 bg-red-50/50">PF % (Ded)</th>
                <th className="px-3 py-2 text-[9px] font-black text-gray-400 uppercase">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {employees.map(emp => {
                const form = forms[emp.id]
                if (!form) return null
                const total = Number(form.totalSalary) || 0
                return (
                  <tr key={emp.id} className="hover:bg-gray-50/50 group">
                    <td className="px-3 py-2 text-center">
                      <input type="checkbox" checked={form.includeInPayroll} onChange={e => handleFormChange(emp.id, 'includeInPayroll', e.target.checked)} className="w-4 h-4 rounded text-indigo-600 focus:ring-indigo-500" />
                    </td>
                    <td className="px-3 py-2">
                      <p className="font-bold text-gray-800 uppercase tracking-tight text-[10px]">{emp.name}</p>
                      <p className="text-[8px] text-gray-400 font-bold uppercase">{emp.department || 'N/A'}</p>
                    </td>
                    <td className="px-3 py-2">
                      <input type="number" value={form.totalSalary} onChange={e => handleFormChange(emp.id, 'totalSalary', e.target.value)} className="w-24 border rounded-lg px-2 py-1 text-xs font-mono font-bold outline-none focus:border-indigo-500" />
                    </td>
                    <td className="px-3 py-2 bg-green-50/20">
                      <div className="flex flex-col gap-1">
                        <div className="flex items-center gap-1">
                          <input type="number" value={form.basicPercent} onChange={e => handleFormChange(emp.id, 'basicPercent', e.target.value)} className="w-14 border rounded-md px-1 py-0.5 text-xs font-bold text-center outline-none" /> <span className="text-[9px] font-bold text-gray-400">%</span>
                        </div>
                        <span className="text-[9px] font-mono text-gray-500">₹{(total * (form.basicPercent/100)).toFixed(0)}</span>
                      </div>
                    </td>
                    <td className="px-3 py-2 bg-green-50/20">
                      <div className="flex flex-col gap-1">
                        <div className="flex items-center gap-1">
                          <input type="number" value={form.hraPercent} onChange={e => handleFormChange(emp.id, 'hraPercent', e.target.value)} className="w-14 border rounded-md px-1 py-0.5 text-xs font-bold text-center outline-none" /> <span className="text-[9px] font-bold text-gray-400">%</span>
                        </div>
                        <span className="text-[9px] font-mono text-gray-500">₹{(total * (form.hraPercent/100)).toFixed(0)}</span>
                      </div>
                    </td>
                    <td className="px-3 py-2 bg-red-50/20">
                      <div className="flex flex-col gap-1">
                        <div className="flex items-center gap-1">
                          <input type="number" value={form.incomeTaxPercent} onChange={e => handleFormChange(emp.id, 'incomeTaxPercent', e.target.value)} className="w-14 border rounded-md px-1 py-0.5 text-xs font-bold text-center outline-none" /> <span className="text-[9px] font-bold text-gray-400">%</span>
                        </div>
                        <span className="text-[9px] font-mono text-gray-500">₹{(total * (form.incomeTaxPercent/100)).toFixed(0)}</span>
                      </div>
                    </td>
                    <td className="px-3 py-2 bg-red-50/20">
                      <div className="flex flex-col gap-1">
                        <div className="flex items-center gap-1">
                          <input type="number" value={form.pfPercent} onChange={e => handleFormChange(emp.id, 'pfPercent', e.target.value)} className="w-14 border rounded-md px-1 py-0.5 text-xs font-bold text-center outline-none" /> <span className="text-[9px] font-bold text-gray-400">%</span>
                        </div>
                        <span className="text-[9px] font-mono text-gray-500">₹{(total * (form.pfPercent/100)).toFixed(0)}</span>
                      </div>
                    </td>
                    <td className="px-3 py-2">
                      <button onClick={() => handleSaveStructure(emp.id)} className="bg-indigo-50 text-indigo-600 px-3 py-1.5 rounded-lg font-black text-[9px] uppercase tracking-widest hover:bg-indigo-600 hover:text-white transition-colors">Save</button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {activeTab === 'increment' && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="bg-white p-5 rounded-2xl border shadow-sm md:col-span-1">
            <h4 className="font-black text-gray-800 uppercase tracking-tight mb-4">Log New Increment</h4>
            <div className="space-y-4">
              <div>
                <label className="block text-[9px] font-black text-gray-400 uppercase mb-1">Employee</label>
                <select value={newInc.employeeId} onChange={e => setNewInc(s => ({ ...s, employeeId: e.target.value }))} className="w-full border rounded-xl px-3 py-2 text-xs font-bold outline-none bg-gray-50">
                  <option value="">Select Employee...</option>
                  {employees.map(emp => <option key={emp.id} value={emp.id}>{emp.name}</option>)}
                </select>
              </div>
              {newInc.employeeId && (
                <div>
                  <p className="text-[10px] font-black text-gray-500 mb-1">Current Salary: <span className="font-mono text-indigo-600">₹{slabs[newInc.employeeId]?.totalSalary || 0}</span></p>
                </div>
              )}
              <div>
                <label className="block text-[9px] font-black text-gray-400 uppercase mb-1">New Total Salary</label>
                <input type="number" value={newInc.newSalary || ''} onChange={e => setNewInc(s => ({ ...s, newSalary: e.target.value }))} className="w-full border rounded-xl px-3 py-2 text-xs font-mono font-bold outline-none bg-gray-50" />
              </div>
              <div>
                <label className="block text-[9px] font-black text-gray-400 uppercase mb-1">Effective Month (YYYY-MM)</label>
                <input type="month" value={newInc.effectiveFrom} onChange={e => setNewInc(s => ({ ...s, effectiveFrom: e.target.value }))} className="w-full border rounded-xl px-3 py-2 text-xs font-bold outline-none bg-gray-50" />
              </div>
              <div>
                <label className="block text-[9px] font-black text-gray-400 uppercase mb-1">Reason</label>
                <input type="text" value={newInc.reason} onChange={e => setNewInc(s => ({ ...s, reason: e.target.value }))} className="w-full border rounded-xl px-3 py-2 text-xs font-bold outline-none bg-gray-50" placeholder="e.g. Annual Appraisal" />
              </div>
              <button onClick={handleSaveIncrement} className="w-full bg-indigo-600 text-white font-black py-2.5 rounded-xl uppercase tracking-widest text-[10px] shadow-lg hover:bg-indigo-700">Save Increment</button>
            </div>
          </div>

          <div className="bg-white p-5 rounded-2xl border shadow-sm md:col-span-2 overflow-auto">
            <h4 className="font-black text-gray-800 uppercase tracking-tight mb-4">Increment History</h4>
            <table className="w-full text-left">
              <thead className="bg-gray-50 border-b">
                <tr>
                  <th className="px-4 py-2 text-[9px] font-black text-gray-400 uppercase">Effective</th>
                  <th className="px-4 py-2 text-[9px] font-black text-gray-400 uppercase">Employee</th>
                  <th className="px-4 py-2 text-[9px] font-black text-gray-400 uppercase">New Salary</th>
                  <th className="px-4 py-2 text-[9px] font-black text-gray-400 uppercase">Reason</th>
                  <th className="px-4 py-2 text-[9px] font-black text-gray-400 uppercase">Logged At</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {increments.map(inc => {
                  const emp = employees.find(e => e.id === inc.employeeId)
                  return (
                    <tr key={inc.id} className="hover:bg-gray-50/50">
                      <td className="px-4 py-2 text-[10px] font-bold text-indigo-600">{inc.effectiveFrom}</td>
                      <td className="px-4 py-2 text-[10px] font-bold uppercase">{emp?.name || 'Unknown'}</td>
                      <td className="px-4 py-2 font-mono text-[10px] text-gray-600 font-bold">₹{inc.totalSalary}</td>
                      <td className="px-4 py-2 text-[10px] text-gray-500 italic">{inc.reason}</td>
                      <td className="px-4 py-2 text-[9px] text-gray-400">{inc.createdAt?.toDate?.().toLocaleDateString() || '-'}</td>
                    </tr>
                  )
                })}
                {increments.length === 0 && <tr><td colSpan={5} className="py-10 text-center text-gray-300 font-bold uppercase tracking-widest text-[10px]">No History Found</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
