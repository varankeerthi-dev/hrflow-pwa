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
  Filter,
  CheckCircle,
  PlayCircle,
  Lightbulb,
  X,
  ArrowRight,
  Calendar as CalendarIcon,
  Bell,
  Layout,
  Table,
  BarChart2,
  AtSign,
  ExternalLink,
  ChevronDown
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
  const [showAddModal, setShowAddModal] = useState(false)
  const [showReminderModal, setShowReminderModal] = useState(false)
  const [selectedReminder, setSelectedReminder] = useState(null)
  const [inlineInputs, setInlineInputs] = useState({})
  const [inlineDates, setInlineDates] = useState({})
  const [draggedTaskId, setDraggedTaskId] = useState(null)
  const [statusMenuOpen, setStatusMenuOpen] = useState(null)
  
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
    targetField: null, // 'title' | 'description' | 'inline'
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

  // Employees available for task mentions (filtered by includeInTask)
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
      
      // Extract actual status (remove -bottom suffix if present)
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

  const toggleStatus = async (task) => {
    const statusFlow = {
      'To Do': 'In Progress', 'In Progress': 'Review',
      'On Hold': 'In Progress', 'Review': 'Completed', 'Completed': 'To Do'
    }
    try {
      await updateTask(task.id, { status: statusFlow[task.status] || 'To Do' })
    } catch (err) {
      console.error("Failed to update status:", err)
    }
  }

  const handleStatusChange = async (taskId, newStatus) => {
    try {
      await updateTask(taskId, { status: newStatus })
      setStatusMenuOpen(null)
    } catch (err) {
      console.error("Failed to update status:", err)
    }
  }

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
            </div>

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
                    onDragStart={(e) => { setDraggedTaskId(task.id); e.dataTransfer.effectAllowed = 'move'; }}
                    className="bg-white border border-slate-200 rounded-xl p-4 hover:border-indigo-200 hover:shadow-sm transition-all cursor-grab active:cursor-grabbing group"
                  >
                      <div className="flex flex-col gap-3">
                      <div className="flex justify-between items-start gap-2">
                        <h4 className={`text-[13px] font-medium text-slate-800 leading-tight ${task.status === 'Completed' ? 'line-through text-slate-300' : ''}`}>
                          {task.title}
                        </h4>
                        <div className="status-menu-container relative">
                          <button 
                            onClick={() => setStatusMenuOpen(statusMenuOpen === task.id ? null : task.id)} 
                            className={`shrink-0 transition-colors ${task.status === 'Completed' ? 'text-emerald-500' : 'text-slate-200 hover:text-slate-400'}`}
                            title="Change status"
                          >
                            {task.status === 'Completed' ? <CheckCircle2 size={16} /> : <Circle size={16} />}
                          </button>
                          
                          {statusMenuOpen === task.id && (
                            <div className="absolute top-full right-0 mt-1 w-40 bg-white border border-slate-200 rounded-lg shadow-xl z-50 py-1">
                              {STATUSES.map(s => (
                                <button
                                  key={s.id}
                                  onClick={() => handleStatusChange(task.id, s.id)}
                                  className={`w-full text-left px-3 py-2 text-[11px] font-medium flex items-center gap-2 hover:bg-slate-50 transition-colors ${task.status === s.id ? 'bg-indigo-50 text-indigo-700' : 'text-slate-600'}`}
                                >
                                  {s.icon}
                                  {s.label}
                                  {task.status === s.id && <CheckCircle2 size={12} className="ml-auto text-indigo-600" />}
                                </button>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                      
                      {/* Task Details - Due Date, Priority, Assigned To */}
                      <div className="flex flex-col gap-2 mt-2 pt-2 border-t border-slate-100">
                        {/* Due Date & Priority */}
                        <div className="flex items-center gap-2 flex-wrap">
                          {task.dueDate && (
                            <div className={`px-2 py-1 rounded-md text-[10px] font-bold flex items-center gap-1.5 ${dueDateColor}`}>
                              <CalendarIcon size={12} />
                              {dueDateText}
                            </div>
                          )}
                          {task.priority === 'urgent' && (
                            <div className="px-2 py-1 rounded-md text-[10px] font-bold bg-rose-100 text-rose-600 flex items-center gap-1">
                              <span className="w-1.5 h-1.5 rounded-full bg-rose-500"></span>
                              URGENT
                            </div>
                          )}
                          {task.priority === 'high' && (
                            <div className="px-2 py-1 rounded-md text-[10px] font-bold bg-amber-100 text-amber-600 flex items-center gap-1">
                              <span className="w-1.5 h-1.5 rounded-full bg-amber-500"></span>
                              HIGH
                            </div>
                          )}
                        </div>
                        
                        {/* Assigned To Names */}
                        {assignees.length > 0 && (
                          <div className="flex items-center gap-1.5">
                            <User size={12} className="text-slate-400" />
                            <span className="text-[10px] text-slate-600 font-medium">
                              {assignees.map(e => e.name).join(', ')}
                            </span>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                )
              })}
              {/* Inline Add Task at Bottom */}
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
                      <button onClick={() => toggleStatus(task)} className={`transition-colors ${task.status === 'Completed' ? 'text-emerald-500' : 'text-slate-200 hover:text-slate-400'}`}>
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

  const renderIdeaTabView = () => (
    <div className="max-w-5xl mx-auto grid grid-cols-1 lg:grid-cols-12 gap-10">
      <div className="lg:col-span-4">
        <div className="bg-white rounded-3xl p-8 border border-slate-200 shadow-sm">
          <h3 className="text-xl font-bold mb-6 flex items-center gap-2 text-slate-800"><Lightbulb className="text-amber-400" /> Neural Link</h3>
          <form onSubmit={handleCreateTask} className="space-y-5">
            <div className="relative">
              <input
                type="text"
                required
                className="w-full bg-slate-50 border border-slate-100 rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none transition-all placeholder:text-slate-400 text-slate-700 font-medium"
                placeholder="CORE VISION..."
                value={newTask.title}
                onChange={(e) => handleTextChange('title', e.target.value)}
              />
              {mentionState.active && mentionState.targetField === 'title' && !mentionState.targetId && <div className="absolute top-full left-0 z-50 w-full"><MentionList /></div>}
            </div>
            <div className="relative">
              <textarea
                rows="4"
                className="w-full bg-slate-50 border border-slate-100 rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none transition-all placeholder:text-slate-400 text-slate-700 font-medium resize-none"
                placeholder="TECHNICAL DETAILS..."
                value={newTask.description}
                onChange={(e) => handleTextChange('description', e.target.value)}
              />
              {mentionState.active && mentionState.targetField === 'description' && !mentionState.targetId && <div className="absolute top-full left-0 z-50 w-full"><MentionList /></div>}
            </div>
            <button type="submit" className="w-full h-12 bg-indigo-600 text-white rounded-xl text-xs font-bold uppercase tracking-widest hover:bg-indigo-700 transition-all shadow-md active:scale-95">Transmit Idea</button>
          </form>
        </div>
      </div>
      <div className="lg:col-span-8 space-y-4">
        {filteredTasks.map(idea => (
          <div key={idea.id} className="bg-white border border-slate-200 rounded-2xl p-6 hover:border-indigo-300 transition-all flex justify-between items-center gap-6 group shadow-sm">
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-2">
                <span className="text-[10px] font-bold text-indigo-600 uppercase tracking-widest">ACTIVE NODE</span>
                <span className="text-[10px] text-slate-300 font-bold uppercase tracking-tighter">{idea.createdAt ? formatDistanceToNow(idea.createdAt.toDate(), { addSuffix: true }).toUpperCase() : 'JUST NOW'}</span>
              </div>
              <h5 className="text-lg font-bold text-slate-800 uppercase tracking-tight">{idea.title}</h5>
              {idea.description && <p className="text-slate-400 text-sm mt-2 line-clamp-2">{idea.description}</p>}
            </div>
            <button onClick={() => deleteTask(idea.id)} className="p-3 text-slate-200 hover:text-rose-500 hover:bg-rose-50 rounded-xl transition-all opacity-0 group-hover:opacity-100">
              <Trash2 size={18} />
            </button>
          </div>
        ))}
      </div>
    </div>
  )

  if (loading) return <div className="h-64 flex items-center justify-center"><Spinner /></div>

  return (
    <div className="flex flex-col h-full bg-slate-50/50 font-inter selection:bg-indigo-100">
      <div className="bg-white border-b border-slate-200 px-8 py-6 flex flex-col lg:flex-row lg:items-center justify-between gap-6 shrink-0">
        <div>
          <h1 className="text-2xl font-black text-slate-900 tracking-tight flex items-center gap-3 leading-none uppercase">
            Tasks <span className="text-slate-200 font-thin">/</span> <span className="text-indigo-600 tracking-tighter">{TABS.find(t => t.id === activeTab)?.label}</span>
          </h1>
          <div className="flex items-center gap-1 mt-4">
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

      <div className="flex-1 overflow-auto p-8 lg:p-10">
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
            {viewMode === 'dashboard' && renderDashboardView()}
          </div>
        )}
      </div>

      {/* Modern Task Modal */}
      <Modal isOpen={showAddModal} onClose={() => setShowAddModal(false)} title="New Directive" size="2xl">
        <form onSubmit={handleCreateTask} className="p-8 space-y-8">
          <div className="space-y-6">
            <div className="relative">
              <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">Primary Objective</label>
              <input
                type="text"
                required
                className="w-full bg-slate-50/50 border-b-2 border-slate-100 focus:border-indigo-500 text-xl font-bold text-slate-800 transition-all outline-none pb-2 placeholder:text-slate-200"
                placeholder="WHAT NEEDS TO BE DONE?"
                value={newTask.title}
                onChange={e => handleTextChange('title', e.target.value)}
              />
              {mentionState.active && mentionState.targetField === 'title' && !mentionState.targetId && <MentionList />}
            </div>

            <div className="relative">
              <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">Operational Details</label>
              <textarea
                className="w-full bg-slate-50/50 border border-slate-100 focus:border-indigo-500 rounded-xl p-4 text-sm font-medium text-slate-600 transition-all outline-none min-h-[100px] resize-none placeholder:text-slate-300"
                placeholder="ADDITIONAL CONTEXT..."
                value={newTask.description}
                onChange={e => handleTextChange('description', e.target.value)}
              />
              {mentionState.active && mentionState.targetField === 'description' && !mentionState.targetId && <MentionList />}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-8">
            <div className="space-y-2">
              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Protocol</label>
              <select className="w-full bg-slate-50 border border-slate-100 rounded-xl px-4 py-3 text-sm font-bold text-slate-700 outline-none" value={newTask.priority} onChange={e => setNewTask({...newTask, priority: e.target.value})}>
                <option value="normal">NORMAL</option>
                <option value="high">HIGH</option>
                <option value="urgent">URGENT</option>
              </select>
            </div>
            <div className="space-y-2">
              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Temporal Key</label>
              <DatePicker selected={newTask.dueDate} onChange={date => setNewTask({...newTask, dueDate: date})} className="w-full bg-slate-50 border border-slate-100 rounded-xl px-4 py-3 text-sm font-bold text-slate-700 outline-none" placeholderText="SET DEADLINE" dateFormat="MMM d, yyyy" />
            </div>
          </div>

          <div className="space-y-3">
            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Personnel Assignment</label>
            <div className="flex flex-wrap gap-2 p-4 bg-slate-50 border border-slate-100 rounded-2xl min-h-[60px]">
              {taskEmployees.map(emp => {
                const isSelected = newTask.assignedTo?.includes(emp.id)
                return (
                  <button key={emp.id} type="button" onClick={() => {
                    const current = newTask.assignedTo || []
                    const updated = isSelected ? current.filter(id => id !== emp.id) : [...current, emp.id]
                    setNewTask({ ...newTask, assignedTo: updated })
                  }} className={`px-4 py-2 rounded-xl text-[11px] font-bold transition-all border ${isSelected ? 'bg-indigo-600 border-indigo-600 text-white shadow-lg shadow-indigo-100' : 'bg-white border-slate-200 text-slate-500 hover:border-indigo-300'}`}>
                    {emp.name}
                  </button>
                )
              })}
            </div>
          </div>

          <div className="flex gap-4 pt-6 border-t border-slate-100">
            <button type="button" onClick={() => setShowAddModal(false)} className="flex-1 h-14 bg-slate-100 text-slate-500 font-bold uppercase text-xs tracking-widest rounded-2xl hover:bg-slate-200 transition-all">Abort</button>
            <button type="submit" className="flex-[2] h-14 bg-slate-900 text-white font-bold uppercase text-xs tracking-[0.2em] rounded-2xl hover:bg-indigo-600 transition-all shadow-xl shadow-slate-200">Initialize Directive</button>
          </div>
        </form>
      </Modal>

      {/* Directive Summary Modal */}
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
