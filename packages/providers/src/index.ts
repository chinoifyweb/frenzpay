// Supporting types

export interface KycData {
  firstName: string;
  lastName: string;
  dateOfBirth: string;
  address: string;
  country: string;
  idType: string;
  idNumber: string;
  bvn?: string;
}

export interface VirtualAccountResult {
  accountNumber: string;
  bankName: string;
  bankCode: string;
  currency: string;
  reference: string;
}

export type CustomerStatus = 'pending' | 'active' | 'suspended' | 'closed';

export interface CardResult {
  cardId: string;
  last4: string;
  expiryMonth: string;
  expiryYear: string;
  brand: string;
  currency: string;
  status: 'active' | 'inactive' | 'frozen';
}

export interface ExternalTransaction {
  id: string;
  amount: number;
  currency: string;
  type: 'credit' | 'debit';
  description: string;
  reference: string;
  status: 'pending' | 'successful' | 'failed';
  createdAt: Date;
}

export interface AccountResolution {
  accountNumber: string;
  accountName: string;
  bankCode: string;
  bankName: string;
}

export interface Bank {
  name: string;
  code: string;
  country: string;
  currency: string;
}

export interface PayoutRequest {
  amount: number;
  currency: string;
  bankCode: string;
  accountNumber: string;
  accountName: string;
  narration: string;
  reference: string;
}

export type PayoutStatus = 'pending' | 'processing' | 'successful' | 'failed' | 'reversed';

export interface FxQuote {
  from: string;
  to: string;
  rate: number;
  inverseRate: number;
  expiresAt: Date;
}

export interface VerificationResult {
  verified: boolean;
  reference: string;
  message: string;
  data?: Record<string, unknown>;
}

// Provider interfaces

export interface BaaSProvider {
  createCustomer(kycData: KycData): Promise<string>;
  createVirtualAccount(customerId: string, currency: string): Promise<VirtualAccountResult>;
  getCustomerStatus(customerId: string): Promise<CustomerStatus>;
  issueCard(customerId: string): Promise<CardResult>;
  freezeCard(cardId: string): Promise<void>;
  listTransactions(customerId: string, since: Date): Promise<ExternalTransaction[]>;
}

export interface PayoutProvider {
  resolveAccount(bankCode: string, accountNumber: string): Promise<AccountResolution>;
  listBanks(country: string): Promise<Bank[]>;
  initiatePayout(request: PayoutRequest): Promise<string>;
  getPayoutStatus(externalId: string): Promise<PayoutStatus>;
}

export interface FxProvider {
  getRate(from: string, to: string): Promise<FxQuote>;
}

export interface KYCProvider {
  submitBvnVerification(bvn: string, userId: string): Promise<VerificationResult>;
  submitLivenessCheck(selfieBase64: string, userId: string): Promise<VerificationResult>;
  verifyId(docType: string, docNumber: string, userId: string): Promise<VerificationResult>;
}

export interface SMSProvider {
  sendOtp(phone: string, otp: string): Promise<void>;
  send(phone: string, message: string): Promise<void>;
}

export interface EmailProvider {
  send(to: string, subject: string, html: string, text: string): Promise<void>;
  sendTemplate(to: string, templateId: string, data: Record<string, unknown>): Promise<void>;
}
