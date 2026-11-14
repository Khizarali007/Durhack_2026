// Learning-layer number formats, delegating to Person 3's src/utils/format.ts
// so money and percentages look the same on every screen.
import { formatPct as pct, formatPnl, formatPrice as price } from '../utils/format'

/** Mission countdown: "0:42", or "--:--" before a mission starts. */
export function formatCountdown(seconds: number | null | undefined): string {
  if (seconds == null) return '--:--'
  const s = Math.max(0, Math.ceil(seconds))
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

export function formatPrice(x: number | null | undefined): string {
  return price(x)
}

/** "+776.60 HOOP" / "-12.00 HOOP" */
export function formatHoop(x: number): string {
  return `${formatPnl(x)} HOOP`
}

/** "+16.2%" */
export function formatPct(x: number | null | undefined, digits = 1): string {
  return x == null ? '—' : pct(x, digits)
}
