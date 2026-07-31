import React, { useState, useMemo } from 'react'
import { useAuth } from '../../hooks/useAuth'
import { useTasks } from '../../hooks/useTasks'
import { CheckCircle2, Circle, PlayCircle, Clock, Calendar, User, Filter, Search } from 'lucide-react'

const STATUS_CONFIG = {
  'To Do': { icon: Circle, color: 'text-slate-400', bgColor: 'bg-slate-50', borderColor: 'border-slate-200' },
  'In Progress': { icon: PlayCircle, color: 'text-blue-500', bgColor: 'bg-blue-50', borderColor: 'border-blue-200' },
  'On Hold': { icon: Clock, color: 'text-amber-500', bgColor: 'bg-amber-50', borderColor: 'border-amber-200' },
  'Review': { icon: CheckCircle2, color: 'text-purple-500', bgColor: 'bg-purple-50', borderColor: 'border-purple-200' },
  'Completed': { icon: CheckCircle2, color: 'text-emerald-500', bgColor: 'bg-emerald-50', borderColor: 'border-emerald-200' }
}

const PRIORITY_CONFIG = {
  'urgent': { label: 'Urgent', color: 'text-red-700', bgColor: 'bg-red-50', borderColor: 'border-red-200' },
  'high': { label: 'High', color: 'text-orange-700', bgColor: 'bg-orange-50', borderColor: 'border-orange-200' },
  'normal': { label: 'Normal', color: 'text-gray-700', bgColor: 'bg-gray-50', borderColor: 'border-gray-200' },
  'low': { label: 'Low', color: 'text-blue-700', bgColor: 'bg-blue-50', borderColor: 'border-blue-200' }
}

