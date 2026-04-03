---
name: capy
description: Apply the Capy design language to any UI — the monochrome-plus-teal, stark-yet-playful aesthetic from capy.ai. Use when the user says "capy style", "capy-inspired", "capy design", or wants the Capy look applied to pages, dashboards, cards, tables, forms, or any component.
---

# Capy Design Language

You are applying the **Capy design language** — the visual identity of capy.ai. This is a specific, opinionated aesthetic: stark monochrome surfaces, a single teal accent, generous whitespace, pill-shaped interactive elements, and bold condensed typography. It is NOT generic shadcn, NOT Material Design, NOT "modern SaaS". It has a distinct personality: confident, clean, slightly playful.

## The Capy Vibe

**In one line:** Japanese-inspired minimalism meets confident SaaS — stark black-and-white surfaces with a single pop of warm teal.

- **Mood:** Calm, focused, effortlessly cool. Like a capybara — unbothered, productive.
- **Density:** Airy. Content breathes. Whitespace is a feature, not wasted space.
- **Personality:** Minimal UI, maximum clarity. Playful where it counts (empty states, micro-copy), dead-serious everywhere else.

---

## 1. Color Palette

The palette is almost monochrome. One accent color. That's it.

| Role | Token | Value | Usage |
|---|---|---|---|
| **Background** | `bg-page` | `#fafafa` | Page-level background. Never pure white. |
| **Surface** | `bg-surface` | `#ffffff` | Cards, panels, modals. White but never stark. |
| **Border** | `border-default` | `#e5e7eb` | 1px borders on cards, dividers. Subtle. |
| **Border hover** | `border-hover` | `#d1d5db` | Slightly darker on hover. |
| **Text primary** | `text-primary` | `#18181b` | Headlines, labels, primary content. Near-black. |
| **Text secondary** | `text-secondary` | `#52525b` | Descriptions, secondary info. Warm gray. |
| **Text muted** | `text-muted` | `#a1a1aa` | Timestamps, captions, placeholders. |
| **Accent** | `accent` | `#5eead4` | The ONE color. Teal/mint. CTAs, active states, highlights. |
| **Accent dark** | `accent-dark` | `#14b8a6` | Hover state for accent. Slightly deeper teal. |
| **Accent subtle** | `accent-subtle` | `#ccfbf1` | Light teal wash for backgrounds, badges. |
| **Danger** | `danger` | `#ef4444` | Destructive actions only. |
| **Success dot** | `success` | `#22c55e` | Small status dots. Never large fills. |
| **Warning dot** | `warning` | `#f59e0b` | Small status dots. Never large fills. |

### Color Rules

- **NEVER** use multi-color gradients on card headers or backgrounds.
- **NEVER** assign different accent colors to different cards (no indigo for this card, pink for that one).
- **ONE** accent color across the entire UI. Teal. That's it.
- Status colors appear ONLY as small dots (8px circles) or tiny text — never as large filled badges.
- Semantic colors (red, green, amber) are used sparingly: inline status dots, form errors, and nothing else.

### Tailwind Mapping

```
bg-[#fafafa]        → page background
bg-white            → card surface
border-gray-200     → default borders
text-zinc-900       → primary text
text-zinc-600       → secondary text
text-zinc-400       → muted text
bg-teal-300         → accent fills (buttons, active indicators)
text-teal-600       → accent text
bg-teal-50          → accent subtle background
hover:bg-teal-400   → accent hover
```

---

## 2. Typography

### Font Stack

Use the system font stack. Capy does NOT use Inter, Roboto, or any imported Google Font for body text. The distinction comes from weight and spacing, not the font itself.

```css
font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
```

For code/monospace:
```css
font-family: ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace;
```

### Type Scale

