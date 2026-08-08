import React from 'react';
import { FileText } from 'lucide-react';
import StatusBadge from './StatusBadge';

/**
 * RequestCard - Displays a request item with status and actions
 * @param {Object} props
 * @param {Object} props.request - Request data
 * @param {string} props.request.id - Request ID
 * @param {string} props.request.type - Request type (Leave, Permission, Advance)
 * @param {string} props.request.status - Request status
 * @param {string} [props.request.leaveType] - Leave type for leave requests
 * @param {string} [props.request.fromDate] - From date for leave requests
 * @param {string} [props.request.toDate] - To date for leave requests
 * @param {string} [props.request.date] - Date for permission requests
 * @param {string} [props.request.fromTime] - From time for permission requests
 * @param {string} [props.request.toTime] - To time for permission requests
 * @param {number} [props.request.amount] - Amount for advance requests
 * @param {string} [props.request.reason] - Reason for request
 * @param {function} [props.onWithdraw] - Withdraw handler
 * @param {boolean} [props.showActions] - Whether to show action buttons
 */
export default function RequestCard({
  request,
  onWithdraw,
  showActions = true
}) {
  const getRequestDetails = () => {
    switch (request.type) {
      case 'Leave':
        return `${request.leaveType || 'Leave'}: ${request.fromDate} \u2192 ${request.toDate || request.fromDate}`;
      case 'Permission':
        return `${request.permissionDate || request.date} at ${request.permissionTime || request.fromTime || '\u2014'}`;
      case 'Advance':
      case 'Expense':
        return `\u20b9${request.amount}`;
      default:
        return request.reason || '';
    }
  };

  const getIconColor = () => {
    if (request.status === 'Approved') return 'text-emerald-600';
    if (request.status === 'Rejected') return 'text-rose-600';
    return 'text-amber-600';
  };

  const getBgColor = () => {
    if (request.status === 'Approved') return 'bg-emerald-100';
    if (request.status === 'Rejected') return 'bg-rose-100';
    return 'bg-amber-100';
  };

  return (
    <div className="flex items-center justify-between p-3 bg-gray-50 rounded-xl">
      <div className="flex items-center gap-3">
        <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${getBgColor()}`}>
          <FileText size={14} className={getIconColor()} />
        </div>
        <div>
          <p className="text-sm font-medium text-gray-900">{request.type || 'Leave'}</p>
          <p className="text-xs text-gray-500">{getRequestDetails()}</p>
        </div>
      </div>
      <div className="flex items-center gap-2">
        <StatusBadge status={request.status} small />
        {showActions && request.status === 'Pending' && onWithdraw && (
          <button 
            onClick={() => onWithdraw(request.id, request.source)}
            className="text-xs text-rose-500 font-medium px-2 py-1"
          >
            Withdraw
          </button>
        )}
      </div>
    </div>
  );
}
