/**
 * The dashboard.
 *
 * Reorganised, not reduced: every figure the old screen showed is still here.
 * The order follows the morning: what needs doing, who the members are, what
 * the money looks like, who is in today, and who to ring.
 */
import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { Link } from 'react-router-dom'

import { RenewalReminderDialog } from '@/components/RenewalReminderDialog'
import { PageHeader } from '@/components/layout/AppShell'
import { Avatar } from '@/components/ui/Avatar'
import { Button, LinkButton } from '@/components/ui/Button'
import { AreaChart, BarRow, Donut, ProgressRing } from '@/components/ui/Chart'
import {
  Badge, Card, EmptyState, ErrorState, Stat, StatusBadge,
} from '@/components/ui/Data'
import { Icon, type IconName } from '@/components/ui/Icon'
import { api, errorMessage } from '@/lib/api'
import { useAuth } from '@/lib/auth'
import {
  describeDays, formatDate, formatMoney, formatMoneyCompact, formatPhone,
} from '@/lib/format'
import type { Dashboard, RevenueSeries } from '@/lib/types'

const QUICK_ACTIONS: {
  to: string; label: string; detail: string; icon: IconName
}[] = [
  { to: '/members/new', label: 'Add Member', detail: 'Register and start a plan', icon: 'plus' },
  { to: '/payments?record=1', label: 'Record Payment', detail: 'Collect and issue a receipt', icon: 'payments' },
  { to: '/attendance', label: 'Mark Attendance', detail: 'Check members in for today', icon: 'attendance' },
  { to: '/members?status=expiring_soon', label: 'Renewals', detail: 'Members due to renew', icon: 'renew' },
]

const PERIODS = [
  { value: 'daily' as const, label: 'Daily' },
  { value: 'weekly' as const, label: 'Weekly' },
  { value: 'monthly' as const, label: 'Monthly' },
]

function greeting(): string {
  const hour = new Date().getHours()
  if (hour < 12) return 'Good morning'
  if (hour < 17) return 'Good afternoon'
  return 'Good evening'
}

