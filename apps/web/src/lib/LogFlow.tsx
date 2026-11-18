import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'
import { useLocation } from 'react-router-dom'
import Dialog, { CloseButton } from '../components/Dialog'
import MovieSearch, { type SearchResult } from '../components/MovieSearch'
import MovieDetail from '../components/MovieDetail'
import RateMovie, { type ExistingRating } from '../pages/RateMovie'
import { useToast } from './Toast'

interface LogFlowContextType {
  /** Opens "Find a film to log". Also bound to the / key. */
  openSearch: () => void
  /** Opens a title's detail dialog. */
  openTitle: (movie: SearchResult) => void
  /** Opens the rating form directly, e.g. to edit an existing rating. */
  openRating: (movie: SearchResult, existing?: ExistingRating) => void
  /** Increments whenever a rating, watchlist or episode change may have happened. Pages refetch on change. */
  version: number
}

const LogFlowContext = createContext<LogFlowContextType>({
  openSearch: () => {},
  openTitle: () => {},
  openRating: () => {},
  version: 0,
})

export function useLogFlow() {
  return useContext(LogFlowContext)
}

/** Typing in a field, or a dialog already open, means / is just a character. */
function shortcutBlocked(target: EventTarget | null) {
  const element = target as HTMLElement | null
  if (document.querySelector('[role="dialog"]')) return true
  if (!element) return false
  return element.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(element.tagName)
}

export function LogFlowProvider({ children }: { children: ReactNode }) {
  const [step, setStep] = useState<'search' | 'detail' | 'rate' | null>(null)
  const [movie, setMovie] = useState<SearchResult | null>(null)
  const [editing, setEditing] = useState<ExistingRating | null>(null)
  const [version, setVersion] = useState(0)
  const toast = useToast()

  const openSearch = useCallback(() => setStep('search'), [])
  const openTitle = useCallback((title: SearchResult) => {
    setMovie(title)
    setStep('detail')
  }, [])
  const openRating = useCallback((title: SearchResult, existing?: ExistingRating) => {
    setMovie(title)
    setEditing(existing ?? null)
    setStep('rate')
  }, [])

  const close = () => {
    setStep(null)
    setMovie(null)
    setEditing(null)
    // Watchlist and episode changes happen inside the detail dialog.
    setVersion((value) => value + 1)
  }

  // Going to another page (including Back) closes whatever dialog was open.
  const { pathname } = useLocation()
  useEffect(() => {
    setStep(null)
    setMovie(null)
    setEditing(null)
  }, [pathname])

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== '/' || event.metaKey || event.ctrlKey || event.altKey) return
      if (shortcutBlocked(event.target)) return
      event.preventDefault()
      setStep('search')
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [])

  return (
    <LogFlowContext.Provider value={{ openSearch, openTitle, openRating, version }}>
      {children}

      {step === 'search' && (
        <Dialog onClose={close} title="Find a film to log" align="top" bare>
          <div className="rounded-2xl border border-line bg-surface p-5 shadow-dialog">
            <div className="mb-4 flex items-center justify-between gap-4">
              <p className="font-display text-2xl font-extrabold">Find a film to log</p>
              <CloseButton onClick={close} />
            </div>
            <MovieSearch onSelect={openTitle} showRecents />
          </div>
        </Dialog>
      )}

      {step === 'detail' && movie && (
        <MovieDetail
          movie={movie}
          onRate={(existing) => {
            setEditing(existing ?? null)
            setStep('rate')
          }}
          onClose={close}
        />
      )}

      {step === 'rate' && movie && (
        <RateMovie
          movie={movie}
          existingRating={editing ?? undefined}
          onDone={() => {
            toast(editing ? `Rating for ${movie.title} updated` : `${movie.title} logged`)
            close()
          }}
          onCancel={close}
        />
      )}
    </LogFlowContext.Provider>
  )
}
