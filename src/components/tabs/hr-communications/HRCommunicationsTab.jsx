import React, { useMemo, useState } from 'react'
import { useAuth } from '../../../hooks/useAuth'
import { useEmployees } from '../../../hooks/useEmployees'
import { useCommunications } from '../../../hooks/useCommunications'
import { Table } from '../../table/Table'
import { FleetSecondaryTabs } from '../../ui/FleetSecondaryTabs'
import Modal from '../../ui/Modal'
import Spinner from '../../ui/Spinner'
import LegacyLetterFormatsWorkspace from './LegacyLetterFormatsWorkspace'
import { AlertTriangle, Award, BookOpenCheck, CalendarDays, CheckCircle2, Eye, FileText, GraduationCap, Megaphone, Plus, Send, ShieldCheck, X } from 'lucide-react'
import {
  canApproveCommunications,
  canManageCommunications,
  COMMUNICATION_KINDS,
  DEFAULT_ANNOUNCEMENT_CATEGORIES,
  DEFAULT_LETTER_TYPES,
  DEFAULT_POLICY_CATEGORIES,
  DEFAULT_TRAINING_CATEGORIES,
  referenceNumber,
  statusLabel,
  statusTone,
} from '../../../lib/communications'

const TABS = [
  { id: 'letters', label: 'Letters', icon: <FileText size={15} />, kind: COMMUNICATION_KINDS.LETTER },
  { id: 'announcements', label: 'Announcements', icon: <Megaphone size={15} />, kind: COMMUNICATION_KINDS.ANNOUNCEMENT },
  { id: 'policies', label: 'SOPs & Policies', icon: <BookOpenCheck size={15} />, kind: COMMUNICATION_KINDS.POLICY },
  { id: 'training', label: 'Training', icon: <GraduationCap size={15} />, kind: COMMUNICATION_KINDS.TRAINING },
  { id: 'templates', label: 'Templates', icon: <Award size={15} />, kind: 'template' },
  { id: 'archive', label: 'Archive', icon: <CalendarDays size={15} />, kind: 'archive' },
  { id: 'formats', label: 'Formats', icon: <FileText size={15} />, kind: 'formats' },
]

const LEGACY_LETTER_SUBTABS = [
  { id: 'promotion', label: 'Promotion', icon: <Award size={14} />, letterType: 'Promotion' },
  { id: 'bonafide', label: 'Bonafide', icon: <ShieldCheck size={14} />, letterType: 'Bonafide' },
  { id: 'notice', label: 'Notice Period', icon: <AlertTriangle size={14} />, letterType: 'Notice Period' },
  { id: 'termination', label: 'Termination', icon: <X size={14} />, letterType: 'Termination' },
]

const emptyForm = () => ({
  title: '', body: '', category: '', employeeId: '', employeeName: '', letterType: 'Employment Certificate',
  documentCode: '', effectiveDate: new Date().toISOString().slice(0, 10), reviewDate: '', sessionDate: '',
  deliveryMode: 'On-site', priority: 'normal', acknowledgementMode: 'seen', audienceScope: 'all_active', audienceSite: '', audienceDepartment: '',
})

const dateLabel = (value) => {
  if (!value) return '—'
  const date = value?.toDate ? value.toDate() : new Date(value)
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
}

function StatePill({ state }) {
  return <span className={`inline-flex rounded-full border px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide ${statusTone(state)}`}>{statusLabel(state)}</span>
}

