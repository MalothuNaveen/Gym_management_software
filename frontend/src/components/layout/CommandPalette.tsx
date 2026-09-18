/**
 * Global search, opened with Ctrl+K.
 *
 * Results come from one backend call that already knows which route each hit
 * belongs to, so this component never has to guess where something lives. It is
 * a search box, not a command runner: everything it offers is somewhere the
 * owner can already get to, which keeps it honest and keyboard-only usable.
 */
import { useQuery } from '@tanstack/react-query'
import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate } from 'react-router-dom'

import { Badge } from '@/components/ui/Data'
import { Icon, type IconName } from '@/components/ui/Icon'
import { useDebounced } from '@/components/ui/Search'
import { api } from '@/lib/api'
import { usePresence } from '@/lib/motion'

interface SearchHit {
  id: number
  title: string
  subtitle: string | null
  to: string
  badge: string | null
}

interface SearchGroup {
  label: string
  hits: SearchHit[]
}

interface SearchResponse {
  query: string
  total: number
  groups: SearchGroup[]
}

// Shown before anything is typed, so the box is never an empty stare.
const JUMPS: { label: string; to: string; icon: IconName }[] = [
  { label: 'Add a member', to: '/members/new', icon: 'plus' },
  { label: 'Record a payment', to: '/payments?record=1', icon: 'payments' },
  { label: 'Mark attendance', to: '/attendance', icon: 'attendance' },
  { label: 'Members needing renewal', to: '/members?status=expiring_soon', icon: 'renew' },
  { label: 'Reports', to: '/reports', icon: 'reports' },
]

const GROUP_ICONS: Record<string, IconName> = {
  Members: 'members',
  Payments: 'payments',
  'Membership Plans': 'plans',
  Staff: 'staff',
}

