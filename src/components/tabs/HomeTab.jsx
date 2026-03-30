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
  Briefcase,
  FileText,
  CheckCircle,
  XCircle,
  AlertCircle,
  Wallet,
  Mail,
  Bell,
  Activity
} from 'lucide-react'
import Spinner from '../ui/Spinner'
import { isEmployeeActiveStatus } from '../../lib/employeeStatus'

export default function HomeTab() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const { employees, loading: empLoading } = useEmployees(user?.orgId)
  const [attendanceData, setAttendanceData] = useState({})
  const [leavePending, setLeavePending] = useState(0)
  const [recentLogs, setRecentLogs] = useState([])

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
        limit(20)
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

  const cards = [
    { id: 'manpower', label: 'Manpower', color: 'bg-blue-500', tab: 'attendance-list' },
    { id: 'advance', label: 'Adv/Exp', color: 'bg-amber-500', tab: 'advance' },
    { id: 'leave', label: 'Leave', color: 'bg-rose-500', tab: 'leave' },
    { id: 'tasks', label: 'Task', color: 'bg-purple-500', tab: 'tasks' }
  ]

  const textStyle = { fontFamily: 'sans-serif', fontSize: '13px' }

  return (
    <div className="p-6 font-inter space-y-4">
      <div className="flex items-center gap-3 overflow-x-auto pb-2">
        {cards.map(card => (
          <button
            key={card.id}
            onClick={() => {
              navigate(`/?tab=${card.tab}`)
            }}
            className={`flex items-center gap-2 px-4 py-2 rounded-full border-2 transition-all shrink-0 ${
              card.id === 'tasks' 
                ? 'border-purple-500 bg-purple-50 text-purple-700 hover:bg-purple-100' 
                : card.id === 'advance'
                ? 'border-amber-500 bg-amber-50 text-amber-700 hover:bg-amber-100'
                : card.id === 'leave'
                ? 'border-rose-500 bg-rose-50 text-rose-700 hover:bg-rose-100'
                : 'border-blue-500 bg-blue-50 text-blue-700 hover:bg-blue-100'
            }`}
          >
            <span className={`w-2 h-2 rounded-full ${card.color}`}></span>
            <span className="text-xs font-bold uppercase tracking-wider">{card.label}</span>
          </button>
        ))}
      </div>

      <div className="flex gap-4 flex-wrap">
        <ManpowerCard stats={stats} onClick={() => navigate('/?tab=attendance-list')} />
        <AdvanceExpenseCard onClick={() => navigate('/?tab=advance')} />
        <LeavePermissionCard onClick={() => navigate('/?tab=leave')} />
      </div>

      <RecentUpdatesCard logs={recentLogs} />
      <TeamTaskCard onClick={() => navigate('/?tab=tasks')} />
    </div>
  )
}

function ManpowerCard({ stats, onClick }) {
  const headerStyle = { fontFamily: 'Raleway, sans-serif', fontSize: '15px' }
  const textStyle = { fontFamily: 'sans-serif', fontSize: '13px' }
  
  return (
    <button onClick={onClick} className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden w-[400px] shrink-0 hover:shadow-md transition-all text-left">
      <div className="flex">
        <div className="w-1 bg-blue-500"></div>
        <div className="flex-1 p-4">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-black text-slate-900 uppercase" style={headerStyle}>Manpower</h2>
            <span className="text-xs font-bold text-blue-500 uppercase tracking-widest">Live</span>
          </div>
          
          <div className="grid grid-cols-2 gap-3">
            <MetricBox label="Headcount" value={stats.total} icon={<Users size={14} />} />
            <MetricBox label="Present" value={stats.present} icon={<CheckCircle size={14} />} />
            <MetricBox label="Day Shift" value={stats.dayShift} icon={<Sun size={14} />} />
            <MetricBox label="Night Shift" value={stats.nightShift} icon={<Moon size={14} />} />
          </div>

          <div className="mt-3 pt-3 border-t border-slate-100">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-full bg-amber-50 flex items-center justify-center">
                <Calendar size={14} className="text-amber-500" />
              </div>
              <div>
                <p className="font-black text-slate-900" style={textStyle}>{stats.leave}</p>
                <p className="text-[10px] text-slate-500 font-medium uppercase tracking-wide">On Leave</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </button>
  )
}

