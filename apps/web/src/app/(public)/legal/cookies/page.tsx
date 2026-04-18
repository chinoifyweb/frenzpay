export const metadata = {
  title: 'Cookie Policy — FrenzPay',
};

export default function CookiesPage() {
  return (
    <article className="mx-auto max-w-3xl px-6 py-16 prose prose-slate dark:prose-invert">
      <h1>Cookie Policy</h1>
      <p className="text-sm text-muted-foreground">Last updated: 17 April 2026</p>

      <h2>Only essential cookies</h2>
      <p>
        FrenzPay does <strong>not</strong> use advertising, cross-site tracking, or analytics cookies.
        We only set the minimum cookies required to keep you signed in and your session secure.
      </p>

      <h2>Cookies we set</h2>
      <table>
        <thead><tr><th>Name</th><th>Purpose</th><th>Lifetime</th></tr></thead>
        <tbody>
          <tr>
            <td><code>frenzpay-session</code></td>
            <td>Encrypted session identifier — keeps you signed in.</td>
            <td>15 min idle / 12 h absolute</td>
          </tr>
          <tr>
            <td><code>frenzpay-csrf</code></td>
            <td>CSRF protection token.</td>
            <td>Session</td>
          </tr>
        </tbody>
      </table>

      <h2>Local storage</h2>
      <ul>
        <li><code>frenzpay-cookie-consent</code> — remembers your consent banner dismissal.</li>
        <li><code>frenzpay-theme</code> — your light/dark mode preference.</li>
      </ul>

      <h2>Your choices</h2>
      <p>
        Because we don&apos;t use non-essential cookies, no opt-out is needed. You can clear all
        FrenzPay cookies via your browser settings; doing so will sign you out.
      </p>
    </article>
  );
}
