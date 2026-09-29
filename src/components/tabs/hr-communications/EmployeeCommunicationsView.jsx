import React, { useMemo, useState } from 'react'
import { useAuth } from '../../../hooks/useAuth'
import { useEmployeeCommunications } from '../../../hooks/useEmployeeCommunications'
import { BookOpenCheck, CheckCircle2, FileText, GraduationCap, Megaphone, X } from 'lucide-react'
import { isActiveCommunication, statusTone } from '../../../lib/communications'

const iconFor = (type) => type === 'letter' ? FileText : type === 'policy' ? BookOpenCheck : type === 'training' ? GraduationCap : Megaphone
const titleFor = (delivery) => delivery?.titleSnapshot || (delivery?.sourceType === 'policy' ? 'Policy document' : delivery?.sourceType === 'training' ? 'Training invitation' : 'HR update')
const dateFor = (delivery) => delivery?.sessionDate ? `Session ${delivery.sessionDate}` : delivery?.effectiveDate ? `Effective ${delivery.effectiveDate}` : ''
const statusLabel = (delivery) => delivery.acknowledgementMode === 'acknowledged' && delivery.status !== 'acknowledged'
  ? 'Action required'
  : delivery.status === 'delivered' ? 'Unread' : delivery.status === 'seen' ? 'Seen' : 'Acknowledged'

export default function EmployeeCommunicationsView({ employeeId }) {
  const { user } = useAuth()
  const { deliveries, acknowledge: acknowledgeDelivery, loading } = useEmployeeCommunications(user?.orgId, employeeId, user)
  const [selected, setSelected] = useState(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const inbox = useMemo(() => deliveries
    .filter((delivery) => isActiveCommunication({ state: delivery.sourceState || (delivery.sourceType === 'letter' ? 'issued' : 'published'), expiresAt: delivery.expiresAt }))
    .sort((a, b) => (b.updatedAt?.seconds || 0) - (a.updatedAt?.seconds || 0)), [deliveries])

  const openDelivery = async (delivery) => {
    setSelected(delivery)
    setError('')
    if (delivery.status !== 'delivered') return
    try {
      await acknowledgeDelivery(delivery.id, 'seen')
      setSelected((current) => current?.id === delivery.id ? { ...current, status: 'seen' } : current)
    } catch (actionError) {
      setError(actionError?.message || 'Unable to mark this update as seen. You can retry by opening it again.')
    }
  }

  const acknowledge = async (deliveryId) => {
    setBusy(true)
    setError('')
    try {
      await acknowledgeDelivery(deliveryId, 'acknowledged')
      setSelected((current) => current?.id === deliveryId ? { ...current, status: 'acknowledged' } : current)
    } catch (actionError) {
      setError(actionError?.message || 'Unable to record your acknowledgement. Please try again.')
    } finally {
      setBusy(false)
    }
  }

  if (loading) return <div className="rounded-[12px] border border-gray-100 bg-white p-8 text-center text-[12px] font-medium text-slate-500">Loading documents and updates…</div>

  return <div className="mx-auto max-w-5xl space-y-4">
    <div className="rounded-[12px] border border-gray-100 bg-white p-5 shadow-sm">
      <p className="text-[10px] font-bold uppercase tracking-widest text-indigo-600">Employee inbox</p>
      <h2 className="mt-1 text-xl font-semibold tracking-tight text-slate-900">Documents &amp; Updates</h2>
      <p className="mt-2 text-[12px] leading-5 text-slate-500">Your issued HR letters, required reading, announcements, and training invitations appear here. Opening an update records that you have seen it; items asking for acknowledgement need one extra confirmation.</p>
    </div>
    {inbox.length === 0 ? <div className="rounded-[12px] border border-gray-100 bg-white p-10 text-center shadow-sm">
      <FileText className="mx-auto text-slate-300" size={28} />
      <p className="mt-3 text-[13px] font-semibold text-slate-700">No documents or updates yet</p>
      <p className="mt-1 text-[12px] text-slate-400">HR communications sent to you will appear here.</p>
    </div> : <div className="overflow-hidden rounded-[12px] border border-gray-100 bg-white shadow-sm">
      {inbox.map((delivery) => {
        const Icon = iconFor(delivery.sourceType)
        return <button key={delivery.id} type="button" onClick={() => openDelivery(delivery)} className="flex w-full items-start gap-3 border-b border-slate-100 px-4 py-4 text-left last:border-b-0 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-600">
          <div className="mt-0.5 rounded-lg bg-indigo-50 p-2 text-indigo-600"><Icon size={16} /></div>
          <div className="min-w-0 flex-1">
            <div className="flex items-start justify-between gap-3"><p className="truncate text-[13px] font-semibold text-slate-800">{titleFor(delivery)}</p><span className={`shrink-0 rounded-full border px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide ${statusTone(delivery.status === 'delivered' && delivery.acknowledgementMode === 'acknowledged' ? 'pending_approval' : delivery.status)}`}>{statusLabel(delivery)}</span></div>
            <p className="mt-1 line-clamp-2 text-[11px] leading-5 text-slate-500">{delivery.bodySnapshot || 'Open to view this HR communication.'}</p>
            {dateFor(delivery) && <p className="mt-1 text-[10px] font-medium text-slate-500">{dateFor(delivery)}</p>}
          </div>
        </button>
      })}
    </div>}
    {selected && <div className="fixed inset-0 z-[120] flex items-end bg-slate-950/30 p-0 sm:items-center sm:justify-center sm:p-6" onMouseDown={(event) => { if (event.target === event.currentTarget) setSelected(null) }}>
      <div role="dialog" aria-modal="true" aria-labelledby="employee-communication-title" className="max-h-[88vh] w-full overflow-y-auto rounded-t-[16px] bg-white p-5 shadow-2xl sm:max-w-xl sm:rounded-[16px]">
        <div className="flex items-start justify-between gap-3"><div><p className="text-[10px] font-bold uppercase tracking-widest text-indigo-600">{selected.sourceType}</p><h3 id="employee-communication-title" className="mt-1 text-lg font-semibold text-slate-900">{titleFor(selected)}</h3></div><button type="button" aria-label="Close communication" onClick={() => { setSelected(null); setError('') }} className="rounded-lg p-2 text-slate-400 hover:bg-slate-100"><X size={18} /></button></div>
        <div className="mt-5 whitespace-pre-wrap rounded-lg border border-slate-100 bg-slate-50/50 p-4 text-[13px] leading-6 text-slate-700">{selected.bodySnapshot || 'No additional content was included.'}</div>
        {error && <p role="alert" className="mt-4 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-[12px] text-rose-700">{error}</p>}
        {selected.acknowledgementMode === 'acknowledged' && selected.status !== 'acknowledged' ? <button type="button" disabled={busy} onClick={() => acknowledge(selected.id)} className="mt-5 flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-emerald-600 text-[12px] font-semibold text-white hover:bg-emerald-700 disabled:opacity-60"><CheckCircle2 size={16} />{busy ? 'Recording…' : 'I have read and understood'}</button> : <p className="mt-5 text-center text-[11px] font-medium text-slate-500">{selected.status === 'acknowledged' ? 'Acknowledgement recorded.' : selected.status === 'seen' ? 'Seen in your HRFlow employee inbox.' : 'Opened in your HRFlow employee inbox.'}</p>}
      </div>
    </div>}
  </div>
}
