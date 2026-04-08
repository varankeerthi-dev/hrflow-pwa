import React, { useEffect, useMemo, useState } from 'react'
import { collection, getDocs, orderBy, query } from 'firebase/firestore'
import { CheckCircle2, Clock, MapPin, RefreshCw, User, XCircle } from 'lucide-react'
import { db } from '../../lib/firebase'
import Spinner from '../ui/Spinner'
import { formatTimeTo12Hour } from '../../lib/salaryUtils'
import {
  ATTENDANCE_EVENT_IN,
  ATTENDANCE_STATUS_APPROVED_WAITING_FINALIZE,
  ATTENDANCE_STATUS_PENDING_EXCEPTION,
  ATTENDANCE_STATUS_PENDING_HR,
  getAttendancePortalBadge,
} from '../../lib/attendanceWorkflow'
import {
  approvePendingAttendance,
  finalizePendingAttendance,
  rejectPendingAttendance,
} from '../../lib/geoAttendanceService'

function toTimestamp(value) {
  if (!value) return 0
  const asDate = new Date(value)
  return Number.isNaN(asDate.getTime()) ? 0 : asDate.getTime()
}

function formatDateKey(dateKey) {
  if (!dateKey) return '—'
  const date = new Date(dateKey)
  if (Number.isNaN(date.getTime())) return dateKey
  return date.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
}

