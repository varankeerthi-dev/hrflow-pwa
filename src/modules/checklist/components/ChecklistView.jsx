import React, { useEffect, useMemo, useRef, useState } from 'react'
import {
  AlertCircle,
  Ban,
  Check,
  ChevronLeft,
  ChevronRight,
  GripVertical,
  Loader2,
  Pencil,
  Plus,
  Trash2,
} from 'lucide-react'
import { z } from 'zod'
import { useChecklistLogs, useChecklistTemplates } from '../hooks/useChecklist'

const NAME_SCHEMA = z.string().trim().min(1, 'Name is required').max(120, 'Name is too long')
const STATUSES = ['done', 'skipped', 'not_required']
const VIEW_HEIGHT = 460
const ROW_HEIGHT = 54
const OVERSCAN = 8

const monthFormatter = new Intl.DateTimeFormat('en-US', { month: 'long', year: 'numeric' })
const weekdayFormatter = new Intl.DateTimeFormat('en-US', { weekday: 'short' })

const statusTone = (status, isPast, isFuture) => {
  if (isFuture) return 'bg-slate-50 border-slate-200 text-slate-300'
  if (status === 'done') return 'bg-emerald-500 border-emerald-500 text-white'
  if (status === 'skipped') return 'bg-amber-100 border-amber-300 text-amber-700'
  if (status === 'not_required') return 'bg-slate-100 border-slate-300 text-slate-500'
  if (isPast) return 'bg-rose-50 border-rose-300 text-rose-500'
  return 'bg-white border-slate-300 text-slate-400'
}

const statusIcon = (status) => {
  if (status === 'done') return <Check size={12} />
  if (status === 'skipped') return <Ban size={11} />
  if (status === 'not_required') return <span className="w-2.5 h-0.5 rounded-full bg-current block" />
  return null
}

