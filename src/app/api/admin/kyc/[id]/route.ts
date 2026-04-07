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
    const { action, rejection_reason } = await request.json()

    if (!['approve', 'reject'].includes(action)) {
      return NextResponse.json({ error: 'Invalid action' }, { status: 400 })
    }
    if (action === 'reject' && !rejection_reason) {
      return NextResponse.json({ error: 'Rejection reason required' }, { status: 400 })
    }

    const kyc = await queryOne<{ id: string; user_id: string }>(
      'SELECT id, user_id FROM kyc_records WHERE id = $1',
      [id]
    )
    if (!kyc) return NextResponse.json({ error: 'KYC record not found' }, { status: 404 })

    const newStatus = action === 'approve' ? 'verified' : 'rejected'

    await query(
      'UPDATE kyc_records SET status=$1, reviewed_by=$2, rejection_reason=$3, reviewed_at=NOW() WHERE id=$4',
      [newStatus, session.userId, action === 'reject' ? rejection_reason : null, id]
    )
    await query('UPDATE users SET kyc_status=$1 WHERE id=$2', [newStatus, kyc.user_id])
    await query(
      'INSERT INTO audit_logs (user_id, action, resource_type, resource_id, metadata) VALUES ($1,$2,$3,$4,$5)',
      [session.userId, `kyc_${action}d`, 'kyc_record', id, JSON.stringify({ user_id: kyc.user_id })]
    )

    return NextResponse.json({ message: `KYC ${action}d successfully` })
  } catch (error) {
    console.error('KYC review error:', error)
    return NextResponse.json({ error: 'Something went wrong' }, { status: 500 })
  }
}
