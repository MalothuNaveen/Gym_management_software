import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { useParams } from 'react-router-dom'

import { PaymentDialog } from '@/components/PaymentDialog'
import {
  EMPTY_PERSONAL, PersonalFields, toPersonalPayload, validatePersonal,
  type PersonalState,
} from '@/components/PersonalFields'
import { ReceiptDialog } from '@/components/ReceiptDialog'
import { RenewDialog } from '@/components/RenewDialog'
import { PageHeader } from '@/components/layout/AppShell'
import { Avatar, invalidatePhoto } from '@/components/ui/Avatar'
import { Button } from '@/components/ui/Button'
import {
  Badge, Card, CardHeader, DetailRow, EmptyState, ErrorState, LoadingRows, StatusBadge,
} from '@/components/ui/Data'
import { ConfirmDialog, Modal } from '@/components/ui/Overlay'
import { PhotoCapture } from '@/components/ui/PhotoCapture'
import { api, errorMessage } from '@/lib/api'
import {
  describeDays, formatDate, formatMoney, formatPhone, labelFor, PAYMENT_METHODS,
} from '@/lib/format'
import { useToast } from '@/lib/toast'
import type { MemberDetail, Payment } from '@/lib/types'
import { Icon } from '@/components/ui/Icon'

export function MemberProfilePage() {
  const { id } = useParams<{ id: string }>()
  const memberId = Number(id)
  const toast = useToast()
  const queryClient = useQueryClient()

  // A string means the payment dialog opens with that amount already filled.
  const [showPayment, setShowPayment] = useState<false | true | string>(false)
  const [showRenew, setShowRenew] = useState(false)
  const [showEdit, setShowEdit] = useState(false)
  const [showPhoto, setShowPhoto] = useState(false)
  const [confirmArchive, setConfirmArchive] = useState(false)
  const [receiptId, setReceiptId] = useState<number | null>(null)

  const { data: member, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['member', memberId],
    queryFn: () => api.get<MemberDetail>(`/members/${memberId}`),
    enabled: Number.isFinite(memberId),
  })

  const { data: payments = [] } = useQuery({
    queryKey: ['member-payments', memberId],
    queryFn: () => api.get<Payment[]>(`/members/${memberId}/payments`),
    enabled: Number.isFinite(memberId),
  })

  const checkIn = useMutation({
    mutationFn: () => api.post('/attendance/check-in', { member_id: memberId }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['member', memberId] })
      await queryClient.invalidateQueries({ queryKey: ['dashboard'] })
      toast.success('Marked present for today.')
    },
    onError: (caught) => toast.error(errorMessage(caught)),
  })

  const archive = useMutation({
    mutationFn: () =>
      member?.is_active
        ? api.delete(`/members/${memberId}`)
        : api.post(`/members/${memberId}/restore`),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['member', memberId] })
      await queryClient.invalidateQueries({ queryKey: ['members'] })
      setConfirmArchive(false)
      toast.success(member?.is_active ? 'Member archived.' : 'Member restored.')
    },
    onError: (caught) => {
      toast.error(errorMessage(caught))
      setConfirmArchive(false)
    },
  })

  if (isError) {
    return (
      <Card padded={false}>
        <ErrorState message={errorMessage(error)} onRetry={() => void refetch()} />
      </Card>
    )
  }

  if (isLoading || !member) {
    return (
      <Card padded={false}>
        <LoadingRows count={6} />
      </Card>
    )
  }

  const { financials, attendance, current_membership: current } = member

  return (
    <>
      <PageHeader
        title={member.full_name}
        back={{ to: '/members', label: 'Members' }}
        actions={
          <>
            <Button variant="secondary" onClick={() => setShowEdit(true)}>
              Edit
            </Button>
            <Button onClick={() => setShowRenew(true)} icon={<Icon name="renew" className="size-4" strokeWidth={2} />}>
              Renew
            </Button>
          </>
        }
      />

      <div className="grid gap-4 lg:grid-cols-3">
        {/* ------------------- Left column ------------------- */}
        <div className="space-y-4 lg:col-span-1">
          <Card>
            <div className="flex flex-col items-center text-center">
              <button
                type="button"
                onClick={() => setShowPhoto(true)}
                className="group relative rounded-full"
                aria-label="Change photo"
              >
                <Avatar
                  name={member.full_name}
                  hasPhoto={member.has_photo}
                  photoPath={`/members/${member.id}/photo`}
                  size="xl"
                />
                <span className="absolute -right-1 -bottom-1 flex size-8 items-center justify-center rounded-full border-2 border-white bg-ink-900 text-white shadow-e2">
                  <Icon name="camera" className="size-4" strokeWidth={2} />
                </span>
              </button>

              <h2 className="mt-3 text-lg font-semibold text-ink-900">{member.full_name}</h2>
              <p className="text-sm text-ink-500 tnum">{member.member_code}</p>
              <div className="mt-2 flex flex-wrap items-center justify-center gap-2">
                <StatusBadge status={member.status} />
                {current && (
                  <span className="text-xs text-ink-500">
                    {describeDays(member.days_remaining)}
                  </span>
                )}
              </div>
            </div>

            <dl className="mt-5 divide-y divide-ink-100 border-t border-ink-100 pt-1">
              <DetailRow
                label="Phone"
                value={
                  <a href={`tel:${member.phone}`} className="text-brand-600 tnum">
                    {formatPhone(member.phone)}
                  </a>
                }
              />
              {member.whatsapp && (
                <DetailRow label="WhatsApp" value={formatPhone(member.whatsapp)} />
              )}
              {member.email && <DetailRow label="Email" value={member.email} />}
              <DetailRow label="Joined" value={formatDate(member.joined_on)} />
              {member.date_of_birth && (
                <DetailRow label="Date of Birth" value={formatDate(member.date_of_birth)} />
              )}
              {member.emergency_contact_name && (
                <DetailRow
                  label="Emergency"
                  value={
                    <>
                      {member.emergency_contact_name}
                      {member.emergency_contact_phone && (
                        <span className="block text-xs text-ink-500 tnum">
                          {formatPhone(member.emergency_contact_phone)}
                        </span>
                      )}
                    </>
                  }
                />
              )}
              {member.address && <DetailRow label="Address" value={member.address} />}
            </dl>
          </Card>

          <Card>
            <CardHeader title="Actions" />
            <div className="grid gap-2">
              <Button
                variant="secondary"
                fullWidth
                onClick={() => setShowPayment(true)}
                icon={<Icon name="payments" className="size-4" strokeWidth={2} />}
              >
                Record Payment
              </Button>
              <Button
                variant="secondary"
                fullWidth
                onClick={() => checkIn.mutate()}
                loading={checkIn.isPending}
                loadingText="Marking…"
                icon={<Icon name="check" className="size-4" strokeWidth={2} />}
              >
                Mark Attendance
              </Button>
              <Button
                variant="ghost"
                fullWidth
                onClick={() => setConfirmArchive(true)}
                className="text-rose-600 hover:bg-rose-50"
              >
                {member.is_active ? 'Archive Member' : 'Restore Member'}
              </Button>
            </div>
            {!member.is_active && (
              <p className="mt-3 rounded-lg bg-ink-100 px-3 py-2 text-xs text-ink-600">
                This member is archived. Their history is kept, but they are hidden from
                lists and cannot be checked in.
              </p>
            )}
          </Card>
        </div>

        {/* ------------------- Right column ------------------- */}
        <div className="space-y-4 lg:col-span-2">
          <Card>
            <CardHeader
              title="Current Membership"
              action={
                current ? <StatusBadge status={current.status} /> : undefined
              }
            />
            {current ? (
              <dl className="divide-y divide-ink-100">
                <DetailRow label="Plan" value={current.plan_name} />
                <DetailRow label="Start Date" value={formatDate(current.start_date)} />
                <DetailRow label="Expiry Date" value={formatDate(current.end_date)} />
                <DetailRow
                  label="Days Remaining"
                  value={describeDays(current.days_remaining)}
                />
              </dl>
            ) : (
              <EmptyState
                icon="plans"
                title="No membership yet"
                description="Add a membership so this member can start."
                actionLabel="Add Membership"
                onAction={() => setShowRenew(true)}
              />
            )}
          </Card>

          <Card>
            <CardHeader title="Payment Summary" />
            <div className="grid grid-cols-3 gap-3">
              <SummaryTile label="Total Fee" value={formatMoney(financials.total_charged)} />
              <SummaryTile
                label="Paid"
                value={formatMoney(financials.total_paid)}
                tone="good"
              />
              {Number(financials.credit) > 0 ? (
                <SummaryTile
                  label="Advance"
                  value={formatMoney(financials.credit)}
                  tone="good"
                />
              ) : (
                <SummaryTile
                  label="Balance"
                  value={formatMoney(financials.balance)}
                  tone={Number(financials.balance) > 0 ? 'warn' : 'default'}
                />
              )}
            </div>
            {Number(financials.balance) > 0 && (
              <Button
                className="mt-4"
                fullWidth
                onClick={() => setShowPayment(financials.balance)}
              >
                Collect {formatMoney(financials.balance)}
              </Button>
            )}
          </Card>

          <Card padded={false}>
            <div className="p-4 sm:p-5">
              <CardHeader title="Payment History" className="mb-0" />
            </div>
            {payments.length === 0 ? (
              <EmptyState
                icon="receipt"
                title="No payments yet"
                description="Record the first payment for this member."
                actionLabel="Record Payment"
                onAction={() => setShowPayment(true)}
              />
            ) : (
              <ul className="divide-y divide-ink-100 border-t border-ink-100">
                {payments.map((payment) => (
                  <li
                    key={payment.id}
                    className="flex items-center gap-3 px-4 py-3 sm:px-5"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <p
                          className={`text-sm font-semibold tnum ${
                            payment.is_void
                              ? 'text-ink-400 line-through'
                              : 'text-ink-900'
                          }`}
                        >
                          {formatMoney(payment.amount)}
                        </p>
                        <Badge tone="neutral">
                          {labelFor(PAYMENT_METHODS, payment.method)}
                        </Badge>
                        {payment.kind === 'advance' && (
                          <Badge tone="info">Advance</Badge>
                        )}
                        {payment.is_void && <Badge tone="danger">Cancelled</Badge>}
                      </div>
                      <p className="mt-0.5 truncate text-xs text-ink-500">
                        {formatDate(payment.paid_on)}
                        {payment.receipt_no && ` · ${payment.receipt_no}`}
                        {payment.notes && ` · ${payment.notes}`}
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
            )}
          </Card>

          <div className="grid gap-4 sm:grid-cols-2">
            <Card>
              <CardHeader title="Attendance" />
              <dl className="divide-y divide-ink-100">
                <DetailRow label="Total Visits" value={attendance.total_visits} />
                <DetailRow label="This Month" value={attendance.this_month} />
                <DetailRow
                  label="Last Visit"
                  value={attendance.last_visit ? formatDate(attendance.last_visit) : '—'}
                />
              </dl>
            </Card>

            <Card padded={false}>
              <div className="p-4 sm:p-5">
                <CardHeader
                  title="Membership History"
                  subtitle={`${member.memberships.length} term${member.memberships.length === 1 ? '' : 's'}`}
                  className="mb-0"
                />
              </div>
              {member.memberships.length === 0 ? (
                <p className="px-5 pb-5 text-sm text-ink-500">No memberships yet.</p>
              ) : (
                <ul className="divide-y divide-ink-100 border-t border-ink-100">
                  {member.memberships.map((term) => (
                    <li key={term.id} className="px-4 py-3 sm:px-5">
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-sm font-medium text-ink-900">{term.plan_name}</p>
                        <span className="text-sm font-medium text-ink-700 tnum">
                          {formatMoney(term.final_amount)}
                        </span>
                      </div>
                      <p className="mt-0.5 text-xs text-ink-500">
                        {formatDate(term.start_date)} → {formatDate(term.end_date)}
                      </p>
                      {Number(term.balance) > 0 && (
                        <p className="mt-1 text-xs font-medium text-amber-700 tnum">
                          {formatMoney(term.balance)} unpaid
                        </p>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          </div>
        </div>
      </div>

      {/* ------------------- Dialogs ------------------- */}
      <PaymentDialog
        open={showPayment !== false}
        defaultAmount={typeof showPayment === 'string' ? showPayment : null}
        onClose={() => setShowPayment(false)}
        member={{
          id: member.id,
          full_name: member.full_name,
          member_code: member.member_code,
          phone: member.phone,
          balance: financials.balance,
        }}
        onRecorded={(payment) => {
          setShowPayment(false)
          if (payment.receipt_id) setReceiptId(payment.receipt_id)
        }}
      />

      <RenewDialog
        open={showRenew}
        onClose={() => setShowRenew(false)}
        member={member}
        onRenewed={(result) => {
          setShowRenew(false)
          if (result.receipt_id) setReceiptId(result.receipt_id)
        }}
      />

      <EditMemberDialog
        open={showEdit}
        onClose={() => setShowEdit(false)}
        member={member}
      />

      <PhotoDialog
        open={showPhoto}
        onClose={() => setShowPhoto(false)}
        memberId={member.id}
        hasPhoto={member.has_photo}
      />

      <ReceiptDialog
        open={receiptId !== null}
        receiptId={receiptId}
        memberPhone={member.whatsapp ?? member.phone}
        onClose={() => setReceiptId(null)}
      />

      <ConfirmDialog
        open={confirmArchive}
        onCancel={() => setConfirmArchive(false)}
        onConfirm={() => archive.mutate()}
        loading={archive.isPending}
        tone={member.is_active ? 'danger' : 'primary'}
        title={member.is_active ? 'Archive this member?' : 'Restore this member?'}
        message={
          member.is_active
            ? `${member.full_name} will be hidden from the members list. Their payments, receipts and history are all kept, and you can restore them at any time.`
            : `${member.full_name} will appear in the members list again.`
        }
        confirmLabel={member.is_active ? 'Archive' : 'Restore'}
      />
    </>
  )
}

function SummaryTile({
  label, value, tone = 'default',
}: {
  label: string
  value: string
  tone?: 'default' | 'good' | 'warn'
}) {
  const TONES = {
    default: 'text-ink-900',
    good: 'text-emerald-700',
    warn: 'text-amber-700',
  }
  return (
    <div className="rounded-lg bg-ink-100 p-3 text-center">
      <p className="text-[11px] font-semibold tracking-wide text-ink-500 uppercase">{label}</p>
      <p className={`mt-1 text-lg font-semibold tnum ${TONES[tone]}`}>{value}</p>
    </div>
  )
}

function EditMemberDialog({
  open, onClose, member,
}: {
  open: boolean
  onClose: () => void
  member: MemberDetail
}) {
  const toast = useToast()
  const queryClient = useQueryClient()
  const [form, setForm] = useState<PersonalState>(EMPTY_PERSONAL)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [initialised, setInitialised] = useState(false)

  // Load the current values once the dialog opens.
  if (open && !initialised) {
    setForm({
      full_name: member.full_name,
      phone: member.phone,
      whatsapp: member.whatsapp ?? '',
      email: member.email ?? '',
      date_of_birth: member.date_of_birth ?? '',
      gender: member.gender ?? '',
      address: member.address ?? '',
      emergency_contact_name: member.emergency_contact_name ?? '',
      emergency_contact_phone: member.emergency_contact_phone ?? '',
      notes: member.notes ?? '',
    })
    setInitialised(true)
  }

  const mutation = useMutation({
    mutationFn: () => api.put(`/members/${member.id}`, toPersonalPayload(form)),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['member', member.id] })
      await queryClient.invalidateQueries({ queryKey: ['members'] })
      toast.success('Member details updated.')
      close()
    },
    onError: (caught) => toast.error(errorMessage(caught)),
  })

  function close() {
    setInitialised(false)
    setErrors({})
    onClose()
  }

  function save() {
    const found = validatePersonal(form)
    setErrors(found)
    if (Object.keys(found).length === 0) mutation.mutate()
  }

  return (
    <Modal
      open={open}
      onClose={() => !mutation.isPending && close()}
      title="Edit Member"
      size="lg"
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
            Save Changes
          </Button>
        </>
      }
    >
      <PersonalFields value={form} onChange={setForm} errors={errors} />
    </Modal>
  )
}

function PhotoDialog({
  open, onClose, memberId, hasPhoto,
}: {
  open: boolean
  onClose: () => void
  memberId: number
  hasPhoto: boolean
}) {
  const toast = useToast()
  const queryClient = useQueryClient()
  const [file, setFile] = useState<File | null>(null)

  const upload = useMutation({
    mutationFn: async () => {
      if (!file) {
        await api.delete(`/members/${memberId}/photo`)
        return
      }
      const formData = new FormData()
      formData.append('file', file)
      await api.upload(`/members/${memberId}/photo`, formData)
    },
    onSuccess: async () => {
      invalidatePhoto(`/members/${memberId}/photo`)
      await queryClient.invalidateQueries({ queryKey: ['member', memberId] })
      await queryClient.invalidateQueries({ queryKey: ['members'] })
      toast.success(file ? 'Photo updated.' : 'Photo removed.')
      setFile(null)
      onClose()
    },
    onError: (caught) => toast.error(errorMessage(caught)),
  })

  return (
    <Modal
      open={open}
      onClose={() => !upload.isPending && onClose()}
      title="Member Photo"
      size="sm"
      footer={
        <>
          <Button
            variant="secondary"
            onClick={onClose}
            disabled={upload.isPending}
            fullWidth
            className="sm:w-auto"
          >
            Cancel
          </Button>
          <Button
            onClick={() => upload.mutate()}
            loading={upload.isPending}
            loadingText="Uploading…"
            disabled={!file && !hasPhoto}
            fullWidth
            className="sm:w-auto"
          >
            {file ? 'Save Photo' : 'Remove Photo'}
          </Button>
        </>
      }
    >
      <PhotoCapture onSelect={setFile} label="" disabled={upload.isPending} />
    </Modal>
  )
}
