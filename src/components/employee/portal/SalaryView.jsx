import React from 'react';
import { ChevronLeft, FileText, Wallet } from 'lucide-react';

/**
 * SalaryView - Employee salary slip view
 * @param {Object} props
 * @param {Object} props.employee - Employee data
 * @param {Function} props.onNavigateBack - Back navigation handler
 */
export default function SalaryView({
  employee,
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
        <h2 className="font-bold text-gray-900">Salary Slip</h2>
        <div className="w-8" />
      </div>

      <div className="bg-gradient-to-br from-emerald-500 to-teal-600 rounded-2xl p-6 text-white">
        <p className="text-emerald-100 text-sm mb-1">Monthly Salary</p>
        <h3 className="text-3xl font-bold">\u20b9{employee?.salary?.toLocaleString() || '0'}</h3>
        <p className="text-emerald-100 text-sm mt-2">Gross Pay</p>
      </div>

      <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100">
        <h3 className="font-semibold text-gray-900 mb-4">Download Payslip</h3>
        
        <div className="space-y-2">
          {[
            { month: 'December 2024', status: 'ready' },
            { month: 'November 2024', status: 'ready' },
            { month: 'October 2024', status: 'ready' }
          ].map((item, idx) => (
            <div key={idx} className="flex items-center justify-between p-3 bg-gray-50 rounded-xl">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-emerald-50 flex items-center justify-center">
                  <FileText size={18} className="text-emerald-600" />
                </div>
                <p className="font-medium text-gray-900">{item.month}</p>
              </div>
              <button className="px-4 py-2 bg-emerald-600 text-white text-sm font-medium rounded-lg">
                Download
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
