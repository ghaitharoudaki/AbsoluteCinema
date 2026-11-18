-- AbsoluteCinema schema for Neon (Postgres 16+).
--
-- Ported from supabase/migrations. Differences from the Supabase version:
--   * No auth schema: profiles carry the Google email that Auth.js matches on sign-in.
--   * No row-level security: every query runs server-side in /api/app, which scopes
--     writes to the signed-in user. Rules that RLS enforced are noted inline.
--   * movies.id and ratings.id are UUIDs, matching the live database (later
--     migrations referenced them as UUID even though 00001 declared BIGSERIAL).
--   * The legacy `top5` array table is gone; the migration script converts it.
--
-- Safe to re-run: everything is IF NOT EXISTS / OR REPLACE. (gen_random_uuid is built in since Postgres 13.)


CREATE TABLE IF NOT EXISTS profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT,                              -- matched case-insensitively at sign-in
  username VARCHAR(50) UNIQUE NOT NULL,
  display_name VARCHAR(100),
  avatar_url VARCHAR(500),
  bio TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_profiles_email_lower ON profiles (lower(email));

CREATE TABLE IF NOT EXISTS movies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tmdb_id INTEGER UNIQUE NOT NULL,
  title VARCHAR(255) NOT NULL,
  year INTEGER,
  poster_path VARCHAR(500),
  overview TEXT,
  genre VARCHAR(100),
  media_type VARCHAR(20) DEFAULT 'movie',
  genres TEXT[],
  release_year INTEGER,
  runtime_minutes INTEGER,
  episode_run_time INTEGER,
  number_of_episodes INTEGER,
  release_date DATE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Only the owner may insert/update their rating (enforced in /api/app/ratings).
CREATE TABLE IF NOT EXISTS ratings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  movie_id UUID NOT NULL REFERENCES movies(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  rating NUMERIC(3, 1) NOT NULL CONSTRAINT ratings_rating_check
    CHECK (rating >= 0.5 AND rating <= 10 AND (rating * 2) = FLOOR(rating * 2)),
  description TEXT,
  watched_date DATE,
  date_type VARCHAR(20),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (user_id, movie_id)
);
CREATE INDEX IF NOT EXISTS idx_ratings_user_id ON ratings(user_id);
CREATE INDEX IF NOT EXISTS idx_ratings_movie_id ON ratings(movie_id);
CREATE INDEX IF NOT EXISTS idx_ratings_created_at ON ratings(created_at DESC);

CREATE TABLE IF NOT EXISTS follows (
  follower_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  following_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (follower_id, following_id),
  CHECK (follower_id <> following_id)
);
CREATE INDEX IF NOT EXISTS idx_follows_following ON follows(following_id);

CREATE TABLE IF NOT EXISTS top5_items (
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  rank SMALLINT NOT NULL CHECK (rank BETWEEN 1 AND 5),
  movie_id UUID NOT NULL REFERENCES movies(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (user_id, rank),
  UNIQUE (user_id, movie_id)
);

CREATE TABLE IF NOT EXISTS watchlist (
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  movie_id UUID NOT NULL REFERENCES movies(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (user_id, movie_id)
);

CREATE TABLE IF NOT EXISTS reactions (
  rating_id UUID NOT NULL REFERENCES ratings(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  reaction TEXT NOT NULL CHECK (reaction IN ('like', 'dislike')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (rating_id, user_id)
);

-- Delete allowed for the comment author or the rating's owner (enforced in API).
CREATE TABLE IF NOT EXISTS comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rating_id UUID NOT NULL REFERENCES ratings(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  content TEXT NOT NULL CHECK (char_length(trim(content)) BETWEEN 1 AND 500),
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_comments_rating ON comments(rating_id, created_at);

-- Private to each user (enforced in API).
CREATE TABLE IF NOT EXISTS recommendation_feedback (
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  tmdb_id INTEGER NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (user_id, tmdb_id)
);

-- Not used by the app yet; kept so existing rows survive the move.
CREATE TABLE IF NOT EXISTS predictions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  movie_id UUID NOT NULL REFERENCES movies(id) ON DELETE CASCADE,
  predicted_avg NUMERIC(3, 1),
  actual_avg NUMERIC(3, 1),
  is_correct BOOLEAN,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (user_id, movie_id)
);

CREATE OR REPLACE VIEW user_watch_stats AS
SELECT
  r.user_id,
  ROUND(COALESCE(SUM(
    CASE WHEN COALESCE(m.media_type, 'movie') = 'movie'
      THEN COALESCE(m.runtime_minutes, 0)::numeric / 60 ELSE 0 END
  ), 0), 1) AS movie_hours,
  ROUND(COALESCE(SUM(
    CASE WHEN m.media_type = 'tv'
      THEN (COALESCE(m.episode_run_time, 45) * COALESCE(m.number_of_episodes, 1))::numeric / 60 ELSE 0 END
  ), 0), 1) AS series_hours,
  COUNT(*) FILTER (WHERE COALESCE(m.media_type, 'movie') = 'movie')::integer AS movie_count,
  COUNT(*) FILTER (WHERE m.media_type = 'tv')::integer AS series_count
FROM ratings r
JOIN movies m ON m.id = r.movie_id
GROUP BY r.user_id;

CREATE OR REPLACE FUNCTION get_favorite_genre(p_user_id UUID)
RETURNS TEXT
LANGUAGE sql STABLE
AS $$
  -- Alias must not be "genre": movies has a genre column, and GROUP BY would bind to it.
  SELECT genre_name
  FROM (
    SELECT g.genre_name, COUNT(*) AS cnt
    FROM ratings r
    JOIN movies m ON m.id = r.movie_id
    CROSS JOIN LATERAL unnest(m.genres) AS g(genre_name)
    WHERE r.user_id = p_user_id
    GROUP BY g.genre_name
    ORDER BY cnt DESC, g.genre_name ASC
    LIMIT 1
  ) t;
$$;
