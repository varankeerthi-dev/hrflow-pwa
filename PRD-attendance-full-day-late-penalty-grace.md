# Product Requirements Document

## Attendance Policy Engine: Full-Day Rules, Grace Periods, and Late Penalties

**Product:** HRFlow multi-organisation HR and attendance platform  
**Document status:** Proposed  
**Author:** Manus AI  
**Scope:** Attendance classification, late-arrival evaluation, penalty calculation, policy configuration, payroll visibility, and auditability  
**Primary surfaces:** Settings, Attendance, Correction, Employee Portal, Reports, Salary Slip, and Fine management

---

## 1. Executive summary

HRFlow currently records attendance using employee in-time and out-time entries, assigns employees to shifts with configured start time, end time, and work hours, and exposes manual fine records such as “Late Entry.” However, the product does not yet provide one consistent, configurable policy engine for deciding whether a day qualifies as a full day, half day, absent, or another attendance state; applying a grace period to late arrivals; or converting late incidents into warnings, deductions, or attendance consequences.

This PRD defines a unified attendance policy engine that evaluates each attendance day against the employee’s effective shift, approved exceptions, and organisation policy. The engine will calculate worked minutes, classify the attendance day, determine whether the employee exceeded the permitted grace period, and apply the configured late-penalty rule. It will preserve the original punches and explain every resulting status or deduction to authorised users.

The goal is not merely to display “Late.” The goal is to make attendance outcomes **predictable, configurable, explainable, reversible, and auditable**.

> **Core principle:** Approved leave, holidays, weekly offs, and authorised exceptions must be evaluated before lateness or full-day penalties. A penalty must never be applied solely because a punch is missing or late when an approved exception explains the day.

---

## 2. Product context and existing capability

The current HRFlow implementation already contains several foundations for this feature:

| Existing capability | Current relevance |
|---|---|
| Employee in-time and out-time entry | Primary source for worked-duration and lateness evaluation |
| Employee-to-shift assignment | Provides the expected start, end, and configured work hours |
| Shift fields such as `startTime`, `endTime`, `workHours`, and flexible-shift state | Inputs to the policy engine |
| Attendance correction workflow | Required for authorised overrides and recalculation |
| Attendance reports and monthly summaries | Required for showing status, late minutes, and penalty totals |
| Manual “Late Entry” fine type | Existing financial concept that should be connected carefully to, but not duplicated by, automated penalties |
| Salary slip and payroll-related views | Downstream visibility for approved deductions |
| Activity logging | Foundation for policy changes, overrides, and penalty decisions |

The existing overtime utility calculates duration from in-time and out-time and uses configured work hours. The new engine should reuse the same date/time conventions and avoid creating a second, conflicting duration calculation path.

### 2.1 Current limitations to resolve

The implementation currently needs a single source of truth for the following decisions:

1. How many minutes constitute a full day, half day, or absence for each shift or employee group.
2. Whether full-day eligibility is based on fixed hours, a percentage of scheduled hours, or both.
3. How late arrival is measured when the employee has a shift start time.
4. Whether a grace period is applied once per day, per punch, per shift, or per month.
5. How repeated late arrivals become warnings, fixed penalties, per-minute penalties, progressive penalties, or attendance deductions.
6. How approved leave, holidays, weekly offs, field work, travel, or manager-approved exceptions affect classification and penalties.
7. How a corrected punch recalculates historical status and whether an already approved penalty is reversed or sent for review.

---

## 3. Goals

The feature must provide a configurable and explainable policy engine that:

- Classifies attendance days consistently as **Full Day, Half Day, Absent, Present—Late, Present—On Time, Holiday, Weekly Off, Leave, Field Work, Exception, or Pending Review**.
- Calculates lateness from the effective shift start time and a configurable grace period.
- Supports organisation-level defaults with optional shift-level, department-level, employee-category-level, and employee-specific overrides.
- Supports multiple late-penalty methods without hard-coding one organisation’s policy.
- Separates attendance classification from financial deduction so an organisation can mark an employee late without automatically deducting money.
- Gives employees and managers an understandable reason for each status and penalty.
- Preserves source punches, policy versions, overrides, and audit history.
- Recalculates deterministically when punches, shift assignments, or policies change.
- Prevents duplicate penalties when a record is recalculated or synchronised more than once.

---

## 4. Non-goals

This release does not attempt to:

- Replace payroll processing or statutory compliance calculations.
- Automatically determine whether a deduction is legally permissible in every jurisdiction.
- Infer attendance from unverified location or device data.
- Redesign the entire Attendance, Settings, or Salary Slip experience.
- Remove manual correction or manager approval workflows.
- Apply penalties to approved leave, holidays, weekly offs, or authorised exceptions.
- Change the existing overtime policy unless explicitly enabled as a separate future policy.
- Retroactively alter historical payroll without an explicit recalculation and approval workflow.

> Organisations must configure deductions in accordance with applicable employment laws, contracts, and internal policies. HRFlow provides calculation and audit tooling; it does not provide legal advice.

---

## 5. Users and permissions

| User role | Capabilities |
|---|---|
| Admin | Create, edit, activate, version, preview, and publish policies; approve overrides; view all audit details |
| HR | Configure or propose policies if permitted; review attendance classifications; approve exceptions and corrections; view penalty reports |
| Manager / MD | Review team attendance; approve exceptions and corrections; view penalty explanations; optionally approve financial deductions |
| Accountant / Payroll | View approved penalty amounts and payroll export fields; cannot silently change attendance punches or policy history |
| Employee | View own shift, expected start, grace allowance, actual lateness, attendance classification, and pending/approved penalty; request correction or exception |
| Auditor / Read-only | View policies, calculations, approvals, and history without mutation rights |

Every policy mutation and every manual override must be permission-checked using the organisation’s existing role and module permissions.

---

## 6. Terminology

| Term | Definition |
|---|---|
| Scheduled start | The effective shift start time for the employee on the attendance date |
| Scheduled end | The effective shift end time, adjusted for overnight shifts where necessary |
| Scheduled minutes | The configured expected working minutes for the shift, excluding unpaid breaks if the shift model supports them |
| Actual in | The accepted attendance in-time after correction and approval rules are applied |
| Actual out | The accepted attendance out-time after correction and approval rules are applied |
| Worked minutes | The elapsed attendance duration, optionally reduced by unpaid break minutes according to policy |
| Grace period | The number of minutes after scheduled start during which late arrival is not penalised |
| Chargeable late minutes | Minutes after the grace period that are eligible for penalty evaluation |
| Full-day threshold | Minimum worked minutes or percentage required for a Full Day classification |
| Half-day threshold | Minimum worked minutes or percentage required for a Half Day classification when the full-day threshold is not met |
| Penalty event | One policy-generated late incident eligible for warning or deduction |
| Policy version | Immutable snapshot of the rules used to evaluate an attendance record |
| Exception | An approved reason that changes or suppresses normal attendance or penalty treatment |
| Effective date | The date from which a shift or attendance policy version applies |

---

## 7. Policy hierarchy and precedence

The engine must resolve policy inputs in a predictable order. The recommended precedence is:

1. Employee-specific policy override, if active for the attendance date.
2. Employee category or department policy, if active.
3. Shift-level policy, if active.
4. Organisation default policy.
5. System-safe fallback values, used only when required fields are missing and clearly flagged for administration.

Shift timing must be resolved separately from penalty policy. An employee can use one shift’s start/end time while inheriting the organisation’s late-penalty policy.

### 7.1 Evaluation precedence

The attendance engine must evaluate records in this order:

1. Confirm the employee, organisation, attendance date, and effective policy version.
2. Resolve day type: holiday, weekly off, leave, field work, travel, approved exception, or regular workday.
3. Resolve shift and expected start/end times.
4. Validate and normalise punches, including overnight shifts.
5. Calculate worked minutes and missing-punch state.
6. Classify the day as Full Day, Half Day, Absent, Present, or Pending Review.
7. Calculate late minutes and apply grace.
8. Determine penalty eligibility and amount.
9. Apply approval and payroll status rules.
10. Persist the calculation snapshot and audit explanation.

If an approved exception suppresses lateness, the engine must retain the raw late minutes for audit but set chargeable late minutes and penalty amount to zero.

---

## 8. Full-day attendance rules

### 8.1 Configuration model

The policy must support two compatible threshold modes:

| Mode | Description | Recommended use |
|---|---|---|
| Fixed minutes | Full Day and Half Day use explicit minute thresholds | Organisations with a fixed daily attendance requirement |
| Percentage of scheduled minutes | Thresholds are calculated from the employee’s effective shift | Organisations with multiple shifts or variable work hours |

The organisation may choose one primary mode. The policy should store both the selected mode and the resolved values used for each attendance record.

### 8.2 Required full-day settings

| Setting | Type | Suggested default | Description |
|---|---:|---:|---|
| `fullDayMode` | enum | `percentage` | `fixed_minutes` or `percentage` |
| `fullDayMinutes` | integer | 480 | Used in fixed-minute mode |
| `fullDayPercentage` | decimal | 0.75 | Minimum percentage of scheduled minutes for Full Day |
| `halfDayMinutes` | integer | 240 | Used in fixed-minute mode |
| `halfDayPercentage` | decimal | 0.50 | Minimum percentage for Half Day |
| `absenceIfBelowHalfDay` | boolean | true | Classify below half-day threshold as Absent or Pending Review |
| `missingOutTreatment` | enum | `pending_review` | `absent`, `half_day`, or `pending_review` |
| `missingInTreatment` | enum | `pending_review` | `absent`, `half_day`, or `pending_review` |
| `minimumPresenceForLatePenalty` | integer | 0 | Minimum worked minutes required before lateness may create a penalty |
| `roundingMode` | enum | `nearest_5` | `none`, `nearest_5`, `nearest_15`, or organisation-defined |

The default values are recommendations only. They must be configurable and must not be silently applied where the organisation has already configured a policy.

### 8.3 Classification logic

For a regular scheduled workday with valid in-time and out-time:

1. Calculate `workedMinutes` from actual in and out.
2. Subtract unpaid break minutes if the shift or policy defines them.
3. Apply the configured rounding rule only to the classification value, while retaining raw minutes for audit.
4. Compare the effective worked minutes with the full-day and half-day thresholds.
5. Assign:
   - **Full Day** when worked minutes meet or exceed the full-day threshold.
   - **Half Day** when worked minutes meet or exceed the half-day threshold but are below the full-day threshold.
   - **Absent** or **Pending Review** when worked minutes are below the half-day threshold, according to policy.

The engine must keep separate fields for `workedMinutesRaw`, `workedMinutesEvaluated`, and `classification` so rounding cannot hide the original duration.

### 8.4 Full-day examples

Assume an 8-hour shift with 480 scheduled minutes and a policy of 75% for Full Day and 50% for Half Day:

| Worked duration | Classification |
|---:|---|
| 480 minutes | Full Day |
| 390 minutes | Full Day, because 390 is at least 360 |
| 300 minutes | Half Day, because 300 is at least 240 but below 360 |
| 210 minutes | Absent or Pending Review, according to policy |
| No in or out punch | Pending Review by default; never silently penalise without configured treatment |

### 8.5 Late arrival and full-day classification

Late arrival must not automatically convert a day to Half Day or Absent. Full-day classification is based on worked minutes and approved policy exceptions. A separate penalty rule may apply to the late arrival. Organisations may optionally configure a severe-lateness rule such as “late beyond X minutes becomes Half Day,” but this must be an explicit policy option, not an implicit side effect.

Required optional setting:

| Setting | Description |
|---|---|
| `severeLateAttendanceAction` | `none`, `half_day`, `absent`, or `pending_review` |
| `severeLateThresholdMinutes` | Chargeable late minutes at which the action is triggered |
| `severeLateRequiresApproval` | Whether the status is pending until HR/manager approval |

### 8.6 Flexible shifts

For a flexible shift without a fixed start time, the engine must not calculate ordinary late arrival. It may still calculate worked duration and full-day classification. The policy may optionally define a required attendance window or latest acceptable start time for flexible shifts; if not configured, the late penalty is disabled for that shift.

### 8.7 Overnight shifts

For shifts where the end time is earlier than the start time, the scheduled end belongs to the following calendar day. The engine must use a timezone-aware date-time calculation and store both `inDate` and `outDate`. A valid overnight attendance record must not be incorrectly marked as negative duration or missing out-time.

---

## 9. Grace-period rules

### 9.1 Required grace settings