| Element | Size | Weight | Tracking | Transform | Tailwind |
|---|---|---|---|---|---|
| Page title | 20px | 800 (extrabold) | -0.025em | none | `text-xl font-extrabold tracking-tight` |
| Section header | 13px | 700 (bold) | 0.05em | UPPERCASE | `text-[13px] font-bold uppercase tracking-widest` |
| Card title | 14px | 700 (bold) | -0.01em | none | `text-sm font-bold tracking-tight` |
| Body text | 14px | 400 | normal | none | `text-sm` |
| Secondary text | 13px | 500 | normal | none | `text-[13px] font-medium` |
| Caption/meta | 12px | 500 | normal | none | `text-xs font-medium` |
| Tiny label | 10–11px | 600 | 0.03em | UPPERCASE | `text-[11px] font-semibold uppercase tracking-wide` |

### Typography Rules

- **Section headers** are ALWAYS uppercase, tracked-out, small (13px), and bold. They act as quiet organizers, not attention-grabbers.
- **Page titles** are the largest element but still restrained — 20px max. No 32px hero text inside the app.
- **NEVER** use colored text for headers. Headers are `text-zinc-900` or `text-zinc-800`. Period.
- **NEVER** use gradient text.
- Table column headers use the "tiny label" style: `text-[11px] font-semibold uppercase tracking-wide text-zinc-500`.

---

## 3. Shapes & Radii

| Element | Radius | Tailwind |
|---|---|---|
| Buttons (primary) | Full pill | `rounded-full` |
| Buttons (secondary) | Full pill | `rounded-full` |
| Cards | 16px | `rounded-2xl` |
| Input fields | 12px | `rounded-xl` |
| Dropdowns/popovers | 12px | `rounded-xl` |
| Status dots | Full circle | `rounded-full` (w-2 h-2) |
| Badges/chips | Full pill | `rounded-full` |
| Modal/dialog | 20px | `rounded-2xl` |
| Table rows | 0 (no radius) | — |

### Shape Rules

- Buttons are ALWAYS pill-shaped (`rounded-full`). No `rounded-md`, no `rounded-lg`.
- Cards are always `rounded-2xl`. Not `rounded-lg`. Not `rounded-xl`.
- Never mix radii on the same surface — a card's internal elements (inputs, badges) should feel softer than the card itself.

---

## 4. Shadows & Depth

Capy is **flat-first**. Shadows are whisper-soft, used for elevation hints only.

| Level | Shadow | Usage |
|---|---|---|
| Resting | `shadow-sm` or `shadow-none` | Cards at rest. Barely visible. |
| Hover | `shadow-md` | Cards on hover. Gentle lift. |
| Elevated | `shadow-lg` | Modals, dropdowns, popovers. |
| Focus ring | `ring-2 ring-teal-300/30` | Focused inputs/buttons. Teal glow. |

### Shadow Rules

- Cards at rest should use `shadow-sm` — so subtle you almost can't see it.
- **NEVER** use `shadow-xl` or `shadow-2xl` inside the app. Those are for marketing pages.
- **NEVER** use colored shadows (e.g., `shadow-indigo-500/20`). Shadows are always neutral.
- Borders (`border border-gray-200`) do more work than shadows in Capy.

---

## 5. Components

### Buttons

```
Primary:   bg-zinc-900 text-white rounded-full px-5 py-2.5 text-sm font-semibold
           hover:bg-zinc-800 transition-colors

Accent:    bg-teal-300 text-zinc-900 rounded-full px-5 py-2.5 text-sm font-semibold
           hover:bg-teal-400 transition-colors

Secondary: bg-white text-zinc-700 border border-gray-200 rounded-full px-5 py-2.5 text-sm font-medium
           hover:bg-gray-50 hover:border-gray-300 transition-colors

Ghost:     text-zinc-600 rounded-full px-4 py-2 text-sm font-medium
           hover:bg-gray-100 transition-colors

Danger:    bg-white text-red-600 border border-red-200 rounded-full px-5 py-2.5 text-sm font-medium
           hover:bg-red-50 transition-colors

Icon:      p-2 rounded-full text-zinc-400 hover:text-zinc-600 hover:bg-gray-100 transition-colors
```

- Primary action = black fill. NOT blue, NOT indigo.
- Teal accent button for special CTAs (e.g., "Start free trial", "Create new").
- All buttons are `rounded-full`. Non-negotiable.

### Cards

