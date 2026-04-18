export const metadata = {
  title: 'Terms of Service — FrenzPay',
};

export default function TermsPage() {
  return (
    <article className="mx-auto max-w-3xl px-6 py-16 prose prose-slate dark:prose-invert">
      <h1>Terms of Service</h1>
      <p className="text-sm text-muted-foreground">Last updated: 17 April 2026</p>

      <h2>1. Acceptance</h2>
      <p>
        By creating a FrenzPay account you agree to these Terms. If you do not agree, do
        not create an account.
      </p>

      <h2>2. Eligibility</h2>
      <ul>
        <li>You are at least 18 years old.</li>
        <li>You are not a sanctioned person or located in a sanctioned jurisdiction.</li>
        <li>You will provide accurate identity information during KYC.</li>
      </ul>

      <h2>3. Accepted use</h2>
      <p>FrenzPay may not be used for:</p>
      <ul>
        <li>Money laundering, terrorism financing, or fraud.</li>
        <li>Gambling, adult content, or other restricted activities per our acceptable-use policy.</li>
        <li>Automated / bot-driven transactions.</li>
      </ul>

      <h2>4. Fees</h2>
      <ul>
        <li>Receiving payments: 1% (capped at $10).</li>
        <li>Withdrawals to Nigerian banks: $2 flat + 1.5% FX markup.</li>
        <li>P2P transfers within FrenzPay: free.</li>
        <li>Savings early-break: 2% of locked amount.</li>
      </ul>

      <h2>5. Limits</h2>
      <p>Daily and monthly transaction limits are set per KYC tier and visible in <code>/dashboard/kyc</code>.</p>

      <h2>6. Account freeze and closure</h2>
      <p>
        We may freeze or close your account if we detect fraud, sanctions matches, or violations
        of these Terms. You may freeze your own account at any time via the panic button.
      </p>

      <h2>7. Liability</h2>
      <p>
        We provide FrenzPay on a best-effort basis. We are not liable for losses caused by
        third-party failures, internet outages, or user error. Our total liability is capped
        at the fees you have paid us in the last 12 months.
      </p>

      <h2>8. Changes</h2>
      <p>
        We may update these Terms. Material changes will be notified by email at least 30 days
        in advance. Continued use after the effective date constitutes acceptance.
      </p>

      <h2>9. Contact</h2>
      <p><a href="mailto:legal@frenzpay.co">legal@frenzpay.co</a></p>
    </article>
  );
}
