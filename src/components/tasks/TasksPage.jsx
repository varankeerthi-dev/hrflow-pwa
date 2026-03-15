import React, { useMemo, useState, useEffect } from 'react'
import { useAuth } from '../../hooks/useAuth'
import { useTasks, updateTaskStatus } from '../../hooks/useTasks'
import { useReminders, dismissReminder } from '../../hooks/useReminders'
import { useIdeas, createIdea as createIdeaDoc, updateIdea as saveIdea, deleteIdea as removeIdea } from '../../hooks/useIdeas'
import TaskBoard from './TaskBoard'
import TaskDetail from './TaskDetail'
import CreateTaskModal from './CreateTaskModal'
import PostponeTaskModal from './PostponeTaskModal'
import OnHoldModal from './OnHoldModal'
import RemindersSection from './RemindersSection'
import CreateReminderModal from './CreateReminderModal'
import IdeasTab from './IdeasTab'
import CreateIdeaModal from './CreateIdeaModal'
import { CLIENT_FILTERS, isMobile } from '../../utils/taskHelpers'

export default function TasksPage() {
  const { user } = useAuth()
  const [activeTab, setActiveTab] = useState('team') // team | my | ideas
  const [clientFilter, setClientFilter] = useState('all')
  const [selectedTask, setSelectedTask] = useState(null)
  const [showCreate, setShowCreate] = useState(false)
  const [postponeTask, setPostponeTask] = useState(null)
  const [onHoldTask, setOnHoldTask] = useState(null)
  const [showReminderModal, setShowReminderModal] = useState(false)
  const [reminderTask, setReminderTask] = useState(null)
  const [ideaModalOpen, setIdeaModalOpen] = useState(false)
  const [editingIdea, setEditingIdea] = useState(null)
  const [enableDrag, setEnableDrag] = useState(true)
  const [flash, setFlash] = useState('')

  const { tasks, loading: tasksLoading, error: tasksError } = useTasks(user, { clientFilter })
  const { reminders } = useReminders(user)
  const { ideas } = useIdeas(user)

  useEffect(() => {
    setEnableDrag(!isMobile())
    const handler = () => setEnableDrag(!isMobile())
    window.addEventListener('resize', handler)
    return () => window.removeEventListener('resize', handler)
  }, [])

  const teamTasks = useMemo(() => tasks.filter(t => !t.isPersonal), [tasks])
  const myTasks = useMemo(() => tasks.filter(t => t.createdBy === user?.uid || (t.assignedTo || []).includes(user?.uid)), [tasks, user?.uid])

  const visibleTasks = activeTab === 'my' ? myTasks : activeTab === 'team' ? teamTasks : []

  const handleStatusChange = async (task, newStatus, extra = {}) => {
    if (newStatus === 'on_hold') {
      setOnHoldTask(task)
      return
    }
    await updateTaskStatus(task, newStatus, extra)
  }

  const handleCreateReminder = (task) => {
    setReminderTask(task || null)
    setShowReminderModal(true)
  }

  const handleDismissReminder = async (id) => {
    await dismissReminder(id, user?.uid)
  }

  const handleIdeaSave = async ({ text, tags }) => {
    if (editingIdea) {
      await saveIdea(editingIdea.id, { text, tags })
    } else {
      await createIdeaDoc({ text, tags, user })
    }
  }

  const handleIdeaDelete = async (id) => {
    await removeIdea(id)
  }

  return (
    <div className="min-h-screen bg-[#f9fafb] p-4 lg:p-6">
      <div className="max-w-7xl mx-auto">
        <div className="flex items-center justify-between mb-4">
          <div>
            <p className="text-xs uppercase text-gray-400 font-semibold">Tasks</p>
            <h1 className="text-2xl font-bold text-gray-900">Task Management</h1>
            {flash && <p className="text-xs text-green-600 mt-1">{flash}</p>}
          </div>
          <div className="flex items-center gap-2">
            <select value={clientFilter} onChange={e => setClientFilter(e.target.value)} className="border border-gray-200 rounded-md px-3 py-2 text-sm">
              {CLIENT_FILTERS.map(f => <option key={f.id} value={f.id}>{f.label}</option>)}
            </select>
            <button onClick={() => setShowCreate(true)} className="px-4 py-2 bg-blue-600 text-white rounded-md text-sm">New Task</button>
          </div>
        </div>

        <RemindersSection reminders={reminders} onDismiss={handleDismissReminder} onTaskNavigate={(taskId) => {
          const task = tasks.find(t => t.id === taskId)
          if (task) setSelectedTask(task)
        }} />

        <div className="flex items-center gap-2 mb-4">
          {['team', 'my', 'ideas'].map(tab => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-4 py-2 rounded-md text-sm border ${activeTab === tab ? 'bg-gray-900 text-white border-gray-900' : 'bg-white text-gray-600 border-gray-200'}`}
            >
              {tab === 'team' ? 'Team Tasks' : tab === 'my' ? 'My Tasks' : 'Ideas'}
            </button>
          ))}
        </div>

        {activeTab === 'ideas' ? (
          <IdeasTab
            ideas={ideas}
            onNew={() => { setEditingIdea(null); setIdeaModalOpen(true) }}
            onEdit={(idea) => { setEditingIdea(idea); setIdeaModalOpen(true) }}
            onDelete={handleIdeaDelete}
            onQuickAdd={async (text) => {
              try {
                await createIdeaDoc({ text, tags: [], user })
                setFlash('Idea saved')
                setTimeout(() => setFlash(''), 2000)
              } catch (err) {
                alert(err.message || 'Failed to save idea')
              }
            }}
          />
        ) : (
          <div className="bg-white border border-gray-200 rounded-lg p-3">
            {tasksLoading ? (
              <p className="text-sm text-gray-500">Loading tasks...</p>
            ) : tasksError ? (
              <p className="text-sm text-red-600">Unable to load tasks: {tasksError.message}</p>
            ) : visibleTasks.length === 0 ? (
              <p className="text-sm text-gray-500">No tasks yet.</p>
            ) : (
              <TaskBoard
                tasks={visibleTasks}
                onSelectTask={setSelectedTask}
                onStatusChange={handleStatusChange}
                enableDrag={enableDrag}
              />
            )}
            {enableDrag ? null : (
              <p className="text-xs text-gray-500 mt-2">Drag & drop disabled on mobile. Open a task to change status.</p>
            )}
          </div>
        )}
      </div>

      <CreateTaskModal
        isOpen={showCreate}
        onClose={() => setShowCreate(false)}
        user={user}
        onSuccess={(msg) => { setFlash(msg); setTimeout(() => setFlash(''), 3000) }}
      />

      <TaskDetail
        task={selectedTask}
        user={user}
        onClose={() => setSelectedTask(null)}
        onStatusChange={handleStatusChange}
        onPostponeClick={(task) => { setPostponeTask(task); }}
        onHoldClick={(task) => setOnHoldTask(task)}
        onCreateReminder={(task) => handleCreateReminder(task)}
      />

      <PostponeTaskModal isOpen={!!postponeTask} onClose={() => setPostponeTask(null)} task={postponeTask} user={user} />
      <OnHoldModal isOpen={!!onHoldTask} onClose={() => setOnHoldTask(null)} task={onHoldTask} />
      <CreateReminderModal isOpen={showReminderModal} onClose={() => setShowReminderModal(false)} user={user} task={reminderTask} />
      <CreateIdeaModal
        isOpen={ideaModalOpen}
        onClose={() => setIdeaModalOpen(false)}
        idea={editingIdea}
        onSave={async (payload) => {
          try {
            await handleIdeaSave(payload)
          } catch (err) {
            alert(err.message || 'Failed to save idea')
          }
        }}
      />
    </div>
  )
}
