// Number formatting for the learning components.
// Person 3 plans one shared money/percent helper for the app; when it lands
// in src/utils/, these should become thin wrappers around it.

const MINUS = '−'

export function formatClock(seconds: number | null | undefined): string {
  if (seconds == null) return '--:--'
  const s = Math.max(0, Math.ceil(seconds))
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

export function formatPrice(x: number | null | undefined): string {
  if (x == null) return '-'
  return x.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function sign(x: number): string {
  return x > 0 ? '+' : x < 0 ? MINUS : ''
}

/** "+776.60 HOOP" / "−12.00 HOOP" */
export function formatHoop(x: number): string {
  return `${sign(x)}${formatPrice(Math.abs(x))} HOOP`
}

/** "+16.2%" / "−3.0%" */
export function formatPct(x: number | null | undefined, digits = 1): string {
  if (x == null) return '-'
  return `${sign(x)}${Math.abs(x).toFixed(digits)}%`
}
