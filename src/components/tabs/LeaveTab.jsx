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
    if (!form.employeeId || !form.fromDate || !form.reason || !form.deptHeadId) {
      alert('Please fill all required fields including Department Head.')
      return
    }
    
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

    if (user.role?.toLowerCase() === 'hr' && status === 'Approved' && !nextApproverId) {
       // alert('Please select a Department Head for further approval.')
       // Allowing HR to approve without next approver if they are also Admin
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

  const selectedEmployee = employees.find(e => e.id === form.employeeId)

  return (
    <div className="space-y-6 font-inter text-slate-950 w-full mx-auto pb-10">
      {/* Shadcn style Page Header */}
      <div className="flex flex-col gap-1 px-1">
        <h2 className="text-2xl font-semibold tracking-tight">Leave Management</h2>
        <p className="text-sm text-slate-500">Configure leave policies and manage employee absence requests.</p>
      </div>

      {/* Minimalist Sub-Nav & Action */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 px-1">
        <div className="inline-flex h-9 items-center justify-center rounded-lg bg-slate-100 p-1 text-slate-500">
          {subNav.map(s => (
            <button
              key={s.id}
              onClick={() => setActiveSub(s.id)}
              className={`inline-flex items-center justify-center whitespace-nowrap rounded-md px-3 py-1 text-sm font-medium ring-offset-white transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-950 focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 ${activeSub === s.id ? 'bg-white text-slate-950 shadow-sm' : 'hover:text-slate-900'}`}
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
          className={`inline-flex items-center justify-center rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-950 disabled:pointer-events-none disabled:opacity-50 h-9 px-4 py-2 ${showInlineForm ? 'bg-slate-100 text-slate-900 hover:bg-slate-200' : 'bg-slate-900 text-slate-50 hover:bg-slate-900/90 shadow'}`}
        >
          {showInlineForm ? 'Cancel Application' : 'New Application'}
        </button>
      </div>

      {activeSub === 'dashboard' && (
        <div className="space-y-6">
          {/* Stats Grid - Minimal Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {stats.map(stat => (
              <div key={stat.label} className="rounded-xl border border-slate-200 bg-white text-slate-950 shadow-sm p-6">
                <div className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <h3 className="tracking-tight text-xs font-medium text-slate-500 uppercase">{stat.label}</h3>
                </div>
                <div className="text-2xl font-bold">{stat.count}</div>
              </div>
            ))}
          </div>

          {/* Inline Application Form - Shadcn Style */}
          {showInlineForm && (
            <div className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden animate-in fade-in duration-300">
              <div className="p-6 border-b border-slate-200">
                <h3 className="text-lg font-semibold leading-none tracking-tight">New Leave Application</h3>
                <p className="text-sm text-slate-500 mt-1.5">Initialize a new leave request for an employee.</p>
              </div>
              
              <form onSubmit={handleSubmit} className="p-6 space-y-8">
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                  <div className="space-y-6">
                    <div className="space-y-2">
                      <label className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">Name of the employee</label>
                      <div className="relative">
                        <select 
                          value={form.employeeId} 
                          onChange={e => setForm({...form, employeeId: e.target.value})} 
                          className="flex h-10 w-full items-center justify-between rounded-md border border-slate-200 bg-white px-3 py-2 text-sm ring-offset-white placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-slate-950 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 appearance-none"
                        >
                          <option value="">Select an employee</option>
                          {employees.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
                        </select>
                        <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none h-4 w-4" />
                      </div>
                    </div>

                    <div className="space-y-2">
                      <label className="text-sm font-medium leading-none">Leave Approver (Department Head)</label>
                      <div className="relative">
                        <select 
                          value={form.deptHeadId} 
                          onChange={e => setForm({...form, deptHeadId: e.target.value})} 
                          className="flex h-10 w-full items-center justify-between rounded-md border border-slate-200 bg-white px-3 py-2 text-sm ring-offset-white placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-slate-950 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 appearance-none"
                        >
                          <option value="">Select Dept. Head</option>
                          {employees.map(e => <option key={e.id} value={e.id}>{e.name} ({e.empCode || 'N/A'})</option>)}
                        </select>
                        <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none h-4 w-4" />
                      </div>
                    </div>

                    {form.employeeId && (
                      <div className="rounded-lg border border-slate-200 overflow-hidden">
                        <div className="bg-slate-50 px-4 py-2 border-b border-slate-200 text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
                          Leave Entitlements
                        </div>
                        <div className="p-0">
                          <table className="w-full text-xs">
                            <thead className="bg-slate-50/50">
                              <tr className="border-b border-slate-200">
                                <th className="px-4 py-2 font-medium text-slate-500">Type</th>
                                <th className="px-4 py-2 font-medium text-slate-500 text-center">Total</th>
                                <th className="px-4 py-2 font-medium text-slate-500 text-center">Used</th>
                                <th className="px-4 py-2 font-medium text-slate-950 text-center">Available</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                              {[
                                { type: 'Casual Leave', total: 0, used: 0 },
                                { type: 'Privilege Leave', total: 0, used: 0 },
                                { type: 'Sick Leave', total: 0, used: 0 }
                              ].map((row, i) => (
                                <tr key={i} className="hover:bg-slate-50/50">
                                  <td className="px-4 py-2 text-slate-700">{row.type}</td>
                                  <td className="px-4 py-2 text-center text-slate-500">{row.total}</td>
                                  <td className="px-4 py-2 text-center text-slate-500">{row.used}</td>
                                  <td className="px-4 py-2 text-center font-semibold text-slate-950">{row.total - row.used}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="space-y-6">
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <label className="text-sm font-medium leading-none">From Date</label>
                        <input 
                          type="date" 
                          value={form.fromDate} 
                          onChange={e => setForm({...form, fromDate: e.target.value})} 
                          className="flex h-10 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm ring-offset-white file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-slate-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-950 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50" 
                        />
                      </div>
                      <div className="space-y-2">
                        <label className="text-sm font-medium leading-none">To Date</label>
                        <input 
                          type="date" 
                          value={form.toDate} 
                          onChange={e => setForm({...form, toDate: e.target.value})} 
                          className="flex h-10 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm ring-offset-white file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-slate-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-950 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50" 
                        />
                      </div>
                    </div>

                    <div className="space-y-2">
                      <label className="text-sm font-medium leading-none">Leave Classification</label>
                      <div className="flex flex-wrap gap-2">
                        {leaveTypes.slice(0, 4).map(type => (
                          <button
                            key={type}
                            type="button"
                            onClick={() => setForm({...form, leaveType: type})}
                            className={`inline-flex items-center justify-center rounded-md text-xs font-medium border transition-colors h-8 px-3 ${form.leaveType === type ? 'bg-slate-900 text-slate-50 border-slate-900' : 'bg-white text-slate-900 border-slate-200 hover:bg-slate-100 hover:text-slate-900'}`}
                          >
                            {type}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className="space-y-2">
                      <label className="text-sm font-medium leading-none">Reason</label>
                      <textarea 
                        value={form.reason} 
                        onChange={e => setForm({...form, reason: e.target.value})} 
                        className="flex min-h-[80px] w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm ring-offset-white placeholder:text-slate-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-950 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50" 
                        placeholder="State the reason for leave..." 
                      />
                    </div>
                  </div>
                </div>

                <div className="flex items-center justify-end space-x-2 pt-4 border-t border-slate-200">
                  <button 
                    type="button"
                    onClick={() => setShowInlineForm(false)}
                    className="inline-flex items-center justify-center rounded-md text-sm font-medium border border-slate-200 bg-white hover:bg-slate-100 hover:text-slate-900 h-9 px-4 py-2"
                  >
                    Cancel
                  </button>
                  <button 
                    type="submit" 
                    className="inline-flex items-center justify-center rounded-md text-sm font-medium bg-slate-900 text-slate-50 hover:bg-slate-900/90 h-9 px-4 py-2 shadow transition-colors"
                  >
                    Submit Request
                  </button>
                </div>
              </form>
            </div>
          )}
          
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
              <div className="p-6 border-b border-slate-200">
                <h3 className="text-sm font-semibold leading-none tracking-tight flex items-center gap-2">
                  <Clock size={14} /> Recent Activity
                </h3>
              </div>
              <div className="p-6 pt-4 space-y-4">
                {leaves.slice(0, 5).map(leave => (
                  <div key={leave.id} className="flex items-center justify-between text-sm">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center font-bold text-slate-900 text-[10px]">
                        {leave.employeeName?.[0]}
                      </div>
                      <div>
                        <p className="font-medium text-slate-900">{leave.employeeName}</p>
                        <p className="text-[11px] text-slate-500">{leave.leaveType} • {leave.fromDate}</p>
                      </div>
                    </div>
                    <div className={`px-2 py-0.5 rounded-full text-[10px] font-semibold border ${leave.status === 'Approved' ? 'bg-emerald-50 text-emerald-700 border-emerald-100' : leave.status === 'Rejected' ? 'bg-rose-50 text-rose-700 border-rose-100' : 'bg-amber-50 text-amber-700 border-amber-100'}`}>
                      {leave.status}
                    </div>
                  </div>
                ))}
                {leaves.length === 0 && <p className="text-center py-6 text-slate-400 text-xs italic">No recent activity</p>}
              </div>
            </div>
            
            <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
              <div className="p-6 border-b border-slate-200">
                <h3 className="text-sm font-semibold leading-none tracking-tight flex items-center gap-2">
                  <PieChart size={14} /> Leave Distribution
                </h3>
              </div>
              <div className="p-6 pt-4 space-y-4">
                {leaveTypes.map(type => {
                  const count = leaves.filter(l => l.leaveType === type).length
                  const percentage = leaves.length ? (count / leaves.length) * 100 : 0
                  if (count === 0) return null
                  return (
                    <div key={type} className="space-y-1.5">
                      <div className="flex justify-between text-[11px] font-medium">
                        <span className="text-slate-500">{type}</span>
                        <span className="text-slate-950 font-semibold">{count} ({Math.round(percentage)}%)</span>
                      </div>
                      <div className="h-1.5 w-full bg-slate-100 rounded-full overflow-hidden">
                        <div className="h-full bg-slate-900 rounded-full" style={{ width: `${percentage}%` }}></div>
                      </div>
                    </div>
                  )
                })}
                {leaves.length === 0 && <p className="text-center py-6 text-slate-400 text-xs italic">No data available</p>}
              </div>
            </div>
          </div>
        </div>
      )}

      {(activeSub === 'request' || activeSub === 'approve') && (
        <div className="space-y-4">
          {/* Table Toolbar */}
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
              <input 
                type="text"
                placeholder="Search requests..."
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                className="flex h-9 w-full rounded-md border border-slate-200 bg-white px-9 py-2 text-sm ring-offset-white file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-slate-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-950 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
              />
            </div>
            <div className="flex bg-slate-100 p-0.5 rounded-lg border border-slate-200 h-9">
              {['All', ...leaveTypes.slice(0, 3)].map(t => (
                <button
                  key={t}
                  onClick={() => setFilterType(t)}
                  className={`px-3 py-1 rounded-md text-xs font-medium transition-all ${filterType === t ? 'bg-white text-slate-950 shadow-sm' : 'text-slate-500 hover:text-slate-900'}`}
                >
                  {t}
                </button>
              ))}
            </div>
          </div>

          <div className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-sm">
                <thead>
                  <tr className="bg-slate-50/50 h-11 border-b border-slate-200">
                    <th className="px-6 font-medium text-slate-500">Applicant</th>
                    <th className="px-6 font-medium text-slate-500">Type</th>
                    <th className="px-6 font-medium text-slate-500">Duration</th>
                    <th className="px-6 font-medium text-slate-500 text-center">Status</th>
                    <th className="px-6 font-medium text-slate-500 text-right">Actions</th>
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
                        <tr className="h-14 hover:bg-slate-50/50 transition-colors">
                          <td className="px-6">
                            <div className="flex flex-col">
                              <span className="font-semibold text-slate-900">{leave.employeeName}</span>
                              <span className="text-[11px] text-slate-500 italic line-clamp-1 max-w-[150px]">{leave.reason}</span>
                            </div>
                          </td>
                          <td className="px-6">
                            <span className="inline-flex items-center rounded-md border border-slate-200 bg-slate-50 px-2 py-0.5 text-xs font-semibold text-slate-900">{leave.leaveType}</span>
                          </td>
                          <td className="px-6">
                            <div className="flex flex-col">
                              <span className="text-xs font-medium text-slate-900">{leave.fromDate} — {leave.toDate || leave.fromDate}</span>
                              <span className="text-[10px] text-slate-500 mt-0.5">{leave.duration || calculateDuration(leave.fromDate, leave.toDate)} days</span>
                            </div>
                          </td>
                          <td className="px-6 text-center">
                            <div className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-[10px] font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-slate-950 focus:ring-offset-2 ${leave.status === 'Approved' ? 'bg-emerald-50 text-emerald-700 border-emerald-100' : leave.status === 'Rejected' ? 'bg-rose-50 text-rose-700 border-rose-100' : 'bg-amber-50 text-amber-700 border-amber-100'}`}>
                              {leave.status}
                            </div>
                          </td>
                          <td className="px-6">
                            <div className="flex justify-end gap-2">
                              {showApprovals ? (
                                <>
                                  <button onClick={() => handleAction(leave.id, 'Approved')} className="inline-flex items-center justify-center rounded-md text-[11px] font-semibold bg-emerald-600 text-white hover:bg-emerald-700 h-8 px-3 shadow transition-colors">
                                    Approve
                                  </button>
                                  <button onClick={() => handleAction(leave.id, 'Rejected')} className="inline-flex items-center justify-center rounded-md text-[11px] font-semibold bg-rose-600 text-white hover:bg-rose-700 h-8 px-3 shadow transition-colors">
                                    Reject
                                  </button>
                                </>
                              ) : (
                                <MoreHorizontal size={14} className="text-slate-400" />
                              )}
                            </div>
                          </td>
                        </tr>
                        {showApprovals && (
                          <tr className="bg-slate-50/30 border-b border-slate-200">
                            <td colSpan={5} className="px-6 py-4">
                              <div className="flex flex-col sm:flex-row items-end sm:items-center justify-end gap-4 max-w-2xl ml-auto">
                                {isHR && leave.hrApproval === 'Pending' && (
                                  <div className="w-full sm:w-64 space-y-1.5">
                                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-1">Assign Dept Head Approver</label>
                                    <div className="relative">
                                      <select 
                                        value={selectedNextApprover[leave.id] || ''} 
                                        onChange={e => setSelectedNextApprover(prev => ({ ...prev, [leave.id]: e.target.value }))} 
                                        className="flex h-9 w-full items-center justify-between rounded-md border border-slate-200 bg-white px-3 py-1 text-xs ring-offset-white focus:outline-none focus:ring-2 focus:ring-slate-950 appearance-none"
                                      >
                                        <option value="">Choose Dept. Head...</option>
                                        {employees.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
                                      </select>
                                      <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none h-3 w-3" />
                                    </div>
                                  </div>
                                )}
                                <div className="flex-1 w-full space-y-1.5">
                                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-1">Approval/Rejection Remarks</label>
                                  <div className="flex items-center gap-3 bg-white px-3 py-1.5 rounded-lg border border-slate-200 shadow-sm h-9">
                                    <MessageSquare size={14} className="text-slate-400" />
                                    <input 
                                      type="text"
                                      placeholder="Add mandatory remarks for rejection..."
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
        <div className="rounded-xl border border-slate-200 bg-white shadow-sm p-20 text-center space-y-4">
          <div className="mx-auto bg-slate-100 w-12 h-12 rounded-full flex items-center justify-center">
            <PieChart size={24} className="text-slate-900" />
          </div>
          <div className="space-y-1">
            <h3 className="text-lg font-semibold">Analytics View</h3>
            <p className="text-sm text-slate-500 max-w-sm mx-auto">This module is being updated with advanced data visualization and reporting tools.</p>
          </div>
        </div>
      )}
    </div>
  )
}
