import React, { useMemo, useState } from 'react'
import { getBlob, ref } from 'firebase/storage'
import { Archive, Clock3, ExternalLink, FileText, Folder, History, Search, ShieldCheck, Trash2, Upload, Users, Building2, X } from 'lucide-react'
import { useAuth } from '../../hooks/useAuth'
import { useDocuments } from '../../hooks/useDocuments'
import { useEmployees } from '../../hooks/useEmployees'
import { storage } from '../../lib/firebase'
import { groupDocumentVersions, MAX_DOCUMENT_UPLOAD_BYTES, validateDocumentFile } from '../../lib/documentManagement'
import Spinner from '../ui/Spinner'
import Modal from '../ui/Modal'
import ShareAction from '../ui/ShareAction'
import { buildOrganizationDocumentPayload, canShareOrganizationDocument, sanitizeShareFileName } from '../../lib/share'

const inputClass = 'h-9 w-full rounded-md border border-slate-200 bg-white px-3 py-1 text-sm text-slate-800 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-blue-600'
const labelClass = 'mb-1.5 block text-sm font-medium text-slate-800'
const primaryClass = 'inline-flex h-9 items-center justify-center gap-2 rounded-md bg-blue-600 px-4 text-sm font-bold text-white shadow-sm transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50'
const formatDate = (value) => {
  const date = value?.toDate?.() || (value ? new Date(value) : null)
  return date && !Number.isNaN(date.getTime()) ? new Intl.DateTimeFormat(undefined, { day: '2-digit', month: 'short', year: 'numeric' }).format(date) : '—'
}
const isExpired = (value) => Boolean(value && new Date(`${value}T23:59:59`) < new Date())

