# AbsoluteCinema — Project Brief & Build Instructions

This file is read automatically by GitHub Copilot as persistent repo context.
Follow it for every feature, page, and component you generate in this repo.

## 1. What this is

A private movie/TV tracking site for a small friend group (not public, not a
startup). Think Letterboxd's logging loop crossed with the addictive social
mechanics of Duolingo streaks/leagues and Snapchat-style friend pressure —
scoped entirely to a closed circle of friends who already know each other.

The whole point is to make friends actually **keep posting** after the first
week, not just log one movie and forget the site exists. Every feature below
should be judged against that goal.

## 2. Tech stack (already set up — do not change without asking)

- Frontend: React + Vite + TypeScript, `apps/web/`
- Styling: Tailwind CSS v3 (not v4)
- Backend: Vercel serverless functions, `api/`
- Database/Auth: Supabase (Postgres + RLS + Google OAuth)
- Monorepo layout: `apps/web/`, `api/`, `supabase/migrations/`, `packages/shared/`

## 3. Already built — reuse, don't recreate

- `apps/web/src/lib/supabase.ts` — Supabase client
- `apps/web/src/lib/AuthContext.tsx` — auth state + auto-creates a `profiles`
  row on first login using Google metadata
- `apps/web/src/pages/Login.tsx`, `apps/web/src/pages/Home.tsx`
- `apps/web/src/components/MovieSearch.tsx` — debounced TMDB search dropdown
- `api/tmdb/search.ts` — TMDB proxy (movies + TV), keeps API key server-side
- Supabase tables already migrated: `profiles`, `movies`, `ratings`, `top5`,
  `predictions` (see `supabase/migrations/00001_initial_schema.sql`)
- All tables have RLS enabled; every `select` policy currently checks
  `auth.role() = 'authenticated'` — this is a closed friend app, not public

## 4. Design system — follow exactly, do not default to generic dark-mode/SaaS UI

**Identity:** a movie marquee at night — cinema-specific, not generic
"AI dark mode with a glow." Every new page/component should feel like it
belongs next to the existing Home page and MovieSearch component.

**Color tokens** (already in `tailwind.config.js` as `cinema.*`):
```
cinema-bg:       #0B0A0F   (near-black background)
cinema-elevated: #15121C   (raised surface)
cinema-card:     #1B1723   (card surface)
cinema-gold:     #E8B95E   (marquee-bulb glow accent — primary)
cinema-velvet:   #7A2436   (curtain crimson — secondary accent)
cinema-ivory:    #F3EEE4   (primary text)
cinema-muted:    #9C93A8   (secondary/meta text)
```

**Type** (already loaded in `index.css`):
- `font-display` = Bebas Neue — condensed poster lettering, headlines only,
  used sparingly, never for body copy
- `font-body` = Fraunces — warm serif, all body text and UI copy
- `font-mono` = JetBrains Mono — ratings, numbers, timestamps, stat badges

**Recurring motifs to keep using:**
- Soft radial gold/velvet glow behind hero/focal sections (`.spotlight-bg`)
- Film grain overlay already applied via `.grain` on page wrappers
- Rounded-full pill shapes for inputs/search, rounded-2xl for cards
- Section dividers styled as a horizontal rule + mono-uppercase label
  flanked by hairlines (see the "Recent Screenings" divider in Home.tsx)
- Empty states get in-universe copy ("the house lights are still up"), never
  generic "no data" text

**Layout inspiration (structure only, not visual skin):** browsing pages can
borrow grid-of-posters + sidebar genre filters + rating badge patterns from
apps like Trakt — but re-skinned entirely in the cinema token system above.
Do not produce a generic streaming-site look (dark sidebar + flat poster
grid + red/white badges) — that reads as templated. Every grid/browse view
should still feel like this specific app, not an interchangeable clone.

## 5. Login / signup page — full-bleed split-screen, not a floating card

