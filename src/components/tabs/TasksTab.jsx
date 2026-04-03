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
  { id: 'To Do', label: 'To Do', icon: <Circle size={16} className="text-gray-400" />, bgColor: 'bg-transparent' },
  { id: 'In Progress', label: 'In Progress', icon: <PlayCircle size={16} className="text-blue-500" />, bgColor: 'bg-transparent' },
  { id: 'On Hold', label: 'On Hold', icon: <Clock size={16} className="text-orange-500" />, bgColor: 'bg-transparent' },
  { id: 'Review', label: 'Review', icon: <CheckCircle size={16} className="text-purple-500" />, bgColor: 'bg-transparent' },
  { id: 'Completed', label: 'Completed', icon: <CheckCircle2 size={16} className="text-green-500" />, bgColor: 'bg-transparent' }
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

  const getInitials = (name) => {
    if (!name) return '??'
    return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)
  }

  const renderBoardView = () => (
    <div className="flex gap-8 h-full min-w-full overflow-x-auto pb-8 no-scrollbar">
      {STATUSES.map(status => (
        <div 
          key={status.id} 
          className="flex flex-col min-w-[320px] max-w-[320px] shrink-0"
          onDragOver={handleDragOver}
          onDrop={(e) => handleDrop(e, status.id)}
        >
          {/* Brutal Column Header */}
          <div className="flex items-center justify-between mb-6 pb-4 border-b-2 border-zinc-900">
            <div className="flex items-center gap-3">
              <span className="text-[11px] font-black uppercase tracking-[0.2em] text-zinc-900">
                {status.label}
              </span>
              <span className="text-[10px] font-black text-white bg-zinc-900 px-2 py-0.5 rounded tabular-nums">
                {filteredTasks.filter(t => t.status === status.id || (status.id === 'To Do' && (t.status === 'Inbox' || t.status === 'To-do'))).length}
              </span>
            </div>
            <button className="text-zinc-300 hover:text-zinc-900 transition-colors">
              <Plus size={14} strokeWidth={3} />
            </button>
          </div>

          {/* Task Stream */}
          <div className="flex-1 space-y-4 min-h-[600px]">
            {/* Inline Input - Instrument Style */}
            <div className="relative group">
              <input
                type="text"
                placeholder="ADD EXPEDITION..."
                className="w-full bg-zinc-50 border border-zinc-100 focus:border-zinc-900 focus:bg-white px-4 py-3 text-[11px] font-black uppercase tracking-tight outline-none transition-all placeholder:text-zinc-200"
                value={inlineInputs[status.id] || ''}
                onChange={(e) => setInlineInputs({ ...inlineInputs, [status.id]: e.target.value })}
                onKeyDown={(e) => handleInlineCreate(status.id, e)}
              />
              {inlineInputs[status.id]?.trim() && (
                <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-2 animate-in fade-in zoom-in duration-200">
                  <button onClick={() => handleInlineCreate(status.id)} className="bg-zinc-900 text-white p-1 rounded transition-all active:scale-90">
                    <ArrowRight size={14} strokeWidth={3} />
                  </button>
                </div>
              )}
            </div>

            {/* Manifest Cards */}
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
                    className="group bg-white border border-zinc-100 p-5 hover:border-zinc-900 hover:shadow-xl hover:shadow-zinc-100 transition-all cursor-grab active:cursor-grabbing relative overflow-hidden"
                  >
                    <div className="flex flex-col gap-4">
                      <div className="flex justify-between items-start gap-3">
                        <h4 className={`text-[14px] font-black text-zinc-900 leading-tight uppercase tracking-tight break-words ${
                          task.status === 'Completed' ? 'line-through text-zinc-300' : ''
                        }`}>
                          {task.title}
                        </h4>
                        <button 
                          onClick={() => toggleStatus(task)}
                          className={`shrink-0 transition-all ${
                            task.status === 'Completed' ? 'text-emerald-500' : 'text-zinc-200 hover:text-zinc-900'
                          }`}
                        >
                          {task.status === 'Completed' ? <CheckCircle2 size={18} strokeWidth={3} /> : <Circle size={18} strokeWidth={3} />}
                        </button>
                      </div>
                      
                      {task.description && (
                        <p className="text-[10px] font-medium text-zinc-400 uppercase tracking-widest line-clamp-2 leading-relaxed">
                          {task.description}
                        </p>
                      )}

                      <div className="flex items-center justify-between pt-4 border-t border-zinc-50">
                        <div className="flex items-center gap-3">
                          {task.dueDate && (
                            <div className={`flex items-center gap-1.5 px-2 py-0.5 rounded-md text-[9px] font-black uppercase tracking-tighter ${dueDateColor.includes('red') ? 'bg-rose-50 text-rose-600' : 'bg-zinc-50 text-zinc-400'}`}>
                              <Clock size={10} strokeWidth={3} />
                              <span>{dueDateText.toUpperCase()}</span>
                            </div>
                          )}
                          {(task.priority || 'normal') !== 'normal' && (
                            <span className={`text-[9px] font-black uppercase tracking-widest ${task.priority === 'urgent' ? 'text-rose-600' : 'text-amber-500'}`}>
                              {task.priority}
                            </span>
                          )}
                        </div>

                        {assignees.length > 0 && (
                          <div className="flex -space-x-2">
                            {assignees.slice(0, 3).map(emp => (
                              <div 
                                key={emp.id} 
                                className="w-6 h-6 rounded bg-zinc-900 border-2 border-white flex items-center justify-center text-[8px] text-white font-black uppercase shadow-sm"
                                title={emp.name}
                              >
                                {getInitials(emp.name)}
                              </div>
                            ))}
                          </div>
                        )}
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
    <div className="bg-white border border-zinc-100 overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse min-w-[1000px]">
          <thead>
            <tr className="bg-zinc-900 text-white h-14">
              <th className="px-8 text-[10px] font-black uppercase tracking-[0.2em] opacity-50 border-r border-zinc-800">Designation</th>
              <th className="px-8 text-[10px] font-black uppercase tracking-[0.2em] opacity-50 border-r border-zinc-800">Operational Status</th>
              <th className="px-8 text-[10px] font-black uppercase tracking-[0.2em] opacity-50 border-r border-zinc-800 text-center">Protocol</th>
              <th className="px-8 text-[10px] font-black uppercase tracking-[0.2em] opacity-50 border-r border-zinc-800">Temporal Key</th>
              <th className="px-8 text-[10px] font-black uppercase tracking-[0.2em] opacity-50 border-r border-zinc-800">Personnel</th>
              <th className="px-8 text-[10px] font-black uppercase tracking-[0.2em] opacity-50 text-right">Ops</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100">
            {filteredTasks.length === 0 ? (
              <tr>
                <td colSpan="6" className="py-32 text-center text-zinc-200 font-black uppercase tracking-[0.3em] text-2xl italic">System Empty</td>
              </tr>
            ) : (
              filteredTasks.map(task => {
                const assignees = getAssigneeInfo(task.assignedTo)
                
                return (
                  <tr key={task.id} className="hover:bg-zinc-50 transition-colors group">
                    <td className="px-8 py-6 border-r border-zinc-50">
                      <div className="flex items-center gap-4">
                        <button onClick={() => toggleStatus(task)} className={`shrink-0 transition-colors ${task.status === 'Completed' ? 'text-emerald-500' : 'text-zinc-200 hover:text-zinc-900'}`}>
                          {task.status === 'Completed' ? <CheckCircle2 size={20} strokeWidth={3} /> : <Circle size={20} strokeWidth={3} />}
                        </button>
                        <div className="flex flex-col">
                          <span className={`text-[14px] font-black text-zinc-900 uppercase tracking-tight leading-none mb-1.5 ${task.status === 'Completed' ? 'line-through text-zinc-300' : ''}`}>
                            {task.title}
                          </span>
                          <span className="text-[9px] font-bold text-zinc-400 uppercase tracking-widest">{task.category === 'idea' ? 'Neural Link / Idea' : 'Field Directive'}</span>
                        </div>
                      </div>
                    </td>
                    <td className="px-8 py-6 border-r border-zinc-50">
                      <span className={`px-3 py-1 rounded text-[9px] font-black uppercase tracking-[0.1em] border-2 ${
                        task.status === 'Completed' ? 'border-emerald-500 text-emerald-600' :
                        task.status === 'In Progress' ? 'border-indigo-600 text-indigo-600' :
                        'border-zinc-200 text-zinc-400'
                      }`}>
                        {task.status}
                      </span>
                    </td>
                    <td className="px-8 py-6 border-r border-zinc-50 text-center">
                      <span className={`text-[10px] font-black uppercase tracking-widest ${
                        task.priority === 'urgent' ? 'text-rose-600' : 'text-zinc-400'
                      }`}>
                        {task.priority || 'Normal'}
                      </span>
                    </td>
                    <td className="px-8 py-6 border-r border-zinc-50">
                      <div className={`flex items-center gap-2 text-[11px] font-black tabular-nums ${getDueDateColor(task.dueDate).includes('red') ? 'text-rose-600' : 'text-zinc-900'}`}>
                        {task.dueDate ? formatDueDate(task.dueDate).toUpperCase() : 'NO DEADLINE'}
                      </div>
                    </td>
                    <td className="px-8 py-6 border-r border-zinc-50">
                      <div className="flex -space-x-2">
                        {assignees.map(emp => (
                          <div key={emp.id} className="w-8 h-8 rounded bg-zinc-900 border-2 border-white flex items-center justify-center text-[10px] text-white font-black uppercase" title={emp.name}>
                            {getInitials(emp.name)}
                          </div>
                        ))}
                      </div>
                    </td>
                    <td className="px-8 py-6 text-right">
                      <button onClick={() => deleteTask(task.id)} className="p-2 text-zinc-300 hover:text-rose-600 transition-colors">
                        <Trash2 size={16} strokeWidth={3} />
                      </button>
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
    <div className="max-w-screen-2xl mx-auto grid grid-cols-1 xl:grid-cols-12 gap-12">
      {/* Idea Uplink */}
      <div className="xl:col-span-4 space-y-8">
        <div className="bg-zinc-900 rounded-[32px] p-10 text-white">
          <h3 className="text-2xl font-black uppercase tracking-tighter mb-8 flex items-center gap-3">
            <Lightbulb className="text-indigo-400" /> Neural Uplink
          </h3>
          <form onSubmit={handleCreateTask} className="space-y-6">
            <div className="space-y-2">
              <label className="text-[10px] font-black uppercase tracking-widest opacity-40">Concept Designation</label>
              <input
                type="text"
                required
                className="w-full bg-zinc-800 border-none rounded-2xl px-6 py-4 text-[13px] font-bold text-white focus:ring-2 focus:ring-indigo-500 outline-none transition-all uppercase placeholder:text-zinc-600"
                placeholder="Core Vision..."
                value={newTask.title}
                onChange={(e) => setNewTask({ ...newTask, title: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <label className="text-[10px] font-black uppercase tracking-widest opacity-40">Expansion Data</label>
              <textarea
                rows="4"
                className="w-full bg-zinc-800 border-none rounded-2xl px-6 py-4 text-[13px] font-bold text-white focus:ring-2 focus:ring-indigo-500 outline-none transition-all uppercase placeholder:text-zinc-600 resize-none"
                placeholder="Technical Breakdown..."
                value={newTask.description}
                onChange={(e) => setNewTask({ ...newTask, description: e.target.value })}
              />
            </div>
            <button type="submit" className="w-full h-16 bg-white text-zinc-900 rounded-[20px] text-[11px] font-black uppercase tracking-[0.2em] hover:bg-indigo-400 transition-all shadow-xl shadow-indigo-500/10">
              Transmit Idea
            </button>
          </form>
        </div>
      </div>

      {/* Idea Manifest */}
      <div className="xl:col-span-8 space-y-8">
        <div className="flex items-center justify-between">
          <h4 className="text-[11px] font-black text-zinc-400 uppercase tracking-[0.3em]">Idea Archive / Active Stream</h4>
          <span className="px-3 py-1 bg-zinc-100 rounded text-[10px] font-black text-zinc-900 tabular-nums">{filteredTasks.length} NODES</span>
        </div>
        
        <div className="space-y-4">
          {filteredTasks.map(idea => (
            <div key={idea.id} className="group bg-white border border-zinc-100 rounded-[24px] p-8 hover:border-zinc-900 transition-all duration-500 flex flex-col md:flex-row justify-between items-center gap-8">
              <div className="flex-1">
                <div className="flex items-center gap-3 mb-3">
                  <span className="text-[9px] font-black text-indigo-600 uppercase tracking-widest">Node Alpha</span>
                  <span className="text-[9px] font-bold text-zinc-300 uppercase tracking-widest">{idea.createdAt ? formatDistanceToNow(idea.createdAt.toDate(), { addSuffix: true }).toUpperCase() : 'NOW'}</span>
                </div>
                <h5 className="text-xl font-black text-zinc-900 uppercase tracking-tight group-hover:text-indigo-600 transition-colors leading-none">{idea.title}</h5>
                {idea.description && <p className="text-zinc-400 text-xs font-medium mt-3 uppercase tracking-wide leading-relaxed line-clamp-2">{idea.description}</p>}
              </div>
              <div className="flex items-center gap-4">
                <button onClick={() => deleteTask(idea.id)} className="p-4 text-zinc-200 hover:text-rose-600 hover:bg-rose-50 rounded-2xl transition-all">
                  <Trash2 size={20} strokeWidth={3} />
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )

  const renderDashboardView = () => {
    const stats = {
      total: filteredTasks.length,
      completed: filteredTasks.filter(t => t.status === 'Completed').length,
      active: filteredTasks.filter(t => t.status !== 'Completed').length,
      urgent: filteredTasks.filter(t => t.priority === 'urgent').length,
      overdue: filteredTasks.filter(t => {
        if (!t.dueDate || t.status === 'Completed') return false
        const d = t.dueDate.toDate ? t.dueDate.toDate() : new Date(t.dueDate)
        return d < new Date()
      }).length
    }

    const completionRate = stats.total > 0 ? Math.round((stats.completed / stats.total) * 100) : 0

    return (
      <div className="max-w- screen-2xl mx-auto space-y-12">
        {/* Core Metrics */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
          {[
            { label: 'System Load', value: stats.total, sub: 'Global Units', color: 'zinc' },
            { label: 'Operational Efficiency', value: `${completionRate}%`, sub: 'Projected Output', color: 'indigo' },
            { label: 'Critical Assets', value: stats.urgent, sub: 'Immediate Oversight', color: 'rose' },
            { label: 'Temporal Breach', value: stats.overdue, sub: 'Past Protocol', color: 'amber' }
          ].map(stat => (
            <div key={stat.label} className="bg-zinc-900 p-8 rounded-[32px] text-white relative overflow-hidden shadow-2xl">
              <div className={`absolute top-0 right-0 w-24 h-24 rounded-full -mr-12 -mt-12 bg-white/5 opacity-20`}></div>
              <p className="text-[10px] font-black text-zinc-500 uppercase tracking-[0.2em] mb-4">{stat.label}</p>
              <div className="flex items-baseline gap-2">
                <span className="text-4xl font-black tracking-tighter tabular-nums">{stat.value}</span>
                <span className="text-[10px] font-black text-zinc-600 uppercase">{stat.sub}</span>
              </div>
            </div>
          ))}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-12">
          {/* Load Distribution */}
          <div className="lg:col-span-7 bg-white border border-zinc-100 rounded-[40px] p-10">
            <h4 className="text-[11px] font-black text-zinc-400 uppercase tracking-[0.3em] mb-10">Asset Load Distribution</h4>
            <div className="space-y-8">
              {STATUSES.map(status => {
                const count = filteredTasks.filter(t => t.status === status.id || (status.id === 'To Do' && (t.status === 'Inbox' || t.status === 'To-do'))).length
                const percent = stats.total > 0 ? (count / stats.total) * 100 : 0
                return (
                  <div key={status.id} className="group">
                    <div className="flex justify-between items-end mb-3">
                      <span className="text-[11px] font-black text-zinc-900 uppercase tracking-widest">{status.label}</span>
                      <span className="text-[11px] font-black text-zinc-400 tabular-nums">{count} UNITS</span>
                    </div>
                    <div className="h-4 bg-zinc-50 rounded-full overflow-hidden border border-zinc-100">
                      <div 
                        className={`h-full transition-all duration-1000 ${
                          status.id === 'Completed' ? 'bg-emerald-500' :
                          status.id === 'In Progress' ? 'bg-indigo-600' :
                          'bg-zinc-900'
                        }`} 
                        style={{ width: `${percent}%` }} 
                      />
                    </div>
                  </div>
                )
              })}
            </div>
          </div>

          {/* Temporal Distribution */}
          <div className="lg:col-span-5 bg-white border border-zinc-100 rounded-[40px] p-10 flex flex-col">
            <h4 className="text-[11px] font-black text-zinc-400 uppercase tracking-[0.3em] mb-10">Temporal Priority Map</h4>
            <div className="flex-1 flex items-end justify-between gap-4 px-4 pb-4">
              {['Normal', 'High', 'Urgent'].map(p => {
                const count = filteredTasks.filter(t => (t.priority || 'normal').toLowerCase() === p.toLowerCase()).length
                const height = stats.total > 0 ? (count / stats.total) * 100 : 5
                return (
                  <div key={p} className="flex-1 flex flex-col items-center gap-4">
                    <span className="text-[11px] font-black text-zinc-900 tabular-nums">{count}</span>
                    <div 
                      className={`w-full transition-all duration-1000 ${
                        p === 'Urgent' ? 'bg-rose-600' :
                        p === 'High' ? 'bg-amber-500' :
                        'bg-zinc-900'
                      }`}
                      style={{ height: `${height}%`, minHeight: '8px' }}
                    />
                    <span className="text-[10px] font-black text-zinc-400 uppercase tracking-widest rotate-[-45deg] mt-4 origin-top-left">{p}</span>
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
    <div className="flex flex-col h-full bg-white font-inter selection:bg-indigo-100 selection:text-indigo-900">
      {/* Brutal Header */}
      <div className="border-b border-zinc-100 px-8 py-10 flex flex-col lg:flex-row lg:items-end justify-between gap-8 shrink-0">
        <div>
          <h1 className="text-4xl font-black text-zinc-900 uppercase tracking-tighter leading-none">
            Task<span className="text-indigo-600">.</span>Manifest
          </h1>
          <div className="flex items-center gap-4 mt-4">
            <div className="flex items-center bg-zinc-900 p-1 rounded-lg">
              {TABS.map(tab => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`px-5 py-1.5 rounded-md text-[10px] font-black uppercase tracking-widest transition-all ${
                    activeTab === tab.id 
                      ? 'bg-white text-zinc-900 shadow-sm' 
                      : 'text-zinc-400 hover:text-zinc-200'
                  }`}
                >
                  {tab.label.split(' ')[0]}
                </button>
              ))}
            </div>
            <span className="text-[10px] font-bold text-zinc-300 uppercase tracking-[0.2em] hidden sm:block">Operations Command</span>
          </div>
        </div>

        <div className="flex items-center gap-4">
          {activeTab !== 'reminders' && activeTab !== 'idea' && (
            <div className="flex items-center bg-zinc-100 p-1 rounded-lg border border-zinc-200">
              <button
                onClick={() => setViewMode('board')}
                className={`px-3 py-1.5 rounded-md text-[10px] font-black uppercase tracking-widest transition-all ${
                  viewMode === 'board' ? 'bg-white text-zinc-900 shadow-sm' : 'text-zinc-400 hover:text-zinc-600'
                }`}
              >
                Board
              </button>
              <button
                onClick={() => setViewMode('table')}
                className={`px-3 py-1.5 rounded-md text-[10px] font-black uppercase tracking-widest transition-all ${
                  viewMode === 'table' ? 'bg-white text-zinc-900 shadow-sm' : 'text-zinc-400 hover:text-zinc-600'
                }`}
              >
                Table
              </button>
              <button
                onClick={() => setViewMode('dashboard')}
                className={`px-3 py-1.5 rounded-md text-[10px] font-black uppercase tracking-widest transition-all ${
                  viewMode === 'dashboard' ? 'bg-white text-zinc-900 shadow-sm' : 'text-zinc-400 hover:text-zinc-600'
                }`}
              >
                Stats
              </button>
            </div>
          )}
          
          <button 
            onClick={() => {
              if (activeTab === 'reminders') {
                setShowReminderModal(true)
              } else {
                setNewTask({ ...newTask, isPersonal: activeTab === 'personal', category: activeTab === 'idea' ? 'idea' : 'task' })
                setShowAddModal(true)
              }
            }}
            className="h-12 px-8 bg-indigo-600 text-white text-[11px] font-black uppercase tracking-[0.2em] flex items-center justify-center gap-3 hover:bg-zinc-900 transition-all active:scale-95 shadow-xl shadow-indigo-100"
          >
            {activeTab === 'reminders' ? 'Broadcast' : 'New Directive'} <Plus size={16} strokeWidth={4} />
          </button>
        </div>
      </div>

      {/* Manifest Control Bar - Filters */}
      {activeTab === 'team' && (
        <div className="px-8 py-4 border-b border-zinc-50 bg-zinc-50/30 flex items-center gap-6 overflow-x-auto no-scrollbar">
          <div className="flex items-center gap-2 shrink-0">
            <Filter size={14} className="text-zinc-400" />
            <span className="text-[10px] font-black text-zinc-400 uppercase tracking-widest">Protocol Filter:</span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setClientFilter('all')}
              className={`px-4 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest border transition-all ${
                clientFilter === 'all'
                  ? 'bg-zinc-900 text-white border-zinc-900'
                  : 'bg-white text-zinc-400 border-zinc-200 hover:border-zinc-400'
              }`}
            >
              All Assets ({tasks.filter(t => !t.isPersonal && t.category === 'task').length})
            </button>
            {CLIENT_TYPES.map(type => {
              const count = tasks.filter(t => !t.isPersonal && t.category === 'task' && t.clientType === type.id).length
              return (
                <button
                  key={type.id}
                  onClick={() => setClientFilter(type.id)}
                  className={`px-4 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest border transition-all flex items-center gap-2 ${
                    clientFilter === type.id
                      ? 'bg-indigo-600 text-white border-indigo-600'
                      : 'bg-white text-zinc-400 border-zinc-200 hover:border-zinc-400'
                  }`}
                >
                  <span className="grayscale brightness-200 contrast-200">{type.icon}</span>
                  {type.label} ({count})
                </button>
              )
            })}
            <button
              onClick={() => setClientFilter('internal')}
              className={`px-4 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest border transition-all ${
                clientFilter === 'internal'
                  ? 'bg-amber-500 text-white border-amber-500'
                  : 'bg-white text-zinc-400 border-zinc-200 hover:border-zinc-400'
              }`}
            >
              Internal Operations ({tasks.filter(t => !t.isPersonal && t.category === 'task' && !t.clientName && !t.clientType).length})
            </button>
          </div>
        </div>
      )}

      {/* Content Engine */}
      <div className="flex-1 overflow-auto p-8 lg:p-12">
        {activeTab === 'reminders' ? (
          <div className="max-w-4xl mx-auto space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-700">
            {reminders.length === 0 ? (
              <div className="py-40 text-center border-2 border-dashed border-zinc-100 rounded-[40px] opacity-20 italic">
                <Bell size={48} className="mx-auto mb-4" />
                <p className="font-black uppercase tracking-widest text-lg">Communication Silenced</p>
              </div>
            ) : (
              <div className="grid gap-6">
                {reminders.map(reminder => (
                  <div 
                    key={reminder.id}
                    onClick={() => setSelectedReminder(reminder)}
                    className="group bg-white border-2 border-zinc-100 rounded-[32px] p-8 hover:border-zinc-900 transition-all duration-500 cursor-pointer relative overflow-hidden"
                  >
                    <div className="flex flex-col md:flex-row justify-between items-start gap-6 relative z-10">
                      <div className="flex-1 space-y-4">
                        <div className="flex items-center gap-3">
                          <span className={`px-3 py-1 text-[9px] font-black uppercase tracking-widest border-2 ${
                            reminder.type === 'general' ? 'border-indigo-600 text-indigo-600' : 
                            reminder.type === 'targeted' ? 'border-amber-500 text-amber-600' : 'border-zinc-900 text-zinc-900'
                          }`}>
                            {reminder.type} Directive
                          </span>
                          <span className="text-[10px] font-bold text-zinc-300 uppercase tracking-widest">
                            {reminder.createdAt ? formatDistanceToNow(reminder.createdAt.toDate(), { addSuffix: true }).toUpperCase() : 'INITIALIZING'}
                          </span>
                        </div>
                        <h4 className="text-2xl font-black text-zinc-900 uppercase tracking-tighter leading-none group-hover:text-indigo-600 transition-colors">{reminder.title}</h4>
                        <p className="text-zinc-500 text-sm font-medium leading-relaxed line-clamp-2 uppercase tracking-wide">{reminder.content}</p>
                      </div>
                      
                      {reminder.reminderDate && (
                        <div className="flex flex-col items-end">
                          <span className="text-[9px] font-black text-zinc-300 uppercase tracking-widest mb-1">Impact Date</span>
                          <span className="text-sm font-black text-indigo-600 tabular-nums uppercase">
                            {new Date(reminder.reminderDate.toDate ? reminder.reminderDate.toDate() : reminder.reminderDate).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' }).toUpperCase()}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
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
              <label className="block text-[12px] font-600 text-gray-700 mb-2">Task Title</label>
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
              <label className="block text-[12px] font-600 text-gray-700 mb-2">Description</label>
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
                <label className="block text-[12px] font-600 text-gray-700 mb-2">Priority</label>
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
                <label className="block text-[12px] font-600 text-gray-700 mb-2">Initial Status</label>
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
                <label className="block text-[12px] font-600 text-gray-700 mb-2">Due Date</label>
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
                <label className="block text-[12px] font-600 text-gray-700 mb-2">Internal Notes</label>
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
            <label className="block text-[12px] font-600 text-gray-700 mb-2">Assign To</label>
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
