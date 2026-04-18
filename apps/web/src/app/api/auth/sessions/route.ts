/**
 * GET  /api/auth/sessions  — list all active sessions for the current user
 * DELETE /api/auth/sessions — revoke all OTHER sessions (except current)
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireSession, listUserSessions, deleteSession } from '@/lib/session';

export async function GET() {
  const { sid, session } = await requireSession();

  const sessions = await listUserSessions(session.userId);

  return NextResponse.json({
    sessions: sessions.map((s) => ({
      sid: s.sid,
      isCurrent: s.sid === sid,
      ipAddress: s.ipAddress,
      userAgent: s.userAgent,
      createdAt: s.createdAt,
      lastActiveAt: s.lastActiveAt,
    })),
  });
}

export async function DELETE(request: NextRequest) {
  const { sid, session } = await requireSession();

  const sessions = await listUserSessions(session.userId);
  const others = sessions.filter((s) => s.sid !== sid);

  await Promise.all(
    others.map((s) => deleteSession(s.sid, session.userId)),
  );

  return NextResponse.json({
    revoked: others.length,
    message: `${others.length} other session(s) revoked.`,
  });
}
