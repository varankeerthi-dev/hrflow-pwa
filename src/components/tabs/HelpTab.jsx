// Design philosophy: the Help tab is a field manual inside the product — a clear module index on the left and an explainable operational guide on the right.

import React, { useMemo, useState } from 'react'
import {
  ArrowDownRight,
  ArrowRight,
  BookOpen,
  CheckCircle2,
  ChevronDown,
  Clock3,
  Compass,
  FileText,
  Filter,
  HardHat,
  HelpCircle,
  Info,
  Search,
  ShieldCheck,
} from 'lucide-react'
import attendancePolicyDocument from '../../../PRD-attendance-full-day-late-penalty-grace.md?raw'

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

const HELP_MODULES = [
  { id: 'attendance-policy', label: 'Attendance Policy', note: 'Full Day, grace, permissions', icon: Clock3 },
  { id: 'quick-help', label: 'Quick Help', note: 'Questions & instructions', icon: HelpCircle },
  { id: 'attendance', label: 'Attendance & Check-In', note: 'Portal check-in guidance', icon: CheckCircle2, faqModule: 'Attendance' },
  { id: 'leave', label: 'Leave & Permission', note: 'Requests and approvals', icon: FileText, faqModule: 'Leave' },
  { id: 'tasks', label: 'Tasks', note: 'Boards and checklists', icon: BookOpen, faqModule: 'Tasks' },
  { id: 'salary', label: 'Salary Slip', note: 'Monthly document access', icon: FileText, faqModule: 'Salary' },
  { id: 'settings', label: 'Settings & Access', note: 'Approvals, sites, roles', icon: ShieldCheck, faqModule: 'Settings' },
]

const POLICY_SCENARIOS = [
  {
    tag: 'Within grace',
    title: '08:10 arrival on an 08:00 site shift',
    summary: 'The employee completes the required day and uses 10 of the 15 arrival-grace minutes.',
    result: 'Full Day — Within Grace',
    detail: 'No chargeable late minutes. If a required safety briefing was missed, that is recorded separately as a safety review, not silently converted into a payroll deduction.',
    tone: 'teal',
  },
  {
    tag: 'Late, but still full day',
    title: '08:30 arrival and 17:00 departure',
    summary: 'The employee arrives after grace but still works enough net minutes for Full Day.',
    result: 'Full Day — Late',
    detail: 'Raw late minutes are 30. With 15 minutes of grace, chargeable late minutes are 15. Any consequence depends on the active policy and incident history; Full Day does not disappear automatically.',
    tone: 'orange',
  },
  {
    tag: 'Approved permission',
    title: 'A 60-minute early departure',
    summary: 'The employee requests early departure before leaving and the supervisor approves the exact interval.',
    result: 'Full Day — Approved Permission',
    detail: 'The approved interval reduces required presence only according to the active policy. The employee sees the projected outcome before submitting; an unapproved early departure becomes Pending Review first.',
    tone: 'navy',
  },
  {
    tag: 'Alternate site',
    title: 'Site A to Site B during the shift',
    summary: 'A project manager records a valid alternate-site assignment for the same schedule instance.',
    result: 'Full Day — Alternate Site',
    detail: 'Approved travel or alternate-site work counts once, against the correct project and location. It prevents a false late flag at Site A and leaves an auditable route through the day.',
    tone: 'teal',
  },
]

function FieldLabel({ children }) {
  return <span className="text-[10px] font-black uppercase tracking-[0.16em] text-[#e56a3d]">{children}</span>
}

function GuideSectionNumber({ children }) {
  return <span className="border-t-2 border-[#e56a3d] pt-1.5 text-[11px] font-black tracking-[0.14em] text-[#e56a3d]">{children}</span>
}

