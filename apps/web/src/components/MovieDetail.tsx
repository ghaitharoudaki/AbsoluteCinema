import { useState, useEffect } from 'react'
import { api, ApiError, errorMessage } from '../lib/api'
import { useAuth } from '../lib/AuthContext'
import type { SearchResult } from '../components/MovieSearch'
import { ensureMovieInDb, fetchMovieDetails } from '../lib/movies'
import Dialog, { CloseButton } from './Dialog'
import type { ExistingRating } from '../pages/RateMovie'

interface MovieDetailProps {
  movie: SearchResult
  /** Called with the user's existing rating when they choose "Edit rating", or nothing for a new one. */
  onRate: (existing?: ExistingRating) => void
  onClose: () => void
}

interface TitleStatus {
  movieId: string | null
  rating: ExistingRating | null
  onWatchlist: boolean
}

interface CastMember {
  name: string
  character: string
  photo: string | null
}

interface Details {
  runtime_minutes: number | null
  episode_run_time: number | null
  number_of_episodes: number | null
  release_date: string | null
  overview: string | null
  genres: string[]
  vote_average: number | null
  vote_count: number | null
  budget: number | null
  revenue: number | null
  trailer_key: string | null
  cast: CastMember[]
}

const POSTER_BASE_URL = 'https://image.tmdb.org/t/p/w400'

function formatMoney(n: number | null) {
  if (!n) return null
  return `$${(n / 1_000_000).toFixed(1)}M`
}

