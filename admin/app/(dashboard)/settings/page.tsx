'use client'

import { useEffect, useState } from 'react'
import { api, type PlatformSettings } from '@/lib/api'
import {
  CheckCircle2,
  XCircle,
  Globe,
  Lock,
  Mail,
  Zap,
  Shield,
  RefreshCw,
  Copy,
  Check,
} from 'lucide-react'

function ServiceBadge({ ok, label }: { ok: boolean; label: string }) {
  return (
    <div className="flex items-center justify-between py-3 border-b border-gray-50 last:border-0">
      <span className="text-sm text-gray-700">{label}</span>
      {ok ? (
        <span className="flex items-center gap-1.5 text-xs font-medium text-green-700 bg-green-50 px-2.5 py-1 rounded-full">
          <CheckCircle2 className="w-3.5 h-3.5" /> Configured
        </span>
      ) : (
        <span className="flex items-center gap-1.5 text-xs font-medium text-red-600 bg-red-50 px-2.5 py-1 rounded-full">
          <XCircle className="w-3.5 h-3.5" /> Not Set
        </span>
      )}
    </div>
  )
}

function CopyableValue({ value }: { value: string }) {
  const [copied, setCopied] = useState(false)
  function copy() {
    navigator.clipboard.writeText(value)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }
  return (
    <div className="flex items-center gap-2">
      <span className="font-mono text-sm text-gray-800 bg-gray-100 px-2 py-0.5 rounded">
        {value}
      </span>
      <button onClick={copy} className="text-gray-400 hover:text-gray-600 transition">
        {copied ? <Check className="w-3.5 h-3.5 text-green-500" /> : <Copy className="w-3.5 h-3.5" />}
      </button>
    </div>
  )
}

function ConfigRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between py-3 border-b border-gray-50 last:border-0">
      <span className="text-sm text-gray-500">{label}</span>
      <div className="text-right">{children}</div>
    </div>
  )
}

function SectionCard({
  title,
  icon: Icon,
  children,
}: {
  title: string
  icon: React.ElementType
  children: React.ReactNode
}) {
  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100">
      <div className="flex items-center gap-2.5 px-5 py-4 border-b border-gray-100">
        <div className="w-8 h-8 rounded-lg bg-purple-50 flex items-center justify-center">
          <Icon className="w-4 h-4 text-purple-600" />
        </div>
        <h2 className="font-semibold text-gray-900 text-sm">{title}</h2>
      </div>
      <div className="px-5 py-1">{children}</div>
    </div>
  )
}

export default function SettingsPage() {
  const [cfg, setCfg] = useState<PlatformSettings | null>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)

  function load() {
    setLoading(true)
    api
      .platformSettings()
      .then(setCfg)
      .catch(e => setError(e.message))
      .finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [])

  const envColor =
    cfg?.platform.environment === 'production'
      ? 'bg-green-100 text-green-700'
      : 'bg-amber-100 text-amber-700'

  return (
    <div className="space-y-6 max-w-4xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Platform Settings</h1>
          <p className="text-gray-500 text-sm mt-0.5">
            Live configuration &amp; service status — read-only
          </p>
        </div>
        <button
          onClick={load}
          disabled={loading}
          className="flex items-center gap-2 px-4 py-2 text-sm border border-gray-200 rounded-lg hover:bg-gray-50 disabled:opacity-50 transition"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      {error && (
        <div className="bg-red-50 text-red-700 rounded-xl p-4 text-sm">
          Failed to load settings: {error}
        </div>
      )}

      {loading && !cfg ? (
        <div className="flex items-center justify-center h-40">
          <div className="animate-spin w-7 h-7 border-2 border-purple-600 border-t-transparent rounded-full" />
        </div>
      ) : cfg ? (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          {/* Platform Info */}
          <SectionCard title="Platform Info" icon={Globe}>
            <ConfigRow label="Environment">
              <span className={`text-xs font-semibold px-2.5 py-1 rounded-full uppercase ${envColor}`}>
                {cfg.platform.environment}
              </span>
            </ConfigRow>
            <ConfigRow label="App URL">
              <CopyableValue value={cfg.platform.app_url} />
            </ConfigRow>
            <ConfigRow label="API URL">
              <CopyableValue value={cfg.platform.api_url} />
            </ConfigRow>
          </SectionCard>

          {/* Email */}
          <SectionCard title="Email" icon={Mail}>
            <ConfigRow label="From Address">
              <CopyableValue value={cfg.email.from_address} />
            </ConfigRow>
            <ServiceBadge ok={cfg.email.resend_configured} label="Resend API Key" />
          </SectionCard>

          {/* Service Connections */}
          <SectionCard title="Service Connections" icon={Zap}>
            <ServiceBadge ok={cfg.services.graph_payment_rails} label="Graph Payment Rails" />
            <ServiceBadge ok={cfg.services.dojah_kyc} label="Dojah KYC" />
            <ServiceBadge ok={cfg.services.termii_sms} label="Termii SMS / OTP" />
            <ServiceBadge ok={cfg.services.sentry_monitoring} label="Sentry Error Monitoring" />
            <ServiceBadge ok={cfg.services.telegram_alerts} label="Telegram Admin Alerts" />
          </SectionCard>

          {/* Auth & JWT */}
          <SectionCard title="Auth & Security" icon={Lock}>
            <ConfigRow label="JWT Algorithm">
              <span className="font-mono text-sm bg-gray-100 px-2 py-0.5 rounded text-gray-800">
                {cfg.auth.jwt_algorithm}
              </span>
            </ConfigRow>
            <ConfigRow label="Access Token TTL">
              <span className="text-sm font-medium text-gray-800">
                {cfg.auth.access_token_ttl_minutes} min
              </span>
            </ConfigRow>
            <ConfigRow label="Refresh Token TTL">
              <span className="text-sm font-medium text-gray-800">
                {cfg.auth.refresh_token_ttl_days} days
              </span>
            </ConfigRow>
            <ConfigRow label="OTP Validity">
              <span className="text-sm font-medium text-gray-800">
                {cfg.auth.otp_ttl_minutes} min
              </span>
            </ConfigRow>
            <ConfigRow label="OTP Max Attempts">
              <span className="text-sm font-medium text-gray-800">
                {cfg.auth.otp_max_attempts}
              </span>
            </ConfigRow>
          </SectionCard>

          {/* CORS */}
          <div className="lg:col-span-2">
            <SectionCard title="Allowed Origins (CORS)" icon={Shield}>
              <div className="py-3 flex flex-wrap gap-2">
                {cfg.cors_origins.map(origin => (
                  <span
                    key={origin}
                    className="font-mono text-xs bg-indigo-50 text-indigo-700 border border-indigo-100 px-2.5 py-1 rounded"
                  >
                    {origin}
                  </span>
                ))}
              </div>
            </SectionCard>
          </div>
        </div>
      ) : null}
    </div>
  )
}