const toDateKey = (date) => {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

const monthKeyOf = (date) => toDateKey(date).slice(0, 7)

const getToday = () => {
  const now = new Date()
  return new Date(now.getFullYear(), now.getMonth(), now.getDate())
}

const getDailyColumns = (monthDate) => {
  const year = monthDate.getFullYear()
  const month = monthDate.getMonth()
  const count = new Date(year, month + 1, 0).getDate()
  const today = getToday()
  return Array.from({ length: count }, (_, i) => {
    const day = i + 1
    const date = new Date(year, month, day)
    const start = new Date(year, month, day)
    return {
      id: toDateKey(date),
      label: `${weekdayFormatter.format(date)} ${day}`,
      top: String(day),
      bottom: weekdayFormatter.format(date).slice(0, 1),
      isPast: start < today,
      isFuture: start > today,
      isToday: start.getTime() === today.getTime(),
    }
  })
}

const getWeeklyColumns = (monthDate) => {
  const year = monthDate.getFullYear()
  const month = monthDate.getMonth()
  const max = new Date(year, month + 1, 0).getDate()
  const ranges = [
    [1, Math.min(7, max)],
    [8, Math.min(14, max)],
    [15, Math.min(21, max)],
    [22, max],
  ]
  const today = getToday()
  return ranges.map(([startDay, endDay], index) => {
    const start = new Date(year, month, startDay)
    const end = new Date(year, month, endDay)
    return {
      id: toDateKey(start),
      label: `Week ${index + 1} (${startDay}-${endDay})`,
      top: `W${index + 1}`,
      bottom: `${startDay}-${endDay}`,
      isPast: end < today,
      isFuture: start > today,
      isToday: start <= today && end >= today,
    }
  })
}

export default function ChecklistView({ user, isModalView = false }) {
  const [frequency, setFrequency] = useState('daily')
  const [monthCursor, setMonthCursor] = useState(() => {
    const now = new Date()
    return new Date(now.getFullYear(), now.getMonth(), 1)
  })
  const [newNames, setNewNames] = useState({ daily: '', weekly: '' })
  const [nameErrors, setNameErrors] = useState({ daily: '', weekly: '' })
  const [expanded, setExpanded] = useState({})
  const [editingId, setEditingId] = useState(null)
  const [editingName, setEditingName] = useState('')
  const [dragging, setDragging] = useState(null)
  const [dragOverId, setDragOverId] = useState(null)
  const [actionError, setActionError] = useState('')
  const [scrollTop, setScrollTop] = useState(0)
  const [popover, setPopover] = useState(null)
  const [draftStatus, setDraftStatus] = useState('done')
  const [draftNote, setDraftNote] = useState('')
  const [savingCell, setSavingCell] = useState(false)
  const [popoverPos, setPopoverPos] = useState({ top: 0, left: 0 })
  const popoverRef = useRef(null)

  const monthKey = useMemo(() => monthKeyOf(monthCursor), [monthCursor])
  const templatesApi = useChecklistTemplates(user?.uid || null, null)
  const logsApi = useChecklistLogs(user?.uid || null, monthKey)

  const templates = templatesApi.templates
  const logs = logsApi.logs
  const loading = templatesApi.isLoading || logsApi.isLoading
  const apiError = templatesApi.error || logsApi.error

  const sorted = useMemo(() => [...templates].sort((a, b) => (a.order ?? 0) - (b.order ?? 0)), [templates])
  const daily = useMemo(() => sorted.filter((t) => t.frequency === 'daily'), [sorted])
  const weekly = useMemo(() => sorted.filter((t) => t.frequency === 'weekly'), [sorted])
  const rows = frequency === 'daily' ? daily : weekly
  const columns = useMemo(() => (frequency === 'daily' ? getDailyColumns(monthCursor) : getWeeklyColumns(monthCursor)), [frequency, monthCursor])
  const monthLabel = useMemo(() => monthFormatter.format(monthCursor), [monthCursor])
  const byCell = useMemo(() => {
    const out = {}
    logs.forEach((log) => {
      out[`${log.templateId}_${log.date}`] = log
    })
    return out
  }, [logs])

  const templateColWidth = 280
  const colWidth = frequency === 'daily' ? 44 : 118
  const gridTemplateColumns = `${templateColWidth}px repeat(${columns.length}, ${colWidth}px)`
  const gridMinWidth = templateColWidth + columns.length * colWidth

  const start = Math.max(0, Math.floor(scrollTop / ROW_HEIGHT) - OVERSCAN)
  const end = Math.min(rows.length, Math.ceil((scrollTop + VIEW_HEIGHT) / ROW_HEIGHT) + OVERSCAN)
  const visibleRows = rows.slice(start, end)

  useEffect(() => {
    if (!popover) return
    const margin = 8
    const width = 280
    const height = 250
    let left = popover.anchor.left
    let top = popover.anchor.bottom + margin
    if (left + width > window.innerWidth - margin) left = window.innerWidth - width - margin
    if (left < margin) left = margin
    if (top + height > window.innerHeight - margin) top = popover.anchor.top - height - margin
    if (top < margin) top = margin
    setPopoverPos({ left, top })
  }, [popover])

  useEffect(() => {
    if (!popover) return
    const onDown = (event) => {
      if (!popoverRef.current) return
      if (!popoverRef.current.contains(event.target)) setPopover(null)
    }
    const onEsc = (event) => {
      if (event.key === 'Escape') setPopover(null)
    }
    document.addEventListener('mousedown', onDown)
    window.addEventListener('keydown', onEsc)
    return () => {
      document.removeEventListener('mousedown', onDown)
      window.removeEventListener('keydown', onEsc)
    }
  }, [popover])

  const addTemplate = async (kind) => {
    setActionError('')
    try {
      const parsed = NAME_SCHEMA.parse(newNames[kind] || '')
      const list = kind === 'daily' ? daily : weekly
      await templatesApi.createTemplate({ name: parsed.trim(), frequency: kind, order: list.length, active: true })
      setNewNames((prev) => ({ ...prev, [kind]: '' }))
      setNameErrors((prev) => ({ ...prev, [kind]: '' }))
    } catch (error) {
      if (error instanceof z.ZodError) setNameErrors((prev) => ({ ...prev, [kind]: error.issues[0]?.message || 'Invalid' }))
      else setActionError(error?.message || 'Unable to add checklist')
    }
  }

  const saveEdit = async (id) => {
    setActionError('')
    try {
      const parsed = NAME_SCHEMA.parse(editingName || '')
      await templatesApi.updateTemplate({ templateId: id, data: { name: parsed.trim() } })
      setEditingId(null)
      setEditingName('')
    } catch (error) {
      setActionError(error?.message || 'Unable to update checklist')
    }
  }

  const reorder = async (targetId, kind) => {
    if (!dragging || dragging.id === targetId || dragging.kind !== kind) return
    setActionError('')
    try {
      const list = kind === 'daily' ? daily : weekly
      const ids = list.map((t) => t.id)
      const from = ids.indexOf(dragging.id)
      const to = ids.indexOf(targetId)
      if (from < 0 || to < 0) return
      const [moved] = ids.splice(from, 1)
      ids.splice(to, 0, moved)
      await templatesApi.reorderTemplates(ids)
    } catch (error) {
      setActionError(error?.message || 'Unable to reorder checklist')
    } finally {
      setDragging(null)
      setDragOverId(null)
    }
  }

  const openCell = (event, templateId, dateId, log, isFuture) => {
    if (isFuture) return
    const rect = event.currentTarget.getBoundingClientRect()
    setPopover({ templateId, dateId, anchor: { top: rect.top, left: rect.left, bottom: rect.bottom } })
    setDraftStatus(log?.status || 'done')
    setDraftNote(log?.note || '')
  }

  const saveCell = async () => {
    if (!popover) return
    setSavingCell(true)
    setActionError('')
    try {
      await logsApi.upsertLog({
        templateId: popover.templateId,
        date: popover.dateId,
        status: draftStatus,
        note: draftNote.trim() ? draftNote.trim() : null,
      })
      setPopover(null)
    } catch (error) {
      setActionError(error?.message || 'Unable to save status')
    } finally {
      setSavingCell(false)
    }
  }

  const bulkDone = async (templateId) => {
    setActionError('')
    try {
      const targetDates = columns.filter((c) => !c.isFuture).map((c) => c.id)
      await logsApi.bulkUpsertLogs(
        targetDates.map((date) => ({
          templateId,
          date,
          status: 'done',
          note: byCell[`${templateId}_${date}`]?.note || null,
        }))
      )
    } catch (error) {
      setActionError(error?.message || 'Bulk action failed')
    }
  }

  if (!user?.uid) return <div className="p-6 text-sm text-slate-500">Please sign in to use Checklist.</div>

  return (
    <div className="h-full w-full p-4">
      <div className="h-full border border-[#eaeaea] rounded-2xl bg-[#fcfcfc] overflow-hidden">
        <div className="h-full grid grid-cols-[320px_1fr]">
          <aside className="h-full p-4 border-r border-[#eaeaea] bg-white overflow-y-auto">
            <h2 className="text-[15px] font-semibold text-slate-800">Checklist</h2>
            <p className="text-[12px] text-slate-500 mt-1 mb-4">User scoped checklist module.</p>
            {[
              ['daily', daily],
              ['weekly', weekly],
            ].map(([kind, list]) => (
              <div key={kind} className="mb-4">
                <button onClick={() => setFrequency(kind)} className={`w-full h-9 px-3 rounded-lg border flex items-center justify-between text-[12px] font-semibold transition-all duration-200 ${frequency === kind ? 'bg-slate-50 border-slate-300 text-slate-800' : 'border-slate-200 text-slate-600 hover:border-slate-300'}`}>
                  <span>{kind === 'daily' ? 'Daily Checklist' : 'Weekly Checklist'}</span>
                  <span className="text-slate-400">{list.length}</span>
                </button>
                <div className="mt-2 space-y-1.5">
                  {list.map((t) => (
                    <div key={t.id} onDragOver={(e) => { e.preventDefault(); if (dragging?.kind === kind) setDragOverId(t.id) }} onDrop={(e) => { e.preventDefault(); reorder(t.id, kind) }} className={`border rounded-lg ${dragOverId === t.id ? 'border-emerald-300 bg-emerald-50/50' : 'border-slate-200 bg-white'}`}>
                      <div className="px-2 py-2 flex items-center gap-1">
                        <button draggable onDragStart={() => setDragging({ id: t.id, kind })} onDragEnd={() => { setDragging(null); setDragOverId(null) }} className="p-1 text-slate-300 hover:text-slate-500"><GripVertical size={14} /></button>
                        <button onClick={() => setExpanded((p) => ({ ...p, [t.id]: !p[t.id] }))} className="p-1 text-slate-400 hover:text-slate-600"><ChevronRight size={14} className={`${expanded[t.id] ? 'rotate-90' : ''} transition-transform duration-200`} /></button>
                        <p className="flex-1 text-[12px] text-slate-700 truncate">{t.name}</p>
                      </div>
                      {expanded[t.id] && (
                        <div className="border-t border-slate-100 p-2 bg-slate-50/60 space-y-2">
                          {editingId === t.id ? (
                            <>
                              <input value={editingName} onChange={(e) => setEditingName(e.target.value)} className="w-full h-8 px-2.5 text-[12px] border border-slate-300 rounded-md outline-none focus:ring-2 focus:ring-slate-200" />
                              <div className="flex gap-2">
                                <button onClick={() => saveEdit(t.id)} className="h-7 px-3 rounded-md bg-slate-800 text-white text-[11px] font-semibold">Save</button>
                                <button onClick={() => { setEditingId(null); setEditingName('') }} className="h-7 px-3 rounded-md border border-slate-300 text-slate-600 text-[11px] font-semibold">Cancel</button>
                              </div>
                            </>
                          ) : (
                            <div className="flex gap-2">
                              <button onClick={() => { setEditingId(t.id); setEditingName(t.name || '') }} className="h-7 px-3 rounded-md border border-slate-300 text-slate-700 text-[11px] font-semibold inline-flex items-center gap-1.5"><Pencil size={12} /> Edit</button>
                              <button
                                onClick={async () => {
                                  try {
                                    await templatesApi.deleteTemplate(t.id)
                                  } catch (error) {
                                    setActionError(error?.message || 'Unable to delete checklist')
                                  }
                                }}
                                className="h-7 px-3 rounded-md border border-rose-300 text-rose-600 text-[11px] font-semibold inline-flex items-center gap-1.5"
                              >
                                <Trash2 size={12} /> Delete
                              </button>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
                <div className="mt-2 border border-dashed border-slate-300 rounded-lg p-2">
                  <div className="flex gap-2">
                    <input value={newNames[kind]} onChange={(e) => { setNewNames((p) => ({ ...p, [kind]: e.target.value })); if (nameErrors[kind]) setNameErrors((p) => ({ ...p, [kind]: '' })) }} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addTemplate(kind) } }} className="flex-1 h-8 px-2.5 text-[12px] border border-slate-300 rounded-md outline-none focus:ring-2 focus:ring-slate-200" placeholder={`Add ${kind} checklist`} />
                    <button onClick={() => addTemplate(kind)} className="h-8 w-8 rounded-md bg-slate-800 text-white inline-flex items-center justify-center"><Plus size={13} /></button>
                  </div>
                  {nameErrors[kind] && <p className="mt-1 text-[11px] text-rose-600">{nameErrors[kind]}</p>}
                </div>
              </div>
            ))}
          </aside>

          <main className="h-full p-4 flex flex-col">
            <div className="mb-3 flex items-center justify-between gap-3">
              <div className="inline-flex items-center gap-1 p-1 border border-[#eaeaea] rounded-lg bg-white">
                <button onClick={() => setFrequency('daily')} className={`h-8 px-3 rounded-md text-[12px] font-semibold ${frequency === 'daily' ? 'bg-slate-800 text-white' : 'text-slate-600 hover:bg-slate-100'} transition-all duration-200`}>Daily</button>
                <button onClick={() => setFrequency('weekly')} className={`h-8 px-3 rounded-md text-[12px] font-semibold ${frequency === 'weekly' ? 'bg-slate-800 text-white' : 'text-slate-600 hover:bg-slate-100'} transition-all duration-200`}>Weekly</button>
              </div>
              <div className="inline-flex items-center gap-1 p-1 border border-[#eaeaea] rounded-lg bg-white">
                <button onClick={() => setMonthCursor((prev) => new Date(prev.getFullYear(), prev.getMonth() - 1, 1))} className="h-8 w-8 rounded-md text-slate-500 hover:bg-slate-100 inline-flex items-center justify-center"><ChevronLeft size={16} /></button>
                <div className="min-w-[130px] text-center text-[12px] font-semibold text-slate-700">{monthLabel}</div>
                <button onClick={() => setMonthCursor((prev) => new Date(prev.getFullYear(), prev.getMonth() + 1, 1))} className="h-8 w-8 rounded-md text-slate-500 hover:bg-slate-100 inline-flex items-center justify-center"><ChevronRight size={16} /></button>
              </div>
            </div>

            {actionError && <div className="mb-3 px-3 py-2.5 border border-rose-200 bg-rose-50 rounded-lg text-[12px] text-rose-700">{actionError}</div>}
            {apiError && (
              <div className="mb-3 px-3 py-3 border border-amber-200 bg-amber-50 rounded-lg">
                <div className="flex items-start gap-2">
                  <AlertCircle size={16} className="text-amber-700 mt-0.5 shrink-0" />
                  <div>
                    <p className="text-[12px] font-semibold text-amber-800">Checklist data failed to load</p>
                    <p className="text-[12px] text-amber-700 mt-1">{apiError?.message || 'Please retry.'}</p>
                    <button onClick={() => { templatesApi.refetch(); logsApi.refetch() }} className="mt-2 h-7 px-3 rounded-md border border-amber-300 text-amber-800 text-[11px] font-semibold">Retry</button>
                  </div>
                </div>
              </div>
            )}

            {loading ? (
              <div className="flex-1 border border-[#eaeaea] rounded-xl bg-white flex items-center justify-center">
                <div className="inline-flex items-center gap-2 text-slate-500 text-[12px]"><Loader2 size={14} className="animate-spin" /> Loading checklist...</div>
              </div>
            ) : rows.length === 0 ? (
              <div className="flex-1 border border-[#eaeaea] rounded-xl bg-white flex items-center justify-center px-6 text-[13px] text-slate-500 text-center">No checklist yet - add one from the left panel to start tracking.</div>
            ) : (
              <div className="flex-1 border border-[#eaeaea] rounded-xl bg-white overflow-x-auto">
                <div style={{ minWidth: gridMinWidth }}>
                  <div className="grid border-b border-slate-200 bg-slate-50" style={{ gridTemplateColumns }}>
                    <div className="h-12 px-3 border-r border-slate-200 flex items-center text-[11px] font-semibold uppercase tracking-wide text-slate-600">Checklist Item</div>
                    {columns.map((col) => (
                      <div key={col.id} className={`h-12 border-r border-slate-200 last:border-r-0 flex flex-col items-center justify-center ${col.isToday ? 'bg-emerald-50' : ''}`} title={col.label}>
                        <span className="text-[11px] font-semibold text-slate-700 leading-none">{col.top}</span>
                        <span className="text-[10px] text-slate-400 mt-1 leading-none">{col.bottom}</span>
                      </div>
                    ))}
                  </div>
                  <div className="overflow-y-auto" style={{ height: VIEW_HEIGHT }} onScroll={(e) => setScrollTop(e.currentTarget.scrollTop)}>
                    <div style={{ height: rows.length * ROW_HEIGHT, position: 'relative' }}>
                      {visibleRows.map((row, i) => {
                        const rowIndex = start + i
                        return (
                          <div
                            key={row.id}
                            style={{
                              position: 'absolute',
                              top: rowIndex * ROW_HEIGHT,
                              left: 0,
                              right: 0,
                              height: ROW_HEIGHT,
                              gridTemplateColumns,
                            }}
                            className="grid border-b border-slate-100 bg-white hover:bg-slate-50/60 transition-colors duration-200"
                          >
                            <div className="px-3 py-2.5 border-r border-slate-100 flex items-center justify-between gap-2">
                              <div className="min-w-0">
                                <p className="text-[12px] font-semibold text-slate-800 truncate">{row.name}</p>
                                <p className="text-[11px] text-slate-400">{frequency === 'daily' ? 'Daily' : 'Weekly'}</p>
                              </div>
                              <button onClick={() => bulkDone(row.id)} className="h-7 px-2.5 rounded-md border border-slate-300 text-slate-600 text-[10px] font-semibold">Done All</button>
                            </div>
                            {columns.map((col) => {
                              const log = byCell[`${row.id}_${col.id}`]
                              const status = log?.status || null
                              const tone = statusTone(status, col.isPast, col.isFuture)
                              const title = `${row.name} - ${col.label}: ${status || 'empty'}${log?.note ? ` | ${log.note}` : ''}`
                              return (
                                <div key={col.id} className="flex items-center justify-center border-r border-slate-100 last:border-r-0">
                                  <button disabled={col.isFuture} onClick={(e) => openCell(e, row.id, col.id, log, col.isFuture)} title={title} className={`w-7 h-7 rounded-full border inline-flex items-center justify-center transition-all duration-200 ${tone}`}>{statusIcon(status)}</button>
                                </div>
                              )
                            })}
                          </div>
                        )
                      })}
                    </div>
                  </div>
                </div>
              </div>
            )}
          </main>
        </div>
      </div>

      {popover && (
        <div ref={popoverRef} className="fixed z-[100] w-[280px] bg-white border border-[#eaeaea] rounded-xl shadow-lg p-3" style={{ top: popoverPos.top, left: popoverPos.left }}>
          <p className="text-[12px] font-semibold text-slate-700 mb-2">Update status</p>
          <div className="grid gap-1.5 mb-3">
            {STATUSES.map((s) => (
              <button key={s} onClick={() => setDraftStatus(s)} className={`h-8 px-3 rounded-md text-left text-[12px] font-medium border ${draftStatus === s ? 'border-slate-800 bg-slate-800 text-white' : 'border-slate-300 text-slate-700 hover:bg-slate-50'} transition-colors duration-200`}>
                {s === 'done' ? 'Done' : s === 'skipped' ? 'Skipped' : 'Not Required'}
              </button>
            ))}
          </div>
          <label className="block text-[11px] text-slate-500 mb-1">Note (optional)</label>
          <textarea value={draftNote} onChange={(e) => setDraftNote(e.target.value)} className="w-full min-h-[72px] resize-none px-2.5 py-2 border border-slate-300 rounded-md text-[12px] outline-none focus:ring-2 focus:ring-slate-200" placeholder="Add a short note" />
          <div className="mt-3 flex items-center gap-2">
            <button onClick={saveCell} disabled={savingCell || logsApi.isUpserting || logsApi.isBulkUpserting} className="h-8 px-3 rounded-md bg-slate-800 text-white text-[12px] font-semibold disabled:opacity-50">Save</button>
            <button onClick={() => setPopover(null)} className="h-8 px-3 rounded-md border border-slate-300 text-slate-600 text-[12px] font-semibold">Cancel</button>
          </div>
        </div>
      )}
    </div>
  )
}
