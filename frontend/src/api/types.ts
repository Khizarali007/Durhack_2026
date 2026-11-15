// Mirrors Python backend shapes exactly. Comments indicate the source file.
// Anything under a "PLANNED" banner is a guessed shape: see docs/api-assumptions.md.

// --- From router.py (origin/person2branch) ---

export type OrderSide = 'buy' | 'sell' | 'short' | 'cover'
export type FillReason = 'market' | 'limit' | 'stop' | 'liquidation'

export interface SessionOut { token: string; user_id: string; cash: number }
export interface MeOut { user_id: string; username: string | null; is_guest: boolean; cash: number }
export interface OrderIn { symbol: string; side: 'buy' | 'sell'; qty: number }
export interface FillOut {
  trade_id: string; qty: number; price: number; fee: number
  t: number; counterparty: string
}
export interface OrderOut {
  order_id: string; status: 'filled' | 'partially_filled'
  // 'short' and 'cover' only ever come back from the PLANNED placeMarginOrder
  symbol: string; side: OrderSide
  requested_qty: number; filled_qty: number; average_price: number
  total_fee: number; cash: number; position_qty: number
  fills: FillOut[]; reason: string | null
}
export interface PositionOut {
  symbol: string; name: string | null; team: string | null; qty: number
  mark_price?: number
  avg_cost: number; last_price: number; market_value: number
  unrealised_pnl: number; unrealised_pnl_pct: number; weight_pct: number
  // PLANNED (short/leverage): optional so the built endpoint still type-checks
  side?: 'long' | 'short'
  leverage?: number
  margin?: number
}
export interface PortfolioOut {
  user_id: string; cash: number; positions_value: number; equity: number
  payouts_received?: number; pending_payouts?: number; available_cash?: number
  starting_cash: number; total_pnl: number; total_pnl_pct: number
  unrealised_pnl: number; realised_pnl: number; fees_paid: number
  positions: PositionOut[]
  // PLANNED (margin status): optional so the built endpoint still type-checks
  margin?: MarginStatus
}

// --- From market_contract.py (origin/person2branch) ---

export interface Player {
  player_id: number; symbol: string; name: string; team: string; start_price: number
  /** Optional: not in the backend contract yet. G / F / C. */
  position?: string
}
export interface MakerQuote { maker_id: string; bid: number | null; ask: number | null; shares: number }
export interface Quote {
  symbol: string; bid: number | null; ask: number | null
  injury_status?: string; injury_reason?: string
  quoted_price?: number | null; last_trade_t?: number | null
  last: number; fair_value: number; makers: MakerQuote[]
}
export interface MarketTick { t: number; quotes: Record<string, Quote> }

// --- From person4-interfaces.md (origin/person4-learning) --- kept for Person 4 compatibility

export interface Tick {
  t: number; symbol: string; price: number
  fair_value: number; best_bid: number; best_ask: number
}

export type MarketEventKind = 'early_warning' | 'injury' | 'hot_streak' | 'rest_day' | 'trade_rumour'
export interface MarketEvent {
  t: number; symbol: string; kind: MarketEventKind
  headline: string; impact: number; storm: number
}

// --- Candles (for lightweight-charts) ---

export type Timeframe = '1m' | '5m' | '1h' | '1d'
export interface CandleData {
  time: number; open: number; high: number; low: number; close: number
  isLive?: boolean
}

// --- ApiError: explicit field declarations (erasableSyntaxOnly bans constructor parameter properties) ---

export class ApiError extends Error {
  readonly status: number
  readonly body: unknown
  constructor(status: number, body: unknown) {
    super(`HTTP ${status}`)
    this.status = status
    this.body = body
  }
}

// --- Final-whistle message ---

export interface FinalWhistleLine { symbol: string; name: string; headline: string; impact: number }
export interface FinalWhistleMessage {
  type: 'final_whistle'; t: number
  lines: FinalWhistleLine[]
}

