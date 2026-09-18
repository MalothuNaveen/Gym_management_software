/**
 * Display primitives: cards, stat tiles, badges, empty and loading states,
 * pagination, and the responsive table that becomes a card list on phones.
 */
import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'

import { useCountUp } from '@/lib/motion'
import { Button, LinkButton } from './Button'
import { Icon, type IconName } from './Icon'

// --- Card -----------------------------------------------------------------

export function Card({
  children, className = '', padded = true,
}: {
  children: ReactNode
  className?: string
  padded?: boolean
}) {
  return (
    <div
      className={`rounded-xl border border-ink-200 bg-surface shadow-e1 ${padded ? 'p-4 sm:p-5' : ''} ${className}`}
    >
      {children}
    </div>
  )
}

export function CardHeader({
  title, subtitle, action, className = '',
}: {
  title: string
  subtitle?: string
  action?: ReactNode
  className?: string
}) {
  return (
    <div className={`mb-4 flex items-start justify-between gap-3 ${className}`}>
      <div className="min-w-0">
        <h2 className="truncate text-base font-semibold text-ink-900">{title}</h2>
        {subtitle && <p className="mt-0.5 text-sm text-ink-500">{subtitle}</p>}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  )
}

// --- Stat tile ------------------------------------------------------------

export function Stat({
  label, value, count, format, hint, tone = 'default', to, loading,
}: {
  label: string
  value?: ReactNode
  /** Animates up to this figure instead of appearing at it. */
  count?: number
  /** Formats the animated figure, e.g. as currency. */
  format?: (value: number) => string
  hint?: string
  tone?: 'default' | 'good' | 'warn' | 'bad' | 'money'
  to?: string
  loading?: boolean
}) {
  const TONES = {
    default: 'text-ink-900',
    good: 'text-emerald-700',
    warn: 'text-amber-700',
    bad: 'text-rose-700',
    money: 'text-ink-900',
  }

  // The hook has to run unconditionally; it is simply ignored when the caller
  // passes a ready-made `value`.
  const counted = useCountUp(count ?? 0)
  const shown = count === undefined
    ? value
    : (format ?? ((n: number) => String(Math.round(n))))(counted)

  const body = (
    <>
      <p className="text-[11px] font-semibold tracking-wide text-ink-500 uppercase">{label}</p>
      {loading ? (
        <div className="skeleton mt-2 h-7 w-20" />
      ) : (
        <p className={`mt-1 text-2xl font-semibold tracking-tight tnum ${TONES[tone]}`}>
          {shown}
        </p>
      )}
      {hint && <p className="mt-0.5 truncate text-xs text-ink-500">{hint}</p>}
    </>
  )

  const className = 'block rounded-xl border border-ink-200 bg-surface p-4 shadow-e1'

  if (to) {
    return (
      <Link to={to} className={`lift ${className} hover:border-ink-300`}>
        {body}
      </Link>
    )
  }
  return <div className={className}>{body}</div>
}

// --- Badge ----------------------------------------------------------------

type BadgeTone = 'neutral' | 'success' | 'warning' | 'danger' | 'info'

// Tinted with an alpha of the status colour rather than its -50 shade. A fixed
// light tint stays light in dark mode and glares; a 12% wash of the same hue
// sits correctly on both a white card and a near-black one.
const BADGE_TONES: Record<BadgeTone, string> = {
  neutral: 'bg-ink-100 text-ink-700 ring-ink-300/60',
  success: 'bg-emerald-500/12 text-emerald-700 ring-emerald-500/30 dark:text-emerald-400',
  warning: 'bg-amber-500/14 text-amber-700 ring-amber-500/30 dark:text-amber-400',
  danger: 'bg-rose-500/12 text-rose-700 ring-rose-500/30 dark:text-rose-400',
  info: 'bg-brand-500/12 text-brand-700 ring-brand-500/30 dark:text-brand-400',
}

export function Badge({
  children, tone = 'neutral', className = '',
}: {
  children: ReactNode
  tone?: BadgeTone
  className?: string
}) {
  return (
    <span
      className={`inline-flex items-center rounded-md px-2 py-0.5 text-xs font-semibold ring-1 ring-inset ${BADGE_TONES[tone]} ${className}`}
    >
      {children}
    </span>
  )
}

/** Membership status. Always shows the word, never colour alone. */
export function StatusBadge({ status }: { status: string }) {
  const MAP: Record<string, { label: string; tone: BadgeTone }> = {
    active: { label: 'Active', tone: 'success' },
    expiring_soon: { label: 'Expiring Soon', tone: 'warning' },
    expired: { label: 'Expired', tone: 'danger' },
    no_membership: { label: 'No Membership', tone: 'neutral' },
    archived: { label: 'Archived', tone: 'neutral' },
    cancelled: { label: 'Cancelled', tone: 'neutral' },
    inactive: { label: 'Inactive', tone: 'neutral' },
  }
  const entry = MAP[status] ?? { label: status, tone: 'neutral' as BadgeTone }
  return <Badge tone={entry.tone}>{entry.label}</Badge>
}

