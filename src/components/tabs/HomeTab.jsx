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
  Clock3,
  BarChart3,
  PieChart,
  Activity,
  Zap
} from 'lucide-react'
import Spinner from '../ui/Spinner'

export default function HomeTab() {
  const { user } = useAuth()
  const { employees, loading: empLoading } = useEmployees(user?.orgId)
  const { fetchByDate, loading: attLoading } = useAttendance(user?.orgId)
  const { jobs, applicants, loading: recLoading } = useRecruitment(user?.orgId, user)
  const { documents, loading: docLoading } = useDocuments(user?.orgId, user)
  
  const [activeSubTab, setActiveSubTab] = useState('home')
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

  const subTabs = [
    { id: 'home', label: 'Home', icon: <Activity size={16} /> },
    { id: 'analytics', label: 'Analytics', icon: <BarChart3 size={16} /> },
    { id: 'reports', label: 'Reports', icon: <FileText size={16} /> },
    { id: 'overview', label: 'Overview', icon: <PieChart size={16} /> },
  ]

  const renderHomeSubTab = () => (
    <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4 animate-in fade-in slide-in-from-bottom-4 duration-500">
      {/* Attendance Square */}
      <div className="aspect-square bg-white border border-gray-200 rounded-none shadow-sm p-4 flex flex-col justify-between hover:border-indigo-500 transition-all group">
        <div className="flex items-center justify-between">
          <div className="w-8 h-8 rounded-none bg-indigo-50 flex items-center justify-center group-hover:bg-indigo-600 group-hover:text-white transition-colors">
            <Calendar size={16} />
          </div>
          <span className="text-[10px] font-bold text-emerald-500">+12%</span>
        </div>
        <div>
          <p className="text-2xl font-black text-gray-900 leading-none">{stats.present.length}</p>
          <p className="text-[9px] font-bold text-gray-400 uppercase tracking-widest mt-1">Present Today</p>
        </div>
      </div>

      {/* Workforce Square */}
      <div className="aspect-square bg-white border border-gray-200 rounded-none shadow-sm p-4 flex flex-col justify-between hover:border-indigo-500 transition-all group">
        <div className="flex items-center justify-between">
          <div className="w-8 h-8 rounded-none bg-blue-50 flex items-center justify-center group-hover:bg-blue-600 group-hover:text-white transition-colors">
            <Users size={16} />
          </div>
          <Zap size={14} className="text-amber-500" />
        </div>
        <div>
          <p className="text-2xl font-black text-gray-900 leading-none">{stats.totalActive}</p>
          <p className="text-[9px] font-bold text-gray-400 uppercase tracking-widest mt-1">Total Team</p>
        </div>
      </div>

      {/* Recruitment Square */}
      <div className="aspect-square bg-white border border-gray-200 rounded-none shadow-sm p-4 flex flex-col justify-between hover:border-indigo-500 transition-all group">
        <div className="flex items-center justify-between">
          <div className="w-8 h-8 rounded-none bg-purple-50 flex items-center justify-center group-hover:bg-purple-600 group-hover:text-white transition-colors">
            <Briefcase size={16} />
          </div>
          <span className="text-[10px] font-bold text-indigo-500">OPEN</span>
        </div>
        <div>
          <p className="text-2xl font-black text-gray-900 leading-none">{stats.openJobs}</p>
          <p className="text-[9px] font-bold text-gray-400 uppercase tracking-widest mt-1">Active Jobs</p>
        </div>
      </div>

      {/* Applicants Square */}
      <div className="aspect-square bg-white border border-gray-200 rounded-none shadow-sm p-4 flex flex-col justify-between hover:border-indigo-500 transition-all group">
        <div className="flex items-center justify-between">
          <div className="w-8 h-8 rounded-none bg-rose-50 flex items-center justify-center group-hover:bg-rose-600 group-hover:text-white transition-colors">
            <Users size={16} />
          </div>
          <div className="w-2 h-2 rounded-full bg-rose-500 animate-pulse" />
        </div>
        <div>
          <p className="text-2xl font-black text-gray-900 leading-none">{stats.newApplicants}</p>
          <p className="text-[9px] font-bold text-gray-400 uppercase tracking-widest mt-1">New Hires</p>
        </div>
      </div>

      {/* Documents Square */}
      <div className="aspect-square bg-white border border-gray-200 rounded-none shadow-sm p-4 flex flex-col justify-between hover:border-indigo-500 transition-all group">
        <div className="flex items-center justify-between">
          <div className="w-8 h-8 rounded-none bg-amber-50 flex items-center justify-center group-hover:bg-amber-600 group-hover:text-white transition-colors">
            <Folder size={16} />
          </div>
        </div>
        <div>
          <p className="text-2xl font-black text-gray-900 leading-none">{stats.totalDocs}</p>
          <p className="text-[9px] font-bold text-gray-400 uppercase tracking-widest mt-1">Docs Stored</p>
        </div>
      </div>

      {/* Efficiency Square */}
      <div className="aspect-square bg-indigo-600 border border-indigo-700 rounded-none shadow-md p-4 flex flex-col justify-between hover:bg-indigo-700 transition-all">
        <div className="flex items-center justify-between">
          <div className="w-8 h-8 rounded-none bg-white/20 flex items-center justify-center text-white">
            <Zap size={16} />
          </div>
        </div>
        <div>
          <p className="text-2xl font-black text-white leading-none">94%</p>
          <p className="text-[9px] font-bold text-white/70 uppercase tracking-widest mt-1">Efficiency</p>
        </div>
      </div>

      {/* Add New Square */}
      <button className="aspect-square bg-gray-50 border border-dashed border-gray-300 rounded-none p-4 flex flex-col items-center justify-center gap-2 hover:bg-gray-100 hover:border-gray-400 transition-all group">
        <Plus size={24} className="text-gray-400 group-hover:text-gray-600 group-hover:scale-110 transition-all" />
        <span className="text-[9px] font-black text-gray-400 uppercase tracking-widest">Custom Card</span>
      </button>
    </div>
  )

  return (
    <div className="p-6 font-inter space-y-6">
      {/* Sub-tab Navigation */}
      <div className="flex items-center gap-1 bg-gray-100 p-1 rounded-none w-fit border border-gray-200">
        {subTabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveSubTab(tab.id)}
            className={`flex items-center gap-2 px-4 py-2 text-[10px] font-black uppercase tracking-widest transition-all ${
              activeSubTab === tab.id 
                ? 'bg-white text-indigo-600 shadow-sm' 
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            {tab.icon}
            {tab.label}
          </button>
        ))}
      </div>

      {/* Content Area */}
      <div className="mt-8">
        {activeSubTab === 'home' ? renderHomeSubTab() : (
          <div className="flex flex-col items-center justify-center py-20 text-center border border-dashed border-gray-200 rounded-none bg-gray-50/50">
            <div className="w-12 h-12 bg-white rounded-none border border-gray-200 flex items-center justify-center mb-4 text-gray-300">
              {subTabs.find(t => t.id === activeSubTab)?.icon}
            </div>
            <p className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em]">Module Initialization</p>
            <p className="text-sm text-gray-500 mt-1 italic font-medium">This submodule is currently being configured for your organization.</p>
          </div>
        )}
      </div>
    </div>
  )
}

