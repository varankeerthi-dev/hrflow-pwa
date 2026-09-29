# Native Android repository guidance

- Keep this standalone Kotlin app inside `native-android/`. Do not modify the existing React/Vite app, the top-level `android/` Capacitor wrapper, or unrelated branches/worktrees as part of native Android work.
- Preserve HRFlow's design tokens in `docs/DESIGN_SYSTEM.md`. Use Compose design tokens/components, lifecycle-aware state, and accessible loading, error, and empty states; do not put Firebase calls in composables.
- Keep Firebase config app-specific and local. Never commit `google-services.json`, `local.properties`, signing material, service-account credentials, or production user data. Do not invent the production application ID or Firebase Android App ID.
- Do not display invented company/employee/sample transactions as real data. A preview without a registered backend must say it is a static/non-live concept or use explicitly empty/skeletal placeholders.
- The current Firebase adapter may read only the authenticated user's own `users/{uid}` document in this foundation. Do not activate organization, employee, attendance, payroll, leave, communication, or Storage queries/writes until the relevant Firebase rules, role model, field policy, and test account are reviewed.
- Client `role`/`permissions` fields are hints for UI presentation only. They are not security controls. The committed Firestore rules allow broad signed-in reads of user and organization data; require a dedicated Firebase Firestore/Storage rules review before production HR data or privileged native actions.
- Keep HR mutations disabled until server-side authorization is verified and the existing audit requirement (`organisations/{orgId}/audit_logs`, server timestamp, actor, action and details) can be satisfied safely.
- Match the existing PWA's multi-organization data model without silent migration writes. The current starter must not resolve roles, switch organizations, backfill profile fields, or change Firestore rules.
- Retain the safe HRFlow share boundary: one manually entered recipient, explicit review and permission/content checks, no direct sends or delivery assertions, no bulk messages, and no logging/persisting share content.
- Prefer bounded, visible-route queries, pagination and measured dependencies. Benchmark representative release journeys on physical hardware before making speed claims or adding a Baseline Profile.
