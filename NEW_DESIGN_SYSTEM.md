# PipePro New Design System Specification

A comprehensive single-source design system reference built from PipePro design guidelines, layout specifications, package requirements, sidemenu navigation patterns, dropdowns, and form control standards.

---

## 1. Technical Stack & Dependencies

| Category | Package / Tool | Purpose |
| :--- | :--- | :--- |
| **Framework & Build** | React 18/19, Vite, TailwindCSS (v3/v4) | Core UI engine & utility styling |
| **Primitives** | `@radix-ui/*` (dialog, select, label, dropdown-menu, tabs, avatar) | Accessible, unstyled UI primitives |
| **Styling Helpers** | `class-variance-authority` (`cva`), `clsx`, `tailwind-merge` | Type-safe variant management & `cn()` class merging |
| **Icons & Motion** | `lucide-react`, `tailwindcss-animate`, `framer-motion` | Micro-interactions, icons & smooth transitions |
| **Forms & Schemas** | `react-hook-form`, `zod`, `zustand` | State management & strict schema validation |
| **Data & Queries** | `@tanstack/react-query`, Firebase Firestore / Storage | Server state, caching & document persistence |

---

## 2. Typography & Fonts

### Font Families
- **Headings / Title / Wordmark / Action Buttons**: `Plus Jakarta Sans` (`font-heading`)
- **Body / Subtitles / Inputs / Badges / Tables**: `Inter` (`font-body`)
- **Registration / RC Numbers / Numbers / Currency**: `Monospace` (`font-mono`)

### Label Standard (`<label>`)
```jsx
<label className="block text-sm font-medium text-slate-800 mb-1.5 font-body">
  Field Label <span className="text-rose-500">*</span>
</label>
```
- **Size**: `text-sm` (14px)
- **Weight**: `font-medium` (500)
- **Color**: `text-slate-800` (or `text-foreground`)
- **Spacing**: `mb-1.5` (6px bottom margin above input)

---

## 3. Color System & Design Tokens

### Primary Theme Variables (`:root`)
```css
:root {
  /* Neutral Scale */
  --neutral-50:  210 40% 98%;
  --neutral-100: 210 40% 96%;
  --neutral-200: 214 32% 91%;
  --neutral-500: 215 16% 47%;
  --neutral-700: 217 19% 27%;
  --neutral-900: 222 47% 11%;

  /* Brand Scale (Primary Blue) */
  --brand-50:  214 100% 97%;
  --brand-500: 217 91% 60%;
  --brand-600: 221 83% 53%; /* Primary #2563eb */
  --brand-700: 224 76% 48%; /* Hover #1d4ed8 */

  /* Pure White Surface Locking */
  --background: 0 0% 100%;
  --card: 0 0% 100%;
  --border: 214 32% 91%;
}
```

---

## 4. App Shell & Sidemenu Navigation

### Desktop Sidebar (≥lg)
- Fixed **256px width** (`w-64 bg-white border-r border-slate-200`)
- Pure white `#ffffff` background to eliminate grey bleed.
- Brand Logo header (`p-6 border-b border-slate-200`)
- Navigation Items (`px-4 py-3 rounded-xl text-sm font-medium`)
  - Active Row: `bg-blue-50 text-blue-700 font-semibold`
  - Inactive Hover: `hover:bg-slate-50 hover:text-slate-900`
- Top Right User Profile: Compact pill card (`flex items-center gap-2 px-3 py-1.5 rounded-full border border-slate-200 bg-white shadow-xs`)

### Sub-Navigation (`SubTabsNav.jsx`)
- Compact tab pill navigation
- Zero bottom margin (`marginBottom: 0px`) to prevent unnecessary white space above page headers.

---

## 5. Input Fields, Selects & Validation

### Standard Input Control
```jsx
<input 
  type="text"
  placeholder="Enter value..."
  className="h-9 w-full rounded-md border border-slate-200 bg-white px-3 py-1 text-sm shadow-2xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-blue-600 placeholder:text-slate-400 text-slate-800"
/>
```
- **Height**: Fixed 36px (`h-9`)
- **Corners**: `rounded-md` (6px radius)
- **Background**: Pure white (`bg-white`)

### Vehicle / Registration Number Validation Rule
- Must contain **CAPITAL LETTERS AND NUMBERS ONLY** (`A-Z0-9`).
- No dashes, slashes, spaces, or special symbols.
```jsx
onChange={(e) => { 
  e.target.value = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '') 
}}
```

---

## 6. Cards & Modal Dialog Architecture

### Modal Overlay & Container
```jsx
<div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center overflow-auto p-4 sm:p-6 animate-in fade-in-0 duration-200">
  <div className="bg-white text-slate-900 rounded-2xl border border-slate-200 shadow-2xl w-full max-w-3xl max-h-[90vh] overflow-hidden flex flex-col animate-in zoom-in-95 duration-200">
    {/* Modal Header */}
    <div className="bg-white px-6 py-4 border-b border-slate-200 flex justify-between items-center shrink-0">
      <div>
        <h3 className="text-lg font-bold text-slate-900 font-heading tracking-tight">Modal Title</h3>
        <p className="text-xs text-slate-500 mt-0.5">Subtitle context</p>
      </div>
      <button className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors">
        <X size={18} />
      </button>
    </div>
    
    {/* Form Body */}
    <form className="p-6 space-y-6 overflow-y-auto bg-white">
      ...
    </form>
  </div>
</div>
```

### Inner Section Cards
- Container: `border border-slate-200 rounded-xl overflow-hidden bg-white shadow-2xs`
- Header Bar: `bg-slate-50 px-4 py-2.5 border-b border-slate-200 flex items-center justify-between`
- Section Title: `text-xs font-bold text-slate-900 font-heading uppercase tracking-wider flex items-center gap-2`

### Button Specifications
- **Primary Button**: `h-9 px-6 bg-blue-600 hover:bg-blue-700 text-white rounded-md text-sm font-bold font-heading shadow-sm active:scale-[0.98]`
- **Secondary / Cancel Button**: `h-9 px-4 border border-slate-200 bg-white text-slate-700 text-sm font-medium rounded-md hover:bg-slate-50`

---

## 7. Data Tables & Audit Logs

### Table Styling
- Header Row: `bg-slate-100/70 border-b border-slate-200 text-[11px] font-bold text-slate-600 uppercase tracking-wider`
- Body Rows: `hover:bg-blue-50/30 transition-colors border-b border-slate-200/60`
- Metric Cards: Side-by-side horizontal layout (`flex items-center gap-3.5 p-3.5 rounded-2xl border border-slate-200/80 bg-white`)

### Audit Logs Requirement
- Every mutation (Create, Update, Delete) must emit an audit entry to `organisations/{orgId}/audit_logs` recording module, action, user ID, user name, details, and server timestamp.
