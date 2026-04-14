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
    // FastAPI returns { detail: "string" } — not { detail: { message: "..." } }
    const msg =
      (typeof err?.detail === 'string' ? err.detail : null) ||
      err?.message ||
      res.statusText
    throw new Error(msg)
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
  userDetail: (id: string) => req<AdminUserDetail>(`/api/v1/admin/users/${id}`),
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
  transactions: (page = 1, status = '', search = '') =>
    req<Paginated<TxItem>>(
      `/api/v1/admin/transactions?page=${page}&status=${status}&search=${encodeURIComponent(search)}`
    ),

  // Risk flags
  riskFlags: () => req<RiskFlag[]>('/api/v1/admin/risk-flags'),

  // Wallets
  wallets: () => req<WalletOverview>('/api/v1/admin/wallets'),

  // Audit logs
  auditLogs: (page = 1, action = '') =>
    req<Paginated<AuditLogItem>>(
      `/api/v1/admin/audit-logs?page=${page}&action=${encodeURIComponent(action)}`
    ),

  // Settings
  platformSettings: () => req<PlatformSettings>('/api/v1/admin/settings'),
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

export interface AdminUserDetail extends AdminUser {
  wallets: {
    currency: string
    balance: number
    available: number
    held: number
    status: string
  }[]
  transaction_count: number
  total_sent_usd: number
  recent_transactions: {
    reference: string
    type: string
    amount: number
    currency: string
    dest_amount: number
    dest_currency: string
    status: string
    date: string
  }[]
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

export interface WalletOverview {
  total_wallets: number
  frozen_wallets: number
  by_currency: {
    currency: string
    wallet_count: number
    total_balance: number
  }[]
  top_usd_wallets: {
    user_email: string
    user_name: string
    balance: number
    available: number
    held: number
    status: string
  }[]
}

export interface AuditLogItem {
  id: number
  user_email: string | null
  admin_id: string | null
  action: string
  resource_type: string | null
  resource_id: string | null
  ip_address: string | null
  created_at: string
}

export interface PlatformSettings {
  platform: {
    environment: string
    app_url: string
    api_url: string
  }
  auth: {
    access_token_ttl_minutes: number
    refresh_token_ttl_days: number
    jwt_algorithm: string
    otp_ttl_minutes: number
    otp_max_attempts: number
  }
  email: {
    from_address: string
    purelymail_configured: boolean
  }
  services: {
    graph_payment_rails: boolean
    dojah_kyc: boolean
    termii_sms: boolean
    sentry_monitoring: boolean
    telegram_alerts: boolean
  }
  cors_origins: string[]
}

export interface Paginated<T> {
  items: T[]
  total: number
  page: number
  pages: number
}