export function CommandPalette({
  open, onClose,
}: {
  open: boolean
  onClose: () => void
}) {
  const navigate = useNavigate()
  const [query, setQuery] = useState('')
  const [cursor, setCursor] = useState(0)
  const debounced = useDebounced(query, 200)
  const { mounted, state } = usePresence(open)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)

  const { data, isFetching } = useQuery({
    queryKey: ['search', debounced],
    queryFn: () => api.get<SearchResponse>('/search', { q: debounced }),
    enabled: open && debounced.trim().length >= 2,
    staleTime: 15_000,
  })

  // One flat list of everything selectable, so the arrow keys can walk it
  // without caring which group a row came from.
  const rows = useMemo(() => {
    if (debounced.trim().length < 2) {
      return JUMPS.map((jump) => ({
        key: jump.to, title: jump.label, subtitle: null as string | null,
        to: jump.to, badge: null as string | null, icon: jump.icon,
        group: 'Jump to',
      }))
    }
    return (data?.groups ?? []).flatMap((group) =>
      group.hits.map((hit) => ({
        key: `${group.label}-${hit.id}`,
        title: hit.title,
        subtitle: hit.subtitle,
        to: hit.to,
        badge: hit.badge,
        icon: GROUP_ICONS[group.label] ?? 'search',
        group: group.label,
      })),
    )
  }, [data, debounced])

  useEffect(() => {
    if (open) {
      setQuery('')
      setCursor(0)
    }
  }, [open])

  useEffect(() => {
    setCursor(0)
  }, [debounced])

  // Autofocus has to wait for the element to exist and the entrance to start.
  useEffect(() => {
    if (!mounted) return
    const timer = window.setTimeout(() => inputRef.current?.focus(), 40)
    return () => window.clearTimeout(timer)
  }, [mounted])

  // Keep the highlighted row on screen when arrowing past the fold.
  useEffect(() => {
    listRef.current
      ?.querySelector('[data-active="true"]')
      ?.scrollIntoView({ block: 'nearest' })
  }, [cursor, rows.length])

  function choose(to: string) {
    onClose()
    navigate(to)
  }

  function onKeyDown(event: React.KeyboardEvent) {
    if (event.key === 'Escape') {
      event.preventDefault()
      onClose()
      return
    }
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      setCursor((current) => (rows.length ? (current + 1) % rows.length : 0))
    } else if (event.key === 'ArrowUp') {
      event.preventDefault()
      setCursor((current) => (rows.length ? (current - 1 + rows.length) % rows.length : 0))
    } else if (event.key === 'Enter') {
      event.preventDefault()
      const row = rows[cursor]
      if (row) choose(row.to)
    }
  }

  if (!mounted) return null

  const searching = debounced.trim().length >= 2
  let lastGroup = ''

  return createPortal(
    <div className="fixed inset-0 z-100 flex items-start justify-center px-4 pt-[12vh] no-print">
      <div
        className="overlay-scrim absolute inset-0 bg-[var(--scrim)] backdrop-blur-[3px]"
        data-state={state}
        onClick={onClose}
        aria-hidden
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Search"
        data-state={state}
        onKeyDown={onKeyDown}
        className="overlay-sheet relative w-full max-w-xl overflow-hidden rounded-2xl border border-ink-200 bg-surface shadow-e4"
      >
        <div className="flex items-center gap-3 border-b border-ink-200 px-4">
          <Icon name="search" className="size-5 text-ink-400" />
          <input
            ref={inputRef}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search members, payments, plans, staff…"
            aria-label="Search members, payments, plans and staff"
            role="combobox"
            aria-expanded
            aria-controls="command-results"
            className="h-14 flex-1 border-0 bg-transparent text-ink-900 placeholder:text-ink-400 focus:outline-none"
          />
          {isFetching && <Icon name="renew" className="size-4 animate-spin text-ink-400" />}
          <kbd className="hidden rounded border border-ink-200 px-1.5 py-0.5 text-[10px] font-medium text-ink-500 sm:block">
            Esc
          </kbd>
        </div>

        <div
          id="command-results"
          ref={listRef}
          role="listbox"
          className="max-h-[52vh] overflow-y-auto p-2"
        >
          {searching && rows.length === 0 && !isFetching ? (
            <div className="px-4 py-10 text-center">
              <p className="text-sm font-medium text-ink-900">
                Nothing matched “{debounced}”.
              </p>
              <p className="mt-1 text-sm text-ink-500">
                Try a member name, a phone number or a receipt number.
              </p>
            </div>
          ) : (
            rows.map((row, index) => {
              const newGroup = row.group !== lastGroup
              lastGroup = row.group
              const active = index === cursor
              return (
                <div key={row.key}>
                  {newGroup && (
                    <p className="px-3 pt-3 pb-1 text-[11px] font-semibold tracking-wide text-ink-400 uppercase">
                      {row.group}
                    </p>
                  )}
                  <button
                    type="button"
                    role="option"
                    aria-selected={active}
                    data-active={active}
                    onMouseEnter={() => setCursor(index)}
                    onClick={() => choose(row.to)}
                    className={`flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left transition-colors ${
                      active ? 'bg-brand-50 text-brand-700' : 'text-ink-800 hover:bg-ink-100'
                    }`}
                  >
                    <span
                      className={`flex size-8 shrink-0 items-center justify-center rounded-lg ${
                        active ? 'bg-brand-500 text-white' : 'bg-ink-100 text-ink-500'
                      }`}
                    >
                      <Icon name={row.icon} className="size-4" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">{row.title}</span>
                      {row.subtitle && (
                        <span className="block truncate text-xs text-ink-500">
                          {row.subtitle}
                        </span>
                      )}
                    </span>
                    {row.badge && <Badge tone="neutral">{row.badge}</Badge>}
                    <Icon name="chevron-right" className="size-4 shrink-0 text-ink-300" />
                  </button>
                </div>
              )
            })
          )}
        </div>

        <div className="flex items-center justify-between border-t border-ink-200 bg-ink-50/60 px-4 py-2 text-[11px] text-ink-500">
          <span className="flex items-center gap-3">
            <span><kbd className="font-sans font-semibold">↑↓</kbd> navigate</span>
            <span><kbd className="font-sans font-semibold">↵</kbd> open</span>
          </span>
          <span>{searching ? `${rows.length} result${rows.length === 1 ? '' : 's'}` : 'Start typing to search'}</span>
        </div>
      </div>
    </div>,
    document.body,
  )
}

/** Opens the palette on Ctrl+K / ⌘K from anywhere in the app. */
export function useCommandPalette() {
  const [open, setOpen] = useState(false)

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault()
        setOpen((current) => !current)
      }
      // "/" is the other habit people have, but not while they are typing.
      if (event.key === '/' && !isTyping(event.target)) {
        event.preventDefault()
        setOpen(true)
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  return { open, setOpen }
}

function isTyping(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null
  if (!el) return false
  return el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable
}
