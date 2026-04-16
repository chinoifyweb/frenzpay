'use client'

import { useEffect, useState } from 'react'
import { api, type PlatformSettings } from '@/lib/api'
import {
  CheckCircle2, XCircle, Globe, Lock, Mail, Zap, Shield, RefreshCw, Copy, Check,
  Eye, EyeOff, Save, Loader2,
} from 'lucide-react'

// ── Reusable UI bits ──────────────────────────────────────────────────────────

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
      <span className="font-mono text-sm text-gray-800 bg-gray-100 px-2 py-0.5 rounded">{value}</span>
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

function SectionCard({ title, icon: Icon, children }: {
  title: string; icon: React.ElementType; children: React.ReactNode
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

// ── Editable key row ──────────────────────────────────────────────────────────

function KeyField({
  label, envKey, isConfigured, placeholder = 'Paste key here…', onSaved,
}: {
  label: string
  envKey: string
  isConfigured: boolean
  placeholder?: string
  onSaved?: () => void
}) {
  const [value, setValue] = useState('')
  const [show, setShow] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState('')

  async function save() {
    if (!value.trim()) return
    setSaving(true)
    setError('')
    try {
      await api.updateKey(envKey, value.trim())
      setValue('')
      setSaved(true)
      setTimeout(() => setSaved(false), 3000)
      onSaved?.()
    } catch (e: any) {
      setError(e.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="py-3 border-b border-gray-50 last:border-0">
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-sm text-gray-700">{label}</span>
        {isConfigured ? (
          <span className="flex items-center gap-1 text-xs font-medium text-green-700 bg-green-50 px-2 py-0.5 rounded-full">
            <CheckCircle2 className="w-3 h-3" /> Configured
          </span>
        ) : (
          <span className="flex items-center gap-1 text-xs font-medium text-red-600 bg-red-50 px-2 py-0.5 rounded-full">
            <XCircle className="w-3 h-3" /> Not Set
          </span>
        )}
      </div>
      <div className="flex gap-2 mt-1">
        <div className="relative flex-1">
          <input
            type={show ? 'text' : 'password'}
            value={value}
            onChange={e => setValue(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && save()}
            placeholder={isConfigured ? '••••••• (leave blank to keep current)' : placeholder}
            className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 pr-9 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent font-mono"
          />
          <button
            onClick={() => setShow(s => !s)}
            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
          >
            {show ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
          </button>
        </div>
        <button
          onClick={save}
          disabled={saving || !value.trim()}
          className="flex items-center gap-1.5 px-3 py-2 bg-purple-600 text-white text-sm font-medium rounded-lg hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed transition"
        >
          {saving
            ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
            : saved
            ? <Check className="w-3.5 h-3.5" />
            : <Save className="w-3.5 h-3.5" />}
          {saved ? 'Saved!' : 'Save'}
        </button>
      </div>
      {error && <p className="text-xs text-red-600 mt-1">{error}</p>}
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function SettingsPage() {
  const [cfg, setCfg] = useState<PlatformSettings | null>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)

  function load() {
    setLoading(true)
    api.platformSettings()
      .then(setCfg)
      .catch(e => setError(e.message))
      .finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [])

  const envColor = cfg?.platform.environment === 'production'
    ? 'bg-green-100 text-green-700'
    : 'bg-amber-100 text-amber-700'

  return (
    <div className="space-y-6 max-w-4xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Platform Settings</h1>
          <p className="text-gray-500 text-sm mt-0.5">Configure service integrations and view live config</p>
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
        <div className="bg-red-50 text-red-700 rounded-xl p-4 text-sm">Failed to load settings: {error}</div>
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
            <ConfigRow label="App URL"><CopyableValue value={cfg.platform.app_url} /></ConfigRow>
            <ConfigRow label="API URL"><CopyableValue value={cfg.platform.api_url} /></ConfigRow>
          </SectionCard>

          {/* Auth & JWT */}
          <SectionCard title="Auth & Security" icon={Lock}>
            <ConfigRow label="JWT Algorithm">
              <span className="font-mono text-sm bg-gray-100 px-2 py-0.5 rounded text-gray-800">
                {cfg.auth.jwt_algorithm}
              </span>
            </ConfigRow>
            <ConfigRow label="Access Token TTL">
              <span className="text-sm font-medium text-gray-800">{cfg.auth.access_token_ttl_minutes} min</span>
            </ConfigRow>
            <ConfigRow label="Refresh Token TTL">
              <span className="text-sm font-medium text-gray-800">{cfg.auth.refresh_token_ttl_days} days</span>
            </ConfigRow>
            <ConfigRow label="OTP Validity">
              <span className="text-sm font-medium text-gray-800">{cfg.auth.otp_ttl_minutes} min</span>
            </ConfigRow>
            <ConfigRow label="OTP Max Attempts">
              <span className="text-sm font-medium text-gray-800">{cfg.auth.otp_max_attempts}</span>
            </ConfigRow>
          </SectionCard>

          {/* Bridge Payment Rails */}
          <SectionCard title="Bridge Payment Rails" icon={Zap}>
            <KeyField
              label="API Key"
              envKey="BRIDGE_API_KEY"
              isConfigured={cfg.services.bridge_payment_rails}
              placeholder="sk-live-… or sk-test-…"
              onSaved={load}
            />
            <KeyField
              label="API URL"
              envKey="BRIDGE_API_URL"
              isConfigured={true}
              placeholder="https://api.bridge.xyz"
              onSaved={load}
            />
            <KeyField
              label="Webhook Secret"
              envKey="BRIDGE_WEBHOOK_SECRET"
              isConfigured={false}
              placeholder="whsec_…"
              onSaved={load}
            />
          </SectionCard>

          {/* Dojah KYC */}
          <SectionCard title="Dojah KYC" icon={Shield}>
            <KeyField
              label="App ID"
              envKey="DOJAH_APP_ID"
              isConfigured={cfg.services.dojah_kyc}
              placeholder="Your Dojah App ID"
              onSaved={load}
            />
            <KeyField
              label="Public Key"
              envKey="DOJAH_PUBLIC_KEY"
              isConfigured={cfg.services.dojah_kyc}
              placeholder="Your Dojah Public Key"
              onSaved={load}
            />
            <KeyField
              label="Private Key"
              envKey="DOJAH_PRIVATE_KEY"
              isConfigured={cfg.services.dojah_kyc}
              placeholder="Your Dojah Private Key"
              onSaved={load}
            />
            <KeyField
              label="Webhook Secret"
              envKey="DOJAH_WEBHOOK_SECRET"
              isConfigured={false}
              placeholder="Dojah webhook secret"
              onSaved={load}
            />
          </SectionCard>

          {/* Termii SMS */}
          <SectionCard title="Termii SMS" icon={Zap}>
            <KeyField
              label="API Key"
              envKey="TERMII_API_KEY"
              isConfigured={cfg.services.termii_sms}
              placeholder="Your Termii API key"
              onSaved={load}
            />
            <KeyField
              label="Sender ID"
              envKey="TERMII_SENDER_ID"
              isConfigured={true}
              placeholder="FrenzPay"
              onSaved={load}
            />
          </SectionCard>

          {/* Email */}
          <SectionCard title="Email (Purelymail SMTP)" icon={Mail}>
            <ConfigRow label="From Address"><CopyableValue value={cfg.email.from_address} /></ConfigRow>
            <ConfigRow label="SMTP Host">
              <CopyableValue value={`${cfg.email.smtp_host}:${cfg.email.smtp_port}`} />
            </ConfigRow>
            <ServiceBadge ok={cfg.email.smtp_configured} label="SMTP Password" />
            <KeyField
              label="Update SMTP Password"
              envKey="SMTP_PASSWORD"
              isConfigured={cfg.email.smtp_configured}
              placeholder="App password from Purelymail"
              onSaved={load}
            />
          </SectionCard>

          {/* Bridge Webhook Signing Key */}
          <div className="lg:col-span-2">
            <SectionCard title="Bridge Webhook Signing" icon={Shield}>
              <div className="py-2 pb-3">
                <p className="text-xs text-gray-500 mb-3">
                  Bridge signs webhooks with RSA-256. Paste the <strong>public key PEM</strong> from
                  {' '}<span className="font-mono">Bridge Dashboard → Developers → Webhooks → Signing Key</span>.
                  Leave blank to skip verification in development.
                </p>
                <KeyField
                  label="Webhook RSA Public Key (PEM)"
                  envKey="BRIDGE_WEBHOOK_PUBLIC_KEY"
                  isConfigured={cfg.services.bridge_payment_rails}
                  placeholder="-----BEGIN PUBLIC KEY-----&#10;MIIBIjANBgkq…&#10;-----END PUBLIC KEY-----"
                  onSaved={load}
                />
              </div>
            </SectionCard>
          </div>

          {/* Yellow Card */}
          <SectionCard title="Yellow Card (Africa)" icon={Zap}>
            <KeyField
              label="API Key"
              envKey="YELLOWCARD_API_KEY"
              isConfigured={cfg.services.yellowcard}
              placeholder="Your Yellow Card API key"
              onSaved={load}
            />
            <KeyField
              label="Secret Key"
              envKey="YELLOWCARD_SECRET_KEY"
              isConfigured={cfg.services.yellowcard}
              placeholder="Your Yellow Card secret key"
              onSaved={load}
            />
            <KeyField
              label="Webhook Secret"
              envKey="YELLOWCARD_WEBHOOK_SECRET"
              isConfigured={false}
              placeholder="Yellow Card webhook HMAC secret"
              onSaved={load}
            />
          </SectionCard>

          {/* Monitoring */}
          <SectionCard title="Monitoring & Alerts" icon={Shield}>
            <KeyField
              label="Sentry DSN"
              envKey="SENTRY_DSN"
              isConfigured={cfg.services.sentry_monitoring}
              placeholder="https://xxx@oXXX.ingest.sentry.io/XXX"
              onSaved={load}
            />
            <KeyField
              label="Telegram Bot Token"
              envKey="ADMIN_ALERT_TELEGRAM_BOT_TOKEN"
              isConfigured={cfg.services.telegram_alerts}
              placeholder="123456:ABC-DEF…"
              onSaved={load}
            />
            <KeyField
              label="Telegram Chat ID"
              envKey="ADMIN_ALERT_CHAT_ID"
              isConfigured={cfg.services.telegram_alerts}
              placeholder="-1001234567890"
              onSaved={load}
            />
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
