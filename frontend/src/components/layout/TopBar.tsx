/**
 * The bar across the top of every screen.
 *
 * Search, notifications, theme and the owner's own menu. Notifications are
 * derived from the dashboard figures already on screen - nothing here invents a
 * number, and nothing here is a notification the owner cannot act on.
 */
import { useQuery } from '@tanstack/react-query'
import { Link, useLocation } from 'react-router-dom'

import { Icon, type IconName } from '@/components/ui/Icon'
import { Popover } from '@/components/ui/Popover'
import { api } from '@/lib/api'
import { useAuth } from '@/lib/auth'
import { formatMoney } from '@/lib/format'
import { useTheme, type ThemeChoice } from '@/lib/theme'
import type { Dashboard } from '@/lib/types'

interface Notice {
  id: string
  title: string
  detail: string
  to: string
  icon: IconName
  tone: 'warn' | 'bad' | 'good' | 'info'
}

const TONES: Record<Notice['tone'], string> = {
  warn: 'bg-amber-50 text-amber-700',
  bad: 'bg-rose-50 text-rose-700',
  good: 'bg-emerald-50 text-emerald-700',
  info: 'bg-brand-50 text-brand-700',
}

/** Everything here comes from a real figure; nothing is fabricated. */
function buildNotices(data: Dashboard | undefined): Notice[] {
  if (!data) return []
  const notices: Notice[] = []

  if (data.members.expiring_soon > 0) {
    notices.push({
      id: 'expiring',
      title: `${data.members.expiring_soon} membership${data.members.expiring_soon === 1 ? '' : 's'} expiring soon`,
      detail: 'Send a renewal reminder before they lapse.',
      to: '/members?status=expiring_soon',
      icon: 'renew',
      tone: 'warn',
    })
  }
  if (data.members.expired > 0) {
    notices.push({
      id: 'expired',
      title: `${data.members.expired} membership${data.members.expired === 1 ? '' : 's'} expired`,
      detail: 'These members can no longer train until they renew.',
      to: '/members?status=expired',
      icon: 'alert',
      tone: 'bad',
    })
  }
  const pending = Number(data.money.pending_payments ?? 0)
  if (pending > 0) {
    const owing = data.payment_status.pending_count + data.payment_status.overdue_count
    notices.push({
      id: 'pending',
      title: `${formatMoney(pending)} still owed`,
      detail: `${owing} member${owing === 1 ? '' : 's'} have an outstanding balance.`,
      to: '/payments',
      icon: 'payments',
      tone: 'warn',
    })
  }
  if (data.members.no_membership > 0) {
    notices.push({
      id: 'no-plan',
      title: `${data.members.no_membership} member${data.members.no_membership === 1 ? '' : 's'} without a plan`,
      detail: 'They are registered but have nothing active.',
      to: '/members',
      icon: 'plans',
      tone: 'info',
    })
  }
  if (data.attendance.active_members > 0) {
    notices.push({
      id: 'attendance',
      title: `Today's attendance is ${data.attendance.percent}%`,
      detail: `${data.attendance.today_count} checked in, ${data.attendance.not_checked_in} active members still to come.`,
      to: '/attendance',
      icon: 'attendance',
      tone: data.attendance.percent >= 50 ? 'good' : 'info',
    })
  }
  return notices
}

