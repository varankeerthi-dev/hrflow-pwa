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
  FileText,
  Sparkles,
  ChevronDown,
  ChevronUp,
  List,
  CheckSquare,
  Video,
  Mic,
  Image as ImageIcon,
  MapPin,
  Type
} from 'lucide-react'
import { format, isToday, addDays, startOfMonth, endOfMonth, eachDayOfInterval, isSameMonth } from 'date-fns'
import DatePicker from 'react-datepicker'
import 'react-datepicker/dist/react-datepicker.css'
import { isEmployeeActiveStatus } from '../lib/employeeStatus'
import Modal from './ui/Modal'
import TaskChecklistBuilder from './tasks/TaskChecklistBuilder'
import AssignUserPicker from './tasks/AssignUserPicker'
import { parseNaturalDate } from '../lib/dateUtils'
import { createDefaultChecklistItem, createDefaultSubtask, ensureItemIds } from '../lib/taskUtils'

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
  const [showDescription, setShowDescription] = useState(false)
  const [showAdvancedOptions, setShowAdvancedOptions] = useState(false)
  const [detectedDateInfo, setDetectedDateInfo] = useState(null)
  
  // Idea modal
  const [showIdeaModal, setShowIdeaModal] = useState(false)
  const [selectedIdea, setSelectedIdea] = useState(null)
  const [newIdea, setNewIdea] = useState({ title: '', bullets: [''] })
  
  const [newTask, setNewTask] = useState({
    title: '',
    description: '',
    dueDate: null,
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
    checklists: [],
    subtasks: []
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

  const handleTitleChange = (e) => {
    const value = e.target.value
    const parsed = parseNaturalDate(value)
    if (parsed) {
      setNewTask(prev => ({
        ...prev,
        title: value,
        dueDate: parsed.date
      }))
      setDetectedDateInfo({ label: parsed.label, date: parsed.date })
    } else {
      setNewTask(prev => ({
        ...prev,
        title: value
      }))
    }
  }

  const openAddTaskModal = (date = null) => {
    const isPersonalTab = activeTab === 'personal'
    setNewTask({
      title: '',
      description: '',
      dueDate: date || null,
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
      checklists: [],
      subtasks: []
    })
    setAssigneeSearch('')
    setShowDescription(false)
    setDetectedDateInfo(null)
    setShowAdvancedOptions(false)
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

  const handleToggleSubtask = async (taskId, subtaskId, idx, e) => {
    e?.stopPropagation()
    const task = tasks.find(t => t.id === taskId)
    if (!task || !Array.isArray(task.subtasks)) return
    const updatedSubtasks = task.subtasks.map((item, i) => {
      const isTarget = (subtaskId && item?.id && item.id === subtaskId) || (typeof idx === 'number' && i === idx)
      if (isTarget) {
        return { 
          ...item, 
          id: item.id || `st_${Date.now()}_${i}_${Math.random().toString(36).substring(2, 6)}`,
          completed: !item.completed 
        }
      }
      return item
    })
    await updateTask(taskId, { subtasks: updatedSubtasks })
  }

  const handleToggleAllSubtasks = async (taskId, markCompleted, e) => {
    e?.stopPropagation()
    const task = tasks.find(t => t.id === taskId)
    if (!task || !Array.isArray(task.subtasks)) return
    const updatedSubtasks = task.subtasks.map((item, i) => ({
      ...item,
      id: item.id || `st_${Date.now()}_${i}_${Math.random().toString(36).substring(2, 6)}`,
      completed: markCompleted
    }))
    await updateTask(taskId, { subtasks: updatedSubtasks })
  }

  const handleToggleChecklist = async (taskId, checkId, idx, e) => {
    e?.stopPropagation()
    const task = tasks.find(t => t.id === taskId)
    if (!task || !Array.isArray(task.checklists)) return
    const updatedChecklists = task.checklists.map((item, i) => {
      const isTarget = (checkId && item?.id && item.id === checkId) || (typeof idx === 'number' && i === idx)
      if (isTarget) {
        return { 
          ...item, 
          id: item.id || `cl_${Date.now()}_${i}_${Math.random().toString(36).substring(2, 6)}`,
          completed: !item.completed 
        }
      }
      return item
    })
    await updateTask(taskId, { checklists: updatedChecklists })
  }

  const handleToggleAllChecklists = async (taskId, markCompleted, e) => {
    e?.stopPropagation()
    const task = tasks.find(t => t.id === taskId)
    if (!task || !Array.isArray(task.checklists)) return
    const updatedChecklists = task.checklists.map((item, i) => ({
      ...item,
      id: item.id || `cl_${Date.now()}_${i}_${Math.random().toString(36).substring(2, 6)}`,
      completed: markCompleted
    }))
    await updateTask(taskId, { checklists: updatedChecklists })
  }

  const handleUpdateChecklistResponse = async (taskId, checkId, idx, field, value) => {
    const task = tasks.find(t => t.id === taskId)
    if (!task || !Array.isArray(task.checklists)) return
    const updatedChecklists = task.checklists.map((item, i) => {
      const isTarget = (checkId && item?.id && item.id === checkId) || (typeof idx === 'number' && i === idx)
      if (isTarget) {
        const updated = { 
          ...item, 
          id: item.id || `cl_${Date.now()}_${i}_${Math.random().toString(36).substring(2, 6)}`,
          [field]: value 
        }
        if (field === 'dropdownResponse') {
          updated.completed = Boolean(value && value.trim())
        } else if (field === 'textResponse') {
          if (value && value.trim()) {
            updated.completed = true
          }
        }
        return updated
      }
      return item
    })
    try {
      await updateTask(taskId, { checklists: updatedChecklists })
    } catch (err) {
      console.error('Failed to update checklist response:', err)
    }
  }

  const handleToggleChecklistOption = async (taskId, checkId, idx, optionLabel, e) => {
    e?.stopPropagation?.()
    const task = tasks.find(t => t.id === taskId)
    if (!task || !Array.isArray(task.checklists)) return

    const updatedChecklists = task.checklists.map((item, i) => {
      const isTarget = (checkId && item?.id && item.id === checkId) || (typeof idx === 'number' && i === idx)
      if (isTarget) {
        let currentSelected = []
        if (Array.isArray(item.selectedOptions)) {
          currentSelected = [...item.selectedOptions]
        } else if (typeof item.dropdownResponse === 'string' && item.dropdownResponse.trim()) {
          currentSelected = item.dropdownResponse.split(',').map(s => s.trim()).filter(Boolean)
        }

        const exists = currentSelected.includes(optionLabel)
        const nextSelected = exists 
          ? currentSelected.filter(val => val !== optionLabel) 
          : [...currentSelected, optionLabel]

        return {
          ...item,
          id: item.id || `cl_${Date.now()}_${i}_${Math.random().toString(36).substring(2, 6)}`,
          selectedOptions: nextSelected,
          dropdownResponse: nextSelected.join(', '),
          completed: nextSelected.length > 0
        }
      }
      return item
    })

    try {
      await updateTask(taskId, { checklists: updatedChecklists })
    } catch (err) {
      console.error('Failed to toggle option check:', err)
    }
  }

  const handleToggleAllChecklistOptions = async (taskId, checkId, idx, markAll, e) => {
    e?.stopPropagation?.()
    const task = tasks.find(t => t.id === taskId)
    if (!task || !Array.isArray(task.checklists)) return

    const updatedChecklists = task.checklists.map((item, i) => {
      const isTarget = (checkId && item?.id && item.id === checkId) || (typeof idx === 'number' && i === idx)
      if (isTarget && Array.isArray(item.dropdownConfig?.options)) {
        const nextSelected = markAll ? item.dropdownConfig.options.map(o => o.label).filter(Boolean) : []
        return {
          ...item,
          id: item.id || `cl_${Date.now()}_${i}_${Math.random().toString(36).substring(2, 6)}`,
          selectedOptions: nextSelected,
          dropdownResponse: nextSelected.join(', '),
          completed: nextSelected.length > 0
        }
      }
      return item
    })

    try {
      await updateTask(taskId, { checklists: updatedChecklists })
    } catch (err) {
      console.error('Failed to toggle all options:', err)
    }
  }

  const handleToggleSubtaskChecklist = async (taskId, subtaskId, checkId, subtaskIdx, checkIdx, e) => {
    e?.stopPropagation()
    const task = tasks.find(t => t.id === taskId)
    if (!task || !Array.isArray(task.subtasks)) return
    const updatedSubtasks = task.subtasks.map((st, sIdx) => {
      const isSubtask = (subtaskId && st?.id && st.id === subtaskId) || (typeof subtaskIdx === 'number' && sIdx === subtaskIdx)
      if (isSubtask && Array.isArray(st.checklists)) {
        const updatedCl = st.checklists.map((c, cIdx) => {
          const isCheck = (checkId && c?.id && c.id === checkId) || (typeof checkIdx === 'number' && cIdx === checkIdx)
          if (isCheck) {
            return {
              ...c,
              id: c.id || `sc_${Date.now()}_${cIdx}_${Math.random().toString(36).substring(2, 6)}`,
              completed: !c.completed
            }
          }
          return c
        })
        return { ...st, checklists: updatedCl }
      }
      return st
    })
    await updateTask(taskId, { subtasks: updatedSubtasks })
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
        checklists: ensureItemIds(newTask.checklists || [], 'cl'),
        subtasks: ensureItemIds(newTask.subtasks || [], 'st'),
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
                employees={taskEmployees}
                onToggleSubtask={handleToggleSubtask}
                onToggleAllSubtasks={handleToggleAllSubtasks}
                onToggleChecklist={handleToggleChecklist}
                onToggleAllChecklists={handleToggleAllChecklists}
                onUpdateChecklistResponse={handleUpdateChecklistResponse}
                onToggleChecklistOption={handleToggleChecklistOption}
                onToggleAllChecklistOptions={handleToggleAllChecklistOptions}
                onToggleSubtaskChecklist={handleToggleSubtaskChecklist}
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
        <form onSubmit={handleAddTask} className="flex flex-col h-full bg-white relative">
          <div className="flex-1 p-4 space-y-4 overflow-y-auto font-body pb-6">
            {/* 1. Assign User (First Entry - Inline 2-Row Selection) */}
            {!newTask.isPersonal ? (
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="block text-xs font-semibold text-slate-700 font-heading">
                    Assign To <span className="text-rose-500">*</span>
                  </label>
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

                {/* Two-row selection pills container */}
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

            {/* 2. Task Title & Description Toggle */}
            <div className="space-y-2">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5 font-heading">
                  Task Title<span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  placeholder="What needs to be done?"
                  className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm font-medium text-slate-900 placeholder:text-slate-400 focus-visible:ring-1 focus-visible:ring-blue-600 outline-none transition-all font-body shadow-2xs"
                  value={newTask.title}
                  onChange={handleTitleChange}
                />
              </div>

              {/* Auto-detected Date Chip */}
              {detectedDateInfo && (
                <div className="flex items-center justify-between gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-50 border border-indigo-200 text-indigo-700 text-xs font-medium animate-fadeIn">
                  <div className="flex items-center gap-1.5">
                    <Sparkles size={14} className="text-indigo-600 shrink-0" />
                    <span>Auto-scheduled: <strong>{detectedDateInfo.label}</strong></span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setDetectedDateInfo(null)}
                    className="text-indigo-400 hover:text-indigo-700 p-0.5 cursor-pointer"
                    title="Dismiss"
                  >
                    <X size={12} />
                  </button>
                </div>
              )}

              {/* Description (Optional) Toggle */}
              <div className="pt-0.5">
                {!showDescription && !newTask.description ? (
                  <button
                    type="button"
                    onClick={() => setShowDescription(true)}
                    className="inline-flex items-center gap-1.5 text-xs font-semibold text-blue-600 hover:text-blue-700 transition-colors py-1 cursor-pointer font-heading"
                  >
                    <FileText size={14} />
                    <span>+ Description (optional)</span>
                  </button>
                ) : (
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <label className="block text-xs font-semibold text-slate-700 font-heading">
                        Description <span className="text-slate-400 font-normal font-body">(optional)</span>
                      </label>
                      <button
                        type="button"
                        onClick={() => {
                          if (!newTask.description) setShowDescription(false)
                        }}
                        className="text-[11px] text-slate-400 hover:text-slate-600 cursor-pointer font-body"
                      >
                        Hide
                      </button>
                    </div>
                    <textarea
                      className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-xs focus-visible:ring-1 focus-visible:ring-blue-600 outline-none transition-all min-h-[72px] resize-y placeholder:text-slate-400 text-slate-800 font-body shadow-2xs"
                      placeholder="Add description, instructions, or notes..."
                      value={newTask.description}
                      onChange={e => setNewTask({ ...newTask, description: e.target.value })}
                    />
                  </div>
                )}
              </div>
            </div>

            {/* 3. Due Date & Time Picker (Optional) */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="block text-xs font-semibold text-slate-700 font-heading">
                  Due Date & Time <span className="text-slate-400 font-normal font-body">(optional)</span>
                </label>
                {newTask.dueDate && (
                  <button
                    type="button"
                    onClick={() => {
                      setNewTask({ ...newTask, dueDate: null })
                      setDetectedDateInfo(null)
                    }}
                    className="text-[11px] font-medium text-rose-500 hover:text-rose-600 cursor-pointer font-body"
                  >
                    Clear date
                  </button>
                )}
              </div>
              <div className="relative">
                <DatePicker
                  selected={newTask.dueDate ? (newTask.dueDate.toDate ? newTask.dueDate.toDate() : new Date(newTask.dueDate)) : null}
                  onChange={(date) => {
                    setNewTask({ ...newTask, dueDate: date })
                  }}
                  showTimeSelect
                  timeIntervals={15}
                  timeFormat="hh:mm aa"
                  dateFormat="MMM d, yyyy h:mm aa"
                  wrapperClassName="w-full"
                  className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 pr-10 py-1 text-xs focus-visible:ring-1 focus-visible:ring-blue-600 placeholder:text-slate-400 text-slate-800 font-body cursor-pointer shadow-2xs"
                  placeholderText="Select due date & time"
                />
                <Calendar className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" size={15} />
              </div>
            </div>

            {/* 4. Client Tracking (Hidden from UI per user request, code and state preserved) */}
            {/*
            <div className="border border-slate-200 rounded-xl overflow-hidden bg-white shadow-2xs">
              <div className="bg-slate-50/80 px-3 py-2 border-b border-slate-200/80 flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-700 uppercase tracking-wider font-heading flex items-center gap-1.5">
                  <User size={13} className="text-slate-400" />
                  Client Tracking
                </span>
                <span className="text-[10px] font-medium text-slate-400 italic font-body">Optional</span>
              </div>
              <div className="p-3 space-y-3">
                <input
                  type="text"
                  placeholder="Client name"
                  value={newTask.clientName || ''}
                  onChange={e => setNewTask({ ...newTask, clientName: e.target.value })}
                />
              </div>
            </div>
            */}

            {/* 5. Personal Task & Mark as Idea Switches */}
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

            {/* 6. Buzzer, Repeat, Reminder & Checklist Section (Image 2 layout) */}
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
                subtasks={newTask.subtasks}
                onSubtasksChange={(subtasks) => setNewTask({ ...newTask, subtasks })}
                employees={taskEmployees}
              />
            </div>

            {/* Collapsible Advanced Options: Priority, Status, Notes */}
            <div className="pt-2 border-t border-slate-200">
              <button
                type="button"
                onClick={() => setShowAdvancedOptions(!showAdvancedOptions)}
                className="w-full flex items-center justify-between py-2 text-xs font-semibold text-slate-600 hover:text-slate-900 transition-colors font-heading cursor-pointer"
              >
                <span>Priority, Status & Notes</span>
                {showAdvancedOptions ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
              </button>

              {showAdvancedOptions && (
                <div className="space-y-3.5 pt-2 pb-1 animate-fadeIn">
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
              )}
            </div>
          </div>
          
          {/* 7. Modal Footer - Sticky at the bottom */}
          <div className="sticky bottom-0 left-0 right-0 p-3.5 sm:p-4 border-t border-slate-200 bg-white flex gap-3 shrink-0 z-20 shadow-[0_-4px_12px_rgba(0,0,0,0.06)]">
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
function TaskItem({ 
  task, 
  onClick, 
  onComplete, 
  getAssigneeInfo, 
  employees = [],
  onToggleSubtask, 
  onToggleAllSubtasks,
  onToggleChecklist, 
  onToggleAllChecklists,
  onUpdateChecklistResponse, 
  onToggleChecklistOption,
  onToggleAllChecklistOptions,
  onToggleSubtaskChecklist 
}) {
  const assignees = getAssigneeInfo(task.assignedTo)
  const isCompleted = task.status === 'Completed'
  const [showSubtasks, setShowSubtasks] = useState(false)
  const [showChecklist, setShowChecklist] = useState(false)

  const subtasks = Array.isArray(task.subtasks) ? task.subtasks : []
  const checklists = Array.isArray(task.checklists) ? task.checklists : []
  const completedSubtasksCount = subtasks.filter(s => s.completed).length
  const completedChecklistsCount = checklists.filter(c => c.completed).length

  return (
    <div
      onClick={onClick}
      className={`flex flex-col p-3 bg-white border border-gray-100 rounded-xl active:bg-gray-50/70 transition-colors cursor-pointer ${isCompleted ? 'opacity-65' : ''}`}
    >
      <div className="flex items-start gap-3">
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

            {/* Sub-tasks Badge */}
            {subtasks.length > 0 && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation()
                  setShowSubtasks(!showSubtasks)
                }}
                className={`text-[10px] font-semibold px-2 py-0.5 rounded-md flex items-center gap-1 transition-colors border cursor-pointer ${
                  completedSubtasksCount === subtasks.length
                    ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                    : 'bg-blue-50 text-blue-700 border-blue-200 hover:bg-blue-100/70'
                }`}
                title="View subtasks"
              >
                <List size={11} />
                <span>{completedSubtasksCount}/{subtasks.length} Sub-tasks</span>
                {showSubtasks ? <ChevronUp size={11} /> : <ChevronDown size={11} />}
              </button>
            )}

            {/* Checklist / Validations Badge */}
            {checklists.length > 0 && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation()
                  setShowChecklist(!showChecklist)
                }}
                className={`text-[10px] font-semibold px-2 py-0.5 rounded-md flex items-center gap-1 transition-colors border cursor-pointer ${
                  completedChecklistsCount === checklists.length
                    ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                    : 'bg-purple-50 text-purple-700 border-purple-200 hover:bg-purple-100/70'
                }`}
                title="View checklist validations"
              >
                <CheckSquare size={11} />
                <span>{completedChecklistsCount}/{checklists.length} Checklist</span>
                {showChecklist ? <ChevronUp size={11} /> : <ChevronDown size={11} />}
              </button>
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

      {/* Expandable Inline Sub-tasks Drawer */}
      {showSubtasks && subtasks.length > 0 && (
        <div 
          className="mt-3 pt-2.5 border-t border-slate-100 space-y-2 animate-fadeIn"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-center justify-between text-[11px] font-semibold text-slate-500 font-heading">
            <span className="flex items-center gap-1"><List size={12} className="text-blue-600" /> SUB-TASKS</span>
            <div className="flex items-center gap-2">
              <span>{completedSubtasksCount} of {subtasks.length} completed</span>
              {subtasks.length > 1 && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation()
                    onToggleAllSubtasks?.(task.id, completedSubtasksCount < subtasks.length, e)
                  }}
                  className="text-[10px] text-blue-700 hover:text-blue-900 font-semibold underline underline-offset-2 cursor-pointer"
                >
                  {completedSubtasksCount === subtasks.length ? 'Unmark all' : 'Mark all done'}
                </button>
              )}
            </div>
          </div>

          <div className="space-y-1.5">
            {subtasks.map((st, idx) => {
              const stAssignees = getAssigneeInfo(st.assignedTo)
              return (
                <div 
                  key={st.id || idx} 
                  className="p-2.5 bg-slate-50/80 border border-slate-200/90 rounded-xl space-y-1.5 text-xs"
                >
                  <div className="flex items-center justify-between gap-2">
                    <label className="flex items-center gap-2 cursor-pointer flex-1 min-w-0 select-none">
                      <input
                        type="checkbox"
                        checked={!!st.completed}
                        onChange={(e) => onToggleSubtask?.(task.id, st.id, idx, e)}
                        className="w-4 h-4 rounded text-blue-600 focus:ring-blue-500 border-slate-300 cursor-pointer"
                      />
                      <span className={`text-xs font-medium truncate ${st.completed ? 'line-through text-slate-400' : 'text-slate-800'}`}>
                        {st.title || `Sub-task #${idx + 1}`}
                      </span>
                    </label>

                    <button
                      type="button"
                      onClick={(e) => onToggleSubtask?.(task.id, st.id, idx, e)}
                      className={`text-[10px] px-2 py-0.5 rounded font-semibold shrink-0 cursor-pointer border ${
                        st.completed 
                          ? 'bg-emerald-100 text-emerald-700 border-emerald-200' 
                          : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-100'
                      }`}
                    >
                      {st.completed ? '✓ Completed' : 'To Do'}
                    </button>
                  </div>

                  {/* Subtask Meta: Assignees, Due Date, Reminder */}
                  <div className="flex items-center gap-2 flex-wrap text-[10px] text-slate-500 pt-0.5">
                    {stAssignees.length > 0 && (
                      <div className="flex items-center gap-1">
                        <span className="text-slate-400">Assigned:</span>
                        <div className="flex -space-x-1">
                          {stAssignees.map(a => (
                            <span key={a.id} className="w-4 h-4 rounded-full bg-blue-100 text-blue-700 font-bold text-[8px] flex items-center justify-center ring-1 ring-white" title={a.name}>
                              {a.name?.charAt(0).toUpperCase()}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                    {st.dueDate && (
                      <span className="flex items-center gap-1">
                        <Calendar size={10} className="text-slate-400" />
                        <span>{format(st.dueDate.toDate?.() || new Date(st.dueDate), 'MMM d, h:mm a')}</span>
                      </span>
                    )}
                    {st.reminder?.enabled && (
                      <span className="flex items-center gap-0.5 text-amber-600" title="Reminder enabled">
                        <Bell size={10} />
                      </span>
                    )}
                  </div>

                  {/* Subtask's own checklist items */}
                  {Array.isArray(st.checklists) && st.checklists.length > 0 && (
                    <div className="pl-4 pt-1 space-y-1 border-t border-slate-200/50 mt-1">
                      {st.checklists.map((sc, scIdx) => (
                        <label key={sc.id || scIdx} className="flex items-center gap-2 cursor-pointer text-[11px] text-slate-600 select-none">
                          <input
                            type="checkbox"
                            checked={!!sc.completed}
                            onChange={(e) => onToggleSubtaskChecklist?.(task.id, st.id, sc.id, idx, scIdx, e)}
                            className="w-3.5 h-3.5 rounded text-emerald-600 focus:ring-emerald-500 border-slate-300 cursor-pointer"
                          />
                          <span className={sc.completed ? 'line-through text-slate-400' : 'text-slate-700'}>
                            {sc.title}
                          </span>
                        </label>
                      ))}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Expandable Inline Checklist / Validations Drawer */}
      {showChecklist && checklists.length > 0 && (
        <div 
          className="mt-3 pt-2.5 border-t border-slate-100 space-y-2 animate-fadeIn"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-center justify-between text-[10px] font-semibold text-slate-500 font-heading uppercase tracking-wider">
            <span className="flex items-center gap-1.5"><CheckSquare size={12} className="text-emerald-600" /> Checklist & Validations</span>
            <div className="flex items-center gap-2">
              <span className="text-emerald-700 font-mono tabular-nums">{completedChecklistsCount}/{checklists.length}</span>
              {checklists.length > 1 && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation()
                    onToggleAllChecklists?.(task.id, completedChecklistsCount < checklists.length, e)
                  }}
                  className="text-[10px] text-emerald-600 hover:text-emerald-800 font-semibold underline underline-offset-2 cursor-pointer normal-case tracking-normal"
                >
                  {completedChecklistsCount === checklists.length ? 'Uncheck all' : 'Check all'}
                </button>
              )}
            </div>
          </div>

          <div className="space-y-1.5">
            {checklists.map((item, idx) => (
              <div 
                key={item.id || idx} 
                className="p-2.5 bg-white border border-slate-200 rounded-xl space-y-2 text-xs shadow-[0_1px_3px_rgba(0,0,0,0.04)]"
              >
                {/* Header row: Checkbox, Title & Status Badge */}
                <div className="flex items-center justify-between gap-2">
                  <div 
                    className="flex items-center gap-2 cursor-pointer flex-1 min-w-0 select-none group"
                    onClick={(e) => {
                      e.stopPropagation()
                      onToggleChecklist?.(task.id, item.id, idx, e)
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={!!item.completed}
                      onChange={(e) => {
                        e.stopPropagation()
                        onToggleChecklist?.(task.id, item.id, idx, e)
                      }}
                      onClick={(e) => e.stopPropagation()}
                      className="w-4 h-4 rounded-md text-emerald-600 focus:ring-emerald-500 border-slate-300 cursor-pointer shrink-0"
                    />
                    <span className={`text-xs font-medium truncate transition-colors ${
                      item.completed ? 'line-through text-slate-400' : 'text-slate-800 group-hover:text-emerald-700'
                    }`}>
                      {item.title || `Checklist item #${idx + 1}`}
                    </span>
                  </div>

                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation()
                      onToggleChecklist?.(task.id, item.id, idx, e)
                    }}
                    className={`text-[10px] px-2 py-0.5 rounded-md font-semibold shrink-0 cursor-pointer border transition-all ${
                      item.completed 
                        ? 'bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100' 
                        : 'bg-white text-slate-500 border-slate-200 hover:bg-slate-50 hover:border-slate-300'
                    }`}
                  >
                    {item.completed ? '✓ Done' : '○ To do'}
                  </button>
                </div>

                {/* Validation chips */}
                <div className="flex flex-wrap gap-1">
                  {item.required && (
                    <span className="text-[9px] font-bold text-rose-600 bg-rose-50 px-1.5 py-0.5 rounded-md border border-rose-200">
                      Required
                    </span>
                  )}
                  {item.validations?.text && <span className="text-[9px] font-medium bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded-md border border-slate-200">Manual text</span>}
                  {item.validations?.dropdown && <span className="text-[9px] font-medium bg-emerald-50 text-emerald-700 px-1.5 py-0.5 rounded-md border border-emerald-200">Dropdown</span>}
                  {item.validations?.image && <span className="text-[9px] font-medium bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded-md border border-slate-200">Photo</span>}
                  {item.validations?.file && <span className="text-[9px] font-medium bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded-md border border-slate-200">File</span>}
                  {item.validations?.video && <span className="text-[9px] font-medium bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded-md border border-slate-200">Video</span>}
                  {item.validations?.audio && <span className="text-[9px] font-medium bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded-md border border-slate-200">Audio</span>}
                  {item.validations?.geoTag && <span className="text-[9px] font-medium bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded-md border border-slate-200">Location</span>}
                </div>

                {/* Manual Typing text input */}
                {item.validations?.text && (
                  <div className="space-y-1 pt-1">
                    <label className="text-[10px] font-medium text-slate-600 block">
                      ✏️ Manual typing response:
                    </label>
                    <input
                      type="text"
                      defaultValue={item.textResponse || ''}
                      onBlur={(e) => onUpdateChecklistResponse?.(task.id, item.id, idx, 'textResponse', e.target.value)}
                      placeholder="Type response, findings or notes..."
                      className="h-8 w-full rounded-lg border border-slate-200 bg-white px-2.5 text-xs text-slate-800 placeholder:text-slate-400 focus:outline-none focus:border-blue-500 font-body"
                    />
                  </div>
                )}

                {/* Dropdown Options with a Checkbox for EACH Option */}
                {item.validations?.dropdown && Array.isArray(item.dropdownConfig?.options) && item.dropdownConfig.options.length > 0 ? (
                  (() => {
                    let currentSelected = []
                    if (Array.isArray(item.selectedOptions)) {
                      currentSelected = item.selectedOptions
                    } else if (typeof item.dropdownResponse === 'string' && item.dropdownResponse.trim()) {
                      currentSelected = item.dropdownResponse.split(',').map(s => s.trim()).filter(Boolean)
                    }

                    return (
                      <div className="space-y-1.5 pt-1" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center justify-between text-[11px] font-semibold text-slate-700">
                          <span className="flex items-center gap-1 font-heading text-slate-600">
                            <List size={12} className="text-purple-600" />
                            <span>Options ({currentSelected.length}/{item.dropdownConfig.options.length} done):</span>
                          </span>
                          {item.dropdownConfig.options.length > 1 && (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation()
                                const allLabels = item.dropdownConfig.options.map(o => o.label).filter(Boolean)
                                const allDone = allLabels.length > 0 && allLabels.every(l => currentSelected.includes(l))
                                onToggleAllChecklistOptions?.(task.id, item.id, idx, !allDone, e)
                              }}
                              className="text-[10px] text-purple-600 hover:text-purple-800 font-semibold underline underline-offset-2 cursor-pointer"
                            >
                              {item.dropdownConfig.options.map(o => o.label).filter(Boolean).every(l => currentSelected.includes(l)) ? 'Uncheck all' : 'Check all'}
                            </button>
                          )}
                        </div>

                        <div className="space-y-1 bg-white rounded-lg border border-slate-200/90 p-1.5 shadow-2xs">
                          {item.dropdownConfig.options.map((opt, optIdx) => {
                            const optLabel = opt.label || `Option ${optIdx + 1}`
                            const isChecked = currentSelected.includes(optLabel) || (opt.id && currentSelected.includes(opt.id))
                            return (
                              <div
                                key={opt.id || optIdx}
                                onClick={(e) => {
                                  e.stopPropagation()
                                  onToggleChecklistOption?.(task.id, item.id, idx, optLabel, e)
                                }}
                                className={`flex items-center justify-between px-2.5 py-2 rounded-md border text-xs cursor-pointer transition-all select-none group ${
                                  isChecked
                                    ? 'bg-purple-50/70 border-purple-200 text-purple-900'
                                    : 'bg-slate-50/60 border-slate-200/70 text-slate-700 hover:bg-slate-100/70'
                                }`}
                              >
                                <div className="flex items-center gap-2 flex-1 min-w-0">
                                  <input
                                    type="checkbox"
                                    checked={isChecked}
                                    onChange={(e) => {
                                      e.stopPropagation()
                                      onToggleChecklistOption?.(task.id, item.id, idx, optLabel, e)
                                    }}
                                    onClick={(e) => e.stopPropagation()}
                                    className="w-4 h-4 rounded text-purple-600 focus:ring-purple-500 border-slate-300 cursor-pointer shrink-0"
                                  />
                                  <span className={`text-xs truncate transition-colors ${
                                    isChecked ? 'line-through font-semibold text-purple-900' : 'text-slate-800 group-hover:text-purple-700'
                                  }`}>
                                    {optLabel}
                                  </span>
                                </div>

                                <span
                                  className={`text-[9px] px-1.5 py-0.5 rounded font-bold shrink-0 border transition-colors ${
                                    isChecked
                                      ? 'bg-purple-600 text-white border-purple-600'
                                      : 'bg-white text-slate-500 border-slate-200 group-hover:border-slate-300'
                                  }`}
                                >
                                  {isChecked ? '✓ Done' : '○ To do'}
                                </span>
                              </div>
                            )
                          })}
                        </div>
                      </div>
                    )
                  })()
                ) : item.validations?.dropdown ? (
                  <div className="space-y-1 pt-1">
                    <label className="text-[10px] font-medium text-slate-600 block">
                      📋 Select option:
                    </label>
                    <select
                      value={item.dropdownResponse || ''}
                      onChange={(e) => onUpdateChecklistResponse?.(task.id, item.id, idx, 'dropdownResponse', e.target.value)}
                      className="h-8 w-full rounded-lg border border-slate-200 bg-white px-2.5 text-xs text-slate-800 focus:outline-none focus:border-blue-500 cursor-pointer font-body"
                    >
                      <option value="">-- Choose option --</option>
                      {item.dropdownConfig?.options?.map(opt => (
                        <option key={opt.id} value={opt.label}>{opt.label}</option>
                      ))}
                    </select>
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// Task Detail Modal Component
function TaskDetailModal({ task, employees, onClose, onUpdate, onDelete }) {
  const [editedTask, setEditedTask] = useState({
    ...task,
    assignedTo: Array.isArray(task.assignedTo) ? task.assignedTo : task.assignedTo ? [task.assignedTo] : [],
    checklists: ensureItemIds(Array.isArray(task.checklists) ? task.checklists : [], 'cl'),
    subtasks: ensureItemIds(Array.isArray(task.subtasks) ? task.subtasks : [], 'st')
  })

  const handleSave = async () => {
    await onUpdate(task.id, {
      title: editedTask.title,
      status: editedTask.status,
      priority: editedTask.priority,
      assignedTo: editedTask.assignedTo,
      dueDate: editedTask.dueDate,
      checklists: ensureItemIds(editedTask.checklists || [], 'cl'),
      subtasks: ensureItemIds(editedTask.subtasks || [], 'st')
    })
    onClose()
  }

  // --- CHECKLIST / VALIDATIONS HANDLERS ---
  const toggleChecklist = (idx) => {
    const updated = (editedTask.checklists || []).map((c, i) => {
      if (i === idx) return { ...c, completed: !c.completed }
      return c
    })
    setEditedTask({ ...editedTask, checklists: updated })
  }

  const toggleAllChecklists = (markCompleted) => {
    const updated = (editedTask.checklists || []).map(c => ({ ...c, completed: markCompleted }))
    setEditedTask({ ...editedTask, checklists: updated })
  }

  const handleChecklistFieldChange = (idx, field, value) => {
    const updated = (editedTask.checklists || []).map((c, i) => {
      if (i === idx) return { ...c, [field]: value }
      return c
    })
    setEditedTask({ ...editedTask, checklists: updated })
  }

  const handleAddChecklist = () => {
    const nextNum = (editedTask.checklists || []).length + 1
    const newItem = createDefaultChecklistItem(`Validation #${nextNum}`)
    setEditedTask({
      ...editedTask,
      checklists: [...(editedTask.checklists || []), newItem]
    })
  }

  const handleRemoveChecklist = (idx) => {
    const updated = (editedTask.checklists || []).filter((_, i) => i !== idx)
    setEditedTask({ ...editedTask, checklists: updated })
  }

  const toggleSubtask = (idx) => {
    const updated = (editedTask.subtasks || []).map((s, i) => {
      if (i === idx) return { ...s, completed: !s.completed }
      return s
    })
    setEditedTask({ ...editedTask, subtasks: updated })
  }

  const toggleAllSubtasks = (markCompleted) => {
    const updated = (editedTask.subtasks || []).map(s => ({ ...s, completed: markCompleted }))
    setEditedTask({ ...editedTask, subtasks: updated })
  }

  const handleSubtaskFieldChange = (idx, field, value) => {
    const updated = (editedTask.subtasks || []).map((s, i) => {
      if (i === idx) return { ...s, [field]: value }
      return s
    })
    setEditedTask({ ...editedTask, subtasks: updated })
  }

  const handleAddSubtask = () => {
    const nextNum = (editedTask.subtasks || []).length + 1
    const newItem = createDefaultSubtask(`Sub Task #${nextNum}`)
    setEditedTask({
      ...editedTask,
      subtasks: [...(editedTask.subtasks || []), newItem]
    })
  }

  const handleRemoveSubtask = (idx) => {
    const updated = (editedTask.subtasks || []).filter((_, i) => i !== idx)
    setEditedTask({ ...editedTask, subtasks: updated })
  }

  const toggleSubtaskAssignee = (subtaskIdx, empId) => {
    const current = editedTask.subtasks?.[subtaskIdx]
    if (!current) return
    const currentAssignees = Array.isArray(current.assignedTo) ? current.assignedTo : []
    const updatedAssignees = currentAssignees.includes(empId)
      ? currentAssignees.filter(id => id !== empId)
      : [...currentAssignees, empId]
    handleSubtaskFieldChange(subtaskIdx, 'assignedTo', updatedAssignees)
  }

  const handleAddSubtaskChecklistItem = (subtaskIdx) => {
    const current = editedTask.subtasks?.[subtaskIdx]
    if (!current) return
    const newClItem = {
      id: 'sc_' + Date.now() + '_' + Math.random().toString(36).substring(2, 6),
      title: '',
      completed: false
    }
    const updatedChecklists = [...(current.checklists || []), newClItem]
    handleSubtaskFieldChange(subtaskIdx, 'checklists', updatedChecklists)
  }

  const handleToggleSubtaskChecklistItem = (subtaskIdx, itemIdx) => {
    const current = editedTask.subtasks?.[subtaskIdx]
    if (!current || !Array.isArray(current.checklists)) return
    const updatedChecklists = current.checklists.map((c, i) => i === itemIdx ? { ...c, completed: !c.completed } : c)
    handleSubtaskFieldChange(subtaskIdx, 'checklists', updatedChecklists)
  }

  const handleUpdateSubtaskChecklistItem = (subtaskIdx, itemIdx, title) => {
    const current = editedTask.subtasks?.[subtaskIdx]
    if (!current || !Array.isArray(current.checklists)) return
    const updatedChecklists = current.checklists.map((c, i) => i === itemIdx ? { ...c, title } : c)
    handleSubtaskFieldChange(subtaskIdx, 'checklists', updatedChecklists)
  }

  const handleRemoveSubtaskChecklistItem = (subtaskIdx, itemIdx) => {
    const current = editedTask.subtasks?.[subtaskIdx]
    if (!current || !Array.isArray(current.checklists)) return
    const updatedChecklists = current.checklists.filter((_, i) => i !== itemIdx)
    handleSubtaskFieldChange(subtaskIdx, 'checklists', updatedChecklists)
  }

  const checklists = editedTask.checklists || []
  const subtasks = editedTask.subtasks || []
  const completedChecklistsCount = checklists.filter(c => c.completed).length
  const completedSubtasksCount = subtasks.filter(s => s.completed).length

  return (
    <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-end sm:items-center justify-center">
      <div className="bg-white w-full sm:w-[460px] sm:rounded-2xl rounded-t-2xl max-h-[92vh] overflow-hidden animate-in slide-in-from-bottom duration-200 flex flex-col shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-100 shrink-0 bg-white">
          <button onClick={onClose} className="p-2 -ml-2 text-gray-500 hover:text-gray-700 cursor-pointer">
            <X size={20} />
          </button>
          <h3 className="text-sm font-bold text-slate-900 font-heading">Task Details</h3>
          <button 
            onClick={handleSave}
            className="h-8 px-4 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-bold font-heading cursor-pointer shadow-2xs"
          >
            Save
          </button>
        </div>

        {/* Content Body */}
        <div className="p-4 space-y-5 overflow-y-auto flex-1 font-body">
          {/* Assignees */}
          <div className="space-y-2">
            <p className="text-xs text-gray-500 uppercase font-medium font-heading">Assigned to</p>
            <div className="flex flex-wrap gap-1.5 max-h-28 overflow-y-auto p-1 bg-slate-50/60 rounded-xl border border-slate-200/80">
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
                    className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors border cursor-pointer ${
                      isSelected 
                        ? 'bg-blue-50 text-blue-700 border-blue-300 font-semibold shadow-2xs' 
                        : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'
                    }`}
                  >
                    <div className={`w-4 h-4 rounded-full flex items-center justify-center text-[9px] font-bold ${
                      isSelected ? 'bg-blue-600 text-white' : 'bg-gray-200 text-gray-700'
                    }`}>
                      {emp.name.charAt(0).toUpperCase()}
                    </div>
                    <span>{emp.name}</span>
                    {isSelected && <Check size={12} className="text-blue-600" />}
                  </button>
                )
              })}
            </div>
          </div>

          {/* Title */}
          <div>
            <label className="text-xs text-gray-500 uppercase font-medium font-heading block mb-1">Task Title</label>
            <input
              type="text"
              value={editedTask.title}
              onChange={(e) => setEditedTask({ ...editedTask, title: e.target.value })}
              className="w-full text-base font-semibold text-gray-900 border border-slate-200 rounded-lg p-2.5 focus:border-blue-500 focus:outline-none font-heading"
              placeholder="Task name"
            />
          </div>

          {/* Status */}
          <div className="space-y-2">
            <p className="text-xs text-gray-500 uppercase font-medium font-heading">Status</p>
            <div className="flex flex-wrap gap-2">
              {STATUSES.map(s => (
                <button
                  key={s.id}
                  onClick={() => setEditedTask({ ...editedTask, status: s.id })}
                  className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium transition-colors cursor-pointer border ${
                    editedTask.status === s.id 
                      ? 'bg-gray-900 text-white border-gray-900 font-semibold' 
                      : 'bg-white border-slate-200 text-gray-600 hover:bg-gray-50'
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
            <p className="text-xs text-gray-500 uppercase font-medium font-heading">Priority</p>
            <div className="flex gap-2">
              {PRIORITIES.map(p => (
                <button
                  key={p.id}
                  onClick={() => setEditedTask({ ...editedTask, priority: p.id })}
                  className={`flex-1 py-2 rounded-xl text-xs font-medium transition-all border cursor-pointer font-heading ${
                    editedTask.priority === p.id ? `${p.color} font-bold shadow-2xs` : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50'
                  }`}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>

          {/* ========================================================= */}
          {/* 1. CHECKLIST & VALIDATIONS SECTION                        */}
          {/* ========================================================= */}
          <div className="space-y-2.5 pt-2 border-t border-slate-200">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-gray-700 uppercase font-bold font-heading flex items-center gap-1.5">
                  <CheckSquare size={13} className="text-purple-600" />
                  <span>Checklist & Validations</span>
                </p>
                <p className="text-[11px] text-gray-400">Mark as checked or provide manual response</p>
              </div>
              {checklists.length > 0 && (
                <div className="flex items-center gap-2">
                  <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full border ${
                    completedChecklistsCount === checklists.length
                      ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                      : 'bg-purple-50 text-purple-700 border-purple-200'
                  }`}>
                    {completedChecklistsCount} / {checklists.length} Checked
                  </span>
                  {checklists.length > 1 && (
                    <button
                      type="button"
                      onClick={() => toggleAllChecklists(completedChecklistsCount < checklists.length)}
                      className="text-[10px] text-purple-700 hover:text-purple-900 font-semibold underline cursor-pointer"
                    >
                      {completedChecklistsCount === checklists.length ? 'Uncheck all' : 'Check all'}
                    </button>
                  )}
                </div>
              )}
            </div>

            {checklists.length === 0 ? (
              <div className="p-3 bg-slate-50 border border-dashed border-slate-200 rounded-xl text-center">
                <p className="text-xs text-slate-400 italic mb-1.5">No checklist validations added yet</p>
                <button
                  type="button"
                  onClick={handleAddChecklist}
                  className="text-xs font-semibold text-purple-600 hover:text-purple-700 transition-colors inline-flex items-center gap-1 cursor-pointer font-heading"
                >
                  <Plus size={14} />
                  <span>Add Checklist Field</span>
                </button>
              </div>
            ) : (
              <div className="space-y-2.5">
                {checklists.map((item, idx) => (
                  <div
                    key={item.id || idx}
                    className="p-3 bg-slate-50/90 border border-slate-200 rounded-xl space-y-2.5 transition-all shadow-2xs"
                  >
                    {/* Header: Checkbox, Title, Checked badge & Delete */}
                    <div className="flex items-start justify-between gap-2">
                      <label className="flex items-start gap-2.5 cursor-pointer flex-1 min-w-0 select-none">
                        <input
                          type="checkbox"
                          checked={!!item.completed}
                          onChange={() => toggleChecklist(idx)}
                          className="mt-0.5 w-4 h-4 rounded text-blue-600 focus:ring-blue-500 border-slate-300 cursor-pointer"
                        />
                        <div className="flex-1 min-w-0">
                          <input
                            type="text"
                            value={item.title || ''}
                            onChange={(e) => handleChecklistFieldChange(idx, 'title', e.target.value)}
                            placeholder="Checklist field title"
                            className={`w-full text-xs font-semibold bg-transparent border-0 p-0 focus:ring-0 ${
                              item.completed ? 'line-through text-slate-400' : 'text-slate-800'
                            }`}
                          />
                        </div>
                      </label>

                      <div className="flex items-center gap-1.5 shrink-0">
                        {/* Toggle Checked / Not Checked Button */}
                        <button
                          type="button"
                          onClick={() => toggleChecklist(idx)}
                          className={`text-[10px] px-2 py-0.5 rounded font-semibold transition-colors border cursor-pointer ${
                            item.completed 
                              ? 'bg-emerald-100 text-emerald-700 border-emerald-200' 
                              : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-100'
                          }`}
                        >
                          {item.completed ? '✓ Checked' : '○ Not checked'}
                        </button>
                        <button
                          type="button"
                          onClick={() => handleRemoveChecklist(idx)}
                          className="p-1 text-slate-400 hover:text-rose-600 cursor-pointer transition-colors"
                          title="Remove checklist item"
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                    </div>

                    {/* Validation tags */}
                    <div className="flex flex-wrap gap-1">
                      {item.required && (
                        <span className="text-[9px] font-bold text-rose-600 bg-rose-50 px-1.5 py-0.2 rounded border border-rose-200">
                          Required
                        </span>
                      )}
                      {item.validations?.text && <span className="text-[9px] bg-blue-50 text-blue-700 px-1.5 py-0.2 rounded border border-blue-200">Manual text</span>}
                      {item.validations?.dropdown && <span className="text-[9px] bg-purple-50 text-purple-700 px-1.5 py-0.2 rounded border border-purple-200">Dropdown</span>}
                      {item.validations?.image && <span className="text-[9px] bg-slate-100 text-slate-600 px-1.5 py-0.2 rounded">Photo</span>}
                      {item.validations?.file && <span className="text-[9px] bg-slate-100 text-slate-600 px-1.5 py-0.2 rounded">File</span>}
                      {item.validations?.video && <span className="text-[9px] bg-slate-100 text-slate-600 px-1.5 py-0.2 rounded">Video</span>}
                      {item.validations?.audio && <span className="text-[9px] bg-slate-100 text-slate-600 px-1.5 py-0.2 rounded">Audio</span>}
                      {item.validations?.geoTag && <span className="text-[9px] bg-slate-100 text-slate-600 px-1.5 py-0.2 rounded">Location</span>}
                    </div>

                    {/* Manual Typing Field */}
                    {item.validations?.text && (
                      <div className="space-y-1 pt-0.5">
                        <label className="text-[11px] font-medium text-slate-700 block">
                          ✏️ Manual typing response / notes:
                        </label>
                        <input
                          type="text"
                          value={item.textResponse || ''}
                          onChange={(e) => handleChecklistFieldChange(idx, 'textResponse', e.target.value)}
                          placeholder="Type your response or findings..."
                          className="w-full h-8 rounded-lg border border-slate-200 bg-white px-2.5 text-xs text-slate-800 placeholder:text-slate-400 focus:outline-none focus:border-blue-500 shadow-2xs"
                        />
                      </div>
                    )}

                    {/* Dropdown Field */}
                    {item.validations?.dropdown && (
                      <div className="space-y-1 pt-0.5">
                        <label className="text-[11px] font-medium text-slate-700 block">
                          📋 Select option:
                        </label>
                        <select
                          value={item.dropdownResponse || ''}
                          onChange={(e) => handleChecklistFieldChange(idx, 'dropdownResponse', e.target.value)}
                          className="w-full h-8 rounded-lg border border-slate-200 bg-white px-2.5 text-xs text-slate-800 focus:outline-none focus:border-blue-500 cursor-pointer shadow-2xs"
                        >
                          <option value="">-- Choose an option --</option>
                          {item.dropdownConfig?.options?.map(opt => (
                            <option key={opt.id} value={opt.label}>{opt.label}</option>
                          ))}
                        </select>
                      </div>
                    )}
                  </div>
                ))}

                <button
                  type="button"
                  onClick={handleAddChecklist}
                  className="text-xs font-semibold text-purple-600 hover:text-purple-700 transition-colors inline-flex items-center gap-1.5 cursor-pointer font-heading pt-1"
                >
                  <Plus size={14} />
                  <span>Add another checklist field</span>
                </button>
              </div>
            )}
          </div>

          {/* ========================================================= */}
          {/* 2. SUB-TASKS SECTION                                      */}
          {/* ========================================================= */}
          <div className="space-y-2.5 pt-3 border-t border-slate-200">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-gray-700 uppercase font-bold font-heading flex items-center gap-1.5">
                  <List size={14} className="text-blue-600" />
                  <span>Sub Tasks</span>
                </p>
                <p className="text-[11px] text-gray-400">Child tasks with assignees, dates, reminders & checklists</p>
              </div>
              {subtasks.length > 0 && (
                <div className="flex items-center gap-2">
                  <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full border ${
                    completedSubtasksCount === subtasks.length
                      ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                      : 'bg-blue-50 text-blue-700 border-blue-200'
                  }`}>
                    {completedSubtasksCount} / {subtasks.length} Completed
                  </span>
                  {subtasks.length > 1 && (
                    <button
                      type="button"
                      onClick={() => toggleAllSubtasks(completedSubtasksCount < subtasks.length)}
                      className="text-[10px] text-blue-700 hover:text-blue-900 font-semibold underline cursor-pointer"
                    >
                      {completedSubtasksCount === subtasks.length ? 'Unmark all' : 'Mark all done'}
                    </button>
                  )}
                </div>
              )}
            </div>

            {subtasks.length === 0 ? (
              <div className="p-3 bg-slate-50 border border-dashed border-slate-200 rounded-xl text-center">
                <p className="text-xs text-slate-400 italic mb-1.5">No sub-tasks added yet</p>
                <button
                  type="button"
                  onClick={handleAddSubtask}
                  className="text-xs font-semibold text-blue-600 hover:text-blue-700 transition-colors inline-flex items-center gap-1 cursor-pointer font-heading"
                >
                  <Plus size={14} />
                  <span>Add First Sub Task</span>
                </button>
              </div>
            ) : (
              <div className="space-y-3">
                {subtasks.map((st, idx) => {
                  const subAssignees = Array.isArray(st.assignedTo) ? st.assignedTo : st.assignedTo ? [st.assignedTo] : []
                  return (
                    <div
                      key={st.id || idx}
                      className="p-3.5 bg-white border border-slate-200/90 rounded-2xl space-y-3 shadow-2xs relative"
                    >
                      {/* Header: Sub Task #, Status Badge & Delete */}
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-slate-800 font-heading">
                          Sub Task #{idx + 1}
                        </span>
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => toggleSubtask(idx)}
                            className={`text-[10px] px-2 py-0.5 rounded font-semibold transition-colors border cursor-pointer ${
                              st.completed 
                                ? 'bg-emerald-100 text-emerald-700 border-emerald-200' 
                                : 'bg-slate-100 text-slate-600 border-slate-200 hover:bg-slate-200'
                            }`}
                          >
                            {st.completed ? '✓ Completed' : 'To Do'}
                          </button>
                          <button
                            type="button"
                            onClick={() => handleRemoveSubtask(idx)}
                            className="p-1 text-slate-400 hover:text-rose-600 cursor-pointer transition-colors"
                            title="Delete sub-task"
                          >
                            <Trash2 size={13} />
                          </button>
                        </div>
                      </div>

                      {/* Sub-task Checkbox & Title */}
                      <div className="flex items-center gap-2.5">
                        <input
                          type="checkbox"
                          checked={!!st.completed}
                          onChange={() => toggleSubtask(idx)}
                          className="w-4 h-4 rounded text-blue-600 focus:ring-blue-500 border-slate-300 cursor-pointer shrink-0"
                        />
                        <input
                          type="text"
                          value={st.title || ''}
                          onChange={(e) => handleSubtaskFieldChange(idx, 'title', e.target.value)}
                          placeholder="What needs to be done?"
                          className={`w-full text-xs font-semibold rounded-lg border border-slate-200 bg-white px-3 py-2 text-slate-800 placeholder:text-slate-400 focus:outline-none focus:border-blue-500 shadow-2xs ${
                            st.completed ? 'line-through text-slate-400' : ''
                          }`}
                        />
                      </div>

                      {/* Subtask Configuration Box: Assignee, Due Date & Reminder */}
                      <div className="space-y-2.5 p-2.5 bg-slate-50/70 rounded-xl border border-slate-200/70">
                        {/* Assignee */}
                        <div>
                          <div className="flex items-center justify-between mb-1">
                            <label className="text-[11px] font-semibold text-slate-700 font-heading flex items-center gap-1">
                              <User size={12} className="text-slate-500" />
                              <span>Assignee</span>
                            </label>
                            {subAssignees.length > 0 && (
                              <span className="text-[10px] text-blue-600 font-semibold">{subAssignees.length} selected</span>
                            )}
                          </div>

                          <div className="flex flex-wrap gap-1 max-h-20 overflow-y-auto p-1 bg-white rounded-lg border border-slate-200">
                            {employees.map(emp => {
                              const isAssigned = subAssignees.includes(emp.id)
                              return (
                                <button
                                  key={emp.id}
                                  type="button"
                                  onClick={() => toggleSubtaskAssignee(idx, emp.id)}
                                  className={`h-6 px-1.5 rounded-md text-[10px] font-medium transition-all flex items-center gap-1 border cursor-pointer ${
                                    isAssigned
                                      ? 'bg-blue-50 text-blue-700 border-blue-300 font-semibold'
                                      : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                                  }`}
                                >
                                  <div className={`w-3.5 h-3.5 rounded-full text-[7px] font-bold flex items-center justify-center shrink-0 ${
                                    isAssigned ? 'bg-blue-600 text-white' : 'bg-slate-200 text-slate-700'
                                  }`}>
                                    {emp.name.charAt(0).toUpperCase()}
                                  </div>
                                  <span className="truncate max-w-[90px]">{emp.name}</span>
                                  {isAssigned && <Check size={9} className="text-blue-600 shrink-0" />}
                                </button>
                              )
                            })}
                          </div>
                        </div>

                        {/* Due Date & Reminder */}
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                          <div>
                            <label className="text-[11px] font-semibold text-slate-700 font-heading block mb-1">
                              Due Date & Time
                            </label>
                            <div className="relative">
                              <DatePicker
                                selected={st.dueDate ? (st.dueDate.toDate ? st.dueDate.toDate() : new Date(st.dueDate)) : null}
                                onChange={(date) => handleSubtaskFieldChange(idx, 'dueDate', date)}
                                showTimeSelect
                                timeIntervals={15}
                                dateFormat="MMM d, yyyy h:mm aa"
                                wrapperClassName="w-full"
                                className="h-8 w-full rounded-lg border border-slate-200 bg-white px-2.5 pr-7 text-xs text-slate-800 placeholder:text-slate-400 focus:outline-none focus:border-blue-500 cursor-pointer shadow-2xs"
                                placeholderText="Sub-task due date"
                              />
                              <Calendar size={12} className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                            </div>
                          </div>

                          <div>
                            <label className="text-[11px] font-semibold text-slate-700 font-heading block mb-1">
                              Reminder
                            </label>
                            <div className="flex items-center gap-2 h-8 px-2.5 bg-white rounded-lg border border-slate-200 shadow-2xs">
                              <label className="relative inline-flex items-center cursor-pointer">
                                <input
                                  type="checkbox"
                                  className="sr-only peer"
                                  checked={!!st.reminder?.enabled}
                                  onChange={(e) => handleSubtaskFieldChange(idx, 'reminder', {
                                    ...(st.reminder || {}),
                                    enabled: e.target.checked
                                  })}
                                />
                                <div className="w-7 h-4 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-3 after:w-3 after:transition-all peer-checked:bg-amber-500"></div>
                              </label>
                              <span className="text-[11px] text-slate-600 font-body">Alert assignee</span>
                            </div>
                          </div>
                        </div>

                        {/* Sub-task's own checklist items */}
                        <div className="pt-1.5 border-t border-slate-200/70">
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-[11px] font-semibold text-slate-700 font-heading flex items-center gap-1">
                              <CheckSquare size={12} className="text-emerald-600" />
                              <span>Sub-task Checklist ({st.checklists?.length || 0})</span>
                            </span>
                            <button
                              type="button"
                              onClick={() => handleAddSubtaskChecklistItem(idx)}
                              className="text-[10px] font-semibold text-emerald-600 hover:text-emerald-700 flex items-center gap-0.5 cursor-pointer font-heading"
                            >
                              <Plus size={11} />
                              <span>Add item</span>
                            </button>
                          </div>

                          {st.checklists?.length > 0 && (
                            <div className="space-y-1.5">
                              {st.checklists.map((sc, scIdx) => (
                                <div key={sc.id || scIdx} className="flex items-center gap-2 bg-white p-1.5 rounded-lg border border-slate-200">
                                  <input
                                    type="checkbox"
                                    checked={!!sc.completed}
                                    onChange={() => handleToggleSubtaskChecklistItem(idx, scIdx)}
                                    className="w-3.5 h-3.5 rounded text-emerald-600 focus:ring-emerald-500 border-slate-300 cursor-pointer"
                                  />
                                  <input
                                    type="text"
                                    placeholder="Checklist item title..."
                                    value={sc.title || ''}
                                    onChange={(e) => handleUpdateSubtaskChecklistItem(idx, scIdx, e.target.value)}
                                    className={`flex-1 text-xs text-slate-800 placeholder:text-slate-400 border-0 bg-transparent p-0 focus:ring-0 ${
                                      sc.completed ? 'line-through text-slate-400' : ''
                                    }`}
                                  />
                                  <button
                                    type="button"
                                    onClick={() => handleRemoveSubtaskChecklistItem(idx, scIdx)}
                                    className="text-slate-400 hover:text-rose-600 p-0.5 cursor-pointer"
                                  >
                                    <X size={12} />
                                  </button>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  )
                })}

                {/* Single Add another sub-task button below existing subtasks */}
                <button
                  type="button"
                  onClick={handleAddSubtask}
                  className="text-xs font-semibold text-blue-600 hover:text-blue-700 transition-colors inline-flex items-center gap-1.5 cursor-pointer font-heading pt-1"
                >
                  <Plus size={14} />
                  <span>Add another sub-task</span>
                </button>
              </div>
            )}
          </div>

          {/* Due date */}
          <div className="space-y-2 pt-2 border-t border-slate-200">
            <p className="text-xs text-gray-500 uppercase font-medium font-heading">Due date</p>
            <div className="relative">
              <DatePicker
                selected={editedTask.dueDate ? (editedTask.dueDate.toDate ? editedTask.dueDate.toDate() : new Date(editedTask.dueDate)) : null}
                onChange={(date) => setEditedTask({ ...editedTask, dueDate: date })}
                className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 pr-10 text-xs focus-visible:ring-1 focus-visible:ring-blue-600 placeholder:text-slate-400 text-slate-800 font-body cursor-pointer shadow-2xs"
                wrapperClassName="w-full"
                dateFormat="MMM d, yyyy h:mm aa"
                showTimeSelect
                timeIntervals={15}
                placeholderText="No due date"
              />
              <Calendar className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" size={15} />
            </div>
          </div>

          <button
            onClick={() => onDelete(task.id)}
            className="w-full py-2.5 text-rose-600 font-semibold text-xs border border-rose-200 rounded-xl flex items-center justify-center gap-2 cursor-pointer hover:bg-rose-50 transition-colors mt-4"
          >
            <Trash2 size={15} />
            Delete Task
          </button>
        </div>
      </div>
    </div>
  )
}

