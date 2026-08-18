import React, { useEffect, useMemo, useState } from 'react'
import { Check, ClipboardCheck, Clock3, FilePenLine, X } from 'lucide-react'
import { collection, doc, onSnapshot, orderBy, query, serverTimestamp, updateDoc, writeBatch } from 'firebase/firestore'
import { db } from '../../lib/firebase'
import { useAuth } from '../../hooks/useAuth'
import { useEmployees } from '../../hooks/useEmployees'
import { logActivity } from '../../hooks/useActivityLog'

const valueLabel = (value) => {
  if (value === undefined || value === null || value === '') return '—'
  if (typeof value === 'object') return Object.entries(value).filter(([, item]) => item).map(([key, item]) => `${key.replace(/([A-Z])/g, ' $1')}: ${item}`).join(' · ') || '—'
  return String(value)
}

const formatSubmittedAt = (value) => {
  const date = value?.toDate ? value.toDate() : value ? new Date(value) : null
  return date && !Number.isNaN(date.getTime()) ? date.toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' }) : 'Just now'
}

export default function EmployeeProfileUpdatesTab() {
  const { user } = useAuth()
  const { employees } = useEmployees(user?.orgId)
  const [updates, setUpdates] = useState([])
  const [loading, setLoading] = useState(true)
  const [processingId, setProcessingId] = useState(null)

  useEffect(() => {
    if (!user?.orgId) return undefined
    const updatesQuery = query(collection(db, 'organisations', user.orgId, 'employee_profile_updates'), orderBy('submittedAt', 'desc'))
    return onSnapshot(updatesQuery, (snapshot) => {
      setUpdates(snapshot.docs.map((document) => ({ id: document.id, ...document.data() })))
      setLoading(false)
    }, (error) => {
      console.error('Employee profile update review error:', error)
      setLoading(false)
    })
  }, [user?.orgId])

  const employeeMap = useMemo(() => new Map(employees.map((employee) => [employee.id, employee])), [employees])
  const pendingUpdates = updates.filter((update) => update.status === 'Pending')
  const reviewedUpdates = updates.filter((update) => update.status !== 'Pending')

  const reviewUpdate = async (update, decision) => {
    if (!user?.orgId || processingId) return
    setProcessingId(update.id)
    try {
      const updateRef = doc(db, 'organisations', user.orgId, 'employee_profile_updates', update.id)
      const reviewPayload = {
        status: decision,
        reviewedAt: serverTimestamp(),
        reviewedByUid: user.uid,
        reviewedByName: user.name || user.email || 'HR',
      }

      if (decision === 'Approved') {
        const batch = writeBatch(db)
        batch.update(doc(db, 'organisations', user.orgId, 'employees', update.employeeId), {
          ...(update.requestedFields || {}),
          profileDataUpdatedAt: serverTimestamp(),
          profileDataUpdatedByUid: user.uid,
          profileDataUpdateRequestId: update.id,
          updatedAt: serverTimestamp(),
        })
        batch.update(updateRef, reviewPayload)
        await batch.commit()
      } else {
        await updateDoc(updateRef, reviewPayload)
      }

      await logActivity(user.orgId, user, {
        module: 'Employees',
        action: `EMPLOYEE_PROFILE_UPDATE_${decision.toUpperCase()}`,
        detail: `${decision === 'Approved' ? 'Approved' : 'Rejected'} profile update submitted by ${update.employeeName || 'employee'} on ${formatSubmittedAt(update.submittedAt)}.`,
      })
    } catch (error) {
      alert(error.message || 'Unable to review this employee update.')
    } finally {
      setProcessingId(null)
    }
  }

  const renderUpdate = (update, isReviewed = false) => {
    const currentEmployee = employeeMap.get(update.employeeId)
    return (
      <article key={update.id} className="border-b border-slate-100 px-4 py-4 last:border-b-0 sm:px-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-sm font-semibold text-slate-900">{update.employeeName || currentEmployee?.name || 'Employee'}</h3>
              <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${update.status === 'Approved' ? 'bg-emerald-50 text-emerald-700' : update.status === 'Rejected' ? 'bg-rose-50 text-rose-700' : 'bg-amber-50 text-amber-700'}`}>{update.status || 'Pending'}</span>
            </div>
            <p className="mt-1 text-xs text-slate-500">Submitted {formatSubmittedAt(update.submittedAt)} · {update.employeeEmail || 'No email recorded'}</p>
          </div>
          {!isReviewed && (
            <div className="flex gap-2">
              <button type="button" disabled={processingId === update.id} onClick={() => reviewUpdate(update, 'Approved')} className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-2 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"><Check size={14} /> Approve & save</button>
              <button type="button" disabled={processingId === update.id} onClick={() => reviewUpdate(update, 'Rejected')} className="inline-flex items-center gap-1.5 rounded-lg border border-rose-200 px-3 py-2 text-xs font-semibold text-rose-600 hover:bg-rose-50 disabled:opacity-50"><X size={14} /> Reject</button>
            </div>
          )}
        </div>
        <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2">
          {Object.entries(update.requestedFields || {}).map(([field, nextValue]) => (
            <div key={field} className="rounded-lg border border-slate-100 bg-slate-50/70 px-3 py-2.5">
              <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">{field.replace(/([A-Z])/g, ' $1')}</p>
              <p className="mt-1 text-xs font-medium text-slate-800">{valueLabel(nextValue)}</p>
              <p className="mt-1 text-[11px] text-slate-400">Current: {valueLabel(currentEmployee?.[field])}</p>
            </div>
          ))}
        </div>
        {isReviewed && <p className="mt-3 text-[11px] text-slate-500">Reviewed by {update.reviewedByName || 'HR'} · {formatSubmittedAt(update.reviewedAt)}</p>}
      </article>
    )
  }

  return (
    <div className="mx-auto w-full max-w-6xl space-y-5 pb-6">
      <header className="rounded-[12px] border border-gray-100 bg-white p-5 shadow-sm">
        <p className="text-[11px] font-bold uppercase tracking-widest text-gray-400">Employee data</p>
        <div className="mt-1 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 className="text-xl font-semibold tracking-tight text-gray-900">Profile update review</h2>
            <p className="mt-1 text-sm text-gray-500">Review employee-submitted changes before writing them to the official employee record.</p>
          </div>
          <span className="inline-flex w-fit items-center gap-1.5 rounded-full bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-700"><Clock3 size={13} /> {pendingUpdates.length} pending</span>
        </div>
      </header>

      <section className="overflow-hidden rounded-[12px] border border-gray-100 bg-white shadow-sm">
        <div className="flex items-center gap-2 border-b border-gray-100 px-4 py-3 sm:px-5"><ClipboardCheck size={16} className="text-emerald-600" /><h2 className="text-sm font-semibold text-gray-900">Pending employee submissions</h2></div>
        {loading ? <p className="px-5 py-8 text-sm text-gray-400">Loading profile updates…</p> : pendingUpdates.length ? pendingUpdates.map((update) => renderUpdate(update)) : <p className="px-5 py-8 text-sm text-gray-400">No employee profile updates are awaiting review.</p>}
      </section>

      {reviewedUpdates.length > 0 && (
        <section className="overflow-hidden rounded-[12px] border border-gray-100 bg-white shadow-sm">
          <div className="flex items-center gap-2 border-b border-gray-100 px-4 py-3 sm:px-5"><FilePenLine size={16} className="text-slate-500" /><h2 className="text-sm font-semibold text-gray-900">Review history</h2></div>
          {reviewedUpdates.slice(0, 20).map((update) => renderUpdate(update, true))}
        </section>
      )}
    </div>
  )
}
