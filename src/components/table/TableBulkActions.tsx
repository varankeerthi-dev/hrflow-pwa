import React from 'react';
import { X } from 'lucide-react';

export interface BulkAction<T> {
  label: string;
  onClick: (selectedRows: T[]) => void;
  variant?: 'default' | 'primary' | 'danger';
  icon?: React.ReactNode;
}

interface TableBulkActionsProps<T> {
  selectedCount: number;
  actions: BulkAction<T>[];
  selectedRows: T[];
  onClearSelection: () => void;
}

export function TableBulkActions<T>({
  selectedCount,
  actions,
  selectedRows,
  onClearSelection,
}: TableBulkActionsProps<T>) {
  if (selectedCount === 0) return null;

  const getButtonStyle = (variant: BulkAction<T>['variant']): React.CSSProperties => {
    if (variant === 'danger') {
      return {
        backgroundColor: '#FEF2F2',
        color: '#DC2626',
        border: '1px solid #FECACA',
      };
    }
    if (variant === 'primary') {
      return {
        backgroundColor: '#111827',
        color: '#FFFFFF',
        border: '1px solid transparent',
      };
    }
    return {
      backgroundColor: '#FFFFFF',
      color: '#374151',
      border: '1px solid #E5E7EB',
    };
  };

  return (
    <div
      style={{
        height: '52px',
        paddingLeft: '16px',
        paddingRight: '16px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        backgroundColor: '#F8FAFC',
        borderBottom: '1px solid #E2E8F0',
        boxSizing: 'border-box',
        animation: 'bulkBarSlideIn 200ms ease',
      }}
    >
      {/* Left: selection count + clear */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            fontSize: '13px',
            fontWeight: 500,
            color: '#1E293B',
          }}
        >
          <span
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              minWidth: '22px',
              height: '22px',
              borderRadius: '6px',
              backgroundColor: '#2563EB',
              color: '#FFFFFF',
              fontSize: '12px',
              fontWeight: 600,
              paddingInline: '6px',
            }}
          >
            {selectedCount}
          </span>
          selected
        </div>
        <button
          onClick={onClearSelection}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '4px',
            padding: '4px 8px',
            border: 'none',
            borderRadius: '6px',
            backgroundColor: 'transparent',
            color: '#6B7280',
            fontSize: '12px',
            fontWeight: 500,
            cursor: 'pointer',
            transition: 'all 150ms ease',
            outline: 'none',
          }}
          className="bulk-clear-btn"
        >
          <X size={12} />
          Clear
        </button>
      </div>

      {/* Right: action buttons */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        {actions.map((action, idx) => (
          <button
            key={idx}
            onClick={() => action.onClick(selectedRows)}
            style={{
              height: '32px',
              paddingInline: '14px',
              borderRadius: '8px',
              fontSize: '13px',
              fontWeight: 500,
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              transition: 'all 150ms ease',
              outline: 'none',
              lineHeight: 1,
              ...getButtonStyle(action.variant),
            }}
            className="bulk-action-btn"
          >
            {action.icon && (
              <span style={{ display: 'inline-flex', flexShrink: 0 }}>{action.icon}</span>
            )}
            {action.label}
          </button>
        ))}
      </div>

      <style>{`
        @keyframes bulkBarSlideIn {
          from { opacity: 0; transform: translateY(-4px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .bulk-clear-btn:hover {
          background-color: #F3F4F6 !important;
          color: #374151 !important;
        }
        .bulk-action-btn:hover {
          opacity: 0.85;
        }
      `}</style>
    </div>
  );
}
