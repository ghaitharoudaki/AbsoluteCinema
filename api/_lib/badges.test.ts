import { test } from 'node:test'
import assert from 'node:assert/strict'
import { computeBadges, type BadgeStats } from './badges.ts'

const base: BadgeStats = {
  totalHours: 0,
  topHours: 0,
  maxEpisodesInDay: 0,
  completedSeries: 0,
  ratingCount: 0,
  avgRating: null,
  genreCount: 0,
  decadeCount: 0,
  notesCount: 0,
  followers: 0,
}
const earned = (stats: Partial<BadgeStats>) =>
  computeBadges({ ...base, ...stats }).filter((b) => b.earned).map((b) => b.id)
const badge = (stats: Partial<BadgeStats>, id: string) => computeBadges({ ...base, ...stats }).find((b) => b.id === id)

test('a brand-new profile has earned nothing, and every badge says how to get it', () => {
  const all = computeBadges(base)
  assert.equal(all.filter((b) => b.earned).length, 0)
  assert.ok(all.every((b) => b.description.length > 0))
})

test('Projectionist goes to whoever has the most hours, ties included', () => {
  assert.ok(earned({ totalHours: 120, topHours: 120 }).includes('projectionist'))
  assert.ok(!earned({ totalHours: 119.9, topHours: 120 }).includes('projectionist'))
  assert.ok(!earned({ totalHours: 0, topHours: 0 }).includes('projectionist'), 'nobody is crowned for zero hours')
  assert.match(badge({ totalHours: 80, topHours: 120 }, 'projectionist')!.progress!, /40h behind/)
})

test('only the highest hour milestone is shown, with progress to the next', () => {
  assert.equal(badge({ totalHours: 10 }, 'hours')!.name, 'Matinee')
  assert.equal(badge({ totalHours: 10 }, 'hours')!.earned, false)
  assert.equal(badge({ totalHours: 10 }, 'hours')!.progress, '10 / 50 hours')
  assert.equal(badge({ totalHours: 120 }, 'hours')!.name, 'Double Feature')
  assert.equal(badge({ totalHours: 120 }, 'hours')!.earned, true)
  assert.equal(badge({ totalHours: 120 }, 'hours')!.progress, '120 / 250 hours to Marathoner')
  assert.equal(badge({ totalHours: 900 }, 'hours')!.name, 'Legend of the Dark')
  assert.equal(computeBadges({ ...base, totalHours: 900 }).filter((b) => b.id === 'hours').length, 1)
})

test('critic badges need at least 20 ratings', () => {
  assert.ok(!earned({ ratingCount: 19, avgRating: 3 }).includes('harsh-critic'))
  assert.ok(earned({ ratingCount: 20, avgRating: 5 }).includes('harsh-critic'))
  assert.ok(earned({ ratingCount: 20, avgRating: 8.5 }).includes('easy-to-please'))
  assert.ok(!earned({ ratingCount: 20, avgRating: 7 }).some((id) => id === 'harsh-critic' || id === 'easy-to-please'))
})

test('the rest unlock at their thresholds', () => {
  assert.deepEqual(
    earned({ ratingCount: 1, maxEpisodesInDay: 10, completedSeries: 1, genreCount: 10, decadeCount: 6, notesCount: 25, followers: 10 }).sort(),
    ['binge-machine', 'completionist', 'critics-pen', 'crowd-favorite', 'genre-explorer', 'opening-night', 'time-traveler'],
  )
  assert.deepEqual(earned({ ratingCount: 1, maxEpisodesInDay: 9, completedSeries: 0, genreCount: 9, decadeCount: 5, notesCount: 24, followers: 9 }), ['opening-night'])
})

test('earned badges come first', () => {
  const ids = computeBadges({ ...base, followers: 10 }).map((b) => b.earned)
  assert.deepEqual(ids, [...ids].sort((a, b) => Number(b) - Number(a)))
})
