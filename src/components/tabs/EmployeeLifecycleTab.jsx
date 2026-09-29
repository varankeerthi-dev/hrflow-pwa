import React, { useMemo, useState } from 'react'
import { ArrowRight, BriefcaseBusiness, Check, CheckCircle2, Circle, ClipboardCheck, DoorOpen, UserPlus, Users } from 'lucide-react'
import { useAuth } from '../../hooks/useAuth'
import { useEmployees } from '../../hooks/useEmployees'
import { useRecruitment } from '../../hooks/useRecruitment'
import { useEmployeeLifecycle } from '../../hooks/useEmployeeLifecycle'
import { getChecklistProgress, validateExitDate } from '../../lib/employeeLifecycle'
import Spinner from '../ui/Spinner'
import Modal from '../ui/Modal'

const inputClass = 'h-9 w-full rounded-md border border-slate-200 bg-white px-3 py-1 text-sm text-slate-800 placeholder:text-slate-400 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-blue-600'
const labelClass = 'mb-1.5 block text-sm font-medium text-slate-800 font-body'
const primaryClass = 'inline-flex h-9 items-center justify-center gap-2 rounded-md bg-blue-600 px-4 text-sm font-bold text-white shadow-sm transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50 font-heading'
const secondaryClass = 'inline-flex h-9 items-center justify-center gap-2 rounded-md border border-slate-200 bg-white px-3 text-sm font-medium text-slate-700 transition hover:bg-slate-50 disabled:opacity-50'
const todayInput = () => new Date().toLocaleDateString('en-CA')

