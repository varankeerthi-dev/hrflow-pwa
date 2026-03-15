import React, { useState } from 'react'
import Modal from '../ui/Modal'
import { doc, serverTimestamp, updateDoc, arrayUnion, increment } from 'firebase/firestore'
import { db } from '../../lib/firebase'
import { formatDate } from '../../utils/taskHelpers'

export default function PostponeTaskModal({ isOpen, onClose, task, user }) {
  const [newDate, setNewDate] = useState('')
  const [reason, setReason] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  if (!task) return null

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!newDate || !reason.trim()) return
    const selected = new Date(newDate)
    const startOfToday = new Date()
    startOfToday.setHours(0, 0, 0, 0)
    if (selected <= startOfToday) {
      setError('New due date must be in the future.')
      return
    }
    setError('')
    setSaving(true)
    const ref = doc(db, 'tasks', task.id)
    const oldDate = task.dueDate ? (task.dueDate.toDate ? task.dueDate.toDate() : task.dueDate) : null
    await updateDoc(ref, {
      dueDate: new Date(newDate),
      postponedCount: increment(1),
      postponeHistory: arrayUnion({
        reason: reason.trim(),
        oldDate,
        newDate: new Date(newDate),
        postponedAt: serverTimestamp(),
        postponedBy: user?.uid
      })
    })
    setSaving(false)
    onClose()
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Postpone Task" size="lg">
      <form onSubmit={handleSubmit} className="p-4 space-y-4">
        <p className="text-sm text-gray-600">Current due date: {task?.dueDate ? formatDate(task.dueDate) : 'None'}</p>
        <div>
          <label className="text-xs text-gray-500">New due date</label>
          <input type="date" className="w-full border border-gray-200 rounded-md px-3 py-2 text-sm" value={newDate} onChange={e => setNewDate(e.target.value)} required />
        </div>
        <div>
          <label className="text-xs text-gray-500">Reason for postponement</label>
          <textarea className="w-full border border-gray-200 rounded-md px-3 py-2 text-sm" rows={4} value={reason} onChange={e => setReason(e.target.value)} required />
        </div>
        {error && <p className="text-xs text-red-600">{error}</p>}
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} className="px-4 py-2 text-sm border border-gray-200 rounded-md">Cancel</button>
          <button type="submit" disabled={saving} className="px-4 py-2 text-sm bg-amber-500 text-white rounded-md disabled:opacity-50">Save</button>
        </div>
      </form>
    </Modal>
  )
}
