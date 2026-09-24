import React, { useEffect } from 'react'

export default function Modal({ isOpen, onClose, title, children, size = 'xl' }) {
  const maxW = size === '4xl' ? 'max-w-4xl' : size === '3xl' ? 'max-w-3xl' : size === '2xl' ? 'max-w-2xl' : size === 'lg' ? 'max-w-lg' : 'max-w-3xl'

  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden'
    } else {
      document.body.style.overflow = 'unset'
    }
    return () => { document.body.style.overflow = 'unset' }
  }, [isOpen])

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-[1000] bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 sm:p-6">
      <div className="absolute inset-0" onClick={onClose}></div>
      <div className={`relative bg-white text-slate-900 border border-slate-200 rounded-2xl shadow-2xl w-full ${maxW} max-h-[95vh] overflow-hidden flex flex-col z-10`}>
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 shrink-0 bg-white">
          <h3 className="text-lg font-bold text-slate-900 font-heading">{title}</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 text-xl p-2 -mr-2 rounded-lg transition-colors leading-none">×</button>
        </div>
        <div className="flex-1 overflow-auto bg-white">{children}</div>
      </div>
    </div>
  )
}