| Setting | Type | Suggested default | Description |
|---|---:|---:|---|
| `graceEnabled` | boolean | true | Enables late-arrival grace evaluation |
| `graceMinutes` | integer | 15 | Permitted minutes after scheduled start |
| `graceScope` | enum | `per_day` | `per_punch`, `per_day`, or `per_month` |
| `graceStartBasis` | enum | `scheduled_start` | Uses scheduled start or rostered start |
| `graceAppliesTo` | enum | `late_arrival` | `late_arrival`, `late_arrival_and_early_departure`, or `both` |
| `graceConsumesOnApprovedException` | boolean | false | Whether approved exceptions consume monthly grace allowance |
| `graceRoundingMode` | enum | `none` | Rounding applied to late minutes before comparison |

### 9.2 Recommended default behavior

Under the default `per_day` model:

- Arrival at or before scheduled start is On Time.
- Arrival after scheduled start but within grace is **Present—Within Grace** and has zero chargeable late minutes.
- Arrival after scheduled start plus grace is **Present—Late** and produces chargeable late minutes.
- The raw late minutes remain visible to authorised users even when the grace absorbs them.
- Grace does not change worked minutes or full-day classification.

Formula:

```text
rawLateMinutes = max(0, actualIn - scheduledStart)
chargeableLateMinutes = max(0, rawLateMinutes - graceMinutes)
```

If a grace period is consumed monthly, the engine must maintain a monthly allowance ledger and clearly show remaining grace minutes. A monthly grace policy must never be inferred from a daily policy.

### 9.3 Boundary behavior

The engine must use explicit inclusive boundaries:

- `rawLateMinutes = graceMinutes` means within grace and not chargeable.
- `rawLateMinutes > graceMinutes` means chargeable lateness begins at the excess minute.
- A one-minute difference must be handled consistently in all timezones and browsers.

### 9.4 Multiple punches

The default rule evaluates the first accepted in-punch of the workday against the shift start. Later in-punches must not create duplicate late penalties unless the organisation explicitly enables per-punch evaluation. Rejected or superseded punches are excluded from policy calculation but retained in the audit trail.

### 9.5 Approved exceptions

The following may suppress late penalties when approved before payroll finalisation:

- Manager-approved field work or client visit.
- Official travel.
- Biometric/device outage.
- Transport disruption where the organisation policy allows it.
- Medical or emergency exception.
- Work-from-home or remote-work schedule.
- Shift change not yet reflected in the roster.
- System correction or duplicate punch cleanup.

An exception must include reason, approver, approval timestamp, effective date, and whether it suppresses only the penalty or also changes attendance classification.

---

## 10. Late-penalty rules

### 10.1 Separation of status and money

The engine must separate these concepts:

1. **Attendance status:** whether the employee arrived late.
2. **Penalty eligibility:** whether the lateness meets the configured penalty trigger.
3. **Penalty amount or consequence:** warning, deduction, attendance conversion, or escalation.
4. **Approval status:** whether the result is pending, approved, rejected, waived, reversed, or included in payroll.

A late status must never automatically imply a financial deduction unless the active policy explicitly enables one.

### 10.2 Penalty methods

The policy should support the following methods:

| Method | Description | Example |
|---|---|---|
| Warning only | Records the incident without monetary deduction | First two incidents each month |
| Fixed per event | Deducts a fixed amount for every eligible incident | ₹100 per chargeable late event |
| Per-minute | Deducts an amount for each chargeable late minute | ₹5 × chargeable late minutes |
| Threshold slab | Applies a different amount based on late-minute ranges | 16–30 minutes = ₹100; 31–60 = ₹250 |
| Progressive count | Amount increases with repeated incidents in a period | 1st = warning, 2nd = ₹100, 3rd = ₹250 |
| Attendance conversion | Converts severe lateness to Half Day or another status | Late beyond 120 minutes = Half Day, subject to approval |
| Combined | Applies a status consequence and/or financial penalty | Half Day plus configured deduction |

The organisation must choose whether a penalty method is applied per day, per shift, per occurrence, or per payroll period.

### 10.3 Required penalty settings

| Setting | Type | Description |
|---|---|---|
| `latePenaltyEnabled` | boolean | Enables automated late penalties |
| `penaltyTriggerMinutes` | integer | Minimum chargeable late minutes before a penalty event exists |
| `penaltyMethod` | enum | Warning, fixed, per-minute, slab, progressive, conversion, or combined |
| `fixedPenaltyAmount` | decimal | Amount for fixed-per-event method |
| `perMinutePenaltyAmount` | decimal | Amount per chargeable late minute |
| `penaltyCurrency` | string | Currency used for display and payroll export |
| `penaltyFrequency` | enum | Per day, per shift, per month, or payroll period |
| `penaltyCapPerDay` | decimal | Maximum penalty amount for one day |
| `penaltyCapPerMonth` | decimal | Maximum penalty amount in one month |
| `penaltyCapPerPayrollPeriod` | decimal | Maximum amount for the payroll period |
| `firstIncidentAction` | enum | Warning, penalty, or no action |
| `repeatIncidentWindow` | enum | Calendar month, rolling 30 days, or payroll period |
| `repeatIncidentCount` | integer | Count at which a progressive tier applies |
| `requiresApproval` | boolean | Whether every penalty or only exceptions need approval |
| `payrollTreatment` | enum | Informational, pending deduction, approved deduction, or export-only |
| `roundingMode` | enum | No rounding, nearest currency unit, or configured precision |

### 10.4 Penalty calculation formula

For a per-minute policy:

```text
rawLateMinutes = max(0, actualIn - scheduledStart)
chargeableLateMinutes = max(0, rawLateMinutes - graceMinutes)
eligibleLateMinutes = max(0, chargeableLateMinutes - penaltyTriggerMinutes)
rawPenalty = eligibleLateMinutes × perMinutePenaltyAmount
finalPenalty = min(rawPenalty, applicableCaps)
```

For a fixed-per-event policy:

```text
penaltyEventExists = chargeableLateMinutes >= penaltyTriggerMinutes
finalPenalty = penaltyEventExists ? fixedPenaltyAmount : 0
```

The engine must store the inputs and intermediate values so an authorised reviewer can reproduce the result without reading application logs.

### 10.5 Progressive example

Assume:

- Shift start: 09:00.
- Grace: 15 minutes.
- Trigger: 0 chargeable minutes after grace.
- First incident: warning.
- Second incident in the month: ₹100.
- Third incident: ₹250.
- Fourth and later: ₹500, capped at ₹1,000 per month.

An arrival at 09:20 has 20 raw late minutes and 5 chargeable late minutes. It creates one late incident. If it is the employee’s second eligible incident for the month, the system assigns ₹100 pending approval. The employee can see the raw late minutes, the 15-minute grace, the chargeable 5 minutes, the incident count, and the resulting action.

### 10.6 Early departure

Early departure must be a separate policy dimension. This PRD does not require it to be enabled in the first release, but the data model should allow it without conflating it with late arrival. If enabled later:

```text
earlyDepartureMinutes = max(0, scheduledEnd - actualOut)
chargeableEarlyDepartureMinutes = max(0, earlyDepartureMinutes - earlyDepartureGraceMinutes)
```

The UI must label late arrival and early departure separately.

---

## 11. Data model requirements

The implementation should introduce versioned policy documents and calculation snapshots under the organisation scope. Exact collection names may follow the project’s existing Firestore conventions, but the conceptual model is:

### 11.1 Attendance policy

```text
attendancePolicies/{policyId}
  organisationId
  name
  status: draft | active | archived
  effectiveFrom
  effectiveTo
  priority
  scopeType: organisation | shift | department | category | employee
  scopeId
  fullDayMode
  fullDayMinutes
  fullDayPercentage
  halfDayMinutes
  halfDayPercentage
  graceEnabled
  graceMinutes
  graceScope
  penaltyEnabled
  penaltyMethod
  penaltyTriggerMinutes
  fixedPenaltyAmount
  perMinutePenaltyAmount
  penaltySlabs[]
  progressiveTiers[]
  caps
  severeLateAttendanceAction
  severeLateThresholdMinutes
  missingPunchTreatment
  timezone
  version
  createdBy
  createdAt
  updatedBy
  updatedAt
```

### 11.2 Attendance calculation snapshot

Each evaluated attendance record should retain a snapshot or immutable reference to the policy version:

```text
attendance/{date}/employees/{employeeId}
  inTime
  outTime
  inDate
  outDate
  shiftId
  shiftStart
  shiftEnd
  scheduledMinutes
  workedMinutesRaw
  workedMinutesEvaluated
  rawLateMinutes
  graceMinutes
  chargeableLateMinutes
  penaltyTriggerMinutes
  classification
  lateStatus
  penaltyEligible
  penaltyAmount
  penaltyCurrency
  penaltyMethod
  penaltyStatus: none | warning | pending_approval | approved | rejected | waived | reversed | exported
  policyId
  policyVersion
  calculationVersion
  calculatedAt
  calculatedBy: system | userId
  overrideReason
  overrideBy
  overrideAt
```

### 11.3 Penalty ledger

Financial or payroll-impacting results should have a separate ledger record to prevent duplicate deductions:

```text
penaltyLedger/{penaltyId}
  organisationId
  employeeId
  attendanceRecordId
  attendanceDate
  payrollPeriod
  source: automated_late | manual_fine | attendance_conversion
  amount
  currency
  status
  idempotencyKey
  policyId
  policyVersion
  approvedBy
  approvedAt
  reversedBy
  reversedAt
  reversalReason
  createdAt
```

The existing manual fine feature must not create a duplicate automated penalty for the same attendance event. The product must display the source of each financial record.

---

## 12. User experience requirements

### 12.1 Settings: Attendance Policy section

Add an Attendance Policy section in Settings. The section should provide:

- Active policy summary.
- Draft and published policy versions.
- Scope selector: organisation, shift, department, category, or employee.
- Full-day and half-day threshold controls.
- Grace-period controls.
- Late-penalty method and amount controls.
- Caps and progressive tiers.
- Missing-punch treatment.
- Severe-lateness treatment.
- Effective date and timezone.
- Preview calculator.
- Publish, archive, and rollback actions.
- Change history.

The UI must display plain-language examples beside numeric controls. For example: “A 09:20 arrival on a 09:00 shift with 15 minutes grace produces 5 chargeable late minutes.”

### 12.2 Policy preview calculator

Before publishing, an authorised user must be able to enter:

- Employee or shift.
- Attendance date.
- Scheduled start/end.
- In-time and out-time.
- Approved exception state.
- Current monthly incident count.

The preview must display:

- Resolved policy and version.
- Scheduled minutes.
- Worked minutes.
- Full-day/half-day/absence result.
- Raw late minutes.
- Grace minutes.
- Chargeable late minutes.
- Penalty trigger result.
- Penalty method and amount.
- Approval or payroll status.

The preview must not write an attendance record or penalty ledger entry.

### 12.3 Attendance daily view

For each employee row, show compact indicators for:

| Field | Example |
|---|---|
| Classification | Full Day |
| Late status | Within Grace / Late |
| Late minutes | 20 raw / 5 chargeable |
| Penalty | ₹100 pending approval |
| Exception | Field Work approved |
| Calculation state | Calculated / Pending Review / Overridden |

A detail popover or drawer must show the full calculation explanation. The UI must make it obvious when a status is manually overridden.

### 12.4 Employee Portal

Employees should see their own:

- Effective shift and scheduled start.
- Grace allowance.
- Actual arrival.
- Raw and chargeable late minutes.
- Attendance classification.
- Penalty status and amount, if visible under organisation policy.
- Correction or exception request action.

Employees must not be able to edit the policy or approve their own penalty.

### 12.5 Correction workflow

When a punch is corrected:

1. The record becomes Pending Recalculation.
2. The engine evaluates the corrected record using the policy version effective on the attendance date.
3. Any existing pending penalty is updated idempotently.
4. Any approved or exported penalty is not silently changed; it becomes Reversal Review or requires an authorised reversal workflow.
5. The system records the before and after calculation.

---

## 13. Exceptions and edge cases

| Scenario | Required behavior |
|---|---|
| Holiday | Holiday classification; no late or full-day penalty unless explicitly configured for holiday work |
| Weekly off | Weekly Off classification; no regular late penalty |
| Approved leave | Leave classification; no late penalty |
| Partial-day leave | Evaluate only the required working window, with policy-defined threshold adjustment |
| Field work / travel | Suppress or modify late penalty according to approved exception |
| Missing in punch | Pending Review by default; do not classify as late automatically |
| Missing out punch | Pending Review by default; allow correction workflow |
| Invalid time format | Validation error; preserve raw input; do not calculate financial penalty |
| Out before in on same date | Treat as invalid unless shift is overnight and out date is supplied |
| Overnight shift | Calculate across calendar boundary using shift timezone |
| Flexible shift | No late penalty unless a latest-start rule is configured |
| Shift changed after attendance | Use policy and shift effective on attendance date; do not silently use current shift |
| Policy changed after attendance | Preserve old policy version for historical calculation unless explicit recalculation is approved |
| Duplicate sync/event | Idempotent calculation and penalty ledger key |
| Employee terminated or inactive | Evaluate historical dates; do not create future penalties |
| Negative or excessive penalty amount | Reject invalid configuration and enforce caps |
| Currency change | Preserve currency on historical penalty records |
| Timezone/DST transition | Use organisation/shift timezone and store UTC plus display timezone |
| Manual fine already exists | Display source and prevent duplicate automated penalty where linked to the same event |