```
Container: bg-white rounded-2xl border border-gray-200 shadow-sm
           hover:shadow-md transition-shadow

Header:    px-5 py-4 border-b border-gray-100
           (NO gradient backgrounds, NO colored tints)

Title:     text-sm font-bold text-zinc-800 tracking-tight

Content:   px-5 py-4

Footer:    px-5 py-3 border-t border-gray-100 bg-gray-50/50
```

- Card headers are **plain white** or barely `bg-gray-50/30`. No gradient tints.
- Card titles are small (14px) and bold. No icons next to titles unless essential.
- Cards have generous internal padding (20px / `px-5 py-4`).

### Tables

```
Header row:    border-b border-gray-200
Header cell:   px-4 py-3 text-[11px] font-semibold uppercase tracking-wide text-zinc-500 text-left
Body row:      border-b border-gray-50 hover:bg-gray-50/50 transition-colors
Body cell:     px-4 py-3 text-sm text-zinc-700
Empty state:   py-12 text-center text-sm text-zinc-400
```

- Table headers are muted (`text-zinc-500`), small, and uppercase. NOT colored (no blue headers, no amber headers).
- Row hover is barely visible: `hover:bg-gray-50/50`.
- No zebra striping. No cell borders. Just bottom borders between rows.

### Status Indicators

```
Dot:       w-2 h-2 rounded-full inline-block
           Active:    bg-emerald-500
           Pending:   bg-amber-500
           Error:     bg-red-500
           Inactive:  bg-gray-300

Text pill: text-[11px] font-medium px-2 py-0.5 rounded-full
           Active:    bg-gray-100 text-zinc-700
           (Yes — even status pills are monochrome in Capy. The dot provides the color.)
```

- Status is communicated by a **small colored dot** + **monochrome text label**.
- **NEVER** use fully-colored badge backgrounds (no `bg-emerald-50 text-emerald-700`). That's the opposite of Capy.
- The pattern: `<dot color> + <gray pill with dark text>`.

### Form Inputs

```
Input:     w-full px-4 py-2.5 bg-white border border-gray-200 rounded-xl text-sm text-zinc-900
           placeholder:text-zinc-400
           focus:border-teal-300 focus:ring-2 focus:ring-teal-300/20 focus:outline-none
           transition-all

Label:     text-[11px] font-semibold uppercase tracking-wide text-zinc-500 mb-1.5

Select:    Same as input + appearance-none with chevron icon

Textarea:  Same as input + min-h-[80px] resize-y
```

- Focus state uses teal ring, not blue/indigo.
- Labels are tiny uppercase — they stay out of the way.
- No colored asterisks for required fields. Use `*` in the same muted color as the label.

---

## 6. Layout & Spacing

### Page Structure

```
Page bg:       bg-[#fafafa] min-h-screen
Page padding:  px-6 py-6 (desktop), px-4 py-4 (mobile)
Max width:     max-w-[1400px] mx-auto (content), max-w-[1600px] (dashboard)
```

### Spacing Scale

| Token | Value | Usage |
|---|---|---|
| `gap-1` | 4px | Between dot and label |
| `gap-2` | 8px | Between icon and text, inline elements |
| `gap-3` | 12px | Between related form fields |
| `gap-4` | 16px | Between card sections |
| `gap-5` | 20px | Between cards in a grid |
| `gap-6` | 24px | Between major page sections |
| `py-4` | 16px | Card header/content internal padding |
| `px-5` | 20px | Card horizontal padding |

### Spacing Rules

- Generous whitespace everywhere. When in doubt, add more space.
- Cards in a grid use `gap-5` (20px). Not 12px. Not 8px.
- Section headers have `mb-3` (12px) below them before content.
- Page sections have `mb-8` (32px) between them.

---

## 7. Motion & Transitions

```
Default:     transition-colors duration-150
Cards:       transition-shadow duration-200
Expand:      transition-all duration-200 ease-out
Skeleton:    animate-pulse (gray-100 shimmer)
```

- Keep transitions subtle and fast. 150–200ms max.
- No bouncing, no elastic easing, no spring physics.
- Expand/collapse uses `ease-out` — fast open, gentle settle.
- Loading states use simple pulse skeletons, not spinners.

