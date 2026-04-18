// User types
export type UserRole = 'user' | 'admin'
export type KYCStatus = 'not_started' | 'pending' | 'verified' | 'rejected'
export type TransactionType = 'credit' | 'debit'
export type TransactionStatus = 'pending' | 'completed' | 'failed'
export type WithdrawalStatus = 'pending' | 'processing' | 'completed' | 'failed'
export type Currency = 'USD' | 'GBP' | 'EUR' | 'NGN'
export type USDTNetwork = 'trc20' | 'erc20'

export interface User {
  id: string
  email: string
  phone: string | null
  full_name: string
  avatar_url: string | null
  role: UserRole
  is_verified: boolean
  is_active: boolean
  kyc_status: KYCStatus
  two_factor_enabled: boolean
  referral_code: string
  referred_by: string | null
  created_at: string
  updated_at: string
}

export interface KYCRecord {
  id: string
  user_id: string
  bvn: string
  id_type: 'passport' | 'nin' | 'drivers_license' | 'voters_card'
  id_number: string
  id_document_url: string
  selfie_url: string
  status: KYCStatus
  reviewed_by: string | null
  rejection_reason: string | null
  submitted_at: string
  reviewed_at: string | null
}

export interface Wallet {
  id: string
  user_id: string
  currency: Currency
  balance: number
  available_balance: number
  ledger_balance: number
  is_active: boolean
  created_at: string
  updated_at: string
}

export interface VirtualAccount {
  id: string
  user_id: string
  wallet_id: string
  currency: Currency
  account_name: string
  account_number: string
  bank_name: string
  routing_number: string | null
  sort_code: string | null
  iban: string | null
  swift_code: string | null
  provider: string
  provider_account_id: string
  status: 'active' | 'inactive' | 'suspended'
  created_at: string
}

export interface Transaction {
  id: string
  user_id: string
  wallet_id: string
  type: TransactionType
  amount: number
  currency: Currency
  fee: number
  net_amount: number
  description: string
  reference: string
  sender_name: string | null
  sender_bank: string | null
  status: TransactionStatus
  provider_reference: string | null
  metadata: Record<string, unknown> | null
  created_at: string
}

export interface Withdrawal {
  id: string
  user_id: string
  wallet_id: string
  amount: number
  currency: Currency
  fee: number
  usdt_amount: number
  usdt_rate: number
  wallet_address: string
  network: USDTNetwork
  tx_hash: string | null
  status: WithdrawalStatus
  reviewed_by: string | null
  created_at: string
  completed_at: string | null
}

export interface Referral {
  id: string
  referrer_id: string
  referred_id: string
  referred_user?: User
  bonus_amount: number
  status: 'pending' | 'credited'
  created_at: string
}

export interface PlatformSettings {
  id: string
  key: string
  value: string
  description: string
  updated_at: string
}

export interface AuditLog {
  id: string
  user_id: string
  action: string
  resource_type: string
  resource_id: string
  ip_address: string
  user_agent: string
  metadata: Record<string, unknown> | null
  created_at: string
}

// Dashboard stats
export interface DashboardStats {
  total_balance_usd: number
  wallets: Wallet[]
  recent_transactions: Transaction[]
  pending_withdrawals: number
}

export interface AdminStats {
  total_users: number
  active_users: number
  total_volume: number
  pending_kyc: number
  pending_withdrawals: number
  revenue_from_fees: number
  new_users_today: number
  new_users_this_week: number
}
