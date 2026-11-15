import type {
  OrderOut, FillOut, PortfolioOut, MeOut, SessionOut, PositionOut, OrderSide, FillReason,
  MarginOrderIn, OrderQuote, OpenOrderIn, OpenOrder, Trade, MarginStatus, EquityPoint, Quote,
} from '../api/types'
import { ApiError } from '../api/types'
import { reservedCash } from '../api/orderMath'
import { mockMarket, FILL_CHUNK } from './mockMarket'
import type { MarketEngine } from './mockMarket'
import { mockError } from './errors'
import { PLAYERS_BY_SYMBOL } from './players'
import { mockBus } from './mockBus'

// The mock ledger: one signed-in account at a time, kept in sessionStorage.
// Market buy/sell mirrors origin/person2branch:backend/trading/orders.py.
// Everything else (open orders, receipts, auth, short/cover, leverage, margin)
// is PLANNED: shapes and rules are guesses, see docs/api-assumptions.md.

const STORAGE_KEY = 'hs-mock-session'
const USERS_KEY = 'hs-mock-users'
const STARTING_CASH = 100_000
const MAINTENANCE_RATE = 0.30
const WARNING_MULTIPLE = 1.5
const RECEIPT_CONFIRM_MS = 600
const MAX_TRADES = 500
const MAX_EQUITY_POINTS = 2000
/** A margin breach must hold for this many ticks, so bid/ask bounce alone never liquidates. */
const BREACH_TICKS_TO_LIQUIDATE = 2
const LIMIT_REACHED = '__limit_reached__'
const SIDES: OrderSide[] = ['buy', 'sell', 'short', 'cover']

interface PositionState {
  /** Signed: negative means short. */
  qty: number
  /** Entry notional, always positive. */
  cost_basis_cents: number
  /** Cash locked against the position: entry notional / leverage. */
  margin_cents: number
}

interface SessionState {
  token: string; user_id: string; username: string | null
  cash_cents: number; starting_cash_cents: number
  positions: Record<string, PositionState>
  realised_cents: number; fees_cents: number
  open_orders: OpenOrder[]
  trades: Trade[]
}

interface StoredUser { username: string; password: string; state: SessionState }

