/**
 * The icon set.
 *
 * These replace the emoji the first build used. Emoji are drawn by the
 * operating system, so the same screen looked different on the owner's Android
 * phone, the desktop in the office and an iPhone - different weights, different
 * colours, different baselines, and no way to tint one to match its label. A
 * single stroked set inherits `currentColor`, lines up with the text, and reads
 * the same everywhere.
 *
 * All are drawn on a 24x24 grid with a 1.75 stroke, which keeps them legible at
 * the 16-20px sizes actually used without turning into mush.
 */
import type { ReactNode } from 'react'

export type IconName =
  | 'dashboard' | 'members' | 'attendance' | 'payments' | 'plans' | 'staff'
  | 'expenses' | 'reports' | 'settings' | 'logo'
  | 'plus' | 'search' | 'chevron-right' | 'arrow-left' | 'close' | 'menu'
  | 'more' | 'camera' | 'share' | 'whatsapp' | 'mail' | 'print' | 'download'
  | 'edit' | 'archive' | 'renew' | 'alert' | 'check' | 'calendar' | 'phone'
  | 'user' | 'receipt' | 'trash' | 'inbox' | 'filter'
  | 'sun' | 'moon' | 'system' | 'bell' | 'messages' | 'chevron-down'
  | 'chevron-left' | 'collapse' | 'expand' | 'trend-up' | 'trend-down'
  | 'clock' | 'sign-out' | 'sparkle' | 'check-circle' | 'x-circle' | 'send'

