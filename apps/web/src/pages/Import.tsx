import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { usePageTitle } from '../lib/usePageTitle'
import { useAuth } from '../lib/AuthContext'
import { api, ApiError } from '../lib/api'
import { ensureMovieInDb } from '../lib/movies'
import { normalizeImportedRating } from '../lib/importRating'
import type { SearchResult } from '../components/MovieSearch'

interface ImportRow {
  name: string
  year: number | null
  rating: number | null
  watchedDate: string | null
  source: 'rating' | 'watchlist'
  provider: 'letterboxd' | 'simkl'
  match: SearchResult | null
  matchState: 'pending' | 'matched' | 'unmatched'
}

interface ImportSummary {
  ratings: number
  watchlist: number
  skipped: number
}

function parseCsv(text: string): Record<string, string>[] {
  const rows: string[][] = []
  let row: string[] = []
  let value = ''
  let quoted = false

  for (let index = 0; index < text.length; index += 1) {
    const character = text[index]
    const next = text[index + 1]
    if (character === '"' && quoted && next === '"') {
      value += '"'
      index += 1
    } else if (character === '"') {
      quoted = !quoted
    } else if (character === ',' && !quoted) {
      row.push(value)
      value = ''
    } else if ((character === '\n' || character === '\r') && !quoted) {
      if (character === '\r' && next === '\n') index += 1
      row.push(value)
      if (row.some((cell) => cell.trim())) rows.push(row)
      row = []
      value = ''
    } else {
      value += character
    }
  }

  if (value || row.length) {
    row.push(value)
    rows.push(row)
  }

  const headers = (rows.shift() ?? []).map((header) => header.trim())
  return rows.map((cells) => Object.fromEntries(headers.map((header, index) => [header, (cells[index] ?? '').trim()])))
}

function rowsFromJson(text: string): Record<string, string>[] {
  const parsed: unknown = JSON.parse(text)
  const values = Array.isArray(parsed) ? parsed : Object.values(parsed as Record<string, unknown>).find(Array.isArray)
  if (!Array.isArray(values)) return []
  return values.flatMap((value) => {
    if (!value || typeof value !== 'object') return []
    return [Object.fromEntries(Object.entries(value).map(([key, item]) => [key, item == null ? '' : String(item)]))]
  })
}

function getField(row: Record<string, string>, names: string[]) {
  const entries = Object.entries(row)
  const found = entries.find(([key, value]) => names.includes(key.toLowerCase()) && value.trim())
  return found?.[1].trim() ?? ''
}

function rowsFromFile(
  text: string,
  source: ImportRow['source'],
  provider: ImportRow['provider'],
): Omit<ImportRow, 'match' | 'matchState'>[] {
  const records = text.trimStart().startsWith('{') || text.trimStart().startsWith('[') ? rowsFromJson(text) : parseCsv(text)
  return records.flatMap((row) => {
    const name = getField(row, ['name', 'title', 'show', 'movie', 'film'])
    if (!name) return []
    const parsedRating = Number.parseFloat(getField(row, ['rating', 'user_rating', 'score', 'my_rating']))
    const parsedYear = Number.parseInt(getField(row, ['year', 'release_year']), 10)
    const rawDate = getField(row, ['date', 'watched_date', 'watched_at', 'last_watched_at'])
    const date = rawDate.match(/^\d{4}-\d{2}-\d{2}/)?.[0] ?? null
    return [{
      name,
      year: Number.isFinite(parsedYear) ? parsedYear : null,
      rating: source === 'rating' ? normalizeImportedRating(parsedRating, provider) : null,
      watchedDate: source === 'rating' ? date : null,
      source,
      provider,
    }]
  })
}

async function findMovie(name: string, year: number | null): Promise<SearchResult | null> {
  const response = await fetch(`/api/tmdb/search?query=${encodeURIComponent(name)}`)
  if (!response.ok) return null
  const data = await response.json() as { results?: SearchResult[] }
  const results = data.results ?? []
  const normalized = name.toLowerCase().replace(/[^a-z0-9]/g, '')
  return results.find((result) => {
    const resultName = result.title.toLowerCase().replace(/[^a-z0-9]/g, '')
    return resultName === normalized && (!year || result.release_year === String(year))
  }) ?? results.find((result) => result.title.toLowerCase().replace(/[^a-z0-9]/g, '') === normalized) ?? null
}

