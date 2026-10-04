import React, { useEffect, useId, useRef } from 'react'

export default function Modal({ isOpen, onClose, title, children, size = 'xl' }) {
  const maxW = size === '4xl' ? 'max-w-4xl' : size === '3xl' ? 'max-w-3xl' : size === '2xl' ? 'max-w-2xl' : size === 'lg' ? 'max-w-lg' : 'max-w-3xl'
  const dialogRef = useRef(null)
  const onCloseRef = useRef(onClose)
  const titleId = useId()

  useEffect(() => {
    onCloseRef.current = onClose
  }, [onClose])

  useEffect(() => {
    if (!isOpen) return undefined

    const previousFocus = document.activeElement
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    const dialog = dialogRef.current
    const focusableSelector = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
    const focusable = dialog?.querySelectorAll(focusableSelector)
    ;(focusable?.[0] || dialog)?.focus()

    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        onCloseRef.current?.()
        return
      }
      if (event.key !== 'Tab' || !dialog) return

      const items = [...dialog.querySelectorAll(focusableSelector)]
      if (items.length === 0) {
        event.preventDefault()
        dialog.focus()
        return
      }
      const first = items[0]
      const last = items[items.length - 1]
      if (event.shiftKey && (document.activeElement === first || document.activeElement === dialog)) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('keydown', handleKeyDown)
      document.body.style.overflow = previousOverflow
      if (previousFocus && typeof previousFocus.focus === 'function') previousFocus.focus()
    }
  }, [isOpen])

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-[1000] bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 sm:p-6">
      <div className="absolute inset-0" aria-hidden="true" onClick={onClose}></div>
      <div ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby={titleId} tabIndex={-1} className={`relative bg-white text-slate-900 border border-slate-200/90 rounded-2xl shadow-2xl w-full ${maxW} max-h-[95vh] overflow-hidden flex flex-col z-10`}>
        <div className="flex items-center justify-between px-5 py-3.5 sm:px-6 sm:py-4 border-b border-slate-200 shrink-0 bg-white">
          <h3 id={titleId} className="text-base sm:text-lg font-bold text-slate-900 font-heading">{title}</h3>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close dialog"
            className="min-w-11 min-h-11 flex items-center justify-center -mr-2 text-slate-400 hover:text-slate-700 hover:bg-slate-100 active:scale-[0.96] rounded-xl transition-[color,background-color,transform] duration-150 text-2xl font-light leading-none cursor-pointer"
          >
            ×
          </button>
        </div>
        <div className="flex-1 overflow-auto bg-white">{children}</div>
      </div>
    </div>
  )
}