export default function MovieDetail({ movie, onRate, onClose }: MovieDetailProps) {
  const { user } = useAuth()
  const [details, setDetails] = useState<Details | null>(null)
  const [loading, setLoading] = useState(true)
  const [status, setStatus] = useState<TitleStatus | null>(null)
  const [watchlistSaving, setWatchlistSaving] = useState(false)
  const [watchlistMessage, setWatchlistMessage] = useState<string | null>(null)

  useEffect(() => {
    fetchMovieDetails(movie.tmdb_id, movie.media_type).then((data) => {
      setDetails(data as Details | null)
      setLoading(false)
    })
  }, [movie])

  useEffect(() => {
    let cancelled = false
    setStatus(null)
    api<TitleStatus>(`titles/${movie.tmdb_id}/status?media_type=${movie.media_type}`)
      .then((data) => !cancelled && setStatus(data))
      // Without status we fall back to "not rated, not on watchlist"; the server still blocks duplicates.
      .catch(() => !cancelled && setStatus({ movieId: null, rating: null, onWatchlist: false }))
    return () => {
      cancelled = true
    }
  }, [movie])

  const myRating = status?.rating ?? null
  const onWatchlist = status?.onWatchlist ?? false

  const toggleWatchlist = async () => {
    if (!user) return
    if (!details && !onWatchlist) {
      setWatchlistMessage('Details are still loading. Try again in a moment.')
      return
    }
    setWatchlistSaving(true)
    setWatchlistMessage(null)

    try {
      if (onWatchlist && status?.movieId) {
        await api(`watchlist/${status.movieId}`, { method: 'DELETE' })
        setStatus((current) => current && { ...current, onWatchlist: false })
        setWatchlistMessage('Removed from your watchlist.')
      } else {
        const movieId = await ensureMovieInDb(movie, details)
        await api('watchlist', { method: 'POST', body: { movie_id: movieId } })
        setStatus((current) => ({ movieId, rating: current?.rating ?? null, onWatchlist: true }))
      }
    } catch (err) {
      console.error(err)
      setWatchlistMessage(
        err instanceof ApiError && err.code === 'already_rated'
          ? "You've already logged this, so it stays off your watchlist."
          : errorMessage(err, "Your watchlist didn't update. Try again."),
      )
    } finally {
      setWatchlistSaving(false)
    }
  }

  const runtime =
    movie.media_type === 'movie'
      ? details?.runtime_minutes
        ? `${details.runtime_minutes} min`
        : null
      : details?.number_of_episodes
        ? `${details.number_of_episodes} episodes`
        : null

  const meta = [movie.release_year || 'Unknown year', movie.media_type === 'movie' ? 'Film' : 'Series', runtime]
    .filter(Boolean)
    .join(', ')

  return (
    <Dialog onClose={onClose} title={movie.title} size="lg">
      <div className="max-h-[78vh] overflow-y-auto">
        <div className="relative">
          {movie.poster_path && (
            <div
              aria-hidden="true"
              className="absolute inset-0 bg-cover bg-center opacity-30 blur-2xl"
              style={{ backgroundImage: `url(${POSTER_BASE_URL}${movie.poster_path})` }}
            />
          )}
          <div className="absolute inset-0 bg-gradient-to-b from-transparent to-surface" aria-hidden="true" />

          <div className="relative flex gap-5 p-6">
            {movie.poster_path ? (
              <img
                src={`${POSTER_BASE_URL}${movie.poster_path}`}
                alt=""
                className="h-44 w-[7.3rem] shrink-0 rounded-xl object-cover shadow-poster sm:h-52 sm:w-[8.7rem]"
              />
            ) : (
              <div className="flex h-44 w-[7.3rem] shrink-0 items-center justify-center rounded-xl bg-raised text-xs text-ink-muted">
                No poster
              </div>
            )}

            <div className="min-w-0 flex-1 pt-1">
              <div className="flex items-start gap-2">
                <p className="flex-1 font-display text-4xl font-extrabold leading-[0.95] sm:text-5xl">{movie.title}</p>
                <CloseButton onClick={onClose} />
              </div>
              <p className="mt-3 text-sm text-ink-muted">{meta}</p>

              {!loading && details?.vote_average != null && details.vote_average > 0 && (
                <p className="mt-3 flex flex-wrap items-center gap-2 text-sm text-ink-muted">
                  <span className="ticket ticket-soft text-lg">{details.vote_average.toFixed(1)}</span>
                  TMDB average, {details.vote_count?.toLocaleString()} votes
                </p>
              )}

              {!loading && details && details.genres.length > 0 && (
                <ul className="mt-3 flex flex-wrap gap-1.5" aria-label="Genres">
                  {details.genres.map((g) => (
                    <li key={g} className="rounded-full bg-raised px-2.5 py-0.5 text-xs font-medium text-ink-muted">
                      {g}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>

        <div className="space-y-7 px-6 pb-6">
          {myRating && (
            <p className="flex items-center gap-3 rounded-xl bg-brand/10 px-4 py-3 text-sm font-medium text-brand">
              <span className="ticket text-base">{Number(myRating.rating).toFixed(1)}</span>
              You've logged this. Choose Edit rating to change or remove it.
            </p>
          )}

          {loading ? (
            <div className="space-y-2" aria-busy="true" aria-label="Loading details">
              <div className="skeleton h-3.5 w-full rounded" />
              <div className="skeleton h-3.5 w-11/12 rounded" />
              <div className="skeleton h-3.5 w-3/4 rounded" />
            </div>
          ) : (
            <>
              {details?.overview && <p className="max-w-prose leading-relaxed text-ink-muted">{details.overview}</p>}

              {details && details.cast.length > 0 && (
                <section>
                  <h3 className="mb-3 text-sm font-bold">Cast</h3>
                  <ul className="rail -mx-6 flex gap-4 overflow-x-auto px-6 pb-1">
                    {details.cast.map((c) => (
                      <li key={c.name} className="w-[4.5rem] shrink-0 text-center">
                        {c.photo ? (
                          <img src={c.photo} alt="" className="mx-auto h-16 w-16 rounded-full object-cover" />
                        ) : (
                          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-raised text-lg font-bold text-ink-muted">
                            {c.name.charAt(0)}
                          </div>
                        )}
                        <p className="mt-1.5 truncate text-xs font-semibold">{c.name}</p>
                        <p className="truncate text-[11px] text-ink-muted">{c.character}</p>
                      </li>
                    ))}
                  </ul>
                </section>
              )}

              {details?.trailer_key && (
                <div className="aspect-video w-full overflow-hidden rounded-xl bg-raised">
                  <iframe
                    src={`https://www.youtube.com/embed/${details.trailer_key}`}
                    title={`${movie.title} trailer`}
                    loading="lazy"
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                    allowFullScreen
                    className="h-full w-full"
                  />
                </div>
              )}

              {movie.media_type === 'movie' && (details?.budget || details?.revenue) && (
                <dl className="grid grid-cols-2 gap-3">
                  {details.budget ? (
                    <div className="rounded-xl bg-raised p-4">
                      <dt className="text-xs text-ink-muted">Budget</dt>
                      <dd className="mt-1 font-display text-2xl font-extrabold tabular">{formatMoney(details.budget)}</dd>
                    </div>
                  ) : null}
                  {details.revenue ? (
                    <div className="rounded-xl bg-raised p-4">
                      <dt className="text-xs text-ink-muted">Box office</dt>
                      <dd className="mt-1 font-display text-2xl font-extrabold tabular">{formatMoney(details.revenue)}</dd>
                    </div>
                  ) : null}
                </dl>
              )}
            </>
          )}
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-end gap-2 border-t border-line bg-canvas/40 px-6 py-4">
        <p role="status" className="mr-auto text-sm text-ink-muted">
          {watchlistMessage}
        </p>
        {!myRating && (
          <button
            type="button"
            onClick={() => void toggleWatchlist()}
            disabled={watchlistSaving || !status}
            aria-pressed={onWatchlist}
            title={onWatchlist ? 'Remove from your watchlist' : undefined}
            className={`group rounded-full border px-4 py-2 text-sm font-semibold transition-colors disabled:cursor-wait disabled:opacity-60 ${
              onWatchlist ? 'border-brand/40 bg-brand/10 text-brand hover:border-danger hover:bg-danger/10 hover:text-danger' : 'border-line text-ink hover:border-ink-muted'
            }`}
          >
            {watchlistSaving ? 'Saving…' : onWatchlist ? (
              <>
                <span className="group-hover:hidden">On your watchlist</span>
                <span className="hidden group-hover:inline">Remove from watchlist</span>
              </>
            ) : 'Add to watchlist'}
          </button>
        )}
        <button
          type="button"
          onClick={() => onRate(myRating ?? undefined)}
          disabled={!status}
          className="rounded-full bg-brand px-6 py-2 text-sm font-bold text-on-brand transition-colors hover:bg-brand-hover disabled:cursor-wait disabled:opacity-60"
        >
          {myRating ? 'Edit rating' : 'Rate it'}
        </button>
      </div>
    </Dialog>
  )
}
