import { useEffect, useState } from 'react'
import MovieSearch, { type SearchResult } from './MovieSearch'
import { ensureMovieInDb } from '../lib/movies'
import { supabase } from '../lib/supabase'
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

interface Top5PickerProps {
  items: Top5Movie[]
  editable: boolean
  onSaved: () => void
  userId: string
}

const POSTER_BASE_URL = 'https://image.tmdb.org/t/p/w300'

function isMissingTop5ItemsError(error: unknown) {
  if (!error || typeof error !== 'object') return false
  const message = 'message' in error ? String(error.message) : ''
  return message.includes('top5_items') && message.includes('schema cache')
}

export default function Top5Picker({ items, editable, onSaved, userId }: Top5PickerProps) {
  const [draft, setDraft] = useState<Top5Movie[]>(items)
  const [activeSlot, setActiveSlot] = useState<number | null>(null)
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
      const { error: deleteError } = await supabase.from('top5_items').delete().eq('user_id', userId)
      if (deleteError && !isMissingTop5ItemsError(deleteError)) throw deleteError

      if (!deleteError && nextDraft.length > 0) {
        const { error: insertError } = await supabase.from('top5_items').insert(
          nextDraft.map((item) => ({
            user_id: userId,
            rank: item.rank,
            movie_id: item.movie_id,
          }))
        )
        if (insertError) throw insertError
      }

      if (deleteError && isMissingTop5ItemsError(deleteError)) {
        const { error: legacyError } = await supabase.from('top5').upsert(
          {
            user_id: userId,
            movie_ids: nextDraft.map((item) => item.movie_id),
          },
          { onConflict: 'user_id' }
        )
        if (legacyError) {
          if (String(legacyError.message).includes('movie_ids')) {
            throw new Error('Top 5 database is outdated. Apply migration 00004_profile_features.sql in Supabase.')
          }
          throw legacyError
        }
      }

      onSaved()
    } catch (saveError) {
      console.error('Top 5 save error:', saveError)
      const message =
        typeof saveError === 'object' && saveError !== null && 'message' in saveError
          ? ` ${String(saveError.message)}`
          : ''
      setError(`Could not save your top 5.${message}`)
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
      const next: Top5Movie = {
        rank: selectedSlot,
        movie_id: movieId,
        title: result.title,
        poster_path: result.poster_path,
        release_year: result.release_year ? parseInt(result.release_year, 10) : null,
      }

      const withoutSlot = draft.filter((item) => item.rank !== selectedSlot && item.movie_id !== movieId)
      const nextDraft = [...withoutSlot, next].sort((a, b) => a.rank - b.rank)
      setDraft(nextDraft)
      await saveDraft(nextDraft)
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
                  onClick={() => setActiveSlot(rank)}
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
            <MovieSearch onSelect={handleSelect} />
          </div>
        </Dialog>
      )}
    </div>
  )
}
