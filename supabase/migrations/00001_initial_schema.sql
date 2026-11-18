-- Enable UUID and create tables for the AbsoluteCinema app

-- Create profiles table
CREATE TABLE IF NOT EXISTS profiles (
  id UUID PRIMARY KEY DEFAULT auth.uid(),
  username VARCHAR(50) UNIQUE NOT NULL,
  display_name VARCHAR(100),
  avatar_url VARCHAR(500),
  bio TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view all profiles (authenticated)"
  ON profiles FOR SELECT
  USING (auth.role() = 'authenticated');

CREATE POLICY "Users can update their own profile"
  ON profiles FOR UPDATE
  USING (auth.uid() = id);

-- Create movies table
CREATE TABLE IF NOT EXISTS movies (
  id BIGSERIAL PRIMARY KEY,
  tmdb_id INTEGER UNIQUE NOT NULL,
  title VARCHAR(255) NOT NULL,
  year INTEGER,
  poster_path VARCHAR(500),
  overview TEXT,
  genre VARCHAR(100),
  media_type VARCHAR(20) DEFAULT 'movie',
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

ALTER TABLE movies ENABLE ROW LEVEL SECURITY;

CREATE POLICY "All authenticated users can view movies"
  ON movies FOR SELECT
  USING (auth.role() = 'authenticated');

CREATE POLICY "Authenticated users can insert movies"
  ON movies FOR INSERT
  WITH CHECK (auth.role() = 'authenticated');

-- Create ratings table
CREATE TABLE IF NOT EXISTS ratings (
  id BIGSERIAL PRIMARY KEY,
  movie_id BIGINT NOT NULL REFERENCES movies(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  rating NUMERIC(3, 1) NOT NULL CHECK (rating >= 1 AND rating <= 10 AND (rating * 2) = FLOOR(rating * 2)),
  description TEXT,
  watched_date DATE,
  date_type VARCHAR(20),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(user_id, movie_id)
);

ALTER TABLE ratings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "All authenticated users can view ratings"
  ON ratings FOR SELECT
  USING (auth.role() = 'authenticated');

CREATE POLICY "Users can insert their own ratings"
  ON ratings FOR INSERT
  WITH CHECK (auth.uid() = user_id AND auth.role() = 'authenticated');

CREATE POLICY "Users can update their own ratings"
  ON ratings FOR UPDATE
  USING (auth.uid() = user_id AND auth.role() = 'authenticated');

-- Create top5 table
CREATE TABLE IF NOT EXISTS top5 (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID NOT NULL UNIQUE REFERENCES profiles(id) ON DELETE CASCADE,
  movie_ids BIGINT[] DEFAULT '{}',
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

ALTER TABLE top5 ENABLE ROW LEVEL SECURITY;

CREATE POLICY "All authenticated users can view top5"
  ON top5 FOR SELECT
  USING (auth.role() = 'authenticated');

CREATE POLICY "Users can insert their own top5"
  ON top5 FOR INSERT
  WITH CHECK (auth.uid() = user_id AND auth.role() = 'authenticated');

CREATE POLICY "Users can update their own top5"
  ON top5 FOR UPDATE
  USING (auth.uid() = user_id AND auth.role() = 'authenticated');

-- Create predictions table for prediction game
CREATE TABLE IF NOT EXISTS predictions (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  movie_id BIGINT NOT NULL REFERENCES movies(id) ON DELETE CASCADE,
  predicted_avg NUMERIC(3, 1),
  actual_avg NUMERIC(3, 1),
  is_correct BOOLEAN,
  created_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(user_id, movie_id)
);

ALTER TABLE predictions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "All authenticated users can view predictions"
  ON predictions FOR SELECT
  USING (auth.role() = 'authenticated');

CREATE POLICY "Users can insert their own predictions"
  ON predictions FOR INSERT
  WITH CHECK (auth.uid() = user_id AND auth.role() = 'authenticated');

-- Create materialized view for movie averages (used by Dashboard)
CREATE MATERIALIZED VIEW IF NOT EXISTS movie_averages AS
SELECT 
  m.id,
  m.tmdb_id,
  m.title,
  m.year,
  m.poster_path,
  m.overview,
  m.genre,
  ROUND(AVG(r.rating)::numeric, 1) as avg_score,
  COUNT(r.id) as rating_count
FROM movies m
LEFT JOIN ratings r ON m.id = r.movie_id
GROUP BY m.id, m.tmdb_id, m.title, m.year, m.poster_path, m.overview, m.genre;

-- Create index for faster queries
CREATE INDEX IF NOT EXISTS idx_ratings_user_id ON ratings(user_id);
CREATE INDEX IF NOT EXISTS idx_ratings_movie_id ON ratings(movie_id);
CREATE INDEX IF NOT EXISTS idx_movies_tmdb_id ON movies(tmdb_id);
