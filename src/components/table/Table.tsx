import React, { useMemo, useState } from 'react';
// Kinetic Enterprise Monthly Summary: optional scoped table surface for Payroll and Attendance only.
import { Eye } from 'lucide-react';
import { TableToolbar } from './TableToolbar';
import { TableHeader } from './TableHeader';
import { TableRow } from './TableRow';
import { TableCell, ColumnType } from './TableCell';
import { TablePagination } from './TablePagination';
import { TableSkeleton } from './TableSkeleton';
import { TableEmpty } from './TableEmpty';
import { TableActions, RowAction } from './TableActions';
import { TableBulkActions, BulkAction } from './TableBulkActions';
import { StatusType } from './StatusBadge';

export interface ColumnDef<T> {
  header: string;
  accessorKey?: keyof T;
  id?: string;
  type?: ColumnType;
  align?: 'left' | 'right' | 'center';
  cell?: (info: { row: T; getValue: () => any }) => React.ReactNode;
  secondaryText?: (row: T) => string;
  statusType?: (row: T) => StatusType;
  headerStyle?: React.CSSProperties;
  headerClassName?: string;
  cellStyle?: React.CSSProperties | ((row: T) => React.CSSProperties);
  cellClassName?: string | ((row: T) => string);
}

export interface NestedHeaderDef {
  label: string;
  colSpan: number;
  className?: string;
  style?: React.CSSProperties;
}

export interface DataTableProps<T> {
  className?: string;
  data: T[];
  columns: ColumnDef<T>[];
  loading?: boolean;
  page: number;
  pageSize: number;
  totalRows: number;
  searchable?: boolean;
  selectable?: boolean;
  sortable?: boolean;
  pagination?: boolean;
  onPageChange?: (page: number) => void;
  onPageSizeChange?: (size: number) => void;
  onSearch?: (value: string) => void;

  // Toolbar Filter Pills
  filterOptions?: { id: string; label: string }[];
  selectedFilterId?: string;
  onFilterSelect?: (id: string) => void;

  // Collapsible Filter Panel
  filterPanel?: React.ReactNode;

  // Empty state
  emptyTitle?: string;
  emptySubtitle?: string;
  emptyActionLabel?: string;
  onEmptyAction?: () => void;

  // Row click
  onRowClick?: (row: T) => void;
  selectedRowIds?: Set<string | number>;
  onRowSelectChange?: (row: T, checked: boolean) => void;
  onSelectAllChange?: (checked: boolean) => void;

  // ── View button (eye icon, before three-dot menu) ──
  onView?: (row: T) => void;

  // ── Row-level actions (three-dot dropdown, always last column) ──
  rowActions?: (row: T) => RowAction[];

  // ── Bulk actions (bar shown when rows are selected) ──
  bulkActions?: BulkAction<T>[];

  // ── Column visibility (hide/unhide) ──
  hiddenColumnIds?: string[];
  onColumnVisibilityChange?: (hiddenIds: string[]) => void;
  mandatoryColumnIds?: string[];

  // ── Extended nested headers and styling ──
  nestedHeaders?: NestedHeaderDef[];
  rowClassName?: (row: T, idx: number) => string;
  rowStyle?: (row: T, idx: number) => React.CSSProperties;
}

