/**
 * Staff and salary.
 *
 * The four numbers that matter for the month — salary, paid, advance,
 * remaining — are on every card, so "how much do I still owe?" is answered
 * without opening anything.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'

import { PageHeader } from '@/components/layout/AppShell'
import { Avatar } from '@/components/ui/Avatar'
import { Button } from '@/components/ui/Button'
import {
  Badge, Card, CardHeader, DetailRow, EmptyState, ErrorState, LoadingRows,
} from '@/components/ui/Data'
import {
  CurrencyInput, DateInput, FormGrid, Input, Select, Textarea,
} from '@/components/ui/Field'
import { Modal } from '@/components/ui/Overlay'
import { SearchInput, useDebounced } from '@/components/ui/Search'
import { api, errorMessage } from '@/lib/api'
import {
  PAYMENT_METHODS, STAFF_ROLES, formatDate, formatMonth, formatMoney, formatPhone,
  labelFor, todayInput,
} from '@/lib/format'
import { useToast } from '@/lib/toast'
import type { Staff, StaffDetail } from '@/lib/types'
import { Icon } from '@/components/ui/Icon'

export function StaffPage() {
  const [search, setSearch] = useState('')
  const [editing, setEditing] = useState<Staff | null>(null)
  const [creating, setCreating] = useState(false)
  const [salaryFor, setSalaryFor] = useState<Staff | null>(null)
  const [viewing, setViewing] = useState<number | null>(null)
  const debounced = useDebounced(search)

  const { data: staff = [], isLoading, isError, error, refetch } = useQuery({
    queryKey: ['staff', debounced],
    queryFn: () => api.get<Staff[]>('/staff', { q: debounced || undefined }),
  })

  return (
    <>
      <PageHeader
        title="Staff"
        subtitle={formatMonth(todayInput())}
        actions={
          <Button onClick={() => setCreating(true)} icon={<Icon name="plus" className="size-4" strokeWidth={2} />}>
            Add Staff
          </Button>
        }
      />

      <SearchInput
        value={search}
        onChange={setSearch}
        placeholder="Search staff by name or phone"
        className="mb-4"
      />

      {isError ? (
        <Card padded={false}>
          <ErrorState message={errorMessage(error)} onRetry={() => void refetch()} />
        </Card>
      ) : isLoading ? (
        <Card padded={false}>
          <LoadingRows count={3} />
        </Card>
      ) : staff.length === 0 ? (
        <Card padded={false}>
          <EmptyState
            icon="staff"
            title={debounced ? 'No staff found' : 'No staff added yet'}
            description={
              debounced
                ? `Nothing matched "${debounced}".`
                : 'Add your trainers and office staff to track their salary.'
            }
            actionLabel={debounced ? undefined : 'Add First Staff Member'}
            onAction={debounced ? undefined : () => setCreating(true)}
          />
        </Card>
      ) : (
        <div className="grid gap-3 lg:grid-cols-2">
          {staff.map((member) => (
            <StaffCard
              key={member.id}
              staff={member}
              onEdit={() => setEditing(member)}
              onPay={() => setSalaryFor(member)}
              onView={() => setViewing(member.id)}
            />
          ))}
        </div>
      )}

      <StaffDialog
        open={creating || editing !== null}
        staff={editing}
        onClose={() => {
          setCreating(false)
          setEditing(null)
        }}
      />

      <SalaryDialog
        open={salaryFor !== null}
        staff={salaryFor}
        onClose={() => setSalaryFor(null)}
      />

      <StaffHistoryDialog
        staffId={viewing}
        open={viewing !== null}
        onClose={() => setViewing(null)}
      />
    </>
  )
}

function StaffCard({
  staff, onEdit, onPay, onView,
}: {
  staff: Staff
  onEdit: () => void
  onPay: () => void
  onView: () => void
}) {
  const salary = staff.salary
  const remaining = Number(salary?.remaining ?? 0)

  return (
    <Card className={staff.status === 'active' ? '' : 'opacity-75'}>
      <div className="flex items-start gap-3">
        <Avatar
          name={staff.full_name}
          hasPhoto={staff.has_photo}
          photoPath={`/staff/${staff.id}/photo`}
        />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="truncate text-base font-semibold text-ink-900">
              {staff.full_name}
            </h3>
            {staff.status !== 'active' && <Badge>Inactive</Badge>}
          </div>
          <p className="truncate text-sm text-ink-500">
            {labelFor(STAFF_ROLES, staff.role)} · {formatPhone(staff.phone)}
          </p>
          {staff.joining_date && (
            <p className="text-xs text-ink-400">
              Joined {formatDate(staff.joining_date)}
            </p>
          )}
        </div>
      </div>

      {salary && (
        <div className="mt-4 grid grid-cols-4 gap-2 rounded-lg bg-ink-100 p-3 text-center">
          <SalaryCell label="Salary" value={formatMoney(salary.monthly_salary)} />
          <SalaryCell label="Paid" value={formatMoney(salary.paid)} tone="good" />
          <SalaryCell label="Advance" value={formatMoney(salary.advance)} tone="info" />
          <SalaryCell
            label="Remaining"
            value={formatMoney(salary.remaining)}
            tone={remaining > 0 ? 'warn' : 'default'}
          />
        </div>
      )}

      <div className="mt-4 flex flex-wrap gap-2">
        <Button size="sm" onClick={onPay} icon={<Icon name="payments" className="size-4" strokeWidth={2} />}>
          Add Payment
        </Button>
        <Button size="sm" variant="secondary" onClick={onView}>
          History
        </Button>
        <Button size="sm" variant="ghost" onClick={onEdit}>
          Edit
        </Button>
      </div>
    </Card>
  )
}

function SalaryCell({
  label, value, tone = 'default',
}: {
  label: string
  value: string
  tone?: 'default' | 'good' | 'warn' | 'info'
}) {
  const TONES = {
    default: 'text-ink-900',
    good: 'text-emerald-700',
    warn: 'text-amber-700',
    info: 'text-brand-600',
  }
  return (
    <div>
      <p className="text-[10px] font-semibold tracking-wide text-ink-500 uppercase">
        {label}
      </p>
      <p className={`mt-0.5 text-sm font-semibold tnum ${TONES[tone]}`}>{value}</p>
    </div>
  )
}

interface StaffForm {
  full_name: string
  phone: string
  email: string
  role: string
  joining_date: string
  monthly_salary: string
  status: string
  notes: string
}

const EMPTY_STAFF: StaffForm = {
  full_name: '', phone: '', email: '', role: 'other', joining_date: '',
  monthly_salary: '', status: 'active', notes: '',
}

function StaffDialog({
  open, staff, onClose,
}: {
  open: boolean
  staff: Staff | null
  onClose: () => void
}) {
  const toast = useToast()
  const queryClient = useQueryClient()
  const [form, setForm] = useState<StaffForm>(EMPTY_STAFF)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [loadedFor, setLoadedFor] = useState<number | null | undefined>(undefined)

  if (open && loadedFor !== (staff?.id ?? null)) {
    setForm(
      staff
        ? {
            full_name: staff.full_name,
            phone: staff.phone,
            email: staff.email ?? '',
            role: staff.role,
            joining_date: staff.joining_date ?? '',
            monthly_salary: String(Number(staff.monthly_salary)),
            status: staff.status,
            notes: staff.notes ?? '',
          }
        : EMPTY_STAFF,
    )
    setErrors({})
    setLoadedFor(staff?.id ?? null)
  }

  const mutation = useMutation({
    mutationFn: () => {
      const body = {
        full_name: form.full_name.trim(),
        phone: form.phone,
        email: form.email || null,
        role: form.role,
        joining_date: form.joining_date || null,
        monthly_salary: form.monthly_salary || '0',
        status: form.status,
        notes: form.notes || null,
      }
      return staff ? api.put(`/staff/${staff.id}`, body) : api.post('/staff', body)
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['staff'] })
      toast.success(staff ? 'Staff details updated.' : 'Staff member added.')
      close()
    },
    onError: (caught) => toast.error(errorMessage(caught)),
  })

  function close() {
    setLoadedFor(undefined)
    onClose()
  }

  function save() {
    const found: Record<string, string> = {}
    if (form.full_name.trim().length < 2) found.full_name = 'Please enter the full name.'
    if (form.phone.replace(/\D/g, '').length < 10) {
      found.phone = 'Please enter a 10-digit mobile number.'
    }
    if (form.email && !/^\S+@\S+\.\S+$/.test(form.email)) {
      found.email = 'Please enter a valid email address.'
    }
    setErrors(found)
    if (Object.keys(found).length === 0) mutation.mutate()
  }

  return (
    <Modal
      open={open}
      onClose={() => !mutation.isPending && close()}
      title={staff ? 'Edit Staff' : 'Add Staff'}
      footer={
        <>
          <Button variant="secondary" onClick={close} disabled={mutation.isPending}
            fullWidth className="sm:w-auto">
            Cancel
          </Button>
          <Button onClick={save} loading={mutation.isPending} loadingText="Saving…"
            fullWidth className="sm:w-auto">
            {staff ? 'Save Changes' : 'Add Staff'}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <FormGrid>
          <Input
            label="Full Name"
            required
            autoFocus
            value={form.full_name}
            onChange={(e) => setForm({ ...form, full_name: e.target.value })}
            error={errors.full_name}
          />
          <Input
            label="Mobile Number"
            required
            type="tel"
            inputMode="tel"
            value={form.phone}
            onChange={(e) => setForm({ ...form, phone: e.target.value })}
            error={errors.phone}
          />
        </FormGrid>

        <FormGrid>
          <Input
            label="Email"
            type="email"
            inputMode="email"
            autoCapitalize="none"
            value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
            error={errors.email}
          />
          <Select
            label="Role"
            options={STAFF_ROLES.map((r) => ({ value: r.value, label: r.label }))}
            value={form.role}
            onChange={(e) => setForm({ ...form, role: e.target.value })}
          />
        </FormGrid>

        <FormGrid>
          <DateInput
            label="Joining Date"
            value={form.joining_date}
            onChange={(e) => setForm({ ...form, joining_date: e.target.value })}
          />
          <CurrencyInput
            label="Monthly Salary"
            value={form.monthly_salary}
            onChange={(monthly_salary) => setForm({ ...form, monthly_salary })}
            placeholder="15000"
          />
        </FormGrid>

        <Select
          label="Status"
          options={[
            { value: 'active', label: 'Active' },
            { value: 'inactive', label: 'Inactive' },
          ]}
          value={form.status}
          onChange={(e) => setForm({ ...form, status: e.target.value })}
        />

        <Textarea
          label="Notes"
          rows={2}
          value={form.notes}
          onChange={(e) => setForm({ ...form, notes: e.target.value })}
        />
      </div>
    </Modal>
  )
}

function SalaryDialog({
  open, staff, onClose,
}: {
  open: boolean
  staff: Staff | null
  onClose: () => void
}) {
  const toast = useToast()
  const queryClient = useQueryClient()
  const [amount, setAmount] = useState('')
  const [kind, setKind] = useState('salary')
  const [paidOn, setPaidOn] = useState(todayInput())
  const [method, setMethod] = useState('cash')
  const [notes, setNotes] = useState('')
  const [error, setError] = useState<string | undefined>()
  const [opened, setOpened] = useState(false)

  if (open && !opened) {
    setAmount('')
    setKind('salary')
    setPaidOn(todayInput())
    setMethod('cash')
    setNotes('')
    setError(undefined)
    setOpened(true)
  }

  const mutation = useMutation({
    mutationFn: () =>
      api.post('/staff/salary', {
        staff_id: staff!.id,
        amount,
        kind,
        paid_on: paidOn,
        period_month: paidOn,
        method,
        notes: notes || null,
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['staff'] })
      await queryClient.invalidateQueries({ queryKey: ['staff-detail'] })
      toast.success(`${formatMoney(amount)} recorded for ${staff?.full_name}.`)
      close()
    },
    onError: (caught) => toast.error(errorMessage(caught)),
  })

  function close() {
    setOpened(false)
    onClose()
  }

  function save() {
    if (!amount || Number(amount) <= 0) {
      setError('Enter an amount greater than zero.')
      return
    }
    setError(undefined)
    mutation.mutate()
  }

  const salary = staff?.salary

  return (
    <Modal
      open={open}
      onClose={() => !mutation.isPending && close()}
      title="Add Salary Payment"
      description={staff?.full_name}
      footer={
        <>
          <Button variant="secondary" onClick={close} disabled={mutation.isPending}
            fullWidth className="sm:w-auto">
            Cancel
          </Button>
          <Button onClick={save} loading={mutation.isPending} loadingText="Saving…"
            fullWidth className="sm:w-auto">
            Save Payment
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {salary && (
          <dl className="rounded-xl bg-ink-100 p-3 text-sm">
            <DetailRow
              label={`Salary for ${formatMonth(salary.period_month)}`}
              value={formatMoney(salary.monthly_salary)}
            />
            <DetailRow label="Already paid" value={formatMoney(salary.paid)} />
            <DetailRow label="Advance given" value={formatMoney(salary.advance)} />
            <DetailRow
              label="Remaining"
              value={
                <span className={Number(salary.remaining) > 0 ? 'text-amber-700' : ''}>
                  {formatMoney(salary.remaining)}
                </span>
              }
            />
          </dl>
        )}

        <Select
          label="Payment Type"
          options={[
            { value: 'salary', label: 'Salary' },
            { value: 'advance', label: 'Advance' },
            { value: 'other', label: 'Other' },
          ]}
          value={kind}
          onChange={(e) => setKind(e.target.value)}
          hint="Both salary and advances count against this month's salary."
        />

        <CurrencyInput
          label="Amount"
          required
          autoFocus
          value={amount}
          onChange={setAmount}
          error={error}
          placeholder="0"
        />

        <FormGrid>
          <DateInput
            label="Payment Date"
            value={paidOn}
            onChange={(e) => setPaidOn(e.target.value)}
            hint="The month of this date is the salary month."
          />
          <Select
            label="Payment Method"
            options={PAYMENT_METHODS.map((m) => ({ value: m.value, label: m.label }))}
            value={method}
            onChange={(e) => setMethod(e.target.value)}
          />
        </FormGrid>

        <Textarea
          label="Notes"
          rows={2}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Optional"
        />
      </div>
    </Modal>
  )
}

function StaffHistoryDialog({
  staffId, open, onClose,
}: {
  staffId: number | null
  open: boolean
  onClose: () => void
}) {
  const { data, isLoading } = useQuery({
    queryKey: ['staff-detail', staffId],
    queryFn: () => api.get<StaffDetail>(`/staff/${staffId}`),
    enabled: open && staffId !== null,
  })

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Salary History"
      description={data?.full_name}
      footer={
        <Button variant="secondary" onClick={onClose} fullWidth className="sm:w-auto">
          Close
        </Button>
      }
    >
      {isLoading ? (
        <LoadingRows count={3} />
      ) : !data || data.salary_records.length === 0 ? (
        <EmptyState
          icon="payments"
          title="No payments yet"
          description="Salary payments and advances will appear here."
        />
      ) : (
        <ul className="divide-y divide-ink-100">
          {data.salary_records.map((record) => (
            <li key={record.id} className="flex items-center justify-between gap-3 py-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold text-ink-900 tnum">
                    {formatMoney(record.amount)}
                  </span>
                  <Badge tone={record.kind === 'advance' ? 'info' : 'neutral'}>
                    {record.kind === 'advance' ? 'Advance' : record.kind === 'salary'
                      ? 'Salary' : 'Other'}
                  </Badge>
                </div>
                <p className="mt-0.5 truncate text-xs text-ink-500">
                  {formatDate(record.paid_on)} · for {formatMonth(record.period_month)}
                  {record.method && ` · ${labelFor(PAYMENT_METHODS, record.method)}`}
                </p>
                {record.notes && (
                  <p className="truncate text-xs text-ink-400">{record.notes}</p>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
      {data?.salary && (
        <div className="mt-4 border-t border-ink-200 pt-3">
          <CardHeader title={`This month — ${formatMonth(data.salary.period_month)}`}
            className="mb-2" />
          <dl>
            <DetailRow label="Monthly salary" value={formatMoney(data.salary.monthly_salary)} />
            <DetailRow label="Paid" value={formatMoney(data.salary.paid)} />
            <DetailRow label="Advance" value={formatMoney(data.salary.advance)} />
            <DetailRow label="Remaining" value={formatMoney(data.salary.remaining)} />
          </dl>
        </div>
      )}
    </Modal>
  )
}
