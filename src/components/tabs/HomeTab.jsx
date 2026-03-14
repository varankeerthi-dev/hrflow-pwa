import React, { useState, useEffect, useMemo } from 'react'
import { useAuth } from '../../hooks/useAuth'
import { useEmployees } from '../../hooks/useEmployees'
import { useAttendance } from '../../hooks/useAttendance'
import { useRecruitment } from '../../hooks/useRecruitment'
import { useDocuments } from '../../hooks/useDocuments'
import { 
  Calendar, 
  Users, 
  Moon, 
  LogOut, 
  CheckCircle2, 
  XCircle, 
  Clock, 
  Briefcase, 
  Folder, 
  Plus, 
  ChevronRight,
  TrendingUp,
  Target,
  FileText,
  Upload,
  Clock3
} from 'lucide-react'
import Spinner from '../ui/Spinner'

export default function HomeTab() {
  const { user } = useAuth()
  const { employees, loading: empLoading } = useEmployees(user?.orgId)
  const { fetchByDate, loading: attLoading } = useAttendance(user?.orgId)
  const { jobs, applicants, loading: recLoading } = useRecruitment(user?.orgId, user)
  const { documents, loading: docLoading } = useDocuments(user?.orgId, user)
  
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
      if (emp.shift?.name?.toLowerCase().includes('night')) nightShift.push(emp)

      if (record) {
        if (record.isAbsent) absent.push(emp)
        else if (record.status === 'Leave') leave.push(emp)
        else present.push(emp)
      }
    })

    return { 
      present, 
      absent, 
      leave, 
      nightShift, 
      totalActive: active.length,
      openJobs: jobs.filter(j => j.status === 'Open').length,
      newApplicants: applicants.filter(a => a.status === 'New').length,
      totalDocs: documents.length
    }
  }, [employees, todayRecords, jobs, applicants, documents])

  if (empLoading || attLoading || recLoading || docLoading) return <div className="flex h-full items-center justify-center py-20"><Spinner /></div>

  return (
    <div className="p-4 md:p-8 font-inter animate-in fade-in slide-in-from-bottom-2 duration-700 space-y-8">
      {/* Header Section */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-gray-900 tracking-tight uppercase">Control Center</h1>
          <p className="text-[10px] font-bold text-indigo-500 uppercase tracking-[0.2em] mt-1">Operational Overview • {new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}</p>
        </div>
        <div className="flex items-center gap-2 bg-white p-1 rounded-xl shadow-sm border border-gray-100">
          <div className="px-4 py-2 text-center border-r border-gray-50">
            <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest leading-none mb-1">Health Score</p>
            <p className="text-sm font-black text-emerald-600">98.2%</p>
          </div>
          <div className="px-4 py-2 text-center">
            <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest leading-none mb-1">Efficiency</p>
            <p className="text-sm font-black text-indigo-600">High</p>
          </div>
        </div>
      </div>

      {/* Main Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {/* Attendance Card */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 relative overflow-hidden group">
          <div className="absolute top-0 right-0 p-4 opacity-5 group-hover:scale-110 transition-transform">
            <Calendar size={80} className="text-indigo-900" />
          </div>
          <div className="flex items-center gap-2 mb-6">
            <div className="w-8 h-8 rounded-lg bg-indigo-50 flex items-center justify-center">
              <Calendar size={16} className="text-indigo-600" />
            </div>
            <span className="text-[11px] font-black text-gray-400 uppercase tracking-widest">Attendance</span>
          </div>
          <div className="space-y-3 relative z-10">
            {[
              { label: 'Present', color: 'bg-emerald-500', count: stats.present.length, id: 'present' },
              { label: 'Absent', color: 'bg-rose-500', count: stats.absent.length, id: 'absent' },
              { label: 'On Leave', color: 'bg-amber-500', count: stats.leave.length, id: 'leave' }
            ].map(cat => (
              <div key={cat.id} className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className={`w-2 h-2 rounded-full ${cat.color} shadow-sm`} />
                  <span className="text-[12px] font-bold text-gray-600">{cat.label}</span>
                </div>
                <span className="text-[13px] font-black text-gray-900">{cat.count}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Workforce Stats */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 relative overflow-hidden group">
          <div className="absolute top-0 right-0 p-4 opacity-5 group-hover:scale-110 transition-transform">
            <Users size={80} className="text-indigo-900" />
          </div>
          <div className="flex items-center gap-2 mb-6">
            <div className="w-8 h-8 rounded-lg bg-indigo-50 flex items-center justify-center">
              <Users size={16} className="text-indigo-600" />
            </div>
            <span className="text-[11px] font-black text-gray-400 uppercase tracking-widest">Workforce</span>
          </div>
          <div className="flex flex-col justify-between h-[100px]">
            <div>
              <p className="text-3xl font-black text-gray-900">{stats.totalActive}</p>
              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mt-1">Active Personnel</p>
            </div>
            <div className="flex items-center gap-2 text-emerald-600 text-[11px] font-bold">
              <TrendingUp size={14} /> +2 Since last month
            </div>
          </div>
        </div>

        {/* Recruitment Stats */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 relative overflow-hidden group">
          <div className="absolute top-0 right-0 p-4 opacity-5 group-hover:scale-110 transition-transform">
            <Briefcase size={80} className="text-indigo-900" />
          </div>
          <div className="flex items-center gap-2 mb-6">
            <div className="w-8 h-8 rounded-lg bg-indigo-50 flex items-center justify-center">
              <Briefcase size={16} className="text-indigo-600" />
            </div>
            <span className="text-[11px] font-black text-gray-400 uppercase tracking-widest">Hiring</span>
          </div>
          <div className="space-y-4 relative z-10">
            <div className="flex items-end justify-between">
              <div>
                <p className="text-2xl font-black text-gray-900">{stats.openJobs}</p>
                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Open Positions</p>
              </div>
              <div className="text-right">
                <p className="text-2xl font-black text-indigo-600">{stats.newApplicants}</p>
                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">New Applicants</p>
              </div>
            </div>
          </div>
        </div>

        {/* Documentation Stats */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 relative overflow-hidden group">
          <div className="absolute top-0 right-0 p-4 opacity-5 group-hover:scale-110 transition-transform">
            <Folder size={80} className="text-indigo-900" />
          </div>
          <div className="flex items-center gap-2 mb-6">
            <div className="w-8 h-8 rounded-lg bg-indigo-50 flex items-center justify-center">
              <Folder size={16} className="text-indigo-600" />
            </div>
            <span className="text-[11px] font-black text-gray-400 uppercase tracking-widest">Documentation</span>
          </div>
          <div className="flex flex-col justify-between h-[100px]">
            <div>
              <p className="text-3xl font-black text-gray-900">{stats.totalDocs}</p>
              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mt-1">Repository Items</p>
            </div>
            <div className="flex items-center gap-2 text-indigo-500 text-[11px] font-bold">
              <ShieldCheck size={14} className="text-indigo-500" /> System Protected
            </div>
          </div>
        </div>
      </div>

      {/* Quick Actions & Recent Activity */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 space-y-6">
          <h3 className="text-sm font-black text-gray-900 uppercase tracking-widest flex items-center gap-2">
            <Target size={18} className="text-indigo-600" /> Administrative Hub
          </h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[
              { label: 'New Hire', icon: <Plus size={20} />, color: 'bg-indigo-600 text-white' },
              { label: 'Post Job', icon: <Briefcase size={20} />, color: 'bg-gray-900 text-white' },
              { label: 'Upload File', icon: <Upload size={20} />, color: 'bg-white text-gray-900 border border-gray-200' },
              { label: 'Issue Letter', icon: <FileText size={20} />, color: 'bg-white text-gray-900 border border-gray-200' }
            ].map(action => (
              <button key={action.label} className={`h-[100px] rounded-2xl flex flex-col items-center justify-center gap-3 transition-all hover:scale-[1.02] active:scale-[0.98] shadow-sm ${action.color}`}>
                {action.icon}
                <span className="text-[11px] font-black uppercase tracking-widest">{action.label}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="bg-gray-50/50 rounded-2xl border border-dashed border-gray-200 p-6 flex flex-col items-center justify-center text-center">
          <div className="w-12 h-12 bg-white rounded-xl shadow-sm flex items-center justify-center mb-4">
            <Clock3 size={20} className="text-gray-300" />
          </div>
          <p className="text-[11px] font-bold text-gray-400 uppercase tracking-widest mb-1">Upcoming Events</p>
          <p className="text-[13px] font-medium text-gray-500">No organizational events scheduled for the next 48 hours.</p>
        </div>
      </div>
    </div>
  )
}

function ShieldCheck({ size, className }) {
  return (
    <svg 
      xmlns="http://www.w3.org/2000/svg" 
      width={size} 
      height={size} 
      viewBox="0 0 24 24" 
      fill="none" 
      stroke="currentColor" 
      strokeWidth="2" 
      strokeLinecap="round" 
      strokeLinejoin="round" 
      className={className}
    >
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10" />
      <path d="m9 12 2 2 4-4" />
    </svg>
  )
}