export default function DocumentsTab() {
  const { user } = useAuth()
  const api = useDocuments(user?.orgId, user)
  const { documents, loading, addDocument, uploadDocument, updateDocument, deleteDocument, canCreate, canEditDocument, canDeleteDocument } = api
  const { employees, loading: employeesLoading } = useEmployees(user?.orgId)
  const [activeSub, setActiveSub] = useState('org')
  const [searchTerm, setSearchTerm] = useState('')
  const [selectedEmpId, setSelectedEmpId] = useState('')
  const [showUploadModal, setShowUploadModal] = useState(false)
  const [versionTarget, setVersionTarget] = useState(null)
  const [historyGroup, setHistoryGroup] = useState(null)
  const [source, setSource] = useState('file')
  const [selectedFile, setSelectedFile] = useState(null)
  const [saving, setSaving] = useState(false)
  const [actionError, setActionError] = useState('')
  const [notice, setNotice] = useState('')
  const [uploadForm, setUploadForm] = useState({ name: '', category: 'Policy', employeeId: '', url: '', expiresOn: '' })

  const groupedDocuments = useMemo(() => groupDocumentVersions(documents), [documents])
  const filteredGroups = useMemo(() => groupedDocuments.filter(({ current }) => {
    if ((activeSub === 'org' ? 'Org' : 'Employee') !== current.type) return false
    if (activeSub === 'employee' && selectedEmpId && current.employeeId !== selectedEmpId) return false
    return !searchTerm.trim() || [current.name, current.fileName, current.category, current.employeeId]
      .some((value) => String(value || '').toLowerCase().includes(searchTerm.trim().toLowerCase()))
  }), [groupedDocuments, activeSub, selectedEmpId, searchTerm])
  const selectedEmployee = employees.find((employee) => employee.id === selectedEmpId)

  const prepareStoredDocumentFile = async (document) => {
    const blob = await getBlob(ref(storage, document.storagePath), MAX_DOCUMENT_UPLOAD_BYTES)
    if (!blob.size || blob.size > MAX_DOCUMENT_UPLOAD_BYTES) throw new Error('File is too large or empty.')
    const fileName = sanitizeShareFileName(document.fileName || document.name, 'organization-document')
    return new File([blob], fileName, { type: blob.type || document.fileType || 'application/octet-stream' })
  }

  const resetForm = () => {
    setUploadForm({ name: '', category: 'Policy', employeeId: selectedEmpId, url: '', expiresOn: '' })
    setSelectedFile(null)
    setSource('file')
    setVersionTarget(null)
    setActionError('')
  }
  const openNewDocument = () => {
    resetForm()
    setShowUploadModal(true)
  }
  const openNewVersion = (current) => {
    setActionError('')
    setVersionTarget(current)
    setUploadForm({ name: current.name || '', category: current.category || 'Policy', employeeId: current.employeeId || '', url: '', expiresOn: current.expiresOn || '' })
    setSelectedFile(null)
    setSource('file')
    setShowUploadModal(true)
  }

  const handleSave = async (event) => {
    event.preventDefault()
    setActionError('')
    if (!canCreate) { setActionError('You do not have permission to add documents.'); return }
    const name = uploadForm.name.trim()
    if (!name) { setActionError('Enter a document name.'); return }
    const employeeId = activeSub === 'employee' ? uploadForm.employeeId : ''
    if (activeSub === 'employee' && !employeeId) { setActionError('Choose an employee for this restricted dossier record.'); return }
    const payload = { name, category: uploadForm.category, type: activeSub === 'org' ? 'Org' : 'Employee', employeeId, status: 'Active', expiresOn: uploadForm.expiresOn || '' }
    if (source === 'file') {
      const fileError = validateDocumentFile(selectedFile)
      if (fileError) { setActionError(fileError); return }
    } else {
      try { new URL(uploadForm.url) } catch { setActionError('Enter a valid document URL beginning with https://.'); return }
      if (!/^https:\/\//i.test(uploadForm.url.trim())) { setActionError('Only secure https:// document URLs are accepted.'); return }
    }
    setSaving(true)
    try {
      if (source === 'file') await uploadDocument(payload, selectedFile, versionTarget)
      else await addDocument({ ...payload, url: uploadForm.url.trim(), fileName: '', documentSource: 'external-url' })
      setShowUploadModal(false)
      setNotice(versionTarget ? `Version added for ${name}.` : `${name} added to documents.`)
      resetForm()
    } catch (error) {
      setActionError(error.message || 'Could not save this document.')
    } finally {
      setSaving(false)
    }
  }

  const handleArchive = async (record) => {
    setActionError('')
    try {
      await updateDocument(record.id, { status: record.status === 'Archived' ? 'Active' : 'Archived' })
      setNotice(record.status === 'Archived' ? 'Document restored to active.' : 'Document archived.')
    } catch (error) { setActionError(error.message || 'Could not update this document.') }
  }

  const handleDelete = async (record) => {
    if (!window.confirm(`Delete version ${record.version || 1} of “${record.name}”? This also removes its uploaded file when applicable.`)) return
    setActionError('')
    try {
      await deleteDocument(record.id)
      setNotice(`Version ${record.version || 1} deleted.`)
      setHistoryGroup((group) => group ? { ...group, versions: group.versions.filter((item) => item.id !== record.id) } : group)
    } catch (error) { setActionError(error.message || 'Could not delete this document version.') }
  }

  const getStatus = (document) => {
    if (document.status === 'Archived') return { label: 'Archived', style: 'bg-slate-100 text-slate-600' }
    if (isExpired(document.expiresOn)) return { label: 'Expired', style: 'bg-rose-50 text-rose-700' }
    if (document.expiresOn) return { label: `Expires ${formatDate(document.expiresOn)}`, style: 'bg-amber-50 text-amber-800' }
    return { label: 'Active', style: 'bg-emerald-50 text-emerald-700' }
  }

  if (!api.canCreate && documents.length === 0 && !loading && user?.role?.toLowerCase() !== 'admin' && !user?.permissions?.DocumentManagement?.view && !user?.permissions?.DocumentManagement?.full) {
    return <div className="rounded-xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-900" role="status">You need Document Management view permission to use this workspace.</div>
  }

  return (
    <div className="space-y-5 font-body">
      <section className="flex flex-col gap-4 rounded-xl border border-slate-200 bg-white p-4 shadow-2xs md:flex-row md:items-center md:justify-between md:p-5">
        <div className="inline-flex w-fit flex-wrap gap-1 rounded-lg bg-slate-100 p-1" role="tablist" aria-label="Document repository type">
          <button type="button" role="tab" aria-selected={activeSub === 'org'} onClick={() => { setActiveSub('org'); setSearchTerm('') }} className={`inline-flex h-9 items-center gap-2 rounded-md px-3 text-xs font-semibold ${activeSub === 'org' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-800'}`}><Building2 size={15} /> Organization</button>
          <button type="button" role="tab" aria-selected={activeSub === 'employee'} onClick={() => { setActiveSub('employee'); setSearchTerm('') }} className={`inline-flex h-9 items-center gap-2 rounded-md px-3 text-xs font-semibold ${activeSub === 'employee' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-800'}`}><Users size={15} /> Employee dossiers</button>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row">
          <div className="relative min-w-0 sm:w-56"><Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={15} /><input type="search" aria-label="Search documents" placeholder="Search documents…" value={searchTerm} onChange={(event) => setSearchTerm(event.target.value)} className={`${inputClass} pl-9`} /></div>
          {canCreate && <button type="button" onClick={openNewDocument} className={`${primaryClass} shrink-0`}><Upload size={15} /> Add document</button>}
        </div>
      </section>

      {actionError && !showUploadModal && <div role="alert" className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">{actionError}<button type="button" onClick={() => setActionError('')} className="ml-3 font-semibold underline">Dismiss</button></div>}
      {api.error && !actionError && <div role="alert" className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">{api.error}<button type="button" onClick={api.fetchDocuments} className="ml-3 font-semibold underline">Retry</button></div>}
      {notice && <div role="status" className="flex items-center justify-between gap-3 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-sm text-emerald-800"><span>{notice}</span><button type="button" aria-label="Dismiss message" onClick={() => setNotice('')}><X size={15} /></button></div>}

      {activeSub === 'employee' && <div className="flex flex-col gap-2 rounded-lg border border-slate-200 bg-white p-3 sm:flex-row sm:items-center"><label className="text-xs font-semibold text-slate-700" htmlFor="document-employee-filter">Employee dossier</label><select id="document-employee-filter" value={selectedEmpId} onChange={(event) => setSelectedEmpId(event.target.value)} className={`${inputClass} sm:max-w-sm`}><option value="">All employees</option>{employees.map((employee) => <option key={employee.id} value={employee.id}>{employee.name}{employee.empCode ? ` (${employee.empCode})` : ''}</option>)}</select>{selectedEmployee && <span className="text-xs text-slate-500">Showing files for {selectedEmployee.name}</span>}</div>}

      {loading || employeesLoading ? <div className="flex justify-center rounded-xl border border-slate-200 bg-white py-16"><Spinner /></div> : filteredGroups.length === 0 ? <div className="rounded-xl border border-dashed border-slate-200 bg-white px-6 py-14 text-center"><Folder className="mx-auto mb-3 text-slate-400" size={25} /><p className="text-sm font-semibold text-slate-800">No documents found</p><p className="mt-1 text-xs text-slate-500">{searchTerm ? 'Try another search.' : 'Add a file or an existing secure HTTPS document link to start this repository.'}</p>{canCreate && !searchTerm && <button type="button" onClick={openNewDocument} className="mt-4 inline-flex h-9 items-center gap-2 rounded-md bg-blue-600 px-4 text-xs font-bold text-white hover:bg-blue-700"><Upload size={14} /> Add document</button>}</div> : <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">{filteredGroups.map(({ id, current, versions }) => {
        const status = getStatus(current)
        return <article key={id} className="flex min-w-0 flex-col rounded-xl border border-slate-200 bg-white p-4 shadow-2xs">
          <div className="flex items-start justify-between gap-3"><div className="flex min-w-0 items-start gap-3"><span className="rounded-lg bg-blue-50 p-2 text-blue-700">{current.category === 'Contract' ? <ShieldCheck size={19} /> : <FileText size={19} />}</span><div className="min-w-0"><h3 className="truncate text-sm font-semibold text-slate-900" title={current.name}>{current.name}</h3><p className="mt-1 text-[11px] text-slate-500">{current.category || 'Other'} · v{current.version || 1}</p></div></div><span className={`shrink-0 rounded-full px-2 py-1 text-[9px] font-semibold ${status.style}`}>{status.label}</span></div>
          <p className="mt-3 truncate text-[11px] text-slate-500">{current.type === 'Employee' ? `Employee: ${employees.find((employee) => employee.id === current.employeeId)?.name || 'Former staff'}` : 'Organization-wide record'}</p>
          <div className="mt-2 flex items-center gap-1.5 text-[10px] text-slate-400"><Clock3 size={12} /> Updated {formatDate(current.createdAt)}{current.fileSize ? ` · ${(current.fileSize / (1024 * 1024)).toFixed(1)} MB` : ''}</div>
          <div className="mt-4 flex flex-wrap gap-2 border-t border-slate-100 pt-3">
            <a href={current.url} target="_blank" rel="noreferrer" className="inline-flex h-8 flex-1 items-center justify-center gap-1.5 rounded-md bg-slate-50 px-2 text-[11px] font-semibold text-slate-700 hover:bg-slate-100"><ExternalLink size={13} /> Open file</a>
            {canShareOrganizationDocument(user, user?.orgId, current, documents) && <ShareAction
              label="Share"
              canShare={() => canShareOrganizationDocument(user, user?.orgId, current, documents)}
              buildPayload={() => buildOrganizationDocumentPayload(current, () => prepareStoredDocumentFile(current))}
            />}
            {versions.length > 1 && <button type="button" onClick={() => setHistoryGroup({ current, versions })} className="inline-flex h-8 items-center gap-1.5 rounded-md border border-slate-200 px-2 text-[11px] font-medium text-slate-600 hover:bg-slate-50"><History size={13} /> History ({versions.length})</button>}
            {canCreate && canEditDocument(current) && <button type="button" onClick={() => openNewVersion(current)} className="inline-flex h-8 items-center gap-1.5 rounded-md border border-slate-200 px-2 text-[11px] font-medium text-slate-600 hover:bg-slate-50"><Upload size={13} /> New version</button>}
            {canEditDocument(current) && <button type="button" onClick={() => handleArchive(current)} className="inline-flex h-8 items-center gap-1.5 rounded-md border border-slate-200 px-2 text-[11px] font-medium text-slate-600 hover:bg-slate-50"><Archive size={13} /> {current.status === 'Archived' ? 'Restore' : 'Archive'}</button>}
            {canDeleteDocument(current) && <button type="button" aria-label={`Delete ${current.name}`} onClick={() => handleDelete(current)} className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-slate-200 text-slate-500 hover:border-rose-200 hover:bg-rose-50 hover:text-rose-700"><Trash2 size={13} /></button>}
          </div>
        </article>
      })}</div>}

      <p className="text-[11px] leading-5 text-slate-500">Uploaded documents are stored in the organisation’s Firebase Storage area. Existing HTTPS URL records remain supported. Access to stored files follows the current Storage rules; this screen does not replace a server-side confidential-record policy.</p>

      <Modal isOpen={showUploadModal} onClose={() => { if (!saving) setShowUploadModal(false) }} title={versionTarget ? `Add a version · ${versionTarget.name}` : 'Add document'} size="md">
        <form onSubmit={handleSave} className="space-y-4 bg-white p-5 sm:p-6">
          {actionError && <p role="alert" className="rounded-md border border-rose-200 bg-rose-50 p-3 text-xs text-rose-800">{actionError}</p>}
          {!versionTarget && <div><label htmlFor="document-name" className={labelClass}>Document name <span className="text-rose-600">*</span></label><input id="document-name" required maxLength={120} value={uploadForm.name} onChange={(event) => setUploadForm({ ...uploadForm, name: event.target.value })} className={inputClass} placeholder="e.g. Employment handbook" /></div>}
          <div className="grid gap-4 sm:grid-cols-2"><div><label htmlFor="document-category" className={labelClass}>Category</label><select id="document-category" value={uploadForm.category} onChange={(event) => setUploadForm({ ...uploadForm, category: event.target.value })} className={inputClass}><option>Policy</option><option>Contract</option><option>ID Proof</option><option>Certification</option><option>Payroll</option><option>Other</option></select></div><div><label htmlFor="document-expiry" className={labelClass}>Review / expiry date</label><input id="document-expiry" type="date" value={uploadForm.expiresOn} onChange={(event) => setUploadForm({ ...uploadForm, expiresOn: event.target.value })} className={inputClass} /></div></div>
          {activeSub === 'employee' && <div><label htmlFor="document-employee" className={labelClass}>Employee dossier <span className="text-rose-600">*</span></label><select id="document-employee" required value={uploadForm.employeeId} onChange={(event) => setUploadForm({ ...uploadForm, employeeId: event.target.value })} className={inputClass}><option value="">Choose employee…</option>{employees.map((employee) => <option key={employee.id} value={employee.id}>{employee.name}{employee.empCode ? ` (${employee.empCode})` : ''}</option>)}</select></div>}
          {!versionTarget && <div className="space-y-3"><div role="radiogroup" aria-label="Document source" className="flex flex-wrap gap-4"><label className="inline-flex items-center gap-2 text-xs font-medium text-slate-700"><input type="radio" name="document-source" checked={source === 'file'} onChange={() => setSource('file')} /> Upload a file</label><label className="inline-flex items-center gap-2 text-xs font-medium text-slate-700"><input type="radio" name="document-source" checked={source === 'url'} onChange={() => setSource('url')} /> Existing HTTPS link</label></div>{source === 'file' ? <div><label htmlFor="document-file" className={labelClass}>Select file <span className="text-rose-600">*</span></label><input id="document-file" required type="file" accept=".pdf,.png,.jpg,.jpeg,.webp,.doc,.docx,.xls,.xlsx" onChange={(event) => setSelectedFile(event.target.files?.[0] || null)} className="block min-h-9 w-full rounded-md border border-slate-200 bg-white p-2 text-xs text-slate-700 file:mr-3 file:rounded file:border-0 file:bg-blue-50 file:px-3 file:py-1 file:text-xs file:font-semibold file:text-blue-700" /><p className="mt-1 text-[10px] text-slate-500">PDF, common images, Word or Excel · up to 25 MB.</p></div> : <div><label htmlFor="document-url" className={labelClass}>Secure HTTPS URL <span className="text-rose-600">*</span></label><input id="document-url" required type="url" value={uploadForm.url} onChange={(event) => setUploadForm({ ...uploadForm, url: event.target.value })} className={inputClass} placeholder="https://…" /></div>}</div>}
          {versionTarget && <div><label htmlFor="document-version-file" className={labelClass}>New version file <span className="text-rose-600">*</span></label><input id="document-version-file" required type="file" accept=".pdf,.png,.jpg,.jpeg,.webp,.doc,.docx,.xls,.xlsx" onChange={(event) => setSelectedFile(event.target.files?.[0] || null)} className="block min-h-9 w-full rounded-md border border-slate-200 bg-white p-2 text-xs text-slate-700 file:mr-3 file:rounded file:border-0 file:bg-blue-50 file:px-3 file:py-1 file:text-xs file:font-semibold file:text-blue-700" /><p className="mt-1 text-[10px] text-slate-500">A new immutable version entry will be added; earlier versions remain listed in history.</p></div>}
          <div className="flex justify-end gap-2 border-t border-slate-100 pt-4"><button type="button" disabled={saving} onClick={() => setShowUploadModal(false)} className="h-9 rounded-md border border-slate-200 px-4 text-sm font-medium text-slate-700">Cancel</button><button type="submit" disabled={saving || !canCreate} className={primaryClass}>{saving ? 'Saving…' : versionTarget ? 'Upload version' : 'Save document'}</button></div>
        </form>
      </Modal>

      <Modal isOpen={Boolean(historyGroup)} onClose={() => setHistoryGroup(null)} title={`Version history · ${historyGroup?.current?.name || ''}`} size="md">
        <div className="max-h-[65vh] space-y-2 overflow-y-auto bg-white p-5">{historyGroup?.versions?.map((version) => <div key={version.id} className="flex flex-col gap-2 rounded-lg border border-slate-200 p-3 sm:flex-row sm:items-center sm:justify-between"><div className="min-w-0"><p className="text-sm font-semibold text-slate-800">Version {version.version || 1}{version.fileName ? ` · ${version.fileName}` : ''}</p><p className="mt-1 text-[11px] text-slate-500">Added {formatDate(version.createdAt)} · {version.status || 'Active'}</p></div><div className="flex shrink-0 items-center gap-2"><a href={version.url} target="_blank" rel="noreferrer" className="inline-flex h-8 items-center gap-1 rounded-md border border-slate-200 px-2 text-[11px] font-medium text-slate-700 hover:bg-slate-50"><ExternalLink size={12} /> Open</a>{canDeleteDocument(version) && <button type="button" onClick={() => handleDelete(version)} aria-label={`Delete version ${version.version || 1}`} className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-slate-200 text-slate-500 hover:text-rose-700"><Trash2 size={12} /></button>}</div></div>)}</div>
      </Modal>
    </div>
  )
}
