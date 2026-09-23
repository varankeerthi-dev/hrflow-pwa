import React from 'react'

/**
 * Secondary pill tabs matching the Advance/Expense entry-mode container:
 * rounded card, #F4FAFD surface, fleet-two-row-pill buttons, optional right slot.
 */
export function ModulePillTabs({
  tabs,
  activeTabId,
  onTabChange,
  ariaLabel = 'Section tabs',
  className = '',
  rightContent = null,
}) {
  return (
    <div className={`rounded-xl border border-slate-200/90 bg-[#F4FAFD] shadow-xs px-3 py-1.5 ${className}`.trim()}>
      <div className="flex items-center justify-between gap-2">
        <div
          className="flex items-center gap-1.5 overflow-x-auto [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden min-w-0"
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
                className={`fleet-two-row-pill ${isActive ? 'fleet-two-row-pill-active' : ''}`}
                onClick={() => onTabChange(tab)}
              >
                {tab.icon && <span className="fleet-secondary-tab-icon" aria-hidden="true">{tab.icon}</span>}
                {tab.label}
              </button>
            )
          })}
        </div>
        {rightContent}
      </div>
    </div>
  )
}
