import { useState, useEffect } from 'react'
import { useAuth } from '../../hooks/useAuth'
import { useAttendance } from '../../hooks/useAttendance'
import { db } from '../../lib/firebase'
import { collection, addDoc, query, where, getDocs, serverTimestamp, orderBy } from 'firebase/firestore'
import Spinner from '../ui/Spinner'
import Modal from '../ui/Modal'

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
    <div className="h-full flex flex-col text-xs">
      {/* Sub Nav */}
      <div className="flex gap-2 mb-6 border-b border-gray-100 pb-4">
        {[
          { id: 'profile', label: 'My Profile', icon: '👤' },
          { id: 'attendance', label: 'My Attendance', icon: '📅' },
          { id: 'requests', label: 'Leaves & Permissions', icon: '📝' }
        ].map(t => (
          <button
            key={t.id}
            onClick={() => setActivePortalTab(t.id)}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl font-black uppercase tracking-tighter transition-all ${activePortalTab === t.id ? 'bg-indigo-600 text-white shadow-lg' : 'bg-white text-gray-400 hover:bg-gray-50'}`}
          >
            <span>{t.icon}</span>
            {t.label}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-auto">
        {activePortalTab === 'profile' && (
          <div className="max-w-2xl bg-white rounded-3xl border shadow-sm p-8">
            <div className="flex items-center gap-6 mb-8">
              <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-white text-3xl font-black shadow-xl">
                {user?.name?.[0]}
              </div>
              <div>
                <h2 className="text-2xl font-black text-gray-800 uppercase tracking-tight">{user?.name}</h2>
                <p className="text-indigo-500 font-bold uppercase tracking-widest text-[10px]">{user?.role || 'Employee'}</p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-6">
              {[
                { label: 'Email Address', value: user?.email },
                { label: 'Organisation', value: user?.orgName },
                { label: 'Joining Date', value: user?.joinedDate || 'Not Set' },
                { label: 'Department', value: user?.department || 'General' },
                { label: 'Employee Code', value: user?.empCode || 'N/A' },
                { label: 'Bank Account', value: user?.bankAccount || 'Not Provided' }
              ].map(info => (
                <div key={info.label} className="bg-gray-50/50 p-4 rounded-2xl border border-gray-100">
                  <p className="text-[9px] font-black text-gray-400 uppercase mb-1">{info.label}</p>
                  <p className="text-sm font-bold text-gray-700">{info.value}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {activePortalTab === 'requests' && (
          <div className="space-y-6">
            <div className="flex justify-between items-center">
              <h3 className="text-lg font-black text-gray-800 uppercase tracking-tight">Request History</h3>
              <button onClick={() => setShowRequestModal(true)} className="bg-indigo-600 text-white px-6 py-2.5 rounded-2xl font-black shadow-xl hover:bg-indigo-700 transition-all uppercase tracking-widest text-[10px]">+ New Request</button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {requests.map(req => (
                <div key={req.id} className="bg-white p-5 rounded-3xl border shadow-sm flex flex-col relative overflow-hidden group">
                  <div className={`absolute top-0 right-0 px-3 py-1 rounded-bl-xl text-[8px] font-black uppercase tracking-widest ${req.status === 'Approved' ? 'bg-green-100 text-green-600' : req.status === 'Rejected' ? 'bg-red-100 text-red-600' : 'bg-amber-100 text-amber-600'}`}>
                    {req.status}
                  </div>
                  <div className="mb-3">
                    <span className="bg-indigo-50 text-indigo-600 px-2 py-0.5 rounded-full text-[9px] font-black uppercase">{req.type}</span>
                  </div>
                  <p className="text-[10px] font-black text-gray-400 uppercase mb-1">Duration</p>
                  <p className="text-xs font-bold text-gray-700 mb-3">{req.startDate} {req.endDate && `→ ${req.endDate}`}</p>
                  <p className="text-[10px] font-black text-gray-400 uppercase mb-1">Reason</p>
                  <p className="text-xs font-medium text-gray-600 italic line-clamp-2">"{req.reason}"</p>
                </div>
              ))}
              {requests.length === 0 && <div className="col-span-full py-20 text-center text-gray-300 font-black uppercase tracking-widest opacity-20 text-2xl italic">No Requests Found</div>}
            </div>
          </div>
        )}
      </div>

      <Modal isOpen={showRequestModal} onClose={() => setShowRequestModal(false)} title="CREATE NEW REQUEST">
        <div className="p-4 space-y-4 max-w-sm mx-auto">
          <div>
            <label className="block text-[9px] font-black text-gray-400 uppercase mb-1.5">Request Type</label>
            <div className="flex bg-gray-100 p-1 rounded-xl">
              {['Leave', 'Permission'].map(t => (
                <button key={t} onClick={() => setRequestForm(f => ({ ...f, type: t }))} className={`flex-1 py-2 rounded-lg text-[10px] font-black transition-all ${requestForm.type === t ? 'bg-white shadow text-indigo-600' : 'text-gray-400'}`}>{t.toUpperCase()}</button>
              ))}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[9px] font-black text-gray-400 uppercase mb-1">From Date</label>
              <input type="date" value={requestForm.startDate} onChange={e => setRequestForm(f => ({ ...f, startDate: e.target.value }))} className="w-full border rounded-xl px-3 py-2 text-xs font-bold focus:ring-1 focus:ring-indigo-500 outline-none" />
            </div>
            <div>
              <label className="block text-[9px] font-black text-gray-400 uppercase mb-1">To Date (Optional)</label>
              <input type="date" value={requestForm.endDate} onChange={e => setRequestForm(f => ({ ...f, endDate: e.target.value }))} className="w-full border rounded-xl px-3 py-2 text-xs font-bold focus:ring-1 focus:ring-indigo-500 outline-none" />
            </div>
          </div>
          <div>
            <label className="block text-[9px] font-black text-gray-400 uppercase mb-1">Reason / Details</label>
            <textarea value={requestForm.reason} onChange={e => setRequestForm(f => ({ ...f, reason: e.target.value }))} className="w-full border rounded-xl px-3 py-2 text-xs font-medium focus:ring-1 focus:ring-indigo-500 outline-none bg-gray-50 h-24" placeholder="Briefly explain your request..." />
          </div>
          <button onClick={handleRequestSubmit} disabled={loading} className="w-full bg-indigo-600 text-white font-black py-3 rounded-2xl shadow-xl hover:bg-indigo-700 transition-all uppercase tracking-widest text-[10px]">Submit Request</button>
        </div>
      </Modal>
    </div>
  )
}
