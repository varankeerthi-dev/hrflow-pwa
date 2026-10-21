import { useId, useRef, useState } from 'react'
import { canUpdateTaskProgress, MAX_PROGRESS_LENGTH } from '../../lib/taskProgress'

const inputClass = 'h-9 w-full rounded-md border border-slate-200 bg-white px-3 py-1 text-sm focus-visible:ring-1 focus-visible:ring-blue-600 placeholder:text-slate-400 text-slate-800 font-body'
const labelClass = 'block text-sm font-medium text-slate-800 mb-1.5 font-body'

export default function TaskProgress({ task, user, onSave }) {
  const id = useId()
  const savingRef = useRef(false)
  const [text, setText] = useState('')
  const [dateDraft, setDateDraft] = useState(undefined)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const canUpdate = canUpdateTaskProgress(task, user)
  const followUpDate = dateDraft !== undefined ? dateDraft : (task.nextFollowUpDate || '')
  const dateChanged = dateDraft !== undefined && dateDraft !== (task.nextFollowUpDate || '')
  const history = Array.isArray(task.progressUpdates) ? [...task.progressUpdates].reverse() : []

  const save = async (postUpdate) => {
    if (savingRef.current) return
    savingRef.current = true
    setSaving(true)
    setError('')
    setMessage('')
    try {
      await onSave(task.id, {
        ...(postUpdate ? { text } : {}),
        ...(dateChanged ? { nextFollowUpDate: followUpDate || null } : {})
      })
      if (postUpdate) setText('')
      setDateDraft(undefined)
      setMessage(postUpdate ? 'Progress update posted.' : 'Follow-up date saved.')
    } catch (err) {
      setError(err.message || 'Could not save. Please try again.')
    } finally {
      savingRef.current = false
      setSaving(false)
    }
  }

  return (
    <section aria-label="Task progress" className="bg-white border border-slate-200 rounded-xl p-3 space-y-3 font-body">
      <div>
        <h4 className="text-sm font-semibold text-slate-900 font-heading">Progress updates</h4>
        <p className="text-xs text-slate-500 mt-1">Log what happened without changing the task status. Updates and follow-up dates save separately from task details.</p>
      </div>
      {canUpdate ? (
        <div className="space-y-3">
          <div>
            <label htmlFor={`${id}-text`} className={labelClass}>New progress update</label>
            <textarea
              id={`${id}-text`}
              value={text}
              onChange={event => setText(event.target.value)}
              placeholder="e.g. Client did not pick up, or supplier is preparing quotation"
              maxLength={MAX_PROGRESS_LENGTH}
              disabled={saving}
              rows={3}
              className="w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm focus-visible:ring-1 focus-visible:ring-blue-600 placeholder:text-slate-400 text-slate-800 resize-y"
            />
          </div>
          <div>
            <label htmlFor={`${id}-follow-up`} className={labelClass}>Next follow-up date</label>
            <input id={`${id}-follow-up`} type="date" value={followUpDate} onChange={event => setDateDraft(event.target.value)} disabled={saving} className={inputClass} />
            <p className="text-xs text-slate-500 mt-1">Separate from the task due date. Clear this field to remove the follow-up.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" disabled={saving || !text.trim()} onClick={() => save(true)} className="h-9 px-4 bg-blue-600 hover:bg-blue-700 text-white rounded-md text-sm font-bold font-heading disabled:opacity-50">
              {saving ? 'Saving…' : 'Post update'}
            </button>
            <button type="button" disabled={saving || !dateChanged} onClick={() => save(false)} className="h-9 px-3 border border-slate-200 bg-white text-slate-700 rounded-md text-sm font-medium disabled:opacity-50">Save follow-up</button>
          </div>
        </div>
      ) : (
        <p className="text-sm text-slate-600">Next follow-up: {task.nextFollowUpDate || 'Not set'}</p>
      )}
      {error && <p role="alert" className="text-sm text-rose-700">{error}</p>}
      <p role="status" className="text-xs text-emerald-700">{message}</p>
      <div className="space-y-3 max-h-72 overflow-y-auto" aria-label="Progress history">
        {history.length === 0 ? <p className="text-sm text-slate-500">No progress updates yet.</p> : (
          <ol className="space-y-3">
            {history.map(update => {
              const date = update.createdAt?.toDate ? update.createdAt.toDate() : new Date(update.createdAt)
              return (
                <li key={update.id} className="border-t border-slate-100 pt-3">
                  <div className="flex flex-wrap gap-x-2 text-xs text-slate-500">
                    <span className="font-medium text-slate-700">{update.authorName}</span>
                    {!Number.isNaN(date.getTime()) && <time dateTime={date.toISOString()}>{date.toLocaleString()}</time>}
                  </div>
                  <p className="text-sm text-slate-800 whitespace-pre-wrap break-words mt-1">{update.text}</p>
                  {update.nextFollowUpDate !== undefined && <p className="text-xs text-slate-500 mt-1">Follow-up: {update.nextFollowUpDate || 'Cleared'}</p>}
                </li>
              )
            })}
          </ol>
        )}
      </div>
    </section>
  )
}
