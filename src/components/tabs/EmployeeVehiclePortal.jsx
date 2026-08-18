import React, { useMemo, useState } from 'react'
import { Car, CheckCircle2, Gauge, Wrench } from 'lucide-react'
import { addDoc, collection, getDocs, orderBy, query, serverTimestamp } from 'firebase/firestore'
import { useQuery } from '@tanstack/react-query'
import { db } from '../../lib/firebase'
import { useAuth } from '../../hooks/useAuth'
import { logActivity } from '../../hooks/useActivityLog'

const today = () => new Date().toISOString().slice(0, 10)

export default function EmployeeVehiclePortal({ employeeId = null }) {
  const { user } = useAuth()
  const [mileage, setMileage] = useState({ vehicleId: '', date: today(), start: '', end: '' })
  const [maintenance, setMaintenance] = useState({ vehicleId: '', date: today(), odometer: '', type: 'Maintenance request', description: '' })
  const [savingMileage, setSavingMileage] = useState(false)
  const [savingMaintenance, setSavingMaintenance] = useState(false)
  const [notice, setNotice] = useState('')

  const { data: vehicles = [], isLoading } = useQuery({
    queryKey: ['employee_vehicle_list', user?.orgId],
    queryFn: async () => {
      if (!user?.orgId) return []
      const snapshot = await getDocs(query(collection(db, 'organisations', user.orgId, 'vehicles'), orderBy('createdAt', 'desc')))
      return snapshot.docs.map((document) => ({ id: document.id, ...document.data() }))
    },
    enabled: !!user?.orgId,
  })

  const vehicleOptions = useMemo(() => vehicles.map((vehicle) => ({ id: vehicle.id, label: String(vehicle.vehicleNo || vehicle.regNo || 'Vehicle').toUpperCase() })), [vehicles])
  const selectedMileageVehicle = vehicleOptions.find((vehicle) => vehicle.id === mileage.vehicleId)
  const selectedMaintenanceVehicle = vehicleOptions.find((vehicle) => vehicle.id === maintenance.vehicleId)
  const totalKm = Math.max(0, Number(mileage.end || 0) - Number(mileage.start || 0))

  const submitMileage = async (event) => {
    event.preventDefault()
    if (!selectedMileageVehicle || mileage.start === '' || mileage.end === '') return alert('Select a vehicle and enter both kilometer readings.')
    if (Number(mileage.end) < Number(mileage.start)) return alert('End kilometer cannot be lower than start kilometer.')
    setSavingMileage(true)
    try {
      await addDoc(collection(db, 'organisations', user.orgId, 'vehicle_mileage'), {
        vehicleId: selectedMileageVehicle.id,
        vehicle_info: selectedMileageVehicle.label,
        vehicle_number: selectedMileageVehicle.label,
        entry_date: mileage.date,
        start_kilometer: Number(mileage.start),
        end_kilometer: Number(mileage.end),
        total_km: totalKm,
        driver_name: user.name || user.email || 'Employee',
        employeeId: employeeId || null,
        createdBy: user.name || user.email || 'Employee',
        createdById: user.uid,
        source: 'employee_vehicle_portal',
        createdAt: serverTimestamp(),
      })
      await logActivity(user.orgId, user, { module: 'Vehicle', action: 'EMPLOYEE_MILEAGE_SUBMITTED', detail: `Mileage entry submitted for ${selectedMileageVehicle.label}: ${totalKm} KM on ${mileage.date}.` })
      setMileage({ vehicleId: '', date: today(), start: '', end: '' })
      setNotice('Mileage entry submitted successfully.')
    } catch (error) {
      alert(error.message || 'Unable to submit mileage.')
    } finally {
      setSavingMileage(false)
    }
  }

  const submitMaintenance = async (event) => {
    event.preventDefault()
    if (!selectedMaintenanceVehicle || !maintenance.description.trim()) return alert('Select a vehicle and describe the maintenance request.')
    setSavingMaintenance(true)
    try {
      await addDoc(collection(db, 'organisations', user.orgId, 'vehicle_services'), {
        vehicleId: selectedMaintenanceVehicle.id,
        vehicleNo: selectedMaintenanceVehicle.label,
        type: maintenance.type,
        date: maintenance.date,
        mileage: maintenance.odometer ? Number(maintenance.odometer) : null,
        odometerReading: maintenance.odometer ? Number(maintenance.odometer) : null,
        description: maintenance.description.trim(),
        status: 'Requested',
        requestedByUid: user.uid,
        requestedByName: user.name || user.email || 'Employee',
        employeeId: employeeId || null,
        source: 'employee_vehicle_portal',
        createdAt: serverTimestamp(),
      })
      await logActivity(user.orgId, user, { module: 'Vehicle', action: 'EMPLOYEE_MAINTENANCE_REQUESTED', detail: `Maintenance request submitted for ${selectedMaintenanceVehicle.label}: ${maintenance.type}.` })
      setMaintenance({ vehicleId: '', date: today(), odometer: '', type: 'Maintenance request', description: '' })
      setNotice('Maintenance request submitted successfully.')
    } catch (error) {
      alert(error.message || 'Unable to submit the maintenance request.')
    } finally {
      setSavingMaintenance(false)
    }
  }

  const inputClass = 'mt-1 h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm font-medium text-slate-800 outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100'

  return (
    <div className="mx-auto w-full max-w-3xl space-y-5 pb-6 font-inter">
      <header className="rounded-[12px] border border-gray-100 bg-white p-5 shadow-sm">
        <p className="text-[11px] font-bold uppercase tracking-widest text-gray-400">Vehicle entry</p>
        <h2 className="mt-1 text-xl font-semibold tracking-tight text-gray-900">Mileage and maintenance</h2>
        <p className="mt-1 text-sm text-gray-500">Select a vehicle number, record the kilometer reading, or send a maintenance request. Fleet records, costs, and approvals are managed by the vehicle team.</p>
      </header>

      {notice && <div className="flex items-center gap-2 rounded-lg border border-emerald-100 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-800"><CheckCircle2 size={17} /> {notice}</div>}

      <section className="rounded-[12px] border border-gray-100 bg-white p-5 shadow-sm">
        <div className="flex items-center gap-2"><Gauge size={17} className="text-emerald-600" /><h3 className="text-base font-semibold text-gray-900">Enter mileage</h3></div>
        <form onSubmit={submitMileage} className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2">
          <label className="text-[10px] font-bold uppercase tracking-widest text-slate-400 sm:col-span-2">Vehicle number<select value={mileage.vehicleId} onChange={(event) => setMileage((current) => ({ ...current, vehicleId: event.target.value }))} className={inputClass} disabled={isLoading}><option value="">Select vehicle</option>{vehicleOptions.map((vehicle) => <option key={vehicle.id} value={vehicle.id}>{vehicle.label}</option>)}</select></label>
          <label className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Date<input type="date" value={mileage.date} onChange={(event) => setMileage((current) => ({ ...current, date: event.target.value }))} className={inputClass} /></label>
          <label className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Start kilometer<input type="number" min="0" value={mileage.start} onChange={(event) => setMileage((current) => ({ ...current, start: event.target.value }))} className={inputClass} /></label>
          <label className="text-[10px] font-bold uppercase tracking-widest text-slate-400">End kilometer<input type="number" min="0" value={mileage.end} onChange={(event) => setMileage((current) => ({ ...current, end: event.target.value }))} className={inputClass} /></label>
          <div className="rounded-lg border border-slate-100 bg-slate-50 px-3 py-2"><p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Distance</p><p className="mt-1 text-sm font-semibold text-slate-900">{totalKm} KM</p></div>
          <button type="submit" disabled={savingMileage || isLoading} className="sm:col-span-2 rounded-xl bg-emerald-600 px-5 py-3 text-xs font-bold uppercase tracking-wide text-white hover:bg-emerald-700 disabled:opacity-50">{savingMileage ? 'Submitting…' : 'Submit mileage'}</button>
        </form>
      </section>

      <section className="rounded-[12px] border border-gray-100 bg-white p-5 shadow-sm">
        <div className="flex items-center gap-2"><Wrench size={17} className="text-amber-600" /><h3 className="text-base font-semibold text-gray-900">Maintenance request</h3></div>
        <form onSubmit={submitMaintenance} className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2">
          <label className="text-[10px] font-bold uppercase tracking-widest text-slate-400 sm:col-span-2">Vehicle number<select value={maintenance.vehicleId} onChange={(event) => setMaintenance((current) => ({ ...current, vehicleId: event.target.value }))} className={inputClass} disabled={isLoading}><option value="">Select vehicle</option>{vehicleOptions.map((vehicle) => <option key={vehicle.id} value={vehicle.id}>{vehicle.label}</option>)}</select></label>
          <label className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Date<input type="date" value={maintenance.date} onChange={(event) => setMaintenance((current) => ({ ...current, date: event.target.value }))} className={inputClass} /></label>
          <label className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Current kilometer<input type="number" min="0" value={maintenance.odometer} onChange={(event) => setMaintenance((current) => ({ ...current, odometer: event.target.value }))} className={inputClass} /></label>
          <label className="text-[10px] font-bold uppercase tracking-widest text-slate-400 sm:col-span-2">Request type<select value={maintenance.type} onChange={(event) => setMaintenance((current) => ({ ...current, type: event.target.value }))} className={inputClass}><option>Maintenance request</option><option>Breakdown</option><option>Tyre issue</option><option>Chain adjustment</option><option>Service required</option></select></label>
          <label className="text-[10px] font-bold uppercase tracking-widest text-slate-400 sm:col-span-2">Describe the issue<textarea required rows="3" value={maintenance.description} onChange={(event) => setMaintenance((current) => ({ ...current, description: event.target.value }))} className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-800 outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100" /></label>
          <button type="submit" disabled={savingMaintenance || isLoading} className="sm:col-span-2 rounded-xl border border-amber-200 bg-amber-50 px-5 py-3 text-xs font-bold uppercase tracking-wide text-amber-700 hover:bg-amber-100 disabled:opacity-50">{savingMaintenance ? 'Submitting…' : 'Submit maintenance request'}</button>
        </form>
      </section>
    </div>
  )
}
