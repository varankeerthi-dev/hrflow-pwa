import React, { useMemo, useState } from 'react'
import { AlertTriangle, Award, BadgeInfo, Download, FileText, Printer, Search, UserMinus } from 'lucide-react'
import { COMMUNICATION_KINDS } from '../../../lib/communications'

const FORMATS = [
  { id: 'promotion', label: 'Promotion', icon: Award },
  { id: 'bonafide', label: 'Bonafide', icon: BadgeInfo },
  { id: 'notice', label: 'Notice Period', icon: AlertTriangle },
  { id: 'termination', label: 'Termination', icon: UserMinus },
]

const formatDate = (date = new Date()) => date.toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' })

function letterContent(format, employee, orgName) {
  const department = employee?.department || 'assigned'
  const templates = {
    promotion: {
      subject: 'Promotion Directive',
      body: `We are extremely pleased to formally communicate your promotion within the organization. This decision comes as a direct result of your exemplary performance, dedication, and the significant impact you have made on the ${department} department. We look forward to your continued success in this new capacity.`,
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

function LetterPreview({ format, employee, orgName }) {
  const content = letterContent(format, employee, orgName)
  return <div id="legacy-letter-preview" className="mx-auto min-h-[842px] max-w-3xl rounded-sm border border-gray-100 bg-white p-8 font-serif leading-relaxed text-gray-800 shadow-2xl md:p-16">
    <div className="mb-12 h-2 -mx-8 -mt-8 bg-indigo-600 md:-mx-16 md:-mt-16" />
    <div className="mb-16 flex items-start justify-between gap-4 font-inter">
      <div><h2 className="text-2xl font-black uppercase tracking-tighter text-gray-900">{orgName}</h2><p className="mt-1 text-[10px] font-bold uppercase tracking-widest text-indigo-500">Human Resources Division</p></div>
      <div className="text-right text-[10px] font-bold uppercase tracking-widest text-gray-400"><p>Confidential</p><p>Ref: HR/{format.toUpperCase()}/{employee?.empCode || 'DRAFT'}</p></div>
    </div>
    <p className="mb-12 font-bold text-gray-900">Dated: {formatDate()}</p>
    <div className="mb-12 space-y-1"><p className="mb-2 font-inter text-[10px] font-black uppercase tracking-widest text-gray-400">Recipient</p><p className="text-lg font-bold uppercase leading-none text-gray-900">{employee?.name}</p><p className="font-medium text-gray-600">{employee?.department || 'Department not recorded'} Department</p><p className="font-medium text-gray-600">Employee Code: {employee?.empCode || '—'}</p></div>
    <h3 className="mb-12 text-center font-inter text-sm font-black uppercase tracking-widest text-gray-900 underline decoration-2 decoration-indigo-500 underline-offset-8">Subject: {content.subject}</h3>
    <div className="space-y-6 text-[15px] text-justify text-gray-700"><p>{content.body}</p><p>We extend our best wishes for your future professional endeavors and appreciate the time dedicated to the organization.</p></div>
    <div className="mt-24 border-t border-gray-50 pt-8 font-inter"><p className="font-black uppercase tracking-widest text-gray-900">For {orgName},</p><div className="h-20" /><p className="inline-block border-b-2 border-gray-900 font-bold uppercase text-gray-900">Authorized HR Signatory</p><p className="mt-4 text-[10px] font-bold uppercase italic text-gray-400">This document is digitally authenticated and system-generated.</p></div>
  </div>
}

export default function LegacyLetterFormatsWorkspace({ employees, user, api, canManage }) {
  const [activeFormat, setActiveFormat] = useState('promotion')
  const [selectedEmployeeId, setSelectedEmployeeId] = useState('')
  const [showPreview, setShowPreview] = useState(false)
  const [saving, setSaving] = useState(false)
  const selectedEmployee = useMemo(() => employees.find((employee) => employee.id === selectedEmployeeId), [employees, selectedEmployeeId])
  const active = FORMATS.find((format) => format.id === activeFormat) || FORMATS[0]
  const content = letterContent(activeFormat, selectedEmployee, user?.orgName || 'HRFlow Organisation')

  const printLetter = () => window.print()
  const saveDraft = async () => {
    if (!selectedEmployee || !canManage) return
    setSaving(true)
    try {
      await api.createRecord(COMMUNICATION_KINDS.LETTER, { letterType: active.label, title: active.label, employeeId: selectedEmployee.id, employeeName: selectedEmployee.name, body: `${content.subject}\n\n${content.body}`, effectiveDate: new Date().toISOString().slice(0, 10), version: 1, source: 'legacy_format_generator', formatId: active.id })
      alert('A controlled HR letter draft has been added to the Letters workspace.')
    } catch (error) { alert(error?.message || 'Unable to save this format as a draft.') } finally { setSaving(false) }
  }

  return <div className="space-y-4 font-inter"><div className="rounded-[12px] border border-gray-100 bg-white p-5 shadow-sm md:p-6"><p className="text-[10px] font-bold uppercase tracking-widest text-indigo-600">Legacy HR letter generator</p><h2 className="mt-1 text-[22px] font-semibold tracking-[-0.03em] text-slate-950">Letter Formats</h2><p className="mt-2 max-w-3xl text-[12px] leading-5 text-slate-500">Use the original employee letter formats for Promotion, Bonafide, Notice Period, and Termination. You can print/save the generated document or add it to the controlled Letters workflow as a draft.</p></div>
    <div className="rounded-[12px] border border-gray-100 bg-white p-4 shadow-sm md:p-5"><div className="flex flex-wrap gap-2">{FORMATS.map((format) => { const Icon = format.icon; const selected = activeFormat === format.id; return <button key={format.id} type="button" onClick={() => { setActiveFormat(format.id); setShowPreview(false) }} className={`inline-flex h-9 items-center gap-2 rounded-lg px-3 text-[11px] font-semibold transition ${selected ? 'bg-slate-900 text-white' : 'border border-slate-200 bg-white text-slate-600 hover:bg-slate-50'}`}><Icon size={14} />{format.label}</button> })}</div>
      <div className="mt-5 flex flex-col gap-3 border-t border-slate-100 pt-5 md:flex-row md:items-end"><label className="block w-full md:max-w-lg"><span className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Employee</span><div className="relative mt-1"><Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={15} /><select value={selectedEmployeeId} onChange={(event) => { setSelectedEmployeeId(event.target.value); setShowPreview(false) }} className="h-11 w-full rounded-lg border border-slate-200 bg-white pl-9 pr-3 text-[13px] font-medium text-slate-800 outline-none focus:border-indigo-400"><option value="">Select employee</option>{employees.map((employee) => <option key={employee.id} value={employee.id}>{employee.name} {employee.empCode ? `(${employee.empCode})` : ''}</option>)}</select></div></label><button type="button" onClick={() => setShowPreview(true)} disabled={!selectedEmployeeId} className="inline-flex h-11 items-center justify-center gap-2 rounded-lg bg-indigo-600 px-5 text-[11px] font-bold uppercase tracking-wide text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"><FileText size={16} /> Generate letter</button></div>
    </div>
    {showPreview && selectedEmployee && <div className="space-y-4"><div className="flex flex-wrap justify-center gap-2"><button type="button" onClick={printLetter} className="inline-flex h-10 items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 text-[11px] font-semibold text-slate-700 hover:bg-slate-50"><Printer size={15} /> Print</button><button type="button" onClick={printLetter} className="inline-flex h-10 items-center gap-2 rounded-lg bg-indigo-50 px-4 text-[11px] font-semibold text-indigo-700 hover:bg-indigo-100"><Download size={15} /> Save as PDF</button>{canManage && <button type="button" disabled={saving} onClick={saveDraft} className="inline-flex h-10 items-center gap-2 rounded-lg bg-emerald-600 px-4 text-[11px] font-semibold text-white hover:bg-emerald-700 disabled:opacity-50">{saving ? 'Saving…' : 'Save as HR draft'}</button>}</div><div className="pb-10"> <LetterPreview format={activeFormat} employee={selectedEmployee} orgName={user?.orgName || 'HRFlow Organisation'} /></div></div>}
  </div>
}
