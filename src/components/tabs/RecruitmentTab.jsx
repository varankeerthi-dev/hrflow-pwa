import React, { useMemo, useState } from 'react'
import {
  Briefcase,
  CalendarDays,
  Clock3,
  FileText,
  MapPin,
  Mail,
  Phone,
  Plus,
  Search,
  Trash2,
  Users,
  XCircle
} from 'lucide-react'
import { useAuth } from '../../hooks/useAuth'
import { useRecruitment } from '../../hooks/useRecruitment'
import Spinner from '../ui/Spinner'
import Modal from '../ui/Modal'

const STAGES = ['New', 'Screening', 'Interview', 'Offer', 'Hired', 'Rejected']
const ACTIVE_STAGES = ['New', 'Screening', 'Interview', 'Offer']
const EMPTY_JOB = {
  title: '',
  department: '',
  location: '',
  type: 'Full-time',
  description: '',
  status: 'Open'
}
const EMPTY_APPLICANT = {
  jobId: '',
  name: '',
  email: '',
  phone: '',
  resumeURL: '',
  status: 'New',
  notes: '',
  interviewAt: '',
  interviewer: '',
  interviewFeedback: ''
}

const getDate = (value) => {
  if (!value) return null
  if (typeof value?.toDate === 'function') return value.toDate()
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? null : date
}

const toDateTimeInput = (value) => {
  const date = getDate(value)
  if (!date) return ''
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000)
  return local.toISOString().slice(0, 16)
}

const formatDateTime = (value) => {
  const date = getDate(value)
  if (!date) return 'Not scheduled'
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(date)
}

const stageClass = (stage) => {
  const classes = {
    New: 'border-blue-200 bg-blue-50 text-blue-700',
    Screening: 'border-violet-200 bg-violet-50 text-violet-700',
    Interview: 'border-amber-200 bg-amber-50 text-amber-700',
    Offer: 'border-cyan-200 bg-cyan-50 text-cyan-700',
    Hired: 'border-emerald-200 bg-emerald-50 text-emerald-700',
    Rejected: 'border-rose-200 bg-rose-50 text-rose-700'
  }
  return classes[stage] || 'border-slate-200 bg-slate-50 text-slate-600'
}

const labelClass = 'mb-1.5 block text-sm font-medium text-slate-800 font-body'
const inputClass = 'h-9 w-full rounded-md border border-slate-200 bg-white px-3 py-1 text-sm text-slate-800 placeholder:text-slate-400 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-blue-600'
const primaryButtonClass = 'inline-flex h-9 items-center justify-center gap-2 rounded-md bg-blue-600 px-4 text-sm font-bold text-white shadow-sm transition hover:bg-blue-700 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50 font-heading'
const secondaryButtonClass = 'inline-flex h-9 items-center justify-center gap-2 rounded-md border border-slate-200 bg-white px-3 text-sm font-medium text-slate-700 transition hover:bg-slate-50'

