import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/db'
import { sendWaitlistConfirmation, sendAdminNewWaitlistNotification } from '@/lib/email'

export async function POST(request: NextRequest) {
  try {
    const { email, full_name, referral_source } = await request.json()

    if (!email || !email.includes('@')) {
      return NextResponse.json({ error: 'Valid email is required' }, { status: 400 })
    }

    try {
      await query(
        'INSERT INTO waitlist (email, full_name, referral_source) VALUES ($1, $2, $3)',
        [email.toLowerCase().trim(), full_name?.trim() || null, referral_source || null]
      )
    } catch (err: unknown) {
      if ((err as { code?: string }).code === '23505') {
        return NextResponse.json({ message: 'You are already on the waitlist!' }, { status: 200 })
      }
      throw err
    }

    Promise.allSettled([
      sendWaitlistConfirmation(email.toLowerCase().trim()),
      sendAdminNewWaitlistNotification(email.toLowerCase().trim(), full_name?.trim()),
    ]).catch(console.error)

    return NextResponse.json({ message: 'Successfully joined the waitlist!' }, { status: 201 })
  } catch (error) {
    console.error('Waitlist error:', error)
    return NextResponse.json({ error: 'Something went wrong' }, { status: 500 })
  }
}
