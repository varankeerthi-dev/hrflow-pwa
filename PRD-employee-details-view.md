# PRD: Employee Details View

## Problem
HR cannot quickly view a complete employee profile without navigating multiple tabs. Currently, checking an employee's leaves, attendance, fines, and advances requires switching between 4+ different sections.

## Proposed Solution
A three-panel split-screen view accessible from the Employees sidebar.

---

## Layout

```
┌─────────────────────────────────────────────────────────────┐
│  [Search...]          │                                      │
│  [Active ▼] [Inactive] │                                      │
│                         │                                      │
│  ┌─────────────────┐   │  ┌────────────────────────────────┐  │  ┌────────────────────┐
│  │ John Smith       │   │  │  Employee Details               │  │  │ Activity Log       │
│  │ Sr. Developer    │   │  │                                  │  │  │                     │
│  ├─────────────────┤   │  │  ┌────────────────────────────┐  │  │  │ 10:30 Task created │
│  │ Jane Doe         │   │  │  │ Name: John Smith          │  │  │  │ 09:15 Leave approved│
│  │ HR Manager       │   │  │  │ Emp ID: EMP-001          │  │  │  │ 08:00 Logged in     │
│  ├─────────────────┤   │  │  │ Dept: Engineering         │  │  │  │ ...                  │
│  │ Bob Wilson       │   │  │  │ DOJ: 2024-01-15          │  │  │  │                     │
│  │ Designer         │   │  │  │ Status: Active           │  │  │  │                     │
│  ├─────────────────┤   │  │  │ Email: john@acme.com     │  │  │  │                     │
│  │ ...              │   │  │  │ Mobile: +91 98765 43210  │  │  │  │                     │
│  └─────────────────┘   │  │  └────────────────────────────┘  │  │  │                     │
│                         │  │                                  │  │  │                     │
│                         │  │  ▼ Leaves (click to expand)      │  │  │                     │
│                         │  │  ┌────────────────────────────┐  │  │  │                     │
│                         │  │  │ Taken: 12 | Approved: 10   │  │  │  │                     │
│                         │  │  │ Requested: 2 | LOP: 1     │  │  │  │                     │
│                         │  │  └────────────────────────────┘  │  │  │                     │
│                         │  │                                  │  │  │                     │
│                         │  │  ▼ Attendance (click to expand)   │  │  │                     │
│                         │  │  ┌────────────────────────────┐  │  │  │                     │
│                         │  │  │ [June 2026 ▼] [View]      │  │  │  │                     │
│                         │  │  │ Present: 20 | Absent: 2   │  │  │  │                     │
│                         │  │  │ Late: 1 | Half-day: 1    │  │  │  │                     │
│                         │  │  └────────────────────────────┘  │  │  │                     │
│                         │  │                                  │  │  │                     │
│                         │  │  ▼ Fines (click to expand)       │  │  │                     │
│                         │  │  ┌────────────────────────────┐  │  │  │                     │
│                         │  │  │ 24 May - Late arrival:₹100│  │  │  │                     │
│                         │  │  │ 15 May - No ID card:₹50  │  │  │  │                     │
│                         │  │  └────────────────────────────┘  │  │  │                     │
│                         │  │                                  │  │  │                     │
│                         │  │  ▼ Advances (click to expand)    │  │  │                     │
│                         │  │  ┌────────────────────────────┐  │  │  │                     │
│                         │  │  │ Salary Advance: ₹5,000     │  │  │  │                     │
│                         │  │  │ Travel Reimb: ₹1,200      │  │  │  │                     │
│                         │  │  └────────────────────────────┘  │  │  │                     │
│  [30% width]            │  │  [70% width]                     │  │  [30% width]          │
└─────────────────────────────────────────────────────────────┘
```

## Panels

### Left Panel — Employee List (30%)
- Search box at top (search by name, emp code, email)
- Two filter pills: **Active** / **Inactive** (toggle)
- Scrollable employee list below — each row shows name + designation
- Clicking a name selects it and populates the center panel
- Currently selected employee is highlighted

### Center Panel — Employee Profile (70%)
- **Top section**: Key employee info cards (name, photo, emp code, department, designation, DOJ, status, email, phone, blood group, DOB, address, bank details)
- **Collapsible sub-sections** (default collapsed, click to expand):
  - **Leave Summary**: Total taken, approved, pending, requested, LOP counts. Optional: link to full leave tab.
  - **Attendance Summary**: Month picker + "View" button. Shows present/absent/late/half-day counts for selected month.
  - **Fines**: List of fines with date, reason, amount.
  - **Advances**: List of advances with type, amount, status.
  - (Future: Tasks, Documents)

### Right Panel — Activity Log (30%)
- Real-time activity feed for the selected employee
- Sources: Firestore audit log or `activityLogs` collection
- Events to capture:
  - Login/logout
  - Task created/completed
  - Leave applied/approved/rejected
  - Attendance marked/corrected
  - Profile updated
  - Any other system action
- Display: timestamp + action description
- Scrollable, newest first

## States

| State | Behavior |
|---|---|
| **Loading** | Skeleton placeholders in center + right panels |
| **Empty** (no employees) | Empty state illustration in left panel |
| **No selection** | Center panel shows "Select an employee to view details" |
| **No activity log** | Right panel shows "No recent activity" |
| **Employee not found** | "Employee record may have been deleted" |
| **Error** (Firestore) | Inline error with retry button |

## Technical Notes
- Build in `src/components/tabs/EmployeesTab.jsx` (replacing current wrapper)
- Hooks needed: `useEmployees`, `useLeave`, `useAttendance`, `useFines`, `useAdvances`, `useActivityLog`
- Activity log data source: need to either create a new Firestore collection `activityLogs/{orgId}/{employeeId}` or query from existing audit logs
- Leave/attendance/fines/advances queries should be lazy — only fetch when section is expanded
- Mobile: panels should stack vertically (list → details → activity)

## Future Scope
- Edit employee inline (pencil icon in center panel header)
- Export employee report as PDF
- Quick actions: mark attendance, apply leave on behalf, assign task
- Comparison view: side-by-side with another employee