export function TopBar({ onOpenSearch, onOpenMenu }: {
  onOpenSearch: () => void
  onOpenMenu: () => void
}) {
  const { user, signOut } = useAuth()
  const location = useLocation()

  // Shares the dashboard's cache entry, so this costs no extra request.
  const { data } = useQuery({
    queryKey: ['dashboard'],
    queryFn: () => api.get<Dashboard>('/dashboard'),
    staleTime: 30_000,
  })
  const notices = buildNotices(data)

  return (
    <header className="sticky top-0 z-40 border-b border-ink-200 bg-surface/85 backdrop-blur-md no-print">
      <div className="flex h-14 items-center gap-2 px-3 sm:gap-3 sm:px-4 lg:h-16 lg:px-6">
        <button
          type="button"
          onClick={onOpenMenu}
          aria-label="Open menu"
          className="pressable flex size-10 shrink-0 items-center justify-center rounded-lg text-ink-600 hover:bg-ink-100 lg:hidden"
        >
          <Icon name="menu" className="size-5" strokeWidth={2} />
        </button>

        {/* Search: a real input on desktop, an icon where space is tight. */}
        <button
          type="button"
          onClick={onOpenSearch}
          className="pressable hidden h-10 flex-1 items-center gap-2.5 rounded-xl border border-ink-200 bg-ink-50 px-3 text-left text-sm text-ink-500 hover:border-ink-300 hover:bg-ink-100 sm:flex sm:max-w-md"
        >
          <Icon name="search" className="size-4" />
          <span className="flex-1 truncate">Search members, payments, plans…</span>
          <kbd className="hidden shrink-0 rounded border border-ink-300 px-1.5 py-0.5 font-sans text-[10px] font-semibold text-ink-500 md:block">
            Ctrl K
          </kbd>
        </button>
        <button
          type="button"
          onClick={onOpenSearch}
          aria-label="Search"
          className="pressable flex size-10 shrink-0 items-center justify-center rounded-lg text-ink-600 hover:bg-ink-100 sm:hidden"
        >
          <Icon name="search" className="size-5" />
        </button>

        <div className="flex flex-1 items-center justify-end gap-1 sm:gap-1.5">
          <NotificationBell notices={notices} />
          <ThemeToggle />
          <ProfileMenu
            name={user?.full_name ?? 'Owner'}
            role={user?.role ?? 'owner'}
            gymName={data?.gym_name}
            onSignOut={signOut}
            currentPath={location.pathname}
          />
        </div>
      </div>
    </header>
  )
}

