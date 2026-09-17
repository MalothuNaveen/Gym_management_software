import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'

import { PageHeader } from '@/components/layout/AppShell'
import { Avatar } from '@/components/ui/Avatar'
import { LinkButton } from '@/components/ui/Button'
import {
  Card, EmptyState, ErrorState, LoadingRows, Pagination, StatusBadge, Table, Td, Th,
} from '@/components/ui/Data'
import { FilterTabs, SearchInput, useDebounced } from '@/components/ui/Search'
import { api, errorMessage } from '@/lib/api'
import { describeDays, formatDate, formatMoney, formatPhone } from '@/lib/format'
import type { MemberListItem, MemberStatus, Page } from '@/lib/types'
import { Icon } from '@/components/ui/Icon'

type Filter = 'all' | 'active' | 'expiring_soon' | 'expired'

const FILTERS = [
  { value: 'all' as Filter, label: 'All' },
  { value: 'active' as Filter, label: 'Active' },
  { value: 'expiring_soon' as Filter, label: 'Expiring Soon' },
  { value: 'expired' as Filter, label: 'Expired' },
]

export function MembersPage() {
  const [params, setParams] = useSearchParams()
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const debouncedSearch = useDebounced(search)

  const status = (params.get('status') as Filter) ?? 'all'

  function setStatus(next: Filter) {
    setPage(1)
    setParams(next === 'all' ? {} : { status: next }, { replace: true })
  }

  const { data, isLoading, isError, error, refetch, isFetching } = useQuery({
    queryKey: ['members', { q: debouncedSearch, status, page }],
    queryFn: () =>
      api.get<Page<MemberListItem>>('/members', {
        q: debouncedSearch || undefined,
        status,
        page,
        page_size: 25,
      }),
    placeholderData: (previous) => previous,
  })

  const members = data?.items ?? []
  const searching = debouncedSearch.length > 0

  return (
    <>
      <PageHeader
        title="Members"
        subtitle={data ? `${data.total} ${data.total === 1 ? 'member' : 'members'}` : undefined}
        actions={<LinkButton to="/members/new" icon={<Icon name="plus" className="size-4" strokeWidth={2} />}>Add Member</LinkButton>}
      />

      <div className="mb-4 space-y-3">
        <SearchInput
          value={search}
          onChange={(value) => {
            setSearch(value)
            setPage(1)
          }}
          placeholder="Search by name, phone, member ID or email"
        />
        <FilterTabs value={status} options={FILTERS} onChange={setStatus} />
      </div>

      <Card padded={false} className="overflow-hidden">
        {isError ? (
          <ErrorState message={errorMessage(error)} onRetry={() => void refetch()} />
        ) : isLoading ? (
          <LoadingRows count={5} />
        ) : members.length === 0 ? (
          searching ? (
            <EmptyState
              icon="search"
              title="No members found"
              description={`Nothing matched "${debouncedSearch}". Try a different name or number.`}
            />
          ) : status !== 'all' ? (
            <EmptyState
              icon="check"
              title={`No ${FILTERS.find((f) => f.value === status)?.label.toLowerCase()} members`}
              description="Everything looks good here."
            />
          ) : (
            <EmptyState
              icon="members"
              title="No members yet"
              description="Add your first member to get started."
              actionLabel="Add First Member"
              actionTo="/members/new"
            />
          )
        ) : (
          <>
            {/* Phones get cards; a nine-column table is unusable at 360px.
                `stagger` fades the rows in a beat apart, which reads as the
                list arriving rather than the screen flashing. */}
            <ul
              className={`stagger divide-y divide-ink-100 transition-opacity lg:hidden ${
                isFetching ? 'opacity-60' : ''
              }`}
            >
              {members.map((member) => (
                <li key={member.id}>
                  <MemberCard member={member} />
                </li>
              ))}
            </ul>

            <div className={`hidden lg:block ${isFetching ? 'opacity-60' : ''}`}>
              <Table
                head={
                  <>
                    <Th>Member</Th>
                    <Th>Member ID</Th>
                    <Th>Phone</Th>
                    <Th>Membership</Th>
                    <Th>Expiry</Th>
                    <Th>Status</Th>
                    <Th align="right">Balance</Th>
                    <Th><span className="sr-only">Actions</span></Th>
                  </>
                }
              >
                {members.map((member) => (
                  <MemberRow key={member.id} member={member} />
                ))}
              </Table>
            </div>

            <Pagination
              page={data?.page ?? 1}
              pages={data?.pages ?? 1}
              total={data?.total ?? 0}
              onChange={setPage}
              itemLabel="members"
            />
          </>
        )}
      </Card>
    </>
  )
}

function MemberCard({ member }: { member: MemberListItem }) {
  return (
    <Link
      to={`/members/${member.id}`}
      className="group flex items-center gap-3 px-4 py-3 transition-colors active:bg-ink-50"
    >
      <Avatar
        name={member.full_name}
        hasPhoto={member.has_photo}
        photoPath={`/members/${member.id}/photo`}
      />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <p className="truncate text-sm font-semibold text-ink-900">{member.full_name}</p>
        </div>
        <p className="mt-0.5 truncate text-xs text-ink-500">
          {member.member_code} · {formatPhone(member.phone)}
        </p>
        <div className="mt-1.5 flex flex-wrap items-center gap-2">
          <StatusBadge status={member.status} />
          {member.end_date && (
            <span className="text-xs text-ink-500">{describeDays(member.days_remaining)}</span>
          )}
          {Number(member.balance) > 0 && (
            <span className="text-xs font-medium text-amber-700 tnum">
              {formatMoney(member.balance)} due
            </span>
          )}
        </div>
      </div>
      <Icon
        name="chevron-right"
        className="size-4 text-ink-300 transition-transform duration-200 ease-out group-active:translate-x-0.5"
      />
    </Link>
  )
}

function MemberRow({ member }: { member: MemberListItem }) {
  return (
    <tr className="transition hover:bg-ink-50">
      <Td>
        {/* The name is a link: clicking it is the obvious thing to do. */}
        <Link
          to={`/members/${member.id}`}
          className="flex items-center gap-3 font-medium text-ink-900 hover:text-brand-600"
        >
          <Avatar
            name={member.full_name}
            hasPhoto={member.has_photo}
            photoPath={`/members/${member.id}/photo`}
            size="sm"
          />
          <span>{member.full_name}</span>
        </Link>
      </Td>
      <Td className="text-ink-500 tnum">{member.member_code}</Td>
      <Td className="tnum">{formatPhone(member.phone)}</Td>
      <Td>{member.plan_name ?? '—'}</Td>
      <Td>
        {member.end_date ? (
          <div>
            <p className="tnum">{formatDate(member.end_date)}</p>
            <p className="text-xs text-ink-500">{describeDays(member.days_remaining)}</p>
          </div>
        ) : (
          '—'
        )}
      </Td>
      <Td>
        <StatusBadge status={member.status as MemberStatus} />
      </Td>
      <Td align="right" className="tnum">
        {Number(member.balance) > 0 ? (
          <span className="font-medium text-amber-700">{formatMoney(member.balance)}</span>
        ) : (
          <span className="text-ink-400">—</span>
        )}
      </Td>
      <Td align="right">
        <Link
          to={`/members/${member.id}`}
          className="rounded-lg border border-ink-300 px-3 py-1.5 text-sm font-medium text-ink-700 transition hover:bg-ink-100"
        >
          View
        </Link>
      </Td>
    </tr>
  )
}
