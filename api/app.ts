import { db, pgErrorCode } from './_lib/db.js'
import { getSessionUser, type SessionUser } from './_lib/auth.js'
import { computeBadges } from './_lib/badges.js'
import { parseAvatarDataUrl } from './_lib/avatar.js'

/*
 * Data API for the web app. Every /api/app/* path is rewritten here (vercel.json)
 * so all database routes share one serverless function.
 *
 * Supabase enforced access with row-level security; here every handler gets the
 * signed-in user from the Auth.js session and scopes writes to `user.id`:
 *   - anyone signed in may read profiles, movies, ratings, follows, Top 5s,
 *     watchlists, reactions and comments (same as the old SELECT policies)
 *   - only the owner may change their ratings, Top 5, watchlist, reactions,
 *     follows, profile and recommendation feedback
 *   - a comment may be deleted by its author or by the owner of the rating
 */

class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
    public code?: string,
  ) {
    super(message)
  }
}

interface Ctx {
  user: SessionUser
  url: URL
  params: string[]
  body: Record<string, unknown>
}

type Handler = (ctx: Ctx) => Promise<unknown>

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function uuid(value: unknown, field: string): string {
  if (typeof value !== 'string' || !UUID.test(value)) throw new HttpError(400, `${field} must be an id`)
  return value
}

function int(value: unknown, field: string): number {
  const n = typeof value === 'string' ? Number(value) : value
  if (typeof n !== 'number' || !Number.isInteger(n)) throw new HttpError(400, `${field} must be a whole number`)
  return n
}

function optInt(value: unknown, field: string): number | null {
  return value === null || value === undefined || value === '' ? null : int(value, field)
}

function optText(value: unknown, field: string, max: number): string | null {
  if (value === null || value === undefined) return null
  if (typeof value !== 'string') throw new HttpError(400, `${field} must be text`)
  const trimmed = value.trim()
  if (trimmed.length > max) throw new HttpError(400, `${field} must be ${max} characters or fewer`)
  return trimmed || null
}

function optDate(value: unknown, field: string): string | null {
  if (value === null || value === undefined || value === '') return null
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new HttpError(400, `${field} must be a YYYY-MM-DD date`)
  return value
}

const movieJson = `json_build_object(
  'id', m.id, 'tmdb_id', m.tmdb_id, 'title', m.title, 'poster_path', m.poster_path,
  'release_year', COALESCE(m.release_year, m.year), 'media_type', COALESCE(m.media_type, 'movie'))`

/* ---------------------------------------------------------------- reads */

const me: Handler = async ({ user }) => {
  const rows = await db()`SELECT id, username, display_name, avatar_url, bio FROM profiles WHERE id = ${user.id}`
  if (!rows[0]) throw new HttpError(404, 'Profile not found')
  return { profile: rows[0], email: user.email }
}

async function socialFor(ratingIds: string[]) {
  if (ratingIds.length === 0) return { reactions: [], comments: [] }
  const sql = db()
  const [reactions, comments] = await sql.transaction(
    [
      sql`SELECT rating_id, user_id, reaction FROM reactions WHERE rating_id = ANY(${ratingIds}::uuid[])`,
      sql.query(
        `SELECT c.id, c.rating_id, c.user_id, c.content, json_build_object('username', p.username) AS profile
         FROM comments c JOIN profiles p ON p.id = c.user_id
         WHERE c.rating_id = ANY($1::uuid[])
         ORDER BY c.created_at`,
        [ratingIds],
      ),
    ],
    { readOnly: true },
  )
  return { reactions, comments }
}

