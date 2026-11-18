interface AvatarProps {
  url: string | null | undefined
  name: string
  /** Tailwind size + text classes, e.g. "h-9 w-9 text-sm". */
  className?: string
}

/** Profile photo, or the first letter of the name on a raised disc. */
export default function Avatar({ url, name, className = 'h-9 w-9 text-sm' }: AvatarProps) {
  return url ? (
    <img src={url} alt="" className={`shrink-0 rounded-full bg-raised object-cover ${className}`} />
  ) : (
    <span aria-hidden="true" className={`flex shrink-0 items-center justify-center rounded-full bg-raised font-display font-black text-ink-muted ${className}`}>
      {(name || '?').charAt(0).toUpperCase()}
    </span>
  )
}
