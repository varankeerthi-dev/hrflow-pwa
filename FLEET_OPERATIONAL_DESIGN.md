# Fleet Operational Design System

## Purpose and scope

This document defines the **Fleet Operational Design System** introduced for the admin-facing **Operations → Vehicles** workspace. It establishes a focused operational interface for fleet records, mileage, maintenance, and associated administration. The implementation is intentionally scoped to Vehicle pages; it does not change typography, colours, or shared sub-tab behavior elsewhere in HRFlow.

The design prioritises low-friction scanning and data entry. Vehicle operators and administrators work with registrations, readings, maintenance state, and ownership details throughout the day, so the interface should feel structured, calm, and connected rather than decorative.

| Design decision | Vehicle implementation |
|---|---|
| Main surface | `#F4FAFD` provides a cool, low-noise operational canvas. |
| Content container | White (`#FFFFFF`) content areas visually connect the active tab to the workspace below. |
| Brand/action colour | Fleet Green (`#008744`) identifies create actions, focus states, and active operational emphasis. |
| Separation | `#E0E0E0` outlines create quiet hierarchy without heavy cards or coloured panels. |
| Body typography | Work Sans is used within the Vehicle workspace for practical, highly legible operational content. |
| Sub-tab typography | Geist Sans is used for concise, modern workspace navigation. |

## Colour roles

Fleet Green is a functional colour, not a decoration. It should be used for the primary action in a view, keyboard focus, an intentional active indicator, and success state emphasis when the meaning remains clear without colour alone. Existing warning, error, and expiration statuses retain their semantic meaning and must continue to include text labels or icons.

| Token | Value | Intended use |
|---|---:|---|
| `--fleet-green` | `#008744` | Primary action, focus, active emphasis |
| `--fleet-surface` | `#F4FAFD` | Workspace background and inactive tab field |
| `--fleet-container` | `#FFFFFF` | Active tab, toolbar, data container, and cards |
| `--fleet-border` | `#E0E0E0` | Tab separation and quiet content outlines |
| `--fleet-text` | `#1A1C1E` | Headings and primary operational values |
| `--fleet-text-secondary` | `#44474E` | Inactive tabs and supporting copy |

## Sub-tab construction

Vehicle sub-tabs are treated as part of the active content area rather than a detached underline navigation bar. Inactive tabs sit on the Fleet Surface. The active tab has a white background matching the content container, no lower border, a three-pixel top radius, a right outline, and a restrained bottom-weighted shadow. This creates a continuous visual route from navigation to the selected workspace.

The baseline standards are deliberately compact and should not be widened merely to fill space.

| Property | Standard |
|---|---|
| Tab padding | `12px 24px` |
| Gap between tabs | `4px` |
| Corner treatment | `3px 3px 0 0` on the active tab only |
| Active-tab border | Right outline only; no visual divider below the tab |
| Active weight | Geist Sans semi-bold (`600`) |
| Inactive weight | Geist Sans medium (`500`) |
| Mobile behavior | Horizontally scrollable; no wrapping or compressed labels |

## Layout and surface rules

The Vehicle workspace uses a **surface-to-container** pattern. The outer operational canvas is `#F4FAFD`; its active content is white. At desktop widths, the workspace keeps a 24-pixel content margin. Mobile widths reduce the external margin to 12 pixels while retaining a direct visual connection between active tab and content.

The status rail is white and separated with the quiet border token. This prevents status totals from competing with entry tables or the active tab. Data tables should retain white cells, narrow neutral rules, readable headers, and right-aligned numerical values. Avoid gradients, coloured card blocks, and multiple competing primary buttons.

## Typography system

Vehicle data is composed in Work Sans. It is intended for labels, values, table rows, filters, and action text. Geist Sans is reserved for the sub-tab navigation because its compact, technical character improves high-level workspace orientation. Existing semantic hierarchy is retained: headings are clear, supporting labels are quieter, and operational values do not rely on excessive bold weight.

| Element | Font | Weight guidance |
|---|---|---|
| Vehicle workspace body | Work Sans | 400–500 |
| Operational values | Work Sans | 500–600 when needed for scanning |
| Sub-tab label | Geist Sans | 500 inactive, 600 active |
| Primary action | Work Sans | 500–600 |
| Table header | Work Sans | 600, compact uppercase only where existing convention requires it |

## Interaction principles

Primary create actions use Fleet Green with white text. Focus outlines use the same colour and remain visible to keyboard users. Tab selection is immediate and leaves the current content in place unless a user changes the active workspace. On mobile, users may scroll the tab strip horizontally; the selected tab must remain readable and maintain the connected active surface.

The design system does not alter Vehicle permissions, mileage validation, maintenance logic, storage behavior, audit records, or employee portal functionality. It is a presentation and navigation-surface layer over the existing operational workflow.

## Reuse guardrails for later rollout

Before extending this system to another HRFlow area, assess whether the page is an operational workspace with multiple connected views. Use the system where a calm surface, integrated sub-tabs, and a single clear operational action improve task flow. Do not globally replace shared `SubTabsNav`; create a scoped variant when another page needs materially different navigation behavior.

Future page adoption should preserve the following contract:

1. Scope new colour and typography selectors to the adopting workspace.
2. Keep semantic warning, error, and approval states accessible without colour alone.
3. Preserve existing RBAC, data writes, audit logging, and workflow transitions.
4. Validate desktop and mobile tab overflow before rollout.
5. Avoid restyling unrelated shared components as a side effect of a local theme.
