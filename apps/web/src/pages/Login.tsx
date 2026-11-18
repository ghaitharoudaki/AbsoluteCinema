import { useState } from 'react'
import { supabase } from '../lib/supabase'

const SAMPLE_LOGS = [
  { who: 'Sam', title: 'Past Lives', score: '9.0', note: 'Quietly wrecked me.' },
  { who: 'Noor', title: 'Dune: Part Two', score: '8.5', note: 'See it on the biggest screen.' },
  { who: 'Leo', title: 'The Room', score: '2.0', note: 'Perfect for group night, though.' },
]

export default function Login() {
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleGoogleLogin = async () => {
    setPending(true)
    setError(null)
    const { error } = await supabase.auth.signInWithOAuth({ provider: 'google' })
    if (error) {
      setError(`Google sign-in didn't start: ${error.message}. Try again.`)
      setPending(false)
    }
  }

  return (
    <div className="min-h-screen bg-canvas text-ink">
      <div className="mx-auto grid min-h-screen max-w-6xl items-center gap-12 px-6 py-12 lg:grid-cols-[1.25fr_1fr] lg:gap-20">
        <section>
          <h1 className="font-display text-[clamp(4rem,13vw,9.5rem)] font-black uppercase leading-[0.82]">
            Absolute
            <br />
            <span className="text-brand">Cinema</span>
          </h1>
          <p className="mt-6 max-w-md text-lg text-ink-muted">
            A private movie log for your friends. Rate what you watch, see what the group thinks, and keep a watchlist for the next movie night.
          </p>

          <ul className="mt-10 hidden max-w-md space-y-2 sm:block" aria-label="Example activity">
            {SAMPLE_LOGS.map((log) => (
              <li key={log.title} className="flex items-center gap-4 rounded-xl border border-line bg-surface px-4 py-3">
                <span className="ticket text-lg">{log.score}</span>
                <p className="min-w-0 text-sm">
                  <span className="font-semibold">{log.who}</span> rated <span className="font-semibold">{log.title}</span>
                  <span className="block truncate text-ink-muted">{log.note}</span>
                </p>
              </li>
            ))}
          </ul>
        </section>

        <section className="rounded-2xl border border-line bg-surface p-8 sm:p-10 lg:shadow-dialog" aria-labelledby="signin-title">
          <h2 id="signin-title" className="font-display text-4xl font-extrabold uppercase">
            Sign in
          </h2>
          <p className="mt-3 text-ink-muted">Use your Google account. Only people in your group can see your ratings.</p>

          <button
            type="button"
            onClick={() => void handleGoogleLogin()}
            disabled={pending}
            className="mt-8 flex w-full items-center justify-center gap-3 rounded-full bg-brand px-6 py-3.5 font-bold text-on-brand transition-colors hover:bg-brand-hover disabled:cursor-wait disabled:opacity-70"
          >
            <svg viewBox="0 0 24 24" className="h-5 w-5" aria-hidden="true">
              <path fill="currentColor" d="M21.35 11.1H12v2.98h5.35c-.23 1.4-1.66 4.1-5.35 4.1-3.22 0-5.85-2.67-5.85-5.96S8.78 6.26 12 6.26c1.83 0 3.06.78 3.76 1.45l2.57-2.47C16.68 3.7 14.55 2.75 12 2.75 6.9 2.75 2.75 6.9 2.75 12S6.9 21.25 12 21.25c5.34 0 8.88-3.75 8.88-9.04 0-.6-.07-1.07-.15-1.53z" />
            </svg>
            {pending ? 'Opening Google…' : 'Continue with Google'}
          </button>

          <p role="alert" className="mt-4 min-h-[1.25rem] text-sm text-danger">
            {error}
          </p>
        </section>
      </div>
    </div>
  )
}
