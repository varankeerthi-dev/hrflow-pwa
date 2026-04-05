import React, { useState, useMemo } from 'react'
import { useAuth } from '../../hooks/useAuth'
import { useEmployees } from '../../hooks/useEmployees'
import { db } from '../../lib/firebase'
import { collection, addDoc, query, getDocs, serverTimestamp, orderBy, doc, updateDoc, setDoc } from 'firebase/firestore'
import DatePicker from 'react-datepicker'
import 'react-datepicker/dist/react-datepicker.css'
import { format } from 'date-fns'
import { 
  Car, 
  Plus, 
  Edit2, 
  Search, 
  Calendar, 
  User, 
  FileText, 
  Hash,
  Wrench, 
  AlertTriangle, 
  CheckCircle2, 
  X, 
  Download, 
  History,
  Navigation,
  Fuel,
  Settings,
  ExternalLink,
  CalendarIcon,
  DollarSign,
  Clock
} from 'lucide-react'
import Spinner from '../ui/Spinner'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage'
import { storage } from '../../lib/firebase'

function getInitials(name) {
  return name?.split(' ').map(n => n[0]).join('').toUpperCase() || '??'
}

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

  // Search & Filters
  const [searchTerm, setSearchName] = useState('')
  const [maintenanceFilters, setMaintenanceFilters] = useState({
    vehicleId: '',
    serviceType: '',
    fromDate: '',
    toDate: ''
  })

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

  const filteredServices = useMemo(() => {
    return services.filter(s => {
      // Vehicle filter
      if (maintenanceFilters.vehicleId && s.vehicleId !== maintenanceFilters.vehicleId) return false
      
      // Service type filter
      if (maintenanceFilters.serviceType && s.type !== maintenanceFilters.serviceType) return false
      
      // Date range filter
      if (maintenanceFilters.fromDate && s.date) {
        const serviceDate = new Date(s.date)
        const fromDate = new Date(maintenanceFilters.fromDate)
        if (serviceDate < fromDate) return false
      }
      
      if (maintenanceFilters.toDate && s.date) {
        const serviceDate = new Date(s.date)
        const toDate = new Date(maintenanceFilters.toDate)
        // Add 1 day to include the end date
        toDate.setDate(toDate.getDate() + 1)
        if (serviceDate >= toDate) return false
      }
      
      return true
    })
  }, [services, maintenanceFilters])

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
      {/* Header with Tabs at Top */}
      <div className="bg-white border-b border-gray-200 px-6 py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4 shrink-0">
        <div className="flex items-center gap-6">
          <h1 className="text-xl font-semibold text-gray-900">Vehicle Management</h1>
          
          {/* Tabs moved to top */}
          <div className="flex items-center bg-gray-100 p-1 rounded-lg">
            <button 
              onClick={() => setActiveSubTab('all-vehicles')}
              className={`px-4 py-1.5 rounded-md text-[13px] font-medium transition-all ${activeSubTab === 'all-vehicles' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
            >
              Inventory
            </button>
            <button 
              onClick={() => setActiveSubTab('service-complaints')}
              className={`px-4 py-1.5 rounded-md text-[13px] font-medium transition-all ${activeSubTab === 'service-complaints' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
            >
              Maintenance
            </button>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex gap-2">
            <div className="px-3 py-1.5 bg-gray-50 border border-gray-200 rounded-md">
              <span className="text-xs text-gray-600">{vehicles.length} Assets</span>
            </div>
            <div className="px-3 py-1.5 bg-rose-50 border border-rose-200 rounded-md">
              <span className="text-xs text-rose-600">{vehicles.filter(v => isExpired(v.insuranceExpiry)).length} Expired</span>
            </div>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-auto px-6 py-6">
        {activeSubTab === 'all-vehicles' && (
          <div className="max-w-screen-2xl mx-auto space-y-6">
            {/* Toolbar */}
            <div className="flex flex-col md:flex-row items-center justify-between gap-4">
              <div className="relative w-full md:w-[400px]">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
                <input 
                  type="text" 
                  placeholder="Search by name or registration..."
                  value={searchTerm}
                  onChange={e => setSearchName(e.target.value)}
                  className="w-full pl-10 pr-4 h-10 bg-gray-50 border border-gray-200 rounded-lg text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 transition-all"
                />
              </div>
              <button 
                onClick={() => setShowAddVehicle(true)}
                className="w-full md:w-fit h-10 px-6 bg-indigo-600 text-white text-sm font-medium rounded-lg flex items-center justify-center gap-2 hover:bg-indigo-700 transition-colors"
              >
                <Plus size={16} /> Add Asset
              </button>
            </div>

            {/* Desktop Table - Hidden on Mobile */}
            <div className="hidden md:block rounded-lg border border-zinc-200 bg-white text-zinc-950 shadow-sm">
              <div className="overflow-x-auto">
                <table className="w-full caption-bottom text-sm border-collapse min-w-[1000px]">
                  <thead className="border-b border-zinc-200 bg-zinc-50/80 [&_tr]:border-b">
                    <tr className="border-b border-zinc-200">
                      <th className="h-10 px-3 text-left align-middle text-xs font-medium text-zinc-500 w-[30%]">Asset Designation</th>
                      <th className="h-10 px-3 text-left align-middle text-xs font-medium text-zinc-500">Registration</th>
                      <th className="h-10 px-3 text-left align-middle text-xs font-medium text-zinc-500">Insurance Control</th>
                      <th className="h-10 px-3 text-left align-middle text-xs font-medium text-zinc-500">Unit Lead</th>
                      <th className="h-10 px-3 text-right align-middle text-xs font-medium text-zinc-500 min-w-[100px]">Action</th>
                    </tr>
                  </thead>
                  <tbody className="[&_tr:last-child]:border-0">
                    {loadingVehicles ? (
                      <tr><td colSpan={5} className="py-20 text-center"><Spinner size="w-8 h-8" color="text-zinc-400" /></td></tr>
                    ) : filteredVehicles.length === 0 ? (
                      <tr><td colSpan={5} className="py-20 text-center text-zinc-400 font-medium italic">No vehicles found</td></tr>
                    ) : filteredVehicles.map(v => (
                      <tr key={v.id} className="border-b border-zinc-100 hover:bg-zinc-50/80 transition-colors">
                        <td className="px-3 py-2 align-middle">
                          <div className="flex flex-col">
                            <span className="text-sm font-medium text-zinc-900">{v.name}</span>
                            <span className="text-[10px] text-zinc-400">Fleet Deployment Unit</span>
                          </div>
                        </td>
                        <td className="px-3 py-2 align-middle whitespace-nowrap text-[12px] font-medium text-zinc-500">
                          <div className="flex flex-col">
                            <span>{v.vehicleNo}</span>
                            <span className="text-[10px] text-zinc-400">RC: {v.rcNo || 'N/A'}</span>
                          </div>
                        </td>
                        <td className="px-3 py-2 align-middle">
                          <div className="flex flex-col">
                            <span className={`text-[11px] font-medium ${isExpired(v.insuranceExpiry) ? 'text-rose-600' : 'text-emerald-600'}`}>
                              {isExpired(v.insuranceExpiry) ? 'Expired' : 'Active'}
                            </span>
                            <span className="text-xs text-zinc-500">
                              {v.insuranceExpiry ? new Date(v.insuranceExpiry).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'}
                            </span>
                          </div>
                        </td>
                        <td className="px-3 py-2 align-middle">
                          <div className="flex items-center gap-2">
                            <div className="w-6 h-6 bg-zinc-100 rounded-full flex items-center justify-center text-[10px] font-bold text-zinc-600">
                              {getInitials(employees.find(e => e.id === v.inchargeId)?.name || '??')}
                            </div>
                            <span className="text-[12px] font-medium text-zinc-700">
                              {employees.find(e => e.id === v.inchargeId)?.name || 'Unassigned'}
                            </span>
                          </div>
                        </td>
                        <td className="px-3 py-2 align-middle text-right">
                          <div className="flex justify-end gap-1">
                            <button 
                              onClick={() => setSelectedVehicleForHistory(v)}
                              className="h-8 w-8 flex items-center justify-center text-zinc-400 hover:text-zinc-600 hover:bg-zinc-100 rounded transition-all"
                            >
                              <History size={14} />
                            </button>
                            <button 
                              onClick={() => setEditingVehicle(v)}
                              className="h-8 w-8 flex items-center justify-center bg-indigo-50 text-indigo-600 hover:bg-indigo-100 rounded transition-all"
                            >
                              <Edit2 size={14} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Mobile Cards - Shown only on Mobile */}
            <div className="md:hidden space-y-3">
              {loadingVehicles ? (
                <div className="py-12 text-center">
                  <Spinner size="w-10 h-10" color="text-zinc-400" />
                  <p className="text-zinc-400 text-sm mt-3">Loading vehicles...</p>
                </div>
              ) : filteredVehicles.length === 0 ? (
                <div className="py-16 text-center border-2 border-dashed border-zinc-200 rounded-xl bg-zinc-50/50">
                  <div className="w-16 h-16 bg-zinc-100 rounded-full flex items-center justify-center mx-auto mb-3">
                    <Car size={28} className="text-zinc-300" />
                  </div>
                  <p className="text-zinc-400 text-sm font-medium">No vehicles found</p>
                  <p className="text-zinc-300 text-xs mt-1">Add a vehicle to get started</p>
                </div>
              ) : filteredVehicles.map(v => (
                <div key={v.id} className="bg-white rounded-xl border border-zinc-200 shadow-sm overflow-hidden active:scale-[0.98] transition-transform">
                  {/* Card Header */}
                  <div className="px-4 py-3 bg-gradient-to-r from-zinc-50 to-white border-b border-zinc-100 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 bg-indigo-100 rounded-lg flex items-center justify-center">
                        <Car size={20} className="text-indigo-600" />
                      </div>
                      <div>
                        <h3 className="text-sm font-semibold text-zinc-900">{v.name}</h3>
                        <p className="text-xs text-zinc-400">Fleet Unit</p>
                      </div>
                    </div>
                    <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${isExpired(v.insuranceExpiry) ? 'bg-rose-100 text-rose-700' : 'bg-emerald-100 text-emerald-700'}`}>
                      {isExpired(v.insuranceExpiry) ? 'Expired' : 'Active'}
                    </span>
                  </div>
                  
                  {/* Card Body */}
                  <div className="p-4 space-y-3">
                    {/* Registration Info */}
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Hash size={14} className="text-zinc-400" />
                        <span className="text-xs text-zinc-500">Registration</span>
                      </div>
                      <span className="text-sm font-semibold text-zinc-700">{v.vehicleNo}</span>
                    </div>
                    
                    {/* RC Info */}
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <FileText size={14} className="text-zinc-400" />
                        <span className="text-xs text-zinc-500">RC Number</span>
                      </div>
                      <span className="text-sm font-medium text-zinc-600">{v.rcNo || 'N/A'}</span>
                    </div>
                    
                    {/* Insurance Expiry */}
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Calendar size={14} className="text-zinc-400" />
                        <span className="text-xs text-zinc-500">Insurance Until</span>
                      </div>
                      <span className={`text-sm font-medium ${isExpired(v.insuranceExpiry) ? 'text-rose-600' : 'text-emerald-600'}`}>
                        {v.insuranceExpiry ? new Date(v.insuranceExpiry).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'}
                      </span>
                    </div>
                    
                    {/* Unit Lead */}
                    <div className="flex items-center justify-between pt-2 border-t border-zinc-100">
                      <div className="flex items-center gap-2">
                        <div className="w-7 h-7 bg-zinc-100 rounded-full flex items-center justify-center text-[10px] font-bold text-zinc-600">
                          {getInitials(employees.find(e => e.id === v.inchargeId)?.name || '??')}
                        </div>
                        <span className="text-xs text-zinc-500">Unit Lead</span>
                      </div>
                      <span className="text-sm font-medium text-zinc-700">
                        {employees.find(e => e.id === v.inchargeId)?.name || 'Unassigned'}
                      </span>
                    </div>
                  </div>
                  
                  {/* Card Actions */}
                  <div className="px-4 py-3 bg-zinc-50 border-t border-zinc-100 flex gap-2">
                    <button 
                      onClick={() => setSelectedVehicleForHistory(v)}
                      className="flex-1 flex items-center justify-center gap-2 h-11 text-sm font-medium text-zinc-600 bg-white border border-zinc-200 rounded-lg hover:bg-zinc-50 active:bg-zinc-100 transition-colors"
                    >
                      <History size={16} />
                      History
                    </button>
                    <button 
                      onClick={() => setEditingVehicle(v)}
                      className="flex-1 flex items-center justify-center gap-2 h-11 text-sm font-medium text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 active:bg-indigo-800 transition-colors"
                    >
                      <Edit2 size={16} />
                      Edit
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {activeSubTab === 'service-complaints' && (
          <div className="max-w-7xl mx-auto space-y-6">
            {/* Dashboard Stats */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider">Total Services</span>
                  <div className="w-8 h-8 bg-indigo-50 rounded-lg flex items-center justify-center">
                    <Wrench size={16} className="text-indigo-600" />
                  </div>
                </div>
                <p className="text-2xl font-bold text-gray-900">{services.length}</p>
                <p className="text-xs text-gray-400 mt-1">All time records</p>
              </div>
              
              <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider">This Month</span>
                  <div className="w-8 h-8 bg-amber-50 rounded-lg flex items-center justify-center">
                    <Calendar size={16} className="text-amber-600" />
                  </div>
                </div>
                <p className="text-2xl font-bold text-gray-900">
                  {services.filter(s => {
                    const serviceDate = s.date ? new Date(s.date) : null
                    const now = new Date()
                    return serviceDate && serviceDate.getMonth() === now.getMonth() && serviceDate.getFullYear() === now.getFullYear()
                  }).length}
                </p>
                <p className="text-xs text-gray-400 mt-1">Current month</p>
              </div>
              
              <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider">Regular Service</span>
                  <div className="w-8 h-8 bg-emerald-50 rounded-lg flex items-center justify-center">
                    <CheckCircle2 size={16} className="text-emerald-600" />
                  </div>
                </div>
                <p className="text-2xl font-bold text-gray-900">
                  {services.filter(s => s.type === 'Regular Service').length}
                </p>
                <p className="text-xs text-gray-400 mt-1">Preventive maintenance</p>
              </div>
              
              <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider">Repairs</span>
                  <div className="w-8 h-8 bg-rose-50 rounded-lg flex items-center justify-center">
                    <AlertTriangle size={16} className="text-rose-600" />
                  </div>
                </div>
                <p className="text-2xl font-bold text-gray-900">
                  {services.filter(s => s.type === 'Complaint' || s.type === 'Breakdown').length}
                </p>
                <p className="text-xs text-gray-400 mt-1">Issues & breakdowns</p>
              </div>
            </div>

            {/* Filters Toolbar */}
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
              <div className="flex flex-col lg:flex-row gap-4 items-start lg:items-center justify-between">
                <div className="flex items-center gap-2">
                  <h2 className="text-lg font-semibold text-gray-900">Maintenance Records</h2>
                  <span className="px-2.5 py-1 bg-gray-100 text-gray-600 text-xs font-medium rounded-full">
                    {services.length} records
                  </span>
                </div>
                
                <button 
                  onClick={() => setShowServiceModal(true)}
                  className="h-10 px-6 bg-indigo-600 text-white text-sm font-medium rounded-lg flex items-center gap-2 hover:bg-indigo-700 transition-colors"
                >
                  <Plus size={16} /> Log Maintenance
                </button>
              </div>
              
              {/* Filter Controls */}
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mt-5 pt-5 border-t border-gray-100">
                {/* Vehicle Filter */}
                <div>
                  <label className="block text-[11px] font-semibold text-gray-500 uppercase tracking-wider mb-2">
                    Filter by Vehicle
                  </label>
                  <select 
                    value={maintenanceFilters.vehicleId}
                    onChange={(e) => setMaintenanceFilters(prev => ({ ...prev, vehicleId: e.target.value }))}
                    className="w-full bg-gray-50/50 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 focus:bg-white outline-none transition-all appearance-none cursor-pointer"
                  >
                    <option value="">All Vehicles</option>
                    {vehicles.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}
                  </select>
                </div>
                
                {/* Service Type Filter */}
                <div>
                  <label className="block text-[11px] font-semibold text-gray-500 uppercase tracking-wider mb-2">
                    Service Type
                  </label>
                  <select 
                    value={maintenanceFilters.serviceType}
                    onChange={(e) => setMaintenanceFilters(prev => ({ ...prev, serviceType: e.target.value }))}
                    className="w-full bg-gray-50/50 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 focus:bg-white outline-none transition-all appearance-none cursor-pointer"
                  >
                    <option value="">All Types</option>
                    <option value="Regular Service">Regular Service</option>
                    <option value="Complaint">Complaint / Repair</option>
                    <option value="Oil Change">Oil Change</option>
                    <option value="Tire Replacement">Tire Replacement</option>
                    <option value="Battery Replacement">Battery Replacement</option>
                    <option value="Breakdown">Breakdown</option>
                  </select>
                </div>
                
                {/* Date Range */}
                <div>
                  <label className="block text-[11px] font-semibold text-gray-500 uppercase tracking-wider mb-2">
                    From Date
                  </label>
                  <input 
                    type="date"
                    value={maintenanceFilters.fromDate}
                    onChange={(e) => setMaintenanceFilters(prev => ({ ...prev, fromDate: e.target.value }))}
                    className="w-full bg-gray-50/50 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 focus:bg-white outline-none transition-all cursor-pointer"
                  />
                </div>
                
                <div>
                  <label className="block text-[11px] font-semibold text-gray-500 uppercase tracking-wider mb-2">
                    To Date
                  </label>
                  <input 
                    type="date"
                    value={maintenanceFilters.toDate}
                    onChange={(e) => setMaintenanceFilters(prev => ({ ...prev, toDate: e.target.value }))}
                    className="w-full bg-gray-50/50 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 focus:bg-white outline-none transition-all cursor-pointer"
                  />
                </div>
              </div>
              
              {/* Clear Filters */}
              {(maintenanceFilters.vehicleId || maintenanceFilters.serviceType || maintenanceFilters.fromDate || maintenanceFilters.toDate) && (
                <div className="mt-4 pt-4 border-t border-gray-100 flex justify-end">
                  <button 
                    onClick={() => setMaintenanceFilters({ vehicleId: '', serviceType: '', fromDate: '', toDate: '' })}
                    className="text-sm font-medium text-indigo-600 hover:text-indigo-700 transition-colors flex items-center gap-1"
                  >
                    <X size={14} /> Clear all filters
                  </button>
                </div>
              )}
            </div>

            {/* Desktop Table Layout */}
            <div className="hidden md:block bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full caption-bottom text-sm border-collapse">
                  <thead className="border-b border-gray-200 bg-gray-50/80">
                    <tr>
                      <th className="h-11 px-4 text-left align-middle text-xs font-semibold text-gray-500 uppercase tracking-wider">Vehicle</th>
                      <th className="h-11 px-4 text-left align-middle text-xs font-semibold text-gray-500 uppercase tracking-wider">Service Type</th>
                      <th className="h-11 px-4 text-left align-middle text-xs font-semibold text-gray-500 uppercase tracking-wider">Date</th>
                      <th className="h-11 px-4 text-left align-middle text-xs font-semibold text-gray-500 uppercase tracking-wider">Mileage</th>
                      <th className="h-11 px-4 text-left align-middle text-xs font-semibold text-gray-500 uppercase tracking-wider">Cost</th>
                      <th className="h-11 px-4 text-left align-middle text-xs font-semibold text-gray-500 uppercase tracking-wider">Next Due</th>
                      <th className="h-11 px-4 text-left align-middle text-xs font-semibold text-gray-500 uppercase tracking-wider">Location</th>
                      <th className="h-11 px-4 text-right align-middle text-xs font-semibold text-gray-500 uppercase tracking-wider">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="[&_tr:last-child]:border-0">
                    {loadingServices ? (
                      <tr><td colSpan={8} className="py-20 text-center"><Spinner size="w-8 h-8" color="text-gray-400" /></td></tr>
                    ) : filteredServices.length === 0 ? (
                      <tr><td colSpan={8} className="py-20 text-center text-gray-400 font-medium">No maintenance records found</td></tr>
                    ) : filteredServices.map(s => (
                      <tr key={s.id} className="border-b border-gray-100 hover:bg-gray-50/80 transition-colors">
                        <td className="px-4 py-3 align-middle">
                          <div className="flex items-center gap-3">
                            <div className="w-8 h-8 bg-indigo-50 rounded-lg flex items-center justify-center">
                              <Car size={14} className="text-indigo-600" />
                            </div>
                            <div>
                              <p className="text-sm font-medium text-gray-900">{vehicles.find(v => v.id === s.vehicleId)?.name || 'Unknown'}</p>
                              <p className="text-[10px] text-gray-400">{vehicles.find(v => v.id === s.vehicleId)?.vehicleNo || '—'}</p>
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3 align-middle">
                          <span className={`inline-flex px-2.5 py-1 rounded-md text-xs font-medium ${
                            s.type === 'Complaint' || s.type === 'Breakdown' ? 'bg-rose-50 text-rose-600' :
                            s.type === 'Oil Change' ? 'bg-amber-50 text-amber-600' :
                            s.type === 'Regular Service' ? 'bg-emerald-50 text-emerald-600' :
                            'bg-gray-50 text-gray-600'
                          }`}>
                            {s.type}
                          </span>
                        </td>
                        <td className="px-4 py-3 align-middle text-sm text-gray-700">
                          {s.date ? new Date(s.date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'}
                        </td>
                        <td className="px-4 py-3 align-middle text-sm text-gray-700 font-medium">
                          {s.mileage?.toLocaleString() || '—'} <span className="text-gray-400 text-xs">km</span>
                        </td>
                        <td className="px-4 py-3 align-middle text-sm text-gray-700 font-medium">
                          {s.cost ? `₹${s.cost.toLocaleString()}` : '—'}
                        </td>
                        <td className="px-4 py-3 align-middle text-sm text-indigo-600 font-medium">
                          {s.nextDueDate ? new Date(s.nextDueDate).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'}
                        </td>
                        <td className="px-4 py-3 align-middle text-sm text-gray-600">
                          <div className="flex items-center gap-1.5">
                            <Navigation size={12} className="text-gray-400" />
                            <span className="truncate max-w-[120px]">{s.location || '—'}</span>
                          </div>
                        </td>
                        <td className="px-4 py-3 align-middle text-right">
                          <div className="flex items-center justify-end gap-2">
                            {s.billURL && (
                              <button 
                                onClick={() => window.open(s.billURL, '_blank')}
                                className="h-8 px-3 bg-gray-100 text-gray-600 text-xs font-medium rounded-lg hover:bg-gray-200 transition-colors flex items-center gap-1.5"
                              >
                                <FileText size={12} /> View Bill
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Mobile Cards Layout */}
            <div className="md:hidden space-y-4">
              {loadingServices ? (
                <div className="py-12 text-center">
                  <Spinner size="w-10 h-10" color="text-gray-400" />
                  <p className="text-gray-400 text-sm mt-3">Loading maintenance records...</p>
                </div>
              ) : filteredServices.length === 0 ? (
                <div className="py-16 text-center border-2 border-dashed border-gray-200 rounded-xl bg-gray-50/50">
                  <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-3">
                    <Wrench size={28} className="text-gray-300" />
                  </div>
                  <p className="text-gray-400 text-sm font-medium">No maintenance records found</p>
                  <p className="text-gray-300 text-xs mt-1">Add a service log to get started</p>
                </div>
              ) : filteredServices.map(s => (
                <div key={s.id} className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
                  {/* Card Header */}
                  <div className="px-4 py-3 bg-gradient-to-r from-gray-50 to-white border-b border-gray-100 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 bg-indigo-100 rounded-lg flex items-center justify-center">
                        <Car size={20} className="text-indigo-600" />
                      </div>
                      <div>
                        <h3 className="text-sm font-semibold text-gray-900">
                          {vehicles.find(v => v.id === s.vehicleId)?.name || 'Unknown'}
                        </h3>
                        <p className="text-xs text-gray-400">
                          {vehicles.find(v => v.id === s.vehicleId)?.vehicleNo || '—'}
                        </p>
                      </div>
                    </div>
                    <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${
                      s.type === 'Complaint' || s.type === 'Breakdown' ? 'bg-rose-100 text-rose-700' :
                      s.type === 'Oil Change' ? 'bg-amber-100 text-amber-700' :
                      s.type === 'Regular Service' ? 'bg-emerald-100 text-emerald-700' :
                      'bg-gray-100 text-gray-700'
                    }`}>
                      {s.type}
                    </span>
                  </div>
                  
                  {/* Card Body */}
                  <div className="p-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Calendar size={14} className="text-gray-400" />
                        <span className="text-xs text-gray-500">Service Date</span>
                      </div>
                      <span className="text-sm font-semibold text-gray-700">
                        {s.date ? new Date(s.date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'}
                      </span>
                    </div>
                    
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Hash size={14} className="text-gray-400" />
                        <span className="text-xs text-gray-500">Mileage</span>
                      </div>
                      <span className="text-sm font-semibold text-gray-700">
                        {s.mileage?.toLocaleString() || '—'} <span className="text-gray-400 text-xs">km</span>
                      </span>
                    </div>
                    
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <DollarSign size={14} className="text-gray-400" />
                        <span className="text-xs text-gray-500">Cost</span>
                      </div>
                      <span className="text-sm font-semibold text-gray-700">
                        {s.cost ? `₹${s.cost.toLocaleString()}` : '—'}
                      </span>
                    </div>
                    
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Clock size={14} className="text-gray-400" />
                        <span className="text-xs text-gray-500">Next Due</span>
                      </div>
                      <span className="text-sm font-semibold text-indigo-600">
                        {s.nextDueDate ? new Date(s.nextDueDate).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'}
                      </span>
                    </div>
                    
                    <div className="flex items-center justify-between pt-2 border-t border-gray-100">
                      <div className="flex items-center gap-2">
                        <Navigation size={14} className="text-gray-400" />
                        <span className="text-xs text-gray-500">Location</span>
                      </div>
                      <span className="text-sm font-medium text-gray-700 truncate max-w-[150px]">
                        {s.location || '—'}
                      </span>
                    </div>
                    
                    {s.description && (
                      <div className="pt-2 border-t border-gray-100">
                        <p className="text-xs text-gray-500 mb-1">Description</p>
                        <p className="text-sm text-gray-700">{s.description}</p>
                      </div>
                    )}
                  </div>
                  
                  {/* Card Actions */}
                  {s.billURL && (
                    <div className="px-4 py-3 bg-gray-50 border-t border-gray-100">
                      <button 
                        onClick={() => window.open(s.billURL, '_blank')}
                        className="w-full flex items-center justify-center gap-2 h-11 text-sm font-medium text-indigo-600 bg-indigo-50 rounded-lg hover:bg-indigo-100 transition-colors"
                      >
                        <FileText size={16} /> View Bill
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Add/Edit Vehicle Modal */}
      {(showAddVehicle || editingVehicle) && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center overflow-auto py-8">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl mx-4 max-h-[90vh] overflow-hidden flex flex-col">
            {/* Modal Header */}
            <div className="bg-indigo-600 px-6 py-4 flex justify-between items-center shrink-0">
              <div>
                <h3 className="text-white font-semibold text-[15px]">{editingVehicle ? 'Edit Vehicle' : 'Add New Vehicle'}</h3>
                <p className="text-[11px] text-indigo-200 mt-0.5">Fleet Asset Management</p>
              </div>
              <button 
                type="button"
                onClick={() => { setShowAddVehicle(false); setEditingVehicle(null); }} 
                className="text-white/80 hover:text-white transition-colors"
              >
                <X size={20} />
              </button>
            </div>
            
            <form onSubmit={e => {
              e.preventDefault()
              const formData = new FormData(e.target)
              const data = Object.fromEntries(formData.entries())
              if (editingVehicle) {
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
            }} className="p-6 space-y-6 overflow-y-auto">
              
              {/* Vehicle Information Section Card */}
              <div className="border border-gray-200 rounded-xl overflow-hidden bg-white shadow-sm">
                <div className="bg-gray-50 px-4 py-3 border-b border-gray-100 flex items-center justify-between">
                  <h5 className="text-[11px] font-semibold text-gray-600 uppercase tracking-wider flex items-center gap-2">
                    <Car size={12} className="text-gray-400" />
                    Vehicle Information
                  </h5>
                  <span className="text-[10px] font-medium text-gray-400 italic">Required fields</span>
                </div>
                
                <div className="p-4 space-y-6">
                  {/* Two Column Grid */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div>
                      <label className="block text-[12px] font-semibold text-gray-700 mb-2">
                        Vehicle Name
                      </label>
                      <input 
                        name="name" 
                        defaultValue={editingVehicle?.name} 
                        required 
                        placeholder="e.g. Toyota Corolla"
                        className="w-full bg-gray-50/50 border border-gray-200 rounded-lg px-4 py-2.5 text-sm focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 focus:bg-white outline-none transition-all placeholder:text-gray-400" 
                      />
                    </div>
                    <div>
                      <label className="block text-[12px] font-semibold text-gray-700 mb-2">
                        Vehicle Number
                      </label>
                      <input 
                        name="vehicleNo" 
                        defaultValue={editingVehicle?.vehicleNo} 
                        required 
                        placeholder="e.g. KA-01-AB-1234"
                        className="w-full bg-gray-50/50 border border-gray-200 rounded-lg px-4 py-2.5 text-sm focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 focus:bg-white outline-none transition-all placeholder:text-gray-400 uppercase" 
                      />
                    </div>
                    <div>
                      <label className="block text-[12px] font-semibold text-gray-700 mb-2">
                        Purchase Date
                      </label>
                      <input 
                        type="date" 
                        name="purchaseDate" 
                        defaultValue={editingVehicle?.purchaseDate} 
                        required 
                        className="w-full bg-gray-50/50 border border-gray-200 rounded-lg px-4 py-2.5 text-sm focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 focus:bg-white outline-none transition-all cursor-pointer" 
                      />
                    </div>
                    <div>
                      <label className="block text-[12px] font-semibold text-gray-700 mb-2">
                        RC Number
                      </label>
                      <input 
                        name="rcNo" 
                        defaultValue={editingVehicle?.rcNo} 
                        required 
                        placeholder="RCXXXXXX"
                        className="w-full bg-gray-50/50 border border-gray-200 rounded-lg px-4 py-2.5 text-sm focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 focus:bg-white outline-none transition-all placeholder:text-gray-400 uppercase" 
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* Insurance & Assignment Section Card */}
              <div className="border border-gray-200 rounded-xl overflow-hidden bg-white shadow-sm">
                <div className="bg-gray-50 px-4 py-3 border-b border-gray-100 flex items-center justify-between">
                  <h5 className="text-[11px] font-semibold text-gray-600 uppercase tracking-wider flex items-center gap-2">
                    <CheckCircle2 size={12} className="text-gray-400" />
                    Insurance & Assignment
                  </h5>
                  <span className="text-[10px] font-medium text-gray-400 italic">Required fields</span>
                </div>
                
                <div className="p-4 grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <label className="block text-[12px] font-semibold text-gray-700 mb-2">
                      Insurance Valid Till
                    </label>
                    <input 
                      type="date" 
                      name="insuranceExpiry" 
                      defaultValue={editingVehicle?.insuranceExpiry} 
                      required 
                      className="w-full bg-gray-50/50 border border-gray-200 rounded-lg px-4 py-2.5 text-sm focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 focus:bg-white outline-none transition-all cursor-pointer" 
                    />
                  </div>
                  <div>
                    <label className="block text-[12px] font-semibold text-gray-700 mb-2">
                      Assign Incharge
                    </label>
                    <select 
                      name="inchargeId" 
                      defaultValue={editingVehicle?.inchargeId} 
                      required 
                      className="w-full bg-gray-50/50 border border-gray-200 rounded-lg px-4 py-2.5 text-sm focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 focus:bg-white outline-none transition-all appearance-none cursor-pointer"
                    >
                      <option value="">Select Employee</option>
                      {employees.map(emp => <option key={emp.id} value={emp.id}>{emp.name}</option>)}
                    </select>
                  </div>
                </div>
              </div>

              {/* Additional Details Section (Optional) */}
              <div className="border border-gray-200 rounded-xl overflow-hidden bg-white shadow-sm">
                <div className="bg-gray-50 px-4 py-3 border-b border-gray-100 flex items-center justify-between">
                  <h5 className="text-[11px] font-semibold text-gray-600 uppercase tracking-wider flex items-center gap-2">
                    <Settings size={12} className="text-gray-400" />
                    Additional Details
                  </h5>
                  <span className="text-[10px] font-medium text-gray-400 italic">Optional</span>
                </div>
                
                <div className="p-4 grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <label className="block text-[12px] font-semibold text-gray-700 mb-2">
                      Manufacturer
                    </label>
                    <input 
                      name="manufacturer" 
                      defaultValue={editingVehicle?.manufacturer} 
                      placeholder="e.g. Toyota"
                      className="w-full bg-gray-50/50 border border-gray-200 rounded-lg px-4 py-2.5 text-sm focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 focus:bg-white outline-none transition-all placeholder:text-gray-400" 
                    />
                  </div>
                  <div>
                    <label className="block text-[12px] font-semibold text-gray-700 mb-2">
                      Model Year
                    </label>
                    <input 
                      name="modelYear" 
                      type="number"
                      defaultValue={editingVehicle?.modelYear} 
                      placeholder="e.g. 2023"
                      className="w-full bg-gray-50/50 border border-gray-200 rounded-lg px-4 py-2.5 text-sm focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 focus:bg-white outline-none transition-all placeholder:text-gray-400" 
                    />
                  </div>
                  <div>
                    <label className="block text-[12px] font-semibold text-gray-700 mb-2">
                      Fuel Type
                    </label>
                    <select 
                      name="fuelType" 
                      defaultValue={editingVehicle?.fuelType || 'Petrol'}
                      className="w-full bg-gray-50/50 border border-gray-200 rounded-lg px-4 py-2.5 text-sm focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 focus:bg-white outline-none transition-all appearance-none cursor-pointer"
                    >
                      <option value="Petrol">Petrol</option>
                      <option value="Diesel">Diesel</option>
                      <option value="CNG">CNG</option>
                      <option value="Electric">Electric</option>
                      <option value="Hybrid">Hybrid</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-[12px] font-semibold text-gray-700 mb-2">
                      Seating Capacity
                    </label>
                    <input 
                      name="seatingCapacity" 
                      type="number"
                      defaultValue={editingVehicle?.seatingCapacity} 
                      placeholder="e.g. 5"
                      className="w-full bg-gray-50/50 border border-gray-200 rounded-lg px-4 py-2.5 text-sm focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 focus:bg-white outline-none transition-all placeholder:text-gray-400" 
                    />
                  </div>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex gap-3 pt-4 border-t border-gray-100">
                <button 
                  type="button" 
                  onClick={() => { setShowAddVehicle(false); setEditingVehicle(null); }} 
                  className="px-6 py-2.5 border border-gray-200 text-gray-600 rounded-lg text-sm font-medium hover:bg-gray-50 transition-colors"
                >
                  Cancel
                </button>
                <button 
                  type="submit" 
                  disabled={addVehicleMutation.isPending || updateVehicleMutation.isPending} 
                  className="flex-1 px-6 py-2.5 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 transition-all shadow-sm shadow-indigo-100 active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {addVehicleMutation.isPending || updateVehicleMutation.isPending ? 'Saving...' : (editingVehicle ? 'Update Vehicle' : 'Add Vehicle')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Service & Complaint Modal */}
      {showServiceModal && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center overflow-auto py-8">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl mx-4 max-h-[90vh] overflow-hidden flex flex-col">
            {/* Modal Header */}
            <div className="bg-indigo-600 px-6 py-4 flex justify-between items-center shrink-0">
              <div>
                <h3 className="text-white font-semibold text-[15px]">Log Maintenance</h3>
                <p className="text-[11px] text-indigo-200 mt-0.5">Service & Fault Reporting</p>
              </div>
              <button 
                type="button"
                onClick={() => setShowServiceModal(false)} 
                className="text-white/80 hover:text-white transition-colors"
              >
                <X size={20} />
              </button>
            </div>
            
            <form onSubmit={async e => {
              e.preventDefault()
              const formData = new FormData(e.target)
              const data = Object.fromEntries(formData.entries())
              const fileInput = e.target.querySelector('input[type="file"]')
              let billURL = null
              if (fileInput.files[0]) {
                billURL = await handleFileUpload(fileInput.files[0])
              }
              addServiceMutation.mutate({ ...data, billURL })
            }} className="p-6 space-y-6 overflow-y-auto">
              
              {/* Service Details Section Card */}
              <div className="border border-gray-200 rounded-xl overflow-hidden bg-white shadow-sm">
                <div className="bg-gray-50 px-4 py-3 border-b border-gray-100 flex items-center justify-between">
                  <h5 className="text-[11px] font-semibold text-gray-600 uppercase tracking-wider flex items-center gap-2">
                    <Wrench size={12} className="text-gray-400" />
                    Service Details
                  </h5>
                  <span className="text-[10px] font-medium text-gray-400 italic">Required fields</span>
                </div>
                
                <div className="p-4">
                  {/* Two Column Grid */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="col-span-2">
                      <label className="block text-[12px] font-semibold text-gray-700 mb-2">
                        Vehicle
                      </label>
                      <select 
                        name="vehicleId" 
                        required 
                        className="w-full bg-gray-50/50 border border-gray-200 rounded-lg px-4 py-2.5 text-sm focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 focus:bg-white outline-none transition-all appearance-none cursor-pointer"
                      >
                        <option value="">Select Vehicle</option>
                        {vehicles.map(v => <option key={v.id} value={v.id}>{v.name} ({v.vehicleNo})</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="block text-[12px] font-semibold text-gray-700 mb-2">
                        Entry Type
                      </label>
                      <select 
                        name="type" 
                        required 
                        className="w-full bg-gray-50/50 border border-gray-200 rounded-lg px-4 py-2.5 text-sm focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 focus:bg-white outline-none transition-all appearance-none cursor-pointer"
                      >
                        <option value="Regular Service">Regular Service</option>
                        <option value="Complaint">Complaint / Repair</option>
                        <option value="Oil Change">Oil Change</option>
                        <option value="Tire Replacement">Tire Replacement</option>
                        <option value="Battery Replacement">Battery Replacement</option>
                        <option value="Breakdown">Breakdown</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-[12px] font-semibold text-gray-700 mb-2">
                        Service Date
                      </label>
                      <input 
                        type="date" 
                        name="date" 
                        required 
                        className="w-full bg-gray-50/50 border border-gray-200 rounded-lg px-4 py-2.5 text-sm focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 focus:bg-white outline-none transition-all cursor-pointer" 
                      />
                    </div>
                    <div>
                      <label className="block text-[12px] font-semibold text-gray-700 mb-2">
                        Current Mileage (KM)
                      </label>
                      <input 
                        type="number" 
                        name="mileage" 
                        required 
                        placeholder="0"
                        className="w-full bg-gray-50/50 border border-gray-200 rounded-lg px-4 py-2.5 text-sm focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 focus:bg-white outline-none transition-all placeholder:text-gray-400" 
                      />
                    </div>
                    <div>
                      <label className="block text-[12px] font-semibold text-gray-700 mb-2">
                        Next Service Due
                      </label>
                      <input 
                        type="date" 
                        name="nextDueDate" 
                        className="w-full bg-gray-50/50 border border-gray-200 rounded-lg px-4 py-2.5 text-sm focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 focus:bg-white outline-none transition-all cursor-pointer" 
                      />
                    </div>
                    <div className="col-span-2">
                      <label className="block text-[12px] font-semibold text-gray-700 mb-2">
                        Service Location
                      </label>
                      <input 
                        name="location" 
                        required 
                        placeholder="e.g. Bosch Service Center, Downtown"
                        className="w-full bg-gray-50/50 border border-gray-200 rounded-lg px-4 py-2.5 text-sm focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 focus:bg-white outline-none transition-all placeholder:text-gray-400" 
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* Service Description & Cost Section Card */}
              <div className="border border-gray-200 rounded-xl overflow-hidden bg-white shadow-sm">
                <div className="bg-gray-50 px-4 py-3 border-b border-gray-100 flex items-center justify-between">
                  <h5 className="text-[11px] font-semibold text-gray-600 uppercase tracking-wider flex items-center gap-2">
                    <FileText size={12} className="text-gray-400" />
                    Service Description & Cost
                  </h5>
                  <span className="text-[10px] font-medium text-gray-400 italic">Optional</span>
                </div>
                
                <div className="p-4 space-y-6">
                  <div>
                    <label className="block text-[12px] font-semibold text-gray-700 mb-2">
                      Work Description
                    </label>
                    <textarea 
                      name="description"
                      placeholder="Describe the work performed or issue resolved..."
                      rows={3}
                      className="w-full bg-gray-50/50 border border-gray-200 rounded-lg px-4 py-2.5 text-sm focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 focus:bg-white outline-none transition-all min-h-[80px] resize-none placeholder:text-gray-400"
                    />
                  </div>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div>
                      <label className="block text-[12px] font-semibold text-gray-700 mb-2">
                        Total Cost (₹)
                      </label>
                      <input 
                        type="number" 
                        name="cost"
                        placeholder="0.00"
                        className="w-full bg-gray-50/50 border border-gray-200 rounded-lg px-4 py-2.5 text-sm focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 focus:bg-white outline-none transition-all placeholder:text-gray-400" 
                      />
                    </div>
                    <div>
                      <label className="block text-[12px] font-semibold text-gray-700 mb-2">
                        Payment Mode
                      </label>
                      <select 
                        name="paymentMode"
                        className="w-full bg-gray-50/50 border border-gray-200 rounded-lg px-4 py-2.5 text-sm focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 focus:bg-white outline-none transition-all appearance-none cursor-pointer"
                      >
                        <option value="Cash">Cash</option>
                        <option value="Card">Card</option>
                        <option value="UPI">UPI</option>
                        <option value="Bank Transfer">Bank Transfer</option>
                        <option value="Credit">Credit</option>
                      </select>
                    </div>
                  </div>
                </div>
              </div>

              {/* Bill Upload Section - Shadcn-like Card */}
              <div className="border border-gray-200 rounded-xl overflow-hidden bg-white shadow-sm">
                <div className="bg-gray-50 px-4 py-3 border-b border-gray-100 flex items-center justify-between">
                  <h5 className="text-[11px] font-semibold text-gray-600 uppercase tracking-wider flex items-center gap-2">
                    <FileText size={12} className="text-gray-400" />
                    Bill Copy
                  </h5>
                  <span className="text-[10px] font-medium text-gray-400 italic">PDF only, Optional</span>
                </div>
                
                <div className="p-4">
                  <div className="relative">
                    <input 
                      type="file" 
                      accept="application/pdf" 
                      className="w-full text-[11px] text-gray-500 file:mr-4 file:py-2.5 file:px-4 file:rounded-lg file:border-0 file:text-[11px] file:font-medium file:bg-indigo-50 file:text-indigo-600 hover:file:bg-indigo-100 cursor-pointer transition-all" 
                    />
                    {uploading && (
                      <div className="absolute right-4 top-1/2 -translate-y-1/2 flex items-center gap-2 text-[11px] font-medium text-indigo-600">
                        <Spinner size="w-3 h-3" /> Uploading...
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex gap-3 pt-4 border-t border-gray-100">
                <button 
                  type="button" 
                  onClick={() => setShowServiceModal(false)} 
                  className="px-6 py-2.5 border border-gray-200 text-gray-600 rounded-lg text-sm font-medium hover:bg-gray-50 transition-colors"
                >
                  Cancel
                </button>
                <button 
                  type="submit" 
                  disabled={addServiceMutation.isPending || uploading} 
                  className="flex-1 px-6 py-2.5 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 transition-all shadow-sm shadow-indigo-100 active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {addServiceMutation.isPending || uploading ? 'Saving...' : 'Record Maintenance'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* History Log Modal */}
      {selectedVehicleForHistory && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center overflow-auto py-8">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg mx-4 max-h-[85vh] overflow-hidden flex flex-col">
            <div className="bg-indigo-600 px-6 py-4 flex justify-between items-center shrink-0">
              <div>
                <h3 className="text-white font-semibold text-[13px]">Change History</h3>
                <p className="text-[10px] text-indigo-200 mt-0.5">{selectedVehicleForHistory.name} - {selectedVehicleForHistory.vehicleNo}</p>
              </div>
              <button onClick={() => setSelectedVehicleForHistory(null)} className="text-white/80 hover:text-white">
                <X size={18} />
              </button>
            </div>
            
            <div className="flex-1 overflow-y-auto p-6 space-y-4">
              <div className="p-3 bg-gray-50 rounded-lg border border-gray-100">
                <p className="text-[11px] font-semibold text-gray-500 mb-1">Registration Record</p>
                <div className="flex justify-between items-center">
                  <span className="text-xs font-medium text-gray-700">Initialized in system</span>
                  <span className="text-[11px] text-gray-400">
                    {selectedVehicleForHistory.createdAt?.toDate ? selectedVehicleForHistory.createdAt.toDate().toLocaleDateString() : '—'}
                  </span>
                </div>
              </div>
              
              {loadingHistory ? (
                <div className="py-10 text-center"><Spinner /></div>
              ) : historyLogs.length === 0 ? (
                <p className="text-[11px] text-gray-400 text-center py-10 italic">No insurance or RC updates recorded yet.</p>
              ) : (
                historyLogs.map(log => (
                  <div key={log.id} className="p-3 bg-gray-50 rounded-lg border border-gray-100 flex flex-col gap-1.5">
                    <div className="flex justify-between items-start">
                      <span className="text-[11px] font-semibold text-indigo-600">{log.field} Update</span>
                      <span className="text-[10px] text-gray-400">{log.timestamp?.toDate ? log.timestamp.toDate().toLocaleDateString() : 'Just now'}</span>
                    </div>
                    <div className="flex items-center gap-2 text-xs">
                      <span className="text-gray-400 line-through">{log.oldValue}</span>
                      <span className="text-gray-300">→</span>
                      <span className="font-medium text-gray-700">{log.newValue}</span>
                    </div>
                    <p className="text-[10px] text-gray-400 mt-0.5">Updated by: {log.updatedBy}</p>
                  </div>
                ))
              )}
            </div>
            
            <div className="p-4 border-t border-gray-100 bg-gray-50 flex justify-end">
              <button 
                onClick={() => setSelectedVehicleForHistory(null)} 
                className="px-6 py-2 bg-gray-900 text-white text-sm font-medium rounded-lg hover:bg-gray-800 transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
