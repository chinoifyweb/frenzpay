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
const ALLOWED_VIDEO_MIME = new Set(['video/mp4', 'video/webm', 'video/quicktime']);
const MAX_IMAGE_BYTES = 10 * 1024 * 1024;        // 10 MB per image
const MAX_LIVENESS_BYTES = 25 * 1024 * 1024;     // 25 MB for liveness (video)

const VALID_DOC_TYPES = new Set(['nin', 'passport', 'drivers_license']);
const REQUIRES_ID_BACK = new Set(['drivers_license']);

const VALID_PURPOSES = new Set([
  'personal', 'business', 'freelance', 'ecommerce', 'investment', 'remittance', 'other',
]);
const VALID_SOURCES = new Set([
  'salary', 'business', 'freelance', 'investments', 'gift', 'savings', 'other',
]);

const MIN_NAME_CHARS = 4;
const MIN_DOC_NUMBER_CHARS = 5;

// ── Helpers ────────────────────────────────────────────────────────────────

function validateFile(
  label: string,
  file: File | null,
  kind: 'image' | 'video-or-image',
): string | null {
  if (!file) return `${label} file is required`;
  const allowed = kind === 'image'
    ? ALLOWED_IMAGE_MIME
    : new Set<string>([...ALLOWED_IMAGE_MIME, ...ALLOWED_VIDEO_MIME]);
  if (!allowed.has(file.type)) {
    return `${label}: unsupported file type ${file.type}`;
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
  const purposeOfAccount = (formData.get('purposeOfAccount')?.toString() ?? '').trim().toLowerCase();
  const sourceOfFunds = (formData.get('sourceOfFunds')?.toString() ?? '').trim().toLowerCase();
  const bvn = (formData.get('bvn')?.toString() ?? '').trim();

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
      { error: 'Select a valid ID type (NIN, Driver\u2019s License, or International Passport).' },
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
    return NextResponse.json({ error: 'Select what you\u2019ll use this account for.' }, { status: 422 });
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

  const livenessErr = validateFile('liveness', liveness, 'video-or-image');
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
  const encryptedLine1 = encryptField(addressLine1, session.userId);
  const encryptedLine2 = addressLine2 ? encryptField(addressLine2, session.userId) : null;
  const encryptedCity = encryptField(city, session.userId);
  const encryptedPostal = encryptField(postalCode, session.userId);

  // Map doc type to the specific encrypted column in KycSubmission
  const docFieldMap: Record<string, 'nin' | 'passportNumber' | 'driverLicenseNumber'> = {
    nin: 'nin',
    passport: 'passportNumber',
    drivers_license: 'driverLicenseNumber',
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
        ...(encryptedBvn ? { bvn: encryptedBvn, bvnBlindIndex: bvnBlindIdx } : {}),
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
        addressLine1: encryptedLine1 as any,
        addressLine2: (encryptedLine2 as any) ?? undefined,
        city: encryptedCity as any,
        addressState,
        postalCode: encryptedPostal as any,
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
      message: 'We\u2019ve received your documents. Our team will review within 24 hours and email you with the outcome.',
    },
    { status: 201 },
  );
}
