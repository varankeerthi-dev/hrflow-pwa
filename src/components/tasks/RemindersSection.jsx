import React, { useState } from 'react'
import { relativeTime } from '../../utils/taskHelpers'

export default function RemindersSection({ reminders = [], onDismiss, onTaskNavigate }) {
  const [open, setOpen] = useState(true)

  const grouped = {
    general: reminders.filter(r => r.type === 'general'),
    targeted: reminders.filter(r => r.type === 'targeted'),
    task_linked: reminders.filter(r => r.type === 'task_linked'),
  }

  const renderCard = (reminder) => (
    <div key={reminder.id} className="bg-white border border-gray-200 rounded-lg p-3 flex items-start justify-between">
      <div>
        <p className="text-sm text-gray-800">{reminder.text}</p>
        <p className="text-[11px] text-gray-500 mt-1">{relativeTime(reminder.createdAt)}</p>
        {reminder.linkedTaskId && (
          <button onClick={() => onTaskNavigate?.(reminder.linkedTaskId)} className="text-xs text-blue-600 mt-1">Go to task</button>
        )}
      </div>
      <button onClick={() => onDismiss(reminder.id)} className="text-xs text-gray-500 hover:text-gray-700">Dismiss</button>
    </div>
  )

  return (
    <div className="border border-gray-200 rounded-lg bg-gray-50 p-3 mb-4">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <span className="font-semibold text-sm text-gray-800">Reminders</span>
          <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full">{reminders.length}</span>
        </div>
        <button onClick={() => setOpen(!open)} className="text-xs text-gray-500">{open ? 'Hide' : 'Show'}</button>
      </div>
      {open && (
        <div className="space-y-3">
          {['general', 'targeted', 'task_linked'].map(type => (
            <div key={type}>
              <p className="text-[11px] uppercase text-gray-500 font-semibold mb-2">{label(type)}</p>
              <div className="space-y-2">
                {grouped[type].length === 0 ? (
                  <p className="text-xs text-gray-400">No reminders</p>
                ) : grouped[type].map(renderCard)}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function label(type) {
  if (type === 'task_linked') return 'Linked to tasks'
  if (type === 'targeted') return 'For you'
  return 'General'
}
