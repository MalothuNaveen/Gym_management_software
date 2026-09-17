/** Shapes returned by the API. Money always arrives as a decimal string. */

export type MemberStatus =
  | 'active'
  | 'expiring_soon'
  | 'expired'
  | 'no_membership'
  | 'archived'

export interface Page<T> {
  items: T[]
  total: number
  page: number
  page_size: number
  pages: number
}

export interface User {
  id: number
  gym_id: number
  full_name: string
  email: string
  phone: string | null
  role: 'owner' | 'admin' | 'staff'
  is_active: boolean
  last_login_at: string | null
}

export interface Plan {
  id: number
  name: string
  price: string
  duration_days: number
  description: string | null
  is_active: boolean
  sort_order: number
  members_using: number
}

export interface Membership {
  id: number
  plan_id: number | null
  plan_name: string
  start_date: string
  end_date: string
  fee: string
  discount: string
  final_amount: string
  status: string
  notes: string | null
  paid: string
  balance: string
  days_remaining: number | null
}

export interface MemberListItem {
  id: number
  member_code: string
  full_name: string
  phone: string
  email: string | null
  has_photo: boolean
  status: MemberStatus
  plan_name: string | null
  end_date: string | null
  days_remaining: number | null
  balance: string
  is_active: boolean
}

export interface MemberDetail {
  id: number
  member_code: string
  full_name: string
  phone: string
  whatsapp: string | null
  email: string | null
  date_of_birth: string | null
  gender: string | null
  address: string | null
  emergency_contact_name: string | null
  emergency_contact_phone: string | null
  notes: string | null
  joined_on: string
  is_active: boolean
  has_photo: boolean
  status: MemberStatus
  current_membership: Membership | null
  days_remaining: number | null
  financials: {
    total_charged: string
    total_paid: string
    balance: string
    credit: string
  }
  attendance: {
    total_visits: number
    this_month: number
    last_visit: string | null
  }
  memberships: Membership[]
}

export interface MemberCreated {
  member: MemberDetail
  receipt_id: number | null
  receipt_no: string | null
  payment_id: number | null
}

export interface Payment {
  id: number
  member_id: number
  member_name: string | null
  member_code: string | null
  membership_id: number | null
  plan_name: string | null
  amount: string
  method: string
  kind: string
  paid_on: string
  notes: string | null
  is_void: boolean
  void_reason: string | null
  receipt_id: number | null
  receipt_no: string | null
}

export interface ReceiptSnapshot {
  receipt_no: string
  issued_on: string
  gym: { name: string; address: string; phone: string; email: string }
  member: { name: string; code: string; phone: string }
  membership: { plan: string; start: string; end: string }
  amounts: {
    fee_text: string
    discount_text: string
    final_amount_text: string
    paid_text: string
    balance_text: string
    credit: string
  }
  payment: { method: string; kind: string; notes: string }
  footer: string
}

export interface Receipt {
  id: number
  receipt_no: string
  issued_on: string
  payment_id: number
  member_id: number | null
  snapshot: ReceiptSnapshot
}

export interface AttendanceRecord {
  id: number
  member_id: number
  member_name: string | null
  member_code: string | null
  attend_date: string
  check_in_at: string
  marked_by: string | null
}

export interface RosterItem {
  member_id: number
  member_code: string
  full_name: string
  phone: string
  has_photo: boolean
  status: MemberStatus
  present: boolean
  check_in_at: string | null
  attendance_id: number | null
}

export interface ExpiringMember {
  member_id: number
  member_code: string
  full_name: string
  phone: string
  whatsapp: string | null
  has_photo: boolean
  plan_name: string | null
  end_date: string
  days_remaining: number
  balance: string
}

export interface Dashboard {
  gym_name: string
  today: string
  members: {
    total: number
    active: number
    expiring_soon: number
    expired: number
    no_membership: number
  }
  money: {
    today_collection: string
    month_collection: string
    pending_payments: string
    month_expenses: string
    month_net: string
  }
  attendance: { today_count: number; active_members: number }
  expiring: ExpiringMember[]
}

export interface SalarySummary {
  period_month: string
  monthly_salary: string
  paid: string
  advance: string
  other: string
  remaining: string
  total_disbursed: string
}

export interface Staff {
  id: number
  full_name: string
  phone: string
  email: string | null
  role: string
  joining_date: string | null
  monthly_salary: string
  status: string
  notes: string | null
  has_photo: boolean
  salary: SalarySummary | null
}

export interface SalaryRecord {
  id: number
  staff_id: number
  staff_name: string | null
  period_month: string
  kind: string
  amount: string
  paid_on: string
  method: string | null
  notes: string | null
  created_at: string | null
}

export interface StaffDetail extends Staff {
  salary_records: SalaryRecord[]
}

export interface Expense {
  id: number
  expense_date: string
  category: string
  amount: string
  description: string | null
  method: string | null
}

export interface GymSettings {
  gym_id: number
  name: string
  address: string | null
  phone: string | null
  email: string | null
  whatsapp_number: string | null
  has_logo: boolean
  currency: string
  timezone: string
  receipt_footer: string
  default_plan_id: number | null
  expiring_soon_days: number
  open_time: string | null
  close_time: string | null
  member_code_prefix: string
  receipt_prefix: string
}

export interface MonthlySummary {
  month: string
  period_start: string
  period_end: string
  total_members: number
  new_members: number
  renewals: number
  active_members: number
  expired_members: number
  total_revenue: string
  total_expenses: string
  staff_salary_paid: string
  pending_payments: string
  attendance_count: number
  net_amount: string
}