---

## 14. Auditability and explainability

Every automated calculation must be explainable. The audit record should answer:

- Which employee and attendance date were evaluated?
- Which shift and policy version were resolved?
- What were the scheduled start/end and scheduled minutes?
- What were the original and accepted punches?
- How many raw late minutes were calculated?
- How many grace minutes were applied?
- How many chargeable late minutes remained?
- Which threshold and penalty method were used?
- What was the resulting classification and amount?
- Was an exception, correction, override, waiver, approval, reversal, or export applied?
- Who made each manual decision and when?

Policy versions must be immutable after publication. Editing an active policy creates a new version rather than mutating the historical rule used by existing attendance records.

---

## 15. Reporting and payroll requirements

Attendance reports should support filtering and aggregation by:

- Employee, department, shift, and category.
- Date range and payroll period.
- Full Day, Half Day, Absent, Late, Within Grace, and Pending Review.
- Raw late minutes and chargeable late minutes.
- Penalty status and amount.
- Approved exceptions.
- Policy version.

Required monthly metrics include:

| Metric | Definition |
|---|---|
| Full-day count | Number of evaluated regular workdays classified as Full Day |
| Half-day count | Number classified as Half Day |
| Absence count | Number classified as Absent |
| Late incident count | Number of eligible late events after grace and trigger rules |
| Grace usage | Raw late minutes absorbed by grace |
| Chargeable late minutes | Late minutes remaining after grace |
| Warning count | Penalty events with warning-only action |
| Pending penalty amount | Amount awaiting approval |
| Approved penalty amount | Amount approved for payroll treatment |
| Reversed amount | Previously approved amount reversed after correction or exception |

Salary Slip and payroll export must use only penalties in the configured payroll status, normally `approved` or `exported`. Warnings and pending amounts must not be silently deducted.

---

## 16. Notifications

The first release should support in-product notifications and optionally email or push integration if already available.

| Trigger | Recipient | Message intent |
|---|---|---|
| Policy published | HR/Admin | Policy version and effective date |
| Employee reaches late threshold | Employee and manager | Late minutes and current status |
| Penalty becomes pending approval | Approver | Employee, date, amount, and explanation |
| Penalty approved | Employee, payroll | Approved amount and payroll period |
| Correction changes a penalty | Approver and payroll | Before/after calculation and required action |
| Policy publish conflicts with pending payroll | Admin/HR | Warning before activation |

Notifications must avoid exposing other employees’ attendance or penalty information.

---

## 17. Validation and business rules

Configuration validation must include:

- Grace minutes are zero or greater.
- Full-day percentage is greater than or equal to half-day percentage.
- Percentages are between 0 and 1, or displayed as 0–100% in the UI.
- Full-day minutes are greater than half-day minutes in fixed-minute mode.
- Penalty trigger minutes are zero or greater.
- Fixed and per-minute amounts are non-negative.
- Slab ranges do not overlap and are ordered.
- Progressive incident counts are positive and ordered.
- Caps are not negative and are consistent with the configured frequency.
- Effective date cannot create an ambiguous overlapping active policy at the same scope and priority.
- A policy cannot be published without a timezone and an explicit missing-punch treatment.
- Any payroll-impacting method must show an approval requirement before publication.

---

## 18. Migration and backward compatibility

The feature must be introduced without rewriting historical attendance automatically.

### 18.1 Existing records

- Existing attendance records remain valid and retain their existing status fields.
- New calculation fields may be null until the record is evaluated or explicitly backfilled.
- A backfill tool may calculate historical records, but it must run in preview mode first and report changes before writing.
- Historical records must use the policy version effective on their date, not the current policy.
- Existing manual fines remain manual and must be marked with `source: manual_fine` when migrated into a common ledger.

### 18.2 Activation strategy

1. Build and test the policy engine in shadow mode.
2. Calculate proposed classifications and penalties without affecting payroll.
3. Compare results with HR’s expected outcomes.
4. Publish the first policy version.
5. Enable attendance status display.
6. Enable penalty warnings.
7. Enable approved payroll deductions only after explicit organisation confirmation.

---

## 19. Non-functional requirements

| Area | Requirement |
|---|---|
| Determinism | The same punches, shift, policy version, timezone, and exceptions must always yield the same calculation. |
| Idempotency | Re-running evaluation must not create duplicate penalty ledger entries. |
| Performance | Daily and monthly summaries should remain responsive for large organisations; batch recalculation must be paginated. |
| Security | Firestore access must enforce organisation scope and role permissions. Employees may read only their permitted records. |
| Reliability | Failed calculation must leave the attendance record visible as Pending Review rather than silently assigning a penalty. |
| Audit | All policy, calculation, override, approval, and reversal actions must be traceable. |
| Accessibility | Policy forms, error messages, tables, and status badges must be keyboard accessible and screen-reader understandable. |
| Localisation | Dates, times, currency, and timezone must respect organisation settings. |
| Privacy | Penalty and payroll information must not leak through notifications, URLs, or client-side logs. |
| Testability | Calculation logic must be isolated from UI code and covered by unit and scenario tests. |

---

## 20. Acceptance criteria

### 20.1 Full-day classification

- **AC-FD-01:** Given an employee with an 8-hour shift and a 75% full-day threshold, 360 or more evaluated worked minutes classify as Full Day.
- **AC-FD-02:** Given the same shift and a 50% half-day threshold, 240–359 evaluated minutes classify as Half Day.
- **AC-FD-03:** Worked minutes below the half-day threshold follow the configured Absent or Pending Review treatment.
- **AC-FD-04:** Late arrival alone does not change Full Day to Half Day when worked minutes meet the full-day threshold.
- **AC-FD-05:** Missing punches use the configured missing-punch treatment and do not create an unexplained penalty.
- **AC-FD-06:** Overnight shifts calculate positive worked minutes across the date boundary.
- **AC-FD-07:** Flexible shifts do not calculate lateness unless a latest-start rule exists.

### 20.2 Grace period

- **AC-GR-01:** Arrival at scheduled start has zero late minutes.
- **AC-GR-02:** Arrival within the grace period is marked Within Grace with zero chargeable late minutes.
- **AC-GR-03:** Arrival beyond grace stores both raw late minutes and chargeable late minutes.
- **AC-GR-04:** The grace boundary is deterministic and inclusive according to the documented rule.
- **AC-GR-05:** Approved exceptions suppress chargeable late minutes when configured to do so.
- **AC-GR-06:** Multiple in-punches do not create duplicate daily penalties under the default per-day scope.

### 20.3 Late penalties

- **AC-LP-01:** Warning-only policies create an incident but no financial ledger amount.
- **AC-LP-02:** Fixed-per-event policies create exactly one idempotent ledger record per eligible event.
- **AC-LP-03:** Per-minute policies multiply eligible chargeable minutes by the configured rate.
- **AC-LP-04:** Slab policies select exactly one matching range and reject overlapping configuration.
- **AC-LP-05:** Progressive policies use the correct incident count in the configured period.
- **AC-LP-06:** Daily, monthly, and payroll-period caps are enforced.
- **AC-LP-07:** Pending penalties do not appear as approved payroll deductions.
- **AC-LP-08:** A correction updates pending calculations and sends approved/exported changes through reversal review.
- **AC-LP-09:** Existing manual fines are not duplicated by automated late penalties.

### 20.4 Administration and audit

- **AC-AD-01:** Only authorised roles can publish or activate a policy.
- **AC-AD-02:** Publishing creates an immutable policy version with an effective date.
- **AC-AD-03:** The policy preview explains every intermediate calculation without writing data.
- **AC-AD-04:** Every calculation stores the policy version and resolved inputs.
- **AC-AD-05:** Every override, waiver, approval, and reversal stores actor, timestamp, and reason.
- **AC-AD-06:** Historical attendance remains tied to the policy version effective on its date.

---

## 21. Test plan

### Unit tests

The calculation library must cover:

- On-time arrival.
- Arrival exactly at the grace boundary.
- Arrival one minute beyond grace.
- Fixed-minute full-day and half-day thresholds.
- Percentage thresholds across shifts with different work hours.
- Overnight shifts.
- Flexible shifts.
- Missing in and missing out punches.
- Approved leave, holiday, weekly off, and exception suppression.
- Fixed, per-minute, slab, progressive, warning-only, and conversion penalties.
- Daily and monthly caps.
- Currency rounding.
- Idempotency keys and recalculation.
- Policy effective-date selection and versioning.
- DST and timezone transitions.

### Integration tests

- Attendance write followed by calculation snapshot.
- Correction followed by pending penalty update.
- Approval followed by payroll status update.
- Reversal followed by ledger update.
- Policy publication followed by correct effective-date resolution.
- Organisation-level data isolation.

### Browser acceptance tests

An authorised reviewer should verify:

1. Create a draft policy.
2. Preview a set of sample arrivals and durations.
3. Publish the policy with an effective date.
4. Enter or correct attendance.
5. Confirm Full Day, Half Day, Late, Within Grace, and Pending Review indicators.
6. Approve or waive a penalty.
7. Confirm the employee view and payroll view show the expected status.
8. Change the policy and confirm historical records retain their original version.

---

## 22. Rollout plan

| Phase | Scope | Exit criteria |
|---|---|---|
| Phase 0 | Calculation library and unit tests | Deterministic test suite passes |
| Phase 1 | Settings and preview calculator | HR can create and preview policies without writing attendance |
| Phase 2 | Shadow evaluation | Proposed results reviewed against real historical records |
| Phase 3 | Attendance statuses | Full-day, half-day, late, and grace results visible; no payroll deduction |
| Phase 4 | Warnings and approvals | Late incidents and pending penalties available to approvers |
| Phase 5 | Payroll integration | Approved penalties appear in payroll/export according to policy |
| Phase 6 | Recalculation and analytics | Corrections, policy versioning, reports, and caps validated in production |

The default rollout should be **shadow mode first** and **financial deductions off** until the organisation explicitly enables them.

---

## 23. Risks and mitigations

| Risk | Mitigation |
|---|---|
| Policy produces legally or contractually inappropriate deductions | Require explicit approval, configurable enablement, policy acknowledgement, and payroll review |
| Different modules calculate different outcomes | Centralise calculation logic and expose calculation snapshots |
| Historical records change unexpectedly after policy edits | Immutable policy versions and effective-date resolution |
| Duplicate deductions after retries | Idempotency keys and separate penalty ledger |
| Missing punches create unfair penalties | Pending Review default and correction workflow |
| Shift changes produce incorrect lateness | Resolve shift by attendance-date effective assignment |
| Timezone and overnight errors | Store timezone-aware timestamps and test date-boundary cases |
| HR cannot explain a result | Store raw inputs, intermediate values, policy version, and reason text |
| Employee disputes a deduction | Employee-facing explanation and correction/exception request workflow |
| Large backfills impact performance | Preview, pagination, batching, progress state, and scheduled recalculation |

---

## 24. Open product decisions

The following decisions must be confirmed with HR/payroll stakeholders before implementation is finalised:

1. What are the organisation’s default Full Day and Half Day thresholds?
2. Is Full Day based on fixed minutes, percentage of shift, or a different rule?
3. Is grace applied per day, per shift, or as a monthly allowance?
4. Does grace apply only to late arrival, or also to early departure?
5. Is the first late incident a warning, a penalty, or exempt?
6. Should late penalties be fixed, per-minute, slab-based, progressive, or combined?
7. What is the penalty cap per day and per payroll period?
8. Do severe late arrivals change attendance classification, and what approval is required?
9. Which exceptions suppress penalties, and who can approve them?
10. Should employees see penalty amounts before payroll approval?
11. How should partial-day leave adjust full-day and late rules?
12. Which payroll status qualifies an amount for deduction/export?
13. Should policy overrides be allowed at shift, department, category, or employee level?
14. What timezone and rounding conventions apply to each organisation?
15. How should historical records be backfilled, if at all?

---

## 25. References

