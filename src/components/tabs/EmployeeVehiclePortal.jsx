import React, { useMemo, useState } from 'react'
import DatePicker from 'react-datepicker'
import 'react-datepicker/dist/react-datepicker.css'
import { format, parseISO } from 'date-fns'
import { z } from 'zod'
import { AlertTriangle, ArrowLeft, CheckCircle2, Gauge, Wrench, X } from 'lucide-react'
import { addDoc, collection, doc, getDocs, orderBy, query, serverTimestamp, updateDoc } from 'firebase/firestore'
import { useQuery } from '@tanstack/react-query'
import { db } from '../../lib/firebase'
import { useAuth } from '../../hooks/useAuth'
import { logActivity } from '../../hooks/useActivityLog'
import { useEmployeeVehicleEntryStore } from '../../store/employeeVehicleEntryStore'

const today = () => new Date().toISOString().slice(0, 10)

const mileageSchema = z.object({
  vehicleId: z.string().min(1, 'Select a vehicle.'),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Choose a valid date.'),
  start: z.coerce.number().finite().nonnegative('Start kilometer cannot be negative.'),
  end: z.coerce.number().finite().nonnegative('End kilometer cannot be negative.'),
  petrolAmount: z.coerce.number().finite().nonnegative('Petrol amount cannot be negative.').optional(),
}).superRefine((value, context) => {
  if (value.end < value.start) context.addIssue({ code: z.ZodIssueCode.custom, path: ['end'], message: 'End kilometer cannot be lower than start kilometer.' })
})

const getVehicleLabel = (vehicle) => {
  const name = String(vehicle.name || vehicle.model || vehicle.vehicleModel || vehicle.make || 'Vehicle').trim()
  const number = String(vehicle.vehicleNo || vehicle.regNo || 'No number').toUpperCase().trim()
  return `${name} - ${number}`
}

const formatConflictDate = (value) => value ? format(parseISO(value), 'dd MMM yyyy') : 'the selected date'

function SharedDatePicker({ value, onChange }) {
  return (
    <div className="mt-1 flex h-10 w-full min-w-0 items-center gap-2 rounded-lg border border-slate-200 bg-white px-3">
      <DatePicker
        selected={value ? parseISO(value) : new Date()}
        maxDate={new Date()}
        onChange={(date) => date && onChange(format(date, 'yyyy-MM-dd'))}
        dateFormat="dd MMM yyyy"
        popperClassName="z-[99999]"
        popperProps={{ strategy: 'fixed', placement: 'bottom-start' }}
        customInput={<div className="flex h-full w-full min-w-0 cursor-pointer select-none items-center bg-transparent text-sm font-semibold text-slate-900 outline-none">{value ? format(parseISO(value), 'dd MMM yyyy') : format(new Date(), 'dd MMM yyyy')}</div>}
      />
    </div>
  )
}

