import { test } from 'node:test'
import assert from 'node:assert/strict'
import { normalizeImportedRating } from './importRating.ts'

test('Letterboxd stars (0.5–5) are doubled onto the 0.5–10 scale', () => {
  assert.equal(normalizeImportedRating(4.5, 'letterboxd'), 9)
  assert.equal(normalizeImportedRating(5, 'letterboxd'), 10)
  assert.equal(normalizeImportedRating(0.5, 'letterboxd'), 1)
  assert.equal(normalizeImportedRating(3, 'letterboxd'), 6)
})

test('Simkl scores are already out of 10 and only snap to half steps', () => {
  assert.equal(normalizeImportedRating(8, 'simkl'), 8)
  assert.equal(normalizeImportedRating(7.3, 'simkl'), 7.5)
})

test('results stay inside 0.5–10', () => {
  assert.equal(normalizeImportedRating(12, 'simkl'), 10)
  assert.equal(normalizeImportedRating(6, 'letterboxd'), 10)
  assert.equal(normalizeImportedRating(0.1, 'simkl'), 0.5)
})

test('missing or zero ratings return null', () => {
  assert.equal(normalizeImportedRating(Number.NaN, 'letterboxd'), null)
  assert.equal(normalizeImportedRating(0, 'simkl'), null)
})