const home: Handler = async ({ user }) => {
  const sql = db()
  const scored = `SELECT m.id, m.tmdb_id, m.title, COALESCE(m.release_year, m.year) AS release_year, m.poster_path,
      COALESCE(m.media_type, 'movie') AS media_type,
      ROUND(AVG(r.rating), 1)::float8 AS avg_score, COUNT(r.id)::int AS rating_count
    FROM movies m JOIN ratings r ON r.movie_id = m.id
    GROUP BY m.id
    ORDER BY AVG(r.rating) DESC, COUNT(r.id) DESC, m.title`
  const [featuredRow, recentRatings, recentMovies, myRated] = await sql.transaction(
    [
      sql.query(`${scored} LIMIT 8`),
      sql.query(
        `SELECT r.id, r.movie_id, r.user_id, r.rating::float8 AS rating, r.description, r.created_at,
           ${movieJson} AS movie,
           json_build_object('username', p.username, 'avatar_url', p.avatar_url) AS profile
         FROM ratings r
         JOIN movies m ON m.id = r.movie_id
         JOIN profiles p ON p.id = r.user_id
         ORDER BY r.created_at DESC
         LIMIT 20`,
      ),
      sql`SELECT tmdb_id FROM movies ORDER BY created_at DESC LIMIT 12`,
      sql`SELECT m.tmdb_id FROM ratings r JOIN movies m ON m.id = r.movie_id WHERE r.user_id = ${user.id}`,
    ],
    { readOnly: true },
  )
  const social = await socialFor(recentRatings.map((row) => row.id as string))
  return {
    featured: featuredRow[0] ?? null,
    featuredRow,
    recentRatings,
    recentMovieTmdbIds: recentMovies.map((row) => row.tmdb_id),
    myRatedTmdbIds: myRated.map((row) => row.tmdb_id),
    ...social,
  }
}

const social: Handler = async ({ url }) => {
  const ids = (url.searchParams.get('rating_ids') || '').split(',').filter(Boolean)
  if (ids.length > 100) throw new HttpError(400, 'Too many ratings requested')
  return socialFor(ids.map((id) => uuid(id, 'rating_ids')))
}

const recommendationSeeds: Handler = async ({ user }) => {
  const sql = db()
  const [topRated, top5, dismissed] = await sql.transaction(
    [
      sql`SELECT m.tmdb_id, COALESCE(m.media_type, 'movie') AS media_type
          FROM ratings r JOIN movies m ON m.id = r.movie_id
          WHERE r.user_id = ${user.id} ORDER BY r.rating DESC, r.created_at DESC LIMIT 5`,
      sql`SELECT m.tmdb_id, COALESCE(m.media_type, 'movie') AS media_type
          FROM top5_items t JOIN movies m ON m.id = t.movie_id
          WHERE t.user_id = ${user.id} ORDER BY t.rank LIMIT 5`,
      sql`SELECT tmdb_id FROM recommendation_feedback WHERE user_id = ${user.id}`,
    ],
    { readOnly: true },
  )
  return { seeds: [...topRated, ...top5], dismissed: dismissed.map((row) => row.tmdb_id) }
}

/** Everything computeBadges needs for one profile ($1), in one round trip. "A day" is a UTC day. */
const badgeStatsSql = `
  WITH totals AS (SELECT user_id, movie_hours + series_hours AS hours FROM user_watch_stats)
  SELECT
    COALESCE((SELECT hours FROM totals WHERE user_id = $1), 0)::float8 AS total_hours,
    COALESCE((SELECT MAX(hours) FROM totals), 0)::float8 AS top_hours,
    COALESCE((SELECT MAX(n) FROM (
      SELECT COUNT(*) AS n FROM watched_episodes WHERE user_id = $1
      GROUP BY movie_id, (watched_at AT TIME ZONE 'UTC')::date) d), 0)::int AS max_episodes_in_day,
    (SELECT COUNT(*) FROM (
      SELECT e.movie_id FROM watched_episodes e JOIN movies m ON m.id = e.movie_id
      WHERE e.user_id = $1 AND e.season_number > 0
      GROUP BY e.movie_id, m.number_of_episodes
      HAVING m.number_of_episodes > 0 AND COUNT(*) >= m.number_of_episodes) c)::int AS completed_series,
    (SELECT COUNT(*) FROM ratings WHERE user_id = $1)::int AS rating_count,
    (SELECT AVG(rating) FROM ratings WHERE user_id = $1)::float8 AS avg_rating,
    (SELECT COUNT(DISTINCT g.name) FROM ratings r JOIN movies m ON m.id = r.movie_id
       CROSS JOIN LATERAL unnest(m.genres) AS g(name) WHERE r.user_id = $1)::int AS genre_count,
    (SELECT COUNT(DISTINCT COALESCE(m.release_year, m.year) / 10) FROM ratings r JOIN movies m ON m.id = r.movie_id
       WHERE r.user_id = $1 AND COALESCE(m.media_type, 'movie') = 'movie'
         AND COALESCE(m.release_year, m.year) IS NOT NULL)::int AS decade_count,
    (SELECT COUNT(*) FROM ratings WHERE user_id = $1 AND description IS NOT NULL
       AND description NOT LIKE 'Imported from %')::int AS notes_count,
    (SELECT COUNT(*) FROM watched_episodes WHERE user_id = $1
       AND watched_at >= date_trunc('month', NOW()))::int AS episodes_this_month`

