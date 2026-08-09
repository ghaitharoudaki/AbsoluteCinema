import { supabase } from '../lib/supabase'

export default function Login() {
  const handleGoogleLogin = async () => {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
    })
    if (error) console.error('Login error:', error.message)
  }

  return (
    <div className="flex min-h-screen items-center justify-center">
      <button
        onClick={handleGoogleLogin}
        className="rounded-lg bg-white px-6 py-3 font-medium text-gray-800 shadow hover:bg-gray-100"
      >
        Sign in with Google
      </button>
    </div>
  )
}