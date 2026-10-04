# Share handoff: Phase 0/1

## Product boundary

This feature prepares a reviewed handoff from HRFlow to an email client, WhatsApp, a supported system share sheet, or a local file download. HRFlow does **not** send messages, attach files to email/WhatsApp drafts, record delivery, or infer acknowledgement. The UI says so before handoff and never shows a sent/delivered success state.

Each email/WhatsApp draft supports exactly one manually entered recipient. The app does not read address books or support CC/BCC or bulk handoff. If browser/system sharing is unavailable or fails, the message remains selectable for copying and files remain downloadable where supported. No automatic retry, background process, direct-send API, external service connector, or recipient/message persistence is added.

## Reusable handoff controls

- A single accessible Share dialog handles preview, editable subject/body, optional-field checkboxes, recipient validation, high-sensitivity confirmation, current permission/content re-check, and user-initiated handoff.
- Email and WhatsApp use encoded `mailto:` and `wa.me` links. Native sharing is feature-detected; file sharing requires `navigator.canShare({ files })`.
- No Share native plugin is declared in the project dependencies, and the Android plugin registry lists Camera/Updater rather than Share. This release does not add a native plugin: it uses the runtime `navigator.share` / `navigator.canShare` capabilities, hides the system option when unsupported, and keeps copy/download fallbacks available. The installed iOS/Android wrappers were not runtime-tested in this worktree.
- The handoff dialog and generated files remain in memory for that interaction. No content is added to logs, analytics, activity records, or backend collections.
- Stored file URLs are not copied into message payloads. Email/WhatsApp drafts contain text only; users must attach a separately downloaded file themselves. The system file chooser may share the prepared file where supported.

## Content placements and allowlists

| Placement | Eligibility and permission | Included content / exclusions |
| --- | --- | --- |
| Organization invitation | Administrator only | Organization name and `/login` link. Invite code starts unchecked, is separately opt-in, and is called out as an organization credential. |
| Employee contact card | `Employees.view` + explicit `Employees.share` (or administrator); active/rejoined selected employee in current organization | Name, role, department, and explicitly labeled `workEmail` only. No fallback to `email`/personal email; no phone, employee code, IDs, address, DOB, medical, bank, payroll, or revealed profile values. |
| HR communication | `HRLetters.view` + `HRLetters.share` (or administrator); current published announcement/policy, `all_active` audience, not expired or superseded | Published title/category/effective date/body only. Employee-targeted letters, training, drafts, approvals, targeted audiences, delivery lists, acknowledgements, and internal record links are excluded. External handoff is not a recorded delivery or acknowledgement. |
| Organization document | `DocumentManagement.view` + explicit `DocumentManagement.share` (or administrator); active, unexpired latest version of an organization (`Org`) **Policy-category** file stored beneath the current organization path | The app reads the current stored file using the authenticated Firebase Storage SDK, then offers a file chooser/download. Employee dossiers, Contract, ID Proof, Certification, Payroll, Other/unclassified, older/archived/expired versions, and external-URL-only records are excluded. The stored download URL is not used in the handoff payload. |
| Site & field visit report | `Attendance.view` + explicit `Attendance.share` (or administrator); current date and site filters, non-empty report | Reuses the PDF export builder; both site summary and detail rows honor the selected site and date filters. Existing 150-row detail cap remains. PDF includes employee names, site names, dates, times, and hours, but not internal employee IDs, remarks, selfies, or precise location traces. The dialog requires a recipient/content confirmation. |

## Permission and security boundary

Non-admin `full`, `export`, or `view` permission **does not** imply `share`. Share is a separate module action in the role matrix and is off for non-admin defaults. The application rechecks permission and content eligibility immediately before copy, download, or external handoff and rejects stale previews.

These are client-side workflow controls, not a server-side authorization boundary. This change does not widen Firestore or Firebase Storage rules and does not create a backend sender. Existing organization-wide storage rules and any confidential-record policy must be reviewed separately before enabling direct send or a more sensitive sharing surface. Document handoff deliberately limits itself to the current organization file path and existing read capability.

## Deferred

- Direct send, delivery/acknowledgement tracking, multi-recipient/bulk messages, scheduled or automated handoff, contact lookup, HRFlow public sharing links, recipient logging, and new server/API behavior.
- Sharing employee dossiers, archived/expired documents, legacy external-URL-only records, targeted communications, or other content without a verifiable current status/permission.
