import type { VercelRequest, VercelResponse } from '@vercel/node'

const TMDB_BASE_URL = 'https://api.themoviedb.org/3'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const { tmdb_id, tmdb_ids, media_type } = req.query

  if ((!tmdb_id && !tmdb_ids) || (media_type !== 'movie' && media_type !== 'tv')) {
    return res.status(400).json({ error: 'Missing or invalid tmdb_id / media_type' })
  }

  const apiKey = process.env.TMDB_API_KEY
  if (!apiKey) {
    return res.status(500).json({ error: 'TMDB API key not configured' })
  }

  try {
    const rawIds = tmdb_ids || tmdb_id
    const seedIds = (Array.isArray(rawIds) ? rawIds.join(',') : rawIds)
      .split(',')
      .map((id) => Number(id))
      .filter((id) => Number.isInteger(id))
      .slice(0, 5)

    if (seedIds.length === 0) {
      return res.status(400).json({ error: 'Missing valid TMDB IDs' })
    }

    const responses = await Promise.all(
      seedIds.map((id) =>
        fetch(`${TMDB_BASE_URL}/${media_type}/${id}/recommendations?api_key=${apiKey}&page=1`)
      )
    )

    if (responses.some((response) => !response.ok)) {
      return res.status(502).json({ error: 'TMDB request failed' })
    }

    const lists = await Promise.all(responses.map((response) => response.json()))
    const candidates = new Map<number, { item: any; matches: number }>()
    lists.forEach((data) => {
      ;(data.results || []).forEach((item: any) => {
        const existing = candidates.get(item.id)
        candidates.set(item.id, {
          item,
          matches: (existing?.matches || 0) + 1,
        })
      })
    })

    const results = Array.from(candidates.values())
      .sort((a, b) => (b.matches - a.matches) || ((b.item.popularity || 0) - (a.item.popularity || 0)))
      .slice(0, 12)
      .map(({ item }) => ({
        tmdb_id: item.id,
      title: item.title || item.name,
      poster_path: item.poster_path,
      release_year: (item.release_date || item.first_air_date || '').slice(0, 4) || null,
      media_type,
      }))

    res.setHeader('Cache-Control', 'no-store')
    return res.status(200).json({ results })
  } catch (err) {
    console.error('TMDB recommendations proxy error:', err)
    return res.status(500).json({ error: 'Internal server error' })
  }
}