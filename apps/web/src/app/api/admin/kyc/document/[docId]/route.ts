/**
 * GET /api/admin/kyc/document/[docId]
 *
 * Stream a decrypted KYC document back to an authenticated admin. The
 * ciphertext lives on disk (or S3, once wired); we fetch it, unwrap the
 * per-file DEK with the platform KEK, decrypt in-memory, and pipe the
 * plaintext bytes through as the original mimeType.
 *
 * The docId is the KycDocument PK (uuid). We look up the submission's
 * storageKey + encryptedDek, verify the admin has permission, write an
 * audit log entry (so we can see who looked at what), and stream.
 *
 * The plaintext is NEVER written to disk on the server. It exists only in
 * the response buffer for the duration of this request.
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireSession } from '@/lib/session';
import { prisma } from '@frenzpay/db';
import { fetchKycFile } from '@/lib/kyc-storage';
import { logger } from '@frenzpay/logger';

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ docId: string }> },
) {
  const { session } = await requireSession();
  if (session.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { docId } = await params;

  const doc = await prisma.kycDocument.findUnique({
    where: { id: docId },
    select: {
      id: true,
      docType: true,
      storageKey: true,
      encryptedDek: true,
      mimeType: true,
      submissionId: true,
      submission: { select: { userId: true } },
    },
  });

  if (!doc) return NextResponse.json({ error: 'Document not found' }, { status: 404 });

  // Reject anything that was saved under the old stub format — those have no
  // real bytes on disk to decrypt. Give the admin a clear message instead of
  // a cryptic decryption error.
  if (doc.encryptedDek.startsWith(Buffer.from('stub-dek').toString('base64').slice(0, 10))) {
    return NextResponse.json(
      { error: 'This document predates real storage and cannot be viewed. Ask the user to re-submit.' },
      { status: 410 },
    );
  }

  let plaintext: Buffer;
  try {
    plaintext = await fetchKycFile(doc.storageKey, doc.encryptedDek);
  } catch (err) {
    logger.error(
      { docId, err: err instanceof Error ? err.message : String(err) },
      'KYC document fetch/decrypt failed',
    );
    return NextResponse.json({ error: 'Could not retrieve the document.' }, { status: 500 });
  }

  // Audit — who looked at whose document
  await prisma.auditLog.create({
    data: {
      userId: session.userId,
      action: 'ADMIN_KYC_DOC_VIEWED',
      resourceType: 'KycDocument',
      resourceId: doc.id,
      metadata: {
        targetUserId: doc.submission.userId,
        submissionId: doc.submissionId,
        docType: doc.docType,
      },
    },
  });

  return new NextResponse(new Uint8Array(plaintext), {
    status: 200,
    headers: {
      'Content-Type': doc.mimeType,
      'Content-Length': plaintext.length.toString(),
      'Cache-Control': 'private, no-store, max-age=0',
      // Set the filename so "save" in the browser makes sense
      'Content-Disposition': `inline; filename="${doc.docType}-${doc.id.slice(0, 8)}.${extFor(doc.mimeType)}"`,
    },
  });
}

function extFor(mime: string): string {
  const map: Record<string, string> = {
    'image/jpeg': 'jpg',
    'image/png': 'png',
    'image/webp': 'webp',
    'application/pdf': 'pdf',
    'video/mp4': 'mp4',
    'video/webm': 'webm',
    'video/quicktime': 'mov',
  };
  return map[mime] ?? 'bin';
}