The current implementation renders two separate rounded cards floating in
the middle of empty black space. That reads as unfinished. The fix is
structural, not decorative: this needs to be **one continuous full-height,
full-width layout split into two panels**, edge to edge, no gaps, no
rounded card-in-a-card. Reference for the *structure* (not the colors):
a typical split-screen SaaS login — one static brand panel, one panel with
the actual sign-in action — executed with generous whitespace and a clear
single hierarchy per side. Re-skin entirely in the cinema token system.

**Layout: two columns, both `h-screen`, no outer padding/margin between
them, no border-radius on the panels themselves.**

**Left panel** (roughly 55% width on desktop, full width stacked on top on
mobile):
- Background: `cinema-bg` with `.grain` and `.spotlight-bg` applied directly
  to this panel (not the whole page)
- Generous padding (at least `p-16` on desktop)
- Content vertically centered, left-aligned
- `font-display` wordmark, large (text-6xl+), gold accent on one word —
  same treatment as the Home nav logo, just bigger
- One `font-body` italic tagline sentence below it, `text-xl`, `cinema-muted`
- 3 short feature lines below that, `font-mono text-xs uppercase
  tracking-wide`, each preceded by a small gold dot — not full sentences,
  just short phrases (e.g. "Group ratings, not solo scores")
- No card, no border, no box — this content sits directly on the panel
  background

