/**
 * Reports — the monthly picture, plus a spreadsheet export of anything.
 *
 * "Download backup" packs every table into one ZIP of CSVs. That is the whole
 * backup story for a small gym: a file the owner can email to themselves.
 */
import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'

import { PageHeader } from '@/components/layout/AppShell'
import { Button } from '@/components/ui/Button'
import {
  Card, CardHeader, DetailRow, ErrorState, Stat,
} from '@/components/ui/Data'
import { Select } from '@/components/ui/Field'
import { api, errorMessage } from '@/lib/api'
import { formatDate, formatMoney } from '@/lib/format'
import { useToast } from '@/lib/toast'
import type { MonthlySummary } from '@/lib/types'
import { Icon } from '@/components/ui/Icon'

const EXPORTS = [
  { id: 'members', label: 'Members Report', description: 'Everyone, with status and dues' },
  { id: 'payments', label: 'Payment Report', description: 'Every payment and receipt' },
  { id: 'attendance', label: 'Attendance Report', description: 'Every check-in' },
  { id: 'expiring', label: 'Membership Expiry Report', description: 'Who needs renewing' },
  { id: 'dues', label: 'Pending Dues Report', description: 'Who owes money' },
  { id: 'expenses', label: 'Expense Report', description: 'Everything spent' },
  { id: 'salary', label: 'Staff Salary Report', description: 'Salaries and advances' },
  { id: 'memberships', label: 'Membership History', description: 'Every term ever sold' },
]

function monthOptions(): { value: string; label: string }[] {
  const options = []
  const now = new Date()
  for (let index = 0; index < 12; index += 1) {
    const date = new Date(now.getFullYear(), now.getMonth() - index, 1)
    const value = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
    options.push({
      value,
      label: date.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' }),
    })
  }
  return options
}

export function ReportsPage() {
  const toast = useToast()
  const months = monthOptions()
  const [month, setMonth] = useState(months[0].value)
  const [downloading, setDownloading] = useState<string | null>(null)

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['monthly-summary', month],
    queryFn: () => api.get<MonthlySummary>('/reports/monthly-summary', { month }),
  })

  async function download(path: string, filename: string, key: string) {
    setDownloading(key)
    try {
      const blob = await api.blob(path)
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = filename
      document.body.appendChild(link)
      link.click()
      link.remove()
      setTimeout(() => URL.revokeObjectURL(url), 10000)
      toast.success('Download started.')
    } catch (caught) {
      toast.error(errorMessage(caught))
    } finally {
      setDownloading(null)
    }
  }

  return (
    <>
      <PageHeader
        title="Reports"
        subtitle="Monthly summary and spreadsheet exports"
        actions={
          <Button
            variant="secondary"
            onClick={() =>
              void download('/reports/backup.zip', 'gym-backup.zip', 'backup')
            }
            loading={downloading === 'backup'}
            loadingText="Preparing…"
            icon={<Icon name="download" className="size-4" strokeWidth={2} />}
          >
            Download Backup
          </Button>
        }
      />

      <Card className="mb-5">
        <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
          <CardHeader
            title="Monthly Summary"
            subtitle={data ? `${formatDate(data.period_start)} – ${formatDate(data.period_end)}` : undefined}
            className="mb-0"
          />
          <Select
            options={months}
            value={month}
            onChange={(event) => setMonth(event.target.value)}
            className="w-48"
            aria-label="Choose month"
          />
        </div>

        {isError ? (
          <ErrorState message={errorMessage(error)} onRetry={() => void refetch()} />
        ) : (
          <>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Stat
                label="Revenue"
                value={formatMoney(data?.total_revenue)}
                tone="good"
                loading={isLoading}
              />
              <Stat
                label="Expenses"
                value={formatMoney(data?.total_expenses)}
                tone="bad"
                loading={isLoading}
              />
              <Stat
                label="Salaries Paid"
                value={formatMoney(data?.staff_salary_paid)}
                loading={isLoading}
              />
              <Stat
                label="Net"
                value={formatMoney(data?.net_amount)}
                tone={Number(data?.net_amount ?? 0) < 0 ? 'bad' : 'good'}
                loading={isLoading}
              />
            </div>

            <dl className="mt-5 grid gap-x-8 sm:grid-cols-2">
              <div className="divide-y divide-ink-100">
                <DetailRow label="Total Members" value={data?.total_members ?? '—'} />
                <DetailRow label="New Members" value={data?.new_members ?? '—'} />
                <DetailRow label="Renewals" value={data?.renewals ?? '—'} />
                <DetailRow label="Active Members" value={data?.active_members ?? '—'} />
              </div>
              <div className="divide-y divide-ink-100">
                <DetailRow label="Expired Members" value={data?.expired_members ?? '—'} />
                <DetailRow
                  label="Pending Payments"
                  value={formatMoney(data?.pending_payments)}
                />
                <DetailRow label="Attendance Count" value={data?.attendance_count ?? '—'} />
              </div>
            </dl>

            <div className="mt-5 flex flex-wrap gap-2 no-print">
              <Button variant="secondary" size="sm" onClick={() => window.print()}
                icon={<Icon name="print" className="size-4" strokeWidth={2} />}>
                Print this summary
              </Button>
            </div>
          </>
        )}
      </Card>

      <Card padded={false}>
        <div className="p-4 sm:p-5">
          <CardHeader
            title="Export to Spreadsheet"
            subtitle="Each file opens directly in Excel or Google Sheets"
            className="mb-0"
          />
        </div>
        <ul className="divide-y divide-ink-100 border-t border-ink-100">
          {EXPORTS.map((item) => (
            <li
              key={item.id}
              className="flex items-center justify-between gap-3 px-4 py-3 sm:px-5"
            >
              <div className="min-w-0">
                <p className="text-sm font-medium text-ink-900">{item.label}</p>
                <p className="truncate text-xs text-ink-500">{item.description}</p>
              </div>
              <Button
                size="sm"
                variant="secondary"
                loading={downloading === item.id}
                loadingText="…"
                onClick={() =>
                  void download(
                    `/reports/export/${item.id}.csv`,
                    `${item.id}.csv`,
                    item.id,
                  )
                }
              >
                Export CSV
              </Button>
            </li>
          ))}
        </ul>
      </Card>

      <Card className="mt-5">
        <CardHeader
          title="Backups"
          subtitle="Keep a copy of your data somewhere safe"
        />
        <p className="text-sm text-ink-600">
          “Download Backup” gives you one ZIP file containing every member, payment,
          receipt, attendance record, expense and salary entry as a spreadsheet. Download
          it once a month and email it to yourself, or keep it on a pen drive.
        </p>
      </Card>
    </>
  )
}
