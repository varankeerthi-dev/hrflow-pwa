# Mobile screen map and review preview

![HRFlow native Android — six screen concepts, no live data](../design-preview/hrflow-native-screens.png)

This board shows proposed phone layouts for the HRFlow native shell. It is a static image generated from `design-preview/render_ui_preview.py`; it is not an Android screenshot and none of the feature screens below is live. The screenshot contains **no company or employee identity, no attendance/leave counts, and no fabricated activity rows**. All data-bearing fields are blank, dashed, or replaced by an explicit empty state. Review the full-size files in `design-preview/` when inspecting spacing or text hierarchy.

## Visual direction

The concepts use a warm-white canvas, restrained coral emphasis, rounded touch surfaces, and readable Inter typography to make HR workflows feel clear and approachable on a phone. The broad mood reference is the scanability and confident use of color found in Indian food-ordering apps; no Zomato branding, logo, icons, illustrations, or page layout is copied. Metric cards have **no left-edge stripe**. Color is not the sole signal for status, and the work-focused HR hierarchy remains primary.

## Navigation and page relationships

The phone shell has four bottom destinations: **Home**, **People**, **Time**, and **More**. Home opens the overview. People opens the directory; choosing a real directory row later will open employee detail. Time opens Attendance and provides a secondary route to Leave. More links to HR Communications and account actions. The detail screen uses a back affordance and retains People as the selected bottom destination.

| Concept | Hierarchy and controls shown | Path and current status |
| --- | --- | --- |
| Overview | Workspace context; metric-card placeholders; quick routes; recent-activity empty state | Home. The code shell reads only the signed-in user's own profile; it has no stats query. |
| Employees | Search field; Active/All filter; directory empty state | People → directory. Search and filters are not connected in this foundation. |
| Attendance | Date control; Present/Absent/Half-Day summary placeholders; record empty state | Time → Attendance. No attendance read or location permission is active. |
| Leave | Overview/Requests tabs; balance/request summary placeholders; request affordance | Time → Leave. No balances, requests, approvals, or write handler are active. |
| HR Communications | Announcements/Policies/Letters grouping and empty state | More → HR Communications. No communications query is active. |
| Employee detail | Blank identity header; grouped profile fields; permission reminder | People → select an employee. There is no selected employee or real profile in the image. |

## Review these boundaries with the concept

The screenshot demonstrates information hierarchy, not finalized functional behavior. Query-backed counts, filters, status colors, person labels, edit/share buttons, and files only belong in the live app after the relevant access and field policy is agreed. In particular, no employee-detail PII, personal email, employee identifier, salary, bank, health, or precise location data appears in the preview.

The desired native implementation should remain responsive to Android font scaling and screen width. At narrow widths, metric cards stack or horizontally scroll rather than clipping; at tablet widths, the navigation can become a rail and overview cards can form two columns. Keep warm light surfaces, preserve high-contrast text, and use Android semantic labels and focus order; the concept sheet itself is not an accessibility certification.

Generated assets: `../design-preview/hrflow-native-screens.png` is the six-screen contact sheet; six individual `*-screen.png` files are available alongside it. The Python script there is the source of this artwork and uses the bundled Inter font. The live starter route set is intentionally smaller and documented in [the architecture note](ARCHITECTURE.md).
