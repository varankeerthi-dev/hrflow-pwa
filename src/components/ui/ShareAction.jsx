import React, { useEffect, useId, useState } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import { AlertTriangle, Copy, Download, FileText, Mail, MessageCircle, Share2, X } from 'lucide-react'
import {
  buildMailtoUrl,
  buildWhatsAppUrl,
  composeShareMessage,
  isValidEmailRecipient,
  normalizeWhatsAppPhone,
  requestNativeShare,
  sanitizeShareFileName,
} from '../../lib/share'

const formatFileSize = (size) => {
  const bytes = Number(size) || 0
  if (bytes < 1024) return `${bytes} bytes`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function isBlob(value) {
  return typeof Blob !== 'undefined' && value instanceof Blob
}

function normalizePreparedFile(value, payload) {
  if (!isBlob(value)) throw new Error('File preparation did not return a Blob.')
  const name = sanitizeShareFileName(value.name || payload.fileName, 'shared-file')
  const mime = value.type || payload.fileMime || 'application/octet-stream'
  const file = typeof File !== 'undefined'
    ? (value instanceof File ? value : new File([value], name, { type: mime }))
    : null
  return { file, blob: value, name, mime, size: value.size }
}

function canUseNativeShare(payload, preparedFile) {
  if (typeof navigator === 'undefined' || typeof navigator.share !== 'function') return false
  if (!payload?.fileBuilder) return true
  if (!preparedFile?.file || typeof navigator.canShare !== 'function') return false
  try {
    return navigator.canShare({ files: [preparedFile.file] })
  } catch {
    return false
  }
}

function downloadPreparedFile(preparedFile) {
  if (!preparedFile?.blob || typeof URL === 'undefined' || typeof URL.createObjectURL !== 'function') {
    throw new Error('File download is unavailable in this browser.')
  }
  const objectUrl = URL.createObjectURL(preparedFile.blob)
  const link = document.createElement('a')
  link.href = objectUrl
  link.download = sanitizeShareFileName(preparedFile.name)
  link.rel = 'noopener'
  link.style.display = 'none'
  document.body.appendChild(link)
  link.click()
  link.remove()
  // Keep the URL alive briefly so the browser can consume the download handoff.
  window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1500)
}

