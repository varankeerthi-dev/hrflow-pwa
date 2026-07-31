import React, { useState } from 'react'
import { Calendar, Car, Clock } from 'lucide-react'
import ImportantDatesTab from './ImportantDatesTab'
import VehicleManagementTab from './VehicleManagementTab'
import ShiftPlanningTab from './ShiftPlanningTab'

const subTabs = [
  { id: 'dates', label: 'Dates', icon: <Calendar size={15} /> },
  { id: 'vehicles', label: 'Vehicles', icon: <Car size={15} /> },
  { id: 'shift-planning', label: 'Shift Planning', icon: <Clock size={15} /> },
]

export default function OperationsTab() {
  const [activeSubTab, setActiveSubTab] = useState('dates')

  return (
    <div className="flex flex-col h-full" style={{ fontFamily: 'Figtree, system-ui, sans-serif' }}>
      <div className="flex items-center gap-1.5 mb-4 shrink-0">
        {subTabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveSubTab(tab.id)}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-[12px] font-semibold transition ${
              activeSubTab === tab.id
                ? 'bg-[#09CE99] text-white shadow-sm'
                : 'text-[#6B7280] hover:bg-[#F3F4F6]'
            }`}
          >
            <span className={activeSubTab === tab.id ? 'text-white' : 'text-[#9CA3AF]'}>{tab.icon}</span>
            {tab.label}
          </button>
        ))}
      </div>

      {activeSubTab === 'dates' && <ImportantDatesTab />}
      {activeSubTab === 'vehicles' && <VehicleManagementTab />}
      {activeSubTab === 'shift-planning' && <ShiftPlanningTab />}
    </div>
  )
}
