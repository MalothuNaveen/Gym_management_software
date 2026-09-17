import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'

import { PageHeader } from '@/components/layout/AppShell'
import { Button } from '@/components/ui/Button'
import {
  Badge, Card, EmptyState, ErrorState, LoadingRows, Pagination, Stat,
} from '@/components/ui/Data'
import {
  CurrencyInput, DateInput, FormGrid, Select, Textarea,
} from '@/components/ui/Field'
import { ConfirmDialog, Modal } from '@/components/ui/Overlay'
import { api, errorMessage } from '@/lib/api'
import {
  EXPENSE_CATEGORIES, PAYMENT_METHODS, formatDate, formatMonth, formatMoney,
  labelFor, todayInput,
} from '@/lib/format'
import { useToast } from '@/lib/toast'
import type { Expense, Page } from '@/lib/types'
import { Icon } from '@/components/ui/Icon'

interface Summary {
  total: string
  by_category: { category: string; amount: string }[]
}

export function ExpensesPage() {
  const [page, setPage] = useState(1)
  const [editing, setEditing] = useState<Expense | null>(null)
  const [creating, setCreating] = useState(false)
  const [deleting, setDeleting] = useState<Expense | null>(null)

  const toast = useToast()
  const queryClient = useQueryClient()

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['expenses', page],
    queryFn: () => api.get<Page<Expense>>('/expenses', { page, page_size: 25 }),
    placeholderData: (previous) => previous,
  })

  const monthStart = todayInput().slice(0, 8) + '01'
  const { data: summary } = useQuery({
    queryKey: ['expense-summary', monthStart],
    queryFn: () => api.get<Summary>('/expenses/summary', { start: monthStart }),
  })

  const remove = useMutation({
    mutationFn: (expense: Expense) => api.delete(`/expenses/${expense.id}`),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['expenses'] })
      await queryClient.invalidateQueries({ queryKey: ['expense-summary'] })
      await queryClient.invalidateQueries({ queryKey: ['dashboard'] })
      setDeleting(null)
      toast.success('Expense removed.')
    },
    onError: (caught) => {
      toast.error(errorMessage(caught))
      setDeleting(null)
    },
  })

  const expenses = data?.items ?? []

  return (
    <>
      <PageHeader
        title="Expenses"
        subtitle={formatMonth(todayInput())}
        actions={
          <Button onClick={() => setCreating(true)} icon={<Icon name="plus" className="size-4" strokeWidth={2} />}>
            Add Expense
          </Button>
        }
      />

      <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="This Month" value={formatMoney(summary?.total)} tone="bad" />
        {summary?.by_category.slice(0, 3).map((row) => (
          <Stat
            key={row.category}
            label={labelFor(EXPENSE_CATEGORIES, row.category)}
            value={formatMoney(row.amount)}
          />
        ))}
      </div>

      <Card padded={false} className="overflow-hidden">
        {isError ? (
          <ErrorState message={errorMessage(error)} onRetry={() => void refetch()} />
        ) : isLoading ? (
          <LoadingRows count={4} />
        ) : expenses.length === 0 ? (
          <EmptyState
            icon="receipt"
            title="No expenses recorded"
            description="Track rent, electricity and other costs to see your true monthly profit."
            actionLabel="Add First Expense"
            onAction={() => setCreating(true)}
          />
        ) : (
          <>
            <ul className="divide-y divide-ink-100">
              {expenses.map((expense) => (
                <li key={expense.id} className="flex items-center gap-3 px-4 py-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-semibold text-ink-900 tnum">
                        {formatMoney(expense.amount)}
                      </span>
                      <Badge>{labelFor(EXPENSE_CATEGORIES, expense.category)}</Badge>
                    </div>
                    <p className="mt-0.5 truncate text-xs text-ink-500">
                      {formatDate(expense.expense_date)}
                      {expense.method && ` · ${labelFor(PAYMENT_METHODS, expense.method)}`}
                      {expense.description && ` · ${expense.description}`}
                    </p>
                  </div>
                  <div className="flex shrink-0 gap-1">
                    <Button size="sm" variant="ghost" onClick={() => setEditing(expense)}>
                      Edit
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => setDeleting(expense)}
                      className="text-rose-600 hover:bg-rose-50"
                    >
                      Delete
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
            <Pagination
              page={data?.page ?? 1}
              pages={data?.pages ?? 1}
              total={data?.total ?? 0}
              onChange={setPage}
              itemLabel="expenses"
            />
          </>
        )}
      </Card>

      <ExpenseDialog
        open={creating || editing !== null}
        expense={editing}
        onClose={() => {
          setCreating(false)
          setEditing(null)
        }}
      />

      <ConfirmDialog
        open={deleting !== null}
        onCancel={() => setDeleting(null)}
        onConfirm={() => deleting && remove.mutate(deleting)}
        loading={remove.isPending}
        title="Delete this expense?"
        message={`${formatMoney(deleting?.amount)} on ${formatDate(deleting?.expense_date)} will be removed. This cannot be undone.`}
        confirmLabel="Delete"
      />
    </>
  )
}

interface ExpenseForm {
  expense_date: string
  category: string
  amount: string
  description: string
  method: string
}

function ExpenseDialog({
  open, expense, onClose,
}: {
  open: boolean
  expense: Expense | null
  onClose: () => void
}) {
  const toast = useToast()
  const queryClient = useQueryClient()
  const [form, setForm] = useState<ExpenseForm>({
    expense_date: todayInput(), category: 'rent', amount: '', description: '',
    method: 'cash',
  })
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [loadedFor, setLoadedFor] = useState<number | null | undefined>(undefined)

  if (open && loadedFor !== (expense?.id ?? null)) {
    setForm(
      expense
        ? {
            expense_date: expense.expense_date,
            category: expense.category,
            amount: String(Number(expense.amount)),
            description: expense.description ?? '',
            method: expense.method ?? 'cash',
          }
        : {
            expense_date: todayInput(), category: 'rent', amount: '',
            description: '', method: 'cash',
          },
    )
    setErrors({})
    setLoadedFor(expense?.id ?? null)
  }

  const mutation = useMutation({
    mutationFn: () => {
      const body = {
        expense_date: form.expense_date,
        category: form.category,
        amount: form.amount,
        description: form.description || null,
        method: form.method || null,
      }
      return expense
        ? api.put(`/expenses/${expense.id}`, body)
        : api.post('/expenses', body)
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['expenses'] }),
        queryClient.invalidateQueries({ queryKey: ['expense-summary'] }),
        queryClient.invalidateQueries({ queryKey: ['dashboard'] }),
      ])
      toast.success(expense ? 'Expense updated.' : 'Expense added.')
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
    if (!form.amount || Number(form.amount) <= 0) {
      found.amount = 'Enter an amount greater than zero.'
    }
    if (!form.expense_date) found.expense_date = 'Please choose a date.'
    setErrors(found)
    if (Object.keys(found).length === 0) mutation.mutate()
  }

  return (
    <Modal
      open={open}
      onClose={() => !mutation.isPending && close()}
      title={expense ? 'Edit Expense' : 'Add Expense'}
      footer={
        <>
          <Button variant="secondary" onClick={close} disabled={mutation.isPending}
            fullWidth className="sm:w-auto">
            Cancel
          </Button>
          <Button onClick={save} loading={mutation.isPending} loadingText="Saving…"
            fullWidth className="sm:w-auto">
            {expense ? 'Save Changes' : 'Add Expense'}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <CurrencyInput
          label="Amount"
          required
          autoFocus
          value={form.amount}
          onChange={(amount) => setForm({ ...form, amount })}
          error={errors.amount}
          placeholder="0"
        />

        <FormGrid>
          <Select
            label="Category"
            required
            options={EXPENSE_CATEGORIES.map((c) => ({ value: c.value, label: c.label }))}
            value={form.category}
            onChange={(e) => setForm({ ...form, category: e.target.value })}
          />
          <DateInput
            label="Date"
            required
            value={form.expense_date}
            onChange={(e) => setForm({ ...form, expense_date: e.target.value })}
            error={errors.expense_date}
          />
        </FormGrid>

        <Select
          label="Paid By"
          options={PAYMENT_METHODS.map((m) => ({ value: m.value, label: m.label }))}
          value={form.method}
          onChange={(e) => setForm({ ...form, method: e.target.value })}
        />

        <Textarea
          label="Description"
          rows={2}
          value={form.description}
          onChange={(e) => setForm({ ...form, description: e.target.value })}
          placeholder="e.g. September rent"
        />
      </div>
    </Modal>
  )
}
