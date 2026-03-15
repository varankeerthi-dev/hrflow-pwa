import React from 'react'
import { formatDate, getDaysSince, clientTypeColor, clientTypeIcon } from '../../utils/taskHelpers'

const priorityBorder = {
  normal: 'border-l-blue-500',
  important: 'border-l-amber-500',
  urgent: 'border-l-red-500'
}

function initials(name = '') {
  return name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase() || '??'
}

function avatarColor(id = '') {
  let hash = 0
  for (let i = 0; i < id.length; i++) hash = id.charCodeAt(i) + ((hash << 5) - hash)
  const h = hash % 360
  return `hsl(${h},70%,60%)`
}

export default function TaskCard({ task, onClick }) {
  return (
    <div
      onClick={onClick}
      className={`bg-white border border-gray-200 rounded-lg shadow-sm p-3 mb-3 cursor-pointer hover:shadow transition-all duration-150 border-l-4 ${priorityBorder[task.priority || 'normal'] || 'border-l-gray-200'}`}
    >
      <div className="flex items-start justify-between gap-2">
        <div>
          <h4 className="text-sm font-semibold text-gray-800">{task.title}</h4>
          {task.dueDate && (
            <p className="text-[12px] text-gray-500 mt-1">Due {formatDate(task.dueDate)}</p>
          )}
        </div>
        <div className="flex items-center gap-1 text-[11px]">
          <span className={`px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 capitalize`}>{task.priority || 'normal'}</span>
        </div>
      </div>

      {task.clientName && (
        <div className="mt-2 flex items-center gap-1 text-xs">
          <span className={clientTypeColor[task.clientType] || 'text-green-600'}>
            {clientTypeIcon[task.clientType] || '•'}
          </span>
          <span className="text-gray-700">{task.clientName}</span>
        </div>
      )}

      {task.status === 'on_hold' && (
        <div className="mt-2 text-xs bg-amber-100 text-amber-700 px-2 py-1 rounded">
          ⏸ On hold: {task.onHoldReason || 'No reason'}{' '}
          {task.onHoldSince && (
            <span className="text-amber-500 ml-1">({getDaysSince(task.onHoldSince)}d)</span>
          )}
        </div>
      )}

      {task.postponedCount > 0 && (
        <div className="mt-2 text-xs text-amber-600">⏰ Postponed {task.postponedCount}×</div>
      )}

      <div className="mt-3 flex items-center gap-2 flex-wrap">
        {(task.assignedTo || []).slice(0, 3).map(uid => (
          <div
            key={uid}
            className="w-7 h-7 rounded-full text-white text-[11px] font-bold flex items-center justify-center"
            style={{ backgroundColor: avatarColor(uid) }}
          >
            {initials(uid)}
          </div>
        ))}
        {task.assignedTo?.length > 3 && (
          <span className="text-[11px] text-gray-500">+{task.assignedTo.length - 3}</span>
        )}
      </div>
    </div>
  )
}
