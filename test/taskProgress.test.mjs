import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { build } from 'esbuild'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

const root = new URL('../', import.meta.url).pathname
const result = await build({
  stdin: { contents: `export * from './src/lib/taskProgress.js'; export { default as TaskProgress } from './src/components/tasks/TaskProgress.jsx'; export { state } from './test/fixtures/taskProgressFirestore.mjs'`, resolveDir: root },
  bundle: true, write: false, platform: 'node', format: 'esm', jsx: 'automatic',
  external: ['react', 'react/jsx-runtime'],
  plugins: [{ name: 'isolated-firestore', setup(builder) {
    builder.onResolve({ filter: /^firebase\/firestore$/ }, () => ({ path: `${root}test/fixtures/taskProgressFirestore.mjs` }))
    builder.onResolve({ filter: /^\.\/firebase$/ }, () => ({ path: 'firebase', namespace: 'test-db' }))
    builder.onLoad({ filter: /.*/, namespace: 'test-db' }, () => ({ contents: 'export const db = {}' }))
  } }]
})
// Keep the bundle inside this worktree so external React resolves normally.
const { writeFile, mkdir } = await import('node:fs/promises')
await mkdir(new URL('../.test-build/', import.meta.url), { recursive: true })
const bundle = new URL('../.test-build/taskProgress.bundle.mjs', import.meta.url)
await writeFile(bundle, result.outputFiles[0].text)
const { saveTaskProgress, validateTaskProgress, withoutTaskProgress, canUpdateTaskProgress, TaskProgress, state } = await import(bundle.href)
const user = { uid: 'author-1', name: 'Keerthi' }
const existing = () => ({ title: 'Follow supplier', status: 'In Progress', completedAt: null, dueDate: '2026-11-01', assignedTo: ['employee-1'], notes: 'Keep notes', checklists: [{ completed: true }], subtasks: [{ title: 'Call' }], reminder: { enabled: true }, isPersonal: false })
const reset = () => Object.assign(state, { task: existing(), audits: [], reject: false, retry: false })

test('validates text, real calendar dates, clearing and no-op submissions', () => {
  assert.deepEqual(validateTaskProgress({ text: '  Client did not pick up  ' }), { text: 'Client did not pick up' })
  assert.deepEqual(validateTaskProgress({ nextFollowUpDate: null }), { nextFollowUpDate: null })
  assert.deepEqual(validateTaskProgress({ nextFollowUpDate: '2028-02-29' }), { nextFollowUpDate: '2028-02-29' })
  for (const input of [{}, { text: '' }, { text: '  ' }, { text: 'a'.repeat(2001) }, { nextFollowUpDate: '' }, { nextFollowUpDate: '2026-02-29' }, { nextFollowUpDate: '2026-13-01' }, { nextFollowUpDate: 123 }]) assert.throws(() => validateTaskProgress(input))
})

test('posting a dated, attributed update preserves every existing task feature', async () => {
  reset()
  const before = structuredClone(state.task)
  await saveTaskProgress('org-1', 'task-1', user, { text: 'Supplier is preparing quotation', nextFollowUpDate: '2026-10-23' })
  for (const [key, value] of Object.entries(before)) assert.deepEqual(state.task[key], value, key)
  assert.equal(state.task.nextFollowUpDate, '2026-10-23')
  assert.equal(state.task.progressUpdates.length, 1)
  assert.equal(state.task.progressUpdates[0].text, 'Supplier is preparing quotation')
  assert.equal(state.task.progressUpdates[0].authorId, user.uid)
  assert.equal(state.task.progressUpdates[0].authorName, user.name)
  assert.ok(state.task.progressUpdates[0].createdAt)
  assert.equal(state.audits[0].module, 'Tasks')
  assert.equal(state.audits[0].performedById, user.uid)
  assert.equal(state.audits[0].timestamp, 'server-time')
})

test('follow-up can be changed and cleared independently without changing status or history', async () => {
  reset()
  await saveTaskProgress('org-1', 'task-1', user, { text: 'Client did not pick up' })
  const history = structuredClone(state.task.progressUpdates)
  await saveTaskProgress('org-1', 'task-1', user, { nextFollowUpDate: '2026-10-24' })
  await saveTaskProgress('org-1', 'task-1', user, { nextFollowUpDate: null })
  assert.deepEqual(state.task.progressUpdates, history)
  assert.equal(state.task.nextFollowUpDate, null)
  assert.equal(state.task.status, 'In Progress')
  assert.equal(state.task.dueDate, '2026-11-01')
  assert.equal(state.audits.length, 3)
})

