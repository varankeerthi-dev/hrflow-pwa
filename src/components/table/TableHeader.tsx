import React from 'react';
import { ColumnDef } from './Table';

interface TableHeaderProps<T> {
  columns: ColumnDef<T>[];
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
      <tr style={{ height: '42px', backgroundColor: '#FAFAFA', borderBottom: '1px solid #ECECEC' }}>
        {selectable && (
          <th
            style={{
              width: '40px',
              textAlign: 'center',
              paddingLeft: '16px',
              paddingRight: '16px',
              verticalAlign: 'middle',
              borderBottom: '1px solid #ECECEC',
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
                paddingLeft: '16px',
                paddingRight: '16px',
                fontSize: '12px',
                fontWeight: 500,
                letterSpacing: '0.02em',
                color: '#6B7280',
                textAlign: align,
                cursor: sortable && (col.id || col.accessorKey) ? 'pointer' : 'default',
                position: 'relative',
                verticalAlign: 'middle',
                borderBottom: '1px solid #ECECEC',
                userSelect: 'none',
              }}
              className="th-header-cell"
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
