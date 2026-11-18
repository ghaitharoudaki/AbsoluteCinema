import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import NavBar from '../components/NavBar'
import Top5Picker, { type Top5Movie } from '../components/Top5Picker'
import MovieDetail from '../components/MovieDetail'
import RateMovie from './RateMovie'
import Dialog, { CloseButton } from '../components/Dialog'
import type { SearchResult } from '../components/MovieSearch'
import { useAuth } from '../lib/AuthContext'
import { api, ApiError, errorMessage } from '../lib/api'

interface ProfileRow {
  id: string
  username: string
  display_name: string | null
  avatar_url: string | null
  bio: string | null
}

interface WatchStats {
  movie_hours: number
  series_hours: number
  movie_count: number
  series_count: number
}

interface ProfileMovie {
  id: string
  tmdb_id: number
  title: string
  poster_path: string | null
  release_year: number | null
  media_type: string
  rating?: number
}

interface ProfileRating {
  id: string
  movie: ProfileMovie
  rating: number
  description: string | null
  watched_date: string | null
  date_type: 'exact' | 'release' | 'unknown'
}

interface ProfileResponse {
  profile: ProfileRow
  top5: Top5Movie[]
  ratings: ProfileRating[]
  watchlist: ProfileMovie[]
  stats: WatchStats
  favoriteGenre: string | null
  followers: number
  following: number
  isFollowing: boolean
}

