import React, { useState, useEffect } from 'react'
import { useAuth } from '../../hooks/useAuth'
import { db } from '../../lib/firebase'
import { collection, addDoc, query, getDocs, serverTimestamp, orderBy } from 'firebase/firestore'
import { Megaphone, Award, Lightbulb, MessageSquare, Plus, Send, MoreHorizontal } from 'lucide-react'
import Spinner from '../ui/Spinner'
import Modal from '../ui/Modal'

export default function EngagementTab() {
  const { user } = useAuth()
  const [activeSub, setActiveSub] = useState('announcements')
  const [loading, setLoading] = useState(false)
  const [posts, setPosts] = useState([])
  const [showAddModal, setShowAddModal] = useState(false)
  
  const [form, setForm] = useState({ title: '', content: '', type: 'announcements' })

  const subs = [
    { id: 'announcements', label: 'Announcements', icon: <Megaphone size={16} />, color: 'blue' },
    { id: 'recognize', label: 'Recognize', icon: <Award size={16} />, color: 'amber' },
    { id: 'idea', label: 'Idea Box', icon: <Lightbulb size={16} />, color: 'purple' },
    { id: 'issues', label: 'Issues', icon: <MessageSquare size={16} />, color: 'red' }
  ]

  const fetchPosts = async () => {
    if (!user?.orgId) return
    setLoading(true)
    try {
      const q = query(
        collection(db, 'organisations', user.orgId, 'engagement'),
        orderBy('createdAt', 'desc')
      )
      const snap = await getDocs(q)
      setPosts(snap.docs.map(d => ({ id: d.id, ...d.data() })))
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { fetchPosts() }, [user?.orgId])

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!form.content) return
    setLoading(true)
    try {
      await addDoc(collection(db, 'organisations', user.orgId, 'engagement'), {
        ...form,
        type: activeSub,
        author: user.name,
        authorId: user.uid,
        createdAt: serverTimestamp()
      })
      setShowAddModal(false)
      setForm({ title: '', content: '', type: activeSub })
      fetchPosts()
    } catch (err) {
      alert('Failed to post')
    } finally {
      setLoading(false)
    }
  }

  const filteredPosts = posts.filter(p => p.type === activeSub)

  return (
    <div className="space-y-8 font-inter">
      {/* Sub Nav Header Card */}
      <div className="bg-white p-6 rounded-[12px] shadow-sm border border-gray-100 flex justify-between items-center">
        <div className="flex bg-gray-100 p-1 rounded-lg">
          {subs.map(s => (
            <button
              key={s.id}
              onClick={() => setActiveSub(s.id)}
              className={`flex items-center gap-2 px-5 py-2 rounded-md text-[13px] font-bold transition-all ${activeSub === s.id ? 'bg-white shadow-sm text-gray-900' : 'text-gray-400 hover:text-gray-600'}`}
            >
              {s.icon} {s.label}
            </button>
          ))}
        </div>
        <button 
          onClick={() => setShowAddModal(true)}
          className="h-[40px] px-6 bg-indigo-600 text-white font-bold rounded-lg text-[13px] flex items-center gap-2 shadow-lg hover:bg-indigo-700 transition-all uppercase tracking-widest"
        >
          <Plus size={16} strokeWidth={3} /> Create Post
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
        {loading ? (
          <div className="col-span-full py-20 text-center"><Spinner /></div>
        ) : filteredPosts.length === 0 ? (
          <div className="col-span-full py-20 text-center text-gray-300 font-medium uppercase tracking-tighter text-2xl opacity-40 italic">Quiet in here... Start a conversation</div>
        ) : filteredPosts.map(post => (
          <div key={post.id} className="bg-white p-8 rounded-[12px] shadow-sm border border-gray-100 hover:shadow-md transition-all flex flex-col h-full group relative">
            <div className="flex justify-between items-start mb-6">
              <div className="flex items-center gap-4">
                <div className="w-10 h-10 rounded-full bg-gray-50 flex items-center justify-center font-black text-indigo-600 text-sm shadow-inner border border-gray-100">
                  {post.author?.[0]}
                </div>
                <div>
                  <p className="text-[13px] font-bold text-gray-900 uppercase tracking-tight">{post.author}</p>
                  <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest">{post.createdAt?.toDate?.().toLocaleDateString()}</p>
                </div>
              </div>
              <button className="text-gray-300 hover:text-gray-600 transition-colors"><MoreHorizontal size={18} /></button>
            </div>
            
            {post.title && <h4 className="font-bold text-gray-800 mb-3 uppercase tracking-tight text-sm leading-tight border-l-4 border-indigo-500 pl-3">{post.title}</h4>}
            <p className="text-[14px] text-gray-600 leading-relaxed flex-1">"{post.content}"</p>
            
            <div className="mt-8 pt-6 border-t border-gray-50 flex justify-between items-center">
               <div className="flex gap-4">
                 <button className="text-[10px] font-black text-indigo-500 uppercase tracking-[0.15em] hover:underline">Support</button>
                 <button className="text-[10px] font-black text-gray-400 uppercase tracking-[0.15em] hover:text-gray-600">Reply</button>
               </div>
               <span className="text-[9px] font-black text-gray-300 uppercase tracking-widest bg-gray-50 px-2 py-0.5 rounded">ID: {post.id.slice(-4)}</span>
            </div>
          </div>
        ))}
      </div>

      <Modal isOpen={showAddModal} onClose={() => setShowAddModal(false)} title={`Broadcast ${subs.find(s => s.id === activeSub).label}`}>
        <form onSubmit={handleSubmit} className="p-8 space-y-6 max-w-md mx-auto font-inter">
          {activeSub !== 'issues' && (
            <div>
              <label className="block text-[11px] font-bold text-gray-400 uppercase tracking-widest mb-2 px-1">Subject Heading</label>
              <input 
                type="text" 
                value={form.title}
                onChange={e => setForm({...form, title: e.target.value})}
                className="w-full h-[42px] border border-gray-200 rounded-lg px-4 text-sm font-bold outline-none focus:ring-2 focus:ring-indigo-500 bg-gray-50/50"
                placeholder="Brief subject..."
              />
            </div>
          )}
          <div>
            <label className="block text-[11px] font-bold text-gray-400 uppercase tracking-widest mb-2 px-1">Body Content</label>
            <textarea 
              value={form.content}
              onChange={e => setForm({...form, content: e.target.value})}
              className="w-full border border-gray-200 rounded-lg p-4 text-sm font-medium outline-none focus:ring-2 focus:ring-indigo-500 bg-gray-50/50 h-[120px] transition-all"
              placeholder="What's on your mind?"
            />
          </div>
          <button type="submit" className="w-full h-[44px] bg-indigo-600 text-white font-black py-3 rounded-lg shadow-xl hover:bg-indigo-700 transition-all text-[12px] uppercase tracking-[0.2em] flex items-center justify-center gap-2">
            <Send size={16} /> Deploy Post
          </button>
        </form>
      </Modal>
    </div>
  )
}
