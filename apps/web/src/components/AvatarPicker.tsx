import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react'
import Avatar from './Avatar'
import { api, errorMessage } from '../lib/api'
import { cropRect, loadImage, renderAvatar, validateAvatarFile } from '../lib/avatarImage'
import type { MyProfile } from '../lib/MeContext'

interface AvatarPickerProps {
  url: string | null
  name: string
  onSaved: (profile: MyProfile, message: string) => void
}

const PREVIEW = 208

/**
 * Choose or drop a photo (≤ 5 MB), position it in the circle, save.
 * The browser crops and shrinks it to 512 px before anything is uploaded.
 */
export default function AvatarPicker({ url, name, onSaved }: AvatarPickerProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [image, setImage] = useState<HTMLImageElement | null>(null)
  const [zoom, setZoom] = useState(1)
  const [pan, setPan] = useState({ x: 0, y: 0 })
  const [dragOver, setDragOver] = useState(false)
  const [busy, setBusy] = useState<'save' | 'remove' | null>(null)
  const [error, setError] = useState<string | null>(null)
  const drag = useRef<{ x: number; y: number; pan: { x: number; y: number } } | null>(null)

  useEffect(() => () => {
    if (image) URL.revokeObjectURL(image.src)
  }, [image])

  const takeFile = async (file: File | undefined) => {
    if (!file) return
    setError(null)
    const problem = validateAvatarFile(file)
    if (problem) {
      setError(problem)
      return
    }
    try {
      const loaded = await loadImage(file)
      setImage(loaded)
      setZoom(1)
      setPan({ x: 0, y: 0 })
    } catch (err) {
      setError((err as Error).message)
    }
  }

  const rect = image ? cropRect(image.naturalWidth, image.naturalHeight, zoom, pan.x, pan.y) : null
  const scale = rect ? PREVIEW / rect.size : 1
  const slackX = image && rect ? (image.naturalWidth - rect.size) * scale : 0
  const slackY = image && rect ? (image.naturalHeight - rect.size) * scale : 0
  const clamp = (v: number) => Math.max(-1, Math.min(1, v))

  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    event.currentTarget.setPointerCapture(event.pointerId)
    drag.current = { x: event.clientX, y: event.clientY, pan }
  }
  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    if (!drag.current) return
    const dx = event.clientX - drag.current.x
    const dy = event.clientY - drag.current.y
    setPan({
      x: slackX ? clamp(drag.current.pan.x - (2 * dx) / slackX) : 0,
      y: slackY ? clamp(drag.current.pan.y - (2 * dy) / slackY) : 0,
    })
  }
  const onKey = (event: KeyboardEvent<HTMLDivElement>) => {
    const step = event.shiftKey ? 0.25 : 0.06
    const moves: Record<string, [number, number]> = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] }
    const move = moves[event.key]
    if (!move) return
    event.preventDefault()
    setPan((p) => ({ x: clamp(p.x + move[0]), y: clamp(p.y + move[1]) }))
  }

  const save = async () => {
    if (!image || !rect) return
    setBusy('save')
    setError(null)
    try {
      const { profile } = await api<{ profile: MyProfile }>('avatar', { method: 'PUT', body: { image: renderAvatar(image, rect) } })
      setImage(null)
      onSaved(profile, 'Profile photo updated')
    } catch (err) {
      setError(errorMessage(err, 'Your photo didn’t save. Try again.'))
    } finally {
      setBusy(null)
    }
  }

  const remove = async () => {
    setBusy('remove')
    setError(null)
    try {
      const { profile } = await api<{ profile: MyProfile }>('avatar', { method: 'DELETE' })
      onSaved(profile, 'Profile photo removed')
    } catch (err) {
      setError(errorMessage(err, 'Your photo couldn’t be removed. Try again.'))
    } finally {
      setBusy(null)
    }
  }

  const fileInput = (
    <input
      ref={inputRef}
      type="file"
      accept="image/*"
      className="sr-only"
      tabIndex={-1}
      aria-hidden="true"
      onChange={(event) => {
        void takeFile(event.target.files?.[0])
        event.target.value = ''
      }}
    />
  )

  if (image && rect) {
    return (
      <fieldset className="rounded-2xl border border-line bg-raised/50 p-4">
        <legend className="px-1 text-sm font-semibold">Position your photo</legend>
        {fileInput}
        <div className="flex flex-col items-center gap-4">
          <div
            role="img"
            aria-label="Photo position. Drag, or use the arrow keys, to move it inside the circle."
            tabIndex={0}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={() => (drag.current = null)}
            onPointerCancel={() => (drag.current = null)}
            onKeyDown={onKey}
            className="relative cursor-grab touch-none overflow-hidden rounded-full bg-canvas ring-4 ring-brand/70 active:cursor-grabbing"
            style={{ width: PREVIEW, height: PREVIEW }}
          >
            <img
              src={image.src}
              alt=""
              draggable={false}
              className="pointer-events-none absolute max-w-none select-none"
              style={{ width: image.naturalWidth * scale, height: image.naturalHeight * scale, left: -rect.sx * scale, top: -rect.sy * scale }}
            />
          </div>
          <label className="flex w-full max-w-xs items-center gap-3 text-sm font-semibold">
            Zoom
            <input
              type="range"
              min={1}
              max={3}
              step={0.01}
              value={zoom}
              onChange={(event) => setZoom(Number(event.target.value))}
              className="flex-1 accent-[rgb(var(--brand))]"
            />
          </label>
        </div>
        {error && <p role="alert" className="mt-3 rounded-xl bg-danger/10 px-3.5 py-2.5 text-sm text-danger">{error}</p>}
        <div className="mt-4 flex flex-wrap justify-end gap-2">
          <button type="button" onClick={() => setImage(null)} className="rounded-full px-4 py-2 text-sm font-semibold text-ink-muted hover:bg-raised hover:text-ink">
            Cancel
          </button>
          <button type="button" onClick={() => inputRef.current?.click()} className="rounded-full border border-line px-4 py-2 text-sm font-semibold hover:border-ink-muted">
            Choose another
          </button>
          <button
            type="button"
            onClick={() => void save()}
            disabled={busy !== null}
            className="rounded-full bg-brand px-5 py-2 text-sm font-bold text-on-brand hover:bg-brand-hover disabled:cursor-wait disabled:opacity-60"
          >
            {busy === 'save' ? 'Saving…' : 'Save photo'}
          </button>
        </div>
      </fieldset>
    )
  }

  return (
    <div
      onDragOver={(event) => {
        event.preventDefault()
        setDragOver(true)
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(event) => {
        event.preventDefault()
        setDragOver(false)
        void takeFile(event.dataTransfer.files?.[0])
      }}
      className={`rounded-2xl border-2 border-dashed p-4 transition-colors ${dragOver ? 'border-brand bg-brand/5' : 'border-line'}`}
    >
      {fileInput}
      <div className="flex items-center gap-4">
        <Avatar url={url} name={name} className="h-20 w-20 text-3xl" />
        <div className="min-w-0">
          <p className="text-sm font-semibold">Profile photo</p>
          <p className="mt-0.5 text-xs text-ink-muted">Drop an image here, or choose one. JPEG, PNG, WebP or HEIC, up to 5 MB.</p>
          <div className="mt-2.5 flex flex-wrap gap-2">
            <button type="button" onClick={() => inputRef.current?.click()} className="rounded-full bg-ink px-4 py-1.5 text-sm font-semibold text-canvas transition-opacity hover:opacity-85">
              {url ? 'Change photo' : 'Choose photo'}
            </button>
            {url && (
              <button
                type="button"
                onClick={() => void remove()}
                disabled={busy !== null}
                className="rounded-full px-3 py-1.5 text-sm font-semibold text-ink-muted hover:bg-raised hover:text-danger disabled:opacity-60"
              >
                {busy === 'remove' ? 'Removing…' : 'Remove photo'}
              </button>
            )}
          </div>
        </div>
      </div>
      {error && <p role="alert" className="mt-3 rounded-xl bg-danger/10 px-3.5 py-2.5 text-sm text-danger">{error}</p>}
    </div>
  )
}
