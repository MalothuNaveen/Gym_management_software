/**
 * Message history.
 *
 * A record of every reminder the gym has prepared, and what actually became of
 * it. The wording here is careful: without a WhatsApp Business API this app
 * hands a message to WhatsApp and loses sight of it, so the strongest thing it
 * says is "Opened", never "Delivered".
 */
import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { Link } from 'react-router-dom'

import { PageHeader } from '@/components/layout/AppShell'
import { Button } from '@/components/ui/Button'
import {
  Badge, Card, EmptyState, ErrorState, LoadingRows, Pagination, Table, Td, Th,
} from '@/components/ui/Data'
import { Icon, type IconName } from '@/components/ui/Icon'
import { FilterTabs } from '@/components/ui/Search'
import { api, errorMessage } from '@/lib/api'
import { formatDate, formatPhone } from '@/lib/format'
import type { MessageRecord, Page } from '@/lib/types'

type Filter = 'all' | 'opened' | 'failed' | 'prepared'

const FILTERS = [
  { value: 'all' as Filter, label: 'All' },
  { value: 'opened' as Filter, label: 'Opened' },
  { value: 'failed' as Filter, label: 'Not sent' },
  { value: 'prepared' as Filter, label: 'Skipped' },
]

const STATUS: Record<string, {
  label: string
  tone: 'success' | 'warning' | 'danger' | 'neutral'
  icon: IconName
  explain: string
}> = {
  sent: {
    label: 'Sent', tone: 'success', icon: 'check-circle',
    explain: 'Confirmed delivered by the messaging provider.',
  },
  opened: {
    label: 'Opened', tone: 'success', icon: 'whatsapp',
    explain: 'WhatsApp was opened with this message ready to send.',
  },
  prepared: {
    label: 'Skipped', tone: 'neutral', icon: 'clock',
    explain: 'The message was written but never opened.',
  },
  failed: {
    label: 'Not sent', tone: 'danger', icon: 'x-circle',
    explain: 'Could not be attempted — usually a missing or invalid number.',
  },
}

const KINDS: Record<string, string> = {
  renewal_reminder: 'Renewal reminder',
  payment_reminder: 'Payment reminder',
  receipt: 'Receipt',
  other: 'Message',
}

export function MessagesPage() {
  const [filter, setFilter] = useState<Filter>('all')
  const [page, setPage] = useState(1)
  const [expanded, setExpanded] = useState<number | null>(null)

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['messages', { filter, page }],
    queryFn: () => api.get<Page<MessageRecord>>('/messages', {
      status: filter === 'all' ? undefined : filter,
      page,
      page_size: 25,
    }),
    placeholderData: (previous) => previous,
  })

  const { data: stats } = useQuery({
    queryKey: ['message-stats'],
    queryFn: () => api.get<{
      total: number; opened: number; sent: number; prepared: number; failed: number
    }>('/messages/stats'),
  })

  const items = data?.items ?? []

  return (
    <>
      <PageHeader
        title="Messages"
        subtitle="Every reminder this gym has sent, and what became of it"
        actions={
          <Button
            variant="secondary"
            onClick={() => void refetch()}
            icon={<Icon name="renew" className="size-4" />}
          >
            Refresh
          </Button>
        }
      />

      {/* A plain statement of what this app can and cannot know. */}
      <div className="mb-5 flex items-start gap-3 rounded-xl border border-brand-100 bg-brand-50 p-3.5">
        <Icon name="alert" className="mt-0.5 size-5 shrink-0 text-brand-600" />
        <p className="text-sm text-brand-900">
          <span className="font-medium">“Opened” is not “delivered”.</span>{' '}
          Reminders are handed to WhatsApp with the message ready to send — this app
          cannot see whether you pressed send. Connecting a WhatsApp Business API
          would let it confirm real delivery.
        </p>
      </div>

      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Summary label="Total" value={stats?.total ?? 0} icon="messages" tone="text-ink-900" />
        <Summary label="Opened" value={stats?.opened ?? 0} icon="whatsapp" tone="text-emerald-600" />
        <Summary label="Not sent" value={stats?.failed ?? 0} icon="x-circle" tone="text-rose-600" />
        <Summary label="Skipped" value={stats?.prepared ?? 0} icon="clock" tone="text-ink-500" />
      </div>

      <div className="mb-4">
        <FilterTabs
          value={filter}
          options={FILTERS}
          onChange={(next) => {
            setFilter(next)
            setPage(1)
          }}
        />
      </div>

      <Card padded={false} className="overflow-hidden">
        {isError ? (
          <ErrorState message={errorMessage(error)} onRetry={() => void refetch()} />
        ) : isLoading ? (
          <LoadingRows count={5} />
        ) : items.length === 0 ? (
          <EmptyState
            icon="messages"
            title={filter === 'all' ? 'No messages yet' : 'Nothing in this list'}
            description={
              filter === 'all'
                ? 'Send a renewal reminder from the dashboard and it will be recorded here.'
                : 'Try a different filter.'
            }
            actionLabel={filter === 'all' ? 'Go to the dashboard' : undefined}
            actionTo={filter === 'all' ? '/' : undefined}
          />
        ) : (
          <>
            {/* Phones get cards; a six-column table is unusable at 360px. */}
            <ul className="stagger divide-y divide-ink-100 lg:hidden">
              {items.map((message) => (
                <li key={message.id}>
                  <MessageCard
                    message={message}
                    expanded={expanded === message.id}
                    onToggle={() =>
                      setExpanded(expanded === message.id ? null : message.id)}
                  />
                </li>
              ))}
            </ul>

            <div className="hidden lg:block">
              <Table
                head={
                  <>
                    <Th>Member</Th>
                    <Th>Phone</Th>
                    <Th>Type</Th>
                    <Th>When</Th>
                    <Th>Status</Th>
                    <Th><span className="sr-only">Message</span></Th>
                  </>
                }
              >
                {items.map((message) => (
                  <MessageRow
                    key={message.id}
                    message={message}
                    expanded={expanded === message.id}
                    onToggle={() =>
                      setExpanded(expanded === message.id ? null : message.id)}
                  />
                ))}
              </Table>
            </div>

            <Pagination
              page={data?.page ?? 1}
              pages={data?.pages ?? 1}
              total={data?.total ?? 0}
              onChange={setPage}
              itemLabel="messages"
            />
          </>
        )}
      </Card>
    </>
  )
}

