import React from 'react';

/**
 * StatusBadge - Reusable component for displaying status badges
 * @param {Object} props
 * @param {string} props.status - The status to display
 * @param {string} [props.className] - Additional CSS classes
 * @param {boolean} [props.small] - Whether to use small size
 */
export default function StatusBadge({ status, className = '', small = false }) {
  const getStatusConfig = (status) => {
    if (!status) return { label: 'Pending', color: 'bg-amber-100 text-amber-700' };
    
    const statusMap = {
      'Approved': { label: 'Approved', color: 'bg-green-100 text-green-700' },
      'Rejected': { label: 'Rejected', color: 'bg-red-100 text-red-700' },
      'Pending': { label: 'Pending', color: 'bg-amber-100 text-amber-700' },
      'Checked In': { label: 'Checked In', color: 'bg-indigo-100 text-indigo-700' },
      'Checked Out': { label: 'Checked Out', color: 'bg-emerald-100 text-emerald-700' },
      'Completed': { label: 'Completed', color: 'bg-emerald-100 text-emerald-700' },
      'Absent': { label: 'Absent', color: 'bg-rose-100 text-rose-700' },
      'On Leave': { label: 'On Leave', color: 'bg-blue-100 text-blue-700' },
      'Not Checked In': { label: 'Not Checked In', color: 'bg-gray-100 text-gray-700' },
      'Dept Head Pending': { label: 'Dept Head Pending', color: 'bg-amber-100 text-amber-700' },
      'MD Pending': { label: 'MD Pending', color: 'bg-blue-100 text-blue-700' },
      'HR Pending': { label: 'HR Pending', color: 'bg-amber-100 text-amber-700' },
    };
    
    return statusMap[status] || { label: status, color: 'bg-gray-100 text-gray-700' };
  };

  const config = getStatusConfig(status);
  const sizeClasses = small 
    ? 'px-2 py-0.5 text-[10px] font-medium' 
    : 'px-2.5 py-1 text-xs font-medium';

  return (
    <span className={`inline-flex items-center rounded-full ${config.color} ${sizeClasses} ${className}`}>
      {config.label}
    </span>
  );
}
