import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth, formatAuthError } from '../hooks/useAuth'
import { db } from '../lib/firebase'
import { collection, query, where, getDocs } from 'firebase/firestore'

// Google SVG logo
const GoogleIcon = () => (
  <svg width="20" height="20" viewBox="0 0 48 48">
    <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
    <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
    <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
    <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
  </svg>
)

// ─── Organisation Setup Modal (Create or Join) ────────────────────────────────
function OrgSetupModal({ user, onJoin, onCreate, onNavigate }) {
  const [modalTab, setModalTab] = useState('join')
  const [orgCode, setOrgCode] = useState('')
  const [orgName, setOrgName] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [createdCode, setCreatedCode] = useState(null)

  const isAdmin = user?.role?.toLowerCase() === 'admin'
  const hasOrg = !!user?.orgId

  const handleJoin = async (e) => {
    e.preventDefault()
    if (!orgCode.trim()) { setError('Please enter an organisation code.'); return }
    setLoading(true); setError('')
    try {
      await onJoin(orgCode.trim())
      onNavigate()
    } catch (err) {
      setError(err.message); setLoading(false)
    }
  }

  const handleCreate = async (e) => {
    e.preventDefault()
    if (!orgName.trim()) { setError('Please enter an organisation name.'); return }
    setLoading(true); setError('')
    try {
      console.log('OrgSetupModal (Login): Calling onCreate...')
      const code = await onCreate(orgName.trim())
      console.log('OrgSetupModal (Login): onCreate success, code=', code)
      setCreatedCode(code); setLoading(false)
    } catch (err) {
      console.error('OrgSetupModal (Login): onCreate error=', err)
      setError(err.message); setLoading(false)
    }
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
            {hasOrg && isAdmin
              ? 'As an admin you can create an additional organisation.'
              : 'Create a new organisation or join an existing one.'}
          </p>
        </div>

        {/* Tabs — hidden if admin already in org (can only create) */}
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
          <div className="space-y-4">
            <div className="bg-green-50 border border-green-200 rounded-lg p-4 text-center">
              <p className="text-sm text-green-700 font-medium mb-2">Organisation created! 🎉</p>
              <p className="text-xs text-gray-500 mb-1">Share this code with your team:</p>
              <div className="bg-white border border-gray-200 rounded-lg px-4 py-2 font-mono text-indigo-700 font-bold tracking-wide text-sm select-all">{createdCode}</div>
            </div>
            <button onClick={onNavigate}
              className="w-full bg-gradient-to-r from-indigo-500 to-purple-500 text-white font-semibold py-2.5 rounded-lg shadow-lg shadow-indigo-500/30 hover:shadow-indigo-500/50 transition-all">
              Continue to Dashboard
            </button>
          </div>
        ) : (modalTab === 'join' && !(hasOrg && isAdmin)) ? (
          <form onSubmit={handleJoin} className="space-y-4">
            <input value={orgCode} onChange={(e) => setOrgCode(e.target.value)}
              placeholder="Organisation code (e.g. techcorp-xyz)"
              className="w-full border border-gray-300 rounded-lg px-4 py-2.5 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none text-sm" />
            <p className="text-xs text-gray-400">Ask your admin for the organisation code.</p>
            <button type="submit" disabled={loading}
              className="w-full bg-gradient-to-r from-indigo-500 to-purple-500 text-white font-semibold py-2.5 rounded-lg shadow-lg shadow-indigo-500/30 hover:shadow-indigo-500/50 transition-all disabled:opacity-50">
              {loading ? 'Joining…' : 'Join Organisation'}
            </button>
          </form>
        ) : (
          <form onSubmit={handleCreate} className="space-y-4">
            <input value={orgName} onChange={(e) => setOrgName(e.target.value)}
              placeholder="Organisation name (e.g. TechCorp)"
              className="w-full border border-gray-300 rounded-lg px-4 py-2.5 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none text-sm" />
            <p className="text-xs text-gray-400">A unique join code will be generated for your team.</p>
            <button type="submit" disabled={loading}
              className="w-full bg-gradient-to-r from-indigo-500 to-purple-500 text-white font-semibold py-2.5 rounded-lg shadow-lg shadow-indigo-500/30 hover:shadow-indigo-500/50 transition-all disabled:opacity-50">
              {loading ? 'Creating…' : 'Create Organisation'}
            </button>
          </form>
        )}
      </div>
    </div>
  )
}

