import { useRef, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import type { SearchResult } from './MovieSearch'

export interface PosterItem {
  tmdb_id: number
  title: string
  poster_path: string | null
  release_year: number | string | null
  media_type: string
  avg_score?: number | null
}

interface PosterRailProps {
  title: string
  subtitle?: string
  items: PosterItem[]
  emptyText: string
  onOpen: (item: SearchResult) => void
  loading?: boolean
  showScore?: boolean
  /** Shown at the end of the heading row. */
  action?: ReactNode
  footer?: ReactNode
  onHide?: (item: PosterItem, index: number) => void
  /** Link target for the "See all" control (rail layout only). */
  seeAllTo?: string
  layout?: 'rail' | 'grid'
  /** h1 when the rail is the page itself (Discover "See all"). */
  headingLevel?: 'h1' | 'h2'
}

export const toSearchResult = (item: PosterItem): SearchResult => ({
  tmdb_id: item.tmdb_id,
  title: item.title,
  poster_path: item.poster_path,
  release_year: item.release_year == null ? null : String(item.release_year),
  media_type: item.media_type === 'tv' ? 'tv' : 'movie',
})

const arrow =
  'hidden h-9 w-9 items-center justify-center rounded-full border border-line text-ink-muted transition-colors hover:border-ink-muted hover:text-ink sm:flex'

/** Poster row: a snapping horizontal rail with scroll buttons, or a full grid. */
export default function PosterRail({
  title,
  subtitle,
  items,
  emptyText,
  onOpen,
  loading = false,
  showScore = false,
  action,
  footer,
  onHide,
  seeAllTo,
  layout = 'rail',
  headingLevel = 'h2',
}: PosterRailProps) {
  const railRef = useRef<HTMLUListElement>(null)
  const headingId = `rail-${title.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`
  const Heading = headingLevel
  const scroll = (direction: 1 | -1) => {
    const rail = railRef.current
    if (rail) rail.scrollBy({ left: direction * rail.clientWidth * 0.85, behavior: 'smooth' })
  }

  return (
    <section aria-labelledby={headingId}>
      <div className="mb-4 flex items-end justify-between gap-4">
        <div className="min-w-0">
          <Heading
            id={headingId}
            className={headingLevel === 'h1' ? 'font-display text-[clamp(2.75rem,7vw,4.5rem)] font-black uppercase leading-[0.85]' : 'font-display text-3xl font-extrabold'}
          >
            {title}
          </Heading>
          {subtitle && <p className="mt-1 text-sm text-ink-muted">{subtitle}</p>}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {action}
          {layout === 'rail' && items.length > 5 && (
            <>
              <button type="button" onClick={() => scroll(-1)} aria-label={`Scroll ${title} back`} className={arrow}>
                <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2.4} aria-hidden="true"><path strokeLinecap="round" strokeLinejoin="round" d="M15 6l-6 6 6 6" /></svg>
              </button>
              <button type="button" onClick={() => scroll(1)} aria-label={`Scroll ${title} forward`} className={arrow}>
                <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2.4} aria-hidden="true"><path strokeLinecap="round" strokeLinejoin="round" d="M9 6l6 6-6 6" /></svg>
              </button>
            </>
          )}
          {layout === 'rail' && seeAllTo && items.length > 0 && (
            <Link to={seeAllTo} className="rounded-full px-3 py-2 text-sm font-semibold text-brand underline-offset-4 hover:underline">
              See all<span className="sr-only"> {title}</span>
            </Link>
          )}
        </div>
      </div>

      {loading && items.length === 0 ? (
        <div className={layout === 'grid' ? 'grid grid-cols-3 gap-4 sm:grid-cols-4 lg:grid-cols-6' : 'flex gap-4 overflow-hidden'} aria-hidden="true">
          {Array.from({ length: layout === 'grid' ? 12 : 7 }, (_, i) => (
            <div key={i} className={`skeleton aspect-[2/3] rounded-xl ${layout === 'grid' ? '' : 'w-[136px] shrink-0 sm:w-[150px]'}`} />
          ))}
        </div>
      ) : items.length > 0 ? (
        <ul
          ref={railRef}
          className={layout === 'grid' ? 'grid grid-cols-3 gap-x-4 gap-y-6 sm:grid-cols-4 lg:grid-cols-6' : 'rail -mx-4 flex gap-4 overflow-x-auto px-4 pb-2 sm:-mx-6 sm:px-6'}
        >
          {items.map((item, index) => (
            <li key={`${item.media_type}-${item.tmdb_id}-${index}`} className={`group ${layout === 'grid' ? 'min-w-0' : 'w-[136px] shrink-0 sm:w-[150px]'}`}>
              <button type="button" onClick={() => onOpen(toSearchResult(item))} className="block w-full rounded-xl text-left">
                <span className="poster relative block aspect-[2/3] overflow-hidden rounded-xl bg-raised shadow-poster">
                  {item.poster_path ? (
                    <img src={`https://image.tmdb.org/t/p/w300${item.poster_path}`} alt="" loading="lazy" className="h-full w-full object-cover" />
                  ) : (
                    <span className="flex h-full items-center justify-center p-3 text-center font-display text-xl font-bold text-ink-muted">{item.title}</span>
                  )}
                  {showScore && item.avg_score != null && <span className="ticket absolute right-2 top-2 text-base">{Number(item.avg_score).toFixed(1)}</span>}
                  {item.media_type === 'tv' && (
                    <span className="absolute bottom-2 left-2 rounded-md bg-[rgb(var(--shadow)/0.7)] px-1.5 py-0.5 text-[11px] font-semibold text-white backdrop-blur-sm">Series</span>
                  )}
                </span>
                <span className="mt-2.5 block truncate text-sm font-semibold">{item.title}</span>
                <span className="block text-xs text-ink-muted">{item.release_year || 'Year unknown'}</span>
              </button>
              {onHide && (
                <button
                  type="button"
                  aria-label={`Not interested in ${item.title}`}
                  onClick={() => onHide(item, index)}
                  className="mt-1 text-xs font-medium text-ink-muted underline-offset-2 hover:text-brand hover:underline"
                >
                  Not interested
                </button>
              )}
            </li>
          ))}
        </ul>
      ) : (
        <div className="rounded-2xl border border-dashed border-line px-6 py-8 text-sm text-ink-muted">{emptyText}</div>
      )}
      {footer}
    </section>
  )
}
