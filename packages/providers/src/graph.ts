/**
 * Graph API client — Nigerian + African fiat rails.
 * https://usegraph.readme.io/
 *
 * Base URL:    https://api.useoval.com        (same host for test + live)
 * Auth:        Authorization: Bearer {GRAPH_API_KEY}
 * Environment: Environment: test|live          — toggles sandbox vs production.
 *              Default is 'test'. Set GRAPH_ENVIRONMENT=live on prod.
 * Amounts:     ALWAYS in subunits (cents for USD, kobo for NGN).
 *
 * Stub mode:   When GRAPH_API_KEY is missing, helpers return deterministic
 *              fixtures for local dev. Refused in production via
 *              refuseStubInProduction + FRENZPAY_ALLOW_DEV_STUBS escape hatch.
 *
 * Organisation of this file: types at the top, low-level graphFetch, then
 * endpoint families grouped by resource. Each family is a small band of
 * functions — search for "── People ─" / "── Bank Accounts ─" / etc.
 */

import { createHmac, timingSafeEqual, randomBytes, createHash } from 'node:crypto';

const DEFAULT_BASE = 'https://api.useoval.com';

// ──────────────────────────────────────────────────────────────────────────────
// Shared types
// ──────────────────────────────────────────────────────────────────────────────

export type GraphEnvironment = 'test' | 'live';

/** Nigerian state 2-letter codes, subset — full list is 36 + FCT. */
export type GraphNigerianState = string; // e.g. 'LA', 'FC', 'RI'

export interface GraphAddress {
  line1: string;
  line2?: string;
  city: string;
  state: string; // 2-letter code for NG; state name elsewhere
  country: string; // ISO-2 (e.g. 'NG', 'US')
  postal_code: string; // NG: 6-digit; US: 5-digit; etc.
}

/** Required when requesting a USD bank account (not NGN). */
export interface GraphBackgroundInformation {
  employment_status:
    | 'employed'
    | 'self_employed'
    | 'unemployed'
    | 'student'
    | 'retired'
    | 'other';
  occupation: string;
  primary_purpose: string; // e.g. 'personal-use' | 'business-use' | 'investment'
  source_of_funds: string; // e.g. 'salary' | 'business-income' | 'freelance'
  expected_monthly_inflow: number; // USD subunits (cents) — keeps units consistent
}

export type GraphIdType = 'passport' | 'drivers_license' | 'nin' | 'voters_card';
export type GraphIdLevel = 'primary' | 'secondary';
export type GraphKycLevel = 'preliminary' | 'basic';

export type GraphDocumentType =
  | 'passport'
  | 'national_id'
  | 'drivers_licence' // NB: Graph uses UK spelling for documents, US spelling elsewhere
  | 'residence_permit'
  | 'voters_card'
  | 'bank_statement'
  | 'utility_bill'
  | 'incorporation_certificate'
  | 'registration_certificate'
  | 'memorandum_articles'
  | 'business_licence'
  | 'cac';

export interface GraphDocumentInline {
  type: GraphDocumentType;
  url: string; // publicly-reachable URL
  issuance_date?: string; // YYYY-MM-DD
  expiry_date?: string;
}

export interface GraphPersonPayload {
  name_first: string;
  name_last: string;
  name_other: string; // middle / other name (required by Graph)
  phone: string; // + country prefix, e.g. '+2348012345678'
  email: string;
  dob: string; // YYYY-MM-DD
  id_level: GraphIdLevel;
  id_type: GraphIdType;
  id_number: string;
  id_country: string; // ISO-2
  /** BVN for Nigerian ID holders — required for NG bank accounts. */
  bank_id_number?: string;
  address: GraphAddress;
  /** USD bank accounts only — NGN accounts don't require this block. */
  background_information?: GraphBackgroundInformation;
  /** Inline documents (we usually upload separately via POST /entity_document). */
  documents?: GraphDocumentInline[];
  kyc_level?: GraphKycLevel;
}

export interface GraphPersonUpdatePayload {
  name_first?: string;
  name_last?: string;
  name_other?: string;
  email?: string;
  phone?: string;
  dob?: string;
  address?: GraphAddress;
  background_information?: GraphBackgroundInformation;
}

export interface GraphPersonKycUpgradePayload {
  id_type: GraphIdType;
  id_number: string;
  id_country: string;
  id_upload: string; // URL
}

export interface GraphPersonResult {
  personId: string;
  status: 'active' | 'pending' | 'under_review' | 'rejected' | string;
  rawResponse?: unknown;
}

// ── Bank Account types ───────────────────────────────────────────────────────

export type GraphBankAccountCurrency = 'USD' | 'NGN' | 'EUR';

export interface GraphBankAccountPayload {
  /** Exactly one of person_id or business_id must be set. */
  person_id?: string;
  business_id?: string;
  label: string;
  currency: GraphBankAccountCurrency;
  autosweep_enabled?: boolean;
  /** NGN only. */
  whitelist_enabled?: boolean;
  whitelist?: GraphWhitelistItem[];
}

export interface GraphBankAccountResult {
  bankAccountId: string;
  accountNumber: string;
  accountName: string;
  bankName: string;
  bankCode?: string;
  routingNumber?: string; // USD
  swiftCode?: string;
  currency: string;
  settlementCurrency: string;
  status?: string;
  rawResponse?: unknown;
}

