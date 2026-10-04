import React, { useMemo, useState } from 'react'
import {
  AlertTriangle,
  Archive,
  Award,
  BookOpenCheck,
  CalendarDays,
  Eye,
  FileText,
  GraduationCap,
  Megaphone,
  Pencil,
  Plus,
  Send,
  ShieldCheck,
  Trash2,
  X,
} from 'lucide-react'
import { useAuth } from '../../../hooks/useAuth'
import { useEmployees } from '../../../hooks/useEmployees'
import { useCommunications } from '../../../hooks/useCommunications'
import { Table } from '../../table/Table'
import { ModulePillTabs } from '../../ui/ModulePillTabs'
import Modal from '../../ui/Modal'
import ShareAction from '../../ui/ShareAction'
import Spinner from '../../ui/Spinner'
import LegacyLetterFormatsWorkspace from './LegacyLetterFormatsWorkspace'
import {
  canApproveCommunications,
  canCreateCommunications,
  canDeleteCommunication,
  canEditCommunication,
  canManageCommunications,
  canRequestCommunicationApproval,
  COMMUNICATION_KINDS,
  communicationTabIdForKind,
  DEFAULT_ANNOUNCEMENT_CATEGORIES,
  DEFAULT_LETTER_TYPES,
  DEFAULT_POLICY_CATEGORIES,
  DEFAULT_TRAINING_CATEGORIES,
  isArchivedCommunication,
  nextCommunicationVersion,
  referenceNumber,
  resolveAudience,
  statusLabel,
  statusTone,
  summarizeDeliveries,
} from '../../../lib/communications'
import { buildPublishedCommunicationPayload, canSharePublishedCommunication } from '../../../lib/share'

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

const FORM_LABEL = 'block text-sm font-medium text-slate-800 mb-1.5 font-body'
const INPUT = 'h-9 w-full rounded-md border border-slate-200 bg-white px-3 py-1 text-sm text-slate-800 outline-none focus-visible:ring-1 focus-visible:ring-blue-600 placeholder:text-slate-400'
const TEXTAREA = 'w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm leading-5 text-slate-800 outline-none focus-visible:ring-1 focus-visible:ring-blue-600 placeholder:text-slate-400'
const STATUS_FILTERS = {
  letters: [['all', 'All statuses'], ['draft', 'Draft'], ['pending_approval', 'Pending approval'], ['approved', 'Approved'], ['issued', 'Issued'], ['withdrawn', 'Withdrawn']],
  announcements: [['all', 'All statuses'], ['draft', 'Draft'], ['pending_approval', 'Pending approval'], ['approved', 'Approved'], ['published', 'Published'], ['withdrawn', 'Withdrawn'], ['expired', 'Expired']],
  policies: [['all', 'All statuses'], ['draft', 'Draft'], ['pending_approval', 'Pending approval'], ['approved', 'Approved'], ['published', 'Published'], ['superseded', 'Superseded'], ['withdrawn', 'Withdrawn']],
  training: [['all', 'All statuses'], ['draft', 'Draft'], ['pending_approval', 'Pending approval'], ['approved', 'Approved'], ['invitations_published', 'Invitations published'], ['completed', 'Completed'], ['cancelled', 'Cancelled']],
  templates: [['all', 'All statuses'], ['active', 'Active']],
  archive: [['all', 'All history'], ['archived', 'Archived / expired'], ['draft', 'Draft'], ['pending_approval', 'Pending approval'], ['approved', 'Approved'], ['published', 'Published'], ['issued', 'Issued'], ['invitations_published', 'Invitations published'], ['completed', 'Completed'], ['withdrawn', 'Withdrawn'], ['superseded', 'Superseded'], ['expired', 'Expired'], ['cancelled', 'Cancelled']],
}

const today = () => new Date().toISOString().slice(0, 10)
const emptyForm = (tabId) => ({
  title: '', body: '', category: '', employeeId: '', employeeName: '', letterType: 'Employment Certificate',
  documentCode: '', effectiveDate: today(), reviewDate: '', expiresAt: '', sessionDate: '',
  deliveryMode: 'On-site', priority: 'normal', acknowledgementMode: tabId === 'policies' ? 'acknowledged' : 'seen',
  audienceScope: 'all_active', audienceSite: '', audienceDepartment: '',
})

const formFromRecord = (record, tabId) => ({
  ...emptyForm(tabId),
  title: record.title || record.name || '', body: record.body || '', category: record.category || record.type || '',
  employeeId: record.employeeId || '', employeeName: record.employeeName || '', letterType: record.letterType || 'Employment Certificate',
  documentCode: record.documentCode || '', effectiveDate: record.effectiveDate || '', reviewDate: record.reviewDate || '',
  expiresAt: record.expiresAt || '', sessionDate: record.sessionDate || '', deliveryMode: record.deliveryMode || 'On-site',
  priority: record.priority || 'normal', acknowledgementMode: record.acknowledgementMode || (tabId === 'policies' ? 'acknowledged' : 'seen'),
  audienceScope: record.audience?.scope || 'all_active', audienceSite: record.audience?.site || '', audienceDepartment: record.audience?.department || '',
})

const dateLabel = (value) => {
  if (!value) return '—'
  const date = value?.toDate ? value.toDate() : new Date(value)
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
}

const displayTitle = (item) => item.title || item.letterType || item.name || 'Untitled communication'
const kindLabel = (kind) => ({ letter: 'Letter', announcement: 'Announcement', policy: 'SOP / Policy', training: 'Training', template: 'Template' })[kind] || 'HR communication'
const audienceLabel = (item) => {
  if (item.employeeName) return item.employeeName
  const audience = item.audienceSnapshot || item.audience || {}
  if (audience.scope === 'site') return audience.site ? `Site: ${audience.site}` : 'Site not selected'
  if (audience.scope === 'department') return audience.department ? `Department: ${audience.department}` : 'Department not selected'
  if (audience.scope === 'all_active' || !audience.scope) return 'All active employees'
  return audience.scope.replaceAll('_', ' ')
}

function StatePill({ state }) {
  return <span className={`inline-flex rounded-full border px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide ${statusTone(state)}`}>{statusLabel(state)}</span>
}

function Field({ label, children, hint }) {
  return <label className={FORM_LABEL}>{label}{children}{hint && <span className="mt-1 block text-xs font-normal text-slate-500">{hint}</span>}</label>
}

