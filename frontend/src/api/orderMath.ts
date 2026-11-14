import type { OpenOrder, Timeframe } from './types'

/** Fee rate agreed by the team: 0.10% of notional. */
export const FEE_RATE = 0.001

export const TIMEFRAME_SECONDS: Record<Timeframe, number> = {
  '1m': 60, '5m': 300, '1h': 3600, '1d': 86400,
}

/** Start of the candle bucket that market time `t` falls in. */
export function candleBucket(t: number, timeframe: Timeframe): number {
  const size = TIMEFRAME_SECONDS[timeframe]
  return Math.floor(t / size) * size
}

/**
 * Cash tied up in pending orders: every open limit buy holds back
 * remaining qty x limit price, plus the fee. Sell and stop orders hold shares, not cash.
 */
export function reservedCash(orders: OpenOrder[], excludeOrderId?: string): number {
  let total = 0
  for (const o of orders) {
    if (o.status !== 'open' || o.side !== 'buy' || o.type !== 'limit') continue
    if (o.order_id === excludeOrderId) continue
    total += (o.qty - o.filled_qty) * o.price * (1 + FEE_RATE)
  }
  return total
}
