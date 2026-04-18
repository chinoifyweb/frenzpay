# FrenzPay Security Policy

**Version:** 1.0  
**Last Updated:** 2026-04-17  
**Security Contact:** security@frenzpay.co

---

## Reporting a Vulnerability

If you discover a security vulnerability in FrenzPay, please report it responsibly.

**Email:** security@frenzpay.co  
**Response time:** We aim to acknowledge reports within 24 hours and provide a fix timeline within 72 hours for critical issues.

Please **do not** create public GitHub issues for security vulnerabilities.

---

## Scope

**In scope:**
- `app.frenzpay.co` — customer web application
- `admin.frenzpay.co` — admin panel
- `api.frenzpay.co` — API endpoints
- Mobile apps (when launched)

**Out of scope:**
- Third-party services (Bridge, Flutterwave, Dojah, Cloudflare, Purelymail)
- Social engineering attacks
- Physical attacks
- Denial-of-service attacks
- Automated scanning without prior written approval

---

## Bug Bounty

We appreciate the security research community. Bug bounty rewards:

| Severity | CVSS Score | Reward |
|----------|-----------|--------|
| Critical (RCE, auth bypass, financial manipulation) | 9.0–10.0 | $500–$2,000 |
| High (data exposure, privilege escalation) | 7.0–8.9 | $200–$500 |
| Medium (CSRF, stored XSS, IDOR) | 4.0–6.9 | $50–$200 |
| Low (open redirect, minor info leak) | 0.1–3.9 | Hall of fame |

*Rewards scale with revenue. Amounts will increase as the company grows.*

---

## Safe Harbor

We will not pursue legal action against researchers who:
- Report vulnerabilities in good faith
- Do not access, modify, or delete user data beyond what is necessary to demonstrate the vulnerability
- Do not disclose the vulnerability publicly before we've had 90 days to fix it
- Do not use the vulnerability for personal gain beyond the reward

---

## Coordinated Disclosure

90-day disclosure policy. We will:
1. Acknowledge receipt within 24 hours
2. Provide a fix timeline within 72 hours for critical issues
3. Keep you informed of progress
4. Credit you in release notes (unless you prefer anonymity)

After 90 days (or sooner if patched), you may disclose publicly.
