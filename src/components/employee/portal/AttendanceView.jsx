import React from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { format } from 'date-fns';

/**
 * AttendanceView - Employee attendance calendar view
 * @param {Object} props
 * @param {Array} props.attendanceRows - Array of attendance records for the month
 * @param {string} props.month - Current month in YYYY-MM format
 * @param {Function} props.onSetMonth - Handler to change month
 * @param {Function} props.onNavigateBack - Back navigation handler
 */
export default function AttendanceView({
  attendanceRows,
  month,
  onSetMonth,
  onNavigateBack
}) {
  const navigateToPreviousMonth = () => {
    const [y, m] = month.split('-').map(Number);
    const d = new Date(y, m - 2, 1);
    onSetMonth(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
  };

  const navigateToNextMonth = () => {
    const [y, m] = month.split('-').map(Number);
    const d = new Date(y, m, 1);
    onSetMonth(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
  };

  const getStatusColor = (record) => {
    if (!record) return 'bg-gray-100';
    if (record.isAbsent) return 'bg-rose-100';
    if (record.isOnLeave) return 'bg-blue-100';
    if (record.holidayWorked) return 'bg-purple-100';
    if (record.sundayWorked) return 'bg-amber-100';
    if (record.outTime) return 'bg-emerald-100';
    if (record.inTime) return 'bg-indigo-100';
    return 'bg-gray-100';
  };

  const todayDateKey = new Date().toISOString().split('T')[0];

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
        <h2 className="font-bold text-gray-900">Attendance</h2>
        <div className="w-8" />
      </div>

      {/* Month Selector */}
      <div className="flex items-center justify-between bg-white rounded-xl p-3 shadow-sm border border-gray-100">
        <button
          onClick={navigateToPreviousMonth}
          className="p-2 hover:bg-gray-100 rounded-lg"
        >
          <ChevronLeft size={20} className="text-gray-600" />
        </button>
        <span className="font-semibold text-gray-900">
          {format(new Date(month), 'MMMM yyyy')}
        </span>
        <button
          onClick={navigateToNextMonth}
          className="p-2 hover:bg-gray-100 rounded-lg"
        >
          <ChevronRight size={20} className="text-gray-600" />
        </button>
      </div>

      {/* Calendar Grid */}
      <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100">
        <div className="grid grid-cols-7 gap-1 mb-2">
          {['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'].map(day => (
            <div key={day} className="text-center text-xs font-medium text-gray-400 py-1">
              {day}
            </div>
          ))}
        </div>
        
        <div className="grid grid-cols-7 gap-1">
          {attendanceRows.map(({ date, record }) => {
            const dayNum = parseInt(date.split('-')[2]);
            const isToday = date === todayDateKey;
            const statusColor = getStatusColor(record);
            
            return (
              <div key={date} className="aspect-square">
                <div className={`w-full h-full rounded-lg flex flex-col items-center justify-center text-xs ${statusColor} ${isToday ? 'ring-2 ring-indigo-500' : ''}`}>
                  <span className={`font-medium ${isToday ? 'text-indigo-600' : 'text-gray-700'}`}>
                    {dayNum}
                  </span>
                  {record?.inTime && (
                    <span className="text-[8px] text-gray-500 mt-0.5">
                      {record.inTime.slice(0, 5)}
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Legend */}
      <div className="flex flex-wrap gap-3 px-1">
        {[
          { color: 'bg-emerald-100', label: 'Complete' },
          { color: 'bg-indigo-100', label: 'Checked In' },
          { color: 'bg-blue-100', label: 'Leave' },
          { color: 'bg-rose-100', label: 'Absent' },
          { color: 'bg-gray-100', label: 'No Record' }
        ].map(item => (
          <div key={item.label} className="flex items-center gap-1.5">
            <div className={`w-3 h-3 rounded ${item.color}`} />
            <span className="text-xs text-gray-600">{item.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
