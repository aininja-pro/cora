import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom'
import { useState, useEffect } from 'react'
import Landing from './pages/Landing'
import Dashboard from './pages/Dashboard'
import Properties from './pages/Properties'
import CallsSimple from './pages/CallsSimple'
import CallDetail from './pages/CallDetail'
import Layout from './components/Layout'
import ErrorBoundary from './components/ErrorBoundary'

function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(false)

  useEffect(() => {
    // Check if user is logged in (for demo, we'll use localStorage)
    const agent = localStorage.getItem('agent')
    if (agent) {
      setIsAuthenticated(true)
    }
  }, [])

  const handleLogin = () => {
    // Demo login - in production, this would be real auth
    const demoAgent = {
      id: '11111111-1111-1111-1111-111111111111',
      name: 'Demo Agent',
      email: 'agent@demo.com',
      company: 'Demo Realty'
    }
    localStorage.setItem('agent', JSON.stringify(demoAgent))
    setIsAuthenticated(true)
  }

  const handleLogout = () => {
    localStorage.removeItem('agent')
    setIsAuthenticated(false)
  }

  return (
    <Router>
      <Routes>
        <Route 
          path="/" 
          element={
            isAuthenticated ? 
              <Navigate to="/dashboard" /> : 
              <Landing onLogin={handleLogin} />
          } 
        />
        <Route
          path="/dashboard"
          element={
            isAuthenticated ?
              <ErrorBoundary>
                <Layout onLogout={handleLogout}>
                  <Dashboard />
                </Layout>
              </ErrorBoundary> :
              <Navigate to="/" />
          }
        />
        <Route
          path="/properties"
          element={
            isAuthenticated ? 
              <Layout onLogout={handleLogout}>
                <Properties />
              </Layout> : 
              <Navigate to="/" />
          }
        />
        <Route
          path="/calls"
          element={
            isAuthenticated ? 
              <Layout onLogout={handleLogout}>
                <CallsSimple />
              </Layout> : 
              <Navigate to="/" />
          }
        />
        <Route
          path="/calls/:callId"
          element={
            isAuthenticated ? 
              <Layout onLogout={handleLogout}>
                <CallDetail />
              </Layout> : 
              <Navigate to="/" />
          }
        />
      </Routes>
    </Router>
  )
}

export default App