import { useCallback, useEffect, useState } from 'react'
import { api, errorMessage } from '../lib/api'
import { fetchMovieDetails } from '../lib/movies'
import { fetchWatchedEpisodes, formatEpisode, saveEpisodes, seriesProgress, type EpisodeRef, type SeasonInfo } from '../lib/episodes'
import type { SearchResult } from './MovieSearch'

interface InProgressRow {
  movie: { id: string; tmdb_id: number; title: string; poster_path: string | null; release_year: number | null; media_type: string }
  number_of_episodes: number | null
  watched_count: number
}

interface Card {
  row: InProgressRow
  nextUp: EpisodeRef | null
  watched: number
  total: number
}

/**
 * Home-page row of series you're partway through, with the next episode and a one-tap
 * "watched" button. Hidden entirely when nothing is in progress. Bump `refreshKey`
 * to reload (e.g. after the movie dialog closes).
 */
export default function ContinueWatching({ refreshKey, onOpen }: { refreshKey: number; onOpen: (series: SearchResult) => void }) {
  const [cards, setCards] = useState<Card[]>([])
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      const { series } = await api<{ series: InProgressRow[] }>('continue-watching')
      const built = await Promise.all(
        series.map(async (row) => {
          const [details, watched] = await Promise.all([
            fetchMovieDetails(row.movie.tmdb_id, 'tv') as Promise<{ seasons?: SeasonInfo[] } | null>,
            fetchWatchedEpisodes(row.movie.id),
          ])
          const progress = seriesProgress(details?.seasons ?? [], watched)
          return {
            row,
            nextUp: progress.nextUp,
            watched: progress.total ? progress.watched : row.watched_count,
            total: progress.total || row.number_of_episodes || 0,
          }
        }),
      )
      // TMDB may know about newer episodes than our stored count; drop shows that are actually finished.
      setCards(built.filter((card) => card.nextUp || !card.total || card.watched < card.total))
    } catch (err) {
      console.error('Continue watching failed:', err)
      setCards([])
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load, refreshKey])

  const markNext = async (card: Card) => {
    if (!card.nextUp) return
    setBusy(card.row.movie.id)
    setError(null)
    try {
      await saveEpisodes(card.row.movie.id, true, [card.nextUp])
      await load()
    } catch (err) {
      setError(errorMessage(err, `${formatEpisode(card.nextUp)} wasn't saved. Try again.`))
    } finally {
      setBusy(null)
    }
  }

  if (cards.length === 0) return null

  return (
    <section aria-labelledby="continue-title">
      <div className="mb-4">
        <h2 id="continue-title" className="font-display text-3xl font-extrabold">Continue watching</h2>
        <p className="mt-1 text-sm text-ink-muted">Series you're partway through. Tick off the next episode right here.</p>
      </div>
      <p role="alert" className={error ? 'mb-3 rounded-xl bg-danger/10 px-3.5 py-2.5 text-sm text-danger' : 'sr-only'}>{error}</p>
      <ul className="rail -mx-4 flex gap-4 overflow-x-auto px-4 pb-2 sm:-mx-6 sm:px-6">
        {cards.map((card) => {
          const { movie } = card.row
          const percent = card.total ? Math.min(100, Math.round((card.watched / card.total) * 100)) : 0
          return (
            <li key={movie.id} className="group w-[136px] shrink-0 sm:w-[150px]">
              <button
                type="button"
                onClick={() => onOpen({ tmdb_id: movie.tmdb_id, title: movie.title, poster_path: movie.poster_path, release_year: movie.release_year ? String(movie.release_year) : null, media_type: 'tv' })}
                className="block w-full rounded-xl text-left"
              >
                <span className="relative block aspect-[2/3] overflow-hidden rounded-xl bg-raised shadow-poster transition-transform duration-200 group-hover:-translate-y-1">
                  {movie.poster_path ? (
                    <img src={`https://image.tmdb.org/t/p/w300${movie.poster_path}`} alt="" loading="lazy" className="h-full w-full object-cover" />
                  ) : (
                    <span className="flex h-full items-center justify-center p-3 text-center font-display text-xl font-bold text-ink-muted">{movie.title}</span>
                  )}
                  <span className="absolute inset-x-0 bottom-0 h-1.5 bg-canvas/70" aria-hidden="true">
                    <span className="block h-full bg-brand" style={{ width: `${percent}%` }} />
                  </span>
                </span>
                <span className="mt-2.5 block truncate text-sm font-semibold">{movie.title}</span>
                <span className="block text-xs text-ink-muted tabular">
                  {card.nextUp ? `Next: ${formatEpisode(card.nextUp)}` : 'Up to date'} · {card.watched}/{card.total || '?'}
                </span>
              </button>
              {card.nextUp && (
                <button
                  type="button"
                  disabled={busy === movie.id}
                  onClick={() => void markNext(card)}
                  aria-label={`Mark ${movie.title} ${formatEpisode(card.nextUp)} watched`}
                  className="mt-1.5 rounded-full border border-line px-3 py-1 text-xs font-semibold text-ink transition-colors hover:border-brand hover:text-brand disabled:opacity-60"
                >
                  {busy === movie.id ? 'Saving…' : `✓ ${formatEpisode(card.nextUp)}`}
                </button>
              )}
            </li>
          )
        })}
      </ul>
    </section>
  )
}
