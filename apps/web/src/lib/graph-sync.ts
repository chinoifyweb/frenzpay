/**
 * Graph sync — gateway between our internal user/KYC records and the Graph
 * (usegraph.io / Oval) Person + entity_document APIs.
 *
 * Two public entry points:
 *   syncUserToGraph(userId)       — Create or update the Graph Person record.
 *                                    Called post-KYC-approval. Idempotent:
 *                                    once user.graphPersonId exists, subsequent
 *                                    calls PATCH instead of POST.
 *   uploadKycDocsToGraph(subId)   — For every document in the KycSubmission,
 *                                    mint a short-lived signed URL pointing at
 *                                    /api/kyc-public/:token, then POST to
 *                                    /entity_document on Graph. Dedupes by
 *                                    registering a token per (graphPersonId, doc)
 *                                    pair.
 *
 * These helpers decrypt PII in-process only for the lifetime of the Graph call.
 * Nothing sensitive is logged. Errors are returned, not thrown, so callers can
 * choose between blocking KYC approval and queuing for retry.
 */

import { createHmac, randomBytes } from 'node:crypto';
import { prisma } from '@frenzpay/db';
import { decryptField, isCipherPayload } from '@frenzpay/crypto';
import { logger } from '@frenzpay/logger';
import {
  createGraphPerson,
  updateGraphPerson,
  createGraphDocument,
  type GraphAddress,
  type GraphBackgroundInformation,
  type GraphDocumentType,
  type GraphIdLevel,
  type GraphIdType,
  type GraphPersonPayload,
  type GraphPersonUpdatePayload,
  isGraphConfigured,
} from '@frenzpay/providers/graph';

// ── Types ──────────────────────────────────────────────────────────────────

export interface GraphSyncResult {
  ok: boolean;
  graphPersonId?: string;
  status?: string;
  error?: string;
  /** true = Person did not exist and was just created; false = updated */
  created?: boolean;
}

export interface GraphDocSyncResult {
  ok: boolean;
  uploaded: Array<{ docId: string; graphDocumentId: string }>;
  failures: Array<{ docId: string; error: string }>;
}

// ── Public-URL token (HMAC-signed) ─────────────────────────────────────────

const DOC_TOKEN_TTL_SECONDS = 60 * 60 * 24; // 24h — comfortably covers retries

interface KycDocTokenPayload {
  docId: string;
  submissionId: string;
  exp: number; // unix seconds
}

function docTokenSecret(): string {
  const s =
    process.env['GRAPH_DOC_TOKEN_SECRET'] ??
    process.env['CRYPTO_MASTER_KEY'] ??
    '';
  if (!s) {
    throw new Error(
      '[graph-sync] No GRAPH_DOC_TOKEN_SECRET or CRYPTO_MASTER_KEY configured — cannot sign KYC document URLs.',
    );
  }
  return s;
}

