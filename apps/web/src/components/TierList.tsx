import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent as ReactPointerEvent } from 'react'
import { useSearchParams } from 'react-router-dom'
import { api, errorMessage } from '../lib/api'
import { useToast } from '../lib/Toast'
import { TIER_KEYS, buildLayout, layoutToPayload, moveInLayout, type Layout, type TierKey } from '../lib/tiers'

export interface TierRating {
  id: string
  rating: number
  tier_override?: TierKey | null
  tier_rank?: number | null
  movie: {
    title: string
    poster_path: string | null
    media_type: string
  }
}

type Kind = 'movie' | 'tv'

const TONES: Record<TierKey, string> = {
  S: 'bg-brand text-on-brand',
  A: 'bg-brand/70 text-on-brand',
  B: 'bg-brand/40 text-ink',
  C: 'bg-brand/20 text-ink',
  D: 'bg-raised text-ink',
  F: 'bg-raised text-ink-muted',
}

const TABS: Array<{ kind: Kind; label: string; param: string }> = [
  { kind: 'movie', label: 'Movies', param: 'movies' },
  { kind: 'tv', label: 'Series', param: 'series' },
]

const HOLD_MS = 320
const MOVE_TOLERANCE = 8

interface DragState {
  id: string
  title: string
  poster: string | null
  x: number
  y: number
  width: number
}

interface Pending {
  id: string
  pointerId: number
  pointerType: string
  startX: number
  startY: number
  timer: number | null
  rect: DOMRect
}

/**
 * Two tier lists (Movies, Series) behind accessible tabs. Titles start in the band their score earns;
 * on your own profile you can drag them anywhere: press and hold on a phone, click and drag with a mouse,
 * or Alt + arrow keys. Placement saves at once, with Undo.
 */
