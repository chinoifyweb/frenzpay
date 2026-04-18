'use client'

import { useState } from 'react'
import {
  Copy,
  Users,
  DollarSign,
  Gift,
  Share2,
  Check,
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { formatCurrency, formatDate, cn } from '@/lib/utils'
import { APP_URL } from '@/lib/constants'
import { toast } from 'sonner'

const REFERRAL_CODE = 'FRZ-ADEK4N'
const SHARE_LINK = `${APP_URL}/signup?ref=${REFERRAL_CODE}`

const stats = [
  {
    label: 'Total Referrals',
    value: '12',
    icon: Users,
    color: 'text-blue-600',
    bg: 'bg-blue-100 dark:bg-blue-950',
  },
  {
    label: 'Earned',
    value: '$45.00',
    icon: DollarSign,
    color: 'text-emerald-600',
    bg: 'bg-emerald-100 dark:bg-emerald-950',
  },
  {
    label: 'Pending',
    value: '$10.00',
    icon: Gift,
    color: 'text-amber-600',
    bg: 'bg-amber-100 dark:bg-amber-950',
  },
]

const mockReferrals = [
  { id: '1', name: 'Ade***le', date: '2026-03-12', status: 'credited' as const, bonus: 5.00 },
  { id: '2', name: 'Chi***ma', date: '2026-03-10', status: 'credited' as const, bonus: 5.00 },
  { id: '3', name: 'Ola***de', date: '2026-03-08', status: 'pending' as const, bonus: 5.00 },
  { id: '4', name: 'Ife***wa', date: '2026-03-05', status: 'credited' as const, bonus: 5.00 },
  { id: '5', name: 'Kem***ju', date: '2026-03-01', status: 'pending' as const, bonus: 5.00 },
]

const statusVariant: Record<string, 'default' | 'outline'> = {
  credited: 'default',
  pending: 'outline',
}

export default function ReferralsPage() {
  const [copiedCode, setCopiedCode] = useState(false)
  const [copiedLink, setCopiedLink] = useState(false)

  const handleCopyCode = async () => {
    await navigator.clipboard.writeText(REFERRAL_CODE)
    setCopiedCode(true)
    toast.success('Referral code copied to clipboard')
    setTimeout(() => setCopiedCode(false), 2000)
  }

  const handleCopyLink = async () => {
    await navigator.clipboard.writeText(SHARE_LINK)
    setCopiedLink(true)
    toast.success('Referral link copied to clipboard')
    setTimeout(() => setCopiedLink(false), 2000)
  }

  const handleShareWhatsApp = () => {
    const message = encodeURIComponent(
      `Join Frenz Pay and get paid globally! Sign up with my referral link: ${SHARE_LINK}`
    )
    window.open(`https://wa.me/?text=${message}`, '_blank')
  }

  const handleShareTwitter = () => {
    const text = encodeURIComponent(
      `Get paid globally and withdraw in USDT or to your Naira bank account with @FrenzPay! Use my referral link to sign up:`
    )
    const url = encodeURIComponent(SHARE_LINK)
    window.open(`https://twitter.com/intent/tweet?text=${text}&url=${url}`, '_blank')
  }

  return (
    <div className="space-y-6">
      {/* Referral Code & Share Link */}
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Your Referral Code</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center gap-3">
              <div className="flex-1 rounded-lg border bg-muted/50 px-4 py-3">
                <p className="text-center text-xl font-bold font-mono tracking-widest">
                  {REFERRAL_CODE}
                </p>
              </div>
              <Button variant="outline" size="icon" onClick={handleCopyCode}>
                {copiedCode ? (
                  <Check className="size-4 text-emerald-600" />
                ) : (
                  <Copy className="size-4" />
                )}
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Share this code with friends. You both earn $5 when they complete
              their first transaction.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Share Link</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center gap-3">
              <div className="flex-1 rounded-lg border bg-muted/50 px-4 py-3 overflow-hidden">
                <p className="text-sm font-mono text-muted-foreground truncate">
                  {SHARE_LINK}
                </p>
              </div>
              <Button variant="outline" size="icon" onClick={handleCopyLink}>
                {copiedLink ? (
                  <Check className="size-4 text-emerald-600" />
                ) : (
                  <Copy className="size-4" />
                )}
              </Button>
            </div>

            <Separator />

            <div className="space-y-2">
              <p className="text-xs font-medium text-muted-foreground">Share via</p>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="flex-1"
                  onClick={handleShareWhatsApp}
                >
                  <svg
                    viewBox="0 0 24 24"
                    className="size-4 mr-1.5 fill-current"
                    xmlns="http://www.w3.org/2000/svg"
                  >
                    <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
                  </svg>
                  WhatsApp
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="flex-1"
                  onClick={handleShareTwitter}
                >
                  <svg
                    viewBox="0 0 24 24"
                    className="size-4 mr-1.5 fill-current"
                    xmlns="http://www.w3.org/2000/svg"
                  >
                    <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
                  </svg>
                  Twitter/X
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="flex-1"
                  onClick={handleCopyLink}
                >
                  <Share2 className="size-4 mr-1.5" />
                  Copy Link
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Stats Cards */}
      <div className="grid gap-4 sm:grid-cols-3">
        {stats.map((stat) => (
          <Card key={stat.label}>
            <CardContent className="flex items-center gap-4 py-5">
              <div
                className={cn(
                  'flex size-12 items-center justify-center rounded-full shrink-0',
                  stat.bg
                )}
              >
                <stat.icon className={cn('size-6', stat.color)} />
              </div>
              <div>
                <p className="text-2xl font-bold">{stat.value}</p>
                <p className="text-sm text-muted-foreground">{stat.label}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Referral History */}
      <Card>
        <CardHeader>
          <CardTitle>Referral History</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Bonus</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {mockReferrals.map((referral) => (
                  <TableRow key={referral.id}>
                    <TableCell className="font-medium">{referral.name}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {formatDate(referral.date)}
                    </TableCell>
                    <TableCell>
                      <Badge variant={statusVariant[referral.status]}>
                        {referral.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right font-medium text-emerald-600">
                      {formatCurrency(referral.bonus, 'USD')}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
