import React, { useState, useEffect, useRef, useMemo } from 'react'
import { X, Check } from 'lucide-react'

function formatTimeDisplay(time24) {
  if (!time24) return ''
  const [h, m] = time24.split(':').map(Number)
  if (isNaN(h) || isNaN(m)) return time24
  const p = h >= 12 ? 'PM' : 'AM'
  const h12 = h % 12 || 12
  return `${h12}:${String(m).padStart(2, '0')} ${p}`
}

export default function RemarksDropdown({
  value,
  onChange,
  onAddOption,
  options = [],
  rareOptions: propRareOptions,
  disabled,
  className,
  placeholder = "Select or type...",
  siteVisits = [],
  onSiteClick
}) {
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

  // Support both object { regular: [], rare: [] } and flat array with optional rareOptions
  const { regularList, rareList } = useMemo(() => {
    if (options && typeof options === 'object' && !Array.isArray(options)) {
      return {
        regularList: Array.isArray(options.regular) ? options.regular : [],
        rareList: Array.isArray(options.rare) ? options.rare : []
      }
    }
    const reg = Array.isArray(options) ? options : []
    const rare = Array.isArray(propRareOptions) ? propRareOptions : []
    return { regularList: reg, rareList: rare }
  }, [options, propRareOptions])

  // Parse comma-separated value into array
  const selectedValues = value ? value.split(',').map(v => v.trim()).filter(Boolean) : []

  // When no search term: only regular sites are shown.
  // When search term has length >= 1: search across BOTH regular and rare sites.
  const displayOptions = useMemo(() => {
    const query = searchTerm.trim().toLowerCase()
    if (!query) {
      return regularList.map(opt => ({ name: opt, isRare: false }))
    }
    const regMatches = regularList.filter(opt => opt.toLowerCase().includes(query))
    const regSet = new Set(regMatches.map(s => s.toLowerCase()))
    const rareMatches = rareList.filter(opt =>
      opt.toLowerCase().includes(query) && !regSet.has(opt.toLowerCase())
    )
    return [
      ...regMatches.map(opt => ({ name: opt, isRare: false })),
      ...rareMatches.map(opt => ({ name: opt, isRare: true }))
    ]
  }, [regularList, rareList, searchTerm])

  const allKnownNames = useMemo(() => {
    return [...regularList, ...rareList]
  }, [regularList, rareList])

  const exactMatch = allKnownNames.some(opt => opt.toLowerCase() === searchTerm.trim().toLowerCase())
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
        {selectedValues.map((val, i) => {
          const visit = (siteVisits || []).find(v => v.siteName?.trim().toLowerCase() === val.trim().toLowerCase())
          const inStr = visit?.inTime ? formatTimeDisplay(visit.inTime) : ''
          const outStr = visit?.outTime ? formatTimeDisplay(visit.outTime) : ''
          const hasTiming = inStr && outStr
          const isOvernight = visit?.isOvernight
          const timingText = hasTiming
            ? `${inStr} → ${outStr}${isOvernight ? ' (+1d)' : ''}`
            : inStr
              ? `From ${inStr}`
              : outStr
                ? `Until ${outStr}`
                : ''

          return (
            <span
              key={i}
              className={`inline-flex flex-col rounded px-2 py-0.5 text-[11px] font-medium transition-all select-none ${
                disabled
                  ? 'bg-zinc-200 text-zinc-500'
                  : onSiteClick
                    ? 'bg-indigo-50 hover:bg-indigo-100/90 text-indigo-950 border border-indigo-200/80 cursor-pointer shadow-2xs'
                    : 'bg-indigo-100 text-indigo-800'
              }`}
              onClick={(e) => {
                if (disabled || !onSiteClick) return
                e.stopPropagation()
                onSiteClick(val)
              }}
              title={onSiteClick ? `Click to edit timing for ${val}` : undefined}
            >
              <div className="flex items-center justify-between gap-1.5 min-w-0">
                <span className="font-semibold truncate">{val}</span>
                {!disabled && (
                  <button
                    type="button"
                    onClick={(e) => handleRemove(e, val)}
                    className="hover:bg-indigo-200 text-indigo-400 hover:text-indigo-800 rounded p-0.5 shrink-0 transition-colors"
                    title={`Remove ${val}`}
                  >
                    <X size={10} />
                  </button>
                )}
              </div>
              {timingText ? (
                <span className="text-[9px] font-mono text-indigo-600 font-semibold leading-tight whitespace-nowrap">
                  {timingText}
                </span>
              ) : selectedValues.length >= 2 ? (
                <span className="text-[9px] text-amber-600 italic font-normal leading-tight whitespace-nowrap">
                  Set timing…
                </span>
              ) : null}
            </span>
          )
        })}
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
          placeholder={selectedValues.length === 0 ? placeholder : ""}
          className={`border-none bg-transparent p-0 text-xs focus:ring-0 text-zinc-700 outline-none ${
            selectedValues.length > 0
              ? searchTerm ? 'flex-1 min-w-[50px]' : 'w-2 min-w-0'
              : 'flex-1 min-w-[60px]'
          } disabled:cursor-not-allowed`}
        />
      </div>

      {isOpen && !disabled && (
        <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-zinc-200 rounded-md shadow-xl z-[50] max-h-56 overflow-auto">
          {displayOptions.length > 0 ? (
            displayOptions.map((item, idx) => {
              const isSelected = selectedValues.includes(item.name)
              return (
                <div
                  key={idx}
                  className={`px-3 py-2 text-xs text-zinc-700 hover:bg-indigo-50 cursor-pointer flex items-center justify-between gap-2 ${isSelected ? 'bg-indigo-50/50' : ''}`}
                  onClick={() => handleSelect(item.name)}
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="truncate">{item.name}</span>
                    {item.isRare && (
                      <span className="text-[9px] font-semibold uppercase px-1.5 py-0.5 rounded bg-amber-50 text-amber-700 border border-amber-200/70 shrink-0">
                        Completed
                      </span>
                    )}
                  </div>
                  {isSelected && <Check size={12} className="text-indigo-600 shrink-0" />}
                </div>
              )
            })
          ) : allKnownNames.length === 0 ? (
            <div className="px-3 py-3 text-xs text-zinc-400 italic text-center">
              No sites saved yet.<br />
              <span className="text-[10px]">Type to add a new site</span>
            </div>
          ) : !searchTerm.trim() ? (
            <div className="px-3 py-3 text-xs text-zinc-400 italic text-center">
              No regular sites.<br />
              <span className="text-[10px]">Type to search completed sites</span>
            </div>
          ) : (
            <div className="px-3 py-3 text-xs text-zinc-400 italic text-center">
              No matching sites found.
            </div>
          )}

          {showAddNew && (
            <div
              className="px-3 py-2 text-xs text-indigo-700 bg-indigo-50/50 hover:bg-indigo-100 cursor-pointer border-t border-zinc-100 flex items-center gap-2"
              onClick={() => handleAddNew(searchTerm)}
            >
              <span className="font-bold">+</span>
              <span>Use "<span className="font-semibold">{searchTerm.trim()}</span>" as new site</span>
            </div>
          )}
        </div>
      )}
    </div>
  )
}