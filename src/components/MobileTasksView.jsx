import React, { useState, useMemo } from 'react'
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
  X,
  Trash2,
  User,
  PlayCircle,
  CheckCircle,
  Lightbulb,
  LayoutGrid,
  ChevronLeft,
  ChevronRight,
  Edit3
} from 'lucide-react'
import { format, isToday, addDays, startOfMonth, endOfMonth, eachDayOfInterval, isSameMonth } from 'date-fns'
import DatePicker from 'react-datepicker'
import 'react-datepicker/dist/react-datepicker.css'
import Modal from './ui/Modal'

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
  
  // Team/Personal sub-tabs: Calendar | To Do | In Progress | Review | Completed
  const [teamView, setTeamView] = useState('calendar')
  const [personalView, setPersonalView] = useState('calendar')
  const [calendarDate, setCalendarDate] = useState(new Date())
  
  // Selected calendar day with inline tasks display
  const [selectedDate, setSelectedDate] = useState(null)
  const [dateTasks, setDateTasks] = useState([])
  
  // Task modals
  const [showAddModal, setShowAddModal] = useState(false)
  const [showTaskDetail, setShowTaskDetail] = useState(null)
  
  // Idea modal
  const [showIdeaModal, setShowIdeaModal] = useState(false)
  const [selectedIdea, setSelectedIdea] = useState(null)
  const [newIdea, setNewIdea] = useState({ title: '', bullets: [''] })
  
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

  const ideas = useMemo(() => {
    return tasks.filter(t => t.category === 'idea')
  }, [tasks])

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
      // Also refresh date tasks if open
      if (selectedDate) {
        const updatedTasks = dateTasks.filter(t => t.id !== taskId)
        setDateTasks(updatedTasks)
      }
    }
  }

  // Idea functions
  const handleAddBullet = () => {
    setNewIdea(prev => ({ ...prev, bullets: [...prev.bullets, ''] }))
  }

  const handleRemoveBullet = (index) => {
    setNewIdea(prev => ({ 
      ...prev, 
      bullets: prev.bullets.filter((_, i) => i !== index) 
    }))
  }

  const handleBulletChange = (index, value) => {
    setNewIdea(prev => ({
      ...prev,
      bullets: prev.bullets.map((b, i) => i === index ? value : b)
    }))
  }

  const handleCreateIdea = async (e) => {
    e.preventDefault()
    if (!newIdea.title.trim()) return
    
    const description = newIdea.bullets.filter(b => b.trim()).join('\n• ')
    
    await addTask({
      title: newIdea.title,
      description: description ? '• ' + description : '',
      status: 'To Do',
      isPersonal: false,
      category: 'idea',
      assignedTo: [],
      dueDate: null,
      priority: 'normal'
    })
    
    setShowIdeaModal(false)
    setNewIdea({ title: '', bullets: [''] })
  }

  // Handle calendar day click - show tasks inline
  const handleDateClick = (day) => {
    const dateKey = format(day, 'yyyy-MM-dd')
    const monthStart = startOfMonth(calendarDate)
    const monthEnd = endOfMonth(calendarDate)
    const days = eachDayOfInterval({ start: monthStart, end: monthEnd })
    
    // Group tasks by date
    const tasksByDate = {}
    filteredTasks.forEach(task => {
      if (!task.dueDate || task.status === 'Completed') return
      const taskDate = task.dueDate.toDate ? task.dueDate.toDate() : new Date(task.dueDate)
      const key = format(taskDate, 'yyyy-MM-dd')
      if (!tasksByDate[key]) tasksByDate[key] = []
      tasksByDate[key].push(task)
    })
    
    const dayTasks = tasksByDate[dateKey] || []
    
    if (selectedDate && isSameDay(selectedDate, day)) {
      // Toggle off if clicking same date
      setSelectedDate(null)
      setDateTasks([])
    } else {
      setSelectedDate(day)
      setDateTasks(dayTasks)
    }
  }

  // Render task list for a specific status
  const renderTaskList = (statusId, statusLabel, isEmptyAllowed = false) => {
    const statusTasks = filteredTasks.filter(t => t.status === statusId)
    
    if (!isEmptyAllowed && statusTasks.length === 0) return null
    
    return (
      <div key={statusId} className="mb-4">
        <div className="flex items-center gap-2 mb-2 px-4">
          <div className={`w-2 h-2 rounded-full ${STATUSES.find(s => s.id === statusId)?.color.replace('text-', 'bg-')}`} />
          <h3 className="text-sm font-semibold text-gray-700">{statusLabel}</h3>
          <span className="text-xs text-gray-400 ml-auto">{statusTasks.length}</span>
        </div>
        
        <div className="space-y-1">
          {statusTasks.length === 0 ? (
            <div className="px-4 py-3 text-sm text-gray-400 italic">No tasks</div>
          ) : (
            statusTasks.map(task => (
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
      const key = format(taskDate, 'yyyy-MM-dd')
      if (!tasksByDate[key]) tasksByDate[key] = []
      tasksByDate[key].push(task)
    })

    const weekDays = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa']

    return (
      <div className="bg-white">
        {/* Calendar Header */}
        <div className="flex items-center justify-between px-4 py-2 border-b border-gray-100">
          <button onClick={() => setCalendarDate(addDays(monthStart, -1))} className="p-1.5 hover:bg-gray-100 rounded-lg">
            <ChevronLeft size={18} className="text-gray-600" />
          </button>
          <h2 className="text-sm font-semibold text-gray-900">{monthName}</h2>
          <button onClick={() => setCalendarDate(addDays(monthEnd, 1))} className="p-1.5 hover:bg-gray-100 rounded-lg">
            <ChevronRight size={18} className="text-gray-600" />
          </button>
        </div>

        {/* Week Headers */}
        <div className="grid grid-cols-7 border-b border-gray-100">
          {weekDays.map(day => (
            <div key={day} className="py-1.5 text-center text-[10px] font-medium text-gray-500">
              {day}
            </div>
          ))}
        </div>

        {/* Calendar Grid - Reduced height */}
        <div className="grid grid-cols-7">
          {days.map(day => {
            const dateKey = format(day, 'yyyy-MM-dd')
            const dayTasks = tasksByDate[dateKey] || []
            const isCurrentMonth = isSameMonth(day, calendarDate)
            const isTodayDate = isToday(day)
            const isSelected = selectedDate && isSameDay(selectedDate, day)
            
            return (
              <button
                key={dateKey}
                onClick={() => handleDateClick(day)}
                className={`h-10 border-b border-r border-gray-100 p-0.5 flex flex-col items-center justify-center transition-colors ${
                  !isCurrentMonth ? 'bg-gray-50/50' : 'hover:bg-gray-50'
                } ${isTodayDate ? 'bg-indigo-50' : ''} ${isSelected ? 'ring-2 ring-indigo-500 ring-inset' : ''}`}
              >
                <span className={`text-xs font-medium ${isTodayDate ? 'text-indigo-600' : isCurrentMonth ? 'text-gray-900' : 'text-gray-400'}`}>
                  {format(day, 'd')}
                </span>
                {dayTasks.length > 0 && (
                  <div className="flex gap-0.5 mt-0.5">
                    {dayTasks.slice(0, 3).map((t, i) => (
                      <div key={i} className={`w-1 h-1 rounded-full ${
                        t.priority === 'urgent' ? 'bg-rose-500' : 
                        t.priority === 'high' ? 'bg-amber-500' : 'bg-gray-400'
                      }`} />
                    ))}
                  </div>
                )}
              </button>
            )
          })}
        </div>

        {/* Inline Date Tasks Display */}
        {selectedDate && dateTasks.length > 0 && (
          <div className="border-t border-gray-200 bg-gray-50/50">
            <div className="flex items-center justify-between px-4 py-2 border-b border-gray-100">
              <div>
                <h3 className="text-sm font-semibold text-gray-900">
                  {format(selectedDate, 'EEEE, MMM d')}
                </h3>
                <p className="text-xs text-gray-500">{dateTasks.length} tasks</p>
              </div>
              <div className="flex items-center gap-1">
                <button 
                  onClick={() => {
                    setNewTask({ ...newTask, dueDate: selectedDate })
                    setShowAddModal(true)
                  }}
                  className="p-1.5 text-indigo-600 hover:bg-indigo-50 rounded-lg"
                >
                  <Plus size={18} />
                </button>
                <button 
                  onClick={() => {
                    setSelectedDate(null)
                    setDateTasks([])
                  }}
                  className="p-1.5 text-gray-400 hover:text-gray-600"
                >
                  <X size={18} />
                </button>
              </div>
            </div>
            
            <div className="p-2 space-y-1 max-h-48 overflow-y-auto">
              {dateTasks.map(task => (
                <div key={task.id} className="flex items-start gap-2 p-2 bg-white rounded-lg border border-gray-100">
                  <button 
                    onClick={(e) => {
                      e.stopPropagation()
                      handleTaskComplete(task.id, e)
                    }}
                    className={task.status === 'Completed' ? 'text-emerald-500' : 'text-gray-300'}
                  >
                    {task.status === 'Completed' ? <CheckCircle2 size={18} /> : <Circle size={18} />}
                  </button>
                  <div className="flex-1 min-w-0">
                    <p className={`text-sm ${task.status === 'Completed' ? 'line-through text-gray-400' : 'text-gray-900'}`}>
                      {task.title}
                    </p>
                    {task.priority !== 'normal' && (
                      <span className={`text-xs ${task.priority === 'urgent' ? 'text-rose-500' : 'text-amber-500'}`}>
                        <Flag size={10} />
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-0.5">
                    <button 
                      onClick={() => setShowTaskDetail(task)}
                      className="p-1.5 text-gray-400 hover:text-indigo-600"
                    >
                      <Edit3 size={14} />
                    </button>
                    <button 
                      onClick={() => handleDeleteTask(task.id)}
                      className="p-1.5 text-gray-400 hover:text-rose-600"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Empty state for selected date */}
        {selectedDate && dateTasks.length === 0 && (
          <div className="border-t border-gray-200 bg-gray-50/50 p-4">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm font-semibold text-gray-900">
                {format(selectedDate, 'EEEE, MMM d')}
              </h3>
              <button 
                onClick={() => {
                  setSelectedDate(null)
                  setDateTasks([])
                }}
                className="p-1.5 text-gray-400 hover:text-gray-600"
              >
                <X size={18} />
              </button>
            </div>
            <p className="text-sm text-gray-500 italic mb-3">No tasks for this day</p>
            <button 
              onClick={() => {
                setNewTask({ ...newTask, dueDate: selectedDate })
                setShowAddModal(true)
              }}
              className="w-full py-2 text-sm font-medium text-indigo-600 bg-indigo-50 rounded-lg"
            >
              <Plus size={16} className="inline mr-1" />
              Add task for this day
            </button>
          </div>
        )}
      </div>
    )
  }

  // Render Ideas List
  const renderIdeasList = () => {
    if (ideas.length === 0) {
      return (
        <div className="flex flex-col items-center justify-center py-12 px-4">
          <Lightbulb size={40} className="text-amber-200 mb-4" />
          <p className="text-gray-500 text-sm">No ideas yet</p>
          <button 
            onClick={() => setShowIdeaModal(true)}
            className="mt-4 text-indigo-600 text-sm font-medium"
          >
            Add your first idea
          </button>
        </div>
      )
    }

    return (
      <div className="p-4 space-y-3">
        {ideas.map(idea => (
          <div 
            key={idea.id}
            onClick={() => setSelectedIdea(idea)}
            className="p-4 bg-white border border-gray-100 rounded-xl active:bg-gray-50"
          >
            <div className="flex items-start gap-3">
              <Lightbulb size={20} className="text-amber-500 flex-shrink-0 mt-0.5" />
              <div className="flex-1">
                <h3 className="font-medium text-gray-900">{idea.title}</h3>
                {idea.description && (
                  <p className="text-sm text-gray-500 mt-1 line-clamp-2">
                    {idea.description.replace(/• /g, '').substring(0, 100)}
                    {idea.description.length > 100 ? '...' : ''}
                  </p>
                )}
                <p className="text-xs text-gray-400 mt-2">
                  {idea.createdAt ? format(idea.createdAt.toDate ? idea.createdAt.toDate() : new Date(idea.createdAt), 'MMM d, yyyy') : 'Recently'}
                </p>
              </div>
            </div>
          </div>
        ))}
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
            { id: 'ideas', label: 'Ideas', count: ideas.length }
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => {
                setActiveTab(tab.id)
                setTeamView('calendar')
                setPersonalView('calendar')
                setSelectedDate(null)
                setDateTasks([])
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
            {/* Team View Tabs */}
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
                  onClick={() => {
                    setTeamView(view.id)
                    setSelectedDate(null)
                    setDateTasks([])
                  }}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-colors ${
                    teamView === view.id 
                      ? 'bg-gray-900 text-white' 
                      : 'bg-gray-100 text-gray-600'
                  }`}
                >
                  {view.icon && <view.icon size={12} />}
                  {view.label}
                  {view.count !== undefined && (
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
              {teamView === 'To Do' && renderTaskList('To Do', 'To Do', true)}
              {teamView === 'In Progress' && renderTaskList('In Progress', 'In Progress', true)}
              {teamView === 'Review' && renderTaskList('Review', 'Review', true)}
              {teamView === 'Completed' && renderTaskList('Completed', 'Completed', true)}
            </div>
          </div>
        )}

        {activeTab === 'personal' && (
          <div>
            {/* Personal View Tabs - Same as Team */}
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
                  onClick={() => {
                    setPersonalView(view.id)
                    setSelectedDate(null)
                    setDateTasks([])
                  }}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-colors ${
                    personalView === view.id 
                      ? 'bg-gray-900 text-white' 
                      : 'bg-gray-100 text-gray-600'
                  }`}
                >
                  {view.icon && <view.icon size={12} />}
                  {view.label}
                  {view.count !== undefined && (
                    <span className={`ml-0.5 px-1 py-0 rounded-full text-[9px] ${
                      personalView === view.id ? 'bg-white/20' : 'bg-white'
                    }`}>
                      {view.count}
                    </span>
                  )}
                </button>
              ))}
            </div>

            {/* Personal Content - Same structure as Team */}
            <div className="p-4">
              {personalView === 'calendar' && renderCalendarView()}
              {personalView === 'To Do' && renderTaskList('To Do', 'To Do', true)}
              {personalView === 'In Progress' && renderTaskList('In Progress', 'In Progress', true)}
              {personalView === 'Review' && renderTaskList('Review', 'Review', true)}
              {personalView === 'Completed' && renderTaskList('Completed', 'Completed', true)}
            </div>
          </div>
        )}

        {activeTab === 'ideas' && renderIdeasList()}
      </div>

      {/* Add Task/Idea Button */}
      <button 
        onClick={() => activeTab === 'ideas' ? setShowIdeaModal(true) : setShowAddModal(true)}
        className="fixed bottom-20 right-4 w-14 h-14 bg-indigo-600 rounded-full flex items-center justify-center text-white shadow-xl shadow-indigo-300 z-30"
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
              Add Task
            </button>
          </div>
        </form>
      </Modal>

      {/* Add/View Idea Modal */}
      <Modal
        isOpen={showIdeaModal || !!selectedIdea}
        onClose={() => {
          setShowIdeaModal(false)
          setSelectedIdea(null)
          setNewIdea({ title: '', bullets: [''] })
        }}
        title={selectedIdea ? 'Idea Details' : 'New Idea'}
        size="full"
      >
        <form onSubmit={selectedIdea ? (e) => { e.preventDefault(); setSelectedIdea(null); } : handleCreateIdea} className="flex flex-col h-full bg-white">
          <div className="flex-1 p-4 space-y-4 overflow-y-auto">
            <div>
              <input
                type="text"
                placeholder="Idea title"
                className="w-full text-lg font-medium placeholder-gray-400 border-0 focus:ring-0 p-0"
                value={selectedIdea ? selectedIdea.title : newIdea.title}
                onChange={(e) => selectedIdea ? null : setNewIdea(prev => ({ ...prev, title: e.target.value }))}
                readOnly={!!selectedIdea}
                autoFocus={!selectedIdea}
              />
            </div>
            
            <div className="py-3 border-t border-gray-100">
              <p className="text-xs text-gray-500 uppercase font-medium mb-2">Key Points</p>
              <div className="space-y-2">
                {(selectedIdea ? 
                  (selectedIdea.description ? selectedIdea.description.replace(/^• /, '').split('\n• ') : ['']) : 
                  newIdea.bullets
                ).map((bullet, index) => (
                  <div key={index} className="flex items-center gap-2">
                    <span className="text-gray-400 font-bold">•</span>
                    <input
                      type="text"
                      value={bullet}
                      onChange={(e) => selectedIdea ? null : handleBulletChange(index, e.target.value)}
                      placeholder={`Point ${index + 1}`}
                      readOnly={!!selectedIdea}
                      className="flex-1 px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                    />
                    {!selectedIdea && newIdea.bullets.length > 1 && (
                      <button
                        type="button"
                        onClick={() => handleRemoveBullet(index)}
                        className="p-1.5 text-gray-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors"
                      >
                        <X size={16} />
                      </button>
                    )}
                  </div>
                ))}
              </div>
              {!selectedIdea && (
                <button
                  type="button"
                  onClick={handleAddBullet}
                  className="mt-3 flex items-center gap-1.5 text-sm text-indigo-600 hover:text-indigo-700 font-medium"
                >
                  <Plus size={16} />
                  Add another point
                </button>
              )}
            </div>
          </div>
          
          <div className="p-4 border-t border-gray-100 flex gap-3">
            <button
              type="button"
              onClick={() => {
                setShowIdeaModal(false)
                setSelectedIdea(null)
                setNewIdea({ title: '', bullets: [''] })
              }}
              className="flex-1 py-3 text-sm font-medium text-gray-600 bg-gray-100 rounded-xl"
            >
              {selectedIdea ? 'Close' : 'Cancel'}
            </button>
            {!selectedIdea && (
              <button
                type="submit"
                disabled={!newIdea.title.trim()}
                className="flex-1 py-3 text-sm font-medium text-white bg-indigo-600 rounded-xl disabled:opacity-50"
              >
                Save Idea
              </button>
            )}
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

  return (
    <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-end sm:items-center justify-center">
      <div className="bg-white w-full sm:w-[400px] sm:rounded-2xl rounded-t-2xl max-h-[90vh] overflow-hidden animate-in slide-in-from-bottom duration-200">
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

        <div className="p-4 space-y-5 overflow-y-auto max-h-[calc(90vh-60px)]">
          <div>
            <input
              type="text"
              value={editedTask.title}
              onChange={(e) => setEditedTask({ ...editedTask, title: e.target.value })}
              className="w-full text-lg font-medium text-gray-900 placeholder-gray-400 border-0 focus:ring-0 p-0"
              placeholder="Task name"
            />
          </div>

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
