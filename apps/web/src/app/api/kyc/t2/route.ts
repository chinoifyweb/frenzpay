/**
 * POST /api/kyc/t2
 *
 * FrenzPay internal KYC — one-shot manual review (no Dojah, no BVN auto-check).
 *
 * Flow:
 *   1. Customer uploads ID + selfie + liveness video/photo + fills purpose +
 *      source of funds + their full legal name as it appears on the ID.
 *   2. Submission is stored as status=PENDING and the user is marked
 *      kycStatus='PENDING_REVIEW'.
 *   3. Admin reviews in /admin/kyc within 24h, approves or rejects with reason.
 *   4. On approve, the admin route (apps/web/src/app/api/admin/kyc/[id]/route.ts)
 *      bumps the user to T2 and auto-provisions a Bridge customer + USD
 *      virtual account via lib/bridge-provision.ts.
 *   5. Emails fire at each state transition.
 *
 * The user's basic account (dashboard, profile, FrenzTag lookup, etc) works
 * at T0 — only money-movement features (receive USD, withdraw, cards) gate
 * on approved KYC.
 *
 * Expects multipart/form-data:
 *   docType            'nin' | 'passport' | 'drivers_license'
 *   docNumber          raw document number — encrypted server-side
 *   fullLegalName      name as printed on the ID (e.g. "CHIOMA ADEBAYO OKAFOR")
 *   purposeOfAccount   'personal' | 'business' | 'freelance' | 'ecommerce' |
 *                      'investment' | 'other'
 *   sourceOfFunds      'salary' | 'business' | 'freelance' | 'investments' |
 *                      'gift' | 'savings' | 'other'
 *   idFront            File (required) — image of the ID front
 *   idBack             File (optional) — required only for driver's license / voter's card
 *   selfie             File (required) — static selfie photo
 *   liveness           File (required) — short video OR series-of-poses photo
 *                                         proving the selfie is a live human
 */
import { NextRequest, NextResponse } from 'next/server';
import { requireSession } from '@/lib/session';
import { prisma } from '@frenzpay/db';
import { encryptField, blindIndex } from '@frenzpay/crypto';
import { logger } from '@frenzpay/logger';
import { storeKycFile } from '@/lib/kyc-storage';
import { sendKYCSubmittedEmail, sendAdminNewKYCNotification } from '@/lib/email';

// Nigerian state 2-letter codes (must match the picker in the KYC form)
const VALID_NG_STATES = new Set([
  'AB','AD','AK','AN','BA','BY','BE','BO','CR','DE','EB','ED','EK','EN','FC',
  'GO','IM','JI','KD','KN','KT','KE','KO','KW','LA','NA','NI','OG','ON','OS',
  'OY','PL','RI','SO','TA','YO','ZA',
]);
const VALID_EMPLOYMENT = new Set([
  'employed', 'self_employed', 'unemployed', 'student', 'retired', 'other',
]);

// ── Validation constants ───────────────────────────────────────────────────
const ALLOWED_IMAGE_MIME = new Set(['image/jpeg', 'image/png', 'image/webp', 'application/pdf']);
// Liveness is upload-only — the customer records on their phone's
// native camera app. Phone video formats vary wildly (iPhone .mov,
// Android .3gp / .mkv, Samsung .avi, screen-recorders .flv, etc.) and a
// strict allow-list kept rejecting perfectly legitimate clips, so we
// accept ANY video/* mime here. The 50 MB size cap is the actual abuse
// defence; manual reviewer is the actual authenticity defence. Image
// uploads still fail because their mime doesn't start with `video/`.
const MAX_IMAGE_BYTES = 10 * 1024 * 1024;        // 10 MB per image
const MAX_LIVENESS_BYTES = 50 * 1024 * 1024;     // 50 MB for liveness (video)

