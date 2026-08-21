// HRFlow visual system: white rounded-[12px] panels, gray-100 borders, indigo controls, emerald draft action, and readable Inter table/form typography.
import { useMemo, useState } from 'react'
import { AlertTriangle, Award, BadgeInfo, CalendarDays, Download, FileText, Printer, Search, UserMinus } from 'lucide-react'
import { COMMUNICATION_KINDS } from '../../../lib/communications'

const FORMATS = [
  { id: 'promotion', label: 'Promotion', icon: Award },
  { id: 'bonafide', label: 'Bonafide', icon: BadgeInfo },
  { id: 'notice', label: 'Notice Period', icon: AlertTriangle },
  { id: 'termination', label: 'Termination', icon: UserMinus },
]

const isoToday = () => new Date().toISOString().slice(0, 10)
const formatDate = (value) => {
  if (!value) return '—'
  const date = new Date(`${value}T00:00:00`)
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' })
}
const currentDesignation = (employee) => employee?.designation || employee?.jobTitle || employee?.position || employee?.roleName || 'Not recorded'

function letterContent(format, employee, orgName, variables) {
  const department = employee?.department || 'assigned'
  const currentRole = variables.currentDesignation?.trim() || currentDesignation(employee)
  const promotedRole = variables.promotedDesignation?.trim() || 'the promoted designation'
  const effectiveFrom = formatDate(variables.effectiveFrom)
  const templates = {
    promotion: {
      subject: 'Promotion Directive',
      body: `We are extremely pleased to formally communicate your promotion from ${currentRole} to ${promotedRole}, effective from ${effectiveFrom}. This decision comes as a direct result of your exemplary performance, dedication, and the significant impact you have made on the ${department} department. We look forward to your continued success in this new capacity.`,
    },
    bonafide: {
      subject: 'Bonafide Certificate',
      body: `This is to formally certify that Mr./Ms. ${employee?.name || ''} is a bonafide permanent employee of ${orgName}. They have been associated with the organization as a ${department} professional since their commencement on ${employee?.joinedDate || 'the original joining date'}. Their conduct during this tenure has been satisfactory.`,
    },
    notice: {
      subject: 'Notice Period Directive',
      body: 'This document serves as an official communication regarding your resignation/termination notice period. As per the established organizational policy, you are required to serve the stipulated notice duration. Please coordinate with the HR department for the formal handover process and exit formalities.',
    },
    termination: {
      subject: 'Termination Directive',
      body: 'We regret to inform you that your employment agreement with the organization is being terminated effective immediately. This decision has been reached following a comprehensive review of performance/conduct parameters. You are requested to return all company assets and complete the clearance process by the end of the business day.',
    },
  }
  return templates[format] || templates.promotion
}

function LetterPreview({ format, employee, orgName, variables }) {
  const content = letterContent(format, employee, orgName, variables)
  return <div id="legacy-letter-preview" className="mx-auto min-h-[842px] max-w-3xl rounded-sm border border-gray-100 bg-white p-8 font-serif leading-relaxed text-gray-800 shadow-2xl md:p-16">
    <div className="mb-12 h-2 -mx-8 -mt-8 bg-indigo-600 md:-mx-16 md:-mt-16" />
    <div className="mb-16 flex items-start justify-between gap-4 font-inter"><div><h2 className="text-2xl font-black uppercase tracking-tighter text-gray-900">{orgName}</h2><p className="mt-1 text-[10px] font-bold uppercase tracking-widest text-indigo-500">Human Resources Division</p></div><div className="text-right text-[10px] font-bold uppercase tracking-widest text-gray-400"><p>Confidential</p><p>Ref: HR/{format.toUpperCase()}/{employee?.empCode || 'DRAFT'}</p></div></div>
    <p className="mb-12 font-bold text-gray-900">Dated: {formatDate(variables.documentDate)}</p>
    <div className="mb-12 space-y-1"><p className="mb-2 font-inter text-[10px] font-black uppercase tracking-widest text-gray-400">Recipient</p><p className="text-lg font-bold uppercase leading-none text-gray-900">{employee?.name}</p><p className="font-medium text-gray-600">{employee?.department || 'Department not recorded'} Department</p><p className="font-medium text-gray-600">Employee Code: {employee?.empCode || '—'}</p></div>
    <h3 className="mb-12 text-center font-inter text-sm font-black uppercase tracking-widest text-gray-900 underline decoration-2 decoration-indigo-500 underline-offset-8">Subject: {content.subject}</h3>
    <div className="space-y-6 text-[15px] text-justify text-gray-700"><p>{content.body}</p><p>We extend our best wishes for your future professional endeavors and appreciate the time dedicated to the organization.</p></div>
    <div className="mt-24 border-t border-gray-50 pt-8 font-inter"><p className="font-black uppercase tracking-widest text-gray-900">For {orgName},</p><div className="h-20" /><p className="inline-block border-b-2 border-gray-900 font-bold uppercase text-gray-900">Authorized HR Signatory</p><p className="mt-4 text-[10px] font-bold uppercase italic text-gray-400">This document is digitally authenticated and system-generated.</p></div>
  </div>
}

