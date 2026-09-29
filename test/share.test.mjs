import test from 'node:test'
import assert from 'node:assert/strict'
import {
  buildEmployeeContactPayload,
  buildMailtoUrl,
  buildOrganizationDocumentPayload,
  buildOrganizationInvitePayload,
  buildPublishedCommunicationPayload,
  buildSiteVisitReportPayload,
  buildWhatsAppUrl,
  canShareEmployeeContactCard,
  canShareModule,
  canShareOrganizationDocument,
  canShareOrganizationInvite,
  canSharePublishedCommunication,
  composeShareMessage,
  isEligibleOrganizationDocument,
  isEligiblePublishedGeneralCommunication,
  isValidEmailRecipient,
  normalizeWhatsAppPhone,
  requestNativeShare,
  sanitizeShareFileName,
} from '../src/lib/share.js'

const admin = { uid: 'admin-1', orgId: 'org-1', role: 'Admin' }
const shareUser = (module, actions = {}) => ({
  uid: 'staff-1',
  orgId: 'org-1',
  role: 'HR',
  permissions: { [module]: { view: true, ...actions } },
})

const employeeFixture = {
  id: 'employee-internal-id',
  orgId: 'org-1',
  status: 'Active',
  name: 'Asha Kumar',
  designation: 'Site Manager',
  department: 'Operations',
  workEmail: 'asha.kumar@work.example',
  email: 'asha.personal@example.net',
  personalEmail: 'asha.private@example.net',
  mobileNo: '+919999999999',
  contactNo: '+918888888888',
  empCode: 'EMP-0037',
  address: '12 Private Road',
  dob: '1990-02-03',
  bloodGroup: 'O+',
  aadharNo: '111122223333',
  panNo: 'ABCDE1234F',
  pfNo: 'PF-PRIVATE',
  esiNo: 'ESI-PRIVATE',
  bankAccount: '123456789012',
  revealedEmployeeId: 'employee-internal-id',
  showSensitive: true,
}

test('Share permission is separate from view, export, and legacy full access', () => {
  assert.equal(canShareModule(null, 'Employees'), false)
  assert.equal(canShareModule({ uid: 'staff', orgId: 'org-1', permissions: { Employees: { view: true, export: true } } }, 'Employees'), false)
  assert.equal(canShareModule({ uid: 'staff', orgId: 'org-1', permissions: { Employees: { view: true, full: true } } }, 'Employees'), false)
  assert.equal(canShareModule({ uid: 'staff', orgId: 'org-1', permissions: { Employees: { share: true } } }, 'Employees'), false)
  assert.equal(canShareModule(shareUser('Employees', { share: true }), 'Employees'), true)
  assert.equal(canShareModule(admin, 'Employees'), true)
  assert.equal(canShareModule({ uid: 'staff', permissions: { Employees: { view: true, share: true } } }, 'Employees'), false)
})

test('organization invitation is administrator-only and leaves its code out unless explicitly selected', () => {
  assert.equal(canShareOrganizationInvite(admin), true)
  assert.equal(canShareOrganizationInvite(shareUser('Settings', { share: true })), false)
  assert.equal(canShareOrganizationInvite({ ...admin, orgId: '' }), false)

  const payload = buildOrganizationInvitePayload({
    organizationName: 'North & South Works',
    inviteCode: 'ORG-SECRET-8X',
    loginUrl: 'https://hr.example.com/login',
    loginOrigin: 'https://hr.example.com',
  })
  assert.ok(payload)
  assert.equal(payload.fields.find((field) => field.key === 'inviteCode').selected, false)
  const initialMessage = composeShareMessage(payload, new Set(payload.fields.filter((field) => field.selected).map((field) => field.key)))
  assert.match(initialMessage, /https:\/\/hr\.example\.com\/login/)
  assert.doesNotMatch(initialMessage, /ORG-SECRET-8X/)
  const optedInMessage = composeShareMessage(payload, new Set(['organization', 'loginLink', 'inviteCode']))
  assert.match(optedInMessage, /ORG-SECRET-8X/)
  assert.equal(buildOrganizationInvitePayload({ organizationName: 'Org', inviteCode: 'X', loginUrl: 'javascript:alert(1)', loginOrigin: 'https://hr.example.com' }), null)
  assert.equal(buildOrganizationInvitePayload({ organizationName: 'Org', loginUrl: 'https://hr.example.com/login?invite=secret', loginOrigin: 'https://hr.example.com' }), null)
  assert.equal(buildOrganizationInvitePayload({ organizationName: 'Org', loginUrl: 'https://hr.example.com/login/other', loginOrigin: 'https://hr.example.com' }), null)
  assert.equal(buildOrganizationInvitePayload({ organizationName: 'Org', loginUrl: 'https://evil.example.com/login', loginOrigin: 'https://hr.example.com' }), null)
})

