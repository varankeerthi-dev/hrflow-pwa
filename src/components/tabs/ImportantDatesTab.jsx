import React, { useState, useMemo } from 'react'
import { useAuth } from '../../hooks/useAuth'
import { db } from '../../lib/firebase'
import { collection, query, orderBy, addDoc, deleteDoc, doc, serverTimestamp } from 'firebase/firestore'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { getDocs } from 'firebase/firestore'
import { Calendar, Plus, Trash2, X, ChevronRight, Cake, Flag, AlertCircle, Leaf, Zap, Droplets, Sun, Moon, Star } from 'lucide-react'

const colorOptions = [
  { value: '#09CE99', label: 'Green' },
  { value: '#3B82F6', label: 'Blue' },
  { value: '#F59E0B', label: 'Amber' },
  { value: '#EF4444', label: 'Red' },
  { value: '#8B5CF6', label: 'Purple' },
  { value: '#EC4899', label: 'Pink' },
]

const iconMap = {
  Calendar: <Calendar size={14} />,
  Flag: <Flag size={14} />,
  AlertCircle: <AlertCircle size={14} />,
  Leaf: <Leaf size={14} />,
  Zap: <Zap size={14} />,
  Droplets: <Droplets size={14} />,
  Sun: <Sun size={14} />,
  Moon: <Moon size={14} />,
  Star: <Star size={14} />,
}

function useImportantDates(orgId) {
  return useQuery({
    queryKey: ['importantDates', orgId],
    queryFn: async () => {
      if (!orgId) return []
      const q = query(
        collection(db, 'organisations', orgId, 'importantDates'),
        orderBy('date', 'asc')
      )
      const snap = await getDocs(q)
      return snap.docs.map(d => ({ id: d.id, ...d.data() }))
    },
    enabled: !!orgId,
  })
}

