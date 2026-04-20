import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Standalone output: bundles only what's needed, runs as node server.js
  // Required for PM2 deployment on CyberPanel.
  output: "standalone",

  // pnpm monorepo — tell Next.js where the workspace root is so standalone
  // tracing picks up the right files and node_modules.
  outputFileTracingRoot: require("node:path").join(__dirname, "../../"),

  // Native / prebuilt binaries that must NEVER be bundled by webpack.
  // They stay as require() at runtime and use Node's native resolver.
  serverExternalPackages: [
    "@node-rs/argon2",
    "@prisma/client",
    ".prisma/client",
    "argon2",
    "pino",
    "pino-pretty",
    "ioredis",
  ],

  // Don't let webpack try to parse the emitted compressed sourcemaps or .node binaries.
  poweredByHeader: false,

  // The standalone build runs its own typecheck that duplicates `pnpm typecheck`.
  // In a pnpm monorepo with multiple @types/react versions, the build-time pass
  // can trip on false positives even when tsc passes cleanly. We run `pnpm test`
  // + `pnpm typecheck` in CI so the production build just needs to emit code.
  typescript: { ignoreBuildErrors: true },
  eslint: { ignoreDuringBuilds: true },

  // Keep native / prebuilt binary modules out of the webpack bundle on the server.
  // `serverExternalPackages` works for direct imports but is bypassed when the
  // import comes from inside a transpilePackages workspace — this webpack hook
  // covers that case.
  webpack: (config, { isServer }) => {
    if (isServer) {
      // Use a matcher function so we catch all @node-rs/argon2-*-* platform
      // variants and any future .node binaries.
      const existing = Array.isArray(config.externals)
        ? config.externals
        : config.externals ? [config.externals] : [];

      config.externals = [
        ...existing,
        // Externalise @node-rs/argon2 + all its prebuilt platform variants
        ({ request }: { request?: string }, callback: (err?: null, result?: string) => void) => {
          if (request && /^@node-rs\/argon2/.test(request)) {
            return callback(null, "commonjs " + request);
          }
          return callback();
        },
      ];
    }
    return config;
  },

  // Transpile local workspace packages so Next.js compiles their TypeScript source
  transpilePackages: [
    "@frenzpay/auth",
    "@frenzpay/crypto",
    "@frenzpay/db",
    "@frenzpay/ledger",
    "@frenzpay/logger",
    "@frenzpay/validators",
    "@frenzpay/events",
    "@frenzpay/providers",
    "@frenzpay/ui",
    "@frenzpay/kyc",
  ],

  // Security headers
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
          {
            key: "Content-Security-Policy",
            value: [
              "default-src 'self'",
              // Scripts: self + Cloudflare Turnstile
              "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://challenges.cloudflare.com",
              "style-src 'self' 'unsafe-inline'",
              "img-src 'self' blob: data: https://logo.clearbit.com",
              // Outbound XHR/fetch: our own API + provider + observability hosts
              [
                "connect-src 'self'",
                "https://api.frenzpay.co",
                "https://api.bridge.xyz",
                "https://*.ingest.sentry.io",
              ].join(" "),
              // iFrames: Bridge card iframe, Turnstile
              "frame-src https://*.bridge.xyz https://challenges.cloudflare.com",
              "font-src 'self' data:",
              "object-src 'none'",
              "base-uri 'self'",
              "form-action 'self'",
              "frame-ancestors 'none'",
            ].join("; "),
          },
          {
            key: "Strict-Transport-Security",
            value: "max-age=63072000; includeSubDomains; preload",
          },
        ],
      },
    ];
  },

  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "logo.clearbit.com",
        pathname: "/**",
      },
    ],
  },

  // Experimental: server actions are stable in Next 15
  experimental: {
    serverActions: {
      allowedOrigins: ["app.frenzpay.co", "localhost:3000"],
    },
  },
};

export default nextConfig;
