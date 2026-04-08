import React, { useMemo, useState } from 'react'
import { BookOpen, Filter, HelpCircle, Search } from 'lucide-react'

const FAQ_ITEMS = [
  {
    id: 'attendance-checkin',
    module: 'Attendance',
    type: 'question',
    question: 'How do I mark Check-In and Check-Out in the portal?',
    answer:
      'Open My Portal and use the Check-In / Check-Out button. The system captures location and selfie, then sends it for HR approval.',
  },
  {
    id: 'attendance-location',
    module: 'Attendance',
    type: 'instruction',
    question: 'Location-based Check-In instructions',
    answer:
      'Enable GPS on your phone, stand near your assigned site, then capture selfie. If you are outside allowed range, submit exception with reason.',
  },
  {
    id: 'attendance-status',
    module: 'Attendance',
    type: 'question',
    question: 'What do Pending, Approved, Finalized, and Rejected statuses mean?',
    answer:
      'Pending means HR review is pending. Approved means HR has approved and waits for manual finalization. Finalized means payroll-ready attendance. Rejected means attendance request was denied with reason.',
  },
  {
    id: 'tasks-checklist',
    module: 'Tasks',
    type: 'question',
    question: 'How do I use the Checklist tab in Tasks?',
    answer:
      'Open Tasks > Checklist, create checklist items inside a task card, and update progress by checking items as completed.',
  },
  {
    id: 'tasks-sorting',
    module: 'Tasks',
    type: 'instruction',
    question: 'Task board workflow instructions',
    answer:
      'Use Board view to move cards between To Do, In Progress, Review, and Completed. Use filters to focus by Team, Personal, or Ideas.',
  },
  {
    id: 'leave-request',
    module: 'Leave',
    type: 'question',
    question: 'How do I submit Leave or Permission request?',
    answer:
      'Open My Portal > Requests and select Leave or Permission. Fill dates/time, reason, and submit. Approval follows your organization approval flow.',
  },
  {
    id: 'salary-slip',
    module: 'Salary',
    type: 'question',
    question: 'Where can I download my salary slip?',
    answer:
      'Go to Salary Slip tab. Select month and employee, then generate or download the slip based on access rights.',
  },
  {
    id: 'approval-settings',
    module: 'Settings',
    type: 'instruction',
    question: 'How to configure No Approval / Single / Multi-stage?',
    answer:
      'Go to Settings > Approval Settings, pick module (Advance, Leave, Permission), choose approval type, assign approvers, and save.',
  },
  {
    id: 'site-geofence',
    module: 'Settings',
    type: 'instruction',
    question: 'How to configure site geofence?',
    answer:
      'Go to Settings > Site Geofence and add site name, latitude, longitude, and radius. Keep records active for employee mapping.',
  },
  {
    id: 'account-access',
    module: 'General',
    type: 'question',
    question: 'Why can’t I see some modules in the side menu?',
    answer:
      'Module visibility is permission-based. Contact Admin/HR to enable view/create/edit rights for your role.',
  },
]

const TYPE_FILTERS = [
  { id: 'all', label: 'All' },
  { id: 'question', label: 'Questions' },
  { id: 'instruction', label: 'Instructions' },
]

