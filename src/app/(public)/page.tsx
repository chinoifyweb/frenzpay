"use client";

import {
  Wallet,
  ArrowUpRight,
  Percent,
  ShieldCheck,
  Activity,
  CreditCard,
  Globe,
  Zap,
  Star,
  MessageCircle,
  Smartphone,
  Check,
  Send,
  RefreshCcw,
} from "lucide-react";
import { cn } from "@/lib/utils";

const WHATSAPP_LINK = "https://wa.me/12365997663";

/* ──────────────────────────── DATA ──────────────────────────── */

const personas = [
  {
    icon: Globe,
    tag: "Freelancers",
    title: "Get paid by clients worldwide",
    description:
      "Share your USD, GBP, or EUR account details with clients on Upwork, Fiverr, Toptal, or anywhere. Receive payments like a local — then withdraw in USDT.",
  },
  {
    icon: Zap,
    tag: "Remote Workers",
    title: "Receive your salary seamlessly",
    description:
      "Give your employer your virtual account details. Get paid on time, every time — no more delays from international wire transfers or unfavorable bank rates.",
  },
  {
    icon: Star,
    tag: "Creators & Digital Nomads",
    title: "Monetize your content globally",
    description:
      "Receive AdSense, Stripe, PayPal, or platform payouts directly. Perfect for YouTubers, designers, developers, and anyone earning from digital platforms.",
  },
];

const features = [
  {
    icon: Wallet,
    title: "USD, GBP & EUR Accounts",
    description: "Dedicated virtual bank accounts with unique routing details for each currency.",
  },
  {
    icon: ArrowUpRight,
    title: "USDT Withdrawals",
    description: "Convert and withdraw to your USDT wallet on TRC-20 or ERC-20 in under 5 minutes.",
  },
  {
    icon: Percent,
    title: "Low, Transparent Fees",
    description: "Just 1.5% on withdrawals, 0.5% FX spread. Zero fees on deposits. No hidden charges.",
  },
  {
    icon: ShieldCheck,
    title: "Bank-Grade Security",
    description: "256-bit encryption, mandatory 2FA, full KYC verification, and real-time fraud monitoring.",
  },
  {
    icon: CreditCard,
    title: "Virtual Cards",
    description: "Coming soon — shop online globally with Frenz Pay virtual Visa and Mastercard cards.",
  },
  {
    icon: Activity,
    title: "Real-Time Dashboard",
    description: "Track balances, payments, and withdrawals in real-time with instant notifications.",
  },
  {
    icon: Send,
    title: "Multi-Currency Wallet",
    description: "Hold, convert, and manage USD, GBP, and EUR from a single powerful dashboard.",
  },
  {
    icon: RefreshCcw,
    title: "Instant Conversions",
    description: "Convert between currencies at competitive rates. No waiting periods, no surprises.",
  },
];

const steps = [
  {
    step: "01",
    title: "Download the App",
    description: "Get Frenz Pay from the App Store or Google Play. Sign up with your email in under 2 minutes.",
  },
  {
    step: "02",
    title: "Verify Your Identity",
    description: "Complete KYC with a valid ID and selfie. Most verifications are approved within 24 hours.",
  },
  {
    step: "03",
    title: "Get Your Accounts",
    description: "Instantly receive virtual USD, GBP, and EUR accounts with unique banking details.",
  },
  {
    step: "04",
    title: "Receive & Withdraw",
    description: "Share your details with payers, receive money, and withdraw in USDT whenever you want.",
  },
];

const stats = [
  { value: "$2M+", label: "Processed" },
  { value: "10,000+", label: "Users Worldwide" },
  { value: "3", label: "Currencies Supported" },
  { value: "< 5 min", label: "Average Withdrawal" },
];

const trustedPlatforms = [
  "Upwork",
  "Fiverr",
  "Toptal",
  "Remote.com",
  "Deel",
  "Payoneer",
  "YouTube",
  "Stripe",
];

