'use client'

/**
 * /dashboard/reports
 *
 * "Reports & Statements" landing modelled on Grey's design — three
 * action cards: Proof of account, Statement of account, and Expense
 * insights (coming soon).
 *
 * Proof of account and Statement use the existing /api/accounts/* and
 * /api/transactions endpoints to assemble a downloadable PDF. The
 * customer picks date range / currency in a dialog, the server
 * generates the document, and we hand back a blob. (Both endpoints
 * to-be-built in a follow-up — for now both buttons render a friendly
 * "We'll email it to you within a few minutes" toast and queue a
 * server-side job, kept inline so this page is shippable today.)
 */

import { useState } from 'react'
import { toast } from 'sonner'
import {
  BarChart2, FileText, Loader2, Receipt, Sparkles,
} from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { Input } from '@/components/ui/input'
import { useMe } from '@/hooks/use-me'

const RANGES = [
  { value: '30',  label: 'Last 30 days' },
  { value: '90',  label: 'Last 90 days' },
  { value: '180', label: 'Last 6 months' },
  { value: '365', label: 'Last 12 months' },
  { value: 'custom', label: 'Custom range' },
]
const CURRENCIES = ['ALL', 'USD', 'NGN', 'EUR', 'USDC']

export default function ReportsPage() {
  const { me } = useMe()

  const [proofOpen, setProofOpen] = useState(false)
  const [proofCurrency, setProofCurrency] = useState('USD')
  const [proofRequesting, setProofRequesting] = useState(false)

  const [stmtOpen, setStmtOpen] = useState(false)
  const [stmtCurrency, setStmtCurrency] = useState('ALL')
  const [stmtRange, setStmtRange] = useState('30')
  const [stmtFromDate, setStmtFromDate] = useState('')
  const [stmtToDate, setStmtToDate] = useState('')
  const [stmtRequesting, setStmtRequesting] = useState(false)

  async function requestProof() {
    setProofRequesting(true)
    try {
      const res = await fetch('/api/reports/proof-of-account', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ currency: proofCurrency }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(json.error ?? `Failed (${res.status})`)
      toast.success(`Proof of account queued — we'll email it to ${me?.email ?? 'you'} shortly.`)
      setProofOpen(false)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to request')
    } finally {
      setProofRequesting(false)
    }
  }

  async function requestStatement() {
    if (stmtRange === 'custom' && (!stmtFromDate || !stmtToDate)) {
      toast.error('Pick a from and to date.')
      return
    }
    setStmtRequesting(true)
    try {
      const res = await fetch('/api/reports/statement', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          currency: stmtCurrency,
          range: stmtRange,
          fromDate: stmtRange === 'custom' ? stmtFromDate : null,
          toDate: stmtRange === 'custom' ? stmtToDate : null,
        }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(json.error ?? `Failed (${res.status})`)
      toast.success(`Statement queued — we'll email it to ${me?.email ?? 'you'} shortly.`)
      setStmtOpen(false)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to request')
    } finally {
      setStmtRequesting(false)
    }
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Reports &amp; Statements</h1>
        <p className="text-muted-foreground text-sm">Documents proving the activity on your Frenz Pay accounts.</p>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        {/* Proof of account */}
        <button
          onClick={() => setProofOpen(true)}
          className="text-left group rounded-2xl border bg-card p-5 transition-all hover:border-primary hover:shadow-md focus-visible:border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
        >
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-100 text-indigo-700 dark:bg-indigo-500/15 dark:text-indigo-400">
            <Receipt className="size-5" />
          </div>
          <p className="mt-3 font-semibold">Proof of account</p>
          <p className="mt-1 text-xs text-muted-foreground leading-relaxed">
            Verify your account ownership with a document from Frenz Pay confirming it&rsquo;s yours.
          </p>
        </button>

        {/* Statement of account */}
        <button
          onClick={() => setStmtOpen(true)}
          className="text-left group rounded-2xl border bg-card p-5 transition-all hover:border-primary hover:shadow-md focus-visible:border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
        >
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400">
            <FileText className="size-5" />
          </div>
          <p className="mt-3 font-semibold">Statement of account</p>
          <p className="mt-1 text-xs text-muted-foreground leading-relaxed">
            View and track your transactions across all your accounts.
          </p>
        </button>

        {/* Expense Insights — coming soon */}
        <div className="relative rounded-2xl border bg-muted/40 p-5 opacity-80 cursor-not-allowed">
          <Badge variant="secondary" className="absolute right-3 top-3 text-[10px] uppercase tracking-wider">Coming soon</Badge>
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-violet-100 text-violet-700 dark:bg-violet-500/15 dark:text-violet-400">
            <BarChart2 className="size-5" />
          </div>
          <p className="mt-3 font-semibold text-muted-foreground">Expense insights</p>
          <p className="mt-1 text-xs text-muted-foreground leading-relaxed">
            See your inflow and outflow patterns across all your wallets.
          </p>
        </div>
      </div>

      {/* Proof of account dialog */}
      <Dialog open={proofOpen} onOpenChange={setProofOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Request proof of account</DialogTitle>
            <DialogDescription>
              We&rsquo;ll generate a one-page document confirming you hold the selected account, and email it to {me?.email ?? 'you'}.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>Currency</Label>
              <Select value={proofCurrency} onValueChange={setProofCurrency}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {CURRENCIES.filter((c) => c !== 'ALL').map((c) => (
                    <SelectItem key={c} value={c}>{c}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setProofOpen(false)} disabled={proofRequesting}>Cancel</Button>
            <Button onClick={requestProof} disabled={proofRequesting}>
              {proofRequesting && <Loader2 className="size-4 mr-2 animate-spin" />}
              Email me the document
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Statement dialog */}
      <Dialog open={stmtOpen} onOpenChange={setStmtOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Request statement of account</DialogTitle>
            <DialogDescription>
              We&rsquo;ll generate a PDF of your transactions for the period below and email it to {me?.email ?? 'you'}.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>Currency</Label>
              <Select value={stmtCurrency} onValueChange={setStmtCurrency}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {CURRENCIES.map((c) => (
                    <SelectItem key={c} value={c}>{c === 'ALL' ? 'All currencies' : c}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Period</Label>
              <Select value={stmtRange} onValueChange={setStmtRange}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {RANGES.map((r) => (
                    <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {stmtRange === 'custom' && (
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="from">From</Label>
                  <Input id="from" type="date" value={stmtFromDate} onChange={(e) => setStmtFromDate(e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="to">To</Label>
                  <Input id="to" type="date" value={stmtToDate} onChange={(e) => setStmtToDate(e.target.value)} />
                </div>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setStmtOpen(false)} disabled={stmtRequesting}>Cancel</Button>
            <Button onClick={requestStatement} disabled={stmtRequesting}>
              {stmtRequesting && <Loader2 className="size-4 mr-2 animate-spin" />}
              Email me the statement
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <div className="rounded-lg border border-blue-200 bg-blue-50/60 dark:border-blue-900 dark:bg-blue-950/20 p-4 flex items-start gap-3">
        <Sparkles className="size-4 mt-0.5 text-blue-600 dark:text-blue-400" />
        <p className="text-sm text-blue-900 dark:text-blue-200 leading-relaxed">
          Generated documents are stamped with your verified KYC name and a one-time verification code that anyone with the document can confirm at <span className="font-mono">frenzpay.co/verify</span>.
        </p>
      </div>
    </div>
  )
}
