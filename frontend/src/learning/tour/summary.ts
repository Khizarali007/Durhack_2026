import { getCachedQuote } from '../../api'
import { formatPrice } from '../format'
import type { TourContext, TutorialTrade } from './types'
import type { TutorialRun } from './store'

export interface TradeSummary {
  boughtQty: number
  avgBuy: number | null
  soldQty: number
  avgSell: number | null
  /** Sell proceeds minus the cost of the shares sold, fees included. Null until something is sold. */
  realised: number | null
  symbols: string[]
}

function avg(trades: TutorialTrade[]): number | null {
  const qty = trades.reduce((s, t) => s + t.qty, 0)
  return qty > 0 ? trades.reduce((s, t) => s + t.qty * t.price, 0) / qty : null
}

export function summariseTrades(trades: TutorialTrade[]): TradeSummary {
  const buys = trades.filter((t) => t.side === 'buy')
  const sells = trades.filter((t) => t.side === 'sell')
  const boughtQty = buys.reduce((s, t) => s + t.qty, 0)
  const soldQty = sells.reduce((s, t) => s + t.qty, 0)
  const avgBuy = avg(buys)
  const avgSell = avg(sells)
  let realised: number | null = null
  if (soldQty > 0 && avgBuy !== null && avgSell !== null) {
    const buyFeePerShare = buys.reduce((s, t) => s + t.fee, 0) / boughtQty
    const sellFees = sells.reduce((s, t) => s + t.fee, 0)
    realised = soldQty * (avgSell - avgBuy - buyFeePerShare) - sellFees
  }
  return {
    boughtQty,
    avgBuy,
    soldQty,
    avgSell,
    realised,
    symbols: [...new Set(trades.map((t) => t.symbol))],
  }
}

export function buildContext(run: TutorialRun | undefined, stepIndex: number): TourContext {
  const trades = run?.trades ?? []
  const events = run?.events ?? []
  const claim = run?.claimedBy[stepIndex]
  return {
    quote: (symbol) => getCachedQuote(symbol),
    trades,
    events,
    trade: claim ? trades.find((t) => t.trade_id === claim) : undefined,
    event: claim ? events.find((e) => e.key === claim) : undefined,
  }
}

/** Price for copy: "48.20", or "–" when there is no quote yet. */
export function p(x: number | null | undefined): string {
  return formatPrice(x ?? null)
}

/** Shares bought minus shares sold during the tutorial, as text for an input step. */
export function heldQty(ctx: TourContext, fallback = 5): string {
  const s = summariseTrades(ctx.trades)
  const held = s.boughtQty - s.soldQty
  return String(held > 0 ? held : fallback)
}
