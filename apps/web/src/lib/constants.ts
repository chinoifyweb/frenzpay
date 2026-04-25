export const APP_NAME = 'Frenz Pay'
export const APP_DESCRIPTION =
  'Get paid globally, withdraw in USDT. Receive payments from anywhere in the world with virtual USD, GBP, and EUR accounts.'
export const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://frenzpay.co'

export const SUPPORTED_CURRENCIES = ['USD', 'GBP', 'EUR'] as const

export const USDT_NETWORKS = [
  {
    id: 'trc20',
    name: 'Tron (TRC-20)',
    fee: 1.0,
    description: 'Cheapest and fastest',
  },
  {
    id: 'erc20',
    name: 'Ethereum (ERC-20)',
    fee: 5.0,
    description: 'Most widely supported',
  },
] as const

export const FEE_STRUCTURE = {
  account_creation: 0,
  incoming_transfer: 0,
  usdt_withdrawal_percentage: 1.5,
  minimum_withdrawal: 10,
  conversion_spread: 0.5,
}

export const KYC_ID_TYPES = [
  { value: 'nin', label: 'National Identity Number (NIN)' },
  { value: 'passport', label: 'International Passport' },
  { value: 'drivers_license', label: "Driver's License" },
  { value: 'voters_card', label: "Voter's Card" },
] as const

export const NAV_ITEMS = {
  public: [
    { label: 'Features', href: '/features' },
    { label: 'Pricing', href: '/pricing' },
    { label: 'About', href: '/about' },
    { label: 'FAQ', href: '/faq' },
  ],
  dashboard: [
    { label: 'Overview', href: '/dashboard', icon: 'LayoutDashboard' },
    { label: 'Accounts', href: '/dashboard/accounts', icon: 'Landmark' },
    { label: 'Wallet', href: '/dashboard/wallet', icon: 'Wallet' },
    { label: 'Send', href: '/dashboard/send', icon: 'Send' },
    { label: 'Convert', href: '/dashboard/convert', icon: 'ArrowLeftRight' },
    { label: 'Activity', href: '/dashboard/activity', icon: 'ArrowUpDown' },
    { label: 'Cards', href: '/dashboard/cards', icon: 'CreditCard' },
    { label: 'Savings', href: '/dashboard/savings', icon: 'PiggyBank' },
    { label: 'Withdraw', href: '/dashboard/withdraw', icon: 'ArrowUpRight' },
    { label: 'KYC', href: '/dashboard/kyc', icon: 'ShieldCheck' },
    { label: 'Security', href: '/dashboard/security', icon: 'KeyRound' },
    { label: 'Settings', href: '/dashboard/settings', icon: 'Settings' },
  ],
  admin: [
    { label: 'Dashboard', href: '/admin', icon: 'LayoutDashboard' },
    { label: 'Users', href: '/admin/users', icon: 'Users' },
    { label: 'KYC Queue', href: '/admin/kyc', icon: 'ShieldCheck' },
    { label: 'Account Requests', href: '/admin/account-requests', icon: 'Landmark' },
    { label: 'Fraud Flags', href: '/admin/flags', icon: 'AlertTriangle' },
    { label: 'Transactions', href: '/admin/transactions', icon: 'ArrowUpDown' },
    { label: 'Withdrawals', href: '/admin/withdrawals', icon: 'ArrowUpRight' },
    { label: 'Providers', href: '/admin/providers', icon: 'Zap' },
    { label: 'Security', href: '/admin/security', icon: 'KeyRound' },
    { label: 'Settings', href: '/admin/settings', icon: 'Settings' },
  ],
}
