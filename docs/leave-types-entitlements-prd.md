# Product Requirements Document: Configurable Leave Types and Entitlements

**Product:** HRFlow
**Status:** Proposed and implementation-aligned
**Scope:** Employer-configurable leave categories, effective-dated monthly or annual entitlements, per-type balance visibility and controls, request/approval lifecycle, and payroll treatment.

## Current behavior

HR Leave Management, desktop employee self-service, and mobile employee self-service use different hard-coded type lists. Current labels include Casual, Sick, Privilege, Maternity, Paternity, Unpaid, LOP, and Annual. Annual and Privilege are treated as different strings by parts of the app, although employers may use them as labels for the same category. Existing leave policies control paid/unpaid/LOP classification, date expansion, half-days, and a monthly repeat-request warning; they do not configure per-type entitlements.

On final approval, the existing lifecycle snapshots policy, expands the requested dates using the organization’s holiday calendar, blocks overlapping active coverage, writes date-level payroll coverage and idempotent ledger entries, and debits a legacy scalar `employee.leaveBalance` for paid coverage. The scalar is not separated by type and is clamped at zero. Cancellation rescinds coverage and may credit the same scalar. Payroll treats paid coverage as paid time and unpaid/LOP coverage as LOP, reducing paid days and prorated Basic/HRA. Locked payroll periods are protected, and saved payroll slips are historical snapshots.

## Product behavior

Employers can add, rename, disable, and configure leave types. Each type has a stable internal code distinct from its display label, and aliases preserve old request values. Built-in aliases include Casual/CL, Privilege/EL/Annual, Sick, Unpaid, and LOP. Historical request documents and payroll snapshots remain readable using their recorded names and coverage classifications.

For each type, an employer may choose no numeric entitlement, a monthly accrual amount, or an annual grant amount. Amounts, dates, fractional precision, paid/unpaid/LOP behavior, half-day support, and over-entitlement handling are policy inputs—not legal defaults. Policy versions have an effective date. A change affects only entitlement earned on or after that date; existing approved requests retain their saved policy snapshot. Monthly and annual amounts accrue on effective-date anniversaries, with month-end dates clamped to the final calendar day of shorter months. Accrual is calculated deterministically when a balance is requested or a leave decision is made; HRFlow does not claim to run a scheduled background accrual service.

When entitlement is unconfigured, the application retains the legacy approval and payroll behavior. It does not assign the old scalar balance to any leave type and does not silently impose a quota. After a type has a published monthly or annual policy, HR can record its reviewed opening balance through an attributable ledger entry; the old scalar remains aggregate and unreconciled.

For configured types, the balance view separates accrued entitlement, opening/manual grants, used units net of reversals, pending units, expired units where recorded, available units, and over-entitlement. Pending amounts are shown as projected use; they are not an irreversible reservation until approval. Final approval rechecks the balance in a Firestore transaction against an employee/type balance guard stored with the protected leave ledger, so concurrent final approvals cannot consume the same remaining units twice. The selected over-entitlement policy is explicit: block the request, permit a documented negative balance, or classify the shortfall as unpaid/LOP. No request becomes unpaid merely because a balance is short unless the published policy says so; any shortfall and resulting payroll treatment are shown before submission and again to approvers.

Leave requests use the same policy-defined type catalog in HR, desktop, and mobile surfaces. A request stores a stable type code, the display label, entitlement/policy version, date-expansion preview, requested units, balance context, and an explicit shortfall decision where applicable. Final approval creates date-level coverage and a per-type ledger debit atomically with the final request state. Rejection creates no debit. Cancellation/reversal creates compensating ledger entries and rescinds coverage, subject to payroll locks. Multi-stage approval must reach a final authorized stage before coverage is posted.

Payroll continues to use date-level coverage as its source for paid, unpaid, and LOP treatment. Mixed paid/unpaid coverage can represent an authorized shortfall within a date. Existing payroll calculations remain authoritative: unpaid/LOP coverage reduces paid days and prorated Basic/HRA using the configured payroll record; paid coverage does not add LOP. Draft payroll shows the resulting leave/LOP units. Locked and saved payroll runs are never recalculated by a later policy change or leave mutation.

## Type-specific balance model

Each employee/type balance is calculated from:

- effective-dated monthly or annual entitlement earned through the “as of” date;
- opening balance, manual grants, adjustments, and carry-forward entries recorded in the leave ledger;
- approved usage and its cancellation/reversal entries;
- expiry entries where an employer policy and an explicit expiry workflow have recorded them; and
- pending leave requests, shown separately as projected/reserved usage.

Entitlement configuration does not itself create statutory advice. Until a supported carryover/expiry workflow is published, the interface must not imply that units expire or carry. Type codes are stable and aliases are resolved for reporting and balance matching; display names are never used as unique identifiers.

