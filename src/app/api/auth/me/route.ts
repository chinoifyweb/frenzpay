import { NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { queryOne } from '@/lib/db'

export async function GET() {
  const session = await getSession()
  if (!session) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }

  const user = await queryOne<{
    id: string; email: string; full_name: string; phone: string | null;
    avatar_url: string | null; role: string; is_verified: boolean;
    kyc_status: string; referral_code: string; created_at: string;
  }>(
    'SELECT id, email, full_name, phone, avatar_url, role, is_verified, kyc_status, referral_code, created_at FROM users WHERE id = $1 AND is_active = true',
    [session.userId]
  )

  if (!user) {
    return NextResponse.json({ error: 'User not found' }, { status: 404 })
  }

  return NextResponse.json({ user })
}
