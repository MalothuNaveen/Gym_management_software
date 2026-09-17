/**
 * Receipt preview, download and sharing.
 *
 * Sharing works with no paid messaging API. On a phone the native share sheet
 * carries the actual PDF into WhatsApp, Gmail or anything else installed. On a
 * desktop the PDF downloads and we open WhatsApp Web / the mail client with the
 * message pre-written, ready for the owner to attach the file they just saved.
 */
import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'

import { Button } from '@/components/ui/Button'
import { DetailRow, ErrorState } from '@/components/ui/Data'
import { Modal } from '@/components/ui/Overlay'
import { api, errorMessage } from '@/lib/api'
import { useToast } from '@/lib/toast'
import type { Receipt } from '@/lib/types'
import { Icon } from '@/components/ui/Icon'

interface ReceiptDialogProps {
  receiptId: number | null
  open: boolean
  onClose: () => void
  /** Used to pre-fill the WhatsApp message. */
  memberPhone?: string | null
}

export function ReceiptDialog({ receiptId, open, onClose, memberPhone }: ReceiptDialogProps) {
  const toast = useToast()
  const [busy, setBusy] = useState<'download' | 'share' | 'print' | null>(null)

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['receipt', receiptId],
    queryFn: () => api.get<Receipt>(`/receipts/${receiptId}`),
    enabled: open && receiptId !== null,
  })

  async function getPdf(): Promise<Blob> {
    return api.blob(`/receipts/${receiptId}/pdf`)
  }

  function fileName(): string {
    return `Receipt-${data?.receipt_no ?? receiptId}.pdf`
  }

  async function handleDownload() {
    setBusy('download')
    try {
      const blob = await getPdf()
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = fileName()
      document.body.appendChild(link)
      link.click()
      link.remove()
      // Give the browser a moment to start the download before revoking.
      setTimeout(() => URL.revokeObjectURL(url), 10000)
      toast.success('Receipt downloaded.')
    } catch (caught) {
      toast.error(errorMessage(caught))
    } finally {
      setBusy(null)
    }
  }

  async function handleShare() {
    setBusy('share')
    try {
      const blob = await getPdf()
      const file = new File([blob], fileName(), { type: 'application/pdf' })

      // The native share sheet is the whole feature on mobile.
      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({
          files: [file],
          title: `Receipt ${data?.receipt_no ?? ''}`,
          text: shareText(data),
        })
        return
      }

      // Desktop: save the file, then hand the owner a pre-written message.
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = fileName()
      link.click()
      setTimeout(() => URL.revokeObjectURL(url), 10000)
      toast.info('Receipt saved. Attach it to your message.')
    } catch (caught) {
      // A cancelled share sheet is not an error worth shouting about.
      if ((caught as Error)?.name !== 'AbortError') toast.error(errorMessage(caught))
    } finally {
      setBusy(null)
    }
  }

  function openWhatsApp() {
    const digits = (memberPhone ?? '').replace(/\D/g, '')
    const target = digits.length === 10 ? `91${digits}` : digits
    const message = encodeURIComponent(shareText(data))
    window.open(
      target ? `https://wa.me/${target}?text=${message}` : `https://wa.me/?text=${message}`,
      '_blank',
      'noopener',
    )
  }

  function openEmail() {
    const subject = encodeURIComponent(`Payment Receipt ${data?.receipt_no ?? ''}`)
    window.location.href = `mailto:?subject=${subject}&body=${encodeURIComponent(shareText(data))}`
  }

  async function handlePrint() {
    setBusy('print')
    try {
      const blob = await getPdf()
      const url = URL.createObjectURL(blob)
      const win = window.open(url, '_blank')
      if (!win) {
        toast.info('Allow pop-ups to print, or download the receipt instead.')
      }
      setTimeout(() => URL.revokeObjectURL(url), 60000)
    } catch (caught) {
      toast.error(errorMessage(caught))
    } finally {
      setBusy(null)
    }
  }

  const snapshot = data?.snapshot

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Payment Receipt"
      description={data?.receipt_no}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} fullWidth className="sm:w-auto">
            Close
          </Button>
          <Button
            variant="secondary"
            onClick={() => void handleDownload()}
            loading={busy === 'download'}
            loadingText="Preparing…"
            disabled={!data}
            fullWidth
            className="sm:w-auto"
            icon={<Icon name="download" className="size-4" strokeWidth={2} />}
          >
            Download PDF
          </Button>
          <Button
            onClick={() => void handleShare()}
            loading={busy === 'share'}
            loadingText="Preparing…"
            disabled={!data}
            fullWidth
            className="sm:w-auto"
            icon={<Icon name="share" className="size-4" strokeWidth={2} />}
          >
            Share Receipt
          </Button>
        </>
      }
    >
      {isError ? (
        <ErrorState message={errorMessage(error)} onRetry={() => void refetch()} />
      ) : isLoading || !snapshot ? (
        <div className="space-y-3 py-4">
          {[0, 1, 2, 3, 4].map((index) => (
            <div key={index} className="skeleton h-5 w-full" />
          ))}
        </div>
      ) : (
        <>
          <div className="rounded-xl border border-ink-200 bg-ink-50 p-4">
            <div className="text-center">
              <p className="text-sm font-bold tracking-wide text-ink-900 uppercase">
                {snapshot.gym.name}
              </p>
              {snapshot.gym.address && (
                <p className="mt-0.5 text-xs text-ink-500">{snapshot.gym.address}</p>
              )}
              {snapshot.gym.phone && (
                <p className="text-xs text-ink-500">{snapshot.gym.phone}</p>
              )}
            </div>

            <div className="my-3 border-t border-ink-200" />

            <dl className="divide-y divide-ink-200/70">
              <DetailRow label="Receipt No." value={snapshot.receipt_no} />
              <DetailRow label="Date" value={snapshot.issued_on} />
              <DetailRow label="Member" value={snapshot.member.name} />
              <DetailRow label="Member ID" value={snapshot.member.code} />
              {snapshot.membership.plan !== '—' && snapshot.membership.plan !== '-' && (
                <>
                  <DetailRow label="Plan" value={snapshot.membership.plan} />
                  <DetailRow label="Start" value={snapshot.membership.start} />
                  <DetailRow label="Expiry" value={snapshot.membership.end} />
                </>
              )}
              <DetailRow label="Membership Fee" value={snapshot.amounts.fee_text} />
              {snapshot.amounts.discount_text !== '₹0' && (
                <DetailRow
                  label="Discount"
                  value={`− ${snapshot.amounts.discount_text}`}
                />
              )}
              <DetailRow
                label="Paid"
                value={
                  <span className="text-base font-semibold">{snapshot.amounts.paid_text}</span>
                }
              />
              <DetailRow
                label="Balance"
                value={
                  <span
                    className={
                      snapshot.amounts.balance_text !== '₹0' ? 'text-amber-700' : undefined
                    }
                  >
                    {snapshot.amounts.balance_text}
                  </span>
                }
              />
              <DetailRow label="Payment Method" value={snapshot.payment.method} />
              {snapshot.payment.notes && (
                <DetailRow label="Note" value={snapshot.payment.notes} />
              )}
            </dl>

            <p className="mt-3 border-t border-ink-200 pt-3 text-center text-xs text-ink-600">
              {snapshot.footer}
            </p>
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            <Button
              size="sm"
              variant="secondary"
              onClick={openWhatsApp}
              icon={<Icon name="whatsapp" className="size-4" strokeWidth={2} />}
            >
              WhatsApp
            </Button>
            <Button
              size="sm"
              variant="secondary"
              onClick={openEmail}
              icon={<Icon name="mail" className="size-4" strokeWidth={2} />}
            >
              Email
            </Button>
            <Button
              size="sm"
              variant="secondary"
              onClick={() => void handlePrint()}
              loading={busy === 'print'}
              loadingText="Opening…"
              icon={<Icon name="print" className="size-4" strokeWidth={2} />}
            >
              Print
            </Button>
          </div>
          <p className="mt-2 text-xs text-ink-500">
            On a phone, “Share Receipt” attaches the PDF directly to WhatsApp or email.
          </p>
        </>
      )}
    </Modal>
  )
}

function shareText(receipt: Receipt | undefined): string {
  if (!receipt) return 'Your payment receipt.'
  const { snapshot } = receipt
  const lines = [
    `${snapshot.gym.name}`,
    `Payment receipt ${snapshot.receipt_no}`,
    `${snapshot.member.name} (${snapshot.member.code})`,
    `Paid: ${snapshot.amounts.paid_text} on ${snapshot.issued_on}`,
  ]
  if (snapshot.membership.end !== '-' && snapshot.membership.end !== '—') {
    lines.push(`Membership valid till ${snapshot.membership.end}`)
  }
  if (snapshot.amounts.balance_text !== '₹0') {
    lines.push(`Balance due: ${snapshot.amounts.balance_text}`)
  }
  lines.push('', snapshot.footer)
  return lines.join('\n')
}
