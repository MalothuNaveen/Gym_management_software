/**
 * Renew Membership.
 *
 * The plan and start date are pre-filled from the member's current term, so a
 * straightforward renewal is: open, confirm, save, share the receipt.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useState } from 'react'

import {
  MembershipFields, computeTotals, emptyMembershipForm,
  type MembershipFormState,
} from '@/components/MembershipFields'
import { Button } from '@/components/ui/Button'
import { Modal } from '@/components/ui/Overlay'
import { ApiError, api, errorMessage } from '@/lib/api'
import { addDays, formatDate, todayInput } from '@/lib/format'
import { useToast } from '@/lib/toast'
import type { MemberCreated, MemberDetail, Plan } from '@/lib/types'

interface RenewalDefaults {
  start_date: string
  plan_id: number | null
  plan_name: string | null
}

export function RenewDialog({
  open, onClose, member, onRenewed,
}: {
  open: boolean
  onClose: () => void
  member: MemberDetail
  onRenewed: (result: MemberCreated) => void
}) {
  const toast = useToast()
  const queryClient = useQueryClient()
  const [form, setForm] = useState<MembershipFormState>(emptyMembershipForm())
  const [errors, setErrors] = useState<Record<string, string>>({})

  const { data: plans = [] } = useQuery({
    queryKey: ['plans'],
    queryFn: () => api.get<Plan[]>('/plans'),
  })

  const { data: defaults } = useQuery({
    queryKey: ['renewal-defaults', member.id],
    queryFn: () => api.get<RenewalDefaults>(`/members/${member.id}/renewal-defaults`),
    enabled: open,
  })

  // Pre-fill from the current term once the defaults and plans have loaded.
  useEffect(() => {
    if (!open || !defaults) return
    const plan = plans.find((p) => p.id === defaults.plan_id && p.is_active)
    setForm({
      ...emptyMembershipForm(defaults.start_date),
      plan_id: plan ? String(plan.id) : '',
      fee: plan ? String(Number(plan.price)) : '',
      end_date: plan ? addDays(defaults.start_date, plan.duration_days - 1) : '',
    })
    setErrors({})
  }, [open, defaults, plans])

  const mutation = useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      api.post<MemberCreated>(`/members/${member.id}/renew`, body),
    onSuccess: async (result) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['member', member.id] }),
        queryClient.invalidateQueries({ queryKey: ['members'] }),
        queryClient.invalidateQueries({ queryKey: ['payments'] }),
        queryClient.invalidateQueries({ queryKey: ['dashboard'] }),
      ])
      toast.success('Membership renewed.')
      onRenewed(result)
    },
    onError: (error) => {
      if (error instanceof ApiError && error.field) setErrors({ [error.field]: error.message })
      toast.error(errorMessage(error))
    },
  })

  function handleSave() {
    const found: Record<string, string> = {}
    if (!form.plan_id) found.plan_id = 'Please choose a membership plan.'
    if (!form.start_date) found.start_date = 'Please set a start date.'
    if (!form.fee) found.fee = 'Please enter the membership fee.'
    if (computeTotals(form).discountTooLarge) {
      found.discount = 'The discount cannot be more than the fee.'
    }
    if (form.end_date && form.end_date < form.start_date) {
      found.end_date = 'The end date cannot be before the start date.'
    }
    if (form.paid_on && form.paid_on > todayInput()) {
      found.paid_on = 'The payment date cannot be in the future.'
    }

    setErrors(found)
    if (Object.keys(found).length > 0) return

    const body: Record<string, unknown> = {
      membership: {
        plan_id: Number(form.plan_id),
        start_date: form.start_date,
        end_date: form.end_date || null,
        fee: form.fee,
        discount: form.discount || '0',
      },
    }
    if (computeTotals(form).paid > 0) {
      body.payment = {
        amount: form.amount_paid,
        method: form.method,
        paid_on: form.paid_on || null,
        notes: form.notes || null,
      }
    }
    mutation.mutate(body)
  }

  const current = member.current_membership

  return (
    <Modal
      open={open}
      onClose={() => !mutation.isPending && onClose()}
      title="Renew Membership"
      description={member.full_name}
      size="lg"
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
            fullWidth
            className="sm:w-auto"
          >
            Save Renewal
          </Button>
        </>
      }
    >
      {current && (
        <p className="mb-4 rounded-lg bg-ink-100 px-3 py-2.5 text-sm text-ink-600">
          Current membership: <strong className="text-ink-900">{current.plan_name}</strong>,
          ending {formatDate(current.end_date)}. The new term starts the day after, so no
          paid days are lost.
        </p>
      )}

      <MembershipFields plans={plans} value={form} onChange={setForm} errors={errors} />
    </Modal>
  )
}
