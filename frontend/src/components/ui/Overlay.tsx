/**
 * Modal, drawer and confirmation dialog.
 *
 * On phones a modal rises as a sheet from the bottom edge, which is where the
 * thumb already is; on larger screens it settles in the centre. Both animate on
 * the way out as well as in - a panel that vanishes on the same frame it was
 * dismissed reads as a glitch rather than a decision.
 */
import { useCallback, useEffect, useRef, type ReactNode } from 'react'
import { createPortal } from 'react-dom'

import { usePresence } from '@/lib/motion'
import { Button } from './Button'
import { Icon } from './Icon'

function useDismissBehaviour(open: boolean, onClose: () => void) {
  const panelRef = useRef<HTMLDivElement>(null)

  // Callers pass an inline arrow, so `onClose` is a different function on every
  // render. Holding it in a ref keeps it out of the effect's dependencies -
  // otherwise the effect below tore down and re-ran on every keystroke, and its
  // focus timer pulled the cursor out of whatever field was being typed into.
  const closeRef = useRef(onClose)
  useEffect(() => {
    closeRef.current = onClose
  })

  useEffect(() => {
    if (!open) return

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') closeRef.current()
      if (event.key !== 'Tab') return

      // Keep keyboard focus inside the dialog while it is open.
      const focusable = panelRef.current?.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
      )
      if (!focusable?.length) return
      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }

    document.addEventListener('keydown', onKeyDown)
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    // Move focus into the dialog so screen readers and keyboards follow along.
    const timer = window.setTimeout(() => {
      const panel = panelRef.current
      if (!panel) return
      // Something in here already has the cursor - a field with autoFocus, or
      // the owner part-way through typing. Never take it away from them.
      if (panel.contains(document.activeElement)) return
      // A comma-separated querySelector returns the first match in *document*
      // order, not the first selector that matches. The close button sits above
      // the body, so asking for "input, ..., button" always landed on it. Look
      // for a real field first, and fall back to a button only if there is none.
      const field = panel.querySelector<HTMLElement>(
        'input:not([type="hidden"]):not([disabled]), select:not([disabled]), textarea:not([disabled])',
      )
      ;(field ?? panel.querySelector<HTMLElement>('button:not([disabled])'))?.focus()
    }, 50)

    return () => {
      document.removeEventListener('keydown', onKeyDown)
      document.body.style.overflow = previousOverflow
      window.clearTimeout(timer)
    }
  }, [open])

  return panelRef
}

/** The dismiss control shared by every overlay. */
function CloseButton({ onClose, label = 'Close' }: { onClose: () => void; label?: string }) {
  return (
    <button
      type="button"
      onClick={onClose}
      aria-label={label}
      className="pressable -mt-1 -mr-1 flex size-11 items-center justify-center rounded-lg text-ink-400 hover:bg-ink-100 hover:text-ink-900 sm:size-9"
    >
      <Icon name="close" className="size-4.5" strokeWidth={2} />
    </button>
  )
}

interface ModalProps {
  open: boolean
  onClose: () => void
  title: string
  description?: string
  children: ReactNode
  footer?: ReactNode
  size?: 'sm' | 'md' | 'lg'
}

