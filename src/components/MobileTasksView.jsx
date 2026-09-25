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
  Edit3,
  Search,
  Check,
  Bell,
  RotateCw,
  FileText
} from 'lucide-react'
import { format, isToday, addDays, startOfMonth, endOfMonth, eachDayOfInterval, isSameMonth } from 'date-fns'
import DatePicker from 'react-datepicker'
import 'react-datepicker/dist/react-datepicker.css'
import { isEmployeeActiveStatus } from '../lib/employeeStatus'
import Modal from './ui/Modal'
import TaskChecklistBuilder from './tasks/TaskChecklistBuilder'

const STATUSES = [
  { id: 'To Do', label: 'To Do', icon: Circle, color: 'text-gray-400', bg: 'bg-gray-50' },
  { id: 'In Progress', label: 'In Progress', icon: PlayCircle, color: 'text-blue-500', bg: 'bg-blue-50' },
  { id: 'On Hold', label: 'On Hold', icon: Clock, color: 'text-amber-500', bg: 'bg-amber-50' },
  { id: 'Review', label: 'Review', icon: CheckCircle, color: 'text-purple-500', bg: 'bg-purple-50' },
  { id: 'Completed', label: 'Completed', icon: CheckCircle2, color: 'text-emerald-500', bg: 'bg-emerald-50' }
]

const PRIORITIES = [
  { id: 'normal', label: 'Normal', dot: 'bg-slate-400', color: 'bg-slate-100 text-slate-700 border-slate-200' },
  { id: 'high', label: 'High', dot: 'bg-amber-500', color: 'bg-amber-50 text-amber-700 border-amber-300' },
  { id: 'urgent', label: 'Urgent', dot: 'bg-rose-500', color: 'bg-rose-50 text-rose-700 border-rose-300' }
]

const CLIENT_TYPES = [
  { id: 'order', label: 'Order', icon: '📦', color: 'text-emerald-700', bgColor: 'bg-emerald-50', borderColor: 'border-emerald-200' },
  { id: 'complaint', label: 'Complaint', icon: '⚠️', color: 'text-rose-700', bgColor: 'bg-rose-50', borderColor: 'border-rose-200' },
  { id: 'followup', label: 'Follow-up', icon: '📞', color: 'text-blue-700', bgColor: 'bg-blue-50', borderColor: 'border-blue-200' }
]

const getInitials = (name) => {
  if (!name) return '?'
  const parts = name.trim().split(' ')
  if (parts.length >= 2) return `${parts[0][0]}${parts[1][0]}`.toUpperCase()
  return name.slice(0, 2).toUpperCase()
}

