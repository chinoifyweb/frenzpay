/**
 * GET /api/kyc-public/:token
 *
 * PUBLIC — no auth on this route — but access is gated by a short-lived,
 * HMAC-signed token minted by graph-sync.ts when we push a document to
 * Graph. The token carries (docId, submissionId, exp); the endpoint verifies
 * the signature, decrypts the on-disk ciphertext, and streams the bytes to
 * the caller.
 *
 * This is the mechanism that lets Graph's compliance engine fetch our
 * encrypted KYC documents without us having to run S3 + pre-signed URLs.
 *
 * Log every access so we have an audit trail of exactly which third party
 * pulled each document and when. Rate-limit-agnostic — Graph fetches each
 * URL at most a couple of times.
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@frenzpay/db';
import { logger } from '@frenzpay/logger';
import { verifyKycDocToken } from '@/lib/graph-sync';
import { fetchKycFile } from '@/lib/kyc-storage';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;

  let payload: { docId: string; submissionId: string; exp: number };
  try {
    payload = verifyKycDocToken(token);
  } catch (err) {
    logger.warn(
      { err: err instanceof Error ? err.message : err, ip: req.headers.get('x-forwarded-for') },
      '[kyc-public] rejected token',
    );
    return NextResponse.json({ error: 'Invalid or expired token' }, { status: 403 });
  }

  const doc = await prisma.kycDocument.findUnique({
    where: { id: payload.docId },
    select: {
      id: true,
      submissionId: true,
      docType: true,
      storageKey: true,
      encryptedDek: true,
      mimeType: true,
    },
  });
  if (!doc || doc.submissionId !== payload.submissionId) {
    return NextResponse.json({ error: 'Document not found' }, { status: 404 });
  }

  let plaintext: Buffer;
  try {
    plaintext = await fetchKycFile(doc.storageKey, doc.encryptedDek);
  } catch (err) {
    logger.error(
      { err: err instanceof Error ? err.message : err, docId: doc.id },
      '[kyc-public] failed to load doc',
    );
    return NextResponse.json({ error: 'Failed to load document' }, { status: 500 });
  }

  // Audit log — record the fetch so ops can see Graph (or anyone else with
  // this signed token) accessed the document.
  try {
    const ua = req.headers.get('user-agent') ?? 'unknown';
    const ip = req.headers.get('x-forwarded-for') ?? 'unknown';
    // Use raw Prisma — we don't want this request to block on a Prisma error.
    await prisma.auditLog.create({
      data: {
        action: 'KYC_DOC_PUBLIC_FETCH',
        resourceType: 'KycDocument',
        resourceId: doc.id,
        ipAddress: typeof ip === 'string' ? ip.split(',')[0].trim() : null,
        metadata: {
          docType: doc.docType,
          submissionId: doc.submissionId,
          userAgent: ua.slice(0, 200),
        },
      },
    });
  } catch (err) {
    logger.warn(
      { err: err instanceof Error ? err.message : err, docId: doc.id },
      '[kyc-public] audit log write failed (non-fatal)',
    );
  }

  return new NextResponse(plaintext as unknown as BodyInit, {
    status: 200,
    headers: {
      'Content-Type': doc.mimeType,
      'Cache-Control': 'private, no-store',
      'Content-Disposition': `inline; filename="${doc.id}.bin"`,
    },
  });
}
