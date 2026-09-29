import React, { useCallback, useEffect, useState } from 'react'
import { arrayRemove, arrayUnion, collection, doc, getDocs, increment, orderBy, query, runTransaction, serverTimestamp, writeBatch } from 'firebase/firestore'
import { Award, Check, Lightbulb, Megaphone, MessageSquare, Plus, Send, ThumbsUp, X } from 'lucide-react'
import { useAuth } from '../../hooks/useAuth'
import { db } from '../../lib/firebase'
import { isPostSupportedBy, normalizeReplyText, validateReplyText } from '../../lib/engagementActions'
import Spinner from '../ui/Spinner'
import Modal from '../ui/Modal'

const SECTIONS = [
  { id: 'announcements', label: 'Announcements', icon: <Megaphone size={16} /> },
  { id: 'recognize', label: 'Recognize', icon: <Award size={16} /> },
  { id: 'idea', label: 'Idea Box', icon: <Lightbulb size={16} /> },
  { id: 'issues', label: 'Issues', icon: <MessageSquare size={16} /> },
]
const baseCollection = (orgId) => collection(db, 'organisations', orgId, 'engagement')
const repliesCollection = (orgId, postId) => collection(db, 'organisations', orgId, 'engagement', postId, 'replies')
const auditCollection = (orgId) => collection(db, 'organisations', orgId, 'audit_logs')
const isAdmin = (user) => user?.role?.toLowerCase() === 'admin'
const inputClass = 'h-9 w-full rounded-md border border-slate-200 bg-white px-3 py-1 text-sm text-slate-800 placeholder:text-slate-400 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-blue-600'
const dateLabel = (value) => {
  const date = value?.toDate?.() || (value ? new Date(value) : null)
  return date && !Number.isNaN(date.getTime()) ? new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(date) : 'Just now'
}

