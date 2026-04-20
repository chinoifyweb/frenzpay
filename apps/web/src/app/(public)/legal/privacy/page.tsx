export const metadata = {
  title: 'Privacy Policy — FrenzPay',
  description: 'How FrenzPay collects, uses, and protects your personal data.',
};

export default function PrivacyPage() {
  return (
    <article className="mx-auto max-w-3xl px-6 py-16 prose prose-slate dark:prose-invert">
      <h1>Privacy Policy</h1>
      <p className="text-sm text-muted-foreground">Last updated: 17 April 2026</p>

      <h2>1. Who we are</h2>
      <p>
        FrenzPay (&quot;we&quot;, &quot;us&quot;, &quot;our&quot;) operates the FrenzPay platform
        for cross-border payments. This policy explains what personal data we collect, why
        we collect it, and how we protect it.
      </p>

      <h2>2. Data we collect</h2>
      <ul>
        <li><strong>Identity</strong>: full legal name, date of birth, government ID number (NIN, BVN, passport).</li>
        <li><strong>Contact</strong>: email address, phone number.</li>
        <li><strong>Financial</strong>: bank account numbers for payouts, transaction history, card authorizations.</li>
        <li><strong>Device &amp; usage</strong>: IP address, user-agent, device fingerprint for fraud prevention.</li>
      </ul>

      <h2>3. How we use your data</h2>
      <ul>
        <li>To provide the services you request (account creation, transfers, payouts).</li>
        <li>To verify your identity and comply with KYC/AML regulations.</li>
        <li>To detect and prevent fraud, money laundering, and sanctions violations.</li>
        <li>To send you transactional notifications (email/SMS) — never marketing unless you opt in.</li>
      </ul>

      <h2>4. How we protect your data</h2>
      <ul>
        <li>All sensitive fields (BVN, NIN, card numbers) are encrypted at rest using AES-256-GCM with per-record DEKs.</li>
        <li>Card details are tokenised by our card issuer (Bridge); FrenzPay never stores full PAN or CVV.</li>
        <li>Passwords and PINs are hashed with Argon2id.</li>
        <li>All connections use TLS 1.2+.</li>
      </ul>

      <h2>5. Who we share data with</h2>
      <ul>
        <li><strong>Bridge</strong> — for USD virtual accounts and cards (US-regulated BaaS provider).</li>
        <li><strong>Law enforcement</strong> — when required by court order or regulatory request.</li>
      </ul>

      <h2>6. Your rights</h2>
      <p>You may at any time:</p>
      <ul>
        <li><strong>Access</strong> — download all your data via <code>/dashboard/settings</code> &rarr; &quot;Export data&quot;.</li>
        <li><strong>Correct</strong> — update your profile information.</li>
        <li><strong>Delete</strong> — request account deletion (subject to regulatory retention requirements).</li>
        <li><strong>Restrict processing</strong> — freeze your account via the panic button at <code>/dashboard/settings/security</code>.</li>
      </ul>

      <h2>7. Data retention</h2>
      <p>
        Transaction records are retained for 7 years to comply with AML regulations. KYC
        documents are retained for 5 years after account closure. Non-essential usage logs
        are purged after 90 days.
      </p>

      <h2>8. Contact</h2>
      <p>
        Questions about this policy? Email <a href="mailto:privacy@frenzpay.co">privacy@frenzpay.co</a>.
      </p>
    </article>
  );
}
