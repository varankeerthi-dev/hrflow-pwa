import { useCallback, useEffect, useMemo, useState } from 'react'
import { addDoc, collection, deleteDoc, doc, getDocs, onSnapshot, query, serverTimestamp, updateDoc, where, writeBatch } from 'firebase/firestore'
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
import {
  buildLetterAuditSnapshot,
  canApproveCommunications,
  canCreateCommunications,
  canDeleteCommunication,
  canEditCommunication,
  canRequestCommunicationApproval,
  COMMUNICATION_KINDS,
  COMMUNICATION_STATES,
  deliveryDocId,
  nextCommunicationVersion,
  referenceNumber,
  resolveAudience,
} from '../lib/communications'

const CONFIG = {
  [COMMUNICATION_KINDS.LETTER]: { collection: communicationLettersCol, state: COMMUNICATION_STATES.DRAFT },
  [COMMUNICATION_KINDS.ANNOUNCEMENT]: { collection: communicationAnnouncementsCol, state: COMMUNICATION_STATES.DRAFT },
  [COMMUNICATION_KINDS.POLICY]: { collection: communicationPoliciesCol, state: COMMUNICATION_STATES.DRAFT },
  [COMMUNICATION_KINDS.TRAINING]: { collection: communicationTrainingCol, state: COMMUNICATION_STATES.DRAFT },
}

