import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Refund Policy | FrenzPay",
  description: "FrenzPay refund, reversal, and dispute resolution policy.",
};

export default function RefundPolicyPage() {
  return (
    <div className="min-h-screen bg-white dark:bg-[#0B1120] pt-24 pb-20">
      <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="mb-12">
          <span className="inline-block rounded-full bg-green-50 dark:bg-green-500/10 px-4 py-1.5 text-sm font-semibold text-green-600 dark:text-green-400 mb-4">
            Legal
          </span>
          <h1 className="text-4xl font-extrabold text-gray-900 dark:text-white">Refund &amp; Reversal Policy</h1>
          <p className="mt-4 text-gray-500 dark:text-gray-400">
            Effective Date: January 1, 2025 &nbsp;|&nbsp; Last Updated: March 2026
          </p>
          <div className="mt-6 rounded-xl border border-blue-200 dark:border-blue-500/20 bg-blue-50 dark:bg-blue-500/5 p-4">
            <p className="text-sm text-blue-700 dark:text-blue-400">
              <strong>Support:</strong> support@frenzpay.co &nbsp;|&nbsp;
              <strong>WhatsApp:</strong> +1 (236) 599-7663 &nbsp;|&nbsp;
              <strong>Response time:</strong> Within 24 hours
            </p>
          </div>
        </div>

        <div className="space-y-10">
          <Section title="1. Overview">
            <p>FrenzPay facilitates the receipt of international payments into virtual bank accounts and the withdrawal of funds in USDT (cryptocurrency). Due to the nature of financial transactions and cryptocurrency conversions, this policy explains when refunds may be available, how disputes are handled, and the limitations of reversals in our system.</p>
            <p>We are committed to resolving disputes fairly and transparently. Please read this policy carefully and contact us if you have questions.</p>
          </Section>

          <Section title="2. Deposits / Incoming Payments">
            <h3>2.1 Received Funds</h3>
            <p>Funds received into your Frenz Pay virtual account (USD, GBP, or EUR) are credited to your account balance. FrenzPay does not charge fees for incoming deposits.</p>
            <h3>2.2 Incorrect or Unauthorized Deposits</h3>
            <p>If funds are received in your account from an unauthorized or erroneous source, we are obligated to cooperate with the sending institution to return those funds. FrenzPay reserves the right to reverse or freeze such deposits pending investigation.</p>
            <h3>2.3 Failed Deposits</h3>
            <p>If a sender initiates a payment that fails to arrive in your account, the issue must be resolved between the sender and their financial institution. Please provide us with the sender&apos;s transaction reference so we can assist in tracing the funds.</p>
          </Section>

          <Section title="3. USDT Withdrawals">
            <h3>3.1 Confirmed Withdrawals Are Final</h3>
            <p>Once a USDT withdrawal has been confirmed on the blockchain network, <strong>it cannot be reversed or refunded</strong>. Cryptocurrency transactions are irreversible by nature. Please double-check your wallet address before confirming any withdrawal.</p>
            <h3>3.2 Incorrect Wallet Address</h3>
            <p>If you enter an incorrect wallet address and the withdrawal is processed, FrenzPay cannot recover or reverse the funds. Users are solely responsible for ensuring the accuracy of their withdrawal addresses.</p>
            <h3>3.3 Withdrawal Still Processing</h3>
            <p>If your withdrawal has not yet been broadcast to the blockchain (i.e., status is &ldquo;pending&rdquo; or &ldquo;processing&rdquo;), contact us immediately at support@frenzpay.co. We may be able to cancel the transaction before it is finalized.</p>
            <h3>3.4 Network Failures</h3>
            <p>In rare cases of technical failures or network errors that result in funds not being delivered, we will investigate within 48 hours and credit your account if the funds were deducted but not transmitted.</p>
          </Section>

          <Section title="4. Platform Fees">
            <h3>4.1 Fee Refunds</h3>
            <p>FrenzPay charges a 1.5% withdrawal fee and 0.5% FX spread on applicable transactions. These fees are:</p>
            <ul>
              <li><strong>Non-refundable</strong> once a transaction is completed</li>
              <li><strong>Refundable</strong> if the transaction failed due to a FrenzPay system error</li>
              <li><strong>Refundable</strong> if a withdrawal was cancelled before blockchain confirmation (at our discretion)</li>
            </ul>
            <h3>4.2 Erroneous Fee Charges</h3>
            <p>If you believe you were charged incorrectly (e.g., wrong fee rate applied), contact us within 30 days with your transaction reference. We will investigate and issue a credit to your account if the error is confirmed.</p>
          </Section>

          <Section title="5. Unauthorized Transactions &amp; Fraud">
            <p>If you believe your account has been accessed without authorization or you did not initiate a transaction:</p>
            <ol>
              <li><strong>Contact us immediately</strong> at security@frenzpay.co or via WhatsApp</li>
              <li>Change your password and revoke active sessions</li>
              <li>Enable or verify your 2FA settings</li>
              <li>Provide us with all relevant transaction details</li>
            </ol>
            <p>We will investigate within 5 business days. If we determine unauthorized access occurred through no fault of your own, we will work to remediate the issue to the extent possible. Note: USDT transactions already on the blockchain cannot be recovered regardless of the circumstances.</p>
          </Section>

          <Section title="6. Dispute Resolution Process">
            <p>To raise a dispute or request a refund review:</p>
            <ol>
              <li>Email support@frenzpay.co with subject line: &ldquo;Dispute — [Transaction Reference]&rdquo;</li>
              <li>Include your account email, transaction ID, amount, date, and description of the issue</li>
              <li>Our team will acknowledge within 24 hours</li>
              <li>Resolution is typically within 5–10 business days depending on complexity</li>
              <li>If unsatisfied, you may escalate to our Compliance Officer at compliance@frenzpay.co</li>
            </ol>
          </Section>

          <Section title="7. Account Termination Refunds">
            <p>If your account is closed (voluntarily or by FrenzPay):</p>
            <ul>
              <li>Any remaining fiat balance in your virtual accounts will be returned to a verified source of funds after applicable fees and any pending compliance reviews</li>
              <li>If your account is terminated due to fraud or AML violations, funds may be frozen and reported to relevant authorities</li>
              <li>Refund processing for account closures may take up to 15 business days</li>
            </ul>
          </Section>

          <Section title="8. KYC Rejection">
            <p>If your KYC application is rejected and you have a balance in your account:</p>
            <ul>
              <li>We will contact you at your registered email</li>
              <li>You may have the opportunity to re-submit corrected documentation</li>
              <li>If unable to complete KYC, any deposited funds may be returned to the originating source</li>
            </ul>
          </Section>

          <Section title="9. Subscription / Premium Features">
            <p>FrenzPay currently does not charge a subscription fee. Should subscription-based features be introduced in future:</p>
            <ul>
              <li>Pro-rated refunds will be available within 7 days of subscription start</li>
              <li>No refunds after 7 days for unused portions</li>
              <li>Refund terms for future products will be clearly stated at point of purchase</li>
            </ul>
          </Section>

          <Section title="10. Contact for Refunds &amp; Disputes">
            <ul>
              <li><strong>General Support:</strong> support@frenzpay.co</li>
              <li><strong>Security Issues:</strong> security@frenzpay.co</li>
              <li><strong>Compliance &amp; Escalations:</strong> compliance@frenzpay.co</li>
              <li><strong>WhatsApp:</strong> +1 (236) 599-7663</li>
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
      <div className="text-sm text-gray-600 dark:text-gray-400 leading-relaxed space-y-3 [&_h3]:font-semibold [&_h3]:text-gray-800 dark:[&_h3]:text-gray-200 [&_h3]:mt-4 [&_h3]:mb-1 [&_ul]:list-disc [&_ul]:pl-5 [&_ul]:space-y-1.5 [&_ol]:list-decimal [&_ol]:pl-5 [&_ol]:space-y-1.5 [&_strong]:font-semibold [&_strong]:text-gray-700 dark:[&_strong]:text-gray-300">
        {children}
      </div>
    </div>
  );
}