export default function Import() {
  usePageTitle('Import')
  const { user } = useAuth()
  const [profileUsername, setProfileUsername] = useState<string | null>(null)
  const [rows, setRows] = useState<ImportRow[]>([])
  const [matching, setMatching] = useState(false)
  const [importing, setImporting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [summary, setSummary] = useState<ImportSummary | null>(null)
  const [provider, setProvider] = useState<ImportRow['provider']>('letterboxd')

  useEffect(() => {
    if (!user) return
    api<{ profile: { username: string } }>('me')
      .then(({ profile }) => setProfileUsername(profile.username))
      .catch(() => setProfileUsername(null))
  }, [user])

  const readFile = (file: File, source: ImportRow['source']) => {
    const reader = new FileReader()
    reader.onload = () => {
      try {
        const parsed = rowsFromFile(String(reader.result ?? ''), source, provider)
      setRows((current) => [...current, ...parsed.map((row) => ({ ...row, match: null, matchState: 'pending' as const }))])
      setSummary(null)
      setError(null)
      } catch {
        setError('That file could not be read. Use a CSV or JSON export from the selected provider.')
      }
    }
    reader.readAsText(file)
  }

  const matchRows = async () => {
    setMatching(true)
    setError(null)
    const nextRows: ImportRow[] = []
    for (const row of rows) {
      try {
        const match = await findMovie(row.name, row.year)
        nextRows.push({ ...row, match, matchState: match ? 'matched' : 'unmatched' })
      } catch {
        nextRows.push({ ...row, match: null, matchState: 'unmatched' })
      }
    }
    setRows(nextRows)
    setMatching(false)
  }

  const applyImport = async () => {
    if (!user) return
    setImporting(true)
    setError(null)
    let ratings = 0
    let watchlist = 0
    let skipped = 0

    try {
      for (const row of rows.filter((item) => item.matchState === 'matched' && item.match)) {
        const movieId = await ensureMovieInDb(row.match!, null, false)
        // 409 means it's already logged (or, for the watchlist, already rated): skip it.
        const isConflict = (error: unknown) => error instanceof ApiError && error.status === 409
        if (row.source === 'rating' && row.rating !== null) {
          try {
            await api('ratings', {
              method: 'POST',
              body: {
                movie_id: movieId,
                rating: row.rating,
                watched_date: row.watchedDate,
                date_type: row.watchedDate ? 'exact' : 'unknown',
                description: `Imported from ${row.provider === 'simkl' ? 'Simkl' : 'Letterboxd'}`,
              },
            })
            ratings += 1
          } catch (error) {
            if (!isConflict(error)) throw error
            skipped += 1
          }
        } else {
          try {
            await api('watchlist', { method: 'POST', body: { movie_id: movieId } })
            watchlist += 1
          } catch (error) {
            if (!isConflict(error)) throw error
            skipped += 1
          }
        }
      }
      skipped += rows.filter((row) => row.matchState === 'unmatched').length
      setSummary({ ratings, watchlist, skipped })
    } catch (importError) {
      console.error(importError)
      setError('The import stopped partway. Titles already added stay added; run it again to finish the rest.')
    } finally {
      setImporting(false)
    }
  }

  const matchedCount = rows.filter((row) => row.matchState === 'matched').length
  const unmatchedCount = rows.filter((row) => row.matchState === 'unmatched').length

  return (
    <div className="mx-auto max-w-5xl px-4 py-12 sm:px-6">
        <div className="max-w-2xl">
          <h1 className="font-display text-[clamp(3rem,8vw,5rem)] font-black uppercase leading-[0.85]">Import your history</h1>
          <p className="mt-4 leading-7 text-ink-muted">
            Bring your ratings and watchlist over from Letterboxd or Simkl. Each title is matched to the movie database first, so you can check the matches before anything is added.
          </p>
          {profileUsername && (
            <p className="mt-3 text-sm">
              <Link to={`/profile/${profileUsername}`} className="font-semibold text-brand underline-offset-2 hover:underline">
                Back to your profile
              </Link>
            </p>
          )}
        </div>

        <ol className="mt-10 space-y-8">
          <li>
            <h2 className="flex items-center gap-3 font-display text-2xl font-extrabold">
              <span className="flex h-8 w-8 items-center justify-center rounded-full bg-brand text-base text-on-brand" aria-hidden="true">1</span>
              Choose the source
            </h2>
            <div className="mt-4 inline-flex gap-1 rounded-full bg-raised p-1" role="radiogroup" aria-label="Source">
              {(['letterboxd', 'simkl'] as const).map((option) => (
                <button
                  key={option}
                  type="button"
                  role="radio"
                  aria-checked={provider === option}
                  onClick={() => setProvider(option)}
                  className={`rounded-full px-5 py-2 text-sm font-semibold transition-colors ${
                    provider === option ? 'bg-surface text-ink shadow-sm' : 'text-ink-muted hover:text-ink'
                  }`}
                >
                  {option === 'simkl' ? 'Simkl' : 'Letterboxd'}
                </button>
              ))}
            </div>
          </li>

          <li>
            <h2 className="flex items-center gap-3 font-display text-2xl font-extrabold">
              <span className="flex h-8 w-8 items-center justify-center rounded-full bg-brand text-base text-on-brand" aria-hidden="true">2</span>
              Add your export files
            </h2>
            <div className="mt-4 grid gap-4 md:grid-cols-2">
              {([
                ['rating', 'Ratings', provider === 'simkl' ? 'Simkl CSV or JSON with ratings' : 'ratings.csv from your Letterboxd export'],
                ['watchlist', 'Watchlist', provider === 'simkl' ? 'Simkl CSV or JSON watchlist' : 'watchlist.csv from your Letterboxd export'],
              ] as const).map(([kind, label, hint]) => (
                <label
                  key={kind}
                  className="group block cursor-pointer rounded-2xl border-2 border-dashed border-line bg-surface p-6 transition-colors focus-within:border-brand hover:border-brand"
                >
                  <span className="block text-lg font-bold">{label}</span>
                  <span className="mt-1 block text-sm text-ink-muted">{hint}</span>
                  <input
                    className="mt-5 block w-full text-sm text-ink-muted file:mr-4 file:rounded-full file:border-0 file:bg-raised file:px-4 file:py-2 file:text-sm file:font-semibold file:text-ink group-hover:file:bg-brand group-hover:file:text-on-brand"
                    type="file"
                    accept=".csv,.json,text/csv,application/json"
                    onChange={(event) => event.target.files?.[0] && readFile(event.target.files[0], kind)}
                  />
                </label>
              ))}
            </div>
          </li>
        </ol>

        {rows.length > 0 && (
          <section className="mt-10 rounded-2xl border border-line bg-surface p-6" aria-labelledby="preview-title">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <h2 id="preview-title" className="font-display text-2xl font-extrabold">Check the matches</h2>
                <p role="status" className="mt-1 text-sm text-ink-muted">{rows.length} titles loaded{matchedCount ? `, ${matchedCount} matched` : ''}{unmatchedCount ? `, ${unmatchedCount} without a match` : ''}</p>
              </div>
              <div className="flex gap-3">
                <button type="button" onClick={() => void matchRows()} disabled={matching || importing} className="rounded-full border border-line px-4 py-2 text-sm font-semibold transition-colors hover:border-ink-muted disabled:cursor-wait disabled:opacity-60">{matching ? 'Matching…' : 'Match titles'}</button>
                <button type="button" onClick={() => void applyImport()} disabled={importing || matching || matchedCount === 0} className="rounded-full bg-brand px-5 py-2 text-sm font-bold text-on-brand transition-colors hover:bg-brand-hover disabled:opacity-50">{importing ? 'Importing…' : matchedCount ? `Import ${matchedCount} matched` : 'Import matched'}</button>
              </div>
            </div>
            <div className="mt-6 max-h-96 overflow-y-auto divide-y divide-line">
              {rows.map((row, index) => (
                <div key={`${row.source}-${row.name}-${index}`} className="flex items-center justify-between gap-4 py-3 font-body text-sm">
                  <span className="truncate">{row.name}{row.year ? ` (${row.year})` : ''}</span>
                  <span className={row.matchState === 'matched' ? 'text-success' : row.matchState === 'unmatched' ? 'text-danger' : 'text-ink-muted'}>{row.matchState === 'matched' ? `Matched to ${row.match?.title}` : row.matchState === 'unmatched' ? 'No match found' : 'Not matched yet'}</span>
                </div>
              ))}
            </div>
          </section>
        )}

        {summary && <p role="status" className="mt-6 rounded-xl bg-success/10 p-4 text-sm font-medium text-success">Imported {summary.ratings} ratings and {summary.watchlist} watchlist titles. {summary.skipped} were skipped because they were already logged or had no match.</p>}
        {error && <p role="alert" className="mt-6 rounded-xl bg-danger/10 p-4 text-sm text-danger">{error}</p>}
    </div>
  )
}
