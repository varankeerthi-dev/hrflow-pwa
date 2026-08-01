import React, { useState, useRef, useEffect } from 'react';
import { Columns3, Check } from 'lucide-react';

interface ColumnOption {
  id: string;
  label: string;
  visible: boolean;
  mandatory?: boolean;
}

interface TableColumnCustomizerProps {
  columns: ColumnOption[];
  onChange: (visibleIds: string[]) => void;
}

export const TableColumnCustomizer: React.FC<TableColumnCustomizerProps> = ({
  columns,
  onChange,
}) => {
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

  const toggleColumn = (id: string) => {
    const col = columns.find((c) => c.id === id);
    if (!col || col.mandatory) return;

    const newVisible = columns
      .filter((c) => (c.id === id ? !c.visible : c.visible))
      .map((c) => c.id);
    onChange(newVisible);
  };

  const showAll = () => {
    onChange(columns.map((c) => c.id));
  };

  const visibleCount = columns.filter((c) => c.visible).length;

  return (
    <div ref={ref} style={{ position: 'relative', display: 'inline-flex' }}>
      <button
        onClick={() => setOpen(!open)}
        style={{
          height: '34px',
          paddingInline: '10px',
          borderRadius: '8px',
          border: '1px solid #ECECEC',
          backgroundColor: open ? '#F3F4F6' : '#FFFFFF',
          color: '#6B7280',
          display: 'inline-flex',
          alignItems: 'center',
          gap: '6px',
          cursor: 'pointer',
          transition: 'all 150ms ease',
          outline: 'none',
          fontSize: '13px',
          fontWeight: 500,
          boxSizing: 'border-box',
        }}
        className="col-customizer-trigger"
      >
        <Columns3 size={14} />
        <span>Columns</span>
      </button>

      {open && (
        <div
          style={{
            position: 'absolute',
            right: 0,
            top: '100%',
            marginTop: '6px',
            width: '240px',
            backgroundColor: '#FFFFFF',
            border: '1px solid #EAEAEA',
            borderRadius: '12px',
            boxShadow: '0 8px 24px rgba(0,0,0,0.08)',
            zIndex: 60,
            overflow: 'hidden',
            animation: 'colDropIn 150ms ease',
          }}
        >
          {/* Header */}
          <div
            style={{
              padding: '10px 12px',
              borderBottom: '1px solid #F0F0F0',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}
          >
            <span style={{ fontSize: '12px', fontWeight: 600, color: '#111827', letterSpacing: '0.02em' }}>
              Toggle columns
            </span>
            <button
              onClick={showAll}
              style={{
                fontSize: '11px',
                fontWeight: 500,
                color: '#2563EB',
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                padding: '2px 6px',
                borderRadius: '4px',
                transition: 'background-color 150ms ease',
                outline: 'none',
              }}
              className="col-show-all-btn"
            >
              Show all
            </button>
          </div>

          {/* Column list */}
          <div style={{ maxHeight: '280px', overflowY: 'auto', padding: '4px' }}>
            {columns.map((col) => (
              <button
                key={col.id}
                onClick={() => toggleColumn(col.id)}
                disabled={col.mandatory}
                style={{
                  width: '100%',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  padding: '7px 8px',
                  fontSize: '13px',
                  fontWeight: 500,
                  color: col.visible ? '#374151' : '#9CA3AF',
                  backgroundColor: 'transparent',
                  border: 'none',
                  borderRadius: '6px',
                  cursor: col.mandatory ? 'default' : 'pointer',
                  textAlign: 'left',
                  transition: 'background-color 150ms ease',
                  outline: 'none',
                  opacity: col.mandatory ? 0.6 : 1,
                }}
                className={col.mandatory ? '' : 'col-toggle-item'}
              >
                <span
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    width: '16px',
                    height: '16px',
                    borderRadius: '4px',
                    border: col.visible ? '1px solid #2563EB' : '1px solid #D1D5DB',
                    backgroundColor: col.visible ? '#2563EB' : 'transparent',
                    color: '#FFFFFF',
                    flexShrink: 0,
                    transition: 'all 150ms ease',
                  }}
                >
                  {col.visible && <Check size={11} strokeWidth={3} />}
                </span>
                <span style={{ flex: 1, lineHeight: '16px' }}>{col.label}</span>
                {col.mandatory && (
                  <span style={{ fontSize: '10px', color: '#9CA3AF', fontWeight: 400 }}>Required</span>
                )}
              </button>
            ))}
          </div>

          {/* Footer */}
          <div
            style={{
              padding: '8px 12px',
              borderTop: '1px solid #F0F0F0',
              fontSize: '11px',
              color: '#9CA3AF',
              textAlign: 'center',
            }}
          >
            {visibleCount} of {columns.length} columns visible
          </div>
        </div>
      )}

      <style>{`
        @keyframes colDropIn {
          from { opacity: 0; transform: translateY(-4px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .col-customizer-trigger:hover {
          background-color: #F8F8F8 !important;
          border-color: #E5E7EB !important;
        }
        .col-toggle-item:hover {
          background-color: #F9FAFB !important;
        }
        .col-show-all-btn:hover {
          background-color: #EFF6FF !important;
        }
      `}</style>
    </div>
  );
};
