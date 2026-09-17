/**
 * Form inputs. Every control is wrapped in `Field`, which owns the label, the
 * hint and the error text, so no screen has to remember the accessibility
 * wiring or invent its own error styling.
 */
import {
  useId, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from 'react'

interface FieldProps {
  label: string
  htmlFor?: string
  required?: boolean
  error?: string
  hint?: string
  className?: string
  children: ReactNode
}

export function Field({
  label, htmlFor, required, error, hint, className = '', children,
}: FieldProps) {
  return (
    <div className={className}>
      <label htmlFor={htmlFor} className="mb-1.5 block text-sm font-medium text-ink-700">
        {label}
        {required && (
          <span className="ml-0.5 text-rose-600" aria-hidden>
            *
          </span>
        )}
      </label>
      {children}
      {error ? (
        <p className="mt-1.5 text-sm text-rose-600" role="alert">
          {error}
        </p>
      ) : hint ? (
        <p className="mt-1.5 text-xs text-ink-500">{hint}</p>
      ) : null}
    </div>
  )
}

const CONTROL =
  'w-full rounded-lg border bg-white px-3 text-ink-900 placeholder:text-ink-400 ' +
  'transition focus:border-brand-500 focus:ring-2 focus:ring-brand-100 focus:outline-none ' +
  'disabled:bg-ink-100 disabled:text-ink-500'

const OK = 'border-ink-300'
const BAD = 'border-rose-400 focus:border-rose-500 focus:ring-rose-100'

// --- Text input -----------------------------------------------------------

interface InputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'size'> {
  label?: string
  error?: string
  hint?: string
  required?: boolean
  containerClassName?: string
  prefix?: string
}

export function Input({
  label, error, hint, required, containerClassName, prefix, className = '', ...rest
}: InputProps) {
  const generatedId = useId()
  const id = rest.id ?? generatedId

  const control = (
    <div className="relative">
      {prefix && (
        <span className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3 text-ink-500">
          {prefix}
        </span>
      )}
      <input
        id={id}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${id}-error` : undefined}
        className={`${CONTROL} h-11 ${error ? BAD : OK} ${prefix ? 'pl-7' : ''} ${className}`}
        {...rest}
      />
    </div>
  )

  if (!label) return control
  return (
    <Field label={label} htmlFor={id} required={required} error={error} hint={hint}
      className={containerClassName}>
      {control}
    </Field>
  )
}

// --- Money ----------------------------------------------------------------

interface CurrencyInputProps extends Omit<InputProps, 'type' | 'prefix' | 'onChange'> {
  value: string
  onChange: (value: string) => void
}

/**
 * A rupee amount. Accepts only digits and a single decimal point, so the owner
 * cannot type a letter or a minus sign into a payment field at all.
 */
export function CurrencyInput({ value, onChange, ...rest }: CurrencyInputProps) {
  return (
    <Input
      {...rest}
      type="text"
      inputMode="decimal"
      prefix="₹"
      value={value}
      onChange={(event) => {
        const next = event.target.value.replace(/[^\d.]/g, '')
        // Keep at most one decimal point.
        const parts = next.split('.')
        onChange(parts.length > 2 ? `${parts[0]}.${parts.slice(1).join('')}` : next)
      }}
      className="tnum"
    />
  )
}

// --- Select ---------------------------------------------------------------

interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label?: string
  error?: string
  hint?: string
  required?: boolean
  options: readonly { value: string | number; label: string; disabled?: boolean }[]
  placeholder?: string
  containerClassName?: string
}

export function Select({
  label, error, hint, required, options, placeholder, containerClassName,
  className = '', ...rest
}: SelectProps) {
  const generatedId = useId()
  const id = rest.id ?? generatedId

  const control = (
    <select
      id={id}
      aria-invalid={error ? true : undefined}
      className={`${CONTROL} h-11 appearance-none bg-[length:1.25rem] bg-[right_0.5rem_center] bg-no-repeat pr-9 ${error ? BAD : OK} ${className}`}
      style={{
        backgroundImage:
          "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 24 24' stroke='%2364748b' stroke-width='2'%3E%3Cpath stroke-linecap='round' stroke-linejoin='round' d='M19 9l-7 7-7-7'/%3E%3C/svg%3E\")",
      }}
      {...rest}
    >
      {placeholder && <option value="">{placeholder}</option>}
      {options.map((option) => (
        <option key={option.value} value={option.value} disabled={option.disabled}>
          {option.label}
        </option>
      ))}
    </select>
  )

  if (!label) return control
  return (
    <Field label={label} htmlFor={id} required={required} error={error} hint={hint}
      className={containerClassName}>
      {control}
    </Field>
  )
}

// --- Textarea -------------------------------------------------------------

interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string
  error?: string
  hint?: string
  containerClassName?: string
}

export function Textarea({
  label, error, hint, containerClassName, className = '', rows = 3, ...rest
}: TextareaProps) {
  const generatedId = useId()
  const id = rest.id ?? generatedId

  const control = (
    <textarea
      id={id}
      rows={rows}
      aria-invalid={error ? true : undefined}
      className={`${CONTROL} py-2.5 ${error ? BAD : OK} ${className}`}
      {...rest}
    />
  )

  if (!label) return control
  return (
    <Field label={label} htmlFor={id} error={error} hint={hint} className={containerClassName}>
      {control}
    </Field>
  )
}

// --- Date -----------------------------------------------------------------

export function DateInput(props: InputProps) {
  // The native picker is the right call here: it is localised, familiar, and
  // on a phone it is the OS wheel the owner already knows.
  return <Input type="date" {...props} />
}

// --- Section heading inside a form ---------------------------------------

export function FormSection({
  title, description, children, className = '',
}: {
  title: string
  description?: string
  children: ReactNode
  className?: string
}) {
  return (
    <section className={className}>
      <div className="mb-4">
        <h2 className="text-base font-semibold text-ink-900">{title}</h2>
        {description && <p className="mt-0.5 text-sm text-ink-500">{description}</p>}
      </div>
      {children}
    </section>
  )
}

/** A responsive two-column grid that collapses to one column on phones. */
export function FormGrid({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`grid gap-4 sm:grid-cols-2 ${className}`}>{children}</div>
}
