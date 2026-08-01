import React from 'react';

export type StatusType = 'success' | 'blue' | 'warning' | 'error' | 'neutral';

interface StatusBadgeProps {
  status: StatusType;
  children: React.ReactNode;
}

const statusStyles: Record<StatusType, { bg: string; text: string }> = {
  success: { bg: '#DCFCE7', text: '#15803D' },
  blue: { bg: '#DBEAFE', text: '#2563EB' },
  warning: { bg: '#FEF3C7', text: '#D97706' },
  error: { bg: '#FEE2E2', text: '#DC2626' },
  neutral: { bg: '#F3F4F6', text: '#6B7280' },
};

export const StatusBadge: React.FC<StatusBadgeProps> = ({ status, children }) => {
  const style = statusStyles[status] || statusStyles.neutral;
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        height: '22px',
        paddingLeft: '10px',
        paddingRight: '10px',
        borderRadius: '999px',
        fontSize: '12px',
        fontWeight: 500,
        backgroundColor: style.bg,
        color: style.text,
        userSelect: 'none',
        lineHeight: 1,
      }}
    >
      {children}
    </span>
  );
};
