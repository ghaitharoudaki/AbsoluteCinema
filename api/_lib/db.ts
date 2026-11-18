import { neon, type NeonQueryFunction } from '@neondatabase/serverless'

// Files under api/_lib are shared code, not routes (Vercel skips "_" paths).

let client: NeonQueryFunction<false, false> | null = null

/** Lazily-created Neon HTTP client. One HTTP round trip per query, no pool to manage. */
export function db() {
  if (!client) {
    const url = process.env.DATABASE_URL
    if (!url) throw new Error('DATABASE_URL is not set')
    client = neon(url)
  }
  return client
}

/** Postgres error code (e.g. 23505 unique violation), if the error has one. */
export function pgErrorCode(error: unknown): string | null {
  return typeof error === 'object' && error !== null && 'code' in error ? String((error as { code: unknown }).code) : null
}
