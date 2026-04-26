import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Terms of Service — Frenz Pay",
  description: "Terms of Service for using the Frenz Pay platform.",
};

export default function TermsPage() {
  return (
    <section className="py-24 sm:py-32">
      <div className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8">
        <h1 className="text-4xl font-bold tracking-tight text-foreground">
          Terms of Service
        </h1>
        <p className="mt-4 text-sm text-muted-foreground">
          Last updated: March 14, 2026
        </p>

        <div className="prose prose-neutral mt-12 max-w-none dark:prose-invert [&_h2]:mt-10 [&_h2]:text-xl [&_h2]:font-semibold [&_h2]:text-foreground [&_p]:leading-relaxed [&_p]:text-muted-foreground [&_li]:text-muted-foreground [&_ul]:space-y-2">
          <h2>1. Acceptance of Terms</h2>
          <p>
            By accessing or using the Frenz Pay platform (&quot;Service&quot;),
            operated by Frenz Pay Limited (&quot;Company,&quot; &quot;we,&quot;
            &quot;us,&quot; or &quot;our&quot;), you agree to be bound by these
            Terms of Service (&quot;Terms&quot;). If you do not agree to these
            Terms, do not use the Service.
          </p>

          <h2>2. Eligibility</h2>
          <p>
            To use our Service, you must be at least 18 years old and capable of
            forming a binding contract. By creating an account, you represent
            that:
          </p>
          <ul className="list-disc pl-6">
            <li>You are at least 18 years of age</li>
            <li>You have the legal capacity to enter into these Terms</li>
            <li>
              You are not prohibited from using financial services under
              applicable law
            </li>
            <li>
              All information you provide during registration is accurate and
              complete
            </li>
          </ul>

          <h2>3. Account Registration and KYC</h2>
          <p>
            To access our services, you must create an account and complete our
            Know Your Customer (KYC) verification process. This requires
            providing valid government-issued identification and other
            information as requested. We reserve the right to refuse service if
            KYC verification cannot be satisfactorily completed.
          </p>

          <h2>4. Services Provided</h2>
          <p>Frenz Pay provides the following services:</p>
          <ul className="list-disc pl-6">
            <li>
              Virtual bank accounts in USD, EUR, and NGN for receiving
              international payments
            </li>
            <li>
              Currency conversion between supported fiat currencies (USD, EUR, NGN)
            </li>
            <li>
              Withdrawal of funds to Nigerian bank accounts
            </li>
          </ul>
          <p>
            We do not provide banking services directly. Virtual accounts are
            provided through our banking partners and are subject to their terms
            and conditions.
          </p>

          <h2>5. Fees</h2>
          <p>
            Our current fee schedule is published on our Pricing page. We
            reserve the right to modify fees with 30 days&apos; prior notice.
            Key fees include:
          </p>
          <ul className="list-disc pl-6">
            <li>Account creation: Free</li>
            <li>Receiving payments: Free</li>
            <li>Naira bank withdrawal: 1.5% of withdrawal amount</li>
            <li>FX conversion: 0.5% spread</li>
          </ul>

          <h2>6. Prohibited Activities</h2>
          <p>You agree not to use the Service for:</p>
          <ul className="list-disc pl-6">
            <li>
              Money laundering, terrorist financing, or any other illegal
              activity
            </li>
            <li>Fraud or deception of any kind</li>
            <li>Circumventing sanctions or embargoes</li>
            <li>
              Receiving funds from illegal or unauthorized sources
            </li>
            <li>
              Any activity that violates applicable laws or regulations
            </li>
          </ul>

          <h2>7. Account Suspension and Termination</h2>
          <p>
            We may suspend or terminate your account at any time if we
            reasonably believe you have violated these Terms, are engaged in
            suspicious activity, or as required by law or regulation. In such
            cases, we will make reasonable efforts to notify you and facilitate
            the withdrawal of any remaining funds, subject to legal
            requirements.
          </p>

          <h2>8. Limitation of Liability</h2>
          <p>
            To the maximum extent permitted by applicable law, Frenz Pay shall
            not be liable for any indirect, incidental, special, consequential,
            or punitive damages, including loss of profits, data, or goodwill,
            arising out of or in connection with your use of the Service.
          </p>

          <h2>9. Dispute Resolution</h2>
          <p>
            Any dispute arising out of or in connection with these Terms shall
            first be attempted to be resolved through good-faith negotiation. If
            a resolution cannot be reached within 30 days, the dispute shall be
            submitted to binding arbitration in Lagos, Nigeria, in accordance
            with the Arbitration and Conciliation Act.
          </p>

          <h2>10. Governing Law</h2>
          <p>
            These Terms shall be governed by and construed in accordance with the
            laws of the Federal Republic of Nigeria.
          </p>

          <h2>11. Changes to Terms</h2>
          <p>
            We reserve the right to modify these Terms at any time. Material
            changes will be communicated via email or in-app notification at
            least 30 days before taking effect. Your continued use of the
            Service after such changes constitutes acceptance of the modified
            Terms.
          </p>

          <h2>12. Contact Us</h2>
          <p>
            If you have any questions about these Terms, please contact us at{" "}
            <a
              href="mailto:legal@frenzpay.co"
              className="text-primary hover:underline"
            >
              legal@frenzpay.co
            </a>
            .
          </p>
        </div>
      </div>
    </section>
  );
}
