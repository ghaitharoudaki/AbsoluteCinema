import type { VercelRequest, VercelResponse } from '@vercel/node'

const TMDB_BASE_URL = 'https://api.themoviedb.org/3'

/** Episode list for one season of a series: GET /api/tmdb/season?tmdb_id=1396&season=2 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const tmdbId = Number(req.query.tmdb_id)
  const season = Number(req.query.season)
  if (!Number.isInteger(tmdbId) || tmdbId <= 0 || !Number.isInteger(season) || season < 0 || season > 500) {
    return res.status(400).json({ error: 'Missing or invalid tmdb_id / season' })
  }

  const apiKey = process.env.TMDB_API_KEY
  if (!apiKey) {
    return res.status(500).json({ error: 'TMDB API key not configured' })
  }

  try {
    const response = await fetch(`${TMDB_BASE_URL}/tv/${tmdbId}/season/${season}?api_key=${apiKey}`)
    if (!response.ok) {
      return res.status(response.status).json({ error: 'TMDB request failed' })
    }
    const data = await response.json()
    const episodes = (data.episodes || []).map((e: any) => ({
      episode_number: e.episode_number,
      name: e.name || null,
      runtime: e.runtime ?? null,
      air_date: e.air_date || null,
      still_path: e.still_path || null,
    }))
    // Season lists rarely change; let the CDN keep them for a few hours.
    res.setHeader('Cache-Control', 'public, s-maxage=21600, stale-while-revalidate=86400')
    return res.status(200).json({ season_number: data.season_number ?? season, episodes })
  } catch (err) {
    console.error('TMDB season proxy error:', err)
    return res.status(500).json({ error: 'Internal server error' })
  }
}