**Right panel** (remaining width, `cinema-elevated` background, full
height, no rounded corners since it's a full panel not a card):
- Content vertically and horizontally centered in a max-w-sm column
- `font-display` "SIGN IN" label, smaller than the left wordmark (text-2xl)
- One line of `font-body` copy explaining what happens next
- Single "Continue with Google" button: full width of the column, pill
  shape, the same glow-on-hover treatment as MovieSearch's input border,
  NOT a default/branded Google button — no Google logo, no white
  background, it should look like it belongs to this app
- Generous vertical spacing between every element (at least `space-y-8`
  on the column) — the current version feels cramped, fix by adding
  breathing room, not by adding more boxes/borders
- No email/password fields, no "why we love it" bullet box, no secondary
  card inside the panel — Google OAuth only, one clear action, nothing
  competing with it visually

**On mobile**: stack vertically, left panel content becomes shorter
(wordmark + tagline only, drop the 3 feature lines) so the sign-in button
is reachable without excessive scrolling.

## 6. Feature specs to build (in priority order)

### 6.1 Core loop (if not already done)
Rate/log form: pick a movie from `MovieSearch` → 1–10 rating (styled as a
glowing slider, ticks in `font-mono`) → optional description → watched date
→ submit. On submit: upsert into `movies` by `tmdb_id` if new, then insert
into `ratings`. Show a toast/confirmation styled like a torn ticket stub.

### 6.2 Browse / grid view
A `/browse` page: poster grid of everything the group has logged, with
genre/year/media-type filters in a sidebar (Trakt-style structure, cinema
skin). Each poster shows the **group average rating** as a badge, not any
one person's score.

### 6.3 Profile page
`/profile/:username` — avatar, bio, Top 5 (already have the `top5` table),
recent ratings, and slots for the badges/stats below (taste twin, hot take
count, oracle score, etc.) once those are built.

### 6.4 Taste Horoscope
AI-generated short blurb per user based on their rating pattern (avg score,
rating variance, most-logged genre, rewatch frequency). Example tone: "You
rate everything a 7. You are afraid of commitment." Generate server-side
(new `api/horoscope/generate.ts`) using an LLM call, cache result in a new
`horoscopes` table (`user_id`, `content`, `generated_at`), regenerate on
demand (button on own profile) rather than live on every page load.

### 6.5 Compatibility %
For any two users, % agreement based on rating overlap on shared movies
(e.g. average of `10 - abs(rating_a - rating_b)` normalized to a
percentage across all movies both rated). Show on profile pages: "You and
Omar agree 71% of the time." Compute on the fly via a Postgres view/RPC
function rather than a stored table, since the friend group is small.

### 6.6 Hot Take detector
When a rating is ≥3 points off the group average for that movie (only once
enough people have rated it, e.g. 2+), flag it with a "🔥 Hot Take" badge
inline in the feed and on the entry itself. Compute via a view comparing
each rating to the movie's average.

### 6.7 Prediction Game
Before a user rates a movie that already has at least one other rating,
prompt them to guess the eventual group average (slider, not shown any
existing ratings first). Store in the existing `predictions` table
(`predicted_avg`). Resolve via a server-side function once enough ratings
exist for that movie — set `actual_avg`, `is_correct` (within ±0.5), award
a running "🔮 Oracle" counter shown on profile. Do not let users edit a
prediction after submission (already reflected in the schema/RLS).

### 6.8 Beef Mode
When two users' ratings for the same movie differ by ≥5, auto-generate a
"rivalry" card pinned to both profiles (movie poster, both scores, both
usernames). New table: `rivalries` (`movie_id`, `user_a`, `user_b`,
`rating_a`, `rating_b`, `created_at`). Populate via a trigger or resolver
function whenever a second rating on a movie is inserted.

### 6.9 Weekly group poll
Each week: friends nominate movies, one gets picked (voting or rotation),
everyone watches and rates independently, results reveal on a set day
(e.g. Friday). New tables: `weekly_polls` (`id`, `week_start`, `chosen_movie_id`,
`reveal_at`), `poll_nominations` (`poll_id`, `user_id`, `movie_id`).

### 6.10 Monthly superlatives
Auto-generated awards page per month: Harshest Critic (lowest avg rating
given), Most Generous Rater (highest avg), Most Rewatches, Longest Log
Streak, Weirdest Top 5 (most hot takes). Compute via scheduled query
(Vercel cron hitting an API route monthly), store a snapshot in
`monthly_superlatives` (`month`, `category`, `user_id`) so the page loads
instantly rather than recomputing live.

### 6.11 Yearly Wrapped
Spotify-Wrapped-style shareable recap per user: genre breakdown, average
score, best/worst rated month, total logs. Build as its own route
(`/wrapped/:year`) with a distinct, more maximalist visual treatment than
the rest of the site (still cinema-themed) since it's meant to be
screenshot-shared outside the group.

### 6.12 Taste twin / taste opposite
On each profile, auto-computed from the compatibility % logic (6.5):
highest-compatibility friend = "Taste Twin," lowest = "Taste Opposite."

### 6.13 Currently watching status
Lightweight live status a user can set ("currently watching Oldboy"),
visible on their profile and optionally in a small strip on Home. New
table `currently_watching` (`user_id`, `movie_id`, `started_at`), one row
per user (upsert), cleared when they log the rating for that movie.

### 6.14 Reactions & comments (roast mode)
Emoji reactions and short comments on any rating entry. New tables:
`reactions` (`rating_id`, `user_id`, `emoji`), `comments` (`rating_id`,
`user_id`, `content`, `created_at`). "Roast mode" is just comments framed
as a one-line "review of your review" in the UI — same table, just a
prompt/placeholder difference in the comment composer on your own vs.
others' entries.

## 7. Working instructions for Copilot

- Match the existing file structure and naming conventions exactly.
- Every new table needs RLS enabled and an `authenticated`-only select
  policy at minimum, consistent with the existing migrations.
- Add new tables as new files in `supabase/migrations/`, numbered
  sequentially (`00002_...`, `00003_...`) — never edit `00001` directly.
- Reuse `MovieSearch`, `AuthContext`, and the `supabase` client rather than
  writing new versions.
- Keep all new UI inside the design system in section 4 — if a component
  doesn't have an obvious cinema-themed treatment, ask rather than
  defaulting to a generic card/button style.
- Build and test one feature end-to-end (schema → API/RPC → UI) before
  starting the next, rather than scaffolding everything shallowly at once.