import { useState, useEffect } from 'react'
import { useAuth } from '../../hooks/useAuth'
import { db } from '../../lib/firebase'
import { collection, addDoc, query, getDocs, serverTimestamp, orderBy } from 'firebase/firestore'
import { Megaphone, Award, Lightbulb, MessageSquare, Plus, Send } from 'lucide-react'
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
    { id: 'announcements', label: 'Announcements', icon: <Megaphone size={14} />, color: 'blue' },
    { id: 'recognize', label: 'Recognize', icon: <Award size={14} />, color: 'amber' },
    { id: 'idea', label: 'Idea Box', icon: <Lightbulb size={14} />, color: 'purple' },
    { id: 'issues', label: 'Issues', icon: <MessageSquare size={14} />, color: 'red' }
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
    <div className="space-y-6 font-inter">
      <div className="flex bg-gray-50 p-1 rounded-xl border border-gray-200 w-fit">
        {subs.map(s => (
          <button
            key={s.id}
            onClick={() => setActiveSub(s.id)}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold transition-all ${activeSub === s.id ? 'bg-white shadow-sm text-gray-900 border border-gray-100' : 'text-gray-400 hover:text-gray-600'}`}
          >
            {s.icon} {s.label}
          </button>
        ))}
      </div>

      <div className="flex justify-between items-center">
        <h3 className="text-sm font-black text-gray-800 uppercase tracking-tight">
          {subs.find(s => s.id === activeSub).label} Feed
        </h3>
        <button 
          onClick={() => setShowAddModal(true)}
          className="bg-indigo-600 text-white px-4 py-2 rounded-lg text-xs font-semibold flex items-center gap-2 shadow-sm hover:bg-indigo-700"
        >
          <Plus size={14} /> New Post
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {loading ? (
          <div className="col-span-full py-20 text-center"><Spinner /></div>
        ) : filteredPosts.length === 0 ? (
          <div className="col-span-full py-20 text-center text-gray-300 font-black uppercase tracking-widest opacity-20 text-2xl italic">Nothing here yet</div>
        ) : filteredPosts.map(post => (
          <div key={post.id} className="bg-white p-6 rounded-3xl border border-gray-100 shadow-sm hover:shadow-md transition-all flex flex-col h-full group">
            <div className="flex justify-between items-start mb-4">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center font-bold text-indigo-600 text-xs shadow-inner">
                  {post.author?.[0]}
                </div>
                <div>
                  <p className="text-[11px] font-black text-gray-900 uppercase tracking-tight">{post.author}</p>
                  <p className="text-[9px] text-gray-400 font-bold uppercase">{post.createdAt?.toDate?.().toLocaleDateString()}</p>
                </div>
              </div>
            </div>
            
            {post.title && <h4 className="font-bold text-gray-800 mb-2 uppercase tracking-tight text-sm">{post.title}</h4>}
            <p className="text-xs text-gray-600 leading-relaxed flex-1">"{post.content}"</p>
            
            <div className="mt-6 pt-4 border-t border-gray-50 flex justify-between items-center opacity-0 group-hover:opacity-100 transition-opacity">
               <button className="text-[9px] font-black text-indigo-500 uppercase tracking-widest hover:underline">Support</button>
               <button className="text-[9px] font-black text-gray-400 uppercase tracking-widest hover:text-gray-600">Reply</button>
            </div>
          </div>
        ))}
      </div>

      <Modal isOpen={showAddModal} onClose={() => setShowAddModal(false)} title={`Create ${subs.find(s => s.id === activeSub).label}`}>
        <form onSubmit={handleSubmit} className="p-6 space-y-4 max-w-md mx-auto">
          {activeSub !== 'issues' && (
            <div>
              <label className="block text-[10px] font-black text-gray-400 uppercase mb-1">Heading</label>
              <input 
                type="text" 
                value={form.title}
                onChange={e => setForm({...form, title: e.target.value})}
                className="w-full border rounded-xl px-4 py-2 text-xs font-bold outline-none focus:ring-2 focus:ring-indigo-500 bg-gray-50"
                placeholder="Title..."
              />
            </div>
          )}
          <div>
            <label className="block text-[10px] font-black text-gray-400 uppercase mb-1">Message Content</label>
            <textarea 
              value={form.content}
              onChange={e => setForm({...form, content: e.target.value})}
              className="w-full border rounded-xl px-4 py-3 text-xs outline-none focus:ring-2 focus:ring-indigo-500 bg-gray-50 h-32"
              placeholder="Write something..."
            />
          </div>
          <button type="submit" className="w-full bg-indigo-600 text-white font-black py-3 rounded-2xl shadow-xl hover:bg-indigo-700 transition-all text-[10px] uppercase tracking-widest flex items-center justify-center gap-2">
            <Send size={14} /> Post to Feed
          </button>
        </form>
      </Modal>
    </div>
  )
}
