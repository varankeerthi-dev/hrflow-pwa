import React, { useState, useMemo, useRef, useEffect } from 'react'
import DatePicker from 'react-datepicker'
import 'react-datepicker/dist/react-datepicker.css'
import { formatDistanceToNow, format } from 'date-fns'
import { useSearchParams } from 'react-router-dom'
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
  Check,
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
  ChevronRight,
  CheckSquare
} from 'lucide-react'
import { useAuth } from '../../hooks/useAuth'
import { useEmployees } from '../../hooks/useEmployees'
import { useTasks } from '../../hooks/useTasks'
import { useReminders } from '../../hooks/useReminders'
import { db } from '../../lib/firebase'
import { collection, query, where, getDocs } from 'firebase/firestore'
import Spinner from '../ui/Spinner'
import Modal from '../ui/Modal'
import ChecklistView from '../../modules/checklist/components/ChecklistView'
import { SubTabsNav } from '../ui/SubTabsNav'
import { isEmployeeActiveStatus } from '../../lib/employeeStatus'
import TaskChecklistBuilder from '../tasks/TaskChecklistBuilder'

const STATUSES = [
  { 
    id: 'To Do', 
    label: 'To Do', 
    icon: <span className="w-4 h-4 rounded-full border border-dashed border-slate-400 inline-block shrink-0" /> 
  },
  { 
    id: 'In Progress', 
    label: 'In Progress', 
    icon: (
      <svg className="w-4 h-4 text-blue-500 shrink-0" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
        <circle cx="12" cy="12" r="9" />
        <path d="M10 8l6 4-6 4V8z" fill="currentColor" />
      </svg>
    ) 
  },
  { 
    id: 'On Hold', 
    label: 'On Hold', 
    icon: (
      <svg className="w-4 h-4 text-amber-500 shrink-0" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
        <circle cx="12" cy="12" r="9" />
        <path d="M12 7v5" strokeLinecap="round" strokeLinejoin="round" />
        <circle cx="12" cy="15.5" fill="currentColor" r="0.5" />
      </svg>
    ) 
  },
  { 
    id: 'Review', 
    label: 'Review', 
    icon: (
      <svg className="w-4 h-4 text-purple-600 shrink-0" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
        <circle cx="12" cy="12" r="9" />
        <path d="M8.5 12.5l2.5 2.5 4.5-4.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ) 
  },
  { 
    id: 'Completed', 
    label: 'Completed', 
    icon: (
      <svg className="w-4 h-4 text-emerald-600 shrink-0" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
        <circle cx="12" cy="12" r="9" />
        <path d="M7 12l3.5 3.5 6.5-6.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ) 
  }
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
  { id: 'reminders', label: 'Announcements', icon: <Bell size={14} /> },
  { id: 'checklist', label: 'Checklist', icon: <CheckSquare size={14} /> }
]

export default function TasksTab({ defaultSubTab }) {
  const [searchParams, setSearchParams] = useSearchParams()
  const { user } = useAuth()
  const { employees } = useEmployees(user?.orgId)
  const { tasks, loading: tasksLoading, addTask, updateTask, deleteTask } = useTasks(user?.orgId)
  const { reminders, loading: remindersLoading, addReminder, dismissReminder, deleteReminder } = useReminders(user?.orgId)
  
  const loading = tasksLoading || remindersLoading
  
  const [activeTab, setActiveTab] = useState(defaultSubTab || 'team')
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
  
  // Quick edit popups & menus
  const [quickDatePicker, setQuickDatePicker] = useState(null) // taskId
  const [quickAssigneePicker, setQuickAssigneePicker] = useState(null) // taskId
  const [cardMenuOpen, setCardMenuOpen] = useState(null) // taskId
  const [priorityMenuOpen, setPriorityMenuOpen] = useState(null) // taskId
  const [searchQuery, setSearchQuery] = useState('')
  
  // Inline editing
  const [editingInlineTask, setEditingInlineTask] = useState(null)
  const [inlineEditValue, setInlineEditValue] = useState('')
  
  // Table view column visibility
  const [visibleColumns, setVisibleColumns] = useState({
    taskName: true,
    state: true,
    priority: true,
    assignees: true,
    dueDate: true,
    createdDate: false,
    updatedDate: false
  })
  const [showColumnMenu, setShowColumnMenu] = useState(false)
  
  // Table view filters
  const [tableFilters, setTableFilters] = useState({
    search: '',
    status: '',
    priority: '',
    assignee: ''
  })
  
  // Slide-over drawer for task editing
  const [showSideDrawer, setShowSideDrawer] = useState(false)
  const [drawerTask, setDrawerTask] = useState(null)
  
  // Table inline editing
  const [editingTableCell, setEditingTableCell] = useState(null) // {taskId, field}
  
  // Calendar inline add
  const [inlineAddingDate, setInlineAddingDate] = useState(null) // Date object
  const [inlineAddingValue, setInlineAddingValue] = useState('')
  
  // Calendar filters
  const [calendarPriorityFilter, setCalendarPriorityFilter] = useState('all')
  const [calendarAssigneeFilter, setCalendarAssigneeFilter] = useState('all')
  
  // Idea tab states
  const [ideaSearchTerm, setIdeaSearchTerm] = useState('')
  const [ideaFilter, setIdeaFilter] = useState('all')
  const [showAddIdeaModal, setShowAddIdeaModal] = useState(false)
  const [newIdea, setNewIdea] = useState({ title: '', bullets: [''] })
  
  // Close popovers and menus when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (!event.target.closest('.task-popover-container') && !event.target.closest('.status-menu-container')) {
        setStatusMenuOpen(null)
        setCardMenuOpen(null)
        setPriorityMenuOpen(null)
        setQuickDatePicker(null)
        setQuickAssigneePicker(null)
        setEditingTableCell(null)
        setShowColumnMenu(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])
  
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
    clientType: null,
    buzzer: false,
    repeat: { enabled: false, frequency: 'daily', interval: 1, daysOfWeek: [], endDate: null },
    reminder: { enabled: false, timing: 'at_due_date', customDate: null, alertType: 'notification' },
    checklists: []
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

  const normalizeTasksSubTab = (value) => {
    const v = (value || '').toLowerCase().trim()
    if (!v) return null
    if (v === 'announcements') return 'reminders'
    if (['team', 'personal', 'idea', 'reminders', 'checklist'].includes(v)) return v
    return null
  }

  const encodeTasksSubTab = (tabId) => (tabId === 'reminders' ? 'announcements' : tabId)

  useEffect(() => {
    const desired = normalizeTasksSubTab(searchParams.get('tasksTab'))
    if (!desired) return
    setActiveTab((prev) => (prev === desired ? prev : desired))
  }, [searchParams])

  useEffect(() => {
    const encoded = encodeTasksSubTab(activeTab)
    const currentEncoded = (searchParams.get('tasksTab') || '').toLowerCase().trim()
    if (currentEncoded === encoded) return

    const next = new URLSearchParams(searchParams)
    next.set('tab', 'tasks')
    next.set('tasksTab', encoded)
    setSearchParams(next, { replace: true })
  }, [activeTab, searchParams, setSearchParams])

  const [focusedColumn, setFocusedColumn] = useState(null)
  const [quickFilter, setQuickFilter] = useState('all') // 'all', 'today', 'me', 'high'

  // Keyboard Shortcuts
  useEffect(() => {
    const handleKeyDown = (e) => {
      // Don't trigger shortcuts if user is typing in an input/textarea
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') {
        if (e.key === 'Enter' && (e.metaKey || e.ctrlKey) && editingInlineTask) {
          handleStatusChange(editingInlineTask, 'Completed')
          setEditingInlineTask(null)
        }
        return
      }

      if (e.key.toLowerCase() === 'n') {
        e.preventDefault()
        setShowAddModal(true)
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [editingInlineTask])

  const filteredTasks = useMemo(() => {
    let tasksToFilter = tasks
    
    // Sub-tab filtering
    if (activeTab === 'idea') {
      tasksToFilter = tasksToFilter.filter(t => t.category === 'idea')
    } else if (activeTab === 'personal') {
      tasksToFilter = tasksToFilter.filter(t => t.isPersonal && t.category === 'task')
    } else {
      tasksToFilter = tasksToFilter.filter(t => !t.isPersonal && t.category === 'task')
    }

    // Search query filter (applies across board and table)
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim()
      tasksToFilter = tasksToFilter.filter(t => 
        t.title?.toLowerCase().includes(q) ||
        t.description?.toLowerCase().includes(q) ||
        t.clientName?.toLowerCase().includes(q) ||
        t.notes?.toLowerCase().includes(q)
      )
    }

    // Quick Filters
    if (quickFilter === 'today') {
      const today = new Date().toISOString().split('T')[0]
      tasksToFilter = tasksToFilter.filter(t => {
        if (!t.dueDate) return false
        const d = t.dueDate.toDate ? t.dueDate.toDate() : new Date(t.dueDate)
        return d.toISOString().split('T')[0] === today
      })
    } else if (quickFilter === 'me') {
      tasksToFilter = tasksToFilter.filter(t => (t.assignedTo || []).includes(user?.uid))
    } else if (quickFilter === 'high') {
      tasksToFilter = tasksToFilter.filter(t => t.priority === 'urgent' || t.priority === 'high')
    }

    if (clientFilter !== 'all') {
      if (clientFilter === 'internal') {
        tasksToFilter = tasksToFilter.filter(t => !t.clientName && !t.clientType)
      } else {
        tasksToFilter = tasksToFilter.filter(t => t.clientType === clientFilter)
      }
    }
    return tasksToFilter
  }, [tasks, activeTab, clientFilter, quickFilter, searchQuery, user?.uid])

  const taskEmployees = useMemo(() => {
    return employees.filter(emp => {
      if (emp.includeInTask === false || emp.assignInTask === false) return false
      if (emp.status && !isEmployeeActiveStatus(emp.status)) return false
      return true
    })
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
        buzzer: !!newTask.buzzer,
        repeat: newTask.repeat || { enabled: false },
        reminder: newTask.reminder || { enabled: false },
        checklists: newTask.checklists || [],
        isPersonal: isIdea ? false : (activeTab === 'personal'),
        category: isIdea ? 'idea' : 'task'
      })
      setShowAddModal(false)
      setNewTask({
        title: '', description: '', status: 'To Do', assignedTo: [],
        isPersonal: activeTab === 'personal', category: 'task',
        dueDate: null, priority: 'normal', notes: '',
        clientName: '', clientType: null,
        buzzer: false,
        repeat: { enabled: false, frequency: 'daily', interval: 1, daysOfWeek: [], endDate: null },
        reminder: { enabled: false, timing: 'at_due_date', customDate: null, alertType: 'notification' },
        checklists: []
      })
    } catch (err) {
      console.error('Failed to create task:', err)
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
      dueDate: task.dueDate ? (task.dueDate.toDate ? task.dueDate.toDate() : new Date(task.dueDate)) : null,
      buzzer: !!task.buzzer,
      repeat: task.repeat || { enabled: false, frequency: 'daily', interval: 1, daysOfWeek: [], endDate: null },
      reminder: task.reminder || { enabled: false, timing: 'at_due_date', customDate: null, alertType: 'notification' },
      checklists: Array.isArray(task.checklists) ? task.checklists : []
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
        category: editingTask.category,
        buzzer: !!editingTask.buzzer,
        repeat: editingTask.repeat || { enabled: false },
        reminder: editingTask.reminder || { enabled: false },
        checklists: editingTask.checklists || []
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
    return format(d, 'MMM d')
  }

  const getDueDateColor = (date) => {
    if (!date) return 'text-slate-400'
    const d = date.toDate ? date.toDate() : new Date(date)
    const now = new Date()
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
    const dueDay = new Date(d.getFullYear(), d.getMonth(), d.getDate())
    if (dueDay < today) return 'text-rose-600 bg-rose-50 border-rose-200'
    if (dueDay.getTime() === today.getTime()) return 'text-amber-700 bg-amber-50 border-amber-200'
    return 'text-slate-600 bg-slate-50 border-slate-200/70'
  }

  const getInitials = (name) => {
    if (!name) return '??'
    const parts = name.trim().split(/\s+/)
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
  }

  const getDueDateBadgeClass = (dueDate) => {
    if (!dueDate) return 'border border-dashed border-slate-300 text-slate-500 hover:bg-slate-50'
    const d = dueDate.toDate ? dueDate.toDate() : new Date(dueDate)
    const now = new Date()
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
    const dueDay = new Date(d.getFullYear(), d.getMonth(), d.getDate())
    if (dueDay < today) return 'bg-rose-50 text-rose-700 border border-rose-200/90'
    if (dueDay.getTime() === today.getTime()) return 'bg-amber-50 text-amber-700 border border-amber-200/90'
    return 'bg-amber-50 text-amber-700 border border-amber-200/60'
  }

  const getDueDateIconColor = (dueDate) => {
    if (!dueDate) return 'text-slate-400'
    const d = dueDate.toDate ? dueDate.toDate() : new Date(dueDate)
    const now = new Date()
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
    const dueDay = new Date(d.getFullYear(), d.getMonth(), d.getDate())
    if (dueDay < today) return 'text-rose-600'
    if (dueDay.getTime() === today.getTime()) return 'text-amber-600'
    return 'text-amber-600'
  }

  const toggleTaskCompletion = async (task) => {
    try {
      setAnimatingTaskId(task.id)
      const newStatus = task.status === 'Completed' ? 'To Do' : 'Completed'
      await updateTask(task.id, { status: newStatus })
      setTimeout(() => setAnimatingTaskId(null), 500)
    } catch (err) {
      console.error("Failed to toggle task completion:", err)
    }
  }

  // Side drawer functions
  const openSideDrawer = (task) => {
    setDrawerTask(task)
    setShowSideDrawer(true)
  }

  const closeSideDrawer = () => {
    setShowSideDrawer(false)
    setDrawerTask(null)
  }

  const handleDrawerSave = async () => {
    if (!drawerTask) return
    try {
      await updateTask(drawerTask.id, drawerTask)
      closeSideDrawer()
    } catch (err) {
      console.error('Failed to update task:', err)
      alert('Failed to save changes')
    }
  }

  // Calendar inline add
  const handleCalendarInlineAdd = async (date) => {
    if (!inlineAddingValue.trim()) return
    try {
      await addTask({
        title: inlineAddingValue,
        dueDate: date,
        status: 'To Do',
        priority: 'normal',
        assignedTo: [],
        isPersonal: activeTab === 'personal',
        category: 'task'
      })
      setInlineAddingValue('')
      setInlineAddingDate(null)
    } catch (err) {
      console.error('Failed to add task:', err)
      alert('Failed to create task')
    }
  }

  const MentionList = () => {
    if (!mentionState.active || filteredMentions.length === 0) return null
    return (
      <div className="absolute z-[100] mt-1 w-64 bg-white border border-slate-200 rounded-xl shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        <div className="bg-slate-50 px-3 py-2 border-b border-slate-100">
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest font-heading">Assign Personnel</span>
        </div>
        <div className="max-h-60 overflow-y-auto">
          {filteredMentions.map(emp => (
            <button
              key={emp.id}
              onClick={() => applyMention(emp)}
              className="w-full text-left px-3.5 py-2 flex items-center gap-2.5 hover:bg-blue-50/60 transition-colors border-b border-slate-50 last:border-0 font-body"
            >
              <div className="w-6 h-6 rounded-full bg-blue-50 text-blue-700 flex items-center justify-center text-[9px] font-bold font-mono">
                {getInitials(emp.name)}
              </div>
              <div className="flex flex-col min-w-0">
                <span className="text-[12px] font-semibold text-slate-800 truncate">{emp.name}</span>
                <span className="text-[10px] text-slate-400 font-medium">{emp.department || 'Team'}</span>
              </div>
            </button>
          ))}
        </div>
      </div>
    )
  }

  const renderBoardView = () => {
    // Reorder statuses to put 'Completed' at the far right
    const reorderedStatuses = [
      ...STATUSES.filter(s => s.id !== 'Completed'),
      ...STATUSES.filter(s => s.id === 'Completed')
    ]

    return (
      <main className="flex-1 w-full bg-[#f8fafc]/60 px-4 pb-4 pt-1 overflow-x-auto no-scrollbar" data-purpose="kanban-container">
        <div className="w-full flex items-start gap-3">
          {reorderedStatuses.map(status => {
            const columnTasks = filteredTasks.filter(t => t.status === status.id || (status.id === 'To Do' && (t.status === 'Inbox' || t.status === 'To-do')))
            const isCompletedColumn = status.id === 'Completed'
            
            return (
              <section 
                key={status.id} 
                className={`bg-slate-100/60 border border-slate-200/80 rounded-2xl p-3 flex flex-col min-h-[580px] gap-2.5 shadow-2xs w-[290px] min-w-[290px] shrink-0 transition-all duration-200 ${isCompletedColumn ? 'opacity-95' : ''}`}
                data-purpose={`kanban-column-${status.id.toLowerCase().replace(/\s+/g, '')}`}
                onDragOver={(e) => {
                  e.preventDefault()
                  e.dataTransfer.dropEffect = 'move'
                }}
                onDrop={async (e) => {
                  e.preventDefault()
                  if (!draggedTaskId) return
                  await updateTask(draggedTaskId, { status: status.id })
                  setDraggedTaskId(null)
                }}
              >
                {/* Column Header */}
                <div className="flex items-center justify-between px-1 py-0.5">
                  <div className="flex items-center gap-2">
                    {status.icon}
                    <h2 className="text-xs font-semibold text-slate-800">{status.label}</h2>
                    <span className="px-1.5 py-0.2 rounded-full text-[11px] font-medium bg-slate-200/70 text-slate-600 font-mono">
                      {columnTasks.length}
                    </span>
                  </div>
                  <button 
                    type="button"
                    onClick={() => { setNewTask({ ...newTask, status: status.id }); setShowAddModal(true); }} 
                    aria-label={`Add task to ${status.label}`}
                    className="text-slate-400 hover:text-slate-700 transition-colors p-0.5"
                    title={`Add task to ${status.label}`}
                  >
                    <Plus size={16} />
                  </button>
                </div>

                {/* Quick Add Box */}
                <div className="bg-white border border-dashed border-slate-200 rounded-xl p-3 hover:border-slate-300 focus-within:border-blue-500 focus-within:ring-1 focus-within:ring-blue-500/20 transition-all cursor-text group relative">
                  <div className="flex items-center gap-1.5 text-xs text-slate-400 group-hover:text-slate-600 mb-2.5">
                    <Plus size={14} className="shrink-0" />
                    <input
                      type="text"
                      placeholder={`Add task to ${status.label}...`}
                      className="w-full bg-transparent text-xs font-medium text-slate-800 placeholder:text-slate-400 outline-none"
                      value={inlineInputs[status.id] || ''}
                      onChange={(e) => handleTextChange('inline', e.target.value, status.id)}
                      onKeyDown={(e) => handleInlineCreate(status.id, e)}
                    />
                  </div>
                  <div className="flex items-center justify-between text-[10px] text-slate-400 font-normal">
                    <span>Press Enter ↵ to add</span>
                    <span>@ to assign</span>
                  </div>
                  {mentionState.active && mentionState.targetId === status.id && (
                    <div className="absolute top-full left-0 z-50 mt-1">
                      <MentionList />
                    </div>
                  )}
                </div>

                {/* Task Cards Container */}
                <div className="flex flex-col gap-2">
                  {columnTasks.map(task => {
                    const assignees = getAssigneeInfo(task.assignedTo)
                    const dueDateText = formatDueDate(task.dueDate)
                    const isAnimating = animatingTaskId === task.id
                    const isCurrentDragging = draggedTaskId === task.id
                    
                    return (
                      <article
                        key={task.id}
                        draggable
                        onDragStart={(e) => {
                          setDraggedTaskId(task.id)
                          e.dataTransfer.setData('text/plain', task.id)
                          e.dataTransfer.effectAllowed = 'move'
                        }}
                        onDragEnd={() => setDraggedTaskId(null)}
                        onClick={() => openEditModal(task)}
                        className={`bg-white border border-slate-200/90 rounded-xl p-3 shadow-xs hover:border-slate-300 hover:shadow-sm transition-all duration-150 cursor-pointer group relative ${
                          isCurrentDragging ? 'opacity-40 scale-[0.98] border-blue-400' : ''
                        } ${isAnimating ? 'animate-pulse scale-95' : ''}`}
                        data-purpose="task-card"
                      >
                        <div className="flex items-start gap-2.5">
                          {/* Circle Checkbox Button */}
                          <button
                            type="button"
                            aria-label={task.status === 'Completed' ? 'Completed task' : 'Mark task complete'}
                            onClick={(e) => {
                              e.stopPropagation()
                              toggleTaskCompletion(task)
                            }}
                            className={`mt-0.5 w-4 h-4 rounded-full border shrink-0 transition-colors flex items-center justify-center ${
                              task.status === 'Completed'
                                ? 'border-emerald-500 bg-emerald-500 text-white'
                                : 'border-slate-300 hover:border-slate-400 bg-white text-transparent hover:text-slate-300'
                            }`}
                            title={task.status === 'Completed' ? 'Completed (Click to uncomplete)' : 'Mark complete'}
                          >
                            <Check size={10} strokeWidth={3} />
                          </button>

                          <div className="flex-1 min-w-0">
                            {/* Title (or inline edit input) & Hover Action Menu Trigger */}
                            <div className="flex items-start justify-between gap-1">
                              {editingInlineTask === task.id ? (
                                <input
                                  type="text"
                                  value={inlineEditValue}
                                  onChange={(e) => setInlineEditValue(e.target.value)}
                                  onKeyDown={handleInlineEdit}
                                  onBlur={() => setEditingInlineTask(null)}
                                  autoFocus
                                  onClick={(e) => e.stopPropagation()}
                                  className="w-full bg-slate-50 border border-blue-500 rounded px-1.5 py-0.5 text-xs font-semibold text-slate-900 outline-none"
                                />
                              ) : (
                                <h3
                                  onDoubleClick={(e) => {
                                    e.stopPropagation()
                                    startInlineEdit(task)
                                  }}
                                  className={`text-xs font-semibold text-slate-800 leading-snug line-clamp-2 transition-colors ${
                                    task.status === 'Completed' ? 'line-through text-slate-400' : 'group-hover:text-blue-600'
                                  }`}
                                  title={task.title}
                                >
                                  {task.title}
                                </h3>
                              )}

                              {/* Quick hover menu button */}
                              <div className="task-popover-container relative shrink-0 -mr-1 -mt-1" onClick={(e) => e.stopPropagation()}>
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation()
                                    setCardMenuOpen(cardMenuOpen === task.id ? null : task.id)
                                  }}
                                  className="w-5 h-5 rounded flex items-center justify-center text-slate-400 hover:text-slate-700 hover:bg-slate-100 opacity-0 group-hover:opacity-100 transition-all"
                                  title="More actions"
                                >
                                  <MoreHorizontal size={13} />
                                </button>

                                {cardMenuOpen === task.id && (
                                  <div className="absolute right-0 top-full mt-1 w-36 bg-white border border-slate-200 rounded-xl shadow-xl z-50 py-1 animate-in fade-in zoom-in-95 duration-150">
                                    <button
                                      type="button"
                                      onClick={(e) => {
                                        e.stopPropagation()
                                        setCardMenuOpen(null)
                                        openEditModal(task)
                                      }}
                                      className="w-full text-left px-3 py-1.5 text-[12px] font-medium text-slate-700 hover:bg-slate-50 flex items-center gap-2"
                                    >
                                      <Edit3 size={13} className="text-slate-400" /> Edit
                                    </button>
                                    <button
                                      type="button"
                                      onClick={(e) => {
                                        e.stopPropagation()
                                        setCardMenuOpen(null)
                                        startInlineEdit(task)
                                      }}
                                      className="w-full text-left px-3 py-1.5 text-[12px] font-medium text-slate-700 hover:bg-slate-50 flex items-center gap-2"
                                    >
                                      <FileText size={13} className="text-slate-400" /> Rename
                                    </button>
                                    <div className="my-1 border-t border-slate-100" />
                                    <button
                                      type="button"
                                      onClick={async (e) => {
                                        e.stopPropagation()
                                        setCardMenuOpen(null)
                                        if (confirm('Delete this task?')) deleteTask(task.id)
                                      }}
                                      className="w-full text-left px-3 py-1.5 text-[12px] font-medium text-rose-600 hover:bg-rose-50 flex items-center gap-2"
                                    >
                                      <Trash2 size={13} className="text-rose-500" /> Delete
                                    </button>
                                  </div>
                                )}
                              </div>
                            </div>

                            {/* Optional Client / Project Identifier Badge */}
                            {(task.clientName || task.clientType) && (
                              <div className="mt-1.5 flex items-center gap-1.5 flex-wrap">
                                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-slate-100/80 border border-slate-200/70 text-[10px] font-medium text-slate-600">
                                  {task.clientType && (
                                    <span>{CLIENT_TYPES.find(c => c.id === task.clientType)?.icon || '🏢'}</span>
                                  )}
                                  <span className="truncate max-w-[170px]">{task.clientName || task.clientType}</span>
                                </span>
                              </div>
                            )}

                            {/* Bottom Metadata: Priority, Due Date, Avatar Group */}
                            <div className="flex items-center justify-between mt-3 pt-0.5">
                              <div className="flex items-center gap-1.5 flex-wrap">
                                {/* Priority Pill */}
                                <div className="task-popover-container relative" onClick={(e) => e.stopPropagation()}>
                                  <button
                                    type="button"
                                    onClick={(e) => { 
                                      e.stopPropagation()
                                      setPriorityMenuOpen(priorityMenuOpen === task.id ? null : task.id)
                                    }}
                                    className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-medium border transition-all ${
                                      task.priority === 'urgent'
                                        ? 'bg-rose-50 border-rose-200/90 text-rose-700'
                                        : task.priority === 'high'
                                        ? 'bg-amber-50 border-amber-200/90 text-amber-700'
                                        : 'bg-slate-100/90 text-slate-600 border-slate-200/60 hover:bg-slate-200/60'
                                    }`}
                                    title={`Priority: ${task.priority || 'Normal'}`}
                                  >
                                    <span className={`w-1.5 h-1.5 rounded-full ${
                                      task.priority === 'urgent' ? 'bg-rose-600' : task.priority === 'high' ? 'bg-amber-600' : 'bg-slate-400'
                                    }`}></span>
                                    <span className="capitalize">{task.priority || 'Normal'}</span>
                                  </button>

                                  {priorityMenuOpen === task.id && (
                                    <div className="absolute left-0 top-full mt-1 w-32 bg-white border border-slate-200 rounded-xl shadow-xl z-50 py-1 animate-in fade-in zoom-in-95 duration-150">
                                      {['urgent', 'high', 'normal'].map((p) => (
                                        <button
                                          key={p}
                                          type="button"
                                          onClick={async (e) => {
                                            e.stopPropagation()
                                            await updateTask(task.id, { priority: p })
                                            setPriorityMenuOpen(null)
                                          }}
                                          className={`w-full text-left px-3 py-1.5 text-[11px] font-medium flex items-center gap-2 hover:bg-slate-50 transition-colors ${task.priority === p ? 'text-blue-600 bg-blue-50/50 font-semibold' : 'text-slate-700'}`}
                                        >
                                          <span className={`w-1.5 h-1.5 rounded-full ${p === 'urgent' ? 'bg-rose-600' : p === 'high' ? 'bg-amber-600' : 'bg-slate-400'}`}></span>
                                          <span className="capitalize">{p}</span>
                                          {task.priority === p && <Check size={11} className="text-blue-600 ml-auto" />}
                                        </button>
                                      ))}
                                    </div>
                                  )}
                                </div>

                                {/* Due Date Pill */}
                                <div className="task-popover-container relative" onClick={(e) => e.stopPropagation()}>
                                  <button
                                    type="button"
                                    onClick={(e) => { 
                                      e.stopPropagation()
                                      setQuickDatePicker(quickDatePicker === task.id ? null : task.id)
                                    }}
                                    className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-medium border transition-all ${
                                      task.dueDate
                                        ? getDueDateBadgeClass(task.dueDate)
                                        : 'border-dashed border-slate-300 text-slate-500 font-normal hover:bg-slate-50'
                                    }`}
                                    title={task.dueDate ? `Due: ${dueDateText}` : 'Set due date'}
                                  >
                                    <svg className={`w-3 h-3 ${getDueDateIconColor(task.dueDate)}`} fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                                      <circle cx="12" cy="12" r="9"></circle>
                                      <path d="M12 7v5l3 2" strokeLinecap="round"></path>
                                    </svg>
                                    <span className="tabular-nums">{dueDateText || 'Due date'}</span>
                                  </button>

                                  {quickDatePicker === task.id && (
                                    <div className="absolute left-0 top-full mt-1 z-50 bg-white border border-slate-200 rounded-xl shadow-xl p-2 animate-in fade-in zoom-in-95 duration-150">
                                      <DatePicker
                                        selected={task.dueDate ? (task.dueDate.toDate ? task.dueDate.toDate() : new Date(task.dueDate)) : new Date()}
                                        onChange={(date) => handleQuickDateChange(task.id, date)}
                                        onClickOutside={() => setQuickDatePicker(null)}
                                        inline
                                      />
                                    </div>
                                  )}
                                </div>
                              </div>

                              {/* Assignee Avatar Stack */}
                              <div className="task-popover-container relative shrink-0" onClick={(e) => e.stopPropagation()}>
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation()
                                    setQuickAssigneePicker(quickAssigneePicker === task.id ? null : task.id)
                                  }}
                                  className="flex items-center gap-1 hover:opacity-85 transition-opacity"
                                  title="Manage assignees"
                                >
                                  {assignees.length > 0 ? (
                                    <div className="flex items-center -space-x-1.5">
                                      {assignees.slice(0, 3).map((emp, idx) => {
                                        const colors = [
                                          'bg-blue-100 text-blue-700',
                                          'bg-amber-100 text-amber-700',
                                          'bg-emerald-100 text-emerald-700',
                                          'bg-purple-100 text-purple-700'
                                        ]
                                        const colorClass = colors[idx % colors.length]
                                        return (
                                          <span
                                            key={emp.id}
                                            className={`w-5 h-5 rounded-full ${colorClass} flex items-center justify-center ring-2 ring-white text-[9px] font-bold font-mono`}
                                            title={emp.name}
                                          >
                                            {getInitials(emp.name)}
                                          </span>
                                        )
                                      })}
                                      {assignees.length > 3 && (
                                        <span className="w-5 h-5 rounded-full bg-slate-200 text-slate-700 flex items-center justify-center ring-2 ring-white text-[9px] font-bold font-mono">
                                          +{assignees.length - 3}
                                        </span>
                                      )}
                                    </div>
                                  ) : (
                                    <span className="w-5 h-5 rounded-full border border-dashed border-slate-300 text-slate-400 flex items-center justify-center hover:border-slate-400 hover:text-slate-600 transition-colors">
                                      <User size={10} />
                                    </span>
                                  )}
                                </button>

                                {quickAssigneePicker === task.id && (
                                  <div className="absolute right-0 top-full mt-1 w-48 bg-white border border-slate-200 rounded-xl shadow-xl z-50 py-1.5 max-h-60 overflow-y-auto animate-in fade-in zoom-in-95 duration-150">
                                    <div className="px-3 py-1.5 text-[10px] font-bold text-slate-400 uppercase tracking-widest border-b border-slate-100 font-heading">Assign Members</div>
                                    {taskEmployees.map((emp) => {
                                      const isAssigned = (task.assignedTo || []).includes(emp.id)
                                      return (
                                        <button
                                          key={emp.id}
                                          type="button"
                                          onClick={async (e) => {
                                            e.stopPropagation()
                                            handleQuickAssigneeChange(task.id, emp.id)
                                          }}
                                          className={`w-full text-left px-3 py-1.5 text-[11px] font-medium flex items-center justify-between hover:bg-slate-50 transition-colors ${
                                            isAssigned ? 'text-blue-600 bg-blue-50/50 font-semibold' : 'text-slate-700'
                                          }`}
                                        >
                                          <div className="flex items-center gap-2">
                                            <div className="w-5 h-5 rounded-full bg-slate-100 text-slate-700 text-[8px] font-bold flex items-center justify-center font-mono">
                                              {getInitials(emp.name)}
                                            </div>
                                            <span className="truncate max-w-[110px]">{emp.name}</span>
                                          </div>
                                          {isAssigned && <Check size={12} className="text-blue-600" />}
                                        </button>
                                      )
                                    })}
                                  </div>
                                )}
                              </div>
                            </div>
                          </div>
                        </div>
                      </article>
                    )
                  })}
                </div>
              </section>
            )
          })}
        </div>
      </main>
    )
  }


  const renderTableView = () => {
    const columnCount = Object.values(visibleColumns).filter(Boolean).length + 1 // +1 for actions
    
    // Filter tasks based on table filters
    const tableFilteredTasks = filteredTasks.filter(task => {
      if (tableFilters.search && !task.title?.toLowerCase().includes(tableFilters.search.toLowerCase())) return false
      if (tableFilters.status && task.status !== tableFilters.status) return false
      if (tableFilters.priority && task.priority !== tableFilters.priority) return false
      if (tableFilters.assignee && !(task.assignedTo || []).includes(tableFilters.assignee)) return false
      return true
    })
    
    return (
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-xs font-body">
        {/* Filters & Display Row */}
        <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 border-b border-slate-200/80 bg-slate-50/40">
          {/* Filters */}
          <div className="flex items-center gap-2 flex-wrap">
            {/* Search */}
            <div className="relative">
              <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
              <input
                type="text"
                placeholder="Filter table..."
                value={tableFilters.search}
                onChange={(e) => setTableFilters(prev => ({ ...prev, search: e.target.value }))}
                className="pl-8 pr-3 h-9 w-44 bg-white border border-slate-200 rounded-md text-xs text-slate-800 placeholder:text-slate-400 focus-visible:ring-1 focus-visible:ring-blue-600 focus:outline-none"
              />
            </div>
            
            {/* Status Filter */}
            <select
              value={tableFilters.status}
              onChange={(e) => setTableFilters(prev => ({ ...prev, status: e.target.value }))}
              className="h-9 px-2.5 bg-white border border-slate-200 rounded-md text-xs text-slate-700 focus-visible:ring-1 focus-visible:ring-blue-600 focus:outline-none cursor-pointer"
            >
              <option value="">All Status</option>
              {STATUSES.map(s => (
                <option key={s.id} value={s.id}>{s.label}</option>
              ))}
            </select>
            
            {/* Priority Filter */}
            <select
              value={tableFilters.priority}
              onChange={(e) => setTableFilters(prev => ({ ...prev, priority: e.target.value }))}
              className="h-9 px-2.5 bg-white border border-slate-200 rounded-md text-xs text-slate-700 focus-visible:ring-1 focus-visible:ring-blue-600 focus:outline-none cursor-pointer"
            >
              <option value="">All Priority</option>
              <option value="urgent">Urgent</option>
              <option value="high">High</option>
              <option value="normal">Normal</option>
            </select>
            
            {/* Assignee Filter */}
            <select
              value={tableFilters.assignee}
              onChange={(e) => setTableFilters(prev => ({ ...prev, assignee: e.target.value }))}
              className="h-9 px-2.5 bg-white border border-slate-200 rounded-md text-xs text-slate-700 focus-visible:ring-1 focus-visible:ring-blue-600 focus:outline-none cursor-pointer"
            >
              <option value="">All Assignees</option>
              {taskEmployees.map(emp => (
                <option key={emp.id} value={emp.id}>{emp.name}</option>
              ))}
            </select>
            
            {/* Clear Filters */}
            {(tableFilters.search || tableFilters.status || tableFilters.priority || tableFilters.assignee) && (
              <button
                type="button"
                onClick={() => setTableFilters({ search: '', status: '', priority: '', assignee: '' })}
                className="h-9 px-2.5 text-xs font-semibold text-slate-500 hover:text-slate-800 hover:bg-slate-100/60 rounded-md transition-colors"
              >
                Clear
              </button>
            )}
          </div>
          
          {/* Display Button */}
          <div className="relative task-popover-container">
            <button
              type="button"
              onClick={() => setShowColumnMenu(!showColumnMenu)}
              className="h-9 px-3 bg-white border border-slate-200 rounded-md text-xs font-semibold font-heading text-slate-700 hover:bg-slate-50 flex items-center gap-2 shadow-xs transition-colors"
            >
              <Layout size={13} />
              Display
            </button>
            {showColumnMenu && (
              <div className="absolute right-0 top-full mt-1.5 w-48 bg-white border border-slate-200 rounded-xl shadow-xl z-50 py-1.5">
                <div className="px-3 py-1.5 text-[10px] font-bold text-slate-400 uppercase tracking-widest border-b border-slate-100 font-heading">
                  Show Columns
                </div>
                {Object.entries(visibleColumns).map(([col, visible]) => (
                  <button
                    key={col}
                    type="button"
                    onClick={() => setVisibleColumns(prev => ({ ...prev, [col]: !prev[col] }))}
                    className="w-full flex items-center gap-2.5 px-3 py-1.5 text-xs text-slate-700 hover:bg-slate-50 transition-colors"
                  >
                    <div className={`w-3.5 h-3.5 rounded border ${visible ? 'bg-blue-600 border-blue-600' : 'border-slate-300'} flex items-center justify-center transition-colors`}>
                      {visible && <Check size={11} className="text-white" />}
                    </div>
                    {col === 'taskName' && 'Task Name'}
                    {col === 'state' && 'State'}
                    {col === 'priority' && 'Priority'}
                    {col === 'assignees' && 'Assignees'}
                    {col === 'dueDate' && 'Due Date'}
                    {col === 'createdDate' && 'Created'}
                    {col === 'updatedDate' && 'Updated'}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
        
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse min-w-[900px]">
            <thead>
              <tr className="bg-slate-50/70 border-b border-slate-200 h-10">
                {visibleColumns.taskName && (
                  <th className="px-5 text-[11px] font-bold text-slate-500 uppercase tracking-wider font-heading w-[35%]">Task Name</th>
                )}
                {visibleColumns.state && (
                  <th className="px-4 text-[11px] font-bold text-slate-500 uppercase tracking-wider font-heading">State</th>
                )}
                {visibleColumns.priority && (
                  <th className="px-4 text-[11px] font-bold text-slate-500 uppercase tracking-wider font-heading">Priority</th>
                )}
                {visibleColumns.assignees && (
                  <th className="px-4 text-[11px] font-bold text-slate-500 uppercase tracking-wider font-heading">Assignees</th>
                )}
                {visibleColumns.dueDate && (
                  <th className="px-4 text-[11px] font-bold text-slate-500 uppercase tracking-wider font-heading">Due Date</th>
                )}
                {visibleColumns.createdDate && (
                  <th className="px-4 text-[11px] font-bold text-slate-500 uppercase tracking-wider font-heading">Created</th>
                )}
                {visibleColumns.updatedDate && (
                  <th className="px-4 text-[11px] font-bold text-slate-500 uppercase tracking-wider font-heading">Updated</th>
                )}
                <th className="px-4 text-[11px] font-bold text-slate-500 uppercase tracking-wider font-heading text-right w-[60px]"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {tableFilteredTasks.length === 0 ? (
                <tr>
                  <td colSpan={columnCount} className="py-16 text-center text-slate-400 font-medium text-xs">
                    No tasks match the filter criteria
                  </td>
                </tr>
              ) : (
                tableFilteredTasks.map(task => (
                  <tr key={task.id} className="hover:bg-slate-50/60 transition-colors group">
                    {visibleColumns.taskName && (
                      <td className="px-5 py-3">
                        <div 
                          onClick={() => openSideDrawer(task)}
                          className={`text-[13px] font-semibold text-slate-900 font-heading cursor-pointer hover:text-blue-600 transition-colors ${task.status === 'Completed' ? 'line-through text-slate-400 font-normal' : ''}`}
                        >
                          {task.title}
                        </div>
                      </td>
                    )}
                    {visibleColumns.state && (
                      <td className="px-4 py-3">
                        <div className="relative task-popover-container">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation()
                              setEditingTableCell(editingTableCell?.taskId === task.id && editingTableCell?.field === 'status' ? null : { taskId: task.id, field: 'status' })
                            }}
                            className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-medium transition-all ${
                              task.status === 'Completed' ? 'bg-emerald-50 text-emerald-700 border border-emerald-200/70' :
                              task.status === 'In Progress' ? 'bg-blue-50 text-blue-700 border border-blue-200/70' :
                              task.status === 'On Hold' ? 'bg-amber-50 text-amber-700 border border-amber-200/70' :
                              'bg-slate-50 text-slate-600 border border-slate-200'
                            }`}
                          >
                            <span className="w-1.5 h-1.5 rounded-full bg-current"></span>
                            {task.status}
                          </button>
                          {editingTableCell?.taskId === task.id && editingTableCell?.field === 'status' && (
                            <div className="absolute top-full left-0 mt-1 w-40 bg-white border border-slate-200 rounded-xl shadow-xl z-50 py-1">
                              {STATUSES.map(s => (
                                <button
                                  key={s.id}
                                  type="button"
                                  onClick={async () => {
                                    await updateTask(task.id, { status: s.id })
                                    setEditingTableCell(null)
                                  }}
                                  className="w-full text-left px-3 py-1.5 text-xs font-medium flex items-center gap-2 hover:bg-slate-50 transition-colors text-slate-700"
                                >
                                  {s.icon}
                                  {s.label}
                                </button>
                              ))}
                            </div>
                          )}
                        </div>
                      </td>
                    )}
                    {visibleColumns.priority && (
                      <td className="px-4 py-3">
                        <div className="relative task-popover-container">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation()
                              setEditingTableCell(editingTableCell?.taskId === task.id && editingTableCell?.field === 'priority' ? null : { taskId: task.id, field: 'priority' })
                            }}
                            className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-medium transition-all border ${
                              task.priority === 'urgent' ? 'bg-red-50 text-red-700 border-red-200/80' :
                              task.priority === 'high' ? 'bg-amber-50 text-amber-700 border-amber-200/80' :
                              'bg-slate-50 text-slate-600 border-slate-200/80'
                            }`}
                          >
                            <span className={`w-1.5 h-1.5 rounded-full ${
                              task.priority === 'urgent' ? 'bg-red-500' :
                              task.priority === 'high' ? 'bg-amber-500' :
                              'bg-slate-400'
                            }`}></span>
                            <span className="capitalize">{task.priority || 'Normal'}</span>
                          </button>
                          {editingTableCell?.taskId === task.id && editingTableCell?.field === 'priority' && (
                            <div className="absolute top-full left-0 mt-1 w-32 bg-white border border-slate-200 rounded-xl shadow-xl z-50 py-1">
                              {['urgent', 'high', 'normal'].map((p) => (
                                <button
                                  key={p}
                                  type="button"
                                  onClick={async () => {
                                    await updateTask(task.id, { priority: p })
                                    setEditingTableCell(null)
                                  }}
                                  className="w-full text-left px-3 py-1.5 text-xs font-medium capitalize hover:bg-slate-50 transition-colors text-slate-700 flex items-center gap-2"
                                >
                                  <span className={`w-1.5 h-1.5 rounded-full ${
                                    p === 'urgent' ? 'bg-red-500' :
                                    p === 'high' ? 'bg-amber-500' :
                                    'bg-slate-400'
                                  }`}></span>
                                  {p}
                                </button>
                              ))}
                            </div>
                          )}
                        </div>
                      </td>
                    )}
                    {visibleColumns.assignees && (
                      <td className="px-4 py-3">
                        <div className="relative task-popover-container">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation()
                              setEditingTableCell(editingTableCell?.taskId === task.id && editingTableCell?.field === 'assignees' ? null : { taskId: task.id, field: 'assignees' })
                            }}
                            className="flex items-center gap-1 hover:opacity-75 transition-opacity"
                          >
                            {getAssigneeInfo(task.assignedTo).length > 0 ? (
                              <div className="flex items-center gap-1.5">
                                <div className="flex -space-x-1.5">
                                  {getAssigneeInfo(task.assignedTo).slice(0, 3).map(emp => (
                                    <div key={emp.id} className="w-5 h-5 rounded-full bg-slate-100 text-slate-700 text-[8px] font-bold font-mono border-2 border-white flex items-center justify-center">
                                      {getInitials(emp.name)}
                                    </div>
                                  ))}
                                </div>
                                {getAssigneeInfo(task.assignedTo).length > 3 && (
                                  <span className="text-[10px] text-slate-500 font-mono">+{getAssigneeInfo(task.assignedTo).length - 3}</span>
                                )}
                              </div>
                            ) : (
                              <span className="text-xs text-slate-400 flex items-center gap-1">
                                <User size={12} />
                                Unassigned
                              </span>
                            )}
                          </button>
                          {editingTableCell?.taskId === task.id && editingTableCell?.field === 'assignees' && (
                            <div className="absolute top-full left-0 mt-1 w-48 bg-white border border-slate-200 rounded-xl shadow-xl z-50 py-1.5 max-h-60 overflow-y-auto">
                              <div className="px-3 py-1.5 text-[10px] font-bold text-slate-400 uppercase tracking-widest font-heading border-b border-slate-100">
                                Assign Members
                              </div>
                              {taskEmployees.map(emp => {
                                const isAssigned = (task.assignedTo || []).includes(emp.id)
                                return (
                                  <button
                                    key={emp.id}
                                    type="button"
                                    onClick={async () => {
                                      const currentAssignees = task.assignedTo || []
                                      const newAssignees = isAssigned 
                                        ? currentAssignees.filter(id => id !== emp.id)
                                        : [...currentAssignees, emp.id]
                                      await updateTask(task.id, { assignedTo: newAssignees })
                                    }}
                                    className={`w-full flex items-center justify-between px-3 py-1.5 text-xs transition-colors ${isAssigned ? 'bg-blue-50/50 text-blue-600 font-medium' : 'hover:bg-slate-50 text-slate-700'}`}
                                  >
                                    <div className="flex items-center gap-2">
                                      <div className="w-5 h-5 rounded-full bg-slate-100 text-slate-700 text-[8px] font-bold font-mono flex items-center justify-center">
                                        {getInitials(emp.name)}
                                      </div>
                                      <span className="truncate max-w-[110px]">{emp.name}</span>
                                    </div>
                                    {isAssigned && <Check size={12} className="text-blue-600" />}
                                  </button>
                                )
                              })}
                            </div>
                          )}
                        </div>
                      </td>
                    )}
                    {visibleColumns.dueDate && (
                      <td className="px-4 py-3 text-xs font-mono tabular-nums">
                        {task.dueDate ? (
                          <span className={`inline-flex items-center gap-1 ${getDueDateColor(task.dueDate)}`}>
                            <CalendarIcon size={11} />
                            {formatDueDate(task.dueDate)}
                          </span>
                        ) : (
                          <span className="text-slate-400">—</span>
                        )}
                      </td>
                    )}
                    {visibleColumns.createdDate && (
                      <td className="px-4 py-3 text-xs text-slate-500 font-mono tabular-nums">
                        {task.createdAt ? format(task.createdAt.toDate ? task.createdAt.toDate() : new Date(task.createdAt), 'MMM d, yyyy') : '—'}
                      </td>
                    )}
                    {visibleColumns.updatedDate && (
                      <td className="px-4 py-3 text-xs text-slate-500 font-mono tabular-nums">
                        {task.updatedAt ? format(task.updatedAt.toDate ? task.updatedAt.toDate() : new Date(task.updatedAt), 'MMM d, yyyy') : '—'}
                      </td>
                    )}
                    <td className="px-4 py-3 text-right">
                      <button 
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation()
                          openEditModal(task)
                        }}
                        className="text-slate-400 hover:text-slate-700 hover:bg-slate-100 p-1.5 rounded-md transition-colors"
                        title="Edit task"
                      >
                        <MoreHorizontal size={15} />
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
  }

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
      <div className="space-y-6 font-body">
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
          {[
            { label: 'Total Tasks', value: stats.total, color: 'text-slate-800' },
            { label: 'Completion Rate', value: `${rate}%`, color: 'text-blue-600' },
            { label: 'Urgent Tasks', value: stats.urgent, color: 'text-red-600' },
            { label: 'Past Deadline', value: stats.overdue, color: 'text-amber-600' }
          ].map(s => (
            <div key={s.label} className="bg-white border border-slate-200 p-5 rounded-xl shadow-xs">
              <p className="text-[11px] font-bold text-slate-500 uppercase tracking-wider font-heading mb-1.5">{s.label}</p>
              <p className={`text-2xl font-extrabold ${s.color} font-heading tracking-tight`}>{s.value}</p>
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
    
    // Filter tasks with calendar filters
    const visibleTasks = filteredTasks.filter(task => {
      if (!task.dueDate) return false
      if (task.status === 'Completed' && !statusFilter['Completed']) return false
      if (statusFilter[task.status] === false) return false
      if (calendarPriorityFilter !== 'all' && task.priority !== calendarPriorityFilter) return false
      if (calendarAssigneeFilter !== 'all' && !(task.assignedTo || []).includes(calendarAssigneeFilter)) return false
      return true
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
      <div className="h-full flex flex-col bg-white rounded-xl border border-slate-200 overflow-hidden shadow-xs font-body">
        {/* Calendar Header */}
        <div className="flex flex-wrap items-center justify-between px-6 py-3.5 border-b border-slate-200/80 bg-slate-50/40 gap-3">
          <div className="flex items-center gap-3">
            <h2 className="text-base font-bold text-slate-900 font-heading">{monthName}</h2>
            <div className="flex items-center gap-1">
              <button 
                type="button"
                onClick={handlePrevMonth}
                className="p-1 hover:bg-slate-200/60 rounded-md transition-colors"
                title="Previous month"
              >
                <ChevronLeft size={16} className="text-slate-600" />
              </button>
              <button 
                type="button"
                onClick={handleNextMonth}
                className="p-1 hover:bg-slate-200/60 rounded-md transition-colors"
                title="Next month"
              >
                <ChevronRight size={16} className="text-slate-600" />
              </button>
            </div>
          </div>
          
          {/* Filters */}
          <div className="flex items-center gap-2.5 flex-wrap">
            {/* Priority Filter */}
            <select
              value={calendarPriorityFilter}
              onChange={(e) => setCalendarPriorityFilter(e.target.value)}
              className="h-8 px-2.5 bg-white border border-slate-200 rounded-md text-xs font-medium text-slate-700 outline-none focus-visible:ring-1 focus-visible:ring-blue-600 cursor-pointer"
            >
              <option value="all">All Priorities</option>
              <option value="urgent">🔴 Urgent</option>
              <option value="high">📊 High</option>
              <option value="normal">○ Normal</option>
            </select>
            
            {/* Assignee Filter */}
            <select
              value={calendarAssigneeFilter}
              onChange={(e) => setCalendarAssigneeFilter(e.target.value)}
              className="h-8 px-2.5 bg-white border border-slate-200 rounded-md text-xs font-medium text-slate-700 outline-none focus-visible:ring-1 focus-visible:ring-blue-600 cursor-pointer"
            >
              <option value="all">All Assignees</option>
              {taskEmployees.map(emp => (
                <option key={emp.id} value={emp.id}>{emp.name}</option>
              ))}
            </select>
            
            <div className="h-4 w-px bg-slate-200"></div>
            
            {/* Status Filter Toggle */}
            <div className="flex items-center gap-1">
              {STATUSES.filter(s => s.id !== 'Completed').map(status => (
                <button
                  key={status.id}
                  type="button"
                  onClick={() => setStatusFilter(prev => ({ ...prev, [status.id]: !prev[status.id] }))}
                  className={`flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-medium transition-all ${
                    statusFilter[status.id] 
                      ? 'bg-slate-100 text-slate-700 font-semibold' 
                      : 'bg-transparent text-slate-400 line-through'
                  }`}
                >
                  {status.icon}
                  {status.label}
                </button>
              ))}
              <button
                type="button"
                onClick={() => setStatusFilter(prev => ({ ...prev, 'Completed': !prev['Completed'] }))}
                className={`flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-medium transition-all ${
                  statusFilter['Completed'] 
                    ? 'bg-emerald-50 text-emerald-700 font-semibold' 
                    : 'bg-transparent text-slate-400 line-through'
                }`}
              >
                <CheckCircle2 size={12} className="text-emerald-500" />
                Completed
              </button>
            </div>
          </div>
        </div>
        
        {/* Calendar Grid - No scrollable */}
        <div className="flex-1 flex flex-col">
          {/* Week Headers */}
          <div className="grid grid-cols-7 border-b border-slate-200">
            {weekDays.map(day => (
              <div key={day} className="px-3 py-2 text-xs font-bold text-slate-500 text-center bg-slate-50/70 font-heading uppercase tracking-wider">
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
                className="border-r border-b border-slate-100 bg-slate-50/40 p-2 text-slate-300 text-xs font-mono"
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
              const currentDate = new Date(year, month, day)
              
              return (
                <div
                  key={day}
                  onDragOver={handleDragOver}
                  onDrop={(e) => handleDrop(e, day)}
                  className={`border-r border-b border-slate-100 p-2 min-h-[100px] transition-colors hover:bg-slate-50/50 ${
                    isToday ? 'bg-blue-50/30' : ''
                  }`}
                >
                  <div className="flex items-center justify-between mb-1.5">
                    <div className={`text-xs font-mono font-semibold ${isToday ? 'text-blue-600 font-bold' : 'text-slate-700'}`}>
                      {day}
                      {isToday && <span className="ml-1 text-[10px] font-heading font-bold text-blue-600 uppercase">Today</span>}
                    </div>
                    {/* Inline Add Button */}
                    <button
                      type="button"
                      onClick={() => setInlineAddingDate(currentDate)}
                      className="text-slate-300 hover:text-blue-600 transition-colors p-0.5"
                      title="Add task"
                    >
                      <Plus size={13} />
                    </button>
                  </div>
                  
                  {/* Inline Add Input */}
                  {inlineAddingDate && inlineAddingDate.getDate() === day && 
                   inlineAddingDate.getMonth() === month && 
                   inlineAddingDate.getFullYear() === year && (
                    <div className="mb-2">
                      <input
                        type="text"
                        autoFocus
                        placeholder="Task name..."
                        className="w-full bg-white border border-blue-400 rounded-md px-2 py-1 text-xs focus:ring-1 focus:ring-blue-600 outline-none text-slate-800"
                        value={inlineAddingValue}
                        onChange={(e) => setInlineAddingValue(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            handleCalendarInlineAdd(currentDate)
                          } else if (e.key === 'Escape') {
                            setInlineAddingDate(null)
                            setInlineAddingValue('')
                          }
                        }}
                        onBlur={() => {
                          if (inlineAddingValue.trim()) {
                            handleCalendarInlineAdd(currentDate)
                          } else {
                            setInlineAddingDate(null)
                          }
                        }}
                      />
                    </div>
                  )}
                  
                  <div className="space-y-1">
                    {dayTasks.map(task => {
                      const assignees = getAssigneeInfo(task.assignedTo)
                      return (
                        <div
                          key={task.id}
                          draggable
                          onDragStart={(e) => {
                            e.dataTransfer.setData('taskId', task.id)
                            setDraggedTaskId(task.id)
                          }}
                          className={`group relative text-[10px] p-1.5 rounded cursor-pointer transition-all hover:shadow-sm ${
                            task.priority === 'urgent' ? 'bg-rose-50 border border-rose-200 text-rose-700' :
                            task.priority === 'high' ? 'bg-amber-50 border border-amber-200 text-amber-700' :
                            'bg-slate-50 border border-slate-200 text-slate-700'
                          }`}
                        >
                          {/* Task Title with Three Dots Menu */}
                          <div className="flex items-center justify-between gap-1">
                            <div className="truncate font-medium flex-1">{task.title}</div>
                            <button
                              onClick={(e) => {
                                e.stopPropagation()
                                openEditModal(task)
                              }}
                              className="opacity-0 group-hover:opacity-100 text-slate-400 hover:text-slate-600 transition-all p-0.5"
                            >
                              <MoreHorizontal size={12} />
                            </button>
                          </div>
                          
                          {/* Hover Tooltip */}
                          <div className="absolute left-0 bottom-full mb-1 w-48 bg-white border border-slate-200 rounded-lg shadow-xl z-50 p-2 opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all">
                            <div className="text-[11px] font-semibold text-slate-800 mb-1">{task.title}</div>
                            {task.description && (
                              <div className="text-[9px] text-slate-500 mb-1 line-clamp-2">{task.description}</div>
                            )}
                            <div className="flex items-center gap-2 text-[9px]">
                              {task.priority && (
                                <span className={`${task.priority === 'urgent' ? 'text-rose-500' : task.priority === 'high' ? 'text-amber-500' : 'text-slate-400'}`}>
                                  {task.priority === 'urgent' ? '🔴 Urgent' : task.priority === 'high' ? '📊 High' : '○ Normal'}
                                </span>
                              )}
                              {assignees.length > 0 && (
                                <span className="text-slate-500 flex items-center gap-0.5">
                                  <User size={8} />
                                  {assignees[0].name.split(' ')[0]}
                                  {assignees.length > 1 && ` +${assignees.length - 1}`}
                                </span>
                              )}
                            </div>
                          </div>
                          
                          {assignees.length > 0 && (
                            <div className="flex items-center gap-0.5 mt-0.5 text-[8px] text-slate-500">
                              <User size={8} />
                              {assignees.length > 1 ? `${assignees.length}` : assignees[0].name.split(' ')[0]}
                            </div>
                          )}
                        </div>
                      )
                    })}
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
        <form onSubmit={handleCreateIdea} className="p-6 space-y-5 font-body">
          <div>
            <label className="block text-sm font-medium text-slate-800 mb-1.5 font-body">
              Idea Title
            </label>
            <input
              type="text"
              required
              value={newIdea.title}
              onChange={(e) => setNewIdea(prev => ({ ...prev, title: e.target.value }))}
              placeholder="Enter your idea title..."
              className="h-9 w-full rounded-md border border-slate-200 bg-white px-3 py-1 text-sm focus-visible:ring-1 focus-visible:ring-blue-600 placeholder:text-slate-400 text-slate-800"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-800 mb-1.5 font-body">
              Key Points
            </label>
            <div className="space-y-2">
              {newIdea.bullets.map((bullet, index) => (
                <div key={index} className="flex items-center gap-2">
                  <span className="text-slate-400 font-bold">•</span>
                  <input
                    type="text"
                    value={bullet}
                    onChange={(e) => handleBulletChange(index, e.target.value)}
                    placeholder={`Point ${index + 1}`}
                    className="flex-1 h-9 rounded-md border border-slate-200 bg-white px-3 py-1 text-sm focus-visible:ring-1 focus-visible:ring-blue-600 placeholder:text-slate-400 text-slate-800"
                  />
                  {newIdea.bullets.length > 1 && (
                    <button
                      type="button"
                      onClick={() => handleRemoveBullet(index)}
                      className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-md transition-colors"
                    >
                      <X size={15} />
                    </button>
                  )}
                </div>
              ))}
            </div>
            <button
              type="button"
              onClick={handleAddBullet}
              className="mt-2.5 flex items-center gap-1.5 text-xs text-blue-600 hover:text-blue-700 font-semibold font-heading"
            >
              <Plus size={14} />
              Add another point
            </button>
          </div>

          <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-100">
            <button
              type="button"
              onClick={() => { setShowAddIdeaModal(false); setNewIdea({ title: '', bullets: [''] }) }}
              className="h-9 px-4 border border-slate-200 text-slate-700 rounded-md text-sm font-semibold font-heading hover:bg-slate-50 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="h-9 px-6 bg-blue-600 hover:bg-blue-700 text-white rounded-md text-sm font-bold font-heading shadow-sm active:scale-[0.98] transition-all"
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
    <div className="module-layout-root flex flex-col h-full bg-slate-50/50 font-inter selection:bg-indigo-100">
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

      {/* BEGIN: MainHeader */}
      <header className="bg-white border-b border-slate-200/80 sticky top-0 z-30 pt-4 px-6 shrink-0">
        <div className="w-full mx-auto">
          {/* Top Title Bar and Controls */}
          <div className="flex items-center justify-between pb-3">
            {/* Title & Breadcrumbs */}
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-bold tracking-tight text-slate-950 font-heading">TASKS</h1>
              <span className="text-slate-300 font-light text-xl">/</span>
              <span className="text-xl font-bold tracking-tight text-blue-600 font-heading uppercase">
                {TABS.find(t => t.id === activeTab)?.label || 'TEAM'}
              </span>
            </div>
          </div>

          {/* Navigation Tabs, View Selectors, and Primary Action Button */}
          <div className="flex items-center justify-between border-t border-slate-100 pt-1 -mb-px pb-1 flex-wrap gap-3">
            <nav className="flex items-center space-x-7 text-xs font-medium">
              {TABS.map(tab => {
                const isActive = activeTab === tab.id
                return (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setActiveTab(tab.id)}
                    className={`flex items-center gap-2 py-2 transition-colors ${
                      isActive
                        ? 'text-blue-600 border-b-2 border-blue-600 font-semibold'
                        : 'text-slate-500 hover:text-slate-800'
                    }`}
                  >
                    {tab.icon}
                    <span>{tab.label}</span>
                  </button>
                )
              })}
            </nav>

            {['team', 'personal'].includes(activeTab) && (
              <div className="flex items-center gap-3 pb-1">
                <div className="flex items-center bg-slate-100/90 p-1 rounded-xl border border-slate-200/70 text-xs font-medium text-slate-600">
                  {[
                    { id: 'board', icon: <Layout size={13} />, label: 'Board' },
                    { id: 'table', icon: <Table size={13} />, label: 'Table' },
                    { id: 'calendar', icon: <CalendarIcon size={13} />, label: 'Calendar' },
                    { id: 'dashboard', icon: <BarChart2 size={13} />, label: 'Stats' }
                  ].map(m => (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() => setViewMode(m.id)}
                      className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-lg transition-all ${
                        viewMode === m.id
                          ? 'bg-white text-slate-900 shadow-sm border border-slate-200/60 font-semibold'
                          : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/50'
                      }`}
                    >
                      {m.icon}
                      <span>{m.label}</span>
                    </button>
                  ))}
                </div>
                <button
                  type="button"
                  onClick={() => setShowAddModal(true)}
                  className="inline-flex items-center gap-1.5 bg-blue-600 hover:bg-blue-700 text-white font-medium text-xs px-3.5 py-1.5 rounded-xl shadow-sm shadow-blue-500/20 active:scale-[0.98] transition-all"
                >
                  <Plus size={14} className="stroke-[2.5]" />
                  <span>New Task</span>
                </button>
              </div>
            )}
          </div>
        </div>
      </header>
      {/* END: MainHeader */}

      {/* BEGIN: FilterSubheader */}
      {['team', 'personal'].includes(activeTab) && (
        <section className="bg-white border-b border-slate-200/70 px-6 py-2 shrink-0 font-body" data-purpose="filter-bar">
          <div className="w-full mx-auto flex items-center justify-between gap-4">
            <div className="flex items-center gap-3 flex-wrap">
              {/* Search Input */}
              <div className="relative w-56">
                <span className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                  <Search size={14} />
                </span>
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search issues..."
                  className="w-full text-xs bg-slate-50/70 border border-slate-200 rounded-lg pl-8 pr-3 py-1.5 text-slate-700 placeholder-slate-400 focus:outline-none focus:border-blue-500 focus:bg-white transition-all shadow-none"
                />
                {searchQuery && (
                  <button
                    type="button"
                    onClick={() => setSearchQuery('')}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-0.5"
                    title="Clear search"
                  >
                    <X size={12} />
                  </button>
                )}
              </div>

              {/* Quick Filter Buttons */}
              <div className="flex items-center gap-1.5">
                {[
                  { id: 'all', label: 'All' },
                  { id: 'me', label: 'Assigned to me' },
                  { id: 'today', label: 'Due today' },
                  { id: 'high', label: 'High Priority' }
                ].map(f => (
                  <button
                    key={f.id}
                    type="button"
                    onClick={() => setQuickFilter(f.id)}
                    className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors ${
                      quickFilter === f.id
                        ? 'bg-slate-100 text-slate-900 border border-slate-200/80 shadow-xs'
                        : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100/70 border border-transparent'
                    }`}
                  >
                    {f.label}
                  </button>
                ))}
              </div>

              {/* Dropdown Filter: All Clients */}
              <div className="relative">
                <select
                  value={clientFilter}
                  onChange={(e) => setClientFilter(e.target.value)}
                  className="px-3 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors focus:outline-none focus:border-blue-500 cursor-pointer"
                >
                  <option value="all">All Clients</option>
                  <option value="internal">Internal Only</option>
                  {CLIENT_TYPES.map(c => (
                    <option key={c.id} value={c.id}>{c.label}</option>
                  ))}
                </select>
              </div>

              {/* Clear All Filters */}
              {(searchQuery || quickFilter !== 'all' || clientFilter !== 'all') && (
                <button
                  type="button"
                  onClick={() => {
                    setSearchQuery('')
                    setQuickFilter('all')
                    setClientFilter('all')
                  }}
                  className="px-2.5 py-1.5 text-xs font-medium text-slate-500 hover:text-slate-800 flex items-center gap-1 hover:bg-slate-100/70 rounded-lg transition-colors"
                >
                  <X size={12} /> Clear
                </button>
              )}
            </div>

            {/* Task Count Indicator */}
            <div className="text-xs font-medium text-slate-400 shrink-0 pr-1 font-mono">
              <span>{filteredTasks.length} {filteredTasks.length === 1 ? 'task' : 'tasks'}</span>
            </div>
          </div>
        </section>
      )}
      {/* END: FilterSubheader */}

      <div className={`flex-1 overflow-auto ${viewMode === 'board' ? 'p-0' : 'p-2.5'}`}>
        {activeTab === 'checklist' ? (
          <ChecklistView user={user} />
        ) : activeTab === 'reminders' ? (
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
        size="4xl"
      >
        <form onSubmit={handleCreateTask} className="p-6 space-y-5 font-body">
          {/* Multi-Assignee Selector - FIRST ENTRY */}
          <div>
            <label className="block text-sm font-medium text-slate-800 mb-1.5 font-body">Assign To</label>
            <div className="flex flex-wrap gap-1.5 p-2.5 bg-slate-50/50 border border-slate-200 rounded-lg min-h-[44px] max-h-36 overflow-y-auto">
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
                    className={`h-8 px-2.5 rounded-md text-xs font-medium transition-all flex items-center gap-1.5 border font-body ${
                      isSelected 
                        ? 'bg-blue-50 text-blue-700 border-blue-300 font-semibold shadow-xs' 
                        : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                    }`}
                  >
                    <div className="w-5 h-5 rounded-full bg-slate-100 text-slate-700 text-[8px] font-bold font-mono flex items-center justify-center">
                      {getInitials(emp.name)}
                    </div>
                    <span>{emp.name}</span>
                    {isSelected && <Check size={12} className="text-blue-600" />}
                  </button>
                )
              })}
              {taskEmployees.length === 0 && (
                <p className="text-xs text-slate-400 italic py-1">No employees found</p>
              )}
            </div>
          </div>

          {/* Title & Description */}
          <div className="space-y-4">
            <div className="relative">
              <label className="block text-sm font-medium text-slate-800 mb-1.5 font-body">Task Title</label>
              <input
                type="text"
                required
                className="h-9 w-full rounded-md border border-slate-200 bg-white px-3 py-1 text-sm focus-visible:ring-1 focus-visible:ring-blue-600 placeholder:text-slate-400 text-slate-800 font-heading font-semibold"
                placeholder="What needs to be done?"
                value={newTask.title}
                onChange={e => handleTextChange('title', e.target.value)}
                autoFocus
              />
              {mentionState.active && mentionState.targetField === 'title' && !mentionState.targetId && <MentionList />}
            </div>

            <div className="relative">
              <label className="block text-sm font-medium text-slate-800 mb-1.5 font-body">Description</label>
              <textarea
                className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-sm focus-visible:ring-1 focus-visible:ring-blue-600 outline-none transition-all min-h-[85px] resize-y placeholder:text-slate-400 text-slate-800 font-body"
                placeholder="Add description or context... (type @ to mention a team member)"
                value={newTask.description}
                onChange={e => handleTextChange('description', e.target.value)}
              />
              {mentionState.active && mentionState.targetField === 'description' && !mentionState.targetId && <MentionList />}
            </div>
          </div>

          {/* Properties Grid: Priority, Status, Due Date, Notes */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Priority Selector */}
            <div>
              <label className="block text-sm font-medium text-slate-800 mb-1.5 font-body">Priority</label>
              <div className="grid grid-cols-3 gap-2">
                {[
                  { id: 'normal', label: 'Normal', dot: 'bg-slate-400', activeCls: 'bg-blue-50 text-blue-700 border-blue-300' },
                  { id: 'high', label: 'High', dot: 'bg-amber-500', activeCls: 'bg-amber-50 text-amber-700 border-amber-300' },
                  { id: 'urgent', label: 'Urgent', dot: 'bg-red-500', activeCls: 'bg-red-50 text-red-700 border-red-300' }
                ].map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => setNewTask({ ...newTask, priority: p.id })}
                    className={`h-9 rounded-md text-xs font-semibold flex items-center justify-center gap-1.5 transition-all border font-heading ${
                      newTask.priority === p.id 
                        ? `${p.activeCls} shadow-xs font-bold`
                        : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                    }`}
                  >
                    <span className={`w-1.5 h-1.5 rounded-full ${p.dot}`} />
                    {p.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Status */}
            <div>
              <label className="block text-sm font-medium text-slate-800 mb-1.5 font-body">Status</label>
              <select
                className="h-9 w-full rounded-md border border-slate-200 bg-white px-3 py-1 text-sm focus-visible:ring-1 focus-visible:ring-blue-600 text-slate-800 font-body cursor-pointer"
                value={newTask.status}
                onChange={e => setNewTask({ ...newTask, status: e.target.value })}
              >
                {STATUSES.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
              </select>
            </div>

            {/* Due Date */}
            <div>
              <label className="block text-sm font-medium text-slate-800 mb-1.5 font-body">Due Date</label>
              <div className="relative">
                <DatePicker
                  selected={newTask.dueDate}
                  onChange={(date) => setNewTask({ ...newTask, dueDate: date })}
                  className="h-9 w-full rounded-md border border-slate-200 bg-white px-3 py-1 text-sm focus-visible:ring-1 focus-visible:ring-blue-600 placeholder:text-slate-400 text-slate-800 font-body cursor-pointer"
                  placeholderText="Select date (optional)"
                  dateFormat="MMM d, yyyy"
                />
                <CalendarIcon className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" size={14} />
              </div>
            </div>

            {/* Internal Notes */}
            <div>
              <label className="block text-sm font-medium text-slate-800 mb-1.5 font-body">Internal Notes</label>
              <input
                type="text"
                className="h-9 w-full rounded-md border border-slate-200 bg-white px-3 py-1 text-sm focus-visible:ring-1 focus-visible:ring-blue-600 placeholder:text-slate-400 text-slate-800 font-body"
                placeholder="Quick notes (internal only)"
                value={newTask.notes}
                onChange={e => setNewTask({ ...newTask, notes: e.target.value })}
              />
            </div>
          </div>

          {/* Client Tracking */}
          <div className="border border-slate-200 rounded-xl overflow-hidden bg-white shadow-xs">
            <div className="bg-slate-50/60 px-3.5 py-2 border-b border-slate-200/80 flex items-center justify-between">
              <h5 className="text-xs font-semibold text-slate-700 uppercase tracking-wider font-heading flex items-center gap-2">
                <User size={13} className="text-slate-400" />
                Client Tracking
              </h5>
              <span className="text-[11px] font-medium text-slate-400 italic font-body">Optional</span>
            </div>
            
            <div className="p-3.5 grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1 font-body">Client Name</label>
                <input
                  type="text"
                  className="h-9 w-full rounded-md border border-slate-200 bg-white px-3 py-1 text-sm focus-visible:ring-1 focus-visible:ring-blue-600 placeholder:text-slate-400 text-slate-800 font-body"
                  placeholder="e.g. John Doe"
                  value={newTask.clientName}
                  onChange={e => setNewTask({ ...newTask, clientName: e.target.value })}
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1 font-body">Client Type</label>
                <div className="flex gap-2">
                  {CLIENT_TYPES.map(type => (
                    <button
                      key={type.id}
                      type="button"
                      onClick={() => setNewTask({ ...newTask, clientType: newTask.clientType === type.id ? null : type.id })}
                      className={`h-9 flex-1 rounded-md text-xs font-medium transition-all border flex items-center justify-center ${
                        newTask.clientType === type.id 
                          ? `${type.bgColor} ${type.borderColor} ${type.color} font-semibold shadow-xs`
                          : 'bg-white border-slate-200 text-slate-500 hover:bg-slate-50'
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

          {/* Toggles */}
          <div className="flex items-center gap-6 py-1">
            <label className="flex items-center gap-2.5 cursor-pointer group">
              <div className="relative flex items-center">
                <input
                  type="checkbox"
                  className="peer sr-only"
                  checked={newTask.isPersonal}
                  onChange={e => setNewTask({ ...newTask, isPersonal: e.target.checked })}
                />
                <div className="w-8 h-4.5 bg-slate-200 rounded-full peer peer-checked:bg-blue-600 transition-colors after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-3.5 after:w-3.5 after:transition-all peer-checked:after:translate-x-3.5 shadow-xs"></div>
              </div>
              <span className="text-xs font-medium text-slate-700 group-hover:text-slate-900 transition-colors font-body">Personal Task</span>
            </label>

            <label className="flex items-center gap-2.5 cursor-pointer group">
              <div className="relative flex items-center">
                <input
                  type="checkbox"
                  className="peer sr-only"
                  checked={newTask.category === 'idea'}
                  onChange={e => setNewTask({ ...newTask, category: e.target.checked ? 'idea' : 'task' })}
                />
                <div className="w-8 h-4.5 bg-slate-200 rounded-full peer peer-checked:bg-amber-500 transition-colors after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-3.5 after:w-3.5 after:transition-all peer-checked:after:translate-x-3.5 shadow-xs"></div>
              </div>
              <span className="text-xs font-medium text-slate-700 group-hover:text-slate-900 transition-colors font-body">Mark as Idea</span>
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

          {/* Footer */}
          <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-200">
            <button
              type="button"
              onClick={() => setShowAddModal(false)}
              className="h-9 px-4 border border-slate-200 text-slate-700 rounded-md text-sm font-semibold font-heading hover:bg-slate-50 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="h-9 px-6 bg-blue-600 hover:bg-blue-700 text-white rounded-md text-sm font-bold font-heading shadow-sm active:scale-[0.98] transition-all"
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
        size="4xl"
      >
        {editingTask && (
          <form onSubmit={handleSaveEdit} className="p-6 space-y-5 font-body">
            {/* Multi-Assignee Selector - FIRST ENTRY */}
            <div>
              <label className="block text-sm font-medium text-slate-800 mb-1.5 font-body">Assign To</label>
              <div className="flex flex-wrap gap-1.5 p-2.5 bg-slate-50/50 border border-slate-200 rounded-lg min-h-[44px] max-h-36 overflow-y-auto">
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
                      className={`h-8 px-2.5 rounded-md text-xs font-medium transition-all flex items-center gap-1.5 border font-body ${
                        isSelected 
                          ? 'bg-blue-50 text-blue-700 border-blue-300 font-semibold shadow-xs' 
                          : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                      }`}
                    >
                      <div className="w-5 h-5 rounded-full bg-slate-100 text-slate-700 text-[8px] font-bold font-mono flex items-center justify-center">
                        {getInitials(emp.name)}
                      </div>
                      <span>{emp.name}</span>
                      {isSelected && <Check size={12} className="text-blue-600" />}
                    </button>
                  )
                })}
                {taskEmployees.length === 0 && (
                  <p className="text-xs text-slate-400 italic py-1">No employees found</p>
                )}
              </div>
            </div>

            {/* Title & Description */}
            <div className="space-y-4">
              <div className="relative">
                <label className="block text-sm font-medium text-slate-800 mb-1.5 font-body">Task Title</label>
                <input
                  type="text"
                  required
                  className="h-9 w-full rounded-md border border-slate-200 bg-white px-3 py-1 text-sm focus-visible:ring-1 focus-visible:ring-blue-600 placeholder:text-slate-400 text-slate-800 font-heading font-semibold"
                  placeholder="What needs to be done?"
                  value={editingTask.title}
                  onChange={e => setEditingTask({ ...editingTask, title: e.target.value })}
                />
              </div>

              <div className="relative">
                <label className="block text-sm font-medium text-slate-800 mb-1.5 font-body">Description</label>
                <textarea
                  className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-sm focus-visible:ring-1 focus-visible:ring-blue-600 outline-none transition-all min-h-[85px] resize-y placeholder:text-slate-400 text-slate-800 font-body"
                  placeholder="Add description or context..."
                  value={editingTask.description || ''}
                  onChange={e => setEditingTask({ ...editingTask, description: e.target.value })}
                />
              </div>
            </div>

            {/* Properties Grid: Priority, Status, Due Date, Notes */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Priority Selector */}
              <div>
                <label className="block text-sm font-medium text-slate-800 mb-1.5 font-body">Priority</label>
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { id: 'normal', label: 'Normal', dot: 'bg-slate-400', activeCls: 'bg-blue-50 text-blue-700 border-blue-300' },
                    { id: 'high', label: 'High', dot: 'bg-amber-500', activeCls: 'bg-amber-50 text-amber-700 border-amber-300' },
                    { id: 'urgent', label: 'Urgent', dot: 'bg-red-500', activeCls: 'bg-red-50 text-red-700 border-red-300' }
                  ].map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => setEditingTask({ ...editingTask, priority: p.id })}
                      className={`h-9 rounded-md text-xs font-semibold flex items-center justify-center gap-1.5 transition-all border font-heading ${
                        editingTask.priority === p.id 
                          ? `${p.activeCls} shadow-xs font-bold`
                          : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                      }`}
                    >
                      <span className={`w-1.5 h-1.5 rounded-full ${p.dot}`} />
                      {p.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Status */}
              <div>
                <label className="block text-sm font-medium text-slate-800 mb-1.5 font-body">Status</label>
                <select
                  className="h-9 w-full rounded-md border border-slate-200 bg-white px-3 py-1 text-sm focus-visible:ring-1 focus-visible:ring-blue-600 text-slate-800 font-body cursor-pointer"
                  value={editingTask.status}
                  onChange={e => setEditingTask({ ...editingTask, status: e.target.value })}
                >
                  {STATUSES.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
                </select>
              </div>

              {/* Due Date */}
              <div>
                <label className="block text-sm font-medium text-slate-800 mb-1.5 font-body">Due Date</label>
                <div className="relative">
                  <DatePicker
                    selected={editingTask.dueDate}
                    onChange={(date) => setEditingTask({ ...editingTask, dueDate: date })}
                    className="h-9 w-full rounded-md border border-slate-200 bg-white px-3 py-1 text-sm focus-visible:ring-1 focus-visible:ring-blue-600 placeholder:text-slate-400 text-slate-800 font-body cursor-pointer"
                    placeholderText="Select date (optional)"
                    dateFormat="MMM d, yyyy"
                  />
                  <CalendarIcon className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" size={14} />
                </div>
              </div>

              {/* Internal Notes */}
              <div>
                <label className="block text-sm font-medium text-slate-800 mb-1.5 font-body">Internal Notes</label>
                <input
                  type="text"
                  className="h-9 w-full rounded-md border border-slate-200 bg-white px-3 py-1 text-sm focus-visible:ring-1 focus-visible:ring-blue-600 placeholder:text-slate-400 text-slate-800 font-body"
                  placeholder="Quick notes (internal only)"
                  value={editingTask.notes || ''}
                  onChange={e => setEditingTask({ ...editingTask, notes: e.target.value })}
                />
              </div>
            </div>

            {/* Client Tracking */}
            <div className="border border-slate-200 rounded-xl overflow-hidden bg-white shadow-xs">
              <div className="bg-slate-50/60 px-3.5 py-2 border-b border-slate-200/80 flex items-center justify-between">
                <h5 className="text-xs font-semibold text-slate-700 uppercase tracking-wider font-heading flex items-center gap-2">
                  <User size={13} className="text-slate-400" />
                  Client Tracking
                </h5>
                <span className="text-[11px] font-medium text-slate-400 italic font-body">Optional</span>
              </div>
              
              <div className="p-3.5 grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1 font-body">Client Name</label>
                  <input
                    type="text"
                    className="h-9 w-full rounded-md border border-slate-200 bg-white px-3 py-1 text-sm focus-visible:ring-1 focus-visible:ring-blue-600 placeholder:text-slate-400 text-slate-800 font-body"
                    placeholder="e.g. John Doe"
                    value={editingTask.clientName || ''}
                    onChange={e => setEditingTask({ ...editingTask, clientName: e.target.value })}
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1 font-body">Client Type</label>
                  <div className="flex gap-2">
                    {CLIENT_TYPES.map(type => (
                      <button
                        key={type.id}
                        type="button"
                        onClick={() => setEditingTask({ ...editingTask, clientType: editingTask.clientType === type.id ? null : type.id })}
                        className={`h-9 flex-1 rounded-md text-xs font-medium transition-all border flex items-center justify-center ${
                          editingTask.clientType === type.id 
                            ? `${type.bgColor} ${type.borderColor} ${type.color} font-semibold shadow-xs`
                            : 'bg-white border-slate-200 text-slate-500 hover:bg-slate-50'
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

            {/* Toggles */}
            <div className="flex items-center gap-6 py-1">
              <label className="flex items-center gap-2.5 cursor-pointer group">
                <div className="relative flex items-center">
                  <input
                    type="checkbox"
                    className="peer sr-only"
                    checked={editingTask.isPersonal || false}
                    onChange={e => setEditingTask({ ...editingTask, isPersonal: e.target.checked })}
                  />
                  <div className="w-8 h-4.5 bg-slate-200 rounded-full peer peer-checked:bg-blue-600 transition-colors after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-3.5 after:w-3.5 after:transition-all peer-checked:after:translate-x-3.5 shadow-xs"></div>
                </div>
                <span className="text-xs font-medium text-slate-700 group-hover:text-slate-900 transition-colors font-body">Personal Task</span>
              </label>

              <label className="flex items-center gap-2.5 cursor-pointer group">
                <div className="relative flex items-center">
                  <input
                    type="checkbox"
                    className="peer sr-only"
                    checked={editingTask.category === 'idea'}
                    onChange={e => setEditingTask({ ...editingTask, category: e.target.checked ? 'idea' : 'task' })}
                  />
                  <div className="w-8 h-4.5 bg-slate-200 rounded-full peer peer-checked:bg-amber-500 transition-colors after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-3.5 after:w-3.5 after:transition-all peer-checked:after:translate-x-3.5 shadow-xs"></div>
                </div>
                <span className="text-xs font-medium text-slate-700 group-hover:text-slate-900 transition-colors font-body">Mark as Idea</span>
              </label>
            </div>

            {/* Buzzer, Repeat, Reminder & Checklist Section */}
            <div className="pt-2 border-t border-slate-200">
              <TaskChecklistBuilder
                buzzer={editingTask.buzzer}
                onBuzzerChange={(buzzer) => setEditingTask({ ...editingTask, buzzer })}
                repeat={editingTask.repeat}
                onRepeatChange={(repeat) => setEditingTask({ ...editingTask, repeat })}
                reminder={editingTask.reminder}
                onReminderChange={(reminder) => setEditingTask({ ...editingTask, reminder })}
                checklists={editingTask.checklists}
                onChecklistsChange={(checklists) => setEditingTask({ ...editingTask, checklists })}
              />
            </div>

            {/* Footer with Delete on left, Cancel & Save on right */}
            <div className="flex items-center justify-between gap-3 pt-4 border-t border-slate-200">
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
                className="h-9 px-3 border border-red-200 text-red-600 hover:bg-red-50 rounded-md text-xs font-semibold font-heading flex items-center gap-1.5 transition-colors"
              >
                <Trash2 size={13} /> Delete Task
              </button>
              <div className="flex items-center gap-2.5">
                <button
                  type="button"
                  onClick={() => { setShowEditModal(false); setEditingTask(null); }}
                  className="h-9 px-4 border border-slate-200 text-slate-700 rounded-md text-sm font-semibold font-heading hover:bg-slate-50 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="h-9 px-6 bg-blue-600 hover:bg-blue-700 text-white rounded-md text-sm font-bold font-heading shadow-sm active:scale-[0.98] transition-all"
                >
                  Save Changes
                </button>
              </div>
            </div>
          </form>
        )}
      </Modal>

      {/* Side Drawer for Task Editing */}
      {showSideDrawer && drawerTask && (
        <div className="fixed inset-0 z-50 overflow-hidden">
          {/* Backdrop */}
          <div 
            className="absolute inset-0 bg-black/40 backdrop-blur-sm transition-opacity"
            onClick={closeSideDrawer}
          />
          
          {/* Drawer Panel */}
          <div className="absolute inset-y-0 right-0 max-w-md w-full bg-white shadow-2xl transform transition-transform duration-300 ease-out flex flex-col font-body">
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 shrink-0 bg-white">
              <h2 className="text-lg font-bold text-slate-900 font-heading">Edit Task</h2>
              <button 
                type="button"
                onClick={closeSideDrawer}
                className="p-1.5 hover:bg-slate-100 rounded-md transition-colors text-slate-400 hover:text-slate-700"
              >
                <X size={18} />
              </button>
            </div>
            
            {/* Content */}
            <div className="flex-1 overflow-y-auto p-6 space-y-5">
              {/* Title */}
              <div>
                <label className="block text-sm font-medium text-slate-800 mb-1.5 font-body">Task Title</label>
                <input
                  type="text"
                  value={drawerTask.title}
                  onChange={(e) => setDrawerTask({ ...drawerTask, title: e.target.value })}
                  className="h-9 w-full rounded-md border border-slate-200 bg-white px-3 py-1 text-sm focus-visible:ring-1 focus-visible:ring-blue-600 placeholder:text-slate-400 text-slate-800 font-heading font-semibold"
                  placeholder="Task title"
                />
              </div>
              
              {/* Description */}
              <div>
                <label className="block text-sm font-medium text-slate-800 mb-1.5 font-body">Description</label>
                <textarea
                  value={drawerTask.description || ''}
                  onChange={(e) => setDrawerTask({ ...drawerTask, description: e.target.value })}
                  rows={4}
                  className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-sm focus-visible:ring-1 focus-visible:ring-blue-600 outline-none transition-all resize-y min-h-[90px] font-body text-slate-800 placeholder:text-slate-400"
                  placeholder="Add description..."
                />
              </div>
              
              {/* Status */}
              <div>
                <label className="block text-sm font-medium text-slate-800 mb-1.5 font-body">Status</label>
                <select
                  value={drawerTask.status}
                  onChange={(e) => setDrawerTask({ ...drawerTask, status: e.target.value })}
                  className="h-9 w-full rounded-md border border-slate-200 bg-white px-3 py-1 text-sm focus-visible:ring-1 focus-visible:ring-blue-600 text-slate-800 font-body cursor-pointer"
                >
                  {STATUSES.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
                </select>
              </div>
              
              {/* Priority */}
              <div>
                <label className="block text-sm font-medium text-slate-800 mb-1.5 font-body">Priority</label>
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { id: 'normal', label: 'Normal', dot: 'bg-slate-400', activeCls: 'bg-blue-50 text-blue-700 border-blue-300' },
                    { id: 'high', label: 'High', dot: 'bg-amber-500', activeCls: 'bg-amber-50 text-amber-700 border-amber-300' },
                    { id: 'urgent', label: 'Urgent', dot: 'bg-red-500', activeCls: 'bg-red-50 text-red-700 border-red-300' }
                  ].map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => setDrawerTask({ ...drawerTask, priority: p.id })}
                      className={`h-9 rounded-md text-xs font-semibold flex items-center justify-center gap-1.5 transition-all border font-heading ${
                        drawerTask.priority === p.id 
                          ? `${p.activeCls} shadow-xs font-bold`
                          : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                      }`}
                    >
                      <span className={`w-1.5 h-1.5 rounded-full ${p.dot}`} />
                      {p.label}
                    </button>
                  ))}
                </div>
              </div>
              
              {/* Due Date */}
              <div>
                <label className="block text-sm font-medium text-slate-800 mb-1.5 font-body">Due Date</label>
                <div className="relative">
                  <DatePicker
                    selected={drawerTask.dueDate}
                    onChange={(date) => setDrawerTask({ ...drawerTask, dueDate: date })}
                    className="h-9 w-full rounded-md border border-slate-200 bg-white px-3 py-1 text-sm focus-visible:ring-1 focus-visible:ring-blue-600 placeholder:text-slate-400 text-slate-800 font-body cursor-pointer"
                    dateFormat="MMM d, yyyy"
                    placeholderText="Select date (optional)"
                  />
                  <CalendarIcon className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" size={14} />
                </div>
              </div>
              
              {/* Assignees */}
              <div>
                <label className="block text-sm font-medium text-slate-800 mb-1.5 font-body">Assignees</label>
                <div className="flex flex-wrap gap-1.5 p-2.5 bg-slate-50/50 border border-slate-200 rounded-lg min-h-[44px] max-h-36 overflow-y-auto">
                  {taskEmployees.map(emp => {
                    const isAssigned = (drawerTask.assignedTo || []).includes(emp.id)
                    return (
                      <button
                        key={emp.id}
                        type="button"
                        onClick={() => {
                          const current = drawerTask.assignedTo || []
                          const updated = isAssigned 
                            ? current.filter(id => id !== emp.id)
                            : [...current, emp.id]
                          setDrawerTask({ ...drawerTask, assignedTo: updated })
                        }}
                        className={`h-8 px-2.5 rounded-md text-xs font-medium transition-all flex items-center gap-1.5 border font-body ${
                          isAssigned 
                            ? 'bg-blue-50 text-blue-700 border-blue-300 font-semibold shadow-xs' 
                            : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                        }`}
                      >
                        <div className="w-5 h-5 rounded-full bg-slate-100 text-slate-700 text-[8px] font-bold font-mono flex items-center justify-center">
                          {getInitials(emp.name)}
                        </div>
                        <span>{emp.name}</span>
                        {isAssigned && <Check size={12} className="text-blue-600" />}
                      </button>
                    )
                  })}
                  {taskEmployees.length === 0 && (
                    <p className="text-xs text-slate-400 italic py-1">No employees found</p>
                  )}
                </div>
              </div>
            </div>
            
            {/* Footer */}
            <div className="px-6 py-4 border-t border-slate-200 shrink-0 flex items-center justify-end gap-3 bg-white">
              <button
                type="button"
                onClick={closeSideDrawer}
                className="h-9 px-4 border border-slate-200 text-slate-700 rounded-md text-sm font-semibold font-heading hover:bg-slate-50 transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleDrawerSave}
                className="h-9 px-6 bg-blue-600 hover:bg-blue-700 text-white rounded-md text-sm font-bold font-heading shadow-sm active:scale-[0.98] transition-all"
              >
                Save Changes
              </button>
            </div>
          </div>
        </div>
      )}

      <Modal isOpen={!!selectedReminder} onClose={() => setSelectedReminder(null)} title="Directive Summary">
        {selectedReminder && (
          <div className="space-y-5 p-6 font-body">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <span className="px-2.5 py-0.5 rounded-md bg-blue-50 text-blue-700 text-xs font-semibold uppercase tracking-wider font-heading">{selectedReminder.type}</span>
                <span className="text-xs font-mono text-slate-400">Posted {selectedReminder.createdAt ? formatDistanceToNow(selectedReminder.createdAt.toDate(), { addSuffix: true }) : 'just now'}</span>
              </div>
            </div>
            <div>
              <h2 className="text-xl font-bold text-slate-900 mb-3 font-heading">{selectedReminder.title}</h2>
              <div className="bg-slate-50 rounded-xl p-5 border border-slate-200/80 min-h-[140px]">
                <p className="text-slate-700 text-sm whitespace-pre-wrap leading-relaxed">{selectedReminder.content}</p>
              </div>
            </div>
            <div className="flex justify-end pt-4 border-t border-slate-100">
              <button 
                type="button"
                onClick={() => setSelectedReminder(null)} 
                className="h-9 px-6 bg-slate-900 hover:bg-slate-800 text-white font-bold font-heading rounded-md text-xs uppercase tracking-wider transition-colors shadow-xs"
              >
                Close
              </button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  )
}
