import React, { useState, useEffect, useRef } from 'react'

/**
 * ChatTab Component
 * 
 * Provides a real-time Team Chat interface similar to WhatsApp.
 * Supports:
 * - Direct messaging between organization members
 * - Real-time message synchronization with Firestore
 * - Image and file uploads to Firebase Storage
 * - Unread message counts and presence indicators
 * - Responsive layout: Dual-pane for web, single-pane for mobile
 */
import { 
  query, 
  orderBy, 
  onSnapshot, 
  addDoc, 
  serverTimestamp, 
  where, 
  getDocs, 
  setDoc, 
  doc,
  updateDoc,
  increment
} from 'firebase/firestore'
import { useAuth } from '../../hooks/useAuth'
import { useEmployees } from '../../hooks/useEmployees'
import { chatsCol, messagesCol } from '../../lib/firestore'
import { db, storage } from '../../lib/firebase'
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage'
import { 
  Send, 
  Paperclip, 
  Image as ImageIcon, 
  Search, 
  MoreVertical, 
  ChevronLeft,
  User,
  Users,
  Check,
  CheckCheck,
  Smile,
  FileText
} from 'lucide-react'
import { Button, Card } from '../ui/index'
import Modal from '../ui/Modal'

export default function ChatTab() {
  const { user } = useAuth()
  const { employees, loading: empLoading } = useEmployees(user?.orgId)
  const [chats, setChats] = useState([])
  const [selectedChat, setSelectedChat] = useState(null)
  const [messages, setMessages] = useState([])
  const [newMessage, setNewMessage] = useState('')
  const [searchTerm, setSearchTerm] = useState('')
  const [isMobileView, setIsMobileView] = useState(window.innerWidth < 768)
  const [showChatList, setShowChatList] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [showNewGroupModal, setShowNewGroupModal] = useState(false)
  const [groupName, setGroupName] = useState('')
  const [selectedGroupParticipants, setSelectedGroupParticipants] = useState([])
  const [showEmojiPicker, setShowEmojiPicker] = useState(false)
  
  const messagesEndRef = useRef(null)
  const fileInputRef = useRef(null)

  // Handle window resizing for responsive layout
  useEffect(() => {
    const handleResize = () => {
      const mobile = window.innerWidth < 768
      setIsMobileView(mobile)
      if (!mobile) setShowChatList(true)
    }
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [])

  // Real-time listener for user's chats
  useEffect(() => {
    if (!user?.orgId) return

    const q = query(
      chatsCol(user.orgId),
      where('participantIds', 'array-contains', user.uid),
      orderBy('lastMessageAt', 'desc')
    )

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const chatList = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }))
      setChats(chatList)
    })

    return () => unsubscribe()
  }, [user?.orgId, user?.uid])

  // Real-time listener for messages in the selected chat
  useEffect(() => {
    if (!user?.orgId || !selectedChat) {
      setMessages([])
      return
    }

    const q = query(
      messagesCol(user.orgId, selectedChat.id),
      orderBy('createdAt', 'asc')
    )

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const messageList = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }))
      setMessages(messageList)
      scrollToBottom()
      
      // Mark as read if needed (simplification: clear unread count if last message not by me)
      if (selectedChat.unreadCount?.[user.uid] > 0) {
        updateDoc(doc(db, 'organisations', user.orgId, 'chats', selectedChat.id), {
          [`unreadCount.${user.uid}`]: 0
        })
      }
    })

    return () => unsubscribe()
  }, [user?.orgId, selectedChat?.id, user?.uid])

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }

  /**
   * Sends a new text message
   */
  const handleSendMessage = async (e) => {
    e.preventDefault()
    if (!newMessage.trim() || !selectedChat) return

    const text = newMessage.trim()
    setNewMessage('')

    try {
      const msgData = {
        text,
        senderId: user.uid,
        senderName: user.name,
        createdAt: serverTimestamp(),
        type: 'text'
      }

      await addDoc(messagesCol(user.orgId, selectedChat.id), msgData)

      // Update chat last message
      const chatUpdate = {
        lastMessage: text,
        lastMessageAt: serverTimestamp(),
        lastMessageSenderId: user.uid
      }
      
      // Increment unread for other participants
      selectedChat.participantIds.forEach(pid => {
        if (pid !== user.uid) {
          chatUpdate[`unreadCount.${pid}`] = increment(1)
        }
      })

      await updateDoc(doc(db, 'organisations', user.orgId, 'chats', selectedChat.id), chatUpdate)
    } catch (err) {
      console.error('Error sending message:', err)
    }
  }

  /**
   * Handles file and image uploads to Firebase Storage and sends them as messages
   */
  const handleFileUpload = async (e) => {
    const file = e.target.files?.[0]
    if (!file || !selectedChat) return

    setUploading(true)
    try {
      const fileRef = ref(storage, `organisations/${user.orgId}/chats/${selectedChat.id}/${Date.now()}_${file.name}`)
      await uploadBytes(fileRef, file)
      const url = await getDownloadURL(fileRef)

      const msgData = {
        text: file.name,
        fileUrl: url,
        fileName: file.name,
        fileType: file.type,
        senderId: user.uid,
        senderName: user.name,
        createdAt: serverTimestamp(),
        type: file.type.startsWith('image/') ? 'image' : 'file'
      }

      await addDoc(messagesCol(user.orgId, selectedChat.id), msgData)
      
      const chatUpdate = {
        lastMessage: file.type.startsWith('image/') ? '📷 Photo' : `📄 ${file.name}`,
        lastMessageAt: serverTimestamp(),
        lastMessageSenderId: user.uid
      }
      
      selectedChat.participantIds.forEach(pid => {
        if (pid !== user.uid) {
          chatUpdate[`unreadCount.${pid}`] = increment(1)
        }
      })

      await updateDoc(doc(db, 'organisations', user.orgId, 'chats', selectedChat.id), chatUpdate)
    } catch (err) {
      console.error('Error uploading file:', err)
    } finally {
      setUploading(false)
    }
  }

  /**
   * Initializes a new direct chat with a target user if it doesn't exist
   */
  const startNewChat = async (targetUser) => {
    if (!user?.orgId) return

    // Check if chat already exists
    const existingChat = chats.find(c => 
      c.type === 'direct' && 
      c.participantIds.includes(targetUser.id) && 
      c.participantIds.length === 2
    )

    if (existingChat) {
      setSelectedChat(existingChat)
      if (isMobileView) setShowChatList(false)
      return
    }

    // Create new direct chat
    try {
      const chatData = {
        type: 'direct',
        participantIds: [user.uid, targetUser.id],
        participants: {
          [user.uid]: { name: user.name, photoURL: user.photoURL || null },
          [targetUser.id]: { name: targetUser.name, photoURL: targetUser.photoURL || null }
        },
        createdAt: serverTimestamp(),
        lastMessageAt: serverTimestamp(),
        unreadCount: {
          [user.uid]: 0,
          [targetUser.id]: 0
        }
      }

      const docRef = await addDoc(chatsCol(user.orgId), chatData)
      setSelectedChat({ id: docRef.id, ...chatData })
      if (isMobileView) setShowChatList(false)
    } catch (err) {
      console.error('Error creating chat:', err)
    }
  }

  const handleCreateGroup = async () => {
    if (!groupName.trim() || selectedGroupParticipants.length === 0) return
    
    try {
      const participantIds = [user.uid, ...selectedGroupParticipants]
      const participants = {
        [user.uid]: { name: user.name, photoURL: user.photoURL || null }
      }
      
      selectedGroupParticipants.forEach(pid => {
        const emp = employees.find(e => e.id === pid)
        participants[pid] = { name: emp?.name || 'Unknown', photoURL: emp?.photoURL || null }
      })

      const unreadCount = {}
      participantIds.forEach(pid => unreadCount[pid] = 0)

      const chatData = {
        name: groupName.trim(),
        type: 'group',
        participantIds,
        participants,
        createdAt: serverTimestamp(),
        lastMessageAt: serverTimestamp(),
        unreadCount,
        createdBy: user.uid
      }

      const docRef = await addDoc(chatsCol(user.orgId), chatData)
      setSelectedChat({ id: docRef.id, ...chatData })
      setShowNewGroupModal(false)
      setGroupName('')
      setSelectedGroupParticipants([])
      if (isMobileView) setShowChatList(false)
    } catch (err) {
      console.error('Error creating group:', err)
    }
  }

  const handleAddTaskFromChat = async (msg) => {
    try {
      // Assuming useTasks is available or we just use addDoc directly
      const taskData = {
        title: `Task from Chat: ${msg.text.substring(0, 50)}...`,
        description: `Originating from chat message: "${msg.text}"\nSent by: ${msg.senderName}`,
        status: 'To Do',
        assignedTo: [user.uid],
        isPersonal: true,
        category: 'task',
        createdAt: serverTimestamp(),
        createdBy: user.uid
      }
      await addDoc(collection(db, 'organisations', user.orgId, 'tasks'), taskData)
      alert('Task created successfully!')
    } catch (err) {
      console.error('Error creating task from chat:', err)
    }
  }

  const filteredEmployees = employees.filter(emp => 
    emp.id !== user.uid && 
    (emp.name?.toLowerCase().includes(searchTerm.toLowerCase()) || 
     emp.email?.toLowerCase().includes(searchTerm.toLowerCase()))
  )

  const formatTime = (timestamp) => {
    if (!timestamp) return ''
    const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp)
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  }

  const getChatPartner = (chat) => {
    if (chat.type === 'group') return { name: chat.name, photoURL: null, isGroup: true }
    const partnerId = chat.participantIds.find(id => id !== user.uid)
    return chat.participants[partnerId] || { name: 'Unknown User', photoURL: null }
  }

  if (empLoading) return <div className="flex h-full items-center justify-center"><Spinner /></div>

  return (
    <div className="flex h-[calc(100vh-120px)] bg-white border border-gray-200 rounded-none overflow-hidden font-inter">
      {/* Sidebar / Chat List */}
      {(showChatList || !isMobileView) && (
        <div className={`${isMobileView ? 'w-full' : 'w-80'} border-r border-gray-200 flex flex-col bg-gray-50`}>
          {/* Header */}
          <div className="p-4 bg-white border-b border-gray-200 flex items-center justify-between">
            <h2 className="text-lg font-black text-gray-900 uppercase tracking-tight">Team Chat</h2>
            <div className="flex gap-2">
              <button 
                onClick={() => setShowNewGroupModal(true)}
                className="p-2 hover:bg-gray-100 rounded-full text-indigo-600"
                title="New Group Chat"
              >
                <Users size={20} />
              </button>
            </div>
          </div>

          {/* Search */}
          <div className="p-3">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
              <input 
                type="text" 
                placeholder="Search people or chats..." 
                className="w-full pl-10 pr-4 py-2 bg-white border border-gray-200 rounded-lg text-xs font-medium focus:ring-2 focus:ring-indigo-500 outline-none"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
          </div>

          {/* List */}
          <div className="flex-1 overflow-y-auto">
            {searchTerm ? (
              <div className="space-y-1">
                <p className="px-4 py-2 text-[10px] font-black text-gray-400 uppercase tracking-widest">Suggested Contacts</p>
                {filteredEmployees.map(emp => (
                  <button 
                    key={emp.id}
                    onClick={() => startNewChat(emp)}
                    className="w-full px-4 py-3 flex items-center gap-3 hover:bg-white transition-colors border-b border-gray-100/50"
                  >
                    <div className="w-10 h-10 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-700 font-bold">
                      {emp.photoURL ? <img src={emp.photoURL} className="w-full h-full rounded-full object-cover" /> : emp.name?.[0]}
                    </div>
                    <div className="flex-1 text-left">
                      <p className="text-sm font-bold text-gray-900">{emp.name}</p>
                      <p className="text-[10px] text-gray-500 uppercase tracking-tight">{emp.role || 'Employee'}</p>
                    </div>
                  </button>
                ))}
              </div>
            ) : (
              <div className="divide-y divide-gray-100">
                {chats.map(chat => {
                  const partner = getChatPartner(chat)
                  const isActive = selectedChat?.id === chat.id
                  const unread = chat.unreadCount?.[user.uid] || 0
                  
                  return (
                    <button 
                      key={chat.id}
                      onClick={() => {
                        setSelectedChat(chat)
                        if (isMobileView) setShowChatList(false)
                      }}
                      className={`w-full px-4 py-4 flex items-center gap-3 transition-colors ${isActive ? 'bg-white border-l-4 border-l-indigo-600' : 'hover:bg-white'}`}
                    >
                      <div className="relative">
                        <div className={`w-12 h-12 rounded-full flex items-center justify-center font-bold shadow-sm ${partner.isGroup ? 'bg-amber-100 text-amber-700' : 'bg-gray-200 text-gray-600'}`}>
                          {partner.photoURL ? <img src={partner.photoURL} className="w-full h-full rounded-full object-cover" /> : (partner.isGroup ? <Users size={20} /> : partner.name?.[0])}
                        </div>
                        <div className="absolute bottom-0 right-0 w-3 h-3 bg-emerald-500 border-2 border-white rounded-full"></div>
                      </div>
                      <div className="flex-1 text-left overflow-hidden">
                        <div className="flex justify-between items-center mb-0.5">
                          <p className="text-sm font-bold text-gray-900 truncate">{partner.name}</p>
                          <span className="text-[10px] text-gray-400 font-medium">{formatTime(chat.lastMessageAt)}</span>
                        </div>
                        <div className="flex justify-between items-center">
                          <p className="text-xs text-gray-500 truncate max-w-[150px]">{chat.lastMessage || 'No messages yet'}</p>
                          {unread > 0 && (
                            <span className="bg-indigo-600 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full min-w-[18px] text-center">{unread}</span>
                          )}
                        </div>
                      </div>
                    </button>
                  )
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Main Chat Window */}
      {(!showChatList || !isMobileView) && (
        <div className="flex-1 flex flex-col bg-white">
          {selectedChat ? (
            <>
              {/* Chat Header */}
              <div className="p-4 bg-white border-b border-gray-200 flex items-center justify-between shadow-sm">
                <div className="flex items-center gap-3">
                  {isMobileView && (
                    <button onClick={() => setShowChatList(true)} className="p-2 -ml-2 hover:bg-gray-100 rounded-full text-gray-500">
                      <ChevronLeft size={20} />
                    </button>
                  )}
                  <div className="w-10 h-10 rounded-full bg-gray-200 flex items-center justify-center font-bold text-gray-600 overflow-hidden">
                    {getChatPartner(selectedChat).photoURL ? 
                      <img src={getChatPartner(selectedChat).photoURL} className="w-full h-full object-cover" /> : 
                      getChatPartner(selectedChat).name?.[0]}
                  </div>
                  <div>
                    <p className="text-sm font-black text-gray-900 uppercase tracking-tight">{getChatPartner(selectedChat).name}</p>
                    <p className="text-[10px] text-emerald-500 font-bold uppercase tracking-widest">Online</p>
                  </div>
                </div>
                <div className="flex gap-1">
                  <button className="p-2 hover:bg-gray-100 rounded-full text-gray-400"><Search size={20} /></button>
                  <button className="p-2 hover:bg-gray-100 rounded-full text-gray-400"><MoreVertical size={20} /></button>
                </div>
              </div>

                  {/* Messages Area */}
              <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-[#f8f9fc] pattern-dots">
                {messages.map((msg, idx) => {
                  const isMe = msg.senderId === user.uid
                  
                  return (
                    <div key={msg.id} className={`flex ${isMe ? 'justify-end' : 'justify-start'}`}>
                      <div className={`max-w-[75%] flex flex-col ${isMe ? 'items-end' : 'items-start'}`}>
                        {!isMe && (idx === 0 || messages[idx-1].senderId !== msg.senderId) && (
                          <span className="text-[10px] font-bold text-gray-400 mb-1 ml-1 uppercase tracking-tight">{msg.senderName}</span>
                        )}
                        <div className={`px-4 py-2.5 rounded-2xl text-sm shadow-sm relative group ${
                          isMe ? 'bg-indigo-600 text-white rounded-tr-none' : 'bg-white text-gray-800 border border-gray-100 rounded-tl-none'
                        }`}>
                          {msg.type === 'image' ? (
                            <img src={msg.fileUrl} alt="Attachment" className="max-w-full rounded-lg mb-1 shadow-md" />
                          ) : msg.type === 'file' ? (
                            <a href={msg.fileUrl} target="_blank" rel="noreferrer" className="flex items-center gap-2 p-2 bg-black/5 rounded-lg mb-1">
                              <FileText size={20} />
                              <span className="underline truncate max-w-[150px]">{msg.fileName}</span>
                            </a>
                          ) : null}
                          <p className="leading-relaxed">{msg.text}</p>
                          <div className={`flex items-center gap-2 mt-1 ${isMe ? 'text-indigo-200' : 'text-gray-400'}`}>
                            <span className="text-[9px] font-medium">{formatTime(msg.createdAt)}</span>
                            {isMe && <CheckCheck size={10} />}
                            <button 
                              onClick={() => handleAddTaskFromChat(msg)}
                              className="opacity-0 group-hover:opacity-100 transition-opacity ml-1 p-0.5 hover:bg-black/10 rounded cursor-pointer"
                              title="Create Task"
                            >
                              <Plus size={12} />
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  )
                })}
                <div ref={messagesEndRef} />
              </div>

              {/* Input Area */}
              <div className="p-4 bg-white border-t border-gray-100">
                <form onSubmit={handleSendMessage} className="flex items-center gap-3">
                  <button 
                    type="button" 
                    onClick={() => fileInputRef.current?.click()}
                    className="p-2.5 text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-xl transition-all"
                  >
                    <Paperclip size={20} />
                  </button>
                  <input 
                    type="file" 
                    ref={fileInputRef} 
                    className="hidden" 
                    onChange={handleFileUpload} 
                  />
                  <div className="flex-1 relative">
                    <input 
                      type="text" 
                      placeholder="Type your message..." 
                      className="w-full h-12 pl-4 pr-12 bg-gray-50 border border-gray-100 rounded-xl focus:ring-2 focus:ring-indigo-600 outline-none text-sm font-medium transition-all"
                      value={newMessage}
                      onChange={(e) => setNewMessage(e.target.value)}
                    />
                    <button 
                      type="button" 
                      onClick={() => setShowEmojiPicker(!showEmojiPicker)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-indigo-600 transition-colors"
                    >
                      <Smile size={20} />
                    </button>
                  </div>
                  <Button 
                    type="submit" 
                    disabled={!newMessage.trim() || uploading}
                    className="h-12 w-12 !p-0 rounded-xl shadow-indigo-200"
                  >
                    {uploading ? <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" /> : <Send size={20} />}
                  </Button>
                </form>
              </div>
            </>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center p-8 text-center bg-[#f8f9fc]">
              <div className="w-20 h-20 bg-white rounded-3xl shadow-xl flex items-center justify-center mb-6 border border-gray-100">
                <Users size={40} className="text-indigo-600" />
              </div>
              <h3 className="text-xl font-black text-gray-900 uppercase tracking-tight mb-2">Team Communication</h3>
              <p className="text-sm text-gray-500 max-w-xs italic">Select a team member to start a conversation or create a group for your project.</p>
              <button 
                onClick={() => setSearchTerm('')} 
                className="mt-8 px-6 py-2 bg-indigo-600 text-white text-[10px] font-black uppercase tracking-widest rounded-lg shadow-lg hover:bg-indigo-700 transition-all"
              >
                New Conversation
              </button>
            </div>
          )}
        </div>
      )}
      {/* Modals */}
      <Modal 
        isOpen={showNewGroupModal} 
        onClose={() => setShowNewGroupModal(false)} 
        title="Create Team Group"
        size="lg"
      >
        <div className="space-y-6 py-4">
          <div className="space-y-2">
            <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Group Name</label>
            <input 
              type="text" 
              placeholder="E.g. Sales Team, Marketing Dept" 
              className="w-full h-12 px-4 rounded-xl border border-gray-200 focus:ring-2 focus:ring-indigo-600 outline-none text-sm font-bold"
              value={groupName}
              onChange={(e) => setGroupName(e.target.value)}
            />
          </div>
          
          <div className="space-y-2">
            <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Select Participants ({selectedGroupParticipants.length})</label>
            <div className="max-h-60 overflow-y-auto divide-y divide-gray-100 border border-gray-100 rounded-xl">
              {employees.filter(e => e.id !== user.uid).map(emp => (
                <div 
                  key={emp.id} 
                  className="flex items-center justify-between p-3 hover:bg-gray-50 cursor-pointer"
                  onClick={() => {
                    if (selectedGroupParticipants.includes(emp.id)) {
                      setSelectedGroupParticipants(selectedGroupParticipants.filter(id => id !== emp.id))
                    } else {
                      setSelectedGroupParticipants([...selectedGroupParticipants, emp.id])
                    }
                  }}
                >
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-indigo-50 flex items-center justify-center text-indigo-700 font-bold text-xs">
                      {emp.photoURL ? <img src={emp.photoURL} className="w-full h-full rounded-full object-cover" /> : emp.name?.[0]}
                    </div>
                    <span className="text-sm font-bold text-gray-700">{emp.name}</span>
                  </div>
                  <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center transition-all ${
                    selectedGroupParticipants.includes(emp.id) ? 'bg-indigo-600 border-indigo-600' : 'border-gray-200'
                  }`}>
                    {selectedGroupParticipants.includes(emp.id) && <Check size={12} className="text-white" />}
                  </div>
                </div>
              ))}
            </div>
          </div>
          
          <Button 
            className="w-full h-12" 
            disabled={!groupName.trim() || selectedGroupParticipants.length === 0}
            onClick={handleCreateGroup}
          >
            Create Team Group
          </Button>
        </div>
      </Modal>

      {/* Emoji Picker Placeholder */}
      {showEmojiPicker && (
        <div className="fixed bottom-24 right-4 z-50 bg-white shadow-2xl rounded-2xl border border-gray-100 p-4 animate-in slide-in-from-bottom-4">
          <div className="grid grid-cols-6 gap-2">
            {['😊', '😂', '👍', '🔥', '🚀', '🙌', '❤️', '🎉', '💡', '✅', '⚠️', '📦'].map(emoji => (
              <button 
                key={emoji} 
                onClick={() => {
                  setNewMessage(prev => prev + emoji)
                  setShowEmojiPicker(false)
                }}
                className="text-2xl hover:scale-125 transition-transform"
              >
                {emoji}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
