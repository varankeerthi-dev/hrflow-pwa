import React from 'react';

/**
 * StatsCard - Reusable card component for displaying statistics
 * @param {Object} props
 * @param {string} props.title - Card title
 * @param {string|number} props.value - Main value to display
 * @param {string} [props.subtitle] - Subtitle text
 * @param {React.ReactNode} [props.icon] - Icon component
 * @param {string} [props.iconColor] - Icon background color class
 * @param {string} [props.className] - Additional CSS classes
 * @param {function} [props.onClick] - Click handler
 */
export default function StatsCard({
  title,
  value,
  subtitle,
  icon,
  iconColor = 'bg-blue-50',
  className = '',
  onClick
}) {
  const content = (
    <div className={`bg-white rounded-2xl p-4 shadow-sm border border-gray-100 ${className}`}>
      <div className="flex items-center gap-2 mb-2">
        {icon && (
          <div className={`w-8 h-8 rounded-lg ${iconColor} flex items-center justify-center`}>
            {React.cloneElement(icon, { size: 16 })}
          </div>
        )}
        <span className="text-xs text-gray-500">{title}</span>
      </div>
      <p className="text-2xl font-bold text-gray-900">{value}</p>
      {subtitle && <p className="text-xs text-gray-400 mt-1">{subtitle}</p>}
    </div>
  );

  return onClick ? (
    <button onClick={onClick} className="w-full">
      {content}
    </button>
  ) : (
    content
  );
}
