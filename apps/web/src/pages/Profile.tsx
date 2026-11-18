import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import Top5Picker, { type Top5Movie } from '../components/Top5Picker'
import Avatar from '../components/Avatar'
import AvatarPicker from '../components/AvatarPicker'
import MovieShelf, { type ProfileMovie, type ProfileRating } from '../components/MovieShelf'
import { useMe } from '../lib/MeContext'
import { useToast } from '../lib/Toast'
import { usePageTitle } from '../lib/usePageTitle'
import MovieDetail from '../components/MovieDetail'
import TierList from '../components/TierList'
import BadgeIcons, { type Badge } from '../components/BadgeIcons'
import LockIcon from '../components/LockIcon'
import FollowListDialog from '../components/FollowListDialog'
import RatingHistogram from '../components/RatingHistogram'
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
  is_private: boolean
}

interface WatchStats {
  movie_hours: number
  series_hours: number
  movie_count: number
  series_count: number
  episode_count: number
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
  badges: Badge[]
  episodesThisMonth: number
  followsYou: boolean
  /** Own profile only: followers you haven't followed back. */
  toFollowBack?: number
  /** Private profile the viewer can't see: only name, photo, bio and counts come back. */
  locked: boolean
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
  const [profileForm, setProfileForm] = useState({ display_name: '', username: '', bio: '', is_private: false })
  const [locked, setLocked] = useState(false)
  const [followsYou, setFollowsYou] = useState(false)
  const [toFollowBack, setToFollowBack] = useState(0)
  const [followList, setFollowList] = useState<'followers' | 'following' | null>(null)
  const [stats, setStats] = useState<WatchStats | null>(null)
  const [favoriteGenre, setFavoriteGenre] = useState<string | null>(null)
  const [followers, setFollowers] = useState(0)
  const [following, setFollowing] = useState(0)
  const [isFollowing, setIsFollowing] = useState(false)
  const [badges, setBadges] = useState<Badge[]>([])
  const [episodesThisMonth, setEpisodesThisMonth] = useState(0)
  const [followLoading, setFollowLoading] = useState(false)
  const [loading, setLoading] = useState(true)
  const [profileSaving, setProfileSaving] = useState(false)
  const [profileError, setProfileError] = useState<string | null>(null)
  const navigate = useNavigate()
  const { setMe } = useMe()
  const toast = useToast()

