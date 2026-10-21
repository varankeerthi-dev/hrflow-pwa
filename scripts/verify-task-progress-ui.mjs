import { build } from 'esbuild'
import { mkdir, writeFile } from 'node:fs/promises'

const root = new URL('../', import.meta.url).pathname
const outdir = `${root}.test-build/task-progress-ui`
await mkdir(outdir, { recursive: true })
await build({
  stdin: {
    resolveDir: root,
    loader: 'jsx',
    contents: `
      import React, { useState } from 'react'
      import { createRoot } from 'react-dom/client'
      import TaskProgress from './src/components/tasks/TaskProgress.jsx'
      import { saveTaskProgress } from './src/lib/taskProgress.js'
      import { state } from './test/fixtures/taskProgressFirestore.mjs'
      state.task = { id: 'demo-task', title: 'Follow supplier / client payment', status: 'In Progress', dueDate: '2026-11-01', notes: 'Existing notes', reminder: { enabled: true } }
      const user = { uid: 'tester', name: 'Local Tester' }
      function App() {
        const [task, setTask] = useState(state.task)
        const [fail, setFail] = useState(false)
        return <main>
          <h1>Task progress verification — local test data only</h1>
          <p>This uses the real editor and save service with an in-memory Firestore double. No production connections.</p>
          <label><input type="checkbox" checked={fail} onChange={event => setFail(event.target.checked)} /> Simulate save failure</label>
          <TaskProgress task={task} user={user} onSave={async (id, input) => {
            state.reject = fail
            await saveTaskProgress('test-org', id, user, input)
            setTask({ ...state.task })
          }} />
          <h2>Persisted test data</h2><pre aria-label="Persisted test data">{JSON.stringify({ task, audits: state.audits }, null, 2)}</pre>
        </main>
      }
      createRoot(document.getElementById('root')).render(<App />)
    `
  },
  bundle: true, outfile: `${outdir}/app.js`, format: 'esm', jsx: 'automatic',
  plugins: [{ name: 'no-production-access', setup(builder) {
    builder.onResolve({ filter: /^firebase\/firestore$/ }, () => ({ path: `${root}test/fixtures/taskProgressFirestore.mjs` }))
    builder.onResolve({ filter: /^\.\/firebase$/ }, () => ({ path: 'firebase', namespace: 'test-db' }))
    builder.onLoad({ filter: /.*/, namespace: 'test-db' }, () => ({ contents: 'export const db = {}' }))
  } }]
})
await writeFile(`${outdir}/index.html`, `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><title>Local task progress verification</title><style>body{font-family:system-ui;color:#1e293b;background:#f8fafc;margin:0}main{max-width:760px;margin:auto;padding:20px}section{background:white;padding:16px;border:1px solid #cbd5e1;border-radius:12px;margin-top:20px}label{display:block;margin:12px 0 6px}textarea,input[type=date]{box-sizing:border-box;display:block;width:100%;padding:10px;font:inherit}button{margin:12px 8px 0 0;min-height:36px;padding:6px 14px}li{padding:10px 0;border-top:1px solid #e2e8f0}pre{white-space:pre-wrap;overflow-wrap:anywhere;font-size:12px}[role=alert]{color:#be123c}[role=status]{color:#047857}</style></head><body><div id="root"></div><script type="module" src="./app.js"></script></body></html>\n`)
console.log('Local-only UI harness built. Run: python3 -m http.server 5188 --directory .test-build/task-progress-ui')
