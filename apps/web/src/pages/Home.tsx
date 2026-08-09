import { useAuth } from '../lib/AuthContext'
import { supabase } from '../lib/supabase'

export default function Home() {
  const { user } = useAuth()

  return (
    <div className="p-8">
      <h1 className="text-2xl font-bold">Welcome to AbsoluteCinema 🎬</h1>
      <p className="mt-2 text-gray-600">Logged in as {user?.email}</p>
      <button
        onClick={() => supabase.auth.signOut()}
        className="mt-4 rounded bg-gray-200 px-4 py-2"
      >
        Sign out
      </button>
    </div>
  )
}