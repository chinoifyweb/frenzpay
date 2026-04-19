/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  // Turn off the static file handler hoist so standalone output knows
  // about this repo layout (pnpm monorepo).
  outputFileTracingRoot: new URL('../..', import.meta.url).pathname,
  env: {
    NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL || 'https://api.frenzpay.co',
  },
}

export default nextConfig
