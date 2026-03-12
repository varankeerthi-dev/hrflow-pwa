import { useState, useMemo } from 'react'
import { useAuth } from '../../hooks/useAuth'
import { useRecruitment } from '../../hooks/useRecruitment'
import { 
  Briefcase, 
  Users, 
  Plus, 
  Search, 
  MoreHorizontal, 
  Edit, 
  Trash2, 
  ExternalLink,
  MapPin,
  Clock,
  Filter,
  CheckCircle2,
  XCircle,
  Clock3,
  Mail,
  Phone,
  FileText
} from 'lucide-react'
import Spinner from '../ui/Spinner'
import Modal from '../ui/Modal'

export default function RecruitmentTab() {
  const { user } = useAuth()
  const { 
    jobs, 
    applicants, 
    loading, 
    addJob, 
    updateJob, 
    deleteJob, 
    addApplicant, 
    updateApplicant, 
    deleteApplicant 
  } = useRecruitment(user?.orgId, user)

  const [activeSub, setActiveSub] = useState('jobs')
  const [searchTerm, setSearchTerm] = useState('')
  const [showAddJob, setShowAddJob] = useState(false)
  const [editingJob, setEditingJob] = useState(null)
  const [showAddApplicant, setShowAddApplicant] = useState(false)
  const [editingApplicant, setEditingApplicant] = useState(null)
  
  const [jobForm, setJobForm] = useState({
    title: '',
    department: '',
    location: '',
    type: 'Full-time',
    description: '',
    status: 'Open'
  })

  const [applicantForm, setApplicantForm] = useState({
    jobId: '',
    name: '',
    email: '',
    phone: '',
    resumeURL: '',
    status: 'New',
    notes: ''
  })

  const filteredJobs = useMemo(() => {
    return jobs.filter(j => 
      j.title?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      j.department?.toLowerCase().includes(searchTerm.toLowerCase())
    )
  }, [jobs, searchTerm])

  const filteredApplicants = useMemo(() => {
    return applicants.filter(a => 
      a.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      a.email?.toLowerCase().includes(searchTerm.toLowerCase())
    )
  }, [applicants, searchTerm])

  const getApplicantStatusColor = (status) => {
    switch (status) {
      case 'New': return 'bg-blue-50 text-blue-600 border-blue-100'
      case 'Screening': return 'bg-purple-50 text-purple-600 border-purple-100'
      case 'Interview': return 'bg-orange-50 text-orange-600 border-orange-100'
      case 'Offer': return 'bg-cyan-50 text-cyan-600 border-cyan-100'
      case 'Hired': return 'bg-green-50 text-green-600 border-green-100'
      case 'Rejected': return 'bg-red-50 text-red-600 border-red-100'
      default: return 'bg-gray-50 text-gray-600 border-gray-100'
    }
  }

  const handleJobSubmit = async (e) => {
    e.preventDefault()
    try {
      if (editingJob) {
        await updateJob(editingJob.id, jobForm)
      } else {
        await addJob(jobForm)
      }
      setShowAddJob(false)
      setEditingJob(null)
      setJobForm({ title: '', department: '', location: '', type: 'Full-time', description: '', status: 'Open' })
    } catch (err) {
      alert('Error saving job: ' + err.message)
    }
  }

  const handleApplicantSubmit = async (e) => {
    e.preventDefault()
    try {
      if (editingApplicant) {
        await updateApplicant(editingApplicant.id, applicantForm)
      } else {
        await addApplicant(applicantForm)
      }
      setShowAddApplicant(false)
      setEditingApplicant(null)
      setApplicantForm({ jobId: '', name: '', email: '', phone: '', resumeURL: '', status: 'New', notes: '' })
    } catch (err) {
      alert('Error saving applicant: ' + err.message)
    }
  }

  if (loading) return <div className="flex h-full items-center justify-center py-20"><Spinner /></div>

  return (
    <div className="space-y-6 font-inter animate-in fade-in duration-500">
      {/* Tab Navigation & Search */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex bg-gray-100 p-1 rounded-xl w-fit">
          <button
            onClick={() => { setActiveSub('jobs'); setSearchTerm(''); }}
            className={`flex items-center gap-2 px-6 py-2 rounded-lg text-[13px] font-bold transition-all ${activeSub === 'jobs' ? 'bg-white shadow-sm text-gray-900' : 'text-gray-400 hover:text-gray-600'}`}
          >
            <Briefcase size={16} /> Job Openings
          </button>
          <button
            onClick={() => { setActiveSub('applicants'); setSearchTerm(''); }}
            className={`flex items-center gap-2 px-6 py-2 rounded-lg text-[13px] font-bold transition-all ${activeSub === 'applicants' ? 'bg-white shadow-sm text-gray-900' : 'text-gray-400 hover:text-gray-600'}`}
          >
            <Users size={16} /> Applicants
          </button>
        </div>

        <div className="flex items-center gap-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
            <input 
              type="text" 
              placeholder={activeSub === 'jobs' ? "Search jobs..." : "Search applicants..."}
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10 pr-4 h-[40px] border border-gray-200 rounded-xl text-sm font-medium bg-white focus:ring-2 focus:ring-indigo-500 outline-none w-[240px] transition-all"
            />
          </div>
          <button 
            onClick={() => activeSub === 'jobs' ? setShowAddJob(true) : setShowAddApplicant(true)}
            className="h-[40px] px-5 bg-indigo-600 text-white font-bold rounded-xl text-[12px] uppercase tracking-widest flex items-center gap-2 hover:bg-indigo-700 transition-all shadow-md"
          >
            <Plus size={18} /> {activeSub === 'jobs' ? 'Post Job' : 'Add Applicant'}
          </button>
        </div>
      </div>

      {/* Content Area */}
      {activeSub === 'jobs' ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredJobs.length === 0 ? (
            <div className="col-span-full py-20 text-center bg-white rounded-2xl border border-dashed border-gray-200">
              <div className="w-16 h-16 bg-gray-50 rounded-full flex items-center justify-center mx-auto mb-4">
                <Briefcase size={24} className="text-gray-300" />
              </div>
              <p className="text-gray-400 font-medium">No job openings found.</p>
            </div>
          ) : (
            filteredJobs.map(job => (
              <div key={job.id} className="bg-white rounded-2xl border border-gray-100 p-5 shadow-sm hover:shadow-md transition-all group relative">
                <div className="flex justify-between items-start mb-4">
                  <div className={`px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider ${job.status === 'Open' ? 'bg-green-50 text-green-600' : 'bg-gray-50 text-gray-400'}`}>
                    {job.status}
                  </div>
                  <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button 
                      onClick={() => { setEditingJob(job); setJobForm(job); setShowAddJob(true); }}
                      className="p-1.5 text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-all"
                    >
                      <Edit size={14} />
                    </button>
                    <button 
                      onClick={() => { if (confirm('Delete this job?')) deleteJob(job.id); }}
                      className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-all"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
                
                <h3 className="text-[15px] font-bold text-gray-900 mb-1">{job.title}</h3>
                <p className="text-[12px] text-indigo-600 font-semibold mb-4 uppercase tracking-tight">{job.department}</p>
                
                <div className="space-y-2 mb-4">
                  <div className="flex items-center gap-2 text-[11px] text-gray-500 font-medium">
                    <MapPin size={14} className="text-gray-400" /> {job.location || 'Remote'}
                  </div>
                  <div className="flex items-center gap-2 text-[11px] text-gray-500 font-medium">
                    <Clock size={14} className="text-gray-400" /> {job.type}
                  </div>
                </div>

                <div className="pt-4 border-t border-gray-50 flex items-center justify-between">
                  <span className="text-[10px] text-gray-400 font-bold uppercase tracking-widest">
                    {applicants.filter(a => a.jobId === job.id).length} Applicants
                  </span>
                  <button 
                    onClick={() => { setActiveSub('applicants'); setSearchTerm(job.title); }}
                    className="text-[11px] font-bold text-indigo-600 hover:underline flex items-center gap-1"
                  >
                    View Applications <ExternalLink size={12} />
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-gray-50/50">
                  <th className="px-6 py-4 text-[11px] font-bold text-gray-400 uppercase tracking-widest border-b border-gray-100">Applicant</th>
                  <th className="px-6 py-4 text-[11px] font-bold text-gray-400 uppercase tracking-widest border-b border-gray-100">Role / Job</th>
                  <th className="px-6 py-4 text-[11px] font-bold text-gray-400 uppercase tracking-widest border-b border-gray-100">Status</th>
                  <th className="px-6 py-4 text-[11px] font-bold text-gray-400 uppercase tracking-widest border-b border-gray-100 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {filteredApplicants.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="px-6 py-16 text-center text-gray-300 font-medium">No applications recorded.</td>
                  </tr>
                ) : (
                  filteredApplicants.map(applicant => {
                    const job = jobs.find(j => j.id === applicant.jobId)
                    return (
                      <tr key={applicant.id} className="hover:bg-gray-50/50 transition-colors group">
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-3">
                            <div className="w-9 h-9 rounded-full bg-indigo-50 flex items-center justify-center text-indigo-600 font-bold text-sm">
                              {applicant.name?.charAt(0)}
                            </div>
                            <div>
                              <p className="text-sm font-bold text-gray-900 leading-none">{applicant.name}</p>
                              <div className="flex gap-3 mt-1.5">
                                <span className="text-[10px] text-gray-400 flex items-center gap-1"><Mail size={10} /> {applicant.email}</span>
                                <span className="text-[10px] text-gray-400 flex items-center gap-1"><Phone size={10} /> {applicant.phone}</span>
                              </div>
                            </div>
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <p className="text-[13px] font-semibold text-gray-700">{job?.title || 'Unknown Role'}</p>
                          <p className="text-[10px] text-gray-400 font-bold uppercase tracking-tight">{job?.department || 'N/A'}</p>
                        </td>
                        <td className="px-6 py-4">
                          <span className={`px-2.5 py-1 rounded-full text-[10px] font-bold border ${getApplicantStatusColor(applicant.status)}`}>
                            {applicant.status}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-right">
                          <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                            <button 
                              onClick={() => { setEditingApplicant(applicant); setApplicantForm(applicant); setShowAddApplicant(true); }}
                              className="p-1.5 text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-all"
                              title="Edit"
                            >
                              <Edit size={14} />
                            </button>
                            <button 
                              onClick={() => { if (confirm('Delete this applicant?')) deleteApplicant(applicant.id); }}
                              className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-all"
                              title="Delete"
                            >
                              <Trash2 size={14} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    )
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Modals */}
      <Modal isOpen={showAddJob} onClose={() => { setShowAddJob(false); setEditingJob(null); }} title={editingJob ? 'Edit Job Opening' : 'Post New Job'}>
        <form onSubmit={handleJobSubmit} className="p-6 space-y-4 max-w-lg mx-auto bg-white">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="col-span-full">
              <label className="block text-[11px] font-bold text-gray-400 uppercase tracking-widest mb-1.5">Job Title *</label>
              <input 
                required
                type="text" 
                value={jobForm.title} 
                onChange={e => setJobForm({...jobForm, title: e.target.value})}
                className="w-full h-[42px] border border-gray-200 rounded-xl px-4 text-sm font-medium bg-gray-50 focus:ring-2 focus:ring-indigo-500 outline-none"
              />
            </div>
            <div>
              <label className="block text-[11px] font-bold text-gray-400 uppercase tracking-widest mb-1.5">Department</label>
              <input 
                type="text" 
                value={jobForm.department} 
                onChange={e => setJobForm({...jobForm, department: e.target.value})}
                className="w-full h-[42px] border border-gray-200 rounded-xl px-4 text-sm font-medium bg-gray-50 focus:ring-2 focus:ring-indigo-500 outline-none"
              />
            </div>
            <div>
              <label className="block text-[11px] font-bold text-gray-400 uppercase tracking-widest mb-1.5">Location</label>
              <input 
                type="text" 
                placeholder="e.g. Remote, Office"
                value={jobForm.location} 
                onChange={e => setJobForm({...jobForm, location: e.target.value})}
                className="w-full h-[42px] border border-gray-200 rounded-xl px-4 text-sm font-medium bg-gray-50 focus:ring-2 focus:ring-indigo-500 outline-none"
              />
            </div>
            <div>
              <label className="block text-[11px] font-bold text-gray-400 uppercase tracking-widest mb-1.5">Employment Type</label>
              <select 
                value={jobForm.type} 
                onChange={e => setJobForm({...jobForm, type: e.target.value})}
                className="w-full h-[42px] border border-gray-200 rounded-xl px-4 text-sm font-medium bg-gray-50 focus:ring-2 focus:ring-indigo-500 outline-none"
              >
                <option value="Full-time">Full-time</option>
                <option value="Part-time">Part-time</option>
                <option value="Contract">Contract</option>
                <option value="Internship">Internship</option>
              </select>
            </div>
            <div>
              <label className="block text-[11px] font-bold text-gray-400 uppercase tracking-widest mb-1.5">Status</label>
              <select 
                value={jobForm.status} 
                onChange={e => setJobForm({...jobForm, status: e.target.value})}
                className="w-full h-[42px] border border-gray-200 rounded-xl px-4 text-sm font-medium bg-gray-50 focus:ring-2 focus:ring-indigo-500 outline-none"
              >
                <option value="Open">Open</option>
                <option value="Closed">Closed</option>
                <option value="Draft">Draft</option>
              </select>
            </div>
          </div>
          <div>
            <label className="block text-[11px] font-bold text-gray-400 uppercase tracking-widest mb-1.5">Job Description</label>
            <textarea 
              rows={4}
              value={jobForm.description} 
              onChange={e => setJobForm({...jobForm, description: e.target.value})}
              className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm font-medium bg-gray-50 focus:ring-2 focus:ring-indigo-500 outline-none resize-none"
            />
          </div>
          <button type="submit" className="w-full h-[46px] bg-gray-900 text-white font-bold rounded-xl text-[12px] uppercase tracking-widest hover:bg-gray-800 transition-all shadow-lg">
            {editingJob ? 'Update Job' : 'Post Job'}
          </button>
        </form>
      </Modal>

      <Modal isOpen={showAddApplicant} onClose={() => { setShowAddApplicant(false); setEditingApplicant(null); }} title={editingApplicant ? 'Update Applicant' : 'New Applicant'}>
        <form onSubmit={handleApplicantSubmit} className="p-6 space-y-4 max-w-lg mx-auto bg-white">
          <div>
            <label className="block text-[11px] font-bold text-gray-400 uppercase tracking-widest mb-1.5">Applying for Job *</label>
            <select 
              required
              value={applicantForm.jobId} 
              onChange={e => setApplicantForm({...applicantForm, jobId: e.target.value})}
              className="w-full h-[42px] border border-gray-200 rounded-xl px-4 text-sm font-medium bg-gray-50 focus:ring-2 focus:ring-indigo-500 outline-none"
            >
              <option value="">Select a job opening...</option>
              {jobs.map(j => <option key={j.id} value={j.id}>{j.title} ({j.department})</option>)}
            </select>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="col-span-full">
              <label className="block text-[11px] font-bold text-gray-400 uppercase tracking-widest mb-1.5">Full Name *</label>
              <input 
                required
                type="text" 
                value={applicantForm.name} 
                onChange={e => setApplicantForm({...applicantForm, name: e.target.value})}
                className="w-full h-[42px] border border-gray-200 rounded-xl px-4 text-sm font-medium bg-gray-50 focus:ring-2 focus:ring-indigo-500 outline-none"
              />
            </div>
            <div>
              <label className="block text-[11px] font-bold text-gray-400 uppercase tracking-widest mb-1.5">Email *</label>
              <input 
                required
                type="email" 
                value={applicantForm.email} 
                onChange={e => setApplicantForm({...applicantForm, email: e.target.value})}
                className="w-full h-[42px] border border-gray-200 rounded-xl px-4 text-sm font-medium bg-gray-50 focus:ring-2 focus:ring-indigo-500 outline-none"
              />
            </div>
            <div>
              <label className="block text-[11px] font-bold text-gray-400 uppercase tracking-widest mb-1.5">Phone Number</label>
              <input 
                type="tel" 
                value={applicantForm.phone} 
                onChange={e => setApplicantForm({...applicantForm, phone: e.target.value})}
                className="w-full h-[42px] border border-gray-200 rounded-xl px-4 text-sm font-medium bg-gray-50 focus:ring-2 focus:ring-indigo-500 outline-none"
              />
            </div>
            <div>
              <label className="block text-[11px] font-bold text-gray-400 uppercase tracking-widest mb-1.5">Application Status</label>
              <select 
                value={applicantForm.status} 
                onChange={e => setApplicantForm({...applicantForm, status: e.target.value})}
                className="w-full h-[42px] border border-gray-200 rounded-xl px-4 text-sm font-medium bg-gray-50 focus:ring-2 focus:ring-indigo-500 outline-none"
              >
                <option value="New">New</option>
                <option value="Screening">Screening</option>
                <option value="Interview">Interview</option>
                <option value="Offer">Offer</option>
                <option value="Hired">Hired</option>
                <option value="Rejected">Rejected</option>
              </select>
            </div>
            <div>
              <label className="block text-[11px] font-bold text-gray-400 uppercase tracking-widest mb-1.5">Resume / Link</label>
              <input 
                type="text" 
                placeholder="URL to resume"
                value={applicantForm.resumeURL} 
                onChange={e => setApplicantForm({...applicantForm, resumeURL: e.target.value})}
                className="w-full h-[42px] border border-gray-200 rounded-xl px-4 text-sm font-medium bg-gray-50 focus:ring-2 focus:ring-indigo-500 outline-none"
              />
            </div>
          </div>
          <div>
            <label className="block text-[11px] font-bold text-gray-400 uppercase tracking-widest mb-1.5">Notes</label>
            <textarea 
              rows={3}
              value={applicantForm.notes} 
              onChange={e => setApplicantForm({...applicantForm, notes: e.target.value})}
              className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm font-medium bg-gray-50 focus:ring-2 focus:ring-indigo-500 outline-none resize-none"
            />
          </div>
          <button type="submit" className="w-full h-[46px] bg-indigo-600 text-white font-bold rounded-xl text-[12px] uppercase tracking-widest hover:bg-indigo-700 transition-all shadow-lg">
            {editingApplicant ? 'Update Applicant' : 'Save Applicant'}
          </button>
        </form>
      </Modal>
    </div>
  )
}
