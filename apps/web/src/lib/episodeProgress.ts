export interface SeasonInfo {
  season_number: number
  episode_count: number
  name?: string
}

export interface EpisodeInfo {
  episode_number: number
  name: string | null
  runtime: number | null
  air_date: string | null
  still_path: string | null
}

export interface EpisodeRef {
  season: number
  episode: number
}

export const episodeKey = (season: number, episode: number) => `${season}:${episode}`

/**
 * Progress through a series from TMDB season sizes and the set of watched episodes.
 * Season 0 (specials) never counts. "Next up" is the earliest unwatched episode, so a
 * skipped episode is offered before moving on.
 */
export function seriesProgress(seasons: SeasonInfo[], watched: Set<string>) {
  const regular = seasons.filter((s) => s.season_number > 0 && s.episode_count > 0).sort((a, b) => a.season_number - b.season_number)
  let count = 0
  let total = 0
  let nextUp: EpisodeRef | null = null
  for (const season of regular) {
    total += season.episode_count
    for (let episode = 1; episode <= season.episode_count; episode += 1) {
      if (watched.has(episodeKey(season.season_number, episode))) count += 1
      else if (!nextUp) nextUp = { season: season.season_number, episode }
    }
  }
  return { watched: count, total, nextUp, complete: total > 0 && count === total }
}

export const formatEpisode = ({ season, episode }: EpisodeRef) =>
  `S${String(season).padStart(2, '0')}E${String(episode).padStart(2, '0')}`