export default function Profile() {
  const { username } = useParams<{ username: string }>()
  const { user } = useAuth()

  const [profile, setProfile] = useState<ProfileRow | null>(null)
  const [top5, setTop5] = useState<Top5Movie[]>([])
  const [recentMovies, setRecentMovies] = useState<ProfileMovie[]>([])
  const [watchlist, setWatchlist] = useState<ProfileMovie[]>([])
  const [ratings, setRatings] = useState<ProfileRating[]>([])
  const [selectedMovie, setSelectedMovie] = useState<SearchResult | null>(null)
  const [ratingTarget, setRatingTarget] = useState<SearchResult | null>(null)
  const [editingRating, setEditingRating] = useState<ProfileRating | null>(null)
  const [editingProfile, setEditingProfile] = useState(false)
  const [profileForm, setProfileForm] = useState({ display_name: '', username: '', bio: '', avatar_url: '' })
  const [stats, setStats] = useState<WatchStats | null>(null)
  const [favoriteGenre, setFavoriteGenre] = useState<string | null>(null)
  const [followers, setFollowers] = useState(0)
  const [following, setFollowing] = useState(0)
  const [isFollowing, setIsFollowing] = useState(false)
  const [followLoading, setFollowLoading] = useState(false)
  const [loading, setLoading] = useState(true)
  const [profileSaving, setProfileSaving] = useState(false)
  const [profileError, setProfileError] = useState<string | null>(null)
  const navigate = useNavigate()

  const isOwnProfile = !!user && profile?.id === user.id

  const loadProfile = useCallback(async (showLoading = true) => {
    if (!username) return

    if (showLoading) setLoading(true)

    let data: ProfileResponse
    try {
      data = await api<ProfileResponse>(`profiles/${encodeURIComponent(username)}`)
    } catch (error) {
      if (!(error instanceof ApiError && error.status === 404)) console.error('Profile load failed:', error)
      setProfile(null)
      setLoading(false)
      return
    }

    const profileData = data.profile
    setProfile(profileData)
    setProfileForm({
      display_name: profileData.display_name ?? '',
      username: profileData.username,
      bio: profileData.bio ?? '',
      avatar_url: profileData.avatar_url ?? '',
    })

    setTop5(data.top5)
    setRatings(data.ratings)
    const ratedMovies = data.ratings.map((row) => ({ ...row.movie, rating: Number(row.rating) }))
    const top5Movies: ProfileMovie[] = data.top5.map((movie) => ({
      id: movie.movie_id,
      tmdb_id: movie.tmdb_id ?? 0,
      title: movie.title,
      poster_path: movie.poster_path,
      release_year: movie.release_year,
      media_type: movie.media_type ?? 'movie',
      rating: undefined,
    }))
    setRecentMovies(
      [...ratedMovies, ...top5Movies].filter((movie, index, movies) => movies.findIndex((item) => item.id === movie.id) === index),
    )
    setWatchlist(data.watchlist)
    setStats(data.stats)
    setFavoriteGenre(data.favoriteGenre)
    setFollowers(data.followers)
    setFollowing(data.following)
    setIsFollowing(data.isFollowing)

    setLoading(false)
  }, [username])

  useEffect(() => {
    loadProfile()
  }, [loadProfile])

  const toggleFollow = async () => {
    if (!user || !profile || isOwnProfile) return

    setFollowLoading(true)
    try {
      if (isFollowing) {
        await api(`follows/${profile.id}`, { method: 'DELETE' })
        setIsFollowing(false)
        setFollowers((count) => Math.max(0, count - 1))
      } else {
        await api(`follows/${profile.id}`, { method: 'PUT' })
        setIsFollowing(true)
        setFollowers((count) => count + 1)
      }
    } catch (error) {
      console.error('Follow failed:', error)
    } finally {
      setFollowLoading(false)
    }
  }

  const saveProfile = async () => {
    if (!profile) return
    setProfileSaving(true)
    setProfileError(null)
    try {
      const { profile: saved } = await api<{ profile: ProfileRow }>('profile', {
        method: 'PATCH',
        body: {
          display_name: profileForm.display_name,
          username: profileForm.username,
          bio: profileForm.bio,
          avatar_url: profileForm.avatar_url,
        },
      })
      setProfile(saved)
      setEditingProfile(false)
      if (saved.username !== username) navigate(`/profile/${saved.username}`, { replace: true })
    } catch (error) {
      setProfileError(errorMessage(error, "Your profile didn't save. Try again."))
    } finally {
      setProfileSaving(false)
    }
  }

  const removeFromWatchlist = async (movieId: string) => {
    if (!user || !isOwnProfile) return
    try {
      await api(`watchlist/${movieId}`, { method: 'DELETE' })
      setWatchlist((movies) => movies.filter((movie) => movie.id !== movieId))
    } catch (error) {
      console.error('Watchlist removal failed:', error)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-canvas text-ink">
        <NavBar />
        <main className="mx-auto max-w-5xl px-4 py-10 sm:px-6" aria-busy="true" aria-label="Loading profile">
          <div className="flex items-center gap-6">
            <div className="skeleton h-24 w-24 rounded-full" />
            <div className="space-y-3">
              <div className="skeleton h-10 w-64 rounded" />
              <div className="skeleton h-4 w-32 rounded" />
            </div>
          </div>
          <div className="mt-12 grid grid-cols-2 gap-4 sm:grid-cols-5">
            {Array.from({ length: 5 }, (_, i) => (
              <div key={i} className="skeleton aspect-[2/3] rounded-xl" />
            ))}
          </div>
        </main>
      </div>
    )
  }

  if (!profile) {
    return (
      <div className="min-h-screen bg-canvas text-ink">
        <NavBar />
        <main className="mx-auto flex min-h-[60vh] max-w-md flex-col items-center justify-center gap-3 px-6 text-center">
          <h1 className="font-display text-4xl font-extrabold">Profile not found</h1>
          <p className="text-ink-muted">There's no one called @{username}. Check the spelling, or find them through a rating on the home page.</p>
          <Link to="/" className="mt-3 rounded-full bg-brand px-5 py-2.5 text-sm font-bold text-on-brand hover:bg-brand-hover">
            Go to home
          </Link>
        </main>
      </div>
    )
  }

  const totalHours = (stats?.movie_hours ?? 0) + (stats?.series_hours ?? 0)
  const totalLogged = (stats?.movie_count ?? 0) + (stats?.series_count ?? 0)
  const name = profile.display_name || profile.username
  const toSearchResult = (movie: ProfileMovie): SearchResult => ({
    tmdb_id: movie.tmdb_id,
    title: movie.title,
    poster_path: movie.poster_path,
    release_year: movie.release_year ? String(movie.release_year) : null,
    media_type: movie.media_type === 'tv' ? 'tv' : 'movie',
  })
  const sectionTitle = 'font-display text-3xl font-extrabold'
  const inputClass =
    'mt-1.5 w-full rounded-xl border border-line bg-raised px-3.5 py-2.5 text-sm font-normal text-ink focus:border-brand focus:outline-none'

  return (
    <div className="min-h-screen bg-canvas text-ink">
      <NavBar />

      <main className="mx-auto max-w-5xl px-4 pb-16 sm:px-6">
        <section className="relative -mx-4 overflow-hidden px-4 pb-8 pt-12 sm:-mx-6 sm:px-6">
          {top5[0]?.poster_path && (
            <div
              aria-hidden="true"
              className="absolute inset-0 bg-cover opacity-40 blur-sm"
              style={{ backgroundImage: `url(https://image.tmdb.org/t/p/w780${top5[0].poster_path})`, backgroundPosition: 'center 22%' }}
            />
          )}
          <div
            aria-hidden="true"
            className="absolute inset-0"
            style={{ background: 'linear-gradient(0deg, rgb(var(--canvas)) 0%, rgb(var(--canvas) / 0.75) 55%, rgb(var(--canvas) / 0.45) 100%)' }}
          />

          <div className="relative flex flex-col gap-6 sm:flex-row sm:items-end">
            {profile.avatar_url ? (
              <img src={profile.avatar_url} alt="" className="h-28 w-28 shrink-0 rounded-full object-cover ring-4 ring-canvas" />
            ) : (
              <div className="flex h-28 w-28 shrink-0 items-center justify-center rounded-full bg-raised font-display text-5xl font-black text-ink-muted ring-4 ring-canvas">
                {name.charAt(0).toUpperCase()}
              </div>
            )}

            <div className="min-w-0 flex-1">
              <h1 className="font-display text-[clamp(2.75rem,7vw,4.5rem)] font-black uppercase leading-[0.85]">{name}</h1>
              <p className="mt-2 text-ink-muted">@{profile.username}</p>
              {profile.bio && <p className="mt-3 max-w-xl leading-relaxed">{profile.bio}</p>}

              <div className="mt-5 flex flex-wrap items-center gap-x-5 gap-y-3 text-sm">
                <span>
                  <span className="font-bold tabular">{followers}</span> <span className="text-ink-muted">{followers === 1 ? 'follower' : 'followers'}</span>
                </span>
                <span>
                  <span className="font-bold tabular">{following}</span> <span className="text-ink-muted">following</span>
                </span>

                {!isOwnProfile && user && (
                  <button
                    type="button"
                    onClick={() => void toggleFollow()}
                    disabled={followLoading}
                    aria-pressed={isFollowing}
                    className={`rounded-full px-5 py-2 text-sm font-bold transition-colors disabled:opacity-60 ${
                      isFollowing ? 'border border-line text-ink hover:border-danger hover:text-danger' : 'bg-brand text-on-brand hover:bg-brand-hover'
                    }`}
                  >
                    {followLoading ? 'Saving…' : isFollowing ? 'Following' : `Follow ${name}`}
                  </button>
                )}

                {isOwnProfile && (
                  <button
                    type="button"
                    onClick={() => setEditingProfile(true)}
                    className="rounded-full border border-line px-4 py-2 text-sm font-semibold transition-colors hover:border-ink-muted"
                  >
                    Edit profile
                  </button>
                )}
              </div>
            </div>
          </div>
        </section>

        <section className="mt-4" aria-labelledby="stats-title">
          <h2 id="stats-title" className="sr-only">Watch stats</h2>
          <dl className="grid grid-cols-2 overflow-hidden rounded-2xl border border-line bg-surface sm:grid-cols-3 lg:grid-cols-6">
            {[
              { label: 'Hours watched', value: `${totalHours.toFixed(0)}h` },
              { label: 'Film hours', value: `${(stats?.movie_hours ?? 0).toFixed(0)}h` },
              { label: 'Series hours', value: `${(stats?.series_hours ?? 0).toFixed(0)}h` },
              { label: 'Titles logged', value: totalLogged },
              { label: 'Films / series', value: `${stats?.movie_count ?? 0} / ${stats?.series_count ?? 0}` },
              { label: 'Top genre', value: favoriteGenre ?? '–' },
            ].map((stat) => (
              <div key={stat.label} className="border-b border-r border-line px-5 py-4 [&:nth-child(2n)]:border-r-0 sm:[&:nth-child(2n)]:border-r sm:[&:nth-child(3n)]:border-r-0 lg:border-b-0 lg:[&:nth-child(3n)]:border-r lg:last:border-r-0">
                <dt className="text-xs text-ink-muted">{stat.label}</dt>
                <dd className="mt-1 truncate font-display text-3xl font-extrabold tabular">{stat.value}</dd>
              </div>
            ))}
          </dl>
        </section>

        <section className="mt-14" aria-labelledby="top5-title">
          <div className="mb-8 flex items-end justify-between gap-4">
            <div>
              <h2 id="top5-title" className={sectionTitle}>Top 5</h2>
              <p className="mt-1 text-sm text-ink-muted">
                {isOwnProfile ? 'Your all-time favorites. Used to match your taste with friends.' : `${name}'s all-time favorites.`}
              </p>
            </div>
            {isOwnProfile && <span className="shrink-0 text-sm text-ink-muted tabular">{top5.length} of 5 picked</span>}
          </div>
          <Top5Picker items={top5} editable={isOwnProfile} onSaved={() => void loadProfile(false)} />
        </section>

        <MovieShelf
          title="Watched"
          subtitle={isOwnProfile ? 'Everything you’ve logged, newest first.' : `Everything ${name} has logged, newest first.`}
          movies={recentMovies}
          emptyText={isOwnProfile ? 'Nothing logged yet. Use Log a film on the home page to add your first.' : `${name} hasn’t logged anything yet.`}
          onMovieClick={(movie) => setSelectedMovie(toSearchResult(movie))}
          onEditRating={isOwnProfile ? setEditingRating : undefined}
          ratings={ratings}
        />

        <MovieShelf
          title="Watchlist"
          subtitle="Saved for a future movie night."
          movies={watchlist}
          emptyText={isOwnProfile ? 'Your watchlist is empty. Open any film and choose Add to watchlist.' : 'Nothing on the watchlist yet.'}
          onMovieClick={(movie) => setSelectedMovie(toSearchResult(movie))}
          ratings={ratings}
          onRemoveMovie={isOwnProfile ? removeFromWatchlist : undefined}
        />

        <section className="mt-14" aria-labelledby="tiers-title">
          <h2 id="tiers-title" className={sectionTitle}>Tier list</h2>
          <p className="mt-1 text-sm text-ink-muted">
            {isOwnProfile ? 'Every rating, sorted. Select a poster to change its rating, and it moves to the matching tier.' : `${name}'s ratings, sorted from S to F.`}
          </p>
          <div className="mt-6 overflow-hidden rounded-2xl border border-line">
            {([
              ['S', 9, 10.1, 'bg-brand text-on-brand'],
              ['A', 8, 9, 'bg-brand/70 text-on-brand'],
              ['B', 7, 8, 'bg-brand/40 text-ink'],
              ['C', 6, 7, 'bg-brand/20 text-ink'],
              ['D', 4, 6, 'bg-raised text-ink'],
              ['F', 0, 4, 'bg-raised text-ink-muted'],
            ] as const).map(([tier, minimum, maximum, tone]) => {
              const tierRatings = ratings.filter((rating) => {
                const score = Number(rating.rating)
                return score >= minimum && score < maximum
              })
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
                            onClick={() => (isOwnProfile ? setEditingRating(rating) : setSelectedMovie(toSearchResult(rating.movie)))}
                            aria-label={`${rating.movie.title}, rated ${Number(rating.rating).toFixed(1)}${isOwnProfile ? '. Change rating' : ''}`}
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
            })}
          </div>
        </section>
      </main>

      {editingProfile && (
        <Dialog onClose={() => setEditingProfile(false)} title="Edit profile">
          <form
            onSubmit={(event) => {
              event.preventDefault()
              void saveProfile()
            }}
          >
            <div className="flex items-center justify-between border-b border-line px-6 py-4">
              <p className="font-display text-2xl font-extrabold">Edit profile</p>
              <CloseButton onClick={() => setEditingProfile(false)} label="Cancel editing" />
            </div>
            <div className="space-y-4 p-6">
              {([
                ['display_name', 'Display name', 'Shown at the top of your profile'],
                ['username', 'Username', 'Letters, numbers and underscores. Changes your profile link.'],
                ['avatar_url', 'Profile photo link', 'Paste an image URL, or leave empty for your initial'],
              ] as const).map(([key, label, hint]) => (
                <label key={key} className="block text-sm font-semibold">
                  {label}
                  <input
                    value={profileForm[key]}
                    onChange={(event) => setProfileForm((form) => ({ ...form, [key]: event.target.value }))}
                    required={key === 'username'}
                    className={inputClass}
                  />
                  <span className="mt-1 block text-xs font-normal text-ink-muted">{hint}</span>
                </label>
              ))}
              <label className="block text-sm font-semibold">
                Bio
                <textarea
                  value={profileForm.bio}
                  onChange={(event) => setProfileForm((form) => ({ ...form, bio: event.target.value }))}
                  rows={3}
                  className={inputClass}
                />
              </label>
              <p role="alert" className={profileError ? 'rounded-xl bg-danger/10 px-3.5 py-2.5 text-sm text-danger' : 'sr-only'}>
                {profileError}
              </p>
            </div>
            <div className="flex justify-end gap-2 border-t border-line bg-canvas/40 px-6 py-4">
              <button
                type="button"
                onClick={() => setEditingProfile(false)}
                className="rounded-full px-4 py-2 text-sm font-semibold text-ink-muted hover:bg-raised hover:text-ink"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={profileSaving}
                className="rounded-full bg-brand px-6 py-2 text-sm font-bold text-on-brand hover:bg-brand-hover disabled:cursor-wait disabled:opacity-60"
              >
                {profileSaving ? 'Saving…' : 'Save profile'}
              </button>
            </div>
          </form>
        </Dialog>
      )}

      {selectedMovie && (
        <MovieDetail
          movie={selectedMovie}
          alreadyRated={ratings.some((rating) => rating.movie.tmdb_id === selectedMovie.tmdb_id)}
          onRate={() => {
            const rating = ratings.find((item) => item.movie.tmdb_id === selectedMovie.tmdb_id)
            if (rating) {
              setSelectedMovie(null)
              setEditingRating(rating)
            } else {
              setRatingTarget(selectedMovie)
              setSelectedMovie(null)
            }
          }}
          onClose={() => setSelectedMovie(null)}
        />
      )}

      {editingRating && (
        <RateMovie
          movie={toSearchResult(editingRating.movie)}
          existingRating={editingRating}
          onDone={() => {
            setEditingRating(null)
            void loadProfile(false)
          }}
          onCancel={() => setEditingRating(null)}
        />
      )}

      {ratingTarget && (
        <RateMovie
          movie={ratingTarget}
          onDone={() => {
            setRatingTarget(null)
            void loadProfile(false)
          }}
          onCancel={() => setRatingTarget(null)}
        />
      )}
    </div>
  )
}

