-- Titles a user has dismissed from recommendations
CREATE TABLE IF NOT EXISTS recommendation_feedback (
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  tmdb_id INTEGER NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (user_id, tmdb_id)
);

ALTER TABLE recommendation_feedback ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own recommendation feedback"
  ON recommendation_feedback FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can manage own recommendation feedback"
  ON recommendation_feedback FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