export default function EngagementTab() {
  const { user } = useAuth()
  const [activeSub, setActiveSub] = useState('announcements')
  const [loading, setLoading] = useState(false)
  const [posts, setPosts] = useState([])
  const [showAddModal, setShowAddModal] = useState(false)
  const [replyingPost, setReplyingPost] = useState(null)
  const [replies, setReplies] = useState([])
  const [loadingReplies, setLoadingReplies] = useState(false)
  const [replyDraft, setReplyDraft] = useState('')
  const [form, setForm] = useState({ title: '', content: '' })
  const [actionError, setActionError] = useState('')
  const [notice, setNotice] = useState('')
  const [busyPostId, setBusyPostId] = useState('')
  const [saving, setSaving] = useState(false)

  const permissions = user?.permissions?.Engagement || {}
  const canView = Boolean(user && (isAdmin(user) || permissions.view || permissions.create || permissions.edit || permissions.full))
  const canCreate = Boolean(user && (isAdmin(user) || permissions.create || permissions.full))
  const canRespond = canView

  const fetchPosts = useCallback(async () => {
    if (!user?.orgId || !canView) return
    setLoading(true)
    setActionError('')
    try {
      const snapshot = await getDocs(query(baseCollection(user.orgId), orderBy('createdAt', 'desc')))
      setPosts(snapshot.docs.map((item) => ({ id: item.id, ...item.data() })))
    } catch (error) {
      setActionError(error.message || 'Could not load engagement posts.')
    } finally {
      setLoading(false)
    }
  }, [user?.orgId, canView])

  useEffect(() => { fetchPosts() }, [fetchPosts])

  const filteredPosts = posts.filter((post) => post.type === activeSub)

  const handleSubmit = async (event) => {
    event.preventDefault()
    const content = normalizeReplyText(form.content)
    if (!content) { setActionError('Add a message before creating a post.'); return }
    if (!canCreate) { setActionError('You do not have permission to create engagement posts.'); return }
    setSaving(true)
    setActionError('')
    try {
      const batch = writeBatch(db)
      const postRef = doc(baseCollection(user.orgId))
      batch.set(postRef, {
        title: form.title.trim(),
        content,
        type: activeSub,
        author: user.name || user.email || 'Employee',
        authorId: user.uid,
        createdAt: serverTimestamp(),
        supporterIds: [],
        replyCount: 0,
      })
      batch.set(doc(auditCollection(user.orgId)), {
        module: 'Engagement', action: 'CREATE', details: `Created ${activeSub} post`,
        performedBy: user.name || user.email || 'Employee', performedById: user.uid || null, timestamp: serverTimestamp(),
      })
      await batch.commit()
      setShowAddModal(false)
      setForm({ title: '', content: '' })
      setNotice('Your post was created.')
      await fetchPosts()
    } catch (error) {
      setActionError(error.message || 'Could not create the post.')
    } finally {
      setSaving(false)
    }
  }

  const toggleSupport = async (post) => {
    if (!user?.uid || !user?.orgId || !canRespond) return
    setBusyPostId(post.id)
    setActionError('')
    setNotice('')
    try {
      const postRef = doc(baseCollection(user.orgId), post.id)
      const auditRef = doc(auditCollection(user.orgId))
      let nextSupported = false
      await runTransaction(db, async (transaction) => {
        const current = await transaction.get(postRef)
        if (!current.exists()) throw new Error('This post is no longer available.')
        const ids = current.data().supporterIds || []
        nextSupported = !ids.includes(user.uid)
        transaction.update(postRef, { supporterIds: nextSupported ? arrayUnion(user.uid) : arrayRemove(user.uid) })
        transaction.set(auditRef, {
          module: 'Engagement', action: 'UPDATE', details: `${nextSupported ? 'Supported' : 'Removed support from'} engagement post ${post.id}`,
          performedBy: user.name || user.email || 'Employee', performedById: user.uid, timestamp: serverTimestamp(),
        })
      })
      await fetchPosts()
      setNotice(nextSupported ? 'Support added.' : 'Support removed.')
    } catch (error) {
      setActionError(error.message || 'Could not update support.')
    } finally {
      setBusyPostId('')
    }
  }

  const openReplies = async (post) => {
    setReplyingPost(post)
    setReplies([])
    setReplyDraft('')
    setActionError('')
    setLoadingReplies(true)
    try {
      const snapshot = await getDocs(query(repliesCollection(user.orgId, post.id), orderBy('createdAt', 'asc')))
      setReplies(snapshot.docs.map((item) => ({ id: item.id, ...item.data() })))
    } catch (error) {
      setActionError(error.message || 'Could not load replies.')
    } finally {
      setLoadingReplies(false)
    }
  }

  const handleReply = async (event) => {
    event.preventDefault()
    const validationError = validateReplyText(replyDraft)
    if (validationError) { setActionError(validationError); return }
    if (!replyingPost || !canRespond) return
    setSaving(true)
    setActionError('')
    try {
      const batch = writeBatch(db)
      const replyRef = doc(repliesCollection(user.orgId, replyingPost.id))
      const parentRef = doc(baseCollection(user.orgId), replyingPost.id)
      batch.set(replyRef, {
        content: normalizeReplyText(replyDraft),
        author: user.name || user.email || 'Employee',
        authorId: user.uid,
        createdAt: serverTimestamp(),
      })
      batch.update(parentRef, { replyCount: increment(1), lastReplyAt: serverTimestamp() })
      batch.set(doc(auditCollection(user.orgId)), {
        module: 'Engagement', action: 'CREATE', details: `Replied to engagement post ${replyingPost.id}`,
        performedBy: user.name || user.email || 'Employee', performedById: user.uid || null, timestamp: serverTimestamp(),
      })
      await batch.commit()
      setReplies((current) => [...current, { id: replyRef.id, content: normalizeReplyText(replyDraft), author: user.name || user.email || 'Employee', authorId: user.uid, createdAt: new Date() }])
      setReplyDraft('')
      setReplyingPost((current) => ({ ...current, replyCount: (current.replyCount || 0) + 1 }))
      setNotice('Reply sent.')
      await fetchPosts()
    } catch (error) {
      setActionError(error.message || 'Could not send your reply.')
    } finally {
      setSaving(false)
    }
  }

  if (!canView) return <div className="rounded-xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-900" role="status">You need Engagement view permission to use this workspace.</div>

  return (
    <div className="space-y-5 font-body">
      <section className="flex flex-col gap-4 rounded-xl border border-slate-200 bg-white p-4 shadow-2xs sm:flex-row sm:items-center sm:justify-between md:p-5">
        <div className="flex flex-wrap gap-1 rounded-lg bg-slate-100 p-1" role="tablist" aria-label="Engagement topics">
          {SECTIONS.map((section) => <button key={section.id} type="button" role="tab" aria-selected={activeSub === section.id} onClick={() => { setActiveSub(section.id); setActionError('') }} className={`inline-flex min-h-9 items-center gap-2 rounded-md px-3 text-xs font-semibold transition ${activeSub === section.id ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-800'}`}>{section.icon}<span>{section.label}</span></button>)}
        </div>
        {canCreate && <button type="button" onClick={() => { setForm({ title: '', content: '' }); setActionError(''); setShowAddModal(true) }} className="inline-flex h-9 items-center justify-center gap-2 self-start rounded-md bg-blue-600 px-4 text-xs font-bold text-white shadow-sm transition hover:bg-blue-700 sm:self-auto"><Plus size={15} /> Create post</button>}
      </section>

      {actionError && !showAddModal && !replyingPost && <div role="alert" className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">{actionError}<button type="button" className="ml-3 font-semibold underline" onClick={fetchPosts}>Retry</button></div>}
      {notice && <div role="status" className="flex items-center justify-between gap-3 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-sm text-emerald-800"><span>{notice}</span><button type="button" aria-label="Dismiss message" onClick={() => setNotice('')}><X size={15} /></button></div>}

      {loading ? <div className="flex justify-center rounded-xl border border-slate-200 bg-white py-16"><Spinner /></div> : actionError && posts.length === 0 ? <div className="rounded-xl border border-rose-200 bg-rose-50 p-6 text-center text-sm text-rose-800" role="alert">{actionError}<button type="button" onClick={fetchPosts} className="ml-2 font-semibold underline">Retry</button></div> : filteredPosts.length === 0 ? <div className="rounded-xl border border-dashed border-slate-200 bg-white px-6 py-14 text-center"><MessageSquare className="mx-auto mb-3 text-slate-400" size={25} /><p className="text-sm font-semibold text-slate-800">No {SECTIONS.find((item) => item.id === activeSub)?.label.toLowerCase()} yet</p><p className="mt-1 text-xs text-slate-500">{canCreate ? 'Start a conversation with a clear, useful post.' : 'Posts will appear here when someone shares them.'}</p>{canCreate && <button type="button" onClick={() => setShowAddModal(true)} className={`${'mt-4'} ${'inline-flex h-9 items-center gap-2 rounded-md bg-blue-600 px-4 text-xs font-bold text-white hover:bg-blue-700'}`}><Plus size={14} /> Create post</button>}</div> : <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">{filteredPosts.map((post) => {
        const supported = isPostSupportedBy(post, user.uid)
        const supportCount = post.supporterIds?.length || 0
        return <article key={post.id} className="flex min-w-0 flex-col rounded-xl border border-slate-200 bg-white p-5 shadow-2xs transition hover:shadow-sm">
          <div className="mb-4 flex items-start justify-between gap-3"><div className="flex min-w-0 items-center gap-3"><div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-blue-100 bg-blue-50 text-xs font-bold text-blue-700">{(post.author || 'E').trim().charAt(0).toUpperCase()}</div><div className="min-w-0"><p className="truncate text-xs font-semibold text-slate-900">{post.author || 'Employee'}</p><p className="mt-0.5 text-[10px] text-slate-500">{dateLabel(post.createdAt)}</p></div></div><span className="shrink-0 rounded-full bg-slate-50 px-2 py-1 font-mono text-[9px] text-slate-500">#{post.id.slice(-4)}</span></div>
          {post.title && <h3 className="mb-2 border-l-2 border-blue-600 pl-2.5 text-sm font-bold text-slate-900">{post.title}</h3>}
          <p className="flex-1 whitespace-pre-wrap break-words text-sm leading-6 text-slate-600">{post.content}</p>
          <div className="mt-5 flex items-center justify-between gap-3 border-t border-slate-100 pt-3"><button type="button" disabled={busyPostId === post.id} aria-pressed={supported} aria-label={`${supported ? 'Remove support from' : 'Support'} post${supportCount ? `, ${supportCount} supporters` : ''}`} onClick={() => toggleSupport(post)} className={`inline-flex min-h-9 items-center gap-1.5 rounded-md px-2.5 text-xs font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 disabled:opacity-60 ${supported ? 'bg-blue-50 text-blue-700' : 'text-slate-500 hover:bg-slate-50 hover:text-blue-700'}`}><ThumbsUp size={14} />{supported ? 'Supported' : 'Support'}<span className="font-mono text-[10px]">{supportCount}</span></button><button type="button" onClick={() => openReplies(post)} className="inline-flex min-h-9 items-center gap-1.5 rounded-md px-2.5 text-xs font-semibold text-slate-500 transition hover:bg-slate-50 hover:text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"><MessageSquare size={14} />Reply<span className="font-mono text-[10px]">{post.replyCount || 0}</span></button></div>
        </article>
      })}</div>}

      <Modal isOpen={showAddModal} onClose={() => setShowAddModal(false)} title={`Create ${SECTIONS.find((item) => item.id === activeSub)?.label.slice(0, -1) || 'post'}`}>
        <form onSubmit={handleSubmit} className="space-y-4 bg-white p-5 sm:p-6">
          {actionError && <p role="alert" className="rounded-md border border-rose-200 bg-rose-50 p-3 text-xs text-rose-800">{actionError}</p>}
          {activeSub !== 'issues' && <div><label htmlFor="engagement-title" className="mb-1.5 block text-sm font-medium text-slate-800">Subject</label><input id="engagement-title" type="text" maxLength={120} value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} className={inputClass} placeholder="A short, clear heading" /></div>}
          <div><label htmlFor="engagement-content" className="mb-1.5 block text-sm font-medium text-slate-800">Message <span className="text-rose-600">*</span></label><textarea id="engagement-content" required maxLength={4000} rows={5} value={form.content} onChange={(event) => setForm({ ...form, content: event.target.value })} className="w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-blue-600" placeholder="Write a respectful, useful message…" /><p className="mt-1 text-right text-[10px] text-slate-400">{form.content.length}/4,000</p></div>
          <div className="flex justify-end gap-2 border-t border-slate-100 pt-4"><button type="button" onClick={() => setShowAddModal(false)} className="h-9 rounded-md border border-slate-200 px-4 text-sm font-medium text-slate-700">Cancel</button><button type="submit" disabled={saving || !canCreate || !form.content.trim()} className="inline-flex h-9 items-center gap-2 rounded-md bg-blue-600 px-4 text-sm font-bold text-white hover:bg-blue-700 disabled:opacity-50">{saving ? 'Posting…' : 'Create post'}<Send size={14} /></button></div>
        </form>
      </Modal>

      <Modal isOpen={Boolean(replyingPost)} onClose={() => setReplyingPost(null)} title={replyingPost?.title || 'Replies'} size="lg">
        <div className="space-y-4 bg-white p-5 sm:p-6">
          <div className="rounded-lg bg-slate-50 p-3 text-sm leading-5 text-slate-700">{replyingPost?.content}</div>
          <div className="max-h-72 space-y-3 overflow-y-auto" aria-live="polite">{loadingReplies ? <div className="flex justify-center py-5"><Spinner /></div> : replies.length === 0 ? <p className="py-5 text-center text-xs text-slate-500">No replies yet. Add the first helpful response.</p> : replies.map((reply) => <div key={reply.id} className="rounded-lg border border-slate-100 p-3"><div className="flex items-center justify-between gap-3"><span className="text-xs font-semibold text-slate-800">{reply.author || 'Employee'}</span><time className="text-[10px] text-slate-400">{dateLabel(reply.createdAt)}</time></div><p className="mt-1 whitespace-pre-wrap break-words text-sm leading-5 text-slate-600">{reply.content}</p></div>)}</div>
          {actionError && replyingPost && <p role="alert" className="rounded-md border border-rose-200 bg-rose-50 p-3 text-xs text-rose-800">{actionError}</p>}
          {canRespond ? <form onSubmit={handleReply} className="border-t border-slate-100 pt-4"><label htmlFor="engagement-reply" className="mb-1.5 block text-sm font-medium text-slate-800">Your reply</label><textarea id="engagement-reply" maxLength={2000} rows={3} value={replyDraft} onChange={(event) => setReplyDraft(event.target.value)} className="w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-blue-600" placeholder="Add context or next steps…" /><div className="mt-2 flex items-center justify-between gap-3"><span className="text-[10px] text-slate-400">{replyDraft.length}/2,000</span><button type="submit" disabled={saving || !replyDraft.trim()} className="inline-flex h-9 items-center gap-2 rounded-md bg-blue-600 px-4 text-sm font-bold text-white hover:bg-blue-700 disabled:opacity-50">{saving ? 'Sending…' : 'Send reply'}<Send size={14} /></button></div></form> : <p className="text-xs text-slate-500">Replying is unavailable because you do not have engagement access.</p>}
        </div>
      </Modal>
    </div>
  )
}
