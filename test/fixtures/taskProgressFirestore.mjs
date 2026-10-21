export const state = { task: null, audits: [], reject: false, retry: false }
let sequence = 0
export const collection = (...parts) => parts.filter(part => typeof part === 'string').join('/')
export const doc = (...parts) => ({ path: parts.filter(part => typeof part === 'string').join('/'), id: `operation-${++sequence}` })
export const serverTimestamp = () => 'server-time'
export const Timestamp = { now: () => new Date('2026-10-21T12:00:00Z') }
export const arrayUnion = (entry) => ({ append: entry })
export async function runTransaction(_db, callback) {
  const run = async () => {
    const writes = []
    await callback({
      get: async () => ({ exists: () => state.task !== null, data: () => state.task }),
      update: (_ref, changes) => writes.push(['task', changes]),
      set: (_ref, audit) => writes.push(['audit', audit])
    })
    return writes
  }
  if (state.retry) await run()
  const writes = await run()
  if (state.reject) throw new Error('Permission denied')
  for (const [kind, data] of writes) {
    if (kind === 'audit') state.audits.push(data)
    else {
      const { progressUpdates, ...fields } = data
      state.task = { ...state.task, ...fields }
      if (progressUpdates) {
        const history = state.task.progressUpdates || []
        if (!history.some(entry => entry.id === progressUpdates.append.id)) state.task.progressUpdates = [...history, progressUpdates.append]
      }
    }
  }
}
