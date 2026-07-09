import React from 'react';
import { ChevronLeft, Mail, Phone, MapPin, Briefcase, Calendar, Shield, User, FileText, Eye, LogOut } from 'lucide-react';
import { format } from 'date-fns';

/**
 * ProfileView - Employee profile view
 * @param {Object} props
 * @param {Object} props.employee - Employee data
 * @param {Object} props.user - Authenticated user data
 * @param {Function} props.onLogout - Logout handler
 * @param {Function} props.onNavigateBack - Back navigation handler
 */
export default function ProfileView({
  employee,
  user,
  onLogout,
  onNavigateBack
}) {
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
        <h2 className="font-bold text-gray-900">My Profile</h2>
        <div className="w-8" />
      </div>

      {/* Profile Header */}
      <div className="bg-gradient-to-br from-indigo-600 to-purple-700 rounded-2xl p-6 text-white text-center">
        <div className="w-20 h-20 rounded-full bg-white/20 backdrop-blur mx-auto mb-4 flex items-center justify-center text-3xl font-bold">
          {employee?.name?.[0] || user?.name?.[0]}
        </div>
        <h2 className="text-xl font-bold mb-1">{employee?.name || user?.name}</h2>
        <p className="text-indigo-100 text-sm">{employee?.designation || 'Employee'}</p>
        <p className="text-indigo-200 text-xs mt-1">{employee?.department || 'Department'}</p>
      </div>

      {/* Info Cards */}
      <div className="space-y-3">
        <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100">
          <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Personal Information</h3>
          
          <div className="space-y-3">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-blue-50 flex items-center justify-center">
                <Mail size={18} className="text-blue-600" />
              </div>
              <div>
                <p className="text-xs text-gray-500">Email</p>
                <p className="text-sm font-medium text-gray-900">{employee?.email || user?.email}</p>
              </div>
            </div>
            
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-emerald-50 flex items-center justify-center">
                <Phone size={18} className="text-emerald-600" />
              </div>
              <div>
                <p className="text-xs text-gray-500">Phone</p>
                <p className="text-sm font-medium text-gray-900">{employee?.mobile || 'Not provided'}</p>
              </div>
            </div>
            
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-purple-50 flex items-center justify-center">
                <MapPin size={18} className="text-purple-600" />
              </div>
              <div>
                <p className="text-xs text-gray-500">Location</p>
                <p className="text-sm font-medium text-gray-900">{employee?.address || 'Not provided'}</p>
              </div>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100">
          <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Work Information</h3>
          
          <div className="space-y-3">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-amber-50 flex items-center justify-center">
                <Briefcase size={18} className="text-amber-600" />
              </div>
              <div>
                <p className="text-xs text-gray-500">Employee ID</p>
                <p className="text-sm font-medium text-gray-900">{employee?.empCode || employee?.id?.slice(0, 8) || 'N/A'}</p>
              </div>
            </div>
            
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-rose-50 flex items-center justify-center">
                <Calendar size={18} className="text-rose-600" />
              </div>
              <div>
                <p className="text-xs text-gray-500">Joined Date</p>
                <p className="text-sm font-medium text-gray-900">
                  {employee?.joinedDate ? format(new Date(employee.joinedDate), 'MMM d, yyyy') : 'N/A'}
                </p>
              </div>
            </div>
            
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-indigo-50 flex items-center justify-center">
                <Shield size={18} className="text-indigo-600" />
              </div>
              <div>
                <p className="text-xs text-gray-500">Employment Type</p>
                <p className="text-sm font-medium text-gray-900">{employee?.employmentType || 'Full Time'}</p>
              </div>
            </div>
          </div>
        </div>

        {/* Documents */}
        {employee?.documents && employee.documents.length > 0 && (
          <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100">
            <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Documents</h3>
            
            <div className="space-y-2">
              {employee.documents.map((doc, idx) => (
                <div key={idx} className="flex items-center justify-between p-3 bg-gray-50 rounded-xl">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg bg-red-50 flex items-center justify-center">
                      <FileText size={18} className="text-red-600" />
                    </div>
                    <p className="text-sm font-medium text-gray-900">{doc.name}</p>
                  </div>
                  <button className="p-2 text-indigo-600 hover:bg-indigo-50 rounded-lg">
                    <Eye size={18} />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Logout Button */}
      <button 
        onClick={() => {
          if (confirm('Are you sure you want to logout?')) {
            onLogout();
          }
        }}
        className="w-full py-3.5 text-rose-600 font-medium bg-rose-50 rounded-xl flex items-center justify-center gap-2"
      >
        <LogOut size={18} />
        Logout
      </button>
    </div>
  );
}
