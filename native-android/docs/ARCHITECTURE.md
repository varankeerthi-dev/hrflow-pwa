# Native Android architecture

Keep the first app in one `:app` module. A single module avoids premature Gradle/plugin and startup overhead while the team validates parity; split modules only when build isolation, team ownership, or measured build time justifies the additional dependency graph. The source tree still separates Firebase adapters, HRFlow models, ViewModels, and Compose UI so the boundary can be extracted later.

```mermaid
flowchart TD
    Activity[MainActivity] --> Gate[Firebase config gate]
    Gate -->|not configured| Setup[Setup-required Compose screen]
    Gate -->|configured| AuthUI[Sign-in and app shell]
    AuthUI --> AuthVM[AuthViewModel / StateFlow]
    AuthVM --> AuthRepo[AuthRepository]
    AuthRepo --> FirebaseAuth[Firebase Auth SDK]
    AuthUI --> ProfileVM[UserProfileViewModel]
    ProfileVM --> HrRepo[HrDataRepository]
    HrRepo --> UserDoc[Firestore users/{uid} listener]
    HrRepo -. later, rules reviewed .-> OrgDoc[Firestore organisation repository]
    UiState[Accessible loading / error / empty UI] --> AuthUI
```

Android's architecture recommendations favor a UI layer that consumes observable state from ViewModels and a data layer hidden behind repositories. This implementation follows unidirectional flow: Compose emits user actions, a ViewModel invokes an interface, and the UI observes immutable `StateFlow` or `Flow` using lifecycle-aware collection (`collectAsStateWithLifecycle`). Firebase SDK calls do not belong in composable functions. Android's [architecture recommendations](https://developer.android.com/topic/architecture/recommendations) describe these UI/data layer responsibilities.

## Current runtime path

`MainActivity` hosts Compose. `HrFlowApp` checks whether a default Firebase app was initialized from local Android resources. If it was not, `FirebaseSetupScreen` is the only route and no Auth/Firestore singleton is requested. If it was, the app creates the Firebase Auth and Firestore adapters. `AuthViewModel` observes the Firebase auth listener and handles sign-in; after authentication, `UserProfileViewModel` listens only to the current `users/{uid}` document. The overview shows the returned top-level context or a missing/error state. The feature placeholders do not start HR collection queries.

`AuthRepository` exposes a session flow and email/password operations. `HrDataRepository` exposes HRFlow-shaped profile and organization-summary reads, with a `FirebaseFirestore` implementation. The organization-summary method is not called by the app shell. Dependency construction is explicit at the Compose entry point; Hilt/Dagger are not added until the app has more repositories and test needs that make injection worth its compile/runtime cost.

## Firebase and HRFlow data shape

The PWA and this native proposal use the existing Firebase Auth/Firestore/Storage services. In `AuthContext.jsx`, the user document is `users/{uid}` and carries fields such as `name`, `email`, `orgId`, `currentOrgId`, `employeeId`, `role`, `memberships[]` and `permissions`. Organization records use the spelling `organisations/{orgId}`. Common HR data lives below that document; examples include `employees/{empId}`, `attendance/{recordId}`, `requests/{requestId}` and role documents in `roles/`. The exact meaning and data shape of every module must be confirmed before a native query is activated.

The PWA may read the active organization, inspect its `roles` documents, derive an effective role/permission view, and synchronize legacy active-organization fields back to `users/{uid}`. The native foundation maps data fields only; it deliberately performs **no such synchronization, role resolution, organization switching, employee matching, or writes**. This avoids turning an initial sign-in into a database migration. Until parity rules are approved, top-level `role`/`permissions` are informational and must never be treated as authorization.

## Query, cache, and failure behavior

Firebase client SDKs provide asynchronous listeners, offline cache, and reconnection. The adapters translate each listener into a Flow and remove its listener when the collector is cancelled. A missing profile, offline/error state, and a configuration-required state have separate UI presentations. Do not collapse a failed query to an empty list; a later list screen should distinguish “no records,” “not authorized,” “no network / cached content,” and “query failed.” Do not log profile contents or credentials.

The existing `useEmployees.js` loads the full `employees` collection ordered by name and loads all shifts separately before joining in memory. Native directory work should replace this unbounded eager read with an access-reviewed query, a deliberate page size/cursor, required composite indexes, and view-based hydration. Benchmark before deciding whether any in-memory cache or local database is needed. For the first signed-in overview, one own-profile listener is the upper bound of repository work.

Cloud Firestore Android persistence is enabled by default. A snapshot can come from local cache and later update from the server, so the final UI should represent cache/server freshness explicitly. No custom retry loop, WorkManager sync, background API polling, or migration job is included in this starter. The official [offline persistence guidance](https://firebase.google.com/docs/firestore/manage-data/enable-offline) describes cached reads and queued writes; any future HR mutation must consider offline queue/replay semantics before it is enabled.

## Permissions, mutations, and audit

The PWA's client role matrix and `permissions` map control what the UI offers; only Firebase server rules can enforce access. Current committed rules allow any signed-in user to read the top-level `users` documents and organizations, and the generic organization read rule also evaluates as signed-in, not membership. Organization writes are broader than a per-module permission matrix. The rules are untouched here. Before any native company-data route or mutation ships, review Firestore **and** Storage rules for org membership, own/manager/admin boundaries, sensitive fields, writes, exports, and file paths.

The repository's agent guidelines require company-data mutations to emit an immutable audit record at `organisations/{orgId}/audit_logs` with module, action, actor, details, and a server timestamp. Apply that convention only after validating it against deployed rules and current PWA write paths. Do not add client-only “is admin” guards as a substitute for server authorization. Initial native source contains no HR-domain writes.

## Navigation and performance choices

A `Scaffold` with a compact four-item bottom bar fits phone use: Home, People, Time, and More. Attendance and Leave are secondary destinations within Time; HR Communications is reachable from More. The desktop sidebar pattern in the web system is not copied to a phone. Larger widths can later move to an adaptive navigation rail or drawer while preserving the same destination state.

The current UI avoids automatic list/module queries on app startup and uses only material-icons-core. Compose, Firebase, Activity, and Lifecycle versions are pinned through a version catalog. Avoid adding a navigation framework for a few placeholder routes; when feature destinations are active, introduce Navigation Compose with typed routes and saved-state-aware back behavior if it materially simplifies deep links or multi-pane navigation. Startup Baseline Profiles and a Macrobenchmark test module are next steps once the real sign-in and scroll journeys can be exercised; profile only demonstrated hot paths and verify the gain on physical hardware, rather than claiming an assumed uplift. Android describes [Macrobenchmark](https://developer.android.com/topic/performance/benchmarking/macrobenchmark-overview) and [Baseline Profiles](https://developer.android.com/topic/performance/baselineprofiles/overview) as measurement/compilation tools, not substitutes for testing.