export default function EmployeeLifecycleTab() {
  const { user } = useAuth()
  const { employees, loading: employeesLoading, fetchEmployees } = useEmployees(user?.orgId)
  const lifecycle = useEmployeeLifecycle(user, employees)
  const recruitment = useRecruitment(user?.orgId, user)
  const [activeType, setActiveType] = useState('onboarding')
  const [showOffboarding, setShowOffboarding] = useState(false)
  const [selectedEmployeeId, setSelectedEmployeeId] = useState('')
  const [offboardingForm, setOffboardingForm] = useState({ lastWorkingDate: todayInput(), reason: 'Resignation' })
  const [completionRecord, setCompletionRecord] = useState(null)
  const [onboardingForm, setOnboardingForm] = useState({ empCode: '', joinedDate: todayInput(), employmentType: 'Full-time', department: '', designation: '', personalEmail: '', workEmail: '', phone: '' })
  const [actionError, setActionError] = useState('')
  const [notice, setNotice] = useState('')

  const onboardingRecords = lifecycle.records.filter((record) => record.type === 'onboarding')
  const offboardingRecords = lifecycle.records.filter((record) => record.type === 'offboarding')
  const hiredCandidates = useMemo(() => {
    const alreadyStarted = new Set(onboardingRecords.map((record) => record.sourceCandidateId).filter(Boolean))
    return recruitment.applicants.filter((applicant) => applicant.status === 'Hired' && !alreadyStarted.has(applicant.id))
  }, [recruitment.applicants, onboardingRecords])
  const activeEmployees = employees.filter((employee) => (employee.status || 'Active').toLowerCase() !== 'inactive')
  const visibleRecords = activeType === 'onboarding' ? onboardingRecords : offboardingRecords
  const canStartFromRecruitment = user?.role?.toLowerCase() === 'admin' || ['view', 'create', 'edit', 'full'].some((key) => user?.permissions?.Recruitment?.[key])

  const handleStartOnboarding = async (candidate) => {
    setActionError('')
    setNotice('')
    try {
      await lifecycle.startOnboarding(candidate)
      setNotice(`Onboarding started for ${candidate.name}.`)
    } catch (error) {
      setActionError(error.message || 'Could not start onboarding.')
    }
  }

  const handleStartOffboarding = async (event) => {
    event.preventDefault()
    setActionError('')
    const employee = employees.find((item) => item.id === selectedEmployeeId)
    if (!employee) { setActionError('Choose an employee first.'); return }
    const dateError = validateExitDate(offboardingForm.lastWorkingDate)
    if (dateError && !dateError.startsWith('Complete offboarding')) { setActionError(dateError); return }
    try {
      await lifecycle.startOffboarding(employee, offboardingForm)
      setShowOffboarding(false)
      setSelectedEmployeeId('')
      setNotice(`Offboarding checklist started for ${employee.name}.`)
    } catch (error) {
      setActionError(error.message || 'Could not start offboarding.')
    }
  }

  const handleCompleteOnboarding = async (event) => {
    event.preventDefault()
    if (!completionRecord) return
    setActionError('')
    try {
      await lifecycle.completeOnboarding(completionRecord.id, onboardingForm, fetchEmployees)
      setCompletionRecord(null)
      setNotice(`Employee record created for ${completionRecord.candidateName}.`)
      setOnboardingForm({ empCode: '', joinedDate: todayInput(), employmentType: 'Full-time', department: '', designation: '', personalEmail: '', workEmail: '', phone: '' })
    } catch (error) {
      setActionError(error.message || 'Could not create the employee record.')
    }
  }

  const handleFinalizeOffboarding = async (record) => {
    setActionError('')
    try {
      await lifecycle.completeOffboarding(record.id)
      await fetchEmployees()
      setNotice(`${record.employeeName} is now marked inactive. Existing sign-in access is not changed by this workflow.`)
    } catch (error) {
      setActionError(error.message || 'Could not complete offboarding.')
    }
  }

  if (!lifecycle.canView) {
    return <div className="rounded-xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-900" role="status">You need employee workspace view permission to use lifecycle workflows.</div>
  }

  return (
    <div className="space-y-5 px-4 pb-6" aria-busy={lifecycle.loading || lifecycle.saving}>
      <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-2xs md:p-5">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <h2 className="font-heading text-lg font-bold text-slate-900">Employee lifecycle</h2>
            <p className="mt-1 max-w-2xl text-sm leading-5 text-slate-600">Carry a hire from offer acceptance into the employee directory, and coordinate an exit without silently skipping clearance steps.</p>
          </div>
          {lifecycle.canManage && <button type="button" onClick={() => { setActionError(''); setShowOffboarding(true) }} className={secondaryClass}><DoorOpen size={15} /> Start offboarding</button>}
        </div>
        <div className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Metric label="Hired candidates" value={hiredCandidates.length} icon={<BriefcaseBusiness size={16} />} />
          <Metric label="Onboarding in progress" value={onboardingRecords.filter((item) => item.status !== 'Completed').length} icon={<UserPlus size={16} />} />
          <Metric label="Exit workflows" value={offboardingRecords.filter((item) => item.status !== 'Completed').length} icon={<DoorOpen size={16} />} />
          <Metric label="Employee records" value={employees.length} icon={<Users size={16} />} />
        </div>
      </section>

      {(actionError || lifecycle.error) && <div role="alert" className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">{actionError || lifecycle.error}</div>}
      {notice && <div role="status" className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">{notice}<button type="button" className="ml-3 font-semibold underline" onClick={() => setNotice('')}>Dismiss</button></div>}

      <div className="grid gap-5 xl:grid-cols-[minmax(280px,0.82fr)_minmax(0,1.5fr)]">
        {activeType === 'onboarding' && canStartFromRecruitment && lifecycle.canManage && (
          <section className="rounded-xl border border-slate-200 bg-white p-4 md:p-5">
            <div className="mb-3 flex items-start gap-3"><span className="rounded-lg bg-blue-50 p-2 text-blue-700"><UserPlus size={17} /></span><div><h3 className="font-heading text-sm font-bold text-slate-900">Ready for onboarding</h3><p className="mt-1 text-xs leading-5 text-slate-500">Candidates marked Hired in Recruitment appear here. Starting a checklist does not create an employee record.</p></div></div>
            {recruitment.loading ? <div className="flex justify-center py-5"><Spinner /></div> : hiredCandidates.length === 0 ? <div className="rounded-lg border border-dashed border-slate-200 bg-slate-50 px-4 py-6 text-center text-xs leading-5 text-slate-500">No hired candidates are waiting. Mark a candidate Hired in Recruitment first.</div> : <ul className="divide-y divide-slate-100">{hiredCandidates.map((candidate) => <li key={candidate.id} className="flex flex-col gap-3 py-3 sm:flex-row sm:items-center sm:justify-between"><div className="min-w-0"><p className="truncate text-sm font-semibold text-slate-900">{candidate.name}</p><p className="mt-0.5 truncate text-xs text-slate-500">{candidate.email || 'No email'}{candidate.phone ? ` · ${candidate.phone}` : ''}</p></div><button type="button" disabled={lifecycle.saving} onClick={() => handleStartOnboarding(candidate)} className={primaryClass}>Start checklist <ArrowRight size={14} /></button></li>)}</ul>}
          </section>
        )}

        <section className={`rounded-xl border border-slate-200 bg-white p-4 md:p-5 ${activeType === 'offboarding' ? 'xl:col-span-2' : ''}`}>
          <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div><h3 className="font-heading text-sm font-bold text-slate-900">Lifecycle workflows</h3><p className="mt-1 text-xs text-slate-500">Track owners, progress, and what remains before a handoff is complete.</p></div>
            <div role="tablist" aria-label="Lifecycle workflow type" className="inline-flex rounded-lg border border-slate-200 bg-slate-50 p-1">
              {[['onboarding', 'Onboarding'], ['offboarding', 'Offboarding']].map(([id, label]) => <button key={id} type="button" role="tab" aria-selected={activeType === id} onClick={() => { setActiveType(id); setActionError('') }} className={`h-8 rounded-md px-3 text-xs font-semibold ${activeType === id ? 'bg-white text-blue-700 shadow-sm' : 'text-slate-500 hover:text-slate-800'}`}>{label}</button>)}
            </div>
          </div>
          {lifecycle.loading || employeesLoading ? <div className="flex justify-center py-10"><Spinner /></div> : visibleRecords.length === 0 ? <div className="rounded-lg border border-dashed border-slate-200 bg-slate-50 px-4 py-10 text-center"><ClipboardCheck className="mx-auto mb-2 text-slate-400" size={23} /><p className="text-sm font-semibold text-slate-800">No {activeType} workflows yet</p><p className="mx-auto mt-1 max-w-md text-xs leading-5 text-slate-500">{activeType === 'onboarding' ? 'Start from a hired candidate when you are ready to coordinate pre-boarding.' : 'Start an exit checklist from an active employee when a last working date is confirmed.'}</p></div> : <div className="space-y-3">{visibleRecords.map((record) => <WorkflowCard key={record.id} record={record} canManage={lifecycle.canManage} saving={lifecycle.saving} onChecklist={(itemId, value) => lifecycle.updateChecklistItem(record.id, itemId, value).catch((error) => setActionError(error.message))} onComplete={() => { setActionError(''); if (record.type === 'onboarding') { setCompletionRecord(record); setOnboardingForm((current) => ({ ...current, personalEmail: record.candidateEmail || '', phone: record.candidatePhone || '' })) } else handleFinalizeOffboarding(record) }} />)}</div>}
        </section>
      </div>

      <div className="rounded-lg border border-amber-200 bg-amber-50/70 px-4 py-3 text-xs leading-5 text-amber-900"><strong>Scope note:</strong> Final-pay and statutory review is a manual checklist sign-off only; this workflow does not calculate settlement, generate statutory filings, or deactivate employee sign-in access. Complete those actions through the responsible payroll and IT processes.</div>

      <Modal isOpen={showOffboarding} onClose={() => setShowOffboarding(false)} title="Start employee offboarding" size="md">
        <form onSubmit={handleStartOffboarding} className="space-y-4 bg-white p-5 sm:p-6">
          <div><label className={labelClass} htmlFor="offboard-employee">Employee <span className="text-rose-500">*</span></label><select id="offboard-employee" required value={selectedEmployeeId} onChange={(event) => setSelectedEmployeeId(event.target.value)} className={inputClass}><option value="">Choose an active employee…</option>{activeEmployees.map((employee) => <option key={employee.id} value={employee.id}>{employee.name}{employee.empCode ? ` · ${employee.empCode}` : ''}</option>)}</select></div>
          <div className="grid gap-4 sm:grid-cols-2"><div><label className={labelClass} htmlFor="last-working-date">Last working date <span className="text-rose-500">*</span></label><input id="last-working-date" required type="date" value={offboardingForm.lastWorkingDate} onChange={(event) => setOffboardingForm({ ...offboardingForm, lastWorkingDate: event.target.value })} className={inputClass} /></div><div><label className={labelClass} htmlFor="exit-reason">Reason category</label><select id="exit-reason" value={offboardingForm.reason} onChange={(event) => setOffboardingForm({ ...offboardingForm, reason: event.target.value })} className={inputClass}><option>Resignation</option><option>Contract end</option><option>Retirement</option><option>Other</option></select></div></div>
          <p className="text-xs leading-5 text-slate-500">An exit checklist will be created. The employee remains active until every checklist step is complete and the effective date has arrived.</p>
          <div className="flex justify-end gap-2 border-t border-slate-100 pt-4"><button type="button" onClick={() => setShowOffboarding(false)} className={secondaryClass}>Cancel</button><button type="submit" disabled={lifecycle.saving || !lifecycle.canManage} className={primaryClass}>{lifecycle.saving ? 'Starting…' : 'Create exit checklist'}</button></div>
        </form>
      </Modal>

      <Modal isOpen={Boolean(completionRecord)} onClose={() => setCompletionRecord(null)} title="Create employee record" size="lg">
        <form onSubmit={handleCompleteOnboarding} className="space-y-4 bg-white p-5 sm:p-6">
          <div className="rounded-lg border border-blue-100 bg-blue-50 px-3 py-2.5 text-sm text-blue-900">This creates an active employee record for <strong>{completionRecord?.candidateName}</strong> only after all onboarding steps are complete and the actual start date is today or earlier.</div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div><label className={labelClass} htmlFor="onboard-emp-code">Employee code</label><input id="onboard-emp-code" value={onboardingForm.empCode} onChange={(event) => setOnboardingForm({ ...onboardingForm, empCode: event.target.value.trimStart() })} className={inputClass} placeholder="Optional; must be unique" /></div>
            <div><label className={labelClass} htmlFor="onboard-join-date">Actual joining date <span className="text-rose-500">*</span></label><input id="onboard-join-date" required type="date" value={onboardingForm.joinedDate} onChange={(event) => setOnboardingForm({ ...onboardingForm, joinedDate: event.target.value })} className={inputClass} /></div>
            <div><label className={labelClass} htmlFor="onboard-designation">Designation</label><input id="onboard-designation" value={onboardingForm.designation} onChange={(event) => setOnboardingForm({ ...onboardingForm, designation: event.target.value })} className={inputClass} /></div>
            <div><label className={labelClass} htmlFor="onboard-department">Department</label><input id="onboard-department" value={onboardingForm.department} onChange={(event) => setOnboardingForm({ ...onboardingForm, department: event.target.value })} className={inputClass} /></div>
            <div><label className={labelClass} htmlFor="onboard-type">Employment type</label><select id="onboard-type" value={onboardingForm.employmentType} onChange={(event) => setOnboardingForm({ ...onboardingForm, employmentType: event.target.value })} className={inputClass}><option>Full-time</option><option>Part-time</option><option>Contract</option><option>Internship</option></select></div>
            <div><label className={labelClass} htmlFor="onboard-phone">Phone</label><input id="onboard-phone" type="tel" value={onboardingForm.phone} onChange={(event) => setOnboardingForm({ ...onboardingForm, phone: event.target.value })} className={inputClass} /></div>
            <div><label className={labelClass} htmlFor="onboard-personal-email">Personal email</label><input id="onboard-personal-email" type="email" value={onboardingForm.personalEmail} onChange={(event) => setOnboardingForm({ ...onboardingForm, personalEmail: event.target.value })} className={inputClass} /></div>
            <div><label className={labelClass} htmlFor="onboard-work-email">Work email</label><input id="onboard-work-email" type="email" value={onboardingForm.workEmail} onChange={(event) => setOnboardingForm({ ...onboardingForm, workEmail: event.target.value })} className={inputClass} /></div>
          </div>
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs leading-5 text-slate-600">Login access is not automatically created; use the existing employee account workflow when the work account is ready. Salary, bank, tax, and statutory fields are intentionally not inferred from a recruitment record.</div>
          <div className="flex justify-end gap-2 border-t border-slate-100 pt-4"><button type="button" onClick={() => setCompletionRecord(null)} className={secondaryClass}>Cancel</button><button type="submit" disabled={lifecycle.saving || !lifecycle.canManage} className={primaryClass}>{lifecycle.saving ? 'Creating…' : 'Create employee record'}</button></div>
        </form>
      </Modal>
    </div>
  )
}

function WorkflowCard({ record, canManage, saving, onChecklist, onComplete }) {
  const progress = getChecklistProgress(record.checklist)
  const isDone = record.status === 'Completed'
  const canFinishOffboarding = record.type !== 'offboarding' || !validateExitDate(record.lastWorkingDate)
  const statusText = isDone ? 'Completed' : 'In progress'
  return (
    <article className="rounded-lg border border-slate-200 bg-white p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><h4 className="text-sm font-semibold text-slate-900">{record.candidateName || record.employeeName}</h4><span className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold ${isDone ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-amber-200 bg-amber-50 text-amber-800'}`}>{statusText}</span></div><p className="mt-1 text-xs text-slate-500">{record.type === 'onboarding' ? `Onboarding${record.candidateEmail ? ` · ${record.candidateEmail}` : ''}` : `Last working date: ${record.lastWorkingDate} · ${record.reason || 'Other'}`}</p></div>
        <div className="flex items-center gap-2 text-xs font-medium text-slate-600"><span>{progress.completed}/{progress.total} steps</span><span className="h-1.5 w-20 overflow-hidden rounded-full bg-slate-100"><span className="block h-full bg-blue-600 transition-all" style={{ width: `${progress.percent}%` }} /></span></div>
      </div>
      <ul className="mt-4 space-y-2 border-t border-slate-100 pt-3">{(record.checklist || []).map((item) => <li key={item.id} className="flex items-start gap-2.5 text-xs leading-5"><button type="button" disabled={!canManage || isDone || saving} onClick={() => onChecklist(item.id, !item.completed)} aria-label={`${item.completed ? 'Reopen' : 'Complete'}: ${item.title}`} aria-pressed={Boolean(item.completed)} className="mt-0.5 shrink-0 rounded-full text-blue-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 disabled:cursor-default disabled:opacity-80">{item.completed ? <CheckCircle2 size={16} /> : <Circle size={16} />}</button><span className={item.completed ? 'text-slate-500 line-through' : 'text-slate-700'}>{item.title}{item.completed && item.completedBy && <span className="ml-1 text-[10px] text-slate-400">· {item.completedBy}</span>}</span></li>)}</ul>
      {!isDone && canManage && <div className="mt-4 flex flex-col gap-2 border-t border-slate-100 pt-3 sm:flex-row sm:items-center sm:justify-between"><p className="text-[11px] leading-4 text-slate-500">{progress.isComplete ? (record.type === 'onboarding' ? 'All steps done. Add employment details to create the employee record.' : (canFinishOffboarding ? 'All steps done and the effective date has arrived; finishing marks the employee inactive.' : 'All steps are complete. Finish on or after the last working date.')) : 'Finish each step before completing this workflow.'}</p><button type="button" disabled={!progress.isComplete || !canFinishOffboarding || saving} onClick={onComplete} className={primaryClass}>{record.type === 'onboarding' ? 'Create employee record' : 'Finish offboarding'} <Check size={14} /></button></div>}
      {isDone && record.type === 'onboarding' && record.employeeId && <p className="mt-3 border-t border-slate-100 pt-3 text-xs text-emerald-800">Employee record created. <span className="font-mono">{record.employeeId}</span></p>}
    </article>
  )
}

function Metric({ label, value, icon }) {
  return <div className="flex items-center gap-3 rounded-lg border border-slate-200 bg-white p-3"><span className="rounded-md bg-slate-50 p-2 text-slate-600">{icon}</span><div className="min-w-0"><p className="text-[11px] text-slate-500">{label}</p><p className="font-mono text-lg font-bold text-slate-900">{value}</p></div></div>
}
