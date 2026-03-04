import { useAuth } from '../../hooks/useAuth'
import { useEmployees } from '../../hooks/useEmployees'
import { useOTApprovals } from '../../hooks/useOTApprovals'
import Spinner from '../ui/Spinner'

function getInitials(name) {
  return name?.split(' ').map(n => n[0]).join('').toUpperCase() || '??'
}

function getAvatarColor(id) {
  let hash = 0
  for (let i = 0; i < id.length; i++) hash = id.charCodeAt(i) + ((hash << 5) - hash)
  const h = hash % 360
  return `hsl(${h}, 70%, 50%)`
}

export default function ApprovalsTab() {
  const { user } = useAuth()
  const { employees } = useEmployees(user?.orgId)
  const { otApprovals, loading, submitOTApproval, updateOTStatus } = useOTApprovals(user?.orgId)

  const pending = otApprovals.filter(o => o.status === 'Pending')
  const resolved = otApprovals.filter(o => o.status !== 'Pending')

  const handleApprove = async (approvalId) => {
    await updateOTStatus(approvalId, 'Approved', user.uid)
  }

  const handleReject = async (approvalId) => {
    await updateOTStatus(approvalId, 'Rejected', user.uid)
  }

  const isAdmin = user?.role === 'admin'

  const getEmployee = (empId) => employees.find(e => e.id === empId)

  return (
    <div className="h-full flex flex-col">
      {/* Header Stats */}
      <div className="flex gap-4 mb-4">
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg px-4 py-2">
          <span className="text-yellow-700 font-semibold">{pending.length}</span>
          <span className="text-yellow-600 ml-1">Pending</span>
        </div>
        <div className="bg-green-50 border border-green-200 rounded-lg px-4 py-2">
          <span className="text-green-700 font-semibold">{resolved.filter(r => r.status === 'Approved').length}</span>
          <span className="text-green-600 ml-1">Approved</span>
        </div>
      </div>

      {/* Pending Section */}
      <div className="mb-6">
        <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-3">Pending Approval</h3>
        {loading ? (
          <div className="text-center py-8"><Spinner /></div>
        ) : pending.length === 0 ? (
          <div className="text-gray-400 text-sm">No pending approvals</div>
        ) : (
          <div className="space-y-3">
            {pending.map(approval => {
              const emp = getEmployee(approval.employeeId)
              return (
                <div key={approval.id} className="bg-white rounded-lg shadow p-4">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-3">
                      <div 
                        className="w-10 h-10 rounded-full flex items-center justify-center text-white text-sm font-bold"
                        style={{ backgroundColor: getAvatarColor(approval.employeeId) }}
                      >
                        {getInitials(approval.employeeName)}
                      </div>
                      <div>
                        <div className="font-semibold text-gray-800">{approval.employeeName}</div>
                        <div className="text-sm text-gray-500">{approval.date} • {emp?.site}</div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="bg-amber-100 text-amber-700 px-3 py-1 rounded-full text-sm font-semibold">
                        {approval.otHours} OT
                      </span>
                      <span className="bg-yellow-100 text-yellow-700 px-3 py-1 rounded-full text-sm font-medium">
                        Pending
                      </span>
                    </div>
                  </div>
                  <div className="text-gray-600 text-sm mb-3">{approval.reason}</div>
                  {isAdmin && (
                    <div className="flex gap-2">
                      <button 
                        onClick={() => handleApprove(approval.id)}
                        className="px-4 py-1.5 bg-green-500 text-white rounded-lg text-sm font-medium hover:bg-green-600"
                      >
                        Approve
                      </button>
                      <button 
                        onClick={() => handleReject(approval.id)}
                        className="px-4 py-1.5 bg-red-500 text-white rounded-lg text-sm font-medium hover:bg-red-600"
                      >
                        Reject
                      </button>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Resolved Section */}
      <div>
        <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-3">Resolved</h3>
        {resolved.length === 0 ? (
          <div className="text-gray-400 text-sm">No resolved requests</div>
        ) : (
          <div className="space-y-3 opacity-60">
            {resolved.map(approval => {
              const emp = getEmployee(approval.employeeId)
              return (
                <div key={approval.id} className="bg-white rounded-lg shadow p-4">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-3">
                      <div 
                        className="w-10 h-10 rounded-full flex items-center justify-center text-white text-sm font-bold"
                        style={{ backgroundColor: getAvatarColor(approval.employeeId) }}
                      >
                        {getInitials(approval.employeeName)}
                      </div>
                      <div>
                        <div className="font-semibold text-gray-800">{approval.employeeName}</div>
                        <div className="text-sm text-gray-500">{approval.date} • {emp?.site}</div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="bg-amber-100 text-amber-700 px-3 py-1 rounded-full text-sm font-semibold">
                        {approval.otHours} OT
                      </span>
                      <span className={`px-3 py-1 rounded-full text-sm font-medium ${
                        approval.status === 'Approved' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
                      }`}>
                        {approval.status}
                      </span>
                    </div>
                  </div>
                  <div className="text-gray-600 text-sm">{approval.reason}</div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