const testimonials = [
  {
    name: "Tunde Bakare",
    role: "Freelance Developer, Lagos",
    quote: "Before Frenz Pay, I lost 8-10% on every payment just getting it to my Nigerian bank. Now I receive USD directly and withdraw in USDT. It's been a game-changer for my freelance income.",
  },
  {
    name: "Amara Osei",
    role: "Content Creator, Accra",
    quote: "I get paid from YouTube, Patreon, and clients in the US and UK. Frenz Pay gives me one place to receive everything. The USDT withdrawal is incredibly fast.",
  },
  {
    name: "Chidinma Eze",
    role: "Remote Product Designer, Abuja",
    quote: "My employer pays me through Frenz Pay now. No more waiting 3-5 days for wire transfers. The virtual accounts work exactly like a real US/UK bank account.",
  },
];

/* ──────────────────────────── COMPONENTS ──────────────────────────── */

function PhoneMockup({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={cn("relative mx-auto", className)}>
      {/* Glow behind phone */}
      <div className="absolute -inset-8 rounded-[3rem] bg-gradient-to-br from-primary/20 via-transparent to-accent/20 blur-3xl" />
      {/* Phone frame */}
      <div className="relative mx-auto w-[280px] rounded-[2.5rem] border-[8px] border-gray-900 bg-gray-900 shadow-2xl sm:w-[300px]">
        {/* Notch */}
        <div className="absolute left-1/2 top-0 z-10 h-6 w-28 -translate-x-1/2 rounded-b-2xl bg-gray-900" />
        {/* Screen */}
        <div className="relative overflow-hidden rounded-[2rem] bg-background">
          {children}
        </div>
      </div>
    </div>
  );
}

function AppStoreButtons({ size = "default" }: { size?: "default" | "large" }) {
  const h = size === "large" ? "h-14" : "h-11";
  const text = size === "large" ? "text-base" : "text-sm";
  const subtext = size === "large" ? "text-[11px]" : "text-[10px]";
  const icon = size === "large" ? "size-6" : "size-5";

  return (
    <div className="flex flex-wrap gap-3">
      <a
        href="#"
        className={cn("inline-flex items-center gap-2.5 rounded-xl bg-gray-900 px-5 text-white transition-all hover:bg-gray-800 hover:scale-[1.02]", h)}
      >
        <svg className={icon} viewBox="0 0 24 24" fill="currentColor">
          <path d="M17.05 20.28c-.98.95-2.05.8-3.08.35-1.09-.46-2.09-.48-3.24 0-1.44.62-2.2.44-3.06-.35C2.79 15.25 3.51 7.59 9.05 7.31c1.35.07 2.29.74 3.08.8 1.18-.24 2.31-.93 3.57-.84 1.51.12 2.65.72 3.4 1.8-3.12 1.87-2.38 5.98.48 7.13-.57 1.5-1.31 2.99-2.54 4.09zM12.03 7.25c-.15-2.23 1.66-4.07 3.74-4.25.29 2.58-2.34 4.5-3.74 4.25z"/>
        </svg>
        <div className="text-left">
          <div className={cn("leading-none opacity-70", subtext)}>Download on the</div>
          <div className={cn("font-semibold leading-tight", text)}>App Store</div>
        </div>
      </a>
      <a
        href="#"
        className={cn("inline-flex items-center gap-2.5 rounded-xl bg-gray-900 px-5 text-white transition-all hover:bg-gray-800 hover:scale-[1.02]", h)}
      >
        <svg className={icon} viewBox="0 0 24 24" fill="currentColor">
          <path d="M3.609 1.814L13.792 12 3.61 22.186a.996.996 0 01-.61-.92V2.734a1 1 0 01.609-.92zm10.89 10.893l2.302 2.302-10.937 6.333 8.635-8.635zm3.199-3.199l2.302 2.302a1 1 0 010 1.38l-2.302 2.302L15.395 13l2.303-2.492zM5.864 2.658L16.8 8.99l-2.302 2.302-8.634-8.634z"/>
        </svg>
        <div className="text-left">
          <div className={cn("leading-none opacity-70", subtext)}>Get it on</div>
          <div className={cn("font-semibold leading-tight", text)}>Google Play</div>
        </div>
      </a>
    </div>
  );
}

