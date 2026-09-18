/**
 * Send WhatsApp renewal reminders.
 *
 * Three steps: choose who, read what they will get, then step through them.
 *
 * The stepping is deliberate. A browser blocks a burst of window.open() calls
 * that did not each come from a click, so a single "send all" button would
 * silently drop most of the messages. One click per member is honest about what
 * is happening, and the owner sees each message land in WhatsApp.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useMemo, useRef, useState } from 'react'

import { Avatar } from '@/components/ui/Avatar'
import { Button } from '@/components/ui/Button'
import { Badge, LoadingRows } from '@/components/ui/Data'
import { Icon } from '@/components/ui/Icon'
import { Modal } from '@/components/ui/Overlay'
import { api, errorMessage } from '@/lib/api'
import { describeDays, formatDate, formatMoney, formatPhone } from '@/lib/format'
import { useToast } from '@/lib/toast'
import {
  deepLinkProvider, summarise, type Recipient, type SendOutcome,
} from '@/lib/whatsapp'

interface PreparedReminder extends Recipient {
  member_code: string
  plan_name: string | null
  end_date: string
  days_remaining: number
  balance: string
  has_photo: boolean
}

interface RemindersResponse {
  gym_name: string
  total: number
  sendable: number
  unreachable: number
  reminders: PreparedReminder[]
}

type Step = 'choose' | 'sending' | 'done'
type Audience = 'all' | 'some'

export function RenewalReminderDialog({
  open, onClose,
}: {
  open: boolean
  onClose: () => void
}) {
  const toast = useToast()
  const queryClient = useQueryClient()

  const [step, setStep] = useState<Step>('choose')
  const [audience, setAudience] = useState<Audience>('all')
  const [chosen, setChosen] = useState<Set<number>>(new Set())
  const [previewFor, setPreviewFor] = useState<number | null>(null)
  const [queue, setQueue] = useState<PreparedReminder[]>([])
  const [position, setPosition] = useState(0)
  const [outcomes, setOutcomes] = useState<SendOutcome[]>([])
  // Whether this opening has already had its default selection applied.
  const defaulted = useRef(false)

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['renewal-reminders'],
    queryFn: () => api.get<RemindersResponse>('/messages/renewal-reminders', { days: 7 }),
    enabled: open,
  })

  const logRun = useMutation({
    mutationFn: (messages: SendOutcome[]) =>
      api.post('/messages/batch', {
        messages: messages.map((outcome) => ({
          member_id: outcome.member_id,
          member_name: outcome.member_name,
          phone: outcome.phone,
          channel: 'whatsapp',
          kind: 'renewal_reminder',
          status: outcome.status,
          detail: outcome.detail,
          body: outcome.body,
          related_date: outcome.related_date,
        })),
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['messages'] })
      void queryClient.invalidateQueries({ queryKey: ['message-stats'] })
    },
  })

  const reminders = useMemo(() => data?.reminders ?? [], [data])

  useEffect(() => {
    if (!open) return
    setStep('choose')
    setAudience('all')
    setChosen(new Set())
    setPreviewFor(null)
    setQueue([])
    setPosition(0)
    setOutcomes([])
    defaulted.current = false
  }, [open])

  // Default the selection to everyone who can actually be reached - once per
  // opening, and only once. Keying this on `chosen.size === 0` meant that
  // clearing the last checkbox re-selected the whole list, so the owner could
  // never deselect everybody.
  useEffect(() => {
    if (!open || defaulted.current || reminders.length === 0) return
    defaulted.current = true
    setChosen(new Set(reminders.filter((r) => r.can_send).map((r) => r.member_id)))
    setPreviewFor(reminders[0]?.member_id ?? null)
  }, [open, reminders])

  const selected = audience === 'all'
    ? reminders
    : reminders.filter((r) => chosen.has(r.member_id))
  const sendable = selected.filter((r) => r.can_send)
  const blocked = selected.filter((r) => !r.can_send)
  const preview = reminders.find((r) => r.member_id === previewFor) ?? reminders[0]

  function toggle(memberId: number) {
    setChosen((current) => {
      const next = new Set(current)
      if (next.has(memberId)) next.delete(memberId)
      else next.add(memberId)
      return next
    })
  }

  function begin() {
    if (sendable.length === 0) {
      toast.error('None of the selected members has a number WhatsApp can reach.')
      return
    }
    // Members who cannot be reached are recorded now, so the history explains
    // why they were never contacted.
    setOutcomes(blocked.map((reminder) => ({
      member_id: reminder.member_id,
      member_name: reminder.full_name,
      phone: reminder.phone,
      status: 'failed' as const,
      detail: reminder.reason ?? 'No usable phone number.',
      body: reminder.message,
      related_date: reminder.end_date,
    })))
    setQueue(sendable)
    setPosition(0)
    setStep('sending')
  }

  async function sendCurrent() {
    const reminder = queue[position]
    if (!reminder) return
    // Runs inside the click, which is what keeps the pop-up blocker quiet.
    const outcome = await deepLinkProvider.send(reminder)
    const next = [...outcomes, outcome]
    setOutcomes(next)
    advance(next)
  }

  function skipCurrent() {
    const reminder = queue[position]
    if (!reminder) return
    const next: SendOutcome[] = [...outcomes, {
      member_id: reminder.member_id,
      member_name: reminder.full_name,
      phone: reminder.phone,
      status: 'prepared',
      detail: 'Skipped by the owner.',
      body: reminder.message,
      related_date: reminder.end_date,
    }]
    setOutcomes(next)
    advance(next)
  }

  function advance(collected: SendOutcome[]) {
    if (position + 1 >= queue.length) {
      logRun.mutate(collected)
      setStep('done')
    } else {
      setPosition((current) => current + 1)
    }
  }

  const summary = summarise(outcomes, deepLinkProvider.canDeliver)

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="lg"
      title="Send WhatsApp Renewal Reminders"
      description={
        step === 'choose'
          ? 'Send renewal reminders to members with upcoming or expired memberships.'
          : step === 'sending'
            ? `Opening WhatsApp for each member in turn — ${position + 1} of ${queue.length}.`
            : 'Here is what happened.'
      }
      footer={
        step === 'choose' ? (
          <>
            <Button variant="secondary" onClick={onClose} fullWidth className="sm:w-auto">
              Cancel
            </Button>
            <Button
              variant="success"
              onClick={begin}
              disabled={sendable.length === 0}
              icon={<Icon name="whatsapp" className="size-4" />}
              fullWidth
              className="sm:w-auto"
            >
              Send WhatsApp Messages ({sendable.length})
            </Button>
          </>
        ) : step === 'done' ? (
          <Button onClick={onClose} fullWidth className="sm:w-auto">Done</Button>
        ) : null
      }
    >
      {isLoading ? (
        <LoadingRows count={4} />
      ) : isError ? (
        <p className="py-6 text-center text-sm text-rose-600">{errorMessage(error)}</p>
      ) : reminders.length === 0 ? (
        <div className="py-10 text-center">
          <span className="mx-auto mb-4 flex size-14 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-600">
            <Icon name="check" className="size-7" strokeWidth={2} />
          </span>
          <p className="text-base font-semibold text-ink-900">
            No memberships need renewal right now
          </p>
          <p className="mt-1 text-sm text-ink-500">
            Nobody is expiring in the next 7 days, and nothing has recently lapsed.
          </p>
        </div>
      ) : step === 'choose' ? (
        <div className="space-y-5">
          {/* --- Who ------------------------------------------------------ */}
          <fieldset>
            <legend className="sr-only">Who should receive a reminder</legend>
            <div className="grid gap-2 sm:grid-cols-2">
              <AudienceOption
                checked={audience === 'all'}
                onChange={() => setAudience('all')}
                title="Send to all renewal members"
                detail={`${reminders.length} member${reminders.length === 1 ? '' : 's'} need renewing`}
              />
              <AudienceOption
                checked={audience === 'some'}
                onChange={() => setAudience('some')}
                title="Select specific members"
                detail={audience === 'some'
                  ? `${chosen.size} member${chosen.size === 1 ? '' : 's'} selected`
                  : 'Choose who to contact'}
              />
            </div>
          </fieldset>

          {/* --- The list ------------------------------------------------- */}
          <div className="overflow-hidden rounded-xl border border-ink-200">
            <ul className="max-h-60 divide-y divide-ink-100 overflow-y-auto">
              {reminders.map((reminder) => {
                const picked = audience === 'all' || chosen.has(reminder.member_id)
                return (
                  <li key={reminder.member_id}>
                    <label
                      className={`flex cursor-pointer items-center gap-3 px-3 py-2.5 transition-colors ${
                        previewFor === reminder.member_id ? 'bg-brand-50' : 'hover:bg-ink-50'
                      }`}
                      onMouseEnter={() => setPreviewFor(reminder.member_id)}
                    >
                      <input
                        type="checkbox"
                        checked={picked}
                        disabled={audience === 'all'}
                        onChange={() => toggle(reminder.member_id)}
                        aria-label={`Send a reminder to ${reminder.full_name}`}
                        className="size-4 shrink-0 rounded border-ink-300 text-brand-600 focus:ring-brand-500 disabled:opacity-50"
                      />
                      <Avatar
                        name={reminder.full_name}
                        hasPhoto={reminder.has_photo}
                        photoPath={`/members/${reminder.member_id}/photo`}
                        size="sm"
                      />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium text-ink-900">
                          {reminder.full_name}
                        </span>
                        <span className="block truncate text-xs text-ink-500">
                          {reminder.phone ? formatPhone(reminder.phone) : 'No number'}
                          {reminder.plan_name ? ` · ${reminder.plan_name}` : ''}
                        </span>
                      </span>
                      {reminder.can_send ? (
                        <Badge tone={reminder.days_remaining < 0 ? 'danger' : 'warning'}>
                          {describeDays(reminder.days_remaining)}
                        </Badge>
                      ) : (
                        <Badge tone="neutral">Cannot message</Badge>
                      )}
                    </label>
                  </li>
                )
              })}
            </ul>
          </div>

          {blocked.length > 0 && (
            <p className="flex items-start gap-2 rounded-lg bg-amber-50 px-3 py-2.5 text-sm text-amber-900">
              <Icon name="alert" className="mt-0.5 size-4 shrink-0" />
              <span>
                {blocked.length} selected member{blocked.length === 1 ? '' : 's'} cannot be
                messaged: {blocked[0].reason} Fix the number on their profile to include them.
              </span>
            </p>
          )}

          {/* --- Preview -------------------------------------------------- */}
          {preview && (
            <div>
              <p className="mb-2 text-sm font-medium text-ink-700">
                Message preview
                <span className="ml-1.5 font-normal text-ink-500">
                  — as {preview.full_name} will receive it
                </span>
              </p>
              <div className="rounded-xl bg-[#e6ddd4] p-3 dark:bg-ink-100">
                <div className="relative max-w-sm rounded-lg rounded-tl-none bg-[#dcf8c6] px-3 py-2 shadow-sm dark:bg-emerald-950/40">
                  <p className="text-sm whitespace-pre-wrap text-ink-900 dark:text-ink-800">
                    {preview.message}
                  </p>
                  <p className="mt-1 text-right text-[10px] text-ink-500">
                    {formatDate(preview.end_date)}
                    {Number(preview.balance) > 0
                      ? ` · ${formatMoney(preview.balance)} due`
                      : ''}
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>
      ) : step === 'sending' ? (
        <SendingStep
          reminder={queue[position]}
          position={position}
          total={queue.length}
          onSend={sendCurrent}
          onSkip={skipCurrent}
        />
      ) : (
        <DoneStep summary={summary} outcomes={outcomes} />
      )}
    </Modal>
  )
}