// Voter's card (PVC) is added to match the doc types Graph accepts at
// https://usegraph.readme.io/reference/upgrade-person-kyc — customers who
// only carry their PVC were getting bounced before.
const VALID_DOC_TYPES = new Set(['nin', 'passport', 'drivers_license', 'voters_card']);
// Both the back of a driver's licence (address + signature) and the back
// of a voter's card (polling unit / signature block) carry information we
// need for review, so both require an idBack upload.
const REQUIRES_ID_BACK = new Set(['drivers_license', 'voters_card']);

const VALID_PURPOSES = new Set([
  'personal', 'freelance', 'amazon_kdp', 'amazon_associates', 'upwork',
  'youtube', 'content_creator', 'dropshipping', 'saas', 'crypto_trading',
  'investment', 'remittance', 'business',
  // Legacy / generic
  'ecommerce', 'other',
]);
const VALID_SOURCES = new Set([
  'salary', 'freelance', 'amazon_kdp', 'upwork', 'toptal', 'youtube',
  'patreon', 'ecommerce', 'dropshipping', 'saas', 'consulting', 'crypto',
  'investments', 'business', 'savings', 'gift', 'other',
]);

const MIN_NAME_CHARS = 4;
const MIN_DOC_NUMBER_CHARS = 5;

// ── Helpers ────────────────────────────────────────────────────────────────

function validateFile(
  label: string,
  file: File | null,
  kind: 'image' | 'video',
): string | null {
  if (!file) return `${label} file is required`;
  // Image slots stay strict (allow-list of jpeg/png/webp/pdf). Video
  // slots accept ANY video/* mime — phone formats are too varied to
  // enumerate and the manual review catches anything dodgy.
  const fileMime = (file.type || '').toLowerCase();
  const ok = kind === 'image'
    ? ALLOWED_IMAGE_MIME.has(fileMime)
    : fileMime.startsWith('video/');
  if (!ok) {
    return `${label}: unsupported file type ${file.type || '(no mime)'}`;
  }
  const cap = kind === 'image' ? MAX_IMAGE_BYTES : MAX_LIVENESS_BYTES;
  if (file.size > cap) {
    return `${label}: file too large (max ${Math.floor(cap / (1024 * 1024))} MB)`;
  }
  return null;
}

