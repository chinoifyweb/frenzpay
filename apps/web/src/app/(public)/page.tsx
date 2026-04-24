"use client";

import Image from "next/image";
import Link from "next/link";
import {
  Wallet, ArrowUpRight, Percent, ShieldCheck, Activity,
  CreditCard, Globe, Zap, Star, MessageCircle, Smartphone,
  Send, RefreshCcw, ArrowRight, BadgeCheck, Lock,
  Building2, Bitcoin, UserPlus, LogIn,
} from "lucide-react";

const WHATSAPP_LINK = "https://wa.me/12365997663";

/* ── Platform logos — real images via Clearbit ───────────── */
const platforms = [
  { name: "Upwork",       domain: "upwork.com" },
  { name: "Fiverr",       domain: "fiverr.com" },
  { name: "Amazon",       domain: "amazon.com" },
  { name: "Toptal",       domain: "toptal.com" },
  { name: "Freelancer",   domain: "freelancer.com" },
  { name: "Remote",       domain: "remote.com" },
  { name: "Deel",         domain: "deel.com" },
  { name: "PayPal",       domain: "paypal.com" },
  { name: "Stripe",       domain: "stripe.com" },
  { name: "YouTube",      domain: "youtube.com" },
  { name: "Payoneer",     domain: "payoneer.com" },
  { name: "PeoplePerHour",domain: "peopleperhour.com" },
];

const withdrawMethods = [
  {
    icon: Bitcoin,
    label: "USDT (Crypto)",
    sub: "TRC-20 or ERC-20 network",
    color: "from-amber-500 to-orange-500",
    badge: "< 5 min",
  },
  {
    icon: Building2,
    label: "Naira Account",
    sub: "Any Nigerian bank account",
    color: "from-green-500 to-emerald-600",
    badge: "Same day",
  },
];

const personas = [
  {
    icon: Globe, tag: "Freelancers",
    title: "Get paid from any platform",
    description: "Share your USD, GBP, or EUR account with clients on Upwork, Fiverr, Amazon, Toptal, or anywhere. Receive payments like a local.",
  },
  {
    icon: Zap, tag: "Remote Workers",
    title: "Receive your salary on time",
    description: "Give your employer your virtual account details. No more delays from international wire transfers or bad exchange rates.",
  },
  {
    icon: Star, tag: "Creators & Nomads",
    title: "Monetize your content globally",
    description: "Receive YouTube AdSense, Stripe, PayPal, or platform payouts directly. Withdraw in USDT or straight to your Naira account.",
  },
];

const features = [
  { icon: Wallet,     title: "USD, GBP & EUR Accounts",  description: "Dedicated virtual bank accounts with real routing numbers, IBAN, and sort codes." },
  { icon: Bitcoin,    title: "USDT Withdrawals",          description: "Convert and withdraw to your USDT wallet on TRC-20 or ERC-20 in under 5 minutes." },
  { icon: Building2,  title: "Naira Withdrawals",         description: "Withdraw directly to any Nigerian bank account. Funds settle same day." },
  { icon: Percent,    title: "Low, Transparent Fees",     description: "1.5% on withdrawals, 0.5% FX spread. Zero fees on deposits. No hidden charges." },
  { icon: ShieldCheck,title: "Bank-Grade Security",       description: "256-bit AES encryption, mandatory 2FA, full KYC, and real-time fraud monitoring." },
  { icon: CreditCard, title: "Virtual Cards (Coming Soon)",description: "Shop online globally with Frenz Pay virtual Visa and Mastercard cards." },
  { icon: Activity,   title: "Real-Time Dashboard",       description: "Track balances, payments, and withdrawals with instant push notifications." },
  { icon: RefreshCcw, title: "Instant Conversions",       description: "Convert between USD, GBP, EUR, USDT, and NGN at competitive rates — instantly." },
];

const steps = [
  { step: "01", title: "Create your account",   description: "Sign up in under 2 minutes \u2014 email + phone, no app required." },
  { step: "02", title: "Verify Your Identity",  description: "Complete KYC with a valid ID and selfie. Most approvals within 24 hours." },
  { step: "03", title: "Get Your Accounts",     description: "Receive virtual USD and EUR accounts with unique banking details ready to share." },
  { step: "04", title: "Receive & Withdraw",    description: "Share details with payers, receive money, then withdraw in USDC or Naira \u2014 your choice." },
];

const stats = [
  { value: "$2M+",    label: "Processed" },
  { value: "10,000+", label: "Active Users" },
  { value: "3",       label: "Currencies" },
  { value: "< 5 min", label: "Avg Withdrawal" },
];

const testimonials = [
  {
    initials: "TB", name: "Tunde Bakare", role: "Freelance Developer · Lagos",
    quote: "Before Frenz Pay, I lost 8–10% on every Upwork payment. Now I receive USD directly and withdraw either in USDT or straight to my Zenith account. Game changer.",
  },
  {
    initials: "AO", name: "Amara Osei", role: "Content Creator · Accra",
    quote: "I get paid from YouTube and clients in the US. Frenz Pay gives me one place to receive everything. The Naira withdrawal option is perfect for local bills.",
  },
  {
    initials: "CE", name: "Chidinma Eze", role: "Remote Product Designer · Abuja",
    quote: "My employer pays me through Frenz Pay. I pick USDT when saving and Naira when I need to spend locally. No bank delays, no bad rates.",
  },
];

