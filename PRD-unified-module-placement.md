# Product Requirements Document: Unified Module Placement Below Quick Access

## 1. Overview

The HRFlow dashboard keeps Quick Access in the fixed global header, but individual sidebar modules currently begin at different vertical positions. Some modules start directly with shared sub-navigation, while others insert title cards, hero headers, sticky controls, or custom navigation cards first. This creates visible layout jumps when users move between sidebar tabs.

This change standardizes the first visible module area below the existing Quick Access/header zone without removing or relocating Quick Access.

## 2. Problem statement

Users should be able to move across sidebar modules and retain a stable visual anchor. At present, the first meaningful row varies by module, including direct shared navigation, title/action blocks, sticky headers, hero headers, and custom navigation cards.

## 3. Goals

The implementation must preserve the current Quick Access menu in the fixed header and establish one exact vertical baseline beneath the complete top menu/header. Every sidebar page must place its first visible sub-menu, title bar, action bar, or opening section at that same distance from the top menu. Modules with sub-navigation must place that navigation on the baseline. Standalone modules must place their title and primary actions on the same baseline. Module-specific styling may remain after the baseline, but it must not shift the first visible page-level row relative to other sidebar destinations.

## 4. Non-goals

This work does not redesign Quick Access, change sidebar information architecture, rename modules, alter permissions, modify Firebase behavior, or refactor the internal business logic of individual modules. Module-specific visual treatments may remain, provided they respect the shared top placement.

## 5. Proposed experience

```text
Fixed global header
  Organization identity | Quick Access | Profile and actions

Main workspace
  Standard module header/navigation slot
    Shared sub-navigation, or standalone title/actions
  Module body
```

Every sidebar destination should align its module header/navigation slot to the same top edge and use the same outer horizontal inset. The body may then use module-specific layouts below that slot.

## 6. Functional requirements

1. Quick Access remains in its current fixed global header position.
2. Selecting any sidebar module must render its first visible sub-menu, title bar, action bar, or opening section at the same exact vertical distance below the global header and Quick Access menu.
3. Modules with `SubTabsNav` must render that navigation as the first shared module-level element, unless a title/action row is explicitly part of the standardized header slot.
4. Standalone modules must render their title and primary actions inside the same standardized header slot used by sub-navigation modules.
5. Module-specific hero, sticky, gradient, and card treatments must not introduce an additional unaligned top offset.
6. The main content body must begin after the standardized header/navigation slot.
7. The layout must remain usable at desktop, tablet, and mobile widths.
8. Sidebar navigation behavior, active states, Quick Access actions, permissions, and routing must remain unchanged.

## 7. Visual requirements

The first visible page-level row must share one exact top offset and horizontal inset across all sidebar pages. Internal content may vary after that row, but the baseline itself must not move.

## 8. Acceptance criteria

| ID | Acceptance criterion |
|---|---|
| AC-01 | Quick Access remains visible and unchanged in the fixed global header. |
| AC-02 | Sidebar pages show their first module-level row at a visually consistent top baseline. |
| AC-03 | A module with sub-navigation does not place that navigation substantially lower than a standalone module header. |
| AC-04 | No module has an unexplained extra top gap before its first title, sub-navigation, or primary action row. |
| AC-05 | Existing module-specific controls remain available and usable. |
| AC-06 | Sidebar navigation and active-state behavior continue to work. |
| AC-07 | The page remains horizontally stable when switching between modules. |
| AC-08 | The result is inspected in a browser before any commit or push to GitHub. |

## 9. Approvals exception

The Approvals page intentionally has no visible sub-navigation and no descriptive subtitle. Its title remains aligned to the same shared module top baseline as other pages.

## 10. Version control

The implementation is committed only after the requested changes are restored and reviewed. The commit is pushed to the selected GitHub repository.
