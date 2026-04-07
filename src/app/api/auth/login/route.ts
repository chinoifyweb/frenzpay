import { NextRequest, NextResponse } from 'next/server'
import bcrypt from 'bcryptjs'
import { queryOne } from '@/lib/db'
import { createSessionToken, sessionCookieOptions } from '@/lib/auth'

export async function POST(request: NextRequest) {
  try {
    const { email, password } = await request.json()

    if (!email || !password) {
      return NextResponse.json({ error: 'Email and password are required' }, { status: 400 })
    }

    const user = await queryOne<{
      id: string; email: string; password_hash: string; full_name: string;
      role: string; is_active: boolean; is_verified: boolean; kyc_status: string;
    }>(
      'SELECT id, email, password_hash, full_name, role, is_active, is_verified, kyc_status FROM users WHERE email = $1',
      [email.toLowerCase().trim()]
    )

    if (!user) {
      return NextResponse.json({ error: 'Invalid email or password' }, { status: 401 })
    }

    if (!user.is_active) {
      return NextResponse.json({ error: 'Account is deactivated. Please contact support.' }, { status: 403 })
    }

    const valid = await bcrypt.compare(password, user.password_hash)
    if (!valid) {
      return NextResponse.json({ error: 'Invalid email or password' }, { status: 401 })
    }

    const token = await createSessionToken({
      userId: user.id,
      email: user.email,
      role: user.role,
      fullName: user.full_name,
    })

    const response = NextResponse.json({
      user: {
        id: user.id,
        email: user.email,
        full_name: user.full_name,
        role: user.role,
        is_verified: user.is_verified,
        kyc_status: user.kyc_status,
      }
    })
    response.cookies.set(sessionCookieOptions(token))
    return response
  } catch (err) {
    console.error('Login error:', err)
    return NextResponse.json({ error: 'An unexpected error occurred' }, { status: 500 })
  }
}
