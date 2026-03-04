import { useState } from 'react'
import { useAuth } from '../hooks/useAuth'
import AttendanceTab from '../components/tabs/AttendanceTab'
import CorrectionTab from '../components/tabs/CorrectionTab'
import ApprovalsTab from '../components/tabs/ApprovalsTab'
import SummaryTab from '../components/tabs/SummaryTab'
import SettingsTab from '../components/tabs/SettingsTab'

function getInitials(name) {
  return name?.split(' ').map(n => n[0]).join('').toUpperCase() || '??'
}

function getAvatarColor(id) {
  let hash = 0
  for (let i = 0; i < (id || '').length; i++) hash = id.charCodeAt(i) + ((hash << 5) - hash)
  const h = hash % 360
  return `hsl(${h}, 70%, 50%)`
}

export default function Dashboard() {
  const { user, logout } = useAuth()
  const [activeTab, setActiveTab] = useState('attendance')

  const tabs = [
    { id: 'attendance', label: 'Attendance' },
    { id: 'correction', label: 'Correction' },
    { id: 'approvals', label: 'Approvals', badge: 'OT' },
    { id: 'summary', label: 'Summary' },
    { id: 'settings', label: 'Settings' },
  ]

  const renderTab = () => {
    switch (activeTab) {
      case 'attendance': return <AttendanceTab />
      case 'correction': return <CorrectionTab />
      case 'approvals': return <ApprovalsTab />
      case 'summary': return <SummaryTab />
      case 'settings': return <SettingsTab />
      default: return <AttendanceTab />
    }
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Sticky Header */}
      <header className="sticky top-0 z-40 bg-white border-b border-gray-200 shadow-sm">
        <div className="max-w-screen-xl mx-auto px-4 h-16 flex items-center justify-between">
          {/* Left: Logo + Org */}
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-indigo-500 to-purple-500 flex items-center justify-center">
              <span className="text-white text-lg font-bold">H</span>
            </div>
            <span className="text-xl font-bold text-gray-800">HRFlow</span>
            <span className="text-gray-400 text-sm ml-2">TechCorp India</span>
          </div>

          {/* Right: User */}
          <div className="flex items-center gap-3">
            <div
              className="w-9 h-9 rounded-full flex items-center justify-center text-white text-sm font-bold"
              style={{ backgroundColor: getAvatarColor(user?.uid) }}
            >
              {getInitials(user?.name)}
            </div>
            <span className="font-medium text-gray-700 hidden sm:block">{user?.name || 'User'}</span>
            <button
              onClick={logout}
              className="text-sm text-gray-500 hover:text-red-500 hover:font-bold ml-2 transition-all"
            >
              Logout
            </button>
          </div>
        </div>
      </header>

      {/* Tab Bar */}
      <nav className="sticky top-16 z-30 bg-white border-b border-gray-200">
        <div className="max-w-screen-xl mx-auto">
          <div className="flex overflow-x-auto">
            {tabs.map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`px-5 py-3 text-sm font-medium whitespace-nowrap border-b-2 transition-colors ${activeTab === tab.id
                    ? 'border-indigo-500 text-indigo-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                  }`}
              >
                {tab.label}
                {tab.badge && (
                  <span className="ml-2 bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded text-xs font-semibold">
                    {tab.badge}
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>
      </nav>

      {/* Main Content */}
      <main className="max-w-screen-xl mx-auto px-4 py-5">
        {renderTab()}
      </main>
    </div>
  )
}
