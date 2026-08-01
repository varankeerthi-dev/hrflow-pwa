import React from 'react';
import { Search } from 'lucide-react';

interface TableSearchProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}

export const TableSearch: React.FC<TableSearchProps> = ({
  value,
  onChange,
  placeholder = 'Search...',
}) => {
  return (
    <div style={{ position: 'relative', width: '240px' }}>
      <Search
        size={14}
        style={{
          position: 'absolute',
          left: '10px',
          top: '50%',
          transform: 'translateY(-50%)',
          color: '#9CA3AF',
          pointerEvents: 'none',
        }}
      />
      <input
        type="text"
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        style={{
          width: '100%',
          height: '34px',
          paddingLeft: '32px',
          paddingRight: '12px',
          fontSize: '13px',
          color: '#111827',
          backgroundColor: '#FFFFFF',
          border: '1px solid #ECECEC',
          borderRadius: '8px',
          outline: 'none',
          boxSizing: 'border-box',
          transition: 'border-color 200ms ease',
        }}
        onFocus={(e) => (e.currentTarget.style.borderColor = '#2563EB')}
        onBlur={(e) => (e.currentTarget.style.borderColor = '#ECECEC')}
      />
    </div>
  );
};