// ── Payout types ─────────────────────────────────────────────────────────────

export type GraphPayoutDestinationType =
  | 'nip' // NGN interbank
  | 'wire' // international / domestic USD wire
  | 'stablecoin'
  | 'mobile_money' // Ghana/Kenya/Egypt only
  | 'internal';

export type GraphWireType = 'ach' | 'fedwire' | 'swift';
export type GraphStablecoinNetwork = 'ERC20' | 'TRC20' | 'POL';
export type GraphStablecoinCurrency = 'USDC' | 'USDT';

export interface GraphPayoutDestinationNip {
  source_type: 'wallet_account' | 'bank_account';
  type: 'nip';
  account_id: string;
  label: string;
  bank_code: string;
  account_number: string;
}

export interface GraphPayoutDestinationWire {
  source_type: 'wallet_account' | 'bank_account';
  type: 'wire';
  account_id: string;
  label: string;
  wire_type: GraphWireType;
  beneficiary_name: string;
  beneficiary_address: string;
  account_number: string;
  routing_number?: string; // ach / fedwire
  swift_code?: string; // swift
  bank_name: string;
  bank_address: string;
}

export interface GraphPayoutDestinationStablecoin {
  source_type: 'wallet_account';
  type: 'stablecoin';
  account_id: string;
  label: string;
  currency: GraphStablecoinCurrency;
  destination_type: 'address';
  address_code: string;
  address_network: GraphStablecoinNetwork;
}

export interface GraphPayoutDestinationMobileMoney {
  source_type: 'wallet_account' | 'bank_account';
  type: 'mobile_money';
  account_id: string;
  label: string;
  operator_code: string;
  country_code: 'GH' | 'KE' | 'EG';
  phone_number: string;
}

export type GraphPayoutDestinationPayload =
  | GraphPayoutDestinationNip
  | GraphPayoutDestinationWire
  | GraphPayoutDestinationStablecoin
  | GraphPayoutDestinationMobileMoney;

export interface GraphPayoutDestinationResult {
  destinationId: string;
  type: GraphPayoutDestinationType | string;
  label?: string;
  rawResponse?: unknown;
}

export interface GraphPayoutPayload {
  destination_id: string;
  amount: number; // subunits
  description: string;
  supporting_documents?: string[]; // public URLs
}

export interface GraphPayoutResult {
  payoutId: string;
  status: 'pending' | 'processing' | 'successful' | 'failed' | 'reversed' | string;
  rawResponse?: unknown;
}

// ── Other types ──────────────────────────────────────────────────────────────

export interface GraphBankListItem {
  bank_code: string;
  bank_name: string;
  country: string;
}

export interface GraphResolveAccountResult {
  account_name: string;
  account_number: string;
  bank_code: string;
  bank_name?: string;
  currency: string;
  rawResponse?: unknown;
}

export interface GraphRateResult {
  rate: number;
  spread?: number;
  base_currency: string;
  quote_currency: string;
  timestamp?: string;
  expires_at?: string;
  rate_id?: string;
  rawResponse?: unknown;
}

export interface GraphConversionPayload {
  currency_source: 'USD' | 'NGN';
  currency_destination: 'USD' | 'NGN';
  amount_source: number; // subunits
  rate_id?: string;
  account_id_source?: string;
  account_id_destination?: string;
}

export interface GraphConversionResult {
  conversionId: string;
  status: string;
  fx_rate?: number;
  from_amount?: number;
  to_amount?: number;
  rawResponse?: unknown;
}

// ── Card types ───────────────────────────────────────────────────────────────

export interface GraphCardPayload {
  /** Exactly one of person_id or business_id. */
  person_id?: string;
  business_id?: string;
  label: string;
  funding_amount: number; // USD subunits, min $10 usually
  secure_settings?: { mobile: string; pin: string }; // business cards only
}

export interface GraphCardResult {
  cardId: string;
  masked_pan?: string;
  last4?: string;
  expiry_month?: number;
  expiry_year?: number;
  brand?: string;
  status: 'pending' | 'successful' | 'failed' | 'active' | 'frozen' | 'closed' | string;
  funding_balance?: number;
  rawResponse?: unknown;
}

// ── Deposit-address types (crypto) ───────────────────────────────────────────

export interface GraphDepositAddressPayload {
  person_id?: string;
  business_id?: string;
  currency: GraphStablecoinCurrency;
  network: GraphStablecoinNetwork;
}

export interface GraphDepositAddressResult {
  addressId: string;
  address: string;
  currency: GraphStablecoinCurrency;
  network: GraphStablecoinNetwork;
  rawResponse?: unknown;
}

// ── Whitelist ────────────────────────────────────────────────────────────────

export interface GraphWhitelistItem {
  bank_code: string;
  account_number: string;
  account_name?: string;
}

// ── Webhook envelope ─────────────────────────────────────────────────────────

export interface GraphWebhookEnvelope {
  event_type: string;
  entity: Record<string, unknown> & { id?: string };
  data: Record<string, unknown>;
}

// ──────────────────────────────────────────────────────────────────────────────
// Production guard + stub helpers
// ──────────────────────────────────────────────────────────────────────────────

