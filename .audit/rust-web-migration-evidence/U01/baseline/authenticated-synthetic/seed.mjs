const projectId = 'demo-hrflow-u01'
const orgId = 'u01-synthetic-org'
const password = 'EmuOnly-U01-Synthetic-2026!'
const employeeId = 'u01-synthetic-employee'
const authOrigin = 'http://127.0.0.1:9099'
const firestoreOrigin = 'http://127.0.0.1:8080'
const actions = ['view', 'create', 'edit', 'delete', 'approve']
const definitions = [
  { uid: 'u01-admin', persona: 'synthetic-admin', email: 'u01-admin@example.invalid', name: 'Synthetic Admin', role: 'admin' },
  { uid: 'u01-employee', persona: 'employee-self-service-defaults', email: 'u01-employee@example.invalid', name: 'Synthetic Employee', role: 'employee', employeeId },
  ...actions.map(action => ({
    uid: `u01-${action}-only`, persona: `permission-limited-${action}-only`, email: `u01-${action}-only@example.invalid`,
    name: `Synthetic ${action} only`, role: 'staff',
    permissions: { Employees: Object.fromEntries([...actions.map(key => [key, key === action]), ['export', false], ['full', false]]) }
  })),
  { uid: 'u01-no-permission', persona: 'permission-limited-all-false', email: 'u01-no-permission@example.invalid', name: 'Synthetic No Permission', role: 'staff',
    permissions: { Employees: Object.fromEntries([...actions.map(key => [key, false]), ['export', false], ['full', false]]) }
  }
]

if (projectId !== 'demo-hrflow-u01' || !projectId.startsWith('demo-')) throw new Error('Refusing non-synthetic Firebase project ID')
const allowed = new Map([[authOrigin, 'Auth emulator'], [firestoreOrigin, 'Firestore emulator']])
for (const value of [process.env.FIREBASE_AUTH_EMULATOR_HOST, process.env.FIRESTORE_EMULATOR_HOST]) {
  if (!/^127\.0\.0\.1:(8080|9099)$/.test(value || '')) throw new Error(`Refusing non-loopback emulator host: ${value || '(unset)'}`)
}

async function call(origin, path, init = {}, idToken = null) {
  if (!allowed.has(origin)) throw new Error(`Refusing non-emulator origin ${origin}`)
  const headers = { ...(init.headers || {}), ...(idToken ? { Authorization: `Bearer ${idToken}` } : {}) }
  const response = await fetch(`${origin}${path}`, { ...init, headers })
  const text = await response.text()
  if (!response.ok) throw new Error(`${allowed.get(origin)} returned HTTP ${response.status}: ${text.slice(0, 800)}`)
  return text ? JSON.parse(text) : null
}
function typed(value) {
  if (value === null) return { nullValue: 'NULL_VALUE' }
  if (typeof value === 'string') return { stringValue: value }
  if (typeof value === 'boolean') return { booleanValue: value }
  if (typeof value === 'number') return Number.isInteger(value) ? { integerValue: String(value) } : { doubleValue: value }
  if (value instanceof Date) return { timestampValue: value.toISOString() }
  if (Array.isArray(value)) return { arrayValue: { values: value.map(typed) } }
  if (typeof value === 'object') return { mapValue: { fields: Object.fromEntries(Object.entries(value).map(([key, item]) => [key, typed(item)])) } }
  throw new Error(`Unsupported Firestore fixture value type: ${typeof value}`)
}
function document(path, data) {
  return {
    update: {
      name: `projects/${projectId}/databases/(default)/documents/${path}`,
      fields: Object.fromEntries(Object.entries(data).map(([key, value]) => [key, typed(value)]))
    }
  }
}
async function commitOne(path, data, idToken) {
  return call(firestoreOrigin, `/v1/projects/${projectId}/databases/(default)/documents:commit`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ writes: [document(path, data)] })
  }, idToken)
}

// Reset only this named demo project's local emulator state; these endpoints are never cloud Firebase APIs.
await call(authOrigin, `/emulator/v1/projects/${projectId}/accounts`, { method: 'DELETE' })
await call(firestoreOrigin, `/emulator/v1/projects/${projectId}/databases/(default)/documents`, { method: 'DELETE' })
const personas = []
for (const persona of definitions) {
  const result = await call(authOrigin, '/identitytoolkit.googleapis.com/v1/accounts:signUp?key=u01-synthetic-api-key', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: persona.email, password, returnSecureToken: true })
  })
  personas.push({ ...persona, localId: result.localId, idToken: result.idToken })
}
// Source rules allow a signed-in user to create its own initial user record; create these first.
for (const persona of personas) {
  const membership = { orgId, role: persona.role, orgName: 'U01 Synthetic Organization' }
  const userDoc = {
    name: persona.name, email: persona.email, orgId, currentOrgId: orgId,
    memberships: [membership], role: persona.role,
    ...(persona.employeeId ? { employeeId: persona.employeeId } : {}),
    ...(persona.permissions ? { permissions: persona.permissions } : {})
  }
  await commitOne(`users/${persona.localId}`, userDoc, persona.idToken)
}
const admin = personas.find(persona => persona.role === 'admin')
await commitOne(`organisations/${orgId}`, {
  name: 'U01 Synthetic Organization', adminUids: [admin.localId], orgCode: 'U01SYNTH',
  createdAt: new Date('2026-10-02T00:00:00.000Z'), settings: { currency: 'INR', timezone: 'Asia/Kolkata' }
}, admin.idToken)
await commitOne(`organisations/${orgId}/employees/${employeeId}`, {
  name: 'Synthetic Employee', email: 'u01-employee@example.invalid', employeeId,
  empCode: 'U01-E001', status: 'Active', department: 'Operations',
  designation: 'Synthetic Test Role', joiningDate: '2026-01-01'
}, admin.idToken)
console.log(JSON.stringify({
  projectId, orgId,
  personas: personas.map(({ idToken, ...persona }) => ({ ...persona, employeeId: persona.employeeId || null, directPermissions: persona.permissions || null })),
  seededEmployeeDocument: `organisations/${orgId}/employees/${employeeId}`,
  seededCollections: ['users', `organisations/${orgId}`, `organisations/${orgId}/employees`],
  otherBusinessCollections: 'intentionally empty',
  emulatorOriginsUsed: [...allowed.keys()]
}, null, 2))
