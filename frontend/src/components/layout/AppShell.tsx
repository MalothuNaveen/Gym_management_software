/**
 * The application frame.
 *
 * Desktop: a deep-navy sidebar that can be collapsed to icons, a top bar with
 *          search, notifications, theme and the owner's menu.
 * Phone:   the same top bar, a drawer for the full navigation, and a five-item
 *          bottom bar for the things done every day.
 *
 * The phone layout is not the desktop one shrunk: the sidebar becomes a drawer,
 * the daily actions move to the thumb, and the page gets the whole width.
 */
import { useEffect, useState, type ReactNode } from 'react'
import { NavLink, Outlet, useLocation } from 'react-router-dom'

import { CommandPalette, useCommandPalette } from '@/components/layout/CommandPalette'
import { TopBar } from '@/components/layout/TopBar'
import { Icon, type IconName } from '@/components/ui/Icon'
import { Drawer } from '@/components/ui/Overlay'
import { useAuth } from '@/lib/auth'

interface NavItem {
  to: string
  label: string
  icon: IconName
  /** Shown in the phone bottom bar (max five). */
  primary?: boolean
}

const NAV: NavItem[] = [
  { to: '/', label: 'Dashboard', icon: 'dashboard', primary: true },
  { to: '/members', label: 'Members', icon: 'members', primary: true },
  { to: '/attendance', label: 'Attendance', icon: 'attendance', primary: true },
  { to: '/payments', label: 'Payments', icon: 'payments', primary: true },
  { to: '/plans', label: 'Membership Plans', icon: 'plans' },
  { to: '/staff', label: 'Staff', icon: 'staff' },
  { to: '/expenses', label: 'Expenses', icon: 'expenses' },
  { to: '/reports', label: 'Reports', icon: 'reports' },
  { to: '/messages', label: 'Messages', icon: 'messages' },
  { to: '/settings', label: 'Settings', icon: 'settings' },
]

const PRIMARY = NAV.filter((item) => item.primary)
const SECONDARY = NAV.filter((item) => !item.primary)

const COLLAPSE_KEY = 'gym.sidebar.collapsed'

