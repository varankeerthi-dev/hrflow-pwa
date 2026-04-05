# HRFlow TODO List

## Future Implementations

### 1. "Paid To" Feature in Expense Form (In Progress)
**Priority:** High
**Status:** Started

**Requirements:**
- [ ] Add "Paid To" dropdown field in Expense form (below Category)
- [ ] Dropdown opens outward (overlay/popup style, not container)
- [ ] Options: All employees + "Add Other..."
- [ ] When "Add Other..." selected → Inline text input appears
- [ ] One-time names (EB, Carpenter, etc.) stored only with transaction
- [ ] One-time names appear when editing that specific transaction
- [ ] When category = "Salary Advance" AND paidTo = employee:
  - [ ] Auto-create linked Advance record for employee
  - [ ] Employee sees it in Advance tab with "Paid by: [Accountant]" label
- [ ] Duplicate protection: Check Amount + Date + Recipient + Category

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
- [ ] Add "Paid To" column in Expenses Report
- [ ] Show custom names for one-time recipients
- [ ] Date column: 55px width
- [ ] Amount column: 90px width, remove "Rs." prefix, max 11 digits
- [ ] Actions column: Reduce width & icon size
- [ ] Remarks column: Increase to 190px
- [ ] Font size: 10px throughout
- [ ] New filter: "Cash Advances by Accountant"

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
- [x] Redesign Advance/Expense report panels with Excel-style grid
- [x] Add Name column to both panels
- [x] Update column widths and font sizes