function refuseStubInProduction(what: string): void {
  const env = process.env['NODE_ENV'];
  const allowDevStubs = process.env['FRENZPAY_ALLOW_DEV_STUBS'] === '1';
  if (env === 'production' && !allowDevStubs) {
    throw new Error(
      `[graph] Missing GRAPH_API_KEY in production — refusing to ${what}. ` +
        `Set GRAPH_API_KEY via /admin/providers or in /home/frenzpay/shared/.env.production.`,
    );
  }
}

function stubId(prefix: string, seed: string): string {
  const hash = createHash('sha256').update(seed).digest('hex');
  return `${prefix}_stub_${hash.slice(0, 12)}`;
}

export function isGraphConfigured(): boolean {
  return Boolean(process.env['GRAPH_API_KEY']);
}

/** Generate a unique idempotency key for Graph POSTs. */
export function generateGraphIdempotencyKey(prefix: string): string {
  return `${prefix}-${Date.now()}-${randomBytes(8).toString('hex')}`;
}

function currentEnvironment(): GraphEnvironment {
  const raw = (process.env['GRAPH_ENVIRONMENT'] ?? '').toLowerCase();
  if (raw === 'live' || raw === 'production') return 'live';
  return 'test';
}

// ──────────────────────────────────────────────────────────────────────────────
// Low-level fetch helper
// ──────────────────────────────────────────────────────────────────────────────

interface GraphRequestOptions {
  path: string;
  method?: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  body?: unknown;
  query?: Record<string, string | number | boolean | undefined | null>;
  idempotencyKey?: string;
  /** Override environment for this request (rarely needed). */
  environment?: GraphEnvironment;
}

/**
 * Single point where every Graph API call goes through. Enforces:
 *  - Bearer auth
 *  - Environment header (test|live)
 *  - Content-Type JSON
 *  - Idempotency-Key passthrough
 *  - Consistent error messages
 */
async function graphFetch<T>(opts: GraphRequestOptions): Promise<T> {
  const apiKey = process.env['GRAPH_API_KEY'];
  if (!apiKey) {
    throw new Error(
      '[graph] GRAPH_API_KEY is not set. Callers must check isGraphConfigured() before dispatching network calls.',
    );
  }
  const base = process.env['GRAPH_API_BASE'] ?? DEFAULT_BASE;
  const env = opts.environment ?? currentEnvironment();

  // Build URL with query params
  let url = `${base}${opts.path}`;
  if (opts.query) {
    const qs = new URLSearchParams();
    for (const [k, v] of Object.entries(opts.query)) {
      if (v === undefined || v === null) continue;
      qs.set(k, String(v));
    }
    const s = qs.toString();
    if (s) url += (url.includes('?') ? '&' : '?') + s;
  }

  const headers: Record<string, string> = {
    Authorization: `Bearer ${apiKey}`,
    'Content-Type': 'application/json',
    Environment: env,
    Accept: 'application/json',
  };
  if (opts.idempotencyKey) {
    headers['Idempotency-Key'] = opts.idempotencyKey;
  }

  const res = await fetch(url, {
    method: opts.method ?? 'GET',
    headers,
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
  });

  const text = await res.text();
  let parsed: unknown = null;
  if (text) {
    try {
      parsed = JSON.parse(text);
    } catch {
      parsed = text;
    }
  }

  if (!res.ok) {
    const bodyDesc =
      typeof parsed === 'string'
        ? parsed.slice(0, 500)
        : JSON.stringify(parsed).slice(0, 500);
    throw new Error(
      `Graph ${opts.method ?? 'GET'} ${opts.path} failed: HTTP ${res.status} — ${bodyDesc}`,
    );
  }

  return (parsed as T) ?? ({} as T);
}

// ──────────────────────────────────────────────────────────────────────────────
// People
// ──────────────────────────────────────────────────────────────────────────────

/** POST /person — create a Person entity for KYC. */
export async function createGraphPerson(
  payload: GraphPersonPayload,
  opts?: { idempotencyKey?: string },
): Promise<GraphPersonResult> {
  if (!isGraphConfigured()) {
    refuseStubInProduction('return a stub Graph person (no compliance record created)');
    return {
      personId: stubId('graph_pers', payload.email),
      status: 'active',
      rawResponse: { stub: true },
    };
  }
  const data = await graphFetch<{ id: string; status: string }>({
    path: '/person',
    method: 'POST',
    body: payload,
    idempotencyKey: opts?.idempotencyKey ?? generateGraphIdempotencyKey('person'),
  });
  return { personId: data.id, status: data.status, rawResponse: data };
}

/** GET /person/{id} */
export async function fetchGraphPerson(personId: string): Promise<GraphPersonResult> {
  if (!isGraphConfigured()) {
    refuseStubInProduction('fetch a Graph person');
    return { personId, status: 'active', rawResponse: { stub: true } };
  }
  const data = await graphFetch<{ id: string; status: string }>({
    path: `/person/${encodeURIComponent(personId)}`,
  });
  return { personId: data.id, status: data.status, rawResponse: data };
}