export default function MobileTasksView() {
  const { user } = useAuth()
  const { employees } = useEmployees(user?.orgId)
  const { tasks, loading, addTask, updateTask, deleteTask } = useTasks(user?.orgId)
  
  // Main tabs: Team | Personal | Ideas
  const [activeTab, setActiveTab] = useState('team')
  const [searchQuery, setSearchQuery] = useState('')
  
  // Team/Personal sub-tabs: Calendar | To Do | In Progress | On Hold | Review | Completed
  const [teamView, setTeamView] = useState('calendar')
  const [personalView, setPersonalView] = useState('calendar')
  const [calendarDate, setCalendarDate] = useState(new Date())
  
  // Selected calendar day with inline tasks display
  const [selectedDate, setSelectedDate] = useState(null)
  const [dateTasks, setDateTasks] = useState([])
  
  // Task modals
  const [showAddModal, setShowAddModal] = useState(false)
  const [showTaskDetail, setShowTaskDetail] = useState(null)
  const [assigneeSearch, setAssigneeSearch] = useState('')
  
  // Idea modal
  const [showIdeaModal, setShowIdeaModal] = useState(false)
  const [selectedIdea, setSelectedIdea] = useState(null)
  const [newIdea, setNewIdea] = useState({ title: '', bullets: [''] })
  
  const [newTask, setNewTask] = useState({
    title: '',
    description: '',
    dueDate: new Date(),
    priority: 'normal',
    status: 'To Do',
    assignedTo: [],
    notes: '',
    clientName: '',
    clientType: null,
    isPersonal: false,
    category: 'task',
    buzzer: false,
    repeat: { enabled: false, frequency: 'daily', interval: 1, daysOfWeek: [], endDate: null },
    reminder: { enabled: false, timing: 'at_due_date', customDate: null, alertType: 'notification' },
    checklists: []
  })

  const taskEmployees = useMemo(() => {
    return employees.filter(emp => {
      if (emp.includeInTask === false || emp.assignInTask === false) return false
      if (emp.status && !isEmployeeActiveStatus(emp.status)) return false
      return true
    })
  }, [employees])

  const filteredAssignees = useMemo(() => {
    if (!assigneeSearch.trim()) return taskEmployees
    const q = assigneeSearch.toLowerCase().trim()
    return taskEmployees.filter(emp => emp.name?.toLowerCase().includes(q))
  }, [taskEmployees, assigneeSearch])

  const openAddTaskModal = (date = null) => {
    const isPersonalTab = activeTab === 'personal'
    setNewTask({
      title: '',
      description: '',
      dueDate: date || new Date(),
      priority: 'normal',
      status: 'To Do',
      assignedTo: isPersonalTab && user?.uid ? [user.uid] : [],
      notes: '',
      clientName: '',
      clientType: null,
      isPersonal: isPersonalTab,
      category: activeTab === 'ideas' ? 'idea' : 'task',
      buzzer: false,
      repeat: { enabled: false, frequency: 'daily', interval: 1, daysOfWeek: [], endDate: null },
      reminder: { enabled: false, timing: 'at_due_date', customDate: null, alertType: 'notification' },
      checklists: []
    })
    setAssigneeSearch('')
    setShowAddModal(true)
  }

  const filteredTasks = useMemo(() => {
    let filtered = tasks.filter(t => t.category === 'idea' ? activeTab === 'ideas' : activeTab !== 'ideas')
    
    if (activeTab === 'personal') {
      filtered = filtered.filter(t => t.isPersonal)
    } else if (activeTab === 'team') {
      filtered = filtered.filter(t => !t.isPersonal && t.category !== 'idea')
    } else if (activeTab === 'ideas') {
      filtered = filtered.filter(t => t.category === 'idea')
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim()
      filtered = filtered.filter(t => 
        (t.title && t.title.toLowerCase().includes(q)) ||
        (t.description && t.description.toLowerCase().includes(q))
      )
    }
    
    return filtered
  }, [tasks, activeTab, searchQuery])

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
    
    try {
      await addTask({
        title: newTask.title.trim(),
        description: newTask.description?.trim() || '',
        dueDate: newTask.dueDate || null,
        priority: newTask.priority || 'normal',
        status: newTask.status || 'To Do',
        assignedTo: newTask.isPersonal ? (user?.uid ? [user.uid] : []) : (newTask.assignedTo || []),
        notes: newTask.notes?.trim() || '',
        clientName: newTask.clientName?.trim() || '',
        clientType: newTask.clientType || null,
        buzzer: !!newTask.buzzer,
        repeat: newTask.repeat || { enabled: false },
        reminder: newTask.reminder || { enabled: false },
        checklists: newTask.checklists || [],
        isPersonal: !!newTask.isPersonal,
        category: newTask.category || 'task'
      })
      
      setShowAddModal(false)
    } catch (err) {
      console.error('Failed to create task on mobile:', err)
      alert('Failed to create task')
    }
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
                  onClick={() => openAddTaskModal(selectedDate)}
                  className="p-1.5 text-indigo-600 hover:bg-indigo-50 rounded-lg cursor-pointer"
                >
                  <Plus size={18} />
                </button>
                <button 
                  onClick={() => {
                    setSelectedDate(null)
                    setDateTasks([])
                  }}
                  className="p-1.5 text-gray-400 hover:text-gray-600 cursor-pointer"
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
              onClick={() => openAddTaskModal(selectedDate)}
              className="w-full py-2 text-sm font-medium text-indigo-600 bg-indigo-50 rounded-lg cursor-pointer hover:bg-indigo-100/70 transition-colors"
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

      {/* Search Bar */}
      <div className="px-4 py-2 border-b border-gray-100 bg-white">
        <div className="relative">
          <Search size={14} className="absolute left-3 top-2.5 text-gray-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search tasks..."
            className="w-full h-8 pl-8 pr-8 bg-gray-50 border border-gray-200 rounded-lg text-xs placeholder-gray-400 focus:outline-none focus:border-indigo-500 focus:bg-white transition-all font-body"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery('')}
              className="absolute right-2.5 top-2 text-gray-400 hover:text-gray-600 cursor-pointer"
            >
              <X size={14} />
            </button>
          )}
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
                { id: 'On Hold', label: 'On Hold', count: filteredTasks.filter(t => t.status === 'On Hold').length },
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
              {teamView === 'On Hold' && renderTaskList('On Hold', 'On Hold', true)}
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
                { id: 'On Hold', label: 'On Hold', count: filteredTasks.filter(t => t.status === 'On Hold').length },
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
              {personalView === 'On Hold' && renderTaskList('On Hold', 'On Hold', true)}
              {personalView === 'Review' && renderTaskList('Review', 'Review', true)}
              {personalView === 'Completed' && renderTaskList('Completed', 'Completed', true)}
            </div>
          </div>
        )}

        {activeTab === 'ideas' && renderIdeasList()}
      </div>

      {/* Add Task/Idea Button */}
      {/* Add Task/Idea Button */}
      <button 
        onClick={() => activeTab === 'ideas' ? setShowIdeaModal(true) : openAddTaskModal()}
        className="fixed bottom-20 right-4 w-14 h-14 bg-blue-600 hover:bg-blue-700 active:scale-95 rounded-full flex items-center justify-center text-white shadow-xl shadow-blue-300/60 z-30 transition-all cursor-pointer"
        aria-label="Add Task or Idea"
      >
        <Plus size={28} />
      </button>

      {/* Add Task Modal */}
      <Modal
        isOpen={showAddModal}
        onClose={() => setShowAddModal(false)}
        title="New Task"
        size="2xl"
      >
        <form onSubmit={handleAddTask} className="flex flex-col h-full bg-white">
          <div className="flex-1 p-4 space-y-4 overflow-y-auto font-body">
            {/* Task Name */}
            <div>
              <label className="block text-sm font-medium text-slate-800 mb-1.5 font-body">Task Title *</label>
              <input
                type="text"
                placeholder="What needs to be done?"
                className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm font-medium text-slate-900 placeholder:text-slate-400 focus-visible:ring-1 focus-visible:ring-blue-600 outline-none transition-all font-body"
                value={newTask.title}
                onChange={(e) => setNewTask({ ...newTask, title: e.target.value })}
                autoFocus
              />
            </div>

            {/* Description */}
            <div>
              <label className="block text-sm font-medium text-slate-800 mb-1.5 font-body">Description</label>
              <textarea
                className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-xs focus-visible:ring-1 focus-visible:ring-blue-600 outline-none transition-all min-h-[72px] resize-y placeholder:text-slate-400 text-slate-800 font-body"
                placeholder="Add description, instructions, or notes..."
                value={newTask.description}
                onChange={e => setNewTask({ ...newTask, description: e.target.value })}
              />
            </div>

            {/* Priority & Status */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
              {/* Priority */}
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1.5 font-body">Priority</label>
                <div className="grid grid-cols-3 gap-2">
                  {PRIORITIES.map(p => (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => setNewTask({ ...newTask, priority: p.id })}
                      className={`h-9 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition-all border font-heading cursor-pointer ${
                        newTask.priority === p.id 
                          ? `${p.color} font-bold shadow-2xs`
                          : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                      }`}
                    >
                      <span className={`w-2 h-2 rounded-full ${p.dot}`} />
                      {p.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Status */}
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1.5 font-body">Status</label>
                <select
                  className="h-9 w-full rounded-lg border border-slate-200 bg-white px-3 py-1 text-xs focus-visible:ring-1 focus-visible:ring-blue-600 text-slate-800 font-body cursor-pointer"
                  value={newTask.status}
                  onChange={e => setNewTask({ ...newTask, status: e.target.value })}
                >
                  {STATUSES.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
                </select>
              </div>
            </div>

            {/* Due Date & Internal Notes */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
              {/* Due Date */}
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1.5 font-body">Due Date</label>
                <div className="relative">
                  <DatePicker
                    selected={newTask.dueDate ? (newTask.dueDate.toDate ? newTask.dueDate.toDate() : new Date(newTask.dueDate)) : null}
                    onChange={(date) => setNewTask({ ...newTask, dueDate: date })}
                    className="h-9 w-full rounded-lg border border-slate-200 bg-white px-3 py-1 text-xs focus-visible:ring-1 focus-visible:ring-blue-600 placeholder:text-slate-400 text-slate-800 font-body cursor-pointer"
                    placeholderText="Select due date"
                    dateFormat="MMM d, yyyy"
                  />
                  <Calendar className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" size={14} />
                </div>
              </div>

              {/* Internal Notes */}
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1.5 font-body">Internal Notes</label>
                <input
                  type="text"
                  className="h-9 w-full rounded-lg border border-slate-200 bg-white px-3 py-1 text-xs focus-visible:ring-1 focus-visible:ring-blue-600 placeholder:text-slate-400 text-slate-800 font-body"
                  placeholder="Quick note (internal only)"
                  value={newTask.notes}
                  onChange={e => setNewTask({ ...newTask, notes: e.target.value })}
                />
              </div>
            </div>

            {/* Assign To (Multi-Assignee with Search) */}
            {!newTask.isPersonal ? (
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="block text-sm font-medium text-slate-800 font-body">Assign To</label>
                  {newTask.assignedTo?.length > 0 && (
                    <span className="text-[11px] font-semibold text-blue-600 bg-blue-50 px-2 py-0.5 rounded-full border border-blue-200">
                      {newTask.assignedTo.length} selected
                    </span>
                  )}
                </div>

                {/* Inline Search Bar */}
                <div className="relative">
                  <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    type="text"
                    placeholder="Search team members..."
                    value={assigneeSearch}
                    onChange={(e) => setAssigneeSearch(e.target.value)}
                    className="h-8 w-full pl-8 pr-8 rounded-lg border border-slate-200 bg-slate-50/60 px-3 text-xs focus-visible:ring-1 focus-visible:ring-blue-600 placeholder:text-slate-400 text-slate-800 font-body"
                  />
                  {assigneeSearch && (
                    <button
                      type="button"
                      onClick={() => setAssigneeSearch('')}
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-0.5 cursor-pointer"
                    >
                      <X size={12} />
                    </button>
                  )}
                </div>

                {/* Chips Container */}
                <div className="flex flex-wrap gap-1.5 p-2 bg-slate-50/50 border border-slate-200 rounded-xl min-h-[44px] max-h-36 overflow-y-auto">
                  {filteredAssignees.map(emp => {
                    const isSelected = newTask.assignedTo?.includes(emp.id)
                    return (
                      <button
                        key={emp.id}
                        type="button"
                        onClick={() => {
                          const current = newTask.assignedTo || []
                          const updated = isSelected 
                            ? current.filter(id => id !== emp.id)
                            : [...current, emp.id]
                          setNewTask({ ...newTask, assignedTo: updated })
                        }}
                        className={`h-8 px-2.5 rounded-lg text-xs font-medium transition-all flex items-center gap-1.5 border font-body cursor-pointer ${
                          isSelected 
                            ? 'bg-blue-50 text-blue-700 border-blue-300 font-semibold shadow-2xs' 
                            : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                        }`}
                      >
                        <div className={`w-5 h-5 rounded-full text-[9px] font-bold flex items-center justify-center shrink-0 ${
                          isSelected ? 'bg-blue-600 text-white' : 'bg-slate-200 text-slate-700'
                        }`}>
                          {getInitials(emp.name)}
                        </div>
                        <span className="truncate max-w-[120px]">{emp.name}</span>
                        {isSelected && <Check size={12} className="text-blue-600 shrink-0" />}
                      </button>
                    )
                  })}
                  {filteredAssignees.length === 0 && (
                    <p className="text-xs text-slate-400 italic py-1 w-full text-center">No matching team members</p>
                  )}
                </div>
              </div>
            ) : (
              <div className="p-3 bg-blue-50/60 border border-blue-200/80 rounded-xl flex items-center gap-2.5 text-xs text-blue-800 font-body">
                <User size={15} className="text-blue-600 shrink-0" />
                <span>Personal task — automatically assigned to you.</span>
              </div>
            )}

            {/* Client Tracking */}
            <div className="border border-slate-200 rounded-xl overflow-hidden bg-white shadow-2xs">
              <div className="bg-slate-50/80 px-3 py-2 border-b border-slate-200/80 flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-700 uppercase tracking-wider font-heading flex items-center gap-1.5">
                  <User size={13} className="text-slate-400" />
                  Client Tracking
                </span>
                <span className="text-[10px] font-medium text-slate-400 italic font-body">Optional</span>
              </div>
              
              <div className="p-3 space-y-3">
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1 font-body">Client Name</label>
                  <input
                    type="text"
                    className="h-9 w-full rounded-lg border border-slate-200 bg-white px-3 py-1 text-xs focus-visible:ring-1 focus-visible:ring-blue-600 placeholder:text-slate-400 text-slate-800 font-body"
                    placeholder="e.g. Acme Corp / John Doe"
                    value={newTask.clientName || ''}
                    onChange={e => setNewTask({ ...newTask, clientName: e.target.value })}
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1 font-body">Client Type</label>
                  <div className="grid grid-cols-3 gap-2">
                    {CLIENT_TYPES.map(type => {
                      const isSelected = newTask.clientType === type.id
                      return (
                        <button
                          key={type.id}
                          type="button"
                          onClick={() => setNewTask({ ...newTask, clientType: isSelected ? null : type.id })}
                          className={`h-9 rounded-lg text-xs font-medium transition-all border flex items-center justify-center gap-1 cursor-pointer font-body ${
                            isSelected 
                              ? `${type.bgColor} ${type.borderColor} ${type.color} font-bold shadow-2xs`
                              : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                          }`}
                        >
                          <span>{type.icon}</span>
                          <span>{type.label}</span>
                        </button>
                      )
                    })}
                  </div>
                </div>
              </div>
            </div>

            {/* Toggles */}
            <div className="flex items-center gap-6 py-1">
              <label className="flex items-center gap-2 cursor-pointer select-none">
                <div className="relative flex items-center">
                  <input
                    type="checkbox"
                    className="peer sr-only"
                    checked={newTask.isPersonal}
                    onChange={e => {
                      const checked = e.target.checked
                      setNewTask({
                        ...newTask,
                        isPersonal: checked,
                        assignedTo: checked && user?.uid ? [user.uid] : newTask.assignedTo
                      })
                    }}
                  />
                  <div className="w-8 h-4.5 bg-slate-200 rounded-full peer peer-checked:bg-blue-600 transition-colors after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-3.5 after:w-3.5 after:transition-all peer-checked:after:translate-x-3.5 shadow-2xs"></div>
                </div>
                <span className="text-xs font-medium text-slate-700 font-body">Personal Task</span>
              </label>

              <label className="flex items-center gap-2 cursor-pointer select-none">
                <div className="relative flex items-center">
                  <input
                    type="checkbox"
                    className="peer sr-only"
                    checked={newTask.category === 'idea'}
                    onChange={e => setNewTask({ ...newTask, category: e.target.checked ? 'idea' : 'task' })}
                  />
                  <div className="w-8 h-4.5 bg-slate-200 rounded-full peer peer-checked:bg-amber-500 transition-colors after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-3.5 after:w-3.5 after:transition-all peer-checked:after:translate-x-3.5 shadow-2xs"></div>
                </div>
                <span className="text-xs font-medium text-slate-700 font-body">Mark as Idea</span>
              </label>
            </div>

            {/* Buzzer, Repeat, Reminder & Checklist Section */}
            <div className="pt-2 border-t border-slate-200">
              <TaskChecklistBuilder
                buzzer={newTask.buzzer}
                onBuzzerChange={(buzzer) => setNewTask({ ...newTask, buzzer })}
                repeat={newTask.repeat}
                onRepeatChange={(repeat) => setNewTask({ ...newTask, repeat })}
                reminder={newTask.reminder}
                onReminderChange={(reminder) => setNewTask({ ...newTask, reminder })}
                checklists={newTask.checklists}
                onChecklistsChange={(checklists) => setNewTask({ ...newTask, checklists })}
              />
            </div>
          </div>
          
          {/* Modal Footer */}
          <div className="p-3.5 sm:p-4 border-t border-slate-200 bg-white flex gap-3 shrink-0">
            <button
              type="button"
              onClick={() => setShowAddModal(false)}
              className="flex-1 py-2.5 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200/80 rounded-xl transition-colors font-heading cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!newTask.title.trim()}
              className="flex-1 py-2.5 text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-xl shadow-sm active:scale-[0.98] transition-all disabled:opacity-50 font-heading cursor-pointer"
            >
              Create Task
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
      className={`flex items-start gap-3 p-3 bg-white border border-gray-100 rounded-xl active:bg-gray-50 transition-colors cursor-pointer ${isCompleted ? 'opacity-60' : ''}`}
    >
      <button 
        type="button"
        onClick={(e) => {
          e.stopPropagation()
          onComplete(task.id, e)
        }}
        className={`mt-0.5 flex-shrink-0 cursor-pointer ${isCompleted ? 'text-emerald-500' : 'text-gray-300 hover:text-emerald-500 transition-colors'}`}
        title="Toggle task completion"
      >
        {isCompleted ? <CheckCircle2 size={22} /> : <Circle size={22} />}
      </button>
      
      <div className="flex-1 min-w-0">
        <p className={`text-sm font-medium ${isCompleted ? 'line-through text-gray-400' : 'text-gray-900'}`}>
          {task.title}
        </p>
        
        <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
          {task.dueDate && (
            <span className={`text-xs ${isToday(task.dueDate.toDate?.() || new Date(task.dueDate)) ? 'text-rose-500 font-semibold' : 'text-gray-500'}`}>
              {format(task.dueDate.toDate?.() || new Date(task.dueDate), 'MMM d')}
            </span>
          )}
          
          {task.priority !== 'normal' && (
            <span className={`text-xs ${task.priority === 'urgent' ? 'text-rose-500' : 'text-amber-500'}`} title={`Priority: ${task.priority}`}>
              <Flag size={12} />
            </span>
          )}

          {task.clientType && (
            <span className="text-[10px] font-semibold px-1.5 py-0.2 rounded bg-slate-100 text-slate-700 border border-slate-200/80">
              {task.clientType === 'order' ? '📦 Order' : task.clientType === 'complaint' ? '⚠️ Complaint' : '📞 Follow-up'}
            </span>
          )}

          {Array.isArray(task.checklists) && task.checklists.length > 0 && (
            <span className="text-[10px] font-semibold text-slate-500 bg-slate-100 px-1.5 py-0.2 rounded flex items-center gap-0.5">
              <span>☑</span>
              <span>{task.checklists.filter(c => c.completed).length}/{task.checklists.length}</span>
            </span>
          )}
          
          {assignees.length > 0 && (
            <div className="flex -space-x-1 ml-auto">
              {assignees.slice(0, 3).map(emp => (
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
    assignedTo: Array.isArray(task.assignedTo) ? task.assignedTo : task.assignedTo ? [task.assignedTo] : [],
    checklists: Array.isArray(task.checklists) ? task.checklists : []
  })

  const handleSave = async () => {
    await onUpdate(task.id, {
      title: editedTask.title,
      status: editedTask.status,
      priority: editedTask.priority,
      assignedTo: editedTask.assignedTo,
      dueDate: editedTask.dueDate,
      checklists: editedTask.checklists || []
    })
    onClose()
  }

  const StatusIcon = STATUSES.find(s => s.id === editedTask.status)?.icon || Circle
  const statusColor = STATUSES.find(s => s.id === editedTask.status)?.color || 'text-gray-400'

  return (
    <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-end sm:items-center justify-center">
      <div className="bg-white w-full sm:w-[400px] sm:rounded-2xl rounded-t-2xl max-h-[90vh] overflow-hidden animate-in slide-in-from-bottom duration-200">
        <div className="flex items-center justify-between p-4 border-b border-gray-100">
          <button onClick={onClose} className="p-2 -ml-2 text-gray-500 cursor-pointer">
            <X size={20} />
          </button>
          <button 
            onClick={handleSave}
            className="text-indigo-600 font-semibold text-sm cursor-pointer"
          >
            Save
          </button>
        </div>

        <div className="p-4 space-y-5 overflow-y-auto max-h-[calc(90vh-60px)] font-body">
          <div>
            <input
              type="text"
              value={editedTask.title}
              onChange={(e) => setEditedTask({ ...editedTask, title: e.target.value })}
              className="w-full text-lg font-medium text-gray-900 placeholder-gray-400 border-0 focus:ring-0 p-0 font-heading font-semibold"
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
                  className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium transition-colors cursor-pointer ${
                    editedTask.status === s.id 
                      ? 'bg-gray-900 text-white font-semibold' 
                      : 'bg-gray-100 text-gray-600 hover:bg-gray-200/70'
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
                  className={`flex-1 py-2.5 rounded-xl text-xs font-medium transition-all border cursor-pointer ${
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
                    className={`flex items-center gap-1.5 px-3 py-2 rounded-full text-xs font-medium transition-colors border cursor-pointer ${
                      isSelected 
                        ? 'bg-emerald-100 text-emerald-700 border-emerald-200 font-semibold' 
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

          {/* Subtasks / Checklist Items */}
          {Array.isArray(editedTask.checklists) && editedTask.checklists.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <p className="text-xs text-gray-500 uppercase font-medium">Subtasks / Checklist</p>
                <span className="text-[11px] font-bold text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded-full border border-indigo-100">
                  {editedTask.checklists.filter(c => c.completed).length} / {editedTask.checklists.length}
                </span>
              </div>
              <div className="space-y-1.5 bg-slate-50/80 p-2.5 rounded-xl border border-slate-200/80">
                {editedTask.checklists.map((item, idx) => (
                  <label key={item.id || idx} className="flex items-start gap-2.5 p-1.5 rounded-lg hover:bg-white transition-colors cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={!!item.completed}
                      onChange={(e) => {
                        const updated = editedTask.checklists.map((c, i) => i === idx ? { ...c, completed: e.target.checked } : c)
                        setEditedTask({ ...editedTask, checklists: updated })
                      }}
                      className="mt-0.5 rounded text-indigo-600 focus:ring-indigo-500 border-slate-300 w-4 h-4 cursor-pointer"
                    />
                    <div className="flex-1 min-w-0">
                      <span className={`text-xs block ${item.completed ? 'line-through text-slate-400' : 'text-slate-800 font-medium'}`}>
                        {item.title}
                      </span>
                    </div>
                  </label>
                ))}
              </div>
            </div>
          )}

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
            className="w-full py-3 text-rose-600 font-semibold text-sm border-t border-gray-100 flex items-center justify-center gap-2 cursor-pointer hover:bg-rose-50 rounded-b-xl transition-colors"
          >
            <Trash2 size={16} />
            Delete Task
          </button>
        </div>
      </div>
    </div>
  )
}