function NotificationBell({ notices }: { notices: Notice[] }) {
  const count = notices.length
  return (
    <Popover
      label={count ? `Notifications, ${count} waiting` : 'Notifications'}
      width="w-[22rem]"
      trigger={(open) => (
        <span
          className={`pressable relative flex size-10 items-center justify-center rounded-lg ${
            open ? 'bg-ink-100 text-ink-900' : 'text-ink-600 hover:bg-ink-100'
          }`}
        >
          <Icon name="bell" className="size-5" />
          {count > 0 && (
            <span className="absolute top-1.5 right-1.5 flex size-4 items-center justify-center rounded-full bg-brand-500 text-[9px] font-bold text-white tnum">
              {count > 9 ? '9+' : count}
            </span>
          )}
        </span>
      )}
    >
      {(close) => (
        <>
          <div className="flex items-center justify-between border-b border-ink-200 px-4 py-3">
            <p className="text-sm font-semibold text-ink-900">Notifications</p>
            <span className="text-xs text-ink-500">{count} to look at</span>
          </div>
          {count === 0 ? (
            <div className="px-4 py-8 text-center">
              <span className="mx-auto mb-3 flex size-11 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600">
                <Icon name="check" className="size-5" strokeWidth={2.2} />
              </span>
              <p className="text-sm font-medium text-ink-900">Nothing needs you</p>
              <p className="mt-0.5 text-xs text-ink-500">
                No expiries, no dues, nothing overdue.
              </p>
            </div>
          ) : (
            <ul className="max-h-[22rem] divide-y divide-ink-100 overflow-y-auto">
              {notices.map((notice) => (
                <li key={notice.id}>
                  <Link
                    to={notice.to}
                    onClick={close}
                    className="flex gap-3 px-4 py-3 transition-colors hover:bg-ink-50"
                  >
                    <span className={`flex size-9 shrink-0 items-center justify-center rounded-lg ${TONES[notice.tone]}`}>
                      <Icon name={notice.icon} className="size-4.5" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-medium text-ink-900">
                        {notice.title}
                      </span>
                      <span className="mt-0.5 block text-xs text-ink-500">
                        {notice.detail}
                      </span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </Popover>
  )
}

const THEME_OPTIONS: { value: ThemeChoice; label: string; icon: IconName }[] = [
  { value: 'light', label: 'Light', icon: 'sun' },
  { value: 'dark', label: 'Dark', icon: 'moon' },
  { value: 'system', label: 'Match device', icon: 'system' },
]

function ThemeToggle() {
  const { choice, resolved, setChoice } = useTheme()
  return (
    <Popover
      label={`Theme, currently ${choice}`}
      width="w-52"
      trigger={(open) => (
        <span
          className={`pressable flex size-10 items-center justify-center rounded-lg ${
            open ? 'bg-ink-100 text-ink-900' : 'text-ink-600 hover:bg-ink-100'
          }`}
        >
          <Icon name={resolved === 'dark' ? 'moon' : 'sun'} className="size-5" />
        </span>
      )}
    >
      {(close) => (
        <div className="p-1.5">
          {THEME_OPTIONS.map((option) => (
            <button
              key={option.value}
              type="button"
              role="menuitemradio"
              aria-checked={choice === option.value}
              onClick={() => {
                setChoice(option.value)
                close()
              }}
              className={`flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm transition-colors ${
                choice === option.value
                  ? 'bg-brand-50 font-medium text-brand-700'
                  : 'text-ink-700 hover:bg-ink-100'
              }`}
            >
              <Icon name={option.icon} className="size-4.5" />
              <span className="flex-1">{option.label}</span>
              {choice === option.value && (
                <Icon name="check" className="size-4" strokeWidth={2.5} />
              )}
            </button>
          ))}
        </div>
      )}
    </Popover>
  )
}

function ProfileMenu({
  name, role, gymName, onSignOut, currentPath,
}: {
  name: string
  role: string
  gymName?: string
  onSignOut: () => void
  currentPath: string
}) {
  const initials = name.split(' ').filter(Boolean).slice(0, 2)
    .map((part) => part[0]?.toUpperCase()).join('') || 'O'

  return (
    <Popover
      label="Your account"
      width="w-64"
      trigger={(open) => (
        <span
          className={`pressable flex items-center gap-2 rounded-lg py-1 pr-1 pl-1.5 sm:pr-2 ${
            open ? 'bg-ink-100' : 'hover:bg-ink-100'
          }`}
        >
          <span className="flex size-8 items-center justify-center rounded-lg bg-navy-900 text-xs font-semibold text-white">
            {initials}
          </span>
          <span className="hidden min-w-0 text-left sm:block">
            <span className="block max-w-[9rem] truncate text-sm font-medium text-ink-900">
              {name}
            </span>
          </span>
          <Icon name="chevron-down" className="hidden size-4 text-ink-400 sm:block" />
        </span>
      )}
    >
      {(close) => (
        <>
          <div className="border-b border-ink-200 px-4 py-3">
            <p className="truncate text-sm font-semibold text-ink-900">{name}</p>
            <p className="truncate text-xs text-ink-500 capitalize">{role}</p>
            {gymName && (
              <p className="mt-2 flex items-center gap-1.5 truncate text-xs text-ink-500">
                <Icon name="logo" className="size-3.5" />
                {gymName}
              </p>
            )}
          </div>
          <div className="p-1.5">
            <Link
              to="/settings"
              onClick={close}
              className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm text-ink-700 transition-colors hover:bg-ink-100"
              aria-current={currentPath === '/settings' ? 'page' : undefined}
            >
              <Icon name="settings" className="size-4.5" />
              Gym settings
            </Link>
            <Link
              to="/messages"
              onClick={close}
              className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm text-ink-700 transition-colors hover:bg-ink-100"
            >
              <Icon name="messages" className="size-4.5" />
              Message history
            </Link>
            <button
              type="button"
              onClick={() => {
                close()
                onSignOut()
              }}
              className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm text-rose-600 transition-colors hover:bg-rose-50"
            >
              <Icon name="sign-out" className="size-4.5" />
              Sign out
            </button>
          </div>
        </>
      )}
    </Popover>
  )
}
