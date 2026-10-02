# HRFlow Rust web/PWA migration plan

Replace the production React web/PWA screens and workflows with a Rust-authored Leptos client. Keep Firebase and browser operations behind typed platform boundaries. Keep the currently deployed React application as the production authority. Work on `feat/hrflow-rust-web-migration`, with local commits only after each unit passes its checks. Android stays paused. No Rust deployment of any kind or merge to `main` is permitted until all nine final release gates pass and the user separately approves a later cutover.

## How to read this

One box is one unit of work. Each box names the evidence that proves it. Check a box only after that evidence exists. A nested box is one part of its parent unit.

Run this plan as a sequence of isolated branch units using the repository's [Rust migration stack](../RUST_MIGRATION_STACK.md) and the compatible parts of the vendored [multi-phase planning playbook](../tools/cursor-plugin-snapshots/pstack/skills/poteto-mode/playbooks/multi-phase-plan.md). Use the coordinator and available subtask tools only where a distinct read or review helps. Do not claim that a Cursor `/goal`, `/loop`, CI run, forge operation, control skill, or review lane ran unless it actually ran. The user has authorized implementation. This plan adds no approval pause before implementation.

The current planning task ends after this plan and its decision audit pass local checks. It does not edit application code, commit, push, deploy, access Firebase, or claim that the migration is complete.

## Definition of done

The migration is done only when all of these counts reach their full denominators and each checked item links to evidence in `.audit/rust-web-migration.tsv`.

- Desktop registry: 25 of 25 source IDs have matching role visibility and behavior.
- Mobile registry: 22 of 22 source IDs have matching role visibility and behavior.
- Product and workflow inventory: all `W` boxes in the inventory section below pass. The current map checklist has 104 boxes. Unit 1 freezes the final denominator `W` before Rust feature work and records it in the audit.
- Role and surface matrix: all `R` source-distinct visibility, redirect, and permission cases pass. Unit 1 freezes `R` before Rust feature work and records the case list in the audit.
- Migration units: 8 of 8 units pass their exit checks and have a local commit created only after verification.
- Release gates: 9 of 9 gates pass on the exact release candidate.
- The Rust screens preserve the source PWA's data, access, route, service-worker, cache, push, export, error, offline, and recovery behavior. No prohibited backend, schema, cache, dual-write, broader-read, or security-rule change is introduced.
- The currently deployed React application remains the production authority until the 25 desktop IDs, 22 mobile IDs, all `R` role/surface cases, all `W` workflow items, all eight unit exits, and all nine release gates pass. A working build, synthetic prototype, or Rust screen alone never satisfies done. Passing these checks does not itself authorize a cutover: merging to `main` or deploying Rust still requires the user's separate approval for a later cutover.

A missing route, nested workflow, role case, test result, screenshot, performance measurement, data-side-effect comparison, rollback proof, or audit pointer leaves the migration not done. Do not round or infer a passing count.

## Scope, baseline, and risks

The source baseline is published `origin/main` at `c191ae98a8789e1b5cb93edcd904182ceb8f36e2`. The isolated worktree is `/workspace/hrflow-rust-migration` on `feat/hrflow-rust-web-migration` at that exact commit. The production PWA contract is documented in the [module migration map](RUST_MODULE_MIGRATION_MAP.md) and the [workspace boundary notes](RUST_WORKSPACE.md).

This worktree already contains uncommitted Rust pilots, fixtures, scripts, and migration notes. Preserve them. Do not stage them with a migration slice unless that slice changes them and its tests prove the change. Use path-specific staging. The separate `/workspace/hrflow-pwa` checkout contains user-owned Employee modal edits. Do not modify, stage, stash, reset, rebase, merge, or check out files there. Use the published baseline in this worktree. Leave the unmerged Share branch out of scope.

The migration covers all production web/PWA destinations and nested workflows in this plan. It does not migrate Android, replace Firebase with a backend, change schemas or stored data, change Firestore or Storage rules, widen reads, add a Rust-managed data cache, enable dual writes, or switch production traffic. Any proposal to change these boundaries requires separate explicit approval. Keep Android work paused on a separate future decision.

The plan has eight major units, 16 mapped product areas, 47 desktop and mobile registry entries, and multiple read-only and bounded-write slices. This is a multi-sprint effort, not a one-sprint UI rewrite. A calendar estimate is not reliable until Unit 1 freezes the production workflow inventory and Unit 2 proves the browser build and PWA path.

