/**
 * Attendance — search a member, tap Check In, done.
 *
 * The roster lists every active member with their state for the day, so the
 * owner can see who is in and who is missing without switching views.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { Link } from 'react-router-dom'

import { PageHeader } from '@/components/layout/AppShell'
import { Avatar } from '@/components/ui/Avatar'
import { Button } from '@/components/ui/Button'
import {
  Badge, Card, EmptyState, ErrorState, LoadingRows, StatusBadge,
} from '@/components/ui/Data'
import { FilterTabs, SearchInput, useDebounced } from '@/components/ui/Search'
import { api, errorMessage } from '@/lib/api'
import { formatDate, formatPhone, formatTime, todayInput } from '@/lib/format'
import { useToast } from '@/lib/toast'
import type { AttendanceRecord, RosterItem } from '@/lib/types'

type Period = 'today' | 'yesterday' | 'week' | 'month'

const PERIODS = [
  { value: 'today' as Period, label: 'Today' },
  { value: 'yesterday' as Period, label: 'Yesterday' },
  { value: 'week' as Period, label: 'This Week' },
  { value: 'month' as Period, label: 'This Month' },
]

export function AttendancePage() {
  const [period, setPeriod] = useState<Period>('today')

  return (
    <>
      <PageHeader title="Attendance" subtitle={formatDate(todayInput())} />
      <FilterTabs
        value={period}
        options={PERIODS}
        onChange={setPeriod}
        className="mb-4"
      />
      {period === 'today' ? <TodayRoster /> : <HistoryList period={period} />}
    </>
  )
}

function TodayRoster() {
  const toast = useToast()
  const queryClient = useQueryClient()
  const [search, setSearch] = useState('')
  const [pendingId, setPendingId] = useState<number | null>(null)
  const debounced = useDebounced(search)

  const { data: roster = [], isLoading, isError, error, refetch } = useQuery({
    queryKey: ['roster', debounced],
    queryFn: () => api.get<RosterItem[]>('/attendance/roster', { q: debounced || undefined }),
  })

  const checkIn = useMutation({
    mutationFn: (memberId: number) =>
      api.post('/attendance/check-in', { member_id: memberId }),
    onMutate: (memberId) => setPendingId(memberId),
    onSuccess: async (_result, memberId) => {
      const member = roster.find((r) => r.member_id === memberId)
      await queryClient.invalidateQueries({ queryKey: ['roster'] })
      await queryClient.invalidateQueries({ queryKey: ['dashboard'] })
      toast.success(`${member?.full_name ?? 'Member'} checked in.`)
    },
    onError: (caught) => toast.error(errorMessage(caught)),
    onSettled: () => setPendingId(null),
  })

  const undo = useMutation({
    mutationFn: (attendanceId: number) => api.delete(`/attendance/${attendanceId}`),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['roster'] })
      await queryClient.invalidateQueries({ queryKey: ['dashboard'] })
      toast.success('Check-in removed.')
    },
    onError: (caught) => toast.error(errorMessage(caught)),
  })

  const presentCount = roster.filter((item) => item.present).length

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <SearchInput
          value={search}
          onChange={setSearch}
          placeholder="Search member to check in"
          className="min-w-0 flex-1"
        />
        <Badge tone="success" className="h-11 items-center px-3 text-sm">
          {presentCount} present
        </Badge>
      </div>

      <Card padded={false} className="overflow-hidden">
        {isError ? (
          <ErrorState message={errorMessage(error)} onRetry={() => void refetch()} />
        ) : isLoading ? (
          <LoadingRows count={5} />
        ) : roster.length === 0 ? (
          debounced ? (
            <EmptyState
              icon="search"
              title="No members found"
              description={`Nothing matched "${debounced}".`}
            />
          ) : (
            <EmptyState
              icon="members"
              title="No active members yet"
              description="Add a member before marking attendance."
              actionLabel="Add Member"
              actionTo="/members/new"
            />
          )
        ) : (
          <ul className="divide-y divide-ink-100">
            {roster.map((item) => (
              <li key={item.member_id} className="flex items-center gap-3 px-4 py-3">
                <Avatar
                  name={item.full_name}
                  hasPhoto={item.has_photo}
                  photoPath={`/members/${item.member_id}/photo`}
                />
                <Link to={`/members/${item.member_id}`} className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-ink-900">
                    {item.full_name}
                  </p>
                  <p className="truncate text-xs text-ink-500">
                    {item.member_code} · {formatPhone(item.phone)}
                  </p>
                  {item.status !== 'active' && (
                    <span className="mt-1 inline-block">
                      <StatusBadge status={item.status} />
                    </span>
                  )}
                </Link>

                {item.present ? (
                  <div className="flex shrink-0 flex-col items-end gap-1">
                    <Badge tone="success">Present</Badge>
                    <span className="text-xs text-ink-500 tnum">
                      {formatTime(item.check_in_at)}
                    </span>
                    <button
                      type="button"
                      onClick={() => item.attendance_id && undo.mutate(item.attendance_id)}
                      className="text-[11px] text-ink-400 transition hover:text-rose-600"
                    >
                      Undo
                    </button>
                  </div>
                ) : (
                  <Button
                    size="sm"
                    onClick={() => checkIn.mutate(item.member_id)}
                    loading={pendingId === item.member_id && checkIn.isPending}
                    loadingText="…"
                    className="shrink-0"
                  >
                    Check In
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}
      </Card>
    </>
  )
}

function HistoryList({ period }: { period: Period }) {
  const { data = [], isLoading, isError, error, refetch } = useQuery({
    queryKey: ['attendance', period],
    queryFn: () => api.get<AttendanceRecord[]>('/attendance', { period }),
  })

  return (
    <Card padded={false} className="overflow-hidden">
      {isError ? (
        <ErrorState message={errorMessage(error)} onRetry={() => void refetch()} />
      ) : isLoading ? (
        <LoadingRows count={4} />
      ) : data.length === 0 ? (
        <EmptyState
          icon="calendar"
          title="No attendance recorded"
          description="No one was checked in during this period."
        />
      ) : (
        <>
          <p className="border-b border-ink-100 px-4 py-3 text-sm text-ink-500">
            {data.length} check-in{data.length === 1 ? '' : 's'}
          </p>
          <ul className="divide-y divide-ink-100">
            {data.map((record) => (
              <li key={record.id} className="flex items-center gap-3 px-4 py-3">
                <Avatar
                  name={record.member_name ?? '?'}
                  photoPath={`/members/${record.member_id}/photo`}
                  size="sm"
                />
                <Link to={`/members/${record.member_id}`} className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-ink-900">
                    {record.member_name}
                  </p>
                  <p className="truncate text-xs text-ink-500">{record.member_code}</p>
                </Link>
                <div className="shrink-0 text-right">
                  <p className="text-xs text-ink-700 tnum">{formatDate(record.attend_date)}</p>
                  <p className="text-xs text-ink-500 tnum">{formatTime(record.check_in_at)}</p>
                </div>
              </li>
            ))}
          </ul>
        </>
      )}
    </Card>
  )
}
