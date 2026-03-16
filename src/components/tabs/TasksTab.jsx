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
  X
} from 'lucide-react'
import { useAuth } from '../../hooks/useAuth'
import { useEmployees } from '../../hooks/useEmployees'
import { useTasks } from '../../hooks/useTasks'
import { db } from '../../lib/firebase'
import { collection, query, where, getDocs } from 'firebase/firestore'
import Spinner from '../ui/Spinner'
import Modal from '../ui/Modal'

const STATUSES = [
  { id: 'Inbox', label: 'Inbox', icon: <Inbox size={16} className="text-gray-400" /> },
  { id: 'To-do', label: 'To-do', icon: <Circle size={16} className="text-blue-400" /> },
  { id: 'In Progress', label: 'In Progress', icon: <PlayCircle size={16} className="text-orange-400" /> },
  { id: 'Completed', label: 'Completed', icon: <CheckCircle2 size={16} className="text-green-500" /> }
]

const TABS = [
  { id: 'team', label: 'Team Task', icon: <User size={16} /> },
  { id: 'personal', label: 'Personal Task', icon: <User size={16} /> },
  { id: 'idea', label: 'Idea Tab', icon: <Lightbulb size={16} /> }
]

export default function TasksTab() {
  const { user } = useAuth()
  const { employees } = useEmployees(user?.orgId)
  const { tasks, loading, addTask, updateTask, deleteTask } = useTasks(user?.orgId)
  
  const [users, setUsers] = useState([])
  const [activeTab, setActiveTab] = useState('team')
  const [showAddModal, setShowAddModal] = useState(false)
  const [inlineInputs, setInlineInputs] = useState({})
  const [draggedTaskId, setDraggedTaskId] = useState(null)
  
  const [newTask, setNewTask] = useState({
    title: '',
    description: '',
    status: 'Inbox',
    assignedTo: [],
    isPersonal: false,
    category: 'task',
    dueDate: null,
    priority: 'normal',
    notes: ''
  })

  // Filter tasks based on active tab
  const filteredTasks = useMemo(() => {
    if (activeTab === 'idea') {
      return tasks.filter(t => t.category === 'idea')
    }
    if (activeTab === 'personal') {
      return tasks.filter(t => t.isPersonal && t.category === 'task')
    }
    // Team tasks: not personal and category is task
    return tasks.filter(t => !t.isPersonal && t.category === 'task')
  }, [tasks, activeTab])

  const handleInlineCreate = async (status, e) => {
    if (e.key === 'Enter' && inlineInputs[status]?.trim()) {
      const title = inlineInputs[status].trim()
      try {
        await addTask({
          title,
          status,
          isPersonal: activeTab === 'personal',
          category: activeTab === 'idea' ? 'idea' : 'task',
          assignedTo: activeTab === 'personal' ? [user.uid] : []
        })
        setInlineInputs({ ...inlineInputs, [status]: '' })
      } catch (err) {
        alert('Failed to create task')
      }
    }
  }

  const handleCreateTask = async (e) => {
    e.preventDefault()
    if (!newTask.title.trim()) return
    try {
      await addTask({
        ...newTask,
        category: activeTab === 'idea' ? 'idea' : 'task'
      })
      setShowAddModal(false)
      setNewTask({
        title: '',
        description: '',
        status: 'Inbox',
        assignedTo: [],
        isPersonal: activeTab === 'personal',
        category: 'task',
        dueDate: null,
        priority: 'normal',
        notes: ''
      })
    } catch (err) {
      alert('Failed to create task')
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
    const nextStatus = {
      'Inbox': 'To-do',
      'To-do': 'In Progress',
      'In Progress': 'Completed',
      'Completed': 'To-do'
    }
    try {
      await updateTask(task.id, { status: nextStatus[task.status] || 'To-do' })
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

  const loginEnabledEmployees = useMemo(() => {
    return employees.filter(emp => users.some(u => u.email === emp.email))
  }, [employees, users])

  if (loading) return <div className="h-64 flex items-center justify-center"><Spinner /></div>

  return (
    <div className="flex flex-col h-full bg-white text-gray-900 font-sans">
      {/* Header & Tabs */}
      <div className="px-6 py-4 border-b border-gray-100">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold tracking-tight">Tasks</h1>
          <button 
            onClick={() => {
              setNewTask({ ...newTask, isPersonal: activeTab === 'personal', category: activeTab === 'idea' ? 'idea' : 'task' })
              setShowAddModal(true)
            }}
            className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-all shadow-sm active:scale-95"
          >
            <Plus size={18} />
            <span>New Task</span>
          </button>
        </div>

        <div className="flex gap-1">
          {TABS.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                activeTab === tab.id 
                  ? 'bg-gray-100 text-gray-900' 
                  : 'text-gray-500 hover:bg-gray-50 hover:text-gray-700'
              }`}
            >
              {tab.icon}
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Kanban Board */}
      <div className="flex-1 overflow-x-auto p-6 bg-gray-50/50">
        <div className="flex gap-6 h-full min-w-max">
          {STATUSES.map(status => (
            <div 
              key={status.id} 
              className="flex flex-col w-72"
              onDragOver={handleDragOver}
              onDrop={(e) => handleDrop(e, status.id)}
            >
              {/* Column Header */}
              <div className="flex items-center justify-between px-2 mb-3">
                <div className="flex items-center gap-2">
                  <span className="p-1 rounded bg-white shadow-sm border border-gray-100">
                    {status.icon}
                  </span>
                  <span className="text-sm font-semibold uppercase tracking-wider text-gray-500">
                    {status.label}
                  </span>
                  <span className="text-xs font-bold text-gray-400 bg-gray-200/50 px-2 py-0.5 rounded-full">
                    {filteredTasks.filter(t => t.status === status.id).length}
                  </span>
                </div>
                <button className="text-gray-400 hover:text-gray-600 p-1 hover:bg-white rounded transition-colors">
                  <MoreHorizontal size={16} />
                </button>
              </div>

              {/* Task List */}
              <div className="flex-1 space-y-3">
                {/* Inline Quick Add */}
                <div className="group relative">
                  <input
                    type="text"
                    placeholder="Type to add task..."
                    className="w-full bg-white border border-transparent focus:border-indigo-200 focus:ring-4 focus:ring-indigo-50/50 rounded-xl px-4 py-3 text-sm outline-none transition-all placeholder:text-gray-300 shadow-sm"
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

                {filteredTasks
                  .filter(t => t.status === status.id)
                  .map(task => (
                    <div
                      key={task.id}
                      draggable
                      onDragStart={(e) => handleDragStart(e, task.id)}
                      onDragEnd={handleDragEnd}
                      className="group bg-white border border-gray-100 rounded-xl p-4 shadow-sm hover:shadow-md hover:border-indigo-100 transition-all cursor-grab active:cursor-grabbing relative overflow-hidden"
                    >
                      {/* Left border indicator based on status */}
                      <div className={`absolute left-0 top-0 bottom-0 w-1 ${
                        status.id === 'Completed' ? 'bg-green-500' : 
                        status.id === 'In Progress' ? 'bg-orange-400' :
                        status.id === 'To-do' ? 'bg-blue-400' : 'bg-gray-300'
                      }`} />

                      <div className="flex gap-3">
                        <button 
                          onClick={() => toggleStatus(task)}
                          className={`mt-1 flex-shrink-0 transition-colors ${
                            task.status === 'Completed' ? 'text-green-500' : 'text-gray-300 hover:text-gray-400'
                          }`}
                        >
                          {task.status === 'Completed' ? <CheckCircle size={18} /> : <Circle size={18} />}
                        </button>
                        
                        <div className="flex-1 min-w-0">
                          <h4 className={`text-sm font-semibold text-gray-800 leading-snug break-words ${task.status === 'Completed' ? 'line-through text-gray-400' : ''}`}>
                            {task.title}
                          </h4>
                          {task.description && (
                            <p className="text-xs text-gray-500 mt-2 line-clamp-2 leading-relaxed">
                              {task.description}
                            </p>
                          )}
                          
                          {/* Notes */}
                          {task.notes && (
                            <div className="mt-2 p-2 bg-gray-50 rounded-lg border-l-2 border-indigo-200">
                              <p className="text-[10px] text-gray-500 leading-relaxed italic">
                                📝 {task.notes}
                              </p>
                            </div>
                          )}

                          {/* Priority Badge (for important/urgent) */}
                          {task.priority !== 'normal' && (
                            <div className="mt-2">
                              <span className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-medium ${
                                task.priority === 'urgent' 
                                  ? 'bg-red-100 text-red-700' 
                                  : 'bg-amber-100 text-amber-700'
                              }`}>
                                {task.priority === 'urgent' ? '🔴' : '⚠️'}
                                {task.priority.charAt(0).toUpperCase() + task.priority.slice(1)}
                              </span>
                            </div>
                          )}

                          {/* Completed Info */}
                          {task.status === 'Completed' && task.completedAt && (
                            <p className="text-xs text-green-600 mt-2">
                              ✓ Completed {formatDistanceToNow(task.completedAt.toDate(), { addSuffix: true })}
                            </p>
                          )}

                          <div className="flex items-center justify-between mt-4">
                            <div className="flex -space-x-1.5 overflow-hidden">
                              {Array.isArray(task.assignedTo) ? (
                                task.assignedTo.length > 0 ? (
                                  task.assignedTo.map(uid => (
                                    <div key={uid} className="w-6 h-6 rounded-full bg-indigo-100 border-2 border-white flex items-center justify-center text-[10px] font-bold text-indigo-600" title={uid}>
                                      {employees.find(e => e.id === uid)?.name?.charAt(0) || <User size={12} />}
                                    </div>
                                  ))
                                ) : (
                                  <div className="w-6 h-6 rounded-full bg-gray-50 border-2 border-white flex items-center justify-center text-gray-300">
                                    <User size={12} />
                                  </div>
                                )
                              ) : task.assignedTo ? (
                                <div className="w-6 h-6 rounded-full bg-indigo-100 border-2 border-white flex items-center justify-center text-[10px] font-bold text-indigo-600" title={task.assignedTo}>
                                  {employees.find(e => e.id === task.assignedTo)?.name?.charAt(0) || <User size={12} />}
                                </div>
                              ) : (
                                <div className="w-6 h-6 rounded-full bg-gray-50 border-2 border-white flex items-center justify-center text-gray-300">
                                  <User size={12} />
                                </div>
                              )}
                            </div>
                            
                            <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                              <button 
                                onClick={() => deleteTask(task.id)}
                                className="text-gray-400 hover:text-red-500 p-1.5 hover:bg-red-50 rounded-lg transition-colors"
                              >
                                <Trash2 size={14} />
                              </button>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Add Task Modal */}
      <Modal 
        isOpen={showAddModal} 
        onClose={() => setShowAddModal(false)}
        title="Create New Task"
      >
        <form onSubmit={handleCreateTask} className="space-y-4">
          {/* Title */}
          <div>
            <label className="block text-xs font-bold text-gray-400 uppercase tracking-widest mb-1.5">Task Title</label>
            <input
              type="text"
              required
              className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:ring-4 focus:ring-indigo-50 focus:border-indigo-200 outline-none transition-all placeholder:text-gray-300"
              placeholder="What needs to be done?"
              value={newTask.title}
              onChange={e => setNewTask({ ...newTask, title: e.target.value })}
              autoFocus
            />
          </div>

          {/* Description */}
          <div>
            <label className="block text-xs font-bold text-gray-400 uppercase tracking-widest mb-1.5">Description</label>
            <textarea
              className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:ring-4 focus:ring-indigo-50 focus:border-indigo-200 outline-none transition-all min-h-[100px] resize-none placeholder:text-gray-300"
              placeholder="Add some details..."
              value={newTask.description}
              onChange={e => setNewTask({ ...newTask, description: e.target.value })}
            />
          </div>

          {/* Priority Selector */}
          <div>
            <label className="block text-xs font-bold text-gray-400 uppercase tracking-widest mb-2">Priority</label>
            <div className="flex gap-2">
              {['normal', 'high', 'urgent'].map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => setNewTask({ ...newTask, priority: p })}
                  className={`flex-1 py-2 rounded-lg text-xs font-bold uppercase tracking-wider transition-all border-2 ${
                    newTask.priority === p 
                      ? p === 'urgent' ? 'bg-red-50 border-red-500 text-red-600' :
                        p === 'high' ? 'bg-amber-50 border-amber-500 text-amber-600' :
                        'bg-indigo-50 border-indigo-500 text-indigo-600'
                      : 'border-gray-100 text-gray-400 hover:border-gray-200'
                  }`}
                >
                  {p}
                </button>
              ))}
            </div>
          </div>

          {/* Dates & Status */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-gray-400 uppercase tracking-widest mb-1.5">Due Date</label>
              <div className="relative">
                <DatePicker
                  selected={newTask.dueDate}
                  onChange={(date) => setNewTask({ ...newTask, dueDate: date })}
                  className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:ring-4 focus:ring-indigo-50 focus:border-indigo-200 outline-none transition-all"
                  placeholderText="Optional"
                  dateFormat="MMM d, yyyy"
                />
              </div>
            </div>
            <div>
              <label className="block text-xs font-bold text-gray-400 uppercase tracking-widest mb-1.5">Initial Status</label>
              <select
                className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:ring-4 focus:ring-indigo-50 focus:border-indigo-200 outline-none transition-all appearance-none bg-white"
                value={newTask.status}
                onChange={e => setNewTask({ ...newTask, status: e.target.value })}
              >
                {STATUSES.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
              </select>
            </div>
          </div>

          {/* Multi-Assignee Selector */}
          <div>
            <label className="block text-xs font-bold text-gray-400 uppercase tracking-widest mb-1.5">Assign To</label>
            <div className="flex flex-wrap gap-2 p-2 border border-gray-200 rounded-xl min-h-[45px]">
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
              {loginEnabledEmployees.length === 0 && (
                <p className="text-[10px] text-gray-400 italic p-2">No login-enabled users found</p>
              )}
            </div>
          </div>

          {/* Internal Notes */}
          <div>
            <label className="block text-xs font-bold text-gray-400 uppercase tracking-widest mb-1.5">Internal Notes</label>
            <input
              type="text"
              className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:ring-4 focus:ring-indigo-50 focus:border-indigo-200 outline-none transition-all placeholder:text-gray-300"
              placeholder="Quick notes (internal only)"
              value={newTask.notes}
              onChange={e => setNewTask({ ...newTask, notes: e.target.value })}
            />
          </div>

          <div className="flex items-center gap-4 py-2 border-t border-gray-50 mt-4 pt-4">
            <label className="flex items-center gap-2 cursor-pointer group">
              <div className="relative flex items-center">
                <input
                  type="checkbox"
                  className="peer sr-only"
                  checked={newTask.isPersonal}
                  onChange={e => setNewTask({ ...newTask, isPersonal: e.target.checked })}
                />
                <div className="w-10 h-6 bg-gray-200 rounded-full peer peer-checked:bg-indigo-600 transition-colors after:content-[''] after:absolute after:top-1 after:left-1 after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:after:translate-x-4"></div>
              </div>
              <span className="text-sm font-medium text-gray-600 group-hover:text-gray-900 transition-colors">Personal Task</span>
            </label>

            <label className="flex items-center gap-2 cursor-pointer group">
              <div className="relative flex items-center">
                <input
                  type="checkbox"
                  className="peer sr-only"
                  checked={newTask.category === 'idea'}
                  onChange={e => setNewTask({ ...newTask, category: e.target.checked ? 'idea' : 'task' })}
                />
                <div className="w-10 h-6 bg-gray-200 rounded-full peer peer-checked:bg-amber-500 transition-colors after:content-[''] after:absolute after:top-1 after:left-1 after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:after:translate-x-4"></div>
              </div>
              <span className="text-sm font-medium text-gray-600 group-hover:text-gray-900 transition-colors">Mark as Idea</span>
            </label>
          </div>

          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={() => setShowAddModal(false)}
              className="flex-1 px-4 py-3 border border-gray-200 text-gray-600 rounded-xl text-sm font-bold uppercase tracking-widest hover:bg-gray-50 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="flex-1 px-4 py-3 bg-indigo-600 text-white rounded-xl text-sm font-bold uppercase tracking-widest hover:bg-indigo-700 transition-shadow shadow-lg shadow-indigo-100 active:scale-[0.98]"
            >
              Create Task
            </button>
          </div>
        </form>
      </Modal>
    </div>
  )
}