let _idCounter = 0
function makeId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}_${(++_idCounter).toString(36)}`
}

function round2(x: number): number { return Math.round(x * 100) / 100 }

function createDefault(username: string | null): SessionState {
  const stamp = Date.now().toString(36)
  return {
    token: `mock_${stamp}`,
    user_id: username ? `user_${username.toLowerCase()}` : `guest_${stamp}`,
    username,
    cash_cents: STARTING_CASH * 100,
    starting_cash_cents: STARTING_CASH * 100,
    positions: {},
    realised_cents: 0,
    fees_cents: 0,
    open_orders: [],
    trades: [],
  }
}

/** Sessions saved by an older build lack the newer fields. */
function migrate(raw: Partial<SessionState>): SessionState | null {
  if (typeof raw.token !== 'string' || typeof raw.user_id !== 'string') return null
  const positions: Record<string, PositionState> = {}
  for (const [symbol, p] of Object.entries(raw.positions ?? {})) {
    positions[symbol] = {
      qty: p.qty,
      cost_basis_cents: p.cost_basis_cents,
      margin_cents: p.margin_cents ?? p.cost_basis_cents,
    }
  }
  return {
    token: raw.token,
    user_id: raw.user_id,
    username: raw.username ?? null,
    cash_cents: raw.cash_cents ?? STARTING_CASH * 100,
    starting_cash_cents: raw.starting_cash_cents ?? STARTING_CASH * 100,
    positions,
    realised_cents: raw.realised_cents ?? 0,
    fees_cents: raw.fees_cents ?? 0,
    open_orders: (raw.open_orders ?? []).filter(o => o.status === 'open'),
    // A reload loses the confirm timers, so settle anything left pending
    trades: (raw.trades ?? []).map(t => t.receipt.status === 'confirmed'
      ? t
      : { ...t, receipt: { ...t.receipt, status: 'confirmed' as const, confirm_ms: RECEIPT_CONFIRM_MS } }),
  }
}

function loadSession(): SessionState | null {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY)
    if (raw) return migrate(JSON.parse(raw) as Partial<SessionState>)
  } catch { /* ignore */ }
  return null
}

function loadUsers(): Record<string, StoredUser> {
  try {
    const raw = sessionStorage.getItem(USERS_KEY)
    if (raw) return JSON.parse(raw) as Record<string, StoredUser>
  } catch { /* ignore */ }
  return {}
}

let session: SessionState | null = loadSession()
let equityHistory: EquityPoint[] = []
let lastSampleMinute = -1
let breachTicks = 0

function save(): void {
  try {
    if (session === null) {
      sessionStorage.removeItem(STORAGE_KEY)
      return
    }
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(session))
    if (session.username !== null) {
      const users = loadUsers()
      const key = session.username.toLowerCase()
      if (users[key]) {
        users[key].state = session
        sessionStorage.setItem(USERS_KEY, JSON.stringify(users))
      }
    }
  } catch { /* storage full or blocked: the in-memory ledger still works */ }
}

function switchTo(next: SessionState | null): void {
  session = next
  equityHistory = []
  lastSampleMinute = -1
  breachTicks = 0
  save()
}

function requireSession(): SessionState {
  if (session === null) mockError(401, 'not signed in')
  return session
}

function sessionOut(s: SessionState): SessionOut {
  return { token: s.token, user_id: s.user_id, cash: s.cash_cents / 100 }
}

function validQty(qty: unknown): qty is number {
  return typeof qty === 'number' && Number.isInteger(qty) && qty >= 1 && qty <= 10_000
}

function reservedCents(s: SessionState, excludeOrderId?: string): number {
  return Math.round(reservedCash(s.open_orders, excludeOrderId) * 100)
}

function detailOf(err: unknown): string {
  if (err instanceof ApiError && typeof err.body === 'object' && err.body !== null && 'detail' in err.body) {
    return String((err.body as { detail: unknown }).detail)
  }
  return 'could not fill'
}

// --- Walking the book (shared by real fills and the pre-trade estimate) ---

interface WalkOpts {
  /** Cash that may be spent, or null when the order frees cash instead (sell, cover). */
  cashCents: number | null
  leverage: number
  limit: number | null
}

function walk(engine: MarketEngine, dir: 'buy' | 'sell', qty: number, opts: WalkOpts): { fills: FillOut[]; stopReason: string | null } {
  const fills: FillOut[] = []
  let remaining = qty
  let committed = 0
  let stopReason: string | null = null
  const outOfMakers = dir === 'buy' ? 'market makers ran out of shares' : 'market makers ran out of bids'

  while (remaining > 0) {
    const q = engine.getQuote()
    const px = dir === 'buy' ? q.ask : q.bid
    if (px === null) { stopReason = outOfMakers; break }
    if (opts.limit !== null && (dir === 'buy' ? px > opts.limit : px < opts.limit)) {
      stopReason = LIMIT_REACHED
      break
    }

    let chunk = Math.min(remaining, FILL_CHUNK)
    if (opts.cashCents !== null) {
      // Same worst-case guard as orders.py: 2% price cushion, fee, one cent of rounding
      const worstPrice = dir === 'buy' ? px * 1.02 : px
      const worstCostPerShare = worstPrice * (1 / opts.leverage + 0.001) + 0.01
      const available = opts.cashCents / 100 - committed
      chunk = Math.min(chunk, Math.floor(available / worstCostPerShare))
    }
    if (chunk <= 0) { stopReason = 'not enough cash'; break }

    const chunkFills = engine.executeChunk(dir, chunk)
    let got = 0
    for (const f of chunkFills) {
      committed += f.price * f.qty / opts.leverage + f.fee
      fills.push(f)
      got += f.qty
    }
    remaining -= got
    if (got === 0) { stopReason = outOfMakers; break }
  }
  return { fills, stopReason }
}

// --- Receipts ---

function fakeExplorerUrl(tradeId: string): string {
  // Obviously not a real transaction: nothing is sent to Solana from the mock
  return `https://explorer.solana.com/tx/MOCK-NOT-A-REAL-TX-${tradeId}?cluster=devnet`
}

