# Task progress and next follow-up

Task status remains unchanged: To Do, In Progress, On Hold, Review and Completed. Use **Progress updates** to record events such as “Client did not pick up” or “Supplier is preparing quotation” without changing status or replacing Internal Notes.

The shared editor is available in the desktop edit modal and task drawer, mobile task details, and the expandable **Progress & follow-up** section in My Tasks. Updates display newest first with author and timestamp. **Next follow-up date** is optional, can be cleared, and is separate from the existing due date and reminder settings; it does not schedule notifications.

**Post update** immediately saves the update and any changed follow-up date. **Save follow-up** saves just the date, retaining any typed update draft. These actions are separate from the surrounding task-detail Save/Cancel controls. Errors retain the draft for retry. Existing task features and authorization behavior are preserved.

## Data and concurrency

`progressUpdates` contains `{ id, text, authorId, authorName, createdAt }` records; an entry also includes `nextFollowUpDate` when that date changed with the update. The task's separate `nextFollowUpDate` is a date-only `YYYY-MM-DD` string, or `null` when cleared. Existing tasks need no migration.

The dedicated save transaction appends with `arrayUnion`, changes only progress/follow-up and `updatedAt`, and atomically creates an `audit_logs` record with a server timestamp. Generic `updateTask` saves exclude both progress fields so copied drawer snapshots cannot overwrite live history or dates. History renders from live tasks rather than editor snapshots.

History is append-only in this UI, not security-enforced immutable. Existing Firestore rules remain untouched and allow authorized org writers to modify these fields outside this UI. Author fields come from the signed-in client context, and entry timestamps use the client clock; the audit timestamp is server-generated. The embedded history grows toward Firestore's 1 MiB document limit. Large histories or tamper-proof attribution would require a separately scoped data/rules change.

## Verification

- `npm run test:task-progress`: 10 regression tests covering validation, dates, legacy tasks, attributed history, independent date changes, preserved task fields, concurrent appends, transaction retry, rejected saves, personal-task access and stale detail snapshots. Firestore is mocked; these tests do not validate deployed rules or real server concurrency.
- `node scripts/verify-task-progress-ui.mjs`, then `python3 -m http.server 5188 --directory .test-build/task-progress-ui`: repeatable local-only browser harness using the real editor and save service with an in-memory Firestore double. It cannot connect to production. Verified posting both example updates, newest-first attribution, combined date saves, date-only changes/clearing, failure recovery, and a 360 px content container.
- Existing node tests pass when leave lifecycle tests are run through their required `npm run test:leave` bundling command. The changed desktop/mobile/My Tasks modules also compile with esbuild.
- New production files pass ESLint. Existing edited files retain the baseline's 32 errors and 1 warning; no additional lint findings were introduced.
- A full Vite build was attempted with `npm run build -- --configLoader runner` but cannot complete in this environment: `motion/react` is absent from the available dependency installation, failing resolution in the existing `src/components/loader.tsx`. A fresh `npm ci --ignore-scripts` first failed with `ENOSPC` because filesystem inode capacity was exhausted. Verification used existing dependencies read-only, with artifacts written only to this worktree. Full application layout and real Firebase writes were not exercised.

No production data, security rules, deployment, main branch, Android files or migration worktrees are changed by this feature.