The supplied framework documents compare written proposals. They do not demonstrate production Firebase, PWA, accessibility, or performance parity. The current Rust attendance and leave crates prove only their documented fixture cases. The Dioxus attendance screen uses synthetic data. The migration map did not inspect deployed Firebase configuration or live business data, and it notes broad existing organization rules. The transaction callback bridge, organization-switch cache cleanup, service-worker update behavior, actual route-role matrix, baseline measurements, and safe test-project configuration remain open until their units produce evidence.

## Architecture decisions

Use Leptos CSR with Trunk for the Rust-owned web interface. Organize production views and workflows by feature. Use a small, typed JavaScript bridge around the official modular Firebase browser SDK. Keep Auth credentials in the browser form and JavaScript call. Send only typed outcomes and bounded feature DTOs into WASM. Never put passwords, tokens, raw Firebase objects, or broad employee records in WASM.

Keep the existing JavaScript service-worker and browser lifecycle code as PWA plumbing. Keep Firebase Auth persistence, Firestore IndexedDB persistence, listeners, transaction and batch behavior, Storage paths, cache cleanup, push, hosting rewrites, and legacy routes as explicit compatibility contracts. The JS bridge exposes feature operations such as a bounded employee page or an attendance change. It does not expose a generic Firestore path-based read or write API.

Carry forward the Dioxus candidate's read-only-first order, browser-only handling for sign-in secrets, and early proof of transaction-decision interop. Use an explicit organization generation on subscriptions and commands. Drop old feeds and reject old-generation results during organization changes. The existing React/Vite and Dioxus/Vite proposal remain alternatives only if the Leptos/Trunk build proof fails. Do not switch frameworks silently. Record a new architecture decision before changing the choice.

No performance advantage is assumed for Rust. Unit 1 records paired React measurements before Rust performance work. Set the numeric release limits from those measurements and lock them before measuring a Rust build. Use these initial guard formulas unless the paired baseline shows that a formula cannot be measured reliably. Record any replacement formula and its reason before Rust measurements begin.

- Cold shell-ready p95 and route-ready p95 must be at or below the paired React p95 plus the greater of 10 percent of that baseline or 100 ms.
- Initial compressed transfer must be at or below the paired React transfer plus the greater of 10 percent of that baseline or 256 KiB.
- Firestore queries must not read a wider scope or more documents than the matched React workflow. Compare query counts and payload bytes using the same fixture and identity.
- After 20 organization switches, retained memory must be no more than 10 percent above the paired React measurement, and no old-generation event may update the active screen.

These are upper bounds, not claims that Rust is faster. Unit 1 records browser version, viewport, CPU/network profile, fixture, warm or cold state, repetitions, p50, p95, transferred bytes, WASM bytes, data counts, and the raw evidence path for every paired measurement.

## Work rules and branch commits

Perform each unit in dependency order. Keep every unit on the existing isolated feature branch. Each unit ends in an independently reviewable local commit. Run the unit's checks before staging or committing. If a check fails, keep the unit uncommitted, fix or revert it, then rerun the checks. Do not make a commit that combines a failed unit with a later unit.

Run every migration test against a local host/browser and the Firebase emulator only. Temporary local development servers are local tests, not deployments. All test credentials and data must be synthetic or emulator-only; never access production Firebase, any live Firebase project, or real employee records. If the emulator cannot reproduce a required SDK contract, record the gap and stop before any live Firebase read or write. Never change Firebase rules as a workaround. No Rust deployment of any kind, including preview or staging, and no merge to `main` may occur until all nine final release gates pass and the user separately approves a later cutover.

For every mutation, preserve the source document paths, field encodings, IDs, timestamps, audit entries, transaction or batch boundaries, retry semantics, and persisted side effects. Compare before and after state in the emulator. Do not turn a pre-read plus write into a transaction. Prove that transaction callbacks are deterministic under SDK retries before migrating their writes.

Keep the decision log append-only. Put screenshots, traces, fixture reports, build outputs, and rollback receipts under `.audit/rust-web-migration-evidence/<unit-id>/` during execution. Do not create those evidence files during this planning task. Record a path and result for each unit in the existing `.audit/rust-web-migration.tsv` file.

## Route registry inventory

Match each registry entry, its role visibility, responsive layout, direct-load behavior, selected-tab state, and query handling against the frozen React baseline. A listed source ID may be intentionally hidden for a role or surface. Preserve that behavior rather than exposing every ID.

**Desktop registry, 25 IDs.** `chat` exists in the source registry but is hidden from the desktop sidebar and URL-tab allow-list. Keep that distinction.