test('employee contact card only uses the explicit allowlist and ignores profile reveal state', () => {
  const revealed = buildEmployeeContactPayload(employeeFixture)
  const masked = buildEmployeeContactPayload({ ...employeeFixture, revealedEmployeeId: null, showSensitive: false })
  assert.deepEqual(revealed.fields, masked.fields)
  const body = composeShareMessage(revealed, new Set(revealed.fields.map((field) => field.key)))
  assert.match(body, /Asha Kumar/)
  assert.match(body, /Site Manager/)
  assert.match(body, /Operations/)
  assert.match(body, /asha\.kumar@work\.example/)
  for (const forbidden of ['employee-internal-id', 'EMP-0037', 'asha.personal@example.net', 'asha.private@example.net', '+919999999999', 'Private Road', '1990-02-03', 'O+', '111122223333', 'ABCDE1234F', 'PF-PRIVATE', 'ESI-PRIVATE', '123456789012']) {
    assert.equal(body.includes(forbidden), false, `unexpected private value: ${forbidden}`)
  }
  assert.equal(canShareEmployeeContactCard(shareUser('Employees', { share: true }), employeeFixture), true)
  assert.equal(canShareEmployeeContactCard(shareUser('Employees', { export: true }), employeeFixture), false)
  assert.equal(canShareEmployeeContactCard(shareUser('Employees', { share: true }), { ...employeeFixture, status: 'Inactive' }), false)
  assert.equal(canShareEmployeeContactCard(shareUser('Employees', { share: true }), { ...employeeFixture, orgId: 'other-org' }), false)
  assert.equal(buildEmployeeContactPayload({ name: 'No Work Email', email: 'personal@example.net', status: 'Active' }).fields.some((field) => field.key === 'workEmail'), false)
})

test('published general communications require the supported type, current published state, and all-active audience', () => {
  const record = {
    kind: 'announcement',
    state: 'published',
    title: 'Office maintenance window',
    category: 'Operations',
    body: 'The office network will be offline on Saturday.',
    version: 2,
    audience: { scope: 'all_active', employeeIds: [] },
  }
  assert.equal(isEligiblePublishedGeneralCommunication(record, 'announcement'), true)
  assert.equal(canSharePublishedCommunication(shareUser('HRLetters', { share: true }), 'org-1', record, 'announcement'), true)
  assert.equal(canSharePublishedCommunication(shareUser('HRLetters', { view: true }), 'org-1', record, 'announcement'), false)
  assert.equal(canSharePublishedCommunication({ ...shareUser('HRLetters', { share: true }), orgId: 'other-org' }, 'org-1', record, 'announcement'), false)
  const payload = buildPublishedCommunicationPayload(record, 'announcement')
  const body = composeShareMessage(payload, new Set(payload.fields.map((field) => field.key)))
  assert.match(body, /Office maintenance window/)
  assert.match(body, /Saturday/)
  assert.doesNotMatch(body, /employeeIds|all_active|HRFlow\/|org-1/)
  assert.equal(isEligiblePublishedGeneralCommunication({ ...record, state: 'draft' }, 'announcement'), false)
  assert.equal(isEligiblePublishedGeneralCommunication({ ...record, state: 'issued' }, 'announcement'), false)
  assert.equal(isEligiblePublishedGeneralCommunication({ ...record, employeeId: 'staff-2' }, 'announcement'), false)
  assert.equal(isEligiblePublishedGeneralCommunication({ ...record, employeeName: 'Staff Member' }, 'announcement'), false)
  assert.equal(isEligiblePublishedGeneralCommunication({ ...record, audience: { scope: 'site', site: 'North' } }, 'announcement'), false)
  assert.equal(isEligiblePublishedGeneralCommunication({ ...record, audience: { scope: 'all_active', employeeIds: ['staff-1'] } }, 'announcement'), false)
  assert.equal(isEligiblePublishedGeneralCommunication({ ...record, expiresAt: 'not-a-date' }, 'announcement'), false)
  assert.equal(isEligiblePublishedGeneralCommunication({ ...record, expiresAt: '2020-01-01' }, 'announcement', new Date('2026-01-01')), false)
  assert.equal(isEligiblePublishedGeneralCommunication(record, 'training'), false)
})

