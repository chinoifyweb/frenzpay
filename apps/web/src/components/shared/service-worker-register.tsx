'use client';

import { useEffect } from 'react';

/**
 * Registers the service worker in production only.
 * Mount this client component anywhere in the root layout.
 */
export function ServiceWorkerRegister() {
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (process.env.NODE_ENV !== 'production') return;
    if (!('serviceWorker' in navigator)) return;

    const register = async () => {
      try {
        await navigator.serviceWorker.register('/sw.js', { scope: '/' });
      } catch (err) {
        console.warn('SW registration failed:', err);
      }
    };

    void register();
  }, []);

  return null;
}