function scheduleReceipt(trade: Trade): void {
  mockBus.emit({ type: 'receipt', trade: { ...trade, receipt: { ...trade.receipt } } })
  const started = Date.now()
  setTimeout(() => {
    const confirmed: Trade = {
      ...trade,
      receipt: { ...trade.receipt, status: 'confirmed', confirm_ms: Date.now() - started },
    }
    const stored = session?.trades.find(t => t.trade_id === trade.trade_id)
    if (stored) {
      stored.receipt = confirmed.receipt
      save()
    }
    mockBus.emit({ type: 'receipt', trade: confirmed })
  }, RECEIPT_CONFIRM_MS)
}

// --- Executing against the ledger ---

interface ExecInput { symbol: string; side: OrderSide; qty: number; leverage: number }

/**
 * Fills an order against the live book and books it. Throws ApiError for a
 * rule violation. Returns `out: null` when nothing could fill.
 */
function execute(
  s: SessionState, input: ExecInput, reason: FillReason,
  limit: number | null, ownOrderId?: string,
): { out: OrderOut | null; stopReason: string | null; trade: Trade | null } {
  const { symbol, side, qty, leverage } = input
  const engine = mockMarket.engine(symbol)  // throws 404 if unknown
  const pos = s.positions[symbol]
  const held = pos?.qty ?? 0

  if (side === 'buy' && held < 0)
    mockError(400, `you are short ${-held} ${symbol}: cover the short before buying`)
  if (side === 'sell' && (held <= 0 || qty > held))
    mockError(400, `you hold ${Math.max(0, held)} ${symbol}, cannot sell ${qty}`)
  if (side === 'short' && held > 0)
    mockError(400, `you hold ${held} ${symbol}: sell them before going short`)
  if (side === 'cover' && (held >= 0 || qty > -held))
    mockError(400, `you are short ${Math.max(0, -held)} ${symbol}, cannot cover ${qty}`)

  const dir = side === 'buy' || side === 'cover' ? 'buy' : 'sell'
  const opening = side === 'buy' || side === 'short'
  const available = s.cash_cents - reservedCents(s, ownOrderId)
  const { fills, stopReason } = walk(engine, dir, qty, {
    cashCents: opening ? available : null,
    leverage: opening ? leverage : 1,
    limit,
  })
  if (fills.length === 0) return { out: null, stopReason, trade: null }

  const filled_qty = fills.reduce((sum, f) => sum + f.qty, 0)
  const notional_cents = fills.reduce((sum, f) => sum + Math.round(f.price * f.qty * 100), 0)
  const fee_cents = fills.reduce((sum, f) => sum + Math.round(f.fee * 100), 0)
  const avg_price = notional_cents / filled_qty / 100
  let realised_cents: number | null = null

  if (opening) {
    const margin_cents = Math.round(notional_cents / leverage)
    s.cash_cents -= margin_cents + fee_cents
    const p = pos ?? { qty: 0, cost_basis_cents: 0, margin_cents: 0 }
    p.cost_basis_cents += notional_cents
    p.margin_cents += margin_cents
    p.qty += side === 'buy' ? filled_qty : -filled_qty
    s.positions[symbol] = p
  } else {
    const p = pos!
    const absQty = Math.abs(p.qty)
    const removed_cost = Math.round(p.cost_basis_cents * filled_qty / absQty)
    const released_margin = Math.round(p.margin_cents * filled_qty / absQty)
    realised_cents = side === 'sell' ? notional_cents - removed_cost : removed_cost - notional_cents
    s.cash_cents += released_margin + realised_cents - fee_cents
    s.realised_cents += realised_cents
    if (absQty === filled_qty) {
      delete s.positions[symbol]
    } else {
      p.cost_basis_cents -= removed_cost
      p.margin_cents -= released_margin
      p.qty += side === 'sell' ? -filled_qty : filled_qty
    }
  }
  s.fees_cents += fee_cents

  const order_id = ownOrderId ?? makeId('ord')
  const trade: Trade = {
    trade_id: makeId('tr'), order_id, symbol, side,
    qty: filled_qty, price: avg_price, fee: fee_cents / 100,
    t: mockMarket.getMarketTime(), reason,
    realised_pnl: realised_cents === null ? null : realised_cents / 100,
    receipt: { status: 'settling', explorer_url: '', confirm_ms: null },
  }
  trade.receipt.explorer_url = fakeExplorerUrl(trade.trade_id)
  s.trades.unshift(trade)
  if (s.trades.length > MAX_TRADES) s.trades.length = MAX_TRADES
  scheduleReceipt(trade)

  const out: OrderOut = {
    order_id,
    status: filled_qty < qty ? 'partially_filled' : 'filled',
    symbol, side,
    requested_qty: qty,
    filled_qty,
    average_price: avg_price,
    total_fee: fee_cents / 100,
    cash: s.cash_cents / 100,
    position_qty: s.positions[symbol]?.qty ?? 0,
    fills,
    reason: filled_qty < qty && stopReason !== LIMIT_REACHED ? stopReason : null,
  }
  return { out, stopReason, trade }
}

