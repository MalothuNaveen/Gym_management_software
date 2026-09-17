/**
 * Add Member — the flow that has to be fastest.
 *
 * Name, phone, photo, plan, payment, save. One screen, one request, and the
 * receipt appears immediately, ready to share.
 */
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'

import {
  MembershipFields, computeTotals, emptyMembershipForm,
  type MembershipFormState,
} from '@/components/MembershipFields'
import {
  EMPTY_PERSONAL, PersonalFields, toPersonalPayload, validatePersonal,
  type PersonalState,
} from '@/components/PersonalFields'
import { ReceiptDialog } from '@/components/ReceiptDialog'
import { PageHeader } from '@/components/layout/AppShell'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Data'
import { FormSection } from '@/components/ui/Field'
import { PhotoCapture } from '@/components/ui/PhotoCapture'
import { ApiError, api, errorMessage } from '@/lib/api'
import { todayInput } from '@/lib/format'
import { useToast } from '@/lib/toast'
import type { MemberCreated, Plan } from '@/lib/types'

export function MemberNewPage() {
  const navigate = useNavigate()
  const toast = useToast()
  const queryClient = useQueryClient()

  const [personal, setPersonal] = useState<PersonalState>(EMPTY_PERSONAL)
  const [membership, setMembership] = useState<MembershipFormState>(emptyMembershipForm())
  const [withMembership, setWithMembership] = useState(true)
  const [photo, setPhoto] = useState<File | null>(null)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)
  const [created, setCreated] = useState<MemberCreated | null>(null)

  const { data: plans = [] } = useQuery({
    queryKey: ['plans'],
    queryFn: () => api.get<Plan[]>('/plans'),
  })

  function validate(): boolean {
    const found = validatePersonal(personal)

    if (withMembership) {
      if (!membership.plan_id) found.plan_id = 'Please choose a membership plan.'
      if (!membership.start_date) found.start_date = 'Please set a start date.'
      if (!membership.fee) found.fee = 'Please enter the membership fee.'
      if (computeTotals(membership).discountTooLarge) {
        found.discount = 'The discount cannot be more than the fee.'
      }
      if (membership.end_date && membership.end_date < membership.start_date) {
        found.end_date = 'The end date cannot be before the start date.'
      }
      if (membership.paid_on && membership.paid_on > todayInput()) {
        found.paid_on = 'The payment date cannot be in the future.'
      }
    }

    setErrors(found)
    return Object.keys(found).length === 0
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    if (saving) return // guards against a double tap
    if (!validate()) {
      toast.error('Please check the highlighted fields.')
      return
    }

    setSaving(true)
    try {
      const body: Record<string, unknown> = toPersonalPayload(personal)

      if (withMembership) {
        body.membership = {
          plan_id: Number(membership.plan_id),
          start_date: membership.start_date,
          end_date: membership.end_date || null,
          fee: membership.fee || '0',
          discount: membership.discount || '0',
        }
        if (computeTotals(membership).paid > 0) {
          body.payment = {
            amount: membership.amount_paid,
            method: membership.method,
            paid_on: membership.paid_on || null,
            notes: membership.notes || null,
          }
        }
      }

      const result = await api.post<MemberCreated>('/members', body)

      // The photo is a second request so a camera hiccup can never cost the
      // owner the member record they just typed in.
      if (photo) {
        try {
          const formData = new FormData()
          formData.append('file', photo)
          await api.upload(`/members/${result.member.id}/photo`, formData)
        } catch {
          toast.info('Member saved, but the photo did not upload. You can add it later.')
        }
      }

      await queryClient.invalidateQueries({ queryKey: ['members'] })
      await queryClient.invalidateQueries({ queryKey: ['dashboard'] })

      toast.success(`${result.member.full_name} added as ${result.member.member_code}.`)

      if (result.receipt_id) {
        setCreated(result) // show the receipt straight away
      } else {
        navigate(`/members/${result.member.id}`, { replace: true })
      }
    } catch (caught) {
      if (caught instanceof ApiError && caught.field) {
        setErrors({ [caught.field]: caught.message })
      }
      toast.error(errorMessage(caught))
      setSaving(false)
    }
  }

  return (
    <>
      <PageHeader title="Add Member" back={{ to: '/members', label: 'Members' }} />

      <form onSubmit={handleSubmit} noValidate className="space-y-4 pb-4">
        <Card>
          <FormSection title="Personal Information">
            <PersonalFields
              value={personal}
              onChange={setPersonal}
              errors={errors}
              autoFocus
            />
          </FormSection>
        </Card>

        <Card>
          <PhotoCapture onSelect={setPhoto} label="Member Photo" disabled={saving} />
        </Card>

        <Card>
          <div className="mb-4 flex items-start justify-between gap-3">
            <div>
              <h2 className="text-base font-semibold text-ink-900">Membership &amp; Payment</h2>
              <p className="mt-0.5 text-sm text-ink-500">
                {withMembership
                  ? 'The amounts below are calculated for you.'
                  : 'You can add a membership later from the member’s profile.'}
              </p>
            </div>
            <label className="flex shrink-0 cursor-pointer items-center gap-2 text-sm text-ink-700">
              <input
                type="checkbox"
                checked={withMembership}
                onChange={(e) => setWithMembership(e.target.checked)}
                className="size-4 rounded border-ink-300 text-ink-900 focus:ring-brand-500"
              />
              Add now
            </label>
          </div>

          {withMembership && (
            <MembershipFields
              plans={plans}
              value={membership}
              onChange={setMembership}
              errors={errors}
            />
          )}
        </Card>

        {/* Sticky on phones so Save is always within thumb reach. */}
        <div className="sticky bottom-16 z-20 -mx-4 border-t border-ink-200 bg-white/95 px-4 py-3 backdrop-blur sm:mx-0 sm:rounded-xl sm:border sm:px-4 lg:bottom-0">
          <div className="flex gap-3">
            <Button
              variant="secondary"
              onClick={() => navigate('/members')}
              disabled={saving}
              className="flex-1 sm:flex-none"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              loading={saving}
              loadingText="Saving…"
              className="flex-1 sm:flex-none"
              size="lg"
            >
              Save Member
            </Button>
          </div>
        </div>
      </form>

      <ReceiptDialog
        open={created !== null}
        receiptId={created?.receipt_id ?? null}
        memberPhone={created?.member.whatsapp ?? created?.member.phone}
        onClose={() => {
          const id = created?.member.id
          setCreated(null)
          if (id) navigate(`/members/${id}`, { replace: true })
        }}
      />
    </>
  )
}
