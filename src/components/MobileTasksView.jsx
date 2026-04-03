import React, { useState, useMemo, useEffect } from 'react'
import { useAuth } from '../hooks/useAuth'
import { useEmployees } from '../hooks/useEmployees'
import { useTasks } from '../hooks/useTasks'
import { 
  Plus, 
  Circle, 
  CheckCircle2, 
  Calendar, 
  Clock, 
  Flag,
  MoreVertical,
  ChevronLeft,
  ChevronRight,
  X,
  Trash2,
  User,
  ArrowRight,
  PlayCircle,
  CheckCircle
} from 'lucide-react'
import { format, isToday, isTomorrow, isYesterday, addDays, startOfWeek, endOfWeek, eachDayOfInterval } from 'date-fns'
import Modal from './Modal'

const STATUSES = [
  { id: 'To Do', label: 'To Do', icon: Circle, color: 'text-gray-400' },
  { id: 'In Progress', label: 'In Progress', icon: PlayCircle, color: 'text-blue-500' },
  { id: 'On Hold', label: 'On Hold', icon: Clock, color: 'text-amber-500' },
  { id: 'Review', label: 'Review', icon: CheckCircle, color: 'text-purple-500' },
  { id: 'Completed', label: 'Completed', icon: CheckCircle2, color: 'text-emerald-500' }
]

const PRIORITIES = [
  { id: 'normal', label: 'Normal', color: 'bg-gray-100 text-gray-600' },
  { id: 'high', label: 'High', color: 'bg-amber-100 text-amber-600' },
  { id: 'urgent', label: 'Urgent', color: 'bg-rose-100 text-rose-600' }
]