const profileByUsername: Handler = async ({ user, params }) => {
  const username = decodeURIComponent(params[0] || '')
  const sql = db()
  const found = await sql`SELECT id, username, display_name, avatar_url, bio FROM profiles WHERE username = ${username}`
  const profile = found[0]
  if (!profile) throw new HttpError(404, 'Profile not found')
  const id = profile.id as string

  const [top5, ratings, watchlist, stats, genre, followers, following, followCheck, badgeRow] = await sql.transaction(
    [
      sql`SELECT t.rank, t.movie_id, m.tmdb_id, COALESCE(m.media_type, 'movie') AS media_type, m.title, m.poster_path,
            COALESCE(m.release_year, m.year) AS release_year
          FROM top5_items t JOIN movies m ON m.id = t.movie_id
          WHERE t.user_id = ${id} ORDER BY t.rank`,
      sql.query(
        `SELECT r.id, r.rating::float8 AS rating, r.description, to_char(r.watched_date, 'YYYY-MM-DD') AS watched_date,
           COALESCE(r.date_type, 'unknown') AS date_type, ${movieJson} AS movie
         FROM ratings r JOIN movies m ON m.id = r.movie_id
         WHERE r.user_id = $1 ORDER BY r.created_at DESC`,
        [id],
      ),
      sql.query(
        `SELECT ${movieJson} AS movie FROM watchlist w JOIN movies m ON m.id = w.movie_id
         WHERE w.user_id = $1 ORDER BY w.created_at DESC`,
        [id],
      ),
      sql`SELECT movie_hours::float8, series_hours::float8, movie_count, series_count, episode_count FROM user_watch_stats WHERE user_id = ${id}`,
      sql`SELECT get_favorite_genre(${id}::uuid) AS genre`,
      sql`SELECT COUNT(*)::int AS n FROM follows WHERE following_id = ${id}`,
      sql`SELECT COUNT(*)::int AS n FROM follows WHERE follower_id = ${id}`,
      sql`SELECT 1 FROM follows WHERE follower_id = ${user.id} AND following_id = ${id}`,
      sql.query(badgeStatsSql, [id]),
    ],
    { readOnly: true },
  )

  const b = badgeRow[0]
  const badges = computeBadges({
    totalHours: b.total_hours,
    topHours: b.top_hours,
    maxEpisodesInDay: b.max_episodes_in_day,
    completedSeries: b.completed_series,
    ratingCount: b.rating_count,
    avgRating: b.avg_rating,
    genreCount: b.genre_count,
    decadeCount: b.decade_count,
    notesCount: b.notes_count,
    followers: followers[0].n,
  })

  return {
    badges,
    episodesThisMonth: b.episodes_this_month,
    profile,
    top5,
    ratings,
    watchlist: watchlist.map((row) => row.movie),
    stats: stats[0] ?? { movie_hours: 0, series_hours: 0, movie_count: 0, series_count: 0, episode_count: 0 },
    favoriteGenre: genre[0]?.genre ?? null,
    followers: followers[0].n,
    following: following[0].n,
    isFollowing: followCheck.length > 0,
  }
}

