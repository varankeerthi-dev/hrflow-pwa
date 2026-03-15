import React, { useState, useEffect } from 'react'
import Modal from '../ui/Modal'
import { createReminder } from '../../hooks/useReminders'

export default function CreateReminderModal({ isOpen, onClose, user, task }) {
  const [text, setText] = useState('')
  const [type, setType] = useState('general')
  const [priority, setPriority] = useState('normal')
  const [targets, setTargets] = useState('')

  useEffect(() => {
    if (task) {
      setText(`Reminder: ${task.title}`)
      setType('task_linked')
      setTargets((task.assignedTo || []).join(','))
    } else {
      setText('')
      setType('general')
      setTargets('')
    }
  }, [task])

  const handleSubmit = async (e) => {
    e.preventDefault()
    await createReminder({
      text: text.trim(),
      type,
      priority,
      targetUsers: targets ? targets.split(',').map(t => t.trim()).filter(Boolean) : null,
      linkedTaskId: task?.id || null,
      createdBy: user?.uid,
      createdByName: user?.name || user?.email || 'User',
      organizationId: user?.orgId,
      isActive: true,
      dismissedBy: []
    })
    onClose()
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Create Reminder" size="lg">
      <form onSubmit={handleSubmit} className="p-4 space-y-4">
        <div>
          <label className="text-xs text-gray-500">Text</label>
          <textarea value={text} onChange={e => setText(e.target.value)} className="w-full border border-gray-200 rounded-md px-3 py-2 text-sm" rows={3} required />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="text-xs text-gray-500">Type</label>
            <select value={type} onChange={e => setType(e.target.value)} className="w-full border border-gray-200 rounded-md px-3 py-2 text-sm">
              <option value="general">General</option>
              <option value="targeted">Targeted</option>
              <option value="task_linked">Task linked</option>
            </select>
          </div>
          <div>
            <label className="text-xs text-gray-500">Priority</label>
            <select value={priority} onChange={e => setPriority(e.target.value)} className="w-full border border-gray-200 rounded-md px-3 py-2 text-sm">
              <option value="normal">Normal</option>
              <option value="important">Important</option>
              <option value="urgent">Urgent</option>
            </select>
          </div>
        </div>
        <div>
          <label className="text-xs text-gray-500">Target users (comma separated UIDs, empty = everyone)</label>
          <input value={targets} onChange={e => setTargets(e.target.value)} className="w-full border border-gray-200 rounded-md px-3 py-2 text-sm" />
        </div>
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} className="px-4 py-2 text-sm border border-gray-200 rounded-md">Cancel</button>
          <button type="submit" className="px-4 py-2 text-sm bg-blue-600 text-white rounded-md">Create</button>
        </div>
      </form>
    </Modal>
  )
}
