import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './lib/AuthContext'
import { ThemeProvider } from './lib/ThemeContext'
import Login from './pages/Login'
import Home from './pages/Home'
import Discover from './pages/Discover'
import Library from './pages/Library'
import People from './pages/People'
import AppShell from './components/AppShell'
import Profile from './pages/Profile'
import Import from './pages/Import'
import './App.css'

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth()
  if (loading) return (
    <div className="flex min-h-screen items-center justify-center bg-canvas text-ink" role="status">
      <p className="text-center font-display text-5xl font-black uppercase leading-none">
        Absolute<span className="text-brand">Cinema</span>
        <span className="mt-3 block animate-pulse font-body text-sm font-medium normal-case text-ink-muted">Signing you in…</span>
      </p>
    </div>
  )
  if (!user) return <Navigate to="/login" replace />
  return <>{children}</>
}

function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route element={<ProtectedRoute><AppShell /></ProtectedRoute>}>
        <Route path="/" element={<Home />} />
        <Route path="/discover" element={<Discover />} />
        <Route path="/library" element={<Library />} />
        <Route path="/people" element={<People />} />
        <Route path="/import" element={<Import />} />
        <Route path="/profile/:username" element={<Profile />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  )
}

function App() {
  return (
    <ThemeProvider>
      <BrowserRouter>
        <AuthProvider>
          <AppRoutes />
        </AuthProvider>
      </BrowserRouter>
    </ThemeProvider>
  )
}

export default App