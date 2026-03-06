import { useState, useEffect, useMemo } from 'react'
import { useAuth } from '../../hooks/useAuth'
import { useEmployees } from '../../hooks/useEmployees'
import { useAttendance } from '../../hooks/useAttendance'
import { Calendar, Users, Moon, LogOut, CheckCircle2, XCircle, Clock } from 'lucide-react'
import Spinner from '../ui/Spinner'

export default function HomeTab() {
  const { user } = useAuth()
  const { employees, loading: empLoading } = useEmployees(user?.orgId)
  const { fetchByDate, loading: attLoading } = useAttendance(user?.orgId)
  const [todayRecords, setTodayRecords] = useState([])
  
  const today = new Date().toISOString().split('T')[0]

  useEffect(() => {
    if (!user?.orgId) return
    fetchByDate(today).then(setTodayRecords)
  }, [user?.orgId, today])

  const stats = useMemo(() => {
    const active = employees.filter(e => e.status === 'Active')
    const present = []
    const absent = []
    const leave = []
    const nightShift = []

    active.forEach(emp => {
      const record = todayRecords.find(r => r.employeeId === emp.id)
      
      // Check for Night Shift if defined in employee shift
      if (emp.shift?.name?.toLowerCase().includes('night')) {
        nightShift.push(emp)
      }

      if (record) {
        if (record.isAbsent) {
          absent.push(emp)
        } else if (record.status === 'Leave') {
          leave.push(emp)
        } else {
          present.push(emp)
        }
      } else {
        // No record yet, could be pending or absent by default?
        // Let's assume not marked = pending/potential absent for now
        // But the user specifically asked for these sections
      }
    })

    return { present, absent, leave, nightShift, totalActive: active.length }
  }, [employees, todayRecords])

  if (empLoading || attLoading) return <div className="flex h-full items-center justify-center"><Spinner /></div>

  return (
    <div className="p-4 font-inter animate-in fade-in duration-500">
      <div className="bg-white rounded-lg border border-gray-100 shadow-sm p-4 max-w-xs">
        <div className="flex items-center gap-2 mb-3">
          <div className="w-6 h-6 rounded bg-indigo-50 flex items-center justify-center">
            <Users size={14} className="text-indigo-600" />
          </div>
          <span className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">Today</span>
        </div>
        
        <div className="space-y-2">
          {[
            { label: 'Present', color: 'bg-emerald-500', count: stats.present.length, id: 'present' },
            { label: 'Absent', color: 'bg-rose-500', count: stats.absent.length, id: 'absent' },
            { label: 'Leave', color: 'bg-amber-500', count: stats.leave.length, id: 'leave' },
            { label: 'Night', color: 'bg-indigo-500', count: stats.nightShift.length, id: 'night' }
          ].map(cat => (
            <div key={cat.id} className="flex items-center justify-between py-1.5 px-2 rounded hover:bg-gray-50">
              <div className="flex items-center gap-2">
                <div className={`w-2 h-2 rounded-full ${cat.color}`} />
                <span className="text-[11px] font-medium text-gray-600">{cat.label}</span>
              </div>
              <span className="text-[11px] font-bold text-gray-800">{cat.count}</span>
            </div>
          ))}
        </div>
        
        <div className="mt-3 pt-2 border-t border-gray-50">
          <div className="text-[10px] text-gray-400 text-center">
            {new Date().toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
          </div>
        </div>
      </div>
    </div>
  )
}