// ─── Account Link Modal (Google + Email password merge) ──────────────────────
function LinkAccountModal({ email, googleCredential, onLink, onCancel }) {
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const handleLink = async (e) => {
    e.preventDefault()
    setLoading(true)
    setError('')
    try {
      await onLink(email, password, googleCredential)
    } catch (err) {
      setError(formatAuthError(err))
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-8 mx-4">
        <div className="flex flex-col items-center mb-6">
          <div className="w-14 h-14 rounded-xl bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center mb-3">
            <span className="text-white text-2xl">🔗</span>
          </div>
          <h2 className="text-xl font-bold text-gray-800">Link Your Accounts</h2>
          <p className="text-sm text-gray-500 text-center mt-1">
            <strong>{email}</strong> is already registered with email & password. Enter your password to link it with Google.
          </p>
        </div>
        <form onSubmit={handleLink} className="space-y-4">
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-600 px-4 py-2 rounded-lg text-sm">{error}</div>
          )}
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Your password"
            className="w-full border border-gray-300 rounded-lg px-4 py-2.5 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none text-sm"
            required
          />
          <button
            type="submit"
            disabled={loading}
            className="w-full bg-gradient-to-r from-indigo-500 to-purple-500 text-white font-semibold py-2.5 rounded-lg shadow-lg shadow-indigo-500/30 hover:shadow-indigo-500/50 transition-all disabled:opacity-50"
          >
            {loading ? 'Linking…' : 'Link & Sign In'}
          </button>
          <button type="button" onClick={onCancel} className="w-full text-sm text-gray-400 hover:text-gray-600 transition-colors">
            Cancel
          </button>
        </form>
      </div>
    </div>
  )
}

