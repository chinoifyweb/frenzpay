// Email transport — Purelymail SMTP via nodemailer.
//
// Why nodemailer + SMTP instead of Resend? frenzpay.co is already verified
// with Purelymail (SPF, DKIM, DMARC) from the existing Python backend. Using
// Purelymail for the Next.js app too means one email provider across all
// services, one rotation surface, and no second domain-verification cycle.
//
// Env (all loaded at call time so next build doesn't crash without them):
//   SMTP_HOST      default: smtp.purelymail.com
//   SMTP_PORT      default: 587                (STARTTLS, per Purelymail docs)
//   SMTP_USERNAME  e.g. noreply@frenzpay.co
//   SMTP_PASSWORD  Purelymail app password
//
// `resend.emails.send(...)` contract below is kept unchanged — the rest of
// this file can send without knowing we swapped providers.

// eslint-disable-next-line @typescript-eslint/no-require-imports
import nodemailer, { type Transporter } from 'nodemailer'

let _transporter: Transporter | null = null
function getTransporter(): Transporter {
  if (_transporter) return _transporter
  _transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST ?? 'smtp.purelymail.com',
    port: Number(process.env.SMTP_PORT ?? 587),
    secure: Number(process.env.SMTP_PORT ?? 587) === 465, // STARTTLS on 587, implicit TLS on 465
    auth: {
      user: process.env.SMTP_USERNAME ?? '',
      pass: process.env.SMTP_PASSWORD ?? '',
    },
    // Keep connection reuse so repeated sends in a request are cheap
    pool: true,
    maxConnections: 5,
  })
  return _transporter
}

// Shim that preserves the old `resend.emails.send({ from, to, subject, html, text? })` call
// shape that every function below uses. Returns nodemailer's sendMail result.
interface SendArgs { from: string; to: string | string[]; subject: string; html: string; text?: string }
const resend = {
  emails: {
    send: async (args: SendArgs) => {
      return getTransporter().sendMail({
        from: args.from,
        to: args.to,
        subject: args.subject,
        html: args.html,
        text: args.text,
      })
    },
  },
}

// Domain emails — all sending from verified frenzpay.co domain
const FROM_EMAIL = 'Frenz Pay <noreply@frenzpay.co>'
const FROM_SUPPORT = 'Frenz Pay Support <support@frenzpay.co>'
const FROM_HELLO = 'Frenz Pay <hello@frenzpay.co>'
const ADMIN_EMAIL = 'chinoify04@gmail.com'
const SUPPORT_EMAIL = 'chinoify04@gmail.com'

// ─── Admin Notifications ──────────────────────────────

export async function sendAdminNewWaitlistNotification(email: string, fullName?: string) {
  return resend.emails.send({
    from: FROM_EMAIL,
    to: ADMIN_EMAIL,
    subject: `New Waitlist Signup: ${email}`,
    html: `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 560px; margin: 0 auto; padding: 32px 24px;">
        <div style="text-align: center; margin-bottom: 24px;">
          <h1 style="font-size: 20px; color: #111; margin: 0;">New Waitlist Signup</h1>
        </div>
        <div style="background: #f9fafb; border-radius: 12px; padding: 24px; margin-bottom: 24px;">
          <p style="margin: 0 0 8px; color: #6b7280; font-size: 13px;">Name</p>
          <p style="margin: 0 0 16px; color: #111; font-size: 15px; font-weight: 500;">${fullName || 'Not provided'}</p>
          <p style="margin: 0 0 8px; color: #6b7280; font-size: 13px;">Email</p>
          <p style="margin: 0; color: #111; font-size: 15px; font-weight: 500;">${email}</p>
        </div>
        <p style="color: #9ca3af; font-size: 12px; text-align: center; margin: 0;">Frenz Pay Admin Notification</p>
      </div>
    `,
  })
}

