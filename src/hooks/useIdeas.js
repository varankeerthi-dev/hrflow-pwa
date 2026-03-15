import { useEffect, useState } from 'react'
import { addDoc, collection, deleteDoc, doc, onSnapshot, orderBy, query, serverTimestamp, updateDoc, where } from 'firebase/firestore'
import { db } from '../lib/firebase'

export function useIdeas(user) {
  const [ideas, setIdeas] = useState([])

  useEffect(() => {
    if (!user?.uid) return
    const q = query(
      collection(db, 'ideas'),
      where('createdBy', '==', user.uid),
      orderBy('timestamp', 'desc')
    )
    const unsub = onSnapshot(q, (snap) => {
      setIdeas(snap.docs.map(d => ({ id: d.id, ...d.data() })))
    })
    return unsub
  }, [user?.uid])

  return { ideas }
}

export async function createIdea({ text, tags, user }) {
  if (!text?.trim() || !user?.uid) return
  await addDoc(collection(db, 'ideas'), {
    text: text.trim(),
    tags: tags?.length ? tags : null,
    createdBy: user.uid,
    createdByName: user.name || user.email || 'User',
    organizationId: user.orgId || '',
    timestamp: serverTimestamp(),
  })
}

export async function updateIdea(id, { text, tags }) {
  if (!id) return
  await updateDoc(doc(db, 'ideas', id), { text, tags: tags?.length ? tags : null })
}

export async function deleteIdea(id) {
  if (!id) return
  await deleteDoc(doc(db, 'ideas', id))
}
