import React from 'react'

/**
 * Animated Tweening Loader component compatible with shadcn registry specifications.
 * Usage:
 *   import { Loader } from "@/components/loader"
 *   <Loader size={64} />
 */
export function Loader({ size = 64, className = '', strokeWidth = 3, color = 'text-blue-600', ...props }) {
  const dimension = typeof size === 'number' ? `${size}px` : size
  const stroke = strokeWidth || Math.max(2, Math.round(Number(size || 64) / 16))

  return (
    <div
      role="status"
      aria-label="Loading"
      className={`inline-flex items-center justify-center relative select-none ${className}`}
      style={{ width: dimension, height: dimension }}
      {...props}
    >
      <svg
        className="animate-spin"
        viewBox="0 0 48 48"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        style={{
          width: '100%',
          height: '100%',
          animationDuration: '1.2s',
          animationTimingFunction: 'cubic-bezier(0.4, 0, 0.2, 1)',
        }}
      >
        {/* Subtle background track */}
        <circle
          cx="24"
          cy="24"
          r="19"
          stroke="currentColor"
          strokeWidth={stroke}
          className="text-slate-200/80"
          strokeLinecap="round"
        />
        {/* Primary animated tweening stroke */}
        <circle
          cx="24"
          cy="24"
          r="19"
          stroke="currentColor"
          strokeWidth={stroke}
          className={color}
          strokeLinecap="round"
          strokeDasharray="95 150"
          strokeDashoffset="0"
          style={{
            animation: 'tweenly-dash 1.6s ease-in-out infinite alternate',
          }}
        />
      </svg>
      <style>{`
        @keyframes tweenly-dash {
          0% {
            stroke-dasharray: 10 150;
            stroke-dashoffset: 0;
          }
          50% {
            stroke-dasharray: 95 150;
            stroke-dashoffset: -35;
          }
          100% {
            stroke-dasharray: 115 150;
            stroke-dashoffset: -125;
          }
        }
      `}</style>
    </div>
  )
}

export default Loader
