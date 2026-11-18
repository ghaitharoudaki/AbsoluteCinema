-- The movie helper uses upsert, so existing shared titles need an update policy.
DROP POLICY IF EXISTS "Authenticated users can update movies" ON movies;

CREATE POLICY "Authenticated users can update movies"
  ON movies FOR UPDATE
  USING (auth.role() = 'authenticated')
  WITH CHECK (auth.role() = 'authenticated');
