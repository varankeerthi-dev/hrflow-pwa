import { useState } from 'react'
import { useAuth } from '../../hooks/useAuth'
import { useEmployees } from '../../hooks/useEmployees'
import { useCorrections } from '../../hooks/useCorrections'
import Spinner from '../ui/Spinner'
import Modal from '../ui/Modal'

export default function CorrectionTab() {
  const { user } = useAuth()
  const { employees } = useEmployees(user?.orgId)
  const { corrections, loading, submitCorrection, updateCorrectionStatus } = useCorrections(user?.orgId)
  
  const [showModal, setShowModal] = useState(false)
  const [form, setForm] = useState({
    employeeId: '',
    date: '',
    fieldName: 'In Time',
    oldValue: '',
    newValue: '',
    reason: '',
  })

  const fields = ['In Time', 'Out Time', 'In Date', 'Out Date', 'OT', 'Remarks']

  const handleSubmit = async () => {
    const emp = employees.find(e => e.id === form.employeeId)
    await submitCorrection({
      ...form,
      employeeName: emp?.name,
    }, user.uid)
    setShowModal(false)
    setForm({ employeeId: '', date: '', fieldName: 'In Time', oldValue: '', newValue: '', reason: '' })
  }

  const handleApprove = async (corrId) => {
    await updateCorrectionStatus(corrId, 'Approved', user.uid)
  }

  const handleReject = async (corrId) => {
    await updateCorrectionStatus(corrId, 'Rejected', user.uid)
  }

  const isAdmin = user?.role === 'admin'

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-xl font-bold text-gray-800">Attendance Corrections</h2>
        <button 
          onClick={() => setShowModal(true)}
          className="bg-gradient-to-r from-indigo-500 to-purple-500 text-white font-semibold px-4 py-2 rounded-lg shadow"
        >
          + New Correction
        </button>
      </div>

      {/* Table */}
      <div className="flex-1 overflow-auto bg-white rounded-xl shadow">
        <table className="w-full">
          <thead className="bg-gray-50 sticky top-0">
            <tr>
              {['Employee', 'Date', 'Field', 'Old Value', 'New Value', 'Reason', 'Status', 'Actions'].map(h => (
                <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-widest">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {loading ? (
              <tr><td colSpan={8} className="text-center py-8"><Spinner /></td></tr>
            ) : corrections.length === 0 ? (
              <tr><td colSpan={8} className="text-center py-8 text-gray-400">No corrections yet</td></tr>
            ) : corrections.map(corr => (
              <tr key={corr.id} className="hover:bg-gray-50">
                <td className="px-4 py-3 font-medium text-gray-800">{corr.employeeName}</td>
                <td className="px-4 py-3 text-gray-600">{corr.date}</td>
                <td className="px-4 py-3 text-gray-600">{corr.fieldName}</td>
                <td className="px-4 py-3 text-red-500 line-through">{corr.oldValue}</td>
                <td className="px-4 py-3 text-green-600 font-bold">{corr.newValue}</td>
                <td className="px-4 py-3 text-gray-600 max-w-xs truncate">{corr.reason}</td>
                <td className="px-4 py-3">
                  <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                    corr.status === 'Pending' ? 'bg-yellow-100 text-yellow-700' :
                    corr.status === 'Approved' ? 'bg-green-100 text-green-700' :
                    'bg-red-100 text-red-700'
                  }`}>
                    {corr.status}
                  </span>
                </td>
                <td className="px-4 py-3">
                  {isAdmin && corr.status === 'Pending' && (
                    <div className="flex gap-2">
                      <button onClick={() => handleApprove(corr.id)} className="text-green-600 hover:bg-green-50 p-1 rounded">
                        ✓
                      </button>
                      <button onClick={() => handleReject(corr.id)} className="text-red-600 hover:bg-red-50 p-1 rounded">
                        ✕
                      </button>
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Modal */}
      <Modal isOpen={showModal} onClose={() => setShowModal(false)} title="New Correction">
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Employee</label>
            <select 
              value={form.employeeId}
              onChange={e => setForm(f => ({ ...f, employeeId: e.target.value }))}
              className="w-full border rounded-lg px-3 py-2"
            >
              <option value="">Select employee</option>
              {employees.map(emp => (
                <option key={emp.id} value={emp.id}>{emp.name} ({emp.empCode})</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Date</label>
            <input 
              type="date" 
              value={form.date}
              onChange={e => setForm(f => ({ ...f, date: e.target.value }))}
              className="w-full border rounded-lg px-3 py-2"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Field</label>
            <select 
              value={form.fieldName}
              onChange={e => setForm(f => ({ ...f, fieldName: e.target.value }))}
              className="w-full border rounded-lg px-3 py-2"
            >
              {fields.map(f => <option key={f} value={f}>{f}</option>)}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Old Value</label>
              <input 
                type="text" 
                value={form.oldValue}
                onChange={e => setForm(f => ({ ...f, oldValue: e.target.value }))}
                className="w-full border rounded-lg px-3 py-2"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">New Value</label>
              <input 
                type="text" 
                value={form.newValue}
                onChange={e => setForm(f => ({ ...f, newValue: e.target.value }))}
                className="w-full border rounded-lg px-3 py-2"
              />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Reason</label>
            <textarea 
              value={form.reason}
              onChange={e => setForm(f => ({ ...f, reason: e.target.value }))}
              rows={3}
              className="w-full border rounded-lg px-3 py-2"
            />
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <button onClick={() => setShowModal(false)} className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg">Cancel</button>
            <button onClick={handleSubmit} className="px-4 py-2 bg-indigo-500 text-white rounded-lg hover:bg-indigo-600">Submit</button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