// ─── Main Login Page ──────────────────────────────────────────────────────────
export default function Login() {
  const { user, login, register, loginWithGoogle, linkGoogleToEmail, joinOrganisation, createOrganisation, resetPassword } = useAuth()
  const navigate = useNavigate()

  const [tab, setTab] = useState('signin')   // 'signin' | 'signup'
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  // Sign-in fields
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')

  // Sign-up fields
  const [name, setName] = useState('')
  const [regEmail, setRegEmail] = useState('')
  const [regPassword, setRegPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [orgCode, setOrgCode] = useState('')

  // Account-link modal state
  const [linkData, setLinkData] = useState(null) // { email, googleCredential }

  // Forgot password modal state
  const [showForgotPassword, setShowForgotPassword] = useState(false)
  const [forgotEmail, setForgotEmail] = useState('')
  const [forgotSent, setForgotSent] = useState(false)
  const [forgotLoading, setForgotLoading] = useState(false)

  // If user is logged in but has no org → show org setup modal
  if (user && !user.orgId) {
    return (
      <OrgSetupModal
        user={user}
        onJoin={joinOrganisation}
        onCreate={createOrganisation}
        onNavigate={() => navigate('/')}
      />
    )
  }

  if (user) {
    navigate('/')
    return null
  }

  // ── Handlers ─────────────────────────────────────────────────────────────

  const handleSignIn = async (e) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const identifier = email.trim()

      if (identifier.includes('@')) {
        await login(identifier, password)
        // Check if login is enabled for this user in Firestore
        const userDoc = await getDocs(query(collection(db, 'users'), where('email', '==', identifier.toLowerCase().trim())))
        if (!userDoc.empty) {
          const userData = userDoc.docs[0].data()
          if (userData.loginEnabled === false) {
            await logout()
            setError('Your login access has been disabled. Please contact your administrator.')
            setLoading(false)
            return
          }
        }
      } else {
        const q = query(collection(db, 'users'), where('empCode', '==', identifier))
        const snap = await getDocs(q)
        if (snap.empty) {
          throw { code: 'auth/user-not-found' }
        }
        const data = snap.docs[0].data()
        
        if (data.loginEnabled === false) {
          setError('Your login access has been disabled. Please contact your administrator.')
          setLoading(false)
          return
        }

        await login(data.email, password)
      }

      navigate('/')
    } catch (err) {
      setError(formatAuthError(err))
    } finally {
      setLoading(false)
    }
  }

  const handleRegister = async (e) => {
    e.preventDefault()
    setError('')
    if (regPassword !== confirmPassword) { setError('Passwords do not match.'); return }
    setLoading(true)
    try {
      await register(name, regEmail, regPassword, orgCode)
      navigate('/')
    } catch (err) {
      setError(formatAuthError(err))
    } finally {
      setLoading(false)
    }
  }

  const handleGoogle = async () => {
    setError('')
    setLoading(true)
    try {
      await loginWithGoogle()
      // onAuthStateChanged will update user — if no orgId, OrgJoinModal will show
    } catch (err) {
      if (err.message === 'LINK_REQUIRED') {
        setLinkData({ email: err.email, googleCredential: err.googleCredential })
      } else {
        setError(formatAuthError(err))
      }
    } finally {
      setLoading(false)
    }
  }

  const handleForgotPassword = async (e) => {
    e.preventDefault()
    if (!forgotEmail.trim()) return
    setForgotLoading(true)
    try {
      await resetPassword(forgotEmail.trim())
      setForgotSent(true)
    } catch (err) {
      setError(formatAuthError(err))
    } finally {
      setForgotLoading(false)
    }
  }

  const handleLink = async (email, password, googleCredential) => {
    await linkGoogleToEmail(email, password, googleCredential)
    setLinkData(null)
    navigate('/')
  }

  // ── Shared Google & divider block ─────────────────────────────────────────
  const googleBlock = (
    <>
      <div className="flex items-center my-5">
        <div className="flex-1 border-t border-gray-200" />
        <span className="px-3 text-sm text-gray-400">or</span>
        <div className="flex-1 border-t border-gray-200" />
      </div>
      <button
        type="button"
        onClick={handleGoogle}
        disabled={loading}
        className="w-full flex items-center justify-center gap-3 border border-gray-300 bg-white hover:bg-gray-50 text-gray-700 font-semibold py-3 rounded-lg transition-all disabled:opacity-50"
      >
        <GoogleIcon />
        Continue with Google
      </button>
    </>
  )

  return (
    <>
      {/* Account link modal */}
      {linkData && (
        <LinkAccountModal
          email={linkData.email}
          googleCredential={linkData.googleCredential}
          onLink={handleLink}
          onCancel={() => setLinkData(null)}
        />
      )}

      {/* Forgot Password Modal */}
      {showForgotPassword && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-8 mx-4">
            <div className="flex flex-col items-center mb-5">
              <div className="w-14 h-14 rounded-xl bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center mb-3">
                <span className="text-white text-2xl">🔐</span>
              </div>
              <h2 className="text-xl font-bold text-gray-800">Reset Password</h2>
              <p className="text-sm text-gray-500 text-center mt-1">
                Enter your email address and we'll send you a link to reset your password.
              </p>
            </div>

            {forgotSent ? (
              <div className="bg-green-50 border border-green-200 rounded-lg p-4 text-center">
                <p className="text-sm text-green-700 font-medium mb-2">Password reset link sent! 📧</p>
                <p className="text-xs text-gray-500">Check your email for instructions.</p>
                <button
                  onClick={() => { setShowForgotPassword(false); setForgotSent(false); setForgotEmail(''); }}
                  className="mt-4 w-full bg-green-600 text-white font-semibold py-2 rounded-lg hover:bg-green-700 transition-all"
                >
                  Back to Login
                </button>
              </div>
            ) : (
              <form onSubmit={handleForgotPassword} className="space-y-4">
                <input
                  type="email"
                  value={forgotEmail}
                  onChange={(e) => setForgotEmail(e.target.value)}
                  placeholder="your@email.com"
                  className="w-full border border-gray-300 rounded-lg px-4 py-2.5 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none text-sm"
                  required
                />
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setShowForgotPassword(false)}
                    className="flex-1 py-2.5 rounded-lg text-sm font-medium text-gray-500 hover:bg-gray-50 border border-gray-200 transition-all"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={forgotLoading}
                    className="flex-1 bg-gradient-to-r from-indigo-500 to-purple-500 text-white font-semibold py-2.5 rounded-lg shadow-lg hover:shadow-indigo-500/30 transition-all disabled:opacity-50"
                  >
                    {forgotLoading ? 'Sending...' : 'Send Link'}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}

      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="w-full max-w-md p-8">
          {/* Logo */}
          <div className="flex flex-col items-center mb-8">
            <div className="w-16 h-16 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-500 flex items-center justify-center mb-4">
              <span className="text-white text-2xl font-bold">H</span>
            </div>
            <h1 className="text-2xl font-bold text-gray-800">HRFlow</h1>
            <p className="text-gray-500 text-sm">Multi-organisation HR & Attendance Platform</p>
          </div>

          {/* Tabs */}
          <div className="flex bg-gray-100 rounded-xl p-1 mb-6">
            <button
              onClick={() => { setTab('signin'); setError('') }}
              className={`flex-1 py-2 rounded-lg text-sm font-semibold transition-all ${tab === 'signin' ? 'bg-white shadow text-indigo-600' : 'text-gray-500 hover:text-gray-700'}`}
            >
              Sign In
            </button>
            <button
              onClick={() => { setTab('signup'); setError('') }}
              className={`flex-1 py-2 rounded-lg text-sm font-semibold transition-all ${tab === 'signup' ? 'bg-white shadow text-indigo-600' : 'text-gray-500 hover:text-gray-700'}`}
            >
              Create Account
            </button>
          </div>

          {/* Error Banner */}
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-600 px-4 py-3 rounded-lg text-sm mb-4">
              {error}
            </div>
          )}

          {/* ── Sign In Tab ── */}
          {tab === 'signin' && (
            <>
              <form onSubmit={handleSignIn} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Employee ID or Email</label>
                  <input
                    type="text"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full border border-gray-300 rounded-lg px-4 py-2.5 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
                    placeholder="EMP-001 or you@example.com"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Password</label>
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full border border-gray-300 rounded-lg px-4 py-2.5 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
                    placeholder="••••••••"
                    required
                  />
                </div>
                <div className="text-right">
                  <button
                    type="button"
                    onClick={() => setShowForgotPassword(true)}
                    className="text-sm text-indigo-600 hover:text-indigo-800 font-medium"
                  >
                    Forgot Password?
                  </button>
                </div>
                <button
                  type="submit"
                  disabled={loading}
                  className="w-full bg-gradient-to-r from-indigo-500 to-purple-500 text-white font-semibold py-3 rounded-lg shadow-lg shadow-indigo-500/30 hover:shadow-indigo-500/50 transition-all disabled:opacity-50"
                >
                  {loading ? 'Signing in…' : 'Sign In'}
                </button>
              </form>
              {googleBlock}
            </>
          )}

          {/* ── Create Account Tab ── */}
          {tab === 'signup' && (
            <>
              <form onSubmit={handleRegister} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Full Name</label>
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="w-full border border-gray-300 rounded-lg px-4 py-2.5 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
                    placeholder="John Smith"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
                  <input
                    type="email"
                    value={regEmail}
                    onChange={(e) => setRegEmail(e.target.value)}
                    className="w-full border border-gray-300 rounded-lg px-4 py-2.5 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
                    placeholder="you@example.com"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Password</label>
                  <input
                    type="password"
                    value={regPassword}
                    onChange={(e) => setRegPassword(e.target.value)}
                    className="w-full border border-gray-300 rounded-lg px-4 py-2.5 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
                    placeholder="At least 6 characters"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Confirm Password</label>
                  <input
                    type="password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    className="w-full border border-gray-300 rounded-lg px-4 py-2.5 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
                    placeholder="••••••••"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Organisation Code <span className="text-gray-400 font-normal">(optional)</span>
                  </label>
                  <input
                    type="text"
                    value={orgCode}
                    onChange={(e) => setOrgCode(e.target.value)}
                    className="w-full border border-gray-300 rounded-lg px-4 py-2.5 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
                    placeholder="e.g. techcorp"
                  />
                  <p className="text-xs text-gray-400 mt-1">Ask your admin for the code. Leave blank to join later.</p>
                </div>
                <button
                  type="submit"
                  disabled={loading}
                  className="w-full bg-gradient-to-r from-indigo-500 to-purple-500 text-white font-semibold py-3 rounded-lg shadow-lg shadow-indigo-500/30 hover:shadow-indigo-500/50 transition-all disabled:opacity-50"
                >
                  {loading ? 'Creating account…' : 'Create Account'}
                </button>
              </form>
              {googleBlock}
            </>
          )}
        </div>
      </div>
    </>
  )
}
