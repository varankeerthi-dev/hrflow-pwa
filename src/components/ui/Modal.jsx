import { useEffect } from 'react'

export default function Modal({ isOpen, onClose, title, children, size = 'xl' }) {
  const maxW = size === '2xl' ? 'max-w-2xl' : size === '3xl' ? 'max-w-3xl' : size === 'lg' ? 'max-w-lg' : 'max-w-3xl'

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
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/50" onClick={onClose}></div>
      <div className={`relative bg-white rounded-xl shadow-xl w-full ${maxW} mx-4 max-h-[95vh] overflow-hidden flex flex-col`}>
        <div className="flex items-center justify-between px-6 py-4 border-b shrink-0">
          <h3 className="text-lg font-semibold text-gray-800">{title}</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl">×</button>
        </div>
        <div className="flex-1 overflow-auto">{children}</div>
      </div>
    </div>
  )
}
