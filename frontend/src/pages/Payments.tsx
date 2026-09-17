import { useQuery } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'

import { PaymentDialog } from '@/components/PaymentDialog'
import { ReceiptDialog } from '@/components/ReceiptDialog'
import { PageHeader } from '@/components/layout/AppShell'
import { Button } from '@/components/ui/Button'
import {
  Badge, Card, EmptyState, ErrorState, LoadingRows, Pagination, Stat, Table, Td, Th,
} from '@/components/ui/Data'
import { SearchInput, useDebounced } from '@/components/ui/Search'
import { api, errorMessage } from '@/lib/api'
import {
  PAYMENT_METHODS, formatDate, formatMoney, labelFor, todayInput,
} from '@/lib/format'
import type { Page, Payment } from '@/lib/types'
import { Icon } from '@/components/ui/Icon'

interface Collections {
  total: string
  count: number
  by_method: { method: string; count: number; amount: string }[]
}

export function PaymentsPage() {
  const [params, setParams] = useSearchParams()
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [showRecord, setShowRecord] = useState(false)
  const [receiptId, setReceiptId] = useState<number | null>(null)
  const debounced = useDebounced(search)

  // The dashboard links here with ?record=1 to open the form immediately.
  useEffect(() => {
    if (params.get('record')) {
      setShowRecord(true)
      setParams({}, { replace: true })
    }
  }, [params, setParams])

  const { data, isLoading, isError, error, refetch, isFetching } = useQuery({
    queryKey: ['payments', { q: debounced, page }],
    queryFn: () =>
      api.get<Page<Payment>>('/payments', {
        q: debounced || undefined,
        page,
        page_size: 25,
      }),
    placeholderData: (previous) => previous,
  })

  const monthStart = todayInput().slice(0, 8) + '01'
  const { data: collections } = useQuery({
    queryKey: ['collections', monthStart],
    queryFn: () => api.get<Collections>('/reports/collections', { start: monthStart }),
  })

  const payments = data?.items ?? []

  return (
    <>
      <PageHeader
        title="Payments"
        subtitle="All money received"
        actions={
          <Button onClick={() => setShowRecord(true)} icon={<Icon name="payments" className="size-4" strokeWidth={2} />}>
            Record Payment
          </Button>
        }
      />

      <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="This Month" value={formatMoney(collections?.total)} />
        <Stat label="Payments" value={collections?.count ?? 0} />
        {collections?.by_method.slice(0, 2).map((row) => (
          <Stat
            key={row.method}
            label={labelFor(PAYMENT_METHODS, row.method)}
            value={formatMoney(row.amount)}
            hint={`${row.count} payment${row.count === 1 ? '' : 's'}`}
          />
        ))}
      </div>

      <SearchInput
        value={search}
        onChange={(value) => {
          setSearch(value)
          setPage(1)
        }}
        placeholder="Search by member, member ID or receipt number"
        className="mb-4"
      />

      <Card padded={false} className="overflow-hidden">
        {isError ? (
          <ErrorState message={errorMessage(error)} onRetry={() => void refetch()} />
        ) : isLoading ? (
          <LoadingRows count={5} />
        ) : payments.length === 0 ? (
          debounced ? (
            <EmptyState
              icon="search"
              title="No payments found"
              description={`Nothing matched "${debounced}".`}
            />
          ) : (
            <EmptyState
              icon="payments"
              title="No payments recorded yet"
              description="Record a payment and the receipt is generated for you."
              actionLabel="Record Payment"
              onAction={() => setShowRecord(true)}
            />
          )
        ) : (
          <>
            <ul className={`divide-y divide-ink-100 lg:hidden ${isFetching ? 'opacity-60' : ''}`}>
              {payments.map((payment) => (
                <li key={payment.id} className="flex items-center gap-3 px-4 py-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span
                        className={`text-sm font-semibold tnum ${
                          payment.is_void ? 'text-ink-400 line-through' : 'text-ink-900'
                        }`}
                      >
                        {formatMoney(payment.amount)}
                      </span>
                      <Badge>{labelFor(PAYMENT_METHODS, payment.method)}</Badge>
                      {payment.is_void && <Badge tone="danger">Cancelled</Badge>}
                    </div>
                    <Link
                      to={`/members/${payment.member_id}`}
                      className="mt-0.5 block truncate text-sm text-ink-700"
                    >
                      {payment.member_name}
                    </Link>
                    <p className="truncate text-xs text-ink-500">
                      {formatDate(payment.paid_on)}
                      {payment.receipt_no && ` · ${payment.receipt_no}`}
                    </p>
                  </div>
                  {payment.receipt_id && (
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => setReceiptId(payment.receipt_id)}
                    >
                      Receipt
                    </Button>
                  )}
                </li>
              ))}
            </ul>

            <div className={`hidden lg:block ${isFetching ? 'opacity-60' : ''}`}>
              <Table
                head={
                  <>
                    <Th>Date</Th>
                    <Th>Member</Th>
                    <Th>Plan</Th>
                    <Th>Receipt No.</Th>
                    <Th>Method</Th>
                    <Th align="right">Amount</Th>
                    <Th><span className="sr-only">Actions</span></Th>
                  </>
                }
              >
                {payments.map((payment) => (
                  <tr key={payment.id} className="transition hover:bg-ink-50">
                    <Td className="tnum">{formatDate(payment.paid_on)}</Td>
                    <Td>
                      <Link
                        to={`/members/${payment.member_id}`}
                        className="font-medium text-ink-900 hover:text-brand-600"
                      >
                        {payment.member_name}
                      </Link>
                      <span className="block text-xs text-ink-500 tnum">
                        {payment.member_code}
                      </span>
                    </Td>
                    <Td className="text-ink-600">{payment.plan_name ?? '—'}</Td>
                    <Td className="text-ink-600 tnum">{payment.receipt_no ?? '—'}</Td>
                    <Td>
                      <Badge>{labelFor(PAYMENT_METHODS, payment.method)}</Badge>
                      {payment.kind === 'advance' && (
                        <Badge tone="info" className="ml-1">
                          Advance
                        </Badge>
                      )}
                    </Td>
                    <Td align="right" className="tnum">
                      <span
                        className={
                          payment.is_void
                            ? 'text-ink-400 line-through'
                            : 'font-semibold text-ink-900'
                        }
                      >
                        {formatMoney(payment.amount)}
                      </span>
                    </Td>
                    <Td align="right">
                      {payment.receipt_id && (
                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={() => setReceiptId(payment.receipt_id)}
                        >
                          Receipt
                        </Button>
                      )}
                    </Td>
                  </tr>
                ))}
              </Table>
            </div>

            <Pagination
              page={data?.page ?? 1}
              pages={data?.pages ?? 1}
              total={data?.total ?? 0}
              onChange={setPage}
              itemLabel="payments"
            />
          </>
        )}
      </Card>

      <PaymentDialog
        open={showRecord}
        onClose={() => setShowRecord(false)}
        onRecorded={(payment) => {
          setShowRecord(false)
          if (payment.receipt_id) setReceiptId(payment.receipt_id)
        }}
      />

      <ReceiptDialog
        open={receiptId !== null}
        receiptId={receiptId}
        onClose={() => setReceiptId(null)}
      />
    </>
  )
}
