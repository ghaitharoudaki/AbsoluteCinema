import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parseAvatarDataUrl, MAX_AVATAR_PAYLOAD } from './avatar.ts'

const webpBytes = Buffer.concat([Buffer.from('RIFF'), Buffer.alloc(4), Buffer.from('WEBPVP8 '), Buffer.alloc(20)])
const pngBytes = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0])
const jpegBytes = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0])
const url = (mime: string, bytes: Buffer) => `data:${mime};base64,${bytes.toString('base64')}`

test('accepts WebP, PNG and JPEG data URLs whose bytes match the type', () => {
  assert.deepEqual(parseAvatarDataUrl(url('image/webp', webpBytes)), { mime: 'image/webp', base64: webpBytes.toString('base64') })
  assert.equal(parseAvatarDataUrl(url('image/png', pngBytes)).mime, 'image/png')
  assert.equal(parseAvatarDataUrl(url('image/jpeg', jpegBytes)).mime, 'image/jpeg')
})

test('rejects anything that is not an image data URL', () => {
  assert.throws(() => parseAvatarDataUrl('https://example.com/me.png'), /photo/i)
  assert.throws(() => parseAvatarDataUrl(url('image/gif', pngBytes)), /photo/i)
  assert.throws(() => parseAvatarDataUrl(url('text/html', Buffer.from('<p>hi</p>'))), /photo/i)
})

test('rejects bytes that do not match the declared type', () => {
  assert.throws(() => parseAvatarDataUrl(url('image/webp', pngBytes)), /photo/i)
})

test('rejects payloads over the size cap', () => {
  const big = Buffer.concat([webpBytes, Buffer.alloc(MAX_AVATAR_PAYLOAD)])
  assert.throws(() => parseAvatarDataUrl(url('image/webp', big)), /too large/i)
})