---

## 8. Anti-Patterns (NEVER do these in Capy style)

1. **Multi-color card headers** — No `bg-gradient-to-r from-blue-500/10`. Cards are white.
2. **Colored icon badges** — No `bg-indigo-100 text-indigo-600` icon containers. Icons are `text-zinc-400` or `text-zinc-600`.
3. **Fully-colored status badges** — No `bg-emerald-50 text-emerald-700`. Use dot + monochrome pill.
4. **Blue/indigo as primary** — Primary is black (`bg-zinc-900`). Accent is teal.
5. **Rounded-lg buttons** — Buttons are `rounded-full`. Always.
6. **Colored shadows** — No `shadow-indigo-500/20`. Shadows are neutral.
7. **Gradient text** — Never.
8. **Multiple accent colors** — One accent (teal). Not one per card.
9. **Heavy shadows** — No `shadow-xl`. Keep it flat.
10. **Small card padding** — Minimum `px-5 py-4`. Capy breathes.
11. **Colored table headers** — Table headers are `text-zinc-500`. Not blue. Not amber.
12. **Inter font import** — Use system font stack. No imported fonts.

---

## 9. Dashboard-Specific Patterns

When building dashboards in Capy style:

### Card Grid
```
<div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
  <!-- cards -->
</div>
```

### Card Header Pattern
```
<div class="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
  <h3 class="text-sm font-bold text-zinc-800 tracking-tight">Card Title</h3>
  <button class="text-zinc-400 hover:text-zinc-600 p-1 rounded-full hover:bg-gray-100 transition-colors">
    <ChevronDown size={16} />
  </button>
</div>
```

### List Item Pattern (inside cards)
```
<div class="flex items-center gap-3 px-5 py-3 border-b border-gray-50 hover:bg-gray-50/50 transition-colors">
  <div class="w-2 h-2 rounded-full bg-emerald-500 flex-shrink-0" />
  <div class="flex-1 min-w-0">
    <p class="text-sm font-medium text-zinc-800 truncate">Primary text</p>
    <p class="text-xs text-zinc-400 mt-0.5">Secondary text</p>
  </div>
  <span class="text-xs text-zinc-400">2m ago</span>
</div>
```

### Sidebar / Activity Feed
```
White card, full height, timeline with small colored dots on a vertical gray line.
Entries: icon dot + text + relative timestamp.
No colored backgrounds on entries — just hover:bg-gray-50.
```

---

## 10. Applying to Existing Components

When the project uses custom UI components (`components/ui/`), apply Capy tokens:

- **Card.tsx**: Override inline styles — remove design-system shadows, use `rounded-2xl`, `border-gray-200`, `shadow-sm`.
- **Button.tsx**: Add `rounded-full` to all variants. Primary = `bg-zinc-900`. Accent = `bg-teal-300`.
- **Badge.tsx**: Remove colored backgrounds. Use `bg-gray-100 text-zinc-700` + colored dot.
- **Table**: Headers = `text-[11px] font-semibold uppercase tracking-wide text-zinc-500`.
- **Input/Select**: Focus ring = `ring-teal-300/20`, border = `border-teal-300`.
- **Dialog/Modal**: `rounded-2xl`, no colored headers, generous padding.

---

## Quick Reference: The Capy Checklist

Before shipping any Capy-styled page, verify:

- [ ] Page background is `#fafafa`, not white
- [ ] Only ONE accent color (teal) across the entire page
- [ ] All buttons are `rounded-full`
- [ ] All cards are `rounded-2xl` with `border-gray-200` and `shadow-sm`
- [ ] Card headers are plain white — no gradients, no color tints
- [ ] Table headers are `text-zinc-500` uppercase — no colors
- [ ] Status uses small dots + monochrome pills — no colored badges
- [ ] Typography uses system fonts — no imported fonts
- [ ] Primary buttons are black (`bg-zinc-900`), not blue
- [ ] Shadows are neutral and subtle — no colored shadows
- [ ] Generous spacing: `px-5 py-4` inside cards, `gap-5` between cards
- [ ] Focus rings are teal, not blue