export default function MobileTasksView() {
  const { user } = useAuth()
  const { employees } = useEmployees(user?.orgId)
  const { tasks, loading, addTask, updateTask, deleteTask } = useTasks(user?.orgId)
  
  const [activeFilter, setActiveFilter] = useState('today')
  const [showAddModal, setShowAddModal] = useState(false)
  const [showTaskDetail, setShowTaskDetail] = useState(null)
  const [swipedTask, setSwipedTask] = useState(null)
  const [touchStart, setTouchStart] = useState(null)
  
  const [newTask, setNewTask] = useState({
    title: '',
    dueDate: new Date(),
    priority: 'normal',
    assignedTo: [],
    status: 'To Do'
  })

  const taskEmployees = useMemo(() => {
    return employees.filter(emp => emp.includeInTask !== false)
  }, [employees])

  const filteredTasks = useMemo(() => {
    let filtered = tasks.filter(t => t.category !== 'idea' && !t.isPersonal)
    
    const today = new Date()
    
    switch (activeFilter) {
      case 'today':
        filtered = filtered.filter(t => {
          if (!t.dueDate) return t.status !== 'Completed'
          const due = t.dueDate.toDate ? t.dueDate.toDate() : new Date(t.dueDate)
          return isToday(due) || (!t.dueDate && t.status !== 'Completed')
        })
        break
      case 'upcoming':
        filtered = filtered.filter(t => {
          if (!t.dueDate) return false
          const due = t.dueDate.toDate ? t.dueDate.toDate() : new Date(t.dueDate)
          return due > today && t.status !== 'Completed'
        })
        break
      case 'completed':
        filtered = filtered.filter(t => t.status === 'Completed')
        break
      default:
        filtered = filtered.filter(t => t.status !== 'Completed')
    }
    
    return filtered.sort((a, b) => {
      // Priority sort
      const priorityOrder = { urgent: 0, high: 1, normal: 2 }
      const priorityDiff = (priorityOrder[a.priority] || 2) - (priorityOrder[b.priority] || 2)
      if (priorityDiff !== 0) return priorityDiff
      
      // Date sort
      if (a.dueDate && b.dueDate) {
        const dateA = a.dueDate.toDate ? a.dueDate.toDate() : new Date(a.dueDate)
        const dateB = b.dueDate.toDate ? b.dueDate.toDate() : new Date(b.dueDate)
        return dateA - dateB
      }
      return 0
    })
  }, [tasks, activeFilter])

  const getTaskDateLabel = (dueDate) => {
    if (!dueDate) return 'No date'
    const date = dueDate.toDate ? dueDate.toDate() : new Date(dueDate)
    if (isToday(date)) return 'Today'
    if (isTomorrow(date)) return 'Tomorrow'
    if (isYesterday(date)) return 'Yesterday'
    return format(date, 'MMM d')
  }

  const getAssigneeInfo = (assignedTo) => {
    const ids = Array.isArray(assignedTo) ? assignedTo : assignedTo ? [assignedTo] : []
    return ids.map(id => employees.find(e => e.id === id)).filter(Boolean)
  }

  const handleTaskComplete = async (taskId, e) => {
    e.stopPropagation()
    const task = tasks.find(t => t.id === taskId)
    const newStatus = task.status === 'Completed' ? 'To Do' : 'Completed'
    await updateTask(taskId, { status: newStatus })
  }

  const handleAddTask = async (e) => {
    e.preventDefault()
    if (!newTask.title.trim()) return
    
    await addTask({
      title: newTask.title,
      dueDate: newTask.dueDate,
      priority: newTask.priority,
      assignedTo: newTask.assignedTo,
      status: 'To Do',
      category: 'task',
      isPersonal: false
    })
    
    setShowAddModal(false)
    setNewTask({
      title: '',
      dueDate: new Date(),
      priority: 'normal',
      assignedTo: [],
      status: 'To Do'
    })
  }

  const handleDeleteTask = async (taskId) => {
    if (confirm('Delete this task?')) {
      await deleteTask(taskId)
      setShowTaskDetail(null)
    }
  }

  const handleTouchStart = (e, taskId) => {
    setTouchStart(e.touches[0].clientX)
  }

  const handleTouchMove = (e, taskId) => {
    if (!touchStart) return
    const currentX = e.touches[0].clientX
    const diff = touchStart - currentX
    
    if (diff > 50) {
      setSwipedTask(taskId)
    } else if (diff < -50) {
      setSwipedTask(null)
    }
  }

  const handleTouchEnd = () => {
    setTouchStart(null)
  }

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
      </div>
    )
  }

  return (
    <div className="flex-1 flex flex-col bg-white h-full">
      {/* Header */}
      <div className="sticky top-0 z-20 bg-white border-b border-gray-100 px-4 py-3">
        <div className="flex items-center justify-between mb-3">
          <h1 className="text-lg font-bold text-gray-900">Tasks</h1>
          <button 
            onClick={() => setShowAddModal(true)}
            className="w-8 h-8 bg-indigo-600 rounded-full flex items-center justify-center text-white shadow-lg shadow-indigo-200"
          >
            <Plus size={20} />
          </button>
        </div>
        
        {/* Filter Tabs */}
        <div className="flex gap-2 overflow-x-auto scrollbar-hide">
          {[
            { id: 'today', label: 'Today', count: filteredTasks.filter(t => isToday(t.dueDate?.toDate?.() || new Date(t.dueDate))).length },
            { id: 'upcoming', label: 'Upcoming', count: filteredTasks.filter(t => t.dueDate && (t.dueDate.toDate?.() || new Date(t.dueDate)) > new Date()).length },
            { id: 'completed', label: 'Completed', count: tasks.filter(t => t.status === 'Completed').length }
          ].map(filter => (
            <button
              key={filter.id}
              onClick={() => setActiveFilter(filter.id)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-all ${
                activeFilter === filter.id 
                  ? 'bg-gray-900 text-white' 
                  : 'bg-gray-100 text-gray-600'
              }`}
            >
              {filter.label}
              {filter.count > 0 && (
                <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${
                  activeFilter === filter.id ? 'bg-white/20' : 'bg-white'
                }`}>
                  {filter.count}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Task List */}
      <div className="flex-1 overflow-y-auto">
        {filteredTasks.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 px-4">
            <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mb-4">
              <CheckCircle2 size={24} className="text-gray-400" />
            </div>
            <p className="text-gray-500 text-sm text-center">
              {activeFilter === 'completed' 
                ? 'No completed tasks yet' 
                : activeFilter === 'today'
                ? "You're all caught up for today!"
                : 'No upcoming tasks'}
            </p>
            <button 
              onClick={() => setShowAddModal(true)}
              className="mt-4 text-indigo-600 text-sm font-medium"
            >
              Add a task
            </button>
          </div>
        ) : (
          <div className="divide-y divide-gray-100">
            {filteredTasks.map(task => {
              const assignees = getAssigneeInfo(task.assignedTo)
              const StatusIcon = STATUSES.find(s => s.id === task.status)?.icon || Circle
              const isCompleted = task.status === 'Completed'
              const isSwiped = swipedTask === task.id
              
              return (
                <div
                  key={task.id}
                  className="relative overflow-hidden"
                  onTouchStart={(e) => handleTouchStart(e, task.id)}
                  onTouchMove={(e) => handleTouchMove(e, task.id)}
                  onTouchEnd={handleTouchEnd}
                >
                  {/* Swipe Actions */}
                  <div className={`absolute right-0 top-0 bottom-0 flex items-center bg-rose-500 transition-transform duration-200 ${
                    isSwiped ? 'translate-x-0' : 'translate-x-full'
                  }`}>
                    <button 
                      onClick={() => handleDeleteTask(task.id)}
                      className="px-6 text-white"
                    >
                      <Trash2 size={20} />
                    </button>
                  </div>
                  
                  {/* Task Item */}
                  <div 
                    className={`flex items-start gap-3 p-4 bg-white transition-transform duration-200 ${
                      isSwiped ? '-translate-x-20' : 'translate-x-0'
                    } ${isCompleted ? 'opacity-60' : ''}`}
                    onClick={() => setShowTaskDetail(task)}
                  >
                    <button 
                      onClick={(e) => handleTaskComplete(task.id, e)}
                      className={`mt-0.5 flex-shrink-0 ${isCompleted ? 'text-emerald-500' : 'text-gray-300 hover:text-indigo-600'}`}
                    >
                      {isCompleted ? <CheckCircle2 size={22} /> : <Circle size={22} />}
                    </button>
                    
                    <div className="flex-1 min-w-0">
                      <p className={`text-sm font-medium text-gray-900 ${isCompleted ? 'line-through text-gray-500' : ''}`}>
                        {task.title}
                      </p>
                      
                      <div className="flex items-center gap-3 mt-1.5">
                        {/* Date */}
                        <span className={`flex items-center gap-1 text-xs ${
                          task.dueDate && isToday(task.dueDate.toDate?.() || new Date(task.dueDate))
                            ? 'text-rose-500 font-medium'
                            : 'text-gray-500'
                        }`}>
                          <Calendar size={12} />
                          {getTaskDateLabel(task.dueDate)}
                        </span>
                        
                        {/* Priority */}
                        {task.priority !== 'normal' && (
                          <span className={`flex items-center gap-1 text-xs ${
                            task.priority === 'urgent' ? 'text-rose-500' : 'text-amber-500'
                          }`}>
                            <Flag size={12} />
                          </span>
                        )}
                        
                        {/* Assignees */}
                        {assignees.length > 0 && (
                          <div className="flex -space-x-1.5">
                            {assignees.slice(0, 2).map(emp => (
                              <div key={emp.id} className="w-5 h-5 rounded-full bg-emerald-100 border border-white flex items-center justify-center text-[8px] font-bold text-emerald-600">
                                {emp.name.charAt(0).toUpperCase()}
                              </div>
                            ))}
                            {assignees.length > 2 && (
                              <div className="w-5 h-5 rounded-full bg-gray-100 border border-white flex items-center justify-center text-[8px] text-gray-600">
                                +{assignees.length - 2}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                    
                    <button className="text-gray-400 p-1">
                      <MoreVertical size={16} />
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Quick Add Button (Floating) */}
      <button 
        onClick={() => setShowAddModal(true)}
        className="lg:hidden fixed bottom-20 right-4 w-14 h-14 bg-indigo-600 rounded-full flex items-center justify-center text-white shadow-xl shadow-indigo-300 z-30"
      >
        <Plus size={28} />
      </button>

      {/* Add Task Modal */}
      <Modal
        isOpen={showAddModal}
        onClose={() => setShowAddModal(false)}
        title="New Task"
        size="full"
      >
        <form onSubmit={handleAddTask} className="flex flex-col h-full bg-white">
          <div className="flex-1 p-4 space-y-4 overflow-y-auto">
            <div>
              <input
                type="text"
                placeholder="Task name"
                className="w-full text-lg font-medium placeholder-gray-400 border-0 focus:ring-0 p-0"
                value={newTask.title}
                onChange={(e) => setNewTask({ ...newTask, title: e.target.value })}
                autoFocus
              />
            </div>
            
            {/* Due Date */}
            <div className="flex items-center gap-3 py-3 border-t border-gray-100">
              <Calendar size={18} className="text-gray-400" />
              <div className="flex-1">
                <p className="text-xs text-gray-500 mb-1">Due date</p>
                <div className="flex gap-2">
                  {[
                    { label: 'Today', date: new Date() },
                    { label: 'Tomorrow', date: addDays(new Date(), 1) },
                    { label: 'Next Week', date: addDays(new Date(), 7) }
                  ].map(option => (
                    <button
                      key={option.label}
                      type="button"
                      onClick={() => setNewTask({ ...newTask, dueDate: option.date })}
                      className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                        format(newTask.dueDate, 'yyyy-MM-dd') === format(option.date, 'yyyy-MM-dd')
                          ? 'bg-indigo-100 text-indigo-700'
                          : 'bg-gray-100 text-gray-600'
                      }`}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
            
            {/* Priority */}
            <div className="flex items-center gap-3 py-3 border-t border-gray-100">
              <Flag size={18} className="text-gray-400" />
              <div className="flex-1">
                <p className="text-xs text-gray-500 mb-1">Priority</p>
                <div className="flex gap-2">
                  {PRIORITIES.map(p => (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => setNewTask({ ...newTask, priority: p.id })}
                      className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                        newTask.priority === p.id ? p.color : 'bg-gray-100 text-gray-600'
                      }`}
                    >
                      {p.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
            
            {/* Assign To */}
            <div className="flex items-start gap-3 py-3 border-t border-gray-100">
              <User size={18} className="text-gray-400 mt-1" />
              <div className="flex-1">
                <p className="text-xs text-gray-500 mb-2">Assign to</p>
                <div className="flex flex-wrap gap-2">
                  {taskEmployees.map(emp => {
                    const isSelected = newTask.assignedTo.includes(emp.id)
                    return (
                      <button
                        key={emp.id}
                        type="button"
                        onClick={() => {
                          const updated = isSelected
                            ? newTask.assignedTo.filter(id => id !== emp.id)
                            : [...newTask.assignedTo, emp.id]
                          setNewTask({ ...newTask, assignedTo: updated })
                        }}
                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                          isSelected 
                            ? 'bg-emerald-100 text-emerald-700 border border-emerald-200' 
                            : 'bg-gray-100 text-gray-600'
                        }`}
                      >
                        <div className={`w-4 h-4 rounded-full flex items-center justify-center text-[8px] font-bold ${
                          isSelected ? 'bg-emerald-600 text-white' : 'bg-gray-300 text-gray-600'
                        }`}>
                          {emp.name.charAt(0).toUpperCase()}
                        </div>
                        {emp.name}
                      </button>
                    )
                  })}
                </div>
              </div>
            </div>
          </div>
          
          {/* Bottom Actions */}
          <div className="p-4 border-t border-gray-100 flex gap-3">
            <button
              type="button"
              onClick={() => setShowAddModal(false)}
              className="flex-1 py-3 text-sm font-medium text-gray-600 bg-gray-100 rounded-xl"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!newTask.title.trim()}
              className="flex-1 py-3 text-sm font-medium text-white bg-indigo-600 rounded-xl disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Add Task
            </button>
          </div>
        </form>
      </Modal>

      {/* Task Detail Modal */}
      {showTaskDetail && (
        <TaskDetailModal
          task={showTaskDetail}
          employees={employees}
          onClose={() => setShowTaskDetail(null)}
          onUpdate={updateTask}
          onDelete={handleDeleteTask}
        />
      )}
    </div>
  )
}

// Task Detail Modal Component
function TaskDetailModal({ task, employees, onClose, onUpdate, onDelete }) {
  const [editedTask, setEditedTask] = useState({
    ...task,
    assignedTo: Array.isArray(task.assignedTo) ? task.assignedTo : task.assignedTo ? [task.assignedTo] : []
  })

  const handleSave = async () => {
    await onUpdate(task.id, {
      title: editedTask.title,
      status: editedTask.status,
      priority: editedTask.priority,
      assignedTo: editedTask.assignedTo,
      dueDate: editedTask.dueDate
    })
    onClose()
  }

  const StatusIcon = STATUSES.find(s => s.id === editedTask.status)?.icon || Circle
  const statusColor = STATUSES.find(s => s.id === editedTask.status)?.color || 'text-gray-400'

  return (
    <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-end sm:items-center justify-center">
      <div className="bg-white w-full sm:w-[400px] sm:rounded-2xl rounded-t-2xl max-h-[90vh] overflow-hidden animate-in slide-in-from-bottom duration-200">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-100">
          <button onClick={onClose} className="p-2 -ml-2 text-gray-500">
            <X size={20} />
          </button>
          <button 
            onClick={handleSave}
            className="text-indigo-600 font-medium text-sm"
          >
            Save
          </button>
        </div>

        <div className="p-4 space-y-6 overflow-y-auto max-h-[calc(90vh-60px)]">
          {/* Title */}
          <div>
            <input
              type="text"
              value={editedTask.title}
              onChange={(e) => setEditedTask({ ...editedTask, title: e.target.value })}
              className="w-full text-lg font-medium text-gray-900 placeholder-gray-400 border-0 focus:ring-0 p-0"
              placeholder="Task name"
            />
          </div>

          {/* Status */}
          <div className="space-y-2">
            <p className="text-xs text-gray-500 uppercase font-medium">Status</p>
            <div className="flex flex-wrap gap-2">
              {STATUSES.map(s => (
                <button
                  key={s.id}
                  onClick={() => setEditedTask({ ...editedTask, status: s.id })}
                  className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium transition-colors ${
                    editedTask.status === s.id 
                      ? 'bg-gray-900 text-white' 
                      : 'bg-gray-100 text-gray-600'
                  }`}
                >
                  <s.icon size={14} className={editedTask.status === s.id ? 'text-white' : s.color} />
                  {s.label}
                </button>
              ))}
            </div>
          </div>

          {/* Priority */}
          <div className="space-y-2">
            <p className="text-xs text-gray-500 uppercase font-medium">Priority</p>
            <div className="flex gap-2">
              {PRIORITIES.map(p => (
                <button
                  key={p.id}
                  onClick={() => setEditedTask({ ...editedTask, priority: p.id })}
                  className={`flex-1 py-2 rounded-lg text-xs font-medium transition-colors ${
                    editedTask.priority === p.id ? p.color : 'bg-gray-100 text-gray-600'
                  }`}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>

          {/* Assignees */}
          <div className="space-y-2">
            <p className="text-xs text-gray-500 uppercase font-medium">Assigned to</p>
            <div className="flex flex-wrap gap-2">
              {employees.filter(emp => emp.includeInTask !== false).map(emp => {
                const isSelected = editedTask.assignedTo.includes(emp.id)
                return (
                  <button
                    key={emp.id}
                    onClick={() => {
                      const updated = isSelected
                        ? editedTask.assignedTo.filter(id => id !== emp.id)
                        : [...editedTask.assignedTo, emp.id]
                      setEditedTask({ ...editedTask, assignedTo: updated })
                    }}
                    className={`flex items-center gap-1.5 px-3 py-2 rounded-full text-xs font-medium transition-colors ${
                      isSelected 
                        ? 'bg-emerald-100 text-emerald-700 border border-emerald-200' 
                        : 'bg-gray-100 text-gray-600'
                    }`}
                  >
                    <div className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold ${
                      isSelected ? 'bg-emerald-600 text-white' : 'bg-gray-300 text-gray-600'
                    }`}>
                      {emp.name.charAt(0).toUpperCase()}
                    </div>
                    {emp.name}
                  </button>
                )
              })}
            </div>
          </div>

          {/* Due Date */}
          <div className="space-y-2">
            <p className="text-xs text-gray-500 uppercase font-medium">Due date</p>
            <input
              type="date"
              value={editedTask.dueDate ? format(
                editedTask.dueDate.toDate ? editedTask.dueDate.toDate() : new Date(editedTask.dueDate),
                'yyyy-MM-dd'
              ) : ''}
              onChange={(e) => setEditedTask({ ...editedTask, dueDate: new Date(e.target.value) })}
              className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm"
            />
          </div>

          {/* Delete */}
          <button
            onClick={() => onDelete(task.id)}
            className="w-full py-3 text-rose-600 font-medium text-sm border-t border-gray-100"
          >
            <Trash2 size={16} className="inline mr-2" />
            Delete Task
          </button>
        </div>
      </div>
    </div>
  )
}
