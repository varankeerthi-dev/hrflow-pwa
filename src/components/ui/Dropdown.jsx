import React, { useState, useRef, useMemo } from 'react'
import { createPortal } from 'react-dom'
import { Search, Check, ChevronDown, Plus } from 'lucide-react'

export default function Dropdown({
  value,
  onChange,
  options = [],
  placeholder = 'Select...',
  searchable = false,
  allowCustom = false,
  onAddOther,
  customActive = false,
  disabled = false,
  size = 'md',
  className = '',
  panelWidth = 'w-44',
  emptyText = 'No options',
  mobileMenu = false,
}) {
  const [isOpen, setIsOpen] = useState(false)
  const [searchTerm, setSearchTerm] = useState('')
  const [triggerVisible, setTriggerVisible] = useState(false)
  const [position, setPosition] = useState({ top: 0, left: 0 })
  const triggerRef = useRef(null)
  const searchRef = useRef(null)

  const normalized = useMemo(
    () => options.map(o => (typeof o === 'string' ? { label: o, value: o } : o)),
    [options]
  )

  const filtered = useMemo(() => {
    if (!searchTerm.trim()) return normalized
    const q = searchTerm.toLowerCase()
    return normalized.filter(o => o.label?.toLowerCase().includes(q) || o.value?.toLowerCase().includes(q))
  }, [normalized, searchTerm])

  const openDropdown = () => {
    const rect = triggerRef.current?.getBoundingClientRect()
    if (!rect || (rect.width === 0 && rect.height === 0)) {
      setTriggerVisible(false)
      return
    }
    setTriggerVisible(true)
    setPosition({ top: rect.bottom + 4, left: rect.left })
    setSearchTerm('')
    setIsOpen(true)
  }

  const handleClose = () => {
    setIsOpen(false)
    setSearchTerm('')
  }

  const handleSelect = (val) => {
    onChange(val)
    handleClose()
  }

  const handleAddOther = () => {
    handleClose()
    if (onAddOther) onAddOther()
  }

  const displayValue = (() => {
    if (value === null || value === undefined || value === '') return placeholder
    const hit = normalized.find(o => o.value === value)
    return hit ? hit.label : value
  })()

  const sizeClass = size === 'xs'
    ? 'h-9 px-2 text-[12px]'
    : size === 'sm'
      ? 'h-10 px-3 text-[13px]'
      : 'h-11 px-3 text-sm'

  return (
    <div className={`relative ${className}`}>
      <button
        ref={triggerRef}
        type="button"
        disabled={disabled}
        onClick={() => {
          if (isOpen) {
            handleClose()
          } else {
            openDropdown()
          }
        }}
        className={`w-full border border-zinc-200 rounded-lg font-medium outline-none focus:ring-2 focus:ring-indigo-500 bg-white transition-colors flex items-center justify-between ${
          sizeClass
        } ${disabled ? 'opacity-60 cursor-not-allowed' : ''} ${customActive ? 'text-indigo-600' : 'text-zinc-800'}`}
      >
        <span className="truncate">{displayValue}</span>
        <ChevronDown
          className={`w-4 h-4 text-zinc-400 shrink-0 transition-transform ${isOpen ? 'rotate-180' : ''}`}
        />
      </button>

      {isOpen && triggerVisible && createPortal(
        <>
          <div className="fixed inset-0 z-40" onClick={handleClose} />
          <div
            className={`fixed z-50 bg-white rounded-xl border border-zinc-200 shadow-2xl ${panelWidth} ${mobileMenu ? 'animate-in fade-in zoom-in-95 duration-100' : ''}`}
            style={{ top: position.top, left: position.left }}
          >
            {searchable && (
              <div className="p-2 border-b border-zinc-100">
                <div className="relative">
                  <Search className="absolute left-2.5 top-1/2 transform -translate-y-1/2 w-3.5 h-3.5 text-zinc-400" />
                  <input
                    ref={searchRef}
                    type="text"
                    placeholder="Search..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    autoFocus
                    className="w-full h-8 pl-8 pr-2 border border-zinc-200 rounded-lg text-xs outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
              </div>
            )}

            <div className="max-h-60 overflow-y-auto py-1">
              {allowCustom && (
                <button
                  type="button"
                  onClick={handleAddOther}
                  className="w-full px-2 py-1.5 text-left text-xs font-medium text-zinc-600 hover:bg-zinc-100 flex items-center gap-1.5 border-b border-zinc-100"
                >
                  <Plus className="w-3.5 h-3.5" />
                  Add Other...
                </button>
              )}

              {filtered.length === 0 ? (
                <div className="px-3 py-3 text-xs text-zinc-400 text-center">
                  {emptyText}
                </div>
              ) : (
                filtered.map(o => {
                  const selected = o.value === value
                  return (
                    <button
                      key={o.value}
                      type="button"
                      onClick={() => handleSelect(o.value)}
                      className={`w-full px-2 py-1.5 text-left text-xs hover:bg-zinc-100 flex items-center justify-between ${
                        selected ? 'bg-zinc-100 text-zinc-800' : 'text-zinc-700'
                      }`}
                    >
                      <span className="font-medium truncate">{o.label}</span>
                      {selected && <Check className="w-3.5 h-3.5 text-zinc-600 shrink-0" />}
                    </button>
                  )
                })
              )}
            </div>
          </div>
        </>,
        document.body
      )}
    </div>
  )
}
