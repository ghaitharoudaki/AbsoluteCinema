import { useEffect, useId, useRef, type ReactNode } from 'react'

interface DialogProps {
  onClose: () => void
  /** Accessible name; rendered visually only when `showTitle` is true. */
  title: string
  showTitle?: boolean
  children: ReactNode
  size?: 'md' | 'lg'
  /** Top-align for search dialogs so results have room to grow downward. */
  align?: 'center' | 'top'
  /** Render without the surface panel (children supply their own). */
  bare?: boolean
}

/**
 * Shared modal shell: backdrop click and Escape close it, focus moves in on
 * open and returns to the trigger on close, page scroll is locked meanwhile.
 */
export default function Dialog({
  onClose,
  title,
  showTitle = false,
  children,
  size = 'md',
  align = 'center',
  bare = false,
}: DialogProps) {
  const panelRef = useRef<HTMLDivElement>(null)
  const closeRef = useRef(onClose)
  const titleId = useId()

  useEffect(() => {
    closeRef.current = onClose
  }, [onClose])

  useEffect(() => {
    const previouslyFocused = document.activeElement as HTMLElement | null
    const panel = panelRef.current
    const firstField = panel?.querySelector<HTMLElement>('input, textarea, select')
    ;(firstField ?? panel)?.focus()

    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation()
        closeRef.current()
      }
    }
    document.addEventListener('keydown', onKey)
    const { overflow } = document.body.style
    document.body.style.overflow = 'hidden'

    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = overflow
      previouslyFocused?.focus?.()
    }
  }, [])

  return (
    <div
      className={`fixed inset-0 z-50 flex justify-center overflow-y-auto bg-[rgb(var(--shadow)/0.6)] p-4 backdrop-blur-sm ${
        align === 'top' ? 'items-start pt-[12vh]' : 'items-center'
      }`}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className={`w-full animate-dialog-in outline-none ${size === 'lg' ? 'max-w-2xl' : 'max-w-lg'} ${
          bare ? '' : 'overflow-hidden rounded-2xl border border-line bg-surface shadow-dialog'
        }`}
      >
        <h2 id={titleId} className={showTitle ? 'px-6 pt-6 font-display text-2xl font-extrabold' : 'sr-only'}>
          {title}
        </h2>
        {children}
      </div>
    </div>
  )
}

export function CloseButton({ onClick, label = 'Close' }: { onClick: () => void; label?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-ink-muted transition-colors hover:bg-raised hover:text-ink"
    >
      <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden="true">
        <path strokeLinecap="round" d="M6 6l12 12M18 6L6 18" />
      </svg>
    </button>
  )
}
