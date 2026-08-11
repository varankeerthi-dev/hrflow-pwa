# Agent Guidelines & Design System Instructions (AGENTS.md)

This repository follows strict UI/UX, architectural, and data standards. All AI agents, contributors, and automated subagents **MUST** read and adhere to these guidelines before writing or editing code.

---

## 🎨 1. Design System Routing & Source of Truth

- **Primary Design Reference**: [`NEW_DESIGN_SYSTEM.md`](file:///c:/Users/admin/hrflow-pwa/NEW_DESIGN_SYSTEM.md)
- **UI Guidelines Summary**: [`DESIGN.md`](file:///c:/Users/admin/hrflow-pwa/DESIGN.md)

### Mandatory Styling Rules
1. **Typography**:
   - Headings, Card Titles & Primary Buttons: `Plus Jakarta Sans` (`font-heading`).
   - Body Text, Inputs & Subtitles: `Inter` (`font-body`).
   - Registration, Numbers & Code: `Monospace` (`font-mono`).
2. **Form Labels (`<label>`)**:
   - Always use: `block text-sm font-medium text-slate-800 mb-1.5 font-body` (14px size, 500 weight, 6px spacing).
3. **Form Inputs & Dropdowns**:
   - Always use 36px fixed height (`h-9`): `h-9 w-full rounded-md border border-slate-200 bg-white px-3 py-1 text-sm focus-visible:ring-1 focus-visible:ring-blue-600 placeholder:text-slate-400 text-slate-800`.
   - Registration and RC Number fields **MUST** sanitize input to UPPERCASE Alphanumeric ONLY (`A-Z0-9`, no spaces/symbols).
4. **Surface & Background Locking**:
   - Sidebar, top header, dialog modals, section cards, and inputs **MUST** be locked to pure plain white `#ffffff` (`bg-white`) to prevent unwanted grey bleed.
5. **Modal Dialogs**:
   - Backdrop: `fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 sm:p-6`.
   - Card Container: `bg-white text-slate-900 rounded-2xl border border-slate-200 shadow-2xl max-w-3xl w-full`.
   - Primary Submit Button: `h-9 px-6 bg-blue-600 hover:bg-blue-700 text-white rounded-md text-sm font-bold font-heading shadow-sm active:scale-[0.98]`.

---

## 🛠️ 2. Architectural & Database Rules

1. **Role-Based Access Control (RBAC)**:
   - Action buttons (Edit/Delete) must enforce RBAC checks: `isAdmin || createdBy === user.name || createdById === user.uid`.
2. **Audit Logging**:
   - Mutations (Create, Update, Delete) on company data must emit an immutable audit log to `organisations/{orgId}/audit_logs` capturing module name, action type, user name, user ID, details, and `serverTimestamp()`.
3. **SubTabs Navigation**:
   - Ensure `SubTabsNav.jsx` maintains `marginBottom: 0px` so page headings sit tightly below tabs without excess white space.
