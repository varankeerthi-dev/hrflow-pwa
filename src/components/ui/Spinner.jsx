import React from 'react'

export default function Spinner({ size = 'md', color = 'border-t-indigo-500' }) {
  const sizeClasses = {
    sm: 'w-4 h-4',
    md: 'w-8 h-8',
    lg: 'w-12 h-12',
  }
  
  const finalSizeClass = sizeClasses[size] || size

  return (
    <div className={`${finalSizeClass} border-2 border-indigo-200 ${color} rounded-full animate-spin`}></div>
  )
}
