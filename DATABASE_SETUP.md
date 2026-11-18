# Database Setup Guide

The app now has the complete backend wired up. Here's how to apply the database migrations:

## Step 1: Verify Supabase Connection

Make sure your `.env.local` (or `.env`) has your Supabase credentials:
```
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
```

## Step 2: Apply Migrations

You have two options:

### Option A: Using Supabase CLI (Recommended)

1. **Install/update Supabase CLI:**
   ```bash
   npm install -g supabase
   # or if you already have it:
   supabase --version
   ```

2. **Link your project to Supabase:**
   ```bash
   supabase link --project-ref your-project-ref
   ```
   (Find your project ref at https://app.supabase.com/project/[project-ref]/settings)

3. **Push the migrations:**
   ```bash
   supabase db push
   ```
   This will automatically run both `00001_initial_schema.sql` and `00002_rpc_functions.sql`.

### Option B: Manual via Supabase Dashboard

1. Go to https://app.supabase.com
2. Select your project
3. Go to **SQL Editor**
4. Click **New Query**
5. Copy the contents of `supabase/migrations/00001_initial_schema.sql`
6. Click **Run**
7. Repeat for `supabase/migrations/00002_rpc_functions.sql`

## Step 3: Create a Test Profile (One-time only)

When you first log in via Google OAuth, the app auto-creates a profile. But to test, you can manually create one:

```sql
-- Run this in Supabase SQL Editor to create a test user profile
INSERT INTO profiles (id, username, display_name, avatar_url)
VALUES (
  auth.uid(),  -- This gets YOUR logged-in user's ID
  'you',
  'Your Name',
  'https://example.com/avatar.jpg'
)
ON CONFLICT (id) DO NOTHING;
```

## Step 4: Start the Dev Server

```bash
cd apps/web
npm install  # if you haven't already
npm run dev
```

Then:
1. Go to http://localhost:5173
2. Click **Continue with Google**
3. Search for a movie (try "Inception" or "The Matrix")
4. Rate it 1-10
5. Click **Save rating**
6. Return to home — you should see the movie in your dashboard!

## What's Now Functional

✅ **Search movies** — Uses TMDB API to find movies/shows  
✅ **Rate movies** — 1-10 slider, optional review text, watched date  
✅ **Dashboard** — Shows:
- Logged titles count
- Recent activity feed
- Poster grid of what the squad is watching
- Featured movie spotlight
- Stats: recent findings, hot takes count

✅ **Database** — Fully relational schema with:
- User profiles (auto-synced with Google OAuth)
- Movies (TMDB metadata cached)
- Ratings (unique per user-movie pair)
- RLS policies (only authenticated users can view/edit)
- RPC functions for aggregations

## Troubleshooting

**"get_featured_movie is not a function"** or RPC error:
- Migrations didn't apply. Run `supabase db push` or manually run `00002_rpc_functions.sql` in the SQL Editor.

**Can't save ratings:**
- Check the browser console (F12) for error messages
- Verify you're logged in (check Supabase Auth dashboard)
- Make sure migrations were fully applied

**Movies not showing in search:**
- Check that TMDB_API_KEY is set in `.env`
- Check browser console for fetch errors
- Verify the API endpoint `/api/tmdb/search` is being hit (Network tab in DevTools)

**See "Cannot GET /api/tmdb/search":**
- You need to deploy the `api/` folder to Vercel, or use a local proxy
- For local development, you may need to set up environment variables differently

## Next Steps (Features to Build)

Once this is working, the roadmap is:
1. **Browse page** (`/browse`) — Grid of all group movies with filters
2. **Profile page** (`/profile/:username`) — User profile, Top 5, stats
3. **Hot Take detector** — Flag ratings ≥3 points off group average
4. **Prediction game** — Guess group average before rating
5. **Compatibility %** — See how much your taste aligns with each friend
6. ...and 9 more features in the project brief

See `copilot-instructions.md` section 6 for the full feature roadmap.
