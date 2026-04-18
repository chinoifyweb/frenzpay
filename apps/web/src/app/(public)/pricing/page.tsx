"use client";

import { Check } from "lucide-react";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";

const pricingRows = [
  { feature: "Account creation", fee: "Free", highlight: true },
  { feature: "Account maintenance", fee: "Free", highlight: false },
  { feature: "Receiving payments (USD, GBP, EUR)", fee: "Free", highlight: true },
  { feature: "USDT withdrawal", fee: "1.5%", highlight: false },
  { feature: "FX conversion (to USDT)", fee: "0.5% spread", highlight: false },
  { feature: "Minimum withdrawal", fee: "$10", highlight: false },
  { feature: "Maximum withdrawal", fee: "No limit", highlight: true },
  { feature: "KYC verification", fee: "Free", highlight: false },
];

const faqs = [
  {
    question: "Are there any monthly fees?",
    answer:
      "No. Frenz Pay has zero monthly or maintenance fees. You only pay when you withdraw. Account creation and receiving payments are completely free.",
  },
  {
    question: "How is the 1.5% withdrawal fee calculated?",
    answer:
      "The 1.5% fee is calculated on the USDT amount you withdraw. For example, if you withdraw $1,000 worth of USDT, the fee would be $15. The fee is deducted automatically from your withdrawal amount.",
  },
  {
    question: "What does the 0.5% FX spread mean?",
    answer:
      "When converting your USD, GBP, or EUR balance to USDT, we apply a 0.5% spread on the market exchange rate. This is significantly lower than traditional banks and most competitors.",
  },
  {
    question: "Are there any hidden fees?",
    answer:
      "Absolutely not. What you see on this page is what you pay. No setup fees, no monthly fees, no inactivity fees, no deposit fees. We believe in complete transparency.",
  },
  {
    question: "Do senders pay any fees?",
    answer:
      "Frenz Pay does not charge senders. However, the sender's bank or platform may charge their own transfer fees depending on the payment method (ACH, wire, SEPA, etc.).",
  },
  {
    question: "Is there a minimum deposit?",
    answer:
      "There is no minimum deposit requirement. You can receive any amount into your virtual accounts. However, the minimum withdrawal amount is $10.",
  },
];

export default function PricingPage() {
  return (
    <>
      {/* Hero */}
      <section className="py-24 sm:py-32">
        <div className="mx-auto max-w-3xl px-4 text-center sm:px-6 lg:px-8">
          <h1 className="text-4xl font-bold tracking-tight text-foreground sm:text-5xl">
            Simple, transparent{" "}
            <span className="text-primary">pricing</span>
          </h1>
          <p className="mt-6 text-lg leading-relaxed text-muted-foreground">
            No monthly fees. No hidden charges. You only pay when you withdraw.
            Start receiving payments for free.
          </p>
        </div>
      </section>

      {/* Pricing Table */}
      <section className="pb-24 sm:pb-32">
        <div className="mx-auto max-w-2xl px-4 sm:px-6 lg:px-8">
          <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
            <div className="border-b border-border bg-muted/30 px-6 py-4">
              <div className="grid grid-cols-2">
                <p className="text-sm font-semibold text-foreground">
                  Feature
                </p>
                <p className="text-right text-sm font-semibold text-foreground">
                  Fee
                </p>
              </div>
            </div>
            <div className="divide-y divide-border">
              {pricingRows.map((row) => (
                <div
                  key={row.feature}
                  className="grid grid-cols-2 px-6 py-4 transition-colors hover:bg-muted/20"
                >
                  <p className="text-sm text-foreground">{row.feature}</p>
                  <p
                    className={`text-right text-sm font-medium ${
                      row.highlight ? "text-primary" : "text-foreground"
                    }`}
                  >
                    {row.fee}
                  </p>
                </div>
              ))}
            </div>
          </div>

          {/* Highlights */}
          <div className="mt-12 grid gap-6 sm:grid-cols-3">
            {[
              { label: "Deposits", value: "Free" },
              { label: "Withdrawals", value: "1.5%" },
              { label: "FX Spread", value: "0.5%" },
            ].map((item) => (
              <div
                key={item.label}
                className="rounded-xl border border-border bg-card p-6 text-center"
              >
                <p className="text-3xl font-bold text-primary">{item.value}</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  {item.label}
                </p>
              </div>
            ))}
          </div>

          {/* What's included */}
          <div className="mt-16">
            <h2 className="text-center text-xl font-semibold text-foreground">
              Every account includes
            </h2>
            <div className="mt-8 grid gap-3 sm:grid-cols-2">
              {[
                "Virtual USD account",
                "Virtual GBP account",
                "Virtual EUR account",
                "USDT withdrawals (TRC-20 & ERC-20)",
                "Real-time notifications",
                "Transaction history & exports",
                "Two-factor authentication",
                "Dedicated support",
              ].map((item) => (
                <div key={item} className="flex items-center gap-3">
                  <Check className="size-4 shrink-0 text-primary" />
                  <span className="text-sm text-muted-foreground">{item}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section className="border-t border-border bg-muted/30 py-24 sm:py-32">
        <div className="mx-auto max-w-2xl px-4 sm:px-6 lg:px-8">
          <h2 className="text-center text-3xl font-bold tracking-tight text-foreground">
            Pricing FAQ
          </h2>
          <div className="mt-12">
            <Accordion defaultValue={[]} className="w-full">
              {faqs.map((faq, i) => (
                <AccordionItem key={i} value={`item-${i}`}>
                  <AccordionTrigger className="text-left text-base">
                    {faq.question}
                  </AccordionTrigger>
                  <AccordionContent className="text-muted-foreground">
                    {faq.answer}
                  </AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-24 sm:py-32">
        <div className="mx-auto max-w-3xl px-4 text-center sm:px-6 lg:px-8">
          <h2 className="text-3xl font-bold tracking-tight text-foreground">
            Start receiving payments for free
          </h2>
          <p className="mt-4 text-lg text-muted-foreground">
            Download Frenz Pay and get started in under 2 minutes. No credit card required.
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
          </div>
        </div>
      </section>
    </>
  );
}
