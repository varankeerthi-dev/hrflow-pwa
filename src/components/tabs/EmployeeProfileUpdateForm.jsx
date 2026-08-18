import React, { useEffect, useMemo, useState } from 'react'
import { CheckCircle2, FilePenLine, Lock } from 'lucide-react'
import { addDoc, collection, onSnapshot, query, serverTimestamp, where } from 'firebase/firestore'
import { db } from '../../lib/firebase'
import { useAuth } from '../../hooks/useAuth'
import { logActivity } from '../../hooks/useActivityLog'

const editableFields = [
  'fatherName', 'motherName', 'dob', 'bloodGroup', 'maritalStatus',
  'contactNo', 'mobileNo', 'personalNo', 'officeNo', 'emergencyContact',
  'address', 'aadharNo', 'panNo', 'drivingLicenseNo', 'personalBank',
]

const personalBankDefaults = { accountNo: '', ifsc: '', bankName: '', holderName: '' }

const emptyForm = (employee) => ({
  fatherName: employee?.fatherName || '',
  motherName: employee?.motherName || '',
  dob: employee?.dob || '',
  bloodGroup: employee?.bloodGroup || '',
  maritalStatus: employee?.maritalStatus || '',
  contactNo: employee?.contactNo || '',
  mobileNo: employee?.mobileNo || employee?.contactNo || '',
  personalNo: employee?.personalNo || '',
  officeNo: employee?.officeNo || '',
  emergencyContact: employee?.emergencyContact || '',
  address: employee?.address || '',
  aadharNo: employee?.aadharNo || '',
  panNo: employee?.panNo || '',
  drivingLicenseNo: employee?.drivingLicenseNo || '',
  personalBank: { ...personalBankDefaults, ...(employee?.personalBank || {}) },
})

const unchanged = (left, right) => JSON.stringify(left) === JSON.stringify(right)

function Field({ label, children, className = '' }) {
  return <label className={`block ${className}`}><span className="mb-1.5 block text-[10px] font-bold uppercase tracking-widest text-slate-400">{label}</span>{children}</label>
}

const inputClass = 'h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm font-medium text-slate-800 outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100'