function WorkspaceHero({ tab, count, onCreate, canManage }) {
  const copy = {
    letters: ['Employee documents', 'Create controlled letters, route sensitive drafts for approval, and issue immutable employee copies.'],
    announcements: ['Operational updates', 'Publish targeted announcements for sudden holidays, events, visits, training, safety, and facilities.'],
    policies: ['Controlled documents', 'Publish versioned SOPs and policies with effective dates, review dates, and acknowledgement tracking.'],
    training: ['Training administration', 'Plan programmes, publish invitations, follow participation, and retain completion records.'],
    templates: ['Document templates', 'Maintain approved templates and controlled placeholder definitions for HR communications.'],
    archive: ['History and audit', 'Search issued, published, superseded, withdrawn, and historical HR communications.'],
    formats: ['Legacy generators', 'Generate the original HR letter formats and optionally save the result into the controlled Letters workflow.'],
  }[tab.id]
  return <div className="rounded-[12px] border border-gray-100 bg-white p-5 shadow-sm md:p-6">
    <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
      <div>
        <p className="text-[10px] font-bold uppercase tracking-widest text-indigo-600">{copy[0]}</p>
        <h2 className="mt-1 text-[22px] font-semibold tracking-[-0.03em] text-slate-950">{tab.label}</h2>
        <p className="mt-2 max-w-3xl text-[12px] leading-5 text-slate-500">{copy[1]}</p>
      </div>
      <div className="flex items-center gap-3"><span className="rounded-lg bg-slate-50 px-3 py-2 text-[11px] font-semibold text-slate-600">{count} records</span>{canManage && tab.id !== 'archive' && <button type="button" onClick={onCreate} className="inline-flex h-10 items-center gap-2 rounded-lg bg-indigo-600 px-4 text-[11px] font-bold uppercase tracking-wide text-white transition hover:bg-indigo-700"><Plus size={15} /> New {tab.id === 'policies' ? 'SOP / Policy' : tab.label.slice(0, -1)}</button>}</div>
    </div>
  </div>
}

