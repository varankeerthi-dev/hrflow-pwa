import React from 'react';

interface FilterOption {
  id: string;
  label: string;
}

interface TableFilterPillsProps {
  options: FilterOption[];
  selectedId: string;
  onSelect: (id: string) => void;
}

export const TableFilterPills: React.FC<TableFilterPillsProps> = ({
  options,
  selectedId,
  onSelect,
}) => {
  return (
    <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
      {options.map((opt) => {
        const isSelected = opt.id === selectedId;
        return (
          <button
            key={opt.id}
            onClick={() => onSelect(opt.id)}
            style={{
              height: '30px',
              paddingLeft: '12px',
              paddingRight: '12px',
              borderRadius: '8px',
              fontSize: '13px',
              fontWeight: 500,
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              border: isSelected ? '1px solid #E5E7EB' : '1px solid #ECECEC',
              backgroundColor: isSelected ? '#F3F4F6' : '#FFFFFF',
              color: isSelected ? '#111827' : '#6B7280',
              transition: 'all 150ms ease',
              outline: 'none',
              boxSizing: 'border-box',
            }}
            className={isSelected ? '' : 'hover-pill'}
          >
            {opt.label}
          </button>
        );
      })}
      <style>{`
        .hover-pill:hover {
          background-color: #F8F8F8 !important;
        }
      `}</style>
    </div>
  );
};
