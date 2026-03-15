# Task Module — What changed, why, and how to debug fast

## Overview (what we added)
- `/tasks` page with 5-column kanban, task detail + chat, reminders banner, and ideas tab.
- New modals: create task, postpone, put on hold, create reminder, create/edit idea.
- Realtime hooks: `useTasks`, `useMessages`, `useReminders`, `useIdeas`.
- Helpers in `src/utils/taskHelpers.js` for dates/status/client badges.
- Firestore rules rewritten to use user documents (`users/{uid}.orgId` + `role`) instead of token claims.
- Cloud Function `functions/cleanupTasks.js` (auto-delete completed tasks after 50 days — deploy when ready).

## Recent fixes
1) Drag/drop no-ops in same column are ignored (prevents needless writes) — `TaskBoard.jsx`.
2) Postpone date check uses start-of-today, so tomorrow-or-later is valid — `PostponeTaskModal.jsx`.
3) Firestore rules deployed with doc-based org/role lookups (Option B) — `firestore.rules`.

## Simple “how to spot errors” cheatsheet
- **Permission denied:** Ensure user doc has `orgId`/`role`; task/reminder/idea docs must set `organizationId` that matches `orgId`. If missing, Firestore rejects reads/writes.
- **Drag-drop not moving:** Check browser console and network tab for Firestore errors. Confirm the drop target column id is one of `todo, in_progress, on_hold, review, completed`.
- **Chat won’t send:** Completed tasks make chat read-only; otherwise look for write errors (auth or missing `organizationId`).
- **Reminders invisible:** `isActive` must be true and `organizationId` must match. Targeted reminders require the user in `targetUsers` (or `targetUsers` null/general).
- **Ideas missing:** Ideas are personal; only the creator (`createdBy`) can read.

## Data patterns to remember
- Statuses: `todo | in_progress | on_hold | review | completed`.
- Personal tasks: only creator or assignees can see.
- Team tasks: assignees plus admin/md can see.
- On Hold: set `status=on_hold`, `onHoldReason`, `onHoldSince`.
- Completed: set `status=completed`, `completedAt`; chat becomes read-only; delete after 50 days via CFN.
- Client filter: `clientType` values `order | complaint | followup`; “internal” = no `clientType`.

## Quick smoke checklist (manual)
- Create team task + personal task; both appear correctly.
- Drag across all 5 columns; On Hold opens reason modal; Completed shows days-until-delete.
- Send/see chat; verify completed tasks block sending.
- Dismiss reminders; badge count drops.
- Add/edit/delete an idea; only the creator sees it.

## Why Option B rules now
- We don’t yet issue custom auth claims. Rules now read `orgId`/`role` from `users/{uid}` to unblock usage. If later you add claims, we can tighten rules to token-based checks for stronger integrity.
