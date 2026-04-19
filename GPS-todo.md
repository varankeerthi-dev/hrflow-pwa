# GPS Attendance Rollout TODO

Last updated: 2026-04-08  
Owner: HRFlow team

## Status Legend
- [ ] Pending
- [~] In Progress
- [x] Done
- [!] Blocked

---

## Agreed Functional Rules (Locked)
- Location check runs **only on Check-In / Check-Out button click** (battery-safe).
- If user is within allowed radius, allow normal capture + submit.
- HR approval does **not** move to final DB immediately.
- After HR approval, keep record in pending as `approved_waiting_finalize`.
- HR manually runs finalization later (no fixed time; supports night shifts).
- Employee portal shows status badges (`Pending`, `Approved`, `Finalized`, `Rejected`).

---

## Phase 0 - Foundation & Schema
- [x] Finalize collection design:
  - `sites`
  - `pending_attendance`
  - `employee_portal` (attendance log view)
  - final attendance store (`attendance` + `attendance_final`)
- [x] Define document linking keys:
  - `pendingId`
  - `portalLogId`
  - `sessionId`
  - `photoPath`
- [x] Define status model:
  - `pending_hr`
  - `approved_waiting_finalize`
  - `rejected`
  - `finalized`
  - `pending_exception_hr` (out-of-site exception)
- [~] Define security/rules scope (Firestore + Storage).

---

## Phase 1 - HR Site Settings (Geo Config)
- [x] Add HR settings UI for site management:
  - site name
  - latitude / longitude
  - radius meters (default 500)
- [ ] Add employee-site mapping (primary site assignment).
- [ ] Add temporary assignment support (from/to dates for field staff).
- [x] Keep current text site fallback for legacy data migration.

---

## Phase 2 - Employee Capture Flow (Desktop + Mobile)
- [x] Add camera capture component for selfie (check-in/check-out).
- [x] Add image compression (`browser-image-compression`) target ~100KB.
- [x] Upload to Storage path:
  - `organisations/{orgId}/temp_selfies/{userId}/{timestamp}.jpg`
- [x] Add geolocation check on click:
  - fetch current position
  - compute distance via Haversine
  - show "You are X meters from site"
- [x] Enable capture only when eligible for normal attendance.

---

## Phase 3 - Dual-Write Submission
- [x] On submit, create/update record in `pending_attendance`.
- [x] On submit, write user-visible log in `employee_portal` as pending.
- [x] Support both `in` and `out` events tied by `sessionId`.
- [x] Ensure idempotency (prevent double tap duplicates via deterministic IDs).

---

## Phase 4 - HR Review Workflow
- [x] Add attendance queue in approvals UI.
- [x] HR actions:
  - Approve (set `approved_waiting_finalize`)
  - Reject (set `rejected` with reason)
- [x] Reflect action instantly in `employee_portal`.
- [x] Keep approved records in pending store until finalization.

---

## Phase 5 - Manual Finalization Workflow
- [x] Add "Finalize Session" action in HR UI.
- [x] Finalize only approved records (gated on approved check-out).
- [x] Write finalized result to main attendance collection + `attendance_final`.
- [x] Archive policy: delete pending record after finalization.
- [x] Update `employee_portal` status to `Finalized`.
- [x] Delete temp compressed photo after finalization.
- [ ] Ensure payroll/summary reads only finalized/final records.

---

## Phase 6 - Edge Case Handling (Must-Have)
- [x] Location permission denied -> show controlled fallback path.
- [x] Low GPS accuracy -> retry prompt / block with message.
- [x] Offline capture -> queue and sync on reconnect.
- [ ] Check-out without check-in -> block or exception flow.
- [x] Out-of-site:
  - do not mark direct attendance
  - create `pending_exception_hr` request with selfie+GPS+reason
- [ ] New site not in system:
  - HR can "Approve & Save as New Site"
  - optionally create temp assignment
- [ ] Night shift across midnight via `sessionId` (not strict date only).
- [x] Duplicate prevention using deterministic pending IDs.
- [ ] Upload success but Firestore fail -> cleanup/retry logic.
- [ ] Anti-spoof flags (suspicious jumps / mismatch heuristics).

---

## Phase 7 - QA, Hardening, Rollout
- [ ] Add/verify Firestore indexes for new queries.
- [ ] Add/update Firestore rules for new collections.
- [ ] Add Storage rules for selfie path access.
- [ ] End-to-end test matrix:
  - normal in/out
  - hr approve
  - manual finalize
  - reject
  - out-of-site exception
  - night shift
  - offline retry
- [ ] Controlled rollout with monitoring + logs.

---

## Portal Badge Rules (Employee View)
- [x] Pending -> yellow badge
- [x] Approved (Awaiting Finalization) -> green badge
- [x] Finalized -> green badge
- [x] Rejected -> red badge

---

## Progress Log (Update after each phase)

| Date | Phase | Update | Commit/Ref | By |
|---|---|---|---|---|
| 2026-04-08 | Setup | Created GPS rollout plan + phase checklist | working tree | Codex |
| 2026-04-08 | 0-5 | Implemented geofence capture, pending queue, HR approval, and manual finalization flow | working tree | Codex |

---

## Resume Protocol (When restarting work)
1. Open this file first.
2. Find first `[ ]` or `[~]` item in the current phase.
3. Continue only that scope.
4. After completion:
   - flip checklist items to `[x]`
   - append Progress Log row with commit hash
   - note blockers as `[!]` with short reason.
