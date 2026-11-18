import { useState, useEffect, useRef } from 'react'

export interface SearchResult {
  tmdb_id: number
  title: string
  poster_path: string | null
  release_year: string | null
  media_type: 'movie' | 'tv'
}

interface MovieSearchProps {
  onSelect: (result: SearchResult) => void
}

type Filter = 'all' | 'movie' | 'tv'

const POSTER_BASE_URL = 'https://image.tmdb.org/t/p/w200'

export default function MovieSearch({ onSelect }: MovieSearchProps) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<SearchResult[]>([])
  const [filter, setFilter] = useState<Filter>('all')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(false)
  const [showDropdown, setShowDropdown] = useState(false)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const requestRef = useRef<AbortController | null>(null)

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    requestRef.current?.abort()

    if (query.trim().length < 2) {
      setResults([])
      setShowDropdown(false)
      return
    }

    debounceRef.current = setTimeout(async () => {
      const controller = new AbortController()
      requestRef.current = controller
      setLoading(true)
      setError(false)
      try {
        const res = await fetch(`/api/tmdb/search?query=${encodeURIComponent(query)}`, {
          signal: controller.signal,
        })
        if (!res.ok) throw new Error('Search request failed')
        const data = await res.json()
        setResults(data.results || [])
        setShowDropdown(true)
      } catch (err) {
        if (err instanceof DOMException && err.name === 'AbortError') return
        console.error('Search error:', err)
        setResults([])
        setError(true)
        setShowDropdown(true)
      } finally {
        setLoading(false)
      }
    }, 150)

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
      requestRef.current?.abort()
    }
  }, [query])

  const handleSelect = (result: SearchResult) => {
    onSelect(result)
    setQuery('')
    setResults([])
    setShowDropdown(false)
  }

  const filtered = results.filter((r) => filter === 'all' || r.media_type === filter)

  const filterLabel = (f: Filter) => (f === 'all' ? 'All' : f === 'movie' ? 'Films' : 'Series')

  return (
    <div className="w-full">
      <div className="relative">
        <svg viewBox="0 0 24 24" className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-ink-muted" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35M17 11a6 6 0 11-12 0 6 6 0 0112 0z" />
        </svg>
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => results.length > 0 && setShowDropdown(true)}
          placeholder="Search films and series"
          aria-label="Search films and series"
          autoFocus
          className="w-full rounded-full border border-line bg-raised py-3 pl-12 pr-12 text-ink placeholder:text-ink-muted focus:border-brand focus:outline-none"
        />
        {loading && (
          <span
            role="status"
            aria-label="Searching"
            className="absolute right-4 top-1/2 h-5 w-5 -translate-y-1/2 animate-spin rounded-full border-2 border-line border-t-brand"
          />
        )}
      </div>

      <div className="mt-3 inline-flex gap-1 rounded-full bg-raised p-1" role="group" aria-label="Filter results">
        {(['all', 'movie', 'tv'] as Filter[]).map((f) => (
          <button
            key={f}
            type="button"
            aria-pressed={filter === f}
            onClick={() => setFilter(f)}
            className={`rounded-full px-3.5 py-1 text-sm font-medium transition-colors ${
              filter === f ? 'bg-surface text-ink shadow-sm' : 'text-ink-muted hover:text-ink'
            }`}
          >
            {filterLabel(f)}
          </button>
        ))}
      </div>

      {showDropdown && filtered.length > 0 && (
        <ul className="mt-3 max-h-[50vh] overflow-y-auto rounded-xl border border-line" aria-label="Search results">
          {filtered.map((result) => (
            <li key={`${result.media_type}-${result.tmdb_id}`} className="border-b border-line last:border-b-0">
              <button
                type="button"
                onClick={() => handleSelect(result)}
                className="flex w-full items-center gap-3 px-3 py-2.5 text-left transition-colors hover:bg-raised focus-visible:bg-raised"
              >
                {result.poster_path ? (
                  <img src={`${POSTER_BASE_URL}${result.poster_path}`} alt="" loading="lazy" className="h-14 w-10 shrink-0 rounded-md object-cover" />
                ) : (
                  <span className="flex h-14 w-10 shrink-0 items-center justify-center rounded-md bg-raised text-[10px] text-ink-muted">None</span>
                )}
                <span className="min-w-0">
                  <span className="block truncate font-semibold">{result.title}</span>
                  <span className="block text-sm text-ink-muted">
                    {result.release_year || 'Year unknown'}, {result.media_type === 'movie' ? 'film' : 'series'}
                  </span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}

      {showDropdown && !loading && error && (
        <p role="alert" className="mt-3 rounded-xl bg-danger/10 px-4 py-3 text-sm text-danger">
          Search isn't reachable. Start the API with <code className="font-semibold">npx vercel dev</code> instead of <code className="font-semibold">npm run dev</code>, then try again.
        </p>
      )}

      {showDropdown && !loading && !error && filtered.length === 0 && query.trim().length >= 2 && (
        <p role="status" className="mt-3 rounded-xl border border-dashed border-line px-4 py-5 text-center text-sm text-ink-muted">
          No {filter === 'all' ? 'results' : filter === 'movie' ? 'films' : 'series'} match "{query.trim()}". Check the spelling or try the original title.
        </p>
      )}

      {query.trim().length < 2 && (
        <p className="mt-3 text-sm text-ink-muted">Type at least 2 letters to search.</p>
      )}
    </div>
  )
}
