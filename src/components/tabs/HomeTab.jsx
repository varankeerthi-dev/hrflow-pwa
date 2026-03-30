import React, { useState, useEffect, useMemo } from 'react'
import { useAuth } from '../../hooks/useAuth'
import { useEmployees } from '../../hooks/useEmployees'
import { db } from '../../lib/firebase'
import { collection, query, where, getDocs } from 'firebase/firestore'
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
  AlertCircle
} from 'lucide-react'
import Spinner from '../ui/Spinner'
import { isEmployeeActiveStatus } from '../../lib/employeeStatus'

export default function HomeTab() {
  const { user } = useAuth()
  const { employees, loading: empLoading } = useEmployees(user?.orgId)
  const [attendanceData, setAttendanceData] = useState({})
  const [leavePending, setLeavePending] = useState(0)

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

  const [selectedCard, setSelectedCard] = useState('manpower')

  const cards = [
    { id: 'manpower', label: 'Manpower', color: 'bg-blue-500' },
    { id: 'attendance', label: 'Attendance', color: 'bg-emerald-500' },
    { id: 'payroll', label: 'Payroll', color: 'bg-amber-500' },
    { id: 'requests', label: 'Requests', color: 'bg-rose-500' }
  ]

  return (
    <div className="p-6 font-inter">
      <div className="flex items-center gap-3 mb-6 overflow-x-auto pb-2">
        {cards.map(card => (
          <button
            key={card.id}
            onClick={() => setSelectedCard(card.id)}
            className={`flex items-center gap-2 px-4 py-2 rounded-full border-2 transition-all shrink-0 ${
              selectedCard === card.id 
                ? 'border-slate-900 bg-white shadow-md' 
                : 'border-transparent bg-slate-100 text-slate-500 hover:bg-slate-200'
            }`}
          >
            <span className={`w-2 h-2 rounded-full ${card.color}`}></span>
            <span className="text-xs font-bold uppercase tracking-wider">{card.label}</span>
          </button>
        ))}
      </div>

      {selectedCard === 'manpower' && <ManpowerCard stats={stats} />}
      {selectedCard === 'attendance' && <AttendanceCard stats={stats} />}
      {selectedCard === 'payroll' && <PayrollCard employees={employees} />}
      {selectedCard === 'requests' && <RequestsCard />}
    </div>
  )
}

function ManpowerCard({ stats }) {
  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden w-[150px] shrink-0">
      <div className="flex">
        <div className="w-1 bg-blue-500"></div>
        <div className="flex-1 p-3">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-xs font-black text-slate-900 uppercase tracking-tight">Manpower</h2>
            <span className="text-[8px] font-bold text-blue-500 uppercase tracking-widest">Live</span>
          </div>
          
          <div className="space-y-2">
            <MetricBox label="Headcount" value={stats.total} icon={<Users size={12} />} />
            <MetricBox label="Present" value={stats.present} icon={<CheckCircle size={12} />} />
            <MetricBox label="Day" value={stats.dayShift} icon={<Sun size={12} />} />
            <MetricBox label="Night" value={stats.nightShift} icon={<Moon size={12} />} />
          </div>

          <div className="mt-2 pt-2 border-t border-slate-100">
            <div className="flex items-center gap-2">
              <div className="w-5 h-5 rounded-full bg-amber-50 flex items-center justify-center">
                <Calendar size={10} className="text-amber-500" />
              </div>
              <div>
                <p className="text-sm font-black text-slate-900">{stats.leave}</p>
                <p className="text-[6px] text-slate-500 font-medium uppercase tracking-wide">On Leave</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function MetricBox({ label, value, icon }) {
  return (
    <div className="bg-slate-50 rounded-lg p-1.5">
      <div className="flex items-center gap-1 mb-0.5">
        <span className="text-slate-400">{icon}</span>
        <span className="text-[6px] font-bold text-slate-400 uppercase tracking-wider">{label}</span>
      </div>
      <p className="text-sm font-black text-slate-900">{value}</p>
    </div>
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