function CommunicationForm({ tab, form, setForm, employees, onClose, onSave, saving }) {
  const categories = tab.id === 'announcements' ? DEFAULT_ANNOUNCEMENT_CATEGORIES : tab.id === 'policies' ? DEFAULT_POLICY_CATEGORIES : tab.id === 'training' ? DEFAULT_TRAINING_CATEGORIES : DEFAULT_LETTER_TYPES
  const update = (field, value) => setForm((current) => ({ ...current, [field]: value }))
  const isLetter = tab.id === 'letters'
  const isTemplate = tab.id === 'templates'
  const isAudienceDriven = ['announcements', 'policies', 'training'].includes(tab.id)
  return <div className="space-y-4 p-5 md:p-6">
    <div><p className="text-[10px] font-bold uppercase tracking-widest text-indigo-600">Draft details</p><h3 className="mt-1 text-lg font-semibold text-slate-900">New {tab.id === 'policies' ? 'SOP / Policy' : tab.label.slice(0, -1)}</h3></div>
    {isLetter && <label className="block text-[10px] font-bold uppercase tracking-widest text-slate-500">Employee<select value={form.employeeId} onChange={(event) => { const employee = employees.find((item) => item.id === event.target.value); setForm((current) => ({ ...current, employeeId: employee?.id || '', employeeName: employee?.name || '' })) }} className="mt-1 h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-[13px] font-medium text-slate-800 outline-none focus:border-indigo-400"><option value="">Select employee</option>{employees.map((employee) => <option key={employee.id} value={employee.id}>{employee.name} {employee.empCode ? `(${employee.empCode})` : ''}</option>)}</select></label>}
    <div className="grid gap-3 sm:grid-cols-2">
      <label className="block text-[10px] font-bold uppercase tracking-widest text-slate-500">{isTemplate ? 'Template name' : isLetter ? 'Letter type' : tab.id === 'policies' ? 'Document title' : tab.id === 'training' ? 'Programme title' : 'Announcement title'}{isLetter ? <select value={form.letterType} onChange={(event) => update('letterType', event.target.value)} className="mt-1 h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-[13px] font-medium text-slate-800 outline-none focus:border-indigo-400">{categories.map((item) => <option key={item} value={item}>{item}</option>)}</select> : <input value={form.title} onChange={(event) => update('title', event.target.value)} className="mt-1 h-10 w-full rounded-lg border border-slate-200 px-3 text-[13px] font-medium text-slate-800 outline-none focus:border-indigo-400" placeholder={isTemplate ? 'e.g. Employment Certificate v1' : 'Enter title'} />}</label>
      <label className="block text-[10px] font-bold uppercase tracking-widest text-slate-500">{isTemplate ? 'Template type' : 'Category'}<select value={form.category} onChange={(event) => update('category', event.target.value)} className="mt-1 h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-[13px] font-medium text-slate-800 outline-none focus:border-indigo-400"><option value="">Select category</option>{(isTemplate ? ['Letter', 'Announcement', 'Policy', 'Training Certificate'] : categories).map((item) => <option key={item} value={item}>{item}</option>)}</select></label>
    </div>
    {tab.id === 'policies' && <div className="grid gap-3 sm:grid-cols-2"><label className="block text-[10px] font-bold uppercase tracking-widest text-slate-500">Document code<input value={form.documentCode} onChange={(event) => update('documentCode', event.target.value)} className="mt-1 h-10 w-full rounded-lg border border-slate-200 px-3 text-[13px] font-medium text-slate-800 outline-none focus:border-indigo-400" placeholder="e.g. SOP-CAN-001" /></label><label className="block text-[10px] font-bold uppercase tracking-widest text-slate-500">Review date<input type="date" value={form.reviewDate} onChange={(event) => update('reviewDate', event.target.value)} className="mt-1 h-10 w-full rounded-lg border border-slate-200 px-3 text-[13px] font-medium text-slate-800 outline-none focus:border-indigo-400" /></label></div>}
    {tab.id === 'training' && <div className="grid gap-3 sm:grid-cols-2"><label className="block text-[10px] font-bold uppercase tracking-widest text-slate-500">Session date<input type="date" value={form.sessionDate} onChange={(event) => update('sessionDate', event.target.value)} className="mt-1 h-10 w-full rounded-lg border border-slate-200 px-3 text-[13px] font-medium text-slate-800 outline-none focus:border-indigo-400" /></label><label className="block text-[10px] font-bold uppercase tracking-widest text-slate-500">Delivery mode<select value={form.deliveryMode} onChange={(event) => update('deliveryMode', event.target.value)} className="mt-1 h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-[13px] font-medium text-slate-800 outline-none focus:border-indigo-400"><option>On-site</option><option>Online</option><option>Hybrid</option></select></label></div>}
    {tab.id === 'announcements' && <div className="grid gap-3 sm:grid-cols-2"><label className="block text-[10px] font-bold uppercase tracking-widest text-slate-500">Priority<select value={form.priority} onChange={(event) => update('priority', event.target.value)} className="mt-1 h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-[13px] font-medium text-slate-800 outline-none focus:border-indigo-400"><option value="normal">Normal</option><option value="high">High priority</option></select></label><label className="block text-[10px] font-bold uppercase tracking-widest text-slate-500">Employee action<select value={form.acknowledgementMode} onChange={(event) => update('acknowledgementMode', event.target.value)} className="mt-1 h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-[13px] font-medium text-slate-800 outline-none focus:border-indigo-400"><option value="seen">Seen required</option><option value="acknowledged">Acknowledgement required</option></select></label></div>}
    {isAudienceDriven && <div className="rounded-lg border border-slate-200 bg-slate-50/70 p-3"><p className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Audience</p><div className="mt-2 grid gap-3 sm:grid-cols-3"><select value={form.audienceScope} onChange={(event) => update('audienceScope', event.target.value)} className="h-10 rounded-lg border border-slate-200 bg-white px-3 text-[12px] font-medium text-slate-700"><option value="all_active">All active employees</option><option value="site">Specific site</option><option value="department">Specific department</option></select>{form.audienceScope === 'site' && <input value={form.audienceSite} onChange={(event) => update('audienceSite', event.target.value)} className="h-10 rounded-lg border border-slate-200 bg-white px-3 text-[12px]" placeholder="Site name" />}{form.audienceScope === 'department' && <input value={form.audienceDepartment} onChange={(event) => update('audienceDepartment', event.target.value)} className="h-10 rounded-lg border border-slate-200 bg-white px-3 text-[12px]" placeholder="Department" />}</div></div>}
    <label className="block text-[10px] font-bold uppercase tracking-widest text-slate-500">{isTemplate ? 'Template body' : isLetter ? 'Draft content or HR note' : 'Message / summary'}<textarea rows={5} value={form.body} onChange={(event) => update('body', event.target.value)} className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-[13px] leading-5 text-slate-800 outline-none focus:border-indigo-400" placeholder="Write the authoritative content shown to the employee." /></label>
    <div className="flex gap-3 border-t border-slate-100 pt-4"><button type="button" onClick={onClose} className="flex-1 h-10 rounded-lg border border-slate-200 text-[12px] font-semibold text-slate-600 hover:bg-slate-50">Cancel</button><button type="button" onClick={onSave} disabled={saving} className="flex-1 h-10 rounded-lg bg-indigo-600 text-[12px] font-semibold text-white hover:bg-indigo-700 disabled:opacity-50">{saving ? 'Saving…' : 'Save draft'}</button></div>
  </div>
}

