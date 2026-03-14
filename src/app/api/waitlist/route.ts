import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { sendWaitlistConfirmation, sendAdminNewWaitlistNotification } from '@/lib/email'

function getAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

export async function POST(request: NextRequest) {
  try {
    const { email, full_name, referral_source } = await request.json()

    if (!email || !email.includes('@')) {
      return NextResponse.json({ error: 'Valid email is required' }, { status: 400 })
    }

    const supabase = getAdminClient()

    const { error } = await supabase.from('waitlist').insert({
      email: email.toLowerCase().trim(),
      full_name: full_name?.trim() || null,
      referral_source: referral_source || null,
    })

    if (error) {
      if (error.code === '23505') {
        return NextResponse.json({ message: 'You are already on the waitlist!' }, { status: 200 })
      }
      throw error
    }

    // Send emails (don't block the response if they fail)
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