// --- Empty state ----------------------------------------------------------

export function EmptyState({
  icon = 'inbox', title, description, actionLabel, actionTo, onAction,
}: {
  icon?: IconName
  title: string
  description?: string
  actionLabel?: string
  actionTo?: string
  onAction?: () => void
}) {
  return (
    <div className="animate-fade-in flex flex-col items-center justify-center px-6 py-12 text-center">
      <span className="mb-4 flex size-14 items-center justify-center rounded-2xl bg-ink-100 text-ink-400">
        <Icon name={icon} className="size-7" strokeWidth={1.6} />
      </span>
      <h3 className="text-base font-semibold text-ink-900">{title}</h3>
      {description && <p className="mt-1 max-w-sm text-sm text-ink-500">{description}</p>}
      {actionLabel && actionTo && (
        <LinkButton to={actionTo} className="mt-5">
          {actionLabel}
        </LinkButton>
      )}
      {actionLabel && onAction && !actionTo && (
        <Button onClick={onAction} className="mt-5">
          {actionLabel}
        </Button>
      )}
    </div>
  )
}

// --- Loading / error ------------------------------------------------------

export function LoadingRows({ count = 4 }: { count?: number }) {
  return (
    <div className="space-y-3 p-4" aria-live="polite" aria-busy="true">
      <span className="sr-only">Loading…</span>
      {Array.from({ length: count }).map((_, index) => (
        <div key={index} className="flex items-center gap-3">
          <div className="skeleton size-10 rounded-full" />
          <div className="flex-1 space-y-2">
            <div className="skeleton h-3.5 w-1/3" />
            <div className="skeleton h-3 w-1/4" />
          </div>
        </div>
      ))}
    </div>
  )
}

export function ErrorState({
  message = 'Something went wrong while loading this page.',
  onRetry,
}: {
  message?: string
  onRetry?: () => void
}) {
  return (
    <div className="animate-fade-in flex flex-col items-center justify-center px-6 py-12 text-center">
      <span className="mb-4 flex size-14 items-center justify-center rounded-2xl bg-rose-50 text-rose-500">
        <Icon name="alert" className="size-7" strokeWidth={1.6} />
      </span>
      <p className="max-w-sm text-sm text-ink-700">{message}</p>
      {onRetry && (
        <Button variant="secondary" onClick={onRetry} className="mt-4">
          Try again
        </Button>
      )}
    </div>
  )
}

// --- Table ----------------------------------------------------------------

/**
 * Desktop table. On phones, screens render `MobileCardList` instead - a table
 * squeezed onto a 360px screen is unusable, so we do not ship one.
 */
export function Table({
  head, children, className = '',
}: {
  head: ReactNode
  children: ReactNode
  className?: string
}) {
  return (
    <div className={`scroll-x ${className}`}>
      <table className="w-full min-w-full border-collapse text-sm">
        <thead>
          <tr className="border-b border-ink-200 text-left">{head}</tr>
        </thead>
        <tbody className="divide-y divide-ink-100">{children}</tbody>
      </table>
    </div>
  )
}

export function Th({
  children, className = '', align = 'left',
}: {
  children: ReactNode
  className?: string
  align?: 'left' | 'right' | 'center'
}) {
  return (
    <th
      scope="col"
      className={`px-3 py-3 text-${align} text-[11px] font-semibold tracking-wide text-ink-500 uppercase ${className}`}
    >
      {children}
    </th>
  )
}

export function Td({
  children, className = '', align = 'left',
}: {
  children: ReactNode
  className?: string
  align?: 'left' | 'right' | 'center'
}) {
  return <td className={`px-3 py-3 text-${align} text-ink-800 ${className}`}>{children}</td>
}

// --- Pagination -----------------------------------------------------------

export function Pagination({
  page, pages, total, onChange, itemLabel = 'results',
}: {
  page: number
  pages: number
  total: number
  onChange: (page: number) => void
  itemLabel?: string
}) {
  if (total === 0) return null
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-ink-200 px-4 py-3">
      <p className="text-sm text-ink-500">
        {total} {itemLabel}
      </p>
      {pages > 1 && (
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="secondary"
            disabled={page <= 1}
            onClick={() => onChange(page - 1)}
          >
            Previous
          </Button>
          <span className="px-1 text-sm text-ink-600 tnum">
            {page} / {pages}
          </span>
          <Button
            size="sm"
            variant="secondary"
            disabled={page >= pages}
            onClick={() => onChange(page + 1)}
          >
            Next
          </Button>
        </div>
      )}
    </div>
  )
}

// --- Detail row -----------------------------------------------------------

export function DetailRow({
  label, value, className = '',
}: {
  label: string
  value: ReactNode
  className?: string
}) {
  return (
    <div className={`flex items-baseline justify-between gap-4 py-2 ${className}`}>
      {/* min-w-0 lets long values wrap instead of widening the whole dialog. */}
      <dt className="shrink-0 text-sm text-ink-500">{label}</dt>
      <dd className="min-w-0 text-right text-sm font-medium break-words text-ink-900">
        {value}
      </dd>
    </div>
  )
}
