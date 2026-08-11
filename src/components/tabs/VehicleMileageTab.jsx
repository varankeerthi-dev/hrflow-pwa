import React, { useState, useMemo, useEffect } from 'react'
import { useAuth } from '../../hooks/useAuth'
import { db } from '../../lib/firebase'
import { collection, addDoc, query, getDocs, orderBy, doc, updateDoc, deleteDoc, serverTimestamp } from 'firebase/firestore'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { format } from 'date-fns'
import { z } from 'zod'
import jsPDF from 'jspdf'
import { useVehicleMileageStore } from '../../store/vehicleMileageStore'
import { 
  Truck, 
  Plus, 
  Search, 
  FileDown, 
  Pencil, 
  Trash2, 
  Calendar, 
  Gauge, 
  Route, 
  X,
  CheckCircle2,
  AlertCircle
} from 'lucide-react'
import Spinner from '../ui/Spinner'

// Zod Schema for Vehicle Mileage Entry
export const vehicleMileageSchema = z.object({
  entry_date: z.string().min(1, 'Entry date is required'),
  vehicle_info: z.string().min(2, 'Vehicle number and model are required'),
  start_kilometer: z.coerce.number({ invalid_type_error: 'Must be a number' }).min(0, 'Start KM must be >= 0'),
  end_kilometer: z.coerce.number({ invalid_type_error: 'Must be a number' }).min(0, 'End KM must be >= 0'),
  purpose: z.string().optional(),
  notes: z.string().optional()
}).refine((data) => data.end_kilometer >= data.start_kilometer, {
  message: 'End KM must be greater than or equal to Start KM',
  path: ['end_kilometer']
})

const emptyForm = {
  entry_date: format(new Date(), 'yyyy-MM-dd'),
  vehicle_info: '',
  start_kilometer: '',
  end_kilometer: '',
  purpose: '',
  notes: ''
}