// --- Margin (PLANNED rules, mock only) ---

function markPrice(q: Quote): number {
  return q.bid !== null && q.ask !== null ? (q.bid + q.ask) / 2 : q.last
}

function isMarginPosition(p: PositionState): boolean {
  return p.qty < 0 || p.margin_cents < p.cost_basis_cents * 0.999
}

function marginStatus(s: SessionState): MarginStatus {
  let gross = 0
  let marginExposure = 0
  let marginUsed = 0
  let marginEquity = 0

  for (const [symbol, p] of Object.entries(s.positions)) {
    if (!mockMarket.hasSymbol(symbol)) continue
    const exposure = Math.abs(p.qty) * markPrice(mockMarket.getQuote(symbol))
    const cost = p.cost_basis_cents / 100
    const margin = p.margin_cents / 100
    gross += exposure
    marginUsed += margin > 0 ? exposure * (margin / cost) : exposure
    if (isMarginPosition(p)) {
      marginExposure += exposure
      marginEquity += margin + (p.qty > 0 ? exposure - cost : cost - exposure)
    }
  }

  const maintenance = MAINTENANCE_RATE * marginExposure
  const level = maintenance > 0 ? marginEquity / maintenance : null
  const state = level === null ? 'safe'
    : level < 1 ? 'margin_call'
    : level < WARNING_MULTIPLE ? 'warning'
    : 'safe'
  return {
    gross_exposure: round2(gross),
    margin_exposure: round2(marginExposure),
    margin_used: round2(marginUsed),
    margin_equity: round2(marginEquity),
    maintenance: round2(maintenance),
    level: level === null ? null : Math.round(level * 1000) / 1000,
    state,
  }
}