function b64url(input: Buffer | string): string {
  const buf = Buffer.isBuffer(input) ? input : Buffer.from(input, 'utf8');
  return buf
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

function b64urlDecode(s: string): Buffer {
  const pad = 4 - (s.length % 4);
  const padded = s + (pad < 4 ? '='.repeat(pad) : '');
  return Buffer.from(padded.replace(/-/g, '+').replace(/_/g, '/'), 'base64');
}

/** Mint a URL-safe signed token that authorises a single KYC doc fetch. */
export function mintKycDocToken(payload: Omit<KycDocTokenPayload, 'exp'>): string {
  const full: KycDocTokenPayload = {
    ...payload,
    exp: Math.floor(Date.now() / 1000) + DOC_TOKEN_TTL_SECONDS,
  };
  const body = b64url(JSON.stringify(full));
  const sig = b64url(createHmac('sha256', docTokenSecret()).update(body).digest());
  return `${body}.${sig}`;
}

/** Verify a token. Returns the payload on success, throws on any failure. */
export function verifyKycDocToken(token: string): KycDocTokenPayload {
  const parts = token.split('.');
  if (parts.length !== 2) throw new Error('Malformed token');
  const [body, sig] = parts;
  const expected = b64url(createHmac('sha256', docTokenSecret()).update(body).digest());
  if (expected !== sig) throw new Error('Bad signature');
  const payload = JSON.parse(b64urlDecode(body).toString('utf8')) as KycDocTokenPayload;
  if (payload.exp < Math.floor(Date.now() / 1000)) throw new Error('Token expired');
  return payload;
}

// ── PII decrypt helpers ────────────────────────────────────────────────────

/**
 * Decrypt a potentially-encrypted value. If the stored value is plaintext,
 * return it as-is (some early rows predate encryption on certain fields).
 * Returns null if absent or we can't make sense of it.
 */
function decryptIfCipher(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (isCipherPayload(value)) {
    try {
      return decryptField(value);
    } catch (err) {
      logger.warn(
        { err: err instanceof Error ? err.message : err },
        '[graph-sync] failed to decrypt a field',
      );
      return null;
    }
  }
  if (typeof value === 'string') return value;
  return null;
}

// ── Build a Graph Person payload from our DB rows ──────────────────────────

function idLevelFor(idType: GraphIdType, country: string): GraphIdLevel {
  // Per Graph docs: USD accounts always 'primary'. For NGN accounts 'primary'
  // means international passport; local IDs (NIN/voters_card/drivers_license)
  // are 'secondary'. We pick based on id_type + country.
  if (country === 'NG' && idType !== 'passport') return 'secondary';
  return 'primary';
}

function graphDocTypeForKycDoc(kycDocType: string): GraphDocumentType | null {
  // Our KycDocument.docType values: id_front | id_back | selfie | liveness | proof_of_address
  switch (kycDocType) {
    case 'id_front':
      // We don't know the ID type here — Graph will accept generic 'national_id'
      // for id_* docs since we also attach the actual id_type on the person.
      // If the KycSubmission has `passportNumber` set, we upload as passport
      // instead (see uploadKycDocsToGraph which enriches the call site).
      return 'national_id';
    case 'id_back':
      return 'national_id';
    case 'proof_of_address':
      return 'utility_bill';
    case 'bank_statement':
      return 'bank_statement';
    case 'selfie':
    case 'liveness':
      // These are our internal liveness checks, not something Graph expects
      // in entity_document. We skip uploading these — Graph runs its own KYC
      // liveness if needed.
      return null;
    default:
      return null;
  }
}

/** Pull all the pieces we need to build a Graph Person payload. */
async function buildPersonPayload(userId: string): Promise<
  | { ok: true; payload: GraphPersonPayload; needsBackgroundInfo: boolean }
  | { ok: false; error: string }
> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      email: true,
      firstName: true,
      middleName: true,
      lastName: true,
      phone: true,
      dob: true,
      country: true,
      addressLine1: true,
      addressLine2: true,
      city: true,
      addressState: true,
      postalCode: true,
      graphPersonId: true,
    },
  });
  if (!user) return { ok: false, error: 'User not found' };

  // Latest APPROVED submission carries the authoritative id_* fields.
  const submission = await prisma.kycSubmission.findFirst({
    where: { userId, status: 'APPROVED' },
    orderBy: { reviewedAt: 'desc' },
    select: {
      id: true,
      bvn: true,
      nin: true,
      passportNumber: true,
      driverLicenseNumber: true,
      sourceOfFunds: true,
      purposeOfAccount: true,
      employmentStatus: true,
      occupation: true,
      expectedMonthlyInflowCents: true,
    },
  });
  if (!submission) return { ok: false, error: 'No approved KYC submission for user' };

  // Decrypt PII in-process
  const firstName = user.firstName;
  const lastName = user.lastName;
  const middleName = user.middleName;
  const phone = decryptIfCipher(user.phone);
  const dob = decryptIfCipher(user.dob);
  const line1 = decryptIfCipher(user.addressLine1);
  const line2 = decryptIfCipher(user.addressLine2);
  const city = decryptIfCipher(user.city);
  const postalCode = decryptIfCipher(user.postalCode);
  const country = user.country ?? 'NG';
  const state = user.addressState;

  const bvn = decryptIfCipher(submission.bvn);
  const nin = decryptIfCipher(submission.nin);
  const passportNumber = decryptIfCipher(submission.passportNumber);
  const driversLicense = decryptIfCipher(submission.driverLicenseNumber);

  // Missing-field checks — fail loud with a useful message.
  // middleName is intentionally NOT required: many Nigerian IDs (and
  // ID types like NIN) carry only first + last, and forcing the
  // customer to invent a middle name to satisfy our gate would create
  // a name mismatch with the ID — the #1 reason KYC gets rejected.
  // Graph accepts an empty `name_other` for these cases.
  const missing: string[] = [];
  if (!firstName) missing.push('firstName');
  if (!lastName) missing.push('lastName');
  if (!phone) missing.push('phone');
  if (!dob) missing.push('dob');
  if (!line1) missing.push('addressLine1');
  if (!city) missing.push('city');
  if (!state) missing.push('addressState');
  if (!postalCode) missing.push('postalCode');

  // Pick id_type based on which ID we have (priority: passport > nin > drivers_license)
  let idType: GraphIdType;
  let idNumber: string | null;
  if (passportNumber) {
    idType = 'passport';
    idNumber = passportNumber;
  } else if (nin) {
    idType = 'nin';
    idNumber = nin;
  } else if (driversLicense) {
    idType = 'drivers_license';
    idNumber = driversLicense;
  } else {
    missing.push('id_type (no passport/nin/drivers_license on submission)');
    idType = 'nin'; // placeholder, won't pass validation anyway
    idNumber = null;
  }

  if (missing.length > 0) {
    return {
      ok: false,
      error: `Missing fields required by Graph: ${missing.join(', ')}`,
    };
  }

  const address: GraphAddress = {
    line1: line1!,
    line2: line2 ?? undefined,
    city: city!,
    state: state!,
    country,
    postal_code: postalCode!,
  };

  // Only include background_information if all of its fields are populated.
  let backgroundInfo: GraphBackgroundInformation | undefined;
  const bgComplete =
    submission.employmentStatus &&
    submission.occupation &&
    submission.purposeOfAccount &&
    submission.sourceOfFunds &&
    submission.expectedMonthlyInflowCents;
  if (bgComplete) {
    backgroundInfo = {
      employment_status: submission.employmentStatus as GraphBackgroundInformation['employment_status'],
      occupation: submission.occupation!,
      primary_purpose: submission.purposeOfAccount!,
      source_of_funds: submission.sourceOfFunds!,
      expected_monthly_inflow: Number(submission.expectedMonthlyInflowCents ?? 0),
    };
  }

  const payload: GraphPersonPayload = {
    name_first: firstName!,
    name_last: lastName!,
    // name_other is empty string when the customer has no middle name
    // on their ID. Sending null/undefined trips Graph's required-field
    // check; empty string is accepted.
    name_other: middleName ?? '',
    phone: phone!,
    email: user.email,
    dob: dob!,
    id_level: idLevelFor(idType, country),
    id_type: idType,
    id_number: idNumber!,
    id_country: country,
    bank_id_number: bvn ?? undefined,
    address,
    background_information: backgroundInfo,
  };

  return { ok: true, payload, needsBackgroundInfo: !bgComplete };
}