function AudienceOption({
  checked, onChange, title, detail,
}: {
  checked: boolean
  onChange: () => void
  title: string
  detail: string
}) {
  return (
    <label
      className={`pressable flex cursor-pointer items-start gap-3 rounded-xl border p-3 ${
        checked
          ? 'border-brand-500 bg-brand-50 ring-1 ring-brand-500'
          : 'border-ink-200 hover:border-ink-300'
      }`}
    >
      <input
        type="radio"
        name="audience"
        checked={checked}
        onChange={onChange}
        className="mt-0.5 size-4 shrink-0 border-ink-300 text-brand-600 focus:ring-brand-500"
      />
      <span className="min-w-0">
        <span className={`block text-sm font-medium ${checked ? 'text-brand-700' : 'text-ink-900'}`}>
          {title}
        </span>
        <span className="mt-0.5 block text-xs text-ink-500">{detail}</span>
      </span>
    </label>
  )
}

function SendingStep({
  reminder, position, total, onSend, onSkip,
}: {
  reminder: PreparedReminder | undefined
  position: number
  total: number
  onSend: () => void
  onSkip: () => void
}) {
  if (!reminder) return null
  const percent = Math.round((position / total) * 100)

  return (
    <div className="space-y-5">
      <div>
        <div className="mb-1.5 flex items-center justify-between text-xs text-ink-500">
          <span>Member {position + 1} of {total}</span>
          <span className="tnum">{percent}% done</span>
        </div>
        <div className="h-2 overflow-hidden rounded-full bg-ink-200">
          <div
            className="h-full rounded-full bg-emerald-500 transition-[width] duration-300 ease-out"
            style={{ width: `${percent}%` }}
          />
        </div>
      </div>

      <div className="flex items-center gap-3 rounded-xl border border-ink-200 p-3">
        <Avatar
          name={reminder.full_name}
          hasPhoto={reminder.has_photo}
          photoPath={`/members/${reminder.member_id}/photo`}
        />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-ink-900">{reminder.full_name}</p>
          <p className="truncate text-xs text-ink-500">
            {reminder.phone ? formatPhone(reminder.phone) : 'No number'} ·{' '}
            {describeDays(reminder.days_remaining)}
          </p>
        </div>
      </div>

      <div className="rounded-xl bg-[#e6ddd4] p-3 dark:bg-ink-100">
        <div className="max-w-sm rounded-lg rounded-tl-none bg-[#dcf8c6] px-3 py-2 shadow-sm dark:bg-emerald-950/40">
          <p className="text-sm whitespace-pre-wrap text-ink-900 dark:text-ink-800">
            {reminder.message}
          </p>
        </div>
      </div>

      <div className="flex flex-col gap-2 sm:flex-row">
        <Button
          variant="success"
          onClick={onSend}
          icon={<Icon name="whatsapp" className="size-4" />}
          fullWidth
        >
          Open WhatsApp for {reminder.full_name.split(' ')[0]}
        </Button>
        <Button variant="secondary" onClick={onSkip} className="sm:w-auto" fullWidth>
          Skip
        </Button>
      </div>

      <p className="text-xs text-ink-500">
        WhatsApp opens in a new tab with the message ready. Press send there, then come
        back here for the next member.
      </p>
    </div>
  )
}