[1]: https://github.com/varankeerthi-dev/hrflow-pwa/blob/main/README.md "HRFlow repository README"
[2]: https://github.com/varankeerthi-dev/hrflow-pwa/blob/main/src/components/tabs/AttendanceTab.jsx "HRFlow Attendance tab"
[3]: https://github.com/varankeerthi-dev/hrflow-pwa/blob/main/src/components/tabs/SettingsTab.jsx "HRFlow Settings tab"
[4]: https://github.com/varankeerthi-dev/hrflow-pwa/blob/main/src/hooks/useAttendance.js "HRFlow attendance calculation utilities"
[5]: https://github.com/varankeerthi-dev/hrflow-pwa/blob/main/src/components/tabs/FineTab.jsx "HRFlow Fine tab"


---

## 26. Architecture and security audit

### 26.1 Audit conclusion

The original PRD contains useful role definitions and states that Firestore must enforce organisation scope, but it does **not yet specify an enforceable tenant-isolation model, a complete RBAC matrix, a permission-checking boundary, or a non-monolithic implementation architecture**. Those omissions must be closed before engineering begins.

The feature must be implemented as a modular policy capability inside the existing HRFlow application. It must not become a second copy of attendance logic inside `AttendanceTab`, `SettingsTab`, `CorrectionTab`, `FineTab`, `SalarySlipTab`, and the Employee Portal. UI modules may present and trigger operations, but they must call one shared policy domain and calculation layer.

### 26.2 Tenant model

HRFlow is a multi-organisation product. For this feature, the organisation is the tenant boundary and must be treated as mandatory security context, not merely a filter in the UI.

Every policy, attendance calculation, exception, approval, penalty ledger, audit event, and payroll export record must include an immutable `organisationId` or be stored under a Firestore path that unambiguously contains the organisation identifier. The recommended canonical path is:

```text
organisations/{organisationId}/attendancePolicies/{policyId}
organisations/{organisationId}/attendanceCalculations/{calculationId}
organisations/{organisationId}/penaltyLedger/{penaltyId}
organisations/{organisationId}/attendanceExceptions/{exceptionId}
organisations/{organisationId}/attendanceAudit/{auditId}
```

The tenant context must be resolved from the authenticated session and verified against membership. A client-supplied organisation identifier must never be trusted by itself.

#### Tenant-isolation requirements

| ID | Requirement |
|---|---|
| TEN-01 | Every read and write must execute with an authenticated `organisationId` context. |
| TEN-02 | Firestore rules must verify that the authenticated user is an active member of the target organisation. |
| TEN-03 | A user who belongs to multiple organisations must select an active organisation context; switching context must invalidate cached policy and attendance queries. |
| TEN-04 | All query helpers must require tenant context as an argument or obtain it from a trusted server/session boundary. |
| TEN-05 | Cross-tenant document IDs, employee IDs, policy IDs, and ledger IDs must not be accepted as proof of access. |
| TEN-06 | Organisation-specific policy, timezone, currency, workweek, and payroll-period settings must never fall back to another organisation’s values. |
| TEN-07 | Background recalculation and scheduled jobs must iterate explicitly by organisation and must not use global unscoped queries. |
| TEN-08 | Audit events must include tenant context and must not expose data from another organisation in logs or notifications. |
| TEN-09 | Tenant isolation must be tested with two organisations containing identical employee and policy IDs. |
| TEN-10 | Deactivated membership or organisation access must immediately prevent policy mutation and penalty approval. |

#### Tenant-aware caching

React Query, Zustand, browser storage, and any future server cache must include `organisationId` and user permission scope in the cache key. A user switching from Organisation A to Organisation B must never see Organisation A’s policy, employee, penalty, or preview data while Organisation B is active.

Recommended cache-key examples:

```text
['attendance-policy', organisationId, policyScope]
['attendance-calculation', organisationId, employeeId, attendanceDate]
['penalty-ledger', organisationId, payrollPeriod, filters]
```

### 26.3 RBAC model

The PRD’s role list is a good starting point, but role names alone are not sufficient. The implementation must use capability-based permissions at the organisation boundary. Roles may grant permissions, but the calculation service must check the resulting capability rather than relying on a UI label such as `Admin` or `HR`.

Recommended permission namespace:

```text
AttendancePolicy.view
AttendancePolicy.create
AttendancePolicy.edit
AttendancePolicy.publish
AttendancePolicy.archive
AttendancePolicy.preview
AttendanceCalculation.view_own
AttendanceCalculation.view_team
AttendanceCalculation.view_all
AttendanceCalculation.recalculate
AttendanceCorrection.request
AttendanceCorrection.approve
AttendanceException.request
AttendanceException.approve
LatePenalty.view_own
LatePenalty.view_team
LatePenalty.view_all
LatePenalty.waive
LatePenalty.approve
LatePenalty.reverse
PayrollPenalty.export
AttendanceAudit.view
```

#### RBAC matrix

| Capability | Admin | HR | Manager/MD | Accountant | Employee | Auditor |
|---|---:|---:|---:|---:|---:|---:|
| View own attendance result | Yes | Yes | Yes | Yes | Yes | By scope |
| View team attendance | Yes | Yes | Assigned team | Payroll scope | No | By scope |
| View all tenant attendance | Yes | Configurable | Configurable | Payroll scope | No | By scope |
| Draft a policy | Yes | Configurable | No | No | No | No |
| Publish a policy | Yes | Configurable with approval | No | No | No | No |
| Preview a policy | Yes | Yes | Optional | Optional | No | Read-only |
| Request correction | Yes | Yes | Yes | Optional | Own records |
| Approve correction | Yes | Yes | Assigned team | No | No |
| Request exception | Yes | Yes | Yes | Optional | Own records |
| Approve exception | Yes | Yes | Assigned team | No | No |
| View penalty amount | Yes | Yes | Assigned team | Payroll scope | Own amount if enabled | By scope |
| Approve penalty | Yes | Configurable | Configurable | Payroll scope | No |
| Waive penalty | Yes | Configurable | Configurable | No | No |
| Reverse approved penalty | Yes | Configurable with reason | Configurable with reason | Payroll workflow | No |
| Export payroll penalties | Yes | No unless granted | No | Yes | No |
| View audit history | Yes | Yes | Scoped | Payroll scoped | Own decision history only | Yes |

The exact matrix may vary by organisation, but the feature must not use a single broad `canApprove` boolean for all actions. Policy publication, correction approval, penalty approval, waiver, reversal, and payroll export are materially different permissions.

#### RBAC enforcement boundary

Permission checks must exist in three layers:

1. **Navigation layer:** Hide or disable unavailable screens and actions.
2. **Application/service layer:** Reject unauthorised commands even if a user manually invokes a handler or crafts a request.
3. **Firestore security layer:** Enforce tenant membership, document scope, and role/capability constraints independently of the client.

The third layer is mandatory. A hidden button is not a security control.

### 26.4 Approval and separation of duties

A user who authors or publishes a payroll-impacting policy should not automatically approve the resulting penalty for the same event unless the organisation explicitly allows it. The system should support separation-of-duties settings:

- Policy author cannot approve their own policy publication when two-person approval is enabled.
- Employee cannot approve their own correction, exception, or penalty waiver.
- Payroll exporter cannot silently edit the source attendance calculation.
- A penalty approver cannot change the policy snapshot used by the penalty.
- A reversal must require a reason and preserve the original approved record.

The UI must communicate when an action is blocked by separation-of-duties rules rather than presenting a generic permission error.

---

## 27. Non-monolithic architecture requirements

### 27.1 Architectural decision

The feature must be implemented as a set of independent modules with explicit contracts. It must not be implemented as a large conditional block inside `AttendanceTab.jsx` or duplicated across the Settings, Correction, Fine, Salary Slip, Reports, and Employee Portal components.

The recommended architecture is a **modular monolith at the product boundary with isolated domain modules**. This is appropriate for the current application while keeping the policy engine extractable later. The implementation should not introduce distributed services prematurely, but it must maintain boundaries so attendance policy calculation, penalty ledger management, and UI presentation are independently testable.

### 27.2 Proposed module boundaries

```text
src/domain/attendancePolicy/
  policyTypes.js
  policySchema.js
  policyResolver.js
  policyValidator.js
  policyVersioning.js

src/domain/attendanceCalculation/
  calculateWorkedMinutes.js
  classifyAttendanceDay.js
  calculateLateness.js
  calculateGrace.js
  calculateSevereLateAction.js
  calculateAttendanceResult.js

src/domain/latePenalty/
  calculatePenalty.js
  penaltySlabs.js
  progressivePenalty.js
  penaltyCaps.js
  penaltyLedger.js

src/domain/attendanceExceptions/
  exceptionTypes.js
  resolveException.js
  exceptionPermissions.js

src/application/attendancePolicy/
  createPolicy.js
  publishPolicy.js
  previewPolicy.js
  archivePolicy.js

src/application/attendanceCalculation/
  recalculateAttendance.js
  recalculatePeriod.js
  explainCalculation.js

src/application/latePenalty/
  approvePenalty.js
  waivePenalty.js
  reversePenalty.js
  exportPenalties.js

src/data/attendancePolicy/
  policyRepository.js
  policyQueries.js

src/data/attendanceCalculation/
  attendanceCalculationRepository.js

src/data/latePenalty/
  penaltyLedgerRepository.js

src/components/attendancePolicy/
  AttendancePolicySettings.jsx
  PolicyScopeSelector.jsx
  PolicyPreviewCalculator.jsx
  PolicyVersionHistory.jsx

src/components/attendanceCalculation/
  AttendanceStatusBadge.jsx
  CalculationExplanationDrawer.jsx
  AttendanceResultFilters.jsx

src/components/latePenalty/
  PenaltyStatusBadge.jsx
  PenaltyApprovalPanel.jsx
  PenaltyLedgerTable.jsx
  PenaltySummaryCard.jsx
```

The exact directory names may adapt to the repository’s conventions, but the boundaries must remain visible and reviewable.

### 27.3 Dependency direction

The dependency direction must be one-way:

```text
UI components
  -> application commands/queries
    -> domain policies and pure calculation functions
      -> data repositories
        -> Firebase/Firestore adapters
```

Domain calculation functions must not import React, Firebase, browser globals, navigation, or UI components. Repositories must not contain classification policy. Components must not duplicate the formulas.

### 27.4 Pure calculation contract

The central calculation function should accept a serialisable input and return a serialisable result:

```text
calculateAttendanceResult({
  attendanceDate,
  timezone,
  employee,
  shift,
  punches,
  dayType,
  exceptions,
  policy,
  incidentHistory,
}) -> {
  classification,
  workedMinutesRaw,
  workedMinutesEvaluated,
  rawLateMinutes,
  graceMinutes,
  chargeableLateMinutes,
  penalty,
  explanation,
  warnings,
}
```

This contract enables unit testing, preview mode, batch recalculation, audit reproduction, and future server-side execution without coupling the engine to a page component.

### 27.5 Repository and command boundaries

All Firestore access for the feature must pass through repositories or data-access adapters. UI components must not directly construct policy or penalty collection paths. Commands must:

- Resolve tenant context.
- Check capability permissions.
- Validate input schema.
- Resolve policy and shift versions.
- Execute the domain calculation.
- Persist the result and audit event transactionally where possible.
- Return a typed result or typed error.

### 27.6 Avoiding a second policy engine

The existing overtime calculation and any existing late-status calculation must be reviewed before implementation. The feature must either reuse or replace conflicting logic through an explicit migration. It must not leave one late calculation in Correction, another in Attendance, and a third in payroll summaries.

The PRD should be treated as complete only when there is one documented owner for:

- Worked-minute calculation.
- Shift-time resolution.
- Full-day/half-day classification.
- Grace calculation.
- Late-penalty calculation.
- Penalty ledger idempotency.

### 27.7 Modular acceptance criteria

| ID | Requirement |
|---|---|
| ARC-01 | Pure policy and penalty calculations run without React, Firebase, or browser dependencies. |
| ARC-02 | Settings, Attendance, Correction, Reports, Salary Slip, and Employee Portal consume the same calculation contract. |
| ARC-03 | Firestore paths are created only in repository/data-access modules. |
| ARC-04 | Tenant context and capability checks are performed before any mutation. |
| ARC-05 | A preview uses the same domain calculation as production evaluation but performs no persistence. |
| ARC-06 | The engine can be unit-tested with fixtures without mounting a page. |
| ARC-07 | New penalty methods can be added without editing every page component. |
| ARC-08 | A policy version can be replayed against historical input and produce the same result. |
| ARC-09 | Batch recalculation is an application command, not a page-level loop. |
| ARC-10 | Domain errors distinguish invalid policy, missing punch, permission denied, tenant mismatch, and approval conflict. |

---

## 28. UX audit and improvements

