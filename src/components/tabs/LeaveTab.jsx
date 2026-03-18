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
  ChevronDown
} from 'lucide-react'
import Spinner from '../ui/Spinner'
import Modal from '../ui/Modal'

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
    reason: '' 
  })
  
  const [actionRemarks, setActionRemarks] = useState({})

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
    if (!form.employeeId || !form.fromDate || !form.reason) return
    
    try {
      const emp = employees.find(e => e.id === form.employeeId)
      await applyLeave({
        ...form,
        employeeName: emp?.name || 'Unknown',
        orgId: user.orgId
      })
      setShowInlineForm(false)
      setForm({ employeeId: '', leaveType: 'Casual', fromDate: '', toDate: '', reason: '' })
      refreshLeaves()
    } catch (err) {
      alert('Failed to submit application: ' + err.message)
    }
  }

  const handleAction = async (requestId, status) => {
    const remarks = actionRemarks[requestId] || ''
    if (status === 'Rejected' && !remarks.trim()) {
      return alert('Please provide remarks for rejection.')
    }
    
    try {
      await updateLeaveStatus(requestId, status, remarks)
      setActionRemarks(prev => ({ ...prev, [requestId]: '' }))
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
    { id: 'dashboard', label: 'Overview', icon: <LayoutDashboard size={16} /> },
    { id: 'request', label: 'All Requests', icon: <FileText size={16} /> },
    { id: 'approve', label: 'Approvals', icon: <CheckCircle size={16} /> },
    { id: 'reports', label: 'Analysis', icon: <PieChart size={16} /> }
  ]

  const stats = [
    { label: 'Pending', count: leaves.filter(l => l.status === 'Pending').length, color: 'text-amber-600', bg: 'bg-amber-50', border: 'border-amber-100' },
    { label: 'Approved', count: leaves.filter(l => l.status === 'Approved').length, color: 'text-emerald-600', bg: 'bg-emerald-50', border: 'border-emerald-100' },
    { label: 'Rejected', count: leaves.filter(l => l.status === 'Rejected').length, color: 'text-rose-600', bg: 'bg-rose-50', border: 'border-rose-100' },
    { label: 'Total Volume', count: leaves.length, color: 'text-indigo-600', bg: 'bg-indigo-50', border: 'border-indigo-100' }
  ]

  const selectedEmployee = employees.find(e => e.id === form.employeeId)

  return (
    <div className="space-y-6 font-inter text-gray-900">
      {/* SaaS Navigation Header */}
      <div className="bg-white p-4 rounded-2xl shadow-sm border border-gray-100 flex flex-col md:flex-row justify-between items-center gap-4">
        <div className="flex bg-gray-50 p-1 rounded-xl border border-gray-100">
          {subNav.map(s => (
            <button
              key={s.id}
              onClick={() => setActiveSub(s.id)}
              className={`flex items-center gap-2 px-6 py-2.5 rounded-lg text-[11px] font-black uppercase tracking-widest transition-all ${activeSub === s.id ? 'bg-white shadow-sm text-indigo-600 border border-gray-100' : 'text-gray-400 hover:text-gray-600'}`}
            >
              {s.icon} {s.label}
            </button>
          ))}
        </div>
        <button 
          onClick={() => {
            setActiveSub('dashboard')
            setShowInlineForm(!showInlineForm)
          }}
          className={`h-[44px] px-8 font-black rounded-xl text-[11px] flex items-center gap-3 shadow-xl transition-all uppercase tracking-[0.15em] ${showInlineForm ? 'bg-gray-100 text-gray-600 shadow-none border border-gray-200' : 'bg-indigo-600 text-white shadow-indigo-100 hover:bg-indigo-700'}`}
        >
          {showInlineForm ? <X size={18} strokeWidth={2.5} /> : <PlusCircle size={18} strokeWidth={2.5} />} 
          {showInlineForm ? 'Cancel Application' : 'New Application'}
        </button>
      </div>

      {activeSub === 'dashboard' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {stats.map(stat => (
              <div key={stat.label} className={`${stat.bg} ${stat.border} border p-8 rounded-2xl shadow-sm flex flex-col items-center text-center group hover:shadow-md transition-all`}>
                <p className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em] mb-4">{stat.label}</p>
                <p className={`text-4xl font-black ${stat.color} tracking-tighter`}>{stat.count}</p>
              </div>
            ))}
          </div>

          {/* Inline Application Form */}
          {showInlineForm && (
            <div className="bg-white rounded-2xl border border-indigo-100 shadow-xl shadow-indigo-900/5 overflow-hidden animate-in fade-in slide-in-from-top-4 duration-500">
              <div className="bg-indigo-600 px-8 py-4 flex items-center justify-between">
                <h3 className="text-white text-[11px] font-black uppercase tracking-[0.2em]">New Absence Protocol Initialization</h3>
                <div className="bg-white/10 px-3 py-1 rounded-full text-[9px] text-white/80 font-bold uppercase tracking-widest">Step 1: Resource Mapping</div>
              </div>
              
              <form onSubmit={handleSubmit} className="p-10 space-y-10">
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-10">
                  <div className="space-y-8">
                    <div>
                      <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-4 px-1 flex items-center gap-2">
                        <UserIcon size={14} className="text-indigo-500" /> Name of the employee
                      </label>
                      <div className="relative group">
                        <select 
                          value={form.employeeId} 
                          onChange={e => setForm({...form, employeeId: e.target.value})} 
                          className="w-full h-[54px] border border-gray-100 rounded-xl px-6 text-sm font-black bg-gray-50/50 focus:bg-white focus:ring-4 focus:ring-indigo-500/5 focus:border-indigo-500 outline-none cursor-pointer appearance-none transition-all"
                        >
                          <option value="">Select Resource...</option>
                          {employees.map(e => <option key={e.id} value={e.id}>{e.name} ({e.empCode || 'N/A'})</option>)}
                        </select>
                        <ChevronDown className="absolute right-5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none group-hover:text-indigo-500 transition-colors" size={18} />
                      </div>
                    </div>

                    {form.employeeId && (
                      <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden shadow-sm animate-in zoom-in-95 duration-500">
                        <div className="bg-gray-50 px-6 py-3 border-b border-gray-100 flex items-center justify-between">
                          <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Leave Entitlement Dashboard</span>
                          <span className="text-[9px] font-bold text-indigo-500 bg-indigo-50 px-2 py-0.5 rounded uppercase">{selectedEmployee?.name}</span>
                        </div>
                        <div className="overflow-x-auto">
                          <table className="w-full text-left">
                            <thead>
                              <tr className="border-b border-gray-50">
                                <th className="px-6 py-4 text-[9px] font-black text-gray-400 uppercase tracking-widest">Leave Type</th>
                                <th className="px-6 py-4 text-[9px] font-black text-gray-400 uppercase tracking-widest text-center">Allocated</th>
                                <th className="px-6 py-4 text-[9px] font-black text-gray-400 uppercase tracking-widest text-center">Used</th>
                                <th className="px-6 py-4 text-[9px] font-black text-gray-400 uppercase tracking-widest text-center text-indigo-600">Available</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-50">
                              {[
                                { type: 'Casual Leave', total: 0, used: 0 },
                                { type: 'Privilege Leave', total: 0, used: 0 },
                                { type: 'Sick Leave', total: 0, used: 0 }
                              ].map((row, i) => (
                                <tr key={i} className="hover:bg-gray-50/50 transition-colors">
                                  <td className="px-6 py-4 text-[11px] font-black text-gray-700 uppercase">{row.type}</td>
                                  <td className="px-6 py-4 text-[12px] font-black text-gray-500 text-center">{row.total}</td>
                                  <td className="px-6 py-4 text-[12px] font-black text-gray-500 text-center">{row.used}</td>
                                  <td className="px-6 py-4 text-[12px] font-black text-indigo-600 text-center">{row.total - row.used}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="space-y-8">
                    <div className="grid grid-cols-2 gap-6">
                      <div>
                        <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-4 px-1">Commencement (From Date)</label>
                        <input 
                          type="date" 
                          value={form.fromDate} 
                          onChange={e => setForm({...form, fromDate: e.target.value})} 
                          className="w-full h-[54px] border border-gray-100 rounded-xl px-6 text-sm font-black bg-gray-50/50 focus:bg-white focus:ring-4 focus:ring-indigo-500/5 focus:border-indigo-500 outline-none transition-all" 
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-4 px-1">Conclusion (To Date)</label>
                        <input 
                          type="date" 
                          value={form.toDate} 
                          onChange={e => setForm({...form, toDate: e.target.value})} 
                          className="w-full h-[54px] border border-gray-100 rounded-xl px-6 text-sm font-black bg-gray-50/50 focus:bg-white focus:ring-4 focus:ring-indigo-500/5 focus:border-indigo-500 outline-none transition-all" 
                        />
                      </div>
                    </div>

                    <div>
                      <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-4 px-1">Classification & Priority</label>
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                        {leaveTypes.slice(0, 4).map(type => (
                          <button
                            key={type}
                            type="button"
                            onClick={() => setForm({...form, leaveType: type})}
                            className={`py-3 rounded-lg border text-[9px] font-black uppercase tracking-widest transition-all ${form.leaveType === type ? 'bg-indigo-600 text-white border-indigo-600 shadow-lg shadow-indigo-100' : 'bg-white text-gray-400 border-gray-100 hover:border-indigo-200 hover:text-indigo-500'}`}
                          >
                            {type}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div>
                      <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-4 px-1">Formal Justification</label>
                      <textarea 
                        value={form.reason} 
                        onChange={e => setForm({...form, reason: e.target.value})} 
                        className="w-full border border-gray-100 rounded-xl p-6 text-sm font-medium outline-none bg-gray-50/50 focus:bg-white focus:ring-4 focus:ring-indigo-500/5 focus:border-indigo-500 h-[100px] transition-all resize-none" 
                        placeholder="Provide comprehensive context for this request..." 
                      />
                    </div>
                  </div>
                </div>

                <div className="flex justify-end pt-6 border-t border-gray-50 gap-4">
                  <button 
                    type="button"
                    onClick={() => setShowInlineForm(false)}
                    className="h-[52px] px-10 bg-gray-50 text-gray-400 font-black rounded-xl hover:bg-gray-100 transition-all uppercase tracking-[0.2em] text-[11px]"
                  >
                    Discard
                  </button>
                  <button 
                    type="submit" 
                    className="h-[52px] px-12 bg-indigo-600 text-white font-black rounded-xl shadow-2xl shadow-indigo-200 hover:bg-indigo-700 transition-all uppercase tracking-[0.2em] text-[11px] flex items-center gap-3"
                  >
                    <CheckCircle size={18} /> Finalize Protocol
                  </button>
                </div>
              </form>
            </div>
          )}
          
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm">
              <h3 className="text-[12px] font-black text-gray-800 uppercase tracking-widest mb-6 flex items-center gap-2">
                <Clock size={16} className="text-indigo-500" /> Recent Activity
              </h3>
              <div className="space-y-4">
                {leaves.slice(0, 5).map(leave => (
                  <div key={leave.id} className="flex items-center justify-between p-4 bg-gray-50 rounded-xl border border-gray-100">
                    <div className="flex items-center gap-4">
                      <div className="w-10 h-10 rounded-full bg-white border border-gray-100 flex items-center justify-center font-black text-indigo-600 text-xs shadow-inner">
                        {leave.employeeName?.[0]}
                      </div>
                      <div>
                        <p className="text-[13px] font-black text-gray-800 uppercase tracking-tight">{leave.employeeName}</p>
                        <p className="text-[10px] text-gray-400 font-bold">{leave.leaveType} • {leave.fromDate}</p>
                      </div>
                    </div>
                    <span className={`text-[9px] font-black uppercase tracking-widest px-3 py-1 rounded-full ${leave.status === 'Approved' ? 'bg-emerald-100 text-emerald-600' : leave.status === 'Rejected' ? 'bg-rose-100 text-rose-600' : 'bg-amber-100 text-amber-600'}`}>
                      {leave.status}
                    </span>
                  </div>
                ))}
                {leaves.length === 0 && <p className="text-center py-10 text-gray-300 font-bold uppercase italic tracking-widest text-[11px] opacity-60">No recent activity</p>}
              </div>
            </div>
            
            <div className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm">
              <h3 className="text-[12px] font-black text-gray-800 uppercase tracking-widest mb-6 flex items-center gap-2">
                <PieChart size={16} className="text-indigo-500" /> Leave Distribution
              </h3>
              <div className="space-y-3">
                {leaveTypes.map(type => {
                  const count = leaves.filter(l => l.leaveType === type).length
                  const percentage = leaves.length ? (count / leaves.length) * 100 : 0
                  if (count === 0) return null
                  return (
                    <div key={type} className="space-y-1.5">
                      <div className="flex justify-between text-[11px] font-black uppercase tracking-widest">
                        <span className="text-gray-500">{type}</span>
                        <span className="text-gray-900">{count} ({Math.round(percentage)}%)</span>
                      </div>
                      <div className="h-1.5 w-full bg-gray-100 rounded-full overflow-hidden">
                        <div className="h-full bg-indigo-500 rounded-full" style={{ width: `${percentage}%` }}></div>
                      </div>
                    </div>
                  )
                })}
                {leaves.length === 0 && <p className="text-center py-10 text-gray-300 font-bold uppercase italic tracking-widest text-[11px] opacity-60">No data available</p>}
              </div>
            </div>
          </div>
        </div>
      )}

      {(activeSub === 'request' || activeSub === 'approve') && (
        <div className="space-y-4">
          <div className="bg-white p-4 rounded-2xl border border-gray-100 shadow-sm flex flex-col md:flex-row gap-4">
            <div className="flex-1 relative">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
              <input 
                type="text"
                placeholder="Search by applicant or reason..."
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                className="w-full h-[44px] bg-gray-50 border border-gray-200 rounded-xl pl-12 pr-4 text-[13px] font-bold outline-none focus:border-indigo-500 transition-all"
              />
            </div>
            <div className="flex items-center gap-2 bg-gray-50 p-1 rounded-xl border border-gray-100">
              <Filter size={16} className="text-gray-400 ml-3 mr-1" />
              {['All', ...leaveTypes.slice(0, 4)].map(t => (
                <button
                  key={t}
                  onClick={() => setFilterType(t)}
                  className={`px-4 py-2 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${filterType === t ? 'bg-white shadow-sm text-indigo-600 border border-gray-100' : 'text-gray-400 hover:text-gray-600'}`}
                >
                  {t}
                </button>
              ))}
            </div>
          </div>

          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-gray-50/50 h-[48px] border-b border-gray-100">
                    <th className="px-6 text-[10px] font-black text-gray-400 uppercase tracking-widest">Applicant</th>
                    <th className="px-6 text-[10px] font-black text-gray-400 uppercase tracking-widest">Classification</th>
                    <th className="px-6 text-[10px] font-black text-gray-400 uppercase tracking-widest">Period / Duration</th>
                    <th className="px-6 text-[10px] font-black text-gray-400 uppercase tracking-widest text-center">Status</th>
                    <th className="px-6 text-[10px] font-black text-gray-400 uppercase tracking-widest text-right">Action Interface</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {leaveLoading ? (
                    <tr><td colSpan={5} className="py-20 text-center"><Spinner /></td></tr>
                  ) : filteredLeaves.length === 0 ? (
                    <tr><td colSpan={5} className="py-24 text-center text-gray-300 font-bold uppercase italic tracking-widest opacity-40">No leave requests match your criteria</td></tr>
                  ) : filteredLeaves.map(leave => {
                    const isPending = leave.status === 'Pending'
                    const showApprovals = activeSub === 'approve' && isPending
                    return (
                      <React.Fragment key={leave.id}>
                        <tr className="h-[72px] hover:bg-gray-50/30 transition-colors group">
                          <td className="px-6">
                            <div className="flex items-center gap-3">
                              <div className="w-10 h-10 rounded-xl bg-indigo-50 flex items-center justify-center font-black text-indigo-600 text-xs shadow-inner">
                                {leave.employeeName?.[0]}
                              </div>
                              <div className="flex flex-col">
                                <span className="text-[13px] font-black text-gray-800 uppercase tracking-tight">{leave.employeeName}</span>
                                <span className="text-[10px] text-gray-400 font-bold italic line-clamp-1 max-w-[200px]">"{leave.reason}"</span>
                              </div>
                            </div>
                          </td>
                          <td className="px-6">
                            <span className="bg-indigo-50 text-indigo-600 px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-[0.15em] border border-indigo-100">{leave.leaveType}</span>
                          </td>
                          <td className="px-6">
                            <div className="flex flex-col">
                              <div className="flex items-center gap-2 text-gray-700">
                                <span className="text-[12px] font-black">{leave.fromDate}</span>
                                <ArrowRight size={12} className="text-gray-300" />
                                <span className="text-[12px] font-black">{leave.toDate || leave.fromDate}</span>
                              </div>
                              <span className="text-[10px] font-bold text-indigo-500 uppercase tracking-widest mt-1">{leave.duration || calculateDuration(leave.fromDate, leave.toDate)} Days</span>
                            </div>
                          </td>
                          <td className="px-6 text-center">
                            <div className="flex flex-col items-center gap-1">
                              <span className={`text-[10px] font-black uppercase tracking-[0.15em] ${leave.status === 'Approved' ? 'text-emerald-500' : leave.status === 'Rejected' ? 'text-rose-500' : 'text-amber-500'}`}>
                                {leave.status}
                              </span>
                              {isPending && (
                                <div className="flex gap-1.5 mt-1">
                                  <div className={`w-1.5 h-1.5 rounded-full ${leave.hrApproval === 'Approved' ? 'bg-emerald-500' : 'bg-gray-200'}`} title="HR Approval"></div>
                                  <div className={`w-1.5 h-1.5 rounded-full ${leave.mdApproval === 'Approved' ? 'bg-emerald-500' : 'bg-gray-200'}`} title="MD Approval"></div>
                                </div>
                              )}
                            </div>
                          </td>
                          <td className="px-6">
                            <div className="flex justify-end gap-2">
                              {showApprovals ? (
                                <>
                                  <button onClick={() => handleAction(leave.id, 'Approved')} className="h-[34px] px-5 bg-emerald-600 text-white rounded-lg font-black uppercase text-[10px] tracking-widest shadow-lg shadow-emerald-100 hover:bg-emerald-700 transition-all flex items-center gap-2">
                                    <Check size={14} strokeWidth={3} /> Authorize
                                  </button>
                                  <button onClick={() => handleAction(leave.id, 'Rejected')} className="h-[34px] px-5 bg-rose-600 text-white rounded-lg font-black uppercase text-[10px] tracking-widest shadow-lg shadow-rose-100 hover:bg-rose-700 transition-all flex items-center gap-2">
                                    <X size={14} strokeWidth={3} /> Decline
                                  </button>
                                </>
                              ) : (
                                <div className="flex items-center gap-2 text-gray-300 text-[10px] font-black uppercase tracking-widest px-4 italic bg-gray-50 py-2 rounded-lg border border-gray-100">
                                  <CheckCircle size={14} /> Immutable Record
                                </div>
                              )}
                            </div>
                          </td>
                        </tr>
                        {showApprovals && (
                          <tr className="bg-gray-50/30">
                            <td colSpan={5} className="px-6 py-3">
                              <div className="flex items-center gap-4 bg-white p-2 rounded-xl border border-gray-200 shadow-sm max-w-xl ml-auto">
                                <MessageSquare size={16} className="text-gray-400 ml-2" />
                                <input 
                                  type="text"
                                  placeholder="Provide optional remarks or reason for rejection (mandatory for decline)..."
                                  value={actionRemarks[leave.id] || ''}
                                  onChange={e => setActionRemarks(prev => ({ ...prev, [leave.id]: e.target.value }))}
                                  className="flex-1 bg-transparent border-none outline-none text-[12px] font-medium text-gray-600 placeholder:text-gray-300"
                                />
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
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-12 text-center">
          <PieChart size={64} className="text-gray-100 mx-auto mb-6" />
          <h3 className="text-xl font-black text-gray-900 uppercase tracking-tight mb-2">Advanced Analytics</h3>
          <p className="text-[11px] font-black text-gray-400 uppercase tracking-[0.2em]">Module Under Construction</p>
          <p className="text-[13px] text-gray-500 mt-6 max-w-md mx-auto leading-relaxed">
            Predictive leave analysis and departmental absenteeism reports are being synthesized and will be available in the next release.
          </p>
        </div>
      )}
    </div>
  )
}
