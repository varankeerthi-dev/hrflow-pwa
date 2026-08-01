import React from 'react';
import { StatusBadge, StatusType } from './StatusBadge';

export type ColumnType = 'id' | 'text' | 'money' | 'date' | 'status' | 'number' | 'checkbox' | 'actions';

interface TableCellProps {
  type?: ColumnType;
  value: any;
  align?: 'left' | 'right' | 'center';
  secondaryText?: string;
  statusType?: StatusType;
  className?: string;
  style?: React.CSSProperties;
}

export const TableCell: React.FC<TableCellProps> = ({
  type = 'text',
  value,
  align,
  secondaryText,
  statusType = 'neutral',
  className,
  style,
}) => {
  const isNumeric = type === 'money' || type === 'number';
  const defaultAlign = align || (isNumeric ? 'right' : type === 'checkbox' || type === 'status' || type === 'actions' ? 'center' : 'left');

  const getStyle = (): React.CSSProperties => {
    const base: React.CSSProperties = {
      padding: '8px 16px',
      fontSize: '13px',
      verticalAlign: 'middle',
      boxSizing: 'border-box',
      textAlign: defaultAlign,
    };

    if (type === 'id') {
      return {
        ...base,
        fontWeight: 600,
        color: '#475569', // text-slate-600
      };
    }

    if (type === 'money' || type === 'number') {
      return {
        ...base,
        fontVariantNumeric: 'tabular-nums',
        fontWeight: 500,
        fontSize: '14px', // Numbers: 14px
        color: '#334155', // text-slate-700
      };
    }

    if (type === 'date') {
      return {
        ...base,
        color: '#64748B', // text-slate-500
      };
    }

    return {
      ...base,
      color: '#334155', // text-slate-700
      fontWeight: 500,
    };
  };

  const renderContent = () => {
    if (type === 'status') {
      return <StatusBadge status={statusType}>{value}</StatusBadge>;
    }

    if (secondaryText) {
      return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
          <span>{value}</span>
          <span style={{ fontSize: '11px', fontWeight: 400, color: '#64748B' }}>
            {secondaryText}
          </span>
        </div>
      );
    }

    return value;
  };

  return <td className={className} style={{ ...getStyle(), ...style }}>{renderContent()}</td>;
};
