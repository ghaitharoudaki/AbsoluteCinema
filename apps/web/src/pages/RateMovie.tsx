import { useState, useEffect } from 'react'
import { api, ApiError, errorMessage } from '../lib/api'
import { useAuth } from '../lib/AuthContext'
import type { SearchResult } from '../components/MovieSearch'
import StarRating from '../components/StarRating'
import Dialog, { CloseButton } from '../components/Dialog'
import { ensureMovieInDb, fetchMovieDetails } from '../lib/movies'

interface RateMovieProps {
  movie: SearchResult
  onDone: () => void
  onCancel: () => void
  existingRating?: {
    id: string
    rating: number
    description: string | null
    watched_date: string | null
    date_type: DateMode
  }
}

type DateMode = 'exact' | 'release' | 'unknown'

interface Details {
  runtime_minutes: number | null
  episode_run_time: number | null
  number_of_episodes: number | null
  release_date: string | null
  genres?: string[]
}

const POSTER_BASE_URL = 'https://image.tmdb.org/t/p/w300'

export default function RateMovie({ movie, onDone, onCancel, existingRating }: RateMovieProps) {
  const { user } = useAuth()
  const [details, setDetails] = useState<Details | null>(null)
  const [rating, setRating] = useState<number | null>(existingRating?.rating ?? null)
  const [description, setDescription] = useState(existingRating?.description ?? '')
  const [dateMode, setDateMode] = useState<DateMode>(existingRating?.date_type ?? 'unknown')
  const [exactDate, setExactDate] = useState(existingRating?.watched_date ?? '')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetchMovieDetails(movie.tmdb_id, movie.media_type).then(setDetails)
  }, [movie])

  const handleSubmit = async () => {
    if (rating === null) {
      setError('Add a rating first. A rough guess is fine.')
      return
    }
    if (dateMode === 'exact' && !exactDate) {
      setError("Pick the date you watched it, or choose 'On release' or 'Don’t remember'.")
      return
    }
    if (!user) return
    if (existingRating && !existingRating.id) {
      setError('This rating could not be identified. Close this form and try again.')
      return
    }

    setSubmitting(true)
    setError(null)

    try {
      const movieId = await ensureMovieInDb(movie, details)
      const watchedDate =
        dateMode === 'exact' ? exactDate : dateMode === 'release' ? details?.release_date ?? null : null

      await api('ratings', {
        method: 'POST',
        body: {
          id: existingRating?.id,
          movie_id: movieId,
          rating,
          description: description.trim() || null,
          watched_date: watchedDate,
          date_type: dateMode,
        },
      })

      onDone()
    } catch (err) {
      console.error(err)
      setError(
        err instanceof ApiError && err.code === 'already_rated'
          ? 'You already logged this title. Edit your rating from your profile instead.'
          : errorMessage(err, "That didn't save. Check your connection and try again."),
      )
    } finally {
      setSubmitting(false)
    }
  }

  const fieldLabel = 'mb-2 block text-sm font-semibold'

  return (
    <Dialog onClose={onCancel} title={existingRating ? `Edit your rating of ${movie.title}` : `Log ${movie.title}`}>
      <div className="flex items-start gap-4 border-b border-line p-6">
        {movie.poster_path ? (
          <img
            src={`${POSTER_BASE_URL}${movie.poster_path}`}
            alt=""
            className="h-24 w-16 rounded-lg object-cover shadow-poster"
          />
        ) : (
          <div className="flex h-24 w-16 items-center justify-center rounded-lg bg-raised text-[10px] text-ink-muted">
            No poster
          </div>
        )}
        <div className="min-w-0 flex-1">
          <p className="font-display text-3xl font-extrabold leading-none">{movie.title}</p>
          <p className="mt-2 text-sm text-ink-muted">
            {movie.release_year || 'Unknown year'}, {movie.media_type === 'movie' ? 'film' : 'series'}
          </p>
        </div>
        <CloseButton onClick={onCancel} label="Cancel" />
      </div>

      <form
        className="space-y-6 p-6"
        onSubmit={(event) => {
          event.preventDefault()
          void handleSubmit()
        }}
      >
        <div>
          <p id="rating-label" className={fieldLabel}>
            Your rating <span className="font-normal text-ink-muted">(required)</span>
          </p>
          <StarRating value={rating} onChange={setRating} label="Your rating" />
          <p className="mt-2 text-xs text-ink-muted">Click a star, or use the arrow keys. Half stars count.</p>
        </div>

        <div>
          <label htmlFor="rating-notes" className={fieldLabel}>
            Notes <span className="font-normal text-ink-muted">(optional)</span>
          </label>
          <textarea
            id="rating-notes"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="What stuck with you?"
            rows={3}
            className="w-full rounded-xl border border-line bg-raised px-3.5 py-2.5 text-sm text-ink placeholder:text-ink-muted focus:border-brand focus:outline-none"
          />
        </div>

        <fieldset>
          <legend className={fieldLabel}>
            When did you watch it? <span className="font-normal text-ink-muted">(optional)</span>
          </legend>
          <div className="inline-flex flex-wrap gap-1 rounded-full bg-raised p-1">
            {(['exact', 'release', 'unknown'] as DateMode[]).map((mode) => (
              <button
                key={mode}
                type="button"
                aria-pressed={dateMode === mode}
                onClick={() => setDateMode(mode)}
                className={`rounded-full px-3.5 py-1.5 text-sm font-medium transition-colors ${
                  dateMode === mode ? 'bg-surface text-ink shadow-sm' : 'text-ink-muted hover:text-ink'
                }`}
              >
                {mode === 'exact' ? 'Pick a date' : mode === 'release' ? 'On release' : "Don't remember"}
              </button>
            ))}
          </div>

          {dateMode === 'exact' && (
            <input
              type="date"
              aria-label="Date watched"
              value={exactDate}
              onChange={(e) => setExactDate(e.target.value)}
              max={new Date().toISOString().split('T')[0]}
              className="mt-3 w-full rounded-xl border border-line bg-raised px-3.5 py-2.5 text-sm text-ink focus:border-brand focus:outline-none"
            />
          )}
          {dateMode === 'release' && (
            <p className="mt-2 text-sm text-ink-muted">
              {details?.release_date ? `Saved as ${details.release_date}` : 'Looking up the release date…'}
            </p>
          )}
        </fieldset>

        <p role="alert" className={error ? 'rounded-xl bg-danger/10 px-3.5 py-2.5 text-sm text-danger' : 'sr-only'}>
          {error}
        </p>

        <div className="-mx-6 -mb-6 flex justify-end gap-2 border-t border-line bg-canvas/40 px-6 py-4">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-full px-4 py-2 text-sm font-semibold text-ink-muted transition-colors hover:bg-raised hover:text-ink"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={submitting}
            className="rounded-full bg-brand px-6 py-2 text-sm font-bold text-on-brand transition-colors hover:bg-brand-hover disabled:cursor-wait disabled:opacity-60"
          >
            {submitting ? 'Saving…' : existingRating ? 'Save rating' : 'Log film'}
          </button>
        </div>
      </form>
    </Dialog>
  )
}
