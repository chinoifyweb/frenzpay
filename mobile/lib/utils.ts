export function formatCurrency(amount: number, currency: string = 'USD'): string {
  const symbols: Record<string, string> = { USD: '$', GBP: '\u00a3', EUR: '\u20ac' };
  return `${symbols[currency] || currency}${amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function formatDate(dateString: string): string {
  return new Date(dateString).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

export function truncateAddress(address: string): string {
  if (address.length <= 14) return address;
  return `${address.slice(0, 6)}...${address.slice(-6)}`;
}

export function getCurrencyFlag(currency: string): string {
  const flags: Record<string, string> = { USD: '\ud83c\uddfa\ud83c\uddf8', GBP: '\ud83c\uddec\ud83c\udde7', EUR: '\ud83c\uddea\ud83c\uddfa' };
  return flags[currency] || '\ud83c\udf0d';
}

export function getCurrencyColor(currency: string): string {
  const colors: Record<string, string> = {
    USD: '#1a73e8',
    GBP: '#7c3aed',
    EUR: '#f59e0b',
  };
  return colors[currency] || '#666';
}
