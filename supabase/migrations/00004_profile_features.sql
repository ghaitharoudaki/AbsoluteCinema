-- Profile dashboard: follows, top 5 picks, watch stats, genres

CREATE TABLE IF NOT EXISTS follows (
  follower_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  following_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (follower_id, following_id),
  CHECK (follower_id <> following_id)
);

ALTER TABLE follows ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated users can view follows" ON follows;
CREATE POLICY "Authenticated users can view follows"
  ON follows FOR SELECT
  USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "Users can follow others" ON follows;
CREATE POLICY "Users can follow others"
  ON follows FOR INSERT
  WITH CHECK (auth.uid() = follower_id AND auth.role() = 'authenticated');

DROP POLICY IF EXISTS "Users can unfollow" ON follows;
CREATE POLICY "Users can unfollow"
  ON follows FOR DELETE
  USING (auth.uid() = follower_id AND auth.role() = 'authenticated');

CREATE TABLE IF NOT EXISTS top5_items (
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  rank SMALLINT NOT NULL CHECK (rank BETWEEN 1 AND 5),
  movie_id UUID NOT NULL REFERENCES movies(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (user_id, rank),
  UNIQUE (user_id, movie_id)
);

ALTER TABLE top5_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated users can view top5 items" ON top5_items;
CREATE POLICY "Authenticated users can view top5 items"
  ON top5_items FOR SELECT
  USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "Users can manage own top5" ON top5_items;
CREATE POLICY "Users can manage own top5"
  ON top5_items FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

ALTER TABLE movies ADD COLUMN IF NOT EXISTS genres TEXT[];
ALTER TABLE movies ADD COLUMN IF NOT EXISTS release_year INTEGER;
ALTER TABLE movies ADD COLUMN IF NOT EXISTS runtime_minutes INTEGER;
ALTER TABLE movies ADD COLUMN IF NOT EXISTS episode_run_time INTEGER;
ALTER TABLE movies ADD COLUMN IF NOT EXISTS number_of_episodes INTEGER;
ALTER TABLE movies ADD COLUMN IF NOT EXISTS release_date DATE;

CREATE OR REPLACE VIEW user_watch_stats AS
SELECT
  r.user_id,
  ROUND(COALESCE(SUM(
    CASE
      WHEN COALESCE(m.media_type, 'movie') = 'movie'
      THEN COALESCE(m.runtime_minutes, 0)::numeric / 60
      ELSE 0
    END
  ), 0), 1) AS movie_hours,
  ROUND(COALESCE(SUM(
    CASE
      WHEN m.media_type = 'tv'
      THEN (COALESCE(m.episode_run_time, 45) * COALESCE(m.number_of_episodes, 1))::numeric / 60
      ELSE 0
    END
  ), 0), 1) AS series_hours,
  COUNT(*) FILTER (WHERE COALESCE(m.media_type, 'movie') = 'movie')::integer AS movie_count,
  COUNT(*) FILTER (WHERE m.media_type = 'tv')::integer AS series_count
FROM ratings r
JOIN movies m ON m.id = r.movie_id
GROUP BY r.user_id;

CREATE OR REPLACE FUNCTION get_favorite_genre(p_user_id UUID)
RETURNS TEXT
LANGUAGE sql STABLE SECURITY DEFINER
AS $$
  SELECT genre
  FROM (
    SELECT unnest(m.genres) AS genre, COUNT(*) AS cnt
    FROM ratings r
    JOIN movies m ON m.id = r.movie_id
    WHERE r.user_id = p_user_id
      AND m.genres IS NOT NULL
      AND array_length(m.genres, 1) > 0
    GROUP BY genre
    ORDER BY cnt DESC, genre ASC
    LIMIT 1
  ) t;
$$;

GRANT SELECT ON user_watch_stats TO authenticated;
GRANT EXECUTE ON FUNCTION get_favorite_genre(UUID) TO authenticated;
