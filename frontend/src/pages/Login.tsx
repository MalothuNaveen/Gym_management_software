import { useState, type FormEvent } from 'react'

import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Field'
import { errorMessage } from '@/lib/api'
import { useAuth } from '@/lib/auth'
import { Icon } from '@/components/ui/Icon'

export function LoginPage() {
  const { signIn } = useAuth()
  const [identifier, setIdentifier] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    if (submitting) return

    if (!identifier.trim() || !password) {
      setError('Please enter your email or mobile number and your password.')
      return
    }

    setError(null)
    setSubmitting(true)
    try {
      await signIn(identifier.trim(), password)
    } catch (caught) {
      setError(errorMessage(caught))
      setSubmitting(false)
    }
  }

  return (
    <div className="flex min-h-dvh items-center justify-center bg-ink-50 px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <span className="mx-auto mb-4 flex size-14 items-center justify-center rounded-2xl bg-ink-900 text-white shadow-e2">
            <Icon name="logo" className="size-7" strokeWidth={2} />
          </span>
          <h1 className="text-xl font-semibold tracking-tight text-ink-900">
            GYM MANAGEMENT
          </h1>
          <p className="mt-1 text-sm text-ink-500">Sign in to continue</p>
        </div>

        <form
          onSubmit={handleSubmit}
          noValidate
          className="rounded-2xl border border-ink-200 bg-white p-6 shadow-sm"
        >
          <div className="space-y-4">
            <Input
              label="Email or Mobile Number"
              name="identifier"
              type="text"
              autoComplete="username"
              autoCapitalize="none"
              autoCorrect="off"
              value={identifier}
              onChange={(event) => setIdentifier(event.target.value)}
              placeholder="owner@gym.local"
              required
            />
            <Input
              label="Password"
              name="password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
            />
          </div>

          {error && (
            <p
              className="mt-4 rounded-lg bg-rose-50 px-3 py-2.5 text-sm text-rose-700"
              role="alert"
            >
              {error}
            </p>
          )}

          <Button
            type="submit"
            fullWidth
            size="lg"
            className="mt-6"
            loading={submitting}
            loadingText="Signing in…"
          >
            Login
          </Button>
        </form>

        <p className="mt-6 text-center text-xs text-ink-400">
          Private system. Staff accounts are created by the gym owner.
        </p>
      </div>
    </div>
  )
}
