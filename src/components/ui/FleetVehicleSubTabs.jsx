import React from 'react'

/** Vehicle-only navigation treatment; it intentionally does not change shared page tabs. */
export function FleetVehicleSubTabs({ tabs, activeTabId, onTabChange }) {
  return (
    <div className="fleet-vehicle-tabs" role="tablist" aria-label="Vehicle workspace sections">
      {tabs.map((tab) => {
        const isActive = activeTabId === tab.id
        return (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={isActive}
            className={`fleet-vehicle-tab ${isActive ? 'fleet-vehicle-tab-active' : ''}`}
            onClick={() => onTabChange(tab)}
          >
            {tab.label}
          </button>
        )
      })}
    </div>
  )
}
