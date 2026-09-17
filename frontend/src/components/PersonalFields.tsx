/** The member's personal details, shared by Add Member and Edit Member. */
import { DateInput, FormGrid, Input, Select, Textarea } from '@/components/ui/Field'
import { todayInput } from '@/lib/format'

export interface PersonalState {
  full_name: string
  phone: string
  whatsapp: string
  email: string
  date_of_birth: string
  gender: string
  address: string
  emergency_contact_name: string
  emergency_contact_phone: string
  notes: string
}

export const EMPTY_PERSONAL: PersonalState = {
  full_name: '', phone: '', whatsapp: '', email: '', date_of_birth: '',
  gender: '', address: '', emergency_contact_name: '',
  emergency_contact_phone: '', notes: '',
}

/** Validation the owner sees before anything is sent. */
export function validatePersonal(
  personal: PersonalState,
): Record<string, string> {
  const errors: Record<string, string> = {}

  if (personal.full_name.trim().length < 2) {
    errors.full_name = 'Please enter the member’s full name.'
  }
  if (personal.phone.replace(/\D/g, '').length < 10) {
    errors.phone = 'Please enter a 10-digit mobile number.'
  }
  if (personal.email && !/^\S+@\S+\.\S+$/.test(personal.email)) {
    errors.email = 'Please enter a valid email address.'
  }
  if (personal.date_of_birth && personal.date_of_birth > todayInput()) {
    errors.date_of_birth = 'The date of birth cannot be in the future.'
  }
  return errors
}

export function toPersonalPayload(personal: PersonalState): Record<string, unknown> {
  return {
    full_name: personal.full_name.trim(),
    phone: personal.phone,
    whatsapp: personal.whatsapp || null,
    email: personal.email || null,
    date_of_birth: personal.date_of_birth || null,
    gender: personal.gender || null,
    address: personal.address || null,
    emergency_contact_name: personal.emergency_contact_name || null,
    emergency_contact_phone: personal.emergency_contact_phone || null,
    notes: personal.notes || null,
  }
}

export function PersonalFields({
  value, onChange, errors = {}, autoFocus, compact,
}: {
  value: PersonalState
  onChange: (next: PersonalState) => void
  errors?: Record<string, string>
  autoFocus?: boolean
  /** Hides the fields that are rarely edited after sign-up. */
  compact?: boolean
}) {
  const update = (patch: Partial<PersonalState>) => onChange({ ...value, ...patch })

  return (
    <div className="space-y-4">
      <FormGrid>
        <Input
          label="Full Name"
          required
          autoFocus={autoFocus}
          autoComplete="name"
          value={value.full_name}
          onChange={(e) => update({ full_name: e.target.value })}
          error={errors.full_name}
          placeholder="Rahul Kumar"
        />
        <Input
          label="Mobile Number"
          required
          type="tel"
          inputMode="tel"
          autoComplete="tel"
          value={value.phone}
          onChange={(e) => update({ phone: e.target.value })}
          error={errors.phone}
          placeholder="98765 43210"
        />
      </FormGrid>

      <FormGrid>
        <Input
          label="WhatsApp Number"
          type="tel"
          inputMode="tel"
          value={value.whatsapp}
          onChange={(e) => update({ whatsapp: e.target.value })}
          hint="Leave empty to use the mobile number."
        />
        <Input
          label="Email"
          type="email"
          inputMode="email"
          autoCapitalize="none"
          value={value.email}
          onChange={(e) => update({ email: e.target.value })}
          error={errors.email}
        />
      </FormGrid>

      <FormGrid>
        <DateInput
          label="Date of Birth"
          max={todayInput()}
          value={value.date_of_birth}
          onChange={(e) => update({ date_of_birth: e.target.value })}
          error={errors.date_of_birth}
        />
        <Select
          label="Gender"
          placeholder="Not specified"
          options={[
            { value: 'male', label: 'Male' },
            { value: 'female', label: 'Female' },
            { value: 'other', label: 'Other' },
          ]}
          value={value.gender}
          onChange={(e) => update({ gender: e.target.value })}
        />
      </FormGrid>

      <Textarea
        label="Address"
        rows={2}
        value={value.address}
        onChange={(e) => update({ address: e.target.value })}
      />

      <FormGrid>
        <Input
          label="Emergency Contact Name"
          value={value.emergency_contact_name}
          onChange={(e) => update({ emergency_contact_name: e.target.value })}
        />
        <Input
          label="Emergency Contact Number"
          type="tel"
          inputMode="tel"
          value={value.emergency_contact_phone}
          onChange={(e) => update({ emergency_contact_phone: e.target.value })}
        />
      </FormGrid>

      {!compact && (
        <Textarea
          label="Notes"
          rows={2}
          value={value.notes}
          onChange={(e) => update({ notes: e.target.value })}
          placeholder="Anything useful to remember about this member"
        />
      )}
    </div>
  )
}
