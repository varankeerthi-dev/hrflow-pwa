import React, { useState, useMemo } from 'react'
import { useAuth } from '../hooks/useAuth'
import { useEmployees } from '../hooks/useEmployees'
import { useTasks } from '../../hooks/useTasks'
import { 
  Plus, 
  Circle, 
  CheckCircle2, 
  Calendar, 
  Clock, 
  Flag,
  X,
  Trash2,
  User,
  PlayCircle,
  CheckCircle,
  Lightbulb,
  LayoutGrid,
  ChevronLeft,
  ChevronRight,
  Edit3,
  MoreHorizontal
} from 'lucide-react'
import { format, isToday, addDays, startOfMonth, endOfMonth, eachDayOfInterval, isSameMonth, isSameDay } from 'date-fns'
import DatePicker from 'react-datepicker'
import 'react-datepicker/dist/react-datepicker.css'
import Modal from '../ui/Modal'

const STATUSES = [
  { id: 'To Do', label: 'To Do', icon: Circle, color: 'text-gray-400', bg: 'bg-gray-50' },
  { id: 'In Progress', label: 'In Progress', icon: PlayCircle, color: 'text-blue-500', bg: 'bg-blue-50' },
  { id: 'On Hold', label: 'On Hold', icon: Clock, color: 'text-amber-500', bg: 'bg-amber-50' },
  { id: 'Review', label: 'Review', icon: CheckCircle, color: 'text-purple-500', bg: 'bg-purple-50' },
  { id: 'Completed', label: 'Completed', icon: CheckCircle2, color: 'text-emerald-500', bg: 'bg-emerald-50' }
]

const PRIORITIES = [
  { id: 'normal', label: 'Normal', color: 'bg-gray-100 text-gray-600 border-gray-200' },
  { id: 'high', label: 'High', color: 'bg-amber-100 text-amber-600 border-amber-200' },
  { id: 'urgent', label: 'Urgent', color: 'bg-rose-100 text-rose-600 border-rose-200' }
]

