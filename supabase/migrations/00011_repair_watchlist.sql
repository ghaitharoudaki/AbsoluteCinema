-- Repair watchlist access for projects where the table was created manually.
CREATE TABLE IF NOT EXISTS public.watchlist (
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  movie_id UUID NOT NULL REFERENCES public.movies(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (user_id, movie_id)
);

ALTER TABLE public.watchlist ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated users can view watchlists" ON public.watchlist;
CREATE POLICY "Authenticated users can view watchlists"
  ON public.watchlist FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS "Users can manage own watchlist" ON public.watchlist;
CREATE POLICY "Users can manage own watchlist"
  ON public.watchlist FOR ALL
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.watchlist TO authenticated;