import React from 'react';
import { SlidersHorizontal } from 'lucide-react';
import { TableFilterPills } from './TableFilterPills';
import { TableSearch } from './TableSearch';
import { TableColumnCustomizer } from './TableColumnCustomizer';

interface ColumnOption {
  id: string;
  label: string;
  visible: boolean;
  mandatory?: boolean;
}

interface TableToolbarProps {
  filterOptions?: { id: string; label: string }[];
  selectedFilterId?: string;
  onFilterSelect?: (id: string) => void;
  searchValue: string;
  onSearchChange: (val: string) => void;
  searchPlaceholder?: string;
  searchable?: boolean;
  // Column customizer
  columnOptions?: ColumnOption[];
  onColumnVisibilityChange?: (visibleIds: string[]) => void;
  // Filters panel
  showFilters?: boolean;
  onToggleFilters?: () => void;
}

export const TableToolbar: React.FC<TableToolbarProps> = ({
  filterOptions = [],
  selectedFilterId = '',
  onFilterSelect,
  searchValue,
  onSearchChange,
  searchPlaceholder = 'Search...',
  searchable = true,
  columnOptions,
  onColumnVisibilityChange,
  showFilters = false,
  onToggleFilters,
}) => {
  return (
    <div
      style={{
        height: '52px',
        paddingLeft: '16px',
        paddingRight: '16px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        borderBottom: '1px solid #E2E8F0',
        backgroundColor: '#FFFFFF',
        boxSizing: 'border-box',
      }}
    >
      {/* Left: Filter Pills */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        {filterOptions.length > 0 && onFilterSelect && (
          <TableFilterPills
            options={filterOptions}
            selectedId={selectedFilterId}
            onSelect={onFilterSelect}
          />
        )}
      </div>

      {/* Right: Filter Icon + Search + Columns */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        {onToggleFilters && (
          <button
            onClick={onToggleFilters}
            style={{
              height: '34px',
              width: '34px',
              borderRadius: '8px',
              border: showFilters ? '1px solid #BFDBFE' : '1px solid #E2E8F0',
              backgroundColor: showFilters ? '#EFF6FF' : '#FFFFFF',
              color: showFilters ? '#2563EB' : '#64748B',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              transition: 'all 150ms ease',
              outline: 'none',
              boxSizing: 'border-box',
            }}
            className={showFilters ? '' : 'hover-pill'}
            title="Toggle filters"
          >
            <SlidersHorizontal size={14} />
          </button>
        )}
        {searchable && (
          <TableSearch
            value={searchValue}
            onChange={onSearchChange}
            placeholder={searchPlaceholder}
          />
        )}
        {columnOptions && onColumnVisibilityChange && (
          <TableColumnCustomizer
            columns={columnOptions}
            onChange={onColumnVisibilityChange}
          />
        )}
      </div>
    </div>
  );
};