### 28.1 UX audit conclusion

The original PRD specifies the necessary fields but risks presenting a very dense administration form. Attendance policy is a high-consequence workflow: a small configuration mistake can affect employee status and pay. The UX must therefore prioritise comprehension, safe defaults, previewability, progressive disclosure, and visible impact before publication.

### 28.2 Recommended settings experience

Use a step-based policy builder instead of one long form:

| Step | User task | UX guidance |
|---|---|---|
| 1. Scope | Choose where the policy applies | Show a clear scope summary and warn about overrides |
| 2. Attendance day | Define Full Day, Half Day, and missing-punch rules | Use examples and a visual threshold timeline |
| 3. Grace period | Configure permitted lateness | Show the exact boundary with sample arrivals |
| 4. Penalty action | Choose warning, deduction, slab, progressive, or conversion | Start with Warning Only and reveal financial controls only when enabled |
| 5. Exceptions | Define leave, field work, travel, and correction behavior | Provide standard exception presets and approval requirements |
| 6. Preview | Test real scenarios | Include at least five scenario cards and before/after results |
| 7. Review and publish | Confirm the impact | Show affected scope, effective date, policy diff, and approval requirement |

### 28.3 Use plain language alongside technical values

Every advanced value should have a human-readable interpretation. For example:

```text
Grace period: 15 minutes
Meaning: Arrivals from 09:00 through 09:15 are not chargeable as late.
```

Avoid exposing internal field names such as `penaltyTriggerMinutes` as the primary label. Use “Late minutes before a penalty starts,” with the field name reserved for developer documentation.

### 28.4 Add a policy impact simulator

The preview calculator should support a small scenario table rather than one isolated calculation:

| Arrival | Worked time | Result | Penalty |
|---|---:|---|---:|
| 09:00 | 8h 00m | Full Day / On Time | None |
| 09:12 | 7h 48m | Full Day / Within Grace | None |
| 09:20 | 7h 40m | Full Day / 5 chargeable late minutes | Based on policy |
| 10:30 | 6h 30m | Full Day or Half Day depending on rule | Based on policy |
| Missing out | Unknown | Pending Review | No automatic penalty |

This table should update immediately as the policy controls change. It is more understandable than asking HR to mentally simulate formulas.

### 28.5 Safe defaults and progressive disclosure

Recommended UX safety rules:

- Default `latePenaltyEnabled` to off for a new policy.
- Default missing punches to Pending Review.
- Require an explicit confirmation before enabling payroll-impacting deductions.
- Keep penalty amount fields hidden until a financial method is selected.
- Show “This affects payroll” beside every financially consequential control.
- Require a policy name, effective date, timezone, and scope before saving.
- Prevent publication if the configuration creates overlapping slabs or ambiguous thresholds.
- Show a warning when a new policy affects a large employee population.
- Show a policy diff when publishing a new version.

### 28.6 Attendance table UX

The daily attendance grid should not become overloaded with numbers. Use a compact status hierarchy:

1. Primary badge: Full Day, Half Day, Absent, Pending Review.
2. Secondary badge: On Time, Within Grace, Late, Exception.
3. Detail drawer: raw minutes, grace, chargeable minutes, policy version, penalty calculation, and audit history.

The table should support quick filters such as:

- Needs Review.
- Late Today.
- Penalty Pending.
- Missing Punch.
- Exception Applied.
- Policy Override.

Use consistent colors but do not rely on color alone. Every status must include text and an accessible label.

### 28.7 Employee-facing UX

Employees should see a neutral, non-accusatory explanation:

> “Your shift started at 09:00. You checked in at 09:20. Your 15-minute grace period absorbed 15 minutes, leaving 5 chargeable late minutes. This day remains Full Day based on your worked time.”

If a penalty is pending, show “Pending HR/manager approval,” not “Penalty applied.” If the employee can request correction, place the action next to the explanation and prefill the date and attendance record.

### 28.8 Approval UX

Approvers should receive a review queue with:

- Employee and date.
- Attendance result.
- Original and corrected punches.
- Raw late, grace, and chargeable minutes.
- Policy version.
- Exception or correction reason.
- Penalty amount and payroll status.
- Approve, waive, reject, or request correction actions.

Bulk approval must show a pre-submit summary and must never silently approve mixed states. If multiple records use different policy versions or have warnings, group them visibly.

### 28.9 Policy version UX

Policy history should look like a timeline:

```text
v3 — Effective 01 Apr 2026 — Published by HR — 15 min grace, warning-only
v2 — Effective 01 Jan 2026 — Archived — 10 min grace, fixed penalty
v1 — Effective 01 Apr 2025 — Archived
```

Users should be able to compare two versions and see which employees or shifts are affected. Historical attendance should link directly to the policy version used in its calculation.

### 28.10 Error prevention and recovery

The UI must provide actionable errors:

- “Full Day threshold must be greater than or equal to Half Day threshold.”
- “This policy overlaps with Organisation Default for the same effective date and scope.”
- “Payroll deductions are enabled. Add an approval requirement before publishing.”
- “This correction changes an already exported penalty. A reversal review is required.”

Never discard an unsaved policy. Warn before leaving a draft with unsaved changes and provide a recovery path.

### 28.11 Responsive and accessibility requirements

- The policy builder must work on desktop and tablet; mobile should support review even if complex editing is desktop-preferred.
- Tables must provide a responsive card or drawer view on narrow screens.
- All controls require visible labels, keyboard focus, and screen-reader descriptions.
- Numeric inputs must support keyboard entry, validation, and unit suffixes such as “minutes” or currency.
- Status badges must meet contrast requirements and include text.
- Long explanations should be available through a drawer or expandable details region, not hover-only tooltips.

### 28.12 UX acceptance criteria

| ID | Requirement |
|---|---|
| UX-01 | A new policy defaults to no payroll-impacting deduction until explicitly enabled. |
| UX-02 | HR can understand the result of a sample 09:20 arrival without reading a formula. |
| UX-03 | The policy preview shows at least five representative scenarios before publish. |
| UX-04 | Payroll-impacting controls show a visible warning and approval requirement. |
| UX-05 | Employees see a plain-language explanation of late and penalty status. |
| UX-06 | Approvers can inspect raw, grace, chargeable, and policy-version values before acting. |
| UX-07 | Policy publication shows scope, effective date, version, and impact summary. |
| UX-08 | All errors identify the invalid field and how to correct it. |
| UX-09 | Historical records link to the immutable policy version used for calculation. |
| UX-10 | The core workflow is usable without color-only status interpretation or hover-only interactions. |

---

## 29. Revised implementation sequence

The original rollout is expanded to protect tenant data, preserve modularity, and validate the UX before payroll impact:

| Phase | Deliverable | Gate |
|---|---|---|
| 0 | Tenant context, repository boundaries, permission constants, security-rule test fixtures | Cross-tenant reads and writes fail in automated tests |
| 1 | Pure calculation domain module with fixtures | Full-day, grace, penalty, exception, and timezone tests pass |
| 2 | Policy repository, versioning, validation, and preview command | Draft policies can be previewed without persistence side effects |
| 3 | Settings policy builder and impact simulator | HR usability review passes; no payroll activation yet |
| 4 | Attendance and correction integration | All pages consume the same calculation contract |
| 5 | Exception and approval queues | RBAC, tenant scope, and separation of duties verified |
| 6 | Shadow mode and historical comparison | HR signs off on sample results |
| 7 | Warning-only production mode | No unexpected payroll changes for one complete period |
| 8 | Optional approved payroll deductions | Organisation explicitly enables after approval and audit review |

No implementation phase should begin payroll deductions before phases 0–6 are complete.

---

## 30. Revised definition of done

The feature is not complete until:

1. Tenant isolation has automated tests covering two organisations with overlapping identifiers.
2. Firestore security rules enforce organisation membership and scoped permissions.
3. UI, application commands, and repository writes all enforce RBAC independently.
4. Policy calculations are isolated from React and Firebase and have deterministic unit tests.
5. Attendance, Correction, Reports, Salary Slip, Fine, and Employee Portal use one calculation contract.
6. Policy versions, calculation snapshots, exceptions, approvals, waivers, reversals, and penalty ledger entries are auditable.
7. New policies default to non-financial warning mode and require explicit payroll activation.
8. The preview simulator demonstrates clear outcomes for full day, half day, late within grace, chargeable late, missing punch, and approved exception scenarios.
9. HR, payroll, and employee UX reviews are completed at the defined rollout gates.
10. No commit or production activation is made until tenant, RBAC, architecture, and UX acceptance criteria pass.


---

## 31. COO-level enterprise review

### 31.1 Executive assessment

For a company with more than 1,000 employees, attendance policy is not a small settings feature. It is a controlled operating process that can affect pay, employee relations, manager workload, legal exposure, and trust in the HR system. The product must therefore optimise for **fairness, operational control, explainability, scale, and payroll cut-off discipline**, not only for formula flexibility.

The original PRD was strong on calculation concepts and had already added important tenant, RBAC, modularity, and UX requirements. From a COO perspective, it still needed stronger decisions in five areas:

| Area | Enterprise risk | Resolution in this PRD |
|---|---|---|
| Policy governance | A poorly configured policy can affect hundreds of employees immediately | Maker-checker approval, impact simulation, effective-date control, and policy freeze windows |
| Payroll operations | Late recalculations can create discrepancies after payroll is locked | Payroll cut-off states, recalculation windows, immutable exported results, and reversal workflows |
| Workforce complexity | 1,000+ employees rarely share one simple shift or one legal rule | Rosters, split shifts, breaks, legal entities, union/contract groups, and effective-dated assignments |
| Data reliability | Device sync, missing punches, clock drift, and duplicate events can create false penalties | Source precedence, event idempotency, anomaly queues, and pending-review defaults |
| Scale and support | HR cannot manually inspect thousands of rows each day | Exception queues, risk-based triage, bulk actions with safeguards, SLAs, metrics, and observability |

### 31.2 Executive policy decision

The product must not treat every late event as a monetary penalty. For the initial production release:

1. Attendance classification and late visibility are enabled first.
2. Warning-only late events are the default consequence.
3. Financial deductions are disabled by default.
4. Financial deductions can be enabled only at a legal-entity or payroll-group scope after explicit configuration, maker-checker approval, simulation, and payroll owner sign-off.
5. The system must support attendance consequences and warnings independently from financial deductions.
6. A company-wide policy must never override a stricter legal-entity, collective-agreement, contract, or protected-employee rule.

This decision reduces operational and employee-relations risk while preserving the requested policy capability.

---

## 32. Enterprise operating model

### 32.1 Organisational dimensions

The policy scope must support more than an organisation and department. At 1,000+ employees, the following dimensions must be represented explicitly:

```text
Tenant / Organisation
  Legal Entity
    Country / Jurisdiction
      Business Unit
        Location / Site
          Department
            Employee Category / Grade
              Collective Agreement or Contract Group
                Shift / Roster
                  Employee
```

Not every deployment must use every dimension, but the data model must not make legal entity, location, or contract group impossible to add later.

### 32.2 Scope precedence

The recommended precedence is:

1. Protected or legally mandated rule for the employee’s legal entity and jurisdiction.
2. Collective agreement or contract-group rule.
3. Employee accommodation or approved individual exception.
4. Employee-specific policy override.
5. Shift or roster policy.
6. Location or site policy.
7. Department or business-unit policy.
8. Organisation default.

A more specific policy may tighten or relax a general rule only when the organisation allows it and the change is valid for the employee’s legal context. A policy resolver must return not only the final rule but also the complete resolution trace.

### 32.3 Policy ownership

Each active policy must have:

- A business owner, normally HR or People Operations.
- A payroll owner for any payroll-impacting consequence.
- A legal/compliance acknowledgement for financial deduction policies where required by the organisation.
- A technical owner for calculation and data integrity.
- A defined review date.
- An escalation contact.

No policy should remain active indefinitely without review. The system should flag policies approaching their review date.

---

## 33. Workforce and scheduling edge cases

The following cases are mandatory for an enterprise-grade implementation.