export default function HelpTab() {
  const [searchText, setSearchText] = useState('')
  const [moduleFilter, setModuleFilter] = useState('all')
  const [typeFilter, setTypeFilter] = useState('all')

  const moduleOptions = useMemo(() => {
    const modules = Array.from(new Set(FAQ_ITEMS.map(item => item.module)))
    return ['all', ...modules]
  }, [])

  const filteredItems = useMemo(() => {
    const q = searchText.trim().toLowerCase()
    return FAQ_ITEMS.filter(item => {
      const matchesModule = moduleFilter === 'all' || item.module === moduleFilter
      const matchesType = typeFilter === 'all' || item.type === typeFilter
      const matchesSearch =
        !q ||
        item.question.toLowerCase().includes(q) ||
        item.answer.toLowerCase().includes(q) ||
        item.module.toLowerCase().includes(q)
      return matchesModule && matchesType && matchesSearch
    })
  }, [moduleFilter, searchText, typeFilter])

  return (
    <div className="max-w-6xl mx-auto animate-in fade-in slide-in-from-bottom-3 duration-300">
      <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-2 mb-5">
          <p className="text-[11px] font-black uppercase tracking-[0.14em] text-indigo-500">Help Center</p>
          <h1 className="text-2xl font-black tracking-tight text-gray-900">FAQ - Questions & Instructions</h1>
          <p className="text-sm text-gray-500">Search module-specific answers and quick usage instructions.</p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-3 mb-5">
          <div className="lg:col-span-6 relative">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
              placeholder="Search by keyword, module, or question..."
              className="w-full h-11 rounded-xl border border-gray-200 bg-white pl-10 pr-3 text-sm outline-none focus:ring-2 focus:ring-indigo-200 focus:border-indigo-400"
            />
          </div>

          <div className="lg:col-span-3 relative">
            <Filter size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <select
              value={moduleFilter}
              onChange={(e) => setModuleFilter(e.target.value)}
              className="w-full h-11 rounded-xl border border-gray-200 bg-white pl-10 pr-3 text-sm outline-none focus:ring-2 focus:ring-indigo-200 focus:border-indigo-400 appearance-none"
            >
              {moduleOptions.map(module => (
                <option key={module} value={module}>
                  {module === 'all' ? 'All Modules' : module}
                </option>
              ))}
            </select>
          </div>

          <div className="lg:col-span-3 flex items-center gap-2 rounded-xl border border-gray-200 bg-gray-50 px-2 py-1">
            {TYPE_FILTERS.map(filter => (
              <button
                key={filter.id}
                type="button"
                onClick={() => setTypeFilter(filter.id)}
                className={`h-9 px-3 rounded-lg text-[11px] font-black uppercase tracking-widest transition-all ${
                  typeFilter === filter.id
                    ? 'bg-indigo-600 text-white shadow-sm shadow-indigo-200'
                    : 'text-gray-500 hover:bg-white'
                }`}
              >
                {filter.label}
              </button>
            ))}
          </div>
        </div>

        <div className="mb-4 flex items-center justify-between">
          <p className="text-xs font-semibold text-gray-500">
            Showing <span className="text-gray-900">{filteredItems.length}</span> results
          </p>
        </div>

        {filteredItems.length === 0 ? (
          <div className="rounded-xl border border-dashed border-gray-300 bg-gray-50 py-14 text-center">
            <HelpCircle size={28} className="mx-auto text-gray-300 mb-2" />
            <p className="text-sm font-semibold text-gray-500">No FAQ matched your filters.</p>
            <p className="text-xs text-gray-400 mt-1">Try different keywords or reset filters.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {filteredItems.map(item => (
              <article key={item.id} className="rounded-xl border border-gray-200 bg-white p-4 hover:border-indigo-200 transition-colors">
                <div className="flex flex-wrap items-center gap-2 mb-2">
                  <span className="inline-flex h-6 items-center rounded-full bg-indigo-50 px-2.5 text-[10px] font-black uppercase tracking-widest text-indigo-700">
                    {item.module}
                  </span>
                  <span className="inline-flex h-6 items-center rounded-full bg-gray-100 px-2.5 text-[10px] font-black uppercase tracking-widest text-gray-600">
                    {item.type === 'instruction' ? 'Instruction' : 'Question'}
                  </span>
                </div>
                <h2 className="text-[15px] font-bold text-gray-900 flex items-start gap-2">
                  <BookOpen size={15} className="text-indigo-500 mt-0.5 shrink-0" />
                  <span>{item.question}</span>
                </h2>
                <p className="mt-2 text-[13px] leading-relaxed text-gray-600">{item.answer}</p>
              </article>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
