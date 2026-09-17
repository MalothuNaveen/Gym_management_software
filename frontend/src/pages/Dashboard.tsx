import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'

import { PageHeader } from '@/components/layout/AppShell'
import { Avatar } from '@/components/ui/Avatar'
import { LinkButton } from '@/components/ui/Button'
import {
  Badge, Card, CardHeader, EmptyState, ErrorState, Stat,
} from '@/components/ui/Data'
import { Icon, type IconName } from '@/components/ui/Icon'
import { api, errorMessage } from '@/lib/api'
import { describeDays, formatDate, formatMoney, formatMoneyCompact } from '@/lib/format'
import type { Dashboard } from '@/lib/types'

const QUICK_ACTIONS: { to: string; label: string; icon: IconName }[] = [
  { to: '/members/new', label: 'Add Member', icon: 'plus' },
  { to: '/payments?record=1', label: 'Record Payment', icon: 'payments' },
  { to: '/attendance', label: 'Attendance', icon: 'attendance' },
  { to: '/members?status=expiring_soon', label: 'Renewals', icon: 'renew' },
]

export function DashboardPage() {
  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['dashboard'],
    queryFn: () => api.get<Dashboard>('/dashboard'),
  })

  return (
    <>
      <PageHeader
        title={data?.gym_name ?? 'Dashboard'}
        subtitle={data ? `Today, ${formatDate(data.today)}` : undefined}
      />

      {/* Quick actions sit first: these are the four things done every day. */}
      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {QUICK_ACTIONS.map((action) => (
          <Link
            key={action.to}
            to={action.to}
            className="lift group flex flex-col items-center justify-center gap-2.5 rounded-xl border border-ink-200 bg-white px-3 py-4 text-center shadow-e1 hover:border-ink-300"
          >
            <span className="flex size-10 items-center justify-center rounded-xl bg-ink-900 text-white transition-colors duration-200 group-hover:bg-brand-600">
              <Icon name={action.icon} className="size-5" strokeWidth={2} />
            </span>
            <span className="text-sm font-medium text-ink-800">{action.label}</span>
          </Link>
        ))}
      </div>

      {isError && (
        <Card padded={false}>
          <ErrorState message={errorMessage(error)} onRetry={() => void refetch()} />
        </Card>
      )}

      {!isError && (
        <>
          {/* --- Members --- */}
          <h2 className="mb-3 text-sm font-semibold text-ink-700">Members</h2>
          <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Stat
              label="Total Members"
              count={data?.members.total ?? 0}
              loading={isLoading}
              to="/members"
            />
            <Stat
              label="Active"
              count={data?.members.active ?? 0}
              tone="good"
              loading={isLoading}
              to="/members?status=active"
            />
            <Stat
              label="Expiring Soon"
              count={data?.members.expiring_soon ?? 0}
              tone="warn"
              loading={isLoading}
              to="/members?status=expiring_soon"
            />
            <Stat
              label="Expired"
              count={data?.members.expired ?? 0}
              tone="bad"
              loading={isLoading}
              to="/members?status=expired"
            />
          </div>

          {/* --- Money --- */}
          <h2 className="mb-3 text-sm font-semibold text-ink-700">Money</h2>
          <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
            {/* Counting rounds to whole rupees. Letting the paise animate makes
                the figure flicker between two widths as it climbs. */}
            <Stat
              label="Today's Collection"
              count={Number(data?.money.today_collection ?? 0)}
              format={(n) => formatMoney(Math.round(n), { decimals: false })}
              loading={isLoading}
            />
            <Stat
              label="This Month"
              count={Number(data?.money.month_collection ?? 0)}
              format={(n) => formatMoneyCompact(Math.round(n))}
              hint={data ? formatMoney(data.money.month_collection) : undefined}
              loading={isLoading}
            />
            <Stat
              label="Pending Payments"
              count={Number(data?.money.pending_payments ?? 0)}
              format={(n) => formatMoneyCompact(Math.round(n))}
              tone={Number(data?.money.pending_payments ?? 0) > 0 ? 'warn' : 'default'}
              hint="Owed by members"
              loading={isLoading}
            />
            <Stat
              label="Net This Month"
              count={Number(data?.money.month_net ?? 0)}
              format={(n) => formatMoneyCompact(Math.round(n))}
              tone={Number(data?.money.month_net ?? 0) < 0 ? 'bad' : 'good'}
              hint={
                data
                  ? `Spent ${formatMoney(data.money.month_expenses)}`
                  : undefined
              }
              loading={isLoading}
            />
          </div>

          {/* --- Attendance + renewals --- */}
          <div className="grid gap-4 lg:grid-cols-3">
            <Card className="lg:col-span-1">
              <CardHeader title="Today's Attendance" />
              {isLoading ? (
                <div className="skeleton h-10 w-28" />
              ) : (
                <>
                  <p className="text-3xl font-semibold text-ink-900 tnum">
                    {data?.attendance.today_count ?? 0}
                    <span className="text-lg font-normal text-ink-400">
                      {' / '}
                      {data?.attendance.active_members ?? 0}
                    </span>
                  </p>
                  <p className="mt-1 text-sm text-ink-500">
                    active members checked in
                  </p>
                  <LinkButton to="/attendance" variant="secondary" size="sm" className="mt-4">
                    Mark attendance
                  </LinkButton>
                </>
              )}
            </Card>

            <Card className="lg:col-span-2" padded={false}>
              <div className="p-4 sm:p-5">
                <CardHeader
                  title="Renewals needed"
                  subtitle="Expiring soon, and recently lapsed"
                  className="mb-0"
                  action={
                    <Link
                      to="/members?status=expiring_soon"
                      className="text-sm font-medium text-brand-600 hover:text-brand-700"
                    >
                      View all
                    </Link>
                  }
                />
              </div>

              {isLoading ? (
                <div className="space-y-3 px-5 pb-5">
                  {[0, 1, 2].map((index) => (
                    <div key={index} className="skeleton h-12 w-full" />
                  ))}
                </div>
              ) : data && data.expiring.length > 0 ? (
                <ul className="divide-y divide-ink-100 border-t border-ink-100">
                  {data.expiring.map((member) => (
                    <li key={member.member_id}>
                      <Link
                        to={`/members/${member.member_id}`}
                        className="flex items-center gap-3 px-4 py-3 transition hover:bg-ink-50 sm:px-5"
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
                            Expires {formatDate(member.end_date)}
                          </p>
                        </div>
                        <Badge tone={member.days_remaining < 0 ? 'danger' : 'warning'}>
                          {describeDays(member.days_remaining)}
                        </Badge>
                      </Link>
                    </li>
                  ))}
                </ul>
              ) : (
                <EmptyState
                  icon="check"
                  title="No memberships expiring soon"
                  description="Everything looks good."
                />
              )}
            </Card>
          </div>
        </>
      )}
    </>
  )
}
