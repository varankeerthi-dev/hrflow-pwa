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
    <div className="flex flex-col h-full bg-white font-inter selection:bg-indigo-100 selection:text-indigo-900">
      {/* Brutal Header */}
      <div className="border-b border-zinc-100 px-8 py-10 flex flex-col lg:flex-row lg:items-end justify-between gap-8 shrink-0">
        <div>
          <h1 className="text-4xl font-black text-zinc-900 uppercase tracking-tighter leading-none">
            Fleet<span className="text-indigo-600">.</span>Manifest
          </h1>
          <div className="flex items-center gap-4 mt-4">
            <div className="flex items-center bg-zinc-900 p-1 rounded-lg">
              <button 
                onClick={() => setActiveSubTab('all-vehicles')}
                className={`px-5 py-1.5 rounded-md text-[10px] font-black uppercase tracking-widest transition-all ${activeSubTab === 'all-vehicles' ? 'bg-white text-zinc-900' : 'text-zinc-400 hover:text-zinc-200'}`}
              >
                Inventory
              </button>
              <button 
                onClick={() => setActiveSubTab('service-complaints')}
                className={`px-5 py-1.5 rounded-md text-[10px] font-black uppercase tracking-widest transition-all ${activeSubTab === 'service-complaints' ? 'bg-white text-zinc-900' : 'text-zinc-400 hover:text-zinc-200'}`}
              >
                Maintenance
              </button>
            </div>
            <span className="text-[10px] font-bold text-zinc-300 uppercase tracking-[0.2em] hidden sm:block">Logistics Command</span>
          </div>
        </div>

        <div className="flex flex-col items-end gap-2">
          <p className="text-[10px] font-black text-zinc-400 uppercase tracking-widest">Global Fleet Status</p>
          <div className="flex gap-2">
            <div className="px-3 py-1 bg-zinc-50 border border-zinc-100 rounded-md">
              <span className="text-[10px] font-black text-zinc-900 tabular-nums">{vehicles.length} <span className="text-zinc-400 uppercase ml-1">Assets</span></span>
            </div>
            <div className="px-3 py-1 bg-zinc-50 border border-zinc-100 rounded-md">
              <span className="text-[10px] font-black text-rose-600 tabular-nums">
                {vehicles.filter(v => isExpired(v.insuranceExpiry)).length} <span className="text-zinc-400 uppercase ml-1">Expired</span>
              </span>
            </div>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-auto px-8 py-12 lg:px-12">
        {activeSubTab === 'all-vehicles' && (
          <div className="max-w-screen-2xl mx-auto space-y-12">
            {/* Minimal Toolbar */}
            <div className="flex flex-col md:flex-row items-center justify-between gap-6 border-b border-zinc-100 pb-8">
              <div className="relative w-full md:w-[480px]">
                <Search className="absolute left-0 top-1/2 -translate-y-1/2 text-zinc-900" size={20} strokeWidth={3} />
                <input 
                  type="text" 
                  placeholder="FILTER BY REGISTRATION OR NAME..."
                  value={searchTerm}
                  onChange={e => setSearchName(e.target.value)}
                  className="w-full pl-8 pr-4 h-12 bg-transparent text-[13px] font-black text-zinc-900 placeholder:text-zinc-200 focus:outline-none uppercase tracking-tight"
                />
              </div>
              <button 
                onClick={() => setShowAddVehicle(true)}
                className="w-full md:w-fit h-12 px-10 bg-indigo-600 text-white text-[11px] font-black uppercase tracking-[0.2em] flex items-center justify-center gap-3 hover:bg-zinc-900 transition-all active:scale-95"
              >
                Add Asset <Plus size={16} strokeWidth={4} />
              </button>
            </div>

            {/* Brutal Table */}
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse min-w-[1000px]">
                <thead>
                  <tr className="border-b-4 border-zinc-900">
                    <th className="py-4 text-[11px] font-black uppercase tracking-[0.2em] text-zinc-900 w-[30%]">Asset Designation</th>
                    <th className="py-4 text-[11px] font-black uppercase tracking-[0.2em] text-zinc-900">Registration</th>
                    <th className="py-4 text-[11px] font-black uppercase tracking-[0.2em] text-zinc-900">Insurance Control</th>
                    <th className="py-4 text-[11px] font-black uppercase tracking-[0.2em] text-zinc-900">Unit Lead</th>
                    <th className="py-4 text-[11px] font-black uppercase tracking-[0.2em] text-zinc-900 text-right">Ops</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100">
                  {loadingVehicles ? (
                    <tr><td colSpan={5} className="py-32 text-center"><Spinner size="w-12 h-12" color="text-zinc-900" /></td></tr>
                  ) : filteredVehicles.length === 0 ? (
                    <tr><td colSpan={5} className="py-40 text-center text-zinc-200 font-black uppercase tracking-[0.3em] text-2xl italic">System Empty</td></tr>
                  ) : filteredVehicles.map(v => (
                    <tr key={v.id} className="group hover:bg-zinc-50/50 transition-colors">
                      <td className="py-8">
                        <div className="flex flex-col">
                          <span className="text-xl font-black text-zinc-900 uppercase tracking-tighter leading-none group-hover:text-indigo-600 transition-colors">{v.name}</span>
                          <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest mt-2">Fleet Deployment Unit</span>
                        </div>
                      </td>
                      <td className="py-8">
                        <div className="flex flex-col">
                          <span className="text-[14px] font-mono font-black text-zinc-900 tracking-tight leading-none uppercase">{v.vehicleNo}</span>
                          <span className="text-[10px] font-bold text-zinc-400 uppercase mt-2">RC: {v.rcNo || 'N/A'}</span>
                        </div>
                      </td>
                      <td className="py-8">
                        <div className="flex flex-col">
                          <span className={`text-[11px] font-black uppercase tracking-widest mb-2 ${isExpired(v.insuranceExpiry) ? 'text-rose-600' : 'text-emerald-600'}`}>
                            {isExpired(v.insuranceExpiry) ? 'Expired / Security Alert' : 'Operational / Active'}
                          </span>
                          <span className="text-sm font-black text-zinc-900 tabular-nums">
                            {v.insuranceExpiry ? new Date(v.insuranceExpiry).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }).toUpperCase() : '—'}
                          </span>
                        </div>
                      </td>
                      <td className="py-8">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 bg-zinc-100 rounded flex items-center justify-center text-[10px] font-black text-zinc-900 border border-zinc-200 group-hover:bg-zinc-900 group-hover:text-white transition-all">
                            {getInitials(employees.find(e => e.id === v.inchargeId)?.name || '??')}
                          </div>
                          <div className="flex flex-col">
                            <span className="text-[13px] font-black text-zinc-900 uppercase tracking-tight leading-none">{employees.find(e => e.id === v.inchargeId)?.name || 'Unassigned'}</span>
                            <span className="text-[9px] font-bold text-zinc-400 uppercase tracking-tighter mt-1">Asset Custodian</span>
                          </div>
                        </div>
                      </td>
                      <td className="py-8 text-right">
                        <div className="flex justify-end gap-1 opacity-0 group-hover:opacity-100 transition-all">
                          <button 
                            onClick={() => setSelectedVehicleForHistory(v)}
                            className="h-10 w-10 flex items-center justify-center text-zinc-400 hover:text-zinc-900 hover:bg-white border border-transparent hover:border-zinc-100 transition-all"
                          >
                            <History size={18} strokeWidth={2.5} />
                          </button>
                          <button 
                            onClick={() => setEditingVehicle(v)}
                            className="h-10 w-10 flex items-center justify-center bg-zinc-900 text-white hover:bg-indigo-600 transition-all"
                          >
                            <Edit2 size={16} strokeWidth={3} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {activeSubTab === 'service-complaints' && (
          <div className="max-w-5xl mx-auto space-y-16 animate-in fade-in slide-in-from-bottom-8 duration-700">
            {/* Maintenance Command */}
            <div className="flex flex-col sm:flex-row items-center justify-between gap-8 border-b-2 border-zinc-100 pb-12">
              <div>
                <h2 className="text-3xl font-black text-zinc-900 uppercase tracking-tighter leading-none">Diagnostic Logs</h2>
                <p className="text-[11px] font-bold text-zinc-400 uppercase tracking-[0.3em] mt-4">Continuous Fleet Health Monitoring</p>
              </div>
              <button 
                onClick={() => setShowServiceModal(true)}
                className="h-14 px-12 bg-zinc-900 text-white text-[11px] font-black uppercase tracking-[0.2em] hover:bg-indigo-600 transition-all"
              >
                Log Maintenance
              </button>
            </div>

            {/* List Layout - No Cards, Just High Contrast Rows */}
            <div className="space-y-1">
              {loadingServices ? (
                <div className="py-32 text-center"><Spinner size="w-12 h-12" color="text-zinc-900" /></div>
              ) : services.length === 0 ? (
                <div className="py-40 text-center border-2 border-dashed border-zinc-100 rounded-xl opacity-20 italic">
                  <p className="font-black uppercase tracking-widest">No Active Faults</p>
                </div>
              ) : services.map(s => (
                <div key={s.id} className="group grid grid-cols-1 lg:grid-cols-12 gap-6 py-8 border-b border-zinc-100 hover:bg-zinc-50 transition-all px-4 -mx-4 rounded-lg">
                  <div className="lg:col-span-3 flex flex-col justify-center">
                    <span className="text-lg font-black text-zinc-900 uppercase tracking-tighter leading-none group-hover:text-indigo-600 transition-colors">
                      {vehicles.find(v => v.id === s.vehicleId)?.name || 'UNKNOWN'}
                    </span>
                    <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest mt-2">
                      {s.date ? new Date(s.date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }).toUpperCase() : 'NO DATE'}
                    </span>
                  </div>

                  <div className="lg:col-span-2 flex items-center">
                    <span className={`px-3 py-1 text-[9px] font-black uppercase tracking-widest border-2 ${
                      s.type === 'Complaint' 
                        ? 'border-rose-600 text-rose-600 bg-white' 
                        : s.type === 'Oil Change'
                        ? 'border-amber-500 text-amber-600 bg-white'
                        : 'border-emerald-500 text-emerald-600 bg-white'
                    }`}>
                      {s.type}
                    </span>
                  </div>

                  <div className="lg:col-span-2 flex flex-col justify-center">
                    <span className="text-[10px] font-black text-zinc-300 uppercase tracking-widest mb-1">Odometer</span>
                    <span className="text-sm font-black text-zinc-900 tabular-nums">{s.mileage} KM</span>
                  </div>

                  <div className="lg:col-span-2 flex flex-col justify-center">
                    <span className="text-[10px] font-black text-zinc-300 uppercase tracking-widest mb-1">Next Cycle</span>
                    <span className="text-sm font-black text-indigo-600 tabular-nums uppercase">{s.nextDueDate || 'UNSET'}</span>
                  </div>

                  <div className="lg:col-span-3 flex items-center justify-end gap-4">
                    {s.billURL && (
                      <button 
                        onClick={() => window.open(s.billURL, '_blank')}
                        className="h-10 px-6 bg-zinc-100 text-zinc-900 text-[10px] font-black uppercase tracking-widest hover:bg-zinc-900 hover:text-white transition-all"
                      >
                        Bill Copy
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
