'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Cookie, X } from 'lucide-react';

const CONSENT_KEY = 'frenzpay-cookie-consent';
const CONSENT_VERSION = 'v1';

/**
 * Minimal cookie-consent banner — GDPR / UK ICO compliant.
 * We only set essential cookies (session, CSRF); no advertising/tracking.
 * The banner therefore only needs an "Accept" (dismiss) button — no per-category
 * opt-in is required since we don't drop non-essential cookies.
 */
export function CookieConsent() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const stored = window.localStorage.getItem(CONSENT_KEY);
      if (stored !== CONSENT_VERSION) setVisible(true);
    } catch {
      setVisible(true);
    }
  }, []);

  const accept = () => {
    try { window.localStorage.setItem(CONSENT_KEY, CONSENT_VERSION); } catch { /* ignore */ }
    setVisible(false);
  };

  if (!visible) return null;

  return (
    <div
      role="dialog"
      aria-labelledby="cookie-title"
      className="fixed bottom-4 left-1/2 z-50 w-[calc(100%-2rem)] max-w-xl -translate-x-1/2 rounded-xl border bg-background p-4 shadow-lg"
    >
      <div className="flex items-start gap-3">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
          <Cookie className="h-4 w-4" />
        </div>
        <div className="min-w-0 flex-1 text-sm">
          <p id="cookie-title" className="font-medium">We use essential cookies only.</p>
          <p className="mt-1 text-muted-foreground">
            Session and security cookies are required to keep you signed in. We don&apos;t use
            advertising or cross-site tracking.{' '}
            <Link href="/legal/cookies" className="underline underline-offset-2">Learn more</Link>.
          </p>
        </div>
        <Button size="sm" onClick={accept}>OK</Button>
        <button
          aria-label="Dismiss"
          onClick={accept}
          className="text-muted-foreground hover:text-foreground"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