/** Closes the largest leveraged or short position at market. */
function liquidate(s: SessionState, t: number): boolean {
  let worst: { symbol: string; p: PositionState; exposure: number } | null = null
  for (const [symbol, p] of Object.entries(s.positions)) {
    if (!isMarginPosition(p) || !mockMarket.hasSymbol(symbol)) continue
    const exposure = Math.abs(p.qty) * markPrice(mockMarket.getQuote(symbol))
    if (worst === null || exposure > worst.exposure) worst = { symbol, p, exposure }
  }
  if (worst === null) return false

  const side = worst.p.qty > 0 ? 'sell' : 'cover'
  const qty = Math.abs(worst.p.qty)
  const leverage = Math.round(worst.p.cost_basis_cents / Math.max(1, worst.p.margin_cents))
  const kind = worst.p.qty > 0 ? `${leverage}x long` : 'short'
  let result: ReturnType<typeof execute>
  try {
    result = execute(s, { symbol: worst.symbol, side, qty, leverage: 1 }, 'liquidation', null)
  } catch { return false }
  if (result.out === null || result.trade === null) return false

  mockBus.emit({
    type: 'margin_call', t, symbol: worst.symbol, side,
    qty: result.out.filled_qty, price: result.out.average_price,
    realised_pnl: result.trade.realised_pnl ?? 0,
    detail: `Margin call: your ${kind} position in ${worst.symbol} was closed automatically`,
  })
  return true
}

// --- Open orders (limit and stop-loss) ---

function emitOrder(o: OpenOrder, result: OrderOut | null): void {
  mockBus.emit({ type: 'order_update', order: { ...o }, result })
}

function closeOrder(o: OpenOrder, status: 'filled' | 'cancelled' | 'rejected', reason: string | null, t: number): true {
  o.status = status
  o.reason = reason
  o.updated_t = t
  emitOrder(o, null)
  return true
}

function fillOpenOrder(
  s: SessionState, o: OpenOrder, qty: number,
  reason: 'limit' | 'stop', limit: number | null, t: number,
): boolean {
  let result: ReturnType<typeof execute>
  try {
    result = execute(s, { symbol: o.symbol, side: o.side, qty, leverage: 1 }, reason, limit, o.order_id)
  } catch (err) {
    return closeOrder(o, 'rejected', detailOf(err), t)
  }
  if (result.out === null) {
    if (result.stopReason === 'not enough cash')
      return closeOrder(o, 'rejected', 'not enough cash when the price was reached', t)
    return false  // the price moved away again: keep waiting
  }

  o.filled_qty += result.out.filled_qty
  o.updated_t = t
  const stillHeld = Math.max(0, s.positions[o.symbol]?.qty ?? 0)
  if (reason === 'stop') {
    o.status = 'filled'
    o.reason = 'stop price reached: sold at market'
  } else if (o.filled_qty >= o.qty) {
    o.status = 'filled'
  } else if (o.side === 'sell' && stillHeld === 0) {
    o.status = 'filled'
    o.reason = 'sold every share you still held'
  }
  emitOrder(o, result.out)
  return true
}

/** Limit buy fills when ask <= limit, limit sell when bid >= limit, stop sell fires when bid <= stop. */
function evaluateOrder(s: SessionState, o: OpenOrder, t: number): boolean {
  if (o.status !== 'open' || !mockMarket.hasSymbol(o.symbol)) return false
  const q = mockMarket.getQuote(o.symbol)
  const remaining = o.qty - o.filled_qty

  if (o.type === 'limit' && o.side === 'buy') {
    if (q.ask === null || q.ask > o.price) return false
    return fillOpenOrder(s, o, remaining, 'limit', o.price, t)
  }

  const held = Math.max(0, s.positions[o.symbol]?.qty ?? 0)
  if (o.type === 'limit') {
    if (q.bid === null || q.bid < o.price) return false
    if (held === 0) return closeOrder(o, 'rejected', 'you no longer hold these shares', t)
    return fillOpenOrder(s, o, Math.min(remaining, held), 'limit', o.price, t)
  }

  if (q.bid === null || q.bid > o.price) return false
  if (held === 0) return closeOrder(o, 'rejected', 'you no longer hold these shares', t)
  return fillOpenOrder(s, o, Math.min(remaining, held), 'stop', null, t)
}

