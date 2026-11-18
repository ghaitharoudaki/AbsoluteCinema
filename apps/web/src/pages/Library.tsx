import { useCallback, useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { api, errorMessage } from '../lib/api'
import { useMe } from '../lib/MeContext'
import { useLogFlow } from '../lib/LogFlow'
import { useToast } from '../lib/Toast'
import { usePageTitle } from '../lib/usePageTitle'
import { groupByMonth, pickRandom } from '../lib/library'
import MovieShelf, { type ProfileMovie, type ProfileRating } from '../components/MovieShelf'
import type { SearchResult } from '../components/MovieSearch'
import LockIcon from '../components/LockIcon'

type Tab = 'watched' | 'diary' | 'watchlist'

const tabs: { id: Tab; label: string }[] = [
  { id: 'watched', label: 'Watched' },
  { id: 'diary', label: 'Diary' },
  { id: 'watchlist', label: 'Watchlist' },
]

const toSearchResult = (movie: ProfileMovie): SearchResult => ({
  tmdb_id: movie.tmdb_id,
  title: movie.title,
  poster_path: movie.poster_path,
  release_year: movie.release_year ? String(movie.release_year) : null,
  media_type: movie.media_type === 'tv' ? 'tv' : 'movie',
})

function EmptyState({ title, body, action }: { title: string; body: string; action?: ReactNode }) {
  return (
    <div className="rounded-2xl border border-dashed border-line px-6 py-12 text-center">
      <p className="font-display text-2xl font-extrabold">{title}</p>
      <p className="mx-auto mt-1 max-w-sm text-sm text-ink-muted">{body}</p>
      {action && <div className="mt-5">{action}</div>}
    </div>
  )
}

export default function Library() {
  const [params, setParams] = useSearchParams()
  const requested = params.get('tab') as Tab | null
  const tab: Tab = requested && tabs.some((t) => t.id === requested) ? requested : 'watched'
  usePageTitle(`${tabs.find((t) => t.id === tab)!.label} · Library`)

  const { me } = useMe()
  const { openSearch, openTitle, openRating, version } = useLogFlow()
  const toast = useToast()
  const [ratings, setRatings] = useState<ProfileRating[]>([])
  const [watchlist, setWatchlist] = useState<ProfileMovie[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const tabRefs = useRef<Record<Tab, HTMLButtonElement | null>>({ watched: null, diary: null, watchlist: null })

  const load = useCallback(async () => {
    if (!me) return
    setError(null)
    try {
      const data = await api<{ ratings: ProfileRating[]; watchlist: ProfileMovie[] }>(`profiles/${encodeURIComponent(me.username)}`)
      setRatings(data.ratings)
      setWatchlist(data.watchlist)
    } catch (err) {
      setError(errorMessage(err, 'Your library didn’t load. Try again.'))
    } finally {
      setLoading(false)
    }
  }, [me])

  useEffect(() => {
    void load()
  }, [load, version])

  const selectTab = (next: Tab) => setParams(next === 'watched' ? {} : { tab: next }, { replace: true })

  // Arrow keys move between tabs (WAI-ARIA tabs pattern).
  const onTabKey = (event: KeyboardEvent<HTMLButtonElement>) => {
    const index = tabs.findIndex((t) => t.id === tab)
    const step = event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0
    const target = event.key === 'Home' ? tabs[0] : event.key === 'End' ? tabs[tabs.length - 1] : step ? tabs[(index + step + tabs.length) % tabs.length] : null
    if (!target) return
    event.preventDefault()
    selectTab(target.id)
    tabRefs.current[target.id]?.focus()
  }

  const removeFromWatchlist = async (movie: ProfileMovie) => {
    const index = watchlist.findIndex((item) => item.id === movie.id)
    setWatchlist((list) => list.filter((item) => item.id !== movie.id))
    try {
      await api(`watchlist/${movie.id}`, { method: 'DELETE' })
      toast(`${movie.title} removed from your watchlist`, {
        action: {
          label: 'Undo',
          onClick: () => {
            setWatchlist((list) => [...list.slice(0, index), movie, ...list.slice(index)])
            api('watchlist', { method: 'POST', body: { movie_id: movie.id } }).catch(() => {
              toast(`${movie.title} couldn’t be put back. Add it again from its page.`, { tone: 'error' })
              void load()
            })
          },
        },
      })
    } catch (err) {
      setWatchlist((list) => [...list.slice(0, index), movie, ...list.slice(index)])
      toast(errorMessage(err, 'That title couldn’t be removed. Try again.'), { tone: 'error' })
    }
  }

  const watched = ratings.map((row) => ({ ...row.movie, rating: Number(row.rating), is_private: row.is_private }))
  const films = ratings.filter((r) => r.movie.media_type !== 'tv').length
  const average = ratings.length ? ratings.reduce((sum, r) => sum + Number(r.rating), 0) / ratings.length : null
  const logButton = (
    <button type="button" onClick={openSearch} className="rounded-full bg-brand px-5 py-2 text-sm font-bold text-on-brand hover:bg-brand-hover">
      Log a film
    </button>
  )

  return (
    <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
      <header className="hero-in flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="font-display text-[clamp(3rem,8vw,5.5rem)] font-black uppercase leading-[0.85]">Library</h1>
          <p className="mt-3 text-ink-muted">
            {loading
              ? 'Pulling your reels…'
              : ratings.length === 0
                ? 'Everything you log and save lives here.'
                : `${films} ${films === 1 ? 'film' : 'films'} and ${ratings.length - films} series logged${average ? `, averaging ${average.toFixed(1)}` : ''}.`}
          </p>
        </div>
        <Link to="/import" className="self-start rounded-full border border-line px-4 py-2 text-sm font-semibold text-ink-muted transition-colors hover:border-ink-muted hover:text-ink sm:self-auto">
          Import from Letterboxd or Simkl
        </Link>
      </header>

      <div role="tablist" aria-label="Library" className="mt-8 flex gap-1 border-b border-line">
        {tabs.map((t) => {
          const count = t.id === 'watchlist' ? watchlist.length : ratings.length
          const selected = tab === t.id
          return (
            <button
              key={t.id}
              ref={(node) => {
                tabRefs.current[t.id] = node
              }}
              id={`tab-${t.id}`}
              role="tab"
              type="button"
              aria-selected={selected}
              aria-controls={`panel-${t.id}`}
              tabIndex={selected ? 0 : -1}
              onClick={() => selectTab(t.id)}
              onKeyDown={onTabKey}
              className={`relative -mb-px flex items-center gap-2 border-b-2 px-4 py-3 text-sm font-semibold transition-colors ${
                selected ? 'border-brand text-ink' : 'border-transparent text-ink-muted hover:text-ink'
              }`}
            >
              {t.label}
              {!loading && t.id !== 'diary' && <span className="rounded-full bg-raised px-2 py-0.5 text-xs tabular text-ink-muted">{count}</span>}
            </button>
          )
        })}
      </div>

      <div role="tabpanel" id={`panel-${tab}`} aria-labelledby={`tab-${tab}`} tabIndex={0} className="pt-8 outline-none">
        {error ? (
          <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-danger/30 bg-danger/10 px-4 py-3 text-sm text-danger">
            {error}
            <button type="button" onClick={() => void load()} className="rounded-full border border-danger/40 px-3 py-1 font-semibold hover:bg-danger/10">
              Try again
            </button>
          </div>
        ) : loading ? (
          <div className="grid grid-cols-3 gap-4 sm:grid-cols-4 lg:grid-cols-6" aria-busy="true" aria-label="Loading your library">
            {Array.from({ length: 12 }, (_, i) => <div key={i} className="skeleton aspect-[2/3] rounded-xl" />)}
          </div>
        ) : tab === 'watched' ? (
          <MovieShelf
            title="Watched"
            hideHeading
            layout="grid"
            filterable
            movies={watched}
            ratings={ratings}
            onMovieClick={(movie) => openTitle(toSearchResult(movie))}
            onEditRating={(rating) => openRating(toSearchResult(rating.movie), rating)}
            emptyState={<EmptyState title="Nothing logged yet" body="Rate a film or series and it lands here, with filters to slice your history." action={logButton} />}
          />
        ) : tab === 'diary' ? (
          <Diary ratings={ratings} onEdit={(rating) => openRating(toSearchResult(rating.movie), rating)} emptyAction={logButton} />
        ) : (
          <Watchlist
            movies={watchlist}
            ratings={ratings}
            onOpen={(movie) => openTitle(toSearchResult(movie))}
            onRemove={(movie) => void removeFromWatchlist(movie)}
          />
        )}
      </div>
    </div>
  )
}

function Diary({ ratings, onEdit, emptyAction }: { ratings: ProfileRating[]; onEdit: (rating: ProfileRating) => void; emptyAction: ReactNode }) {
  const groups = groupByMonth(ratings)
  if (groups.length === 0) {
    return <EmptyState title="Your diary is empty" body="Each rating is filed under the day you watched it. Log something to start the first page." action={emptyAction} />
  }
  return (
    <div className="space-y-10">
      {groups.map((group) => (
        <section key={group.key} aria-labelledby={`month-${group.key}`}>
          <h2 id={`month-${group.key}`} className="sticky top-[57px] z-10 -mx-4 flex items-baseline justify-between bg-canvas/90 px-4 py-2 font-display text-2xl font-extrabold backdrop-blur-sm sm:-mx-6 sm:px-6">
            {group.label}
            <span className="font-body text-sm font-medium text-ink-muted tabular">{group.items.length} {group.items.length === 1 ? 'entry' : 'entries'}</span>
          </h2>
          <ol className="mt-2 divide-y divide-line">
            {group.items.map((rating) => {
              const date = rating.watched_date ? new Date(`${rating.watched_date}T00:00:00`) : null
              return (
                <li key={rating.id}>
                  <button
                    type="button"
                    onClick={() => onEdit(rating)}
                    aria-label={`${rating.movie.title}, rated ${Number(rating.rating).toFixed(1)}. Change rating`}
                    className="group flex w-full items-center gap-4 rounded-xl px-2 py-3 text-left transition-colors hover:bg-surface"
                  >
                    <span className="w-12 shrink-0 text-center" aria-hidden="true">
                      {date ? (
                        <>
                          <span className="block font-display text-3xl font-black leading-none tabular">{date.getDate()}</span>
                          <span className="block text-[11px] font-semibold text-ink-muted">{date.toLocaleDateString('en-US', { weekday: 'short' })}</span>
                        </>
                      ) : (
                        <span className="block text-lg text-ink-muted">–</span>
                      )}
                    </span>
                    <span className="h-16 w-11 shrink-0 overflow-hidden rounded-md bg-raised">
                      {rating.movie.poster_path && <img src={`https://image.tmdb.org/t/p/w200${rating.movie.poster_path}`} alt="" loading="lazy" className="h-full w-full object-cover" />}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-1.5 font-semibold">
                        <span className="truncate">{rating.movie.title}</span>
                        {rating.is_private && (
                          <span className="shrink-0 text-ink-muted" title="Private log: only you can see it">
                            <LockIcon className="h-3.5 w-3.5" />
                            <span className="sr-only">(private)</span>
                          </span>
                        )}
                      </span>
                      <span className="block text-xs text-ink-muted">
                        {rating.movie.release_year ?? 'Year unknown'}
                        {rating.movie.media_type === 'tv' ? ', series' : ''}
                        {rating.date_type === 'release' ? ', dated by release' : ''}
                      </span>
                      {rating.description && <span className="mt-1 line-clamp-1 block text-sm text-ink-muted">“{rating.description}”</span>}
                    </span>
                    <span className="ticket shrink-0 text-lg">{Number(rating.rating).toFixed(1)}</span>
                  </button>
                </li>
              )
            })}
          </ol>
        </section>
      ))}
    </div>
  )
}

function Watchlist({
  movies,
  ratings,
  onOpen,
  onRemove,
}: {
  movies: ProfileMovie[]
  ratings: ProfileRating[]
  onOpen: (movie: ProfileMovie) => void
  onRemove: (movie: ProfileMovie) => void
}) {
  const [spotlight, setSpotlight] = useState<ProfileMovie | null>(null)
  const [spinning, setSpinning] = useState(false)
  const spinTimer = useRef<number | null>(null)

  useEffect(() => () => {
    if (spinTimer.current) window.clearInterval(spinTimer.current)
  }, [])

  // Shuffle through a few posters before landing, like a reel spinning down.
  const spin = () => {
    if (movies.length === 0) return
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const final = pickRandom(movies.length > 1 ? movies.filter((m) => m.id !== spotlight?.id) : movies)
    if (reduced || movies.length < 3) {
      setSpotlight(final)
      return
    }
    setSpinning(true)
    let ticks = 0
    spinTimer.current = window.setInterval(() => {
      ticks += 1
      if (ticks >= 9) {
        window.clearInterval(spinTimer.current!)
        setSpotlight(final)
        setSpinning(false)
      } else {
        setSpotlight(pickRandom(movies))
      }
    }, 70 + ticks * 12)
  }

  if (movies.length === 0) {
    return (
      <EmptyState
        title="Nothing saved for later"
        body="Open any title and choose Add to watchlist. Then come back here when you can’t decide what to watch."
        action={
          <Link to="/discover" className="rounded-full bg-brand px-5 py-2 text-sm font-bold text-on-brand hover:bg-brand-hover">
            Browse Discover
          </Link>
        }
      />
    )
  }

  return (
    <div className="space-y-8">
      <section aria-labelledby="pick-title" className="overflow-hidden rounded-2xl border border-line bg-surface">
        <div className="flex flex-col gap-5 p-5 sm:flex-row sm:items-center">
          <div className="flex-1">
            <h2 id="pick-title" className="font-display text-2xl font-extrabold">Can’t decide?</h2>
            <p className="mt-1 text-sm text-ink-muted">Let the projector choose from your {movies.length} saved {movies.length === 1 ? 'title' : 'titles'}.</p>
            <button
              type="button"
              onClick={spin}
              disabled={spinning}
              className="mt-4 rounded-full bg-brand px-5 py-2 text-sm font-bold text-on-brand transition-colors hover:bg-brand-hover disabled:cursor-wait"
            >
              {spinning ? 'Rolling…' : spotlight ? 'Pick another' : 'Pick for me'}
            </button>
          </div>
          {spotlight && (
            <div className="flex items-center gap-4 sm:w-[22rem]" aria-live="polite">
              <span className={`h-36 w-24 shrink-0 overflow-hidden rounded-lg bg-raised shadow-poster ${spinning ? '' : 'spotlight-in'}`}>
                {spotlight.poster_path && <img src={`https://image.tmdb.org/t/p/w300${spotlight.poster_path}`} alt="" className="h-full w-full object-cover" />}
              </span>
              <span className="min-w-0">
                <span className="block text-xs font-semibold text-brand">{spinning ? 'Rolling…' : 'Tonight’s feature'}</span>
                <span className="mt-1 block font-display text-2xl font-extrabold leading-tight">{spotlight.title}</span>
                <span className="block text-sm text-ink-muted">{spotlight.release_year ?? 'Year unknown'}</span>
                {!spinning && (
                  <button type="button" onClick={() => onOpen(spotlight)} className="mt-2 text-sm font-semibold text-brand underline-offset-4 hover:underline">
                    Open details
                  </button>
                )}
              </span>
            </div>
          )}
        </div>
      </section>

      <MovieShelf
        title="Watchlist"
        hideHeading
        layout="grid"
        filterable
        movies={movies}
        ratings={ratings}
        onMovieClick={onOpen}
        onRemoveMovie={onRemove}
        emptyState={null}
      />
    </div>
  )
}