function DocumentControls({ format, employee, variables, onChange }) {
  const isPromotion = format === 'promotion'
  return <aside className="rounded-[12px] border border-gray-100 bg-white p-4 shadow-sm lg:sticky lg:top-4 lg:self-start"><div className="flex items-start gap-3"><div className="rounded-lg bg-indigo-50 p-2 text-indigo-600"><CalendarDays size={16} /></div><div><p className="text-[10px] font-bold uppercase tracking-widest text-indigo-600">Document controls</p><h3 className="mt-1 text-[15px] font-semibold text-slate-900">Letter details</h3><p className="mt-1 text-[11px] leading-4 text-slate-500">These approved fields update the preview live. The letter wording remains fixed.</p></div></div>
    <div className="mt-5 space-y-4"><label className="block"><span className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Document date / issue date</span><input type="date" value={variables.documentDate} onChange={(event) => onChange('documentDate', event.target.value)} className="mt-1 h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-[13px] font-medium text-slate-800 outline-none focus:border-indigo-400" /></label>
      {isPromotion && <><div className="border-t border-slate-100 pt-4"><p className="text-[10px] font-bold uppercase tracking-widest text-indigo-600">Promotion details</p><p className="mt-1 text-[11px] text-slate-500">Current designation is prefilled from the employee record where available; both designation fields are controlled inputs, not editable letter wording.</p></div><label className="block"><span className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Effective from</span><input type="date" value={variables.effectiveFrom} onChange={(event) => onChange('effectiveFrom', event.target.value)} className="mt-1 h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-[13px] font-medium text-slate-800 outline-none focus:border-indigo-400" /></label><label className="block"><span className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Current designation</span><input value={variables.currentDesignation} onChange={(event) => onChange('currentDesignation', event.target.value)} placeholder="e.g. Project Engineer" className="mt-1 h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-[13px] font-medium text-slate-800 outline-none focus:border-indigo-400" /></label><label className="block"><span className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Promoted designation</span><input value={variables.promotedDesignation} onChange={(event) => onChange('promotedDesignation', event.target.value)} placeholder="e.g. Senior Project Engineer" className="mt-1 h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-[13px] font-medium text-slate-800 outline-none focus:border-indigo-400" /></label></>}
    </div></aside>
}

