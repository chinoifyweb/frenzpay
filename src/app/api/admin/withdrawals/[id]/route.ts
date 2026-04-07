import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth'
import { query, queryOne } from '@/lib/db'

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getSession()
    if (!session || session.role !== 'admin') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
    }

    const { id } = await params
    const { action, tx_hash, rejection_reason } = await request.json()

    if (!['approve', 'reject', 'complete'].includes(action)) {
      return NextResponse.json({ error: 'Invalid action' }, { status: 400 })
    }

    const withdrawal = await queryOne<{ id: string; wallet_id: string; amount: number; user_id: string }>(
      'SELECT id, wallet_id, amount, user_id FROM withdrawals WHERE id = $1',
      [id]
    )
    if (!withdrawal) return NextResponse.json({ error: 'Withdrawal not found' }, { status: 404 })

    if (action === 'approve') {
      await query('UPDATE withdrawals SET status=$1, reviewed_by=$2 WHERE id=$3', ['processing', session.userId, id])
    } else if (action === 'reject') {
      if (!rejection_reason) return NextResponse.json({ error: 'Rejection reason required' }, { status: 400 })
      await query('UPDATE withdrawals SET status=$1, reviewed_by=$2 WHERE id=$3', ['failed', session.userId, id])
      // Refund balance
      await query(
        'UPDATE wallets SET available_balance = available_balance + $1, balance = balance + $1, updated_at=NOW() WHERE id=$2',
        [withdrawal.amount, withdrawal.wallet_id]
      )
    } else if (action === 'complete') {
      if (!tx_hash) return NextResponse.json({ error: 'Transaction hash required' }, { status: 400 })
      await query(
        'UPDATE withdrawals SET status=$1, tx_hash=$2, completed_at=NOW() WHERE id=$3',
        ['completed', tx_hash, id]
      )
    }

    await query(
      'INSERT INTO audit_logs (user_id, action, resource_type, resource_id, metadata) VALUES ($1,$2,$3,$4,$5)',
      [session.userId, `withdrawal_${action}d`, 'withdrawal', id, JSON.stringify({ tx_hash, rejection_reason })]
    )

    return NextResponse.json({ message: `Withdrawal ${action}d successfully` })
  } catch (error) {
    console.error('Withdrawal review error:', error)
    return NextResponse.json({ error: 'Something went wrong' }, { status: 500 })
  }
}
