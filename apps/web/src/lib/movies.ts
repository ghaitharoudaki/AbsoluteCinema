import { api } from './api'
import type { SearchResult } from '../components/MovieSearch'

interface MovieDetails {
  runtime_minutes: number | null
  episode_run_time: number | null
  number_of_episodes: number | null
  release_date: string | null
  genres?: string[]
}

const detailsCache = new Map<string, Promise<MovieDetails | null>>()

export async function fetchMovieDetails(
  tmdbId: number,
  mediaType: 'movie' | 'tv'
): Promise<MovieDetails | null> {
  const cacheKey = `${mediaType}:${tmdbId}`
  const cached = detailsCache.get(cacheKey)
  if (cached) return cached

  const request = fetch(`/api/tmdb/details?tmdb_id=${tmdbId}&media_type=${mediaType}`)
    .then(async (res) => (res.ok ? res.json() : null))
    .catch(() => null)
  detailsCache.set(cacheKey, request)

  return request
}

export async function ensureMovieInDb(
  movie: SearchResult,
  details?: MovieDetails | null,
  loadDetails = true
): Promise<string> {
  const resolved = details ?? (loadDetails ? await fetchMovieDetails(movie.tmdb_id, movie.media_type) : null)
  const moviePayload = {
    tmdb_id: movie.tmdb_id,
    title: movie.title,
    poster_path: movie.poster_path,
    release_year: movie.release_year ? parseInt(movie.release_year, 10) : null,
    media_type: movie.media_type,
    runtime_minutes: resolved?.runtime_minutes ?? null,
    episode_run_time: resolved?.episode_run_time ?? null,
    number_of_episodes: resolved?.number_of_episodes ?? null,
    release_date: resolved?.release_date ?? null,
    genres: resolved?.genres ?? null,
  }

  // The server inserts the title if it's new and returns the existing id otherwise.
  const { id } = await api<{ id: string }>('movies', { method: 'POST', body: moviePayload })
  return id
}