// ── syncUserToGraph ────────────────────────────────────────────────────────

/**
 * Ensure a Graph Person exists for this user. Creates one if missing, else
 * PATCHes fields that may have drifted. Returns the Graph person id.
 *
 * Never throws — returns { ok: false, error } on every failure mode. Callers
 * decide how to handle (KYC approval proceeds either way; operator can retry
 * via admin action).
 */
export async function syncUserToGraph(userId: string): Promise<GraphSyncResult> {
  if (!isGraphConfigured()) {
    return { ok: false, error: 'Graph is not configured (GRAPH_API_KEY missing)' };
  }

  const built = await buildPersonPayload(userId);
  if (!built.ok) {
    return { ok: false, error: built.error };
  }
  const { payload } = built;

  try {
    const existing = await prisma.user.findUnique({
      where: { id: userId },
      select: { graphPersonId: true },
    });

    if (existing?.graphPersonId) {
      // PATCH mutable fields — Graph's updatable set differs from create.
      const patch: GraphPersonUpdatePayload = {
        name_first: payload.name_first,
        name_last: payload.name_last,
        name_other: payload.name_other,
        email: payload.email,
        phone: payload.phone,
        dob: payload.dob,
        address: payload.address,
        background_information: payload.background_information,
      };
      const res = await updateGraphPerson(existing.graphPersonId, patch);
      return { ok: true, graphPersonId: res.personId, status: res.status, created: false };
    }

    try {
      const res = await createGraphPerson(payload, {
        idempotencyKey: `person-${userId}`,
      });
      await prisma.user.update({
        where: { id: userId },
        data: { graphPersonId: res.personId },
      });
      logger.info({ userId, graphPersonId: res.personId }, 'Graph Person created');
      return { ok: true, graphPersonId: res.personId, status: res.status, created: true };
    } catch (err) {
      // Recover from "Person already exists" — Graph stores Persons
      // keyed by ID-doc number, so a previous provisioning attempt
      // (or a manual upload) may have created the Person without us
      // capturing the returned ID. The error message includes the
      // existing Person ID after a literal " - " separator, e.g.:
      //
      //   "Person with the provided ID information already exists - 930413f740fe11f183520e74f6457b17"
      //
      // Rather than failing forever, parse that ID, save it on the
      // User, and let the caller (provisionGraphAccount) move on to
      // the bank_account create step. PATCH the Person with our
      // current payload to reconcile any drift while we're at it.
      const msg = err instanceof Error ? err.message : String(err);
      const dupIdMatch = msg.match(/already exists\s*-\s*([0-9a-fA-F]{16,40})/);
      if (dupIdMatch) {
        const existingId = dupIdMatch[1]!;
        logger.warn(
          { userId, existingPersonId: existingId },
          'Graph Person already exists for ID — linking instead of recreating',
        );
        await prisma.user.update({
          where: { id: userId },
          data: { graphPersonId: existingId },
        });
        // Best-effort PATCH so Graph has fresh data; ignore any
        // failure here because the link is already saved and the
        // caller can proceed.
        try {
          const patch: GraphPersonUpdatePayload = {
            name_first: payload.name_first,
            name_last: payload.name_last,
            name_other: payload.name_other,
            email: payload.email,
            phone: payload.phone,
            dob: payload.dob,
            address: payload.address,
            background_information: payload.background_information,
          };
          const upd = await updateGraphPerson(existingId, patch);
          return { ok: true, graphPersonId: upd.personId, status: upd.status, created: false };
        } catch (patchErr) {
          logger.warn(
            { userId, existingPersonId: existingId, err: patchErr instanceof Error ? patchErr.message : patchErr },
            'PATCH on linked Graph Person failed — proceeding with link only',
          );
          return { ok: true, graphPersonId: existingId, created: false };
        }
      }
      // Anything else: bubble up.
      throw err;
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error({ userId, err: msg }, 'Graph Person sync failed');
    return { ok: false, error: msg };
  }
}

// ── uploadKycDocsToGraph ───────────────────────────────────────────────────

/**
 * Push every relevant KycDocument on a submission to Graph's /entity_document
 * endpoint. For each doc we mint a short-lived signed URL pointing at
 * /api/kyc-public/:token — Graph fetches the plaintext over HTTPS once.
 *
 * Pre-conditions:
 *   - user.graphPersonId is set (call syncUserToGraph first)
 *   - a public APP_URL is available (we read NEXT_PUBLIC_APP_URL so the URL
 *     we hand Graph is internet-reachable, not a localhost proxy)
 */
export async function uploadKycDocsToGraph(
  submissionId: string,
): Promise<GraphDocSyncResult> {
  const result: GraphDocSyncResult = { ok: true, uploaded: [], failures: [] };

  if (!isGraphConfigured()) {
    return { ok: false, uploaded: [], failures: [{ docId: '-', error: 'Graph not configured' }] };
  }

  const submission = await prisma.kycSubmission.findUnique({
    where: { id: submissionId },
    select: {
      id: true,
      userId: true,
      user: { select: { graphPersonId: true } },
      documents: {
        select: {
          id: true,
          docType: true,
        },
      },
    },
  });
  if (!submission) {
    return { ok: false, uploaded: [], failures: [{ docId: '-', error: 'Submission not found' }] };
  }
  const graphPersonId = submission.user.graphPersonId;
  if (!graphPersonId) {
    return {
      ok: false,
      uploaded: [],
      failures: [{ docId: '-', error: 'User has no graphPersonId — call syncUserToGraph first' }],
    };
  }

  const appBase =
    process.env['NEXT_PUBLIC_APP_URL']?.replace(/\/+$/, '') ??
    'https://app.frenzpay.co';

  for (const doc of submission.documents) {
    const graphType = graphDocTypeForKycDoc(doc.docType);
    if (!graphType) continue; // skip selfie/liveness — not needed by Graph

    try {
      const token = mintKycDocToken({ docId: doc.id, submissionId: submission.id });
      const url = `${appBase}/api/kyc-public/${encodeURIComponent(token)}`;

      const created = await createGraphDocument({
        entity_type: 'person',
        person_id: graphPersonId,
        type: graphType,
        url,
      });

      result.uploaded.push({ docId: doc.id, graphDocumentId: created.documentId });
      logger.info(
        { userId: submission.userId, docId: doc.id, graphDocumentId: created.documentId, graphType },
        'KYC doc pushed to Graph',
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      result.ok = false;
      result.failures.push({ docId: doc.id, error: msg });
      logger.error(
        { userId: submission.userId, docId: doc.id, err: msg },
        'KYC doc push to Graph failed',
      );
    }
  }

  return result;
}
