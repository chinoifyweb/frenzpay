import { NextRequest, NextResponse } from 'next/server'
import { Resend } from 'resend'

const resend = new Resend(process.env.RESEND_API_KEY)
const FORWARD_TO = 'chinoify04@gmail.com'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()

    // Resend inbound webhook payload
    const {
      from: senderEmail,
      to: recipientEmails,
      subject,
      html,
      text,
      attachments,
    } = body

    const sender = typeof senderEmail === 'string' ? senderEmail : senderEmail?.address || 'unknown@unknown.com'
    const senderName = typeof senderEmail === 'object' ? senderEmail?.name : ''
    const toAddresses = Array.isArray(recipientEmails)
      ? recipientEmails.map((t: any) => typeof t === 'string' ? t : t?.address).join(', ')
      : recipientEmails

    // Forward the email to Gmail
    await resend.emails.send({
      from: `Frenz Pay Inbox <noreply@frenzpay.co>`,
      to: FORWARD_TO,
      replyTo: sender,
      subject: `[${toAddresses}] ${subject || '(no subject)'}`,
      html: html || `
        <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 600px; margin: 0 auto; padding: 24px;">
          <div style="background: #f0fdf4; border-radius: 8px; padding: 16px; margin-bottom: 20px;">
            <p style="margin: 0 0 4px; color: #6b7280; font-size: 12px;">From</p>
            <p style="margin: 0 0 12px; color: #111; font-size: 14px; font-weight: 500;">${senderName ? senderName + ' &lt;' + sender + '&gt;' : sender}</p>
            <p style="margin: 0 0 4px; color: #6b7280; font-size: 12px;">To</p>
            <p style="margin: 0 0 12px; color: #111; font-size: 14px; font-weight: 500;">${toAddresses}</p>
            <p style="margin: 0 0 4px; color: #6b7280; font-size: 12px;">Subject</p>
            <p style="margin: 0; color: #111; font-size: 14px; font-weight: 500;">${subject || '(no subject)'}</p>
          </div>
          <div style="color: #374151; font-size: 14px; line-height: 1.6; white-space: pre-wrap;">${text || '(empty message)'}</div>
          <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 24px 0 12px;" />
          <p style="color: #9ca3af; font-size: 11px; text-align: center;">Forwarded by Frenz Pay Email System</p>
        </div>
      `,
    })

    return NextResponse.json({ received: true })
  } catch (error) {
    console.error('Inbound email forwarding error:', error)
    return NextResponse.json({ error: 'Failed to process' }, { status: 500 })
  }
}
