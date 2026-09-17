import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'

import { PageHeader } from '@/components/layout/AppShell'
import { Button } from '@/components/ui/Button'
import {
  Badge, Card, EmptyState, ErrorState, LoadingRows,
} from '@/components/ui/Data'
import { CurrencyInput, FormGrid, Input, Textarea } from '@/components/ui/Field'
import { ConfirmDialog, Modal } from '@/components/ui/Overlay'
import { api, errorMessage } from '@/lib/api'
import { formatMoney } from '@/lib/format'
import { useToast } from '@/lib/toast'
import type { Plan } from '@/lib/types'
import { Icon } from '@/components/ui/Icon'

interface PlanForm {
  name: string
  price: string
  duration_days: string
  description: string
}

const EMPTY: PlanForm = { name: '', price: '', duration_days: '', description: '' }

export function PlansPage() {
  const [editing, setEditing] = useState<Plan | null>(null)
  const [creating, setCreating] = useState(false)
  const [confirming, setConfirming] = useState<Plan | null>(null)

  const toast = useToast()
  const queryClient = useQueryClient()

  const { data: plans = [], isLoading, isError, error, refetch } = useQuery({
    queryKey: ['plans'],
    queryFn: () => api.get<Plan[]>('/plans'),
  })

  const deactivate = useMutation({
    mutationFn: (plan: Plan) => api.delete<{ message: string }>(`/plans/${plan.id}`),
    onSuccess: async (result) => {
      await queryClient.invalidateQueries({ queryKey: ['plans'] })
      setConfirming(null)
      toast.success(result.message)
    },
    onError: (caught) => {
      toast.error(errorMessage(caught))
      setConfirming(null)
    },
  })

  const activate = useMutation({
    mutationFn: (plan: Plan) => api.post(`/plans/${plan.id}/activate`),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['plans'] })
      toast.success('Plan is available again.')
    },
    onError: (caught) => toast.error(errorMessage(caught)),
  })

  const active = plans.filter((plan) => plan.is_active)
  const inactive = plans.filter((plan) => !plan.is_active)

  return (
    <>
      <PageHeader
        title="Membership Plans"
        subtitle="What you sell, and for how long"
        actions={
          <Button onClick={() => setCreating(true)} icon={<Icon name="plus" className="size-4" strokeWidth={2} />}>
            Add Plan
          </Button>
        }
      />

      {isError ? (
        <Card padded={false}>
          <ErrorState message={errorMessage(error)} onRetry={() => void refetch()} />
        </Card>
      ) : isLoading ? (
        <Card padded={false}>
          <LoadingRows count={4} />
        </Card>
      ) : plans.length === 0 ? (
        <Card padded={false}>
          <EmptyState
            icon="plans"
            title="No plans yet"
            description="Add a plan so you can sell memberships."
            actionLabel="Add First Plan"
            onAction={() => setCreating(true)}
          />
        </Card>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {active.map((plan) => (
              <PlanCard
                key={plan.id}
                plan={plan}
                onEdit={() => setEditing(plan)}
                onDeactivate={() => setConfirming(plan)}
              />
            ))}
          </div>

          {inactive.length > 0 && (
            <>
              <h2 className="mt-8 mb-3 text-sm font-semibold text-ink-700">
                No longer offered
              </h2>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {inactive.map((plan) => (
                  <PlanCard
                    key={plan.id}
                    plan={plan}
                    onEdit={() => setEditing(plan)}
                    onActivate={() => activate.mutate(plan)}
                  />
                ))}
              </div>
            </>
          )}
        </>
      )}

      <PlanDialog
        open={creating || editing !== null}
        plan={editing}
        onClose={() => {
          setCreating(false)
          setEditing(null)
        }}
      />

      <ConfirmDialog
        open={confirming !== null}
        onCancel={() => setConfirming(null)}
        onConfirm={() => confirming && deactivate.mutate(confirming)}
        loading={deactivate.isPending}
        title={
          confirming && confirming.members_using > 0
            ? 'Stop offering this plan?'
            : 'Remove this plan?'
        }
        message={
          confirming && confirming.members_using > 0
            ? `${confirming.members_using} membership(s) were sold on this plan, so it will be hidden from new sales rather than deleted. Past receipts and history stay exactly as they are.`
            : `"${confirming?.name}" has never been used, so it will be removed completely.`
        }
        confirmLabel={
          confirming && confirming.members_using > 0 ? 'Stop offering' : 'Remove'
        }
      />
    </>
  )
}

