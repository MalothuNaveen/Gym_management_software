/**
 * Formatting helpers. Currency and dates are defined once, here, so a change
 * of format never means hunting through screens.
 */

/** ₹1,000 · ₹15,500 · ₹1,25,000 — Indian digit grouping. */
export function formatMoney(
  value: string | number | null | undefined,
  options: { decimals?: boolean; sign?: boolean } = {},
): string {
  const amount = Number(value ?? 0)
  if (!Number.isFinite(amount)) return '₹0'

  const negative = amount < 0
  const absolute = Math.abs(amount)
  const showDecimals = options.decimals ?? absolute % 1 !== 0

  const formatted = new Intl.NumberFormat('en-IN', {
    minimumFractionDigits: showDecimals ? 2 : 0,
    maximumFractionDigits: showDecimals ? 2 : 0,
  }).format(absolute)

  const prefix = negative ? '−' : options.sign ? '+' : ''
  return `${prefix}₹${formatted}`
}

/** Compact form for dashboard tiles: ₹42.5k, ₹1.2L. */
export function formatMoneyCompact(value: string | number | null | undefined): string {
  const amount = Number(value ?? 0)
  if (!Number.isFinite(amount)) return '₹0'
  const absolute = Math.abs(amount)
  if (absolute >= 10000000) return `₹${(amount / 10000000).toFixed(1)}Cr`
  if (absolute >= 100000) return `₹${(amount / 100000).toFixed(1)}L`
  return formatMoney(amount)
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/** 17 Sep 2026 — never the ambiguous 09/17/26. */
export function formatDate(value: string | Date | null | undefined): string {
  const date = toDate(value)
  if (!date) return '—'
  return `${date.getDate()} ${MONTHS[date.getMonth()]} ${date.getFullYear()}`
}

/** 17 Sep — for dense lists where the year is obvious. */
export function formatDateShort(value: string | Date | null | undefined): string {
  const date = toDate(value)
  if (!date) return '—'
  return `${date.getDate()} ${MONTHS[date.getMonth()]}`
}

/** 09:15 AM */
export function formatTime(value: string | Date | null | undefined): string {
  const date = toDate(value)
  if (!date) return '—'
  return date.toLocaleTimeString('en-IN', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  })
}

export function formatDateTime(value: string | Date | null | undefined): string {
  const date = toDate(value)
  if (!date) return '—'
  return `${formatDate(date)}, ${formatTime(date)}`
}

/** September 2026 */
export function formatMonth(value: string | Date | null | undefined): string {
  const date = toDate(value)
  if (!date) return '—'
  return date.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' })
}

function toDate(value: string | Date | null | undefined): Date | null {
  if (!value) return null
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value
  // A bare 'YYYY-MM-DD' is parsed as UTC by the Date constructor, which shifts
  // it a day backwards in India. Build it as a local date instead.
  const dateOnly = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
  if (dateOnly) {
    return new Date(Number(dateOnly[1]), Number(dateOnly[2]) - 1, Number(dateOnly[3]))
  }
  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime()) ? null : parsed
}

/** 'YYYY-MM-DD' in local time — what every date input expects. */
export function toInputDate(value: string | Date | null | undefined): string {
  const date = toDate(value) ?? new Date()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${date.getFullYear()}-${month}-${day}`
}

export function todayInput(): string {
  return toInputDate(new Date())
}

export function addDays(value: string, days: number): string {
  const date = toDate(value) ?? new Date()
  date.setDate(date.getDate() + days)
  return toInputDate(date)
}

/** '3 days left' · 'Expires today' · 'Expired 5 days ago' */
export function describeDays(days: number | null | undefined): string {
  if (days === null || days === undefined) return 'No membership'
  if (days < 0) return `Expired ${Math.abs(days)} day${Math.abs(days) === 1 ? '' : 's'} ago`
  if (days === 0) return 'Expires today'
  if (days === 1) return '1 day left'
  return `${days} days left`
}

/** 98765 43210 — easier to read back over the phone. */
export function formatPhone(phone: string | null | undefined): string {
  if (!phone) return '—'
  const digits = phone.replace(/\D/g, '')
  if (digits.length === 10) return `${digits.slice(0, 5)} ${digits.slice(5)}`
  return phone
}

export const PAYMENT_METHODS = [
  { value: 'cash', label: 'Cash' },
  { value: 'upi', label: 'UPI' },
  { value: 'card', label: 'Card' },
  { value: 'bank_transfer', label: 'Bank Transfer' },
  { value: 'other', label: 'Other' },
] as const

export const EXPENSE_CATEGORIES = [
  { value: 'rent', label: 'Rent' },
  { value: 'electricity', label: 'Electricity' },
  { value: 'equipment', label: 'Equipment' },
  { value: 'maintenance', label: 'Maintenance' },
  { value: 'cleaning', label: 'Cleaning' },
  { value: 'staff_salary', label: 'Staff Salary' },
  { value: 'other', label: 'Other' },
] as const

export const STAFF_ROLES = [
  { value: 'owner', label: 'Owner' },
  { value: 'admin', label: 'Admin / Office Staff' },
  { value: 'trainer', label: 'Trainer' },
  { value: 'other', label: 'Other Staff' },
] as const

export function labelFor(
  options: readonly { value: string; label: string }[],
  value: string | null | undefined,
): string {
  return options.find((o) => o.value === value)?.label ?? '—'
}
