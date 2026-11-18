import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react'

interface ToastAction {
  label: string
  onClick: () => void
}

interface ToastItem {
  id: number
  message: string
  action?: ToastAction
  tone: 'info' | 'error'
}

type ShowToast = (message: string, options?: { action?: ToastAction; tone?: 'info' | 'error' }) => void

const ToastContext = createContext<ShowToast>(() => {})

/** Confirmation strip at the bottom of the screen. Optional action (usually Undo). */
export function useToast() {
  return useContext(ToastContext)
}

const LIFETIME_MS = 6000

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([])
  const nextId = useRef(1)

  const dismiss = useCallback((id: number) => setToasts((list) => list.filter((toast) => toast.id !== id)), [])

  const show = useCallback<ShowToast>((message, options) => {
    const id = nextId.current++
    // Keep at most three on screen; the newest wins.
    setToasts((list) => [...list.slice(-2), { id, message, action: options?.action, tone: options?.tone ?? 'info' }])
  }, [])

  return (
    <ToastContext.Provider value={show}>
      {children}
      <div
        aria-live="polite"
        role="status"
        className="pointer-events-none fixed inset-x-0 bottom-[calc(5.5rem+env(safe-area-inset-bottom))] z-[60] flex flex-col items-center gap-2 px-4 sm:bottom-6"
      >
        {toasts.map((toast) => (
          <Toast key={toast.id} toast={toast} onDismiss={() => dismiss(toast.id)} />
        ))}
      </div>
    </ToastContext.Provider>
  )
}

function Toast({ toast, onDismiss }: { toast: ToastItem; onDismiss: () => void }) {
  const [paused, setPaused] = useState(false)

  useEffect(() => {
    if (paused) return
    const timer = window.setTimeout(onDismiss, LIFETIME_MS)
    return () => window.clearTimeout(timer)
  }, [paused, onDismiss])

  return (
    <div
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
      className={`toast-in pointer-events-auto flex w-full max-w-md items-center gap-3 rounded-2xl border py-2.5 pl-4 pr-2 text-sm shadow-dialog ${
        toast.tone === 'error' ? 'border-danger/40 bg-surface text-danger' : 'border-line bg-ink text-canvas'
      }`}
    >
      <p className="min-w-0 flex-1 font-medium">{toast.message}</p>
      {toast.action && (
        <button
          type="button"
          onClick={() => {
            toast.action?.onClick()
            onDismiss()
          }}
          className="shrink-0 rounded-full px-3 py-1.5 font-bold text-brand transition-colors hover:bg-brand/15"
        >
          {toast.action.label}
        </button>
      )}
      <button
        type="button"
        onClick={onDismiss}
        aria-label="Dismiss message"
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full opacity-70 transition-opacity hover:opacity-100"
      >
        <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2.2} aria-hidden="true">
          <path strokeLinecap="round" d="M6 6l12 12M18 6L6 18" />
        </svg>
      </button>
    </div>
  )
}
