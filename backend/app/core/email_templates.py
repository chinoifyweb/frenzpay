"""
FrenzPay transactional email HTML templates.
All templates are self-contained (inline CSS) so they render in Gmail/Outlook.
"""

from app.config import settings

_BASE = """<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>{title}</title>
</head>
<body style="margin:0;padding:0;background:#f4f5f7;font-family:'Segoe UI',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f5f7;padding:32px 16px;">
    <tr><td align="center">
      <table width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,.08);">
        <!-- Header -->
        <tr>
          <td style="background:#1a1a2e;padding:28px 40px;text-align:center;">
            <span style="color:#ffffff;font-size:22px;font-weight:700;letter-spacing:.5px;">
              Frenz<span style="color:#7c3aed;">Pay</span>
            </span>
          </td>
        </tr>
        <!-- Body -->
        <tr>
          <td style="padding:40px 40px 32px;">
            {body}
          </td>
        </tr>
        <!-- Footer -->
        <tr>
          <td style="background:#f9fafb;border-top:1px solid #e5e7eb;padding:20px 40px;text-align:center;">
            <p style="margin:0;font-size:12px;color:#9ca3af;line-height:1.5;">
              © 2026 FrenzPay · <a href="{app_url}" style="color:#7c3aed;text-decoration:none;">frenzpay.co</a><br/>
              This email was sent by FrenzPay. If you did not request it, please ignore it.
            </p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>"""


def _render(title: str, body: str) -> str:
    return _BASE.format(title=title, body=body, app_url=settings.APP_URL)


def _h1(text: str) -> str:
    return f'<h1 style="margin:0 0 8px;font-size:22px;font-weight:700;color:#111827;">{text}</h1>'


def _p(text: str) -> str:
    return f'<p style="margin:0 0 16px;font-size:15px;color:#374151;line-height:1.6;">{text}</p>'


def _otp_box(otp: str) -> str:
    return f"""
    <div style="background:#f3f0ff;border:2px dashed #7c3aed;border-radius:8px;
                padding:20px;text-align:center;margin:24px 0;">
      <span style="font-size:36px;font-weight:800;letter-spacing:10px;color:#4c1d95;
                   font-family:'Courier New',monospace;">{otp}</span>
    </div>"""


def _button(label: str, url: str) -> str:
    return f"""
    <div style="text-align:center;margin:28px 0 8px;">
      <a href="{url}" style="background:#7c3aed;color:#ffffff;text-decoration:none;
                              padding:14px 32px;border-radius:8px;font-size:15px;
                              font-weight:600;display:inline-block;">{label}</a>
    </div>"""


# ── Public template functions ─────────────────────────────────────────────────

def welcome_email(first_name: str) -> tuple[str, str]:
    """Returns (subject, html)."""
    subject = "Welcome to FrenzPay 🎉"
    body = (
        _h1(f"Welcome, {first_name}!")
        + _p(
            "Your FrenzPay account has been created. You can now send and receive "
            "global payments, convert currencies, and manage your wallet — all in one place."
        )
        + _button("Open FrenzPay", settings.APP_URL)
        + _p(
            "If you have any questions, reply to this email or visit our help centre."
        )
    )
    return subject, _render(subject, body)


def signup_otp_email(first_name: str, otp: str) -> tuple[str, str]:
    """Returns (subject, html). OTP expires in settings.OTP_TTL_MINUTES minutes."""
    subject = "Your FrenzPay verification code"
    ttl = settings.OTP_TTL_MINUTES
    body = (
        _h1("Verify your account")
        + _p(f"Hi {first_name}, enter the code below to verify your FrenzPay account.")
        + _otp_box(otp)
        + _p(
            f"This code expires in <strong>{ttl} minutes</strong>. "
            "Do not share it with anyone — FrenzPay staff will never ask for your OTP."
        )
    )
    return subject, _render(subject, body)


def password_reset_email(first_name: str, otp: str) -> tuple[str, str]:
    """Returns (subject, html)."""
    subject = "Reset your FrenzPay password"
    ttl = settings.OTP_TTL_MINUTES
    body = (
        _h1("Password reset request")
        + _p(
            f"Hi {first_name}, we received a request to reset your FrenzPay password. "
            "Use the code below to create a new password."
        )
        + _otp_box(otp)
        + _p(
            f"This code expires in <strong>{ttl} minutes</strong>. "
            "If you didn't request a password reset, you can safely ignore this email."
        )
    )
    return subject, _render(subject, body)


def login_alert_email(first_name: str, ip: str, user_agent: str) -> tuple[str, str]:
    """Returns (subject, html). Notifies user of a new login."""
    subject = "New sign-in to your FrenzPay account"
    body = (
        _h1("New sign-in detected")
        + _p(
            f"Hi {first_name}, your FrenzPay account was just signed in to."
        )
        + f"""
        <table style="width:100%;border-collapse:collapse;margin:16px 0 24px;">
          <tr style="background:#f9fafb;">
            <td style="padding:10px 14px;font-size:13px;color:#6b7280;border:1px solid #e5e7eb;">IP Address</td>
            <td style="padding:10px 14px;font-size:13px;color:#111827;border:1px solid #e5e7eb;">{ip or "Unknown"}</td>
          </tr>
          <tr>
            <td style="padding:10px 14px;font-size:13px;color:#6b7280;border:1px solid #e5e7eb;">Device</td>
            <td style="padding:10px 14px;font-size:13px;color:#111827;border:1px solid #e5e7eb;">{(user_agent or "Unknown")[:80]}</td>
          </tr>
        </table>"""
        + _p(
            "If this was you, no action needed. If you didn't sign in, "
            "<strong>change your password immediately</strong> and contact support."
        )
    )
    return subject, _render(subject, body)
