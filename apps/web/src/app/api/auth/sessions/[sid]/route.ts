/**
 * DELETE /api/auth/sessions/:sid — revoke a specific session
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireSession, deleteSession } from '@/lib/session';

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ sid: string }> },
) {
  const { sid: currentSid, session } = await requireSession();
  const { sid: targetSid } = await params;

  if (targetSid === currentSid) {
    return NextResponse.json(
      { error: 'Use POST /api/auth/logout to end your current session.' },
      { status: 400 },
    );
  }

  await deleteSession(targetSid, session.userId);

  return NextResponse.json({ revoked: true });
}