export async function sendAdminNewKYCNotification(userName: string, userEmail: string) {
  return resend.emails.send({
    from: FROM_EMAIL,
    to: ADMIN_EMAIL,
    subject: `New KYC Submission: ${userName}`,
    html: `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 560px; margin: 0 auto; padding: 32px 24px;">
        <div style="text-align: center; margin-bottom: 24px;">
          <h1 style="font-size: 20px; color: #111; margin: 0;">New KYC Submission</h1>
        </div>
        <div style="background: #f9fafb; border-radius: 12px; padding: 24px; margin-bottom: 24px;">
          <p style="margin: 0 0 8px; color: #6b7280; font-size: 13px;">User</p>
          <p style="margin: 0 0 16px; color: #111; font-size: 15px; font-weight: 500;">${userName}</p>
          <p style="margin: 0 0 8px; color: #6b7280; font-size: 13px;">Email</p>
          <p style="margin: 0 0 16px; color: #111; font-size: 15px; font-weight: 500;">${userEmail}</p>
        </div>
        <a href="https://frenzpay.co/admin/kyc" style="display: block; text-align: center; background: #22c55e; color: white; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: 500; font-size: 14px;">Review in Admin Panel</a>
        <p style="color: #9ca3af; font-size: 12px; text-align: center; margin: 24px 0 0;">Frenz Pay Admin Notification</p>
      </div>
    `,
  })
}

export async function sendAdminWithdrawalNotification(userName: string, amount: number, currency: string, network: string) {
  return resend.emails.send({
    from: FROM_EMAIL,
    to: ADMIN_EMAIL,
    subject: `Withdrawal Request: $${amount.toFixed(2)} ${currency}`,
    html: `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 560px; margin: 0 auto; padding: 32px 24px;">
        <div style="text-align: center; margin-bottom: 24px;">
          <h1 style="font-size: 20px; color: #111; margin: 0;">New Withdrawal Request</h1>
        </div>
        <div style="background: #f9fafb; border-radius: 12px; padding: 24px; margin-bottom: 24px;">
          <p style="margin: 0 0 8px; color: #6b7280; font-size: 13px;">User</p>
          <p style="margin: 0 0 16px; color: #111; font-size: 15px; font-weight: 500;">${userName}</p>
          <p style="margin: 0 0 8px; color: #6b7280; font-size: 13px;">Amount</p>
          <p style="margin: 0 0 16px; color: #111; font-size: 15px; font-weight: 500;">$${amount.toFixed(2)} ${currency}</p>
          <p style="margin: 0 0 8px; color: #6b7280; font-size: 13px;">Network</p>
          <p style="margin: 0; color: #111; font-size: 15px; font-weight: 500;">${network.toUpperCase()}</p>
        </div>
        <a href="https://frenzpay.co/admin/withdrawals" style="display: block; text-align: center; background: #22c55e; color: white; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: 500; font-size: 14px;">Review in Admin Panel</a>
        <p style="color: #9ca3af; font-size: 12px; text-align: center; margin: 24px 0 0;">Frenz Pay Admin Notification</p>
      </div>
    `,
  })
}

// ─── User Emails ──────────────────────────────────────

/**
 * One-time code for email verification (sent during signup + resend).
 * OTP is a 6-digit numeric code; the DB stores only the hash.
 */
export async function sendEmailVerificationOtp(email: string, name: string, otp: string) {
  return resend.emails.send({
    from: FROM_EMAIL,
    to: email,
    subject: `Your Frenz Pay verification code: ${otp}`,
    html: `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 560px; margin: 0 auto; padding: 32px 24px;">
        <div style="text-align: center; margin-bottom: 32px;">
          <div style="display: inline-block; background: #22c55e; border-radius: 12px; width: 48px; height: 48px; line-height: 48px; color: white; font-size: 24px; font-weight: bold;">F</div>
          <h1 style="font-size: 22px; color: #111; margin: 16px 0 0;">Verify your email</h1>
        </div>
        <p style="color: #374151; font-size: 15px; line-height: 1.6;">Hi ${name || 'there'},</p>
        <p style="color: #374151; font-size: 15px; line-height: 1.6;">Thanks for signing up. Enter the 6-digit code below to verify your email address and activate your Frenz Pay account.</p>
        <div style="background: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 12px; padding: 24px; margin: 24px 0; text-align: center;">
          <p style="margin: 0 0 8px; color: #6b7280; font-size: 12px; letter-spacing: 0.05em; text-transform: uppercase;">Verification code</p>
          <p style="margin: 0; color: #111; font-size: 32px; font-weight: 700; letter-spacing: 0.4em; font-family: 'SF Mono', Menlo, Consolas, monospace;">${otp}</p>
        </div>
        <p style="color: #6b7280; font-size: 13px; line-height: 1.6;">This code expires in 10 minutes. If you didn&apos;t sign up for Frenz Pay, you can safely ignore this email.</p>
        <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 32px 0 16px;" />
        <p style="color: #9ca3af; font-size: 12px; text-align: center; margin: 0;">Frenz Pay &mdash; Your Money, Finally Without Borders</p>
      </div>
    `,
    text: `Your Frenz Pay verification code: ${otp}\n\nThis code expires in 10 minutes. If you didn't sign up for Frenz Pay, you can ignore this email.`,
  })
}

