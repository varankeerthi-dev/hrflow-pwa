import React from 'react';

interface TableRowProps {
  children: React.ReactNode;
  selected?: boolean;
  onClick?: () => void;
  className?: string;
  style?: React.CSSProperties;
}

export const TableRow: React.FC<TableRowProps> = ({
  children,
  selected = false,
  onClick,
  className,
  style,
}) => {
  return (
    <tr
      onClick={onClick}
      style={{
        height: '44px',
        backgroundColor: selected ? '#F1F5F9' : 'transparent',
        borderBottom: '1px solid rgba(226,232,240,0.6)',
        cursor: onClick ? 'pointer' : 'default',
        transition: 'background-color 150ms ease',
        ...style,
      }}
      className={`table-row-item ${className || ''}`}
    >
      {children}
    </tr>
  );
};
