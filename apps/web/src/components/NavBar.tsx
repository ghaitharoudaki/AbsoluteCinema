import { useEffect, useId, useRef, useState } from 'react'
import { Link, NavLink, useNavigate } from 'react-router-dom'
import { useAuth } from '../lib/AuthContext'
import { useTheme } from '../lib/ThemeContext'
import { useMe } from '../lib/MeContext'
import { useLogFlow } from '../lib/LogFlow'
import Avatar from './Avatar'

const navLink = ({ isActive }: { isActive: boolean }) =>
  `relative rounded-full px-3.5 py-2 text-sm font-semibold transition-colors ${
    isActive ? 'bg-raised text-ink' : 'text-ink-muted hover:text-ink'
  }`

export const CREATOR_GITHUB = 'https://github.com/ghaitharoudaki'

export function GitHubIcon({ className = 'h-5 w-5' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden="true">
      <path d="M12 .5a11.5 11.5 0 00-3.64 22.41c.58.1.79-.25.79-.56v-2c-3.2.7-3.88-1.37-3.88-1.37-.53-1.33-1.28-1.69-1.28-1.69-1.05-.71.08-.7.08-.7 1.16.08 1.77 1.19 1.77 1.19 1.03 1.77 2.7 1.26 3.36.96.1-.75.4-1.26.73-1.55-2.55-.29-5.24-1.28-5.24-5.69 0-1.26.45-2.29 1.19-3.09-.12-.29-.52-1.46.11-3.05 0 0 .97-.31 3.17 1.18a11 11 0 015.77 0c2.2-1.49 3.17-1.18 3.17-1.18.63 1.59.23 2.76.11 3.05.74.8 1.19 1.83 1.19 3.09 0 4.42-2.7 5.39-5.26 5.68.41.36.78 1.06.78 2.14v3.17c0 .31.21.67.8.56A11.5 11.5 0 0012 .5z" />
    </svg>
  )
}

const iconButton =
  'flex h-10 w-10 items-center justify-center rounded-full text-ink-muted transition-colors hover:bg-raised hover:text-ink md:h-9 md:w-9'

