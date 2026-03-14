'use client'

import { useState } from 'react'
import {
  ArrowRight,
  ArrowLeft,
  Wallet,
  AlertTriangle,
  Check,
  Copy,
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import type { Currency, USDTNetwork } from '@/types'
import { formatCurrency, formatDate, truncateAddress, cn } from '@/lib/utils'
import { USDT_NETWORKS, FEE_STRUCTURE } from '@/lib/constants'
import { toast } from 'sonner'

const mockWallets = [
  { id: '1', currency: 'USD' as Currency, balance: 5420.50, available_balance: 5420.50 },
  { id: '2', currency: 'GBP' as Currency, balance: 1230.75, available_balance: 1230.75 },
  { id: '3', currency: 'EUR' as Currency, balance: 890.00, available_balance: 890.00 },
]

const mockWithdrawals = [
  { id: '1', amount: 1000, currency: 'USD', usdt_amount: 985, network: 'trc20' as USDTNetwork, wallet_address: 'TN7hS5xHjKdR3YVx9mptGCHBFP7mJLhz2e', status: 'completed', created_at: '2026-03-12', tx_hash: 'abc123def456' },
  { id: '2', amount: 500, currency: 'USD', usdt_amount: 490.5, network: 'erc20' as USDTNetwork, wallet_address: '0x742d35Cc6634C0532925a3b844Bc9e7595f2bD38', status: 'processing', created_at: '2026-03-13', tx_hash: null },
  { id: '3', amount: 200, currency: 'GBP', usdt_amount: 247.5, network: 'trc20' as USDTNetwork, wallet_address: 'TN7hS5xHjKdR3YVx9mptGCHBFP7mJLhz2e', status: 'pending', created_at: '2026-03-14', tx_hash: null },
  { id: '4', amount: 1500, currency: 'EUR', usdt_amount: 1580.25, network: 'erc20' as USDTNetwork, wallet_address: '0x9A8f2c6B3D4e5F1a7b8C9d0E1F2a3B4c5D6e7F8a', status: 'completed', created_at: '2026-03-10', tx_hash: 'def789ghi012' },
  { id: '5', amount: 300, currency: 'USD', usdt_amount: 293.5, network: 'trc20' as USDTNetwork, wallet_address: 'TPj3sVo4Dv4pBPQvqGkNqAQz5bKHx5Qj6W', status: 'failed', created_at: '2026-03-08', tx_hash: null },
]

const statusVariant: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> = {
  completed: 'default',
  processing: 'secondary',
  pending: 'outline',
  failed: 'destructive',
}

const currencyFlags: Record<string, string> = {
  USD: '\ud83c\uddfa\ud83c\uddf8',
  GBP: '\ud83c\uddec\ud83c\udde7',
  EUR: '\ud83c\uddea\ud83c\uddfa',
}

const exchangeRates: Record<string, number> = {
  USD: 1.0,
  GBP: 1.27,
  EUR: 1.08,
}

export default function WithdrawPage() {
  const [step, setStep] = useState(1)
  const [selectedWallet, setSelectedWallet] = useState<(typeof mockWallets)[0] | null>(null)
  const [amount, setAmount] = useState('')
  const [network, setNetwork] = useState<USDTNetwork>('trc20')
  const [walletAddress, setWalletAddress] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isComplete, setIsComplete] = useState(false)
  const [copiedTx, setCopiedTx] = useState<string | null>(null)

  const selectedNetwork = USDT_NETWORKS.find((n) => n.id === network)!
  const numAmount = parseFloat(amount) || 0
  const usdEquivalent = numAmount * (selectedWallet ? exchangeRates[selectedWallet.currency] : 1)
  const percentageFee = usdEquivalent * (FEE_STRUCTURE.usdt_withdrawal_percentage / 100)
  const networkFee = selectedNetwork.fee
  const totalFee = percentageFee + networkFee
  const youReceive = Math.max(0, usdEquivalent - totalFee)

  const isValidAddress = (addr: string) => {
    if (network === 'trc20') return /^T[a-zA-Z0-9]{33}$/.test(addr)
    if (network === 'erc20') return /^0x[a-fA-F0-9]{40}$/.test(addr)
    return false
  }

  const canProceedStep2 =
    numAmount >= FEE_STRUCTURE.minimum_withdrawal &&
    selectedWallet != null &&
    numAmount <= selectedWallet.available_balance

  const canProceedStep3 = walletAddress.length > 0 && isValidAddress(walletAddress)

  const handleSubmit = () => {
    setIsSubmitting(true)
    setTimeout(() => {
      setIsSubmitting(false)
      setIsComplete(true)
      toast.success('Withdrawal submitted successfully')
    }, 2000)
  }

  const handleReset = () => {
    setStep(1)
    setSelectedWallet(null)
    setAmount('')
    setNetwork('trc20')
    setWalletAddress('')
    setIsComplete(false)
  }

  const handleCopyTxHash = async (hash: string) => {
    await navigator.clipboard.writeText(hash)
    setCopiedTx(hash)
    toast.success('Transaction hash copied')
    setTimeout(() => setCopiedTx(null), 2000)
  }

  return (
    <div className="space-y-6">
      {/* Withdrawal Form */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Wallet className="size-5" />
                New Withdrawal
              </CardTitle>
              <p className="text-sm text-muted-foreground mt-1">
                Convert your balance to USDT and withdraw to your wallet
              </p>
            </div>
            {!isComplete && step > 1 && (
              <div className="flex items-center gap-1 text-xs text-muted-foreground">
                Step {step} of 4
              </div>
            )}
          </div>
          {!isComplete && (
            <div className="flex gap-1 mt-3">
              {[1, 2, 3, 4].map((s) => (
                <div
                  key={s}
                  className={cn(
                    'h-1 flex-1 rounded-full transition-colors',
                    s <= step ? 'bg-primary' : 'bg-muted'
                  )}
                />
              ))}
            </div>
          )}
        </CardHeader>
        <CardContent>
          {isComplete ? (
            <div className="flex flex-col items-center py-8 text-center">
              <div className="flex size-16 items-center justify-center rounded-full bg-emerald-100 dark:bg-emerald-950 mb-4">
                <Check className="size-8 text-emerald-600" />
              </div>
              <h3 className="text-lg font-semibold">Withdrawal Submitted!</h3>
              <p className="text-sm text-muted-foreground mt-1 max-w-md">
                Your withdrawal of{' '}
                {formatCurrency(numAmount, selectedWallet?.currency || 'USD')} is being
                processed. You will receive approximately {youReceive.toFixed(2)} USDT.
              </p>
              <div className="mt-4 rounded-lg bg-muted p-3 text-xs font-mono text-muted-foreground">
                Reference: WDR-{Date.now().toString().slice(-8)}
              </div>
              <Button className="mt-6" onClick={handleReset}>
                Make Another Withdrawal
              </Button>
            </div>
          ) : (
            <>
              {/* Step 1: Select Source Wallet */}
              {step === 1 && (
                <div className="space-y-4">
                  <h3 className="text-sm font-medium">Select source wallet</h3>
                  <div className="grid gap-3 sm:grid-cols-3">
                    {mockWallets.map((wallet) => (
                      <button
                        key={wallet.id}
                        onClick={() => {
                          setSelectedWallet(wallet)
                          setStep(2)
                        }}
                        className={cn(
                          'flex flex-col items-start gap-2 rounded-lg border p-4 text-left transition-all hover:border-primary/50 hover:shadow-sm',
                          selectedWallet?.id === wallet.id && 'border-primary bg-primary/5'
                        )}
                      >
                        <div className="flex items-center gap-2">
                          <span className="text-xl">{currencyFlags[wallet.currency]}</span>
                          <span className="text-sm font-medium">{wallet.currency}</span>
                        </div>
                        <p className="text-2xl font-bold">
                          {formatCurrency(wallet.available_balance, wallet.currency)}
                        </p>
                        <p className="text-xs text-muted-foreground">Available balance</p>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Step 2: Amount & Network */}
              {step === 2 && selectedWallet && (
                <div className="space-y-6">
                  <div className="space-y-3">
                    <Label htmlFor="amount">
                      Amount to withdraw ({selectedWallet.currency})
                    </Label>
                    <Input
                      id="amount"
                      type="number"
                      placeholder={`Min ${FEE_STRUCTURE.minimum_withdrawal} ${selectedWallet.currency}`}
                      value={amount}
                      onChange={(e) => setAmount(e.target.value)}
                      min={FEE_STRUCTURE.minimum_withdrawal}
                      max={selectedWallet.available_balance}
                    />
                    <div className="flex items-center justify-between text-xs text-muted-foreground">
                      <span>
                        Available:{' '}
                        {formatCurrency(
                          selectedWallet.available_balance,
                          selectedWallet.currency
                        )}
                      </span>
                      <button
                        className="text-primary font-medium hover:underline"
                        onClick={() =>
                          setAmount(selectedWallet.available_balance.toString())
                        }
                      >
                        Withdraw all
                      </button>
                    </div>
                  </div>

                  <div className="space-y-3">
                    <Label>Select network</Label>
                    <Select
                      value={network}
                      onValueChange={(val) => setNetwork(val as USDTNetwork)}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select network" />
                      </SelectTrigger>
                      <SelectContent>
                        {USDT_NETWORKS.map((net) => (
                          <SelectItem key={net.id} value={net.id}>
                            <div className="flex items-center gap-2">
                              <span>{net.name}</span>
                              <Badge variant="secondary" className="text-[10px]">
                                ${net.fee} fee
                              </Badge>
                              {net.id === 'trc20' && (
                                <Badge variant="outline" className="text-[10px] text-emerald-600 border-emerald-300">
                                  Recommended
                                </Badge>
                              )}
                            </div>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <div className="grid gap-3 sm:grid-cols-2">
                      {USDT_NETWORKS.map((net) => (
                        <button
                          key={net.id}
                          onClick={() => setNetwork(net.id as USDTNetwork)}
                          className={cn(
                            'flex items-start gap-3 rounded-lg border p-4 text-left transition-all hover:border-primary/50',
                            network === net.id && 'border-primary bg-primary/5'
                          )}
                        >
                          <div className="flex-1">
                            <p className="text-sm font-medium">{net.name}</p>
                            <p className="text-xs text-muted-foreground">
                              {net.description}
                            </p>
                          </div>
                          <Badge variant="secondary">${net.fee} fee</Badge>
                        </button>
                      ))}
                    </div>
                  </div>

                  {numAmount > 0 && (
                    <div className="rounded-lg bg-muted/50 p-4 space-y-2">
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">Amount</span>
                        <span>
                          {formatCurrency(numAmount, selectedWallet.currency)}
                        </span>
                      </div>
                      {selectedWallet.currency !== 'USD' && (
                        <div className="flex justify-between text-sm">
                          <span className="text-muted-foreground">
                            USD equivalent
                          </span>
                          <span>{formatCurrency(usdEquivalent, 'USD')}</span>
                        </div>
                      )}
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">
                          Platform fee ({FEE_STRUCTURE.usdt_withdrawal_percentage}%)
                        </span>
                        <span>-{formatCurrency(percentageFee, 'USD')}</span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">Network fee</span>
                        <span>-${networkFee.toFixed(2)}</span>
                      </div>
                      <Separator />
                      <div className="flex justify-between text-sm font-semibold">
                        <span>You receive (USDT)</span>
                        <span className="text-emerald-600">
                          {youReceive.toFixed(2)} USDT
                        </span>
                      </div>
                    </div>
                  )}

                  <div className="flex gap-3">
                    <Button variant="outline" onClick={() => setStep(1)}>
                      <ArrowLeft className="size-4 mr-1.5" /> Back
                    </Button>
                    <Button
                      className="flex-1"
                      disabled={!canProceedStep2}
                      onClick={() => setStep(3)}
                    >
                      Continue <ArrowRight className="size-4 ml-1.5" />
                    </Button>
                  </div>
                </div>
              )}

              {/* Step 3: Wallet Address */}
              {step === 3 && (
                <div className="space-y-6">
                  <div className="space-y-3">
                    <Label htmlFor="wallet-address">
                      USDT wallet address (
                      {network === 'trc20' ? 'TRC-20' : 'ERC-20'})
                    </Label>
                    <Input
                      id="wallet-address"
                      placeholder={network === 'trc20' ? 'T...' : '0x...'}
                      value={walletAddress}
                      onChange={(e) => setWalletAddress(e.target.value)}
                      className="font-mono"
                    />
                    {walletAddress && !isValidAddress(walletAddress) && (
                      <p className="text-xs text-destructive flex items-center gap-1">
                        <AlertTriangle className="size-3" />
                        {network === 'trc20'
                          ? 'TRC-20 address must start with T and be 34 characters'
                          : 'ERC-20 address must start with 0x and be 42 characters'}
                      </p>
                    )}
                    {walletAddress && isValidAddress(walletAddress) && (
                      <p className="text-xs text-emerald-600 flex items-center gap-1">
                        <Check className="size-3" />
                        Valid {network === 'trc20' ? 'TRC-20' : 'ERC-20'} address
                      </p>
                    )}
                  </div>

                  <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 dark:border-amber-900 dark:bg-amber-950/50">
                    <AlertTriangle className="size-4 text-amber-600 shrink-0 mt-0.5" />
                    <div className="text-xs text-amber-800 dark:text-amber-200">
                      <p className="font-medium">Important</p>
                      <p className="mt-0.5">
                        Make sure the wallet address is on the{' '}
                        <strong>
                          {network === 'trc20'
                            ? 'Tron (TRC-20)'
                            : 'Ethereum (ERC-20)'}
                        </strong>{' '}
                        network. Sending to the wrong network will result in
                        permanent loss of funds.
                      </p>
                    </div>
                  </div>

                  <div className="flex gap-3">
                    <Button variant="outline" onClick={() => setStep(2)}>
                      <ArrowLeft className="size-4 mr-1.5" /> Back
                    </Button>
                    <Button
                      className="flex-1"
                      disabled={!canProceedStep3}
                      onClick={() => setStep(4)}
                    >
                      Continue <ArrowRight className="size-4 ml-1.5" />
                    </Button>
                  </div>
                </div>
              )}

              {/* Step 4: Review & Confirm */}
              {step === 4 && selectedWallet && (
                <div className="space-y-6">
                  <h3 className="text-sm font-medium">Review your withdrawal</h3>

                  <div className="rounded-lg border p-4 space-y-3">
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Source wallet</span>
                      <span className="font-medium">
                        {currencyFlags[selectedWallet.currency]}{' '}
                        {selectedWallet.currency}
                      </span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Amount</span>
                      <span className="font-medium">
                        {formatCurrency(numAmount, selectedWallet.currency)}
                      </span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Network</span>
                      <span className="font-medium">{selectedNetwork.name}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Total fees</span>
                      <span className="font-medium text-red-600">
                        -{formatCurrency(totalFee, 'USD')}
                      </span>
                    </div>
                    <Separator />
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">You receive</span>
                      <span className="font-semibold text-emerald-600">
                        {youReceive.toFixed(2)} USDT
                      </span>
                    </div>
                    <Separator />
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Wallet address</span>
                      <span className="font-mono text-xs">
                        {truncateAddress(walletAddress)}
                      </span>
                    </div>
                  </div>

                  <div className="flex gap-3">
                    <Button variant="outline" onClick={() => setStep(3)}>
                      <ArrowLeft className="size-4 mr-1.5" /> Back
                    </Button>
                    <Button
                      className="flex-1"
                      onClick={handleSubmit}
                      disabled={isSubmitting}
                    >
                      {isSubmitting ? 'Processing...' : 'Confirm Withdrawal'}
                    </Button>
                  </div>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>

      {/* Recent Withdrawals */}
      <Card>
        <CardHeader>
          <CardTitle>Recent Withdrawals</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Amount</TableHead>
                  <TableHead>USDT Received</TableHead>
                  <TableHead>Network</TableHead>
                  <TableHead>Wallet</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Tx Hash</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {mockWithdrawals.map((w) => (
                  <TableRow key={w.id}>
                    <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                      {formatDate(w.created_at)}
                    </TableCell>
                    <TableCell className="font-medium">
                      {formatCurrency(w.amount, w.currency)}
                    </TableCell>
                    <TableCell className="text-emerald-600 font-medium">
                      {w.usdt_amount.toFixed(2)} USDT
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary">
                        {w.network === 'trc20' ? 'TRC-20' : 'ERC-20'}
                      </Badge>
                    </TableCell>
                    <TableCell className="font-mono text-xs text-muted-foreground">
                      {truncateAddress(w.wallet_address)}
                    </TableCell>
                    <TableCell>
                      <Badge variant={statusVariant[w.status]}>{w.status}</Badge>
                    </TableCell>
                    <TableCell>
                      {w.tx_hash ? (
                        <button
                          onClick={() => handleCopyTxHash(w.tx_hash!)}
                          className="flex items-center gap-1 text-xs font-mono text-muted-foreground hover:text-foreground transition-colors"
                        >
                          {truncateAddress(w.tx_hash)}
                          {copiedTx === w.tx_hash ? (
                            <Check className="size-3 text-emerald-600" />
                          ) : (
                            <Copy className="size-3" />
                          )}
                        </button>
                      ) : (
                        <span className="text-xs text-muted-foreground">--</span>
                      )}
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
