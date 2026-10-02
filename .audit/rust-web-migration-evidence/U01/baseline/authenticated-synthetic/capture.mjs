import { chromium } from 'playwright-core'
import { mkdirSync, writeFileSync } from 'node:fs'
import { basename, dirname, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { performance } from 'node:perf_hooks'
import os from 'node:os'

const here = dirname(fileURLToPath(import.meta.url))
const projectId = 'demo-hrflow-u01'
const base = 'http://127.0.0.1:4173'
const password = 'EmuOnly-U01-Synthetic-2026!'
const desktop = { width: 1440, height: 900 }
const mobile = { width: 390, height: 844 }
const allowedPorts = new Set(['4173', '8080', '9099', '9199'])
const allowedHosts = new Set(['127.0.0.1', 'localhost', '[::1]', '::1'])
const runId = `run-${new Date().toISOString().replace(/[:.]/g, '-')}`
const out = join(here, runId)
mkdirSync(out, { recursive: false })

function localAllowed(url) {
  return (url.protocol === 'http:' || url.protocol === 'https:') && allowedHosts.has(url.hostname) && allowedPorts.has(url.port || (url.protocol === 'https:' ? '443' : '80'))
}
function shortName(value) { return value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') }
function sleep(ms) { return new Promise(resolve => setTimeout(resolve, ms)) }

const browser = await chromium.launch({
  headless: true,
  executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium',
  args: [
    '--no-sandbox',
    '--disable-dev-shm-usage',
    '--disable-background-networking',
    '--disable-component-update',
    '--disable-sync',
    '--disable-features=MediaRouter,OptimizationHints,AutofillServerCommunication',
    '--no-proxy-server',
    '--host-resolver-rules=MAP * ~NOTFOUND,EXCLUDE localhost,EXCLUDE 127.0.0.1,EXCLUDE ::1'
  ]
})
const browserVersion = browser.version()
const trace = {
  runId,
  generatedAt: new Date().toISOString(),
  projectId,
  origin: base,
  browser: { product: 'Chromium', version: browserVersion, executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium', headless: true },
  runtime: { node: process.version, platform: process.platform, arch: process.arch, kernel: os.release(), cpus: os.cpus().length, memoryBytes: os.totalmem() },
  viewports: { desktop: { ...desktop, deviceScaleFactor: 1 }, mobile: { ...mobile, deviceScaleFactor: 1, emulatedMobile: true, touch: true, physicalDevice: false } },
  networkPolicy: {
    allow: ['http://127.0.0.1:4173 (Vite preview)', 'http://127.0.0.1:8080 (Firestore emulator)', 'http://127.0.0.1:9099 (Auth emulator)', 'http://127.0.0.1:9199 (Storage emulator)'],
    deny: 'Every browser HTTP/HTTPS request to any hostname/IP/port not exactly in the loopback allowlist is aborted at Playwright context routing; every WebSocket not in the same allowlist is closed; Chromium host resolution maps all names to NOTFOUND except localhost/127.0.0.1/::1; proxying is disabled; service workers are blocked.',
    blockedExternalRequests: [],
    allowedOriginsObserved: [],
    websocketAttempts: []
  },
  captures: [],
  browserErrors: [],
  failedRequests: []
}
const allowedOrigins = new Set()
let delayFirstPasswordSignIn = true
let adminSignInDelayApplied = false

async function newContext(viewport, isMobile) {
  const context = await browser.newContext({
    viewport,
    deviceScaleFactor: 1,
    isMobile,
    hasTouch: isMobile,
    serviceWorkers: 'block',
    acceptDownloads: false,
    ignoreHTTPSErrors: false
  })
  await context.route('**/*', async route => {
    const request = route.request()
    let parsed
    try { parsed = new URL(request.url()) } catch {
      trace.networkPolicy.blockedExternalRequests.push({ url: request.url(), method: request.method(), resourceType: request.resourceType(), reason: 'URL parse failure' })
      return route.abort('blockedbyclient')
    }
    if (localAllowed(parsed)) {
      allowedOrigins.add(parsed.origin)
      if (!isMobile && delayFirstPasswordSignIn && parsed.origin === 'http://127.0.0.1:9099' && parsed.pathname.includes('accounts:signInWithPassword') && request.method() === 'POST') {
        delayFirstPasswordSignIn = false
        adminSignInDelayApplied = true
        await sleep(1200)
      }
      return route.continue()
    }
    trace.networkPolicy.blockedExternalRequests.push({ url: request.url(), method: request.method(), resourceType: request.resourceType(), reason: 'outside explicit loopback allowlist' })
    return route.abort('blockedbyclient')
  })
  if (typeof context.routeWebSocket === 'function') {
    await context.routeWebSocket('**/*', socket => {
      const target = new URL(socket.url())
      const allowed = (target.protocol === 'ws:' || target.protocol === 'wss:') && allowedHosts.has(target.hostname) && allowedPorts.has(target.port)
      if (allowed) socket.connectToServer()
      else {
        trace.networkPolicy.websocketAttempts.push({ url: socket.url(), blocked: true })
        socket.close({ code: 1008, reason: 'U01 loopback-only network policy' })
      }
    })
  }
  return context
}

function attachPageLogs(page, persona, surface) {
  page.on('pageerror', error => trace.browserErrors.push({ persona, surface, kind: 'pageerror', message: String(error).slice(0, 1500), url: page.url() }))
  page.on('console', message => {
    if (message.type() === 'error') trace.browserErrors.push({ persona, surface, kind: 'console-error', message: message.text().slice(0, 1500), url: page.url() })
  })
  page.on('requestfailed', request => trace.failedRequests.push({ persona, surface, url: request.url(), failure: request.failure()?.errorText || 'unknown', resourceType: request.resourceType() }))
}

async function observedState(page) {
  return page.evaluate(() => {
    const visible = el => !!(el && (el.offsetWidth || el.offsetHeight || el.getClientRects().length))
    const text = (document.body?.innerText || '').replace(/\s+/g, ' ').trim()
    const headings = [...document.querySelectorAll('h1,h2,h3')].filter(visible).map(e => e.innerText.replace(/\s+/g, ' ').trim()).filter(Boolean).slice(0, 12)
    const alerts = [...document.querySelectorAll('[role="alert"],[aria-live="assertive"],[aria-live="polite"]')].filter(visible).map(e => e.innerText.replace(/\s+/g, ' ').trim()).filter(Boolean).slice(0, 12)
    const emptyText = text.match(/(?:no\s+(?:[a-z0-9 '-]+\s+)?(?:found|records?|requests?|data|tasks?|employees?|items?|results?|pending)|nothing\s+(?:to\s+show|here)|empty\s+(?:state|list))/ig) || []
    const nav = performance.getEntriesByType('navigation')[0]
    const timing = nav ? Object.fromEntries(['responseStart','domContentLoadedEventEnd','loadEventEnd','duration','transferSize','encodedBodySize','decodedBodySize'].map(k => [k, nav[k]])) : null
    return { url: location.href, title: document.title, headings, alerts, emptyText: [...new Set(emptyText)].slice(0, 12), textExcerpt: text.slice(0, 700), navigationTiming: timing }
  })
}

async function record(page, persona, role, surface, routeId, requestedRoute, screenshotPath, actionMs, waitMs = 900, stateNote = '') {
  if (waitMs) await page.waitForTimeout(waitMs)
  const state = await observedState(page)
  const abs = join(out, screenshotPath)
  mkdirSync(dirname(abs), { recursive: true })
  await page.screenshot({ path: abs, fullPage: false, animations: 'disabled' })
  const actualViewport = await page.evaluate(() => ({ width: innerWidth, height: innerHeight, devicePixelRatio }))
  trace.captures.push({
    persona,
    role,
    surface,
    routeId,
    requestedRoute,
    observedUrl: state.url,
    observedTitle: state.title,
    observedHeadings: state.headings,
    observedAlerts: state.alerts,
    observedEmptyText: state.emptyText,
    observedTextExcerpt: state.textExcerpt,
    stateNote,
    dimensionsCssPx: actualViewport,
    actionDurationMs: Number(actionMs.toFixed(1)),
    settledForMs: waitMs,
    navigationTimingMsAndBytes: state.navigationTiming,
    screenshot: relative(out, abs)
  })
  return state
}

async function signIn(context, page, persona, email, role, surface) {
  attachPageLogs(page, persona, surface)
  await page.goto(`${base}/login`, { waitUntil: 'domcontentloaded', timeout: 20000 })
  await page.waitForTimeout(180)
  const visibleInputs = page.locator('input:visible')
  const count = await visibleInputs.count()
  let usableEmail = null
  for (let i = 0; i < count; i++) {
    const input = visibleInputs.nth(i)
    if ((await input.getAttribute('type'))?.toLowerCase() !== 'password') { usableEmail = input; break }
  }
  if (!usableEmail) throw new Error(`No visible sign-in identity field for ${persona}`)
  const passwordInput = page.locator('input[type="password"]:visible').first()
  await usableEmail.fill(email)
  await passwordInput.fill(password)
  const signInButton = page.getByRole('button', { name: 'Sign In', exact: true }).last()
  const started = performance.now()
  await signInButton.click()
  if (persona === 'synthetic-admin' && surface === 'desktop' && adminSignInDelayApplied) {
    // The request handler below delays this one Auth-emulator response, making the observed in-progress sign-in UI measurable.
    await page.waitForTimeout(220)
    await record(page, persona, role, surface, 'login-loading', '/login (synthetic Auth emulator sign-in in progress)', 'desktop/admin/sign-in-loading.png', performance.now() - started, 0, 'Observed transient UI while a loopback Auth-emulator sign-in response was intentionally delayed 1,200 ms; no form was submitted beyond this synthetic sign-in.')
  }
  await page.waitForFunction(() => location.pathname !== '/login', null, { timeout: 20000 })
  await page.waitForTimeout(450)
  return { started, elapsedMs: performance.now() - started }
}

async function createLoginContext(viewport, mobileSurface, persona, email, role) {
  const context = await newContext(viewport, mobileSurface)
  const page = await context.newPage()
  await signIn(context, page, persona, email, role, mobileSurface ? 'mobile' : 'desktop')
  return { context, page }
}

async function captureDesktopAdmin() {
  const persona = 'synthetic-admin'
  const role = 'admin'
  const { context, page } = await createLoginContext(desktop, false, persona, 'u01-admin@example.invalid', role)
  const routes = ['home','employees','attendance-list','tasks','salary-slip','advance','approvals','correction','leave','letters','vehicle','operations','shift-planning','documents','fines','engage','chat','recruitment','reports','accountant','portal','attendance-reports','site-reports','settings','help']
  for (const id of routes) {
    const started = performance.now()
    await page.goto(`${base}/?tab=${encodeURIComponent(id)}`, { waitUntil: 'domcontentloaded', timeout: 20000 })
    await record(page, persona, role, 'desktop', id, `/?tab=${id}`, `desktop/admin/${shortName(id)}.png`, performance.now() - started, 850,
      id === 'chat' ? 'Source matrix expects this desktop tab hidden; direct query behavior is recorded from the final observed URL and DOM.' : '')
  }
  const aliases = [
    ['legacy-tasks', '/tasks', 'desktop/admin/legacy-tasks.png'],
    ['legacy-tasks-checklist', '/tasks/checklist', 'desktop/admin/legacy-tasks-checklist.png'],
    ['advance-expense-alias', '/?tab=expense', 'desktop/admin/advance-expense-alias.png'],
    ['authenticated-unknown-route', '/u01-unknown-route', 'desktop/admin/unknown-route.png']
  ]
  for (const [routeId, requested, screenshot] of aliases) {
    const started = performance.now()
    await page.goto(`${base}${requested}`, { waitUntil: 'domcontentloaded', timeout: 20000 })
    await record(page, persona, role, 'desktop', routeId, requested, screenshot, performance.now() - started, 850,
      'Captured the authenticated client redirect/alias result without invoking a business action.')
  }
  await context.close()
}

async function captureDesktopEmployee() {
  const persona = 'employee-self-service-defaults'
  const role = 'employee'
  const { context, page } = await createLoginContext(desktop, false, persona, 'u01-employee@example.invalid', role)
  for (const id of ['portal','home','vehicle']) {
    const started = performance.now()
    await page.goto(`${base}/?tab=${encodeURIComponent(id)}`, { waitUntil: 'domcontentloaded', timeout: 20000 })
    await record(page, persona, role, 'desktop', id, `/?tab=${id}`, `desktop/employee/${shortName(id)}.png`, performance.now() - started, 850,
      id === 'vehicle' ? 'This is source-defined employee Vehicle self-service; no action was submitted.' : '')
  }
  await context.close()
}

async function capturePermissionPersonas() {
  const people = [
    ['permission-limited-view-only', 'u01-view-only@example.invalid', true],
    ['permission-limited-create-only', 'u01-create-only@example.invalid', true],
    ['permission-limited-edit-only', 'u01-edit-only@example.invalid', true],
    ['permission-limited-delete-only', 'u01-delete-only@example.invalid', true],
    ['permission-limited-approve-only', 'u01-approve-only@example.invalid', true],
    ['permission-limited-all-false', 'u01-no-permission@example.invalid', false]
  ]
  for (const [persona, email, allowed] of people) {
    const { context, page } = await createLoginContext(desktop, false, persona, email, 'staff')
    const started = performance.now()
    await page.goto(`${base}/?tab=employees`, { waitUntil: 'domcontentloaded', timeout: 20000 })
    await record(page, persona, 'staff', 'desktop', allowed ? 'employees' : 'client-denied-employees', '/?tab=employees', `desktop/permissions/${shortName(persona)}.png`, performance.now() - started, 900,
      allowed ? 'Employees module is visible under the exact one-hot client permission; no create/edit/delete/approve action was activated.' : 'All-false Employees permission: direct query was attempted to record client visibility/redirect only; this is not a backend authorization test.')
    if (!allowed) {
      const mobileContext = await newContext(mobile, true)
      const mobilePage = await mobileContext.newPage()
      attachPageLogs(mobilePage, persona, 'mobile')
      const loginStart = performance.now()
      await mobilePage.goto(`${base}/login`, { waitUntil: 'domcontentloaded', timeout: 20000 })
      const fields = mobilePage.locator('input:visible')
      let identity = null
      for (let i = 0; i < await fields.count(); i++) if ((await fields.nth(i).getAttribute('type'))?.toLowerCase() !== 'password') { identity = fields.nth(i); break }
      if (!identity) throw new Error('No mobile identity input for all-false synthetic persona')
      await identity.fill(email)
      await mobilePage.locator('input[type="password"]:visible').first().fill(password)
      await mobilePage.getByRole('button', { name: 'Sign In', exact: true }).last().click()
      await mobilePage.waitForFunction(() => location.pathname === '/mobile', null, { timeout: 20000 })
      await record(mobilePage, persona, 'staff', 'mobile', 'all-false-mobile-home', '/mobile', 'mobile/permissions/all-false-home.png', performance.now() - loginStart, 500, 'Observed the all-false persona mobile home before opening the drawer; availability is recorded separately from the open drawer.')
      await mobilePage.getByRole('button', { name: 'More', exact: true }).last().click()
      await record(mobilePage, persona, 'staff', 'mobile', 'client-hidden-employees', '/mobile → More', 'mobile/permissions/all-false-drawer-open.png', performance.now() - loginStart, 300, 'The source client’s drawer is open; absence of Employees is recorded as a hidden destination, not server denial.')
      await mobileContext.close()
    }
    await context.close()
  }
}

const mobileLabels = {
  employees: 'Employees',
  'attendance-list': 'Attendance',
  tasks: 'Tasks',
  'salary-slip': 'Payroll',
  advance: 'Advances',
  approvals: 'Approvals',
  correction: 'Correction',
  leave: 'Leave',
  letters: 'HR Communications',
  vehicle: 'Vehicles',
  vehicles: 'Vehicles',
  operations: 'Operations',
  'shift-planning': 'Shift Planning',
  documents: 'Documents',
  fines: 'Fines',
  engage: 'Engage',
  chat: 'Team Chat',
  recruitment: 'Recruitment',
  reports: 'Reports',
  accountant: 'Accountant',
  portal: 'My Portal',
  'attendance-reports': 'Attendance Reports',
  summary: 'Summary',
  settings: 'Settings',
  help: 'HELP'
}

async function openMobileModule(page, id) {
  if (id === 'home') {
    await page.getByRole('button', { name: 'Home', exact: true }).click()
    return
  }
  await page.getByRole('button', { name: 'More', exact: true }).last().click()
  const label = mobileLabels[id]
  if (!label) throw new Error(`No approved mobile label mapping for ${id}`)
  const target = page.getByRole('button', { name: label, exact: true }).last()
  await target.waitFor({ state: 'visible', timeout: 5000 })
  await target.click()
}

async function captureMobileAdmin() {
  const persona = 'synthetic-admin'
  const role = 'admin'
  const { context, page } = await createLoginContext(mobile, true, persona, 'u01-admin@example.invalid', role)
  await page.goto(`${base}/mobile`, { waitUntil: 'domcontentloaded', timeout: 20000 })
  await record(page, persona, role, 'mobile', 'initial-tab-state', '/mobile', 'mobile/admin/initial.png', 0, 850, 'Initial app state after an authenticated emulator sign-in.')
  const attendanceStarted = performance.now()
  await page.getByRole('navigation').getByRole('button', { name: 'Attendance', exact: true }).click()
  await record(page, persona, role, 'mobile', 'bottom-attendance-alias', '/mobile → bottom Attendance', 'mobile/admin/bottom-attendance.png', performance.now() - attendanceStarted, 850,
    'Fixed bottom Attendance alias selects the Attendance renderer; distinct from the More → Attendance registry-ID result recorded separately.')
  const routes = ['home','attendance-list','tasks','employees','correction','leave','approvals','letters','documents','summary','recruitment','advance','salary-slip','fines','vehicles','engage','chat','shift-planning','portal','attendance-reports','settings','help']
  for (const id of routes) {
    const started = performance.now()
    await openMobileModule(page, id)
    await record(page, persona, role, 'mobile', id, `/mobile → More → ${mobileLabels[id] || 'Home'}`, `mobile/admin/${shortName(id)}.png`, performance.now() - started, 850,
      id === 'attendance-list' ? 'Captured the source-visible Attendance tile; source matrix flags that its mobile ID does not match the Attendance renderer. Observed rendering is recorded, not normalized.' : '')
  }
  await context.close()
}

async function captureMobileEmployee() {
  const persona = 'employee-self-service-defaults'
  const role = 'employee'
  const { context, page } = await createLoginContext(mobile, true, persona, 'u01-employee@example.invalid', role)
  await page.goto(`${base}/mobile`, { waitUntil: 'domcontentloaded', timeout: 20000 })
  await openMobileModule(page, 'home')
  await record(page, persona, role, 'mobile', 'home', '/mobile → Home', 'mobile/employee/home.png', 0, 850)
  for (const id of ['portal','vehicles','tasks']) {
    const started = performance.now()
    await openMobileModule(page, id)
    await record(page, persona, role, 'mobile', id, `/mobile → More → ${mobileLabels[id]}`, `mobile/employee/${shortName(id)}.png`, performance.now() - started, 850,
      id === 'vehicles' ? 'Employee vehicle self-service destination; no mileage or vehicle mutation was submitted.' : '')
  }
  await context.close()
}

async function captureMobileViewOnly() {
  const persona = 'permission-limited-view-only'
  const role = 'staff'
  const { context, page } = await createLoginContext(mobile, true, persona, 'u01-view-only@example.invalid', role)
  await page.goto(`${base}/mobile`, { waitUntil: 'domcontentloaded', timeout: 20000 })
  await record(page, persona, role, 'mobile', 'home', '/mobile', 'mobile/permissions/view-only-home.png', 0, 500)
  const drawerStarted = performance.now()
  await page.getByRole('button', { name: 'More', exact: true }).last().click()
  await record(page, persona, role, 'mobile', 'view-only-drawer', '/mobile → More', 'mobile/permissions/view-only-drawer.png', performance.now() - drawerStarted, 300,
    'One-hot Employees.view fixture; drawer visibility is a source-client result, not a backend authorization test.')
  const employees = page.getByRole('button', { name: 'Employees', exact: true }).last()
  await employees.waitFor({ state: 'visible', timeout: 5000 })
  const destinationStarted = performance.now()
  await employees.click()
  await record(page, persona, role, 'mobile', 'employees', '/mobile → More → Employees', 'mobile/permissions/view-only-employees.png', performance.now() - destinationStarted, 850,
    'Opened the destination exposed by the view-only client permission; no employee mutation was submitted.')
  await context.close()
}

try {
  if (projectId !== 'demo-hrflow-u01') throw new Error('Unexpected project ID')
  await captureDesktopAdmin()
  await captureDesktopEmployee()
  await capturePermissionPersonas()
  await captureMobileViewOnly()
  await captureMobileAdmin()
  await captureMobileEmployee()
  trace.networkPolicy.allowedOriginsObserved = [...allowedOrigins].sort()
  trace.networkPolicy.blockedExternalRequests = [...new Map(trace.networkPolicy.blockedExternalRequests.map(r => [`${r.method} ${r.url}`, r])).values()]
  trace.browserErrors = [...new Map(trace.browserErrors.map(r => [`${r.persona}|${r.surface}|${r.kind}|${r.message}|${r.url}`, r])).values()]
  trace.failedRequests = [...new Map(trace.failedRequests.map(r => [`${r.persona}|${r.surface}|${r.url}|${r.failure}`, r])).values()]
  writeFileSync(join(out, 'capture-manifest.json'), JSON.stringify(trace, null, 2) + '\n')
  writeFileSync(join(here, 'latest-run.txt'), `${runId}\n`)
  console.log(JSON.stringify({ out, projectId, captures: trace.captures.length, blockedExternalRequests: trace.networkPolicy.blockedExternalRequests.length, allowedOriginsObserved: trace.networkPolicy.allowedOriginsObserved, browserErrors: trace.browserErrors.length, failedRequests: trace.failedRequests.length }, null, 2))
} finally {
  await browser.close()
}