function Summary({
  label, value, icon, tone,
}: {
  label: string
  value: number
  icon: IconName
  tone: string
}) {
  return (
    <div className="rounded-xl border border-ink-200 bg-surface p-4 shadow-e1">
      <div className="flex items-center gap-2">
        <Icon name={icon} className="size-4 text-ink-400" />
        <p className="text-[11px] font-semibold tracking-wide text-ink-500 uppercase">
          {label}
        </p>
      </div>
      <p className={`mt-1 text-2xl font-semibold tnum ${tone}`}>{value}</p>
    </div>
  )
}

function StatusChip({ status }: { status: string }) {
  const entry = STATUS[status] ?? STATUS.prepared
  return (
    <span title={entry.explain}>
      <Badge tone={entry.tone}>
        <Icon name={entry.icon} className="mr-1 size-3" strokeWidth={2.4} />
        {entry.label}
      </Badge>
    </span>
  )
}

function MessageCard({
  message, expanded, onToggle,
}: {
  message: MessageRecord
  expanded: boolean
  onToggle: () => void
}) {
  return (
    <div className="px-4 py-3">
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          {message.member_id ? (
            <Link
              to={`/members/${message.member_id}`}
              className="truncate text-sm font-semibold text-ink-900 hover:text-brand-600"
            >
              {message.member_name}
            </Link>
          ) : (
            <p className="truncate text-sm font-semibold text-ink-900">
              {message.member_name}
            </p>
          )}
          <p className="mt-0.5 truncate text-xs text-ink-500">
            {message.phone ? formatPhone(message.phone) : 'No number'} ·{' '}
            {KINDS[message.kind] ?? message.kind}
          </p>
          <p className="mt-0.5 text-xs text-ink-400">{formatDate(message.created_at)}</p>
        </div>
        <StatusChip status={message.status} />
      </div>

      {message.detail && (
        <p className="mt-2 text-xs text-rose-600">{message.detail}</p>
      )}

      <button
        type="button"
        onClick={onToggle}
        className="mt-2 flex min-h-9 items-center gap-1 text-xs font-medium text-brand-600"
        aria-expanded={expanded}
      >
        {expanded ? 'Hide message' : 'Show message'}
        <Icon
          name="chevron-down"
          className={`size-3.5 transition-transform duration-200 ${expanded ? 'rotate-180' : ''}`}
        />
      </button>
      {expanded && (
        <p className="mt-2 rounded-lg bg-ink-50 p-3 text-sm whitespace-pre-wrap text-ink-700">
          {message.body}
        </p>
      )}
    </div>
  )
}

function MessageRow({
  message, expanded, onToggle,
}: {
  message: MessageRecord
  expanded: boolean
  onToggle: () => void
}) {
  return (
    <>
      <tr className="transition-colors hover:bg-ink-50">
        <Td>
          {message.member_id ? (
            <Link
              to={`/members/${message.member_id}`}
              className="font-medium text-ink-900 hover:text-brand-600"
            >
              {message.member_name}
            </Link>
          ) : (
            <span className="font-medium text-ink-900">{message.member_name}</span>
          )}
        </Td>
        <Td className="tnum">{message.phone ? formatPhone(message.phone) : '—'}</Td>
        <Td>{KINDS[message.kind] ?? message.kind}</Td>
        <Td className="tnum">{formatDate(message.created_at)}</Td>
        <Td>
          <StatusChip status={message.status} />
          {message.detail && (
            <span className="mt-1 block max-w-xs text-xs text-rose-600">
              {message.detail}
            </span>
          )}
        </Td>
        <Td align="right">
          <button
            type="button"
            onClick={onToggle}
            aria-expanded={expanded}
            className="pressable rounded-lg border border-ink-300 px-3 py-1.5 text-sm font-medium text-ink-700 hover:bg-ink-100"
          >
            {expanded ? 'Hide' : 'View'}
          </button>
        </Td>
      </tr>
      {expanded && (
        <tr>
          <td colSpan={6} className="px-3 pb-3">
            <p className="rounded-lg bg-ink-50 p-3 text-sm whitespace-pre-wrap text-ink-700">
              {message.body}
            </p>
          </td>
        </tr>
      )}
    </>
  )
}