const PATHS: Record<IconName, ReactNode> = {
  dashboard: <path d="M3 10.4 12 3l9 7.4V20a1 1 0 0 1-1 1h-4.6v-6.2h-4.8V21H4a1 1 0 0 1-1-1z" />,
  members: (
    <>
      <circle cx="9" cy="7.5" r="3.5" />
      <path d="M2.5 20.5a6.8 6.8 0 0 1 13 0M16.4 4.3a3.5 3.5 0 0 1 0 6.4M18 14.4a6.3 6.3 0 0 1 3.5 5.6" />
    </>
  ),
  attendance: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="m8.2 12.3 2.6 2.6 5-5.4" />
    </>
  ),
  payments: (
    <>
      <rect x="2.5" y="6" width="19" height="12" rx="2" />
      <circle cx="12" cy="12" r="2.6" />
      <path d="M6 10.5v3M18 10.5v3" />
    </>
  ),
  plans: (
    <>
      {/* Notches on both edges, cut by arcs that bulge inward. Keep them
          shallow - a deeper curve pinches the middle into a bow tie. */}
      <path d="M2.6 9.4a2.6 2.6 0 0 1 0 5.2V17a2 2 0 0 0 2 2h14.8a2 2 0 0 0 2-2v-2.4a2.6 2.6 0 0 1 0-5.2V7a2 2 0 0 0-2-2H4.6a2 2 0 0 0-2 2z" />
      <path d="M14.2 5.6v1.8M14.2 11.1v1.8M14.2 16.6v1.8" />
    </>
  ),
  staff: (
    <>
      <rect x="3.5" y="3.5" width="17" height="17" rx="2.5" />
      <circle cx="12" cy="10" r="2.6" />
      <path d="M7.8 17.4a4.6 4.6 0 0 1 8.4 0" />
    </>
  ),
  expenses: (
    <>
      <path d="M5.5 3.6v16.8l2-1.4 2 1.4 2.5-1.4 2.5 1.4 2-1.4 2 1.4V3.6a1 1 0 0 0-1-1h-11a1 1 0 0 0-1 1z" />
      <path d="M9 8h6M9 12h6" />
    </>
  ),
  reports: (
    <>
      <path d="M3.5 20.5h17" />
      <path d="M7 20.5v-5.8M12 20.5V6.5M17 20.5v-9.2" />
    </>
  ),
  settings: (
    <>
      <path d="M4 6.5h8M16.5 6.5h3.5M4 12h3.5M12 12h8M4 17.5h6.5M15 17.5h5" />
      <circle cx="14.2" cy="6.5" r="2.2" />
      <circle cx="9.8" cy="12" r="2.2" />
      <circle cx="12.8" cy="17.5" r="2.2" />
    </>
  ),
  // Plates tall, bar short. Shallow plates read as an arrow, not a dumbbell.
  logo: <path d="M4.2 9.6v4.8M7.6 6.6v10.8M16.4 6.6v10.8M19.8 9.6v4.8M7.6 12h8.8" />,

  plus: <path d="M12 5.5v13M5.5 12h13" />,
  search: (
    <>
      <circle cx="11" cy="11" r="6.8" />
      <path d="m20 20-4.2-4.2" />
    </>
  ),
  'chevron-right': <path d="m9.5 6 6 6-6 6" />,
  'arrow-left': <path d="M19.5 12H5m0 0 6.2-6.2M5 12l6.2 6.2" />,
  close: <path d="M6.2 6.2 17.8 17.8M17.8 6.2 6.2 17.8" />,
  menu: <path d="M4 6.5h16M4 12h16M4 17.5h16" />,
  more: (
    <>
      <circle cx="5.5" cy="12" r="1.4" fill="currentColor" stroke="none" />
      <circle cx="12" cy="12" r="1.4" fill="currentColor" stroke="none" />
      <circle cx="18.5" cy="12" r="1.4" fill="currentColor" stroke="none" />
    </>
  ),
  camera: (
    <>
      <path d="M3.5 8.8h3.2l1.5-2.6h7.6l1.5 2.6h3.2a1 1 0 0 1 1 1v8.2a1 1 0 0 1-1 1h-17a1 1 0 0 1-1-1V9.8a1 1 0 0 1 1-1z" />
      <circle cx="12" cy="13.4" r="3.2" />
    </>
  ),
  share: (
    <>
      <path d="M12 15.5V3.5m0 0L8.6 6.9M12 3.5l3.4 3.4" />
      <path d="M5 12.5v6a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-6" />
    </>
  ),
  // The only brand mark here, so it is a filled glyph rather than a stroke.
  whatsapp: (
    <path
      fill="currentColor"
      stroke="none"
      d="M12.04 2c-5.5 0-9.96 4.46-9.96 9.96 0 1.76.46 3.48 1.34 5L2 22l5.19-1.36a9.93 9.93 0 0 0 4.85 1.24h.01c5.5 0 9.96-4.46 9.96-9.96 0-2.66-1.04-5.16-2.92-7.04A9.88 9.88 0 0 0 12.04 2zm0 1.83c2.17 0 4.2.85 5.74 2.38a8.07 8.07 0 0 1 2.38 5.75c0 4.48-3.64 8.13-8.13 8.13a8.1 8.1 0 0 1-4.13-1.13l-.3-.18-3.07.8.82-3-.19-.31a8.06 8.06 0 0 1-1.24-4.31c0-4.48 3.65-8.13 8.12-8.13zm-3.7 4.3c-.17 0-.45.06-.69.32-.24.26-.9.88-.9 2.15s.92 2.49 1.05 2.66c.13.17 1.8 2.75 4.37 3.86.61.26 1.08.42 1.45.54.61.19 1.17.17 1.6.1.49-.07 1.5-.61 1.72-1.21.21-.6.21-1.11.15-1.21-.06-.11-.24-.17-.5-.3-.26-.13-1.5-.74-1.74-.83-.23-.08-.4-.13-.57.13-.17.26-.65.83-.8 1-.14.17-.29.19-.55.06-.26-.13-1.07-.4-2.04-1.26-.76-.67-1.27-1.5-1.42-1.76-.15-.26-.02-.4.11-.53.12-.12.26-.3.39-.46.13-.17.17-.29.26-.48.09-.17.04-.33-.02-.46-.07-.13-.57-1.38-.78-1.89-.2-.49-.41-.42-.57-.43z"
    />
  ),
  mail: (
    <>
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path d="m3.6 7.2 8.4 5.8 8.4-5.8" />
    </>
  ),
  print: (
    <>
      <path d="M7 8.5V3.8h10v4.7" />
      <path d="M7 17.5H4.5a1 1 0 0 1-1-1V10a1 1 0 0 1 1-1h15a1 1 0 0 1 1 1v6.5a1 1 0 0 1-1 1H17" />
      <rect x="7" y="14" width="10" height="6.2" rx="1" />
    </>
  ),
  download: (
    <>
      <path d="M12 3.5v11.2m0 0 3.8-3.8M12 14.7l-3.8-3.8" />
      <path d="M4.5 18.5h15" />
    </>
  ),
  edit: (
    <>
      <path d="M4 20h4.2L19 9.2a2.2 2.2 0 0 0-3.2-3.2L5 16.8z" />
      <path d="m14.8 7 3.2 3.2" />
    </>
  ),
  archive: (
    <>
      <rect x="3" y="4" width="18" height="4.2" rx="1" />
      <path d="M5 8.2V19a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V8.2" />
      <path d="M10 12h4" />
    </>
  ),
  renew: (
    <>
      <path d="M20.2 12a8.2 8.2 0 1 1-2.4-5.8" />
      <path d="M20.5 3.6v4.8h-4.8" />
    </>
  ),
  alert: (
    <>
      <path d="M12 3.8 2.9 19.6a1 1 0 0 0 .87 1.5h16.46a1 1 0 0 0 .87-1.5z" />
      <path d="M12 9.5v4.4M12 17.3h.01" />
    </>
  ),
  check: <path d="m5 12.8 4.6 4.6L19 6.5" />,
  calendar: (
    <>
      <rect x="3.2" y="5" width="17.6" height="16" rx="2" />
      <path d="M8 3v4M16 3v4M3.2 10h17.6" />
    </>
  ),
  phone: (
    <path d="M6.3 3.6h3l1.5 3.9-2 1.5a12.4 12.4 0 0 0 6.2 6.2l1.5-2 3.9 1.5v3a1.5 1.5 0 0 1-1.7 1.5C11.1 19.2 4.8 12.9 4.8 5.3a1.5 1.5 0 0 1 1.5-1.7z" />
  ),
  user: (
    <>
      <circle cx="12" cy="8" r="3.8" />
      <path d="M4.8 20.4a7.2 7.2 0 0 1 14.4 0" />
    </>
  ),
  receipt: (
    <>
      <path d="M6 3.6v16.8l2.2-1.4 2 1.4 1.8-1.4 1.8 1.4 2-1.4 2.2 1.4V3.6z" />
      <path d="M9.2 8.4h5.6M9.2 12.4h5.6" />
    </>
  ),
  trash: (
    <>
      <path d="M4.5 6.8h15M9.8 3.8h4.4M9.5 10.5v6.4M14.5 10.5v6.4" />
      <path d="m6.5 6.8 1 13.2h9l1-13.2" />
    </>
  ),
  inbox: (
    <>
      <rect x="3.2" y="4.5" width="17.6" height="15" rx="2" />
      <path d="M3.2 13.5h4.6l1.4 2.8h5.6l1.4-2.8h4.6" />
    </>
  ),
  filter: <path d="M3.5 6h17M6.5 12h11M10 18h4" />,

  sun: (
    <>
      <circle cx="12" cy="12" r="4.2" />
      <path d="M12 2.6v2.2M12 19.2v2.2M21.4 12h-2.2M4.8 12H2.6M18.6 5.4l-1.6 1.6M7 17l-1.6 1.6M18.6 18.6L17 17M7 7 5.4 5.4" />
    </>
  ),
  // A crescent, not a circle with a bite: at 20px the bite reads as a blob.
  moon: <path d="M20.5 14.2A8.6 8.6 0 0 1 9.8 3.5a8.6 8.6 0 1 0 10.7 10.7z" />,
  system: (
    <>
      <rect x="2.6" y="4.4" width="18.8" height="12.4" rx="2" />
      <path d="M8.6 20.6h6.8M12 16.8v3.8" />
    </>
  ),
  bell: (
    <>
      <path d="M18.2 16.2V11a6.2 6.2 0 1 0-12.4 0v5.2L4.2 18.4h15.6z" />
      <path d="M9.8 21.2a2.4 2.4 0 0 0 4.4 0" />
    </>
  ),
  messages: (
    <>
      <path d="M20.6 14.4a2 2 0 0 1-2 2h-9.2L5.4 20.2v-3.8h-1a2 2 0 0 1-2-2V5.8a2 2 0 0 1 2-2h14.2a2 2 0 0 1 2 2z" />
      <path d="M7.4 8.4h9.2M7.4 11.8h5.6" />
    </>
  ),
  'chevron-down': <path d="m6 9.5 6 6 6-6" />,
  'chevron-left': <path d="m14.5 6-6 6 6 6" />,
  collapse: (
    <>
      <rect x="3" y="4.2" width="18" height="15.6" rx="2" />
      <path d="M9.6 4.2v15.6M15.6 9.6l-2.4 2.4 2.4 2.4" />
    </>
  ),
  expand: (
    <>
      <rect x="3" y="4.2" width="18" height="15.6" rx="2" />
      <path d="M9.6 4.2v15.6M13.2 9.6l2.4 2.4-2.4 2.4" />
    </>
  ),
  'trend-up': (
    <>
      <path d="m3.5 16.5 5.5-5.6 3.6 3.6 7.9-7.9" />
      <path d="M15.4 6.6h5.1v5.1" />
    </>
  ),
  'trend-down': (
    <>
      <path d="m3.5 7.5 5.5 5.6 3.6-3.6 7.9 7.9" />
      <path d="M15.4 17.4h5.1v-5.1" />
    </>
  ),
  clock: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 6.8V12l3.4 2" />
    </>
  ),
  'sign-out': (
    <>
      <path d="M14.4 3.8H6.6a1.8 1.8 0 0 0-1.8 1.8v12.8a1.8 1.8 0 0 0 1.8 1.8h7.8" />
      <path d="M17.4 8.4 21 12l-3.6 3.6M21 12H9.6" />
    </>
  ),
  sparkle: (
    <path d="M12 3.2l1.9 5 5 1.9-5 1.9-1.9 5-1.9-5-5-1.9 5-1.9zM18.6 15.4l.8 2 2 .8-2 .8-.8 2-.8-2-2-.8 2-.8z" />
  ),
  'check-circle': (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="m8.2 12.3 2.6 2.6 5-5.4" />
    </>
  ),
  'x-circle': (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="m9.2 9.2 5.6 5.6M14.8 9.2l-5.6 5.6" />
    </>
  ),
  send: <path d="M21 3.4 10.8 13.6M21 3.4l-6.5 17.8-3.7-7.6-7.6-3.7z" />,
}

interface IconProps {
  name: IconName
  /** Tailwind size class. Icons inherit colour from the text around them. */
  className?: string
  strokeWidth?: number
}

export function Icon({ name, className = 'size-5', strokeWidth = 1.75 }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={`shrink-0 ${className}`}
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      focusable="false"
    >
      {PATHS[name]}
    </svg>
  )
}