/** GET /person — list people (paginated). */
export async function listGraphPeople(query?: {
  page?: number;
  per_page?: number;
}): Promise<unknown[]> {
  if (!isGraphConfigured()) {
    refuseStubInProduction('list Graph people');
    return [];
  }
  const data = await graphFetch<{ data?: unknown[] } | unknown[]>({
    path: '/person',
    query,
  });
  if (Array.isArray(data)) return data;
  return (data as { data?: unknown[] }).data ?? [];
}

/** PATCH /person/{id} */
export async function updateGraphPerson(
  personId: string,
  patch: GraphPersonUpdatePayload,
): Promise<GraphPersonResult> {
  if (!isGraphConfigured()) {
    refuseStubInProduction('update a Graph person');
    return { personId, status: 'active', rawResponse: { stub: true, patch } };
  }
  const data = await graphFetch<{ id: string; status: string }>({
    path: `/person/${encodeURIComponent(personId)}`,
    method: 'PATCH',
    body: patch,
  });
  return { personId: data.id, status: data.status, rawResponse: data };
}

/** PATCH /person/{id}/kyc — upgrade KYC level (secondary→primary, etc.). */
export async function upgradeGraphPersonKyc(
  personId: string,
  payload: GraphPersonKycUpgradePayload,
): Promise<GraphPersonResult> {
  if (!isGraphConfigured()) {
    refuseStubInProduction('upgrade Graph KYC');
    return { personId, status: 'under_review', rawResponse: { stub: true } };
  }
  const data = await graphFetch<{ id: string; status: string }>({
    path: `/person/${encodeURIComponent(personId)}/kyc`,
    method: 'PATCH',
    body: payload,
  });
  return { personId: data.id, status: data.status, rawResponse: data };
}

// ──────────────────────────────────────────────────────────────────────────────
// Documents (KYC uploads)
// ──────────────────────────────────────────────────────────────────────────────

/**
 * POST /entity_document — register a KYC document against a person (or
 * business). The `url` must point at a publicly-reachable location — typically
 * a short-lived pre-signed S3 URL generated by our own storage layer.
 */
export async function createGraphDocument(payload: {
  entity_type: 'person' | 'business';
  person_id?: string;
  business_id?: string;
  type: GraphDocumentType;
  url: string;
  issuance_date?: string;
  expiry_date?: string;
}): Promise<{ documentId: string; rawResponse: unknown }> {
  if (!isGraphConfigured()) {
    refuseStubInProduction('create a Graph document');
    return {
      documentId: stubId('graph_doc', payload.url),
      rawResponse: { stub: true },
    };
  }
  const data = await graphFetch<{ id: string }>({
    path: '/entity_document',
    method: 'POST',
    body: payload,
  });
  return { documentId: data.id, rawResponse: data };
}

/** GET /entity_document/{entity_type}/{entity_id} */
export async function listGraphDocuments(
  entityType: 'person' | 'business',
  entityId: string,
): Promise<unknown[]> {
  if (!isGraphConfigured()) return [];
  const data = await graphFetch<unknown[] | { data?: unknown[] }>({
    path: `/entity_document/${entityType}/${encodeURIComponent(entityId)}`,
  });
  if (Array.isArray(data)) return data;
  return (data as { data?: unknown[] }).data ?? [];
}

/** DELETE /entity_document/{id} */
export async function deleteGraphDocument(documentId: string): Promise<void> {
  if (!isGraphConfigured()) return;
  await graphFetch({
    path: `/entity_document/${encodeURIComponent(documentId)}`,
    method: 'DELETE',
  });
}

// ──────────────────────────────────────────────────────────────────────────────
// Bank Accounts (virtual accounts)
// ──────────────────────────────────────────────────────────────────────────────

function stubBankAccount(personId: string, currency: string): GraphBankAccountResult {
  const hash = createHmac('sha256', 'graph-stub').update(personId + currency).digest('hex');
  return {
    bankAccountId: `graph_ba_stub_${hash.slice(0, 12)}`,
    accountNumber: hash.slice(0, 10).replace(/[a-f]/g, '0'),
    accountName: 'FRENZPAY / STUB',
    bankName: 'Stub Nigerian Bank',
    bankCode: '000',
    currency,
    settlementCurrency: 'NGN',
    rawResponse: { stub: true },
  };
}

/** POST /bank_account */
export async function createGraphBankAccount(
  payload: GraphBankAccountPayload,
  opts?: { idempotencyKey?: string },
): Promise<GraphBankAccountResult> {
  if (!isGraphConfigured()) {
    refuseStubInProduction('create a Graph bank account');
    return stubBankAccount(payload.person_id ?? payload.business_id ?? 'unknown', payload.currency);
  }
  const data = await graphFetch<{
    id: string;
    account_number: string;
    account_name: string;
    bank_name: string;
    bank_code?: string;
    routing_number?: string;
    swift_code?: string;
    currency: string;
    settlement_currency?: string;
    status?: string;
  }>({
    path: '/bank_account',
    method: 'POST',
    body: payload,
    idempotencyKey: opts?.idempotencyKey ?? generateGraphIdempotencyKey('bank_account'),
  });
  return {
    bankAccountId: data.id,
    accountNumber: data.account_number,
    accountName: data.account_name,
    bankName: data.bank_name,
    bankCode: data.bank_code,
    routingNumber: data.routing_number,
    swiftCode: data.swift_code,
    currency: data.currency,
    settlementCurrency: data.settlement_currency ?? data.currency,
    status: data.status,
    rawResponse: data,
  };
}