export function AppShell() {
  const [menuOpen, setMenuOpen] = useState(false)
  const [collapsed, setCollapsed] = useState(() => {
    try {
      return localStorage.getItem(COLLAPSE_KEY) === '1'
    } catch {
      return false
    }
  })
  const { user, signOut } = useAuth()
  const location = useLocation()
  const palette = useCommandPalette()

  useEffect(() => {
    try {
      localStorage.setItem(COLLAPSE_KEY, collapsed ? '1' : '0')
    } catch {
      /* the preference simply will not survive a reload */
    }
  }, [collapsed])

  // A route change should never leave the drawer hanging open behind the page.
  useEffect(() => {
    setMenuOpen(false)
  }, [location.pathname])

  return (
    <div className="min-h-dvh bg-canvas">
      {/* Genuinely 1x1 until focused: the visible styling is applied only by
          the focus variants, so padding utilities cannot inflate its box. */}
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-100 focus:rounded-lg focus:bg-brand-600 focus:px-4 focus:py-2 focus:text-sm focus:text-white"
      >
        Skip to content
      </a>

      {/* ---------------- Desktop sidebar ---------------- */}
      <aside
        className={`fixed inset-y-0 left-0 z-30 hidden flex-col bg-navy-900 transition-[width] duration-200 ease-out lg:flex no-print ${
          collapsed ? 'w-[4.5rem]' : 'w-64'
        }`}
      >
        <div className={`flex h-16 shrink-0 items-center gap-2.5 ${collapsed ? 'justify-center px-2' : 'px-5'}`}>
          <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-brand-500 text-white shadow-e2">
            <Icon name="logo" className="size-5" strokeWidth={2} />
          </span>
          {!collapsed && (
            <span className="min-w-0">
              <span className="block truncate text-sm font-semibold tracking-tight text-white">
                Gym Management
              </span>
              <span className="block truncate text-[11px] text-white/45">
                Member &amp; payment system
              </span>
            </span>
          )}
        </div>

        <nav
          className="flex-1 space-y-1 overflow-y-auto overflow-x-hidden px-3 py-2"
          aria-label="Main"
        >
          {NAV.map((item) => (
            <SidebarLink key={item.to} item={item} collapsed={collapsed} />
          ))}
        </nav>

        <div className="shrink-0 border-t border-white/10 p-3">
          {!collapsed && (
            <div className="mb-1 flex items-center gap-2.5 rounded-lg px-2 py-2">
              <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-white/10 text-xs font-semibold text-white">
                {initialsOf(user?.full_name)}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium text-white">
                  {user?.full_name}
                </span>
                <span className="block truncate text-[11px] text-white/45 capitalize">
                  {user?.role}
                </span>
              </span>
            </div>
          )}
          <button
            type="button"
            onClick={signOut}
            title="Sign out"
            className={`pressable flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm text-white/60 hover:bg-white/10 hover:text-white ${
              collapsed ? 'justify-center px-0' : ''
            }`}
          >
            <Icon name="sign-out" className="size-5" />
            {!collapsed && <span>Sign out</span>}
          </button>
          <button
            type="button"
            onClick={() => setCollapsed((current) => !current)}
            aria-label={collapsed ? 'Expand the sidebar' : 'Collapse the sidebar'}
            className={`pressable mt-1 flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm text-white/40 hover:bg-white/10 hover:text-white ${
              collapsed ? 'justify-center px-0' : ''
            }`}
          >
            <Icon name={collapsed ? 'expand' : 'collapse'} className="size-5" />
            {!collapsed && <span>Collapse</span>}
          </button>
        </div>
      </aside>

      {/* ---------------- Phone drawer ---------------- */}
      <Drawer open={menuOpen} onClose={() => setMenuOpen(false)} title="Menu">
        <nav className="space-y-1 p-3" aria-label="All sections">
          {NAV.map((item) => (
            <DrawerLink key={item.to} item={item} onNavigate={() => setMenuOpen(false)} />
          ))}
        </nav>
        <div className="border-t border-ink-200 p-3">
          <div className="mb-1 flex items-center gap-2.5 px-2 py-1.5">
            <span className="flex size-9 items-center justify-center rounded-lg bg-navy-900 text-xs font-semibold text-white">
              {initialsOf(user?.full_name)}
            </span>
            <span className="min-w-0">
              <span className="block truncate text-sm font-medium text-ink-900">
                {user?.full_name}
              </span>
              <span className="block truncate text-xs text-ink-500 capitalize">
                {user?.role}
              </span>
            </span>
          </div>
          <button
            type="button"
            onClick={signOut}
            className="pressable flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm text-rose-600 hover:bg-rose-50"
          >
            <Icon name="sign-out" className="size-5" />
            Sign out
          </button>
        </div>
      </Drawer>

      {/* ---------------- Content ---------------- */}
      <div className={`transition-[padding] duration-200 ease-out ${collapsed ? 'lg:pl-[4.5rem]' : 'lg:pl-64'}`}>
        <TopBar
          onOpenSearch={() => palette.setOpen(true)}
          onOpenMenu={() => setMenuOpen(true)}
        />
        <main id="main">
          <div className="mx-auto w-full max-w-[85rem] px-4 py-5 pb-24 sm:px-6 lg:py-7 lg:pb-10">
            {/* Keyed on the path so each screen fades up as it arrives, which
                makes navigation feel like movement rather than a hard cut. The
                key is the pathname only: changing a filter in the query string
                must not remount the page and throw away its state. */}
            <div key={location.pathname} className="animate-rise">
              <Outlet />
            </div>
          </div>
        </main>
      </div>

      {/* ---------------- Phone bottom bar ---------------- */}
      <nav
        className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-5 border-t border-ink-200 bg-surface/90 backdrop-blur-md lg:hidden no-print"
        style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
        aria-label="Quick navigation"
      >
        {PRIMARY.map((item) => (
          <BottomLink key={item.to} item={item} />
        ))}
        <button
          type="button"
          onClick={() => setMenuOpen(true)}
          className="pressable flex flex-col items-center justify-center gap-1 py-2 text-ink-500 active:bg-ink-50"
        >
          <Icon name="more" className="size-5" />
          <span className="text-[10px] font-medium">More</span>
        </button>
      </nav>

      <CommandPalette open={palette.open} onClose={() => palette.setOpen(false)} />
    </div>
  )
}

function initialsOf(name: string | undefined): string {
  return (name ?? '').split(' ').filter(Boolean).slice(0, 2)
    .map((part) => part[0]?.toUpperCase()).join('') || 'O'
}

