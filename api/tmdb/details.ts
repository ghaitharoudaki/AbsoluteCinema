import type { VercelRequest, VercelResponse } from '@vercel/node'

const TMDB_BASE_URL = 'https://api.themoviedb.org/3'
const IMG_BASE = 'https://image.tmdb.org/t/p/w185'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const { tmdb_id, media_type } = req.query

  if (!tmdb_id || (media_type !== 'movie' && media_type !== 'tv')) {
    return res.status(400).json({ error: 'Missing or invalid tmdb_id / media_type' })
  }

  const apiKey = process.env.TMDB_API_KEY
  if (!apiKey) {
    return res.status(500).json({ error: 'TMDB API key not configured' })
  }

  try {
    const url = `${TMDB_BASE_URL}/${media_type}/${tmdb_id}?api_key=${apiKey}&append_to_response=videos,credits`
    const response = await fetch(url)

    if (!response.ok) {
      return res.status(response.status).json({ error: 'TMDB request failed' })
    }

    const data = await response.json()

    const trailer =
      data.videos?.results?.find((v: any) => v.type === 'Trailer' && v.site === 'YouTube') ||
      data.videos?.results?.find((v: any) => v.site === 'YouTube')

    const genres = (data.genres || []).map((g: any) => g.name)

    const cast = (data.credits?.cast || []).slice(0, 6).map((c: any) => ({
      name: c.name,
      character: c.character,
      photo: c.profile_path ? `${IMG_BASE}${c.profile_path}` : null,
    }))

    const base = {
      overview: data.overview || null,
      genres,
      vote_average: data.vote_average ?? null,
      vote_count: data.vote_count ?? null,
      trailer_key: trailer?.key ?? null,
      cast,
    }

    if (media_type === 'movie') {
      return res.status(200).json({
        ...base,
        runtime_minutes: data.runtime ?? null,
        episode_run_time: null,
        number_of_episodes: null,
        release_date: data.release_date || null,
        budget: data.budget || null,
        revenue: data.revenue || null,
      })
    }

    const avgEpisodeRuntime =
      Array.isArray(data.episode_run_time) && data.episode_run_time.length > 0
        ? data.episode_run_time[0]
        : null

    return res.status(200).json({
      ...base,
      runtime_minutes: null,
      episode_run_time: avgEpisodeRuntime,
      number_of_episodes: data.number_of_episodes ?? null,
      release_date: data.first_air_date || null,
      budget: null,
      revenue: null,
    })
  } catch (err) {
    console.error('TMDB details proxy error:', err)
    return res.status(500).json({ error: 'Internal server error' })
  }
}