| Scenario | Required product behavior |
|---|---|
| Rotating roster | Resolve the roster assignment effective on the attendance date; do not infer the current shift. |
| Split shift | Evaluate each scheduled interval separately and aggregate the result according to policy. |
| Multiple shifts in one day | Use a schedule instance ID and prevent one shift’s lateness from being applied to another. |
| Breaks | Distinguish paid and unpaid breaks; subtract only policy-defined unpaid breaks from worked minutes. |
| Break overrun | Keep break overrun separate from late arrival and early departure. |
| Cross-midnight shift | Store a schedule instance with start date and end date, not only a calendar date. |
| Shift handover | Permit different employees to have different start/end rules within the same operational shift. |
| On-call or standby | Do not classify as ordinary workday unless a schedule rule marks it as payable attendance. |
| Training or official event | Support a day type or exception that suppresses normal late rules. |
| Work from home | Resolve the assigned work arrangement before applying site/device expectations. |
| Site transfer | Use the location and schedule effective at the punch date/time. |
| Temporary shift change | Require an effective date range and approver; retain the original and revised roster. |
| Employee joining mid-day | Use an employment start timestamp and configured first-day treatment. |
| Employee leaving mid-day | Use an employment end timestamp and configured last-day treatment. |
| Part-time employee | Use contract hours and scheduled minutes, not full-time defaults. |
| Multiple contracts | Require one active attendance contract for a schedule instance or mark the record for review. |
| Protected absence or accommodation | Suppress or modify calculations according to the approved protected rule; restrict sensitive details. |
| Public holiday substitution | Apply the holiday calendar and substitution rule for the employee’s legal entity and location. |
| Daylight-saving transition | Use a timezone-aware schedule instance and test the shorter or longer day. |
| Device clock drift | Compare device timestamp with trusted server time and route materially divergent events to anomaly review. |
| Offline punch sync | Preserve event creation time, device time, sync time, and source; evaluate according to the configured trust rule. |
| Duplicate device events | Deduplicate by source event ID and a secondary fingerprint. |
| Out-of-order events | Reconcile the event stream before calculating the final day result. |
| Biometric/device outage | Create an operational incident or exception path rather than bulk marking employees late. |
| Concurrent correction | Use optimistic version checks so one reviewer cannot overwrite another reviewer’s change. |

### 33.1 Schedule instance requirement

The engine must evaluate against a resolved **schedule instance**, not merely `employee.shiftId`. A schedule instance should contain:

```text
scheduleInstanceId
organisationId
employeeId
shiftId
legalEntityId
locationId
scheduleDate
startDateTime
endDateTime
timezone
scheduledMinutes
breakPlan
source: roster | shift_default | temporary_change | exception
version
resolvedAt
```

This prevents incorrect classifications when employees rotate between shifts or work across midnight.

---

## 34. Attendance event integrity

### 34.1 Source precedence

The organisation must configure which source is authoritative when multiple attendance sources exist. The recommended precedence is:

1. Approved correction record.
2. Trusted device or biometric event.
3. Employee portal event.
4. Imported or manually entered record.
5. Derived or inferred event, which must never automatically create a financial penalty.

The system must retain all source events but calculate from the accepted event set. A reviewer must be able to see why one punch was accepted and another was rejected or superseded.

### 34.2 Event lifecycle

```text
received
  -> validated
    -> deduplicated
      -> reconciled
        -> accepted | rejected | pending_review
          -> calculated
            -> approved | overridden | exported
```

Financial or attendance consequences may only be created from an accepted and calculated record. A received, rejected, or pending-review event must not create an automatic deduction.

### 34.3 Anomaly detection

The system must flag, rather than silently resolve, high-risk patterns:

- Same employee has overlapping punches.
- Same device submits punches for an unusually large number of employees in a short interval.
- Device clock differs from trusted time beyond the configured tolerance.
- Punch occurs outside a permitted location or work arrangement where location rules are enabled.
- One employee has multiple active schedules.
- Out-time precedes in-time without an overnight schedule.
- A correction is submitted after payroll lock.
- A manager attempts unusually large bulk overrides.
- A policy would change the classification of an unusually large population.

Anomaly flags must be visible in a dedicated review queue and included in audit reports.

---

## 35. Payroll operations and cut-off control

### 35.1 Payroll-period state machine

Each payroll period must have an explicit state:

```text
open
  -> attendance_review
    -> manager_review
      -> HR_review
        -> payroll_preview
          -> payroll_locked
            -> exported
              -> closed
```

Reopening a locked period requires a privileged action, a reason, a second approval, and a visible audit event.

### 35.2 Cut-off rules

- Before payroll lock, permitted corrections may recalculate attendance and pending penalties.
- After payroll lock, new corrections create an adjustment or reversal workflow; they must not mutate the exported result.
- After export, the penalty ledger record becomes immutable except through a linked reversal or adjustment record.
- The employee must be notified when a post-lock correction changes a payroll-impacting result.
- Payroll exports must include a deterministic export batch ID and the policy/calculation version used.
- Re-running an export must be idempotent and must not duplicate deductions.

### 35.3 Payroll reconciliation

Before export, the system must display:

| Reconciliation measure | Required result |
|---|---|
| Employees in payroll scope | Matches payroll roster snapshot |
| Attendance records evaluated | Expected coverage or documented exceptions |
| Pending review records | Visible count and owner |
| Approved penalty total | Matches penalty ledger query |
| Exported penalty total | Zero before first export; equal to export payload after export |
| Reversed or adjusted amounts | Linked to original records |
| Unresolved anomalies | Visible and acknowledged |
| Policy versions in period | Listed by employee group |

The payroll owner must be able to download a reconciliation report and confirm sign-off.

---

## 36. Exceptions, disputes, and employee relations

### 36.1 Employee notice and appeal

Every employee-visible late or penalty outcome must include:

- Attendance date and schedule.
- In-time and out-time used.
- Grace applied.
- Chargeable late minutes.
- Attendance classification.
- Penalty status and amount, if visible.
- Policy version.
- Correction or appeal action.
- Appeal deadline and expected response time.

Employees must be able to submit a correction or appeal with a reason and supporting attachment where enabled. A submitted appeal must freeze automatic financial finalisation for that event until the configured review deadline or decision.

### 36.2 Service-level targets

Recommended operational targets:

| Workflow | Target |
|---|---:|
| Employee correction acknowledgement | Immediate in-product acknowledgement |
| Manager correction decision | Within 2 business days |
| Penalty appeal decision | Within 5 business days or organisation-defined SLA |
| Device outage exception review | Same business day during payroll close |
| Payroll reconciliation | Completed before payroll lock |
| Policy publication impact review | At least 2 business days before effective date |

The product should show overdue queues and escalate them to the next approver.

### 36.3 Sensitive information

Protected absence reasons, medical details, and accommodation documents must be separated from ordinary attendance notes. Managers should see only the decision-relevant outcome unless the organisation explicitly grants access to sensitive details. Audit logs must record that an exception was applied without unnecessarily copying sensitive content.

---

## 37. Scale, performance, and reliability requirements

### 37.1 Volume assumptions

The system should be designed for at least:

- 1,000–10,000 employees per tenant.
- Multiple attendance events per employee per day.
- 30,000+ employee-days per month for a 1,000-employee organisation.
- Multiple concurrent managers reviewing attendance.
- Month-end recalculation and payroll export peaks.
- Several policies and schedule groups active simultaneously.

The implementation must use paginated reads, bounded batch sizes, indexed queries, and asynchronous recalculation for period-level operations. A page component must never load an entire organisation’s attendance history into memory merely to calculate totals.

### 37.2 Reliability objectives

The product should target:

| Objective | Target |
|---|---:|
| Daily attendance calculation completion | 99.9% of valid events calculated within 15 minutes of reconciliation |
| Policy preview response | 95% within 2 seconds for one scenario |
| Daily view initial load | 95% within 3 seconds for a normal filtered page |
| Batch recalculation | Progress visible, resumable, and safe to retry |
| Duplicate penalty rate | Zero duplicate ledger entries for the same idempotency key |
| Payroll export repeatability | Same input snapshot produces the same export payload |

These are product targets for planning and should be adjusted after production measurement.

### 37.3 Backpressure and retry

Batch jobs must support:

- Queue-based work partitioning by organisation, date range, and employee group.
- Exponential backoff for transient Firebase or network failures.
- Dead-letter handling for records that repeatedly fail.
- Resume from the last successful partition.
- A visible job status with processed, skipped, failed, and pending counts.
- A safe cancellation path that does not leave records falsely marked as final.

### 37.4 Observability

The feature must emit structured operational metrics:

- Calculation latency and throughput.
- Failed calculations by error category.
- Pending-review rate.
- Late incidents and penalty totals by policy version.
- Recalculation volume.
- Duplicate-event suppression count.
- Device anomaly count.
- Approval queue age.
- Payroll reconciliation variance.
- Cross-tenant authorization failures.

Logs must use tenant-safe identifiers and must never include unnecessary employee sensitive information.

---

## 38. Enterprise reporting and management dashboards

A 1,000+ employee company needs management insight beyond a daily table. The product should provide:

### Workforce operations dashboard

- Attendance completion rate by location, department, and shift.
- Late rate and grace usage trend.
- Missing punch rate.
- Pending review ageing.
- Exception volume and approval turnaround.
- Device outage and anomaly events.

### HR risk dashboard

- Employees with repeated late incidents.
- Policy groups with unusually high penalties.
- Disputes and reversals.
- Status changes after payroll lock.
- Employees affected by a new policy version.
- Exceptions clustered by manager or location.

### Payroll control dashboard

- Pending penalty value.
- Approved penalty value.
- Reversed and adjusted value.
- Reconciliation variance.
- Unresolved records before lock.
- Export batch history.

All dashboards must respect tenant scope and role-based visibility. Aggregates must not reveal individual sensitive information to users without employee-level access.

---

## 39. Resolved COO decisions

The following decisions replace the earlier open-ended choices with an enterprise-safe default. An organisation may override them only through a documented policy setting.

| Decision | Default resolution |
|---|---|
| Full Day threshold | Percentage of resolved scheduled minutes, configurable by legal entity or contract group; fixed-minute mode remains available for simple groups |
| Half Day threshold | Separate threshold below Full Day; below threshold becomes Pending Review before Absent when punches are incomplete |
| Grace | Per schedule instance, applied to the first accepted in-punch; monthly grace is an optional future mode requiring a ledger |
| Late penalty default | Warning only; no financial deduction by default |
| Financial deduction scope | Legal entity/payroll group, never unscoped tenant-wide by accident |
| Financial deduction activation | Explicit opt-in with maker-checker approval, simulation, payroll-owner sign-off, and effective date |
| First late incident | Warning by default |
| Missing punches | Pending Review, never automatic late penalty |
| Approved leave/holiday/weekly off | No late penalty unless an explicit workday exception applies |
| Policy changes | Versioned, effective-dated, immutable for historical records |
| Post-lock corrections | Adjustment or reversal workflow; never silent mutation |
| Appeals | Employee-visible request with configurable SLA and payroll freeze for disputed financial events |
| Overtime | Separate domain and calculation contract; not implicitly mixed with lateness |
| Manual fines | Separate source and ledger linkage; duplicate prevention required |
| Anomalies | Queue for review, not silent auto-correction |
| Bulk actions | Preview, permission check, reason, bounded batch, and audit event |
| Default activation mode | Shadow mode, then warning-only, then optional payroll impact |

---

## 40. Additional acceptance criteria for a 1,000+ employee company

### Governance and policy control

- **AC-ENT-01:** Publishing a payroll-impacting policy requires the configured maker-checker approvals.
- **AC-ENT-02:** The publish screen shows affected legal entities, locations, shifts, employee count, effective date, and projected impact.
- **AC-ENT-03:** A policy cannot become active during a payroll lock window without a privileged override and reason.
- **AC-ENT-04:** A policy review date and named owner are mandatory.

### Tenant and RBAC

- **AC-ENT-05:** A user from Organisation A cannot read, preview, calculate, approve, or export records from Organisation B even when IDs overlap.
- **AC-ENT-06:** A manager can act only within their assigned team or scope.
- **AC-ENT-07:** An employee cannot approve their own correction, exception, waiver, or penalty.
- **AC-ENT-08:** A UI-hidden action is also rejected by the application command and Firestore rules.

### Workforce complexity

- **AC-ENT-09:** Rotating, split, cross-midnight, part-time, and temporary schedules calculate against the correct schedule instance.
- **AC-ENT-10:** Approved protected absence and accommodation rules suppress or alter penalties without exposing sensitive details to unauthorised users.
- **AC-ENT-11:** Device clock drift, duplicates, offline sync, and out-of-order events enter the defined reconciliation/anomaly flow.

### Payroll control

- **AC-ENT-12:** An exported penalty cannot be silently overwritten by a later correction.
- **AC-ENT-13:** Re-running an export produces no duplicate deductions.
- **AC-ENT-14:** Payroll lock displays unresolved review items, pending penalties, anomalies, and reconciliation totals.
- **AC-ENT-15:** Every financial result can be traced from export line to penalty ledger, attendance calculation, policy version, schedule instance, and source events.

### Scale and operations

