"use client";

import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";

const faqs = [
  {
    question: "How do I receive payments?",
    answer:
      "After signing up and completing KYC verification, you'll receive dedicated virtual bank accounts in USD, GBP, and EUR. Each account comes with unique banking details (routing number, sort code, or IBAN) that you can share with your employer, freelance platform, or clients. When they send money to your account details, the funds appear in your Frenz Pay balance — typically within 1-2 business days for ACH and SEPA, or same-day for wire transfers and Faster Payments.",
  },
  {
    question: "What currencies are supported?",
    answer:
      "Frenz Pay currently supports three currencies for receiving payments: US Dollars (USD), British Pounds (GBP), and Euros (EUR). For withdrawals, we support USDT (Tether) on TRC-20 and ERC-20 networks. We're actively working on adding more currencies and withdrawal options.",
  },
  {
    question: "How do USDT withdrawals work?",
    answer:
      "To withdraw, simply go to your dashboard, select the currency balance you want to convert, enter the amount, and provide your USDT wallet address. Choose between TRC-20 (lower network fees) or ERC-20 (wider compatibility). We convert your fiat balance to USDT at competitive rates and send it to your wallet. Most withdrawals complete in under 5 minutes.",
  },
  {
    question: "What are the fees?",
    answer:
      "Frenz Pay charges zero fees for account creation, maintenance, and receiving payments. When you withdraw to USDT, we charge a 1.5% fee on the withdrawal amount. Currency conversion from fiat to USDT includes a 0.5% FX spread. The minimum withdrawal amount is $10. There are no hidden fees — what you see on our pricing page is what you pay.",
  },
  {
    question: "How long do withdrawals take?",
    answer:
      "Most USDT withdrawals are processed within 5 minutes. In rare cases, withdrawals may take up to 30 minutes due to network congestion or additional security reviews. You'll receive real-time notifications at every step of the process.",
  },
  {
    question: "Is my money safe?",
    answer:
      "Yes. We use bank-grade 256-bit AES encryption to protect your data and funds. Every account requires two-factor authentication (2FA). All users must complete KYC verification. We monitor transactions in real-time for suspicious activity and maintain comprehensive audit trails. Your funds are held with regulated banking partners.",
  },
  {
    question: "What KYC documents do I need?",
    answer:
      "To verify your identity, you'll need: (1) A valid government-issued photo ID — international passport, national ID card, or driver's license. (2) A proof of address — utility bill, bank statement, or government-issued document dated within the last 3 months. (3) A selfie for facial verification. The process typically takes a few minutes and approval is usually within 24 hours.",
  },
  {
    question: "Can I use Frenz Pay outside Nigeria?",
    answer:
      "Yes! While Frenz Pay is built with African users in mind, we support users across multiple countries. During registration, we'll verify whether our services are available in your country. We're actively expanding to more markets.",
  },
  {
    question: "What platforms can send money to my Frenz Pay account?",
    answer:
      "Any platform or individual that can send USD, GBP, or EUR via standard banking rails can pay into your Frenz Pay accounts. This includes freelance platforms (Upwork, Fiverr, Toptal), remote employment platforms (Remote.com, Deel, Oyster), direct clients, and employers. Simply share your account details the same way you'd share any bank account information.",
  },
  {
    question: "Is there a mobile app?",
    answer:
      "We're currently working on native iOS and Android apps. In the meantime, our web platform is fully responsive and works beautifully on mobile browsers. You can access all features — including receiving payments and making withdrawals — from your phone.",
  },
  {
    question: "What if I need help?",
    answer:
      "Our support team is available via email at hello@frenz.ng. You can also reach us through our Contact page or via our social media channels. We typically respond within 24 hours.",
  },
  {
    question: "How does the referral program work?",
    answer:
      "Once you have an active account, you'll get a unique referral link. When someone signs up using your link and completes their first withdrawal, both you and your friend earn a bonus. Check your dashboard for your referral link and current reward amounts.",
  },
];

export default function FAQPage() {
  return (
    <>
      {/* Hero */}
      <section className="py-24 sm:py-32">
        <div className="mx-auto max-w-3xl px-4 text-center sm:px-6 lg:px-8">
          <h1 className="text-4xl font-bold tracking-tight text-foreground sm:text-5xl">
            Frequently asked{" "}
            <span className="text-primary">questions</span>
          </h1>
          <p className="mt-6 text-lg leading-relaxed text-muted-foreground">
            Everything you need to know about Frenz Pay. Can&apos;t find what
            you&apos;re looking for? Reach out to our support team.
          </p>
        </div>
      </section>

      {/* FAQ Accordion */}
      <section className="pb-24 sm:pb-32">
        <div className="mx-auto max-w-2xl px-4 sm:px-6 lg:px-8">
          <Accordion defaultValue={[]} className="w-full">
            {faqs.map((faq, i) => (
              <AccordionItem key={i} value={`item-${i}`}>
                <AccordionTrigger className="text-left text-base font-medium">
                  {faq.question}
                </AccordionTrigger>
                <AccordionContent className="text-sm leading-relaxed text-muted-foreground">
                  {faq.answer}
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </div>
      </section>

      {/* Still have questions */}
      <section className="border-t border-border bg-muted/30 py-24 sm:py-32">
        <div className="mx-auto max-w-3xl px-4 text-center sm:px-6 lg:px-8">
          <h2 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
            Still have questions?
          </h2>
          <p className="mt-4 text-lg text-muted-foreground">
            Our support team is happy to help. Reach out and we&apos;ll get
            back to you within 24 hours.
          </p>
          <div className="mt-10 flex flex-wrap justify-center gap-4">
            <Link
              href="/contact"
              className={cn(buttonVariants({ size: "lg" }), "h-12 px-8 text-base")}
            >
              Contact Support
            </Link>
            <a
              href="mailto:hello@frenz.ng"
              className={cn(buttonVariants({ variant: "outline", size: "lg" }), "h-12 px-8 text-base")}
            >
              Email Us
            </a>
          </div>
        </div>
      </section>
    </>
  );
}