function SidebarLink({ item, collapsed }: { item: NavItem; collapsed: boolean }) {
  return (
    <NavLink
      to={item.to}
      end={item.to === '/'}
      title={collapsed ? item.label : undefined}
      className={({ isActive }) =>
        `pressable group relative flex items-center gap-3 rounded-lg py-2.5 text-sm font-medium ${
          collapsed ? 'justify-center px-0' : 'px-3'
        } ${
          isActive
            ? 'bg-white/10 text-white'
            : 'text-white/55 hover:bg-white/5 hover:text-white'
        }`
      }
    >
      {({ isActive }) => (
        <>
          {/* A bright rule on the leading edge. Colour alone is too quiet
              against navy, especially on a cheap screen in a bright gym. */}
          <span
            className={`absolute left-0 h-6 w-1 rounded-r-full bg-brand-400 transition-all duration-200 ease-out ${
              isActive ? 'opacity-100' : 'w-0 opacity-0'
            }`}
            aria-hidden
          />
          <Icon
            name={item.icon}
            className={`size-5 ${isActive ? 'text-brand-400' : ''}`}
            strokeWidth={isActive ? 2 : 1.75}
          />
          {!collapsed && <span className="truncate">{item.label}</span>}
        </>
      )}
    </NavLink>
  )
}

function DrawerLink({ item, onNavigate }: { item: NavItem; onNavigate: () => void }) {
  return (
    <NavLink
      to={item.to}
      end={item.to === '/'}
      onClick={onNavigate}
      className={({ isActive }) =>
        `pressable flex items-center gap-3 rounded-lg px-3 py-3 text-sm font-medium ${
          isActive
            ? 'bg-navy-900 text-white'
            : 'text-ink-600 hover:bg-ink-100 hover:text-ink-900'
        }`
      }
    >
      {({ isActive }) => (
        <>
          <Icon name={item.icon} className="size-5" strokeWidth={isActive ? 2 : 1.75} />
          <span className="truncate">{item.label}</span>
        </>
      )}
    </NavLink>
  )
}

function BottomLink({ item }: { item: NavItem }) {
  return (
    <NavLink
      to={item.to}
      end={item.to === '/'}
      className={({ isActive }) =>
        `pressable relative flex flex-col items-center justify-center gap-1 py-2 active:bg-ink-50 ${
          isActive ? 'text-brand-600' : 'text-ink-500'
        }`
      }
    >
      {({ isActive }) => (
        <>
          {/* A short rule above the current tab. On a phone the label is only
              ten pixels tall, so weight and colour alone are easy to miss. */}
          <span
            className={`absolute top-0 h-0.5 rounded-full bg-brand-500 transition-all duration-200 ease-out ${
              isActive ? 'w-8 opacity-100' : 'w-0 opacity-0'
            }`}
            aria-hidden
          />
          <Icon name={item.icon} className="size-5" strokeWidth={isActive ? 2.1 : 1.75} />
          <span className={`text-[10px] ${isActive ? 'font-semibold' : 'font-medium'}`}>
            {item.label}
          </span>
        </>
      )}
    </NavLink>
  )
}

/** Page title bar, used at the top of each screen. */
export function PageHeader({
  title, subtitle, actions, back,
}: {
  title: string
  subtitle?: string
  actions?: ReactNode
  back?: { to: string; label: string }
}) {
  return (
    <div className="mb-5">
      {back && (
        <NavLink
          to={back.to}
          // Generous vertical padding gives a finger-sized tap area; the
          // negative margin keeps the visual spacing tight.
          className="group -mt-2 mb-0.5 inline-flex min-h-11 items-center gap-1.5 py-2 pr-2 text-sm text-ink-500 transition-colors hover:text-ink-900"
        >
          <Icon
            name="arrow-left"
            className="size-4 transition-transform duration-200 ease-out group-hover:-translate-x-0.5"
          />
          {back.label}
        </NavLink>
      )}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-xl font-semibold text-ink-900 sm:text-2xl">{title}</h1>
          {subtitle && <p className="mt-1 text-sm text-ink-500">{subtitle}</p>}
        </div>
        {actions && <div className="flex shrink-0 flex-wrap gap-2 no-print">{actions}</div>}
      </div>
    </div>
  )
}

export { SECONDARY as SECONDARY_NAV }
