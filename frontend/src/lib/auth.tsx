/** Sign-in state, shared across the app. */
import {
  createContext, useCallback, useContext, useEffect, useMemo, useState,
  type ReactNode,
} from 'react'

import { api, getToken, setSessionExpiredHandler, setToken } from './api'
import type { User } from './types'

interface AuthState {
  user: User | null
  loading: boolean
  signIn: (identifier: string, password: string) => Promise<void>
  signOut: () => void
  isAdmin: boolean
}

const AuthContext = createContext<AuthState | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)

  const signOut = useCallback(() => {
    setToken(null)
    setUser(null)
  }, [])

  // A token rejected mid-session drops us straight back to the login screen
  // rather than leaving half-loaded pages behind.
  useEffect(() => {
    setSessionExpiredHandler(() => setUser(null))
  }, [])

  // Restore the session on a page reload.
  useEffect(() => {
    let cancelled = false
    async function restore() {
      if (!getToken()) {
        setLoading(false)
        return
      }
      try {
        const me = await api.get<User>('/auth/me')
        if (!cancelled) setUser(me)
      } catch {
        setToken(null)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    void restore()
    return () => {
      cancelled = true
    }
  }, [])

  const signIn = useCallback(async (identifier: string, password: string) => {
    const result = await api.post<{ access_token: string }>('/auth/login', {
      identifier,
      password,
    })
    setToken(result.access_token)
    setUser(await api.get<User>('/auth/me'))
  }, [])

  const value = useMemo<AuthState>(
    () => ({
      user,
      loading,
      signIn,
      signOut,
      isAdmin: user?.role === 'owner' || user?.role === 'admin',
    }),
    [user, loading, signIn, signOut],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthState {
  const context = useContext(AuthContext)
  if (!context) throw new Error('useAuth must be used inside AuthProvider')
  return context
}
