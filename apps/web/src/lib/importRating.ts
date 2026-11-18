export type ImportProvider = 'letterboxd' | 'simkl'

/**
 * Converts a rating from an import file onto the app's 0.5–10 scale (half steps).
 * Letterboxd exports stars out of 5, so they are doubled; Simkl already scores out of 10.
 * Returns null when there is no usable rating.
 */
export function normalizeImportedRating(value: number, provider: ImportProvider): number | null {
  if (!Number.isFinite(value) || value <= 0) return null
  const outOfTen = provider === 'letterboxd' ? value * 2 : value
  const halfStep = Math.round(outOfTen * 2) / 2
  return Math.min(10, Math.max(0.5, halfStep))
}
