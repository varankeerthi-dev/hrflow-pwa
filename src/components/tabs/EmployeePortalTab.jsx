import { useState, useEffect } from 'react'
import { useAuth } from '../../hooks/useAuth'
import { useAttendance } from '../../hooks/useAttendance'
import { db } from '../../lib/firebase'
import { collection, addDoc, query, where, getDocs, serverTimestamp, orderBy } from 'firebase/firestore'
import Spinner from '../ui/Spinner'
import Modal from '../ui/Modal'
import { formatTimeTo12Hour } from '../../lib/salaryUtils'
import { User, Calendar, FileText, Plus, ArrowRight, ShieldCheck, Mail, Building, Landmark, Hash, Clock } from 'lucide-react'

export default function EmployeePortalTab() {
  const { user } = useAuth()
  const { fetchByDate } = useAttendance(user?.orgId)
  
  const [activePortalTab, setActivePortalTab] = useState('profile')
  const [loading, setLoading] = useState(false)
  
  // Requests State
  const [requests, setRequests] = useState([])
  const [showRequestModal, setShowRequestModal] = useState(false)
  const [requestForm, setRequestForm] = useState({ type: 'Leave', startDate: '', endDate: '', reason: '' })

  useEffect(() => {
    if (!user?.orgId || !user?.uid) return
    fetchRequests()
  }, [user?.orgId, user?.uid])

  const fetchRequests = async () => {
    setLoading(true)
    try {
      const q = query(
        collection(db, 'organisations', user.orgId, 'requests'),
        where('employeeId', '==', user.uid),
        orderBy('createdAt', 'desc')
      )
      const snap = await getDocs(q)
      setRequests(snap.docs.map(d => ({ id: d.id, ...d.data() })))
    } catch (err) {
      console.error('Portal fetch error:', err)
    } finally {
      setLoading(false)
    }
  }

  const handleRequestSubmit = async () => {
    if (!requestForm.startDate || !requestForm.reason) return
    setLoading(true)
    try {
      await addDoc(collection(db, 'organisations', user.orgId, 'requests'), {
        ...requestForm,
        employeeId: user.uid,
        employeeName: user.name,
        status: 'Pending',
        createdAt: serverTimestamp()
      })
      setShowRequestModal(false)
      fetchRequests()
    } catch (err) {
      alert('Failed to submit request')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="h-full flex flex-col font-inter gap-8 pb-10">
      {/* SaaS Sub-Navigation */}
      <div className="bg-white p-6 rounded-[12px] shadow-sm border border-gray-100 flex justify-between items-center">
        <div className="flex bg-gray-100 p-1 rounded-lg">
          {[
            { id: 'profile', label: 'My Identity', icon: <User size={16} /> },
            { id: 'attendance', label: 'Work Logs', icon: <Calendar size={16} /> },
            { id: 'requests', label: 'Internal Requests', icon: <FileText size={16} /> }
          ].map(t => (
            <button
              key={t.id}
              onClick={() => setActivePortalTab(t.id)}
              className={`flex items-center gap-2 px-5 py-2 rounded-md text-[13px] font-bold transition-all ${activePortalTab === t.id ? 'bg-white shadow-sm text-gray-900' : 'text-gray-400 hover:text-gray-600'}`}
            >
              {t.icon} {t.label}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-3">
          <div className="flex flex-col items-end mr-3">
            <span className="text-[11px] font-black text-indigo-600 uppercase tracking-widest">{user?.orgName}</span>
            <span className="text-[9px] font-bold text-gray-400 uppercase">Authenticated Session</span>
          </div>
          <div className="w-10 h-10 rounded-full bg-indigo-50 border border-indigo-100 flex items-center justify-center text-indigo-600 shadow-inner font-black text-sm">
            {user?.name?.[0]}
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-auto">
        {activePortalTab === 'profile' && (
          <div className="max-w-4xl mx-auto space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
            {/* Profile Hero Card */}
            <div className="bg-white rounded-[12px] p-10 border border-gray-100 shadow-sm flex items-center gap-10">
              <div className="w-28 h-28 rounded-3xl bg-gradient-to-br from-indigo-600 to-purple-600 flex items-center justify-center text-white text-4xl font-black shadow-2xl ring-8 ring-indigo-50">
                {user?.name?.[0]}
              </div>
              <div className="flex-1">
                <div className="flex items-center gap-3 mb-2">
                  <h2 className="text-3xl font-black text-gray-900 uppercase tracking-tighter">{user?.name}</h2>
                  <span className="bg-green-100 text-green-700 px-3 py-0.5 rounded-full text-[10px] font-black uppercase tracking-widest border border-green-200">Active Duty</span>
                </div>
                <div className="flex flex-wrap gap-6 mt-4">
                  <div className="flex items-center gap-2 text-gray-400 font-bold uppercase text-[10px] tracking-widest"><ShieldCheck size={14} className="text-indigo-500" /> {user?.role || 'Staff'}</div>
                  <div className="flex items-center gap-2 text-gray-400 font-bold uppercase text-[10px] tracking-widest"><Building size={14} className="text-indigo-500" /> {user?.department || 'Operations'}</div>
                  <div className="flex items-center gap-2 text-gray-400 font-bold uppercase text-[10px] tracking-widest"><Clock size={14} className="text-indigo-500" /> Joined {user?.joinedDate || 'N/A'}</div>
                </div>
              </div>
            </div>

            {/* Data Grid Card */}
            <div className="bg-white rounded-[12px] border border-gray-100 shadow-sm overflow-hidden">
              <div className="p-6 border-b border-gray-50 bg-gray-50/30 flex justify-between items-center">
                <span className="text-[11px] font-black text-gray-400 uppercase tracking-widest">Master File Attributes</span>
                <button className="text-[10px] font-black text-indigo-600 uppercase tracking-widest hover:underline">Request Update</button>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 divide-x divide-y divide-gray-50">
                {[
                  { label: 'Primary Email', value: user?.email, icon: <Mail size={16} /> },
                  { label: 'Organisation', value: user?.orgName, icon: <Building size={16} /> },
                  { label: 'Staff Identifier', value: user?.empCode || 'EX-999', icon: <Hash size={16} /> },
                  { label: 'Settlement Account', value: user?.bankAccount || 'Not Configured', icon: <Landmark size={16} /> },
                  { label: 'Permission Allowance', value: `${user?.permissionHours || 2}h Monthly`, icon: <Clock size={16} /> },
                  { label: 'Internal Status', value: 'Permanent Employee', icon: <ShieldCheck size={16} /> }
                ].map(info => (
                  <div key={info.label} className="p-8 hover:bg-gray-50/50 transition-colors">
                    <div className="flex items-center gap-3 text-indigo-500 mb-3">
                      {info.icon}
                      <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">{info.label}</p>
                    </div>
                    <p className="text-[15px] font-black text-gray-800 uppercase tracking-tight">{info.value}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {activePortalTab === 'requests' && (
          <div className="max-w-6xl mx-auto space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="flex justify-between items-center px-4">
              <div>
                <h3 className="text-xl font-black text-gray-900 uppercase tracking-tight">Flow History</h3>
                <p className="text-[11px] text-gray-400 font-bold uppercase tracking-widest mt-1">Leave and permission archival</p>
              </div>
              <button onClick={() => setShowRequestModal(true)} className="h-[44px] px-8 bg-indigo-600 text-white font-black rounded-xl shadow-xl shadow-indigo-900/10 hover:bg-indigo-700 transition-all uppercase tracking-[0.15em] text-[11px] flex items-center gap-3">
                <Plus size={18} strokeWidth={3} /> Initialize Request
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 px-4">
              {requests.map(req => (
                <div key={req.id} className="bg-white p-8 rounded-[12px] border border-gray-100 shadow-sm flex flex-col relative overflow-hidden group hover:shadow-lg transition-all">
                  <div className={`absolute top-0 right-0 px-4 py-1.5 rounded-bl-xl text-[9px] font-black uppercase tracking-[0.2em] ${req.status === 'Approved' ? 'bg-green-100 text-green-700 border-l border-b border-green-200' : req.status === 'Rejected' ? 'bg-red-100 text-red-700 border-l border-b border-red-200' : 'bg-amber-50 text-amber-600 border-l border-b border-amber-100'}`}>
                    {req.status}
                  </div>
                  <div className="mb-6 flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-gray-50 border border-gray-100 flex items-center justify-center text-gray-400 group-hover:text-indigo-600 transition-colors">
                      <FileText size={20} />
                    </div>
                    <span className="bg-gray-100 text-gray-600 px-3 py-1 rounded-md text-[10px] font-black uppercase tracking-widest">{req.type}</span>
                  </div>
                  <p className="text-[10px] font-bold text-gray-400 uppercase mb-2 tracking-widest flex items-center gap-2"><Calendar size={12} /> Scheduled Interval</p>
                  <p className="text-sm font-black text-gray-800 mb-6 flex items-center gap-2">
                    {req.startDate} <ArrowRight size={14} className="text-gray-300" /> {req.endDate || 'One-off'}
                  </p>
                  <p className="text-[10px] font-bold text-gray-400 uppercase mb-2 tracking-widest">Justification</p>
                  <p className="text-[13px] font-medium text-gray-600 italic leading-relaxed line-clamp-3">"{req.reason}"</p>
                  
                  <div className="mt-8 pt-6 border-t border-gray-50 flex justify-between items-center opacity-0 group-hover:opacity-100 transition-opacity">
                    <span className="text-[9px] font-black text-gray-300 uppercase">ID: {req.id.slice(-6)}</span>
                    <button className="text-[9px] font-black text-red-400 uppercase hover:text-red-600">Withdraw</button>
                  </div>
                </div>
              ))}
              {requests.length === 0 && (
                <div className="col-span-full py-32 text-center">
                  <div className="w-20 h-20 rounded-full bg-gray-50 flex items-center justify-center mx-auto mb-6 text-gray-200"><FileText size={40} /></div>
                  <p className="text-gray-300 font-medium uppercase tracking-[0.25em] text-xl italic opacity-40">No internal records found</p>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      <Modal isOpen={showRequestModal} onClose={() => setShowRequestModal(false)} title="New Protocol Request">
        <form onSubmit={e => { e.preventDefault(); handleRequestSubmit(); }} className="p-10 space-y-8 max-w-lg mx-auto font-inter">
          <div>
            <label className="block text-[11px] font-black text-gray-400 uppercase tracking-widest mb-3 px-1">Protocol Classification</label>
            <div className="flex bg-gray-100 p-1.5 rounded-xl border border-gray-200">
              {['Leave', 'Permission'].map(t => (
                <button key={t} type="button" onClick={() => setRequestForm(f => ({ ...f, type: t }))} className={`flex-1 py-3 rounded-lg text-[11px] font-black tracking-[0.1em] transition-all uppercase ${requestForm.type === t ? 'bg-white shadow-lg text-indigo-600 border border-indigo-50' : 'text-gray-400'}`}>{t}</button>
              ))}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-6">
            <div>
              <label className="block text-[11px] font-bold text-gray-400 uppercase tracking-widest mb-2 px-1">Start Date</label>
              <input type="date" value={requestForm.startDate} onChange={e => setRequestForm(f => ({ ...f, startDate: e.target.value }))} className="w-full h-[44px] border border-gray-200 rounded-lg px-4 text-sm font-bold bg-gray-50/50 focus:ring-2 focus:ring-indigo-500 outline-none" />
            </div>
            <div>
              <label className="block text-[11px] font-bold text-gray-400 uppercase tracking-widest mb-2 px-1">End Date (Optional)</label>
              <input type="date" value={requestForm.endDate} onChange={e => setRequestForm(f => ({ ...f, endDate: e.target.value }))} className="w-full h-[44px] border border-gray-200 rounded-lg px-4 text-sm font-bold bg-gray-50/50 focus:ring-2 focus:ring-indigo-500 outline-none" />
            </div>
          </div>
          <div>
            <label className="block text-[11px] font-bold text-gray-400 uppercase tracking-widest mb-2 px-1">Detailed Justification</label>
            <textarea value={requestForm.reason} onChange={e => setRequestForm(f => ({ ...f, reason: e.target.value }))} className="w-full border border-gray-200 rounded-xl p-5 text-sm font-medium outline-none bg-gray-50/50 focus:ring-2 focus:ring-indigo-500 h-[120px] transition-all" placeholder="Briefly state the reason for this administrative request..." />
          </div>
          <button type="submit" disabled={loading} className="w-full h-[48px] bg-indigo-600 text-white font-black py-3 rounded-xl shadow-2xl shadow-indigo-900/20 hover:bg-indigo-700 transition-all uppercase tracking-[0.25em] text-[12px]">
            Finalize & Dispatch
          </button>
        </form>
      </Modal>
    </div>
  )
}