- [ ] `employees` and its directory and detail entry points.
- [ ] `home` and the Dashboard tab.
- [ ] `attendance-list` and the Attendance tab.
- [ ] `tasks`.
- [ ] `salary-slip` and Payroll.
- [ ] `advance` and Advance/Expense.
- [ ] `approvals`.
- [ ] `correction` and Attendance Correction.
- [ ] `leave`.
- [ ] `letters` and HR Communications.
- [ ] `vehicle`.
- [ ] `operations`.
- [ ] `shift-planning`.
- [ ] `documents`.
- [ ] `fines`.
- [ ] `engage`.
- [ ] `chat` remains hidden from desktop navigation and URL-tab state.
- [ ] `recruitment`.
- [ ] `reports`.
- [ ] `accountant`.
- [ ] `portal` and My Portal.
- [ ] `attendance-reports`.
- [ ] `site-reports` and Site Report.
- [ ] `settings`.
- [ ] `help`.

**Mobile registry, 22 IDs.** Preserve mobile-only names and role-specific behavior. Mobile Team Chat remains distinct from the hidden desktop entry.

- [ ] `home`.
- [ ] `attendance-list`.
- [ ] `tasks`.
- [ ] `employees`.
- [ ] `correction`.
- [ ] `leave`.
- [ ] `approvals`.
- [ ] `letters`.
- [ ] `documents`.
- [ ] `summary`.
- [ ] `recruitment`.
- [ ] `advance`.
- [ ] `salary-slip`.
- [ ] `fines`.
- [ ] `vehicles`.
- [ ] `engage`.
- [ ] `chat` and Team Chat.
- [ ] `shift-planning`.
- [ ] `portal`.
- [ ] `attendance-reports`.
- [ ] `settings`.
- [ ] `help`.

Preserve `/login`, protected `/`, and protected `/mobile`. Preserve `/tasks` and `/tasks/checklist` redirects into dashboard tab and query state. Preserve unknown-path fallback to `/`, browser back and forward, direct refresh, selected-tab query state, and the signed-in mobile redirect. Freeze any additional legacy paths, query names, role filters, and subtabs found in Unit 1 before migrating them.

## Product and workflow inventory

These checks expand the 16 product rows in the source map. They cover the product destinations and nested workflows, not just Rust module names. Unit 1 may add a source-confirmed item before implementation. It may not remove or combine an item without recording source evidence and a superseding decision-log row. Before Unit 2 starts, freeze the final workflow denominator `W` and the role/surface case denominator `R`. If later source inspection finds a missing source behavior, append a decision row with the evidence and revised count before implementing that behavior. Never change either count silently.

### App shell and identity

- [ ] Sign-in, sign-out, Auth persistence, session restore, and auth failure.
- [ ] Organization join, create, selection, and active-organization switch.
- [ ] Source organization resolution order, legacy fields, and active-organization synchronization.
- [ ] Role and permission display, forbidden destination, and permission-denied recovery.
- [ ] Desktop and mobile route selection, selected tab, subtabs, and query state.
- [ ] Bootstrap, loading, signed-out, no-organization, offline-unresolved, and fatal-error states.
- [ ] Service-worker registration, update notice or automatic update, reload, and recovery.

### Home, dashboard, summary, and reports

- [ ] Home and dashboard totals from employees, attendance, corrections, shifts, settings, deductions, and expenses.
- [ ] Summary date windows, saved preferences, cache state, and empty or error results.
- [ ] Site Report totals, scope, source data, and output.
- [ ] PDF and CSV exports preserve columns, values, naming, privacy, and user-visible download behavior.

### Employee directory, details, approvals, and lifecycle

- [ ] Employee directory, filtering, detail view, birthdays, and data-approval queue.
- [ ] Profile-change review and approval workflow.
- [ ] Onboarding checklist and employee lifecycle transitions.
- [ ] Offboarding workflow, audit events, and recovery from partial failure.
- [ ] Employee field minimization for identity, bank, tax, and payroll data.

### My Portal and employee self-service

- [ ] Employee-to-account mapping and own-record access.
- [ ] Employee profile and profile-change request.
- [ ] Self-service attendance, attendance request, and attendance image or selfie upload.
- [ ] Leave request and its shared approval and coverage workflow.
- [ ] Salary-slip window, payslip view, and payroll summary view.
- [ ] Assigned tasks and employee task checklist.
- [ ] Employee communications and acknowledgement.
- [ ] Employee advance and expense requests and their shared approvals.
- [ ] Profile image or document upload and access to linked files.

### Attendance, corrections, OT, and shifts