function PlanCard({
  plan, onEdit, onDeactivate, onActivate,
}: {
  plan: Plan
  onEdit: () => void
  onDeactivate?: () => void
  onActivate?: () => void
}) {
  return (
    <Card className={plan.is_active ? '' : 'opacity-75'}>
      <div className="flex items-start justify-between gap-2">
        <h3 className="text-base font-semibold text-ink-900">{plan.name}</h3>
        {!plan.is_active && <Badge>Inactive</Badge>}
      </div>

      <p className="mt-2 text-2xl font-semibold text-ink-900 tnum">
        {formatMoney(plan.price)}
      </p>
      <p className="text-sm text-ink-500 tnum">{plan.duration_days} days</p>

      {plan.description && <p className="mt-2 text-sm text-ink-600">{plan.description}</p>}

      <p className="mt-3 text-xs text-ink-500">
        {plan.members_using === 0
          ? 'Not used yet'
          : `Used by ${plan.members_using} membership${plan.members_using === 1 ? '' : 's'}`}
      </p>

      <div className="mt-4 flex gap-2">
        <Button size="sm" variant="secondary" onClick={onEdit}>
          Edit
        </Button>
        {plan.is_active && onDeactivate && (
          <Button size="sm" variant="ghost" onClick={onDeactivate}>
            Stop offering
          </Button>
        )}
        {!plan.is_active && onActivate && (
          <Button size="sm" variant="ghost" onClick={onActivate}>
            Offer again
          </Button>
        )}
      </div>
    </Card>
  )
}

function PlanDialog({
  open, plan, onClose,
}: {
  open: boolean
  plan: Plan | null
  onClose: () => void
}) {
  const toast = useToast()
  const queryClient = useQueryClient()
  const [form, setForm] = useState<PlanForm>(EMPTY)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [loadedFor, setLoadedFor] = useState<number | null | undefined>(undefined)

  // Load values when the dialog opens for a different plan.
  if (open && loadedFor !== (plan?.id ?? null)) {
    setForm(
      plan
        ? {
            name: plan.name,
            price: String(Number(plan.price)),
            duration_days: String(plan.duration_days),
            description: plan.description ?? '',
          }
        : EMPTY,
    )
    setErrors({})
    setLoadedFor(plan?.id ?? null)
  }

  const mutation = useMutation({
    mutationFn: () => {
      const body = {
        name: form.name.trim(),
        price: form.price,
        duration_days: Number(form.duration_days),
        description: form.description || null,
      }
      return plan ? api.put(`/plans/${plan.id}`, body) : api.post('/plans', body)
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['plans'] })
      toast.success(plan ? 'Plan updated.' : 'Plan added.')
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
    if (form.name.trim().length < 2) found.name = 'Please give the plan a name.'
    if (!form.price || Number(form.price) < 0) found.price = 'Please enter the price.'
    if (!form.duration_days || Number(form.duration_days) < 1) {
      found.duration_days = 'Please enter how many days the plan lasts.'
    }
    setErrors(found)
    if (Object.keys(found).length === 0) mutation.mutate()
  }

  return (
    <Modal
      open={open}
      onClose={() => !mutation.isPending && close()}
      title={plan ? 'Edit Plan' : 'Add Plan'}
      footer={
        <>
          <Button
            variant="secondary"
            onClick={close}
            disabled={mutation.isPending}
            fullWidth
            className="sm:w-auto"
          >
            Cancel
          </Button>
          <Button
            onClick={save}
            loading={mutation.isPending}
            loadingText="Saving…"
            fullWidth
            className="sm:w-auto"
          >
            {plan ? 'Save Changes' : 'Add Plan'}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Input
          label="Plan Name"
          required
          autoFocus
          value={form.name}
          onChange={(e) => setForm({ ...form, name: e.target.value })}
          error={errors.name}
          placeholder="3 Months"
        />
        <FormGrid>
          <CurrencyInput
            label="Price"
            required
            value={form.price}
            onChange={(price) => setForm({ ...form, price })}
            error={errors.price}
            placeholder="2500"
          />
          <Input
            label="Duration (days)"
            required
            type="number"
            inputMode="numeric"
            min={1}
            value={form.duration_days}
            onChange={(e) => setForm({ ...form, duration_days: e.target.value })}
            error={errors.duration_days}
            placeholder="90"
          />
        </FormGrid>
        <Textarea
          label="Description"
          rows={2}
          value={form.description}
          onChange={(e) => setForm({ ...form, description: e.target.value })}
          placeholder="Optional"
        />
        {plan && plan.members_using > 0 && (
          <p className="rounded-lg bg-ink-100 px-3 py-2.5 text-xs text-ink-600">
            Changing the price only affects new memberships. The
            {' '}{plan.members_using} existing one(s) keep the price they were sold at.
          </p>
        )}
      </div>
    </Modal>
  )
}