export default function EmployeeVehiclePortal({ employeeId = null }) {
  const { user } = useAuth()
  const { activeEntry, conflictEntry, conflictNotice, openEntry, closeEntry, setConflictEntry, setConflictNotice, clearConflict } = useEmployeeVehicleEntryStore()
  const [mileage, setMileage] = useState({ vehicleId: '', date: today(), start: '', end: '', petrolAmount: '' })
  const [maintenance, setMaintenance] = useState({ vehicleId: '', date: today(), odometer: '', type: 'Maintenance request', description: '' })
  const [savingMileage, setSavingMileage] = useState(false)
  const [savingMaintenance, setSavingMaintenance] = useState(false)
  const [notice, setNotice] = useState('')
  const [validationError, setValidationError] = useState('')

  const { data: vehicles = [], isLoading } = useQuery({
    queryKey: ['employee_vehicle_list', user?.orgId],
    queryFn: async () => {
      if (!user?.orgId) return []
      const snapshot = await getDocs(query(collection(db, 'organisations', user.orgId, 'vehicles'), orderBy('createdAt', 'desc')))
      return snapshot.docs.map((document) => ({ id: document.id, ...document.data() }))
    },
    enabled: !!user?.orgId,
  })

  const { data: mileageEntries = [] } = useQuery({
    queryKey: ['employee_vehicle_mileage_conflicts', user?.orgId],
    queryFn: async () => {
      if (!user?.orgId) return []
      const snapshot = await getDocs(query(collection(db, 'organisations', user.orgId, 'vehicle_mileage'), orderBy('entry_date', 'desc')))
      return snapshot.docs.map((document) => ({ id: document.id, ...document.data() }))
    },
    enabled: !!user?.orgId && activeEntry === 'mileage',
  })

  const vehicleOptions = useMemo(() => vehicles.map((vehicle) => ({ id: vehicle.id, label: getVehicleLabel(vehicle), number: String(vehicle.vehicleNo || vehicle.regNo || '').toUpperCase() })), [vehicles])
  const selectedMileageVehicle = vehicleOptions.find((vehicle) => vehicle.id === mileage.vehicleId)
  const selectedMaintenanceVehicle = vehicleOptions.find((vehicle) => vehicle.id === maintenance.vehicleId)
  const totalKm = Math.max(0, Number(mileage.end || 0) - Number(mileage.start || 0))
  const inputClass = 'mt-1 h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm font-medium text-slate-800 outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100'

  const returnToActions = () => {
    closeEntry()
    setNotice('')
    setValidationError('')
  }

  const createMileageEntry = async ({ duplicateResolution = null, duplicateOfMileageEntryId = null } = {}) => {
    const parsed = mileageSchema.safeParse({ ...mileage, petrolAmount: mileage.petrolAmount === '' ? 0 : mileage.petrolAmount })
    if (!parsed.success || !selectedMileageVehicle) {
      setValidationError(parsed.success ? 'Select a vehicle.' : parsed.error.issues[0]?.message || 'Check the mileage details.')
      return
    }
    const petrolAmount = Number(parsed.data.petrolAmount || 0)
    if (petrolAmount > 0 && !employeeId) {
      setValidationError('Your employee profile must be linked before a petrol expense can be submitted.')
      return
    }

    setSavingMileage(true)
    try {
      const mileageRef = await addDoc(collection(db, 'organisations', user.orgId, 'vehicle_mileage'), {
        vehicleId: selectedMileageVehicle.id,
        vehicle_info: selectedMileageVehicle.label,
        vehicle_number: selectedMileageVehicle.number,
        entry_date: mileage.date,
        start_kilometer: Number(parsed.data.start),
        end_kilometer: Number(parsed.data.end),
        total_km: totalKm,
        petrolAmount,
        driver_name: user.name || user.email || 'Employee',
        employeeId: employeeId || null,
        createdBy: user.name || user.email || 'Employee',
        createdById: user.uid,
        duplicateResolution,
        duplicateOfMileageEntryId,
        source: 'employee_vehicle_portal',
        createdAt: serverTimestamp(),
      })

      let petrolMessage = ''
      if (petrolAmount > 0) {
        const datePart = mileage.date.replace(/-/g, '').slice(2)
        const transactionNo = `VEH-${datePart}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`
        const expenseRef = await addDoc(collection(db, 'organisations', user.orgId, 'advances_expenses'), {
          transactionNo,
          employeeId,
          employeeName: user.name || user.email || 'Employee',
          type: 'Expense',
          category: 'Vehicle Petrol',
          requestType: 'Reimbursement',
          payoutMethod: 'With Salary',
          amount: petrolAmount,
          date: mileage.date,
          reason: `Petrol for ${selectedMileageVehicle.label}, linked to mileage entry ${mileageRef.id}.`,
          project: '',
          status: 'Pending',
          approved_by: null,
          approved_at: null,
          hrApproval: 'Pending',
          mdApproval: 'Pending',
          createdBy: user.name || user.email || 'Employee',
          submittedByUid: user.uid,
          createdAt: serverTimestamp(),
          approvalSource: 'vehicle-mileage',
          approvalRequired: true,
          approvalWorkflow: 'standard',
          vehicleId: selectedMileageVehicle.id,
          vehicleNumber: selectedMileageVehicle.number,
          vehicleLabel: selectedMileageVehicle.label,
          linkedVehicleMileageId: mileageRef.id,
        })
        await updateDoc(doc(db, 'organisations', user.orgId, 'vehicle_mileage', mileageRef.id), { linkedExpenseId: expenseRef.id })
        petrolMessage = ' Petrol expense was also sent to Approvals.'
      }

      await logActivity(user.orgId, user, { module: 'Vehicle', action: petrolAmount > 0 ? 'EMPLOYEE_MILEAGE_AND_PETROL_SUBMITTED' : 'EMPLOYEE_MILEAGE_SUBMITTED', detail: `Mileage entry submitted for ${selectedMileageVehicle.label}: ${totalKm} KM on ${mileage.date}.${petrolAmount > 0 ? ` Petrol claim ₹${petrolAmount} linked to the mileage entry.` : ''}` })
      setMileage({ vehicleId: '', date: today(), start: '', end: '', petrolAmount: '' })
      clearConflict()
      setValidationError('')
      setNotice(`Mileage entry submitted successfully.${petrolMessage}`)
    } catch (error) {
      setValidationError(error.message || 'Unable to submit mileage.')
    } finally {
      setSavingMileage(false)
    }
  }

  const submitMileage = (event) => {
    event.preventDefault()
    setValidationError('')
    const parsed = mileageSchema.safeParse({ ...mileage, petrolAmount: mileage.petrolAmount === '' ? 0 : mileage.petrolAmount })
    if (!parsed.success || !selectedMileageVehicle) {
      setValidationError(parsed.success ? 'Select a vehicle.' : parsed.error.issues[0]?.message || 'Check the mileage details.')
      return
    }
    const existingEntry = mileageEntries.find((entry) => {
      const storedVehicleText = String(entry.vehicle_number || entry.vehicle_info || '').toUpperCase()
      const matchesVehicle = entry.vehicleId === selectedMileageVehicle.id || storedVehicleText.includes(selectedMileageVehicle.number)
      return matchesVehicle && entry.entry_date === mileage.date
    })
    if (existingEntry) {
      setConflictEntry(existingEntry)
      return
    }
    createMileageEntry()
  }

  const resolveAsAnotherTrip = () => createMileageEntry({ duplicateResolution: 'continued_additional_trip', duplicateOfMileageEntryId: conflictEntry?.id || null })

  const resolveAsMistake = () => {
    setConflictNotice({
      enteredBy: conflictEntry?.createdBy || conflictEntry?.driver_name || 'another employee',
      date: conflictEntry?.entry_date || mileage.date,
      label: conflictEntry?.vehicle_info || selectedMileageVehicle?.label || 'this vehicle',
    })
    setConflictEntry(null)
    setMileage((current) => ({ ...current, vehicleId: '' }))
  }

  const submitMaintenance = async (event) => {
    event.preventDefault()
    if (!selectedMaintenanceVehicle || !maintenance.description.trim()) return setValidationError('Select a vehicle and describe the maintenance request.')
    setSavingMaintenance(true)
    try {
      await addDoc(collection(db, 'organisations', user.orgId, 'vehicle_services'), {
        vehicleId: selectedMaintenanceVehicle.id,
        vehicleNo: selectedMaintenanceVehicle.number,
        vehicleLabel: selectedMaintenanceVehicle.label,
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
      setValidationError('')
      setNotice('Maintenance request submitted successfully.')
    } catch (error) {
      setValidationError(error.message || 'Unable to submit the maintenance request.')
    } finally {
      setSavingMaintenance(false)
    }
  }

  const entryHeader = (eyebrow, title, description) => (
    <header className="rounded-[12px] border border-gray-100 bg-white p-5 shadow-sm">
      <button type="button" onClick={returnToActions} className="mb-4 inline-flex items-center gap-1.5 text-xs font-semibold text-slate-500 hover:text-emerald-700"><ArrowLeft size={14} /> Back to vehicle entry</button>
      <p className="text-[11px] font-bold uppercase tracking-widest text-gray-400">{eyebrow}</p>
      <h2 className="mt-1 text-xl font-semibold tracking-tight text-gray-900">{title}</h2>
      <p className="mt-1 text-sm text-gray-500">{description}</p>
    </header>
  )

  const feedback = (message, tone = 'emerald') => message && <div className={`flex items-start gap-2 rounded-lg border px-4 py-3 text-sm font-medium ${tone === 'rose' ? 'border-rose-100 bg-rose-50 text-rose-800' : 'border-emerald-100 bg-emerald-50 text-emerald-800'}`}><CheckCircle2 size={17} className="mt-0.5 shrink-0" /> {message}</div>

  if (!activeEntry) {
    return (
      <div className="mx-auto w-full max-w-3xl space-y-5 pb-6 font-inter">
        <header className="rounded-[12px] border border-gray-100 bg-white p-5 shadow-sm">
          <p className="text-[11px] font-bold uppercase tracking-widest text-gray-400">Vehicle entry</p>
          <h2 className="mt-1 text-xl font-semibold tracking-tight text-gray-900">What would you like to do?</h2>
          <p className="mt-1 text-sm text-gray-500">Choose an entry type. Fleet records, service costs, and approvals remain with the vehicle team.</p>
        </header>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <button type="button" onClick={() => openEntry('mileage')} className="rounded-[12px] border border-gray-100 bg-white p-6 text-left shadow-sm transition hover:border-emerald-200 hover:bg-emerald-50/30"><span className="flex h-11 w-11 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600"><Gauge size={22} /></span><h3 className="mt-4 text-base font-semibold text-gray-900">Enter Mileage</h3><p className="mt-1 text-sm leading-6 text-gray-500">Select a vehicle and enter the starting and ending kilometer readings.</p></button>
          <button type="button" onClick={() => openEntry('maintenance')} className="rounded-[12px] border border-gray-100 bg-white p-6 text-left shadow-sm transition hover:border-amber-200 hover:bg-amber-50/30"><span className="flex h-11 w-11 items-center justify-center rounded-xl bg-amber-50 text-amber-600"><Wrench size={22} /></span><h3 className="mt-4 text-base font-semibold text-gray-900">Log Maintenance</h3><p className="mt-1 text-sm leading-6 text-gray-500">Select a vehicle, enter its kilometer reading, and describe the maintenance need.</p></button>
        </div>
      </div>
    )
  }

  if (activeEntry === 'mileage') {
    return (
      <div className="mx-auto w-full max-w-3xl space-y-5 pb-6 font-inter">
        {entryHeader('Vehicle entry', 'Enter mileage', 'Record the day’s kilometer readings. Add petrol only when you paid the amount yourself.')}
        {feedback(notice)}
        {feedback(validationError, 'rose')}
        {conflictNotice && <div className="rounded-lg border border-rose-100 bg-rose-50 px-4 py-3 text-sm leading-6 text-rose-800"><strong>This vehicle was already entered by {conflictNotice.enteredBy} on {formatConflictDate(conflictNotice.date)}.</strong> Please change the vehicle number and submit the correct entry.</div>}
        <section className="rounded-[12px] border border-gray-100 bg-white p-5 shadow-sm">
          <form onSubmit={submitMileage} className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <label className="text-[10px] font-bold uppercase tracking-widest text-slate-400 sm:col-span-2">Vehicle name - number<select value={mileage.vehicleId} onChange={(event) => { setMileage((current) => ({ ...current, vehicleId: event.target.value })); setConflictNotice(null); setValidationError('') }} className={inputClass} disabled={isLoading}><option value="">Select vehicle</option>{vehicleOptions.map((vehicle) => <option key={vehicle.id} value={vehicle.id}>{vehicle.label}</option>)}</select></label>
            <label className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Date<SharedDatePicker value={mileage.date} onChange={(date) => setMileage((current) => ({ ...current, date }))} /></label>
            <label className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Start kilometer<input type="number" min="0" value={mileage.start} onChange={(event) => setMileage((current) => ({ ...current, start: event.target.value }))} className={inputClass} /></label>
            <label className="text-[10px] font-bold uppercase tracking-widest text-slate-400">End kilometer<input type="number" min="0" value={mileage.end} onChange={(event) => setMileage((current) => ({ ...current, end: event.target.value }))} className={inputClass} /></label>
            <div className="rounded-lg border border-slate-100 bg-slate-50 px-3 py-2"><p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Distance</p><p className="mt-1 text-sm font-semibold text-slate-900">{totalKm} KM</p></div>
            <label className="text-[10px] font-bold uppercase tracking-widest text-slate-400 sm:col-span-2">Petrol amount <span className="font-normal normal-case text-slate-400">optional, creates an expense request</span><input type="number" min="0" step="0.01" value={mileage.petrolAmount} onChange={(event) => setMileage((current) => ({ ...current, petrolAmount: event.target.value }))} className={inputClass} placeholder="0.00" /></label>
            <button type="submit" disabled={savingMileage || isLoading} className="sm:col-span-2 rounded-xl bg-emerald-600 px-5 py-3 text-xs font-bold uppercase tracking-wide text-white hover:bg-emerald-700 disabled:opacity-50">{savingMileage ? 'Submitting…' : 'Submit mileage'}</button>
          </form>
        </section>
        {conflictEntry && (
          <div className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-950/40 p-4 backdrop-blur-sm">
            <div className="w-full max-w-md rounded-2xl border border-amber-100 bg-white p-5 shadow-2xl">
              <div className="flex items-start justify-between gap-4"><div className="flex gap-3"><span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-50 text-amber-600"><AlertTriangle size={20} /></span><div><p className="text-[10px] font-bold uppercase tracking-widest text-amber-700">Possible duplicate vehicle entry</p><h3 className="mt-1 text-lg font-semibold text-slate-900">This vehicle already has an entry</h3></div></div><button type="button" onClick={() => setConflictEntry(null)} className="rounded-lg p-1 text-slate-400 hover:bg-slate-100"><X size={18} /></button></div>
              <p className="mt-4 text-sm leading-6 text-slate-600"><strong>{conflictEntry.createdBy || conflictEntry.driver_name || 'Another employee'}</strong> entered <strong>{conflictEntry.vehicle_info || selectedMileageVehicle?.label}</strong> on {formatConflictDate(conflictEntry.entry_date)}. Choose the correct action.</p>
              <div className="mt-5 grid grid-cols-1 gap-2">
                <button type="button" onClick={resolveAsMistake} className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-left text-sm font-semibold text-slate-700 hover:bg-slate-50">Back to change number</button>
                <button type="button" onClick={resolveAsAnotherTrip} disabled={savingMileage} className="rounded-xl bg-emerald-600 px-4 py-3 text-left text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50">Continue <span className="block text-xs font-normal text-emerald-100">This is a second trip using the same vehicle.</span></button>
                <button type="button" onClick={resolveAsMistake} className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-left text-sm font-semibold text-rose-700 hover:bg-rose-100">They are mistaken <span className="block text-xs font-normal text-rose-600">Show the earlier entry and change the vehicle number.</span></button>
              </div>
            </div>
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="mx-auto w-full max-w-3xl space-y-5 pb-6 font-inter">
      {entryHeader('Vehicle entry', 'Log maintenance', 'Submit a maintenance request for the selected vehicle. Do not enter any cost here.')}
      {feedback(notice)}
      {feedback(validationError, 'rose')}
      <section className="rounded-[12px] border border-gray-100 bg-white p-5 shadow-sm">
        <form onSubmit={submitMaintenance} className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <label className="text-[10px] font-bold uppercase tracking-widest text-slate-400 sm:col-span-2">Vehicle name - number<select value={maintenance.vehicleId} onChange={(event) => setMaintenance((current) => ({ ...current, vehicleId: event.target.value }))} className={inputClass} disabled={isLoading}><option value="">Select vehicle</option>{vehicleOptions.map((vehicle) => <option key={vehicle.id} value={vehicle.id}>{vehicle.label}</option>)}</select></label>
          <label className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Date<SharedDatePicker value={maintenance.date} onChange={(date) => setMaintenance((current) => ({ ...current, date }))} /></label>
          <label className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Current kilometer<input type="number" min="0" value={maintenance.odometer} onChange={(event) => setMaintenance((current) => ({ ...current, odometer: event.target.value }))} className={inputClass} /></label>
          <label className="text-[10px] font-bold uppercase tracking-widest text-slate-400 sm:col-span-2">Request type<select value={maintenance.type} onChange={(event) => setMaintenance((current) => ({ ...current, type: event.target.value }))} className={inputClass}><option>Maintenance request</option><option>Breakdown</option><option>Tyre issue</option><option>Chain adjustment</option><option>Service required</option></select></label>
          <label className="text-[10px] font-bold uppercase tracking-widest text-slate-400 sm:col-span-2">Describe the issue<textarea required rows="3" value={maintenance.description} onChange={(event) => setMaintenance((current) => ({ ...current, description: event.target.value }))} className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-800 outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100" /></label>
          <button type="submit" disabled={savingMaintenance || isLoading} className="sm:col-span-2 rounded-xl border border-amber-200 bg-amber-50 px-5 py-3 text-xs font-bold uppercase tracking-wide text-amber-700 hover:bg-amber-100 disabled:opacity-50">{savingMaintenance ? 'Submitting…' : 'Submit maintenance request'}</button>
        </form>
      </section>
    </div>
  )
}
