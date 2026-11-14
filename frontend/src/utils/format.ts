export function formatHOOP(value: number, decimals = 2): string {
  return value.toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals })
}

const SEASON_START = 1729555200 // 2024-10-22 UTC

export function formatGameClock(t: number): string {
  const day = Math.max(1, Math.floor((t - SEASON_START) / 86400) + 1)
  const h = String(Math.floor((t % 86400) / 3600)).padStart(2, '0')
  const m = String(Math.floor((t % 3600) / 60)).padStart(2, '0')
  return `Day ${day} · ${h}:${m}`
}

export function formatPct(value: number, decimals = 1): string {
  return `${value >= 0 ? '+' : ''}${value.toFixed(decimals)}%`
}

export function formatPnl(value: number): string {
  return `${value >= 0 ? '+' : ''}${formatHOOP(value)}`
}