- [ ] Attendance view, date and employee filters, and persisted classification.
- [ ] Single attendance create, edit, and delete.
- [ ] Bulk attendance create, edit, and delete with exact batch limits.
- [ ] Attendance corrections and correction queue decisions.
- [ ] Overtime approval and adjustment workflows.
- [ ] Shift planning, assignment, and coverage.
- [ ] Site and time reporting, including payroll input values.
- [ ] Leave coverage, payroll-lock reads, conflict handling, and audit side effects.

### Leave, entitlement, balance, and lifecycle

- [ ] Leave policy and calendar reads.
- [ ] Entitlement calculation, legacy balances, accrual, holidays, half days, and sandwich treatment.
- [ ] Leave request, approval, rejection, cancellation, and reversal.
- [ ] Employee balance and ledger entries.
- [ ] Attendance coverage creation and reversal.
- [ ] Lifecycle events, audit logs, deterministic IDs, retries, and payroll-lock refusal.

### Payroll, salary configuration, slips, and loans

- [ ] Salary settings, slabs, increments, and source-compatible legacy values.
- [ ] Payroll inputs from attendance, leave, holidays, loans, fines, advances, allowances, and reimbursements.
- [ ] Payroll run calculation, rounding, proration, deductions, snapshots, and saved run state.
- [ ] Payslip generation, retrieval, employee window, and employee portal view.
- [ ] Loan workflow and payroll linkage.
- [ ] Payroll lock, reopen, retry, approval, transaction, and batch behavior.

### Advances, expenses, claims, allowances, fines, and approvals

- [ ] Employee advance and expense requests.
- [ ] Linked advance, expense, and loan conversion records.
- [ ] Accountant claims and reimbursement workflow.
- [ ] Allowance categories, eligibility, and payroll inclusion.
- [ ] Fine creation, review, adjustment, and payroll inclusion.
- [ ] Multi-stage approval and payment queue.
- [ ] CSV import, CSV export, and PDF output.
- [ ] Duplicate, retry, audit, authorization, and persisted-state behavior.

### Tasks, checklists, ideas, reminders, and approvals

- [ ] Organization task assignment, list, status, escalation, and completion.
- [ ] Mobile task list and employee task list.
- [ ] Daily checklist and its legacy route redirect.
- [ ] Ideas and engagement actions.
- [ ] Reminders and scheduled task notifications.
- [ ] Attendance approval queue remains owned by the attendance workflow.
- [ ] Advance, expense, allowance, and portal approval decisions remain owned by their source workflows.
- [ ] Push permission, delivery, click destination, retry, and disabled-permission fallback.

### Recruitment and hiring

- [ ] Jobs and applicants.
- [ ] Candidate stage transitions, audit history, and privacy.
- [ ] Hired candidate to onboarding checklist handoff.
- [ ] Hiring does not create an employee account or infer salary, bank, tax, or payroll data.

### Documents and file management

- [ ] Document metadata and organization-scoped list.
- [ ] Upload, download, delete, version, and linked-file behavior.
- [ ] File size, type, owner, and Storage path checks.
- [ ] Employee portal and communication file links.
- [ ] Cleanup recovery, audit records, and access denial.

### HR communications, letters, policies, training, and archive

- [ ] Letters and issue workflow.
- [ ] Announcements and publication workflow.
- [ ] Policy documents and effective dates.
- [ ] Training programs and acknowledgements.
- [ ] Communication templates and legacy formats.
- [ ] Recipient selection and audience isolation.
- [ ] Delivery records, retries, communication audit, acknowledgement, archive, withdrawal, and expiry.

### Engagement, team chat, and activity

- [ ] Engagement content and replies.
- [ ] Team Chat and message ordering.
- [ ] Chat attachment upload and download.
- [ ] Activity log and its sidebar behavior.
- [ ] Mobile unread chat and task counts.
- [ ] Realtime listener cancellation on route, sign-out, and organization switch.

### Operations, important dates, and fleet

- [ ] Important dates.
- [ ] Vehicle management, service history, and service intervals.
- [ ] Vehicle mileage, odometer, and audit history.
- [ ] Operations shift and site views.
- [ ] Employee vehicle portal and its distinct permissions.
- [ ] Service and document images, PDF export, deletion, and audit behavior.

### Settings, roles, and policies

- [ ] Organization settings and user records.
- [ ] Roles and permission display.
- [ ] Shift and site settings, including remarks.
- [ ] Salary slab settings.
- [ ] Holiday and geofence settings.
- [ ] Approval workflow and portal approval settings.
- [ ] Allowance, attendance, and leave policy settings.
- [ ] Settings writes remain deferred until every consuming workflow passes its gate.
- [ ] No Firestore or Storage security-rule change and no client-only authorization claim.

