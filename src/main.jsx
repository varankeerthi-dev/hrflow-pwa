import React, { Component, useEffect, useState } from 'react'
import ReactDOM from 'react-dom/client'
import './index.css'
import App from './App'
import { AuthProvider } from './contexts/AuthContext'
import { Capacitor } from '@capacitor/core'
import { CapacitorUpdater } from '@capgo/capacitor-updater'

const UpdateChecker = () => {
  const [updateStatus, setUpdateStatus] = useState(null)

  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return

    const performUpdate = async () => {
      try {
        const version = await CapacitorUpdater.download({
          url: 'https://hrflow-pwa.vercel.app/releases/latest.zip',
        })
        await CapacitorUpdater.set(version)
      } catch (error) {
        console.log('Update check result:', error.message || 'No update available')
      }
    }

    performUpdate()
  }, [])

  return null
}

class GlobalErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { hasError: false, error: null }
  }
  static getDerivedStateFromError(error) {
    return { hasError: true, error }
  }
  componentDidCatch(error, errorInfo) {
    console.error('CRITICAL APP ERROR:', error, errorInfo)
  }
  render() {
    if (this.state.hasError) {
      return (
        <div style={{ padding: '40px', textAlign: 'center', fontFamily: 'system-ui' }}>
          <h1>System Error</h1>
          <p>The application failed to start correctly.</p>
          <pre style={{ background: '#f5f5f5', padding: '20px', borderRadius: '8px', display: 'inline-block', textAlign: 'left' }}>
            {this.state.error?.toString()}
          </pre>
          <br /><br />
          <button onClick={() => window.location.reload()} style={{ padding: '10px 20px', fontSize: '16px', cursor: 'pointer' }}>
            Try Again
          </button>
        </div>
      )
    }
    return this.props.children
  }
}

// Global unhandled rejection listener
window.addEventListener('unhandledrejection', (event) => {
  console.error('Unhandled Rejection:', event.reason)
})

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <GlobalErrorBoundary>
      <AuthProvider>
        <UpdateChecker />
        <App />
      </AuthProvider>
    </GlobalErrorBoundary>
  </React.StrictMode>
)
