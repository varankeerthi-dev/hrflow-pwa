import React, { useState } from 'react';
import { ChevronLeft, ChevronRight as ChevronRightIcon, FileText, Plus, CheckCircle2, AlertCircle, X } from 'lucide-react';
import { format } from 'date-fns';
import RequestCard from '../shared/RequestCard';
import StatusBadge from '../shared/StatusBadge';

/**
 * RequestsView - Employee requests management view
 * @param {Object} props
 * @param {Array} props.requests - Employee requests
 * @param {Object} props.expandedMonths - Expanded months state
 * @param {Function} props.onToggleMonth - Toggle month expansion handler
 * @param {Function} props.onWithdrawRequest - Withdraw request handler
 * @param {Function} props.onShowRequestModal - Show request modal handler
 * @param {Function} props.onNavigateBack - Back navigation handler
 */
export default function RequestsView({
  requests,
  expandedMonths,
  onToggleMonth,
  onWithdrawRequest,
  onShowRequestModal,
  onNavigateBack
}) {
  const groupRequestsByMonth = (requests) => {
    const grouped = {};
    requests.forEach(req => {
      const date = req.createdAt?.toDate ? req.createdAt.toDate() : new Date();
      const monthKey = date.toLocaleDateString('en-US', { year: 'numeric', month: 'long' });
      if (!grouped[monthKey]) {
        grouped[monthKey] = [];
      }
      grouped[monthKey].push(req);
    });
    return grouped;
  };

  const getDetailedStatus = (req) => {
    if (req.status === 'Rejected') {
      return { label: 'Rejected', color: 'bg-red-100 text-red-700', stage: 'rejected' };
    }
    if (req.status === 'Approved') {
      return { label: 'Approved', color: 'bg-green-100 text-green-700', stage: 'approved' };
    }
    
    const hrStatus = req.hrApproval || 'Pending';
    const mdStatus = req.mdApproval || 'Pending';
    const deptHeadStatus = req.deptHeadApproval || 'Pending';
    
    if (req.approvalType === 'multi') {
      if (deptHeadStatus === 'Pending') {
        return { label: 'Dept Head Pending', color: 'bg-amber-100 text-amber-700', stage: 'dept-head' };
      }
      if (deptHeadStatus === 'Approved' && mdStatus === 'Pending') {
        return { label: 'MD Pending', color: 'bg-amber-100 text-amber-700', stage: 'md' };
      }
      if (deptHeadStatus === 'Rejected' || mdStatus === 'Rejected') {
        return { label: 'Rejected', color: 'bg-red-100 text-red-700', stage: 'rejected' };
      }
    } else {
      if (hrStatus === 'Pending') {
        return { label: 'HR Pending', color: 'bg-amber-100 text-amber-700', stage: 'hr' };
      }
      if (hrStatus === 'Approved' && mdStatus === 'Pending') {
        return { label: 'MD Pending', color: 'bg-blue-100 text-blue-700', stage: 'md' };
      }
      if (hrStatus === 'Rejected' || mdStatus === 'Rejected') {
        return { label: 'Rejected', color: 'bg-red-100 text-red-700', stage: 'rejected' };
      }
    }
    
    return { label: 'Pending', color: 'bg-amber-100 text-amber-700', stage: 'pending' };
  };

  const grouped = groupRequestsByMonth(requests);
  const monthKeys = Object.keys(grouped).sort((a, b) => {
    const dateA = new Date(a);
    const dateB = new Date(b);
    return dateB - dateA;
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between px-1">
        <button 
          onClick={onNavigateBack}
          className="flex items-center gap-1 text-gray-600"
        >
          <ChevronLeft size={20} />
          <span className="font-medium">Back</span>
        </button>
        <h2 className="font-bold text-gray-900">My Requests</h2>
        <button 
          onClick={onShowRequestModal}
          className="w-8 h-8 bg-indigo-600 rounded-lg flex items-center justify-center text-white"
        >
          <Plus size={18} />
        </button>
      </div>

      {requests.length === 0 ? (
        <div className="text-center py-12">
          <FileText size={48} className="text-gray-300 mx-auto mb-4" />
          <p className="text-gray-500 mb-4">No requests yet</p>
          <button 
            onClick={onShowRequestModal}
            className="bg-indigo-600 text-white px-6 py-2.5 rounded-xl font-medium"
          >
            Create Request
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          {monthKeys.map(monthKey => {
            const monthRequests = grouped[monthKey];
            const isExpanded = expandedMonths[monthKey] !== false;
            
            const pendingCount = monthRequests.filter(r => r.status === 'Pending' || (!r.status && r.hrApproval === 'Pending')).length;
            const approvedCount = monthRequests.filter(r => r.status === 'Approved').length;
            const rejectedCount = monthRequests.filter(r => r.status === 'Rejected').length;

            return (
              <div key={monthKey} className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
                {/* Month Header */}
                <button
                  onClick={() => onToggleMonth(monthKey)}
                  className="w-full flex items-center justify-between p-4 bg-gray-50/50 border-b border-gray-100"
                >
                  <div className="flex items-center gap-3">
                    <div className={`transform transition-transform duration-200 ${isExpanded ? 'rotate-90' : ''}`}>
                      <ChevronRightIcon size={16} className="text-gray-400" />
                    </div>
                    <div>
                      <h3 className="font-bold text-gray-900">{monthKey}</h3>
                      <p className="text-xs text-gray-400">{monthRequests.length} request{monthRequests.length !== 1 ? 's' : ''}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5">
                    {pendingCount > 0 && (
                      <span className="text-[10px] font-bold text-amber-700 bg-amber-100 px-2 py-0.5 rounded-full">
                        {pendingCount}
                      </span>
                    )}
                    {approvedCount > 0 && (
                      <span className="text-[10px] font-bold text-green-700 bg-green-100 px-2 py-0.5 rounded-full">
                        {approvedCount}
                      </span>
                    )}
                    {rejectedCount > 0 && (
                      <span className="text-[10px] font-bold text-red-700 bg-red-100 px-2 py-0.5 rounded-full">
                        {rejectedCount}
                      </span>
                    )}
                  </div>
                </button>

                {/* Month Content */}
                {isExpanded && (
                  <div className="p-4 space-y-3">
                    {monthRequests.map(req => {
                      const statusInfo = getDetailedStatus(req);
                      return (
                        <div key={req.id} className="bg-white rounded-xl p-4 border border-gray-100 shadow-sm">
                          <div className="flex items-start justify-between mb-3">
                            <div className="flex items-center gap-3">
                              <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${statusInfo.color.split(' ')[0]}`}>
                                <FileText size={18} className={statusInfo.color.includes('text-red') ? 'text-red-600' : statusInfo.color.includes('text-green') ? 'text-green-600' : 'text-amber-600'} />
                              </div>
                              <div>
                                <p className="font-semibold text-gray-900">{req.type || 'Leave'}</p>
                                <p className="text-xs text-gray-500">
                                  {req.createdAt?.toDate?.() ? format(req.createdAt.toDate(), 'MMM d, yyyy') : 'Recently'}
                                </p>
                              </div>
                            </div>
                            <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${statusInfo.color}`}>
                              {statusInfo.label}
                            </span>
                          </div>
                          
                          {/* Details */}
                          <div className="mb-3">
                            {req.type === 'Leave' && (
                              <p className="text-sm text-gray-600">
                                {req.leaveType || 'Leave'}: {req.fromDate} \u2192 {req.toDate || req.fromDate}
                              </p>
                            )}
                            {req.type === 'Permission' && (
                              <p className="text-sm text-gray-600">
                                {req.permissionDate || req.date} at {req.permissionTime || req.fromTime || '\u2014'}
                              </p>
                            )}
                            {(req.type === 'Advance' || req.type === 'Expense') && (
                              <p className="text-sm text-gray-600">\u20b9{req.amount}</p>
                            )}
                          </div>

                          {/* Approval Workflow */}
                          <div className="bg-gray-50 rounded-lg p-3 mb-3">
                            <p className="text-[10px] font-bold text-gray-400 uppercase mb-2">Approval Status</p>
                            
                            {req.approvalType === 'multi' && (
                              <div className="flex items-center gap-2 mb-1.5">
                                <div className={`w-1.5 h-1.5 rounded-full ${
                                  req.deptHeadApproval === 'Approved' ? 'bg-green-500' : 
                                  req.deptHeadApproval === 'Rejected' ? 'bg-red-500' : 
                                  'bg-amber-500'
                                }`}></div>
                                <span className={`text-xs ${
                                  req.deptHeadApproval === 'Approved' ? 'text-green-700' : 
                                  req.deptHeadApproval === 'Rejected' ? 'text-red-700' : 
                                  'text-amber-600'
                                }`}>
                                  Dept Head: {req.deptHeadApproval || 'Pending'}
                                </span>
                              </div>
                            )}
                            
                            <div className="flex items-center gap-2 mb-1.5">
                              <div className={`w-1.5 h-1.5 rounded-full ${
                                req.hrApproval === 'Approved' ? 'bg-green-500' : 
                                req.hrApproval === 'Rejected' ? 'bg-red-500' : 
                                'bg-amber-500'
                              }`}></div>
                              <span className={`text-xs ${
                                req.hrApproval === 'Approved' ? 'text-green-700' : 
                                req.hrApproval === 'Rejected' ? 'text-red-700' : 
                                'text-amber-600'
                              }`}>
                                HR: {req.hrApproval || 'Pending'}
                              </span>
                            </div>
                            
                            <div className="flex items-center gap-2">
                              <div className={`w-1.5 h-1.5 rounded-full ${
                                req.mdApproval === 'Approved' ? 'bg-green-500' : 
                                req.mdApproval === 'Rejected' ? 'bg-red-500' : 
                                req.hrApproval === 'Approved' ? 'bg-amber-500' :
                                'bg-gray-300'
                              }`}></div>
                              <span className={`text-xs ${
                                req.mdApproval === 'Approved' ? 'text-green-700' : 
                                req.mdApproval === 'Rejected' ? 'text-red-700' : 
                                req.hrApproval === 'Approved' ? 'text-amber-600' :
                                'text-gray-400'
                              }`}>
                                MD: {req.mdApproval || (req.hrApproval === 'Approved' ? 'Pending' : 'Waiting')}
                              </span>
                            </div>

                            {(req.type === 'Advance' || req.type === 'Expense') && (
                              <div className="mt-2 pt-2 border-t border-gray-200">
                                <div className="flex items-center gap-2">
                                  <div className={`w-1.5 h-1.5 rounded-full ${
                                    req.paymentStatus === 'Paid' ? 'bg-emerald-500' : 'bg-gray-300'
                                  }`}></div>
                                  <span className={`text-xs ${
                                    req.paymentStatus === 'Paid' ? 'text-emerald-700' : 'text-gray-400'
                                  }`}>
                                    Payment: {req.paymentStatus || 'Pending'}
                                  </span>
                                </div>
                              </div>
                            )}
                          </div>
                          
                          <p className="text-sm text-gray-600 mb-3 line-clamp-2">{req.reason}</p>
                          
                          {req.status === 'Pending' && (
                            <button 
                              onClick={() => onWithdrawRequest(req.id, req.source)}
                              className="w-full py-2.5 text-rose-600 text-sm font-medium bg-rose-50 rounded-xl"
                            >
                              Withdraw Request
                            </button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