  const isOwnProfile = !!user && profile?.id === user.id
  usePageTitle(profile ? profile.display_name || profile.username : username ?? 'Profile')

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
      is_private: profileData.is_private ?? false,
    })
    setLocked(data.locked ?? false)
    setFollowsYou(data.followsYou ?? false)
    setToFollowBack(data.toFollowBack ?? 0)

    setTop5(data.top5)
    setRatings(data.ratings)
    // Watched is what they've rated; unrated Top 5 picks live only in the Top 5 row.
    setRecentMovies(data.ratings.map((row) => ({ ...row.movie, rating: Number(row.rating), is_private: row.is_private })))
    setWatchlist(data.watchlist)
    setStats(data.stats)
    setFavoriteGenre(data.favoriteGenre)
    setFollowers(data.followers)
    setFollowing(data.following)
    setIsFollowing(data.isFollowing)
    setBadges(data.badges ?? [])
    setEpisodesThisMonth(data.episodesThisMonth ?? 0)

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
          is_private: profileForm.is_private,
        },
      })
      setProfile(saved)
      setMe(saved)
      setEditingProfile(false)
      toast('Profile saved')
      if (saved.username !== username) navigate(`/profile/${saved.username}`, { replace: true })
    } catch (error) {
      setProfileError(errorMessage(error, "Your profile didn't save. Try again."))
    } finally {
      setProfileSaving(false)
    }
  }

  if (loading) {
    return (
      <div>
        <div className="mx-auto max-w-5xl px-4 py-10 sm:px-6" aria-busy="true" aria-label="Loading profile">
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
        </div>
      </div>
    )
  }

  if (!profile) {
    return (
      <div>
        <div className="mx-auto flex min-h-[60vh] max-w-md flex-col items-center justify-center gap-3 px-6 text-center">
          <h1 className="font-display text-4xl font-extrabold">Profile not found</h1>
          <p className="text-ink-muted">There's no one called @{username}. Check the spelling, or find them through a rating on the home page.</p>
          <Link to="/" className="mt-3 rounded-full bg-brand px-5 py-2.5 text-sm font-bold text-on-brand hover:bg-brand-hover">
            Go to home
          </Link>
        </div>
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
    <div>
      <div className="mx-auto max-w-5xl px-4 pb-16 sm:px-6">
        <section className="relative z-10 -mx-4 px-4 pb-8 pt-12 sm:-mx-6 sm:px-6">
          {/* Backdrop clips itself, so popovers in the header (badge details) can overflow freely */}
          <div aria-hidden="true" className="absolute inset-0 overflow-hidden">
            {top5[0]?.poster_path && (
              <div
                className="absolute inset-0 bg-cover opacity-40 blur-sm"
                style={{ backgroundImage: `url(https://image.tmdb.org/t/p/w780${top5[0].poster_path})`, backgroundPosition: 'center 22%' }}
              />
            )}
            <div
              className="absolute inset-0"
              style={{ background: 'linear-gradient(0deg, rgb(var(--canvas)) 0%, rgb(var(--canvas) / 0.75) 55%, rgb(var(--canvas) / 0.45) 100%)' }}
            />
          </div>

          <div className="relative flex flex-col gap-6 sm:flex-row sm:items-end">
            {isOwnProfile ? (
              <button
                type="button"
                onClick={() => setEditingProfile(true)}
                aria-label="Change profile photo"
                className="group relative h-28 w-28 shrink-0 rounded-full"
              >
                <Avatar url={profile.avatar_url} name={name} className="h-28 w-28 text-5xl ring-4 ring-canvas" />
                <span className="absolute inset-0 flex items-center justify-center rounded-full bg-[rgb(var(--shadow)/0.55)] text-xs font-bold text-white opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100">
                  Change photo
                </span>
              </button>
            ) : (
              <Avatar url={profile.avatar_url} name={name} className="h-28 w-28 text-5xl ring-4 ring-canvas" />
            )}

            <div className="min-w-0 flex-1">
              <h1 className="font-display text-[clamp(2.75rem,7vw,4.5rem)] font-black uppercase leading-[0.85]">{name}</h1>
              <p className="mt-2 flex flex-wrap items-center gap-2 text-ink-muted">
                @{profile.username}
                {profile.is_private && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-raised px-2.5 py-0.5 text-xs font-semibold text-ink">
                    <LockIcon className="h-3 w-3" />
                    Private
                  </span>
                )}
                {!isOwnProfile && followsYou && <span className="rounded-full bg-raised px-2.5 py-0.5 text-xs font-semibold text-ink">Follows you</span>}
              </p>
              {profile.bio && <p className="mt-3 max-w-xl leading-relaxed">{profile.bio}</p>}
              <BadgeIcons badges={badges} isOwnProfile={isOwnProfile} />

              <div className="mt-5 flex flex-wrap items-center gap-x-5 gap-y-3 text-sm">
                <button
                  type="button"
                  onClick={() => !locked && setFollowList('followers')}
                  disabled={locked}
                  className="relative -mx-2 rounded-full px-2 py-1.5 transition-colors enabled:hover:bg-raised disabled:cursor-default"
                >
                  <span className="font-bold tabular">{followers}</span> <span className="text-ink-muted">{followers === 1 ? 'follower' : 'followers'}</span>
                  {toFollowBack > 0 && (
                    <span className="ml-1.5 rounded-full bg-brand px-2 py-0.5 text-[11px] font-bold text-on-brand tabular">
                      {toFollowBack} to follow back
                    </span>
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => !locked && setFollowList('following')}
                  disabled={locked}
                  className="-mx-2 rounded-full px-2 py-1.5 transition-colors enabled:hover:bg-raised disabled:cursor-default"
                >
                  <span className="font-bold tabular">{following}</span> <span className="text-ink-muted">following</span>
                </button>

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

        {locked ? (
          <section className="mt-6 rounded-2xl border border-dashed border-line px-6 py-12 text-center" aria-labelledby="locked-title">
            <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-raised text-ink-muted">
              <LockIcon className="h-5 w-5" />
            </span>
            <h2 id="locked-title" className="mt-4 font-display text-2xl font-extrabold">This profile is private</h2>
            <p className="mx-auto mt-1 max-w-sm text-sm text-ink-muted">
              {name} shares ratings, lists and their Top 5 with people they follow.
              {isFollowing ? ' You’re following them; once they follow you back, it all opens up.' : ' Follow them, and once they follow you back you’ll see everything.'}
            </p>
          </section>
        ) : (
        <>
        <section className="mt-4" aria-labelledby="stats-title">
          <h2 id="stats-title" className="sr-only">Watch stats</h2>
          <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-2xl border border-line bg-line sm:grid-cols-3">
            {[
              { label: 'Hours watched', value: `${totalHours.toFixed(0)}h` },
              { label: 'Film hours', value: `${(stats?.movie_hours ?? 0).toFixed(0)}h` },
              { label: 'Series hours', value: `${(stats?.series_hours ?? 0).toFixed(0)}h` },
              { label: 'Titles logged', value: totalLogged },
              { label: 'Films / series', value: `${stats?.movie_count ?? 0} / ${stats?.series_count ?? 0}` },
              { label: 'Episodes watched', value: stats?.episode_count ?? 0 },
              { label: 'Episodes this month', value: episodesThisMonth },
              { label: 'Average rating', value: ratings.length ? (ratings.reduce((sum, r) => sum + Number(r.rating), 0) / ratings.length).toFixed(1) : '–' },
              { label: 'Top genre', value: favoriteGenre ?? '–' },
            ].map((stat) => (
              <div key={stat.label} className="bg-surface px-5 py-4">
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
          <Top5Picker
            items={top5}
            editable={isOwnProfile}
            onSaved={() => void loadProfile(false)}
            library={
              isOwnProfile
                ? ratings.map((r) => ({
                    movie_id: r.movie.id,
                    tmdb_id: r.movie.tmdb_id,
                    title: r.movie.title,
                    poster_path: r.movie.poster_path,
                    release_year: r.movie.release_year,
                    media_type: r.movie.media_type,
                    rating: Number(r.rating),
                  }))
                : []
            }
          />
        </section>

        <div className="mt-14">
          <MovieShelf
            title={isOwnProfile ? 'Recently watched' : 'Watched'}
            subtitle={isOwnProfile ? 'Your latest logs. Filters, diary and watchlist live in your library.' : `Everything ${name} has logged, newest first.`}
            movies={recentMovies}
            emptyState={
              <div className="rounded-2xl border border-dashed border-line px-6 py-8 text-sm text-ink-muted">
                {isOwnProfile ? 'Nothing logged yet. Use Log a film to add your first.' : `${name} hasn’t logged anything yet.`}
              </div>
            }
            onMovieClick={(movie) => setSelectedMovie(toSearchResult(movie))}
            onEditRating={isOwnProfile ? setEditingRating : undefined}
            ratings={ratings}
            filterable={!isOwnProfile}
          />
          {isOwnProfile && recentMovies.length > 0 && (
            <Link to="/library" className="mt-4 inline-block text-sm font-semibold text-brand underline-offset-4 hover:underline">
              Open your library
            </Link>
          )}
        </div>

        {!isOwnProfile && watchlist.length > 0 && (
          <div className="mt-14">
            <MovieShelf
              title="Watchlist"
              subtitle={`What ${name} wants to watch next.`}
              movies={watchlist}
              emptyState={null}
              onMovieClick={(movie) => setSelectedMovie(toSearchResult(movie))}
              ratings={ratings}
            />
          </div>
        )}

        <RatingHistogram scores={ratings.map((rating) => Number(rating.rating))} name={isOwnProfile ? 'You' : name} />

        <section className="mt-14" aria-labelledby="tiers-title">
          <h2 id="tiers-title" className={sectionTitle}>Tier lists</h2>
          <p className="mt-1 text-sm text-ink-muted">
            {isOwnProfile ? 'Films and series ranked separately. Arrange them however you like.' : `${name}'s films and series, ranked from S to F.`}
          </p>
          <TierList
            ratings={ratings}
            onSelect={(rating) => (isOwnProfile ? setEditingRating(rating) : setSelectedMovie(toSearchResult(rating.movie)))}
            selectLabel={isOwnProfile ? '. Change rating' : undefined}
            editable={isOwnProfile}
            onChanged={() => void loadProfile(false)}
            emptyText={(kind) => {
              const noun = kind === 'tv' ? 'series' : 'films'
              return isOwnProfile ? `No ${noun} rated yet. Rate one and it lands in its tier here.` : `${name} hasn’t rated any ${noun} yet.`
            }}
          />
        </section>
        </>
        )}
      </div>

      {followList && (
        <FollowListDialog
          username={profile.username}
          name={name}
          initial={followList}
          counts={{ followers, following }}
          isOwnProfile={isOwnProfile}
          myId={user?.id}
          onClose={() => setFollowList(null)}
          onFollowChange={() => void loadProfile(false)}
        />
      )}

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
              <AvatarPicker
                url={profile.avatar_url}
                name={name}
                onSaved={(saved, message) => {
                  setProfile(saved)
                  setMe(saved)
                  toast(message)
                }}
              />
              {([
                ['display_name', 'Display name', 'Shown at the top of your profile'],
                ['username', 'Username', 'Letters, numbers and underscores. Changes your profile link.'],
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
              <fieldset>
                <legend className="text-sm font-semibold">Profile visibility</legend>
                <div className="mt-1.5 inline-flex gap-1 rounded-full bg-raised p-1">
                  {([
                    [false, 'Public'],
                    [true, 'Private'],
                  ] as const).map(([value, label]) => (
                    <button
                      key={label}
                      type="button"
                      aria-pressed={profileForm.is_private === value}
                      onClick={() => setProfileForm((form) => ({ ...form, is_private: value }))}
                      className={`flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-sm font-medium transition-colors ${
                        profileForm.is_private === value ? 'bg-surface text-ink shadow-sm' : 'text-ink-muted hover:text-ink'
                      }`}
                    >
                      {value && <LockIcon className="h-3.5 w-3.5" />}
                      {label}
                    </button>
                  ))}
                </div>
                <span className="mt-1 block text-xs text-ink-muted">
                  {profileForm.is_private
                    ? 'Only people you follow see your ratings, lists and Top 5. Everyone can still find you and follow you.'
                    : 'Anyone in the group can see your ratings, lists and Top 5.'}
                </span>
              </fieldset>
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
          onRate={(existing) => {
            const rating = existing ? ratings.find((item) => item.id === existing.id) : undefined
            if (rating) setEditingRating(rating)
            else setRatingTarget(selectedMovie)
            setSelectedMovie(null)
          }}
          onClose={() => {
            setSelectedMovie(null)
            // Episodes ticked in the dialog change hours and badges.
            if (selectedMovie.media_type === 'tv' && isOwnProfile) void loadProfile(false)
          }}
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
