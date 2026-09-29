# HRFlow native Android product requirements

The Android app will provide a native Kotlin/Compose companion to HRFlow's existing React/Vite PWA, backed by the same Firebase project after a real Android app registration is supplied. It is a separate product surface, not a replacement for the PWA or its existing Capacitor wrapper. The first deliverable in this branch is a small, safe foundation plus a static visual proposal; the six feature pages in the design preview are **not live, not wired to Firebase, and not represented by mock HR records**.

## Product outcome

Give employees and HR teams a faster, mobile-first way to reach common HRFlow workflows while keeping the existing PWA available for features not yet ported. Native Kotlin/Compose is chosen to support direct Android UI, platform navigation, offline-aware data access, and measurable startup/list performance. A native implementation is not inherently faster than the PWA: the gains are goals to be measured against named devices and equivalent workflows before any performance claim is made.

The initial signed-in shell prioritizes predictable launch behavior and safety over feature breadth. Until Firebase Android registration exists, the app stops at a setup explanation. After configuration, it supports email/password sign-in and a read-only listener for the current user's `users/{uid}` document; it does not resolve roles, join an organization, read company data, or write Firestore fields.

## People and jobs to support

Employees need a quick path to their own workspace, attendance, leave, communications, and contact/profile information. HR and administrators need mobile access to the people directory, attendance summaries, leave requests and approvals, and HR announcements/documents. The same screen shell should show only actions that fit the signed-in user's active organization and access policy; until server rules support that policy, feature routes remain inert.

## Proposed native pages

The six-screen, phone-size concept is in [the screen map](SCREEN_MAP.md) and the PNG review sheet in [`design-preview/hrflow-native-screens.png`](../design-preview/hrflow-native-screens.png). It shows layout hierarchy and navigation only. Counts use em dashes, lists are empty, the organization and employee identity are omitted, and the employee-detail fields are deliberately blank.

| Page | Proposed mobile layout | Data and action boundary |
| --- | --- | --- |
| Overview | Welcome/context block, compact metric cards, quick routes, recent-activity empty state | Values stay blank until a bounded data contract and role-aware query are approved. |
| People | Search, Active/All filters, directory list or empty state | No employee query in this foundation; page is a placeholder. |
| Attendance | Date control, summary cards, filtered record list | No attendance read, correction, geolocation, or write in this foundation. |
| Leave | Overview/Requests tabs, balance/approval summary, request affordance | No balances, requests, approvals, or leave writes in this foundation. |
| HR Communications | Announcements/policies/letters sections with empty states | Existing safe handoff rules apply when migrated; the app will not claim a message was sent. |
| Employee detail | Identity header and grouped employment/contact sections | PII is absent from the concept image; production fields require explicit field-level access and masking decisions. |

## What this branch includes

The starter includes a standalone `native-android/` Gradle project, a Compose token theme, Firebase app-configuration gate, email/password sign-in UI and repository boundary, lifecycle-aware auth state, read-only Firestore listeners for the signed-in user profile and an organization summary contract, a lightweight four-item navigation shell, and reusable loading/error/empty states. Only the signed-in user's own profile listener is currently invoked. The other repository method is a future boundary, not an active query. A six-screen static PNG sheet and individual screenshots make the proposed pages reviewable without activating the backend.

The foundation intentionally does not include Google sign-in, registration or password-reset, organization join/create/switch, active-role lookup, HR module screens with data, leave/attendance mutation, background sync, push notifications, analytics, or migration of cached local data. Those are feature work and, for company data or writes, depend on the security review below.

## Delivery sequence

**Foundation (this branch):** establish a separate native project, add accessible Compose primitives, maintain a configuration-required state, and sign in only when a Firebase Android config file exists. This step introduces no new company-data write path.

**Access and parity review:** confirm the final application ID and Firebase target project; review the current Firestore and Storage rules; document membership, active-organization, role, permission, audit, offline, and data-retention behavior; then test sign-in and account-profile handling in a non-production Firebase environment. Resolve or explicitly accept the existing rules before connecting any company-wide collection.

