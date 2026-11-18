import { useState } from 'react'

export interface Badge {
  id: string
  name: string
  icon: string
  description: string
  earned: boolean
  progress?: string
}

/**
 * Earned badges up front. On your own profile the locked ones follow, dimmed, with how
 * close you are; visitors only see what's been earned.
 */
export default function BadgeStrip({ badges, isOwnProfile, name }: { badges: Badge[]; isOwnProfile: boolean; name: string }) {
  const [showLocked, setShowLocked] = useState(false)
  const earned = badges.filter((b) => b.earned)
  const locked = badges.filter((b) => !b.earned)
  const visible = isOwnProfile && showLocked ? badges : earned

  return (
    <section className="mt-10" aria-labelledby="badges-title">
      <div className="mb-4 flex items-end justify-between gap-4">
        <div>
          <h2 id="badges-title" className="font-display text-3xl font-extrabold">
            Badges {earned.length > 0 && <span className="text-ink-muted tabular">{earned.length}</span>}
          </h2>
          <p className="mt-1 text-sm text-ink-muted">
            {isOwnProfile ? 'Earned by watching, rating and tracking. The crown moves to whoever has the most hours.' : `What ${name} has earned so far.`}
          </p>
        </div>
        {isOwnProfile && locked.length > 0 && (
          <button
            type="button"
            onClick={() => setShowLocked((v) => !v)}
            aria-expanded={showLocked}
            className="shrink-0 rounded-full border border-line px-4 py-2 text-sm font-semibold text-ink-muted transition-colors hover:border-ink-muted hover:text-ink"
          >
            {showLocked ? 'Hide locked' : `Show ${locked.length} to unlock`}
          </button>
        )}
      </div>

      {visible.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-line px-6 py-6 text-sm text-ink-muted">
          {isOwnProfile ? 'No badges yet. Log your first rating to earn Opening Night.' : `${name} hasn't earned any badges yet.`}
        </div>
      ) : (
        <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {visible.map((badge) => (
            <li
              key={badge.id}
              className={`flex items-start gap-3 rounded-2xl border p-4 ${
                badge.earned
                  ? badge.id === 'projectionist'
                    ? 'border-brand/50 bg-brand/10'
                    : 'border-line bg-surface'
                  : 'border-dashed border-line bg-transparent'
              }`}
            >
              <span
                aria-hidden="true"
                className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-2xl ${badge.earned ? 'bg-raised' : 'bg-raised opacity-40 grayscale'}`}
              >
                {badge.icon}
              </span>
              <div className="min-w-0">
                <p className={`font-semibold ${badge.earned ? '' : 'text-ink-muted'}`}>
                  {badge.name}
                  <span className="sr-only">{badge.earned ? ' (earned)' : ' (locked)'}</span>
                </p>
                <p className="mt-0.5 text-xs leading-relaxed text-ink-muted">{badge.description}</p>
                {badge.progress && (isOwnProfile || badge.earned) && (
                  <p className="mt-1.5 text-xs font-semibold text-ink tabular">{badge.progress}</p>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
