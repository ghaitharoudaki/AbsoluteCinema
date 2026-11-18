import { useEffect, useMemo, useState } from 'react'
import type { SearchResult } from './MovieSearch'
import { errorMessage } from '../lib/api'
import { ensureMovieInDb } from '../lib/movies'
import {
  episodeKey,
  fetchSeason,
  fetchWatchedEpisodes,
  formatEpisode,
  saveEpisodes,
  seriesProgress,
  type EpisodeInfo,
  type EpisodeRef,
  type SeasonInfo,
} from '../lib/episodes'

interface SeriesTrackerProps {
  series: SearchResult
  seasons: SeasonInfo[]
  /** Database id if the series is already stored; created on first tick otherwise. */
  movieId: string | null
  details: Parameters<typeof ensureMovieInDb>[1]
}

const today = () => new Date().toISOString().slice(0, 10)

/** Season checklist: tick episodes, mark a season, see progress and what's next. */
export default function SeriesTracker({ series, seasons, movieId: initialMovieId, details }: SeriesTrackerProps) {
  const [movieId, setMovieId] = useState(initialMovieId)
  const [watched, setWatched] = useState<Set<string>>(new Set())
  const [loadingWatched, setLoadingWatched] = useState(!!initialMovieId)
  const [season, setSeason] = useState<number | null>(null)
  const [episodes, setEpisodes] = useState<EpisodeInfo[] | null>(null)
  const [seasonError, setSeasonError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const sortedSeasons = useMemo(
    () => [...seasons].filter((s) => s.episode_count > 0).sort((a, b) => (a.season_number || 999) - (b.season_number || 999)),
    [seasons],
  )
  const progress = seriesProgress(seasons, watched)

  useEffect(() => setMovieId(initialMovieId), [initialMovieId])

  // Load what's already been watched.
  useEffect(() => {
    if (!initialMovieId) return
    let cancelled = false
    setLoadingWatched(true)
    fetchWatchedEpisodes(initialMovieId)
      .then((set) => !cancelled && setWatched(set))
      .catch(() => !cancelled && setError("Your watched episodes didn't load. Ticking still works."))
      .finally(() => !cancelled && setLoadingWatched(false))
    return () => {
      cancelled = true
    }
  }, [initialMovieId])

  // Open on the season with the next unwatched episode.
  useEffect(() => {
    if (season !== null || loadingWatched || sortedSeasons.length === 0) return
    setSeason(progress.nextUp?.season ?? sortedSeasons[0].season_number)
  }, [season, loadingWatched, sortedSeasons, progress.nextUp])

  useEffect(() => {
    if (season === null) return
    let cancelled = false
    setEpisodes(null)
    setSeasonError(null)
    fetchSeason(series.tmdb_id, season)
      .then((list) => !cancelled && setEpisodes(list))
      .catch(() => !cancelled && setSeasonError("This season's episodes didn't load. Try another season or reopen the title."))
    return () => {
      cancelled = true
    }
  }, [series.tmdb_id, season])

  /** Optimistically applies a change, saves it, and rolls back if the save fails. */
  const update = async (refs: Array<EpisodeRef & { runtime?: number | null }>, markWatched: boolean) => {
    if (refs.length === 0) return
    const previous = watched
    const next = new Set(watched)
    for (const ref of refs) {
      const key = episodeKey(ref.season, ref.episode)
      if (markWatched) next.add(key)
      else next.delete(key)
    }
    setWatched(next)
    setSaving(true)
    setError(null)
    try {
      const id = movieId ?? (await ensureMovieInDb(series, details))
      setMovieId(id)
      for (let i = 0; i < refs.length; i += 200) await saveEpisodes(id, markWatched, refs.slice(i, i + 200))
    } catch (err) {
      console.error(err)
      setWatched(previous)
      setError(errorMessage(err, "That didn't save. Check your connection and try again."))
    } finally {
      setSaving(false)
    }
  }

  const aired = (episode: EpisodeInfo) => !!episode.air_date && episode.air_date <= today()
  const seasonRefs = (episodes ?? []).filter(aired).map((e) => ({ season: season!, episode: e.episode_number, runtime: e.runtime }))
  const seasonDone = seasonRefs.length > 0 && seasonRefs.every((ref) => watched.has(episodeKey(ref.season, ref.episode)))
  const percent = progress.total ? Math.round((progress.watched / progress.total) * 100) : 0

  if (sortedSeasons.length === 0) return null

  return (
    <section aria-labelledby="tracker-title" className="rounded-2xl border border-line bg-raised/40 p-4 sm:p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 id="tracker-title" className="text-sm font-bold">Your progress</h3>
        <p className="text-sm text-ink-muted tabular" aria-live="polite">
          {loadingWatched ? 'Loading…' : (
            <>
              <span className="font-semibold text-ink">{progress.watched}</span> / {progress.total} episodes
              {progress.complete ? ' · All caught up' : progress.nextUp ? ` · Next up ${formatEpisode(progress.nextUp)}` : ''}
            </>
          )}
        </p>
      </div>
      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-line" aria-hidden="true">
        <div className="h-full rounded-full bg-brand transition-[width] duration-300" style={{ width: `${percent}%` }} />
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <label className="sr-only" htmlFor="tracker-season">Season</label>
        <select
          id="tracker-season"
          value={season ?? ''}
          onChange={(event) => setSeason(Number(event.target.value))}
          className="rounded-full border border-line bg-surface px-3.5 py-1.5 text-sm font-semibold text-ink focus:border-brand focus:outline-none"
        >
          {sortedSeasons.map((s) => {
            const done = Array.from({ length: s.episode_count }, (_, i) => watched.has(episodeKey(s.season_number, i + 1))).filter(Boolean).length
            return (
              <option key={s.season_number} value={s.season_number}>
                {s.season_number === 0 ? 'Specials' : s.name || `Season ${s.season_number}`} ({done}/{s.episode_count})
              </option>
            )
          })}
        </select>
        <button
          type="button"
          disabled={saving || seasonRefs.length === 0}
          onClick={() => void update(seasonRefs, !seasonDone)}
          className="rounded-full border border-line px-3.5 py-1.5 text-sm font-semibold text-ink transition-colors hover:border-ink-muted disabled:cursor-not-allowed disabled:opacity-50"
        >
          {seasonDone ? 'Mark season unwatched' : 'Mark season watched'}
        </button>
        {progress.nextUp && !progress.complete && (
          <button
            type="button"
            disabled={saving}
            onClick={() => void update([progress.nextUp!], true)}
            className="ml-auto rounded-full bg-brand px-3.5 py-1.5 text-sm font-bold text-on-brand transition-colors hover:bg-brand-hover disabled:opacity-60"
          >
            Watched {formatEpisode(progress.nextUp)}
          </button>
        )}
      </div>

      <p role="alert" className={error ? 'mt-3 rounded-xl bg-danger/10 px-3.5 py-2.5 text-sm text-danger' : 'sr-only'}>{error}</p>

      <div className="mt-3 max-h-72 overflow-y-auto pr-1">
        {seasonError ? (
          <p className="py-3 text-sm text-ink-muted">{seasonError}</p>
        ) : !episodes ? (
          <div className="space-y-2 py-1" aria-busy="true" aria-label="Loading episodes">
            {Array.from({ length: 4 }, (_, i) => <div key={i} className="skeleton h-9 rounded-lg" />)}
          </div>
        ) : (
          <ul className="divide-y divide-line/60">
            {episodes.map((episode) => {
              const key = episodeKey(season!, episode.episode_number)
              const isWatched = watched.has(key)
              const hasAired = aired(episode)
              return (
                <li key={key}>
                  <label className={`flex items-center gap-3 py-2 text-sm ${hasAired ? 'cursor-pointer' : 'cursor-not-allowed opacity-50'}`}>
                    <input
                      type="checkbox"
                      checked={isWatched}
                      disabled={!hasAired || saving}
                      onChange={() => void update([{ season: season!, episode: episode.episode_number, runtime: episode.runtime }], !isWatched)}
                      className="h-4 w-4 shrink-0 accent-[rgb(var(--brand))]"
                    />
                    <span className="w-8 shrink-0 font-semibold text-ink-muted tabular">E{episode.episode_number}</span>
                    <span className={`min-w-0 flex-1 truncate ${isWatched ? 'text-ink-muted line-through decoration-ink-muted/50' : ''}`}>
                      {episode.name || `Episode ${episode.episode_number}`}
                    </span>
                    <span className="shrink-0 text-xs text-ink-muted tabular">
                      {hasAired ? episode.runtime ? `${episode.runtime}m` : '' : episode.air_date ? `Airs ${episode.air_date}` : 'Not aired'}
                    </span>
                  </label>
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </section>
  )
}
