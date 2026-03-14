export type Currency = 'USD' | 'GBP' | 'EUR';
export type USDTNetwork = 'TRC-20' | 'ERC-20';
export type TransactionType = 'credit' | 'debit';
export type TransactionStatus = 'pending' | 'completed' | 'failed';
export type WithdrawalStatus = 'pending' | 'processing' | 'completed' | 'failed';
export type KYCStatus = 'not_started' | 'pending' | 'verified' | 'rejected';

export interface User {
  id: string;
  email: string;
  full_name: string;
  phone?: string;
  avatar_url?: string;
  kyc_status: KYCStatus;
  referral_code?: string;
  created_at: string;
}

export interface Wallet {
  id: string;
  user_id: string;
  currency: Currency;
  balance: number;
  available_balance: number;
  is_active: boolean;
}

export interface VirtualAccount {
  id: string;
  user_id: string;
  wallet_id: string;
  currency: Currency;
  account_name: string;
  account_number: string;
  bank_name: string;
  routing_number: string | null;
  sort_code: string | null;
  iban: string | null;
  swift_code: string | null;
  status: 'active' | 'inactive';
}

export interface Transaction {
  id: string;
  user_id: string;
  wallet_id: string;
  type: TransactionType;
  amount: number;
  currency: Currency;
  fee: number;
  net_amount: number;
  description: string;
  reference: string;
  sender_name: string | null;
  status: TransactionStatus;
  created_at: string;
}

export interface Withdrawal {
  id: string;
  amount: number;
  currency: Currency;
  fee: number;
  usdt_amount: number;
  wallet_address: string;
  network: USDTNetwork;
  tx_hash: string | null;
  status: WithdrawalStatus;
  created_at: string;
}

export interface WithdrawalRequest {
  source_currency: Currency;
  amount: number;
  network: USDTNetwork;
  wallet_address: string;
}