export default function EmployeeTasksView({ employeeId, employee }) {
  const { user } = useAuth()
  const { tasks, loading, updateTask } = useTasks(user?.orgId)
  const [statusFilter, setStatusFilter] = useState('all')
  const [priorityFilter, setPriorityFilter] = useState('all')
  const [searchTerm, setSearchTerm] = useState('')

  // Filter tasks assigned to this employee
  const myTasks = useMemo(() => {
    return tasks.filter(task => {
      // Check if employee is assigned
      const isAssigned = task.assignedTo?.includes(employeeId) || 
                        task.assignedTo?.includes(employee?.email) ||
                        task.createdBy === employeeId
      
      if (!isAssigned) return false

      // Apply status filter
      if (statusFilter !== 'all' && task.status !== statusFilter) return false

      // Apply priority filter
      if (priorityFilter !== 'all' && task.priority !== priorityFilter) return false

      // Apply search filter
      if (searchTerm && !task.title?.toLowerCase().includes(searchTerm.toLowerCase())) return false

      return true
    })
  }, [tasks, employeeId, employee, statusFilter, priorityFilter, searchTerm])

  // Group tasks by status
  const tasksByStatus = useMemo(() => {
    const grouped = {
      'To Do': [],
      'In Progress': [],
      'On Hold': [],
      'Review': [],
      'Completed': []
    }
    myTasks.forEach(task => {
      const status = task.status || 'To Do'
      if (grouped[status]) grouped[status].push(task)
    })
    return grouped
  }, [myTasks])

  const handleStatusChange = async (taskId, newStatus) => {
    try {
      await updateTask(taskId, { status: newStatus })
    } catch (err) {
      console.error('Failed to update task status:', err)
      alert('Failed to update task: ' + err.message)
    }
  }

  const formatDate = (timestamp) => {
    if (!timestamp) return null
    const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp)
    return date.toLocaleDateString('en-US', { day: '2-digit', month: 'short', year: 'numeric' })
  }

  const isOverdue = (task) => {
    if (!task.dueDate || task.status === 'Completed') return false
    const dueDate = task.dueDate.toDate ? task.dueDate.toDate() : new Date(task.dueDate)
    return dueDate < new Date()
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h3 className="text-xl font-black text-gray-900 uppercase tracking-tight">My Tasks</h3>
          <p className="text-[11px] text-gray-400 font-medium uppercase tracking-widest mt-1">
            Track and manage your assigned tasks
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="relative">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              placeholder="Search tasks..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-9 pr-4 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <div className="flex items-center gap-2">
          <Filter size={16} className="text-gray-400" />
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
          >
            <option value="all">All Statuses</option>
            <option value="To Do">To Do</option>
            <option value="In Progress">In Progress</option>
            <option value="On Hold">On Hold</option>
            <option value="Review">Review</option>
            <option value="Completed">Completed</option>
          </select>
        </div>
        <select
          value={priorityFilter}
          onChange={(e) => setPriorityFilter(e.target.value)}
          className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
        >
          <option value="all">All Priorities</option>
          <option value="urgent">Urgent</option>
          <option value="high">High</option>
          <option value="normal">Normal</option>
          <option value="low">Low</option>
        </select>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        {Object.entries(tasksByStatus).map(([status, tasks]) => {
          const config = STATUS_CONFIG[status]
          const Icon = config.icon
          return (
            <div key={status} className={`rounded-xl border ${config.borderColor} ${config.bgColor} p-4`}>
              <div className="flex items-center justify-between mb-2">
                <Icon size={20} className={config.color} />
                <span className={`text-2xl font-black ${config.color}`}>{tasks.length}</span>
              </div>
              <p className={`text-[10px] font-bold uppercase tracking-widest ${config.color}`}>
                {status}
              </p>
            </div>
          )
        })}
      </div>

      {/* Tasks List */}
      {myTasks.length === 0 ? (
        <div className="text-center py-16">
          <div className="w-20 h-20 rounded-full bg-gray-50 flex items-center justify-center mx-auto mb-6 text-gray-200">
            <CheckCircle2 size={40} />
          </div>
          <p className="text-gray-300 font-medium uppercase tracking-[0.25em] text-xl italic opacity-40">
            No tasks assigned
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {myTasks.map(task => {
            const statusConfig = STATUS_CONFIG[task.status || 'To Do']
            const priorityConfig = PRIORITY_CONFIG[task.priority || 'normal']
            const StatusIcon = statusConfig.icon
            const overdue = isOverdue(task)

            return (
              <div
                key={task.id}
                className={`bg-white rounded-xl border ${overdue ? 'border-red-200' : 'border-gray-100'} shadow-sm p-5 hover:shadow-md transition-all`}
              >
                <div className="flex items-start gap-4">
                  {/* Status Icon */}
                  <div className={`shrink-0 w-10 h-10 rounded-lg ${statusConfig.bgColor} border ${statusConfig.borderColor} flex items-center justify-center`}>
                    <StatusIcon size={20} className={statusConfig.color} />
                  </div>

                  {/* Task Content */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-3 mb-2">
                      <h4 className="text-sm font-bold text-gray-900 leading-tight">
                        {task.title}
                      </h4>
                      <span className={`shrink-0 px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-widest ${priorityConfig.bgColor} ${priorityConfig.color} border ${priorityConfig.borderColor}`}>
                        {priorityConfig.label}
                      </span>
                    </div>

                    {task.description && (
                      <p className="text-xs text-gray-600 mb-3 line-clamp-2">
                        {task.description}
                      </p>
                    )}

                    {/* Meta Info */}
                    <div className="flex flex-wrap items-center gap-4 text-[10px]">
                      {task.dueDate && (
                        <div className={`flex items-center gap-1 ${overdue ? 'text-red-600 font-bold' : 'text-gray-500'}`}>
                          <Calendar size={12} />
                          <span>{overdue && 'Overdue: '}{formatDate(task.dueDate)}</span>
                        </div>
                      )}
                      {task.createdByName && (
                        <div className="flex items-center gap-1 text-gray-500">
                          <User size={12} />
                          <span>Assigned by {task.createdByName}</span>
                        </div>
                      )}
                      {task.notes && (
                        <div className="text-gray-400 italic">
                          {task.notes}
                        </div>
                      )}
                    </div>

                    {/* Status Actions */}
                    {task.status !== 'Completed' && (
                      <div className="flex gap-2 mt-4">
                        {task.status === 'To Do' && (
                          <button
                            onClick={() => handleStatusChange(task.id, 'In Progress')}
                            className="px-3 py-1.5 bg-blue-600 text-white text-[10px] font-bold uppercase tracking-wider rounded-lg hover:bg-blue-700 transition-colors"
                          >
                            Start Task
                          </button>
                        )}
                        {task.status === 'In Progress' && (
                          <button
                            onClick={() => handleStatusChange(task.id, 'Review')}
                            className="px-3 py-1.5 bg-purple-600 text-white text-[10px] font-bold uppercase tracking-wider rounded-lg hover:bg-purple-700 transition-colors"
                          >
                            Submit for Review
                          </button>
                        )}
                        {task.status === 'On Hold' && (
                          <button
                            onClick={() => handleStatusChange(task.id, 'In Progress')}
                            className="px-3 py-1.5 bg-blue-600 text-white text-[10px] font-bold uppercase tracking-wider rounded-lg hover:bg-blue-700 transition-colors"
                          >
                            Resume
                          </button>
                        )}
                        {task.status === 'Review' && (
                          <button
                            onClick={() => handleStatusChange(task.id, 'Completed')}
                            className="px-3 py-1.5 bg-emerald-600 text-white text-[10px] font-bold uppercase tracking-wider rounded-lg hover:bg-emerald-700 transition-colors"
                          >
                            Mark Complete
                          </button>
                        )}
                        <button
                          onClick={() => {
                            const newStatus = task.status === 'On Hold' ? 'To Do' : 'On Hold'
                            handleStatusChange(task.id, newStatus)
                          }}
                          className="px-3 py-1.5 bg-gray-100 text-gray-700 text-[10px] font-bold uppercase tracking-wider rounded-lg hover:bg-gray-200 transition-colors"
                        >
                          {task.status === 'On Hold' ? 'Move to To-Do' : 'Put on Hold'}
                        </button>
                      </div>
                    )}

                    {task.status === 'Completed' && (
                      <div className="flex items-center gap-2 mt-4 text-emerald-600">
                        <CheckCircle2 size={16} />
                        <span className="text-[10px] font-bold uppercase tracking-wider">Completed</span>
                        {task.completedAt && (
                          <span className="text-gray-400 text-[9px]">
                            on {formatDate(task.completedAt)}
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
