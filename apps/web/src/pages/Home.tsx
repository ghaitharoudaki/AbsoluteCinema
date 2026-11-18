import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../lib/AuthContext'
import { useMe } from '../lib/MeContext'
import { useLogFlow } from '../lib/LogFlow'
import { useToast } from '../lib/Toast'
import { usePageTitle } from '../lib/usePageTitle'
import { api, errorMessage } from '../lib/api'
import { timeAgo } from '../lib/library'
import ContinueWatching from '../components/ContinueWatching'
import Avatar from '../components/Avatar'
import LockIcon from '../components/LockIcon'
import { toSearchResult, type PosterItem } from '../components/PosterRail'

interface Movie extends PosterItem {
  id: string
}

interface Rating {
  id: string
  movie_id: string
  user_id: string
  rating: number
  description: string | null
  created_at: string
  is_private?: boolean
  movie: Movie
  profile: { username: string; avatar_url: string | null }
}

interface FeaturedMovie extends Movie {
  avg_score: number
  rating_count: number
}

interface ReactionRow {
  rating_id: string
  user_id: string
  reaction: 'like' | 'dislike'
}

interface Comment {
  id: string
  rating_id: string
  user_id: string
  content: string
  profile: { username: string } | null
}

interface SocialData {
  reactions: ReactionRow[]
  comments: Comment[]
}

interface HomeData extends SocialData {
  featured: FeaturedMovie | null
  recentRatings: Rating[]
}

interface ReactionSummary {
  likes: number
  dislikes: number
  mine: 'like' | 'dislike' | null
}

function greeting(hour: number) {
  if (hour < 5) return 'Late show'
  if (hour < 12) return 'Good morning'
  if (hour < 18) return 'Good afternoon'
  return 'Good evening'
}

