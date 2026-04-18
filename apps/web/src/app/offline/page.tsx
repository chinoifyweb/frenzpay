import { WifiOff } from 'lucide-react';

export const metadata = {
  title: 'Offline — FrenzPay',
  description: 'Reconnect to continue using FrenzPay.',
};

export default function OfflinePage() {
  return (
    <div className="flex min-h-screen items-center justify-center p-6 text-center">
      <div className="max-w-md space-y-4">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-muted text-muted-foreground">
          <WifiOff className="h-7 w-7" />
        </div>
        <h1 className="text-2xl font-semibold">You&apos;re offline</h1>
        <p className="text-sm text-muted-foreground">
          Reconnect to the internet to continue. Your session is safe and will resume
          automatically once you&apos;re back online.
        </p>
      </div>
    </div>
  );
}