export async function sendWelcomeEmail(email: string, name: string) {
  return resend.emails.send({
    from: FROM_HELLO,
    to: email,
    subject: 'Welcome to Frenz Pay!',
    html: `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 560px; margin: 0 auto; padding: 32px 24px;">
        <div style="text-align: center; margin-bottom: 32px;">
          <div style="display: inline-block; background: #22c55e; border-radius: 12px; width: 48px; height: 48px; line-height: 48px; color: white; font-size: 24px; font-weight: bold;">F</div>
          <h1 style="font-size: 22px; color: #111; margin: 16px 0 0;">Welcome to Frenz Pay</h1>
        </div>
        <p style="color: #374151; font-size: 15px; line-height: 1.6;">Hi ${name},</p>
        <p style="color: #374151; font-size: 15px; line-height: 1.6;">Thanks for joining Frenz Pay! You're now part of a growing community of freelancers, remote workers, and creators who receive global payments with ease.</p>
        <div style="background: #f0fdf4; border-radius: 12px; padding: 20px; margin: 24px 0;">
          <p style="margin: 0 0 12px; color: #111; font-size: 14px; font-weight: 600;">What you get:</p>
          <p style="margin: 0 0 8px; color: #374151; font-size: 14px;">&#x2714; Virtual USD, GBP & EUR accounts</p>
          <p style="margin: 0 0 8px; color: #374151; font-size: 14px;">&#x2714; Free incoming payments</p>
          <p style="margin: 0; color: #374151; font-size: 14px;">&#x2714; USDT withdrawals in under 5 minutes</p>
        </div>
        <p style="color: #374151; font-size: 15px; line-height: 1.6;">Download our mobile app to get started:</p>
        <div style="text-align: center; margin: 24px 0;">
          <a href="https://frenzpay.co/#download" style="display: inline-block; background: #22c55e; color: white; padding: 12px 32px; border-radius: 8px; text-decoration: none; font-weight: 500; font-size: 14px;">Get the App</a>
        </div>
        <p style="color: #374151; font-size: 15px; line-height: 1.6;">Need help? Chat with us on <a href="https://wa.me/12365997663" style="color: #22c55e; text-decoration: none;">WhatsApp</a> or email us at <a href="mailto:hello@frenzpay.co" style="color: #22c55e; text-decoration: none;">hello@frenzpay.co</a>.</p>
        <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 32px 0 16px;" />
        <p style="color: #9ca3af; font-size: 12px; text-align: center; margin: 0;">Frenz Pay &mdash; Your Money, Finally Without Borders</p>
      </div>
    `,
  })
}

