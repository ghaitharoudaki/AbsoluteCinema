# Separate pages, profile photo upload, UX polish

Approved in chat 2026-11-18 ("yes go and add more features in UI make it very good and admirable").

## Intent
Home is one long page holding every row. Split it into focused pages so each has one job, let people
upload a real profile photo from their device, and raise the overall feel of the app.

## Goals
- Pages: **Home** `/` (continue watching, friends' ratings feed with reactions/comments, group favorite),
  **Discover** `/discover` (In theaters this week, Picked for you, Friends are watching, each with See all),
  **Library** `/library` (Watched / Diary / Watchlist tabs in the URL, filters, sort, search, pick-for-me),
  **Profile** keeps identity, stats, badges, Top 5, rating histogram, tier lists.
- Profile photo: pick or drop an image ≤ 5 MB, crop square with zoom, resized in the browser to 512 px WebP,
  stored in Neon, removable.
- UX: mobile bottom tab bar, toasts with Undo, `/` opens search anywhere, per-page document titles,
  scroll-to-top on navigation, loading/empty/error states per page.

## Non-goals
No new recommendation logic, no external blob storage, no change to rating/series flows.

## Constraints
- Vercel function body limit 4.5 MB → never upload the raw file; resize client-side.
- `profiles.avatar_url` is VARCHAR(500) → store image bytes in a new `avatars` table, keep a versioned
  URL `/api/app/avatars/<id>?v=<ts>` in `avatar_url`.
- Existing stack: React 19, react-router 7, Tailwind 3 tokens, single `/api/app` function on Neon.

## Approaches
1. **Resize in browser, store base64 in an `avatars` table, serve via API** (chosen): no new services,
   ~50 KB per user, cacheable with versioned URL.
2. Vercel Blob: cleaner for big files but needs a new store, token and account setup.
3. Store the raw file: blocked by the 4.5 MB limit and wastes database space.

## Builder's calls
Log flow (search → detail → rate) moves into a shared `LogFlowProvider` so any page and the `/` shortcut
can open it. Library reads the existing `profiles/:username` endpoint for the signed-in user.
