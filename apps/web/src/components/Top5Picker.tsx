import { useEffect, useState } from 'react'
import MovieSearch, { type SearchResult } from './MovieSearch'
import { ensureMovieInDb } from '../lib/movies'
import { api, errorMessage } from '../lib/api'
import Dialog, { CloseButton } from './Dialog'

export interface Top5Movie {
  rank: number
  movie_id: string
  tmdb_id?: number
  media_type?: string
  title: string
  poster_path: string | null
  release_year: number | null
}

/** A title the user has logged: offered first when filling a slot. */
export interface LoggedTitle {
  movie_id: string
  tmdb_id: number
  title: string
  poster_path: string | null
  release_year: number | null
  media_type: string
  rating: number
}

interface Top5PickerProps {
  items: Top5Movie[]
  editable: boolean
  onSaved: () => void
  /** Your logged titles, so a slot can be filled without searching. */
  library?: LoggedTitle[]
}

type PickSource = 'logs' | 'search'

const POSTER_BASE_URL = 'https://image.tmdb.org/t/p/w300'

export default function Top5Picker({ items, editable, onSaved, library = [] }: Top5PickerProps) {
  const [draft, setDraft] = useState<Top5Movie[]>(items)
  const [activeSlot, setActiveSlot] = useState<number | null>(null)
  const [source, setSource] = useState<PickSource>('logs')
  const [logQuery, setLogQuery] = useState('')

  const openSlot = (rank: number) => {
    setSource(library.length > 0 ? 'logs' : 'search')
    setLogQuery('')
    setActiveSlot(rank)
  }

  const placeTitle = async (selectedSlot: number, title: Omit<Top5Movie, 'rank'>) => {
    const withoutSlot = draft.filter((item) => item.rank !== selectedSlot && item.movie_id !== title.movie_id)
    const nextDraft = [...withoutSlot, { ...title, rank: selectedSlot }].sort((a, b) => a.rank - b.rank)
    setDraft(nextDraft)
    await saveDraft(nextDraft)
  }

  const pickLogged = async (logged: LoggedTitle) => {
    if (activeSlot === null) return
    const slot = activeSlot
    setActiveSlot(null)
    await placeTitle(slot, {
      movie_id: logged.movie_id,
      tmdb_id: logged.tmdb_id,
      media_type: logged.media_type,
      title: logged.title,
      poster_path: logged.poster_path,
      release_year: logged.release_year,
    })
  }

  const needle = logQuery.trim().toLowerCase()
  const logChoices = [...library]
    .filter((title) => !needle || title.title.toLowerCase().includes(needle))
    .sort((a, b) => b.rating - a.rating || a.title.localeCompare(b.title))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setDraft(items)
  }, [items])

  const slots = Array.from({ length: 5 }, (_, i) => {
    const rank = i + 1
    return draft.find((item) => item.rank === rank) ?? null
  })

  const saveDraft = async (nextDraft: Top5Movie[]) => {
    setSaving(true)
    setError(null)

    try {
      await api('top5', {
        method: 'PUT',
        body: { items: nextDraft.map((item) => ({ rank: item.rank, movie_id: item.movie_id })) },
      })
      onSaved()
    } catch (saveError) {
      console.error('Top 5 save error:', saveError)
      setError(errorMessage(saveError, "Your Top 5 didn't save. Try again."))
    } finally {
      setSaving(false)
    }
  }

  const handleSelect = async (result: SearchResult) => {
    if (activeSlot === null) return
    const selectedSlot = activeSlot
    setActiveSlot(null)

    try {
      setError(null)
      const movieId = await ensureMovieInDb(result, null, false)
      await placeTitle(selectedSlot, {
        movie_id: movieId,
        title: result.title,
        poster_path: result.poster_path,
        release_year: result.release_year ? parseInt(result.release_year, 10) : null,
      })
    } catch {
      setError('Could not add that title. Try again.')
    }
  }

  const removeFromSlot = async (rank: number) => {
    const nextDraft = draft.filter((item) => item.rank !== rank)
    setDraft(nextDraft)
    await saveDraft(nextDraft)
  }

  const moveSlot = async (rank: number, direction: -1 | 1) => {
    const targetRank = rank + direction
    if (targetRank < 1 || targetRank > 5) return
    const current = draft.find((item) => item.rank === rank)
    const target = draft.find((item) => item.rank === targetRank)
    if (!current) return
    const nextDraft = draft
      .map((item) => {
        if (item.movie_id === current.movie_id) return { ...item, rank: targetRank }
        if (target && item.movie_id === target.movie_id) return { ...item, rank }
        return item
      })
      .sort((a, b) => a.rank - b.rank)
    setDraft(nextDraft)
    await saveDraft(nextDraft)
  }

  const control =
    'flex h-7 min-w-7 items-center justify-center rounded-full bg-black/70 px-2 text-xs font-semibold text-white backdrop-blur transition-colors hover:bg-black/90 disabled:opacity-40'

  return (
    <div>
      <ol className="grid grid-cols-2 gap-x-4 gap-y-6 sm:grid-cols-5">
        {slots.map((slot, index) => {
          const rank = index + 1
          return (
            <li key={rank} className="relative">
              <span className="pointer-events-none absolute -left-1 -top-4 z-10 font-display text-5xl font-black leading-none text-brand drop-shadow" aria-hidden="true">
                {rank}
              </span>
              {slot ? (
                <div className="group relative overflow-hidden rounded-xl bg-raised shadow-poster">
                  {slot.poster_path ? (
                    <img src={`${POSTER_BASE_URL}${slot.poster_path}`} alt="" className="aspect-[2/3] w-full object-cover" />
                  ) : (
                    <div className="flex aspect-[2/3] w-full items-center justify-center p-3 text-center font-display text-xl font-bold text-ink-muted">
                      {slot.title}
                    </div>
                  )}
                  <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/85 to-transparent p-3 pt-10">
                    <p className="truncate text-sm font-semibold text-white">
                      <span className="sr-only">Number {rank}: </span>
                      {slot.title}
                    </p>
                    <p className="text-xs text-white/70">{slot.release_year ?? 'Year unknown'}</p>
                  </div>
                  {editable && (
                    <div className="absolute right-2 top-2 flex gap-1 transition-opacity sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100">
                      <button type="button" onClick={() => void moveSlot(rank, -1)} disabled={saving || rank === 1} className={control} aria-label={`Move ${slot.title} up to number ${rank - 1}`}>
                        ←
                      </button>
                      <button type="button" onClick={() => void moveSlot(rank, 1)} disabled={saving || rank === 5} className={control} aria-label={`Move ${slot.title} down to number ${rank + 1}`}>
                        →
                      </button>
                      <button type="button" onClick={() => void removeFromSlot(rank)} disabled={saving} className={control} aria-label={`Remove ${slot.title} from your Top 5`}>
                        ✕
                      </button>
                    </div>
                  )}
                </div>
              ) : editable ? (
                <button
                  type="button"
                  onClick={() => openSlot(rank)}
                  disabled={saving}
                  className="flex aspect-[2/3] w-full flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed border-line text-ink-muted transition-colors hover:border-brand hover:text-brand"
                >
                  <span className="text-3xl leading-none" aria-hidden="true">+</span>
                  <span className="text-sm font-semibold">Choose #{rank}</span>
                </button>
              ) : (
                <div className="flex aspect-[2/3] w-full items-center justify-center rounded-xl border-2 border-dashed border-line text-sm text-ink-muted">
                  Not picked
                </div>
              )}
            </li>
          )
        })}
      </ol>

      {editable && draft.length < 5 && (
        <p className="mt-5 text-sm text-ink-muted">Fill all five to get better taste matches with friends.</p>
      )}

      {!editable && items.length === 0 && (
        <p className="mt-4 text-center text-sm text-ink-muted">No Top 5 picked yet.</p>
      )}

      {saving && <p role="status" className="sr-only">Saving your Top 5</p>}
      {error && <p role="alert" className="mt-3 text-sm text-danger">{error}</p>}

      {activeSlot !== null && (
        <Dialog onClose={() => setActiveSlot(null)} title={`Choose your number ${activeSlot}`} align="top" bare>
          <div className="rounded-2xl border border-line bg-surface p-5 shadow-dialog">
            <div className="mb-4 flex items-center justify-between gap-4">
              <p className="font-display text-2xl font-extrabold">Choose your #{activeSlot}</p>
              <CloseButton onClick={() => setActiveSlot(null)} />
            </div>
            {library.length > 0 && (
              <div role="tablist" aria-label="Where to pick from" className="mb-4 grid grid-cols-2 gap-1 rounded-full bg-raised p-1">
                {([
                  ['logs', `Your logs (${library.length})`],
                  ['search', 'Search all titles'],
                ] as const).map(([value, label]) => (
                  <button
                    key={value}
                    type="button"
                    role="tab"
                    aria-selected={source === value}
                    onClick={() => setSource(value)}
                    className={`rounded-full px-3 py-2 text-sm font-semibold transition-colors ${source === value ? 'bg-surface text-ink shadow-sm' : 'text-ink-muted hover:text-ink'}`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            )}

            {source === 'search' || library.length === 0 ? (
              <MovieSearch onSelect={handleSelect} />
            ) : (
              <div>
                <label htmlFor="top5-log-filter" className="sr-only">Filter your logs</label>
                <input
                  id="top5-log-filter"
                  type="search"
                  autoFocus
                  value={logQuery}
                  onChange={(event) => setLogQuery(event.target.value)}
                  placeholder="Filter what you’ve logged"
                  className="w-full rounded-full border border-line bg-raised px-4 py-2.5 text-ink placeholder:text-ink-muted focus:border-brand focus:outline-none"
                />
                {logChoices.length === 0 ? (
                  <p className="mt-3 rounded-xl border border-dashed border-line px-4 py-5 text-center text-sm text-ink-muted">
                    Nothing you’ve logged matches “{logQuery.trim()}”.{' '}
                    <button type="button" onClick={() => setSource('search')} className="font-semibold text-brand underline-offset-2 hover:underline">
                      Search all titles
                    </button>
                  </p>
                ) : (
                  <ul className="mt-3 max-h-[55vh] overflow-y-auto overscroll-contain rounded-xl border border-line" aria-label="Your logged titles, best rated first">
                    {logChoices.map((title) => {
                      const current = draft.find((item) => item.movie_id === title.movie_id)
                      return (
                        <li key={title.movie_id} className="border-b border-line last:border-b-0">
                          <button
                            type="button"
                            onClick={() => void pickLogged(title)}
                            className="flex w-full items-center gap-3 px-3 py-2.5 text-left transition-colors hover:bg-raised focus-visible:bg-raised"
                          >
                            {title.poster_path ? (
                              <img src={`https://image.tmdb.org/t/p/w200${title.poster_path}`} alt="" loading="lazy" className="h-14 w-10 shrink-0 rounded-md object-cover" />
                            ) : (
                              <span className="flex h-14 w-10 shrink-0 items-center justify-center rounded-md bg-raised text-[10px] text-ink-muted">None</span>
                            )}
                            <span className="min-w-0 flex-1">
                              <span className="block truncate font-semibold">{title.title}</span>
                              <span className="block text-sm text-ink-muted">
                                {title.release_year ?? 'Year unknown'}, {title.media_type === 'tv' ? 'series' : 'film'}
                                {current && <span className="ml-1.5 font-semibold text-ink">· now #{current.rank}</span>}
                              </span>
                            </span>
                            <span className="ticket shrink-0 text-sm">{title.rating.toFixed(1)}</span>
                          </button>
                        </li>
                      )
                    })}
                  </ul>
                )}
              </div>
            )}
          </div>
        </Dialog>
      )}
    </div>
  )
}
