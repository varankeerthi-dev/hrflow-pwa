# Rust leave-entitlements pilot

The pure behavior in `origin/main` (`c191ae98a8789e1b5cb93edcd904182ceb8f36e2`) is implemented in the isolated `rust/leave-entitlements` crate. The application still imports and executes the unchanged JavaScript helper; this crate is used only by native Rust tests and a fixture runner.

## What moved

The Rust domain covers the built-in and employer-defined leave catalog, aliases and stable type codes; type-definition lookup; policy selection by date and policy version; monthly and annual accrual with effective-date anniversaries and month-end clamping; per-type balances from accruals, opening entries, grants, adjustments, use, reversals, expiries, and pending requests; entitlement-limit outcomes including block, allow-negative, and unpaid/LOP shortfall segments; and unpaid salary-impact estimates.

The domain calculations use internal date, policy-version, ledger-entry, request, grant, balance, candidate, and allocation types. JSON parsing is confined to the test/fixture boundary. The crate has no Firebase, Auth, UI, payroll-write, or transaction dependency.

## Parity evidence and commands

`rust/leave-entitlements/fixtures/parity-cases.json` contains **27 input cases and frozen outputs captured from the unchanged JavaScript reference**. The Node verifier calls the real JS helper and the Rust runner with the same inputs, then checks both against those outputs. Rust’s integration test consumes that same fixture file. Cases include built-in/custom aliases, effective-dated policies, monthly and annual anniversaries, leap-day and month-end dates, fractional and negative ledger quantities, pending requests, reversals, expired units, shortfall segments, policy-key insertion order, JavaScript numeric-string prefixes, and `toFixed(4)` behavior.

The following checks passed on this worktree:

```sh
node --test test/leaveEntitlements.test.mjs

cargo test --workspace --locked

cargo fmt --all -- --check

node scripts/verify-leave-entitlements.mjs

./scripts/verify-rust-workspace.sh
```

The first dependency resolution fetched the locked `serde_json` and insertion-order map dependencies; subsequent Cargo checks passed with `--offline` on this computer. No WASM build, production benchmark, or performance claim is part of this slice.

## What remains JavaScript-only

All production hooks and lifecycle callers still use `src/lib/leaveEntitlements.js`. Firestore transaction functions, leave approval/cancellation writes, audit records, payroll-lock checks, UI behavior, Firebase configuration, security rules, and stored data were not moved or changed. The JavaScript module remains the live implementation and the parity oracle.

The demonstrated parity is for the 27 plain-JSON fixtures, not every value that arbitrary JavaScript can coerce. Rust handles the observed scalar and numeric-string forms used by the domain, including hexadecimal, binary, and octal strings, but values with JavaScript-only behavior—such as `undefined`, `Date` objects, custom `valueOf`/`toString` objects, and some invalid non-string date inputs—are outside the fixture contract. A mismatch outside the fixtures must be treated as unproven rather than assumed equivalent.

## Next gate

Before any in-app use, extend the differential suite over representative persisted policy, ledger, request, and candidate shapes, including malformed and legacy values; review any coercion/date differences against actual caller data; and build and exercise the target runtime. Only a separate, explicitly scoped change should add a disabled read-only shadow comparison. JavaScript must remain the returned result and all writes must remain on the existing path until parity, rollback, and measured runtime costs justify a new decision.
