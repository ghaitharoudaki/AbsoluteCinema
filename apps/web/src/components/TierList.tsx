import { useRef, type KeyboardEvent } from 'react'
import { useSearchParams } from 'react-router-dom'

export interface TierRating {
  id: string
  rating: number
  movie: {
    title: string
    poster_path: string | null
    media_type: string
  }
}

type Kind = 'movie' | 'tv'

/** Score bands, highest first. A rating belongs to the first band whose minimum it reaches. */
const TIERS = [
  { tier: 'S', min: 9, tone: 'bg-brand text-on-brand' },
  { tier: 'A', min: 8, tone: 'bg-brand/70 text-on-brand' },
  { tier: 'B', min: 7, tone: 'bg-brand/40 text-ink' },
  { tier: 'C', min: 6, tone: 'bg-brand/20 text-ink' },
  { tier: 'D', min: 4, tone: 'bg-raised text-ink' },
  { tier: 'F', min: 0, tone: 'bg-raised text-ink-muted' },
] as const

function tierFor(score: number) {
  return TIERS.find((band) => score >= band.min)!.tier
}

const TABS: Array<{ kind: Kind; label: string; param: string }> = [
  { kind: 'movie', label: 'Movies', param: 'movies' },
  { kind: 'tv', label: 'Series', param: 'series' },
]

/**
 * Two tier lists (Movies, Series) behind accessible tabs. The selected tab lives in the URL
 * (?tiers=series) so reloads and shared links land on the same list.
 */
export default function TierList<R extends TierRating>({
  ratings,
  onSelect,
  selectLabel,
  emptyText,
}: {
  ratings: R[]
  onSelect: (rating: R) => void
  /** Appended to each poster's accessible name, e.g. ". Change rating". */
  selectLabel?: string
  emptyText: (kind: Kind) => string
}) {
  const [params, setParams] = useSearchParams()
  const active: Kind = params.get('tiers') === 'series' ? 'tv' : 'movie'
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([])

  const byKind = (kind: Kind) => ratings.filter((rating) => (rating.movie.media_type === 'tv' ? 'tv' : 'movie') === kind)
  const select = (kind: Kind) => {
    const next = new URLSearchParams(params)
    if (kind === 'tv') next.set('tiers', 'series')
    else next.delete('tiers')
    setParams(next, { replace: true, preventScrollReset: true })
  }

  const onKeyDown = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    const last = TABS.length - 1
    const target =
      event.key === 'ArrowRight' ? (index === last ? 0 : index + 1)
      : event.key === 'ArrowLeft' ? (index === 0 ? last : index - 1)
      : event.key === 'Home' ? 0
      : event.key === 'End' ? last
      : null
    if (target === null) return
    event.preventDefault()
    select(TABS[target].kind)
    tabRefs.current[target]?.focus()
  }

  const shown = byKind(active)

  return (
    <div className="mt-6">
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
              onKeyDown={(event) => onKeyDown(event, index)}
              className={`rounded-full px-4 py-1.5 text-sm font-semibold transition-colors ${
                selected ? 'bg-surface text-ink shadow-sm' : 'text-ink-muted hover:text-ink'
              }`}
            >
              {tab.label} <span className="tabular text-ink-muted">({byKind(tab.kind).length})</span>
            </button>
          )
        })}
      </div>

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
            TIERS.map(({ tier, tone }) => {
              const tierRatings = shown
                .filter((rating) => tierFor(Number(rating.rating)) === tier)
                // Best first inside a tier, so a 9.5 never sits behind a 9.0.
                .sort((a, b) => Number(b.rating) - Number(a.rating) || a.movie.title.localeCompare(b.movie.title))
              return (
                <div key={tier} className="flex min-h-[7.5rem] border-b border-line bg-surface last:border-b-0">
                  <div className={`flex w-16 shrink-0 items-center justify-center font-display text-4xl font-black sm:w-20 ${tone}`} aria-label={`${tier} tier`}>
                    {tier}
                  </div>
                  <ul className="flex flex-1 flex-wrap gap-3 p-3">
                    {tierRatings.length > 0 ? (
                      tierRatings.map((rating) => (
                        <li key={rating.id} className="w-[4.5rem] sm:w-20">
                          <button
                            type="button"
                            onClick={() => onSelect(rating)}
                            aria-label={`${rating.movie.title}, rated ${Number(rating.rating).toFixed(1)}${selectLabel ?? ''}`}
                            className="group block w-full rounded-lg text-left"
                          >
                            <span className="relative block aspect-[2/3] overflow-hidden rounded-lg bg-raised transition-transform group-hover:-translate-y-0.5">
                              {rating.movie.poster_path ? (
                                <img src={`https://image.tmdb.org/t/p/w200${rating.movie.poster_path}`} alt="" loading="lazy" className="h-full w-full object-cover" />
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
                    ) : (
                      <li className="self-center text-sm text-ink-muted">Nothing rated in this range.</li>
                    )}
                  </ul>
                </div>
              )
            })
          )}
        </div>
      ))}
    </div>
  )
}
