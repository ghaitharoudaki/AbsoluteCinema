# Separate pages, profile photo, UX polish — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Split the one-page home into Home / Discover / Library / Profile, add device photo upload, and polish UX.

**Architecture:** A shared `AppShell` (NavBar + mobile tab bar + toasts + log-flow dialogs) wraps every signed-in route. Pages own their data. Avatars are resized in the browser and stored as base64 in a new `avatars` table, served by `/api/app/avatars/:id`.

**Tech Stack:** React 19, react-router-dom 7, Tailwind 3 (CSS-variable tokens), Vercel function on Neon, `node --test`.

**Spec:** `docs/superpowers/specs/2026-11-18-pages-avatar-design.md`

## Global Constraints
- Accept image files ≤ 5 MB (5 * 1024 * 1024 bytes); JPEG, PNG, WebP, HEIC-if-browser-decodes.
- Uploaded avatar: 512×512 WebP (JPEG fallback), server rejects decoded payloads > 600 000 bytes.
- `avatar_url` value for uploads: `/api/app/avatars/<profileId>?v=<epochMs>`.
- Copy: sentence case, verb + noun buttons, no "OK".
- Reuse tokens (`canvas surface raised line ink brand`), `.ticket`, `.rail`, `.skeleton`.

## Review Focus
- File over 5 MB or not an image → inline error naming the limit, nothing uploaded.
- Saving the profile form without touching the photo must not wipe or reject an uploaded `/api/app/...` avatar.
- Library for a user with zero ratings → each tab shows its own empty state with a way forward.
- `/` shortcut must not fire while typing in an input/textarea or with a dialog open.
- Undo after "Not interested" restores the card and deletes the feedback row.

---

### Task 1: Avatar storage and API
**Files:** Create `api/_lib/avatar.ts`, `api/_lib/avatar.test.ts`; Modify `api/app.ts` (routes, updateProfile, handle), `db/schema.sql`.
**Produces:** `parseAvatarDataUrl(dataUrl: string): { mime: 'image/webp'|'image/jpeg'|'image/png'; base64: string }` (throws `Error` with user copy); routes `PUT avatar` → `{ profile }`, `DELETE avatar` → `{ profile }`, `GET avatars/:id` → image Response; `DELETE recommendation-feedback/:tmdbId`.
- [ ] Test: valid webp data URL parses; wrong mime, magic-byte mismatch, > 600 000 decoded bytes, non-data-URL all throw.
- [ ] Implement; schema `avatars(user_id uuid PK → profiles ON DELETE CASCADE, mime text, data_b64 text, updated_at timestamptz)`; handlers may return a `Response`, passed through untouched. updateProfile accepts http(s) or `/api/app/avatars/` URLs and leaves `avatar_url` unchanged when the key is absent.
- [ ] `npm test` passes; `npm run db:schema` applies.

### Task 2: Client image helpers
**Files:** Create `apps/web/src/lib/avatarImage.ts`, `apps/web/src/lib/avatarImage.test.ts`.
**Produces:** `MAX_AVATAR_BYTES = 5*1024*1024`; `validateAvatarFile(f: {size:number,type:string}): string | null`; `cropRect(w:number,h:number,zoom:number,panX:number,panY:number): {sx,sy,size}` (pan in −1..1); `renderAvatar(img: HTMLImageElement, rect, out=512): Promise<string>` (data URL).
- [ ] Test validate (size limit, non-image) and cropRect (square centred at zoom 1, clamped at pan ±1, smaller at zoom 2).

### Task 3: Library helpers
**Files:** Create `apps/web/src/lib/library.ts`, `library.test.ts`.
**Produces:** `groupByMonth<T extends {watched_date: string|null}>(rows: T[]): { key: string; label: string; items: T[] }[]` (undated last, label "No date"); `pickRandom<T>(items: T[], rand = Math.random): T | null`.

### Task 4: Shell
**Files:** Create `components/AppShell.tsx`, `lib/LogFlow.tsx`, `lib/Toast.tsx`, `lib/usePageTitle.ts`, `components/PosterRail.tsx`, `components/Avatar.tsx`; Modify `NavBar.tsx`, `App.tsx`.
**Produces:** `useLogFlow(): { openSearch(): void; openTitle(m: SearchResult): void; version: number }` (version bumps after any save); `useToast(): (msg: string, opts?: { action?: { label: string; onClick(): void } }) => void`; `usePageTitle(title: string)`; `<PosterRail title subtitle items emptyText action onHide showScore seeAllTo? grid? />`.
- `/` opens search unless focus is in a field or a dialog is open. Mobile bottom tab bar: Home, Discover, Log (centre), Library, Profile. Scroll to top on route change.

### Task 5: Pages
**Files:** Create `pages/Home.tsx`, `pages/Discover.tsx`, `pages/Library.tsx`; Modify `pages/Profile.tsx`, delete `pages/Dashboard.tsx`.
- Home: greeting hero, ContinueWatching, feed + group favorite, teaser link to Discover.
- Discover: three rails; `?see=theaters|picks|friends` shows that row as a grid.
- Library: tabs `?tab=watched|diary|watchlist`; Watched = MovieShelf filters; Diary = groupByMonth timeline; Watchlist with "Pick for me" spotlight and Undo on remove.
- Profile: drop Watched/Watchlist shelves (link to Library when own), edit dialog gets `AvatarPicker`.

### Task 6: AvatarPicker
**Files:** Create `components/AvatarPicker.tsx`.
- Drop zone + file button, inline error from `validateAvatarFile`, circular preview with zoom slider and drag-to-pan, "Save photo" → `PUT avatar`, "Remove photo" → `DELETE avatar`, toast "Profile photo updated".

### Task 7: Verify
- [ ] `npm test`, `npx tsc -b`, `vite build`, browser pass at 1280 and 375 px, commit.