## HR settings and workflows

The Leave Policy area lets HR configure built-in or employer-created types, display name, aliases, active state, paid behavior, date expansion, half-days, entitlement cadence/amount/effective date, and one of the supported over-entitlement actions. Values must be non-negative, dates valid, and a configured amount must have both cadence and effective date. Publishing stores a policy version and records an audit entry. Policy edits do not change old requests or locked payroll.

HR Leave Management shows available, accrued/granted, used, pending, and over-entitlement amounts for the selected employee and type. The request form previews included leave dates/units and the projected balance. If the policy converts a shortfall to unpaid/LOP, the form names the shortfall and explains that payroll will apply the organization’s existing LOP proration. Currency deductions are calculated by payroll from salary records rather than guessed in the request form. Approvers see the policy/balance snapshot and shortfall decision.

Employee desktop and mobile portals show the same configured types and per-type balance states. Employee Details shows a per-type summary alongside its request history. If a type has no entitlement policy, it is labeled “Not configured”; the old scalar is labeled as an aggregate legacy balance and is never presented as a type-specific amount.

## Compatibility, migration, and rollback

No bulk data migration runs as part of deployment. Existing organization settings and requests remain intact. Legacy names resolve through aliases, and request/coverage/ledger records keep their original values. Existing scalar `leaveBalance` is neither split nor copied. An administrator may reconcile it manually by creating one or more reasoned, dated, type-specific opening entries after review; the original scalar remains available as historical data.

Organizations remain in legacy mode until an administrator configures an effective-dated amount for a type. Turning off a type prevents new applications for it but does not delete its requests or ledger history. Rollback consists of disabling newly configured types or reverting the application branch; previously written requests, ledger events, policy snapshots, audit entries, and payroll snapshots remain readable and are not automatically reversed. A reversal after a locked payroll period requires the existing later-period correction workflow rather than editing the locked run.

The implementation must not change Firestore security rules, introduce a scheduler, deploy code, or modify live employer records as part of this work. The protected leave ledger remains the balance guard boundary; no new employee-writable balance document is introduced.

## Acceptance criteria

1. HR can add and configure leave types without editing source code. Stable codes and aliases keep old values readable.
2. Monthly and annual entitlement calculations are effective-dated, deterministic, idempotent, and correct at exact accrual dates and month-end boundaries.
3. No sample or statutory quota is inserted. An unconfigured organization keeps legacy behavior and an explicit setup state.
4. Leave balances distinguish accrued, opening/granted, used net of reversal, pending, expired where recorded, available, and over-entitlement.
5. Legacy scalar balances are not converted or described as type-specific. Historical requests and approved coverage continue to resolve to their old type aliases.
6. The same type catalog appears in HR, desktop, and mobile request surfaces; a disabled type cannot be newly requested.
7. Submission validates dates, request units, half-day rules, and configured over-entitlement policy. A configured unpaid shortfall is shown before confirmation and passed to approvers.
8. Final approvals atomically write request final state, date coverage, idempotency events, ledger debit, and the protected per-type balance guard. Concurrent approvals cannot spend the same entitlement twice.
9. Rejection does not debit a balance. Cancellation and approved-leave reversal restore only the originally charged type units, record a reason, and respect payroll locks.
10. Paid, unpaid, and LOP coverage reaches payroll consistently. A shortfall classified unpaid/LOP increases LOP and uses the current salary proration; paid leave does not increase LOP.
11. Policy publication, approvals, cancellations, and adjustments have actor/time/reason or an immutable lifecycle/audit event. Policy snapshots are retained with requests and coverage.
12. Tests cover aliases, custom types, monthly/annual grants, effective-date boundaries, opening/used/pending balances, over-entitlement actions, idempotency/concurrent approval guard behavior, cancellation/reversal, holidays/half-days, LOP payroll classification, locked payroll, and legacy-mode behavior.

## Known constraints and unresolved employer decisions

The application has a client-side Firestore architecture and no trusted scheduled accrual service. Accrual is therefore derived at read/decision time from the saved policy versions rather than posted by a background job. Pending requests are shown as projected use; they do not lock units until an HR approval transaction posts a debit. Existing Firestore rules remain unchanged, so all writes must use the current organization membership and protected ledger paths.

Employers must decide which leave types they use, entitlement amounts/cadence, accrual start dates and treatment of joiners/leavers, whether monthly amounts accrue at the anniversary or by calendar month, whether balances may go negative, whether shortages become unpaid/LOP, and what rounding applies to fractional units. Carryover caps, expiry, and alerts remain unavailable until an explicit workflow is implemented. Employers must also validate local employment policy and obtain appropriate legal/payroll review. This PRD does not set statutory amounts or assert legal compliance.
