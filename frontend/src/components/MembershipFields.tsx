/**
 * The membership + payment block, shared by Add Member and Renew Membership.
 *
 * The owner picks a plan and the fee, end date, final amount and balance all
 * fill themselves in. These figures are a live preview only - the server
 * recalculates every one of them before saving.
 */
import { useEffect } from 'react'

import { CurrencyInput, DateInput, FormGrid, Select, Textarea } from '@/components/ui/Field'
import { addDays, formatMoney, PAYMENT_METHODS, todayInput } from '@/lib/format'
import type { Plan } from '@/lib/types'

export interface MembershipFormState {
  plan_id: string
  start_date: string
  end_date: string
  fee: string
  discount: string
  amount_paid: string
  method: string
  paid_on: string
  notes: string
}

export function emptyMembershipForm(startDate?: string): MembershipFormState {
  return {
    plan_id: '',
    start_date: startDate ?? todayInput(),
    end_date: '',
    fee: '',
    discount: '',
    amount_paid: '',
    method: 'cash',
    paid_on: todayInput(),
    notes: '',
  }
}

/** Final Amount = Fee − Discount ; Balance = Final − Paid. */
export function computeTotals(form: MembershipFormState) {
  const fee = Number(form.fee || 0)
  const discount = Number(form.discount || 0)
  const paid = Number(form.amount_paid || 0)
  const finalAmount = Math.max(0, fee - discount)
  const balance = finalAmount - paid
  return {
    fee,
    discount,
    finalAmount,
    paid,
    balance: Math.max(0, balance),
    credit: balance < 0 ? -balance : 0,
    discountTooLarge: discount > fee && fee > 0,
  }
}

interface MembershipFieldsProps {
  plans: Plan[]
  value: MembershipFormState
  onChange: (next: MembershipFormState) => void
  errors?: Partial<Record<keyof MembershipFormState, string>>
  /** Hides the payment half when a membership is being added on its own. */
  showPayment?: boolean
}

export function MembershipFields({
  plans, value, onChange, errors = {}, showPayment = true,
}: MembershipFieldsProps) {
  const selectedPlan = plans.find((plan) => String(plan.id) === value.plan_id)
  const totals = computeTotals(value)

  function update(patch: Partial<MembershipFormState>) {
    onChange({ ...value, ...patch })
  }

  // Selecting a plan fills the fee and the expiry date; both stay editable.
  function handlePlanChange(planId: string) {
    const plan = plans.find((p) => String(p.id) === planId)
    if (!plan) {
      update({ plan_id: planId })
      return
    }
    update({
      plan_id: planId,
      fee: String(Number(plan.price)),
      end_date: addDays(value.start_date, plan.duration_days - 1),
    })
  }

  // Moving the start date shifts the expiry by the same plan length.
  useEffect(() => {
    if (!selectedPlan || !value.start_date) return
    const expected = addDays(value.start_date, selectedPlan.duration_days - 1)
    if (value.end_date !== expected) {
      onChange({ ...value, end_date: expected })
    }
    // Deliberately keyed on the start date only: an end date the owner typed by
    // hand must survive until they change the start date or the plan.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value.start_date, value.plan_id])

  const planOptions = plans
    .filter((plan) => plan.is_active || String(plan.id) === value.plan_id)
    .map((plan) => ({
      value: String(plan.id),
      label: `${plan.name} — ${formatMoney(plan.price)} · ${plan.duration_days} days`,
    }))

  return (
    <div className="space-y-4">
      <Select
        label="Membership Plan"
        required
        placeholder="Choose a plan"
        options={planOptions}
        value={value.plan_id}
        onChange={(event) => handlePlanChange(event.target.value)}
        error={errors.plan_id}
      />

      <FormGrid>
        <DateInput
          label="Start Date"
          required
          value={value.start_date}
          onChange={(event) => update({ start_date: event.target.value })}
          error={errors.start_date}
        />
        <DateInput
          label="End Date"
          value={value.end_date}
          onChange={(event) => update({ end_date: event.target.value })}
          error={errors.end_date}
          hint={selectedPlan ? 'Filled in from the plan. Change it if you need to.' : undefined}
        />
      </FormGrid>

      <FormGrid>
        <CurrencyInput
          label="Membership Fee"
          required
          value={value.fee}
          onChange={(fee) => update({ fee })}
          error={errors.fee}
          placeholder="0"
        />
        <CurrencyInput
          label="Discount"
          value={value.discount}
          onChange={(discount) => update({ discount })}
          error={
            errors.discount ??
            (totals.discountTooLarge ? 'The discount cannot be more than the fee.' : undefined)
          }
          placeholder="0"
        />
      </FormGrid>

      {showPayment && (
        <>
          <FormGrid>
            <CurrencyInput
              label="Amount Paid"
              value={value.amount_paid}
              onChange={(amount_paid) => update({ amount_paid })}
              error={errors.amount_paid}
              placeholder="0"
              hint="Leave empty if they are paying later."
            />
            <Select
              label="Payment Method"
              options={PAYMENT_METHODS.map((m) => ({ value: m.value, label: m.label }))}
              value={value.method}
              onChange={(event) => update({ method: event.target.value })}
            />
          </FormGrid>

          <FormGrid>
            <DateInput
              label="Payment Date"
              value={value.paid_on}
              max={todayInput()}
              onChange={(event) => update({ paid_on: event.target.value })}
              error={errors.paid_on}
            />
            <Textarea
              label="Payment Notes"
              rows={2}
              value={value.notes}
              onChange={(event) => update({ notes: event.target.value })}
              placeholder="Optional"
            />
          </FormGrid>
        </>
      )}

      <AmountSummary totals={totals} showPayment={showPayment} />
    </div>
  )
}

function AmountSummary({
  totals, showPayment,
}: {
  totals: ReturnType<typeof computeTotals>
  showPayment: boolean
}) {
  return (
    <dl className="rounded-xl bg-ink-100 p-4 text-sm">
      <div className="flex justify-between py-1">
        <dt className="text-ink-600">Membership Fee</dt>
        <dd className="font-medium text-ink-900 tnum">{formatMoney(totals.fee)}</dd>
      </div>
      {totals.discount > 0 && (
        <div className="flex justify-between py-1">
          <dt className="text-ink-600">Discount</dt>
          <dd className="font-medium text-ink-900 tnum">− {formatMoney(totals.discount)}</dd>
        </div>
      )}
      <div className="mt-1 flex justify-between border-t border-ink-300/60 pt-2">
        <dt className="font-medium text-ink-800">Final Amount</dt>
        <dd className="text-base font-semibold text-ink-900 tnum">
          {formatMoney(totals.finalAmount)}
        </dd>
      </div>

      {showPayment && (
        <>
          <div className="flex justify-between py-1">
            <dt className="text-ink-600">Amount Paid</dt>
            <dd className="font-medium text-emerald-700 tnum">{formatMoney(totals.paid)}</dd>
          </div>
          <div className="mt-1 flex justify-between border-t border-ink-300/60 pt-2">
            <dt className="font-medium text-ink-800">
              {totals.credit > 0 ? 'Advance Credit' : 'Balance'}
            </dt>
            <dd
              className={`text-base font-semibold tnum ${
                totals.credit > 0
                  ? 'text-emerald-700'
                  : totals.balance > 0
                    ? 'text-amber-700'
                    : 'text-ink-900'
              }`}
            >
              {formatMoney(totals.credit > 0 ? totals.credit : totals.balance)}
            </dd>
          </div>
        </>
      )}
    </dl>
  )
}
