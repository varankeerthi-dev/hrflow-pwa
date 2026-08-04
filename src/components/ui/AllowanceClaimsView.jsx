import React, { useState } from 'react'
import { useAuth } from '../../hooks/useAuth'
import { useAllowanceClaims } from '../../hooks/useAllowances'
import { CheckCircle2, XCircle, Banknote, RefreshCw, Trash2, Clock } from 'lucide-react'
import Spinner from '../ui/Spinner'

function formatDateDMY(dateStr) {
  if (!dateStr) return '—'
  const s = String(dateStr).trim()
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (iso) return `${iso[3]}/${iso[2]}/${iso[1]}`
  return s
}

function formatINR(amount) {
  const n = Number(amount)
  if (!Number.isFinite(n)) return '₹0'
  return '₹' + n.toLocaleString('en-IN')
}

/**
 * Reusable allowance claims queue.
 * mode = 'approval' | 'payment'
 *  - approval: shows Pending claims with Approve/Reject (used in Approvals tab)
 *  - payment:  shows Approved + Unpaid claims with Pay Now (used in Accountant/Approvals payment queue)
 */
export default function AllowanceClaimsView({ mode = 'approval', canManage = true }) {
  const { user } = useAuth()
  const { claims, loading, fetchClaims, approveClaim, rejectClaim, markClaimPaid, deleteClaim } = useAllowanceClaims(user?.orgId)
  const [busyId, setBusyId] = useState(null)

  const rows = (claims || [])
    .filter(c => {
      if (mode === 'payment') return c.status === 'Approved' && c.paymentStatus !== 'Paid'
      return c.status === 'Pending'
    })
    .sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')))

  const run = async (id, fn) => {
    setBusyId(id)
    try {
      await fn()
    } catch (err) {
      alert('Action failed: ' + (err.message || 'Unknown error'))
    } finally {
      setBusyId(null)
    }
  }

  if (loading) {
    return <div className="py-20 flex justify-center"><Spinner /></div>
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-[12px] font-bold uppercase tracking-widest text-zinc-500">
            {mode === 'payment' ? 'Allowance Payment Queue' : 'Allowance Approval Queue'}
          </h3>
          <p className="mt-0.5 text-[11px] text-zinc-400">
            {mode === 'payment'
              ? 'Approved allowances awaiting payment.'
              : 'Allowance claims raised from the attendance sheet.'}
          </p>
        </div>
        <button
          type="button"
          onClick={fetchClaims}
          className="h-9 px-3 rounded-lg border border-gray-200 bg-white text-[11px] font-black uppercase tracking-widest text-gray-600 hover:bg-gray-50 flex items-center gap-2"
        >
          <RefreshCw size={14} />
          Refresh
        </button>
      </div>

      {rows.length === 0 ? (
        <div className="rounded-xl border border-gray-200 bg-white py-16 text-center text-[11px] font-bold uppercase tracking-widest text-gray-400">
          {mode === 'payment' ? 'No allowances pending payment.' : 'No allowance claims pending approval.'}
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-sm">
          <table className="w-full text-left border-collapse">
            <thead className="bg-zinc-50/80 border-b border-zinc-200">
              <tr>
                <th className="h-10 px-4 text-left align-middle text-[10px] font-bold uppercase tracking-widest text-zinc-500 border-r border-zinc-200">Date</th>
                <th className="h-10 px-4 text-left align-middle text-[10px] font-bold uppercase tracking-widest text-zinc-500 border-r border-zinc-200">Employee</th>
                <th className="h-10 px-4 text-left align-middle text-[10px] font-bold uppercase tracking-widest text-zinc-500 border-r border-zinc-200">Allowance</th>
                <th className="h-10 px-4 text-right align-middle text-[10px] font-bold uppercase tracking-widest text-zinc-500 border-r border-zinc-200">Amount</th>
                <th className="h-10 px-4 text-left align-middle text-[10px] font-bold uppercase tracking-widest text-zinc-500 border-r border-zinc-200">Out Time</th>
                <th className="h-10 px-4 text-left align-middle text-[10px] font-bold uppercase tracking-widest text-zinc-500 border-r border-zinc-200">Status</th>
                {canManage && <th className="h-10 px-4 text-right align-middle text-[10px] font-bold uppercase tracking-widest text-zinc-500">Action</th>}
              </tr>
            </thead>
            <tbody className="[&_tr:last-child]:border-0">
              {rows.map(c => {
                const busy = busyId === c.id
                return (
                  <tr key={c.id} className="h-12 hover:bg-zinc-50/40 transition-colors border-b border-zinc-100">
                    <td className="px-4 text-[12px] font-bold text-zinc-700 whitespace-nowrap">{formatDateDMY(c.date)}</td>
                    <td className="px-4 text-[13px] font-bold text-zinc-800">{c.employeeName}</td>
                    <td className="px-4 text-[12px] text-zinc-600">{c.categoryName}</td>
                    <td className="px-4 text-right text-[14px] font-bold text-indigo-600 tabular-nums">{formatINR(c.amount)}</td>
                    <td className="px-4 text-[12px] text-zinc-600 flex items-center gap-1 whitespace-nowrap">
                      <Clock size={12} className="text-zinc-400" />
                      {c.outTime || '—'}
                    </td>
                    <td className="px-4">
                      <span className={`inline-flex px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wide ${
                        c.status === 'Approved'
                          ? 'bg-emerald-50 text-emerald-700'
                          : c.status === 'Rejected'
                            ? 'bg-rose-50 text-rose-700'
                            : 'bg-amber-50 text-amber-700'
                      }`}>
                        {c.status === 'Approved' ? 'Approved' : c.status === 'Rejected' ? 'Rejected' : 'Pending'}
                      </span>
                    </td>
                    {canManage && (
                      <td className="px-4">
                        <div className="flex items-center gap-2 justify-end">
                          {mode === 'payment' ? (
                            <button
                              type="button"
                              disabled={busy}
                              onClick={() => run(c.id, () => markClaimPaid(c.id, user))}
                              className="h-8 px-4 bg-emerald-600 text-white rounded-lg text-[10px] font-black uppercase tracking-widest shadow-lg shadow-emerald-200 hover:bg-emerald-700 active:scale-95 transition-all disabled:opacity-50"
                            >
                              {busy ? 'Paying...' : <span className="flex items-center gap-1"><Banknote size={12} /> Pay Now</span>}
                            </button>
                          ) : (
                            <>
                              <button
                                type="button"
                                disabled={busy}
                                onClick={() => run(c.id, () => approveClaim(c.id, user))}
                                className="h-8 px-3 bg-emerald-600 text-white rounded-lg text-[10px] font-black uppercase tracking-widest hover:bg-emerald-700 disabled:opacity-50"
                              >
                                {busy ? 'Saving...' : <span className="flex items-center gap-1"><CheckCircle2 size={12} /> Approve</span>}
                              </button>
                              <button
                                type="button"
                                disabled={busy}
                                onClick={() => {
                                  const reason = window.prompt('Enter rejection reason (optional)')
                                  if (reason === null) return
                                  run(c.id, () => rejectClaim(c.id, user, reason))
                                }}
                                className="h-8 px-3 bg-rose-600 text-white rounded-lg text-[10px] font-black uppercase tracking-widest hover:bg-rose-700 disabled:opacity-50 flex items-center gap-1"
                              >
                                <XCircle size={12} />
                                Reject
                              </button>
                            </>
                          )}
                          {mode === 'payment' && (
                            <button
                              type="button"
                              title="Delete claim"
                              onClick={() => {
                                if (confirm(`Delete allowance claim for ${c.employeeName} (${c.categoryName})?`)) {
                                  run(c.id, () => deleteClaim(c.id))
                                }
                              }}
                              className="p-2 rounded-lg text-zinc-300 hover:text-rose-500 hover:bg-rose-50 transition-colors"
                            >
                              <Trash2 size={14} />
                            </button>
                          )}
                        </div>
                      </td>
                    )}
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
