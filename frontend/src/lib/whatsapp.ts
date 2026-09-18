/**
 * Everything the app knows about sending a WhatsApp message.
 *
 * Kept in one module so no screen builds a wa.me URL itself, and so connecting
 * a real WhatsApp Business API later is a change here and nowhere else.
 *
 * What this can and cannot do, plainly:
 *
 *   This gym has no WhatsApp Business API. The only thing a browser can do is
 *   open WhatsApp with a message already typed in. The owner still has to press
 *   send, and the application never finds out whether they did. So nothing here
 *   reports a message as "sent" - the strongest claim it makes is "opened".
 *
 * Browsers also block a burst of window.open() calls that did not each come
 * from a click, which is why bulk sending is a queue the owner steps through
 * rather than a single button that silently opens twenty tabs.
 */

export type DeliveryStatus = 'prepared' | 'opened' | 'sent' | 'failed'

export interface Recipient {
  member_id: number
  full_name: string
  phone: string | null
  /** Full international digits, ready to dial. Null when unusable. */
  dial: string | null
  can_send: boolean
  reason: string | null
  message: string
  end_date?: string
}

export interface SendOutcome {
  member_id: number
  member_name: string
  phone: string | null
  status: DeliveryStatus
  detail: string | null
  body: string
  related_date?: string | null
}

/**
 * A place for a real provider to plug in.
 *
 * `deepLink` is what ships today. A `WhatsAppProvider` implementation that
 * talks to a Business API can be dropped in without any screen changing,
 * because the screens only ever call `send`.
 */
export interface WhatsAppProvider {
  readonly id: string
  /** True when the provider can deliver without the owner pressing send. */
  readonly canDeliver: boolean
  send(recipient: Recipient): Promise<SendOutcome>
}

export function buildDeepLink(dial: string, message: string): string {
  return `https://wa.me/${dial}?text=${encodeURIComponent(message)}`
}

/**
 * The provider in use today: hands the message to WhatsApp and stops there.
 *
 * Must be called straight from a click. Anything else and the popup blocker
 * swallows the window, which is reported as a failure rather than hidden.
 */
export const deepLinkProvider: WhatsAppProvider = {
  id: 'deep-link',
  canDeliver: false,

  async send(recipient: Recipient): Promise<SendOutcome> {
    const base = {
      member_id: recipient.member_id,
      member_name: recipient.full_name,
      phone: recipient.phone,
      body: recipient.message,
      related_date: recipient.end_date ?? null,
    }

    if (!recipient.can_send || !recipient.dial) {
      return {
        ...base,
        status: 'failed',
        detail: recipient.reason ?? 'No usable phone number.',
      }
    }

    const opened = window.open(
      buildDeepLink(recipient.dial, recipient.message),
      '_blank',
      'noopener,noreferrer',
    )

    if (!opened) {
      return {
        ...base,
        status: 'failed',
        detail: 'The browser blocked the WhatsApp window. Allow pop-ups for this site.',
      }
    }

    return {
      ...base,
      // "opened", never "sent": the owner still has to press send in WhatsApp,
      // and this application has no way of knowing whether they did.
      status: 'opened',
      detail: null,
    }
  },
}

/** Summarises a run in words that match what actually happened. */
export function summarise(outcomes: SendOutcome[], canDeliver: boolean): {
  ok: number
  failed: number
  message: string
} {
  const ok = outcomes.filter((o) => o.status === 'opened' || o.status === 'sent').length
  const failed = outcomes.filter((o) => o.status === 'failed').length
  const verb = canDeliver ? 'sent' : 'opened in WhatsApp'

  if (ok && failed) {
    return { ok, failed, message: `${ok} ${verb}, ${failed} could not be contacted.` }
  }
  if (ok) {
    return {
      ok,
      failed,
      message: `${ok} reminder${ok === 1 ? '' : 's'} ${verb}.`,
    }
  }
  return {
    ok,
    failed,
    message: failed
      ? `${failed} member${failed === 1 ? '' : 's'} could not be contacted.`
      : 'Nothing to send.',
  }
}
