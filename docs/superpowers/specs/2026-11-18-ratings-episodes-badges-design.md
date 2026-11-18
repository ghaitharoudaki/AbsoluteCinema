# Absolute Cinema: ratings, episode tracking, badges (3 phases)

## Context
The profile doesn't reflect what people actually watched:
- **Tier list bug (confirmed with user):** the Letterboxd import ([Import.tsx](apps/web/src/pages/Import.tsx)) stores Letterboxd's 0.5–5 stars unscaled on the app's 0.5–10 scale. A 4.5★ favourite becomes 4.5/10 and lands in **F**.
- There's no way to remove a rating. No API route exists, and MovieDetail hides "Rate it" once you've rated, which is a dead end.
- Series hours always assume the whole show was watched (`user_watch_stats` view in [db/schema.sql](db/schema.sql)). Episodes can't be tracked.
- Movies and series share one tier list. There are no badges.

**Outcome:** correct, split tier lists; removable ratings; per-episode series tracking that drives hours; fun badges led by a "most hours" crown; and a set of missing-logic fixes and features.

## Decisions (user-approved)
- Letterboxd imports get ×2 going forward, plus a one-time fix for ratings already imported.
- Episodes: a season checklist (tick episodes, "mark season watched", progress, next up). Storage is a `watched_episodes` table (approach A), independent of rating the series.
- Hours badge: one site-wide **Projectionist** crown for the top total hours (it moves automatically), plus milestones at 50/100/250/500h.
- Phase 3 includes: missing-logic fixes, Continue watching row, profile filters/sort/search, rating histogram + stats.

**My calls (flag if wrong):**
- Missing-logic fixes move into Phase 1 because they touch the same rating flow.
- Badges are computed live in SQL/TS on profile load, never stored.
- Season 0 ("Specials") is shown but excluded from progress and completion.
- A rated series with no logged episodes keeps the old whole-show hours estimate. Once any episode is logged, only logged episodes count.

---

## Phase 1: Ratings & tier lists
1. **Letterboxd scale**
   - In `rowsFromFile` ([Import.tsx](apps/web/src/pages/Import.tsx)), when `provider === 'letterboxd'`, compute `rating = min(10, round(parsed*2*2)/2)`. Extract a pure `normalizeImportedRating(value, provider)` into `apps/web/src/lib/importRating.ts` and give it a `node --test` test.
   - Add the one-time script `scripts/fix-letterboxd-scale.mjs`, following the pattern of [scripts/apply-schema.mjs](scripts/apply-schema.mjs) and using `--env-file-if-exists=.env.local`. It defaults to a dry run that prints the affected count, and `--apply` runs:
     `UPDATE ratings SET rating = rating*2, updated_at = NOW() WHERE description = 'Imported from Letterboxd' AND rating <= 5 AND updated_at - created_at < interval '1 minute'`
     The guard skips ratings the user has re-edited since import. Add a `db:fix-letterboxd` npm script. **I'll ask before running `--apply` against Neon.**
2. **Remove a rating**
   - API ([api/app.ts](api/app.ts)): `DELETE ratings/:id`, scoped to `user_id`. It returns 404 if the rating isn't yours, and reactions and comments cascade.
   - [RateMovie.tsx](apps/web/src/pages/RateMovie.tsx): when `existingRating` is set, show a "Remove rating" text button in the footer. It uses a two-step confirm ("Remove? This also deletes its likes and comments"), then calls `onDone()`.
3. **Title status + MovieDetail fixes**
   - New `GET titles/:tmdbId/status?media_type=` returns `{ movieId, rating|null, onWatchlist }` for the current user.
   - [MovieDetail.tsx](apps/web/src/components/MovieDetail.tsx) uses it to show "Edit rating" instead of hiding the button, and "On your watchlist · Remove" instead of "Add". Callers in Dashboard and Profile keep passing `onRate`, and Profile/Dashboard already route an existing rating to edit mode.
