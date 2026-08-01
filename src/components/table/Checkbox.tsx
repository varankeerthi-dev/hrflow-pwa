import React from 'react';

interface CheckboxProps extends React.InputHTMLAttributes<HTMLInputElement> {}

export const Checkbox: React.FC<CheckboxProps> = ({ className, ...props }) => {
  return (
    <input
      type="checkbox"
      className="w-4 h-4 rounded border-zinc-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer transition-colors hover:border-indigo-600"
      style={{
        width: '16px',
        height: '16px',
        borderColor: '#D1D5DB',
        borderRadius: '4px',
        cursor: 'pointer',
      }}
      {...props}
    />
  );
};