const orgAuditCol = (orgId) => collection(db, 'organisations', orgId, 'audit_logs')
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
  const [loadedOrgId, setLoadedOrgId] = useState('')

  useEffect(() => {
    if (!orgId) return undefined
    const bindings = [
      [communicationLettersCol(orgId), setLetters],
      [communicationAnnouncementsCol(orgId), setAnnouncements],
      [communicationPoliciesCol(orgId), setPolicies],
      [communicationTrainingCol(orgId), setTraining],
      [communicationTemplatesCol(orgId), setTemplates],
      [communicationDeliveriesCol(orgId), setDeliveries],
    ].map(([ref, setState]) => onSnapshot(ref, (snapshot) => {
      setState(sortByUpdatedAt(snapshot.docs.map((record) => ({ id: record.id, ...record.data() }))))
      setLoadedOrgId(orgId)
      setLoading(false)
    }, () => { setLoadedOrgId(orgId); setLoading(false) }))
    return () => bindings.forEach((unsubscribe) => unsubscribe())
  }, [orgId])

  const ensureCreate = useCallback(() => {
    if (!orgId || !user) throw new Error('Sign in to an organisation before creating HR communications.')
    if (!canCreateCommunications(user)) throw new Error('You do not have permission to create HR communications.')
  }, [orgId, user])

  const ensureApprove = useCallback(() => {
    if (!orgId || !user) throw new Error('Sign in to an organisation before publishing HR communications.')
    if (!canApproveCommunications(user)) throw new Error('You need HR approval permission to publish or issue this communication.')
  }, [orgId, user])

  const audit = useCallback(async (eventType, sourceType, sourceId, metadata = {}) => {
    if (!orgId) return
    const actorId = user?.uid || 'system'
    const actorName = user?.name || user?.email || 'System'
    const details = { sourceType, sourceId, ...metadata }
    await Promise.all([
      addDoc(communicationAuditCol(orgId), {
        eventType, sourceType, sourceId, metadata,
        actorId, actorName, actorRole: user?.role || 'system',
        createdAt: serverTimestamp(),
      }),
      addDoc(orgAuditCol(orgId), {
        module: 'HR Communications',
        action: eventType.toUpperCase(),
        details,
        userName: actorName,
        userId: actorId,
        timestamp: serverTimestamp(),
      }),
    ])
  }, [orgId, user])

  const createRecord = useCallback(async (kind, payload, auditEventType = null) => {
    ensureCreate()
    const config = CONFIG[kind]
    if (!config) throw new Error('Choose a supported HR communication type.')
    const userId = user?.uid || 'system'
    const userName = user?.name || user?.email || 'System'
    const record = await addDoc(config.collection(orgId), {
      ...payload, kind, state: payload.state || config.state,
      createdBy: userId, createdById: userId, createdByName: userName,
      updatedBy: userId, updatedById: userId,
      createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
    })
    const draft = { ...payload, id: record.id, kind, state: payload.state || config.state }
    await audit(auditEventType || `${kind}_draft_created`, kind, record.id, kind === COMMUNICATION_KINDS.LETTER ? { letter: buildLetterAuditSnapshot(draft) } : { title: payload.title || payload.letterType || '', version: payload.version || 1 })
    return record.id
  }, [audit, ensureCreate, orgId, user])

  const createTemplate = useCallback(async (payload) => {
    ensureCreate()
    const userId = user?.uid || 'system'
    const userName = user?.name || user?.email || 'System'
    const record = await addDoc(communicationTemplatesCol(orgId), {
      ...payload, version: Number(payload.version || 1), status: payload.status || 'active',
      createdBy: userId, createdById: userId, createdByName: userName,
      updatedById: userId, createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
    })
    await audit('template_created', 'template', record.id, { name: payload.name, type: payload.type, version: Number(payload.version || 1) })
    return record.id
  }, [audit, ensureCreate, orgId, user])

  const publishToAudience = useCallback(async ({ kind, sourceId, payload, state }) => {
    ensureApprove()
    const config = CONFIG[kind]
    if (!config || !orgId) throw new Error('Communication type and organisation are required.')
    if (!['draft', COMMUNICATION_STATES.APPROVED].includes(payload.state)) throw new Error('Only a draft or approved communication can be published.')
    const employeeSnapshot = await getDocs(employeesCol(orgId))
    const recipients = resolveAudience(employeeSnapshot.docs.map((record) => ({ id: record.id, ...record.data() })), payload.audience || {})
    if (!recipients.length) throw new Error('No active employees match this audience. Check the site or department selection before publishing.')
    await updateDoc(doc(config.collection(orgId), sourceId), {
      state, publishedAt: serverTimestamp(), recipientCount: recipients.length,
      audienceSnapshot: { ...(payload.audience || {}), resolvedAt: new Date().toISOString(), recipientCount: recipients.length },
      updatedBy: user?.uid || 'system', updatedById: user?.uid || 'system', updatedAt: serverTimestamp(),
    })
    await commitInBatches(recipients.map((recipient) => ({
      ref: doc(communicationDeliveriesCol(orgId), deliveryDocId(kind, sourceId, recipient.id)),
      data: {
        sourceType: kind, sourceId, sourceVersion: Number(payload.version || 1),
        recipientId: recipient.id, recipientName: recipient.name, recipientCode: recipient.employeeCode,
        titleSnapshot: payload.title || payload.letterType || '', bodySnapshot: payload.body || '',
        effectiveDate: payload.effectiveDate || '', reviewDate: payload.reviewDate || '', expiresAt: payload.expiresAt || '', sessionDate: payload.sessionDate || '',
        acknowledgementMode: payload.acknowledgementMode || 'seen', sourceState: state, status: 'delivered',
        deliveredAt: serverTimestamp(), updatedAt: serverTimestamp(),
      },
    })))
    await audit(`${kind}_${state}`, kind, sourceId, { recipients: recipients.length, version: Number(payload.version || 1) })
    return recipients.length
  }, [audit, ensureApprove, orgId, user])

  const issueLetter = useCallback(async (letter) => {
    ensureApprove()
    if (!letter?.id || !letter.employeeId) throw new Error('Select an employee before issuing a letter.')
    if (!['draft', COMMUNICATION_STATES.APPROVED].includes(letter.state)) throw new Error('Only a draft or approved letter can be issued.')
    const reference = letter.issueReference || referenceNumber('letter', letter.id)
    await updateDoc(doc(communicationLettersCol(orgId), letter.id), {
      state: COMMUNICATION_STATES.ISSUED, issueReference: reference,
      issuedAt: serverTimestamp(), issuedBy: user?.uid || 'system', updatedAt: serverTimestamp(),
    })
    await commitInBatches([{
      ref: doc(communicationDeliveriesCol(orgId), deliveryDocId(COMMUNICATION_KINDS.LETTER, letter.id, letter.employeeId)),
      data: {
        sourceType: COMMUNICATION_KINDS.LETTER, sourceId: letter.id, sourceVersion: Number(letter.version || 1),
        recipientId: letter.employeeId, recipientName: letter.employeeName || '', titleSnapshot: letter.title || letter.letterType || 'HR Letter',
        bodySnapshot: letter.body || '', acknowledgementMode: letter.acknowledgementMode || 'seen',
        effectiveDate: letter.effectiveDate || '', sourceState: COMMUNICATION_STATES.ISSUED, status: 'delivered', deliveredAt: serverTimestamp(), updatedAt: serverTimestamp(),
      },
    }])
    await audit('letter_issued', COMMUNICATION_KINDS.LETTER, letter.id, { reference, letter: buildLetterAuditSnapshot({ ...letter, state: COMMUNICATION_STATES.ISSUED, issueReference: reference, issuedBy: user?.uid || 'system' }) })
  }, [audit, ensureApprove, orgId, user])

  const publishAnnouncement = useCallback((record) => publishToAudience({ kind: COMMUNICATION_KINDS.ANNOUNCEMENT, sourceId: record.id, payload: record, state: COMMUNICATION_STATES.PUBLISHED }), [publishToAudience])
  const publishTraining = useCallback((record) => publishToAudience({ kind: COMMUNICATION_KINDS.TRAINING, sourceId: record.id, payload: record, state: 'invitations_published' }), [publishToAudience])
  const publishPolicy = useCallback(async (record) => {
    const count = await publishToAudience({ kind: COMMUNICATION_KINDS.POLICY, sourceId: record.id, payload: record, state: COMMUNICATION_STATES.PUBLISHED })
    if (record.supersedesId) {
      await updateDoc(doc(communicationPoliciesCol(orgId), record.supersedesId), {
        state: COMMUNICATION_STATES.SUPERSEDED, supersededBy: record.id,
        supersededAt: serverTimestamp(), updatedBy: user?.uid || 'system', updatedById: user?.uid || 'system', updatedAt: serverTimestamp(),
      })
      const previousDeliveries = await getDocs(query(communicationDeliveriesCol(orgId), where('sourceId', '==', record.supersedesId)))
      await commitInBatches(previousDeliveries.docs.map((delivery) => ({
        ref: delivery.ref,
        data: { sourceState: COMMUNICATION_STATES.SUPERSEDED, supersededAt: serverTimestamp(), updatedAt: serverTimestamp() },
      })))
      await audit('policy_superseded', COMMUNICATION_KINDS.POLICY, record.supersedesId, { supersededBy: record.id, version: Number(record.version || 1) })
    }
    return count
  }, [audit, orgId, publishToAudience, user])

  const requestApproval = useCallback(async (kind, recordId) => {
    const config = CONFIG[kind]
    const existing = ({ [COMMUNICATION_KINDS.LETTER]: letters, [COMMUNICATION_KINDS.ANNOUNCEMENT]: announcements, [COMMUNICATION_KINDS.POLICY]: policies, [COMMUNICATION_KINDS.TRAINING]: training }[kind] || []).find((record) => record.id === recordId)
    if (!orgId || !config || !existing || existing.state !== COMMUNICATION_STATES.DRAFT) throw new Error('Only a saved draft can be sent for approval.')
    if (!canRequestCommunicationApproval(existing, user)) throw new Error('You can request approval only for a draft you created or can edit.')
    await updateDoc(doc(config.collection(orgId), recordId), {
      state: COMMUNICATION_STATES.PENDING_APPROVAL, approvalRequestedAt: serverTimestamp(),
      approvalRequestedBy: user?.uid || 'system', updatedBy: user?.uid || 'system', updatedById: user?.uid || 'system', updatedAt: serverTimestamp(),
    })
    await audit(`${kind}_approval_requested`, kind, recordId, { title: existing.title || existing.letterType || '', version: Number(existing.version || 1) })
  }, [announcements, audit, letters, orgId, policies, training, user])

  const approveRecord = useCallback(async (kind, recordId) => {
    ensureApprove()
    const config = CONFIG[kind]
    const existing = ({ [COMMUNICATION_KINDS.LETTER]: letters, [COMMUNICATION_KINDS.ANNOUNCEMENT]: announcements, [COMMUNICATION_KINDS.POLICY]: policies, [COMMUNICATION_KINDS.TRAINING]: training }[kind] || []).find((record) => record.id === recordId)
    if (!orgId || !config || !existing || existing.state !== COMMUNICATION_STATES.PENDING_APPROVAL) throw new Error('This draft is not waiting for approval.')
    await updateDoc(doc(config.collection(orgId), recordId), {
      state: COMMUNICATION_STATES.APPROVED, approvedAt: serverTimestamp(), approvedBy: user?.uid || 'system',
      updatedBy: user?.uid || 'system', updatedById: user?.uid || 'system', updatedAt: serverTimestamp(),
    })
    await audit(`${kind}_approved`, kind, recordId, { title: existing.title || existing.letterType || '', version: Number(existing.version || 1) })
  }, [announcements, audit, ensureApprove, letters, orgId, policies, training, user])

  const updateRecord = useCallback(async (kind, recordId, changes, eventType = 'updated') => {
    const config = CONFIG[kind]
    const existing = ({ [COMMUNICATION_KINDS.LETTER]: letters, [COMMUNICATION_KINDS.ANNOUNCEMENT]: announcements, [COMMUNICATION_KINDS.POLICY]: policies, [COMMUNICATION_KINDS.TRAINING]: training }[kind] || []).find((record) => record.id === recordId)
    if (!config || !orgId || !existing) throw new Error('This draft is no longer available.')
    if (existing.state !== COMMUNICATION_STATES.DRAFT) throw new Error('Published and issued communications are locked. Create a new policy revision when a policy needs to change.')
    if (!canEditCommunication(existing, user)) throw new Error('You can edit only your own drafts unless you are an organisation admin.')
    if (Object.hasOwn(changes, 'state')) throw new Error('Use the publish or issue action to change a communication status.')
    await updateDoc(doc(config.collection(orgId), recordId), { ...changes, updatedBy: user?.uid || 'system', updatedById: user?.uid || 'system', updatedAt: serverTimestamp() })
    await audit(`${kind}_${eventType}`, kind, recordId, kind === COMMUNICATION_KINDS.LETTER ? { letter: buildLetterAuditSnapshot({ ...existing, ...changes, id: recordId, kind }) } : { title: changes.title || existing.title || '', changedFields: Object.keys(changes) })
  }, [announcements, audit, letters, orgId, policies, training, user])

  const updateTemplate = useCallback(async (templateId, changes) => {
    const existing = templates.find((template) => template.id === templateId)
    if (!existing || !orgId) throw new Error('This template is no longer available.')
    if (!canEditCommunication(existing, user)) throw new Error('You can edit only your own templates unless you are an organisation admin.')
    const version = nextCommunicationVersion(existing)
    await updateDoc(doc(communicationTemplatesCol(orgId), templateId), {
      ...changes, version, updatedBy: user?.uid || 'system', updatedById: user?.uid || 'system', updatedAt: serverTimestamp(),
    })
    await audit('template_updated', 'template', templateId, { name: changes.name || existing.name, previousVersion: Number(existing.version || 1), version, changedFields: Object.keys(changes) })
  }, [audit, orgId, templates, user])

  const deleteDraft = useCallback(async (kind, recordId) => {
    const config = CONFIG[kind]
    const existing = ({ [COMMUNICATION_KINDS.LETTER]: letters, [COMMUNICATION_KINDS.ANNOUNCEMENT]: announcements, [COMMUNICATION_KINDS.POLICY]: policies, [COMMUNICATION_KINDS.TRAINING]: training }[kind] || []).find((record) => record.id === recordId)
    if (!config || !orgId || !existing) throw new Error('This draft is no longer available.')
    if (existing.state !== COMMUNICATION_STATES.DRAFT) throw new Error('Only drafts can be deleted. Published or issued records are retained in history.')
    if (!canDeleteCommunication(existing, user)) throw new Error('You can delete only your own drafts unless you are an organisation admin.')
    await deleteDoc(doc(config.collection(orgId), recordId))
    await audit(`${kind}_draft_deleted`, kind, recordId, { title: existing.title || existing.letterType || '', version: Number(existing.version || 1) })
  }, [announcements, audit, letters, orgId, policies, training, user])

  const deleteTemplate = useCallback(async (templateId) => {
    const existing = templates.find((template) => template.id === templateId)
    if (!existing || !orgId) throw new Error('This template is no longer available.')
    if (!canDeleteCommunication(existing, user)) throw new Error('You can delete only your own templates unless you are an organisation admin.')
    await deleteDoc(doc(communicationTemplatesCol(orgId), templateId))
    await audit('template_deleted', 'template', templateId, { name: existing.name, version: Number(existing.version || 1) })
  }, [audit, orgId, templates, user])

  const withdrawRecord = useCallback(async (kind, recordId, reason = 'Withdrawn by HR') => {
    ensureApprove()
    const config = CONFIG[kind]
    const existing = ({ [COMMUNICATION_KINDS.LETTER]: letters, [COMMUNICATION_KINDS.ANNOUNCEMENT]: announcements, [COMMUNICATION_KINDS.POLICY]: policies, [COMMUNICATION_KINDS.TRAINING]: training }[kind] || []).find((record) => record.id === recordId)
    if (!config || !existing || !['published', 'issued', 'invitations_published'].includes(existing.state)) throw new Error('Only published or issued communications can be withdrawn.')
    await updateDoc(doc(config.collection(orgId), recordId), {
      state: COMMUNICATION_STATES.WITHDRAWN, withdrawnReason: reason, withdrawnAt: serverTimestamp(),
      updatedBy: user?.uid || 'system', updatedById: user?.uid || 'system', updatedAt: serverTimestamp(),
    })
    const deliverySnapshot = await getDocs(query(communicationDeliveriesCol(orgId), where('sourceId', '==', recordId)))
    await commitInBatches(deliverySnapshot.docs.map((delivery) => ({
      ref: delivery.ref,
      data: { sourceState: COMMUNICATION_STATES.WITHDRAWN, withdrawnAt: serverTimestamp(), updatedAt: serverTimestamp() },
    })))
    await audit(`${kind}_withdrawn`, kind, recordId, { title: existing.title || existing.letterType || '', reason })
  }, [announcements, audit, ensureApprove, letters, orgId, policies, training, user])

  const acknowledgeDelivery = useCallback(async (deliveryId, response = 'acknowledged') => {
    if (!orgId || !deliveryId || !['seen', 'acknowledged'].includes(response)) throw new Error('Choose a valid communication response.')
    await updateDoc(doc(communicationDeliveriesCol(orgId), deliveryId), {
      status: response, seenAt: serverTimestamp(), acknowledgedAt: response === 'acknowledged' ? serverTimestamp() : null, updatedAt: serverTimestamp(),
    })
    const delivery = deliveries.find((item) => item.id === deliveryId)
    if (delivery) await audit(response === 'seen' ? 'delivery_seen' : 'delivery_acknowledged', delivery.sourceType, delivery.sourceId, { recipientId: delivery.recipientId, response })
  }, [audit, deliveries, orgId])

  const createPolicyRevision = useCallback(async (record) => {
    ensureCreate()
    if (!record?.id || record.kind !== COMMUNICATION_KINDS.POLICY || record.state !== COMMUNICATION_STATES.PUBLISHED) throw new Error('Only a published policy can start a new revision.')
    return createRecord(COMMUNICATION_KINDS.POLICY, {
      title: record.title, body: record.body, category: record.category, documentCode: record.documentCode,
      audience: record.audience || record.audienceSnapshot || { scope: 'all_active' },
      acknowledgementMode: record.acknowledgementMode || 'seen', effectiveDate: '', reviewDate: record.reviewDate || '',
      version: nextCommunicationVersion(record), supersedesId: record.id, previousVersion: Number(record.version || 1),
    }, 'policy_revision_draft_created')
  }, [createRecord, ensureCreate])

  const byKind = useMemo(() => ({ letters, announcements, policies, training, templates, deliveries }), [announcements, deliveries, letters, policies, templates, training])
  return {
    ...byKind, loading: Boolean(orgId && (loading || loadedOrgId !== orgId)), createRecord, createTemplate, updateRecord, updateTemplate,
    deleteDraft, deleteTemplate, issueLetter, publishAnnouncement, publishPolicy, publishTraining,
    withdrawRecord, createPolicyRevision, requestApproval, approveRecord, acknowledgeDelivery,
  }
}
