# Rust migration stack

This is migration-specific guidance alongside the existing [`AGENTS.md`](AGENTS.md); it does not replace that file. The complete upstream pstack package is preserved at [`tools/cursor-plugin-snapshots/pstack/`](tools/cursor-plugin-snapshots/pstack/), with provenance in [`tools/cursor-plugin-snapshots/UPSTREAM.md`](tools/cursor-plugin-snapshots/UPSTREAM.md).

## Practices to apply selectively

- **Ground before shaping:** trace current HRFlow behavior, data contracts, callers, and operational constraints. For consequential architecture choices, compare structurally distinct candidates against explicit criteria (behavioral parity, data integrity, security/privacy, rollback, operability, and measured performance) before selecting a direction. The completed read-only synthesis chose an incremental pilot for pure Rust domain logic behind an isolated boundary; production callers, Firebase, and data remain out of scope unless later parity and measurement justify another decision.
- **Work in small, reversible units:** establish a baseline, change one bounded behavior at a time, and verify it before advancing. Prefer slices that can be independently reviewed and rolled back.
- **Test observable behavior:** exercise interfaces as users or callers do and assert concrete outcomes, including compatibility, failure, and authorization cases. Do not substitute implementation-shape assertions for behavior.
- **Keep boundaries explicit:** parse and validate untrusted network, persistence, configuration, and identity inputs at system boundaries; use typed domain values internally. Preserve tenant and authorization boundaries, minimize sensitive data, and keep secrets/PII out of logs, traces, and fixtures.
- **Review independently:** challenge the design and each meaningful slice for correctness, blast radius, security/privacy, and maintainability. Use only review workflows suited to the slice.
- **Keep boundaries explicit:** parse and validate untrusted network, persistence, configuration, and identity inputs at system boundaries; use typed domain values internally. Preserve tenant and authorization boundaries, minimize sensitive data, and keep secrets/PII out of logs, traces, and fixtures.
- **Review independently:** challenge the design and each meaningful slice for correctness, blast radius, security/privacy, and maintainability. Use only review workflows suited to the slice.
- **Protect the user experience:** a language port is not permission for silent product changes. Preserve core workflows and intentional loading, empty, error, and recovery behavior; justify scope from the user's perspective.
- **Measure performance:** capture representative pre-migration behavior and workloads, then compare old and new paths under the same conditions (for example latency, throughput, memory, and startup cost). Optimize demonstrated bottlenecks, not assumptions.
- **Prove each unit:** run the relevant build/tests and exercise the real path; record what was checked and any known gap before declaring that slice complete.

## Compatibility and safety

The vendored package is a passive source snapshot, not an app dependency or build input. Do not run its scripts, setup steps, model-selection flow, or dormant automations. Its Cursor-only slash commands, plugin activation, `.cursor-plugin` configuration, model routing, and Cursor Task wrappers are not available here and must not be described or treated as Cue commands. Apply only compatible engineering ideas, selecting the relevant skill per task rather than blindly invoking unrelated skills or bots. Preserve upstream attribution and MIT licensing.
