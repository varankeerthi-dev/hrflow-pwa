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
        height: '46px',
        backgroundColor: selected ? '#F8FAFC' : 'transparent',
        borderBottom: '1px solid #F3F4F6',
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