/** Phones: GitHub, theme and sign out live behind one button so the header fits at 320 px. */
function MoreMenu({ theme, onToggleTheme, onSignOut }: { theme: string; onToggleTheme: () => void; onSignOut: () => void }) {
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)
  const menuId = useId()

  useEffect(() => {
    if (!open) return
    rootRef.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus()
    const onDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false)
    }
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpen(false)
        buttonRef.current?.focus()
      }
    }
    document.addEventListener('pointerdown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('pointerdown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  const onMenuKey = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return
    event.preventDefault()
    const items = [...(rootRef.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? [])]
    const index = items.indexOf(document.activeElement as HTMLElement)
    items[(index + (event.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length]?.focus()
  }

  const item = 'flex w-full items-center gap-3 px-4 py-3 text-left text-sm font-semibold text-ink hover:bg-raised focus-visible:bg-raised focus-visible:outline-none'

  return (
    <div ref={rootRef} className="relative md:hidden">
      <button
        ref={buttonRef}
        type="button"
        aria-label="More"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={menuId}
        onClick={() => setOpen((value) => !value)}
        className={iconButton}
      >
        <svg viewBox="0 0 24 24" className="h-5 w-5" fill="currentColor" aria-hidden="true">
          <circle cx="5" cy="12" r="2" />
          <circle cx="12" cy="12" r="2" />
          <circle cx="19" cy="12" r="2" />
        </svg>
      </button>
      {open && (
        <div id={menuId} role="menu" aria-label="More" onKeyDown={onMenuKey} className="toast-in absolute right-0 top-full z-50 mt-2 w-60 overflow-hidden rounded-2xl border border-line bg-surface py-1 shadow-dialog">
          <a role="menuitem" href={CREATOR_GITHUB} target="_blank" rel="noopener noreferrer" onClick={() => setOpen(false)} className={item}>
            <GitHubIcon className="h-5 w-5" />
            Support the creator
          </a>
          <button
            role="menuitem"
            type="button"
            onClick={() => {
              onToggleTheme()
              setOpen(false)
            }}
            className={item}
          >
            <span aria-hidden="true" className="flex h-5 w-5 items-center justify-center">{theme === 'dark' ? '☀' : '☾'}</span>
            {theme === 'dark' ? 'Light theme' : 'Dark theme'}
          </button>
          <button role="menuitem" type="button" onClick={onSignOut} className={`${item} border-t border-line text-danger`}>
            <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 17l5-5-5-5M20 12H9M12 21H5a2 2 0 01-2-2V5a2 2 0 012-2h7" />
            </svg>
            Sign out
          </button>
        </div>
      )}
    </div>
  )
}

export default function NavBar() {
  const { user, signOut } = useAuth()
  const { me } = useMe()
  const { theme, toggle } = useTheme()
  const { openSearch } = useLogFlow()
  const navigate = useNavigate()
  const nextTheme = theme === 'dark' ? 'light' : 'dark'
  const signOutAndLeave = () => void signOut().then(() => navigate('/login', { replace: true }))

  return (
    <header className="sticky top-0 z-40 border-b border-line bg-canvas/85 pt-[env(safe-area-inset-top)] backdrop-blur-md">
      <div className="mx-auto flex max-w-6xl items-center gap-1.5 px-4 py-2.5 sm:gap-3 sm:px-6 sm:py-3">
        <Link to="/" aria-label="AbsoluteCinema home" className="mr-auto flex min-w-0 items-center gap-2 rounded-lg">
          <img src="/favicon.svg" alt="" width={36} height={36} className="h-8 w-8 shrink-0 sm:h-9 sm:w-9" />
          <span className="truncate font-display text-xl font-black uppercase leading-none sm:text-2xl" aria-hidden="true">
            Absolute<span className="text-brand">Cinema</span>
          </span>
        </Link>

        <nav className="hidden items-center gap-1 md:flex" aria-label="Main">
          <NavLink to="/" end className={navLink}>Home</NavLink>
          <NavLink to="/discover" className={navLink}>Discover</NavLink>
          <NavLink to="/library" className={navLink}>Library</NavLink>
          <NavLink to="/people" className={navLink}>People</NavLink>
        </nav>

        <button
          type="button"
          onClick={openSearch}
          aria-keyshortcuts="/"
          className="hidden items-center gap-3 rounded-full border border-line py-1.5 pl-3.5 pr-1.5 text-sm text-ink-muted transition-colors hover:border-ink-muted hover:text-ink lg:flex"
        >
          <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2.2} aria-hidden="true">
            <circle cx="11" cy="11" r="7" />
            <path strokeLinecap="round" d="M20 20l-3.5-3.5" />
          </svg>
          Search titles
          <kbd className="rounded-md border border-line bg-raised px-1.5 font-body text-xs font-semibold">/</kbd>
        </button>

        <button type="button" onClick={openSearch} aria-label="Search titles" className={`${iconButton} lg:hidden`}>
          <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden="true">
            <circle cx="11" cy="11" r="7" />
            <path strokeLinecap="round" d="M20 20l-3.5-3.5" />
          </svg>
        </button>

        <button
          type="button"
          onClick={openSearch}
          className="hidden items-center gap-2 rounded-full bg-brand px-4 py-2 text-sm font-bold text-on-brand transition-colors hover:bg-brand-hover md:flex"
        >
          <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2.5} aria-hidden="true">
            <path strokeLinecap="round" d="M12 5v14M5 12h14" />
          </svg>
          Log a film
        </button>

        <a
          href={CREATOR_GITHUB}
          target="_blank"
          rel="noopener noreferrer"
          aria-label="Support the creator on GitHub (opens in a new tab)"
          title="Support the creator on GitHub"
          className={`${iconButton} hidden md:flex`}
        >
          <GitHubIcon className="h-5 w-5" />
        </a>

        <button type="button" onClick={toggle} aria-label={`Switch to ${nextTheme} theme`} title={`Switch to ${nextTheme} theme`} className={`${iconButton} hidden md:flex`}>
          {theme === 'dark' ? (
            <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden="true">
              <circle cx="12" cy="12" r="4" />
              <path strokeLinecap="round" d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" />
            </svg>
          ) : (
            <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 12.8A8.5 8.5 0 1111.2 3 6.5 6.5 0 0021 12.8z" />
            </svg>
          )}
        </button>

        {me && (
          <NavLink
            to={`/profile/${me.username}`}
            aria-label="Your profile"
            className={({ isActive }) =>
              `hidden rounded-full ring-2 transition-shadow md:block ${isActive ? 'ring-brand' : 'ring-line hover:ring-brand/60'}`
            }
          >
            <Avatar url={me.avatar_url} name={me.display_name || me.username || user?.email || '?'} />
          </NavLink>
        )}

        <button type="button" onClick={signOutAndLeave} aria-label="Sign out" title="Sign out" className={`${iconButton} hidden md:flex`}>
          <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 17l5-5-5-5M20 12H9M12 21H5a2 2 0 01-2-2V5a2 2 0 012-2h7" />
          </svg>
        </button>

        <MoreMenu theme={theme} onToggleTheme={toggle} onSignOut={signOutAndLeave} />
      </div>
    </header>
  )
}