export default function RecruitmentTab() {
  const { user } = useAuth()
  const {
    jobs,
    applicants,
    loading,
    error,
    addJob,
    updateJob,
    deleteJob,
    addApplicant,
    updateApplicant,
    deleteApplicant,
    canCreate,
    canEditJob,
    canDeleteJob,
    canEditApplicant,
    canDeleteApplicant
  } = useRecruitment(user?.orgId, user)

  const [activeSub, setActiveSub] = useState('jobs')
  const [searchTerm, setSearchTerm] = useState('')
  const [statusFilter, setStatusFilter] = useState('All stages')
  const [selectedJobId, setSelectedJobId] = useState('')
  const [showJobModal, setShowJobModal] = useState(false)
  const [editingJob, setEditingJob] = useState(null)
  const [showApplicantModal, setShowApplicantModal] = useState(false)
  const [editingApplicant, setEditingApplicant] = useState(null)
  const [jobForm, setJobForm] = useState(EMPTY_JOB)
  const [applicantForm, setApplicantForm] = useState(EMPTY_APPLICANT)
  const [actionError, setActionError] = useState('')

  const jobById = useMemo(() => new Map(jobs.map((job) => [job.id, job])), [jobs])
  const stageCounts = useMemo(() => STAGES.reduce((counts, stage) => {
    counts[stage] = applicants.filter((applicant) => (applicant.status || 'New') === stage).length
    return counts
  }, {}), [applicants])

  const upcomingInterviews = useMemo(() => applicants.filter((applicant) => {
    if (!applicant.interviewAt || ['Hired', 'Rejected'].includes(applicant.status)) return false
    const date = getDate(applicant.interviewAt)
    return date && date >= new Date()
  }).length, [applicants])

  const averageTimeToHire = useMemo(() => {
    const durations = applicants
      .filter((applicant) => applicant.status === 'Hired' && applicant.hiredAt && applicant.createdAt)
      .map((applicant) => {
        const createdAt = getDate(applicant.createdAt)
        const hiredAt = getDate(applicant.hiredAt)
        return createdAt && hiredAt ? Math.max(0, (hiredAt - createdAt) / 86400000) : null
      })
      .filter((days) => days !== null)
    if (!durations.length) return null
    return Math.round(durations.reduce((sum, days) => sum + days, 0) / durations.length)
  }, [applicants])

  const filteredJobs = useMemo(() => {
    const term = searchTerm.trim().toLowerCase()
    return jobs.filter((job) => !term || [job.title, job.department, job.location, job.type]
      .some((value) => String(value || '').toLowerCase().includes(term)))
  }, [jobs, searchTerm])

  const filteredApplicants = useMemo(() => {
    const term = searchTerm.trim().toLowerCase()
    return applicants.filter((applicant) => {
      const job = jobById.get(applicant.jobId)
      const matchesTerm = !term || [
        applicant.name,
        applicant.email,
        applicant.phone,
        applicant.notes,
        applicant.interviewer,
        applicant.interviewFeedback,
        job?.title,
        job?.department
      ].some((value) => String(value || '').toLowerCase().includes(term))
      const matchesStage = statusFilter === 'All stages' || (applicant.status || 'New') === statusFilter
      const matchesJob = !selectedJobId || applicant.jobId === selectedJobId
      return matchesTerm && matchesStage && matchesJob
    })
  }, [applicants, jobById, searchTerm, statusFilter, selectedJobId])

  const resetApplicantFilters = () => {
    setSearchTerm('')
    setStatusFilter('All stages')
    setSelectedJobId('')
  }

  const openJobModal = (job = null) => {
    setActionError('')
    setEditingJob(job)
    setJobForm(job ? {
      ...EMPTY_JOB,
      title: job.title || '',
      department: job.department || '',
      location: job.location || '',
      type: job.type || 'Full-time',
      description: job.description || '',
      status: job.status || 'Open'
    } : EMPTY_JOB)
    setShowJobModal(true)
  }

  const closeJobModal = () => {
    setShowJobModal(false)
    setEditingJob(null)
    setJobForm(EMPTY_JOB)
  }

  const openApplicantModal = (applicant = null, defaultJobId = '') => {
    setActionError('')
    setEditingApplicant(applicant)
    setApplicantForm(applicant ? {
      ...EMPTY_APPLICANT,
      jobId: applicant.jobId || '',
      name: applicant.name || '',
      email: applicant.email || '',
      phone: applicant.phone || '',
      resumeURL: applicant.resumeURL || '',
      status: applicant.status || 'New',
      notes: applicant.notes || '',
      interviewer: applicant.interviewer || '',
      interviewFeedback: applicant.interviewFeedback || '',
      interviewAt: toDateTimeInput(applicant.interviewAt)
    } : { ...EMPTY_APPLICANT, jobId: defaultJobId })
    setShowApplicantModal(true)
  }

  const closeApplicantModal = () => {
    setShowApplicantModal(false)
    setEditingApplicant(null)
    setApplicantForm(EMPTY_APPLICANT)
  }

  const handleJobSubmit = async (event) => {
    event.preventDefault()
    setActionError('')
    const payload = { ...jobForm, title: jobForm.title.trim() }
    try {
      if (editingJob) await updateJob(editingJob.id, payload)
      else await addJob(payload)
      closeJobModal()
    } catch (saveError) {
      setActionError(saveError.message || 'Could not save this job opening.')
    }
  }

  const handleApplicantSubmit = async (event) => {
    event.preventDefault()
    setActionError('')
    const { interviewAt, ...formValues } = applicantForm
    const payload = {
      ...formValues,
      name: formValues.name.trim(),
      email: formValues.email.trim(),
      interviewAt: interviewAt ? new Date(interviewAt).toISOString() : ''
    }
    try {
      if (editingApplicant) await updateApplicant(editingApplicant.id, payload)
      else await addApplicant(payload)
      closeApplicantModal()
    } catch (saveError) {
      setActionError(saveError.message || 'Could not save this applicant.')
    }
  }

  const handleStageChange = async (applicant, status) => {
    setActionError('')
    try {
      await updateApplicant(applicant.id, { status })
    } catch (saveError) {
      setActionError(saveError.message || 'Could not update the application stage.')
    }
  }

  const handleJobDelete = async (job) => {
    const linkedCount = applicants.filter((applicant) => applicant.jobId === job.id).length
    const warning = linkedCount
      ? ` ${linkedCount} application${linkedCount === 1 ? '' : 's'} will remain in the pipeline but will no longer have a linked role.`
      : ''
    if (!window.confirm(`Delete the “${job.title}” role?${warning}`)) return
    setActionError('')
    try {
      await deleteJob(job.id)
      if (selectedJobId === job.id) setSelectedJobId('')
    } catch (deleteError) {
      setActionError(deleteError.message || 'Could not delete this job opening.')
    }
  }

  const handleApplicantDelete = async (applicant) => {
    if (!window.confirm(`Delete the application from ${applicant.name}? This cannot be undone.`)) return
    setActionError('')
    try {
      await deleteApplicant(applicant.id)
    } catch (deleteError) {
      setActionError(deleteError.message || 'Could not delete this applicant.')
    }
  }

  const showApplicationsForJob = (jobId) => {
    setActiveSub('applicants')
    setSearchTerm('')
    setStatusFilter('All stages')
    setSelectedJobId(jobId)
  }

  if (loading) return <div className="flex h-full items-center justify-center py-20"><Spinner /></div>

  const openJobs = jobs.filter((job) => job.status === 'Open').length
  const activeApplicants = applicants.filter((applicant) => ACTIVE_STAGES.includes(applicant.status || 'New')).length

  return (
    <div className="space-y-5 font-body text-slate-800 animate-in fade-in duration-300">
      {(error || actionError) && (
        <div role="alert" className="flex items-start justify-between gap-3 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          <span>{actionError || error}</span>
          {actionError && <button type="button" onClick={() => setActionError('')} aria-label="Dismiss error"><XCircle size={16} /></button>}
        </div>
      )}

      <section aria-label="Recruitment summary" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <MetricCard label="Open roles" value={openJobs} icon={<Briefcase size={18} />} detail={`${jobs.length} total openings`} />
        <MetricCard label="Active candidates" value={activeApplicants} icon={<Users size={18} />} detail={`${applicants.length} applications`} />
        <MetricCard label="Upcoming interviews" value={upcomingInterviews} icon={<CalendarDays size={18} />} detail="Scheduled in this pipeline" />
        <MetricCard label="Avg. time to hire" value={averageTimeToHire === null ? '—' : `${averageTimeToHire}d`} icon={<Clock3 size={18} />} detail={averageTimeToHire === null ? 'Recorded for new hires' : 'From application to hire'} />
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-2xs" aria-label="Candidate pipeline stages">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="font-heading text-sm font-bold text-slate-900">Candidate pipeline</h2>
            <p className="mt-0.5 text-xs text-slate-500">Select a stage to review or move candidates through the hiring process.</p>
          </div>
          {activeSub === 'applicants' && (statusFilter !== 'All stages' || selectedJobId) && (
            <button type="button" onClick={resetApplicantFilters} className="text-xs font-semibold text-blue-700 hover:underline">Clear filters</button>
          )}
        </div>
        <div className="flex gap-2 overflow-x-auto pb-1">
          {STAGES.map((stage) => (
            <button
              type="button"
              key={stage}
              onClick={() => {
                setActiveSub('applicants')
                setStatusFilter(statusFilter === stage ? 'All stages' : stage)
              }}
              aria-pressed={activeSub === 'applicants' && statusFilter === stage}
              className={`min-w-[100px] flex-1 rounded-lg border px-3 py-2 text-left transition ${activeSub === 'applicants' && statusFilter === stage ? 'border-blue-300 bg-blue-50 ring-1 ring-blue-200' : 'border-slate-200 bg-white hover:bg-slate-50'}`}
            >
              <span className="block text-xs font-semibold text-slate-600">{stage}</span>
              <span className="mt-1 block font-mono text-lg font-bold text-slate-900">{stageCounts[stage]}</span>
            </button>
          ))}
        </div>
      </section>

      <div className="flex flex-col justify-between gap-3 md:flex-row md:items-center">
        <div className="inline-flex w-fit rounded-lg border border-slate-200 bg-slate-50 p-1">
          <button
            type="button"
            onClick={() => { setActiveSub('jobs'); resetApplicantFilters(); }}
            aria-pressed={activeSub === 'jobs'}
            className={`inline-flex h-9 items-center gap-2 rounded-md px-4 text-sm font-semibold transition ${activeSub === 'jobs' ? 'bg-white text-blue-700 shadow-sm' : 'text-slate-500 hover:text-slate-800'}`}
          ><Briefcase size={16} /> Job openings</button>
          <button
            type="button"
            onClick={() => setActiveSub('applicants')}
            aria-pressed={activeSub === 'applicants'}
            className={`inline-flex h-9 items-center gap-2 rounded-md px-4 text-sm font-semibold transition ${activeSub === 'applicants' ? 'bg-white text-blue-700 shadow-sm' : 'text-slate-500 hover:text-slate-800'}`}
          ><Users size={16} /> Applicants</button>
        </div>

        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <div className="relative min-w-0 sm:w-56">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
            <input
              type="search"
              aria-label={activeSub === 'jobs' ? 'Search jobs' : 'Search applicants'}
              placeholder={activeSub === 'jobs' ? 'Search jobs…' : 'Search applicants, roles…'}
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
              className={`${inputClass} pl-9`}
            />
          </div>
          {activeSub === 'applicants' && (
            <>
              <select aria-label="Filter by job" value={selectedJobId} onChange={(event) => setSelectedJobId(event.target.value)} className={`${inputClass} sm:w-48`}>
                <option value="">All roles</option>
                {jobs.map((job) => <option key={job.id} value={job.id}>{job.title}</option>)}
              </select>
              <select aria-label="Filter by stage" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)} className={`${inputClass} sm:w-40`}>
                <option>All stages</option>
                {STAGES.map((stage) => <option key={stage}>{stage}</option>)}
              </select>
            </>
          )}
          {canCreate && (
            <button type="button" onClick={() => activeSub === 'jobs' ? openJobModal() : openApplicantModal(null, selectedJobId)} className={`${primaryButtonClass} whitespace-nowrap`}>
              <Plus size={16} /> {activeSub === 'jobs' ? 'Post a role' : 'Add applicant'}
            </button>
          )}
        </div>
      </div>

      {activeSub === 'jobs' ? (
        <section aria-label="Job openings" className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {filteredJobs.length === 0 ? (
            <EmptyState icon={<Briefcase size={22} />} title="No job openings found" detail={searchTerm ? 'Try a different search.' : 'Post your first role to start building the candidate pipeline.'} />
          ) : filteredJobs.map((job) => {
            const linkedApplicants = applicants.filter((applicant) => applicant.jobId === job.id)
            return (
              <article key={job.id} className="rounded-xl border border-slate-200 bg-white p-4 shadow-2xs transition hover:border-slate-300 hover:shadow-sm">
                <div className="flex items-start justify-between gap-3">
                  <span className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold ${job.status === 'Open' ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-slate-200 bg-slate-50 text-slate-600'}`}>{job.status || 'Open'}</span>
                  <div className="flex gap-1">
                    {canEditJob(job) && <button type="button" onClick={() => openJobModal(job)} aria-label={`Edit ${job.title}`} className="rounded-md p-2 text-slate-500 hover:bg-blue-50 hover:text-blue-700">Edit</button>}
                    {canDeleteJob(job) && <button type="button" onClick={() => handleJobDelete(job)} aria-label={`Delete ${job.title}`} className="rounded-md p-2 text-slate-500 hover:bg-rose-50 hover:text-rose-700"><Trash2 size={16} /></button>}
                  </div>
                </div>
                <h3 className="mt-3 font-heading text-base font-bold text-slate-900">{job.title}</h3>
                <p className="mt-1 text-xs font-semibold text-blue-700">{job.department || 'Unassigned department'}</p>
                <div className="mt-4 space-y-2 text-xs text-slate-600">
                  <p className="flex items-center gap-2"><MapPin size={14} className="text-slate-400" />{job.location || 'Location not specified'}</p>
                  <p className="flex items-center gap-2"><Briefcase size={14} className="text-slate-400" />{job.type || 'Employment type not specified'}</p>
                </div>
                {job.description && <p className="mt-3 line-clamp-2 text-xs leading-5 text-slate-500">{job.description}</p>}
                <div className="mt-4 flex items-center justify-between border-t border-slate-100 pt-3">
                  <span className="text-xs text-slate-500"><strong className="font-mono text-slate-900">{linkedApplicants.length}</strong> application{linkedApplicants.length === 1 ? '' : 's'}</span>
                  <button type="button" onClick={() => showApplicationsForJob(job.id)} className="text-xs font-semibold text-blue-700 hover:underline">View applications</button>
                </div>
              </article>
            )
          })}
        </section>
      ) : (
        <section aria-label="Applicant pipeline" className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-2xs">
          {selectedJobId && (
            <div className="flex items-center justify-between gap-3 border-b border-blue-100 bg-blue-50/70 px-4 py-2.5 text-xs text-blue-900">
              <span>Showing applications for <strong>{jobById.get(selectedJobId)?.title || 'Selected role'}</strong></span>
              <button type="button" onClick={() => setSelectedJobId('')} className="inline-flex items-center gap-1 font-semibold hover:underline"><XCircle size={14} /> Clear role</button>
            </div>
          )}
          <div className="overflow-x-auto">
            <table className="w-full min-w-[920px] border-collapse text-left">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-[11px] uppercase tracking-wider text-slate-500">
                  <th className="px-4 py-3 font-bold">Candidate</th>
                  <th className="px-4 py-3 font-bold">Role</th>
                  <th className="px-4 py-3 font-bold">Stage</th>
                  <th className="px-4 py-3 font-bold">Interview</th>
                  <th className="px-4 py-3 font-bold">Feedback / notes</th>
                  <th className="px-4 py-3 text-right font-bold">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredApplicants.length === 0 ? (
                  <tr><td colSpan={6} className="px-4 py-14"><EmptyState icon={<Users size={22} />} title="No applications found" detail={applicants.length ? 'Adjust the role, stage, or search filters.' : 'Applications added to a role will appear here.'} /></td></tr>
                ) : filteredApplicants.map((applicant) => {
                  const job = jobById.get(applicant.jobId)
                  const canEdit = canEditApplicant(applicant)
                  return (
                    <tr key={applicant.id} className="align-top transition hover:bg-blue-50/30">
                      <td className="px-4 py-4">
                        <p className="text-sm font-semibold text-slate-900">{applicant.name || 'Unnamed candidate'}</p>
                        <a href={`mailto:${applicant.email}`} className="mt-1 flex items-center gap-1.5 text-xs text-slate-500 hover:text-blue-700"><Mail size={12} />{applicant.email}</a>
                        {applicant.phone && <p className="mt-1 flex items-center gap-1.5 text-xs text-slate-500"><Phone size={12} />{applicant.phone}</p>}
                      </td>
                      <td className="px-4 py-4">
                        <p className="text-sm font-medium text-slate-800">{job?.title || 'Role unavailable'}</p>
                        <p className="mt-1 text-xs text-slate-500">{job?.department || '—'}</p>
                      </td>
                      <td className="px-4 py-4">
                        {canEdit ? (
                          <select aria-label={`Move ${applicant.name} to stage`} value={applicant.status || 'New'} onChange={(event) => handleStageChange(applicant, event.target.value)} className={`h-8 rounded-md border px-2 text-xs font-semibold focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-blue-600 ${stageClass(applicant.status || 'New')}`}>
                            {STAGES.map((stage) => <option key={stage}>{stage}</option>)}
                          </select>
                        ) : <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${stageClass(applicant.status || 'New')}`}>{applicant.status || 'New'}</span>}
                      </td>
                      <td className="px-4 py-4">
                        {applicant.interviewAt ? <p className="whitespace-nowrap text-xs font-medium text-slate-800">{formatDateTime(applicant.interviewAt)}</p> : <p className="text-xs text-slate-400">Not scheduled</p>}
                        {applicant.interviewer && <p className="mt-1 text-xs text-slate-500">With {applicant.interviewer}</p>}
                        {applicant.resumeURL && <a href={applicant.resumeURL} target="_blank" rel="noreferrer" className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-blue-700 hover:underline"><FileText size={12} /> Resume</a>}
                      </td>
                      <td className="max-w-[220px] px-4 py-4 text-xs leading-5 text-slate-600">
                        {applicant.interviewFeedback && <p className="line-clamp-2">{applicant.interviewFeedback}</p>}
                        {applicant.notes && <p className={`${applicant.interviewFeedback ? 'mt-1' : ''} line-clamp-2 text-slate-500`}>{applicant.notes}</p>}
                        {!applicant.interviewFeedback && !applicant.notes && <span className="text-slate-400">No notes yet</span>}
                      </td>
                      <td className="px-4 py-4 text-right">
                        <div className="inline-flex items-center gap-1">
                          {canEdit && <button type="button" onClick={() => openApplicantModal(applicant)} className={secondaryButtonClass} aria-label={`Edit ${applicant.name}`}>Edit</button>}
                          {canDeleteApplicant(applicant) && <button type="button" onClick={() => handleApplicantDelete(applicant)} aria-label={`Delete ${applicant.name}`} className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-slate-200 text-slate-500 hover:border-rose-200 hover:bg-rose-50 hover:text-rose-700"><Trash2 size={15} /></button>}
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          {filteredApplicants.length > 0 && <div className="border-t border-slate-100 px-4 py-2.5 text-xs text-slate-500">Showing {filteredApplicants.length} of {applicants.length} applications</div>}
        </section>
      )}

      <Modal isOpen={showJobModal} onClose={closeJobModal} title={editingJob ? 'Edit job opening' : 'Post a new role'} size="lg">
        <form onSubmit={handleJobSubmit} className="space-y-4 bg-white p-6">
          <div>
            <label className={labelClass}>Job title <span className="text-rose-500">*</span></label>
            <input required value={jobForm.title} onChange={(event) => setJobForm({ ...jobForm, title: event.target.value })} className={inputClass} />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div><label className={labelClass}>Department</label><input value={jobForm.department} onChange={(event) => setJobForm({ ...jobForm, department: event.target.value })} className={inputClass} /></div>
            <div><label className={labelClass}>Location</label><input placeholder="Remote, office, or city" value={jobForm.location} onChange={(event) => setJobForm({ ...jobForm, location: event.target.value })} className={inputClass} /></div>
            <div><label className={labelClass}>Employment type</label><select value={jobForm.type} onChange={(event) => setJobForm({ ...jobForm, type: event.target.value })} className={inputClass}><option>Full-time</option><option>Part-time</option><option>Contract</option><option>Internship</option></select></div>
            <div><label className={labelClass}>Opening status</label><select value={jobForm.status} onChange={(event) => setJobForm({ ...jobForm, status: event.target.value })} className={inputClass}><option>Open</option><option>Draft</option><option>Closed</option></select></div>
          </div>
          <div><label className={labelClass}>Job description</label><textarea rows={4} value={jobForm.description} onChange={(event) => setJobForm({ ...jobForm, description: event.target.value })} className="w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-blue-600" /></div>
          <div className="flex justify-end gap-2 border-t border-slate-100 pt-4"><button type="button" onClick={closeJobModal} className={secondaryButtonClass}>Cancel</button><button type="submit" className={primaryButtonClass}>{editingJob ? 'Save changes' : 'Post role'}</button></div>
        </form>
      </Modal>

      <Modal isOpen={showApplicantModal} onClose={closeApplicantModal} title={editingApplicant ? 'Update candidate' : 'Add an applicant'} size="lg">
        <form onSubmit={handleApplicantSubmit} className="space-y-4 bg-white p-6">
          <div><label className={labelClass}>Applying for <span className="text-rose-500">*</span></label><select required value={applicantForm.jobId} onChange={(event) => setApplicantForm({ ...applicantForm, jobId: event.target.value })} className={inputClass}><option value="">Select a role…</option>{jobs.map((job) => <option key={job.id} value={job.id}>{job.title}{job.department ? ` — ${job.department}` : ''}</option>)}</select></div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2"><label className={labelClass}>Full name <span className="text-rose-500">*</span></label><input required value={applicantForm.name} onChange={(event) => setApplicantForm({ ...applicantForm, name: event.target.value })} className={inputClass} /></div>
            <div><label className={labelClass}>Email <span className="text-rose-500">*</span></label><input required type="email" value={applicantForm.email} onChange={(event) => setApplicantForm({ ...applicantForm, email: event.target.value })} className={inputClass} /></div>
            <div><label className={labelClass}>Phone</label><input type="tel" value={applicantForm.phone} onChange={(event) => setApplicantForm({ ...applicantForm, phone: event.target.value })} className={inputClass} /></div>
            <div><label className={labelClass}>Application stage</label><select value={applicantForm.status} onChange={(event) => setApplicantForm({ ...applicantForm, status: event.target.value })} className={inputClass}>{STAGES.map((stage) => <option key={stage}>{stage}</option>)}</select></div>
            <div><label className={labelClass}>Resume URL</label><input type="url" placeholder="https://…" value={applicantForm.resumeURL} onChange={(event) => setApplicantForm({ ...applicantForm, resumeURL: event.target.value })} className={inputClass} /></div>
          </div>
          <div className="rounded-lg border border-slate-200 bg-slate-50/60 p-4">
            <h3 className="mb-3 flex items-center gap-2 font-heading text-sm font-bold text-slate-900"><CalendarDays size={16} className="text-blue-700" /> Interview planning</h3>
            <div className="grid gap-4 sm:grid-cols-2">
              <div><label className={labelClass}>Interview date and time</label><input type="datetime-local" value={applicantForm.interviewAt} onChange={(event) => setApplicantForm({ ...applicantForm, interviewAt: event.target.value })} className={inputClass} /></div>
              <div><label className={labelClass}>Interviewer</label><input placeholder="Name of interviewer" value={applicantForm.interviewer} onChange={(event) => setApplicantForm({ ...applicantForm, interviewer: event.target.value })} className={inputClass} /></div>
            </div>
            <div className="mt-4"><label className={labelClass}>Interview feedback</label><textarea rows={3} placeholder="Capture the panel's feedback and next steps" value={applicantForm.interviewFeedback} onChange={(event) => setApplicantForm({ ...applicantForm, interviewFeedback: event.target.value })} className="w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-blue-600" /></div>
          </div>
          <div><label className={labelClass}>Recruiter notes</label><textarea rows={3} placeholder="Shared context and follow-up notes" value={applicantForm.notes} onChange={(event) => setApplicantForm({ ...applicantForm, notes: event.target.value })} className="w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-blue-600" /></div>
          <div className="flex justify-end gap-2 border-t border-slate-100 pt-4"><button type="button" onClick={closeApplicantModal} className={secondaryButtonClass}>Cancel</button><button type="submit" className={primaryButtonClass}>{editingApplicant ? 'Save candidate' : 'Add applicant'}</button></div>
        </form>
      </Modal>
    </div>
  )
}

function MetricCard({ label, value, icon, detail }) {
  return (
    <div className="flex min-h-[92px] items-center gap-3 rounded-xl border border-slate-200 bg-white p-3.5 shadow-2xs">
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-blue-700">{icon}</div>
      <div className="min-w-0">
        <p className="text-xs font-medium text-slate-500">{label}</p>
        <p className="font-mono text-xl font-bold leading-6 text-slate-900">{value}</p>
        <p className="truncate text-[11px] text-slate-500">{detail}</p>
      </div>
    </div>
  )
}

function EmptyState({ icon, title, detail }) {
  return (
    <div className="mx-auto flex max-w-sm flex-col items-center py-5 text-center">
      <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-full bg-slate-100 text-slate-500">{icon}</div>
      <p className="text-sm font-semibold text-slate-800">{title}</p>
      <p className="mt-1 text-xs leading-5 text-slate-500">{detail}</p>
    </div>
  )
}
