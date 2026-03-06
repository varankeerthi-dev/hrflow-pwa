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
    <div className="max-w-[1300px] mx-auto p-12 lg:p-16 font-inter animate-in fade-in duration-700">
      <header className="mb-16">
        <div className="flex items-center gap-3 mb-4 opacity-50">
          <div className="w-8 h-8 rounded bg-gray-100 flex items-center justify-center">
            <Users size={16} className="text-gray-600" />
          </div>
          <span className="text-[11px] font-bold text-gray-500 uppercase tracking-widest">Workspace / Dashboard</span>
        </div>
        <h1 className="text-5xl font-black text-gray-900 tracking-tight mb-4">Dashboard</h1>
        <div className="flex items-center gap-3 text-gray-400 font-medium text-[11px] tracking-tight bg-gray-50 w-fit px-3 py-1.5 rounded-md border border-gray-100">
          <Calendar size={13} strokeWidth={2.5} />
          <span>{new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</span>
        </div>
      </header>

      <div className="grid grid-cols-12 gap-12">
        {/* Left Sidebar Sections - Notion Style "Database" View */}
        <div className="col-span-12 lg:col-span-3 space-y-12">
          <section className="bg-white/50 rounded-xl">
            <div className="flex items-center gap-2 mb-6 group cursor-default">
              <div className="w-1 h-4 bg-indigo-500 rounded-full opacity-0 group-hover:opacity-100 transition-all" />
              <h2 className="text-[12px] font-black uppercase tracking-[0.2em] text-gray-900">Attendance Database</h2>
            </div>
            
            <div className="space-y-8">
              {/* Category Helper */}
              {[
                { label: 'Present', color: 'bg-emerald-500', list: stats.present, id: 'present' },
                { label: 'Absent', color: 'bg-rose-500', list: stats.absent, id: 'absent' },
                { label: 'Leave', color: 'bg-amber-500', list: stats.leave, id: 'leave' },
                { label: 'NightShift', color: 'bg-indigo-500', list: stats.nightShift, id: 'night' }
              ].map(cat => (
                <div key={cat.id} className="group/cat">
                  <div className="flex items-center justify-between mb-3 border-b border-gray-50 pb-2">
                    <div className="flex items-center gap-2">
                      <div className={`w-2 h-2 rounded-full ${cat.color}`} />
                      <span className="text-[11px] font-bold text-gray-400 uppercase tracking-widest">{cat.label}</span>
                    </div>
                    <span className="text-[10px] font-black text-gray-300 group-hover/cat:text-gray-900 transition-colors">{cat.list.length}</span>
                  </div>
                  <div className="space-y-0.5 min-h-[40px]">
                    {cat.list.map(emp => (
                      <div key={emp.id} className="group relative flex items-center justify-between text-[13px] font-medium text-gray-600 py-2 px-2 hover:bg-gray-50 rounded-md transition-all cursor-default">
                        <span className="truncate">{emp.name}</span>
                        <div className="opacity-0 group-hover:opacity-100 transition-opacity flex gap-1">
                           <div className="w-1 h-1 bg-gray-200 rounded-full" />
                           <div className="w-1 h-1 bg-gray-200 rounded-full" />
                        </div>
                      </div>
                    ))}
                    {cat.list.length === 0 && (
                      <div className="flex items-center gap-2 px-2 py-2 text-[11px] text-gray-300 italic">
                        <span>No entries</span>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </section>
        </div>

        {/* Right Content Area - Blank Workspace */}
        <div className="col-span-12 lg:col-span-9">
          <div className="h-full border-l border-gray-100 min-h-[600px] pl-16 flex flex-col justify-center">
            <div className="max-w-md">
              <div className="w-16 h-1 px-1 bg-gray-100 mb-8 rounded-full" />
              <h3 className="text-2xl font-bold text-gray-200 mb-4 italic tracking-tight">Focus on your workflow.</h3>
              <p className="text-gray-300 text-sm leading-relaxed max-w-xs">
                This area is currently blank to provide a distraction-free environment for administrative tasks.
              </p>
              
              <div className="mt-16 grid grid-cols-2 gap-4 opacity-10 grayscale pointer-events-none">
                 <div className="aspect-video bg-gray-50 border-2 border-dashed border-gray-200 rounded-2xl flex items-center justify-center">
                    <div className="w-8 h-8 rounded-full border-2 border-gray-200" />
                 </div>
                 <div className="aspect-video bg-gray-50 border-2 border-dashed border-gray-200 rounded-2xl flex items-center justify-center">
                    <div className="w-8 h-2 bg-gray-200 rounded-full" />
                 </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