export default function VehicleMileageTab() {
  const { user } = useAuth()
  const queryClient = useQueryClient()
  
  // Zustand Store
  const {
    showForm,
    editing,
    search,
    vehicleFilter,
    monthFilter,
    deleteTarget,
    setShowForm,
    setEditing,
    setSearch,
    setVehicleFilter,
    setMonthFilter,
    setDeleteTarget,
    clearFilters,
    openCreate,
    openEdit,
    closeForm
  } = useVehicleMileageStore()

  const [form, setForm] = useState(emptyForm)
  const [errors, setErrors] = useState({})

  // Fetch Mileage Entries from Firestore
  const { data: entries = [], isLoading } = useQuery({
    queryKey: ['vehicle_mileage', user?.orgId],
    queryFn: async () => {
      if (!user?.orgId) return []
      const q = query(collection(db, 'organisations', user.orgId, 'vehicle_mileage'), orderBy('entry_date', 'desc'))
      const snap = await getDocs(q)
      return snap.docs.map(d => ({ id: d.id, ...d.data() }))
    },
    enabled: !!user?.orgId
  })

  // Fetch Registered Vehicles from Firestore for single concatenated dropdown
  const { data: registeredVehicles = [] } = useQuery({
    queryKey: ['vehicles', user?.orgId],
    queryFn: async () => {
      if (!user?.orgId) return []
      const q = query(collection(db, 'organisations', user.orgId, 'vehicles'), orderBy('createdAt', 'desc'))
      const snap = await getDocs(q)
      return snap.docs.map(d => ({ id: d.id, ...d.data() }))
    },
    enabled: !!user?.orgId
  })

  // Populate form when editing
  useEffect(() => {
    if (editing) {
      const vInfo = editing.vehicle_info || `${editing.vehicle_number || ''} (${editing.vehicle_model || ''})`.trim()
      setForm({
        entry_date: editing.entry_date ? format(new Date(editing.entry_date), 'yyyy-MM-dd') : format(new Date(), 'yyyy-MM-dd'),
        vehicle_info: vInfo,
        start_kilometer: editing.start_kilometer ?? '',
        end_kilometer: editing.end_kilometer ?? '',
        purpose: editing.purpose || '',
        notes: editing.notes || ''
      })
      setErrors({})
    } else {
      setForm(emptyForm)
      setErrors({})
    }
  }, [editing, showForm])

  // Mutations
  const createMutation = useMutation({
    mutationFn: async (data) => {
      const docRef = await addDoc(collection(db, 'organisations', user.orgId, 'vehicle_mileage'), {
        ...data,
        createdAt: serverTimestamp(),
        createdBy: user?.name || user?.email
      })
      return docRef.id
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['vehicle_mileage', user?.orgId] })
      closeForm()
    }
  })

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }) => {
      await updateDoc(doc(db, 'organisations', user.orgId, 'vehicle_mileage', id), {
        ...data,
        updatedAt: serverTimestamp()
      })
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['vehicle_mileage', user?.orgId] })
      closeForm()
    }
  })

  const deleteMutation = useMutation({
    mutationFn: async (id) => {
      await deleteDoc(doc(db, 'organisations', user.orgId, 'vehicle_mileage', id))
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['vehicle_mileage', user?.orgId] })
      setDeleteTarget(null)
    }
  })

  const computedKm = useMemo(() => {
    const s = Number(form.start_kilometer) || 0
    const e = Number(form.end_kilometer) || 0
    return e >= s ? e - s : 0
  }, [form.start_kilometer, form.end_kilometer])

  // Unique list of vehicles for filter dropdown
  const vehicles = useMemo(() => {
    const map = new Map()
    entries.forEach(e => {
      const vInfo = e.vehicle_info || `${e.vehicle_number || ''} ${e.vehicle_model || ''}`.trim()
      if (vInfo && !map.has(vInfo)) map.set(vInfo, vInfo)
    })
    registeredVehicles.forEach(rv => {
      const label = `${rv.regNo || ''} (${rv.model || ''})`.trim()
      if (label && !map.has(label)) map.set(label, label)
    })
    return Array.from(map.entries())
  }, [entries, registeredVehicles])

  const filtered = useMemo(() => {
    return entries.filter(e => {
      const vInfo = (e.vehicle_info || `${e.vehicle_number || ''} ${e.vehicle_model || ''}`).toLowerCase()
      const searchLower = search.toLowerCase()
      const matchesSearch = !search ||
        vInfo.includes(searchLower) ||
        (e.purpose || '').toLowerCase().includes(searchLower) ||
        (e.notes || '').toLowerCase().includes(searchLower)

      const matchesVehicle = vehicleFilter === 'all' || (e.vehicle_info || `${e.vehicle_number || ''} ${e.vehicle_model || ''}`).includes(vehicleFilter)
      const matchesMonth = !monthFilter || (e.entry_date && e.entry_date.startsWith(monthFilter))
      return matchesSearch && matchesVehicle && matchesMonth
    })
  }, [entries, search, vehicleFilter, monthFilter])

  const stats = useMemo(() => {
    const totalKm = filtered.reduce((sum, e) => sum + (Number(e.total_km) || 0), 0)
    const thisMonth = format(new Date(), 'yyyy-MM')
    const monthKm = entries
      .filter(e => e.entry_date?.startsWith(thisMonth))
      .reduce((sum, e) => sum + (Number(e.total_km) || 0), 0)
    return {
      total: filtered.length,
      totalKm,
      vehiclesCount: new Set(filtered.map(e => e.vehicle_info || e.vehicle_number)).size,
      monthKm
    }
  }, [filtered, entries])

  const handleSubmit = (e) => {
    e.preventDefault()
    
    // Zod validation
    const result = vehicleMileageSchema.safeParse(form)
    if (!result.success) {
      const formattedErrors = {}
      result.error.issues.forEach(issue => {
        formattedErrors[issue.path[0]] = issue.message
      })
      setErrors(formattedErrors)
      return
    }

    setErrors({})
    
    // Helper to parse vehicle number and model if formatted as "MH-12 (Innova)" or "MH-12 - Innova"
    let vehicle_number = form.vehicle_info
    let vehicle_model = ''
    if (form.vehicle_info.includes('(')) {
      const parts = form.vehicle_info.split('(')
      vehicle_number = parts[0].trim()
      vehicle_model = parts[1].replace(')', '').trim()
    } else if (form.vehicle_info.includes('-')) {
      const parts = form.vehicle_info.split('-')
      vehicle_number = parts[0].trim()
      vehicle_model = parts.slice(1).join('-').trim()
    }

    const payload = {
      entry_date: form.entry_date,
      vehicle_info: form.vehicle_info,
      vehicle_number,
      vehicle_model,
      start_kilometer: Number(form.start_kilometer) || 0,
      end_kilometer: Number(form.end_kilometer) || 0,
      total_km: computedKm,
      purpose: form.purpose || '',
      notes: form.notes || ''
    }

    if (editing) {
      updateMutation.mutate({ id: editing.id, data: payload })
    } else {
      createMutation.mutate(payload)
    }
  }

  const exportPDF = () => {
    const doc = new jsPDF()

    // Header
    doc.setFontSize(18)
    doc.setFont('helvetica', 'bold')
    doc.text('Vehicle Mileage Tracker Report', 105, 18, { align: 'center' })
    doc.setFontSize(9)
    doc.setFont('helvetica', 'normal')
    let subtitle = `Generated: ${format(new Date(), 'dd-MMM-yyyy')}`
    if (monthFilter) subtitle += `  |  Month: ${monthFilter}`
    if (vehicleFilter !== 'all') subtitle += `  |  Vehicle: ${vehicleFilter}`
    doc.text(subtitle, 105, 25, { align: 'center' })
    doc.line(10, 30, 200, 30)

    // Summary
    doc.setFontSize(10)
    doc.setFont('helvetica', 'bold')
    doc.text(`Total Entries: ${stats.total}`, 14, 40)
    doc.text(`Total KM Run: ${stats.totalKm.toLocaleString()} km`, 14, 46)
    doc.text(`Vehicles: ${stats.vehiclesCount}`, 110, 40)
    doc.text(`This Month KM: ${stats.monthKm.toLocaleString()} km`, 110, 46)

    // Table header
    let yPos = 56
    doc.setFillColor(37, 99, 235)
    doc.setTextColor(255, 255, 255)
    doc.rect(10, yPos, 190, 9, 'F')
    doc.setFontSize(9)
    doc.setFont('helvetica', 'bold')
    let xPos = 12
    doc.text('#', xPos, yPos + 6); xPos += 10
    doc.text('Date', xPos, yPos + 6); xPos += 26
    doc.text('Vehicle (No & Model)', xPos, yPos + 6); xPos += 64
    doc.text('Start', xPos, yPos + 6); xPos += 20
    doc.text('End', xPos, yPos + 6); xPos += 20
    doc.text('Total KM', xPos, yPos + 6); xPos += 22
    doc.text('Purpose', xPos, yPos + 6)
    yPos += 9

    // Rows
    doc.setTextColor(0, 0, 0)
    doc.setFont('helvetica', 'normal')
    filtered.forEach((e, i) => {
      if (yPos > 270) {
        doc.addPage()
        yPos = 20
      }
      yPos += 7
      xPos = 12
      doc.text(`${i + 1}`, xPos, yPos); xPos += 10
      doc.text(e.entry_date ? format(new Date(e.entry_date), 'dd-MMM-yy') : '-', xPos, yPos); xPos += 26
      const vDisplay = (e.vehicle_info || `${e.vehicle_number || ''} ${e.vehicle_model || ''}`).substring(0, 32)
      doc.text(vDisplay, xPos, yPos); xPos += 64
      doc.text(`${e.start_kilometer ?? 0}`, xPos, yPos); xPos += 20
      doc.text(`${e.end_kilometer ?? 0}`, xPos, yPos); xPos += 20
      doc.text(`${e.total_km ?? 0}`, xPos, yPos); xPos += 22
      doc.text((e.purpose || '').substring(0, 24), xPos, yPos)
      doc.line(10, yPos + 2, 200, yPos + 2)
    })

    // Footer total
    yPos += 12
    doc.setFont('helvetica', 'bold')
    doc.text(`Grand Total KM: ${stats.totalKm.toLocaleString()} km`, 140, yPos)

    doc.setFontSize(8)
    doc.setFont('helvetica', 'normal')
    doc.text('This is a computer generated document', 105, 288, { align: 'center' })

    doc.save(`vehicle-mileage-report${monthFilter ? '-' + monthFilter : ''}.pdf`)
  }

  const isMutating = createMutation.isPending || updateMutation.isPending

  return (
    <div className="flex-1 overflow-auto p-4 md:p-6 bg-slate-50/50 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs">
        <div>
          <h1 className="text-xl font-bold text-slate-900 tracking-tight flex items-center gap-2.5">
            <div className="p-2 bg-blue-50 text-blue-600 rounded-xl">
              <Truck size={22} />
            </div>
            Vehicle Mileage Tracker
          </h1>
          <p className="text-xs text-slate-500 mt-1">Log and track vehicle kilometers run across operations</p>
        </div>
        <div className="flex items-center gap-2.5">
          <button
            onClick={exportPDF}
            disabled={!filtered.length}
            className="flex items-center gap-2 px-4 py-2.5 bg-white border border-slate-200 text-slate-700 rounded-xl text-xs font-semibold hover:bg-slate-50 transition shadow-2xs disabled:opacity-50"
          >
            <FileDown size={16} /> Export PDF
          </button>
          <button
            onClick={openCreate}
            className="flex items-center gap-2 px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-semibold transition shadow-md shadow-blue-500/20 active:scale-98"
          >
            <Plus size={16} /> Add Mileage Entry
          </button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs flex flex-col justify-between">
          <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center mb-3">
            <Route size={20} />
          </div>
          <div>
            <p className="text-2xl font-bold text-slate-900">{stats.total}</p>
            <p className="text-xs font-medium text-slate-500 mt-0.5">Total Entries</p>
          </div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs flex flex-col justify-between">
          <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center mb-3">
            <Gauge size={20} />
          </div>
          <div>
            <p className="text-2xl font-bold text-slate-900">{stats.totalKm.toLocaleString()} km</p>
            <p className="text-xs font-medium text-slate-500 mt-0.5">Total KM Run</p>
          </div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs flex flex-col justify-between">
          <div className="w-10 h-10 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center mb-3">
            <Truck size={20} />
          </div>
          <div>
            <p className="text-2xl font-bold text-slate-900">{stats.vehiclesCount}</p>
            <p className="text-xs font-medium text-slate-500 mt-0.5">Tracked Vehicles</p>
          </div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200/80 shadow-xs flex flex-col justify-between">
          <div className="w-10 h-10 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center mb-3">
            <Calendar size={20} />
          </div>
          <div>
            <p className="text-2xl font-bold text-slate-900">{stats.monthKm.toLocaleString()} km</p>
            <p className="text-xs font-medium text-slate-500 mt-0.5">KM This Month</p>
          </div>
        </div>
      </div>

      {/* Filter Bar */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-xs">
        <div className="flex flex-col lg:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              type="text"
              placeholder="Search vehicle model, number or purpose..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-9 pr-3 py-2 text-xs font-medium text-slate-800 outline-none focus:border-blue-500 focus:bg-white transition"
            />
          </div>
          <select
            value={vehicleFilter}
            onChange={(e) => setVehicleFilter(e.target.value)}
            className="h-9 rounded-xl border border-slate-200 bg-slate-50 px-3 text-xs font-medium text-slate-700 outline-none focus:border-blue-500 focus:bg-white"
          >
            <option value="all">All Vehicles</option>
            {vehicles.map(([num, label]) => (
              <option key={num} value={num}>{label}</option>
            ))}
          </select>
          <input
            type="month"
            value={monthFilter}
            onChange={(e) => setMonthFilter(e.target.value)}
            className="h-9 lg:w-44 rounded-xl border border-slate-200 bg-slate-50 px-3 text-xs font-medium text-slate-700 outline-none focus:border-blue-500 focus:bg-white"
          />
          <button
            onClick={clearFilters}
            className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-xl transition"
          >
            <X size={14} /> Clear
          </button>
        </div>
      </div>

      {/* Data Table */}
      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-slate-100/70 border-b border-slate-200/80 text-[11px] font-bold text-slate-600 uppercase tracking-wider">
                <th className="py-3 px-4">Date</th>
                <th className="py-3 px-4">Vehicle (No & Model)</th>
                <th className="py-3 px-4 text-right">Start KM</th>
                <th className="py-3 px-4 text-right">End KM</th>
                <th className="py-3 px-4 text-right">Total KM</th>
                <th className="py-3 px-4">Purpose</th>
                <th className="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200/60">
              {isLoading ? (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-slate-400 font-medium">
                    <div className="flex items-center justify-center gap-2">
                      <Spinner size="sm" /> Loading mileage logs...
                    </div>
                  </td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-slate-400 font-medium">
                    No vehicle mileage entries found.
                  </td>
                </tr>
              ) : (
                filtered.map(e => (
                  <tr key={e.id} className="hover:bg-blue-50/30 transition-colors group">
                    <td className="py-3 px-4 font-mono text-slate-600 whitespace-nowrap">
                      {e.entry_date ? format(new Date(e.entry_date), 'dd MMM yyyy') : '-'}
                    </td>
                    <td className="py-3 px-4 font-semibold text-slate-800">
                      {e.vehicle_info || `${e.vehicle_number || ''} (${e.vehicle_model || ''})`}
                    </td>
                    <td className="py-3 px-4 text-right text-slate-600 font-mono">
                      {Number(e.start_kilometer).toLocaleString()}
                    </td>
                    <td className="py-3 px-4 text-right text-slate-600 font-mono">
                      {Number(e.end_kilometer).toLocaleString()}
                    </td>
                    <td className="py-3 px-4 text-right font-bold text-blue-600 font-mono">
                      {Number(e.total_km).toLocaleString()} km
                    </td>
                    <td className="py-3 px-4 text-slate-600 max-w-[200px] truncate">
                      {e.purpose || '-'}
                    </td>
                    <td className="py-3 px-4 text-right whitespace-nowrap">
                      <div className="flex items-center justify-end gap-1.5">
                        <button
                          onClick={() => openEdit(e)}
                          className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                          title="Edit Entry"
                        >
                          <Pencil size={14} />
                        </button>
                        <button
                          onClick={() => setDeleteTarget(e)}
                          className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors"
                          title="Delete Entry"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
            {filtered.length > 0 && (
              <tfoot className="bg-slate-50 border-t-2 border-slate-200">
                <tr>
                  <td colSpan={4} className="py-3.5 px-4 text-right font-bold text-slate-700">
                    Grand Total KM:
                  </td>
                  <td className="py-3.5 px-4 text-right font-extrabold text-blue-700 text-sm font-mono">
                    {stats.totalKm.toLocaleString()} km
                  </td>
                  <td colSpan={2}></td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>

      {/* Add / Edit Creator Modal */}
      {showForm && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl max-w-lg w-full overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
              <h3 className="text-base font-bold text-slate-900">
                {editing ? 'Edit Mileage Entry' : 'Add Mileage Entry'}
              </h3>
              <button
                onClick={closeForm}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-lg hover:bg-slate-100 transition"
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              {/* Single Concatenated Field for Vehicle No & Vehicle Model */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Select Vehicle <span className="text-rose-500">*</span>
                </label>
                <div className="space-y-2">
                  <select
                    value={registeredVehicles.some(rv => `${rv.vehicleNo || rv.regNo || ''} (${rv.name || rv.model || ''})`.trim() === form.vehicle_info) ? form.vehicle_info : (form.vehicle_info ? '__custom__' : '')}
                    onChange={(e) => {
                      const val = e.target.value
                      if (val === '__custom__') {
                        setForm({ ...form, vehicle_info: 'Custom Vehicle' })
                      } else {
                        setForm({ ...form, vehicle_info: val })
                      }
                    }}
                    className={`w-full bg-slate-50 border ${errors.vehicle_info ? 'border-rose-400' : 'border-slate-200'} rounded-xl px-3 py-2 text-xs font-medium text-slate-800 outline-none focus:border-blue-500 focus:bg-white transition cursor-pointer`}
                  >
                    <option value="">-- Select Vehicle --</option>
                    {registeredVehicles.map(rv => {
                      const vNo = rv.vehicleNo || rv.regNo || 'No Reg'
                      const vModel = rv.name || rv.model || rv.manufacturer || 'Asset'
                      const fullLabel = `${vNo} (${vModel})`.trim()
                      return (
                        <option key={rv.id} value={fullLabel}>
                          🚗 {vNo} — {vModel}
                        </option>
                      )
                    })}
                    <option value="__custom__">+ Enter Custom / Other Vehicle</option>
                  </select>

                  {(!registeredVehicles.some(rv => `${rv.vehicleNo || rv.regNo || ''} (${rv.name || rv.model || ''})`.trim() === form.vehicle_info) || form.vehicle_info === 'Custom Vehicle') && (
                    <input
                      type="text"
                      placeholder="e.g. MH-12-AB-1234 (Toyota Innova)"
                      value={form.vehicle_info === 'Custom Vehicle' ? '' : form.vehicle_info}
                      onChange={(e) => setForm({ ...form, vehicle_info: e.target.value })}
                      className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs font-medium text-slate-800 outline-none focus:border-blue-500 transition"
                    />
                  )}
                </div>
                {errors.vehicle_info && (
                  <p className="text-[11px] text-rose-500 mt-1 flex items-center gap-1">
                    <AlertCircle size={12} /> {errors.vehicle_info}
                  </p>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="sm:col-span-2">
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Date <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="date"
                    value={form.entry_date}
                    onChange={(e) => setForm({ ...form, entry_date: e.target.value })}
                    className={`w-full bg-slate-50 border ${errors.entry_date ? 'border-rose-400' : 'border-slate-200'} rounded-xl px-3 py-2 text-xs font-medium text-slate-800 outline-none focus:border-blue-500 focus:bg-white transition`}
                  />
                  {errors.entry_date && (
                    <p className="text-[11px] text-rose-500 mt-1">{errors.entry_date}</p>
                  )}
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Start Kilometer <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="number"
                    placeholder="0"
                    value={form.start_kilometer}
                    onChange={(e) => setForm({ ...form, start_kilometer: e.target.value })}
                    className={`w-full bg-slate-50 border ${errors.start_kilometer ? 'border-rose-400' : 'border-slate-200'} rounded-xl px-3 py-2 text-xs font-medium text-slate-800 outline-none focus:border-blue-500 focus:bg-white transition`}
                  />
                  {errors.start_kilometer && (
                    <p className="text-[11px] text-rose-500 mt-1">{errors.start_kilometer}</p>
                  )}
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    End Kilometer <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="number"
                    placeholder="0"
                    value={form.end_kilometer}
                    onChange={(e) => setForm({ ...form, end_kilometer: e.target.value })}
                    className={`w-full bg-slate-50 border ${errors.end_kilometer ? 'border-rose-400' : 'border-slate-200'} rounded-xl px-3 py-2 text-xs font-medium text-slate-800 outline-none focus:border-blue-500 focus:bg-white transition`}
                  />
                  {errors.end_kilometer && (
                    <p className="text-[11px] text-rose-500 mt-1">{errors.end_kilometer}</p>
                  )}
                </div>

                <div className="sm:col-span-2 p-3 bg-blue-50/70 border border-blue-200/80 rounded-xl flex items-center justify-between">
                  <span className="text-xs font-semibold text-slate-700">Calculated Total KM Run</span>
                  <span className="text-base font-extrabold text-blue-700 font-mono">
                    {computedKm.toLocaleString()} km
                  </span>
                </div>

                <div className="sm:col-span-2">
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Purpose</label>
                  <input
                    type="text"
                    placeholder="e.g. Site visit to Client Site A"
                    value={form.purpose}
                    onChange={(e) => setForm({ ...form, purpose: e.target.value })}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-medium text-slate-800 outline-none focus:border-blue-500 focus:bg-white transition"
                  />
                </div>

                <div className="sm:col-span-2">
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Notes</label>
                  <textarea
                    rows={2}
                    placeholder="Optional notes..."
                    value={form.notes}
                    onChange={(e) => setForm({ ...form, notes: e.target.value })}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-medium text-slate-800 outline-none focus:border-blue-500 focus:bg-white transition"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-2.5 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={closeForm}
                  className="px-4 py-2 border border-slate-200 text-slate-600 rounded-xl text-xs font-semibold hover:bg-slate-50 transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isMutating}
                  className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-semibold transition shadow-md shadow-blue-500/20 disabled:opacity-50 flex items-center gap-1.5"
                >
                  {isMutating ? <Spinner size="sm" /> : editing ? 'Update Entry' : 'Save Entry'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deleteTarget && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl max-w-sm w-full p-6 text-center space-y-4 animate-in fade-in zoom-in-95 duration-150">
            <div className="w-12 h-12 rounded-full bg-rose-50 text-rose-600 flex items-center justify-center mx-auto">
              <Trash2 size={24} />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900">Delete Mileage Entry?</h3>
              <p className="text-xs text-slate-500 mt-1">
                This will permanently delete the entry for <span className="font-semibold text-slate-700">{deleteTarget.vehicle_info || deleteTarget.vehicle_number}</span> on{' '}
                <span className="font-semibold text-slate-700">{deleteTarget.entry_date ? format(new Date(deleteTarget.entry_date), 'dd MMM yyyy') : ''}</span>.
              </p>
            </div>
            <div className="flex items-center justify-center gap-2.5 pt-2">
              <button
                onClick={() => setDeleteTarget(null)}
                className="px-4 py-2 border border-slate-200 text-slate-600 rounded-xl text-xs font-semibold hover:bg-slate-50 transition"
              >
                Cancel
              </button>
              <button
                onClick={() => deleteMutation.mutate(deleteTarget.id)}
                disabled={deleteMutation.isPending}
                className="px-5 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-semibold transition shadow-md shadow-rose-500/20 disabled:opacity-50 flex items-center gap-1.5"
              >
                {deleteMutation.isPending ? <Spinner size="sm" /> : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
