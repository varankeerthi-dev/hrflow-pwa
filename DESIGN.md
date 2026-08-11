# Project Design System Source of Truth (DESIGN.md)

> **PRIMARY SPECIFICATION**: For full design tokens, code examples, package requirements, sidemenu layout rules, and component patterns, refer directly to [`NEW_DESIGN_SYSTEM.md`](file:///c:/Users/admin/hrflow-pwa/NEW_DESIGN_SYSTEM.md).

---

## 🎨 UI & UX Standards Overview

### 1. Typography & Font Stack
- **Headings & Primary Buttons**: `Plus Jakarta Sans` (`font-heading`)
- **Body & Table Data**: `Inter` (`font-body`)
- **Numbers / Registration / RC Numbers**: `Monospace` (`font-mono`)
- **Label Standard (`<label>`)**: `block text-sm font-medium text-slate-800 mb-1.5 font-body` (14px font, 500 weight, 6px bottom spacing above input)

### 2. Colors & Surface Tokens
- **Primary Brand Color**: `bg-blue-600` (`#2563eb`) / Hover: `hover:bg-blue-700` (`#1d4ed8`)
- **Background Surfaces**: Lock pure white `#ffffff` (`bg-white`) on modals, cards, section containers, and inputs to eliminate grey bleed.
- **Section Headers**: Soft slate tint `#f8fafc` (`bg-slate-50 border-b border-slate-200`)

### 3. Form Inputs & Select Controls
- **Fixed Height**: `h-9` (36px)
- **Corners**: `rounded-md` (6px radius)
- **Borders & Rings**: `border border-slate-200 bg-white px-3 py-1 text-sm focus-visible:ring-1 focus-visible:ring-blue-600`
- **Vehicle / RC Number Constraint**: Strictly **UPPERCASE Alphanumeric ONLY** (`A-Z0-9`, no spaces, dashes, or symbols).

### 4. Modal Dialogs & Section Cards
- **Backdrop**: `fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 sm:p-6`
- **Dialog Container**: `bg-white rounded-2xl border border-slate-200 shadow-2xl max-w-3xl w-full`
- **Section Cards**: `border border-slate-200 rounded-xl overflow-hidden bg-white shadow-2xs`
- **Primary Action Button**: `h-9 px-6 bg-blue-600 hover:bg-blue-700 text-white rounded-md text-sm font-bold font-heading shadow-sm active:scale-[0.98]`
- **Secondary Action Button**: `h-9 px-4 border border-slate-200 bg-white text-slate-700 text-sm font-medium rounded-md hover:bg-slate-50`

### 5. Sidemenu & App Navigation
- **Width**: Fixed 256px (`w-64 bg-white border-r border-slate-200`)
- **Background**: Pure white `#ffffff`
- **Active Navigation Link**: `bg-blue-50 text-blue-700 font-semibold`
- **Sub-Navigation Tabs (`SubTabsNav.jsx`)**: Zero bottom margin (`marginBottom: 0px`) to prevent unnecessary white space.

---

## 📌 Implementation Rule
All future UI development, component extraction, and page additions across the application **MUST** strictly follow the guidelines detailed in [`NEW_DESIGN_SYSTEM.md`](file:///c:/Users/admin/hrflow-pwa/NEW_DESIGN_SYSTEM.md).
