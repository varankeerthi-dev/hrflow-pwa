import React, { useState, useEffect, useRef } from 'react'
import { X, Check } from 'lucide-react'

export default function RemarksDropdown({ value, onChange, onAddOption, options = [], disabled, className }) {
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

  useEffect(() => {
    if (disabled) {
      setIsOpen(false)
      setSearchTerm('')
    }
  }, [disabled])

  // Parse comma-separated value into array
  const selectedValues = value ? value.split(',').map(v => v.trim()).filter(Boolean) : []

  const filteredOptions = options.filter(opt =>
    opt.toLowerCase().includes(searchTerm.toLowerCase())
  )

  const exactMatch = options.some(opt => opt.toLowerCase() === searchTerm.toLowerCase())
  const showAddNew = searchTerm.trim() !== '' && !exactMatch && !disabled

  const handleSelect = (val) => {
    if (disabled) return
    let newSelected
    if (selectedValues.includes(val)) {
      // Remove
      newSelected = selectedValues.filter(v => v !== val)
    } else {
      // Add
      newSelected = [...selectedValues, val]
    }
    onChange(newSelected.join(', '))
    setSearchTerm('')
    inputRef.current?.focus()
  }

  const handleAddNew = (val) => {
    if (disabled) return
    const trimmed = val.trim()
    if (onAddOption) onAddOption(trimmed)
    
    // Select it as well
    if (!selectedValues.includes(trimmed)) {
      const newSelected = [...selectedValues, trimmed]
      onChange(newSelected.join(', '))
    }
    setSearchTerm('')
    inputRef.current?.focus()
  }

  const handleRemove = (e, valToRemove) => {
    e.stopPropagation()
    if (disabled) return
    const newSelected = selectedValues.filter(v => v !== valToRemove)
    onChange(newSelected.join(', '))
  }

  return (
    <div className={`relative w-full ${className || ''}`} ref={containerRef}>
      <div
        className={`w-full min-h-[28px] border rounded-md px-2 py-1 flex items-center gap-1 flex-wrap transition-colors ${
          disabled
            ? 'bg-zinc-50 border-zinc-100 cursor-not-allowed opacity-60'
            : isOpen
              ? 'bg-white border-indigo-300 ring-1 ring-indigo-100 cursor-text'
              : 'bg-zinc-100 border-zinc-200 hover:bg-zinc-200/70 cursor-text'
        }`}
        onClick={() => {
          if (disabled) return
          setIsOpen(true)
          setTimeout(() => inputRef.current?.focus(), 10)
        }}
      >
        {selectedValues.map((val, i) => (
          <span key={i} className={`inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded ${disabled ? 'bg-zinc-200 text-zinc-500' : 'bg-indigo-100 text-indigo-800'}`}>
            {val}
            {!disabled && (
              <button
                onClick={(e) => handleRemove(e, val)}
                className="hover:bg-indigo-200 rounded-full p-0.5"
              >
                <X size={10} />
              </button>
            )}
          </span>
        ))}
        <input
          ref={inputRef}
          type="text"
          value={searchTerm}
          onChange={(e) => {
            if (disabled) return
            setSearchTerm(e.target.value)
            if (!isOpen) setIsOpen(true)
          }}
          onFocus={() => !disabled && setIsOpen(true)}
          disabled={disabled}
          placeholder={selectedValues.length === 0 ? "Select or type..." : ""}
          className="border-none bg-transparent p-0 text-xs focus:ring-0 text-zinc-700 outline-none flex-1 min-w-[60px] disabled:cursor-not-allowed"
        />
      </div>

      {isOpen && !disabled && (
        <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-zinc-200 rounded-md shadow-xl z-[50] max-h-56 overflow-auto">
          {filteredOptions.length > 0 ? (
            filteredOptions.map((opt, idx) => {
              const isSelected = selectedValues.includes(opt)
              return (
                <div
                  key={idx}
                  className={`px-3 py-2 text-xs text-zinc-700 hover:bg-indigo-50 cursor-pointer flex items-center justify-between gap-2 ${isSelected ? 'bg-indigo-50/50' : ''}`}
                  onClick={() => handleSelect(opt)}
                >
                  <span className="truncate">{opt}</span>
                  {isSelected && <Check size={12} className="text-indigo-600 shrink-0" />}
                </div>
              )
            })
          ) : options.length === 0 ? (
            <div className="px-3 py-3 text-xs text-zinc-400 italic text-center">
              No options saved yet.<br />
              <span className="text-[10px]">Type to add a new remark</span>
            </div>
          ) : null}

          {showAddNew && (
            <div
              className="px-3 py-2 text-xs text-indigo-700 bg-indigo-50/50 hover:bg-indigo-100 cursor-pointer border-t border-zinc-100 flex items-center gap-2"
              onClick={() => handleAddNew(searchTerm)}
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