test('active organization documents require explicit Share permission, active current version, and an in-org stored file', () => {
  const current = {
    id: 'doc-v2',
    orgId: 'org-1',
    type: 'Org',
    status: 'Active',
    name: 'Safety policy',
    category: 'Policy',
    version: 2,
    documentGroupId: 'policy-group',
    fileName: 'safety-policy.pdf',
    fileType: 'application/pdf',
    fileSize: 1200,
    storagePath: 'organisations/org-1/documents/policy-group/v2/safety-policy.pdf',
    url: 'https://firebasestorage.googleapis.com/private-token',
  }
  const older = { ...current, id: 'doc-v1', version: 1, storagePath: 'organisations/org-1/documents/policy-group/v1/safety-policy.pdf' }
  const docs = [older, current]
  assert.equal(canShareOrganizationDocument(shareUser('DocumentManagement', { share: true }), 'org-1', current, docs), true)
  assert.equal(canShareOrganizationDocument(shareUser('DocumentManagement', { export: true }), 'org-1', current, docs), false)
  assert.equal(isEligibleOrganizationDocument(shareUser('DocumentManagement', { share: true }), 'org-1', older, docs), false)
  assert.equal(isEligibleOrganizationDocument(shareUser('DocumentManagement', { share: true }), 'org-1', { ...current, type: 'Employee' }, docs), false)
  assert.equal(isEligibleOrganizationDocument(shareUser('DocumentManagement', { share: true }), 'org-1', { ...current, category: 'Contract' }, docs), false)
  assert.equal(isEligibleOrganizationDocument(shareUser('DocumentManagement', { share: true }), 'org-1', { ...current, category: 'Payroll' }, docs), false)
  assert.equal(isEligibleOrganizationDocument(shareUser('DocumentManagement', { share: true }), 'org-1', { ...current, category: 'Other' }, docs), false)
  assert.equal(isEligibleOrganizationDocument(shareUser('DocumentManagement', { share: true }), 'org-1', { ...current, status: 'Archived' }, docs), false)
  assert.equal(isEligibleOrganizationDocument(shareUser('DocumentManagement', { share: true }), 'org-1', { ...current, expiresOn: '2020-01-01' }, docs, new Date('2026-01-01')), false)
  assert.equal(isEligibleOrganizationDocument(shareUser('DocumentManagement', { share: true }), 'org-1', { ...current, storagePath: 'organisations/org-2/documents/x/v1/a.pdf' }, docs), false)
  assert.equal(isEligibleOrganizationDocument(shareUser('DocumentManagement', { share: true }), 'org-1', { ...current, storagePath: 'organisations/org-1/documents/../other/file.pdf' }, docs), false)
  assert.equal(isEligibleOrganizationDocument(shareUser('DocumentManagement', { share: true }), 'org-1', { ...current, storagePath: '', url: 'https://external.example.com/file.pdf' }, docs), false)

  const payload = buildOrganizationDocumentPayload(current, () => new Blob(['pdf']))
  const message = composeShareMessage(payload, new Set(payload.fields.map((field) => field.key)))
  assert.doesNotMatch(message, /firebasestorage|private-token|storagePath/)
  assert.equal(payload.fileRequired, true)
  assert.equal(payload.fileName, 'safety-policy.pdf')
  assert.equal(buildOrganizationDocumentPayload({ ...current, category: 'Contract' }, () => new Blob()), null)
})

test('filtered site report payload exposes scope totals, not internal employee identifiers or detail rows in its text', () => {
  const payload = buildSiteVisitReportPayload({
    organizationName: 'North Works',
    from: '2026-08-01',
    to: '2026-08-31',
    selectedSite: 'Depot & West',
    siteCount: 1,
    visitCount: 8,
    totalHours: 47.25,
    detailCount: 8,
    contentRevision: 'report-data-v1',
    fileBuilder: () => new Blob(['pdf']),
  })
  assert.ok(payload)
  assert.equal(payload.requireConfirmation, true)
  assert.equal(payload.fileRequired, true)
  const changedContent = buildSiteVisitReportPayload({
    organizationName: 'North Works', from: '2026-08-01', to: '2026-08-31', selectedSite: 'Depot & West',
    siteCount: 1, visitCount: 8, totalHours: 47.25, detailCount: 8, contentRevision: 'report-data-v2', fileBuilder: () => new Blob(['pdf']),
  })
  assert.notEqual(changedContent.revisionKey, payload.revisionKey)
  const body = composeShareMessage(payload, new Set(payload.fields.map((field) => field.key)))
  assert.match(body, /2026-08-01 to 2026-08-31/)
  assert.match(body, /Depot & West/)
  assert.match(body, /47\.3 hours/)
  assert.doesNotMatch(body, /employeeId|EMP-\d+|Aadhaar|selfie|coordinates/)
  assert.equal(buildSiteVisitReportPayload({ from: '2026-08-01', to: '2026-08-31', siteCount: 0, visitCount: 0, fileBuilder: () => new Blob() }), null)
})

