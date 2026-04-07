import { NextRequest, NextResponse } from 'next/server'
import bcrypt from 'bcryptjs'
import { queryOne, query } from '@/lib/db'
import { createSessionToken, sessionCookieOptions } from '@/lib/auth'

export async function POST(request: NextRequest) {
  try {
    const { email, password, full_name, referral_code } = await request.json()

    if (!email || !password || !full_name) {
      return NextResponse.json({ error: 'Email, password, and name are required' }, { status: 400 })
    }

    if (password.length < 8) {
      return NextResponse.json({ error: 'Password must be at least 8 characters' }, { status: 400 })
    }

    const existing = await queryOne('SELECT id FROM users WHERE email = $1', [email.toLowerCase().trim()])
    if (existing) {
      return NextResponse.json({ error: 'An account with this email already exists' }, { status: 409 })
    }

    const password_hash = await bcrypt.hash(password, 12)

    // Find referrer if code provided
    let referred_by: string | null = null
    if (referral_code) {
      const referrer = await queryOne<{ id: string }>('SELECT id FROM users WHERE referral_code = $1', [referral_code])
      if (referrer) referred_by = referrer.id
    }

    const [user] = await query<{
      id: string; email: string; full_name: string; role: string; kyc_status: string;
    }>(
      'INSERT INTO users (email, password_hash, full_name, referred_by) VALUES ($1, $2, $3, $4) RETURNING id, email, full_name, role, kyc_status',
      [email.toLowerCase().trim(), password_hash, full_name.trim(), referred_by]
    )

    // Record referral
    if (referred_by) {
      await query(
        'INSERT INTO referrals (referrer_id, referred_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
        [referred_by, user.id]
      )
    }

    const token = await createSessionToken({
      userId: user.id,
      email: user.email,
      role: user.role,
      fullName: user.full_name,
    })

    const response = NextResponse.json({ user }, { status: 201 })
    response.cookies.set(sessionCookieOptions(token))
    return response
  } catch (err) {
    console.error('Signup error:', err)
    return NextResponse.json({ error: 'An unexpected error occurred' }, { status: 500 })
  }
}
