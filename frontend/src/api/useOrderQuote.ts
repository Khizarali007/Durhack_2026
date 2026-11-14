import { useEffect, useState } from 'react'
import type { OrderQuote, OrderSide, Quote } from './types'
import { ApiError } from './types'
import { getOrderQuote, errorDetail } from './rest'
import { getCachedQuote } from './useMarketStream'
import { onAccountChanged } from './accountSignal'
import { FEE_RATE } from './orderMath'

export interface OrderEstimate {
  quote: OrderQuote | null
  /** True when the quote endpoint is missing and this is only best price x quantity. */
  approximate: boolean
  error: string | null
  loading: boolean
}

const REFRESH_MS = 1000

/** Best-price estimate for when POST /orders/quote does not exist yet. It cannot see slippage. */
function roughEstimate(q: Quote | undefined, symbol: string, side: OrderSide, qty: number, leverage: number): OrderQuote | null {
  if (!q) return null
  const buying = side === 'buy' || side === 'cover'
  const opening = side === 'buy' || side === 'short'
  const best = buying ? q.ask : q.bid
  const mid = q.bid !== null && q.ask !== null ? (q.bid + q.ask) / 2 : null
  const lev = opening ? leverage : 1
  const notional = best === null ? 0 : best * qty
  const fee = Math.round(notional * FEE_RATE * 100) / 100
  return {
    symbol, side, qty, leverage: lev,
    fillable_qty: best === null ? 0 : qty,
    best_price: best, mid, est_avg_price: best, notional,
    spread_cost: best !== null && mid !== null ? Math.abs(best - mid) * qty : 0,
    slippage: 0, fee,
    total: buying ? notional + fee : notional - fee,
    margin_required: opening ? notional / lev : 0,
    cash_short: false,
    makers_short: best === null,
  }
}

interface State { key: string; quote: OrderQuote | null; approximate: boolean; error: string | null }

/**
 * Live estimate for the order on the ticket. Re-asked once a second (prices
 * move) and straight after any trade. Pass `qty: null` while the input is invalid.
 */
export function useOrderQuote(symbol: string, side: OrderSide, qty: number | null, leverage: 1 | 3 = 1): OrderEstimate {
  const key = qty === null ? '' : `${symbol}|${side}|${qty}|${leverage}`
  const [state, setState] = useState<State>({ key: '', quote: null, approximate: false, error: null })

  useEffect(() => {
    if (qty === null) return
    let alive = true
    const current = `${symbol}|${side}|${qty}|${leverage}`

    const run = () => {
      getOrderQuote(symbol, side, qty, leverage)
        .then(quote => { if (alive) setState({ key: current, quote, approximate: false, error: null }) })
        .catch((err: unknown) => {
          if (!alive) return
          const missing = !(err instanceof ApiError) || err.status === 404 || err.status === 405 || err.status === 501
          if (missing) {
            setState({ key: current, quote: roughEstimate(getCachedQuote(symbol), symbol, side, qty, leverage), approximate: true, error: null })
          } else {
            setState({ key: current, quote: null, approximate: false, error: errorDetail(err) })
          }
        })
    }

    run()
    const id = setInterval(run, REFRESH_MS)
    const off = onAccountChanged(run)
    return () => { alive = false; clearInterval(id); off() }
  }, [symbol, side, qty, leverage])

  if (qty === null) return { quote: null, approximate: false, error: null, loading: false }
  if (state.key !== key) return { quote: null, approximate: false, error: null, loading: true }
  return { quote: state.quote, approximate: state.approximate, error: state.error, loading: false }
}
