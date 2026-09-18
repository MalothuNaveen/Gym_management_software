/**
 * Light / dark / follow-the-system.
 *
 * The choice is written to <html data-theme>, which is where index.css expects
 * it. Storage can throw in a private window, so every read and write is
 * defended - a gym owner on a locked-down phone must still get a working app,
 * just one that forgets the preference.
 */
import {
  createContext, useCallback, useContext, useEffect, useMemo, useState,
  type ReactNode,
} from 'react'

export type ThemeChoice = 'light' | 'dark' | 'system'

const STORAGE_KEY = 'gym.theme'

interface ThemeApi {
  /** What the owner picked, which may be "system". */
  choice: ThemeChoice
  /** What is actually on screen right now. */
  resolved: 'light' | 'dark'
  setChoice: (choice: ThemeChoice) => void
  /** Flips between light and dark, leaving "system" behind. */
  toggle: () => void
}

const ThemeContext = createContext<ThemeApi | null>(null)

function readStored(): ThemeChoice {
  try {
    const value = localStorage.getItem(STORAGE_KEY)
    if (value === 'light' || value === 'dark' || value === 'system') return value
  } catch {
    /* storage disabled; fall through to the system preference */
  }
  return 'system'
}

function systemPrefersDark(): boolean {
  return typeof window !== 'undefined'
    && window.matchMedia?.('(prefers-color-scheme: dark)').matches === true
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [choice, setChoiceState] = useState<ThemeChoice>(readStored)
  const [systemDark, setSystemDark] = useState(systemPrefersDark)

  // Follow the OS live, so "system" means system even after the app has loaded.
  useEffect(() => {
    const query = window.matchMedia('(prefers-color-scheme: dark)')
    const onChange = () => setSystemDark(query.matches)
    query.addEventListener('change', onChange)
    return () => query.removeEventListener('change', onChange)
  }, [])

  const resolved: 'light' | 'dark' =
    choice === 'system' ? (systemDark ? 'dark' : 'light') : choice

  useEffect(() => {
    document.documentElement.dataset.theme = resolved
    // Keeps the phone's status bar and the browser's own surfaces in step.
    document.querySelector('meta[name="theme-color"]')
      ?.setAttribute('content', resolved === 'dark' ? '#0b1220' : '#ffffff')
  }, [resolved])

  const setChoice = useCallback((next: ThemeChoice) => {
    setChoiceState(next)
    try {
      localStorage.setItem(STORAGE_KEY, next)
    } catch {
      /* the preference simply will not survive a reload */
    }
  }, [])

  const api = useMemo<ThemeApi>(() => ({
    choice,
    resolved,
    setChoice,
    toggle: () => setChoice(resolved === 'dark' ? 'light' : 'dark'),
  }), [choice, resolved, setChoice])

  return <ThemeContext.Provider value={api}>{children}</ThemeContext.Provider>
}

export function useTheme(): ThemeApi {
  const context = useContext(ThemeContext)
  if (!context) throw new Error('useTheme must be used inside ThemeProvider')
  return context
}
