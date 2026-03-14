"use client";

import Link from "next/link";
import {
  DollarSign,
  PoundSterling,
  Euro,
  ArrowUpRight,
  ShieldCheck,
  LayoutDashboard,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { buttonVariants } from "@/components/ui/button";

const features = [
  {
    icon: DollarSign,
    title: "Virtual USD Account",
    subtitle: "Receive payments in US Dollars",
    description:
      "Get a dedicated US bank account with routing and account numbers. Accept ACH transfers, domestic wires, and international SWIFT payments from employers, freelance platforms, and clients across the United States.",
    details: [
      "Unique routing and account number",
      "ACH transfers (1-2 business days)",
      "Domestic wire transfers (same day)",
      "International SWIFT payments",
      "No fees on incoming deposits",
    ],
    align: "left" as const,
  },
  {
    icon: PoundSterling,
    title: "Virtual GBP Account",
    subtitle: "Receive payments in British Pounds",
    description:
      "Get a UK bank account with sort code and account number. Accept Faster Payments for instant transfers and SWIFT for international payments from UK-based clients and companies.",
    details: [
      "UK sort code and account number",
      "Faster Payments (instant)",
      "SWIFT international transfers",
      "BACS payments supported",
      "Free incoming deposits",
    ],
    align: "right" as const,
  },
  {
    icon: Euro,
    title: "Virtual EUR Account",
    subtitle: "Receive payments in Euros",
    description:
      "Get a European bank account with IBAN. Accept SEPA transfers from across the Eurozone and SWIFT payments from anywhere in the world. Perfect for clients in Germany, France, Netherlands, and beyond.",
    details: [
      "Dedicated IBAN",
      "SEPA transfers (1 business day)",
      "SEPA Instant (seconds)",
      "SWIFT international payments",
      "Zero deposit fees",
    ],
    align: "left" as const,
  },
  {
    icon: ArrowUpRight,
    title: "USDT Withdrawals",
    subtitle: "Convert and withdraw to crypto",
    description:
      "Convert your USD, GBP, or EUR balance to USDT and withdraw to any compatible wallet. Choose TRC-20 for the lowest fees or ERC-20 for maximum compatibility. Withdrawals typically complete in under 5 minutes.",
    details: [
      "TRC-20 network (lowest fees)",
      "ERC-20 network supported",
      "Competitive FX rates (0.5% spread)",
      "1.5% withdrawal fee",
      "Minimum withdrawal: $10",
      "Processed in under 5 minutes",
    ],
    align: "right" as const,
  },
  {
    icon: ShieldCheck,
    title: "Bank-Grade Security",
    subtitle: "Your money is always protected",
    description:
      "We take security seriously. Every account is protected with enterprise-grade encryption, mandatory two-factor authentication, and comprehensive KYC verification. All transactions are monitored in real-time for suspicious activity.",
    details: [
      "256-bit AES encryption",
      "Two-factor authentication (2FA)",
      "KYC identity verification",
      "Real-time fraud monitoring",
      "Complete audit trails",
      "SOC 2 compliance (in progress)",
    ],
    align: "left" as const,
  },
  {
    icon: LayoutDashboard,
    title: "Powerful Dashboard",
    subtitle: "Full visibility into your finances",
    description:
      "Track every payment, conversion, and withdrawal in real-time. Our clean, intuitive dashboard gives you complete visibility into your multi-currency balances, transaction history, and analytics at a glance.",
    details: [
      "Real-time balance across all currencies",
      "Detailed transaction history",
      "Instant email & push notifications",
      "Export statements (CSV, PDF)",
      "Referral tracking and rewards",
      "Mobile-optimized interface",
    ],
    align: "right" as const,
  },
];

export default function FeaturesPage() {
  return (
    <>
      {/* Hero */}
      <section className="relative overflow-hidden py-24 sm:py-32">
        <div className="pointer-events-none absolute inset-0 -z-10">
          <div className="absolute -top-40 left-1/2 h-[500px] w-[500px] -translate-x-1/2 rounded-full bg-primary/5 blur-3xl" />
        </div>
        <div className="mx-auto max-w-3xl px-4 text-center sm:px-6 lg:px-8">
          <h1 className="text-4xl font-bold tracking-tight text-foreground sm:text-5xl">
            Everything you need to receive{" "}
            <span className="text-primary">global payments</span>
          </h1>
          <p className="mt-6 text-lg leading-relaxed text-muted-foreground">
            Virtual bank accounts in three major currencies, instant USDT
            withdrawals, and bank-grade security. Built for freelancers, remote
            workers, and creators across Africa.
          </p>
        </div>
      </section>

      {/* Feature blocks */}
      <section className="pb-24 sm:pb-32">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="space-y-24 lg:space-y-32">
            {features.map((feature) => (
              <div
                key={feature.title}
                className="grid items-center gap-12 lg:grid-cols-2"
              >
                <div
                  className={
                    feature.align === "right" ? "lg:order-2" : undefined
                  }
                >
                  <div className="flex size-14 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                    <feature.icon className="size-7" />
                  </div>
                  <p className="mt-4 text-sm font-medium uppercase tracking-wider text-primary">
                    {feature.subtitle}
                  </p>
                  <h2 className="mt-2 text-3xl font-bold tracking-tight text-foreground">
                    {feature.title}
                  </h2>
                  <p className="mt-4 text-base leading-relaxed text-muted-foreground">
                    {feature.description}
                  </p>
                  <ul className="mt-8 space-y-3">
                    {feature.details.map((detail) => (
                      <li
                        key={detail}
                        className="flex items-start gap-3 text-sm text-muted-foreground"
                      >
                        <span className="mt-1.5 block size-1.5 shrink-0 rounded-full bg-primary" />
                        {detail}
                      </li>
                    ))}
                  </ul>
                </div>

                {/* Placeholder visual */}
                <div
                  className={
                    feature.align === "right" ? "lg:order-1" : undefined
                  }
                >
                  <div className="flex aspect-[4/3] items-center justify-center rounded-2xl border border-border bg-muted/30">
                    <feature.icon className="size-20 text-muted-foreground/20" />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="border-t border-border bg-muted/30 py-24 sm:py-32">
        <div className="mx-auto max-w-3xl px-4 text-center sm:px-6 lg:px-8">
          <h2 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
            Start receiving global payments today
          </h2>
          <p className="mt-4 text-lg text-muted-foreground">
            Download Frenz Pay and get started in under 2 minutes. No monthly fees.
          </p>
          <div className="mt-10 flex flex-wrap justify-center gap-3">
            <a
              href="#"
              className="inline-flex h-12 items-center gap-2.5 rounded-xl bg-gray-900 px-5 text-white transition-all hover:bg-gray-800"
            >
              <svg className="size-5" viewBox="0 0 24 24" fill="currentColor"><path d="M17.05 20.28c-.98.95-2.05.8-3.08.35-1.09-.46-2.09-.48-3.24 0-1.44.62-2.2.44-3.06-.35C2.79 15.25 3.51 7.59 9.05 7.31c1.35.07 2.29.74 3.08.8 1.18-.24 2.31-.93 3.57-.84 1.51.12 2.65.72 3.4 1.8-3.12 1.87-2.38 5.98.48 7.13-.57 1.5-1.31 2.99-2.54 4.09zM12.03 7.25c-.15-2.23 1.66-4.07 3.74-4.25.29 2.58-2.34 4.5-3.74 4.25z"/></svg>
              <div className="text-left"><div className="text-[10px] leading-none opacity-70">Download on the</div><div className="text-sm font-semibold leading-tight">App Store</div></div>
            </a>
            <a
              href="#"
              className="inline-flex h-12 items-center gap-2.5 rounded-xl bg-gray-900 px-5 text-white transition-all hover:bg-gray-800"
            >
              <svg className="size-5" viewBox="0 0 24 24" fill="currentColor"><path d="M3.609 1.814L13.792 12 3.61 22.186a.996.996 0 01-.61-.92V2.734a1 1 0 01.609-.92zm10.89 10.893l2.302 2.302-10.937 6.333 8.635-8.635zm3.199-3.199l2.302 2.302a1 1 0 010 1.38l-2.302 2.302L15.395 13l2.303-2.492zM5.864 2.658L16.8 8.99l-2.302 2.302-8.634-8.634z"/></svg>
              <div className="text-left"><div className="text-[10px] leading-none opacity-70">Get it on</div><div className="text-sm font-semibold leading-tight">Google Play</div></div>
            </a>
            <Link
              href="/pricing"
              className={cn(
                buttonVariants({ variant: "outline", size: "lg" }),
                "h-12 px-8 text-base"
              )}
            >
              View Pricing
            </Link>
          </div>
        </div>
      </section>
    </>
  );
}
