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
  RefreshCw,
  User,
  Edit3,
  Trash2,
  PlusCircle,
  CheckSquare,
  ClipboardList,
  AlertCircle,
  Bell,
  Building2,
  Car,
  Folder,
  Settings,
  MessageSquare,
  BarChart3,
  Handshake,
  Gavel,
  Gift
} from 'lucide-react'
import { isEmployeeActiveStatus } from '../../lib/employeeStatus'

export default function HomeTab() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const { employees, loading: empLoading } = useEmployees(user?.orgId)
  const [attendanceData, setAttendanceData] = useState({})
  const [leavePending, setLeavePending] = useState(0)
  const [recentLogs, setRecentLogs] = useState([])
  const [pendingApprovals, setPendingApprovals] = useState({
    advanceExpense: 0,
    leave: 0,
    permission: 0,
    total: 0
  })
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

      // Fetch pending leave count
      const leaveQuery = query(
        collection(db, 'organisations', user.orgId, 'requests'),
        where('type', '==', 'Leave'),
        where('status', '==', 'Pending')
      )
      const leaveSnap = await getDocs(leaveQuery)
      setLeavePending(leaveSnap.size)

      // Fetch all pending approvals count
      const [advExpPending, leaveReqPending, permReqPending] = await Promise.all([
        getDocs(query(
          collection(db, 'organisations', user.orgId, 'advances_expenses'),
          where('status', '==', 'Pending')
        )),
        getDocs(query(
          collection(db, 'organisations', user.orgId, 'requests'),
          where('type', '==', 'Leave'),
          where('status', '==', 'Pending')
        )),
        getDocs(query(
          collection(db, 'organisations', user.orgId, 'requests'),
          where('type', '==', 'Permission'),
          where('status', '==', 'Pending')
        ))
      ])

      setPendingApprovals({
        advanceExpense: advExpPending.size,
        leave: leaveReqPending.size,
        permission: permReqPending.size,
        total: advExpPending.size + leaveReqPending.size + permReqPending.size
      })
    }
    fetchAttendance()
  }, [user?.orgId, employees.length, today])

  useEffect(() => {
    async function fetchLogs() {
      if (!user?.orgId) return
      
      // Fetch various recent activities
      const activities = []
      
      // 1. Attendance submissions
      const attQuery = query(
        collection(db, 'organisations', user.orgId, 'activityLogs'),
        where('module', 'in', ['Attendance', 'attendance']),
        orderBy('timestamp', 'desc'),
        limit(5)
      )
      const attSnap = await getDocs(attQuery)
      attSnap.docs.forEach(d => {
        const data = d.data()
        activities.push({
          id: d.id,
          module: 'Attendance',
          userName: data.userName || data.performedBy || 'System',
          action: data.action === 'create' ? 'submitted attendance record' : data.action === 'update' ? 'updated attendance record' : data.detail || 'marked attendance',
          count: data.count || data.recordCount || 1,
          timestamp: data.timestamp,
          icon: ClipboardList,
          color: 'blue'
        })
      })
      
      // 2. Leave requests
      const leaveQuery = query(
        collection(db, 'organisations', user.orgId, 'requests'),
        where('type', '==', 'Leave'),
        orderBy('createdAt', 'desc'),
        limit(5)
      )
      const leaveSnap = await getDocs(leaveQuery)
      leaveSnap.docs.forEach(d => {
        const data = d.data()
        activities.push({
          id: d.id,
          module: 'Leave',
          userName: data.employeeName || 'Employee',
          action: 'created a leave request',
          timestamp: data.createdAt,
          icon: Calendar,
          color: 'red'
        })
      })
      
      // 3. Advance/Expense requests
      const advExpQuery = query(
        collection(db, 'organisations', user.orgId, 'advances_expenses'),
        orderBy('createdAt', 'desc'),
        limit(5)
      )
      const advExpSnap = await getDocs(advExpQuery)
      advExpSnap.docs.forEach(d => {
        const data = d.data()
        activities.push({
          id: d.id,
          module: data.type === 'Expense' ? 'Expense' : 'Advance',
          userName: data.employeeName || 'Employee',
          action: `created a ${data.type?.toLowerCase() || 'advance'} request`,
          amount: data.amount,
          timestamp: data.createdAt,
          icon: Wallet,
          color: 'amber'
        })
      })
      
      // 4. Task activities
      const taskQuery = query(
        collection(db, 'organisations', user.orgId, 'activityLogs'),
        where('module', 'in', ['Tasks', 'tasks']),
        orderBy('timestamp', 'desc'),
        limit(5)
      )
      const taskSnap = await getDocs(taskQuery)
      taskSnap.docs.forEach(d => {
        const data = d.data()
        let actionText = 'updated task'
        let icon = Edit3
        let color = 'purple'
        
        if (data.action === 'create') {
          actionText = 'created a group task'
          icon = PlusCircle
        } else if (data.action === 'delete') {
          actionText = 'deleted a task'
          icon = Trash2
          color = 'red'
        } else if (data.action === 'complete') {
          actionText = 'completed a task'
          icon = CheckSquare
          color = 'green'
        }
        
        activities.push({
          id: d.id,
          module: 'Tasks',
          userName: data.userName || data.performedBy || 'User',
          action: actionText,
          timestamp: data.timestamp,
          icon,
          color
        })
      })
      
      // Sort by timestamp descending and take top 15
      const sorted = activities.sort((a, b) => {
        const timeA = a.timestamp?.toDate ? a.timestamp.toDate() : new Date(0)
        const timeB = b.timestamp?.toDate ? b.timestamp.toDate() : new Date(0)
        return timeB - timeA
      }).slice(0, 15)
      
      setRecentLogs(sorted)
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

  const quickAccessItems = [
    { id: 'attendance', label: 'Attendance', icon: Calendar, color: 'blue', tab: 'attendance-list' },
    { id: 'employees', label: 'Employees', icon: Users, color: 'blue', tab: 'settings' },
    { id: 'salary', label: 'Salary Slip', icon: Wallet, color: 'blue', tab: 'salary-slip' },
    { id: 'advance', label: 'Advance', icon: DollarSign, color: 'blue', tab: 'advance' },
    { id: 'leave', label: 'Leave', icon: Mail, color: 'blue', tab: 'leave' },
    { id: 'tasks', label: 'Tasks', icon: Briefcase, color: 'blue', tab: 'tasks' },
    { id: 'vehicles', label: 'Vehicles', icon: Car, color: 'blue', tab: 'vehicles' },
    { id: 'documents', label: 'Documents', icon: Folder, color: 'blue', tab: 'documents' },
    { id: 'reports', label: 'Reports', icon: BarChart3, color: 'blue', tab: 'summary' },
    { id: 'engagement', label: 'Engagement', icon: Handshake, color: 'blue', tab: 'engage' },
    { id: 'fines', label: 'Fines', icon: Gavel, color: 'blue', tab: 'fines' },
    { id: 'hr-letters', label: 'HR Letters', icon: FileText, color: 'blue', tab: 'letters' }
  ]

  const handleQuickAccess = (tab) => {
    navigate(`/?tab=${tab}`)
  }

  return (
    <div className="p-6 font-inter space-y-6">
      {/* Quick Access Grid */}
      <div className="bg-white rounded-xl shadow-sm p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Quick Access</h2>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-4">
          {quickAccessItems.map(item => {
            const Icon = item.icon
            return (
              <button
                key={item.id}
                onClick={() => handleQuickAccess(item.tab)}
                className="flex flex-col items-center gap-2 p-4 rounded-lg hover:bg-gray-50 transition-colors group"
              >
                <div className={`w-12 h-12 rounded-lg bg-${item.color}-100 flex items-center justify-center group-hover:scale-110 transition-transform duration-200`}>
                  <Icon size={20} className={`text-${item.color}-600`} />
                </div>
                <span className="text-xs font-medium text-gray-700 text-center">{item.label}</span>
              </button>
            )
          })}
        </div>
      </div>

      {/* Statistics Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-gradient-to-br from-blue-50 to-blue-100 rounded-xl shadow-sm p-6 border border-blue-200">
          <div className="flex items-center justify-between mb-4">
            <div className="w-12 h-12 bg-blue-600 rounded-lg flex items-center justify-center">
              <Users size={24} className="text-white" />
            </div>
            <span className="text-sm text-blue-700 font-medium">Total</span>
          </div>
          <p className="text-3xl font-bold text-blue-900">{stats.total}</p>
          <p className="text-sm text-blue-700 mt-1">Total Employees</p>
        </div>

        <div className="bg-gradient-to-br from-green-50 to-green-100 rounded-xl shadow-sm p-6 border border-green-200">
          <div className="flex items-center justify-between mb-4">
            <div className="w-12 h-12 bg-green-600 rounded-lg flex items-center justify-center">
              <CheckCircle size={24} className="text-white" />
            </div>
            <span className="text-sm text-green-700 font-medium">Present</span>
          </div>
          <p className="text-3xl font-bold text-green-900">{stats.present}</p>
          <p className="text-sm text-green-700 mt-1">Present Today</p>
        </div>

        <div className="bg-gradient-to-br from-amber-50 to-amber-100 rounded-xl shadow-sm p-6 border border-amber-200">
          <div className="flex items-center justify-between mb-4">
            <div className="w-12 h-12 bg-amber-600 rounded-lg flex items-center justify-center">
              <Calendar size={24} className="text-white" />
            </div>
            <span className="text-sm text-amber-700 font-medium">Leave</span>
          </div>
          <p className="text-3xl font-bold text-amber-900">{stats.leave}</p>
          <p className="text-sm text-amber-700 mt-1">On Leave</p>
        </div>

        <div className="bg-gradient-to-br from-purple-50 to-purple-100 rounded-xl shadow-sm p-6 border border-purple-200">
          <div className="flex items-center justify-between mb-4">
            <div className="w-12 h-12 bg-purple-600 rounded-lg flex items-center justify-center">
              <Briefcase size={24} className="text-white" />
            </div>
            <span className="text-sm text-purple-700 font-medium">Tasks</span>
          </div>
          <p className="text-3xl font-bold text-purple-900">{pendingApprovals.total}</p>
          <p className="text-sm text-purple-700 mt-1">Pending Approvals</p>
        </div>
      </div>

      {/* Recent Activities */}
      <div className="bg-white rounded-xl shadow-sm p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-gray-900">Recent Activities</h2>
          <span className="text-sm text-gray-500">Last 24 hours</span>
        </div>
        
        <div className="space-y-3">
          {recentLogs.length === 0 ? (
            <div className="text-center py-8">
              <Activity size={32} className="text-gray-300 mx-auto mb-2" />
              <p className="text-sm text-gray-500">No recent activities</p>
            </div>
          ) : (
            recentLogs.slice(0, 5).map(log => (
              <div key={log.id} className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg">
                <div className="w-8 h-8 bg-white rounded-full flex items-center justify-center shadow-sm">
                  {log.icon && <log.icon size={16} className="text-gray-600" />}
                </div>
                <div className="flex-1">
                  <p className="text-sm font-medium text-gray-900">{log.userName}</p>
                  <p className="text-xs text-gray-600">{log.action}</p>
                </div>
                <span className="text-xs text-gray-500">
                  {log.timestamp?.toDate ? new Date(log.timestamp.toDate()).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''}
                </span>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  )
}