**Read-only employee workflows:** migrate the employee's own summary, attendance, leave, and communications with explicit query limits, cursors, cache/stale-state labels, field minimization and permission-denied states. Validate parity with the PWA for statuses, leave calculations, time zones, and legacy fields.

**Role-based HR workflows:** migrate directory, detail, approvals, and administrative actions only after server-side authorization and audit coverage are tested. Preserve the current PWA's separate `view`, `share`, `export`, and edit intent rather than treating one broad client-side permission as another.

**Release hardening:** add Macrobenchmark and Baseline Profile coverage around real high-traffic flows, verify accessibility and privacy on physical devices, and compare release builds against the PWA and a stable device baseline.

## Performance and reliability acceptance

These are target budgets, not benchmark results. On one named mid-range physical Android device, pinned OS version, release-signed build, stable thermal state and a clean-install test account, measure at least 30 cold launches using Android's [`StartupTimingMetric`](https://developer.android.com/topic/performance/benchmarking/macrobenchmark-overview). Target time-to-initial-display at p50 ≤ 1.8 s and p95 ≤ 2.5 s. Report the exact device, OS, build type, sample count, and network state with the result; do not use an emulator run as a release performance claim.

For a defined employee-directory scroll scenario on the same device, target p95 frame duration ≤ 16.7 ms at a 60 Hz refresh rate and fewer than 1% of measured frames over 16.7 ms. Re-run at larger accessibility text scale and with the TalkBack service enabled as a separate interaction check. Once authentication and a first data-driven route are instrumented, add a separate post-login time-to-useful-screen target rather than conflating network time with Android startup.

The first launch should show a local branded shell before any optional HR query. Never prefetch every employee, shift, report, or attachment at launch. Lists should use bounded pages with stable keys; images and Storage objects should load only when visible or explicitly requested. Firestore's Android SDK uses local caching by default; cached profile/list values can be stale or incomplete, so later data screens must label refresh state and distinguish offline cache from a confirmed current server read ([Firestore offline behavior](https://firebase.google.com/docs/firestore/manage-data/enable-offline)).

## Security and compatibility prerequisites

The committed `firestore.rules` are preserved unchanged. In the exact rules at this base, any signed-in user passes `canReadOrg()`, and that condition is used for organization-document reads and generic organization subcollection reads; `users/{userId}` documents also allow reads by any signed-in user. Generic organization writes use membership/admin checks rather than the PWA's full per-module permission matrix. These server rules therefore do not currently enforce the confidentiality and fine-grained role boundaries implied by parts of the UI. A client-side `permissions` map can control presentation, but it is not a server authorization boundary. **A dedicated Firestore/Storage rules review is a release prerequisite before exposing organization records or privileged native writes.** This branch makes no rule changes and performs no privileged writes.

The PWA's auth flow reads `users/{uid}`, resolves the active organization from `targetOrgId`, `currentOrgId`, memberships or legacy `orgId`, loads organization `roles`, and may write normalized `orgId`/`currentOrgId`/memberships back to the user document. The native starter intentionally does not port that write-back or role-document lookup. It also does not assume a package ID or Firebase Android app ID. The `com.example.hrflow` Gradle value is only a replace-before-registration placeholder. The local app-specific `google-services.json` is ignored by Git and is not included.

The committed share handoff specification remains a product contract for future native sharing: exactly one manually entered recipient, explicit review/confirmation for sensitive content, current eligibility and permission checks immediately before handoff, no direct sends, delivery inference, recipient logging, or automatic retries. Native system sharing should preserve the same constraints; it must not expand PWA share access or use stored file URLs in outbound text.

## Release acceptance checklist

Before calling a native release ready, verify the final application ID matches Firebase registration and the release signing configuration; pass Android build, unit and UI tests; test sign-in/sign-out and session restoration with invalid-network and offline states; review every Firestore/Storage query and mutation against deployed rules and audit expectations; confirm employee PII masking and no sensitive data in logs; exercise all six pages with an authorized test account; run physical-device startup and list benchmarks; and pass TalkBack, large-text, contrast, and screen-rotation checks. The current branch is a foundation and design proposal, not a release candidate.
