import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import type { Session, User } from '@supabase/supabase-js'
import { supabase } from './supabase'

interface AuthContextType {
  user: User | null
  session: Session | null
  loading: boolean
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  session: null,
  loading: true,
})

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let mounted = true
    const timeout = setTimeout(() => {
      if (mounted && loading) {
        console.warn('Auth loading timeout - forcing load complete')
        setLoading(false)
      }
    }, 5000) // 5 second timeout

    supabase.auth.getSession().then(({ data: { session } }) => {
      if (mounted) {
        setSession(session)
        setLoading(false)
        clearTimeout(timeout)
      }
    }).catch((error) => {
      console.error('Auth session error:', error)
      if (mounted) {
        setLoading(false)
        clearTimeout(timeout)
      }
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        if (mounted) {
          setSession(session)
        }
      }
    )

    return () => {
      mounted = false
      clearTimeout(timeout)
      subscription.unsubscribe()
    }
  }, [])

  // Ensure a profiles row exists the first time someone logs in
  useEffect(() => {
    if (!session?.user) return

    const ensureProfile = async () => {
      const { data: existing } = await supabase
        .from('profiles')
        .select('id')
        .eq('id', session.user.id)
        .single()

      if (!existing) {
        const meta = session.user.user_metadata
        await supabase.from('profiles').insert({
          id: session.user.id,
          username: (meta.full_name || meta.name || session.user.email!.split('@')[0])
            .toLowerCase()
            .replace(/\s+/g, '_'),
          display_name: meta.full_name || meta.name || 'New User',
          avatar_url: meta.avatar_url || meta.picture || null,
        })
      }
    }

    ensureProfile()
  }, [session])

  return (
    <AuthContext.Provider value={{ user: session?.user ?? null, session, loading }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => useContext(AuthContext)