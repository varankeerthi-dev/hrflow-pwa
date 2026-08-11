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
import { SubTabsNav } from '../ui/SubTabsNav'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage'
import { storage } from '../../lib/firebase'
import VehicleMileageTab from './VehicleMileageTab'

function getInitials(name) {
  return name?.split(' ').map(n => n[0]).join('').toUpperCase() || '??'
}

export default function VehicleManagementTab({ initialSubTab = 'mileage-tracker' }) {
  const { user } = useAuth()
  const { employees } = useEmployees(user?.orgId)
  const queryClient = useQueryClient()
  const [activeSubTab, setActiveSubTab] = useState(initialSubTab)

  React.useEffect(() => {
    if (initialSubTab) setActiveSubTab(initialSubTab)
  }, [initialSubTab])
  
  // Modals
  const [showAddVehicle, setShowAddVehicle] = useState(false)
  const [editingVehicle, setEditingVehicle] = useState(null)
  const [showServiceModal, setShowServiceModal] = useState(false)
  const [selectedVehicleForHistory, setSelectedVehicleForHistory] = useState(null)
  const [rcDocUrl, setRcDocUrl] = useState('')
  const [insuranceDocUrl, setInsuranceDocUrl] = useState('')
  const [uploadingRc, setUploadingRc] = useState(false)
  const [uploadingInsurance, setUploadingInsurance] = useState(false)
  const [uploading, setUploading] = useState(false)

  React.useEffect(() => {
    if (editingVehicle) {
      setRcDocUrl(editingVehicle.rcDocUrl || '')
      setInsuranceDocUrl(editingVehicle.insuranceDocUrl || '')
    } else {
      setRcDocUrl('')
      setInsuranceDocUrl('')
    }
  }, [editingVehicle, showAddVehicle])

  const handleDocumentUpload = async (file, type, setUrl, setUploadingState) => {
    if (!file || !user?.orgId) return
    setUploadingState(true)
    try {
      const storageRef = ref(storage, `organisations/${user.orgId}/vehicles/${type}_${Date.now()}_${file.name}`)
      await uploadBytes(storageRef, file)
      const url = await getDownloadURL(storageRef)
      setUrl(url)
    } catch (err) {
      console.error('File upload error:', err)
      alert('File upload failed. Please try again.')
    } finally {
      setUploadingState(false)
    }
  }

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
      return snap.docs.map(d => {
        const raw = d.data()
        const cleanVehicleNo = raw.vehicleNo ? String(raw.vehicleNo).toUpperCase().replace(/[^A-Z0-9]/g, '') : ''
        const cleanRcNo = raw.rcNo ? String(raw.rcNo).toUpperCase().replace(/[^A-Z0-9]/g, '') : ''
        
        // Auto-sanitize existing database records in Firestore if they contain symbols, spaces, or lowercase letters
        if ((raw.vehicleNo && raw.vehicleNo !== cleanVehicleNo) || (raw.rcNo && raw.rcNo !== cleanRcNo)) {
          updateDoc(doc(db, 'organisations', user.orgId, 'vehicles', d.id), {
            vehicleNo: cleanVehicleNo,
            rcNo: cleanRcNo
          }).catch(err => console.error('Auto-sanitize vehicle doc error:', err))
        }

        return {
          id: d.id,
          ...raw,
          vehicleNo: cleanVehicleNo,
          rcNo: cleanRcNo
        }
      })
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

  const { data: allMileageLogs = [] } = useQuery({
    queryKey: ['vehicle_mileage_all', user?.orgId],
    queryFn: async () => {
      if (!user?.orgId) return []
      const q = query(collection(db, 'organisations', user.orgId, 'vehicle_mileage'))
      const snap = await getDocs(q)
      return snap.docs.map(d => ({ id: d.id, ...d.data() }))
    },
    enabled: !!user?.orgId
  })

  const getMaintenanceStatus = (vehicle, mileageLogs, serviceLogs) => {
    const vNoClean = vehicle.vehicleNo ? String(vehicle.vehicleNo).toUpperCase().replace(/[^A-Z0-9]/g, '') : ''
    const vLogs = mileageLogs.filter(m => {
      const mInfo = m.vehicle_info || m.vehicle_number || ''
      const mClean = String(mInfo).toUpperCase().replace(/[^A-Z0-9]/g, '')
      return (m.vehicleId === vehicle.id) || (vNoClean && mClean.includes(vNoClean))
    })

    let maxEndKm = 0
    vLogs.forEach(m => {
      const endKm = Number(m.end_kilometer) || 0
      if (endKm > maxEndKm) maxEndKm = endKm
    })

    const vServices = serviceLogs.filter(s => s.vehicleId === vehicle.id)
    let lastServiceKm = Number(vehicle.initialKm) || 0
    vServices.forEach(s => {
      const sKm = Number(s.odometerReading) || Number(s.kilometer) || Number(s.serviceKm) || 0
      if (sKm > lastServiceKm) lastServiceKm = sKm
    })

    const kmSinceService = maxEndKm > lastServiceKm ? (maxEndKm - lastServiceKm) : (maxEndKm % 2000)
    const interval = 2000
    const isOverdue = kmSinceService >= interval
    const isWarning = kmSinceService >= (interval - 300)
    const kmRemaining = Math.max(0, interval - kmSinceService)
    const kmOverdue = isOverdue ? (kmSinceService - interval) : 0

    return {
      maxEndKm,
      lastServiceKm,
      kmSinceService,
      isOverdue,
      isWarning,
      kmRemaining,
      kmOverdue
    }
  }

  // Mutations
  const addVehicleMutation = useMutation({
    mutationFn: async (data) => {
      const cleanData = {
        ...data,
        vehicleNo: data.vehicleNo ? String(data.vehicleNo).toUpperCase().replace(/[^A-Z0-9]/g, '') : '',
        rcNo: data.rcNo ? String(data.rcNo).toUpperCase().replace(/[^A-Z0-9]/g, '') : '',
        createdAt: serverTimestamp(),
        createdBy: user.uid
      }
      await addDoc(collection(db, 'organisations', user.orgId, 'vehicles'), cleanData)
    },
    onSuccess: () => {
      queryClient.invalidateQueries(['vehicles'])
      setShowAddVehicle(false)
    }
  })

  const updateVehicleMutation = useMutation({
    mutationFn: async ({ id, data, historyEntry }) => {
      const vRef = doc(db, 'organisations', user.orgId, 'vehicles', id)
      const cleanData = {
        ...data,
        vehicleNo: data.vehicleNo ? String(data.vehicleNo).toUpperCase().replace(/[^A-Z0-9]/g, '') : '',
        rcNo: data.rcNo ? String(data.rcNo).toUpperCase().replace(/[^A-Z0-9]/g, '') : '',
        updatedAt: serverTimestamp()
      }
      // Log history
      if (historyEntry) {
        await addDoc(collection(db, 'organisations', user.orgId, 'vehicles', id, 'history'), {
          ...historyEntry,
          timestamp: serverTimestamp()
        })
      }
      await updateDoc(vRef, cleanData)
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


      <SubTabsNav
        tabs={[
          { id: 'mileage-tracker', label: 'Mileage Tracker' },
          { id: 'all-vehicles', label: 'Vehicle list' },
          { id: 'service-complaints', label: 'Maintenance' }
        ]}
        activeTabId={activeSubTab}
        onTabChange={(tab) => setActiveSubTab(tab.id)}
      />

      {activeSubTab === 'mileage-tracker' ? (
        <VehicleMileageTab />
      ) : (
        <>
          <div className="flex items-center gap-3 px-6 py-2 border-b border-gray-200">
            <div className="flex gap-2">
              <div className="px-3 py-1.5 bg-gray-50 border border-gray-200 rounded-md">
                <span className="text-xs text-gray-600">{vehicles.length} Assets</span>
              </div>
              <div className="px-3 py-1.5 bg-rose-50 border border-rose-200 rounded-md">
                <span className="text-xs text-rose-600">{vehicles.filter(v => isExpired(v.insuranceExpiry)).length} Expired</span>
              </div>
              <div className="px-3 py-1.5 bg-amber-50 border border-amber-200 rounded-md">
                <span className="text-xs font-semibold text-amber-700">
                  {vehicles.filter(v => getMaintenanceStatus(v, allMileageLogs, services).isOverdue).length} Maintenance Due (2,000 KM)
                </span>
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
            <div className="hidden md:block rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full caption-bottom text-sm border-collapse">
                  <thead className="border-b border-gray-200 bg-gray-50/80">
                    <tr>
                      <th className="h-11 px-4 text-left align-middle text-xs font-semibold text-gray-500 uppercase tracking-wider">Vehicle</th>
                      <th className="h-11 px-4 text-left align-middle text-xs font-semibold text-gray-500 uppercase tracking-wider">Registration</th>
                      <th className="h-11 px-4 text-left align-middle text-xs font-semibold text-gray-500 uppercase tracking-wider">RC Number</th>
                      <th className="h-11 px-4 text-left align-middle text-xs font-semibold text-gray-500 uppercase tracking-wider">Insurance Status</th>
                      <th className="h-11 px-4 text-left align-middle text-xs font-semibold text-gray-500 uppercase tracking-wider">Maintenance Due (2,000 KM Rule)</th>
                      <th className="h-11 px-4 text-left align-middle text-xs font-semibold text-gray-500 uppercase tracking-wider">Unit Lead</th>
                      <th className="h-11 px-4 text-right align-middle text-xs font-semibold text-gray-500 uppercase tracking-wider">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="[&_tr:last-child]:border-0">
                    {loadingVehicles ? (
                      <tr><td colSpan={7} className="py-20 text-center"><Spinner size="w-8 h-8" color="text-gray-400" /></td></tr>
                    ) : filteredVehicles.length === 0 ? (
                      <tr><td colSpan={7} className="py-20 text-center text-gray-400 font-medium">No vehicles found</td></tr>
                    ) : filteredVehicles.map(v => (
                      <tr key={v.id} className="border-b border-gray-100 hover:bg-gray-50/80 transition-colors">
                        <td className="px-4 py-3 align-middle">
                          <div className="flex items-center gap-3">
                            <div className="w-8 h-8 bg-indigo-50 rounded-lg flex items-center justify-center">
                              <Car size={14} className="text-indigo-600" />
                            </div>
                            <div>
                              <p className="text-sm font-medium text-gray-900">{v.name}</p>
                              <p className="text-[10px] text-gray-400">{v.manufacturer || 'Fleet Vehicle'}</p>
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3 align-middle">
                          <span className="text-sm font-medium text-gray-700">{v.vehicleNo}</span>
                        </td>
                        <td className="px-4 py-3 align-middle">
                          <div className="flex flex-col gap-1">
                            <span className="text-sm font-medium text-gray-700">{v.rcNo || '—'}</span>
                            {v.rcDocUrl && (
                              <a 
                                href={v.rcDocUrl} 
                                target="_blank" 
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-1 text-[11px] font-medium text-blue-600 hover:text-blue-800 hover:underline"
                              >
                                📄 RC Doc <ExternalLink size={10} />
                              </a>
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-3 align-middle">
                          <div className="flex flex-col gap-0.5">
                            <div className="flex items-center gap-2">
                              <span className={`inline-flex w-fit px-2.5 py-0.5 rounded-md text-[11px] font-semibold ${
                                isExpired(v.insuranceExpiry) 
                                  ? 'bg-rose-50 text-rose-600' 
                                  : 'bg-emerald-50 text-emerald-600'
                              }`}>
                                {isExpired(v.insuranceExpiry) ? 'Expired' : 'Active'}
                              </span>
                              <span className="text-[11px] text-gray-500 font-medium">
                                {v.insuranceExpiry ? new Date(v.insuranceExpiry).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'}
                              </span>
                            </div>
                            {v.insurerName && (
                              <p className="text-[11px] font-medium text-gray-700 mt-0.5 truncate max-w-[180px]" title={v.insurerName}>
                                🏦 {v.insurerName}
                              </p>
                            )}
                            {v.insurerContactPerson && (
                              <p className="text-[10px] text-gray-400 truncate max-w-[180px]" title={v.insurerContactPerson}>
                                👤 {v.insurerContactPerson}
                              </p>
                            )}
                            {v.insuranceDocUrl && (
                              <a 
                                href={v.insuranceDocUrl} 
                                target="_blank" 
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-1 text-[11px] font-medium text-blue-600 hover:text-blue-800 hover:underline mt-0.5"
                              >
                                🛡️ Policy Doc <ExternalLink size={10} />
                              </a>
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-3 align-middle whitespace-nowrap">
                          {(() => {
                            const status = getMaintenanceStatus(v, allMileageLogs, services)
                            if (status.isOverdue) {
                              return (
                                <div className="flex flex-col gap-0.5">
                                  <span className="inline-flex items-center gap-1.5 w-fit px-2.5 py-1 rounded-md text-xs font-bold bg-rose-100 text-rose-700 animate-pulse">
                                    <AlertTriangle size={12} /> Overdue ({status.kmSinceService.toLocaleString()} / 2,000 km)
                                  </span>
                                  <span className="text-[10px] font-semibold text-rose-600">
                                    {status.kmOverdue > 0 ? `+${status.kmOverdue.toLocaleString()} km past 2,000 km limit` : 'Maintenance Required Now'}
                                  </span>
                                </div>
                              )
                            }
                            if (status.isWarning) {
                              return (
                                <div className="flex flex-col gap-0.5">
                                  <span className="inline-flex items-center gap-1.5 w-fit px-2.5 py-1 rounded-md text-xs font-bold bg-amber-100 text-amber-700">
                                    <Clock size={12} /> Due Soon ({status.kmSinceService.toLocaleString()} / 2,000 km)
                                  </span>
                                  <span className="text-[10px] text-amber-600 font-medium">
                                    {status.kmRemaining.toLocaleString()} km remaining
                                  </span>
                                </div>
                              )
                            }
                            return (
                              <div className="flex flex-col gap-0.5">
                                <span className="inline-flex items-center gap-1.5 w-fit px-2.5 py-1 rounded-md text-xs font-medium bg-emerald-50 text-emerald-700 border border-emerald-200/60">
                                  <CheckCircle2 size={12} /> OK ({status.kmSinceService.toLocaleString()} / 2,000 km)
                                </span>
                                <span className="text-[10px] text-slate-400 font-mono">
                                  Next due in {status.kmRemaining.toLocaleString()} km
                                </span>
                              </div>
                            )
                          })()}
                        </td>
                        <td className="px-4 py-3 align-middle">
                          <div className="flex items-center gap-2">
                            <div className="w-7 h-7 bg-gray-100 rounded-full flex items-center justify-center text-[10px] font-bold text-gray-600">
                              {getInitials(employees.find(e => e.id === v.inchargeId)?.name || '??')}
                            </div>
                            <span className="text-sm font-medium text-gray-700">
                              {employees.find(e => e.id === v.inchargeId)?.name || 'Unassigned'}
                            </span>
                          </div>
                        </td>
                        <td className="px-4 py-3 align-middle text-right">
                          <div className="flex items-center justify-end gap-2">
                            <button 
                              onClick={() => setSelectedVehicleForHistory(v)}
                              className="h-8 px-3 bg-gray-100 text-gray-600 text-xs font-medium rounded-lg hover:bg-gray-200 transition-colors flex items-center gap-1.5"
                            >
                              <History size={14} /> History
                            </button>
                            <button 
                              onClick={() => setEditingVehicle(v)}
                              className="h-8 px-3 bg-indigo-50 text-indigo-600 text-xs font-medium rounded-lg hover:bg-indigo-100 transition-colors flex items-center gap-1.5"
                            >
                              <Edit2 size={14} /> Edit
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
            <div className="md:hidden space-y-4">
              {loadingVehicles ? (
                <div className="py-12 text-center">
                  <Spinner size="w-10 h-10" color="text-gray-400" />
                  <p className="text-gray-400 text-sm mt-3">Loading vehicles...</p>
                </div>
              ) : filteredVehicles.length === 0 ? (
                <div className="py-16 text-center border-2 border-dashed border-gray-200 rounded-xl bg-gray-50/50">
                  <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-3">
                    <Car size={28} className="text-gray-300" />
                  </div>
                  <p className="text-gray-400 text-sm font-medium">No vehicles found</p>
                  <p className="text-gray-300 text-xs mt-1">Add a vehicle to get started</p>
                </div>
              ) : filteredVehicles.map(v => (
                <div key={v.id} className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden active:scale-[0.98] transition-transform">
                  {/* Card Header */}
                  <div className="px-4 py-3 bg-gradient-to-r from-gray-50 to-white border-b border-gray-100 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 bg-indigo-100 rounded-lg flex items-center justify-center">
                        <Car size={20} className="text-indigo-600" />
                      </div>
                      <div>
                        <h3 className="text-sm font-semibold text-gray-900">{v.name}</h3>
                        <p className="text-xs text-gray-400">{v.manufacturer || 'Fleet Vehicle'}</p>
                      </div>
                    </div>
                    <span className={`inline-flex px-2.5 py-1 rounded-full text-xs font-medium ${isExpired(v.insuranceExpiry) ? 'bg-rose-100 text-rose-700' : 'bg-emerald-100 text-emerald-700'}`}>
                      {isExpired(v.insuranceExpiry) ? 'Expired' : 'Active'}
                    </span>
                  </div>
                  
                  {/* Card Body */}
                  <div className="p-4 space-y-3">
                    {/* Vehicle Number */}
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Hash size={14} className="text-gray-400" />
                        <span className="text-xs text-gray-500">Registration</span>
                      </div>
                      <span className="text-sm font-semibold text-gray-700">{v.vehicleNo}</span>
                    </div>
                    
                    {/* RC Number */}
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <FileText size={14} className="text-gray-400" />
                        <span className="text-xs text-gray-500">RC Number</span>
                      </div>
                      <span className="text-sm font-medium text-gray-600">{v.rcNo || '—'}</span>
                    </div>
                    
                    {/* Insurance Expiry */}
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Calendar size={14} className="text-gray-400" />
                        <span className="text-xs text-gray-500">Insurance Until</span>
                      </div>
                      <span className={`text-sm font-medium ${isExpired(v.insuranceExpiry) ? 'text-rose-600' : 'text-emerald-600'}`}>
                        {v.insuranceExpiry ? new Date(v.insuranceExpiry).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'}
                      </span>
                    </div>
                    
                    {/* Unit Lead */}
                    <div className="flex items-center justify-between pt-2 border-t border-gray-100">
                      <div className="flex items-center gap-2">
                        <div className="w-7 h-7 bg-gray-100 rounded-full flex items-center justify-center text-[10px] font-bold text-gray-600">
                          {getInitials(employees.find(e => e.id === v.inchargeId)?.name || '??')}
                        </div>
                        <span className="text-xs text-gray-500">Unit Lead</span>
                      </div>
                      <span className="text-sm font-medium text-gray-700">
                        {employees.find(e => e.id === v.inchargeId)?.name || 'Unassigned'}
                      </span>
                    </div>
                  </div>
                  
                  {/* Card Actions */}
                  <div className="px-4 py-3 bg-gray-50 border-t border-gray-100 flex gap-2">
                    <button 
                      onClick={() => setSelectedVehicleForHistory(v)}
                      className="flex-1 flex items-center justify-center gap-2 h-11 text-sm font-medium text-gray-600 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 active:bg-gray-100 transition-colors"
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

      {/* Add/Edit Vehicle Asset Modal — Refactored to PipePro Design System */}
      {(showAddVehicle || editingVehicle) && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center overflow-auto p-4 sm:p-6 animate-in fade-in-0 duration-200">
          <div className="bg-white text-slate-900 rounded-2xl border border-slate-200 shadow-2xl w-full max-w-3xl max-h-[90vh] overflow-hidden flex flex-col animate-in zoom-in-95 duration-200">
            {/* Modal Header */}
            <div className="bg-white px-6 py-4 border-b border-slate-200 flex justify-between items-center shrink-0">
              <div>
                <h3 className="text-lg font-bold text-slate-900 font-heading tracking-tight">
                  {editingVehicle ? 'Edit Asset' : 'Add New Asset'}
                </h3>
                <p className="text-xs text-slate-500 mt-0.5 font-normal">Fleet Asset Management</p>
              </div>
              <button 
                type="button"
                onClick={() => { setShowAddVehicle(false); setEditingVehicle(null); }} 
                className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
                title="Close"
              >
                <X size={18} />
              </button>
            </div>
            
            <form onSubmit={e => {
              e.preventDefault()
              const formData = new FormData(e.target)
              const data = Object.fromEntries(formData.entries())
              data.rcDocUrl = rcDocUrl
              data.insuranceDocUrl = insuranceDocUrl
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
            }} className="p-6 space-y-6 overflow-y-auto bg-white">
              
              {/* Vehicle Information Section Card */}
              <div className="border border-slate-200 rounded-xl overflow-hidden bg-white shadow-2xs">
                <div className="bg-slate-50 px-4 py-2.5 border-b border-slate-200 flex items-center justify-between">
                  <h5 className="text-xs font-bold text-slate-900 font-heading uppercase tracking-wider flex items-center gap-2">
                    <Car size={14} className="text-blue-600" />
                    Vehicle Information
                  </h5>
                  <span className="text-[11px] font-medium text-slate-400 italic">Required fields</span>
                </div>
                
                <div className="p-4 space-y-4 bg-white">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-slate-800 mb-1.5 font-body">
                        Vehicle Name <span className="text-rose-500">*</span>
                      </label>
                      <input 
                        name="name" 
                        defaultValue={editingVehicle?.name} 
                        required 
                        placeholder="e.g. Toyota Corolla"
                        className="h-9 w-full rounded-md border border-slate-200 bg-white px-3 py-1 text-sm shadow-2xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-blue-600 placeholder:text-slate-400 text-slate-800" 
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-800 mb-1.5 font-body">
                        Vehicle Number <span className="text-rose-500">*</span>
                      </label>
                      <input 
                        name="vehicleNo" 
                        defaultValue={editingVehicle?.vehicleNo} 
                        required 
                        placeholder="e.g. MH12AB1234"
                        onChange={(e) => { e.target.value = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '') }}
                        className="h-9 w-full rounded-md border border-slate-200 bg-white px-3 py-1 text-sm shadow-2xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-blue-600 placeholder:text-slate-400 uppercase font-mono tracking-wider text-slate-800" 
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-800 mb-1.5 font-body">
                        Purchase Date <span className="text-rose-500">*</span>
                      </label>
                      <input 
                        type="date" 
                        name="purchaseDate" 
                        defaultValue={editingVehicle?.purchaseDate} 
                        required 
                        className="h-9 w-full rounded-md border border-slate-200 bg-white px-3 py-1 text-sm shadow-2xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-blue-600 cursor-pointer text-slate-800" 
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-800 mb-1.5 font-body">
                        RC Number <span className="text-rose-500">*</span>
                      </label>
                      <input 
                        name="rcNo" 
                        defaultValue={editingVehicle?.rcNo} 
                        required 
                        placeholder="RC123456789"
                        onChange={(e) => { e.target.value = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '') }}
                        className="h-9 w-full rounded-md border border-slate-200 bg-white px-3 py-1 text-sm shadow-2xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-blue-600 placeholder:text-slate-400 uppercase font-mono tracking-wider text-slate-800" 
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* Insurance & Assignment Section Card */}
              <div className="border border-slate-200 rounded-xl overflow-hidden bg-white shadow-2xs">
                <div className="bg-slate-50 px-4 py-2.5 border-b border-slate-200 flex items-center justify-between">
                  <h5 className="text-xs font-bold text-slate-900 font-heading uppercase tracking-wider flex items-center gap-2">
                    <CheckCircle2 size={14} className="text-blue-600" />
                    Insurance & Assignment
                  </h5>
                  <span className="text-[11px] font-medium text-slate-400 italic">Required & Optional Details</span>
                </div>
                
                <div className="p-4 grid grid-cols-1 md:grid-cols-2 gap-4 bg-white">
                  <div>
                    <label className="block text-sm font-medium text-slate-800 mb-1.5 font-body">
                      Insurance Valid Till <span className="text-rose-500">*</span>
                    </label>
                    <input 
                      type="date" 
                      name="insuranceExpiry" 
                      defaultValue={editingVehicle?.insuranceExpiry} 
                      required 
                      className="h-9 w-full rounded-md border border-slate-200 bg-white px-3 py-1 text-sm shadow-2xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-blue-600 cursor-pointer text-slate-800" 
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-800 mb-1.5 font-body">
                      Assign Incharge <span className="text-rose-500">*</span>
                    </label>
                    <select 
                      name="inchargeId" 
                      defaultValue={editingVehicle?.inchargeId} 
                      required 
                      className="h-9 w-full rounded-md border border-slate-200 bg-white px-3 py-1 text-sm shadow-2xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-blue-600 cursor-pointer text-slate-800"
                    >
                      <option value="">Select Employee</option>
                      {employees.map(emp => <option key={emp.id} value={emp.id}>{emp.name}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-800 mb-1.5 font-body">
                      Insurer Name
                    </label>
                    <input 
                      name="insurerName" 
                      defaultValue={editingVehicle?.insurerName} 
                      placeholder="e.g. HDFC ERGO General Insurance"
                      className="h-9 w-full rounded-md border border-slate-200 bg-white px-3 py-1 text-sm shadow-2xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-blue-600 placeholder:text-slate-400 text-slate-800" 
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-800 mb-1.5 font-body">
                      Insurer Contact Person / Phone
                    </label>
                    <input 
                      name="insurerContactPerson" 
                      defaultValue={editingVehicle?.insurerContactPerson} 
                      placeholder="e.g. John Doe (9876543210)"
                      className="h-9 w-full rounded-md border border-slate-200 bg-white px-3 py-1 text-sm shadow-2xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-blue-600 placeholder:text-slate-400 text-slate-800" 
                    />
                  </div>
                </div>
              </div>

              {/* Document Uploads (RC & Insurance) Section Card */}
              <div className="border border-slate-200 rounded-xl overflow-hidden bg-white shadow-2xs">
                <div className="bg-slate-50 px-4 py-2.5 border-b border-slate-200 flex items-center justify-between">
                  <h5 className="text-xs font-bold text-slate-900 font-heading uppercase tracking-wider flex items-center gap-2">
                    <FileText size={14} className="text-blue-600" />
                    Asset Documents (RC & Insurance)
                  </h5>
                  <span className="text-[11px] font-medium text-slate-400 italic">PDF or Images</span>
                </div>

                <div className="p-4 grid grid-cols-1 md:grid-cols-2 gap-4 bg-white">
                  {/* RC Document */}
                  <div>
                    <label className="block text-sm font-medium text-slate-800 mb-1.5 font-body">
                      RC Document (Registration)
                    </label>
                    {rcDocUrl ? (
                      <div className="flex items-center justify-between p-2.5 bg-blue-50/50 border border-blue-200 rounded-md">
                        <a 
                          href={rcDocUrl} 
                          target="_blank" 
                          rel="noopener noreferrer" 
                          className="text-xs font-medium text-blue-700 hover:underline flex items-center gap-1.5 truncate"
                        >
                          📄 View RC Document <ExternalLink size={12} />
                        </a>
                        <button 
                          type="button" 
                          onClick={() => setRcDocUrl('')} 
                          className="text-xs text-rose-600 hover:text-rose-800 font-medium px-2 py-0.5"
                        >
                          Remove
                        </button>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2">
                        <input 
                          type="file" 
                          accept="image/*,.pdf" 
                          onChange={(e) => handleDocumentUpload(e.target.files[0], 'rc', setRcDocUrl, setUploadingRc)} 
                          className="text-xs text-slate-500 file:mr-3 file:py-1.5 file:px-3 file:rounded-md file:border-0 file:text-xs file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100 cursor-pointer"
                        />
                        {uploadingRc && <Spinner size="w-4 h-4" color="text-blue-600" />}
                      </div>
                    )}
                  </div>

                  {/* Insurance Document */}
                  <div>
                    <label className="block text-sm font-medium text-slate-800 mb-1.5 font-body">
                      Insurance Policy Document
                    </label>
                    {insuranceDocUrl ? (
                      <div className="flex items-center justify-between p-2.5 bg-blue-50/50 border border-blue-200 rounded-md">
                        <a 
                          href={insuranceDocUrl} 
                          target="_blank" 
                          rel="noopener noreferrer" 
                          className="text-xs font-medium text-blue-700 hover:underline flex items-center gap-1.5 truncate"
                        >
                          🛡️ View Insurance Policy <ExternalLink size={12} />
                        </a>
                        <button 
                          type="button" 
                          onClick={() => setInsuranceDocUrl('')} 
                          className="text-xs text-rose-600 hover:text-rose-800 font-medium px-2 py-0.5"
                        >
                          Remove
                        </button>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2">
                        <input 
                          type="file" 
                          accept="image/*,.pdf" 
                          onChange={(e) => handleDocumentUpload(e.target.files[0], 'insurance', setInsuranceDocUrl, setUploadingInsurance)} 
                          className="text-xs text-slate-500 file:mr-3 file:py-1.5 file:px-3 file:rounded-md file:border-0 file:text-xs file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100 cursor-pointer"
                        />
                        {uploadingInsurance && <Spinner size="w-4 h-4" color="text-blue-600" />}
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Additional Details Section (Optional) */}
              <div className="border border-slate-200 rounded-xl overflow-hidden bg-white shadow-2xs">
                <div className="bg-slate-50 px-4 py-2.5 border-b border-slate-200 flex items-center justify-between">
                  <h5 className="text-xs font-bold text-slate-900 font-heading uppercase tracking-wider flex items-center gap-2">
                    <Settings size={14} className="text-blue-600" />
                    Additional Details
                  </h5>
                  <span className="text-[11px] font-medium text-slate-400 italic">Optional</span>
                </div>
                
                <div className="p-4 grid grid-cols-1 md:grid-cols-2 gap-4 bg-white">
                  <div>
                    <label className="block text-sm font-medium text-slate-800 mb-1.5 font-body">
                      Manufacturer
                    </label>
                    <input 
                      name="manufacturer" 
                      defaultValue={editingVehicle?.manufacturer} 
                      placeholder="e.g. Toyota"
                      className="h-9 w-full rounded-md border border-slate-200 bg-white px-3 py-1 text-sm shadow-2xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-blue-600 placeholder:text-slate-400 text-slate-800" 
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-800 mb-1.5 font-body">
                      Model Year
                    </label>
                    <input 
                      name="modelYear" 
                      type="number"
                      defaultValue={editingVehicle?.modelYear} 
                      placeholder="e.g. 2023"
                      className="h-9 w-full rounded-md border border-slate-200 bg-white px-3 py-1 text-sm shadow-2xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-blue-600 placeholder:text-slate-400 text-slate-800" 
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-800 mb-1.5 font-body">
                      Fuel Type
                    </label>
                    <select 
                      name="fuelType" 
                      defaultValue={editingVehicle?.fuelType || 'Petrol'}
                      className="h-9 w-full rounded-md border border-slate-200 bg-white px-3 py-1 text-sm shadow-2xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-blue-600 cursor-pointer text-slate-800"
                    >
                      <option value="Petrol">Petrol</option>
                      <option value="Diesel">Diesel</option>
                      <option value="CNG">CNG</option>
                      <option value="Electric">Electric</option>
                      <option value="Hybrid">Hybrid</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-800 mb-1.5 font-body">
                      Seating Capacity
                    </label>
                    <input 
                      name="seatingCapacity" 
                      type="number"
                      defaultValue={editingVehicle?.seatingCapacity} 
                      placeholder="e.g. 5"
                      className="h-9 w-full rounded-md border border-slate-200 bg-white px-3 py-1 text-sm shadow-2xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-blue-600 placeholder:text-slate-400 text-slate-800" 
                    />
                  </div>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-200 bg-white">
                <button 
                  type="button" 
                  onClick={() => { setShowAddVehicle(false); setEditingVehicle(null); }} 
                  className="h-9 px-4 border border-slate-200 bg-white text-slate-700 text-sm font-medium rounded-md hover:bg-slate-50 transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button 
                  type="submit" 
                  disabled={addVehicleMutation.isPending || updateVehicleMutation.isPending} 
                  className="h-9 px-6 bg-blue-600 hover:bg-blue-700 text-white rounded-md text-sm font-bold transition-all shadow-sm active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed font-heading cursor-pointer"
                >
                  {addVehicleMutation.isPending || updateVehicleMutation.isPending ? 'Saving...' : (editingVehicle ? 'Update Asset' : 'Add Asset')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      </>
      )}

      {/* Service & Complaint Modal — PipePro Design System */}
      {showServiceModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center overflow-auto p-4 sm:p-6 animate-in fade-in-0 duration-200">
          <div className="bg-white text-slate-900 rounded-2xl border border-slate-200 shadow-2xl w-full max-w-3xl max-h-[90vh] overflow-hidden flex flex-col animate-in zoom-in-95 duration-200">
            
            {/* Modal Header */}
            <div className="bg-white px-6 py-4 border-b border-slate-200 flex justify-between items-center shrink-0">
              <div>
                <h3 className="text-lg font-bold text-slate-900 font-heading tracking-tight flex items-center gap-2">
                  <Wrench className="text-blue-600" size={20} /> Log Maintenance & Repair
                </h3>
                <p className="text-xs text-slate-500 mt-0.5 font-body">Record vehicle service, component failures, breakdowns, or scheduled maintenance</p>
              </div>
              <button 
                type="button"
                onClick={() => setShowServiceModal(false)} 
                className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
                title="Close Modal"
              >
                <X size={18} />
              </button>
            </div>
            
            <form onSubmit={async e => {
              e.preventDefault()
              const formData = new FormData(e.target)
              const data = Object.fromEntries(formData.entries())
              const fileInput = e.target.querySelector('input[type="file"]')
              let billURL = null
              if (fileInput?.files[0]) {
                setUploading(true)
                try {
                  billURL = await handleFileUpload(fileInput.files[0])
                } catch (err) {
                  console.error('File upload failed:', err)
                } finally {
                  setUploading(false)
                }
              }
              addServiceMutation.mutate({ ...data, billURL })
            }} className="p-6 space-y-6 overflow-y-auto bg-white">
              
              {/* Service Details Section Card */}
              <div className="border border-slate-200 rounded-xl overflow-hidden bg-white shadow-2xs">
                <div className="bg-slate-50 px-4 py-2.5 border-b border-slate-200 flex items-center justify-between">
                  <h5 className="text-xs font-bold text-slate-900 font-heading uppercase tracking-wider flex items-center gap-2">
                    <Wrench size={14} className="text-blue-600" />
                    Service & Vehicle Details
                  </h5>
                  <span className="text-[11px] font-medium text-rose-500">* Required</span>
                </div>
                
                <div className="p-5">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                    <div className="col-span-2">
                      <label className="block text-sm font-medium text-slate-800 mb-1.5 font-body">
                        Select Asset / Vehicle <span className="text-rose-500">*</span>
                      </label>
                      <select 
                        name="vehicleId" 
                        required 
                        className="h-9 w-full rounded-md border border-slate-200 bg-white px-3 py-1 text-sm shadow-2xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-blue-600 text-slate-800 font-body cursor-pointer"
                      >
                        <option value="">-- Choose Fleet Vehicle --</option>
                        {vehicles.map(v => <option key={v.id} value={v.id}>{v.name} ({v.vehicleNo})</option>)}
                      </select>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-slate-800 mb-1.5 font-body">
                        Maintenance Type / Issue <span className="text-rose-500">*</span>
                      </label>
                      <select 
                        name="type" 
                        required 
                        className="h-9 w-full rounded-md border border-slate-200 bg-white px-3 py-1 text-sm shadow-2xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-blue-600 text-slate-800 font-body cursor-pointer"
                      >
                        <option value="Regular Service">Regular Service (2,000 KM)</option>
                        <option value="Component Failure">Component Failure / Repair</option>
                        <option value="Complaint">Customer / Rider Complaint</option>
                        <option value="Oil Change">Oil & Filter Change</option>
                        <option value="Tire Replacement">Tire Replacement / Alignment</option>
                        <option value="Battery Replacement">Battery Service / Replacement</option>
                        <option value="Breakdown">Emergency Breakdown</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-slate-800 mb-1.5 font-body">
                        Service Date <span className="text-rose-500">*</span>
                      </label>
                      <input 
                        type="date" 
                        name="date" 
                        required 
                        defaultValue={new Date().toISOString().split('T')[0]}
                        className="h-9 w-full rounded-md border border-slate-200 bg-white px-3 py-1 text-sm shadow-2xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-blue-600 text-slate-800 font-body cursor-pointer" 
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-slate-800 mb-1.5 font-body">
                        Current Odometer Reading (KM) <span className="text-rose-500">*</span>
                      </label>
                      <input 
                        type="number" 
                        name="mileage" 
                        required 
                        placeholder="e.g. 14500"
                        className="h-9 w-full rounded-md border border-slate-200 bg-white px-3 py-1 text-sm shadow-2xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-blue-600 placeholder:text-slate-400 text-slate-800 font-mono" 
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-slate-800 mb-1.5 font-body">
                        Next Service Due Date
                      </label>
                      <input 
                        type="date" 
                        name="nextDueDate" 
                        className="h-9 w-full rounded-md border border-slate-200 bg-white px-3 py-1 text-sm shadow-2xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-blue-600 text-slate-800 font-body cursor-pointer" 
                      />
                    </div>

                    <div className="col-span-2">
                      <label className="block text-sm font-medium text-slate-800 mb-1.5 font-body">
                        Service Location / Workshop <span className="text-rose-500">*</span>
                      </label>
                      <input 
                        name="location" 
                        required 
                        placeholder="e.g. Authorized Bosch Workshop, Central Station"
                        className="h-9 w-full rounded-md border border-slate-200 bg-white px-3 py-1 text-sm shadow-2xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-blue-600 placeholder:text-slate-400 text-slate-800 font-body" 
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* Service Description & Cost Section Card */}
              <div className="border border-slate-200 rounded-xl overflow-hidden bg-white shadow-2xs">
                <div className="bg-slate-50 px-4 py-2.5 border-b border-slate-200 flex items-center justify-between">
                  <h5 className="text-xs font-bold text-slate-900 font-heading uppercase tracking-wider flex items-center gap-2">
                    <FileText size={14} className="text-blue-600" />
                    Work Description & Expenses
                  </h5>
                  <span className="text-[11px] font-medium text-slate-400 italic">Optional</span>
                </div>
                
                <div className="p-5 space-y-5">
                  <div>
                    <label className="block text-sm font-medium text-slate-800 mb-1.5 font-body">
                      Work Description & Parts Replaced
                    </label>
                    <textarea 
                      name="description"
                      placeholder="Describe work performed, failed components replaced, or diagnostic notes..."
                      rows={3}
                      className="w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm shadow-2xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-blue-600 placeholder:text-slate-400 text-slate-800 font-body min-h-[80px] resize-none"
                    />
                  </div>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                    <div>
                      <label className="block text-sm font-medium text-slate-800 mb-1.5 font-body">
                        Total Cost (₹)
                      </label>
                      <input 
                        type="number" 
                        name="cost"
                        placeholder="0.00"
                        className="h-9 w-full rounded-md border border-slate-200 bg-white px-3 py-1 text-sm shadow-2xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-blue-600 placeholder:text-slate-400 text-slate-800 font-mono" 
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-800 mb-1.5 font-body">
                        Payment Method
                      </label>
                      <select 
                        name="paymentMode"
                        className="h-9 w-full rounded-md border border-slate-200 bg-white px-3 py-1 text-sm shadow-2xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-blue-600 text-slate-800 font-body cursor-pointer"
                      >
                        <option value="Cash">Cash</option>
                        <option value="Card">Card</option>
                        <option value="UPI">UPI / GPay</option>
                        <option value="Bank Transfer">Bank Transfer</option>
                        <option value="Credit">Credit / Account</option>
                      </select>
                    </div>
                  </div>
                </div>
              </div>

              {/* Bill Upload Section Card */}
              <div className="border border-slate-200 rounded-xl overflow-hidden bg-white shadow-2xs">
                <div className="bg-slate-50 px-4 py-2.5 border-b border-slate-200 flex items-center justify-between">
                  <h5 className="text-xs font-bold text-slate-900 font-heading uppercase tracking-wider flex items-center gap-2">
                    <FileText size={14} className="text-blue-600" />
                    Bill / Invoice Copy Attachment
                  </h5>
                  <span className="text-[11px] font-medium text-slate-400">PDF / Image (Optional)</span>
                </div>
                
                <div className="p-4">
                  <div className="relative">
                    <input 
                      type="file" 
                      accept="application/pdf,image/*" 
                      className="w-full text-xs text-slate-600 file:mr-4 file:py-1.5 file:px-4 file:rounded-md file:border file:border-slate-200 file:text-xs file:font-semibold file:bg-slate-50 file:text-slate-700 hover:file:bg-slate-100 cursor-pointer transition-all font-body" 
                    />
                    {uploading && (
                      <div className="absolute right-4 top-1/2 -translate-y-1/2 flex items-center gap-2 text-xs font-medium text-blue-600">
                        <Spinner size="w-3.5 h-3.5" color="text-blue-600" /> Uploading invoice...
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Modal Action Buttons */}
              <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-200">
                <button 
                  type="button" 
                  onClick={() => setShowServiceModal(false)} 
                  className="h-9 px-4 border border-slate-200 bg-white text-slate-700 text-sm font-medium rounded-md hover:bg-slate-50 transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button 
                  type="submit" 
                  disabled={addServiceMutation.isPending || uploading} 
                  className="h-9 px-6 bg-blue-600 hover:bg-blue-700 text-white rounded-md text-sm font-bold font-heading shadow-sm active:scale-[0.98] transition-all cursor-pointer disabled:opacity-50"
                >
                  {addServiceMutation.isPending || uploading ? 'Saving Record...' : 'Record Maintenance'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Vehicle History Side Drawer — PipePro Design System */}
      {selectedVehicleForHistory && (
        <div className="fixed top-14 lg:top-16 right-0 bottom-0 left-0 z-40 flex justify-end overflow-hidden">
          {/* Dark Backdrop Overlay below quick access bar */}
          <div 
            className="fixed top-14 lg:top-16 right-0 bottom-0 left-0 bg-black/50 backdrop-blur-xs transition-opacity animate-in fade-in-0 duration-200" 
            onClick={() => setSelectedVehicleForHistory(null)}
          />

          {/* Side Drawer Container starting under top quick access bar */}
          <div className="relative z-50 w-full max-w-md md:max-w-lg bg-white h-full border-l border-slate-200 shadow-2xl flex flex-col animate-in slide-in-from-right duration-300">
            
            {/* Drawer Header */}
            <div className="bg-white px-6 py-4 border-b border-slate-200 flex justify-between items-center shrink-0">
              <div>
                <h3 className="text-lg font-bold text-slate-900 font-heading tracking-tight flex items-center gap-2">
                  <History className="text-blue-600" size={20} /> Asset History & Audit Log
                </h3>
                <p className="text-xs text-slate-500 mt-0.5 font-mono">
                  {selectedVehicleForHistory.name} — <span className="font-bold text-slate-800">{selectedVehicleForHistory.vehicleNo}</span>
                </p>
              </div>
              <button 
                onClick={() => setSelectedVehicleForHistory(null)} 
                className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
                title="Close Drawer"
              >
                <X size={18} />
              </button>
            </div>

            {/* Drawer Body - Vertical Dotted Connected Timeline */}
            <div className="flex-1 overflow-y-auto p-6 bg-white">
              {loadingHistory ? (
                <div className="py-20 text-center"><Spinner size="w-8 h-8" color="text-blue-600" /></div>
              ) : (() => {
                const vehicle = selectedVehicleForHistory
                const vNoClean = vehicle.vehicleNo ? String(vehicle.vehicleNo).toUpperCase().replace(/[^A-Z0-9]/g, '') : ''
                
                // Aggregate all timeline events for this vehicle
                const timeline = []

                // 1. Initial Creation Event
                timeline.push({
                  id: `creation_${vehicle.id}`,
                  type: 'creation',
                  title: 'Vehicle Asset Added',
                  description: `User added the vehicle ${vehicle.name} (${vehicle.vehicleNo || 'Asset'})`,
                  userUuid: vehicle.createdById || vehicle.createdBy || user?.uid || 'System',
                  date: vehicle.createdAt?.toDate ? vehicle.createdAt.toDate() : (vehicle.purchaseDate ? new Date(vehicle.purchaseDate) : new Date()),
                  icon: '🚗'
                })

                // 2. Field Change Audit Logs
                historyLogs.forEach(log => {
                  let desc = `User updated ${log.field || 'vehicle details'}`
                  if (log.oldValue || log.newValue) {
                    desc = `User updated ${log.field}: ${log.oldValue || '—'} → ${log.newValue || '—'}`
                  }
                  timeline.push({
                    id: `history_${log.id}`,
                    type: 'update',
                    title: `${log.field || 'Details'} Updated`,
                    description: desc,
                    userUuid: log.updatedById || log.createdById || log.updatedBy || 'System',
                    date: log.timestamp?.toDate ? log.timestamp.toDate() : new Date(),
                    icon: '✏️'
                  })
                })

                // 3. Maintenance Service Logs
                const vServices = services.filter(s => s.vehicleId === vehicle.id)
                vServices.forEach(s => {
                  timeline.push({
                    id: `service_${s.id}`,
                    type: 'maintenance',
                    title: `Maintenance Service Recorded`,
                    description: `User recorded maintenance: ${s.type || s.serviceType || 'Service'} (${s.location || 'Service Center'}) ${s.cost ? '— ₹' + Number(s.cost).toLocaleString() : ''}`,
                    userUuid: s.performedById || s.createdById || s.performedBy || 'System',
                    date: s.date ? new Date(s.date) : (s.createdAt?.toDate ? s.createdAt.toDate() : new Date()),
                    icon: '🔧'
                  })
                })

                // 4. Mileage Logs
                const vMileage = allMileageLogs.filter(m => {
                  const mInfo = m.vehicle_info || m.vehicle_number || ''
                  const mClean = String(mInfo).toUpperCase().replace(/[^A-Z0-9]/g, '')
                  return (m.vehicleId === vehicle.id) || (vNoClean && mClean.includes(vNoClean))
                })

                vMileage.forEach(m => {
                  timeline.push({
                    id: `mileage_${m.id}`,
                    type: 'mileage',
                    title: `Trip Recorded (${m.total_km || 0} KM)`,
                    description: `${m.driver_name || 'Rider'} logged ${m.total_km || 0} KM trip (Start: ${Number(m.start_kilometer).toLocaleString()} → End: ${Number(m.end_kilometer).toLocaleString()} KM). Purpose: ${m.purpose || 'General Trip'}`,
                    userUuid: m.createdById || m.createdBy || 'System',
                    date: m.entry_date ? new Date(m.entry_date) : (m.createdAt?.toDate ? m.createdAt.toDate() : new Date()),
                    icon: '📍'
                  })
                })

                // Sort in reverse chronological order (newest events at top)
                timeline.sort((a, b) => b.date - a.date)

                if (timeline.length === 0) {
                  return (
                    <div className="py-20 text-center text-slate-400 text-xs italic font-medium">
                      No historical events recorded for this vehicle yet.
                    </div>
                  )
                }

                return (
                  <div className="relative pl-2 space-y-6">
                    {/* Vertical Dotted Connecting Line */}
                    <div className="absolute left-[18px] top-4 bottom-4 w-0.5 border-l-2 border-dashed border-slate-200 pointer-events-none" />

                    {timeline.map((evt) => (
                      <div key={evt.id} className="relative flex items-start gap-3.5 group">
                        {/* Event Node Icon Chip */}
                        <div className="w-8 h-8 rounded-full bg-slate-50 border-2 border-white shadow-2xs flex items-center justify-center text-xs shrink-0 z-10 group-hover:scale-110 transition-transform">
                          {evt.icon}
                        </div>

                        {/* Event Content Card */}
                        <div className="flex-1 bg-white hover:bg-blue-50/40 border border-slate-200/80 rounded-xl p-3.5 shadow-2xs transition-colors">
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-xs font-bold text-slate-900 font-heading">
                              {evt.title}
                            </span>
                            <span className="text-[11px] font-mono font-semibold text-slate-500 shrink-0">
                              {evt.date ? format(evt.date, 'dd MMM yyyy, hh:mm a') : '—'}
                            </span>
                          </div>

                          <p className="text-xs text-slate-700 mt-1 font-body leading-relaxed">
                            {evt.description}
                          </p>

                          <div className="mt-2 pt-2 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-400">
                            <span>Logged by: <strong className="text-slate-700 font-mono font-semibold">{evt.userUuid}</strong></span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )
              })()}
            </div>

            {/* Drawer Footer */}
            <div className="p-4 border-t border-slate-200 bg-white flex justify-end shrink-0">
              <button 
                onClick={() => setSelectedVehicleForHistory(null)} 
                className="h-9 px-6 bg-slate-900 hover:bg-slate-800 text-white text-sm font-bold font-heading rounded-md transition-colors cursor-pointer"
              >
                Close Drawer
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