/** Where a TMDB title stands for the signed-in user: their rating (if any) and watchlist state. */
const titleStatus: Handler = async ({ user, params, url }) => {
  const tmdbId = int(params[0], 'tmdb id')
  const mediaType = url.searchParams.get('media_type') === 'tv' ? 'tv' : 'movie'
  const rows = await db()`
    SELECT m.id AS movie_id,
      (SELECT json_build_object('id', r.id, 'rating', r.rating::float8, 'description', r.description,
                'watched_date', to_char(r.watched_date, 'YYYY-MM-DD'), 'date_type', COALESCE(r.date_type, 'unknown'))
         FROM ratings r WHERE r.movie_id = m.id AND r.user_id = ${user.id}) AS rating,
      EXISTS (SELECT 1 FROM watchlist w WHERE w.movie_id = m.id AND w.user_id = ${user.id}) AS on_watchlist
    FROM movies m
    WHERE m.tmdb_id = ${tmdbId} AND COALESCE(m.media_type, 'movie') = ${mediaType}`
  const row = rows[0]
  return { movieId: row?.movie_id ?? null, rating: row?.rating ?? null, onWatchlist: row?.on_watchlist ?? false }
}

/** Episodes you've ticked off for one series. */
const watchedEpisodes: Handler = async ({ user, params }) => {
  const rows = await db()`
    SELECT season_number AS season, episode_number AS episode FROM watched_episodes
    WHERE user_id = ${user.id} AND movie_id = ${uuid(params[0], 'series id')}
    ORDER BY season_number, episode_number`
  return { episodes: rows }
}

/** Series you're partway through, most recently watched first. Specials (season 0) don't count. */
const continueWatching: Handler = async ({ user }) => {
  const rows = await db().query(
    `SELECT ${movieJson} AS movie, m.number_of_episodes,
       COUNT(*)::int AS watched_count,
       MAX(e.watched_at) AS last_watched_at
     FROM watched_episodes e JOIN movies m ON m.id = e.movie_id
     WHERE e.user_id = $1 AND e.season_number > 0
     GROUP BY m.id
     HAVING m.number_of_episodes IS NULL OR COUNT(*) < m.number_of_episodes
     ORDER BY MAX(e.watched_at) DESC
     LIMIT 12`,
    [user.id],
  )
  return { series: rows }
}

/* --------------------------------------------------------------- writes */

/** Marks episodes watched or unwatched in bulk (one episode, or a whole season). */
const setEpisodes: Handler = async ({ user, body }) => {
  const movieId = uuid(body.movie_id, 'movie_id')
  const list = Array.isArray(body.episodes) ? body.episodes : null
  if (!list || list.length === 0 || list.length > 200) throw new HttpError(400, 'episodes must be a list of 1 to 200 episodes')
  const seasons: number[] = []
  const numbers: number[] = []
  const runtimes: Array<number | null> = []
  for (const item of list as Array<Record<string, unknown>>) {
    const season = int(item?.season, 'season')
    const episode = int(item?.episode, 'episode')
    const runtime = optInt(item?.runtime, 'runtime')
    if (season < 0 || season > 500 || episode < 1 || episode > 5000) throw new HttpError(400, 'Season or episode number is out of range')
    seasons.push(season)
    numbers.push(episode)
    runtimes.push(runtime !== null && runtime >= 1 && runtime <= 600 ? runtime : null)
  }

  const sql = db()
  const series = await sql`SELECT 1 FROM movies WHERE id = ${movieId} AND media_type = 'tv'`
  if (!series.length) throw new HttpError(400, 'Episodes can only be logged for a series')

  if (body.watched === false) {
    await sql`
      DELETE FROM watched_episodes e
      USING unnest(${seasons}::smallint[], ${numbers}::smallint[]) AS x(season, episode)
      WHERE e.user_id = ${user.id} AND e.movie_id = ${movieId}
        AND e.season_number = x.season AND e.episode_number = x.episode`
    return { watched: false }
  }
  await sql`
    INSERT INTO watched_episodes (user_id, movie_id, season_number, episode_number, runtime_minutes)
    SELECT ${user.id}::uuid, ${movieId}::uuid, x.season, x.episode, x.runtime
    FROM unnest(${seasons}::smallint[], ${numbers}::smallint[], ${runtimes}::int[]) AS x(season, episode, runtime)
    ON CONFLICT DO NOTHING`
  return { watched: true }
}

