/*
 * "Picked for you". Each request samples a handful of the user's favourites (weighted by how much
 * they liked them), asks TMDB what's recommended for each, and blends the lists: titles that several
 * favourites point at rise to the top. A different shuffle number samples different favourites, so
 * "Show other picks" really changes the row.
 */

export interface Seed {
  tmdb_id: number
  media_type: 'movie' | 'tv'
  title: string
  /** How strongly this favourite should pull: the rating (Top 5 picks get a bonus). */
  weight: number
}

export interface TmdbItem {
  id: number
  title?: string
  name?: string
  poster_path?: string | null
  release_date?: string
  first_air_date?: string
  popularity?: number
}

export interface Pick {
  tmdb_id: number
  media_type: 'movie' | 'tv'
  title: string
  poster_path: string
  release_year: string | null
  /** Title of the favourite that pulled this in hardest. */
  because: string
}

/** Small seeded PRNG so the same shuffle number always gives the same row. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const key = (mediaType: string, id: number) => `${mediaType}:${id}`

/** Weighted sample without replacement (Efraimidis–Spirakis): higher weight, likelier pick. */
export function sampleSeeds(pool: Seed[], count: number, rand: () => number): Seed[] {
  const unique = new Map<string, Seed>()
  for (const seed of pool) {
    const k = key(seed.media_type, seed.tmdb_id)
    const existing = unique.get(k)
    if (!existing || existing.weight < seed.weight) unique.set(k, seed)
  }
  return [...unique.values()]
    .map((seed) => ({ seed, order: Math.pow(rand() || 1e-9, 1 / Math.max(0.1, seed.weight)) }))
    .sort((a, b) => b.order - a.order)
    .slice(0, count)
    .map(({ seed }) => seed)
}

/**
 * Blends each seed's TMDB list into one ranking. A title earns `weight × position factor` from every
 * list it appears in. `exclude` holds "movie:123"/"tv:456" keys the user has already seen or hidden.
 */
export function rankCandidates(lists: { seed: Seed; results: TmdbItem[] }[], exclude: Set<string>, limit: number): Pick[] {
  const seen = new Set(exclude)
  lists.forEach(({ seed }) => seen.add(key(seed.media_type, seed.tmdb_id)))

  const scored = new Map<string, { pick: Pick; score: number; best: number; popularity: number }>()
  for (const { seed, results } of lists) {
    results.forEach((item, index) => {
      const k = key(seed.media_type, item.id)
      if (seen.has(k) || !item.poster_path) return
      const gain = seed.weight * (1 - Math.min(index, 39) / 40)
      const current = scored.get(k)
      if (current) {
        current.score += gain
        if (gain > current.best) {
          current.best = gain
          current.pick.because = seed.title
        }
        return
      }
      scored.set(k, {
        score: gain,
        best: gain,
        popularity: item.popularity ?? 0,
        pick: {
          tmdb_id: item.id,
          media_type: seed.media_type,
          title: item.title || item.name || 'Untitled',
          poster_path: item.poster_path,
          release_year: (item.release_date || item.first_air_date || '').slice(0, 4) || null,
          because: seed.title,
        },
      })
    })
  }

  // Greedy pick with a diminishing factor per favourite, so one seed's list can't fill the front of the row.
  const remaining = [...scored.values()]
  const taken = new Map<string, number>()
  const out: Pick[] = []
  while (out.length < limit && remaining.length > 0) {
    let bestIndex = 0
    let bestValue = -Infinity
    remaining.forEach((entry, index) => {
      const value = entry.score * Math.pow(0.7, taken.get(entry.pick.because) ?? 0) + entry.popularity * 1e-6
      if (value > bestValue) {
        bestValue = value
        bestIndex = index
      }
    })
    const [chosen] = remaining.splice(bestIndex, 1)
    taken.set(chosen.pick.because, (taken.get(chosen.pick.because) ?? 0) + 1)
    out.push(chosen.pick)
  }
  return out
}
