import { useEffect, useId, useRef, useState } from 'react'

export interface Badge {
  id: string
  name: string
  icon: string
  description: string
  earned: boolean
  progress?: string
}

interface BadgeIconsProps {
  badges: Badge[]
  isOwnProfile: boolean
}

/**
 * Badges as a compact row of icons under the name. Hover or focus shows what one means;
 * a tap pins it (phones have no hover). The detail sits under the row so it never runs off-screen.
 */
export default function BadgeIcons({ badges, isOwnProfile }: BadgeIconsProps) {
  const [hovered, setHovered] = useState<string | null>(null)
  const [pinned, setPinned] = useState<string | null>(null)
  const [showLocked, setShowLocked] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)
  const detailId = useId()

  const earned = badges.filter((b) => b.earned)
  const locked = badges.filter((b) => !b.earned)
  const visible = isOwnProfile && showLocked ? [...earned, ...locked] : earned
  const activeId = hovered ?? pinned
  const active = badges.find((b) => b.id === activeId)

  // Tapping anywhere else, or Escape, unpins.
  useEffect(() => {
    if (!pinned) return
    const onDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setPinned(null)
    }
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setPinned(null)
    }
    document.addEventListener('pointerdown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('pointerdown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [pinned])

  if (earned.length === 0 && !isOwnProfile) return null

  return (
    <div ref={rootRef} className="relative mt-4">
      <ul className="flex flex-wrap items-center gap-1.5" aria-label="Badges">
        {visible.map((badge) => {
          const isActive = activeId === badge.id
          return (
            <li key={badge.id}>
              <button
                type="button"
                aria-label={`${badge.name}${badge.earned ? '' : ' (locked)'}`}
                aria-describedby={isActive ? detailId : undefined}
                aria-expanded={pinned === badge.id}
                onMouseEnter={() => setHovered(badge.id)}
                onMouseLeave={() => setHovered(null)}
                onFocus={() => setHovered(badge.id)}
                onBlur={() => setHovered(null)}
                onClick={() => setPinned((current) => (current === badge.id ? null : badge.id))}
                className={`flex h-9 w-9 items-center justify-center rounded-full border text-lg transition-transform hover:-translate-y-0.5 ${
                  isActive ? 'border-brand bg-brand/15' : badge.id === 'projectionist' && badge.earned ? 'border-brand/60 bg-brand/10' : 'border-line bg-surface'
                } ${badge.earned ? '' : 'opacity-40 grayscale'}`}
              >
                <span aria-hidden="true">{badge.icon}</span>
              </button>
            </li>
          )
        })}
        {isOwnProfile && locked.length > 0 && (
          <li>
            <button
              type="button"
              onClick={() => setShowLocked((value) => !value)}
              aria-expanded={showLocked}
              className="h-9 rounded-full border border-dashed border-line px-3 text-xs font-semibold text-ink-muted transition-colors hover:border-ink-muted hover:text-ink"
            >
              {showLocked ? 'Hide locked' : earned.length === 0 ? `${locked.length} badges to earn` : `+${locked.length} to unlock`}
            </button>
          </li>
        )}
      </ul>

      <div id={detailId} role="status" aria-live="polite" className={
          active
            ? 'toast-in absolute left-0 top-full z-30 mt-2 w-[min(22rem,calc(100vw-2rem))] rounded-xl border border-line bg-surface px-3.5 py-2.5 shadow-dialog'
            : 'sr-only'
        }>
        {active && (
          <>
            <p className="text-sm font-semibold">
              <span aria-hidden="true">{active.icon} </span>
              {active.name}
              {!active.earned && <span className="ml-1.5 text-xs font-medium text-ink-muted">Locked</span>}
            </p>
            <p className="mt-0.5 text-xs leading-relaxed text-ink-muted">{active.description}</p>
            {active.progress && (isOwnProfile || active.earned) && <p className="mt-1 text-xs font-semibold tabular">{active.progress}</p>}
          </>
        )}
      </div>
    </div>
  )
}
