import type { VercelRequest, VercelResponse } from '@vercel/node'

const TMDB_BASE_URL = 'https://api.themoviedb.org/3'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const apiKey = process.env.TMDB_API_KEY
  if (!apiKey) {
    return res.status(500).json({ error: 'TMDB API key not configured' })
  }

  try {
    const params = `api_key=${apiKey}&language=en-US&page=1&region=US`
    const [nowPlayingResponse, trendingResponse, popularResponse, upcomingResponse] = await Promise.all([
      fetch(`${TMDB_BASE_URL}/movie/now_playing?${params}`),
      fetch(`${TMDB_BASE_URL}/trending/movie/week?${params}`),
      fetch(`${TMDB_BASE_URL}/movie/popular?${params}`),
      fetch(`${TMDB_BASE_URL}/movie/upcoming?${params}`),
    ])

    if (!nowPlayingResponse.ok || !trendingResponse.ok || !popularResponse.ok || !upcomingResponse.ok) {
      return res.status(502).json({ error: 'TMDB request failed' })
    }

    const nowPlaying = await nowPlayingResponse.json()
    const trending = await trendingResponse.json()
    const popular = await popularResponse.json()
    const upcoming = await upcomingResponse.json()
    const movies = [...(nowPlaying.results || []), ...(trending.results || []), ...(popular.results || []), ...(upcoming.results || [])]
    const uniqueMovies = Array.from(new Map(movies.map((movie: any) => [movie.id, movie])).values())
      .sort((a: any, b: any) => (b.popularity || 0) - (a.popularity || 0))
    const results = uniqueMovies.slice(0, 12).map((movie: any) => ({
      tmdb_id: movie.id,
      title: movie.title,
      poster_path: movie.poster_path,
      release_year: (movie.release_date || '').slice(0, 4) || null,
      media_type: 'movie',
    }))

    res.setHeader('Cache-Control', 's-maxage=1800, stale-while-revalidate')
    return res.status(200).json({ results })
  } catch (err) {
    console.error('TMDB box office proxy error:', err)
    return res.status(500).json({ error: 'Internal server error' })
  }
}
