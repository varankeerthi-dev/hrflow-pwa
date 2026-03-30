import React, { useState, useEffect, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../hooks/useAuth'
import { useEmployees } from '../../hooks/useEmployees'
import { db } from '../../lib/firebase'
import { collection, query, where, getDocs, orderBy, limit } from 'firebase/firestore'
import {
  Users,
  Calendar,
  Clock, 
  Sun,
  Moon,
  ArrowRight,
  TrendingUp,
  DollarSign,
  CheckCircle,
  Wallet,
  Mail,
  Activity,
  Briefcase,
  FileText,
  RefreshCw
} from 'lucide-react'
import { isEmployeeActiveStatus } from '../../lib/employeeStatus'

export default function HomeTab() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const { employees, loading: empLoading } = useEmployees(user?.orgId)
  const [attendanceData, setAttendanceData] = useState({})
  const [leavePending, setLeavePending] = useState(0)
  const [recentLogs, setRecentLogs] = useState([])
  const [activeTab, setActiveTab] = useState('manpower')

  const today = new Date().toISOString().split('T')[0]

  useEffect(() => {
    async function fetchAttendance() {
      if (!user?.orgId || !employees.length) return
      
      const attQuery = query(
        collection(db, 'organisations', user.orgId, 'attendance'),
        where('date', '==', today)
      )
      const attSnap = await getDocs(attQuery)
      
      const att = {}
      attSnap.forEach(doc => {
        const d = doc.data()
        att[d.employeeId] = d
      })
      setAttendanceData(att)

      const leaveQuery = query(
        collection(db, 'organisations', user.orgId, 'leaveRequests'),
        where('status', '==', 'Pending')
      )
      const leaveSnap = await getDocs(leaveQuery)
      setLeavePending(leaveSnap.size)
    }
    fetchAttendance()
  }, [user?.orgId, employees.length, today])

  useEffect(() => {
    async function fetchLogs() {
      if (!user?.orgId) return
      const logsQuery = query(
        collection(db, 'organisations', user.orgId, 'activityLogs'),
        orderBy('timestamp', 'desc'),
        limit(15)
      )
      const logsSnap = await getDocs(logsQuery)
      setRecentLogs(logsSnap.docs.map(d => ({ id: d.id, ...d.data() })))
    }
    fetchLogs()
  }, [user?.orgId])

  const stats = useMemo(() => {
    if (!employees.length) return { total: 0, present: 0, dayShift: 0, nightShift: 0, leave: 0 }
    
    let present = 0
    let dayShift = 0
    let nightShift = 0
    let leave = 0

    employees.forEach(emp => {
      const att = attendanceData[emp.id]
      if (att) {
        if (!att.isAbsent) {
          present++
          if (att.shiftType === 'Night') nightShift++
          else dayShift++
        }
      }
      if (att?.isLeave) leave++
    })

    return {
      total: employees.length,
      present,
      dayShift,
      nightShift,
      leave: leavePending
    }
  }, [employees, attendanceData, leavePending])

  const tabs = [
    { id: 'manpower', label: 'Manpower', icon: Users, color: 'blue' },
    { id: 'advance', label: 'Adv/Exp', icon: Wallet, color: 'amber' },
    { id: 'leave', label: 'Leave', icon: Calendar, color: 'red' },
    { id: 'tasks', label: 'Task', icon: Briefcase, color: 'purple' }
  ]

  const navigateTo = (tab) => {
    const tabMap = { manpower: 'attendance-list', advance: 'advance', leave: 'leave', tasks: 'tasks' }
    navigate(`/?tab=${tabMap[tab]}`)
  }

  return (
    <div className="p-6 font-inter space-y-6">
      {/* Tab Navigation */}
      <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl w-fit">
        {tabs.map(tab => {
          const Icon = tab.icon
          const isActive = activeTab === tab.id
          return (
            <button
              key={tab.id}
              onClick={() => {
                setActiveTab(tab.id)
                navigateTo(tab.id)
              }}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-lg transition-all duration-200 ${
                isActive 
                  ? 'bg-white shadow-sm text-slate-900' 
                  : 'text-slate-500 hover:bg-white/50 hover:text-slate-700'
              }`}
            >
              <Icon size={16} className={isActive ? `text-${tab.color}-600` : ''} />
              <span className="text-sm font-medium">{tab.label}</span>
            </button>
          )
        })}
      </div>

      {/* Cards Row */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
        {/* Manpower Card - Smaller */}
        <div className="bg-white rounded-xl shadow-sm hover:shadow-md transition-shadow duration-200 overflow-hidden lg:col-span-1">
          <div className="h-1 bg-gradient-to-r from-blue-500 to-blue-600"></div>
          <div className="p-4">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-base font-semibold text-slate-900 tracking-tight">Manpower</h2>
              <div className="flex items-center gap-1.5">
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                </span>
                <span className="text-xs font-semibold text-emerald-600 uppercase tracking-wide">Live</span>
              </div>
            </div>
            
            <div className="grid grid-cols-2 gap-2">
              <StatBox label="Headcount" value={stats.total} icon={Users} color="blue" small />
              <StatBox label="Present" value={stats.present} icon={CheckCircle} color="emerald" small />
              <StatBox label="Day" value={stats.dayShift} icon={Sun} color="amber" small />
              <StatBox label="Night" value={stats.nightShift} icon={Moon} color="indigo" small />
            </div>

            <div className="mt-3 pt-3 border-t border-slate-100">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-amber-50 flex items-center justify-center">
                  <Calendar size={14} className="text-amber-600" />
                </div>
                <div>
                  <p className="text-xl font-bold text-slate-900">{stats.leave}</p>
                  <p className="text-xs text-slate-500 font-medium">On Leave</p>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Advance & Leave Cards - Same Row */}
        <div className="lg:col-span-3 grid grid-cols-1 md:grid-cols-2 gap-4">
          <AdvanceExpenseCard onClick={() => navigateTo('advance')} />
          <LeavePermissionCard onClick={() => navigateTo('leave')} />
        </div>
      </div>

      {/* Recent Updates */}
      <RecentUpdatesCard logs={recentLogs} />

      {/* Team Tasks */}
      <TeamTaskCard onClick={() => navigateTo('tasks')} />
    </div>
  )
}

function StatBox({ label, value, icon: Icon, color, small }) {
  return (
    <div className={`bg-slate-50 rounded-lg hover:bg-slate-100 transition-colors duration-200 group ${small ? 'p-2' : 'rounded-xl p-4'}`}>
      <div className={`flex items-center gap-2 ${small ? 'mb-1' : 'mb-2'}`}>
        <div className={`${small ? 'w-6 h-6' : 'w-8 h-8'} rounded-lg bg-${color}-50 flex items-center justify-center group-hover:scale-110 transition-transform duration-200`}>
          <Icon size={small ? 12 : 16} className={`text-${color}-600`} />
        </div>
        <span className={`font-medium text-slate-500 uppercase tracking-wide ${small ? 'text-[8px]' : 'text-xs'}`}>{label}</span>
      </div>
      <p className={`font-bold text-slate-900 ${small ? 'text-xl' : 'text-3xl'}`}>{value}</p>
    </div>
  )
}

function AdvanceExpenseCard({ onClick }) {
  const [requests, setRequests] = useState([])
  
  useEffect(() => {
    async function fetchPending() {
      const { user } = window
      if (!user?.orgId) return
      const snap = await getDocs(query(
        collection(db, 'organisations', user.orgId, 'advances_expenses'),
        where('status', '==', 'Pending'),
        limit(5)
      ))
      setRequests(snap.docs.map(d => ({ id: d.id, ...d.data() })))
    }
    fetchPending()
  }, [])

  const formatINR = (amount) => {
    return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(amount || 0)
  }

  return (
    <button onClick={onClick} className="bg-white rounded-xl shadow-sm hover:shadow-md transition-all duration-200 overflow-hidden text-left h-full">
      <div className="h-1 bg-gradient-to-r from-amber-500 to-amber-600"></div>
      <div className="p-4">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-semibold text-slate-900 tracking-tight">Advance/Expense</h2>
          <span className="px-2 py-1 bg-amber-50 text-amber-700 text-xs font-semibold uppercase tracking-wide rounded-lg">{requests.length} Pending</span>
        </div>
        
        <div className="space-y-3">
          {requests.length === 0 ? (
            <div className="text-center py-6">
              <div className="w-12 h-12 bg-slate-50 rounded-full flex items-center justify-center mx-auto mb-2">
                <CheckCircle size={20} className="text-slate-300" />
              </div>
              <p className="text-sm text-slate-400">No pending requests</p>
            </div>
          ) : (
            requests.map(req => (
              <div key={req.id} className="flex items-center justify-between p-3 bg-slate-50 rounded-lg hover:bg-slate-100 transition-colors duration-200">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-amber-100 flex items-center justify-center">
                    <Wallet size={14} className="text-amber-700" />
                  </div>
                  <span className="text-sm font-medium text-slate-700 truncate max-w-[160px]">{req.employeeName || req.name || 'Employee'}</span>
                </div>
                <span className="text-sm font-bold text-slate-900 tabular-nums">{formatINR(req.amount)}</span>
              </div>
            ))
          )}
        </div>

        <div className="mt-4 pt-4 border-t border-slate-100 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-amber-100 flex items-center justify-center">
              <Wallet size={14} className="text-amber-700" />
            </div>
            <span className="text-sm text-slate-500 font-medium">Approval</span>
          </div>
          <ArrowRight size={16} className="text-slate-300" />
        </div>
      </div>
    </button>
  )
}

function LeavePermissionCard({ onClick }) {
  const [pending, setPending] = useState({ leave: 0, permission: 0 })
  
  useEffect(() => {
    async function fetchPending() {
      const { user } = window
      if (!user?.orgId) return
      const [leaveSnap, permSnap] = await Promise.all([
        getDocs(query(collection(db, 'organisations', user.orgId, 'leaveRequests'), where('status', '==', 'Pending'))),
        getDocs(query(collection(db, 'organisations', user.orgId, 'permissionRequests'), where('status', '==', 'Pending')))
      ])
      setPending({ leave: leaveSnap.size, permission: permSnap.size })
    }
    fetchPending()
  }, [])

  return (
    <button onClick={onClick} className="bg-white rounded-xl shadow-sm hover:shadow-md transition-all duration-200 overflow-hidden text-left h-full">
      <div className="h-1 bg-gradient-to-r from-red-500 to-red-600"></div>
      <div className="p-4">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-base font-semibold text-slate-900 tracking-tight">Leave/Permission</h2>
          <span className="px-2 py-1 bg-red-50 text-red-700 text-xs font-semibold uppercase tracking-wide rounded-lg">{(pending.leave + pending.permission)} Pending</span>
        </div>
        
        <div className="grid grid-cols-2 gap-4">
          <div className="bg-slate-50 rounded-xl p-4 hover:bg-slate-100 transition-colors duration-200">
            <div className="flex items-center gap-2 mb-2">
              <div className="w-8 h-8 rounded-lg bg-red-100 flex items-center justify-center">
                <Calendar size={16} className="text-red-600" />
              </div>
              <span className="text-xs font-medium text-slate-500 uppercase tracking-wide">Leave</span>
            </div>
            <p className="text-3xl font-bold text-slate-900">{pending.leave}</p>
          </div>
          <div className="bg-slate-50 rounded-xl p-4 hover:bg-slate-100 transition-colors duration-200">
            <div className="flex items-center gap-2 mb-2">
              <div className="w-8 h-8 rounded-lg bg-purple-100 flex items-center justify-center">
                <Clock size={16} className="text-purple-600" />
              </div>
              <span className="text-xs font-medium text-slate-500 uppercase tracking-wide">Permission</span>
            </div>
            <p className="text-3xl font-bold text-slate-900">{pending.permission}</p>
          </div>
        </div>

        <div className="mt-4 pt-4 border-t border-slate-100 flex items-center justify-between">
          <span className="text-sm text-slate-500 font-medium">View Requests</span>
          <ArrowRight size={16} className="text-slate-300" />
        </div>
      </div>
    </button>
  )
}

function RecentUpdatesCard({ logs }) {
  const formatTime = (timestamp) => {
    if (!timestamp?.toDate) return ''
    return timestamp.toDate().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  }

  return (
    <div className="bg-white rounded-xl shadow-sm hover:shadow-md transition-shadow duration-200 overflow-hidden">
      <div className="h-1 bg-gradient-to-r from-indigo-500 to-indigo-600"></div>
      <div className="p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-semibold text-slate-900 tracking-tight">Recent Updates</h2>
          <span className="text-xs font-semibold text-indigo-600 uppercase tracking-wide">{logs.length} Activities</span>
        </div>
        
        <div className="space-y-2 max-h-64 overflow-y-auto">
          {logs.length === 0 ? (
            <div className="text-center py-8">
              <div className="w-12 h-12 bg-slate-50 rounded-full flex items-center justify-center mx-auto mb-2">
                <Activity size={20} className="text-slate-300" />
              </div>
              <p className="text-sm text-slate-400">No recent activities</p>
            </div>
          ) : (
            logs.map(log => (
              <div key={log.id} className="flex items-center gap-3 p-3 bg-slate-50 rounded-lg hover:bg-slate-100 transition-colors duration-200">
                <div className="w-8 h-8 rounded-full bg-indigo-50 flex items-center justify-center shrink-0">
                  <Activity size={14} className="text-indigo-600" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-slate-700 truncate">{log.detail || log.action || 'Activity'}</p>
                  <p className="text-xs text-slate-400">{log.module}</p>
                </div>
                <span className="text-xs text-slate-400 shrink-0 tabular-nums">
                  {formatTime(log.timestamp)}
                </span>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  )
}

function TeamTaskCard({ onClick }) {
  const [tasks, setTasks] = useState({ pending: 0, completed: 0 })
  
  useEffect(() => {
    async function fetchTasks() {
      const { user } = window
      if (!user?.orgId) return
      const [pendingSnap, completedSnap] = await Promise.all([
        getDocs(query(collection(db, 'organisations', user.orgId, 'tasks'), where('status', '!=', 'Completed'))),
        getDocs(query(collection(db, 'organisations', user.orgId, 'tasks'), where('status', '==', 'Completed')))
      ])
      setTasks({ pending: pendingSnap.size, completed: completedSnap.size })
    }
    fetchTasks()
  }, [])

  return (
    <button onClick={onClick} className="bg-white rounded-xl shadow-sm hover:shadow-md transition-all duration-200 overflow-hidden w-full text-left">
      <div className="h-1 bg-gradient-to-r from-purple-500 to-purple-600"></div>
      <div className="p-6">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-base font-semibold text-slate-900 tracking-tight">Team Tasks</h2>
          <ArrowRight size={18} className="text-slate-300" />
        </div>
        
        <div className="grid grid-cols-2 gap-4">
          <div className="bg-purple-50 rounded-xl p-5 hover:bg-purple-100 transition-colors duration-200">
            <p className="text-3xl font-bold text-purple-700">{tasks.pending}</p>
            <p className="text-sm text-purple-600 font-medium mt-1">Pending Tasks</p>
          </div>
          <div className="bg-slate-50 rounded-xl p-5 hover:bg-slate-100 transition-colors duration-200">
            <p className="text-3xl font-bold text-slate-700">{tasks.completed}</p>
            <p className="text-sm text-slate-500 font-medium mt-1">Completed</p>
          </div>
        </div>
      </div>
    </button>
  )
}
