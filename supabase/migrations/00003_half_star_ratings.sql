-- Allow half-star ratings from 0.5 through 10 (e.g. 7.5)

ALTER TABLE ratings DROP CONSTRAINT IF EXISTS ratings_score_check;
ALTER TABLE ratings DROP CONSTRAINT IF EXISTS ratings_rating_check;

ALTER TABLE ratings
  ALTER COLUMN rating TYPE NUMERIC(3, 1) USING rating::NUMERIC(3, 1);

ALTER TABLE ratings
  ADD CONSTRAINT ratings_rating_check
  CHECK (rating >= 0.5 AND rating <= 10 AND (rating * 2) = FLOOR(rating * 2));
