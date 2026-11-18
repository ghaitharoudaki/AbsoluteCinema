# Database & sign-in setup (Neon + Auth.js)

AbsoluteCinema stores its data in **Neon** (serverless Postgres) and signs people in with
**Auth.js** using Google. The browser never talks to the database: every read and write goes
through `/api/app/*`, which checks the signed-in user first.

| Piece | Where |
|---|---|
| Schema | `db/schema.sql` |
| Sign-in (Auth.js, Google) | `api/auth.ts`, `api/_lib/auth.ts` |
| Data API | `api/app.ts` |
| Browser client | `apps/web/src/lib/api.ts` |
| One-time Supabase import | `scripts/migrate-supabase-to-neon.mjs` |

## 1. Create the Neon database

1. Sign up at <https://neon.tech> and create a project (the free plan is enough).
2. **Connect** → copy the connection string.
3. Copy `.env.example` to `.env.local` at the repo root and paste it as `DATABASE_URL`.
4. Create the tables:
   ```bash
   npm install
   npm run db:schema
   ```

## 2. Create the Google sign-in client

1. Google Cloud Console → **APIs & Services → Credentials → Create credentials → OAuth client ID**
   (type: *Web application*).
2. **Authorized redirect URIs** — add both:
   - `http://localhost:5173/api/auth/callback/google`
   - `https://<your-vercel-domain>/api/auth/callback/google`
3. Put the client ID and secret in `.env.local` as `AUTH_GOOGLE_ID` and `AUTH_GOOGLE_SECRET`.
4. Generate a session secret and save it as `AUTH_SECRET`:
   ```bash
   npx auth secret
   ```

## 3. Move your existing data from Supabase (one time)

Skip this if you're starting fresh.

1. Supabase dashboard → **Connect** → copy the **Session pooler** URI (the direct
   `db.<ref>.supabase.co` host is IPv6-only and often unreachable). Put it in `.env.local` as
   `SUPABASE_DB_URL`.
2. Run:
   ```bash
   npm run migrate:neon
   ```

What it does:
- Copies profiles, movies, ratings, follows, Top 5s, watchlists, reactions, comments and
  recommendation feedback, **keeping every id** so all links survive.
- Copies each person's Google email from Supabase Auth onto their profile. When they sign in
  with Google through Auth.js they're matched by that email and land on their existing profile.
- Converts the old `top5` array table to `top5_items` if you still have it.
- Checks the id column types first and stops without writing anything if they don't match.
- Runs in one transaction (all or nothing) and can be re-run safely. Supabase is only read.

If it lists profiles with no email (their Supabase login was deleted), set `profiles.email`
for them in Neon's SQL editor if they should be able to sign in.

After everyone has signed in successfully you can delete `SUPABASE_DB_URL` and shut the
Supabase project down.

## 4. Run locally

Two terminals:

```bash
# repo root: API functions on :3000
npx vercel dev

# apps/web: the app on :5173 (proxies /api to :3000)
cd apps/web && npm run dev
```

Open <http://localhost:5173> and choose **Continue with Google**.

## 5. Deploy on Vercel

Add these under **Settings → Environment Variables**: `DATABASE_URL`, `AUTH_SECRET`,
`AUTH_GOOGLE_ID`, `AUTH_GOOGLE_SECRET`, `TMDB_API_KEY`. Remove the old `VITE_SUPABASE_*` ones.
`vercel.json` routes `/api/auth/*` and `/api/app/*` to their functions; the project runs on
Node 24 (set in the root `package.json`).

## Who can do what

Supabase enforced this with row-level security; now `api/app.ts` does:

- Anyone signed in can see profiles, ratings, Top 5s, watchlists, follows, reactions and comments.
- Only you can change your ratings, Top 5, watchlist, reactions, follows, profile and hidden
  recommendations.
- A comment can be deleted by whoever wrote it or by the owner of the rating it's on.

## Troubleshooting

**Sign-in returns to the login page with an error** — the redirect URI in Google Cloud must match
exactly, including the port. Check `AUTH_SECRET` is set.

**"Sign in to continue" on every request** — the session cookie isn't reaching the API. Make sure
you open the app on `localhost:5173` (not `127.0.0.1`) and that `npx vercel dev` is running.

**"Your feed didn't load"** — `DATABASE_URL` is missing or wrong, or `npm run db:schema` wasn't run.

**Search or posters fail** — `TMDB_API_KEY` is missing.

The old `supabase/migrations` folder is kept for history only; `db/schema.sql` is now the source
of truth.
