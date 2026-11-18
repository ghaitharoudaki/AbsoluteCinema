import { useState } from 'react'
import { Link } from 'react-router-dom'
import Avatar from './Avatar'
import LockIcon from './LockIcon'
import { api, errorMessage } from '../lib/api'
import { useToast } from '../lib/Toast'

export interface Person {
  id: string
  username: string
  display_name: string | null
  avatar_url: string | null
  bio: string | null
  is_private: boolean
  followers: number
  rating_count: number | null
  is_following: boolean
  follows_you: boolean
}

/** Follow / unfollow with an optimistic update and a confirmation toast. */
export function useFollowToggle(update: (id: string, change: (person: Person) => Person) => void) {
  const toast = useToast()
  const [busy, setBusy] = useState<string | null>(null)

  const toggle = async (person: Person) => {
    const next = !person.is_following
    const name = person.display_name || person.username
    setBusy(person.id)
    update(person.id, (p) => ({ ...p, is_following: next, followers: p.followers + (next ? 1 : -1) }))
    try {
      await api(`follows/${person.id}`, { method: next ? 'PUT' : 'DELETE' })
      toast(next ? (person.follows_you ? `You and ${name} follow each other now` : `You’re following ${name}`) : `Unfollowed ${name}`)
    } catch (err) {
      update(person.id, () => person)
      toast(errorMessage(err, 'That didn’t save. Try again.'), { tone: 'error' })
    } finally {
      setBusy(null)
    }
  }

  return { toggle, busy }
}

export default function PersonRow({
  person,
  onToggle,
  busy,
  isMe = false,
  onNavigate,
}: {
  person: Person
  onToggle: (person: Person) => void
  busy: boolean
  isMe?: boolean
  /** Called when the person's link is followed (e.g. to close a dialog). */
  onNavigate?: () => void
}) {
  const name = person.display_name || person.username
  return (
    <li className="flex items-center gap-3 rounded-2xl border border-line bg-surface p-3 sm:gap-4 sm:p-4">
      <Link to={`/profile/${person.username}`} onClick={onNavigate} className="flex min-w-0 flex-1 items-center gap-3 rounded-xl sm:gap-4">
        <Avatar url={person.avatar_url} name={name} className="h-12 w-12 text-lg" />
        <span className="min-w-0">
          <span className="flex items-center gap-1.5 font-semibold">
            <span className="truncate">{name}</span>
            {person.is_private && (
              <span className="shrink-0 text-ink-muted" title="Private profile">
                <LockIcon className="h-3.5 w-3.5" />
                <span className="sr-only">(private profile)</span>
              </span>
            )}
          </span>
          <span className="flex items-center gap-2 truncate text-sm text-ink-muted">
            <span className="truncate">@{person.username}</span>
            {person.follows_you && !isMe && <span className="shrink-0 rounded-full bg-raised px-2 py-0.5 text-xs font-semibold text-ink">Follows you</span>}
          </span>
          <span className="block text-xs text-ink-muted tabular">
            {person.followers} {person.followers === 1 ? 'follower' : 'followers'}
            {person.rating_count != null ? `, ${person.rating_count} ${person.rating_count === 1 ? 'rating' : 'ratings'}` : ', ratings hidden'}
          </span>
        </span>
      </Link>
      {isMe ? (
        <span className="shrink-0 rounded-full bg-raised px-3 py-1.5 text-xs font-semibold text-ink-muted">You</span>
      ) : (
        <button
          type="button"
          onClick={() => onToggle(person)}
          disabled={busy}
          aria-pressed={person.is_following}
          aria-label={person.is_following ? `Unfollow ${name}` : person.follows_you ? `Follow ${name} back` : `Follow ${name}`}
          className={`min-h-10 shrink-0 rounded-full px-4 py-2 text-sm font-bold transition-colors disabled:opacity-60 ${
            person.is_following ? 'border border-line text-ink hover:border-danger hover:text-danger' : 'bg-brand text-on-brand hover:bg-brand-hover'
          }`}
        >
          {person.is_following ? 'Following' : person.follows_you ? 'Follow back' : 'Follow'}
        </button>
      )}
    </li>
  )
}