export function Table<T extends { id?: string | number }>({
  className,
  data,
  columns,
  loading = false,
  page,
  pageSize,
  totalRows,
  searchable = true,
  selectable = false,
  sortable = true,
  pagination = true,
  onPageChange,
  onPageSizeChange,
  onSearch,
  filterOptions,
  selectedFilterId,
  onFilterSelect,
  filterPanel,
  emptyTitle,
  emptySubtitle,
  emptyActionLabel,
  onEmptyAction,
  onRowClick,
  selectedRowIds = new Set(),
  onRowSelectChange,
  onSelectAllChange,
  onView,
  rowActions,
  bulkActions,
  hiddenColumnIds = [],
  onColumnVisibilityChange,
  mandatoryColumnIds = [],
  nestedHeaders,
  rowClassName,
  rowStyle,
}: DataTableProps<T>) {
  const [searchValue, setSearchValue] = useState('');
  const [sortCol, setSortCol] = useState<string | null>(null);
  const [sortDesc, setSortDesc] = useState<boolean>(false);
  const [showFilters, setShowFilters] = useState(false);

  const handleSearchChange = (val: string) => {
    setSearchValue(val);
    onSearch?.(val);
  };

  const handleSort = (colId: string) => {
    if (sortCol === colId) {
      setSortDesc(!sortDesc);
    } else {
      setSortCol(colId);
      setSortDesc(false);
    }
  };

  const allSelected = useMemo(() => {
    if (data.length === 0) return false;
    return data.every((row) => row.id && selectedRowIds.has(row.id));
  }, [data, selectedRowIds]);

  const handleSelectAll = (checked: boolean) => {
    onSelectAllChange?.(checked);
  };

  const handleClearSelection = () => {
    onSelectAllChange?.(false);
  };

  // Build selected rows array for bulk actions
  const selectedRows = useMemo(() => {
    return data.filter((row) => row.id && selectedRowIds.has(row.id));
  }, [data, selectedRowIds]);

  // Filter hidden columns, then append Actions column
  const hiddenSet = useMemo(() => new Set(hiddenColumnIds), [hiddenColumnIds]);

  const hasActionsCol = !!(rowActions || onView);

  const effectiveColumns: ColumnDef<T>[] = useMemo(() => {
    const visible = columns.filter((col) => {
      const colId = col.id || String(col.accessorKey || '');
      return !hiddenSet.has(colId);
    });
    if (!hasActionsCol) return visible;
    return [
      ...visible,
      {
        header: '',
        id: '__actions__',
        type: 'actions' as ColumnType,
        align: 'center' as const,
      },
    ];
  }, [columns, hasActionsCol, hiddenSet]);

  // Build column options for the customizer dropdown
  const columnOptions = useMemo(() => {
    return columns.map((col) => {
      const colId = col.id || String(col.accessorKey || '');
      return {
        id: colId,
        label: col.header,
        visible: !hiddenSet.has(colId),
        mandatory: mandatoryColumnIds.includes(colId),
      };
    });
  }, [columns, hiddenSet, mandatoryColumnIds]);

  const handleColumnVisibilityChange = (visibleIds: string[]) => {
    const allIds = columns.map((c) => c.id || String(c.accessorKey || ''));
    const newHidden = allIds.filter((id) => !visibleIds.includes(id));
    onColumnVisibilityChange?.(newHidden);
  };

  const colsCount = effectiveColumns.length + (selectable ? 1 : 0);

  return (
    <div
      style={{
        backgroundColor: '#FFFFFF',
        border: '1px solid #E2E8F0',
        borderRadius: '16px',
        overflow: 'hidden',
        boxSizing: 'border-box',
        width: '100%',
        fontFamily: '"Inter", sans-serif',
        boxShadow: '0 1px 3px rgba(15,23,42,0.04), 0 1px 2px rgba(15,23,42,0.02)',
      }}
      className={`enterprise-table-card ${className || ''}`}
    >
      {/* Bulk Actions Bar (replaces toolbar when rows are selected) */}
      {selectable && bulkActions && bulkActions.length > 0 && selectedRowIds.size > 0 ? (
        <TableBulkActions<T>
          selectedCount={selectedRowIds.size}
          actions={bulkActions}
          selectedRows={selectedRows}
          onClearSelection={handleClearSelection}
        />
      ) : (
        /* Toolbar */
        (searchable || (filterOptions && filterOptions.length > 0) || onColumnVisibilityChange || filterPanel) && (
          <TableToolbar
            filterOptions={filterOptions}
            selectedFilterId={selectedFilterId}
            onFilterSelect={onFilterSelect}
            searchValue={searchValue}
            onSearchChange={handleSearchChange}
            searchable={searchable}
            columnOptions={onColumnVisibilityChange ? columnOptions : undefined}
            onColumnVisibilityChange={onColumnVisibilityChange ? handleColumnVisibilityChange : undefined}
            showFilters={showFilters}
            onToggleFilters={filterPanel ? () => setShowFilters(!showFilters) : undefined}
          />
        )
      )}

      {/* Collapsible Filter Panel */}
      {filterPanel && showFilters && (
        <div
          style={{
            padding: '12px 16px',
            backgroundColor: '#FAFAFA',
            borderBottom: '1px solid #F0F0F0',
            boxSizing: 'border-box',
            width: '100%',
            animation: 'filterSlideDown 150ms ease',
          }}
          className="table-filter-panel"
        >
          {filterPanel}
        </div>
      )}

      {/* Table */}
      <div style={{ overflowX: 'auto', width: '100%', minHeight: data.length > 0 ? '200px' : 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'separate', borderSpacing: 0 }}>
          <TableHeader
            columns={effectiveColumns}
            nestedHeaders={nestedHeaders}
            selectable={selectable}
            onSelectAll={handleSelectAll}
            allSelected={allSelected}
            sortCol={sortCol}
            sortDesc={sortDesc}
            onSort={handleSort}
            sortable={sortable}
          />
          <tbody>
            {loading ? (
              <TableSkeleton columnsCount={colsCount} />
            ) : data.length === 0 ? (
              <TableEmpty
                title={emptyTitle}
                subtitle={emptySubtitle}
                actionLabel={emptyActionLabel}
                onAction={onEmptyAction}
                columnsCount={colsCount}
              />
            ) : (
              data.map((row, rIdx) => {
                const isSelected = row.id ? selectedRowIds.has(row.id) : false;
                return (
                  <TableRow
                    key={row.id || rIdx}
                    selected={isSelected}
                    onClick={onRowClick ? () => onRowClick(row) : undefined}
                    className={rowClassName ? rowClassName(row, rIdx) : undefined}
                    style={rowStyle ? rowStyle(row, rIdx) : undefined}
                  >
                    {selectable && (
                      <td
                        style={{
                          textAlign: 'center',
                          paddingLeft: '16px',
                          paddingRight: '16px',
                          verticalAlign: 'middle',
                          borderBottom: rIdx === data.length - 1 ? 'none' : '1px solid #F3F4F6',
                        }}
                        onClick={(e) => e.stopPropagation()}
                      >
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={(e) => onRowSelectChange?.(row, e.target.checked)}
                          style={{
                            width: '16px',
                            height: '16px',
                            borderColor: '#D1D5DB',
                            borderRadius: '4px',
                            cursor: 'pointer',
                          }}
                        />
                      </td>
                    )}
                    {effectiveColumns.map((col, cIdx) => {
                      // Render actions column (View + three-dot menu)
                      if (col.id === '__actions__') {
                        return (
                          <td
                            key="__actions__"
                            style={{
                              textAlign: 'right',
                              padding: '12px 16px',
                              verticalAlign: 'middle',
                              borderBottom: rIdx === data.length - 1 ? 'none' : '1px solid rgba(226,232,240,0.6)',
                              whiteSpace: 'nowrap',
                            }}
                            onClick={(e) => e.stopPropagation()}
                          >
                            <div style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                              {onView && (
                                <button
                                  onClick={() => onView(row)}
                                  title="View details"
                                  style={{
                                    width: '28px',
                                    height: '28px',
                                    borderRadius: '6px',
                                    border: '1px solid transparent',
                                    backgroundColor: 'transparent',
                                    color: '#9CA3AF',
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    cursor: 'pointer',
                                    transition: 'all 150ms ease',
                                    outline: 'none',
                                  }}
                                  className="row-view-btn"
                                >
                                  <Eye size={15} />
                                </button>
                              )}
                              {rowActions && <TableActions actions={rowActions(row)} />}
                            </div>
                          </td>
                        );
                      }

                      const val = col.accessorKey ? row[col.accessorKey] : undefined;
                      const secondaryText = col.secondaryText ? col.secondaryText(row) : undefined;
                      const statusType = col.statusType ? col.statusType(row) : 'neutral';
                      const cellClass = col.cellClassName ? (typeof col.cellClassName === 'function' ? col.cellClassName(row) : col.cellClassName) : undefined;
                      const cellStyle = col.cellStyle ? (typeof col.cellStyle === 'function' ? col.cellStyle(row) : col.cellStyle) : undefined;

                      return (
                        <TableCell
                          key={cIdx}
                          type={col.type}
                          value={
                            col.cell
                              ? col.cell({ row, getValue: () => val })
                              : val !== undefined
                              ? String(val)
                              : ''
                          }
                          align={col.align}
                          secondaryText={secondaryText}
                          statusType={statusType}
                          className={cellClass}
                          style={cellStyle}
                        />
                      );
                    })}
                  </TableRow>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {pagination && onPageChange && (
        <TablePagination
          page={page}
          pageSize={pageSize}
          totalRows={totalRows}
          onPageChange={onPageChange}
          onPageSizeChange={onPageSizeChange}
        />
      )}
      <style>{`
        .table-row-item:hover {
          background-color: #F8FAFC !important;
        }
        .table-row-item:nth-child(even) {
          background-color: rgba(248,250,252,0.4);
        }
        .table-row-item:nth-child(even):hover {
          background-color: #F1F5F9 !important;
        }
        .row-view-btn:hover {
          background-color: #F1F5F9 !important;
          color: #0F172A !important;
        }
        @keyframes filterSlideDown {
          from { opacity: 0; transform: translateY(-8px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
}