function computeEquity(s: SessionState): number {
  let total = s.cash_cents / 100
  for (const [symbol, p] of Object.entries(s.positions)) {
    const cost = p.cost_basis_cents / 100
    const last = mockMarket.hasSymbol(symbol) ? mockMarket.getQuote(symbol).last : cost / Math.abs(p.qty)
    const value = Math.abs(p.qty) * last
    total += p.margin_cents / 100 + (p.qty > 0 ? value - cost : cost - value)
  }
  return total
}

function validateCredentials(username: unknown, password: unknown): void {
  if (typeof username !== 'string' || !/^[A-Za-z0-9_]{3,16}$/.test(username))
    mockError(422, 'username must be 3 to 16 letters, numbers or underscores')
  if (typeof password !== 'string' || password.length < 6)
    mockError(422, 'password must be at least 6 characters')
}

export const mockSession = {
  // --- Built by Person 2 (shapes confirmed) ---

  createSession(): SessionOut {
    const s = createDefault(null)
    switchTo(s)
    return sessionOut(s)
  },

  getMe(): MeOut {
    const s = requireSession()
    return { user_id: s.user_id, username: s.username, is_guest: s.username === null, cash: s.cash_cents / 100 }
  },

  /** Market order. `short`, `cover` and `leverage` are PLANNED extensions. */
  placeOrder(input: MarginOrderIn): OrderOut {
    const s = requireSession()
    if (!input.symbol || !SIDES.includes(input.side))
      mockError(422, 'invalid input')
    if (!validQty(input.qty))
      mockError(422, 'quantity must be a whole number between 1 and 10,000')
    const leverage = input.leverage ?? 1
    if (leverage !== 1 && leverage !== 3)
      mockError(422, 'leverage must be 1x or 3x')

    const { out, stopReason } = execute(s, { symbol: input.symbol, side: input.side, qty: input.qty, leverage }, 'market', null)
    if (out === null)
      mockError(stopReason === 'not enough cash' ? 400 : 409, stopReason ?? 'could not fill')
    save()
    return out
  },

  getPortfolio(): PortfolioOut {
    const s = requireSession()
    const cash = s.cash_cents / 100
    let positions_value = 0
    let unrealised_pnl = 0
    const positions: PositionOut[] = []

    for (const [symbol, pos] of Object.entries(s.positions)) {
      const absQty = Math.abs(pos.qty)
      const cost = pos.cost_basis_cents / 100
      const margin = pos.margin_cents / 100
      const last_price = mockMarket.hasSymbol(symbol) ? mockMarket.getQuote(symbol).last : cost / absQty
      const value = absQty * last_price
      const unrealised = pos.qty > 0 ? value - cost : cost - value
      positions_value += margin + unrealised
      unrealised_pnl += unrealised
      const player = PLAYERS_BY_SYMBOL.get(symbol)

      positions.push({
        symbol, name: player?.name ?? null, team: player?.team ?? null,
        qty: pos.qty, avg_cost: cost / absQty, last_price,
        market_value: pos.qty * last_price,
        unrealised_pnl: unrealised,
        unrealised_pnl_pct: cost > 0 ? unrealised / cost * 100 : 0,
        weight_pct: 0,
        side: pos.qty < 0 ? 'short' : 'long',
        leverage: margin > 0 ? Math.round(cost / margin * 10) / 10 : 1,
        margin,
      })
    }

    const equity = cash + positions_value
    const starting_cash = s.starting_cash_cents / 100
    const total_pnl = equity - starting_cash

    positions.sort((a, b) => Math.abs(b.market_value) - Math.abs(a.market_value))
    for (const p of positions) {
      p.weight_pct = equity > 0 ? Math.abs(p.market_value) / equity * 100 : 0
    }

    return {
      user_id: s.user_id, cash, positions_value, equity,
      starting_cash, total_pnl,
      total_pnl_pct: starting_cash > 0 ? total_pnl / starting_cash * 100 : 0,
      unrealised_pnl, realised_pnl: s.realised_cents / 100, fees_paid: s.fees_cents / 100,
      positions,
      margin: marginStatus(s),
    }
  },

  // --- PLANNED: shapes guessed, confirm with Person 2 ---

  getOrderQuote(symbol: string, side: OrderSide, qty: number, leverage: number): OrderQuote {
    const s = requireSession()
    if (!symbol || !SIDES.includes(side)) mockError(422, 'invalid input')
    if (!validQty(qty)) mockError(422, 'quantity must be a whole number between 1 and 10,000')

    const sim = mockMarket.simulator(symbol)
    const before = sim.getQuote()
    const dir = side === 'buy' || side === 'cover' ? 'buy' : 'sell'
    const opening = side === 'buy' || side === 'short'
    const lev = opening ? leverage : 1
    const best = dir === 'buy' ? before.ask : before.bid
    const mid = before.bid !== null && before.ask !== null ? (before.bid + before.ask) / 2 : null

    const { fills, stopReason } = walk(sim, dir, qty, {
      cashCents: opening ? s.cash_cents - reservedCents(s) : null,
      leverage: lev,
      limit: null,
    })
    const fillable_qty = fills.reduce((sum, f) => sum + f.qty, 0)
    const notional = fills.reduce((sum, f) => sum + f.price * f.qty, 0)
    const fee = fills.reduce((sum, f) => sum + f.fee, 0)
    const avg = fillable_qty > 0 ? notional / fillable_qty : null

    return {
      symbol, side, qty, leverage: lev, fillable_qty,
      best_price: best,
      mid: mid === null ? null : round2(mid),
      est_avg_price: avg,
      notional: round2(notional),
      spread_cost: best !== null && mid !== null ? round2(Math.abs(best - mid) * fillable_qty) : 0,
      slippage: best !== null && avg !== null ? round2(Math.abs(avg - best) * fillable_qty) : 0,
      fee: round2(fee),
      total: round2(dir === 'buy' ? notional + fee : notional - fee),
      margin_required: opening ? round2(notional / lev) : 0,
      cash_short: stopReason === 'not enough cash',
      makers_short: stopReason !== null && stopReason !== 'not enough cash',
    }
  },

  placeOpenOrder(input: OpenOrderIn): OpenOrder {
    const s = requireSession()
    if (!input.symbol || (input.side !== 'buy' && input.side !== 'sell') || (input.type !== 'limit' && input.type !== 'stop'))
      mockError(422, 'invalid input')
    if (!validQty(input.qty))
      mockError(422, 'quantity must be a whole number between 1 and 10,000')
    if (typeof input.price !== 'number' || !Number.isFinite(input.price) || input.price <= 0)
      mockError(422, 'price must be greater than zero')
    if (input.type === 'stop' && input.side === 'buy')
      mockError(422, 'a stop-loss is a sell order: it protects shares you already hold')

    const q = mockMarket.getQuote(input.symbol)  // throws 404 if unknown
    const price = round2(input.price)

    if (input.side === 'buy') {
      const needed = input.qty * price * 1.001
      const free = (s.cash_cents - reservedCents(s)) / 100
      if (needed > free)
        mockError(400, `not enough cash: this order needs ${needed.toFixed(2)} HOOP set aside and you have ${free.toFixed(2)} free`)
    } else {
      const held = Math.max(0, s.positions[input.symbol]?.qty ?? 0)
      if (input.qty > held)
        mockError(400, `you hold ${held} ${input.symbol}, cannot sell ${input.qty}`)
      if (input.type === 'stop' && q.bid !== null && price >= q.bid)
        mockError(422, `stop price must be below the current bid (${q.bid.toFixed(2)}), or it would sell straight away`)
    }

    const t = mockMarket.getMarketTime()
    const order: OpenOrder = {
      order_id: makeId('ord'), symbol: input.symbol, side: input.side, type: input.type,
      qty: input.qty, filled_qty: 0, price, status: 'open',
      created_t: t, updated_t: t, reason: null,
    }
    s.open_orders.unshift(order)
    // A limit that is already marketable fills straight away
    if (order.type === 'limit') evaluateOrder(s, order, t)
    s.open_orders = s.open_orders.filter(o => o.status === 'open')
    save()
    return { ...order }
  },

  getOpenOrders(): OpenOrder[] {
    return requireSession().open_orders.map(o => ({ ...o }))
  },

  cancelOrder(orderId: string): OpenOrder {
    const s = requireSession()
    const order = s.open_orders.find(o => o.order_id === orderId)
    if (!order) mockError(404, 'order not found: it may already have filled or been cancelled')
    closeOrder(order, 'cancelled', null, mockMarket.getMarketTime())
    s.open_orders = s.open_orders.filter(o => o.status === 'open')
    save()
    return { ...order }
  },

  getTrades(): Trade[] {
    return requireSession().trades.map(t => ({ ...t, receipt: { ...t.receipt } }))
  },

  getEquityHistory(): EquityPoint[] {
    requireSession()
    return equityHistory.slice()
  },

  /** Mock users live in sessionStorage. Passwords are stored as typed: this is not real auth. */
  signup(username: string, password: string): SessionOut {
    validateCredentials(username, password)
    const users = loadUsers()
    const key = username.toLowerCase()
    if (users[key]) mockError(409, 'that username is already taken')
    const state = createDefault(username)
    users[key] = { username, password, state }
    sessionStorage.setItem(USERS_KEY, JSON.stringify(users))
    switchTo(state)
    return sessionOut(state)
  },

  login(username: string, password: string): SessionOut {
    if (typeof username !== 'string' || username.trim() === '' || typeof password !== 'string' || password === '')
      mockError(422, 'enter your username and password')
    const user = loadUsers()[username.toLowerCase()]
    if (!user || user.password !== password) mockError(401, 'wrong username or password')
    const state = migrate(user.state)
    if (state === null) mockError(401, 'wrong username or password')
    state.token = `mock_${Date.now().toString(36)}`
    switchTo(state)
    return sessionOut(state)
  },

  logout(): void {
    save()
    session = null
    equityHistory = []
    lastSampleMinute = -1
    breachTicks = 0
    try { sessionStorage.removeItem(STORAGE_KEY) } catch { /* ignore */ }
  },

  // --- Mock plumbing (not part of any contract) ---

  /** Called by the mock WebSocket after every market tick. */
  onTick(t: number): void {
    const s = session
    if (s === null) return
    let changed = false

    for (const o of [...s.open_orders]) {
      if (evaluateOrder(s, o, t)) changed = true
    }
    if (changed) s.open_orders = s.open_orders.filter(o => o.status === 'open')

    if (marginStatus(s).state === 'margin_call') {
      breachTicks++
      if (breachTicks >= BREACH_TICKS_TO_LIQUIDATE && liquidate(s, t)) changed = true
    } else {
      breachTicks = 0
    }

    const minute = Math.floor(t / 60)
    if (minute !== lastSampleMinute) {
      lastSampleMinute = minute
      equityHistory.push({ t: minute * 60, equity: round2(computeEquity(s)) })
      if (equityHistory.length > MAX_EQUITY_POINTS) equityHistory.shift()
    }

    if (changed) save()
  },

  /** Director reset: the clock went back to the start, so equity samples no longer line up. */
  onMarketReset(): void {
    equityHistory = []
    lastSampleMinute = -1
    breachTicks = 0
  },

  /** Director reset: same user, fresh 100,000 HOOP and nothing held. */
  resetAccount(): void {
    if (session === null) return
    const fresh = createDefault(session.username)
    fresh.token = session.token
    fresh.user_id = session.user_id
    switchTo(fresh)
  },

  hasConfirmedTrade(): boolean {
    return session?.trades.some(t => t.receipt.status === 'confirmed') ?? false
  },
}
