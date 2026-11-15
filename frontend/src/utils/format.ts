// One place for how money, percentages and times look, so every screen agrees.

const DASH = '—'

/** HOOP, the game's virtual currency, shown as H$1,234.56 (never real money). */
export function formatHOOP(value: number, decimals = 2): string {
  const n = Math.abs(value).toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals })
  return `${value < 0 ? '-' : ''}H$${n}`
}

/** A price to 2 dp, or a dash when there is no price (a maker with nothing to quote). Never 0. */
export function formatPrice(value: number | null | undefined): string {
  return value === null || value === undefined || !Number.isFinite(value) ? DASH : formatHOOP(value)
}

/** Whole shares with thousands separators. */
export function formatQty(value: number): string {
  return Math.round(value).toLocaleString('en-US')
}

const SEASON_START = 1729555200 // 2024-10-22 UTC

export function formatGameClock(t: number): string {
  const day = Math.max(1, Math.floor((t - SEASON_START) / 86400) + 1)
  return `Day ${day} · ${formatClock(t)}`
}

/** Market time of day, HH:MM. */
export function formatClock(t: number): string {
  const h = String(Math.floor((t % 86400) / 3600)).padStart(2, '0')
  const m = String(Math.floor((t % 3600) / 60)).padStart(2, '0')
  return `${h}:${m}`
}

export function formatPct(value: number, decimals = 1): string {
  return `${value >= 0 ? '+' : ''}${value.toFixed(decimals)}%`
}

export function formatPnl(value: number): string {
  return `${value >= 0 ? '+' : ''}${formatHOOP(value)}`
}

/** An arrow to sit next to a coloured number, so colour is never the only signal. */
export function trendArrow(value: number): string {
  return value > 0 ? '▲' : value < 0 ? '▼' : '•'
}

export type Trend = 'up' | 'down' | 'flat'
export function trendOf(value: number, deadband = 0): Trend {
  return value > deadband ? 'up' : value < -deadband ? 'down' : 'flat'
}

/** "0.6 s" from milliseconds. */
export function formatSeconds(ms: number): string {
  return `${(ms / 1000).toFixed(1)} s`
}
