import React, { useState, useMemo, useRef, useEffect } from 'react'
import DatePicker from 'react-datepicker'
import 'react-datepicker/dist/react-datepicker.css'
import { formatDistanceToNow, format } from 'date-fns'
import { 
  CheckCircle2, 
  Circle, 
  Plus, 
  MoreHorizontal, 
  User, 
  Clock, 
  Trash2, 
  Filter,
  CheckCircle,
  PlayCircle,
  Lightbulb,
  X,
  ArrowRight,
  ArrowUpRight,
  Calendar as CalendarIcon,
  Bell,
  Layout,
  Table,
  BarChart2,
  AtSign,
  ExternalLink,
  ChevronDown,
  Search,
  FileText,
  Edit3,
  Download,
  List,
  ChevronLeft,
  ChevronRight
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
  { id: 'To Do', label: 'To Do', icon: <Circle size={14} className="text-slate-400" /> },
  { id: 'In Progress', label: 'In Progress', icon: <PlayCircle size={14} className="text-blue-500" /> },
  { id: 'On Hold', label: 'On Hold', icon: <Clock size={14} className="text-amber-500" /> },
  { id: 'Review', label: 'Review', icon: <CheckCircle size={14} className="text-purple-500" /> },
  { id: 'Completed', label: 'Completed', icon: <CheckCircle2 size={14} className="text-emerald-500" /> }
]

const CLIENT_TYPES = [
  { id: 'order', label: 'Order', icon: '📦', color: 'text-emerald-700', bgColor: 'bg-emerald-50', borderColor: 'border-emerald-200' },
  { id: 'complaint', label: 'Complaint', icon: '⚠️', color: 'text-rose-700', bgColor: 'bg-rose-50', borderColor: 'border-rose-200' },
  { id: 'followup', label: 'Follow-up', icon: '📞', color: 'text-blue-700', bgColor: 'bg-blue-50', borderColor: 'border-blue-200' }
]

const TABS = [
  { id: 'team', label: 'Team', icon: <Layout size={14} /> },
  { id: 'personal', label: 'Personal', icon: <User size={14} /> },
  { id: 'idea', label: 'Ideas', icon: <Lightbulb size={14} /> },
  { id: 'reminders', label: 'Announcements', icon: <Bell size={14} /> }
]

