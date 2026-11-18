-- Create RPC functions for the app

-- Function to get the featured movie (randomly selection from top-rated movies)
CREATE OR REPLACE FUNCTION get_featured_movie()
RETURNS TABLE (
  id BIGINT,
  tmdb_id INTEGER,
  title VARCHAR,
  year INTEGER,
  poster_path VARCHAR,
  overview TEXT,
  genre VARCHAR,
  media_type VARCHAR,
  avg_score NUMERIC,
  rating_count BIGINT
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    m.id,
    m.tmdb_id,
    m.title,
    m.year,
    m.poster_path,
    m.overview,
    m.genre,
    m.media_type,
    COALESCE(ROUND(AVG(r.rating)::numeric, 1), 0::numeric) as avg_score,
    COUNT(r.id) as rating_count
  FROM movies m
  LEFT JOIN ratings r ON m.id = r.movie_id
  WHERE (SELECT COUNT(*) FROM ratings WHERE movie_id = m.id) >= 1
  GROUP BY m.id, m.tmdb_id, m.title, m.year, m.poster_path, m.overview, m.genre, m.media_type
  ORDER BY RANDOM()
  LIMIT 1;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to get average rating for a specific movie
CREATE OR REPLACE FUNCTION get_movie_average_score(p_movie_id BIGINT)
RETURNS NUMERIC AS $$
  SELECT ROUND(AVG(rating)::numeric, 1)
  FROM ratings
  WHERE movie_id = p_movie_id;
$$ LANGUAGE sql SECURITY DEFINER;

-- Function to get all movies with their average ratings and counts
CREATE OR REPLACE FUNCTION get_all_movies_with_ratings()
RETURNS TABLE (
  id BIGINT,
  tmdb_id INTEGER,
  title VARCHAR,
  year INTEGER,
  poster_path VARCHAR,
  overview TEXT,
  genre VARCHAR,
  media_type VARCHAR,
  avg_score NUMERIC,
  rating_count BIGINT
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    m.id,
    m.tmdb_id,
    m.title,
    m.year,
    m.poster_path,
    m.overview,
    m.genre,
    m.media_type,
    COALESCE(ROUND(AVG(r.rating)::numeric, 1), 0::numeric) as avg_score,
    COALESCE(COUNT(r.id), 0) as rating_count
  FROM movies m
  LEFT JOIN ratings r ON m.id = r.movie_id
  GROUP BY m.id, m.tmdb_id, m.title, m.year, m.poster_path, m.overview, m.genre, m.media_type
  ORDER BY m.updated_at DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION get_featured_movie() TO authenticated;
GRANT EXECUTE ON FUNCTION get_movie_average_score(BIGINT) TO authenticated;
GRANT EXECUTE ON FUNCTION get_all_movies_with_ratings() TO authenticated;