export default function Home() {
  usePageTitle('Home')
  const { user } = useAuth()
  const { me } = useMe()
  const { openSearch, openTitle, version } = useLogFlow()
  const toast = useToast()

  const [featured, setFeatured] = useState<FeaturedMovie | null>(null)
  const [ratings, setRatings] = useState<Rating[]>([])
  const [theaters, setTheaters] = useState<PosterItem[]>([])
  const [reactions, setReactions] = useState<Record<string, ReactionSummary>>({})
  const [comments, setComments] = useState<Record<string, Comment[]>>({})
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)

  const firstName = me?.display_name?.split(' ')[0] || user?.name?.split(' ')[0] || me?.username || 'there'

  const applySocial = useCallback(
    ({ reactions: rows, comments: commentRows }: SocialData) => {
      const summary: Record<string, ReactionSummary> = {}
      rows.forEach((row) => {
        const current = (summary[row.rating_id] ||= { likes: 0, dislikes: 0, mine: null })
        if (row.reaction === 'like') current.likes += 1
        else current.dislikes += 1
        if (row.user_id === user?.id) current.mine = row.reaction
      })
      const grouped: Record<string, Comment[]> = {}
      commentRows.forEach((comment) => (grouped[comment.rating_id] ||= []).push(comment))
      setReactions(summary)
      setComments(grouped)
    },
    [user?.id],
  )

  const load = useCallback(async () => {
    setLoadError(null)
    try {
      const data = await api<HomeData>('home')
      setFeatured(data.featured)
      setRatings(data.recentRatings)
      applySocial(data)
    } catch (error) {
      setLoadError(errorMessage(error, 'Your feed didn’t load. Check your connection and try again.'))
    } finally {
      setLoading(false)
    }
  }, [applySocial])

  useEffect(() => {
    void load()
  }, [load, version])

  useEffect(() => {
    fetch('/api/tmdb/boxoffice')
      .then((res) => (res.ok ? res.json() : { results: [] }))
      .then((data) => setTheaters((data.results || []).slice(0, 4)))
      .catch(() => setTheaters([]))
  }, [])

  const reloadSocial = async () => {
    if (ratings.length === 0) return
    applySocial(await api<SocialData>(`social?rating_ids=${ratings.map((r) => r.id).join(',')}`))
  }

  const toggleReaction = async (ratingId: string, kind: 'like' | 'dislike') => {
    const previous = reactions[ratingId] ?? { likes: 0, dislikes: 0, mine: null }
    const next: ReactionSummary = { ...previous, mine: previous.mine === kind ? null : kind }
    if (previous.mine === 'like') next.likes -= 1
    if (previous.mine === 'dislike') next.dislikes -= 1
    if (next.mine === 'like') next.likes += 1
    if (next.mine === 'dislike') next.dislikes += 1
    // Optimistic: the count moves at once, and rolls back if the save fails.
    setReactions((all) => ({ ...all, [ratingId]: next }))
    try {
      await api('reactions', { method: 'PUT', body: { rating_id: ratingId, reaction: next.mine } })
    } catch (error) {
      setReactions((all) => ({ ...all, [ratingId]: previous }))
      toast(errorMessage(error, 'Your reaction didn’t save. Try again.'), { tone: 'error' })
    }
  }

  const addComment = async (ratingId: string, content: string) => {
    await api('comments', { method: 'POST', body: { rating_id: ratingId, content } })
    await reloadSocial()
  }

  const deleteComment = async (comment: Comment) => {
    try {
      await api(`comments/${comment.id}`, { method: 'DELETE' })
      setComments((all) => ({ ...all, [comment.rating_id]: (all[comment.rating_id] || []).filter((c) => c.id !== comment.id) }))
      toast('Comment deleted')
    } catch (error) {
      toast(errorMessage(error, 'That comment couldn’t be deleted. Try again.'), { tone: 'error' })
    }
  }

  const weekAgo = Date.now() - 7 * 24 * 3600 * 1000
  const thisWeek = ratings.filter((r) => Date.parse(r.created_at) > weekAgo).length

  return (
    <div className="mx-auto max-w-6xl space-y-14 px-4 py-10 sm:px-6">
      <section className="hero-in flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm font-semibold text-brand">{greeting(new Date().getHours())}</p>
          <h1 className="mt-1 font-display text-[clamp(3rem,8vw,5.5rem)] font-black uppercase leading-[0.85]">{firstName}</h1>
          <p className="mt-3 max-w-lg text-ink-muted">
            {loading
              ? 'Catching up on what your friends watched…'
              : thisWeek > 0
                ? `${thisWeek} new ${thisWeek === 1 ? 'rating' : 'ratings'} from the group this week.`
                : 'Quiet week in the group. Log something and get the conversation going.'}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link to="/discover" className="rounded-full border border-line px-5 py-2.5 text-sm font-semibold transition-colors hover:border-ink-muted">
            Find something to watch
          </Link>
          <Link to="/people" className="rounded-full border border-line px-5 py-2.5 text-sm font-semibold transition-colors hover:border-ink-muted">
            Find people
          </Link>
          <button
            type="button"
            onClick={openSearch}
            className="rounded-full bg-brand px-5 py-2.5 text-sm font-bold text-on-brand transition-colors hover:bg-brand-hover md:hidden"
          >
            Log a film
          </button>
        </div>
      </section>

      <ContinueWatching refreshKey={version} onOpen={openTitle} />

      {loadError && (
        <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-danger/30 bg-danger/10 px-4 py-3 text-sm text-danger">
          {loadError}
          <button type="button" onClick={() => void load()} className="rounded-full border border-danger/40 px-3 py-1 font-semibold hover:bg-danger/10">
            Try again
          </button>
        </div>
      )}

      <section className="grid gap-10 lg:grid-cols-[1.6fr_1fr]">
        <div>
          <h2 className="font-display text-3xl font-extrabold">From the group</h2>
          <p className="mt-1 text-sm text-ink-muted">The latest ratings. React, or reply to start a thread.</p>

          <ol className="mt-5 space-y-3" aria-busy={loading}>
            {loading
              ? Array.from({ length: 3 }, (_, i) => <li key={i} className="skeleton h-36 rounded-2xl" />)
              : ratings.length > 0
                ? ratings.map((rating) => (
                    <FeedCard
                      key={rating.id}
                      rating={rating}
                      reactions={reactions[rating.id]}
                      comments={comments[rating.id] ?? []}
                      myId={user?.id}
                      onOpen={() => openTitle(toSearchResult(rating.movie))}
                      onReact={(kind) => void toggleReaction(rating.id, kind)}
                      onComment={(content) => addComment(rating.id, content)}
                      onDeleteComment={(comment) => void deleteComment(comment)}
                    />
                  ))
                : (
                    <li className="rounded-2xl border border-dashed border-line px-6 py-10 text-center">
                      <p className="font-display text-2xl font-extrabold">The screen is dark</p>
                      <p className="mt-1 text-sm text-ink-muted">No one has rated anything yet. Be the first.</p>
                      <button type="button" onClick={openSearch} className="mt-4 rounded-full bg-brand px-5 py-2 text-sm font-bold text-on-brand hover:bg-brand-hover">
                        Log a film
                      </button>
                    </li>
                  )}
          </ol>
        </div>

        <aside className="space-y-10 lg:sticky lg:top-24 lg:self-start">
          <section aria-labelledby="favorite-title">
            <h2 id="favorite-title" className="font-display text-3xl font-extrabold">Group favorite</h2>
            <p className="mt-1 text-sm text-ink-muted">The best-rated title across everyone’s logs.</p>
            {featured ? (
              <button
                type="button"
                onClick={() => openTitle(toSearchResult(featured))}
                className="group mt-5 block w-full overflow-hidden rounded-2xl border border-line bg-surface text-left"
              >
                <span className="relative block aspect-[16/10] overflow-hidden bg-raised">
                  {featured.poster_path && (
                    <img
                      src={`https://image.tmdb.org/t/p/w500${featured.poster_path}`}
                      alt=""
                      className="h-full w-full object-cover object-[center_20%] transition-transform duration-500 group-hover:scale-105"
                    />
                  )}
                  <span className="absolute inset-0 bg-gradient-to-t from-surface via-surface/20 to-transparent" aria-hidden="true" />
                </span>
                <span className="relative -mt-16 flex items-end justify-between gap-4 px-5 pb-5">
                  <span className="min-w-0">
                    <span className="block font-display text-3xl font-extrabold leading-none">{featured.title}</span>
                    <span className="mt-2 block text-sm text-ink-muted">
                      {featured.release_year ?? 'Year unknown'}, {featured.rating_count} {featured.rating_count === 1 ? 'rating' : 'ratings'}
                    </span>
                  </span>
                  <span className="ticket shrink-0 text-3xl">{featured.avg_score?.toFixed(1) ?? '–'}</span>
                </span>
              </button>
            ) : (
              <div className="mt-5 rounded-2xl border border-dashed border-line px-6 py-8 text-sm text-ink-muted">
                {loading ? 'Loading…' : 'Once a few titles are rated, the group’s top pick shows up here.'}
              </div>
            )}
          </section>

          {theaters.length > 0 && (
            <section aria-labelledby="theaters-teaser">
              <div className="flex items-end justify-between gap-3">
                <h2 id="theaters-teaser" className="font-display text-3xl font-extrabold">In theaters</h2>
                <Link to="/discover?see=theaters" className="text-sm font-semibold text-brand underline-offset-4 hover:underline">
                  See all<span className="sr-only"> titles in theaters</span>
                </Link>
              </div>
              <ul className="mt-4 grid grid-cols-4 gap-3">
                {theaters.map((item) => (
                  <li key={item.tmdb_id}>
                    <button type="button" onClick={() => openTitle(toSearchResult(item))} className="block w-full rounded-lg" aria-label={item.title}>
                      <span className="poster block aspect-[2/3] overflow-hidden rounded-lg bg-raised shadow-poster">
                        {item.poster_path && <img src={`https://image.tmdb.org/t/p/w200${item.poster_path}`} alt="" loading="lazy" className="h-full w-full object-cover" />}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </aside>
      </section>
    </div>
  )
}

interface FeedCardProps {
  rating: Rating
  reactions?: ReactionSummary
  comments: Comment[]
  myId?: string
  onOpen: () => void
  onReact: (kind: 'like' | 'dislike') => void
  onComment: (content: string) => Promise<void>
  onDeleteComment: (comment: Comment) => void
}

function FeedCard({ rating, reactions, comments, myId, onOpen, onReact, onComment, onDeleteComment }: FeedCardProps) {
  const [replying, setReplying] = useState(false)
  const [draft, setDraft] = useState('')
  const [posting, setPosting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showAll, setShowAll] = useState(false)
  const username = rating.profile?.username || 'A friend'
  const visibleComments = showAll ? comments : comments.slice(-2)

  const submit = async () => {
    const content = draft.trim()
    if (!content) return
    setPosting(true)
    setError(null)
    try {
      await onComment(content)
      setDraft('')
    } catch (err) {
      setError(errorMessage(err, 'Your reply didn’t post. Try again.'))
    } finally {
      setPosting(false)
    }
  }

  const reactionButton = (kind: 'like' | 'dislike') => {
    const active = reactions?.mine === kind
    const count = kind === 'like' ? reactions?.likes ?? 0 : reactions?.dislikes ?? 0
    return (
      <button
        type="button"
        onClick={() => onReact(kind)}
        aria-pressed={active}
        aria-label={`${kind === 'like' ? 'Like' : 'Dislike'} (${count})`}
        className={`flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold transition-colors ${
          active ? 'bg-brand/15 text-brand' : 'text-ink-muted hover:bg-raised hover:text-ink'
        }`}
      >
        <svg viewBox="0 0 24 24" className={`h-4 w-4 transition-transform ${kind === 'dislike' ? 'rotate-180' : ''} ${active ? 'scale-110' : ''}`} fill={active ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth={2} aria-hidden="true">
          <path strokeLinejoin="round" d="M7 11v9H4v-9h3zm0 0l4-8a2 2 0 012 2v4h5.5a2 2 0 012 2.3l-1.2 7A2 2 0 0117.3 20H7" />
        </svg>
        <span className="tabular">{count}</span>
      </button>
    )
  }

  return (
    <li className="rounded-2xl border border-line bg-surface p-4">
      <div className="flex items-center gap-2.5 text-sm">
        <Link to={`/profile/${username}`} className="flex min-w-0 items-center gap-2.5 rounded-full">
          <Avatar url={rating.profile?.avatar_url} name={username} className="h-7 w-7 text-xs" />
          <span className="truncate font-semibold hover:underline">{username}</span>
        </Link>
        <span className="text-ink-muted">rated</span>
        {rating.is_private && (
          <span className="inline-flex items-center gap-1 rounded-full bg-raised px-2 py-0.5 text-xs font-semibold text-ink-muted" title="Private log: only you can see it">
            <LockIcon className="h-3 w-3" />
            Only you
          </span>
        )}
        <time dateTime={rating.created_at} title={new Date(rating.created_at).toLocaleString()} className="ml-auto shrink-0 text-xs text-ink-muted">
          {timeAgo(rating.created_at)}
        </time>
      </div>

      <button type="button" onClick={onOpen} className="mt-3 flex w-full gap-4 rounded-lg text-left">
        <span className="h-[5.25rem] w-14 shrink-0 overflow-hidden rounded-lg bg-raised">
          {rating.movie.poster_path && <img src={`https://image.tmdb.org/t/p/w200${rating.movie.poster_path}`} alt="" loading="lazy" className="h-full w-full object-cover" />}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate font-semibold">{rating.movie.title}</span>
          <span className="block text-xs text-ink-muted">{rating.movie.release_year ?? 'Year unknown'}{rating.movie.media_type === 'tv' ? ', series' : ''}</span>
          {rating.description && <span className="mt-1.5 line-clamp-2 block text-sm leading-relaxed text-ink-muted">“{rating.description}”</span>}
        </span>
        <span className="ticket shrink-0 self-start text-xl">{Number(rating.rating).toFixed(1)}</span>
      </button>

      <div className="mt-3 flex items-center gap-1 border-t border-line pt-3">
        {reactionButton('like')}
        {reactionButton('dislike')}
        <button
          type="button"
          onClick={() => setReplying((value) => !value)}
          aria-expanded={replying}
          className="ml-auto flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold text-ink-muted transition-colors hover:bg-raised hover:text-ink"
        >
          <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden="true">
            <path strokeLinejoin="round" d="M4 5h16v11H9l-5 4z" />
          </svg>
          {comments.length > 0 ? `${comments.length} ${comments.length === 1 ? 'reply' : 'replies'}` : 'Reply'}
        </button>
      </div>

      {comments.length > 0 && (
        <ul className="mt-3 space-y-1.5">
          {comments.length > 2 && !showAll && (
            <li>
              <button type="button" onClick={() => setShowAll(true)} className="text-xs font-semibold text-ink-muted hover:text-ink">
                Show {comments.length - 2} earlier {comments.length - 2 === 1 ? 'reply' : 'replies'}
              </button>
            </li>
          )}
          {visibleComments.map((comment) => (
            <li key={comment.id} className="flex items-start justify-between gap-3 text-sm">
              <p className="min-w-0">
                <span className="font-semibold">{comment.profile?.username || 'A friend'}</span> <span className="text-ink-muted">{comment.content}</span>
              </p>
              {(comment.user_id === myId || rating.user_id === myId) && (
                <button type="button" onClick={() => onDeleteComment(comment)} className="shrink-0 text-xs font-medium text-ink-muted hover:text-danger">
                  Delete
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      {replying && (
        <form
          className="mt-3 flex gap-2"
          onSubmit={(event) => {
            event.preventDefault()
            void submit()
          }}
        >
          <label htmlFor={`reply-${rating.id}`} className="sr-only">
            Reply to {username} about {rating.movie.title}
          </label>
          <input
            id={`reply-${rating.id}`}
            autoFocus
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            placeholder={`Reply to ${username}`}
            maxLength={500}
            className="min-w-0 flex-1 rounded-full border border-line bg-raised px-4 py-2 text-sm text-ink placeholder:text-ink-muted focus:border-brand focus:outline-none"
          />
          <button
            type="submit"
            disabled={posting}
            className="rounded-full px-4 py-2 text-sm font-semibold text-brand transition-colors hover:bg-brand/10 disabled:cursor-wait disabled:opacity-60"
          >
            {posting ? 'Posting…' : 'Post'}
          </button>
        </form>
      )}
      {error && <p role="alert" className="mt-2 text-sm text-danger">{error}</p>}
    </li>
  )
}