export async function sendWaitlistConfirmation(email: string) {
  return resend.emails.send({
    from: FROM_EMAIL,
    to: email,
    subject: "You're on the Frenz Pay waitlist!",
    html: `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 560px; margin: 0 auto; padding: 32px 24px;">
        <div style="text-align: center; margin-bottom: 32px;">
          <div style="display: inline-block; background: #22c55e; border-radius: 12px; width: 48px; height: 48px; line-height: 48px; color: white; font-size: 24px; font-weight: bold;">F</div>
          <h1 style="font-size: 22px; color: #111; margin: 16px 0 0;">You're on the list!</h1>
        </div>
        <p style="color: #374151; font-size: 15px; line-height: 1.6;">Thanks for joining the Frenz Pay waitlist. We'll notify you as soon as we're ready for you.</p>
        <p style="color: #374151; font-size: 15px; line-height: 1.6;">In the meantime, follow us for updates:</p>
        <div style="text-align: center; margin: 24px 0;">
          <a href="https://twitter.com/frenzpay" style="color: #22c55e; text-decoration: none; margin: 0 12px; font-size: 14px;">Twitter</a>
          <a href="https://instagram.com/frenzpay" style="color: #22c55e; text-decoration: none; margin: 0 12px; font-size: 14px;">Instagram</a>
          <a href="https://linkedin.com/company/frenzpay" style="color: #22c55e; text-decoration: none; margin: 0 12px; font-size: 14px;">LinkedIn</a>
        </div>
        <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 32px 0 16px;" />
        <p style="color: #9ca3af; font-size: 12px; text-align: center; margin: 0;">Frenz Pay &mdash; Your Money, Finally Without Borders</p>
      </div>
    `,
  })
}

export async function sendContactFormNotification(data: { name: string; email: string; subject: string; message: string }) {
  return resend.emails.send({
    from: FROM_EMAIL,
    to: ADMIN_EMAIL,
    replyTo: data.email,
    subject: `Contact Form: ${data.subject}`,
    html: `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 560px; margin: 0 auto; padding: 32px 24px;">
        <div style="text-align: center; margin-bottom: 24px;">
          <h1 style="font-size: 20px; color: #111; margin: 0;">New Contact Form Message</h1>
        </div>
        <div style="background: #f9fafb; border-radius: 12px; padding: 24px; margin-bottom: 24px;">
          <p style="margin: 0 0 8px; color: #6b7280; font-size: 13px;">From</p>
          <p style="margin: 0 0 16px; color: #111; font-size: 15px; font-weight: 500;">${data.name} &lt;${data.email}&gt;</p>
          <p style="margin: 0 0 8px; color: #6b7280; font-size: 13px;">Subject</p>
          <p style="margin: 0 0 16px; color: #111; font-size: 15px; font-weight: 500;">${data.subject}</p>
          <p style="margin: 0 0 8px; color: #6b7280; font-size: 13px;">Message</p>
          <p style="margin: 0; color: #111; font-size: 15px; line-height: 1.6; white-space: pre-wrap;">${data.message}</p>
        </div>
        <p style="color: #9ca3af; font-size: 12px; text-align: center; margin: 0;">Reply directly to this email to respond to ${data.name}.</p>
      </div>
    `,
  })
}

/** Password reset link — 15-min TTL, one-time-use token. */
export async function sendPasswordResetEmail(email: string, resetUrl: string) {
  return resend.emails.send({
    from: FROM_SUPPORT,
    to: email,
    subject: 'Reset your Frenz Pay password',
    html: `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 560px; margin: 0 auto; padding: 32px 24px;">
        <div style="text-align: center; margin-bottom: 32px;">
          <div style="display: inline-block; background: #22c55e; border-radius: 12px; width: 48px; height: 48px; line-height: 48px; color: white; font-size: 24px; font-weight: bold;">F</div>
          <h1 style="font-size: 22px; color: #111; margin: 16px 0 0;">Reset your password</h1>
        </div>
        <p style="color: #374151; font-size: 15px; line-height: 1.6;">Someone (hopefully you) asked to reset the password on this Frenz Pay account. Click the button below within the next 15 minutes to pick a new one.</p>
        <div style="text-align: center; margin: 28px 0;">
          <a href="${resetUrl}" style="display: inline-block; background: #22c55e; color: white; padding: 12px 32px; border-radius: 8px; text-decoration: none; font-weight: 500; font-size: 14px;">Reset password</a>
        </div>
        <p style="color: #6b7280; font-size: 13px; line-height: 1.6;">If the button doesn&rsquo;t work, copy and paste this link into your browser:</p>
        <p style="color: #374151; font-size: 12px; line-height: 1.4; word-break: break-all; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; background: #f3f4f6; padding: 10px 12px; border-radius: 6px;">${resetUrl}</p>
        <p style="color: #6b7280; font-size: 13px; line-height: 1.6; margin-top: 24px;">Didn&rsquo;t ask for this? You can ignore this email &mdash; your password won&rsquo;t change. Reply to this mail if you think someone else is trying to get into your account.</p>
        <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 32px 0 16px;" />
        <p style="color: #9ca3af; font-size: 12px; text-align: center; margin: 0;">Frenz Pay &mdash; Your Money, Finally Without Borders</p>
      </div>
    `,
  })
}

