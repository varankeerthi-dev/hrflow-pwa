import React, { useState, useRef, useEffect } from 'react';
import { MoreHorizontal } from 'lucide-react';

export interface RowAction {
  label: string;
  onClick: () => void;
  variant?: 'default' | 'danger';
  icon?: React.ReactNode;
}

interface TableActionsProps {
  actions: RowAction[];
}

export const TableActions: React.FC<TableActionsProps> = ({ actions }) => {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    if (open) document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  if (actions.length === 0) return null;

  return (
    <div ref={ref} style={{ position: 'relative', display: 'inline-flex' }}>
      <button
        onClick={(e) => {
          e.stopPropagation();
          setOpen(!open);
        }}
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
        className="row-action-trigger"
      >
        <MoreHorizontal size={16} />
      </button>

      {open && (
        <div
          style={{
            position: 'absolute',
            right: 0,
            top: '100%',
            marginTop: '4px',
            minWidth: '160px',
            backgroundColor: '#FFFFFF',
            border: '1px solid #EAEAEA',
            borderRadius: '10px',
            boxShadow: '0 4px 16px rgba(0,0,0,0.08)',
            zIndex: 50,
            padding: '4px',
            overflow: 'hidden',
          }}
        >
          {actions.map((action, idx) => (
            <button
              key={idx}
              onClick={(e) => {
                e.stopPropagation();
                action.onClick();
                setOpen(false);
              }}
              style={{
                width: '100%',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                padding: '8px 10px',
                fontSize: '13px',
                fontWeight: 500,
                color: action.variant === 'danger' ? '#DC2626' : '#374151',
                backgroundColor: 'transparent',
                border: 'none',
                borderRadius: '6px',
                cursor: 'pointer',
                textAlign: 'left',
                transition: 'background-color 150ms ease',
                outline: 'none',
                lineHeight: '16px',
              }}
              className="row-action-item"
            >
              {action.icon && (
                <span style={{ display: 'inline-flex', flexShrink: 0, color: 'inherit' }}>
                  {action.icon}
                </span>
              )}
              {action.label}
            </button>
          ))}
        </div>
      )}

      <style>{`
        .row-action-trigger:hover {
          background-color: #F3F4F6 !important;
          border-color: #E5E7EB !important;
          color: #374151 !important;
        }
        .row-action-item:hover {
          background-color: #F9FAFB !important;
        }
      `}</style>
    </div>
  );
};