function MetricBox({ label, value, icon }) {
  const textStyle = { fontFamily: 'sans-serif', fontSize: '13px' }
  return (
    <div className="bg-slate-50 rounded-xl p-3">
      <div className="flex items-center gap-2 mb-1">
        <span className="text-slate-400">{icon}</span>
        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">{label}</span>
      </div>
      <p className="font-black text-slate-900" style={textStyle}>{value}</p>
    </div>
  )
}

function AdvanceExpenseCard({ onClick }) {
  const [requests, setRequests] = useState([])
  const headerStyle = { fontFamily: 'Raleway, sans-serif', fontSize: '15px' }
  const textStyle = { fontFamily: 'sans-serif', fontSize: '13px' }
  
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
    <button onClick={onClick} className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden w-[400px] shrink-0 hover:shadow-md transition-all text-left">
      <div className="flex">
        <div className="w-1 bg-amber-500"></div>
        <div className="flex-1 p-4">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-black text-slate-900 uppercase" style={headerStyle}>Advance/Expense</h2>
            <span className="text-xs font-bold text-amber-500 uppercase tracking-widest">Pending</span>
          </div>
          
          <div className="space-y-2">
            {requests.length === 0 ? (
              <p className="text-slate-400 text-center py-2" style={textStyle}>No pending requests</p>
            ) : (
              requests.map(req => (
                <div key={req.id} className="flex items-center justify-between p-2 bg-slate-50 rounded-lg">
                  <div className="flex items-center gap-2">
                    <div className="w-6 h-6 rounded bg-amber-100 flex items-center justify-center">
                      <Wallet size={12} className="text-amber-600" />
                    </div>
                    <span className="text-slate-700 font-medium truncate max-w-[150px]" style={textStyle}>{req.employeeName || req.name || 'Employee'}</span>
                  </div>
                  <span className="font-bold text-slate-900" style={textStyle}>{formatINR(req.amount)}</span>
                </div>
              ))
            )}
          </div>

          <div className="mt-3 pt-3 border-t border-slate-100">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-full bg-amber-50 flex items-center justify-center">
                <Wallet size={14} className="text-amber-500" />
              </div>
              <div>
                <p className="font-black text-slate-900" style={textStyle}>{requests.length}</p>
                <p className="text-[10px] text-slate-500 font-medium uppercase tracking-wide">Pending Approval</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </button>
  )
}

function LeavePermissionCard({ onClick }) {
  const [pending, setPending] = useState({ leave: 0, permission: 0 })
  const headerStyle = { fontFamily: 'Raleway, sans-serif', fontSize: '15px' }
  const textStyle = { fontFamily: 'sans-serif', fontSize: '13px' }
  
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
    <button onClick={onClick} className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden w-[400px] shrink-0 hover:shadow-md transition-all text-left">
      <div className="flex">
        <div className="w-1 bg-rose-500"></div>
        <div className="flex-1 p-4">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-black text-slate-900 uppercase" style={headerStyle}>Leave/Permission</h2>
            <span className="text-xs font-bold text-rose-500 uppercase tracking-widest">Pending</span>
          </div>
          
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-slate-50 rounded-xl p-3">
              <div className="flex items-center gap-2 mb-1">
                <Calendar size={14} className="text-rose-500" />
                <span className="text-[10px] font-bold text-slate-400 uppercase">Leave</span>
              </div>
              <p className="font-black text-slate-900" style={textStyle}>{pending.leave}</p>
            </div>
            <div className="bg-slate-50 rounded-xl p-3">
              <div className="flex items-center gap-2 mb-1">
                <Clock size={14} className="text-rose-500" />
                <span className="text-[10px] font-bold text-slate-400 uppercase">Permission</span>
              </div>
              <p className="font-black text-slate-900" style={textStyle}>{pending.permission}</p>
            </div>
          </div>
        </div>
      </div>
    </button>
  )
}

