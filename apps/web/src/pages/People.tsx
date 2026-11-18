import { useCallback, useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { api, errorMessage } from '../lib/api'
import { usePageTitle } from '../lib/usePageTitle'
import PersonRow, { useFollowToggle, type Person } from '../components/PersonRow'

export default function People() {
  usePageTitle('People')
  const [params, setParams] = useSearchParams()
  const [query, setQuery] = useState(params.get('q') ?? '')
  const [people, setPeople] = useState<Person[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const requestRef = useRef(0)
  const update = useCallback((id: string, change: (person: Person) => Person) => {
    setPeople((list) => list.map((p) => (p.id === id ? change(p) : p)))
  }, [])
  const { toggle, busy } = useFollowToggle(update)

  const needle = query.trim()

  // Debounced search; the query lives in the URL so results survive Back and can be shared.
  useEffect(() => {
    const id = ++requestRef.current
    setLoading(true)
    const timer = window.setTimeout(() => {
      setParams(needle ? { q: needle } : {}, { replace: true })
      api<{ people: Person[] }>(`people?q=${encodeURIComponent(needle)}`)
        .then(({ people: rows }) => {
          if (id !== requestRef.current) return
          setPeople(rows)
          setError(null)
        })
        .catch((err) => id === requestRef.current && setError(errorMessage(err, 'People didn’t load. Try again.')))
        .finally(() => id === requestRef.current && setLoading(false))
    }, needle ? 250 : 0)
    return () => window.clearTimeout(timer)
  }, [needle, setParams])

  return (
    <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
      <header className="hero-in">
        <h1 className="font-display text-[clamp(3rem,8vw,5.5rem)] font-black uppercase leading-[0.85]">People</h1>
        <p className="mt-3 max-w-lg text-ink-muted">Find friends by name or username. Follow them and their ratings show up in your feed.</p>
      </header>

      <div className="relative mt-8">
        <svg viewBox="0 0 24 24" className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-ink-muted" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden="true">
          <circle cx="11" cy="11" r="7" />
          <path strokeLinecap="round" d="M20 20l-3.5-3.5" />
        </svg>
        <label htmlFor="people-search" className="sr-only">Search people</label>
        <input
          id="people-search"
          type="search"
          autoFocus
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search by name or @username"
          className="w-full rounded-full border border-line bg-raised py-3 pl-12 pr-5 text-ink placeholder:text-ink-muted focus:border-brand focus:outline-none"
        />
      </div>

      <h2 className="mt-8 text-sm font-semibold text-ink-muted" aria-live="polite">
        {loading ? 'Searching…' : needle ? `${people.length} ${people.length === 1 ? 'match' : 'matches'} for “${needle}”` : 'Suggested for you'}
      </h2>

      {error ? (
        <p role="alert" className="mt-4 rounded-xl border border-danger/30 bg-danger/10 px-4 py-3 text-sm text-danger">{error}</p>
      ) : loading && people.length === 0 ? (
        <ul className="mt-4 space-y-3" aria-hidden="true">
          {Array.from({ length: 4 }, (_, i) => <li key={i} className="skeleton h-20 rounded-2xl" />)}
        </ul>
      ) : people.length === 0 ? (
        <div className="mt-4 rounded-2xl border border-dashed border-line px-6 py-10 text-center">
          <p className="font-display text-2xl font-extrabold">{needle ? 'No one by that name' : 'It’s just you so far'}</p>
          <p className="mt-1 text-sm text-ink-muted">{needle ? 'Check the spelling, or try part of their username.' : 'Invite friends to sign in and they’ll appear here.'}</p>
        </div>
      ) : (
        <ul className={`mt-4 space-y-3 transition-opacity ${loading ? 'opacity-60' : ''}`}>
          {people.map((person) => (
            <PersonRow key={person.id} person={person} busy={busy === person.id} onToggle={(p) => void toggle(p)} />
          ))}
        </ul>
      )}
    </div>
  )
}
