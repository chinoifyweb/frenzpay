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

export async function POST(request: NextRequest) {
  try {
    const supabase = await getSupabase()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Check KYC status
    const { data: profile } = await supabase
      .from('users')
      .select('kyc_status, is_active')
      .eq('id', user.id)
      .single()

    if (!profile?.is_active) {
      return NextResponse.json({ error: 'Account is suspended' }, { status: 403 })
    }

    if (profile?.kyc_status !== 'verified') {
      return NextResponse.json({ error: 'KYC verification required' }, { status: 403 })
    }

    const { wallet_id, amount, currency, wallet_address, network } = await request.json()

    // Validate inputs
    if (!wallet_id || !amount || !currency || !wallet_address || !network) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    if (amount < 10) {
      return NextResponse.json({ error: 'Minimum withdrawal is $10' }, { status: 400 })
    }

    if (!['trc20', 'erc20'].includes(network)) {
      return NextResponse.json({ error: 'Invalid network' }, { status: 400 })
    }

    // Basic wallet address validation
    if (network === 'trc20' && !wallet_address.startsWith('T')) {
      return NextResponse.json({ error: 'Invalid TRC-20 address' }, { status: 400 })
    }
    if (network === 'erc20' && !wallet_address.startsWith('0x')) {
      return NextResponse.json({ error: 'Invalid ERC-20 address' }, { status: 400 })
    }

    // Check wallet belongs to user and has sufficient balance
    const { data: wallet } = await supabase
      .from('wallets')
      .select('*')
      .eq('id', wallet_id)
      .eq('user_id', user.id)
      .single()

    if (!wallet) {
      return NextResponse.json({ error: 'Wallet not found' }, { status: 404 })
    }

    // Calculate fees
    const feePercentage = 1.5 / 100
    const networkFee = network === 'trc20' ? 1.0 : 5.0
    const fee = amount * feePercentage + networkFee
    const usdtRate = 1.0 // Simplified — in production, fetch real-time rate
    const usdtAmount = (amount - fee) * usdtRate

    if (wallet.available_balance < amount) {
      return NextResponse.json({ error: 'Insufficient balance' }, { status: 400 })
    }

    // Create withdrawal record
    const { data: withdrawal, error: withdrawalError } = await supabase
      .from('withdrawals')
      .insert({
        user_id: user.id,
        wallet_id,
        amount,
        currency,
        fee,
        usdt_amount: usdtAmount,
        usdt_rate: usdtRate,
        wallet_address,
        network,
        status: 'pending',
      })
      .select()
      .single()

    if (withdrawalError) throw withdrawalError

    // Debit wallet (hold funds)
    await supabase.rpc('decrement_wallet_balance', {
      p_wallet_id: wallet_id,
      p_amount: amount,
    })

    // Create debit transaction
    await supabase.from('transactions').insert({
      user_id: user.id,
      wallet_id,
      type: 'debit',
      amount,
      currency,
      fee,
      net_amount: amount - fee,
      description: `USDT Withdrawal to ${wallet_address.slice(0, 8)}...`,
      reference: `WDR-${withdrawal.id.slice(0, 8).toUpperCase()}`,
      status: 'pending',
    })

    // Audit log
    await supabase.from('audit_logs').insert({
      user_id: user.id,
      action: 'withdrawal_created',
      resource_type: 'withdrawal',
      resource_id: withdrawal.id,
      metadata: { amount, currency, network, wallet_address },
    })

    return NextResponse.json({
      message: 'Withdrawal submitted successfully',
      withdrawal,
    }, { status: 201 })
  } catch (error) {
    console.error('Withdrawal error:', error)
    return NextResponse.json({ error: 'Something went wrong' }, { status: 500 })
  }
}

export async function GET() {
  try {
    const supabase = await getSupabase()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { data: withdrawals } = await supabase
      .from('withdrawals')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })

    return NextResponse.json({ withdrawals })
  } catch (error) {
    console.error('Get withdrawals error:', error)
    return NextResponse.json({ error: 'Something went wrong' }, { status: 500 })
  }
}
