import Cookies from 'js-cookie'

const API = process.env.NEXT_PUBLIC_API_URL || 'https://api.frenzpay.co'

function token() {
  return Cookies.get('admin_token') || ''
}

async function req<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token()}`,
      ...(init.headers ?? {}),
    },
  })
  if (res.status === 401) {
    Cookies.remove('admin_token')
    window.location.href = '/login'
  }
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err?.detail?.message || err?.message || res.statusText)
  }
  return res.json()
}

export const api = {
  // Auth
  login: (email: string, password: string) =>
    req<{ access_token: string }>('/api/v1/admin/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    }),

  // Stats
  stats: () => req<AdminStats>('/api/v1/admin/stats'),

  // Users
  users: (page = 1, search = '', role = '') =>
    req<Paginated<AdminUser>>(
      `/api/v1/admin/users?page=${page}&search=${encodeURIComponent(search)}&role=${role}`
    ),
  freezeUser: (id: string) =>
    req(`/api/v1/admin/users/${id}/freeze`, { method: 'POST' }),
  activateUser: (id: string) =>
    req(`/api/v1/admin/users/${id}/activate`, { method: 'POST' }),

  // KYC
  kycQueue: (page = 1) =>
    req<Paginated<KYCItem>>(`/api/v1/admin/kyc/queue?page=${page}`),
  approveKyc: (id: string) =>
    req(`/api/v1/admin/kyc/${id}/approve`, { method: 'POST' }),
  rejectKyc: (id: string, reason: string) =>
    req(`/api/v1/admin/kyc/${id}/reject`, {
      method: 'POST',
      body: JSON.stringify({ reason }),
    }),

  // Transactions
  transactions: (page = 1, status = '') =>
    req<Paginated<TxItem>>(
      `/api/v1/admin/transactions?page=${page}&status=${status}`
    ),

  // Risk flags
  riskFlags: () => req<RiskFlag[]>('/api/v1/admin/risk-flags'),
}

// ── Types ────────────────────────────────────────────────────────────────────

export interface AdminStats {
  total_users: number
  active_users: number
  kyc_pending: number
  transactions_today: number
  revenue_today: number
  revenue_month: number
  daily_signups: { date: string; count: number }[]
  daily_revenue: { date: string; amount: number }[]
}

export interface AdminUser {
  id: string
  email: string
  phone: string
  first_name: string
  last_name: string
  kyc_tier: string
  kyc_status: string
  account_status: string
  country: string
  created_at: string
}

export interface KYCItem {
  id: string
  user_id: string
  user_email: string
  user_name: string
  tier: string
  status: string
  submitted_at: string
  provider: string
}

export interface TxItem {
  id: string
  reference: string
  user_email: string
  type: string
  status: string
  source_amount: number
  source_currency: string
  destination_amount: number
  destination_currency: string
  initiated_at: string
}

export interface RiskFlag {
  id: string
  user_email: string
  flag_type: string
  severity: string
  status: string
  created_at: string
}

export interface Paginated<T> {
  items: T[]
  total: number
  page: number
  pages: number
}
