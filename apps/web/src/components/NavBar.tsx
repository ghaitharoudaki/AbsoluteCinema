import { useEffect, useState } from 'react'
import { Link, NavLink } from 'react-router-dom'
import { useAuth } from '../lib/AuthContext'
import { useTheme } from '../lib/ThemeContext'
import { supabase } from '../lib/supabase'

interface NavBarProps {
  onSearch?: () => void
}

const navLink = ({ isActive }: { isActive: boolean }) =>
  `rounded-full px-3.5 py-2 text-sm font-semibold transition-colors ${
    isActive ? 'bg-raised text-ink' : 'text-ink-muted hover:text-ink'
  }`

const iconButton =
  'flex h-9 w-9 items-center justify-center rounded-full text-ink-muted transition-colors hover:bg-raised hover:text-ink'

export default function NavBar({ onSearch }: NavBarProps) {
  const { user } = useAuth()
  const { theme, toggle } = useTheme()
  const [profile, setProfile] = useState<{ username: string; avatar_url: string | null } | null>(null)

  useEffect(() => {
    if (!user) return
    supabase
      .from('profiles')
      .select('username, avatar_url')
      .eq('id', user.id)
      .maybeSingle()
      .then(({ data }) => setProfile(data))
  }, [user])

  const initial = (profile?.username || user?.email || '?').charAt(0).toUpperCase()
  const nextTheme = theme === 'dark' ? 'light' : 'dark'

  const links = (
    <>
      <NavLink to="/" end className={navLink}>
        Home
      </NavLink>
      <NavLink to="/import" className={navLink}>
        Import
      </NavLink>
    </>
  )

  return (
    <header className="sticky top-0 z-40 border-b border-line bg-canvas/85 backdrop-blur-md">
      <div className="mx-auto flex max-w-6xl items-center gap-2 px-4 py-3 sm:gap-3 sm:px-6">
        <Link to="/" className="mr-auto font-display text-2xl font-black uppercase leading-none">
          Absolute<span className="text-brand">Cinema</span>
        </Link>

        <nav className="hidden items-center gap-1 sm:flex" aria-label="Main">
          {links}
        </nav>

        {onSearch && (
          <button
            type="button"
            onClick={onSearch}
            className="flex items-center gap-2 rounded-full bg-brand px-4 py-2 text-sm font-bold text-on-brand transition-colors hover:bg-brand-hover"
          >
            <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2.5} aria-hidden="true">
              <path strokeLinecap="round" d="M12 5v14M5 12h14" />
            </svg>
            Log a film
          </button>
        )}

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

        {profile && (
          <NavLink
            to={`/profile/${profile.username}`}
            aria-label="Your profile"
            className={({ isActive }) =>
              `flex h-9 w-9 items-center justify-center overflow-hidden rounded-full bg-raised text-sm font-bold text-ink ring-2 transition-shadow ${
                isActive ? 'ring-brand' : 'ring-line hover:ring-brand/60'
              }`
            }
          >
            {profile.avatar_url ? <img src={profile.avatar_url} alt="" className="h-full w-full object-cover" /> : initial}
          </NavLink>
        )}

        <button type="button" onClick={() => void supabase.auth.signOut()} aria-label="Sign out" title="Sign out" className={iconButton}>
          <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 17l5-5-5-5M20 12H9M12 21H5a2 2 0 01-2-2V5a2 2 0 012-2h7" />
          </svg>
        </button>
      </div>

      {/* Narrow screens: destinations move to a second row */}
      <nav className="flex gap-1 border-t border-line px-4 py-1.5 sm:hidden" aria-label="Main">
        {links}
      </nav>
    </header>
  )
}
