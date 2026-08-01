import React from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';

interface TablePaginationProps {
  page: number;
  pageSize: number;
  totalRows: number;
  onPageChange: (page: number) => void;
  onPageSizeChange?: (size: number) => void;
  entryLabel?: string;
}

export const TablePagination: React.FC<TablePaginationProps> = ({
  page,
  pageSize,
  totalRows,
  onPageChange,
  onPageSizeChange,
  entryLabel = 'entries',
}) => {
  const totalPages = Math.ceil(totalRows / pageSize) || 1;
  const startRow = totalRows === 0 ? 0 : (page - 1) * pageSize + 1;
  const endRow = Math.min(page * pageSize, totalRows);

  return (
    <div
      style={{
        height: '56px',
        padding: '16px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        borderTop: '1px solid #E2E8F0',
        backgroundColor: '#FFFFFF',
        boxSizing: 'border-box',
      }}
    >
      {/* Left: Showing X-Y of Z */}
      <div style={{ fontSize: '13px', color: '#64748B', fontFamily: 'Inter' }}>
        Showing <span style={{ fontWeight: 500, color: '#0F172A' }}>{startRow}–{endRow}</span> of{' '}
        <span style={{ fontWeight: 500, color: '#0F172A' }}>{totalRows}</span>
      </div>

      {/* Right: Rows Per Page + Navigation */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
        {onPageSizeChange && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontSize: '13px', color: '#64748B' }}>Rows per page</span>
            <select
              value={pageSize}
              onChange={(e) => onPageSizeChange(Number(e.target.value))}
              style={{
                height: '32px',
                paddingInline: '8px',
                border: '1px solid #E2E8F0',
                borderRadius: '8px',
                fontSize: '13px',
                color: '#0F172A',
                outline: 'none',
                backgroundColor: '#FFFFFF',
                cursor: 'pointer',
              }}
            >
              {[10, 20, 50, 100].map((sz) => (
                <option key={sz} value={sz}>
                  {sz}
                </option>
              ))}
            </select>
          </div>
        )}

        <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
          {/* Previous Page */}
          <button
            disabled={page === 1}
            onClick={() => onPageChange(page - 1)}
            style={{
              height: '32px',
              minWidth: '32px',
              borderRadius: '8px',
              border: '1px solid #E2E8F0',
              backgroundColor: '#FFFFFF',
              color: '#64748B',
              cursor: page === 1 ? 'not-allowed' : 'pointer',
              opacity: page === 1 ? 0.4 : 1,
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              transition: 'all 150ms ease',
              outline: 'none',
              paddingInline: '8px',
            }}
            className={page === 1 ? '' : 'pagination-btn'}
          >
            <ChevronLeft size={14} style={{ marginRight: '2px' }} />
            <span>Previous</span>
          </button>

          {/* Page Numbers */}
          {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => {
            const isCurrent = p === page;
            return (
              <button
                key={p}
                onClick={() => onPageChange(p)}
                style={{
                  height: '32px',
                  width: '32px',
                  borderRadius: '8px',
                  border: isCurrent ? '1px solid transparent' : '1px solid #E2E8F0',
                  backgroundColor: isCurrent ? '#0F172A' : '#FFFFFF',
                  color: isCurrent ? '#FFFFFF' : '#64748B',
                  fontWeight: isCurrent ? 600 : 500,
                  fontSize: '13px',
                  cursor: 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  transition: 'all 150ms ease',
                  outline: 'none',
                }}
                className={isCurrent ? '' : 'pagination-btn'}
              >
                {p}
              </button>
            );
          })}

          {/* Next Page */}
          <button
            disabled={page === totalPages}
            onClick={() => onPageChange(page + 1)}
            style={{
              height: '32px',
              minWidth: '32px',
              borderRadius: '8px',
              border: '1px solid #E2E8F0',
              backgroundColor: '#FFFFFF',
              color: '#64748B',
              cursor: page === totalPages ? 'not-allowed' : 'pointer',
              opacity: page === totalPages ? 0.4 : 1,
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              transition: 'all 150ms ease',
              outline: 'none',
              paddingInline: '8px',
            }}
            className={page === totalPages ? '' : 'pagination-btn'}
          >
            <span>Next</span>
            <ChevronRight size={14} style={{ marginLeft: '2px' }} />
          </button>
        </div>
      </div>
      <style>{`
        .pagination-btn:hover {
          background-color: #F8F8F8 !important;
        }
      `}</style>
    </div>
  );
};