/** GET /bank_account/{id} */
export async function fetchGraphBankAccount(accountId: string): Promise<unknown> {
  if (!isGraphConfigured()) return { stub: true, accountId };
  return graphFetch({ path: `/bank_account/${encodeURIComponent(accountId)}` });
}

/** GET /bank_account */
export async function listGraphBankAccounts(query?: Record<string, string | number | boolean>): Promise<unknown[]> {
  if (!isGraphConfigured()) return [];
  const data = await graphFetch<unknown[] | { data?: unknown[] }>({
    path: '/bank_account',
    query,
  });
  if (Array.isArray(data)) return data;
  return (data as { data?: unknown[] }).data ?? [];
}

/** PATCH /bank_account/{id} — only `status` is mutable per Graph docs. */
export async function updateGraphBankAccountStatus(
  accountId: string,
  status: 'active' | 'inactive',
): Promise<unknown> {
  if (!isGraphConfigured()) return { stub: true, accountId, status };
  return graphFetch({
    path: `/bank_account/${encodeURIComponent(accountId)}`,
    method: 'PATCH',
    body: { status },
  });
}

// ──────────────────────────────────────────────────────────────────────────────
// Payout Destinations + Payouts
// ──────────────────────────────────────────────────────────────────────────────

/** POST /payout-destination */
export async function createGraphPayoutDestination(
  payload: GraphPayoutDestinationPayload,
  opts?: { idempotencyKey?: string },
): Promise<GraphPayoutDestinationResult> {
  if (!isGraphConfigured()) {
    refuseStubInProduction('create a Graph payout destination');
    return {
      destinationId: stubId('graph_pd', payload.label),
      type: payload.type,
      label: payload.label,
      rawResponse: { stub: true },
    };
  }
  const data = await graphFetch<{ id: string; type: string; label?: string }>({
    path: '/payout-destination',
    method: 'POST',
    body: payload,
    idempotencyKey: opts?.idempotencyKey ?? generateGraphIdempotencyKey('pd'),
  });
  return {
    destinationId: data.id,
    type: data.type,
    label: data.label,
    rawResponse: data,
  };
}

/** GET /payout-destination/{id} */
export async function fetchGraphPayoutDestination(id: string): Promise<unknown> {
  if (!isGraphConfigured()) return { stub: true, id };
  return graphFetch({ path: `/payout-destination/${encodeURIComponent(id)}` });
}

/** GET /payout-destination */
export async function listGraphPayoutDestinations(
  query?: Record<string, string | number | boolean>,
): Promise<unknown[]> {
  if (!isGraphConfigured()) return [];
  const data = await graphFetch<unknown[] | { data?: unknown[] }>({
    path: '/payout-destination',
    query,
  });
  if (Array.isArray(data)) return data;
  return (data as { data?: unknown[] }).data ?? [];
}

/** POST /payout */
export async function createGraphPayout(
  payload: GraphPayoutPayload,
  opts?: { idempotencyKey?: string },
): Promise<GraphPayoutResult> {
  if (!isGraphConfigured()) {
    refuseStubInProduction('create a Graph payout');
    return {
      payoutId: stubId('graph_po', payload.destination_id + payload.amount),
      status: 'pending',
      rawResponse: { stub: true },
    };
  }
  const data = await graphFetch<{ id: string; status: string }>({
    path: '/payout',
    method: 'POST',
    body: payload,
    idempotencyKey: opts?.idempotencyKey ?? generateGraphIdempotencyKey('po'),
  });
  return { payoutId: data.id, status: data.status, rawResponse: data };
}

/** GET /payout/{id} */
export async function fetchGraphPayout(id: string): Promise<GraphPayoutResult> {
  if (!isGraphConfigured()) return { payoutId: id, status: 'pending', rawResponse: { stub: true } };
  const data = await graphFetch<{ id: string; status: string }>({
    path: `/payout/${encodeURIComponent(id)}`,
  });
  return { payoutId: data.id, status: data.status, rawResponse: data };
}

/** GET /payout */
export async function listGraphPayouts(
  query?: Record<string, string | number | boolean>,
): Promise<unknown[]> {
  if (!isGraphConfigured()) return [];
  const data = await graphFetch<unknown[] | { data?: unknown[] }>({
    path: '/payout',
    query,
  });
  if (Array.isArray(data)) return data;
  return (data as { data?: unknown[] }).data ?? [];
}

// ──────────────────────────────────────────────────────────────────────────────
// Banks: list + resolve
// ──────────────────────────────────────────────────────────────────────────────

/** GET /bank — list Nigerian banks with codes. Cached client-side by callers. */
export async function listGraphBanks(): Promise<GraphBankListItem[]> {
  if (!isGraphConfigured()) return [];
  const data = await graphFetch<GraphBankListItem[] | { data?: GraphBankListItem[] }>({
    path: '/bank',
  });
  if (Array.isArray(data)) return data;
  return (data as { data?: GraphBankListItem[] }).data ?? [];
}

