import { test } from 'node:test'
import assert from 'node:assert/strict'
import { buildLayout, moveInLayout, scoreTier, layoutToPayload, type Placeable } from './tiers.ts'

const item = (id: string, rating: number, extra: Partial<Placeable> = {}): Placeable => ({ id, rating, title: id, ...extra })
const ids = (list: Placeable[]) => list.map((i) => i.id)

test('without placements, items fall into score bands, best first', () => {
  const layout = buildLayout([item('a', 9.5), item('b', 8), item('c', 9), item('d', 3)])
  assert.deepEqual(ids(layout.S), ['a', 'c'])
  assert.deepEqual(ids(layout.A), ['b'])
  assert.deepEqual(ids(layout.F), ['d'])
  assert.equal(scoreTier(6.5), 'C')
  assert.equal(scoreTier(4), 'D')
})

test('a saved placement wins over the score; placed items keep their order ahead of new ones', () => {
  const layout = buildLayout([
    item('new', 9.8),
    item('second', 5, { tier_override: 'S', tier_rank: 1 }),
    item('first', 7, { tier_override: 'S', tier_rank: 0 }),
  ])
  assert.deepEqual(ids(layout.S), ['first', 'second', 'new'])
  assert.deepEqual(ids(layout.D), [])
})

test('moving across tiers inserts at the drop position', () => {
  const layout = buildLayout([item('a', 9.5), item('b', 9), item('c', 8)])
  const next = moveInLayout(layout, 'c', 'S', 1)
  assert.deepEqual(ids(next.S), ['a', 'c', 'b'])
  assert.deepEqual(ids(next.A), [])
  assert.deepEqual(ids(layout.A), ['c'], 'original layout is untouched')
})

test('reordering inside one tier and clamping out-of-range positions', () => {
  const layout = buildLayout([item('a', 9.5), item('b', 9.2), item('c', 9)])
  assert.deepEqual(ids(moveInLayout(layout, 'a', 'S', 2).S), ['b', 'c', 'a'])
  assert.deepEqual(ids(moveInLayout(layout, 'c', 'S', -4).S), ['c', 'a', 'b'])
  assert.deepEqual(ids(moveInLayout(layout, 'a', 'F', 99).F), ['a'])
})

test('unknown ids leave the layout as it was', () => {
  const layout = buildLayout([item('a', 9)])
  assert.deepEqual(ids(moveInLayout(layout, 'zzz', 'F', 0).S), ['a'])
})

test('payload lists ids per tier in display order', () => {
  const layout = moveInLayout(buildLayout([item('a', 9.5), item('b', 3)]), 'b', 'S', 0)
  assert.deepEqual(layoutToPayload(layout), { S: ['b', 'a'], A: [], B: [], C: [], D: [], F: [] })
})
