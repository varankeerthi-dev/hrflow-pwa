const ALLOWED_EXTENSIONS = new Set(['pdf', 'png', 'jpg', 'jpeg', 'webp', 'doc', 'docx', 'xls', 'xlsx'])
export const MAX_DOCUMENT_UPLOAD_BYTES = 25 * 1024 * 1024

export function getDocumentExtension(fileName = '') {
  return String(fileName).split('.').pop()?.toLowerCase() || ''
}

export function validateDocumentFile(file) {
  if (!file) return 'Choose a file to upload.'
  if (!ALLOWED_EXTENSIONS.has(getDocumentExtension(file.name))) return 'Supported files: PDF, PNG, JPG, WebP, DOC, DOCX, XLS, and XLSX.'
  if (file.size > MAX_DOCUMENT_UPLOAD_BYTES) return 'Files must be 25 MB or smaller.'
  if (file.size <= 0) return 'The selected file is empty.'
  return ''
}

export function groupDocumentVersions(documents = []) {
  const groups = new Map()
  documents.forEach((document) => {
    const groupId = document.documentGroupId || document.id
    const group = groups.get(groupId) || []
    group.push(document)
    groups.set(groupId, group)
  })
  return [...groups.entries()].map(([id, versions]) => {
    const ordered = [...versions].sort((a, b) => (Number(b.version) || 1) - (Number(a.version) || 1))
    return { id, current: ordered[0], versions: ordered }
  }).sort((a, b) => {
    const aDate = a.current.createdAt?.toMillis?.() || new Date(a.current.createdAt || 0).getTime() || 0
    const bDate = b.current.createdAt?.toMillis?.() || new Date(b.current.createdAt || 0).getTime() || 0
    return bDate - aDate
  })
}
