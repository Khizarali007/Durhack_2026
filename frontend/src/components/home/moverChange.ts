import { getCachedQuote } from '../../api'
import type { Player } from '../../api'

/**
 * Change since the opening price, measured on the bid/ask midpoint. The last trade
 * bounces between bid and ask, which would reshuffle the top-movers list every tick.
 */
export function changePct(player: Player): number | null {
  const q = getCachedQuote(player.symbol)
  if (!q || player.start_price <= 0) return null
  const mid = q.bid !== null && q.ask !== null ? (q.bid + q.ask) / 2 : q.last
  return (mid - player.start_price) / player.start_price * 100
}
