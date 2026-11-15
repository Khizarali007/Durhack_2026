export const MAX_QTY = 10_000

/** A whole number of shares from 1 to 10,000, or null if the text is anything else. */
export function parseQty(text: string): number | null {
  if (!/^\d+$/.test(text.trim())) return null
  const n = Number(text.trim())
  return Number.isInteger(n) && n >= 1 && n <= MAX_QTY ? n : null
}

/** A positive price with at most 2 decimals, or null. */
export function parsePrice(text: string): number | null {
  if (!/^\d+(\.\d{1,2})?$/.test(text.trim())) return null
  const n = Number(text.trim())
  return Number.isFinite(n) && n > 0 ? n : null
}
