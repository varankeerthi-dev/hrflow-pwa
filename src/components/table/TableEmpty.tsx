import React from 'react';
import { Database } from 'lucide-react';

interface TableEmptyProps {
  title?: string;
  subtitle?: string;
  actionLabel?: string;
  onAction?: () => void;
  columnsCount: number;
}

export const TableEmpty: React.FC<TableEmptyProps> = ({
  title = 'No data available',
  subtitle = 'There are no records to display at this moment.',
  actionLabel,
  onAction,
  columnsCount,
}) => {
  return (
    <tr>
      <td colSpan={columnsCount} style={{ padding: '64px 24px', backgroundColor: '#FFFFFF' }}>
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            textAlign: 'center',
            fontFamily: 'Inter',
          }}
        >
          <div
            style={{
              width: '48px',
              height: '48px',
              borderRadius: '12px',
              backgroundColor: '#F9FAFB',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#9CA3AF',
              marginBottom: '16px',
            }}
          >
            <Database size={24} />
          </div>

          <h3
            style={{
              fontSize: '15px',
              fontWeight: 600,
              color: '#111827',
              margin: '0 0 6px 0',
            }}
          >
            {title}
          </h3>

          <p
            style={{
              fontSize: '13px',
              color: '#6B7280',
              margin: '0 0 20px 0',
              maxWidth: '320px',
              lineHeight: '18px',
            }}
          >
            {subtitle}
          </p>

          {actionLabel && onAction && (
            <button
              onClick={onAction}
              style={{
                height: '36px',
                paddingInline: '16px',
                backgroundColor: '#111827',
                color: '#FFFFFF',
                border: 'none',
                borderRadius: '8px',
                fontSize: '13px',
                fontWeight: 500,
                cursor: 'pointer',
                transition: 'background-color 150ms ease',
                outline: 'none',
              }}
              onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#1F2937')}
              onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = '#111827')}
            >
              {actionLabel}
            </button>
          )}
        </div>
      </td>
    </tr>
  );
};
