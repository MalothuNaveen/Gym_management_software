import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { Component, Suspense, lazy, type ReactNode } from 'react'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'

import { AppShell } from '@/components/layout/AppShell'
import { Button } from '@/components/ui/Button'
import { Card, LoadingRows } from '@/components/ui/Data'
import { ApiError } from '@/lib/api'
import { AuthProvider, useAuth } from '@/lib/auth'
import { ToastProvider } from '@/lib/toast'
import { DashboardPage } from '@/pages/Dashboard'
import { LoginPage } from '@/pages/Login'
import { MemberNewPage } from '@/pages/MemberNew'
import { MemberProfilePage } from '@/pages/MemberProfile'
import { MembersPage } from '@/pages/Members'
import { Icon } from '@/components/ui/Icon'

// Screens that are not opened every day load on demand, which keeps the first
// paint small on a phone.
const AttendancePage = lazy(() =>
  import('@/pages/Attendance').then((m) => ({ default: m.AttendancePage })))
const PaymentsPage = lazy(() =>
  import('@/pages/Payments').then((m) => ({ default: m.PaymentsPage })))
const PlansPage = lazy(() =>
  import('@/pages/Plans').then((m) => ({ default: m.PlansPage })))
const StaffPage = lazy(() =>
  import('@/pages/Staff').then((m) => ({ default: m.StaffPage })))
const ExpensesPage = lazy(() =>
  import('@/pages/Expenses').then((m) => ({ default: m.ExpensesPage })))
const ReportsPage = lazy(() =>
  import('@/pages/Reports').then((m) => ({ default: m.ReportsPage })))
const SettingsPage = lazy(() =>
  import('@/pages/Settings').then((m) => ({ default: m.SettingsPage })))

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      refetchOnWindowFocus: false,
      retry: (failureCount, error) => {
        // Never retry a rejected login or a missing record — only real
        // connection trouble is worth a second attempt.
        if (error instanceof ApiError && !error.isRetryable) return false
        return failureCount < 2
      },
    },
    mutations: { retry: false },
  },
})

export default function App() {
  return (
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <ToastProvider>
          <BrowserRouter>
            <AuthProvider>
              <AuthGate />
            </AuthProvider>
          </BrowserRouter>
        </ToastProvider>
      </QueryClientProvider>
    </ErrorBoundary>
  )
}

/** Shows the login screen until there is a signed-in user. */
function AuthGate() {
  const { user, loading } = useAuth()

  if (loading) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-ink-50">
        <div className="w-full max-w-sm px-6">
          <LoadingRows count={3} />
        </div>
      </div>
    )
  }

  if (!user) return <LoginPage />

  return (
    <Suspense
      fallback={
        <div className="p-6">
          <Card padded={false}>
            <LoadingRows count={4} />
          </Card>
        </div>
      }
    >
      <Routes>
        <Route element={<AppShell />}>
          <Route index element={<DashboardPage />} />
          <Route path="members" element={<MembersPage />} />
          <Route path="members/new" element={<MemberNewPage />} />
          <Route path="members/:id" element={<MemberProfilePage />} />
          <Route path="attendance" element={<AttendancePage />} />
          <Route path="payments" element={<PaymentsPage />} />
          <Route path="plans" element={<PlansPage />} />
          <Route path="staff" element={<StaffPage />} />
          <Route path="expenses" element={<ExpensesPage />} />
          <Route path="reports" element={<ReportsPage />} />
          <Route path="settings" element={<SettingsPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </Suspense>
  )
}

/** Last line of defence: a render crash shows a sentence, not a blank page. */
class ErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false }

  static getDerivedStateFromError() {
    return { failed: true }
  }

  componentDidCatch(error: unknown) {
    console.error('Unhandled UI error', error)
  }

  render() {
    if (!this.state.failed) return this.props.children
    return (
      <div className="flex min-h-dvh items-center justify-center bg-ink-50 px-6">
        <div className="max-w-sm text-center">
          <span className="mx-auto flex size-14 items-center justify-center rounded-2xl bg-rose-50 text-rose-500">
            <Icon name="alert" className="size-7" strokeWidth={1.6} />
          </span>
          <h1 className="mt-3 text-lg font-semibold text-ink-900">
            Something went wrong
          </h1>
          <p className="mt-1 text-sm text-ink-500">
            The page could not be displayed. Reloading usually fixes it. Your data is safe.
          </p>
          <Button className="mt-5" onClick={() => window.location.reload()}>
            Reload the app
          </Button>
        </div>
      </div>
    )
  }
}
