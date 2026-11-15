import { toAccountingCurrency } from '../../../utils/currency'

export const MAX_QTY = 10_000

/** A whole number of shares from 1 to 10,000, or null if the text is anything else. */
export function parseQty(text: string): number | null {
  if (!/^\d+$/.test(text.trim())) return null
  const n = Number(text.trim())
  return Number.isInteger(n) && n >= 1 && n <= MAX_QTY ? n : null
}

/** Displayed H$ price -> API accounting units, preserving five decimal ticks. */
export function parsePrice(text: string): number | null {
  if (!/^\d+(\.\d{1,5})?$/.test(text.trim())) return null
  const n = Number(text.trim())
  return Number.isFinite(n) && n > 0 ? Math.round(toAccountingCurrency(n)*100)/100 : null
}
