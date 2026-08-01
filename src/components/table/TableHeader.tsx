import React from 'react';
import { ColumnDef, NestedHeaderDef } from './Table';

interface TableHeaderProps<T> {
  columns: ColumnDef<T>[];
  nestedHeaders?: NestedHeaderDef[];
  selectable?: boolean;
  onSelectAll?: (checked: boolean) => void;
  allSelected?: boolean;
  sortCol?: string | null;
  sortDesc?: boolean;
  onSort?: (colId: string) => void;
  sortable?: boolean;
}

export function TableHeader<T>({
  columns,
  nestedHeaders,
  selectable,
  onSelectAll,
  allSelected = false,
  sortCol,
  sortDesc,
  onSort,
  sortable = false,
}: TableHeaderProps<T>) {
  return (
    <thead>
      {nestedHeaders && nestedHeaders.length > 0 && (
        <tr style={{ height: '40px', borderBottom: '1px solid #E2E8F0' }}>
          {selectable && <th style={{ borderBottom: '1px solid #E2E8F0', backgroundColor: '#FAFBFC' }} />}
          {nestedHeaders.map((group, idx) => (
            <th
              key={idx}
              colSpan={group.colSpan}
              style={{
                fontSize: '11px',
                fontWeight: 600,
                textAlign: 'center',
                verticalAlign: 'middle',
                letterSpacing: '0.03em',
                borderBottom: '1px solid #E2E8F0',
                borderRight: '1px solid rgba(226,232,240,0.6)',
                ...group.style,
              }}
              className={group.className}
            >
              {group.label}
            </th>
          ))}
        </tr>
      )}
      <tr style={{ height: '42px', backgroundColor: '#FFFFFF', borderBottom: '1px solid #E2E8F0' }}>
        {selectable && (
          <th
            style={{
              width: '40px',
              textAlign: 'center',
              paddingLeft: '16px',
              paddingRight: '16px',
              verticalAlign: 'middle',
              borderBottom: '1px solid #E2E8F0',
            }}
          >
            <input
              type="checkbox"
              checked={allSelected}
              onChange={(e) => onSelectAll?.(e.target.checked)}
              style={{
                width: '16px',
                height: '16px',
                borderColor: '#D1D5DB',
                borderRadius: '4px',
                cursor: 'pointer',
              }}
            />
          </th>
        )}
        {columns.map((col, idx) => {
          const isNumeric = col.type === 'money' || col.align === 'right';
          const align = col.align || (isNumeric ? 'right' : col.type === 'checkbox' ? 'center' : 'left');
          const isSortActive = sortCol && (sortCol === col.id || sortCol === col.accessorKey);
          
          return (
            <th
              key={col.id || String(col.accessorKey) || idx}
              onClick={() => sortable && onSort && (col.id || col.accessorKey) && onSort(col.id || String(col.accessorKey))}
              style={{
                paddingLeft: col.headerStyle?.paddingLeft !== undefined ? col.headerStyle.paddingLeft : '16px',
                paddingRight: col.headerStyle?.paddingRight !== undefined ? col.headerStyle.paddingRight : '16px',
                fontSize: '12px',
                fontWeight: 500,
                letterSpacing: '0.03em',
                color: '#64748B',
                textAlign: align,
                cursor: sortable && (col.id || col.accessorKey) ? 'pointer' : 'default',
                position: 'relative',
                verticalAlign: 'middle',
                borderBottom: '1px solid #E2E8F0',
                userSelect: 'none',
                ...col.headerStyle,
              }}
              className={`th-header-cell ${col.headerClassName || ''}`}
            >
              <div
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '4px',
                  justifyContent: align === 'right' ? 'flex-end' : align === 'center' ? 'center' : 'flex-start',
                  width: '100%',
                }}
              >
                <span>{col.header}</span>
                {sortable && (col.id || col.accessorKey) && (
                  <span
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      opacity: isSortActive ? 1 : 0,
                      color: isSortActive ? '#2563EB' : '#9CA3AF',
                      transition: 'opacity 150ms ease, color 150ms ease',
                    }}
                    className="sort-arrow"
                  >
                    {isSortActive && sortDesc ? '↓' : '↑'}
                  </span>
                )}
              </div>

              {/* Column Resize Handle */}
              <div
                style={{
                  position: 'absolute',
                  right: 0,
                  top: 0,
                  bottom: 0,
                  width: '4px',
                  cursor: 'col-resize',
                  display: 'none',
                }}
                className="resize-handle"
                onClick={(e) => e.stopPropagation()}
              >
                <div style={{ width: '2px', height: '100%', backgroundColor: '#E5E7EB', margin: '0 auto' }} />
              </div>
            </th>
          );
        })}
      </tr>
      <style>{`
        .th-header-cell:hover .sort-arrow {
          opacity: 1 !important;
        }
        .th-header-cell:hover .resize-handle {
          display: block !important;
        }
      `}</style>
    </thead>
  );
}