function ItemDetails({ item, tab, onClose, onIssue, onPublish, onWithdraw, canManage, canApprove, busy }) {
  if (!item) return null
  const publishLabel = tab.id === 'training' ? 'Publish invitations' : tab.id === 'policies' ? 'Publish version' : 'Publish announcement'
  const publishable = ['announcements', 'policies', 'training'].includes(tab.id) && item.state === 'draft'
  return <div className="p-5 md:p-6"><div className="flex items-start justify-between gap-4"><div><p className="text-[10px] font-bold uppercase tracking-widest text-indigo-600">{tab.label}</p><h3 className="mt-1 text-lg font-semibold text-slate-900">{item.title || item.letterType || item.name}</h3><div className="mt-2"><StatePill state={item.state} /></div></div><button type="button" onClick={onClose} className="rounded-lg p-2 text-slate-400 hover:bg-slate-100"><X size={18} /></button></div><div className="mt-5 grid gap-3 rounded-[12px] border border-slate-100 bg-slate-50/60 p-4 text-[12px] text-slate-600 sm:grid-cols-2"><p><span className="block text-[9px] font-bold uppercase tracking-widest text-slate-400">Reference</span>{item.issueReference || referenceNumber(tab.kind || tab.id, item.id)}</p><p><span className="block text-[9px] font-bold uppercase tracking-widest text-slate-400">Audience / employee</span>{item.employeeName || item.audienceSnapshot?.scope || item.audience?.scope || 'Not yet resolved'}</p><p><span className="block text-[9px] font-bold uppercase tracking-widest text-slate-400">Delivery</span>{item.recipientCount || 0} recipients</p><p><span className="block text-[9px] font-bold uppercase tracking-widest text-slate-400">Updated</span>{dateLabel(item.updatedAt)}</p></div><div className="mt-5 whitespace-pre-wrap rounded-lg border border-slate-100 bg-white p-4 text-[13px] leading-6 text-slate-700">{item.body || 'No body text has been added to this draft.'}</div><div className="mt-5 flex flex-wrap gap-2 border-t border-slate-100 pt-4">{canManage && tab.id === 'letters' && item.state === 'draft' && <button type="button" disabled={busy} onClick={onIssue} className="inline-flex h-10 items-center gap-2 rounded-lg bg-emerald-600 px-4 text-[11px] font-semibold text-white hover:bg-emerald-700"><Send size={14} /> Issue letter</button>}{canManage && publishable && <button type="button" disabled={busy} onClick={onPublish} className="inline-flex h-10 items-center gap-2 rounded-lg bg-emerald-600 px-4 text-[11px] font-semibold text-white hover:bg-emerald-700"><Send size={14} /> {publishLabel}</button>}{canApprove && item.state === 'pending_approval' && <span className="inline-flex h-10 items-center rounded-lg bg-indigo-50 px-4 text-[11px] font-semibold text-indigo-700">Approval route ready</span>}{canManage && ['published', 'issued', 'invitations_published'].includes(item.state) && <button type="button" disabled={busy} onClick={onWithdraw} className="inline-flex h-10 items-center gap-2 rounded-lg border border-rose-200 px-4 text-[11px] font-semibold text-rose-700 hover:bg-rose-50"><AlertTriangle size={14} /> Withdraw</button>}</div></div>
}

