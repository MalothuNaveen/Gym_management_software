/**
 * The application frame.
 *
 * Desktop: a fixed sidebar beside the content.
 * Phone:   a compact header, a five-item bottom bar for the things done daily,
 *          and a drawer for everything else.
 */
import { useState, type ReactNode } from 'react'
import { NavLink, Outlet, useLocation } from 'react-router-dom'

import { useAuth } from '@/lib/auth'
import { Icon, type IconName } from '@/components/ui/Icon'
import { Drawer } from '@/components/ui/Overlay'

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
  { to: '/settings', label: 'Settings', icon: 'settings' },
]

const PRIMARY = NAV.filter((item) => item.primary)
const SECONDARY = NAV.filter((item) => !item.primary)

export function AppShell() {
  const [menuOpen, setMenuOpen] = useState(false)
  const { user, signOut } = useAuth()
  const location = useLocation()

  const title = NAV.find((item) =>
    item.to === '/' ? location.pathname === '/' : location.pathname.startsWith(item.to),
  )?.label ?? 'Gym Management'

  return (
    <div className="min-h-dvh bg-ink-50">
      {/* Genuinely 1x1 until focused: the visible styling is applied only by
          the focus variants, so padding utilities cannot inflate its box. */}
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-100 focus:rounded-lg focus:bg-ink-900 focus:px-4 focus:py-2 focus:text-sm focus:text-white"
      >
        Skip to content
      </a>

      {/* ---------------- Desktop sidebar ---------------- */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-60 flex-col border-r border-ink-200 bg-white lg:flex no-print">
        <div className="flex h-16 items-center gap-2.5 border-b border-ink-200 px-5">
          <span className="flex size-9 items-center justify-center rounded-xl bg-ink-900 text-white shadow-e1">
            <Icon name="logo" className="size-5" strokeWidth={2} />
          </span>
          <span className="truncate text-sm font-semibold tracking-tight text-ink-900">
            Gym Management
          </span>
        </div>

        <nav className="flex-1 space-y-0.5 overflow-y-auto p-3" aria-label="Main">
          {NAV.map((item) => (
            <SidebarLink key={item.to} item={item} />
          ))}
        </nav>

        <div className="border-t border-ink-200 p-3">
          <div className="mb-2 px-2">
            <p className="truncate text-sm font-medium text-ink-900">{user?.full_name}</p>
            <p className="truncate text-xs text-ink-500 capitalize">{user?.role}</p>
          </div>
          <button
            type="button"
            onClick={signOut}
            className="w-full rounded-lg px-3 py-2 text-left text-sm text-ink-600 transition hover:bg-ink-100 hover:text-ink-900"
          >
            Sign out
          </button>
        </div>
      </aside>

      {/* ---------------- Mobile header ---------------- */}
      <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-ink-200 bg-white/95 px-4 backdrop-blur lg:hidden no-print">
        <button
          type="button"
          onClick={() => setMenuOpen(true)}
          aria-label="Open menu"
          className="pressable -ml-2 flex size-11 items-center justify-center rounded-lg text-ink-600 hover:bg-ink-100"
        >
          <Icon name="menu" className="size-5" strokeWidth={2} />
        </button>
        <h1 className="flex-1 truncate text-base font-semibold tracking-tight text-ink-900">
          {title}
        </h1>
      </header>

      <Drawer open={menuOpen} onClose={() => setMenuOpen(false)} title="Menu">
        <nav className="space-y-0.5 p-3" aria-label="All sections">
          {NAV.map((item) => (
            <SidebarLink key={item.to} item={item} onNavigate={() => setMenuOpen(false)} />
          ))}
        </nav>
        <div className="border-t border-ink-200 p-3">
          <p className="px-3 pb-2 text-sm font-medium text-ink-900">{user?.full_name}</p>
          <button
            type="button"
            onClick={signOut}
            className="w-full rounded-lg px-3 py-2 text-left text-sm text-ink-600 transition hover:bg-ink-100"
          >
            Sign out
          </button>
        </div>
      </Drawer>

      {/* ---------------- Content ---------------- */}
      <main id="main" className="lg:pl-60">
        <div className="mx-auto w-full max-w-6xl px-4 py-5 pb-24 sm:px-6 lg:py-8 lg:pb-10">
          {/* Keyed on the path so each screen fades up as it arrives, which
              makes navigation feel like movement rather than a hard cut. The
              key is the pathname only: changing a filter in the query string
              must not remount the page and throw away its state. */}
          <div key={location.pathname} className="animate-rise">
            <Outlet />
          </div>
        </div>
      </main>

      {/* ---------------- Mobile bottom bar ---------------- */}
      <nav
        className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-5 border-t border-ink-200 bg-white/95 backdrop-blur lg:hidden no-print"
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
    </div>
  )
}

function SidebarLink({ item, onNavigate }: { item: NavItem; onNavigate?: () => void }) {
  return (
    <NavLink
      to={item.to}
      end={item.to === '/'}
      onClick={onNavigate}
      className={({ isActive }) =>
        `pressable relative flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium ${
          isActive
            ? 'bg-ink-900 text-white shadow-e1'
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
          isActive ? 'text-ink-900' : 'text-ink-500'
        }`
      }
    >
      {({ isActive }) => (
        <>
          {/* A short rule above the current tab. On a phone the label is only
              ten pixels tall, so weight and colour alone are easy to miss. */}
          <span
            className={`absolute top-0 h-0.5 rounded-full bg-ink-900 transition-all duration-200 ease-out ${
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
