import { useEffect, useMemo, useState } from 'react'
import { doc, onSnapshot, query, updateDoc, where, serverTimestamp } from 'firebase/firestore'
import { communicationDeliveriesCol } from '../lib/firestore'
import { db } from '../lib/firebase'

export function useEmployeeCommunications(orgId, employeeId) {
  const [deliveries, setDeliveries] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!orgId || !employeeId) { setDeliveries([]); setLoading(false); return undefined }
    setLoading(true)
    return onSnapshot(query(communicationDeliveriesCol(orgId), where('recipientId', '==', employeeId)), (snapshot) => {
      setDeliveries(snapshot.docs.map((record) => ({ id: record.id, ...record.data() })).sort((left, right) => (right.updatedAt?.seconds || 0) - (left.updatedAt?.seconds || 0)))
      setLoading(false)
    }, () => setLoading(false))
  }, [employeeId, orgId])

  const acknowledge = async (deliveryId) => {
    await updateDoc(doc(db, 'organisations', orgId, 'communication_deliveries', deliveryId), { status: 'acknowledged', seenAt: serverTimestamp(), acknowledgedAt: serverTimestamp(), updatedAt: serverTimestamp() })
  }

  return useMemo(() => ({ deliveries, loading, acknowledge }), [deliveries, loading])
}