/** POST /bank/resolve/account — verify an NGN account number before payout. */
export async function resolveGraphBankAccount(params: {
  account_number: string;
  bank_code: string;
  currency?: 'NGN' | 'USD' | 'EUR';
}): Promise<GraphResolveAccountResult> {
  if (!isGraphConfigured()) {
    refuseStubInProduction('resolve a bank account');
    return {
      account_name: 'STUB ACCOUNT HOLDER',
      account_number: params.account_number,
      bank_code: params.bank_code,
      currency: params.currency ?? 'NGN',
      rawResponse: { stub: true },
    };
  }
  const data = await graphFetch<{
    account_name: string;
    account_number: string;
    bank_code: string;
    bank_name?: string;
    currency: string;
  }>({
    path: '/bank/resolve/account',
    method: 'POST',
    body: { currency: 'NGN', ...params },
  });
  return { ...data, rawResponse: data };
}

// ──────────────────────────────────────────────────────────────────────────────
// FX — rates + conversions
// ──────────────────────────────────────────────────────────────────────────────

/** GET /rate?base_currency=X&quote_currency=Y */
export async function fetchGraphRate(
  base: string,
  quote: string,
): Promise<GraphRateResult> {
  if (!isGraphConfigured()) {
    refuseStubInProduction('fetch Graph rate');
    return {
      rate: 1500, // stub USD→NGN
      base_currency: base,
      quote_currency: quote,
      timestamp: new Date().toISOString(),
      expires_at: new Date(Date.now() + 60_000).toISOString(),
      rawResponse: { stub: true },
    };
  }
  const data = await graphFetch<{
    rate: number;
    spread?: number;
    base_currency?: string;
    quote_currency?: string;
    timestamp?: string;
    expires_at?: string;
    id?: string;
    rate_id?: string;
  }>({
    path: '/rate',
    query: { base_currency: base, quote_currency: quote },
  });
  return {
    rate: data.rate,
    spread: data.spread,
    base_currency: data.base_currency ?? base,
    quote_currency: data.quote_currency ?? quote,
    timestamp: data.timestamp,
    expires_at: data.expires_at,
    rate_id: data.rate_id ?? data.id,
    rawResponse: data,
  };
}

/** POST /conversion — execute an FX swap (optionally against a locked rate). */
export async function createGraphConversion(
  payload: GraphConversionPayload,
  opts?: { idempotencyKey?: string },
): Promise<GraphConversionResult> {
  if (!isGraphConfigured()) {
    refuseStubInProduction('create a Graph conversion');
    return {
      conversionId: stubId('graph_conv', payload.currency_source + payload.amount_source),
      status: 'pending',
      rawResponse: { stub: true },
    };
  }
  const data = await graphFetch<{
    id: string;
    status: string;
    fx_rate?: number;
    from_amount?: number;
    to_amount?: number;
  }>({
    path: '/conversion',
    method: 'POST',
    body: payload,
    idempotencyKey: opts?.idempotencyKey ?? generateGraphIdempotencyKey('conv'),
  });
  return {
    conversionId: data.id,
    status: data.status,
    fx_rate: data.fx_rate,
    from_amount: data.from_amount,
    to_amount: data.to_amount,
    rawResponse: data,
  };
}

/** GET /conversion/{id} */
export async function fetchGraphConversion(id: string): Promise<GraphConversionResult> {
  if (!isGraphConfigured()) {
    return { conversionId: id, status: 'pending', rawResponse: { stub: true } };
  }
  const data = await graphFetch<{ id: string; status: string; fx_rate?: number }>({
    path: `/conversion/${encodeURIComponent(id)}`,
  });
  return { conversionId: data.id, status: data.status, fx_rate: data.fx_rate, rawResponse: data };
}

// ──────────────────────────────────────────────────────────────────────────────
// Cards (USD virtual debit cards)
// ──────────────────────────────────────────────────────────────────────────────

/** POST /card */
export async function createGraphCard(
  payload: GraphCardPayload,
  opts?: { idempotencyKey?: string },
): Promise<GraphCardResult> {
  if (!isGraphConfigured()) {
    refuseStubInProduction('create a Graph card');
    return {
      cardId: stubId('graph_card', payload.label),
      status: 'pending',
      rawResponse: { stub: true },
    };
  }
  const data = await graphFetch<{ id: string; status: string }>({
    path: '/card',
    method: 'POST',
    body: payload,
    idempotencyKey: opts?.idempotencyKey ?? generateGraphIdempotencyKey('card'),
  });
  return { cardId: data.id, status: data.status, rawResponse: data };
}

/** GET /card/{id}?decrypt=true|false */
export async function fetchGraphCard(
  cardId: string,
  opts?: { decrypt?: boolean },
): Promise<GraphCardResult> {
  if (!isGraphConfigured()) {
    return { cardId, status: 'active', rawResponse: { stub: true } };
  }
  const data = await graphFetch<{
    id: string;
    masked_pan?: string;
    last4?: string;
    expiry_month?: number;
    expiry_year?: number;
    brand?: string;
    status: string;
    funding_balance?: number;
  }>({
    path: `/card/${encodeURIComponent(cardId)}`,
    query: opts?.decrypt ? { decrypt: 'true' } : undefined,
  });
  return {
    cardId: data.id,
    masked_pan: data.masked_pan,
    last4: data.last4,
    expiry_month: data.expiry_month,
    expiry_year: data.expiry_year,
    brand: data.brand,
    status: data.status,
    funding_balance: data.funding_balance,
    rawResponse: data,
  };
}