export default function AttendanceApprovalQueue({ user, canManage }) {
  const [loading, setLoading] = useState(false)
  const [pendingRows, setPendingRows] = useState([])
  const [actionBusy, setActionBusy] = useState('')

  const fetchQueue = async () => {
    if (!user?.orgId) return
    setLoading(true)
    try {
      const queueQuery = query(
        collection(db, 'organisations', user.orgId, 'pending_attendance'),
        orderBy('createdAt', 'desc')
      )
      const snap = await getDocs(queueQuery)
      setPendingRows(
        snap.docs.map(docSnap => ({
          id: docSnap.id,
          pendingId: docSnap.data()?.pendingId || docSnap.id,
          ...docSnap.data(),
        }))
      )
    } catch (error) {
      console.error('Failed to fetch pending attendance queue:', error)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchQueue()
  }, [user?.orgId])

  const sessions = useMemo(() => {
    const grouped = new Map()
    pendingRows.forEach(row => {
      const key = row.sessionId || `${row.eventDate || 'unknown'}_${row.employeeId || row.userId || row.id}`
      if (!grouped.has(key)) {
        grouped.set(key, {
          sessionId: key,
          employeeName: row.employeeName || row.userName || 'Unknown',
          employeeId: row.employeeId || row.userId || '',
          siteName: row.siteName || row.siteId || '—',
          eventDate: row.eventDate || '',
          inEvent: null,
          outEvent: null,
          latestTs: 0,
        })
      }
      const session = grouped.get(key)
      if (row.type === ATTENDANCE_EVENT_IN) {
        session.inEvent = row
      } else {
        session.outEvent = row
      }
      const ts = toTimestamp(row.clientTimestamp)
      if (ts > session.latestTs) session.latestTs = ts
    })
    return Array.from(grouped.values()).sort((a, b) => b.latestTs - a.latestTs)
  }, [pendingRows])

  const pendingCount = pendingRows.filter(row =>
    [ATTENDANCE_STATUS_PENDING_HR, ATTENDANCE_STATUS_PENDING_EXCEPTION].includes(row.status)
  ).length
  const approvedCount = pendingRows.filter(row => row.status === ATTENDANCE_STATUS_APPROVED_WAITING_FINALIZE).length
  const rejectedCount = pendingRows.filter(row => row.status === 'rejected').length

  const approver = {
    uid: user?.uid || '',
    name: user?.name || '',
    email: user?.email || '',
  }

  const handleApprove = async (row) => {
    if (!user?.orgId || !row?.pendingId) return
    setActionBusy(row.pendingId)
    try {
      await approvePendingAttendance({
        orgId: user.orgId,
        pendingId: row.pendingId,
        approver,
      })
      await fetchQueue()
    } catch (error) {
      alert(error.message || 'Failed to approve attendance.')
    } finally {
      setActionBusy('')
    }
  }

  const handleReject = async (row) => {
    if (!user?.orgId || !row?.pendingId) return
    const reason = window.prompt('Enter rejection reason')
    if (!reason?.trim()) return
    setActionBusy(row.pendingId)
    try {
      await rejectPendingAttendance({
        orgId: user.orgId,
        pendingId: row.pendingId,
        approver,
        reason: reason.trim(),
      })
      await fetchQueue()
    } catch (error) {
      alert(error.message || 'Failed to reject attendance.')
    } finally {
      setActionBusy('')
    }
  }

  const handleFinalizeSession = async (session) => {
    if (!user?.orgId) return
    const approvedIn = session.inEvent?.status === ATTENDANCE_STATUS_APPROVED_WAITING_FINALIZE
    const approvedOut = session.outEvent?.status === ATTENDANCE_STATUS_APPROVED_WAITING_FINALIZE
    if (!approvedOut) {
      alert('Finalize is available only after approved check-out.')
      return
    }

    const toFinalize = [session.inEvent, session.outEvent].filter(
      row => row?.status === ATTENDANCE_STATUS_APPROVED_WAITING_FINALIZE
    )
    if (!toFinalize.length) {
      alert('No approved records available for finalization.')
      return
    }

    setActionBusy(session.sessionId)
    try {
      for (const row of toFinalize) {
        await finalizePendingAttendance({
          orgId: user.orgId,
          pendingId: row.pendingId,
          approver,
        })
      }
      await fetchQueue()
      if (!approvedIn) {
        alert('Check-out finalized. Check-in record was not approved and remains in pending.')
      }
    } catch (error) {
      alert(error.message || 'Failed to finalize attendance.')
    } finally {
      setActionBusy('')
    }
  }

  if (loading) {
    return (
      <div className="py-20 flex justify-center">
        <Spinner />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-3">
          <p className="text-[10px] font-black uppercase tracking-widest text-amber-700">Pending HR Action</p>
          <p className="mt-1 text-2xl font-black text-amber-800">{pendingCount}</p>
        </div>
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3">
          <p className="text-[10px] font-black uppercase tracking-widest text-emerald-700">Approved / Waiting Finalize</p>
          <p className="mt-1 text-2xl font-black text-emerald-800">{approvedCount}</p>
        </div>
        <div className="rounded-xl border border-rose-200 bg-rose-50 p-3">
          <p className="text-[10px] font-black uppercase tracking-widest text-rose-700">Rejected</p>
          <p className="mt-1 text-2xl font-black text-rose-800">{rejectedCount}</p>
        </div>
      </div>

      <div className="flex justify-end">
        <button
          type="button"
          onClick={fetchQueue}
          className="h-9 px-3 rounded-lg border border-gray-200 bg-white text-[11px] font-black uppercase tracking-widest text-gray-600 hover:bg-gray-50 flex items-center gap-2"
        >
          <RefreshCw size={14} />
          Refresh
        </button>
      </div>

      {sessions.length === 0 ? (
        <div className="rounded-xl border border-gray-200 bg-white py-16 text-center text-[11px] font-bold uppercase tracking-widest text-gray-400">
          No pending attendance submissions.
        </div>
      ) : (
        <div className="space-y-4">
          {sessions.map(session => {
            const approvedOut = session.outEvent?.status === ATTENDANCE_STATUS_APPROVED_WAITING_FINALIZE
            const approvedIn = session.inEvent?.status === ATTENDANCE_STATUS_APPROVED_WAITING_FINALIZE
            const canFinalize = approvedOut && (approvedIn || !session.inEvent)
            const isBusy = actionBusy === session.sessionId

            return (
              <div key={session.sessionId} className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
                <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-2">
                  <div className="space-y-1">
                    <p className="text-[11px] font-black uppercase tracking-widest text-gray-400">
                      {formatDateKey(session.eventDate)}
                    </p>
                    <p className="text-[14px] font-bold text-gray-900 flex items-center gap-2">
                      <User size={14} className="text-gray-500" />
                      {session.employeeName}
                    </p>
                    <p className="text-[12px] text-gray-600 flex items-center gap-2">
                      <MapPin size={13} className="text-indigo-500" />
                      {session.siteName || 'Assigned Site'}
                    </p>
                  </div>

                  {canManage && (
                    <button
                      type="button"
                      disabled={!canFinalize || isBusy}
                      onClick={() => handleFinalizeSession(session)}
                      className={`h-9 px-3 rounded-lg text-[10px] font-black uppercase tracking-widest flex items-center gap-2 ${
                        canFinalize
                          ? 'bg-emerald-600 text-white hover:bg-emerald-700'
                          : 'bg-gray-100 text-gray-400 cursor-not-allowed'
                      }`}
                    >
                      <CheckCircle2 size={14} />
                      {isBusy ? 'Finalizing...' : 'Finalize Session'}
                    </button>
                  )}
                </div>

                <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-3">
                  {[session.inEvent, session.outEvent].filter(Boolean).map(eventRow => {
                    const badge = getAttendancePortalBadge(eventRow.status)
                    const isPending = [ATTENDANCE_STATUS_PENDING_HR, ATTENDANCE_STATUS_PENDING_EXCEPTION].includes(eventRow.status)
                    const eventBusy = actionBusy === eventRow.pendingId
                    return (
                      <div key={eventRow.pendingId} className="rounded-lg border border-gray-100 bg-gray-50 p-3">
                        <div className="flex items-center justify-between gap-2">
                          <p className="text-[11px] font-black uppercase tracking-widest text-gray-500">
                            {eventRow.type === ATTENDANCE_EVENT_IN ? 'Check-In' : 'Check-Out'}
                          </p>
                          <span className={`inline-flex px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wide ${badge.className}`}>
                            {badge.label}
                          </span>
                        </div>
                        <p className="mt-2 text-[13px] font-bold text-gray-900 flex items-center gap-2">
                          <Clock size={13} className="text-gray-500" />
                          {eventRow.eventTime ? formatTimeTo12Hour(eventRow.eventTime) : '—'}
                        </p>
                        <p className="mt-1 text-[11px] text-gray-500">
                          Distance: {typeof eventRow.distanceMeters === 'number' ? `${eventRow.distanceMeters}m` : 'N/A'}
                        </p>
                        {eventRow.status === ATTENDANCE_STATUS_PENDING_EXCEPTION && (
                          <p className="mt-1 text-[11px] text-amber-700">
                            Exception reason: {eventRow.exceptionReason || 'Not provided'}
                          </p>
                        )}
                        {eventRow.rejectedReason && (
                          <p className="mt-1 text-[11px] text-rose-700">
                            Rejection reason: {eventRow.rejectedReason}
                          </p>
                        )}

                        {canManage && isPending && (
                          <div className="mt-3 flex items-center gap-2">
                            <button
                              type="button"
                              disabled={eventBusy}
                              onClick={() => handleApprove(eventRow)}
                              className="h-8 px-3 rounded-lg bg-emerald-600 text-white text-[10px] font-black uppercase tracking-widest hover:bg-emerald-700 disabled:opacity-50"
                            >
                              {eventBusy ? 'Saving...' : 'Approve'}
                            </button>
                            <button
                              type="button"
                              disabled={eventBusy}
                              onClick={() => handleReject(eventRow)}
                              className="h-8 px-3 rounded-lg bg-rose-600 text-white text-[10px] font-black uppercase tracking-widest hover:bg-rose-700 disabled:opacity-50 flex items-center gap-1"
                            >
                              <XCircle size={12} />
                              Reject
                            </button>
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
