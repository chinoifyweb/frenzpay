/**
 * GET /api/admin/kyc
 * List KYC submissions for admin review.
 * Query params: status (PENDING|PROCESSING|APPROVED|REJECTED), tier (T1|T2|T3), page, limit
 */
import { NextRequest, NextResponse } from 'next/server';
import { requireSession } from '@/lib/session';
import { prisma } from '@frenzpay/db';
import { decryptField, type CipherPayload } from '@frenzpay/crypto';

function tryDecrypt(payload: unknown): string | null {
  if (!payload || typeof payload !== 'object') return null;
  try {
    return decryptField(payload as CipherPayload);
  } catch {
    return null;
  }
}

export async function GET(req: NextRequest) {
  const { session } = await requireSession();

  if (session.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { searchParams } = req.nextUrl;
  const status = searchParams.get('status') ?? 'PENDING';
  const tier = searchParams.get('tier');
  const page = Math.max(1, parseInt(searchParams.get('page') ?? '1', 10));
  const limit = Math.min(50, parseInt(searchParams.get('limit') ?? '20', 10));

  const where: any = {};
  if (['PENDING', 'PROCESSING', 'APPROVED', 'REJECTED', 'EXPIRED'].includes(status)) {
    where.status = status;
  }
  if (tier && ['T1', 'T2', 'T3'].includes(tier)) {
    where.tier = tier;
  }

  const [submissions, total] = await Promise.all([
    prisma.kycSubmission.findMany({
      where,
      orderBy: { submittedAt: 'asc' },
      skip: (page - 1) * limit,
      take: limit,
      select: {
        id: true,
        tier: true,
        status: true,
        provider: true,
        submittedAt: true,
        reviewedAt: true,
        rejectionReason: true,
        // Encrypted PII + non-encrypted attestations
        fullLegalName: true,
        nin: true,
        passportNumber: true,
        driverLicenseNumber: true,
        votersCardNumber: true,
        purposeOfAccount: true,
        sourceOfFunds: true,
        user: {
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
            kycTier: true,
            kycStatus: true,
          },
        },
        documents: {
          select: {
            id: true,
            docType: true,
            mimeType: true,
            fileSizeBytes: true,
            createdAt: true,
          },
        },
      },
    }),
    prisma.kycSubmission.count({ where }),
  ]);

  // Pull the KYC_SUBMITTED audit row for this page in one shot — its
  // metadata.livenessSource tells us whether the customer recorded live
  // in the browser or uploaded a clip from their gallery via the
  // fallback. Surface that to the admin so reviewers can weight the
  // liveness check appropriately (uploaded clips are easier to fake and
  // deserve a closer look).
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const submissionIds = submissions.map((s: any) => s.id);
  const submitLogs = submissionIds.length
    ? await prisma.auditLog.findMany({
        where: {
          action: 'KYC_SUBMITTED',
          resourceType: 'KycSubmission',
          resourceId: { in: submissionIds },
        },
        select: { resourceId: true, metadata: true },
      })
    : [];
  const livenessSourceById = new Map<string, 'recorded' | 'uploaded' | null>();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const row of submitLogs as any[]) {
    if (!row.resourceId) continue;
    const src = row.metadata?.livenessSource;
    livenessSourceById.set(row.resourceId, src === 'uploaded' || src === 'recorded' ? src : null);
  }

  // Decrypt PII fields server-side for admin viewing. These never hit the
  // client as ciphertext — the plain name / doc number is what the admin
  // actually needs to compare against the ID photo.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const enriched = submissions.map((s: any) => ({
    ...s,
    fullLegalName: tryDecrypt(s.fullLegalName),
    // Return the one populated doc-number column in a single tidy field
    docNumber:
      tryDecrypt(s.nin) ??
      tryDecrypt(s.passportNumber) ??
      tryDecrypt(s.driverLicenseNumber) ??
      tryDecrypt(s.votersCardNumber) ??
      null,
    docKind:
      s.nin ? 'nin'
      : s.passportNumber ? 'passport'
      : s.driverLicenseNumber ? 'drivers_license'
      : s.votersCardNumber ? 'voters_card'
      : null,
    // Drop raw ciphertexts from the response
    nin: undefined,
    passportNumber: undefined,
    driverLicenseNumber: undefined,
    votersCardNumber: undefined,
    livenessSource: livenessSourceById.get(s.id) ?? null,
    // Serialise BigInt file sizes so JSON.stringify doesn't crash
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    documents: s.documents.map((d: any) => ({
      ...d,
      fileSizeBytes: d.fileSizeBytes.toString(),
    })),
  }));

  return NextResponse.json({
    submissions: enriched,
    pagination: { page, limit, total, pages: Math.ceil(total / limit) },
  });
}