function DoneStep({
  summary, outcomes,
}: {
  summary: { ok: number; failed: number; message: string }
  outcomes: SendOutcome[]
}) {
  const problems = outcomes.filter((o) => o.status === 'failed')
  const skipped = outcomes.filter((o) => o.status === 'prepared')

  return (
    <div className="space-y-4">
      <div className="flex items-start gap-3 rounded-xl bg-emerald-50 p-4">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-emerald-600 text-white">
          <Icon name="check" className="size-5" strokeWidth={2.4} />
        </span>
        <div>
          <p className="font-semibold text-emerald-900">{summary.message}</p>
          <p className="mt-0.5 text-sm text-emerald-800">
            Recorded in Messages. “Opened” means WhatsApp was given the message —
            this app cannot confirm you pressed send.
          </p>
        </div>
      </div>

      {problems.length > 0 && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-3">
          <p className="mb-2 flex items-center gap-2 text-sm font-medium text-amber-900">
            <Icon name="alert" className="size-4" />
            Could not be contacted
          </p>
          <ul className="space-y-1.5">
            {problems.map((problem) => (
              <li key={problem.member_id} className="text-sm text-amber-900">
                <span className="font-medium">{problem.member_name}</span>
                <span className="text-amber-800"> — {problem.detail}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {skipped.length > 0 && (
        <p className="text-sm text-ink-500">
          {skipped.length} member{skipped.length === 1 ? '' : 's'} skipped.
        </p>
      )}
    </div>
  )
}