function RecentUpdatesCard({ logs }) {
  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
      <div className="flex">
        <div className="w-1 bg-indigo-500"></div>
        <div className="flex-1 p-4">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-black text-slate-900 uppercase tracking-tight">Recent Updates</h2>
            <span className="text-[8px] font-bold text-indigo-500 uppercase tracking-widest">{logs.length} Activities</span>
          </div>
          
          <div className="space-y-2 max-h-48 overflow-y-auto">
            {logs.length === 0 ? (
              <p className="text-[10px] text-slate-400 text-center py-4">No recent activities</p>
            ) : (
              logs.slice(0, 10).map(log => (
                <div key={log.id} className="flex items-center gap-3 p-2 bg-slate-50 rounded-lg">
                  <div className="w-6 h-6 rounded-full bg-indigo-50 flex items-center justify-center shrink-0">
                    <Activity size={10} className="text-indigo-500" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[9px] font-bold text-slate-700 truncate">{log.detail || log.action || 'Activity'}</p>
                    <p className="text-[7px] text-slate-400">{log.module}</p>
                  </div>
                  <span className="text-[7px] text-slate-400 shrink-0">
                    {log.timestamp?.toDate ? log.timestamp.toDate().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''}
                  </span>
                </div>
              ))
            )}
          </div>
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
    <button onClick={onClick} className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden w-full hover:shadow-md transition-all">
      <div className="flex">
        <div className="w-1 bg-purple-500"></div>
        <div className="flex-1 p-4">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-black text-slate-900 uppercase tracking-tight">Team Tasks</h2>
            <ArrowRight size={14} className="text-slate-400" />
          </div>
          
          <div className="grid grid-cols-2 gap-4">
            <div className="bg-purple-50 rounded-xl p-3 text-center">
              <p className="text-xl font-black text-purple-700">{tasks.pending}</p>
              <p className="text-[8px] text-purple-600 font-bold uppercase">Pending</p>
            </div>
            <div className="bg-slate-50 rounded-xl p-3 text-center">
              <p className="text-xl font-black text-slate-700">{tasks.completed}</p>
              <p className="text-[8px] text-slate-500 font-bold uppercase">Completed</p>
            </div>
          </div>
        </div>
      </div>
    </button>
  )
}

