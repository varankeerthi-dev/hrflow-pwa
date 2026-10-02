# Rust workspace

This workspace is an isolated migration pilot on `feat/hrflow-rust-migration`. It makes the Rust experiments build and verify together; it does not replace the production JavaScript application.

## Current boundaries

| Package | Owns | May depend on |
|---|---|---|
| `hrflow-attendance-policy` | Pure attendance-policy calculations and the numeric WASM boundary | No other workspace crate, UI, database, network, auth, or Firebase crate |
| `hrflow-leave-entitlements` | Pure leave-entitlement calculations; its `serde_json` CLI is only a fixture-parity boundary | `serde_json`; no other workspace crate, UI, database, network, auth, or Firebase crate |
| `dioxus-hrflow-prototype` | Dioxus UI state and a synthetic, read-only attendance demo | `hrflow-attendance-policy` and Dioxus |

The permitted workspace direction is **prototype UI → pure domain crate**. The current prototype consumes attendance policy only. The two domain crates remain independently owned and do not depend on each other. Keep external I/O at a real boundary; do not add empty `application`, `adapters`, or `infrastructure` crates to imitate layers before there is behavior for them to own.

The production PWA, Kotlin client, Firebase and authentication integrations, security rules, persistence, payroll writes, and real employee data have not migrated. The JavaScript implementation remains the live production path and the parity oracle. The Dioxus demo contains invented in-memory fixtures and must not be used for HR decisions or production deployment.

## Commands

Run from the workspace root. Cargo also discovers this root lockfile when a command is run from a member directory.

```sh
cargo fmt --all -- --check
cargo test --workspace --locked
node scripts/verify-attendance-wasm.mjs
node scripts/verify-leave-entitlements.mjs
./scripts/verify-rust-workspace.sh
```

The script's default mode performs formatting, locked workspace tests, a Cargo metadata/dependency-direction guard, and both existing JavaScript-oracle parity checks. It does not install SDKs or build Android packages. The parity checks use the existing WASM attendance export and leave fixture CLI.

Optional host-specific checks are explicit:

```sh
./scripts/verify-rust-workspace.sh --web
./scripts/verify-rust-workspace.sh --android
```

`--web` also builds the locked Dioxus web release with the documented, pinned Dioxus CLI 0.7.10. It does not install the CLI or Rust targets. `--android` verifies an already-present release APK, or the preserved x86_64 unsigned baseline APK, with the prototype's APK verifier; it does not rebuild, install, or distribute an APK. See the prototype README for the separately documented Android package-build procedure.

Member-specific commands work with the single root lockfile, for example:

```sh
(cd rust/attendance-policy && cargo test --locked)
(cd rust/leave-entitlements && cargo test --locked)
(cd prototypes/dioxus-hrflow && cargo test --locked)
```

## Extension rules

1. Add a workspace member only when it owns real, cohesive behavior. Update the explicit member list and the verification guard together.
2. Keep business rules pure and inside their owning domain crate. A domain crate must not depend on the UI, Firebase, auth, storage, a database, or network clients.
3. Let a client depend on the domain API it uses. Do not make domain crates depend on clients or on each other to share a model without a demonstrated shared concept.
4. Put persistence and service adapters at an actual I/O boundary when that migration is separately scoped. Do not introduce empty layers or wire this pilot into production as a side effect.
5. Keep parity against the existing JavaScript oracle and add fixtures before changing behavior. Treat any behavior outside tested inputs as unproven.
