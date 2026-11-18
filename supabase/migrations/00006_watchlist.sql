-- Movies users want to watch later
CREATE TABLE IF NOT EXISTS watchlist (
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  movie_id UUID NOT NULL REFERENCES movies(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (user_id, movie_id)
);

ALTER TABLE watchlist ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated users can view watchlists" ON watchlist;
CREATE POLICY "Authenticated users can view watchlists"
  ON watchlist FOR SELECT
  USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "Users can manage own watchlist" ON watchlist;
CREATE POLICY "Users can manage own watchlist"
  ON watchlist FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