export default function TasksTab() {
  const { user } = useAuth()
  const { employees } = useEmployees(user?.orgId)
  const { tasks, loading: tasksLoading, addTask, updateTask, deleteTask } = useTasks(user?.orgId)
  const { reminders, loading: remindersLoading, addReminder, dismissReminder, deleteReminder } = useReminders(user?.orgId)
  
  const loading = tasksLoading || remindersLoading
  
  const [activeTab, setActiveTab] = useState('team')
  const [viewMode, setViewMode] = useState('board')
  const [calendarDate, setCalendarDate] = useState(new Date())
  const [statusFilter, setStatusFilter] = useState({
    'To Do': true,
    'In Progress': true,
    'On Hold': true,
    'Review': true,
    'Completed': false
  })
  const [showAddModal, setShowAddModal] = useState(false)
  const [showEditModal, setShowEditModal] = useState(false)
  const [editingTask, setEditingTask] = useState(null)
  const [showReminderModal, setShowReminderModal] = useState(false)
  const [selectedReminder, setSelectedReminder] = useState(null)
  const [inlineInputs, setInlineInputs] = useState({})
  const [inlineDates, setInlineDates] = useState({})
  const [draggedTaskId, setDraggedTaskId] = useState(null)
  const [statusMenuOpen, setStatusMenuOpen] = useState(null)
  const [animatingTaskId, setAnimatingTaskId] = useState(null)
  
  // Quick edit popups
  const [quickDatePicker, setQuickDatePicker] = useState(null) // taskId
  const [quickAssigneePicker, setQuickAssigneePicker] = useState(null) // taskId
  
  // Inline editing
  const [editingInlineTask, setEditingInlineTask] = useState(null)
  const [inlineEditValue, setInlineEditValue] = useState('')
  
  // Idea tab states
  const [ideaSearchTerm, setIdeaSearchTerm] = useState('')
  const [ideaFilter, setIdeaFilter] = useState('all')
  const [showAddIdeaModal, setShowAddIdeaModal] = useState(false)
  const [newIdea, setNewIdea] = useState({ title: '', bullets: [''] })
  
  // Close status menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (statusMenuOpen && !event.target.closest('.status-menu-container')) {
        setStatusMenuOpen(null)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [statusMenuOpen])
  
  // Mention State
  const [mentionState, setMentionState] = useState({
    active: false,
    query: '',
    cursorPos: 0,
    targetField: null,
    targetId: null
  })

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
    clientName: '',
    clientType: null
  })
  
  const [newReminder, setNewReminder] = useState({
    title: '',
    content: '',
    type: 'general',
    targetUsers: [],
    reminderDate: null,
    keywords: []
  })
  const [clientFilter, setClientFilter] = useState('all')

  const filteredTasks = useMemo(() => {
    let tasksToFilter = tasks
    if (activeTab === 'idea') {
      tasksToFilter = tasksToFilter.filter(t => t.category === 'idea')
    } else if (activeTab === 'personal') {
      tasksToFilter = tasksToFilter.filter(t => t.isPersonal && t.category === 'task')
    } else {
      tasksToFilter = tasksToFilter.filter(t => !t.isPersonal && t.category === 'task')
    }
    if (clientFilter !== 'all') {
      if (clientFilter === 'internal') {
        tasksToFilter = tasksToFilter.filter(t => !t.clientName && !t.clientType)
      } else {
        tasksToFilter = tasksToFilter.filter(t => t.clientType === clientFilter)
      }
    }
    return tasksToFilter
  }, [tasks, activeTab, clientFilter])

  const taskEmployees = useMemo(() => {
    return employees.filter(emp => emp.includeInTask !== false)
  }, [employees])

  const filteredMentions = useMemo(() => {
    if (!mentionState.active) return []
    const q = mentionState.query.toLowerCase()
    return taskEmployees.filter(emp => emp.name.toLowerCase().includes(q))
  }, [mentionState, taskEmployees])

  const handleTextChange = (field, value, targetId = null) => {
    const lastAtPos = value.lastIndexOf('@')
    if (lastAtPos !== -1) {
      const textAfterAt = value.slice(lastAtPos + 1)
      if (!textAfterAt.includes(' ')) {
        setMentionState({
          active: true,
          query: textAfterAt,
          cursorPos: lastAtPos,
          targetField: field,
          targetId
        })
      } else {
        setMentionState({ active: false, query: '', cursorPos: 0, targetField: null, targetId: null })
      }
    } else {
      setMentionState({ active: false, query: '', cursorPos: 0, targetField: null, targetId: null })
    }

    if (targetId) {
      setInlineInputs({ ...inlineInputs, [targetId]: value })
    } else if (field === 'title' || field === 'description') {
      setNewTask({ ...newTask, [field]: value })
    }
  }

  const applyMention = (emp) => {
    const { targetField, targetId, cursorPos } = mentionState
    let currentText = ''
    if (targetId) {
      currentText = inlineInputs[targetId] || ''
    } else {
      currentText = newTask[targetField] || ''
    }

    const beforeAt = currentText.slice(0, cursorPos)
    const newText = beforeAt + `@${emp.name} `

    if (targetId) {
      setInlineInputs({ ...inlineInputs, [targetId]: newText })
    } else {
      setNewTask(prev => ({
        ...prev,
        [targetField]: newText,
        assignedTo: [...new Set([...(prev.assignedTo || []), emp.id])]
      }))
    }
    setMentionState({ active: false, query: '', cursorPos: 0, targetField: null, targetId: null })
  }

  const handleInlineCreate = async (statusKey, e) => {
    if (e && e.key && e.key !== 'Enter') return;
    if (inlineInputs[statusKey]?.trim()) {
      const title = inlineInputs[statusKey].trim()
      const dueDate = inlineDates[statusKey] || null
      const actualStatus = statusKey.replace('-bottom', '')
      
      const words = title.split(' ')
      const mentionedNames = words.filter(w => w.startsWith('@')).map(w => w.slice(1))
      const autoAssignIds = taskEmployees
        .filter(emp => mentionedNames.some(name => emp.name.toLowerCase() === name.toLowerCase()))
        .map(emp => emp.id)

      try {
        await addTask({
          title,
          status: actualStatus === 'Inbox' ? 'To Do' : actualStatus,
          isPersonal: activeTab === 'personal',
          category: activeTab === 'idea' ? 'idea' : 'task',
          assignedTo: activeTab === 'personal' ? [user.uid] : autoAssignIds,
          dueDate
        })
        setInlineInputs({ ...inlineInputs, [statusKey]: '' })
        setInlineDates({ ...inlineDates, [statusKey]: null })
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
        title: '', description: '', status: 'To Do', assignedTo: [],
        isPersonal: activeTab === 'personal', category: 'task',
        dueDate: null, priority: 'normal', notes: '',
        clientName: '', clientType: null
      })
    } catch (err) {
      alert('Failed to create task')
    }
  }

  const handleStatusChange = async (taskId, newStatus) => {
    try {
      setAnimatingTaskId(taskId)
      await updateTask(taskId, { status: newStatus })
      setStatusMenuOpen(null)
      setTimeout(() => setAnimatingTaskId(null), 500)
    } catch (err) {
      console.error("Failed to update status:", err)
    }
  }

  // Task editing functions
  const openEditModal = (task) => {
    setEditingTask({
      ...task,
      assignedTo: Array.isArray(task.assignedTo) ? task.assignedTo : task.assignedTo ? [task.assignedTo] : [],
      dueDate: task.dueDate ? (task.dueDate.toDate ? task.dueDate.toDate() : new Date(task.dueDate)) : null
    })
    setShowEditModal(true)
  }

  const handleSaveEdit = async (e) => {
    e.preventDefault()
    if (!editingTask?.title?.trim()) return
    
    try {
      await updateTask(editingTask.id, {
        title: editingTask.title,
        description: editingTask.description || '',
        status: editingTask.status,
        assignedTo: editingTask.assignedTo || [],
        dueDate: editingTask.dueDate,
        priority: editingTask.priority || 'normal',
        notes: editingTask.notes || '',
        clientName: editingTask.clientName || '',
        clientType: editingTask.clientType || null,
        isPersonal: editingTask.isPersonal,
        category: editingTask.category
      })
      setShowEditModal(false)
      setEditingTask(null)
    } catch (err) {
      console.error('Failed to update task:', err)
      alert('Failed to update task')
    }
  }

  // Quick edit functions
  const handleQuickDateChange = async (taskId, newDate) => {
    try {
      await updateTask(taskId, { dueDate: newDate })
      setQuickDatePicker(null)
    } catch (err) {
      console.error('Failed to update date:', err)
    }
  }

  const handleQuickAssigneeChange = async (taskId, assigneeId) => {
    try {
      const task = tasks.find(t => t.id === taskId)
      const currentAssignees = Array.isArray(task.assignedTo) ? task.assignedTo : task.assignedTo ? [task.assignedTo] : []
      const isAlreadyAssigned = currentAssignees.includes(assigneeId)
      
      let newAssignees
      if (isAlreadyAssigned) {
        newAssignees = currentAssignees.filter(id => id !== assigneeId)
      } else {
        newAssignees = [...currentAssignees, assigneeId]
      }
      
      await updateTask(taskId, { assignedTo: newAssignees })
      setQuickAssigneePicker(null)
    } catch (err) {
      console.error('Failed to update assignees:', err)
    }
  }

  // Inline task editing
  const startInlineEdit = (task) => {
    setEditingInlineTask(task.id)
    setInlineEditValue(task.title)
  }

  const handleInlineEdit = async (e) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      if (inlineEditValue.trim() && editingInlineTask) {
        // Extract mentions from edited text
        const words = inlineEditValue.split(' ')
        const mentionedNames = words.filter(w => w.startsWith('@')).map(w => w.slice(1))
        const autoAssignIds = taskEmployees
          .filter(emp => mentionedNames.some(name => emp.name.toLowerCase() === name.toLowerCase()))
          .map(emp => emp.id)
        
        // Get current task to merge assignees
        const task = tasks.find(t => t.id === editingInlineTask)
        const currentAssignees = Array.isArray(task.assignedTo) ? task.assignedTo : task.assignedTo ? [task.assignedTo] : []
        const mergedAssignees = [...new Set([...currentAssignees, ...autoAssignIds])]
        
        try {
          await updateTask(editingInlineTask, { 
            title: inlineEditValue.trim(),
            assignedTo: mergedAssignees
          })
          setEditingInlineTask(null)
          setInlineEditValue('')
        } catch (err) {
          console.error('Failed to update task:', err)
        }
      }
    } else if (e.key === 'Escape') {
      setEditingInlineTask(null)
      setInlineEditValue('')
    }
  }

  // Idea tab functions
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
    
    try {
      await addTask({
        title: newIdea.title,
        description: description ? '• ' + description : '',
        status: 'To Do',
        isPersonal: activeTab === 'personal',
        category: 'idea',
        assignedTo: [],
        dueDate: null,
        priority: 'normal'
      })
      setShowAddIdeaModal(false)
      setNewIdea({ title: '', bullets: [''] })
    } catch (err) {
      alert('Failed to create idea')
    }
  }

  const exportIdeaToPDF = (idea) => {
    const printWindow = window.open('', '_blank')
    printWindow.document.write(`
      <html>
        <head><title>Idea: ${idea.title}</title></head>
        <body style="font-family: Arial; padding: 40px;">
          <h1>${idea.title}</h1>
          <p style="color: #666; font-size: 12px;">Created: ${idea.createdAt ? format(idea.createdAt.toDate(), 'MMM d, yyyy') : 'N/A'}</p>
          <hr style="margin: 20px 0;">
          <div style="line-height: 1.6;">${idea.description?.replace(/\n/g, '<br>') || ''}</div>
        </body>
      </html>
    `)
    printWindow.document.close()
    printWindow.print()
  }

  const getAssigneeInfo = (assignedTo) => {
    const ids = Array.isArray(assignedTo) ? assignedTo : assignedTo ? [assignedTo] : []
    return ids.map(id => employees.find(e => e.id === id)).filter(Boolean)
  }

  const formatDueDate = (date) => {
    if (!date) return null
    const d = date.toDate ? date.toDate() : new Date(date)
    return format(d, 'MMM d, yyyy')
  }

  const getDueDateColor = (date) => {
    if (!date) return 'text-slate-400'
    const d = date.toDate ? date.toDate() : new Date(date)
    const now = new Date()
    if (d < now) return 'text-rose-500 bg-rose-50'
    const diff = d - now
    if (diff < 86400000) return 'text-amber-500 bg-amber-50'
    return 'text-slate-500 bg-slate-50'
  }

  const getInitials = (name) => {
    if (!name) return '??'
    return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)
  }

  const MentionList = () => {
    if (!mentionState.active || filteredMentions.length === 0) return null
    return (
      <div className="absolute z-[100] mt-1 w-64 bg-white border border-slate-200 rounded-xl shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        <div className="bg-slate-50 px-3 py-2 border-b border-slate-100">
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Assign Personnel</span>
        </div>
        <div className="max-h-60 overflow-y-auto">
          {filteredMentions.map(emp => (
            <button
              key={emp.id}
              onClick={() => applyMention(emp)}
              className="w-full text-left px-4 py-2.5 flex items-center gap-3 hover:bg-indigo-50 transition-colors border-b border-slate-50 last:border-0"
            >
              <div className="w-7 h-7 rounded-full bg-slate-100 flex items-center justify-center text-[10px] font-black text-slate-600 border border-slate-200">
                {getInitials(emp.name)}
              </div>
              <div className="flex flex-col">
                <span className="text-[12px] font-bold text-slate-700">{emp.name}</span>
                <span className="text-[10px] text-slate-400 font-medium">{emp.department || 'Operations'}</span>
              </div>
            </button>
          ))}
        </div>
      </div>
    )
  }

  const renderBoardView = () => (
    <div className="flex gap-6 h-full min-w-full overflow-x-auto pb-8 no-scrollbar px-2">
      {STATUSES.map(status => (
        <div 
          key={status.id} 
          className="flex flex-col min-w-[280px] max-w-[280px] shrink-0"
          onDragOver={(e) => e.preventDefault()}
          onDrop={async (e) => {
            e.preventDefault()
            if (!draggedTaskId) return
            await updateTask(draggedTaskId, { status: status.id })
            setDraggedTaskId(null)
          }}
        >
          <div className="flex items-center justify-between mb-4 px-2">
            <div className="flex items-center gap-2">
              {status.icon}
              <span className="text-[12px] font-semibold text-slate-600">{status.label}</span>
              <span className="text-[10px] font-bold text-slate-400 tabular-nums">
                {filteredTasks.filter(t => t.status === status.id || (status.id === 'To Do' && (t.status === 'Inbox' || t.status === 'To-do'))).length}
              </span>
            </div>
            <button onClick={() => { setNewTask({ ...newTask, status: status.id }); setShowAddModal(true); }} className="text-slate-300 hover:text-indigo-600 transition-colors">
              <Plus size={14} />
            </button>
          </div>

          <div className="flex-1 space-y-3 min-h-[600px] p-1">
            <div className="relative group">
              <input
                type="text"
                placeholder="Quick add..."
                className="w-full bg-slate-50 border border-slate-100 focus:border-indigo-500/30 focus:bg-white rounded-lg px-3 py-2 text-[12px] font-medium text-slate-700 outline-none transition-all placeholder:text-slate-300"
                value={inlineInputs[status.id] || ''}
                onChange={(e) => handleTextChange('inline', e.target.value, status.id)}
                onKeyDown={(e) => handleInlineCreate(status.id, e)}
              />
              {mentionState.active && mentionState.targetId === status.id && <div className="absolute top-full left-0 z-50"><MentionList /></div>}
              
              {/* Date picker for inline input */}
              {inlineInputs[status.id]?.trim() && (
                <div className="mt-2 flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setInlineDates({ ...inlineDates, [status.id]: inlineDates[status.id] ? null : new Date() })}
                    className={`flex items-center gap-1.5 px-2 py-1 rounded-md text-[11px] font-medium transition-all ${
                      inlineDates[status.id] 
                        ? 'bg-indigo-50 text-indigo-600 border border-indigo-200' 
                        : 'bg-slate-50 text-slate-500 border border-slate-200 hover:border-slate-300'
                    }`}
                  >
                    <CalendarIcon size={12} />
                    {inlineDates[status.id] ? formatDueDate(inlineDates[status.id]) : 'Set due date'}
                  </button>
                  
                  {inlineDates[status.id] && (
                    <DatePicker
                      selected={inlineDates[status.id]}
                      onChange={(date) => setInlineDates({ ...inlineDates, [status.id]: date })}
                      className="!w-[100px] !bg-white !border-slate-200 !rounded-md !px-2 !py-1 !text-[11px]"
                      dateFormat="MMM d"
                      placeholderText="Pick date"
                      popperPlacement="bottom-start"
                    />
                  )}
                </div>
              )}
            </div>

            {filteredTasks
              .filter(t => t.status === status.id || (status.id === 'To Do' && (t.status === 'Inbox' || t.status === 'To-do')))
              .map(task => {
                const assignees = getAssigneeInfo(task.assignedTo)
                const dueDateText = formatDueDate(task.dueDate)
                const dueDateColor = getDueDateColor(task.dueDate)
                const isAnimating = animatingTaskId === task.id
                
                return (
                  <div
                    key={task.id}
                    draggable
                    onDragStart={(e) => { setDraggedTaskId(task.id); e.dataTransfer.effectAllowed = 'move'; }}
                    onClick={(e) => {
                      // Don't open edit modal if clicking on interactive elements
                      if (e.target.closest('.status-menu-container') || 
                          e.target.closest('.quick-edit-trigger') ||
                          e.target.closest('.inline-edit-input') ||
                          editingInlineTask === task.id) return
                      // Clicking task text now triggers inline edit, not modal
                      // Only open modal if explicitly clicking outside interactive areas
                      // The arrow button now handles full modal opening
                    }}
                    className={`bg-white border border-slate-200 rounded-xl p-4 hover:border-indigo-200 hover:shadow-sm transition-all cursor-pointer group ${isAnimating ? 'animate-pulse scale-95' : ''}`}
                    style={{ transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)' }}
                  >
                    <div className="flex flex-col gap-2">
                      {/* Row 1: Task Title with inline editing */}
                      <div className="flex justify-between items-start gap-2">
                        {editingInlineTask === task.id ? (
                          <div className="flex-1 relative inline-edit-input">
                            <input
                              type="text"
                              value={inlineEditValue}
                              onChange={(e) => {
                                setInlineEditValue(e.target.value)
                                handleTextChange('inline-edit', e.target.value, task.id)
                              }}
                              onKeyDown={handleInlineEdit}
                              onBlur={() => {
                                setEditingInlineTask(null)
                                setInlineEditValue('')
                              }}
                              autoFocus
                              className="w-full bg-white border border-indigo-300 rounded px-2 py-1 text-[13px] font-medium text-slate-800 outline-none"
                            />
                            {mentionState.active && mentionState.targetId === task.id && (
                              <div className="absolute top-full left-0 mt-1 z-50">
                                <MentionList />
                              </div>
                            )}
                          </div>
                        ) : (
                          <h4 
                            onClick={() => startInlineEdit(task)}
                            className={`text-[13px] font-medium text-slate-800 leading-tight flex-1 cursor-text hover:bg-slate-50 rounded px-1 -mx-1 transition-colors ${task.status === 'Completed' ? 'line-through text-slate-300' : ''}`}
                          >
                            {task.title}
                          </h4>
                        )}
                        
                        {/* Arrow to open full edit modal */}
                        <button
                          onClick={(e) => {
                            e.stopPropagation()
                            openEditModal(task)
                          }}
                          className="shrink-0 text-slate-300 hover:text-indigo-600 transition-colors"
                          title="Open full edit"
                        >
                          <ArrowUpRight size={16} />
                        </button>
                        
                        <div className="status-menu-container relative shrink-0 z-20">
                          <button 
                            onClick={(e) => {
                              e.stopPropagation()
                              setStatusMenuOpen(statusMenuOpen === task.id ? null : task.id)
                            }} 
                            className={`shrink-0 transition-all duration-300 ${task.status === 'Completed' ? 'text-emerald-500 scale-110' : 'text-slate-300 hover:text-slate-500'} ${isAnimating ? 'animate-bounce' : ''}`}
                            title="Change status"
                            style={{ transition: 'all 0.3s ease' }}
                          >
                            {task.status === 'Completed' ? <CheckCircle2 size={16} /> : <Circle size={16} />}
                          </button>
                          
                          {statusMenuOpen === task.id && (
                            <div className="absolute top-full right-0 mt-1 w-40 bg-white border border-slate-200 rounded-lg shadow-xl z-50 py-1 animate-in fade-in zoom-in-95 duration-200">
                              {STATUSES.map(s => (
                                <button
                                  key={s.id}
                                  onClick={() => handleStatusChange(task.id, s.id)}
                                  className={`w-full text-left px-3 py-2 text-[11px] font-medium flex items-center gap-2 hover:bg-slate-50 transition-colors ${task.status === s.id ? 'bg-indigo-50 text-indigo-700' : 'text-slate-600'}`}
                                >
                                  <span className="transition-transform duration-200">{s.icon}</span>
                                  {s.label}
                                  {task.status === s.id && <CheckCircle2 size={12} className="ml-auto text-indigo-600" />}
                                </button>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                      
                      {/* Row 2: Due Date + Priority + Assignees - all on same line */}
                      <div className="flex items-center gap-2 flex-wrap">
                        {/* Due Date - always red color */}
                        {task.dueDate && (
                          <div className="relative">
                            <button
                              onClick={(e) => {
                                e.stopPropagation()
                                setQuickDatePicker(quickDatePicker === task.id ? null : task.id)
                              }}
                              className="quick-edit-trigger text-[11px] font-medium flex items-center gap-1 hover:opacity-70 transition-opacity text-rose-600"
                            >
                              <CalendarIcon size={12} />
                              {dueDateText}
                            </button>
                            
                            {/* Quick Date Picker Popup */}
                            {quickDatePicker === task.id && (
                              <div className="absolute top-full left-0 mt-1 z-50 bg-white border border-slate-200 rounded-lg shadow-xl p-2">
                                <DatePicker
                                  selected={task.dueDate ? (task.dueDate.toDate ? task.dueDate.toDate() : new Date(task.dueDate)) : new Date()}
                                  onChange={(date) => handleQuickDateChange(task.id, date)}
                                  onClickOutside={() => setQuickDatePicker(null)}
                                  inline
                                />
                              </div>
                            )}
                          </div>
                        )}
                        
                        {/* Priority badges */}
                        {task.priority === 'urgent' && (
                          <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-rose-100 text-rose-600">
                            URGENT
                          </span>
                        )}
                        {task.priority === 'high' && (
                          <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-amber-100 text-amber-600">
                            HIGH
                          </span>
                        )}
                        
                        {/* Assignees - immediately next to priority */}
                        <div className="relative ml-auto">
                          <button
                            onClick={(e) => {
                              e.stopPropagation()
                              setQuickAssigneePicker(quickAssigneePicker === task.id ? null : task.id)
                            }}
                            className="quick-edit-trigger flex items-center gap-1 hover:opacity-70 transition-opacity"
                          >
                            {assignees.length > 0 ? (
                              <div className="flex items-center gap-1">
                                <div className="flex -space-x-1">
                                  {assignees.slice(0, 3).map(emp => (
                                    <div key={emp.id} className="w-5 h-5 rounded-full bg-slate-100 border border-white flex items-center justify-center text-[8px] font-bold text-slate-600">
                                      {getInitials(emp.name)}
                                    </div>
                                  ))}
                                </div>
                                <span className="text-[10px] text-slate-500">
                                  {assignees.length === 1 ? assignees[0].name : `${assignees.length} assignees`}
                                </span>
                              </div>
                            ) : (
                              <span className="text-[10px] text-slate-400 flex items-center gap-1">
                                <User size={10} />
                                Unassigned
                              </span>
                            )}
                          </button>
                          
                          {/* Quick Assignee Picker Popup */}
                          {quickAssigneePicker === task.id && (
                            <div className="absolute top-full right-0 mt-1 z-50 w-56 bg-white border border-slate-200 rounded-lg shadow-xl p-2">
                              <div className="text-[10px] font-semibold text-slate-500 mb-2 px-2">Assign to:</div>
                              <div className="max-h-48 overflow-y-auto space-y-1">
                                {taskEmployees.map(emp => {
                                  const isAssigned = assignees.some(a => a.id === emp.id)
                                  return (
                                    <button
                                      key={emp.id}
                                      onClick={(e) => {
                                        e.stopPropagation()
                                        handleQuickAssigneeChange(task.id, emp.id)
                                      }}
                                      className={`w-full flex items-center gap-2 px-2 py-1.5 rounded text-[11px] transition-colors ${isAssigned ? 'bg-indigo-50 text-indigo-700' : 'hover:bg-slate-50 text-slate-700'}`}
                                    >
                                      <div className={`w-4 h-4 rounded-full flex items-center justify-center text-[8px] font-bold ${isAssigned ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-600'}`}>
                                        {isAssigned ? '✓' : getInitials(emp.name)}
                                      </div>
                                      {emp.name}
                                    </button>
                                  )
                                })}
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                )
              })}
              <div className="relative group mt-3">
                <input
                  type="text"
                  placeholder="+ Add a task..."
                  className="w-full bg-white border border-slate-200 focus:border-indigo-500 focus:bg-white rounded-lg px-3 py-2 text-[12px] font-medium text-slate-700 outline-none transition-all placeholder:text-slate-400"
                  value={inlineInputs[`${status.id}-bottom`] || ''}
                  onChange={(e) => handleTextChange('inline', e.target.value, `${status.id}-bottom`)}
                  onKeyDown={(e) => handleInlineCreate(`${status.id}-bottom`, e)}
                />
                {mentionState.active && mentionState.targetId === `${status.id}-bottom` && <div className="absolute top-full left-0 z-50"><MentionList /></div>}
                
                {/* Date picker for bottom inline input */}
                {inlineInputs[`${status.id}-bottom`]?.trim() && (
                  <div className="mt-2 flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setInlineDates({ ...inlineDates, [`${status.id}-bottom`]: inlineDates[`${status.id}-bottom`] ? null : new Date() })}
                      className={`flex items-center gap-1.5 px-2 py-1 rounded-md text-[11px] font-medium transition-all ${
                        inlineDates[`${status.id}-bottom`] 
                          ? 'bg-indigo-50 text-indigo-600 border border-indigo-200' 
                          : 'bg-slate-50 text-slate-500 border border-slate-200 hover:border-slate-300'
                      }`}
                    >
                      <CalendarIcon size={12} />
                      {inlineDates[`${status.id}-bottom`] ? formatDueDate(inlineDates[`${status.id}-bottom`]) : 'Set due date'}
                    </button>
                    
                    {inlineDates[`${status.id}-bottom`] && (
                      <DatePicker
                        selected={inlineDates[`${status.id}-bottom`]}
                        onChange={(date) => setInlineDates({ ...inlineDates, [`${status.id}-bottom`]: date })}
                        className="!w-[100px] !bg-white !border-slate-200 !rounded-md !px-2 !py-1 !text-[11px]"
                        dateFormat="MMM d"
                        placeholderText="Pick date"
                        popperPlacement="bottom-start"
                      />
                    )}
                  </div>
                )}
              </div>
          </div>
        </div>
      ))}
    </div>
  )

  const renderTableView = () => (
    <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm">
      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse min-w-[1000px]">
          <thead>
            <tr className="bg-slate-50 border-b border-slate-200 h-12">
              <th className="px-6 text-[11px] font-bold text-slate-400 uppercase tracking-widest">Directive</th>
              <th className="px-6 text-[11px] font-bold text-slate-400 uppercase tracking-widest">Status</th>
              <th className="px-6 text-[11px] font-bold text-slate-400 uppercase tracking-widest">Protocol</th>
              <th className="px-6 text-[11px] font-bold text-slate-400 uppercase tracking-widest">Deadline</th>
              <th className="px-6 text-[11px] font-bold text-slate-400 uppercase tracking-widest">Personnel</th>
              <th className="px-6 text-[11px] font-bold text-slate-400 uppercase tracking-widest text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {filteredTasks.length === 0 ? (
              <tr><td colSpan="6" className="py-20 text-center text-slate-300 font-medium italic">Empty Manifest</td></tr>
            ) : (
              filteredTasks.map(task => (
                <tr key={task.id} className="hover:bg-slate-50 transition-colors group">
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-3">
                      <button onClick={() => handleStatusChange(task.id, task.status === 'Completed' ? 'To Do' : 'Completed')} className={`transition-all duration-300 ${task.status === 'Completed' ? 'text-emerald-500 scale-110' : 'text-slate-200 hover:text-slate-400'}`}>
                        {task.status === 'Completed' ? <CheckCircle2 size={18} /> : <Circle size={18} />}
                      </button>
                      <span className={`text-[13px] font-medium text-slate-700 ${task.status === 'Completed' ? 'line-through text-slate-300' : ''}`}>{task.title}</span>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <span className={`text-[10px] font-bold uppercase tracking-tight px-2 py-0.5 rounded-lg border ${
                      task.status === 'Completed' ? 'bg-emerald-50 text-emerald-600 border-emerald-100' :
                      task.status === 'In Progress' ? 'bg-blue-50 text-blue-600 border-blue-100' :
                      'bg-slate-50 text-slate-400 border-slate-100'
                    }`}>
                      {task.status}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    <span className={`text-[10px] font-bold uppercase ${task.priority === 'urgent' ? 'text-rose-500' : 'text-slate-400'}`}>
                      {task.priority || 'normal'}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-[11px] font-medium text-slate-500 tabular-nums">
                    {task.dueDate ? formatDueDate(task.dueDate) : '—'}
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex -space-x-1.5">
                      {getAssigneeInfo(task.assignedTo).map(emp => (
                        <div key={emp.id} className="w-6 h-6 rounded-full bg-slate-100 border-2 border-white flex items-center justify-center text-[8px] font-bold text-slate-600 shadow-sm" title={emp.name}>
                          {getInitials(emp.name)}
                        </div>
                      ))}
                    </div>
                  </td>
                  <td className="px-6 py-4 text-right">
                    <button onClick={() => deleteTask(task.id)} className="text-slate-200 hover:text-rose-500 transition-colors">
                      <Trash2 size={14} />
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  )

  const renderDashboardView = () => {
    const stats = {
      total: filteredTasks.length,
      completed: filteredTasks.filter(t => t.status === 'Completed').length,
      urgent: filteredTasks.filter(t => t.priority === 'urgent').length,
      overdue: filteredTasks.filter(t => {
        if (!t.dueDate || t.status === 'Completed') return false
        const d = t.dueDate.toDate ? t.dueDate.toDate() : new Date(t.dueDate)
        return d < new Date()
      }).length
    }
    const rate = stats.total > 0 ? Math.round((stats.completed / stats.total) * 100) : 0

    return (
      <div className="space-y-8">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
          {[
            { label: 'Manifest Load', value: stats.total, color: 'text-slate-700' },
            { label: 'Efficiency Rate', value: `${rate}%`, color: 'text-indigo-600' },
            { label: 'Critical Assets', value: stats.urgent, color: 'text-rose-600' },
            { label: 'Past Deadline', value: stats.overdue, color: 'text-amber-600' }
          ].map(s => (
            <div key={s.label} className="bg-white border border-slate-200 p-6 rounded-2xl shadow-sm">
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">{s.label}</p>
              <p className={`text-3xl font-bold ${s.color} tracking-tight`}>{s.value}</p>
            </div>
          ))}
        </div>
      </div>
    )
  }

  // Calendar View - Notion Style
  const renderCalendarView = () => {
    const year = calendarDate.getFullYear()
    const month = calendarDate.getMonth()
    const daysInMonth = new Date(year, month + 1, 0).getDate()
    const firstDayOfMonth = new Date(year, month, 1).getDay()
    const monthName = calendarDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
    
    // Get days from previous month
    const prevMonthDays = []
    const prevMonthLastDay = new Date(year, month, 0).getDate()
    for (let i = firstDayOfMonth - 1; i >= 0; i--) {
      prevMonthDays.push(prevMonthLastDay - i)
    }
    
    // Filter tasks that are visible in calendar (exclude completed by default)
    const visibleTasks = filteredTasks.filter(task => {
      if (!task.dueDate) return false
      if (task.status === 'Completed' && !statusFilter['Completed']) return false
      return statusFilter[task.status] !== false
    })
    
    // Group tasks by date
    const tasksByDate = {}
    visibleTasks.forEach(task => {
      const taskDate = task.dueDate.toDate ? task.dueDate.toDate() : new Date(task.dueDate)
      if (taskDate.getMonth() === month && taskDate.getFullYear() === year) {
        const day = taskDate.getDate()
        if (!tasksByDate[day]) tasksByDate[day] = []
        tasksByDate[day].push(task)
      }
    })
    
    const handlePrevMonth = () => {
      setCalendarDate(new Date(year, month - 1, 1))
    }
    
    const handleNextMonth = () => {
      setCalendarDate(new Date(year, month + 1, 1))
    }
    
    const handleDrop = async (e, day) => {
      e.preventDefault()
      const taskId = e.dataTransfer.getData('taskId')
      if (!taskId) return
      
      const newDate = new Date(year, month, day)
      try {
        await updateTask(taskId, { dueDate: newDate })
        setDraggedTaskId(null)
      } catch (err) {
        console.error('Failed to move task:', err)
      }
    }
    
    const handleDragOver = (e) => {
      e.preventDefault()
    }

    const weekDays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
    
    return (
      <div className="h-full flex flex-col bg-white">
        {/* Calendar Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
          <div className="flex items-center gap-4">
            <h2 className="text-xl font-bold text-slate-800">{monthName}</h2>
            <div className="flex items-center gap-1">
              <button 
                onClick={handlePrevMonth}
                className="p-1.5 hover:bg-slate-100 rounded-lg transition-colors"
              >
                <ChevronLeft size={18} className="text-slate-600" />
              </button>
              <button 
                onClick={handleNextMonth}
                className="p-1.5 hover:bg-slate-100 rounded-lg transition-colors"
              >
                <ChevronRight size={18} className="text-slate-600" />
              </button>
            </div>
          </div>
          
          {/* Status Filter Toggle */}
          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-500 font-medium">Show:</span>
            {STATUSES.filter(s => s.id !== 'Completed').map(status => (
              <button
                key={status.id}
                onClick={() => setStatusFilter(prev => ({ ...prev, [status.id]: !prev[status.id] }))}
                className={`flex items-center gap-1 px-2 py-1 rounded-md text-[10px] font-medium transition-all ${
                  statusFilter[status.id] 
                    ? 'bg-slate-100 text-slate-700' 
                    : 'bg-transparent text-slate-400 line-through'
                }`}
              >
                {status.icon}
                {status.label}
              </button>
            ))}
            <div className="h-4 w-px bg-slate-200 mx-1"></div>
            <button
              onClick={() => setStatusFilter(prev => ({ ...prev, 'Completed': !prev['Completed'] }))}
              className={`flex items-center gap-1 px-2 py-1 rounded-md text-[10px] font-medium transition-all ${
                statusFilter['Completed'] 
                  ? 'bg-emerald-50 text-emerald-700' 
                  : 'bg-transparent text-slate-400 line-through'
              }`}
            >
              <CheckCircle2 size={12} className="text-emerald-500" />
              Completed
            </button>
          </div>
        </div>
        
        {/* Calendar Grid - No scrollable */}
        <div className="flex-1 flex flex-col">
          {/* Week Headers */}
          <div className="grid grid-cols-7 border-b border-slate-200">
            {weekDays.map(day => (
              <div key={day} className="px-3 py-2 text-xs font-medium text-slate-500 text-center bg-slate-50">
                {day}
              </div>
            ))}
          </div>
          
          {/* Calendar Days - Fixed height */}
          <div className="flex-1 grid grid-cols-7 grid-rows-6">
            {/* Previous month days */}
            {prevMonthDays.map((day, idx) => (
              <div 
                key={`prev-${idx}`} 
                className="border-r border-b border-slate-100 bg-slate-50/50 p-2 text-slate-300 text-sm"
              >
                {day}
              </div>
            ))}
            
            {/* Current month days */}
            {Array.from({ length: daysInMonth }, (_, i) => i + 1).map(day => {
              const dayTasks = tasksByDate[day] || []
              const isToday = new Date().getDate() === day && 
                              new Date().getMonth() === month && 
                              new Date().getFullYear() === year
              
              return (
                <div
                  key={day}
                  onDragOver={handleDragOver}
                  onDrop={(e) => handleDrop(e, day)}
                  className={`border-r border-b border-slate-100 p-2 min-h-[80px] transition-colors hover:bg-slate-50/50 ${
                    isToday ? 'bg-indigo-50/30' : ''
                  }`}
                >
                  <div className={`text-sm font-medium mb-1 ${isToday ? 'text-indigo-600' : 'text-slate-700'}`}>
                    {day}
                    {isToday && <span className="ml-1 text-xs text-indigo-500">Today</span>}
                  </div>
                  <div className="space-y-1">
                    {dayTasks.slice(0, 3).map(task => {
                      const assignees = getAssigneeInfo(task.assignedTo)
                      return (
                        <div
                          key={task.id}
                          draggable
                          onDragStart={(e) => {
                            e.dataTransfer.setData('taskId', task.id)
                            setDraggedTaskId(task.id)
                          }}
                          onClick={() => openEditModal(task)}
                          className={`text-[10px] p-1.5 rounded cursor-pointer transition-all hover:shadow-sm ${
                            task.priority === 'urgent' ? 'bg-rose-50 border border-rose-200 text-rose-700' :
                            task.priority === 'high' ? 'bg-amber-50 border border-amber-200 text-amber-700' :
                            'bg-slate-50 border border-slate-200 text-slate-700'
                          }`}
                        >
                          <div className="truncate font-medium">{task.title}</div>
                          {assignees.length > 0 && (
                            <div className="flex items-center gap-0.5 mt-0.5 text-[8px] text-slate-500">
                              <User size={8} />
                              {assignees.length > 1 ? `${assignees.length}` : assignees[0].name.split(' ')[0]}
                            </div>
                          )}
                        </div>
                      )
                    })}
                    {dayTasks.length > 3 && (
                      <div className="text-[9px] text-slate-400 text-center">
                        +{dayTasks.length - 3} more
                      </div>
                    )}
                  </div>
                </div>
              )
            })}
            
            {/* Next month days to fill grid */}
            {Array.from({ length: 42 - (prevMonthDays.length + daysInMonth) }, (_, i) => i + 1).map((day, idx) => (
              <div 
                key={`next-${idx}`} 
                className="border-r border-b border-slate-100 bg-slate-50/50 p-2 text-slate-300 text-sm"
              >
                {day}
              </div>
            ))}
          </div>
        </div>
      </div>
    )
  }

  // Idea tab filtered ideas - computed at top level to avoid hook violation
  const filteredIdeas = useMemo(() => {
    if (activeTab !== 'idea') return []
    
    let ideas = filteredTasks.filter(t => t.category === 'idea')
    
    if (ideaSearchTerm) {
      const search = ideaSearchTerm.toLowerCase()
      ideas = ideas.filter(i => 
        i.title?.toLowerCase().includes(search) || 
        i.description?.toLowerCase().includes(search)
      )
    }
    
    if (ideaFilter === 'recent') {
      ideas = ideas.sort((a, b) => new Date(b.createdAt?.toDate()) - new Date(a.createdAt?.toDate()))
    } else if (ideaFilter === 'oldest') {
      ideas = ideas.sort((a, b) => new Date(a.createdAt?.toDate()) - new Date(b.createdAt?.toDate()))
    }
    
    return ideas
  }, [filteredTasks, ideaSearchTerm, ideaFilter, activeTab])

  const renderIdeaTabView = () => {
    return (
    <div className="h-full flex flex-col">
      <div className="bg-white border-b border-zinc-200 px-6 py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-4 rounded-lg shadow-sm">
        <div className="flex items-center gap-2">
          <Lightbulb size={20} className="text-amber-500" />
          <h2 className="text-lg font-bold text-zinc-900">Ideas Dashboard</h2>
          <span className="text-sm text-zinc-500">({filteredIdeas.length} ideas)</span>
        </div>
        
        <div className="flex items-center gap-3">
          <div className="relative">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" />
            <input
              type="text"
              placeholder="Search ideas..."
              value={ideaSearchTerm}
              onChange={(e) => setIdeaSearchTerm(e.target.value)}
              className="pl-9 pr-4 py-2 bg-zinc-50 border border-zinc-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 w-64"
            />
          </div>
          
          <select
            value={ideaFilter}
            onChange={(e) => setIdeaFilter(e.target.value)}
            className="px-3 py-2 bg-zinc-50 border border-zinc-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
          >
            <option value="all">All Ideas</option>
            <option value="recent">Most Recent</option>
            <option value="oldest">Oldest First</option>
          </select>
          
          <button
            onClick={() => setShowAddIdeaModal(true)}
            className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 transition-colors shadow-sm"
          >
            <Plus size={16} />
            Add Idea
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-auto">
        <div className="rounded-lg border border-zinc-200 bg-white shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full caption-bottom text-sm border-collapse">
              <thead className="border-b border-zinc-200 bg-zinc-50/80 [&_tr]:border-b">
                <tr className="border-b border-zinc-200">
                  <th className="h-10 px-3 text-left align-middle text-xs font-medium text-zinc-500 w-[120px]">
                    Date
                  </th>
                  <th className="h-10 px-3 text-left align-middle text-xs font-medium text-zinc-500">
                    Idea
                  </th>
                  <th className="h-10 px-3 text-center align-middle text-xs font-medium text-zinc-500 w-[80px]">
                    View
                  </th>
                  <th className="h-10 px-3 text-center align-middle text-xs font-medium text-zinc-500 w-[80px]">
                    Edit
                  </th>
                  <th className="h-10 px-3 text-center align-middle text-xs font-medium text-zinc-500 w-[80px]">
                    PDF
                  </th>
                  <th className="h-10 px-3 text-center align-middle text-xs font-medium text-zinc-500 w-[80px]">
                    Delete
                  </th>
                </tr>
              </thead>
              <tbody className="[&_tr:last-child]:border-0">
                {filteredIdeas.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-3 py-16 text-center text-zinc-400">
                      <Lightbulb size={48} className="mx-auto mb-3 text-zinc-300" />
                      <p className="text-sm font-medium">No ideas found</p>
                      <p className="text-xs mt-1">Click "Add Idea" to create your first idea</p>
                    </td>
                  </tr>
                ) : (
                  filteredIdeas.map((idea) => (
                    <tr 
                      key={idea.id} 
                      className="border-b border-zinc-100 transition-colors hover:bg-zinc-50/80"
                    >
                      <td className="px-3 py-3 align-middle whitespace-nowrap text-[12px] font-medium text-zinc-500">
                        {idea.createdAt ? format(idea.createdAt.toDate(), 'MMM d, yyyy') : 'N/A'}
                      </td>
                      <td className="px-3 py-3 align-middle">
                        <div className="font-medium text-zinc-900 text-[13px]">{idea.title}</div>
                        {idea.description && (
                          <div className="text-zinc-500 text-[11px] mt-1 line-clamp-2">
                            {idea.description.substring(0, 100)}{idea.description.length > 100 ? '...' : ''}
                          </div>
                        )}
                      </td>
                      <td className="px-3 py-3 align-middle text-center">
                        <button
                          onClick={() => setSelectedReminder(idea)}
                          className="p-2 text-zinc-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors"
                          title="View details"
                        >
                          <FileText size={16} />
                        </button>
                      </td>
                      <td className="px-3 py-3 align-middle text-center">
                        <button
                          onClick={() => {
                            setNewIdea({
                              title: idea.title,
                              bullets: idea.description ? idea.description.split('\n').filter(b => b.trim()) : ['']
                            })
                            setShowAddIdeaModal(true)
                          }}
                          className="p-2 text-zinc-400 hover:text-amber-600 hover:bg-amber-50 rounded-lg transition-colors"
                          title="Edit idea"
                        >
                          <Edit3 size={16} />
                        </button>
                      </td>
                      <td className="px-3 py-3 align-middle text-center">
                        <button
                          onClick={() => exportIdeaToPDF(idea)}
                          className="p-2 text-zinc-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors"
                          title="Export to PDF"
                        >
                          <Download size={16} />
                        </button>
                      </td>
                      <td className="px-3 py-3 align-middle text-center">
                        <button
                          onClick={() => deleteTask(idea.id)}
                          className="p-2 text-zinc-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors"
                          title="Delete idea"
                        >
                          <Trash2 size={16} />
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <Modal 
        isOpen={showAddIdeaModal} 
        onClose={() => { setShowAddIdeaModal(false); setNewIdea({ title: '', bullets: [''] }) }}
        title="Add New Idea"
        size="2xl"
      >
        <form onSubmit={handleCreateIdea} className="p-6 space-y-6">
          <div>
            <label className="block text-[11px] font-bold text-zinc-500 uppercase tracking-wider mb-2">
              Idea Title
            </label>
            <input
              type="text"
              required
              value={newIdea.title}
              onChange={(e) => setNewIdea(prev => ({ ...prev, title: e.target.value }))}
              placeholder="Enter your idea title..."
              className="w-full px-4 py-3 bg-zinc-50 border border-zinc-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
            />
          </div>

          <div>
            <label className="block text-[11px] font-bold text-zinc-500 uppercase tracking-wider mb-2">
              Key Points
            </label>
            <div className="space-y-2">
              {newIdea.bullets.map((bullet, index) => (
                <div key={index} className="flex items-center gap-2">
                  <span className="text-zinc-400 font-bold">•</span>
                  <input
                    type="text"
                    value={bullet}
                    onChange={(e) => handleBulletChange(index, e.target.value)}
                    placeholder={`Point ${index + 1}`}
                    className="flex-1 px-3 py-2 bg-zinc-50 border border-zinc-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                  />
                  {newIdea.bullets.length > 1 && (
                    <button
                      type="button"
                      onClick={() => handleRemoveBullet(index)}
                      className="p-1.5 text-zinc-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors"
                    >
                      <X size={16} />
                    </button>
                  )}
                </div>
              ))}
            </div>
            <button
              type="button"
              onClick={handleAddBullet}
              className="mt-3 flex items-center gap-1.5 text-sm text-indigo-600 hover:text-indigo-700 font-medium"
            >
              <Plus size={16} />
              Add another point
            </button>
          </div>

          <div className="flex gap-3 pt-4 border-t border-zinc-100">
            <button
              type="button"
              onClick={() => { setShowAddIdeaModal(false); setNewIdea({ title: '', bullets: [''] }) }}
              className="px-6 py-2.5 border border-zinc-200 text-zinc-600 rounded-xl text-sm font-medium hover:bg-zinc-50 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="flex-1 px-6 py-2.5 bg-indigo-600 text-white rounded-xl text-sm font-medium hover:bg-indigo-700 transition-colors shadow-sm"
            >
              Save Idea
            </button>
          </div>
        </form>
      </Modal>
    </div>
  )
}

  if (loading) return <div className="h-64 flex items-center justify-center"><Spinner /></div>

  return (
    <div className="flex flex-col h-full bg-slate-50/50 font-inter selection:bg-indigo-100">
      <style>{`
        @keyframes statusPulse {
          0% { transform: scale(1); }
          50% { transform: scale(1.2); }
          100% { transform: scale(1); }
        }
        .status-animate {
          animation: statusPulse 0.3s ease-in-out;
        }
      `}</style>

      <div className="bg-white border-b border-slate-200 px-8 py-6 flex flex-col lg:flex-row lg:items-center justify-between gap-6 shrink-0">
        <div>
          <h1 className="text-xl font-black text-slate-900 tracking-tight flex items-center gap-3 leading-none uppercase">
            Tasks <span className="text-slate-200 font-thin">/</span> <span className="text-indigo-600 tracking-tighter">{TABS.find(t => t.id === activeTab)?.label}</span>
          </h1>
          <div className="flex items-center gap-1 mt-2.5">
            {TABS.map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-2 px-4 py-1.5 rounded-full text-[11px] font-bold transition-all ${
                  activeTab === tab.id ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-100' : 'text-slate-400 hover:bg-slate-50'
                }`}
              >
                {tab.icon} {tab.label}
              </button>
            ))}
          </div>
        </div>

        <div className="flex items-center gap-4">
          <div className="flex bg-slate-50 p-1 rounded-xl border border-slate-100">
            {[
              { id: 'board', icon: <Layout size={14} />, label: 'Board' },
              { id: 'table', icon: <Table size={14} />, label: 'Table' },
              { id: 'calendar', icon: <CalendarIcon size={14} />, label: 'Calendar' },
              { id: 'dashboard', icon: <BarChart2 size={14} />, label: 'Stats' }
            ].map(m => (
              <button
                key={m.id}
                onClick={() => setViewMode(m.id)}
                className={`flex items-center gap-2 px-4 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-widest transition-all ${
                  viewMode === m.id ? 'bg-white text-slate-900 shadow-sm border border-slate-100' : 'text-slate-400 hover:text-slate-600'
                }`}
              >
                {m.icon} {m.label}
              </button>
            ))}
          </div>
          <button onClick={() => setShowAddModal(true)} className="h-10 px-6 bg-indigo-600 text-white rounded-xl text-[11px] font-bold uppercase tracking-widest flex items-center gap-2 hover:bg-indigo-700 transition-all shadow-lg active:scale-95">
            <Plus size={16} /> New Task
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-auto p-5">
        {activeTab === 'reminders' ? (
          <div className="max-w-4xl mx-auto space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-700">
            {reminders.map(r => (
              <div key={r.id} className="bg-white border border-slate-200 p-8 rounded-3xl shadow-sm hover:border-indigo-300 transition-all cursor-pointer group" onClick={() => setSelectedReminder(r)}>
                <div className="flex items-center gap-3 mb-4">
                  <span className="px-3 py-1 rounded-full bg-indigo-50 text-indigo-600 text-[10px] font-black uppercase tracking-widest">{r.type}</span>
                  <span className="text-[10px] text-slate-300 font-bold tracking-widest">{r.createdAt ? formatDistanceToNow(r.createdAt.toDate(), { addSuffix: true }).toUpperCase() : ''}</span>
                </div>
                <h4 className="text-xl font-bold text-slate-800 uppercase tracking-tight group-hover:text-indigo-600 transition-colors">{r.title}</h4>
                <p className="text-slate-500 text-sm mt-3 leading-relaxed line-clamp-3 uppercase tracking-tight">{r.content}</p>
              </div>
            ))}
          </div>
        ) : activeTab === 'idea' ? (
          renderIdeaTabView()
        ) : (
          <div className="h-full animate-in fade-in slide-in-from-bottom-4 duration-700">
            {viewMode === 'board' && renderBoardView()}
            {viewMode === 'table' && renderTableView()}
            {viewMode === 'calendar' && renderCalendarView()}
            {viewMode === 'dashboard' && renderDashboardView()}
          </div>
        )}
      </div>

      <Modal 
        isOpen={showAddModal} 
        onClose={() => setShowAddModal(false)}
        title="Create New Task"
        size="2xl"
      >
        <form onSubmit={handleCreateTask} className="p-6 space-y-6">
          {/* Title Section */}
          <div className="space-y-4">
            <div className="relative">
              <label className="block text-[12px] font-semibold text-gray-700 mb-2">Task Title</label>
              <input
                type="text"
                required
                className="w-full bg-gray-50/50 border border-gray-200 rounded-lg px-4 py-2.5 text-sm focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 focus:bg-white outline-none transition-all placeholder:text-gray-400"
                placeholder="What needs to be done?"
                value={newTask.title}
                onChange={e => handleTextChange('title', e.target.value)}
                autoFocus
              />
              {mentionState.active && mentionState.targetField === 'title' && !mentionState.targetId && <MentionList />}
            </div>

            <div className="relative">
              <label className="block text-[12px] font-semibold text-gray-700 mb-2">Description</label>
              <textarea
                className="w-full bg-gray-50/50 border border-gray-200 rounded-lg px-4 py-2.5 text-sm focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 focus:bg-white outline-none transition-all min-h-[80px] resize-none placeholder:text-gray-400"
                placeholder="Add some details..."
                value={newTask.description}
                onChange={e => handleTextChange('description', e.target.value)}
              />
              {mentionState.active && mentionState.targetField === 'description' && !mentionState.targetId && <MentionList />}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-6">
            {/* Left Column */}
            <div className="space-y-6">
              {/* Priority Selector */}
              <div>
                <label className="block text-[12px] font-semibold text-gray-700 mb-2">Priority</label>
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
                <label className="block text-[12px] font-semibold text-gray-700 mb-2">Initial Status</label>
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
                <label className="block text-[12px] font-semibold text-gray-700 mb-2">Due Date</label>
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
                <label className="block text-[12px] font-semibold text-gray-700 mb-2">Internal Notes</label>
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
            <label className="block text-[12px] font-semibold text-gray-700 mb-2">Assign To</label>
            <div className="flex flex-wrap gap-1.5 p-3 bg-gray-50/50 border border-gray-200 rounded-lg min-h-[45px]">
              {taskEmployees.map(emp => {
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
                        ? 'bg-emerald-600 border-emerald-600 text-white shadow-sm shadow-emerald-100' 
                        : 'bg-white border-gray-200 text-gray-600 hover:border-gray-300 hover:bg-gray-50'
                    }`}
                  >
                    <div className={`w-1.5 h-1.5 rounded-full ${isSelected ? 'bg-white' : 'bg-gray-300'}`} />
                    {emp.name}
                  </button>
                )
              })}
              {taskEmployees.length === 0 && (
                <p className="text-[10px] text-gray-400 italic py-1">No employees found</p>
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

      {/* Edit Task Modal */}
      <Modal 
        isOpen={showEditModal} 
        onClose={() => { setShowEditModal(false); setEditingTask(null); }}
        title="Edit Task"
        size="2xl"
      >
        {editingTask && (
          <form onSubmit={handleSaveEdit} className="p-6 space-y-6">
            {/* Title Section */}
            <div className="space-y-4">
              <div className="relative">
                <label className="block text-[12px] font-semibold text-gray-700 mb-2">Task Title</label>
                <input
                  type="text"
                  required
                  className="w-full bg-gray-50/50 border border-gray-200 rounded-lg px-4 py-2.5 text-sm focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 focus:bg-white outline-none transition-all placeholder:text-gray-400"
                  placeholder="What needs to be done?"
                  value={editingTask.title}
                  onChange={e => setEditingTask({ ...editingTask, title: e.target.value })}
                />
              </div>

              <div className="relative">
                <label className="block text-[12px] font-semibold text-gray-700 mb-2">Description</label>
                <textarea
                  className="w-full bg-gray-50/50 border border-gray-200 rounded-lg px-4 py-2.5 text-sm focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 focus:bg-white outline-none transition-all min-h-[80px] resize-none placeholder:text-gray-400"
                  placeholder="Add some details..."
                  value={editingTask.description || ''}
                  onChange={e => setEditingTask({ ...editingTask, description: e.target.value })}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-6">
              {/* Left Column */}
              <div className="space-y-6">
                {/* Priority Selector */}
                <div>
                  <label className="block text-[12px] font-semibold text-gray-700 mb-2">Priority</label>
                  <div className="grid grid-cols-3 gap-2">
                    {['normal', 'high', 'urgent'].map((p) => (
                      <button
                        key={p}
                        type="button"
                        onClick={() => setEditingTask({ ...editingTask, priority: p })}
                        className={`py-2 rounded-lg text-[10px] font-medium uppercase tracking-wider transition-all border ${
                          editingTask.priority === p 
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
                  <label className="block text-[12px] font-semibold text-gray-700 mb-2">Status</label>
                  <select
                    className="w-full bg-gray-50/50 border border-gray-200 rounded-lg px-4 py-2 text-sm focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 focus:bg-white outline-none transition-all appearance-none cursor-pointer"
                    value={editingTask.status}
                    onChange={e => setEditingTask({ ...editingTask, status: e.target.value })}
                  >
                    {STATUSES.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
                  </select>
                </div>
              </div>

              {/* Right Column */}
              <div className="space-y-6">
                {/* Due Date */}
                <div>
                  <label className="block text-[12px] font-semibold text-gray-700 mb-2">Due Date</label>
                  <div className="relative">
                    <DatePicker
                      selected={editingTask.dueDate}
                      onChange={(date) => setEditingTask({ ...editingTask, dueDate: date })}
                      className="w-full bg-gray-50/50 border border-gray-200 rounded-lg px-4 py-2 text-sm focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 focus:bg-white outline-none transition-all cursor-pointer"
                      placeholderText="Optional"
                      dateFormat="MMM d, yyyy"
                    />
                    <CalendarIcon className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" size={14} />
                  </div>
                </div>

                {/* Internal Notes */}
                <div>
                  <label className="block text-[12px] font-semibold text-gray-700 mb-2">Internal Notes</label>
                  <input
                    type="text"
                    className="w-full bg-gray-50/50 border border-gray-200 rounded-lg px-4 py-2 text-sm focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 focus:bg-white outline-none transition-all placeholder:text-gray-400"
                    placeholder="Quick notes (internal only)"
                    value={editingTask.notes || ''}
                    onChange={e => setEditingTask({ ...editingTask, notes: e.target.value })}
                  />
                </div>
              </div>
            </div>

            {/* Multi-Assignee Selector */}
            <div>
              <label className="block text-[12px] font-semibold text-gray-700 mb-2">Assign To</label>
              <div className="flex flex-wrap gap-1.5 p-3 bg-gray-50/50 border border-gray-200 rounded-lg min-h-[45px]">
                {taskEmployees.map(emp => {
                  const isSelected = editingTask.assignedTo?.includes(emp.id)
                  return (
                    <button
                      key={emp.id}
                      type="button"
                      onClick={() => {
                        const current = editingTask.assignedTo || []
                        const updated = isSelected 
                          ? current.filter(id => id !== emp.id)
                          : [...current, emp.id]
                        setEditingTask({ ...editingTask, assignedTo: updated })
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
                {taskEmployees.length === 0 && (
                  <p className="text-[10px] text-gray-400 italic py-1">No employees found</p>
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
                    value={editingTask.clientName || ''}
                    onChange={e => setEditingTask({ ...editingTask, clientName: e.target.value })}
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-medium text-gray-500 uppercase tracking-wider mb-1.5">Client Type</label>
                  <div className="flex gap-2">
                    {CLIENT_TYPES.map(type => (
                      <button
                        key={type.id}
                        type="button"
                        onClick={() => setEditingTask({ ...editingTask, clientType: editingTask.clientType === type.id ? null : type.id })}
                        className={`flex-1 py-2 rounded-lg text-xs transition-all border ${
                          editingTask.clientType === type.id 
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

            <div className="flex gap-3 pt-4 border-t border-gray-100">
              <button
                type="button"
                onClick={() => { setShowEditModal(false); setEditingTask(null); }}
                className="px-6 py-2.5 border border-gray-200 text-gray-600 rounded-lg text-sm font-medium hover:bg-gray-50 transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={async () => {
                  if (confirm('Are you sure you want to delete this task? This action cannot be undone.')) {
                    try {
                      await deleteTask(editingTask.id)
                      setShowEditModal(false)
                      setEditingTask(null)
                    } catch (err) {
                      console.error('Failed to delete task:', err)
                      alert('Failed to delete task')
                    }
                  }
                }}
                className="px-6 py-2.5 border border-red-200 text-red-600 rounded-lg text-sm font-medium hover:bg-red-50 transition-colors"
              >
                <Trash2 size={16} className="inline mr-1" /> Delete
              </button>
              <button
                type="submit"
                className="flex-1 px-6 py-2.5 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 transition-all shadow-sm shadow-indigo-100 active:scale-[0.98]"
              >
                Save Changes
              </button>
            </div>
          </form>
        )}
      </Modal>

      <Modal isOpen={!!selectedReminder} onClose={() => setSelectedReminder(null)} title="Directive Summary">
        {selectedReminder && (
          <div className="space-y-6 p-8">
            <div className="flex items-center justify-between border-b border-slate-50 pb-4">
              <div className="flex items-center gap-2">
                <span className="px-3 py-1 rounded-full bg-indigo-50 text-indigo-600 text-[10px] font-black uppercase tracking-widest">{selectedReminder.type}</span>
                <span className="text-[10px] font-bold text-slate-300 uppercase tracking-widest">Posted {selectedReminder.createdAt ? formatDistanceToNow(selectedReminder.createdAt.toDate(), { addSuffix: true }) : 'just now'}</span>
              </div>
            </div>
            <div>
              <h2 className="text-2xl font-black text-slate-900 mb-4 uppercase tracking-tight">{selectedReminder.title}</h2>
              <div className="bg-slate-50 rounded-3xl p-8 border border-slate-100 min-h-[180px]">
                <p className="text-slate-700 text-sm font-medium whitespace-pre-wrap leading-relaxed uppercase tracking-tight">{selectedReminder.content}</p>
              </div>
            </div>
            <div className="flex justify-end pt-8 border-t border-slate-100">
              <button onClick={() => setSelectedReminder(null)} className="px-10 h-12 bg-zinc-900 text-white font-black rounded-xl text-[10px] uppercase tracking-widest hover:bg-black transition-all">Close Command</button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  )
}
