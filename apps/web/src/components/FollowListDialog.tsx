import { useCallback, useEffect, useState, type KeyboardEvent } from 'react'
import Dialog, { CloseButton } from './Dialog'
import PersonRow, { useFollowToggle, type Person } from './PersonRow'
import { api, errorMessage } from '../lib/api'

type List = 'followers' | 'following'

interface FollowListDialogProps {
  username: string
  name: string
  initial: List
  counts: { followers: number; following: number }
  isOwnProfile: boolean
  myId?: string
  onClose: () => void
  /** Called when the viewer followed or unfollowed someone, so the page can refresh its counts. */
  onFollowChange?: () => void
}

/** Followers / Following for a profile, with Follow back on each row. */
export default function FollowListDialog({ username, name, initial, counts, isOwnProfile, myId, onClose, onFollowChange }: FollowListDialogProps) {
  const [list, setList] = useState<List>(initial)
  const [people, setPeople] = useState<Person[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const update = useCallback((id: string, change: (person: Person) => Person) => {
    setPeople((rows) => rows.map((p) => (p.id === id ? change(p) : p)))
  }, [])
  const { toggle, busy } = useFollowToggle(update)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    api<{ people: Person[] }>(`profiles/${encodeURIComponent(username)}/${list}`)
      .then(({ people: rows }) => !cancelled && setPeople(rows))
      .catch((err) => !cancelled && setError(errorMessage(err, 'This list didn’t load. Try again.')))
      .finally(() => !cancelled && setLoading(false))
    return () => {
      cancelled = true
    }
  }, [username, list])

  const onTabKey = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return
    event.preventDefault()
    const next = list === 'followers' ? 'following' : 'followers'
    setList(next)
    document.getElementById(`follow-tab-${next}`)?.focus()
  }

  const toFollowBack = isOwnProfile && list === 'followers' ? people.filter((p) => p.follows_you && !p.is_following).length : 0
  const emptyText =
    list === 'followers'
      ? isOwnProfile ? 'No followers yet. Share your profile with friends, or find them on the People page.' : `No one follows ${name} yet.`
      : isOwnProfile ? 'You’re not following anyone yet. Find friends on the People page.' : `${name} isn’t following anyone yet.`

  return (
    <Dialog onClose={onClose} title={list === 'followers' ? `People who follow ${name}` : `People ${name} follows`}>
      <div className="flex items-center justify-between gap-4 border-b border-line px-5 py-4">
        <div role="tablist" aria-label="Follow lists" className="grid flex-1 grid-cols-2 gap-1 rounded-full bg-raised p-1">
          {(['followers', 'following'] as const).map((value) => (
            <button
              key={value}
              id={`follow-tab-${value}`}
              type="button"
              role="tab"
              aria-selected={list === value}
              tabIndex={list === value ? 0 : -1}
              onClick={() => setList(value)}
              onKeyDown={onTabKey}
              className={`rounded-full px-3 py-2 text-sm font-semibold transition-colors ${list === value ? 'bg-surface text-ink shadow-sm' : 'text-ink-muted hover:text-ink'}`}
            >
              {value === 'followers' ? 'Followers' : 'Following'} <span className="tabular text-ink-muted">{counts[value]}</span>
            </button>
          ))}
        </div>
        <CloseButton onClick={onClose} />
      </div>

      <div className="max-h-[65dvh] overflow-y-auto overscroll-contain p-4" role="tabpanel" aria-labelledby={`follow-tab-${list}`}>
        {toFollowBack > 0 && (
          <p className="mb-3 rounded-xl bg-brand/10 px-3.5 py-2.5 text-sm font-medium text-brand">
            {toFollowBack} {toFollowBack === 1 ? 'person follows' : 'people follow'} you that you don’t follow back yet.
          </p>
        )}
        {error ? (
          <p role="alert" className="rounded-xl bg-danger/10 px-4 py-3 text-sm text-danger">{error}</p>
        ) : loading ? (
          <ul className="space-y-3" aria-busy="true" aria-label="Loading">
            {Array.from({ length: 3 }, (_, i) => <li key={i} className="skeleton h-20 rounded-2xl" />)}
          </ul>
        ) : people.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-line px-5 py-8 text-center text-sm text-ink-muted">{emptyText}</p>
        ) : (
          <ul className="space-y-3">
            {people.map((person) => (
              <PersonRow
                key={person.id}
                person={person}
                busy={busy === person.id}
                isMe={person.id === myId}
                onNavigate={onClose}
                onToggle={(p) => {
                  void toggle(p).then(() => onFollowChange?.())
                }}
              />
            ))}
          </ul>
        )}
      </div>
    </Dialog>
  )
}