function WorkspaceGuide() {
  return <section aria-labelledby="communications-title" className="rounded-[12px] border border-slate-200 bg-white p-4 shadow-sm md:p-5">
    <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
      <div className="max-w-2xl"><p className="text-[10px] font-bold uppercase tracking-widest text-blue-700">People operations</p><h1 id="communications-title" className="mt-1 text-xl font-semibold tracking-tight text-slate-950">HR Communications</h1><p className="mt-1 text-sm leading-5 text-slate-600">Create employee letters, share operational updates, control policy versions, and follow training invitations from one workspace.</p></div>
      <ol aria-label="Communication workflow" className="grid grid-cols-2 gap-2 text-xs text-slate-600 sm:grid-cols-4">
        {['1. Draft', '2. Review details', '3. Publish or issue', '4. Track response'].map((step) => <li key={step} className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 font-medium">{step}</li>)}
      </ol>
    </div>
  </section>
}

function WorkspaceHero({ tab, count, onCreate, canCreate }) {
  const copy = {
    letters: ['Employee documents', 'Create a letter for one employee, review its details, then issue a numbered employee copy.'],
    announcements: ['Operational updates', 'Share time-sensitive news with active employees, a site, or a department; optional expiry and acknowledgement are available.'],
    policies: ['Controlled documents', 'Publish a dated SOP or policy version, request acknowledgement, and create a new revision without changing copies already delivered.'],
    training: ['Training invitations', 'Publish a session invitation and see who has opened or acknowledged it. This is not a course-completion tracker.'],
    templates: ['Document templates', 'Keep reusable copy in one place. Changes create a new template version; existing issued letters stay unchanged.'],
    archive: ['History and audit', 'Find drafts, issued or published records, expired content, withdrawals, and superseded policy versions.'],
    formats: ['Legacy generators', 'Generate the original HR letter formats and optionally save the result into the controlled Letters workflow.'],
  }[tab.id]
  return <div className="rounded-[12px] border border-slate-200 bg-white p-4 shadow-sm md:p-5">
    <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between"><div><p className="text-[10px] font-bold uppercase tracking-widest text-blue-700">{copy[0]}</p><h2 className="mt-1 text-lg font-semibold tracking-tight text-slate-950">{tab.label}</h2><p className="mt-1 max-w-3xl text-sm leading-5 text-slate-600">{copy[1]}</p></div>
      <div className="flex shrink-0 items-center gap-3"><span className="rounded-lg bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-600">{count} {count === 1 ? 'record' : 'records'}</span>{canCreate && tab.id !== 'archive' && <button type="button" onClick={onCreate} className="inline-flex h-9 items-center gap-2 rounded-md bg-blue-600 px-4 text-sm font-bold text-white shadow-sm transition hover:bg-blue-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2"><Plus size={15} /> New {tab.id === 'policies' ? 'SOP / Policy' : tab.id === 'templates' ? 'Template' : tab.label.slice(0, -1)}</button>}</div>
    </div>
  </div>
}

function CommunicationForm({ tab, form, setForm, employees, onClose, onSave, saving, initialError = '' }) {
  const [error, setError] = useState(initialError)
  const categories = tab.id === 'announcements' ? DEFAULT_ANNOUNCEMENT_CATEGORIES : tab.id === 'policies' ? DEFAULT_POLICY_CATEGORIES : tab.id === 'training' ? DEFAULT_TRAINING_CATEGORIES : DEFAULT_LETTER_TYPES
  const update = (field, value) => { setForm((current) => ({ ...current, [field]: value })); setError('') }
  const isLetter = tab.id === 'letters'
  const isTemplate = tab.id === 'templates'
  const isAudienceDriven = ['announcements', 'policies', 'training'].includes(tab.id)
  const audience = { scope: form.audienceScope, site: form.audienceSite, department: form.audienceDepartment }
  const recipientCount = isAudienceDriven ? resolveAudience(employees, audience).length : 0
  const sites = [...new Set(employees.map((employee) => employee.site).filter(Boolean))].sort()
  const departments = [...new Set(employees.map((employee) => employee.department).filter(Boolean))].sort()

  const save = () => {
    if (isLetter && !form.employeeId) { setError('Select the employee who will receive this letter.'); return }
    if (!isLetter && !form.title.trim()) { setError(isTemplate ? 'Enter a name for this template.' : 'Enter a title before saving the draft.'); return }
    if (!isLetter && !form.category) { setError(isTemplate ? 'Choose what this template is for.' : 'Choose a category to help people find this item.'); return }
    if (isAudienceDriven && form.audienceScope === 'site' && !form.audienceSite) { setError('Choose a site before saving this audience.'); return }
    if (isAudienceDriven && form.audienceScope === 'department' && !form.audienceDepartment) { setError('Choose a department before saving this audience.'); return }
    if (form.reviewDate && form.effectiveDate && form.reviewDate < form.effectiveDate && tab.id === 'policies') { setError('Review date should be on or after the effective date.'); return }
    onSave()
  }

  return <div className="space-y-5 p-5 md:p-6">
    <div><p className="text-[10px] font-bold uppercase tracking-widest text-blue-700">{isTemplate ? 'Reusable content' : 'Draft details'}</p><h3 className="mt-1 text-lg font-semibold text-slate-900">{tab.id === 'policies' ? 'SOP / Policy' : isTemplate ? 'Template' : tab.label.slice(0, -1)}</h3><p className="mt-1 text-xs leading-5 text-slate-500">Saving keeps this as a draft. It is not sent to employees until an authorized approver publishes or issues it.</p></div>
    {isLetter && <Field label="Employee"><select value={form.employeeId} onChange={(event) => { const employee = employees.find((item) => item.id === event.target.value); setForm((current) => ({ ...current, employeeId: employee?.id || '', employeeName: employee?.name || '' })) }} className={INPUT}><option value="">Select employee</option>{employees.map((employee) => <option key={employee.id} value={employee.id}>{employee.name} {employee.empCode ? `(${employee.empCode})` : ''}</option>)}</select></Field>}
    <div className="grid gap-4 sm:grid-cols-2">
      <Field label={isTemplate ? 'Template name' : isLetter ? 'Letter type' : tab.id === 'policies' ? 'Document title' : tab.id === 'training' ? 'Programme title' : 'Announcement title'}>
        {isLetter ? <select value={form.letterType} onChange={(event) => update('letterType', event.target.value)} className={INPUT}>{DEFAULT_LETTER_TYPES.map((item) => <option key={item} value={item}>{item}</option>)}</select> : <input value={form.title} onChange={(event) => update('title', event.target.value)} className={INPUT} placeholder={isTemplate ? 'e.g. Employment Certificate' : 'Enter a clear, searchable title'} />}
      </Field>
      <Field label={isTemplate ? 'Template type' : 'Category'}><select value={form.category} onChange={(event) => update('category', event.target.value)} className={INPUT}><option value="">Select category</option>{(isTemplate ? ['Letter', 'Announcement', 'Policy', 'Training Certificate'] : categories).map((item) => <option key={item} value={item}>{item}</option>)}</select></Field>
    </div>
    {tab.id === 'policies' && <div className="grid gap-4 sm:grid-cols-2"><Field label="Document code"><input value={form.documentCode} onChange={(event) => update('documentCode', event.target.value)} className={INPUT} placeholder="e.g. SOP-CAN-001" /></Field><Field label="Review date" hint="Set a date to prompt a human review; no automatic reminders are sent."><input type="date" value={form.reviewDate} onChange={(event) => update('reviewDate', event.target.value)} className={INPUT} /></Field></div>}
    {tab.id === 'training' && <div className="grid gap-4 sm:grid-cols-2"><Field label="Session date"><input type="date" value={form.sessionDate} onChange={(event) => update('sessionDate', event.target.value)} className={INPUT} /></Field><Field label="Delivery mode"><select value={form.deliveryMode} onChange={(event) => update('deliveryMode', event.target.value)} className={INPUT}><option>On-site</option><option>Online</option><option>Hybrid</option></select></Field></div>}
    {tab.id === 'announcements' && <div className="grid gap-4 sm:grid-cols-2"><Field label="Priority"><select value={form.priority} onChange={(event) => update('priority', event.target.value)} className={INPUT}><option value="normal">Normal</option><option value="high">High priority</option></select></Field><Field label="Hide from employee inbox after" hint="Expiry hides the item from active employee inboxes; the record remains in HR history."><input type="date" value={form.expiresAt} onChange={(event) => update('expiresAt', event.target.value)} className={INPUT} /></Field></div>}
    {['letters', 'policies', 'announcements'].includes(tab.id) && <Field label={tab.id === 'policies' ? 'Effective from' : tab.id === 'letters' ? 'Letter effective date' : 'Event / effective date'} hint={tab.id === 'announcements' ? 'Publishing is immediate. This date is shown as context; it does not schedule publication.' : undefined}><input type="date" value={form.effectiveDate} onChange={(event) => update('effectiveDate', event.target.value)} className={INPUT} /></Field>}
    {['policies', 'announcements'].includes(tab.id) && <Field label="Employee response"><select value={form.acknowledgementMode} onChange={(event) => update('acknowledgementMode', event.target.value)} className={INPUT}><option value="seen">Record when opened</option><option value="acknowledged">Require “I have read and understood”</option></select></Field>}
    {isAudienceDriven && <div className="rounded-xl border border-slate-200 bg-slate-50 p-4"><div className="flex flex-wrap items-start justify-between gap-2"><div><p className="text-sm font-semibold text-slate-900">Who should receive this?</p><p className="mt-0.5 text-xs text-slate-500">Only active employees in this organisation are included.</p></div><span aria-live="polite" className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-slate-700">{recipientCount} recipients</span></div><div className="mt-3 grid gap-3 sm:grid-cols-2"><Field label="Audience"><select value={form.audienceScope} onChange={(event) => update('audienceScope', event.target.value)} className={INPUT}><option value="all_active">All active employees</option><option value="site">One site</option><option value="department">One department</option></select></Field>{form.audienceScope === 'site' && <Field label="Site"><select value={form.audienceSite} onChange={(event) => update('audienceSite', event.target.value)} className={INPUT}><option value="">Select site</option>{sites.map((site) => <option key={site} value={site}>{site}</option>)}</select></Field>}{form.audienceScope === 'department' && <Field label="Department"><select value={form.audienceDepartment} onChange={(event) => update('audienceDepartment', event.target.value)} className={INPUT}><option value="">Select department</option>{departments.map((department) => <option key={department} value={department}>{department}</option>)}</select></Field>}</div>{recipientCount === 0 && <p role="status" className="mt-2 text-xs font-medium text-amber-700">No active employees match this selection yet. Review the audience before publishing.</p>}</div>}
    <Field label={isTemplate ? 'Template copy' : isLetter ? 'Draft content or HR note' : 'Message / policy content'} hint={isTemplate ? 'This stores reusable text. Dynamic placeholder expansion is not available in this workspace.' : undefined}><textarea rows={6} value={form.body} onChange={(event) => update('body', event.target.value)} className={TEXTAREA} placeholder={isTemplate ? 'Write the reusable text…' : 'Write the authoritative content employees should see.'} /></Field>
    {error && <p role="alert" className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-medium text-rose-700">{error}</p>}
    <div className="flex flex-col-reverse gap-2 border-t border-slate-100 pt-4 sm:flex-row sm:justify-end"><button type="button" onClick={onClose} className="h-9 rounded-md border border-slate-200 bg-white px-4 text-sm font-medium text-slate-700 hover:bg-slate-50">Cancel</button><button type="button" onClick={save} disabled={saving} className="inline-flex h-9 items-center justify-center gap-2 rounded-md bg-blue-600 px-5 text-sm font-bold text-white shadow-sm hover:bg-blue-700 disabled:opacity-50">{saving ? 'Saving…' : 'Save draft'}</button></div>
  </div>
}

function ItemDetails({ item, kind, user, orgId, onClose, onEdit, onRequestAction, onCreateRevision, canEdit, canDelete, canRequestApproval, canApprove, canCreate, busy, deliveries, employees, pendingAction, onConfirm, onCancelConfirm }) {
  if (!item) return null
  const title = displayTitle(item)
  const isTemplate = kind === 'template'
  const isDraft = (item.state || item.status) === 'draft'
  const publishable = ['announcement', 'policy', 'training'].includes(kind) && ['draft', 'approved'].includes(item.state)
  const publishedOrIssued = ['published', 'issued', 'invitations_published'].includes(item.state)
  const recipientCount = kind === 'letter' ? (item.employeeId ? 1 : 0) : resolveAudience(employees, item.audience || item.audienceSnapshot || {}).length
  const response = summarizeDeliveries(deliveries, item.id)
  const detailTitle = isTemplate ? item.name : title
  const currentState = isTemplate ? item.status || 'active' : item.state || 'draft'
  const canShareThisItem = canSharePublishedCommunication(user, orgId, item, kind)
  const confirmCopy = {
    publish: `Publish “${title}” to ${recipientCount} active employee${recipientCount === 1 ? '' : 's'} now? The version and content shown above will be copied into each recipient’s inbox.`,
    issue: `Issue ${item.letterType || 'this letter'} to ${item.employeeName || 'the selected employee'} now? This creates an employee-facing copy and reference.`,
    withdraw: `Withdraw “${title}” now? It will no longer appear in the active employee inbox, but its delivery history will be retained.`,
    delete: `Delete this ${isTemplate ? 'template' : 'draft'}? This cannot be undone. Previously issued employee copies are not deleted.`,
    request_approval: `Send “${title}” to an authorized HR approver? It will remain private and will not be sent to employees until it is approved and published or issued.`,
    approve: `Approve version ${item.version || 1} of “${title}”? Approval does not publish it; it still needs to be issued or published.`,
  }[pendingAction]
  return <div className="p-5 md:p-6">
    <div className="flex items-start justify-between gap-4"><div><p className="text-[10px] font-bold uppercase tracking-widest text-blue-700">{kindLabel(kind)}</p><h3 className="mt-1 text-lg font-semibold text-slate-900">{detailTitle}</h3><div className="mt-2 flex flex-wrap items-center gap-2"><StatePill state={currentState} />{Number(item.version) > 0 && <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-600">Version {item.version}</span>}{item.documentCode && <span className="text-xs text-slate-500">{item.documentCode}</span>}</div></div><button type="button" aria-label="Close details" onClick={onClose} className="rounded-lg p-2 text-slate-400 hover:bg-slate-100"><X size={18} /></button></div>
    <dl className="mt-5 grid gap-3 rounded-xl border border-slate-200 bg-slate-50 p-4 text-xs text-slate-700 sm:grid-cols-2">
      <div><dt className="text-[10px] font-bold uppercase tracking-wide text-slate-500">Reference</dt><dd className="mt-1">{item.issueReference || referenceNumber(kind, item.id)}</dd></div>
      <div><dt className="text-[10px] font-bold uppercase tracking-wide text-slate-500">Audience / employee</dt><dd className="mt-1">{audienceLabel(item)}</dd></div>
      <div><dt className="text-[10px] font-bold uppercase tracking-wide text-slate-500">Effective date</dt><dd className="mt-1">{dateLabel(item.effectiveDate)}</dd></div>
      {item.reviewDate && <div><dt className="text-[10px] font-bold uppercase tracking-wide text-slate-500">Review date</dt><dd className="mt-1">{dateLabel(item.reviewDate)}</dd></div>}
      {item.expiresAt && <div><dt className="text-[10px] font-bold uppercase tracking-wide text-slate-500">Expires</dt><dd className="mt-1">{dateLabel(item.expiresAt)}</dd></div>}
      {item.sessionDate && <div><dt className="text-[10px] font-bold uppercase tracking-wide text-slate-500">Training session</dt><dd className="mt-1">{dateLabel(item.sessionDate)} · {item.deliveryMode || 'On-site'}</dd></div>}
      <div><dt className="text-[10px] font-bold uppercase tracking-wide text-slate-500">Last updated</dt><dd className="mt-1">{dateLabel(item.updatedAt)}</dd></div>
      {!isTemplate && <div><dt className="text-[10px] font-bold uppercase tracking-wide text-slate-500">Employee response</dt><dd className="mt-1">{response.total ? `${response.acknowledged} acknowledged · ${response.seen} seen · ${response.pending} pending` : `${item.recipientCount || recipientCount} recipient${(item.recipientCount || recipientCount) === 1 ? '' : 's'} · no delivery responses yet`}</dd></div>}
    </dl>
    <div className="mt-5 min-h-24 whitespace-pre-wrap rounded-xl border border-slate-200 bg-white p-4 text-sm leading-6 text-slate-700">{item.body || 'No body text has been added to this draft.'}</div>
    {item.expiresAt && isArchivedCommunication(item) && <p className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">This content has passed its expiry date. It remains in HR history.</p>}
    {item.supersedesId && <p className="mt-3 text-xs text-slate-500">This draft revises a previously published policy. The earlier version stays available in the archive.</p>}
    <div className="mt-5 flex flex-wrap gap-2 border-t border-slate-100 pt-4">
      {isDraft && canEdit && <button type="button" disabled={busy} onClick={onEdit} className="inline-flex h-9 items-center gap-2 rounded-md border border-slate-200 bg-white px-3 text-sm font-medium text-slate-700 hover:bg-slate-50"><Pencil size={14} /> Edit draft</button>}
      {isDraft && canDelete && <button type="button" disabled={busy} onClick={() => onRequestAction('delete')} className="inline-flex h-9 items-center gap-2 rounded-md border border-rose-200 bg-white px-3 text-sm font-medium text-rose-700 hover:bg-rose-50"><Trash2 size={14} /> Delete draft</button>}
      {isDraft && canRequestApproval && !canApprove && <button type="button" disabled={busy} onClick={() => onRequestAction('request_approval')} className="inline-flex h-9 items-center gap-2 rounded-md border border-blue-200 bg-blue-50 px-3 text-sm font-semibold text-blue-700 hover:bg-blue-100"><Send size={14} /> Request approval</button>}
      {item.state === 'pending_approval' && canApprove && <button type="button" disabled={busy} onClick={() => onRequestAction('approve')} className="inline-flex h-9 items-center gap-2 rounded-md bg-blue-600 px-4 text-sm font-bold text-white hover:bg-blue-700 disabled:opacity-50"><ShieldCheck size={14} /> Approve</button>}
      {!isTemplate && kind === 'letter' && ['draft', 'approved'].includes(item.state) && canApprove && <button type="button" disabled={busy} onClick={() => onRequestAction('issue')} className="inline-flex h-9 items-center gap-2 rounded-md bg-emerald-600 px-4 text-sm font-bold text-white hover:bg-emerald-700 disabled:opacity-50"><Send size={14} /> Issue letter</button>}
      {publishable && canApprove && <button type="button" disabled={busy || (kind !== 'letter' && recipientCount === 0) || !item.body?.trim()} onClick={() => onRequestAction('publish')} className="inline-flex h-9 items-center gap-2 rounded-md bg-emerald-600 px-4 text-sm font-bold text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"><Send size={14} /> Publish to {recipientCount} employee{recipientCount === 1 ? '' : 's'}</button>}
      {kind === 'policy' && item.state === 'published' && canCreate && <button type="button" disabled={busy} onClick={onCreateRevision} className="inline-flex h-9 items-center gap-2 rounded-md border border-blue-200 bg-blue-50 px-3 text-sm font-semibold text-blue-700 hover:bg-blue-100"><FileText size={14} /> Create revision</button>}
      {publishedOrIssued && canApprove && <button type="button" disabled={busy} onClick={() => onRequestAction('withdraw')} className="inline-flex h-9 items-center gap-2 rounded-md border border-rose-200 px-3 text-sm font-medium text-rose-700 hover:bg-rose-50"><Archive size={14} /> Withdraw</button>}
      {canShareThisItem && <ShareAction
        label="Share"
        canShare={() => canSharePublishedCommunication(user, orgId, item, kind)}
        buildPayload={() => buildPublishedCommunicationPayload(item, kind)}
      />}
    </div>
    {pendingAction && <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-4" role="alertdialog" aria-label="Confirm communication action"><p className="text-sm font-semibold text-amber-950">Please confirm</p><p className="mt-1 text-sm leading-5 text-amber-900">{confirmCopy}</p>{pendingAction === 'publish' && <p className="mt-2 text-xs text-amber-800">Audience: {audienceLabel(item)} · {recipientCount} recipients · Version {item.version || 1} · Acknowledgement: {item.acknowledgementMode === 'acknowledged' ? 'required' : 'recorded when opened'}{item.effectiveDate ? ` · Effective ${dateLabel(item.effectiveDate)}` : ''}{item.expiresAt ? ` · Expires ${dateLabel(item.expiresAt)}` : ''}</p>}{pendingAction === 'issue' && <p className="mt-2 text-xs text-amber-800">Employee: {item.employeeName || 'Not selected'} · Reference: {item.issueReference || referenceNumber('letter', item.id)}{item.effectiveDate ? ` · Effective ${dateLabel(item.effectiveDate)}` : ''}</p>}<div className="mt-3 flex flex-wrap justify-end gap-2"><button type="button" disabled={busy} onClick={onCancelConfirm} className="h-9 rounded-md border border-amber-300 bg-white px-3 text-sm font-medium text-amber-950">Cancel</button><button type="button" disabled={busy} onClick={onConfirm} className={`h-9 rounded-md px-4 text-sm font-bold text-white ${pendingAction === 'delete' || pendingAction === 'withdraw' ? 'bg-rose-600 hover:bg-rose-700' : pendingAction === 'request_approval' || pendingAction === 'approve' ? 'bg-blue-600 hover:bg-blue-700' : 'bg-emerald-600 hover:bg-emerald-700'}`}>{busy ? 'Working…' : pendingAction === 'delete' ? 'Delete' : pendingAction === 'issue' ? 'Issue letter' : pendingAction === 'withdraw' ? 'Withdraw' : pendingAction === 'request_approval' ? 'Request approval' : pendingAction === 'approve' ? 'Approve' : 'Publish now'}</button></div></div>}
  </div>
}

export default function HRCommunicationsTab() {
  const { user } = useAuth()
  const { employees } = useEmployees(user?.orgId)
  const api = useCommunications(user?.orgId, user)
  const [activeTab, setActiveTab] = useState('letters')
  const [activeLetterCategory, setActiveLetterCategory] = useState('all')
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [form, setForm] = useState(() => emptyForm('letters'))
  const [formTabId, setFormTabId] = useState('letters')
  const [showForm, setShowForm] = useState(false)
  const [editingItem, setEditingItem] = useState(null)
  const [selectedItem, setSelectedItem] = useState(null)
  const [pendingAction, setPendingAction] = useState('')
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState(null)

  const tab = TABS.find((item) => item.id === activeTab) || TABS[0]
  const canCreate = canCreateCommunications(user)
  const canManage = canManageCommunications(user)
  const canApprove = canApproveCommunications(user)
  const allCommunicationRecords = useMemo(() => [
    ...api.letters.map((record) => ({ ...record, kind: record.kind || COMMUNICATION_KINDS.LETTER })),
    ...api.announcements.map((record) => ({ ...record, kind: record.kind || COMMUNICATION_KINDS.ANNOUNCEMENT })),
    ...api.policies.map((record) => ({ ...record, kind: record.kind || COMMUNICATION_KINDS.POLICY })),
    ...api.training.map((record) => ({ ...record, kind: record.kind || COMMUNICATION_KINDS.TRAINING })),
  ], [api.announcements, api.letters, api.policies, api.training])
  const records = useMemo(() => {
    const source = activeTab === 'letters' ? api.letters.map((record) => ({ ...record, kind: record.kind || 'letter' }))
      : activeTab === 'announcements' ? api.announcements.map((record) => ({ ...record, kind: record.kind || 'announcement' }))
        : activeTab === 'policies' ? api.policies.map((record) => ({ ...record, kind: record.kind || 'policy' }))
          : activeTab === 'training' ? api.training.map((record) => ({ ...record, kind: record.kind || 'training' }))
            : activeTab === 'templates' ? api.templates.map((record) => ({ ...record, kind: 'template', state: record.status || 'active' }))
              : allCommunicationRecords
    const selectedCategory = LEGACY_LETTER_SUBTABS.find((item) => item.id === activeLetterCategory)?.letterType
    const base = activeTab === 'letters' && selectedCategory ? source.filter((record) => record.letterType === selectedCategory) : source
    const query = search.trim().toLowerCase()
    return base.filter((record) => {
      const text = `${record.title || ''} ${record.name || ''} ${record.letterType || ''} ${record.employeeName || ''} ${record.category || ''} ${record.documentCode || ''}`.toLowerCase()
      const expiredByDate = isArchivedCommunication(record)
      const matchesStatus = statusFilter === 'all' || (statusFilter === 'archived' ? isArchivedCommunication(record) : statusFilter === 'expired' ? record.state === 'expired' || (expiredByDate && ['published', 'issued', 'invitations_published'].includes(record.state)) : (record.state || record.status) === statusFilter)
      return (!query || text.includes(query)) && matchesStatus
    }).sort((left, right) => {
      const time = (record) => record.updatedAt?.toMillis?.() || record.updatedAt?.seconds * 1000 || new Date(record.updatedAt || record.createdAt || 0).getTime() || 0
      return time(right) - time(left)
    })
  }, [activeLetterCategory, activeTab, allCommunicationRecords, api.announcements, api.letters, api.policies, api.templates, api.training, search, statusFilter])

  const currentFormTab = TABS.find((item) => item.id === formTabId) || TABS[0]
  const currentItemKind = selectedItem?.kind || tab.kind
  const selectedCanEdit = selectedItem && currentItemKind !== 'archive' && canEditCommunication(selectedItem, user)
  const selectedCanDelete = selectedItem && canDeleteCommunication(selectedItem, user)
  const selectedCanRequestApproval = selectedItem && canRequestCommunicationApproval(selectedItem, user)

  const openCreate = (tabId = activeTab) => {
    const formTab = TABS.find((item) => item.id === tabId) || TABS[0]
    setEditingItem(null); setFormTabId(formTab.id); setForm(emptyForm(formTab.id)); setNotice(null); setShowForm(true)
  }
  const openEdit = (record) => {
    const item = { ...record }
    const formTabId = communicationTabIdForKind(item.kind)
    const formTab = TABS.find((entry) => entry.id === formTabId) || TABS[0]
    setEditingItem(item); setFormTabId(formTab.id); setForm(formFromRecord(item, formTab.id)); setPendingAction(''); setSelectedItem(null); setNotice(null); setShowForm(true)
  }

  const saveDraft = async () => {
    const isLetter = formTabId === 'letters'
    const isTemplate = formTabId === 'templates'
    const audience = { scope: form.audienceScope, site: form.audienceSite, department: form.audienceDepartment }
    const payload = isTemplate
      ? { name: form.title.trim(), type: form.category || 'Letter', body: form.body }
      : isLetter
        ? { letterType: form.letterType, title: form.letterType, employeeId: form.employeeId, employeeName: form.employeeName, body: form.body, effectiveDate: form.effectiveDate, version: Number(editingItem?.version || 1) }
        : {
            title: form.title.trim(), body: form.body, category: form.category, audience,
            priority: form.priority, acknowledgementMode: form.acknowledgementMode,
            documentCode: form.documentCode.trim(), effectiveDate: form.effectiveDate,
            reviewDate: form.reviewDate, expiresAt: form.expiresAt, sessionDate: form.sessionDate,
            deliveryMode: form.deliveryMode, version: Number(editingItem?.version || 1),
            ...(editingItem?.supersedesId ? { supersedesId: editingItem.supersedesId, previousVersion: editingItem.previousVersion } : {}),
          }
    setBusy(true); setNotice(null)
    try {
      if (editingItem) {
        if (isTemplate) await api.updateTemplate(editingItem.id, payload)
        else await api.updateRecord(TABS.find((item) => item.id === formTabId)?.kind, editingItem.id, payload)
        setNotice({ tone: 'success', message: `${isTemplate ? 'Template' : 'Draft'} saved. The previous content and employee copies remain unchanged.` })
      } else if (isTemplate) {
        await api.createTemplate({ ...payload, placeholderSchema: [] })
        setNotice({ tone: 'success', message: 'Template saved.' })
      } else {
        await api.createRecord(TABS.find((item) => item.id === formTabId)?.kind, payload)
        setNotice({ tone: 'success', message: 'Draft saved. It has not been sent to employees.' })
      }
      setShowForm(false); setEditingItem(null)
    } catch (error) {
      setNotice({ tone: 'error', message: error?.message || 'Unable to save this draft.' })
    } finally { setBusy(false) }
  }

  const requestAction = (action) => { setNotice(null); setPendingAction(action) }
  const runConfirmedAction = async () => {
    if (!selectedItem) return
    setBusy(true); setNotice(null)
    try {
      if (pendingAction === 'issue') {
        if (!selectedItem.body?.trim()) throw new Error('Add the letter content before issuing it.')
        await api.issueLetter(selectedItem)
        setNotice({ tone: 'success', message: 'Letter issued and copied to the employee inbox.' })
      }
      if (pendingAction === 'publish') {
        if (!selectedItem.body?.trim()) throw new Error('Add content before publishing.')
        if (currentItemKind === 'announcement') await api.publishAnnouncement(selectedItem)
        if (currentItemKind === 'policy') await api.publishPolicy(selectedItem)
        if (currentItemKind === 'training') await api.publishTraining(selectedItem)
        setNotice({ tone: 'success', message: 'Published. The employee inbox copies and response tracking are now active.' })
      }
      if (pendingAction === 'withdraw') {
        await api.withdrawRecord(currentItemKind, selectedItem.id)
        setNotice({ tone: 'success', message: 'Withdrawn. The item is no longer shown in active employee inboxes; its history is retained.' })
      }
      if (pendingAction === 'request_approval') {
        await api.requestApproval(currentItemKind, selectedItem.id)
        setNotice({ tone: 'success', message: 'Approval requested. The item remains private until it is approved and published or issued.' })
      }
      if (pendingAction === 'approve') {
        await api.approveRecord(currentItemKind, selectedItem.id)
        setNotice({ tone: 'success', message: 'Approved. This does not send it to employees; publish or issue it when ready.' })
      }
      if (pendingAction === 'delete') {
        if (currentItemKind === 'template') await api.deleteTemplate(selectedItem.id)
        else await api.deleteDraft(currentItemKind, selectedItem.id)
        setNotice({ tone: 'success', message: currentItemKind === 'template' ? 'Template deleted; previously issued employee copies were retained.' : 'Draft deleted.' })
      }
      setSelectedItem(null); setPendingAction('')
    } catch (error) {
      setNotice({ tone: 'error', message: error?.message || 'Unable to complete this action.' })
      setPendingAction('')
    } finally { setBusy(false) }
  }

  const startRevision = async () => {
    if (!selectedItem || currentItemKind !== 'policy') return
    setBusy(true); setNotice(null)
    try {
      await api.createPolicyRevision(selectedItem)
      setSelectedItem(null)
      setNotice({ tone: 'success', message: `Version ${nextCommunicationVersion(selectedItem)} draft created. The published version remains unchanged until the new revision is approved.` })
    } catch (error) { setNotice({ tone: 'error', message: error?.message || 'Unable to create a policy revision.' }) } finally { setBusy(false) }
  }

  const columns = useMemo(() => {
    const titleHeader = activeTab === 'letters' ? 'Employee / document' : activeTab === 'policies' ? 'Code / document' : activeTab === 'templates' ? 'Template' : activeTab === 'archive' ? 'Record / type' : 'Title'
    return [
      { header: titleHeader, id: 'title', cell: ({ row }) => <div className="min-w-0"><p className="truncate text-xs font-semibold text-slate-800">{activeTab === 'letters' ? row.employeeName || row.title || row.letterType : displayTitle(row)}</p><p className="truncate text-[10px] text-slate-500">{activeTab === 'archive' ? `${kindLabel(row.kind)} · ` : ''}{row.letterType || row.documentCode || row.category || row.type || 'HR communication'}{row.version ? ` · v${row.version}` : ''}</p></div>, headerClassName: 'text-[10px] font-bold uppercase tracking-widest text-slate-500', cellClassName: 'text-left' },
      { header: 'Audience', id: 'audience', cell: ({ row }) => <span className="text-xs text-slate-600">{audienceLabel(row)}</span>, headerClassName: 'text-[10px] font-bold uppercase tracking-widest text-slate-500' },
      { header: activeTab === 'training' ? 'Session date' : activeTab === 'policies' ? 'Effective / review' : 'Effective / updated', id: 'date', cell: ({ row }) => <span className="text-xs text-slate-600">{row.reviewDate && activeTab === 'policies' ? <>{dateLabel(row.effectiveDate)}<span className="block text-[10px] text-slate-500">Review {dateLabel(row.reviewDate)}</span></> : dateLabel(row.sessionDate || row.effectiveDate || row.publishedAt || row.updatedAt || row.createdAt)}</span>, headerClassName: 'text-[10px] font-bold uppercase tracking-widest text-slate-500' },
      ...(activeTab === 'templates' ? [] : [{ header: 'Recipients / replies', id: 'delivery', cell: ({ row }) => { const summary = summarizeDeliveries(api.deliveries, row.id); const count = row.recipientCount || summary.total || (row.employeeId ? 1 : resolveAudience(employees, row.audience || {}).length); return <div className="flex flex-col text-xs"><span className="font-medium text-slate-700">{summary.total ? `${summary.total} delivered` : `${count} selected`}</span><span className="text-[10px] text-slate-500">{summary.total ? `${summary.acknowledged} acknowledged · ${summary.seen} seen · ${summary.pending} pending` : ['published', 'issued', 'invitations_published'].includes(row.state) ? 'No replies yet' : 'Not sent'}</span></div> }, headerClassName: 'text-[10px] font-bold uppercase tracking-widest text-slate-500' }]),
      { header: 'Status', id: 'state', cell: ({ row }) => <div className="flex flex-col items-start gap-1"><StatePill state={row.state || row.status} />{activeTab === 'archive' && isArchivedCommunication(row) && row.state === 'published' && <span className="text-[9px] text-amber-700">Expired by date</span>}</div>, headerClassName: 'text-[10px] font-bold uppercase tracking-widest text-slate-500', align: 'center' },
    ]
  }, [activeTab, api.deliveries, employees])

  const rowActions = (row) => {
    const rowIsTemplate = row.kind === 'template'
    const isDraft = (row.state || row.status) === 'draft'
    const actions = []
    if (rowIsTemplate && canEditCommunication(row, user)) actions.push({ label: 'Edit template', icon: <Pencil size={14} />, onClick: () => openEdit(row) })
    else if (isDraft && canEditCommunication(row, user)) actions.push({ label: 'Edit draft', icon: <Pencil size={14} />, onClick: () => openEdit(row) })
    if (rowIsTemplate && canDeleteCommunication(row, user)) actions.push({ label: 'Delete template', icon: <Trash2 size={14} />, variant: 'danger', onClick: () => { setSelectedItem(row); setPendingAction('delete') } })
    else if (isDraft && canDeleteCommunication(row, user)) actions.push({ label: 'Delete draft', icon: <Trash2 size={14} />, variant: 'danger', onClick: () => { setSelectedItem(row); setPendingAction('delete') } })
    return actions
  }

  const activateTab = (next) => { setActiveTab(next.id); setSearch(''); setStatusFilter('all'); setSelectedItem(null); setPendingAction(''); setNotice(null) }
  const showActivePanel = activeTab !== 'formats'

  return <div className="module-layout-root flex h-full flex-col gap-4 pb-6 font-inter">
    <WorkspaceGuide />
    <div className="module-top-surface rounded-[12px] border border-slate-200 bg-white px-3 pt-3 shadow-sm md:px-5 md:pt-4"><p className="mb-2 px-1 text-xs font-medium text-slate-600 sm:hidden">Choose a workspace · Swipe sideways to see all sections</p><ModulePillTabs tabs={TABS} activeTabId={activeTab} onTabChange={activateTab} ariaLabel="HR Communications sections" /></div>
    {activeTab === 'letters' && <div className="rounded-[12px] border border-slate-200 bg-white px-3 pt-3 shadow-sm md:px-5 md:pt-4"><div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between"><ModulePillTabs className="min-w-0 flex-1" tabs={LEGACY_LETTER_SUBTABS} activeTabId={activeLetterCategory === 'all' ? '' : activeLetterCategory} onTabChange={(next) => setActiveLetterCategory(next.id)} ariaLabel="Letter type filters" /><button type="button" onClick={() => setActiveLetterCategory('all')} className={`mb-2 inline-flex h-8 items-center self-start rounded-lg px-3 text-[10px] font-bold uppercase tracking-wide transition md:self-auto ${activeLetterCategory === 'all' ? 'bg-slate-900 text-white' : 'bg-slate-50 text-slate-600 hover:bg-slate-100'}`}>All letters</button></div></div>}
    {activeTab === 'formats' ? <LegacyLetterFormatsWorkspace employees={employees} user={user} api={api} canManage={canManage} /> : <>
      <WorkspaceHero tab={tab} count={records.length} canCreate={canCreate} onCreate={() => openCreate()} />
      {notice && <p role={notice.tone === 'error' ? 'alert' : 'status'} className={`rounded-lg border px-4 py-3 text-sm ${notice.tone === 'error' ? 'border-rose-200 bg-rose-50 text-rose-800' : 'border-emerald-200 bg-emerald-50 text-emerald-800'}`}>{notice.message}</p>}
      <section aria-label={`${tab.label} records`} className="rounded-[12px] border border-slate-200 bg-white p-4 shadow-sm md:p-5">
        <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between"><label className="relative w-full md:max-w-sm"><span className="sr-only">Search {tab.label}</span><Eye aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={15} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder={`Search ${tab.label.toLowerCase()} by title, employee, code…`} className="h-9 w-full rounded-md border border-slate-200 bg-white pl-9 pr-3 text-sm text-slate-700 outline-none focus-visible:ring-1 focus-visible:ring-blue-600" /></label><label className="flex items-center gap-2 text-xs font-medium text-slate-600"><span className="sr-only">Filter by status</span><span aria-hidden="true">{activeTab === 'archive' ? 'History' : 'Status'}</span><select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)} className="h-9 rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-700 focus-visible:ring-1 focus-visible:ring-blue-600">{STATUS_FILTERS[activeTab].map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label></div>
        {activeTab === 'archive' && <p className="mb-3 rounded-lg bg-blue-50 px-3 py-2 text-xs leading-5 text-blue-800">History is read-only for published/issued records. Only drafts and templates can be edited or deleted; policy changes should use a new version.</p>}
        <div className="space-y-3 md:hidden" aria-label={`${tab.label} records on mobile`}>
          {api.loading ? <p role="status" className="py-6 text-center text-sm text-slate-500">Loading {tab.label.toLowerCase()}…</p> : records.length === 0 ? <div className="rounded-lg border border-dashed border-slate-200 px-4 py-8 text-center"><p className="text-sm font-semibold text-slate-800">{search || statusFilter !== 'all' ? 'No matching records' : `No ${tab.label.toLowerCase()} yet`}</p><p className="mt-1 text-xs leading-5 text-slate-500">{search || statusFilter !== 'all' ? 'Try another search or history filter.' : activeTab === 'archive' ? 'Issued, published, expired, withdrawn, and superseded items will appear here.' : canCreate ? 'Start with a private draft. An authorized approver must publish or issue it.' : 'Published items will appear here when available.'}</p>{canCreate && activeTab !== 'archive' && <button type="button" onClick={() => openCreate()} className="mt-4 inline-flex h-9 items-center justify-center gap-2 rounded-md bg-blue-600 px-4 text-sm font-bold text-white hover:bg-blue-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2"><Plus size={15} /> Create {tab.id === 'policies' ? 'SOP / Policy' : tab.id === 'templates' ? 'Template' : tab.label.slice(0, -1)}</button>}</div> : records.map((row) => {
            const summary = summarizeDeliveries(api.deliveries, row.id)
            const recipientCount = row.recipientCount || summary.total || (row.employeeId ? 1 : resolveAudience(employees, row.audience || {}).length)
            const actions = activeTab === 'archive' ? [] : rowActions(row)
            const primaryTitle = activeTab === 'letters' ? row.employeeName || row.title || row.letterType : displayTitle(row)
            const rowDate = activeTab === 'training' ? row.sessionDate : row.effectiveDate || row.publishedAt || row.updatedAt || row.createdAt
            return <article key={`${row.kind}-${row.id}`} className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0"><p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">{activeTab === 'archive' ? `${kindLabel(row.kind)} · ` : ''}{row.documentCode || row.letterType || row.category || row.type || 'HR communication'}{row.version ? ` · v${row.version}` : ''}</p><h3 className="mt-1 break-words text-sm font-semibold text-slate-900">{primaryTitle}</h3></div>
                <StatePill state={row.state || row.status} />
              </div>
              {activeTab !== 'templates' && <p className="mt-3 text-xs text-slate-600"><span className="font-medium text-slate-800">Audience:</span> {audienceLabel(row)}</p>}
              <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-600">
                <span>{activeTab === 'training' ? 'Session' : activeTab === 'policies' ? 'Effective' : 'Updated'}: {dateLabel(rowDate)}</span>
                {activeTab === 'policies' && row.reviewDate && <span>Review: {dateLabel(row.reviewDate)}</span>}
                {activeTab !== 'templates' && <span>{summary.total ? `${summary.total} delivered · ${summary.acknowledged} acknowledged · ${summary.seen} seen · ${summary.pending} pending` : `${recipientCount} recipients · ${['published', 'issued', 'invitations_published'].includes(row.state) ? 'no replies yet' : 'not sent'}`}</span>}
              </div>
              <div className="mt-4 flex flex-wrap gap-2 border-t border-slate-100 pt-3">
                <button type="button" aria-label={`View ${primaryTitle} details`} onClick={() => { setSelectedItem(row); setPendingAction('') }} className="inline-flex h-9 items-center justify-center rounded-md border border-slate-200 bg-white px-3 text-sm font-medium text-slate-700 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600">View details</button>
                {actions.map((action) => <button key={action.label} type="button" onClick={action.onClick} className={`inline-flex h-9 items-center justify-center gap-2 rounded-md border px-3 text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 ${action.variant === 'danger' ? 'border-rose-200 text-rose-700 hover:bg-rose-50' : 'border-slate-200 text-slate-700 hover:bg-slate-50'}`}>{action.icon}{action.label}</button>)}
              </div>
            </article>
          })}
        </div>
        <div className="hidden md:block"><Table data={records} columns={columns} loading={api.loading} page={1} pageSize={25} totalRows={records.length} searchable={false} pagination={false} sortable onView={(item) => { setSelectedItem(item); setPendingAction('') }} onRowClick={(item) => { setSelectedItem(item); setPendingAction('') }} rowActions={activeTab === 'archive' ? undefined : rowActions} emptyTitle={search || statusFilter !== 'all' ? 'No matching records' : `No ${tab.label.toLowerCase()} yet`} emptySubtitle={search || statusFilter !== 'all' ? 'Try a different search term or status.' : activeTab === 'archive' ? 'Issued, published, expired, and withdrawn communications will appear here.' : canCreate ? 'Start with a draft. It will stay private to HR until an approver publishes or issues it.' : 'Published items will appear here when they are available to you.'} emptyActionLabel={canCreate && !['archive', 'templates'].includes(activeTab) ? `Create ${tab.id === 'policies' ? 'SOP / Policy' : tab.label.slice(0, -1)}` : undefined} onEmptyAction={() => openCreate()} /></div>
      </section>
      <Modal isOpen={showForm} onClose={() => { if (!busy) { setShowForm(false); setEditingItem(null) } }} title={`${editingItem ? 'Edit' : 'New'} ${formTabId === 'policies' ? 'SOP / Policy' : currentFormTab.id === 'templates' ? 'Template' : currentFormTab.label.slice(0, -1)}`} size="2xl"><CommunicationForm key={`${formTabId}-${editingItem?.id || 'new'}`} tab={currentFormTab} form={form} setForm={setForm} employees={employees} onClose={() => { setShowForm(false); setEditingItem(null) }} onSave={saveDraft} saving={busy} /></Modal>
      <Modal isOpen={!!selectedItem} onClose={() => { if (!busy) { setSelectedItem(null); setPendingAction('') } }} title={`${kindLabel(currentItemKind)} details`} size="2xl"><ItemDetails item={selectedItem} kind={currentItemKind} user={user} orgId={user?.orgId} onClose={() => { setSelectedItem(null); setPendingAction('') }} onEdit={() => openEdit(selectedItem)} onRequestAction={requestAction} onCreateRevision={startRevision} canEdit={selectedCanEdit} canDelete={selectedCanDelete} canRequestApproval={selectedCanRequestApproval} canApprove={canApprove} canCreate={canCreate} busy={busy} deliveries={api.deliveries} employees={employees} pendingAction={pendingAction} onConfirm={runConfirmedAction} onCancelConfirm={() => setPendingAction('')} /></Modal>
    </>}
    {api.loading && showActivePanel && <div className="fixed inset-0 z-[100] flex items-center justify-center bg-white/40 backdrop-blur-[1px]" aria-label="Loading HR communications"><Spinner /></div>}
  </div>
}
