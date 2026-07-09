import React from 'react';
import { Calendar, FileText, Plus, LayoutDashboard, User, Wallet, Play, Square, CheckCircle2 } from 'lucide-react';
import { formatTimeTo12Hour } from '../../../lib/salaryUtils';
import StatsCard from '../shared/StatsCard';
import AttendanceCard from '../shared/AttendanceCard';
import RequestCard from '../shared/RequestCard';
import StatusBadge from '../shared/StatusBadge';

/**
 * DashboardView - Employee portal dashboard view
 * @param {Object} props
 * @param {Object} props.employee - Employee data
 * @param {Object} props.user - Authenticated user data
 * @param {Array} props.requests - Employee requests
 * @param {Object} props.todayRecord - Today's attendance record
 * @param {Object} props.latestTodayLog - Latest attendance log for today
 * @param {string} props.todayInTime - Today's check-in time
 * @param {string} props.todayOutTime - Today's check-out time
 * @param {Object} props.todayBadge - Today's attendance badge
 * @param {Object} props.geoContext - Geo location context
 * @param {boolean} props.validInLog - Whether there's a valid check-in log
 * @param {boolean} props.validOutLog - Whether there's a valid check-out log
 * @param {Function} props.onCheckIn - Check-in handler
 * @param {Function} props.onCheckOut - Check-out handler
 * @param {Function} props.onWithdrawRequest - Withdraw request handler
 * @param {Function} props.onNavigate - Navigation handler
 */