/** Poster shelf: a scrolling rail that expands into a grid. Module-level so its state survives parent re-renders. */
function MovieShelf({
  title,
  subtitle,
  movies,
  emptyText,
  onMovieClick,
  onEditRating,
  ratings,
  onRemoveMovie,
}: {
  title: string
  subtitle: string
  movies: ProfileMovie[]
  emptyText: string
  onMovieClick: (movie: ProfileMovie) => void
  onEditRating?: (rating: ProfileRating) => void
  ratings: ProfileRating[]
  onRemoveMovie?: (movieId: string) => void
}) {
  const [expanded, setExpanded] = useState(false)
  const visibleMovies = expanded ? movies : movies.slice(0, 12)
  const headingId = `shelf-${title.toLowerCase().replace(/\s+/g, '-')}`

  return (
    <section className="mt-14" aria-labelledby={headingId}>
      <div className="mb-5 flex items-end justify-between gap-4">
        <div>
          <h2 id={headingId} className="font-display text-3xl font-extrabold">
            {title} {movies.length > 0 && <span className="text-ink-muted tabular">{movies.length}</span>}
          </h2>
          <p className="mt-1 text-sm text-ink-muted">{subtitle}</p>
        </div>
        {movies.length > 12 && (
          <button
            type="button"
            onClick={() => setExpanded((value) => !value)}
            aria-expanded={expanded}
            className="shrink-0 rounded-full border border-line px-4 py-2 text-sm font-semibold text-ink-muted transition-colors hover:border-ink-muted hover:text-ink"
          >
            {expanded ? 'Show fewer' : `Show all ${movies.length}`}
          </button>
        )}
      </div>

      {movies.length > 0 ? (
        <ul className={expanded ? 'grid grid-cols-3 gap-4 sm:grid-cols-4 lg:grid-cols-6' : 'rail -mx-4 flex gap-4 overflow-x-auto px-4 pb-2 sm:-mx-6 sm:px-6'}>
          {visibleMovies.map((movie) => {
            const rating = onEditRating ? ratings.find((item) => item.movie.id === movie.id) : undefined
            return (
              <li key={movie.id} className={expanded ? 'min-w-0' : 'w-[128px] shrink-0 sm:w-[144px]'}>
                <button type="button" onClick={() => onMovieClick(movie)} className="group block w-full rounded-xl text-left">
                  <span className="relative block aspect-[2/3] overflow-hidden rounded-xl bg-raised shadow-poster transition-transform duration-200 group-hover:-translate-y-1">
                    {movie.poster_path ? (
                      <img src={`https://image.tmdb.org/t/p/w300${movie.poster_path}`} alt="" loading="lazy" className="h-full w-full object-cover" />
                    ) : (
                      <span className="flex h-full items-center justify-center p-3 text-center font-display text-lg font-bold text-ink-muted">{movie.title}</span>
                    )}
                    {movie.rating !== undefined && <span className="ticket absolute left-2 top-2 text-base">{movie.rating.toFixed(1)}</span>}
                  </span>
                  <span className="mt-2.5 block truncate text-sm font-semibold">{movie.title}</span>
                  <span className="block text-xs text-ink-muted">{movie.release_year ?? 'Year unknown'}</span>
                </button>
                {onRemoveMovie && (
                  <button
                    type="button"
                    onClick={() => onRemoveMovie(movie.id)}
                    aria-label={`Remove ${movie.title} from watchlist`}
                    className="mt-1 text-xs font-medium text-ink-muted hover:text-danger"
                  >
                    Remove
                  </button>
                )}
                {rating && onEditRating && (
                  <button
                    type="button"
                    onClick={() => onEditRating(rating)}
                    aria-label={`Change your rating of ${movie.title}`}
                    className="mt-1 text-xs font-medium text-ink-muted hover:text-brand"
                  >
                    Change rating
                  </button>
                )}
              </li>
            )
          })}
        </ul>
      ) : (
        <div className="rounded-2xl border border-dashed border-line px-6 py-8 text-sm text-ink-muted">{emptyText}</div>
      )}
    </section>
  )
}