test('concurrent identical updates have unique operation IDs and preserve both entries', async () => {
  reset()
  await Promise.all([saveTaskProgress('org-1', 'task-1', user, { text: 'Called client' }), saveTaskProgress('org-1', 'task-1', { uid: 'author-2', name: 'Other' }, { text: 'Called client' })])
  assert.equal(state.task.progressUpdates.length, 2)
  assert.notEqual(state.task.progressUpdates[0].id, state.task.progressUpdates[1].id)
  assert.equal(state.audits.length, 2)
})

test('transaction retries do not duplicate the update or audit', async () => {
  reset()
  state.retry = true
  await saveTaskProgress('org-1', 'task-1', user, { text: 'Called again' })
  assert.equal(state.task.progressUpdates.length, 1)
  assert.equal(state.audits.length, 1)
})

test('permission failures leave both progress and audit unchanged', async () => {
  reset()
  state.reject = true
  await assert.rejects(saveTaskProgress('org-1', 'task-1', user, { text: 'Update' }), /Permission denied/)
  assert.deepEqual(state.task, existing())
  assert.deepEqual(state.audits, [])
})

test('signed-out users, another personal-task owner and deleted tasks cannot write', async () => {
  reset()
  await assert.rejects(saveTaskProgress('org-1', 'task-1', null, { text: 'Update' }), /Sign in/)
  state.task = { ...existing(), isPersonal: true, createdBy: 'another-user' }
  assert.equal(canUpdateTaskProgress(state.task, user), false)
  await assert.rejects(saveTaskProgress('org-1', 'task-1', user, { text: 'Update' }), /permission/)
  state.task = null
  await assert.rejects(saveTaskProgress('org-1', 'task-1', user, { text: 'Update' }), /no longer exists/)
  assert.equal(state.audits.length, 0)
})

test('generic detail saves cannot overwrite live progress fields from a stale snapshot', () => {
  const stale = { ...existing(), progressUpdates: [], nextFollowUpDate: '2026-01-01' }
  assert.deepEqual(withoutTaskProgress(stale), existing())
})

test('shared UI renders legacy empty tasks and newest-first author/date history', () => {
  const empty = renderToStaticMarkup(React.createElement(TaskProgress, { task: existing(), user, onSave() {} }))
  assert.match(empty, /No progress updates yet/)
  assert.match(empty, /Next follow-up date/)
  reset()
  const task = { ...existing(), progressUpdates: [{ id: 'one', text: 'Client did not pick up', authorName: 'Keerthi', createdAt: '2026-10-20T10:00:00Z' }, { id: 'two', text: 'Supplier preparing quotation', authorName: 'Other', createdAt: '2026-10-21T10:00:00Z' }] }
  const html = renderToStaticMarkup(React.createElement(TaskProgress, { task, user, onSave() {} }))
  const history = html.slice(html.indexOf('<ol'))
  assert.ok(history.indexOf('Supplier preparing quotation') < history.indexOf('Client did not pick up'))
  assert.match(html, /dateTime="2026-10-21T10:00:00.000Z"/)
  assert.match(html, /Keerthi/)
})

test('all task entry points use the shared editor and detail panels select live records', async () => {
  const desktop = await readFile(new URL('../src/components/tabs/TasksTab.jsx', import.meta.url), 'utf8')
  const mobile = await readFile(new URL('../src/components/MobileTasksView.jsx', import.meta.url), 'utf8')
  const employee = await readFile(new URL('../src/components/tabs/EmployeeTasksView.jsx', import.meta.url), 'utf8')
  const hook = await readFile(new URL('../src/hooks/useTasks.js', import.meta.url), 'utf8')
  assert.match(desktop, /tasks\.find\(task => task\.id === drawerTask\.id\)/)
  assert.match(desktop, /tasks\.find\(task => task\.id === editingTask\.id\)/)
  assert.match(mobile, /tasks\.find\(task => task\.id === showTaskDetail\.id\)/)
  for (const source of [desktop, mobile, employee]) assert.match(source, /<TaskProgress/)
  assert.match(hook, /updates = withoutTaskProgress\(updates\)/)
})