/** Inserts a TMDB title if it's new; fills in missing metadata if it isn't. Returns its id. */
const ensureMovie: Handler = async ({ body }) => {
  const tmdbId = int(body.tmdb_id, 'tmdb_id')
  const title = optText(body.title, 'title', 255)
  if (!title) throw new HttpError(400, 'title is required')
  const mediaType = body.media_type === 'tv' ? 'tv' : 'movie'
  const genres = Array.isArray(body.genres) ? body.genres.filter((g): g is string => typeof g === 'string').slice(0, 20) : null

  const rows = await db()`
    INSERT INTO movies (tmdb_id, title, poster_path, release_year, media_type, runtime_minutes,
                        episode_run_time, number_of_episodes, release_date, genres)
    VALUES (${tmdbId}, ${title}, ${optText(body.poster_path, 'poster_path', 500)}, ${optInt(body.release_year, 'release_year')},
            ${mediaType}, ${optInt(body.runtime_minutes, 'runtime_minutes')}, ${optInt(body.episode_run_time, 'episode_run_time')},
            ${optInt(body.number_of_episodes, 'number_of_episodes')}, ${optDate(body.release_date, 'release_date')}, ${genres})
    ON CONFLICT (tmdb_id) DO UPDATE SET
      poster_path = COALESCE(movies.poster_path, EXCLUDED.poster_path),
      release_year = COALESCE(movies.release_year, EXCLUDED.release_year),
      runtime_minutes = COALESCE(movies.runtime_minutes, EXCLUDED.runtime_minutes),
      episode_run_time = COALESCE(movies.episode_run_time, EXCLUDED.episode_run_time),
      number_of_episodes = COALESCE(movies.number_of_episodes, EXCLUDED.number_of_episodes),
      release_date = COALESCE(movies.release_date, EXCLUDED.release_date),
      genres = COALESCE(movies.genres, EXCLUDED.genres),
      updated_at = NOW()
    RETURNING id`
  return { id: rows[0].id }
}

const saveRating: Handler = async ({ user, body }) => {
  const rating = Number(body.rating)
  if (!(rating >= 0.5 && rating <= 10 && rating * 2 === Math.floor(rating * 2))) {
    throw new HttpError(400, 'rating must be between 0.5 and 10 in half steps')
  }
  const description = optText(body.description, 'description', 2000)
  const watchedDate = optDate(body.watched_date, 'watched_date')
  const dateType = ['exact', 'release', 'unknown'].includes(String(body.date_type)) ? String(body.date_type) : 'unknown'
  const sql = db()

  if (body.id) {
    const rows = await sql`
      UPDATE ratings SET rating = ${rating}, description = ${description}, watched_date = ${watchedDate},
        date_type = ${dateType}, updated_at = NOW()
      WHERE id = ${uuid(body.id, 'id')} AND user_id = ${user.id}
      RETURNING id`
    if (!rows[0]) throw new HttpError(404, 'That rating no longer exists')
    return { id: rows[0].id }
  }

  const movieId = uuid(body.movie_id, 'movie_id')
  const inserted = await sql`
    INSERT INTO ratings (user_id, movie_id, rating, description, watched_date, date_type)
    VALUES (${user.id}, ${movieId}, ${rating}, ${description}, ${watchedDate}, ${dateType})
    ON CONFLICT (user_id, movie_id) DO NOTHING
    RETURNING id`
  if (!inserted[0]) throw new HttpError(409, 'You already logged this title', 'already_rated')
  // Logging a title takes it off the watchlist: it's been watched now.
  await sql`DELETE FROM watchlist WHERE user_id = ${user.id} AND movie_id = ${movieId}`
  return { id: inserted[0].id }
}

