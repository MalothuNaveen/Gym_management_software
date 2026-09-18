import { useEffect, useRef, useState } from 'react'

import { Icon } from './Icon'

/** Delays a value so typing does not fire a request per keystroke. */
export function useDebounced<T>(value: T, delay = 300): T {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay)
    return () => clearTimeout(timer)
  }, [value, delay])
  return debounced
}

export function SearchInput({
  value, onChange, placeholder = 'Search…', autoFocus, className = '',
}: {
  value: string
  onChange: (value: string) => void
  placeholder?: string
  autoFocus?: boolean
  className?: string
}) {
  const ref = useRef<HTMLInputElement>(null)

  return (
    <div className={`relative ${className}`}>
      <span className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3 text-ink-400">
        <Icon name="search" className="size-4.5" />
      </span>
      <input
        ref={ref}
        type="search"
        inputMode="search"
        value={value}
        autoFocus={autoFocus}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        aria-label={placeholder}
        className="h-11 w-full rounded-lg border border-ink-300 bg-surface pr-9 pl-9 text-ink-900 placeholder:text-ink-400 transition focus:border-brand-500 focus:ring-2 focus:ring-brand-100 focus:outline-none"
      />
      {value && (
        <button
          type="button"
          onClick={() => {
            onChange('')
            ref.current?.focus()
          }}
          aria-label="Clear search"
          className="pressable absolute inset-y-0 right-0 flex items-center px-3 text-ink-400 hover:text-ink-700"
        >
          <Icon name="close" className="size-4" strokeWidth={2} />
        </button>
      )}
    </div>
  )
}

/** Segmented filter control. Scrolls sideways on narrow screens. */
export function FilterTabs<T extends string>({
  value, options, onChange, className = '',
}: {
  value: T
  options: readonly { value: T; label: string; count?: number }[]
  onChange: (value: T) => void
  className?: string
}) {
  return (
    <div className={`scroll-x -mx-1 px-1 ${className}`} role="tablist">
      <div className="inline-flex gap-1 rounded-lg bg-ink-100 p-1">
        {options.map((option) => {
          const selected = option.value === value
          return (
            <button
              key={option.value}
              type="button"
              role="tab"
              aria-selected={selected}
              onClick={() => onChange(option.value)}
              className={`h-9 rounded-md px-3 text-sm font-medium whitespace-nowrap transition ${
                selected
                  ? 'bg-surface text-ink-900 shadow-xs'
                  : 'text-ink-600 hover:text-ink-900'
              }`}
            >
              {option.label}
              {option.count !== undefined && (
                <span className={`ml-1.5 tnum ${selected ? 'text-ink-500' : 'text-ink-400'}`}>
                  {option.count}
                </span>
              )}
            </button>
          )
        })}
      </div>
    </div>
  )
}