/** Confirmation to the customer right after they submit KYC — sets 24h expectation. */
export async function sendKYCSubmittedEmail(email: string, name: string) {
  return resend.emails.send({
    from: FROM_SUPPORT,
    to: email,
    subject: 'We got your documents — review in progress',
    html: `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 560px; margin: 0 auto; padding: 32px 24px;">
        <div style="text-align: center; margin-bottom: 32px;">
          <div style="display: inline-block; background: #22c55e; border-radius: 12px; width: 48px; height: 48px; line-height: 48px; color: white; font-size: 24px; font-weight: bold;">F</div>
          <h1 style="font-size: 22px; color: #111; margin: 16px 0 0;">Documents received</h1>
        </div>
        <p style="color: #374151; font-size: 15px; line-height: 1.6;">Hi ${name},</p>
        <p style="color: #374151; font-size: 15px; line-height: 1.6;">Thanks for submitting your identity documents. Our team reviews every application manually to keep Frenz Pay safe.</p>
        <div style="background: #f0f9ff; border-radius: 12px; padding: 20px; margin: 24px 0;">
          <p style="margin: 0; color: #374151; font-size: 14px;"><strong>Typical turnaround: under 24 hours.</strong></p>
          <p style="margin: 8px 0 0; color: #6b7280; font-size: 13px;">You&rsquo;ll get another email the moment we&rsquo;re done \u2014 approval or a short note if we need anything else.</p>
        </div>
        <p style="color: #374151; font-size: 15px; line-height: 1.6;">In the meantime you can explore the dashboard. Money movement features unlock as soon as verification completes.</p>
        <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 32px 0 16px;" />
        <p style="color: #9ca3af; font-size: 12px; text-align: center; margin: 0;">Frenz Pay &mdash; Your Money, Finally Without Borders</p>
      </div>
    `,
  })
}

export async function sendKYCApprovedEmail(email: string, name: string) {
  return resend.emails.send({
    from: FROM_SUPPORT,
    to: email,
    subject: 'KYC Verification Approved!',
    html: `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 560px; margin: 0 auto; padding: 32px 24px;">
        <div style="text-align: center; margin-bottom: 32px;">
          <div style="display: inline-block; background: #22c55e; border-radius: 12px; width: 48px; height: 48px; line-height: 48px; color: white; font-size: 24px; font-weight: bold;">F</div>
          <h1 style="font-size: 22px; color: #111; margin: 16px 0 0;">KYC Approved!</h1>
        </div>
        <p style="color: #374151; font-size: 15px; line-height: 1.6;">Hi ${name},</p>
        <p style="color: #374151; font-size: 15px; line-height: 1.6;">Great news! Your identity verification has been approved. You now have full access to all Frenz Pay features including:</p>
        <div style="background: #f0fdf4; border-radius: 12px; padding: 20px; margin: 24px 0;">
          <p style="margin: 0 0 8px; color: #374151; font-size: 14px;">&#x2714; Virtual USD, GBP & EUR accounts</p>
          <p style="margin: 0 0 8px; color: #374151; font-size: 14px;">&#x2714; Receive unlimited payments</p>
          <p style="margin: 0; color: #374151; font-size: 14px;">&#x2714; USDT withdrawals</p>
        </div>
        <div style="text-align: center; margin: 24px 0;">
          <a href="https://frenzpay.co/#download" style="display: inline-block; background: #22c55e; color: white; padding: 12px 32px; border-radius: 8px; text-decoration: none; font-weight: 500; font-size: 14px;">Open App</a>
        </div>
        <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 32px 0 16px;" />
        <p style="color: #9ca3af; font-size: 12px; text-align: center; margin: 0;">Frenz Pay &mdash; Your Money, Finally Without Borders</p>
      </div>
    `,
  })
}

