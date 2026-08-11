import React, { useState, useEffect } from 'react'
import { Calendar, Car, Clock } from 'lucide-react'
import ImportantDatesTab from './ImportantDatesTab'
import VehicleManagementTab from './VehicleManagementTab'
import ShiftPlanningTab from './ShiftPlanningTab'
import { SubTabsNav } from '../ui/SubTabsNav'

const subTabs = [
  { id: 'dates', label: 'Dates', icon: <Calendar size={15} /> },
  { id: 'vehicles', label: 'Vehicles', icon: <Car size={15} /> },
  { id: 'shift-planning', label: 'Shift Planning', icon: <Clock size={15} /> },
]

export default function OperationsTab({ initialSubTab = 'dates' }) {
  const [activeSubTab, setActiveSubTab] = useState(initialSubTab)

  useEffect(() => {
    if (initialSubTab) setActiveSubTab(initialSubTab)
  }, [initialSubTab])

  return (
    <div className="flex flex-col h-full" style={{ fontFamily: 'Figtree, system-ui, sans-serif' }}>
      <SubTabsNav
        tabs={subTabs}
        activeTabId={activeSubTab}
        onTabChange={(tab) => setActiveSubTab(tab.id)}
      />

      {activeSubTab === 'dates' && <ImportantDatesTab />}
      {activeSubTab === 'vehicles' && <VehicleManagementTab initialSubTab="mileage-tracker" />}
      {activeSubTab === 'shift-planning' && <ShiftPlanningTab />}
    </div>
  )
}
