import { useState, useEffect } from 'react'
import { addDoc, query, orderBy, limit, onSnapshot, serverTimestamp } from 'firebase/firestore'
import { activityLogsCol } from '../lib/firestore'

/**
 * Write one activity log entry.
 * @param {string} orgId
 * @param {{ uid, name }} user
 * @param {{ module, action, detail }} payload
 */
export async function logActivity(orgId, user, payload) {
    if (!orgId || !user?.uid) return
    try {
        await addDoc(activityLogsCol(orgId), {
            ...payload,
            userId: user.uid,
            userName: user.name || user.email || 'Unknown',
            createdAt: serverTimestamp(),
        })
    } catch (e) {
        console.warn('logActivity failed:', e.message)
    }
}

/** Real-time listener for activity logs (newest first, max 200). */
export function useLogs(orgId) {
    const [logs, setLogs] = useState([])
    const [loading, setLoading] = useState(true)

    useEffect(() => {
        if (!orgId) return
        const q = query(activityLogsCol(orgId), orderBy('createdAt', 'desc'), limit(200))
        const unsub = onSnapshot(q, snap => {
            setLogs(snap.docs.map(d => ({ id: d.id, ...d.data() })))
            setLoading(false)
        }, err => {
            console.error('useLogs error:', err.message)
            setLoading(false)
        })
        return unsub
    }, [orgId])

    return { logs, loading }
}