export default function LegacyLetterFormatsWorkspace({ employees, user, api, canManage }) {
  const [activeFormat, setActiveFormat] = useState('promotion')
  const [selectedEmployeeId, setSelectedEmployeeId] = useState('')
  const [showPreview, setShowPreview] = useState(false)
  const [saving, setSaving] = useState(false)
  const [formatDraftId, setFormatDraftId] = useState(null)
  const [variables, setVariables] = useState({ documentDate: isoToday(), effectiveFrom: isoToday(), currentDesignation: '', promotedDesignation: '' })
  const selectedEmployee = useMemo(() => employees.find((employee) => employee.id === selectedEmployeeId), [employees, selectedEmployeeId])
  const active = FORMATS.find((format) => format.id === activeFormat) || FORMATS[0]
  const orgName = user?.orgName || 'HRFlow Organisation'
  const content = letterContent(activeFormat, selectedEmployee, orgName, variables)
  const updateVariable = (field, value) => setVariables((current) => ({ ...current, [field]: value }))

  const formatDraftPayload = () => ({
    letterType: active.label,
    title: active.label,
    employeeId: selectedEmployee.id,
    employeeName: selectedEmployee.name,
    body: `${content.subject}\n\n${content.body}`,
    documentDate: variables.documentDate,
    effectiveDate: variables.effectiveFrom || variables.documentDate,
    previousDesignation: activeFormat === 'promotion' ? (variables.currentDesignation.trim() || currentDesignation(selectedEmployee)) : null,
    promotedDesignation: activeFormat === 'promotion' ? variables.promotedDesignation.trim() : null,
    version: 1,
    source: 'legacy_format_generator',
    formatId: active.id,
  })

  const persistFormatDraft = async (eventType) => {
    const payload = formatDraftPayload()
    if (formatDraftId) {
      await api.updateRecord(COMMUNICATION_KINDS.LETTER, formatDraftId, payload, eventType)
      return formatDraftId
    }
    const draftId = await api.createRecord(COMMUNICATION_KINDS.LETTER, payload, eventType)
    setFormatDraftId(draftId)
    return draftId
  }

  const generate = async () => {
    if (!selectedEmployee) return
    if (activeFormat === 'promotion' && (!variables.currentDesignation.trim() || !variables.promotedDesignation.trim())) { alert('Enter both the current designation and promoted designation before generating the Promotion letter.'); return }
    setSaving(true)
    try {
      await persistFormatDraft('letter_format_generated')
      setShowPreview(true)
    } catch (error) { alert(error?.message || 'Unable to save the generated letter draft.') } finally { setSaving(false) }
  }
  const printLetter = () => window.print()
  const saveDraft = async () => {
    if (!selectedEmployee || !canManage) return
    setSaving(true)
    try {
      await persistFormatDraft('letter_format_draft_saved')
      alert('The generated HR letter draft and its audit record have been saved to the Letters workspace.')
    } catch (error) { alert(error?.message || 'Unable to save this format as a draft.') } finally { setSaving(false) }
  }

  return <div className="space-y-4 font-inter"><div className="rounded-[12px] border border-gray-100 bg-white p-5 shadow-sm md:p-6"><p className="text-[10px] font-bold uppercase tracking-widest text-indigo-600">Legacy HR letter generator</p><h2 className="mt-1 text-[22px] font-semibold tracking-[-0.03em] text-slate-950">Letter Formats</h2><p className="mt-2 max-w-3xl text-[12px] leading-5 text-slate-500">Use the original employee letter formats for Promotion, Bonafide, Notice Period, and Termination. Document controls update approved fields only; the formal wording cannot be edited.</p></div>
    <div className="rounded-[12px] border border-gray-100 bg-white p-4 shadow-sm md:p-5"><div className="flex flex-wrap gap-2">{FORMATS.map((format) => { const Icon = format.icon; const selected = activeFormat === format.id; return <button key={format.id} type="button" onClick={() => { setActiveFormat(format.id); setFormatDraftId(null); setShowPreview(false) }} className={`inline-flex h-9 items-center gap-2 rounded-lg px-3 text-[11px] font-semibold transition ${selected ? 'bg-slate-900 text-white' : 'border border-slate-200 bg-white text-slate-600 hover:bg-slate-50'}`}><Icon size={14} />{format.label}</button> })}</div>
      <div className="mt-5 flex flex-col gap-3 border-t border-slate-100 pt-5 md:flex-row md:items-end"><label className="block w-full md:max-w-lg"><span className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Employee</span><div className="relative mt-1"><Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={15} /><select value={selectedEmployeeId} onChange={(event) => { const employee = employees.find((item) => item.id === event.target.value); setSelectedEmployeeId(event.target.value); setFormatDraftId(null); setVariables((current) => ({ ...current, currentDesignation: currentDesignation(employee) === 'Not recorded' ? '' : currentDesignation(employee) })); setShowPreview(false) }} className="h-11 w-full rounded-lg border border-slate-200 bg-white pl-9 pr-3 text-[13px] font-medium text-slate-800 outline-none focus:border-indigo-400"><option value="">Select employee</option>{employees.map((employee) => <option key={employee.id} value={employee.id}>{employee.name} {employee.empCode ? `(${employee.empCode})` : ''}</option>)}</select></div></label><button type="button" onClick={generate} disabled={!selectedEmployeeId || saving} className="inline-flex h-11 items-center justify-center gap-2 rounded-lg bg-indigo-600 px-5 text-[11px] font-bold uppercase tracking-wide text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"><FileText size={16} /> {saving ? 'Saving…' : 'Generate & save draft'}</button></div>
    </div>
    {showPreview && selectedEmployee && <div className="space-y-4"><div className="flex flex-wrap justify-center gap-2"><button type="button" onClick={printLetter} className="inline-flex h-10 items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 text-[11px] font-semibold text-slate-700 hover:bg-slate-50"><Printer size={15} /> Print</button><button type="button" onClick={printLetter} className="inline-flex h-10 items-center gap-2 rounded-lg bg-indigo-50 px-4 text-[11px] font-semibold text-indigo-700 hover:bg-indigo-100"><Download size={15} /> Save as PDF</button>{canManage && <button type="button" disabled={saving} onClick={saveDraft} className="inline-flex h-10 items-center gap-2 rounded-lg bg-emerald-600 px-4 text-[11px] font-semibold text-white hover:bg-emerald-700 disabled:opacity-50">{saving ? 'Saving…' : 'Save as HR draft'}</button>}</div><div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_320px]"><div className="min-w-0 pb-10"><LetterPreview format={activeFormat} employee={selectedEmployee} orgName={orgName} variables={variables} /></div><DocumentControls format={activeFormat} employee={selectedEmployee} variables={variables} onChange={updateVariable} /></div></div>}
  </div>
}
