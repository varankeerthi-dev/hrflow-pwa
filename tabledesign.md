# Advance/Expense Table Header Design

## Table Container

```jsx
<div className="rounded-lg border border-zinc-200 bg-white text-zinc-950 shadow-sm">
  <div className="overflow-x-auto">
    <table className="w-full caption-bottom text-sm border-collapse">
```

## Table Header (Thead)

```jsx
<thead className="border-b border-zinc-200 bg-zinc-50/80 [&_tr]:border-b">
  <tr className="border-b border-zinc-200">
```

## Header Cells (Without HR/MD Columns)

| Column | CSS Classes | Width |
|--------|-------------|-------|
| **Checkbox** | `h-10 px-3 py-2 text-center align-middle text-xs font-medium text-zinc-500` | `w-[40px]` |
| **Submitted Date** | `h-10 px-3 text-left align-middle text-xs font-medium text-zinc-500` | - |
| **Requesting Date** | `h-10 px-3 text-left align-middle text-xs font-medium text-zinc-500` | - |
| **Type** | `h-10 px-3 text-left align-middle text-xs font-medium text-zinc-500` | - |
| **Requested By** | `h-10 px-3 text-left align-middle text-xs font-medium text-zinc-500` | - |
| **Created By** | `h-10 px-3 text-left align-middle text-xs font-medium text-zinc-500` | - |
| **Amount** | `h-10 px-3 text-right align-middle text-xs font-medium text-zinc-500` | - |
| **Remarks** | `h-10 px-3 text-left align-middle text-xs font-medium text-zinc-500` | - |
| **Action** | `h-10 px-3 text-right align-middle text-xs font-medium text-zinc-500` | `min-w-[100px]` |

## Complete Header Row JSX

```jsx
<thead className="border-b border-zinc-200 bg-zinc-50/80 [&_tr]:border-b">
  <tr className="border-b border-zinc-200">
    <th className="w-[40px] px-3 py-2 text-center align-middle text-xs font-medium text-zinc-500">
      {/* Checkbox header */}
    </th>
    <th className="h-10 px-3 text-left align-middle text-xs font-medium text-zinc-500">
      Submitted date
    </th>
    <th className="h-10 px-3 text-left align-middle text-xs font-medium text-zinc-500">
      Requesting date
    </th>
    <th className="h-10 px-3 text-left align-middle text-xs font-medium text-zinc-500">
      Type
    </th>
    <th className="h-10 px-3 text-left align-middle text-xs font-medium text-zinc-500">
      Requested By
    </th>
    <th className="h-10 px-3 text-left align-middle text-xs font-medium text-zinc-500">
      Created By
    </th>
    <th className="h-10 px-3 text-right align-middle text-xs font-medium text-zinc-500">
      Amount
    </th>
    <th className="h-10 px-3 text-left align-middle text-xs font-medium text-zinc-500">
      Remarks
    </th>
    <th className="h-10 px-3 text-right align-middle text-xs font-medium text-zinc-500 min-w-[100px]">
      Action
    </th>
  </tr>
</thead>
```

## Design Tokens

### Colors
- **Background:** `bg-zinc-50/80` (semi-transparent light gray)
- **Text:** `text-zinc-500` (medium gray)
- **Border:** `border-zinc-200` (light gray)

### Typography
- **Font Size:** `text-xs` (12px)
- **Font Weight:** `font-medium` (500)
- **Text Transform:** Default (no uppercase for this table)

### Spacing
- **Header Height:** `h-10` (40px)
- **Padding X:** `px-3` (12px horizontal)
- **Padding Y:** `py-2` (8px vertical for checkbox)

### Borders
- **Bottom Border:** `border-b border-zinc-200`
- **Row Border:** `border-b border-zinc-200` on `<tr>`

### Shadow
- **Container Shadow:** `shadow-sm`

## Table Body Reference

```jsx
<tbody className="[&_tr:last-child]:border-0">
  {/* Table rows here */}
</tbody>
```

## Data Row Cell Pattern

```jsx
<td className="px-3 py-1.5 align-middle whitespace-nowrap text-[12px] font-medium text-zinc-500">
  {/* Data content */}
</td>
```

## Usage Notes

1. **Horizontal Scroll:** Use `overflow-x-auto` on the table wrapper for responsive tables
2. **Row Hover:** Add `hover:bg-zinc-50/80` to `<tr>` elements
3. **Selected Row:** Add `bg-indigo-50/30` for selected state
4. **Empty State:** Use `colSpan={9}` for the empty row message
