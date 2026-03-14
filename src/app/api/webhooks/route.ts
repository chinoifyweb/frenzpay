import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import crypto from 'crypto'

// Supabase admin client for webhook processing
function getAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

// Verify webhook signature from payment provider
function verifySignature(payload: string, signature: string, secret: string): boolean {
  const hash = crypto.createHmac('sha512', secret).update(payload).digest('hex')
  return hash === signature
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.text()
    const signature = request.headers.get('x-provider-signature') || ''

    // Verify webhook signature
    const webhookSecret = process.env.WEBHOOK_SECRET
    if (webhookSecret && !verifySignature(body, signature, webhookSecret)) {
      return NextResponse.json({ error: 'Invalid signature' }, { status: 401 })
    }

    const event = JSON.parse(body)
    const supabase = getAdminClient()

    switch (event.type) {
      case 'transfer.credit': {
        // Incoming payment to virtual account
        const { account_id, amount, currency, sender_name, sender_bank, reference } = event.data

        // Find the virtual account
        const { data: account } = await supabase
          .from('virtual_accounts')
          .select('*, wallets(*)')
          .eq('provider_account_id', account_id)
          .single()

        if (!account) {
          return NextResponse.json({ error: 'Account not found' }, { status: 404 })
        }

        // Create transaction record
        await supabase.from('transactions').insert({
          user_id: account.user_id,
          wallet_id: account.wallet_id,
          type: 'credit',
          amount,
          currency,
          fee: 0,
          net_amount: amount,
          description: `Payment from ${sender_name}`,
          reference,
          sender_name,
          sender_bank,
          status: 'completed',
          provider_reference: event.id,
        })

        // Update wallet balance
        await supabase.rpc('increment_wallet_balance', {
          p_wallet_id: account.wallet_id,
          p_amount: amount,
        })

        // Log audit
        await supabase.from('audit_logs').insert({
          user_id: account.user_id,
          action: 'payment_received',
          resource_type: 'transaction',
          resource_id: reference,
          metadata: { amount, currency, sender_name },
        })

        break
      }

      case 'withdrawal.completed': {
        // USDT withdrawal completed
        const { withdrawal_id, tx_hash } = event.data

        await supabase
          .from('withdrawals')
          .update({
            status: 'completed',
            tx_hash,
            completed_at: new Date().toISOString(),
          })
          .eq('id', withdrawal_id)

        break
      }

      case 'withdrawal.failed': {
        // USDT withdrawal failed — refund the balance
        const { withdrawal_id: failedId, reason } = event.data

        const { data: withdrawal } = await supabase
          .from('withdrawals')
          .select('*')
          .eq('id', failedId)
          .single()

        if (withdrawal) {
          await supabase
            .from('withdrawals')
            .update({ status: 'failed' })
            .eq('id', failedId)

          // Refund balance
          await supabase.rpc('increment_wallet_balance', {
            p_wallet_id: withdrawal.wallet_id,
            p_amount: withdrawal.amount,
          })

          await supabase.from('audit_logs').insert({
            user_id: withdrawal.user_id,
            action: 'withdrawal_failed',
            resource_type: 'withdrawal',
            resource_id: failedId,
            metadata: { reason, amount: withdrawal.amount },
          })
        }

        break
      }

      default:
        console.log(`Unhandled webhook event: ${event.type}`)
    }

    return NextResponse.json({ received: true })
  } catch (error) {
    console.error('Webhook error:', error)
    return NextResponse.json({ error: 'Webhook processing failed' }, { status: 500 })
  }
}
