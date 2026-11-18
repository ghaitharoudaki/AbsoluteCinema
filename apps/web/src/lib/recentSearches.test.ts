import { test } from 'node:test'
import assert from 'node:assert/strict'
import { addRecent, MAX_RECENT } from './recentSearches.ts'

const t = (id: number, media_type: 'movie' | 'tv' = 'movie') => ({ tmdb_id: id, title: `T${id}`, poster_path: null, release_year: null, media_type })

test('newest first, no duplicates', () => {
  const list = addRecent(addRecent(addRecent([], t(1)), t(2)), t(1))
  assert.deepEqual(list.map((x) => x.tmdb_id), [1, 2])
})

test('a film and a series with the same id are different titles', () => {
  const list = addRecent(addRecent([], t(5, 'movie')), t(5, 'tv'))
  assert.equal(list.length, 2)
})

test('keeps at most MAX_RECENT', () => {
  let list: ReturnType<typeof addRecent> = []
  for (let i = 0; i < MAX_RECENT + 4; i++) list = addRecent(list, t(i))
  assert.equal(list.length, MAX_RECENT)
  assert.equal(list[0].tmdb_id, MAX_RECENT + 3)
})
