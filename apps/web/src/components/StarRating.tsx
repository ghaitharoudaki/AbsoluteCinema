import { useState, type KeyboardEvent, type MouseEvent } from 'react'

interface StarRatingProps {
  value: number | null
  onChange: (value: number) => void
  label?: string
}

const STAR_PATH =
  'M12 2.5l2.9 6.1 6.6.8-4.9 4.6 1.3 6.6L12 17.5l-5.9 3.1 1.3-6.6L2.5 9.4l6.6-.8L12 2.5z'

const MIN = 0.5
const MAX = 10
const STEP = 0.5
const clamp = (n: number) => Math.min(MAX, Math.max(MIN, n))

/** Ten stars in half steps. Works as a slider: click/hover, or arrow keys. */
export default function StarRating({ value, onChange, label = 'Rating' }: StarRatingProps) {
  const [hover, setHover] = useState<number | null>(null)
  const display = hover ?? value ?? 0

  const valueFromEvent = (e: MouseEvent<HTMLSpanElement>, starIndex: number) => {
    const rect = e.currentTarget.getBoundingClientRect()
    return (e.clientX - rect.left) / rect.width < 0.5 ? starIndex - 0.5 : starIndex
  }

  const handleKey = (e: KeyboardEvent<HTMLDivElement>) => {
    const current = value ?? 0
    const next =
      e.key === 'ArrowRight' || e.key === 'ArrowUp' ? clamp(current + STEP)
      : e.key === 'ArrowLeft' || e.key === 'ArrowDown' ? clamp(current - STEP)
      : e.key === 'PageUp' ? clamp(current + 1)
      : e.key === 'PageDown' ? clamp(current - 1)
      : e.key === 'Home' ? MIN
      : e.key === 'End' ? MAX
      : null
    if (next === null) return
    e.preventDefault()
    onChange(next)
  }

  return (
    <div className="flex flex-wrap items-center gap-4">
      <div
        role="slider"
        tabIndex={0}
        aria-label={label}
        aria-valuemin={MIN}
        aria-valuemax={MAX}
        aria-valuenow={value ?? undefined}
        aria-valuetext={value != null ? `${value.toFixed(1)} out of 10` : 'Not rated'}
        onKeyDown={handleKey}
        onMouseLeave={() => setHover(null)}
        className="flex items-center gap-0.5 rounded-lg p-1"
      >
        {Array.from({ length: 10 }, (_, i) => i + 1).map((i) => {
          const fill = Math.max(0, Math.min(1, display - (i - 1)))
          return (
            <span
              key={i}
              className="relative h-7 w-7 cursor-pointer transition-transform hover:scale-110"
              onMouseMove={(e) => setHover(valueFromEvent(e, i))}
              onClick={(e) => {
                onChange(valueFromEvent(e, i))
                setHover(null)
              }}
            >
              <svg viewBox="0 0 24 24" className="absolute inset-0 h-full w-full text-line" fill="currentColor" aria-hidden="true">
                <path d={STAR_PATH} />
              </svg>
              <span className="absolute inset-0 overflow-hidden" style={{ width: `${fill * 100}%` }}>
                <svg viewBox="0 0 24 24" className="h-7 w-7 text-brand" fill="currentColor" aria-hidden="true">
                  <path d={STAR_PATH} />
                </svg>
              </span>
            </span>
          )
        })}
      </div>
      <span className={`ticket text-xl ${hover ?? value ? '' : 'ticket-soft'}`} aria-hidden="true">
        {(hover ?? value) != null ? (hover ?? value)!.toFixed(1) : '–'}
      </span>
    </div>
  )
}
