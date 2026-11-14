import type { MarketEventKind } from './types'
import { useQuote } from './useQuote'
import { useMarketTime } from './useMarketTime'
import { useSymbolEvents, useWhistleLine } from './eventLog'

/** How long a headline keeps explaining the price: 30 market minutes. */
const REASON_WINDOW_S = 30 * 60

export interface MoveReason {
  text: string
  /** Where the explanation came from. `price` means it was derived from price vs fair value. */
  source: 'event' | 'whistle' | 'price'
  kind: MarketEventKind | null
  t: number | null
}

/**
 * "Why did it move?" for one stock: the latest event or final-whistle line from the
 * last 30 market minutes, otherwise a plain line about price against fair value.
 */
export function useMoveReason(symbol: string): MoveReason | null {
  const quote = useQuote(symbol)
  const events = useSymbolEvents(symbol)
  const whistle = useWhistleLine(symbol)
  const now = useMarketTime()

  const event = events.find(e => now - e.t <= REASON_WINDOW_S && e.t <= now) ?? null
  const recentWhistle = whistle !== null && now - whistle.t <= REASON_WINDOW_S && whistle.t <= now ? whistle : null

  if (event !== null && (recentWhistle === null || event.t >= recentWhistle.t)) {
    return { text: event.headline, source: 'event', kind: event.kind, t: event.t }
  }
  if (recentWhistle !== null) {
    return { text: `Final whistle: ${recentWhistle.line.headline}`, source: 'whistle', kind: null, t: recentWhistle.t }
  }
  if (quote === null || quote.fair_value <= 0) return null

  const gapPct = (quote.last - quote.fair_value) / quote.fair_value * 100
  const size = Math.abs(gapPct).toFixed(1)
  const text = Math.abs(gapPct) < 0.5
    ? 'Trading in line with fair value: quiet tape'
    : gapPct > 0
      ? `Trading ${size}% above fair value: hype`
      : `Trading ${size}% below fair value: out of favour`
  return { text, source: 'price', kind: null, t: null }
}
