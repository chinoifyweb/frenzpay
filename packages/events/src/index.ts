// Domain event type definitions — no runtime code, interfaces only.

// ─── Event type string literals ─────────────────────────────────────────────

export const EventType = {
  // User events
  USER_SIGNED_UP: 'user.signed_up',
  USER_EMAIL_VERIFIED: 'user.email_verified',
  USER_PHONE_VERIFIED: 'user.phone_verified',
  USER_KYC_TIER_UPGRADED: 'user.kyc_tier_upgraded',
  USER_FROZEN: 'user.frozen',

  // Transaction events
  TRANSACTION_POSTED: 'transaction.posted',
  DEPOSIT_RECEIVED: 'deposit.received',
  P2P_SENT: 'p2p.sent',
  WITHDRAWAL_INITIATED: 'withdrawal.initiated',
  WITHDRAWAL_SETTLED: 'withdrawal.settled',
  WITHDRAWAL_FAILED: 'withdrawal.failed',

  // Card events
  CARD_ISSUED: 'card.issued',
  CARD_AUTH_CREATED: 'card.auth_created',
  CARD_AUTH_CLEARED: 'card.auth_cleared',
  CARD_AUTH_REVERSED: 'card.auth_reversed',

  // Savings events
  SAVINGS_LOCK_CREATED: 'savings_lock.created',
  SAVINGS_LOCK_MATURED: 'savings_lock.matured',
  SAVINGS_LOCK_BROKEN: 'savings_lock.broken',

  // Invoice / payment link events
  INVOICE_PAID: 'invoice.paid',
  PAYMENT_LINK_VISITED: 'payment_link.visited',
} as const;

export type EventTypeValue = (typeof EventType)[keyof typeof EventType];

// ─── Base event shape ────────────────────────────────────────────────────────

interface BaseEvent {
  timestamp: string; // ISO 8601
  userId?: string;
}

// ─── User events ─────────────────────────────────────────────────────────────

export interface UserSignedUp extends BaseEvent {
  type: typeof EventType.USER_SIGNED_UP;
  email: string;
  phone?: string;
}

export interface UserEmailVerified extends BaseEvent {
  type: typeof EventType.USER_EMAIL_VERIFIED;
  email: string;
}

export interface UserPhoneVerified extends BaseEvent {
  type: typeof EventType.USER_PHONE_VERIFIED;
  phone: string;
}

export interface UserKycTierUpgraded extends BaseEvent {
  type: typeof EventType.USER_KYC_TIER_UPGRADED;
  previousTier: string;
  newTier: string;
}

export interface UserFrozen extends BaseEvent {
  type: typeof EventType.USER_FROZEN;
  reason: string;
  frozenBy: string;
}

// ─── Transaction events ───────────────────────────────────────────────────────

export interface TransactionPosted extends BaseEvent {
  type: typeof EventType.TRANSACTION_POSTED;
  transactionId: string;
  amount: string;
  currency: string;
  direction: 'credit' | 'debit';
  reference: string;
}

export interface DepositReceived extends BaseEvent {
  type: typeof EventType.DEPOSIT_RECEIVED;
  transactionId: string;
  amount: string;
  currency: string;
  source: string;
  reference: string;
}

export interface P2PSent extends BaseEvent {
  type: typeof EventType.P2P_SENT;
  transactionId: string;
  amount: string;
  currency: string;
  recipientUserId: string;
  reference: string;
}

export interface WithdrawalInitiated extends BaseEvent {
  type: typeof EventType.WITHDRAWAL_INITIATED;
  withdrawalId: string;
  amount: string;
  currency: string;
  bankCode: string;
  accountNumber: string;
  reference: string;
}

export interface WithdrawalSettled extends BaseEvent {
  type: typeof EventType.WITHDRAWAL_SETTLED;
  withdrawalId: string;
  externalReference: string;
}

export interface WithdrawalFailed extends BaseEvent {
  type: typeof EventType.WITHDRAWAL_FAILED;
  withdrawalId: string;
  reason: string;
}

// ─── Card events ─────────────────────────────────────────────────────────────

export interface CardIssued extends BaseEvent {
  type: typeof EventType.CARD_ISSUED;
  cardId: string;
  last4: string;
  currency: string;
}

export interface CardAuthCreated extends BaseEvent {
  type: typeof EventType.CARD_AUTH_CREATED;
  authId: string;
  cardId: string;
  amount: string;
  currency: string;
  merchantName: string;
}

export interface CardAuthCleared extends BaseEvent {
  type: typeof EventType.CARD_AUTH_CLEARED;
  authId: string;
  cardId: string;
  settledAmount: string;
  currency: string;
}

export interface CardAuthReversed extends BaseEvent {
  type: typeof EventType.CARD_AUTH_REVERSED;
  authId: string;
  cardId: string;
  reason: string;
}

// ─── Savings events ───────────────────────────────────────────────────────────

export interface SavingsLockCreated extends BaseEvent {
  type: typeof EventType.SAVINGS_LOCK_CREATED;
  lockId: string;
  amount: string;
  currency: string;
  maturityDate: string;
}

export interface SavingsLockMatured extends BaseEvent {
  type: typeof EventType.SAVINGS_LOCK_MATURED;
  lockId: string;
  principalAmount: string;
  interestAmount: string;
  currency: string;
}

export interface SavingsLockBroken extends BaseEvent {
  type: typeof EventType.SAVINGS_LOCK_BROKEN;
  lockId: string;
  penaltyAmount: string;
  currency: string;
  reason: string;
}

// ─── Invoice / payment link events ───────────────────────────────────────────

export interface InvoicePaid extends BaseEvent {
  type: typeof EventType.INVOICE_PAID;
  invoiceId: string;
  amount: string;
  currency: string;
  payerReference: string;
}

export interface PaymentLinkVisited extends BaseEvent {
  type: typeof EventType.PAYMENT_LINK_VISITED;
  linkId: string;
  ipAddress?: string;
  userAgent?: string;
}

// ─── Union type ───────────────────────────────────────────────────────────────

export type DomainEvent =
  | UserSignedUp
  | UserEmailVerified
  | UserPhoneVerified
  | UserKycTierUpgraded
  | UserFrozen
  | TransactionPosted
  | DepositReceived
  | P2PSent
  | WithdrawalInitiated
  | WithdrawalSettled
  | WithdrawalFailed
  | CardIssued
  | CardAuthCreated
  | CardAuthCleared
  | CardAuthReversed
  | SavingsLockCreated
  | SavingsLockMatured
  | SavingsLockBroken
  | InvoicePaid
  | PaymentLinkVisited;
