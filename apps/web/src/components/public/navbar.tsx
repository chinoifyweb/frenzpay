"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { Menu, X, ChevronDown, MessageCircle, LogIn } from "lucide-react";

const WHATSAPP_LINK = "https://wa.me/12365997663";

const navLinks = [
  { label: "Features", href: "/features" },
  { label: "Pricing", href: "/pricing" },
  { label: "About", href: "/about" },
  { label: "FAQ", href: "/faq" },
  {
    label: "Legal",
    children: [
      { label: "Privacy Policy", href: "/privacy" },
      { label: "Terms of Service", href: "/terms" },
      { label: "AML Policy", href: "/aml-policy" },
      { label: "Cookie Policy", href: "/cookie-policy" },
      { label: "Refund Policy", href: "/refund-policy" },
    ],
  },
];

export function Navbar() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [legalOpen, setLegalOpen] = useState(false);
  const [mobileLegalOpen, setMobileLegalOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const handler = () => setScrolled(window.scrollY > 20);
    window.addEventListener("scroll", handler);
    return () => window.removeEventListener("scroll", handler);
  }, []);

  return (
    <header
      className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${
        scrolled
          ? "bg-white/95 dark:bg-[#0B1120]/95 backdrop-blur-xl shadow-sm border-b border-gray-100 dark:border-white/10"
          : "bg-transparent"
      }`}
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16 lg:h-[72px]">

          {/* Logo */}
          <Link href="/" className="flex items-center gap-2.5 group">
            <div className="w-9 h-9 rounded-xl bg-green-500 flex items-center justify-center shadow-lg group-hover:scale-105 transition-transform">
              <svg viewBox="0 0 32 32" fill="none" className="w-5 h-5">
                <path d="M8 7h13c1 0 1.5.7 1.5 1.5S22 10 21 10H11v5h9c1 0 1.5.7 1.5 1.5S21 18 20 18h-9v7c0 1-.7 1.5-1.5 1.5S8 26 8 25V8.5C8 7.7 8.7 7 9.5 7z" fill="white"/>
              </svg>
            </div>
            <span className="font-bold text-lg tracking-tight text-gray-900 dark:text-white">
              Frenz<span className="text-green-500">Pay</span>
            </span>
          </Link>

          {/* Desktop Nav */}
          <nav className="hidden lg:flex items-center gap-0.5">
            {navLinks.map((link) =>
              "children" in link ? (
                <div
                  key={link.label}
                  className="relative"
                  onMouseEnter={() => setLegalOpen(true)}
                  onMouseLeave={() => setLegalOpen(false)}
                >
                  <button className="flex items-center gap-1 px-3 py-2 text-sm font-medium text-gray-600 dark:text-gray-300 hover:text-green-600 dark:hover:text-green-400 rounded-lg hover:bg-green-50 dark:hover:bg-green-500/10 transition-all">
                    {link.label}
                    <ChevronDown className={`w-3.5 h-3.5 opacity-60 transition-transform ${legalOpen ? "rotate-180" : ""}`} />
                  </button>
                  <div className={`absolute top-full left-0 mt-1 w-52 rounded-xl border border-gray-100 dark:border-white/10 bg-white dark:bg-[#141c2e] shadow-xl overflow-hidden transition-all duration-200 ${legalOpen ? "opacity-100 translate-y-0 pointer-events-auto" : "opacity-0 -translate-y-2 pointer-events-none"}`}>
                    {("children" in link && link.children || []).map((child) => (
                      <Link key={child.label} href={child.href} className="block px-4 py-2.5 text-sm text-gray-600 dark:text-gray-300 hover:bg-green-50 dark:hover:bg-green-500/10 hover:text-green-600 dark:hover:text-green-400 transition-colors">
                        {child.label}
                      </Link>
                    ))}
                  </div>
                </div>
              ) : (
                <Link key={link.label} href={"href" in link ? link.href : "#"} className="px-3 py-2 text-sm font-medium text-gray-600 dark:text-gray-300 hover:text-green-600 dark:hover:text-green-400 rounded-lg hover:bg-green-50 dark:hover:bg-green-500/10 transition-all">
                  {link.label}
                </Link>
              )
            )}
          </nav>

          {/* Desktop CTAs */}
          <div className="hidden lg:flex items-center gap-2">
            <a href={WHATSAPP_LINK} target="_blank" rel="noopener noreferrer"
              aria-label="Chat with support on WhatsApp"
              className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-gray-600 dark:text-gray-300 hover:text-green-600 dark:hover:text-green-400 rounded-lg hover:bg-green-50 dark:hover:bg-green-500/10 transition-all">
              <MessageCircle className="w-4 h-4" />
              Support
            </a>
            <Link href="/login"
              className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-200 rounded-lg border border-gray-200 dark:border-white/15 hover:border-green-500 dark:hover:border-green-400 hover:text-green-600 dark:hover:text-green-400 transition-all">
              <LogIn className="w-4 h-4" />
              Log in
            </Link>
            <Link href="/signup"
              className="flex items-center gap-1.5 px-4 py-2.5 text-sm font-semibold bg-green-500 hover:bg-green-600 text-white rounded-xl shadow-lg shadow-green-500/20 hover:shadow-green-500/30 transition-all">
              Sign up
            </Link>
          </div>

          {/* Mobile toggle */}
          <button onClick={() => setMobileOpen(!mobileOpen)}
            className="lg:hidden p-2 rounded-xl text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-white/10 transition-colors">
            {mobileOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
        </div>
      </div>

      {/* Mobile Menu */}
      <div className={`lg:hidden overflow-hidden transition-all duration-300 bg-white dark:bg-[#0B1120] border-t border-gray-100 dark:border-white/10 ${mobileOpen ? "max-h-screen" : "max-h-0"}`}>
        <div className="px-4 py-4 space-y-0.5">
          {navLinks.map((link) =>
            "children" in link ? (
              <div key={link.label}>
                <button onClick={() => setMobileLegalOpen(!mobileLegalOpen)}
                  className="flex items-center justify-between w-full px-3 py-2.5 text-sm font-medium text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-50 dark:hover:bg-white/5">
                  {link.label}
                  <ChevronDown className={`w-4 h-4 transition-transform ${mobileLegalOpen ? "rotate-180" : ""}`} />
                </button>
                {mobileLegalOpen && (
                  <div className="ml-3 mt-0.5 space-y-0.5">
                    {("children" in link && link.children || []).map((child) => (
                      <Link key={child.label} href={child.href} onClick={() => setMobileOpen(false)}
                        className="block px-3 py-2 text-sm text-gray-500 dark:text-gray-400 rounded-lg hover:bg-gray-50 dark:hover:bg-white/5">
                        {child.label}
                      </Link>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <Link key={link.label} href={"href" in link ? link.href : "#"} onClick={() => setMobileOpen(false)}
                className="block px-3 py-2.5 text-sm font-medium text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-50 dark:hover:bg-white/5">
                {link.label}
              </Link>
            )
          )}
          <div className="pt-3 border-t border-gray-100 dark:border-white/10 flex flex-col gap-2">
            <Link href="/login" onClick={() => setMobileOpen(false)}
              className="flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-medium border border-gray-200 dark:border-white/20 text-gray-700 dark:text-gray-300 rounded-xl">
              <LogIn className="w-4 h-4" />
              Log in
            </Link>
            <Link href="/signup" onClick={() => setMobileOpen(false)}
              className="flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-semibold bg-green-500 text-white rounded-xl shadow-lg shadow-green-500/20">
              Sign up — it&apos;s free
            </Link>
            <a href={WHATSAPP_LINK} target="_blank" rel="noopener noreferrer"
              className="flex items-center justify-center gap-2 px-4 py-2 text-xs font-medium text-gray-500 dark:text-gray-400 rounded-xl hover:text-green-600 dark:hover:text-green-400">
              <MessageCircle className="w-3.5 h-3.5" />
              Or chat with us on WhatsApp
            </a>
          </div>
        </div>
      </div>
    </header>
  );
}
