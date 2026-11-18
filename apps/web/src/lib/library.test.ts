import { test } from 'node:test'
import assert from 'node:assert/strict'
import { groupByMonth, pickRandom, timeAgo } from './library.ts'

test('timeAgo reads like a person would say it', () => {
  const now = Date.parse('2026-11-18T12:00:00Z')
  assert.equal(timeAgo('2026-11-18T11:59:40Z', now), 'Just now')
  assert.equal(timeAgo('2026-11-18T11:15:00Z', now), '45 min ago')
  assert.equal(timeAgo('2026-11-18T07:00:00Z', now), '5 h ago')
  assert.equal(timeAgo('2026-11-17T09:00:00Z', now), 'Yesterday')
  assert.equal(timeAgo('2026-11-14T12:00:00Z', now), '4 days ago')
  assert.match(timeAgo('2026-09-01T12:00:00Z', now), /Sep/)
})

test('groups by month, newest first, undated last', () => {
  const rows = [
    { id: 'a', watched_date: '2026-10-03' },
    { id: 'b', watched_date: null },
    { id: 'c', watched_date: '2026-11-15' },
    { id: 'd', watched_date: '2026-10-28' },
  ]
  const groups = groupByMonth(rows)
  assert.deepEqual(groups.map((g) => g.key), ['2026-11', '2026-10', 'undated'])
  assert.deepEqual(groups[1].items.map((r) => r.id), ['d', 'a'])
  assert.equal(groups[2].label, 'No date')
  assert.match(groups[0].label, /November 2026/)
})

test('empty input gives no groups', () => {
  assert.deepEqual(groupByMonth([]), [])
})

test('pickRandom uses the random source and handles empty lists', () => {
  assert.equal(pickRandom(['x', 'y', 'z'], () => 0.99), 'z')
  assert.equal(pickRandom(['x', 'y', 'z'], () => 0), 'x')
  assert.equal(pickRandom([], () => 0.5), null)
})
