import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

async function getSupabase() {
  const cookieStore = await cookies()
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return cookieStore.getAll() },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options))
          } catch { /* server component */ }
        },
      },
    }
  )
}

async function verifyAdmin(supabase: Awaited<ReturnType<typeof getSupabase>>) {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const { data: profile } = await supabase
    .from('users')
    .select('role')
    .eq('id', user.id)
    .single()
  if (!profile || profile.role !== 'admin') return null
  return user
}

// Approve or reject KYC
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const supabase = await getSupabase()
    const admin = await verifyAdmin(supabase)

    if (!admin) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
    }

    const { action, rejection_reason } = await request.json()

    if (!['approve', 'reject'].includes(action)) {
      return NextResponse.json({ error: 'Invalid action' }, { status: 400 })
    }

    if (action === 'reject' && !rejection_reason) {
      return NextResponse.json({ error: 'Rejection reason required' }, { status: 400 })
    }

    // Get KYC record
    const { data: kyc } = await supabase
      .from('kyc_records')
      .select('*')
      .eq('id', id)
      .single()

    if (!kyc) {
      return NextResponse.json({ error: 'KYC record not found' }, { status: 404 })
    }

    const newStatus = action === 'approve' ? 'verified' : 'rejected'

    // Update KYC record
    await supabase
      .from('kyc_records')
      .update({
        status: newStatus,
        reviewed_by: admin.id,
        rejection_reason: action === 'reject' ? rejection_reason : null,
        reviewed_at: new Date().toISOString(),
      })
      .eq('id', id)

    // Update user KYC status
    await supabase
      .from('users')
      .update({ kyc_status: newStatus })
      .eq('id', kyc.user_id)

    // Audit log
    await supabase.from('audit_logs').insert({
      user_id: admin.id,
      action: `kyc_${action}d`,
      resource_type: 'kyc_record',
      resource_id: id,
      metadata: { user_id: kyc.user_id, rejection_reason },
    })

    return NextResponse.json({ message: `KYC ${action}d successfully` })
  } catch (error) {
    console.error('KYC review error:', error)
    return NextResponse.json({ error: 'Something went wrong' }, { status: 500 })
  }
}
