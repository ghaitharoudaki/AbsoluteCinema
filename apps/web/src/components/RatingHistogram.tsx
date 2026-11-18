import { useState } from 'react'

const BINS = Array.from({ length: 20 }, (_, i) => (i + 1) / 2) // 0.5 … 10

/**
 * How someone rates: one bar per half-point from 0.5 to 10. Single series, so no legend;
 * every bar has a hover/focus tooltip, and the same numbers are available as a table.
 */
export default function RatingHistogram({ scores, name }: { scores: number[]; name: string }) {
  const [active, setActive] = useState<number | null>(null)
  const [asTable, setAsTable] = useState(false)
  if (scores.length === 0) return null

  const counts = BINS.map((bin) => scores.filter((s) => Number(s) === bin).length)
  const max = Math.max(...counts)
  const avg = scores.reduce((sum, s) => sum + Number(s), 0) / scores.length
  const sorted = [...scores].map(Number).sort((a, b) => a - b)
  const median = sorted.length % 2 ? sorted[(sorted.length - 1) / 2] : (sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2
  const mostCommon = BINS[counts.indexOf(max)]

  return (
    <section className="mt-14" aria-labelledby="histogram-title">
      <div className="mb-4 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 id="histogram-title" className="font-display text-3xl font-extrabold">How {name === 'You' ? 'you rate' : `${name} rates`}</h2>
          <p className="mt-1 text-sm text-ink-muted">
            {scores.length} ratings. Average <span className="font-semibold text-ink tabular">{avg.toFixed(1)}</span>, median{' '}
            <span className="font-semibold text-ink tabular">{median.toFixed(1)}</span>, most often{' '}
            <span className="font-semibold text-ink tabular">{mostCommon.toFixed(1)}</span>.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setAsTable((v) => !v)}
          aria-pressed={asTable}
          className="shrink-0 rounded-full border border-line px-4 py-2 text-sm font-semibold text-ink-muted transition-colors hover:border-ink-muted hover:text-ink"
        >
          {asTable ? 'Show chart' : 'Show as table'}
        </button>
      </div>

      {asTable ? (
        <div className="max-h-72 overflow-y-auto rounded-2xl border border-line bg-surface">
          <table className="w-full text-sm">
            <caption className="sr-only">Number of ratings at each score</caption>
            <thead className="sticky top-0 bg-surface text-left text-xs text-ink-muted">
              <tr>
                <th scope="col" className="px-4 py-2 font-semibold">Score</th>
                <th scope="col" className="px-4 py-2 text-right font-semibold">Ratings</th>
              </tr>
            </thead>
            <tbody className="tabular">
              {BINS.map((bin, i) => counts[i] > 0 && (
                <tr key={bin} className="border-t border-line/60">
                  <td className="px-4 py-1.5">{bin.toFixed(1)}</td>
                  <td className="px-4 py-1.5 text-right">{counts[i]}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="rounded-2xl border border-line bg-surface p-4 sm:p-5">
          <div className="relative flex h-36 items-end gap-[2px] border-b border-line" role="list" aria-label="Ratings per score">
            {BINS.map((bin, i) => {
              const height = max ? (counts[i] / max) * 100 : 0
              const label = `${bin.toFixed(1)}: ${counts[i]} ${counts[i] === 1 ? 'rating' : 'ratings'}`
              return (
                <div
                  key={bin}
                  role="listitem"
                  tabIndex={counts[i] ? 0 : -1}
                  aria-label={label}
                  onMouseEnter={() => setActive(i)}
                  onMouseLeave={() => setActive(null)}
                  onFocus={() => setActive(i)}
                  onBlur={() => setActive(null)}
                  // The hit target is the full column, taller than the bar itself.
                  className="relative flex h-full flex-1 items-end rounded-t outline-none focus-visible:bg-raised"
                >
                  <div
                    className={`w-full rounded-t-[4px] transition-colors ${active === i ? 'bg-brand-hover' : 'bg-brand'}`}
                    style={{ height: counts[i] ? `max(${height}%, 3px)` : 0 }}
                  />
                  {active === i && (
                    <div className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-1.5 -translate-x-1/2 whitespace-nowrap rounded-lg bg-ink px-2.5 py-1 text-xs font-semibold text-canvas shadow-dialog tabular">
                      {label}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
          <div className="relative mt-1.5 h-4 text-[11px] text-ink-muted tabular" aria-hidden="true">
            {[1, 2.5, 5, 7.5, 10].map((tick) => (
              // Centered under its bar: bin i spans [i/20, (i+1)/20] of the width.
              <span key={tick} className="absolute -translate-x-1/2" style={{ left: `${((tick * 2 - 0.5) / 20) * 100}%` }}>
                {tick}
              </span>
            ))}
          </div>
        </div>
      )}
    </section>
  )
}
