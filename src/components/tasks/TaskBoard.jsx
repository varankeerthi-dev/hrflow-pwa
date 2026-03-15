import React, { useMemo } from 'react'
import { DndContext, useSensor, useSensors, MouseSensor, TouchSensor, closestCenter, useDroppable } from '@dnd-kit/core'
import { SortableContext, verticalListSortingStrategy, useSortable } from '@dnd-kit/sortable'
import TaskCard from './TaskCard'
import { STATUSES } from '../../utils/taskHelpers'

const columnBg = {
  todo: 'bg-gray-50',
  in_progress: 'bg-blue-50',
  on_hold: 'bg-amber-50',
  review: 'bg-purple-50',
  completed: 'bg-green-50',
}

export default function TaskBoard({ tasks = [], onSelectTask, onStatusChange, enableDrag = true }) {
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { pressDelay: 150, tolerance: 8 })
  )

  const grouped = useMemo(() => {
    return STATUSES.reduce((acc, status) => {
      acc[status.id] = tasks.filter(t => t.status === status.id)
      return acc
    }, {})
  }, [tasks])

  const handleDragEnd = (event) => {
    if (!enableDrag) return
    const { active, over } = event
    if (!over) return
    const taskId = active?.id
    const newStatus = over?.data?.current?.columnId || over?.id
    const currentStatus = active?.data?.current?.currentStatus
    if (!taskId || !newStatus || newStatus === currentStatus) return
    const task = tasks.find(t => t.id === taskId)
    if (task && onStatusChange) onStatusChange(task, newStatus)
  }

  const board = (
    <div className="flex gap-4 min-h-[60vh] pb-6 overflow-x-auto">
      {STATUSES.map(col => (
        <ColumnContainer key={col.id} id={col.id} className={`min-w-[220px] w-64 shrink-0 rounded-lg border border-gray-200 ${columnBg[col.id] || 'bg-white'} p-3`}>
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-gray-800">{col.label}</h3>
            <span className="text-xs text-gray-500">{grouped[col.id]?.length || 0}</span>
          </div>
          {enableDrag ? (
            <SortableContext items={grouped[col.id].map(t => t.id)} strategy={verticalListSortingStrategy}>
              {grouped[col.id].map(task => (
                <SortableCard key={task.id} task={task} columnId={col.id} onClick={() => onSelectTask(task)} />
              ))}
            </SortableContext>
          ) : (
            grouped[col.id].map(task => (
              <div key={task.id} onClick={() => onSelectTask(task)}>
                <TaskCard task={task} />
              </div>
            ))
          )}
        </ColumnContainer>
      ))}
    </div>
  )

  if (!enableDrag) return board

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
      {board}
    </DndContext>
  )
}

function ColumnContainer({ id, className, children }) {
  const { setNodeRef } = useDroppable({
    id,
    data: { columnId: id }
  })
  return (
    <div ref={setNodeRef} className={className} id={id}>
      {children}
    </div>
  )
}

function SortableCard({ task, onClick, columnId }) {
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({
    id: task.id,
    data: { currentStatus: task.status, columnId }
  })

  const style = {
    transform: transform ? `translate3d(${transform.x}px, ${transform.y}px, 0)` : undefined,
    transition
  }

  return (
    <div ref={setNodeRef} style={style} {...attributes} {...listeners} onClick={onClick}>
      <TaskCard task={task} />
    </div>
  )
}
