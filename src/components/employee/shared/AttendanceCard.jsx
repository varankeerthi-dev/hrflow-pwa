import React from 'react';
import { formatTimeTo12Hour } from '../../../lib/salaryUtils';
import StatusBadge from './StatusBadge';

/**
 * AttendanceCard - Displays attendance information for a day
 * @param {Object} props
 * @param {Object} props.record - Attendance record
 * @param {string} props.record.inTime - Check-in time
 * @param {string} props.record.outTime - Check-out time
 * @param {string} props.record.date - Date of attendance
 * @param {string} props.record.status - Attendance status
 * @param {boolean} [props.showDuration] - Whether to show duration
 * @param {number} [props.minDailyHours] - Minimum daily hours for OT calculation
 */
export default function AttendanceCard({
  record,
  showDuration = true,
  minDailyHours = 8
}) {
  if (!record) {
    return (
      <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100">
        <p className="text-sm text-gray-500 text-center py-2">No attendance record</p>
      </div>
    );
  }

  const getStatusLabel = () => {
    if (record.isAbsent) return 'Absent';
    if (record.isOnLeave) return 'On Leave';
    if (record.outTime) return 'Completed';
    if (record.inTime) return 'Checked In';
    return 'Not Checked In';
  };

  const getStatusColor = () => {
    if (record.isAbsent) return 'text-rose-500';
    if (record.isOnLeave) return 'text-blue-500';
    if (record.outTime) return 'text-emerald-500';
    if (record.inTime) return 'text-indigo-500';
    return 'text-gray-500';
  };

  return (
    <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100">
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-semibold text-gray-900">Today's Status</h3>
        <span className={`text-sm font-medium ${getStatusColor()}`}>
          {getStatusLabel()}
        </span>
      </div>
      
      <div className="grid grid-cols-3 gap-4">
        <div className="text-center">
          <p className="text-xs text-gray-500 mb-1">Check In</p>
          <p className="font-semibold text-gray-900">
            {record.inTime ? formatTimeTo12Hour(record.inTime) : '\u2014'}
          </p>
        </div>
        <div className="text-center border-x border-gray-100">
          <p className="text-xs text-gray-500 mb-1">Check Out</p>
          <p className="font-semibold text-gray-900">
            {record.outTime ? formatTimeTo12Hour(record.outTime) : '\u2014'}
          </p>
        </div>
        <div className="text-center">
          <p className="text-xs text-gray-500 mb-1">Duration</p>
          <p className="font-semibold text-gray-900">
            {record.inTime && record.outTime 
              ? formatTimeTo12Hour(record.inTime) + ' - ' + formatTimeTo12Hour(record.outTime)
              : '\u2014'}
          </p>
        </div>
      </div>
    </div>
  );
}
