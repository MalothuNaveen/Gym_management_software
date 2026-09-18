import type { ButtonHTMLAttributes, ReactNode } from 'react'
import { Link } from 'react-router-dom'

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'success'
type Size = 'sm' | 'md' | 'lg'

const VARIANTS: Record<Variant, string> = {
  primary: 'bg-ink-900 text-white hover:bg-ink-800 shadow-e1 hover:shadow-e2',
  secondary: 'bg-surface text-ink-800 border border-ink-300 hover:bg-ink-50 hover:border-ink-400 shadow-e1',
  ghost: 'text-ink-600 hover:bg-ink-100 hover:text-ink-900',
  danger: 'bg-rose-600 text-white hover:bg-rose-700 shadow-e1 hover:shadow-e2',
  success: 'bg-emerald-600 text-white hover:bg-emerald-700 shadow-e1 hover:shadow-e2',
}

// Every size clears the 44px minimum touch target on phones.
const SIZES: Record<Size, string> = {
  sm: 'h-9 px-3 text-sm gap-1.5',
  md: 'h-11 px-4 text-sm gap-2',
  lg: 'h-12 px-5 text-base gap-2',
}

// `pressable` carries the press-scale and the colour/shadow transitions; see
// index.css. A button that visibly gives under the finger is the cheapest
// confirmation that a tap registered, which matters on a phone where there is
// no cursor and no hover to fall back on.
const BASE =
  'pressable inline-flex items-center justify-center rounded-lg font-medium ' +
  'disabled:cursor-not-allowed disabled:opacity-55 select-none whitespace-nowrap'

interface CommonProps {
  variant?: Variant
  size?: Size
  loading?: boolean
  /** Shown while `loading` — e.g. "Saving…". */
  loadingText?: string
  icon?: ReactNode
  fullWidth?: boolean
  children?: ReactNode
  className?: string
}

export type ButtonProps = CommonProps &
  Omit<ButtonHTMLAttributes<HTMLButtonElement>, keyof CommonProps>

export function Button({
  variant = 'primary',
  size = 'md',
  loading = false,
  loadingText,
  icon,
  fullWidth,
  children,
  className = '',
  disabled,
  type = 'button',
  ...rest
}: ButtonProps) {
  return (
    <button
      type={type}
      // `loading` disables the button, which is what stops a double submit.
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={`${BASE} ${VARIANTS[variant]} ${SIZES[size]} ${fullWidth ? 'w-full' : ''} ${className}`}
      {...rest}
    >
      {loading ? (
        <>
          <Spinner />
          <span>{loadingText ?? 'Please wait…'}</span>
        </>
      ) : (
        <>
          {icon}
          {children}
        </>
      )}
    </button>
  )
}

interface LinkButtonProps extends CommonProps {
  to: string
  state?: unknown
}

export function LinkButton({
  to,
  state,
  variant = 'primary',
  size = 'md',
  icon,
  fullWidth,
  children,
  className = '',
}: LinkButtonProps) {
  return (
    <Link
      to={to}
      state={state as never}
      className={`${BASE} ${VARIANTS[variant]} ${SIZES[size]} ${fullWidth ? 'w-full' : ''} ${className}`}
    >
      {icon}
      {children}
    </Link>
  )
}

export function Spinner({ className = 'size-4' }: { className?: string }) {
  return (
    <svg className={`animate-spin ${className}`} viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path
        className="opacity-90"
        fill="currentColor"
        d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"
      />
    </svg>
  )
}
