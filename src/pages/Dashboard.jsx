import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
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

// ─── Org Setup Modal (inline in Dashboard for already-logged-in users) ────────
function OrgSetupModal({ user, onJoin, onCreate }) {
  const [modalTab, setModalTab] = useState('join')
  const [orgCode, setOrgCode] = useState('')
  const [orgName, setOrgName] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [createdCode, setCreatedCode] = useState(null)

  const isAdmin = user?.role === 'admin'
  const hasOrg = !!user?.orgId

  const handleJoin = async (e) => {
    e.preventDefault()
    if (!orgCode.trim()) { setError('Please enter an organisation code.'); return }
    setLoading(true); setError('')
    try { await onJoin(orgCode.trim()) }
    catch (err) { setError(err.message); setLoading(false) }
  }

  const handleCreate = async (e) => {
    e.preventDefault()
    if (!orgName.trim()) { setError('Please enter an organisation name.'); return }
    setLoading(true); setError('')
    try { const code = await onCreate(orgName.trim()); setCreatedCode(code); setLoading(false) }
    catch (err) { setError(err.message); setLoading(false) }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-8 mx-4">
        <div className="flex flex-col items-center mb-5">
          <div className="w-14 h-14 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-500 flex items-center justify-center mb-3">
            <span className="text-white text-2xl">🏢</span>
          </div>
          <h2 className="text-xl font-bold text-gray-800">Set Up Your Organisation</h2>
          <p className="text-sm text-gray-500 text-center mt-1">
            {hasOrg && isAdmin ? 'Create an additional organisation.' : 'Create a new organisation or join an existing one.'}
          </p>
        </div>

        {!(hasOrg && isAdmin) && (
          <div className="flex bg-gray-100 rounded-xl p-1 mb-5">
            <button onClick={() => { setModalTab('join'); setError('') }}
              className={`flex-1 py-2 rounded-lg text-sm font-semibold transition-all ${modalTab === 'join' ? 'bg-white shadow text-indigo-600' : 'text-gray-500 hover:text-gray-700'}`}>
              Join
            </button>
            <button onClick={() => { setModalTab('create'); setError('') }}
              className={`flex-1 py-2 rounded-lg text-sm font-semibold transition-all ${modalTab === 'create' ? 'bg-white shadow text-indigo-600' : 'text-gray-500 hover:text-gray-700'}`}>
              Create
            </button>
          </div>
        )}

        {error && <div className="bg-red-50 border border-red-200 text-red-600 px-4 py-2 rounded-lg text-sm mb-4">{error}</div>}

        {createdCode ? (
          <div className="space-y-3">
            <div className="bg-green-50 border border-green-200 rounded-lg p-4 text-center">
              <p className="text-sm text-green-700 font-medium mb-2">Organisation created! 🎉</p>
              <p className="text-xs text-gray-500 mb-1">Share this code with your team:</p>
              <div className="bg-white border border-gray-200 rounded-lg px-4 py-2 font-mono text-indigo-700 font-bold tracking-wide text-sm select-all">{createdCode}</div>
            </div>
            <p className="text-xs text-gray-400 text-center">You can now use the app. The code is also in Settings.</p>
          </div>
        ) : (modalTab === 'join' && !(hasOrg && isAdmin)) ? (
          <form onSubmit={handleJoin} className="space-y-4">
            <input value={orgCode} onChange={e => setOrgCode(e.target.value)}
              placeholder="Organisation code (e.g. techcorp-xyz)"
              className="w-full border border-gray-300 rounded-lg px-4 py-2.5 focus:ring-2 focus:ring-indigo-500 outline-none text-sm" />
            <p className="text-xs text-gray-400">Ask your admin for the organisation code.</p>
            <button type="submit" disabled={loading}
              className="w-full bg-gradient-to-r from-indigo-500 to-purple-500 text-white font-semibold py-2.5 rounded-lg shadow-lg transition-all disabled:opacity-50">
              {loading ? 'Joining…' : 'Join Organisation'}
            </button>
          </form>
        ) : (
          <form onSubmit={handleCreate} className="space-y-4">
            <input value={orgName} onChange={e => setOrgName(e.target.value)}
              placeholder="Organisation name (e.g. TechCorp)"
              className="w-full border border-gray-300 rounded-lg px-4 py-2.5 focus:ring-2 focus:ring-indigo-500 outline-none text-sm" />
            <p className="text-xs text-gray-400">A unique join code will be auto-generated.</p>
            <button type="submit" disabled={loading}
              className="w-full bg-gradient-to-r from-indigo-500 to-purple-500 text-white font-semibold py-2.5 rounded-lg shadow-lg transition-all disabled:opacity-50">
              {loading ? 'Creating…' : 'Create Organisation'}
            </button>
          </form>
        )}
      </div>
    </div>
  )
}

// ─── Dashboard ────────────────────────────────────────────────────────────────
export default function Dashboard() {
  const { user, logout, joinOrganisation, createOrganisation } = useAuth()
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

      {/* Show org setup modal if user has no org yet */}
      {user && !user.orgId && (
        <OrgSetupModal
          user={user}
          onJoin={joinOrganisation}
          onCreate={createOrganisation}
        />
      )}

      {/* Sticky Header */}
      <header className="sticky top-0 z-40 bg-white border-b border-gray-200 shadow-sm">
        <div className="max-w-screen-xl mx-auto px-4 h-16 flex items-center justify-between">
          {/* Left: Logo + Org */}
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-indigo-500 to-purple-500 flex items-center justify-center">
              <span className="text-white text-lg font-bold">H</span>
            </div>
            <span className="text-xl font-bold text-gray-800">HRFlow</span>
            <span className="text-gray-400 text-sm ml-2">{user?.orgName || user?.orgId || ''}</span>
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
