# Rust migration pilot: attendance grace adjustment

This pilot ports the pure `calculateChargeableLateMinutes` helper from baseline `c191ae98a8789e1b5cb93edcd904182ceb8f36e2` into a dependency-free Rust crate. It is isolated on branch `feat/hrflow-rust-migration`; the existing application still calls the original JavaScript helper.

## Behavior and parity evidence

The reference is [`src/lib/attendancePolicy.js`](../src/lib/attendancePolicy.js), covered by [`test/attendancePolicy.test.mjs`](../test/attendancePolicy.test.mjs). For numeric inputs, the source behavior is: coerce each input with `Number(x) || 0`, apply JavaScript `Math.round`, clamp raw and grace independently to zero, subtract, and clamp the result to zero. The tie rule matters: JavaScript rounds exact halves toward positive infinity, including negative halves.

The Rust integration test and Node/WASM runner both consume [`chargeable-late-minutes.csv`](../rust/attendance-policy/fixtures/chargeable-late-minutes.csv), which has 18 literal cases. It includes `32/15 → 17`, `9/15 → 0`, negative and zero values, positive and negative half-minute boundaries (`0.5 → 1`, `1.5 → 2`, `2.5 → 3`, `-0.5 → 0`), independent rounding of raw/grace values, NaN-to-zero behavior, and positive/negative infinity behavior. Every output is asserted against a literal fixture value; the Node runner also checks the existing JS helper and the actual WASM export.

The exported WebAssembly ABI accepts numeric `f64` values. It preserves the helper's numeric rounding/clamping behavior, including NaN and infinities, but cannot itself reproduce JavaScript coercion of arbitrary strings, objects, `null`, or `undefined`. Any later JS adapter must perform and test the source coercion/default behavior before calling this numeric ABI.

## Implementation and reproducible checks

The domain function is in [`rust/attendance-policy/src/domain.rs`](../rust/attendance-policy/src/domain.rs); [`src/lib.rs`](../rust/attendance-policy/src/lib.rs) contains only the thin exported numeric WebAssembly boundary. The crate builds as both `rlib` and `cdylib` and has no third-party dependencies. The boundary/core split follows the explicit-boundary and reversible-slice guidance in [`RUST_MIGRATION_STACK.md`](../RUST_MIGRATION_STACK.md).

If needed, install the WebAssembly standard library target once:

```sh
rustup target add wasm32-unknown-unknown
```

Replay the checks from the repository root:

```sh
node --test test/attendancePolicy.test.mjs
cargo test --locked -p hrflow-attendance-policy
cargo fmt --all -- --check
cargo build --locked -p hrflow-attendance-policy --release --target wasm32-unknown-unknown
node scripts/verify-attendance-wasm.mjs
./scripts/verify-rust-workspace.sh
```

The captured JavaScript baseline passed **2/2** tests. Before the Rust domain implementation existed, the new Rust test failed to compile because `domain::calculate_chargeable_late_minutes` was absent (expected red). After implementation, `cargo test` passed its shared-vector integration test, formatting passed, the release `wasm32-unknown-unknown` build succeeded, and `node scripts/verify-attendance-wasm.mjs` reported: `PASS: 18 shared numeric vectors matched the JS helper and actual WASM export.` Final `git diff --check` and whitespace checks for the new files completed cleanly.

Compatible pstack practices used here were test-first development, observable behavior checks, a narrow typed boundary, and prove-the-real-artifact verification. The official MIT-licensed pstack snapshot and upstream provenance remain preserved under `tools/cursor-plugin-snapshots/`; it is passive reference material. No bundled scripts or automations were run. Cursor-only slash commands and model routing are not executable in Cue.

## Scope and next go/no-go

Moved: one pure attendance preview calculation now has a Rust domain implementation, native Rust tests, and a numeric WASM export exercised from Node. Not moved: the JavaScript helper, any production caller, UI, Firebase, authentication, security rules, payroll, or stored data. No database migration or production cutover occurred.

This pilot proves numeric parity for the shared cases; it does **not** establish a performance improvement or justify a broader rewrite. Before any production wiring or a full Rust client replacement, compare the JS and WASM paths on representative attendance-report workloads, including module load and call overhead; validate the actual caller input/coercion contract and target runtime; and require parity tests plus a rollback boundary. Continue only if behavior matches and those measurements show a useful engineering benefit. Otherwise, keep the live JS path and stop after this pilot.
