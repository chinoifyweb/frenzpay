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
    .from('frenz_users')
    .select('role')
    .eq('id', user.id)
    .single()
  if (!profile || profile.role !== 'admin') return null
  return user
}

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

    const { action, tx_hash, rejection_reason } = await request.json()

    if (!['approve', 'reject', 'complete'].includes(action)) {
      return NextResponse.json({ error: 'Invalid action' }, { status: 400 })
    }

    const { data: withdrawal } = await supabase
      .from('withdrawals')
      .select('*')
      .eq('id', id)
      .single()

    if (!withdrawal) {
      return NextResponse.json({ error: 'Withdrawal not found' }, { status: 404 })
    }

    switch (action) {
      case 'approve':
        await supabase
          .from('withdrawals')
          .update({ status: 'processing', reviewed_by: admin.id })
          .eq('id', id)
        break

      case 'reject':
        if (!rejection_reason) {
          return NextResponse.json({ error: 'Rejection reason required' }, { status: 400 })
        }
        await supabase
          .from('withdrawals')
          .update({ status: 'failed', reviewed_by: admin.id })
          .eq('id', id)

        // Refund balance
        const { data: wallet } = await supabase
          .from('wallets')
          .select('*')
          .eq('id', withdrawal.wallet_id)
          .single()

        if (wallet) {
          await supabase
            .from('wallets')
            .update({
              balance: wallet.balance + withdrawal.amount,
              available_balance: wallet.available_balance + withdrawal.amount,
            })
            .eq('id', wallet.id)
        }
        break

      case 'complete':
        if (!tx_hash) {
          return NextResponse.json({ error: 'Transaction hash required' }, { status: 400 })
        }
        await supabase
          .from('withdrawals')
          .update({
            status: 'completed',
            tx_hash,
            completed_at: new Date().toISOString(),
          })
          .eq('id', id)
        break
    }

    // Audit log
    await supabase.from('audit_logs').insert({
      user_id: admin.id,
      action: `withdrawal_${action}d`,
      resource_type: 'withdrawal',
      resource_id: id,
      metadata: { tx_hash, rejection_reason },
    })

    return NextResponse.json({ message: `Withdrawal ${action}d successfully` })
  } catch (error) {
    console.error('Withdrawal review error:', error)
    return NextResponse.json({ error: 'Something went wrong' }, { status: 500 })
  }
}
