import type { VercelRequest, VercelResponse } from '@vercel/node'

const TMDB_BASE_URL = 'https://api.themoviedb.org/3'

interface TmdbResult {
  id: number
  title?: string        // movies
  name?: string          // tv shows
  poster_path: string | null
  release_date?: string   // movies
  first_air_date?: string // tv shows
  media_type: 'movie' | 'tv'
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const { query } = req.query

  if (!query || typeof query !== 'string' || query.trim().length === 0) {
    return res.status(400).json({ error: 'Missing query parameter' })
  }

  const apiKey = process.env.TMDB_API_KEY
  if (!apiKey) {
    return res.status(500).json({ error: 'TMDB API key not configured' })
  }

  try {
    const url = `${TMDB_BASE_URL}/search/multi?api_key=${apiKey}&query=${encodeURIComponent(
      query
    )}&include_adult=false`

    const response = await fetch(url)

    if (!response.ok) {
      return res.status(response.status).json({ error: 'TMDB request failed' })
    }

    const data = await response.json()

    // Filter to only movies and TV shows (search/multi also returns people),
    // and normalize the shape so the frontend doesn't need to branch on media_type
    const results = (data.results as TmdbResult[])
      .filter((item) => item.media_type === 'movie' || item.media_type === 'tv')
      .map((item) => ({
        tmdb_id: item.id,
        title: item.title || item.name,
        poster_path: item.poster_path,
        release_year: (item.release_date || item.first_air_date || '').slice(0, 4) || null,
        media_type: item.media_type,
      }))

    // Cache for 1 hour at the edge since search results for the same query rarely change
    res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate')
    return res.status(200).json({ results })
  } catch (err) {
    console.error('TMDB proxy error:', err)
    return res.status(500).json({ error: 'Internal server error' })
  }
}