/** GET /card */
export async function listGraphCards(
  query?: Record<string, string | number | boolean>,
): Promise<unknown[]> {
  if (!isGraphConfigured()) return [];
  const data = await graphFetch<unknown[] | { data?: unknown[] }>({
    path: '/card',
    query,
  });
  if (Array.isArray(data)) return data;
  return (data as { data?: unknown[] }).data ?? [];
}

/** POST /card/fund */
export async function fundGraphCard(
  cardId: string,
  amount: number, // subunits
  opts?: { custom_reference?: string; idempotencyKey?: string },
): Promise<unknown> {
  if (!isGraphConfigured()) return { stub: true, cardId, amount };
  return graphFetch({
    path: '/card/fund',
    method: 'POST',
    body: { card_id: cardId, amount, custom_reference: opts?.custom_reference },
    idempotencyKey: opts?.idempotencyKey ?? generateGraphIdempotencyKey('card-fund'),
  });
}

/** POST /card/withdraw */
export async function withdrawFromGraphCard(
  cardId: string,
  amount: number,
  opts?: { custom_reference?: string; idempotencyKey?: string },
): Promise<unknown> {
  if (!isGraphConfigured()) return { stub: true, cardId, amount };
  return graphFetch({
    path: '/card/withdraw',
    method: 'POST',
    body: { card_id: cardId, amount, custom_reference: opts?.custom_reference },
    idempotencyKey: opts?.idempotencyKey ?? generateGraphIdempotencyKey('card-wd'),
  });
}

/** PATCH /card/{id} with { status: 'active' | 'inactive' } — freeze / unfreeze. */
export async function updateGraphCardStatus(
  cardId: string,
  status: 'active' | 'inactive',
): Promise<unknown> {
  if (!isGraphConfigured()) return { stub: true, cardId, status };
  return graphFetch({
    path: `/card/${encodeURIComponent(cardId)}`,
    method: 'PATCH',
    body: { status },
  });
}

/** PATCH /card/{id}/secure_settings — set phone + 8-digit PIN (business cards). */
export async function updateGraphCardSecureSettings(
  cardId: string,
  mobile: string,
  pin: string,
): Promise<unknown> {
  if (!isGraphConfigured()) return { stub: true, cardId };
  return graphFetch({
    path: `/card/${encodeURIComponent(cardId)}/secure_settings`,
    method: 'PATCH',
    body: { mobile, pin },
  });
}

/** DELETE /card/{id} — irreversible closure. */
export async function closeGraphCard(cardId: string): Promise<unknown> {
  if (!isGraphConfigured()) return { stub: true, cardId, closed: true };
  return graphFetch({
    path: `/card/${encodeURIComponent(cardId)}`,
    method: 'DELETE',
  });
}

// ──────────────────────────────────────────────────────────────────────────────
// Deposit addresses (crypto)
// ──────────────────────────────────────────────────────────────────────────────

/** POST /address — create a crypto deposit address for a person. */
export async function createGraphDepositAddress(
  payload: GraphDepositAddressPayload,
  opts?: { idempotencyKey?: string },
): Promise<GraphDepositAddressResult> {
  if (!isGraphConfigured()) {
    refuseStubInProduction('create a Graph deposit address');
    return {
      addressId: stubId('graph_addr', (payload.person_id ?? payload.business_id ?? 'x') + payload.network),
      address: '0xSTUBbed0ddrESS0000000000000000000000000',
      currency: payload.currency,
      network: payload.network,
      rawResponse: { stub: true },
    };
  }
  const data = await graphFetch<{
    id: string;
    address: string;
    currency: GraphStablecoinCurrency;
    network: GraphStablecoinNetwork;
  }>({
    path: '/address',
    method: 'POST',
    body: payload,
    idempotencyKey: opts?.idempotencyKey ?? generateGraphIdempotencyKey('addr'),
  });
  return {
    addressId: data.id,
    address: data.address,
    currency: data.currency,
    network: data.network,
    rawResponse: data,
  };
}

/** GET /address/{id} */
export async function fetchGraphDepositAddress(id: string): Promise<unknown> {
  if (!isGraphConfigured()) return { stub: true, id };
  return graphFetch({ path: `/address/${encodeURIComponent(id)}` });
}

/** GET /address */
export async function listGraphDepositAddresses(
  query?: Record<string, string | number | boolean>,
): Promise<unknown[]> {
  if (!isGraphConfigured()) return [];
  const data = await graphFetch<unknown[] | { data?: unknown[] }>({
    path: '/address',
    query,
  });
  if (Array.isArray(data)) return data;
  return (data as { data?: unknown[] }).data ?? [];
}

// ──────────────────────────────────────────────────────────────────────────────
// Whitelist (fraud prevention on NGN virtual accounts)
// ──────────────────────────────────────────────────────────────────────────────

/** POST a whitelist entry onto a bank_account. */
export async function addGraphWhitelistEntry(
  bankAccountId: string,
  item: GraphWhitelistItem,
): Promise<unknown> {
  if (!isGraphConfigured()) return { stub: true, bankAccountId, item };
  return graphFetch({
    path: `/bank_account/${encodeURIComponent(bankAccountId)}/whitelist`,
    method: 'POST',
    body: item,
  });
}

