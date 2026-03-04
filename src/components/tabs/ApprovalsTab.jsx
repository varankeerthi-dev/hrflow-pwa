import { useAuth } from '../../hooks/useAuth'
import { useEmployees } from '../../hooks/useEmployees'
import { useOTApprovals } from '../../hooks/useOTApprovals'
import Spinner from '../ui/Spinner'
import { CheckCircle2, XCircle, Clock, Search, Filter } from 'lucide-react'

function getInitials(name) {
  return name?.split(' ').map(n => n[0]).join('').toUpperCase() || '??'
}

export default function ApprovalsTab() {
  const { user } = useAuth()
  const { employees } = useEmployees(user?.orgId)
  const { otApprovals, loading, updateOTStatus } = useOTApprovals(user?.orgId)

  const handleApproval = async (id, status) => {
    if (!user?.uid) return
    await updateOTStatus(id, status, user.uid)
  }

  return (
    <div className="space-y-6 font-inter">
      {/* Search and Filters Header */}
      <div className="bg-white p-6 rounded-[12px] shadow-sm border border-gray-100 flex flex-wrap justify-between items-center gap-4">
        <div className="flex items-center gap-3">
          <div className="w-2.5 h-2.5 bg-amber-500 rounded-full"></div>
          <h3 className="text-sm font-bold text-gray-800 uppercase tracking-tight">Request Queue</h3>
        </div>
        <div className="flex gap-2">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={14} />
            <input type="text" placeholder="Search requests..." className="h-[36px] pl-9 pr-4 border border-gray-200 rounded-lg text-[13px] bg-gray-50/50 focus:ring-2 focus:ring-indigo-500 outline-none w-[200px]" />
          </div>
          <button className="h-[36px] px-4 bg-[#f3f4f6] text-[#374151] rounded-lg text-[12px] font-semibold flex items-center gap-2 hover:bg-gray-200 transition-all uppercase tracking-tighter">
            <Filter size={14} /> Filters
          </button>
        </div>
      </div>

      {/* Main Approvals Card */}
      <div className="bg-white rounded-[12px] border border-gray-100 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="h-[42px] bg-[#f9fafb]">
                <th className="px-[16px] text-[12px] font-semibold text-[#6b7280] uppercase tracking-wider">Employee</th>
                <th className="px-[16px] text-[12px] font-semibold text-[#6b7280] uppercase tracking-wider">Details</th>
                <th className="px-[16px] text-[12px] font-semibold text-[#6b7280] uppercase tracking-wider text-center">Auto OT</th>
                <th className="px-[16px] text-[12px] font-semibold text-[#6b7280] uppercase tracking-wider text-center">Revised</th>
                <th className="px-[16px] text-[12px] font-semibold text-[#6b7280] uppercase tracking-wider">Status</th>
                <th className="px-[16px] text-[12px] font-semibold text-[#6b7280] uppercase tracking-wider text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#f1f5f9]">
              {loading ? (
                <tr><td colSpan={6} className="text-center py-12"><Spinner /></td></tr>
              ) : otApprovals.length === 0 ? (
                <tr><td colSpan={6} className="text-center py-20 text-gray-300 font-medium uppercase tracking-tighter text-lg opacity-40 italic">No pending requests found</td></tr>
              ) : (
                otApprovals.map((approval) => {
                  const emp = employees.find(e => e.id === approval.employeeId)
                  return (
                    <tr key={approval.id} className="h-[48px] hover:bg-[#f8fafc] transition-colors group">
                      <td className="px-[16px]">
                        <div className="flex items-center gap-3">
                          <div className="w-7 h-7 rounded-lg flex items-center justify-center bg-gray-100 text-gray-500 text-[10px] font-bold">
                            {getInitials(emp?.name)}
                          </div>
                          <div>
                            <p className="text-[13px] font-bold text-gray-700 uppercase tracking-tight">{emp?.name || 'Unknown'}</p>
                            <p className="text-[10px] text-gray-400 font-medium">{approval.month}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-[16px]">
                        <p className="text-[12px] text-gray-600 font-medium line-clamp-1 italic">"{approval.note || 'No notes provided'}"</p>
                      </td>
                      <td className="px-[16px] text-center font-mono font-bold text-gray-400 text-[12px]">{approval.autoOTHours}h</td>
                      <td className="px-[16px] text-center font-mono font-bold text-indigo-600 text-[13px]">{approval.finalOTHours}h</td>
                      <td className="px-[16px]">
                        <div className="flex items-center gap-1.5">
                          {approval.status === 'pending' ? (
                            <span className="flex items-center gap-1 text-amber-600 text-[10px] font-black uppercase tracking-widest"><Clock size={12} /> Pending</span>
                          ) : approval.status === 'approved' ? (
                            <span className="flex items-center gap-1 text-green-600 text-[10px] font-black uppercase tracking-widest"><CheckCircle2 size={12} /> Approved</span>
                          ) : (
                            <span className="flex items-center gap-1 text-red-600 text-[10px] font-black uppercase tracking-widest"><XCircle size={12} /> Rejected</span>
                          )}
                        </div>
                      </td>
                      <td className="px-[16px]">
                        <div className="flex justify-end gap-2">
                          {approval.status === 'pending' ? (
                            <>
                              <button 
                                onClick={() => handleApproval(approval.id, 'approved')}
                                className="h-[32px] px-3 bg-green-50 text-green-700 rounded-md text-[11px] font-bold uppercase tracking-widest hover:bg-green-600 hover:text-white transition-all shadow-sm"
                              >
                                Approve
                              </button>
                              <button 
                                onClick={() => handleApproval(approval.id, 'rejected')}
                                className="h-[32px] px-3 bg-red-50 text-red-700 rounded-md text-[11px] font-bold uppercase tracking-widest hover:bg-red-600 hover:text-white transition-all shadow-sm"
                              >
                                Reject
                              </button>
                            </>
                          ) : (
                            <button className="h-[32px] px-3 bg-gray-50 text-gray-400 rounded-md text-[10px] font-bold uppercase tracking-widest cursor-not-allowed" disabled>
                              Complete
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
