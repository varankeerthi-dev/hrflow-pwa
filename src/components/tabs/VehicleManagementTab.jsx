import React, { useState, useMemo } from 'react'
import { useAuth } from '../../hooks/useAuth'
import { useEmployees } from '../../hooks/useEmployees'
import { db } from '../../lib/firebase'
import { collection, addDoc, query, getDocs, serverTimestamp, orderBy, doc, updateDoc, setDoc } from 'firebase/firestore'
import { 
  Car, 
  Plus, 
  Edit2, 
  Search, 
  Calendar, 
  User, 
  FileText, 
  Wrench, 
  AlertTriangle, 
  CheckCircle2, 
  X, 
  Download, 
  History,
  Navigation,
  Fuel,
  Settings,
  ExternalLink
} from 'lucide-react'
import Spinner from '../ui/Spinner'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage'
import { storage } from '../../lib/firebase'

export default function VehicleManagementTab() {
  const { user } = useAuth()
  const { employees } = useEmployees(user?.orgId)
  const queryClient = useQueryClient()
  const [activeSubTab, setActiveSubTab] = useState('all-vehicles')
  
  // Modals
  const [showAddVehicle, setShowAddVehicle] = useState(false)
  const [editingVehicle, setEditingVehicle] = useState(null)
  const [showServiceModal, setShowServiceModal] = useState(false)
  const [selectedVehicleForHistory, setSelectedVehicleForHistory] = useState(null)
  const [uploading, setUploading] = useState(false)

  // Search
  const [searchTerm, setSearchName] = useState('')

  // Queries
  const { data: vehicles = [], isLoading: loadingVehicles } = useQuery({
    queryKey: ['vehicles', user?.orgId],
    queryFn: async () => {
      if (!user?.orgId) return []
      const q = query(collection(db, 'organisations', user.orgId, 'vehicles'), orderBy('createdAt', 'desc'))
      const snap = await getDocs(q)
      return snap.docs.map(d => ({ id: d.id, ...d.data() }))
    },
    enabled: !!user?.orgId
  })

  const { data: historyLogs = [], isLoading: loadingHistory } = useQuery({
    queryKey: ['vehicle_history', user?.orgId, selectedVehicleForHistory?.id],
    queryFn: async () => {
      if (!user?.orgId || !selectedVehicleForHistory?.id) return []
      const q = query(collection(db, 'organisations', user.orgId, 'vehicles', selectedVehicleForHistory.id, 'history'), orderBy('timestamp', 'desc'))
      const snap = await getDocs(q)
      return snap.docs.map(d => ({ id: d.id, ...d.data() }))
    },
    enabled: !!user?.orgId && !!selectedVehicleForHistory?.id
  })

  const { data: services = [], isLoading: loadingServices } = useQuery({
    queryKey: ['vehicle_services', user?.orgId],
    queryFn: async () => {
      if (!user?.orgId) return []
      const q = query(collection(db, 'organisations', user.orgId, 'vehicle_services'), orderBy('date', 'desc'))
      const snap = await getDocs(q)
      return snap.docs.map(d => ({ id: d.id, ...d.data() }))
    },
    enabled: !!user?.orgId
  })

  // Mutations
  const addVehicleMutation = useMutation({
    mutationFn: async (data) => {
      await addDoc(collection(db, 'organisations', user.orgId, 'vehicles'), {
        ...data,
        createdAt: serverTimestamp(),
        createdBy: user.uid
      })
    },
    onSuccess: () => {
      queryClient.invalidateQueries(['vehicles'])
      setShowAddVehicle(false)
    }
  })

  const updateVehicleMutation = useMutation({
    mutationFn: async ({ id, data, historyEntry }) => {
      const vRef = doc(db, 'organisations', user.orgId, 'vehicles', id)
      // Log history
      if (historyEntry) {
        await addDoc(collection(db, 'organisations', user.orgId, 'vehicles', id, 'history'), {
          ...historyEntry,
          timestamp: serverTimestamp()
        })
      }
      await updateDoc(vRef, { ...data, updatedAt: serverTimestamp() })
    },
    onSuccess: () => {
      queryClient.invalidateQueries(['vehicles'])
      setEditingVehicle(null)
    }
  })

  const addServiceMutation = useMutation({
    mutationFn: async (data) => {
      await addDoc(collection(db, 'organisations', user.orgId, 'vehicle_services'), {
        ...data,
        createdAt: serverTimestamp(),
        createdBy: user.uid
      })
    },
    onSuccess: () => {
      queryClient.invalidateQueries(['vehicle_services'])
      setShowServiceModal(false)
    }
  })

  const filteredVehicles = useMemo(() => {
    return vehicles.filter(v => 
      v.name?.toLowerCase().includes(searchTerm.toLowerCase()) || 
      v.vehicleNo?.toLowerCase().includes(searchTerm.toLowerCase())
    )
  }, [vehicles, searchTerm])

  const isExpired = (date) => {
    if (!date) return false
    return new Date(date) < new Date()
  }

  const handleFileUpload = async (file) => {
    if (!file) return null
    setUploading(true)
    try {
      const storageRef = ref(storage, `organisations/${user.orgId}/vehicle_bills/${Date.now()}_${file.name}`)
      const snapshot = await uploadBytes(storageRef, file)
      const url = await getDownloadURL(snapshot.ref)
      return url
    } catch (error) {
      console.error('File upload failed:', error)
      alert('Upload failed. Please try again.')
      return null
    } finally {
      setUploading(false)
    }
  }

  return (
    <div className="flex flex-col h-full bg-[#FAFAFA] font-inter">
      {/* Precision Header */}
      <div className="bg-white border-b border-zinc-200 px-8 py-6 flex flex-col lg:flex-row lg:items-center justify-between gap-6 shrink-0">
        <div>
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 bg-zinc-900 rounded-2xl flex items-center justify-center text-white shadow-xl shadow-zinc-200">
              <Car size={24} strokeWidth={2.5} />
            </div>
            <div>
              <h1 className="text-2xl font-black text-zinc-900 uppercase tracking-tighter leading-none">Fleet Control</h1>
              <p className="text-[10px] font-black text-indigo-600 uppercase tracking-[0.2em] mt-2 flex items-center gap-2">
                <span className="w-4 h-0.5 bg-indigo-600"></span>
                Asset Intelligence
              </p>
            </div>
          </div>
        </div>
        
        <div className="flex items-center bg-zinc-100 p-1.5 rounded-2xl w-fit shadow-inner border border-zinc-200/50">
          <button 
            onClick={() => setActiveSubTab('all-vehicles')}
            className={`px-6 py-2.5 rounded-xl text-[11px] font-black uppercase tracking-widest transition-all duration-300 ${activeSubTab === 'all-vehicles' ? 'bg-white text-zinc-900 shadow-md translate-y-[-1px]' : 'text-zinc-400 hover:text-zinc-600'}`}
          >
            Inventory
          </button>
          <button 
            onClick={() => setActiveSubTab('service-complaints')}
            className={`px-6 py-2.5 rounded-xl text-[11px] font-black uppercase tracking-widest transition-all duration-300 ${activeSubTab === 'service-complaints' ? 'bg-white text-zinc-900 shadow-md translate-y-[-1px]' : 'text-zinc-400 hover:text-zinc-600'}`}
          >
            Maintenance
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-auto p-8 lg:p-10">
        {activeSubTab === 'all-vehicles' && (
          <div className="max-w-7xl mx-auto space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-700">
            {/* Action Bar */}
            <div className="flex flex-col md:flex-row items-center justify-between gap-6">
              <div className="relative w-full md:w-96 group">
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-400 group-focus-within:text-indigo-600 transition-colors" size={18} />
                <input 
                  type="text" 
                  placeholder="Filter by Name or Registration No..."
                  value={searchTerm}
                  onChange={e => setSearchName(e.target.value)}
                  className="w-full pl-12 pr-6 h-14 bg-white border-2 border-zinc-100 rounded-2xl text-[13px] font-bold text-zinc-800 placeholder:text-zinc-300 focus:border-indigo-500/30 focus:ring-4 focus:ring-indigo-500/5 outline-none transition-all shadow-sm group-hover:border-zinc-200"
                />
              </div>
              <button 
                onClick={() => setShowAddVehicle(true)}
                className="w-full md:w-fit h-14 px-8 bg-zinc-900 text-white rounded-2xl text-[11px] font-black uppercase tracking-[0.15em] flex items-center justify-center gap-3 hover:bg-black transition-all shadow-2xl shadow-zinc-900/20 active:scale-[0.98]"
              >
                <Plus size={18} strokeWidth={3} /> Register Asset
              </button>
            </div>

            {/* Manifest Table */}
            <div className="bg-white rounded-[32px] border border-zinc-200 shadow-2xl shadow-zinc-200/50 overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse min-w-[1000px]">
                  <thead>
                    <tr className="bg-zinc-950 text-white h-16">
                      <th className="px-8 text-[10px] font-black uppercase tracking-[0.2em] opacity-50 border-r border-zinc-800">Fleet ID & Vehicle</th>
                      <th className="px-8 text-[10px] font-black uppercase tracking-[0.2em] opacity-50 border-r border-zinc-800">Registration & Date</th>
                      <th className="px-8 text-[10px] font-black uppercase tracking-[0.2em] opacity-50 border-r border-zinc-800">Insurance Status</th>
                      <th className="px-8 text-[10px] font-black uppercase tracking-[0.2em] opacity-50 border-r border-zinc-800">Operational Lead</th>
                      <th className="px-8 text-[10px] font-black uppercase tracking-[0.2em] opacity-50 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-100 bg-white">
                    {loadingVehicles ? (
                      <tr><td colSpan={5} className="py-32 text-center"><Spinner size="w-10 h-10" color="text-indigo-600" /></td></tr>
                    ) : filteredVehicles.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="py-40 text-center">
                          <div className="flex flex-col items-center opacity-20">
                            <Car size={64} strokeWidth={1} />
                            <p className="text-sm font-black uppercase tracking-widest mt-4">Zero Assets Detected</p>
                          </div>
                        </td>
                      </tr>
                    ) : filteredVehicles.map(v => (
                      <tr key={v.id} className="hover:bg-zinc-50/80 transition-all duration-300 group">
                        <td className="px-8 py-6 border-r border-zinc-50">
                          <div className="flex items-center gap-5">
                            <div className="w-14 h-14 rounded-2xl bg-zinc-100 flex items-center justify-center text-zinc-400 group-hover:bg-indigo-50 group-hover:text-indigo-600 transition-all duration-500">
                              <Car size={28} strokeWidth={1.5} />
                            </div>
                            <div className="flex flex-col">
                              <span className="text-[15px] font-black text-zinc-900 uppercase tracking-tight leading-none mb-1.5">{v.name}</span>
                              <div className="flex items-center gap-2">
                                <span className="text-[10px] font-mono font-black text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded-md border border-indigo-100/50 uppercase">{v.vehicleNo}</span>
                              </div>
                            </div>
                          </div>
                        </td>
                        <td className="px-8 py-6 border-r border-zinc-50">
                          <div className="flex flex-col">
                            <div className="flex items-center gap-2 text-[13px] font-bold text-zinc-700 tabular-nums leading-none mb-1.5">
                              <Calendar size={14} className="text-zinc-300" />
                              {v.purchaseDate || '—'}
                            </div>
                            <span className="text-[9px] font-black text-zinc-400 uppercase tracking-widest bg-zinc-100 px-2 py-0.5 rounded-md w-fit">RC: {v.rcNo || '—'}</span>
                          </div>
                        </td>
                        <td className="px-8 py-6 border-r border-zinc-50">
                          <div className="flex flex-col gap-2">
                            <div className={`flex items-center gap-2 px-3 py-1 rounded-full border w-fit ${isExpired(v.insuranceExpiry) ? 'bg-rose-50 text-rose-600 border-rose-100 ring-4 ring-rose-500/5' : 'bg-emerald-50 text-emerald-600 border-emerald-100'}`}>
                              <div className={`w-1.5 h-1.5 rounded-full ${isExpired(v.insuranceExpiry) ? 'bg-rose-600 animate-pulse' : 'bg-emerald-600'}`}></div>
                              <span className="text-[10px] font-black uppercase tracking-widest">{isExpired(v.insuranceExpiry) ? 'Security Breach / Expired' : 'Protected / Active'}</span>
                            </div>
                            <span className="text-[10px] font-bold text-zinc-400 tabular-nums ml-1">Expires: {v.insuranceExpiry || '—'}</span>
                          </div>
                        </td>
                        <td className="px-8 py-6 border-r border-zinc-50">
                          <div className="flex items-center gap-3">
                            <div className="w-9 h-9 rounded-xl bg-zinc-900 flex items-center justify-center text-[11px] font-black text-white shadow-lg shadow-zinc-200">
                              {employees.find(e => e.id === v.inchargeId)?.name?.charAt(0) || '?'}
                            </div>
                            <div className="flex flex-col">
                              <span className="text-[13px] font-black text-zinc-800 uppercase tracking-tight leading-none mb-1">{employees.find(e => e.id === v.inchargeId)?.name || 'Ground Zero'}</span>
                              <span className="text-[9px] font-bold text-zinc-400 uppercase tracking-tighter">Command Unit</span>
                            </div>
                          </div>
                        </td>
                        <td className="px-8 py-6 text-right">
                          <div className="flex justify-end gap-3 opacity-0 group-hover:opacity-100 transition-all duration-300 translate-x-2 group-hover:translate-x-0">
                            <button 
                              onClick={() => setSelectedVehicleForHistory(v)}
                              className="p-3 text-zinc-400 hover:text-zinc-900 transition-colors bg-white border border-zinc-100 rounded-xl hover:shadow-lg shadow-zinc-200"
                              title="Audit Trail"
                            >
                              <History size={18} />
                            </button>
                            <button 
                              onClick={() => setEditingVehicle(v)}
                              className="p-3 bg-zinc-100 text-zinc-600 rounded-xl hover:bg-zinc-900 hover:text-white transition-all shadow-sm hover:shadow-xl hover:shadow-zinc-900/20"
                            >
                              <Edit2 size={16} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {activeSubTab === 'service-complaints' && (
          <div className="max-w-7xl mx-auto space-y-10 animate-in fade-in zoom-in-95 duration-700">
            {/* Maintenance Header Card */}
            <div className="bg-zinc-900 rounded-[32px] p-8 lg:p-12 flex flex-col md:flex-row items-center justify-between gap-8 relative overflow-hidden shadow-3xl">
              <div className="absolute top-0 right-0 w-96 h-96 bg-indigo-500/10 rounded-full -mr-48 -mt-48 blur-3xl"></div>
              <div className="absolute bottom-0 left-0 w-64 h-64 bg-emerald-500/5 rounded-full -ml-32 -mb-32 blur-3xl"></div>
              
              <div className="relative z-10 text-center md:text-left">
                <div className="inline-flex items-center gap-3 px-4 py-2 rounded-2xl bg-zinc-800 border border-zinc-700/50 mb-6">
                  <Wrench size={18} className="text-amber-400" />
                  <span className="text-[10px] font-black text-zinc-400 uppercase tracking-[0.3em]">Engineering Oversight</span>
                </div>
                <h2 className="text-4xl font-black text-white uppercase tracking-tighter leading-none mb-4">Maintenance Center</h2>
                <p className="text-zinc-400 text-sm font-medium max-w-md uppercase tracking-wide leading-relaxed">Continuous health monitoring and diagnostic logging for the entire active fleet.</p>
              </div>
              
              <button 
                onClick={() => setShowServiceModal(true)}
                className="relative z-10 h-16 px-10 bg-white text-zinc-900 rounded-[20px] text-[12px] font-black uppercase tracking-[0.2em] flex items-center gap-4 hover:bg-indigo-50 transition-all shadow-2xl hover:shadow-indigo-500/20 active:scale-95"
              >
                <Plus size={20} strokeWidth={3} /> Log Protocol
              </button>
            </div>

            {/* Timeline Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
              {loadingServices ? (
                <div className="col-span-full py-32 text-center"><Spinner size="w-12 h-12" color="text-zinc-900" /></div>
              ) : services.length === 0 ? (
                <div className="col-span-full py-40 text-center border-2 border-dashed border-zinc-200 rounded-[40px] opacity-30 italic">
                  <div className="flex flex-col items-center">
                    <Wrench size={48} />
                    <p className="mt-4 font-black uppercase tracking-widest text-lg">Clean Bill of Health</p>
                  </div>
                </div>
              ) : services.map(s => (
                <div key={s.id} className="bg-white rounded-[32px] border border-zinc-200 shadow-xl shadow-zinc-200/30 overflow-hidden hover:translate-y-[-8px] transition-all duration-500 group">
                  <div className="p-6 border-b border-zinc-100 flex justify-between items-start bg-zinc-50/50">
                    <div className="flex flex-col">
                      <span className="text-[14px] font-black text-zinc-900 uppercase tracking-tight leading-none mb-1.5">
                        {vehicles.find(v => v.id === s.vehicleId)?.name || 'Phantom Asset'}
                      </span>
                      <div className="flex items-center gap-2">
                        <Calendar size={12} className="text-zinc-400" />
                        <span className="text-[10px] font-black text-zinc-400 uppercase tracking-widest tabular-nums">{s.date}</span>
                      </div>
                    </div>
                    <div className={`px-3 py-1 rounded-xl text-[9px] font-black uppercase tracking-widest border ${
                      s.type === 'Complaint' 
                        ? 'bg-rose-50 text-rose-600 border-rose-100 ring-4 ring-rose-500/5' 
                        : s.type === 'Oil Change'
                        ? 'bg-amber-50 text-amber-600 border-amber-100'
                        : 'bg-emerald-50 text-emerald-600 border-emerald-100'
                    }`}>
                      {s.type}
                    </div>
                  </div>
                  <div className="p-8 space-y-8">
                    <div className="grid grid-cols-2 gap-8 relative">
                      <div className="absolute left-1/2 top-0 bottom-0 w-px bg-zinc-100"></div>
                      <div className="flex flex-col">
                        <span className="text-[9px] font-black text-zinc-400 uppercase tracking-widest mb-2 flex items-center gap-1.5">
                          <Navigation size={10} className="text-indigo-500" /> Odometer
                        </span>
                        <span className="text-2xl font-black text-zinc-900 tabular-nums tracking-tighter">{s.mileage} <span className="text-[10px] font-black text-zinc-300">KM</span></span>
                      </div>
                      <div className="flex flex-col pl-4">
                        <span className="text-[9px] font-black text-zinc-400 uppercase tracking-widest mb-2 flex items-center gap-1.5">
                          <AlertTriangle size={10} className="text-amber-500" /> Cycle Due
                        </span>
                        <span className="text-lg font-black text-zinc-800 tabular-nums tracking-tighter">{s.nextDueDate || 'UNSET'}</span>
                      </div>
                    </div>
                    
                    <div className="space-y-3">
                      <span className="text-[9px] font-black text-zinc-400 uppercase tracking-widest flex items-center gap-1.5">
                        <Fuel size={10} className="text-emerald-500" /> Service Station
                      </span>
                      <div className="bg-zinc-50 p-4 rounded-2xl border border-zinc-100 group-hover:bg-indigo-50 group-hover:border-indigo-100 transition-colors duration-500">
                        <p className="text-[11px] font-black text-zinc-700 uppercase tracking-tight leading-tight">{s.location || 'Tactical Operation'}</p>
                      </div>
                    </div>

                    {s.billURL && (
                      <button 
                        onClick={() => window.open(s.billURL, '_blank')}
                        className="w-full h-14 bg-zinc-900 text-white rounded-2xl text-[10px] font-black uppercase tracking-[0.2em] flex items-center justify-center gap-3 hover:bg-black transition-all shadow-xl hover:shadow-indigo-500/20 active:scale-95 group-hover:bg-indigo-600 group-hover:text-white"
                      >
                        <ExternalLink size={16} /> Authenticate Bill
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Add/Edit Vehicle Modal */}
      {(showAddVehicle || editingVehicle) && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm px-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-xl overflow-hidden animate-in zoom-in-95 fade-in duration-200">
            <div className="bg-zinc-900 p-6 flex justify-between items-center text-white">
              <div>
                <h2 className="text-lg font-black uppercase tracking-tight">{editingVehicle ? 'Update Vehicle' : 'Register Vehicle'}</h2>
                <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest mt-1">Fleet Asset Onboarding</p>
              </div>
              <button onClick={() => { setShowAddVehicle(false); setEditingVehicle(null); }} className="text-zinc-400 hover:text-white transition-colors">
                <X size={20} />
              </button>
            </div>
            
            <form onSubmit={e => {
              e.preventDefault()
              const formData = new FormData(e.target)
              const data = Object.fromEntries(formData.entries())
              if (editingVehicle) {
                // If insurance updated, log history
                const historyEntry = data.insuranceExpiry !== editingVehicle.insuranceExpiry ? {
                  field: 'Insurance Expiry',
                  oldValue: editingVehicle.insuranceExpiry,
                  newValue: data.insuranceExpiry,
                  updatedBy: user.displayName || user.email
                } : null
                updateVehicleMutation.mutate({ id: editingVehicle.id, data, historyEntry })
              } else {
                addVehicleMutation.mutate(data)
              }
            }} className="p-8 space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-1.5">
                  <label className="text-[9px] font-black text-zinc-400 uppercase tracking-widest ml-1">Vehicle Name</label>
                  <input name="name" defaultValue={editingVehicle?.name} required placeholder="e.g. Toyota Corolla" className="w-full h-11 border border-zinc-200 rounded-xl px-4 text-xs font-bold bg-zinc-50 focus:ring-2 focus:ring-indigo-500 outline-none transition-all" />
                </div>
                <div className="space-y-1.5">
                  <label className="text-[9px] font-black text-zinc-400 uppercase tracking-widest ml-1">Vehicle Number</label>
                  <input name="vehicleNo" defaultValue={editingVehicle?.vehicleNo} required placeholder="e.g. KA-01-AB-1234" className="w-full h-11 border border-zinc-200 rounded-xl px-4 text-xs font-bold bg-zinc-50 focus:ring-2 focus:ring-indigo-500 outline-none transition-all uppercase" />
                </div>
                <div className="space-y-1.5">
                  <label className="text-[9px] font-black text-zinc-400 uppercase tracking-widest ml-1">Purchase Date</label>
                  <input type="date" name="purchaseDate" defaultValue={editingVehicle?.purchaseDate} required className="w-full h-11 border border-zinc-200 rounded-xl px-4 text-xs font-bold bg-zinc-50 focus:ring-2 focus:ring-indigo-500 outline-none transition-all" />
                </div>
                <div className="space-y-1.5">
                  <label className="text-[9px] font-black text-zinc-400 uppercase tracking-widest ml-1">RC Number</label>
                  <input name="rcNo" defaultValue={editingVehicle?.rcNo} required placeholder="RCXXXXXX" className="w-full h-11 border border-zinc-200 rounded-xl px-4 text-xs font-bold bg-zinc-50 focus:ring-2 focus:ring-indigo-500 outline-none transition-all uppercase" />
                </div>
                <div className="space-y-1.5">
                  <label className="text-[9px] font-black text-zinc-400 uppercase tracking-widest ml-1">Insurance Valid Till</label>
                  <input type="date" name="insuranceExpiry" defaultValue={editingVehicle?.insuranceExpiry} required className="w-full h-11 border border-zinc-200 rounded-xl px-4 text-xs font-bold bg-zinc-50 focus:ring-2 focus:ring-indigo-500 outline-none transition-all" />
                </div>
                <div className="space-y-1.5">
                  <label className="text-[9px] font-black text-zinc-400 uppercase tracking-widest ml-1">Assign Incharge</label>
                  <select name="inchargeId" defaultValue={editingVehicle?.inchargeId} required className="w-full h-11 border border-zinc-200 rounded-xl px-4 text-xs font-bold bg-zinc-50 focus:ring-2 focus:ring-indigo-500 outline-none transition-all">
                    <option value="">Select Employee</option>
                    {employees.map(emp => <option key={emp.id} value={emp.id}>{emp.name}</option>)}
                  </select>
                </div>
              </div>

              <div className="pt-4 flex gap-4">
                <button type="button" onClick={() => { setShowAddVehicle(false); setEditingVehicle(null); }} className="flex-1 h-12 bg-zinc-100 text-zinc-600 font-black rounded-xl uppercase text-[10px] tracking-widest hover:bg-zinc-200">Cancel</button>
                <button type="submit" disabled={addVehicleMutation.isPending || updateVehicleMutation.isPending} className="flex-2 h-12 bg-zinc-900 text-white font-black rounded-xl uppercase text-[10px] tracking-widest shadow-xl hover:bg-black transition-all">
                  {addVehicleMutation.isPending || updateVehicleMutation.isPending ? 'Processing...' : (editingVehicle ? 'Update Asset' : 'Save Vehicle')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Service & Complaint Modal */}
      {showServiceModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm px-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-xl overflow-hidden animate-in zoom-in-95 fade-in duration-200">
            <div className="bg-indigo-600 p-6 flex justify-between items-center text-white">
              <div>
                <h2 className="text-lg font-black uppercase tracking-tight">New Maintenance Log</h2>
                <p className="text-[10px] font-bold text-indigo-200 uppercase tracking-widest mt-1">Service & Fault Reporting</p>
              </div>
              <button onClick={() => setShowServiceModal(false)} className="text-indigo-200 hover:text-white transition-colors">
                <X size={20} />
              </button>
            </div>
            
            <form onSubmit={async e => {
              e.preventDefault()
              const formData = new FormData(e.target)
              const data = Object.fromEntries(formData.entries())
              const fileInput = e.target.querySelector('input[type=\"file\"]')
              let billURL = null
              if (fileInput.files[0]) {
                billURL = await handleFileUpload(fileInput.files[0])
              }
              addServiceMutation.mutate({ ...data, billURL })
            }} className="p-8 space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-1.5 md:col-span-2">
                  <label className="text-[9px] font-black text-zinc-400 uppercase tracking-widest ml-1">Target Vehicle</label>
                  <select name="vehicleId" required className="w-full h-11 border border-zinc-200 rounded-xl px-4 text-xs font-bold bg-zinc-50 focus:ring-2 focus:ring-indigo-500 outline-none transition-all">
                    <option value="">Choose Fleet Asset</option>
                    {vehicles.map(v => <option key={v.id} value={v.id}>{v.name} ({v.vehicleNo})</option>)}
                  </select>
                </div>
                <div className="space-y-1.5">
                  <label className="text-[9px] font-black text-zinc-400 uppercase tracking-widest ml-1">Entry Type</label>
                  <select name="type" required className="w-full h-11 border border-zinc-200 rounded-xl px-4 text-xs font-bold bg-zinc-50 focus:ring-2 focus:ring-indigo-500 outline-none transition-all">
                    <option value="Regular Service">Regular Service</option>
                    <option value="Complaint">Complaint / Repair</option>
                    <option value="Oil Change">Oil Change</option>
                  </select>
                </div>
                <div className="space-y-1.5">
                  <label className="text-[9px] font-black text-zinc-400 uppercase tracking-widest ml-1">Service Date</label>
                  <input type="date" name="date" required className="w-full h-11 border border-zinc-200 rounded-xl px-4 text-xs font-bold bg-zinc-50 focus:ring-2 focus:ring-indigo-500 outline-none transition-all" />
                </div>
                <div className="space-y-1.5">
                  <label className="text-[9px] font-black text-zinc-400 uppercase tracking-widest ml-1">Current Mileage (KM)</label>
                  <input type="number" name="mileage" required placeholder="0" className="w-full h-11 border border-zinc-200 rounded-xl px-4 text-xs font-bold bg-zinc-50 focus:ring-2 focus:ring-indigo-500 outline-none transition-all" />
                </div>
                <div className="space-y-1.5">
                  <label className="text-[9px] font-black text-zinc-400 uppercase tracking-widest ml-1">Next Service Due (Date)</label>
                  <input type="date" name="nextDueDate" className="w-full h-11 border border-zinc-200 rounded-xl px-4 text-xs font-bold bg-zinc-50 focus:ring-2 focus:ring-indigo-500 outline-none transition-all" />
                </div>
                <div className="space-y-1.5 md:col-span-2">
                  <label className="text-[9px] font-black text-zinc-400 uppercase tracking-widest ml-1">Service Done At (Station & Location)</label>
                  <input name="location" required placeholder="e.g. Bosch Service Center, Downtown" className="w-full h-11 border border-zinc-200 rounded-xl px-4 text-xs font-bold bg-zinc-50 focus:ring-2 focus:ring-indigo-500 outline-none transition-all" />
                </div>
                <div className="space-y-1.5 md:col-span-2">
                  <label className="text-[9px] font-black text-zinc-400 uppercase tracking-widest ml-1">Bill Copy (Upload PDF)</label>
                  <div className="relative">
                    <input type="file" accept="application/pdf" className="w-full text-[10px] font-bold text-zinc-400 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-[10px] file:font-black file:bg-indigo-50 file:text-indigo-600 hover:file:bg-indigo-100" />
                    {uploading && <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-2 text-[9px] font-bold text-indigo-600"><Spinner size="w-3 h-3" /> Uploading...</div>}
                  </div>
                </div>
              </div>

              <div className="pt-4 flex gap-4">
                <button type="button" onClick={() => setShowServiceModal(false)} className="flex-1 h-12 bg-zinc-100 text-zinc-600 font-black rounded-xl uppercase text-[10px] tracking-widest hover:bg-zinc-200">Cancel</button>
                <button type="submit" disabled={addServiceMutation.isPending || uploading} className="flex-2 h-12 bg-indigo-600 text-white font-black rounded-xl uppercase text-[10px] tracking-widest shadow-xl shadow-indigo-100 hover:bg-indigo-700 transition-all">
                  {addServiceMutation.isPending || uploading ? 'Saving...' : 'Record maintenance'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* History Log Modal */}
      {selectedVehicleForHistory && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm px-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden animate-in zoom-in-95 fade-in duration-200">
            <div className="bg-zinc-900 p-6 flex justify-between items-center text-white">
              <div>
                <h2 className="text-lg font-black uppercase tracking-tight">Change History</h2>
                <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest mt-1">{selectedVehicleForHistory.name} - {selectedVehicleForHistory.vehicleNo}</p>
              </div>
              <button onClick={() => setSelectedVehicleForHistory(null)} className="text-zinc-400 hover:text-white transition-colors">
                <X size={20} />
              </button>
            </div>
            
            <div className="p-6 max-h-[60vh] overflow-y-auto">
              <div className="space-y-4">
                <div className="p-4 bg-zinc-50 rounded-xl border border-zinc-100">
                  <p className="text-[10px] font-black text-zinc-400 uppercase tracking-widest mb-2">Registration Record</p>
                  <div className="flex justify-between items-center">
                    <span className="text-xs font-bold text-zinc-700">Initialized in system</span>
                    <span className="text-[10px] font-bold text-zinc-400">{selectedVehicleForHistory.createdAt?.toDate ? selectedVehicleForHistory.createdAt.toDate().toLocaleDateString() : '—'}</span>
                  </div>
                </div>
                
                {loadingHistory ? (
                  <div className="py-10 text-center"><Spinner /></div>
                ) : historyLogs.length === 0 ? (
                  <p className="text-[9px] font-bold text-zinc-300 uppercase tracking-widest text-center py-10 italic">No insurance or RC updates recorded yet.</p>
                ) : (
                  historyLogs.map(log => (
                    <div key={log.id} className="p-4 bg-zinc-50 rounded-xl border border-zinc-100 flex flex-col gap-2">
                      <div className="flex justify-between items-start">
                        <span className="text-[10px] font-black text-indigo-600 uppercase tracking-widest">{log.field} Update</span>
                        <span className="text-[9px] font-bold text-zinc-400 uppercase">{log.timestamp?.toDate ? log.timestamp.toDate().toLocaleDateString() : 'Just now'}</span>
                      </div>
                      <div className="flex items-center gap-3 text-xs">
                        <span className="text-zinc-400 line-through">{log.oldValue}</span>
                        <ChevronRight size={12} className="text-zinc-300" />
                        <span className="font-bold text-zinc-800">{log.newValue}</span>
                      </div>
                      <p className="text-[8px] font-black text-zinc-400 uppercase tracking-tighter mt-1 italic">Updated by: {log.updatedBy}</p>
                    </div>
                  ))
                )}
              </div>
            </div>
            
            <div className="p-4 border-t border-zinc-100 bg-zinc-50 flex justify-end">
              <button onClick={() => setSelectedVehicleForHistory(null)} className="px-6 h-10 bg-zinc-900 text-white font-black rounded-xl text-[10px] uppercase tracking-widest shadow-lg">Close Log</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