export async function sendKYCRejectedEmail(email: string, name: string, reason: string) {
  return resend.emails.send({
    from: FROM_SUPPORT,
    to: email,
    subject: 'KYC Verification Update',
    html: `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 560px; margin: 0 auto; padding: 32px 24px;">
        <div style="text-align: center; margin-bottom: 32px;">
          <div style="display: inline-block; background: #22c55e; border-radius: 12px; width: 48px; height: 48px; line-height: 48px; color: white; font-size: 24px; font-weight: bold;">F</div>
          <h1 style="font-size: 22px; color: #111; margin: 16px 0 0;">Verification Update</h1>
        </div>
        <p style="color: #374151; font-size: 15px; line-height: 1.6;">Hi ${name},</p>
        <p style="color: #374151; font-size: 15px; line-height: 1.6;">We were unable to verify your identity with the documents you submitted. Here's what happened:</p>
        <div style="background: #fef2f2; border-radius: 12px; padding: 20px; margin: 24px 0;">
          <p style="margin: 0; color: #991b1b; font-size: 14px; line-height: 1.6;">${reason}</p>
        </div>
        <p style="color: #374151; font-size: 15px; line-height: 1.6;">Please re-submit your documents through the app. If you need help, chat with us on <a href="https://wa.me/12365997663" style="color: #22c55e; text-decoration: none;">WhatsApp</a>.</p>
        <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 32px 0 16px;" />
        <p style="color: #9ca3af; font-size: 12px; text-align: center; margin: 0;">Frenz Pay &mdash; Your Money, Finally Without Borders</p>
      </div>
    `,
  })
}

export async function sendWithdrawalCompleteEmail(email: string, name: string, amount: number, currency: string, txHash: string, network: string) {
  return resend.emails.send({
    from: FROM_SUPPORT,
    to: email,
    subject: `Withdrawal Complete: $${amount.toFixed(2)} ${currency}`,
    html: `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 560px; margin: 0 auto; padding: 32px 24px;">
        <div style="text-align: center; margin-bottom: 32px;">
          <div style="display: inline-block; background: #22c55e; border-radius: 12px; width: 48px; height: 48px; line-height: 48px; color: white; font-size: 24px; font-weight: bold;">F</div>
          <h1 style="font-size: 22px; color: #111; margin: 16px 0 0;">Withdrawal Complete</h1>
        </div>
        <p style="color: #374151; font-size: 15px; line-height: 1.6;">Hi ${name},</p>
        <p style="color: #374151; font-size: 15px; line-height: 1.6;">Your USDT withdrawal has been processed successfully.</p>
        <div style="background: #f9fafb; border-radius: 12px; padding: 24px; margin: 24px 0;">
          <p style="margin: 0 0 8px; color: #6b7280; font-size: 13px;">Amount</p>
          <p style="margin: 0 0 16px; color: #111; font-size: 15px; font-weight: 500;">$${amount.toFixed(2)} ${currency}</p>
          <p style="margin: 0 0 8px; color: #6b7280; font-size: 13px;">Network</p>
          <p style="margin: 0 0 16px; color: #111; font-size: 15px; font-weight: 500;">${network.toUpperCase()}</p>
          <p style="margin: 0 0 8px; color: #6b7280; font-size: 13px;">Transaction Hash</p>
          <p style="margin: 0; color: #111; font-size: 13px; font-family: monospace; word-break: break-all;">${txHash}</p>
        </div>
        <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 32px 0 16px;" />
        <p style="color: #9ca3af; font-size: 12px; text-align: center; margin: 0;">Frenz Pay &mdash; Your Money, Finally Without Borders</p>
      </div>
    `,
  })
}
