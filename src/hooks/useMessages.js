import { useEffect, useState } from 'react'
import { collection, onSnapshot, orderBy, query, addDoc, serverTimestamp } from 'firebase/firestore'
import { db } from '../lib/firebase'

export function useMessages(taskId) {
  const [messages, setMessages] = useState([])

  useEffect(() => {
    if (!taskId) return
    const q = query(
      collection(db, 'tasks', taskId, 'messages'),
      orderBy('timestamp', 'asc')
    )
    const unsub = onSnapshot(q, (snap) => {
      setMessages(snap.docs.map(d => ({ id: d.id, ...d.data() })))
    })
    return unsub
  }, [taskId])

  return { messages }
}

export async function sendMessage(taskId, { text, userId, userName }) {
  if (!taskId || !text?.trim()) return
  await addDoc(collection(db, 'tasks', taskId, 'messages'), {
    text: text.trim(),
    userId,
    userName,
    timestamp: serverTimestamp()
  })
}
