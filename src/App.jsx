import { BrowserRouter, Routes, Route, Navigate, useNavigate, useLocation } from 'react-router-dom'
import { useAuth } from './hooks/useAuth'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import MobileDashboard from './components/MobileDashboard'
import Spinner from './components/ui/Spinner'
import React, { useEffect, useState } from 'react'

// Hook to detect mobile devices
function useIsMobile() {
  const [isMobile, setIsMobile] = useState(false)
  
  useEffect(() => {
    // Check user agent for mobile devices
    const checkMobile = () => {
      const userAgent = navigator.userAgent || navigator.vendor || window.opera
      const mobileRegex = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini|Mobile|mobile|CriOS/i
      
      // Check screen width (tablets and phones typically < 1024px)
      const isSmallScreen = window.innerWidth < 1024
      
      // Check if user agent indicates mobile
      const isMobileAgent = mobileRegex.test(userAgent)
      
      // Consider mobile if either condition is true
      return isMobileAgent || isSmallScreen
    }
    
    setIsMobile(checkMobile())
    
    // Update on resize
    const handleResize = () => {
      setIsMobile(checkMobile())
    }
    
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [])
  
  return isMobile
}

function ProtectedRoute({ children }) {
  const { user, loading } = useAuth()
  const isMobile = useIsMobile()
  const location = useLocation()
  const navigate = useNavigate()
  
  useEffect(() => {
    console.log('ProtectedRoute: user=', user, 'loading=', loading)
  }, [user, loading])

  // Auto-redirect to mobile view if on mobile device and not already on /mobile
  useEffect(() => {
    if (user && isMobile && location.pathname !== '/mobile') {
      console.log('Mobile detected, redirecting to /mobile')
      navigate('/mobile', { replace: true })
    }
  }, [user, isMobile, location.pathname, navigate])

  if (loading) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center" style={{ backgroundColor: '#f8f9fc' }}>
        <div className="w-16 h-16 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-500 mb-6 flex items-center justify-center">
          <span className="text-white text-2xl font-bold">H</span>
        </div>
        <Spinner size="lg" />
      </div>
    )
  }

  if (!user) {
    console.log('ProtectedRoute: redirecting to login')
    return <Navigate to="/login" replace />
  }

  return children
}

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route
          path="/tasks/checklist"
          element={
            <ProtectedRoute>
              <Navigate to="/?tab=tasks&tasksTab=checklist" replace />
            </ProtectedRoute>
          }
        />
        <Route
          path="/tasks"
          element={
            <ProtectedRoute>
              <Navigate to="/?tab=tasks" replace />
            </ProtectedRoute>
          }
        />
        <Route 
          path="/" 
          element={
            <ProtectedRoute>
              <Dashboard />
            </ProtectedRoute>
          } 
        />
        <Route 
          path="/mobile" 
          element={
            <ProtectedRoute>
              <MobileDashboard />
            </ProtectedRoute>
          } 
        />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  )
}

export default App
