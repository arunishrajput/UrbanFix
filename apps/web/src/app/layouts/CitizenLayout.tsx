import { Bell, Camera, House, LayoutDashboard, Map, Moon, Sun, UserRound } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { Link, NavLink, Outlet, ScrollRestoration, useLocation } from 'react-router';
import { Wordmark } from '../../components/Wordmark';
import { isMunicipal, useAuth } from '../../lib/auth';
import { cn } from '../../lib/cn';
import { useRealtime } from '../../lib/realtime';
import { useConfig } from '../../lib/reference';
import { useTheme } from '../../lib/theme';
import { NotificationBell, UnreadDot } from '../../features/notifications/NotificationBell';
import { useUnreadCount } from '../../features/notifications/useUnreadCount';

function TopBar() {
  const user = useAuth((s) => s.user);
  const { data: config } = useConfig();
  const { theme, toggle } = useTheme();
  return (
    <header className="sticky top-0 z-[900] border-b border-line/70 bg-bg/85 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-6xl items-center gap-4 px-4">
        <Wordmark />
        {config && (
          <span className="hidden rounded-md border border-line px-2 py-0.5 font-mono text-[0.7rem] font-semibold uppercase tracking-wider text-muted sm:inline">
            {config.city.name}
          </span>
        )}
        <nav className="ml-6 hidden items-center gap-1 md:flex" aria-label="Main">
          {[
            ['/', 'Home'],
            ['/map', 'Map'],
            ['/report', 'Report an issue'],
          ].map(([to, label]) => (
            <NavLink
              key={to}
              to={to!}
              end
              className={({ isActive }) =>
                cn(
                  'rounded-lg px-3 py-2 text-sm font-semibold',
                  isActive ? 'bg-surface-2 text-ink' : 'text-muted hover:text-ink',
                )
              }
            >
              {label}
            </NavLink>
          ))}
        </nav>
        <div className="ml-auto flex items-center gap-1">
          {isMunicipal(user) && (
            <Link
              to="/dashboard"
              className="hidden items-center gap-1.5 rounded-xl bg-asphalt px-3 py-2 text-sm font-bold text-white sm:inline-flex"
            >
              <LayoutDashboard className="size-4" /> Dashboard
            </Link>
          )}
          <button
            onClick={toggle}
            className="grid size-10 place-items-center rounded-xl hover:bg-surface-2"
            aria-label={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
          >
            {theme === 'dark' ? <Sun className="size-5" /> : <Moon className="size-5" />}
          </button>
          {user ? (
            <>
              <span className="hidden md:block">
                <NotificationBell />
              </span>
              <Link
                to="/me"
                className="ml-1 hidden size-10 place-items-center rounded-xl bg-signal-soft font-display font-extrabold text-signal-strong md:grid"
                aria-label="Your profile"
              >
                {user.isGuest ? <UserRound className="size-5" /> : user.name.slice(0, 1)}
              </Link>
            </>
          ) : (
            <Link
              to="/login"
              className="ml-1 rounded-xl px-3 py-2 text-sm font-bold text-signal hover:bg-signal-soft"
            >
              Sign in
            </Link>
          )}
        </div>
      </div>
    </header>
  );
}

function BottomNav() {
  const user = useAuth((s) => s.user);
  const { data: unread = 0 } = useUnreadCount();
  const item = (to: string, label: string, Icon: typeof House, badge = 0) => (
    <NavLink
      to={to}
      end={to === '/'}
      className={({ isActive }) =>
        cn(
          'relative flex flex-1 flex-col items-center gap-0.5 py-2 text-[0.68rem] font-semibold',
          isActive ? 'text-signal' : 'text-muted',
        )
      }
    >
      <span className="relative">
        <Icon className="size-6" aria-hidden />
        <UnreadDot count={badge} />
      </span>
      {label}
    </NavLink>
  );
  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-[900] border-t border-line bg-surface/95 pb-safe backdrop-blur md:hidden"
      aria-label="Main"
    >
      <div className="mx-auto flex max-w-md items-end px-2">
        {item('/', 'Home', House)}
        {item('/map', 'Map', Map)}
        <Link
          to="/report"
          className="-mt-6 flex flex-1 flex-col items-center gap-1 pb-2"
          aria-label="Report an issue"
        >
          <motion.span
            whileTap={{ scale: 0.92 }}
            className="grid size-16 place-items-center rounded-full border-4 border-surface bg-lane text-lane-ink shadow-[var(--shadow-float)]"
          >
            <Camera className="size-7" strokeWidth={2.4} />
          </motion.span>
          <span className="text-[0.68rem] font-bold text-ink">Report</span>
        </Link>
        {item(user ? '/notifications' : '/login', 'Alerts', Bell, unread)}
        {item(user ? '/me' : '/login', user ? 'Me' : 'Sign in', UserRound)}
      </div>
    </nav>
  );
}

export function CitizenLayout() {
  useRealtime();
  const location = useLocation();
  const fullBleed = location.pathname === '/map';
  // Focused flows have their own sticky action bar instead of the tab bar.
  const focused = location.pathname.startsWith('/report') || location.pathname.startsWith('/verify');
  return (
    <div className="flex min-h-dvh flex-col">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:left-3 focus:top-3 focus:z-[2000] focus:rounded-lg focus:bg-lane focus:px-3 focus:py-2 focus:font-bold focus:text-lane-ink"
      >
        Skip to content
      </a>
      <TopBar />
      <main id="main" className={cn('flex-1', fullBleed ? '' : 'pb-28 md:pb-12')}>
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={location.pathname}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.18, ease: 'easeOut' }}
            className={fullBleed ? 'h-full' : undefined}
          >
            <Outlet />
          </motion.div>
        </AnimatePresence>
      </main>
      {!focused && <BottomNav />}
      <ScrollRestoration />
    </div>
  );
}