// ============================================================
// PLANNED: shapes guessed, confirm with Person 2
// ============================================================

/** Market order that may open a short, cover one, or use leverage. */
export interface MarginOrderIn { symbol: string; side: OrderSide; qty: number; leverage?: 1 | 3 }

/** Estimate shown on the ticket before confirm. */
export interface OrderQuote {
  symbol: string; side: OrderSide; qty: number; leverage: number
  /** How many of the requested shares the makers and your cash can cover right now. */
  fillable_qty: number
  /** Best ask for buy/cover, best bid for sell/short. Null when that side of the book is empty. */
  best_price: number | null
  mid: number | null
  est_avg_price: number | null
  notional: number
  /** Cost of crossing from the mid to the best price, in HOOP. */
  spread_cost: number
  /** Extra cost of walking past the best price, in HOOP. */
  slippage: number
  fee: number
  /** Buy/cover: notional + fee. Sell/short: notional - fee. */
  total: number
  /** Cash locked for an opening order: notional / leverage. Zero for sell and cover. */
  margin_required: number
  cash_short: boolean
  makers_short: boolean
}

export interface OpenOrderIn {
  symbol: string; side: 'buy' | 'sell'; qty: number
  type: 'limit' | 'stop'; price: number
}
export interface OpenOrder {
  reserved_cash?: number
  order_id: string; symbol: string; side: 'buy' | 'sell'
  type: 'limit' | 'stop'; qty: number; filled_qty: number; price: number
  status: 'open' | 'filled' | 'cancelled' | 'rejected'
  created_t: number; updated_t: number; reason: string | null
}

export interface Receipt {
  status: 'settling' | 'confirmed' | 'disabled' | 'failed'
  explorer_url: string
  confirm_ms: number | null
}
/** One row per order execution (its 10-share chunks are averaged). */
export interface Trade {
  trade_id: string; order_id: string; symbol: string; side: OrderSide
  qty: number; price: number; fee: number; t: number; reason: FillReason
  realised_pnl: number | null
  receipt: Receipt
}

export interface LeaderboardRow {
  rank: number; username: string; equity: number; return_pct: number
  verified: boolean; is_me: boolean
}

export type MarginState = 'safe' | 'warning' | 'margin_call'
export interface MarginStatus {
  /** Sum of |qty| x price across every position. */
  gross_exposure: number
  /** The part of gross exposure that is leveraged or short. */
  margin_exposure: number
  /** gross exposure / leverage, per position. */
  margin_used: number
  /** Locked margin plus unrealised P&L on leveraged and short positions. */
  margin_equity: number
  /** 30% of margin_exposure. */
  maintenance: number
  /** margin_equity / maintenance. Null when nothing is leveraged or short. */
  level: number | null
  state: MarginState
}

export interface EquityPoint { t: number; equity: number }

export interface OrderUpdateMessage { type: 'order_update'; order: OpenOrder; result: OrderOut | null }
export interface ReceiptMessage { type: 'receipt'; trade: Trade }
export interface MarginCallMessage {
  type: 'margin_call'; t: number; symbol: string; side: 'sell' | 'cover'
  qty: number; price: number; realised_pnl: number; detail: string
}

export interface DirectorResult { ok: boolean; detail: string }

// --- WebSocket discriminated union ---

export type WsMessage =
  | { type: 'market_tick'; t: number; quotes: Record<string, Quote> }
  | FinalWhistleMessage
  | ({ type: 'tick' } & Tick)
  | { type: 'event'; t: number; symbol: string; kind: MarketEventKind; headline: string; impact: number; storm: number }
  | { type: 'mission'; [key: string]: unknown }
  // PLANNED: per-user messages (Person 2's /trading/ws) and a mock-only reset notice
  | OrderUpdateMessage
  | ReceiptMessage
  | MarginCallMessage
  | { type: 'market_reset'; t: number }
