import React, { useState, useEffect, useRef } from 'react'
import { ChevronDown, X, Check } from 'lucide-react'

export default function RemarksDropdown({ value, onChange, options = [], disabled, className }) {
  const [isOpen, setIsOpen] = useState(false)
  const [searchTerm, setSearchTerm] = useState('')
  const containerRef = useRef(null)
  const inputRef = useRef(null)

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setIsOpen(false)
        setSearchTerm('')
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const filteredOptions = options.filter(opt =>
    opt.toLowerCase().includes(searchTerm.toLowerCase())
  )

  const exactMatch = options.some(opt => opt.toLowerCase() === searchTerm.toLowerCase())
  const showAddNew = searchTerm.trim() !== '' && !exactMatch

  const handleSelect = (val) => {
    onChange(val)
    setIsOpen(false)
    setSearchTerm('')
  }

  return (
    <div className={`relative w-full ${className || ''}`} ref={containerRef}>
      <div
        className={`w-full min-h-[28px] bg-zinc-100 border rounded-md px-2 py-1 flex items-center gap-1 cursor-pointer transition-colors ${
          isOpen ? 'border-indigo-300 bg-white ring-1 ring-indigo-100' : 'border-zinc-200 hover:bg-zinc-200/70'
        }`}
        onClick={() => {
          if (disabled) return
          setIsOpen(true)
          setTimeout(() => inputRef.current?.focus(), 10)
        }}
      >
        {value ? (
          <span className="inline-flex items-center gap-1 bg-indigo-100 text-indigo-800 text-[11px] font-medium px-2 py-0.5 rounded">
            {value}
            <button
              onClick={(e) => {
                e.stopPropagation()
                onChange('')
              }}
              className="hover:bg-indigo-200 rounded-full p-0.5"
            >
              <X size={10} />
            </button>
          </span>
        ) : (
          <span className="text-xs text-zinc-400">Add remark...</span>
        )}
        <input
          ref={inputRef}
          type="text"
          value={searchTerm}
          onChange={(e) => {
            setSearchTerm(e.target.value)
            if (!isOpen) setIsOpen(true)
          }}
          onFocus={() => !disabled && setIsOpen(true)}
          disabled={disabled}
          className="border-none bg-transparent p-0 text-xs focus:ring-0 text-zinc-700 w-full outline-none min-w-[60px]"
        />
        <ChevronDown size={12} className={`text-zinc-400 shrink-0 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </div>

      {isOpen && (
        <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-zinc-200 rounded-md shadow-xl z-[50] max-h-56 overflow-auto">
          {filteredOptions.length > 0 ? (
            filteredOptions.map((opt, idx) => (
              <div
                key={idx}
                className="px-3 py-2 text-xs text-zinc-700 hover:bg-indigo-50 cursor-pointer flex items-center justify-between gap-2"
                onClick={() => handleSelect(opt)}
              >
                <span className="truncate">{opt}</span>
                {value === opt && <Check size={12} className="text-indigo-600 shrink-0" />}
              </div>
            ))
          ) : options.length === 0 ? (
            <div className="px-3 py-3 text-xs text-zinc-400 italic text-center">
              No options saved yet.<br />
              <span className="text-[10px]">Add them in Settings → Organization</span>
            </div>
          ) : null}

          {showAddNew && (
            <div
              className="px-3 py-2 text-xs text-indigo-700 bg-indigo-50/50 hover:bg-indigo-100 cursor-pointer border-t border-zinc-100 flex items-center gap-2"
              onClick={() => handleSelect(searchTerm.trim())}
            >
              <span className="font-bold">+</span>
              <span>Use "<span className="font-semibold">{searchTerm.trim()}</span>" as custom remark</span>
            </div>
          )}
        </div>
      )}
    </div>
  )
}