/** Removes one of your own ratings. Its reactions and comments go with it (ON DELETE CASCADE). */
const deleteRating: Handler = async ({ user, params }) => {
  const rows = await db()`DELETE FROM ratings WHERE id = ${uuid(params[0], 'rating id')} AND user_id = ${user.id} RETURNING id`
  if (!rows[0]) throw new HttpError(404, "That rating is gone or isn't yours to remove")
  return { status: 'deleted' }
}

const addToWatchlist: Handler = async ({ user, body }) => {
  const movieId = uuid(body.movie_id, 'movie_id')
  const sql = db()
  const rated = await sql`SELECT 1 FROM ratings WHERE user_id = ${user.id} AND movie_id = ${movieId}`
  if (rated.length) throw new HttpError(409, 'You already logged this title', 'already_rated')
  await sql`INSERT INTO watchlist (user_id, movie_id) VALUES (${user.id}, ${movieId}) ON CONFLICT DO NOTHING`
  return { status: 'added' }
}

const removeFromWatchlist: Handler = async ({ user, params }) => {
  await db()`DELETE FROM watchlist WHERE user_id = ${user.id} AND movie_id = ${uuid(params[0], 'movie id')}`
  return { status: 'removed' }
}

const setReaction: Handler = async ({ user, body }) => {
  const ratingId = uuid(body.rating_id, 'rating_id')
  const sql = db()
  if (body.reaction === null) {
    await sql`DELETE FROM reactions WHERE rating_id = ${ratingId} AND user_id = ${user.id}`
    return { reaction: null }
  }
  if (body.reaction !== 'like' && body.reaction !== 'dislike') throw new HttpError(400, 'reaction must be like, dislike or null')
  await sql`
    INSERT INTO reactions (rating_id, user_id, reaction) VALUES (${ratingId}, ${user.id}, ${body.reaction})
    ON CONFLICT (rating_id, user_id) DO UPDATE SET reaction = EXCLUDED.reaction, created_at = NOW()`
  return { reaction: body.reaction }
}

const addComment: Handler = async ({ user, body }) => {
  const content = optText(body.content, 'content', 500)
  if (!content) throw new HttpError(400, 'Write something before posting')
  const rows = await db()`
    INSERT INTO comments (rating_id, user_id, content)
    VALUES (${uuid(body.rating_id, 'rating_id')}, ${user.id}, ${content})
    RETURNING id, rating_id, user_id, content`
  return { comment: rows[0] }
}

const deleteComment: Handler = async ({ user, params }) => {
  const rows = await db()`
    DELETE FROM comments c
    WHERE c.id = ${uuid(params[0], 'comment id')}
      AND (c.user_id = ${user.id}
           OR EXISTS (SELECT 1 FROM ratings r WHERE r.id = c.rating_id AND r.user_id = ${user.id}))
    RETURNING c.id`
  if (!rows[0]) throw new HttpError(404, "That comment is gone or isn't yours to delete")
  return { status: 'deleted' }
}

const dismissRecommendation: Handler = async ({ user, body }) => {
  await db()`
    INSERT INTO recommendation_feedback (user_id, tmdb_id) VALUES (${user.id}, ${int(body.tmdb_id, 'tmdb_id')})
    ON CONFLICT DO NOTHING`
  return { status: 'dismissed' }
}

const updateProfile: Handler = async ({ user, body }) => {
  const username = optText(body.username, 'username', 50)
  if (!username || !/^[A-Za-z0-9_]{3,50}$/.test(username)) {
    throw new HttpError(400, 'Username must be 3–50 letters, numbers or underscores')
  }
  // Photos are uploaded through PUT /avatar; the key is only honoured when sent.
  const touchesAvatar = 'avatar_url' in body
  const avatarUrl = optText(body.avatar_url, 'avatar_url', 500)
  if (avatarUrl && !/^https?:\/\//i.test(avatarUrl) && !avatarUrl.startsWith(`/api/app/avatars/${user.id}`)) {
    throw new HttpError(400, 'Profile photo link must start with http:// or https://')
  }

  try {
    const rows = await db()`
      UPDATE profiles SET
        display_name = ${optText(body.display_name, 'display_name', 100)},
        username = ${username},
        bio = ${optText(body.bio, 'bio', 1000)},
        avatar_url = CASE WHEN ${touchesAvatar} THEN ${avatarUrl} ELSE avatar_url END,
        updated_at = NOW()
      WHERE id = ${user.id}
      RETURNING id, username, display_name, avatar_url, bio`
    return { profile: rows[0] }
  } catch (error) {
    if (pgErrorCode(error) === '23505') throw new HttpError(409, 'That username is taken. Try another one.', 'username_taken')
    throw error
  }
}

