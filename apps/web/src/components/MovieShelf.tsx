import { useState } from 'react'
import LockIcon from './LockIcon'

export interface ProfileMovie {
  id: string
  tmdb_id: number
  title: string
  poster_path: string | null
  release_year: number | null
  media_type: string
  rating?: number
  /** A private log: only the owner sees it. */
  is_private?: boolean
}

export interface ProfileRating {
  id: string
  movie: ProfileMovie
  rating: number
  description: string | null
  watched_date: string | null
  date_type: 'exact' | 'release' | 'unknown'
  is_private?: boolean
}

interface MovieShelfProps {
  title: string
  subtitle?: string
  movies: ProfileMovie[]
  emptyState: React.ReactNode
  onMovieClick: (movie: ProfileMovie) => void
  onEditRating?: (rating: ProfileRating) => void
  ratings: ProfileRating[]
  onRemoveMovie?: (movie: ProfileMovie) => void
  /** Adds type chips, sort and search above the shelf. */
  filterable?: boolean
  /** "grid" shows everything at once (Library); "rail" scrolls and can expand. */
  layout?: 'rail' | 'grid'
  /** Hide the visual heading when the page tab already names the list. */
  hideHeading?: boolean
}

/** Poster shelf with optional filters. Module-level so its state survives parent re-renders. */
export default function MovieShelf({
  title,
  subtitle,
  movies,
  emptyState,
  onMovieClick,
  onEditRating,
  ratings,
  onRemoveMovie,
  filterable = false,
  layout = 'rail',
  hideHeading = false,
}: MovieShelfProps) {
  const [expanded, setExpanded] = useState(layout === 'grid')
  const [kind, setKind] = useState<'all' | 'movie' | 'tv'>('all')
  const [sort, setSort] = useState<'recent' | 'high' | 'low' | 'title' | 'year'>('recent')
  const [query, setQuery] = useState('')

  const needle = query.trim().toLowerCase()
  const filtered = filterable
    ? movies
        .filter((movie) => kind === 'all' || (movie.media_type === 'tv' ? 'tv' : 'movie') === kind)
        .filter((movie) => !needle || movie.title.toLowerCase().includes(needle))
    : movies
  const ordered =
    sort === 'recent'
      ? filtered
      : [...filtered].sort((a, b) =>
          sort === 'title' ? a.title.localeCompare(b.title)
          : sort === 'year' ? (b.release_year ?? 0) - (a.release_year ?? 0) || a.title.localeCompare(b.title)
          : sort === 'high' ? (b.rating ?? 0) - (a.rating ?? 0) || a.title.localeCompare(b.title)
          : (a.rating ?? 0) - (b.rating ?? 0) || a.title.localeCompare(b.title),
        )
  const narrowed = filterable && (kind !== 'all' || needle !== '')
  const showGrid = expanded || narrowed
  const visibleMovies = showGrid ? ordered : ordered.slice(0, 12)
  const headingId = `shelf-${title.toLowerCase().replace(/\s+/g, '-')}`
  const counts = {
    all: movies.length,
    movie: movies.filter((m) => m.media_type !== 'tv').length,
    tv: movies.filter((m) => m.media_type === 'tv').length,
  }

  return (
    <section aria-labelledby={headingId}>
      <div className={`mb-5 flex items-end justify-between gap-4 ${hideHeading ? 'sr-only' : ''}`}>
        <div>
          <h2 id={headingId} className="font-display text-3xl font-extrabold">
            {title} {movies.length > 0 && <span className="text-ink-muted tabular">{movies.length}</span>}
          </h2>
          {subtitle && <p className="mt-1 text-sm text-ink-muted">{subtitle}</p>}
        </div>
        {layout === 'rail' && !narrowed && movies.length > 12 && (
          <button
            type="button"
            onClick={() => setExpanded((value) => !value)}
            aria-expanded={expanded}
            className="shrink-0 rounded-full border border-line px-4 py-2 text-sm font-semibold text-ink-muted transition-colors hover:border-ink-muted hover:text-ink"
          >
            {expanded ? 'Show fewer' : `Show all ${movies.length}`}
          </button>
        )}
      </div>

      {filterable && movies.length > 0 && (
        <div className="mb-6 flex flex-wrap items-center gap-2">
          <div className="inline-flex gap-1 rounded-full bg-raised p-1" role="group" aria-label="Show">
            {([['all', 'All'], ['movie', 'Films'], ['tv', 'Series']] as const).map(([value, label]) => (
              <button
                key={value}
                type="button"
                aria-pressed={kind === value}
                onClick={() => setKind(value)}
                className={`rounded-full px-3.5 py-1.5 text-sm font-medium transition-colors ${kind === value ? 'bg-surface text-ink shadow-sm' : 'text-ink-muted hover:text-ink'}`}
              >
                {label} <span className="tabular text-ink-muted">{counts[value]}</span>
              </button>
            ))}
          </div>
          <label className="sr-only" htmlFor={`${headingId}-sort`}>Sort by</label>
          <select
            id={`${headingId}-sort`}
            value={sort}
            onChange={(event) => setSort(event.target.value as typeof sort)}
            className="rounded-full border border-line bg-surface px-3.5 py-1.5 text-sm font-medium text-ink focus:border-brand focus:outline-none"
          >
            <option value="recent">Newest first</option>
            <option value="high">Highest rated</option>
            <option value="low">Lowest rated</option>
            <option value="year">Release year</option>
            <option value="title">Title A–Z</option>
          </select>
          <label className="sr-only" htmlFor={`${headingId}-search`}>Search {title.toLowerCase()}</label>
          <input
            id={`${headingId}-search`}
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search titles"
            className="min-w-0 flex-1 rounded-full border border-line bg-surface px-4 py-1.5 text-sm text-ink placeholder:text-ink-muted focus:border-brand focus:outline-none sm:max-w-xs"
          />
          {narrowed && (
            <span className="text-sm text-ink-muted tabular" role="status">
              {ordered.length} of {movies.length}
            </span>
          )}
        </div>
      )}

      {movies.length > 0 && ordered.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-line px-6 py-8 text-sm text-ink-muted">
          Nothing matches “{query}”. Try a different word or switch back to All.
        </div>
      ) : movies.length > 0 ? (
        <ul className={showGrid ? 'grid grid-cols-3 gap-x-4 gap-y-6 sm:grid-cols-4 lg:grid-cols-6' : 'rail -mx-4 flex gap-4 overflow-x-auto px-4 pb-2 sm:-mx-6 sm:px-6'}>
          {visibleMovies.map((movie) => {
            const rating = onEditRating ? ratings.find((item) => item.movie.id === movie.id) : undefined
            return (
              <li key={movie.id} className={showGrid ? 'min-w-0' : 'w-[128px] shrink-0 sm:w-[144px]'}>
                <button type="button" onClick={() => onMovieClick(movie)} className="group block w-full rounded-xl text-left">
                  <span className="poster relative block aspect-[2/3] overflow-hidden rounded-xl bg-raised shadow-poster">
                    {movie.poster_path ? (
                      <img src={`https://image.tmdb.org/t/p/w300${movie.poster_path}`} alt="" loading="lazy" className="h-full w-full object-cover" />
                    ) : (
                      <span className="flex h-full items-center justify-center p-3 text-center font-display text-lg font-bold text-ink-muted">{movie.title}</span>
                    )}
                    {movie.rating !== undefined && <span className="ticket absolute left-2 top-2 text-base">{movie.rating.toFixed(1)}</span>}
                    {movie.is_private && (
                      <span className="absolute right-2 top-2 flex h-7 w-7 items-center justify-center rounded-full bg-[rgb(var(--shadow)/0.7)] text-white backdrop-blur-sm" title="Private log: only you can see it">
                        <LockIcon className="h-3.5 w-3.5" />
                        <span className="sr-only">Private log</span>
                      </span>
                    )}
                  </span>
                  <span className="mt-2.5 block truncate text-sm font-semibold">{movie.title}</span>
                  <span className="block text-xs text-ink-muted">{movie.release_year ?? 'Year unknown'}</span>
                </button>
                {onRemoveMovie && (
                  <button
                    type="button"
                    onClick={() => onRemoveMovie(movie)}
                    aria-label={`Remove ${movie.title} from watchlist`}
                    className="mt-1 text-xs font-medium text-ink-muted hover:text-danger"
                  >
                    Remove
                  </button>
                )}
                {rating && onEditRating && (
                  <button
                    type="button"
                    onClick={() => onEditRating(rating)}
                    aria-label={`Change your rating of ${movie.title}`}
                    className="mt-1 text-xs font-medium text-ink-muted hover:text-brand"
                  >
                    Change rating
                  </button>
                )}
              </li>
            )
          })}
        </ul>
      ) : (
        emptyState
      )}
    </section>
  )
}
