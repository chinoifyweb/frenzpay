import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "AML Policy | FrenzPay",
  description: "FrenzPay Anti-Money Laundering and Counter-Terrorism Financing Policy.",
};

export default function AmlPolicyPage() {
  return (
    <div className="min-h-screen bg-white dark:bg-[#0B1120] pt-24 pb-20">
      <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="mb-12">
          <span className="inline-block rounded-full bg-green-50 dark:bg-green-500/10 px-4 py-1.5 text-sm font-semibold text-green-600 dark:text-green-400 mb-4">
            Legal &amp; Compliance
          </span>
          <h1 className="text-4xl font-extrabold text-gray-900 dark:text-white">
            Anti-Money Laundering (AML) &amp; Counter-Terrorism Financing (CTF) Policy
          </h1>
          <p className="mt-4 text-gray-500 dark:text-gray-400">
            Effective Date: January 1, 2025 &nbsp;|&nbsp; Last Updated: March 2026
          </p>
          <div className="mt-6 rounded-xl border border-amber-200 dark:border-amber-500/20 bg-amber-50 dark:bg-amber-500/5 p-4">
            <p className="text-sm text-amber-700 dark:text-amber-400">
              <strong>Compliance Contact:</strong> compliance@frenzpay.co &nbsp;|&nbsp;
              <strong>AML Officer:</strong> aml@frenzpay.co
            </p>
          </div>
        </div>

        <div className="prose prose-gray dark:prose-invert max-w-none space-y-10">
          <Section title="1. Introduction &amp; Commitment">
            <p>FrenzPay (&ldquo;Company,&rdquo; &ldquo;we,&rdquo; &ldquo;us,&rdquo; or &ldquo;our&rdquo;) is committed to the highest standards of Anti-Money Laundering (AML) compliance and Counter-Terrorism Financing (CTF) prevention. This policy establishes a comprehensive framework to detect, prevent, and report suspicious financial activity in accordance with applicable laws and regulations.</p>
            <p>FrenzPay strictly prohibits the use of its platform for money laundering, terrorist financing, fraud, sanctions evasion, or any other financial crime. All users, employees, contractors, and partners are expected to adhere to this policy.</p>
          </Section>

          <Section title="2. Legal &amp; Regulatory Framework">
            <p>This policy is informed by and consistent with:</p>
            <ul>
              <li>The Financial Action Task Force (FATF) 40 Recommendations</li>
              <li>The Nigerian Money Laundering (Prevention and Prohibition) Act 2022</li>
              <li>The Proceeds of Crime (Money Laundering) and Terrorist Financing Act</li>
              <li>The United States Bank Secrecy Act (BSA)</li>
              <li>The UK Proceeds of Crime Act 2002 and Terrorism Act 2000</li>
              <li>EU Anti-Money Laundering Directives (AMLD4, AMLD5, AMLD6)</li>
              <li>OFAC, UN, EU, and UK sanctions lists</li>
              <li>Virtual Asset Service Provider (VASP) regulations in applicable jurisdictions</li>
            </ul>
          </Section>

          <Section title="3. Know Your Customer (KYC) Requirements">
            <p>FrenzPay requires all users to complete identity verification before accessing core services. Our KYC process includes:</p>
            <h3 className="text-base font-bold mt-4 mb-2">3.1 Individual Verification</h3>
            <ul>
              <li>Government-issued photo ID (National ID, Passport, or Driver&apos;s License)</li>
              <li>Live selfie / liveness check matched against the ID document</li>
              <li>Proof of residential address (utility bill or bank statement not older than 3 months)</li>
              <li>Date of birth verification</li>
              <li>Phone number and email verification with OTP</li>
            </ul>
            <h3 className="text-base font-bold mt-4 mb-2">3.2 Enhanced Due Diligence (EDD)</h3>
            <p>Enhanced verification is required for users who:</p>
            <ul>
              <li>Process transactions above $10,000 USD per month</li>
              <li>Are classified as Politically Exposed Persons (PEPs)</li>
              <li>Operate from high-risk jurisdictions as defined by FATF</li>
              <li>Exhibit unusual transaction patterns or behaviors</li>
            </ul>
            <h3 className="text-base font-bold mt-4 mb-2">3.3 Ongoing KYC Monitoring</h3>
            <p>We continuously monitor user activity and may request updated documentation if circumstances change or risk indicators emerge.</p>
          </Section>

          <Section title="4. Transaction Monitoring &amp; Reporting">
            <h3 className="text-base font-bold mt-4 mb-2">4.1 Automated Monitoring</h3>
            <p>All transactions on FrenzPay are subject to real-time automated monitoring systems that flag:</p>
            <ul>
              <li>Structuring or smurfing (breaking large transactions into smaller ones to evade reporting thresholds)</li>
              <li>Rapid deposits followed by immediate withdrawals</li>
              <li>Transactions inconsistent with the user&apos;s stated source of funds</li>
              <li>Unusually high transaction volumes for account profile</li>
              <li>Transactions involving sanctioned countries or entities</li>
              <li>Round-dollar or unusual transaction patterns</li>
            </ul>
            <h3 className="text-base font-bold mt-4 mb-2">4.2 Suspicious Activity Reports (SARs)</h3>
            <p>Where we identify potentially suspicious activity, we will file a Suspicious Activity Report (SAR) with the appropriate financial intelligence unit (FIU) in the relevant jurisdiction. SAR filings are confidential — we are legally prohibited from disclosing to users that a SAR has been filed.</p>
            <h3 className="text-base font-bold mt-4 mb-2">4.3 Currency Transaction Reports (CTRs)</h3>
            <p>Transactions meeting or exceeding applicable thresholds (e.g., $10,000 USD or equivalent) are reported to relevant regulatory authorities as required by law.</p>
          </Section>

          <Section title="5. Sanctions Screening">
            <p>FrenzPay screens all users and transactions against:</p>
            <ul>
              <li>OFAC Specially Designated Nationals (SDN) list</li>
              <li>UN Security Council Consolidated List</li>
              <li>EU Consolidated Sanctions List</li>
              <li>UK Office of Financial Sanctions Implementation (OFSI) list</li>
              <li>Nigerian NFIU and CBN watchlists</li>
            </ul>
            <p>Any match against a sanctions list will result in immediate account suspension, funds freeze, and mandatory reporting to the relevant authorities. We do not accept users from or facilitate transactions involving OFAC-sanctioned countries including Iran, North Korea, Cuba, Syria, and the Crimea region.</p>
          </Section>

          <Section title="6. Prohibited Activities">
            <p>The following activities are strictly prohibited on FrenzPay:</p>
            <ul>
              <li>Money laundering in any form</li>
              <li>Terrorist financing or support of designated terrorist organizations</li>
              <li>Tax evasion or facilitation of tax fraud</li>
              <li>Fraud, identity theft, or impersonation</li>
              <li>Use of FrenzPay for unlawful gambling proceeds</li>
              <li>Processing payments for illegal goods, services, or darknet markets</li>
              <li>Sanctions evasion or circumvention of financial controls</li>
              <li>Use of stolen, unauthorized, or fictitious financial credentials</li>
              <li>Ponzi schemes, pyramid schemes, or fraudulent investment platforms</li>
            </ul>
          </Section>

          <Section title="7. Record Keeping">
            <p>FrenzPay retains the following records for a minimum of 5 years (or longer where required by law):</p>
            <ul>
              <li>All KYC documentation and verification records</li>
              <li>Complete transaction histories with timestamps</li>
              <li>Correspondence related to compliance decisions</li>
              <li>SAR and CTR filings and related evidence</li>
              <li>Risk assessments and due diligence reviews</li>
            </ul>
          </Section>

          <Section title="8. Risk-Based Approach">
            <p>FrenzPay applies a risk-based approach to AML compliance, classifying users and transactions into risk categories:</p>
            <ul>
              <li><strong>Low Risk:</strong> Verified individuals from low-risk jurisdictions with consistent, low-volume transaction patterns</li>
              <li><strong>Medium Risk:</strong> Users with moderate transaction volumes or operating from medium-risk countries</li>
              <li><strong>High Risk:</strong> PEPs, users from high-risk jurisdictions, high-volume accounts, or those with unusual patterns — subject to EDD</li>
            </ul>
          </Section>

          <Section title="9. Employee Training &amp; Responsibilities">
            <p>All FrenzPay employees and contractors with access to financial data are required to:</p>
            <ul>
              <li>Complete AML/CTF training upon onboarding and annually thereafter</li>
              <li>Report any suspicious activity to the designated AML Compliance Officer</li>
              <li>Never tip off customers under investigation</li>
              <li>Maintain strict confidentiality about compliance-related matters</li>
            </ul>
          </Section>

          <Section title="10. Reporting Concerns">
            <p>If you have concerns about potential money laundering, fraud, or financial crime on our platform, please contact us immediately:</p>
            <ul>
              <li><strong>AML Compliance:</strong> aml@frenzpay.co</li>
              <li><strong>General Compliance:</strong> compliance@frenzpay.co</li>
              <li><strong>Security Incidents:</strong> security@frenzpay.co</li>
            </ul>
            <p>All reports are treated confidentially and investigated promptly.</p>
          </Section>

          <Section title="11. Policy Review">
            <p>This AML/CTF Policy is reviewed at least annually, and updated as necessary to reflect changes in regulation, business operations, or risk environment. The current version is always available on our website at frenzpay.co/aml-policy.</p>
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
      <div className="text-sm text-gray-600 dark:text-gray-400 leading-relaxed space-y-3 [&_ul]:list-disc [&_ul]:pl-5 [&_ul]:space-y-1.5 [&_strong]:font-semibold [&_strong]:text-gray-800 dark:[&_strong]:text-gray-200">
        {children}
      </div>
    </div>
  );
}