const uploadAvatar: Handler = async ({ user, body }) => {
  let parsed: ReturnType<typeof parseAvatarDataUrl>
  try {
    parsed = parseAvatarDataUrl(String(body.image ?? ''))
  } catch (error) {
    throw new HttpError(400, (error as Error).message, 'invalid_photo')
  }
  const url = `/api/app/avatars/${user.id}?v=${Date.now()}`
  const sql = db()
  const [, rows] = await sql.transaction([
    sql`INSERT INTO avatars (user_id, mime, data_b64) VALUES (${user.id}, ${parsed.mime}, ${parsed.base64})
        ON CONFLICT (user_id) DO UPDATE SET mime = EXCLUDED.mime, data_b64 = EXCLUDED.data_b64, updated_at = NOW()`,
    sql`UPDATE profiles SET avatar_url = ${url}, updated_at = NOW() WHERE id = ${user.id}
        RETURNING id, username, display_name, avatar_url, bio`,
  ])
  return { profile: rows[0] }
}

const removeAvatar: Handler = async ({ user }) => {
  const sql = db()
  const [, rows] = await sql.transaction([
    sql`DELETE FROM avatars WHERE user_id = ${user.id}`,
    sql`UPDATE profiles SET avatar_url = NULL, updated_at = NOW() WHERE id = ${user.id}
        RETURNING id, username, display_name, avatar_url, bio`,
  ])
  return { profile: rows[0] }
}

const avatarImage: Handler = async ({ params }) => {
  const rows = await db()`SELECT mime, data_b64 FROM avatars WHERE user_id = ${uuid(params[0], 'profile id')}`
  if (!rows[0]) throw new HttpError(404, 'No photo')
  // URLs carry ?v=<ms>, so a new upload gets a new URL and this copy can be cached for good.
  return new Response(Buffer.from(rows[0].data_b64, 'base64'), {
    headers: { 'Content-Type': rows[0].mime, 'Cache-Control': 'private, max-age=31536000, immutable' },
  })
}

const undoDismissRecommendation: Handler = async ({ user, params }) => {
  await db()`DELETE FROM recommendation_feedback WHERE user_id = ${user.id} AND tmdb_id = ${int(params[0], 'tmdb_id')}`
  return { status: 'restored' }
}

const follow: Handler = async ({ user, params }) => {
  const target = uuid(params[0], 'profile id')
  if (target === user.id) throw new HttpError(400, "You can't follow yourself")
  await db()`INSERT INTO follows (follower_id, following_id) VALUES (${user.id}, ${target}) ON CONFLICT DO NOTHING`
  return { following: true }
}

const unfollow: Handler = async ({ user, params }) => {
  await db()`DELETE FROM follows WHERE follower_id = ${user.id} AND following_id = ${uuid(params[0], 'profile id')}`
  return { following: false }
}

const replaceTop5: Handler = async ({ user, body }) => {
  const items = Array.isArray(body.items) ? body.items : null
  if (!items || items.length > 5) throw new HttpError(400, 'items must be a list of up to 5 picks')
  const ranks = items.map((item) => int((item as Record<string, unknown>).rank, 'rank'))
  const movieIds = items.map((item) => uuid((item as Record<string, unknown>).movie_id, 'movie_id'))
  if (ranks.some((r) => r < 1 || r > 5) || new Set(ranks).size !== ranks.length || new Set(movieIds).size !== movieIds.length) {
    throw new HttpError(400, 'Each pick needs a unique rank from 1 to 5 and a different title')
  }
  const sql = db()
  await sql.transaction([
    sql`DELETE FROM top5_items WHERE user_id = ${user.id}`,
    sql`INSERT INTO top5_items (user_id, rank, movie_id)
        SELECT ${user.id}::uuid, x.rank, x.movie_id FROM unnest(${ranks}::smallint[], ${movieIds}::uuid[]) AS x(rank, movie_id)`,
  ])
  return { status: 'saved' }
}