function AttendancePolicyGuide() {
  const [openScenario, setOpenScenario] = useState(0)
  const [query, setQuery] = useState('')
  const filteredScenarios = useMemo(() => {
    const value = query.trim().toLowerCase()
    if (!value) return POLICY_SCENARIOS
    return POLICY_SCENARIOS.filter(item => `${item.tag} ${item.title} ${item.summary} ${item.detail}`.toLowerCase().includes(value))
  }, [query])

  return (
    <div className="overflow-hidden rounded-2xl border border-[#d8d0c3] bg-[#f4f0e8] text-[#263238] shadow-sm">
      <div className="border-b border-[#cfc6b8] px-5 py-6 sm:px-8">
        <div className="grid items-center gap-7 xl:grid-cols-[minmax(0,1fr)_minmax(260px,.78fr)]">
          <div>
            <div className="mb-5 flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.16em] text-[#e56a3d]"><span className="inline-block h-0.5 w-7 bg-[#e56a3d]" /> Employee field guide <span className="text-[#9e9587]">/</span> Attendance</div>
            <h2 className="max-w-2xl text-4xl font-black leading-[.96] tracking-[-0.07em] text-[#112a3a] sm:text-5xl">Know what counts<br /><em className="not-italic text-[#e56a3d]">before the day starts.</em></h2>
            <p className="mt-5 max-w-xl text-sm leading-7 text-[#526066]">A practical guide to Full Day rules, grace periods, permissions, early departure, and the site situations that make attendance more than a clock-in.</p>
            <div className="mt-6 flex flex-wrap items-center gap-4">
              <button onClick={() => document.getElementById('help-policy-baseline')?.scrollIntoView({ behavior: 'smooth', block: 'start' })} className="inline-flex h-10 items-center gap-2 rounded-md bg-[#e56a3d] px-4 text-xs font-black text-white shadow-sm transition hover:bg-[#ca5630] active:scale-[.98]">Read the baseline <ArrowDownRight size={16} /></button>
              <button onClick={() => document.getElementById('help-policy-scenarios')?.scrollIntoView({ behavior: 'smooth', block: 'start' })} className="inline-flex items-center gap-2 text-xs font-black text-[#112a3a] transition hover:text-[#e56a3d]">See site scenarios <ArrowRight size={15} /></button>
            </div>
            <div className="mt-7 flex flex-wrap gap-4 text-[11px] font-semibold text-[#6d7778]"><span className="inline-flex items-center gap-1.5"><FileText size={13} /> Plain-language policy</span><span className="inline-flex items-center gap-1.5"><HardHat size={13} /> Built for field + office</span></div>
          </div>
          <div className="relative border border-[#bfb6a8] bg-[#e7e0d4] p-3 before:absolute before:left-0 before:top-0 before:h-14 before:w-14 before:border-l-2 before:border-t-2 before:border-[#e56a3d]">
            <div className="mb-2 text-right text-[9px] font-black tracking-[0.14em] text-[#7f817c]">A-04 / DAILY CONTROL</div>
            <div className="flex min-h-[160px] items-center justify-center bg-[linear-gradient(rgba(17,42,58,.05)_1px,transparent_1px),linear-gradient(90deg,rgba(17,42,58,.05)_1px,transparent_1px)] bg-[size:20px_20px] p-6">
              <div className="grid w-full max-w-[220px] grid-cols-3 gap-2 text-[#112a3a]">
                <div className="col-span-2 h-20 border border-[#2e7c78]/50 bg-[#f4f0e8]/80 p-2"><span className="block h-1 w-9 bg-[#e56a3d]" /><span className="mt-3 block h-1 w-16 bg-[#112a3a]/20" /><span className="mt-2 block h-1 w-12 bg-[#112a3a]/20" /></div>
                <div className="h-20 border border-[#112a3a]/30 bg-[#f4f0e8]/70 p-2"><Clock3 size={22} className="text-[#e56a3d]" /></div>
                <div className="col-span-3 flex items-center gap-2 border border-[#112a3a]/25 bg-[#f4f0e8]/80 p-2"><span className="h-3 w-3 rounded-full bg-[#e56a3d]" /><span className="h-1.5 flex-1 bg-[#112a3a]/20" /><ArrowRight size={14} className="text-[#2e7c78]" /></div>
              </div>
            </div>
            <div className="mt-2 flex gap-2 text-[10px] text-[#6d7778]"><span className="font-black text-[#e56a3d]">01</span> Every rule starts with the schedule instance.</div>
          </div>
        </div>
      </div>

      <div className="grid border-b border-[#cfc6b8] sm:grid-cols-3">
        {[['01', 'Schedule first', 'Site, shift, timezone, assignment.'], ['02', 'Explain the math', 'Worked time, grace, late minutes.'], ['03', 'Approve the exception', 'Permission is not a correction.']].map(([number, title, note]) => <div key={number} className="grid grid-cols-[26px_1fr] gap-2 border-b border-[#cfc6b8] p-4 last:border-0 sm:border-b-0 sm:border-r sm:last:border-r-0"><span className="text-[10px] font-black text-[#e56a3d]">{number}</span><div><strong className="block text-xs font-black text-[#112a3a]">{title}</strong><span className="text-[10px] text-[#6d7778]">{note}</span></div></div>)}
      </div>

      <section id="help-policy-baseline" className="scroll-mt-4 px-5 py-8 sm:px-8">
        <div className="mb-5 grid items-end gap-4 md:grid-cols-[34px_minmax(0,1fr)_minmax(200px,.7fr)]"><GuideSectionNumber>01</GuideSectionNumber><div><FieldLabel>The daily baseline</FieldLabel><h3 className="mt-1 text-3xl font-black leading-none tracking-[-0.06em] text-[#112a3a]">One day. One clear answer.</h3></div><p className="text-xs leading-5 text-[#687274]">Attendance is measured against the schedule that actually applies to you—not just a generic shift name.</p></div>
        <div className="grid gap-2 lg:grid-cols-[1.2fr_1fr_1fr]">
          <article className="flex min-h-[220px] flex-col bg-[#112a3a] p-5 text-[#f4f0e8]"><div className="flex items-center justify-between gap-2"><span className="bg-[#e56a3d] px-2 py-1 text-[9px] font-black uppercase tracking-widest text-white">Full Day</span><span className="text-[9px] font-bold tracking-widest text-white/45">FD / 75%+</span></div><h4 className="mt-8 text-xl font-black leading-tight tracking-[-0.04em]">Meet the required net minutes.</h4><p className="mt-2 text-xs leading-5 text-white/70">Full Day is based on the effective schedule, approved breaks, and any approved permission that changes the required presence. Being late does not automatically erase a Full Day.</p><div className="mt-auto border-t border-white/20 pt-4"><span className="block text-[10px] text-white/50">Typical site example</span><strong className="block text-lg font-black">08:00 → 17:00</strong></div></article>
          <article className="min-h-[220px] border border-[#cfc6b8] bg-[#faf7f0]/75 p-5"><div className="flex items-center justify-between gap-2"><span className="bg-[#2e7c78] px-2 py-1 text-[9px] font-black uppercase tracking-widest text-white">Half Day</span><span className="text-[9px] font-bold tracking-widest text-[#8b8a82]">HD / 50%+</span></div><h4 className="mt-8 text-xl font-black leading-tight tracking-[-0.04em] text-[#112a3a]">Enough to count, not enough to complete.</h4><p className="mt-2 text-xs leading-5 text-[#687274]">Half Day applies when worked minutes meet the half-day threshold but remain below Full Day. An approved permission can change the requirement only when the policy says it can.</p></article>
          <article className="min-h-[220px] border border-[#cfc6b8] bg-[#e9e3d7] p-5"><div className="flex items-center justify-between gap-2"><span className="bg-[#112a3a]/10 px-2 py-1 text-[9px] font-black uppercase tracking-widest text-[#112a3a]">Pending Review</span><span className="text-[9px] font-bold tracking-widest text-[#8b8a82]">CHECK / 00</span></div><h4 className="mt-8 text-xl font-black leading-tight tracking-[-0.04em] text-[#112a3a]">Missing information is not absence.</h4><p className="mt-2 text-xs leading-5 text-[#687274]">Missing punch, conflicting schedule, site closure, or device failure goes to review first. It does not silently become a penalty.</p></article>
        </div>
        <div className="mt-2 flex items-start gap-3 border-l-[3px] border-[#e56a3d] bg-[#112a3a] p-4 text-[#f4f0e8]"><Info size={17} className="mt-0.5 shrink-0" /><div><strong className="block text-xs font-black">The rule in one line</strong><span className="text-xs leading-5 text-white/70">First resolve the workday. Then calculate lateness. Then apply grace. Only after that can a consequence exist.</span></div></div>
      </section>

      <section className="grid gap-5 border-t border-[#cfc6b8] px-5 py-8 sm:px-8 lg:grid-cols-[.75fr_1.25fr]">
        <div><GuideSectionNumber>02</GuideSectionNumber><div className="mt-5"><FieldLabel>Grace & late arrival</FieldLabel><h3 className="mt-1 text-3xl font-black leading-none tracking-[-0.06em] text-[#112a3a]">Grace is a buffer,<br /><em className="not-italic text-[#e56a3d]">not a mystery.</em></h3><p className="mt-4 text-xs leading-5 text-[#687274]">The system keeps raw late minutes and chargeable late minutes separate so the calculation is explainable.</p><div className="mt-5 border border-[#cfc6b8] bg-[#faf7f0]/75 p-4"><span className="block text-[9px] font-black uppercase tracking-widest text-[#8b8a82]">The simple calculation</span><code className="mt-2 block text-sm font-black text-[#112a3a]">chargeable late = raw late − grace</code><span className="mt-1 block text-[10px] text-[#e56a3d]">Never less than zero.</span></div></div></div>
        <div className="bg-[#e5ddd0] p-5"><div className="flex justify-between gap-2 text-[10px] font-black uppercase tracking-widest text-[#112a3a]"><span>08:00 site shift</span><span>15 min arrival grace</span></div><div className="py-9"><div className="mb-2 flex justify-between text-[9px] font-bold text-[#7c817d]"><span>07:45</span><span>08:00</span><span>08:15</span><span>08:30</span></div><div className="flex h-4 border border-[#112a3a]/25"><span className="w-1/4 bg-[#2e7c78]/40" /><span className="w-1/4 bg-[#2e7c78]" /><span className="flex-1 bg-[#e56a3d]" /></div><div className="mt-3 flex flex-wrap gap-3 text-[10px] text-[#5e6a6c]"><span>● Early / on time</span><span className="text-[#2e7c78]">● Within grace</span><span className="text-[#e56a3d]">● Chargeable late</span></div></div><div className="grid grid-cols-3 border-t border-[#112a3a]/15 pt-3">{[['08:10', 'Within grace', '0 chargeable'], ['08:20', 'Late arrival', '5 chargeable'], ['08:30', 'Late arrival', '15 chargeable']].map(([time, label, value]) => <div key={time} className="grid gap-1 border-r border-[#112a3a]/15 pl-2 first:pl-0 last:border-r-0"><strong className="text-lg font-black text-[#112a3a]">{time}</strong><span className="text-[10px] text-[#687274]">{label}</span><b className="text-[10px] text-[#e56a3d]">{value}</b></div>)}</div></div>
      </section>

      <section className="border-t border-[#cfc6b8] px-5 py-8 sm:px-8"><div className="mb-5 grid items-end gap-4 md:grid-cols-[34px_minmax(0,1fr)_minmax(200px,.7fr)]"><GuideSectionNumber>03</GuideSectionNumber><div><FieldLabel>Permissions & early leave</FieldLabel><h3 className="mt-1 text-3xl font-black leading-none tracking-[-0.06em] text-[#112a3a]">Ask before the clock<br /><em className="not-italic text-[#e56a3d]">becomes a question.</em></h3></div><p className="text-xs leading-5 text-[#687274]">A permission is a planned, approved time segment. It is not a hidden attendance edit.</p></div><div className="grid gap-5 lg:grid-cols-[.9fr_1.1fr]"><div className="flex min-h-[205px] items-center justify-center border border-[#cfc6b8] bg-[#e5ddd0] p-5"><div className="w-full max-w-sm"><div className="mb-4 flex items-end gap-2 border-b-2 border-[#112a3a] pb-2"><div className="h-12 flex-1 bg-[#112a3a]/10" /><div className="h-16 w-16 border border-[#e56a3d] bg-[#f4f0e8] p-2"><Clock3 size={32} className="text-[#e56a3d]" /></div><div className="h-10 w-16 bg-[#2e7c78]/35" /></div><div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-[#112a3a]"><span className="h-2 w-2 rounded-full bg-[#e56a3d]" /> Approved interval <ArrowRight size={13} className="text-[#2e7c78]" /> adjusted day</div></div></div><div className="border-t border-[#112a3a]">{[['01', 'Request the interval', 'Choose late arrival, mid-shift absence, early departure, alternate site, travel, or emergency.'], ['02', 'Show the impact', 'The request previews whether your adjusted presence still projects as Full Day or Half Day.'], ['03', 'Get the right approval', 'Supervisor for the crew; project manager for critical activity; HR for over-limit or repeated requests.'], ['04', 'Leave a clean trail', 'Approved minutes, reason, approver, project, and schedule instance stay connected to the day.']].map(([number, title, text]) => <div key={number} className="grid grid-cols-[30px_1fr] gap-2 border-b border-[#cfc6b8] py-3"><span className="text-[10px] font-black text-[#e56a3d]">{number}</span><div><strong className="block text-xs font-black text-[#112a3a]">{title}</strong><p className="mt-1 text-[11px] leading-5 text-[#687274]">{text}</p></div></div>)}</div></div><div className="mt-2 flex items-start gap-3 border-l-[3px] border-[#e56a3d] bg-[#e56a3d]/10 p-4 text-[#864026]"><Clock3 size={17} className="mt-0.5 shrink-0" /><div><strong className="block text-xs font-black">Early departure is its own calculation</strong><span className="text-xs leading-5 text-[#864026]/75">An approved early departure suppresses only the approved interval. It does not automatically guarantee Full Day.</span></div></div></section>

      <section id="help-policy-scenarios" className="scroll-mt-4 border-t border-[#cfc6b8] px-5 py-8 sm:px-8"><div className="mb-5 grid items-end gap-4 md:grid-cols-[34px_minmax(0,1fr)_200px]"><GuideSectionNumber>04</GuideSectionNumber><div><FieldLabel>MEP site scenarios</FieldLabel><h3 className="mt-1 text-3xl font-black leading-none tracking-[-0.06em] text-[#112a3a]">When the plan meets<br /><em className="not-italic text-[#e56a3d]">the actual site.</em></h3></div><label className="flex h-9 items-center gap-2 border-b border-[#112a3a] text-[#7b817d]"><Search size={14} /><input value={query} onChange={event => setQuery(event.target.value)} placeholder="Search scenarios" className="min-w-0 flex-1 bg-transparent text-xs text-[#112a3a] outline-none" /></label></div><div className="border-t border-[#112a3a]">{filteredScenarios.map((scenario, index) => <article key={scenario.title} className="border-b border-[#cfc6b8]"><button onClick={() => setOpenScenario(openScenario === index ? -1 : index)} className="grid w-full grid-cols-[30px_1fr_18px] items-center gap-3 py-4 text-left" aria-expanded={openScenario === index}><span className="text-[10px] font-black text-[#8b8a82]">0{index + 1}</span><span><span className={`block text-[9px] font-black uppercase tracking-widest ${scenario.tone === 'teal' ? 'text-[#2e7c78]' : 'text-[#e56a3d]'}`}>{scenario.tag}</span><strong className="mt-1 block text-sm font-black text-[#112a3a]">{scenario.title}</strong><small className="mt-1 block text-[11px] leading-5 text-[#687274]">{scenario.summary}</small></span><ChevronDown size={16} className={`text-[#112a3a] transition-transform ${openScenario === index ? 'rotate-180' : ''}`} /></button>{openScenario === index && <div className="grid gap-3 pb-4 pl-[42px] sm:grid-cols-[150px_1fr]"><div><span className="block text-[9px] font-black uppercase tracking-widest text-[#8b8a82]">Result</span><strong className="mt-1 block text-xs font-black text-[#112a3a]">{scenario.result}</strong></div><p className="m-0 text-xs leading-5 text-[#687274]">{scenario.detail}</p></div>}</article>)}{filteredScenarios.length === 0 && <div className="flex items-center gap-2 py-6 text-xs text-[#687274]"><Search size={15} /> No scenario matches that search.</div>}</div><div className="mt-4 flex items-start gap-2 text-[11px] leading-5 text-[#687274]"><HardHat size={14} className="mt-0.5 shrink-0 text-[#e56a3d]" /> Operational note: a missed safety briefing is reviewed as a safety event—not automatically treated as a payroll deduction.</div></section>

      <details className="border-t border-[#cfc6b8] px-5 py-5 sm:px-8"><summary className="cursor-pointer list-none text-xs font-black text-[#112a3a]">Open the complete policy document</summary><pre className="mt-4 max-h-[520px] overflow-auto whitespace-pre-wrap break-words border border-[#cfc6b8] bg-[#faf7f0] p-4 text-[11px] leading-6 text-[#526066]">{attendancePolicyDocument}</pre></details>
    </div>
  )
}

function FaqModuleView({ module }) {
  const [searchText, setSearchText] = useState('')
  const [typeFilter, setTypeFilter] = useState('all')
  const filteredItems = useMemo(() => {
    const q = searchText.trim().toLowerCase()
    return FAQ_ITEMS.filter(item => {
      const moduleMatch = !module?.faqModule || item.module === module.faqModule
      const typeMatch = typeFilter === 'all' || item.type === typeFilter
      const searchMatch = !q || `${item.question} ${item.answer} ${item.module}`.toLowerCase().includes(q)
      return moduleMatch && typeMatch && searchMatch
    })
  }, [module, searchText, typeFilter])

  return <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm sm:p-6"><div className="mb-5 flex flex-col gap-2"><p className="text-[11px] font-black uppercase tracking-[0.14em] text-indigo-500">{module?.label || 'Quick Help'}</p><h2 className="text-2xl font-black tracking-tight text-gray-900">Questions & Instructions</h2><p className="text-sm text-gray-500">Search the guidance that applies to this module.</p></div><div className="mb-5 grid grid-cols-1 gap-3 lg:grid-cols-[1fr_auto]"><div className="relative"><Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" /><input value={searchText} onChange={event => setSearchText(event.target.value)} placeholder="Search by keyword, module, or question..." className="h-11 w-full rounded-xl border border-gray-200 bg-white pl-10 pr-3 text-sm outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-200" /></div><div className="flex items-center gap-2 rounded-xl border border-gray-200 bg-gray-50 px-2 py-1">{TYPE_FILTERS.map(filter => <button key={filter.id} type="button" onClick={() => setTypeFilter(filter.id)} className={`h-9 rounded-lg px-3 text-[11px] font-black uppercase tracking-widest transition ${typeFilter === filter.id ? 'bg-indigo-600 text-white shadow-sm shadow-indigo-200' : 'text-gray-500 hover:bg-white'}`}>{filter.label}</button>)}</div></div><p className="mb-4 text-xs font-semibold text-gray-500">Showing <span className="text-gray-900">{filteredItems.length}</span> results</p>{filteredItems.length === 0 ? <div className="rounded-xl border border-dashed border-gray-300 bg-gray-50 py-14 text-center"><HelpCircle size={28} className="mx-auto mb-2 text-gray-300" /><p className="text-sm font-semibold text-gray-500">No help matched your filters.</p></div> : <div className="space-y-3">{filteredItems.map(item => <article key={item.id} className="rounded-xl border border-gray-200 bg-white p-4 transition-colors hover:border-indigo-200"><div className="mb-2 flex flex-wrap items-center gap-2"><span className="inline-flex h-6 items-center rounded-full bg-indigo-50 px-2.5 text-[10px] font-black uppercase tracking-widest text-indigo-700">{item.module}</span><span className="inline-flex h-6 items-center rounded-full bg-gray-100 px-2.5 text-[10px] font-black uppercase tracking-widest text-gray-600">{item.type === 'instruction' ? 'Instruction' : 'Question'}</span></div><h3 className="flex items-start gap-2 text-[15px] font-bold text-gray-900"><BookOpen size={15} className="mt-0.5 shrink-0 text-indigo-500" /><span>{item.question}</span></h3><p className="mt-2 text-[13px] leading-relaxed text-gray-600">{item.answer}</p></article>)}</div>}</div>
}

export default function HelpTab() {
  const [activeModuleId, setActiveModuleId] = useState('attendance-policy')
  const activeModule = HELP_MODULES.find(module => module.id === activeModuleId) || HELP_MODULES[0]

  return <div className="mx-auto max-w-[1500px] animate-in fade-in slide-in-from-bottom-3 duration-300"><div className="mb-4 flex items-end justify-between gap-4"><div><p className="text-[11px] font-normal uppercase tracking-[0.14em] text-indigo-500">Help Center</p><h1 className="mt-1 text-2xl font-normal tracking-tight text-gray-900">Help & module guide</h1><p className="mt-1 text-sm text-gray-500">Select a module on the left to view its guidance on the right.</p></div><div className="hidden items-center gap-2 rounded-full border border-gray-200 bg-white px-3 py-1.5 text-[10px] font-normal uppercase tracking-widest text-gray-500 md:flex"><Compass size={14} className="text-indigo-500" /> Two-pane reference</div></div><div className="grid min-h-[720px] grid-cols-1 gap-4 xl:grid-cols-[235px_minmax(0,1fr)]"><aside className="rounded-lg border border-gray-200 bg-gray-50/70 p-2 xl:sticky xl:top-4 xl:h-fit"><div className="mb-3 flex items-center gap-2 px-2 text-[11px] font-normal uppercase tracking-[0.14em] text-gray-500"><Compass size={14} className="text-indigo-500" /> Modules</div><nav className="flex gap-1 overflow-x-auto xl:block xl:space-y-0.5">{HELP_MODULES.map(module => { const Icon = module.icon; const active = module.id === activeModuleId; return <button key={module.id} type="button" onClick={() => setActiveModuleId(module.id)} className={`group flex min-w-[180px] items-center gap-3 rounded-md px-3 py-2.5 text-left transition-colors xl:w-full ${active ? 'bg-indigo-50 text-indigo-800' : 'text-gray-600 hover:bg-white hover:text-gray-800'}`}><span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-md ${active ? 'bg-transparent text-indigo-600' : 'bg-transparent text-gray-400 group-hover:text-indigo-500'}`}><Icon size={16} /></span><span className="min-w-0"><strong className="block truncate text-[12px] font-normal">{module.label}</strong><small className={`mt-0.5 block truncate text-[10px] font-normal ${active ? 'text-indigo-700/70' : 'text-gray-400'}`}>{module.note}</small></span></button> })}</nav><div className="mt-4 hidden border-t border-gray-200 px-2 pt-4 text-[11px] font-normal leading-5 text-gray-400 xl:block">Attendance Policy opens the full Employee Field Guide. The other modules keep the existing quick-help content.</div></aside><main className="min-w-0">{activeModuleId === 'attendance-policy' ? <AttendancePolicyGuide /> : <FaqModuleView module={activeModule} />}</main></div></div>
}