function AddDateModal({ orgId, onClose }) {
  const queryClient = useQueryClient()
  const [title, setTitle] = useState('')
  const [date, setDate] = useState('')
  const [description, setDescription] = useState('')
  const [color, setColor] = useState('#09CE99')
  const [error, setError] = useState('')

  const addMutation = useMutation({
    mutationFn: async (data) => {
      await addDoc(collection(db, 'organisations', orgId, 'importantDates'), {
        ...data,
        createdAt: serverTimestamp(),
      })
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['importantDates', orgId] })
      onClose()
    },
    onError: (err) => setError(err.message),
  })

  const handleSubmit = (e) => {
    e.preventDefault()
    if (!title.trim() || !date) {
      setError('Title and date are required')
      return
    }
    addMutation.mutate({ title: title.trim(), date, description: description.trim(), color })
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-white rounded-2xl border border-[#E9ECF0] shadow-xl w-full max-w-md mx-4" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-[#E9ECF0]">
          <h3 className="text-[14px] font-bold text-[#1A1D26]">Add Important Date</h3>
          <button onClick={onClose} className="p-1 text-[#9CA3AF] hover:text-[#1A1D26] transition-colors"><X size={16} /></button>
        </div>
        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          {error && <p className="text-[11px] text-[#EF4444] bg-red-50 px-3 py-2 rounded-lg">{error}</p>}
          <div>
            <label className="text-[11px] font-medium text-[#6B7280] block mb-1.5">Title</label>
            <input type="text" value={title} onChange={e => setTitle(e.target.value)} placeholder="e.g. Safety Month, Environment Day"
              className="w-full h-9 px-3 text-[13px] border border-[#E9ECF0] rounded-lg bg-white text-[#1A1D26] outline-none focus:border-[#09CE99] placeholder:text-[#9CA3AF]" />
          </div>
          <div>
            <label className="text-[11px] font-medium text-[#6B7280] block mb-1.5">Date</label>
            <input type="date" value={date} onChange={e => setDate(e.target.value)}
              className="w-full h-9 px-3 text-[13px] border border-[#E9ECF0] rounded-lg bg-white text-[#1A1D26] outline-none focus:border-[#09CE99]" />
          </div>
          <div>
            <label className="text-[11px] font-medium text-[#6B7280] block mb-1.5">Description (optional)</label>
            <input type="text" value={description} onChange={e => setDescription(e.target.value)} placeholder="Brief note about this date"
              className="w-full h-9 px-3 text-[13px] border border-[#E9ECF0] rounded-lg bg-white text-[#1A1D26] outline-none focus:border-[#09CE99] placeholder:text-[#9CA3AF]" />
          </div>
          <div>
            <label className="text-[11px] font-medium text-[#6B7280] block mb-1.5">Color</label>
            <div className="flex gap-2">
              {colorOptions.map(c => (
                <button key={c.value} type="button" onClick={() => setColor(c.value)}
                  className={`w-7 h-7 rounded-full border-2 transition-all ${color === c.value ? 'border-[#1A1D26] scale-110' : 'border-transparent'}`}
                  style={{ backgroundColor: c.value }} title={c.label} />
              ))}
            </div>
          </div>
          <div className="flex gap-2 pt-2">
            <button type="button" onClick={onClose} className="flex-1 h-9 text-[12px] font-medium text-[#6B7280] border border-[#E9ECF0] rounded-lg hover:bg-[#F7F8FA] transition-colors">Cancel</button>
            <button type="submit" disabled={addMutation.isPending}
              className="flex-1 h-9 text-[12px] font-semibold text-white bg-[#09CE99] rounded-lg hover:bg-[#07B888] transition-colors disabled:opacity-50 flex items-center justify-center gap-1.5">
              {addMutation.isPending ? 'Adding...' : 'Add Date'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

export default function ImportantDatesTab() {
  const { user } = useAuth()
  const orgId = user?.orgId
  const queryClient = useQueryClient()
  const { data: dates, isLoading } = useImportantDates(orgId)
  const [showAdd, setShowAdd] = useState(false)
  const [filter, setFilter] = useState('all')

  const deleteMutation = useMutation({
    mutationFn: async (id) => {
      await deleteDoc(doc(db, 'organisations', orgId, 'importantDates', id))
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['importantDates', orgId] }),
  })

  const now = new Date()
  const currentMonth = now.getMonth()
  const currentYear = now.getFullYear()

  const filteredDates = useMemo(() => {
    if (!dates) return []
    return dates.filter(d => {
      const [y, m] = (d.date || '').split('-').map(Number)
      if (filter === 'thisMonth') return y === currentYear && m === currentMonth + 1
      if (filter === 'upcoming') {
        const dateObj = new Date(d.date)
        return dateObj >= now
      }
      if (filter === 'thisYear') return y === currentYear
      return true
    })
  }, [dates, filter, currentYear, currentMonth])

  const thisMonthDates = useMemo(() => {
    if (!dates) return []
    return dates.filter(d => {
      const [y, m] = (d.date || '').split('-').map(Number)
      return y === currentYear && m === currentMonth + 1
    }).sort((a, b) => a.date.localeCompare(b.date))
  }, [dates, currentYear, currentMonth])

  const upcomingDates = useMemo(() => {
    if (!dates) return []
    return dates.filter(d => new Date(d.date) >= now).sort((a, b) => a.date.localeCompare(b.date)).slice(0, 5)
  }, [dates, now])

  const formatDate = (d) => {
    const dt = new Date(d + 'T00:00:00')
    return dt.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
  }

  const filterPills = [
    { id: 'all', label: 'All' },
    { id: 'thisMonth', label: 'This Month' },
    { id: 'upcoming', label: 'Upcoming' },
    { id: 'thisYear', label: 'This Year' },
  ]

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-[50vh]">
        <div className="flex items-center gap-2 text-[#9CA3AF] text-[13px]">
          <div className="w-4 h-4 border-2 border-[#E9ECF0] border-t-[#09CE99] rounded-full animate-spin" />
          Loading...
        </div>
      </div>
    )
  }

  return (
    <div className="flex-1 min-h-0 grid grid-cols-1 xl:grid-cols-[1fr_280px] gap-5">
      <div className="bg-white rounded-2xl border border-[#E9ECF0] overflow-hidden flex flex-col">
        <div className="px-5 py-4 border-b border-[#E9ECF0] flex items-center justify-between gap-4 flex-wrap">
          <div>
            <h2 className="text-[15px] font-bold text-[#1A1D26]">Important Dates</h2>
            <p className="text-[11px] text-[#6B7280] mt-0.5">{dates?.length || 0} dates recorded</p>
          </div>
          <button onClick={() => setShowAdd(true)}
            className="h-8 px-3 flex items-center gap-1.5 text-[12px] font-semibold text-white bg-[#09CE99] rounded-lg hover:bg-[#07B888] transition-colors">
            <Plus size={14} /> Add Date
          </button>
        </div>

        <div className="flex gap-1.5 px-5 py-2.5 border-b border-[#E9ECF0] bg-[#FAFBFC]">
          {filterPills.map(p => (
            <button key={p.id} onClick={() => setFilter(p.id)}
              className={`text-[11px] font-medium px-3 py-1.5 rounded-lg transition-colors ${
                filter === p.id ? 'bg-[#09CE99] text-white' : 'text-[#6B7280] hover:bg-[#E9ECF0]'
              }`}>{p.label}</button>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto">
          <div className="grid grid-cols-[1fr_120px_80px] gap-0 px-5 py-2.5 text-[10px] font-semibold text-[#9CA3AF] uppercase tracking-wider bg-[#FAFBFC] border-b border-[#E9ECF0]">
            <span>Title</span>
            <span>Date</span>
            <span></span>
          </div>
          <div className="divide-y divide-[#E9ECF0]/60">
            {filteredDates.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-center">
                <Calendar size={28} className="text-[#D1D5DB] mb-2" />
                <p className="text-[13px] text-[#9CA3AF]">No dates found</p>
                <button onClick={() => setShowAdd(true)} className="text-[12px] text-[#09CE99] font-medium mt-1 hover:text-[#07B888]">Add one</button>
              </div>
            ) : filteredDates.map(d => {
              const dotColor = d.color || '#09CE99'
              return (
                <div key={d.id} className="grid grid-cols-[1fr_120px_80px] gap-0 px-5 py-3 hover:bg-[#F7F8FA] transition-colors items-center group">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: dotColor }} />
                    <div className="min-w-0">
                      <div className="text-[13px] font-medium text-[#1A1D26] truncate">{d.title}</div>
                      {d.description && <div className="text-[11px] text-[#6B7280] truncate">{d.description}</div>}
                    </div>
                  </div>
                  <div className="text-[13px] text-[#1A1D26] font-medium">{formatDate(d.date)}</div>
                  <div className="flex justify-end">
                    <button onClick={() => { if (confirm('Delete this date?')) deleteMutation.mutate(d.id) }}
                      className="p-1.5 text-[#9CA3AF] hover:text-[#EF4444] transition-colors opacity-0 group-hover:opacity-100">
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-4">
        <div className="bg-white rounded-2xl border border-[#E9ECF0] overflow-hidden">
          <div className="px-4 py-3 border-b border-[#E9ECF0]">
            <div className="flex items-center gap-2">
              <Calendar size={14} className="text-[#09CE99]" />
              <span className="text-[12px] font-semibold text-[#1A1D26]">This Month</span>
            </div>
          </div>
          <div className="px-4 py-3">
            {thisMonthDates.length === 0 ? (
              <p className="text-[12px] text-[#9CA3AF] text-center py-4">No dates this month</p>
            ) : (
              <div className="space-y-2.5">
                {thisMonthDates.map(d => (
                  <div key={d.id} className="flex items-start gap-3">
                    <div className="w-2 h-2 rounded-full mt-1.5 shrink-0" style={{ backgroundColor: d.color || '#09CE99' }} />
                    <div className="flex-1 min-w-0">
                      <div className="text-[12px] font-medium text-[#1A1D26] truncate">{d.title}</div>
                      <div className="text-[10px] text-[#6B7280]">{formatDate(d.date)}</div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-[#E9ECF0] overflow-hidden">
          <div className="px-4 py-3 border-b border-[#E9ECF0]">
            <div className="flex items-center gap-2">
              <ChevronRight size={14} className="text-[#F59E0B]" />
              <span className="text-[12px] font-semibold text-[#1A1D26]">Upcoming</span>
            </div>
          </div>
          <div className="px-4 py-3">
            {upcomingDates.length === 0 ? (
              <p className="text-[12px] text-[#9CA3AF] text-center py-4">No upcoming dates</p>
            ) : (
              <div className="space-y-2.5">
                {upcomingDates.map(d => (
                  <div key={d.id} className="flex items-start gap-3">
                    <div className="w-2 h-2 rounded-full mt-1.5 shrink-0" style={{ backgroundColor: d.color || '#09CE99' }} />
                    <div className="flex-1 min-w-0">
                      <div className="text-[12px] font-medium text-[#1A1D26] truncate">{d.title}</div>
                      <div className="text-[10px] text-[#6B7280]">{formatDate(d.date)}</div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {showAdd && <AddDateModal orgId={orgId} onClose={() => setShowAdd(false)} />}
    </div>
  )
}
