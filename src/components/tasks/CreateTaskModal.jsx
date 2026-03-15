import React, { useState } from 'react'
import Modal from '../ui/Modal'
import { addDoc, collection, serverTimestamp } from 'firebase/firestore'
import { db } from '../../lib/firebase'

const priorities = ['normal', 'important', 'urgent']

export default function CreateTaskModal({ isOpen, onClose, user, onSuccess }) {
  const [form, setForm] = useState({
    title: '',
    description: '',
    dueDate: '',
    priority: 'normal',
    isPersonal: false,
    assignedTo: '',
    clientEnabled: false,
    clientName: '',
    clientType: 'order'
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const handleChange = (key, value) => setForm(prev => ({ ...prev, [key]: value }))

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!form.title.trim()) { setError('Title is required'); return }
    if (!user?.orgId) { setError('Join an organisation before creating tasks.'); return }
    setSaving(true)
    setError('')
    const assignedToArr = form.assignedTo.split(',').map(s => s.trim()).filter(Boolean)
    try {
      await addDoc(collection(db, 'tasks'), {
        title: form.title.trim(),
        description: form.description.trim(),
        status: 'todo',
        isPersonal: form.isPersonal,
        assignedTo: assignedToArr.length ? assignedToArr : [user?.uid],
        createdBy: user?.uid,
        createdByName: user?.name || user?.email || 'User',
        organizationId: user?.orgId,
        createdAt: serverTimestamp(),
        completedAt: null,
        dueDate: form.dueDate ? new Date(form.dueDate) : null,
        priority: form.priority,
        notes: '',
        postponedCount: 0,
        postponeHistory: [],
        onHoldReason: null,
        onHoldSince: null,
        clientName: form.clientEnabled ? form.clientName || null : null,
        clientType: form.clientEnabled ? form.clientType : null,
      })
      onSuccess?.('Task added')
      onClose()
    } catch (err) {
      setError(err.message || 'Failed to save task.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Create Task" size="2xl">
      <form onSubmit={handleSubmit} className="p-4 space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="text-xs text-gray-500">Title</label>
            <input value={form.title} onChange={e => handleChange('title', e.target.value)} className="w-full border border-gray-200 rounded-md px-3 py-2 text-sm" required />
          </div>
          <div>
            <label className="text-xs text-gray-500">Due date</label>
            <input type="date" value={form.dueDate} onChange={e => handleChange('dueDate', e.target.value)} className="w-full border border-gray-200 rounded-md px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="text-xs text-gray-500">Priority</label>
            <select value={form.priority} onChange={e => handleChange('priority', e.target.value)} className="w-full border border-gray-200 rounded-md px-3 py-2 text-sm">
              {priorities.map(p => <option key={p} value={p}>{p}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs text-gray-500">Assignees (user IDs, comma separated)</label>
            <input value={form.assignedTo} onChange={e => handleChange('assignedTo', e.target.value)} className="w-full border border-gray-200 rounded-md px-3 py-2 text-sm" placeholder="uid1, uid2" />
          </div>
          <div className="flex items-center gap-2">
            <input type="checkbox" checked={form.isPersonal} onChange={e => handleChange('isPersonal', e.target.checked)} />
            <span className="text-sm text-gray-700">Personal Task</span>
          </div>
          <div className="flex items-center gap-2">
            <input type="checkbox" checked={form.clientEnabled} onChange={e => handleChange('clientEnabled', e.target.checked)} />
            <span className="text-sm text-gray-700">Related to client?</span>
          </div>
        </div>

        {form.clientEnabled && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="text-xs text-gray-500">Client name</label>
              <input value={form.clientName} onChange={e => handleChange('clientName', e.target.value)} className="w-full border border-gray-200 rounded-md px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="text-xs text-gray-500">Type</label>
              <select value={form.clientType} onChange={e => handleChange('clientType', e.target.value)} className="w-full border border-gray-200 rounded-md px-3 py-2 text-sm">
                <option value="order">Order</option>
                <option value="complaint">Complaint</option>
                <option value="followup">Follow-up</option>
              </select>
            </div>
          </div>
        )}

        <div>
          <label className="text-xs text-gray-500">Description</label>
          <textarea value={form.description} onChange={e => handleChange('description', e.target.value)} className="w-full border border-gray-200 rounded-md px-3 py-2 text-sm" rows={3} />
        </div>

        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} className="px-4 py-2 text-sm border border-gray-200 rounded-md">Cancel</button>
          <button type="submit" disabled={saving} className="px-4 py-2 text-sm bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50">Create</button>
        </div>
        {error && <p className="text-xs text-red-600">{error}</p>}
      </form>
    </Modal>
  )
}
