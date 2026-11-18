import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'
import { fetchSession, signOut as authSignOut, type SessionUser } from './api'

interface AuthContextType {
  user: SessionUser | null
  loading: boolean
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  loading: true,
  signOut: async () => {},
})

/**
 * Session comes from Auth.js (an encrypted cookie). The profile row is created
 * server-side on first sign-in, so there's nothing to set up here.
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<SessionUser | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let mounted = true
    fetchSession()
      .then((sessionUser) => {
        if (mounted) setUser(sessionUser)
      })
      .catch((error) => console.error('Session check failed:', error))
      .finally(() => {
        if (mounted) setLoading(false)
      })
    return () => {
      mounted = false
    }
  }, [])

  const signOut = useCallback(async () => {
    await authSignOut().catch((error) => console.error('Sign-out failed:', error))
    setUser(null)
  }, [])

  return <AuthContext.Provider value={{ user, loading, signOut }}>{children}</AuthContext.Provider>
}

export const useAuth = () => useContext(AuthContext)
