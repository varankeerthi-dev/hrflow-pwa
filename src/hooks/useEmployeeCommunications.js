import { useCallback, useEffect, useMemo, useState } from 'react'
import { addDoc, collection, doc, onSnapshot, query, updateDoc, where, serverTimestamp } from 'firebase/firestore'
import { communicationAuditCol, communicationDeliveriesCol } from '../lib/firestore'
import { db } from '../lib/firebase'

const orgAuditCol = (orgId) => collection(db, 'organisations', orgId, 'audit_logs')

export function useEmployeeCommunications(orgId, employeeId, user) {
  const [deliveries, setDeliveries] = useState([])
  const [loading, setLoading] = useState(true)
  const [loadedScope, setLoadedScope] = useState('')

  useEffect(() => {
    if (!orgId || !employeeId) return undefined
    return onSnapshot(query(communicationDeliveriesCol(orgId), where('recipientId', '==', employeeId)), (snapshot) => {
      setDeliveries(snapshot.docs.map((record) => ({ id: record.id, ...record.data() })).sort((left, right) => (right.updatedAt?.seconds || 0) - (left.updatedAt?.seconds || 0)))
      setLoadedScope(`${orgId}:${employeeId}`)
      setLoading(false)
    }, () => {
      setDeliveries([])
      setLoadedScope(`${orgId}:${employeeId}`)
      setLoading(false)
    })
  }, [employeeId, orgId])

  const acknowledge = useCallback(async (deliveryId, response = 'acknowledged') => {
    if (!orgId || !employeeId || !deliveryId || !['seen', 'acknowledged'].includes(response)) throw new Error('Choose a valid communication response.')
    const delivery = deliveries.find((item) => item.id === deliveryId)
    if (!delivery || delivery.recipientId !== employeeId) throw new Error('This communication is not in your employee inbox.')
    if (delivery.status === 'acknowledged' || (delivery.status === 'seen' && response === 'seen')) return
    const timestamp = serverTimestamp()
    await updateDoc(doc(db, 'organisations', orgId, 'communication_deliveries', deliveryId), {
      status: response, seenAt: timestamp, acknowledgedAt: response === 'acknowledged' ? serverTimestamp() : null, updatedAt: serverTimestamp(),
    })
    const actorId = user?.uid || employeeId
    const actorName = user?.name || user?.email || 'Employee'
    const eventType = response === 'seen' ? 'delivery_seen' : 'delivery_acknowledged'
    const metadata = { recipientId: employeeId, response }
    await Promise.all([
      addDoc(communicationAuditCol(orgId), {
        eventType, sourceType: delivery.sourceType, sourceId: delivery.sourceId, metadata,
        actorId, actorName, actorRole: user?.role || 'employee', createdAt: serverTimestamp(),
      }),
      addDoc(orgAuditCol(orgId), {
        module: 'HR Communications', action: eventType.toUpperCase(),
        details: { sourceType: delivery.sourceType, sourceId: delivery.sourceId, ...metadata },
        userName: actorName, userId: actorId, timestamp: serverTimestamp(),
      }),
    ])
  }, [deliveries, employeeId, orgId, user])

  const scope = orgId && employeeId ? `${orgId}:${employeeId}` : ''
  return useMemo(() => ({ deliveries: scope && loadedScope === scope ? deliveries : [], loading: Boolean(scope && (loading || loadedScope !== scope)), acknowledge }), [acknowledge, deliveries, loadedScope, loading, scope])
}