// ── Route handler ──────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const { session } = await requireSession();

  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return NextResponse.json({ error: 'Invalid multipart form data' }, { status: 400 });
  }

  // ── Parse fields ─────────────────────────────────────────────────────────
  const docType = (formData.get('docType')?.toString() ?? '').trim().toLowerCase();
  const docNumber = (formData.get('docNumber')?.toString() ?? '').trim();
  const fullLegalName = (formData.get('fullLegalName')?.toString() ?? '').trim();
  // Split name parts collected by the new 3-input form. Graph wants
  // first / last / other (middle) separately on the Person payload.
  // Older clients that only send fullLegalName get split heuristically
  // server-side so the User row still gets the structured fields.
  const formFirstName = (formData.get('firstName')?.toString() ?? '').trim();
  const formMiddleName = (formData.get('middleName')?.toString() ?? '').trim();
  const formLastName = (formData.get('lastName')?.toString() ?? '').trim();
  const splitName = (() => {
    if (formFirstName || formLastName) {
      return { first: formFirstName, middle: formMiddleName, last: formLastName };
    }
    // Legacy single-field fallback. Treat first token as first name,
    // last token as surname, anything in between as middle name(s).
    const parts = fullLegalName.split(/\s+/).filter(Boolean);
    if (parts.length === 0) return { first: '', middle: '', last: '' };
    if (parts.length === 1) return { first: parts[0]!, middle: '', last: '' };
    return {
      first: parts[0]!,
      middle: parts.length >= 3 ? parts.slice(1, -1).join(' ') : '',
      last: parts[parts.length - 1]!,
    };
  })();
  const purposeOfAccount = (formData.get('purposeOfAccount')?.toString() ?? '').trim().toLowerCase();
  const sourceOfFunds = (formData.get('sourceOfFunds')?.toString() ?? '').trim().toLowerCase();
  const bvn = (formData.get('bvn')?.toString() ?? '').trim();
  const dob = (formData.get('dob')?.toString() ?? '').trim();

  // Address
  const addressLine1 = (formData.get('addressLine1')?.toString() ?? '').trim();
  const addressLine2 = (formData.get('addressLine2')?.toString() ?? '').trim();
  const city = (formData.get('city')?.toString() ?? '').trim();
  const addressState = (formData.get('addressState')?.toString() ?? '').trim().toUpperCase();
  const postalCode = (formData.get('postalCode')?.toString() ?? '').trim();

  // background_information
  const employmentStatus = (formData.get('employmentStatus')?.toString() ?? '').trim().toLowerCase();
  const occupation = (formData.get('occupation')?.toString() ?? '').trim();
  const expectedMonthlyInflowCentsStr = (formData.get('expectedMonthlyInflowCents')?.toString() ?? '').trim();

  const idFront = formData.get('idFront') as File | null;
  const idBack = formData.get('idBack') as File | null;
  const selfie = formData.get('selfie') as File | null;
  const liveness = formData.get('liveness') as File | null;
  const proofOfAddress = formData.get('proofOfAddress') as File | null;

  // ── Validate ─────────────────────────────────────────────────────────────
  if (!VALID_DOC_TYPES.has(docType)) {
    return NextResponse.json(
      { error: 'Select a valid ID type (NIN, Driver’s License, or International Passport).' },
      { status: 422 },
    );
  }
  if (docNumber.length < MIN_DOC_NUMBER_CHARS) {
    return NextResponse.json({ error: 'Enter the number on your ID document.' }, { status: 422 });
  }
  if (fullLegalName.length < MIN_NAME_CHARS) {
    return NextResponse.json(
      { error: 'Enter your full legal name exactly as it appears on the ID.' },
      { status: 422 },
    );
  }
  if (!VALID_PURPOSES.has(purposeOfAccount)) {
    return NextResponse.json({ error: 'Select what you’ll use this account for.' }, { status: 422 });
  }
  if (!VALID_SOURCES.has(sourceOfFunds)) {
    return NextResponse.json({ error: 'Select your main source of funds.' }, { status: 422 });
  }

  // Address validation
  if (addressLine1.length < 4) {
    return NextResponse.json({ error: 'Enter your street address (line 1).' }, { status: 422 });
  }
  if (city.length < 2) {
    return NextResponse.json({ error: 'Enter your city.' }, { status: 422 });
  }
  if (!VALID_NG_STATES.has(addressState)) {
    return NextResponse.json({ error: 'Pick your Nigerian state.' }, { status: 422 });
  }
  if (!/^\d{6}$/.test(postalCode)) {
    return NextResponse.json({ error: 'Postal code must be 6 digits.' }, { status: 422 });
  }

  // BVN validation (optional on submission but strongly recommended)
  if (bvn && !/^\d{11}$/.test(bvn)) {
    return NextResponse.json({ error: 'BVN must be exactly 11 digits.' }, { status: 422 });
  }

  // DOB validation. Required because Graph rejects USD provisioning
  // without it ("Missing fields required by Graph: dob"). We enforce
  // YYYY-MM-DD format + 18+ here in addition to the in-form check.
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dob)) {
    return NextResponse.json({ error: 'Enter your date of birth.' }, { status: 422 });
  }
  const dobDate = new Date(dob + 'T00:00:00Z');
  if (Number.isNaN(dobDate.getTime())) {
    return NextResponse.json({ error: 'That date of birth isn\'t valid.' }, { status: 422 });
  }
  const eighteenYearsAgo = new Date();
  eighteenYearsAgo.setUTCFullYear(eighteenYearsAgo.getUTCFullYear() - 18);
  if (dobDate > eighteenYearsAgo) {
    return NextResponse.json(
      { error: 'You must be at least 18 to open an account.' },
      { status: 422 },
    );
  }
  // Sanity-check the lower bound — anything before 1900 is almost
  // certainly a typo and Graph would reject it anyway.
  if (dobDate < new Date('1900-01-01T00:00:00Z')) {
    return NextResponse.json({ error: 'That date of birth isn\'t valid.' }, { status: 422 });
  }

  // Background info validation
  if (!VALID_EMPLOYMENT.has(employmentStatus)) {
    return NextResponse.json({ error: 'Choose your employment status.' }, { status: 422 });
  }
  if (occupation.length < 2) {
    return NextResponse.json({ error: 'Enter your occupation.' }, { status: 422 });
  }
  const expectedMonthlyInflowCents = Number(expectedMonthlyInflowCentsStr);
  if (!Number.isFinite(expectedMonthlyInflowCents) || expectedMonthlyInflowCents < 0) {
    return NextResponse.json({ error: 'Expected monthly inflow is invalid.' }, { status: 422 });
  }

  const idFrontErr = validateFile('idFront', idFront, 'image');
  if (idFrontErr) return NextResponse.json({ error: idFrontErr }, { status: 422 });

  const selfieErr = validateFile('selfie', selfie, 'image');
  if (selfieErr) return NextResponse.json({ error: selfieErr }, { status: 422 });

  const livenessErr = validateFile('liveness', liveness, 'video');
  if (livenessErr) return NextResponse.json({ error: livenessErr }, { status: 422 });

  const poaErr = validateFile('proofOfAddress', proofOfAddress, 'image');
  if (poaErr) return NextResponse.json({ error: poaErr }, { status: 422 });

  if (REQUIRES_ID_BACK.has(docType)) {
    const idBackErr = validateFile('idBack', idBack, 'image');
    if (idBackErr) return NextResponse.json({ error: idBackErr }, { status: 422 });
  } else if (idBack) {
    // Optional but if provided must validate
    const idBackErr = validateFile('idBack', idBack, 'image');
    if (idBackErr) return NextResponse.json({ error: idBackErr }, { status: 422 });
  }

  // ── User eligibility ─────────────────────────────────────────────────────
  const user = await prisma.user.findUnique({
    where: { id: session.userId },
    select: {
      id: true,
      kycTier: true,
      kycStatus: true,
      status: true,
      email: true,
      firstName: true,
      lastName: true,
      kycSubmissions: {
        where: { status: { in: ['PENDING', 'PROCESSING'] } },
        select: { id: true, tier: true, status: true },
        take: 1,
      },
    },
  });

  if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 });
  if (user.status === 'SUSPENDED' || user.status === 'CLOSED') {
    return NextResponse.json({ error: 'Your account is not able to submit KYC.' }, { status: 403 });
  }
  if (user.kycTier === 'T2' || user.kycTier === 'T3') {
    return NextResponse.json({ error: 'You are already verified.' }, { status: 409 });
  }
  if (user.kycSubmissions.length > 0) {
    return NextResponse.json(
      { error: 'You already have a submission under review. Please wait for our decision.' },
      { status: 409 },
    );
  }

  // ── Upload files (envelope-encrypted to disk / S3) ───────────────────────
  const submissionPrefix = `${session.userId}-${Date.now()}`;
  let idFrontUpload, selfieUpload, livenessUpload, idBackUpload, proofOfAddressUpload;
  try {
    [idFrontUpload, selfieUpload, livenessUpload, proofOfAddressUpload, idBackUpload] = await Promise.all([
      storeKycFile(idFront!, session.userId, submissionPrefix, 'id_front'),
      storeKycFile(selfie!, session.userId, submissionPrefix, 'selfie'),
      storeKycFile(liveness!, session.userId, submissionPrefix, 'liveness'),
      storeKycFile(proofOfAddress!, session.userId, submissionPrefix, 'proof_of_address'),
      idBack ? storeKycFile(idBack, session.userId, submissionPrefix, 'id_back') : Promise.resolve(null),
    ]);
  } catch (err) {
    logger.error(
      { userId: session.userId, err: err instanceof Error ? err.message : String(err) },
      'KYC file storage failed',
    );
    return NextResponse.json(
      { error: 'Could not store your documents. Please try again in a moment.' },
      { status: 500 },
    );
  }

  // ── Encrypt PII ──────────────────────────────────────────────────────────
  const encryptedDocNumber = encryptField(docNumber, session.userId);
  const encryptedName = encryptField(fullLegalName, session.userId);
  const encryptedBvn = bvn ? encryptField(bvn, session.userId) : null;
  const bvnBlindIdx = bvn ? blindIndex(bvn) : null;
  // DOB is also encrypted on the user row (User.dob is JSONB
  // CipherPayload). Graph sync decrypts it back when sending the
  // /person payload upstream. Encryption context = userId so a leaked
  // ciphertext can't be moved to another row.
  const encryptedDob = encryptField(dob, session.userId);

  // ── BVN duplicate-account check ──────────────────────────────────────────
  //
  // The bvn_blind_index column is UNIQUE on kyc_submissions, which is meant
  // to catch one BVN being used by multiple accounts (a common fraud
  // pattern). But the same user re-submitting after a rejection ALSO
  // hits the same blind index — and the previous code would crash with
  // P2002 when that happened, leaving the customer unable to retry.
  //
  // The fix: do the duplicate-account check ourselves, in app code, so
  // we can distinguish "same user retrying" (allow, just don't write the
  // blind index again) from "different user claiming same BVN" (block
  // with a clear error). On a same-user retry we still persist the BVN
  // ciphertext on the new row — the customer's review needs it — but we
  // leave bvnBlindIndex null because the prior row already holds it.
  let bvnBlindIdxForInsert: string | null = bvnBlindIdx;
  if (bvnBlindIdx) {
    const existing = await prisma.kycSubmission.findFirst({
      where: { bvnBlindIndex: bvnBlindIdx },
      select: { userId: true },
    });
    if (existing && existing.userId !== session.userId) {
      return NextResponse.json(
        { error: 'This BVN is already linked to another FrenzPay account. If this is a mistake, please contact support@frenzpay.co.' },
        { status: 409 },
      );
    }
    if (existing && existing.userId === session.userId) {
      // Same user resubmitting — keep the blind index null on the new
      // row so the unique constraint is satisfied. The prior submission
      // still owns it, which is fine for fraud-detection purposes.
      bvnBlindIdxForInsert = null;
    }
  }

  const encryptedLine1 = encryptField(addressLine1, session.userId);
  const encryptedLine2 = addressLine2 ? encryptField(addressLine2, session.userId) : null;
  const encryptedCity = encryptField(city, session.userId);
  const encryptedPostal = encryptField(postalCode, session.userId);

  // Map doc type to the specific encrypted column in KycSubmission
  const docFieldMap: Record<string, 'nin' | 'passportNumber' | 'driverLicenseNumber' | 'votersCardNumber'> = {
    nin: 'nin',
    passport: 'passportNumber',
    drivers_license: 'driverLicenseNumber',
    voters_card: 'votersCardNumber',
  };

  // Build document rows
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const docCreateList: any[] = [
    {
      docType: 'id_front',
      storageKey: idFrontUpload.storageKey,
      encryptedDek: idFrontUpload.encryptedDek,
      mimeType: idFront!.type,
      fileSizeBytes: BigInt(idFront!.size),
    },
    {
      docType: 'selfie',
      storageKey: selfieUpload.storageKey,
      encryptedDek: selfieUpload.encryptedDek,
      mimeType: selfie!.type,
      fileSizeBytes: BigInt(selfie!.size),
    },
    {
      docType: 'liveness',
      storageKey: livenessUpload.storageKey,
      encryptedDek: livenessUpload.encryptedDek,
      mimeType: liveness!.type,
      fileSizeBytes: BigInt(liveness!.size),
    },
  ];
  if (idBackUpload && idBack) {
    docCreateList.push({
      docType: 'id_back',
      storageKey: idBackUpload.storageKey,
      encryptedDek: idBackUpload.encryptedDek,
      mimeType: idBack.type,
      fileSizeBytes: BigInt(idBack.size),
    });
  }
  docCreateList.push({
    docType: 'proof_of_address',
    storageKey: proofOfAddressUpload!.storageKey,
    encryptedDek: proofOfAddressUpload!.encryptedDek,
    mimeType: proofOfAddress!.type,
    fileSizeBytes: BigInt(proofOfAddress!.size),
  });

  // ── Persist ──────────────────────────────────────────────────────────────
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const submission = await prisma.$transaction(async (tx: any) => {
    const sub = await tx.kycSubmission.create({
      data: {
        userId: session.userId,
        tier: 'T2',                 // single-tier internal KYC: T0 → (PENDING) → T2 on approve
        status: 'PENDING',
        provider: 'manual',
        fullLegalName: encryptedName,
        [docFieldMap[docType]]: encryptedDocNumber,
        ...(encryptedBvn ? { bvn: encryptedBvn, bvnBlindIndex: bvnBlindIdxForInsert } : {}),
        sourceOfFunds,
        purposeOfAccount,
        employmentStatus,
        occupation,
        expectedMonthlyInflowCents: BigInt(Math.round(expectedMonthlyInflowCents)),
        documents: { create: docCreateList },
      },
    });

    // Persist address + structured fields on the user so Graph sync has them.
    await tx.user.update({
      where: { id: session.userId },
      data: {
        kycStatus: 'PENDING_REVIEW',
        // First / middle / last as plain TEXT columns on User. Graph
        // sync reads them directly without needing decryption.
        // middleName stays nullable when the customer's ID has no
        // middle name (Graph payload sends '' for those).
        firstName: splitName.first,
        middleName: splitName.middle || null,
        lastName: splitName.last,
        addressLine1: encryptedLine1 as any,
        addressLine2: (encryptedLine2 as any) ?? undefined,
        city: encryptedCity as any,
        addressState,
        postalCode: encryptedPostal as any,
        // DOB encrypted JSONB — Graph sync decrypts to send upstream.
        dob: encryptedDob as any,
        // Ensure a country is set for Graph — default NG if not already set.
        country: 'NG',
      },
    });

    await tx.auditLog.create({
      data: {
        userId: session.userId,
        action: 'KYC_SUBMITTED',
        resourceType: 'KycSubmission',
        resourceId: sub.id,
        metadata: {
          docType,
          purposeOfAccount,
          sourceOfFunds,
          hasIdBack: !!idBackUpload,
          livenessMime: liveness!.type,
          // The recorder names live clips `liveness-<ts>.{webm,mp4}` and
          // gallery uploads `liveness-uploaded-<ts>.<ext>`. Capturing the
          // source here so the admin reviewer + audit trail can tell the
          // two apart even though both go through this same endpoint.
          livenessSource: liveness!.name.startsWith('liveness-uploaded') ? 'uploaded' : 'recorded',
        },
      },
    });

    return sub;
  });

  logger.info(
    { userId: session.userId, submissionId: submission.id, docType },
    'KYC submission received',
  );

  // ── Fire notifications (best-effort — don't fail the request if SMTP is down) ──
  const displayName = `${user.firstName ?? ''} ${user.lastName ?? ''}`.trim() || user.email;
  void Promise.allSettled([
    sendKYCSubmittedEmail(user.email, displayName).catch((err) =>
      logger.warn({ err: err instanceof Error ? err.message : err }, 'KYC submitted email failed'),
    ),
    sendAdminNewKYCNotification(displayName, user.email).catch((err) =>
      logger.warn({ err: err instanceof Error ? err.message : err }, 'Admin KYC notification failed'),
    ),
  ]);

  return NextResponse.json(
    {
      submissionId: submission.id,
      status: 'PENDING',
      message: 'We’ve received your documents. Our team will review within 24 hours and email you with the outcome.',
    },
    { status: 201 },
  );
}