4. **Watchlist auto-removal:** `saveRating` insert runs `DELETE FROM watchlist WHERE user_id AND movie_id` in the same transaction.
5. **Watched shelf:** stop merging unrated Top 5 items into `recentMovies` ([Profile.tsx:111-123](apps/web/src/pages/Profile.tsx#L111-L123)).
6. **Split tier lists:** extract the tier block into `components/TierList.tsx`, with Movies / Series tabs (accessible tablist plus a count per tab). It keeps the existing S–F bands and filters by `rating.movie.media_type`.

Commit: "Fix Letterboxd scale, allow removing ratings, split tier lists".

## Phase 2: Episode tracking
1. **Schema** ([db/schema.sql](db/schema.sql), idempotent):
   ```sql
   CREATE TABLE IF NOT EXISTS watched_episodes (
     user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
     movie_id UUID REFERENCES movies(id) ON DELETE CASCADE,
     season_number SMALLINT NOT NULL CHECK (season_number >= 0),
     episode_number SMALLINT NOT NULL CHECK (episode_number >= 1),
     runtime_minutes INTEGER,
     watched_at TIMESTAMPTZ DEFAULT NOW(),
     PRIMARY KEY (user_id, movie_id, season_number, episode_number));
   CREATE INDEX IF NOT EXISTS idx_watched_episodes_user ON watched_episodes(user_id, watched_at DESC);
   ```
   Rewrite the `user_watch_stats` view so that per series: if the user has episode rows, sum `COALESCE(runtime_minutes, m.episode_run_time, 45)`; otherwise use the old estimate for rated series. Also add `episode_count`. Apply with `npm run db:schema`, **and ask before running it on Neon.**
2. **TMDB**
   - New `api/tmdb/season.ts` (`?tmdb_id&season`) returns `[{episode_number, name, runtime, air_date, still_path}]`, following the pattern in [api/tmdb/details.ts](api/tmdb/details.ts).
   - Extend the tv branch of details.ts with `seasons: [{season_number, name, episode_count}]`.
3. **API**
   - `GET episodes/:movieId` returns my watched `[season, episode]` list.
   - `PUT episodes` takes `{ movie_id, watched: boolean, episodes: [{season, episode, runtime}] }` (≤200 per call) and bulk-inserts with ON CONFLICT DO NOTHING, or deletes.
   - `GET continue-watching` returns series with ≥1 watched episode that aren't complete, with last activity, latest S/E, count and `number_of_episodes`, ordered by recent activity (limit 12).
4. **UI:** new `components/SeriesTracker.tsx` rendered inside MovieDetail when `media_type === 'tv'`.
   - A season selector, then a checklist of episodes with title and air date (unaired episodes are disabled).
   - A "Mark season watched / unwatched" toggle.
   - Progress text "14 / 22 episodes · Next up S2E5", with optimistic updates and rollback plus an error message on failure.
   - It calls `ensureMovieInDb` first ([lib/movies.ts](apps/web/src/lib/movies.ts)).
5. **Continue watching row:** in [Dashboard.tsx](apps/web/src/pages/Dashboard.tsx), reuse the `PosterRow` pattern with a "Next: S2E5" caption and a one-tap "Mark watched" button. To find the next episode, the client fetches that season (rolling over to the next season when needed). The row is hidden when empty.

Commit: "Track watched episodes for series".

## Phase 3: Badges & profile improvements
1. **Badges:** `api/_lib/badges.ts` holds the pure `computeBadges(stats, ctx) → {id, name, icon, description, earned, progress?}[]`, covered by a `node --test` test.
   - The profile endpoint runs one extra aggregate query: total hours, rank by hours (site-wide max), episodes per day max, completed series, avg rating and count, distinct genres, distinct decades, notes count, and followers.
   - Badges:
     - **Projectionist 👑:** most total hours site-wide (ties share it, and the total must be >0).
     - Hour milestones, showing only the highest earned: **Matinee** 50h, **Double Feature** 100h, **Marathoner** 250h, **Legend of the Dark** 500h.
     - **Binge Machine:** 10+ episodes of one series in a day.
     - **Completionist:** finished a series.
     - **Harsh Critic** (avg ≤5, ≥20 ratings) / **Easy to Please** (avg ≥8.5, ≥20 ratings).
     - **Genre Explorer:** 10+ genres.
     - **Time Traveler:** films from 6+ decades.
     - **Critic's Pen:** 25 ratings with notes.
     - **Opening Night:** first rating.
     - **Crowd Favorite:** 10 followers.
   - Profile: a badge strip under the stats. Earned badges show prominently. On your own profile, locked badges appear dimmed with their progress hint.
2. **Watched shelf filters:** All / Movies / Series chips; sort by recent, rating or title; and a search box. The state is local to `MovieShelf` (lifted into props only for the Watched shelf).
3. **Rating histogram + stats:** load the `dataviz` skill before building.
   - A 20-bin bar strip (0.5–10) made of CSS bars with an accessible table fallback.
   - Average rating, plus "episodes this month" (from `watched_episodes`).
   - These go into the stats `dl`.

Commit: "Add badges, profile filters and rating stats".

---

## Process
- After you approve this plan, save it as the design doc `docs/superpowers/specs/2026-11-18-ratings-episodes-badges-design.md`, then execute phase by phase. Pure logic (scale conversion, badges) is test-first with `node --test` (Node 24 strips types).
- Load `frontend-design` and `ui-ux-behaves:ui-ux` before UI work, so it stays consistent with the "movie palace at night" theme tokens (`bg-surface`, `text-brand`, `ticket`, etc.).
- Run the code-reviewer agent after each phase. Commit locally per phase. **Pushing to main, applying the schema and running the Letterboxd fix on Neon each need your OK.**

## Verification (each phase)
- `npm run build --prefix apps/web` (tsc + vite) and `npx oxlint` in apps/web; `npx tsc --noEmit` on `api/`.
- `node --test` for the pure-logic tests.
- Letterboxd script dry run: check that the count looks right before `--apply`.
- End to end: run `vercel dev` with the `.env.local` creds, open it with chrome-devtools, and:
  - import a Letterboxd CSV row rated 4.5 and confirm it shows as 9.0 in the S tier of the Movies tab;
  - rate, then remove a rating and confirm it leaves both the tier list and Watched;
  - rate a watchlisted film and confirm it leaves the watchlist;
  - open a series, tick episodes, mark a season, and confirm progress, Continue watching and series hours update;
  - check that the badges render and the crown appears on the top-hours profile;
  - check the filters, sort, search and histogram;
  - screenshot in light and dark at phone width.