/* --------------------------------------------------------------- router */

const routes: Array<[method: string, pattern: RegExp, handler: Handler]> = [
  ['GET', /^me$/, me],
  ['GET', /^home$/, home],
  ['GET', /^social$/, social],
  ['GET', /^recommendation-seeds$/, recommendationSeeds],
  ['GET', /^profiles\/([^/]+)$/, profileByUsername],
  ['PATCH', /^profile$/, updateProfile],
  ['PUT', /^avatar$/, uploadAvatar],
  ['DELETE', /^avatar$/, removeAvatar],
  ['GET', /^avatars\/([^/]+)$/, avatarImage],
  ['DELETE', /^recommendation-feedback\/(\d+)$/, undoDismissRecommendation],
  ['POST', /^movies$/, ensureMovie],
  ['GET', /^titles\/(\d+)\/status$/, titleStatus],
  ['GET', /^episodes\/([^/]+)$/, watchedEpisodes],
  ['PUT', /^episodes$/, setEpisodes],
  ['GET', /^continue-watching$/, continueWatching],
  ['POST', /^ratings$/, saveRating],
  ['DELETE', /^ratings\/([^/]+)$/, deleteRating],
  ['POST', /^watchlist$/, addToWatchlist],
  ['DELETE', /^watchlist\/([^/]+)$/, removeFromWatchlist],
  ['PUT', /^reactions$/, setReaction],
  ['POST', /^comments$/, addComment],
  ['DELETE', /^comments\/([^/]+)$/, deleteComment],
  ['POST', /^recommendation-feedback$/, dismissRecommendation],
  ['PUT', /^follows\/([^/]+)$/, follow],
  ['DELETE', /^follows\/([^/]+)$/, unfollow],
  ['PUT', /^top5$/, replaceTop5],
]

function json(status: number, data: unknown) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  })
}

async function handle(request: Request): Promise<Response> {
  const url = new URL(request.url)
  const path = url.pathname.replace(/^\/api\/app\/?/, '').replace(/\/$/, '')
  const pathMatches = routes.filter(([, pattern]) => pattern.test(path))
  if (pathMatches.length === 0) return json(404, { error: 'Not found' })
  const route = pathMatches.find(([method]) => method === request.method)
  if (!route) return json(405, { error: 'Method not allowed' })

  try {
    const user = await getSessionUser(request)
    if (!user) throw new HttpError(401, 'Sign in to continue', 'unauthenticated')

    let body: Record<string, unknown> = {}
    if (request.method !== 'GET' && request.method !== 'DELETE') {
      const text = await request.text()
      if (text.trim()) {
        try {
          const parsed = JSON.parse(text)
          body = parsed && typeof parsed === 'object' ? parsed : {}
        } catch {
          throw new HttpError(400, 'Request body must be JSON')
        }
      }
    }

    const params = path.match(route[1])!.slice(1)
    const result = await route[2]({ user, url, params, body })
    return result instanceof Response ? result : json(200, result)
  } catch (error) {
    if (error instanceof HttpError) return json(error.status, { error: error.message, code: error.code })
    const code = pgErrorCode(error)
    if (code === '23505') return json(409, { error: 'That already exists', code: 'conflict' })
    if (code === '23503') return json(400, { error: 'That title or person no longer exists', code: 'missing_reference' })
    if (code === '23514' || code === '22P02') return json(400, { error: 'Some of the values are invalid', code: 'invalid' })
    console.error('api/app error', request.method, path, error)
    return json(500, { error: 'Something went wrong on our side. Try again.' })
  }
}

export const GET = handle
export const POST = handle
export const PUT = handle
export const PATCH = handle
export const DELETE = handle