export default function ShareAction({
  buildPayload,
  canShare,
  label = 'Share',
  className = '',
  disabled = false,
}) {
  const ids = useId()
  const [open, setOpen] = useState(false)
  const [session, setSession] = useState(null)
  const [recipient, setRecipient] = useState('')
  const [channel, setChannel] = useState('email')
  const [subject, setSubject] = useState('')
  const [message, setMessage] = useState('')
  const [selectedFields, setSelectedFields] = useState(new Set())
  const [confirmed, setConfirmed] = useState(false)
  const [fieldError, setFieldError] = useState('')
  const [status, setStatus] = useState(null)
  const [filePreviewUrl, setFilePreviewUrl] = useState('')

  useEffect(() => {
    const blob = session?.preparedFile?.blob
    const mime = session?.preparedFile?.mime || session?.payload?.fileMime || ''
    if (!blob || !['application/pdf', 'image/png', 'image/jpeg', 'image/webp'].includes(mime) || typeof URL === 'undefined' || typeof URL.createObjectURL !== 'function') {
      setFilePreviewUrl('')
      return undefined
    }
    const previewUrl = URL.createObjectURL(blob)
    setFilePreviewUrl(previewUrl)
    return () => URL.revokeObjectURL(previewUrl)
  }, [session?.preparedFile?.blob, session?.preparedFile?.mime, session?.payload?.fileMime])

  const hasPermission = () => {
    try { return Boolean(canShare?.()) } catch { return false }
  }

  const preparePayload = () => {
    const payload = buildPayload?.()
    if (!payload || !Array.isArray(payload.fields) || !payload.channels?.length) return null
    return payload
  }

  const openShare = (event) => {
    if (!hasPermission()) { event.preventDefault(); return }
    const payload = preparePayload()
    if (!payload) { event.preventDefault(); return }
    const selected = new Set(payload.fields.filter((field) => field.selected || field.required).map((field) => field.key))
    setSession({ payload, preparedFile: null, fileLoading: Boolean(payload.fileBuilder), fileError: '' })
    setSelectedFields(selected)
    setMessage(composeShareMessage(payload, selected))
    setSubject(payload.subject || '')
    setRecipient('')
    setChannel(payload.channels.includes('email') ? 'email' : payload.channels[0])
    setConfirmed(false)
    setFieldError('')
    setStatus(null)
    if (payload.fileBuilder) {
      try {
        const fileResult = payload.fileBuilder()
        Promise.resolve(fileResult).then((value) => {
          const preparedFile = normalizePreparedFile(value, payload)
          setSession((current) => current?.payload.revisionKey === payload.revisionKey
            ? { ...current, preparedFile, fileLoading: false, fileError: '' }
            : current)
        }).catch(() => {
          setSession((current) => current?.payload.revisionKey === payload.revisionKey
            ? { ...current, fileLoading: false, fileError: 'The file could not be prepared. No file was shared or downloaded.' }
            : current)
        })
      } catch {
        setSession((current) => current?.payload.revisionKey === payload.revisionKey
          ? { ...current, fileLoading: false, fileError: 'The file could not be prepared. No file was shared or downloaded.' }
          : current)
      }
    }
  }

  const closeShare = (nextOpen) => {
    setOpen(nextOpen)
    if (!nextOpen) {
      // Recipient and message remain only in this short-lived dialog session.
      setSession(null)
      setRecipient('')
      setSubject('')
      setMessage('')
      setSelectedFields(new Set())
      setConfirmed(false)
      setFieldError('')
      setStatus(null)
    }
  }

  const setSelectedField = (field, checked) => {
    if (field.required) return
    const next = new Set(selectedFields)
    if (checked) next.add(field.key)
    else next.delete(field.key)
    setSelectedFields(next)
    setMessage(composeShareMessage(session?.payload, next))
    setConfirmed(false)
    setStatus(null)
  }

  const freshPayload = () => {
    if (!hasPermission()) return { error: 'Your Share permission is no longer available. No handoff was started.' }
    const latest = preparePayload()
    if (!latest) return { error: 'This content is no longer eligible to share. No handoff was started.' }
    if (latest.revisionKey !== session?.payload?.revisionKey) {
      return { error: 'This content changed after the preview opened. Close Share and reopen it to review the current version.' }
    }
    if (latest.fileRequired && !session?.preparedFile?.blob) {
      return { error: session?.fileError || 'The required file is not ready. No handoff was started.' }
    }
    return { payload: latest }
  }

  const validateRecipient = () => {
    if (channel === 'email' && !isValidEmailRecipient(recipient)) {
      setFieldError('Enter one valid email address. Multiple recipients are not supported.')
      return false
    }
    if (channel === 'whatsapp' && !normalizeWhatsAppPhone(recipient)) {
      setFieldError('Enter one phone number with its country code, such as +14155550123.')
      return false
    }
    setFieldError('')
    return true
  }

  const validateConfirmation = () => {
    if (!session?.payload?.requireConfirmation) return true
    if (confirmed) return true
    setFieldError('Review the recipient and message, then confirm before continuing.')
    return false
  }

  const validateHandoff = ({ requireRecipient = true } = {}) => {
    const fresh = freshPayload()
    if (fresh.error) {
      setStatus({ tone: 'error', message: fresh.error })
      return false
    }
    if (requireRecipient && channel !== 'system' && !validateRecipient()) return false
    if (!validateConfirmation()) return false
    setFieldError('')
    return true
  }

  const handleComposerClick = (event, targetChannel) => {
    if (targetChannel !== channel || !validateHandoff()) {
      event.preventDefault()
      return
    }
    setStatus({
      tone: 'status',
      message: targetChannel === 'email'
        ? 'Email draft requested. HRFlow cannot confirm whether it opened or was sent; HRFlow did not send this message.'
        : 'WhatsApp chat requested. HRFlow cannot confirm whether it opened or was sent; HRFlow did not send this message.',
    })
  }

  const handleNativeShare = async () => {
    if (!validateHandoff()) return
    const result = await requestNativeShare(navigator, {
      title: session.payload.title,
      text: message,
      file: session.preparedFile?.file || undefined,
    })
    if (result.outcome === 'handoff-requested') {
      setStatus({ tone: 'status', message: 'System share sheet completed. HRFlow cannot confirm whether a recipient received or sent this content.' })
    } else if (result.outcome === 'cancelled') {
      setStatus({ tone: 'status', message: 'The system share sheet was closed. HRFlow did not send anything.' })
    } else if (result.outcome === 'unsupported') {
      setStatus({ tone: 'error', message: 'System sharing is not supported for this content here. Use the visible copy or download fallback.' })
    } else {
      setStatus({ tone: 'error', message: 'The system share could not be opened. Your preview is still available; no automatic retry was started.' })
    }
  }

  const handleCopy = async () => {
    if (!validateHandoff({ requireRecipient: false })) return
    try {
      if (typeof navigator === 'undefined' || !navigator.clipboard?.writeText) throw new Error('Clipboard unavailable')
      await navigator.clipboard.writeText(message)
      setStatus({ tone: 'status', message: 'Message copied. It was not sent by HRFlow.' })
    } catch {
      setStatus({ tone: 'error', message: 'Clipboard access is unavailable. Select the message above and copy it manually.' })
    }
  }

  const handleDownload = () => {
    if (!validateHandoff({ requireRecipient: false })) return
    try {
      downloadPreparedFile(session?.preparedFile)
      setStatus({ tone: 'status', message: 'File download requested. HRFlow did not send or attach the file.' })
    } catch {
      setStatus({ tone: 'error', message: 'The file could not be downloaded. The preview remains available; no automatic retry was started.' })
    }
  }

  const nativeShareAvailable = canUseNativeShare(session?.payload, session?.preparedFile)
  const emailUrl = channel === 'email' && isValidEmailRecipient(recipient)
    ? (() => { try { return buildMailtoUrl({ recipient, subject, body: message }) } catch { return undefined } })()
    : undefined
  const whatsappUrl = channel === 'whatsapp' && normalizeWhatsAppPhone(recipient)
    ? (() => { try { return buildWhatsAppUrl({ recipient, body: message }) } catch { return undefined } })()
    : undefined

  if (!buildPayload || !canShare) return null

  return (
    <Dialog.Root open={open} onOpenChange={closeShare}>
      <Dialog.Trigger asChild>
        <button
          type="button"
          onClick={openShare}
          disabled={disabled}
          className={className || 'inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-3.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 active:scale-[0.96] transition-[color,background-color,border-color,box-shadow,transform] duration-150 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 disabled:cursor-not-allowed disabled:opacity-50 cursor-pointer'}
        >
          <Share2 size={15} aria-hidden="true" />
          <span>{label}</span>
        </button>
      </Dialog.Trigger>

      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[1200] bg-black/60 backdrop-blur-[1px]" />
        <Dialog.Content className="fixed inset-x-0 bottom-0 z-[1201] flex max-h-[92dvh] w-full flex-col overflow-hidden rounded-t-2xl border border-slate-200 bg-white text-slate-900 shadow-2xl focus:outline-none sm:inset-auto sm:left-1/2 sm:top-1/2 sm:w-[min(680px,calc(100vw-2rem))] sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-2xl">
          <header className="flex shrink-0 items-start justify-between gap-4 border-b border-slate-200 bg-white px-5 py-4 sm:px-6">
            <div className="min-w-0">
              <Dialog.Title className="font-heading text-lg font-bold tracking-tight text-slate-900">Review before sharing</Dialog.Title>
              <Dialog.Description className="mt-1 text-xs leading-5 text-slate-600">{session?.payload?.sourceTitle || 'Review the selected content and recipient.'} HRFlow prepares the handoff; it does not send or confirm delivery.</Dialog.Description>
            </div>
            <Dialog.Close asChild>
              <button type="button" aria-label="Close Share preview" className="inline-flex min-h-11 min-w-11 h-11 w-11 shrink-0 items-center justify-center rounded-xl text-slate-500 hover:text-slate-800 hover:bg-slate-100 active:scale-[0.96] transition-[color,background-color,transform] duration-150 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 cursor-pointer"><X size={18} aria-hidden="true" /></button>
            </Dialog.Close>
          </header>

          <div className="min-h-0 flex-1 space-y-4 overflow-y-auto bg-white p-5 sm:p-6">
            {session?.payload?.preview && <p className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5 text-xs leading-5 text-slate-700">{session.payload.preview}</p>}
            {session?.payload?.notice && <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 text-xs leading-5 text-amber-950"><AlertTriangle size={15} className="mt-0.5 shrink-0" aria-hidden="true" /><p>{session.payload.notice}</p></div>}

            {!!session?.payload?.fields?.some((field) => !field.required) && (
              <fieldset className="rounded-lg border border-slate-200 p-3">
                <legend className="px-1 text-xs font-semibold text-slate-800">Optional content to include</legend>
                <div className="space-y-2">
                  {session.payload.fields.filter((field) => !field.required).map((field) => (
                    <label key={field.key} className="flex min-h-11 cursor-pointer items-center gap-2 text-sm text-slate-700">
                      <input type="checkbox" checked={selectedFields.has(field.key)} onChange={(event) => setSelectedField(field, event.target.checked)} className="h-4 w-4 rounded border-slate-300 text-blue-600 focus-visible:ring-2 focus-visible:ring-blue-600" />
                      <span>{field.label}</span>
                    </label>
                  ))}
                </div>
              </fieldset>
            )}

            {session?.payload?.fileBuilder && (
              <section aria-label="File being shared" className="rounded-lg border border-slate-200 bg-white p-3">
                <div className="flex items-start gap-3">
                  <FileText size={18} className="mt-0.5 shrink-0 text-blue-700" aria-hidden="true" />
                  <div className="min-w-0 flex-1">
                    <p className="break-all text-sm font-semibold text-slate-800">{session.preparedFile?.name || session.payload.fileName || 'Preparing file…'}</p>
                    {session.fileLoading ? <p role="status" className="mt-1 text-xs text-slate-500">Preparing the current file…</p> : session.preparedFile ? <p className="mt-1 text-xs text-slate-500">{session.preparedFile.mime || session.payload.fileMime || 'File'} · {formatFileSize(session.preparedFile.size)}</p> : <p role="alert" className="mt-1 text-xs text-rose-700">{session.fileError || 'File is unavailable.'}</p>}
                  </div>
                </div>
                {session.payload.fileRequired && <p className="mt-2 text-xs leading-5 text-slate-600">The email and WhatsApp drafts below contain text only; the file will not be attached. Download it for manual attachment, or use the system file chooser when available.</p>}
                {session.preparedFile && filePreviewUrl && session.preparedFile.mime === 'application/pdf' && <iframe title={`Preview of ${session.preparedFile.name}`} src={filePreviewUrl} referrerPolicy="no-referrer" className="mt-3 h-64 w-full rounded-md border border-slate-200 bg-slate-50" />}
                {session.preparedFile && filePreviewUrl && session.preparedFile.mime.startsWith('image/') && <img src={filePreviewUrl} alt={`Preview of ${session.preparedFile.name}`} className="mt-3 max-h-64 max-w-full rounded-md border border-slate-200 object-contain outline outline-1 -outline-offset-1 outline-black/10 dark:outline-white/10" />}
                {session.preparedFile && !filePreviewUrl && <p className="mt-2 text-xs leading-5 text-slate-600">This file type cannot be previewed inline. Review it from its existing document screen before sharing.</p>}
              </section>
            )}

            <fieldset className="space-y-2">
              <legend className="mb-2 text-xs font-semibold text-slate-800">Choose a handoff</legend>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3" role="radiogroup" aria-label="Handoff channel">
                {session?.payload?.channels?.includes('email') && <label className={`flex min-h-11 cursor-pointer items-center gap-2 rounded-xl border px-3 text-sm font-medium active:scale-[0.96] transition-[color,background-color,border-color,transform] duration-150 ease-out ${channel === 'email' ? 'border-blue-500 bg-blue-50 text-blue-900' : 'border-slate-200 bg-white text-slate-700'}`}><input type="radio" name={`${ids}-channel`} value="email" checked={channel === 'email'} onChange={() => { setChannel('email'); setRecipient(''); setConfirmed(false); setFieldError(''); setStatus(null) }} className="h-4 w-4 accent-blue-600 focus-visible:ring-2 focus-visible:ring-blue-600" /><Mail size={15} aria-hidden="true" /> Email</label>}
                {session?.payload?.channels?.includes('whatsapp') && <label className={`flex min-h-11 cursor-pointer items-center gap-2 rounded-xl border px-3 text-sm font-medium active:scale-[0.96] transition-[color,background-color,border-color,transform] duration-150 ease-out ${channel === 'whatsapp' ? 'border-blue-500 bg-blue-50 text-blue-900' : 'border-slate-200 bg-white text-slate-700'}`}><input type="radio" name={`${ids}-channel`} value="whatsapp" checked={channel === 'whatsapp'} onChange={() => { setChannel('whatsapp'); setRecipient(''); setConfirmed(false); setFieldError(''); setStatus(null) }} className="h-4 w-4 accent-blue-600 focus-visible:ring-2 focus-visible:ring-blue-600" /><MessageCircle size={15} aria-hidden="true" /> WhatsApp</label>}
                {session?.payload?.channels?.includes('system') && nativeShareAvailable && <label className={`flex min-h-11 cursor-pointer items-center gap-2 rounded-xl border px-3 text-sm font-medium active:scale-[0.96] transition-[color,background-color,border-color,transform] duration-150 ease-out ${channel === 'system' ? 'border-blue-500 bg-blue-50 text-blue-900' : 'border-slate-200 bg-white text-slate-700'}`}><input type="radio" name={`${ids}-channel`} value="system" checked={channel === 'system'} onChange={() => { setChannel('system'); setRecipient(''); setConfirmed(false); setFieldError(''); setStatus(null) }} className="h-4 w-4 accent-blue-600 focus-visible:ring-2 focus-visible:ring-blue-600" /><Share2 size={15} aria-hidden="true" /> {session.payload.fileBuilder ? 'Share file with an app' : 'Other app'}</label>}
              </div>
            </fieldset>

            {channel !== 'system' && (
              <div>
                <label htmlFor={`${ids}-recipient`} className="mb-1.5 block text-sm font-medium text-slate-800">{channel === 'email' ? 'One recipient email' : 'One phone number with country code'}</label>
                <input
                  id={`${ids}-recipient`}
                  type={channel === 'email' ? 'email' : 'tel'}
                  inputMode={channel === 'email' ? 'email' : 'tel'}
                  autoComplete="off"
                  spellCheck="false"
                  value={recipient}
                  onChange={(event) => { setRecipient(event.target.value); setFieldError(''); setConfirmed(false); setStatus(null) }}
                  placeholder={channel === 'email' ? 'name@example.com' : '+14155550123'}
                  className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-800 outline-none focus-visible:ring-2 focus-visible:ring-blue-600 placeholder:text-slate-400"
                  aria-invalid={Boolean(fieldError && (channel === 'email' ? !isValidEmailRecipient(recipient) : !normalizeWhatsAppPhone(recipient)))}
                  aria-describedby={`${ids}-recipient-help${fieldError ? ` ${ids}-error` : ''}`}
                />
                <p id={`${ids}-recipient-help`} className="mt-1 text-xs text-slate-500">The address or number is not verified. Only one recipient is supported; HRFlow does not read device contacts.</p>
              </div>
            )}

            {channel === 'email' && (
              <div>
                <label htmlFor={`${ids}-subject`} className="mb-1.5 block text-sm font-medium text-slate-800">Email subject</label>
                <input id={`${ids}-subject`} type="text" maxLength={200} value={subject} onChange={(event) => { setSubject(event.target.value); setConfirmed(false); setStatus(null) }} className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-800 outline-none focus-visible:ring-2 focus-visible:ring-blue-600" />
              </div>
            )}

            <div>
              <label htmlFor={`${ids}-message`} className="mb-1.5 block text-sm font-medium text-slate-800">{channel === 'whatsapp' ? 'WhatsApp message' : 'Message preview'}</label>
              <textarea id={`${ids}-message`} rows={6} maxLength={10000} value={message} onChange={(event) => { setMessage(event.target.value); setConfirmed(false); setStatus(null) }} className="w-full resize-y rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm leading-5 text-slate-800 outline-none focus-visible:ring-2 focus-visible:ring-blue-600" />
            </div>

            {session?.payload?.requireConfirmation && (
              <label className="flex cursor-pointer items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs leading-5 text-amber-950">
                <input type="checkbox" checked={confirmed} onChange={(event) => { setConfirmed(event.target.checked); setFieldError('') }} className="mt-0.5 h-4 w-4 shrink-0 rounded border-amber-400 text-blue-600 focus-visible:ring-2 focus-visible:ring-blue-600" />
                <span>I reviewed the {session.payload.sourceTitle} and confirm it may leave HRFlow. For any external handoff, I will verify and use one authorized recipient in the selected app.</span>
              </label>
            )}

            {fieldError && <p id={`${ids}-error`} role="alert" className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-xs leading-5 text-rose-800">{fieldError}</p>}
            {status && <p role={status.tone === 'error' ? 'alert' : 'status'} aria-live="polite" className={`rounded-md border px-3 py-2 text-xs leading-5 ${status.tone === 'error' ? 'border-rose-200 bg-rose-50 text-rose-800' : 'border-blue-200 bg-blue-50 text-blue-900'}`}>{status.message}</p>}
          </div>

          <footer className="flex shrink-0 flex-col gap-2 border-t border-slate-200 bg-white px-5 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-6">
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={handleCopy} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-3 text-sm font-medium text-slate-700 hover:bg-slate-50 active:scale-[0.96] transition-[color,background-color,border-color,box-shadow,transform] duration-150 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 cursor-pointer"><Copy size={14} aria-hidden="true" /> Copy message</button>
              {session?.payload?.fileBuilder && <button type="button" onClick={handleDownload} disabled={!session.preparedFile?.blob || session.fileLoading} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-3 text-sm font-medium text-slate-700 hover:bg-slate-50 active:scale-[0.96] transition-[color,background-color,border-color,box-shadow,transform] duration-150 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 disabled:cursor-not-allowed disabled:opacity-50 cursor-pointer"><Download size={14} aria-hidden="true" /> Download file</button>}
            </div>
            <div className="flex flex-wrap justify-end gap-2">
              <Dialog.Close asChild><button type="button" className="inline-flex min-h-11 items-center justify-center rounded-xl border border-slate-200 bg-white px-4 text-sm font-medium text-slate-700 hover:bg-slate-50 active:scale-[0.96] transition-[color,background-color,border-color,box-shadow,transform] duration-150 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 cursor-pointer">Cancel</button></Dialog.Close>
              {channel === 'email' && <a href={emailUrl || '#'} target="_blank" rel="noopener noreferrer" onClick={(event) => handleComposerClick(event, 'email')} className={`inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 text-sm font-bold text-white shadow-sm hover:bg-blue-700 active:scale-[0.96] transition-[background-color,box-shadow,transform] duration-150 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2 cursor-pointer ${!emailUrl ? 'opacity-50' : ''}`}><Mail size={15} aria-hidden="true" /> Open email draft</a>}
              {channel === 'whatsapp' && <a href={whatsappUrl || '#'} target="_blank" rel="noopener noreferrer" onClick={(event) => handleComposerClick(event, 'whatsapp')} className={`inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 text-sm font-bold text-white shadow-sm hover:bg-blue-700 active:scale-[0.96] transition-[background-color,box-shadow,transform] duration-150 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2 cursor-pointer ${!whatsappUrl ? 'opacity-50' : ''}`}><MessageCircle size={15} aria-hidden="true" /> Open WhatsApp</a>}
              {channel === 'system' && nativeShareAvailable && <button type="button" onClick={handleNativeShare} disabled={Boolean(session?.payload?.fileRequired && (!session.preparedFile?.file || session.fileLoading))} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 text-sm font-bold text-white shadow-sm hover:bg-blue-700 active:scale-[0.96] transition-[background-color,box-shadow,transform] duration-150 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 cursor-pointer"><Share2 size={15} aria-hidden="true" /> {session?.payload?.fileBuilder ? 'Share file' : 'Open share sheet'}</button>}
            </div>
          </footer>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