/* ──────────────────────────── PAGE ──────────────────────────── */

export default function HomePage() {
  return (
    <>
      {/* ═══════════════ HERO ═══════════════ */}
      <section className="relative overflow-hidden">
        <div className="pointer-events-none absolute inset-0 -z-10">
          <div className="absolute -top-40 right-0 h-[600px] w-[600px] rounded-full bg-primary/5 blur-3xl" />
          <div className="absolute -bottom-20 left-0 h-[400px] w-[400px] rounded-full bg-accent/5 blur-3xl" />
        </div>

        <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 sm:py-16 lg:px-8 lg:py-20">
          <div className="grid items-center gap-12 lg:grid-cols-2 lg:gap-16">
            {/* Text */}
            <div>
              <div className="inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/10 px-4 py-1.5 text-sm font-medium text-primary">
                <Smartphone className="size-4" />
                Available on iOS & Android
              </div>
              <h1 className="mt-4 text-4xl font-bold leading-[1.1] tracking-tight text-foreground sm:text-5xl lg:text-6xl">
                Your Money, Finally{" "}
                <span className="text-primary">Without Borders</span>
              </h1>
              <p className="mt-6 max-w-lg text-lg leading-relaxed text-muted-foreground">
                Open USD, GBP, and EUR virtual accounts in minutes. Receive
                payments from anywhere in the world. Withdraw in USDT instantly.
              </p>

              <div className="mt-8">
                <AppStoreButtons size="large" />
              </div>

              <div className="mt-6">
                <a
                  href={WHATSAPP_LINK}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 text-sm font-medium text-muted-foreground transition-colors hover:text-green-600"
                >
                  <MessageCircle className="size-4" />
                  Chat with us on WhatsApp
                </a>
              </div>
            </div>

            {/* Phone Mockup */}
            <PhoneMockup className="lg:ml-auto">
              <div className="px-5 pb-8 pt-10">
                {/* Status bar */}
                <div className="flex items-center justify-between px-1 text-xs text-muted-foreground">
                  <span>9:41</span>
                  <div className="flex items-center gap-1">
                    <div className="h-2.5 w-4 rounded-sm border border-current p-px"><div className="h-full w-2/3 rounded-sm bg-current" /></div>
                  </div>
                </div>

                {/* App Header */}
                <div className="mt-4 flex items-center justify-between">
                  <div>
                    <p className="text-xs text-muted-foreground">Good morning</p>
                    <p className="text-base font-semibold text-foreground">Adebayo O.</p>
                  </div>
                  <div className="flex size-9 items-center justify-center rounded-full bg-primary text-sm font-bold text-primary-foreground">A</div>
                </div>

                {/* Balance Card */}
                <div className="mt-5 rounded-2xl bg-gradient-to-br from-gray-900 to-gray-800 p-5 text-white">
                  <p className="text-xs font-medium opacity-70">Total Balance</p>
                  <p className="mt-1 text-3xl font-bold">$9,351.25</p>
                  <div className="mt-4 flex gap-3">
                    <span className="flex-1 rounded-xl bg-white/20 py-2 text-center text-xs font-medium backdrop-blur">
                      + Add Money
                    </span>
                    <span className="flex-1 rounded-xl bg-primary py-2 text-center text-xs font-medium">
                      Withdraw USDT
                    </span>
                  </div>
                </div>

                {/* Currency Cards */}
                <div className="mt-4 space-y-2.5">
                  {[
                    { flag: "\u{1F1FA}\u{1F1F8}", currency: "USD", amount: "$4,280.50", sub: "ACH \u00B7 Wire \u00B7 SWIFT" },
                    { flag: "\u{1F1EC}\u{1F1E7}", currency: "GBP", amount: "\u00A31,920.00", sub: "Faster Payments \u00B7 BACS" },
                    { flag: "\u{1F1EA}\u{1F1FA}", currency: "EUR", amount: "\u20AC3,150.75", sub: "SEPA \u00B7 SWIFT" },
                  ].map((acc) => (
                    <div key={acc.currency} className="flex items-center justify-between rounded-xl border border-border bg-card p-3.5">
                      <div className="flex items-center gap-3">
                        <span className="text-xl">{acc.flag}</span>
                        <div>
                          <p className="text-sm font-semibold text-foreground">{acc.currency} Account</p>
                          <p className="text-[11px] text-muted-foreground">{acc.sub}</p>
                        </div>
                      </div>
                      <p className="text-sm font-bold text-foreground">{acc.amount}</p>
                    </div>
                  ))}
                </div>

                {/* Recent Transaction */}
                <div className="mt-4">
                  <p className="text-xs font-semibold text-muted-foreground">Recent</p>
                  <div className="mt-2 flex items-center justify-between rounded-xl border border-border bg-card p-3">
                    <div className="flex items-center gap-3">
                      <div className="flex size-8 items-center justify-center rounded-lg bg-green-100 text-green-600">
                        <ArrowUpRight className="size-4 rotate-180" />
                      </div>
                      <div>
                        <p className="text-xs font-semibold text-foreground">Upwork Payment</p>
                        <p className="text-[10px] text-muted-foreground">2 hours ago</p>
                      </div>
                    </div>
                    <p className="text-xs font-bold text-green-600">+$1,250.00</p>
                  </div>
                </div>
              </div>
            </PhoneMockup>
          </div>
        </div>
      </section>

      {/* ═══════════════ TRUSTED BY ═══════════════ */}
      <section className="border-y border-border/50 bg-muted/30 py-8">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <p className="text-center text-sm font-medium text-muted-foreground">
            Trusted by over <span className="font-bold text-foreground">10,000+</span> freelancers, remote workers, and creators on
          </p>
          <div className="mt-6 flex flex-wrap items-center justify-center gap-x-10 gap-y-3">
            {trustedPlatforms.map((name) => (
              <span
                key={name}
                className="text-base font-semibold text-muted-foreground/40 transition-colors hover:text-muted-foreground/70"
              >
                {name}
              </span>
            ))}
          </div>
        </div>
      </section>

      {/* ═══════════════ WHO IT'S FOR — PERSONAS ═══════════════ */}
      <section className="py-16 sm:py-20">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-2xl text-center">
            <h2 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
              Built for people who earn globally
            </h2>
            <p className="mt-4 text-lg text-muted-foreground">
              Whether you freelance, work remotely, or create content — Frenz Pay is designed for you.
            </p>
          </div>

          <div className="mt-10 grid gap-8 md:grid-cols-3">
            {personas.map((persona) => (
              <div
                key={persona.tag}
                className="group relative overflow-hidden rounded-2xl border border-border bg-card p-8 transition-all hover:border-primary/30 hover:shadow-xl"
              >
                <div className="flex size-12 items-center justify-center rounded-xl bg-primary/10 text-primary transition-colors group-hover:bg-primary group-hover:text-primary-foreground">
                  <persona.icon className="size-6" />
                </div>
                <span className="mt-4 inline-block rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold text-primary">
                  {persona.tag}
                </span>
                <h3 className="mt-3 text-xl font-semibold text-foreground">
                  {persona.title}
                </h3>
                <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
                  {persona.description}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ═══════════════ FEATURES GRID ═══════════════ */}
      <section className="bg-muted/30 py-16 sm:py-20">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-2xl text-center">
            <h2 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
              Everything you need, nothing you don&apos;t
            </h2>
            <p className="mt-4 text-lg text-muted-foreground">
              Powerful features designed for the modern remote worker.
            </p>
          </div>

          <div className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {features.map((feature) => (
              <div
                key={feature.title}
                className="group rounded-2xl border border-border bg-card p-6 transition-all hover:border-primary/30 hover:shadow-lg"
              >
                <div className="flex size-11 items-center justify-center rounded-xl bg-primary/10 text-primary transition-colors group-hover:bg-primary group-hover:text-primary-foreground">
                  <feature.icon className="size-5" />
                </div>
                <h3 className="mt-4 text-base font-semibold text-foreground">
                  {feature.title}
                </h3>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                  {feature.description}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ═══════════════ HOW IT WORKS — WITH PHONE ═══════════════ */}
      <section className="py-16 sm:py-20">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="grid items-center gap-16 lg:grid-cols-2">
            {/* Phone showing withdrawal flow */}
            <PhoneMockup>
              <div className="px-5 pb-8 pt-10">
                <div className="flex items-center justify-between px-1 text-xs text-muted-foreground">
                  <span>9:41</span>
                  <div className="flex items-center gap-1">
                    <div className="h-2.5 w-4 rounded-sm border border-current p-px"><div className="h-full w-2/3 rounded-sm bg-current" /></div>
                  </div>
                </div>

                <div className="mt-4">
                  <p className="text-base font-semibold text-foreground">Withdraw to USDT</p>
                  <p className="text-xs text-muted-foreground">Convert and send to your wallet</p>
                </div>

                {/* Amount Input */}
                <div className="mt-5 rounded-2xl border border-border bg-muted/30 p-5 text-center">
                  <p className="text-xs text-muted-foreground">You send</p>
                  <p className="mt-1 text-4xl font-bold text-foreground">$2,500.00</p>
                  <p className="mt-1 text-xs text-muted-foreground">from USD Account</p>
                </div>

                <div className="my-3 flex justify-center">
                  <div className="flex size-8 items-center justify-center rounded-full bg-primary text-primary-foreground">
                    <ArrowUpRight className="size-4" />
                  </div>
                </div>

                <div className="rounded-2xl border border-primary/30 bg-primary/5 p-5 text-center">
                  <p className="text-xs text-primary">You receive</p>
                  <p className="mt-1 text-3xl font-bold text-foreground">2,450.75 USDT</p>
                  <p className="mt-1 text-xs text-muted-foreground">TRC-20 Network</p>
                </div>

                {/* Fee breakdown */}
                <div className="mt-4 space-y-2 rounded-xl border border-border bg-card p-4">
                  {[
                    { label: "Exchange Rate", value: "1 USD = 0.998 USDT" },
                    { label: "FX Spread (0.5%)", value: "-$12.50" },
                    { label: "Withdrawal Fee (1.5%)", value: "-$36.75" },
                    { label: "Network Fee", value: "-$1.00" },
                  ].map((row) => (
                    <div key={row.label} className="flex justify-between text-xs">
                      <span className="text-muted-foreground">{row.label}</span>
                      <span className="font-medium text-foreground">{row.value}</span>
                    </div>
                  ))}
                </div>

                <span className="mt-4 block w-full rounded-xl bg-primary py-3.5 text-center text-sm font-semibold text-primary-foreground">
                  Confirm Withdrawal
                </span>
              </div>
            </PhoneMockup>

            {/* Steps */}
            <div>
              <h2 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
                Get started in 4 simple steps
              </h2>
              <p className="mt-4 text-lg text-muted-foreground">
                From download to your first withdrawal — it takes less than a day.
              </p>

              <div className="mt-10 space-y-8">
                {steps.map((step) => (
                  <div key={step.step} className="flex gap-5">
                    <div className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-lg font-bold text-primary">
                      {step.step}
                    </div>
                    <div>
                      <h3 className="text-lg font-semibold text-foreground">
                        {step.title}
                      </h3>
                      <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
                        {step.description}
                      </p>
                    </div>
                  </div>
                ))}
              </div>

              <div className="mt-10">
                <AppStoreButtons />
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ═══════════════ STATS ═══════════════ */}
      <section className="border-y border-border/50 bg-secondary py-12 text-secondary-foreground sm:py-16">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-2 gap-8 md:grid-cols-4">
            {stats.map((stat) => (
              <div key={stat.label} className="text-center">
                <p className="text-4xl font-bold text-primary sm:text-5xl">
                  {stat.value}
                </p>
                <p className="mt-2 text-sm font-medium text-secondary-foreground/70">
                  {stat.label}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ═══════════════ TESTIMONIALS ═══════════════ */}
      <section className="py-16 sm:py-20">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-2xl text-center">
            <h2 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
              Loved by thousands across Africa
            </h2>
            <p className="mt-4 text-lg text-muted-foreground">
              Here&apos;s what our users have to say about their experience.
            </p>
          </div>

          <div className="mt-10 grid gap-8 md:grid-cols-3">
            {testimonials.map((t) => (
              <div
                key={t.name}
                className="rounded-2xl border border-border bg-card p-8"
              >
                <div className="flex gap-1">
                  {[1, 2, 3, 4, 5].map((i) => (
                    <Star key={i} className="size-4 fill-yellow-400 text-yellow-400" />
                  ))}
                </div>
                <p className="mt-4 text-sm leading-relaxed text-muted-foreground">
                  &ldquo;{t.quote}&rdquo;
                </p>
                <div className="mt-6 flex items-center gap-3">
                  <div className="flex size-10 items-center justify-center rounded-full bg-primary/10 text-sm font-bold text-primary">
                    {t.name.split(" ").map((n) => n[0]).join("")}
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-foreground">{t.name}</p>
                    <p className="text-xs text-muted-foreground">{t.role}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ═══════════════ SECURITY BADGES ═══════════════ */}
      <section className="bg-muted/30 py-12 sm:py-16">
        <div className="mx-auto max-w-4xl px-4 text-center sm:px-6 lg:px-8">
          <h2 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
            Your security is our priority
          </h2>
          <div className="mt-10 grid grid-cols-2 gap-6 sm:grid-cols-4">
            {[
              { icon: ShieldCheck, label: "256-bit AES Encryption" },
              { icon: Activity, label: "Real-Time Monitoring" },
              { label: "Two-Factor Auth (2FA)", icon: Smartphone },
              { label: "KYC Verified", icon: Check },
            ].map((badge) => (
              <div key={badge.label} className="flex flex-col items-center gap-3">
                <div className="flex size-14 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                  <badge.icon className="size-7" />
                </div>
                <p className="text-sm font-medium text-muted-foreground">{badge.label}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ═══════════════ DOWNLOAD CTA ═══════════════ */}
      <section id="download" className="relative overflow-hidden py-16 sm:py-20">
        <div className="pointer-events-none absolute inset-0 -z-10 bg-gradient-to-br from-primary/5 via-transparent to-accent/5" />
        <div className="mx-auto max-w-3xl px-4 text-center sm:px-6 lg:px-8">
          <h2 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
            Ready to get paid globally?
          </h2>
          <p className="mt-4 text-lg text-muted-foreground">
            Download Frenz Pay and start receiving international payments in minutes. Available on iOS and Android.
          </p>

          <div className="mt-10 flex justify-center">
            <AppStoreButtons size="large" />
          </div>

          <div className="mt-6">
            <a
              href={WHATSAPP_LINK}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 text-sm font-medium text-muted-foreground transition-colors hover:text-green-600"
            >
              <MessageCircle className="size-4" />
              Have questions? Chat with us on WhatsApp
            </a>
          </div>
        </div>
      </section>
    </>
  );
}
