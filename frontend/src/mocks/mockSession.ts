import type { OrderIn, OrderOut, FillOut, PortfolioOut, MeOut, SessionOut, PositionOut } from '../api/types'
import { mockMarket } from './mockMarket'
import { mockError } from './errors'
import { PLAYERS_BY_SYMBOL } from './players'

const STORAGE_KEY = 'hs-mock-session'
const STARTING_CASH = 100_000

interface PositionState { qty: number; cost_basis_cents: number }

interface SessionState {
  token: string; user_id: string
  cash_cents: number; starting_cash_cents: number
  positions: Record<string, PositionState>
  realised_cents: number; fees_cents: number
}

let _idCounter = 0
function makeId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}_${(++_idCounter).toString(36)}`
}

function createDefault(): SessionState {
  return {
    token: `mock_${Date.now().toString(36)}`,
    user_id: `user_${Date.now().toString(36)}`,
    cash_cents: STARTING_CASH * 100,
    starting_cash_cents: STARTING_CASH * 100,
    positions: {},
    realised_cents: 0,
    fees_cents: 0,
  }
}

function loadSession(): SessionState {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY)
    if (raw) return JSON.parse(raw) as SessionState
  } catch { /* ignore */ }
  return createDefault()
}

let session = loadSession()

function save(): void {
  sessionStorage.setItem(STORAGE_KEY, JSON.stringify(session))
}

function buildOrderOut(
  order_id: string, input: OrderIn, filled_qty: number,
  avg_price: number, fills: FillOut[], stopReason: string | null,
): OrderOut {
  const pos = session.positions[input.symbol]
  return {
    order_id,
    status: filled_qty < input.qty ? 'partially_filled' : 'filled',
    symbol: input.symbol,
    side: input.side,
    requested_qty: input.qty,
    filled_qty,
    average_price: avg_price,
    total_fee: fills.reduce((s, f) => s + f.fee, 0),
    cash: session.cash_cents / 100,
    position_qty: pos?.qty ?? 0,
    fills,
    reason: stopReason,
  }
}

export const mockSession = {
  createSession(): SessionOut {
    session = createDefault()
    save()
    return { token: session.token, user_id: session.user_id, cash: session.cash_cents / 100 }
  },

  getMe(): MeOut {
    return { user_id: session.user_id, username: null, is_guest: true, cash: session.cash_cents / 100 }
  },

  placeOrder(input: OrderIn): OrderOut {
    if (!input.symbol || !input.side || typeof input.qty !== 'number' || input.qty <= 0 || input.qty > 10_000)
      mockError(422, 'invalid input')

    mockMarket.getQuote(input.symbol)  // throws 404 if unknown

    const order_id = makeId('ord')

    if (input.side === 'buy') {
      let committed = 0
      let remaining = input.qty
      const fills: FillOut[] = []
      let stopReason: string | null = null

      while (remaining > 0) {
        const q = mockMarket.getQuote(input.symbol)
        if (q.ask === null) { stopReason = 'market makers ran out of shares'; break }

        const worstPrice = q.ask * 1.02
        const worstCostPerShare = worstPrice * 1.001 + 0.01
        const available = session.cash_cents / 100 - committed
        const affordable = Math.floor(available / worstCostPerShare)
        const chunk = Math.min(remaining, 10, affordable)

        if (chunk <= 0) { stopReason = 'not enough cash'; break }

        const chunkFills = mockMarket.executeChunk(input.symbol, 'buy', chunk)
        for (const f of chunkFills) {
          committed += f.price * f.qty + f.fee
          fills.push(f)
        }
        const filledChunk = chunkFills.reduce((s, f) => s + f.qty, 0)
        remaining -= filledChunk
        if (filledChunk === 0) { stopReason = 'market makers ran out of shares'; break }
      }

      if (fills.length === 0) {
        mockError(stopReason === 'not enough cash' ? 400 : 409, stopReason ?? 'could not fill')
      }

      const filled_qty = fills.reduce((s, f) => s + f.qty, 0)
      const total_cost_cents = fills.reduce((s, f) => s + Math.round(f.price * f.qty * 100), 0)
      const total_fee_cents = fills.reduce((s, f) => s + Math.round(f.fee * 100), 0)
      const avg_price = total_cost_cents / filled_qty / 100

      session.cash_cents -= total_cost_cents + total_fee_cents
      session.fees_cents += total_fee_cents

      const pos = session.positions[input.symbol] ?? { qty: 0, cost_basis_cents: 0 }
      pos.cost_basis_cents += total_cost_cents
      pos.qty += filled_qty
      session.positions[input.symbol] = pos
      save()

      return buildOrderOut(order_id, input, filled_qty, avg_price, fills, stopReason)
    }

    // sell
    const pos = session.positions[input.symbol]
    const held = pos?.qty ?? 0
    if (input.qty > held) {
      mockError(400, `you hold ${held} ${input.symbol}, cannot sell ${input.qty}`)
    }

    const fills = mockMarket.executeChunk(input.symbol, 'sell', input.qty)
    if (fills.length === 0) mockError(409, 'market makers ran out of bids')

    const filled_qty = fills.reduce((s, f) => s + f.qty, 0)
    const total_proceeds_cents = fills.reduce((s, f) => s + Math.round(f.price * f.qty * 100), 0)
    const total_fee_cents = fills.reduce((s, f) => s + Math.round(f.fee * 100), 0)
    const avg_price = total_proceeds_cents / filled_qty / 100

    const removed_cost = Math.round(pos!.cost_basis_cents * filled_qty / pos!.qty)
    session.realised_cents += total_proceeds_cents - removed_cost
    session.fees_cents += total_fee_cents
    session.cash_cents += total_proceeds_cents - total_fee_cents

    const new_qty = pos!.qty - filled_qty
    if (new_qty === 0) {
      delete session.positions[input.symbol]
    } else {
      pos!.cost_basis_cents -= removed_cost
      pos!.qty = new_qty
    }
    save()

    return buildOrderOut(order_id, input, filled_qty, avg_price, fills, null)
  },

  getPortfolio(): PortfolioOut {
    const cash = session.cash_cents / 100
    let positions_value = 0
    let total_cost_basis = 0
    const positions: PositionOut[] = []

    for (const [symbol, pos] of Object.entries(session.positions)) {
      let last_price: number
      try { last_price = mockMarket.getQuote(symbol).last }
      catch { last_price = pos.cost_basis_cents / pos.qty / 100 }

      const market_value = pos.qty * last_price
      const cost_basis = pos.cost_basis_cents / 100
      positions_value += market_value
      total_cost_basis += cost_basis

      const avg_cost = cost_basis / pos.qty
      const unrealised = market_value - cost_basis
      const unrealised_pct = cost_basis > 0 ? unrealised / cost_basis * 100 : 0
      const player = PLAYERS_BY_SYMBOL.get(symbol)

      positions.push({
        symbol, name: player?.name ?? null, team: player?.team ?? null,
        qty: pos.qty, avg_cost, last_price, market_value,
        unrealised_pnl: unrealised, unrealised_pnl_pct: unrealised_pct, weight_pct: 0,
      })
    }

    const equity = cash + positions_value
    const realised = session.realised_cents / 100
    const fees = session.fees_cents / 100
    const starting_cash = session.starting_cash_cents / 100
    const unrealised_pnl = positions_value - total_cost_basis
    const total_pnl = equity - starting_cash

    positions.sort((a, b) => b.market_value - a.market_value)
    for (const p of positions) {
      p.weight_pct = equity > 0 ? p.market_value / equity * 100 : 0
    }

    return {
      user_id: session.user_id, cash, positions_value, equity,
      starting_cash, total_pnl,
      total_pnl_pct: starting_cash > 0 ? total_pnl / starting_cash * 100 : 0,
      unrealised_pnl, realised_pnl: realised, fees_paid: fees,
      positions,
    }
  },
}