export default function HRCommunicationsTab() {
  const { user } = useAuth()
  const { employees } = useEmployees(user?.orgId)
  const [activeTab, setActiveTab] = useState('letters')
  const [activeLetterCategory, setActiveLetterCategory] = useState('all')
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [form, setForm] = useState(emptyForm)
  const [showCreate, setShowCreate] = useState(false)
  const [selectedItem, setSelectedItem] = useState(null)
  const [busy, setBusy] = useState(false)
  const api = useCommunications(user?.orgId, user)
  const tab = TABS.find((item) => item.id === activeTab) || TABS[0]
  const canManage = canManageCommunications(user)
  const canApprove = canApproveCommunications(user)

  const records = useMemo(() => {
    const allRecords = activeTab === 'letters' ? api.letters : activeTab === 'announcements' ? api.announcements : activeTab === 'policies' ? api.policies : activeTab === 'training' ? api.training : activeTab === 'templates' ? api.templates : [...api.letters, ...api.announcements, ...api.policies, ...api.training]
    const selectedCategory = LEGACY_LETTER_SUBTABS.find((item) => item.id === activeLetterCategory)?.letterType
    const base = activeTab === 'letters' && selectedCategory ? allRecords.filter((record) => record.letterType === selectedCategory) : allRecords
    const query = search.trim().toLowerCase()
    return base.filter((record) => {
      const text = `${record.title || ''} ${record.name || ''} ${record.letterType || ''} ${record.employeeName || ''} ${record.category || ''}`.toLowerCase()
      return (!query || text.includes(query)) && (statusFilter === 'all' || record.state === statusFilter)
    })
  }, [activeLetterCategory, activeTab, api.announcements, api.letters, api.policies, api.templates, api.training, search, statusFilter])

  const createDraft = async () => {
    const isLetter = activeTab === 'letters'
    const isTemplate = activeTab === 'templates'
    if (isLetter && !form.employeeId) { alert('Select an employee before creating a letter draft.'); return }
    if (!isLetter && !form.title.trim()) { alert('A title is required.'); return }
    setBusy(true)
    try {
      const audience = { scope: form.audienceScope, site: form.audienceSite, department: form.audienceDepartment }
      if (isTemplate) await api.createTemplate({ name: form.title, type: form.category || 'Letter', body: form.body, placeholderSchema: [] })
      else await api.createRecord(tab.kind, isLetter ? { letterType: form.letterType, title: form.letterType, employeeId: form.employeeId, employeeName: form.employeeName, body: form.body, effectiveDate: form.effectiveDate, version: 1 } : { title: form.title, body: form.body, category: form.category, audience, priority: form.priority, acknowledgementMode: form.acknowledgementMode, documentCode: form.documentCode, effectiveDate: form.effectiveDate, reviewDate: form.reviewDate, sessionDate: form.sessionDate, deliveryMode: form.deliveryMode, version: 1 })
      setShowCreate(false); setForm(emptyForm())
    } catch (error) { alert(error?.message || 'Unable to create the draft.') } finally { setBusy(false) }
  }

  const handleAction = async (action) => {
    if (!selectedItem) return
    setBusy(true)
    try {
      if (action === 'issue') await api.issueLetter(selectedItem)
      if (action === 'publish' && activeTab === 'announcements') await api.publishAnnouncement(selectedItem)
      if (action === 'publish' && activeTab === 'policies') await api.publishPolicy(selectedItem)
      if (action === 'publish' && activeTab === 'training') await api.publishTraining(selectedItem)
      if (action === 'withdraw') await api.updateRecord(tab.kind, selectedItem.id, { state: 'withdrawn', withdrawnReason: 'Withdrawn by HR' }, 'withdrawn')
      setSelectedItem(null)
    } catch (error) { alert(error?.message || 'Unable to update this communication.') } finally { setBusy(false) }
  }

  const columns = useMemo(() => [
    { header: activeTab === 'letters' ? 'Employee / document' : activeTab === 'policies' ? 'Code / document' : activeTab === 'templates' ? 'Template' : 'Title', id: 'title', cell: ({ row }) => <div className="min-w-0"><p className="truncate text-[12px] font-semibold text-slate-800">{row.employeeName || row.title || row.name || row.letterType}</p><p className="truncate text-[10px] text-slate-400">{row.letterType || row.documentCode || row.category || row.type || 'HR communication'}</p></div>, headerClassName: 'text-[10px] font-bold uppercase tracking-widest text-slate-400', cellClassName: 'text-left' },
    { header: 'Audience', id: 'audience', cell: ({ row }) => <span className="text-[11px] text-slate-600">{row.employeeName || row.audienceSnapshot?.scope?.replaceAll('_', ' ') || row.audience?.scope?.replaceAll('_', ' ') || '—'}</span>, headerClassName: 'text-[10px] font-bold uppercase tracking-widest text-slate-400' },
    { header: 'Effective / publish', id: 'date', cell: ({ row }) => <span className="text-[11px] text-slate-600">{dateLabel(row.effectiveDate || row.publishedAt || row.sessionDate || row.createdAt)}</span>, headerClassName: 'text-[10px] font-bold uppercase tracking-widest text-slate-400' },
    { header: 'Delivery', id: 'delivery', cell: ({ row }) => <span className="text-[11px] font-medium text-slate-600">{row.recipientCount || (row.employeeId ? 1 : 0)} recipient{(row.recipientCount || (row.employeeId ? 1 : 0)) === 1 ? '' : 's'}</span>, headerClassName: 'text-[10px] font-bold uppercase tracking-widest text-slate-400', align: 'center' },
    { header: 'Status', id: 'state', cell: ({ row }) => <StatePill state={row.state || row.status} />, headerClassName: 'text-[10px] font-bold uppercase tracking-widest text-slate-400', align: 'center' },
  ], [activeTab])

  return <div className="module-layout-root flex h-full flex-col gap-4 pb-6 font-inter">
    <div className="module-top-surface rounded-[12px] border border-gray-100 bg-white px-4 pt-3 shadow-sm md:px-6 md:pt-4"><FleetSecondaryTabs tabs={TABS} activeTabId={activeTab} onTabChange={(next) => { setActiveTab(next.id); setSearch(''); setStatusFilter('all') }} ariaLabel="HR Communications sections" /></div>
    {activeTab === 'letters' && <div className="rounded-[12px] border border-gray-100 bg-white px-4 pt-3 shadow-sm md:px-6 md:pt-4"><div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between"><FleetSecondaryTabs className="min-w-0" tabs={LEGACY_LETTER_SUBTABS} activeTabId={activeLetterCategory === 'all' ? '' : activeLetterCategory} onTabChange={(next) => setActiveLetterCategory(next.id)} ariaLabel="Letter format categories" /><button type="button" onClick={() => setActiveLetterCategory('all')} className={`mb-2 inline-flex h-8 items-center self-start rounded-lg px-3 text-[10px] font-bold uppercase tracking-wide transition md:self-auto ${activeLetterCategory === 'all' ? 'bg-slate-900 text-white' : 'bg-slate-50 text-slate-500 hover:bg-slate-100'}`}>All letters</button></div></div>}
    {activeTab === 'formats' ? <LegacyLetterFormatsWorkspace employees={employees} user={user} api={api} canManage={canManage} /> : <><WorkspaceHero tab={tab} count={records.length} canManage={canManage} onCreate={() => { const legacyType = LEGACY_LETTER_SUBTABS.find((item) => item.id === activeLetterCategory)?.letterType; setForm({ ...emptyForm(), ...(legacyType ? { letterType: legacyType } : {}) }); setShowCreate(true) }} />
    <div className="rounded-[12px] border border-gray-100 bg-white p-4 shadow-sm md:p-5"><div className="mb-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between"><div className="relative w-full md:max-w-sm"><Eye className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={15} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder={`Search ${tab.label.toLowerCase()}…`} className="h-10 w-full rounded-lg border border-slate-200 bg-white pl-9 pr-3 text-[12px] text-slate-700 outline-none focus:border-indigo-400" /></div><select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)} className="h-10 rounded-lg border border-slate-200 bg-white px-3 text-[12px] font-medium text-slate-700"><option value="all">All statuses</option><option value="draft">Draft</option><option value="published">Published</option><option value="issued">Issued</option><option value="withdrawn">Withdrawn</option><option value="completed">Completed</option></select></div><Table data={records} columns={columns} loading={api.loading} page={1} pageSize={25} totalRows={records.length} searchable={false} pagination={false} sortable onView={(item) => setSelectedItem(item)} emptyTitle={`No ${tab.label.toLowerCase()} yet`} emptySubtitle={canManage ? 'Create a controlled draft to begin the workflow.' : 'Published items will appear here when they are available to you.'} emptyActionLabel={canManage && activeTab !== 'archive' ? `Create ${tab.label.slice(0, -1)}` : undefined} onEmptyAction={canManage ? () => setShowCreate(true) : undefined} /></div>
    <Modal isOpen={showCreate} onClose={() => setShowCreate(false)} title={`New ${tab.id === 'policies' ? 'SOP / Policy' : tab.label.slice(0, -1)}`}><CommunicationForm tab={tab} form={form} setForm={setForm} employees={employees} onClose={() => setShowCreate(false)} onSave={createDraft} saving={busy} /></Modal>
    <Modal isOpen={!!selectedItem} onClose={() => setSelectedItem(null)} title="Communication details"><ItemDetails item={selectedItem} tab={tab} onClose={() => setSelectedItem(null)} onIssue={() => handleAction('issue')} onPublish={() => handleAction('publish')} onWithdraw={() => handleAction('withdraw')} canManage={canManage} canApprove={canApprove} busy={busy} /></Modal></>}
    {api.loading && <div className="fixed inset-0 z-[100] flex items-center justify-center bg-white/40 backdrop-blur-[1px]"><Spinner /></div>}
  </div>
}
