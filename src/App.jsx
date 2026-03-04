import { BrowserRouter, Routes, Route, Navigate, useNavigate } from 'react-router-dom'
import { useAuth } from './hooks/useAuth'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import Spinner from './components/ui/Spinner'

function ProtectedRoute({ children }) {
  const { user, loading } = useAuth()
  const navigate = useNavigate()

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
          path="/" 
          element={
            <ProtectedRoute>
              <Dashboard />
            </ProtectedRoute>
          } 
        />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  )
}

export default App
