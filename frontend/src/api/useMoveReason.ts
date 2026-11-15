import type { MarketEventKind } from './types'
import { USE_MOCKS } from './config'
import { useQuote } from './useQuote'
import { useMarketTime } from './useMarketTime'
import { useSymbolEvents, useWhistleLine } from './eventLog'

/** How long a headline keeps explaining the price. The season replay runs a day a minute,
 *  so there it is one market day; the mock market keeps 30 market minutes. */
const REASON_WINDOW_S = USE_MOCKS ? 30 * 60 : 24 * 60 * 60

export interface MoveReason {
  text: string
  /** Where the explanation came from. `price` means it was derived from price vs the analyst estimate. */
  source: 'event' | 'whistle' | 'price'
  kind: MarketEventKind | null
  t: number | null
}

/**
 * "Why did it move?" for one stock: the latest event or final-whistle line from the
 * last 30 market minutes, otherwise a plain line about price against the analyst estimate.
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

  // The official injury report keeps explaining the price for as long as it stands.
  const status = quote.injury_status
  if (status === 'Out') {
    return { text: 'Storm: ruled out on the official injury report, so expected payouts fall', source: 'event', kind: 'injury', t: null }
  }
  if (status === 'Questionable' || status === 'Doubtful') {
    return { text: `Early warning: listed ${status.toLowerCase()} on the official injury report`, source: 'event', kind: 'early_warning', t: null }
  }

  const gapPct = ((quote.quoted_price ?? quote.last) - quote.fair_value) / quote.fair_value * 100
  const size = Math.abs(gapPct).toFixed(1)
  const text = Math.abs(gapPct) < 0.5
    ? 'Trading in line with the analyst estimate: quote near estimate'
    : gapPct > 0
      ? `Trading ${size}% above the analyst estimate: market premium`
      : `Trading ${size}% below the analyst estimate: market discount`
  return { text, source: 'price', kind: null, t: null }
}
