# HRFlow TODO List

## Future Implementations

### 1. "Paid To" Feature in Expense Form ✅ COMPLETED
**Priority:** High
**Status:** Completed 2026-04-05

**Requirements:**
- [x] Add "Paid To" dropdown field in Expense form (below Category)
- [x] Dropdown opens outward (overlay/popup style, not container)
- [x] Options: All employees + "Add Other..."
- [x] When "Add Other..." selected → Inline text input appears
- [x] One-time names (EB, Carpenter, etc.) stored only with transaction
- [x] One-time names appear when editing that specific transaction
- [x] When category = "Salary Advance" AND paidTo = employee:
  - [x] Auto-create linked Advance record for employee
  - [x] Employee sees it in Advance tab with "Source: Cash" label
- [ ] Duplicate protection: Check Amount + Date + Recipient + Category *(Pending)*

**Data Structure:**
```javascript
expense: {
  paidTo: 'emp_123', // employee ID or 'other'
  paidToType: 'employee', // 'employee' | 'other'
  paidToName: 'John Doe', // display name
  paidToCustomName: '', // only for one-time others
  linkedAdvanceId: 'adv_456', // auto-created
  // ... other fields
}
```

**Reports Updates:**
- [x] Add "Paid To" column in Expenses Report
- [x] Show linked advance indicator (chain icon) in Expenses table
- [x] Add "Source" column in Advances Report with Cash/Linked/Company badges
- [x] Date column: 55px width
- [x] Amount column: 90px width, remove "Rs." prefix
- [x] Actions column: Reduced width to 50px & icon size to 10px
- [x] Remarks column: 190px
- [x] Font size: 10px throughout
- [ ] New filter: "Cash Advances by Accountant" *(Pending)*

---

### 2. Accountant Badge/Icon (Later)
**Priority:** Medium
**Status:** Pending

Add special badge/icon to distinguish expenses paid by accountant vs company.

---

### 3. TanStack Query Implementation (Later)
**Priority:** Medium
**Status:** Pending

Implement in Reports section:
- [ ] Caching (5 minutes)
- [ ] Real-time updates
- [ ] Optimistic updates

---

### 4. Reports Enhancement (Later)
**Priority:** Low
**Status:** Pending

New report view:
- Filter by "Paid By" (Accountant)
- Filter by "Paid To Type" (Employee / Other)
- Shows accountant name (who paid) and recipient details

---

## Completed Tasks

### 2026-04-05
- [x] Created custom outward-opening "Paid To" dropdown component
- [x] Added "Add Other..." option with inline text input for one-time names
- [x] Added "Paid To" column in Desktop and Mobile expense entry forms
- [x] Updated addMutation to auto-create linked Advance when category is "Salary Advance"
- [x] Updated Advances Report table with "Source" column (Cash/Linked/Company badges)
- [x] Updated Expenses Report table with "Paid To" and "Link" columns
- [x] Removed "Rs." prefix from Amount columns in both tables
- [x] Set font size to 10px throughout reports
- [x] Reduced Actions column icon sizes to 10px

### 2026-04-05 (Earlier)
- [x] Redesign Advance/Expense report panels with Excel-style grid
- [x] Add Name column to both panels
- [x] Update column widths and font sizes
