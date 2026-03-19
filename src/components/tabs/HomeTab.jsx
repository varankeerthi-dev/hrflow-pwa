import React, { useState, useEffect } from 'react'
import { useAuth } from '../../hooks/useAuth'
import { useEmployees } from '../../hooks/useEmployees'
import { db } from '../../lib/firebase'
import { collection, query, where, getDocs, doc, setDoc, serverTimestamp } from 'firebase/firestore'
import { 
  Users, 
  Calendar, 
  Clock, 
  AlertCircle, 
  CheckCircle2, 
  TrendingUp, 
  ArrowRight,
  ShieldAlert,
  Zap
} from 'lucide-react'
import Spinner from '../ui/Spinner'

export default function HomeTab() {
  const { user } = useAuth()
  const { employees, loading: empLoading } = useEmployees(user?.orgId)
  const [stats, setStats] = useState({
    total: 0,
    active: 0,
    present: 0,
    pendingLeave: 0
  })
  const [repairing, setRepairing] = useState(false)

  useEffect(() => {
    if (!employees) return
    const today = new Date().toISOString().split('T')[0]
    setStats({
      total: employees.length,
      active: employees.filter(e => e.status === 'Active').length,
      present: 0, // Would need attendance fetch
      pendingLeave: 0
    })
  }, [employees])

  const repairAdminAccess = async () => {
    if (!user?.uid || !user?.orgId) return
    setRepairing(true)
    try {
      // Force role to admin in the users collection
      await setDoc(doc(db, 'users', user.uid), {
        role: 'admin',
        orgId: user.orgId,
        updatedAt: serverTimestamp()
      }, { merge: true })
      
      alert('Admin role restored in database! Please refresh the page to apply changes.')
      window.location.reload()
    } catch (err) {
      console.error('Repair failed:', err)
      alert('Repair failed: ' + err.message)
    } finally {
      setRepairing(false)
    }
  }

  return (
    <div className="p-6 space-y-8 font-inter max-w-7xl mx-auto">
      {/* Emergency Access Recovery - Only shown if permissions might be broken */}
      <div className="bg-amber-50 border border-amber-200 rounded-2xl p-6 flex flex-col md:flex-row items-center justify-between gap-4 shadow-sm">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 bg-amber-100 rounded-xl flex items-center justify-center text-amber-600">
            <ShieldAlert size={24} />
          </div>
          <div>
            <h3 className="text-sm font-black text-amber-900 uppercase tracking-tight">Access Recovery Terminal</h3>
            <p className="text-xs text-amber-700 font-medium">Click this if you encounter "Insufficient Permissions" errors while you are the owner.</p>
          </div>
        </div>
        <button 
          onClick={repairAdminAccess}
          disabled={repairing}
          className="h-11 px-8 bg-amber-600 text-white font-black rounded-xl text-[11px] uppercase tracking-widest hover:bg-amber-700 transition-all shadow-lg shadow-amber-200 disabled:opacity-50 flex items-center gap-2"
        >
          {repairing ? <Spinner /> : <Zap size={16} fill="currentColor" />} Force Admin Access
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <StatCard label="Total Headcount" value={stats.total} icon={<Users className="text-indigo-500" />} color="bg-indigo-50" />
        <StatCard label="Active Status" value={stats.active} icon={<CheckCircle2 className="text-emerald-500" />} color="bg-emerald-50" />
        <StatCard label="Present Today" value={stats.present} icon={<Clock className="text-blue-500" />} color="bg-blue-50" />
        <StatCard label="Pending Requests" value={stats.pendingLeave} icon={<AlertCircle className="text-amber-500" />} color="bg-amber-50" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 space-y-6">
          <div className="bg-white rounded-3xl border border-gray-100 p-8 shadow-sm">
            <div className="flex items-center justify-between mb-8">
              <h3 className="text-lg font-black text-gray-900 uppercase tracking-tight">Organization Pulse</h3>
              <button className="text-[11px] font-black text-indigo-600 uppercase tracking-widest hover:underline">View Analytics</button>
            </div>
            <div className="h-64 bg-gray-50 rounded-2xl flex items-center justify-center border border-dashed border-gray-200">
              <p className="text-xs text-gray-400 font-bold uppercase tracking-widest">Attendance Trend Placeholder</p>
            </div>
          </div>
        </div>

        <div className="space-y-6">
          <div className="bg-indigo-600 rounded-3xl p-8 text-white shadow-xl shadow-indigo-200">
            <h3 className="text-sm font-black uppercase tracking-[0.2em] mb-6 opacity-80">Quick Actions</h3>
            <div className="space-y-3">
              <ActionLink label="Run Payroll" />
              <ActionLink label="Approve Leaves" />
              <ActionLink label="Configure Shifts" />
              <ActionLink label="Update Policies" />
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function StatCard({ label, value, icon, color }) {
  return (
    <div className="bg-white p-6 rounded-3xl border border-gray-100 shadow-sm hover:shadow-md transition-all group">
      <div className={`w-12 h-12 ${color} rounded-2xl flex items-center justify-center mb-4 group-hover:scale-110 transition-transform`}>
        {icon}
      </div>
      <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">{label}</p>
      <p className="text-3xl font-black text-gray-900 tracking-tight">{value}</p>
    </div>
  )
}

function ActionLink({ label }) {
  return (
    <button className="w-full flex items-center justify-between p-4 bg-white/10 hover:bg-white/20 rounded-2xl transition-all group">
      <span className="text-xs font-black uppercase tracking-widest">{label}</span>
      <ArrowRight size={16} className="opacity-0 group-hover:opacity-100 -translate-x-2 group-hover:translate-x-0 transition-all" />
    </button>
  )
}
