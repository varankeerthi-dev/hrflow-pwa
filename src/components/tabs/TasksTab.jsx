import React, { useState, useMemo, useRef, useEffect } from 'react'
import DatePicker from 'react-datepicker'
import 'react-datepicker/dist/react-datepicker.css'
import { formatDistanceToNow } from 'date-fns'
import { 
  CheckCircle2, 
  Circle, 
  Plus, 
  MoreHorizontal, 
  User, 
  Clock, 
  Trash2, 
  GripVertical,
  ChevronDown,
  ChevronRight,
  Filter,
  CheckCircle,
  Inbox,
  PlayCircle,
  Lightbulb,
  X,
  ArrowRight,
  Calendar as CalendarIcon,
  Bell,
  Info,
  Layout,
  Table,
  BarChart2
} from 'lucide-react'
import { useAuth } from '../../hooks/useAuth'
import { useEmployees } from '../../hooks/useEmployees'
import { useTasks } from '../../hooks/useTasks'
import { useReminders } from '../../hooks/useReminders'
import { db } from '../../lib/firebase'
import { collection, query, where, getDocs } from 'firebase/firestore'
import Spinner from '../ui/Spinner'
import Modal from '../ui/Modal'

const STATUSES = [
  { id: 'To Do', label: 'To Do', icon: <Circle size={16} className="text-blue-500" />, bgColor: 'bg-gray-50' },
  { id: 'In Progress', label: 'In Progress', icon: <PlayCircle size={16} className="text-orange-500" />, bgColor: 'bg-blue-50' },
  { id: 'On Hold', label: 'On Hold', icon: <Clock size={16} className="text-amber-500" />, bgColor: 'bg-amber-50' },
  { id: 'Review', label: 'Review', icon: <CheckCircle size={16} className="text-purple-500" />, bgColor: 'bg-purple-50' },
  { id: 'Completed', label: 'Completed', icon: <CheckCircle2 size={16} className="text-green-500" />, bgColor: 'bg-green-50' }
]

const CLIENT_TYPES = [
  { 
    id: 'order', 
    label: 'Order', 
    icon: '📦', 
    color: 'text-green-700',
    bgColor: 'bg-green-50',
    borderColor: 'border-green-300'
  },
  { 
    id: 'complaint', 
    label: 'Complaint', 
    icon: '⚠️', 
    color: 'text-red-700',
    bgColor: 'bg-red-50',
    borderColor: 'border-red-300'
  },
  { 
    id: 'followup', 
    label: 'Follow-up', 
    icon: '📞', 
    color: 'text-blue-700',
    bgColor: 'bg-blue-50',
    borderColor: 'border-blue-300'
  }
]

const TABS = [
  { id: 'team', label: 'Team Task', icon: <User size={16} />, color: 'bg-blue-600' },
  { id: 'personal', label: 'Personal Task', icon: <User size={16} />, color: 'bg-emerald-600' },
  { id: 'idea', label: 'Idea Tab', icon: <Lightbulb size={16} />, color: 'bg-purple-600' },
  { id: 'reminders', label: 'Reminders', icon: <Bell size={16} />, color: 'bg-rose-600' }
]

