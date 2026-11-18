import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { api } from './api'
import { useAuth } from './AuthContext'

export interface MyProfile {
  id: string
  username: string
  display_name: string | null
  avatar_url: string | null
  bio: string | null
}

interface MeContextType {
  me: MyProfile | null
  /** Call after saving the profile or photo so the nav updates at once. */
  setMe: (profile: MyProfile) => void
}

const MeContext = createContext<MeContextType>({ me: null, setMe: () => {} })

export function useMe() {
  return useContext(MeContext)
}

export function MeProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth()
  const [me, setMe] = useState<MyProfile | null>(null)

  useEffect(() => {
    if (!user) return
    api<{ profile: MyProfile }>('me')
      .then(({ profile }) => setMe(profile))
      .catch((error) => console.error('Profile lookup failed:', error))
  }, [user])

  return <MeContext.Provider value={{ me, setMe }}>{children}</MeContext.Provider>
}
