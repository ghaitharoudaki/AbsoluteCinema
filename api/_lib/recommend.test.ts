import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mulberry32, rankCandidates, sampleSeeds, type Seed } from './recommend.ts'

const seed = (id: number, weight: number, media_type: 'movie' | 'tv' = 'movie'): Seed => ({ tmdb_id: id, media_type, title: `T${id}`, weight })
const item = (id: number, extra: Record<string, unknown> = {}) => ({ id, title: `R${id}`, poster_path: `/p${id}.jpg`, release_date: '2020-01-01', popularity: 10, ...extra })

test('sampleSeeds picks distinct seeds and is repeatable for the same shuffle', () => {
  const pool = [seed(1, 10), seed(2, 9), seed(3, 8), seed(4, 8), seed(5, 7), seed(6, 7), seed(7, 7), seed(8, 6)]
  const a = sampleSeeds(pool, 5, mulberry32(1))
  const b = sampleSeeds(pool, 5, mulberry32(1))
  assert.equal(a.length, 5)
  assert.equal(new Set(a.map((s) => s.tmdb_id)).size, 5)
  assert.deepEqual(a, b)
})

test('different shuffles give a different seed set (Show other picks changes the row)', () => {
  const pool = Array.from({ length: 20 }, (_, i) => seed(i + 1, 8))
  const sets = new Set([0, 1, 2, 3, 4].map((n) => sampleSeeds(pool, 5, mulberry32(n)).map((s) => s.tmdb_id).sort().join(',')))
  assert.ok(sets.size >= 4)
})

test('sampleSeeds returns the whole pool when it is small, and dedupes by type and id', () => {
  const pool = [seed(1, 9), seed(1, 9), seed(1, 9, 'tv')]
  assert.equal(sampleSeeds(pool, 5, mulberry32(3)).length, 2)
})

test('titles recommended by several seeds rank above one-off matches', () => {
  const picks = rankCandidates(
    [
      { seed: seed(1, 9), results: [item(100), item(200)] },
      { seed: seed(2, 9), results: [item(300), item(200)] },
    ],
    new Set(),
    10,
  )
  assert.equal(picks[0].tmdb_id, 200)
})

test('excluded, posterless and duplicate-seed titles are dropped; movie and tv ids stay separate', () => {
  const picks = rankCandidates(
    [
      { seed: seed(1, 9), results: [item(100), item(101, { poster_path: null }), item(1), item(102)] },
      { seed: seed(5, 8, 'tv'), results: [item(100, { title: undefined, release_date: undefined, name: 'Show 100', first_air_date: '2019-05-01' })] },
    ],
    new Set(['movie:102']),
    10,
  )
  const keys = picks.map((p) => `${p.media_type}:${p.tmdb_id}`)
  assert.deepEqual(keys.sort(), ['movie:100', 'tv:100'])
  assert.equal(picks.find((p) => p.media_type === 'tv')?.title, 'Show 100')
  assert.equal(picks.find((p) => p.media_type === 'tv')?.release_year, '2019')
})

test('the first picks draw from several favourites, not one seed list', () => {
  const picks = rankCandidates(
    [
      { seed: seed(1, 10), results: Array.from({ length: 20 }, (_, i) => item(100 + i)) },
      { seed: seed(2, 8), results: Array.from({ length: 20 }, (_, i) => item(200 + i)) },
      { seed: seed(3, 8), results: Array.from({ length: 20 }, (_, i) => item(300 + i)) },
    ],
    new Set(),
    24,
  )
  assert.equal(new Set(picks.slice(0, 6).map((p) => p.because)).size, 3)
})

test('because names the seed that contributed most, and the limit is respected', () => {
  const picks = rankCandidates(
    [
      { seed: seed(1, 6), results: [item(100)] },
      { seed: seed(2, 10), results: [item(100), ...Array.from({ length: 30 }, (_, i) => item(500 + i))] },
    ],
    new Set(),
    12,
  )
  assert.equal(picks.length, 12)
  assert.equal(picks[0].because, 'T2')
})