export default function DashboardView({
  employee,
  user,
  requests,
  todayRecord,
  latestTodayLog,
  todayInTime,
  todayOutTime,
  todayBadge,
  geoContext,
  validInLog,
  validOutLog,
  onCheckIn,
  onCheckOut,
  onWithdrawRequest,
  onNavigate
}) {
  const dashboardRecord = todayRecord || {
    inTime: todayInTime || '',
    outTime: todayOutTime || '',
    date: new Date().toISOString().split('T')[0],
    outDate: new Date().toISOString().split('T')[0],
    minDailyHours: employee?.minDailyHours || 8,
  };

  const getStatusLabel = () => {
    if (!todayRecord && !latestTodayLog) return 'Not Checked In';
    if (todayRecord?.isAbsent) return 'Absent';
    if (todayRecord?.isOnLeave) return 'On Leave';
    if (validOutLog || todayRecord?.outTime) return 'Check-out Submitted';
    if (validInLog || todayRecord?.inTime) return 'Check-in Submitted';
    return 'Not Checked In';
  };

  const getStatusColor = () => {
    if (!todayRecord && !latestTodayLog) return 'text-gray-500';
    if (todayRecord?.isAbsent) return 'text-rose-500';
    if (todayRecord?.isOnLeave) return 'text-blue-500';
    return 'text-indigo-600';
  };

  return (
    <div className="space-y-4">
      {/* Welcome Card */}
      <div className="bg-gradient-to-br from-indigo-600 to-purple-700 rounded-2xl p-5 text-white shadow-lg">
        <div className="flex items-center justify-between mb-4">
          <div>
            <p className="text-indigo-100 text-xs font-medium mb-1">Welcome back,</p>
            <h2 className="text-xl font-bold">{employee?.name?.split(' ')[0] || user?.name?.split(' ')[0]}</h2>
          </div>
          <div className="w-12 h-12 rounded-full bg-white/20 backdrop-blur flex items-center justify-center text-xl font-bold">
            {employee?.name?.[0] || user?.name?.[0]}
          </div>
        </div>
        
        {/* Quick Actions */}
        <div className="flex gap-2">
          {!(validInLog || todayRecord?.inTime) ? (
            <button
              onClick={onCheckIn}
              className="flex-1 bg-white text-indigo-600 py-3 rounded-xl font-semibold text-sm flex items-center justify-center gap-2 shadow-lg"
            >
              <Play size={16} fill="currentColor" /> Check In
            </button>
          ) : !(validOutLog || todayRecord?.outTime) ? (
            <button
              onClick={onCheckOut}
              className="flex-1 bg-white text-rose-600 py-3 rounded-xl font-semibold text-sm flex items-center justify-center gap-2 shadow-lg"
            >
              <Square size={14} fill="currentColor" /> Check Out
            </button>
          ) : (
            <div className="flex-1 bg-white/20 backdrop-blur py-3 rounded-xl font-semibold text-sm flex items-center justify-center gap-2">
              <CheckCircle2 size={16} /> Shift Complete
            </div>
          )}
        </div>
        {geoContext.distanceMeters != null && (
          <p className="text-indigo-100 text-xs mt-3">
            You are <span className="font-bold">{geoContext.distanceMeters}m</span> from {geoContext.targetSite?.siteName || employee?.site || 'assigned site'}.
          </p>
        )}
        {geoContext.locationError && (
          <p className="text-rose-100 text-xs mt-2">{geoContext.locationError}</p>
        )}
      </div>

      {/* Today's Status */}
      <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-semibold text-gray-900">Today's Status</h3>
          <span className={`text-sm font-medium ${getStatusColor()}`}>
            {getStatusLabel()}
          </span>
        </div>
        
        {(todayRecord || latestTodayLog) ? (
          <div className="grid grid-cols-3 gap-4">
            <div className="text-center">
              <p className="text-xs text-gray-500 mb-1">Check In</p>
              {todayBadge && (
                <span className={`inline-flex mb-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wide ${todayBadge.className}`}>
                  {todayBadge.label}
                </span>
              )}
              <p className="font-semibold text-gray-900">
                {dashboardRecord.inTime ? formatTimeTo12Hour(dashboardRecord.inTime) : '\u2014'}
              </p>
            </div>
            <div className="text-center border-x border-gray-100">
              <p className="text-xs text-gray-500 mb-1">Check Out</p>
              <p className="font-semibold text-gray-900">
                {dashboardRecord.outTime ? formatTimeTo12Hour(dashboardRecord.outTime) : '\u2014'}
              </p>
            </div>
            <div className="text-center">
              <p className="text-xs text-gray-500 mb-1">Duration</p>
              <p className="font-semibold text-gray-900">
                {dashboardRecord.inTime && dashboardRecord.outTime 
                  ? 'Calculating...' // TODO: Add duration calculation
                  : '\u2014'}
              </p>
            </div>
          </div>
        ) : (
          <p className="text-sm text-gray-500 text-center py-2">No attendance record for today yet.</p>
        )}
      </div>

      {/* Quick Stats */}
      <div className="grid grid-cols-2 gap-3">
        <StatsCard
          title="Leave Balance"
          value={employee?.leaveBalance?.Casual || employee?.leaveBalance?.Annual || 0}
          subtitle="Days available"
          icon={<Calendar size={16} className="text-blue-600" />}
          iconColor="bg-blue-50"
        />
        
        <StatsCard
          title="Requests"
          value={requests.length}
          subtitle="Recent"
          icon={<FileText size={16} className="text-emerald-600" />}
          iconColor="bg-emerald-50"
        />
      </div>

      {/* Recent Requests */}
      <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-semibold text-gray-900">Recent Requests</h3>
          <button 
            onClick={() => onNavigate('requests')}
            className="text-xs text-indigo-600 font-medium"
          >
            View All
          </button>
        </div>
        
        {requests.length === 0 ? (
          <p className="text-sm text-gray-400 text-center py-4">No recent requests</p>
        ) : (
          <div className="space-y-2">
            {requests.slice(0, 5).map(req => (
              <RequestCard
                key={req.id}
                request={req}
                onWithdraw={onWithdrawRequest}
                showActions={true}
              />
            ))}
          </div>
        )}
      </div>

      {/* Quick Actions Grid */}
      <div className="grid grid-cols-2 gap-3">
        <button 
          onClick={() => onNavigate('attendance')}
          className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100 text-left"
        >
          <div className="w-10 h-10 rounded-xl bg-indigo-50 flex items-center justify-center mb-3">
            <Calendar size={20} className="text-indigo-600" />
          </div>
          <p className="font-semibold text-gray-900 text-sm">Attendance</p>
          <p className="text-xs text-gray-500 mt-1">View monthly records</p>
        </button>
        
        <button 
          onClick={() => onNavigate('requests', { showRequestModal: true })}
          className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100 text-left"
        >
          <div className="w-10 h-10 rounded-xl bg-rose-50 flex items-center justify-center mb-3">
            <Plus size={20} className="text-rose-600" />
          </div>
          <p className="font-semibold text-gray-900 text-sm">Apply Leave</p>
          <p className="text-xs text-gray-500 mt-1">Submit request</p>
        </button>
        
        <button 
          onClick={() => onNavigate('salary')}
          className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100 text-left"
        >
          <div className="w-10 h-10 rounded-xl bg-emerald-50 flex items-center justify-center mb-3">
            <Wallet size={20} className="text-emerald-600" />
          </div>
          <p className="font-semibold text-gray-900 text-sm">Salary Slip</p>
          <p className="text-xs text-gray-500 mt-1">Download payslip</p>
        </button>
        
        <button 
          onClick={() => onNavigate('profile')}
          className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100 text-left"
        >
          <div className="w-10 h-10 rounded-xl bg-purple-50 flex items-center justify-center mb-3">
            <User size={20} className="text-purple-600" />
          </div>
          <p className="font-semibold text-gray-900 text-sm">My Profile</p>
          <p className="text-xs text-gray-500 mt-1">View details</p>
        </button>
      </div>
    </div>
  );
}