/** GET /bank_account/{id}/whitelist */
export async function listGraphWhitelist(bankAccountId: string): Promise<unknown[]> {
  if (!isGraphConfigured()) return [];
  const data = await graphFetch<unknown[] | { data?: unknown[] }>({
    path: `/bank_account/${encodeURIComponent(bankAccountId)}/whitelist`,
  });
  if (Array.isArray(data)) return data;
  return (data as { data?: unknown[] }).data ?? [];
}

/** DELETE /bank_account/{id}/whitelist/{item_id} */
export async function removeGraphWhitelistEntry(
  bankAccountId: string,
  itemId: string,
): Promise<void> {
  if (!isGraphConfigured()) return;
  await graphFetch({
    path: `/bank_account/${encodeURIComponent(bankAccountId)}/whitelist/${encodeURIComponent(itemId)}`,
    method: 'DELETE',
  });
}

/** DELETE /bank_account/{id}/whitelist — clear all whitelisted accounts. */
export async function clearGraphWhitelist(bankAccountId: string): Promise<void> {
  if (!isGraphConfigured()) return;
  await graphFetch({
    path: `/bank_account/${encodeURIComponent(bankAccountId)}/whitelist`,
    method: 'DELETE',
  });
}

// ──────────────────────────────────────────────────────────────────────────────
// Transactions (Graph-side ledger views)
// ──────────────────────────────────────────────────────────────────────────────

/** GET /transaction/{id}?include=deposit,charge,conversion,payout */
export async function fetchGraphTransaction(
  id: string,
  include: Array<'deposit' | 'charge' | 'conversion' | 'payout'> = [
    'deposit',
    'charge',
    'conversion',
    'payout',
  ],
): Promise<unknown> {
  if (!isGraphConfigured()) return { stub: true, id };
  return graphFetch({
    path: `/transaction/${encodeURIComponent(id)}`,
    query: include.length > 0 ? { include: include.join(',') } : undefined,
  });
}

/** GET /transaction — paginated list with many filters. */
export async function listGraphTransactions(
  query?: Record<string, string | number | boolean>,
): Promise<unknown[]> {
  if (!isGraphConfigured()) return [];
  const data = await graphFetch<unknown[] | { data?: unknown[] }>({
    path: '/transaction',
    query,
  });
  if (Array.isArray(data)) return data;
  return (data as { data?: unknown[] }).data ?? [];
}

// ──────────────────────────────────────────────────────────────────────────────
// Health / probe
// ──────────────────────────────────────────────────────────────────────────────

/** GET /health — unauthenticated liveness probe. */
export async function pingGraphHealth(): Promise<{ ok: boolean; status: number; body: unknown }> {
  const base = process.env['GRAPH_API_BASE'] ?? DEFAULT_BASE;
  const res = await fetch(`${base}/health`, { method: 'GET' });
  const text = await res.text();
  let body: unknown = text;
  try { body = JSON.parse(text); } catch { /* keep as text */ }
  return { ok: res.ok, status: res.status, body };
}

// ──────────────────────────────────────────────────────────────────────────────
// Webhook signature verification
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Verify a Graph webhook signature.
 *
 * Exact scheme still unconfirmed in public docs. We currently attempt
 * HMAC-SHA256 against GRAPH_WEBHOOK_SECRET over the raw request body, with
 * signature encoded as hex, base64, or prefixed 'sha256='. If GRAPH_WEBHOOK_VERIFY=0
 * is set, we accept unsigned webhooks (useful for the initial registration
 * handshake with Graph before they tell us their signing scheme).
 */
export function verifyGraphWebhookSignature(rawBody: string, signature: string): boolean {
  const secret = process.env['GRAPH_WEBHOOK_SECRET'];
  const bypassVerify = process.env['GRAPH_WEBHOOK_VERIFY'] === '0';

  if (bypassVerify) {
    console.warn('[graph] GRAPH_WEBHOOK_VERIFY=0 — accepting webhook without signature check');
    return true;
  }

  if (!secret) {
    if (process.env['NODE_ENV'] === 'production') {
      console.warn('[graph] GRAPH_WEBHOOK_SECRET missing — rejecting webhook in production');
      return false;
    }
    console.warn('[graph] GRAPH_WEBHOOK_SECRET missing — permitting webhook in dev mode');
    return true;
  }

  if (!signature) return false;

  const computedHex = createHmac('sha256', secret).update(rawBody, 'utf8').digest('hex');
  const computedB64 = Buffer.from(computedHex, 'hex').toString('base64');
  const sig = signature.replace(/^sha256=/i, '').trim();

  try {
    if (sig.length === computedHex.length && /^[0-9a-fA-F]+$/.test(sig)) {
      return timingSafeEqual(Buffer.from(computedHex, 'hex'), Buffer.from(sig, 'hex'));
    }
    if (sig === computedB64) return true;
    const a = Buffer.from(sig, 'base64');
    const b = Buffer.from(computedB64, 'base64');
    if (a.length === b.length) return timingSafeEqual(a, b);
  } catch {
    /* fall through */
  }
  return false;
}
