import { useCallback, useEffect, useMemo, useState } from 'react'
import { addDoc, collection, doc, getDocs, onSnapshot, serverTimestamp, updateDoc, writeBatch } from 'firebase/firestore'
import { db } from '../lib/firebase'
import {
  communicationAnnouncementsCol,
  communicationAuditCol,
  communicationDeliveriesCol,
  communicationLettersCol,
  communicationPoliciesCol,
  communicationTemplatesCol,
  communicationTrainingCol,
  employeesCol,
} from '../lib/firestore'
import { COMMUNICATION_KINDS, COMMUNICATION_STATES, deliveryDocId, referenceNumber, resolveAudience } from '../lib/communications'

const CONFIG = {
  [COMMUNICATION_KINDS.LETTER]: { collection: communicationLettersCol, state: COMMUNICATION_STATES.DRAFT },
  [COMMUNICATION_KINDS.ANNOUNCEMENT]: { collection: communicationAnnouncementsCol, state: COMMUNICATION_STATES.DRAFT },
  [COMMUNICATION_KINDS.POLICY]: { collection: communicationPoliciesCol, state: COMMUNICATION_STATES.DRAFT },
  [COMMUNICATION_KINDS.TRAINING]: { collection: communicationTrainingCol, state: COMMUNICATION_STATES.DRAFT },
}

const sortByUpdatedAt = (items) => [...items].sort((left, right) => {
  const rightDate = right.updatedAt?.toMillis?.() || right.updatedAt?.seconds || 0
  const leftDate = left.updatedAt?.toMillis?.() || left.updatedAt?.seconds || 0
  return rightDate - leftDate
})

const commitInBatches = async (operations) => {
  for (let start = 0; start < operations.length; start += 400) {
    const batch = writeBatch(db)
    operations.slice(start, start + 400).forEach((operation) => batch.set(operation.ref, operation.data, { merge: true }))
    await batch.commit()
  }
}

