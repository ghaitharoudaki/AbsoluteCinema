import { api } from './api'
import { episodeKey, type EpisodeInfo, type EpisodeRef } from './episodeProgress'

export * from './episodeProgress'

const seasonCache = new Map<string, Promise<EpisodeInfo[]>>()

/** Episode list for one season from TMDB (cached per page load). */
export function fetchSeason(tmdbId: number, season: number): Promise<EpisodeInfo[]> {
  const key = `${tmdbId}:${season}`
  const cached = seasonCache.get(key)
  if (cached) return cached
  const request = fetch(`/api/tmdb/season?tmdb_id=${tmdbId}&season=${season}`)
    .then(async (res) => {
      if (!res.ok) throw new Error(`Season request failed (${res.status})`)
      return ((await res.json()) as { episodes: EpisodeInfo[] }).episodes
    })
    .catch((error) => {
      seasonCache.delete(key) // let the next attempt retry
      throw error
    })
  seasonCache.set(key, request)
  return request
}

export async function fetchWatchedEpisodes(movieId: string): Promise<Set<string>> {
  const { episodes } = await api<{ episodes: EpisodeRef[] }>(`episodes/${movieId}`)
  return new Set(episodes.map((e) => episodeKey(e.season, e.episode)))
}

export function saveEpisodes(movieId: string, watched: boolean, episodes: Array<EpisodeRef & { runtime?: number | null }>) {
  return api('episodes', { method: 'PUT', body: { movie_id: movieId, watched, episodes } })
}
