import { FEE_RATE } from '../../../api'
import type { OrderQuote, Quote } from '../../../api'
import { formatHOOP, formatPrice, formatQty } from '../../../utils/format'

export type TicketMode = 'market' | 'limit' | 'stop' | 'short' | 'cover'

export interface TicketInput {
  signedIn: boolean
  accountLoaded: boolean
  mode: TicketMode
  side: 'buy' | 'sell'
  symbol: string
  qty: number | null
  /** Limit or stop price. Ignored for market, short and cover. */
  price: number | null
  /** Shares held long (0 if none or short). */
  held: number
  /** Shares owed on a short (0 if none or long). */
  shortQty: number
  /** Cash minus whatever open limit buys have set aside. */
  freeCash: number | null
  quote: Quote | null
  estimate: OrderQuote | null
  estimateError: string | null
}

export interface TicketCheck {
  /** Why confirm is disabled, in plain words. Null means the order can go. */
  blocker: string | null
  /** Worth knowing, but not a reason to stop. */
  note: string | null
}

const QTY_HELP = 'Enter a whole number of shares, from 1 to 10,000.'

/** Every rule the ticket enforces before it lets you press confirm. */
export function checkTicket(t: TicketInput): TicketCheck {
  const { mode, side, symbol, qty, price, held, shortQty, quote, estimate: est } = t
  const free = t.freeCash ?? 0
  const block = (blocker: string): TicketCheck => ({ blocker, note: null })

  if (!t.signedIn) return block('Join the game to trade.')
  if (!t.accountLoaded) return block('Loading your account…')
  if (qty === null) return block(QTY_HELP)

  // --- Orders that wait for a price ---
  if (mode === 'limit' || mode === 'stop') {
    if (price === null) return block('Enter a price above zero, with at most 2 decimal places.')

    if (mode === 'stop') {
      if (held === 0) return block(`A stop-loss protects shares you hold, and you don't hold any ${symbol}.`)
      if (qty > held) return block(`You hold ${formatQty(held)} ${symbol}: a stop-loss can't cover ${formatQty(qty)}.`)
      if (quote !== null && quote.bid !== null && price >= quote.bid)
        return block(`Set the stop below the current bid (${formatPrice(quote.bid)}). At or above it, it would sell straight away.`)
      return { blocker: null, note: 'If the price drops fast, it can sell for less than your stop.' }
    }

    if (side === 'buy') {
      if (shortQty > 0) return block(`You are short ${symbol}. Cover the short before buying.`)
      const needed = qty * price * (1 + FEE_RATE)
      if (needed > free)
        return block(`Not enough cash: this order sets aside ${formatHOOP(needed)} HOOP and you have ${formatHOOP(free)} free.`)
      if (quote !== null && quote.ask !== null && price >= quote.ask)
        return { blocker: null, note: `Your limit is at or above the ask (${formatPrice(quote.ask)}), so this fills straight away.` }
      return { blocker: null, note: null }
    }

    if (held === 0) return block(`You don't hold any ${symbol} to sell.`)
    if (qty > held) return block(`You hold ${formatQty(held)} ${symbol}: you can't sell ${formatQty(qty)}.`)
    if (quote !== null && quote.bid !== null && price <= quote.bid)
      return { blocker: null, note: `Your limit is at or below the bid (${formatPrice(quote.bid)}), so this fills straight away.` }
    return { blocker: null, note: null }
  }

  // --- Orders that fill now ---
  const closing = mode === 'cover' || (mode === 'market' && side === 'sell')

  if (mode === 'market' && side === 'sell') {
    if (held === 0) return block(`You don't hold any ${symbol} to sell.`)
    if (qty > held) return block(`You hold ${formatQty(held)} ${symbol}: you can't sell ${formatQty(qty)}.`)
    if (quote !== null && quote.bid === null) return block('Nobody is bidding right now. Try again in a moment.')
  }
  if (mode === 'market' && side === 'buy' && shortQty > 0)
    return block(`You are short ${formatQty(shortQty)} ${symbol}. Use Cover to close the short before buying.`)
  if (mode === 'short' && held > 0)
    return block(`You hold ${formatQty(held)} ${symbol}. Sell them before going short.`)
  if (mode === 'cover') {
    if (shortQty === 0) return block(`You are not short ${symbol}, so there is nothing to cover.`)
    if (qty > shortQty) return block(`You are short ${formatQty(shortQty)} ${symbol}: you can't cover ${formatQty(qty)}.`)
  }

  if (t.estimateError !== null) return block(t.estimateError)
  if (est === null) return { blocker: null, note: null }

  if (!closing && est.cash_short) {
    return block(est.fillable_qty > 0
      ? `Not enough cash for ${formatQty(qty)} shares. You can afford about ${formatQty(est.fillable_qty)}.`
      : `Not enough cash: you have ${formatHOOP(free)} HOOP free.`)
  }
  if (est.fillable_qty === 0) {
    return block(mode === 'short' || (mode === 'market' && side === 'sell')
      ? 'Nobody is bidding right now. Try again in a moment.'
      : 'No shares for sale right now: the market makers are sold out.')
  }
  if (est.makers_short) {
    return { blocker: null, note: `Only ${formatQty(est.fillable_qty)} shares are for sale right now. The rest of your order will not fill.` }
  }
  return { blocker: null, note: null }
}
