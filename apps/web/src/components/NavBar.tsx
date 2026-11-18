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

const iconButton =
  'flex h-9 w-9 items-center justify-center rounded-full text-ink-muted transition-colors hover:bg-raised hover:text-ink'

export default function NavBar() {
  const { user, signOut } = useAuth()
  const { me } = useMe()
  const { theme, toggle } = useTheme()
  const { openSearch } = useLogFlow()
  const navigate = useNavigate()
  const nextTheme = theme === 'dark' ? 'light' : 'dark'

  return (
    <header className="sticky top-0 z-40 border-b border-line bg-canvas/85 backdrop-blur-md">
      <div className="mx-auto flex max-w-6xl items-center gap-2 px-4 py-3 sm:gap-3 sm:px-6">
        <Link to="/" className="mr-auto font-display text-2xl font-black uppercase leading-none">
          Absolute<span className="text-brand">Cinema</span>
        </Link>

        <nav className="hidden items-center gap-1 md:flex" aria-label="Main">
          <NavLink to="/" end className={navLink}>Home</NavLink>
          <NavLink to="/discover" className={navLink}>Discover</NavLink>
          <NavLink to="/library" className={navLink}>Library</NavLink>
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

        <button type="button" onClick={toggle} aria-label={`Switch to ${nextTheme} theme`} title={`Switch to ${nextTheme} theme`} className={iconButton}>
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

        <button type="button" onClick={() => void signOut().then(() => navigate('/login', { replace: true }))} aria-label="Sign out" title="Sign out" className={iconButton}>
          <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 17l5-5-5-5M20 12H9M12 21H5a2 2 0 01-2-2V5a2 2 0 012-2h7" />
          </svg>
        </button>
      </div>
    </header>
  )
}
