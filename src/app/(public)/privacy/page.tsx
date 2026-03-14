import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Privacy Policy — Frenz Pay",
  description:
    "Learn how Frenz Pay collects, uses, and protects your personal data.",
};

export default function PrivacyPage() {
  return (
    <section className="py-24 sm:py-32">
      <div className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8">
        <h1 className="text-4xl font-bold tracking-tight text-foreground">
          Privacy Policy
        </h1>
        <p className="mt-4 text-sm text-muted-foreground">
          Last updated: March 14, 2026
        </p>

        <div className="prose prose-neutral mt-12 max-w-none dark:prose-invert [&_h2]:mt-10 [&_h2]:text-xl [&_h2]:font-semibold [&_h2]:text-foreground [&_p]:leading-relaxed [&_p]:text-muted-foreground [&_li]:text-muted-foreground [&_ul]:space-y-2">
          <h2>1. Introduction</h2>
          <p>
            Frenz Pay Limited (&quot;Frenz Pay,&quot; &quot;we,&quot;
            &quot;us,&quot; or &quot;our&quot;) is committed to protecting your
            privacy. This Privacy Policy explains how we collect, use, disclose,
            and safeguard your personal information when you use our platform and
            services.
          </p>

          <h2>2. Information We Collect</h2>
          <p>We collect the following types of information:</p>

          <p>
            <strong className="text-foreground">
              Personal identification information:
            </strong>{" "}
            Full name, email address, phone number, date of birth, nationality,
            and residential address.
          </p>
          <p>
            <strong className="text-foreground">
              Identity verification documents:
            </strong>{" "}
            Government-issued photo ID (passport, national ID, or
            driver&apos;s license), proof of address, and selfie for KYC
            verification.
          </p>
          <p>
            <strong className="text-foreground">Financial information:</strong>{" "}
            USDT wallet addresses, transaction history, and payment details.
          </p>
          <p>
            <strong className="text-foreground">Technical data:</strong> IP
            address, browser type, device information, operating system, and
            usage patterns.
          </p>

          <h2>3. How We Use Your Information</h2>
          <p>We use your information to:</p>
          <ul className="list-disc pl-6">
            <li>Create and manage your account</li>
            <li>
              Verify your identity in compliance with KYC/AML regulations
            </li>
            <li>
              Process transactions, including receiving payments and USDT
              withdrawals
            </li>
            <li>Provide customer support</li>
            <li>Detect and prevent fraud and unauthorized activity</li>
            <li>
              Send transactional notifications (payment received, withdrawal
              complete, etc.)
            </li>
            <li>
              Improve our services through analytics and usage data
            </li>
            <li>Comply with legal and regulatory obligations</li>
          </ul>

          <h2>4. Data Sharing</h2>
          <p>
            We do not sell your personal information. We may share your data
            with:
          </p>
          <ul className="list-disc pl-6">
            <li>
              <strong className="text-foreground">Banking partners:</strong> To
              provision and maintain your virtual accounts
            </li>
            <li>
              <strong className="text-foreground">KYC providers:</strong> To
              verify your identity
            </li>
            <li>
              <strong className="text-foreground">
                Regulatory authorities:
              </strong>{" "}
              When required by law or regulation
            </li>
            <li>
              <strong className="text-foreground">Service providers:</strong>{" "}
              Who assist us in operating the platform (hosting, analytics,
              email)
            </li>
          </ul>
          <p>
            All third parties are contractually required to protect your data
            and use it only for the purposes specified.
          </p>

          <h2>5. Data Security</h2>
          <p>
            We implement industry-standard security measures to protect your
            data, including:
          </p>
          <ul className="list-disc pl-6">
            <li>256-bit AES encryption for data at rest and in transit</li>
            <li>Two-factor authentication (2FA) for account access</li>
            <li>Regular security audits and penetration testing</li>
            <li>
              Access controls limiting employee access to personal data
            </li>
            <li>Secure, encrypted data storage</li>
          </ul>

          <h2>6. Data Retention</h2>
          <p>
            We retain your personal data for as long as your account is active
            and for a minimum of 6 years after account closure, as required by
            financial regulations. Transaction records are retained as required
            by applicable anti-money laundering laws.
          </p>

          <h2>7. Your Rights</h2>
          <p>Depending on your jurisdiction, you may have the right to:</p>
          <ul className="list-disc pl-6">
            <li>Access your personal data</li>
            <li>Correct inaccurate data</li>
            <li>
              Request deletion of your data (subject to legal retention
              requirements)
            </li>
            <li>Object to certain processing activities</li>
            <li>Request a copy of your data in a portable format</li>
          </ul>
          <p>
            To exercise these rights, contact us at{" "}
            <a
              href="mailto:privacy@frenz.ng"
              className="text-primary hover:underline"
            >
              privacy@frenz.ng
            </a>
            .
          </p>

          <h2 id="cookies">8. Cookies and Tracking</h2>
          <p>
            We use essential cookies to maintain your session and preferences.
            We also use analytics cookies to understand how our platform is used.
            You can manage cookie preferences through your browser settings.
          </p>
          <ul className="list-disc pl-6">
            <li>
              <strong className="text-foreground">Essential cookies:</strong>{" "}
              Required for the platform to function (authentication, security)
            </li>
            <li>
              <strong className="text-foreground">Analytics cookies:</strong>{" "}
              Help us understand usage patterns (can be disabled)
            </li>
          </ul>

          <h2>9. International Data Transfers</h2>
          <p>
            Your data may be transferred to and processed in countries other
            than your own. We ensure appropriate safeguards are in place for
            international transfers, including contractual protections with our
            service providers.
          </p>

          <h2>10. Children&apos;s Privacy</h2>
          <p>
            Our services are not intended for individuals under 18 years of age.
            We do not knowingly collect personal information from children.
          </p>

          <h2>11. Changes to This Policy</h2>
          <p>
            We may update this Privacy Policy from time to time. We will notify
            you of material changes via email or through the platform. The
            &quot;Last updated&quot; date at the top of this page indicates when
            the policy was last revised.
          </p>

          <h2>12. Contact Us</h2>
          <p>
            For privacy-related inquiries, please contact our Data Protection
            Officer at{" "}
            <a
              href="mailto:privacy@frenz.ng"
              className="text-primary hover:underline"
            >
              privacy@frenz.ng
            </a>
            .
          </p>
        </div>
      </div>
    </section>
  );
}
