import { VirtualAccount, Transaction, Wallet, Withdrawal } from './types';

export const mockWallets: Wallet[] = [
  { id: '1', user_id: 'u1', currency: 'USD', balance: 12450.00, available_balance: 12450.00, is_active: true },
  { id: '2', user_id: 'u1', currency: 'GBP', balance: 3820.50, available_balance: 3820.50, is_active: true },
  { id: '3', user_id: 'u1', currency: 'EUR', balance: 7195.30, available_balance: 7195.30, is_active: true },
];

export const mockAccounts: VirtualAccount[] = [
  {
    id: '1', user_id: 'u1', wallet_id: '1', currency: 'USD',
    account_name: 'Frenz Pay - John Doe', account_number: '9801234567',
    bank_name: 'Bridge Bank (via Payoneer)', routing_number: '084009519',
    sort_code: null, iban: null, swift_code: 'ABORUSXX', status: 'active',
  },
  {
    id: '2', user_id: 'u1', wallet_id: '2', currency: 'GBP',
    account_name: 'Frenz Pay - John Doe', account_number: '12345678',
    bank_name: 'ClearBank', routing_number: null,
    sort_code: '04-00-75', iban: 'GB29CLBK04007512345678', swift_code: 'CLBKGB22', status: 'active',
  },
  {
    id: '3', user_id: 'u1', wallet_id: '3', currency: 'EUR',
    account_name: 'Frenz Pay - John Doe', account_number: '7654321098',
    bank_name: 'Banking Circle', routing_number: null,
    sort_code: null, iban: 'DE89370400440532013000', swift_code: 'BKCIGB2L', status: 'active',
  },
];

export const mockTransactions: Transaction[] = [
  {
    id: 't1', user_id: 'u1', wallet_id: '1', type: 'credit', amount: 2500.00,
    currency: 'USD', fee: 0, net_amount: 2500.00, description: 'Payment from Upwork',
    reference: 'TXN-001', sender_name: 'Upwork Inc.', status: 'completed',
    created_at: '2026-03-14T10:30:00Z',
  },
  {
    id: 't2', user_id: 'u1', wallet_id: '1', type: 'debit', amount: 1000.00,
    currency: 'USD', fee: 5.00, net_amount: 995.00, description: 'USDT Withdrawal',
    reference: 'TXN-002', sender_name: null, status: 'completed',
    created_at: '2026-03-13T14:22:00Z',
  },
  {
    id: 't3', user_id: 'u1', wallet_id: '2', type: 'credit', amount: 1800.00,
    currency: 'GBP', fee: 0, net_amount: 1800.00, description: 'Payment from Toptal',
    reference: 'TXN-003', sender_name: 'Toptal LLC', status: 'completed',
    created_at: '2026-03-12T09:15:00Z',
  },
  {
    id: 't4', user_id: 'u1', wallet_id: '3', type: 'credit', amount: 3200.00,
    currency: 'EUR', fee: 0, net_amount: 3200.00, description: 'Invoice #4521 - Design Work',
    reference: 'TXN-004', sender_name: 'Berlin Digital GmbH', status: 'completed',
    created_at: '2026-03-11T16:45:00Z',
  },
  {
    id: 't5', user_id: 'u1', wallet_id: '1', type: 'debit', amount: 500.00,
    currency: 'USD', fee: 5.00, net_amount: 495.00, description: 'USDT Withdrawal',
    reference: 'TXN-005', sender_name: null, status: 'pending',
    created_at: '2026-03-10T11:00:00Z',
  },
  {
    id: 't6', user_id: 'u1', wallet_id: '2', type: 'credit', amount: 750.00,
    currency: 'GBP', fee: 0, net_amount: 750.00, description: 'Payment from Fiverr',
    reference: 'TXN-006', sender_name: 'Fiverr Int.', status: 'completed',
    created_at: '2026-03-09T08:30:00Z',
  },
  {
    id: 't7', user_id: 'u1', wallet_id: '3', type: 'debit', amount: 2000.00,
    currency: 'EUR', fee: 8.00, net_amount: 1992.00, description: 'USDT Withdrawal',
    reference: 'TXN-007', sender_name: null, status: 'completed',
    created_at: '2026-03-08T13:20:00Z',
  },
  {
    id: 't8', user_id: 'u1', wallet_id: '1', type: 'credit', amount: 4200.00,
    currency: 'USD', fee: 0, net_amount: 4200.00, description: 'Payment from Deel',
    reference: 'TXN-008', sender_name: 'Deel Technologies', status: 'completed',
    created_at: '2026-03-07T10:00:00Z',
  },
];

export const mockWithdrawals: Withdrawal[] = [
  {
    id: 'w1', amount: 1000.00, currency: 'USD', fee: 5.00, usdt_amount: 995.00,
    wallet_address: 'TN7gE3LiMf...kR9z4', network: 'TRC-20',
    tx_hash: '0xabc123...def456', status: 'completed', created_at: '2026-03-13T14:22:00Z',
  },
  {
    id: 'w2', amount: 500.00, currency: 'USD', fee: 5.00, usdt_amount: 495.00,
    wallet_address: 'TN7gE3LiMf...kR9z4', network: 'TRC-20',
    tx_hash: null, status: 'pending', created_at: '2026-03-10T11:00:00Z',
  },
];
