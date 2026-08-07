import React, { useState, useEffect } from 'react'
import { useAuth } from '../../hooks/useAuth'
import { useEmployees } from '../../hooks/useEmployees'
import { db } from '../../lib/firebase'
import { collection, query, where, getDocs, doc, getDoc, updateDoc } from 'firebase/firestore'
import { AlertCircle, CheckCircle2, Search, Calendar, User } from 'lucide-react'

export default function AttendanceDiagnosticTool() {
  const { user } = useAuth()
  const { employees } = useEmployees(user?.orgId)
  
  const [searchName, setSearchName] = useState('')
  const [selectedEmployee, setSelectedEmployee] = useState(null)
  const [attendanceRecords, setAttendanceRecords] = useState([])
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState('')

  // Search for employee by name
  const handleSearch = async () => {
    if (!searchName.trim()) return
    
    setLoading(true)
    setMessage('')
    setSelectedEmployee(null)
    setAttendanceRecords([])
    
    try {
      // Find employee by name (case-insensitive)
      const found = employees.find(emp => 
        emp.name?.toLowerCase().includes(searchName.toLowerCase())
      )
      
      if (!found) {
        setMessage(`Employee "${searchName}" not found`)
        setLoading(false)
        return
      }
      
      setSelectedEmployee(found)
      
      // Fetch all attendance records for this employee
      const orgId = user.orgId
      const attendanceCol = collection(db, 'organisations', orgId, 'attendance')
      const q = query(attendanceCol, where('employeeId', '==', found.id))
      const snapshot = await getDocs(q)
      
      const records = snapshot.docs.map(d => ({
        id: d.id,
        ...d.data()
      }))
      
      // Sort by date
      records.sort((a, b) => a.date.localeCompare(b.date))
      
      setAttendanceRecords(records)
      
      // Check for issues
      const issues = []
      const today = new Date().toISOString().split('T')[0]
      
      if (found.joinedDate) {
        const joinedDate = new Date(found.joinedDate)
        const futureAbsences = records.filter(r => {
          if (!r.isAbsent) return false
          const recordDate = new Date(r.date)
          return recordDate > joinedDate && r.date > today
        })
        
        if (futureAbsences.length > 0) {
          issues.push(`Found ${futureAbsences.length} future dates marked as Absent`)
        }
        
        const pastAbsences = records.filter(r => {
          if (!r.isAbsent) return false
          const recordDate = new Date(r.date)
          return recordDate < joinedDate
        })
        
        if (pastAbsences.length > 0) {
          issues.push(`Found ${pastAbsences.length} dates before joining marked as Absent`)
        }
      }
      
      if (issues.length > 0) {
        setMessage(`⚠️ Issues found:\n${issues.join('\n')}`)
      } else {
        setMessage('✅ No obvious issues found in attendance records')
      }
      
    } catch (err) {
      console.error('Diagnostic error:', err)
      setMessage('Error: ' + err.message)
    } finally {
      setLoading(false)
    }
  }

  // Fix future absences
  const handleFixFutureAbsences = async () => {
    if (!selectedEmployee) return
    
    const today = new Date().toISOString().split('T')[0]
    const futureRecords = attendanceRecords.filter(r => r.isAbsent && r.date > today)
    
    if (futureRecords.length === 0) {
      alert('No future absences found to fix')
      return
    }
    
    if (!window.confirm(`This will remove the "Absent" status from ${futureRecords.length} future date(s). Continue?`)) {
      return
    }
    
    setLoading(true)
    try {
      const orgId = user.orgId
      let fixed = 0
      
      for (const record of futureRecords) {
        const docId = record.id || `${record.date}_${record.employeeId}`
        const attendanceDocRef = doc(db, 'organisations', orgId, 'attendance', docId)
        
        // Delete the record if it has no meaningful data
        if (!record.inTime && !record.checkIn) {
          await getDoc(attendanceDocRef).then(async (docSnap) => {
            if (docSnap.exists()) {
              // Remove the document
              const { deleteDoc } = await import('firebase/firestore')
              await deleteDoc(attendanceDocRef)
              fixed++
            }
          })
        } else {
          // Just clear the absent flag
          await updateDoc(attendanceDocRef, {
            isAbsent: false,
            status: 'Present',
            updatedAt: new Date(),
            updatedBy: user.uid,
            updatedByName: user.name
          })
          fixed++
        }
      }
      
      alert(`Successfully fixed ${fixed} future absence(s)`)
      
      // Refresh the records
      await handleSearch()
      
    } catch (err) {
      console.error('Fix error:', err)
      alert('Error fixing: ' + err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="max-w-4xl mx-auto p-6 space-y-6">
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <h2 className="text-xl font-bold text-gray-900 mb-4 flex items-center gap-2">
          <AlertCircle size={24} className="text-orange-500" />
          Attendance Diagnostic Tool
        </h2>
        
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Search Employee by Name
            </label>
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                <input
                  type="text"
                  value={searchName}
                  onChange={(e) => setSearchName(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                  placeholder="e.g., Amith Basha"
                  className="w-full pl-10 pr-4 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
              <button
                onClick={handleSearch}
                disabled={loading}
                className="px-6 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 font-medium"
              >
                {loading ? 'Searching...' : 'Search'}
              </button>
            </div>
          </div>

          {message && (
            <div className={`p-4 rounded-lg ${message.includes('⚠️') ? 'bg-orange-50 border border-orange-200' : 'bg-green-50 border border-green-200'}`}>
              <pre className="text-sm whitespace-pre-wrap font-mono">{message}</pre>
            </div>
          )}

          {selectedEmployee && (
            <div className="bg-gray-50 rounded-lg p-4 space-y-3">
              <h3 className="font-bold text-gray-900 flex items-center gap-2">
                <User size={18} />
                Employee Details
              </h3>
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <span className="font-medium text-gray-600">Name:</span>
                  <span className="ml-2 text-gray-900">{selectedEmployee.name}</span>
                </div>
                <div>
                  <span className="font-medium text-gray-600">Status:</span>
                  <span className="ml-2 text-gray-900">{selectedEmployee.status}</span>
                </div>
                <div>
                  <span className="font-medium text-gray-600">Joined Date:</span>
                  <span className="ml-2 text-gray-900">{selectedEmployee.joinedDate || 'Not set'}</span>
                </div>
                <div>
                  <span className="font-medium text-gray-600">Inactive From:</span>
                  <span className="ml-2 text-gray-900">{selectedEmployee.inactiveFrom || 'N/A'}</span>
                </div>
              </div>
              
              {selectedEmployee.joinedDate && new Date(selectedEmployee.joinedDate) > new Date() && (
                <div className="bg-red-50 border border-red-200 rounded-lg p-3">
                  <p className="text-red-800 text-sm font-medium">
                    ⚠️ Warning: Joined date is in the FUTURE! This will cause all dates before it to be marked as Absent.
                  </p>
                </div>
              )}
            </div>
          )}

          {attendanceRecords.length > 0 && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="font-bold text-gray-900 flex items-center gap-2">
                  <Calendar size={18} />
                  Attendance Records ({attendanceRecords.length})
                </h3>
                {attendanceRecords.filter(r => r.isAbsent && r.date > new Date().toISOString().split('T')[0]).length > 0 && (
                  <button
                    onClick={handleFixFutureAbsences}
                    className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 text-sm font-medium flex items-center gap-2"
                  >
                    <CheckCircle2 size={16} />
                    Fix Future Absences
                  </button>
                )}
              </div>
              
              <div className="max-h-96 overflow-y-auto border border-gray-200 rounded-lg">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 sticky top-0">
                    <tr>
                      <th className="px-3 py-2 text-left font-medium text-gray-600">Date</th>
                      <th className="px-3 py-2 text-left font-medium text-gray-600">Status</th>
                      <th className="px-3 py-2 text-left font-medium text-gray-600">Absent</th>
                      <th className="px-3 py-2 text-left font-medium text-gray-600">In Time</th>
                      <th className="px-3 py-2 text-left font-medium text-gray-600">Out Time</th>
                      <th className="px-3 py-2 text-left font-medium text-gray-600">Updated By</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {attendanceRecords.map(record => (
                      <tr key={record.id} className={record.isAbsent ? 'bg-red-50' : ''}>
                        <td className="px-3 py-2">{record.date}</td>
                        <td className="px-3 py-2">{record.status || '-'}</td>
                        <td className="px-3 py-2">
                          {record.isAbsent ? (
                            <span className="text-red-600 font-bold">YES</span>
                          ) : (
                            <span className="text-gray-400">No</span>
                          )}
                        </td>
                        <td className="px-3 py-2">{record.inTime || '-'}</td>
                        <td className="px-3 py-2">{record.outTime || '-'}</td>
                        <td className="px-3 py-2 text-xs text-gray-500">
                          {record.updatedByName || record.updatedBy || '-'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
