import React, { useRef, useState, useEffect, useCallback } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'

/**
 * Scoped secondary navigation based on the Fleet workspace tabs.
 * Supports:
 * - Direct 2-row layout (twoRows={true}): fills Row 1, then flows into Row 2 without category labels
 * - 1-row layout with smooth horizontal scrolling, left/right chevron buttons, mouse-wheel scrolling,
 *   and visible slim scrollbar
 */
export function FleetSecondaryTabs({
  tabs,
  activeTabId,
  onTabChange,
  className = '',
  ariaLabel = 'Workspace sections',
  twoRows = false,
  size = 'md'
}) {
  const scrollContainerRef = useRef(null)
  const [canScrollLeft, setCanScrollLeft] = useState(false)
  const [canScrollRight, setCanScrollRight] = useState(false)

  const checkScroll = useCallback(() => {
    const el = scrollContainerRef.current
    if (!el) return
    const hasOverflow = el.scrollWidth > el.clientWidth + 2
    setCanScrollLeft(el.scrollLeft > 6)
    setCanScrollRight(hasOverflow && el.scrollLeft < el.scrollWidth - el.clientWidth - 6)
  }, [])

  useEffect(() => {
    if (twoRows) return
    const el = scrollContainerRef.current
    if (!el) return

    checkScroll()
    el.addEventListener('scroll', checkScroll, { passive: true })
    const ro = new ResizeObserver(checkScroll)
    ro.observe(el)

    return () => {
      el.removeEventListener('scroll', checkScroll)
      ro.disconnect()
    }
  }, [checkScroll, tabs, twoRows])

  const scrollBy = (offset) => {
    if (scrollContainerRef.current) {
      scrollContainerRef.current.scrollBy({ left: offset, behavior: 'smooth' })
    }
  }

  const handleWheel = (e) => {
    const el = scrollContainerRef.current
    if (!el) return
    if (el.scrollWidth > el.clientWidth) {
      if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) {
        el.scrollLeft += e.deltaY * 0.9
      }
    }
  }

  // Auto-scroll active tab into view when selected or loaded
  useEffect(() => {
    if (twoRows) return
    const el = scrollContainerRef.current
    if (!el) return
    const activeEl = el.querySelector(`[data-tab-id="${activeTabId}"]`)
    if (activeEl) {
      const containerRect = el.getBoundingClientRect()
      const tabRect = activeEl.getBoundingClientRect()
      if (tabRect.left < containerRect.left + 40 || tabRect.right > containerRect.right - 40) {
        activeEl.scrollIntoView({ behavior: 'smooth', inline: 'nearest', block: 'nearest' })
      }
    }
  }, [activeTabId, twoRows])

  // Direct two-row layout: fill first row, then continue into second row
  if (twoRows && tabs.length > 0) {
    const splitIndex = Math.ceil(tabs.length / 2)
    const row1Tabs = tabs.slice(0, splitIndex)
    const row2Tabs = tabs.slice(splitIndex)

    const handleRowWheel = (e) => {
      const el = e.currentTarget
      if (el && el.scrollWidth > el.clientWidth) {
        if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) {
          el.scrollLeft += e.deltaY * 0.8
        }
      }
    }

    return (
      <div className={`fleet-two-row-container flex flex-col bg-[#F4FAFD] border-b border-[#E0E0E0] ${className}`.trim()} role="tablist" aria-label={ariaLabel}>
        {/* Row 1 */}
        <div
          onWheel={handleRowWheel}
          className="flex items-center gap-1.5 px-3 py-1.5 border-b border-slate-200/60 overflow-x-auto [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden"
        >
          {row1Tabs.map((tab) => {
            const isActive = activeTabId === tab.id
            return (
              <button
                key={tab.id}
                type="button"
                role="tab"
                data-tab-id={tab.id}
                aria-selected={isActive}
                className={`fleet-two-row-pill ${isActive ? 'fleet-two-row-pill-active' : ''}`}
                onClick={() => onTabChange(tab)}
              >
                {tab.icon && <span className="fleet-secondary-tab-icon" aria-hidden="true">{tab.icon}</span>}
                {tab.label}
              </button>
            )
          })}
        </div>

        {/* Row 2 */}
        {row2Tabs.length > 0 && (
          <div
            onWheel={handleRowWheel}
            className="flex items-center gap-1.5 px-3 py-1.5 overflow-x-auto [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden"
          >
            {row2Tabs.map((tab) => {
              const isActive = activeTabId === tab.id
              return (
                <button
                  key={tab.id}
                  type="button"
                  role="tab"
                  data-tab-id={tab.id}
                  aria-selected={isActive}
                  className={`fleet-two-row-pill ${isActive ? 'fleet-two-row-pill-active' : ''}`}
                  onClick={() => onTabChange(tab)}
                >
                  {tab.icon && <span className="fleet-secondary-tab-icon" aria-hidden="true">{tab.icon}</span>}
                  {tab.label}
                </button>
              )
            })}
          </div>
        )}
      </div>
    )
  }

  const isSm = size === 'sm'

  return (
    <div className={`relative flex items-center w-full bg-[#F4FAFD] border-b border-[#E0E0E0] ${className}`.trim()}>
      {/* Left Scroll Arrow */}
      {canScrollLeft && (
        <button
          type="button"
          onClick={() => scrollBy(-260)}
          className={`absolute left-0 top-0 bottom-0 z-30 flex items-center justify-center ${isSm ? 'w-7' : 'w-9'} bg-gradient-to-r from-[#F4FAFD] via-[#F4FAFD]/95 to-transparent text-slate-600 hover:text-slate-900 transition-all cursor-pointer`}
          title="Scroll left"
          aria-label="Scroll left"
        >
          <div className={`${isSm ? 'p-0.5' : 'p-1'} rounded-full bg-white/95 border border-slate-200 shadow-xs hover:bg-white hover:scale-105 transition-all`}>
            <ChevronLeft size={isSm ? 12 : 14} strokeWidth={2.5} />
          </div>
        </button>
      )}

      {/* Scrollable tab strip */}
      <div
        ref={scrollContainerRef}
        onWheel={handleWheel}
        className={`fleet-secondary-tabs ${isSm ? 'fleet-secondary-tabs-sm' : ''} flex-1 min-w-0`}
        role="tablist"
        aria-label={ariaLabel}
      >
        {tabs.map((tab) => {
          const isActive = activeTabId === tab.id
          return (
            <button
              key={tab.id}
              type="button"
              role="tab"
              data-tab-id={tab.id}
              aria-selected={isActive}
              className={`fleet-secondary-tab ${isSm ? 'fleet-secondary-tab-sm' : ''} ${isActive ? 'fleet-secondary-tab-active' : ''}`}
              onClick={() => onTabChange(tab)}
            >
              {tab.icon && <span className="fleet-secondary-tab-icon" aria-hidden="true">{tab.icon}</span>}
              {tab.label}
            </button>
          )
        })}
      </div>

      {/* Right Scroll Arrow */}
      {canScrollRight && (
        <button
          type="button"
          onClick={() => scrollBy(260)}
          className={`absolute right-0 top-0 bottom-0 z-30 flex items-center justify-center ${isSm ? 'w-7' : 'w-9'} bg-gradient-to-l from-[#F4FAFD] via-[#F4FAFD]/95 to-transparent text-slate-600 hover:text-slate-900 transition-all cursor-pointer`}
          title="Scroll right"
          aria-label="Scroll right"
        >
          <div className={`${isSm ? 'p-0.5' : 'p-1'} rounded-full bg-white/95 border border-slate-200 shadow-xs hover:bg-white hover:scale-105 transition-all`}>
            <ChevronRight size={isSm ? 12 : 14} strokeWidth={2.5} />
          </div>
        </button>
      )}
    </div>
  )
}
