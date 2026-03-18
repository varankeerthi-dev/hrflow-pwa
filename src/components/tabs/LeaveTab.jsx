import React, { useState, useEffect, useCallback } from 'react'
import { useAuth } from '../../hooks/useAuth'
import { useEmployees } from '../../hooks/useEmployees'
import { useLeaves } from '../../hooks/useLeaves'
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
  MoreHorizontal
} from 'lucide-react'
import Spinner from '../ui/Spinner'

export default function LeaveTab() {
  const { user } = useAuth()
  const { employees } = useEmployees(user?.orgId)
  const { loading: leaveLoading, fetchLeaves, applyLeave, updateLeaveStatus, calculateDuration } = useLeaves(user?.orgId)
  
  const [activeSub, setActiveSub] = useState('dashboard')
  const [leaves, setLeaves] = useState([])
  const [showInlineForm, setShowInlineForm] = useState(false)
  const [searchTerm, setSearchTerm] = useState('')
  const [filterType, setFilterType] = useState('All')
  
  const [form, setForm] = useState({ 
    employeeId: '', 
    leaveType: 'Casual', 
    fromDate: '', 
    toDate: '', 
    reason: '',
    deptHeadId: ''
  })
  
  const [actionRemarks, setActionRemarks] = useState({})
  const [selectedNextApprover, setSelectedNextApprover] = useState({})

  const leaveTypes = ['Casual', 'Sick', 'Privilege', 'Maternity', 'Paternity', 'Unpaid', 'LOP']

  const refreshLeaves = useCallback(async () => {
    const data = await fetchLeaves()
    setLeaves(data)
  }, [fetchLeaves])

  useEffect(() => { 
    if (user?.orgId) refreshLeaves() 
  }, [user?.orgId, refreshLeaves])

  const handleSubmit = async (e) => {
    e.preventDefault()
    
    if (!form.employeeId) return alert('Please select the employee.')
    if (!form.deptHeadId) return alert('Please select the Department Head/Approver.')
    if (!form.fromDate) return alert('Please select the From Date.')
    if (!form.toDate) return alert('Please select the To Date.')
    if (!form.reason.trim()) return alert('Please provide a reason.')
    
    try {
      const emp = employees.find(e => e.id === form.employeeId)
      const deptHead = employees.find(e => e.id === form.deptHeadId)
      
      await applyLeave({
        ...form,
        employeeName: emp?.name || 'Unknown',
        deptHeadName: deptHead?.name || 'Unknown',
        orgId: user.orgId
      })
      setShowInlineForm(false)
      setForm({ employeeId: '', leaveType: 'Casual', fromDate: '', toDate: '', reason: '', deptHeadId: '' })
      refreshLeaves()
    } catch (err) {
      alert('Failed to submit application: ' + err.message)
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
    } catch (err) {
      alert('Update failed: ' + err.message)
    }
  }

  const filteredLeaves = leaves.filter(l => {
    const matchesSearch = (l.employeeName || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
                         (l.reason || '').toLowerCase().includes(searchTerm.toLowerCase())
    const matchesType = filterType === 'All' || l.leaveType === filterType
    return matchesSearch && matchesType
  })

  const subNav = [
    { id: 'dashboard', label: 'Overview', icon: <LayoutDashboard size={14} /> },
    { id: 'request', label: 'Requests', icon: <FileText size={14} /> },
    { id: 'approve', label: 'Approvals', icon: <CheckCircle size={14} /> },
    { id: 'reports', label: 'Analytics', icon: <PieChart size={14} /> }
  ]

  const stats = [
    { label: 'Pending', count: leaves.filter(l => l.status === 'Pending').length },
    { label: 'Approved', count: leaves.filter(l => l.status === 'Approved').length },
    { label: 'Rejected', count: leaves.filter(l => l.status === 'Rejected').length },
    { label: 'Total', count: leaves.length }
  ]

  return (
    <div className="space-y-4 md:space-y-6 font-inter text-slate-950 w-full mx-auto pb-20 px-2 md:px-4">
      <div className="flex flex-col gap-1 py-2">
        <h2 className="text-xl md:text-2xl font-semibold tracking-tight">Leave Management</h2>
        <p className="text-xs md:text-sm text-slate-500">Configure leave policies and manage employee absence requests.</p>
      </div>

      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-white md:bg-transparent p-2 md:p-0 rounded-xl border border-slate-100 md:border-none shadow-sm md:shadow-none">
        <div className="flex flex-wrap h-auto md:h-9 items-center rounded-lg bg-slate-100 p-1 text-slate-500 w-full md:w-auto overflow-x-auto no-scrollbar">
          {subNav.map(s => (
            <button
              key={s.id}
              onClick={() => setActiveSub(s.id)}
              className={`flex-1 md:flex-none inline-flex items-center justify-center whitespace-nowrap rounded-md px-3 py-1.5 md:py-1 text-[11px] md:text-sm font-medium transition-all ${activeSub === s.id ? 'bg-white text-slate-950 shadow-sm' : 'hover:text-slate-900'}`}
            >
              {s.label}
            </button>
          ))}
        </div>
        <button 
          onClick={() => {
            setActiveSub('dashboard')
            setShowInlineForm(!showInlineForm)
          }}
          className={`w-full md:w-auto inline-flex items-center justify-center rounded-md text-sm font-medium transition-colors h-10 md:h-9 px-4 py-2 ${showInlineForm ? 'bg-slate-100 text-slate-900 hover:bg-slate-200 border border-slate-200' : 'bg-slate-900 text-slate-50 hover:bg-slate-900/90 shadow'}`}
        >
          {showInlineForm ? <X size={16} className="mr-2" /> : <PlusCircle size={16} className="mr-2" />}
          {showInlineForm ? 'Cancel Application' : 'New Application'}
        </button>
      </div>

      {activeSub === 'dashboard' && (
        <div className="space-y-6">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4">
            {stats.map(stat => (
              <div key={stat.label} className="rounded-xl border border-slate-200 bg-white text-slate-950 shadow-sm p-3 md:p-4">
                <h3 className="tracking-tight text-[10px] font-medium text-slate-500 uppercase">{stat.label}</h3>
                <div className="text-lg md:text-xl font-bold mt-0.5">{stat.count}</div>
              </div>
            ))}
          </div>

          {showInlineForm && (
            <div className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden animate-in fade-in duration-300">
              <div className="p-4 md:p-6 border-b border-slate-200">
                <h3 className="text-md font-semibold leading-none tracking-tight">New Leave Application</h3>
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

                      <div className="space-y-2">
                        <label className="text-xs font-medium text-slate-500 uppercase">Approver (Dept. Head)</label>
                        <div className="relative">
                          <select 
                            value={form.deptHeadId} 
                            onChange={e => setForm({...form, deptHeadId: e.target.value})} 
                            className="flex h-10 w-full items-center justify-between rounded-md border border-slate-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-950 appearance-none"
                          >
                            <option value="">Select Dept. Head</option>
                            {employees.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
                          </select>
                          <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none h-4 w-4" />
                        </div>
                      </div>
                    </div>

                    {form.employeeId && (
                      <div className="rounded-lg border border-slate-200 overflow-hidden shadow-sm max-w-sm">
                        <div className="bg-slate-50 px-4 py-1.5 border-b border-slate-200 text-[10px] font-semibold text-slate-500 uppercase">
                          Entitlements
                        </div>
                        <div className="overflow-x-auto">
                          <table className="w-full text-[11px]">
                            <tbody className="divide-y divide-slate-100">
                              {[
                                { type: 'Casual', total: 0, used: 0 },
                                { type: 'Privilege', total: 0, used: 0 },
                                { type: 'Sick', total: 0, used: 0 }
                              ].map((row, i) => (
                                <tr key={i}>
                                  <td className="px-4 py-1.5 text-slate-700">{row.type}</td>
                                  <td className="px-4 py-1.5 text-center font-bold text-indigo-600">Available: {row.total - row.used}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
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
                          onChange={e => setForm({...form, fromDate: e.target.value})} 
                          className="flex h-10 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-xs md:text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-950" 
                        />
                      </div>
                      <div className="flex-1 space-y-2">
                        <label className="text-xs font-medium text-slate-500 uppercase">To Date</label>
                        <input 
                          type="date" 
                          value={form.toDate} 
                          onChange={e => setForm({...form, toDate: e.target.value})} 
                          className="flex h-10 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-xs md:text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-950" 
                        />
                      </div>
                    </div>

                    <div className="space-y-2">
                      <label className="text-xs font-medium text-slate-500 uppercase">Classification</label>
                      <div className="flex flex-wrap gap-2">
                        {leaveTypes.slice(0, 4).map(type => (
                          <button
                            key={type}
                            type="button"
                            onClick={() => setForm({...form, leaveType: type})}
                            className={`inline-flex items-center justify-center rounded-md text-[10px] font-medium border transition-colors h-7 px-3 ${form.leaveType === type ? 'bg-slate-900 text-slate-50 border-slate-900 shadow-sm' : 'bg-white text-slate-900 border-slate-200 hover:bg-slate-100'}`}
                          >
                            {type}
                          </button>
                        ))}
                      </div>
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
                {leaves.slice(0, 5).map(leave => (
                  <div key={leave.id} className="flex items-center justify-between text-sm">
                    <div className="flex items-center gap-3">
                      <div className="w-7 h-7 rounded-full bg-slate-100 flex items-center justify-center font-bold text-slate-900 text-[10px]">
                        {leave.employeeName?.[0]}
                      </div>
                      <div>
                        <p className="font-medium text-slate-900 text-xs">{leave.employeeName}</p>
                        <p className="text-[10px] text-slate-500">{leave.leaveType} • {leave.fromDate}</p>
                      </div>
                    </div>
                    <div className={`px-2 py-0.5 rounded-full text-[9px] font-semibold border ${leave.status === 'Approved' ? 'bg-emerald-50 text-emerald-700 border-emerald-100' : leave.status === 'Rejected' ? 'bg-rose-50 text-rose-700 border-rose-100' : 'bg-amber-50 text-amber-700 border-amber-100'}`}>
                      {leave.status}
                    </div>
                  </div>
                ))}
                {leaves.length === 0 && <p className="text-center py-4 text-slate-400 text-xs italic">No recent activity</p>}
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
                  const count = leaves.filter(l => l.leaveType === type).length
                  const percentage = leaves.length ? (count / leaves.length) * 100 : 0
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
                {leaves.length === 0 && <p className="text-center py-4 text-slate-400 text-xs italic">No data available</p>}
              </div>
            </div>
          </div>
        </div>
      )}

      {(activeSub === 'request' || activeSub === 'approve') && (
        <div className="space-y-4">
          <div className="flex flex-col md:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
              <input 
                type="text"
                placeholder="Search requests..."
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                className="flex h-9 w-full rounded-md border border-slate-200 bg-white px-9 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-950"
              />
            </div>
            <div className="flex bg-slate-100 p-0.5 rounded-lg border border-slate-200 h-9 overflow-x-auto no-scrollbar">
              {['All', ...leaveTypes.slice(0, 3)].map(t => (
                <button
                  key={t}
                  onClick={() => setFilterType(t)}
                  className={`flex-1 md:flex-none px-3 py-1 rounded-md text-[10px] font-medium transition-all ${filterType === t ? 'bg-white text-slate-950 shadow-sm' : 'text-slate-500 hover:text-slate-900'}`}
                >
                  {t}
                </button>
              ))}
            </div>
          </div>

          <div className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs md:text-sm">
                <thead>
                  <tr className="bg-slate-50/50 h-10 border-b border-slate-200">
                    <th className="px-4 md:px-6 font-medium text-slate-500">Applicant</th>
                    <th className="px-4 md:px-6 font-medium text-slate-500 hidden md:table-cell">Type</th>
                    <th className="px-4 md:px-6 font-medium text-slate-500 w-[120px] md:w-[150px]">Duration</th>
                    <th className="px-4 md:px-6 font-medium text-slate-500 text-center w-[100px]">Status</th>
                    <th className="px-4 md:px-6 font-medium text-slate-500 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
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
                        <tr className="h-12 hover:bg-slate-50/50 transition-colors">
                          <td className="px-4 md:px-6">
                            <div className="flex flex-col">
                              <span className="font-semibold text-slate-900">{leave.employeeName}</span>
                              <span className="text-[10px] text-slate-500 italic line-clamp-1 max-w-[150px]">{leave.reason}</span>
                            </div>
                          </td>
                          <td className="px-4 md:px-6 hidden md:table-cell">
                            <span className="inline-flex items-center rounded-md border border-slate-200 bg-slate-50 px-2 py-0.5 text-xs font-semibold text-slate-900">{leave.leaveType}</span>
                          </td>
                          <td className="px-4 md:px-6">
                            <div className="flex flex-col">
                              <span className="text-[10px] md:text-xs font-medium text-slate-900">{leave.fromDate}</span>
                              <span className="text-[9px] text-slate-500 mt-0.5">{leave.duration || calculateDuration(leave.fromDate, leave.toDate)} days</span>
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
                              <MoreHorizontal size={14} className="text-slate-400 ml-auto" />
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
