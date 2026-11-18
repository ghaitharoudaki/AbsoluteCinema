-- Allow half-point ratings from 0.5 through 10 in the live database.
ALTER TABLE ratings DROP CONSTRAINT IF EXISTS ratings_rating_check;

ALTER TABLE ratings
  ADD CONSTRAINT ratings_rating_check
  CHECK (rating >= 0.5 AND rating <= 10 AND (rating * 2) = FLOOR(rating * 2));
