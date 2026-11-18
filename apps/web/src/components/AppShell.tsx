import { useEffect, type ReactNode } from 'react'
import { NavLink, Outlet, useLocation } from 'react-router-dom'
import NavBar from './NavBar'
import Avatar from './Avatar'
import { MeProvider, useMe } from '../lib/MeContext'
import { ToastProvider } from '../lib/Toast'
import { LogFlowProvider, useLogFlow } from '../lib/LogFlow'

/** Frame shared by every signed-in page: header, content, phone tab bar, toasts and the log flow. */
export default function AppShell() {
  return (
    <MeProvider>
      <ToastProvider>
        <LogFlowProvider>
          <ShellFrame />
        </LogFlowProvider>
      </ToastProvider>
    </MeProvider>
  )
}

function ShellFrame() {
  const { pathname } = useLocation()

  // A new page starts at the top (query-only changes like ?tab= keep the scroll).
  useEffect(() => {
    window.scrollTo({ top: 0 })
  }, [pathname])

  return (
    <div className="min-h-screen bg-canvas text-ink">
      <a
        href="#main"
        className="sr-only z-[70] rounded-full bg-brand px-4 py-2 text-sm font-bold text-on-brand focus:not-sr-only focus:fixed focus:left-4 focus:top-3"
      >
        Skip to content
      </a>
      <NavBar />
      <main id="main" tabIndex={-1} className="outline-none pb-[calc(6rem+env(safe-area-inset-bottom))] md:pb-16">
        <Outlet />
      </main>
      <TabBar />
    </div>
  )
}

function Tab({ to, label, end, children }: { to: string; label: string; end?: boolean; children: ReactNode }) {
  return (
    <NavLink
      to={to}
      end={end}
      className={({ isActive }) =>
        `flex flex-1 flex-col items-center gap-1 py-2 text-[11px] font-semibold transition-colors ${isActive ? 'text-brand' : 'text-ink-muted'}`
      }
    >
      {children}
      {label}
    </NavLink>
  )
}

const tabIcon = 'h-6 w-6'

/** Phones: the four destinations plus a ticket-shaped Log button in the middle. */
function TabBar() {
  const { me } = useMe()
  const { openSearch } = useLogFlow()

  return (
    <nav
      aria-label="Main"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-canvas/90 pb-[env(safe-area-inset-bottom)] backdrop-blur-md md:hidden"
    >
      <div className="mx-auto flex max-w-md items-end px-2">
        <Tab to="/" end label="Home">
          <svg viewBox="0 0 24 24" className={tabIcon} fill="none" stroke="currentColor" strokeWidth={1.9} aria-hidden="true">
            <path strokeLinejoin="round" d="M4 10.5L12 4l8 6.5V20a1 1 0 01-1 1h-4.5v-6h-5v6H5a1 1 0 01-1-1z" />
          </svg>
        </Tab>
        <Tab to="/discover" label="Discover">
          <svg viewBox="0 0 24 24" className={tabIcon} fill="none" stroke="currentColor" strokeWidth={1.9} aria-hidden="true">
            <circle cx="12" cy="12" r="9" />
            <path strokeLinejoin="round" d="M15.5 8.5l-2 5-5 2 2-5z" />
          </svg>
        </Tab>
        <div className="flex flex-1 justify-center">
          <button type="button" onClick={openSearch} aria-label="Log a film" className="ticket -mt-5 px-5 py-3 shadow-poster">
            <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth={2.6} aria-hidden="true">
              <path strokeLinecap="round" d="M12 5v14M5 12h14" />
            </svg>
          </button>
        </div>
        <Tab to="/library" label="Library">
          <svg viewBox="0 0 24 24" className={tabIcon} fill="none" stroke="currentColor" strokeWidth={1.9} aria-hidden="true">
            <rect x="4" y="4" width="4" height="16" rx="1" />
            <rect x="10" y="4" width="4" height="16" rx="1" />
            <path strokeLinejoin="round" d="M16.5 5.2l3.4-.9 3.2 15.5-3.4.9z" transform="translate(-2 0)" />
          </svg>
        </Tab>
        <Tab to={me ? `/profile/${me.username}` : '/'} label="Profile">
          <Avatar url={me?.avatar_url} name={me?.display_name || me?.username || '?'} className="h-6 w-6 text-[11px]" />
        </Tab>
      </div>
    </nav>
  )
}