export function DashboardPage() {
  const { user } = useAuth()
  const [period, setPeriod] = useState<'daily' | 'weekly' | 'monthly'>('daily')
  const [remindersOpen, setRemindersOpen] = useState(false)

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['dashboard'],
    queryFn: () => api.get<Dashboard>('/dashboard'),
  })

  const { data: revenue, isLoading: revenueLoading } = useQuery({
    queryKey: ['revenue-series', period],
    queryFn: () => api.get<RevenueSeries>('/reports/revenue-series', { period }),
  })

  const money = data?.money
  const members = data?.members
  const attendance = data?.attendance
  const status = data?.payment_status

  return (
    <>
      <PageHeader
        title={`${greeting()}, ${ownerName(user?.full_name)} 👋`}
        subtitle={
          data
            ? `Here's what's happening at ${data.gym_name} today — ${formatDate(data.today)}.`
            : 'Loading today’s figures…'
        }
      />

      {isError && (
        <Card padded={false} className="mb-6">
          <ErrorState message={errorMessage(error)} onRetry={() => void refetch()} />
        </Card>
      )}

      {/* ---------------- Quick actions ---------------- */}
      <div className="mb-7 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {QUICK_ACTIONS.map((action) => (
          <Link
            key={action.to}
            to={action.to}
            className="lift group flex items-center gap-3.5 rounded-xl border border-ink-200 bg-surface p-4 shadow-e1 hover:border-brand-200"
          >
            <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-navy-900 text-white transition-colors duration-200 group-hover:bg-brand-500">
              <Icon name={action.icon} className="size-5" strokeWidth={2} />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-semibold text-ink-900">
                {action.label}
              </span>
              <span className="block truncate text-xs text-ink-500">{action.detail}</span>
            </span>
            <Icon
              name="chevron-right"
              className="size-4 shrink-0 text-ink-300 transition-transform duration-200 ease-out group-hover:translate-x-0.5 group-hover:text-brand-500"
            />
          </Link>
        ))}
      </div>

      {/* ---------------- Members ---------------- */}
      <SectionTitle icon="members" title="Members" to="/members" linkLabel="All members" />
      <div className="mb-7 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Total Members" count={members?.total ?? 0} loading={isLoading} to="/members" />
        <Stat
          label="Active" count={members?.active ?? 0} tone="good" loading={isLoading}
          to="/members?status=active"
          hint={shareOf(members?.active, members?.total)}
        />
        <Stat
          label="Expiring Soon" count={members?.expiring_soon ?? 0} tone="warn"
          loading={isLoading} to="/members?status=expiring_soon"
          hint="Within 7 days"
        />
        <Stat
          label="Expired" count={members?.expired ?? 0} tone="bad" loading={isLoading}
          to="/members?status=expired"
          hint={members?.no_membership
            ? `${members.no_membership} with no plan`
            : 'None without a plan'}
        />
      </div>

      {/* ---------------- Money ---------------- */}
      <SectionTitle icon="payments" title="Money" to="/reports" linkLabel="Full reports" />
      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-5">
        <Stat
          label="Today's Collection"
          count={Number(money?.today_collection ?? 0)}
          format={(n) => formatMoney(Math.round(n), { decimals: false })}
          loading={isLoading}
        />
        <Stat
          label="This Month"
          count={Number(money?.month_collection ?? 0)}
          format={(n) => formatMoneyCompact(Math.round(n))}
          hint={money ? formatMoney(money.month_collection) : undefined}
          loading={isLoading}
        />
        <Stat
          label="Pending Payments"
          count={Number(money?.pending_payments ?? 0)}
          format={(n) => formatMoneyCompact(Math.round(n))}
          tone={Number(money?.pending_payments ?? 0) > 0 ? 'warn' : 'default'}
          hint="Owed by members"
          loading={isLoading}
        />
        <Stat
          label="Spent This Month"
          count={Number(money?.month_expenses ?? 0)}
          format={(n) => formatMoneyCompact(Math.round(n))}
          hint={money ? formatMoney(money.month_expenses) : undefined}
          loading={isLoading}
        />
        <Stat
          label="Net This Month"
          count={Number(money?.month_net ?? 0)}
          format={(n) => formatMoneyCompact(Math.round(n))}
          tone={Number(money?.month_net ?? 0) < 0 ? 'bad' : 'good'}
          hint={Number(money?.month_net ?? 0) < 0
            ? 'Spending exceeds income'
            : 'Income after spending'}
          loading={isLoading}
        />
      </div>

      {/* ---------------- Revenue + payment status ---------------- */}
      <div className="mb-7 grid gap-4 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
            <div>
              <h3 className="text-base font-semibold text-ink-900">Revenue Overview</h3>
              <p className="mt-0.5 text-sm text-ink-500">
                {revenue
                  ? `${formatMoney(revenue.total_income)} in, ${formatMoney(revenue.total_expense)} out`
                  : 'Money in against money out'}
              </p>
            </div>
            <div
              className="flex rounded-lg bg-ink-100 p-0.5"
              role="tablist"
              aria-label="Revenue period"
            >
              {PERIODS.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  role="tab"
                  aria-selected={period === option.value}
                  onClick={() => setPeriod(option.value)}
                  className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                    period === option.value
                      ? 'bg-surface text-ink-900 shadow-xs'
                      : 'text-ink-500 hover:text-ink-900'
                  }`}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>

          {revenueLoading ? (
            <div className="skeleton h-[200px] w-full" />
          ) : revenue && revenue.points.some(
            (p) => Number(p.income) > 0 || Number(p.expense) > 0,
          ) ? (
            <>
              <AreaChart
                key={period}
                height={200}
                points={revenue.points.map((point) => ({
                  label: point.label,
                  value: Number(point.income),
                  compare: Number(point.expense),
                }))}
                format={(value) => formatMoney(value)}
                ariaLabel={`Revenue, ${period}. Total collected ${formatMoney(revenue.total_income)}.`}
              />
              <div className="mt-3 flex flex-wrap items-center gap-4 border-t border-ink-100 pt-3 text-xs">
                <Legend color="var(--color-brand-500)" label="Collected"
                  value={formatMoney(revenue.total_income)} />
                <Legend color="var(--color-ink-400)" label="Spent"
                  value={formatMoney(revenue.total_expense)} dashed />
                <span className="ml-auto font-medium text-ink-900 tnum">
                  Net {formatMoney(revenue.total_net)}
                </span>
              </div>
            </>
          ) : (
            <EmptyState
              icon="reports"
              title="No money recorded yet"
              description="Record a payment and it will appear here."
            />
          )}
        </Card>

        <Card>
          <h3 className="text-base font-semibold text-ink-900">Payment Status</h3>
          <p className="mt-0.5 mb-4 text-sm text-ink-500">Where every member stands</p>

          {isLoading || !status ? (
            <div className="skeleton h-40 w-full" />
          ) : (
            <>
              <div className="flex items-center justify-center pb-4">
                <Donut
                  slices={[
                    { label: 'Paid', value: status.paid_count, color: '#10b981' },
                    { label: 'Pending', value: status.pending_count, color: '#f59e0b' },
                    { label: 'Overdue', value: status.overdue_count, color: '#e11d48' },
                  ]}
                  centre={
                    <>
                      <span className="text-2xl font-semibold text-ink-900 tnum">
                        {percentOf(status.paid_count, members?.total)}%
                      </span>
                      <span className="text-[11px] text-ink-500">settled up</span>
                    </>
                  }
                />
              </div>
              <div className="space-y-3">
                <BarRow
                  label={`Paid (${status.paid_count})`} value={status.paid_count}
                  total={members?.total ?? 0} amount="Nothing owed" color="#10b981"
                />
                <BarRow
                  label={`Pending (${status.pending_count})`} value={status.pending_count}
                  total={members?.total ?? 0}
                  amount={formatMoney(status.pending_amount)} color="#f59e0b"
                />
                <BarRow
                  label={`Overdue (${status.overdue_count})`} value={status.overdue_count}
                  total={members?.total ?? 0}
                  amount={formatMoney(status.overdue_amount)} color="#e11d48"
                />
              </div>
              <Link
                to="/payments"
                className="mt-4 flex items-center justify-center gap-1.5 rounded-lg border border-ink-200 py-2.5 text-sm font-medium text-ink-700 transition-colors hover:bg-ink-100"
              >
                View payments
                <Icon name="chevron-right" className="size-4" />
              </Link>
            </>
          )}
        </Card>
      </div>

      {/* ---------------- Attendance + recent members ---------------- */}
      <div className="mb-7 grid gap-4 xl:grid-cols-3">
        <Card>
          <h3 className="text-base font-semibold text-ink-900">Today's Attendance</h3>
          <p className="mt-0.5 mb-4 text-sm text-ink-500">{data ? formatDate(data.today) : ''}</p>

          {isLoading || !attendance ? (
            <div className="skeleton h-40 w-full" />
          ) : (
            <>
              <div className="flex items-center justify-center pb-5">
                <ProgressRing
                  percent={attendance.percent}
                  tone={attendance.percent >= 50 ? '#10b981' : 'var(--color-brand-500)'}
                  centre={
                    <>
                      <span className="text-3xl font-semibold text-ink-900 tnum">
                        {attendance.percent}%
                      </span>
                      <span className="text-[11px] text-ink-500">of active members</span>
                    </>
                  }
                />
              </div>
              <dl className="grid grid-cols-3 gap-2 text-center">
                <Figure label="Checked in" value={attendance.today_count} tone="text-emerald-600" />
                <Figure label="Not yet in" value={attendance.not_checked_in} tone="text-amber-600" />
                <Figure label="Active total" value={attendance.active_members} tone="text-ink-900" />
              </dl>
              <LinkButton to="/attendance" variant="secondary" fullWidth className="mt-4">
                View Attendance
              </LinkButton>
            </>
          )}
        </Card>

        <Card className="xl:col-span-2" padded={false}>
          <div className="flex items-start justify-between gap-3 p-4 sm:p-5">
            <div>
              <h3 className="text-base font-semibold text-ink-900">Recent Members</h3>
              <p className="mt-0.5 text-sm text-ink-500">The newest people to join</p>
            </div>
            <Link
              to="/members"
              className="shrink-0 text-sm font-medium text-brand-600 hover:text-brand-700"
            >
              View all
            </Link>
          </div>

          {isLoading ? (
            <div className="space-y-3 px-5 pb-5">
              {[0, 1, 2].map((index) => <div key={index} className="skeleton h-12 w-full" />)}
            </div>
          ) : data && data.recent_members.length > 0 ? (
            <ul className="stagger divide-y divide-ink-100 border-t border-ink-100">
              {data.recent_members.map((member) => (
                <li key={member.member_id}>
                  <Link
                    to={`/members/${member.member_id}`}
                    className="group flex items-center gap-3 px-4 py-3 transition-colors hover:bg-ink-50 sm:px-5"
                  >
                    <Avatar
                      name={member.full_name}
                      hasPhoto={member.has_photo}
                      photoPath={`/members/${member.member_id}/photo`}
                      size="sm"
                    />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-ink-900">
                        {member.full_name}
                      </p>
                      <p className="truncate text-xs text-ink-500">
                        {member.joined_on
                          ? `Joined ${formatDate(member.joined_on)}`
                          : member.member_code}
                        {member.plan_name ? ` · ${member.plan_name}` : ''}
                      </p>
                    </div>
                    <StatusBadge status={member.status} />
                    <Icon
                      name="chevron-right"
                      className="size-4 shrink-0 text-ink-300 transition-transform duration-200 group-hover:translate-x-0.5"
                    />
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState
              icon="members"
              title="No members added yet"
              description="Add your first member to get started."
              actionLabel="Add First Member"
              actionTo="/members/new"
            />
          )}
        </Card>
      </div>

      {/* ---------------- Renewals ---------------- */}
      <Card padded={false}>
        <div className="flex flex-wrap items-start justify-between gap-3 p-4 sm:p-5">
          <div className="min-w-0">
            <h3 className="text-base font-semibold text-ink-900">Renewals Needed</h3>
            <p className="mt-0.5 text-sm text-ink-500">Expiring soon, and recently lapsed</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {data && data.expiring.length > 0 && (
              <Button
                variant="success"
                size="sm"
                onClick={() => setRemindersOpen(true)}
                icon={<Icon name="whatsapp" className="size-4" />}
              >
                Send WhatsApp Reminders ({data.expiring.length})
              </Button>
            )}
            <Link
              to="/members?status=expiring_soon"
              className="text-sm font-medium text-brand-600 hover:text-brand-700"
            >
              View all
            </Link>
          </div>
        </div>

        {isLoading ? (
          <div className="space-y-3 px-5 pb-5">
            {[0, 1, 2].map((index) => <div key={index} className="skeleton h-14 w-full" />)}
          </div>
        ) : data && data.expiring.length > 0 ? (
          <ul className="stagger divide-y divide-ink-100 border-t border-ink-100">
            {data.expiring.map((member) => (
              <RenewalRow key={member.member_id} member={member} />
            ))}
          </ul>
        ) : (
          <EmptyState
            icon="check-circle"
            title="No memberships need renewal right now"
            description="Nobody is expiring in the next 7 days. You're all caught up."
          />
        )}
      </Card>

      <RenewalReminderDialog open={remindersOpen} onClose={() => setRemindersOpen(false)} />
    </>
  )
}

function RenewalRow({ member }: { member: Dashboard['expiring'][number] }) {
  const lapsed = member.days_remaining < 0

  return (
    <li className="flex flex-wrap items-center gap-3 px-4 py-3 transition-colors hover:bg-ink-50 sm:flex-nowrap sm:px-5">
      <Link
        to={`/members/${member.member_id}`}
        className="flex min-w-0 flex-1 items-center gap-3"
      >
        <Avatar
          name={member.full_name}
          hasPhoto={member.has_photo}
          photoPath={`/members/${member.member_id}/photo`}
          size="sm"
        />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-ink-900">{member.full_name}</p>
          <p className="truncate text-xs text-ink-500">
            {formatPhone(member.phone)}
            {member.plan_name ? ` · ${member.plan_name}` : ''}
          </p>
        </div>
        <div className="hidden min-w-0 text-right sm:block">
          <p className="truncate text-xs text-ink-500">
            Expires {formatDate(member.end_date)}
          </p>
          {Number(member.balance) > 0 && (
            <p className="truncate text-xs font-medium text-amber-700 tnum">
              {formatMoney(member.balance)} due
            </p>
          )}
        </div>
      </Link>

      <div className="flex shrink-0 items-center gap-2">
        <Badge tone={lapsed ? 'danger' : 'warning'}>
          {describeDays(member.days_remaining)}
        </Badge>
        <MemberWhatsAppButton member={member} />
      </div>
    </li>
  )
}

/**
 * One member, one reminder. Asks the server for that member's prepared message
 * so the wording comes from the same template the bulk run uses.
 */
function MemberWhatsAppButton({ member }: { member: Dashboard['expiring'][number] }) {
  const [busy, setBusy] = useState(false)

  async function send() {
    setBusy(true)
    try {
      const { deepLinkProvider } = await import('@/lib/whatsapp')
      const data = await api.get<{
        reminders: Array<{
          member_id: number; dial: string | null; can_send: boolean
          reason: string | null; message: string; full_name: string
        }>
      }>('/messages/renewal-reminders', { days: 365 })

      const prepared = data.reminders.find((r) => r.member_id === member.member_id)
      if (!prepared) return

      const outcome = await deepLinkProvider.send({
        member_id: prepared.member_id,
        full_name: prepared.full_name,
        phone: member.whatsapp ?? member.phone,
        dial: prepared.dial,
        can_send: prepared.can_send,
        reason: prepared.reason,
        message: prepared.message,
        end_date: member.end_date,
      })

      await api.post('/messages', {
        member_id: outcome.member_id,
        member_name: outcome.member_name,
        phone: outcome.phone,
        channel: 'whatsapp',
        kind: 'renewal_reminder',
        status: outcome.status,
        detail: outcome.detail,
        body: outcome.body,
        related_date: member.end_date,
      })
    } finally {
      setBusy(false)
    }
  }

  return (
    <button
      type="button"
      onClick={send}
      disabled={busy}
      title={`Send ${member.full_name} a WhatsApp reminder`}
      aria-label={`Send ${member.full_name} a WhatsApp reminder`}
      className="pressable flex size-9 items-center justify-center rounded-lg border border-emerald-500/30 bg-emerald-500/12 text-emerald-700 hover:bg-emerald-500/20 disabled:opacity-50 dark:text-emerald-400"
    >
      <Icon name="whatsapp" className="size-4" />
    </button>
  )
}

function SectionTitle({
  icon, title, to, linkLabel,
}: {
  icon: IconName
  title: string
  to: string
  linkLabel: string
}) {
  return (
    <div className="mb-3 flex items-center justify-between gap-3">
      <h2 className="flex items-center gap-2 text-sm font-semibold text-ink-700">
        <Icon name={icon} className="size-4 text-ink-400" />
        {title}
      </h2>
      <Link to={to} className="text-sm font-medium text-brand-600 hover:text-brand-700">
        {linkLabel}
      </Link>
    </div>
  )
}

function Figure({ label, value, tone }: { label: string; value: number; tone: string }) {
  return (
    <div className="rounded-lg bg-ink-50 py-2.5">
      <dd className={`text-lg font-semibold tnum ${tone}`}>{value}</dd>
      <dt className="text-[11px] text-ink-500">{label}</dt>
    </div>
  )
}

function Legend({
  color, label, value, dashed,
}: {
  color: string
  label: string
  value: string
  dashed?: boolean
}) {
  return (
    <span className="flex items-center gap-1.5 text-ink-500">
      <span
        className="h-0.5 w-4 rounded-full"
        style={{
          background: dashed ? undefined : color,
          borderTop: dashed ? `2px dashed ${color}` : undefined,
        }}
      />
      {label}
      <span className="font-medium text-ink-800 tnum">{value}</span>
    </span>
  )
}

/** The owner is greeted by their own name, not the gym's. */
function ownerName(name: string | undefined): string {
  return name?.trim() || 'there'
}

function shareOf(part: number | undefined, whole: number | undefined): string | undefined {
  if (!whole || part === undefined) return undefined
  return `${Math.round((part / whole) * 100)}% of members`
}

function percentOf(part: number, whole: number | undefined): number {
  if (!whole) return 0
  return Math.round((part / whole) * 100)
}
