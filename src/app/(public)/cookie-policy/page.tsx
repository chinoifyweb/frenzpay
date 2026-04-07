import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Cookie Policy | FrenzPay",
  description: "How FrenzPay uses cookies and tracking technologies.",
};

export default function CookiePolicyPage() {
  return (
    <div className="min-h-screen bg-white dark:bg-[#0B1120] pt-24 pb-20">
      <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="mb-12">
          <span className="inline-block rounded-full bg-green-50 dark:bg-green-500/10 px-4 py-1.5 text-sm font-semibold text-green-600 dark:text-green-400 mb-4">
            Legal
          </span>
          <h1 className="text-4xl font-extrabold text-gray-900 dark:text-white">Cookie Policy</h1>
          <p className="mt-4 text-gray-500 dark:text-gray-400">
            Effective Date: January 1, 2025 &nbsp;|&nbsp; Last Updated: March 2026
          </p>
        </div>

        <div className="space-y-10">
          <Section title="1. What Are Cookies?">
            <p>Cookies are small text files placed on your device when you visit a website. They are widely used to make websites work more efficiently, enhance user experience, and provide information to website owners. We also use similar technologies such as pixel tags, web beacons, and local storage.</p>
          </Section>

          <Section title="2. How We Use Cookies">
            <p>FrenzPay uses cookies and similar technologies for the following purposes:</p>
            <Table
              headers={["Category", "Purpose", "Examples"]}
              rows={[
                ["Essential / Strictly Necessary", "Required for the website and app to function. Cannot be disabled.", "Authentication tokens, session IDs, security cookies, CSRF protection"],
                ["Functional", "Remember your preferences and settings to improve your experience.", "Language preference, timezone, notification settings"],
                ["Analytics", "Help us understand how visitors use our site so we can improve it.", "Page views, user flows, error tracking (anonymized)"],
                ["Security", "Protect against fraud, abuse, and unauthorized access.", "Bot detection, risk scoring, device fingerprinting"],
                ["Marketing", "Used to deliver relevant advertisements. Only with your consent.", "Retargeting pixels, ad conversion tracking"],
              ]}
            />
          </Section>

          <Section title="3. Types of Cookies We Use">
            <h3>3.1 Session Cookies</h3>
            <p>Temporary cookies that expire when you close your browser. Used to maintain your logged-in state during a session.</p>
            <h3>3.2 Persistent Cookies</h3>
            <p>Remain on your device for a set period or until you delete them. Used to remember your preferences across visits.</p>
            <h3>3.3 First-Party Cookies</h3>
            <p>Set directly by FrenzPay. Used for core functionality, authentication, and analytics.</p>
            <h3>3.4 Third-Party Cookies</h3>
            <p>Set by our trusted partners for analytics and security. We vet all third-party cookie providers for GDPR compliance.</p>
          </Section>

          <Section title="4. Third-Party Services">
            <p>We use the following third-party services that may set cookies:</p>
            <ul>
              <li><strong>Supabase</strong> — Authentication and database services</li>
              <li><strong>Vercel Analytics</strong> — Website performance monitoring (privacy-friendly, no personal data)</li>
              <li><strong>Google Analytics</strong> — Anonymized traffic analytics (IP anonymization enabled)</li>
              <li><strong>Cloudflare</strong> — Security, DDoS protection, and CDN</li>
            </ul>
          </Section>

          <Section title="5. Your Cookie Choices">
            <p>You have several options to manage cookies:</p>
            <ul>
              <li><strong>Browser settings:</strong> Most browsers allow you to refuse, delete, or control cookies through their settings menu. Note that disabling essential cookies may affect site functionality.</li>
              <li><strong>Opt-out tools:</strong> You can opt out of Google Analytics using the Google Analytics Opt-out Browser Add-on.</li>
              <li><strong>Do Not Track:</strong> We respect browser Do Not Track (DNT) signals and will not track users who have this enabled.</li>
            </ul>
            <p>Disabling essential cookies may prevent you from logging in or using key features of FrenzPay.</p>
          </Section>

          <Section title="6. Cookie Retention Periods">
            <ul>
              <li><strong>Authentication cookies:</strong> Up to 30 days (or session, if &ldquo;Remember me&rdquo; is not selected)</li>
              <li><strong>Preference cookies:</strong> Up to 12 months</li>
              <li><strong>Analytics cookies:</strong> Up to 24 months</li>
              <li><strong>Security cookies:</strong> Session-based or up to 24 hours</li>
            </ul>
          </Section>

          <Section title="7. GDPR &amp; Privacy Rights">
            <p>If you are in the European Economic Area (EEA) or UK, you have the right to:</p>
            <ul>
              <li>Withdraw consent for non-essential cookies at any time</li>
              <li>Request information about how we process your data</li>
              <li>Object to processing based on legitimate interests</li>
            </ul>
            <p>To exercise these rights, contact us at privacy@frenzpay.co.</p>
          </Section>

          <Section title="8. Updates to This Policy">
            <p>We may update this Cookie Policy from time to time. Any significant changes will be communicated via email or an in-app notification. Continued use of our platform after changes constitutes acceptance of the updated policy.</p>
          </Section>

          <Section title="9. Contact Us">
            <p>For questions about our use of cookies:</p>
            <ul>
              <li>Email: privacy@frenzpay.co</li>
              <li>Address: FrenzPay, compliance@frenzpay.co</li>
            </ul>
          </Section>
        </div>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="border-b border-gray-100 dark:border-white/8 pb-8">
      <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-4">{title}</h2>
      <div className="text-sm text-gray-600 dark:text-gray-400 leading-relaxed space-y-3 [&_h3]:font-semibold [&_h3]:text-gray-800 dark:[&_h3]:text-gray-200 [&_h3]:mt-4 [&_h3]:mb-1 [&_ul]:list-disc [&_ul]:pl-5 [&_ul]:space-y-1.5 [&_strong]:font-semibold [&_strong]:text-gray-700 dark:[&_strong]:text-gray-300">
        {children}
      </div>
    </div>
  );
}

function Table({ headers, rows }: { headers: string[]; rows: string[][] }) {
  return (
    <div className="overflow-x-auto mt-3 rounded-xl border border-gray-100 dark:border-white/10">
      <table className="w-full text-xs">
        <thead>
          <tr className="bg-gray-50 dark:bg-white/5">
            {headers.map((h) => (
              <th key={h} className="px-4 py-3 text-left font-semibold text-gray-700 dark:text-gray-300 whitespace-nowrap">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i} className="border-t border-gray-100 dark:border-white/5">
              {row.map((cell, j) => (
                <td key={j} className="px-4 py-3 text-gray-600 dark:text-gray-400 align-top">{cell}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