export function Modal({
  open, onClose, title, description, children, footer, size = 'md',
}: ModalProps) {
  const panelRef = useDismissBehaviour(open, onClose)
  const { mounted, state } = usePresence(open)
  if (!mounted) return null

  const WIDTHS = { sm: 'sm:max-w-md', md: 'sm:max-w-lg', lg: 'sm:max-w-2xl' }

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center no-print">
      <div
        className="overlay-scrim absolute inset-0 bg-[var(--scrim)] backdrop-blur-[2px]"
        data-state={state}
        onClick={onClose}
        aria-hidden
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        data-state={state}
        className={`overlay-sheet relative flex max-h-[92vh] w-full min-w-0 max-w-full flex-col rounded-t-2xl bg-surface shadow-e4 sm:rounded-2xl ${WIDTHS[size]}`}
      >
        {/* Grab handle - a familiar signal that the sheet can be dismissed. */}
        <div className="flex justify-center pt-2.5 sm:hidden" aria-hidden>
          <div className="h-1 w-10 rounded-full bg-ink-300" />
        </div>

        <div className="flex items-start justify-between gap-3 px-5 pt-4 pb-3">
          <div className="min-w-0">
            <h2 className="text-lg font-semibold tracking-tight text-ink-900">{title}</h2>
            {description && <p className="mt-0.5 text-sm text-ink-500">{description}</p>}
          </div>
          <CloseButton onClose={onClose} />
        </div>

        <div className="flex-1 overflow-y-auto px-5 pb-5">{children}</div>

        {footer && (
          <div
            className="flex flex-col-reverse gap-2 border-t border-ink-200 bg-ink-50/60 px-5 py-3 sm:flex-row sm:justify-end sm:rounded-b-2xl"
            style={{ paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom))' }}
          >
            {footer}
          </div>
        )}
      </div>
    </div>,
    document.body,
  )
}

// --- Drawer ---------------------------------------------------------------

export function Drawer({
  open, onClose, title, children, side = 'left',
}: {
  open: boolean
  onClose: () => void
  title: string
  children: ReactNode
  side?: 'left' | 'right'
}) {
  const panelRef = useDismissBehaviour(open, onClose)
  const { mounted, state } = usePresence(open)
  if (!mounted) return null

  return createPortal(
    <div className="fixed inset-0 z-50 no-print">
      <div
        className="overlay-scrim absolute inset-0 bg-[var(--scrim)]"
        data-state={state}
        onClick={onClose}
        aria-hidden
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        data-state={state}
        data-side={side}
        className={`overlay-drawer absolute inset-y-0 flex w-[82%] max-w-xs flex-col bg-surface shadow-e4 ${
          side === 'left' ? 'left-0' : 'right-0'
        }`}
      >
        <div className="flex items-center justify-between border-b border-ink-200 px-4 py-3">
          <h2 className="text-base font-semibold tracking-tight text-ink-900">{title}</h2>
          <CloseButton onClose={onClose} label="Close menu" />
        </div>
        <div className="flex-1 overflow-y-auto">{children}</div>
      </div>
    </div>,
    document.body,
  )
}

// --- Confirmation ---------------------------------------------------------

export function ConfirmDialog({
  open, onCancel, onConfirm, title, message, confirmLabel = 'Confirm',
  cancelLabel = 'Cancel', tone = 'danger', loading,
}: {
  open: boolean
  onCancel: () => void
  onConfirm: () => void
  title: string
  message: string
  confirmLabel?: string
  cancelLabel?: string
  tone?: 'danger' | 'primary'
  loading?: boolean
}) {
  const handleClose = useCallback(() => {
    if (!loading) onCancel()
  }, [loading, onCancel])

  return (
    <Modal
      open={open}
      onClose={handleClose}
      title={title}
      size="sm"
      footer={
        <>
          <Button variant="secondary" onClick={handleClose} disabled={loading} fullWidth
            className="sm:w-auto">
            {cancelLabel}
          </Button>
          <Button
            variant={tone}
            onClick={onConfirm}
            loading={loading}
            loadingText="Working…"
            fullWidth
            className="sm:w-auto"
          >
            {confirmLabel}
          </Button>
        </>
      }
    >
      <div className="flex gap-3">
        <span
          className={`flex size-10 shrink-0 items-center justify-center rounded-full ${
            tone === 'danger' ? 'bg-rose-50 text-rose-600' : 'bg-brand-50 text-brand-600'
          }`}
        >
          <Icon name="alert" className="size-5" />
        </span>
        <p className="pt-2 text-sm text-ink-600">{message}</p>
      </div>
    </Modal>
  )
}
