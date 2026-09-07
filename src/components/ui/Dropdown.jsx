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
  autoFocusSearch = true,
  onKeyDown,
  zIndex = 99999,
  columns = 1,
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
    const popupWidth = panelWidth.includes('w-80') ? 320 : panelWidth.includes('w-96') ? 384 : (columns === 2 ? 320 : 288)
    let leftPos = rect.left
    if (leftPos + popupWidth > window.innerWidth - 10) {
      leftPos = Math.max(10, window.innerWidth - popupWidth - 10)
    }
    let topPos = rect.bottom + 4
    if (topPos + 260 > window.innerHeight - 10 && rect.top > 260) {
      topPos = Math.max(10, rect.top - 264)
    }
    setPosition({ top: topPos, left: leftPos })
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

  const handleButtonKeyDown = (e) => {
    if (onKeyDown) onKeyDown(e)
    if (e.defaultPrevented) return

    if (e.key === 'Enter' || e.key === ' ' || e.key === 'ArrowDown') {
      if (!isOpen) {
        e.preventDefault()
        openDropdown()
        return
      }
    }

    if (e.key === 'Escape' && isOpen) {
      e.preventDefault()
      handleClose()
      return
    }

    // Type-to-select: typing a letter or number selects the matching option (cycles if repeatedly pressed)
    if (e.key.length === 1 && !e.ctrlKey && !e.altKey && !e.metaKey) {
      const char = e.key.toLowerCase()
      const matches = normalized.filter(o => (o.label || '').toLowerCase().startsWith(char))
      if (matches.length > 0) {
        e.preventDefault()
        const currentIndex = matches.findIndex(o => o.value === value)
        const nextMatch = currentIndex >= 0 && currentIndex < matches.length - 1
          ? matches[currentIndex + 1]
          : matches[0]
        handleSelect(nextMatch.value)
      }
    }
  }

  return (
    <div className={`relative ${className}`}>
      <button
        ref={triggerRef}
        type="button"
        disabled={disabled}
        onKeyDown={handleButtonKeyDown}
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
          <div className="fixed inset-0" style={{ zIndex: zIndex - 1 }} onClick={handleClose} />
          <div
            className={`fixed bg-white rounded-xl border border-zinc-200 shadow-2xl ${panelWidth} ${mobileMenu ? 'animate-in fade-in zoom-in-95 duration-100' : ''}`}
            style={{ top: position.top, left: position.left, zIndex }}
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
                    autoFocus={autoFocusSearch}
                    className="w-full h-8 pl-8 pr-2 border border-zinc-200 rounded-lg text-xs outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
              </div>
            )}

            <div className={`max-h-64 overflow-y-auto py-1 slim-scrollbar ${columns === 2 ? 'grid grid-cols-2 gap-1 p-1.5' : ''}`}>
              {allowCustom && (
                <button
                  type="button"
                  onClick={handleAddOther}
                  className={`px-2 py-1.5 text-left text-xs font-medium text-indigo-600 hover:bg-indigo-50/70 flex items-center gap-1.5 border-b border-zinc-100 ${columns === 2 ? 'col-span-2 w-full mb-1 rounded-lg' : 'w-full'}`}
                >
                  <Plus className="w-3.5 h-3.5" />
                  Add Other...
                </button>
              )}

              {filtered.length === 0 ? (
                <div className={`px-3 py-3 text-xs text-zinc-400 text-center ${columns === 2 ? 'col-span-2' : ''}`}>
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
                      className={`w-full px-2 py-1.5 text-left text-xs hover:bg-zinc-100 flex items-center justify-between transition-colors ${
                        columns === 2 ? 'rounded-lg border border-slate-100' : ''
                      } ${
                        selected ? 'bg-emerald-50 text-emerald-800 font-semibold border-emerald-200' : 'text-zinc-700'
                      }`}
                    >
                      <span className="font-medium truncate">{o.label}</span>
                      {selected && <Check className="w-3.5 h-3.5 text-emerald-600 shrink-0" />}
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
