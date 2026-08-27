import React from 'react'

/**
 * Scoped secondary navigation based on the Fleet workspace tabs. It is not a
 * replacement for global navigation and is used only where the connected-tab
 * treatment supports a nested operational workspace.
 */
export function FleetSecondaryTabs({ tabs, activeTabId, onTabChange, className = '', ariaLabel = 'Workspace sections' }) {
  return (
    <div className={`fleet-secondary-tabs ${className}`.trim()} role="tablist" aria-label={ariaLabel}>
      {tabs.map((tab) => {
        const isActive = activeTabId === tab.id
        return (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={isActive}
            className={`fleet-secondary-tab ${isActive ? 'fleet-secondary-tab-active' : ''}`}
            onClick={() => onTabChange(tab)}
          >
            {tab.icon && <span className="fleet-secondary-tab-icon" aria-hidden="true">{tab.icon}</span>}
            {tab.label}
          </button>
        )
      })}
    </div>
  )
}
