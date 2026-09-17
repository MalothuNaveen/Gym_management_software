/**
 * Record Payment.
 *
 * Opened either from a member's profile (member already chosen) or from the
 * Payments page (search for the member first). Saving issues the receipt and
 * hands it straight back for sharing.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useState } from 'react'

import { Avatar } from '@/components/ui/Avatar'
import { Button } from '@/components/ui/Button'
import { Badge, LoadingRows } from '@/components/ui/Data'
import { CurrencyInput, DateInput, FormGrid, Select, Textarea } from '@/components/ui/Field'
import { Modal } from '@/components/ui/Overlay'
import { SearchInput, useDebounced } from '@/components/ui/Search'
import { ApiError, api, errorMessage } from '@/lib/api'
import { PAYMENT_METHODS, formatMoney, formatPhone, todayInput } from '@/lib/format'
import { useToast } from '@/lib/toast'
import type { MemberListItem, Page, Payment } from '@/lib/types'

interface SelectedMember {
  id: number
  full_name: string
  member_code: string
  phone: string
  balance?: string
}

interface PaymentDialogProps {
  open: boolean
  onClose: () => void
  /** Pre-selected member; omit to let the owner search. */
  member?: SelectedMember | null
  /** Pre-fills the amount, e.g. when opened from a "Collect ₹800" button. */
  defaultAmount?: string | null
  /** Receives the new receipt so the caller can show it. */
  onRecorded: (payment: Payment) => void
}

export function PaymentDialog({
  open, onClose, member, defaultAmount, onRecorded,
}: PaymentDialogProps) {
  const toast = useToast()
  const queryClient = useQueryClient()

  const [selected, setSelected] = useState<SelectedMember | null>(member ?? null)
  const [amount, setAmount] = useState('')
  const [method, setMethod] = useState('cash')
  const [paidOn, setPaidOn] = useState(todayInput())
  const [notes, setNotes] = useState('')
  const [errors, setErrors] = useState<Record<string, string>>({})

  // Reset each time the dialog opens so a previous entry never lingers.
  useEffect(() => {
    if (open) {
      setSelected(member ?? null)
      // Opening from "Collect ₹800" means that amount is the intent; typing it
      // again would be busywork. It stays editable.
      setAmount(defaultAmount && Number(defaultAmount) > 0
        ? String(Number(defaultAmount))
        : '')
      setMethod('cash')
      setPaidOn(todayInput())
      setNotes('')
      setErrors({})
    }
  }, [open, member, defaultAmount])

  const mutation = useMutation({
    mutationFn: (body: Record<string, unknown>) => api.post<Payment>('/payments', body),
    onSuccess: async (payment) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['members'] }),
        queryClient.invalidateQueries({ queryKey: ['member'] }),
        queryClient.invalidateQueries({ queryKey: ['payments'] }),
        queryClient.invalidateQueries({ queryKey: ['dashboard'] }),
      ])
      toast.success(`${formatMoney(payment.amount)} recorded.`)
      onRecorded(payment)
    },
    onError: (error) => {
      if (error instanceof ApiError && error.field) {
        setErrors({ [error.field]: error.message })
      }
      toast.error(errorMessage(error))
    },
  })

  function handleSave() {
    const found: Record<string, string> = {}
    if (!selected) found.member = 'Please choose a member.'
    if (!amount || Number(amount) <= 0) {
      found.amount = 'Enter an amount greater than zero.'
    }
    if (paidOn > todayInput()) found.paid_on = 'The payment date cannot be in the future.'

    setErrors(found)
    if (Object.keys(found).length > 0) return

    mutation.mutate({
      member_id: selected!.id,
      amount,
      method,
      paid_on: paidOn,
      notes: notes || null,
    })
  }

  return (
    <Modal
      open={open}
      onClose={() => !mutation.isPending && onClose()}
      title="Record Payment"
      footer={
        <>
          <Button
            variant="secondary"
            onClick={onClose}
            disabled={mutation.isPending}
            fullWidth
            className="sm:w-auto"
          >
            Cancel
          </Button>
          <Button
            onClick={handleSave}
            loading={mutation.isPending}
            loadingText="Saving…"
            disabled={!selected}
            fullWidth
            className="sm:w-auto"
          >
            Save Payment
          </Button>
        </>
      }
    >
      {!selected ? (
        <MemberPicker onSelect={setSelected} error={errors.member} />
      ) : (
        <div className="space-y-4">
          <div className="flex items-center gap-3 rounded-xl bg-ink-100 p-3">
            <Avatar
              name={selected.full_name}
              photoPath={`/members/${selected.id}/photo`}
              size="sm"
            />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold text-ink-900">
                {selected.full_name}
              </p>
              <p className="truncate text-xs text-ink-500">
                {selected.member_code} · {formatPhone(selected.phone)}
              </p>
            </div>
            {!member && (
              <Button size="sm" variant="ghost" onClick={() => setSelected(null)}>
                Change
              </Button>
            )}
          </div>

          {selected.balance !== undefined && Number(selected.balance) > 0 && (
            <button
              type="button"
              onClick={() => setAmount(String(Number(selected.balance)))}
              className="flex w-full items-center justify-between rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 text-left transition hover:bg-amber-100"
            >
              <span className="text-sm text-amber-900">
                Outstanding balance{' '}
                <span className="font-semibold tnum">{formatMoney(selected.balance)}</span>
              </span>
              <span className="text-xs font-medium text-amber-700">Use this amount</span>
            </button>
          )}

          <CurrencyInput
            label="Amount"
            required
            autoFocus
            value={amount}
            onChange={setAmount}
            error={errors.amount}
            placeholder="0"
          />

          <FormGrid>
            <Select
              label="Payment Method"
              options={PAYMENT_METHODS.map((m) => ({ value: m.value, label: m.label }))}
              value={method}
              onChange={(event) => setMethod(event.target.value)}
            />
            <DateInput
              label="Payment Date"
              value={paidOn}
              max={todayInput()}
              onChange={(event) => setPaidOn(event.target.value)}
              error={errors.paid_on}
            />
          </FormGrid>

          <Textarea
            label="Note"
            rows={2}
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
            placeholder="Optional"
          />

          <p className="text-xs text-ink-500">
            Paying more than what is owed is saved as an advance and shown as credit.
          </p>
        </div>
      )}
    </Modal>
  )
}

