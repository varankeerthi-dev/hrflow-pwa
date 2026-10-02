# Attendance policy

`hrflow-attendance-policy` owns pure attendance-policy calculations and exports a numeric WebAssembly boundary. It has no third-party dependencies and does not own UI state, persistence, authentication, Firebase, or network access. The existing JavaScript helper remains the live production implementation.

From the workspace root:

```sh
cargo test --locked -p hrflow-attendance-policy
cargo fmt --all -- --check
cargo build --locked -p hrflow-attendance-policy --release --target wasm32-unknown-unknown
node scripts/verify-attendance-wasm.mjs
```

The Node verifier compares the existing JavaScript helper and the actual WASM export against the shared literal CSV vectors. `cargo test --locked` also works from this crate directory because Cargo uses the workspace's root `Cargo.lock`.
