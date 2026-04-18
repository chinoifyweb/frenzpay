import type { Metadata, Viewport } from "next"
import { Inter } from "next/font/google"
import { ThemeProvider } from "next-themes"
import { TooltipProvider } from "@/components/ui/tooltip"
import { Toaster } from "@/components/ui/sonner"
import { CookieConsent } from "@/components/shared/cookie-consent"
import { ServiceWorkerRegister } from "@/components/shared/service-worker-register"
import "./globals.css"

export const viewport: Viewport = {
  themeColor: "#0ea5e9",
  width: "device-width",
  initialScale: 1,
}

const inter = Inter({
  variable: "--font-sans",
  subsets: ["latin"],
})

export const metadata: Metadata = {
  title: {
    default: "Frenz Pay — Get Paid Globally, Withdraw in USDT",
    template: "%s | Frenz Pay",
  },
  description:
    "Receive payments from anywhere in the world with virtual USD, GBP, and EUR accounts. Withdraw your earnings in USDT instantly.",
  keywords: [
    "payment",
    "fintech",
    "virtual account",
    "USDT",
    "crypto",
    "freelancer",
    "global payments",
    "Nigeria",
  ],
  icons: {
    icon: [
      { url: "/favicon.svg", type: "image/svg+xml" },
      { url: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: "/apple-touch-icon.png",
  },
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    title: "FrenzPay",
    statusBarStyle: "black-translucent",
  },
  openGraph: {
    title: "Frenz Pay — Get Paid Globally, Withdraw in USDT",
    description:
      "Receive payments from anywhere in the world with virtual USD, GBP, and EUR accounts.",
    url: "https://frenzpay.co",
    siteName: "Frenz Pay",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Frenz Pay — Get Paid Globally, Withdraw in USDT",
    description:
      "Receive payments from anywhere in the world with virtual USD, GBP, and EUR accounts.",
  },
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${inter.variable} font-sans antialiased`}>
        <ThemeProvider
          attribute="class"
          defaultTheme="light"
          enableSystem
          disableTransitionOnChange
        >
          <TooltipProvider>
            {children}
            <Toaster position="top-right" />
            <CookieConsent />
            <ServiceWorkerRegister />
          </TooltipProvider>
        </ThemeProvider>
      </body>
    </html>
  )
}