### Help, exports, notifications, and shared states

- [ ] Help destination and content.
- [ ] Summary, Site Report, advances and expenses, vehicle mileage, and payroll exports.
- [ ] Push registration, background notification, click handling, and notification failure state.
- [ ] Loading, empty, stale cache, pending local write, offline, permission denied, conflict, retry, and unknown error behavior.
- [ ] No stale employee or payroll state leaks after sign-out or organization switch.
- [ ] Shared keyboard, screen-reader, focus, contrast, reduced-motion, and mobile interaction behavior.

## Migration units

Each unit below ends in a local commit on the isolated feature branch. Its commit is not eligible for production or `main` while a later unit or global gate is open. Local commits do not authorize a merge or deployment; the no-deployment and later user-approved cutover boundary below applies to every unit. The evidence path must resolve before the decision log marks the unit verified.

### Unit 1. Freeze the React source contract and baseline

**Depends on.** The published baseline at `c191ae98a8789e1b5cb93edcd904182ceb8f36e2`.

**Work.** Read the baseline from this worktree. Do not inspect or modify the protected PWA checkout. Inventory every route, desktop and mobile destination, role filter, tab, subtab, query parameter, legacy route, and user-visible state. Build a row-based role/surface matrix in `.audit/rust-web-migration-evidence/U01/role-surface-matrix.tsv`. Give each row a stable case ID, surface, route ID, source role or permission fixture, expected visibility or redirect, allowed actions, relevant state, and screenshot or test evidence. Cover admin, every source-distinct non-admin permission behavior, employee self-service, denied access, and desktop/mobile differences. Count the rows as `R`. Trace Auth, Firestore, Storage, worker, push, export, host rewrite, and cache-cleanup paths to their callers. Record collection paths, query filters and limits, listener lifetimes, transaction reads and writes, batches, IDs, timestamps, fields, and audit side effects.

Capture React screenshots for each reachable destination and each materially different role/layout in a local browser against a local host. Include representative loading, empty, cached/offline, denied, failed, modal, and recovery states. Capture paired startup and representative interaction timings, compressed route bundles, query/document counts, payload sizes, and the browser/device settings. Use synthetic role credentials and synthetic fixtures or the Firebase emulator only. Do not access production Firebase, any live Firebase project, or real employee data.

Set the performance thresholds from these React measurements before any Rust measurements. Use the numeric guard formulas in Architecture decisions. Save baseline screenshots and raw measurements in `.audit/rust-web-migration-evidence/U01/`.

**Exit checks.**

- [ ] The route and role inventory contains 25 desktop IDs and 22 mobile IDs with intentional hidden states called out.
- [ ] All 16 rows from the module map have source paths, query and mutation contracts, visible states, and dependencies.
- [ ] Every actual subflow is represented in the product and workflow inventory above or added with a source pointer and audit row.
- [ ] The role/surface matrix covers each source-distinct visibility, redirect, and permission behavior for all route IDs, including admin, non-admin permission fixtures, employee self-service, denied access, and desktop/mobile differences. Record the exact `R` row count.
- [ ] Record the final `W` workflow-box count. Freeze both `R` and `W` in the decision log before Unit 2 or any Rust feature implementation.
- [ ] Baseline screenshots, timing samples, bundle bytes, data counts, and performance formulas exist and identify their fixture and source SHA.
- [ ] Auth persistence, Firestore persistence and listener behavior, transaction and batch paths, Storage paths, service-worker lifecycle, cache cleanup, push, Hosting and Vercel rewrites, and legacy route/query behavior have source evidence.

**Commit rule.** Commit only the verified source-contract fixtures and baseline tooling for this unit. Do not stage existing Rust pilots, user-owned PWA edits, generated APKs, or unrelated files.

### Unit 2. Prove the Leptos, Trunk, Firebase bridge, and PWA build

**Depends on.** Unit 1's frozen source contract and measurements.

**Work.** Add the smallest real Leptos CSR and Trunk build proof to the isolated branch. Pin the Rust, Leptos, Trunk, wasm-bindgen, Node, and bridge-bundle versions. Prove that the official modular Firebase SDK bridge builds as a typed browser bundle beside the Trunk output. Prove the Rust and TypeScript wire contract with generated declarations or a deterministic contract check.

Keep the current JavaScript service-worker behavior. Produce one coherent manifest, precache graph for the actual release assets, update and activation path, stable root scope, push import, WASM MIME and cache headers, and deep-route fallback. Test the new app and the previous React artifact in local host/browser sessions, using only synthetic data and the Firebase emulator. Prove locally that rollback restores the React entry and that the worker does not keep incompatible assets or strand an old page. A temporary local development server is a local test, not a deployment.