function MemberPicker({
  onSelect, error,
}: {
  onSelect: (member: SelectedMember) => void
  error?: string
}) {
  const [search, setSearch] = useState('')
  const debounced = useDebounced(search)

  const { data, isLoading } = useQuery({
    queryKey: ['members', 'picker', debounced],
    queryFn: () =>
      api.get<Page<MemberListItem>>('/members', {
        q: debounced || undefined,
        page_size: 20,
      }),
  })

  return (
    <div>
      <SearchInput
        value={search}
        onChange={setSearch}
        placeholder="Search member by name, phone or ID"
        autoFocus
      />
      {error && (
        <p className="mt-2 text-sm text-rose-600" role="alert">
          {error}
        </p>
      )}

      <div className="mt-3 max-h-80 overflow-y-auto rounded-xl border border-ink-200">
        {isLoading ? (
          <LoadingRows count={3} />
        ) : (data?.items.length ?? 0) === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-ink-500">
            No members found. Try a different search.
          </p>
        ) : (
          <ul className="divide-y divide-ink-100">
            {data?.items.map((item) => (
              <li key={item.id}>
                <button
                  type="button"
                  onClick={() =>
                    onSelect({
                      id: item.id,
                      full_name: item.full_name,
                      member_code: item.member_code,
                      phone: item.phone,
                      balance: item.balance,
                    })
                  }
                  className="flex w-full items-center gap-3 px-3 py-2.5 text-left transition hover:bg-ink-50"
                >
                  <Avatar
                    name={item.full_name}
                    hasPhoto={item.has_photo}
                    photoPath={`/members/${item.id}/photo`}
                    size="sm"
                  />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-ink-900">
                      {item.full_name}
                    </p>
                    <p className="truncate text-xs text-ink-500">
                      {item.member_code} · {formatPhone(item.phone)}
                    </p>
                  </div>
                  {Number(item.balance) > 0 && (
                    <Badge tone="warning">{formatMoney(item.balance)} due</Badge>
                  )}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
