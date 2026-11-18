// Profile photo helpers. The original file never leaves the browser: it is cropped
// to a square and shrunk to 512 px WebP (~50 KB) before upload.

export const MAX_AVATAR_BYTES = 5 * 1024 * 1024
export const AVATAR_SIZE = 512

/** A message for the person, or null when the file can be used. */
export function validateAvatarFile(file: { size: number; type: string }): string | null {
  if (!file.type.startsWith('image/')) return 'Choose a photo (JPEG, PNG, WebP or HEIC).'
  if (file.size === 0) return 'That file is empty. Choose another photo.'
  if (file.size > MAX_AVATAR_BYTES) return `That photo is ${(file.size / 1024 / 1024).toFixed(1)} MB. Choose one up to 5 MB.`
  return null
}

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value))

/**
 * Square source rectangle for an image of `width`×`height`.
 * `zoom` ≥ 1 shrinks the square; `panX`/`panY` run from -1 (left/top edge) to 1 (right/bottom edge).
 */
export function cropRect(width: number, height: number, zoom: number, panX: number, panY: number) {
  const size = Math.round(Math.min(width, height) / Math.max(1, zoom))
  const sx = Math.round(((clamp(panX, -1, 1) + 1) / 2) * (width - size))
  const sy = Math.round(((clamp(panY, -1, 1) + 1) / 2) * (height - size))
  return { sx, sy, size }
}

/** Loads a File into an <img> so it can be previewed and drawn. */
export function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error("This photo can't be opened here. Try a JPEG or PNG."))
    }
    img.src = url
  })
}

/** Draws the crop onto a 512 px canvas and returns a WebP data URL (JPEG where WebP is unsupported). */
export function renderAvatar(img: HTMLImageElement, rect: { sx: number; sy: number; size: number }, out = AVATAR_SIZE): string {
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = out
  const context = canvas.getContext('2d')
  if (!context) throw new Error('Your browser could not prepare the photo')
  context.imageSmoothingQuality = 'high'
  context.drawImage(img, rect.sx, rect.sy, rect.size, rect.size, 0, 0, out, out)
  const webp = canvas.toDataURL('image/webp', 0.86)
  return webp.startsWith('data:image/webp') ? webp : canvas.toDataURL('image/jpeg', 0.88)
}
