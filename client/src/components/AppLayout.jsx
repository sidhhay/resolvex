/**
 * Application shell: navigation, notification bell, theme toggle, account menu.
 *
 * The nav is built from the caller's role, so a student never sees a link they
 * would only be bounced off. (The API is still the authority — see
 * ProtectedRoute's note.)
 */
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import {
  BarChart3,
  FilePlus2,
  Inbox,
  LayoutDashboard,
  LogOut,
  Monitor,
  Moon,
  ShieldCheck,
  Sun,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext.jsx';
import { useTheme } from '../context/ThemeContext.jsx';
import { NotificationBell } from './NotificationBell.jsx';
import { homePathFor } from './ProtectedRoute.jsx';

/** @type {Record<string, Array<{ to: string, label: string, icon: any }>>} */
const NAV_BY_ROLE = {
  student: [
    { to: '/complaints', label: 'My complaints', icon: Inbox },
    { to: '/complaints/new', label: 'File a complaint', icon: FilePlus2 },
  ],
  handler: [
    { to: '/dashboard', label: 'Queue', icon: LayoutDashboard },
    { to: '/complaints', label: 'My complaints', icon: Inbox },
    { to: '/complaints/new', label: 'File a complaint', icon: FilePlus2 },
  ],
  admin: [
    { to: '/admin/analytics', label: 'Analytics', icon: BarChart3 },
    { to: '/dashboard', label: 'All complaints', icon: LayoutDashboard },
    { to: '/admin/users', label: 'Users', icon: ShieldCheck },
  ],
};

const THEME_ICONS = { system: Monitor, light: Sun, dark: Moon };

export function AppLayout() {
  const { user, logout } = useAuth();
  const { theme, cycle } = useTheme();
  const navigate = useNavigate();

  const links = NAV_BY_ROLE[user?.role ?? 'student'] ?? [];
  const ThemeIcon = THEME_ICONS[theme];

  return (
    <div className="flex min-h-dvh flex-col">
      {/* Keyboard users land here first; the nav is long on the handler view. */}
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-md focus:bg-surface focus:px-3 focus:py-2 focus:text-sm focus:ring-1 focus:ring-line"
      >
        Skip to content
      </a>

      <header className="sticky top-0 z-30 border-b border-line bg-surface/85 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-7xl items-center gap-4 px-4">
          <button
            type="button"
            onClick={() => navigate(homePathFor(user?.role))}
            className="flex shrink-0 items-center gap-2"
          >
            <ShieldCheck size={18} className="text-series-1" aria-hidden />
            <span className="text-sm font-semibold tracking-tight text-ink">ResolveX</span>
          </button>

          <nav aria-label="Main" className="ml-2 hidden items-center gap-1 sm:flex">
            {links.map(({ to, label, icon: Icon }) => (
              <NavLink
                key={to}
                to={to}
                end={to === '/complaints'}
                className={({ isActive }) =>
                  `inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-sm transition ${
                    isActive
                      ? 'bg-surface-2 font-medium text-ink'
                      : 'text-ink-secondary hover:bg-surface-2 hover:text-ink'
                  }`
                }
              >
                <Icon size={15} aria-hidden />
                {label}
              </NavLink>
            ))}
          </nav>

          <div className="ml-auto flex items-center gap-1">
            <button
              type="button"
              onClick={cycle}
              className="rounded-md p-2 text-ink-secondary transition hover:bg-surface-2 hover:text-ink"
              aria-label={`Theme: ${theme}. Click to change.`}
              title={`Theme: ${theme}`}
            >
              <ThemeIcon size={17} aria-hidden />
            </button>

            <NotificationBell />

            <div className="ml-1 hidden items-center gap-2 border-l border-line pl-3 md:flex">
              <div className="text-right leading-tight">
                <p className="text-xs font-medium text-ink">{user?.name}</p>
                <p className="text-[11px] capitalize text-ink-muted">
                  {user?.role}
                  {user?.departmentName ? ` · ${user.departmentName}` : ''}
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={logout}
              className="rounded-md p-2 text-ink-secondary transition hover:bg-surface-2 hover:text-ink"
              aria-label="Sign out"
              title="Sign out"
            >
              <LogOut size={17} aria-hidden />
            </button>
          </div>
        </div>

        {/* The same links, wrapped, on small screens. */}
        <nav aria-label="Main" className="flex gap-1 overflow-x-auto border-t border-line px-4 py-2 sm:hidden">
          {links.map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              end={to === '/complaints'}
              className={({ isActive }) =>
                `inline-flex shrink-0 items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs transition ${
                  isActive ? 'bg-surface-2 font-medium text-ink' : 'text-ink-secondary'
                }`
              }
            >
              <Icon size={14} aria-hidden />
              {label}
            </NavLink>
          ))}
        </nav>
      </header>

      <main id="main" className="mx-auto w-full max-w-7xl flex-1 px-4 py-6">
        <Outlet />
      </main>

      <footer className="border-t border-line px-4 py-4">
        <p className="mx-auto max-w-7xl text-[11px] text-ink-muted">
          ResolveX — grievances are escalated automatically when they go unanswered.
        </p>
      </footer>
    </div>
  );
}
