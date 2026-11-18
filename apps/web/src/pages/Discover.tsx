import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { api, errorMessage } from '../lib/api'
import { useLogFlow } from '../lib/LogFlow'
import { useToast } from '../lib/Toast'
import { usePageTitle } from '../lib/usePageTitle'
import PosterRail, { type PosterItem } from '../components/PosterRail'

interface HomeData {
  featuredRow: (PosterItem & { id: string })[]
  recentRatings: { movie: PosterItem & { id: string } }[]
}

type Section = 'theaters' | 'picks' | 'friends'

const sections: Record<Section, { title: string; subtitle: string }> = {
  theaters: { title: 'In theaters this week', subtitle: 'New releases and the most watched films right now.' },
  picks: { title: 'Picked for you', subtitle: 'Drawn from the titles you rated highest and your Top 5. Each refresh samples different favourites.' },
  friends: { title: 'Your friends are watching', subtitle: 'The latest titles logged by the group.' },
}

export default function Discover() {
  const [params] = useSearchParams()
  const see = params.get('see') as Section | null
  const focus = see && see in sections ? see : null
  usePageTitle(focus ? sections[focus].title : 'Discover')

  const { openTitle, version } = useLogFlow()
  const toast = useToast()

  const [theaters, setTheaters] = useState<PosterItem[]>([])
  const [theatersLoading, setTheatersLoading] = useState(true)
  const [friends, setFriends] = useState<PosterItem[]>([])
  const [friendsLoading, setFriendsLoading] = useState(true)
  const [picks, setPicks] = useState<PosterItem[]>([])
  const [picksLoading, setPicksLoading] = useState(true)
  const [picksMessage, setPicksMessage] = useState<string | null>(null)
  const [picksCold, setPicksCold] = useState(false)
  const hiddenRef = useRef<Set<number>>(new Set())
  const shuffleRef = useRef(0)

  // The server samples a different handful of favourites for each shuffle number.
  const loadPicks = useCallback(async () => {
    setPicksLoading(true)
    setPicksMessage(null)
    try {
      const { picks: results, cold } = await api<{ picks: PosterItem[]; cold: boolean }>(`recommendations?shuffle=${shuffleRef.current}`)
      setPicks(results.filter((item) => !hiddenRef.current.has(item.tmdb_id)))
      setPicksCold(cold)
      if (results.length === 0) setPicksMessage('Nothing new to suggest right now. Rate a few more titles and check back.')
    } catch (error) {
      setPicksMessage(errorMessage(error, 'Picks didn’t load. Try Show other picks in a moment.'))
    } finally {
      setPicksLoading(false)
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    api<HomeData>('home')
      .then((data) => {
        if (cancelled) return
        setFriends(Array.from(new Map(data.recentRatings.map((r) => [r.movie.id, r.movie])).values()))
        setTheaters((current) => (current.length ? current : data.featuredRow))
      })
      .catch((error) => console.error('Discover data error:', error))
      .finally(() => {
        if (cancelled) return
        setFriendsLoading(false)
        void loadPicks()
      })
    return () => {
      cancelled = true
    }
  }, [loadPicks, version])

  useEffect(() => {
    fetch('/api/tmdb/boxoffice')
      .then((res) => (res.ok ? res.json() : { results: [] }))
      .then((data) => {
        if (data.results?.length) setTheaters(data.results)
      })
      .catch((error) => console.error(error))
      .finally(() => setTheatersLoading(false))
  }, [])

  const hidePick = (item: PosterItem, index: number) => {
    hiddenRef.current.add(item.tmdb_id)
    setPicks((list) => list.filter((pick) => pick.tmdb_id !== item.tmdb_id))
    api('recommendation-feedback', { method: 'POST', body: { tmdb_id: item.tmdb_id } }).catch((error) => console.error(error))
    toast(`${item.title} hidden from your picks`, {
      action: {
        label: 'Undo',
        onClick: () => {
          hiddenRef.current.delete(item.tmdb_id)
          setPicks((list) => [...list.slice(0, index), item, ...list.slice(index)])
          api(`recommendation-feedback/${item.tmdb_id}`, { method: 'DELETE' }).catch((error) => console.error(error))
        },
      },
    })
  }

  const refreshButton = (
    <button
      type="button"
      onClick={() => {
        shuffleRef.current += 1
        void loadPicks()
      }}
      disabled={picksLoading}
      className="rounded-full border border-line px-4 py-2 text-sm font-semibold text-ink-muted transition-colors hover:border-ink-muted hover:text-ink disabled:cursor-wait disabled:opacity-60"
    >
      {picksLoading ? 'Finding picks…' : 'Show other picks'}
    </button>
  )

  const rails: Record<Section, React.ComponentProps<typeof PosterRail>> = {
    theaters: {
      ...sections.theaters,
      items: theaters,
      loading: theatersLoading,
      showScore: true,
      onOpen: openTitle,
      seeAllTo: '/discover?see=theaters',
      emptyText: 'Nothing to show yet. Current releases appear here once the movie database connects.',
    },
    picks: {
      ...sections.picks,
      subtitle: picksCold ? 'Trending this week. Rate a few titles and this row learns your taste.' : sections.picks.subtitle,
      items: picks,
      loading: picksLoading,
      onOpen: openTitle,
      onHide: hidePick,
      action: refreshButton,
      seeAllTo: '/discover?see=picks',
      emptyText: picksMessage ?? 'Rate a few titles or set your Top 5 to get picks here.',
      footer: picksMessage && picks.length > 0 ? <p className="mt-3 text-sm text-ink-muted">{picksMessage}</p> : undefined,
    },
    friends: {
      ...sections.friends,
      items: friends,
      loading: friendsLoading,
      onOpen: openTitle,
      seeAllTo: '/discover?see=friends',
      emptyText: 'No one has logged anything yet. Log yours and it shows up here for everyone.',
    },
  }

  if (focus) {
    return (
      <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
        <Link to="/discover" className="inline-flex items-center gap-1.5 text-sm font-semibold text-ink-muted hover:text-ink">
          <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2.4} aria-hidden="true"><path strokeLinecap="round" strokeLinejoin="round" d="M15 6l-6 6 6 6" /></svg>
          Discover
        </Link>
        <div className="mt-4">
          <PosterRail {...rails[focus]} layout="grid" headingLevel="h1" />
        </div>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-6xl space-y-14 px-4 py-10 sm:px-6">
      <header className="hero-in">
        <h1 className="font-display text-[clamp(3rem,8vw,5.5rem)] font-black uppercase leading-[0.85]">Discover</h1>
        <p className="mt-3 max-w-lg text-ink-muted">What’s out now, what fits your taste, and what the group can’t stop logging.</p>
      </header>
      <PosterRail {...rails.theaters} />
      <PosterRail {...rails.picks} />
      <PosterRail {...rails.friends} />
    </div>
  )
}
