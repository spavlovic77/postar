export function formatDate(date: Date | string): string {
  const d = new Date(date)
  return d.toLocaleDateString("sk-SK", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  })
}

export function formatNumber(value: number, decimals = 2): string {
  return value.toLocaleString("sk-SK", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })
}

export function formatCurrency(value: number): string {
  return value.toLocaleString("sk-SK", {
    style: "currency",
    currency: "EUR",
  })
}