**Exit checks.**

- [ ] A clean locked build creates the Leptos/WASM app and typed Firebase bridge from the documented commands.
- [ ] The released asset graph includes the actual HTML, loader, WASM, bridge, styles, manifest, icons, and worker imports.
- [ ] Manifest install, root scope, precache, offline app-shell, update, push import, deep-route refresh, and local host rewrite/fallback behavior pass in a local browser session.
- [ ] Rollback to the prior React artifact passes on that origin.
- [ ] No backend, new data cache, dual write, schema change, or rule change is present. No Rust deployment of any kind (including preview or staging) or merge to `main` is authorized before all nine final release gates pass and the user separately approves a later cutover.

**Commit rule.** Commit the verified build and local test harness only after all exit checks pass.

### Unit 3. Prove Auth, organization context, and stale-result isolation

**Depends on.** Unit 2's build proof.

**Work.** Implement the typed Auth and organization bootstrap against the frozen source contract. Keep password and provider values in the browser form and JavaScript Auth call. Preserve Auth persistence, signed-in and signed-out transitions, legacy organization fields, membership and role resolution, and any existing active-organization synchronization. Add an explicit organization generation to feature subscriptions and commands. Stop old listeners on switch and reject callbacks or command results from the old generation.

Prove the Firebase SDK transaction-decision bridge against the emulator now, before any production workflow write migration. The JavaScript SDK owns its normal transaction and retry boundary. Rust returns only a pure, deterministic decision over a typed snapshot. Test retries and conflicts. If the interop cannot preserve the existing transaction's atomic boundary, mark the unit NOT VERIFIED and stop all write migration until the design is corrected.

**Exit checks.**

- [ ] Auth persistence, bootstrap precedence, legacy fields, and visible failure states match the frozen React fixtures.
- [ ] Credentials never enter WASM DTOs, logs, screenshots, or traces.
- [ ] After an organization switch, old subscriptions are disposed and no old-generation callback can update the new screen.
- [ ] Repeated switches and partial cleanup failure preserve the source cache and recovery behavior.
- [ ] Emulator transaction tests prove deterministic decision interop under retry, conflict, and concurrent update.

**Commit rule.** Commit the Auth and organization boundary only after the stale-result and transaction bridge checks pass.

### Unit 4. Build the Rust shell and role-specific route registries

**Depends on.** Unit 3's Auth and organization contracts.

**Work.** Implement the Leptos shell, route guards, bootstrap status, responsive desktop and mobile registries, tab and subtab state, and document titles. Keep the desktop and mobile registries separate where the baseline differs. Preserve the hidden desktop `chat` ID and the mobile Team Chat destination.

**Exit checks.**

- [ ] All 25 desktop and 22 mobile registry entries match the captured IDs, ordering, role visibility, redirect behavior, and responsive destination.
- [ ] All `R` role/surface matrix cases pass with evidence for the exact source role, route, surface, and expected visible or denied state.
- [ ] `/login`, `/`, `/mobile`, `/tasks`, `/tasks/checklist`, unknown paths, direct refresh, browser history, and selected query state match React.
- [ ] Keyboard focus and screen-reader route status are observable through the shell.
- [ ] Sign-in, organization loading, offline-unresolved, no-access, and bootstrap failure states match the reference.

**Commit rule.** Commit the shell only after the route and role inventory passes in local desktop and mobile browser sessions with synthetic or emulator data.

### Unit 5. Migrate feature reads before writes

**Depends on.** Unit 4's route shell and the typed Firebase read boundary.

**Work.** Migrate feature-owned read models in small commits. Start with Home, Dashboard, Summary, Site Report, the employee directory and details, then employee portal reads. Continue with read-only tasks, recruitment, documents, communications, operations, fleet, settings, and help. Each view receives only bounded typed DTOs and Firestore cache/pending-write metadata. Keep all mutation controls disabled or routed to the live React reference until their owning write unit passes.

**Exit checks.**

- [ ] Every read-only destination and read subflow in the inventory matches React for the same role, fixture, query scope, sort, pagination, and date window.
- [ ] Loading, empty, cache-stale, offline, denied, failed-query, retry, and last-good-data states match the source behavior.
- [ ] Query paths, limits, employee fields, and document counts are no broader than React.
- [ ] Exports match React contents and do not expose fields outside the source audience.
- [ ] No Rust-owned feature issues a write during this unit.

**Commit rule.** Make one verified commit per independently testable read slice. Do not combine unrelated features.

