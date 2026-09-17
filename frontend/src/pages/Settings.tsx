import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'

import { PageHeader } from '@/components/layout/AppShell'
import { Button } from '@/components/ui/Button'
import {
  Badge, Card, CardHeader, ErrorState, LoadingRows,
} from '@/components/ui/Data'
import {
  FormGrid, Input, Select, Textarea,
} from '@/components/ui/Field'
import { Modal } from '@/components/ui/Overlay'
import { PhotoCapture } from '@/components/ui/PhotoCapture'
import { invalidatePhoto } from '@/components/ui/Avatar'
import { api, errorMessage } from '@/lib/api'
import { useAuth } from '@/lib/auth'
import { useToast } from '@/lib/toast'
import type { GymSettings, User } from '@/lib/types'

const TIMEZONES = [
  { value: 'Asia/Kolkata', label: 'India (Asia/Kolkata)' },
  { value: 'Asia/Dubai', label: 'Dubai (Asia/Dubai)' },
  { value: 'Asia/Kathmandu', label: 'Nepal (Asia/Kathmandu)' },
  { value: 'Asia/Colombo', label: 'Sri Lanka (Asia/Colombo)' },
  { value: 'UTC', label: 'UTC' },
]

export function SettingsPage() {
  const { isAdmin, user } = useAuth()
  const toast = useToast()
  const queryClient = useQueryClient()

  const [form, setForm] = useState<Partial<GymSettings> | null>(null)
  const [showPassword, setShowPassword] = useState(false)
  const [showStaffLogins, setShowStaffLogins] = useState(false)
  const [logo, setLogo] = useState<File | null>(null)

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['settings'],
    queryFn: () => api.get<GymSettings>('/settings'),
  })

  const current = { ...(data ?? {}), ...(form ?? {}) } as GymSettings
  const dirty = form !== null && Object.keys(form).length > 0

  const save = useMutation({
    mutationFn: () => api.put<GymSettings>('/settings', form ?? {}),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['settings'] })
      await queryClient.invalidateQueries({ queryKey: ['dashboard'] })
      setForm(null)
      toast.success('Settings saved.')
    },
    onError: (caught) => toast.error(errorMessage(caught)),
  })

  const uploadLogo = useMutation({
    mutationFn: async () => {
      if (!logo) {
        await api.delete('/settings/logo')
        return
      }
      const formData = new FormData()
      formData.append('file', logo)
      await api.upload('/settings/logo', formData)
    },
    onSuccess: async () => {
      invalidatePhoto('/settings/logo')
      await queryClient.invalidateQueries({ queryKey: ['settings'] })
      toast.success(logo ? 'Logo updated.' : 'Logo removed.')
      setLogo(null)
    },
    onError: (caught) => toast.error(errorMessage(caught)),
  })

  function update(patch: Partial<GymSettings>) {
    setForm({ ...(form ?? {}), ...patch })
  }

  if (isError) {
    return (
      <Card padded={false}>
        <ErrorState message={errorMessage(error)} onRetry={() => void refetch()} />
      </Card>
    )
  }

  if (isLoading || !data) {
    return (
      <Card padded={false}>
        <LoadingRows count={5} />
      </Card>
    )
  }

  return (
    <>
      <PageHeader
        title="Settings"
        subtitle={isAdmin ? undefined : 'Only the owner can change these.'}
        actions={
          isAdmin && dirty ? (
            <>
              <Button variant="secondary" onClick={() => setForm(null)}>
                Discard
              </Button>
              <Button
                onClick={() => save.mutate()}
                loading={save.isPending}
                loadingText="Saving…"
              >
                Save Changes
              </Button>
            </>
          ) : undefined
        }
      />

      <div className="space-y-4">
        <Card>
          <CardHeader title="Gym Details" subtitle="These appear on every receipt." />
          <div className="space-y-4">
            <Input
              label="Gym Name"
              value={current.name ?? ''}
              disabled={!isAdmin}
              onChange={(e) => update({ name: e.target.value })}
            />
            <Textarea
              label="Address"
              rows={2}
              value={current.address ?? ''}
              disabled={!isAdmin}
              onChange={(e) => update({ address: e.target.value })}
            />
            <FormGrid>
              <Input
                label="Phone"
                type="tel"
                inputMode="tel"
                value={current.phone ?? ''}
                disabled={!isAdmin}
                onChange={(e) => update({ phone: e.target.value })}
              />
              <Input
                label="WhatsApp Number"
                type="tel"
                inputMode="tel"
                value={current.whatsapp_number ?? ''}
                disabled={!isAdmin}
                onChange={(e) => update({ whatsapp_number: e.target.value })}
              />
            </FormGrid>
            <Input
              label="Email"
              type="email"
              inputMode="email"
              autoCapitalize="none"
              value={current.email ?? ''}
              disabled={!isAdmin}
              onChange={(e) => update({ email: e.target.value })}
            />
          </div>
        </Card>

        {isAdmin && (
          <Card>
            <CardHeader title="Logo" subtitle="Printed at the top of every receipt." />
            <PhotoCapture
              onSelect={setLogo}
              label=""
              currentUrl={undefined}
              disabled={uploadLogo.isPending}
            />
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <Button
                size="sm"
                onClick={() => uploadLogo.mutate()}
                loading={uploadLogo.isPending}
                loadingText="Uploading…"
                disabled={!logo && !data.has_logo}
              >
                {logo ? 'Save Logo' : 'Remove Logo'}
              </Button>
              {data.has_logo && !logo && <Badge tone="success">Logo set</Badge>}
            </div>
          </Card>
        )}

        <Card>
          <CardHeader title="Receipts & Memberships" />
          <div className="space-y-4">
            <Textarea
              label="Receipt Footer"
              rows={2}
              value={current.receipt_footer ?? ''}
              disabled={!isAdmin}
              onChange={(e) => update({ receipt_footer: e.target.value })}
              hint="The thank-you line at the bottom of each receipt."
            />
            <FormGrid>
              <Input
                label="Expiring Soon Window (days)"
                type="number"
                inputMode="numeric"
                min={1}
                max={90}
                value={String(current.expiring_soon_days ?? 7)}
                disabled={!isAdmin}
                onChange={(e) => update({ expiring_soon_days: Number(e.target.value) })}
                hint="How far ahead the dashboard warns you."
              />
              <Select
                label="Timezone"
                options={TIMEZONES}
                value={current.timezone ?? 'Asia/Kolkata'}
                disabled={!isAdmin}
                onChange={(e) => update({ timezone: e.target.value })}
                hint="Used for today's date, attendance and collections."
              />
            </FormGrid>
            <FormGrid>
              <Input
                label="Member ID Prefix"
                value={current.member_code_prefix ?? 'GYM'}
                disabled={!isAdmin}
                onChange={(e) => update({ member_code_prefix: e.target.value })}
                hint="e.g. GYM gives GYM-0001. Existing IDs never change."
              />
              <Input
                label="Receipt Prefix"
                value={current.receipt_prefix ?? 'REC'}
                disabled={!isAdmin}
                onChange={(e) => update({ receipt_prefix: e.target.value })}
                hint="e.g. REC gives REC-2026-0001."
              />
            </FormGrid>
            <FormGrid>
              <Input
                label="Opening Time"
                type="time"
                value={current.open_time?.slice(0, 5) ?? ''}
                disabled={!isAdmin}
                onChange={(e) => update({ open_time: e.target.value })}
              />
              <Input
                label="Closing Time"
                type="time"
                value={current.close_time?.slice(0, 5) ?? ''}
                disabled={!isAdmin}
                onChange={(e) => update({ close_time: e.target.value })}
              />
            </FormGrid>
          </div>
        </Card>

        <Card>
          <CardHeader title="Your Account" subtitle={user?.email} />
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" onClick={() => setShowPassword(true)}>
              Change Password
            </Button>
            {isAdmin && (
              <Button variant="secondary" onClick={() => setShowStaffLogins(true)}>
                Staff Logins
              </Button>
            )}
          </div>
        </Card>

        {/* Repeat the save control at the bottom: on a phone the header has
            scrolled well out of sight by the time the form is filled in. */}
        {isAdmin && dirty && (
          <div className="sticky bottom-20 z-20 rounded-xl border border-ink-200 bg-white/95 p-3 backdrop-blur lg:bottom-4">
            <div className="flex gap-3">
              <Button variant="secondary" onClick={() => setForm(null)} className="flex-1">
                Discard
              </Button>
              <Button
                onClick={() => save.mutate()}
                loading={save.isPending}
                loadingText="Saving…"
                className="flex-1"
              >
                Save Changes
              </Button>
            </div>
          </div>
        )}
      </div>

      <PasswordDialog open={showPassword} onClose={() => setShowPassword(false)} />
      <StaffLoginsDialog
        open={showStaffLogins}
        onClose={() => setShowStaffLogins(false)}
      />
    </>
  )
}

function PasswordDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const toast = useToast()
  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const [confirm, setConfirm] = useState('')
  const [errors, setErrors] = useState<Record<string, string>>({})

  const mutation = useMutation({
    mutationFn: () =>
      api.post('/auth/change-password', {
        current_password: current,
        new_password: next,
      }),
    onSuccess: () => {
      toast.success('Password updated.')
      close()
    },
    onError: (caught) => toast.error(errorMessage(caught)),
  })

  function close() {
    setCurrent('')
    setNext('')
    setConfirm('')
    setErrors({})
    onClose()
  }

  function save() {
    const found: Record<string, string> = {}
    if (!current) found.current = 'Please enter your current password.'
    if (next.length < 8) found.next = 'Use at least 8 characters.'
    if (next !== confirm) found.confirm = 'The two passwords do not match.'
    setErrors(found)
    if (Object.keys(found).length === 0) mutation.mutate()
  }

  return (
    <Modal
      open={open}
      onClose={() => !mutation.isPending && close()}
      title="Change Password"
      size="sm"
      footer={
        <>
          <Button variant="secondary" onClick={close} disabled={mutation.isPending}
            fullWidth className="sm:w-auto">
            Cancel
          </Button>
          <Button onClick={save} loading={mutation.isPending} loadingText="Saving…"
            fullWidth className="sm:w-auto">
            Update Password
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Input
          label="Current Password"
          type="password"
          autoComplete="current-password"
          value={current}
          onChange={(e) => setCurrent(e.target.value)}
          error={errors.current}
        />
        <Input
          label="New Password"
          type="password"
          autoComplete="new-password"
          value={next}
          onChange={(e) => setNext(e.target.value)}
          error={errors.next}
          hint="At least 8 characters."
        />
        <Input
          label="Confirm New Password"
          type="password"
          autoComplete="new-password"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          error={errors.confirm}
        />
      </div>
    </Modal>
  )
}

function StaffLoginsDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const toast = useToast()
  const queryClient = useQueryClient()
  const { user } = useAuth()
  const [adding, setAdding] = useState(false)
  const [form, setForm] = useState({
    full_name: '', email: '', password: '', role: 'staff',
  })
  const [errors, setErrors] = useState<Record<string, string>>({})

  const { data: users = [] } = useQuery({
    queryKey: ['users'],
    queryFn: () => api.get<User[]>('/auth/users'),
    enabled: open,
  })

  const create = useMutation({
    mutationFn: () => api.post('/auth/users', form),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['users'] })
      toast.success('Staff login created.')
      setAdding(false)
      setForm({ full_name: '', email: '', password: '', role: 'staff' })
    },
    onError: (caught) => toast.error(errorMessage(caught)),
  })

  const toggle = useMutation({
    mutationFn: ({ id, active }: { id: number; active: boolean }) =>
      api.patch(`/auth/users/${id}/status?is_active=${active}`),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['users'] })
      toast.success('Account updated.')
    },
    onError: (caught) => toast.error(errorMessage(caught)),
  })

  function save() {
    const found: Record<string, string> = {}
    if (form.full_name.trim().length < 2) found.full_name = 'Please enter a name.'
    if (!/^\S+@\S+\.\S+$/.test(form.email)) found.email = 'Please enter a valid email.'
    if (form.password.length < 8) found.password = 'Use at least 8 characters.'
    setErrors(found)
    if (Object.keys(found).length === 0) create.mutate()
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Staff Logins"
      description="People who can sign in to this system"
      footer={
        <Button variant="secondary" onClick={onClose} fullWidth className="sm:w-auto">
          Close
        </Button>
      }
    >
      <ul className="divide-y divide-ink-100">
        {users.map((account) => (
          <li key={account.id} className="flex items-center justify-between gap-3 py-3">
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-ink-900">
                {account.full_name}
              </p>
              <p className="truncate text-xs text-ink-500">{account.email}</p>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <Badge tone={account.role === 'owner' ? 'info' : 'neutral'}>
                {account.role}
              </Badge>
              {account.id !== user?.id && (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() =>
                    toggle.mutate({ id: account.id, active: !account.is_active })
                  }
                >
                  {account.is_active ? 'Disable' : 'Enable'}
                </Button>
              )}
            </div>
          </li>
        ))}
      </ul>

      {adding ? (
        <div className="mt-4 space-y-4 border-t border-ink-200 pt-4">
          <Input
            label="Full Name"
            value={form.full_name}
            onChange={(e) => setForm({ ...form, full_name: e.target.value })}
            error={errors.full_name}
          />
          <Input
            label="Email"
            type="email"
            autoCapitalize="none"
            value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
            error={errors.email}
          />
          <Input
            label="Password"
            type="password"
            value={form.password}
            onChange={(e) => setForm({ ...form, password: e.target.value })}
            error={errors.password}
            hint="At least 8 characters. Share it with them directly."
          />
          <Select
            label="Role"
            options={[
              { value: 'staff', label: 'Staff — day-to-day work' },
              { value: 'admin', label: 'Admin — can also change settings' },
            ]}
            value={form.role}
            onChange={(e) => setForm({ ...form, role: e.target.value })}
          />
          <div className="flex gap-2">
            <Button variant="secondary" onClick={() => setAdding(false)} className="flex-1">
              Cancel
            </Button>
            <Button
              onClick={save}
              loading={create.isPending}
              loadingText="Creating…"
              className="flex-1"
            >
              Create Login
            </Button>
          </div>
        </div>
      ) : (
        <Button variant="secondary" className="mt-4" fullWidth onClick={() => setAdding(true)}>
          Add Staff Login
        </Button>
      )}
    </Modal>
  )
}