function AttendanceCard({ stats }) {
  const attendanceRate = stats.total > 0 ? Math.round((stats.present / stats.total) * 100) : 0
  
  return (
    <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
      <div className="flex">
        <div className="w-1 bg-emerald-500"></div>
        <div className="flex-1 p-6">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-lg font-black text-slate-900 uppercase tracking-tight">Attendance</h2>
            <span className="text-xs font-bold text-emerald-500 uppercase tracking-widest">Today</span>
          </div>
          
          <div className="flex items-center gap-12">
            <div className="relative w-32 h-32">
              <svg className="w-32 h-32 transform -rotate-90">
                <circle cx="64" cy="64" r="56" stroke="#f1f5f9" strokeWidth="12" fill="none" />
                <circle cx="64" cy="64" r="56" stroke="#10b981" strokeWidth="12" fill="none" 
                  strokeDasharray={351.86} strokeDashoffset={351.86 - (351.86 * attendanceRate / 100)} 
                  strokeLinecap="round" />
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <p className="text-2xl font-black text-slate-900">{attendanceRate}%</p>
                <p className="text-[8px] text-slate-400 font-bold uppercase">Rate</p>
              </div>
            </div>
            
            <div className="flex-1 grid grid-cols-2 gap-4">
              <div className="bg-emerald-50 rounded-xl p-4">
                <p className="text-[9px] font-bold text-emerald-600 uppercase tracking-wider mb-1">Present</p>
                <p className="text-xl font-black text-emerald-700">{stats.present}</p>
              </div>
              <div className="bg-slate-50 rounded-xl p-4">
                <p className="text-[9px] font-bold text-slate-500 uppercase tracking-wider mb-1">Absent</p>
                <p className="text-xl font-black text-slate-700">{stats.total - stats.present}</p>
              </div>
              <div className="bg-amber-50 rounded-xl p-4">
                <p className="text-[9px] font-bold text-amber-600 uppercase tracking-wider mb-1">On Leave</p>
                <p className="text-xl font-black text-amber-700">{stats.leave}</p>
              </div>
              <div className="bg-blue-50 rounded-xl p-4">
                <p className="text-[9px] font-bold text-blue-600 uppercase tracking-wider mb-1">Total</p>
                <p className="text-xl font-black text-blue-700">{stats.total}</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function PayrollCard({ employees }) {
  const totalSalary = employees.reduce((sum, emp) => sum + (Number(emp.totalSalary) || 0), 0)
  
  return (
    <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
      <div className="flex">
        <div className="w-1 bg-amber-500"></div>
        <div className="flex-1 p-6">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-lg font-black text-slate-900 uppercase tracking-tight">Payroll</h2>
            <span className="text-xs font-bold text-amber-500 uppercase tracking-widest">Overview</span>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="bg-slate-50 rounded-2xl p-5">
              <div className="flex items-center gap-2 mb-3">
                <DollarSign size={16} className="text-amber-500" />
                <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">Monthly CTC</span>
              </div>
              <p className="text-2xl font-black text-slate-900">Rs. {(totalSalary / 100000).toFixed(1)}L</p>
            </div>
            
            <div className="bg-slate-50 rounded-2xl p-5">
              <div className="flex items-center gap-2 mb-3">
                <Users size={16} className="text-amber-500" />
                <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">Employees</span>
              </div>
              <p className="text-2xl font-black text-slate-900">{employees.length}</p>
            </div>
            
            <div className="bg-slate-50 rounded-2xl p-5">
              <div className="flex items-center gap-2 mb-3">
                <TrendingUp size={16} className="text-amber-500" />
                <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">Avg Salary</span>
              </div>
              <p className="text-2xl font-black text-slate-900">Rs. {employees.length ? Math.round(totalSalary / employees.length).toLocaleString() : 0}</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function RequestsCard() {
  const [requests, setRequests] = useState({ leave: 0, advance: 0, correction: 0 })
  
  useEffect(() => {
    async function fetchRequests() {
      const { user } = window
      if (!user?.orgId) return
      
      const [leaveSnap, advanceSnap, correctionSnap] = await Promise.all([
        getDocs(query(collection(db, 'organisations', user.orgId, 'leaveRequests'), where('status', '==', 'Pending'))),
        getDocs(query(collection(db, 'organisations', user.orgId, 'advances_expenses'), where('status', '==', 'Pending'))),
        getDocs(query(collection(db, 'organisations', user.orgId, 'attendanceCorrections'), where('status', '==', 'Pending')))
      ])
      
      setRequests({
        leave: leaveSnap.size,
        advance: advanceSnap.size,
        correction: correctionSnap.size
      })
    }
    fetchRequests()
  }, [])

  const totalPending = requests.leave + requests.advance + requests.correction
  
  return (
    <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
      <div className="flex">
        <div className="w-1 bg-rose-500"></div>
        <div className="flex-1 p-6">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-lg font-black text-slate-900 uppercase tracking-tight">Requests</h2>
            <span className="text-xs font-bold text-rose-500 uppercase tracking-widest">{totalPending} Pending</span>
          </div>
          
          <div className="space-y-4">
            <RequestRow type="Leave Requests" count={requests.leave} icon={<Calendar size={18} />} color="bg-blue-50 text-blue-600" />
            <RequestRow type="Advance/Expense" count={requests.advance} icon={<DollarSign size={18} />} color="bg-amber-50 text-amber-600" />
            <RequestRow type="Attendance Corrections" count={requests.correction} icon={<FileText size={18} />} color="bg-purple-50 text-purple-600" />
          </div>
        </div>
      </div>
    </div>
  )
}

function RequestRow({ type, count, icon, color }) {
  return (
    <div className="flex items-center justify-between p-4 bg-slate-50 rounded-xl">
      <div className="flex items-center gap-3">
        <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${color}`}>
          {icon}
        </div>
        <span className="text-xs font-bold text-slate-600 uppercase tracking-wide">{type}</span>
      </div>
      <div className="flex items-center gap-2">
        <span className="text-lg font-black text-slate-900">{count}</span>
        <ArrowRight size={14} className="text-slate-300" />
      </div>
    </div>
  )
}
