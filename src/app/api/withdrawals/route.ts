import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { query, queryOne } from '@/lib/db'

export async function POST(request: NextRequest) {
  try {
    const session = await getSession()
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const user = await queryOne<{ kyc_status: string; is_active: boolean }>(
      'SELECT kyc_status, is_active FROM users WHERE id = $1',
      [session.userId]
    )

    if (!user?.is_active) return NextResponse.json({ error: 'Account is suspended' }, { status: 403 })
    if (user?.kyc_status !== 'verified') return NextResponse.json({ error: 'KYC verification required' }, { status: 403 })

    const body = await request.json()
    const { wallet_id, amount, currency, withdrawal_type } = body

    if (!wallet_id || !amount || !currency || !withdrawal_type) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }
    if (amount < 10) return NextResponse.json({ error: 'Minimum withdrawal is $10' }, { status: 400 })

    const wallet = await queryOne<{ id: string; available_balance: number }>(
      'SELECT id, available_balance FROM wallets WHERE id = $1 AND user_id = $2',
      [wallet_id, session.userId]
    )
    if (!wallet) return NextResponse.json({ error: 'Wallet not found' }, { status: 404 })
    if (wallet.available_balance < amount) return NextResponse.json({ error: 'Insufficient balance' }, { status: 400 })

    const feePercentage = 1.5 / 100
    let fee = amount * feePercentage
    let insertValues: unknown[]

    if (withdrawal_type === 'usdt') {
      const { wallet_address, network } = body
      if (!wallet_address || !network) return NextResponse.json({ error: 'Missing USDT withdrawal fields' }, { status: 400 })
      const networkFee = network === 'trc20' ? 1.0 : 5.0
      fee += networkFee
      const usdtAmount = (amount - fee) * 1.0
      insertValues = [session.userId, wallet_id, amount, currency, fee, usdtAmount, 1.0, wallet_address, network, 'usdt']
      await query(
        `INSERT INTO withdrawals (user_id, wallet_id, amount, currency, fee, usdt_amount, usdt_rate, wallet_address, network, withdrawal_type, status)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'pending')`,
        insertValues
      )
    } else {
      const { naira_bank_name, naira_account_number, naira_account_name } = body
      if (!naira_bank_name || !naira_account_number || !naira_account_name) {
        return NextResponse.json({ error: 'Missing Naira withdrawal fields' }, { status: 400 })
      }
      await query(
        `INSERT INTO withdrawals (user_id, wallet_id, amount, currency, fee, naira_bank_name, naira_account_number, naira_account_name, withdrawal_type, status)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'naira','pending')`,
        [session.userId, wallet_id, amount, currency, fee, naira_bank_name, naira_account_number, naira_account_name]
      )
    }

    // Deduct from wallet balance
    await query(
      'UPDATE wallets SET available_balance = available_balance - $1, updated_at = NOW() WHERE id = $2',
      [amount, wallet_id]
    )

    // Create debit transaction record
    const ref = `WDR-${Date.now()}-${Math.random().toString(36).slice(2, 7).toUpperCase()}`
    await query(
      `INSERT INTO transactions (user_id, wallet_id, type, amount, currency, fee, net_amount, description, reference, status)
       VALUES ($1,$2,'debit',$3,$4,$5,$6,$7,$8,'pending')`,
      [session.userId, wallet_id, amount, currency, fee, amount - fee, `${withdrawal_type === 'usdt' ? 'USDT' : 'Naira'} Withdrawal`, ref]
    )

    return NextResponse.json({ message: 'Withdrawal submitted successfully' }, { status: 201 })
  } catch (error) {
    console.error('Withdrawal error:', error)
    return NextResponse.json({ error: 'Something went wrong' }, { status: 500 })
  }
}

export async function GET() {
  try {
    const session = await getSession()
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const withdrawals = await query(
      'SELECT * FROM withdrawals WHERE user_id = $1 ORDER BY created_at DESC LIMIT 50',
      [session.userId]
    )

    return NextResponse.json({ withdrawals })
  } catch (error) {
    console.error('Get withdrawals error:', error)
    return NextResponse.json({ error: 'Something went wrong' }, { status: 500 })
  }
}