/* ── Sub-components ─────────────────────────────────────── */

function PhoneMockup({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative mx-auto w-[268px] sm:w-[285px]">
      <div className="absolute -inset-4 rounded-[3rem] bg-white/20 blur-3xl" />
      <div className="relative rounded-[2.5rem] border-[7px] border-slate-900 bg-slate-900 shadow-2xl shadow-black/40">
        <div className="absolute left-1/2 top-0 z-10 h-6 w-24 -translate-x-1/2 rounded-b-2xl bg-slate-900" />
        <div className="relative overflow-hidden rounded-[2rem] bg-[#0f172a]">
          {children}
        </div>
      </div>
    </div>
  );
}

function AppBadges({ size = "md" }: { size?: "md" | "lg" }) {
  const h = size === "lg" ? "h-13 px-6" : "h-11 px-5";
  const textSize = size === "lg" ? "text-[15px]" : "text-sm";
  return (
    <div className="flex flex-wrap gap-3">
      {/* Primary CTA — create account */}
      <Link
        href="/signup"
        className={`inline-flex items-center gap-2 rounded-xl bg-white hover:bg-white/90 text-slate-900 font-semibold transition-all hover:scale-[1.02] shadow-lg ${h} ${textSize}`}
      >
        <UserPlus className="w-4 h-4" />
        Create free account
        <ArrowRight className="w-4 h-4" />
      </Link>
      {/* Secondary — log in */}
      <Link
        href="/login"
        className={`inline-flex items-center gap-2 rounded-xl bg-white/10 hover:bg-white/20 text-white font-semibold border border-white/20 transition-all hover:scale-[1.02] ${h} ${textSize}`}
      >
        <LogIn className="w-4 h-4" />
        Log in
      </Link>
    </div>
  );
}

/* ── Page ────────────────────────────────────────────────── */

