/**
 * Profile photos arrive already cropped and shrunk in the browser (512 px WebP,
 * usually 30–80 KB). The server only checks the payload really is a small image
 * before storing it as base64 in the `avatars` table.
 */

export type AvatarMime = 'image/webp' | 'image/jpeg' | 'image/png'

/** Decoded bytes. Far above a 512 px WebP, far below Vercel's 4.5 MB body limit. */
export const MAX_AVATAR_PAYLOAD = 600_000

const signatures: Record<AvatarMime, (b: Buffer) => boolean> = {
  'image/webp': (b) => b.subarray(0, 4).toString('latin1') === 'RIFF' && b.subarray(8, 12).toString('latin1') === 'WEBP',
  'image/jpeg': (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff,
  'image/png': (b) => b[0] === 0x89 && b.subarray(1, 4).toString('latin1') === 'PNG',
}

export function parseAvatarDataUrl(dataUrl: string): { mime: AvatarMime; base64: string } {
  const match = /^data:(image\/(?:webp|jpeg|png));base64,([A-Za-z0-9+/]+=*)$/.exec(typeof dataUrl === 'string' ? dataUrl : '')
  if (!match) throw new Error('Choose a JPEG, PNG or WebP photo')
  const mime = match[1] as AvatarMime
  const base64 = match[2]
  const bytes = Buffer.from(base64, 'base64')
  if (bytes.length > MAX_AVATAR_PAYLOAD) throw new Error('That photo is too large. Try a smaller one.')
  if (!signatures[mime](bytes)) throw new Error("That file isn't a readable photo")
  return { mime, base64 }
}