export function useCommunications(orgId, user) {
  const [letters, setLetters] = useState([])
  const [announcements, setAnnouncements] = useState([])
  const [policies, setPolicies] = useState([])
  const [training, setTraining] = useState([])
  const [templates, setTemplates] = useState([])
  const [deliveries, setDeliveries] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!orgId) { setLoading(false); return undefined }
    setLoading(true)
    const bindings = [
      [communicationLettersCol(orgId), setLetters],
      [communicationAnnouncementsCol(orgId), setAnnouncements],
      [communicationPoliciesCol(orgId), setPolicies],
      [communicationTrainingCol(orgId), setTraining],
      [communicationTemplatesCol(orgId), setTemplates],
      [communicationDeliveriesCol(orgId), setDeliveries],
    ].map(([ref, setState]) => onSnapshot(ref, (snapshot) => {
      setState(sortByUpdatedAt(snapshot.docs.map((record) => ({ id: record.id, ...record.data() }))))
      setLoading(false)
    }, () => setLoading(false)))
    return () => bindings.forEach((unsubscribe) => unsubscribe())
  }, [orgId])

  const audit = useCallback(async (eventType, sourceType, sourceId, metadata = {}) => {
    if (!orgId) return
    await addDoc(communicationAuditCol(orgId), {
      eventType, sourceType, sourceId, metadata,
      actorId: user?.uid || 'system', actorName: user?.name || 'System', actorRole: user?.role || 'system',
      createdAt: serverTimestamp(),
    })
  }, [orgId, user])

  const createRecord = useCallback(async (kind, payload) => {
    const config = CONFIG[kind]
    if (!config || !orgId) throw new Error('Communication type and organisation are required.')
    const record = await addDoc(config.collection(orgId), {
      ...payload, kind, state: payload.state || config.state,
      createdBy: user?.uid || 'system', createdByName: user?.name || 'System',
      updatedBy: user?.uid || 'system', createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
    })
    await audit(`${kind}_draft_created`, kind, record.id, { title: payload.title || payload.letterType || '' })
    return record.id
  }, [audit, orgId, user])

  const createTemplate = useCallback(async (payload) => {
    if (!orgId) throw new Error('Organisation is required.')
    const record = await addDoc(communicationTemplatesCol(orgId), {
      ...payload, version: Number(payload.version || 1), status: payload.status || 'active',
      createdBy: user?.uid || 'system', createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
    })
    await audit('template_created', 'template', record.id, { name: payload.name, type: payload.type })
    return record.id
  }, [audit, orgId, user])

  const publishToAudience = useCallback(async ({ kind, sourceId, payload, state }) => {
    if (!orgId) throw new Error('Organisation is required.')
    const config = CONFIG[kind]
    const employeeSnapshot = await getDocs(employeesCol(orgId))
    const recipients = resolveAudience(employeeSnapshot.docs.map((record) => ({ id: record.id, ...record.data() })), payload.audience || {})
    await updateDoc(doc(config.collection(orgId), sourceId), {
      state, publishedAt: serverTimestamp(), recipientCount: recipients.length,
      audienceSnapshot: { ...(payload.audience || {}), resolvedAt: new Date().toISOString(), recipientCount: recipients.length },
      updatedBy: user?.uid || 'system', updatedAt: serverTimestamp(),
    })
    await commitInBatches(recipients.map((recipient) => ({
      ref: doc(communicationDeliveriesCol(orgId), deliveryDocId(kind, sourceId, recipient.id)),
      data: { sourceType: kind, sourceId, sourceVersion: Number(payload.version || 1), recipientId: recipient.id, recipientName: recipient.name, recipientCode: recipient.employeeCode, titleSnapshot: payload.title || payload.letterType || '', bodySnapshot: payload.body || '', acknowledgementMode: payload.acknowledgementMode || 'seen', sourceState: state, status: 'delivered', deliveredAt: serverTimestamp(), updatedAt: serverTimestamp() },
    })))
    await audit(`${kind}_${state}`, kind, sourceId, { recipients: recipients.length })
    return recipients.length
  }, [audit, orgId, user])

  const issueLetter = useCallback(async (letter) => {
    if (!letter?.id || !letter.employeeId) throw new Error('Select an employee before issuing a letter.')
    const reference = letter.issueReference || referenceNumber('letter', letter.id)
    await updateDoc(doc(communicationLettersCol(orgId), letter.id), { state: COMMUNICATION_STATES.ISSUED, issueReference: reference, issuedAt: serverTimestamp(), issuedBy: user?.uid || 'system', updatedAt: serverTimestamp() })
    await commitInBatches([{ ref: doc(communicationDeliveriesCol(orgId), deliveryDocId(COMMUNICATION_KINDS.LETTER, letter.id, letter.employeeId)), data: { sourceType: COMMUNICATION_KINDS.LETTER, sourceId: letter.id, sourceVersion: Number(letter.version || 1), recipientId: letter.employeeId, recipientName: letter.employeeName || '', titleSnapshot: letter.title || letter.letterType || 'HR Letter', bodySnapshot: letter.body || '', acknowledgementMode: letter.acknowledgementMode || 'seen', sourceState: COMMUNICATION_STATES.ISSUED, status: 'delivered', deliveredAt: serverTimestamp(), updatedAt: serverTimestamp() } }])
    await audit('letter_issued', COMMUNICATION_KINDS.LETTER, letter.id, { reference })
  }, [audit, orgId, user])

  const publishAnnouncement = useCallback((record) => publishToAudience({ kind: COMMUNICATION_KINDS.ANNOUNCEMENT, sourceId: record.id, payload: record, state: COMMUNICATION_STATES.PUBLISHED }), [publishToAudience])
  const publishPolicy = useCallback((record) => publishToAudience({ kind: COMMUNICATION_KINDS.POLICY, sourceId: record.id, payload: record, state: COMMUNICATION_STATES.PUBLISHED }), [publishToAudience])
  const publishTraining = useCallback((record) => publishToAudience({ kind: COMMUNICATION_KINDS.TRAINING, sourceId: record.id, payload: record, state: 'invitations_published' }), [publishToAudience])

  const updateRecord = useCallback(async (kind, recordId, changes, eventType = 'updated') => {
    const config = CONFIG[kind]
    if (!config || !orgId) return
    await updateDoc(doc(config.collection(orgId), recordId), { ...changes, updatedBy: user?.uid || 'system', updatedAt: serverTimestamp() })
    await audit(`${kind}_${eventType}`, kind, recordId, changes)
  }, [audit, orgId, user])

  const acknowledgeDelivery = useCallback(async (deliveryId, response = 'acknowledged') => {
    if (!orgId || !deliveryId) return
    await updateDoc(doc(communicationDeliveriesCol(orgId), deliveryId), { status: response, seenAt: serverTimestamp(), acknowledgedAt: response === 'acknowledged' ? serverTimestamp() : null, updatedAt: serverTimestamp() })
    const delivery = deliveries.find((item) => item.id === deliveryId)
    if (delivery) await audit('delivery_acknowledged', delivery.sourceType, delivery.sourceId, { recipientId: delivery.recipientId, response })
  }, [audit, deliveries, orgId])

  const byKind = useMemo(() => ({ letters, announcements, policies, training, templates, deliveries }), [announcements, deliveries, letters, policies, templates, training])
  return { ...byKind, loading, createRecord, createTemplate, updateRecord, issueLetter, publishAnnouncement, publishPolicy, publishTraining, acknowledgeDelivery }
}
