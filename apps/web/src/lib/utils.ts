import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatCurrency(amount: number, currency: string = 'USD'): string {
  const symbols: Record<string, string> = {
    USD: '$',
    GBP: '\u00a3',
    EUR: '\u20ac',
    NGN: '\u20a6',
  }
  const symbol = symbols[currency] || currency
  return `${symbol}${amount.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`
}

export function formatDate(dateString: string): string {
  return new Date(dateString).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })
}

export function formatDateTime(dateString: string): string {
  return new Date(dateString).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function truncateAddress(address: string): string {
  if (address.length <= 12) return address
  return `${address.slice(0, 6)}...${address.slice(-6)}`
}

export function generateReferralCode(): string {
  return 'FRZ' + Math.random().toString(36).substring(2, 8).toUpperCase()
}

export function maskAccountNumber(accountNumber: string): string {
  if (accountNumber.length <= 4) return accountNumber
  return '****' + accountNumber.slice(-4)
}

export function getCurrencyFlag(currency: string): string {
  const flags: Record<string, string> = {
    USD: '\ud83c\uddfa\ud83c\uddf8',
    GBP: '\ud83c\uddec\ud83c\udde7',
    EUR: '\ud83c\uddea\ud83c\uddfa',
    NGN: '\ud83c\uddf3\ud83c\uddec',
  }
  return flags[currency] || '\ud83c\udf0d'
}
