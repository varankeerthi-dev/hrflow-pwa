# Leave entitlements

`hrflow-leave-entitlements` owns pure leave-entitlement calculations. Its `serde_json` dependency is used by the fixture-parity CLI boundary; it is not a persistence or network adapter. The production JavaScript helper remains the live implementation, and this crate does not own UI state, Firebase, authentication, or writes.

From the workspace root:

```sh
cargo test --locked -p hrflow-leave-entitlements
cargo fmt --all -- --check
node scripts/verify-leave-entitlements.mjs
```

The Node verifier compares the unchanged JavaScript reference and Rust CLI against the frozen fixture outputs. `cargo test --locked` also works from this crate directory because Cargo uses the workspace's root `Cargo.lock`.
