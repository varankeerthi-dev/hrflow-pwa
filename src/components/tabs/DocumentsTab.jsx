import { useState, useMemo } from 'react'
import { useAuth } from '../../hooks/useAuth'
import { useDocuments } from '../../hooks/useDocuments'
import { useEmployees } from '../../hooks/useEmployees'
import { 
  Folder, 
  File, 
  FileText, 
  Search, 
  Upload, 
  Download, 
  Trash2, 
  MoreHorizontal,
  Plus,
  Filter,
  Users,
  Building2,
  FileCode,
  ShieldCheck,
  Clock,
  ExternalLink
} from 'lucide-react'
import Spinner from '../ui/Spinner'
import Modal from '../ui/Modal'

export default function DocumentsTab() {
  const { user } = useAuth()
  const { documents, loading, addDocument, deleteDocument } = useDocuments(user?.orgId)
  const { employees } = useEmployees(user?.orgId)
  
  const [activeSub, setActiveSub] = useState('org')
  const [searchTerm, setSearchTerm] = useState('')
  const [showUploadModal, setShowUploadModal] = useState(false)
  const [selectedEmpId, setSelectedEmpId] = useState('')
  
  const [uploadForm, setUploadForm] = useState({
    name: '',
    category: 'Policy',
    type: 'Org', // 'Org' or 'Employee'
    employeeId: '',
    url: '',
    status: 'Active'
  })

  const filteredOrgDocs = useMemo(() => {
    return documents.filter(d => 
      d.type === 'Org' && 
      d.name?.toLowerCase().includes(searchTerm.toLowerCase())
    )
  }, [documents, searchTerm])

  const filteredEmpDocs = useMemo(() => {
    return documents.filter(d => 
      d.type === 'Employee' && 
      (selectedEmpId ? d.employeeId === selectedEmpId : true) &&
      d.name?.toLowerCase().includes(searchTerm.toLowerCase())
    )
  }, [documents, searchTerm, selectedEmpId])

  const handleUpload = async (e) => {
    e.preventDefault()
    try {
      const payload = {
        ...uploadForm,
        employeeId: activeSub === 'employee' ? selectedEmpId : ''
      }
      if (activeSub === 'employee' && !selectedEmpId) {
        alert('Please select an employee first')
        return
      }
      await addDocument(payload)
      setShowUploadModal(false)
      setUploadForm({ name: '', category: 'Policy', type: activeSub === 'org' ? 'Org' : 'Employee', employeeId: '', url: '', status: 'Active' })
    } catch (err) {
      alert('Error uploading document: ' + err.message)
    }
  }

  if (loading) return <div className="flex h-full items-center justify-center py-20"><Spinner /></div>

  return (
    <div className="space-y-6 font-inter animate-in fade-in duration-500">
      {/* Category Tabs */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex bg-gray-100 p-1 rounded-xl w-fit">
          <button
            onClick={() => { setActiveSub('org'); setSearchTerm(''); }}
            className={`flex items-center gap-2 px-6 py-2 rounded-lg text-[13px] font-bold transition-all ${activeSub === 'org' ? 'bg-white shadow-sm text-gray-900' : 'text-gray-400 hover:text-gray-600'}`}
          >
            <Building2 size={16} /> Organization Docs
          </button>
          <button
            onClick={() => { setActiveSub('employee'); setSearchTerm(''); }}
            className={`flex items-center gap-2 px-6 py-2 rounded-lg text-[13px] font-bold transition-all ${activeSub === 'employee' ? 'bg-white shadow-sm text-gray-900' : 'text-gray-400 hover:text-gray-600'}`}
          >
            <Users size={16} /> Employee Dossiers
          </button>
        </div>

        <div className="flex items-center gap-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
            <input 
              type="text" 
              placeholder="Search by filename..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10 pr-4 h-[40px] border border-gray-200 rounded-xl text-sm font-medium bg-white focus:ring-2 focus:ring-indigo-500 outline-none w-[200px] transition-all"
            />
          </div>
          <button 
            onClick={() => setShowUploadModal(true)}
            className="h-[40px] px-5 bg-indigo-600 text-white font-bold rounded-xl text-[12px] uppercase tracking-widest flex items-center gap-2 hover:bg-indigo-700 transition-all shadow-md"
          >
            <Upload size={18} /> Upload New
          </button>
        </div>
      </div>

      {activeSub === 'employee' && (
        <div className="bg-indigo-50/50 p-4 rounded-xl border border-indigo-100 flex items-center gap-4">
          <label className="text-[11px] font-bold text-indigo-600 uppercase tracking-widest whitespace-nowrap">Select Employee:</label>
          <select 
            value={selectedEmpId} 
            onChange={(e) => setSelectedEmpId(e.target.value)}
            className="flex-1 max-w-sm h-[40px] border border-indigo-100 rounded-lg text-sm font-bold px-3 focus:ring-2 focus:ring-indigo-500 outline-none bg-white"
          >
            <option value="">All Employees</option>
            {employees.map(e => <option key={e.id} value={e.id}>{e.name} ({e.empCode})</option>)}
          </select>
        </div>
      )}

      {/* Document Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {(activeSub === 'org' ? filteredOrgDocs : filteredEmpDocs).length === 0 ? (
          <div className="col-span-full py-20 text-center bg-white rounded-2xl border border-dashed border-gray-200">
            <div className="w-16 h-16 bg-gray-50 rounded-full flex items-center justify-center mx-auto mb-4">
              <Folder size={24} className="text-gray-300" />
            </div>
            <p className="text-gray-400 font-medium">No documents found in this repository.</p>
          </div>
        ) : (
          (activeSub === 'org' ? filteredOrgDocs : filteredEmpDocs).map(doc => (
            <div key={doc.id} className="bg-white rounded-2xl border border-gray-100 p-5 shadow-sm hover:shadow-md transition-all group">
              <div className="flex justify-between items-start mb-4">
                <div className="w-10 h-10 rounded-xl bg-gray-50 flex items-center justify-center text-gray-400 group-hover:bg-indigo-50 group-hover:text-indigo-600 transition-colors">
                  {doc.category === 'Contract' ? <ShieldCheck size={20} /> : <FileText size={20} />}
                </div>
                <button 
                  onClick={() => { if (confirm('Delete this document permanently?')) deleteDocument(doc.id); }}
                  className="p-1.5 text-gray-300 hover:text-red-500 transition-colors"
                >
                  <Trash2 size={16} />
                </button>
              </div>

              <h3 className="text-[13px] font-bold text-gray-900 mb-1 truncate" title={doc.name}>{doc.name}</h3>
              <div className="flex items-center gap-2 mb-4">
                <span className="text-[10px] font-bold text-indigo-500 uppercase tracking-tighter bg-indigo-50 px-2 py-0.5 rounded-md">
                  {doc.category}
                </span>
                <span className="text-[10px] text-gray-400 font-medium flex items-center gap-1">
                  <Clock size={10} /> {new Date(doc.createdAt?.seconds * 1000).toLocaleDateString()}
                </span>
              </div>

              {activeSub === 'employee' && !selectedEmpId && (
                <div className="text-[10px] font-bold text-gray-400 uppercase mb-4 truncate border-t border-gray-50 pt-3">
                  Owner: {employees.find(e => e.id === doc.employeeId)?.name || 'Former Staff'}
                </div>
              )}

              <div className="pt-4 border-t border-gray-50">
                <a 
                  href={doc.url} 
                  target="_blank" 
                  rel="noreferrer"
                  className="w-full h-[36px] flex items-center justify-center gap-2 bg-gray-50 hover:bg-gray-100 text-gray-600 rounded-lg text-[11px] font-black uppercase tracking-widest transition-all"
                >
                  <ExternalLink size={14} /> View File
                </a>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Upload Modal */}
      <Modal isOpen={showUploadModal} onClose={() => setShowUploadModal(false)} title="Upload Repository File">
        <form onSubmit={handleUpload} className="p-6 space-y-4 max-w-md mx-auto bg-white">
          <div>
            <label className="block text-[11px] font-bold text-gray-400 uppercase tracking-widest mb-1.5">File Name *</label>
            <input 
              required
              type="text" 
              value={uploadForm.name} 
              onChange={e => setUploadForm({...uploadForm, name: e.target.value})}
              placeholder="e.g. Health Insurance Policy 2024"
              className="w-full h-[42px] border border-gray-200 rounded-xl px-4 text-sm font-medium bg-gray-50 focus:ring-2 focus:ring-indigo-500 outline-none"
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-[11px] font-bold text-gray-400 uppercase tracking-widest mb-1.5">Category</label>
              <select 
                value={uploadForm.category} 
                onChange={e => setUploadForm({...uploadForm, category: e.target.value})}
                className="w-full h-[42px] border border-gray-200 rounded-xl px-4 text-sm font-medium bg-gray-50 focus:ring-2 focus:ring-indigo-500 outline-none"
              >
                <option value="Policy">Policy</option>
                <option value="Contract">Contract</option>
                <option value="ID Proof">ID Proof</option>
                <option value="Certification">Certification</option>
                <option value="Other">Other</option>
              </select>
            </div>
            <div>
              <label className="block text-[11px] font-bold text-gray-400 uppercase tracking-widest mb-1.5">Access Type</label>
              <select 
                value={activeSub === 'org' ? 'Org' : 'Employee'} 
                disabled
                className="w-full h-[42px] border border-gray-200 rounded-xl px-4 text-sm font-medium bg-gray-100 text-gray-400 outline-none appearance-none"
              >
                <option value="Org">Org Wide</option>
                <option value="Employee">Restricted</option>
              </select>
            </div>
          </div>
          <div>
            <label className="block text-[11px] font-bold text-gray-400 uppercase tracking-widest mb-1.5">File Source URL (S3/Cloudinary) *</label>
            <input 
              required
              type="text" 
              value={uploadForm.url} 
              onChange={e => setUploadForm({...uploadForm, url: e.target.value})}
              placeholder="https://storage.provider.com/file.pdf"
              className="w-full h-[42px] border border-gray-200 rounded-xl px-4 text-sm font-medium bg-gray-50 focus:ring-2 focus:ring-indigo-500 outline-none"
            />
          </div>
          <button type="submit" className="w-full h-[46px] bg-indigo-600 text-white font-bold rounded-xl text-[12px] uppercase tracking-widest hover:bg-indigo-700 transition-all shadow-lg mt-4">
            Initialize Upload
          </button>
        </form>
      </Modal>
    </div>
  )
}