### Unit 6. Migrate financial inputs and the Attendance, Leave, and Payroll-lock invariant

**Depends on.** Units 1 through 5, including transaction-decision interop.

**Work.** Migrate bounded financial inputs before payroll. Cover advances, expenses, accountant claims, reimbursements, allowances, fines, loans, linked records, and their approval and payment states. Verify each mutation's authorization, idempotency, audit history, retry behavior, and payroll inclusion.

Then migrate Attendance, corrections, overtime approvals, shifts, Leave, entitlements, ledger, leave coverage, and shared approvals as one release invariant. Keep payroll-lock reads and write decisions in the same tested boundary. Treat approval records as owned by the workflow they decide. Verify all persisted side effects and conflicts in the emulator. No individual attendance or leave write switch is allowed while the other workflow can violate the shared invariant.

**Exit checks.**

- [ ] Each financial input matches the source representation and payroll inclusion rules before payroll work begins.
- [ ] Attendance and Leave preserve corrections, OT, batch limits, coverage, ledger, audit, IDs, retries, concurrency, and payroll-lock behavior.
- [ ] Emulator before/after comparisons match every document and audit side effect for success, refusal, retry, and conflict cases.
- [ ] The shared invariant passes while writes remain emulator-only. No live Firebase or dual-write path is enabled.

**Commit rule.** Commit each verified financial-input slice separately. Commit the shared Attendance and Leave release invariant only after both workflows and their cross-module tests pass together.

### Unit 7. Complete remaining workflows and the Payroll capstone

**Depends on.** Unit 6's financial input contracts and shared lock invariant.

**Work.** Finish the remaining inventory in separately verified commits. Migrate recruitment and lifecycle; document metadata and Storage operations; HR letters, communications, publication and delivery; operations and fleet; tasks, chat, engagement, reminders, activity and push; settings and roles; help, exports and shared states. Complete each feature's read path first, then its own bounded writes. Defer settings writes until every workflow that consumes those settings passes.

Migrate payroll only after finance inputs, salary configuration, Attendance, Leave, corrections, approvals, and payroll locks all pass. Port calculations and snapshots before enabling payroll-run writes. Compare rounding, proration, legacy values, deductions, batch limits, idempotency, approvals, lock/reopen behavior, payslips, and employee portal reads.

**Exit checks.**

- [ ] Recruitment and lifecycle preserve candidate privacy and do not silently create employee accounts or infer sensitive payroll fields.
- [ ] Document, image, and chat file operations preserve source Storage paths, access checks, metadata, versioning, audit, and failure recovery.
- [ ] Communications preserve audience, publication, delivery, acknowledgement, archive, withdrawal, and retry behavior.
- [ ] Operations, fleet, tasks, chat, roles, settings, exports, push, and help pass their inventory items with role-specific access and responsive behavior.
- [ ] Settings writes occur only after each affected consumer passes.
- [ ] Payroll reads and writes match source totals and every persisted run, slip, snapshot, audit, and lock side effect.
- [ ] Every feature has bounded reads and no duplicate write, broader read, or unauthorized field exposure.

**Commit rule.** Commit each verified feature slice separately. Keep the payroll cutover disabled until all payroll checks and the shared lock invariant pass.

### Unit 8. Pass the release gates and define the safe cutover

**Depends on.** All prior units and every inventory item.

**Work.** Run the full browser suite locally against the release candidate at its exact isolated-branch commit. Test representative roles using synthetic credentials and synthetic or emulator data in local desktop and mobile browser sessions. Exercise the PWA locally from install through offline use, update, push, deep-link refresh, organization switch, sign-out, and rollback, using a local host or temporary local development server only. Compare every applicable screen, data side effect, query count, timing, transfer size, accessibility result, and browser failure state with the React baseline. Keep the React build and hosting configuration files ready for a local rollback test; do not use a deployed origin.

**Exit checks.**

- [ ] All 25 desktop IDs, 22 mobile IDs, all `R` role/surface cases, and all `W` feature/workflow inventory boxes have evidence.
- [ ] All 8 unit exits and 9 release gates pass at the exact candidate SHA.
- [ ] The final `W` and `R` values match the denominators frozen at Unit 1 or superseded by source evidence before the affected Rust work.
- [ ] No credential, token, broad employee record, or prohibited cache crosses into WASM or logs.
- [ ] No schema, rule, backend, dual-write, or broader-read change exists.
- [ ] Local rollback testing restores the React entry, deep routes, synthetic/emulator Auth session, worker scope, and prior asset graph in a local browser session.
- [ ] The currently deployed React application remains production-authoritative until these checks pass; passing them does not authorize a merge or deployment without the user's separate later-cutover approval.

