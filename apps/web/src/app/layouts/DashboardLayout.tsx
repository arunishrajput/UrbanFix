import {
  ChartColumn,
  ClipboardList,
  Inbox,
  LayoutDashboard,
  LogOut,
  Menu,
  Moon,
  ScrollText,
  Settings,
  ShieldAlert,
  Shapes,
  Sun,
  Users,
  MapPinned,
  X,
} from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { useState } from 'react';
import { Link, NavLink, Outlet, ScrollRestoration, useLocation, useNavigate } from 'react-router';
import { LABELS } from '@urbanfix/shared';
import { Wordmark } from '../../components/Wordmark';
import { useAuth } from '../../lib/auth';
import { cn } from '../../lib/cn';
import { useRealtime } from '../../lib/realtime';
import { useTheme } from '../../lib/theme';
import { NotificationBell } from '../../features/notifications/NotificationBell';

interface NavItem {
  to: string;
  label: string;
  Icon: typeof Inbox;
  end?: boolean;
}

function useNav(): { title: string; items: NavItem[] }[] {
  const user = useAuth((s) => s.user);
  const groups: { title: string; items: NavItem[] }[] = [
    {
      title: 'Operations',
      items: [
        { to: '/dashboard', label: 'Issues', Icon: Inbox, end: true },
        { to: '/dashboard/assignments', label: 'My assignments', Icon: ClipboardList },
        ...(user?.role !== 'STAFF'
          ? [{ to: '/dashboard/analytics', label: 'Analytics', Icon: ChartColumn }]
          : []),
      ],
    },
  ];
  if (user?.role === 'ADMIN') {
    groups.push({
      title: 'Administration',
      items: [
        { to: '/admin', label: 'People', Icon: Users, end: true },
        { to: '/admin/categories', label: 'Categories', Icon: Shapes },
        { to: '/admin/wards', label: 'Wards', Icon: MapPinned },
        { to: '/admin/moderation', label: 'Moderation', Icon: ShieldAlert },
        { to: '/admin/settings', label: 'Settings', Icon: Settings },
        { to: '/admin/audit', label: 'Audit log', Icon: ScrollText },
      ],
    });
  }
  return groups;
}

function SideNav({ onNavigate }: { onNavigate?: () => void }) {
  const groups = useNav();
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  return (
    <div className="flex h-full flex-col gap-6 p-4">
      <div className="flex items-center justify-between px-2 pt-1">
        <Wordmark to="/dashboard" />
      </div>
      <nav className="flex-1 space-y-6" aria-label="Dashboard">
        {groups.map((g) => (
          <div key={g.title}>
            <p className="sign-label px-3 pb-2">{g.title}</p>
            <ul className="space-y-0.5">
              {g.items.map(({ to, label, Icon, end }) => (
                <li key={to}>
                  <NavLink
                    to={to}
                    end={end}
                    onClick={onNavigate}
                    className={({ isActive }) =>
                      cn(
                        'relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold transition-colors',
                        isActive
                          ? 'bg-surface text-ink shadow-sm'
                          : 'text-muted hover:bg-surface/60 hover:text-ink',
                      )
                    }
                  >
                    {({ isActive }) => (
                      <>
                        {isActive && (
                          <motion.span
                            layoutId="dash-nav"
                            className="absolute inset-y-2 left-0 w-1 rounded-full bg-lane"
                          />
                        )}
                        <Icon className="size-[1.1rem]" aria-hidden />
                        {label}
                      </>
                    )}
                  </NavLink>
                </li>
              ))}
            </ul>
          </div>
        ))}
        <div>
          <p className="sign-label px-3 pb-2">Public site</p>
          <Link
            to="/"
            className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold text-muted hover:text-ink"
          >
            <LayoutDashboard className="size-[1.1rem]" /> Citizen app
          </Link>
        </div>
      </nav>
      {user && (
        <div className="rounded-2xl border border-line bg-surface p-3">
          <p className="truncate text-sm font-bold">{user.name}</p>
          <p className="text-xs text-muted">{LABELS.role[user.role]}</p>
          <button
            onClick={async () => {
              await logout();
              navigate('/login');
            }}
            className="mt-2 inline-flex items-center gap-1.5 text-xs font-semibold text-muted hover:text-cone-ink"
          >
            <LogOut className="size-3.5" /> Sign out
          </button>
        </div>
      )}
    </div>
  );
}

export function DashboardLayout() {
  useRealtime();
  const [open, setOpen] = useState(false);
  const { theme, toggle } = useTheme();
  const location = useLocation();
  return (
    <div className="min-h-dvh lg:grid lg:grid-cols-[16rem_1fr]">
      <aside className="sticky top-0 hidden h-dvh border-r border-line bg-surface-2 lg:block">
        <SideNav />
      </aside>
      <AnimatePresence>
        {open && (
          <>
            <motion.div
              className="fixed inset-0 z-[950] bg-black/40 lg:hidden"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setOpen(false)}
            />
            <motion.aside
              className="fixed inset-y-0 left-0 z-[960] w-72 bg-surface-2 shadow-xl lg:hidden"
              initial={{ x: '-100%' }}
              animate={{ x: 0 }}
              exit={{ x: '-100%' }}
              transition={{ type: 'spring', damping: 30, stiffness: 300 }}
            >
              <button
                onClick={() => setOpen(false)}
                className="absolute right-3 top-4 rounded-lg p-2"
                aria-label="Close menu"
              >
                <X className="size-5" />
              </button>
              <SideNav onNavigate={() => setOpen(false)} />
            </motion.aside>
          </>
        )}
      </AnimatePresence>
      <div className="min-w-0">
        <header className="sticky top-0 z-[900] flex h-14 items-center gap-2 border-b border-line bg-bg/85 px-4 backdrop-blur-md">
          <button onClick={() => setOpen(true)} className="rounded-lg p-2 lg:hidden" aria-label="Open menu">
            <Menu className="size-5" />
          </button>
          <span className="lg:hidden">
            <Wordmark to="/dashboard" />
          </span>
          <div className="ml-auto flex items-center gap-1">
            <button
              onClick={toggle}
              className="grid size-10 place-items-center rounded-xl hover:bg-surface-2"
              aria-label={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
            >
              {theme === 'dark' ? <Sun className="size-5" /> : <Moon className="size-5" />}
            </button>
            <NotificationBell />
          </div>
        </header>
        <main id="main" className="mx-auto max-w-[96rem] p-4 lg:p-6">
          <motion.div
            key={location.pathname}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.18 }}
          >
            <Outlet />
          </motion.div>
        </main>
      </div>
      <ScrollRestoration />
    </div>
  );
}