export default function EmployeeProfileUpdateForm({ employee }) {
  const { user } = useAuth()
  const initialForm = useMemo(() => emptyForm(employee), [employee])
  const [form, setForm] = useState(initialForm)
  const [saving, setSaving] = useState(false)
  const [submitted, setSubmitted] = useState(false)

  useEffect(() => setForm(initialForm), [initialForm])

  useEffect(() => {
    if (!user?.orgId || !employee?.id) return undefined
    const updatesQuery = query(
      collection(db, 'organisations', user.orgId, 'employee_profile_updates'),
      where('employeeId', '==', employee.id)
    )
    return onSnapshot(updatesQuery, (snapshot) => setSubmitted(snapshot.docs.some((document) => document.data().status === 'Pending')), (error) => console.error('Employee profile status error:', error))
  }, [employee?.id, user?.orgId])

  const setValue = (field, value) => setForm((current) => ({ ...current, [field]: value }))
  const setBankValue = (field, value) => setForm((current) => ({ ...current, personalBank: { ...current.personalBank, [field]: value } }))

  const submit = async (event) => {
    event.preventDefault()
    if (!user?.orgId || !employee?.id || saving) return
    if (unchanged(form, initialForm)) {
      alert('Update at least one detail before submitting.')
      return
    }

    setSaving(true)
    try {
      await addDoc(collection(db, 'organisations', user.orgId, 'employee_profile_updates'), {
        employeeId: employee.id,
        employeeName: employee.name || user.name || 'Employee',
        employeeEmail: user.email || employee.email || '',
        submittedByUid: user.uid,
        submittedByName: user.name || employee.name || 'Employee',
        status: 'Pending',
        requestedFields: form,
        submittedAt: serverTimestamp(),
      })
      await logActivity(user.orgId, user, {
        module: 'Employee Portal',
        action: 'EMPLOYEE_PROFILE_UPDATE_SUBMITTED',
        detail: `${employee.name || user.name || 'Employee'} submitted a profile data update for HR review.`,
      })
      setSubmitted(true)
    } catch (error) {
      alert(error.message || 'Unable to submit your profile update.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <section className="mt-10 rounded-[12px] border border-gray-100 bg-white p-5 shadow-sm md:p-6">
      <div className="flex flex-col gap-3 border-b border-gray-100 pb-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-widest text-gray-400">Profile details</p>
          <h3 className="mt-1 text-lg font-semibold text-gray-900">Update your employee information</h3>
          <p className="mt-1 max-w-2xl text-sm leading-6 text-gray-500">Submit the details below for HR to validate and save to your official employee record.</p>
        </div>
        <span className="inline-flex w-fit items-center gap-1.5 rounded-full bg-slate-100 px-3 py-1 text-[11px] font-semibold text-slate-600"><Lock size={12} /> Email is managed by HR</span>
      </div>

      {submitted && <div className="mt-4 flex items-start gap-3 rounded-lg border border-emerald-100 bg-emerald-50 px-4 py-3 text-sm text-emerald-800"><CheckCircle2 size={18} className="mt-0.5 shrink-0" /><span>Your profile update was submitted successfully. HR will validate the information before it is added to your employee record.</span></div>}

      <form onSubmit={submit} className="mt-6 space-y-7">
        <section>
          <h4 className="mb-4 flex items-center gap-2 text-sm font-semibold text-slate-900"><FilePenLine size={16} className="text-emerald-600" /> Personal details</h4>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <Field label="Full name"><input value={employee?.name || user?.name || ''} disabled className={`${inputClass} cursor-not-allowed bg-slate-50 text-slate-400`} /></Field>
            <Field label="Email"><input value={user?.email || employee?.email || ''} disabled className={`${inputClass} cursor-not-allowed bg-slate-50 text-slate-400`} /></Field>
            <Field label="Father's name"><input value={form.fatherName} onChange={(event) => setValue('fatherName', event.target.value)} className={inputClass} /></Field>
            <Field label="Mother's name"><input value={form.motherName} onChange={(event) => setValue('motherName', event.target.value)} className={inputClass} /></Field>
            <Field label="Date of birth"><input type="date" value={form.dob} onChange={(event) => setValue('dob', event.target.value)} className={inputClass} /></Field>
            <Field label="Blood group"><input value={form.bloodGroup} onChange={(event) => setValue('bloodGroup', event.target.value)} className={inputClass} placeholder="Example: O+" /></Field>
            <Field label="Marital status"><select value={form.maritalStatus} onChange={(event) => setValue('maritalStatus', event.target.value)} className={inputClass}><option value="">Select status</option><option>Single</option><option>Married</option><option>Other</option></select></Field>
            <Field label="Aadhaar number"><input value={form.aadharNo} onChange={(event) => setValue('aadharNo', event.target.value)} className={inputClass} /></Field>
            <Field label="PAN number"><input value={form.panNo} onChange={(event) => setValue('panNo', event.target.value)} className={inputClass} /></Field>
            <Field label="Driving licence"><input value={form.drivingLicenseNo} onChange={(event) => setValue('drivingLicenseNo', event.target.value)} className={inputClass} /></Field>
          </div>
        </section>

        <section>
          <h4 className="mb-4 text-sm font-semibold text-slate-900">Contact and address</h4>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <Field label="Mobile number"><input value={form.mobileNo} onChange={(event) => { setValue('mobileNo', event.target.value); setValue('contactNo', event.target.value) }} className={inputClass} /></Field>
            <Field label="Office number"><input value={form.officeNo} onChange={(event) => setValue('officeNo', event.target.value)} className={inputClass} /></Field>
            <Field label="Personal number"><input value={form.personalNo} onChange={(event) => setValue('personalNo', event.target.value)} className={inputClass} /></Field>
            <Field label="Emergency contact"><input value={form.emergencyContact} onChange={(event) => setValue('emergencyContact', event.target.value)} className={inputClass} /></Field>
            <Field label="Permanent address" className="sm:col-span-2 lg:col-span-2"><textarea value={form.address} onChange={(event) => setValue('address', event.target.value)} rows="3" className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-800 outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100" /></Field>
          </div>
        </section>

        <section>
          <h4 className="mb-4 text-sm font-semibold text-slate-900">Personal bank details</h4>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Field label="Account holder"><input value={form.personalBank.holderName} onChange={(event) => setBankValue('holderName', event.target.value)} className={inputClass} /></Field>
            <Field label="Bank name"><input value={form.personalBank.bankName} onChange={(event) => setBankValue('bankName', event.target.value)} className={inputClass} /></Field>
            <Field label="Account number"><input value={form.personalBank.accountNo} onChange={(event) => setBankValue('accountNo', event.target.value)} className={inputClass} /></Field>
            <Field label="IFSC"><input value={form.personalBank.ifsc} onChange={(event) => setBankValue('ifsc', event.target.value.toUpperCase())} className={inputClass} /></Field>
          </div>
        </section>

        <div className="flex justify-end border-t border-gray-100 pt-5">
          <button type="submit" disabled={saving || submitted} className="rounded-xl bg-emerald-600 px-5 py-3 text-xs font-bold uppercase tracking-wide text-white shadow-sm hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50">{saving ? 'Submitting…' : submitted ? 'Submitted to HR' : 'Submit details'}</button>
        </div>
      </form>
    </section>
  )
}
