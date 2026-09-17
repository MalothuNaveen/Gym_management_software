/** Brief confirmations and error notices. */
import {
  createContext, useCallback, useContext, useEffect, useMemo, useState,
  type ReactNode,
} from 'react'

import { Icon, type IconName } from '@/components/ui/Icon'
import { usePresence } from '@/lib/motion'

type ToastKind = 'success' | 'error' | 'info'

interface Toast {
  id: number
  kind: ToastKind
  message: string
}

interface ToastApi {
  success: (message: string) => void
  error: (message: string) => void
  info: (message: string) => void
}

const ToastContext = createContext<ToastApi | null>(null)
let nextId = 1

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])

  const dismiss = useCallback((id: number) => {
    setToasts((current) => current.filter((t) => t.id !== id))
  }, [])

  const push = useCallback((kind: ToastKind, message: string) => {
    const id = nextId++
    setToasts((current) => [...current.slice(-2), { id, kind, message }])
  }, [])

  const api = useMemo<ToastApi>(
    () => ({
      success: (message) => push('success', message),
      error: (message) => push('error', message),
      info: (message) => push('info', message),
    }),
    [push],
  )

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div
        className="pointer-events-none fixed inset-x-0 bottom-20 z-100 flex flex-col items-center gap-2 px-4 sm:bottom-6 sm:right-6 sm:left-auto sm:items-end no-print"
        role="status"
        aria-live="polite"
      >
        {toasts.map((toast) => (
          <ToastRow key={toast.id} toast={toast} onDismiss={dismiss} />
        ))}
      </div>
    </ToastContext.Provider>
  )
}

const STYLES: Record<ToastKind, string> = {
  success: 'bg-emerald-600 text-white',
  error: 'bg-rose-600 text-white',
  info: 'bg-ink-900 text-white',
}

const ICONS: Record<ToastKind, IconName> = {
  success: 'check',
  error: 'alert',
  info: 'inbox',
}

function ToastRow({ toast, onDismiss }: { toast: Toast; onDismiss: (id: number) => void }) {
  // Dismissing sets `leaving`, which plays the exit before the row is actually
  // removed. Without it a confirmation blinks out of existence mid-read.
  const [leaving, setLeaving] = useState(false)
  const { state } = usePresence(!leaving)

  useEffect(() => {
    // Errors stay longer - the owner may need to read them twice.
    const delay = toast.kind === 'error' ? 6000 : 3500
    const timer = setTimeout(() => setLeaving(true), delay)
    return () => clearTimeout(timer)
  }, [toast])

  useEffect(() => {
    if (!leaving) return
    const timer = setTimeout(() => onDismiss(toast.id), 240)
    return () => clearTimeout(timer)
  }, [leaving, onDismiss, toast.id])

  return (
    <div
      data-state={state}
      className={`toast-item pointer-events-auto flex w-full max-w-sm items-start gap-3 rounded-xl px-4 py-3 shadow-e3 ${STYLES[toast.kind]}`}
    >
      <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-white/20">
        <Icon name={ICONS[toast.kind]} className="size-3.5" strokeWidth={2.5} />
      </span>
      <p className="flex-1 text-sm leading-snug">{toast.message}</p>
      <button
        type="button"
        onClick={() => setLeaving(true)}
        className="pressable -my-1.5 -mr-1.5 shrink-0 rounded p-2 text-white/70 hover:text-white"
        aria-label="Dismiss"
      >
        <Icon name="close" className="size-3.5" strokeWidth={2.5} />
      </button>
    </div>
  )
}

export function useToast(): ToastApi {
  const context = useContext(ToastContext)
  if (!context) throw new Error('useToast must be used inside ToastProvider')
  return context
}
