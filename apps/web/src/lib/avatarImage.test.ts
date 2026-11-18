import { test } from 'node:test'
import assert from 'node:assert/strict'
import { MAX_AVATAR_BYTES, cropRect, validateAvatarFile } from './avatarImage.ts'

test('files up to 5 MB that are images pass', () => {
  assert.equal(MAX_AVATAR_BYTES, 5 * 1024 * 1024)
  assert.equal(validateAvatarFile({ size: MAX_AVATAR_BYTES, type: 'image/jpeg' }), null)
  assert.equal(validateAvatarFile({ size: 1000, type: 'image/heic' }), null)
})

test('files over 5 MB or not images get a message naming the problem', () => {
  assert.match(validateAvatarFile({ size: MAX_AVATAR_BYTES + 1, type: 'image/png' }) ?? '', /5 MB/)
  assert.match(validateAvatarFile({ size: 10, type: 'application/pdf' }) ?? '', /photo/i)
  assert.match(validateAvatarFile({ size: 0, type: 'image/png' }) ?? '', /empty/i)
})

test('zoom 1 crops the largest centred square', () => {
  assert.deepEqual(cropRect(1000, 500, 1, 0, 0), { sx: 250, sy: 0, size: 500 })
  assert.deepEqual(cropRect(400, 800, 1, 0, 0), { sx: 0, sy: 200, size: 400 })
})

test('pan moves the square to the edge and never past it', () => {
  assert.deepEqual(cropRect(1000, 500, 1, 1, 0), { sx: 500, sy: 0, size: 500 })
  assert.deepEqual(cropRect(1000, 500, 1, -3, 0), { sx: 0, sy: 0, size: 500 })
})

test('zoom 2 takes a square half the size', () => {
  assert.deepEqual(cropRect(1000, 1000, 2, 0, 0), { sx: 250, sy: 250, size: 500 })
  assert.deepEqual(cropRect(1000, 1000, 2, -1, 1), { sx: 0, sy: 500, size: 500 })
})
