import { test } from 'node:test'
import assert from 'node:assert/strict'
import { episodeKey, seriesProgress } from './episodeProgress.ts'

const seasons = [
  { season_number: 0, episode_count: 3 }, // specials: shown, never counted
  { season_number: 1, episode_count: 3 },
  { season_number: 2, episode_count: 2 },
]

test('nothing watched: next up is S1E1', () => {
  assert.deepEqual(seriesProgress(seasons, new Set()), { watched: 0, total: 5, nextUp: { season: 1, episode: 1 }, complete: false })
})

test('next up is the first gap, not the episode after the latest one', () => {
  const watched = new Set([episodeKey(1, 1), episodeKey(1, 3)])
  assert.deepEqual(seriesProgress(seasons, watched).nextUp, { season: 1, episode: 2 })
})

test('rolls over into the next season', () => {
  const watched = new Set([episodeKey(1, 1), episodeKey(1, 2), episodeKey(1, 3)])
  assert.deepEqual(seriesProgress(seasons, watched).nextUp, { season: 2, episode: 1 })
})

test('specials do not count toward progress or completion', () => {
  const watched = new Set([episodeKey(0, 1), episodeKey(1, 1), episodeKey(1, 2), episodeKey(1, 3), episodeKey(2, 1), episodeKey(2, 2)])
  assert.deepEqual(seriesProgress(seasons, watched), { watched: 5, total: 5, nextUp: null, complete: true })
})

test('no season info yet: zero total, no next up, not complete', () => {
  assert.deepEqual(seriesProgress([], new Set([episodeKey(1, 1)])), { watched: 0, total: 0, nextUp: null, complete: false })
})
