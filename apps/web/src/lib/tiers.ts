// Tier list layout. A title sits in the band its score earns (S ≥ 9 … F) until the user drags it
// somewhere; then its saved tier and position win. New ratings slot in after the placed ones.

export const TIER_KEYS = ['S', 'A', 'B', 'C', 'D', 'F'] as const
export type TierKey = (typeof TIER_KEYS)[number]

export interface Placeable {
  id: string
  rating: number
  title: string
  tier_override?: TierKey | null
  tier_rank?: number | null
}

export type Layout<T> = Record<TierKey, T[]>

const BANDS: Array<[TierKey, number]> = [
  ['S', 9],
  ['A', 8],
  ['B', 7],
  ['C', 6],
  ['D', 4],
  ['F', 0],
]

export function scoreTier(score: number): TierKey {
  return BANDS.find(([, min]) => score >= min)![0]
}

const emptyLayout = <T>(): Layout<T> => ({ S: [], A: [], B: [], C: [], D: [], F: [] })

export function buildLayout<T extends Placeable>(items: T[]): Layout<T> {
  const layout = emptyLayout<T>()
  for (const item of items) {
    const tier = item.tier_override && TIER_KEYS.includes(item.tier_override) ? item.tier_override : scoreTier(Number(item.rating))
    layout[tier].push(item)
  }
  for (const key of TIER_KEYS) {
    layout[key].sort((a, b) => {
      const ra = a.tier_rank ?? null
      const rb = b.tier_rank ?? null
      if (ra !== null && rb !== null) return ra - rb
      if (ra !== null) return -1
      if (rb !== null) return 1
      return Number(b.rating) - Number(a.rating) || a.title.localeCompare(b.title)
    })
  }
  return layout
}

/** Moves one item to `toTier` at `toIndex` (clamped). Returns a new layout; the input is not changed. */
export function moveInLayout<T extends { id: string }>(layout: Layout<T>, id: string, toTier: TierKey, toIndex: number): Layout<T> {
  let moving: T | undefined
  const next = emptyLayout<T>()
  for (const key of TIER_KEYS) {
    next[key] = layout[key].filter((item) => {
      if (item.id === id) {
        moving = item
        return false
      }
      return true
    })
  }
  if (!moving) return layout
  const target = next[toTier]
  const index = Math.max(0, Math.min(target.length, toIndex))
  next[toTier] = [...target.slice(0, index), moving, ...target.slice(index)]
  return next
}

export function layoutToPayload<T extends { id: string }>(layout: Layout<T>): Record<TierKey, string[]> {
  const out = {} as Record<TierKey, string[]>
  for (const key of TIER_KEYS) out[key] = layout[key].map((item) => item.id)
  return out
}