export default function MobileTasksView() {
  const { user } = useAuth()
  const { employees } = useEmployees(user?.orgId)
  const { tasks, loading, addTask, updateTask, deleteTask } = useTasks(user?.orgId)
  
  // Main tabs: Team | Personal | Ideas
  const [activeTab, setActiveTab] = useState('team')
  
  // Team sub-tabs: Calendar | To Do | In Progress | Review | Completed
  const [teamView, setTeamView] = useState('calendar')
  const [calendarDate, setCalendarDate] = useState(new Date())
  const [selectedCalendarDay, setSelectedCalendarDay] = useState(null)
  
  const [showAddModal, setShowAddModal] = useState(false)
  const [showTaskDetail, setShowTaskDetail] = useState(null)
  
  const [newTask, setNewTask] = useState({
    title: '',
    dueDate: new Date(),
    priority: 'normal',
    assignedTo: [],
    status: 'To Do',
    isPersonal: false,
    category: 'task'
  })

  const taskEmployees = useMemo(() => {
    return employees.filter(emp => emp.includeInTask !== false)
  }, [employees])

  const filteredTasks = useMemo(() => {
    let filtered = tasks.filter(t => t.category === 'idea' ? activeTab === 'ideas' : activeTab !== 'ideas')
    
    if (activeTab === 'personal') {
      filtered = filtered.filter(t => t.isPersonal)
    } else if (activeTab === 'team') {
      filtered = filtered.filter(t => !t.isPersonal && t.category !== 'idea')
    } else if (activeTab === 'ideas') {
      filtered = filtered.filter(t => t.category === 'idea')
    }
    
    return filtered
  }, [tasks, activeTab])

  const getAssigneeInfo = (assignedTo) => {
    const ids = Array.isArray(assignedTo) ? assignedTo : assignedTo ? [assignedTo] : []
    return ids.map(id => employees.find(e => e.id === id)).filter(Boolean)
  }

  const handleTaskComplete = async (taskId, e) => {
    e?.stopPropagation()
    const task = tasks.find(t => t.id === taskId)
    const newStatus = task.status === 'Completed' ? 'To Do' : 'Completed'
    await updateTask(taskId, { status: newStatus })
  }

  const handleAddTask = async (e) => {
    e.preventDefault()
    if (!newTask.title.trim()) return
    
    await addTask({
      ...newTask,
      isPersonal: activeTab === 'personal',
      category: activeTab === 'ideas' ? 'idea' : 'task'
    })
    
    setShowAddModal(false)
    setNewTask({
      title: '',
      dueDate: new Date(),
      priority: 'normal',
      assignedTo: [],
      status: 'To Do',
      isPersonal: activeTab === 'personal',
      category: activeTab === 'ideas' ? 'idea' : 'task'
    })
  }

  const handleDeleteTask = async (taskId) => {
    if (confirm('Delete this task?')) {
      await deleteTask(taskId)
      setShowTaskDetail(null)
      setSelectedCalendarDay(null)
    }
  }

  // Render task list for a specific status
  const renderTaskList = (statusId, statusLabel) => {
    const statusTasks = filteredTasks.filter(t => t.status === statusId)
    
    if (statusTasks.length === 0) return null
    
    return (
      <div key={statusId} className="mb-6">
        <div className="flex items-center gap-2 mb-3 px-4">
          <div className={`w-2 h-2 rounded-full ${STATUSES.find(s => s.id === statusId)?.color.replace('text-', 'bg-')}`} />
          <h3 className="text-sm font-semibold text-gray-700">{statusLabel}</h3>
          <span className="text-xs text-gray-400 ml-auto">{statusTasks.length}</span>
        </div>
        
        <div className="space-y-1">
          {statusTasks.map(task => (
            <TaskItem 
              key={task.id} 
              task={task} 
              onClick={() => setShowTaskDetail(task)}
              onComplete={handleTaskComplete}
              getAssigneeInfo={getAssigneeInfo}
            />
          ))}
        </div>
      </div>
    )
  }

  // Calendar View
  const renderCalendarView = () => {
    const monthStart = startOfMonth(calendarDate)
    const monthEnd = endOfMonth(calendarDate)
    const days = eachDayOfInterval({ start: monthStart, end: monthEnd })
    
    const monthName = format(calendarDate, 'MMMM yyyy')
    
    // Group tasks by date
    const tasksByDate = {}
    filteredTasks.forEach(task => {
      if (!task.dueDate || task.status === 'Completed') return
      const taskDate = task.dueDate.toDate ? task.dueDate.toDate() : new Date(task.dueDate)
      const dateKey = format(taskDate, 'yyyy-MM-dd')
      if (!tasksByDate[dateKey]) tasksByDate[dateKey] = []
      tasksByDate[dateKey].push(task)
    })

    const weekDays = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa']

    return (
      <div className="bg-white">
        {/* Calendar Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
          <button onClick={() => setCalendarDate(addDays(monthStart, -1))} className="p-2 hover:bg-gray-100 rounded-lg">
            <ChevronLeft size={20} className="text-gray-600" />
          </button>
          <h2 className="text-base font-semibold text-gray-900">{monthName}</h2>
          <button onClick={() => setCalendarDate(addDays(monthEnd, 1))} className="p-2 hover:bg-gray-100 rounded-lg">
            <ChevronRight size={20} className="text-gray-600" />
          </button>
        </div>

        {/* Week Headers */}
        <div className="grid grid-cols-7 border-b border-gray-100">
          {weekDays.map(day => (
            <div key={day} className="py-2 text-center text-xs font-medium text-gray-500">
              {day}
            </div>
          ))}
        </div>

        {/* Calendar Grid */}
        <div className="grid grid-cols-7">
          {days.map(day => {
            const dateKey = format(day, 'yyyy-MM-dd')
            const dayTasks = tasksByDate[dateKey] || []
            const isCurrentMonth = isSameMonth(day, calendarDate)
            const isTodayDate = isToday(day)
            
            return (
              <button
                key={dateKey}
                onClick={() => dayTasks.length > 0 && setSelectedCalendarDay({ date: day, tasks: dayTasks })}
                className={`aspect-square border-b border-r border-gray-100 p-1 flex flex-col items-center justify-start transition-colors ${
                  !isCurrentMonth ? 'bg-gray-50/50' : 'hover:bg-gray-50'
                } ${isTodayDate ? 'bg-indigo-50' : ''}`}
              >
                <span className={`text-sm font-medium ${isTodayDate ? 'text-indigo-600' : isCurrentMonth ? 'text-gray-900' : 'text-gray-400'}`}>
                  {format(day, 'd')}
                </span>
                {dayTasks.length > 0 && (
                  <div className="flex gap-0.5 mt-1">
                    {dayTasks.slice(0, 3).map((t, i) => (
                      <div key={i} className={`w-1.5 h-1.5 rounded-full ${
                        t.priority === 'urgent' ? 'bg-rose-500' : 
                        t.priority === 'high' ? 'bg-amber-500' : 'bg-gray-400'
                      }`} />
                    ))}
                  </div>
                )}
                {dayTasks.length > 3 && (
                  <span className="text-[8px] text-gray-400 mt-0.5">+{dayTasks.length - 3}</span>
                )}
              </button>
            )
          })}
        </div>

        {/* Calendar Day Tasks Modal */}
        {selectedCalendarDay && (
          <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-end sm:items-center justify-center">
            <div className="bg-white w-full sm:w-[400px] sm:rounded-2xl rounded-t-2xl max-h-[80vh] overflow-hidden animate-in slide-in-from-bottom duration-200">
              <div className="flex items-center justify-between p-4 border-b border-gray-100">
                <div>
                  <h3 className="font-semibold text-gray-900">
                    {format(selectedCalendarDay.date, 'EEEE, MMM d')}
                  </h3>
                  <p className="text-xs text-gray-500">{selectedCalendarDay.tasks.length} tasks</p>
                </div>
                <div className="flex items-center gap-2">
                  <button 
                    onClick={() => {
                      setNewTask({ ...newTask, dueDate: selectedCalendarDay.date })
                      setShowAddModal(true)
                      setSelectedCalendarDay(null)
                    }}
                    className="p-2 text-indigo-600 hover:bg-indigo-50 rounded-lg"
                  >
                    <Plus size={20} />
                  </button>
                  <button 
                    onClick={() => setSelectedCalendarDay(null)}
                    className="p-2 text-gray-400 hover:text-gray-600"
                  >
                    <X size={20} />
                  </button>
                </div>
              </div>
              
              <div className="overflow-y-auto max-h-[calc(80vh-70px)] p-4 space-y-3">
                {selectedCalendarDay.tasks.map(task => (
                  <div key={task.id} className="flex items-start gap-3 p-3 bg-gray-50 rounded-xl">
                    <button 
                      onClick={(e) => handleTaskComplete(task.id, e)}
                      className={task.status === 'Completed' ? 'text-emerald-500' : 'text-gray-300'}
                    >
                      {task.status === 'Completed' ? <CheckCircle2 size={22} /> : <Circle size={22} />}
                    </button>
                    <div className="flex-1 min-w-0">
                      <p className={`text-sm font-medium ${task.status === 'Completed' ? 'line-through text-gray-400' : 'text-gray-900'}`}>
                        {task.title}
                      </p>
                      <div className="flex items-center gap-2 mt-1">
                        {task.priority !== 'normal' && (
                          <span className={`text-xs ${task.priority === 'urgent' ? 'text-rose-500' : 'text-amber-500'}`}>
                            <Flag size={12} />
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-1">
                      <button 
                        onClick={() => {
                          setShowTaskDetail(task)
                          setSelectedCalendarDay(null)
                        }}
                        className="p-2 text-gray-400 hover:text-indigo-600"
                      >
                        <Edit3 size={16} />
                      </button>
                      <button 
                        onClick={() => handleDeleteTask(task.id)}
                        className="p-2 text-gray-400 hover:text-rose-600"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    )
  }

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center bg-white">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
      </div>
    )
  }

  return (
    <div className="flex-1 flex flex-col bg-white h-full">
      {/* Top Tabs: Team | Personal | Ideas */}
      <div className="sticky top-0 z-20 bg-white border-b border-gray-100">
        <div className="flex px-4 pt-3 pb-0">
          {[
            { id: 'team', label: 'Team', count: tasks.filter(t => !t.isPersonal && t.category !== 'idea' && t.status !== 'Completed').length },
            { id: 'personal', label: 'Personal', count: tasks.filter(t => t.isPersonal && t.status !== 'Completed').length },
            { id: 'ideas', label: 'Ideas', count: tasks.filter(t => t.category === 'idea').length }
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => {
                setActiveTab(tab.id)
                setTeamView('calendar')
              }}
              className={`flex-1 py-3 text-sm font-medium border-b-2 transition-colors relative ${
                activeTab === tab.id 
                  ? 'border-indigo-600 text-indigo-600' 
                  : 'border-transparent text-gray-500'
              }`}
            >
              {tab.label}
              {tab.count > 0 && (
                <span className="ml-1.5 text-[10px] px-1.5 py-0.5 bg-gray-100 text-gray-600 rounded-full">
                  {tab.count}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        {activeTab === 'team' && (
          <div>
            {/* Team View Tabs: Calendar | To Do | In Progress | Review | Completed */}
            <div className="flex px-4 py-2 gap-2 overflow-x-auto scrollbar-hide border-b border-gray-50">
              {[
                { id: 'calendar', label: 'Calendar', icon: LayoutGrid },
                { id: 'To Do', label: 'To Do', count: filteredTasks.filter(t => t.status === 'To Do').length },
                { id: 'In Progress', label: 'In Progress', count: filteredTasks.filter(t => t.status === 'In Progress').length },
                { id: 'Review', label: 'Review', count: filteredTasks.filter(t => t.status === 'Review').length },
                { id: 'Completed', label: 'Completed', count: filteredTasks.filter(t => t.status === 'Completed').length }
              ].map(view => (
                <button
                  key={view.id}
                  onClick={() => setTeamView(view.id)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-colors ${
                    teamView === view.id 
                      ? 'bg-gray-900 text-white' 
                      : 'bg-gray-100 text-gray-600'
                  }`}
                >
                  {view.icon && <view.icon size={12} />}
                  {view.label}
                  {view.count !== undefined && view.count > 0 && (
                    <span className={`ml-0.5 px-1 py-0 rounded-full text-[9px] ${
                      teamView === view.id ? 'bg-white/20' : 'bg-white'
                    }`}>
                      {view.count}
                    </span>
                  )}
                </button>
              ))}
            </div>

            {/* Team Content */}
            <div className="p-4">
              {teamView === 'calendar' && renderCalendarView()}
              
              {teamView === 'To Do' && (
                <>
                  {renderTaskList('To Do', 'To Do')}
                  {renderTaskList('On Hold', 'On Hold')}
                </>
              )}
              
              {teamView === 'In Progress' && renderTaskList('In Progress', 'In Progress')}
              {teamView === 'Review' && renderTaskList('Review', 'Review')}
              {teamView === 'Completed' && renderTaskList('Completed', 'Completed')}
            </div>
          </div>
        )}

        {activeTab === 'personal' && (
          <div className="p-4 space-y-6">
            {['To Do', 'In Progress', 'Review', 'Completed'].map(status => renderTaskList(status, status))}
          </div>
        )}

        {activeTab === 'ideas' && (
          <div className="p-4 space-y-6">
            {filteredTasks.length === 0 ? (
              <div className="text-center py-12">
                <Lightbulb size={40} className="text-amber-200 mx-auto mb-4" />
                <p className="text-gray-500">No ideas yet</p>
                <button 
                  onClick={() => setShowAddModal(true)}
                  className="mt-4 text-indigo-600 font-medium"
                >
                  Add your first idea
                </button>
              </div>
            ) : (
              filteredTasks.map(task => (
                <TaskItem 
                  key={task.id} 
                  task={task} 
                  onClick={() => setShowTaskDetail(task)}
                  onComplete={handleTaskComplete}
                  getAssigneeInfo={getAssigneeInfo}
                />
              ))
            )}
          </div>
        )}
      </div>

      {/* Add Task Button */}
      <button 
        onClick={() => setShowAddModal(true)}
        className="fixed bottom-20 right-4 w-14 h-14 bg-indigo-600 rounded-full flex items-center justify-center text-white shadow-xl shadow-indigo-300 z-30"
      >
        <Plus size={28} />
      </button>

      {/* Add Task Modal */}
      <Modal
        isOpen={showAddModal}
        onClose={() => setShowAddModal(false)}
        title={activeTab === 'ideas' ? 'New Idea' : 'New Task'}
        size="full"
      >
        <form onSubmit={handleAddTask} className="flex flex-col h-full bg-white">
          <div className="flex-1 p-4 space-y-4 overflow-y-auto">
            {/* Title */}
            <div>
              <input
                type="text"
                placeholder={activeTab === 'ideas' ? 'Idea title' : 'Task name'}
                className="w-full text-lg font-medium placeholder-gray-400 border-0 focus:ring-0 p-0"
                value={newTask.title}
                onChange={(e) => setNewTask({ ...newTask, title: e.target.value })}
                autoFocus
              />
            </div>
            
            {/* Due Date with react-datepicker */}
            <div className="flex items-center gap-3 py-3 border-t border-gray-100">
              <Calendar size={18} className="text-gray-400" />
              <div className="flex-1">
                <p className="text-xs text-gray-500 mb-1">Due date</p>
                <DatePicker
                  selected={newTask.dueDate}
                  onChange={(date) => setNewTask({ ...newTask, dueDate: date })}
                  className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm"
                  dateFormat="MMM d, yyyy"
                  placeholderText="Select date"
                />
              </div>
            </div>
            
            {/* Priority - Same Row */}
            <div className="py-3 border-t border-gray-100">
              <p className="text-xs text-gray-500 mb-2">Priority</p>
              <div className="flex gap-2">
                {PRIORITIES.map(p => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => setNewTask({ ...newTask, priority: p.id })}
                    className={`flex-1 py-2.5 rounded-xl text-xs font-medium transition-all border ${
                      newTask.priority === p.id ? p.color : 'bg-white border-gray-200 text-gray-600'
                    }`}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
            </div>
            
            {/* Assign To (only for Team tab) */}
            {activeTab !== 'personal' && (
              <div className="py-3 border-t border-gray-100">
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
                        className={`flex items-center gap-1.5 px-3 py-2 rounded-full text-xs font-medium transition-colors border ${
                          isSelected 
                            ? 'bg-emerald-50 text-emerald-700 border-emerald-200' 
                            : 'bg-gray-50 text-gray-600 border-gray-200'
                        }`}
                      >
                        <div className={`w-4 h-4 rounded-full flex items-center justify-center text-[8px] font-bold ${
                          isSelected ? 'bg-emerald-600 text-white' : 'bg-gray-300 text-gray-600'
                        }`}>
                          {emp.name.charAt(0).toUpperCase()}
                        </div>
                        {emp.name.split(' ')[0]}
                      </button>
                    )
                  })}
                </div>
              </div>
            )}
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
              className="flex-1 py-3 text-sm font-medium text-white bg-indigo-600 rounded-xl disabled:opacity-50"
            >
              {activeTab === 'ideas' ? 'Add Idea' : 'Add Task'}
            </button>
          </div>
        </form>
      </Modal>

      {/* Task Detail Modal */}
      {showTaskDetail && (
        <TaskDetailModal
          task={showTaskDetail}
          employees={taskEmployees}
          onClose={() => setShowTaskDetail(null)}
          onUpdate={updateTask}
          onDelete={handleDeleteTask}
        />
      )}
    </div>
  )
}

// Task Item Component
function TaskItem({ task, onClick, onComplete, getAssigneeInfo }) {
  const assignees = getAssigneeInfo(task.assignedTo)
  const isCompleted = task.status === 'Completed'
  
  return (
    <div
      onClick={onClick}
      className={`flex items-start gap-3 p-3 bg-white border border-gray-100 rounded-xl active:bg-gray-50 transition-colors ${isCompleted ? 'opacity-60' : ''}`}
    >
      <button 
        onClick={(e) => {
          e.stopPropagation()
          onComplete(task.id, e)
        }}
        className={`mt-0.5 flex-shrink-0 ${isCompleted ? 'text-emerald-500' : 'text-gray-300'}`}
      >
        {isCompleted ? <CheckCircle2 size={22} /> : <Circle size={22} />}
      </button>
      
      <div className="flex-1 min-w-0">
        <p className={`text-sm font-medium ${isCompleted ? 'line-through text-gray-400' : 'text-gray-900'}`}>
          {task.title}
        </p>
        
        <div className="flex items-center gap-2 mt-1">
          {task.dueDate && (
            <span className={`text-xs ${isToday(task.dueDate.toDate?.() || new Date(task.dueDate)) ? 'text-rose-500 font-medium' : 'text-gray-500'}`}>
              {format(task.dueDate.toDate?.() || new Date(task.dueDate), 'MMM d')}
            </span>
          )}
          
          {task.priority !== 'normal' && (
            <span className={task.priority === 'urgent' ? 'text-rose-500' : 'text-amber-500'}>
              <Flag size={12} />
            </span>
          )}
          
          {assignees.length > 0 && (
            <div className="flex -space-x-1">
              {assignees.slice(0, 2).map(emp => (
                <div key={emp.id} className="w-4 h-4 rounded-full bg-emerald-100 border border-white flex items-center justify-center text-[7px] font-bold text-emerald-600">
                  {emp.name.charAt(0).toUpperCase()}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
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
  const statusBg = STATUSES.find(s => s.id === editedTask.status)?.bg || 'bg-gray-50'

  return (
    <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-end sm:items-center justify-center">
      <div className="bg-white w-full sm:w-[400px] sm:rounded-2xl rounded-t-2xl max-h-[90vh] overflow-hidden animate-in slide-in-from-bottom duration-200">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-100">
          <button onClick={onClose} className="p-2 -ml-2 text-gray-500">
            <X size={20} />
          </button>
          <div className="flex items-center gap-2">
            <button 
              onClick={handleSave}
              className="text-indigo-600 font-medium text-sm px-3 py-1.5"
            >
              Save
            </button>
          </div>
        </div>

        <div className="p-4 space-y-5 overflow-y-auto max-h-[calc(90vh-60px)]">
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

          {/* Priority - Same Row */}
          <div className="space-y-2">
            <p className="text-xs text-gray-500 uppercase font-medium">Priority</p>
            <div className="flex gap-2">
              {PRIORITIES.map(p => (
                <button
                  key={p.id}
                  onClick={() => setEditedTask({ ...editedTask, priority: p.id })}
                  className={`flex-1 py-2.5 rounded-xl text-xs font-medium transition-all border ${
                    editedTask.priority === p.id ? p.color : 'bg-white border-gray-200 text-gray-600'
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
              {employees.map(emp => {
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
                    className={`flex items-center gap-1.5 px-3 py-2 rounded-full text-xs font-medium transition-colors border ${
                      isSelected 
                        ? 'bg-emerald-100 text-emerald-700 border-emerald-200' 
                        : 'bg-gray-100 text-gray-600 border-gray-200'
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

          {/* Due Date with DatePicker */}
          <div className="space-y-2">
            <p className="text-xs text-gray-500 uppercase font-medium">Due date</p>
            <DatePicker
              selected={editedTask.dueDate ? (editedTask.dueDate.toDate ? editedTask.dueDate.toDate() : new Date(editedTask.dueDate)) : null}
              onChange={(date) => setEditedTask({ ...editedTask, dueDate: date })}
              className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm"
              dateFormat="MMM d, yyyy"
              placeholderText="No due date"
            />
          </div>

          {/* Delete */}
          <button
            onClick={() => onDelete(task.id)}
            className="w-full py-3 text-rose-600 font-medium text-sm border-t border-gray-100 flex items-center justify-center gap-2"
          >
            <Trash2 size={16} />
            Delete Task
          </button>
        </div>
      </div>
    </div>
  )
}