export default function TasksTab() {
  const { user } = useAuth()
  const { employees } = useEmployees(user?.orgId)
  const { tasks, loading: tasksLoading, addTask, updateTask, deleteTask } = useTasks(user?.orgId)
  const { reminders, loading: remindersLoading, addReminder, dismissReminder, deleteReminder } = useReminders(user?.orgId)
  
  const loading = tasksLoading || remindersLoading
  
  const [users, setUsers] = useState([])
  const [activeTab, setActiveTab] = useState('team')
  const [viewMode, setViewMode] = useState('board') // 'board' | 'table' | 'dashboard'
  const [showAddModal, setShowAddModal] = useState(false)
  const [showReminderModal, setShowReminderModal] = useState(false)
  const [selectedReminder, setSelectedReminder] = useState(null)
  const [inlineInputs, setInlineInputs] = useState({})
  const [inlineDates, setInlineDates] = useState({})
  const [draggedTaskId, setDraggedTaskId] = useState(null)
  
  const [newTask, setNewTask] = useState({
    title: '',
    description: '',
    status: 'To Do',
    assignedTo: [],
    isPersonal: false,
    category: 'task',
    dueDate: null,
    priority: 'normal',
    notes: '',
    // NEW CLIENT FIELDS
    clientName: '',
    clientType: null  // 'order' | 'complaint' | 'followup' | null
  })
  
  const [newReminder, setNewReminder] = useState({
    title: '',
    content: '',
    type: 'general',
    targetUsers: [],
    reminderDate: null,
    keywords: []
  })
  const [clientFilter, setClientFilter] = useState('all')  // 'all' | 'order' | 'complaint' | 'followup' | 'internal'

  // Filter tasks based on active tab
  const filteredTasks = useMemo(() => {
    let tasksToFilter = tasks
      // Filter by tab (team/personal/idea)
    if (activeTab === 'idea') {
      tasksToFilter = tasksToFilter.filter(t => t.category === 'idea')
    } else if (activeTab === 'personal') {
      tasksToFilter = tasksToFilter.filter(t => t.isPersonal && t.category === 'task')
    } else {
      // Team tasks: not personal and category is task
      tasksToFilter = tasksToFilter.filter(t => !t.isPersonal && t.category === 'task')
    }
      // Apply client filter
    if (clientFilter !== 'all') {
      if (clientFilter === 'internal') {
        // Show tasks without client info
        tasksToFilter = tasksToFilter.filter(t => !t.clientName && !t.clientType)
      } else {
        // Show tasks with specific client type
        tasksToFilter = tasksToFilter.filter(t => t.clientType === clientFilter)
      }
    }
      return tasksToFilter
  }, [tasks, activeTab, clientFilter])

  const handleInlineCreate = async (status, e) => {
    // If e is keydown event and key is not Enter, do nothing
    if (e && e.key && e.key !== 'Enter') return;
    
    if (inlineInputs[status]?.trim()) {
      const title = inlineInputs[status].trim()
      const dueDate = inlineDates[status] || null
      try {
        await addTask({
          title,
          status: status === 'Inbox' ? 'To Do' : status,  // Convert legacy Inbox to To Do
          isPersonal: activeTab === 'personal',
          category: activeTab === 'idea' ? 'idea' : 'task',
          assignedTo: activeTab === 'personal' ? [user.uid] : [],
          dueDate
        })
        setInlineInputs({ ...inlineInputs, [status]: '' })
        setInlineDates({ ...inlineDates, [status]: null })
      } catch (err) {
        alert('Failed to create task')
      }
    }
  }

  const handleCreateTask = async (e) => {
    if (e && e.preventDefault) e.preventDefault()
    if (!newTask.title.trim()) return
    try {
      const isIdea = activeTab === 'idea'
      await addTask({
        ...newTask,
        isPersonal: isIdea ? false : (activeTab === 'personal'),
        category: isIdea ? 'idea' : 'task'
      })
      setShowAddModal(false)
      setNewTask({
        title: '',
        description: '',
        status: 'To Do',
        assignedTo: [],
        isPersonal: activeTab === 'personal',
        category: 'task',
        dueDate: null,
        priority: 'normal',
        notes: '',
        clientName: '',
        clientType: null
      })
    } catch (err) {
      console.error("Create task error:", err)
      alert('Failed to create task')
    }
  }

  const handleCreateReminder = async (e) => {
    e.preventDefault()
    if (!newReminder.title.trim()) return
    try {
      await addReminder({
        ...newReminder,
        reminderDate: newReminder.reminderDate || null,
        keywords: newReminder.keywords || []
      })
      setShowReminderModal(false)
      setNewReminder({
        title: '',
        content: '',
        type: 'general',
        targetUsers: [],
        reminderDate: null,
        keywords: []
      })
    } catch (err) {
      alert('Failed to create reminder')
    }
  }

  const handleDragStart = (e, taskId) => {
    setDraggedTaskId(taskId)
    e.dataTransfer.effectAllowed = 'move'
    // For visual effect
    setTimeout(() => {
      e.target.style.opacity = '0.4'
    }, 0)
  }

  const handleDragEnd = (e) => {
    e.target.style.opacity = '1'
    setDraggedTaskId(null)
  }

  const handleDragOver = (e) => {
    e.preventDefault()
  }

  const handleDrop = async (e, targetStatus) => {
    e.preventDefault()
    if (!draggedTaskId) return
    
    try {
      await updateTask(draggedTaskId, { status: targetStatus })
    } catch (err) {
      console.error("Failed to move task:", err)
    }
  }

  const toggleStatus = async (task) => {
    const statusFlow = {
      'Inbox': 'To Do',  // Legacy support
      'To-do': 'To Do',  // Legacy support
      'To Do': 'In Progress',
      'In Progress': 'Review',
      'On Hold': 'In Progress',  // Resume from on hold
      'Review': 'Completed',
      'Completed': 'To Do'  // Reopen
    }
      try {
      await updateTask(task.id, { status: statusFlow[task.status] || 'To Do' })
    } catch (err) {
      console.error("Failed to update status:", err)
    }
  }

  // Fetch login-enabled users
  useEffect(() => {
    const fetchUsers = async () => {
      if (!user?.orgId) return
      try {
        const q = query(
          collection(db, 'users'), 
          where('orgId', '==', user.orgId),
          where('loginEnabled', '==', true)
        )
        const snap = await getDocs(q)
        setUsers(snap.docs.map(d => ({ id: d.id, ...d.data() })))
      } catch (err) {
        console.error("Error fetching login-enabled users:", err)
      }
    }
    fetchUsers()
  }, [user?.orgId])

  const getAssigneeInfo = (assignedTo) => {
    const ids = Array.isArray(assignedTo) ? assignedTo : assignedTo ? [assignedTo] : []
    return ids.map(id => employees.find(e => e.id === id)).filter(Boolean)
  }

  const formatDueDate = (date) => {
    if (!date) return null
    const d = date.toDate ? date.toDate() : new Date(date)
    return formatDistanceToNow(d, { addSuffix: true })
  }

  const getDueDateColor = (date) => {
    if (!date) return 'text-gray-400'
    const d = date.toDate ? date.toDate() : new Date(date)
    const now = new Date()
    if (d < now) return 'text-red-500 bg-red-50'
    const diff = d - now
    if (diff < 86400000) return 'text-amber-500 bg-amber-50'
    return 'text-gray-500 bg-gray-50'
  }

  const loginEnabledEmployees = useMemo(() => {
    return employees.filter(emp => users.some(u => u.email === emp.email))
  }, [employees, users])

  const renderBoardView = () => (
    <div className="flex gap-4 h-full min-w-full [@media(min-width:1400px)]:flex-nowrap flex-wrap lg:flex-nowrap">
      {STATUSES.map(status => (
        <div 
          key={status.id} 
          className="flex flex-col min-w-[280px] flex-1"
          onDragOver={handleDragOver}
          onDrop={(e) => handleDrop(e, status.id)}
        >
          {/* Column Header */}
          <div className={`${status.bgColor} rounded-t-xl border-b-2 ${
            status.id === 'Completed' ? 'border-green-500' :
            status.id === 'Review' ? 'border-purple-500' :
            status.id === 'On Hold' ? 'border-amber-500' :
            status.id === 'In Progress' ? 'border-orange-500' :
            'border-blue-500'
          }`}>
            <div className="flex items-center justify-between px-4 py-3">
              <div className="flex items-center gap-2.5">
                <span className="p-1.5 rounded-lg bg-white shadow-sm border border-gray-200">
                  {status.icon}
                </span>
                <span className="text-sm uppercase tracking-wider text-gray-700">
                  {status.label}
                </span>
                <span className="text-xs text-gray-500 bg-white px-2.5 py-1 rounded-full shadow-sm">
                  {filteredTasks.filter(t => t.status === status.id || (status.id === 'To Do' && (t.status === 'Inbox' || t.status === 'To-do'))).length}
                </span>
              </div>
              <button className="text-gray-400 hover:text-gray-600 p-1.5 hover:bg-white rounded-lg transition-colors">
                <MoreHorizontal size={16} />
              </button>
            </div>
          </div>
          {/* Task List Area */}
          <div className={`flex-1 ${status.bgColor} rounded-b-xl p-3 space-y-3 min-h-[500px]`}>
            {/* Inline Quick Add */}
            <div className="group relative space-y-2 bg-white/50 p-2 rounded-xl border border-dashed border-gray-300">
              <div className="relative">
                <input
                  type="text"
                  placeholder="Quick add task..."
                  className="w-full bg-white border-2 border-transparent focus:border-indigo-300 focus:ring-4 focus:ring-indigo-50 focus:border-indigo-200 rounded-xl px-4 py-3 text-sm outline-none transition-all placeholder:text-gray-400 shadow-sm hover:shadow pr-10"
                  value={inlineInputs[status.id] || ''}
                  onChange={(e) => setInlineInputs({ ...inlineInputs, [status.id]: e.target.value })}
                  onKeyDown={(e) => handleInlineCreate(status.id, e)}
                />
                {!inlineInputs[status.id] && (
                  <div className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-300 pointer-events-none transition-opacity group-focus-within:opacity-0">
                    <Plus size={16} />
                  </div>
                )}
              </div>

              {/* Datepicker & Submit Arrow - Only show if input has text */}
              {inlineInputs[status.id]?.trim() && (
                <div className="flex items-center gap-2 animate-in fade-in slide-in-from-top-1 duration-200">
                  <div className="relative flex-1 group/date">
                    <CalendarIcon size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-indigo-500 z-10 pointer-events-none" />
                    <DatePicker
                      selected={inlineDates[status.id]}
                      onChange={(date) => setInlineDates({ ...inlineDates, [status.id]: date })}
                      placeholderText="Set due date"
                      dateFormat="MMM d, yyyy"
                      className="w-full pl-9 pr-3 py-2 bg-white border border-gray-200 rounded-lg text-xs focus:ring-2 focus:ring-indigo-100 focus:border-indigo-300 outline-none transition-all cursor-pointer hover:border-indigo-200"
                    />
                    {inlineDates[status.id] && (
                      <button 
                        onClick={() => setInlineDates({ ...inlineDates, [status.id]: null })}
                        className="absolute right-2 top-1/2 -translate-y-1/2 p-0.5 rounded-full hover:bg-gray-100 text-gray-400 z-10"
                      >
                        <X size={10} />
                      </button>
                    )}
                  </div>
                  <button
                    onClick={() => handleInlineCreate(status.id)}
                    className="bg-indigo-600 hover:bg-indigo-700 text-white p-2 rounded-lg transition-all shadow-sm hover:shadow active:scale-90 flex-shrink-0"
                    title="Save Task"
                  >
                    <ArrowRight size={16} />
                  </button>
                </div>
              )}
            </div>
            {/* Tasks */}
            {filteredTasks
              .filter(t => t.status === status.id || (status.id === 'To Do' && (t.status === 'Inbox' || t.status === 'To-do')))
              .map(task => {
                const assignees = getAssigneeInfo(task.assignedTo)
                const dueDateText = formatDueDate(task.dueDate)
                const dueDateColor = getDueDateColor(task.dueDate)
                
                return (
                  <div
                    key={task.id}
                    draggable
                    onDragStart={(e) => handleDragStart(e, task.id)}
                    onDragEnd={handleDragEnd}
                    className="group bg-white border-2 border-gray-200 rounded-xl p-2.5 shadow hover:shadow-md hover:border-indigo-200 transition-all cursor-grab active:cursor-grabbing relative overflow-hidden"
                  >
                    {/* Priority & Status left border */}
                    <div className={`absolute left-0 top-0 bottom-0 w-1.5 ${
                      task.priority === 'urgent' ? 'bg-red-500' : 
                      task.priority === 'important' ? 'bg-amber-500' :
                      status.id === 'Completed' ? 'bg-green-500' : 
                      status.id === 'Review' ? 'bg-purple-500' :
                      status.id === 'On Hold' ? 'bg-amber-500' :
                      status.id === 'In Progress' ? 'bg-orange-400' :
                      'bg-blue-400'
                    }`} />
                    <div className="flex gap-3">
                      <button 
                        onClick={() => toggleStatus(task)}
                        className={`mt-1 flex-shrink-0 transition-colors ${
                          task.status === 'Completed' ? 'text-green-500' : 'text-gray-300 hover:text-gray-500'
                        }`}
                      >
                        {task.status === 'Completed' ? <CheckCircle size={18} /> : <Circle size={18} />}
                      </button>
                      
                      <div className="flex-1 min-w-0">
                        {/* Title */}
                        <h4 className={`text-sm text-gray-800 leading-snug break-words mb-1 ${
                          task.status === 'Completed' ? 'line-through text-gray-400' : ''
                        }`}>
                          {task.title}
                        </h4>
                        
                        {/* Due Date & Assignees Row */}
                        {(task.dueDate || assignees.length > 0) && (
                          <div className="flex items-center gap-2 mb-1 flex-wrap">
                            {/* Due Date */}
                            {task.dueDate && (
                              <div className={`flex items-center gap-1 text-[10px] ${dueDateColor} px-1.5 py-0.5 rounded shadow-sm border border-gray-100`}>
                                <Clock size={10} />
                                <span>{dueDateText}</span>
                              </div>
                            )}
                            
                            {/* Assignees */}
                            {assignees.length > 0 && (
                              <div className="flex -space-x-1.5 overflow-hidden">
                                {assignees.slice(0, 3).map(emp => (
                                  <div 
                                    key={emp.id} 
                                    className="w-5 h-5 rounded-full bg-indigo-50 border-2 border-white flex items-center justify-center text-[8px] text-indigo-600 shadow-sm"
                                    title={emp.name}
                                  >
                                    {emp.name.charAt(0)}
                                  </div>
                                ))}
                                {assignees.length > 3 && (
                                  <div className="w-5 h-5 rounded-full bg-gray-50 border-2 border-white flex items-center justify-center text-[7px] text-gray-500 shadow-sm">
                                    +{assignees.length - 3}
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        )}

                        {task.description && (
                          <p className="text-[11px] text-gray-500 line-clamp-2 leading-tight mb-1">
                            {task.description}
                          </p>
                        )}
                        
                        {/* Notes Preview */}
                        {task.notes && (
                          <div className="mt-1 bg-amber-50 border-l-2 border-amber-400 px-2 py-1 rounded">
                            <p className="text-[10px] text-amber-800 line-clamp-1">
                              📝 {task.notes}
                            </p>
                          </div>
                        )}
                        
                        {/* Status-Specific Badges */}
                        {(task.clientName || task.clientType || (task.priority || 'normal') !== 'normal' || task.status === 'On Hold' || task.status === 'Review') && (
                          <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                            {/* Client Badge */}
                            {(task.clientName || task.clientType) && (
                              <span className={`inline-flex items-center gap-1 text-[10px] px-2 py-0 rounded-lg shadow-sm border ${
                                task.clientType 
                                  ? `${CLIENT_TYPES.find(ct => ct.id === task.clientType)?.bgColor} ${CLIENT_TYPES.find(ct => ct.id === task.clientType)?.color} ${CLIENT_TYPES.find(ct => ct.id === task.clientType)?.borderColor}`
                                  : 'bg-gray-50 text-gray-700 border-gray-200'
                              }`}>
                                <span>{task.clientType ? CLIENT_TYPES.find(ct => ct.id === task.clientType)?.icon : '👤'}</span>
                                <span className="truncate max-w-[80px]">{task.clientName || 'Client'}</span>
                              </span>
                            )}

                            {/* Priority Badge */}
                            {(task.priority || 'normal') !== 'normal' && (
                              <span className={`inline-flex items-center gap-1 text-[10px] px-2 py-0 rounded-full shadow-sm ${
                                task.priority === 'urgent' 
                                  ? 'bg-red-100 text-red-700 border border-red-200' 
                                  : 'bg-amber-100 text-amber-700 border border-amber-200'
                              }`}>
                                {task.priority === 'urgent' ? '🔴' : '⚠️'}
                                {(task.priority || 'normal').charAt(0).toUpperCase() + (task.priority || 'normal').slice(1)}
                              </span>
                            )}
                            
                            {/* On Hold Badge */}
                            {task.status === 'On Hold' && (
                              <span className="inline-flex items-center gap-1 text-[10px] px-2 py-0 rounded-full bg-amber-100 text-amber-700 border border-amber-300 shadow-sm">
                                ⏸️ On Hold
                              </span>
                            )}
                            
                            {/* Review Badge */}
                            {task.status === 'Review' && (
                              <span className="inline-flex items-center gap-1 text-[10px] px-2 py-0 rounded-full bg-purple-100 text-purple-700 border border-purple-300 shadow-sm">
                                👀 In Review
                              </span>
                            )}
                          </div>
                        )}

                        {/* Completed Info */}
                        {task.status === 'Completed' && task.completedAt && (
                          <p className="text-[10px] text-green-600 mt-1 font-medium">
                            ✓ Completed {formatDistanceToNow(task.completedAt.toDate(), { addSuffix: true })}
                          </p>
                        )}
                        
                        {/* Delete Button */}
                        <div className="flex items-center justify-end mt-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button 
                            onClick={() => deleteTask(task.id)}
                            className="text-gray-400 hover:text-red-500 p-1 hover:bg-red-50 rounded transition-colors"
                          >
                            <Trash2 size={12} />
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                )
              })}
          </div>
        </div>
      ))}
    </div>
  )

  const renderTableView = () => (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden font-sans">
      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse min-w-[1000px]">
          <thead>
            <tr className="bg-gray-50/50 border-b border-gray-100">
              <th className="px-6 py-4 text-[11px] text-gray-500 uppercase tracking-wider">Task Title</th>
              <th className="px-6 py-4 text-[11px] text-gray-500 uppercase tracking-wider">Status</th>
              <th className="px-6 py-4 text-[11px] text-gray-500 uppercase tracking-wider">Assignees</th>
              <th className="px-6 py-4 text-[11px] text-gray-500 uppercase tracking-wider text-center">Priority</th>
              <th className="px-6 py-4 text-[11px] text-gray-500 uppercase tracking-wider">Due Date</th>
              <th className="px-6 py-4 text-[11px] text-gray-500 uppercase tracking-wider">Client Info</th>
              <th className="px-6 py-4 text-[11px] text-gray-500 uppercase tracking-wider text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100/80">
            {filteredTasks.length === 0 ? (
              <tr>
                <td colSpan="7" className="px-6 py-16 text-center text-gray-400 italic font-medium">No tasks found</td>
              </tr>
            ) : (
              filteredTasks.map(task => {
                const assignees = getAssigneeInfo(task.assignedTo)
                const statusInfo = STATUSES.find(s => s.id === task.status) || STATUSES[0]
                const clientType = CLIENT_TYPES.find(ct => ct.id === task.clientType)
                
                return (
                  <tr key={task.id} className="hover:bg-indigo-50/30 transition-all group">
                    <td className="px-6 py-3">
                      <div className="flex items-center gap-3">
                        <button 
                          onClick={() => toggleStatus(task)}
                          className={`flex-shrink-0 transition-colors ${
                            task.status === 'Completed' ? 'text-green-500' : 'text-gray-300 hover:text-gray-500'
                          }`}
                        >
                          {task.status === 'Completed' ? <CheckCircle size={18} /> : <Circle size={18} />}
                        </button>
                        <div className="flex flex-col">
                          <span className={`text-[13px] text-gray-800 ${task.status === 'Completed' ? 'line-through text-gray-400' : ''}`}>
                            {task.title}
                          </span>
                          {task.category === 'idea' && (
                            <span className="text-[10px] text-indigo-500 uppercase tracking-tighter">Idea</span>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-3">
                      <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-lg text-[10px] uppercase tracking-tight ${statusInfo.bgColor} ${
                        task.status === 'Completed' ? 'text-green-600' :
                        task.status === 'Review' ? 'text-purple-600' :
                        task.status === 'On Hold' ? 'text-amber-600' :
                        task.status === 'In Progress' ? 'text-orange-600' :
                        'text-blue-600'
                      } border border-current/10 shadow-sm`}>
                        {React.cloneElement(statusInfo.icon, { size: 10 })}
                        {task.status}
                      </span>
                    </td>
                    <td className="px-6 py-3">
                      <div className="flex -space-x-1.5 items-center">
                        {assignees.map(emp => (
                          <div 
                            key={emp.id} 
                            className="w-7 h-7 rounded-full bg-indigo-50 border-2 border-white flex items-center justify-center text-[10px] text-indigo-600 shadow-sm transition-transform hover:scale-110 cursor-default"
                            title={emp.name}
                          >
                            {emp.name.charAt(0)}
                          </div>
                        ))}
                        {assignees.length === 0 && <span className="text-[10px] text-gray-400">Unassigned</span>}
                      </div>
                    </td>
                    <td className="px-6 py-3 text-center">
                      <span className={`inline-block text-[10px] uppercase px-2 py-0.5 rounded shadow-sm border ${
                        task.priority === 'urgent' ? 'bg-red-50 text-red-600 border-red-100' :
                        task.priority === 'high' ? 'bg-amber-50 text-amber-600 border-amber-100' :
                        'bg-blue-50 text-blue-600 border-blue-100'
                      }`}>
                        {task.priority || 'normal'}
                      </span>
                    </td>
                    <td className="px-6 py-3">
                      <div className={`flex items-center gap-1.5 text-[11px] ${getDueDateColor(task.dueDate)} px-2 py-1 rounded-md border border-current/10 w-fit`}>
                        <Clock size={12} />
                        {task.dueDate ? formatDueDate(task.dueDate) : 'No deadline'}
                      </div>
                    </td>
                    <td className="px-6 py-3">
                      {task.clientName ? (
                        <div className="flex flex-col gap-0.5">
                          <div className="flex items-center gap-1.5">
                            <span className="text-[12px] text-gray-800 truncate max-w-[120px]">{task.clientName}</span>
                            {clientType && <span className="text-sm grayscale-0" title={clientType.label}>{clientType.icon}</span>}
                          </div>
                          <span className="text-[10px] text-gray-400">{clientType?.label || 'Direct Client'}</span>
                        </div>
                      ) : (
                        <span className="text-[11px] text-gray-300 tracking-widest">- - -</span>
                      )}
                    </td>
                    <td className="px-6 py-3 text-right">
                      <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button 
                          className="p-1.5 text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors"
                          title="Edit Task"
                        >
                          <MoreHorizontal size={14} />
                        </button>
                        <button 
                          onClick={() => deleteTask(task.id)}
                          className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                          title="Delete Task"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </td>
                  </tr>
                )
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  )

  const renderIdeaTabView = () => (
    <div className="space-y-6">
      <div className="max-w-4xl mx-auto bg-white rounded-xl shadow-sm border-2 border-gray-900 p-8">
        <h3 className="text-xl font-google-sans text-gray-900 mb-6 uppercase tracking-tight">Add New Idea</h3>
        <form onSubmit={handleCreateTask} className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="space-y-2 md:col-span-2">
            <label className="text-xs text-gray-500 uppercase tracking-widest">Idea Title (Ideas)</label>
            <input
              type="text"
              placeholder="What's the core idea?"
              className="w-full bg-gray-50 border-2 border-gray-100 focus:border-indigo-500 focus:ring-0 rounded-lg px-4 py-3 text-sm transition-all outline-none"
              value={newTask.title}
              onChange={(e) => setNewTask({ ...newTask, title: e.target.value })}
              required
            />
          </div>
          
          <div className="space-y-2">
            <label className="text-xs text-gray-500 uppercase tracking-widest">Description (Text)</label>
            <textarea
              placeholder="Describe the idea in detail..."
              rows="3"
              className="w-full bg-gray-50 border-2 border-gray-100 focus:border-indigo-500 focus:ring-0 rounded-lg px-4 py-3 text-sm transition-all outline-none resize-none"
              value={newTask.description}
              onChange={(e) => setNewTask({ ...newTask, description: e.target.value })}
            />
          </div>

          <div className="space-y-2">
            <label className="text-xs text-gray-500 uppercase tracking-widest">Remarks</label>
            <textarea
              placeholder="Any additional remarks or context?"
              rows="3"
              className="w-full bg-gray-50 border-2 border-gray-100 focus:border-indigo-500 focus:ring-0 rounded-lg px-4 py-3 text-sm transition-all outline-none resize-none"
              value={newTask.notes}
              onChange={(e) => setNewTask({ ...newTask, notes: e.target.value })}
            />
          </div>

          <div className="md:col-span-2">
            <button
              type="submit"
              className="w-full bg-gray-900 hover:bg-black text-white py-4 rounded-none text-sm uppercase tracking-widest transition-all shadow-[4px_4px_0px_0px_rgba(0,0,0,0.2)] active:translate-y-1 active:shadow-none flex items-center justify-center gap-2"
            >
              <Plus size={18} />
              Save Idea
            </button>
          </div>
        </form>
      </div>

      <div className="bg-white rounded-xl shadow-sm border-2 border-gray-900 overflow-hidden font-sans">
        <div className="bg-gray-900 px-6 py-3 border-b-2 border-gray-900">
          <h4 className="text-white text-xs uppercase tracking-widest flex items-center gap-2">
            <Lightbulb size={14} />
            Ideas Dashboard
          </h4>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse min-w-[800px]">
            <thead>
              <tr className="bg-gray-50 border-b-2 border-gray-900">
                <th className="px-6 py-4 text-[11px] text-gray-900 uppercase tracking-wider w-32">Date</th>
                <th className="px-6 py-4 text-[11px] text-gray-900 uppercase tracking-wider">Ideas</th>
                <th className="px-6 py-4 text-[11px] text-gray-900 uppercase tracking-wider">Remarks</th>
                <th className="px-6 py-4 text-[11px] text-gray-900 uppercase tracking-wider text-right w-24">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y-2 divide-gray-100">
              {filteredTasks.length === 0 ? (
                <tr>
                  <td colSpan="4" className="px-6 py-12 text-center text-gray-400 italic font-medium">No ideas captured yet</td>
                </tr>
              ) : (
                filteredTasks.map(idea => (
                  <tr key={idea.id} className="hover:bg-purple-50 transition-colors group">
                    <td className="px-6 py-4">
                      <div className="flex flex-col">
                        <span className="text-xs text-gray-900">
                          {idea.createdAt ? new Date(idea.createdAt.toDate()).toLocaleDateString() : 'Today'}
                        </span>
                        <span className="text-[10px] text-gray-400 uppercase">
                          {idea.createdAt ? formatDistanceToNow(idea.createdAt.toDate(), { addSuffix: true }) : ''}
                        </span>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex flex-col gap-1">
                        <span className="text-sm text-gray-900 leading-tight">{idea.title}</span>
                        {idea.description && (
                          <p className="text-xs text-gray-500 line-clamp-2 leading-relaxed">{idea.description}</p>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="bg-amber-50 border-l-4 border-amber-400 px-3 py-2 rounded shadow-sm">
                        <p className="text-xs text-amber-900 font-medium italic">
                          {idea.notes || 'No remarks'}
                        </p>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <div className="flex justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button 
                          onClick={() => deleteTask(idea.id)}
                          className="p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded transition-colors"
                          title="Delete Idea"
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )

  const renderDashboardView = () => {
    const stats = {
      total: filteredTasks.length,
      completed: filteredTasks.filter(t => t.status === 'Completed').length,
      inProgress: filteredTasks.filter(t => t.status === 'In Progress').length,
      todo: filteredTasks.filter(t => t.status === 'To Do' || t.status === 'Inbox' || t.status === 'To-do').length,
      urgent: filteredTasks.filter(t => t.priority === 'urgent').length,
      overdue: filteredTasks.filter(t => {
        if (!t.dueDate || t.status === 'Completed') return false
        const d = t.dueDate.toDate ? t.dueDate.toDate() : new Date(t.dueDate)
        return d < new Date()
      }).length
    }

    const completionRate = stats.total > 0 ? Math.round((stats.completed / stats.total) * 100) : 0

    return (
      <div className="space-y-6">
        {/* Stats Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm">
            <p className="text-xs text-gray-400 uppercase tracking-widest mb-2">Total Tasks</p>
            <div className="flex items-end gap-2">
              <span className="text-3xl text-gray-900">{stats.total}</span>
              <span className="text-sm text-indigo-500 mb-1">active</span>
            </div>
          </div>
          <div className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm">
            <p className="text-xs text-gray-400 uppercase tracking-widest mb-2">Completion Rate</p>
            <div className="flex items-end gap-2">
              <span className="text-3xl text-green-600">{completionRate}%</span>
              <div className="flex-1 h-2 bg-gray-100 rounded-full mb-2 overflow-hidden">
                <div className="h-full bg-green-500" style={{ width: `${completionRate}%` }} />
              </div>
            </div>
          </div>
          <div className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm">
            <p className="text-xs text-gray-400 uppercase tracking-widest mb-2">Urgent Tasks</p>
            <div className="flex items-end gap-2">
              <span className="text-3xl text-red-600">{stats.urgent}</span>
              <span className="text-sm text-red-400 mb-1">needs attention</span>
            </div>
          </div>
          <div className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm">
            <p className="text-xs text-gray-400 uppercase tracking-widest mb-2">Overdue</p>
            <div className="flex items-end gap-2">
              <span className="text-3xl text-amber-600">{stats.overdue}</span>
              <span className="text-sm text-amber-400 mb-1">past due</span>
            </div>
          </div>
        </div>

        {/* Breakdown Row */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm">
            <h4 className="text-sm text-gray-900 uppercase tracking-widest mb-6 flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-indigo-500" />
              Status Breakdown
            </h4>
            <div className="space-y-4">
              {STATUSES.map(status => {
                const count = filteredTasks.filter(t => t.status === status.id || (status.id === 'To Do' && (t.status === 'Inbox' || t.status === 'To-do'))).length
                const percent = stats.total > 0 ? (count / stats.total) * 100 : 0
                return (
                  <div key={status.id} className="space-y-1.5">
                    <div className="flex justify-between text-xs">
                      <span className="text-gray-600 uppercase tracking-wider">{status.label}</span>
                      <span className="text-gray-900">{count}</span>
                    </div>
                    <div className="h-2.5 bg-gray-50 rounded-full overflow-hidden">
                      <div 
                        className={`h-full transition-all duration-1000 ${
                          status.id === 'Completed' ? 'bg-green-500' :
                          status.id === 'Review' ? 'bg-purple-500' :
                          status.id === 'On Hold' ? 'bg-amber-500' :
                          status.id === 'In Progress' ? 'bg-orange-500' :
                          'bg-blue-500'
                        }`} 
                        style={{ width: `${percent}%` }} 
                      />
                    </div>
                  </div>
                )
              })}
            </div>
          </div>

          <div className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm">
            <h4 className="text-sm text-gray-900 uppercase tracking-widest mb-6 flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-amber-500" />
              Priority Distribution
            </h4>
            <div className="flex h-48 items-end justify-around gap-2 px-4">
              {['normal', 'high', 'urgent'].map(p => {
                const count = filteredTasks.filter(t => t.priority === p).length
                const height = stats.total > 0 ? (count / stats.total) * 100 : 5
                return (
                  <div key={p} className="flex-1 flex flex-col items-center gap-2 max-w-[60px]">
                    <span className="text-[10px] text-gray-500 uppercase">{count}</span>
                    <div 
                      className={`w-full rounded-t-lg transition-all duration-1000 ${
                        p === 'urgent' ? 'bg-red-500 shadow-lg shadow-red-100' :
                        p === 'high' ? 'bg-amber-500 shadow-lg shadow-amber-100' :
                        'bg-indigo-500 shadow-lg shadow-indigo-100'
                      }`}
                      style={{ height: `${height}%`, minHeight: '4px' }}
                    />
                    <span className="text-[10px] text-gray-400 uppercase tracking-widest">{p}</span>
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      </div>
    )
  }

  if (loading) return <div className="h-64 flex items-center justify-center"><Spinner /></div>

  return (
    <div className="flex flex-col h-full bg-white text-gray-900 font-sans">
      {/* Header & Tabs */}
      <div className="px-6 py-6 border-b-4 border-gray-900 bg-white">
        <div className="flex items-center justify-between mb-8">
          <h1 className="text-3xl font-google-sans tracking-tighter uppercase">Tasks</h1>
          <button 
            onClick={() => {
              if (activeTab === 'reminders') {
                setShowReminderModal(true)
              } else {
                setNewTask({ ...newTask, isPersonal: activeTab === 'personal', category: activeTab === 'idea' ? 'idea' : 'task' })
                setShowAddModal(true)
              }
            }}
            className="flex items-center gap-2 bg-gray-900 hover:bg-black text-white px-6 py-3 rounded-none text-xs uppercase tracking-widest transition-all shadow-[4px_4px_0px_0px_rgba(0,0,0,0.2)] active:translate-y-1 active:shadow-none"
          >
            <Plus size={18} />
            <span>{activeTab === 'reminders' ? 'New Announcement' : 'New Task'}</span>
          </button>
        </div>

        <div className="flex items-center justify-between">
          <div className="flex gap-0 overflow-hidden border-2 border-gray-900">
            {TABS.map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-2 px-6 py-4 text-xs font-google-sans uppercase tracking-widest transition-all border-r-2 border-gray-900 last:border-r-0 ${
                  activeTab === tab.id 
                    ? `${tab.color} text-white` 
                    : 'bg-white text-gray-500 hover:bg-gray-50 hover:text-gray-900'
                }`}
              >
                {React.cloneElement(tab.icon, { size: 16 })}
                {tab.label}
              </button>
            ))}
          </div>

          {activeTab !== 'reminders' && activeTab !== 'idea' && (
            <div className="flex items-center gap-0 border-2 border-gray-900 overflow-hidden">
              <button
                onClick={() => setViewMode('board')}
                className={`flex items-center gap-2 px-4 py-3 text-[10px] uppercase tracking-wider transition-all border-r-2 border-gray-900 ${
                  viewMode === 'board' ? 'bg-gray-900 text-white' : 'bg-white text-gray-400 hover:text-gray-900'
                }`}
              >
                <Layout size={14} />
                <span>Board</span>
              </button>
              <button
                onClick={() => setViewMode('table')}
                className={`flex items-center gap-2 px-4 py-3 text-[10px] uppercase tracking-wider transition-all border-r-2 border-gray-900 ${
                  viewMode === 'table' ? 'bg-gray-900 text-white' : 'bg-white text-gray-400 hover:text-gray-900'
                }`}
              >
                <Table size={14} />
                <span>Table</span>
              </button>
              <button
                onClick={() => setViewMode('dashboard')}
                className={`flex items-center gap-2 px-4 py-3 text-[10px] uppercase tracking-wider transition-all ${
                  viewMode === 'dashboard' ? 'bg-gray-900 text-white' : 'bg-white text-gray-400 hover:text-gray-900'
                }`}
              >
                <BarChart2 size={14} />
                <span>Dashboard</span>
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Client Filter - Show only on Team Tasks tab */}
      {activeTab === 'team' && (
        <div className="px-6 py-4 border-b border-gray-200 bg-white">
          <div className="flex items-center gap-3">
            <Filter size={18} className="text-gray-400" />
            <span className="text-sm text-gray-600">Filter by Client:</span>
                  <div className="flex items-center gap-2 flex-wrap">
              <button
                onClick={() => setClientFilter('all')}
                className={`px-3 py-1.5 rounded-lg text-sm transition-all ${
                  clientFilter === 'all'
                    ? 'bg-indigo-600 text-white shadow-sm'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                All Tasks ({tasks.filter(t => !t.isPersonal && t.category === 'task').length})
              </button>
                      {CLIENT_TYPES.map(type => {
                const count = tasks.filter(t => 
                  !t.isPersonal && 
                  t.category === 'task' && 
                  t.clientType === type.id
                ).length
                          return (
                  <button
                    key={type.id}
                    onClick={() => setClientFilter(type.id)}
                    className={`px-3 py-1.5 rounded-lg text-sm transition-all flex items-center gap-1.5 ${
                      clientFilter === type.id
                        ? `${type.bgColor} ${type.color} border-2 ${type.borderColor} shadow-sm`
                        : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                    }`}
                  >
                    <span>{type.icon}</span>
                    <span>{type.label}</span>
                    <span className={`text-xs ${clientFilter === type.id ? type.color : 'text-gray-500'}`}>
                      {count}
                    </span>
                  </button>
                )
              })}
              <button
                onClick={() => setClientFilter('internal')}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
                  clientFilter === 'internal'
                    ? 'bg-gray-800 text-white shadow-sm'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                🏠 Internal ({tasks.filter(t => !t.isPersonal && t.category === 'task' && !t.clientName && !t.clientType).length})
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Main Content Area */}
      <div className="flex-1 overflow-x-auto p-6 bg-gradient-to-br from-gray-50 to-gray-100">
        {activeTab === 'reminders' ? (
          <div className="max-w-4xl mx-auto space-y-4">
            {reminders.length === 0 ? (
              <div className="bg-white rounded-2xl p-12 text-center border-2 border-dashed border-gray-200">
                <div className="w-16 h-16 bg-gray-50 rounded-full flex items-center justify-center mx-auto mb-4">
                  <Bell className="text-gray-300" size={32} />
                </div>
                <h3 className="text-lg font-bold text-gray-900 mb-1">No announcements yet</h3>
                <p className="text-gray-500 max-w-xs mx-auto">
                  Announcements and reminders for the team will appear here.
                </p>
              </div>
            ) : (
              <div className="grid gap-4">
                {reminders.map(reminder => (
                  <div 
                    key={reminder.id}
                    onClick={() => setSelectedReminder(reminder)}
                    className="bg-white rounded-xl p-5 shadow-sm border border-gray-100 hover:shadow-md transition-shadow relative overflow-hidden group cursor-pointer"
                  >
                    <div className={`absolute left-0 top-0 bottom-0 w-1.5 ${
                      reminder.type === 'general' ? 'bg-indigo-500' : 
                      reminder.type === 'targeted' ? 'bg-amber-500' : 'bg-blue-500'
                    }`} />
                    
                    <div className="flex justify-between items-start gap-4">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-2">
                          <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded ${
                            reminder.type === 'general' ? 'bg-indigo-50 text-indigo-600' : 
                            reminder.type === 'targeted' ? 'bg-amber-50 text-amber-600' : 'bg-blue-50 text-blue-600'
                          }`}>
                            {reminder.type}
                          </span>
                          <span className="text-xs text-gray-400">
                            {reminder.createdAt ? formatDistanceToNow(reminder.createdAt.toDate(), { addSuffix: true }) : 'just now'}
                          </span>
                          {reminder.reminderDate && (
                            <span className="flex items-center gap-1 text-xs font-bold text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded ml-auto">
                              <CalendarIcon size={12} />
                              {new Date(reminder.reminderDate.toDate ? reminder.reminderDate.toDate() : reminder.reminderDate).toLocaleDateString()}
                            </span>
                          )}
                        </div>
                        <h4 className="text-lg font-bold text-gray-900 mb-1">{reminder.title}</h4>
                        <p className="text-gray-600 text-sm whitespace-pre-wrap line-clamp-2">{reminder.content}</p>
                        
                        {reminder.keywords && reminder.keywords.length > 0 && (
                          <div className="flex flex-wrap gap-1 mt-3">
                            {reminder.keywords.map((kw, idx) => (
                              <span key={idx} className="text-[10px] bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full font-medium">
                                #{kw}
                              </span>
                            ))}
                          </div>
                        )}

                        <div className="mt-4 flex items-center gap-4 text-xs text-gray-400">
                          <span className="flex items-center gap-1">
                            <User size={12} />
                            {reminder.createdByName}
                          </span>
                        </div>
                      </div>
                      
                      <div className="flex flex-col gap-2">
                        {reminder.createdBy === user.uid ? (
                          <button 
                            onClick={(e) => {
                              e.stopPropagation();
                              deleteReminder(reminder.id);
                            }}
                            className="p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                            title="Delete Announcement"
                          >
                            <Trash2 size={16} />
                          </button>
                        ) : (
                          !reminder.dismissedBy?.includes(user.uid) && (
                            <button 
                              onClick={(e) => {
                                e.stopPropagation();
                                dismissReminder(reminder.id);
                              }}
                              className="px-3 py-1.5 bg-gray-50 hover:bg-indigo-50 text-gray-600 hover:text-indigo-600 rounded-lg text-xs font-bold transition-colors border border-gray-100"
                            >
                              Dismiss
                            </button>
                          )
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : activeTab === 'idea' ? (
          renderIdeaTabView()
        ) : (
          <>
            {viewMode === 'board' && renderBoardView()}
            {viewMode === 'table' && renderTableView()}
            {viewMode === 'dashboard' && renderDashboardView()}
          </>
        )}
      </div>

      {/* Add Task Modal */}
      <Modal 
        isOpen={showAddModal} 
        onClose={() => setShowAddModal(false)}
        title="Create New Task"
        size="2xl"
      >
        <form onSubmit={handleCreateTask} className="p-6 space-y-6">
          {/* Title Section */}
          <div className="space-y-4">
            <div>
              <label className="block text-[11px] font-medium text-gray-500 uppercase tracking-wider mb-2">Task Title</label>
              <input
                type="text"
                required
                className="w-full bg-gray-50/50 border border-gray-200 rounded-lg px-4 py-2.5 text-sm focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 focus:bg-white outline-none transition-all placeholder:text-gray-400"
                placeholder="What needs to be done?"
                value={newTask.title}
                onChange={e => setNewTask({ ...newTask, title: e.target.value })}
                autoFocus
              />
            </div>

            <div>
              <label className="block text-[11px] font-medium text-gray-500 uppercase tracking-wider mb-2">Description</label>
              <textarea
                className="w-full bg-gray-50/50 border border-gray-200 rounded-lg px-4 py-2.5 text-sm focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 focus:bg-white outline-none transition-all min-h-[80px] resize-none placeholder:text-gray-400"
                placeholder="Add some details..."
                value={newTask.description}
                onChange={e => setNewTask({ ...newTask, description: e.target.value })}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-6">
            {/* Left Column */}
            <div className="space-y-6">
              {/* Priority Selector */}
              <div>
                <label className="block text-[11px] font-medium text-gray-500 uppercase tracking-wider mb-2">Priority</label>
                <div className="grid grid-cols-3 gap-2">
                  {['normal', 'high', 'urgent'].map((p) => (
                    <button
                      key={p}
                      type="button"
                      onClick={() => setNewTask({ ...newTask, priority: p })}
                      className={`py-2 rounded-lg text-[10px] font-medium uppercase tracking-wider transition-all border ${
                        newTask.priority === p 
                          ? p === 'urgent' ? 'bg-red-50 border-red-200 text-red-600 shadow-sm shadow-red-100' :
                            p === 'high' ? 'bg-amber-50 border-amber-200 text-amber-600 shadow-sm shadow-amber-100' :
                            'bg-indigo-50 border-indigo-200 text-indigo-600 shadow-sm shadow-indigo-100'
                          : 'bg-white border-gray-200 text-gray-500 hover:border-gray-300 hover:bg-gray-50'
                      }`}
                    >
                      {p}
                    </button>
                  ))}
                </div>
              </div>

              {/* Status */}
              <div>
                <label className="block text-[11px] font-medium text-gray-500 uppercase tracking-wider mb-2">Initial Status</label>
                <select
                  className="w-full bg-gray-50/50 border border-gray-200 rounded-lg px-4 py-2 text-sm focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 focus:bg-white outline-none transition-all appearance-none cursor-pointer"
                  value={newTask.status}
                  onChange={e => setNewTask({ ...newTask, status: e.target.value })}
                >
                  {STATUSES.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
                </select>
              </div>
            </div>

            {/* Right Column */}
            <div className="space-y-6">
              {/* Due Date */}
              <div>
                <label className="block text-[11px] font-medium text-gray-500 uppercase tracking-wider mb-2">Due Date</label>
                <div className="relative">
                  <DatePicker
                    selected={newTask.dueDate}
                    onChange={(date) => setNewTask({ ...newTask, dueDate: date })}
                    className="w-full bg-gray-50/50 border border-gray-200 rounded-lg px-4 py-2 text-sm focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 focus:bg-white outline-none transition-all cursor-pointer"
                    placeholderText="Optional"
                    dateFormat="MMM d, yyyy"
                  />
                  <CalendarIcon className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" size={14} />
                </div>
              </div>

              {/* Internal Notes */}
              <div>
                <label className="block text-[11px] font-medium text-gray-500 uppercase tracking-wider mb-2">Internal Notes</label>
                <input
                  type="text"
                  className="w-full bg-gray-50/50 border border-gray-200 rounded-lg px-4 py-2 text-sm focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 focus:bg-white outline-none transition-all placeholder:text-gray-400"
                  placeholder="Quick notes (internal only)"
                  value={newTask.notes}
                  onChange={e => setNewTask({ ...newTask, notes: e.target.value })}
                />
              </div>
            </div>
          </div>

          {/* Multi-Assignee Selector */}
          <div>
            <label className="block text-[11px] font-medium text-gray-500 uppercase tracking-wider mb-2">Assign To</label>
            <div className="flex flex-wrap gap-1.5 p-3 bg-gray-50/50 border border-gray-200 rounded-lg min-h-[45px]">
              {loginEnabledEmployees.map(emp => {
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
                    className={`px-3 py-1.5 rounded-md text-[11px] font-medium transition-all flex items-center gap-1.5 border ${
                      isSelected 
                        ? 'bg-indigo-600 border-indigo-600 text-white shadow-sm shadow-indigo-100' 
                        : 'bg-white border-gray-200 text-gray-600 hover:border-gray-300 hover:bg-gray-50'
                    }`}
                  >
                    <div className={`w-1.5 h-1.5 rounded-full ${isSelected ? 'bg-white' : 'bg-gray-300'}`} />
                    {emp.name}
                  </button>
                )
              })}
              {loginEnabledEmployees.length === 0 && (
                <p className="text-[10px] text-gray-400 italic py-1">No login-enabled users found</p>
              )}
            </div>
          </div>

          {/* Client Tracking - Shadcn-like Card */}
          <div className="border border-gray-200 rounded-xl overflow-hidden bg-white shadow-sm">
            <div className="bg-gray-50 px-4 py-2 border-b border-gray-100 flex items-center justify-between">
              <h5 className="text-[11px] font-semibold text-gray-600 uppercase tracking-wider flex items-center gap-2">
                <User size={12} className="text-gray-400" />
                Client Tracking
              </h5>
              <span className="text-[10px] font-medium text-gray-400 italic">Optional</span>
            </div>
            
            <div className="p-4 grid grid-cols-2 gap-6">
              <div>
                <label className="block text-[10px] font-medium text-gray-500 uppercase tracking-wider mb-1.5">Client Name</label>
                <input
                  type="text"
                  className="w-full bg-gray-50/30 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none transition-all"
                  placeholder="e.g. John Doe"
                  value={newTask.clientName}
                  onChange={e => setNewTask({ ...newTask, clientName: e.target.value })}
                />
              </div>
              <div>
                <label className="block text-[10px] font-medium text-gray-500 uppercase tracking-wider mb-1.5">Client Type</label>
                <div className="flex gap-2">
                  {CLIENT_TYPES.map(type => (
                    <button
                      key={type.id}
                      type="button"
                      onClick={() => setNewTask({ ...newTask, clientType: newTask.clientType === type.id ? null : type.id })}
                      className={`flex-1 py-2 rounded-lg text-xs transition-all border ${
                        newTask.clientType === type.id 
                          ? `${type.bgColor} ${type.borderColor} ${type.color} shadow-sm`
                          : 'bg-white border-gray-200 text-gray-400 hover:border-gray-300'
                      }`}
                      title={type.label}
                    >
                      {type.icon}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-6 py-2">
            <label className="flex items-center gap-3 cursor-pointer group">
              <div className="relative flex items-center">
                <input
                  type="checkbox"
                  className="peer sr-only"
                  checked={newTask.isPersonal}
                  onChange={e => setNewTask({ ...newTask, isPersonal: e.target.checked })}
                />
                <div className="w-9 h-5 bg-gray-200 rounded-full peer peer-checked:bg-indigo-600 transition-colors after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:after:translate-x-4 shadow-sm"></div>
              </div>
              <span className="text-xs font-medium text-gray-600 group-hover:text-gray-900 transition-colors">Personal Task</span>
            </label>

            <label className="flex items-center gap-3 cursor-pointer group">
              <div className="relative flex items-center">
                <input
                  type="checkbox"
                  className="peer sr-only"
                  checked={newTask.category === 'idea'}
                  onChange={e => setNewTask({ ...newTask, category: e.target.checked ? 'idea' : 'task' })}
                />
                <div className="w-9 h-5 bg-gray-200 rounded-full peer peer-checked:bg-amber-500 transition-colors after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:after:translate-x-4 shadow-sm"></div>
              </div>
              <span className="text-xs font-medium text-gray-600 group-hover:text-gray-900 transition-colors">Mark as Idea</span>
            </label>
          </div>

          <div className="flex gap-3 pt-4 border-t border-gray-100">
            <button
              type="button"
              onClick={() => setShowAddModal(false)}
              className="px-6 py-2.5 border border-gray-200 text-gray-600 rounded-lg text-sm font-medium hover:bg-gray-50 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="flex-1 px-6 py-2.5 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 transition-all shadow-sm shadow-indigo-100 active:scale-[0.98]"
            >
              Create Task
            </button>
          </div>
        </form>
      </Modal>

      {/* Add Reminder Modal */}
      <Modal 
        isOpen={showReminderModal} 
        onClose={() => setShowReminderModal(false)}
        title="Create New Announcement"
      >
        <form onSubmit={handleCreateReminder} className="space-y-4">
          <div>
            <label className="block text-xs font-bold text-gray-400 uppercase tracking-widest mb-1.5">Announcement Title</label>
            <input
              type="text"
              required
              className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:ring-4 focus:ring-indigo-50 focus:border-indigo-200 outline-none transition-all placeholder:text-gray-300"
              placeholder="What's the update?"
              value={newReminder.title}
              onChange={e => setNewReminder({ ...newReminder, title: e.target.value })}
              autoFocus
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-gray-400 uppercase tracking-widest mb-1.5">Content</label>
            <textarea
              className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:ring-4 focus:ring-indigo-50 focus:border-indigo-200 outline-none transition-all min-h-[120px] resize-none placeholder:text-gray-300"
              placeholder="Add details for the team..."
              value={newReminder.content}
              onChange={e => setNewReminder({ ...newReminder, content: e.target.value })}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-gray-400 uppercase tracking-widest mb-1.5">Reminder Date</label>
              <DatePicker
                selected={newReminder.reminderDate}
                onChange={(date) => setNewReminder({ ...newReminder, reminderDate: date })}
                className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:ring-4 focus:ring-indigo-50 focus:border-indigo-200 outline-none transition-all"
                placeholderText="Pick a date"
                dateFormat="MMM d, yyyy"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-gray-400 uppercase tracking-widest mb-1.5">Keywords</label>
              <input
                type="text"
                className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:ring-4 focus:ring-indigo-50 focus:border-indigo-200 outline-none transition-all placeholder:text-gray-300"
                placeholder="Comma separated: urgent, info"
                value={newReminder.keywords.join(', ')}
                onChange={e => setNewReminder({ ...newReminder, keywords: e.target.value.split(',').map(kw => kw.trim()).filter(Boolean) })}
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-gray-400 uppercase tracking-widest mb-2">Audience</label>
            <div className="flex gap-2">
              {['general', 'targeted'].map((type) => (
                <button
                  key={type}
                  type="button"
                  onClick={() => setNewReminder({ ...newReminder, type: type, targetUsers: [] })}
                  className={`flex-1 py-2 rounded-lg text-xs font-bold uppercase tracking-wider transition-all border-2 ${
                    newReminder.type === type 
                      ? 'bg-indigo-50 border-indigo-500 text-indigo-600'
                      : 'border-gray-100 text-gray-400 hover:border-gray-200'
                  }`}
                >
                  {type === 'general' ? 'Everyone' : 'Specific Users'}
                </button>
              ))}
            </div>
          </div>

          {newReminder.type === 'targeted' && (
            <div>
              <label className="block text-xs font-bold text-gray-400 uppercase tracking-widest mb-1.5">Select Targets</label>
              <div className="flex flex-wrap gap-2 p-2 border border-gray-200 rounded-xl min-h-[45px]">
                {loginEnabledEmployees.map(emp => {
                  const isSelected = newReminder.targetUsers?.includes(emp.id)
                  return (
                    <button
                      key={emp.id}
                      type="button"
                      onClick={() => {
                        const current = newReminder.targetUsers || []
                        const updated = isSelected 
                          ? current.filter(id => id !== emp.id)
                          : [...current, emp.id]
                        setNewReminder({ ...newReminder, targetUsers: updated })
                      }}
                      className={`px-3 py-1.5 rounded-full text-xs font-medium transition-all ${
                        isSelected 
                          ? 'bg-indigo-600 text-white' 
                          : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                      }`}
                    >
                      {emp.name}
                    </button>
                  )
                })}
              </div>
            </div>
          )}

          <div className="flex gap-3 pt-4 border-t border-gray-50 mt-4">
            <button
              type="button"
              onClick={() => setShowReminderModal(false)}
              className="flex-1 px-4 py-3 border border-gray-200 text-gray-600 rounded-xl text-sm font-bold uppercase tracking-widest hover:bg-gray-50 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="flex-1 px-4 py-3 bg-indigo-600 text-white rounded-xl text-sm font-bold uppercase tracking-widest hover:bg-indigo-700 transition-shadow shadow-lg shadow-indigo-100 active:scale-[0.98]"
            >
              Post Announcement
            </button>
          </div>
        </form>
      </Modal>

      {/* Reminder Summary View Modal */}
      <Modal
        isOpen={!!selectedReminder}
        onClose={() => setSelectedReminder(null)}
        title="Announcement Summary"
      >
        {selectedReminder && (
          <div className="space-y-6">
            <div className="flex items-center justify-between border-b border-gray-50 pb-4">
              <div className="flex items-center gap-2">
                <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded ${
                  selectedReminder.type === 'general' ? 'bg-indigo-50 text-indigo-600' : 
                  selectedReminder.type === 'targeted' ? 'bg-amber-50 text-amber-600' : 'bg-blue-50 text-blue-600'
                }`}>
                  {selectedReminder.type}
                </span>
                <span className="text-xs text-gray-400 flex items-center gap-1">
                  <Clock size={12} />
                  Posted {selectedReminder.createdAt ? formatDistanceToNow(selectedReminder.createdAt.toDate(), { addSuffix: true }) : 'just now'}
                </span>
              </div>
              {selectedReminder.reminderDate && (
                <div className="flex items-center gap-1 text-xs font-bold text-indigo-600 bg-indigo-50 px-3 py-1 rounded-full">
                  <CalendarIcon size={14} />
                  Due {new Date(selectedReminder.reminderDate.toDate ? selectedReminder.reminderDate.toDate() : selectedReminder.reminderDate).toLocaleDateString()}
                </div>
              )}
            </div>

            <div>
              <h2 className="text-2xl font-bold text-gray-900 mb-2">{selectedReminder.title}</h2>
              <div className="bg-gray-50 rounded-2xl p-6 border border-gray-100 min-h-[150px]">
                <p className="text-gray-700 text-sm whitespace-pre-wrap leading-relaxed">{selectedReminder.content}</p>
              </div>
            </div>

            {selectedReminder.keywords && selectedReminder.keywords.length > 0 && (
              <div className="space-y-2">
                <h4 className="text-xs font-bold text-gray-400 uppercase tracking-widest">Keywords</h4>
                <div className="flex flex-wrap gap-2">
                  {selectedReminder.keywords.map((kw, idx) => (
                    <span key={idx} className="bg-indigo-50 text-indigo-600 px-3 py-1 rounded-full text-xs font-semibold border border-indigo-100 shadow-sm">
                      #{kw}
                    </span>
                  ))}
                </div>
              </div>
            )}

            <div className="flex items-center justify-between pt-6 border-t border-gray-50 text-gray-500">
              <div className="flex items-center gap-2 text-sm">
                <div className="w-8 h-8 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-600 font-bold">
                  {selectedReminder.createdByName?.charAt(0)}
                </div>
                <div>
                  <p className="font-bold text-gray-900">{selectedReminder.createdByName}</p>
                  <p className="text-[10px] uppercase tracking-widest font-medium">Author</p>
                </div>
              </div>
              
              <div className="flex gap-3">
                {selectedReminder.createdBy === user.uid ? (
                  <button 
                    onClick={() => {
                      deleteReminder(selectedReminder.id);
                      setSelectedReminder(null);
                    }}
                    className="flex items-center gap-2 px-4 py-2 text-red-600 hover:bg-red-50 rounded-xl text-xs font-bold transition-colors"
                  >
                    <Trash2 size={16} />
                    Delete
                  </button>
                ) : (
                  !selectedReminder.dismissedBy?.includes(user.uid) && (
                    <button 
                      onClick={() => {
                        dismissReminder(selectedReminder.id);
                        setSelectedReminder(null);
                      }}
                      className="px-6 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-sm font-bold shadow-lg shadow-indigo-100 transition-all active:scale-95"
                    >
                      Dismiss Announcement
                    </button>
                  )
                )}
                <button 
                  onClick={() => setSelectedReminder(null)}
                  className="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-600 rounded-xl text-xs font-bold transition-colors"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        )}
      </Modal>
    </div>
  )
}
