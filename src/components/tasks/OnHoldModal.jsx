import React, { useState } from 'react'
import Modal from '../ui/Modal'
import { doc, serverTimestamp, updateDoc } from 'firebase/firestore'
import { db } from '../../lib/firebase'

export default function OnHoldModal({ isOpen, onClose, task }) {
  const [reason, setReason] = useState('')
  const [saving, setSaving] = useState(false)

  if (!task) return null

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!reason.trim()) return
    setSaving(true)
    await updateDoc(doc(db, 'tasks', task.id), {
      status: 'on_hold',
      onHoldReason: reason.trim(),
      onHoldSince: serverTimestamp()
    })
    setSaving(false)
    onClose()
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Put task on hold" size="lg">
      <form onSubmit={handleSubmit} className="p-4 space-y-4">
        <p className="text-sm text-gray-600">Explain why this task is on hold.</p>
        <textarea
          value={reason}
          onChange={e => setReason(e.target.value)}
          className="w-full border border-gray-200 rounded-md px-3 py-2 text-sm"
          rows={4}
          placeholder="Waiting for material, client approval pending..."
          required
        />
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} className="px-4 py-2 text-sm border border-gray-200 rounded-md">Cancel</button>
          <button type="submit" disabled={saving} className="px-4 py-2 text-sm bg-amber-500 text-white rounded-md disabled:opacity-50">Save</button>
        </div>
      </form>
    </Modal>
  )
}