**Commit rule.** Commit the final integration and release evidence only after every gate passes. Do not merge the Rust branch into `main` or deploy any Rust artifact to any environment, including preview or staging, until all nine final release gates pass and the user separately approves a later cutover. Passing this unit alone is not cutover approval. Preserve the exact React release artifact and hosting configuration for local rollback testing. A later cutover is a separate user-approved action outside this plan, not part of a feature commit.

## Release gates

A release candidate here is only the exact isolated-branch commit and its locally built artifact; it is not a deployed release. Every applicable gate must have recorded evidence from local host/browser tests and synthetic credentials/data or the Firebase emulator. A skipped or inconclusive result is not a pass, and passing gates does not authorize a merge or deployment.

- [ ] **Functional parity.** Every inventory item matches React for representative roles and fixtures, including success, loading, empty, stale, failure, retry, conflict, and recovery states.
- [ ] **Data parity.** Reads use source paths, limits, IDs, field encodings, and document counts. Writes match the complete persisted before/after state, transaction boundary, batch behavior, audit entries, and retry result.
- [ ] **Access and privacy.** Test tenant, role, employee, and field isolation against the Firebase emulator using synthetic role credentials and data. Preserve source rules. Do not treat client permissions as server authorization. Do not expose credentials, tokens, or broad employee records to WASM or logs.
- [ ] **PWA install and routing.** Manifest, icons, stable root scope, deep-route rewrites, direct refresh, query redirects, asset MIME/cache headers, and browser install behavior pass in local browser sessions against a local host and its local rewrite/fallback configuration; no external or deployed origin is used.
- [ ] **Offline and update.** Auth persistence, Firestore IndexedDB behavior, pending local writes, worker precache, update activation, push, notification clicks, cache cleanup, and rollback match the baseline. No new Rust data cache exists.
- [ ] **Organization isolation.** The generation fence discards old listener and command results. Cache cleanup and recovery pass after 20 repeated organization switches with no stale cross-organization display.
- [ ] **Accessibility and responsive use.** Keyboard-only navigation, focus, accessible names, screen-reader announcements, contrast, reduced motion, dialogs, dense tables, and mobile touch paths pass for representative roles and workflows.
- [ ] **Performance and payload.** Paired p95 startup and interaction timings, compressed asset bytes, data counts, and memory meet the numeric limits frozen in Unit 1. No claim of Rust speed substitutes for measurement.
- [ ] **Rollback.** Locally restore the React artifact after the Rust candidate has exercised routes and emulator writes in local browser sessions. Verify the locally run React app reads the resulting source-compatible emulator data and worker/cache state recovers. Keep the currently deployed React application as production authority; no Rust deployment occurs for this test.

## Safe cutover boundary

All migration verification, including the nine final release gates, must use local host/browser tests and the Firebase emulator only. Temporary local development servers are local tests, not deployments. Use synthetic credentials and synthetic fixtures or emulator data only. Do not access production Firebase, any live Firebase project, or real employee data. Rust writes remain emulator-only. Do not run React and Rust as competing writers.

No Rust deployment of any kind—including preview or staging—and no merge to `main` may occur until all nine final release gates pass and the user separately approves a later cutover. Passing Unit 8, passing all gates, or creating local commits does not itself authorize a cutover. Keep the currently deployed React application as the production authority. Do not change production routes, traffic, Firebase rules, schemas, stored records, or write authority under this plan.

After all nine gates pass, stop with the verified candidate on the isolated branch. A later cutover requires separate user approval and a separate plan/action; no promotion, deployment, or post-deployment steps are directed here. Preserve the exact React release artifact, Hosting and Vercel rewrite configuration, worker scope, and rollback command for reference and local rollback testing. Keep Firestore and Storage schemas and rules unchanged throughout.

## Plan validation and current result

The vendored `check-plan.mjs` is not compatible with this plan or the available execution environment. It requires Cursor-specific `/goal` and `/loop` automation, a `swarm` model, ten live screenshot lanes per PR, `control-ui` or `control-cli`, PR mechanics, and a review gate that waits for an operator. The current environment has no such Cursor Task, control-skill, or automation lane. Running that validator would force invented lanes and a new approval pause, contrary to the task's explicit instructions. The plan records this exact incompatibility and does not claim those tools ran.

Use local checks for the plan structure, local links, route and workflow counts, branch and production guardrails, done predicate, TSV shape, and evidence paths. Those checks apply to this planning artifact only. The complete Rust migration remains open and is not claimed done.