export default function TierList<R extends TierRating>({
  ratings,
  onSelect,
  selectLabel,
  emptyText,
  editable = false,
  onChanged,
}: {
  ratings: R[]
  onSelect: (rating: R) => void
  /** Appended to each poster's accessible name, e.g. ". Change rating". */
  selectLabel?: string
  emptyText: (kind: Kind) => string
  editable?: boolean
  /** Called after a reset so the parent can reload placements. */
  onChanged?: () => void
}) {
  const [params, setParams] = useSearchParams()
  const active: Kind = params.get('tiers') === 'series' ? 'tv' : 'movie'
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([])
  const toast = useToast()

  const byKind = (kind: Kind) => ratings.filter((rating) => (rating.movie.media_type === 'tv' ? 'tv' : 'movie') === kind)
  const baseLayout = useMemo(
    () => buildLayout(ratings.filter((r) => (r.movie.media_type === 'tv' ? 'tv' : 'movie') === active).map((r) => ({ ...r, title: r.movie.title }))),
    [ratings, active],
  )
  const [layout, setLayout] = useState<Layout<R & { title: string }>>(baseLayout)
  useEffect(() => setLayout(baseLayout), [baseLayout])

  const [drag, setDrag] = useState<DragState | null>(null)
  const [target, setTarget] = useState<{ tier: TierKey; index: number } | null>(null)
  const [announcement, setAnnouncement] = useState('')
  const pendingRef = useRef<Pending | null>(null)
  const dragRef = useRef<DragState | null>(null)
  const targetRef = useRef<{ tier: TierKey; index: number } | null>(null)
  const suppressClickRef = useRef(false)
  const scrollRaf = useRef<number | null>(null)
  const layoutRef = useRef(layout)
  layoutRef.current = layout

  const select = (kind: Kind) => {
    const next = new URLSearchParams(params)
    if (kind === 'tv') next.set('tiers', 'series')
    else next.delete('tiers')
    setParams(next, { replace: true, preventScrollReset: true })
  }

  const onTabKey = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    const last = TABS.length - 1
    const to =
      event.key === 'ArrowRight' ? (index === last ? 0 : index + 1)
      : event.key === 'ArrowLeft' ? (index === 0 ? last : index - 1)
      : event.key === 'Home' ? 0
      : event.key === 'End' ? last
      : null
    if (to === null) return
    event.preventDefault()
    select(TABS[to].kind)
    tabRefs.current[to]?.focus()
  }

  /* ------------------------------------------------------------ saving */

  const persist = async (next: Layout<R & { title: string }>, previous: Layout<R & { title: string }>, message: string, movedId: string) => {
    setLayout(next)
    try {
      await api('tiers', { method: 'PUT', body: { tiers: layoutToPayload(next) } })
      toast(message, {
        action: {
          label: 'Undo',
          onClick: () => {
            setLayout(previous)
            // The Undo button disappears; put focus back on the poster that moved.
            window.setTimeout(() => document.querySelector<HTMLButtonElement>(`[data-tier-poster="${movedId}"]`)?.focus({ preventScroll: true }), 0)
            api('tiers', { method: 'PUT', body: { tiers: layoutToPayload(previous) } }).catch((error) =>
              toast(errorMessage(error, 'Undo didn’t save. Try again.'), { tone: 'error' }),
            )
          },
        },
      })
    } catch (error) {
      setLayout(previous)
      toast(errorMessage(error, 'Your tier list didn’t save. Try again.'), { tone: 'error' })
    }
  }

  /** `index` is the drop position counted over the row as displayed (dragged item included). */
  const commitMove = (id: string, tier: TierKey, index: number) => {
    const previous = layoutRef.current
    const fromTier = TIER_KEYS.find((key) => previous[key].some((item) => item.id === id))
    if (!fromTier) return
    const fromIndex = previous[fromTier].findIndex((item) => item.id === id)
    if (fromTier === tier && (index === fromIndex || index === fromIndex + 1)) return
    const adjusted = fromTier === tier && index > fromIndex ? index - 1 : index
    const next = moveInLayout(previous, id, tier, adjusted)
    const title = previous[fromTier][fromIndex].title
    setAnnouncement(`${title} moved to ${tier} tier, position ${adjusted + 1}`)
    void persist(next, previous, `${title} moved to ${tier}`, id)
  }

  const resetKind = async () => {
    try {
      await api(`tiers?kind=${active}`, { method: 'DELETE' })
      toast(`${active === 'tv' ? 'Series' : 'Movie'} tiers reset to your scores`)
      onChanged?.()
    } catch (error) {
      toast(errorMessage(error, 'Reset didn’t work. Try again.'), { tone: 'error' })
    }
  }

  /* -------------------------------------------------------------- drag */

  const findTarget = (x: number, y: number) => {
    const row = document.elementFromPoint(x, y)?.closest<HTMLElement>('[data-tier]')
    if (!row) return null
    const tier = row.dataset.tier as TierKey
    let index = 0
    row.querySelectorAll<HTMLElement>('[data-tier-item]').forEach((node) => {
      const rect = node.getBoundingClientRect()
      if (rect.bottom < y || (rect.top <= y && y <= rect.bottom && rect.left + rect.width / 2 < x)) index += 1
    })
    return { tier, index }
  }

  const blockTouchScroll = (event: TouchEvent) => {
    if (dragRef.current) event.preventDefault()
  }

  const autoScroll = () => {
    const current = dragRef.current
    if (!current) {
      scrollRaf.current = null
      return
    }
    const edge = 72
    const bottomEdge = window.innerHeight - (window.innerWidth < 768 ? 120 : edge)
    const speed = current.y < edge ? -Math.ceil((edge - current.y) / 6) : current.y > bottomEdge ? Math.ceil((current.y - bottomEdge) / 6) : 0
    if (speed) {
      window.scrollBy(0, speed)
      const next = findTarget(current.x, current.y)
      targetRef.current = next
      setTarget(next)
    }
    scrollRaf.current = requestAnimationFrame(autoScroll)
  }

  const startDrag = (pending: Pending, x: number, y: number) => {
    const item = TIER_KEYS.flatMap((key) => layoutRef.current[key]).find((r) => r.id === pending.id)
    if (!item) return
    const state: DragState = { id: item.id, title: item.movie.title, poster: item.movie.poster_path, x, y, width: pending.rect.width }
    dragRef.current = state
    setDrag(state)
    const first = findTarget(x, y)
    targetRef.current = first
    setTarget(first)
    document.addEventListener('touchmove', blockTouchScroll, { passive: false })
    document.body.style.userSelect = 'none'
    if (pending.pointerType !== 'mouse') navigator.vibrate?.(12)
    scrollRaf.current = requestAnimationFrame(autoScroll)
  }

  const listeners = useRef<{ move: (e: PointerEvent) => void; up: (e: PointerEvent) => void; cancel: () => void } | null>(null)

  const cleanup = () => {
    const pending = pendingRef.current
    if (pending?.timer) window.clearTimeout(pending.timer)
    pendingRef.current = null
    dragRef.current = null
    targetRef.current = null
    setDrag(null)
    setTarget(null)
    document.removeEventListener('touchmove', blockTouchScroll)
    document.body.style.userSelect = ''
    if (listeners.current) {
      window.removeEventListener('pointermove', listeners.current.move)
      window.removeEventListener('pointerup', listeners.current.up)
      window.removeEventListener('pointercancel', listeners.current.cancel)
      listeners.current = null
    }
    if (scrollRaf.current) cancelAnimationFrame(scrollRaf.current)
    scrollRaf.current = null
  }

  const onWindowMove = (event: PointerEvent) => {
    const pending = pendingRef.current
    if (!pending || event.pointerId !== pending.pointerId) return
    if (!dragRef.current) {
      const moved = Math.hypot(event.clientX - pending.startX, event.clientY - pending.startY) > MOVE_TOLERANCE
      if (!moved) return
      // Mouse: moving starts the drag. Touch: moving before the hold finishes means scrolling.
      if (pending.pointerType === 'mouse') startDrag(pending, event.clientX, event.clientY)
      else cleanup()
      return
    }
    const next = { ...dragRef.current, x: event.clientX, y: event.clientY }
    dragRef.current = next
    setDrag(next)
    const found = findTarget(event.clientX, event.clientY)
    targetRef.current = found
    setTarget(found)
  }

  const onWindowUp = (event: PointerEvent) => {
    const pending = pendingRef.current
    if (!pending || event.pointerId !== pending.pointerId) return
    const dragging = dragRef.current
    const dropAt = targetRef.current
    if (dragging) {
      suppressClickRef.current = true
      window.setTimeout(() => (suppressClickRef.current = false), 0)
      if (dropAt) commitMove(dragging.id, dropAt.tier, dropAt.index)
    }
    cleanup()
  }

  useEffect(() => () => cleanup(), []) // eslint-disable-line react-hooks/exhaustive-deps

  const onPosterPointerDown = (event: ReactPointerEvent<HTMLButtonElement>, id: string) => {
    if (!editable || (event.pointerType === 'mouse' && event.button !== 0)) return
    cleanup()
    const pending: Pending = {
      id,
      pointerId: event.pointerId,
      pointerType: event.pointerType,
      startX: event.clientX,
      startY: event.clientY,
      timer: null,
      rect: event.currentTarget.getBoundingClientRect(),
    }
    if (event.pointerType !== 'mouse') {
      pending.timer = window.setTimeout(() => {
        if (pendingRef.current === pending) startDrag(pending, pending.startX, pending.startY)
      }, HOLD_MS)
    }
    pendingRef.current = pending
    listeners.current = { move: onWindowMove, up: onWindowUp, cancel: cleanup }
    window.addEventListener('pointermove', listeners.current.move)
    window.addEventListener('pointerup', listeners.current.up)
    window.addEventListener('pointercancel', listeners.current.cancel)
  }

  /** Alt + arrows: up/down changes tier, left/right changes position. */
  const onPosterKeyDown = (event: KeyboardEvent<HTMLButtonElement>, id: string, tier: TierKey, index: number) => {
    if (!editable || !event.altKey) return
    const tierIndex = TIER_KEYS.indexOf(tier)
    let to: { tier: TierKey; index: number } | null = null
    if (event.key === 'ArrowUp' && tierIndex > 0) to = { tier: TIER_KEYS[tierIndex - 1], index: layout[TIER_KEYS[tierIndex - 1]].length }
    if (event.key === 'ArrowDown' && tierIndex < TIER_KEYS.length - 1) to = { tier: TIER_KEYS[tierIndex + 1], index: layout[TIER_KEYS[tierIndex + 1]].length }
    if (event.key === 'ArrowLeft' && index > 0) to = { tier, index: index - 1 }
    if (event.key === 'ArrowRight' && index < layout[tier].length - 1) to = { tier, index: index + 2 }
    if (!to) return
    event.preventDefault()
    commitMove(id, to.tier, to.index)
    window.setTimeout(() => document.querySelector<HTMLButtonElement>(`[data-tier-poster="${id}"]`)?.focus(), 0)
  }

  const shown = byKind(active)
  const hasCustom = shown.some((r) => r.tier_override)

  return (
    <div className="mt-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div role="tablist" aria-label="Tier list type" className="inline-flex gap-1 rounded-full bg-raised p-1">
          {TABS.map((tab, index) => {
            const selected = tab.kind === active
            return (
              <button
                key={tab.kind}
                ref={(el) => {
                  tabRefs.current[index] = el
                }}
                type="button"
                role="tab"
                id={`tier-tab-${tab.param}`}
                aria-selected={selected}
                aria-controls={`tier-panel-${tab.param}`}
                tabIndex={selected ? 0 : -1}
                onClick={() => select(tab.kind)}
                onKeyDown={(event) => onTabKey(event, index)}
                className={`rounded-full px-4 py-1.5 text-sm font-semibold transition-colors ${selected ? 'bg-surface text-ink shadow-sm' : 'text-ink-muted hover:text-ink'}`}
              >
                {tab.label} <span className="tabular text-ink-muted">({byKind(tab.kind).length})</span>
              </button>
            )
          })}
        </div>
        {editable && hasCustom && (
          <button type="button" onClick={() => void resetKind()} className="rounded-full px-3 py-1.5 text-sm font-semibold text-ink-muted hover:bg-raised hover:text-ink">
            Reset to scores
          </button>
        )}
      </div>

      {editable && shown.length > 0 && (
        <p className="mt-3 text-sm text-ink-muted">
          <span className="md:hidden">Press and hold a poster, then drag it to any tier. Tap to change its rating.</span>
          <span className="hidden md:inline">Drag a poster to any tier or position. Click to change its rating. Keyboard: Alt + arrow keys.</span>
        </p>
      )}
      <p className="sr-only" aria-live="assertive">{announcement}</p>

      {TABS.map((tab) => (
        <div
          key={tab.kind}
          role="tabpanel"
          id={`tier-panel-${tab.param}`}
          aria-labelledby={`tier-tab-${tab.param}`}
          hidden={tab.kind !== active}
          tabIndex={0}
          className="mt-4 overflow-hidden rounded-2xl border border-line focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand"
        >
          {tab.kind !== active ? null : shown.length === 0 ? (
            <div className="bg-surface px-6 py-8 text-sm text-ink-muted">{emptyText(tab.kind)}</div>
          ) : (
            TIER_KEYS.map((tier) => {
              const items = layout[tier]
              const isTarget = !!drag && target?.tier === tier
              const cells = items.map((rating, index) => (
                <li key={rating.id} data-tier-item className={`w-[4.5rem] sm:w-20 ${drag?.id === rating.id ? 'opacity-30' : ''}`}>
                  <button
                    type="button"
                    data-tier-poster={rating.id}
                    onPointerDown={(event) => onPosterPointerDown(event, rating.id)}
                    onClick={() => {
                      if (suppressClickRef.current) return
                      onSelect(rating)
                    }}
                    onKeyDown={(event) => onPosterKeyDown(event, rating.id, tier, index)}
                    onContextMenu={(event) => editable && event.preventDefault()}
                    aria-label={`${rating.movie.title}, rated ${Number(rating.rating).toFixed(1)}, ${tier} tier${selectLabel ?? ''}`}
                    className={`group block w-full rounded-lg text-left ${editable ? 'tier-draggable cursor-grab active:cursor-grabbing' : ''}`}
                  >
                    <span className="relative block aspect-[2/3] overflow-hidden rounded-lg bg-raised transition-transform group-hover:-translate-y-0.5">
                      {rating.movie.poster_path ? (
                        <img src={`https://image.tmdb.org/t/p/w200${rating.movie.poster_path}`} alt="" loading="lazy" draggable={false} className="h-full w-full object-cover" />
                      ) : (
                        <span className="flex h-full items-center justify-center p-1 text-center text-[10px] text-ink-muted">{rating.movie.title}</span>
                      )}
                    </span>
                    <span className="mt-1 flex items-center justify-between gap-1 text-xs">
                      <span className="truncate font-medium">{rating.movie.title}</span>
                      <span className="shrink-0 font-bold text-brand tabular">{Number(rating.rating).toFixed(1)}</span>
                    </span>
                  </button>
                </li>
              ))
              if (isTarget && target) {
                cells.splice(
                  Math.min(target.index, cells.length),
                  0,
                  <li key="__slot" aria-hidden="true" className="w-[4.5rem] sm:w-20">
                    <span className="block aspect-[2/3] rounded-lg border-2 border-dashed border-brand bg-brand/10" />
                  </li>,
                )
              }
              return (
                <div
                  key={tier}
                  data-tier={tier}
                  className={`flex min-h-[7.5rem] border-b border-line transition-colors last:border-b-0 ${isTarget ? 'bg-brand/5' : 'bg-surface'}`}
                >
                  <div className={`flex w-14 shrink-0 items-center justify-center font-display text-4xl font-black sm:w-20 ${TONES[tier]}`} aria-label={`${tier} tier`}>
                    {tier}
                  </div>
                  <ul className="flex flex-1 flex-wrap content-start gap-3 p-3">
                    {cells.length > 0 ? cells : <li className="self-center text-sm text-ink-muted">{editable ? 'Drop a poster here.' : 'Nothing in this tier.'}</li>}
                  </ul>
                </div>
              )
            })
          )}
        </div>
      ))}

      {drag && (
        <div
          aria-hidden="true"
          className="pointer-events-none fixed z-[80] overflow-hidden rounded-lg bg-raised shadow-dialog ring-2 ring-brand"
          style={{ width: drag.width, height: drag.width * 1.5, left: drag.x - drag.width / 2, top: drag.y - drag.width * 0.9, transform: 'rotate(-4deg) scale(1.08)' }}
        >
          {drag.poster ? (
            <img src={`https://image.tmdb.org/t/p/w200${drag.poster}`} alt="" className="h-full w-full object-cover" />
          ) : (
            <span className="flex h-full items-center justify-center p-1 text-center text-[10px]">{drag.title}</span>
          )}
        </div>
      )}
    </div>
  )
}
