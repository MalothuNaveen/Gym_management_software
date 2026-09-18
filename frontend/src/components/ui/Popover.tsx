/**
 * A small anchored panel: the notification list, the profile menu, the theme
 * picker. Closes on outside click, on Escape, and when the route changes.
 */
import { useEffect, useRef, useState, type ReactNode } from 'react'

import { usePresence } from '@/lib/motion'

export function Popover({
  trigger, children, align = 'right', label, width = 'w-72',
}: {
  /** Rendered as the button; receives whether the panel is open. */
  trigger: (open: boolean) => ReactNode
  children: (close: () => void) => ReactNode
  align?: 'left' | 'right'
  label: string
  width?: string
}) {
  const [open, setOpen] = useState(false)
  const { mounted, state } = usePresence(open, 170)
  const rootRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return

    // `mousedown` rather than `click`: closing on the press feels immediate,
    // and it fires before a click handler inside the panel can be lost.
    const onPointerDown = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false)
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpen(false)
        // Send focus back to the button, or the keyboard user is stranded.
        rootRef.current?.querySelector('button')?.focus()
      }
    }
    document.addEventListener('mousedown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('mousedown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open])

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={label}
        onClick={() => setOpen((current) => !current)}
      >
        {trigger(open)}
      </button>

      {mounted && (
        <div
          role="menu"
          aria-label={label}
          data-state={state}
          className={`popover absolute top-full z-50 mt-2 ${width} max-w-[calc(100vw-1.5rem)] overflow-hidden rounded-xl border border-ink-200 bg-surface shadow-e3 ${
            align === 'right' ? 'right-0' : 'left-0'
          }`}
        >
          {children(() => setOpen(false))}
        </div>
      )}
    </div>
  )
}
