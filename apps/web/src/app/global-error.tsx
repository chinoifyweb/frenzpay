'use client';

/**
 * Root-level error boundary for the entire App Router tree.
 *
 * Catches React render errors that escape every other error boundary.
 * Reports to Sentry (if configured), then shows a minimal fallback.
 *
 * Next.js requires this to be a Client Component and to render its own
 * <html>/<body> (it replaces the whole layout on catastrophic errors).
 */

import * as Sentry from '@sentry/nextjs';
import NextError from 'next/error';
import { useEffect } from 'react';

export default function GlobalError({ error }: { error: Error & { digest?: string } }) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <html lang="en">
      <body>
        {/* NextError is the default Next.js error page UI. */}
        <NextError statusCode={0} />
      </body>
    </html>
  );
}
