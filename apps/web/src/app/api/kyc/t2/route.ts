/**
 * POST /api/kyc/t2
 * Submit KYC T2 (Government ID + selfie).
 *
 * Expects multipart/form-data with fields:
 *   docType        -- 'nin' | 'passport' | 'drivers_license' | 'voters_card'
 *   docNumber      -- raw document number (encrypted server-side)
 *   sourceOfFunds  -- string
 *   idFront        -- File (required)
 *   idBack         -- File (optional)
 *   selfie         -- File (required)
 */
import { NextRequest, NextResponse } from 'next/server';
import { requireSession } from '@/lib/session';
import { prisma } from '@frenzpay/db';
import { encryptField } from '@frenzpay/crypto';
import { canSubmitForTier } from '@frenzpay/kyc';

const ALLOWED_MIME = new Set(['image/jpeg', 'image/png', 'image/webp', 'application/pdf']);
const MAX_FILE_BYTES = 10 * 1024 * 1024; // 10 MB
const VALID_DOC_TYPES = new Set(['nin', 'passport', 'drivers_license', 'voters_card']);

export async function POST(req: NextRequest) {
  const { session } = await requireSession();

  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return NextResponse.json({ error: 'Invalid multipart form data' }, { status: 400 });
  }

  const docType = formData.get('docType')?.toString() ?? '';
  const docNumber = formData.get('docNumber')?.toString() ?? '';
  const sourceOfFunds = formData.get('sourceOfFunds')?.toString() ?? '';
  const idFront = formData.get('idFront') as File | null;
  const idBack = formData.get('idBack') as File | null;
  const selfie = formData.get('selfie') as File | null;

  if (!VALID_DOC_TYPES.has(docType)) {
    return NextResponse.json({ error: 'Invalid docType' }, { status: 422 });
  }
  if (!docNumber || docNumber.length < 5) {
    return NextResponse.json({ error: 'Document number is required' }, { status: 422 });
  }
  if (!sourceOfFunds || sourceOfFunds.length < 3) {
    return NextResponse.json({ error: 'Source of funds is required' }, { status: 422 });
  }
  if (!idFront || !selfie) {
    return NextResponse.json({ error: 'idFront and selfie files are required' }, { status: 422 });
  }

  const filesToCheck: [string, File][] = [['idFront', idFront], ['selfie', selfie]];
  if (idBack) filesToCheck.push(['idBack', idBack]);

  for (const [label, file] of filesToCheck) {
    if (!ALLOWED_MIME.has(file.type)) {
      return NextResponse.json({ error: `${label}: unsupported file type ${file.type}` }, { status: 422 });
    }
    if (file.size > MAX_FILE_BYTES) {
      return NextResponse.json({ error: `${label}: file too large (max 10 MB)` }, { status: 422 });
    }
  }

  const user = await prisma.user.findUnique({
    where: { id: session.userId },
    select: {
      kycTier: true,
      kycSubmissions: {
        where: { tier: 'T2', status: { in: ['PENDING', 'PROCESSING'] } },
        take: 1,
      },
    },
  });

  if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 });

  const tierCheck = canSubmitForTier(user.kycTier as 'T0'|'T1'|'T2'|'T3', 'T2');
  if (!tierCheck.allowed) {
    return NextResponse.json({ error: tierCheck.reason }, { status: 409 });
  }

  if (user.kycSubmissions.length > 0) {
    return NextResponse.json({ error: 'A T2 submission is already under review.' }, { status: 409 });
  }

  // Use timestamp-based prefix for storage path (actual ID assigned by DB)
  const submissionPrefix = `${session.userId}-${Date.now()}`;

  const uploadFile = async (file: File, label: string): Promise<{ storageKey: string; encryptedDek: string }> => {
    const ext = file.type.split('/')[1] ?? 'bin';
    const storageKey = `kyc/${session.userId}/${submissionPrefix}/${label}_${Date.now()}.${ext}`;
    const encryptedDek = Buffer.from(`stub-dek-${Date.now()}`).toString('base64');
    return { storageKey, encryptedDek };
  };

  const [idFrontUpload, selfieUpload, idBackUpload] = await Promise.all([
    uploadFile(idFront, 'id_front'),
    uploadFile(selfie, 'selfie'),
    idBack ? uploadFile(idBack, 'id_back') : Promise.resolve(null),
  ]);

  const encryptedDocNumber = encryptField(docNumber, session.userId);

  const docFieldMap: Record<string, string> = {
    nin: 'nin',
    passport: 'passportNumber',
    drivers_license: 'driverLicenseNumber',
    voters_card: 'driverLicenseNumber',
  };

  const docCreateList: any[] = [
    {
      docType: 'id_front',
      storageKey: idFrontUpload.storageKey,
      encryptedDek: idFrontUpload.encryptedDek,
      mimeType: idFront.type,
      fileSizeBytes: BigInt(idFront.size),
    },
    {
      docType: 'selfie',
      storageKey: selfieUpload.storageKey,
      encryptedDek: selfieUpload.encryptedDek,
      mimeType: selfie.type,
      fileSizeBytes: BigInt(selfie.size),
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

  const submission = await prisma.$transaction(async (tx: any) => {
    const sub = await tx.kycSubmission.create({
      data: {
        userId: session.userId,
        tier: 'T2',
        status: 'PENDING',
        provider: 'manual',
        sourceOfFunds,
        [docFieldMap[docType]!]: encryptedDocNumber,
        documents: { create: docCreateList },
      },
    });

    await tx.user.update({
      where: { id: session.userId },
      data: { kycStatus: 'PENDING_REVIEW' },
    });

    await tx.auditLog.create({
      data: {
        userId: session.userId,
        action: 'KYC_T2_SUBMITTED',
        resourceType: 'KycSubmission',
        resourceId: sub.id,
        metadata: { docType, sourceOfFunds },
      },
    });

    return sub;
  });

  return NextResponse.json(
    {
      submissionId: submission.id,
      status: 'PENDING',
      message: 'Documents received. Our team will review within 1-2 business days.',
    },
    { status: 201 },
  );
}