- **AC-ENT-16:** Batch recalculation is resumable, paginated, observable, and safe to retry.
- **AC-ENT-17:** A failed calculation becomes Pending Review or Failed Reconciliation and never silently becomes a penalty.
- **AC-ENT-18:** Daily and monthly views do not require loading an entire tenant’s history into a browser.
- **AC-ENT-19:** Approval queues show ageing and escalation state.
- **AC-ENT-20:** Operational metrics identify calculation failures, anomalies, queue backlog, and payroll variance.

### Employee trust and UX

- **AC-ENT-21:** Employees can see the inputs and explanation for a late or penalty decision.
- **AC-ENT-22:** Employees can submit a correction or appeal, and disputed financial events follow the configured freeze rule.
- **AC-ENT-23:** Bulk approval shows a review summary and does not combine incompatible or anomalous records silently.
- **AC-ENT-24:** The system uses neutral, understandable language and never labels a pending result as a final penalty.

---

## 41. COO sign-off checklist

Before authorising production implementation, the COO, HR owner, payroll owner, and technical owner should confirm:

- The company has approved the operating definition of Full Day, Half Day, Absent, and Pending Review.
- Legal entities and contract groups that require different treatment are identified.
- Financial deductions are disabled until the applicable compliance and payroll review is complete.
- Policy ownership, approval, review date, and escalation paths are assigned.
- The schedule and attendance data sources are documented, including device trust and offline behavior.
- Employee correction and appeal SLAs are accepted.
- Payroll lock, export, reversal, and reconciliation procedures are documented.
- Tenant isolation and RBAC tests are included in the release gate.
- Shadow-mode results have been reviewed against a representative historical sample.
- HR and payroll users have completed scenario-based training.
- Employee communications are ready before penalty visibility is enabled.
- Operational dashboards and on-call ownership are ready before scale rollout.

The PRD should be considered **enterprise-ready** only when this checklist is signed by the business owner, payroll owner, security/technical owner, and operations owner.


---

## 42. MEP operations addendum

### 42.1 Operating context

This addendum applies an MEP operations lens to the attendance policy. MEP organisations do not operate like a single office. Employees may work at construction sites, fabrication yards, warehouses, client premises, commissioning locations, design offices, procurement offices, and emergency callout locations. Attendance must therefore recognise the operational reality of site work without creating loopholes for unverified absence.

The attendance engine must distinguish between **time not worked**, **time worked at an approved alternate location**, **time spent travelling between assigned locations**, and **time temporarily away under an approved permission**. These are operationally different events and must not be collapsed into one generic “late” or “absent” status.

### 42.2 MEP workforce groups

The policy must support separate schedules and rules for at least the following groups:

| Workforce group | Typical operating pattern | Primary attendance evidence |
|---|---|---|
| Site engineers and supervisors | Fixed site start, safety briefing, inspections, coordination meetings | Site roster, accepted punch, supervisor confirmation, project/site assignment |
| Technicians and trades | Shift or task-based site work, sometimes staggered | Shift schedule, accepted punch, foreman confirmation, task/crew assignment |
| QA/QC and safety staff | Early site presence, inspections, toolbox talks | Site schedule, punch, inspection or toolbox assignment |
| Project managers | Client meetings, site and office movement | Schedule instance, approved work location, meeting/site assignment |
| Procurement and logistics | Warehouse, supplier, site, and office travel | Approved route/task, location assignment, punch or dispatch record |
| Design and estimation office | Office hours, occasional site visits | Office schedule, approved site visit, portal punch |
| Commissioning and testing teams | Extended or night work, handover windows | Commissioning schedule, project assignment, shift instance |
| Emergency maintenance / callout | Unplanned work outside normal schedule | Callout ticket, supervisor approval, accepted work event |
| Subcontractor-facing coordinators | Variable client/site access windows | Site access roster and supervisor confirmation |

A policy may vary by group, but every variation must be explicit, effective-dated, and visible to the employee and approver.

---

## 43. MEP attendance day model

### 43.1 Use schedule instances, not only calendar days

An MEP attendance day must be evaluated against a **schedule instance**. A schedule instance represents one operational assignment, such as “Tower B site, night commissioning shift, 18:00–03:00, 12 June.” It may cross midnight and may include multiple work segments.

```text
MEP schedule instance
  projectId
  siteId
  workLocationType: site | office | warehouse | client | travel | remote
  employeeId or crewId
  supervisorId
  startDateTime
  endDateTime
  timezone
  scheduledMinutes
  paidBreakMinutes
  unpaidBreakMinutes
  safetyBriefingRequired
  toolboxTalkRequired
  travelSegmentAllowed
  source: roster | project_assignment | callout | temporary_change
```

### 43.2 Operational attendance statuses

The standard status set should be extended for MEP operations:

| Status | Meaning |
|---|---|
| Full Day — On Time | Required attendance fulfilled and arrival within the permitted window |
| Full Day — Within Grace | Full-day requirement fulfilled; arrival used part or all of the grace window |
| Full Day — Late | Full-day requirement fulfilled but chargeable late minutes remain |
| Full Day — Approved Permission | Full-day requirement fulfilled after an approved temporary absence or early departure |
| Full Day — Alternate Site | Employee worked the required time at an approved alternate site or assignment |
| Full Day — Emergency Callout | Employee fulfilled an approved emergency assignment outside the normal schedule |
| Half Day | Worked minutes meet the half-day threshold but not the full-day threshold |
| Half Day — Approved Permission | Reduced presence is explained by an approved permission or partial-day assignment |
| Pending Review | Punches, schedule, exception, or approval are incomplete or conflicting |
| Absent | Required attendance was not fulfilled and no approved explanation exists |
| Site Access Blocked | Employee could not access the site due to an approved site or safety restriction; requires review |
| Holiday / Weekly Off / Leave | Non-working day or approved absence according to the effective calendar |

The system should retain a primary classification and secondary operational reason rather than creating dozens of mutually exclusive statuses.

```text
primaryClassification: full_day | half_day | absent | pending_review | non_working_day
operationalReason: on_time | within_grace | late | approved_permission | alternate_site |
                   emergency_callout | site_access_blocked | leave | holiday | weekly_off
```

### 43.3 Full-day rule for MEP site operations

The recommended default for a normal scheduled MEP shift is:

- Full Day requires the configured percentage of **net scheduled minutes** or the configured fixed minutes, whichever policy mode applies.
- Net scheduled minutes must distinguish paid breaks from unpaid breaks.
- A required safety briefing or toolbox talk can be part of scheduled minutes but must not be used to create an unexplained penalty if the site itself starts the briefing before the published shift start.
- Approved travel between assigned MEP locations counts only when it is part of the scheduled assignment or an approved work segment.
- Work performed at an approved alternate site counts toward the same schedule instance if the assignment is recorded before or during the shift.
- A late arrival does not automatically make the day Half Day if the employee still satisfies the Full Day worked-minute threshold.
- An approved permission reduces the required presence only according to the permission type; it must not automatically erase all attendance requirements.

### 43.4 MEP-specific full-day examples

Assume a site shift from 08:00–17:00 with 480 net scheduled minutes, a Full Day threshold of 75%, and a 15-minute arrival grace period.

| Real scenario | Inputs | Result |
|---|---|---|
| Engineer arrives 08:10 and leaves 17:00 | 10 raw late minutes, 470 worked minutes | Full Day — Within Grace |
| Technician arrives 08:30 and leaves 17:00 | 30 raw late minutes, 450 worked minutes | Full Day — Late; chargeable late depends on grace |
| Technician arrives 09:30 and leaves 17:00 | 90 raw late minutes, 420 worked minutes | Full Day — Late if threshold is met; not automatically Half Day |
| Electrician leaves for an approved 90-minute personal permission and completes the rest of shift | Approved permission segment, required net presence met | Full Day — Approved Permission |
| Supervisor is sent from Site A to Site B during the shift | Approved alternate-site assignment, valid punches/confirmation | Full Day — Alternate Site |
| Site is closed for an authority inspection and crew is instructed not to enter | Approved site-closure event | Site Access Blocked or paid operational exception; no late penalty |
| Worker misses the morning but completes only 3 hours after a late call-in | 180 worked minutes, no approved exception | Half Day or Pending Review according to threshold and evidence |
| Night commissioning runs 18:00–03:00 | Cross-midnight schedule instance | Full Day based on the night schedule, not calendar-date confusion |
| Emergency breakdown callout at 22:00 after a normal shift | Approved callout assignment | Separate Emergency Callout segment; do not double-count or penalise normal attendance without policy rule |
| Employee reaches site but security gate is closed due to site safety suspension | Site incident recorded | Pending Review or Site Access Blocked; no automatic late penalty |

---

## 44. MEP grace-period rules

### 44.1 Separate reporting grace from penalty grace

MEP operations often require people to arrive before a toolbox talk, permit briefing, or safety check. A single grace number is not sufficient. The policy should support:

| Grace type | Purpose |
|---|---|
| Arrival reporting grace | Permits arrival after scheduled start without a late status |
| Safety briefing window | Defines the time by which the employee must be present for a mandatory safety activity |
| Payroll penalty grace | Minutes absorbed before a penalty can be created |
| Site access buffer | Allows documented security or transport processing time at a controlled site |
| Emergency mobilisation tolerance | Applies to approved callouts where the employee is mobilising outside the normal shift |

These windows must be configured separately. Reporting grace must not silently override a mandatory safety requirement.

### 44.2 Recommended default

For a standard MEP site shift:

- Arrival reporting grace: 15 minutes.
- Payroll penalty grace: 15 minutes.
- Safety briefing window: configured by site, normally 0–15 minutes before or after the published start.
- If the employee misses a mandatory safety briefing, the system creates a safety-review flag even when no late penalty applies.
- A supervisor may confirm that a briefing was cancelled, moved, or completed at another time.

### 44.3 Site-specific grace

A site-specific grace rule is permitted only when the site has a documented operational reason, such as controlled gate entry, transport convoy timing, or a client-mandated access process. The policy must display:

- Site name.
- Reason for the grace override.
- Approver.
- Effective date and expiry date.
- Employees or crews affected.
- Whether the override changes only late status or also penalty eligibility.

A site override must not be created informally by editing employee attendance records.

---

## 45. Late penalties for MEP operations

### 45.1 Recommended penalty philosophy

In MEP operations, lateness has different consequences depending on whether it affects safety, crew productivity, client commitments, or only administrative reporting. The system should therefore classify the operational impact before applying a penalty.

| Late impact | Example | Default action |
|---|---|---|
| Administrative lateness | Employee arrives 8 minutes late but does not miss a required activity | Record; within grace; no penalty |
| Productivity impact | Employee arrives after crew mobilisation and delays assigned work | Late incident; warning or manager review |
| Safety impact | Employee misses toolbox talk or permit briefing | Safety review; no automatic monetary deduction |
| Client impact | Employee misses a client inspection or handover | Escalation and manager review; penalty only under approved policy |
| Repeated pattern | Multiple chargeable late events in the same period | Progressive warning and HR review before financial action |
| Unavoidable operational event | Approved transport, site access, weather, or project instruction | Exception or Site Access Blocked; no penalty |

The penalty engine must not infer operational impact solely from the number of late minutes. A 10-minute delay before a critical lift may be more operationally important than a 30-minute delay during a flexible office day, but the consequence must be documented and approved rather than guessed.

### 45.2 MEP penalty triggers

A late event may become chargeable only when all of the following are true:

1. The employee had an active schedule instance.
2. The schedule required a fixed reporting time.
3. The accepted in-punch exceeded the applicable arrival reporting grace.
4. No approved permission, alternate-site assignment, emergency callout, travel segment, site closure, or device incident suppressed the penalty.
5. The employee did not miss a safety event that has its own separate review rule, unless the policy explicitly links the two.
6. The payroll period is not locked or the event is processed through a formal adjustment workflow.
7. The penalty is within the applicable legal-entity, contract, and payroll-group policy.

### 45.3 Repeated lateness

Recommended MEP progression:

| Event count in rolling 30 days | Default consequence |
|---:|---|
| 1 | Informational record or coaching reminder |
| 2 | Supervisor acknowledgement |
| 3 | Formal warning or HR review |
| 4 | Attendance policy review and possible approved penalty |
| 5+ | Escalated HR case; financial consequence only if policy and approval allow |

The count must exclude events that were within grace, approved, waived, caused by a site incident, or later corrected. The employee and manager must be able to see which incidents contribute to the count.

### 45.4 Do not penalise safety failures as simple lateness

If an employee arrives after a mandatory safety briefing, the system should create a **Safety Compliance Review** event rather than immediately creating a monetary late penalty. The reviewer can classify the event as:

- Briefing missed — employee fault.
- Briefing cancelled or rescheduled.
- Employee assigned to another work activity.
- Site access or transport issue.
- Emergency response.
- Training or certification activity.

This avoids using payroll deductions as a substitute for safety management.

---

## 46. Short permissions and early departure approvals

### 46.1 Definition

A **permission** is an approved, temporary absence from an active schedule instance or an approved early departure. It is not the same as leave, and it must not be hidden inside an attendance correction.

Permissions should support:

- Late arrival permission.
- Short mid-shift absence.
- Early departure permission.
- Site-to-office or site-to-site movement.
- Personal emergency permission.
- Official appointment or administrative task.
- Transport or access permission.
- Medical permission, with sensitive details restricted.

### 46.2 Permission units

The product should support both minutes and fixed time segments, but one permission must resolve to one precise interval for calculation.

```text
permissionStartDateTime
permissionEndDateTime
permissionMinutes
permissionType
reasonCode
employeeId
scheduleInstanceId
impact: suppress_late | reduce_required_presence | approve_early_departure |
        alternate_work_segment | informational_only
status: draft | requested | approved | rejected | cancelled | expired
requestedBy
approvedBy
approvedAt
```

### 46.3 Permission limits

Recommended defaults for an MEP organisation:

| Rule | Recommended default |
|---|---:|
| Maximum single permission | 120 minutes |
| Maximum permissions per day | 1, unless HR override |
| Maximum permission minutes per month | 240 minutes, configurable by employee group |
| Minimum permission duration | 15 minutes |
| Same-day request cut-off | Before shift start where practical; emergency requests allowed during shift |
| Early departure notice | At least 60 minutes before departure where practical |
| Approval requirement | Supervisor or project manager; HR approval for over-limit or repeated requests |
| Permission during critical activity | Requires project manager or designated operational approver |
| Permission after payroll lock | Correction/exception workflow; no silent change |

These are recommended controls, not universal employment rules. They must be configurable by legal entity and employee group.

### 46.4 Permission effect on Full Day

The default rule should be:

```text
requiredPresenceMinutes = scheduledNetMinutes - approvedPresenceReductionMinutes
workedMinutes >= fullDayThreshold(requiredPresenceMinutes)
```

However, the reduction must be bounded. An approved permission should not automatically make any short attendance a Full Day. The policy must define whether the permission:

- Reduces the required presence minutes.
- Suppresses a late or early-departure penalty only.
- Converts the event to Full Day — Approved Permission.
- Requires a Half Day classification when the absence exceeds the permitted limit.
- Requires HR review when the permission is outside normal limits.

### 46.5 Early departure rules

Early departure must be handled separately from late arrival:

```text
earlyDepartureMinutes = max(0, actualScheduledEnd - actualOut)
approvedEarlyDepartureMinutes = overlap(actualOut, approvedPermissionInterval)
chargeableEarlyDepartureMinutes = max(
  0,
  earlyDepartureMinutes - approvedEarlyDepartureMinutes - earlyDepartureGraceMinutes
)
```

Recommended behavior:

- Approved early departure suppresses chargeable early-departure minutes for the approved interval.
- The employee must still meet the adjusted Full Day or Half Day threshold unless the policy explicitly grants a paid permission.
- An employee who leaves early without approval becomes Pending Review first, not automatically penalised.
- The system should distinguish “left early with approval,” “left early awaiting approval,” and “left early without approval.”
- If the employee is released by the project manager because site work is complete, use an operational release reason rather than a personal permission.

### 46.6 Approval routing

Approval must be based on schedule and operational scope:

| Scenario | First approver | Escalation |
|---|---|---|
| Site technician permission | Foreman or site supervisor | Project manager |
| Site engineer permission | Project manager | Operations manager / HR |
| Project manager permission | Operations manager | Business-unit head |
| Office employee permission | Line manager | HR for repeated or over-limit requests |
| Permission during critical lift, testing, or handover | Project manager / designated activity owner | Operations manager |
| Cross-site movement | Sending and receiving site supervisors | Project manager |
| Emergency callout or medical event | Supervisor on duty | HR review after event |

The system must not route an employee’s request to the same employee or to an inactive approver. Delegation must be time-bound and audited.

### 46.7 Auto-expiry and no-response handling

A permission request must not remain indefinitely pending. The system must:

- Show the approver and due time.
- Escalate after the configured SLA.
- Permit a supervisor on duty to act during an emergency.
- Mark expired requests as Expired or Pending Review, not Approved.
- Prevent automatic approval solely because an approver did not respond.
- Permit post-event approval only for configured emergency reasons and within a defined review window.

---

## 47. MEP scenario decision table

The following scenarios should be implemented as acceptance-test fixtures.

| Scenario | Attendance result | Late penalty | Permission / approval |
|---|---|---|---|
| Site engineer checks in 12 minutes late within 15-minute grace | Full Day — Within Grace | None | None |
| Technician checks in 25 minutes late, works full required minutes | Full Day — Late | Chargeable 10 minutes or configured event | No permission |
| Technician checks in 25 minutes late with approved 30-minute late-arrival permission | Full Day — Approved Permission | None | Supervisor approval linked to schedule instance |
| Employee leaves 60 minutes early with approved permission | Full Day or Half Day based on adjusted threshold | None for approved interval | Early departure permission |
| Employee leaves 60 minutes early without approval | Pending Review initially | No automatic penalty until review | Approval or correction required |
| Employee requests 3-hour permission during a critical testing activity | Pending Review / Not Approved | No penalty until decision | Project manager approval required; may be rejected for operational reason |
| Employee works at another project site with approved assignment | Full Day — Alternate Site | None if assignment covers schedule | Site/project assignment |
| Employee travels between sites during scheduled work | Full Day if travel segment is approved and time counts | None for approved travel | Travel segment approval |
| Site gate closes due to safety incident | Site Access Blocked / Pending Review | None | Site incident record and supervisor confirmation |
| Employee misses toolbox talk but arrives within attendance grace | Full Day — Safety Review | No automatic payroll penalty | Safety review event |
| Emergency callout at night after normal shift | Emergency Callout | Separate callout/overtime policy | Callout ticket and supervisor approval |
| Night shift starts 22:00, employee punches out 06:00 next day | Full Day or configured result | Based on 22:00 start | Overnight schedule instance |
| Employee’s punch is missing because biometric device failed | Pending Review | None | Device incident and supervisor confirmation |
| Employee submits permission after payroll lock | Existing payroll result remains unchanged | Adjustment/reversal workflow | Post-lock exception approval |
| Manager approves own permission | Rejected by separation-of-duties rule | None until valid approval | Escalate to next approver |
| Employee has a fourth chargeable late event in 30 days | Full Day — Late plus HR review | Progressive consequence per approved policy | HR case and employee notice |

---

## 48. MEP-specific data additions

Add the following fields to the schedule, attendance, permission, exception, and penalty models:

```text
projectId
projectCode
siteId
siteName
workLocationType
crewId
supervisorId
activityId
criticalActivityFlag
safetyBriefingRequired
safetyBriefingAttended
siteAccessEventId
scheduleInstanceId
travelSegmentId
calloutId
permissionId
operationalReleaseReason
```

Sensitive medical or protected-absence information must not be stored in ordinary attendance rows. Use a restricted exception record with a decision code visible to managers and protected detail visible only to authorised HR users.

### 48.1 Permission record

```text
organisations/{organisationId}/attendancePermissions/{permissionId}
  employeeId
  scheduleInstanceId
  projectId
  siteId
  permissionType
  startDateTime
  endDateTime
  minutes
  impact
  reasonCode
  sensitiveDetailRef
  status
  requestedBy
  requestedAt
  approvedBy
  approvedAt
  escalationState
  expiresAt
  createdAt
  updatedAt
```

### 48.2 Calculation explanation additions

The calculation snapshot should include:

```text
scheduleInstanceId
netScheduledMinutes
approvedPermissionMinutes
approvedAlternateWorkMinutes
approvedTravelMinutes
operationalReleaseMinutes
safetyBriefingStatus
siteAccessStatus
rawLateMinutes
arrivalGraceMinutes
chargeableLateMinutes
rawEarlyDepartureMinutes
approvedEarlyDepartureMinutes
chargeableEarlyDepartureMinutes
operationalImpactCode
```

---

## 49. MEP UX recommendations

### Site supervisor view

The site supervisor should see a focused operational dashboard rather than a payroll-heavy screen:

- Today’s crew attendance.
- Late arrivals requiring action.
- Missing punches.
- Pending permissions.
- Employees assigned to another site.
- Safety briefing attendance.
- Site access incidents.
- Critical activities beginning soon.

The supervisor should be able to approve a permission in seconds, but bulk actions must show an employee list and reason before submission.

### Employee permission request

The employee flow should ask:

1. What type of permission is needed?
2. Which date and time interval?
3. Is this personal, site movement, official work, emergency, or medical/protected?
4. Which project/site is affected?
5. Is there a replacement or handover person?
6. Optional note or attachment.

The system should immediately show the expected attendance impact:

> “If approved, this 60-minute permission will reduce your required presence for today. Your projected result remains Full Day.”

If the projected result becomes Half Day, the user must see that before submitting.

### Manager approval card

An approval card should show:

- Employee and crew.
- Project and site.
- Schedule start/end.
- Requested permission interval.
- Operational impact.
- Current attendance punches.
- Projected Full Day/Half Day result.
- Existing permissions for the day/month.
- Whether the request exceeds limits.
- Approve, reject, request details, or delegate action.

### MEP dashboards and alerts

Prioritise operational exceptions rather than only penalty counts:

- “5 technicians missing toolbox talk.”
- “3 permissions pending for today’s critical testing activity.”
- “2 employees checked in at Site B but rostered at Site A.”
- “Site access incident affecting 18 employees.”
- “Payroll lock in 24 hours; 12 attendance records pending review.”

---

## 50. Revised MEP acceptance criteria

- **AC-MEP-01:** A schedule instance contains project/site, timezone, supervisor, start/end, scheduled minutes, and source.
- **AC-MEP-02:** The same employee can have different site or shift assignments on different dates without using the current shift for historical calculation.
- **AC-MEP-03:** Approved alternate-site work counts toward attendance without creating a late penalty at the original site.
- **AC-MEP-04:** Approved travel between assigned MEP sites is represented as a work segment and cannot be double-counted.
- **AC-MEP-05:** A permission is a separate record with an exact time interval, approval status, approver, reason code, and schedule instance link.
- **AC-MEP-06:** An approved permission can suppress a late or early-departure penalty without automatically guaranteeing Full Day unless the policy grants the required presence reduction.
- **AC-MEP-07:** An unapproved early departure becomes Pending Review before any penalty is created.
- **AC-MEP-08:** Permission limits, approver routing, escalation, and post-event approval are configurable by employee group or legal entity.
- **AC-MEP-09:** A supervisor cannot approve their own permission or a request outside their operational scope.
- **AC-MEP-10:** Missing punches caused by a documented device or site incident do not create an automatic penalty.
- **AC-MEP-11:** Missing a safety briefing creates a separate safety review event and does not automatically become a payroll deduction.
- **AC-MEP-12:** A cross-midnight commissioning shift calculates against its schedule instance and does not generate a false absence on the calendar date of clock-out.
- **AC-MEP-13:** Emergency callout work is recorded separately from normal attendance and does not create duplicate attendance or overtime calculations.
- **AC-MEP-14:** The employee can see the projected effect of a permission before submitting it.
- **AC-MEP-15:** Site supervisors can resolve operational attendance exceptions without viewing restricted medical or protected-absence details.
- **AC-MEP-16:** Payroll lock prevents silent changes to approved or exported penalty results.

---

## 51. MEP implementation priority

### Release 1 — Operationally safe foundation

Implement schedule instances, site/project assignment, core Full Day/Half Day calculation, 15-minute arrival grace, missing-punch Pending Review, basic permission requests, supervisor approval, and employee explanations. Keep financial deductions disabled.

### Release 2 — MEP exception management

Add alternate-site work, travel segments, site-access incidents, safety briefing flags, early-departure permissions, approval escalation, permission limits, and supervisor dashboards.

### Release 3 — Payroll-safe penalty controls

Add progressive late events, penalty approvals, payroll lock, reconciliation, reversal workflow, audit reports, and legal-entity or contract-group policies. Enable monetary deductions only after shadow-mode validation.

### Release 4 — Advanced operations

Add device anomaly detection, offline event reconciliation, emergency callout integration, project/crew analytics, critical-activity alerts, and predictive staffing insights.

The recommended MEP position is to implement **permissions and operational exceptions before financial late penalties**. In site operations, a correct approval and assignment model prevents more disputes than a sophisticated penalty formula.
