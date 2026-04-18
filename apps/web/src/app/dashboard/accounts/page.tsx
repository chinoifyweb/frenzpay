'use client'

import { useState } from 'react'
import { Copy, Check, Share2, Info } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import type { VirtualAccount } from '@/types'
import { getCurrencyFlag } from '@/lib/utils'
import { toast } from 'sonner'

const mockAccounts: VirtualAccount[] = [
  { id: '1', user_id: '1', wallet_id: '1', currency: 'USD', account_name: 'FRENZPAY/Adekunle Johnson', account_number: '8201234567', bank_name: 'Community Federal Savings Bank', routing_number: '026073150', sort_code: null, iban: null, swift_code: 'CMFGUS33', provider: 'sudo', provider_account_id: 'va_123', status: 'active', created_at: '2026-01-15' },
  { id: '2', user_id: '1', wallet_id: '2', currency: 'GBP', account_name: 'FRENZPAY/Adekunle Johnson', account_number: '12345678', bank_name: 'ClearBank', routing_number: null, sort_code: '04-00-75', iban: 'GB82CLRB04007512345678', swift_code: 'CLRBGB2L', provider: 'sudo', provider_account_id: 'va_124', status: 'active', created_at: '2026-01-15' },
  { id: '3', user_id: '1', wallet_id: '3', currency: 'EUR', account_name: 'FRENZPAY/Adekunle Johnson', account_number: '1234567890', bank_name: 'ClearBank Europe', routing_number: null, sort_code: null, iban: 'DE89370400440532013000', swift_code: 'COBADEFFXXX', provider: 'sudo', provider_account_id: 'va_125', status: 'active', created_at: '2026-01-15' },
]

const currencyLabels: Record<string, string> = {
  USD: 'US Dollar',
  GBP: 'British Pound',
  EUR: 'Euro',
}

const currencyColors: Record<string, string> = {
  USD: 'border-l-blue-500',
  GBP: 'border-l-purple-500',
  EUR: 'border-l-emerald-500',
}

function CopyButton({ text, label }: { text: string; label: string }) {
  const [copied, setCopied] = useState(false)

  const handleCopy = async () => {
    await navigator.clipboard.writeText(text)
    setCopied(true)
    toast.success(`${label} copied to clipboard`)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <Button variant="ghost" size="icon-xs" onClick={handleCopy}>
      {copied ? <Check className="size-3 text-emerald-600" /> : <Copy className="size-3" />}
    </Button>
  )
}

function AccountField({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between py-2">
      <div>
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="text-sm font-medium font-mono">{value}</p>
      </div>
      <CopyButton text={value} label={label} />
    </div>
  )
}

function getAccountDetails(account: VirtualAccount) {
  const details: { label: string; value: string }[] = [
    { label: 'Account Name', value: account.account_name },
    { label: 'Account Number', value: account.account_number },
    { label: 'Bank Name', value: account.bank_name },
  ]

  if (account.routing_number) {
    details.push({ label: 'Routing Number (ACH)', value: account.routing_number })
  }
  if (account.sort_code) {
    details.push({ label: 'Sort Code', value: account.sort_code })
  }
  if (account.iban) {
    details.push({ label: 'IBAN', value: account.iban })
  }
  if (account.swift_code) {
    details.push({ label: 'SWIFT/BIC Code', value: account.swift_code })
  }

  return details
}

function shareAllDetails(account: VirtualAccount) {
  const details = getAccountDetails(account)
  const text = details.map((d) => `${d.label}: ${d.value}`).join('\n')
  const fullText = `${currencyLabels[account.currency]} Account Details\n\n${text}`
  navigator.clipboard.writeText(fullText)
  toast.success('All account details copied to clipboard')
}

export default function AccountsPage() {
  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm text-muted-foreground">
          Share these details with your clients to receive payments directly into your Frenz Pay wallets.
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-2 xl:grid-cols-3">
        {mockAccounts.map((account) => {
          const details = getAccountDetails(account)
          return (
            <Card key={account.id} className={`border-l-4 ${currencyColors[account.currency]}`}>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <span className="text-3xl">{getCurrencyFlag(account.currency)}</span>
                    <div>
                      <CardTitle className="text-base">{currencyLabels[account.currency]}</CardTitle>
                      <p className="text-xs text-muted-foreground">{account.currency} Account</p>
                    </div>
                  </div>
                  <Badge variant={account.status === 'active' ? 'default' : 'destructive'}>
                    {account.status}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-0">
                <div className="divide-y">
                  {details.map((detail) => (
                    <AccountField
                      key={detail.label}
                      label={detail.label}
                      value={detail.value}
                    />
                  ))}
                </div>
                <Separator className="my-3" />
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full"
                  onClick={() => shareAllDetails(account)}
                >
                  <Share2 className="size-4 mr-1.5" />
                  Share All Details
                </Button>
              </CardContent>
            </Card>
          )
        })}
      </div>

      {/* How to receive payments */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Info className="size-4 text-muted-foreground" />
            <CardTitle>How to Receive Payments</CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid gap-6 md:grid-cols-3">
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <span className="text-lg">{getCurrencyFlag('USD')}</span>
                <h4 className="font-medium">USD (Wire/ACH)</h4>
              </div>
              <ol className="list-decimal list-inside space-y-1.5 text-sm text-muted-foreground">
                <li>Share your Account Number and Routing Number with your client</li>
                <li>They initiate a domestic wire or ACH transfer</li>
                <li>Funds arrive within 1-3 business days</li>
                <li>For international transfers, also share the SWIFT code</li>
              </ol>
            </div>
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <span className="text-lg">{getCurrencyFlag('GBP')}</span>
                <h4 className="font-medium">GBP (Faster Payments)</h4>
              </div>
              <ol className="list-decimal list-inside space-y-1.5 text-sm text-muted-foreground">
                <li>Share your Account Number and Sort Code with your client</li>
                <li>They send via Faster Payments or BACS</li>
                <li>Funds typically arrive within minutes (Faster Payments)</li>
                <li>For international transfers, share the IBAN and SWIFT code</li>
              </ol>
            </div>
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <span className="text-lg">{getCurrencyFlag('EUR')}</span>
                <h4 className="font-medium">EUR (SEPA)</h4>
              </div>
              <ol className="list-decimal list-inside space-y-1.5 text-sm text-muted-foreground">
                <li>Share your IBAN and SWIFT/BIC code with your client</li>
                <li>They initiate a SEPA transfer from any EU bank</li>
                <li>Funds arrive within 1-2 business days</li>
                <li>SEPA Instant transfers arrive within seconds</li>
              </ol>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