export default function HomePage() {
  return (
    <>
      {/* ═══ HERO ════════════════════════════════════════════ */}
      <section className="relative overflow-hidden min-h-screen flex items-center" style={{ background: "linear-gradient(160deg, #3b82f6 0%, #2563eb 50%, #1d4ed8 100%)" }}>
        {/* Orbs */}
        <div className="absolute inset-0 pointer-events-none overflow-hidden">
          <div className="absolute -top-32 -right-32 w-[600px] h-[600px] rounded-full opacity-15" style={{ background: "radial-gradient(circle, rgba(255,255,255,0.5), transparent 70%)" }} />
          <div className="absolute -bottom-32 -left-32 w-[500px] h-[500px] rounded-full opacity-10" style={{ background: "radial-gradient(circle, #93c5fd, transparent 70%)" }} />
          {/* Dots grid */}
          <div className="absolute inset-0 opacity-[0.08]" style={{ backgroundImage: "radial-gradient(circle, rgba(255,255,255,0.6) 1px, transparent 1px)", backgroundSize: "40px 40px" }} />
        </div>

        <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-28 lg:py-20 w-full">
          <div className="grid lg:grid-cols-2 gap-14 items-center">

            {/* Left */}
            <div>
              <div className="inline-flex items-center gap-2 rounded-full border border-white/30 bg-white/15 px-4 py-1.5 text-sm font-medium text-white mb-6">
                <Smartphone className="w-4 h-4" />
                Available on iOS &amp; Android
              </div>

              <h1 className="text-4xl sm:text-5xl lg:text-[3.4rem] font-extrabold leading-[1.08] tracking-tight text-white">
                Get Paid{" "}
                <span style={{ background: "linear-gradient(135deg,#93c5fd,#60a5fa)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", backgroundClip: "text" }}>
                  Globally.
                </span>
                <br />
                Withdraw in{" "}
                <span style={{ background: "linear-gradient(135deg,#34d399,#10b981)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", backgroundClip: "text" }}>
                  USDT or Naira.
                </span>
              </h1>

              <p className="mt-6 text-lg text-white/80 leading-relaxed max-w-lg">
                Open USD, GBP, and EUR virtual accounts in minutes. Receive payments from Upwork, Amazon, Fiverr, YouTube, and any platform worldwide — then withdraw in USDT or directly to your Nigerian bank account.
              </p>

              {/* Withdraw options chips */}
              <div className="mt-5 flex flex-wrap gap-3">
                {withdrawMethods.map((m) => (
                  <div key={m.label} className="flex items-center gap-2 rounded-xl bg-white/8 border border-white/12 px-3.5 py-2">
                    <div className={`w-7 h-7 rounded-lg bg-gradient-to-br ${m.color} flex items-center justify-center`}>
                      <m.icon className="w-3.5 h-3.5 text-white" />
                    </div>
                    <div>
                      <p className="text-xs font-semibold text-white leading-tight">{m.label}</p>
                      <p className="text-[10px] text-white/60 leading-none mt-0.5">{m.badge}</p>
                    </div>
                  </div>
                ))}
              </div>

              <div className="mt-8"><AppBadges size="lg" /></div>

              <div className="mt-5 flex flex-wrap items-center gap-4">
                <a href={WHATSAPP_LINK} target="_blank" rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 text-sm font-medium text-white/70 hover:text-white transition-colors">
                  <MessageCircle className="w-4 h-4" />
                  Chat with us on WhatsApp
                </a>
                <span className="text-white/30">•</span>
                <a href="/features" className="inline-flex items-center gap-1 text-sm font-medium text-white/70 hover:text-white transition-colors">
                  See all features <ArrowRight className="w-4 h-4" />
                </a>
              </div>

              {/* Trust badges */}
              <div className="mt-8 flex flex-wrap gap-3">
                {[
                  { icon: ShieldCheck, label: "256-bit Encryption" },
                  { icon: BadgeCheck, label: "KYC Verified" },
                  { icon: Lock, label: "2FA Protected" },
                ].map(({ icon: Icon, label }) => (
                  <div key={label} className="flex items-center gap-2 rounded-full bg-white/5 border border-white/10 px-3 py-1.5">
                    <Icon className="w-3.5 h-3.5 text-white/80" />
                    <span className="text-xs text-white/70">{label}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Right — Phone */}
            <div className="flex justify-center lg:justify-end">
              <PhoneMockup>
                <div className="px-5 pb-8 pt-10">
                  {/* Status bar */}
                  <div className="flex items-center justify-between text-[11px] text-gray-500 px-1">
                    <span>9:41</span>
                    <div className="w-4 h-2.5 rounded-sm border border-gray-600 p-px"><div className="h-full w-2/3 rounded-sm bg-white" /></div>
                  </div>

                  <div className="mt-4 flex items-center justify-between">
                    <div>
                      <p className="text-[11px] text-gray-500">Good morning</p>
                      <p className="text-sm font-bold text-white">Adebayo O.</p>
                    </div>
                    <div className="w-9 h-9 rounded-full flex items-center justify-center text-xs font-bold text-white" style={{ background: "#2563eb" }}>AO</div>
                  </div>

                  {/* Balance */}
                  <div className="mt-4 rounded-2xl p-4" style={{ background: "#2563eb" }}>
                    <p className="text-[11px] text-blue-200/70">Total Balance</p>
                    <p className="text-2xl font-black text-white mt-0.5">$9,351.25</p>
                    <div className="mt-3 flex gap-2">
                      <span className="flex-1 rounded-xl bg-white/20 py-1.5 text-center text-[11px] font-medium text-white">+ Deposit</span>
                      <span className="flex-1 rounded-xl bg-white py-1.5 text-center text-[11px] font-bold text-blue-600">Withdraw</span>
                    </div>
                  </div>

                  {/* Accounts */}
                  <div className="mt-3 space-y-1.5">
                    {[
                      { flag: "🇺🇸", cur: "USD", amt: "$4,280.50", sub: "ACH · Wire · SWIFT" },
                      { flag: "🇬🇧", cur: "GBP", amt: "£1,920.00", sub: "Faster Payments" },
                      { flag: "🇪🇺", cur: "EUR", amt: "€3,150.75", sub: "SEPA · SWIFT" },
                    ].map((a) => (
                      <div key={a.cur} className="flex items-center justify-between rounded-xl border border-white/8 bg-white/5 p-2.5">
                        <div className="flex items-center gap-2">
                          <span className="text-base">{a.flag}</span>
                          <div>
                            <p className="text-[11px] font-bold text-white">{a.cur}</p>
                            <p className="text-[10px] text-gray-500">{a.sub}</p>
                          </div>
                        </div>
                        <p className="text-[11px] font-bold text-white">{a.amt}</p>
                      </div>
                    ))}
                  </div>

                  {/* Withdraw options */}
                  <div className="mt-3">
                    <p className="text-[10px] text-gray-500 mb-1.5">Withdraw to</p>
                    <div className="grid grid-cols-2 gap-1.5">
                      <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-2 text-center">
                        <Bitcoin className="w-4 h-4 text-amber-400 mx-auto" />
                        <p className="text-[10px] font-bold text-white mt-1">USDT</p>
                        <p className="text-[9px] text-gray-500">TRC-20</p>
                      </div>
                      <div className="rounded-xl border border-green-500/30 bg-green-500/10 p-2 text-center">
                        <Building2 className="w-4 h-4 text-green-400 mx-auto" />
                        <p className="text-[10px] font-bold text-white mt-1">Naira</p>
                        <p className="text-[9px] text-gray-500">Any bank</p>
                      </div>
                    </div>
                  </div>

                  {/* Recent tx */}
                  <div className="mt-3 flex items-center justify-between rounded-xl border border-white/8 bg-white/5 p-2.5">
                    <div className="flex items-center gap-2">
                      <div className="w-7 h-7 rounded-lg bg-green-500/20 flex items-center justify-center">
                        <ArrowUpRight className="w-3.5 h-3.5 text-green-400 rotate-180" />
                      </div>
                      <div>
                        <p className="text-[11px] font-semibold text-white">Upwork Payment</p>
                        <p className="text-[10px] text-gray-500">2 hours ago</p>
                      </div>
                    </div>
                    <p className="text-[11px] font-bold text-green-400">+$1,250.00</p>
                  </div>
                </div>
              </PhoneMockup>
            </div>
          </div>
        </div>
      </section>

      {/* ═══ PLATFORMS — real logos ═══════════════════════════ */}
      <section className="py-10 bg-white dark:bg-[#0c1526] border-b border-gray-100 dark:border-white/5">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <p className="text-center text-sm font-medium text-gray-400 mb-8">
            Receive payments from <span className="font-semibold text-gray-700 dark:text-gray-200">50+ global platforms</span> including
          </p>
          <div className="flex flex-wrap justify-center items-center gap-4">
            {platforms.map((p) => (
              <div key={p.name} className="flex items-center gap-2.5 rounded-xl border border-gray-150 dark:border-white/8 bg-gray-50 dark:bg-white/4 px-4 py-2.5 shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all">
                <div className="relative w-6 h-6 flex-shrink-0">
                  <Image
                    src={`https://logo.clearbit.com/${p.domain}`}
                    alt={p.name}
                    width={24}
                    height={24}
                    className="rounded-md object-contain"
                    onError={(e) => {
                      (e.target as HTMLImageElement).style.display = "none";
                    }}
                  />
                </div>
                <span className="text-sm font-semibold text-gray-700 dark:text-gray-300">{p.name}</span>
              </div>
            ))}
            <div className="rounded-xl border border-dashed border-gray-300 dark:border-white/15 px-4 py-2.5">
              <span className="text-sm font-medium text-gray-400">+ 40 more</span>
            </div>
          </div>
        </div>
      </section>

      {/* ═══ WITHDRAW OPTIONS ════════════════════════════════ */}
      <section className="py-20 bg-white dark:bg-[#0c1526]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="max-w-2xl mx-auto text-center mb-12">
            <span className="inline-block rounded-full bg-blue-50 dark:bg-blue-500/10 px-4 py-1.5 text-sm font-semibold text-blue-600 dark:text-blue-400 mb-4">Withdrawals</span>
            <h2 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-gray-900 dark:text-white">
              Withdraw your way
            </h2>
            <p className="mt-4 text-lg text-gray-500 dark:text-gray-400">
              You choose — send to your crypto wallet in USDT or straight to your Nigerian bank account. Both are fast, both are affordable.
            </p>
          </div>

          <div className="grid md:grid-cols-2 gap-6 max-w-3xl mx-auto">
            {/* USDT */}
            <div className="rounded-2xl border border-amber-200 dark:border-amber-500/20 bg-amber-50 dark:bg-amber-500/5 p-8">
              <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center shadow-lg shadow-amber-500/30 mb-5">
                <Bitcoin className="w-7 h-7 text-white" />
              </div>
              <h3 className="text-xl font-bold text-gray-900 dark:text-white">Withdraw to USDT</h3>
              <p className="mt-2 text-sm text-gray-500 dark:text-gray-400 leading-relaxed">Perfect for saving in stable crypto or sending abroad. Supports TRC-20 (Tron) and ERC-20 (Ethereum) networks.</p>
              <ul className="mt-5 space-y-2">
                {["Arrives in under 5 minutes", "TRC-20 & ERC-20 networks", "1.5% fee only", "Protects against devaluation"].map((f) => (
                  <li key={f} className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
                    <div className="w-4 h-4 rounded-full bg-amber-400 flex items-center justify-center flex-shrink-0">
                      <svg className="w-2.5 h-2.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
                    </div>
                    {f}
                  </li>
                ))}
              </ul>
            </div>

            {/* Naira */}
            <div className="rounded-2xl border border-green-200 dark:border-green-500/20 bg-green-50 dark:bg-green-500/5 p-8">
              <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-green-500 to-emerald-600 flex items-center justify-center shadow-lg shadow-green-500/30 mb-5">
                <Building2 className="w-7 h-7 text-white" />
              </div>
              <h3 className="text-xl font-bold text-gray-900 dark:text-white">Withdraw to Naira</h3>
              <p className="mt-2 text-sm text-gray-500 dark:text-gray-400 leading-relaxed">Send directly to any Nigerian bank account — GTBank, Access, Zenith, First Bank, UBA, and more. Perfect for everyday expenses.</p>
              <ul className="mt-5 space-y-2">
                {["Any Nigerian bank account", "Same-day settlement", "Competitive NGN rates", "No extra bank charges"].map((f) => (
                  <li key={f} className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
                    <div className="w-4 h-4 rounded-full bg-green-500 flex items-center justify-center flex-shrink-0">
                      <svg className="w-2.5 h-2.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
                    </div>
                    {f}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* ═══ PRODUCT DESCRIPTION ═════════════════════════════ */}
      <section className="py-20 bg-gray-50 dark:bg-[#0a1020]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="max-w-3xl mx-auto text-center">
            <span className="inline-block rounded-full bg-blue-50 dark:bg-blue-500/10 px-4 py-1.5 text-sm font-semibold text-blue-600 dark:text-blue-400 mb-4">What is Frenz Pay?</span>
            <h2 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-gray-900 dark:text-white leading-tight">
              Your financial bridge between global platforms and your wallet
            </h2>
            <p className="mt-5 text-lg text-gray-500 dark:text-gray-400 leading-relaxed">
              Frenz Pay gives you real virtual bank accounts in USD, GBP, and EUR — the same kind used by professionals in the US and UK. Share your details with any platform or employer. They pay in fiat. You withdraw in USDT or Naira, your choice.
            </p>
          </div>

          <div className="mt-14 grid md:grid-cols-3 gap-6">
            {[
              {
                icon: Wallet, color: "bg-blue-50 dark:bg-blue-500/10 text-blue-600 dark:text-blue-400",
                title: "Real Bank-Level Accounts",
                body: "USD account includes US routing number and account number. GBP includes UK sort code. EUR includes IBAN. These work on ACH, Faster Payments, SEPA, and SWIFT — accepted by any platform.",
              },
              {
                icon: ArrowUpRight, color: "bg-blue-50 dark:bg-blue-500/10 text-blue-600 dark:text-blue-400",
                title: "Two Withdrawal Options",
                body: "Withdraw in USDT (crypto) for saving and cross-border transfers, or directly to your Nigerian Naira bank account for local spending. You choose every time — no lock-in.",
              },
              {
                icon: ShieldCheck, color: "bg-green-50 dark:bg-green-500/10 text-green-600 dark:text-green-400",
                title: "Fully Compliant & Secure",
                body: "Every user completes KYC verification. We operate with full AML/CFT compliance, 256-bit encryption, mandatory 2FA, and real-time transaction monitoring.",
              },
            ].map((item) => (
              <div key={item.title} className="rounded-2xl border border-gray-100 dark:border-white/8 bg-white dark:bg-white/3 p-8 hover:shadow-lg transition-all">
                <div className={`w-12 h-12 rounded-xl ${item.color} flex items-center justify-center mb-5`}>
                  <item.icon className="w-6 h-6" />
                </div>
                <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-3">{item.title}</h3>
                <p className="text-sm text-gray-500 dark:text-gray-400 leading-relaxed">{item.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ═══ WHO IT'S FOR ════════════════════════════════════ */}
      <section className="py-20 bg-white dark:bg-[#0c1526]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="max-w-2xl mx-auto text-center mb-12">
            <h2 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-gray-900 dark:text-white">
              Built for people who earn globally
            </h2>
            <p className="mt-4 text-lg text-gray-500 dark:text-gray-400">
              Whether you freelance, work remotely, or create content — Frenz Pay is your payment infrastructure.
            </p>
          </div>
          <div className="grid md:grid-cols-3 gap-7">
            {personas.map((p) => (
              <div key={p.tag} className="group rounded-2xl border border-gray-100 dark:border-white/8 bg-gray-50 dark:bg-white/3 p-8 hover:border-blue-200 dark:hover:border-blue-500/30 hover:shadow-xl transition-all">
                <div className="w-12 h-12 rounded-xl bg-blue-50 dark:bg-blue-500/10 text-blue-600 dark:text-blue-400 flex items-center justify-center mb-4 group-hover:bg-blue-600 group-hover:text-white transition-all">
                  <p.icon className="w-6 h-6" />
                </div>
                <span className="text-xs font-semibold text-blue-600 dark:text-blue-400 uppercase tracking-wider">{p.tag}</span>
                <h3 className="mt-2 text-xl font-bold text-gray-900 dark:text-white">{p.title}</h3>
                <p className="mt-3 text-sm text-gray-500 dark:text-gray-400 leading-relaxed">{p.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ═══ FEATURES ════════════════════════════════════════ */}
      <section className="py-20 bg-gray-50 dark:bg-[#0a1020]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="max-w-2xl mx-auto text-center mb-12">
            <h2 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-gray-900 dark:text-white">
              Everything you need, nothing you don&apos;t
            </h2>
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-5">
            {features.map((f) => (
              <div key={f.title} className="group rounded-2xl border border-gray-100 dark:border-white/8 bg-white dark:bg-white/3 p-6 hover:border-blue-200 dark:hover:border-blue-500/20 hover:shadow-lg transition-all">
                <div className="w-11 h-11 rounded-xl border border-gray-100 dark:border-white/10 bg-gray-50 dark:bg-white/5 text-blue-600 dark:text-blue-400 flex items-center justify-center group-hover:bg-blue-600 group-hover:text-white group-hover:border-blue-600 transition-all mb-4 shadow-sm">
                  <f.icon className="w-5 h-5" />
                </div>
                <h3 className="text-sm font-bold text-gray-900 dark:text-white">{f.title}</h3>
                <p className="mt-2 text-xs text-gray-500 dark:text-gray-400 leading-relaxed">{f.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ═══ HOW IT WORKS ════════════════════════════════════ */}
      <section className="py-20 bg-white dark:bg-[#0c1526]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid lg:grid-cols-2 gap-16 items-center">
            <div>
              <span className="text-sm font-semibold text-blue-600 dark:text-blue-400 uppercase tracking-wider">How it works</span>
              <h2 className="mt-2 text-3xl sm:text-4xl font-extrabold tracking-tight text-gray-900 dark:text-white">
                Get started in 4 simple steps
              </h2>
              <p className="mt-4 text-lg text-gray-500 dark:text-gray-400">From download to your first withdrawal — under a day.</p>
              <div className="mt-10 space-y-7">
                {steps.map((s, i) => (
                  <div key={s.step} className="flex gap-5">
                    <div className="w-12 h-12 rounded-2xl flex items-center justify-center shrink-0 font-black text-base text-white" style={{ background: "#2563eb" }}>
                      {s.step}
                    </div>
                    <div>
                      <h3 className="font-bold text-gray-900 dark:text-white">{s.title}</h3>
                      <p className="mt-1 text-sm text-gray-500 dark:text-gray-400 leading-relaxed">{s.description}</p>
                    </div>
                  </div>
                ))}
              </div>
              <div className="mt-10"><AppBadges /></div>
            </div>

            <div className="flex justify-center">
              <PhoneMockup>
                <div className="px-5 pb-8 pt-10">
                  <p className="text-sm font-bold text-white">Choose Withdrawal</p>
                  <p className="text-xs text-gray-500 mt-0.5">How do you want to receive?</p>

                  <div className="mt-4 rounded-2xl bg-white/5 border border-white/8 p-4 text-center">
                    <p className="text-xs text-gray-500">You&apos;re withdrawing</p>
                    <p className="text-3xl font-black text-white mt-1">$2,500.00</p>
                  </div>

                  <div className="mt-4 space-y-2.5">
                    {/* USDT option */}
                    <div className="rounded-2xl border border-amber-500/40 bg-amber-500/10 p-3.5 cursor-pointer">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center">
                            <Bitcoin className="w-4 h-4 text-white" />
                          </div>
                          <div>
                            <p className="text-xs font-bold text-white">USDT Wallet</p>
                            <p className="text-[10px] text-gray-400">TRC-20 · ~5 min</p>
                          </div>
                        </div>
                        <p className="text-xs font-bold text-amber-400">2,450 USDT</p>
                      </div>
                    </div>
                    {/* Naira option */}
                    <div className="rounded-2xl border border-green-500/40 bg-green-500/10 p-3.5 cursor-pointer">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-green-500 to-emerald-600 flex items-center justify-center">
                            <Building2 className="w-4 h-4 text-white" />
                          </div>
                          <div>
                            <p className="text-xs font-bold text-white">Naira Bank Account</p>
                            <p className="text-[10px] text-gray-400">Any bank · Same day</p>
                          </div>
                        </div>
                        <p className="text-xs font-bold text-green-400">₦4.1M</p>
                      </div>
                    </div>
                  </div>

                  <div className="mt-4 space-y-2 rounded-xl bg-white/3 border border-white/8 p-3">
                    {[
                      { l: "Exchange Rate", v: "1 USD = 0.998 USDT" },
                      { l: "Withdrawal Fee (1.5%)", v: "-$37.50" },
                      { l: "Network Fee", v: "-$1.00" },
                    ].map((r) => (
                      <div key={r.l} className="flex justify-between text-xs">
                        <span className="text-gray-500">{r.l}</span>
                        <span className="text-white font-medium">{r.v}</span>
                      </div>
                    ))}
                  </div>

                  <div className="mt-3 rounded-xl py-3 text-center text-sm font-bold text-white" style={{ background: "#2563eb" }}>
                    Confirm Withdrawal
                  </div>
                </div>
              </PhoneMockup>
            </div>
          </div>
        </div>
      </section>

      {/* ═══ STATS ═══════════════════════════════════════════ */}
      <section className="py-16" style={{ background: "linear-gradient(160deg, #2563eb 0%, #1d4ed8 100%)" }}>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8">
            {stats.map((s) => (
              <div key={s.label} className="text-center">
                <p className="text-4xl sm:text-5xl font-black text-white">{s.value}</p>
                <p className="mt-2 text-sm text-white/70">{s.label}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ═══ TESTIMONIALS ════════════════════════════════════ */}
      <section className="py-20 bg-gray-50 dark:bg-[#0a1020]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="max-w-2xl mx-auto text-center mb-12">
            <h2 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-gray-900 dark:text-white">
              Loved by thousands across Africa
            </h2>
          </div>
          <div className="grid md:grid-cols-3 gap-6">
            {testimonials.map((t) => (
              <div key={t.name} className="rounded-2xl border border-gray-100 dark:border-white/8 bg-white dark:bg-white/3 p-8">
                <div className="flex gap-1 mb-4">
                  {[1,2,3,4,5].map((i) => <Star key={i} className="w-4 h-4 fill-yellow-400 text-yellow-400" />)}
                </div>
                <p className="text-sm text-gray-600 dark:text-gray-400 leading-relaxed">&ldquo;{t.quote}&rdquo;</p>
                <div className="mt-6 flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full text-white font-bold text-sm flex items-center justify-center" style={{ background: "#2563eb" }}>{t.initials}</div>
                  <div>
                    <p className="text-sm font-bold text-gray-900 dark:text-white">{t.name}</p>
                    <p className="text-xs text-gray-400">{t.role}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ═══ VIRTUAL CARD ════════════════════════════════════ */}
      <section className="py-20 bg-white dark:bg-[#0a1020]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid lg:grid-cols-2 gap-14 items-center">
            {/* Card visual */}
            <div className="flex justify-center order-2 lg:order-1">
              <div className="relative w-[340px]">
                {/* Glow */}
                <div className="absolute -inset-6 rounded-3xl opacity-30 blur-2xl" style={{ background: "radial-gradient(ellipse, #2563eb, transparent 70%)" }} />
                {/* Card */}
                <div className="relative rounded-3xl p-7 text-white shadow-2xl overflow-hidden" style={{ background: "linear-gradient(135deg, #1d4ed8 0%, #2563eb 50%, #3b82f6 100%)" }}>
                  {/* Pattern */}
                  <div className="absolute inset-0 opacity-10" style={{ backgroundImage: "radial-gradient(circle at 80% 20%, rgba(255,255,255,0.8) 0%, transparent 50%), radial-gradient(circle at 20% 80%, rgba(255,255,255,0.4) 0%, transparent 50%)" }} />
                  <div className="relative">
                    <div className="flex items-start justify-between mb-8">
                      <div>
                        <div className="w-10 h-10 rounded-xl bg-white/20 flex items-center justify-center mb-1">
                          <svg viewBox="0 0 32 32" fill="none" className="w-6 h-6"><path d="M8 7h13c1 0 1.5.7 1.5 1.5S22 10 21 10H11v5h9c1 0 1.5.7 1.5 1.5S21 18 20 18h-9v7c0 1-.7 1.5-1.5 1.5S8 26 8 25V8.5C8 7.7 8.7 7 9.5 7z" fill="white"/></svg>
                        </div>
                        <p className="text-xs text-white/60 font-medium tracking-wider uppercase">Frenz Pay</p>
                      </div>
                      <div className="flex items-center gap-1 bg-white/15 rounded-full px-3 py-1 text-xs font-semibold">
                        <CreditCard className="w-3 h-3" /> Virtual
                      </div>
                    </div>
                    {/* Chip */}
                    <div className="w-12 h-9 rounded-lg bg-gradient-to-br from-yellow-300 to-yellow-500 mb-5 opacity-90 flex items-center justify-center">
                      <div className="grid grid-cols-2 gap-0.5 w-7 h-5">
                        {[...Array(6)].map((_, i) => <div key={i} className="bg-yellow-700/40 rounded-sm" />)}
                      </div>
                    </div>
                    <p className="text-xl font-mono font-bold tracking-widest mb-4">4832 •••• •••• 7291</p>
                    <div className="flex items-end justify-between">
                      <div>
                        <p className="text-[10px] text-white/50 uppercase tracking-wider">Card Holder</p>
                        <p className="text-sm font-bold">Adebayo Okafor</p>
                      </div>
                      <div className="text-right">
                        <p className="text-[10px] text-white/50 uppercase tracking-wider">Expires</p>
                        <p className="text-sm font-bold">08/28</p>
                      </div>
                      <svg viewBox="0 0 38 24" className="w-12 h-8 opacity-90">
                        <circle cx="15" cy="12" r="10" fill="#EB001B"/>
                        <circle cx="23" cy="12" r="10" fill="#F79E1B" fillOpacity="0.8"/>
                      </svg>
                    </div>
                  </div>
                </div>
                {/* Behind card */}
                <div className="absolute -bottom-4 -right-4 w-[300px] rounded-3xl p-7 -z-10 opacity-50" style={{ background: "linear-gradient(135deg,#1e3a8a,#1d4ed8)", height: "100%" }} />
              </div>
            </div>

            {/* Text */}
            <div className="order-1 lg:order-2">
              <span className="inline-block rounded-full bg-blue-50 dark:bg-blue-500/10 px-4 py-1.5 text-sm font-semibold text-blue-600 dark:text-blue-400 mb-4">Coming Soon</span>
              <h2 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-gray-900 dark:text-white leading-tight">
                Virtual cards for global payments
              </h2>
              <p className="mt-4 text-lg text-gray-500 dark:text-gray-400 leading-relaxed">
                Shop on Amazon, subscribe to Netflix, pay for Shopify, Canva, or any international service — directly from your Frenz Pay USD balance. No need for a physical card.
              </p>
              <ul className="mt-7 space-y-4">
                {[
                  { icon: Globe,       title: "Accepted worldwide",     desc: "Works on any website or app that accepts Mastercard or Visa." },
                  { icon: Zap,         title: "Instant issuance",       desc: "Get your virtual card details in seconds, directly in the app." },
                  { icon: ShieldCheck, title: "Spend controls",         desc: "Set limits, freeze/unfreeze, and manage transactions in real time." },
                  { icon: Lock,        title: "Secure & disposable",    desc: "Generate new card numbers for one-time use to protect your account." },
                ].map((f) => (
                  <li key={f.title} className="flex gap-4">
                    <div className="w-10 h-10 rounded-xl bg-blue-50 dark:bg-blue-500/10 text-blue-600 dark:text-blue-400 flex items-center justify-center flex-shrink-0">
                      <f.icon className="w-5 h-5" />
                    </div>
                    <div>
                      <p className="font-semibold text-gray-900 dark:text-white text-sm">{f.title}</p>
                      <p className="text-sm text-gray-500 dark:text-gray-400">{f.desc}</p>
                    </div>
                  </li>
                ))}
              </ul>
              <div className="mt-8 inline-flex items-center gap-2 rounded-xl border border-blue-200 dark:border-blue-500/20 bg-blue-50 dark:bg-blue-500/5 px-5 py-3">
                <Send className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                <span className="text-sm font-medium text-blue-700 dark:text-blue-300">Join the waitlist to get early access</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ═══ SECURITY ════════════════════════════════════════ */}
      <section className="py-16 bg-white dark:bg-[#0c1526]">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h2 className="text-2xl font-extrabold text-gray-900 dark:text-white mb-10">Your security is our first priority</h2>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-6">
            {[
              { icon: ShieldCheck, label: "256-bit AES Encryption",   sub: "Military-grade" },
              { icon: Activity,    label: "Real-Time Monitoring",      sub: "24/7 fraud detection" },
              { icon: Smartphone,  label: "2FA Protection",            sub: "Mandatory for all" },
              { icon: BadgeCheck,  label: "Full KYC Verification",     sub: "Identity verified" },
            ].map((b) => (
              <div key={b.label} className="flex flex-col items-center gap-3 p-5 rounded-2xl bg-gray-50 dark:bg-white/3 border border-gray-100 dark:border-white/8">
                <div className="w-12 h-12 rounded-xl bg-blue-50 dark:bg-blue-500/10 text-blue-600 dark:text-blue-400 flex items-center justify-center">
                  <b.icon className="w-6 h-6" />
                </div>
                <p className="text-sm font-semibold text-gray-900 dark:text-white text-center leading-tight">{b.label}</p>
                <p className="text-xs text-gray-400">{b.sub}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ═══ DOWNLOAD CTA ════════════════════════════════════ */}
      <section id="download" className="relative overflow-hidden py-24" style={{ background: "linear-gradient(160deg, #3b82f6 0%, #2563eb 50%, #1d4ed8 100%)" }}>
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[700px] h-[350px] rounded-full opacity-15" style={{ background: "radial-gradient(ellipse, rgba(255,255,255,0.4), transparent 70%)" }} />
          <div className="absolute inset-0 opacity-[0.06]" style={{ backgroundImage: "radial-gradient(circle, rgba(255,255,255,0.6) 1px, transparent 1px)", backgroundSize: "40px 40px" }} />
        </div>
        <div className="relative z-10 max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <div className="w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-6 shadow-xl bg-white/20 border border-white/30">
            <svg viewBox="0 0 32 32" fill="none" className="w-9 h-9">
              <path d="M8 7h13c1 0 1.5.7 1.5 1.5S22 10 21 10H11v5h9c1 0 1.5.7 1.5 1.5S21 18 20 18h-9v7c0 1-.7 1.5-1.5 1.5S8 26 8 25V8.5C8 7.7 8.7 7 9.5 7z" fill="white"/>
            </svg>
          </div>
          <h2 className="text-3xl sm:text-4xl font-extrabold text-white">Ready to get paid globally?</h2>
          <p className="mt-4 text-lg text-white/80">
            Create your Frenz Pay account and start receiving international payments in minutes.
            Withdraw in USDC or directly to your Naira bank account.
          </p>
          <div className="mt-10 flex justify-center"><AppBadges size="lg" /></div>
          <div className="mt-6">
            <a href={WHATSAPP_LINK} target="_blank" rel="noopener noreferrer"
              className="inline-flex items-center gap-2 text-sm font-medium text-white/70 hover:text-white transition-colors">
              <MessageCircle className="w-4 h-4" />
              Questions? Chat with us on WhatsApp
            </a>
          </div>
          <div className="mt-10 flex flex-wrap justify-center gap-5 text-xs text-white/40">
            {[["Privacy Policy","/privacy"],["Terms of Service","/terms"],["AML Policy","/aml-policy"],["Refund Policy","/refund-policy"]].map(([l,h]) => (
              <a key={l} href={h} className="hover:text-white/80 transition-colors">{l}</a>
            ))}
          </div>
        </div>
      </section>
    </>
  );
}
