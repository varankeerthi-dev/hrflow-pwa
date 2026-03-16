import React from 'react'

export const Card = ({ children, className = '', noPadding = false }) => {
  return (
    <div className={`bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden ${className}`}>
      <div className={noPadding ? '' : 'p-6'}>
        {children}
      </div>
    </div>
  )
}

export const Button = ({ 
  children, 
  variant = 'primary', 
  size = 'md', 
  className = '', 
  icon: Icon, 
  loading = false,
  ...props 
}) => {
  const baseStyles = 'inline-flex items-center justify-center font-bold uppercase tracking-widest transition-all focus:outline-none focus:ring-2 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed'
  
  const variants = {
    primary: 'bg-indigo-600 text-white hover:bg-indigo-700 focus:ring-indigo-500 shadow-md',
    secondary: 'bg-white text-indigo-600 border border-indigo-100 hover:bg-indigo-50 focus:ring-indigo-500',
    outline: 'bg-transparent text-gray-600 border border-gray-200 hover:bg-gray-50 focus:ring-gray-500',
    danger: 'bg-red-600 text-white hover:bg-red-700 focus:ring-red-500 shadow-md',
    ghost: 'bg-transparent text-gray-500 hover:bg-gray-100 focus:ring-gray-500',
    success: 'bg-emerald-600 text-white hover:bg-emerald-700 focus:ring-emerald-500 shadow-md',
  }

  const sizes = {
    xs: 'px-2.5 py-1.5 text-[9px] h-7',
    sm: 'px-3 py-2 text-[10px] h-8',
    md: 'px-4 py-2.5 text-[11px] h-10',
    lg: 'px-6 py-3 text-xs h-12',
  }

  return (
    <button 
      className={`${baseStyles} ${variants[variant]} ${sizes[size]} rounded-lg ${className}`}
      disabled={loading || props.disabled}
      {...props}
    >
      {loading ? (
        <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin mr-2" />
      ) : Icon && <Icon size={size === 'xs' ? 12 : 14} className="mr-2" />}
      {children}
    </button>
  )
}

export const EmptyState = ({ 
  icon: Icon, 
  title, 
  description, 
  actionLabel, 
  onAction,
  className = ''
}) => {
  return (
    <div className={`flex flex-col items-center justify-center p-12 text-center bg-gray-50/50 rounded-2xl border-2 border-dashed border-gray-200 ${className}`}>
      {Icon && (
        <div className="w-16 h-16 bg-white rounded-full flex items-center justify-center shadow-sm border border-gray-100 mb-4">
          <Icon className="text-gray-400" size={32} />
        </div>
      )}
      <h3 className="text-sm font-bold text-gray-900 uppercase tracking-tight mb-1">{title}</h3>
      <p className="text-xs text-gray-500 max-w-xs mx-auto mb-6">{description}</p>
      {actionLabel && onAction && (
        <Button variant="secondary" size="sm" onClick={onAction}>
          {actionLabel}
        </Button>
      )}
    </div>
  )
}
