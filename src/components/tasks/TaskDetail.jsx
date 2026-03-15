import React, { useEffect, useState } from 'react'
import Modal from '../ui/Modal'
import { doc, updateDoc, serverTimestamp } from 'firebase/firestore'
import { db } from '../../lib/firebase'
import ChatMessages from './ChatMessages'
import ChatInput from './ChatInput'
import { formatDate, getDaysUntilDeletion, getDaysSince, statusLabel, relativeTime } from '../../utils/taskHelpers'
import { useMessages } from '../../hooks/useMessages'

export default function TaskDetail({
  task,
  user,
  onClose,
  onStatusChange,
  onPostponeClick,
  onHoldClick,
  onCreateReminder
}) {
  const { messages } = useMessages(task?.id)
  const [notes, setNotes] = useState(task?.notes || '')

  useEffect(() => {
    setNotes(task?.notes || '')
  }, [task?.id, task?.notes])

  if (!task) return null
  const isCompleted = task.status === 'completed'

  const saveNotes = async () => {
    await updateDoc(doc(db, 'tasks', task.id), { notes })
  }

  const reopenTask = () => onStatusChange(task, 'in_progress')

  return (
    <Modal isOpen={!!task} onClose={onClose} title="Task Details" size="3xl">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 p-4 bg-gray-50">
        <div className="space-y-4">
          <div className="bg-white border border-gray-200 rounded-lg p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs uppercase text-gray-400">Status</p>
                <p className="text-sm font-semibold text-gray-800">{statusLabel(task.status)}</p>
              </div>
              <div className="flex gap-2 flex-wrap justify-end">
                {task.status !== 'completed' && (
                  <button onClick={() => onStatusChange(task, 'completed')} className="px-3 py-1 bg-green-600 text-white text-sm rounded-md">
                    Mark Complete
                  </button>
                )}
                {task.status === 'completed' && (
                  <button onClick={reopenTask} className="px-3 py-1 bg-amber-600 text-white text-sm rounded-md">
                    Reopen
                  </button>
                )}
                {task.status !== 'review' && task.status !== 'completed' && (
                  <button onClick={() => onStatusChange(task, 'review')} className="px-3 py-1 border border-gray-300 text-sm rounded-md">
                    Move to Review
                  </button>
                )}
                {task.status !== 'on_hold' && (
                  <button onClick={() => onHoldClick(task)} className="px-3 py-1 border border-gray-300 text-sm rounded-md">
                    Put On Hold
                  </button>
                )}
                {task.status === 'on_hold' && (
                  <button onClick={() => onStatusChange(task, 'in_progress', { onHoldReason: null, onHoldSince: null })} className="px-3 py-1 border border-gray-300 text-sm rounded-md">
                    Resume
                  </button>
                )}
              </div>
            </div>
            <div className="mt-4 space-y-2">
              <h3 className="text-lg font-semibold text-gray-900">{task.title}</h3>
              <p className="text-sm text-gray-600 whitespace-pre-wrap">{task.description}</p>
              <div className="text-xs text-gray-500">
                <p>Created: {relativeTime(task.createdAt)}</p>
                {task.dueDate && <p>Due: {formatDate(task.dueDate)}</p>}
                {task.completedAt && (
                  <p>
                    Completed {getDaysSince(task.completedAt)} days ago • Deletes in {getDaysUntilDeletion(task.completedAt)} days
                  </p>
                )}
                {task.clientName && (
                  <p>Client: {task.clientName} {task.clientType ? `(${task.clientType})` : ''}</p>
                )}
              </div>
            </div>
          </div>

          <div className="bg-white border border-gray-200 rounded-lg p-4 space-y-3">
            <div className="flex items-center justify-between">
              <h4 className="text-sm font-semibold text-gray-800">Notes</h4>
              <button onClick={saveNotes} className="text-sm text-blue-600 hover:text-blue-700">Save</button>
            </div>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="w-full border border-gray-200 rounded-md px-3 py-2 text-sm"
              rows={5}
              placeholder="Delay reasons, updates"
            />
            <div className="flex items-center gap-2 flex-wrap">
              <button onClick={() => onPostponeClick(task)} className="px-3 py-1 bg-amber-500 text-white rounded-md text-sm">Postpone Task</button>
              <button onClick={() => onCreateReminder(task)} className="px-3 py-1 bg-blue-600 text-white rounded-md text-sm">Create Reminder</button>
              <button onClick={() => onHoldClick(task)} className="px-3 py-1 border border-gray-300 rounded-md text-sm">On Hold</button>
            </div>
          </div>

          {task.postponeHistory?.length > 0 && (
            <div className="bg-white border border-gray-200 rounded-lg p-4">
              <h4 className="text-sm font-semibold text-gray-800 mb-2">Postpone history</h4>
              <div className="space-y-2 text-sm text-gray-700">
                {task.postponeHistory.map((p, idx) => (
                  <div key={idx} className="border border-gray-100 rounded-md p-2 bg-gray-50">
                    <p className="font-medium">{p.reason}</p>
                    <p className="text-xs text-gray-500">Old: {formatDate(p.oldDate)} → New: {formatDate(p.newDate)}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {task.status === 'on_hold' && (
            <div className="bg-white border border-amber-200 rounded-lg p-4">
              <p className="text-sm font-semibold text-amber-700">On hold since {formatDate(task.onHoldSince)}</p>
              <p className="text-sm text-amber-600 mt-1">{task.onHoldReason}</p>
            </div>
          )}
        </div>

        <div className="bg-white border border-gray-200 rounded-lg p-4 flex flex-col">
          <div className="flex items-center justify-between mb-3">
            <h4 className="text-sm font-semibold text-gray-800">Chat</h4>
            {isCompleted && <span className="text-xs text-gray-500">Task completed - chat closed</span>}
          </div>
          <div className="flex-1 min-h-[300px]">
            <ChatMessages messages={messages} />
          </div>
          {!isCompleted && (
            <div className="mt-3">
              <ChatInput
                taskId={task.id}
                user={user}
              />
            </div>
          )}
        </div>
      </div>
    </Modal>
  )
}