test('single-recipient email validation rejects injection and multiple recipients', () => {
  assert.equal(isValidEmailRecipient('person@example.com'), true)
  assert.equal(isValidEmailRecipient('  person+hr@example.co.uk  '), true)
  assert.equal(isValidEmailRecipient('person@example.com,other@example.com'), false)
  assert.equal(isValidEmailRecipient('person@example.com;other@example.com'), false)
  assert.equal(isValidEmailRecipient('person@example.com\r\nBcc:evil@example.com'), false)
  assert.equal(isValidEmailRecipient('person@localhost'), false)
  assert.equal(isValidEmailRecipient('person..last@example.com'), false)
})

test('email and WhatsApp composer URLs encode Unicode and special characters', () => {
  const subject = 'Review & confirm — Q3'
  const body = 'Asha Kumar\nOperations: 50% complete & ready? ✓'
  const mailto = buildMailtoUrl({ recipient: 'asha@example.com', subject, body })
  const parsedMailto = new URL(mailto)
  assert.equal(decodeURIComponent(parsedMailto.pathname), 'asha@example.com')
  assert.equal(parsedMailto.searchParams.get('subject'), subject)
  assert.equal(parsedMailto.searchParams.get('body'), body)
  assert.match(mailto, /%26/)
  assert.throws(() => buildMailtoUrl({ recipient: 'a@example.com,b@example.com', subject, body }), /one valid email/)

  const phone = '+1 (415) 555-0123'
  assert.equal(normalizeWhatsAppPhone(phone), '14155550123')
  const whatsapp = buildWhatsAppUrl({ recipient: phone, body })
  const parsedWhatsApp = new URL(whatsapp)
  assert.equal(parsedWhatsApp.origin, 'https://wa.me')
  assert.equal(parsedWhatsApp.pathname, '/14155550123')
  assert.equal(parsedWhatsApp.searchParams.get('text'), body)
  assert.throws(() => buildWhatsAppUrl({ recipient: '4155550123', body }), /country code/)
})

test('WhatsApp phone validation requires a single explicit country-coded E.164-like number', () => {
  assert.equal(normalizeWhatsAppPhone('+91 98765-43210'), '919876543210')
  assert.equal(normalizeWhatsAppPhone('+44 (0)20 1234 5678'), '4402012345678')
  assert.equal(normalizeWhatsAppPhone('9876543210'), null)
  assert.equal(normalizeWhatsAppPhone('+123'), null)
  assert.equal(normalizeWhatsAppPhone('+01234567890'), null)
  assert.equal(normalizeWhatsAppPhone('+14155550123 ext 5'), null)
  assert.equal(normalizeWhatsAppPhone('+14155550123,+442071234567'), null)
  assert.equal(normalizeWhatsAppPhone('+1234567890123456'), null)
})

test('share file names are sanitized and bounded', () => {
  assert.equal(sanitizeShareFileName('../private\\secret:name.pdf'), '_private_secret_name.pdf')
  assert.equal(sanitizeShareFileName('....'), 'shared-file')
  assert.ok(sanitizeShareFileName('x'.repeat(200)).length <= 120)
})

test('native share distinguishes unsupported, cancelled, failure, and handoff request without claiming delivery', async () => {
  assert.deepEqual(await requestNativeShare({}, { title: 'Policy', text: 'Read this' }), { outcome: 'unsupported' })
  assert.deepEqual(await requestNativeShare({ share: async () => {} }, { title: 'Policy', text: 'Read this', file: { name: 'file.pdf' } }), { outcome: 'unsupported' })
  assert.deepEqual(await requestNativeShare({ share: async () => { throw Object.assign(new Error('cancelled'), { name: 'AbortError' }) } }, { title: 'Policy', text: 'Read this' }), { outcome: 'cancelled' })
  assert.deepEqual(await requestNativeShare({ share: async () => { throw new Error('blocked') } }, { title: 'Policy', text: 'Read this' }), { outcome: 'failure' })
  let passedFile = null
  const result = await requestNativeShare({
    canShare: ({ files }) => files.length === 1,
    share: async (data) => { passedFile = data.files[0] },
  }, { title: 'Policy', text: 'Read this', file: { name: 'policy.pdf' } })
  assert.deepEqual(result, { outcome: 'handoff-requested' })
  assert.deepEqual(passedFile, { name: 'policy.pdf' })
  for (const outcome of ['unsupported', 'cancelled', 'failure', 'handoff-requested']) {
    assert.equal(outcome.includes('sent') || outcome.includes('delivered'), false)
  }
})
